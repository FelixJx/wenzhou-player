// tests/rules.test.js —— W2 规则单测。运行：node tests/rules.test.js（退出码 0 = 全部 PASS）
// 不依赖 content/*.js：内置一份最小 mock（地点 id/types 按契约 §2.2）。
'use strict';
const assert = require('assert');
require('../web/guests.js');
require('../web/scoring.js');
require('../web/celebrity.js');
require('../web/rules.js');
const WZ = globalThis.WZ;

// ---------- mock content / params ----------
const params = {
  minPerSec: 4, stayMin: 32, restMin: 64, goBackMin: 64, hearts: 3, calmTimes: 2, dayMin: 1024,
  teamSize: { easy: 5, normal: 6, hard: 7 },
};
const places = [
  { id: 'center', name: '游客中心', types: ['home'], x: 0, y: 0, stayMin: 0, knowledgeId: 'k_center' },
  { id: 'wuma', name: '五马街', types: ['shop', 'sight'], x: 300, y: 200, stayMin: 32, knowledgeId: 'k_wuma', crowdWindow: [300, 600] },
  { id: 'mochi', name: '墨池公园', types: ['sight', 'rest'], x: 600, y: 400, knowledgeId: 'k_mochi' },
  { id: 'xianqian', name: '县前小吃街', types: ['food'], x: 200, y: 500, stayMin: 32, knowledgeId: 'k_xianqian' },
  { id: 'teastall', name: '巷子茶摊', types: ['rest', 'lane'], x: 400, y: 700, knowledgeId: 'k_teastall' },
  { id: 'pier', name: '江滨码头', types: ['sight'], x: 900, y: 1200, stayMin: 32, knowledgeId: 'k_pier' },
  { id: 'lane1', name: '小巷一', types: ['lane'], x: 150, y: 300, stayMin: 0, knowledgeId: 'k_lane1' },
  { id: 'lane2', name: '小巷二', types: ['lane'], x: 500, y: 900, stayMin: 0, knowledgeId: 'k_lane2' },
  { id: 'toilet1', name: '厕所一', types: ['toilet'], x: 100, y: 100, stayMin: 0, knowledgeId: 'k_toilet1' },
  { id: 'toilet2', name: '厕所二', types: ['toilet'], x: 650, y: 450, stayMin: 0, knowledgeId: 'k_toilet2' },
  { id: 'toilet3', name: '厕所三', types: ['toilet'], x: 880, y: 1150, stayMin: 0, knowledgeId: 'k_toilet3' },
];
const zones = [{ id: 'wuma_crowd', placeId: 'wuma', x: 250, y: 150, w: 100, h: 100 }];
const troubles = [
  { tag: 'walk', text: '一天走了两万步真的太多了' }, { tag: 'food', text: '太清淡吃不惯' },
  { tag: 'crowd', text: '排队两个半小时' }, { tag: 'shop', text: '临走没买手信' },
  { tag: 'bored', text: '逛半天没记住啥' }, { tag: 'rush', text: '一直在赶车' },
  { tag: 'toilet', text: '找不到厕所' }, { tag: 'any', text: '随便' },
];
const content = { params, places, zones, seedTroubles: troubles };

function mk(tags, extra) {
  return WZ.rules.createRun(Object.assign({ troubles, difficulty: 'easy', params, places, content, seed: 7, tags, playerName: '阿温' }, extra || {}));
}
const g = (run, tag) => run.state.guests.find(x => x.tag === tag);
const of = (cmds, type) => cmds.filter(c => c.type === type);
const has = (cmds, type) => of(cmds, type).length > 0;
// 推进若干游戏分钟，按步长 tick，收集命令
function ticks(run, min, step) {
  step = step || 4; let out = [];
  for (let t = 0; t < min; t += step) out = out.concat(run.tick(Math.min(step, min - t)));
  return out;
}

const results = [];
function test(name, fn) {
  if (fn.length === 1) { (results.__async = results.__async || []).push([name, fn]); return; } // 异步：fn(done)
  try { fn(); results.push([name, true]); console.log('PASS ' + name); }
  catch (e) { results.push([name, false, e]); console.log('FAIL ' + name + '\n   ' + (e && e.stack || e)); }
}

// ---------- 建团 ----------
test('UMD：Node 里 require 后挂在 globalThis.WZ', () => {
  assert.ok(WZ.rules && WZ.guests && WZ.scoring && WZ.celebrity);
  assert.strictEqual(typeof WZ.rules.createRun, 'function');
});

