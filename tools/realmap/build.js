#!/usr/bin/env node
/* tools/realmap/build.js —— 用高德真实坐标 + 高德步行路线生成《温州玩家》的真实老城地图
 *
 * 输入：tools/realmap/anchors.json（地点 → 真实 POI 坐标，GCJ-02）
 *       tools/realmap/walks.json  （高德 JS API AMap.Walking 实测：两两步行路线、距离、秒数）
 * 输出：content/places.js（地点 x/y = 真实位置；mapSize.real = 街道/江/岛的格子图）
 *
 * 比例：1 世界单位 = 1.5 米（M_PER_UNIT）。玩家速度由 calibrate 一步按高德步行实测反推，
 * 保证"游戏里走过去的分钟数 ≈ 高德步行分钟数"。
 * 用法：node tools/realmap/build.js [--speed 200]
 */
'use strict';
var fs = require('fs'), path = require('path');
var HERE = __dirname, ROOT = path.join(HERE, '..', '..');
var A = JSON.parse(fs.readFileSync(path.join(HERE, 'anchors.json'), 'utf8'));
if (process.env.REALMAP_ROOT) ROOT = process.env.REALMAP_ROOT;
var WALKS = JSON.parse(fs.readFileSync(path.join(HERE, 'walks.json'), 'utf8'));

var M_PER_UNIT = 1.5, CELL = 32;
var LNG0 = 120.6450, LAT1 = 28.0325;
var W = 1600, H = 2592;                     // 2.4 km × 3.9 km
var KX = Math.cos(28.01 * Math.PI / 180) * 111320, KY = 110950; // 米/度
var COLS = W / CELL, ROWS = H / CELL;
function X(lng) { return (lng - LNG0) * KX / M_PER_UNIT; }
function Y(lat) { return (LAT1 - lat) * KY / M_PER_UNIT; }
function cellOf(lng, lat) { return [Math.floor(X(lng) / CELL), Math.floor(Y(lat) / CELL)]; }
function lngOfCol(c) { return LNG0 + (c + 0.5) * CELL * M_PER_UNIT / KX; }
function latOfRow(r) { return LAT1 - (r + 0.5) * CELL * M_PER_UNIT / KY; }

// ---------- 1. 地形 ----------
var mask = []; for (var r = 0; r < ROWS; r++) mask.push(new Array(COLS).fill('.'));
function put(c, r, ch) { if (c >= 0 && r >= 0 && c < COLS && r < ROWS) mask[r][c] = ch; }
function at(c, r) { return (c >= 0 && r >= 0 && c < COLS && r < ROWS) ? mask[r][c] : 'W'; }

// 瓯江南岸：用江边路口的高德坐标连线（望江东路在岸上，水面在它北边约 40 米）
var BANK = A.geo.bank; // [[lng, lat], ...] 由西向东
function bankLat(lng) {
  for (var i = 1; i < BANK.length; i++) if (lng <= BANK[i][0]) { var a = BANK[i - 1], b = BANK[i]; return a[1] + (b[1] - a[1]) * (lng - a[0]) / (b[0] - a[0]); }
  return BANK[BANK.length - 1][1];
}
var I = A.geo.island; // 江心屿：椭圆近似 {lng, lat, rx, ry}
function inEllipse(e, lng, lat) { return Math.pow((lng - e.lng) / e.rx, 2) + Math.pow((lat - e.lat) / e.ry, 2) < 1; }
var riverRows = 0;
for (r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
  var lng = lngOfCol(c), lat = latOfRow(r);
  if (lat > bankLat(lng) + 0.0004) { put(c, r, inEllipse(I, lng, lat) ? 'G' : 'W'); riverRows = Math.max(riverRows, r + 1); }
}
(A.geo.lakes || []).forEach(function (e) { for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) if (inEllipse(e, lngOfCol(c), latOfRow(r))) put(c, r, 'W'); });
(A.geo.parks || []).forEach(function (e) { for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) if (mask[r][c] === '.' && inEllipse(e, lngOfCol(c), latOfRow(r))) put(c, r, 'P'); });

