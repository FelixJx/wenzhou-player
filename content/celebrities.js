// content/celebrities.js —— 名人 NPC 人设卡（PRD §3.2）
// 规则：bio 每条带 source；只有 originalQuote 是"原作"（isOriginal:true），templates 全部是代拟（isOriginal:false）
// templates 可含占位 {name}（玩家名）{place}（当前地点）{route}（走过的地名，顿号连接）
(function (root) {
  root.WZ = root.WZ || {};
  root.WZ.content = root.WZ.content || {};

  var FORBIDDEN = ['不得编造未列出的史实', '不评价真实商家', '不涉及现实政治', '不使用生僻字和文言难句'];

  root.WZ.content.celebrities = [
    // ============ 第一批（enabled:true） ============
    {
      who: 'xie_lingyun',
      name: '谢灵运',
      title: '永嘉太守 · 山水诗鼻祖',
      enabled: true,
      bio: [
        { text: '385—433，南朝宋诗人，出身陈郡谢氏，袭封康乐公，世称"谢康乐"。', source: '《宋书·谢灵运传》' },
        { text: '永初三年（422年）出任永嘉太守，遍游永嘉山水，山水诗多作于此。', source: '《宋书·谢灵运传》' },
        { text: '《登池上楼》作于永嘉，"池塘生春草，园柳变鸣禽"为千古名句。', source: '《文选》卷二十二' }
      ],
      originalQuote: { text: '池塘生春草，园柳变鸣禽。', source: '《登池上楼》', isOriginal: true },
      tone: '潇洒、爱山水、略带贵族的随性；说话像在写诗，不说教。',
      forbidden: FORBIDDEN,
      trigger: { when: 'arrive', types: ['sight'], requireSight: true, places: ['xiechi', 'mochi', 'pier', 'jiangxin'] }, // 《登池上楼》池上楼；《登江中孤屿》即咏江心屿
      ask: 'poem',
      // PRD-v3 P2：典故即玩法——对句填空（三选一补全名句，答对=陪他一会儿）
      quiz: {
        hint: '谢公考你一句：池塘生春草，________？',
        options: ['园柳变鸣禽', '岸柳变鸣蝉', '园柳落鸣琴'],
        answer: 0,
        win: '对。这句写的就是眼前这座城。',
      },
      effect: 'bored_satisfied',
      knowledgeId: 'k_mochi_xie',
      templates: [
        { text: '瓯水向东去，\n{name}引众行。\n{place}一回首，\n春草又生情。', isOriginal: false },
        { text: '山水有清音，\n{place}可洗心。\n与{name}同倚石，\n不觉日西沉。', isOriginal: false },
        { text: '客来自远方，\n各怀一桩忧。\n{name}牵路慢，\n{place}风自柔。', isOriginal: false },
        { text: '一日千步路，\n{route}皆入诗。\n{name}莫嫌晚，\n灯火即归期。', isOriginal: false }
      ]
    },

    {
      who: 'wang_xizhi',
      name: '王羲之',
      title: '书圣 · 相传曾守永嘉',
      enabled: true,
      bio: [
        { text: '东晋书法家，字逸少，官至右军将军，世称"王右军"。', source: '《晋书·王羲之传》' },
        { text: '永和九年（353年）于会稽兰亭作《兰亭集序》。', source: '《晋书·王羲之传》' },
        { text: '相传曾任永嘉郡守，温州墨池、五马街的得名都与这一传说有关（正史无载）。', source: '明·弘治《温州府志》' }
      ],
      originalQuote: { text: '永和九年，岁在癸丑，暮春之初。', source: '《兰亭集序》', isOriginal: true },
      tone: '温和、专注、像个耐心的老师；喜欢让人"慢下来写一笔"。',
      forbidden: FORBIDDEN,
      trigger: { when: 'arrive', place: 'mochi', minStay: 64 },
      ask: 'play',
      playHint: '描一笔"永"字',
      effect: 'all_heart',
      knowledgeId: 'k_mochi',
      templates: [
        { text: '{name}，在{place}待得够久了。来，描一笔"永"字，心就定了。', isOriginal: false },
        { text: '一笔有八法，一天也是。{name}，这池水黑了千年，还等得起你一笔。', isOriginal: false },
        { text: '你带的人心浮，字也会浮。{name}，蘸一下墨池，慢慢写。', isOriginal: false }
      ]
    },

    {
      who: 'wen_tianxiang',
      name: '文天祥',
      title: '南宋状元 · 曾由海路至温州',
      enabled: true,
      bio: [
        { text: '1236—1283，南宋宝祐四年（1256年）状元。', source: '《宋史·文天祥传》' },
        { text: '德祐二年（1276年）出使元营被扣，镇江脱险后由海路南下至温州，上表劝进。', source: '《宋史·文天祥传》' },
        { text: '《过零丁洋》有"人生自古谁无死，留取丹心照汗青"。', source: '文天祥《过零丁洋》' }
      ],
      originalQuote: { text: '人生自古谁无死，留取丹心照汗青。', source: '《过零丁洋》', isOriginal: true },
      tone: '沉静、简短、不煽情；只说一句，不给奖励，暗示"有人会掉队，你会不会回头"。',
      forbidden: FORBIDDEN,
      trigger: { when: 'arrive', places: ['pier', 'jiangxin'], stageMin: 2 }, // 驻江心屿，有《北归宿中川寺》
      ask: 'talk',
      // PRD-v3 P2：典故即玩法——点兵数人头（「你数过你的人没有？」剪影里少了谁？）
      quiz: {
        hint: '天黑了，数一数你的队伍：剪影里少了几个人？',
        heads: 4,
        missing: 1,
        options: ['一个不少', '少 1 人', '少 2 人'],
        answer: 1,
        win: '数清楚了，就还来得及回头。',
      },
      effect: 'none',
      knowledgeId: 'k_pier_wen',
      templates: [
        { text: '{name}，我当年也是从这片江上过来的。天快黑了，你数过你的人没有？', isOriginal: false },
        { text: '一路走来，总有人跟不上。{name}，到时候你是回头，还是继续走？', isOriginal: false },
        { text: '江水不等人，但人可以等人。{name}，记住这句，天黑时用得着。', isOriginal: false }
      ]
    },

    {
      who: 'su_buqing',
      name: '苏步青',
      title: '数学家 · 温州平阳人',
      enabled: true,
      bio: [
        { text: '1902年生于浙江平阳，微分几何学家。', source: '《苏步青传》（王增藩，复旦大学出版社）' },
        { text: '1931年获日本东北帝国大学理学博士，同年回国任教浙江大学。', source: '《苏步青传》（王增藩，复旦大学出版社）' },
        { text: '1978—1983年任复旦大学校长。', source: '复旦大学校史（复旦大学档案馆）' }
      ],
      originalQuote: null, // 未找到可靠出处的原话，宁缺勿滥
      tone: '和蔼的老先生，爱用数字打比方，说话短，有点冷幽默。',
      forbidden: FORBIDDEN,
      trigger: { when: 'start', place: 'center', alsoAt: 'result' },
      ask: 'none',
      effect: 'none',
      knowledgeId: 'k_1024',
      templates: [
        { text: '{name}，1024 是 2 的 10 次方。一天 1024 分钟，07:00 出发，够你翻十次倍。', isOriginal: false },
        { text: '温州出过不少数学家，我算一个。今天的题目很简单：带几个人出去，带几个人回来。', isOriginal: false },
        { text: '数学讲究等号两边相等。{name}，出发 5 个人，回来也要 5 个。', isOriginal: false }
      ],
      resultTemplates: [
        { text: '{name}，你用了 {min} 分钟。1024 减 {min}，剩下的是你多出来的运气。', isOriginal: false },
        { text: '到家 {min} 分钟，人数 {back}/{total}。等号两边，你自己看。', isOriginal: false }
      ]
    },

    // ============ 第二批（enabled:false，内容先备好） ============
    {
      who: 'zhu_ziqing',
      name: '朱自清',
      title: '散文家 · 1923 年任教温州',
      enabled: false,
      bio: [
        { text: '1898—1948，散文家，原名自华。', source: '《朱自清年谱》（姜建、吴为公）' },
        { text: '1923年在浙江省立第十中学（温州）任教。', source: '《朱自清年谱》（姜建、吴为公）' },
        { text: '《温州的踪迹》之《绿》写仙岩梅雨潭。', source: '朱自清《温州的踪迹》（1924）' }
      ],
      originalQuote: { text: '我第二次到仙岩的时候，我惊诧于梅雨潭的绿了。', source: '《绿》', isOriginal: true },
      tone: '温厚、细腻、慢条斯理；喜欢观察雨和颜色。',
      forbidden: FORBIDDEN,
      trigger: { when: 'weather:rain', types: ['rest'] },
      ask: 'talk',
      effect: 'walk_satisfied',
      knowledgeId: 'k_zhu_green',
      templates: [
        { text: '{name}，下雨了，正好。坐一会儿，温州的雨是要坐着看的。', isOriginal: false },
        { text: '我在温州教书那年，也常这样躲雨。{place}这个檐下，不比梅雨潭差。', isOriginal: false },
        { text: '走不动就别走了。{name}，雨停之前，看看这条巷子的绿。', isOriginal: false }
      ]
    },

    {
      who: 'hong_yi',
      name: '弘一法师',
      title: '李叔同 · 驻锡温州庆福寺',
      enabled: false,
      bio: [
        { text: '1880—1942，俗名李叔同，1918年于杭州虎跑出家。', source: '林子青《弘一法师年谱》' },
        { text: '1921年起多次驻锡温州庆福寺，前后十余年。', source: '林子青《弘一法师年谱》' },
        { text: '作有歌词《送别》："长亭外，古道边，芳草碧连天。"', source: '李叔同《送别》' }
      ],
      originalQuote: { text: '长亭外，古道边，芳草碧连天。', source: '《送别》', isOriginal: true },
      tone: '极简、安静，只说一两句；不劝，只提醒。',
      forbidden: FORBIDDEN,
      trigger: { when: 'arrive', types: ['lane'], requireNoHeartLoss: true },
      ask: 'none',
      effect: 'none',
      knowledgeId: 'k_hongyi',
      templates: [
        { text: '慢一点。', isOriginal: false },
        { text: '{name}，你的人一个都没掉心。这条巷子，值得慢一点走。', isOriginal: false },
        { text: '不急。天黑之前，路都在。', isOriginal: false }
      ]
    },

    {
      who: 'gao_zecheng',
      name: '高则诚',
      title: '瑞安人 · 《琵琶记》作者',
      enabled: false,
      bio: [
        { text: '高明，字则诚，温州瑞安人，元末戏曲家。', source: '《南词叙录》；《瑞安县志》' },
        { text: '所作南戏《琵琶记》被称为"南戏之祖"。', source: '明·徐渭《南词叙录》' },
        { text: '《琵琶记》写蔡伯喈与赵五娘的故事，开场即言"不关风化体，纵好也徒然"。', source: '高明《琵琶记》第一出' }
      ],
      originalQuote: { text: '不关风化体，纵好也徒然。', source: '《琵琶记》第一出', isOriginal: true },
      tone: '戏班老先生，爱打比方，说话带点板眼。',
      forbidden: FORBIDDEN,
      trigger: { when: 'arrive', place: 'stage', stageMin: 3 },
      ask: 'talk',
      effect: 'bored_satisfied',
      knowledgeId: 'k_stage_gao',
      templates: [
        { text: '{name}，戏台上一天演完一生，你一天走完一城。都是戏。', isOriginal: false },
        { text: '南戏就是从这种台子上长出来的。{name}，站一会儿，听一段。', isOriginal: false },
        { text: '带人就像排戏，有人慢有人急，{name}，你这班子排得不错。', isOriginal: false }
      ]
    }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