test('easy 5 人：必含 1 个 any，其余 4 个不同标签，且至少一对冲突；line ≤20 字', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const run = WZ.rules.createRun({ troubles, difficulty: 'easy', params, places, content, seed });
    const gs = run.state.guests;
    assert.strictEqual(gs.length, 5, 'seed ' + seed);
    const tags = gs.map(x => x.tag);
    assert.strictEqual(tags.filter(t => t === 'any').length, 1, 'seed ' + seed + ' any 数量');
    const others = tags.filter(t => t !== 'any');
    assert.strictEqual(new Set(others).size, 4, 'seed ' + seed + ' 标签重复');
    assert.ok(WZ.guests.hasConflict(others), 'seed ' + seed + ' 无冲突对 ' + others);
    gs.forEach(x => {
      assert.ok(Array.from(x.line).length <= 20, '台词超长（10/24 起 20 字）: ' + x.line);
      assert.strictEqual(x.hearts, 3); assert.strictEqual(x.calmLeft, 2); assert.strictEqual(x.status, 'follow');
      assert.strictEqual(x.name, WZ.guests.NAMES[x.tag]);
    });
  }
  const run = mk(['walk', 'any']);
  assert.strictEqual(g(run, 'walk').line, '一天走了两万步真的太多了'); // 10/24 起真人句保留到 20 字
});

test('normal 6 人 / hard 7 人，标签不重复', () => {
  const n = WZ.rules.createRun({ troubles, difficulty: 'normal', params, places, content, seed: 3 });
  const h = WZ.rules.createRun({ troubles, difficulty: 'hard', params, places, content, seed: 3 });
  assert.strictEqual(n.state.guests.length, 6);
  assert.strictEqual(h.state.guests.length, 7);
  assert.strictEqual(new Set(h.state.guests.map(x => x.tag)).size, 7);
});

test('困扰不足时用 seedTroubles / 默认句补齐，不报错', () => {
  const run = WZ.rules.createRun({ troubles: [], difficulty: 'easy', params, places, content: { places, zones }, seed: 5 });
  run.state.guests.forEach(x => assert.ok(x.line && Array.from(x.line).length <= 10));
});

// ---------- 时钟 / 停站 ----------
test('停站：onArrive 推进 stayMin（rest 用 restMin），发 stay+clock，记录 visited', () => {
  const run = mk(['any']);
  run.planRoute(['wuma', 'mochi']);
  let c = run.onArrive('wuma');
  assert.strictEqual(run.state.clockMin, 32);
  const stay = of(c, 'stay')[0];
  assert.deepStrictEqual({ placeId: stay.placeId, min: stay.min, knowledgeId: stay.knowledgeId }, { placeId: 'wuma', min: 32, knowledgeId: 'k_wuma' });
  assert.ok(has(c, 'clock'));
  c = run.onArrive('mochi');
  assert.strictEqual(of(c, 'stay')[0].min, 64);
  assert.strictEqual(run.state.clockMin, 96);
  assert.deepStrictEqual(run.state.visited, ['wuma', 'mochi']);
  assert.strictEqual(run.state.stops, 2);
});

test('1024 自动结束：tick 到 1024 发 end:midnight，之后不再出命令', () => {
  const run = mk(['any']);
  const c = ticks(run, 1100, 16);
  const end = of(c, 'end');
  assert.strictEqual(end.length, 1);
  assert.strictEqual(end[0].reason, 'midnight');
  assert.strictEqual(run.state.clockMin, 1024);
  assert.deepStrictEqual(run.tick(10), []);
  assert.deepStrictEqual(run.onArrive('wuma'), []);
});

test('goHome 发 end:home；到家(center)也等价于 goHome', () => {
  const a = mk(['any']); a.tick(4);
  assert.strictEqual(of(a.goHome(), 'end')[0].reason, 'home');
  const b = mk(['any']);
  assert.deepStrictEqual(b.onArrive('center'), []); // 开局站在起点不算回家
  b.tick(4);
  assert.strictEqual(of(b.onArrive('center'), 'end')[0].reason, 'home');
});

// ---------- 7 种标签 ----------
test('走不动：连续走路冒汗→掉心→心 0 坐下；哄一下归队；到歇脚点满足', () => {
  const run = mk(['walk', 'any']);
  const w = g(run, 'walk');
  let c = ticks(run, 100);
  assert.ok(of(c, 'bubble').some(b => b.id === w.id), '75% 时应冒泡征兆');
  assert.strictEqual(w.hearts, 3);
  c = ticks(run, 28);
  assert.strictEqual(w.hearts, 2, '128 分钟掉一心');
  ticks(run, 256);
  assert.strictEqual(w.hearts, 0);
  assert.strictEqual(w.status, 'sit');
  c = run.onTapGuest(w.id);
  assert.ok(has(c, 'return'));
  assert.strictEqual(w.status, 'follow');
  assert.strictEqual(w.hearts, 1);
  c = run.onArrive('teastall');
  assert.strictEqual(w.satisfied, true);
  assert.ok(of(c, 'bubble').some(b => b.id === w.id && b.text === WZ.guests.TEXT.walk.resolved));
  const sitCmd = of(ticks(mk(['walk', 'any']), 400), 'sit');
  assert.strictEqual(sitCmd.length, 1, '应恰好发一次 sit');
});

