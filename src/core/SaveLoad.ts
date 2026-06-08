import {
  Snapshot,
  DialogueLine,
  InventoryEntry,
  QuestState,
  PlayerChoiceRecord,
  AchievementState,
} from './types';
import { VariableCondition } from './VariableCondition';
import { Inventory } from './Inventory';
import { QuestSystem } from './QuestSystem';
import { DialoguePlayer } from './DialoguePlayer';
import { ChoiceBranch } from './ChoiceBranch';
import { ChapterManager } from './ChapterManager';

export class SaveLoad {
  private variableCondition: VariableCondition;
  private inventory: Inventory;
  private questSystem: QuestSystem;
  private dialoguePlayer: DialoguePlayer;
  private choiceBranch: ChoiceBranch;
  private chapterManager: ChapterManager;
  private visitedNodes: Set<string> = new Set();
  private achievements: Map<string, AchievementState> = new Map();

  constructor(
    variableCondition: VariableCondition,
    inventory: Inventory,
    questSystem: QuestSystem,
    dialoguePlayer: DialoguePlayer,
    choiceBranch: ChoiceBranch,
    chapterManager: ChapterManager
  ) {
    this.variableCondition = variableCondition;
    this.inventory = inventory;
    this.questSystem = questSystem;
    this.dialoguePlayer = dialoguePlayer;
    this.choiceBranch = choiceBranch;
    this.chapterManager = chapterManager;
  }

  createSnapshot(): Snapshot {
    return {
      version: '1.0.0',
      timestamp: Date.now(),
      currentChapterId: this.chapterManager.getCurrentChapterId(),
      currentNodeId: '',
      variables: this.variableCondition.getAll(),
      inventory: this.inventory.getAllEntries(),
      quests: this.questSystem.getAllQuestStates(),
      choiceHistory: this.choiceBranch.getChoiceHistory(),
      achievements: Array.from(this.achievements.values()),
      visitedNodes: Array.from(this.visitedNodes),
      dialogueHistory: this.dialoguePlayer.getHistory(),
    };
  }

  restoreSnapshot(snapshot: Snapshot): void {
    this.variableCondition.clear();
    this.variableCondition.setAll(snapshot.variables);

    this.inventory.clear();
    this.inventory.setEntries(snapshot.inventory);

    this.questSystem.clear();
    this.questSystem.setQuestStates(snapshot.quests);

    this.choiceBranch.setChoiceHistory(snapshot.choiceHistory);

    this.dialoguePlayer.clearHistory();
    this.dialoguePlayer.setDialogueHistory(snapshot.dialogueHistory);

    this.chapterManager.goToChapter(snapshot.currentChapterId);

    this.visitedNodes.clear();
    for (const nodeId of snapshot.visitedNodes) {
      this.visitedNodes.add(nodeId);
    }

    this.achievements.clear();
    for (const ach of snapshot.achievements) {
      this.achievements.set(ach.id, { ...ach });
    }
  }

  markNodeVisited(nodeId: string): void {
    this.visitedNodes.add(nodeId);
  }

  isNodeVisited(nodeId: string): boolean {
    return this.visitedNodes.has(nodeId);
  }

  getVisitedNodes(): string[] {
    return Array.from(this.visitedNodes);
  }

  unlockAchievement(id: string, name: string, description?: string): boolean {
    if (this.achievements.has(id)) return false;
    this.achievements.set(id, {
      id,
      name,
      description,
      unlocked: true,
      unlockedAt: Date.now(),
    });
    return true;
  }

  isAchievementUnlocked(id: string): boolean {
    return this.achievements.get(id)?.unlocked ?? false;
  }

  getAchievementProgress(): AchievementState[] {
    return Array.from(this.achievements.values());
  }

  getAchievement(id: string): AchievementState | undefined {
    return this.achievements.get(id);
  }

  serialize(): string {
    return JSON.stringify(this.createSnapshot());
  }

  deserialize(json: string): boolean {
    try {
      const snapshot: Snapshot = JSON.parse(json);
      this.restoreSnapshot(snapshot);
      return true;
    } catch {
      return false;
    }
  }
}
