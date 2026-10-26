/* web/engine.js —— 引擎：主循环、相机、玩家/游客/NPC、寻路驱动、事件（W1）
 * 对外接口见 docs/CONTRACT.md §3，全部挂在 window.WZ.engine。
 * 依赖：web/map.js, web/render.js, web/input.js（需先加载）。
 */
(function (root) {
  'use strict';
  root.WZ = root.WZ || {};
  var WZ = root.WZ;
  var E = {};
  var S = null; // 引擎状态，init 时创建

  // 读参数：优先 params.engine[name]，其次 params[name]，最后默认值（数值不写死在逻辑里）
  function P(name, def) {
    var p = (S && S.params) || {}, e = p.engine || {};
    if (e[name] != null) return e[name];
    if (p[name] != null) return p[name];
    return def;
  }
  function emit(ev, a, b) {
    var ls = S && S.listeners[ev]; if (!ls) return;
    for (var i = 0; i < ls.length; i++) { try { ls[i](a, b); } catch (err) { if (root.console) console.error('[engine] ' + ev + ' 回调出错', err); } }
  }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function snapZoom(z) {
    var cands = [1, 1.5, 2, 2.5, 3], best = cands[0];
    cands.forEach(function (c) { if (Math.abs(c - z) < Math.abs(best - z)) best = c; });
    return best;
  }

  // ---------- 初始化 ----------
  E.init = function (canvas, cfg) {
    cfg = cfg || {};
    if (S) {
      E.stop();
      if (S.input) S.input.detach();
      if (S.ro) S.ro.disconnect();
      if (typeof window !== 'undefined') window.removeEventListener('resize', resize);
    }
    var map = WZ.map.create({ places: cfg.places, zones: cfg.zones, mapSize: cfg.mapSize, params: cfg.params });
    S = {
      canvas: canvas, ctx: canvas.getContext('2d'), map: map, params: cfg.params || {},
      running: false, paused: false, raf: 0, lastT: 0, time: 0,
      view: { w: 390, h: 844, dpr: 1 }, cam: { x: 0, y: 0, zoom: 1 },
      player: { id: 'player', kind: 'player', x: 0, y: 0, name: '', path: null, goal: null, dir: { x: 0, y: 1 }, moving: false, anim: 0, bubble: null },
      guests: {}, guestOrder: [], npcs: {}, npcOrder: [], trail: [], trailLen: 0,
      clock: 0, stage: 0, weather: 'none', flashUntil: 0, listeners: {},
      inZone: {}, nearPlace: {}, roadworkId: null, shakeT: 0
    };
    S.render = WZ.render.create(map, { params: S.params });
    // PRD-v4 §3 P2（10/25）：等轴体素地面（商圈带队用），道路/水面/绿地来自真实 mask
    if (cfg.mapSize && cfg.mapSize.real && cfg.mapSize.real.mask) {
      try { S.render.buildIsoGround(cfg.mapSize.real.mask, 32); } catch (e) { if (root.console) console.error('[engine] iso ground', e); }
    }
    // 10/24 晚：老城真实 POI（高德实采）+ 街名，按优先级预排序（地图上画不下的自动让位）
    var PO = cfg.pois || null;
    if (PO && PO.list) {
      var pri = { food: 0, shop: 1, cafe: 2, sight: 3, med: 4, bank: 5, hotel: 6, gov: 7, life: 8 };
      S.pois = PO.list.map(function (r, i) { return { i: i, name: r[0], cat: PO.cats[r[1]], x: r[2], y: r[3], aid: r[4], id: 'poi_' + r[4] }; })
        .sort(function (a, b) { return (pri[a.cat] - pri[b.cat]) || (Array.from(a.name).length - Array.from(b.name).length); });
      S.poiById = {}; S.pois.forEach(function (q) { S.poiById[q.id] = q; });
      S.streets = PO.streets || [];
    } else { S.pois = []; S.streets = []; S.poiById = {}; }
    S.render.prerender();
    S.render.loadSprites(cfg.assetsBase || 'assets/', P('sprites', null));
    S.input = WZ.input.attach(canvas, { onTap: onTap, onLongPress: onLongPress, onDrag: function (dx, dy) { E.panBy(dx, dy); }, onPinch: function (k, x, y) { E.zoomBy(k, x, y); } });
    var home = map.home;
    E.setPlayerPos(home ? home.ex : map.w / 2, home ? home.ey : map.h / 2);
    resize();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', resize);
      if (window.ResizeObserver && canvas.parentElement) { S.ro = new ResizeObserver(resize); S.ro.observe(canvas.parentElement); }
    }
    draw();
    return E;
  };

  function resize() {
    if (!S) return;
    var c = S.canvas, cw = c.clientWidth, ch = c.clientHeight;
    if (!cw || !ch) { cw = 390; ch = 844; c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
    var dpr = Math.min(P('maxDpr', 2.5), (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
    S.view = { w: cw, h: ch, dpr: dpr };
    S.cam.zoom = P('zoom', null) || snapZoom(cw / P('viewWorldWidth', 280)); S.zoomBase = S.cam.zoom;
    // 全温州俯视：一屏装下整张图（经典=世界包围盒；等轴=投影包围盒，两套分开）
    S.fitZoom = Math.min(cw / S.map.w, ch / S.map.h) * 0.96;
    if (S.render.isoBounds) S.fitZoomIso = Math.min(cw / S.render.isoBounds.w, ch / S.render.isoBounds.h) * 0.96;
    snapCamera();
    if (!S.running) draw();
  }

  // ---------- 循环 ----------
  E.start = function () {
    if (!S || S.running) return E;
    S.running = true; S.lastT = 0;
    S.raf = requestAnimationFrame(frame);
    return E;
  };
  E.stop = function () { if (!S) return E; S.running = false; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; return E; };
  E.pause = function (b) { if (S) S.paused = !!b; return E; };
  E.isPaused = function () { return !!(S && S.paused); };
  E.isPlayerMoving = function () { return !!(S && S.player.moving); }; // PRD-v2 F4：时钟门控用

  function frame(t) {
    if (!S || !S.running) return;
    S.raf = requestAnimationFrame(frame);
    var dt = S.lastT ? Math.min(0.05, (t - S.lastT) / 1000) : 0;
    S.lastT = t; S.time += dt;
    if (!S.paused && dt > 0) { update(dt); emit('tick', dt); }
    S.render.weather.update(dt, S.view.w, S.view.h);
    updateCamera(dt);
    draw();
  }

  // ---------- 玩家 ----------
  E.setPlayer = function (o) { if (S && o) { if (o.name != null) S.player.name = String(o.name); if (o.x != null && o.y != null) E.setPlayerPos(o.x, o.y); } return E; };
  E.setPlayerPos = function (x, y) {
    if (!S) return E;
    var map = S.map, c = map.nearestWalkable(map.toCell(x, y).cx, map.toCell(x, y).cy);
    if (c && !map.isWalkableWorld(x, y)) { var w = map.toWorld(c.cx, c.cy); x = w.x; y = w.y; }
    S.player.x = x; S.player.y = y; S.player.path = null; S.player.goal = null;
    // 轨迹初始化：从玩家往南（或往北）铺一条直线，队伍一开始就排成队
    S.trail = []; S.trailLen = 0;
    var dirs = [1, -1], far = 0, sgn = 1;
    for (var k = 0; k < 2 && far < 160; k++) { var d = 0; while (d < 300 && map.isWalkableWorld(x, y + dirs[k] * (d + 8))) d += 8; if (d > far) { far = d; sgn = dirs[k]; } }
    for (var dd = far; dd > 0; dd -= 8) S.trail.push({ x: x, y: y + sgn * dd });
    S.trail.push({ x: x, y: y });
    recalcTrailLen();
    // 已在某地点/区域内：静默记录，不触发 arrive/enterZone
    S.nearPlace = {}; S.inZone = {};
    map.places.forEach(function (p) { if (dist(x, y, p.ex, p.ey) < P('arriveRadius', 40)) S.nearPlace[p.id] = true; });
    map.zones.forEach(function (z) { if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) S.inZone[z.id] = true; });
    Object.keys(S.guests).forEach(function (id) { var g = S.guests[id]; if (g.mode === 'follow') { g.x = x; g.y = y + sgn * 8; } });
    snapCamera();
    return E;
  };
  E.getPlayerPos = function () { return S ? { x: S.player.x, y: S.player.y } : { x: 0, y: 0 }; };
  E.moveTo = function (x, y) {
    if (!S) return E;
    var p = S.player, path = S.map.findPath(p.x, p.y, x, y);
    p.goal = { x: x, y: y }; p.path = (path && path.length) ? path : null;
    return E;
  };
  E.goTo = function (placeId) {
    if (!S) return E;
    var pl = S.map.placeById(placeId); if (!pl) return E;
    // 明确导航到某店：清掉 nearPlace 预标记，否则玩家已在店旁（落位/路过被标记）时 arrive 永不触发
    if (S.nearPlace) S.nearPlace[placeId] = false;
    E.moveTo(pl.ex, pl.ey);
    return E;
  };
  E.distTo = function (placeId) {
    if (!S) return Infinity;
    var pl = S.map.placeById(placeId); if (!pl) return Infinity;
    return dist(S.player.x, S.player.y, pl.ex, pl.ey);
  };
  E.getPlace = function (placeId) { return S ? S.map.placeById(placeId) : null; };
  // 把地图上的真实 POI 变成可去的一站（加进路线时调用）
  E.addPlace = function (p) { if (!S) return null; var q = S.map.addPlace(Object.assign({}, p)); var po = S.poiById[p.id]; if (po) po.added = true; walkCache = walkCache || {}; return q; };
  E.getPoi = function (id) { return S && S.poiById ? S.poiById[id] : null; };

  // ---------- 10/24 升级：路线可见 / 插旗 / 规划模式 / 真实步行分钟 ----------
  function pathLen(path, ax, ay) {
    if (!path || !path.length) return 0;
    var L = 0, px = ax, py = ay;
    for (var i = 0; i < path.length; i++) { L += dist(px, py, path[i].x, path[i].y); px = path[i].x; py = path[i].y; }
    return L;
  }
  var walkCache = {};
  // 两地之间的游戏内步行分钟（按 A* 实际路径长度 / 玩家速度 × 每秒游戏分钟，和真实走过去的耗时一致）
  E.walkMin = function (aId, bId) {
    if (!S || !aId || !bId || aId === bId) return 0;
    var k = aId + '>' + bId; if (walkCache[k] != null) return walkCache[k];
    var a = S.map.placeById(aId), b = S.map.placeById(bId); if (!a || !b) return 0;
    var path = S.map.findPath(a.ex, a.ey, b.ex, b.ey);
    var L = path ? pathLen(path, a.ex, a.ey) : dist(a.ex, a.ey, b.ex, b.ey) * 1.3;
    var v = Math.max(1, Math.round(L / P('playerSpeed', 120) * P('minPerSec', 4)));
    walkCache[k] = walkCache[bId + '>' + aId] = v;
    return v;
  };
  E.walkMinFromPlayer = function (placeId) {
    if (!S) return 0;
    var b = S.map.placeById(placeId); if (!b) return 0;
    var path = S.map.findPath(S.player.x, S.player.y, b.ex, b.ey);
    var L = path ? pathLen(path, S.player.x, S.player.y) : dist(S.player.x, S.player.y, b.ex, b.ey);
    return Math.max(0, Math.round(L / P('playerSpeed', 120) * P('minPerSec', 4)));
  };
  // plan: { route:[id], visited:[id], flags:{id:{level}}, dim:bool }
  E.setPlan = function (plan) {
    if (!S) return E;
    plan = plan || {};
    var route = (plan.route || []).slice(), visited = plan.visited || [];
    var key = route.join(',') + '|' + visited.join(',');
    S.plan = { route: route, visited: visited.slice(), flags: plan.flags || {}, dim: !!plan.dim, key: key, legs: S.plan && S.plan.key === key ? S.plan.legs : null };
    if (!S.plan.legs) {
      // 提示词 5：从游客中心起按顺序把各站连成路——走过的段实线、没走的段虚线（颜色 #C0392B）
      var legs = [], prev = S.map.home;
      route.forEach(function (id) {
        var b = S.map.placeById(id); if (!b || !prev) { prev = b || prev; return; }
        var pth = S.map.findPath(prev.ex, prev.ey, b.ex, b.ey);
        var pts = [{ x: prev.ex, y: prev.ey }].concat(pth || [{ x: b.ex, y: b.ey }]);
        pts.done = visited.indexOf(id) >= 0;
        legs.push(pts);
        prev = b;
      });
      S.plan.legs = legs;
    }
    if (!S.running) draw();
    return E;
  };
  // 提示词 9：动态指引线——从队伍当前位置沿真实步行路径指向下一站；改目标时旧线 0.5 秒淡出
  E.setGuide = function (placeId) {
    if (!S) return E;
    var cur = S.guide && S.guide.id;
    if (cur === (placeId || null)) return E;
    if (S.guide && S.guide.path) S.guideOld = { path: S.guide.path, t0: S.time };
    S.guide = placeId ? { id: placeId, path: null, at: null } : null;
    return E;
  };
  function updateGuide() {
    var g = S.guide; if (!g) return;
    var pl = S.map.placeById(g.id); if (!pl) return;
    var p = S.player;
    if (!g.at || dist(g.at.x, g.at.y, p.x, p.y) > 14 || !g.path) {
      // 偏离判定：离上一次指引线 > 20 单位（30 米）→ 整条闪烁提醒，并重新规划
      if (g.path && g.path.length) {
        var dmin = Infinity;
        for (var i = 0; i < g.path.length; i++) dmin = Math.min(dmin, dist(g.path[i].x, g.path[i].y, p.x, p.y));
        if (dmin > 20 && (!p.goal || dist(p.goal.x, p.goal.y, pl.ex, pl.ey) > 1)) g.flashUntil = S.time + 1.2;
      }
      var pth = S.map.findPath(p.x, p.y, pl.ex, pl.ey);
      g.path = [{ x: p.x, y: p.y }].concat(pth || [{ x: pl.ex, y: pl.ey }]);
      g.at = { x: p.x, y: p.y };
    } else if (g.path.length) { g.path[0] = { x: p.x, y: p.y }; }
  }
  // 提示词 7：地图可拖动平移、双指/滚轮缩放；3 秒没碰就回到跟随队伍
  E.panBy = function (dx, dy) {
    if (!S) return E;
    var z = S.cam.zoom;
    if (!S.camFree) S.camFree = { x: S.cam.x, y: S.cam.y };
    S.camFree.x -= dx / z; S.camFree.y -= dy / z; S.camFreeUntil = S.time + (S.planning ? 9999 : 3);
    S.cam.x = S.camFree.x; S.cam.y = S.camFree.y;
    if (!S.running) draw();
    return E;
  };
  E.zoomBy = function (k, sx, sy) {
    if (!S) return E;
    var base = S.zoomBase || S.cam.zoom; S.zoomBase = base;
    if (sx == null) { sx = S.view.w / 2; sy = S.view.h / 2; }
    var zmin = (S.iso ? S.fitZoomIso : S.fitZoom) || base * 0.5; // 缩放下限放宽到全图俯视（10/25）
    var z1 = Math.max(zmin, Math.min(base * 2.2, S.cam.zoom * k));
    if (z1 === S.cam.zoom) return E;
    var wx = S.cam.x + sx / S.cam.zoom, wy = S.cam.y + sy / S.cam.zoom;
    S.cam.zoom = z1;
    S.camFree = { x: wx - sx / z1, y: wy - sy / z1 }; S.camFreeUntil = S.time + (S.planning ? 9999 : 3);
    S.cam.x = S.camFree.x; S.cam.y = S.camFree.y;
    if (!S.running) draw();
    return E;
  };
  // 全温州俯视（10/25）：一屏看完整地图 + 可玩范围/商圈框；再调一次回到跟队
  E.fitMap = function (on) {
    if (!S) return E;
    S.overview = on != null ? !!on : !S.overview;
    if (S.overview) {
      S.cam.zoom = (S.iso ? S.fitZoomIso : S.fitZoom) || 0.3;
      var bx0 = S.render.isoBounds ? S.render.isoBounds.x0 : 0, by0 = S.render.isoBounds ? S.render.isoBounds.y0 : 0;
      S.camFree = { x: bx0 - (S.view.w / S.cam.zoom - (S.render.isoBounds ? S.render.isoBounds.w : S.map.w)) / 2, y: by0 - (S.view.h / S.cam.zoom - (S.render.isoBounds ? S.render.isoBounds.h : S.map.h)) / 2 };
      S.camFreeUntil = S.time + 9999;
    } else {
      S.camFree = null;
      S.cam.zoom = S.zoomBase || S.cam.zoom;
    }
    if (!S.running) { snapCamera(); draw(); }
    return E;
  };
  E.isOverview = function () { return !!(S && S.overview); };
  // 镜头平滑推进到某个商圈框（10/25：进入商圈时的聚焦动画）
  E.focusBox = function (box) {
    if (!S || !box || !(box.w > 0)) return E;
    var vw = S.view.w, vh = S.view.h;
    var z = Math.min(vw / (box.w + 140), vh / (box.h + 140));
    S.cam.zoom = Math.max(1.0, Math.min((S.zoomBase || 2) * 1.4, z)); // 商圈聚焦：最近 1.0，圈内铺满屏幕
    S.camFocus = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    S.camFocusUntil = S.time + 4;
    S.camFree = null;
    if (!S.running) { snapCamera(); draw(); }
    return E;
  };
  // 商圈场景制（PRD-v4 §3）：切换当前商圈 = 只显示圈内的真实店铺 POI + 镜头聚焦圈中心
  E.setDistrict = function (id) {
    if (!S) return E;
    var ds = (root.WZ.content && root.WZ.content.districts) || [];
    var d = ds.filter(function (x) { return x.id === id; })[0];
    if (!d) return E;
    S.allPois = S.allPois || S.pois.slice(); // 首次备份全量
    var box = d.center
      ? { x: d.center.x - d.r, y: d.center.y - d.r, w: d.r * 2, h: d.r * 2 }
      : (function () { // 远郊无 center：用 placeIds 的精选地点包围盒
        var ps = (d.placeIds || []).map(function (pid) { return S.map.placeById(pid); }).filter(Boolean);
        if (!ps.length) return { x: S.map.w / 2 - 200, y: S.map.h / 2 - 200, w: 400, h: 400 };
        var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        ps.forEach(function (p) { x0 = Math.min(x0, p.ex); y0 = Math.min(y0, p.ey); x1 = Math.max(x1, p.ex); y1 = Math.max(y1, p.ey); });
        return { x: x0, y: y0, w: Math.max(300, x1 - x0), h: Math.max(300, y1 - y0) };
      })();
    S.pois = S.allPois.filter(function (q) {
      if (q.x >= box.x - 60 && q.x <= box.x + box.w + 60 && q.y >= box.y - 60 && q.y <= box.y + box.h + 60) return true;
      return (d.placeIds || []).indexOf(q.id) >= 0;
    });
    S.poiById = {};
    S.pois.forEach(function (q) { S.poiById[q.id] = q; });
    S.district = d;
    S.iso = !!S.render.isoGround; // 商圈带队：切等轴体素视角
    S.overview = false;
    E.focusBox(box);
    return E;
  };
  E.getDistrict = function () { return S && S.district ? S.district.id : null; };
  E.resetDistrict = function () { // codex #9：恢复全量 POI（经典模式/新局不被商圈过滤污染）
    if (!S) return E;
    if (S.allPois) { S.pois = S.allPois.slice(); S.allPois = null; }
    S.poiById = {};
    S.pois.forEach(function (q) { S.poiById[q.id] = q; });
    S.district = null;
    S.iso = false; // 回经典：恢复像素俯视
    return E;
  };
  E.recenter = function () { if (S) { S.camFree = null; S.overview = false; } return E; };
  // 规划模式：点地图上的地点 → 回调（不走路）；点地面无效
  E.setPlanning = function (cb) { if (S) S.planning = typeof cb === 'function' ? cb : null; return E; };
  // 镜头临时对准某地点（规划阶段看店）；null = 回到跟随玩家
  E.focus = function (placeId) {
    if (!S) return E;
    var pl = placeId ? S.map.placeById(placeId) : null;
    S.camFocus = pl ? { x: pl.ex, y: pl.ey } : null; S.camFree = null;
    if (pl && S.running) S.camFocusUntil = S.time + 2.5;
    if (!S.running) { snapCamera(); draw(); }
    return E;
  };

  function walkableBox(x, y) { // 脚底小盒子（12×6）四角都可走
    var m = S.map;
    return m.isWalkableWorld(x - 5, y - 1) && m.isWalkableWorld(x + 5, y - 1) && m.isWalkableWorld(x - 5, y + 2) && m.isWalkableWorld(x + 5, y + 2);
  }
  function tryMove(ent, dx, dy) {
    var nx = ent.x + dx, ny = ent.y + dy, moved = false;
    if (dx && walkableBox(nx, ent.y)) { ent.x = nx; moved = true; }
    if (dy && walkableBox(ent.x, ny)) { ent.y = ny; moved = true; }
    ent.x = Math.max(4, Math.min(S.map.w - 4, ent.x)); ent.y = Math.max(4, Math.min(S.map.h - 4, ent.y));
    return moved;
  }
  // 沿路径前进；返回是否仍在移动
  function advance(ent, speed, dt) {
    if (!ent.path || !ent.path.length) { ent.path = null; return false; }
    var step = speed * dt;
    while (step > 0 && ent.path && ent.path.length) {
      var tg = ent.path[0], d = dist(ent.x, ent.y, tg.x, tg.y);
      if (d <= step) { ent.x = tg.x; ent.y = tg.y; step -= d; ent.path.shift(); if (!ent.path.length) { ent.path = null; return false; } }
      else { ent.dir = { x: (tg.x - ent.x) / d, y: (tg.y - ent.y) / d }; ent.x += ent.dir.x * step; ent.y += ent.dir.y * step; step = 0; }
    }
    return true;
  }

  // ---------- 轨迹（贪吃蛇跟随）----------
  function recalcTrailLen() { var L = 0, t = S.trail; for (var i = 1; i < t.length; i++) L += dist(t[i - 1].x, t[i - 1].y, t[i].x, t[i].y); S.trailLen = L; }
  function pushTrail(x, y) {
    var t = S.trail, last = t[t.length - 1];
    if (last && dist(last.x, last.y, x, y) < 6) return;
    t.push({ x: x, y: y });
    if (last) S.trailLen += dist(last.x, last.y, x, y);
    var need = (S.guestOrder.length + 2) * P('followSpacing', 26) + 120;
    while (t.length > 2 && S.trailLen > need) { var a = t.shift(); S.trailLen -= dist(a.x, a.y, t[0].x, t[0].y); }
  }
  function trailBack(d) { // 轨迹末端往回 d 像素的点
    var t = S.trail; if (!t.length) return { x: S.player.x, y: S.player.y };
    var px = S.player.x, py = S.player.y;
    for (var i = t.length - 1; i >= 0; i--) {
      var seg = dist(px, py, t[i].x, t[i].y);
      if (seg >= d) { var k = seg ? d / seg : 0; return { x: px + (t[i].x - px) * k, y: py + (t[i].y - py) * k }; }
      d -= seg; px = t[i].x; py = t[i].y;
    }
    return { x: px, y: py };
  }

  // ---------- 游客 ----------
  function ensureGuest(id) {
    var g = S.guests[id];
    if (!g) {
      g = S.guests[id] = { id: id, kind: 'guest', x: S.player.x, y: S.player.y + 8, mode: 'follow', lastStatus: null, path: null, dir: { x: 0, y: 1 }, moving: false, anim: 0, bubble: null, data: null, lostAt: null };
      S.guestOrder.push(id);
    }
    return g;
  }
  E.setGuests = function (guests) {
    if (!S) return E;
    guests = guests || [];
    var ids = {};
    guests.forEach(function (gd) {
      ids[gd.id] = true;
      var g = ensureGuest(gd.id);
      g.data = gd;
      if (gd.status !== g.lastStatus) { // 状态变化才切模式，命令式接口（guestSit 等）与状态同步并存
        g.lastStatus = gd.status;
        if (gd.status === 'sit') g.mode = 'sit';
        else if (gd.status === 'lost') { g.mode = 'lost'; if (gd.lostAt) { g.x = gd.lostAt.x; g.y = gd.lostAt.y; } g.lostAt = { x: g.x, y: g.y }; }
        else if (gd.status === 'home') g.mode = 'home';
        else if (gd.status === 'runaway') { if (g.mode !== 'runaway') g.mode = 'runaway'; }
        else g.mode = 'follow';
        if (g.mode !== 'runaway') g.path = null;
      }
    });
    S.guestOrder = S.guestOrder.filter(function (id) { if (!ids[id]) { delete S.guests[id]; return false; } return true; });
    // 保持与 guests[] 的顺序一致
    var order = guests.map(function (gd) { return gd.id; });
    S.guestOrder.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
    return E;
  };
  E.guestSit = function (id, on) { if (!S) return E; var g = ensureGuest(id); g.mode = on === false ? 'follow' : 'sit'; g.path = null; return E; };
  E.guestRunTo = function (id, placeId) {
    if (!S) return E;
    var g = ensureGuest(id), pl = S.map.placeById(placeId);
    g.mode = 'runaway'; g.runTo = placeId;
    if (pl) {
      // 停在门口：入口旁一格（不挡在入口正中）
      var m = S.map, cand = [[pl.ex + 30, pl.ey + 4], [pl.ex - 30, pl.ey + 4], [pl.ex, pl.ey + 30], [pl.ex, pl.ey]];
      var tgt = null; for (var i = 0; i < cand.length && !tgt; i++) if (m.isWalkableWorld(cand[i][0], cand[i][1])) tgt = cand[i];
      g.path = m.findPath(g.x, g.y, tgt[0], tgt[1]);
    } else g.path = null;
    return E;
  };
  E.guestReturn = function (id) { if (!S) return E; var g = ensureGuest(id); g.mode = 'follow'; g.path = null; g.runTo = null; return E; };
  E.markLost = function (id) { if (!S) return E; var g = ensureGuest(id); g.mode = 'lost'; g.path = null; g.lostAt = { x: g.x, y: g.y }; return E; };
  E.screenOfGuest = function (id) { var g = S && S.guests[id]; if (!g) return null; var r = S.canvas.getBoundingClientRect(), a = (S.canvas.parentElement || S.canvas).getBoundingClientRect(); return { x: (g.x - S.cam.x) * S.cam.zoom + r.left - a.left, y: (g.y - 14 - S.cam.y) * S.cam.zoom + r.top - a.top, r: 30 }; };
  E.getGuestPos = function (id) { var g = S && S.guests[id]; return g ? { x: g.x, y: g.y } : null; };
  E.bubble = function (id, text, ms, tone) {
    if (!S) return E;
    var ent = id === 'player' ? S.player : (S.guests[id] || S.npcs[id]);
    // 10/24 #3：气泡完整显示——按字数延长停留（每字 0.15 秒，至少 ms），带情绪色 tone: good/bad/info
    var len = Array.from(String(text)).length, hold = Math.max(ms || 2500, 1200 + len * 150);
    if (ent) ent.bubble = { text: String(text), until: S.time + hold / 1000, tone: tone || 'info' };
    return E;
  };

  // ---------- NPC ----------
  E.spawnNPC = function (o) {
    if (!S || !o || !o.id) return E;
    var pl = o.placeId ? S.map.placeById(o.placeId) : null, m = S.map;
    var x = o.x != null ? o.x : (pl ? pl.ex : S.player.x + 40), y = o.y != null ? o.y : (pl ? pl.ey : S.player.y);
    if (pl) { var cand = [[pl.ex + 34, pl.ey - 6], [pl.ex - 34, pl.ey - 6], [pl.ex + 34, pl.ey + 24], [pl.ex, pl.ey - 30]]; for (var i = 0; i < cand.length; i++) if (m.isWalkableWorld(cand[i][0], cand[i][1])) { x = cand[i][0]; y = cand[i][1]; break; } }
    if (!S.npcs[o.id]) S.npcOrder.push(o.id);
    // 10/24：出场动画——从旁边 3 个身位外小跑进场（0.9 秒），头顶「!」跳动
    var fx = x + 72, fy = y + 8;
    if (!m.isWalkableWorld(fx, fy)) { fx = x - 72; if (!m.isWalkableWorld(fx, fy)) { fx = x; fy = y + 72; } }
    S.npcs[o.id] = { id: o.id, kind: 'npc', x: x, y: y, label: o.label || '', placeId: o.placeId || null, bubble: null, dir: { x: fx > x ? -1 : 1, y: 0 },
      enter: { fx: fx, fy: fy, t0: S.time, dur: 0.9 }, anim: 0 };
    return E;
  };
  function npcPos(n) {
    var e = n.enter; if (!e) return { x: n.x, y: n.y, moving: false };
    var k = (S.time - e.t0) / e.dur;
    if (k >= 1) { n.enter = null; return { x: n.x, y: n.y, moving: false }; }
    k = 1 - Math.pow(1 - Math.max(0, k), 2);
    return { x: e.fx + (n.x - e.fx) * k, y: e.fy + (n.y - e.fy) * k - Math.abs(Math.sin(k * Math.PI * 3)) * 5, moving: true };
  }
  E.removeNPC = function (id) { if (!S) return E; delete S.npcs[id]; S.npcOrder = S.npcOrder.filter(function (i) { return i !== id; }); return E; };

  // ---------- 环境 ----------
  E.setClock = function (clockMin) {
    if (!S) return E;
    S.clock = +clockMin || 0;
    S.stage = S.render.stageOf(S.clock, P('stageThresholds', [256, 512, 768, 972]));
    return E;
  };
  E.getStage = function () { return S ? S.stage : 0; };
  E.setWeather = function (kind) { if (!S) return E; S.weather = kind || 'none'; S.render.weather.set(S.weather); return E; };
  E.setRoadwork = function (placeId) {
    if (!S) return E;
    var rw = S.map.setRoadwork(placeId || null);
    S.roadworkId = rw.placeId;
    // 路况变了：正在走的路径重新规划
    if (S.player.goal) E.moveTo(S.player.goal.x, S.player.goal.y);
    S.guestOrder.forEach(function (id) { var g = S.guests[id]; if (g.mode === 'runaway' && g.runTo && g.path) E.guestRunTo(id, g.runTo); });
    return E;
  };
  E.flash = function (ms) { if (S) S.flashUntil = S.time + (ms || 600) / 1000; return E; };
  // PRD-v3 P3：±♥ 浮字——世界坐标处生成，上飘 1.4s 淡出
  E.addFloat = function (x, y, text, color) {
    if (!S) return E;
    S.floats = S.floats || [];
    S.floats.push({ x: x, y: y, text: String(text || ''), color: color || '#fff', born: S.time });
    if (S.floats.length > 24) S.floats.shift();
    return E;
  };
  E.on = function (ev, cb) { if (S && typeof cb === 'function') (S.listeners[ev] = S.listeners[ev] || []).push(cb); return E; };
  E.off = function (ev, cb) { if (S && S.listeners[ev]) S.listeners[ev] = S.listeners[ev].filter(function (f) { return f !== cb; }); return E; };
  E.getState = function () { return S; }; // 调试用

  // ---------- 点击 ----------
  function screenToWorld(sx, sy) {
    var X = S.cam.x + sx / S.cam.zoom, Y = S.cam.y + sy / S.cam.zoom;
    if (S.iso && S.render.proj) { // 逆等轴：投影平面 → 世界
      var C = S.render.ISO_C;
      return { x: (X / C + Y / (C * 0.5)) / 2, y: (Y / (C * 0.5) - X / C) / 2 };
    }
    return { x: X, y: Y };
  }
  function hitEnt(ent, wx, wy) {
    var h = WZ.characters ? WZ.characters.height(personOpts(ent)) : 36;
    // 亲子适配：命中半宽 24（原 17）、纵向多让 6px，小朋友点人更容易
    return Math.abs(wx - ent.x) <= (WZ.characters ? 24 : 16) && wy >= ent.y - h - 6 && wy <= ent.y + 10;
  }
  // 长按：旗子/店铺 → 'longPlace'（推荐理由 / 店铺小卡）；游客 → 同点按
  function onLongPress(sx, sy) {
    if (!S) return;
    var fid = S.render.hitFlag ? S.render.hitFlag(sx, sy) : null;
    var pid = fid || S.render.hitBadge(sx, sy);
    if (pid && S.poiById[pid] && !S.map.placeById(pid)) { emit(fid ? 'longPlace' : 'tapPoi', fid ? pid : S.poiById[pid], { sx: sx, sy: sy, flag: !!fid }); return; }
    if (!pid && S.render.hitPoi) { var ph2 = S.render.hitPoi(sx, sy); if (ph2) { emit('tapPoi', S.poiById[ph2]); return; } }
    if (pid) emit('longPlace', pid, { sx: sx, sy: sy, flag: !!fid });
  }
  function onTap(sx, sy) {
    if (!S) return;
    var w = screenToWorld(sx, sy), i, id, best = null;
    if (S.planning) { var pp = S.render.hitBadge(sx, sy); if (pp) { S.planning(pp); return; } var ph = S.render.hitPoi ? S.render.hitPoi(sx, sy) : null; if (ph) emit('tapPoi', S.poiById[ph]); return; }
    // 重叠时取画在最上层的（y 最大）
    for (i = 0; i < S.guestOrder.length; i++) { id = S.guestOrder[i]; var g = S.guests[id]; if (g.mode !== 'home' && hitEnt(g, w.x, w.y) && (!best || g.y > best.y)) best = { ev: 'tapGuest', id: id, y: g.y }; }
    for (i = 0; i < S.npcOrder.length; i++) { id = S.npcOrder[i]; var n = S.npcs[id]; if (hitEnt(n, w.x, w.y) && (!best || n.y > best.y)) best = { ev: 'tapNPC', id: id, y: n.y }; }
    if (best) { emit(best.ev, best.id); return; }
    var pid = S.render.hitBadge(sx, sy);
    var poiHit = !pid && S.render.hitPoi ? S.render.hitPoi(sx, sy) : null;
    // 圈内点店（demo hit() 口径）：落点附近 ≤28 世界单位内有店就算点店——标签避让挤掉名字的点也能点（10/25）
    if (!pid && !poiHit) {
      var near = null, nd = 28;
      for (var qi = 0; qi < S.pois.length; qi++) {
        var qq = S.pois[qi], ddq = Math.hypot(qq.x - w.x, qq.y - w.y);
        if (ddq < nd) { nd = ddq; near = qq; }
      }
      if (near) poiHit = near.id;
    }
    if (poiHit) { emit('tapPoi', S.poiById[poiHit]); return; }
    if (S.planning) { if (pid) S.planning(pid); return; }
    if (pid) { emit('tapPlace', pid); E.goTo(pid); return; }
    emit('tapGround', { x: w.x, y: w.y });
    E.moveTo(w.x, w.y);
  }

  // ---------- 更新 ----------
  function update(dt) {
    var p = S.player, m = S.map;
    var speed = P('playerSpeed', 120), ax = S.input.axis();
    p.moving = false;
    if (ax.x || ax.y) {
      p.path = null; p.goal = null;
      p.dir = { x: ax.x, y: ax.y };
      p.moving = tryMove(p, ax.x * speed * dt, ax.y * speed * dt);
    } else if (p.path) {
      p.moving = advance(p, speed, dt);
    }
    if (p.moving) { p.anim += dt * 8; pushTrail(p.x, p.y); }

    // 游客
    var chain = 0, spacing = P('followSpacing', 26), k = 1 - Math.exp(-dt * 10);
    for (var i = 0; i < S.guestOrder.length; i++) {
      var g = S.guests[S.guestOrder[i]];
      g.moving = false;
      if (g.mode === 'follow') {
        var lag = (g.data && g.data.patience != null && g.data.patience <= 0) ? 1.8 : 1; // 耐心见底：拖在队尾、走得慢
        var tg = trailBack((++chain) * spacing * lag);
        var dx = tg.x - g.x, dy = tg.y - g.y, d = Math.hypot(dx, dy);
        if (d > 0.5) { g.x += dx * k; g.y += dy * k; g.moving = d > 2; if (d > 2) g.dir = { x: dx / d, y: dy / d }; }
        else if (p.moving) g.dir = p.dir;
      } else if (g.mode === 'runaway') {
        g.moving = advance(g, P('runSpeed', 170), dt);
        if (!g.moving) g.dir = { x: 0, y: 1 };
      }
      if (g.moving) g.anim += dt * (g.mode === 'runaway' ? 12 : 8);
    }

    // 到达 / 区域
    var r = P('arriveRadius', 40);
    for (i = 0; i < m.places.length; i++) {
      var pl = m.places[i], dd = dist(p.x, p.y, pl.ex, pl.ey);
      // 真实地图：店铺都贴着街，自动寻路途中只认「目的地」和可顺路经过的点（厕所/小巷，stayMin=0），
      // 不然路过一家店就被强制停站、路过游客中心就直接收工（2026-10-23 真实地图接入）
      var passBy = p.goal && dist(p.goal.x, p.goal.y, pl.ex, pl.ey) > 1 &&
        ((pl.stayMin || 0) > 0 || (pl.types || []).indexOf('home') >= 0);
      if (dd < r && !passBy) { if (!S.nearPlace[pl.id]) { S.nearPlace[pl.id] = true; emit('arrive', pl.id); } }
      else if (dd > r * 1.6) S.nearPlace[pl.id] = false;
    }
    for (i = 0; i < m.zones.length; i++) {
      var z = m.zones[i], inside = p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h;
      if (inside && !S.inZone[z.id]) { S.inZone[z.id] = true; emit('enterZone', z.id); }
      else if (!inside && S.inZone[z.id]) { S.inZone[z.id] = false; emit('leaveZone', z.id); }
    }

    // 气泡过期
    [p].concat(S.guestOrder.map(function (id) { return S.guests[id]; }), S.npcOrder.map(function (id) { return S.npcs[id]; })).forEach(function (e) { if (e.bubble && S.time > e.bubble.until) e.bubble = null; });
    // 浮字过期（PRD-v3 P3）
    if (S.floats && S.floats.length) S.floats = S.floats.filter(function (f) { return S.time - f.born < 1.4; });
  }

  // ---------- 相机 ----------
  function camTarget() {
    var z = S.cam.zoom, vw = S.view.w / z, vh = S.view.h / z, m = S.map;
    if (S.camFree && S.time < (S.camFreeUntil || 0)) return { x: S.camFree.x, y: S.camFree.y };
    S.camFree = null;
    if (S.camFocusUntil && S.time > S.camFocusUntil && !S.planning) { S.camFocus = null; S.camFocusUntil = 0; }
    var anchorP = projOf(S.camFocus ? S.camFocus.x : S.player.x, S.camFocus ? S.camFocus.y : S.player.y);
    var tx = anchorP.X - vw / 2, ty = anchorP.Y - vh / 2 - vh * 0.05;
    var bw = S.render.isoBounds, mx0 = bw ? bw.x0 : 0, my0 = bw ? bw.y0 : 0, mw = bw ? bw.w : m.w, mh = bw ? bw.h : m.h;
    tx = vw >= mw ? (mw - vw) / 2 : Math.max(mx0, Math.min(mx0 + mw - vw, tx));
    ty = vh >= mh ? (mh - vh) / 2 : Math.max(my0, Math.min(my0 + mh - vh, ty));
    return { x: tx, y: ty };
  }
  function snapCamera() { if (!S) return; var t = camTarget(); S.cam.x = t.x; S.cam.y = t.y; }
  function updateCamera(dt) {
    var t = camTarget(), k = 1 - Math.exp(-dt * P('camFollow', 6));
    S.cam.x += (t.x - S.cam.x) * k; S.cam.y += (t.y - S.cam.y) * k;
  }

  // ---------- 绘制 ----------
  // 等轴投影（商圈带队）：世界 → 投影平面；相机/裁剪/点击全部工作在投影平面
  function projOf(x, y) { if (S.iso && S.render.proj) return S.render.proj(x, y); return { X: x, Y: y }; }
  function worldToScreen(x, y) { var p = projOf(x, y); return { x: (p.X - S.cam.x) * S.cam.zoom, y: (p.Y - S.cam.y) * S.cam.zoom }; }
  function personOpts(e) {
    var o = { frame: Math.floor(e.anim) & 1, anim: e.anim, dir: e.dir, moving: e.moving };
    if (e.kind === 'player') { o.body = P('playerColor', '#3a86ff'); o.hat = 'cap'; o.flag = true; }
    else if (e.kind === 'npc') { o.body = '#6a4c93'; o.pants = '#4a3570'; o.hat = 'npc'; }
    else {
      var tag = e.data && e.data.tag;
      o.tag = tag;
      o.body = S.render.tagColors[tag] || '#888';
      o.sit = e.mode === 'sit'; o.gray = e.mode === 'lost' || (e.data && e.data.patience != null && e.data.patience <= 0); // 耐心归零变灰（10/24 #10）
    }
    return o;
  }
  function draw() {
    if (!S) return;
    var ctx = S.ctx, v = S.view, R = S.render, z = S.cam.zoom, sh = R.weather.shake();
    var ox = Math.round(S.cam.x * z) / z + (sh ? (Math.random() - 0.5) * sh / z : 0), oy = Math.round(S.cam.y * z) / z + (sh ? (Math.random() - 0.5) * sh / z : 0);
    var rect = { x: ox, y: oy, w: v.w / z, h: v.h / z };
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    ctx.fillStyle = '#1d2733'; ctx.fillRect(0, 0, v.w, v.h);
    ctx.imageSmoothingEnabled = false;

    // 世界层
    ctx.setTransform(v.dpr * z, 0, 0, v.dpr * z, -ox * v.dpr * z, -oy * v.dpr * z);
    var activeZones = S.map.zones.filter(function (zn) {
      var pl = S.map.placeById(zn.placeId), cw = pl && pl.crowdWindow;
      return !cw || (S.clock >= cw[0] && S.clock <= cw[1]);
    });
    if (S.iso && S.render.isoGround) {
      // 商圈带队：等轴体素视角（demo §③：点阵街区 + 建筑体块 + 真实道路/水面）
      R.drawIsoGround(ctx);
      // 行进光带（投影折线 + 目的地脉冲）
      if (S.player.path && S.player.path.length) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        var pj0 = projOf(S.player.x, S.player.y);
        ctx.strokeStyle = 'rgba(255,209,102,0.16)'; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(pj0.X, pj0.Y);
        for (var ri2 = 0; ri2 < S.player.path.length; ri2++) { var rp2 = projOf(S.player.path[ri2].x, S.player.path[ri2].y); ctx.lineTo(rp2.X, rp2.Y); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,224,138,0.75)'; ctx.lineWidth = 3;
        ctx.setLineDash([10, 14]); ctx.lineDashOffset = -(S.time * 46) % 24;
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (S.player.goal) {
        var gpP = projOf(S.player.goal.x, S.player.goal.y);
        ctx.strokeStyle = 'rgba(255,224,138,0.9)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(gpP.X, gpP.Y, 7 + Math.sin(S.time * 5) * 2.5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(255,209,102,0.95)';
        ctx.beginPath(); ctx.arc(gpP.X, gpP.Y, 3.5, 0, Math.PI * 2); ctx.fill();
      }
      // 队伍（等轴按 x+y 深度排序）
      var pp = S.player;
      var isoEnts = [{ x: pp.x, y: pp.y, o: personOpts(pp) }];
      S.guestOrder.forEach(function (id) { var g = S.guests[id]; if (g.mode === 'home') return; isoEnts.push({ x: g.x, y: g.y, o: personOpts(g) }); });
      S.npcOrder.forEach(function (id) { var n = S.npcs[id], q = npcPos(n); n.moving = q.moving; n.px = q.x; n.py = q.y; isoEnts.push({ x: q.x, y: q.y, o: personOpts(n) }); });
      isoEnts.sort(function (a, b) { return (a.x + a.y) - (b.x + b.y); });
      for (var ie = 0; ie < isoEnts.length; ie++) { var pjE = projOf(isoEnts[ie].x, isoEnts[ie].y); WZ.render.drawPerson(ctx, pjE.X, pjE.Y, isoEnts[ie].o); }
      R.drawClouds(ctx, rect, S.time);
    } else {
    R.drawGround(ctx, rect);
    // 全览模式：可玩范围框 + 商圈（区域）划分（10/25）
    if (S.overview || z < (S.zoomBase || 1) * 0.6) {
      var regs = (S.params && S.params.regions) || [];
      var REG_COLOR = { jiangxin: 'rgba(90,140,190,0.55)', shuomen: 'rgba(120,170,140,0.5)', wuma: 'rgba(192,57,43,0.5)', jiushan: 'rgba(150,120,180,0.45)', shuixin: 'rgba(200,140,60,0.45)', tanghe: 'rgba(70,130,150,0.45)', yuanjiao: 'rgba(140,140,140,0.4)' };
      ctx.lineWidth = 1.5 / z; ctx.font = Math.round(13 / z) + 'px ' + (R.FONT || 'sans-serif');
      regs.forEach(function (r) {
        if (!(r.w > 0)) return;
        ctx.strokeStyle = REG_COLOR[r.id] || 'rgba(120,120,120,0.4)';
        ctx.setLineDash([8 / z, 6 / z]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
        ctx.fillStyle = REG_COLOR[r.id] || 'rgba(120,120,120,0.5)';
        ctx.textAlign = 'left';
        ctx.fillText(r.name, r.x + 8 / z, r.y + 20 / z);
      });
      // 可玩范围：全部地点的外接框（琥珀虚线）
      var bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
      S.map.places.forEach(function (pl) {
        bx0 = Math.min(bx0, pl.x); by0 = Math.min(by0, pl.y); bx1 = Math.max(bx1, pl.x); by1 = Math.max(by1, pl.y);
      });
      if (bx1 > bx0) {
        ctx.strokeStyle = 'rgba(255,209,102,0.75)'; ctx.lineWidth = 2.5 / z;
        ctx.setLineDash([14 / z, 10 / z]);
        ctx.strokeRect(bx0 - 70, by0 - 70, bx1 - bx0 + 140, by1 - by0 + 140);
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,209,102,0.9)';
        ctx.textAlign = 'left';
        ctx.fillText('可玩范围', bx0 - 60, by0 - 80 - 14 / z);
      }
    }
    R.drawZones(ctx, activeZones, S.time);
    R.drawRoadwork(ctx, S.map.getRoadwork().cells);
    if (S.plan && S.plan.legs && R.drawPlanLegs) R.drawPlanLegs(ctx, S.plan.legs, S.time); // 提示词 5：规划线（静态细线）
    if (S.guide) {
      updateGuide();
      if (S.guideOld && S.time - S.guideOld.t0 < 0.5) R.drawGuide(ctx, S.guideOld.path, S.time, 1 - (S.time - S.guideOld.t0) / 0.5, false);
      var gpl = S.map.placeById(S.guide.id);
      R.drawGuide(ctx, S.guide.path, S.time, 1, S.guide.flashUntil && S.time < S.guide.flashUntil, gpl ? { x: gpl.ex, y: gpl.ey } : null);
    } else R.drawPathRibbon(ctx, S.player.path, S.player.goal, S.time);
    var ents = [];
    var p = S.player;
    ents.push({ x: p.x, y: p.y, draw: function (c) { WZ.render.drawPerson(c, p.x, p.y, personOpts(p)); } });
    S.guestOrder.forEach(function (id) { var g = S.guests[id]; if (g.mode === 'home') return; ents.push({ x: g.x, y: g.y, draw: function (c) { WZ.render.drawPerson(c, g.x, g.y, personOpts(g)); } }); });
    S.npcOrder.forEach(function (id) { var n = S.npcs[id], q = npcPos(n); n.moving = q.moving; n.anim = (n.anim || 0) + (q.moving ? 0.25 : 0); n.px = q.x; n.py = q.y; ents.push({ x: q.x, y: q.y, draw: function (c) { WZ.render.drawPerson(c, q.x, q.y, personOpts(n)); } }); });
    R.drawScene(ctx, rect, ents, S.time, S.stage);
    R.drawClouds(ctx, rect, S.time); // 云影漂移（盖在地物上，叠色之前）
    } // 等轴/经典 分支结束
    p = S.player; // 等轴分支未走 `var p = S.player`（var 提升但未赋值），屏幕层统一取当前玩家

    // 叠色
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    R.drawTint(ctx, v, S.stage, S.weather, S.time);

    // 灯光（世界层，叠色之后）
    ctx.setTransform(v.dpr * z, 0, 0, v.dpr * z, -ox * v.dpr * z, -oy * v.dpr * z);
    if (!(S.iso && S.render.isoGround)) R.drawLights(ctx, rect, S.stage, S.time);

    // 屏幕层：图标、名字、心、气泡、天气、黑屏
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    var placeLabels = S.map.places.filter(function (pl) { return !pl.poi || (S.plan && S.plan.route.indexOf(pl.id) >= 0); }).map(function (pl) {
      var s = worldToScreen(pl.ex, pl.ey - R.labelLift(pl));
      var crowded = activeZones.some(function (zn) { return zn.placeId === pl.id; });
      var promoMap = root.WZ.content && root.WZ.content.promos;
      var o = { place: pl, sx: Math.round(s.x), sy: Math.round(s.y), crowded: crowded, landmark: pl.visual === 'wuma' || pl.visual === 'mochi' || pl.visual === 'center', promo: !!(promoMap && promoMap[pl.id]) };
      if (S.plan) {
        var ri = S.plan.route.indexOf(pl.id);
        if (ri >= 0) { o.order = ri + 1; o.done = S.plan.visited.indexOf(pl.id) >= 0; }
        var fl = S.plan.flags[pl.id], lv = fl && fl.level ? fl.level : '';
        S.flagPrev = S.flagPrev || {}; S.flagFlash = S.flagFlash || {};
        if (S.flagPrev[pl.id] !== undefined && S.flagPrev[pl.id] !== lv && lv) S.flagFlash[pl.id] = S.time + 1.2; // 旗色变化闪一下
        S.flagPrev[pl.id] = lv;
        if (lv) { o.flag = lv; o.flash = S.time < (S.flagFlash[pl.id] || 0); o.glow = lv === 'red' && ri < 0; }
        var keep = ri >= 0 || (pl.types || []).some(function (t) { return t === 'home' || t === 'toilet'; });
        if (S.plan.dim && !keep) o.dim = true; // 出发后：不在路线上的店变暗（10/24 #6）
      }
      return o;
    });
    var entLabels = [];
    S.guestOrder.forEach(function (id) {
      var g = S.guests[id]; if (g.mode === 'home') return;
      var s = worldToScreen(g.x, g.y - (WZ.characters ? WZ.characters.height(personOpts(g)) : (g.mode === 'sit' ? 22 : 26)));
      // PRD-v3 P4：需求图标常显——玩家不用猜谁想去哪
      var need = g.data ? (R.needIconOf ? R.needIconOf(g.data.tag) : '') : '';
      entLabels.push({ sx: Math.round(s.x), sy: Math.round(s.y), kind: 'guest', name: g.data ? g.data.name : id, hearts: g.data && g.data.hearts != null ? g.data.hearts : null, patience: g.data && g.data.patience != null ? g.data.patience : null, bubble: g.bubble && g.bubble.text, tone: g.bubble && g.bubble.tone, status: g.mode, need: need });
    });
    S.npcOrder.forEach(function (id) { var n = S.npcs[id], s = worldToScreen(n.px != null ? n.px : n.x, (n.py != null ? n.py : n.y) - (WZ.characters ? WZ.characters.height(personOpts(n)) : 30)); entLabels.push({ sx: Math.round(s.x), sy: Math.round(s.y), kind: 'npc', label: n.label, bubble: n.bubble && n.bubble.text }); });
    var ps = worldToScreen(p.x, p.y - (WZ.characters ? WZ.characters.height(personOpts(p)) : 38));
    entLabels.push({ sx: Math.round(ps.x), sy: Math.round(ps.y), kind: 'player', name: p.name, bubble: p.bubble && p.bubble.text });
    // 视野内的 POI 与街名（屏幕坐标），交给 render 按优先级避让
    var vx0 = rect.x - 40, vx1 = rect.x + rect.w + 40, vy0 = rect.y - 40, vy1 = rect.y + rect.h + 60, poiLabels = [], streetLabels = [];
    var fl = (S.plan && S.plan.flags) || {}, inRoute = (S.plan && S.plan.route) || [];
    for (var pi = 0; pi < S.pois.length; pi++) {
      var q = S.pois[pi];
      if (S.iso) { var qsc0 = worldToScreen(q.x, q.y); if (qsc0.x < -80 || qsc0.x > v.w + 80 || qsc0.y < -80 || qsc0.y > v.h + 80) continue; }
      else if (q.x < vx0 || q.x > vx1 || q.y < vy0 || q.y > vy1) continue;
      if (q.added && inRoute.indexOf(q.id) >= 0) continue; // 已加进路线的，由地点徽章画
      var qs = worldToScreen(q.x, q.y), lv = fl[q.id] && fl[q.id].level;
      if (lv) { S.flagPrev = S.flagPrev || {}; S.flagFlash = S.flagFlash || {}; if (S.flagPrev[q.id] !== undefined && S.flagPrev[q.id] !== lv) S.flagFlash[q.id] = S.time + 1.2; S.flagPrev[q.id] = lv; }
      poiLabels.push({ poi: q, sx: Math.round(qs.x), sy: Math.round(qs.y), flag: lv || '', flash: lv && S.time < ((S.flagFlash || {})[q.id] || 0) });
    }
    poiLabels.sort(function (a, b) { return (b.flag ? 1 : 0) - (a.flag ? 1 : 0); });
    S.streets.forEach(function (st) {
      var ss = worldToScreen(st[1], st[2]);
      if (S.iso) { if (ss.x < -80 || ss.x > v.w + 80 || ss.y < -80 || ss.y > v.h + 80) return; }
      else if (st[1] < vx0 || st[1] > vx1 || st[2] < vy0 || st[2] > vy1) return;
      streetLabels.push({ name: st[0], sx: ss.x, sy: ss.y, ang: st[3] });
    });
    R.drawLabels(ctx, v, placeLabels, entLabels, S.time, { pois: poiLabels, streets: streetLabels, zoom: z });
    // 浮字层（PRD-v3 P3）：上飘 + 淡出
    if (S.floats && S.floats.length) {
      S.floats.forEach(function (f) {
        var fs = worldToScreen(f.x, f.y);
        var age = (S.time - f.born) / 1.4;
        ctx.globalAlpha = Math.max(0, 1 - age);
        R.drawFloatText(ctx, Math.round(fs.x), Math.round(fs.y - 34 - age * 26), f.text, f.color);
        ctx.globalAlpha = 1;
      });
    }
    R.weather.draw(ctx, v.w, v.h, S.time);
    if (S.time < S.flashUntil) R.drawFlash(ctx, v, 1);
  }

  E.redraw = draw;
  WZ.engine = E;
})(typeof window !== 'undefined' ? window : globalThis);
