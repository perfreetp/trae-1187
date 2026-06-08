import {
  SDKConfig,
  NarrativeScript,
  StoryNode,
  NodeDialogue,
  NodeChoice,
  NodeAction,
  NodeGoto,
  Action,
  CharacterRegistration,
  DialogueLine,
  ChoiceOption,
  Snapshot,
  StoryTreeNode,
  EndingDef,
  NarrativeEvent,
  EventHandler,
  PuzzleHandler,
  AchievementState,
  PlayerChoiceRecord,
  Condition,
  ConditionGroup,
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
  private onChoiceResolve: ((next: string) => void) | null = null;
  private onPuzzleResolve: ((success: boolean) => void) | null = null;

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
    this.inventory = new Inventory(this.parser, moduleEventHandler);
    this.questSystem = new QuestSystem(this.parser, moduleEventHandler);
    this.dialoguePlayer = new DialoguePlayer(this.parser, this.chapterManager, moduleEventHandler);
    this.saveLoad = new SaveLoad(
      this.variableCondition,
      this.inventory,
      this.questSystem,
      this.dialoguePlayer,
      this.choiceBranch,
      this.chapterManager
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
    this.logDebug('Dialogue played', { nodeId: node.id, speaker: node.speaker });
    return line;
  }

  private processChoice(node: NodeChoice): DialogueLine | null {
    this.state = 'waiting_choice';
    const available = this.choiceBranch.getAvailableOptions(node);

    if (node.timelimit && node.timelimit > 0) {
      const defaultIdx = node.defaultOption ?? 0;
      this.choiceBranch.startTimer(node.timelimit, defaultIdx, (idx) => {
        this.makeChoice(node.id, idx);
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
      name: ending?.name || node.endingId,
      text: node.text ? this.localizeText(node.text) : undefined,
    });

    this.logDebug('Ending reached', { endingId: node.endingId });
    return null;
  }

  makeChoice(nodeId: string, optionIndex: number): DialogueLine | null {
    const node = this.parser.getNode(nodeId);
    if (!node || node.type !== 'choice') {
      this.logError(`Not a choice node: ${nodeId}`);
      return null;
    }

    const choiceNode = node as NodeChoice;
    const chapterId = this.chapterManager.getCurrentChapterId();
    const result = this.choiceBranch.selectOption(choiceNode, optionIndex, chapterId);

    if (!result) {
      this.logError(`Invalid choice: ${nodeId} option ${optionIndex}`);
      return null;
    }

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
          this.handlePuzzle(action.puzzleId, action.params);
          break;
      }
    }
  }

  private async handlePuzzle(puzzleId: string, params?: Record<string, unknown>): Promise<void> {
    const handler = this.puzzleHandlers.get(puzzleId);
    if (!handler) {
      this.logError(`No puzzle handler for: ${puzzleId}`);
      return;
    }

    this.state = 'waiting_puzzle';
    this.emit('puzzle', { puzzleId, params });

    try {
      const success = await handler.handler(params);
      this.state = 'running';
      this.logDebug(`Puzzle ${puzzleId} resolved: ${success}`);
    } catch (err) {
      this.logError(`Puzzle ${puzzleId} error: ${err}`);
      this.state = 'running';
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
    return this.chapterManager.getChapterTitle();
  }

  getChapterList(): Array<{ id: string; title: string; nodeCount: number }> {
    return this.chapterManager.getChapterList();
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
        name: def?.name || e.itemId,
        description: def?.description,
      };
    });
  }

  getActiveQuests(): Array<{ questId: string; name: string; description?: string; objectives: Array<{ text: string; completed: boolean }> }> {
    return this.questSystem.getActiveQuests().map((qs) => {
      const def = this.questSystem.getQuestDef(qs.questId);
      return {
        questId: qs.questId,
        name: def?.name || qs.questId,
        description: def?.description,
        objectives: (def?.objectives || []).map((text, i) => ({
          text,
          completed: qs.completedObjectives[i] ?? false,
        })),
      };
    });
  }

  checkEndingConditions(): Array<{ endingId: string; name: string; conditionMet: boolean }> {
    const endings = this.parser.getEndings();
    return Object.values(endings).map((ending) => ({
      endingId: ending.id,
      name: ending.name,
      conditionMet: !ending.condition || this.variableCondition.evaluate(ending.condition),
    }));
  }

  save(): Snapshot {
    const snapshot = this.saveLoad.createSnapshot();
    snapshot.currentNodeId = this.currentNodeId;
    this.logDebug('Game saved');
    return snapshot;
  }

  load(snapshot: Snapshot): boolean {
    this.saveLoad.restoreSnapshot(snapshot);
    this.currentNodeId = snapshot.currentNodeId;
    this.state = 'running';
    this.logDebug('Game loaded');
    return true;
  }

  saveToString(): string {
    return this.saveLoad.serialize();
  }

  loadFromString(json: string): boolean {
    const snapshot = this.saveLoad.deserialize(json);
    if (snapshot) {
      this.currentNodeId = this.saveLoad.createSnapshot().currentNodeId;
      this.state = 'running';
    }
    return snapshot;
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
    const deadEnds = new Set<string>();

    const isDeadEnd = (nodeId: string): boolean => {
      if (deadEnds.has(nodeId)) return true;
      const node = nodeMap.get(nodeId);
      if (!node) return true;
      if (node.type === 'ending') return false;

      const nextIds = this.getNextIds(node);
      if (nextIds.length === 0) return true;
      return nextIds.every((id) => isDeadEnd(id));
    };

    const buildTree = (nodeId: string): StoryTreeNode => {
      if (visited.has(nodeId)) {
        return { nodeId, type: nodeMap.get(nodeId)?.type || 'action', chapterId: chapterMap.get(nodeId) || '', children: [], isDeadEnd: false };
      }
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      const dead = isDeadEnd(nodeId);
      deadEnds.add(nodeId);

      const nextIds = node ? this.getNextIds(node) : [];
      const children = nextIds
        .filter((id) => !visited.has(id) || deadEnds.has(id))
        .map((id) => buildTree(id));

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

  validateDeadEnds(): Array<{ nodeId: string; chapterId: string; type: string }> {
    const chapters = this.parser.getChapters();
    const nodeMap = new Map<string, StoryNode>();
    const chapterMap = new Map<string, string>();
    const reachableEndings = new Set<string>();

    for (const chapter of chapters) {
      for (const node of chapter.nodes) {
        nodeMap.set(node.id, node);
        chapterMap.set(node.id, chapter.id);
      }
    }

    const findReachableEndings = (nodeId: string, visited: Set<string>): void => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodeMap.get(nodeId);
      if (!node) return;
      if (node.type === 'ending') {
        reachableEndings.add(node.id);
        return;
      }
      for (const nextId of this.getNextIds(node)) {
        findReachableEndings(nextId, visited);
      }
    };

    const firstChapter = chapters[0];
    if (firstChapter?.nodes[0]) {
      findReachableEndings(firstChapter.nodes[0].id, new Set());
    }

    const deadEnds: Array<{ nodeId: string; chapterId: string; type: string }> = [];
    for (const chapter of chapters) {
      for (const node of chapter.nodes) {
        if (node.type === 'ending') continue;
        const nextIds = this.getNextIds(node);
        if (nextIds.length === 0 && node.type !== 'choice') {
          deadEnds.push({ nodeId: node.id, chapterId: chapter.id, type: node.type });
        } else if (node.type === 'choice') {
          const choiceNode = node as NodeChoice;
          const available = this.choiceBranch.getAvailableOptions(choiceNode);
          if (available.every((o) => o.disabled)) {
            deadEnds.push({ nodeId: node.id, chapterId: chapter.id, type: 'choice (all disabled)' });
          }
        }
      }
    }

    return deadEnds;
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
      default:
        return [];
    }
  }

  setLocale(locale: string): void {
    this.locale = locale;
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
    return this.saveLoad.unlockAchievement(id, name, description);
  }

  isAchievementUnlocked(id: string): boolean {
    return this.saveLoad.isAchievementUnlocked(id);
  }

  getVisitedNodes(): string[] {
    return this.saveLoad.getVisitedNodes();
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
