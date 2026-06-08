import {
  ActionSetVar,
  Condition,
  ConditionGroup,
  NarrativeEvent,
  EventHandler,
} from './types';

export class VariableCondition {
  private store: Map<string, string | number | boolean> = new Map();
  private eventHandler?: EventHandler;

  constructor(eventHandler?: EventHandler) {
    this.eventHandler = eventHandler;
  }

  set(key: string, value: string | number | boolean): void {
    const old = this.store.get(key);
    this.store.set(key, value);
    if (old !== value) {
      this.emit('variableChange', { key, oldValue: old, newValue: value });
    }
  }

  get(key: string): string | number | boolean | undefined {
    return this.store.get(key);
  }

  getNumber(key: string): number {
    const val = this.store.get(key);
    return typeof val === 'number' ? val : 0;
  }

  getString(key: string): string {
    const val = this.store.get(key);
    return typeof val === 'string' ? val : '';
  }

  getBoolean(key: string): boolean {
    const val = this.store.get(key);
    return typeof val === 'boolean' ? val : false;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  remove(key: string): boolean {
    return this.store.delete(key);
  }

  applyAction(action: ActionSetVar): void {
    const current = this.store.get(action.key);
    switch (action.op || 'set') {
      case 'set':
        this.set(action.key, action.value);
        break;
      case 'add':
        this.set(action.key, (typeof current === 'number' ? current : 0) + (action.value as number));
        break;
      case 'sub':
        this.set(action.key, (typeof current === 'number' ? current : 0) - (action.value as number));
        break;
      case 'mul':
        this.set(action.key, (typeof current === 'number' ? current : 0) * (action.value as number));
        break;
    }
  }

  evaluate(condition: Condition | ConditionGroup): boolean {
    if ('type' in condition && (condition.type === 'and' || condition.type === 'or')) {
      return this.evaluateGroup(condition as ConditionGroup);
    }
    return this.evaluateSingle(condition as Condition);
  }

  private evaluateSingle(condition: Condition): boolean {
    const val = this.store.get(condition.var);
    if (val === undefined) return false;
    const target = condition.value;
    switch (condition.op) {
      case '==':
        return val === target;
      case '!=':
        return val !== target;
      case '>':
        return (val as number) > (target as number);
      case '<':
        return (val as number) < (target as number);
      case '>=':
        return (val as number) >= (target as number);
      case '<=':
        return (val as number) <= (target as number);
      default:
        return false;
    }
  }

  private evaluateGroup(group: ConditionGroup): boolean {
    if (group.type === 'and') {
      return group.conditions.every((c) => this.evaluate(c));
    }
    return group.conditions.some((c) => this.evaluate(c));
  }

  getAll(): Record<string, string | number | boolean> {
    const result: Record<string, string | number | boolean> = {};
    this.store.forEach((v, k) => {
      result[k] = v;
    });
    return result;
  }

  setAll(vars: Record<string, string | number | boolean>): void {
    for (const [k, v] of Object.entries(vars)) {
      this.store.set(k, v);
    }
  }

  clear(): void {
    this.store.clear();
  }

  private emit(type: NarrativeEvent['type'], data: unknown): void {
    if (this.eventHandler) {
      this.eventHandler({ type, data });
    }
  }
}
