import {
  NarrativeSDK,
  DebugRunner,
  NarrativeScript,
  SDKConfig,
  DialogueLine,
  NarrativeEvent,
  LoadResult,
  ValidationIssue,
  PuzzleResult,
  DebugStepInfo,
  MigrationFn,
} from './src/index';

const script: NarrativeScript = {
  meta: {
    title: '迷雾森林',
    version: '1.0.0',
    language: 'zh-CN',
    languages: ['zh-CN', 'en-US'],
    saveVersion: '1.0.0',
  },
  characters: {
    narrator: { id: 'narrator', name: '旁白' },
    elf: { id: 'elf', name: '精灵', tone: 'mysterious' },
    merchant: { id: 'merchant', name: '商人', tone: 'friendly' },
  },
  chapters: [
    {
      id: 'ch1',
      title: '序章：迷雾中的苏醒',
      nodes: [
        {
          id: 'start',
          type: 'dialogue',
          speaker: 'narrator',
          text: '你在一片被浓雾笼罩的森林中醒来，四周静得出奇。',
          illustration: 'forest_fog',
          sound: 'ambient_wind',
          next: 'look_around',
        },
        {
          id: 'look_around',
          type: 'dialogue',
          speaker: 'narrator',
          text: '远处隐约传来潺潺的流水声，而身后似乎有什么东西在注视着你。',
          next: 'first_choice',
        },
        {
          id: 'first_choice',
          type: 'choice',
          text: '你决定……',
          timelimit: 15,
          defaultOption: 1,
          options: [
            {
              text: '循着水声前进',
              condition: { var: 'courage', op: '>=', value: 3 },
              next: 'towards_river',
              actions: [
                { type: 'setVar', key: 'path', value: 'river' },
                { type: 'setVar', key: 'courage', value: 1, op: 'add' },
              ],
            },
            {
              text: '转身面对身后的注视',
              next: 'face_unknown',
              actions: [
                { type: 'setVar', key: 'path', value: 'unknown' },
                { type: 'setVar', key: 'courage', value: 2, op: 'add' },
              ],
            },
            {
              text: '留在原地等待雾散',
              next: 'wait_here',
              actions: [
                { type: 'setVar', key: 'path', value: 'wait' },
              ],
            },
          ],
        },
        {
          id: 'towards_river',
          type: 'dialogue',
          speaker: 'narrator',
          text: '你鼓起勇气走向河流。穿过几棵古树后，一条清澈的小溪出现在眼前。',
          next: 'meet_elf',
        },
        {
          id: 'face_unknown',
          type: 'dialogue',
          speaker: 'narrator',
          text: '你猛地转身，只见一个身着绿袍的身影从雾中显现。',
          next: 'meet_elf',
        },
        {
          id: 'wait_here',
          type: 'dialogue',
          speaker: 'narrator',
          text: '你选择等待。渐渐地，一个身影从雾中缓缓走来。',
          next: 'meet_elf',
        },
        {
          id: 'meet_elf',
          type: 'dialogue',
          speaker: 'elf',
          text: '迷途的旅人啊，这片森林已不再安全。暗影正在蔓延……',
          next: 'elf_quest',
        },
        {
          id: 'elf_quest',
          type: 'action',
          actions: [
            { type: 'startQuest', questId: 'main_quest' },
            { type: 'addItem', itemId: 'ancient_map', count: 1 },
            { type: 'triggerSound', soundId: 'item_receive' },
          ],
          next: 'rune_gate',
        },
        {
          id: 'rune_gate',
          type: 'puzzle',
          puzzleId: 'rune_gate',
          params: { difficulty: 'easy' },
          successNext: 'elf_choice',
          successActions: [
            { type: 'setVar', key: 'puzzle_solved', value: true },
            { type: 'setVar', key: 'courage', value: 1, op: 'add' },
          ],
          failureNext: 'puzzle_fail',
          failureActions: [
            { type: 'setVar', key: 'puzzle_solved', value: false },
          ],
          cancelNext: 'puzzle_cancel',
          cancelActions: [
            { type: 'setVar', key: 'puzzle_solved', value: false },
          ],
        },
        {
          id: 'puzzle_fail',
          type: 'dialogue',
          speaker: 'elf',
          text: '符文拒绝了你……不过我仍然可以指引你。',
          next: 'elf_choice',
        },
        {
          id: 'puzzle_cancel',
          type: 'dialogue',
          speaker: 'elf',
          text: '你犹豫了。没关系，勇气并非唯一的道路。',
          next: 'elf_choice',
        },
        {
          id: 'elf_choice',
          type: 'choice',
          text: '精灵递给你一张泛黄的地图，你……',
          options: [
            {
              text: '接受地图，踏上旅途',
              next: 'accept_quest',
              actions: [
                { type: 'completeObjective', questId: 'main_quest', objectiveIndex: 0 },
                { type: 'setVar', key: 'alliance', value: 'elf' },
              ],
            },
            {
              text: '询问更多关于暗影的事',
              next: 'ask_more',
              actions: [
                { type: 'setVar', key: 'knowledge', value: 1, op: 'add' },
              ],
            },
          ],
        },
        {
          id: 'ask_more',
          type: 'dialogue',
          speaker: 'elf',
          text: '暗影是一种古老的诅咒，它吞噬一切光明与记忆。只有传说中的三颗星石才能封印它。',
          next: 'accept_quest',
        },
        {
          id: 'accept_quest',
          type: 'dialogue',
          speaker: 'narrator',
          text: '你握紧地图，迈入了更深的森林。',
          actions: [
            { type: 'completeObjective', questId: 'main_quest', objectiveIndex: 0 },
          ],
          next: 'goto_ch2',
        },
        {
          id: 'goto_ch2',
          type: 'goto',
          chapter: 'ch2',
          node: 'ch2_start',
        },
      ],
    },
    {
      id: 'ch2',
      title: '第一章：星石之路',
      nodes: [
        {
          id: 'ch2_start',
          type: 'dialogue',
          speaker: 'narrator',
          text: '森林越来越密，空气中弥漫着一种奇异的甜香。',
          next: 'merchant_appear',
        },
        {
          id: 'merchant_appear',
          type: 'dialogue',
          speaker: 'merchant',
          text: '嘿！旅人！要来看看我的商品吗？或许有些东西能帮到你。',
          next: 'merchant_choice',
        },
        {
          id: 'merchant_choice',
          type: 'choice',
          text: '商人打开了行囊……',
          options: [
            {
              text: '购买治愈药水（需要勇气值>=2）',
              condition: { var: 'courage', op: '>=', value: 2 },
              next: 'buy_potion',
              actions: [
                { type: 'addItem', itemId: 'heal_potion', count: 1 },
              ],
            },
            {
              text: '只是路过，多谢',
              next: 'skip_merchant',
            },
          ],
        },
        {
          id: 'buy_potion',
          type: 'dialogue',
          speaker: 'merchant',
          text: '明智的选择！这瓶药水在关键时刻能救你一命。',
          next: 'continue_journey',
        },
        {
          id: 'skip_merchant',
          type: 'dialogue',
          speaker: 'merchant',
          text: '好吧，祝你好运。这片森林可不好走。',
          next: 'continue_journey',
        },
        {
          id: 'continue_journey',
          type: 'action',
          actions: [
            { type: 'completeObjective', questId: 'main_quest', objectiveIndex: 1 },
          ],
          next: 'ending_node',
        },
        {
          id: 'ending_node',
          type: 'ending',
          endingId: 'chapter1_end',
          text: '你继续踏上了寻找星石的旅途……（未完待续）',
        },
      ],
    },
  ],
  items: {
    ancient_map: {
      id: 'ancient_map',
      name: '古地图',
      description: '精灵赠予的泛黄地图，标注了星石的位置',
      stackable: false,
      icon: 'map_icon',
    },
    heal_potion: {
      id: 'heal_potion',
      name: '治愈药水',
      description: '散发着绿色光芒的药水，能恢复生命力',
      stackable: true,
      maxStack: 5,
      icon: 'potion_icon',
    },
    star_stone: {
      id: 'star_stone',
      name: '星石',
      description: '传说中的神秘宝石',
      stackable: true,
      maxStack: 3,
      icon: 'star_icon',
    },
  },
  quests: {
    main_quest: {
      id: 'main_quest',
      name: '封印暗影',
      description: '找到三颗星石，封印蔓延的暗影',
      objectives: ['接受精灵的指引', '穿越森林深处', '找到第一颗星石'],
    },
  },
  endings: {
    chapter1_end: {
      id: 'chapter1_end',
      name: '星石之路：序幕终章',
      condition: { var: 'courage', op: '>=', value: 2 },
    },
  },
  i18n: {
    'en-US': {
      '旁白': 'Narrator',
      '精灵': 'Elf',
      '商人': 'Merchant',
      '序章：迷雾中的苏醒': 'Prologue: Awakening in the Mist',
      '第一章：星石之路': 'Chapter 1: Path of the Starstone',
      '你在一片被浓雾笼罩的森林中醒来，四周静得出奇。': 'You wake up in a forest shrouded in thick fog. Everything is eerily quiet.',
      '远处隐约传来潺潺的流水声，而身后似乎有什么东西在注视着你。': 'In the distance, you hear the faint sound of flowing water, while something seems to be watching you from behind.',
      '循着水声前进': 'Follow the sound of water',
      '转身面对身后的注视': 'Turn and face the watcher',
      '留在原地等待雾散': 'Stay and wait for the fog to clear',
      '你猛地转身，只见一个身着绿袍的身影从雾中显现。': 'You turn sharply and see a figure in green robes materialize from the mist.',
      '迷途的旅人啊，这片森林已不再安全。暗影正在蔓延……': 'Lost traveler, this forest is no longer safe. Shadows are spreading...',
      '符文拒绝了你……不过我仍然可以指引你。': 'The runes rejected you... but I can still guide you.',
      '你犹豫了。没关系，勇气并非唯一的道路。': 'You hesitated. That is fine, courage is not the only path.',
      '接受地图，踏上旅途': 'Accept the map and begin the journey',
      '询问更多关于暗影的事': 'Ask more about the shadows',
      '暗影是一种古老的诅咒，它吞噬一切光明与记忆。只有传说中的三颗星石才能封印它。': 'The Shadow is an ancient curse that devours all light and memory. Only the legendary three Starstones can seal it.',
      '你握紧地图，迈入了更深的森林。': 'You grip the map and venture deeper into the forest.',
      '嘿！旅人！要来看看我的商品吗？或许有些东西能帮到你。': 'Hey traveler! Want to see my wares? Maybe something can help you.',
      '购买治愈药水（需要勇气值>=2）': 'Buy healing potion (requires courage>=2)',
      '只是路过，多谢': 'Just passing by, thanks',
      '明智的选择！这瓶药水在关键时刻能救你一命。': 'Wise choice! This potion can save your life at a crucial moment.',
      '好吧，祝你好运。这片森林可不好走。': 'Alright, good luck. This forest is not easy to navigate.',
      '森林越来越密，空气中弥漫着一种奇异的甜香。': 'The forest grows denser, and a strange sweet scent fills the air.',
      '古地图': 'Ancient Map',
      '精灵赠予的泛黄地图，标注了星石的位置': 'A yellowed map given by the elf, marking the locations of Starstones',
      '治愈药水': 'Healing Potion',
      '散发着绿色光芒的药水，能恢复生命力': 'A potion glowing green, capable of restoring vitality',
      '封印暗影': 'Seal the Shadow',
      '找到三颗星石，封印蔓延的暗影': 'Find the three Starstones and seal the spreading Shadow',
      '接受精灵的指引': 'Accept the elf\'s guidance',
      '穿越森林深处': 'Traverse the depths of the forest',
      '找到第一颗星石': 'Find the first Starstone',
      '星石之路：序幕终章': 'Path of the Starstone: Prologue Finale',
      '你继续踏上了寻找星石的旅途……（未完待续）': 'You continue your journey to find the Starstones... (To be continued)',
      '你决定……': 'You decide...',
      '精灵递给你一张泛黄的地图，你……': 'The elf hands you a yellowed map. You...',
      '商人打开了行囊……': 'The merchant opens his pack...',
    },
  },
};

