import {
  SDKConfig,
  NarrativeScript,
  StoryNode,
  NodeDialogue,
  NodeChoice,
  NodeAction,
  NodeGoto,
  NodePuzzle,
  Action,
  CharacterRegistration,
  DialogueLine,
  ChoiceOption,
  Snapshot,
  StoryTreeNode,
  NarrativeEvent,
  EventHandler,
  PuzzleHandler,
  PuzzleResult,
  AchievementState,
  PlayerChoiceRecord,
  Condition,
  ConditionGroup,
  LoadResult,
  ValidationIssue,
  ValidationPathStep,
  MigrationFn,
  DebugSession,
  DebugSessionRecord,
} from './types';
import { ScriptParser } from './ScriptParser';
import { ChapterManager } from './ChapterManager';
import { DialoguePlayer } from './DialoguePlayer';
import { ChoiceBranch } from './ChoiceBranch';
import { VariableCondition } from './VariableCondition';
import { Inventory } from './Inventory';
import { QuestSystem } from './QuestSystem';
import { SaveLoad } from './SaveLoad';

type State = 'idle' | 'running' | 'waiting_choice' | 'waiting_puzzle' | 'ended';

export class NarrativeSDK {
  private config: SDKConfig;
  private parser!: ScriptParser;
  private chapterManager!: ChapterManager;
  private dialoguePlayer!: DialoguePlayer;
  private choiceBranch!: ChoiceBranch;
  private variableCondition!: VariableCondition;
  private inventory!: Inventory;
  private questSystem!: QuestSystem;
  private saveLoad!: SaveLoad;

  private state: State = 'idle';
  private currentNodeId: string = '';
  private locale: string;
  private debug: boolean;
  private debugLog: Array<{ timestamp: number; level: string; message: string; data?: unknown }> = [];
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private puzzleHandlers: Map<string, PuzzleHandler> = new Map();
  private pendingPuzzleNodeId: string | null = null;
  private puzzleResolveCallback: ((result: PuzzleResult) => void) | null = null;
  private migrations: Map<string, MigrationFn> = new Map();
  private sessionRecords: DebugSessionRecord[] = [];
  private sessionStartedAt: number = 0;

  constructor(config: SDKConfig) {
    this.config = config;
    this.locale = config.locale || config.script.meta.language || 'zh-CN';
    this.debug = config.debug ?? false;

    this.initModules(config.script);

    if (config.onEvent) {
      this.on('*', config.onEvent);
    }
  }

  private initModules(script: NarrativeScript): void {
    this.parser = new ScriptParser(script);
    this.chapterManager = new ChapterManager(this.parser);
    const moduleEventHandler: EventHandler = (event: NarrativeEvent) => {
      this.emit(event.type, event.data);
    };
    this.variableCondition = new VariableCondition(moduleEventHandler);
    this.choiceBranch = new ChoiceBranch(moduleEventHandler);
    this.choiceBranch.setVariables(this.variableCondition['store'] as Map<string, string | number | boolean>);
    this.choiceBranch.setLocalizeFn((text: string) => this.localizeText(text));
    this.inventory = new Inventory(this.parser, moduleEventHandler);
    this.questSystem = new QuestSystem(this.parser, moduleEventHandler);
    this.dialoguePlayer = new DialoguePlayer(this.parser, this.chapterManager, moduleEventHandler);
    this.dialoguePlayer.setLocalizeFn((text: string) => this.localizeText(text));
    this.saveLoad = new SaveLoad(
      this.variableCondition,
      this.inventory,
      this.questSystem,
      this.dialoguePlayer,
      this.choiceBranch,
      this.chapterManager,
      script.meta.saveVersion,
      (snapshot) => this.validateSnapshotAgainstScript(snapshot)
    );
  }

  private emit(type: NarrativeEvent['type'] | string, data: unknown): void {
    const event: NarrativeEvent = { type: type as NarrativeEvent['type'], data };
    const handlers = this.eventHandlers.get('*') || [];
    const typeHandlers = this.eventHandlers.get(type as string) || [];
    for (const h of [...handlers, ...typeHandlers]) {
      try { h(event); } catch { }
    }
    if (this.debug) {
      this.debugLog.push({ timestamp: Date.now(), level: 'event', message: String(type), data });
    }
    this.trackSessionEvent(type as string, data);
  }

  private currentStateSnapshot(): DebugSessionRecord['stateSnapshot'] | undefined {
    return this.state !== 'idle' ? {
      nodeId: this.currentNodeId,
      chapterId: this.chapterManager.getCurrentChapterId(),
      variables: { ...this.variableCondition.getAll() },
      inventoryCount: this.inventory.getAllEntries().length,
      activeQuestCount: this.questSystem.getActiveQuests().length,
    } : undefined;
  }

  private pushSessionRecord(record: Omit<DebugSessionRecord, 'timestamp' | 'stateSnapshot'> & { stateSnapshot?: DebugSessionRecord['stateSnapshot'] }): void {
    const snap = record.stateSnapshot !== undefined ? record.stateSnapshot : this.currentStateSnapshot();
    this.sessionRecords.push({
      ...record,
      timestamp: Date.now(),
      stateSnapshot: snap,
    });
  }

  private trackSessionEvent(type: string, data: unknown): void {
    switch (type) {
      case 'puzzleResolved': {
        const pr = data as { puzzleId: string; result: PuzzleResult; nextNodeId: string | null };
        this.pushSessionRecord({
          type: 'puzzle_result',
          data: { puzzleId: pr.puzzleId, result: pr.result, nextNodeId: pr.nextNodeId },
        });
        break;
      }
      case 'chapterChange': {
        const cc = data as { chapterId: string };
        this.pushSessionRecord({ type: 'chapter_change', data: { chapterId: cc.chapterId } });
        break;
      }
      case 'ending': {
        const ed = data as { endingId: string; name: string };
        this.pushSessionRecord({ type: 'ending', data: { endingId: ed.endingId, name: ed.name } });
        break;
      }
      case 'itemAdd': {
        const ia = data as { itemId: string; count: number };
        this.pushSessionRecord({
          type: 'step',
          data: { event: 'itemAdd', itemId: ia.itemId, count: ia.count, desc: `获得物品 ${ia.itemId} x${ia.count}` },
        });
        break;
      }
      case 'itemRemove': {
        const ir = data as { itemId: string; count: number };
        this.pushSessionRecord({
          type: 'step',
          data: { event: 'itemRemove', itemId: ir.itemId, count: ir.count, desc: `失去物品 ${ir.itemId} x${ir.count}` },
        });
        break;
      }
      case 'questStart': {
        const qs = data as { questId: string };
        this.pushSessionRecord({
          type: 'step',
          data: { event: 'questStart', questId: qs.questId, desc: `开始任务 ${qs.questId}` },
        });
        break;
      }
      case 'questComplete': {
        const qc = data as { questId: string };
        this.pushSessionRecord({
          type: 'step',
          data: { event: 'questComplete', questId: qc.questId, desc: `完成任务 ${qc.questId}` },
        });
        break;
      }
      case 'questFail': {
        const qf = data as { questId: string };
        this.pushSessionRecord({
          type: 'step',
          data: { event: 'questFail', questId: qf.questId, desc: `任务失败 ${qf.questId}` },
        });
        break;
      }
      case 'objectiveComplete': {
        const oc = data as { questId: string; objectiveIndex: number };
        this.pushSessionRecord({
          type: 'step',
          data: { event: 'objectiveComplete', questId: oc.questId, objectiveIndex: oc.objectiveIndex, desc: `完成任务目标 ${oc.questId}#${oc.objectiveIndex}` },
        });
        break;
      }
      case 'variableChange': {
        const vc = data as { key: string; oldValue: unknown; newValue: unknown };
        this.pushSessionRecord({
          type: 'step',
          data: { event: 'variableChange', key: vc.key, oldValue: vc.oldValue, newValue: vc.newValue, desc: `变量 ${vc.key}: ${JSON.stringify(vc.oldValue)} → ${JSON.stringify(vc.newValue)}` },
        });
        break;
      }
      case 'puzzle': {
        const pz = data as { puzzleId: string; params?: Record<string, unknown> };
        this.pushSessionRecord({
          type: 'step',
          data: { event: 'enterPuzzle', puzzleId: pz.puzzleId, params: pz.params, desc: `进入谜题节点：${pz.puzzleId}` },
        });
        break;
      }
      case 'choice': {
        // NOTE: 'choice' 事件是"展示选项"，不计入玩家选择记录，记为 step 说明进入了选择节点
        const ch = data as { nodeId: string; options: Array<{ index: number; text: string; disabled: boolean }> };
        this.pushSessionRecord({
          type: 'step',
          data: {
            event: 'enterChoice',
            nodeId: ch.nodeId,
            optionCount: ch.options?.length ?? 0,
            desc: `进入选择节点：${ch.nodeId}（${ch.options?.length ?? 0} 个选项）`,
          },
        });
        break;
      }
      case 'choiceExpired': {
        const ce = data as { nodeId: string; defaultIndex: number };
        this.pushSessionRecord({
          type: 'step',
          data: { event: 'choiceExpired', nodeId: ce.nodeId, defaultIndex: ce.defaultIndex, desc: `选择超时，使用默认选项 #${ce.defaultIndex}` },
        });
        break;
      }
      case 'achievement': {
        const ac = data as AchievementState;
        this.pushSessionRecord({
          type: 'achievement',
          data: {
            id: ac.id,
            name: ac.name,
            description: ac.description,
            unlockedAt: ac.unlockedAt,
            desc: `解锁成就：${ac.name}`,
          },
        });
        break;
      }
    }
  }

