import {
  InventoryEntry,
  ItemDef,
  NarrativeEvent,
  EventHandler,
} from './types';
import { ScriptParser } from './ScriptParser';

export class Inventory {
  private parser: ScriptParser;
  private entries: Map<string, InventoryEntry> = new Map();
  private eventHandler?: EventHandler;

  constructor(parser: ScriptParser, eventHandler?: EventHandler) {
    this.parser = parser;
    this.eventHandler = eventHandler;
  }

  addItem(itemId: string, count: number = 1): boolean {
    const def = this.parser.getItem(itemId);
    if (!def) return false;

    const existing = this.entries.get(itemId);
    if (existing) {
      if (def.stackable) {
        const maxStack = def.maxStack ?? Infinity;
        existing.count = Math.min(existing.count + count, maxStack);
      }
    } else {
      this.entries.set(itemId, { itemId, count: Math.min(count, def.maxStack ?? Infinity) });
    }

    this.emit('itemAdd', { itemId, count });
    return true;
  }

  removeItem(itemId: string, count: number = 1): boolean {
    const existing = this.entries.get(itemId);
    if (!existing || existing.count < count) return false;

    existing.count -= count;
    if (existing.count <= 0) {
      this.entries.delete(itemId);
    }

    this.emit('itemRemove', { itemId, count });
    return true;
  }

  hasItem(itemId: string, count: number = 1): boolean {
    const entry = this.entries.get(itemId);
    return entry !== undefined && entry.count >= count;
  }

  getCount(itemId: string): number {
    return this.entries.get(itemId)?.count ?? 0;
  }

  getEntry(itemId: string): InventoryEntry | undefined {
    return this.entries.get(itemId);
  }

  getAllEntries(): InventoryEntry[] {
    return Array.from(this.entries.values());
  }

  getItemDef(itemId: string): ItemDef | undefined {
    return this.parser.getItem(itemId);
  }

  clear(): void {
    this.entries.clear();
  }

  setEntries(entries: InventoryEntry[]): void {
    this.entries.clear();
    for (const entry of entries) {
      this.entries.set(entry.itemId, { ...entry });
    }
  }

  getTotalUniqueItems(): number {
    return this.entries.size;
  }

  getTotalItemCount(): number {
    let total = 0;
    this.entries.forEach((e) => (total += e.count));
    return total;
  }

  private emit(type: NarrativeEvent['type'], data: unknown): void {
    if (this.eventHandler) {
      this.eventHandler({ type, data });
    }
  }
}
