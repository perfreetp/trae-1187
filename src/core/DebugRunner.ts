import {
  NarrativeScript,
  DialogueLine,
  NarrativeEvent,
  PuzzleResult,
  DebugStepInfo,
  DebugStepVariableChange,
  DebugStepItemChange,
  DebugStepQuestChange,
  InventoryEntry,
  QuestState,
  AchievementState,
  Condition,
  ConditionGroup,
} from './types';
import { NarrativeSDK } from './NarrativeSDK';

export class DebugRunner {
  private sdk: NarrativeSDK;
  private stepIndex: number = 0;
  private stepHistory: DebugStepInfo[] = [];
  private startedAt: number = 0;
  private eventBuffer: Array<{ type: string; data: unknown }> = [];
  private prevVariables: Record<string, string | number | boolean> = {};
  private prevInventory: InventoryEntry[] = [];
  private prevQuests: QuestState[] = [];
  private prevAchievements: AchievementState[] = [];

  constructor(script: NarrativeScript, locale: string = 'zh-CN') {
    this.sdk = new NarrativeSDK({
      script,
      locale,
      debug: true,
      onEvent: (event: NarrativeEvent) => {
        this.eventBuffer.push({ type: event.type, data: event.data });
      },
    });
  }

  private snapshotBefore(): void {
    this.prevVariables = this.sdk.getVariableCondition().getAll();
    this.prevInventory = this.sdk.getInventoryManager().getAllEntries();
    this.prevQuests = this.sdk.getQuestSystem().getAllQuestStates();
    this.prevAchievements = this.sdk.getSaveLoadManager().getAchievementProgress();
  }

  private computeVariableChanges(): DebugStepVariableChange[] {
    const changes: DebugStepVariableChange[] = [];
    const current = this.sdk.getVariableCondition().getAll();
    const allKeys = new Set([...Object.keys(this.prevVariables), ...Object.keys(current)]);
    for (const key of allKeys) {
      const oldVal = this.prevVariables[key];
      const newVal = current[key];
      if (oldVal !== newVal) {
        changes.push({ key, oldValue: oldVal, newValue: newVal as string | number | boolean });
      }
    }
    return changes;
  }

  private computeItemChanges(): DebugStepItemChange[] {
    const changes: DebugStepItemChange[] = [];
    const current: InventoryEntry[] = this.sdk.getInventoryManager().getAllEntries();
    const prevMap = new Map<string, number>(this.prevInventory.map((e: InventoryEntry) => [e.itemId, e.count]));
    const currMap = new Map<string, number>(current.map((e: InventoryEntry) => [e.itemId, e.count]));
    const allIds = new Set<string>([...prevMap.keys(), ...currMap.keys()]);
    for (const id of allIds) {
      const oldCount: number = prevMap.get(id) ?? 0;
      const newCount: number = currMap.get(id) ?? 0;
      if (newCount > oldCount) {
        changes.push({ itemId: id, change: 'add', count: newCount - oldCount });
      } else if (newCount < oldCount) {
        changes.push({ itemId: id, change: 'remove', count: oldCount - newCount });
      }
    }
    return changes;
  }

  private computeQuestChanges(): DebugStepQuestChange[] {
    const changes: DebugStepQuestChange[] = [];
    const current: QuestState[] = this.sdk.getQuestSystem().getAllQuestStates();
    const prevMap = new Map<string, QuestState>(this.prevQuests.map((q: QuestState) => [q.questId, q]));
    const currMap = new Map<string, QuestState>(current.map((q: QuestState) => [q.questId, q]));
    const allIds = new Set<string>([...prevMap.keys(), ...currMap.keys()]);
    for (const id of allIds) {
      const prev = prevMap.get(id);
      const curr = currMap.get(id);
      if (!prev && curr) {
        changes.push({
          questId: id,
          change: 'start',
          oldStatus: 'inactive',
          newStatus: curr.status,
        });
      } else if (prev && curr) {
        if (prev.status !== curr.status) {
          if (curr.status === 'completed') {
            changes.push({
              questId: id,
              change: 'complete',
              oldStatus: prev.status,
              newStatus: curr.status,
            });
          } else if (curr.status === 'failed') {
            changes.push({
              questId: id,
              change: 'fail',
              oldStatus: prev.status,
              newStatus: curr.status,
            });
          } else if (prev.status === 'inactive' && curr.status === 'active') {
            changes.push({
              questId: id,
              change: 'start',
              oldStatus: prev.status,
              newStatus: curr.status,
            });
          }
        }
        for (let i = 0; i < curr.completedObjectives.length; i++) {
          if (curr.completedObjectives[i] && (prev.completedObjectives[i] === undefined || !prev.completedObjectives[i])) {
            changes.push({
              questId: id,
              change: 'objectiveComplete',
              objectiveIndex: i,
              oldStatus: prev.status,
              newStatus: curr.status,
            });
          }
        }
      }
    }
    return changes;
  }

