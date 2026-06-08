import {
  NarrativeSDK,
  NarrativeScript,
  SDKConfig,
  DialogueLine,
  NarrativeEvent,
  LoadResult,
  ValidationIssue,
  PuzzleResult,
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

function createSDK(): NarrativeSDK {
  return new NarrativeSDK({
    script,
    locale: 'zh-CN',
    debug: true,
    onEvent: (event: NarrativeEvent) => {
      switch (event.type) {
        case 'dialogue': {
          const line = event.data as DialogueLine;
          const displayText = line.localizedText || line.text;
          const avatarTag = line.avatar ? `[${line.avatar}] ` : '';
          const toneTag = line.tone ? `<${line.tone}> ` : '';
          console.log(`📖 ${avatarTag}${toneTag}${line.speakerName}: ${displayText}`);
          break;
        }
        case 'choice': {
          const choiceData = event.data as { nodeId: string; options: Array<{ text: string; disabled: boolean; index: number }>; timelimit?: number };
          console.log('\n🔀 请选择:');
          choiceData.options.forEach((opt) => {
            const disabled = opt.disabled ? ' [不可选]' : '';
            console.log(`  ${opt.index + 1}. ${opt.text}${disabled}`);
          });
          if (choiceData.timelimit) {
            console.log(`  ⏱️ 限时 ${choiceData.timelimit} 秒`);
          }
          break;
        }
        case 'choiceExpired':
          console.log('⏱️ 选择时间已到，自动选择默认选项！');
          break;
        case 'sound':
          console.log(`🔊 音效: ${(event.data as { soundId: string }).soundId}`);
          break;
        case 'illustration':
          console.log(`🖼️ 插图: ${(event.data as { illustrationId: string }).illustrationId}`);
          break;
        case 'itemAdd':
          console.log(`🎒 获得物品: ${(event.data as { itemId: string }).itemId}`);
          break;
        case 'questStart':
          console.log(`📜 任务开始: ${(event.data as { questId: string }).questId}`);
          break;
        case 'objectiveComplete':
          console.log(`✅ 目标达成`);
          break;
        case 'chapterChange':
          console.log(`📚 章节切换: ${(event.data as { chapterId: string }).chapterId}`);
          break;
        case 'ending': {
          const ed = event.data as { endingId: string; name: string; text?: string };
          console.log(`\n🏁 结局: ${ed.name}`);
          if (ed.text) console.log(`   ${ed.text}`);
          break;
        }
        case 'puzzle': {
          const pd = event.data as { nodeId: string; puzzleId: string; params?: Record<string, unknown> };
          console.log(`🧩 谜题触发: ${pd.puzzleId} (节点: ${pd.nodeId})`);
          break;
        }
        case 'puzzleResolved': {
          const pr = event.data as { puzzleId: string; result: PuzzleResult; nextNodeId: string | null };
          console.log(`🧩 谜题结果: ${pr.result} → 下一个节点: ${pr.nextNodeId || '无'}`);
          break;
        }
        case 'error': {
          const err = event.data as { message?: string; error?: string; detail?: string };
          console.log(`❌ 错误: ${err.message || ''} ${err.detail || ''}`);
          break;
        }
      }
    },
  });
}

function advance(sdk: NarrativeSDK): DialogueLine | null {
  let line = sdk.continue();
  while (line) {
    if (sdk.getState() === 'waiting_choice' || sdk.getState() === 'waiting_puzzle' || sdk.getState() === 'ended') break;
    line = sdk.continue();
  }
  return line;
}

console.log('=== 迷雾森林 - 文字冒险 SDK v3 演示 ===\n');

const sdk = createSDK();

sdk.registerCharacter('elf', { avatar: 'elf_face', tone: 'mysterious' });
sdk.registerCharacter('merchant', { avatar: 'merchant_face', tone: 'friendly' });

sdk.injectPuzzle({
  puzzleId: 'rune_gate',
  handler: async (params) => {
    console.log(`   🧩 [自定义谜题] 符文之门 - 难度: ${(params as { difficulty: string }).difficulty}`);
    return 'success' as PuzzleResult;
  },
});

const firstLine = sdk.start();
if (!firstLine) {
  console.log('启动失败！');
  process.exit(1);
}

console.log('\n--- 继续推进到第一个选择 ---');
advance(sdk);

if (sdk.getState() === 'waiting_choice') {
  console.log('\n--- 玩家选择: 转身面对身后的注视 ---');
  sdk.makeChoice('first_choice', 1);
  advance(sdk);
}

if (sdk.getState() === 'waiting_puzzle') {
  console.log('\n--- 谜题节点触发，SDK 暂停等待结果 ---');
  console.log(`   SDK 状态: ${sdk.getState()}`);
  console.log(`   当前节点: ${sdk.getCurrentNodeId()}`);
  console.log('\n--- 游戏侧回传 resolvePuzzle("success") ---');
  sdk.resolvePuzzle('success');
  advance(sdk);
}

if (sdk.getState() === 'waiting_choice') {
  const currentNodeId = sdk.getCurrentNodeId();
  console.log(`\n--- 玩家选择: 询问更多关于暗影的事 ---`);
  sdk.makeChoice(currentNodeId, 1);
  advance(sdk);
}

if (sdk.getState() === 'waiting_choice') {
  const currentNodeId = sdk.getCurrentNodeId();
  console.log(`\n--- 玩家选择: 接受地图，踏上旅途 ---`);
  sdk.makeChoice(currentNodeId, 0);
  advance(sdk);
}

console.log('\n=== SDK 状态查询 ===');
console.log(`当前章节: ${sdk.getCurrentChapterId()} - ${sdk.getCurrentChapterTitle()}`);
console.log(`当前节点: ${sdk.getCurrentNodeId()}`);
console.log(`SDK 状态: ${sdk.getState()}`);

// ===== TEST 1: Save/Load at puzzle pause point =====
console.log('\n=== 测试1: 谜题暂停点保存/加载 ===');

const sdk2 = createSDK();
sdk2.registerCharacter('elf', { avatar: 'elf_face', tone: 'mysterious' });
sdk2.registerCharacter('merchant', { avatar: 'merchant_face', tone: 'friendly' });

sdk2.start();
advance(sdk2);
sdk2.makeChoice('first_choice', 1);
advance(sdk2);

console.log(`保存前状态: ${sdk2.getState()}, 节点: ${sdk2.getCurrentNodeId()}`);
const puzzleSnapshot = sdk2.save();
const puzzleStr = sdk2.saveToString();
console.log(`存档 pendingState: ${puzzleSnapshot.pendingState}`);
console.log(`存档 pendingPuzzleNodeId: ${puzzleSnapshot.pendingPuzzleNodeId}`);

sdk2.reset('ch1');
console.log(`重置后状态: ${sdk2.getState()}`);

const loadResult1 = sdk2.load(puzzleSnapshot);
console.log(`加载后状态: ${sdk2.getState()}, 节点: ${sdk2.getCurrentNodeId()}`);
console.log(`加载后 pendingPuzzleNodeId: ${(sdk2 as any).pendingPuzzleNodeId}`);

if (sdk2.getState() === 'waiting_puzzle') {
  console.log('\n--- 从谜题暂停存档恢复后，回传 resolvePuzzle("failure") ---');
  sdk2.resolvePuzzle('failure');
  advance(sdk2);
  console.log(`failure 分支后状态: ${sdk2.getState()}, 节点: ${sdk2.getCurrentNodeId()}`);
}

// Test load from string at puzzle pause
sdk2.reset('ch1');
const loadResult2 = sdk2.loadFromString(puzzleStr);
console.log(`从字符串加载后状态: ${sdk2.getState()}, 节点: ${sdk2.getCurrentNodeId()}`);

if (sdk2.getState() === 'waiting_puzzle') {
  console.log('--- 从字符串恢复后，回传 resolvePuzzle("cancel") ---');
  sdk2.resolvePuzzle('cancel');
  advance(sdk2);
  console.log(`cancel 分支后状态: ${sdk2.getState()}, 节点: ${sdk2.getCurrentNodeId()}`);
}

// ===== TEST 2: Save/Load at choice pause point =====
console.log('\n=== 测试2: 选择暂停点保存/加载 ===');

const sdk3 = createSDK();
sdk3.registerCharacter('elf', { avatar: 'elf_face', tone: 'mysterious' });
sdk3.registerCharacter('merchant', { avatar: 'merchant_face', tone: 'friendly' });

sdk3.start();
advance(sdk3);

if (sdk3.getState() === 'waiting_choice') {
  console.log(`保存前状态: ${sdk3.getState()}, 节点: ${sdk3.getCurrentNodeId()}`);
  const choiceSnapshot = sdk3.save();
  console.log(`存档 pendingState: ${choiceSnapshot.pendingState}`);

  sdk3.reset('ch1');
  sdk3.load(choiceSnapshot);
  console.log(`加载后状态: ${sdk3.getState()}, 节点: ${sdk3.getCurrentNodeId()}`);
  console.log(`加载后可以继续选择: ${sdk3.getState() === 'waiting_choice'}`);

  sdk3.makeChoice('first_choice', 1);
  advance(sdk3);
  console.log(`选择后状态: ${sdk3.getState()}`);
}

// ===== TEST 3: Save/Load at ending =====
console.log('\n=== 测试3: 结局暂停点保存/加载 ===');

const sdk4 = createSDK();
sdk4.registerCharacter('elf', { avatar: 'elf_face', tone: 'mysterious' });
sdk4.registerCharacter('merchant', { avatar: 'merchant_face', tone: 'friendly' });
sdk4.injectPuzzle({
  puzzleId: 'rune_gate',
  handler: async () => 'success',
});

sdk4.start();
advance(sdk4);
sdk4.makeChoice('first_choice', 1);
advance(sdk4);
if (sdk4.getState() === 'waiting_puzzle') {
  sdk4.resolvePuzzle('success');
  advance(sdk4);
}
if (sdk4.getState() === 'waiting_choice') {
  sdk4.makeChoice(sdk4.getCurrentNodeId(), 0);
  advance(sdk4);
}
if (sdk4.getState() === 'waiting_choice') {
  sdk4.makeChoice(sdk4.getCurrentNodeId(), 0);
  advance(sdk4);
}

console.log(`结局前状态: ${sdk4.getState()}, 节点: ${sdk4.getCurrentNodeId()}`);
if (sdk4.getState() === 'ended') {
  const endedSnapshot = sdk4.save();
  console.log(`结局存档 pendingState: ${endedSnapshot.pendingState}`);
  sdk4.reset('ch1');
  sdk4.load(endedSnapshot);
  console.log(`结局加载后状态: ${sdk4.getState()}`);
}

// ===== TEST 4: Load validation - missing chapter/node, state mismatch =====
console.log('\n=== 测试4: 加载校验 - 不存在的章节/节点、状态不匹配 ===');

const validSnap = sdk.save();

const badChapterSnap = { ...validSnap, currentChapterId: 'nonexistent_chapter' };
const badChapterResult = sdk.load(badChapterSnap);
console.log(`不存在章节加载: success=${badChapterResult.success}, error=${badChapterResult.error}`);
console.log(`加载失败后状态未被改乱: 章节=${sdk.getCurrentChapterId()}, 状态=${sdk.getState()}`);

const badNodeSnap = { ...validSnap, currentNodeId: 'nonexistent_node' };
const badNodeResult = sdk.load(badNodeSnap);
console.log(`不存在节点加载: success=${badNodeResult.success}, error=${badNodeResult.error}`);

const mismatchSnap = { ...validSnap, pendingState: 'waiting_puzzle' as const, currentNodeId: 'first_choice' };
const mismatchResult = sdk.load(mismatchSnap);
console.log(`状态不匹配(puzzle vs choice): success=${mismatchResult.success}, error=${mismatchResult.error}`);

const mismatchSnap2 = { ...validSnap, pendingState: 'waiting_choice' as const, currentNodeId: sdk.getCurrentNodeId() };
const mismatchResult2 = sdk.load(mismatchSnap2);
console.log(`状态不匹配(choice vs ending): success=${mismatchResult2.success}, error=${mismatchResult2.error}`);

// ===== TEST 5: i18n round-trip in choice history =====
console.log('\n=== 测试5: 多语言选择记录往返 ===');

const sdk5 = createSDK();
sdk5.registerCharacter('elf', { avatar: 'elf_face', tone: 'mysterious' });
sdk5.registerCharacter('merchant', { avatar: 'merchant_face', tone: 'friendly' });
sdk5.injectPuzzle({
  puzzleId: 'rune_gate',
  handler: async () => 'success',
});

sdk5.start();
advance(sdk5);

sdk5.makeChoice('first_choice', 1);
advance(sdk5);

if (sdk5.getState() === 'waiting_puzzle') {
  sdk5.resolvePuzzle('success');
  advance(sdk5);
}

if (sdk5.getState() === 'waiting_choice') {
  sdk5.makeChoice(sdk5.getCurrentNodeId(), 0);
  advance(sdk5);
}

console.log('\n--- 中文下的选择记录 ---');
sdk5.setLocale('zh-CN');
let history5 = sdk5.getChoiceHistory();
history5.forEach((rec, i) => {
  console.log(`  #${i + 1}: 原文="${rec.optionText}", 本地化="${rec.localizedText}"`);
});

console.log('\n--- 切换到英文后的选择记录 ---');
sdk5.setLocale('en-US');
history5 = sdk5.getChoiceHistory();
history5.forEach((rec, i) => {
  console.log(`  #${i + 1}: 原文="${rec.optionText}", 本地化="${rec.localizedText}"`);
});

console.log('\n--- 切换回中文后的选择记录 ---');
sdk5.setLocale('zh-CN');
history5 = sdk5.getChoiceHistory();
history5.forEach((rec, i) => {
  console.log(`  #${i + 1}: 原文="${rec.optionText}", 本地化="${rec.localizedText}"`);
});

// ===== TEST 6: Normal save/load consistency =====
console.log('\n=== 测试6: 正常存档/读档一致性 ===');

const savedSnapshot = sdk.save();
console.log(`存档时间: ${new Date(savedSnapshot.timestamp).toLocaleString()}`);
console.log(`存档版本: ${savedSnapshot.version}`);
console.log(`存档变量数: ${Object.keys(savedSnapshot.variables).length}`);
console.log(`存档物品数: ${savedSnapshot.inventory.length}`);
console.log(`存档选择记录: ${savedSnapshot.choiceHistory.length}`);
console.log(`存档对话历史: ${savedSnapshot.dialogueHistory.length}`);

const serialized = sdk.saveToString();
console.log(`序列化长度: ${serialized.length} 字符`);

console.log('\n--- 测试加载正常存档 ---');
sdk.reset('ch1');
const normalLoadResult = sdk.load(savedSnapshot);
console.log(`加载结果: success=${normalLoadResult.success}`);
console.log(`加载后章节: ${sdk.getCurrentChapterId()}, 节点: ${sdk.getCurrentNodeId()}`);
console.log(`加载后变量: ${JSON.stringify(sdk.getVariableCondition().getAll())}`);
console.log(`加载后物品数: ${sdk.getInventory().length}`);
console.log(`加载后选择记录: ${sdk.getChoiceHistory().length}`);
console.log(`加载后对话历史: ${sdk.getDialogueHistory().length}`);

console.log('\n--- 测试加载损坏存档 ---');
const badJsonResult = sdk.loadFromString('{invalid json');
console.log(`损坏JSON: success=${badJsonResult.success}, error=${badJsonResult.error}`);

const badVersionResult = sdk.load({ ...savedSnapshot, version: '99.0.0' });
console.log(`版本不匹配: success=${badVersionResult.success}, error=${badVersionResult.error}`);

const missingFieldsResult = sdk.load({ ...savedSnapshot, currentChapterId: '' });
console.log(`缺字段: success=${missingFieldsResult.success}, error=${missingFieldsResult.error}`);

console.log('\n--- 确认加载失败后运行状态未改乱 ---');
console.log(`当前章节: ${sdk.getCurrentChapterId()}, 状态: ${sdk.getState()}`);

// ===== TEST 7: Deep validation =====
console.log('\n=== 测试7: 深度剧情校验 ===');

const issues = sdk.validateDeep();
if (issues.length === 0) {
  console.log('✅ 未发现剧情问题');
} else {
  for (const issue of issues) {
    const icon = issue.severity === 'error' ? '🔴' : '🟡';
    console.log(`${icon} [${issue.kind}] ${issue.message}`);
    if (issue.path.length > 0) {
      const pathStr = issue.path.map((step) => {
        let s = `${step.chapterId}/${step.nodeId}`;
        if (step.optionIndex !== undefined) {
          s += ` 选项#${step.optionIndex}${step.optionText ? ` "${step.optionText}"` : ''}`;
        }
        return s;
      }).join(' → ');
      console.log(`   路径: ${pathStr}`);
    }
  }
}

// ===== TEST 8: Deep validation with problematic script =====
console.log('\n=== 测试8: 问题脚本深度校验 ===');

const problematicScript: NarrativeScript = {
  meta: { title: '问题测试', version: '1.0.0', language: 'zh-CN', saveVersion: '1.0.0' },
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
            { text: '选项A - 永远到不了结局', next: 't_loop_a', condition: { var: 'flag_a', op: '==', value: true } },
            { text: '选项B - 值域不可能', next: 't_loop_a', condition: { var: 'score', op: '>', value: 100 } },
            { text: '选项C - 正常', next: 't_loop_a' },
          ],
        },
        { id: 't_loop_a', type: 'dialogue', speaker: 'narrator', text: '循环A', next: 't_loop_b' },
        { id: 't_loop_b', type: 'dialogue', speaker: 'narrator', text: '循环B', next: 't_loop_a' },
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
  console.log('✅ 未发现问题（可能脚本确实无问题）');
} else {
  for (const issue of problemIssues) {
    const icon = issue.severity === 'error' ? '🔴' : '🟡';
    console.log(`${icon} [${issue.kind}] ${issue.message}`);
    if (issue.path.length > 0) {
      const pathStr = issue.path.map((step) => {
        let s = `${step.chapterId}/${step.nodeId}`;
        if (step.optionIndex !== undefined) {
          s += ` 选项#${step.optionIndex}${step.optionText ? ` "${step.optionText}"` : ''}`;
        }
        return s;
      }).join(' → ');
      console.log(`   路径: ${pathStr}`);
    }
  }
}