test('走不动：坐下 64 分钟没人管 → lost + 掉队中断', () => {
  const run = mk(['walk', 'any']);
  const w = g(run, 'walk');
  ticks(run, 384);
  assert.strictEqual(w.status, 'sit');
  const c = ticks(run, 64);
  assert.strictEqual(w.status, 'lost');
  const it = of(c, 'interrupt')[0];
  assert.strictEqual(it.id, 'lost_' + w.id);
  assert.strictEqual(it.title, '走不动 没跟上来');
  assert.ok(it.a.label.indexOf('64') >= 0 && it.b.label === '继续走');
});

test('吃不惯：13:00 前只冒泡；之后每 64 分钟掉心；心 0 跑去最近小吃店；到店归队并满足', () => {
  const run = mk(['food', 'any']);
  const f = g(run, 'food');
  let c = ticks(run, 356);
  assert.strictEqual(f.hearts, 3);
  assert.ok(of(c, 'bubble').some(b => b.id === f.id), '13:00 前应有肚子冒泡');
  ticks(run, 68);
  assert.strictEqual(f.hearts, 2);
  ticks(run, 128);
  assert.strictEqual(f.hearts, 0);
  assert.strictEqual(f.status, 'runaway');
  c = run.onArrive('xianqian');
  assert.ok(has(c, 'return'));
  assert.strictEqual(f.status, 'follow');
  assert.strictEqual(f.satisfied, true);
  // 早吃上就不掉心
  const ok = mk(['food', 'any']); ok.onArrive('xianqian'); ticks(ok, 600);
  assert.strictEqual(g(ok, 'food').hearts, 3);
});

test('怕挤挤：人潮区窗口内每 48 分钟掉心，心 0 走丢 → 掉队中断；选 a 回去领 +64 归队', () => {
  const run = mk(['crowd', 'any']);
  const cr = g(run, 'crowd');
  ticks(run, 300);
  let c = run.onEnterZone('wuma_crowd');
  assert.ok(of(c, 'bubble').some(b => b.id === cr.id));
  ticks(run, 96);
  assert.strictEqual(cr.hearts, 1);
  run.onLeaveZone('wuma_crowd'); ticks(run, 100);
  assert.strictEqual(cr.hearts, 1, '离开人潮区不再掉');
  run.onEnterZone('wuma_crowd');
  c = ticks(run, 48);
  assert.strictEqual(cr.status, 'lost');
  assert.ok(has(c, 'lost'));
  const it = of(c, 'interrupt')[0];
  assert.strictEqual(it.id, 'lost_' + cr.id);
  const before = run.state.clockMin;
  c = run.choose(it.id, 'a');
  assert.strictEqual(run.state.clockMin, before + 64);
  assert.strictEqual(cr.status, 'follow');
  assert.ok(has(c, 'return'));
  assert.strictEqual(run.state.pendingInterrupt, null);
  // 窗口外进区不掉心
  const early = mk(['crowd', 'any']); early.onEnterZone('wuma_crowd'); ticks(early, 200);
  assert.strictEqual(g(early, 'crowd').hearts, 3);
  // 走小巷满足
  const lane = mk(['crowd', 'any']); lane.onArrive('lane1');
  assert.strictEqual(g(lane, 'crowd').satisfied, true);
});

test('买买买：到手信店满足；没买到就回家 → 留在店门口 lost（结尾丢人）', () => {
  const ok = mk(['shop', 'any']); ok.onArrive('wuma');
  assert.strictEqual(g(ok, 'shop').satisfied, true);
  const run = mk(['shop', 'any']);
  const s = g(run, 'shop');
  run.onArrive('mochi');
  const c = ticks(run, 520);
  assert.ok(of(c, 'bubble').some(b => b.id === s.id), '下午应盯着橱窗冒泡');
  assert.strictEqual(s.hearts, 3, '买买买不掉心');
  const e = run.goHome();
  assert.strictEqual(s.status, 'lost');
  assert.ok(has(e, 'lost') && has(e, 'end'));
  assert.deepStrictEqual(s.lostAt, { x: 300, y: 200 }); // 五马街门口
  assert.ok(!has(e, 'interrupt'), '结尾丢人由 ending 页处理，不发中断');
});

test('没劲儿：两站没看点掉心，心 0 跑去最近看点；到看点且两站不重样 → 满足', () => {
  const run = mk(['bored', 'any']);
  const b = g(run, 'bored');
  run.onArrive('xianqian');
  assert.strictEqual(b.hearts, 3, '第一站宽限');
  run.onArrive('teastall');
  assert.strictEqual(b.hearts, 2);
  run.onArrive('xianqian'); run.onArrive('teastall');
  assert.strictEqual(b.hearts, 0);
  assert.strictEqual(b.status, 'runaway');
  const c = run.onArrive('mochi');
  assert.ok(has(c, 'return'));
  assert.strictEqual(b.satisfied, true);
  // 看点先行 + 不重样 → 第二站即满足
  const ok = mk(['bored', 'any']); ok.onArrive('pier'); ok.onArrive('xianqian');
  assert.strictEqual(g(ok, 'bored').satisfied, true);
  assert.strictEqual(g(ok, 'bored').hearts, 3);
});

