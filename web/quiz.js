/* web/quiz.js —— 谢灵运问答抽题（10/24 #8）：三选一、按地点优先、跨局不重复（localStorage 记已出过的题）
 * 题库在 content/quiz.js（每题带出处）；缺库时用名人卡自带的那一题。 */
(function (root) {
  'use strict';
  root.WZ = root.WZ || {};
  var KEY = 'wz_quiz_used';
  function load() { try { return JSON.parse(root.localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function save(a) { try { root.localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* ignore */ } }
  // 洗牌选项，返回 { hint, options, answer, explain, source, id }
  function shuffle(q, rng) {
    var idx = q.options.map(function (_, i) { return i; });
    for (var i = idx.length - 1; i > 0; i--) { var j = Math.floor((rng || Math.random)() * (i + 1)); var t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    return { id: q.id, q: q.q, kind: q.kind, hint: '谢公考你：' + q.q, options: idx.map(function (i) { return q.options[i]; }), answer: idx.indexOf(q.answer),
      explain: q.explain || '', source: q.source || '', win: '对。' };
  }
  // placeId：当前地点；used：已出题 id（不传则读 localStorage）
  function pick(placeId, bank, used, rng) {
    bank = (bank || (root.WZ.content && root.WZ.content.quiz) || []).filter(function (q) { return q && q.options && q.options.length === 3 && q.source; });
    if (!bank.length) return null;
    var persist = !used;
    used = used || load();
    var fresh = bank.filter(function (q) { return used.indexOf(q.id) < 0; });
    if (!fresh.length) return null; // 一轮出完：谢公只说风景，不再考（提示词 8）
    // 先出团队题库（core），对应景点优先：池上楼→第 1 题，江心屿→第 2/3/10 题；无关景点随机抽剩余
    var core = fresh.filter(function (q) { return q.core; });
    var src = core.length ? core : fresh;
    var here = src.filter(function (q) { return (q.places || []).indexOf(placeId) >= 0; });
    here.sort(function (a, b) { return (a.core || 99) - (b.core || 99); });
    // 无关景点：先抽没有绑定景点的题，把池上楼/江心屿的题留给它们自己的景点
    var loose = src.filter(function (q) { return !(q.places || []).length; });
    var pool = here.length ? [here[0]] : (loose.length ? loose : src);
    var q = pool[Math.floor((rng || Math.random)() * pool.length)];
    used.push(q.id);
    if (persist) save(used);
    return shuffle(q, rng);
  }
  root.WZ.quiz = { pick: pick, KEY: KEY };
})(typeof window !== 'undefined' ? window : globalThis);