// ===== STORY TREE & ROLLBACK =====
console.log('\n=== 剧情树预览 ===');
const tree = sdk.previewStoryTree();
function printTree(node: typeof tree, indent: string = ''): void {
  const dead = node.isDeadEnd ? ' ⚠️死路' : '';
  const ch = node.chapterId ? `[${node.chapterId}]` : '';
  console.log(`${indent}├─ ${node.nodeId} (${node.type}) ${ch}${dead}`);
  for (const child of node.children) {
    printTree(child, indent + '│  ');
  }
}
printTree(tree);

console.log('\n=== 回滚测试 ===');
const history = sdk.getDialogueHistory();
console.log(`对话历史: ${history.length} 条`);
if (history.length > 1) {
  const rolledBack = sdk.rollback();
  console.log(`回滚后最后一条: ${rolledBack?.speakerName}: ${rolledBack?.localizedText || rolledBack?.text}`);
  console.log(`回滚后历史: ${sdk.getDialogueHistory().length} 条`);
}

console.log('\n=== 调试日志 ===');
const logs = sdk.exportDebugLog();
console.log(`日志条数: ${logs.length}`);
console.log(`最近5条:`);
logs.slice(-5).forEach((log) => {
  console.log(`  [${log.level}] ${log.message}`);
});

console.log('\n✅ SDK v3 演示完成');
