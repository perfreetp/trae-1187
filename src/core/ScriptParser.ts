import {
  NarrativeScript,
  ChapterDef,
  StoryNode,
  ItemDef,
  QuestDef,
  EndingDef,
  CharacterDef,
} from './types';

export class ScriptParser {
  private script: NarrativeScript;
  private nodeMap: Map<string, StoryNode> = new Map();
  private chapterMap: Map<string, ChapterDef> = new Map();

  constructor(script: NarrativeScript) {
    this.script = script;
    this.buildMaps();
  }

  private buildMaps(): void {
    for (const chapter of this.script.chapters) {
      this.chapterMap.set(chapter.id, chapter);
      for (const node of chapter.nodes) {
        this.nodeMap.set(node.id, node);
      }
    }
  }

  getScript(): NarrativeScript {
    return this.script;
  }

  getChapter(chapterId: string): ChapterDef | undefined {
    return this.chapterMap.get(chapterId);
  }

  getNode(nodeId: string): StoryNode | undefined {
    return this.nodeMap.get(nodeId);
  }

  getChapters(): ChapterDef[] {
    return this.script.chapters;
  }

  getItem(itemId: string): ItemDef | undefined {
    return this.script.items[itemId];
  }

  getItems(): Record<string, ItemDef> {
    return this.script.items;
  }

  getQuest(questId: string): QuestDef | undefined {
    return this.script.quests[questId];
  }

  getQuests(): Record<string, QuestDef> {
    return this.script.quests;
  }

  getEnding(endingId: string): EndingDef | undefined {
    return this.script.endings[endingId];
  }

  getEndings(): Record<string, EndingDef> {
    return this.script.endings;
  }

  getCharacter(characterId: string): CharacterDef | undefined {
    return this.script.characters[characterId];
  }

  getCharacters(): Record<string, CharacterDef> {
    return this.script.characters;
  }

  getFirstNodeOfChapter(chapterId: string): StoryNode | undefined {
    const chapter = this.chapterMap.get(chapterId);
    if (!chapter || chapter.nodes.length === 0) return undefined;
    return chapter.nodes[0];
  }

  findChapterOfNode(nodeId: string): string | undefined {
    for (const chapter of this.script.chapters) {
      for (const node of chapter.nodes) {
        if (node.id === nodeId) return chapter.id;
      }
    }
    return undefined;
  }

  getAllNodeIds(): string[] {
    return Array.from(this.nodeMap.keys());
  }

  getAllNodeReferences(): string[] {
    const refs = new Set<string>();
    for (const node of this.nodeMap.values()) {
      switch (node.type) {
        case 'dialogue':
          if (node.next) refs.add(node.next);
          break;
        case 'choice':
          for (const opt of node.options) {
            refs.add(opt.next);
          }
          if (node.next) refs.add(node.next);
          break;
        case 'action':
          if (node.next) refs.add(node.next);
          break;
        case 'goto':
          refs.add(node.node);
          break;
        case 'ending':
          break;
      }
    }
    return Array.from(refs);
  }

  getI18nText(key: string, locale: string): string | undefined {
    if (!this.script.i18n || !this.script.i18n[locale]) return undefined;
    return this.script.i18n[locale][key];
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.script.meta.title) {
      errors.push('Script meta.title is required');
    }
    if (!this.script.meta.version) {
      errors.push('Script meta.version is required');
    }
    if (!this.script.chapters || this.script.chapters.length === 0) {
      errors.push('Script must have at least one chapter');
    }

    const allNodeIds = new Set<string>();
    for (const chapter of this.script.chapters) {
      if (!chapter.id) errors.push(`Chapter missing id`);
      if (!chapter.nodes || chapter.nodes.length === 0) {
        errors.push(`Chapter "${chapter.id}" has no nodes`);
      }
      for (const node of chapter.nodes) {
        if (!node.id) {
          errors.push(`Node in chapter "${chapter.id}" missing id`);
          continue;
        }
        if (allNodeIds.has(node.id)) {
          errors.push(`Duplicate node id: "${node.id}"`);
        }
        allNodeIds.add(node.id);

        if (node.type === 'choice') {
          if (!node.options || node.options.length === 0) {
            errors.push(`Choice node "${node.id}" has no options`);
          }
        }
      }
    }

    const referenced = this.getAllNodeReferences();
    for (const ref of referenced) {
      if (!allNodeIds.has(ref)) {
        errors.push(`Referenced node "${ref}" does not exist`);
      }
    }

    for (const [itemId, item] of Object.entries(this.script.items || {})) {
      if (!item.name) errors.push(`Item "${itemId}" missing name`);
    }

    for (const [questId, quest] of Object.entries(this.script.quests || {})) {
      if (!quest.name) errors.push(`Quest "${questId}" missing name`);
      if (!quest.objectives || quest.objectives.length === 0) {
        errors.push(`Quest "${questId}" has no objectives`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