  private logDebug(message: string, data?: unknown): void {
    if (this.debug) {
      this.debugLog.push({ timestamp: Date.now(), level: 'debug', message, data });
    }
  }

  private logError(message: string, data?: unknown): void {
    this.debugLog.push({ timestamp: Date.now(), level: 'error', message, data });
  }

  on(eventType: string, handler: EventHandler): void {
    const list = this.eventHandlers.get(eventType) || [];
    list.push(handler);
    this.eventHandlers.set(eventType, list);
  }

  off(eventType: string, handler: EventHandler): void {
    const list = this.eventHandlers.get(eventType);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  registerCharacter(characterId: string, registration: CharacterRegistration): void {
    this.dialoguePlayer.registerCharacter(characterId, registration);
    this.logDebug(`Character registered: ${characterId}`);
  }

  unregisterCharacter(characterId: string): void {
    this.dialoguePlayer.unregisterCharacter(characterId);
  }

  start(startChapterId?: string, startNodeId?: string): DialogueLine | null {
    const validation = this.parser.validate();
    if (!validation.valid) {
      this.logError('Script validation failed', validation.errors);
      this.emit('error', { message: 'Script validation failed', errors: validation.errors });
      return null;
    }

    if (startChapterId) {
      this.chapterManager.goToChapter(startChapterId);
    }

    const chapter = this.chapterManager.getCurrentChapter();
    if (!chapter) {
      this.logError('No current chapter');
      return null;
    }

    const startNode = startNodeId
      ? this.parser.getNode(startNodeId)
      : chapter.nodes[0];

    if (!startNode) {
      this.logError('Start node not found');
      return null;
    }

    this.state = 'running';
    this.currentNodeId = startNode.id;
    this.saveLoad.markNodeVisited(startNode.id);
    this.sessionStartedAt = Date.now();
    this.sessionRecords = [];

    this.logDebug('SDK started', { chapterId: this.chapterManager.getCurrentChapterId(), nodeId: startNode.id });

    return this.processNode(startNode);
  }

  private processNode(node: StoryNode): DialogueLine | null {
    this.saveLoad.markNodeVisited(node.id);
    this.currentNodeId = node.id;

    switch (node.type) {
      case 'dialogue':
        return this.processDialogue(node);
      case 'choice':
        return this.processChoice(node);
      case 'action':
        return this.processAction(node);
      case 'goto':
        return this.processGoto(node);
      case 'ending':
        return this.processEnding(node);
      case 'puzzle':
        return this.processPuzzle(node);
      default:
        this.logError(`Unknown node type: ${(node as StoryNode).type}`);
        return null;
    }
  }

  private processDialogue(node: NodeDialogue): DialogueLine | null {
    const line = this.dialoguePlayer.playNode(node);
    if (node.actions) {
      this.executeActions(node.actions);
    }
    this.pushSessionRecord({
      type: 'step',
      data: { event: 'dialogue', nodeId: node.id, speaker: node.speaker, desc: `对白 ${node.speaker}: ${node.text.slice(0, 30)}${node.text.length > 30 ? '...' : ''}` },
    });
    this.logDebug('Dialogue played', { nodeId: node.id, speaker: node.speaker });
    return line;
  }

  private processChoice(node: NodeChoice): DialogueLine | null {
    this.state = 'waiting_choice';
    const available = this.choiceBranch.getAvailableOptions(node);

    if (node.timelimit && node.timelimit > 0) {
      const defaultIdx = node.defaultOption ?? 0;
      this.choiceBranch.startTimer(node.timelimit, defaultIdx, (idx) => {
        this.makeChoice(node.id, idx, true);
      });
    }

    this.logDebug('Choice presented', { nodeId: node.id, optionCount: available.length });

    this.emit('choice', {
      nodeId: node.id,
      text: this.localizeText(node.text || ''),
      options: available.map((o) => ({
        text: this.localizeText(o.text),
        disabled: o.disabled,
        disabledText: o.disabledText ? this.localizeText(o.disabledText) : undefined,
        index: o.index,
      })),
      timelimit: node.timelimit,
    });

    return null;
  }

  private processAction(node: NodeAction): DialogueLine | null {
    this.executeActions(node.actions);
    this.logDebug('Actions executed', { nodeId: node.id });

    if (node.next) {
      const nextNode = this.parser.getNode(node.next);
      if (nextNode) return this.processNode(nextNode);
    }
    return null;
  }

  private processGoto(node: NodeGoto): DialogueLine | null {
    if (node.chapter) {
      this.chapterManager.goToChapter(node.chapter);
      this.emit('chapterChange', { chapterId: node.chapter });
    }
    const targetNode = this.parser.getNode(node.node);
    if (targetNode) return this.processNode(targetNode);

    const chapter = this.chapterManager.getCurrentChapter();
    if (chapter) {
      const first = chapter.nodes[0];
      if (first) return this.processNode(first);
    }
    this.logError(`Goto target not found: ${node.node}`);
    return null;
  }

  private processEnding(node: { id: string; type: 'ending'; endingId: string; text?: string }): DialogueLine | null {
    this.state = 'ended';
    const ending = this.parser.getEnding(node.endingId);

    this.emit('ending', {
      endingId: node.endingId,
      name: this.localizeText(ending?.name || node.endingId),
      text: node.text ? this.localizeText(node.text) : undefined,
    });

    this.logDebug('Ending reached', { endingId: node.endingId });
    return null;
  }

  private processPuzzle(node: NodePuzzle): DialogueLine | null {
    this.state = 'waiting_puzzle';
    this.pendingPuzzleNodeId = node.id;

    this.emit('puzzle', {
      nodeId: node.id,
      puzzleId: node.puzzleId,
      params: node.params,
    });

    const handler = this.puzzleHandlers.get(node.puzzleId);
    if (handler) {
      this.invokePuzzleHandler(handler, node);
    }

    this.logDebug('Puzzle presented', { nodeId: node.id, puzzleId: node.puzzleId });
    return null;
  }

  private async invokePuzzleHandler(handler: PuzzleHandler, node: NodePuzzle): Promise<void> {
    try {
      const result = await handler.handler(node.params);
      if (this.pendingPuzzleNodeId === node.id) {
        this.resolvePuzzle(result);
      }
    } catch (err) {
      this.logError(`Puzzle handler error: ${err}`);
      if (this.pendingPuzzleNodeId === node.id) {
        this.resolvePuzzle('failure');
      }
    }
  }

  resolvePuzzle(result: PuzzleResult): DialogueLine | null {
    if (this.state !== 'waiting_puzzle' || !this.pendingPuzzleNodeId) {
      this.logError('No pending puzzle to resolve');
      return null;
    }

    const nodeId = this.pendingPuzzleNodeId;
    const node = this.parser.getNode(nodeId);
    if (!node || node.type !== 'puzzle') {
      this.state = 'running';
      this.pendingPuzzleNodeId = null;
      return null;
    }

    const puzzleNode = node as NodePuzzle;
    this.pendingPuzzleNodeId = null;

    let nextNodeId: string | undefined;
    let actions: Action[] | undefined;

    switch (result) {
      case 'success':
        nextNodeId = puzzleNode.successNext;
        actions = puzzleNode.successActions;
        break;
      case 'failure':
        nextNodeId = puzzleNode.failureNext;
        actions = puzzleNode.failureActions;
        break;
      case 'cancel':
        nextNodeId = puzzleNode.cancelNext;
        actions = puzzleNode.cancelActions;
        break;
    }

    if (actions) {
      this.executeActions(actions);
    }

    this.emit('puzzleResolved', {
      nodeId,
      puzzleId: puzzleNode.puzzleId,
      result,
      nextNodeId: nextNodeId || null,
    });

    this.logDebug(`Puzzle resolved: ${result}`, { nodeId, puzzleId: puzzleNode.puzzleId });

    this.state = 'running';

    if (!nextNodeId) {
      if (result === 'failure' && puzzleNode.failureNext === undefined) {
        nextNodeId = puzzleNode.successNext;
      } else if (result === 'cancel' && puzzleNode.cancelNext === undefined) {
        nextNodeId = puzzleNode.successNext;
      }
    }

    if (nextNodeId) {
      const nextNode = this.parser.getNode(nextNodeId);
      if (nextNode) return this.processNode(nextNode);
      this.logError(`Puzzle next node not found: ${nextNodeId}`);
    }

    return null;
  }

  makeChoice(nodeId: string, optionIndex: number, expired: boolean = false): DialogueLine | null {
    const node = this.parser.getNode(nodeId);
    if (!node || node.type !== 'choice') {
      this.logError(`Not a choice node: ${nodeId}`);
      return null;
    }

    const choiceNode = node as NodeChoice;
    const chapterId = this.chapterManager.getCurrentChapterId();
    const result = this.choiceBranch.selectOption(choiceNode, optionIndex, chapterId, expired);

    if (!result) {
      this.logError(`Invalid choice: ${nodeId} option ${optionIndex}`);
      return null;
    }

    // 真正的玩家选择记录（区别于进入选择节点的 enterChoice step）
    const chosenOption = choiceNode.options[optionIndex];
    this.pushSessionRecord({
      type: 'choice',
      data: {
        chapterId,
        nodeId: choiceNode.id,
        optionIndex,
        optionText: this.localizeText(chosenOption?.text || ''),
        expired,
        desc: `玩家${expired ? '（超时）' : ''}选择了选项 #${optionIndex}${chosenOption?.text ? ': ' + this.localizeText(chosenOption.text) : ''}`,
      },
    });

    if (result.actions) {
      this.executeActions(result.actions);
    }

    this.state = 'running';
    const nextNode = this.parser.getNode(result.next);
    if (nextNode) {
      return this.processNode(nextNode);
    }

    this.logError(`Next node not found: ${result.next}`);
    return null;
  }

  continue(): DialogueLine | null {
    if (this.state !== 'running') return null;

    const currentNode = this.parser.getNode(this.currentNodeId);
    if (!currentNode) return null;

    if (currentNode.type === 'dialogue') {
      const dialogueNode = currentNode as NodeDialogue;
      if (dialogueNode.next) {
        const nextNode = this.parser.getNode(dialogueNode.next);
        if (nextNode) return this.processNode(nextNode);
      }
    } else if (currentNode.type === 'action') {
      const actionNode = currentNode as NodeAction;
      if (actionNode.next) {
        const nextNode = this.parser.getNode(actionNode.next);
        if (nextNode) return this.processNode(nextNode);
      }
    } else if (currentNode.type === 'puzzle') {
      return null;
    } else if (currentNode.type === 'choice') {
      return null;
    }

    return null;
  }

  private executeActions(actions: Action[]): void {
    for (const action of actions) {
      switch (action.type) {
        case 'setVar':
          this.variableCondition.applyAction(action);
          break;
        case 'addItem':
          this.inventory.addItem(action.itemId, action.count);
          break;
        case 'removeItem':
          this.inventory.removeItem(action.itemId, action.count);
          break;
        case 'startQuest':
          this.questSystem.startQuest(action.questId);
          break;
        case 'completeObjective':
          this.questSystem.completeObjective(action.questId, action.objectiveIndex);
          break;
        case 'completeQuest':
          this.questSystem.completeQuest(action.questId);
          break;
        case 'failQuest':
          this.questSystem.failQuest(action.questId);
          break;
        case 'triggerSound':
          this.emit('sound', { soundId: action.soundId, loop: action.loop, volume: action.volume });
          break;
        case 'triggerIllustration':
          this.emit('illustration', { illustrationId: action.illustrationId, duration: action.duration });
          break;
        case 'customPuzzle':
          this.emit('puzzle', { puzzleId: action.puzzleId, params: action.params, fromAction: true });
          break;
      }
    }
  }

  injectPuzzle(handler: PuzzleHandler): void {
    this.puzzleHandlers.set(handler.puzzleId, handler);
    this.logDebug(`Puzzle injected: ${handler.puzzleId}`);
  }

  removePuzzle(puzzleId: string): void {
    this.puzzleHandlers.delete(puzzleId);
  }

  getVariable(key: string): string | number | boolean | undefined {
    return this.variableCondition.get(key);
  }

  setVariable(key: string, value: string | number | boolean): void {
    this.variableCondition.set(key, value);
  }

  evaluateCondition(condition: Condition | ConditionGroup): boolean {
    return this.variableCondition.evaluate(condition);
  }

  getCurrentChapterId(): string {
    return this.chapterManager.getCurrentChapterId();
  }

  getCurrentChapterTitle(): string {
    const raw = this.chapterManager.getChapterTitle();
    return this.localizeText(raw);
  }

  getChapterList(): Array<{ id: string; title: string; nodeCount: number }> {
    return this.chapterManager.getChapterList().map((ch) => ({
      ...ch,
      title: this.localizeText(ch.title),
    }));
  }

  getCurrentNodeId(): string {
    return this.currentNodeId;
  }

  getState(): State {
    return this.state;
  }

  rollback(): DialogueLine | null {
    return this.dialoguePlayer.rollback();
  }

  getDialogueHistory(): DialogueLine[] {
    return this.dialoguePlayer.getHistory();
  }

  getChoiceHistory(): PlayerChoiceRecord[] {
    return this.choiceBranch.getChoiceHistory();
  }

  getAvailableChoices(nodeId?: string): Array<ChoiceOption & { index: number; disabled: boolean }> {
    const nid = nodeId || this.currentNodeId;
    const node = this.parser.getNode(nid);
    if (!node || node.type !== 'choice') return [];
    return this.choiceBranch.getAvailableOptions(node as NodeChoice);
  }

  hasItem(itemId: string, count?: number): boolean {
    return this.inventory.hasItem(itemId, count ?? 1);
  }

  addItem(itemId: string, count?: number): boolean {
    return this.inventory.addItem(itemId, count ?? 1);
  }

  removeItem(itemId: string, count?: number): boolean {
    return this.inventory.removeItem(itemId, count ?? 1);
  }

  getInventory(): Array<{ itemId: string; count: number; name: string; description?: string }> {
    return this.inventory.getAllEntries().map((e) => {
      const def = this.inventory.getItemDef(e.itemId);
      return {
        itemId: e.itemId,
        count: e.count,
        name: this.localizeText(def?.name || e.itemId),
        description: def?.description ? this.localizeText(def.description) : undefined,
      };
    });
  }

  getActiveQuests(): Array<{ questId: string; name: string; description?: string; objectives: Array<{ text: string; completed: boolean }> }> {
    return this.questSystem.getActiveQuests().map((qs) => {
      const def = this.questSystem.getQuestDef(qs.questId);
      return {
        questId: qs.questId,
        name: this.localizeText(def?.name || qs.questId),
        description: def?.description ? this.localizeText(def.description) : undefined,
        objectives: (def?.objectives || []).map((text, i) => ({
          text: this.localizeText(text),
          completed: qs.completedObjectives[i] ?? false,
        })),
      };
    });
  }

  checkEndingConditions(): Array<{ endingId: string; name: string; conditionMet: boolean }> {
    const endings = this.parser.getEndings();
    return Object.values(endings).map((ending) => ({
      endingId: ending.id,
      name: this.localizeText(ending.name),
      conditionMet: !ending.condition || this.variableCondition.evaluate(ending.condition),
    }));
  }

  private validateSnapshotAgainstScript(snapshot: Snapshot): LoadResult | null {
    const chapter = this.parser.getChapter(snapshot.currentChapterId);
    if (!chapter) {
      return {
        success: false,
        error: 'invalid_state',
        message: `Chapter "${snapshot.currentChapterId}" does not exist in the current script`,
      };
    }

    const node = this.parser.getNode(snapshot.currentNodeId);
    if (!node) {
      return {
        success: false,
        error: 'invalid_state',
        message: `Node "${snapshot.currentNodeId}" does not exist in the current script`,
      };
    }

    if (snapshot.pendingState === 'waiting_puzzle') {
      if (node.type !== 'puzzle') {
        return {
          success: false,
          error: 'invalid_state',
          message: `Save expects puzzle node but "${snapshot.currentNodeId}" is type "${node.type}"`,
        };
      }
      if (snapshot.pendingPuzzleNodeId && snapshot.pendingPuzzleNodeId !== snapshot.currentNodeId) {
        const puzzleNode = this.parser.getNode(snapshot.pendingPuzzleNodeId);
        if (!puzzleNode || puzzleNode.type !== 'puzzle') {
          return {
            success: false,
            error: 'invalid_state',
            message: `Pending puzzle node "${snapshot.pendingPuzzleNodeId}" does not exist or is not a puzzle node`,
          };
        }
      }
    }

    if (snapshot.pendingState === 'waiting_choice') {
      if (node.type !== 'choice') {
        return {
          success: false,
          error: 'invalid_state',
          message: `Save expects choice node but "${snapshot.currentNodeId}" is type "${node.type}"`,
        };
      }
    }

    if (snapshot.pendingState === 'ended') {
      if (node.type !== 'ending') {
        return {
          success: false,
          error: 'invalid_state',
          message: `Save expects ending node but "${snapshot.currentNodeId}" is type "${node.type}"`,
        };
      }
    }

    return null;
  }

  save(): Snapshot {
    const pendingState = (this.state === 'waiting_choice' || this.state === 'waiting_puzzle' || this.state === 'ended')
      ? this.state
      : undefined;
    const snapshot = this.saveLoad.createSnapshot(
      this.currentNodeId,
      pendingState,
      this.pendingPuzzleNodeId
    );
    this.logDebug('Game saved');
    return snapshot;
  }

  load(snapshot: Snapshot): LoadResult {
    let workingSnapshot = snapshot;
    if (workingSnapshot.version !== this.saveLoad.getSaveVersion()) {
      const migrationResult = this.applyMigrations(workingSnapshot);
      if (!migrationResult.success) return migrationResult;
      if (migrationResult.migratedSnapshot) {
        workingSnapshot = migrationResult.migratedSnapshot;
      }
    }
    const result = this.saveLoad.restoreSnapshot(workingSnapshot);
    if (result.success) {
      this.currentNodeId = workingSnapshot.currentNodeId;
      this.pendingPuzzleNodeId = workingSnapshot.pendingPuzzleNodeId || null;

      if (workingSnapshot.pendingState === 'waiting_choice') {
        this.state = 'waiting_choice';
      } else if (workingSnapshot.pendingState === 'waiting_puzzle') {
        this.state = 'waiting_puzzle';
      } else if (workingSnapshot.pendingState === 'ended') {
        this.state = 'ended';
      } else {
        this.state = 'running';
      }

      this.logDebug('Game loaded', { state: this.state, nodeId: this.currentNodeId });
    } else {
      this.logError('Game load failed', result);
      this.emit('error', { message: 'Load failed', error: result.error, detail: result.message });
    }
    return result;
  }

  saveToString(): string {
    const pendingState = (this.state === 'waiting_choice' || this.state === 'waiting_puzzle' || this.state === 'ended')
      ? this.state
      : undefined;
    return this.saveLoad.serialize(this.currentNodeId, pendingState, this.pendingPuzzleNodeId);
  }

  loadFromString(json: string): LoadResult {
    let parsed: Snapshot;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { success: false, error: 'invalid_json', message: 'Failed to parse save data as JSON' };
    }

    if (parsed.version !== this.saveLoad.getSaveVersion()) {
      const migrationResult = this.applyMigrations(parsed);
      if (!migrationResult.success) {
        this.logError('Migration during loadFromString failed', migrationResult);
        this.emit('error', { message: 'Migration failed', error: migrationResult.error, detail: migrationResult.message });
        return migrationResult;
      }
      if (migrationResult.migratedSnapshot) {
        parsed = migrationResult.migratedSnapshot;
      }
    }

    return this.load(parsed);
  }