// ---------- 2. 街道 = 高德步行路线的并集（采集时已按同一网格栅格化成 roadCells）----------
function rasterLine(a, b, onCell) {
  var ax = X(a[0]), ay = Y(a[1]), bx = X(b[0]), by = Y(b[1]);
  var n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 6));
  for (var i = 0; i <= n; i++) { var t = i / n; onCell(Math.floor((ax + (bx - ax) * t) / CELL), Math.floor((ay + (by - ay) * t) / CELL)); }
}
var g = WALKS.grid; if (g.lng0 !== LNG0 || g.lat1 !== LAT1 || g.metersPerUnit !== M_PER_UNIT) throw new Error('walks.json 的网格和本脚本不一致，需重新采集');
var used = WALKS.pairs.length;
WALKS.roadCells.split(';').forEach(function (s) {
  var cr = s.split(',').map(Number), c = cr[0], r = cr[1], t = at(c, r);
  if (t === 'W' || t === 'G') put(c, r, 'B'); // 江岸近似误差：沿江路落进水里就当江岸步道
  else put(c, r, 'R');
});
// 栅格化的路线在斜向相邻处会断（游戏寻路不许斜穿墙角），补一格直角
var WALK = { R: 1, B: 1 };
for (var pass = 0; pass < 2; pass++) for (r = 0; r < ROWS - 1; r++) for (c = 0; c < COLS; c++) {
  [[1, 1], [-1, 1]].forEach(function (d) {
    var c2 = c + d[0], r2 = r + 1;
    if (!WALK[at(c, r)] || !WALK[at(c2, r2)]) return;
    if (WALK[at(c2, r)] || WALK[at(c, r2)]) return;
    if (at(c2, r) !== 'W') put(c2, r, 'R'); else if (at(c, r2) !== 'W') put(c, r2, 'R'); else put(c2, r, 'B');
  });
}
// 轮渡航线：码头 → 岛上码头，画成栈道
var F = A.geo.ferry; rasterLine(F[0], F[1], function (c, r) { if (at(c, r) === 'W') put(c, r, 'B'); });

// ---------- 3. 地点 ----------
var places = A.places.map(function (p) {
  var o = { id: p.id, name: p.name, types: p.types, x: Math.round(X(p.lng)), y: Math.round(Y(p.lat)), stayMin: p.stayMin, knowledgeId: p.knowledgeId };
  if (p.crowdWindow) o.crowdWindow = p.crowdWindow;
  o.real = { name: p.realName || p.name, lng: p.lng, lat: p.lat, poi: p.poi || '', note: p.note || '' };
  if (p.drive) o.real.driveMinOneWay = p.drive;
  if (p.hours) o.hours = p.hours;            // 真实营业时间（游戏 07:00 开局，规则据此判扑空）
  if (p.closedDow) o.closedDow = p.closedDow; // 周几闭馆，1=周一
  if (p.queueMin) o.queueMin = p.queueMin;
  if (p.info) o.real.info = p.info;           // 评分/人均/招牌/来源（大众点评/携程/美团/高德）
  o.x = Math.max(CELL * 1.5, Math.min(W - CELL * 1.5, o.x)); o.y = Math.max(CELL * 1.5, Math.min(H - CELL * 1.5, o.y));
  return o;
});
var zones = A.zones.map(function (z) {
  var x0 = X(z.lng0), x1 = X(z.lng1), y0 = Y(z.lat1), y1 = Y(z.lat0);
  return { id: z.id, placeId: z.placeId, x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
});
var pagodas = (A.geo.pagodas || []).map(function (p) { return cellOf(p[0], p[1]); });

var real = {
  source: '高德 JS API：地点坐标（PlaceSearch）+ 步行路线（Walking，' + used + ' 条）；2026-10-23 采集；GCJ-02',
  metersPerUnit: M_PER_UNIT, lng0: LNG0, lat1: LAT1, riverRows: riverRows, pagodas: pagodas,
  mask: mask.map(function (row) { return row.join(''); })
};
module.exports = { places: places, zones: zones, real: real, W: W, H: H, X: X, Y: Y };

if (require.main === module) {
  var out = '// content/places.js —— 真实老城地图（由 tools/realmap/build.js 生成，别手改；改 anchors.json 后重跑）\n' +
    '// 比例 1 单位 = ' + M_PER_UNIT + ' 米；地点坐标来自高德，街道是高德步行路线的并集；远郊两站按"坐车往返"计时\n' +
    '(function (root) {\n  root.WZ = root.WZ || {};\n  root.WZ.content = root.WZ.content || {};\n\n' +
    '  root.WZ.content.mapSize = ' + JSON.stringify({ w: W, h: H, real: real }) + ';\n\n' +
    '  root.WZ.content.places = ' + JSON.stringify(places, null, 1).replace(/\n\s*/g, ' ') .replace(/\} , \{/g, '},\n    {') + ';\n\n' +
    '  root.WZ.content.zones = ' + JSON.stringify(zones) + ';\n' +
    '})(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.writeFileSync(path.join(ROOT, 'content', 'places.js'), out);
  console.log('places', places.length, 'routes', used, 'riverRows', riverRows, 'grid', COLS + 'x' + ROWS);
  console.log(real.mask.join('\n'));
}