test('催催催：第 4 站起每站掉心；心低时冒泡并发 hud、speedMul 提速；少停站到家 → 满足', () => {
  const run = mk(['rush', 'any']);
  const r = g(run, 'rush');
  run.onArrive('wuma'); run.onArrive('xianqian'); run.onArrive('pier');
  assert.strictEqual(r.hearts, 3);
  run.onArrive('mochi');
  assert.strictEqual(r.hearts, 2);
  const c = run.onArrive('teastall');
  assert.strictEqual(r.hearts, 1);
  assert.ok(has(c, 'hud'));
  assert.ok(of(c, 'bubble').some(x => x.id === r.id));
  assert.ok(run.state.speedMul > 1);
  run.onArrive('wuma');
  assert.strictEqual(r.hearts, 0);
  assert.strictEqual(r.status, 'follow', '催催催不脱队');
  const ok = mk(['rush', 'any']); ok.onArrive('wuma'); ok.onArrive('xianqian'); ok.goHome();
  const res = ok.finish({ wentBack: false });
  assert.ok(res.guestLines.find(l => l.name === '催催催').star);
});

test('憋不住：3 站没厕所转圈掉心，第 4 站跑向最近厕所；经过厕所即满足', () => {
  const run = mk(['toilet', 'any']);
  const t = g(run, 'toilet');
  run.onArrive('wuma'); run.onArrive('xianqian');
  assert.strictEqual(t.hearts, 3);
  let c = run.onArrive('pier');
  assert.strictEqual(t.hearts, 2);
  assert.ok(of(c, 'bubble').some(x => x.id === t.id && x.text.indexOf('转圈') >= 0));
  c = run.onArrive('mochi');
  assert.strictEqual(t.status, 'runaway');
  assert.strictEqual(of(c, 'runaway')[0].placeId, 'toilet2'); // 离墨池最近
  c = run.onArrive('toilet2');
  assert.ok(has(c, 'return'));
  assert.strictEqual(t.satisfied, true);
  assert.ok(!has(c, 'stay'), '厕所 stayMin=0 不算停站');
  const ok = mk(['toilet', 'any']); ok.onArrive('wuma'); ok.onArrive('toilet1'); ok.onArrive('xianqian'); ok.onArrive('pier');
  assert.strictEqual(g(ok, 'toilet').hearts, 3, '经过厕所后计数清零');
  ok.onArrive('mochi');
  assert.strictEqual(g(ok, 'toilet').hearts, 2, '厕所后第 3 站又转圈');
});

test('都行哥：全程不掉心，结算满足带 ⭐，台词固定', () => {
  const run = mk(['any']);
  const a = g(run, 'any');
  run.onArrive('wuma'); run.onArrive('xianqian'); run.onArrive('pier'); run.onArrive('mochi'); run.onArrive('teastall');
  ticks(run, 300); run.onEnterZone('wuma_crowd'); ticks(run, 200);
  assert.strictEqual(a.hearts, 3);
  run.goHome();
  const res = run.finish({ wentBack: false });
  const l = res.guestLines[0];
  assert.deepStrictEqual({ id: l.id, name: l.name, text: l.text, star: l.star }, { id: a.id, name: '都行哥', text: '都说了随便。但你安排得挺好。', star: true });
  assert.deepStrictEqual(res.troubles, [{ tag: 'any', text: a.line, lost: false }]);
});

// ---------- 哄 ----------
test('哄：每人 2 次，第 2 次台词「你刚才不也让我等了半天」，第 3 次无效「……」', () => {
  const run = mk(['walk', 'any']);
  const w = g(run, 'walk');
  w.hearts = 1;
  let c = run.onTapGuest(w.id);
  assert.strictEqual(w.hearts, 2); assert.strictEqual(w.calmLeft, 1);
  c = run.onTapGuest(w.id);
  assert.strictEqual(w.hearts, 3); assert.strictEqual(w.calmLeft, 0);
  assert.strictEqual(of(c, 'bubble')[0].text, '你刚才不也让我等了半天。');
  w.hearts = 1;
  c = run.onTapGuest(w.id);
  assert.strictEqual(w.hearts, 1);
  assert.strictEqual(of(c, 'bubble')[0].text, '……');
  // 心满时不超过 3
  const r2 = mk(['walk', 'any']); r2.onTapGuest(g(r2, 'walk').id);
  assert.strictEqual(g(r2, 'walk').hearts, 3);
});

