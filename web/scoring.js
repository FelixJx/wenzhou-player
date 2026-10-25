// scoring.js —— 结算：带回/记住/称号/台词/知识（W2 拥有）。纯函数，输入 state 输出 result。
(function (root) {
  root.WZ = root.WZ || {};

  var TITLES = { local: '本地通', kind: '贴心向导', rush: '赶路人', lost: '丢三落四', other: '温州玩家' };

  // 称号：本地通(全带回且全记住) / 贴心向导(记住≥3) / 赶路人(全带回且记住≤1) / 丢三落四(丢≥2) / 其它
  // ct = content.ending.resultTitles（可选）；缺 fast 键时 rush 回退 fast（W5 键名，评审 L7）
  function title(stats, params, ct) {
    params = params || {};
    ct = ct || {};
    var kindMin = params.titleKindMin || 3;
    var rushMax = params.titleRushMax == null ? 1 : params.titleRushMax;
    var lostMin = params.titleLostMin || 2;
    var pick = function (key) {
      if (ct[key] != null) return ct[key];
      if (key === 'rush' && ct.fast != null) return ct.fast;
      return TITLES[key] != null ? TITLES[key] : TITLES.other;
    };
    var all = stats.broughtBack === stats.total;
    if (all && stats.remembered === stats.total) return pick('local');
    if (stats.remembered >= kindMin) return pick('kind');
    if (all && stats.remembered <= rushMax) return pick('rush');
    if (stats.lost >= lostMin) return pick('lost');
    return ct.default != null ? ct.default : TITLES.other;
  }

  // 每位游客结算一句。vars: {place} 等占位；line 为他揣着的那句真人困扰（供后端映射）
  function guestLine(g, content, rng, vars) {
    var G = root.WZ.guests;
    var base = { id: g.id, name: g.name, tag: g.tag, line: g.line };
    if (g.status !== 'home') return Object.assign(base, { text: G.LOST_LINE, star: false });
    if (g.satisfied) {
      // 都行哥固定取第 1 条（PRD 指定句「都说了随便。但你安排得挺好。」，评审 L5）
      var useRng = g.tag === 'any' ? function () { return 0; } : rng;
      return Object.assign(base, { text: G.text(content, g.tag, 'resolved', useRng, vars), star: true });
    }
    return Object.assign(base, { text: G.text(content, g.tag, 'unresolved', rng, vars), star: false });
  }

  // 停站过的地点（opts.stayPlaces）优先；缺省退回 visited。knowledgeId 去重取 n；不足用 extra（名人知识点）补
  function knowledge(visited, places, extra, n, stayPlaces) {
    var out = [];
    function add(id) { if (id && out.indexOf(id) < 0 && out.length < n) out.push(id); }
    function addPlace(pid) {
      var p = (places || []).filter(function (x) { return x.id === pid; })[0];
      if (p) add(p.knowledgeId);
    }
    (stayPlaces || []).forEach(addPlace); // 只取真停过的（L9）；空 = 这局走得太急，不拿路过地点凑数
    (extra || []).forEach(add);
    return out;
  }

  // v1.0 体验评审：每位游客一张卡（★/评语/加分/扣分/问题）。全部由本局真实发生的事件 + 地点真实数据算出，不编造
  var NEED = { food: 'food', shop: 'shop', bored: 'sight', walk: 'rest', crowd: 'lane', toilet: 'toilet' };
  var NEED_NAME = { food: '吃上一口地道温州小吃', shop: '买到温州手信', bored: '看到真正好看的地方', walk: '中途好好歇一脚', crowd: '躲开人多的地方', toilet: '路上有厕所', rush: '少停几站', any: '跟着走' };
  function reviews(state, places) {
    places = places || [];
    var byId = {}; places.forEach(function (p) { byId[p.id] = p; });
    var ev = state.events || [];
    var stayed = []; ev.forEach(function (e) { if (e.type === 'arrive' && e.stop && byId[e.placeId] && stayed.indexOf(e.placeId) < 0) stayed.push(e.placeId); });
    var closed = ev.filter(function (e) { return e.type === 'fact_closed'; }).map(function (e) { return byId[e.placeId]; }).filter(Boolean);
    var queued = ev.filter(function (e) { return e.type === 'fact_queue'; }).map(function (e) { return { p: byId[e.placeId], min: e.min }; }).filter(function (x) { return x.p; });
    function nm(p) { return (p.name || '').replace(/[（(].*?[)）]/g, ''); }
    function rating(p) { var f = (p.real && p.real.info) || {}; return f.rating || f.ctrip || f.meituan || 0; }
    return (state.guests || []).map(function (g) {
      var need = NEED[g.tag];
      var hit = stayed.map(function (id) { return byId[id]; }).filter(function (p) { return need && (p.types || []).indexOf(need) >= 0; });
      var best = hit.slice().sort(function (a, b) { return rating(b) - rating(a); })[0];
      var miss = closed.filter(function (p) { return need && (p.types || []).indexOf(need) >= 0; })[0] || closed[0];
      var score = 3;
      if (g.satisfied) score += 1.5; else if (g.tag !== 'any') score -= 0.5;
      score += ((g.patience != null ? g.patience / 100 * 3 : (g.hearts == null ? 3 : g.hearts)) - 2) * 0.5; // 耐心百分比
      if (best && rating(best) >= 4) score += 0.5;
      if (closed.length) score -= Math.min(1, 0.5 * closed.length);
      if (g.tag === 'rush' && queued.length) score -= 0.5;
      if (g.status !== 'home') score = 1;
      score = Math.max(1, Math.min(5, Math.round(score * 2) / 2));
      var pro = best ? '带我去了' + nm(best) : (stayed.length ? '去了' + nm(byId[stayed[0]]) : '');
      var con = g.status !== 'home' ? '我半路走丢了' : miss ? nm(miss) + '扑了空' : (g.tag === 'rush' && queued.length) ? nm(queued[0].p) + '排了' + queued[0].min + '分钟队' : (!g.satisfied && NEED_NAME[g.tag] && g.tag !== 'any') ? '没能' + NEED_NAME[g.tag] : '';
      var comment = g.status !== 'home' ? '走着走着就跟丢了，这趟没玩完。' : score >= 4.5 ? '这条路线是懂温州的人排的' + (con ? '，可惜' + con + '。' : '。') : score >= 3.5 ? '整体不错，' + (con ? '就是' + con + '。' : '节奏刚好。') : score >= 2.5 ? '能玩，但' + (con || '有点赶') + '。' : '这一趟有点折腾。';
      // 问题：指向一个本局没去、对口且有真实数据的地点（=下一局的钩子）
      var cand = places.filter(function (p) { return need && (p.types || []).indexOf(need) >= 0 && stayed.indexOf(p.id) < 0 && p.real && p.real.info; })
        .sort(function (a, b) { return rating(b) - rating(a); })[0];
      var question = cand ? (need === 'food' ? '下次能带我去' + nm(cand) + '吗？' : need === 'shop' ? nm(cand) + '的手信值得买吗？' : need === 'sight' ? nm(cand) + '值得专门去一趟吗？' : '下次走' + nm(cand) + '吧？') : '下次还找你带路，行吗？';
      return { id: g.id, name: g.name, tag: g.tag, score: score, comment: comment, pro: pro, con: con, question: question };
    });
  }

  // 生成 result（§2.5）。state 已由 rules.finish 处理过 wentBack。
  function build(state, opts) {
    opts = opts || {};
    var params = opts.params || {};
    var guests = state.guests;
    var home = guests.filter(function (g) { return g.status === 'home'; });
    var lost = guests.filter(function (g) { return g.status !== 'home'; }).map(function (g) { return g.id; });
    var remembered = home.filter(function (g) { return g.satisfied; });
    home.forEach(function (g) { g.remembered = !!g.satisfied; });
    var stats = { broughtBack: home.length, total: guests.length, remembered: remembered.length, lost: lost.length };
    var dayMin = params.dayMin || 1024;
    return {
      broughtBack: stats.broughtBack, total: stats.total, remembered: stats.remembered,
      arriveMin: state.clockMin, overtime: state.clockMin > dayMin, lost: lost,
      guestLines: guests.map(function (g) {
        return guestLine(g, opts.content, opts.rng, { place: opts.placeNameOf ? opts.placeNameOf(g) : '' });
      }),
      knowledge: knowledge(state.visited, opts.places, opts.extraKnowledge, params.knowledgeCount || 3, opts.stayPlaces),
      title: title(stats, params, opts.content && opts.content.ending ? opts.content.ending.resultTitles : null),
      celebrities: (state.celebritiesMet || []).slice(),
      wentBack: !!opts.wentBack, difficulty: state.difficulty || 'easy', seat: opts.seat || '',
      stops: state.stops || 0,
      // 给后端 /api/mine 映射：每位游客揣的困扰原句 + 是否没带回
      troubles: guests.map(function (g) { return { tag: g.tag, text: g.line, lost: g.status !== 'home' }; }),
      celebrityLine: opts.celebrityLine || null,   // 结算页名人一句（苏步青），可为 null
      reviews: reviews(state, opts.places),           // v1.0 体验评审卡
      score: typeof opts.score === 'number' ? opts.score : null, // v4 带队积分（数值）
      scoreLog: opts.scoreLog || null,                // v4 每店 ±分明细
      promos: (function () {                          // v4 商家物料位：真停过 ∩ content.promos
        var pr = opts.content && opts.content.promos;
        if (!pr) return [];
        return (opts.stayPlaces || []).filter(function (id) { return pr[id]; }).map(function (id) { return Object.assign({ placeId: id, name: (opts.places || []).filter(function (p) { return p.id === id; })[0] }, pr[id]); });
      })(),
      timeline: opts.timeline || null,                // v2 一天行程（10/25）：[{ placeId, name, region, arrive, leave }]
    };
  }

  root.WZ.scoring = { TITLES: TITLES, title: title, reviews: reviews, guestLine: guestLine, knowledge: knowledge, build: build };
})(typeof window !== 'undefined' ? window : globalThis);
