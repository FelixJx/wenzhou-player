// tests/upgrades.test.js —— PRD-v2 升级逻辑单测（EVAL-v2 A9）。运行：node tests/upgrades.test.js（退出码 0 = 全过）
'use strict';
const assert = require('assert');
require('../web/guests.js');
require('../web/scoring.js');
require('../web/celebrity.js');
require('../web/rules.js');
require('../web/sfx.js');
require('../server/ai.js');
const WZ = globalThis.WZ;

// ---------- mock（与 rules.test.js 同构的最小集） ----------
const params = { minPerSec: 4, stayMin: 32, restMin: 64, goBackMin: 64, hearts: 3, calmTimes: 2, dayMin: 1024, teamSize: { easy: 5, normal: 6, hard: 7 } };
const places = [
  { id: 'center', name: '游客中心', types: ['home'], x: 0, y: 0, stayMin: 0, knowledgeId: 'k_center' },
  { id: 'wuma', name: '五马街', types: ['shop', 'sight'], x: 300, y: 200, stayMin: 32, knowledgeId: 'k_wuma' },
  { id: 'mochi', name: '墨池公园', types: ['sight', 'rest'], x: 600, y: 400, knowledgeId: 'k_mochi' },
  { id: 'pier', name: '江滨码头', types: ['sight'], x: 900, y: 1200, stayMin: 32, knowledgeId: 'k_pier' },
  { id: 'lane1', name: '小巷一', types: ['lane'], x: 150, y: 300, stayMin: 0, knowledgeId: 'k_lane1' },
];
const troubles = [
  { tag: 'walk', text: '一天两万步' }, { tag: 'rush', text: '一直在赶车' }, { tag: 'any', text: '都行' },
];
const celebs = [
  { who: 'su_buqing', name: '苏步青', enabled: true, trigger: { when: 'start' }, templates: ['{name}算'] },
  { who: 'xie_lingyun', name: '谢灵运', enabled: true, trigger: { when: 'arrive', types: ['sight'], requireSight: true, places: ['mochi', 'pier'] }, templates: ['{name}诗'] },
  { who: 'wang_xizhi', name: '王羲之', enabled: true, trigger: { when: 'arrive', place: 'mochi', minStay: 64 }, templates: ['{name}字'] },
];
const content = { params, places, zones: [], celebrities: celebs };

const results = [];
function test(name, fn) {
  try { fn(); results.push([name, true]); console.log('PASS ' + name); }
  catch (e) { results.push([name, false, e]); console.log('FAIL ' + name + '\n   ' + (e && e.stack || e)); }
}
const g = (run, tag) => run.state.guests.find(x => x.tag === tag);
const of = (cmds, type) => cmds.filter(c => c.type === type);

// ---------- F2c 名人轮换 ----------
test('checkAll：未出场时按 content 顺序返回全部匹配（谢在先、王在后）', () => {
  const all = WZ.celebrity.checkAll({
    when: 'arrive', placeId: 'mochi', place: places.find(p => p.id === 'mochi'), stayMin: 64,
    state: { celebritiesSeen: [], route: ['mochi'] }, places, content,
  });
  assert.deepStrictEqual(all.map(c => c.who), ['xie_lingyun', 'wang_xizhi']);
});

test('checkAll：谢灵运已出场 → 墨池轮到王羲之（评审 L17 修复）', () => {
  const all = WZ.celebrity.checkAll({
    when: 'arrive', placeId: 'mochi', place: places.find(p => p.id === 'mochi'), stayMin: 64,
    state: { celebritiesSeen: ['xie_lingyun'], route: ['mochi'] }, places, content,
  });
  assert.deepStrictEqual(all.map(c => c.who), ['wang_xizhi']);
});

test('rules 整链：码头遇谢灵运后，墨池出王羲之；celebrity 命令带 when 字段（F3）', () => {
  const run = WZ.rules.createRun({ troubles, difficulty: 'easy', params, places, content, seed: 7, tags: ['walk', 'any'], playerName: '阿温' });
  run.planRoute(['pier', 'mochi']);
  const c0 = run.tick(4);
  const start = of(c0, 'celebrity')[0];
  assert.strictEqual(start.who, 'su_buqing');
  assert.strictEqual(start.when, 'start', 'start 名人命令应带 when 字段供横幅路由');
  run.choose('celeb_su_buqing', 'b');
  const c1 = run.onArrive('pier');
  assert.strictEqual(of(c1, 'celebrity')[0].who, 'xie_lingyun');
  assert.strictEqual(of(c1, 'celebrity')[0].when, 'arrive');
  run.choose('celeb_xie_lingyun', 'b');
  const c2 = run.onArrive('mochi'); // mochi 无 stayMin → rest 64 ≥ minStay
  assert.strictEqual(of(c2, 'celebrity')[0].who, 'wang_xizhi', '谢已出场 → 王羲之补位');
});

