/* web/render.js —— 像素风绘制：地面预渲染、房子/地标/小人、天色五档、灯光、天气、标签与气泡（W1）
 * 只负责"画"，不持有游戏状态；由 engine.js 每帧调用。
 */
(function (root) {
  'use strict';
  root.WZ = root.WZ || {};

  var CELL = 32;
  var FONT = '"PingFang SC","Microsoft YaHei","Noto Sans SC","Helvetica Neue",Arial,sans-serif';
  // 缺省图标/配色（content/params.js 里有 typeIcons/tagColors 时优先用它们）
  var DEFAULT_TYPE_ICONS = { home: '🏠', rest: '🪑', food: '🍜', shop: '🎁', sight: '🏯', toilet: '🚻', lane: '↩', stage: '🎭' };
  var DEFAULT_TAG_COLORS = { walk: '#e07a5f', food: '#f2cc8f', crowd: '#81b29a', shop: '#f4a261', bored: '#9b8fd9', rush: '#e63946', toilet: '#4cc9f0', any: '#adb5bd' };
  // 天色五档：白天 / 下午 / 黄昏 / 入夜 / 黑透 —— 整体叠色宜轻，留给灯光做局部光（风来之国式）
  var TINTS = [null, 'rgba(255,196,120,0.08)', 'rgba(238,128,72,0.24)', 'rgba(36,44,100,0.42)', 'rgba(10,13,44,0.56)'];
  var LAMP = [0, 0, 0.5, 0.8, 1.0]; // 各档灯光强度
  // 地点图标抬高量（世界像素），按视觉类型
  var LABEL_LIFT = { center: 150, home: 150, wuma: 140, pier: 150, mochi: 200, lane: 44 };

  function hash(x, y) {
    var h = (x * 73856093) ^ (y * 19349663);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function wrapText(ctx, text, maxW) {
    var lines = [], cur = '';
    String(text || '').split('\n').forEach(function (para) {
      for (var i = 0; i < para.length; i++) {
        var ch = para[i];
        if (ch !== ' ' && ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
      }
      lines.push(cur); cur = '';
    });
    return lines.filter(function (l, i, a) { return l.length || a.length === 1; });
  }

  // ---------- 小人（16×24，脚底为锚点）----------
  function drawPerson(ctx, x, y, o) {
    if (root.WZ.characters && root.WZ.characters.draw(ctx, x, y, o)) return;
    x = Math.round(x); y = Math.round(y);
    var gray = o.gray;
    var body = gray ? '#8a8a8a' : (o.body || '#3a86ff');
    var skin = gray ? '#b5b5b5' : (o.skin || '#f3cba5');
    var hair = gray ? '#5a5a5a' : (o.hair || '#2b2118');
    var pants = gray ? '#6e6e6e' : (o.pants || '#2f3e5c');
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 7, y - 2, 14, 3); // 影子
    if (o.sit) {
      ctx.fillStyle = pants; ctx.fillRect(x - 7, y - 5, 14, 4);   // 盘腿
      ctx.fillStyle = body; ctx.fillRect(x - 6, y - 14, 12, 9);
      ctx.fillStyle = skin; ctx.fillRect(x - 8, y - 11, 2, 5); ctx.fillRect(x + 6, y - 11, 2, 5);
      ctx.fillRect(x - 5, y - 22, 10, 8);
      ctx.fillStyle = hair; ctx.fillRect(x - 5, y - 22, 10, 3);
      ctx.fillStyle = '#1b1b1b'; ctx.fillRect(x - 3, y - 17, 2, 1); ctx.fillRect(x + 1, y - 17, 2, 1); // 闭眼
      return;
    }
    var f = o.frame | 0, dir = o.dir || { x: 0, y: 1 };
    var up = dir.y < -0.5 && Math.abs(dir.x) < 0.6;
    // 腿（两帧交替抬腿）
    ctx.fillStyle = pants;
    if (o.moving) {
      ctx.fillRect(x - 6, y - 6, 4, f ? 4 : 6);
      ctx.fillRect(x + 2, y - 6, 4, f ? 6 : 4);
    } else { ctx.fillRect(x - 6, y - 6, 4, 6); ctx.fillRect(x + 2, y - 6, 4, 6); }
    // 身体
    ctx.fillStyle = body; ctx.fillRect(x - 6, y - 16, 12, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x - 6, y - 8, 12, 2);
    // 手臂
    ctx.fillStyle = skin; var sw = o.moving ? (f ? 2 : -2) : 0;
    ctx.fillRect(x - 8, y - 15 + sw, 2, 6); ctx.fillRect(x + 6, y - 15 - sw, 2, 6);
    // 头
    ctx.fillStyle = skin; ctx.fillRect(x - 5, y - 24, 10, 8);
    ctx.fillStyle = hair; ctx.fillRect(x - 5, y - 24, 10, 3);
    if (up) ctx.fillRect(x - 5, y - 24, 10, 8); // 背面只见头发
    else {
      ctx.fillStyle = '#1b1b1b'; var ex = Math.abs(dir.x) > 0.5 ? (dir.x > 0 ? 1 : -1) : 0;
      ctx.fillRect(x - 3 + ex, y - 20, 2, 2); ctx.fillRect(x + 1 + ex, y - 20, 2, 2);
    }
    if (o.hat === 'cap') { // 导游黄帽
      ctx.fillStyle = '#ffd166'; ctx.fillRect(x - 6, y - 26, 12, 3); ctx.fillRect(x - 5, y - 27, 10, 1);
      if (!up) ctx.fillRect(x - 7, y - 23, 3, 1);
    }
    if (o.hat === 'npc') { // 古人宽檐帽
      ctx.fillStyle = '#1f1f2e'; ctx.fillRect(x - 8, y - 25, 16, 2); ctx.fillRect(x - 4, y - 29, 8, 4);
    }
    if (o.flag) { // 导游小旗
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x + 8, y - 36, 1, 22);
      ctx.fillStyle = '#e63946'; ctx.fillRect(x + 9, y - 36, 7, 5);
    }
  }

  function create(map, opts) {
    opts = opts || {};
    var params = opts.params || map.params || {};
    var T = map.T;
    var hasDoc = typeof document !== 'undefined';
    var R = {
      map: map, sprites: {}, ground: null, glow: null,
      typeIcons: Object.assign({}, DEFAULT_TYPE_ICONS, params.typeIcons || {}),
      tagColors: Object.assign({}, DEFAULT_TAG_COLORS, params.tagColors || {}),
      badgeRects: [] // 上一帧地点图标的屏幕矩形（供点击命中）
    };

    // ---------- 精灵（可选，缺图不报错）----------
    // 默认只探测 3 个地标图；要用更多精灵在 params.engine.sprites 列名字（如 'player'）
    R.loadSprites = function (base, names) {
      if (!hasDoc) return;
      names = names || ['wuma', 'mochi', 'center'];
      names.forEach(function (n) {
        var img = new Image();
        img.onload = function () { R.sprites[n] = img; };
        img.onerror = function () { /* 缺图静默 */ };
        img.src = (base || 'assets/') + n + '.png';
      });
    };

    // ---------- 地面预渲染 ----------
    function tile(c, t, cx, cy) {
      var x = cx * CELL, y = cy * CELL, hv = hash(cx, cy), i;
      switch (t) {
        case T.ROAD: // 石板路：暖灰 + 浅缝，别再灰蓝
          c.fillStyle = (hv & 3) === 0 ? '#a49c8e' : '#aaa294'; c.fillRect(x, y, CELL, CELL);
          c.fillStyle = 'rgba(255,255,255,0.05)';
          for (i = 0; i < 3; i++) c.fillRect(x + ((hv >> (i * 5)) & 31), y + ((hv >> (i * 5 + 3)) & 31), 2, 2);
          var up = map.get(cx, cy - 1) === T.ROAD, dn = map.get(cx, cy + 1) === T.ROAD, lf = map.get(cx - 1, cy) === T.ROAD, rt = map.get(cx + 1, cy) === T.ROAD;
          c.fillStyle = '#c9c0ae';
          if (!up) c.fillRect(x, y, CELL, 3); if (!dn) c.fillRect(x, y + CELL - 3, CELL, 3);
          if (!lf) c.fillRect(x, y, 3, CELL); if (!rt) c.fillRect(x + CELL - 3, y, 3, CELL);
          c.fillStyle = '#d9c46a';
          if (!up && dn && map.get(cx, cy + 2) !== T.ROAD && lf && rt) for (i = 4; i < CELL; i += 12) c.fillRect(x + i, y + CELL - 1, 6, 2);
          if (!lf && rt && map.get(cx + 2, cy) !== T.ROAD && up && dn) for (i = 4; i < CELL; i += 12) c.fillRect(x + CELL - 1, y + i, 2, 6);
          break;
        case T.LANE: // 小巷：青石板
          c.fillStyle = '#96897a'; c.fillRect(x, y, CELL, CELL);
          for (i = 0; i < 16; i++) { var sx = (i & 3) * 8, sy = (i >> 2) * 8, hs = hash(cx * 4 + (i & 3), cy * 4 + (i >> 2)); c.fillStyle = (hs & 1) ? '#a2958a' : '#877b6c'; c.fillRect(x + sx + 1, y + sy + 1, 6, 6); }
          break;
        case T.PLAZA: case T.STRUCT: // 广场：暖石板
          c.fillStyle = '#ddd3bc'; c.fillRect(x, y, CELL, CELL);
          c.fillStyle = '#c8bda6'; c.fillRect(x, y, CELL, 1); c.fillRect(x, y, 1, CELL); c.fillRect(x, y + 16, CELL, 1); c.fillRect(x + 16, y, 1, CELL);
          break;
        case T.GRASS: case T.TREE: // 草地：干净明快
          c.fillStyle = '#7cbf5e'; c.fillRect(x, y, CELL, CELL);
          for (i = 0; i < 6; i++) { c.fillStyle = (i & 1) ? '#6bb050' : '#93d375'; c.fillRect(x + ((hv >> (i * 4)) & 31), y + ((hv >> (i * 4 + 2)) & 31), 2, 2); }
          break;
        case T.WATER: // 江面：亮一些的青蓝
          c.fillStyle = '#5aa2d8'; c.fillRect(x, y, CELL, CELL);
          c.fillStyle = '#4e94cc'; c.fillRect(x + (hv & 15), y + ((hv >> 4) & 15), 10, 4);
          if (((hv >> 9) & 3) === 0) { c.fillStyle = '#a5d3f0'; c.fillRect(x + ((hv >> 11) & 15), y + ((hv >> 15) & 31), 7, 1); }
          break;
        case T.BANK: // 江滨木栈道/驳岸
          c.fillStyle = '#b98a5a'; c.fillRect(x, y, CELL, CELL);
          c.fillStyle = '#96683c'; for (i = 0; i < CELL; i += 8) c.fillRect(x, y + i, CELL, 1);
          c.fillRect(x + (hv & 31), y + 8 * ((hv >> 5) & 3), 1, 8);
          break;
        default: // BLOCK：泥地，基本被房子盖住
          c.fillStyle = '#9d9282'; c.fillRect(x, y, CELL, CELL);
          c.fillStyle = '#8c8171'; c.fillRect(x + (hv & 31), y + ((hv >> 5) & 31), 3, 2);
      }
    }
    R.prerender = function () {
      if (!hasDoc) return;
      var g = document.createElement('canvas'); g.width = map.w; g.height = map.h;
      var c = g.getContext('2d');
      for (var cy = 0; cy < map.rows; cy++) for (var cx = 0; cx < map.cols; cx++) tile(c, map.grid[map.idx(cx, cy)], cx, cy);
      R.ground = g;
      var gl = document.createElement('canvas'); gl.width = gl.height = 64;
      var gc = gl.getContext('2d');
      var grad = gc.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,170,60,0.6)'); grad.addColorStop(0.5, 'rgba(255,140,40,0.2)'); grad.addColorStop(1, 'rgba(255,120,30,0)');
      gc.fillStyle = grad; gc.fillRect(0, 0, 64, 64);
      R.glow = gl;
    };
    R.drawGround = function (ctx, rect) {
      if (!R.ground) return;
      var sx = Math.max(0, Math.floor(rect.x)), sy = Math.max(0, Math.floor(rect.y));
      var sw = Math.min(map.w - sx, Math.ceil(rect.w) + 2), sh = Math.min(map.h - sy, Math.ceil(rect.h) + 2);
      if (sw <= 0 || sh <= 0) return;
      ctx.drawImage(R.ground, sx, sy, sw, sh, sx, sy, sw, sh);
    };

    // ---------- 人潮区 / 封路 ----------
    R.drawZones = function (ctx, zones, t) {
      zones.forEach(function (z) {
        ctx.fillStyle = 'rgba(230,57,70,0.22)'; ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeStyle = 'rgba(230,57,70,0.6)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(z.x + 1, z.y + 1, z.w - 2, z.h - 2); ctx.setLineDash([]);
        var n = Math.min(90, Math.floor(z.w * z.h / 900));
        for (var i = 0; i < n; i++) {
          var hv = hash(i * 7 + 1, z.x + z.y);
          var px = z.x + 4 + (hv % Math.max(1, z.w - 8)), py = z.y + 6 + ((hv >> 8) % Math.max(1, z.h - 10));
          px += Math.sin(t * 2 + i) * 2; py = Math.round(py); px = Math.round(px);
          ctx.fillStyle = (hv & 1) ? '#7a1f2b' : '#9c2a3a'; ctx.fillRect(px, py - 3, 3, 4);
          ctx.fillStyle = '#f0c4a0'; ctx.fillRect(px, py - 5, 3, 2);
        }
      });
    };
    R.drawRoadwork = function (ctx, cells) {
      cells.forEach(function (i) {
        var cx = i % map.cols, cy = (i / map.cols) | 0, x = cx * CELL, y = cy * CELL;
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, y, CELL, CELL);
        for (var k = 0; k < 4; k++) { ctx.fillStyle = (k & 1) ? '#222' : '#f4c430'; ctx.fillRect(x + 4 + k * 6, y + 12, 6, 7); }
        ctx.fillStyle = '#444'; ctx.fillRect(x + 5, y + 19, 2, 5); ctx.fillRect(x + 25, y + 19, 2, 5);
        // 锥桶
        ctx.fillStyle = '#ff7b2a'; ctx.fillRect(x + 25, y + 3, 2, 2); ctx.fillRect(x + 24, y + 5, 4, 3); ctx.fillRect(x + 23, y + 8, 6, 2);
        ctx.fillStyle = '#ff7b2a'; ctx.fillRect(x + 5, y + 24, 2, 2); ctx.fillRect(x + 4, y + 26, 4, 3); ctx.fillRect(x + 3, y + 29, 6, 2);
      });
    };

    // ---------- 房子 ----------
    function drawSign(ctx, cxs, by, sign, lit) {
      var bw = sign.text.length * 9 + 6;
      ctx.fillStyle = lit ? '#fff1a8' : sign.color; ctx.fillRect(cxs - bw / 2, by, bw, 11);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cxs - bw / 2, by + 10, bw, 1);
      ctx.fillStyle = lit ? sign.color : '#fff'; ctx.font = 'bold 8px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(sign.text, cxs, by + 9);
    }
    function drawBuilding(ctx, b, stage) {
      var x = b.x, y = b.y, w = b.w, h = b.h, hg = b.hgt;
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + w, y + h - hg + 5, 4, hg); ctx.fillRect(x + 4, y + h, w, 4);
      ctx.fillStyle = b.wall; ctx.fillRect(x, y + h - hg, w, hg);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x, y + h - 3, w, 3);
      var wy = y + h - hg + (b.sign ? 14 : 4);
      if (wy + 5 <= y + h - 2) { ctx.fillStyle = '#3b4a63'; b.windows.forEach(function (wn) { ctx.fillRect(x + wn.dx, wy, 4, 5); }); }
      if (b.lantern || b.sign) { ctx.fillStyle = '#4a3524'; ctx.fillRect(x + ((w / 2) | 0) - 4, y + h - 10, 8, 10); }
      ctx.fillStyle = b.roof; ctx.fillRect(x, y - hg, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; for (var yy = y - hg + 5; yy < y - hg + h - 2; yy += 5) ctx.fillRect(x, yy, w, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.07)'; for (var xx = x + 8; xx < x + w - 2; xx += 8) ctx.fillRect(xx, y - hg, 1, h); // 体素屋顶格（参考图风格）
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(x + w - 3, y - hg, 3, h);                                   // 屋顶右侧暗边
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x, y - hg, w, 2); ctx.fillRect(x, y - hg, 2, h);
      ctx.strokeStyle = 'rgba(46,58,51,0.55)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y - hg + 0.5, w - 1, h + hg - 1); // 墨色硬描边
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, y + h - hg - 2, w, 2);
      if (b.sign && hg >= 16) drawSign(ctx, x + w / 2, y + h - hg + 2, b.sign, stage >= 2);
    }
    function drawTree(ctx, tr) {
      var x = Math.round(tr.x), y = Math.round(tr.y);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x - 8, y - 2, 16, 3);
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x - 2, y - 10, 4, 10);
      ctx.fillStyle = '#3e8a3c'; ctx.beginPath(); ctx.arc(x, y - 17, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5aae55'; ctx.beginPath(); ctx.arc(x - 3, y - 20, 6, 0, Math.PI * 2); ctx.fill();
    }

    // ---------- 地点专属结构 ----------
    function pillar(ctx, x, y, h, color) { ctx.fillStyle = color || '#b3261e'; ctx.fillRect(x, y - h, 6, h); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 4, y - h, 2, h); }
    function tieredRoof(ctx, x, y, w, color) { // 两层灰瓦，翘角
      ctx.fillStyle = color || '#4b525a';
      ctx.fillRect(x - 6, y, w + 12, 6); ctx.fillRect(x - 10, y - 2, 4, 3); ctx.fillRect(x + w + 6, y - 2, 4, 3);
      ctx.fillRect(x + 6, y - 8, w - 12, 8); ctx.fillRect(x + 2, y - 10, 4, 3); ctx.fillRect(x + w - 6, y - 10, 4, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 6, y, w + 12, 1); ctx.fillRect(x + 6, y - 8, w - 12, 1);
    }
    function text(ctx, str, x, y, size, color, bold) { ctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(str, x, y); }
    function drawStruct(ctx, s, t, stage) {
      var x = s.cx * CELL, y = s.cy * CELL, w = s.w * CELL, h = s.h * CELL, base = y + h, mx = x + w / 2;
      var sp;
      // 有 AI 精灵图的地标优先用图（assets/<place.id>.png，缺图走程序化绘制）
      if (s.place && s.place.id && R.sprites[s.place.id]) {
        var img = R.sprites[s.place.id];
        ctx.drawImage(img, Math.round(mx - img.width / 2), Math.round(base - img.height));
        return;
      }
      switch (s.kind) {
        case 'center': case 'home': // 游客中心：白墙蓝顶大楼 + 红牌 + 旗
          sp = R.sprites.center;
          if (sp) { ctx.drawImage(sp, Math.round(mx - sp.width / 2), Math.round(base - sp.height)); return; }
          ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 6, base, w, 5);
          ctx.fillStyle = '#f1ece2'; ctx.fillRect(x + 4, y + 20, w - 8, h - 20);
          ctx.fillStyle = '#9fc5e8'; for (var i = 0; i < 4; i++) ctx.fillRect(x + 14 + i * 36, y + 34, 14, 12);
          ctx.fillStyle = '#4a6fa5'; ctx.fillRect(mx - 14, base - 22, 28, 22); ctx.fillStyle = '#cfe3f7'; ctx.fillRect(mx - 11, base - 19, 10, 16); ctx.fillRect(mx + 1, base - 19, 10, 16);
          ctx.fillStyle = '#3f6fb5'; ctx.fillRect(x, y, w, 22); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x, y, w, 3);
          ctx.fillStyle = '#c0392b'; ctx.fillRect(mx - 40, base - 44, 80, 16); text(ctx, '游客中心', mx, base - 32, 11, '#fff', true);
          ctx.fillStyle = '#777'; ctx.fillRect(x + w - 14, y - 26, 2, 30); ctx.fillStyle = '#ffd166'; ctx.fillRect(x + w - 12, y - 26, 12, 8);
          break;
        case 'wuma': // 五马街牌楼：红柱、三层檐、金匾
          sp = R.sprites.wuma;
          if (sp) { ctx.drawImage(sp, Math.round(mx - sp.width / 2), Math.round(base - sp.height)); return; }
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 4, base - 2, w, 4);
          pillar(ctx, x + 6, base, 46); pillar(ctx, x + w - 12, base, 46); pillar(ctx, mx - 3, base, 46);
          ctx.fillStyle = '#2f6b4f'; ctx.fillRect(x, base - 50, w, 6);
          tieredRoof(ctx, x, base - 56, w, '#4b525a');
          tieredRoof(ctx, mx - 30, base - 74, 60, '#4b525a');
          ctx.fillStyle = '#ffd166'; ctx.fillRect(mx - 24, base - 70, 48, 14); ctx.fillStyle = '#b3261e'; ctx.fillRect(mx - 24, base - 70, 48, 1); ctx.fillRect(mx - 24, base - 57, 48, 1);
          text(ctx, '五马街', mx, base - 59, 10, '#5a2a0c', true);
          break;
        case 'mochi': // 墨池：墨色池水 + 石碑 + 亭
          sp = R.sprites.mochi;
          if (sp) { ctx.drawImage(sp, Math.round(mx - sp.width / 2), Math.round(base - sp.height)); return; }
          ctx.fillStyle = 'rgba(20,20,40,0.55)'; ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = 'rgba(200,210,230,0.35)'; ctx.lineWidth = 1;
          for (i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(mx + Math.sin(t + i) * 10, y + h / 2, 6 + ((t * 10 + i * 8) % 24), 0, Math.PI * 2); ctx.stroke(); }
          ctx.fillStyle = '#3a7d44'; ctx.beginPath(); ctx.arc(x + 14, y + 12, 5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(x + w - 16, y + h - 12, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#8b8f94'; ctx.fillRect(x, y + h - 4, w, 4); ctx.fillRect(x, y, w, 3); ctx.fillRect(x, y, 3, h); ctx.fillRect(x + w - 3, y, 3, h);
          ctx.fillStyle = '#2f3237'; ctx.fillRect(x + w + 6, base - 30, 12, 30); ctx.fillStyle = '#55595f'; ctx.fillRect(x + w + 4, base - 32, 16, 3);
          text(ctx, '墨', x + w + 12, base - 18, 8, '#fff', true); text(ctx, '池', x + w + 12, base - 8, 8, '#fff', true);
          pillar(ctx, x - 26, base, 24); pillar(ctx, x - 8, base, 24); tieredRoof(ctx, x - 28, base - 28, 28, '#5b5e66');
          break;
        case 'pier': // 码头：系船桩 + 木船 + 路牌
          ctx.fillStyle = '#4a3524'; ctx.fillRect(x + 2, y + 2, 4, 8); ctx.fillRect(x + w - 6, y + 2, 4, 8); ctx.fillRect(x + 2, y + h - 12, 4, 8); ctx.fillRect(x + w - 6, y + h - 12, 4, 8);
          ctx.fillStyle = '#5c3b1e'; ctx.fillRect(x - 46, y + 24 + Math.round(Math.sin(t * 1.5) * 2), 40, 12);
          ctx.fillStyle = '#f1ece2'; ctx.fillRect(x - 36, y + 14 + Math.round(Math.sin(t * 1.5) * 2), 18, 10);
          ctx.fillStyle = '#b3261e'; ctx.fillRect(x - 22, y + 6 + Math.round(Math.sin(t * 1.5) * 2), 5, 4); ctx.fillStyle = '#4a3524'; ctx.fillRect(x - 23, y + 6, 1, 18);
          ctx.fillStyle = '#777'; ctx.fillRect(x + w + 4, base - 30, 2, 30); ctx.fillStyle = '#1f6f8b'; ctx.fillRect(x + w + 2, base - 34, 30, 12); text(ctx, '码头', x + w + 17, base - 25, 8, '#fff', true);
          break;
        case 'pagoda': // 江心双塔：砖塔七级，黄昏后塔尖亮灯
          (function () {
            var tw = Math.min(w, CELL) - 6, cx2 = x + w / 2, floors = 6, fh = 8;
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx2 - tw / 2 - 2, base, tw + 4, 4);
            for (i = 0; i < floors; i++) {
              var fy = base - (i + 1) * fh, fw = tw - i * 2;
              ctx.fillStyle = i % 2 ? '#b9ac96' : '#c8bca6'; ctx.fillRect(cx2 - fw / 2, fy, fw, fh);
              ctx.fillStyle = '#5b5e66'; ctx.fillRect(cx2 - fw / 2 - 3, fy - 2, fw + 6, 3); // 檐
              if ((stage === 4 || stage === 3) && i % 2 === 0) { ctx.fillStyle = '#ffd166'; ctx.fillRect(cx2 - 2, fy + 2, 4, 4); }
            }
            ctx.fillStyle = '#5b5e66'; ctx.fillRect(cx2 - 1, base - floors * fh - 8, 2, 8); ctx.fillStyle = '#ffd166'; ctx.fillRect(cx2 - 2, base - floors * fh - 11, 4, 4); // 塔尖
            if (stage >= 3) { ctx.fillStyle = 'rgba(255,209,102,0.28)'; ctx.fillRect(cx2 - tw, base - floors * fh - 12, tw * 2, floors * fh + 12); } // 夜里塔身透光
          })();
          break;
        case 'hill': // 雁荡/楠溪：连绵山峰，植被渐变
          (function () {
            var peaks = [[0.18, 0.95, '#4e6b52'], [0.45, 0.72, '#5d7a5f'], [0.72, 1.05, '#44604a']];
            for (i = 0; i < peaks.length; i++) {
              var pk = peaks[i], px = x + w * pk[0], ph = CELL * 3.4 * pk[1], pw = CELL * 2.4;
              ctx.fillStyle = pk[2];
              ctx.beginPath(); ctx.moveTo(px - pw / 2, base); ctx.lineTo(px, base - ph); ctx.lineTo(px + pw / 2, base); ctx.closePath(); ctx.fill();
              ctx.fillStyle = 'rgba(255,255,255,0.14)';
              ctx.beginPath(); ctx.moveTo(px, base - ph); ctx.lineTo(px + pw / 2, base); ctx.lineTo(px + pw * 0.12, base); ctx.closePath(); ctx.fill();
            }
            if (stage >= 3) { ctx.fillStyle = 'rgba(255,209,102,0.10)'; ctx.fillRect(x, base - CELL * 3.8, w, CELL * 3.8); }
          })();
          break;
        case 'food': // 小吃摊：木柜台 + 红白雨棚 + 热气
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 4, base, w, 4);
          ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x + 4, base - 16, w - 8, 16); ctx.fillStyle = '#a97142'; ctx.fillRect(x + 4, base - 16, w - 8, 3);
          ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x + 14, base - 22, 14, 6); ctx.fillRect(x + w - 30, base - 22, 14, 6);
          for (i = 0; i < w; i += 8) { ctx.fillStyle = ((i / 8) & 1) ? '#f5f5f5' : '#c0392b'; ctx.fillRect(x + i, base - 36, 8, 10); }
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x, base - 26, w, 2);
          ctx.fillStyle = 'rgba(255,255,255,0.55)'; for (i = 0; i < 3; i++) { var sy = base - 26 - ((t * 14 + i * 9) % 26); ctx.fillRect(x + 18 + i * 6 + Math.round(Math.sin(t * 3 + i) * 2), sy, 2, 2); }
          text(ctx, '小吃', mx, base - 28, 8, '#fff', true);
          break;
        case 'rest': // 歇脚：树 + 长椅 + 茶桌
          drawTree(ctx, { x: x + 14, y: base - 2 });
          ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x + 32, base - 12, 36, 5); ctx.fillRect(x + 32, base - 18, 36, 4);
          ctx.fillRect(x + 34, base - 7, 3, 7); ctx.fillRect(x + 63, base - 7, 3, 7);
          ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x + 72, base - 14, 20, 4); ctx.fillRect(x + 80, base - 10, 4, 10);
          ctx.fillStyle = '#f1ece2'; ctx.fillRect(x + 77, base - 21, 8, 7); ctx.fillRect(x + 85, base - 19, 3, 2);
          text(ctx, '歇脚', mx, base - 30, 8, '#2f3e5c', true);
          break;
        case 'shop': // 手信店：暖墙绿顶 + 礼盒
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 4, base, w, 4);
          ctx.fillStyle = '#e8c9a0'; ctx.fillRect(x + 2, base - 26, w - 4, 26);
          ctx.fillStyle = '#2e7d32'; ctx.fillRect(x - 2, base - 34, w + 4, 9);
          var cols3 = ['#c0392b', '#f4c430', '#1f6f8b'];
          for (i = 0; i < 3; i++) { ctx.fillStyle = cols3[i]; ctx.fillRect(x + 12 + i * 26, base - 18, 10, 10); ctx.fillStyle = '#fff'; ctx.fillRect(x + 16 + i * 26, base - 18, 2, 10); ctx.fillRect(x + 12 + i * 26, base - 14, 10, 2); }
          text(ctx, '手信', mx, base - 26, 8, '#fff', true);
          break;
        case 'toilet': // 公厕：白盒蓝顶 + 男女色块
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 4, base, w, 4);
          ctx.fillStyle = '#f1ece2'; ctx.fillRect(x + 8, base - 24, w - 16, 24);
          ctx.fillStyle = '#1f6f8b'; ctx.fillRect(x + 4, base - 32, w - 8, 9);
          ctx.fillStyle = '#3a86ff'; ctx.fillRect(x + 20, base - 18, 8, 14); ctx.fillStyle = '#e07a9a'; ctx.fillRect(x + w - 28, base - 18, 8, 14);
          text(ctx, '厕', mx, base - 25, 8, '#fff', true);
          break;
        case 'stage': // 戏台：红柱红幕
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 4, base, w, 4);
          ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x, base - 10, w, 10);
          ctx.fillStyle = '#8b1e2b'; ctx.fillRect(x + 8, base - 40, w - 16, 30); ctx.fillStyle = '#b3261e'; for (i = 0; i < 5; i++) ctx.fillRect(x + 12 + i * 16, base - 40, 4, 30);
          pillar(ctx, x + 2, base - 8, 36); pillar(ctx, x + w - 8, base - 8, 36);
          tieredRoof(ctx, x, base - 46, w, '#4b525a');
          text(ctx, '戏', mx, base - 20, 10, '#ffd166', true);
          break;
        case 'stall': { // 五马街摊位
          var hue = ['#c0392b', '#f4c430', '#2e7d32', '#1f6f8b'][Math.floor(s.seed * 4)];
          ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x + 3, base - 12, CELL - 6, 12);
          ctx.fillStyle = hue; ctx.fillRect(x, base - 24, CELL, 8); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + 4, base - 24, 4, 8); ctx.fillRect(x + 16, base - 24, 4, 8);
          ctx.fillStyle = '#4a3524'; ctx.fillRect(x + 4, base - 16, 2, 4); ctx.fillRect(x + CELL - 6, base - 16, 2, 4);
          ctx.fillStyle = '#ffd166'; ctx.fillRect(x + 8, base - 15, 4, 3); ctx.fillStyle = '#e07a5f'; ctx.fillRect(x + 18, base - 15, 4, 3);
          break;
        }
        default: // 看点：小亭子
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x + 4, base, w, 4);
          ctx.fillStyle = '#9a9a9a'; ctx.fillRect(x + 6, base - 6, w - 12, 6);
          pillar(ctx, x + 10, base - 4, 30); pillar(ctx, x + w - 16, base - 4, 30);
          tieredRoof(ctx, x + 4, base - 38, w - 8, '#4b525a');
      }
    }

    // ---------- 场景（按 y 排序的房子/结构/树/小人）----------
    R.drawScene = function (ctx, rect, ents, t, stage) {
      var list = [], x0 = rect.x - 80, y0 = rect.y - 120, x1 = rect.x + rect.w + 80, y1 = rect.y + rect.h + 60, i;
      var bs = map.buildings;
      for (i = 0; i < bs.length; i++) { var b = bs[i]; if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y - b.hgt > y1) continue; list.push({ y: b.y + b.h, b: b }); }
      var ss = map.structs;
      for (i = 0; i < ss.length; i++) { var s = ss[i], sx = s.cx * CELL, sy = s.cy * CELL; if (sx + s.w * CELL < x0 - 60 || sx > x1 + 60 || sy + s.h * CELL < y0 || sy > y1 + 80) continue; list.push({ y: sy + s.h * CELL - 1, s: s }); }
      var ts = map.trees;
      for (i = 0; i < ts.length; i++) { var tr = ts[i]; if (tr.x < x0 || tr.x > x1 || tr.y < y0 || tr.y > y1) continue; list.push({ y: tr.y, tr: tr }); }
      for (i = 0; i < ents.length; i++) { var e = ents[i]; if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue; list.push({ y: e.y + 0.5, e: e }); }
      list.sort(function (a, b) { return a.y - b.y; });
      for (i = 0; i < list.length; i++) {
        var it = list[i];
        if (it.b) drawBuilding(ctx, it.b, stage);
        else if (it.s) drawStruct(ctx, it.s, t, stage);
        else if (it.tr) drawTree(ctx, it.tr);
        else it.e.draw(ctx);
      }
    };

    // ---------- 天色 / 灯光 ----------
    R.stageOf = function (clockMin, thresholds) {
      var th = thresholds || [256, 512, 768, 972], s = 0;
      for (var i = 0; i < th.length; i++) if (clockMin >= th[i]) s = i + 1;
      return s;
    };
    R.drawTint = function (ctx, view, stage, weather, t) {
      var tint = TINTS[stage];
      if (weather === 'rain') { ctx.fillStyle = 'rgba(50,60,85,0.18)'; ctx.fillRect(0, 0, view.w, view.h); }
      if (weather === 'typhoon') { ctx.fillStyle = 'rgba(30,38,60,0.32)'; ctx.fillRect(0, 0, view.w, view.h); }
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, view.w, view.h); }
      if (weather === 'heat') { ctx.fillStyle = 'rgba(255,130,30,' + (0.10 + 0.06 * Math.sin(t * 5)) + ')'; ctx.fillRect(0, 0, view.w, view.h); }
    };
    R.drawLights = function (ctx, rect, stage, t) {
      var a = LAMP[stage]; if (!a) return;
      var x0 = rect.x - 60, y0 = rect.y - 80, x1 = rect.x + rect.w + 60, y1 = rect.y + rect.h + 60, i;
      var ls = map.lanterns;
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < ls.length; i++) {
        var l = ls[i]; if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
        var ly = l.y - l.hang + 2;
        // 双层光晕：大而淡的环境晕 + 小而亮的核心晕，加轻微呼吸（风来之国式局部光）
        if (R.glow) {
          ctx.globalAlpha = a * 0.45 * (0.85 + 0.15 * Math.sin(t * 2.2 + i * 1.7));
          ctx.drawImage(R.glow, l.x - 56, ly - 48, 112, 112);
          ctx.globalAlpha = a * (0.85 + 0.2 * Math.sin(t * 3 + i));
          ctx.drawImage(R.glow, l.x - 32, ly - 28, 64, 64);
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      for (i = 0; i < ls.length; i++) {
        l = ls[i]; if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
        ly = l.y - l.hang + 2;
        ctx.fillStyle = '#4a3524'; ctx.fillRect(l.x, ly - 5, 1, 3);
        ctx.fillStyle = '#d7263d'; ctx.fillRect(l.x - 2, ly - 2, 5, 7);
        ctx.fillStyle = '#ffe08a'; ctx.fillRect(l.x - 1, ly, 3, 3);
      }
      if (stage >= 3) { // 窗户亮灯 + 窗光光池（灯往地上洒一滩暖光）
        var bs = map.buildings;
        for (i = 0; i < bs.length; i++) {
          var b = bs[i]; if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1 || b.hgt < 16) continue;
          var wy = b.y + b.h - b.hgt + (b.sign ? 14 : 4); if (wy + 5 > b.y + b.h - 2) continue;
          var anyLit = false;
          ctx.fillStyle = 'rgba(255,216,122,' + (0.6 + 0.3 * a) + ')';
          for (var k = 0; k < b.windows.length; k++) if (b.windows[k].lit) { ctx.fillRect(b.x + b.windows[k].dx, wy, 4, 5); anyLit = true; }
          if (anyLit && R.glow) { // 门前光池
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.28 * a;
            ctx.drawImage(R.glow, b.x + b.w / 2 - b.w * 0.9, b.y + b.h - 10, b.w * 1.8, 26);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
        }
      }
    };

    // ---------- 等轴体素街区（PRD-v4 §3 P2，10/25：移植 demo buildBg）----------
    // 世界(16px 网格) → 等轴投影：X=(x-y)·C，Y=(x+y)·C/2；道路/水面/绿地来自项目真实 mask，建筑按格生成体块
    var ISO_C = 0.7071;
    R.ISO_C = ISO_C;
    R.proj = function (x, y) { return { X: (x - y) * ISO_C, Y: (x + y) * ISO_C * 0.5 }; };
    R.isoGround = null; R.isoBounds = null;
    R.buildIsoGround = function (mask, cell) {
      if (!hasDoc || !mask || !mask.length) return;
      cell = cell || 32;
      var rows = mask.length, cols = mask[0].length;
      var minX = (0 - (rows - 1)) * ISO_C * cell, maxX = (cols - 1) * ISO_C * cell;
      var maxY = ((cols - 1) + (rows - 1)) * ISO_C * 0.5 * cell;
      var pad = 140;
      R.isoBounds = { x0: minX - pad, y0: -pad, w: Math.ceil(maxX - minX) + pad * 2, h: Math.ceil(maxY) + pad * 2 + 60 };
      var g = document.createElement('canvas');
      g.width = R.isoBounds.w; g.height = R.isoBounds.h;
      var c = g.getContext('2d');
      var COLORS = { W: '#4d7ba6', G: '#7cbf5e', R: '#a49c8e', P: '#ddd3bc', B: '#b98a5a' };
      var ROOF = [['#C9CED2', '#9EA6AD', '#B3BAC0'], ['#D98A62', '#A8603F', '#C27552'], ['#8FB7D9', '#5F86A8', '#7AA0C4'], ['#E9DCB8', '#BFAF86', '#D4C59E']];
      function P2(x, y) { var p = R.proj(x, y); return { x: p.X - R.isoBounds.x0, y: p.Y - R.isoBounds.y0 }; }
      function hash(c2, r2) { var n = Math.sin(c2 * 127.1 + r2 * 311.7) * 43758.5453; return n - Math.floor(n); }
      function diamond(c2, pts, fill) {
        c2.fillStyle = fill; c2.beginPath();
        c2.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < 4; i++) c2.lineTo(pts[i].x, pts[i].y);
        c2.closePath(); c2.fill();
      }
      function cellPts(cx, cy) {
        return [P2(cx * cell, cy * cell), P2(cx * cell + cell, cy * cell), P2(cx * cell + cell, cy * cell + cell), P2(cx * cell, cy * cell + cell)];
      }
      // pass 1：地面（W 水 / G 绿 / R 路 / P 广场 / B 驳岸；BLOCK 留空给建筑）
      for (var cy = 0; cy < rows; cy++) for (var cx = 0; cx < cols; cx++) {
        var ch = mask[cy][cx];
        if (ch === '.') continue;
        diamond(c, cellPts(cx, cy), COLORS[ch] || '#9d9282');
      }
      // pass 2：体素建筑（BLOCK 按横向 run 合并；两.visible 面 + 顶面，随机屋顶色）
      for (cy = 0; cy < rows; cy++) {
        var cx2 = 0;
        while (cx2 < cols) {
          if (mask[cy][cx2] !== '.') { cx2++; continue; }
          var run = 1;
          while (cx2 + run < cols && mask[cy][cx2 + run] === '.') run++;
          for (var k = 0; k < run; k++) {
            var hv = hash(cx2 + k, cy);
            var hgt = 14 + Math.floor(hv * 4) * 9 + (hv > 0.92 ? 26 : 0);
            var pal = ROOF[Math.floor(hash(cx2 + k + 7, cy + 3) * ROOF.length)];
            var base = cellPts(cx2 + k, cy), top = [];
            for (var q = 0; q < 4; q++) top.push({ x: base[q].x, y: base[q].y - hgt });
            // 右前面（东南：base[1]-base[2] 向下投影）
            c.fillStyle = pal[1];
            c.beginPath();
            c.moveTo(top[1].x, top[1].y); c.lineTo(top[2].x, top[2].y);
            c.lineTo(base[2].x, base[2].y); c.lineTo(base[1].x, base[1].y);
            c.closePath(); c.fill();
            // 左前面（西南：base[2]-base[3]）
            c.fillStyle = pal[0];
            c.beginPath();
            c.moveTo(top[2].x, top[2].y); c.lineTo(top[3].x, top[3].y);
            c.lineTo(base[3].x, base[3].y); c.lineTo(base[2].x, base[2].y);
            c.closePath(); c.fill();
            // 顶面
            c.fillStyle = pal[2];
            c.beginPath();
            c.moveTo(top[0].x, top[0].y);
            for (var q2 = 1; q2 < 4; q2++) c.lineTo(top[q2].x, top[q2].y);
            c.closePath(); c.fill();
            // 顶面窗灯（夜档由 drawTint 罩色即可，这里只做亮点）
            if (hv > 0.6) { c.fillStyle = 'rgba(255,224,138,0.85)'; c.fillRect(top[2].x - 3, top[2].y + hgt * 0.35, 3, 3); }
          }
          cx2 += run;
        }
      }
      R.isoGround = g;
    };
    R.drawIsoGround = function (ctx) {
      if (!R.isoGround) return;
      ctx.drawImage(R.isoGround, R.isoBounds.x0, R.isoBounds.y0, R.isoBounds.w, R.isoBounds.h);
    };

    // ---------- 云影（A Short Hike 式漂移，给画面加"时间在走"的呼吸感）----------
    var CLOUDS = [];
    (function () { // 固定 3 团，种子化初相位
      for (var i = 0; i < 3; i++) CLOUDS.push({ dx: (i * 7919) % 601, dy: (i * 104729) % map.h, r: 170 + (i * 53) % 110, vy: 5.5 + i * 2.3, vx: 8 + i * 3 });
    })();
    R.drawClouds = function (ctx, rect, t) {
      for (var i = 0; i < CLOUDS.length; i++) {
        var c = CLOUDS[i];
        var cx = ((c.dx + t * c.vx) % (map.w + 700)) - 350;
        var cy = ((c.dy + t * c.vy) % (map.h + 500)) - 250;
        if (cx + c.r < rect.x || cx - c.r > rect.x + rect.w || cy + c.r < rect.y || cy - c.r > rect.y + rect.h) continue;
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, c.r);
        g.addColorStop(0, 'rgba(18,26,44,0.10)'); g.addColorStop(0.7, 'rgba(18,26,44,0.06)'); g.addColorStop(1, 'rgba(18,26,44,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - c.r, cy - c.r, c.r * 2, c.r * 2);
      }
    };

    // ---------- 行进路径光带（光遇式引路）：path 为世界坐标折线，goal 为目的地 ----------
    R.drawPathRibbon = function (ctx, path, goal, t) {
      if (!path || path.length < 2) return;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // 底层柔光
      ctx.strokeStyle = 'rgba(192,57,43,0.16)'; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
      for (var i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
      // 当前这一段：实线（10/24 #5：下一站实线、之后虚线）+ 流动光尘
      ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 20]); ctx.lineDashOffset = -(t * 46) % 24;
      ctx.stroke();
      ctx.setLineDash([]);
      // 目的地脉冲
      if (goal) {
        var pr = 7 + Math.sin(t * 5) * 2.5;
        ctx.strokeStyle = 'rgba(255,224,138,0.9)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(goal.x, goal.y, pr + 4, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,209,102,0.95)';
        ctx.beginPath(); ctx.arc(goal.x, goal.y, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };

    // ---------- 提示词 5：规划线（静态）——走过的段实线 3px，没走的段虚线 2px，颜色 #C0392B ----------
    R.drawPlanLegs = function (ctx, legs, t) {
      if (!legs || !legs.length) return;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      legs.forEach(function (pts) {
        if (!pts || pts.length < 2) return;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        if (pts.done) { ctx.setLineDash([]); ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 3; }
        else { ctx.setLineDash([7, 6]); ctx.strokeStyle = 'rgba(192,57,43,0.85)'; ctx.lineWidth = 2; }
        ctx.stroke();
      });
      ctx.setLineDash([]); ctx.restore();
    };
    // ---------- 提示词 9：动态指引线——4px #C0392B，流动箭头虚线；偏离时整条闪烁；终点呼吸高亮圈 ----------
    R.drawGuide = function (ctx, path, t, alpha, flash, goal) {
      if (!path || path.length < 2) return;
      ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (flash && Math.floor(t * 8) % 2) ctx.globalAlpha *= 0.25;
      ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
      for (var i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.strokeStyle = 'rgba(255,240,220,0.9)'; ctx.lineWidth = 7; ctx.stroke();      // 浅色衬底：深色地图上也清楚
      ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = '#FFD9D2'; ctx.lineWidth = 2; ctx.setLineDash([3, 13]); ctx.lineDashOffset = -(t * 30) % 16; ctx.stroke(); // 流动
      ctx.setLineDash([]);
      // 沿线箭头（每 60 单位一个，指向前进方向）
      var acc = 0, step = 60, off = (t * 30) % step;
      for (var k = 1; k < path.length; k++) {
        var ax = path[k - 1].x, ay = path[k - 1].y, bx = path[k].x, by = path[k].y, L = Math.hypot(bx - ax, by - ay);
        if (!L) continue;
        var ux = (bx - ax) / L, uy = (by - ay) / L;
        for (var d = step - ((acc + step - off) % step); d < L; d += step) {
          var x = ax + ux * d, y = ay + uy * d;
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.moveTo(x + ux * 5, y + uy * 5); ctx.lineTo(x - ux * 3 - uy * 4, y - uy * 3 + ux * 4); ctx.lineTo(x - ux * 3 + uy * 4, y - uy * 3 - ux * 4); ctx.closePath(); ctx.fill();
        }
        acc += L;
      }
      if (goal) { // 下一站呼吸高亮圈
        var r = 10 + Math.sin(t * 3.2) * 3;
        ctx.globalAlpha = (alpha == null ? 1 : alpha) * (0.55 + 0.35 * Math.sin(t * 3.2));
        ctx.fillStyle = 'rgba(192,57,43,0.25)'; ctx.beginPath(); ctx.arc(goal.x, goal.y, r + 6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = alpha == null ? 1 : alpha;
        ctx.strokeStyle = '#C0392B'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(goal.x, goal.y, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    };

    // ---------- 屏幕空间：地点图标、名字、心、气泡 ----------
    // PRD-v3 P4：tag → 需求图标（游客头顶常显，玩家不用猜谁想去哪）
    var NEED_ICONS = { walk: '🪑', food: '🥣', crowd: '🏮', shop: '🎁', bored: '👀', rush: '⏱️', toilet: '🚻', any: '' };
    R.needIconOf = function (tag) { return NEED_ICONS[tag] || ''; };
    // PRD-v3 P3：±♥ 浮字
    R.drawFloatText = function (ctx, x, y, str, color) {
      ctx.font = 'bold 13px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
      ctx.fillStyle = color || '#fff';
      ctx.fillText(str, x, y);
    };
    function strokedText(ctx, str, x, y, size, color, bold) {
      ctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y);
      ctx.fillStyle = color || '#fff'; ctx.fillText(str, x, y);
    }
    function heart(ctx, x, y, filled) {
      ctx.fillStyle = filled ? '#e63946' : 'rgba(40,40,40,0.55)';
      ctx.fillRect(x + 1, y, 2, 1); ctx.fillRect(x + 4, y, 2, 1);
      ctx.fillRect(x, y + 1, 7, 2); ctx.fillRect(x + 1, y + 3, 5, 1); ctx.fillRect(x + 2, y + 4, 3, 1); ctx.fillRect(x + 3, y + 5, 1, 1);
      if (filled) { ctx.fillStyle = '#ffb3b8'; ctx.fillRect(x + 1, y + 1, 1, 1); }
    }
    var TONE = { good: { bg: '#E3F5EC', bd: '#2E8C68' }, bad: { bg: '#FFEDE8', bd: '#A93A28' }, info: { bg: '#F7F2E3', bd: '#2E3A33' } }; // Cozy Isometric 令牌
    R.drawBubble = function (ctx, sx, bottomY, textStr, maxRight, tone) {
      ctx.font = '11px ' + FONT;
      var tc = TONE[tone] || TONE.info;
      var lines = wrapText(ctx, textStr, 150), lw = 0;
      lines.forEach(function (l) { lw = Math.max(lw, ctx.measureText(l).width); });
      var bw = Math.max(24, lw + 14), bh = lines.length * 14 + 8, bx = Math.round(sx - bw / 2), by = Math.round(bottomY - bh - 6);
      if (bx < 4) bx = 4; // PRD-v2 F11：气泡不裁边
      if (maxRight && bx + bw > maxRight - 4) bx = maxRight - 4 - bw;
      ctx.fillStyle = tc.bg; ctx.strokeStyle = tc.bd; ctx.lineWidth = 2;
      roundRect(ctx, bx, by, bw, bh, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 4, by + bh); ctx.lineTo(sx, by + bh + 5); ctx.lineTo(sx + 4, by + bh); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      lines.forEach(function (l, i) { ctx.fillText(l, sx, by + 15 + i * 14); });
      return by;
    };
    // places: [{place, sx, sy, crowded, landmark}]；ents: [{sx, sy(头顶), name, hearts, bubble, status, kind, color, label}]
    // ---------- 10/24 晚：老城真实 POI 图钉（高德实采）+ 街名 ----------
    var POI_STYLE = {
      food: ['#E8743B', '#A34A1C'], cafe: ['#A0673A', '#6B3F1E'], shop: ['#8A55D9', '#5B2FA3'], sight: ['#3B82C4', '#245A8C'],
      bank: ['#1F8A70', '#145C4A'], med: ['#D64545', '#972B2B'], hotel: ['#3E6FB0', '#284B7A'], gov: ['#2E5AA8', '#1D3B70'], life: ['#7A837A', '#4A554C']
    };
    function glyph(ctx, cat, x, y) { // 白色小图标（8×8 内）
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      switch (cat) {
        case 'food': ctx.beginPath(); ctx.moveTo(x - 2.5, y - 4); ctx.lineTo(x - 2.5, y + 4); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x - 4, y - 1); ctx.lineTo(x - 1, y - 1); ctx.lineTo(x - 1, y - 4); ctx.moveTo(x + 2.5, y + 4); ctx.lineTo(x + 2.5, y - 4); ctx.quadraticCurveTo(x + 5, y - 2, x + 2.5, y); ctx.stroke(); break;
        case 'cafe': ctx.fillRect(x - 4, y - 2, 6, 5); ctx.beginPath(); ctx.arc(x + 3, y, 2, -1.5, 1.5); ctx.stroke(); ctx.fillRect(x - 4, y + 4, 7, 1); break;
        case 'shop': ctx.fillRect(x - 4, y - 1, 8, 6); ctx.beginPath(); ctx.arc(x, y - 1, 2.5, Math.PI, 0); ctx.stroke(); break;
        case 'sight': ctx.beginPath(); for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 2.2 : 4.6; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break;
        case 'med': ctx.fillRect(x - 1.2, y - 4, 2.4, 8); ctx.fillRect(x - 4, y - 1.2, 8, 2.4); break;
        case 'bank': ctx.font = 'bold 9px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('¥', x, y + 0.5); ctx.textBaseline = 'alphabetic'; break;
        case 'hotel': ctx.fillRect(x - 4, y, 8, 3); ctx.fillRect(x - 4, y - 3, 3, 3); ctx.fillRect(x - 4, y - 3, 1, 7); break;
        case 'gov': ctx.beginPath(); ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 4, y - 2.5); ctx.lineTo(x + 3, y + 2); ctx.lineTo(x, y + 4.5); ctx.lineTo(x - 3, y + 2); ctx.lineTo(x - 4, y - 2.5); ctx.closePath(); ctx.fill(); break;
        default: ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    function overlaps(boxes, b) { for (var j = 0; j < boxes.length; j++) { var o = boxes[j]; if (b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) return true; } return false; }
    function drawPennant(ctx, x, y, level, t, flash, scale) { // 像素小旗（提示词 4：红 20×14 飘动，橙/黄 14×10 静止）
      scale = scale || 1;
      var big = level === 'red', fw = (big ? 20 : 14) * scale, fh = (big ? 14 : 10) * scale, pole = fh + 16 * scale;
      var fc = level === 'red' ? ['#E4553F', '#A93A28'] : level === 'orange' ? ['#F2A03D', '#C9751F'] : ['#F5CF4A', '#C9A21F'];
      var fy = y - pole;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 1, y - 1, 6 * scale, 2);
      ctx.fillStyle = '#2E3A33'; ctx.fillRect(x, fy, 2 * scale, pole);
      for (var col = 0; col < fw; col += 2 * scale) {
        var wv = big ? Math.round(Math.sin(t * 6 - col * 0.3) * 1.6 * scale) : 0;
        ctx.fillStyle = col < fw / 2 ? fc[0] : fc[1];
        ctx.fillRect(x + 2 * scale + col, fy + wv, 2 * scale, fh - Math.floor(col / fw * 3 * scale));
      }
      if (flash && Math.floor(t * 8) % 2) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x - 1, fy - 2, fw + 5 * scale, fh + 4); }
      return { x: x - 6, y: fy - 6, w: fw + 14, h: pole + 8 };
    }
    R.drawLabels = function (ctx, view, places, ents, t, extra) {
      R.badgeRects = []; R.flagRects = []; R.poiRects = [];
      extra = extra || {};
      var boxes = [];
      // 街名：深墨字 + 白描边，沿街方向（横/竖）
      (extra.streets || []).forEach(function (st) {
        var nm = st.name, fs = 13;
        ctx.font = 'bold ' + fs + 'px ' + FONT;
        var tw = ctx.measureText(nm).width;
        var bx = st.ang ? { x: st.sx - fs / 2 - 2, y: st.sy - tw / 2 - 2, w: fs + 4, h: tw + 4 } : { x: st.sx - tw / 2 - 2, y: st.sy - fs / 2 - 2, w: tw + 4, h: fs + 4 };
        if (overlaps(boxes, bx)) return;
        boxes.push(bx);
        ctx.save(); ctx.translate(st.sx, st.sy);
        ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (st.ang) { // 竖排：一字一行
          var chs = Array.from(nm), h0 = -(chs.length - 1) * fs / 2;
          chs.forEach(function (ch, k) { ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.strokeText(ch, 0, h0 + k * fs); ctx.fillStyle = '#2E3A33'; ctx.fillText(ch, 0, h0 + k * fs); });
          bx.h = chs.length * fs + 4; bx.y = st.sy - bx.h / 2;
        } else { ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.strokeText(nm, 0, 0); ctx.fillStyle = '#2E3A33'; ctx.fillText(nm, 0, 0); }
        ctx.restore(); ctx.textBaseline = 'alphabetic';
      });
      var i;
      for (i = 0; i < places.length; i++) {
        var p = places[i], pl = p.place;
        if (p.sx < -80 || p.sx > view.w + 80 || p.sy < -60 || p.sy > view.h + 60) continue;
        var icons = (pl.types || []).slice(0, 3).map(function (tp) { return R.typeIcons[tp] || '•'; }).join('');
        if (p.dim) ctx.globalAlpha = 0.38;
        ctx.font = '14px ' + FONT;
        var iw = ctx.measureText(icons).width + 10, bx = Math.round(p.sx - iw / 2), by = Math.round(p.sy - 22);
        ctx.fillStyle = 'rgba(80,72,52,0.28)'; roundRect(ctx, bx + 2, by + 3, iw, 22, 6); ctx.fill(); // 硬投影
        ctx.fillStyle = p.crowded ? '#FFEDE8' : '#F7F2E3';
        ctx.strokeStyle = p.landmark ? '#C9751F' : (p.crowded ? '#A93A28' : '#2E3A33'); ctx.lineWidth = 2;
        roundRect(ctx, bx, by, iw, 22, 6); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.sx - 4, by + 22); ctx.lineTo(p.sx, by + 27); ctx.lineTo(p.sx + 4, by + 22); ctx.closePath(); ctx.fill();
        if (p.promo) { // PRD-v4 §2.4：有商家物料的店插红「惠」旗
          var px = bx + iw + 3;
          ctx.fillStyle = '#c0392b'; ctx.fillRect(px, by - 12, 3, 22);
          ctx.beginPath(); ctx.moveTo(px + 3, by - 12); ctx.lineTo(px + 17, by - 8); ctx.lineTo(px + 3, by - 2); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 8px ' + FONT; ctx.textAlign = 'left'; ctx.fillText('惠', px + 5, by - 5);
        }
        ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(icons, p.sx, by + 16);
        ctx.font = (p.landmark ? 'bold ' : '') + '11px ' + FONT;
        var nw = ctx.measureText(pl.name).width + 10, ny = by + 30;
        ctx.fillStyle = 'rgba(0,0,0,0.62)'; roundRect(ctx, Math.round(p.sx - nw / 2), ny, nw, 15, 4); ctx.fill();
        ctx.fillStyle = p.crowded ? '#ffb3b8' : '#fff'; ctx.fillText(pl.name + (p.crowded ? ' 人多' : ''), p.sx, ny + 11);
        if (p.order) { // 路线序号 / 已到 ✓（10/24 #5）
          var ox = bx + iw + 2, oy = by - 6;
          ctx.fillStyle = p.done ? '#3fae6a' : '#d4a017'; ctx.beginPath(); ctx.arc(ox, oy + 6, 8, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 10px ' + FONT; ctx.fillText(p.done ? '✓' : String(p.order), ox, oy + 10);
        }
        if (p.flag && !p.done) { // 提示词 4：像素小旗，插在店名右上角
          var fr0 = drawPennant(ctx, bx + iw + 4, by + 4, p.flag, t, p.flash, 1);
          R.flagRects.push({ id: pl.id, x: fr0.x, y: fr0.y, w: fr0.w, h: fr0.h });
        }
        if (p.glow) { // 提示词 7：推荐店淡淡光晕描边
          ctx.strokeStyle = 'rgba(242,160,61,' + (0.35 + 0.25 * Math.sin(t * 2.5)).toFixed(2) + ')'; ctx.lineWidth = 4;
          roundRect(ctx, bx - 3, by - 3, iw + 6, 28, 8); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        R.badgeRects.push({ id: pl.id, x: bx - 4, y: by - 4, w: iw + 8, h: 54 });
      }
      // 真实 POI：圆形类别图钉 + 名字（彩色字白描边）；挤不下的自动让位（旗子优先）
      R.badgeRects.forEach(function (r) { boxes.push(r); });
      (ents || []).forEach(function (e) { boxes.push({ x: e.sx - 34, y: e.sy - 30, w: 68, h: 64 }); }); // 人物名字/气泡附近不放店名
      var zoom = extra.zoom || 1, budget = 160;
      (extra.pois || []).forEach(function (q) {
        if (budget <= 0) return;
        if (q.sx < -60 || q.sx > view.w + 60 || q.sy < -40 || q.sy > view.h + 40) return;
        var st = POI_STYLE[q.poi.cat] || POI_STYLE.life;
        var nm = Array.from(q.poi.name.replace(/[（(].*?[)）]/g, ''));
        var label = nm.length > 9 ? nm.slice(0, 8).join('') + '…' : nm.join('');
        ctx.font = 'bold 11px ' + FONT;
        var tw = ctx.measureText(label).width;
        var box = { x: q.sx - 8, y: q.sy - 8, w: 18 + tw, h: 16 };
        var flagBox = q.flag ? { x: q.sx + 2, y: q.sy - 40, w: 26, h: 34 } : null;
        if (overlaps(boxes, box) || (flagBox && overlaps(boxes, flagBox) && !q.flag)) return;
        boxes.push(box); budget--;
        if (q.flag) { var fr = drawPennant(ctx, q.sx + 4, q.sy - 7, q.flag, t, q.flash, 1); boxes.push(fr); R.flagRects.push({ id: q.poi.id, x: fr.x, y: fr.y, w: fr.w, h: fr.h }); }
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.arc(q.sx + 1, q.sy + 2, 7.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = st[0]; ctx.beginPath(); ctx.arc(q.sx, q.sy, 7.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
        glyph(ctx, q.poi.cat, q.sx, q.sy);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.strokeText(label, q.sx + 10, q.sy);
        ctx.fillStyle = st[1]; ctx.fillText(label, q.sx + 10, q.sy);
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        R.poiRects.push({ id: q.poi.id, x: box.x - 2, y: box.y - 4, w: box.w + 4, h: box.h + 8 });
      });
      var placedNames = []; // 已放置名字锚点，防叠字（PRD-v2 F11）
      function claimName(x, y) {
        for (var j = 0; j < placedNames.length; j++) {
          var p = placedNames[j];
          if (Math.abs(p.x - x) < 44 && Math.abs(p.y - y) < 12) return claimName(x, y - 14);
        }
        placedNames.push({ x: x, y: y });
        return y;
      }
      for (i = 0; i < ents.length; i++) {
        var e = ents[i];
        if (e.sx < -100 || e.sx > view.w + 100 || e.sy < -80 || e.sy > view.h + 80) continue;
        var top = e.sy - 4;
        if (e.kind === 'npc') { // 名人/问路 NPC：标签 + 跳动的"!"
          strokedText(ctx, e.label || '', e.sx, claimName(e.sx, top - 10), 11, '#ffe08a', true);
          strokedText(ctx, '!', e.sx, top - 24 + Math.round(Math.sin(t * 5) * 3), 14, '#ffd166', true);
          top -= 30;
        } else {
          if (e.need) { strokedText(ctx, e.need, e.sx - 16, top - 2, 10, '#ffe08a'); } // 需求图标常显（PRD-v3 P4）
          if (e.name) { strokedText(ctx, e.name, e.sx, claimName(e.sx, top - 4), 11, e.kind === 'player' ? '#ffe08a' : '#fff', e.kind === 'player'); top -= 16; }
          if (e.patience != null && e.patience > 0 && e.patience < 50 && e.status !== 'lost') { // 低于 50% 红色脉冲 + 冒汗（10/24 #10）
            var pa = 0.35 + 0.35 * Math.sin(t * 6);
            ctx.strokeStyle = 'rgba(230,57,70,' + pa.toFixed(2) + ')'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(e.sx, e.sy + 18, 13 + Math.sin(t * 6) * 2, 0, Math.PI * 2); ctx.stroke();
            strokedText(ctx, '💧', e.sx + 13, e.sy + 6 - Math.round((t * 6) % 4), 9, '#9ad0ff');
            var cf = Math.floor(t * 2) % 2, cy = e.sy - 18 - cf;   // 头顶小乌云（2 帧循环）
            ctx.fillStyle = '#6b7280'; ctx.fillRect(e.sx - 7 + cf, cy, 14, 4); ctx.fillRect(e.sx - 4 + cf, cy - 3, 8, 3);
            ctx.fillStyle = '#4b5563'; ctx.fillRect(e.sx - 7 + cf, cy + 3, 14, 1);
            if (cf) { ctx.fillStyle = '#7FA8D0'; ctx.fillRect(e.sx - 3, cy + 6, 1, 2); ctx.fillRect(e.sx + 2, cy + 7, 1, 2); }
          }
          if (e.patience != null) { // 耐心条（10/24 替换 3 颗心）
            var pw = 26, px = Math.round(e.sx - pw / 2), py = Math.round(top - 6), pv = Math.max(0, Math.min(100, e.patience));
            ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(px - 1, py - 1, pw + 2, 5);
            ctx.fillStyle = pv >= 50 ? '#57C79A' : pv >= 25 ? '#F2A03D' : '#E4553F'; ctx.fillRect(px, py, Math.round(pw * pv / 100), 3);
            top -= 8;
          } else if (e.hearts != null) { for (var k = 0; k < 3; k++) heart(ctx, Math.round(e.sx - 12 + k * 9), Math.round(top - 6), k < e.hearts); top -= 10; }
          if (e.status === 'sit') strokedText(ctx, 'z' + (Math.floor(t * 2) % 2 ? 'Z' : 'z'), e.sx + 12, e.sy + 2 - Math.round((t * 10) % 8), 10, '#cfe3f7');
          if (e.status === 'lost') strokedText(ctx, '?', e.sx, top - 4, 12, '#bbb', true);
          if (e.status === 'runaway') strokedText(ctx, '!!', e.sx + 10, e.sy - 2, 10, '#ff6b6b', true);
        }
        if (e.bubble) { // 提示词 3：地图上只放 emoji + 前 6 个字的摘要；点小人看全文
          var bt = String(e.bubble);
          if (e.kind === 'guest') { var ch = Array.from(bt.replace(/^[「『"]|[」』"]$/g, '')); bt = (e.tone === 'good' ? '😊' : e.tone === 'bad' ? '😣' : '💬') + ch.slice(0, 6).join('') + (ch.length > 6 ? '…' : ''); }
          R.drawBubble(ctx, e.sx, top - 4, bt, view.w, e.tone);
        }
      }
    };
    R.hitFlag = function (sx, sy) {
      var a = R.flagRects || [];
      for (var i = 0; i < a.length; i++) { var r = a[i]; if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return r.id; }
      return null;
    };
    R.hitPoi = function (sx, sy) {
      var a = R.poiRects || [];
      for (var i = a.length - 1; i >= 0; i--) { var r = a[i]; if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return r.id; }
      return null;
    };
    R.hitBadge = function (sx, sy) {
      for (var i = 0; i < R.badgeRects.length; i++) { var r = R.badgeRects[i]; if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) return r.id; }
      return null;
    };
    R.labelLift = function (place) { return LABEL_LIFT[place.visual] != null ? LABEL_LIFT[place.visual] : 76; };

    // ---------- 天气粒子（屏幕空间）----------
    R.weather = {
      kind: 'none', parts: [], wind: 0,
      set: function (kind) { this.kind = kind || 'none'; this.parts = []; },
      shake: function () { return this.kind === 'typhoon' ? 2 : 0; },
      update: function (dt, w, h) {
        var target = this.kind === 'rain' ? 140 : this.kind === 'typhoon' ? 320 : 0;
        var wind = this.kind === 'typhoon' ? -260 : -40, speed = this.kind === 'typhoon' ? 820 : 520;
        this.wind = wind;
        var ps = this.parts;
        while (ps.length < target) ps.push({ x: Math.random() * (w + 200) - 100, y: Math.random() * h, len: 8 + Math.random() * 10, v: speed * (0.8 + Math.random() * 0.4) });
        if (ps.length > target) ps.length = target;
        for (var i = 0; i < ps.length; i++) {
          var p = ps[i]; p.y += p.v * dt; p.x += wind * dt;
          if (p.y > h + 20) { p.y = -20; p.x = Math.random() * (w + 300) - 100; }
          if (p.x < -40) p.x += w + 200;
        }
      },
      draw: function (ctx, w, h, t) {
        if (!this.parts.length) return;
        ctx.strokeStyle = this.kind === 'typhoon' ? 'rgba(200,220,255,0.7)' : 'rgba(190,210,255,0.55)'; ctx.lineWidth = 1;
        var k = this.wind / (this.kind === 'typhoon' ? 820 : 520);
        ctx.beginPath();
        for (var i = 0; i < this.parts.length; i++) { var p = this.parts[i]; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + k * p.len, p.y + p.len); }
        ctx.stroke();
        if (this.kind === 'typhoon' && Math.sin(t * 7) > 0.985) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, 0, w, h); } // 偶发闪电
      }
    };
    R.drawFlash = function (ctx, view, alpha) { ctx.fillStyle = 'rgba(0,0,0,' + alpha + ')'; ctx.fillRect(0, 0, view.w, view.h); };

    return R;
  }

  root.WZ.render = { create: create, drawPerson: drawPerson, wrapText: wrapText, roundRect: roundRect, FONT: FONT };
})(typeof window !== 'undefined' ? window : globalThis);
