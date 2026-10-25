/* tests/score.test.js —— PRD-v4 §2.1 带队积分单测（EVAL-v4 §1，16 项）
 * 运行：node tests/score.test.js   （退出码 0 = 全过）
 * 方式：global.window = global 后 require content + rules，直接调 run.onArrive 看 stay.score。
 */
'use strict';
const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'content', 'params.js'));
require(path.join(__dirname, '..', 'content', 'places.js'));
require(path.join(__dirname, '..', 'content', 'guests.js'));
require(path.join(__dirname, '..', 'content', 'knowledge.js'));
require(path.join(__dirname, '..', 'content', 'celebrities.js'));
require(path.join(__dirname, '..', 'content', 'ending.js'));
require(path.join(__dirname, '..', 'content', 'promos.js'));
require(path.join(__dirname, '..', 'content', 'ratings.js'));
require(path.join(__dirname, '..', 'web', 'guests.js'));
require(path.join(__dirname, '..', 'web', 'scoring.js'));
require(path.join(__dirname, '..', 'web', 'celebrity.js'));
require(path.join(__dirname, '..', 'web', 'rules.js'));
const WZ = global.window.WZ;
const C = WZ.content;
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n   ' + (e && e.message)); }
}

// 构造一局：固定 tags；places 用真实 content
function mk(tags, opts) {
  opts = opts || {};
  return WZ.rules.createRun({
    troubles: tags.map(t => ({ tag: t, text: '测试困扰' })),
    difficulty: 'easy', params: JSON.parse(JSON.stringify(C.params)), places: C.places, content: C,
    seed: opts.seed || 7, tags: tags,
  });
}
// 把某个 tag 的游客换成有评分数据的场景：直接改 place 的 real.info（测试数据，不入库）
function withRating(placeId, rating, reviews) {
  const p = C.places.find(x => x.id === placeId);
  p.real = p.real || {}; p.real.info = Object.assign({}, p.real.info, { rating, ratingSrc: '大众点评', reviews: reviews || 0, src: ['大众点评'] });
  return p;
}
function stayScore(run, placeId) {
  const cmds = run.onArrive(placeId);
  const stay = cmds.find(c => c.type === 'stay');
  return stay && stay.score;
}
function linesFor(score, guestId) { return (score.lines || []).find(l => l.guestId === guestId) || { pts: null, say: '' }; }

const P = C.params.score;
const FOOD = 'f_changren';   // 长人馄饨铺：food，hours 07:00-18:30，stay 25
const SHOPP = 'p_wuweihe';   // 五味和：shop
const TOILET = 'toilet2';    // 厕所：stay 0 → 但「进厕所」用 onArrive 不停站……改用 f_fuqi（24h food）做 miss

test('P-0 前置：内容与 params 就绪', () => {
  assert.ok(C.places.find(p => p.id === FOOD), 'f_changren 存在');
  assert.ok(typeof P.match === 'number', 'params.score.match 存在');
});

// #1 food 游客进 food 店（无评分）第一次 → +12，台词含「值了」
test('1 需求匹配首店 +12', () => {
  const place = C.places.find(p => p.id === FOOD);
  delete place.real;
  const run = mk(['food', 'any']);
  const sc = stayScore(run, FOOD);
  const ln = linesFor(sc, run.state.guests[0].id);
  assert.strictEqual(ln.pts, P.match);
  assert.ok(ln.say.includes('值了'));
});

// #2 同一游客第二次进 food 店 → +5
test('2 需求匹配再次 +5', () => {
  const place = C.places.find(p => p.id === FOOD);
  delete place.real;
  const run = mk(['food', 'any']);
  stayScore(run, FOOD);
  const other = 'f_fuqi'; // 夫妻鱼圆：food 24h
  const sc2 = stayScore(run, other);
  const ln = linesFor(sc2, run.state.guests[0].id);
  assert.strictEqual(ln.pts, P.matchAgain);
});

// #3 food 游客进评分 4.9 的 food 店 → 12 + 3，台词含「4.9」
test('3 高分店额外 +3', () => {
  const place = withRating('f_fuqi', 4.9, 100);
  const run = mk(['food', 'any']);
  const sc = stayScore(run, 'f_fuqi');
  const ln = linesFor(sc, run.state.guests[0].id);
  assert.strictEqual(ln.pts, P.match + P.hiRating);
  assert.ok(ln.say.includes('4.9'));
});

// #4 food 游客进评分 3.5 的 food 店 → 12 − 4，台词含「将就」
test('4 低分店额外 −4', () => {
  withRating('f_fuqi', 3.5, 10);
  const run = mk(['food', 'any']);
  const sc = stayScore(run, 'f_fuqi');
  const ln = linesFor(sc, run.state.guests[0].id);
  assert.strictEqual(ln.pts, P.match + P.loRating);
  assert.ok(ln.say.includes('将就'));
});

// #5 shop 游客进 food 店 → −2
test('5 需求不匹配 −2', () => {
  delete C.places.find(p => p.id === 'f_fuqi').real;
  const run = mk(['shop', 'any']);
  const sc = stayScore(run, 'f_fuqi');
  const ln = linesFor(sc, run.state.guests[0].id);
  assert.strictEqual(ln.pts, P.miss);
});

// #6 非 toilet 游客进厕所 → 0「顺便上个厕所」（厕所 stayMin=0 不停站 → 用 choose 不可行；直接构造 stop 验证：临时把厕所 stayMin 抬高）
test('6 路过厕所 0 分', () => {
  const t = C.places.find(p => p.id === 'toilet2');
  const keep = t.stayMin; t.stayMin = 15;
  const run = mk(['food', 'any']);
  const sc = stayScore(run, 'toilet2');
  t.stayMin = keep;
  const ln = linesFor(sc, run.state.guests[0].id);
  assert.strictEqual(ln.pts, 0);
  assert.ok(ln.say.includes('厕所'));
});

