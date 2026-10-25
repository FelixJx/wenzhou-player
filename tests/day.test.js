/* tests/day.test.js —— PRD-v4 §3 多商圈排一天（EVAL-v4 §5，6 项）
 * 运行：node tests/day.test.js
 */
'use strict';
const path = require('path');
const assert = require('assert');
global.window = global;
require(path.join(__dirname, '..', 'content', 'params.js'));
require(path.join(__dirname, '..', 'content', 'districts.js'));
require(path.join(__dirname, '..', 'content', 'places.js'));
require(path.join(__dirname, '..', 'content', 'guests.js'));
require(path.join(__dirname, '..', 'content', 'knowledge.js'));
require(path.join(__dirname, '..', 'content', 'celebrities.js'));
require(path.join(__dirname, '..', 'content', 'ending.js'));
require(path.join(__dirname, '..', 'web', 'guests.js'));
require(path.join(__dirname, '..', 'web', 'scoring.js'));
require(path.join(__dirname, '..', 'web', 'celebrity.js'));
require(path.join(__dirname, '..', 'web', 'day.js'));
require(path.join(__dirname, '..', 'web', 'rules.js'));
const WZ = global.window.WZ;
const D = WZ.day;
const C = WZ.content;

// #1 travel 距离口径：游客中心→墨池 步行 10~16 分钟；游客中心→雁荡山 坐车 120~150 分钟
{
  const home = C.dayHome, mochi = D.zoneOf('mochi'), yandang = D.zoneOf('yandang');
  const t1 = D.travel(home, mochi);
  assert.strictEqual(t1.mode, '步行', 't1.mode=' + t1.mode);
  assert.ok(t1.min >= 10 && t1.min <= 16, '游客中心→墨池步行 ' + t1.min + ' 分钟（期望 10~16）');
  const t2 = D.travel(home, yandang);
  assert.strictEqual(t2.mode, '坐车', 't2.mode=' + t2.mode);
  assert.ok(t2.min >= 108 && t2.min <= 165, '游客中心→雁荡山坐车 ' + t2.min + ' 分钟（期望 120~150 ±10%）');
  console.log('PASS 1 travel 口径（步行 ' + t1.min + ' 分 / 坐车 ' + t2.min + ' 分）');
}

// #2 computePlan 的 total = 各段路 + 各站停留 + 回程；end = 420 + total
{
  const plan = [{ id: 'wuma' }, { id: 'mochi' }];
  const c = D.computePlan(plan);
  const moveSum = c.legs.filter(l => l.type === 'move').reduce((a, l) => a + l.min, 0);
  const staySum = c.legs.filter(l => l.type === 'stop').reduce((a, l) => a + l.stay, 0);
  assert.strictEqual(c.move, moveSum);
  assert.strictEqual(c.stay, staySum);
  assert.strictEqual(c.total, moveSum + staySum);
  assert.strictEqual(c.end, 420 + c.total);
  console.log('PASS 2 computePlan 分解（total=' + c.total + '，end=' + c.end + '）');
}

// #3 出发口径（10/25 用户裁决）：不强制填满——≥1 商圈即可出发；不足提示「还差」，超时提示「超出」（结算 −10）
{
  const few = D.computePlan([{ id: 'wuma' }]);
  assert.strictEqual(few.canDepart, true);
  assert.ok(few.reason.includes('行程偏短'), few.reason);
  const many = D.computePlan([{ id: 'yandang' }, { id: 'nanxi' }, { id: 'wuma', stay: 420 }, { id: 'mochi', stay: 420 }, { id: 'jiangxin', stay: 420 }]);
  assert.strictEqual(many.canDepart, true);
  assert.ok(many.reason.includes('超出'), many.reason);
  const good = D.computePlan([{ id: 'wuma', stay: 300 }, { id: 'mochi', stay: 280 }, { id: 'jiangxin', stay: 300 }]);
  assert.strictEqual(good.canDepart, true, good.reason + '（total=' + good.total + '）');
  const empty = D.computePlan([]);
  assert.strictEqual(empty.canDepart, false);
  console.log('PASS 3 出发口径放宽（' + good.total + ' / 1024；空行程仍拦截）');
}

// #4 三个老城圈的店互不重复（同一地点 id 只属于一个圈）
{
  const placesIn = d => D.districtPlaces(d);
  const boxes = ['wuma', 'mochi', 'jiangxin'].map(id => D.zoneOf(id));
  const seen = {};
  let dup = 0;
  boxes.forEach(d => {
    placesIn(d).forEach(p => { if (seen[p.id]) dup++; seen[p.id] = true; });
  });
  assert.strictEqual(dup, 0, dup + ' 处重复');
  console.log('PASS 4 老城三圈地点互不重复（共 ' + Object.keys(seen).length + ' 处）');
}

// #5 远郊圈（placeIds 型）内店在图上是「示意位置」：demo 口径 = sketch 标记；这里等价断言 placeIds 型只有精选店
{
  ['nantang', 'nanxi', 'yandang'].forEach(id => {
    const d = D.zoneOf(id);
    const inD = D.districtPlaces(d);
    assert.ok(inD.length && inD.every(p => d.placeIds.includes(p.id)), id + ' 应只含 placeIds 精选（示意位置）');
  });
  console.log('PASS 5 远郊圈用 placeIds 精选（示意位置口径）');
}

// #6 addTime：clockMin 推进 + 过午夜收工
{
  const run = WZ.rules.createRun({
    troubles: [{ tag: 'any', text: '都行' }], difficulty: 'easy', params: C.params,
    places: C.places, content: C, seed: 3, tags: ['any', 'food', 'walk', 'shop', 'bored'],
  });
  const c0 = run.state.clockMin;
  run.addTime(120);
  assert.strictEqual(run.state.clockMin, c0 + 120, 'addTime 未推进时钟');
  run.addTime(2000); // 冲到午夜
  assert.strictEqual(run.state.clockMin, 1024, '应停在 1024');
  assert.strictEqual(run.state.ended, true, '过午夜应收工');
  console.log('PASS 6 addTime 推进与午夜收工');
}

console.log('\n6 项全通过');
