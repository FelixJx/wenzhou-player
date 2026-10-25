// content/params.js —— 全部数值只从这里读，不在别处写死（CONTRACT §0）
(function (root) {
  root.WZ = root.WZ || {};
  root.WZ.content = root.WZ.content || {};

  root.WZ.content.params = {
    // 时钟
    minPerSec: 4,            // 实时 1 秒 = 4 游戏分钟
    totalMin: 1024,          // 07:00 → 00:04
    stayMin: 32,             // 普通停站
    restMin: 64,             // 歇脚停站
    goBackMin: 64,           // 回头找人代价
    runSecondsEasy: 256,     // 一局实时秒数（1024/4）
    stageThresholds: [256, 512, 768, 972], // 天色五档切点
    dayStartLabel: '07:00',

    // 心与哄（10/24 起界面显示为耐心百分比；hearts 仍是内部阈值：每颗心 = 33.3% 耐心）
    hearts: 3,
    calmTimes: 2,
    patienceDecayPerMin: 0.25,   // 提出需求后没被响应：每游戏分钟掉 0.25%（约 1 小时掉 15%），响应后停止、不回升
    calmPatience: 30,            // 哄一哄：耐心 +30%
    calmCostMin: 2,              // 哄一哄花 2 分钟游戏时间

    // 7 种标签的阈值
    walkTiredMin: 160,       // 走不动：超过这么多分钟没歇脚开始掉心
    foodDeadlineMin: 360,    // 吃不惯：13:00 前（07:00+360）要吃到本地小吃
    foodDropEveryMin: 120,   // 吃不惯：超时后每 120 分钟掉 1 心
    crowdDropEveryMin: 60,   // 怕挤挤：在人潮区每 60 分钟掉 1 心
    rushFreeStops: 3,        // 催催催：免费停站数，之后每多停一站掉 1 心
    toiletEveryStops: 3,     // 憋不住：每 3 站内要经过厕所
    boredNeedSight: 1,       // 没劲儿：至少去 1 处看点
    infectDelayMin: 30,      // 困难局传染延迟
    interruptDefaultSec: 8,  // 中断 8 秒默认选 b

    // 队伍
    teamSize: { easy: 5, normal: 6, hard: 7 },
    conflictPairs: [['walk', 'rush'], ['crowd', 'shop']],

    // 标签展示
    tagNames: {
      walk: '走不动', food: '吃不惯', crowd: '怕挤挤', shop: '买买买',
      bored: '没劲儿', rush: '催催催', toilet: '憋不住', any: '都行哥'
    },
    tagIcons: {
      walk: '🦶', food: '🍚', crowd: '😵', shop: '🛍️',
      bored: '🥱', rush: '⏰', toilet: '🚻', any: '😎'
    },
    tagColors: {
      walk: '#e07a5f', food: '#f2cc8f', crowd: '#81b29a', shop: '#f4a261',
      bored: '#9b8fd9', rush: '#e63946', toilet: '#4cc9f0', any: '#adb5bd'
    },

    // 地点类型展示
    typeNames: {
      home: '出发点', rest: '歇脚', food: '小吃', shop: '手信',
      sight: '看点', toilet: '厕所', lane: '小巷', stage: '戏台'
    },
    typeIcons: {
      home: '🏠', rest: '🪑', food: '🥣', shop: '🎁',
      sight: '👀', toilet: '🚻', lane: '🛤️', stage: '🎭'
    },

    // 引擎参数（W1：优先 params.engine.*，兼容顶层同名）。sprites = web/assets/ 下要探测的
    // 地标精灵图名（缺图静默 404，不影响程序化绘制）；生成提示词见 docs/ART_PROMPTS.md
    engine: {
      sprites: ['wuma', 'mochi', 'center', 'jiangxin', 'yandang', 'nanxi'],
      // 真实地图（content/places.js 由 tools/realmap/build.js 生成，1 单位 = 1.5 米）：
      // 速度按 120 组高德步行实测反推，游戏里走一段的分钟数 ≈ 高德步行分钟数（平均误差约 1.4 分钟，最大 5 分钟）
      playerSpeed: 190,
      runSpeed: 270,
      arriveRadius: 30       // 45 米内算到站（真实店铺挨得近，原 40 会蹭站）
    },

    // 商圈（区域）划分——按真实地理画框，地点/POI 按坐标归属；place.region 字段可显式覆盖。
    // 积分：首次进入一个商圈 +15（新商圈），探新店 +8；手册候选列表按这里分组展示。
    regions: [
      { id: 'jiangxin', name: '江心屿·孤屿', x: 0, y: 0, w: 420, h: 760 },
      { id: 'shuomen', name: '朔门·江滨', x: 420, y: 480, w: 700, h: 520 },
      { id: 'wuma', name: '老城·五马商圈', x: 550, y: 1000, w: 900, h: 720 },
      { id: 'jiushan', name: '城西·九山', x: 100, y: 1000, w: 450, h: 760 },
      { id: 'shuixin', name: '水心', x: 100, y: 1760, w: 800, h: 640 },
      { id: 'tanghe', name: '塘河·白鹿洲', x: 900, y: 1900, w: 700, h: 692 },
      { id: 'yuanjiao', name: '远郊（坐车）', x: 0, y: 0, w: 0, h: 0 } // nanxi/yandang 由 region 字段显式指定
    ],

    // 带队积分（PRD-v4 §2.1）：到店时每位游客按需求匹配 + 店铺真实评分 ± 分；数值只从这里读
    score: {
      match: 12, matchAgain: 5, hiRating: 3, loRating: -4, miss: -2,
      rushLong: -6, rushOk: 3, crowdBad: -8, crowdLane: 10, crowdOk: 1, any: 2, late: -10,
      hiRatingAt: 4.5, loRatingAt: 4.0, rushLongAt: 45, crowdReviewsAt: 3000,
      // 时间规划分（10/25 裁决：宽松出发，排得好坏影响积分）——出发前计划的总时长 total：
      // ≥ timeFullAt → +timeFull「排满一天」；≥ timeMidAt → +timeMid；更少不加分；超 1024 结算另扣 late
      timeFull: 30, timeMid: 15, timeFullAt: 900, timeMidAt: 600
    },

    // 10/25 需求：一局要带队玩满 1024 分钟——路线不再限 5 站，改成「时间制」：
    // 计划结束时刻（含各站停留 + 回游客中心）≥ planFillMin 才允许出发；超过 totalMin 会提示超时。
    routeMin: 4,
    routeMax: 24,
    planFillMin: 920,

    // 商圈带队（PRD-v4 §3）：排一天 = 选商圈链；出发条件 900 ≤ 路上+停留+回程 ≤ 1024
    dayMinFloor: 900
  };
})(typeof window !== 'undefined' ? window : globalThis);