function advance(sdk: NarrativeSDK): void {
  let line = sdk.continue();
  while (line) {
    if (sdk.getState() === 'waiting_choice' || sdk.getState() === 'waiting_puzzle' || sdk.getState() === 'ended') break;
    line = sdk.continue();
  }
}

function printPath(path: Array<{ chapterId: string; nodeId: string; optionIndex?: number; optionText?: string }> | undefined): string {
  if (!path || path.length === 0) return '(无)';
  return path.map((s) => {
    let str = `${s.chapterId}/${s.nodeId}`;
    if (s.optionIndex !== undefined) {
      str += ` 选项#${s.optionIndex}${s.optionText ? ` "${s.optionText}"` : ''}`;
    }
    return str;
  }).join(' → ');
}

console.log('=== 迷雾森林 - 文字冒险 SDK v4 演示 ===\n');

// ===== TEST 1: DebugRunner =====
console.log('=== 测试1: DebugRunner 调试运行器 ===');

const runner = new DebugRunner(script, 'zh-CN');
runner.getSDK().registerCharacter('elf', { avatar: 'elf_face', tone: 'mysterious' });
runner.getSDK().registerCharacter('merchant', { avatar: 'merchant_face', tone: 'friendly' });

function printStep(step: DebugStepInfo, label: string = ''): void {
  const tag = step.nodeType.toUpperCase();
  const prefix = label ? `[${label}] ` : '';
  console.log(`${prefix}步骤 #${step.stepIndex} [${tag}] ${step.chapterId}/${step.nodeId} (状态: ${step.state})`);
  if (step.dialogueLine) {
    const t = step.dialogueLine.localizedText || step.dialogueLine.text;
    console.log(`  💬 ${step.dialogueLine.speakerName}: ${t}`);
  }
  if (step.availableOptions) {
    for (const opt of step.availableOptions) {
      const d = opt.disabled ? ' [不可选]' : '';
      const c = opt.conditionDesc ? ` 条件: ${opt.conditionDesc}` : '';
      console.log(`  🔀 选项 ${opt.index + 1}${d}: ${opt.text}${c}`);
    }
  }
  if (step.puzzleInfo) {
    console.log(`  🧩 谜题: ${step.puzzleInfo.puzzleId} ${JSON.stringify(step.puzzleInfo.params || {})}`);
  }
  if (step.endingInfo) {
    console.log(`  🏁 结局: ${step.endingInfo.endingId} - ${step.endingInfo.name}`);
  }
  if (step.variableChanges.length) {
    console.log(`  变量变化: ${step.variableChanges.map((v) => `${v.key}: ${v.oldValue ?? 'undefined'} → ${v.newValue}`).join(', ')}`);
  }
  if (step.itemChanges.length) {
    console.log(`  物品变化: ${step.itemChanges.map((i) => `${i.change === 'add' ? '+' : '-'}${i.count} ${i.itemId}`).join(', ')}`);
  }
  if (step.questChanges.length) {
    console.log(`  任务变化: ${step.questChanges.map((q) => `${q.questId} ${q.change}${q.objectiveIndex !== undefined ? ` #${q.objectiveIndex}` : ''}`).join(', ')}`);
  }
}

