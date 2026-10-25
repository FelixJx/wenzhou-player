// celebrity.js —— 名人触发与卡片（W2 拥有）。文本先模板，WZ.celebrity.provider 由 net.js 注入后走 AI。
(function (root) {
  root.WZ = root.WZ || {};

  // content/celebrities.js 缺位时的内置四人。trigger 结构与 W5 共同遵守：
  // { when:'arrive'|'start'|'result'|'weather:rain', place?:id, places?:[id], types?:[type],
  //   stageMin?:0-4, minStay?:min, requireSight?:bool, requireNoHeartLoss?:bool, alsoAt?:'result' }
  // effect: 'none' | '<tag>_satisfied' | 'all_heart'（也接受 'satisfy:<tag>' | 'hearts:+1'）
  // templates: 字符串 或 {text, isOriginal}
  var DEFAULTS = [
    {
      who: 'xie_lingyun', name: '谢灵运', title: '永嘉太守 · 山水诗鼻祖', ask: 'poem', knowledgeId: 'k_mochi_xie',
      trigger: { when: 'arrive', types: ['sight'], requireSight: true, places: ['mochi', 'pier'] }, effect: 'bored_satisfied',
      templates: [
        '{name}，今日同游{place}，赠你四句：池塘生春草，园柳变鸣禽。{route}一路，皆可入诗。',
        '山水是我在永嘉写下的。{name}，你走的{route}，也是一首诗。',
      ],
    },
    {
      who: 'wang_xizhi', name: '王羲之', title: '书圣 · 相传曾守永嘉', ask: 'play', knowledgeId: 'k_mochi',
      trigger: { when: 'arrive', place: 'mochi', minStay: 64 }, effect: 'all_heart',
      templates: [
        '墨池的水，是我洗砚洗黑的。{name}，陪我描一笔「永」字，大家歇口气。',
        '{name}，笔要慢，路也要慢。描完这一笔，队伍精神就回来了。',
      ],
    },
    {
      who: 'wen_tianxiang', name: '文天祥', title: '南宋状元 · 曾由海路至温州', ask: 'talk', knowledgeId: 'k_pier_wen',
      trigger: { when: 'arrive', place: 'pier', stageMin: 2 }, effect: 'none',
      templates: [
        '{name}，我当年也是从这片江上过来的。天快黑了，你数过你的人没有？',
        '江水往东，人往南。{name}，天黑之前，把人数点一点。',
      ],
    },
    {
      who: 'su_buqing', name: '苏步青', title: '数学家 · 温州平阳人', ask: 'none', knowledgeId: 'k_1024',
      trigger: { when: 'start', place: 'center', alsoAt: 'result' }, effect: 'none',
      templates: [
        '{name}，温州的一天有 1024 分钟，那是 2 的 10 次方。把人带回来，比算得快更要紧。',
        '2 的 10 次方是 1024。{name}，今天每一分钟都算数。',
      ],
      resultTemplates: ['{name}，你用了 {min} 分钟，带回 {back}/{total} 个人。等号两边，你自己看。'],
    },
  ];

  var stage = function (clockMin, thresholds) {
    var t = thresholds || [256, 512, 768, 972];
    for (var i = 0; i < t.length; i++) if (clockMin < t[i]) return i;
    return t.length;
  };

  function list(content) {
    var c = content && content.celebrities;
    var all = Array.isArray(c) && c.length ? c : DEFAULTS;
    return all.filter(function (x) { return x && x.enabled !== false; });
  }
  function idOf(c) { return c.who || c.id; }
  function find(who, content) {
    return list(content).filter(function (c) { return idOf(c) === who; })[0] || null;
  }
  function tplText(t) { return typeof t === 'string' ? t : (t && t.text) || ''; }

  // ctx: { when, placeId, place, stayMin, state, places, content, noHeartLoss, stageThresholds }
  function match(c, ctx) {
    var t = c.trigger || {};
    var when = t.when || 'arrive';
    if (when !== ctx.when && !(ctx.when === 'result' && t.alsoAt === 'result')) return false;
    var pid = ctx.placeId;
    if (ctx.when !== 'result') {
      if (t.place && t.place !== pid) return false;
      if (Array.isArray(t.places) && t.places.length && t.places.indexOf(pid) < 0) return false;
      var types = (ctx.place && ctx.place.types) || [];
      if (Array.isArray(t.types) && t.types.length && !t.types.some(function (x) { return types.indexOf(x) >= 0; })) return false;
      if (t.minStay != null && (ctx.stayMin || 0) < t.minStay) return false;
    }
    var st = ctx.state || {};
    if (t.stageMin != null && stage(st.clockMin || 0, ctx.stageThresholds) < t.stageMin) return false;
    if (t.requireNoHeartLoss && ctx.noHeartLoss === false) return false;
    if (t.requireSight) {
      var places = ctx.places || [];
      var hasSight = (st.route || []).some(function (id) {
        var p = places.filter(function (x) { return x.id === id; })[0];
        return p && (p.types || []).indexOf('sight') >= 0;
      });
      if (!hasSight) return false;
    }
    return true;
  }

  // 本事件全部匹配且未出场的名人（content 顺序）。rules 取第一个未出场者：
  // 谢灵运在码头出过之后，墨池就轮到王羲之（PRD-v2 F2c，确定性轮换）
  function checkAll(ctx) {
    var met = (ctx.state && ctx.state.celebritiesSeen) || [];
    var all = list(ctx.content);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (met.indexOf(idOf(all[i])) >= 0) continue;
      if (match(all[i], ctx)) out.push(all[i]);
    }
    return out;
  }
  // 返回本事件应出场的第一位尚未出场的名人（每人每局一次）
  function check(ctx) {
    return checkAll(ctx)[0] || null;
  }

  function fill(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, function (_, k) { return vars[k] == null ? '' : vars[k]; });
  }
  function pickTpl(tpls, rng) {
    var arr = (tpls || []).map(tplText).filter(Boolean);
    if (!arr.length) return '';
    return arr[Math.floor((rng || Math.random)() * arr.length)] || arr[0];
  }

  // 模板卡。vars: { name(玩家), place, route(地名顿号串), stage }
  function buildCard(c, vars, rng) {
    vars = vars || {};
    var tpl = pickTpl(c.templates, rng) || '{name}，你好。';
    var oq = c.originalQuote && c.originalQuote.text ? c.originalQuote : null;
    return {
      who: idOf(c), name: c.name, title: c.title || '', text: fill(tpl, vars), source: 'template',
      knowledgeId: c.knowledgeId || '', ask: c.ask || 'none', place: vars.place || '', stage: vars.stage || 0,
      note: c.note || 'AI 代拟，非原作', effect: c.effect || 'none', stayMin: c.stayMin,
      // text 是模板/AI 代拟，一律 isOriginal:false；只有 quote 是原作（可为 null，如苏步青）
      quote: oq ? { text: oq.text, source: oq.source || '' } : null, isOriginal: false,
      originalQuote: oq ? { text: oq.text, source: oq.source || '' } : null, playHint: c.playHint || '',
      quiz: c.quiz || null, // PRD-v3 P2：典故问答数据透传（对句/点兵）
    };
  }

  // 结算页台词（alsoAt:'result' / when:'result'）。vars: {name, min, back, total}
  function resultLine(content, vars, rng) {
    var all = list(content).filter(function (c) {
      var t = c.trigger || {};
      return (t.when === 'result' || t.alsoAt === 'result') && (c.resultTemplates || c.templates);
    });
    if (!all.length) return null;
    var c = all[0];
    var tpl = pickTpl(c.resultTemplates || c.templates, rng);
    return tpl ? { who: idOf(c), name: c.name, text: fill(tpl, vars || {}) } : null;
  }

  // 异步取 AI 文本；没有 provider 或失败 → 立刻模板。
  // provider(who, ctx, cb)：cb(err, {text, source}) 或 cb({text}) 或返回 Promise。
  function request(who, ctx, cb) {
    ctx = ctx || {};
    var c = find(who, ctx.content);
    if (!c) { cb(null); return; }
    var tpl = buildCard(c, {
      name: ctx.playerName || '', place: ctx.place || '',
      route: Array.isArray(ctx.route) ? ctx.route.join('、') : (ctx.route || ''), stage: ctx.stage || 0,
    });
    var provider = root.WZ.celebrity.provider;
    if (typeof provider !== 'function') { cb(tpl); return; }
    var done = false;
    function settle(a, b) {
      if (done) return; done = true;
      var res = (b !== undefined || a instanceof Error) ? (a ? null : b) : a;
      var text = res && (typeof res === 'string' ? res : res.text);
      if (!text) { cb(tpl); return; }
      cb(Object.assign({}, tpl, { text: String(text), source: (res && res.source) || 'ai' }));
    }
    try {
      var r = provider(who, ctx, settle);
      if (r && typeof r.then === 'function') r.then(function (v) { settle(v); }, function () { settle(new Error('x')); });
    } catch (e) { settle(e); }
  }

  // 解析 effect → { satisfyTag } | { hearts }
  function parseEffect(eff) {
    eff = String(eff || 'none');
    if (eff === 'all_heart') return { hearts: 1 };
    if (eff.indexOf('hearts:') === 0) return { hearts: parseInt(eff.slice(7), 10) || 0 };
    if (eff.indexOf('satisfy:') === 0) return { satisfyTag: eff.slice(8) };
    if (/_satisfied$/.test(eff)) return { satisfyTag: eff.replace(/_satisfied$/, '') };
    return {};
  }

  // 陪他一会儿的效果，直接改 guests；返回受影响的游客
  function applyEffect(card, guests, maxHearts) {
    var e = parseEffect(card && card.effect);
    var touched = [];
    guests.forEach(function (g) {
      if (g.status === 'lost') return;
      if (e.satisfyTag && g.tag === e.satisfyTag && !g.satisfied) { g.satisfied = true; g.remembered = true; touched.push(g); }
      if (e.hearts) { g.hearts = Math.max(0, Math.min(maxHearts || 3, g.hearts + e.hearts)); touched.push(g); }
    });
    return touched;
  }

  root.WZ.celebrity = {
    DEFAULTS: DEFAULTS, provider: null, stage: stage,
    list: list, find: find, match: match, check: check, checkAll: checkAll, buildCard: buildCard, fill: fill, resultLine: resultLine,
    request: request, parseEffect: parseEffect, applyEffect: applyEffect,
  };
})(typeof window !== 'undefined' ? window : globalThis);