  start(chapterId?: string, nodeId?: string): DebugStepInfo {
    this.startedAt = Date.now();
    this.stepIndex = 0;
    this.stepHistory = [];
    this.snapshotBefore();
    this.eventBuffer = [];

    const line = this.sdk.start(chapterId, nodeId);
    return this.buildStepInfo(line);
  }

  step(): DebugStepInfo {
    this.snapshotBefore();
    this.eventBuffer = [];

    const line = this.sdk.continue();
    return this.buildStepInfo(line);
  }

  choose(optionIndex: number): DebugStepInfo {
    this.snapshotBefore();
    this.eventBuffer = [];

    const nodeId = this.sdk.getCurrentNodeId();
    const line = this.sdk.makeChoice(nodeId, optionIndex);
    return this.buildStepInfo(line);
  }

  resolvePuzzle(result: PuzzleResult): DebugStepInfo {
    this.snapshotBefore();
    this.eventBuffer = [];

    const line = this.sdk.resolvePuzzle(result);
    return this.buildStepInfo(line);
  }

  private buildStepInfo(line: DialogueLine | null): DebugStepInfo {
    const info: DebugStepInfo = {
      stepIndex: this.stepIndex++,
      nodeId: this.sdk.getCurrentNodeId(),
      nodeType: this.sdk.getState() === 'ended' ? 'ending' : this.getCurrentNodeType() as DebugStepInfo['nodeType'],
      chapterId: this.sdk.getCurrentChapterId(),
      state: this.sdk.getState(),
      variableChanges: this.computeVariableChanges(),
      itemChanges: this.computeItemChanges(),
      questChanges: this.computeQuestChanges(),
      events: [...this.eventBuffer],
      timestamp: Date.now(),
    };

    if (line) {
      info.dialogueLine = line;
    }

    if (this.sdk.getState() === 'waiting_choice') {
      const choices = this.sdk.getAvailableChoices();
      info.availableOptions = choices.map((c) => ({
        text: c.text,
        disabled: c.disabled,
        index: c.index,
        conditionDesc: c.condition ? this.describeCondition(c.condition) : undefined,
      }));
    }

    if (this.sdk.getState() === 'waiting_puzzle') {
      const node = this.sdk.getParser().getNode(this.sdk.getCurrentNodeId());
      if (node && node.type === 'puzzle') {
        info.puzzleInfo = { puzzleId: node.puzzleId, params: node.params };
      }
    }

    if (info.nodeType === 'ending') {
      const node = this.sdk.getParser().getNode(this.sdk.getCurrentNodeId());
      if (node && node.type === 'ending') {
        const ending = this.sdk.getParser().getEnding(node.endingId);
        info.endingInfo = { endingId: node.endingId, name: ending?.name || node.endingId };
      }
    }

    this.stepHistory.push(info);
    return info;
  }

  private getCurrentNodeType(): string {
    const node = this.sdk.getParser().getNode(this.sdk.getCurrentNodeId());
    return node?.type || 'unknown';
  }

  private describeCondition(condition: Condition | ConditionGroup): string {
    if ('type' in condition && (condition.type === 'and' || condition.type === 'or')) {
      const group = condition as ConditionGroup;
      return group.conditions.map((c) => this.describeCondition(c)).join(` ${group.type} `);
    }
    const cond = condition as Condition;
    return `${cond.var} ${cond.op} ${JSON.stringify(cond.value)}`;
  }

  setVariable(key: string, value: string | number | boolean): void {
    this.sdk.setVariable(key, value);
  }

  addItem(itemId: string, count: number = 1): boolean {
    return this.sdk.addItem(itemId, count);
  }

  removeItem(itemId: string, count: number = 1): boolean {
    return this.sdk.removeItem(itemId, count);
  }

  startQuest(questId: string): boolean {
    return this.sdk.getQuestSystem().startQuest(questId);
  }

  completeQuest(questId: string): boolean {
    return this.sdk.getQuestSystem().completeQuest(questId);
  }

  failQuest(questId: string): boolean {
    return this.sdk.getQuestSystem().failQuest(questId);
  }

  completeObjective(questId: string, objectiveIndex: number): boolean {
    return this.sdk.getQuestSystem().completeObjective(questId, objectiveIndex);
  }

  getSDK(): NarrativeSDK {
    return this.sdk;
  }

  getStepHistory(): DebugStepInfo[] {
    return [...this.stepHistory];
  }

  exportSession(): {
    scriptTitle: string;
    scriptVersion: string;
    locale: string;
    startedAt: number;
    endedAt?: number;
    totalSteps: number;
    records: Array<{
      type: string;
      timestamp: number;
      data: Record<string, unknown>;
      stateSnapshot?: {
        nodeId: string;
        chapterId: string;
        variables: Record<string, string | number | boolean>;
        inventoryCount: number;
        activeQuestCount: number;
      };
    }>;
  } {
    return this.sdk.exportSession();
  }

  exportSessionJSON(): string {
    return this.sdk.exportSessionJSON();
  }

  reset(chapterId?: string): void {
    this.sdk.reset(chapterId);
    this.stepIndex = 0;
    this.stepHistory = [];
    this.eventBuffer = [];
  }
}