let step = runner.start();
printStep(step, '开局');

while (step.state === 'running') {
  step = runner.step();
  printStep(step);
}

if (step.state === 'waiting_choice') {
  console.log('\n--- DebugRunner: 在选择前手动设置勇气值=5 ---');
  runner.setVariable('courage', 5);
  console.log('当前勇气值:', runner.getSDK().getVariable('courage'));
  console.log('\n--- DebugRunner: 手动添加治愈药水 x3 ---');
  runner.addItem('heal_potion', 3);
  console.log('当前背包:', runner.getSDK().getInventory().map((i) => `${i.name} x${i.count}`).join(', '));
  console.log('\n--- DebugRunner: 完成任务目标1 ---');
  runner.completeObjective('main_quest', 1);

  console.log('\n--- DebugRunner: 选择选项 #1 ---');
  step = runner.choose(0);
  printStep(step, '选择后');

  while (step.state === 'running') {
    step = runner.step();
    printStep(step);
  }
}

if (step.state === 'waiting_puzzle') {
  console.log('\n--- DebugRunner: 解谜成功 ---');
  step = runner.resolvePuzzle('success');
  printStep(step, '解谜后');

  while (step.state === 'running' || step.state === 'waiting_choice' || step.state === 'waiting_puzzle') {
    if (step.state === 'waiting_choice') {
      step = runner.choose(0);
      printStep(step, '选择后');
    } else if (step.state === 'waiting_puzzle') {
      step = runner.resolvePuzzle('success');
      printStep(step, '解谜后');
    } else {
      step = runner.step();
      printStep(step);
    }
  }
}