// ---------- 冲突中断 ----------
test('冲突 interrupt：走不动与催催催同时心≤1 → 一次中断；选 a 一方+1 另一方-1；同对不再触发', () => {
  const run = mk(['walk', 'rush', 'any']);
  const w = g(run, 'walk'), r = g(run, 'rush');
  w.hearts = 1; r.hearts = 1;
  let c = run.tick(4);
  const it = of(c, 'interrupt');
  assert.strictEqual(it.length, 1);
  assert.strictEqual(it[0].id, 'conflict_walk_rush');
  assert.strictEqual(it[0].title, '走不动想歇，催催催想走');
  assert.deepStrictEqual([it[0].a.label, it[0].b.label], ['歇一下', '接着走']);
  assert.strictEqual(run.state.pendingInterrupt.id, it[0].id);
  c = run.choose(it[0].id, 'a');
  assert.strictEqual(w.hearts, 2);
  assert.strictEqual(r.hearts, 0);
  assert.strictEqual(run.state.pendingInterrupt, null);
  w.hearts = 1; r.hearts = 1;
  assert.ok(!has(run.tick(4), 'interrupt'), '同一对每局最多一次');
  // 另一对
  const r2 = mk(['crowd', 'shop', 'any']);
  g(r2, 'crowd').hearts = 1; g(r2, 'shop').hearts = 1;
  const it2 = of(r2.tick(4), 'interrupt')[0];
  assert.strictEqual(it2.id, 'conflict_crowd_shop');
  r2.choose(it2.id, 'b');
  assert.strictEqual(g(r2, 'shop').hearts, 2);
  assert.strictEqual(g(r2, 'crowd').hearts, 0);
  assert.strictEqual(g(r2, 'crowd').status, 'lost', '心 0 后果照常生效');
});

test('同时只挂一个 interrupt，其余排队，choose 后依次弹出', () => {
  const run = mk(['walk', 'rush', 'crowd', 'shop', 'any']);
  run.state.guests.forEach(x => { if (x.tag !== 'any') x.hearts = 1; });
  const c = run.tick(4);
  assert.strictEqual(of(c, 'interrupt').length, 1);
  const c2 = run.choose(run.state.pendingInterrupt.id, 'b');
  assert.strictEqual(of(c2, 'interrupt').length, 1);
  assert.strictEqual(of(c2, 'interrupt')[0].id, 'conflict_crowd_shop');
});

// ---------- 困难传染 ----------
test('hard 传染：有人 sit 后，相邻 hearts≤1 的人 30 分钟后也 sit；easy 不传染', () => {
  const run = WZ.rules.createRun({ troubles, difficulty: 'hard', params, places, content, seed: 1, tags: ['walk', 'food', 'any'] });
  const w = g(run, 'walk'), f = g(run, 'food');
  f.hearts = 1;
  w.hearts = 1; ticks(run, 128); // walk 掉到 0 坐下
  assert.strictEqual(w.status, 'sit');
  ticks(run, 28);
  assert.strictEqual(f.status, 'follow');
  const c = ticks(run, 8);
  assert.strictEqual(f.status, 'sit');
  assert.ok(of(c, 'sit').some(x => x.id === f.id));
  assert.strictEqual(g(run, 'any').status, 'follow', '都行哥不传染');
  const e = mk(['walk', 'food', 'any']);
  g(e, 'food').hearts = 1; g(e, 'walk').hearts = 1; ticks(e, 300);
  assert.strictEqual(g(e, 'food').status, 'follow');
});

// ---------- 结算 ----------
test('回头 +64 与 overtime：wentBack 把 lost 带回家，arriveMin+64，>1024 为超时', () => {
  const run = mk(['crowd', 'shop', 'any']);
  const cr = g(run, 'crowd');
  ticks(run, 980);
  cr.status = 'lost'; cr.lostAt = { x: 1, y: 1 };
  run.goHome(); // shop 未满足 → 也丢
  assert.strictEqual(g(run, 'shop').status, 'lost');
  const res = run.finish({ wentBack: true });
  assert.strictEqual(res.arriveMin, 980 + 64);
  assert.strictEqual(res.overtime, true);
  assert.strictEqual(res.wentBack, true);
  assert.strictEqual(res.broughtBack, 3);
  assert.deepStrictEqual(res.lost, []);
  assert.ok(!res.guestLines.find(l => l.name === '买买买').star, '带回但没化解不算记住');
  const run2 = mk(['crowd', 'any']);
  ticks(run2, 100); g(run2, 'crowd').status = 'lost'; run2.goHome();
  const res2 = run2.finish({ wentBack: false });
  assert.strictEqual(res2.arriveMin, 100);
  assert.strictEqual(res2.overtime, false);
  assert.deepStrictEqual(res2.lost, [g(run2, 'crowd').id]);
  assert.strictEqual(res2.guestLines.find(l => l.name === '怕挤挤').text, '他没跟上来。');
});

