// content/ending.js —— 结尾、升华屏、称号文案（PRD §4 S4–S6、§4.3、§4.4）
(function (root) {
  root.WZ = root.WZ || {};
  root.WZ.content = root.WZ.content || {};

  root.WZ.content.ending = {
    // 读数到 1024 后的黑屏，逐行出现
    blackout: ['天黑了。', '队伍回到出发点。'],

    // 点人头发现有人没回来时的两个按钮
    buttons: {
      goBack: '回去找他',
      goBackCost: '+64 分钟',
      goHome: '继续回家'
    },

    // 结尾五幕（提示词 11：原文一字不改，只删用户确认删除的两处无数据支撑的句子
    // 「今晚有 1024 个游客，来自这里的所有玩家，包括你。」「名次退了 15 位」）。只在人生第一局、结算之后放一次（seen_ending）
    epilogueActs: [
      { k: '认领', lines: ['还记得开场写下的那句话吗。'] },
      { k: '脾气', lines: ['他们的脾气，是别人开场时写下的一句话。'] },
      { k: '回去', lines: ['今天有一些玩家，选了回去。', '他们多花了时间。', '游客们都齐了，一个不少。'] },
      { k: '照顾', lines: ['今晚，你照顾了一些人，没见过，也不会再见。'] },
      { k: '落回温州', lines: ['这不是温州人才有的。', '温州只是把这件事，做得早了一点。', '开局那条进度条上，写着 1024。你哄过的每一个游客，都是 1024 个人里的一个。'] }
    ],

    // 旧版升华屏（保留兼容；10/24 起用 epilogueActs）
    epilogueFirstRun: [
      '还记得开场写下的那件事吗。',
      '今天你带的 5 个人，\n他们怕的东西，\n是别人开场时写下的一句话。',
      '你写的那一句，\n此刻也在别人的队伍里。',
      '今天，有人为了一个陌生人，\n回去了一趟。',
      '你们没见过面，\n但已经互相照顾过一轮了。',
      '1024 分钟很短。\n但一座城愿意等你过完它。'
    ],

    // 称号
    resultTitles: {
      local: '本地通',       // 记住你 5/5
      kind: '贴心向导',      // 记住你 ≥3
      fast: '赶路人',        // 最快但记住 ≤1
      lost: '丢三落四',      // 丢 ≥2
      default: '温州玩家'
    },

    // 结算页零散文案
    lostLine: '他没跟上来。',
    wentBackLine: '你超时了。\n{n} 个人，一个没少。',
    resultHeads: {
      brought: '带回',
      remembered: '记住你',
      arrive: '到家时刻',
      knowledge: '今天你认识了温州的 3 件事',
      celebrities: '今天遇见的人'
    },
    resultButtons: {
      again: '再来一局',
      where: '我写的那句去哪了',
      boards: '看榜'
    },
    overtimeLabel: '超时到家',
    onTimeLabel: '准时到家'
  };
})(typeof window !== 'undefined' ? window : globalThis);
