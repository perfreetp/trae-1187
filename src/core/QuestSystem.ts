import {
  QuestState,
  QuestDef,
  NarrativeEvent,
  EventHandler,
} from './types';
import { ScriptParser } from './ScriptParser';

export class QuestSystem {
  private parser: ScriptParser;
  private questStates: Map<string, QuestState> = new Map();
  private eventHandler?: EventHandler;

  constructor(parser: ScriptParser, eventHandler?: EventHandler) {
    this.parser = parser;
    this.eventHandler = eventHandler;
  }

  startQuest(questId: string): boolean {
    const def = this.parser.getQuest(questId);
    if (!def) return false;

    const existing = this.questStates.get(questId);
    if (existing && existing.status === 'active') return false;

    this.questStates.set(questId, {
      questId,
      status: 'active',
      completedObjectives: new Array(def.objectives.length).fill(false),
    });

    this.emit('questStart', { questId });
    return true;
  }

  completeObjective(questId: string, objectiveIndex: number): boolean {
    const state = this.questStates.get(questId);
    if (!state || state.status !== 'active') return false;

    const def = this.parser.getQuest(questId);
    if (!def || objectiveIndex < 0 || objectiveIndex >= def.objectives.length) return false;

    state.completedObjectives[objectiveIndex] = true;
    this.emit('objectiveComplete', { questId, objectiveIndex });

    if (state.completedObjectives.every(Boolean)) {
      state.status = 'completed';
      this.emit('questComplete', { questId });
    }

    return true;
  }

  completeQuest(questId: string): boolean {
    const state = this.questStates.get(questId);
    if (!state || state.status !== 'active') return false;

    state.status = 'completed';
    state.completedObjectives = state.completedObjectives.map(() => true);
    this.emit('questComplete', { questId });
    return true;
  }

  failQuest(questId: string): boolean {
    const state = this.questStates.get(questId);
    if (!state || state.status !== 'active') return false;

    state.status = 'failed';
    this.emit('questFail', { questId });
    return true;
  }

  getQuestState(questId: string): QuestState | undefined {
    return this.questStates.get(questId);
  }

  getQuestDef(questId: string): QuestDef | undefined {
    return this.parser.getQuest(questId);
  }

  isQuestActive(questId: string): boolean {
    return this.questStates.get(questId)?.status === 'active';
  }

  isQuestCompleted(questId: string): boolean {
    return this.questStates.get(questId)?.status === 'completed';
  }

  isQuestFailed(questId: string): boolean {
    return this.questStates.get(questId)?.status === 'failed';
  }

  getAllQuestStates(): QuestState[] {
    return Array.from(this.questStates.values());
  }

  getActiveQuests(): QuestState[] {
    return Array.from(this.questStates.values()).filter((q) => q.status === 'active');
  }

  getCompletedQuests(): QuestState[] {
    return Array.from(this.questStates.values()).filter((q) => q.status === 'completed');
  }

  setQuestStates(states: QuestState[]): void {
    this.questStates.clear();
    for (const state of states) {
      this.questStates.set(state.questId, { ...state, completedObjectives: [...state.completedObjectives] });
    }
  }

  clear(): void {
    this.questStates.clear();
  }

  private emit(type: NarrativeEvent['type'], data: unknown): void {
    if (this.eventHandler) {
      this.eventHandler({ type, data });
    }
  }
}