test('称号 4 种 + 兜底', () => {
  const T = WZ.scoring.title;
  assert.strictEqual(T({ broughtBack: 5, total: 5, remembered: 5, lost: 0 }, params), '本地通');
  assert.strictEqual(T({ broughtBack: 4, total: 5, remembered: 3, lost: 1 }, params), '贴心向导');
  assert.strictEqual(T({ broughtBack: 5, total: 5, remembered: 1, lost: 0 }, params), '赶路人');
  assert.strictEqual(T({ broughtBack: 3, total: 5, remembered: 2, lost: 2 }, params), '丢三落四');
  assert.strictEqual(T({ broughtBack: 4, total: 5, remembered: 2, lost: 1 }, params), '温州玩家');
  // 真跑一局拿本地通：走不动/吃不惯/买买买/憋不住 + 都行哥
  const run = mk(['walk', 'food', 'shop', 'toilet', 'any']);
  run.planRoute(['teastall', 'xianqian', 'wuma', 'toilet1']);
  run.onArrive('teastall'); run.onArrive('xianqian'); run.onArrive('toilet1'); run.onArrive('wuma');
  run.goHome();
  const res = run.finish({ wentBack: false });
  assert.strictEqual(res.title, '本地通');
  assert.strictEqual(res.remembered, 5);
  assert.strictEqual(res.broughtBack, 5);
  // 结算知识只取真停过站的地点（L9：toilet1 只路过 stayMin=0，不应出现）
  assert.deepStrictEqual(res.knowledge, ['k_teastall', 'k_xianqian', 'k_wuma']);
  assert.strictEqual(res.guestLines.filter(l => l.star).length, 5);
  assert.strictEqual(res.difficulty, 'easy');
  // 丢三落四：两人没回来
  const bad = mk(['shop', 'crowd', 'rush', 'any']);
  bad.onArrive('mochi'); bad.onArrive('pier'); bad.onArrive('xianqian'); bad.onArrive('teastall');
  g(bad, 'crowd').status = 'lost';
  bad.goHome();
  assert.strictEqual(bad.finish({ wentBack: false }).title, '丢三落四');
});

// ---------- 路线预览 ----------
test('planRoute 返回每位游客 preview（happy/worry/neutral + 短话）', () => {
  const run = mk(['walk', 'food', 'crowd', 'shop', 'bored', 'rush', 'toilet', 'any']);
  const pv = run.planRoute(['wuma', 'xianqian', 'teastall']);
  assert.strictEqual(pv.length, 8);
  const mood = tag => pv.find(p => p.guestId === g(run, tag).id).mood;
  assert.strictEqual(mood('walk'), 'happy');
  assert.strictEqual(mood('food'), 'happy');
  assert.strictEqual(mood('crowd'), 'happy');
  assert.strictEqual(mood('shop'), 'happy');
  assert.strictEqual(mood('bored'), 'happy');
  assert.strictEqual(mood('rush'), 'happy');
  assert.strictEqual(mood('toilet'), 'worry');
  assert.strictEqual(mood('any'), 'neutral');
  pv.forEach(p => assert.ok(p.text && typeof p.text === 'string'));
  const pv2 = run.planRoute(['pier', 'pier', 'pier', 'pier', 'pier']);
  const m2 = tag => pv2.find(p => p.guestId === g(run, tag).id).mood;
  assert.strictEqual(m2('walk'), 'worry'); assert.strictEqual(m2('rush'), 'worry'); assert.strictEqual(m2('bored'), 'neutral');
  assert.deepStrictEqual(run.state.route, ['pier', 'pier', 'pier', 'pier', 'pier']);
});

// ---------- 名人 ----------
test('名人：开局苏步青(start)；墨池停 64 分钟出王羲之，陪他 +32 分钟全队+1 心；每人每局一次', () => {
  const run = mk(['walk', 'any']);
  run.planRoute(['xianqian', 'mochi']);
  let c = run.tick(4);
  let cel = of(c, 'celebrity');
  assert.strictEqual(cel.length, 1);
  assert.strictEqual(cel[0].who, 'su_buqing');
  assert.strictEqual(cel[0].card.source, 'template');
  assert.ok(cel[0].card.text.indexOf('阿温') >= 0, '模板应替换 {name}');
  assert.ok(cel[0].card.text.indexOf('{') < 0);
  run.choose('celeb_su_buqing', 'b');
  assert.deepStrictEqual(run.state.celebritiesMet, []);
  assert.ok(!has(run.tick(4), 'celebrity'), '不重复出场');
  c = run.onArrive('mochi'); // 路线无 sight 以外的……route 含 mochi(sight) → 谢灵运先匹配
  cel = of(c, 'celebrity');
  assert.strictEqual(cel.length, 1);
  assert.strictEqual(cel[0].who, 'xie_lingyun');
  run.choose('celeb_xie_lingyun', 'b');
  const run2 = mk(['walk', 'any']);
  run2.planRoute(['xianqian', 'teastall']);
  run2.tick(4);
  g(run2, 'walk').hearts = 1;
  c = run2.onArrive('mochi');
  cel = of(c, 'celebrity');
  assert.strictEqual(cel[0].who, 'wang_xizhi', '路线无看点 → 谢灵运不出，王羲之出');
  const before = run2.state.clockMin;
  c = run2.choose('celeb_wang_xizhi', 'a');
  assert.strictEqual(run2.state.clockMin, before + 32);
  assert.deepStrictEqual(run2.state.celebritiesMet, ['wang_xizhi']);
  assert.strictEqual(g(run2, 'walk').hearts, 2, '歇脚满足不加心，陪王羲之全队 +1 → 2');
});