// #7 rush 游客进停留 75 分钟的店 → −6，台词含「75」
test('7 催催催长停 −6', () => {
  const run = mk(['rush', 'any']);
  const place = C.places.find(p => p.id === FOOD);
  delete place.real;
  const keep = place.stayMin; place.stayMin = 75;
  const sc = stayScore(run, FOOD);
  place.stayMin = keep;
  const ln = linesFor(sc, run.state.guests[0].id);
  assert.strictEqual(ln.pts, P.rushLong);
  assert.ok(ln.say.includes('75'));
});

// #8 rush 游客进停留 25 分钟的店 → +3
test('8 催催催短停 +3', () => {
  const run = mk(['rush', 'any']);
  const sc = stayScore(run, FOOD);
  const ln = linesFor(sc, run.state.guests[0].id);
  assert.strictEqual(ln.pts, P.rushOk);
});

// #9 crowd 游客进评价数 4843 的店 → −8，台词含「4843」或「排队」
test('9 怕挤挤人多店 −8', () => {
  withRating('f_fuqi', 4.0, 4843);
  const run = mk(['crowd', 'any']);
  const sc = stayScore(run, 'f_fuqi');
  const ln = linesFor(sc, run.state.guests[0].id);
  assert.strictEqual(ln.pts, P.crowdBad);
  assert.ok(ln.say.includes('4843') || ln.say.includes('排队'));
});

// #10 crowd 游客进 lane 类型 → +10
test('10 怕挤挤进小巷 +10', () => {
  const run = mk(['crowd', 'any']);
  const lane = C.places.find(p => (p.types || []).includes('lane'));
  const keep = lane.stayMin; lane.stayMin = 30;
  const sc = stayScore(run, lane.id);
  lane.stayMin = keep;
  const ln = linesFor(sc, run.state.guests[0].id);
  assert.strictEqual(ln.pts, P.crowdLane);
});

// #11 any 游客进有评分的店 → +2，台词含评分数字
test('11 都行哥 +2', () => {
  withRating('f_fuqi', 4.6, 50);
  const run = mk(['any', 'food']);
  const sc = stayScore(run, 'f_fuqi');
  const ln = linesFor(sc, run.state.guests[0].id);
  assert.strictEqual(ln.pts, P.any);
  assert.ok(ln.say.includes('4.6'));
});

// #12 全队 5 人进一家店：total = 各人 pts 之和；state.score 累加；scoreLog.length === 1
test('12 全队汇总与累加', () => {
  delete C.places.find(p => p.id === 'f_fuqi').real;
  const run = mk(['food', 'shop', 'bored', 'walk', 'any']);
  const before = run.state.score;
  const cmds = run.onArrive('f_fuqi');
  const stay = cmds.find(c => c.type === 'stay');
  const sum = stay.score.lines.reduce((a, l) => a + l.pts, 0);
  assert.strictEqual(stay.score.total, sum);
  assert.strictEqual(run.state.score, before + sum);
  assert.strictEqual(run.state.scoreLog.length, 1);
});

// #13 到店关门：不产生 stay.score，state.score 不变
test('13 扑空不计分', () => {
  const place = C.places.find(p => p.id === 'f_fuqi');
  const keep = place.hours; place.hours = '03:00-04:00'; // 现在必关门
  const run = mk(['food', 'any']);
  const before = run.state.score;
  const cmds = run.onArrive('f_fuqi');
  place.hours = keep;
  assert.ok(!cmds.find(c => c.type === 'stay' && c.score));
  assert.strictEqual(run.state.score, before);
});

// #14 finish 时 clockMin > 1024 → result.score === state.score − 10（late 已在 finish 里扣）
test('14 超时回家扣 10', () => {
  const run = mk(['food', 'any']);
  run.onArrive('f_fuqi'); // +若干分
  const before = run.state.score;
  run.state.clockMin = 1100; // 超过午夜
  const result = run.finish({ wentBack: false });
  assert.strictEqual(result.overtime, true);
  assert.strictEqual(result.score, before - Math.abs(C.params.score.late));
});

// #15 正常回家：result.score === state.score；promos 只含真停过且在 promos 里的店
test('15 结算积分与物料位', () => {
  const run = mk(['food', 'any']);
  run.onArrive('f_changren'); // 在 promos 里
  run.onArrive('f_fuqi');     // 不在 promos 里
  const result = run.finish({ wentBack: false });
  assert.strictEqual(result.score, run.state.score);
  assert.ok(Array.isArray(result.promos));
  assert.deepStrictEqual(result.promos.map(p => p.placeId), ['f_changren']);
  assert.ok(result.promos[0].t.includes('示例'));
});

// #16 所有分值来自 params.score.*：把 params 改成 0 后所有 pts 为 0（防写死）
test('16 分值全部可配（防写死）', () => {
  const saved = JSON.parse(JSON.stringify(C.params.score));
  C.params.score.match = 0; C.params.score.any = 0; C.params.score.rushOk = 0;
  try {
    const run = mk(['food', 'any']); // mk 深拷贝 params → 拿到的是清零后的配置
    const place = C.places.find(p => p.id === FOOD);
    delete place.real;
    const sc = stayScore(run, FOOD);
    sc.lines.forEach(l => { if (l.pts !== 0) assert.fail('pts 应为 0，实际 ' + l.pts + '（' + l.say + '）'); });
  } finally {
    C.params.score = saved;
  }
});

console.log('\n' + passed + ' 项通过，' + failed + ' 项失败');
process.exit(failed ? 1 : 0);
