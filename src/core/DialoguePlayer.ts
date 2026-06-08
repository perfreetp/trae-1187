import {
  DialogueLine,
  StoryNode,
  NodeDialogue,
  CharacterRegistration,
  NarrativeEvent,
  EventHandler,
} from './types';
import { ScriptParser } from './ScriptParser';
import { ChapterManager } from './ChapterManager';

export class DialoguePlayer {
  private parser: ScriptParser;
  private chapterManager: ChapterManager;
  private characterRegistrations: Map<string, CharacterRegistration> = new Map();
  private dialogueHistory: DialogueLine[] = [];
  private eventHandler?: EventHandler;

  constructor(
    parser: ScriptParser,
    chapterManager: ChapterManager,
    eventHandler?: EventHandler
  ) {
    this.parser = parser;
    this.chapterManager = chapterManager;
    this.eventHandler = eventHandler;
  }

  registerCharacter(characterId: string, registration: CharacterRegistration): void {
    this.characterRegistrations.set(characterId, registration);
  }

  unregisterCharacter(characterId: string): void {
    this.characterRegistrations.delete(characterId);
  }

  getCharacterRegistration(characterId: string): CharacterRegistration | undefined {
    return this.characterRegistrations.get(characterId);
  }

  playNode(node: StoryNode): DialogueLine | null {
    if (node.type !== 'dialogue') return null;

    const dialogueNode = node as NodeDialogue;
    const character = this.parser.getCharacter(dialogueNode.speaker);
    const registration = this.characterRegistrations.get(dialogueNode.speaker);

    const line: DialogueLine = {
      speaker: dialogueNode.speaker,
      speakerName: character?.name || dialogueNode.speaker,
      text: dialogueNode.text,
      avatar: registration?.avatar || character?.avatar,
      tone: registration?.tone || character?.tone,
      illustration: dialogueNode.illustration,
      sound: dialogueNode.sound,
      chapterId: this.chapterManager.getCurrentChapterId(),
      nodeId: dialogueNode.id,
      timestamp: Date.now(),
    };

    this.dialogueHistory.push(line);

    this.emit('dialogue', line);

    if (dialogueNode.sound) {
      this.emit('sound', { soundId: dialogueNode.sound });
    }
    if (dialogueNode.illustration) {
      this.emit('illustration', { illustrationId: dialogueNode.illustration });
    }

    return line;
  }

  rollback(): DialogueLine | null {
    if (this.dialogueHistory.length <= 1) {
      return this.dialogueHistory[0] || null;
    }
    this.dialogueHistory.pop();
    return this.dialogueHistory[this.dialogueHistory.length - 1] || null;
  }

  rollbackTo(index: number): DialogueLine | null {
    if (index < 0 || index >= this.dialogueHistory.length) return null;
    this.dialogueHistory = this.dialogueHistory.slice(0, index + 1);
    return this.dialogueHistory[this.dialogueHistory.length - 1] || null;
  }

  getHistory(): DialogueLine[] {
    return [...this.dialogueHistory];
  }

  getLastLine(): DialogueLine | null {
    return this.dialogueHistory.length > 0
      ? this.dialogueHistory[this.dialogueHistory.length - 1]
      : null;
  }

  getHistoryCount(): number {
    return this.dialogueHistory.length;
  }

  clearHistory(): void {
    this.dialogueHistory = [];
  }

  setDialogueHistory(history: DialogueLine[]): void {
    this.dialogueHistory = [...history];
  }

  private emit(type: NarrativeEvent['type'], data: unknown): void {
    if (this.eventHandler) {
      this.eventHandler({ type, data });
    }
  }
}