if (step.state === 'ended') {
  console.log(`\n--- DebugRunner 到达结局，步数: ${runner.getStepHistory().length} ---`);
}

// ===== TEST 2: Validation with routeFromStart and detail =====
console.log('\n=== 测试2: 剧情校验 - 包含 routeFromStart 和 detail ===');

const sdk1 = new NarrativeSDK({ script, debug: false });
const issues = sdk1.validateDeep();
if (issues.length === 0) {
  console.log('✅ 未发现剧情问题');
} else {
  for (const issue of issues) {
    const icon = issue.severity === 'error' ? '🔴' : '🟡';
    console.log(`${icon} [${issue.kind}] ${issue.message}`);
    if (issue.routeFromStart) {
      console.log(`   从起点路径: ${printPath(issue.routeFromStart)}`);
    }
    if (issue.detail) {
      console.log(`   详细分析: ${issue.detail}`);
    }
  }
}

// ===== TEST 3: Save Migration =====
console.log('\n=== 测试3: 存档版本迁移 ===');

const sdk2 = new NarrativeSDK({ script, debug: false });
sdk2.start();
advance(sdk2);
if (sdk2.getState() === 'waiting_choice') sdk2.makeChoice('first_choice', 1);
advance(sdk2);

const currentSnapshot = sdk2.save();
console.log(`当前存档版本: ${currentSnapshot.version}`);
console.log(`当前变量: ${JSON.stringify(currentSnapshot.variables)}`);
console.log(`当前物品: ${JSON.stringify(currentSnapshot.inventory)}`);
console.log(`当前节点: ${currentSnapshot.currentNodeId}`);