  exportDebugLog(): Array<{ timestamp: number; level: string; message: string; data?: unknown }> {
    return [...this.debugLog];
  }

  previewStoryTree(): StoryTreeNode {
    const chapters = this.parser.getChapters();
    const nodeMap = new Map<string, StoryNode>();
    const chapterMap = new Map<string, string>();

    for (const chapter of chapters) {
      for (const node of chapter.nodes) {
        nodeMap.set(node.id, node);
        chapterMap.set(node.id, chapter.id);
      }
    }

    const visited = new Set<string>();
    const deadEndCache = new Map<string, boolean>();

    const isDeadEnd = (nodeId: string, path: Set<string>): boolean => {
      if (deadEndCache.has(nodeId)) return deadEndCache.get(nodeId)!;
      const node = nodeMap.get(nodeId);
      if (!node) return true;
      if (node.type === 'ending') return false;
      if (path.has(nodeId)) return true;

      const nextIds = this.getNextIds(node);
      if (nextIds.length === 0) return true;

      path.add(nodeId);
      const result = nextIds.every((id) => isDeadEnd(id, path));
      path.delete(nodeId);

      deadEndCache.set(nodeId, result);
      return result;
    };

    const buildTree = (nodeId: string, depth: number = 0): StoryTreeNode => {
      if (visited.has(nodeId) || depth > 200) {
        return {
          nodeId,
          type: nodeMap.get(nodeId)?.type || 'action',
          chapterId: chapterMap.get(nodeId) || '',
          children: [],
          isDeadEnd: deadEndCache.get(nodeId) ?? false,
        };
      }
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      const dead = isDeadEnd(nodeId, new Set());
      deadEndCache.set(nodeId, dead);

      const nextIds = node ? this.getNextIds(node) : [];
      const children = nextIds.map((id) => buildTree(id, depth + 1));

      return {
        nodeId,
        type: node?.type || 'action',
        chapterId: chapterMap.get(nodeId) || '',
        children,
        isDeadEnd: dead,
      };
    };

    const firstChapter = chapters[0];
    const firstNode = firstChapter?.nodes[0];
    if (!firstNode) {
      return { nodeId: '', type: 'action', chapterId: '', children: [], isDeadEnd: true };
    }

    return buildTree(firstNode.id);
  }

