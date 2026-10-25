#!/usr/bin/env node
/* tools/realmap/build_ratings.js —— 三平台评分合并（PRD-v4 §2.3）
 * 数据源（tools/crawl-lab/results/，105 家同名键）：
 *   meituan-ratings.json    → { 美团评分, 美团评价数 }（点评/美团同池，显示为「大众点评」）
 *   amap-poi-105.json       → { 高德评分, ... }
 *   xhs-heat-20261024.json  → { 小红书热度 }（'' = 未采）
 * 匹配规则（防错挂，EVAL §2#3）：店名归一化（去括号注记、去「店/铺/老店/坊」后缀）后完全相等才挂。
 * 输出 content/ratings.js：WZ.content.ratings = { byName, normalize, lookup }。
 * 可重复运行；无 crawl 数据时回退 content/places.js 的 real.info（精选 32 家）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RES = path.join(__dirname, '..', 'crawl-lab', 'results');
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(RES, f), 'utf8')); } catch (e) { return null; } };

const meituan = read('meituan-ratings.json') || {};
const amap = read('amap-poi-105.json') || {};
const xhs = read('xhs-heat-20261024.json') || {};

function normalize(n) {
  return String(n || '')
    .replace(/[（(][^）)]*[)）]/g, '')   // 去括号注记（分店名/状态）
    .replace(/(旗舰店|专卖店| total)?$/,'')
    .replace(/(店|铺|老店|坊)$/,'')
    .trim();
}

const byName = {};
function put(rawName, v) {
  const k = normalize(rawName);
  if (!k) return;
  byName[k] = Object.assign(byName[k] || {}, v);
}

Object.keys(meituan).forEach((name) => {
  const v = meituan[name] || {};
  if (v['美团评分'] != null) put(name, { dp: Number(v['美团评分']), dpn: Number(v['美团评价数']) || 0 });
});
Object.keys(amap).forEach((name) => {
  const v = amap[name] || {};
  if (v['高德评分'] != null) put(name, { am: Number(v['高德评分']) });
});
Object.keys(xhs).forEach((name) => {
  const v = xhs[name] || {};
  if (v['小红书热度'] != null) put(name, { xhs: String(v['小红书热度']) });
});

// 回退源：content/places.js 精选店的 real.info（有 ratingSrc/reviews）
try {
  require(path.join(ROOT, 'content', 'params.js'));
  require(path.join(ROOT, 'content', 'places.js'));
  const places = globalThis.WZ.content.places || [];
  places.forEach((p) => {
    const info = p.real && p.real.info;
    if (!info || !(info.rating || info.ctrip)) return;
    const k = normalize(p.name);
    const v = {};
    if (info.rating) {
      const src = String(info.ratingSrc || '');
      if (/大众点评|美团/.test(src)) { v.dp = Number(info.rating); v.dpn = Number(info.reviews) || 0; }
      else if (/高德/.test(src)) v.am = Number(info.rating);
      else v.dp = Number(info.rating);
    }
    if (info.ctrip) v.ct = Number(info.ctrip);
    if (Object.keys(v).length) byName[k] = Object.assign(byName[k] || {}, v);
  });
} catch (e) { /* places.js 缺失忽略 */ }

const count = Object.keys(byName).length;
const out = `// content/ratings.js —— 三平台评分合并（tools/realmap/build_ratings.js 生成，别手改）
// 来源：tools/crawl-lab/results/{meituan-ratings,amap-poi-105,xhs-heat-20261024}.json + content/places.js 精选
// 匹配规则：店名归一化后完全相等才挂（防错挂）；xhs 为空串 = 「未采」，宁空勿编。生成时间 ${new Date().toISOString()}
(function (root) {
  root.WZ = root.WZ || {};
  root.WZ.content = root.WZ.content || {};
  var byName = ${JSON.stringify(byName)};
  function normalize(n) {
    return String(n || '')
      .replace(/[（(][^）)]*[)）]/g, '')
      .replace(/(店|铺|老店|坊)$/, '')
      .trim();
  }
  root.WZ.content.ratings = {
    byName: byName,
    normalize: normalize,
    lookup: function (name) { return byName[normalize(name)] || null; },
    count: Object.keys(byName).length
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(path.join(ROOT, 'content', 'ratings.js'), out);
console.log('content/ratings.js 已生成：' + count + ' 家');