test('名人：文天祥需傍晚后(stage≥2)到码头；谢灵运让没劲儿满足；结算 celebrities 与 knowledge 带名人', () => {
  const run = mk(['bored', 'any']);
  run.planRoute(['pier']);
  run.tick(4);
  let c = run.onArrive('pier'); // clock 36，stage 0 → 谢灵运(sight) 先出
  assert.strictEqual(of(c, 'celebrity')[0].who, 'xie_lingyun');
  c = run.choose('celeb_xie_lingyun', 'a');
  assert.strictEqual(g(run, 'bored').satisfied, true);
  ticks(run, 800);
  c = run.onArrive('pier');
  assert.strictEqual(of(c, 'celebrity')[0].who, 'wen_tianxiang');
  run.choose('celeb_wen_tianxiang', 'a');
  run.goHome();
  const res = run.finish({ wentBack: false });
  assert.deepStrictEqual(res.celebrities, ['xie_lingyun', 'wen_tianxiang']);
  assert.deepStrictEqual(res.knowledge, ['k_pier', 'k_mochi_xie', 'k_pier_wen']);
});

test('WZ.celebrity.request：无 provider 立刻模板；有 provider 走回调给 source:ai；provider 出错回退模板', done => {
  const ctx = { playerName: '阿温', route: ['五马街', '墨池公园'], place: '墨池公园', stage: 1, content };
  let sync = null;
  WZ.celebrity.provider = null;
  WZ.celebrity.request('xie_lingyun', ctx, card => { sync = card; });
  assert.ok(sync && sync.source === 'template' && sync.text.indexOf('阿温') >= 0 && sync.text.indexOf('五马街、墨池公园') >= 0);
  WZ.celebrity.provider = (who, c, cb) => setTimeout(() => cb(null, { text: 'AI 四句诗', source: 'ai' }), 5);
  WZ.celebrity.request('xie_lingyun', ctx, card => {
    assert.strictEqual(card.source, 'ai'); assert.strictEqual(card.text, 'AI 四句诗'); assert.strictEqual(card.name, '谢灵运');
    assert.strictEqual(card.isOriginal, false, 'AI 文本也不是原作');
    assert.ok('quote' in card);
    WZ.celebrity.provider = (who, c, cb) => cb(new Error('timeout'));
    WZ.celebrity.request('wang_xizhi', ctx, card2 => {
      assert.strictEqual(card2.source, 'template'); assert.strictEqual(card2.who, 'wang_xizhi');
      WZ.celebrity.provider = null;
      done();
    });
  });
});

