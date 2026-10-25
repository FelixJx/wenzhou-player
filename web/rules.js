// rules.js —— 一局的规则状态机（W2 拥有）。纯逻辑、无 DOM；输入事件，输出命令数组（契约 §4）。
// 依赖加载顺序：guests.js → scoring.js → celebrity.js → rules.js
(function (root) {
  root.WZ = root.WZ || {};

  // 所有数值优先读 params（content/params.js，扁平键名同下），缺省用这里的默认值
  var DEFAULTS = {
    minPerSec: 4, stayMin: 32, restMin: 64, goBackMin: 64, dayMin: 1024, hearts: 3, calmTimes: 2,
    patienceDecayPerMin: 0, calmPatience: 0, calmCostMin: 0,   // 游戏数值在 content/params.js；默认 0 = 旧版逐颗心语义（单测锚定）
    lineMax: 20,
    walkMeterMax: 128, walkWarnRatio: 0.75,           // 连续走 128 分钟掉 1 心，75% 时冒汗
    foodDeadlineMin: 360, foodWarnMin: 256, foodDropEvery: 64,  // 13:00 前没吃上开始掉心
    crowdDropEvery: 48,                                // 人潮区内每 48 分钟掉 1 心
    shopWarnMin: 512, shopWarnEvery: 128,              // 下午起每 128 分钟盯一次橱窗
    boredGraceStops: 1,                                // 第 2 站起没看点就掉心
    rushFreeStops: 3, rushSpeedBonus: 0.2,             // 第 4 站起每站掉心；心低全队提速
    toiletEveryStops: 3,                               // 每 3 站内要经过厕所
    sitToLostMin: 64, runawayToLostMin: 128,           // 坐下/跑开太久没管 → 走丢
    contagionMin: 30,                                  // 困难局：有人坐下 30 分钟后相邻心低者跟着坐
    titleKindMin: 3, titleRushMax: 1, titleLostMin: 2, knowledgeCount: 3,
    rainAtMin: 0,                                      // >0 时该分钟下雨（城市事件，可选）
  };
  // content/params.js 里同义但不同名的键（内容优先）
  var PARAM_ALIAS = {
    dayMin: 'totalMin', walkMeterMax: 'walkTiredMin', foodDropEvery: 'foodDropEveryMin',
    crowdDropEvery: 'crowdDropEveryMin', contagionMin: 'infectDelayMin',
  };
  var stage = function (clockMin, thresholds) {
    var t = thresholds || [256, 512, 768, 972];
    for (var i = 0; i < t.length; i++) if (clockMin < t[i]) return i;
    return t.length;
  };
  var CONFLICT_UI = {
    walk_rush: { title: '走不动想歇，催催催想走', a: '歇一下', b: '接着走' },
    crowd_shop: { title: '怕挤挤想绕，买买买想逛', a: '绕小巷', b: '去逛店' },
  };

  function createRun(opts) {
    opts = opts || {};
    var G = root.WZ.guests, S = root.WZ.scoring, CEL = root.WZ.celebrity;
    var params = opts.params || {};
    var P = function (k) {
      if (typeof params[k] === 'number') return params[k];
      var alias = PARAM_ALIAS[k];
      return alias && typeof params[alias] === 'number' ? params[alias] : DEFAULTS[k];
    };
    var STAGES = Array.isArray(params.stageThresholds) && params.stageThresholds.length ? params.stageThresholds : null;
    var CONFLICTS = Array.isArray(params.conflictPairs) && params.conflictPairs.length ? params.conflictPairs : root.WZ.guests.CONFLICTS;
    var content = opts.content || {};
    var places = opts.places || content.places || [];
    var zones = content.zones || opts.zones || [];
    var rng = G.makeRng(opts.seed == null ? 1 : opts.seed);
    var MAXH = P('hearts');
    var difficulty = opts.difficulty || 'easy';
    var LIGHT = !!opts.light; // PRD-v4 商圈带队（10/25 裁决）：砍掉耐心掉心/名人/答题/营业时间扑空，专注「点店→表态→积分」

    var guests = G.buildTeam({
      troubles: opts.troubles, difficulty: difficulty, params: params, content: content, rng: rng, tags: opts.tags, lines: opts.lines,
    });
    // 耐心百分比（10/24 替换 3 颗心）：patience 0–100 是主数值；hearts 由它推出（每颗心 = 100/MAXH），
    // 旧规则里"心 ≤ 1""心归零"的判断不变，只是现在由耐心驱动
    var PER = 100 / MAXH;
    function setP(g, v) {
      g.patience = Math.max(0, Math.min(100, v));
      g.hearts = g.patience <= 0 ? 0 : Math.ceil(g.patience / PER - 1e-3);
      if (g.hearts === 0) g.patience = 0;
    }
    // 心被外部直接改过（名人效果 / 单测）→ 耐心按心数对齐
    function pat(g) {
      var d = g.patience <= 0 ? 0 : Math.ceil(g.patience / PER - 1e-3);
      if (d !== g.hearts) g.patience = Math.max(0, Math.min(100, g.hearts * PER));
      return g.patience;
    }
    guests.forEach(function (g) { setP(g, 100); });
    var state = {
      clockMin: 0, guests: guests, route: [], visited: [], events: [], celebritiesMet: [], celebritiesSeen: [],
      pendingInterrupt: null, pendingCeleb: null, speedMul: 1, difficulty: difficulty, firstRun: !!opts.firstRun,
      stops: 0, weather: 'none', zone: null, lastPlaceId: 'center', started: false, ended: false, hasSight: false,
      stayed: [], knowledgeSeen: {},
      // 带队积分（PRD-v4）：state.score 累计；scoreLog 每店一条 {placeId,total,lines}
      score: 0, scoreLog: [],
    };
    var mem = {};
    guests.forEach(function (g) {
      mem[g.id] = { walkAcc: 0, walkWarned: false, foodAcc: 0, foodWarned: false, crowdAcc: 0, shopWarnAt: 0,
        sitAt: null, runawayAt: null, runawayTo: null, toiletStops: 0, contagionAt: null, lostHeart: false, lastTwo: [], satisfiedAt: '' };
    });
    var queue = [];          // 排队中的 interrupt
    var meta = {};           // interruptId → 内部数据
    var usedPairs = {};      // 冲突对每局只触发一次

    // ---------- 工具 ----------
    function placeOf(id) { for (var i = 0; i < places.length; i++) if (places[i].id === id) return places[i]; return null; }
    function typesOf(id) { var p = placeOf(id); return (p && p.types) || []; }
    function hasType(id, t) { return typesOf(id).indexOf(t) >= 0; }
    function posOf(id) { var p = placeOf(id); return p ? { x: p.x || 0, y: p.y || 0 } : { x: 0, y: 0 }; }
    function byId(id) { for (var i = 0; i < guests.length; i++) if (guests[i].id === id) return guests[i]; return null; }
    function byTag(tag) { return guests.filter(function (g) { return g.tag === tag; }); }
    function nearest(type, fromId) {
      var from = posOf(fromId || state.lastPlaceId), best = null, bd = Infinity;
      places.forEach(function (p) {
        if ((p.types || []).indexOf(type) < 0) return;
        var d = Math.pow((p.x || 0) - from.x, 2) + Math.pow((p.y || 0) - from.y, 2);
        if (d < bd) { bd = d; best = p; }
      });
      return best;
    }
    function log(type, data) { state.events.push(Object.assign({ at: state.clockMin, type: type }, data || {})); }
    function nameOf(id) { var p = placeOf(id); return p ? p.name || id : ''; }
    function txt(g, key, placeId) {
      var place = nameOf(placeId || mem[g.id].satisfiedAt || state.lastPlaceId);
      return G.text(content, g.tag, key, rng, { place: place, name: opts.playerName || '' });
    }
    // tone：good=绿（被满足/开心）bad=红（抱怨/掉耐心）info=灰（旁白）。每人留最近 5 条，点游客可看全（10/24 #3）
    function bubble(cmds, g, text, ms, tone) {
      if (!text) return;
      tone = tone || 'info';
      g.msgs = g.msgs || [];
      g.msgs.push({ at: Math.round(state.clockMin), text: text, tone: tone });
      if (g.msgs.length > 5) g.msgs.shift();
      cmds.push({ type: 'bubble', id: g.id, text: text, ms: ms || 2200, tone: tone });
    }
    function hud(cmds) { cmds.push({ type: 'hud' }); }
    // ---------- 商圈（10/25）：按真实地理框归属 ----------
    function regionOf(place) {
      if (!place) return '其他';
      if (place.region) return place.region;
      var list = params.regions || [];
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.w > 0 && place.x >= r.x && place.x <= r.x + r.w && place.y >= r.y && place.y <= r.y + r.h) return r.name;
      }
      return list.length ? list[list.length - 1].name : '其他'; // 远郊兜底（框外=远郊）
    }
    function regionName(id) {
      var list = params.regions || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
      return id;
    }
    // ---------- 带队积分（PRD-v4 §2.1）：到店时每位游客按需求匹配 + 店铺真实评分 ± 分 ----------
    // （NEED_TYPE 复用下方 v1.0 的需求→类型表）
    function placeRating(place) {
      var info = place && place.real && place.real.info;
      if (info && (info.rating || info.ctrip || info.am)) return Number(info.rating || info.ctrip || info.am);
      var rt = root.WZ.content && root.WZ.content.ratings;
      if (rt && rt.lookup) { var r = rt.lookup(place && place.name); if (r) return Number(r.dp || r.am || 0); }
      return 0;
    }
    function placeReviews(place) {
      var info = place && place.real && place.real.info;
      if (info && info.reviews) return Number(info.reviews);
      var rt = root.WZ.content && root.WZ.content.ratings;
      if (rt && rt.lookup) { var r = rt.lookup(place && place.name); if (r) return Number(r.dpn || 0); }
      return 0;
    }
    var MISS_SAY = { food: '还没吃到正宗的', shop: '没地方买东西？', walk: '还要走多久', bored: '这里…有点没劲', toilet: '厕所到底在哪' };
    var MATCH_SAY = { food: '就是这个味，值了', shop: '这手信够发一圈', walk: '终于能坐下了', bored: '这个有故事，我听', toilet: '谢谢你，记住了' };
    // scoreStop(place, guests, stayMin) → { total, lines:[{guestId, pts, say}] }（纯函数，不碰 state）
    function scoreStop(place, guests, stayMin) {
      var sc = params.score || {};
      var types = (place && place.types) || [];
      var rating = placeRating(place), reviews = placeReviews(place);
      var crowdHot = (place.crowdWindow ? true : false) || reviews > (sc.crowdReviewsAt || 3000);
      var total = 0, lines = [];
      (guests || []).forEach(function (g) {
        var pts = 0, say = '';
        var want = NEED_TYPE[g.tag];
        var match = want && types.indexOf(want) >= 0;
        if (g.tag === 'any') {
          pts = sc.any != null ? sc.any : 2;
          say = rating ? '评分 ' + rating.toFixed(1) + '，看着行' : '没评分，试试呗';
        } else if (g.tag === 'rush') {
          if (stayMin > (sc.rushLongAt || 45)) { pts = sc.rushLong != null ? sc.rushLong : -6; say = '要待 ' + stayMin + ' 分钟？太久了'; }
          else { pts = sc.rushOk != null ? sc.rushOk : 3; say = '站少，好'; }
        } else if (g.tag === 'crowd') {
          if (crowdHot) { pts = sc.crowdBad != null ? sc.crowdBad : -8; say = (reviews > (sc.crowdReviewsAt || 3000) ? reviews + ' 条评价的店肯定排队' : '人多') + '，我在外面等'; }
          else if (types.indexOf('lane') >= 0) { pts = sc.crowdLane != null ? sc.crowdLane : 10; say = '人少，我才进'; }
          else { pts = sc.crowdOk != null ? sc.crowdOk : 1; say = '还行，不挤'; }
        } else if (match) {
          var m = mem[g.id];
          var first = !m.matchHits;
          m.matchHits = (m.matchHits || 0) + 1;
          pts = first ? (sc.match != null ? sc.match : 12) : (sc.matchAgain != null ? sc.matchAgain : 5);
          say = MATCH_SAY[g.tag] || '不错';
          if (rating >= (sc.hiRatingAt || 4.5)) { pts += (sc.hiRating != null ? sc.hiRating : 3); say += '（大众点评 ' + rating.toFixed(1) + '）没白来'; }
          else if (rating && rating < (sc.loRatingAt || 4.0)) { pts += (sc.loRating != null ? sc.loRating : -4); say += '评分才 ' + rating.toFixed(1) + '，将就吃吧'; }
        } else if (types.indexOf('toilet') >= 0) {
          pts = 0; say = '顺便上个厕所';
        } else {
          pts = sc.miss != null ? sc.miss : -2;
          say = MISS_SAY[g.tag] || '一般';
        }
        total += pts;
        lines.push({ guestId: g.id, pts: pts, say: say });
      });
      return { total: total, lines: lines };
    }
    function advance(cmds, min) {
      state.clockMin += min;
      cmds.push({ type: 'clock', clockMin: state.clockMin });
    }
    function active(g) { return g.status === 'follow'; }
    // v1.0：游客需求 → 能满足它的地点类型（扑空时让对口的游客先开口）
    var NEED_TYPE = { food: 'food', shop: 'shop', bored: 'sight', walk: 'rest', crowd: 'lane', toilet: 'toilet' };
    // v1.0：真实营业时间判定。clockMin=0 是 07:00；hours 形如 "06:00-20:00,17:00-02:00"；closedDow 1=周一
    function isOpenAt(place, clockMin) {
      var dow = new Date().getDay() || 7;
      if (place.closedDow && place.closedDow.indexOf(dow) >= 0) return false;
      var t = 420 + clockMin;
      return String(place.hours).split(',').some(function (seg) {
        var ab = seg.split('-'); if (ab.length !== 2) return true;
        var a = toM(ab[0]), b = toM(ab[1]); if (isNaN(a) || isNaN(b)) return true;
        if (b <= a) b += 1440;
        return (t >= a && t < b) || (t + 1440 >= a && t + 1440 < b) || (t - 1440 >= a && t - 1440 < b);
      });
    }
    function toM(x) { var hm = String(x).trim().split(':'); return (+hm[0]) * 60 + (+hm[1] || 0); }
    // 停站知识：同一地点多次停站轮换展示（审查 L8）；没有库时退回 place.knowledgeId
    function pickStayKnowledge(placeId, place) {
      var list = (content.knowledge || []).filter(function (k) { return k && k.placeId === placeId; });
      if (!list.length) return place.knowledgeId || '';
      var seen = state.knowledgeSeen;
      seen[placeId] = seen[placeId] || 0;
      var k = list[seen[placeId] % list.length];
      seen[placeId] += 1;
      return k.id || place.knowledgeId || '';
    }

    // ---------- 状态变化 ----------
    function satisfy(cmds, g, placeId) {
      if (g.satisfied) return;
      g.satisfied = true; g.remembered = true;
      mem[g.id].satisfiedAt = placeId || state.lastPlaceId;
      mem[g.id].voiced = false; // 需求被响应：耐心停止下降（不回升）
      bubble(cmds, g, txt(g, 'resolved'), 2600, 'good');
      log('satisfied', { id: g.id, tag: g.tag });
    }
    function sit(cmds, g) {
      g.status = 'sit'; mem[g.id].sitAt = state.clockMin;
      cmds.push({ type: 'sit', id: g.id });
      log('sit', { id: g.id });
    }
    function runaway(cmds, g, place) {
      if (!place) { lose(cmds, g, state.lastPlaceId, true); return; }
      g.status = 'runaway'; mem[g.id].runawayTo = place.id; mem[g.id].runawayAt = state.clockMin;
      cmds.push({ type: 'runaway', id: g.id, placeId: place.id });
      log('runaway', { id: g.id, placeId: place.id });
    }
    function lose(cmds, g, atPlaceId, withInterrupt) {
      g.status = 'lost'; g.lostAt = posOf(atPlaceId || state.lastPlaceId);
      mem[g.id].sitAt = null; mem[g.id].runawayAt = null;
      cmds.push({ type: 'lost', id: g.id });
      log('lost', { id: g.id, placeId: atPlaceId });
      if (withInterrupt) {
        pushInterrupt(cmds, { id: 'lost_' + g.id, title: g.name + ' 没跟上来',
          a: { label: '回去领他 +' + P('goBackMin') + '分钟' }, b: { label: '继续走' } }, { kind: 'lost', gid: g.id });
      }
    }
    function ret(cmds, g) {
      g.status = 'follow'; g.meter = 0;
      var m = mem[g.id]; m.walkAcc = 0; m.walkWarned = false; m.sitAt = null; m.runawayAt = null; m.runawayTo = null; m.contagionAt = null;
      cmds.push({ type: 'return', id: g.id });
      log('return', { id: g.id });
    }
    // 心归零的后果（按标签）
    function onZero(cmds, g) {
      if (g.tag !== 'rush' && g.tag !== 'shop') bubble(cmds, g, txt(g, 'crisis'), 2600, 'bad');
      switch (g.tag) {
        case 'walk': sit(cmds, g); break;
        case 'food': runaway(cmds, g, nearest('food')); break;
        case 'bored': runaway(cmds, g, nearest('sight')); break;
        case 'toilet': runaway(cmds, g, nearest('toilet')); break;
        case 'crowd': lose(cmds, g, state.lastPlaceId, true); break;
        default: break; // rush/shop/any：不脱队
      }
    }
    function drop(cmds, g, text) {
      if (g.tag === 'any' || g.hearts <= 0) return false;
      setP(g, pat(g) - PER); mem[g.id].lostHeart = true; mem[g.id].voiced = true;
      bubble(cmds, g, text || txt(g, 'sign'), 0, 'bad');
      cmds.push({ type: 'float', id: g.id, text: '耐心 −' + Math.round(PER) + '%', color: '#ff6b6b' }); // 掉耐心看得见
      cmds.push({ type: 'patience', id: g.id, value: g.patience, delta: -PER });
      log('drop', { id: g.id, tag: g.tag, hearts: g.hearts, patience: g.patience });
      if (g.hearts === 0) { onZero(cmds, g); return true; }
      return false;
    }
    function pushInterrupt(cmds, it, m) {
      meta[it.id] = m;
      if (state.pendingInterrupt) { queue.push(it); return; }
      state.pendingInterrupt = it;
      cmds.push({ type: 'interrupt', id: it.id, title: it.title, a: it.a, b: it.b });
    }
    function flushQueue(cmds) {
      if (state.pendingInterrupt || !queue.length) return;
      var it = queue.shift();
      state.pendingInterrupt = it;
      cmds.push({ type: 'interrupt', id: it.id, title: it.title, a: it.a, b: it.b });
    }
    // 冲突对双方同时要闹（hearts ≤ 1）→ 打架中断，每对每局一次
    function checkConflicts(cmds) {
      CONFLICTS.forEach(function (pair) {
        var key = pair[0] + '_' + pair[1];
        if (usedPairs[key]) return;
        var a = byTag(pair[0]).filter(active)[0], b = byTag(pair[1]).filter(active)[0];
        if (!a || !b || a.hearts > 1 || b.hearts > 1) return;
        usedPairs[key] = true;
        var ui = CONFLICT_UI[key] || { title: a.name + '和' + b.name + '吵起来了', a: '帮' + a.name, b: '帮' + b.name };
        pushInterrupt(cmds, { id: 'conflict_' + key, title: ui.title, a: { label: ui.a }, b: { label: ui.b } },
          { kind: 'conflict', a: a.id, b: b.id, pair: key });
      });
    }
    function routeNames() {
      return state.route.map(function (id) { var p = placeOf(id); return p ? p.name : ''; }).filter(Boolean);
    }
    function checkCelebrity(cmds, when, placeId, stayMin) {
      if (!CEL) return;
      var place = placeOf(placeId);
      var all = CEL.checkAll({ when: when, placeId: placeId, place: place, stayMin: stayMin, state: state, places: places, content: content,
        noHeartLoss: guests.every(function (g) { return !mem[g.id].lostHeart; }), stageThresholds: STAGES });
      if (!all.length) return;
      var c = all[0]; // content 顺序取第一个未出场（PRD-v2 F2c）
      var who = c.who || c.id;
      state.celebritiesSeen.push(who);
      var card = CEL.buildCard(c, { name: opts.playerName || '', place: place ? place.name : '', route: routeNames().join('、'), stage: stage(state.clockMin, STAGES) }, rng);
      state.pendingCeleb = card;
      cmds.push({ type: 'celebrity', who: who, when: when, card: card }); // when 供 main 把 start 路由为横幅（F3）
      log('celebrity', { who: who, when: when });
    }
    function zoneActive() {
      if (!state.zone) return false;
      var z = zones.filter(function (x) { return x.id === state.zone; })[0];
      var p = z && z.placeId ? placeOf(z.placeId) : null;
      var w = p && p.crowdWindow;
      return !w || (state.clockMin >= w[0] && state.clockMin <= w[1]);
    }
    function endRun(cmds, reason) {
      if (state.ended) return;
      state.ended = true;
      // 买买买：到家时还没买到 → 留在最近的手信店门口（结尾最常见的丢人）
      byTag('shop').forEach(function (g) {
        if (g.status !== 'follow' || g.satisfied) return;
        var shop = nearest('shop');
        bubble(cmds, g, txt(g, 'sign'), 0, 'bad');
        lose(cmds, g, shop ? shop.id : state.lastPlaceId, false);
      });
      cmds.push({ type: 'end', reason: reason });
      log('end', { reason: reason });
    }

    // ---------- 契约接口 ----------
    function planRoute(ids) {
      state.route = (ids || []).slice();
      var n = state.route.length;
      var typeSets = state.route.map(typesOf);
      var has = function (t) { return typeSets.some(function (ts) { return ts.indexOf(t) >= 0; }); };
      var sightCount = typeSets.filter(function (ts) { return ts.indexOf('sight') >= 0; }).length;
      var varied = false;
      for (var i = 1; i < typeSets.length; i++) if (typeSets[i].join() !== typeSets[i - 1].join()) varied = true;
      var crowdy = state.route.some(function (id) { var p = placeOf(id); return p && p.crowdWindow; });
      return guests.map(function (g) {
        var mood = 'neutral';
        switch (g.tag) {
          case 'walk': mood = has('rest') ? 'happy' : 'worry'; break;
          case 'food': mood = has('food') ? 'happy' : 'worry'; break;
          case 'crowd': mood = has('lane') ? 'happy' : crowdy ? 'worry' : 'neutral'; break;
          case 'shop': mood = has('shop') ? 'happy' : 'worry'; break;
          case 'bored': mood = sightCount >= 1 && varied ? 'happy' : sightCount >= 1 ? 'neutral' : 'worry'; break;
          case 'rush': mood = n <= P('rushFreeStops') ? 'happy' : n >= P('rushFreeStops') + 2 ? 'worry' : 'neutral'; break;
          case 'toilet': mood = has('toilet') ? 'happy' : n >= P('toiletEveryStops') ? 'worry' : 'neutral'; break;
          default: mood = 'neutral';
        }
        var key = mood === 'happy' ? 'previewHappy' : mood === 'worry' ? 'previewWorry' : 'previewNeutral';
        return { guestId: g.id, mood: mood, text: txt(g, key) };
      });
    }

    function tick(dt) {
      var cmds = [];
      if (state.ended) return cmds;
      dt = Math.max(0, Number(dt) || 0);
      if (!state.started) { if (!LIGHT) checkCelebrity(cmds, 'start', 'center', 0); }
      state.clockMin += dt;
      var rain = LIGHT ? 0 : P('rainAtMin');
      if (rain > 0 && state.weather === 'none' && state.clockMin >= rain) setWeatherInner(cmds, 'rain');
      if (state.clockMin >= P('dayMin')) { state.clockMin = P('dayMin'); endRun(cmds, 'midnight'); return cmds; }

      if (LIGHT) { checkConflicts(cmds); return cmds; } // 轻量局：只走时钟（掉队/传染/掉心全免，评分在 onArrive）
      guests.forEach(function (g) {
        var m = mem[g.id];
        // 提出需求后没被响应：耐心按游戏分钟持续下降（只降不升，响应后停止）
        if (active(g) && m.voiced && !g.satisfied && g.tag !== 'any' && g.patience > 0) {
          var before = pat(g);
          setP(g, before - P('patienceDecayPerMin') * dt);
          // 每掉满 5% 冒一次「耐心 −5%」（看得见、听得见；10/24 #6/#10）
          if (Math.floor(before / 5) > Math.floor(g.patience / 5) && g.patience > 0) {
            cmds.push({ type: 'float', id: g.id, text: '耐心 −5%', color: '#ff6b6b' });
            cmds.push({ type: 'patience', id: g.id, value: g.patience, delta: -5, decay: true, low: before >= 50 && g.patience < 50 });
          } else if (before >= 50 && g.patience < 50) cmds.push({ type: 'patience', id: g.id, value: g.patience, delta: g.patience - before, low: true });
          if (g.patience <= 0) { log('drop', { id: g.id, tag: g.tag, hearts: 0, patience: 0, decay: true }); onZero(cmds, g); }
        }
        // 提示词 6：耐心见底的游客，天黑后走丢概率最高（每人只判一次，一半概率）
        if (active(g) && g.patience <= 0 && g.tag !== 'any' && !m.nightRolled && state.clockMin >= (STAGES ? STAGES[2] : 768)) {
          m.nightRolled = true;
          if (rng() < 0.5) { bubble(cmds, g, '天黑了，我自己走走……', 2600, 'bad'); lose(cmds, g, state.lastPlaceId, true); return; }
        }
        if (active(g)) {
          if (g.tag === 'walk' && !g.satisfied) {
            m.walkAcc += dt; g.meter = Math.min(1, m.walkAcc / P('walkMeterMax'));
            if (!m.walkWarned && g.meter >= P('walkWarnRatio')) { m.walkWarned = true; m.voiced = true; bubble(cmds, g, txt(g, 'sign'), 0, 'bad'); }
            if (m.walkAcc >= P('walkMeterMax')) { m.walkAcc = 0; m.walkWarned = false; g.meter = 0; drop(cmds, g, '走不动了……'); }
          }
          if (g.tag === 'food' && !g.satisfied) {
            if (state.clockMin >= P('foodDeadlineMin')) {
              m.foodAcc += dt;
              if (m.foodAcc >= P('foodDropEvery')) { m.foodAcc = 0; drop(cmds, g); }
            } else if (!m.foodWarned && state.clockMin >= P('foodWarnMin')) { m.foodWarned = true; m.voiced = true; bubble(cmds, g, txt(g, 'sign'), 0, 'bad'); }
          }
          if (g.tag === 'crowd' && zoneActive()) {
            m.crowdAcc += dt;
            if (m.crowdAcc >= P('crowdDropEvery')) { m.crowdAcc = 0; drop(cmds, g); }
          }
          if (g.tag === 'shop' && !g.satisfied && state.clockMin >= P('shopWarnMin') && state.clockMin - m.shopWarnAt >= P('shopWarnEvery')) {
            m.shopWarnAt = state.clockMin; m.voiced = true; bubble(cmds, g, txt(g, 'sign'), 0, 'bad');
          }
        } else if (g.status === 'sit' && m.sitAt != null && state.clockMin - m.sitAt >= P('sitToLostMin')) {
          lose(cmds, g, state.lastPlaceId, true);
        } else if (g.status === 'runaway' && m.runawayAt != null && state.clockMin - m.runawayAt >= P('runawayToLostMin')) {
          lose(cmds, g, m.runawayTo, true);
        }
      });

      // 困难局传染：有人坐下，相邻（队列前后）心 ≤1 的人 30 分钟后也坐下
      if (difficulty === 'hard') {
        guests.forEach(function (g, i) {
          if (g.status !== 'sit') return;
          [guests[i - 1], guests[i + 1]].forEach(function (n) {
            if (!n || !active(n) || n.tag === 'any' || n.hearts > 1) return;
            var m = mem[n.id];
            if (m.contagionAt == null) { m.contagionAt = state.clockMin; return; }
            if (state.clockMin - m.contagionAt >= P('contagionMin')) { bubble(cmds, n, '他都坐了，我也歇会儿。', 0, 'bad'); sit(cmds, n); }
          });
        });
      }
      checkConflicts(cmds);
      return cmds;
    }

    function onArrive(placeId) {
      var cmds = [];
      if (state.ended) return cmds;
      var place = placeOf(placeId);
      if (!place) return cmds;
      if (hasType(placeId, 'home')) {
        if (state.clockMin > 0) endRun(cmds, 'home');
        return cmds;
      }
      // v1.0 真实营业时间：到了关门的店 = 扑空（不停站、不算满足），游客当场反应（轻量局免——demo 无此判定）
      if (!LIGHT && place.hours && !isOpenAt(place, state.clockMin)) {
        state.lastPlaceId = placeId;
        if (state.visited.indexOf(placeId) < 0) state.visited.push(placeId); // 扑空也算到过：路线自动跳过，不再被拽回门口（issues 10/24 死循环）
        log('fact_closed', { placeId: placeId });
        var who = guests.filter(active);
        var hit = who.filter(function (g) { return (place.types || []).some(function (t) { return NEED_TYPE[g.tag] === t; }); })[0] || who[0];
        if (hit) bubble(cmds, hit, '铁门拉下来了……', 2600, 'bad');
        cmds.push({ type: 'closed', placeId: placeId, name: place.name, hours: place.hours });
        return cmds;
      }
      var min = typeof place.stayMin === 'number' ? place.stayMin : hasType(placeId, 'rest') ? P('restMin') : P('stayMin');
      // v1.0 真实排队：常排队的店，饭点到达要多等
      if (min > 0 && place.queueMin && ((state.clockMin >= 240 && state.clockMin <= 360) || (state.clockMin >= 600 && state.clockMin <= 720))) {
        min += place.queueMin;
        log('fact_queue', { placeId: placeId, min: place.queueMin });
        var rushG = guests.filter(function (g) { return active(g) && g.tag === 'rush'; })[0] || guests.filter(active)[0];
        if (rushG) bubble(cmds, rushG, '排了' + place.queueMin + '分钟队！', 2600, 'bad');
      }
      var isStop = min > 0;
      var firstVisitHere = state.visited.indexOf(placeId) < 0; // PRD-v4 对抗（codex #3）：重访不重复计分
      if (LIGHT && isStop && !firstVisitHere) isStop = false; // demo p.done：去过的店拒绝再进（轻量局）
      state.lastPlaceId = placeId;
      if (state.visited.indexOf(placeId) < 0) state.visited.push(placeId);
      if (hasType(placeId, 'sight')) state.hasSight = true;
      if (isStop) {
        state.stops += 1;
        if (state.stayed.indexOf(placeId) < 0) state.stayed.push(placeId); // 结算知识只取真停过的（审查 L9）
        var arriveAt = state.clockMin; // 到达时刻（停留推进前）
        advance(cmds, min);
        // codex #8：停留跨过午夜 → 立即收工（不再弹停站卡）
        if (state.clockMin >= P('dayMin')) {
          state.clockMin = P('dayMin');
          endRun(cmds, 'midnight');
          return cmds;
        }
        (state.timeline = state.timeline || []).push({ placeId: placeId, name: place.name, region: regionOf(place), arrive: arriveAt, leave: state.clockMin }); // 10/25：公布一天行程用
        var kid = pickStayKnowledge(placeId, place);
        // 带队积分（PRD-v4 §2.1）：每位游客按需求匹配 + 店铺真实评分逐个 ± 分；重访不重复计分（codex #3）
        var stayScoreOut = null;
        if (firstVisitHere) {
          var scored = scoreStop(place, guests.filter(function (g) { return active(g); }), min);
          state.score += scored.total;
          state.scoreLog.push({ placeId: placeId, name: place.name, at: Math.round(state.clockMin), total: scored.total, lines: scored.lines });
          stayScoreOut = { total: scored.total, lines: scored.lines };
        }
        cmds.push({ type: 'stay', placeId: placeId, min: min, knowledgeId: kid, score: stayScoreOut });
      }
      log('arrive', { placeId: placeId, stop: isStop });

      // 跑去这里的人归队
      guests.forEach(function (g) { if (g.status === 'runaway' && mem[g.id].runawayTo === placeId) ret(cmds, g); });

      guests.forEach(function (g) {
        if (!active(g)) return;
        var m = mem[g.id];
        switch (g.tag) {
          case 'walk':
            if (hasType(placeId, 'rest')) { m.walkAcc = 0; m.walkWarned = false; g.meter = 0; satisfy(cmds, g, placeId); }
            break;
          case 'food':
            if (hasType(placeId, 'food')) { m.foodAcc = 0; satisfy(cmds, g, placeId); }
            break;
          case 'crowd':
            if (hasType(placeId, 'lane')) satisfy(cmds, g, placeId);
            break;
          case 'shop':
            if (hasType(placeId, 'shop')) satisfy(cmds, g, placeId);
            break;
          case 'toilet':
            if (hasType(placeId, 'toilet')) { m.toiletStops = 0; satisfy(cmds, g, placeId); }
            else if (isStop) {
              m.toiletStops += 1;
              if (m.toiletStops === P('toiletEveryStops')) drop(cmds, g, '哪儿有厕所……（原地转圈）');
              else if (m.toiletStops > P('toiletEveryStops')) { bubble(cmds, g, '憋不住了！', 0, 'bad'); runaway(cmds, g, nearest('toilet')); }
            }
            break;
          case 'bored':
            if (!isStop) break;
            m.lastTwo.push(typesOf(placeId).slice().sort().join());
            if (m.lastTwo.length > 2) m.lastTwo.shift();
            var varied = m.lastTwo.length >= 2 && m.lastTwo[0] !== m.lastTwo[1];
            if (state.hasSight && varied) satisfy(cmds, g, placeId);
            else if (!g.satisfied && state.stops > P('boredGraceStops')) drop(cmds, g);
            break;
          case 'rush':
            if (isStop && state.stops > P('rushFreeStops')) {
              drop(cmds, g);
              if (g.hearts <= 1 && g.status === 'follow') {
                state.speedMul = 1 + P('rushSpeedBonus');
                bubble(cmds, g, '再磨蹭我拽着你们走！', 0, 'bad');
                hud(cmds);
              }
            }
            break;
          default: break;
        }
      });

      if (!LIGHT) checkCelebrity(cmds, 'arrive', placeId, min);
      checkConflicts(cmds);
      return cmds;
    }

    function onTapGuest(id) {
      var cmds = [];
      var g = byId(id);
      if (!g || state.ended) return cmds;
      if (g.status === 'lost') return cmds;
      if (g.status === 'runaway') { bubble(cmds, g, '他跑远了，过去找他吧。'); return cmds; }
      if (g.calmLeft > 0) {
        var idx = P('calmTimes') - g.calmLeft;
        g.calmLeft -= 1;
        var calmUp = P('calmPatience') || PER;
        setP(g, pat(g) + calmUp);
        if (P('calmCostMin') > 0) advance(cmds, P('calmCostMin')); // 哄一哄要花时间
        mem[g.id].contagionAt = null;
        bubble(cmds, g, G.calmText(content, idx, rng, g.tag), 0, 'good');
        cmds.push({ type: 'float', id: g.id, text: '耐心 +' + Math.round(calmUp) + '% 哄', color: '#5ee6a8' });
        cmds.push({ type: 'patience', id: g.id, value: g.patience, delta: calmUp, calmed: true });
        if (g.status === 'sit') ret(cmds, g);
        log('calm', { id: g.id, calmLeft: g.calmLeft });
      } else {
        bubble(cmds, g, G.calmText(content, P('calmTimes'), rng, g.tag), 1200);
      }
      hud(cmds);
      return cmds;
    }

    function onEnterZone(zoneId) {
      var cmds = [];
      if (state.ended) return cmds;
      state.zone = zoneId;
      if (zoneActive()) byTag('crowd').filter(active).forEach(function (g) { mem[g.id].voiced = true; bubble(cmds, g, txt(g, 'sign'), 0, 'bad'); });
      return cmds;
    }
    function onLeaveZone(zoneId) {
      var cmds = [];
      if (state.zone === zoneId || !zoneId) state.zone = null;
      byTag('crowd').forEach(function (g) { mem[g.id].crowdAcc = 0; });
      return cmds;
    }

    function setWeatherInner(cmds, kind) {
      state.weather = kind;
      cmds.push({ type: 'weather', kind: kind });
      checkCelebrity(cmds, 'weather:' + kind, state.lastPlaceId, 0);
    }
    function setWeather(kind) { var cmds = []; if (!state.ended) setWeatherInner(cmds, kind); return cmds; }

    function choose(interruptId, which) {
      var cmds = [];
      which = which === 'a' ? 'a' : 'b';
      if (interruptId && interruptId.indexOf('celeb_') === 0) {
        var who = interruptId.slice(6);
        var card = state.pendingCeleb && state.pendingCeleb.who === who ? state.pendingCeleb : null;
        state.pendingCeleb = null;
        if (card && which === 'a') {
          advance(cmds, typeof card.stayMin === 'number' ? card.stayMin : P('stayMin'));
          if (state.celebritiesMet.indexOf(who) < 0) state.celebritiesMet.push(who);
          var eff = CEL.parseEffect(card.effect);
          CEL.applyEffect(card, guests, MAXH).forEach(function (g) {
            pat(g); // 名人加心 → 换算成耐心
            if (eff.satisfyTag && g.tag === eff.satisfyTag) { mem[g.id].satisfiedAt = state.lastPlaceId; bubble(cmds, g, txt(g, 'resolved'), 0, 'good'); }
            if (eff.hearts) cmds.push({ type: 'float', id: g.id, text: '耐心 +' + Math.round(PER) + '% ' + (card.name || ''), color: '#5ee6a8' }); // 名人奖励看得见
          });
          hud(cmds);
        }
        log('celebrity_choice', { who: who, which: which });
        return cmds;
      }
      var it = state.pendingInterrupt;
      if (!it || it.id !== interruptId) return cmds;
      state.pendingInterrupt = null;
      var m = meta[it.id] || {};
      if (m.kind === 'lost') {
        var g = byId(m.gid);
        if (which === 'a' && g && g.status === 'lost') {
          advance(cmds, P('goBackMin'));
          setP(g, Math.max(pat(g), PER)); g.lostAt = null;
          ret(cmds, g);
          bubble(cmds, g, '……你回来找我了。', 0, 'good');
        }
      } else if (m.kind === 'conflict') {
        var fav = byId(which === 'a' ? m.a : m.b), other = byId(which === 'a' ? m.b : m.a);
        if (fav) {
          setP(fav, pat(fav) + PER);
          bubble(cmds, fav, '这还差不多。', 0, 'good');
          cmds.push({ type: 'float', id: fav.id, text: '耐心 +' + Math.round(PER) + '%', color: '#5ee6a8' });
          if (fav.tag === 'walk') { mem[fav.id].walkAcc = 0; fav.meter = 0; }
          // 兑现按钮承诺：「歇一下」真的歇一次（推进停站时长，评审 L18 / PRD-v2）
          if (m.pair === 'walk_rush' && which === 'a') advance(cmds, P('stayMin'));
        }
        if (other) drop(cmds, other, '偏心！');
      }
      log('choice', { id: interruptId, which: which });
      hud(cmds);
      flushQueue(cmds);
      return cmds;
    }

    // 10/24 提示词 8：谢公问答——答对游客欢呼、耐心小涨；答错叹口气、耐心小扣；不扣分、不终结、不花时间
    var CHEER = ['好！', '厉害啊', '这都知道？', '有文化！', '鼓掌👏'], SIGH = ['唉……', '差一点', '下次吧', '哎呀'];
    function quizResult(right) {
      var cmds = [];
      if (state.ended) return cmds;
      var up = P('quizRightPatience') || 8, down = P('quizWrongPatience') || 4;
      guests.filter(active).forEach(function (g, i) {
        if (g.tag === 'any') return;
        var before = pat(g);
        setP(g, before + (right ? up : -down));
        if (g.hearts === 0) { onZero(cmds, g); return; }
        cmds.push({ type: 'patience', id: g.id, value: g.patience, delta: g.patience - before, quiet: true });
        if (i < 3) bubble(cmds, g, (right ? CHEER : SIGH)[Math.floor(rng() * (right ? CHEER : SIGH).length)], 1600, right ? 'good' : 'info');
        cmds.push({ type: 'float', id: g.id, text: '耐心 ' + (right ? '+' + up : '−' + down) + '%', color: right ? '#5ee6a8' : '#ffb3a8' });
      });
      log('quiz', { right: !!right });
      hud(cmds);
      return cmds;
    }

    function goHome() { var cmds = []; endRun(cmds, 'home'); return cmds; }

    function finish(o) {
      o = o || {};
      if (!state.ended) endRun([], 'home');
      var wentBack = !!o.wentBack;
      if (wentBack) {
        state.clockMin += P('goBackMin');
        guests.forEach(function (g) { if (g.status !== 'home') { g.status = 'home'; g.lostAt = null; } });
      }
      guests.forEach(function (g) {
        if (g.status === 'follow') g.status = 'home';
        else if (g.status === 'sit' || g.status === 'runaway') { g.status = 'lost'; g.lostAt = g.lostAt || posOf(mem[g.id].runawayTo || state.lastPlaceId); }
      });
      // 到家才能判定的满足：都行哥 / 催催催少停站 / 怕挤挤没掉过心
      guests.forEach(function (g) {
        if (g.status !== 'home') return;
        if (g.tag === 'any') g.satisfied = true;
        if (g.tag === 'rush' && state.stops <= P('rushFreeStops')) g.satisfied = true;
        if (g.tag === 'crowd' && !mem[g.id].lostHeart) g.satisfied = true;
        g.remembered = !!g.satisfied;
      });
      var extra = state.celebritiesMet.map(function (w) { var c = CEL && CEL.find(w, content); return c && c.knowledgeId; });
      var home = guests.filter(function (g) { return g.status === 'home'; }).length;
      // 带队积分（PRD-v4 §2.1）：过了午夜才回家 → 末尾扣 late 分（ EVAL #14：result.score === state.score − 10 ）
      if (state.clockMin > P('dayMin')) {
        var late = params.score && params.score.late != null ? params.score.late : -10;
        state.score += late;
        state.scoreLog.push({ placeId: null, name: '过了午夜才回来', at: Math.round(state.clockMin), total: late, lines: [] });
      }
      // 时间规划分（10/25 裁决）：出发前排得越满（≤1024）加分越多；超时已在上面扣
      if (state.dayTotal != null) {
        var tsc = params.score || {};
        var tTotal = state.dayTotal, tPts = 0, tName = '';
        if (tTotal <= P('dayMin')) {
          if (tTotal >= (tsc.timeFullAt != null ? tsc.timeFullAt : 900)) { tPts = tsc.timeFull != null ? tsc.timeFull : 30; tName = '排满一天（' + tTotal + ' 分钟）'; }
          else if (tTotal >= (tsc.timeMidAt != null ? tsc.timeMidAt : 600)) { tPts = tsc.timeMid != null ? tsc.timeMid : 15; tName = '半天行程（' + tTotal + ' 分钟）'; }
          else { tPts = 0; tName = '行程偏短（' + tTotal + ' 分钟）'; }
        } else { tPts = 0; tName = '超时行程（' + tTotal + ' 分钟）'; }
        if (tPts) {
          state.score += tPts;
          state.scoreLog.push({ placeId: null, name: tName, at: Math.round(state.clockMin), total: tPts, lines: [] });
        }
      }
      var celebrityLine = CEL && CEL.resultLine(content, { name: opts.playerName || '', min: Math.round(state.clockMin), back: home, total: guests.length }, rng);
      var result = S.build(state, { wentBack: wentBack, params: params, content: content, places: places, rng: rng, extraKnowledge: extra, seat: o.seat,
        stayPlaces: state.stayed,
        score: state.score, scoreLog: state.scoreLog.slice(),
        timeline: (state.timeline || []).slice(), // 10/25：一天行程（到达/离开时刻）
        celebrityLine: celebrityLine, placeNameOf: function (g) { return nameOf(mem[g.id].satisfiedAt || state.lastPlaceId); } });
      state.result = result;
      log('finish', { title: result.title });
      return result;
    }

    return {
      state: state, params: P, planRoute: planRoute, tick: tick, onArrive: onArrive, onTapGuest: onTapGuest, calm: onTapGuest, quizResult: quizResult,
      onEnterZone: onEnterZone, onLeaveZone: onLeaveZone, choose: choose, goHome: goHome, finish: finish,
      setWeather: setWeather,
      regionOf: function (place) { return regionOf(place); }, // 10/25：进商圈聚焦用
      // 商圈间移动（PRD-v4 §3）：车程/步行整段推进时钟；坐下/跑开超时同步计时；到午夜收工
      addTime: function (min) {
        var cmds = [];
        if (state.ended) return cmds;
        min = Math.max(0, Number(min) || 0);
        advance(cmds, min);
        guests.forEach(function (g) {
          var m = mem[g.id];
          if (g.status === 'sit' && m.sitAt != null && state.clockMin - m.sitAt >= P('sitToLostMin')) lose(cmds, g, state.lastPlaceId, true);
          else if (g.status === 'runaway' && m.runawayAt != null && state.clockMin - m.runawayAt >= P('runawayToLostMin')) lose(cmds, g, m.runawayTo, true);
        });
        if (state.clockMin >= P('dayMin')) { state.clockMin = P('dayMin'); endRun(cmds, 'midnight'); }
        log('travel', { min: min });
        return cmds;
      },
      // 积分补加（10/25）：进店 AI 反馈到货后的加分；每局限 8 次，防刷
      addBonus: function (pts, reason) {
        var cmds = [];
        if (state.ended) return cmds;
        if ((state.bonusCount || 0) >= 8) return cmds;
        state.bonusCount = (state.bonusCount || 0) + 1;
        // codex #10：直接累计（旧 addScore 已随探索型积分移除）
        state.score += pts;
        state.scoreLog.push({ placeId: null, name: reason || '游客感想', at: Math.round(state.clockMin), total: pts, lines: [] });
        cmds.push({ type: 'score', total: state.score, delta: pts, reason: reason });
        hud(cmds);
        return cmds;
      },
    };
  }

  root.WZ.rules = { DEFAULTS: DEFAULTS, stage: stage, createRun: createRun, CONFLICT_UI: CONFLICT_UI };
})(typeof window !== 'undefined' ? window : globalThis);