  private getNextIds(node: StoryNode): string[] {
    switch (node.type) {
      case 'dialogue':
        return node.next ? [node.next] : [];
      case 'choice':
        return node.options.map((o) => o.next);
      case 'action':
        return node.next ? [node.next] : [];
      case 'goto':
        return [node.node];
      case 'ending':
        return [];
      case 'puzzle': {
        const ids = [node.successNext];
        if (node.failureNext) ids.push(node.failureNext);
        if (node.cancelNext) ids.push(node.cancelNext);
        return ids;
      }
      default:
        return [];
    }
  }

  validateDeep(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const chapters = this.parser.getChapters();
    const nodeMap = new Map<string, StoryNode>();
    const chapterMap = new Map<string, string>();

    for (const chapter of chapters) {
      for (const node of chapter.nodes) {
        nodeMap.set(node.id, node);
        chapterMap.set(node.id, chapter.id);
      }
    }

    const firstChapter = chapters[0];
    const startNodeId = firstChapter?.nodes[0]?.id || '';
    const routeCache = new Map<string, ValidationPathStep[]>();
    if (startNodeId) {
      this.buildRouteFromStart(startNodeId, nodeMap, chapterMap, new Set(), [], routeCache);
    }

    for (const chapter of chapters) {
      for (const node of chapter.nodes) {
        const nextIds = this.getNodeNextIds(node);

        for (const nextId of nextIds) {
          if (!nodeMap.has(nextId)) {
            issues.push({
              kind: 'broken_link',
              severity: 'error',
              message: `节点 "${node.id}" 引用了不存在的节点 "${nextId}"`,
              chapterId: chapter.id,
              nodeId: node.id,
              path: [{ chapterId: chapter.id, nodeId: node.id }],
              routeFromStart: routeCache.get(node.id) || undefined,
            });
          }
        }

        if (node.type !== 'ending' && nextIds.length === 0) {
          issues.push({
            kind: 'dangling_node',
            severity: 'warning',
            message: `节点 "${node.id}" 没有任何后续节点，玩家将无法继续`,
            chapterId: chapter.id,
            nodeId: node.id,
            path: [{ chapterId: chapter.id, nodeId: node.id }],
            routeFromStart: routeCache.get(node.id) || undefined,
          });
        }
      }
    }

    for (const chapter of chapters) {
      for (const node of chapter.nodes) {
        if (node.type === 'choice') {
          const choiceNode = node as NodeChoice;
          const allDisabled = choiceNode.options.every((opt, i) =>
            opt.condition && !this.isConditionPossiblySatisfiable(
              opt.condition, nodeMap, node, { choiceNodeId: node.id, optionIndex: i }
            )
          );

          if (allDisabled && choiceNode.options.length > 0) {
            issues.push({
              kind: 'all_options_disabled',
              severity: 'error',
              message: `选择节点 "${node.id}" 的所有选项条件在剧情中均不可满足，玩家将无法继续`,
              chapterId: chapter.id,
              nodeId: node.id,
              path: [
                { chapterId: chapter.id, nodeId: node.id },
                ...choiceNode.options.map((opt, i) => ({
                  chapterId: chapter.id,
                  nodeId: node.id,
                  optionIndex: i,
                  optionText: opt.text,
                })),
              ],
              routeFromStart: routeCache.get(node.id) || undefined,
            });
          }

          for (let i = 0; i < choiceNode.options.length; i++) {
            const opt = choiceNode.options[i];
            const excludeAt = { choiceNodeId: node.id, optionIndex: i };
            if (opt.condition && !this.isConditionPossiblySatisfiable(opt.condition, nodeMap, node, excludeAt)) {
              const reason = this.describeUnsatisfiableReason(opt.condition, nodeMap, node, excludeAt);
              const detail = this.buildUnsatisfiableDetail(opt.condition, nodeMap, node, excludeAt);
              issues.push({
                kind: 'unsatisfiable_condition',
                severity: 'warning',
                message: `章节 "${chapter.title}" 节点 "${node.id}" 选项 #${i} "${opt.text}" 的条件永远不可满足${reason ? '：' + reason : ''}`,
                chapterId: chapter.id,
                nodeId: node.id,
                path: [
                  { chapterId: chapter.id, nodeId: node.id, optionIndex: i, optionText: opt.text },
                ],
                routeFromStart: routeCache.get(node.id) || undefined,
                detail,
              });
            }
          }
        }
      }
    }

    const endingIds = new Set(Object.keys(this.parser.getEndings()));
    const reachability = this.buildReachabilityMap(nodeMap);

    for (const endingId of endingIds) {
      const endingNode = this.findEndingNode(endingId, chapters);
      if (!endingNode) continue;

      const startNode = chapters[0]?.nodes[0];
      const startReachability = startNode ? reachability.get(startNode.id) : undefined;

      const endingReachable = startReachability && startReachability.has(endingId);

      if (!endingReachable) {
        const chId = chapterMap.get(endingNode.id) || '';
        issues.push({
          kind: 'unreachable_ending',
          severity: 'warning',
          message: `结局 "${endingId}" 在游戏中不可达，没有任何路径可以到达此结局`,
          chapterId: chId,
          nodeId: endingNode.id,
          path: [],
          routeFromStart: routeCache.get(endingNode.id) || undefined,
        });
      }
    }

    const cyclePaths = this.findCycles(nodeMap, chapterMap);
    const reportedCycles = new Set<string>();

    for (const cycle of cyclePaths) {
      const cycleNodeIds = new Set(cycle.path.map((s) => s.nodeId));
      const cycleKey = Array.from(cycleNodeIds).sort().join('|');
      if (reportedCycles.has(cycleKey)) continue;

      const exitsToNonCycle: Array<{ step: ValidationPathStep; nextId: string }> = [];
      for (const step of cycle.path) {
        const node = nodeMap.get(step.nodeId);
        if (!node) continue;
        const nextIds = this.getNextIds(node);
        for (const nextId of nextIds) {
          if (!cycleNodeIds.has(nextId) && nodeMap.has(nextId)) {
            exitsToNonCycle.push({ step, nextId });
          }
        }
      }

      if (exitsToNonCycle.length === 0) {
        reportedCycles.add(cycleKey);
        issues.push({
          kind: 'no_exit_from_loop',
          severity: 'error',
          message: `循环中所有分支都绕回循环，玩家将永远无法到达结局 (循环节点: ${Array.from(cycleNodeIds).join(', ')})`,
          chapterId: cycle.chapterId,
          nodeId: cycle.nodeId,
          path: cycle.path,
          routeFromStart: routeCache.get(cycle.nodeId) || undefined,
          detail: this.buildCycleExitDetail(exitsToNonCycle, nodeMap),
        });
        continue;
      }

      const anyExitReachesEnding = exitsToNonCycle.some((ex) => {
        const reachableEndings = reachability.get(ex.nextId);
        return reachableEndings && reachableEndings.size > 0;
      });

      if (!anyExitReachesEnding) {
        reportedCycles.add(cycleKey);
        const exitsDetail = exitsToNonCycle.map((ex) => {
          const exitNode = nodeMap.get(ex.nextId);
          const reachableEnds = reachability.get(ex.nextId);
          return `出口 "${ex.step.nodeId}" → "${ex.nextId}" (类型: ${exitNode?.type || '?'}, 可达结局数: ${reachableEnds?.size || 0})`;
        }).join('; ');
        issues.push({
          kind: 'no_exit_from_loop',
          severity: 'error',
          message: `循环虽然有不绕回循环的出口，但所有出口路径均无法到达结局 (循环节点: ${Array.from(cycleNodeIds).join(', ')})`,
          chapterId: cycle.chapterId,
          nodeId: cycle.nodeId,
          path: cycle.path,
          routeFromStart: routeCache.get(cycle.nodeId) || undefined,
          detail: exitsDetail,
        });
        continue;
      }
    }

    for (const chapter of chapters) {
      for (const node of chapter.nodes) {
        if (node.type === 'choice') {
          const choiceNode = node as NodeChoice;
          for (let i = 0; i < choiceNode.options.length; i++) {
            const opt = choiceNode.options[i];
            const reachableEndings = reachability.get(opt.next);
            if (reachableEndings && reachableEndings.size === 0) {
              issues.push({
                kind: 'unreachable_ending',
                severity: 'warning',
                message: `章节 "${chapter.title}" 节点 "${node.id}" 选项 #${i} "${opt.text}" 路径上没有可达的结局`,
                chapterId: chapter.id,
                nodeId: node.id,
                path: [
                  { chapterId: chapter.id, nodeId: node.id, optionIndex: i, optionText: opt.text },
                ],
                routeFromStart: routeCache.get(node.id) || undefined,
              });
            }
          }
        }
      }
    }

    return issues;
  }