// ---------- 与 W5 真实内容集成（content/*.js 不在时跳过） ----------
const fs = require('fs'), path = require('path');
const contentDir = path.join(__dirname, '..', 'content');
const contentFiles = ['params', 'places', 'guests', 'knowledge', 'celebrities', 'seed_troubles'].map(n => path.join(contentDir, n + '.js'));
if (contentFiles.every(f => fs.existsSync(f))) {
  test('W5 真实内容：params 别名键生效、名人 who/effect/enabled、游客 {place} 台词、整局 60 seed 无异常', () => {
    contentFiles.forEach(f => require(f));
    const C = WZ.content;
    assert.ok(C.params && C.places && C.guests && C.celebrities);
    // params 别名
    const run = WZ.rules.createRun({ troubles: C.seedTroubles, difficulty: 'easy', params: C.params, places: C.places, content: C, seed: 9, tags: ['walk', 'bored', 'any'], playerName: '阿温' });
    assert.strictEqual(run.params('walkMeterMax'), C.params.walkTiredMin);
    assert.strictEqual(run.params('dayMin'), C.params.totalMin);
    assert.strictEqual(run.params('contagionMin'), C.params.infectDelayMin);
    // enabled:false 的第二批不出场
    assert.ok(WZ.celebrity.list(C).every(c => c.enabled !== false));
    run.planRoute(['mochi', 'pier']);
    let c = run.tick(4);
    assert.strictEqual(of(c, 'celebrity')[0].who, 'su_buqing');
    assert.ok(of(c, 'celebrity')[0].card.text.indexOf('{') < 0);
    run.choose('celeb_su_buqing', 'b');
    c = run.onArrive('mochi');
    assert.strictEqual(of(c, 'celebrity')[0].who, 'xie_lingyun');
    assert.ok(of(c, 'celebrity')[0].card.text.indexOf('{') < 0, '对象模板也要替换占位');
    // 名人卡：text 一律 isOriginal:false，quote 才是原作（取 content.originalQuote，苏步青为 null）
    const xc = of(c, 'celebrity')[0].card;
    assert.strictEqual(xc.isOriginal, false);
    assert.deepStrictEqual(xc.quote, { text: '池塘生春草，园柳变鸣禽。', source: '《登池上楼》' });
    assert.strictEqual(WZ.celebrity.buildCard(WZ.celebrity.find('su_buqing', C), { name: 'x' }).quote, null);
    c = run.choose('celeb_xie_lingyun', 'a');
    assert.strictEqual(g(run, 'bored').satisfied, true, 'effect: bored_satisfied');
    assert.ok(g(run, 'walk').satisfied, '墨池 rest → 走不动满足');
    run.goHome();
    const res = run.finish({ wentBack: false });
    const wl = res.guestLines.find(l => l.tag === 'walk');
    assert.ok(wl.star && wl.text.indexOf('{place}') < 0, 'resolved 的 {place} 应替换: ' + wl.text);
    assert.ok(res.celebrityLine && res.celebrityLine.who === 'su_buqing' && res.celebrityLine.text.indexOf(String(res.arriveMin)) >= 0, '苏步青结算台词带分钟数');
    assert.ok(res.knowledge.length <= 3);
    // 整局随机模拟
    const ids = C.places.map(p => p.id);
    for (let seed = 1; seed <= 60; seed++) {
      const d = ['easy', 'normal', 'hard'][seed % 3];
      const r = WZ.rules.createRun({ troubles: C.seedTroubles, difficulty: d, params: C.params, places: C.places, content: C, seed });
      const rr = WZ.guests.makeRng(seed * 17);
      r.planRoute(['wuma', 'mochi', 'xianqian', 'pier', 'teastall'].slice(0, 3 + Math.floor(rr() * 3)));
      let guard = 0;
      while (!r.state.ended && guard++ < 300) {
        const x = rr(); let cm;
        if (x < 0.6) cm = r.tick(4 + Math.floor(rr() * 24));
        else if (x < 0.85) cm = r.onArrive(ids[Math.floor(rr() * ids.length)]);
        else if (x < 0.92) cm = r.onTapGuest('g' + (1 + Math.floor(rr() * 7)));
        else if (x < 0.96) cm = r.onEnterZone('wuma_crowd');
        else cm = r.onLeaveZone('wuma_crowd');
        cm.forEach(k => {
          assert.ok(typeof k.type === 'string');
          if (k.type === 'bubble') assert.ok(k.text && k.text.indexOf('{') < 0, '气泡残留占位: ' + k.text);
          if (k.type === 'interrupt') { assert.ok(k.a.label && k.b.label); if (rr() < 0.8) r.choose(k.id, rr() < 0.5 ? 'a' : 'b'); }
          if (k.type === 'celebrity') r.choose('celeb_' + k.who, rr() < 0.5 ? 'a' : 'b');
        });
      }
      const rs = r.finish({ wentBack: rr() < 0.5 });
      assert.strictEqual(rs.broughtBack + rs.lost.length, rs.total, 'seed ' + seed);
      rs.guestLines.forEach(l => assert.ok(l.text.indexOf('{') < 0));
      assert.ok(['本地通', '贴心向导', '赶路人', '丢三落四', '温州玩家'].indexOf(rs.title) >= 0);
    }
  });
}

// ---------- 收尾 ----------
let pending = 0;
function finishReport() {
  const failed = results.filter(r => !r[1]);
  console.log('\n' + results.length + ' 项，' + failed.length + ' 失败');
  process.exit(failed.length ? 1 : 0);
}
// 异步测试适配：test(name, fn(done))
function runAsync() {
  const asyncTests = results.__async || [];
  if (!asyncTests.length) return finishReport();
  let i = 0;
  const next = () => {
    if (i >= asyncTests.length) return finishReport();
    const [name, fn] = asyncTests[i++];
    const timer = setTimeout(() => { results.push([name, false, new Error('超时')]); console.log('FAIL ' + name + ' 超时'); next(); }, 2000);
    try {
      fn(() => { clearTimeout(timer); results.push([name, true]); console.log('PASS ' + name); next(); });
    } catch (e) { clearTimeout(timer); results.push([name, false, e]); console.log('FAIL ' + name + '\n   ' + e.stack); next(); }
  };
  next();
}
runAsync();
