import {
  NodeChoice,
  ChoiceOption,
  Condition,
  ConditionGroup,
  PlayerChoiceRecord,
  NarrativeEvent,
  EventHandler,
} from './types';

export class ChoiceBranch {
  private variables: Map<string, string | number | boolean> = new Map();
  private choiceHistory: PlayerChoiceRecord[] = [];
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private eventHandler?: EventHandler;
  private localizeFn?: (text: string) => string;

  constructor(eventHandler?: EventHandler) {
    this.eventHandler = eventHandler;
  }

  setVariables(variables: Map<string, string | number | boolean>): void {
    this.variables = variables;
  }

  setLocalizeFn(fn: (text: string) => string): void {
    this.localizeFn = fn;
  }

  evaluateCondition(condition: Condition | ConditionGroup): boolean {
    if ('type' in condition && (condition.type === 'and' || condition.type === 'or')) {
      return this.evaluateConditionGroup(condition as ConditionGroup);
    }
    return this.evaluateSingleCondition(condition as Condition);
  }

  private evaluateSingleCondition(condition: Condition): boolean {
    const val = this.variables.get(condition.var);
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

  private evaluateConditionGroup(group: ConditionGroup): boolean {
    if (group.type === 'and') {
      return group.conditions.every((c) => this.evaluateCondition(c));
    }
    return group.conditions.some((c) => this.evaluateCondition(c));
  }

  getAvailableOptions(choiceNode: NodeChoice): Array<ChoiceOption & { index: number; disabled: boolean }> {
    const sorted = [...choiceNode.options]
      .map((opt, index) => ({ ...opt, index }));

    sorted.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    return sorted.map((opt) => {
      const conditionMet = !opt.condition || this.evaluateCondition(opt.condition);
      return { ...opt, disabled: !conditionMet };
    });
  }

  selectOption(
    choiceNode: NodeChoice,
    optionIndex: number,
    chapterId: string,
    expired: boolean = false
  ): { next: string; actions: ChoiceOption['actions'] } | null {
    const option = choiceNode.options[optionIndex];
    if (!option) return null;

    if (!expired) {
      const conditionMet = !option.condition || this.evaluateCondition(option.condition);
      if (!conditionMet) return null;
    }

    const localizedText = this.localizeFn ? this.localizeFn(option.text) : undefined;

    const record: PlayerChoiceRecord = {
      chapterId,
      nodeId: choiceNode.id,
      optionIndex,
      optionText: option.text,
      localizedText,
      expired,
      timestamp: Date.now(),
    };
    this.choiceHistory.push(record);

    this.emit(expired ? 'choiceExpired' : 'choice', record);

    this.clearTimer();

    return { next: option.next, actions: option.actions };
  }

  startTimer(
    timelimit: number,
    defaultOption: number,
    onExpire: (optionIndex: number) => void
  ): void {
    this.clearTimer();
    this.activeTimer = setTimeout(() => {
      onExpire(defaultOption);
      this.activeTimer = null;
    }, timelimit * 1000);
  }

  clearTimer(): void {
    if (this.activeTimer !== null) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
  }

  getChoiceHistory(): PlayerChoiceRecord[] {
    return [...this.choiceHistory];
  }

  setChoiceHistory(history: PlayerChoiceRecord[]): void {
    this.choiceHistory = [...history];
  }

  hasChosen(nodeId: string): boolean {
    return this.choiceHistory.some((r) => r.nodeId === nodeId);
  }

  getChoiceForNode(nodeId: string): PlayerChoiceRecord | undefined {
    return this.choiceHistory.find((r) => r.nodeId === nodeId);
  }

  private emit(type: NarrativeEvent['type'], data: unknown): void {
    if (this.eventHandler) {
      this.eventHandler({ type, data });
    }
  }
}
