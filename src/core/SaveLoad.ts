import {
  Snapshot,
  LoadResult,
  DialogueLine,
  AchievementState,
} from './types';
import { VariableCondition } from './VariableCondition';
import { Inventory } from './Inventory';
import { QuestSystem } from './QuestSystem';
import { DialoguePlayer } from './DialoguePlayer';
import { ChoiceBranch } from './ChoiceBranch';
import { ChapterManager } from './ChapterManager';

const SAVE_VERSION = '1.0.0';
const COMPATIBLE_VERSIONS = ['1.0.0'];

export class SaveLoad {
  private variableCondition: VariableCondition;
  private inventory: Inventory;
  private questSystem: QuestSystem;
  private dialoguePlayer: DialoguePlayer;
  private choiceBranch: ChoiceBranch;
  private chapterManager: ChapterManager;
  private visitedNodes: Set<string> = new Set();
  private achievements: Map<string, AchievementState> = new Map();
  private scriptVersion?: string;
  private snapshotValidator?: (snapshot: Snapshot) => LoadResult | null;

  constructor(
    variableCondition: VariableCondition,
    inventory: Inventory,
    questSystem: QuestSystem,
    dialoguePlayer: DialoguePlayer,
    choiceBranch: ChoiceBranch,
    chapterManager: ChapterManager,
    scriptVersion?: string,
    snapshotValidator?: (snapshot: Snapshot) => LoadResult | null
  ) {
    this.variableCondition = variableCondition;
    this.inventory = inventory;
    this.questSystem = questSystem;
    this.dialoguePlayer = dialoguePlayer;
    this.choiceBranch = choiceBranch;
    this.chapterManager = chapterManager;
    this.scriptVersion = scriptVersion;
    this.snapshotValidator = snapshotValidator;
  }

  createSnapshot(currentNodeId: string, pendingState?: string, pendingPuzzleNodeId?: string | null): Snapshot {
    const snapshot: Snapshot = {
      version: SAVE_VERSION,
      scriptVersion: this.scriptVersion,
      timestamp: Date.now(),
      currentChapterId: this.chapterManager.getCurrentChapterId(),
      currentNodeId,
      variables: this.variableCondition.getAll(),
      inventory: this.inventory.getAllEntries(),
      quests: this.questSystem.getAllQuestStates(),
      choiceHistory: this.choiceBranch.getChoiceHistory(),
      achievements: Array.from(this.achievements.values()),
      visitedNodes: Array.from(this.visitedNodes),
      dialogueHistory: this.dialoguePlayer.getHistory(),
    };
    if (pendingState) {
      snapshot.pendingState = pendingState as 'waiting_choice' | 'waiting_puzzle' | 'ended';
    }
    if (pendingPuzzleNodeId) {
      snapshot.pendingPuzzleNodeId = pendingPuzzleNodeId;
    }
    return snapshot;
  }