// ---------- F18/L18 打架按钮兑现 ----------
test('冲突 walk_rush 选「歇一下」= 真歇：推进 stayMin 并清零走路表', () => {
  const run = WZ.rules.createRun({ troubles, difficulty: 'easy', params, places, content, seed: 7, tags: ['walk', 'rush', 'any'], playerName: '阿温' });
  const w = g(run, 'walk'), r = g(run, 'rush');
  w.hearts = 1; r.hearts = 1;
  const c = run.tick(4);
  const it = of(c, 'interrupt')[0];
  assert.strictEqual(it.id, 'conflict_walk_rush');
  assert.strictEqual(w.meter > 0, true, '走路 4 分钟应有meter');
  const before = run.state.clockMin;
  run.choose(it.id, 'a');
  assert.strictEqual(run.state.clockMin, before + 32, '歇一下推进 32 分钟');
  assert.strictEqual(w.meter, 0, '走路表清零');
  assert.strictEqual(w.hearts, 2);
  assert.strictEqual(r.hearts, 0);
});

// ---------- F12/L5 都行哥固定句 ----------
test('都行哥结算固定取 resolved 第 1 条（PRD 指定句不再 1/3 概率）', () => {
  const mockContent = { guests: { any: { resolved: ['固定句A', '固定句B', '固定句C'] } } };
  for (let i = 0; i < 10; i++) {
    const line = WZ.scoring.guestLine(
      { id: 'g1', name: '都行哥', tag: 'any', status: 'home', satisfied: true, line: '都行' },
      mockContent, Math.random, { place: '茶摊' }
    );
    assert.strictEqual(line.text, '固定句A');
    assert.strictEqual(line.star, true);
  }
});

// ---------- F12/L7 称号接 content ----------
test('称号：content.ending.resultTitles 生效（含 fast→rush 键名兼容），缺省回退内置', () => {
  const ct = { local: '本地通', kind: '贴心向导', fast: '赶路人', lost: '丢三落四', default: '温州玩家' };
  const stats = { broughtBack: 5, total: 5, remembered: 1, lost: 0 };
  assert.strictEqual(WZ.scoring.title(stats, params, ct), '赶路人', 'content 的 fast 键映射到 rush 档');
  assert.strictEqual(WZ.scoring.title(stats, params), '赶路人', '无 content 回退内置表');
  assert.strictEqual(WZ.scoring.title({ broughtBack: 5, total: 5, remembered: 5, lost: 0 }, params, ct), '本地通');
  assert.strictEqual(WZ.scoring.title({ broughtBack: 3, total: 5, remembered: 2, lost: 2 }, params, ct), '丢三落四');
});

// ---------- F9 音效模块 ----------
test('sfx：Node 环境无 AudioContext 时 init/play/setMuted 均不抛错', () => {
  assert.strictEqual(typeof WZ.sfx.init, 'function');
  assert.strictEqual(typeof WZ.sfx.play, 'function');
  WZ.sfx.play('bubble'); // 未 init → 静默丢弃
  WZ.sfx.setMuted(true);
  assert.strictEqual(WZ.sfx.muted, true);
  WZ.sfx.setMuted(false);
  assert.strictEqual(WZ.sfx.muted, false);
  WZ.sfx.play('win');
});

// ---------- F22/L22 AI ctx 清洗 ----------
test('ai.sanitizeCtx：prompt 输入白名单化（去符号、截断、保留业务字段）', () => {
  const out = WZ.ai ? null : null; // noop 保持行宽
  const s = require('../server/ai.js').sanitizeCtx({
    playerName: '阿温<script>',
    route: ['五马街', '<img src=x onerror=1>', '很长很长很长很长很长很长的地名超限'],
    tags: ['walk', '<b>'],
    place: '墨池公园',
    stage: 2,
  });
  assert.strictEqual(s.playerName, '阿温script');
  assert.deepStrictEqual(s.route, ['五马街', 'imgsrcxonerr', '很长很长很长很长很长很长']);
  assert.deepStrictEqual(s.tags, ['walk', 'b']);
  assert.strictEqual(s.place, '墨池公园');
  assert.strictEqual(s.stage, 2, '数值字段透传');
});

// ---------- L9 回归锚：零停站地点不入结算知识 ----------
test('回归：小巷（stayMin=0）只 visited 不 stayed，结算知识不含它', () => {
  const run = WZ.rules.createRun({ troubles, difficulty: 'easy', params, places, content, seed: 7, tags: ['any'], playerName: '阿温' });
  run.onArrive('lane1');
  assert.ok(run.state.visited.includes('lane1'), 'visited 含小巷');
  assert.ok(!run.state.stayed.includes('lane1'), 'stayed 不含小巷');
  run.goHome();
  const res = run.finish({ wentBack: false });
  assert.ok(!res.knowledge.includes('k_lane1'));
});

// ---------- 收尾 ----------
const failed = results.filter(r => !r[1]);
console.log('\n' + results.length + ' 项，' + failed.length + ' 失败');
process.exit(failed.length ? 1 : 0);
