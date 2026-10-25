// guests.js —— 建团与游客文案（W2 拥有）。纯逻辑，无 DOM；随机全部走 seed LCG。
(function (root) {
  root.WZ = root.WZ || {};

  var TAGS = ['walk', 'food', 'crowd', 'shop', 'bored', 'rush', 'toilet', 'any'];
  var NAMES = {
    walk: '走不动', food: '吃不惯', crowd: '怕挤挤', shop: '买买买',
    bored: '没劲儿', rush: '催催催', toilet: '憋不住', any: '都行哥',
  };
  // 冲突对：同时要闹时触发「打架」中断
  var CONFLICTS = [['walk', 'rush'], ['crowd', 'shop']];

  // 内置默认文案。content/guests.js 若提供同名字段则覆盖（见 text()）。
  var TEXT = {
    walk: {
      crisis: '不走了，就这儿坐。', line: '一天走了两万步', sign: '腿软了，走不动了……', resolved: '歇过那一下，腿就缓过来了。',
      unresolved: '下次能不能少走点路。', previewHappy: '有地方歇脚就行', previewWorry: '这么远，没地方坐？', previewNeutral: '走着看吧',
    },
    food: {
      crisis: '我先进去吃了啊！', line: '太清淡吃不惯', sign: '肚子咕咕叫了……', resolved: '那碗糯米饭，我记住了。',
      unresolved: '一天没吃上一口热的。', previewHappy: '有小吃街，放心了', previewWorry: '中午吃什么啊？', previewNeutral: '看看有没有吃的',
    },
    crowd: {
      crisis: '我被冲散了！', line: '排队两个半小时', sign: '人好多，透不过气……', resolved: '那条小巷真安静，谢谢你。',
      unresolved: '全是人，我都没看清路。', previewHappy: '走小巷，好', previewWorry: '五马街中午人挤人……', previewNeutral: '别往人多的地方去',
    },
    shop: {
      crisis: '这店我不出去了。', line: '临走没买手信', sign: '那家店……再看一眼。', resolved: '手信买到了，回去有交代。',
      unresolved: '什么都没买，白来了。', previewHappy: '有手信店！', previewWorry: '没地方买东西？', previewNeutral: '顺路买点什么',
    },
    bored: {
      crisis: '我跟那个团走了啊。', line: '逛半天没记住啥', sign: '好无聊，东张西望……', resolved: '原来温州还有这个，有意思。',
      unresolved: '转了一圈，啥也没记住。', previewHappy: '看点不重样，行', previewWorry: '这路线没劲儿……', previewNeutral: '有没有好玩的',
    },
    rush: {
      crisis: '我先走了，你们随意！', line: '一直在赶车', sign: '还要停？快走快走！', resolved: '今天没磨蹭，痛快。',
      unresolved: '停太多站了，急死。', previewHappy: '站少，好', previewWorry: '停这么多站？', previewNeutral: '别磨蹭就行',
    },
    toilet: {
      crisis: '不行了，我先找地方！', line: '找不到厕所', sign: '哪儿有厕所……', resolved: '厕所标记我认得了。',
      unresolved: '一路憋着，太难受了。', previewHappy: '路上有厕所', previewWorry: '三站没厕所？', previewNeutral: '厕所在哪儿',
    },
    any: {
      crisis: '我还在呢。', line: '随便，都行', sign: '', resolved: '都说了随便。但你安排得挺好。',
      unresolved: '都说了随便。', previewHappy: '都行', previewWorry: '都行', previewNeutral: '都行',
    },
  };
  // 哄：第 1 次 / 第 2 次 / 无效
  var CALM = ['好啦好啦，走吧。', '你刚才不也让我等了半天。', '……'];
  var LOST_LINE = '他没跟上来。';

  function makeRng(seed) {
    var s = (Number(seed) || 1) % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 48271) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)] || arr[0]; }
  function shuffle(rng, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // 按码点截断，≤max 字
  function clip(text, max) {
    var chars = Array.from(String(text == null ? '' : text).trim());
    return chars.length > max ? chars.slice(0, max).join('') : chars.join('');
  }

  function conflictOf(tag) {
    for (var i = 0; i < CONFLICTS.length; i++) {
      if (CONFLICTS[i][0] === tag) return CONFLICTS[i][1];
      if (CONFLICTS[i][1] === tag) return CONFLICTS[i][0];
    }
    return null;
  }
  function isConflictPair(a, b) { return conflictOf(a) === b; }
  function hasConflict(tags) {
    for (var i = 0; i < tags.length; i++) if (tags.indexOf(conflictOf(tags[i])) >= 0) return true;
    return false;
  }

  // 抽 n 个不同的非 any 标签，保证含一对冲突
  function pickTags(n, rng) {
    var pool = TAGS.filter(function (t) { return t !== 'any'; });
    n = Math.max(2, Math.min(n, pool.length));
    var pair = pick(rng, CONFLICTS);
    var rest = shuffle(rng, pool.filter(function (t) { return pair.indexOf(t) < 0; }));
    return shuffle(rng, pair.concat(rest.slice(0, n - 2)));
  }

  // 找 content/guests.js 里某标签的条目：支持 {walk:{...}} 或 [{tag:'walk',...}]
  function entry(content, tag) {
    var g = content && content.guests;
    if (!g) return null;
    if (Array.isArray(g)) {
      for (var i = 0; i < g.length; i++) if (g[i] && g[i].tag === tag) return g[i];
      return null;
    }
    return g[tag] || null;
  }
  // content/guests.js 的键名别名：我的 key → 内容里可能用的 key
  var KEY_ALIAS = { line: ['line', 'intro'], sign: ['sign', 'warn'], crisis: ['crisis'] };
  function fill(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? vars[k] : ''; });
  }
  // 文案：content 覆盖 → 默认。key: line|sign|crisis|resolved|unresolved|previewHappy|previewWorry|previewNeutral
  // vars 用于替换 {place} {name} 占位
  function text(content, tag, key, rng, vars) {
    var e = entry(content, tag);
    var lines = e && (e.lines || e);
    var v = null;
    (KEY_ALIAS[key] || [key]).forEach(function (k) { if (v == null && lines && lines[k] != null) v = lines[k]; });
    if (v == null && lines && lines.preview && key.indexOf('preview') === 0) {
      v = lines.preview[key.slice(7).toLowerCase()];
    }
    if (Array.isArray(v)) v = v.length ? pick(rng || Math.random, v) : null;
    if (typeof v !== 'string' || !v) v = (TEXT[tag] || TEXT.any)[key] || '';
    return fill(v, vars);
  }
  // 哄的台词：idx 0 第一次 / 1 第二次 / ≥2 无效；第二次优先取 content.guests[tag].lines.calm2
  function calmText(content, idx, rng, tag) {
    var e = tag ? entry(content, tag) : null;
    var lines = e && (e.lines || e);
    if (idx === 1 && lines && typeof lines.calm2 === 'string' && lines.calm2) return lines.calm2;
    var g = content && content.guests;
    var c = g && !Array.isArray(g) && g.calm;
    if (Array.isArray(c) && typeof c[idx] === 'string') return c[idx];
    return CALM[Math.min(idx, CALM.length - 1)];
  }
  function displayName(content, tag) {
    var e = entry(content, tag);
    return (e && e.name) || NAMES[tag] || tag;
  }

  // 从真人困扰池里给某标签挑一句：troubles → content.seedTroubles → 默认
  function pickLine(tag, troubles, content, rng, max) {
    var pools = [troubles || [], (content && content.seedTroubles) || []];
    for (var p = 0; p < pools.length; p++) {
      var cands = pools[p].filter(function (t) { return t && t.tag === tag && t.text && !t._used; });
      if (cands.length) {
        var c = pick(rng, cands);
        c._used = true;
        return clip(c.text, max);
      }
    }
    return clip(text(content, tag, 'line', rng), max);
  }

  // 建团。opts: { troubles, difficulty, params, content, rng|seed, tags? }
  function buildTeam(opts) {
    var params = opts.params || {};
    var content = opts.content || {};
    var rng = opts.rng || makeRng(opts.seed || 1);
    var sizes = params.teamSize || { easy: 5, normal: 6, hard: 7 };
    var size = sizes[opts.difficulty] || sizes.easy || 5;
    var tags = opts.tags && opts.tags.length ? opts.tags.slice() : null;
    if (!tags) {
      tags = pickTags(size - 1, rng);
      tags.splice(Math.floor(rng() * (tags.length + 1)), 0, 'any');  // 都行哥每局必有
    }
    var troubles = (opts.troubles || []).map(function (t) { return { tag: t.tag, text: t.text }; });
    var maxLine = params.lineMax || 20; // 10/24：一句话 20 字
    return tags.map(function (tag, i) {
      return {
        id: 'g' + (i + 1), tag: tag, name: displayName(content, tag),
        line: (opts.lines && opts.lines[i]) ? clip(String(opts.lines[i]), 20) : pickLine(tag, troubles, content, rng, maxLine), // 10/24：接团页可自定义每人一句
        hearts: params.hearts || 3, status: 'follow', calmLeft: params.calmTimes == null ? 2 : params.calmTimes,
        remembered: false, meter: 0, pos: null, lostAt: null, satisfied: false,
      };
    });
  }

  // 「此时此地」取句（PRD-v3 P1）：按地点类型从 content.placeReactions 池取一句；特定 tag 覆盖通用池
  function placeReaction(content, tag, placeType) {
    var pr = content && content.placeReactions;
    if (!pr || !placeType || !pr[placeType]) return null;
    var pool = pr[placeType];
    var arr = (pool[tag] && pool[tag].length) ? pool[tag] : pool.any;
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  root.WZ.guests = {
    TAGS: TAGS, NAMES: NAMES, CONFLICTS: CONFLICTS, TEXT: TEXT, CALM: CALM, LOST_LINE: LOST_LINE,
    makeRng: makeRng, pick: pick, shuffle: shuffle, clip: clip, fill: fill,
    conflictOf: conflictOf, isConflictPair: isConflictPair, hasConflict: hasConflict, pickTags: pickTags,
    text: text, calmText: calmText, displayName: displayName, buildTeam: buildTeam, placeReaction: placeReaction,
  };
})(typeof window !== 'undefined' ? window : globalThis);
