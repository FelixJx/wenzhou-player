/* web/map.js —— 地图网格、程序化城区生成、A* 寻路、封路（W1）
 * UMD 壳：浏览器挂 window.WZ.map；Node 里 require 后取 globalThis.WZ.map。
 * 本文件不碰 DOM，可在 Node 测试里直接使用。
 */
(function (root) {
  'use strict';
  root.WZ = root.WZ || {};

  var CELL = 32; // 网格边长（像素）
  // 格子类型
  var T = { BLOCK: 0, ROAD: 1, LANE: 2, PLAZA: 3, GRASS: 4, WATER: 5, STRUCT: 6, TREE: 7, BANK: 8 };
  // 各类型是否可走（BLOCK=建筑块、WATER=水、STRUCT=地点建筑、TREE=树 不可走）
  var WALKABLE = [false, true, true, true, true, false, false, false, true];

  // 确定性随机数（同一 seed 每次生成同一张图）
  function mulberry32(seed) {
    var a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // content/*.js 缺失时的最小内容（字段按契约 §2.2），demo 与测试共用
  function fallbackContent() {
    return {
      mapSize: { w: 1600, h: 2400 },
      params: {
        minPerSec: 4, stayMin: 32, restMin: 64, goBackMin: 64,
        stageThresholds: [256, 512, 768, 972],
        engine: { playerSpeed: 120, runSpeed: 170, followSpacing: 26, arriveRadius: 40, mapSeed: 1024, viewWorldWidth: 280 }
      },
      places: [
        { id: 'center',   name: '游客中心',   types: ['home'],          x: 800,  y: 2240, stayMin: 0,  knowledgeId: 'k_center' },
        { id: 'wuma',     name: '五马街',     types: ['shop', 'sight'], x: 800,  y: 1000, stayMin: 32, knowledgeId: 'k_wuma', crowdWindow: [300, 600] },
        { id: 'mochi',    name: '墨池公园',   types: ['sight', 'rest'], x: 1180, y: 560,  stayMin: 64, knowledgeId: 'k_mochi' },
        { id: 'xianqian', name: '县前小吃街', types: ['food'],          x: 400,  y: 1500, stayMin: 32, knowledgeId: 'k_xianqian' },
        { id: 'teastall', name: '巷子茶摊',   types: ['rest'],          x: 1150, y: 1850, stayMin: 64, knowledgeId: 'k_teastall' },
        { id: 'pier',     name: '江滨码头',   types: ['sight'],         x: 900,  y: 200,  stayMin: 32, knowledgeId: 'k_pier' },
        { id: 'lane1',    name: '来时的巷口', types: ['lane'],          x: 500,  y: 900,  stayMin: 0,  knowledgeId: 'k_lane1' },
        { id: 'lane2',    name: '后巷',       types: ['lane'],          x: 1000, y: 1850, stayMin: 0,  knowledgeId: 'k_lane2' },
        { id: 'toilet1',  name: '公厕·南',    types: ['toilet'],        x: 300,  y: 2200, stayMin: 16, knowledgeId: 'k_toilet' },
        { id: 'toilet2',  name: '公厕·东',    types: ['toilet'],        x: 1480, y: 1300, stayMin: 16, knowledgeId: 'k_toilet' },
        { id: 'toilet3',  name: '公厕·北',    types: ['toilet'],        x: 600,  y: 600,  stayMin: 16, knowledgeId: 'k_toilet' }
      ],
      zones: [
        { id: 'wuma_crowd', placeId: 'wuma', x: 576, y: 960, w: 448, h: 64 }
      ]
    };
  }

  // 二叉堆（A* 开放表）
  function Heap(cmp) { this.a = []; this.cmp = cmp; }
  Heap.prototype.push = function (v) {
    var a = this.a; a.push(v); var i = a.length - 1;
    while (i > 0) { var p = (i - 1) >> 1; if (this.cmp(a[i], a[p]) < 0) { var t = a[i]; a[i] = a[p]; a[p] = t; i = p; } else break; }
  };
  Heap.prototype.pop = function () {
    var a = this.a; var top = a[0]; var last = a.pop();
    if (a.length) {
      a[0] = last; var i = 0, n = a.length;
      for (;;) {
        var l = i * 2 + 1, r = l + 1, m = i;
        if (l < n && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < n && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        var t = a[i]; a[i] = a[m]; a[m] = t; i = m;
      }
    }
    return top;
  };
  Heap.prototype.size = function () { return this.a.length; };

  // 建筑配色（墙、屋顶）——偏温州老城的黑瓦白墙，夹杂几种暖色
  var PALETTES = [
    ['#ece6da', '#464d55'], ['#ece6da', '#464d55'], ['#e4ddd0', '#3d4a52'],
    ['#d9c3a5', '#a0523d'], ['#c9b79c', '#8e6f4e'], ['#b8c0c8', '#5c6b7a'],
    ['#e0d8c8', '#6e8aa0'], ['#cfd6c4', '#5f7a4e']
  ];
  var SIGN_TEXT = ['茶', '面', '糕', '鱼丸', '手信', '药', '米', '酒', '书', '饭', '糯米饭', '灯盏糕'];
  var SIGN_COLOR = ['#c0392b', '#1f6f8b', '#2e7d32', '#8e44ad', '#d35400'];

  // 地点主视觉类型优先级（一个地点多类型时取第一个命中的）
  var VISUAL_PRIORITY = ['home', 'food', 'rest', 'shop', 'toilet', 'stage', 'sight', 'lane'];

  function create(cfg) {
    cfg = cfg || {};
    var places = (cfg.places || []).map(function (p) { return Object.assign({}, p); });
    var zones = (cfg.zones || []).slice();
    var size = cfg.mapSize || { w: 1600, h: 2400 };
    var params = cfg.params || {};
    var eng = params.engine || {};
    var seed = eng.mapSeed || params.mapSeed || 1024;
    var rng = mulberry32(seed);

    var cols = Math.max(12, Math.round(size.w / CELL));
    var rows = Math.max(12, Math.round(size.h / CELL));
    var w = cols * CELL, h = rows * CELL;
    var grid = new Uint8Array(cols * rows);     // 格子类型
    var blocked = new Uint8Array(cols * rows);  // 封路动态阻挡

    function inB(cx, cy) { return cx >= 0 && cy >= 0 && cx < cols && cy < rows; }
    function idx(cx, cy) { return cy * cols + cx; }
    function get(cx, cy) { return inB(cx, cy) ? grid[idx(cx, cy)] : T.WATER; }
    function set(cx, cy, t) { if (inB(cx, cy)) grid[idx(cx, cy)] = t; }
    function baseWalkable(cx, cy) { return inB(cx, cy) && WALKABLE[grid[idx(cx, cy)]]; }
    function isWalkable(cx, cy) { return baseWalkable(cx, cy) && !blocked[idx(cx, cy)]; }
    function toCell(x, y) { return { cx: Math.floor(x / CELL), cy: Math.floor(y / CELL) }; }
    function toWorld(cx, cy) { return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 }; }
    function clampCell(c) { return { cx: Math.min(cols - 2, Math.max(1, c.cx)), cy: Math.min(rows - 2, Math.max(1, c.cy)) }; }

    // 真实地图模式：mapSize.real 由 tools/realmap/build.js 生成（高德坐标 + 高德步行路线栅格化）
    // mask 每格一个字符：'.' 建筑块  'R' 街道  'W' 水面  'G' 江心屿草地  'B' 江岸/码头栈道  'P' 公园绿地
    var REAL = size.real && size.real.mask && size.real.mask.length ? size.real : null;

    // ---------- 1. 江 + 江滨步道 ----------
    var riverRows = REAL ? (REAL.riverRows || 5) : 5;
    var cy, cx;
    if (REAL) {
      var MCH = { '.': T.BLOCK, R: T.ROAD, W: T.WATER, G: T.GRASS, B: T.BANK, P: T.GRASS, L: T.LANE };
      for (cy = 0; cy < rows; cy++) {
        var line = REAL.mask[cy] || '';
        for (cx = 0; cx < cols; cx++) { var ch = line.charAt(cx) || '.'; set(cx, cy, MCH[ch] != null ? MCH[ch] : T.BLOCK); }
      }
    } else {
      for (cy = 0; cy < riverRows; cy++) for (cx = 0; cx < cols; cx++) set(cx, cy, T.WATER);
      for (cx = 0; cx < cols; cx++) set(cx, riverRows, T.BANK);
    }

    // ---------- 2. 主干道（2 格宽），位置自动避开地点入口及其北侧结构 ----------
    var placeCells = places.map(function (p) { var c = clampCell(toCell(p.x, p.y)); c.big = (p.types || []).indexOf('home') >= 0; return c; });
    function hConflict(r0) { return placeCells.some(function (c) { return r0 + 1 >= c.cy - (c.big ? 4 : 2) && r0 <= c.cy + 1; }); }
    function vConflict(c0) { return placeCells.some(function (c) { return c0 + 1 >= c.cx - (c.big ? 2 : 1) && c0 <= c.cx + (c.big ? 2 : 1); }); }
    var OFFS = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5];
    function pick(nominal, conflict, lo, hi) {
      for (var i = 0; i < OFFS.length; i++) { var v = nominal + OFFS[i]; if (v >= lo && v <= hi && !conflict(v)) return v; }
      return nominal;
    }
    var hStep = eng.roadStepRows || 14, vStep = eng.roadStepCols || 18;
    var hRoads = [], vRoads = [];
    if (!REAL) for (var r = riverRows + 3; r + 1 < rows - 2; r += hStep) hRoads.push(pick(r, hConflict, riverRows + 2, rows - 3));
    if (!REAL) for (var c = 6; c + 1 < cols - 2; c += vStep) vRoads.push(pick(c, vConflict, 1, cols - 3));
    hRoads.forEach(function (r0) { for (var x = 0; x < cols; x++) { set(x, r0, T.ROAD); set(x, r0 + 1, T.ROAD); } });
    vRoads.forEach(function (c0) { for (var y = riverRows + 1; y < rows; y++) { set(c0, y, T.ROAD); set(c0 + 1, y, T.ROAD); } });

    // ---------- 3. 街区内的小巷与绿地 ----------
    var rowBounds = [], colBounds = [];
    var prev = riverRows + 1;
    hRoads.forEach(function (r0) { rowBounds.push([prev, r0 - 1]); prev = r0 + 2; });
    rowBounds.push([prev, rows - 1]);
    prev = 0;
    vRoads.forEach(function (c0) { colBounds.push([prev, c0 - 1]); prev = c0 + 2; });
    colBounds.push([prev, cols - 1]);

    var greens = []; // 绿地矩形（供渲染装饰）
    if (!REAL) rowBounds.forEach(function (rb) {
      colBounds.forEach(function (cb) {
        var r1 = rb[0], r2 = rb[1], c1 = cb[0], c2 = cb[1];
        if (r2 - r1 < 2 || c2 - c1 < 2) return;
        // 小巷：穿过整个街区，两端接主干道
        if (rng() < 0.5) {
          if (rng() < 0.5) { var lr = Math.floor((r1 + r2) / 2); for (var x = c1; x <= c2; x++) if (get(x, lr) === T.BLOCK) set(x, lr, T.LANE); }
          else { var lc = Math.floor((c1 + c2) / 2); for (var y = r1; y <= r2; y++) if (get(lc, y) === T.BLOCK) set(lc, y, T.LANE); }
        }
        // 街角绿地：贴着路，保证连通
        if (rng() < 0.3) {
          var gw = Math.min(4, c2 - c1 + 1), gh = Math.min(3, r2 - r1 + 1);
          var left = rng() < 0.5, top = rng() < 0.5;
          var gx = left ? c1 : c2 - gw + 1, gy = top ? r1 : r2 - gh + 1;
          for (y = gy; y < gy + gh; y++) for (x = gx; x < gx + gw; x++) if (get(x, y) === T.BLOCK) set(x, y, T.GRASS);
          if (gw >= 3 && gh >= 3) set(gx + 1, gy + 1, T.TREE);
          if (gw >= 4 && gh >= 3) set(gx + 2, gy + 1, T.TREE);
          greens.push({ cx: gx, cy: gy, w: gw, h: gh });
        }
      });
    });

    // ---------- 4. 地点：入口广场、专属结构、通往主干道的连廊 ----------
    var structs = [];   // 可绘制结构 {place, kind, cx, cy, w, h}
    var byId = {};
    places.forEach(function (p) {
      var cc = clampCell(toCell(p.x, p.y));
      p.cx = cc.cx; p.cy = cc.cy;
      var e = toWorld(cc.cx, cc.cy);
      p.ex = e.x; p.ey = e.y; // 入口世界坐标
      byId[p.id] = p;
      p.types = p.types || [];
      p.visual = VISUAL_PRIORITY.filter(function (t) { return p.types.indexOf(t) >= 0; })[0] || 'sight';
      if (p.id === 'wuma' || p.id === 'mochi' || p.id === 'center' || p.id === 'pier') p.visual = p.id;
      if (p.id === 'jiangxin') p.visual = 'jiangxin';       // 江心屿：江中岛
      if (p.id === 'yandang' || p.id === 'nanxi') p.visual = 'hill'; // 山野：草坡山峰
    });

    function carvePlaza(cx, cy, r) {
      for (var y = cy - r; y <= cy + r; y++) for (var x = cx - r; x <= cx + r; x++) if (inB(x, y)) set(x, y, T.PLAZA);
    }
    function carveTo(cx, cy, dx, dy, max, skip) {
      // 从 (cx,cy) 沿 (dx,dy) 挖连廊，直到碰到可走格（通常是主干道）；skip = 跳过自身广场的格数
      for (var i = (skip || 0) + 1; i <= max; i++) {
        var x = cx + dx * i, y = cy + dy * i;
        if (!inB(x, y)) return;
        if (baseWalkable(x, y)) return;
        set(x, y, T.LANE);
      }
    }
    function nearestRoadDir(cx, cy) {
      var bestV = null, bestH = null;
      vRoads.forEach(function (c0) { var d = (c0 < cx) ? cx - (c0 + 1) : c0 - cx; if (bestV === null || Math.abs(d) < Math.abs(bestV.d)) bestV = { d: d, dir: c0 < cx ? -1 : 1 }; });
      hRoads.forEach(function (r0) { var d = (r0 < cy) ? cy - (r0 + 1) : r0 - cy; if (bestH === null || Math.abs(d) < Math.abs(bestH.d)) bestH = { d: d, dir: r0 < cy ? -1 : 1 }; });
      return { v: bestV, h: bestH };
    }

    // 4a 特殊地标的区域（先于普通广场，广场再覆盖）
    places.forEach(function (p) {
      var cx = p.cx, cy = p.cy, x, y;
      if (p.visual === 'mochi' && REAL) {
        // 真实比例下墨池公园只有百来米：草地 5×4，北侧一格墨池
        for (y = cy - 3; y <= cy; y++) for (x = cx - 2; x <= cx + 2; x++) if (inB(x, y) && get(x, y) === T.BLOCK) set(x, y, T.GRASS);
        if (get(cx, cy - 3) === T.GRASS) set(cx, cy - 3, T.WATER);
        if (get(cx - 2, cy - 3) === T.GRASS) set(cx - 2, cy - 3, T.TREE);
        if (get(cx + 2, cy - 3) === T.GRASS) set(cx + 2, cy - 3, T.TREE);
        structs.push({ place: p, kind: 'mochi', cx: cx - 1, cy: cy - 3, w: 3, h: 2 });
      } else if (p.visual === 'mochi') {
        // 公园：草地 11×9，北侧墨池（水），几棵树
        for (y = cy - 6; y <= cy + 2; y++) for (x = cx - 5; x <= cx + 5; x++) if (inB(x, y) && get(x, y) !== T.ROAD) set(x, y, T.GRASS);
        for (y = cy - 5; y <= cy - 4; y++) for (x = cx - 1; x <= cx + 1; x++) if (get(x, y) === T.GRASS) set(x, y, T.WATER);
        [[-4, -5], [4, -5], [-4, 0], [4, 0], [-2, -2], [2, -2]].forEach(function (d) { if (get(cx + d[0], cy + d[1]) === T.GRASS) set(cx + d[0], cy + d[1], T.TREE); });
        structs.push({ place: p, kind: 'mochi', cx: cx - 1, cy: cy - 5, w: 3, h: 2 });
      } else if (p.visual === 'wuma') {
        // 步行街：两行石板（真实比例下五马街约 400 米 = 横跨 9 格）；北侧一排摊位
        var wh = REAL ? 4 : 7;
        for (y = cy - 1; y <= cy; y++) for (x = cx - wh; x <= cx + wh; x++) if (inB(x, y) && get(x, y) !== T.ROAD && get(x, y) !== T.WATER) set(x, y, T.PLAZA);
        for (x = cx - wh; x <= cx + wh; x++) if (get(x, cy - 2) === T.BLOCK) { set(x, cy - 2, T.STRUCT); structs.push({ place: p, kind: 'stall', cx: x, cy: cy - 2, w: 1, h: 1, seed: rng() }); }
        structs.push({ place: p, kind: 'wuma', cx: cx - 2, cy: cy - 2, w: 5, h: 1 });
      } else if (p.visual === 'pier' && REAL) {
        // 真实地图：栈道（轮渡航线）已在 mask 里，只放码头结构
        structs.push({ place: p, kind: 'pier', cx: cx - 1, cy: Math.max(1, cy - 3), w: 3, h: 3 });
      } else if (p.visual === 'pier') {
        // 码头：木栈道伸进江里
        for (y = Math.max(1, cy - 4); y <= cy; y++) for (x = cx - 1; x <= cx + 1; x++) if (get(x, y) === T.WATER) set(x, y, T.BANK);
        structs.push({ place: p, kind: 'pier', cx: cx - 1, cy: Math.max(1, cy - 4), w: 3, h: 4 });
      } else if (p.visual === 'jiangxin' && REAL) {
        // 真实地图：岛形在 mask 里（G），这里只立双塔（西塔、东塔按真实经度给在 REAL.pagodas）和几棵树
        (REAL.pagodas || [[cx - 3, cy - 1], [cx + 3, cy - 1]]).forEach(function (pg) {
          if (inB(pg[0], pg[1])) { set(pg[0], pg[1], T.STRUCT); structs.push({ place: p, kind: 'pagoda', cx: pg[0], cy: pg[1], w: 1, h: 2 }); }
        });
        [[-2, 1], [2, 1], [-1, -2], [1, -2], [-4, 0], [4, -1]].forEach(function (d) { if (get(cx + d[0], cy + d[1]) === T.GRASS) set(cx + d[0], cy + d[1], T.TREE); });
      } else if (p.visual === 'jiangxin') {
        // 江心屿：江中小岛（只填水面，不覆盖码头栈道），东西双塔 + 树；栈道即登岛通道
        for (y = Math.max(1, cy - 2); y <= Math.min(riverRows - 1, cy + 2); y++) for (x = cx - 4; x <= cx + 4; x++) if (get(x, y) === T.WATER) set(x, y, T.GRASS);
        set(cx - 3, cy - 1, T.STRUCT); set(cx + 3, cy - 1, T.STRUCT);
        structs.push({ place: p, kind: 'pagoda', cx: cx - 3, cy: cy - 1, w: 1, h: 2 }); // 西塔（唐）
        structs.push({ place: p, kind: 'pagoda', cx: cx + 3, cy: cy - 1, w: 1, h: 2 }); // 东塔（宋）
        [[-2, 1], [2, 1], [-1, -2], [1, -2]].forEach(function (d) { if (get(cx + d[0], cy + d[1]) === T.GRASS) set(cx + d[0], cy + d[1], T.TREE); });
      } else if (p.visual === 'hill') {
        // 山野（雁荡山/楠溪江）：草坡 + 一排山峰；不覆盖已生成的路（连通性由 §5 兜底）
        for (y = cy - 3; y <= cy + 1; y++) for (x = cx - 4; x <= cx + 4; x++) { var t0 = get(x, y); if (inB(x, y) && (t0 === T.BLOCK || t0 === T.TREE)) set(x, y, T.GRASS); }
        for (x = cx - 4; x <= cx + 4; x++) if (rng() < 0.25 && get(x, cy - 2) === T.GRASS) set(x, cy - 2, T.TREE);
        structs.push({ place: p, kind: 'hill', cx: cx - 3, cy: cy - 2, w: 7, h: 3 });
      } else if (p.visual === 'lane') {
        // 小巷：沿行向两侧挖，直到接上路
        if (!REAL) { carveTo(cx, cy, -1, 0, 24); carveTo(cx, cy, 1, 0, 24); }
        set(cx, cy, T.LANE);
      }
    });

    // 4b 入口广场 + 连廊
    places.forEach(function (p) {
      var cx = p.cx, cy = p.cy;
      var skip = 0;
      if (p.visual !== 'lane') { carvePlaza(cx, cy, REAL ? 0 : 1); skip = REAL ? 0 : 1; } else set(cx, cy, T.LANE); // 真实地图：门口只留一格，免得路过的人蹭到站
      if (REAL) { connectNearest(p); return; }
      var nd = nearestRoadDir(cx, cy);
      if (nd.v) carveTo(cx, cy, nd.v.dir, 0, cols, skip);
      if (nd.h) carveTo(cx, cy, 0, nd.h.dir, rows, skip);
    });
    // 真实地图：地点入口用最短的 L 形小巷接到最近的街道（不穿水面）
    function connectNearest(p) {
      var cx = p.cx, cy = p.cy, best = null;
      for (var rr = 2; rr <= 14 && !best; rr++) for (var dy = -rr; dy <= rr; dy++) for (var dx = -rr; dx <= rr; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
        var t = get(cx + dx, cy + dy);
        if (t === T.ROAD || t === T.BANK || t === T.LANE) { var d = Math.abs(dx) + Math.abs(dy); if (!best || d < best.d) best = { x: cx + dx, y: cy + dy, d: d }; }
      }
      if (!best) return;
      var x = cx, y = cy, sx = best.x > x ? 1 : -1, sy = best.y > y ? 1 : -1;
      while (x !== best.x) { x += sx; var tt = get(x, y); if (tt === T.BLOCK || tt === T.GRASS || tt === T.TREE) set(x, y, T.LANE); }
      while (y !== best.y) { y += sy; tt = get(x, y); if (tt === T.BLOCK || tt === T.GRASS || tt === T.TREE) set(x, y, T.LANE); }
    }

    // 4c 普通地点的结构（入口北侧一排）。可覆盖路面（路被房子截断，由 §5 兜底连通），不覆盖别处广场/水面
    places.forEach(function (p) {
      var cx = p.cx, cy = p.cy, x, y;
      if (p.visual === 'mochi' || p.visual === 'wuma' || p.visual === 'pier' || p.visual === 'lane' || p.visual === 'jiangxin' || p.visual === 'hill') return;
      var rect = (p.visual === 'home' || p.visual === 'center') ? (REAL ? { cx: cx - 1, cy: cy - 3, w: 3, h: 2 } : { cx: cx - 2, cy: cy - 4, w: 5, h: 3 }) : { cx: cx - 1, cy: cy - 2, w: 3, h: 1 };
      for (y = rect.cy; y < rect.cy + rect.h; y++) for (x = rect.cx; x < rect.cx + rect.w; x++) {
        var t = get(x, y);
        if (REAL && (t === T.ROAD || t === T.LANE)) continue; // 真实地图：房子不压街道，否则会切断真实路线
        if (inB(x, y) && (t === T.BLOCK || t === T.ROAD || t === T.LANE || t === T.GRASS || t === T.TREE)) set(x, y, T.STRUCT);
      }
      structs.push({ place: p, kind: p.visual, cx: rect.cx, cy: rect.cy, w: rect.w, h: rect.h });
    });

    // ---------- 5. 连通性保证 ----------
    function bfsFrom(cx, cy, walk) {
      var seen = new Uint8Array(cols * rows), q = [idx(cx, cy)], n = 0;
      if (!walk(cx, cy)) return seen;
      seen[q[0]] = 1;
      while (n < q.length) {
        var i = q[n++], x = i % cols, y = (i / cols) | 0;
        var nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        for (var k = 0; k < 4; k++) {
          var nx = nb[k][0], ny = nb[k][1];
          if (!inB(nx, ny) || !walk(nx, ny)) continue;
          var j = idx(nx, ny); if (seen[j]) continue; seen[j] = 1; q.push(j);
        }
      }
      return seen;
    }
    var home = byId.center || places[0];
    var fallbackCarved = []; // 需要兜底连廊的地点（正常布局下应为空）
    if (home) {
      var seen = bfsFrom(home.cx, home.cy, baseWalkable);
      places.forEach(function (p) {
        if (seen[idx(p.cx, p.cy)]) return;
        fallbackCarved.push(p.id);
        // 兜底：L 形连廊直通起点
        var x = p.cx, y = p.cy, sx = home.cx > x ? 1 : -1, sy = home.cy > y ? 1 : -1;
        while (x !== home.cx) { x += sx; if (!baseWalkable(x, y)) set(x, y, T.LANE); }
        while (y !== home.cy) { y += sy; if (!baseWalkable(x, y)) set(x, y, T.LANE); }
      });
      seen = bfsFrom(home.cx, home.cy, baseWalkable);
      // 孤岛可走格一律变回建筑块，保证"所有可走格互相可达"
      for (var i = 0; i < grid.length; i++) if (WALKABLE[grid[i]] && !seen[i]) grid[i] = T.BLOCK;
    }
    var walkableCount = 0;
    for (i = 0; i < grid.length; i++) if (WALKABLE[grid[i]]) walkableCount++;

    // ---------- 6. 建筑块 → 房子 ----------
    var buildings = [], assigned = new Uint8Array(cols * rows);
    for (cy = 0; cy < rows; cy++) for (cx = 0; cx < cols; cx++) {
      if (grid[idx(cx, cy)] !== T.BLOCK || assigned[idx(cx, cy)]) continue;
      var maxW = 0; while (cx + maxW < cols && maxW < 4 && grid[idx(cx + maxW, cy)] === T.BLOCK && !assigned[idx(cx + maxW, cy)]) maxW++;
      var bw = Math.max(1, Math.min(maxW, 2 + Math.floor(rng() * 3)));
      var bh = 1, okRow = true;
      while (bh < 3 && cy + bh < rows && okRow) {
        for (var k = 0; k < bw; k++) if (grid[idx(cx + k, cy + bh)] !== T.BLOCK || assigned[idx(cx + k, cy + bh)]) { okRow = false; break; }
        if (okRow) bh++;
      }
      if (bh > 1 && rng() < 0.3) bh--;
      for (var yy = 0; yy < bh; yy++) for (var xx = 0; xx < bw; xx++) assigned[idx(cx + xx, cy + yy)] = 1;
      var pal = PALETTES[Math.floor(rng() * PALETTES.length)];
      var facesRoad = false, laneNorth = false;
      for (k = 0; k < bw; k++) { if (baseWalkable(cx + k, cy + bh)) facesRoad = true; if (get(cx + k, cy - 1) === T.LANE) laneNorth = true; }
      var b = {
        cx: cx, cy: cy, cw: bw, ch: bh,
        x: cx * CELL + 2, y: cy * CELL + 2, w: bw * CELL - 4, h: bh * CELL - 4,
        hgt: laneNorth ? 10 : 12 + Math.floor(rng() * 3) * 6 + (bw * bh >= 6 ? 6 : 0), // 北邻小巷的房子压矮，免得屋顶盖住巷子
        wall: pal[0], roof: pal[1],
        lantern: facesRoad && rng() < 0.55,
        sign: (facesRoad && rng() < 0.45) ? { text: SIGN_TEXT[Math.floor(rng() * SIGN_TEXT.length)], color: SIGN_COLOR[Math.floor(rng() * SIGN_COLOR.length)] } : null,
        windows: []
      };
      // 窗：前墙上每 10px 一个，随机点亮
      for (var wx = 6; wx < b.w - 6; wx += 10) b.windows.push({ dx: wx, lit: rng() < 0.6 });
      buildings.push(b);
    }
    var trees = [];
    for (cy = 0; cy < rows; cy++) for (cx = 0; cx < cols; cx++) if (grid[idx(cx, cy)] === T.TREE) trees.push({ x: cx * CELL + CELL / 2, y: cy * CELL + CELL - 4, seed: rng() });
    var lanterns = [];
    buildings.forEach(function (b) { if (!b.lantern) return; lanterns.push({ x: b.x + 5, y: b.y + b.h + 2, hang: b.hgt }); lanterns.push({ x: b.x + b.w - 5, y: b.y + b.h + 2, hang: b.hgt }); });

    // ---------- 7. 封路 ----------
    var roadwork = { placeId: null, cells: [] };
    function setRoadwork(placeId) {
      blocked.fill(0);
      roadwork = { placeId: null, cells: [] };
      var p = placeId ? byId[placeId] : null;
      if (!p) return roadwork;
      // 在入口周边 3~4 格的某一侧封一段路；逐个方向尝试，必须保持全图连通
      var sectors = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      var rings = [[3, 4], [2, 3]];
      for (var ri = 0; ri < rings.length; ri++) {
        for (var si = 0; si < sectors.length; si++) {
          var cells = [];
          var sdx = sectors[si][0], sdy = sectors[si][1];
          for (var dy = -rings[ri][1]; dy <= rings[ri][1]; dy++) for (var dx = -rings[ri][1]; dx <= rings[ri][1]; dx++) {
            var cheb = Math.max(Math.abs(dx), Math.abs(dy));
            if (cheb < rings[ri][0]) continue;
            var inSector = sdx ? (dx * sdx > 0 && Math.abs(dx) >= Math.abs(dy)) : (dy * sdy > 0 && Math.abs(dy) >= Math.abs(dx));
            if (!inSector) continue;
            var x = p.cx + dx, y = p.cy + dy;
            if (baseWalkable(x, y) && !(x === home.cx && y === home.cy)) cells.push(idx(x, y));
          }
          if (cells.length < 2) continue;
          cells.forEach(function (i) { blocked[i] = 1; });
          var seen = bfsFrom(home.cx, home.cy, isWalkable), n = 0;
          for (var i = 0; i < seen.length; i++) if (seen[i]) n++;
          if (n === walkableCount - cells.length) { roadwork = { placeId: placeId, cells: cells }; return roadwork; }
          blocked.fill(0);
        }
      }
      return roadwork; // 没有安全封法 → 不封（极少见）
    }

    // ---------- 8. A* ----------
    function nearestWalkable(cx, cy) {
      if (isWalkable(cx, cy)) return { cx: cx, cy: cy };
      for (var r = 1; r <= 8; r++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (isWalkable(cx + dx, cy + dy)) return { cx: cx + dx, cy: cy + dy };
      }
      return null;
    }
    function findPathCells(a, b) {
      var s = nearestWalkable(a.cx, a.cy), g = nearestWalkable(b.cx, b.cy);
      if (!s || !g) return null;
      if (s.cx === g.cx && s.cy === g.cy) return [s];
      var N = cols * rows, gs = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      var si = idx(s.cx, s.cy), gi = idx(g.cx, g.cy);
      function hx(i) { var x = i % cols, y = (i / cols) | 0, dx = Math.abs(x - g.cx), dy = Math.abs(y - g.cy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); }
      var open = new Heap(function (p, q) { return p.f - q.f; });
      gs[si] = 0; open.push({ i: si, f: hx(si) });
      var DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
      while (open.size()) {
        var cur = open.pop().i;
        if (cur === gi) break;
        if (closed[cur]) continue;
        closed[cur] = 1;
        var x = cur % cols, y = (cur / cols) | 0;
        for (var k = 0; k < 8; k++) {
          var nx = x + DIRS[k][0], ny = y + DIRS[k][1];
          if (!isWalkable(nx, ny)) continue;
          if (k >= 4 && !(isWalkable(x + DIRS[k][0], y) && isWalkable(x, y + DIRS[k][1]))) continue; // 不切角
          var ni = idx(nx, ny), ng = gs[cur] + DIRS[k][2];
          if (ng < gs[ni]) { gs[ni] = ng; came[ni] = cur; open.push({ i: ni, f: ng + hx(ni) }); }
        }
      }
      if (came[gi] < 0) return null;
      var out = [], i = gi;
      while (i >= 0) { out.push({ cx: i % cols, cy: (i / cols) | 0 }); if (i === si) break; i = came[i]; }
      out.reverse();
      return out;
    }
    function isWalkableWorld(x, y) { var c = toCell(x, y); return isWalkable(c.cx, c.cy); }
    function lineClear(ax, ay, bx, by) {
      // 带 6px 边距的视线检测（用于路径拉直）
      var dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), n = Math.ceil(len / 8), r = 6;
      for (var i = 0; i <= n; i++) {
        var t = n ? i / n : 0, x = ax + dx * t, y = ay + dy * t;
        if (!isWalkableWorld(x - r, y - r) || !isWalkableWorld(x + r, y - r) || !isWalkableWorld(x - r, y + r) || !isWalkableWorld(x + r, y + r)) return false;
      }
      return true;
    }
    function findPath(ax, ay, bx, by) {
      var cells = findPathCells(toCell(ax, ay), toCell(bx, by));
      if (!cells) return null;
      var pts = cells.map(function (c) { return toWorld(c.cx, c.cy); });
      // 终点：若目标点本身可走就精确到点
      var last = cells[cells.length - 1], tc = toCell(bx, by);
      if (last.cx === tc.cx && last.cy === tc.cy && isWalkable(tc.cx, tc.cy)) pts[pts.length - 1] = { x: bx, y: by };
      // 起点去掉（自己所在格）
      pts[0] = { x: ax, y: ay };
      // 拉直
      var out = [], cur = 0;
      while (cur < pts.length - 1) {
        var far = cur + 1;
        for (var j = pts.length - 1; j > cur + 1; j--) if (lineClear(pts[cur].x, pts[cur].y, pts[j].x, pts[j].y)) { far = j; break; }
        out.push(pts[far]); cur = far;
      }
      return out;
    }

    function placeById(id) { return byId[id] || null; }
    // 运行时加地点（真实 POI → 路线站点）：落到最近的可走格，不改地形
    function addPlace(p) {
      if (byId[p.id]) return byId[p.id];
      var cc = clampCell(toCell(p.x, p.y)), w = nearestWalkable(cc.cx, cc.cy) || cc;
      p.cx = w.cx; p.cy = w.cy; var e = toWorld(w.cx, w.cy); p.ex = e.x; p.ey = e.y;
      p.types = p.types || []; p.visual = 'poi'; p.poi = true;
      places.push(p); byId[p.id] = p;
      return p;
    }
    function walkableCells() { var out = []; for (var i = 0; i < grid.length; i++) if (isWalkable(i % cols, (i / cols) | 0)) out.push({ cx: i % cols, cy: (i / cols) | 0 }); return out; }
    function isReachable(a, b) { var s = nearestWalkable(a.cx, a.cy); if (!s) return false; var seen = bfsFrom(s.cx, s.cy, isWalkable); return !!seen[idx(b.cx, b.cy)]; }

    return {
      cell: CELL, cols: cols, rows: rows, w: w, h: h, grid: grid, T: T,
      places: places, zones: zones, params: params, rng: rng, seed: seed,
      buildings: buildings, trees: trees, lanterns: lanterns, structs: structs, greens: greens,
      hRoads: hRoads, vRoads: vRoads, riverRows: riverRows, real: REAL,
      get: get, idx: idx, inB: inB, toCell: toCell, toWorld: toWorld,
      isWalkable: isWalkable, baseWalkable: baseWalkable, isWalkableWorld: isWalkableWorld, nearestWalkable: nearestWalkable,
      findPath: findPath, findPathCells: findPathCells, isReachable: isReachable, walkableCells: walkableCells,
      walkableCount: function () { return walkableCount; },
      setRoadwork: setRoadwork, getRoadwork: function () { return roadwork; }, blocked: blocked,
      placeById: placeById, addPlace: addPlace, home: home, fallbackCarved: fallbackCarved
    };
  }

  root.WZ.map = { CELL: CELL, T: T, WALKABLE: WALKABLE, create: create, fallbackContent: fallbackContent, mulberry32: mulberry32 };
})(typeof window !== 'undefined' ? window : globalThis);