const oldSnapshot = {
  ...currentSnapshot,
  version: '0.9.0',
  variables: {
    old_path: 'unknown',
    old_courage: 5,
  },
  inventory: [
    { itemId: 'old_item_id', count: 2 },
  ],
  quests: currentSnapshot.quests.map((q) =>
    q.questId === 'main_quest' ? { ...q, questId: 'old_main_quest_id' } : q
  ),
};
console.log(`\n模拟旧存档 v${oldSnapshot.version}`);
console.log(`旧变量: ${JSON.stringify(oldSnapshot.variables)}`);
console.log(`旧物品: ${JSON.stringify(oldSnapshot.inventory)}`);
console.log(`旧任务: ${JSON.stringify(oldSnapshot.quests.map(q => q.questId))}`);

const sdk2b = new NarrativeSDK({ script, debug: false });
console.log('\n--- 未注册迁移时加载旧存档 ---');
const noMigrationResult = sdk2b.load({ ...oldSnapshot });
console.log(`加载结果: success=${noMigrationResult.success}, error=${noMigrationResult.error}, message=${noMigrationResult.message || ''}`);

console.log('\n--- 注册迁移函数 0.9.0 → 1.0.0 ---');
const migration090: MigrationFn = {
  fromVersion: '0.9.0',
  toVersion: '1.0.0',
  migrate: (snap) => {
    const newVars: Record<string, string | number | boolean> = {};
    const varMap: Record<string, string> = { old_path: 'path', old_courage: 'courage' };
    for (const [k, v] of Object.entries(snap.variables)) {
      const newKey = varMap[k] || k;
      newVars[newKey] = v;
    }
    const itemMap: Record<string, string> = { old_item_id: 'ancient_map' };
    const newInventory = snap.inventory.map((inv) => ({
      ...inv,
      itemId: itemMap[inv.itemId] || inv.itemId,
    }));
    const questMap: Record<string, string> = { old_main_quest_id: 'main_quest' };
    const newQuests = snap.quests.map((q) => ({
      ...q,
      questId: questMap[q.questId] || q.questId,
    }));
    return {
      ...snap,
      variables: newVars,
      inventory: newInventory,
      quests: newQuests,
    };
  },
};

