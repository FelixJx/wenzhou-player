#!/usr/bin/env node
/* tools/realmap/build_pois.js —— 把高德实采的周边 POI（pois-raw.json）落到真实老城地图上，生成 content/pois.js
 * 数据：高德 JS API 2.0 PlaceSearch.searchNearBy（老城 36 个网格点 × 餐饮/购物/景点文化/生活服务，每格前 25 个，
 *       另取道路名 190301 用来在地图上标街名）。只存名称、类别、坐标、高德 POI 编号，不存评价/图片/用户信息。
 * 用法：node tools/realmap/build_pois.js
 */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var B = require('./build.js');                    // X(lng) / Y(lat) / W / H / real.mask 与地图同一套换算
var raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'pois-raw.json'), 'utf8'));
var mask = B.real.mask, CELL = 32;
function cellAt(x, y) { var c = Math.floor(x / CELL), r = Math.floor(y / CELL); return (mask[r] || '')[c] || 'W'; }
var ROADY = { R: 1, B: 1, L: 1 };

// 类别细分：只按高德自己的类型字段分，不猜；和游客无关的（培训机构、学校、公司、住宅、建材家电卖场…）不上地图
function catOf(cat, type) {
  var t2 = type.split(';').slice(0, 2).join(';');
  if (/培训机构|学校|传媒机构|科研机构|驾校|公司企业|商务住宅|地名地址|家居建材|家电电子|动物医疗/.test(t2)) return null;
  if (/咖啡|茶艺|冷饮|甜品/.test(t2)) return 'cafe';
  if (/^餐饮服务/.test(t2)) return 'food';
  if (/^风景名胜|图书馆|文化宫|展览馆|博物馆|美术馆|会展中心|科教文化场所|文艺团体/.test(t2)) return 'sight';
  if (/^购物服务/.test(t2)) return 'shop';
  if (/银行|提款机/.test(t2)) return 'bank';
  if (/^医疗保健/.test(t2)) return 'med';
  if (/^住宿服务/.test(t2)) return 'hotel';
  if (/公检法|政府/.test(t2)) return 'gov';
  if (/^生活服务|体育休闲/.test(t2)) return 'life';
  return null;
}
var CATS = ['food', 'cafe', 'shop', 'sight', 'bank', 'med', 'hotel', 'gov', 'life'];
var placeNames = B.places.map(function (p) { return (p.real && p.real.name) || p.name; });
function short(n) { return String(n).replace(/[（(].*?[)）]/g, '').trim(); }
var seen = {}, list = [];
raw.pois.forEach(function (r) {
  var id = r[0], name = r[1], cat = r[2], lng = r[3], lat = r[4], type = r[5] || '';
  var x = Math.round(B.X(lng)), y = Math.round(B.Y(lat));
  if (x < 8 || y < 8 || x > B.W - 8 || y > B.H - 8) return;
  if (cellAt(x, y) === 'W') return;                         // 落在江里的（坐标误差）不画
  var s = short(name);
  if (placeNames.some(function (pn) { var q = short(pn); return q && (q.indexOf(s) >= 0 || s.indexOf(q) >= 0); })) return; // 游戏里已有的店不重复
  var key = s + '@' + Math.round(x / 20) + ',' + Math.round(y / 20);
  if (seen[key]) return; seen[key] = 1;
  var c2 = catOf(cat, type); if (!c2) return;
  list.push([name, CATS.indexOf(c2), x, y, id]);
});
// 街名：每条路最多保留 3 个相距 > 400 单位的标注点；方向按地图格子判断（横/竖）
var streets = [], byName = {};
raw.roads.forEach(function (r) {
  var name = r[1], x = Math.round(B.X(r[2])), y = Math.round(B.Y(r[3]));
  if (x < 0 || y < 0 || x > B.W || y > B.H) return;
  if (/弄$/.test(name)) return;
  var arr = byName[name] = byName[name] || [];
  if (arr.length >= 3 || arr.some(function (p) { return Math.hypot(p[0] - x, p[1] - y) < 400; })) return;
  // 找最近的路格
  var c0 = Math.floor(x / CELL), r0 = Math.floor(y / CELL), best = null;
  for (var d = 0; d <= 3 && !best; d++) for (var dy = -d; dy <= d; dy++) for (var dx = -d; dx <= d; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
    if (ROADY[(mask[r0 + dy] || '')[c0 + dx]]) { best = [c0 + dx, r0 + dy]; break; }
  }
  if (!best) return;
  var h = 0, v = 0;
  for (var k = -4; k <= 4; k++) { if (ROADY[(mask[best[1]] || '')[best[0] + k]]) h++; if (ROADY[(mask[best[1] + k] || '')[best[0]]]) v++; }
  var ang = h >= v ? 0 : 90;
  arr.push([x, y]);
  streets.push([name, best[0] * CELL + CELL / 2, best[1] * CELL + CELL / 2, ang]);
});
var out = '// content/pois.js —— 老城真实店铺/景点/街名（tools/realmap/build_pois.js 生成，别手改）\n' +
  '// 来源：' + raw.src + '；采集时间 ' + raw.at + '。只含名称、类别、坐标、高德 POI 编号。\n' +
  '(function (root) {\n  root.WZ = root.WZ || {}; root.WZ.content = root.WZ.content || {};\n' +
  '  root.WZ.content.pois = ' + JSON.stringify({ cats: CATS, at: raw.at, list: list, streets: streets }) + ';\n' +
  "})(typeof window !== 'undefined' ? window : globalThis);\n";
fs.writeFileSync(path.join(ROOT, 'content', 'pois.js'), out);
var cnt = {}; list.forEach(function (p) { cnt[CATS[p[1]]] = (cnt[CATS[p[1]]] || 0) + 1; });
console.log('pois', list.length, JSON.stringify(cnt), 'streets', streets.length);