  restoreSnapshot(snapshot: Snapshot): LoadResult {
    const validation = this.validateSnapshot(snapshot);
    if (!validation.success) return validation;

    if (this.snapshotValidator) {
      const extResult = this.snapshotValidator(snapshot);
      if (extResult && !extResult.success) return extResult;
    }

    const backup = this.createBackup();

    try {
      this.doRestore(snapshot);
      return { success: true };
    } catch (err) {
      this.doRestoreBackup(backup);
      return {
        success: false,
        error: 'structure_corrupted',
        message: `Restore failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private validateSnapshot(snapshot: Snapshot): LoadResult {
    if (!snapshot || typeof snapshot !== 'object') {
      return { success: false, error: 'structure_corrupted', message: 'Snapshot is not a valid object' };
    }

    if (!snapshot.version || typeof snapshot.version !== 'string') {
      return { success: false, error: 'missing_fields', message: 'Snapshot missing version field' };
    }

    if (!COMPATIBLE_VERSIONS.includes(snapshot.version)) {
      return {
        success: false,
        error: 'version_mismatch',
        message: `Save version ${snapshot.version} is not compatible. Supported: ${COMPATIBLE_VERSIONS.join(', ')}`,
      };
    }

    if (this.scriptVersion && snapshot.scriptVersion && snapshot.scriptVersion !== this.scriptVersion) {
      return {
        success: false,
        error: 'version_mismatch',
        message: `Script version mismatch: save was created with script v${snapshot.scriptVersion}, current script is v${this.scriptVersion}`,
      };
    }

    if (!snapshot.currentChapterId || typeof snapshot.currentChapterId !== 'string') {
      return { success: false, error: 'missing_fields', message: 'Snapshot missing currentChapterId' };
    }

    if (!snapshot.currentNodeId || typeof snapshot.currentNodeId !== 'string') {
      return { success: false, error: 'missing_fields', message: 'Snapshot missing currentNodeId' };
    }

    if (!snapshot.variables || typeof snapshot.variables !== 'object') {
      return { success: false, error: 'missing_fields', message: 'Snapshot missing variables' };
    }

    if (!Array.isArray(snapshot.inventory)) {
      return { success: false, error: 'missing_fields', message: 'Snapshot missing inventory' };
    }

    if (!Array.isArray(snapshot.quests)) {
      return { success: false, error: 'missing_fields', message: 'Snapshot missing quests' };
    }

    if (!Array.isArray(snapshot.choiceHistory)) {
      return { success: false, error: 'missing_fields', message: 'Snapshot missing choiceHistory' };
    }

    if (!Array.isArray(snapshot.achievements)) {
      return { success: false, error: 'missing_fields', message: 'Snapshot missing achievements' };
    }

    if (!Array.isArray(snapshot.visitedNodes)) {
      return { success: false, error: 'missing_fields', message: 'Snapshot missing visitedNodes' };
    }

    if (!Array.isArray(snapshot.dialogueHistory)) {
      return { success: false, error: 'missing_fields', message: 'Snapshot missing dialogueHistory' };
    }

    return { success: true };
  }

  private createBackup(): Snapshot {
    return {
      version: SAVE_VERSION,
      scriptVersion: this.scriptVersion,
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

  private doRestore(snapshot: Snapshot): void {
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

  private doRestoreBackup(backup: Snapshot): void {
    this.variableCondition.clear();
    this.variableCondition.setAll(backup.variables);

    this.inventory.clear();
    this.inventory.setEntries(backup.inventory);

    this.questSystem.clear();
    this.questSystem.setQuestStates(backup.quests);

    this.choiceBranch.setChoiceHistory(backup.choiceHistory);

    this.dialoguePlayer.clearHistory();
    this.dialoguePlayer.setDialogueHistory(backup.dialogueHistory);

    this.chapterManager.goToChapter(backup.currentChapterId);

    this.visitedNodes.clear();
    for (const nodeId of backup.visitedNodes) {
      this.visitedNodes.add(nodeId);
    }

    this.achievements.clear();
    for (const ach of backup.achievements) {
      this.achievements.set(ach.id, { ...ach });
    }
  }

  markNodeVisited(nodeId: string): void {
    this.visitedNodes.add(nodeId);
  }

  getSaveVersion(): string {
    return SAVE_VERSION;
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

  serialize(currentNodeId: string, pendingState?: string, pendingPuzzleNodeId?: string | null): string {
    return JSON.stringify(this.createSnapshot(currentNodeId, pendingState, pendingPuzzleNodeId));
  }

  deserialize(json: string): LoadResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { success: false, error: 'invalid_json', message: 'Failed to parse save data as JSON' };
    }

    const result = this.restoreSnapshot(parsed as Snapshot);
    if (!result.success) {
      return result;
    }

    return { success: true };
  }

  getCurrentNodeId(json: string): string | undefined {
    try {
      const parsed = JSON.parse(json) as Snapshot;
      return parsed.currentNodeId;
    } catch {
      return undefined;
    }
  }
}