const sdk2c = new NarrativeSDK({ script, debug: false });
sdk2c.registerMigration(migration090);

const migrationResult = sdk2c.load({ ...oldSnapshot });
console.log(`迁移后加载: success=${migrationResult.success}, error=${migrationResult.error || 'none'}`);
console.log(`迁移后变量: ${JSON.stringify(sdk2c.getVariableCondition().getAll())}`);
console.log(`迁移后物品: ${JSON.stringify(sdk2c.getInventoryManager().getAllEntries())}`);
console.log(`迁移后任务: ${JSON.stringify(sdk2c.getQuestSystem().getAllQuestStates().map(q => q.questId))}`);
console.log(`迁移后节点: ${sdk2c.getCurrentNodeId()}`);

console.log('\n--- 测试迁移失败时状态不被改动 ---');
const badMigration: MigrationFn = {
  fromVersion: '0.8.0',
  toVersion: '0.9.0',
  migrate: (snap) => {
    throw new Error('故意抛出的迁移错误');
  },
};
sdk2c.registerMigration(badMigration);
const badOldSnap = { ...oldSnapshot, version: '0.8.0' };
const badMigrationResult = sdk2c.load(badOldSnap);
console.log(`迁移失败: success=${badMigrationResult.success}, error=${badMigrationResult.error}`);
console.log(`迁移失败后节点未变: ${sdk2c.getCurrentNodeId() === currentSnapshot.currentNodeId ? '✅' : '❌'}`);
console.log(`迁移失败后变量未乱: ${JSON.stringify(sdk2c.getVariableCondition().getAll())}`);

// ===== TEST 4: Structured Debug Session Export =====
console.log('\n=== 测试4: 结构化调试会话导出 ===');

const sdk3 = new NarrativeSDK({ script, debug: true, locale: 'zh-CN' });
sdk3.registerCharacter('elf', { avatar: 'elf_face', tone: 'mysterious' });
sdk3.registerCharacter('merchant', { avatar: 'merchant_face', tone: 'friendly' });
sdk3.injectPuzzle({ puzzleId: 'rune_gate', handler: async () => 'success' });

