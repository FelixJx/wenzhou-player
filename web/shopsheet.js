/* shopsheet.js —— 商圈商家清单（10/25 对照 demo §③）：筛选 + 评分排序 + 点行走店
 * 依赖：WZ.main.dayInfo() → { districtId, last } | null；WZ.main.walkToShop(entry)；WZ.main.run；content.ratings/promos。
 * 纯 DOM 面板挂 #dock，不占 overlay（地图保持可见可点）。
 */
(function (root) {
  'use strict';
  root.WZ = root.WZ || {};
  var S = { open: false, filter: 'all' };

  var CATS = [['all', '全部'], ['rated', '⭐ 有评分'], ['food', '🍴 吃'], ['cafe', '☕ 咖啡茶饮'], ['shop', '🛍️ 买'], ['sight', '🏞️ 看']];
  var CAT_ICON = { food: '🍴', cafe: '☕', shop: '🛍️', sight: '🏞️', life: '🏠', bank: '🏦', med: '＋', hotel: '🛏', gov: '🏛' };

  function el(tag, style, html) {
    var e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(str) { return String(str || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function entries(districtId) {
    var run = root.WZ.main && root.WZ.main.run;
    if (!run) return [];
    var visited = run.state.visited || [], stayed = run.state.stayed || [];
    var out = [];
    var S0 = root.WZ.engine.getState();
    (S0.pois || []).forEach(function (q) {
      out.push({ id: q.id, name: q.name, cat: q.cat, x: q.x, y: q.y, poi: true, visited: visited.indexOf(q.id) >= 0 });
    });
    var d = root.WZ.day ? root.WZ.day.zoneOf(districtId) : null;
    (root.WZ.content.places || []).forEach(function (p) {
      if ((p.types || []).indexOf('home') >= 0 || (p.types || []).indexOf('toilet') >= 0) return;
      var inD = d && (d.placeIds ? d.placeIds.indexOf(p.id) >= 0
        : d.center && Math.hypot(p.x - d.center.x, p.y - d.center.y) <= d.r);
      if (!inD) return;
      out.push({
        id: p.id, name: p.name,
        cat: (p.types || []).indexOf('food') >= 0 ? 'food' : (p.types || []).indexOf('shop') >= 0 ? 'shop' : (p.types || []).indexOf('cafe') >= 0 ? 'cafe' : 'sight',
        x: p.x, y: p.y, poi: false,
        visited: visited.indexOf(p.id) >= 0 || stayed.indexOf(p.id) >= 0,
      });
    });
    return out;
  }
  function rating(e) {
    if (!e.poi) {
      var p = (root.WZ.content.places || []).filter(function (x) { return x.id === e.id; })[0];
      var f = p && p.real && p.real.info;
      if (f && (f.rating || f.ctrip)) return { v: Number(f.rating || f.ctrip), n: Number(f.reviews) || 0, src: f.ratingSrc || '点评' };
    }
    var rt = root.WZ.content.ratings && root.WZ.content.ratings.lookup(e.name);
    return rt && rt.dp ? { v: Number(rt.dp), n: Number(rt.dpn) || 0, src: '大众点评' } : null;
  }

  function render() {
    if (!S.open) return;
    var info = root.WZ.main.dayInfo();
    if (!info) { close(); return; }
    var d = root.WZ.day.zoneOf(info.districtId);
    var list0 = entries(d ? d.id : null);
    var list = list0.filter(function (e) {
      if (S.filter === 'all') return true;
      if (S.filter === 'rated') return !!rating(e);
      return e.cat === S.filter;
    }).sort(function (a, b) {
      var ra = rating(a), rb = rating(b);
      return (rb ? rb.v : -1) - (ra ? ra.v : -1);
    });
    var box = S.el;
    var rows = box.querySelector('#ss-rows');
    rows.innerHTML = '';
    list.slice(0, 120).forEach(function (e) {
      var r = rating(e);
      var rt = r ? r.src + ' ' + r.v.toFixed(1) + (r.n ? '（' + r.n + '评）' : '') : '暂无平台评分（宁空勿编）';
      var promo = root.WZ.content.promos && root.WZ.content.promos[e.id];
      var row = el('button', 'display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;margin-bottom:5px;border:1px solid #d8cbae;border-radius:10px;background:' + (e.visited ? '#efe9da' : '#fffdf6') + ';color:#33302a;font:inherit;text-align:left;cursor:pointer;opacity:' + (e.visited ? 0.62 : 1),
        '<span style="flex:0 0 auto;font-size:18px">' + (CAT_ICON[e.cat] || '📍') + '</span>' +
        '<span style="flex:1 1 auto;min-width:0"><b style="display:block;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(e.name) + (promo ? ' <span style="color:#c0392b">🚩惠</span>' : '') + '</b>' +
        '<span style="display:block;font-size:11px;color:#8d8474;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(rt) + '</span></span>' +
        '<span style="flex:0 0 auto;font-size:12px;color:' + (e.visited ? '#8d8474' : '#b3432b') + ';font-family:ui-monospace,Menlo,monospace">' + (e.visited ? '✓ 已到' : '去这家') + '</span>');
      row.addEventListener('click', function () { close(); root.WZ.main.walkToShop({ id: e.id, name: e.name, poi: e.poi }); });
      rows.appendChild(row);
    });
    if (list.length > 120) rows.appendChild(el('div', 'font-size:12px;color:#8d8474;padding:6px', '还有 ' + (list.length - 120) + ' 家，地图上都能点'));
    if (!list.length) rows.appendChild(el('div', 'font-size:13px;color:#8d8474;padding:14px;text-align:center', '这个筛选下没有商家'));
    var cnt = box.querySelector('#ss-count');
    if (cnt) cnt.textContent = '共 ' + list0.length + ' 家 · 按评分排，没评分的在后面';
  }

  function open() {
    if (S.open) { close(); return; }
    var info = root.WZ.main.dayInfo && root.WZ.main.dayInfo();
    if (!info) return;
    var d = root.WZ.day.zoneOf(info.districtId);
    S.open = true; S.filter = 'all';
    var box = el('div');
    box.id = 'shop-sheet';
    box.style.cssText = 'position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0) + 112px);z-index:26;max-height:52vh;display:flex;flex-direction:column;margin:0 10px;background:linear-gradient(180deg,#fdf8ec,#f6eeda);border:2px solid #4a4133;border-radius:16px;box-shadow:0 10px 30px rgba(40,30,15,.3);overflow:hidden';
    var head = el('div', 'padding:10px 14px 6px;display:flex;align-items:baseline;justify-content:space-between;gap:8px',
      '<b style="font-size:15px;color:#33302a">' + esc(d ? d.name : '商圈') + ' 的商家</b>' +
      '<span id="ss-count" style="font-size:11px;color:#8d8474"></span>');
    box.appendChild(head);
    var filterRow = el('div', 'display:flex;gap:6px;padding:0 10px 8px;flex-wrap:wrap');
    CATS.forEach(function (c) {
      var fb = el('button', 'padding:4px 10px;border-radius:999px;border:1.5px solid #d8cbae;background:#fbf6ea;color:#8d8474;font:600 12px var(--font);cursor:pointer', c[1]);
      fb.type = 'button';
      fb.dataset.f = c[0];
      if (c[0] === 'all') { fb.style.borderColor = '#b3432b'; fb.style.background = '#fff4e4'; fb.style.color = '#33302a'; }
      fb.addEventListener('click', function () {
        S.filter = c[0];
        filterRow.querySelectorAll('button').forEach(function (x) {
          var on = x.dataset.f === S.filter;
          x.style.borderColor = on ? '#b3432b' : '#d8cbae';
          x.style.background = on ? '#fff4e4' : '#fbf6ea';
          x.style.color = on ? '#33302a' : '#8d8474';
        });
        render();
      });
      filterRow.appendChild(fb);
    });
    box.appendChild(filterRow);
    var rows = el('div', 'flex:1 1 auto;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 6px 10px');
    rows.id = 'ss-rows';
    box.appendChild(rows);
    var dock = document.getElementById('dock');
    dock.appendChild(box);
    S.el = box;
    render();
  }
  function close() {
    var box = document.getElementById('shop-sheet');
    if (box) box.remove();
    S.open = false; S.el = null;
  }

  root.WZ.shopsheet = { toggle: open, close: close };
})(typeof window !== 'undefined' ? window : globalThis);
