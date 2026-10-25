/* web/day.js —— 多商圈排一天（PRD-v4 §3，10/25）
 * 纯函数、无 DOM：travel（商圈间步行/坐车估算）+ computePlan（时间轴）+ canDepart（900≤total≤1024）。
 * 依赖：content/districts.js、content/params.js（node 下可直接 require 测试）。
 */
(function (root) {
  'use strict';
  root.WZ = root.WZ || {};

  var START = 420; // 07:00

  function districts() { return (root.WZ.content && root.WZ.content.districts) || []; }
  function home() { return (root.WZ.content && root.WZ.content.dayHome) || { name: '游客中心', lng: 120.655, lat: 28.0205 }; }
  function zoneOf(id) { var z = districts().filter(function (d) { return d.id === id; })[0]; return z || null; }

  // 球面距离 ×1.3（绕路系数）；≤3km 步行 4.5km/h，>3km 坐车 35km/h + 15 分钟候车
  function km(a, b) {
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLat / 2), y = Math.sin(dLng / 2);
    var h = x * x + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * y * y;
    return 2 * R * Math.asin(Math.sqrt(h)) * 1.3;
  }
  function travel(a, b) {
    var d = km(a, b);
    if (d <= 3) return { mode: '步行', min: Math.max(1, Math.round(d / 4.5 * 60)), km: d };
    return { mode: '坐车', min: Math.round(d / 35 * 60) + 15, km: d };
  }

  // plan: [{ id, stay }]（stay = 玩家调过的预计停留，缺省用 districts.stayDefault）
  // 返回 { legs, end, move, stay, total, canDepart, reason }；end 为墙钟分钟（07:00 + total）
  function computePlan(plan, opts) {
    opts = opts || {};
    var params = (root.WZ.content && root.WZ.content.params) || {};
    var floor = params.dayMinFloor != null ? params.dayMinFloor : 900;
    var totalMin = params.totalMin || 1024;
    var legs = [], t = START, prev = home(), move = 0, stay = 0;
    (plan || []).forEach(function (item) {
      var z = zoneOf(item.id);
      if (!z) return;
      var tr = travel(prev, z);
      legs.push({ type: 'move', from: prev.name, to: z.name, mode: tr.mode, min: tr.min, at: t });
      t += tr.min; move += tr.min;
      var s = item.stay != null ? item.stay : z.stayDefault;
      legs.push({ type: 'stop', zone: z, stay: s, at: t });
      t += s; stay += s;
      prev = z;
    });
    var back = travel(prev, home());
    if ((plan || []).length) {
      legs.push({ type: 'move', from: prev.name, to: home().name, mode: back.mode, min: back.min, at: t, back: true });
      t += back.min; move += back.min;
    }
    var total = move + stay;
    var canDepart, reason = '';
    // 10/25 用户裁决：不强制填满 1024——≥1 个商圈即可出发；不足/超出只在文案里提醒（超时结算 −10）
    // 10/25 裁决：宽松出发；排得好坏换时间规划分（≥900 → +30，≥600 → +15，超 1024 结算 −10）
    if (!(plan || []).length) { canDepart = false; reason = '先选至少一个商圈'; }
    else if (total > totalMin) { canDepart = true; reason = '超出 ' + (total - totalMin) + ' 分钟：午夜回不到家结算 −10'; }
    else if (total >= floor) { canDepart = true; reason = '✓ 排满一天（' + total + ' 分钟），出发结算 +30 时间分'; }
    else if (total >= 600) { canDepart = true; reason = '半天行程（' + total + ' 分钟），再排满一点结算 +30 时间分'; }
    else { canDepart = true; reason = '行程偏短（' + total + ' 分钟），排得越满时间分越高'; }
    return { legs: legs, end: t, move: move, stay: stay, total: total, canDepart: canDepart, reason: reason, floor: floor, totalMin: totalMin };
  }

  // 商圈内的店（互斥归属，10/25）：placeIds 精选优先；有 center 的圈按「离哪个圈心最近且在圈内」归属
  function districtPlaces(d) {
    var places = (root.WZ.content && root.WZ.content.places) || [];
    var boxed = districts().filter(function (x) { return !!x.center; });
    var out = [];
    var claimed = {};
    districts().forEach(function (o) { (o.placeIds || []).forEach(function (pid) { claimed[pid] = o.id; }); });
    places.forEach(function (p) {
      if (d.placeIds) { if (d.placeIds.indexOf(p.id) >= 0) out.push(p); return; }
      if (claimed[p.id] && claimed[p.id] !== d.id) return; // 别家的精选地点不落进老城圈
      if (!d.center) return;
      var best = null, bd = Infinity;
      boxed.forEach(function (o) {
        var dd = Math.hypot(p.x - o.center.x, p.y - o.center.y);
        if (dd <= o.r && dd < bd) { bd = dd; best = o; }
      });
      if (best && best.id === d.id) out.push(p);
    });
    return out;
  }

  root.WZ.day = {
    START: START,
    districts: districts,
    home: home,
    zoneOf: zoneOf,
    km: km,
    travel: travel,
    computePlan: computePlan,
    districtPlaces: districtPlaces,
  };
})(typeof window !== 'undefined' ? window : globalThis);
