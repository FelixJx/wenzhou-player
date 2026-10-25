/* web/advisor.js —— 插旗推荐（10/24 #4）+ 动态引导语（10/24 #9）
 * 纯函数，无 DOM：node 下可测（tests/advisor.test.js）。
 *   flags(state, places, opts) → { placeId: { level:'red'|'orange'|'yellow', score, reasons:[字符串] } }
 *   guide(state, places, ctx) → { next:'下一站：… · 步行 N 分钟' | '', tip:'一句话指引' }
 * 红旗 = 队伍现在最想去；按队伍里每个人「还没被满足的需求 × 耐心紧迫度」+ 真实数据（营业时间/评分/人多时段）实时算。
 */
(function (root) {
  'use strict';
  root.WZ = root.WZ || {};

  // 需求 → 能满足它的地点类型（与 rules.js NEED_TYPE 一致；没劲儿=看点/戏台）
  var NEED = { walk: ['rest'], food: ['food'], shop: ['shop'], bored: ['sight', 'stage'], crowd: ['lane'], toilet: ['toilet'] };
  var NEED_WORD = { walk: '能坐下歇脚', food: '有本地小吃', shop: '能买手信', bored: '有得看', crowd: '人少的小巷', toilet: '有厕所' };
  var TAG_ICON = { walk: '🦶', food: '🍚', crowd: '😵', shop: '🛍️', bored: '🥱', rush: '⏰', toilet: '🚻', any: '😎' };
  var TYPE_WORD = { rest: '歇脚点', food: '小吃', shop: '手信店', sight: '看点', stage: '戏台', lane: '小巷', toilet: '厕所' };

  function toM(x) { var hm = String(x).trim().split(':'); return (+hm[0]) * 60 + (+hm[1] || 0); }
  // 与 rules.isOpenAt 同口径：clockMin=0 是 07:00；hours "06:00-20:00,17:00-02:00"；closedDow 1=周一
  function isOpenAt(place, clockMin, dow) {
    if (!place || !place.hours) return true;
    dow = dow || (new Date().getDay() || 7);
    if (place.closedDow && place.closedDow.indexOf(dow) >= 0) return false;
    var t = 420 + (clockMin || 0);
    return String(place.hours).split(',').some(function (seg) {
      var ab = seg.split('-'); if (ab.length !== 2) return true;
      var a = toM(ab[0]), b = toM(ab[1]); if (isNaN(a) || isNaN(b)) return true;
      if (b <= a) b += 1440;
      return (t >= a && t < b) || (t + 1440 >= a && t + 1440 < b) || (t - 1440 >= a && t - 1440 < b);
    });
  }
  function has(p, t) { return (p.types || []).indexOf(t) >= 0; }
  function inWindow(p, clock) { var w = p.crowdWindow; return !!(w && clock >= w[0] && clock <= w[1]); }
  function gname(g) { return g.name || g.tag; }

  function flags(state, places, opts) {
    opts = opts || {};
    state = state || {};
    var clock = state.clockMin || 0, visited = state.visited || [];
    var guests = (state.guests || []).filter(function (g) { return g.status !== 'lost' && g.status !== 'home'; });
    var scored = [];
    (places || []).forEach(function (p) {
      if (has(p, 'home') || visited.indexOf(p.id) >= 0) return;
      var score = 0, reasons = [];
      guests.forEach(function (g) {
        var types = NEED[g.tag];
        if (!types || g.satisfied) return;
        if (!types.some(function (t) { return has(p, t); })) return;
        var pt = g.patience != null ? g.patience : 100;
        var w = 1 + (100 - pt) / 50; // 越不耐烦越急：100% → 1，0% → 3
        score += w;
        reasons.push((TAG_ICON[g.tag] || '') + ' ' + gname(g) + '要' + NEED_WORD[g.tag] + (pt < 50 ? '（耐心 ' + Math.round(pt) + '%，急）' : ''));
      });
      guests.forEach(function (g) {
        if (g.tag === 'crowd' && !g.satisfied && inWindow(p, clock)) { score -= 1.5; reasons.push('😵 ' + gname(g) + '怕挤：这会儿人多'); }
        if (g.tag === 'rush' && (p.stayMin || 0) >= 60) { score -= 0.6; reasons.push('⏰ ' + gname(g) + '嫌慢：要待 ' + p.stayMin + ' 分钟'); }
      });
      var f = (p.real && p.real.info) || {};
      var pr = WZ.content && WZ.content.ratings && WZ.content.ratings.lookup ? WZ.content.ratings.lookup(p.name) : null;
      var rating = f.rating || f.ctrip || (pr ? (pr.dp || pr.am) : 0) || 0;
      var ratingSrcN = f.ratingSrc || (pr && pr.dp ? '大众点评' : pr && pr.am ? '高德' : '点评');
      var ratingN = pr && pr.dpn ? pr.dpn : f.reviews;
      if (rating >= 4.5) { score += 0.5; reasons.push('⭐ ' + ratingSrcN + ' ' + Number(rating).toFixed(1) + (ratingN ? '（' + ratingN + '评）' : '')); }
      if (!isOpenAt(p, clock, opts.dow)) { score -= 3; reasons.push('🔒 现在没开门（营业 ' + p.hours + '）'); }
      // 同一种需求的人多 → 合并成一句「队里 N 个馋的」，权重已按人头累加
      var cnt = {}; guests.forEach(function (g) { if (!g.satisfied && NEED[g.tag] && NEED[g.tag].some(function (t) { return has(p, t); })) cnt[g.tag] = (cnt[g.tag] || 0) + 1; });
      Object.keys(cnt).forEach(function (tg) { if (cnt[tg] >= 2) reasons.unshift((TAG_ICON[tg] || '') + ' 队里 ' + cnt[tg] + ' 个' + ({ food: '馋的', walk: '走不动的', shop: '想买的', bored: '嫌没劲的', crowd: '怕挤的', toilet: '找厕所的' }[tg] || '') ); });
      var walkers = guests.filter(function (g) { return g.tag === 'walk' && !g.satisfied; }).length;
      if (opts.walkMin) {
        var wm = opts.walkMin(p.id);
        if (walkers && wm > 15) { score -= 0.5 * walkers; reasons.push('🦶 走不动的有 ' + walkers + ' 个，步行 ' + wm + ' 分钟偏远'); }
        else if (wm > 40) { score -= 0.4; reasons.push('🚶 步行 ' + wm + ' 分钟，有点远'); }
        else if (wm > 0 && wm <= 8 && score > 0) { score += 0.2; reasons.push('🚶 就在附近，步行 ' + wm + ' 分钟'); } // 顺路的优先插旗
      }
      var rating = (p.real && p.real.info) ? (p.real.info.rating || p.real.info.ctrip || 0) : 0;
      // 10/25 需求：高分店即使队伍没提需求也值得插旗（大众点评 ≥4.0）
      if (score > 0.3 || rating >= 4.0) scored.push({ id: p.id, score: score, reasons: reasons, rating: rating });
    });
    scored.sort(function (a, b) { return (b.score + b.rating) - (a.score + a.rating); });
    var out = {};
    scored.forEach(function (s, i) {
      // 旗色按大众点评分数定档（10/25 需求）：≥4.5 红 · ≥4.0 橙 · ≥3.5 黄；无评分的 POI 按队伍需求排（红 3 · 橙 5 · 黄 8）
      var level;
      if (s.rating >= 4.5) level = 'red';
      else if (s.rating >= 4.0) level = 'orange';
      else if (s.rating >= 3.5) level = 'yellow';
      else level = i < 3 ? 'red' : i < 8 ? 'orange' : i < 16 ? 'yellow' : null;
      if (level) out[s.id] = { level: level, score: Math.round(s.score * 100) / 100, reasons: s.reasons };
    });
    return out;
  }

  // ctx: { walkMin(placeId) 从玩家当前位置, phase:'plan'|'walk', planCount, routeMin, routeMax }
  function guide(state, places, ctx) {
    ctx = ctx || {};
    state = state || {};
    var byId = {}; (places || []).forEach(function (p) { byId[p.id] = p; });
    var clock = state.clockMin || 0, total = ctx.totalMin || 1024;
    var guests = state.guests || [];
    if (ctx.phase === 'plan') {
      var n = ctx.planCount || 0, min = ctx.routeMin || 3, max = ctx.routeMax || 5;
      if (n === 0) return { next: '', tip: '先看红旗：那是队伍现在最想去的地方。点店铺加进手册，长按可以拖。' };
      if (n < min) return { next: '', tip: '再排 ' + (min - n) + ' 站就能出发。看看谁的需求还没照顾到。' };
      var unmet = guests.filter(function (g) { return NEED[g.tag] && !(ctx.planTypes || []).some(function (t) { return NEED[g.tag].indexOf(t) >= 0; }); });
      if (unmet.length) return { next: '', tip: (TAG_ICON[unmet[0].tag] || '') + ' ' + gname(unmet[0]) + '的需求还没排进去：找个' + NEED[unmet[0].tag].map(function (t) { return TYPE_WORD[t]; }).join('/') + '。' };
      return { next: '', tip: n >= max ? '手册排满了。确认时间够用，就出发吧。' : '路线能走了。也可以再加一站（最多 ' + max + ' 站）。' };
    }
    var route = state.route || [], visited = state.visited || [];
    var nextId = route.filter(function (id) { return visited.indexOf(id) < 0; })[0];
    var next = '';
    if (nextId && byId[nextId]) next = '下一站：' + byId[nextId].name + (ctx.walkMin ? ' · 步行 ' + ctx.walkMin(nextId) + ' 分钟' : '');
    else next = '路线走完了';
    function nearestOf(types) {
      var best = null, bm = Infinity;
      (places || []).forEach(function (p) {
        if (!types.some(function (t) { return has(p, t); }) || has(p, 'home')) return;
        if (!isOpenAt(p, clock, ctx.dow)) return;
        var m = ctx.walkMin ? ctx.walkMin(p.id) : 0;
        if (m < bm) { bm = m; best = p; }
      });
      return best ? { p: best, m: bm } : null;
    }
    var tip = '';
    var gone = guests.filter(function (g) { return g.status === 'runaway'; })[0];
    var sat = guests.filter(function (g) { return g.status === 'sit'; })[0];
    var low = guests.filter(function (g) { return g.status === 'follow' && !g.satisfied && g.patience != null && g.patience > 0 && g.patience < 50 && g.tag !== 'any'; })
      .sort(function (a, b) { return a.patience - b.patience; })[0];
    if (gone) tip = '🏃 ' + gname(gone) + '自己跑开了——跟过去把他接回来。';
    else if (sat) tip = '🪑 ' + gname(sat) + '坐下不走了——点他哄一哄，或带他去歇脚点。';
    else if (low) {
      var near = NEED[low.tag] ? nearestOf(NEED[low.tag]) : null;
      tip = (TAG_ICON[low.tag] || '') + ' ' + gname(low) + '耐心只剩 ' + Math.round(low.patience) + '%' +
        (near ? '：最近的' + (TYPE_WORD[NEED[low.tag][0]] || '') + '是' + near.p.name + '（步行 ' + near.m + ' 分钟）' : '') + '，或者点他哄一哄。';
    } else if (clock >= total - 140) {
      var home = (places || []).filter(function (p) { return has(p, 'home'); })[0];
      tip = '🌙 快到午夜了——留够时间回' + (home ? home.name : '游客中心') + (home && ctx.walkMin ? '（步行 ' + ctx.walkMin(home.id) + ' 分钟）' : '') + '。';
    } else if (!nextId) tip = '在手册里再加一站，或者回游客中心收工。';
    else {
      var voiced = guests.filter(function (g) { return g.status === 'follow' && !g.satisfied && (g.msgs || []).some(function (m) { return m.tone === 'bad'; }); })[0];
      if (voiced && NEED[voiced.tag]) tip = (TAG_ICON[voiced.tag] || '') + ' ' + gname(voiced) + '开口了：想去' + NEED[voiced.tag].map(function (t) { return TYPE_WORD[t]; }).join('/') + '。红旗标着顺路的。';
      else tip = '头顶的小图标是每个人的需求；点人能看他说过的话。';
    }
    return { next: next, tip: tip };
  }

  // 提示词 7：店铺小卡「队里谁会喜欢 / 谁会嫌」
  function opinions(p, state, opts) {
    opts = opts || {};
    var clock = (state && state.clockMin) || 0, likes = [], dislikes = [];
    ((state && state.guests) || []).forEach(function (g) {
      if (g.status === 'lost' || g.status === 'home') return;
      var nm = (TAG_ICON[g.tag] || '') + gname(g);
      if (NEED[g.tag] && NEED[g.tag].some(function (t) { return has(p, t); })) likes.push(nm + (g.satisfied ? '（已经满足过）' : '：正好' + NEED_WORD[g.tag]));
      if (g.tag === 'crowd' && inWindow(p, clock)) dislikes.push(nm + '：这会儿人多');
      if (g.tag === 'rush' && (p.stayMin || 0) >= 60) dislikes.push(nm + '：要待 ' + p.stayMin + ' 分钟，嫌慢');
      if (g.tag === 'walk' && opts.walkMin && opts.walkMin(p.id) > 20) dislikes.push(nm + '：要走 ' + opts.walkMin(p.id) + ' 分钟');
      if (g.tag === 'bored' && !has(p, 'sight') && !has(p, 'stage') && (p.stayMin || 0) >= 40) dislikes.push(nm + '：怕没意思');
    });
    if (!isOpenAt(p, clock, opts.dow)) dislikes.push('🔒 现在没开门（营业 ' + p.hours + '）');
    return { likes: likes, dislikes: dislikes };
  }
  // 一句话推荐理由（长按旗子）
  function flagSentence(f) {
    if (!f) return '';
    var nm = { red: '红旗', orange: '橙旗', yellow: '黄旗' }[f.level] || '';
    var rs = (f.reasons || []).filter(function (r) { return r.indexOf('🔒') < 0; }).slice(0, 2).map(function (r) { return r.replace(/^\S+\s/, ''); });
    return nm + '：' + (rs.join(' + ') || '顺路');
  }

  root.WZ.advisor = { flags: flags, guide: guide, isOpenAt: isOpenAt, NEED: NEED, opinions: opinions, flagSentence: flagSentence };
})(typeof window !== 'undefined' ? window : globalThis);
