/* tests/path.test.js —— W1 寻路与地图连通性测试
 * 运行：node tests/path.test.js   （退出码 0 = 通过）
 * 若 content/places.js 存在则用真实内容，否则用 map.js 内置 fallback。
 */
'use strict';
var path = require('path');
var fs = require('fs');

require(path.join(__dirname, '..', 'web', 'map.js'));
var WZ = globalThis.WZ;

var usingContent = false;
['params.js', 'places.js'].forEach(function (f) {
  var p = path.join(__dirname, '..', 'content', f);
  if (fs.existsSync(p)) { try { require(p); } catch (e) { console.log('警告：加载 content/' + f + ' 失败：' + e.message); } }
});
var cfg;
if (WZ.content && Array.isArray(WZ.content.places) && WZ.content.places.length) {
  usingContent = true;
  cfg = { places: WZ.content.places, zones: WZ.content.zones || [], mapSize: WZ.content.mapSize || { w: 1600, h: 2400 }, params: WZ.content.params || {} };
} else {
  cfg = WZ.map.fallbackContent();
}
console.log('内容来源：' + (usingContent ? 'content/*.js' : 'map.js fallback'));

var failures = 0, checks = 0;
function ok(cond, msg) { checks++; if (!cond) { failures++; console.log('  ✗ ' + msg); } }

var map = WZ.map.create(cfg);
console.log('地图 ' + map.cols + '×' + map.rows + ' 格，可走格 ' + map.walkableCount() + '，房子 ' + map.buildings.length + '，seed ' + map.seed);

// 1. 必含地点
var REQUIRED = ['center', 'wuma', 'mochi', 'xianqian', 'teastall', 'pier', 'lane1', 'lane2', 'toilet1', 'toilet2', 'toilet3'];
REQUIRED.forEach(function (id) { ok(!!map.placeById(id), '缺少地点 ' + id); });

// 2. 每个地点入口可走
map.places.forEach(function (p) { ok(map.isWalkable(p.cx, p.cy), '地点 ' + p.id + ' 入口不可走'); });

// 3. 所有可走格互相连通（从 center 出发 BFS 能覆盖全部）
var cells = map.walkableCells();
var home = map.home;
var allReach = cells.every(function (c) { return map.isReachable({ cx: home.cx, cy: home.cy }, c); });
ok(allReach, '存在从起点不可达的可走格');

// 4. 随机 40 组起终点寻路
var rnd = WZ.map.mulberry32(20261023);
function randCell() { return cells[Math.floor(rnd() * cells.length)]; }
function checkPath(a, b, label) {
  var A = map.toWorld(a.cx, a.cy), B = map.toWorld(b.cx, b.cy);
  var pts = map.findPath(A.x, A.y, B.x, B.y);
  ok(Array.isArray(pts), label + ' 寻路返回 null');
  if (!pts) return;
  var last = pts.length ? pts[pts.length - 1] : A;
  ok(Math.hypot(last.x - B.x, last.y - B.y) < 1, label + ' 终点不对');
  // 路径点都在可走格上，且相邻两点间直线不穿墙（按 4px 采样）
  var prev = A;
  pts.forEach(function (p, i) {
    ok(map.isWalkableWorld(p.x, p.y), label + ' 路径点 ' + i + ' 落在障碍上');
    var n = Math.ceil(Math.hypot(p.x - prev.x, p.y - prev.y) / 4);
    for (var k = 1; k < n; k++) { var t = k / n; if (!map.isWalkableWorld(prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t)) { ok(false, label + ' 段 ' + i + ' 穿墙'); break; } }
    prev = p;
  });
  // 网格路径逐格相邻
  var cp = map.findPathCells(a, b);
  ok(cp && cp.length > 0, label + ' 网格路径为空');
  if (cp) for (var i = 1; i < cp.length; i++) ok(Math.max(Math.abs(cp[i].cx - cp[i - 1].cx), Math.abs(cp[i].cy - cp[i - 1].cy)) === 1, label + ' 网格路径不连续');
}
for (var i = 0; i < 40; i++) checkPath(randCell(), randCell(), '随机#' + i);

// 5. 起点→每个地点
map.places.forEach(function (p) { checkPath({ cx: home.cx, cy: home.cy }, { cx: p.cx, cy: p.cy }, 'center→' + p.id); });

// 6. 目标在障碍里：自动吸附到最近可走格
var waterCell = null;
for (var y = 0; y < map.rows && !waterCell; y++) for (var x = 0; x < map.cols; x++) if (map.get(x, y) === map.T.WATER) { waterCell = { cx: x, cy: y }; break; }
if (waterCell) {
  var W = map.toWorld(waterCell.cx, waterCell.cy), H = map.toWorld(home.cx, home.cy);
  var pw = map.findPath(H.x, H.y, W.x, W.y);
  ok(Array.isArray(pw) && pw.length > 0, '目标在水里应吸附到最近可走格');
  if (pw) ok(map.isWalkableWorld(pw[pw.length - 1].x, pw[pw.length - 1].y), '吸附后的终点应可走');
}

// 7. 封路：每个地点施工时仍全图连通，且路径避开施工格
var rwCount = 0;
map.places.forEach(function (p) {
  var rw = map.setRoadwork(p.id);
  if (rw.cells.length) rwCount++;
  var blockedSet = {};
  rw.cells.forEach(function (i) { blockedSet[i] = true; });
  // 全部地点仍可达
  map.places.forEach(function (q) {
    var pts = map.findPath(home.ex, home.ey, q.ex, q.ey);
    ok(Array.isArray(pts), '封路 ' + p.id + ' 时 center→' + q.id + ' 不可达');
    if (pts) pts.forEach(function (pt) { var c = map.toCell(pt.x, pt.y); ok(!blockedSet[map.idx(c.cx, c.cy)], '封路 ' + p.id + ' 时路径穿过施工格'); });
  });
  // 随机 10 组
  for (var k = 0; k < 10; k++) {
    var a = randCell(), b = randCell();
    if (blockedSet[map.idx(a.cx, a.cy)] || blockedSet[map.idx(b.cx, b.cy)]) continue;
    var A = map.toWorld(a.cx, a.cy), B = map.toWorld(b.cx, b.cy);
    ok(Array.isArray(map.findPath(A.x, A.y, B.x, B.y)), '封路 ' + p.id + ' 时随机点不可达');
  }
});
ok(rwCount >= Math.ceil(map.places.length * 0.8), '能成功封路的地点太少：' + rwCount + '/' + map.places.length);
map.setRoadwork(null);
ok(map.getRoadwork().cells.length === 0, 'setRoadwork(null) 应清空');

// 8. 同格寻路
var P = map.toWorld(home.cx, home.cy);
var same = map.findPath(P.x, P.y, P.x + 3, P.y + 3);
ok(Array.isArray(same), '同格寻路应返回数组');

console.log(checks + ' 项检查，' + failures + ' 项失败');
if (failures) { console.log('FAIL'); process.exit(1); }
console.log('PASS');
