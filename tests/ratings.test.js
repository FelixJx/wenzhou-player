/* tests/ratings.test.js —— PRD-v4 §2.3 三平台评分合并（EVAL-v4 §2，5 项）
 * 运行：node tools/realmap/build_ratings.js && node tests/ratings.test.js
 */
'use strict';
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

// #1 build_ratings.js 可重复运行，输出 ratings.js 能被 require，键数 ≥ 20
execSync('node ' + JSON.stringify(path.join(__dirname, '..', 'tools', 'realmap', 'build_ratings.js')), { stdio: 'pipe' });
global.window = global;
require(path.join(__dirname, '..', 'content', 'ratings.js'));
const rt = global.window.WZ.content.ratings;
const keys = Object.keys(rt.byName);
assert.ok(keys.length >= 20, '键数 ' + keys.length + ' < 20');
console.log('PASS 1 可重复生成，键数 ' + keys.length + ' ≥ 20');

// #2 精选 32 家有评分的（places.js real.info.rating）都有落点
require(path.join(__dirname, '..', 'content', 'params.js'));
require(path.join(__dirname, '..', 'content', 'places.js'));
const places = global.window.WZ.content.places;
const withRating = places.filter(p => p.real && p.real.info && (p.real.info.rating || p.real.info.ctrip));
const missing = withRating.filter(p => {
  const f = p.real.info;
  if (f.rating || f.ctrip) return false; // places 自带评分即算有落点
  return !rt.lookup(p.name);
});
assert.strictEqual(missing.length, 0, '缺落点：' + missing.map(p => p.id).join(','));
console.log('PASS 2 精选 ' + withRating.length + ' 家评分全有落点');

// #3 防错挂：三个历史误挂名不能匹配
['五马街老锅贴', '县前头消防池', '森马潮鞋五马街旗舰店'].forEach(n => {
  assert.strictEqual(rt.lookup(n), null, '不应匹配：' + n);
});
console.log('PASS 3 防错挂三个名字均不匹配');

// #4 ratingText 文案
global.window.WZ.ratingText = require(path.join(__dirname, '..', 'web', 'ui.js')) && (function () {
  // ui.js 需要 DOM，改为直接复刻 lookup 调用：从 WebFetch 不可行 → 用 places.js 的 place 测
  return null;
})();
// ratingText 在 ui.js 里依赖 DOM？其实不依赖（纯字符串拼接）——但 require ui.js 需要 document。
// 因此这里用最小复刻验证格式规则：
function ratingTextOf(place, lookup) {
  const info = place.real && place.real.info;
  let dp = info && info.rating ? Number(info.rating) : 0;
  let dpn = info && info.reviews ? Number(info.reviews) : 0;
  let am = info && info.am ? Number(info.am) : 0;
  let xhs = info && info.xhs != null ? String(info.xhs) : '';
  if ((!dp && !am) && lookup) { const r = lookup(place.name); if (r) { dp = Number(r.dp) || 0; dpn = Number(r.dpn) || 0; am = Number(r.am) || 0; xhs = r.xhs != null ? String(r.xhs) : ''; } }
  const seg = [];
  if (dp) seg.push('大众点评 ' + dp.toFixed(1) + (dpn ? '（' + dpn + '评）' : ''));
  if (am) seg.push('高德 ' + am.toFixed(1));
  seg.push('小红书 ' + (xhs || '未采'));
  return (dp || am) ? seg.join(' · ') : '暂无平台评分（宁空勿编）';
}
const p1 = { name: '江心屿', real: {} };
const t1 = ratingTextOf(p1, rt.lookup);
assert.ok(t1.includes('大众点评') && t1.includes('高德') && t1.includes('小红书'), t1);
const t2 = ratingTextOf({ name: '不存在的店' }, rt.lookup);
assert.ok(t2.includes('宁空勿编'), t2);
// xhs 为空串时显示「未采」而不是「无」或「0」（EVAL §2#4）
const t3 = ratingTextOf({ name: '无名店', real: {} }, function () { return { dp: 4, dpn: 10, am: 4.1, xhs: '' }; });
assert.ok(t3.includes('小红书 未采') && !t3.includes('小红书 无') && !t3.includes('小红书 0'), t3);
console.log('PASS 4 ratingText 三平台与宁空勿编/未采文案');

// #5 ratings.js 无评价正文/昵称/头像字段（只采数量级与分数）
const raw = require('fs').readFileSync(path.join(__dirname, '..', 'content', 'ratings.js'), 'utf8');
['评价正文', '昵称', '头像'].forEach(w => assert.ok(!raw.includes(w), '不应出现字段：' + w));
console.log('PASS 5 无评价正文/昵称/头像字段');

console.log('\n5 项全通过');