sdk3.start();
advance(sdk3);
if (sdk3.getState() === 'waiting_choice') sdk3.makeChoice('first_choice', 1);
advance(sdk3);
if (sdk3.getState() === 'waiting_choice') sdk3.makeChoice(sdk3.getCurrentNodeId(), 0);
advance(sdk3);
if (sdk3.getState() === 'waiting_choice') sdk3.makeChoice(sdk3.getCurrentNodeId(), 0);
advance(sdk3);

const session = sdk3.exportSession();
console.log(`会话 - 剧本: ${session.scriptTitle} v${session.scriptVersion}`);
console.log(`语言: ${session.locale}, 总步骤: ${session.totalSteps}`);
console.log(`开始时间: ${new Date(session.startedAt).toLocaleString()}`);
console.log(`结束时间: ${session.endedAt ? new Date(session.endedAt).toLocaleString() : '未结束'}`);
console.log(`记录总数: ${session.records.length}`);

const typeCounts: Record<string, number> = {};
for (const r of session.records) {
  typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
}
console.log(`记录类型统计: ${JSON.stringify(typeCounts)}`);

console.log('\n关键事件记录:');
for (const r of session.records) {
  if (r.type === 'choice' || r.type === 'puzzle_result' || r.type === 'chapter_change' || r.type === 'ending') {
    console.log(`  [${r.type}] ${JSON.stringify(r.data)}`);
    if (r.stateSnapshot) {
      console.log(`    状态快照: 节点=${r.stateSnapshot.nodeId}, 变量数=${Object.keys(r.stateSnapshot.variables).length}`);
    }
  }
}

console.log('\n会话 JSON 前 500 字符:');
console.log(sdk3.exportSessionJSON().slice(0, 500) + '...');

// ===== TEST 5: Problematic script - deeper validation =====
console.log('\n=== 测试5: 问题脚本深度校验 (含变量设置时机/增量分析) ===');

const problematicScript: NarrativeScript = {
  meta: { title: '问题测试剧本', version: '1.0.0', language: 'zh-CN', saveVersion: '1.0.0' },
  characters: {},
  chapters: [
    {
      id: 'test_ch',
      title: '测试章节',
      nodes: [
        { id: 't_start', type: 'dialogue', speaker: 'narrator', text: '开始', next: 't_choice1' },
        {
          id: 't_choice1',
          type: 'choice',
          options: [
            {
              text: '选项A - 变量从未设置',
              next: 't_mid_a',
              condition: { var: 'never_set_var', op: '==', value: true },
            },
            {
              text: '选项B - 增量总和不够 (最大+1,要求>10)',
              next: 't_mid_b',
              condition: { var: 'tiny_score', op: '>', value: 10 },
              actions: [
                { type: 'setVar', key: 'tiny_score', value: 1, op: 'add' },
              ],
            },
            {
              text: '选项C - 变量只在选项之后设置',
              next: 't_mid_c',
              condition: { var: 'after_choice', op: '==', value: 42 },
            },
            {
              text: '选项D - 正常',
              next: 't_loop_entry',
            },
          ],
        },
        {
          id: 't_mid_c',
          type: 'action',
          actions: [{ type: 'setVar', key: 'after_choice', value: 42 }],
          next: 't_loop_entry',
        },
        {
          id: 't_mid_a',
          type: 'dialogue',
          speaker: 'narrator',
          text: '中间A',
          next: 't_loop_entry',
        },
        {
          id: 't_mid_b',
          type: 'dialogue',
          speaker: 'narrator',
          text: '中间B',
          next: 't_loop_entry',
        },
        {
          id: 't_loop_entry',
          type: 'choice',
          options: [
            { text: '进入循环', next: 't_loop_a' },
            { text: '走向死路分支（到不了结局）', next: 't_dead_end' },
          ],
        },
        { id: 't_loop_a', type: 'dialogue', speaker: 'narrator', text: '循环节点A', next: 't_loop_b' },
        {
          id: 't_loop_b',
          type: 'choice',
          options: [
            { text: '继续循环', next: 't_loop_a' },
            { text: '出口 - 到不了结局', next: 't_dead_end' },
          ],
        },
        { id: 't_dead_end', type: 'dialogue', speaker: 'narrator', text: '一条走不到结局的路', next: 't_dead_end_2' },
        { id: 't_dead_end_2', type: 'dialogue', speaker: 'narrator', text: '还是走不到', next: 't_dead_end_3' },
        { id: 't_dead_end_3', type: 'dangling_node_test' as unknown as 'dialogue', speaker: 'narrator', text: '悬垂' },
      ],
    },
  ],
  items: {},
  quests: {},
  endings: {
    test_end: { id: 'test_end', name: '测试结局' },
  },
};