  validateDeadEnds(): Array<{ nodeId: string; chapterId: string; type: string }> {
    const deepIssues = this.validateDeep();
    return deepIssues
      .filter((issue) => issue.kind === 'dangling_node' || issue.kind === 'all_options_disabled')
      .map((issue) => ({
        nodeId: issue.nodeId,
        chapterId: issue.chapterId,
        type: issue.kind,
      }));
  }

  private getNodeNextIds(node: StoryNode): string[] {
    const ids: string[] = [];
    switch (node.type) {
      case 'dialogue':
        if (node.next) ids.push(node.next);
        break;
      case 'choice':
        for (const opt of node.options) ids.push(opt.next);
        break;
      case 'action':
        if (node.next) ids.push(node.next);
        break;
      case 'goto':
        ids.push(node.node);
        break;
      case 'puzzle':
        ids.push(node.successNext);
        if (node.failureNext) ids.push(node.failureNext);
        if (node.cancelNext) ids.push(node.cancelNext);
        break;
      case 'ending':
        break;
    }
    return ids;
  }

  private isConditionPossiblySatisfiable(
    condition: Condition | ConditionGroup,
    nodeMap: Map<string, StoryNode>,
    choiceNode?: StoryNode,
    excludeOptionAt?: { choiceNodeId: string; optionIndex: number }
  ): boolean {
    if ('type' in condition && (condition.type === 'and' || condition.type === 'or')) {
      const group = condition as ConditionGroup;
      if (group.type === 'and') {
        return group.conditions.every((c) => this.isConditionPossiblySatisfiable(c, nodeMap, choiceNode, excludeOptionAt));
      }
      return group.conditions.some((c) => this.isConditionPossiblySatisfiable(c, nodeMap, choiceNode, excludeOptionAt));
    }

    const cond = condition as Condition;
    const varName = cond.var;

    const setVarNodes = this.findSetVarNodes(varName, nodeMap, excludeOptionAt);
    if (setVarNodes.length === 0) return false;

    const possibleValues = this.collectPossibleValues(varName, nodeMap, excludeOptionAt);
    if (!this.canConditionBeMet(cond, possibleValues)) return false;

    if (choiceNode) {
      const reachableFromChoice = this.findNodesReachableFrom(choiceNode.id, nodeMap);
      const anySetVarReachable = setVarNodes.some((n) => reachableFromChoice.has(n.id) || n.id === choiceNode.id);
      if (!anySetVarReachable) {
        const allPathsFromStart = this.findNodesReachableFrom(nodeMap.values().next().value?.id || '', nodeMap);
        const anySetVarOnGlobalPath = setVarNodes.some((n) => allPathsFromStart.has(n.id));
        if (!anySetVarOnGlobalPath) return false;
        const choiceReachableFromStart = allPathsFromStart.has(choiceNode.id);
        const anySetVarBeforeChoice = setVarNodes.some((n) => {
          if (!choiceReachableFromStart) return true;
          const setVarReachable = this.findNodesReachableFrom(n.id, nodeMap);
          return setVarReachable.has(choiceNode.id);
        });
        if (!anySetVarBeforeChoice) return false;
      }
    }

    return true;
  }

