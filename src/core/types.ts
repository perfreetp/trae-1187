export type ComparisonOp = '==' | '!=' | '>' | '<' | '>=' | '<=';

export interface Condition {
  var: string;
  op: ComparisonOp;
  value: string | number | boolean;
}

export interface ConditionGroup {
  type: 'and' | 'or';
  conditions: Array<Condition | ConditionGroup>;
}

export interface ActionSetVar {
  type: 'setVar';
  key: string;
  value: string | number | boolean;
  op?: 'set' | 'add' | 'sub' | 'mul';
}

export interface ActionAddItem {
  type: 'addItem';
  itemId: string;
  count: number;
}

export interface ActionRemoveItem {
  type: 'removeItem';
  itemId: string;
  count: number;
}

export interface ActionStartQuest {
  type: 'startQuest';
  questId: string;
}

export interface ActionCompleteObjective {
  type: 'completeObjective';
  questId: string;
  objectiveIndex: number;
}

export interface ActionCompleteQuest {
  type: 'completeQuest';
  questId: string;
}

export interface ActionFailQuest {
  type: 'failQuest';
  questId: string;
}

export interface ActionTriggerSound {
  type: 'triggerSound';
  soundId: string;
  loop?: boolean;
  volume?: number;
}

export interface ActionTriggerIllustration {
  type: 'triggerIllustration';
  illustrationId: string;
  duration?: number;
}

export interface ActionCustomPuzzle {
  type: 'customPuzzle';
  puzzleId: string;
  params?: Record<string, unknown>;
}

export type Action =
  | ActionSetVar
  | ActionAddItem
  | ActionRemoveItem
  | ActionStartQuest
  | ActionCompleteObjective
  | ActionCompleteQuest
  | ActionFailQuest
  | ActionTriggerSound
  | ActionTriggerIllustration
  | ActionCustomPuzzle;

export interface ChoiceOption {
  text: string;
  next: string;
  condition?: Condition | ConditionGroup;
  actions?: Action[];
  disabledText?: string;
  priority?: number;
}

export interface NodeDialogue {
  id: string;
  type: 'dialogue';
  speaker: string;
  text: string;
  actions?: Action[];
  next?: string;
  sound?: string;
  illustration?: string;
}

export interface NodeChoice {
  id: string;
  type: 'choice';
  text?: string;
  options: ChoiceOption[];
  timelimit?: number;
  defaultOption?: number;
  next?: string;
}

export interface NodeAction {
  id: string;
  type: 'action';
  actions: Action[];
  next?: string;
}

export interface NodeGoto {
  id: string;
  type: 'goto';
  chapter?: string;
  node: string;
}

export interface NodeEnding {
  id: string;
  type: 'ending';
  endingId: string;
  text?: string;
}

export interface NodePuzzle {
  id: string;
  type: 'puzzle';
  puzzleId: string;
  params?: Record<string, unknown>;
  successNext: string;
  successActions?: Action[];
  failureNext?: string;
  failureActions?: Action[];
  cancelNext?: string;
  cancelActions?: Action[];
}

export type StoryNode = NodeDialogue | NodeChoice | NodeAction | NodeGoto | NodeEnding | NodePuzzle;

export interface ChapterDef {
  id: string;
  title: string;
  nodes: StoryNode[];
}

export interface ItemDef {
  id: string;
  name: string;
  description?: string;
  stackable: boolean;
  maxStack?: number;
  icon?: string;
  data?: Record<string, unknown>;
}

export interface QuestDef {
  id: string;
  name: string;
  description?: string;
  objectives: string[];
}

export interface EndingDef {
  id: string;
  name: string;
  condition?: Condition | ConditionGroup;
  hidden?: boolean;
}

export interface CharacterDef {
  id: string;
  name: string;
  avatar?: string;
  tone?: string;
}

export interface I18nEntry {
  [locale: string]: Record<string, string>;
}

export interface NarrativeScript {
  meta: {
    title: string;
    version: string;
    language: string;
    languages?: string[];
    saveVersion?: string;
  };
  characters: Record<string, CharacterDef>;
  chapters: ChapterDef[];
  items: Record<string, ItemDef>;
  quests: Record<string, QuestDef>;
  endings: Record<string, EndingDef>;
  i18n?: I18nEntry;
}

export interface InventoryEntry {
  itemId: string;
  count: number;
}

export interface QuestState {
  questId: string;
  status: 'inactive' | 'active' | 'completed' | 'failed';
  completedObjectives: boolean[];
}

export interface PlayerChoiceRecord {
  chapterId: string;
  nodeId: string;
  optionIndex: number;
  optionText: string;
  localizedText?: string;
  expired: boolean;
  timestamp: number;
}

export interface AchievementState {
  id: string;
  name: string;
  description?: string;
  unlocked: boolean;
  unlockedAt?: number;
}

export interface Snapshot {
  version: string;
  scriptVersion?: string;
  timestamp: number;
  currentChapterId: string;
  currentNodeId: string;
  pendingState?: 'waiting_choice' | 'waiting_puzzle' | 'ended';
  pendingPuzzleNodeId?: string;
  variables: Record<string, string | number | boolean>;
  inventory: InventoryEntry[];
  quests: QuestState[];
  choiceHistory: PlayerChoiceRecord[];
  achievements: AchievementState[];
  visitedNodes: string[];
  dialogueHistory: DialogueLine[];
}

export interface LoadResult {
  success: boolean;
  error?: 'invalid_json' | 'version_mismatch' | 'structure_corrupted' | 'missing_fields' | 'invalid_state';
  message?: string;
}

export interface DialogueLine {
  speaker: string;
  speakerName: string;
  text: string;
  localizedText?: string;
  avatar?: string;
  tone?: string;
  illustration?: string;
  sound?: string;
  chapterId: string;
  nodeId: string;
  timestamp: number;
}

export type EventType =
  | 'dialogue'
  | 'choice'
  | 'choiceExpired'
  | 'chapterChange'
  | 'variableChange'
  | 'itemAdd'
  | 'itemRemove'
  | 'questStart'
  | 'questComplete'
  | 'questFail'
  | 'objectiveComplete'
  | 'sound'
  | 'illustration'
  | 'ending'
  | 'puzzle'
  | 'puzzleResolved'
  | 'error';

export interface NarrativeEvent {
  type: EventType;
  data: unknown;
}

export type EventHandler = (event: NarrativeEvent) => void;

export interface CharacterRegistration {
  avatar?: string;
  tone?: string;
}

export type PuzzleResult = 'success' | 'failure' | 'cancel';

export interface PuzzleHandler {
  puzzleId: string;
  handler: (params?: Record<string, unknown>) => Promise<PuzzleResult>;
}

export interface StoryTreeNode {
  nodeId: string;
  type: StoryNode['type'];
  chapterId: string;
  children: StoryTreeNode[];
  isDeadEnd: boolean;
}

export type ValidationSeverity = 'error' | 'warning';

export type ValidationIssueKind =
  | 'broken_link'
  | 'unreachable_ending'
  | 'infinite_loop'
  | 'unsatisfiable_condition'
  | 'all_options_disabled'
  | 'no_exit_from_loop'
  | 'dangling_node';

export interface ValidationPathStep {
  chapterId: string;
  nodeId: string;
  optionIndex?: number;
  optionText?: string;
}

export interface ValidationIssue {
  kind: ValidationIssueKind;
  severity: ValidationSeverity;
  message: string;
  chapterId: string;
  nodeId: string;
  path: ValidationPathStep[];
}

export interface SDKConfig {
  script: NarrativeScript;
  locale?: string;
  debug?: boolean;
  onEvent?: EventHandler;
}
