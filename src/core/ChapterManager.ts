import { ChapterDef, StoryNode } from './types';
import { ScriptParser } from './ScriptParser';

export class ChapterManager {
  private parser: ScriptParser;
  private currentChapterId: string;
  private chapterHistory: string[] = [];

  constructor(parser: ScriptParser, startChapterId?: string) {
    this.parser = parser;
    const chapters = parser.getChapters();
    this.currentChapterId = startChapterId || (chapters.length > 0 ? chapters[0].id : '');
  }

  getCurrentChapterId(): string {
    return this.currentChapterId;
  }

  getCurrentChapter(): ChapterDef | undefined {
    return this.parser.getChapter(this.currentChapterId);
  }

  getChapterTitle(chapterId?: string): string {
    const id = chapterId || this.currentChapterId;
    const chapter = this.parser.getChapter(id);
    return chapter ? chapter.title : '';
  }

  getChapterList(): Array<{ id: string; title: string; nodeCount: number }> {
    return this.parser.getChapters().map((ch) => ({
      id: ch.id,
      title: ch.title,
      nodeCount: ch.nodes.length,
    }));
  }

  goToChapter(chapterId: string): boolean {
    const chapter = this.parser.getChapter(chapterId);
    if (!chapter) return false;
    if (this.currentChapterId !== chapterId) {
      this.chapterHistory.push(this.currentChapterId);
    }
    this.currentChapterId = chapterId;
    return true;
  }

  goToPreviousChapter(): boolean {
    if (this.chapterHistory.length === 0) return false;
    this.currentChapterId = this.chapterHistory.pop()!;
    return true;
  }

  getChapterHistory(): string[] {
    return [...this.chapterHistory];
  }

  getFirstNode(): StoryNode | undefined {
    return this.parser.getFirstNodeOfChapter(this.currentChapterId);
  }

  findChapterOfNode(nodeId: string): string | undefined {
    return this.parser.findChapterOfNode(nodeId);
  }

  getChapterNodes(chapterId?: string): StoryNode[] {
    const chapter = this.parser.getChapter(chapterId || this.currentChapterId);
    return chapter ? chapter.nodes : [];
  }

  reset(startChapterId?: string): void {
    const chapters = this.parser.getChapters();
    this.currentChapterId = startChapterId || (chapters.length > 0 ? chapters[0].id : '');
    this.chapterHistory = [];
  }
}