  private findSetVarNodes(
    varName: string,
    nodeMap: Map<string, StoryNode>,
    excludeOptionAt?: { choiceNodeId: string; optionIndex: number }
  ): StoryNode[] {
    const result: StoryNode[] = [];
    for (const node of nodeMap.values()) {
      const actions = this.getNodeActions(node, excludeOptionAt);
      if (actions.some((a) => a.type === 'setVar' && a.key === varName)) {
        result.push(node);
      }
    }
    return result;
  }

  private collectPossibleValues(
    varName: string,
    nodeMap: Map<string, StoryNode>,
    excludeOptionAt?: { choiceNodeId: string; optionIndex: number }
  ): { numbers: number[]; strings: string[]; booleans: boolean[]; totalAdditive: number; maxSingleSet: number } {
    const numbers: number[] = [];
    const strings: string[] = [];
    const booleans: boolean[] = [];
    let totalAdditive = 0;
    let maxSingleSet = -Infinity;

    for (const node of nodeMap.values()) {
      const actions = this.getNodeActions(node, excludeOptionAt);
      for (const action of actions) {
        if (action.type === 'setVar' && action.key === varName) {
          const val = action.value;
          if (typeof val === 'number') {
            const op = action.op || 'set';
            if (op === 'add') {
              numbers.push(val);
              totalAdditive += val;
              if (val > maxSingleSet) maxSingleSet = val;
            } else if (op === 'sub') {
              numbers.push(-val);
              totalAdditive -= val;
              if (-val > maxSingleSet) maxSingleSet = -val;
            } else {
              numbers.push(val);
              if (val > maxSingleSet) maxSingleSet = val;
            }
          } else if (typeof val === 'string') {
            strings.push(val);
          } else if (typeof val === 'boolean') {
            booleans.push(val);
          }
        }
      }
    }
    if (maxSingleSet === -Infinity) maxSingleSet = 0;
    return { numbers, strings, booleans, totalAdditive, maxSingleSet };
  }

  private canConditionBeMet(cond: Condition, possible: { numbers: number[]; strings: string[]; booleans: boolean[] }): boolean {
    const target = cond.value;
    if (possible.booleans.length > 0 && typeof target === 'boolean') {
      if (cond.op === '==' && !possible.booleans.includes(target)) return false;
      if (cond.op === '!=' && possible.booleans.length === 1 && possible.booleans[0] === target) return false;
    }
    if (possible.strings.length > 0 && typeof target === 'string') {
      if (cond.op === '==' && !possible.strings.includes(target)) return false;
      if (cond.op === '!=' && possible.strings.length === 1 && possible.strings[0] === target) return false;
    }
    if (possible.numbers.length > 0 && typeof target === 'number') {
      const setValues = possible.numbers;
      const hasDirectSet = setValues.some((v) => {
        switch (cond.op) {
          case '==': return v === target;
          case '!=': return v !== target;
          case '>': return v > target;
          case '<': return v < target;
          case '>=': return v >= target;
          case '<=': return v <= target;
          default: return false;
        }
      });
      if (hasDirectSet) return true;
      const hasAdditiveOps = setValues.some((v) => v !== 0);
      if (hasAdditiveOps) return true;
      return false;
    }
    if (possible.numbers.length === 0 && possible.strings.length === 0 && possible.booleans.length === 0) return false;
    return true;
  }

  private findNodesReachableFrom(startNodeId: string, nodeMap: Map<string, StoryNode>): Set<string> {
    const visited = new Set<string>();
    const stack = [startNodeId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodeMap.get(id);
      if (!node) continue;
      for (const nextId of this.getNextIds(node)) {
        if (!visited.has(nextId)) stack.push(nextId);
      }
    }
    return visited;
  }