const problematicSDK = new NarrativeSDK({ script: problematicScript, debug: false });
const problemIssues = problematicSDK.validateDeep();
if (problemIssues.length === 0) {
  console.log('未发现问题');
} else {
  for (const issue of problemIssues) {
    const icon = issue.severity === 'error' ? '🔴' : '🟡';
    console.log(`${icon} [${issue.kind}] ${issue.message}`);
    if (issue.routeFromStart) {
      console.log(`   从起点路径: ${printPath(issue.routeFromStart)}`);
    }
    if (issue.detail) {
      console.log(`   详细分析: ${issue.detail}`);
    }
    if (issue.path && issue.path.length > 0) {
      console.log(`   问题链路: ${printPath(issue.path)}`);
    }
    console.log('');
  }
}

// ===== TEST 6: Cycle detection with valid exit =====
console.log('\n=== 测试6: 有结局可达出口的循环不报死循环 ===');

const goodCycleScript: NarrativeScript = {
  meta: { title: '良性循环剧本', version: '1.0.0', language: 'zh-CN', saveVersion: '1.0.0' },
  characters: {},
  chapters: [
    {
      id: 'gc',
      title: '良性循环',
      nodes: [
        { id: 'g_start', type: 'dialogue', speaker: 'narrator', text: '开始', next: 'g_choice' },
        {
          id: 'g_choice',
          type: 'choice',
          options: [
            { text: '进循环看风景', next: 'g_loop1' },
            { text: '直接去结局', next: 'g_end' },
          ],
        },
        { id: 'g_loop1', type: 'dialogue', speaker: 'narrator', text: '循环1', next: 'g_loop2' },
        {
          id: 'g_loop2',
          type: 'choice',
          options: [
            { text: '再看一次风景', next: 'g_loop1' },
            { text: '前往结局', next: 'g_end' },
          ],
        },
        { id: 'g_end', type: 'ending', endingId: 'good_end' },
      ],
    },
  ],
  items: {},
  quests: {},
  endings: { good_end: { id: 'good_end', name: '好结局' } },
};

const goodCycleSDK = new NarrativeSDK({ script: goodCycleScript, debug: false });
const goodIssues = goodCycleSDK.validateDeep();
const cycleIssues = goodIssues.filter((i) => i.kind === 'no_exit_from_loop' || i.kind === 'infinite_loop');
if (cycleIssues.length === 0) {
  console.log('✅ 有结局可达出口的循环没有被误报为死循环');
} else {
  console.log('❌ 循环校验误报:');
  for (const ci of cycleIssues) {
    console.log(`  [${ci.kind}] ${ci.message}`);
  }
}
if (goodIssues.length > 0) {
  console.log(`良性循环剧本共 ${goodIssues.length} 条非循环相关问题:`);
  for (const gi of goodIssues) {
    if (gi.kind !== 'no_exit_from_loop' && gi.kind !== 'infinite_loop') {
      console.log(`  [${gi.kind}] ${gi.message}`);
    }
  }
}

console.log('\n✅ SDK v4 演示完成');
