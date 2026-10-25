// tests/advisor.test.js —— 10/24 升级：插旗推荐 / 引导语 / 抽题 / 气泡心声。运行：node tests/advisor.test.js
'use strict';
const assert = require('assert');
require('../web/guests.js'); require('../web/scoring.js'); require('../web/celebrity.js'); require('../web/rules.js');
require('../web/advisor.js'); require('../web/quiz.js');
const WZ = globalThis.WZ;
let n = 0, fail = 0;
function test(name, fn) { n++; try { fn(); console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); } }

const places = [
  { id: 'center', name: '游客中心', types: ['home'], stayMin: 0 },
  { id: 'rest1', name: '茶座', types: ['rest'], stayMin: 30, hours: '09:00-21:00' },
  { id: 'food1', name: '馄饨', types: ['food'], stayMin: 25, hours: '07:00-18:30', real: { info: { rating: 4.6, ratingSrc: '大众点评', reviews: 4843 } } },
  { id: 'food2', name: '夜宵', types: ['food'], stayMin: 25, hours: '18:00-02:00' },
  { id: 'shop1', name: '手信', types: ['shop'], stayMin: 20 },
  { id: 'sight1', name: '江心屿', types: ['sight'], stayMin: 120, crowdWindow: [0, 600] },
];
const g = (id, tag, extra) => Object.assign({ id, name: id, tag, status: 'follow', patience: 100, satisfied: false }, extra || {});

test('插旗：队伍需求对口的店上红旗，理由里写出是谁要什么', () => {
  const st = { clockMin: 60, visited: [], guests: [g('A', 'food'), g('B', 'walk')] };
  const f = WZ.advisor.flags(st, places, { dow: 3 });
  assert.equal(f.food1.level, 'red');
  assert.ok(f.food1.reasons.some(r => r.includes('A') && r.includes('小吃')));
  assert.ok(f.food1.reasons.some(r => r.includes('大众点评 4.6')));
  assert.ok(!f.center, '游客中心不插旗');
});
test('插旗：没开门的店被压下去（真实营业时间）', () => {
  const st = { clockMin: 60, visited: [], guests: [g('A', 'food')] }; // 08:00
  const f = WZ.advisor.flags(st, places, { dow: 3 });
  assert.ok(!f.food2 || f.food2.score < f.food1.score);
});
test('插旗：实时重算——越没耐心权重越高；满足后不再推', () => {
  const s1 = WZ.advisor.flags({ clockMin: 180, visited: [], guests: [g('A', 'walk', { patience: 100 })] }, places, { dow: 3 });
  const s2 = WZ.advisor.flags({ clockMin: 180, visited: [], guests: [g('A', 'walk', { patience: 20 })] }, places, { dow: 3 });
  assert.ok(s2.rest1.score > s1.rest1.score);
  const s3 = WZ.advisor.flags({ clockMin: 180, visited: [], guests: [g('A', 'walk', { satisfied: true })] }, places, { dow: 3 });
  assert.ok(!s3.rest1);
});
test('插旗：怕挤的人在，人多时段的景点扣分', () => {
  const a = WZ.advisor.flags({ clockMin: 60, visited: [], guests: [g('A', 'bored')] }, places, { dow: 3 });
  const b = WZ.advisor.flags({ clockMin: 60, visited: [], guests: [g('A', 'bored'), g('C', 'crowd')] }, places, { dow: 3 });
  assert.ok(!b.sight1 || b.sight1.score < a.sight1.score);
});
test('引导语：下一站 + 步行分钟；低耐心时指路到最近对口地点', () => {
  const st = { clockMin: 60, route: ['sight1', 'food1'], visited: [], guests: [g('A', 'food', { patience: 30 })] };
  const out = WZ.advisor.guide(st, places, { walkMin: id => id === 'food1' ? 6 : 12, dow: 3 });
  assert.equal(out.next, '下一站：江心屿 · 步行 12 分钟');
  assert.ok(out.tip.includes('30%') && out.tip.includes('馄饨') && out.tip.includes('6 分钟'), out.tip);
});
test('引导语：排路线阶段提示没排进去的需求', () => {
  const out = WZ.advisor.guide({ guests: [g('A', 'shop')] }, places, { phase: 'plan', planCount: 3, planTypes: ['food', 'rest'], routeMin: 3, routeMax: 5 });
  assert.ok(out.tip.includes('手信'), out.tip);
});
test('抽题：按地点优先、不重复、选项洗牌后答案仍对、出完返回 null（转彩蛋）', () => {
  const bank = [
    { id: 'a', places: ['xiechi'], kind: 'poem', q: '池塘生春草，____', options: ['园柳变鸣禽', 'x', 'y'], answer: 0, source: '《登池上楼》' },
    { id: 'b', places: ['jiangxin'], kind: 'poem', q: '云日相辉映，____', options: ['空水共澄鲜', 'x', 'y'], answer: 0, source: '《登江中孤屿》' },
    { id: 'c', places: [], kind: 'history', q: '无出处', options: ['1', '2', '3'], answer: 0 },
  ];
  const used = [];
  const q1 = WZ.quiz.pick('jiangxin', bank, used);
  assert.equal(q1.id, 'b');
  assert.equal(q1.options[q1.answer], '空水共澄鲜');
  const q2 = WZ.quiz.pick('jiangxin', bank, used);
  assert.equal(q2.id, 'a', '出过的不再出');
  const q3 = WZ.quiz.pick('jiangxin', bank, used);
  assert.strictEqual(q3, null, '一轮出完（无出处的题不出）→ 不再考，转彩蛋');
});
test('心声：每人留最近 5 条，带情绪色（满足=good，抱怨=bad）', () => {
  const run = WZ.rules.createRun({ troubles: [{ tag: 'food', text: '吃不惯' }], difficulty: 'easy',
    params: { teamSize: { easy: 1 }, hearts: 3, calmTimes: 2, foodWarnMin: 10 }, places, content: { places, zones: [] }, seed: 1 });
  const gg = run.state.guests[0];
  run.tick(20); // 到点开口
  for (let i = 0; i < 6; i++) run.calm(gg.id);
  run.onArrive('food1');
  assert.ok(gg.msgs.length <= 5);
  assert.ok(gg.msgs.some(m => m.tone === 'good'));
  assert.ok(gg.msgs.every(m => ['good', 'bad', 'info'].includes(m.tone)));
});
test('题库文件（若已生成）：每题三选一、答案在范围内、带出处、地点 id 合法', () => {
  let bank = null;
  try { require('../content/quiz.js'); bank = WZ.content && WZ.content.quiz; } catch (e) { bank = null; }
  if (!bank) return;
  require('../content/places.js');
  const ids = new Set(WZ.content.places.map(p => p.id));
  bank.forEach(q => {
    assert.equal(q.options.length, 3, q.id);
    assert.ok(q.answer >= 0 && q.answer < 3, q.id);
    assert.ok(q.source, q.id + ' 缺出处');
    (q.places || []).forEach(pid => assert.ok(ids.has(pid), q.id + ' 地点不存在 ' + pid));
    assert.equal(new Set(q.options).size, 3, q.id + ' 选项重复');
  });
  assert.equal(new Set(bank.map(q => q.id)).size, bank.length, '题目 id 重复');
});
console.log('\n' + n + ' 项，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