  private describeUnsatisfiableReason(
    condition: Condition | ConditionGroup,
    nodeMap: Map<string, StoryNode>,
    choiceNode: StoryNode,
    excludeOptionAt?: { choiceNodeId: string; optionIndex: number }
  ): string {
    if ('type' in condition && (condition.type === 'and' || condition.type === 'or')) {
      const group = condition as ConditionGroup;
      const subReasons = group.conditions
        .map((c) => this.describeUnsatisfiableReason(c, nodeMap, choiceNode, excludeOptionAt))
        .filter((r) => r);
      return subReasons.join(group.type === 'and' ? ' 且 ' : ' 或 ');
    }

    const cond = condition as Condition;
    const varName = cond.var;
    const setVarNodes = this.findSetVarNodes(varName, nodeMap, excludeOptionAt);

    if (setVarNodes.length === 0) {
      return `变量 "${varName}" 在整个脚本中没有任何节点设置过`;
    }

    const possibleValues = this.collectPossibleValues(varName, nodeMap, excludeOptionAt);
    if (!this.canConditionBeMet(cond, possibleValues)) {
      const valDesc = typeof cond.value === 'number'
        ? `排除当前选项动作后，数值只可能为 [${possibleValues.numbers.join(', ')}]，累加总和为 ${possibleValues.totalAdditive}，不满足 ${cond.op} ${cond.value}`
        : typeof cond.value === 'string'
        ? `字符串只可能为 [${possibleValues.strings.join(', ')}]，不满足 ${cond.op} "${cond.value}"`
        : `布尔值只可能为 [${possibleValues.booleans.join(', ')}]，不满足 ${cond.op} ${cond.value}`;
      return valDesc;
    }

    const reachableFromChoice = this.findNodesReachableFrom(choiceNode.id, nodeMap);
    const anySetVarReachable = setVarNodes.some((n) => reachableFromChoice.has(n.id) || n.id === choiceNode.id);
    if (!anySetVarReachable) {
      const setVarNodeIds = setVarNodes.map((n) => n.id).join(', ');
      return `设置变量 "${varName}" 的节点 (${setVarNodeIds}) 不在当前选项的可达路径上`;
    }

    return '';
  }

  private buildUnsatisfiableDetail(
    condition: Condition | ConditionGroup,
    nodeMap: Map<string, StoryNode>,
    choiceNode: StoryNode,
    excludeOptionAt?: { choiceNodeId: string; optionIndex: number }
  ): string {
    const parts: string[] = [];
    this.collectConditionDetails(condition, nodeMap, choiceNode, parts, excludeOptionAt);
    return parts.join(' | ');
  }

  private collectConditionDetails(
    condition: Condition | ConditionGroup,
    nodeMap: Map<string, StoryNode>,
    choiceNode: StoryNode,
    parts: string[],
    excludeOptionAt?: { choiceNodeId: string; optionIndex: number }
  ): void {
    if ('type' in condition && (condition.type === 'and' || condition.type === 'or')) {
      const group = condition as ConditionGroup;
      for (const c of group.conditions) {
        this.collectConditionDetails(c, nodeMap, choiceNode, parts, excludeOptionAt);
      }
      return;
    }
    const cond = condition as Condition;
    const varName = cond.var;
    const setVarNodes = this.findSetVarNodes(varName, nodeMap, excludeOptionAt);

    if (setVarNodes.length === 0) {
      parts.push(`变量 "${varName}" 在脚本中未被任何节点设置过（当前选项自己的动作已排除，不算作选择前的变量来源）`);
      return;
    }

    const reachableFromChoice = this.findNodesReachableFrom(choiceNode.id, nodeMap);
    const allPathsFromStart = this.findNodesReachableFrom(nodeMap.values().next().value?.id || '', nodeMap);
    const beforeChoice = setVarNodes.filter((n) => {
      const setVarReachable = this.findNodesReachableFrom(n.id, nodeMap);
      return setVarReachable.has(choiceNode.id) || !allPathsFromStart.has(choiceNode.id);
    });
    const afterChoice = setVarNodes.filter((n) =>
      reachableFromChoice.has(n.id) && !beforeChoice.includes(n)
    );
    const unreachable = setVarNodes.filter((n) =>
      !beforeChoice.includes(n) && !afterChoice.includes(n)
    );

    if (beforeChoice.length === 0 && afterChoice.length > 0) {
      const nodeList = afterChoice.map((n) => n.id).join(', ');
      parts.push(`变量 "${varName}" 只在选项之后的节点 (${nodeList}) 中设置，选项选择时变量尚未初始化`);
    }

    if (unreachable.length === setVarNodes.length) {
      const nodeList = setVarNodes.map((n) => n.id).join(', ');
      parts.push(`设置变量 "${varName}" 的节点 (${nodeList}) 与当前选项互斥或不在可达路径上`);
    }

    const possibleValues = this.collectPossibleValues(varName, nodeMap, excludeOptionAt);
    if (typeof cond.value === 'number' && possibleValues.numbers.length > 0) {
      const target = cond.value as number;
      if ((cond.op === '>' || cond.op === '>=')) {
        const total = possibleValues.totalAdditive;
        const maxSingle = possibleValues.maxSingleSet;
        if (total <= target) {
          parts.push(`排除当前选项动作后，变量 "${varName}" 的所有增量/设置操作总和为 ${total}，要求 ${cond.op} ${target}，永远达不到`);
        }
        if (maxSingle < target && total <= target) {
          parts.push(`排除当前选项动作后，变量 "${varName}" 单次设置的最大值为 ${maxSingle}，累加总和为 ${total}，均小于要求 ${cond.op} ${target}`);
        }
      }
    }
  }

  private buildCycleExitDetail(
    exits: Array<{ step: ValidationPathStep; nextId: string }>,
    nodeMap: Map<string, StoryNode>
  ): string {
    if (exits.length === 0) return '无任何出口指向循环外部节点';
    const exitDescs = exits.map((ex) => {
      const exitNode = nodeMap.get(ex.nextId);
      const nodeType = exitNode?.type || 'unknown';
      return `从 "${ex.step.nodeId}" 出口到 "${ex.nextId}" (${nodeType})`;
    });
    return exitDescs.join('; ');
  }

  private buildRouteFromStart(
    nodeId: string,
    nodeMap: Map<string, StoryNode>,
    chapterMap: Map<string, string>,
    pathSet: Set<string>,
    pathStack: ValidationPathStep[],
    routeCache: Map<string, ValidationPathStep[]>
  ): void {
    if (pathSet.has(nodeId)) return;
    if (routeCache.has(nodeId)) return;

    const node = nodeMap.get(nodeId);
    if (!node) return;

    const currentStep: ValidationPathStep = {
      chapterId: chapterMap.get(nodeId) || '',
      nodeId,
    };
    const newPath = [...pathStack, currentStep];
    routeCache.set(nodeId, [...newPath]);

    pathSet.add(nodeId);
    const nextIds = this.getNodeNextIds(node);
    const choiceOptions: Array<{ nextId: string; optIdx?: number; optText?: string }> = [];
    if (node.type === 'choice') {
      for (let i = 0; i < node.options.length; i++) {
        choiceOptions.push({
          nextId: node.options[i].next,
          optIdx: i,
          optText: node.options[i].text,
        });
      }
    } else {
      for (const nextId of nextIds) {
        choiceOptions.push({ nextId });
      }
    }

    for (const co of choiceOptions) {
      if (co.optIdx !== undefined) {
        currentStep.optionIndex = co.optIdx;
        currentStep.optionText = co.optText;
        routeCache.set(nodeId, [...newPath]);
      }
      this.buildRouteFromStart(co.nextId, nodeMap, chapterMap, pathSet, newPath, routeCache);
    }
    pathSet.delete(nodeId);
  }

  private getNodeActions(node: StoryNode, excludeOptionAt?: { choiceNodeId: string; optionIndex: number }): Action[] {
    const actions: Action[] = [];
    switch (node.type) {
      case 'dialogue':
        if (node.actions) actions.push(...node.actions);
        break;
      case 'choice':
        for (let i = 0; i < node.options.length; i++) {
          if (excludeOptionAt && excludeOptionAt.choiceNodeId === node.id && excludeOptionAt.optionIndex === i) {
            continue;
          }
          const opt = node.options[i];
          if (opt.actions) actions.push(...opt.actions);
        }
        break;
      case 'action':
        actions.push(...node.actions);
        break;
      case 'puzzle':
        if (node.successActions) actions.push(...node.successActions);
        if (node.failureActions) actions.push(...node.failureActions);
        if (node.cancelActions) actions.push(...node.cancelActions);
        break;
    }
    return actions;
  }

  private buildReachabilityMap(nodeMap: Map<string, StoryNode>): Map<string, Set<string>> {
    const reachability = new Map<string, Set<string>>();

    const compute = (nodeId: string, stack: Set<string>): Set<string> => {
      if (reachability.has(nodeId)) return reachability.get(nodeId)!;
      if (stack.has(nodeId)) return new Set<string>();

      stack.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node) {
        const empty = new Set<string>();
        reachability.set(nodeId, empty);
        return empty;
      }

      const myEndings = new Set<string>();
      if (node.type === 'ending') {
        myEndings.add(node.endingId);
      }

      for (const nextId of this.getNextIds(node)) {
        const childEndings = compute(nextId, stack);
        for (const e of childEndings) myEndings.add(e);
      }

      reachability.set(nodeId, myEndings);
      stack.delete(nodeId);
      return myEndings;
    };

    for (const nodeId of nodeMap.keys()) {
      if (!reachability.has(nodeId)) {
        compute(nodeId, new Set());
      }
    }

    return reachability;
  }

  private findEndingNode(endingId: string, chapters: { nodes: StoryNode[] }[]): StoryNode | undefined {
    for (const chapter of chapters) {
      for (const node of chapter.nodes) {
        if (node.type === 'ending' && (node as { endingId: string }).endingId === endingId) {
          return node;
        }
      }
    }
    return undefined;
  }

  private findCycles(
    nodeMap: Map<string, StoryNode>,
    chapterMap: Map<string, string>
  ): Array<{ nodeId: string; chapterId: string; path: ValidationPathStep[] }> {
    const cycles: Array<{ nodeId: string; chapterId: string; path: ValidationPathStep[] }> = [];
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    const pathStack: ValidationPathStep[] = [];

    for (const nodeId of nodeMap.keys()) {
      color.set(nodeId, WHITE);
    }

    const dfs = (nodeId: string): void => {
      color.set(nodeId, GRAY);
      const node = nodeMap.get(nodeId);
      if (!node) return;

      pathStack.push({
        chapterId: chapterMap.get(nodeId) || '',
        nodeId,
      });

      const nextIds = this.getNextIds(node);
      for (const nextId of nextIds) {
        if (!nodeMap.has(nextId)) continue;

        const nextColor = color.get(nextId);
        if (nextColor === GRAY) {
          const cycleStartIdx = pathStack.findIndex((s) => s.nodeId === nextId);
          if (cycleStartIdx >= 0) {
            const cyclePath = pathStack.slice(cycleStartIdx);
            cycles.push({
              nodeId: nextId,
              chapterId: chapterMap.get(nextId) || '',
              path: [...cyclePath],
            });
          }
        } else if (nextColor === WHITE) {
          const lastStep = pathStack[pathStack.length - 1];
          if (node.type === 'choice') {
            const choiceNode = node as NodeChoice;
            const optIdx = choiceNode.options.findIndex((o) => o.next === nextId);
            if (optIdx >= 0) {
              lastStep.optionIndex = optIdx;
              lastStep.optionText = choiceNode.options[optIdx].text;
            }
          }
          dfs(nextId);
        }
      }

      pathStack.pop();
      color.set(nodeId, BLACK);
    };

    for (const nodeId of nodeMap.keys()) {
      if (color.get(nodeId) === WHITE) {
        dfs(nodeId);
      }
    }

    const seen = new Set<string>();
    return cycles.filter((c) => {
      const key = c.nodeId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  setLocale(locale: string): void {
    this.locale = locale;
    this.choiceBranch.setLocalizeFn((text: string) => this.localizeText(text));
    this.dialoguePlayer.setLocalizeFn((text: string) => this.localizeText(text));
    this.logDebug(`Locale changed to: ${locale}`);
  }

  getLocale(): string {
    return this.locale;
  }

  private localizeText(text: string): string {
    if (!text || !this.locale) return text;
    const i18n = this.parser.getScript().i18n;
    if (!i18n || !i18n[this.locale]) return text;
    return i18n[this.locale][text] || text;
  }

  getAchievementProgress(): AchievementState[] {
    return this.saveLoad.getAchievementProgress();
  }

  unlockAchievement(id: string, name: string, description?: string): boolean {
    const unlocked = this.saveLoad.unlockAchievement(id, name, description);
    if (unlocked) {
      const achievement: AchievementState = {
        id,
        name,
        description,
        unlocked: true,
        unlockedAt: Date.now(),
      };
      this.emit('achievement', achievement);
    }
    return unlocked;
  }

  isAchievementUnlocked(id: string): boolean {
    return this.saveLoad.isAchievementUnlocked(id);
  }

  getVisitedNodes(): string[] {
    return this.saveLoad.getVisitedNodes();
  }

  registerMigration(migration: MigrationFn): void {
    this.migrations.set(migration.fromVersion, migration);
    this.logDebug(`Migration registered: ${migration.fromVersion} → ${migration.toVersion}`);
  }

  private applyMigrations(snapshot: Snapshot): LoadResult & { migratedSnapshot?: Snapshot } {
    const migrationPath: string[] = [];
    let current: Snapshot = { ...snapshot };
    let currentVersion = current.version;

    const maxSteps = 20;
    let steps = 0;

    while (currentVersion !== this.saveLoad.getSaveVersion() && steps < maxSteps) {
      steps++;
      const migration = this.migrations.get(currentVersion);
      if (!migration) {
        return {
          success: false,
          error: 'migration_failed',
          message: `No migration path from version "${currentVersion}" to "${this.saveLoad.getSaveVersion()}" (path: ${migrationPath.length > 0 ? migrationPath.join(' → ') : 'none'})`,
        };
      }
      try {
        current = migration.migrate(current);
        migrationPath.push(`${currentVersion} → ${migration.toVersion}`);
        currentVersion = migration.toVersion;
        current = { ...current, version: migration.toVersion };
      } catch (err) {
        return {
          success: false,
          error: 'migration_failed',
          message: `Migration from "${currentVersion}" to "${migration.toVersion}" failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    if (currentVersion !== this.saveLoad.getSaveVersion()) {
      return {
        success: false,
        error: 'migration_failed',
        message: `Could not reach target version "${this.saveLoad.getSaveVersion()}" (got to "${currentVersion}", path: ${migrationPath.join(' → ')})`,
      };
    }

    return { success: true, migratedSnapshot: current };
  }

  exportSession(): DebugSession {
    const script = this.parser.getScript();
    return {
      scriptTitle: script.meta.title,
      scriptVersion: script.meta.version,
      locale: this.locale,
      startedAt: this.sessionStartedAt,
      endedAt: this.state === 'ended' ? Date.now() : undefined,
      totalSteps: this.sessionRecords.filter((r) => r.type === 'step').length,
      records: [...this.sessionRecords],
    };
  }

  exportSessionJSON(): string {
    return JSON.stringify(this.exportSession(), null, 2);
  }

  reset(startChapterId?: string): void {
    this.variableCondition.clear();
    this.inventory.clear();
    this.questSystem.clear();
    this.dialoguePlayer.clearHistory();
    this.choiceBranch.setChoiceHistory([]);
    this.chapterManager.reset(startChapterId);
    this.currentNodeId = '';
    this.state = 'idle';
    this.pendingPuzzleNodeId = null;
    this.puzzleResolveCallback = null;
    this.debugLog = [];
    this.logDebug('SDK reset');
  }

  getParser(): ScriptParser {
    return this.parser;
  }

  getChapterManager(): ChapterManager {
    return this.chapterManager;
  }

  getDialoguePlayer(): DialoguePlayer {
    return this.dialoguePlayer;
  }

  getChoiceBranch(): ChoiceBranch {
    return this.choiceBranch;
  }

  getVariableCondition(): VariableCondition {
    return this.variableCondition;
  }

  getInventoryManager(): Inventory {
    return this.inventory;
  }

  getQuestSystem(): QuestSystem {
    return this.questSystem;
  }

  getSaveLoadManager(): SaveLoad {
    return this.saveLoad;
  }
}
