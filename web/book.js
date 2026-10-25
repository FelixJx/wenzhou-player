/* web/book.js —— 手册（10/24 升级 #5 #6 #7 #4 #9）
 *  · 排路线页：候选店铺（插旗推荐）+ 手册时间线（真实步行分钟 + 停留分钟 + 到达时刻 + 时间预算条，不含金钱）
 *  · 长按店铺卡 = 看推荐理由；长按后拖动 = 拖进手册（落点预览线）；手册里长按拖动 = 调整顺序
 *  · 出发键二次确认「这一天就这样定了吗？」
 *  · 出发后：手册常驻（横屏右侧 30%，竖屏 📖 抽屉），已到 ✓，未到可删/拖动/加站，实时重算
 *  · 横屏 3:7：地图 70% / 手册 30%（html.land）
 * 依赖：WZ.ui（ui._ 工具）、WZ.engine（walkMin/setPlan/focus/setPlanning）、WZ.advisor。
 */
window.WZ = window.WZ || {};
(function (WZ) {
  'use strict';
  var B = WZ.book = {};
  function U() { return WZ.ui._; }
  function E() { return WZ.engine; }
  function P(k, d) { var c = WZ.content && WZ.content.params; return c && c[k] != null ? c[k] : d; }
  function el(t, c, x) { return U().el(t, c, x); }
  function btn(l, c, f) { return U().btn(l, c, f); }
  function places() { return (WZ.content && WZ.content.places) || []; }
  function placeOf(id) { return places().filter(function (p) { return p.id === id; })[0] || null; }
  function homeId() { var h = places().filter(function (p) { return (p.types || []).indexOf('home') >= 0; })[0]; return h ? h.id : 'center'; }
  var TYPE_ICONS = { home: '🏠', rest: '🪑', food: '🍜', shop: '🛍️', sight: '🏞️', toilet: '🚻', lane: '🏮', stage: '🎭' };
  var FLAG_NAME = { red: '强推', orange: '可以去', yellow: '顺路' };

  // ---------- 横屏判定（3:7 布局） ----------
  function isLand() { return window.innerWidth > window.innerHeight * 1.15 && window.innerWidth >= 560; }
  B.isLand = isLand;
  function applyLayout() {
    var on = isLand(), root = document.documentElement;
    if (root.classList.contains('land') !== on) {
      root.classList.toggle('land', on);
      try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ }
      if (B._onLayout) B._onLayout(on);
    }
  }
  B.applyLayout = applyLayout;
  B.ratingText = function (p) { return WZ.ratingText ? WZ.ratingText(p) : ''; }; // PRD-v4 §2.3
  window.addEventListener('resize', function () { clearTimeout(B._lt); B._lt = setTimeout(applyLayout, 80); });
  window.addEventListener('orientationchange', function () { setTimeout(applyLayout, 200); });

  // ---------- 时间线计算：真实步行分钟 + 停留 + 排队，算到每站时刻与回家时刻 ----------
  function walk(a, b) { return E() && E().walkMin ? E().walkMin(a, b) : 10; }
  function stayOf(p, at) {
    var m = typeof p.stayMin === 'number' ? p.stayMin : P('stayMin', 32);
    if (m > 0 && p.queueMin && ((at >= 240 && at <= 360) || (at >= 600 && at <= 720))) m += p.queueMin;
    return m;
  }
  // route: 全部站；visited: 已到；clock: 当前游戏分钟；fromPlayer: 从玩家当前位置起算（出发后）
  B.compute = function (route, visited, clock, fromPlayer) {
    visited = visited || [];
    var t = clock || 0, prev = homeId(), items = [], first = true;
    route.forEach(function (id) {
      var p = placeOf(id); if (!p) return;
      var done = visited.indexOf(id) >= 0;
      if (done) { items.push({ id: id, p: p, done: true }); prev = id; return; }
      var w = (first && fromPlayer && E() && E().walkMinFromPlayer) ? E().walkMinFromPlayer(id) : walk(prev, id);
      first = false;
      t += w;
      var arrive = t, open = WZ.advisor ? WZ.advisor.isOpenAt(p, arrive) : true;
      var s = open ? stayOf(p, arrive) : 0;
      t += s;
      items.push({ id: id, p: p, walk: w, arrive: arrive, stay: s, leave: t, closed: !open });
      prev = id;
    });
    var back = walk(prev, homeId());
    if (first && fromPlayer && E() && E().walkMinFromPlayer) back = E().walkMinFromPlayer(homeId());
    t += back;
    var total = P('totalMin', 1024);
    return { items: items, back: back, endAt: t, used: t - (clock || 0), left: total - t, over: t > total, total: total, clock: clock || 0 };
  };

  function fmt(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; var h = Math.floor(min / 60), m = min % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; } // 纯分钟转钟点（fmtClock 会另加 07:00，这里不加）

  // ---------- 拖拽（长按 380ms 起拖；未长按前移动 = 滚动） ----------
  var zones = []; // { el, onDrop(id, index), indexAt(y) }
  var drag = null;
  function itemsOf(zone) { return Array.prototype.slice.call(zone.el.querySelectorAll('.tl-item:not(.done)')); }
  function zoneAt(x, y) {
    for (var i = 0; i < zones.length; i++) { var r = zones[i].el.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top - 20 && y <= r.bottom + 20 && r.width) return zones[i]; }
    return null;
  }
  function dropIndex(zone, y) {
    var its = itemsOf(zone), i;
    for (i = 0; i < its.length; i++) { var r = its[i].getBoundingClientRect(); if (y < r.top + r.height / 2) return { idx: i, ref: its[i] }; }
    return { idx: its.length, ref: null };
  }
  function clearPreview() { document.querySelectorAll('.drop-line').forEach(function (n) { n.parentNode && n.parentNode.removeChild(n); }); document.querySelectorAll('.book.drop-on').forEach(function (n) { n.classList.remove('drop-on'); }); }
  function preview(zone, y, id) {
    clearPreview();
    document.querySelectorAll('.bg-react').forEach(function (n) { n.textContent = ''; n.className = 'bg-react'; });
    if (!zone) return;
    zone.el.classList.add('drop-on');
    var d = dropIndex(zone, y), line = el('div', 'drop-line', '放这里 · ' + (d.ref ? '插在第 ' + (d.idx + 1) + ' 站' : '排到最后'));
    var list = zone.el.querySelector('.tl');
    if (d.ref) list.insertBefore(line, d.ref); else list.appendChild(line);
    // 提示词 7：受影响的游客头像冒出即时反应
    var h = zone.el._h || {};
    if (h.state && WZ.advisor && id) {
      var p = placeOf(id), op = p ? WZ.advisor.opinions(p, h.state, {}) : null;
      (h.state.guests || []).forEach(function (g) {
        var r = zone.el.querySelector('.bg-react[data-gid="' + g.id + '"]'); if (!r || !op) return;
        var nm = gname(g);
        if (op.likes.some(function (x) { return x.indexOf(nm) >= 0; })) { r.textContent = '😍'; r.className = 'bg-react pop'; }
        else if (op.dislikes.some(function (x) { return x.indexOf(nm) >= 0; })) { r.textContent = '😒'; r.className = 'bg-react pop'; }
      });
    }
  }
  function gname(g) { return g.name || g.tag; }
  B.dragSource = function (node, id, o) {
    o = o || {};
    var timer = 0, sx = 0, sy = 0, pid = null;
    function cancel() { clearTimeout(timer); timer = 0; }
    node.addEventListener('pointerdown', function (ev) {
      if (ev.button != null && ev.button !== 0) return;
      sx = ev.clientX; sy = ev.clientY; pid = ev.pointerId;
      cancel();
      timer = setTimeout(function () {
        timer = 0;
        node._longPressed = true;
        if (o.onPress) o.onPress(id);
        var label = (o.label && o.label()) || (placeOf(id) || {}).name || id;
        var ghost = el('div', 'drag-ghost', '📌 ' + label);
        document.body.appendChild(ghost);
        ghost.style.left = sx + 'px'; ghost.style.top = sy + 'px';
        drag = { id: id, ghost: ghost, from: o.from || 'cand', moved: false, node: node };
        node.classList.add('dragging');
        try { node.setPointerCapture(pid); } catch (e) { /* ignore */ }
        if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { /* ignore */ }
      }, o.ms || 380);
    });
    node.addEventListener('pointermove', function (ev) {
      if (timer && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 9) cancel();
      if (!drag || drag.node !== node) return;
      if (!drag.moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) { drag.moved = true; if (B._card && !B._card.contains(node)) closeShopCard(); }
      drag.ghost.style.left = ev.clientX + 'px'; drag.ghost.style.top = ev.clientY + 'px';
      preview(zoneAt(ev.clientX, ev.clientY), ev.clientY, id);
      if (ev.cancelable) ev.preventDefault();
    });
    // 拖动中禁止页面滚动（iOS 需要非 passive 的 touchmove）
    node.addEventListener('touchmove', function (ev) { if (drag && drag.node === node && ev.cancelable) ev.preventDefault(); }, { passive: false });
    function end(ev) {
      cancel();
      if (!drag || drag.node !== node) return;
      var d = drag; drag = null;
      node.classList.remove('dragging');
      if (d.ghost.parentNode) d.ghost.parentNode.removeChild(d.ghost);
      var z = d.moved && ev && ev.type === 'pointerup' ? zoneAt(ev.clientX, ev.clientY) : null;
      var idx = z ? dropIndex(z, ev.clientY).idx : -1;
      clearPreview();
      document.querySelectorAll('.bg-react').forEach(function (n) { n.textContent = ''; n.className = 'bg-react'; });
      if (z) z.onDrop(d.id, idx, d.from);
      else if (d.moved && d.from === 'book' && o.onDropOut) o.onDropOut(id); // 拖出手册（塞回地图）= 删除
      else if (o.onPressEnd) o.onPressEnd(id, d.moved);
    }
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
    // 长按触发后吃掉随后的 click（否则会顺带切换选中）
    node.addEventListener('click', function (ev) { if (node._longPressed) { node._longPressed = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
    node.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
  };

  // ---------- 手册（提示词 7）：上 = 当天竖向时间轴（站点格子高度按真实耗时）；中 = 游客头像 + 心情条 + 一句话；
  // 下 = 时间预算条（不含金钱）；可选 = 红色「出发」主按钮（提示词 6）
  // st = B.compute(...)；h: { editable, onRemove, onDrop, onTap, title, empty, state, guests, moods, reacts, goLabel, onGo }
  B.renderBook = function (host, st, h) {
    h = h || {};
    var box = host.querySelector('.book');
    if (!box) { box = el('div', 'book'); host.appendChild(box); zones.push({ el: box, onDrop: function (id, idx, from) { box._h.onDrop && box._h.onDrop(id, idx, from); } }); }
    box._h = h;
    while (box.firstChild) box.removeChild(box.firstChild);
    var head = el('div', 'book-head');
    head.appendChild(el('b', null, h.title || '📖 手册'));
    head.appendChild(el('span', 'book-sub', st.items.length ? '共 ' + st.items.length + ' 站 · 长按格子可拖动' : '还没排'));
    box.appendChild(head);
    // 上：时间轴
    var list = el('div', 'tl tl-axis');
    list.appendChild(el('div', 'tl-start', '07:00 从五马街游客中心出发'));
    if (!st.items.length) list.appendChild(el('div', 'tl-empty', h.empty || '把店铺拖到这里，或点一下加入'));
    var n = 0;
    st.items.forEach(function (it) {
      n += 1;
      var mins = it.done ? 0 : (it.walk || 0) + (it.stay || 0);
      var row = el('div', 'tl-item' + (it.done ? ' done' : '') + (it.closed ? ' closed' : ''));
      row.dataset.id = it.id;
      if (!it.done) row.style.minHeight = Math.round(Math.max(44, Math.min(96, 34 + mins * 0.3))) + 'px'; // 格子高度 ∝ 真实耗时
      row.appendChild(el('span', 'tl-time', it.done ? '✓' : fmt(it.arrive)));
      row.appendChild(el('span', 'tl-no', it.done ? '✓' : String(n)));
      var body = el('div', 'tl-body');
      body.appendChild(el('div', 'tl-name', (TYPE_ICONS[(it.p.types || [])[0]] || '📍') + ' ' + it.p.name));
      body.appendChild(el('div', 'tl-meta', it.done ? '已到' : '🚶 步行 ' + it.walk + ' 分钟 · 停 ' + it.stay + ' 分钟 · ' + fmt(it.leave) + ' 离开' + (it.closed ? ' · 🔒 到时没开门（' + it.p.hours + '）' : '')));
      if (h.reacts && h.reacts[it.id]) body.appendChild(el('div', 'tl-react', h.reacts[it.id]));
      row.appendChild(body);
      if (!it.done && h.editable) {
        var x = btn('×', 'tl-x', function (ev) { ev.stopPropagation(); h.onRemove && h.onRemove(it.id); });
        x.setAttribute('aria-label', '移出 ' + it.p.name);
        row.appendChild(x);
        B.dragSource(row, it.id, { from: 'book', onDropOut: function (id) { h.onRemove && h.onRemove(id); WZ.ui.toast('已移出：' + it.p.name); } });
      }
      row.addEventListener('click', function () { if (h.onTap) h.onTap(it.id); });
      list.appendChild(row);
    });
    if (st.items.length) list.appendChild(el('div', 'tl-home', '🏠 ' + fmt(st.endAt) + ' 回到游客中心（步行 ' + st.back + ' 分钟）'));
    box.appendChild(list);
    // 中：游客头像 + 心情条 + 一句话（2 行，超出点头像看全文）
    if (h.guests && h.guests.length) {
      var gs = el('div', 'book-guests');
      h.guests.forEach(function (g) {
        var cell = el('button', 'bg-cell'); cell.type = 'button';
        var av = U().avatar(g.tag); cell.appendChild(av);
        cell.appendChild(el('span', 'bg-react', '')).dataset.gid = g.id;
        var pc = Math.round(g.patience != null ? g.patience : 100);
        var bar = el('i', 'bg-bar'); var fill = el('b'); fill.style.width = pc + '%';
        fill.style.background = pc >= 50 ? '#57C79A' : pc >= 25 ? '#F2A03D' : '#E4553F';
        bar.appendChild(fill); cell.appendChild(bar);
        var m = (h.moods && h.moods[g.id]) || {};
        var tx = m.text || g.line || '';
        var t = el('span', 'bg-say' + (m.mood ? ' m-' + m.mood : ''), tx);
        cell.appendChild(t);
        if (Array.from(tx).length > 12) cell.appendChild(el('span', 'bg-full', '全文›')); // 超过 2 行：点头像看全文
        cell.addEventListener('click', function () { if (WZ.ui.showGuest) WZ.ui.showGuest(g, { onCalm: h.onCalm, preview: m.text }); });
        gs.appendChild(cell);
      });
      box.appendChild(gs);
    }
    // 下：时间预算条
    var bud = el('div', 'budget' + (st.over ? ' over' : ''));
    var bl = el('div', 'budget-k', '⏱ 时间');
    var bar2 = el('div', 'budget-bar');
    var used = el('i', 'b-used'), plan = el('i', 'b-plan');
    used.style.width = Math.min(100, st.clock / st.total * 100) + '%';
    plan.style.width = Math.max(0, Math.min(100 - Math.min(100, st.clock / st.total * 100), (Math.min(st.endAt, st.total) - st.clock) / st.total * 100)) + '%';
    bar2.appendChild(used); bar2.appendChild(plan);
    var brow = el('div', 'budget-row'); brow.appendChild(bl); brow.appendChild(bar2); bud.appendChild(brow);
    bud.appendChild(el('div', 'budget-txt', st.over
      ? '⚠ 超支：要到 ' + fmt(st.endAt) + ' 才能回到游客中心，超出 ' + Math.round(st.endAt - st.total) + ' 分钟'
      : '已排到 ' + fmt(st.endAt) + ' · 还剩 ' + Math.max(0, Math.round(st.left)) + ' 分钟'));
    box.appendChild(bud);
    if (h.onGo) {
      var go = btn(h.goLabel || '出发', 'book-go', function () { h.onGo(); });
      box.appendChild(go);
    }
    return box;
  };

  // ---------- 推荐理由 / 店铺卡 ----------
  B.flagPill = function (f) {
    if (!f) return null;
    var s = el('span', 'flag-pill f-' + f.level, '🚩' + FLAG_NAME[f.level]);
    return s;
  };
  // ctx: { flag, inRoute, onToggle, onClose, eta }
  // 店铺小卡（提示词 7 + 2）：店名、真实耗时、口碑一句话、队里谁会喜欢 / 谁会嫌、「拖到手册」把手；
  // 文字多时卡片向上生长，正文最多 4 行，超出出「展开全文」
  // ctx: { flag, inRoute, walk, onToggle(id), host, state, toggleLabel }
  B.shopCard = function (p, ctx) {
    ctx = ctx || {};
    closeShopCard();
    var c = el('div', 'shop-card');
    c.setAttribute('role', 'dialog');
    var head = el('div', 'sc-head');
    head.appendChild(el('span', 'sc-ico', TYPE_ICONS[(p.types || [])[0]] || '📍'));
    head.appendChild(el('b', 'sc-name', p.name));
    var fp = B.flagPill(ctx.flag); if (fp) head.appendChild(fp);
    var x = btn('×', 'sc-x', closeShopCard); head.appendChild(x);
    c.appendChild(head);
    var f = (p.real && p.real.info) || {};
    var stay = typeof p.stayMin === 'number' ? p.stayMin : P('stayMin', 32);
    c.appendChild(el('div', 'sc-time', '⏱ 真实耗时：' + (ctx.walk != null ? '步行 ' + ctx.walk + ' 分钟 + ' : '') + '停留 ' + stay + ' 分钟' + (p.queueMin ? '（饭点再排队约 ' + p.queueMin + ' 分钟）' : '')));
    var word = [];
    if (f.rating) word.push((f.ratingSrc || '点评') + ' ' + Number(f.rating).toFixed(1) + '分' + (f.reviews ? '，' + f.reviews + ' 人评过' : ''));
    else if (WZ.ratingText) { var rtl = WZ.ratingText(p); if (rtl && rtl.indexOf('宁空勿编') < 0) word.push(rtl); } // PRD-v4 §2.3：三平台合并回退
    if (f.sign) word.push(f.sign);
    if (f.statusNote) word.push('⚠ ' + f.statusNote);
    c.appendChild(el('div', 'sc-word', '💬 口碑：' + (word.join(' · ') || '暂无平台评分（宁空勿编）')));
    var body = el('div', 'sc-body clamp4');
    if (ctx.state && WZ.advisor) {
      var op = WZ.advisor.opinions(p, ctx.state, { walkMin: function () { return ctx.walk || 0; } });
      body.appendChild(el('div', 'sc-like', '👍 谁会喜欢：' + (op.likes.join('；') || '暂时没人特别想去')));
      body.appendChild(el('div', 'sc-dislike', '👎 谁会嫌：' + (op.dislikes.join('；') || '没人反对')));
    }
    if (ctx.flag && ctx.flag.reasons && ctx.flag.reasons.length) body.appendChild(el('div', 'sc-why1', '🚩 ' + WZ.advisor.flagSentence(ctx.flag)));
    var facts = U().realFacts ? U().realFacts(p) : '';
    if (facts) body.appendChild(el('div', 'sc-facts', facts));
    c.appendChild(body);
    var more = btn('展开全文', 'sc-more', function () { body.classList.toggle('clamp4'); more.textContent = body.classList.contains('clamp4') ? '展开全文' : '收起'; });
    c.appendChild(more);
    var acts = el('div', 'sc-acts');
    if (ctx.onToggle) {
      var b = btn(ctx.toggleLabel || (ctx.inRoute ? '从手册移出' : '加进手册'), ctx.inRoute ? 'btn-ghost' : 'btn-primary', function () { closeShopCard(); ctx.onToggle(p.id); });
      acts.appendChild(b);
      if (!ctx.inRoute) {
        var handle = el('div', 'sc-handle', '✋ 拖到手册');
        handle.setAttribute('role', 'button');
        B.dragSource(handle, p.id, { from: 'card', ms: 120 });
        acts.appendChild(handle);
      }
    }
    c.appendChild(acts);
    (ctx.host || document.getElementById('app')).appendChild(c);
    B._card = c;
    requestAnimationFrame(function () { if (body.scrollHeight <= body.clientHeight + 2) more.style.display = 'none'; });
    // 点卡片外面 = 收起（拖动中不收）
    setTimeout(function () {
      function away(ev) { if (!B._card || B._card !== c) { document.removeEventListener('pointerdown', away, true); return; } if (!c.contains(ev.target) && !drag) { document.removeEventListener('pointerdown', away, true); closeShopCard(); } }
      document.addEventListener('pointerdown', away, true);
    }, 0);
    return c;
  };
  function closeShopCard() { if (B._card && B._card.parentNode) B._card.parentNode.removeChild(B._card); B._card = null; }
  B.closeShopCard = closeShopCard;

  // ---------- 确认框 ----------
  B.confirm = function (host, o, cb) {
    var mask = el('div', 'confirm-mask');
    var d = el('div', 'confirm');
    d.setAttribute('role', 'alertdialog');
    d.appendChild(el('h3', null, o.title));
    if (o.text) d.appendChild(el('p', 'confirm-text', o.text));
    var row = el('div', 'btn-row');
    row.appendChild(btn(o.no || '再看看', 'btn-ghost', function () { close(); cb(false); }));
    row.appendChild(btn(o.yes || '确定', 'btn-primary', function () { close(); cb(true); }));
    d.appendChild(row);
    mask.appendChild(d);
    function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
    (host || document.getElementById('app')).appendChild(mask);
    return mask;
  };

  // ========== 排路线页（替换 ui.showRoutePlanner） ==========
  // opts: { places, guests, preview(ids), state }
  B.planner = function (opts, onConfirm) {
    opts = opts || {};
    var ui = WZ.ui, _ = U();
    var MIN = P('routeMin', 4), MAX = P('routeMax', 24), FILL = P('planFillMin', 920), TOTAL = P('totalMin', 1024);
    var cand = (opts.places || places()).filter(function (p) { return !(p.types || []).some(function (t) { return t === 'home' || t === 'toilet'; }); });
    var guests = opts.guests || [];
    var state = opts.state || { guests: guests, clockMin: 0, visited: [], route: [] };
    var chosen = [];
    var flags = {};

    var pg = _.el('div', 'page page-plan');
    pg.setAttribute('role', 'dialog');
    pg.appendChild(el('h2', null, '出发前排个路线'));
    var guide = el('p', 'hint guide-line');
    pg.appendChild(guide);

    var moods = {}, MOOD = { happy: '😊', worry: '😟', neutral: '😐' };

    var body = el('div', 'plan-body');
    var listWrap = el('div', 'cand-wrap');
    var ct = el('div', 'cand-title', '温州真实店铺 · 🚩 = 队伍现在最想去');
    var mapBtn = el('button', 'btn small plan-mapbtn', '🗺 地图上看旗');
    ct.appendChild(mapBtn); listWrap.appendChild(ct);
    // 竖屏：切到「地图模式」——上半屏是真实温州地图（旗子 + 高德店铺图钉），下半屏是手册
    var backBtn = el('button', 'btn small plan-backbtn', '☰ 回店铺列表');
    function mapMode(on) {
      var ov = document.getElementById('overlay'), was = ov.classList.contains('ov-map');
      ov.classList.toggle('ov-map', !!on);
      var S0 = E() && E().getState ? E().getState() : null;
      if (on && !was && S0 && E().panBy) { // 拉远一点看整片老城，游客中心放在上半屏中间
        E().focus(null); mapMode.z0 = S0.cam.zoom; E().zoomBy(0.7, S0.view.w / 2, S0.view.h / 2); E().panBy(0, -S0.view.h * 0.2);
      }
      if (!on && was && S0) { if (mapMode.z0) E().zoomBy(mapMode.z0 / S0.cam.zoom, S0.view.w / 2, S0.view.h / 2); if (E().recenter) E().recenter(); }
      closeShopCard();
    }
    pg.insertBefore(backBtn, guide);
    mapBtn.onclick = function () { mapMode(true); if (ui.toast) ui.toast('点地图上的店名或旗子 → 看店铺卡、加进手册'); };
    backBtn.onclick = function () { mapMode(false); };
    var list = el('div', 'place-list scroll');
    list.setAttribute('role', 'group');
    var cards = {};
    // 区域→商圈（10/25）：候选列表按真实地理商圈分组筛选——先挑片区，再挑店
    function regionOfPlace(p) {
      if (p.region) return p.region;
      var regs = (WZ.content.params && WZ.content.params.regions) || [];
      for (var i = 0; i < regs.length; i++) {
        var r = regs[i];
        if (r.w > 0 && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r.name;
      }
      return regs.length ? regs[regs.length - 1].name : '其他';
    }
    var regionFilter = '';
    var chipRow = el('div', 'region-chips');
    chipRow.setAttribute('role', 'group');
    var regionNames = [];
    cand.forEach(function (p) { var rn = regionOfPlace(p); if (regionNames.indexOf(rn) < 0) regionNames.push(rn); });
    [''].concat(regionNames).forEach(function (rn) {
      var chip = el('button', 'region-chip' + (rn === '' ? ' on' : ''), rn === '' ? '全部商圈' : rn);
      chip.type = 'button';
      chip.addEventListener('click', function () {
        regionFilter = rn;
        chipRow.querySelectorAll('.region-chip').forEach(function (c) { c.classList.toggle('on', c === chip); });
        applyFilter();
      });
      chipRow.appendChild(chip);
    });
    listWrap.appendChild(chipRow);
    function applyFilter() {
      cand.forEach(function (p) {
        var c = cards[p.id]; if (!c) return;
        c.b.style.display = (!regionFilter || regionOfPlace(p) === regionFilter) ? '' : 'none';
      });
    }
    function walkFrom(id) { var last = chosen.length ? chosen[chosen.length - 1] : homeId(); return last === id ? 0 : walk(last, id); }
    function toggle(id) {
      var i = chosen.indexOf(id);
      if (i >= 0) chosen.splice(i, 1);
      else if (chosen.length >= MAX) { ui.toast('手册最多排 ' + MAX + ' 站'); return; }
      else chosen.push(id);
      refresh();
    }
    function insertAt(id, idx) {
      var i = chosen.indexOf(id);
      if (i >= 0) { chosen.splice(i, 1); if (i < idx) idx -= 1; }
      else if (chosen.length >= MAX) { ui.toast('手册最多排 ' + MAX + ' 站'); return; }
      chosen.splice(Math.max(0, Math.min(chosen.length, idx)), 0, id);
      refresh();
    }
    function showCard(id) {
      var p = placeOf(id); if (!p) return;
      if (E() && E().focus && !document.getElementById('overlay').classList.contains('ov-map')) E().focus(id);
      B.shopCard(p, { flag: flags[id], inRoute: chosen.indexOf(id) >= 0, walk: walkFrom(id), onToggle: toggle, state: state, host: isLand() || document.getElementById('overlay').classList.contains('ov-map') ? document.getElementById('app') : pg });
    }
    cand.forEach(function (p) {
      var b = el('button', 'place'); b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.appendChild(el('span', 'place-ico', TYPE_ICONS[(p.types || [])[0]] || '📍'));
      var pb = el('div', 'place-body');
      var nm = el('span', 'place-name', p.name || p.id);
      pb.appendChild(nm);
      var meta = regionOfPlace(p) + ' · ' + (p.types || []).map(function (t) { return (P('typeNames', {})[t]) || t; }).join(' · ') + ' · 停 ' + (p.stayMin != null ? p.stayMin : P('stayMin', 32)) + ' 分钟';
      var mm = el('span', 'place-meta', meta); pb.appendChild(mm);
      var facts = _.realFacts ? _.realFacts(p) : '';
      if (facts) pb.appendChild(el('span', 'place-meta place-real', facts));
      var why = el('span', 'place-why'); pb.appendChild(why);
      b.appendChild(pb);
      b.appendChild(el('span', 'place-no', ''));
      b.addEventListener('click', function () { toggle(p.id); });
      B.dragSource(b, p.id, { from: 'cand', onPress: function () { showCard(p.id); }, onPressEnd: function () { /* 只长按不拖：卡片留着看理由 */ } });
      cards[p.id] = { b: b, why: why, meta: mm };
      list.appendChild(b);
    });
    listWrap.appendChild(list);
    body.appendChild(listWrap);
    var bookHost = el('div', 'book-host');
    body.appendChild(bookHost);
    pg.appendChild(body);

    // 提示词 6：排好了就静止，不自动出发；「出发」在手册底部，始终可点，点了先确认
    function depart() {
      if (chosen.length < MIN) { ui.toast('至少排 ' + MIN + ' 站再出发'); return; }
      var st = B.compute(chosen, [], 0, false);
      var names = chosen.map(function (id) { return (placeOf(id) || {}).name; }).join(' → ');
      B.confirm(pg, {
        title: '这一天就这样定了吗？',
        text: names + '\n预计 ' + fmt(st.endAt) + ' 回到游客中心（用时 ' + st.total + ' / ' + TOTAL + ' 分钟' + (st.total > TOTAL ? '，超时结算 −10' : '') + '）。',
        no: '再看看', yes: '就这么走'
      }, function (ok) {
        if (!ok) return;
        // 记下出发时各站「当时游客的表态」，路线单里一直显示
        B.planReacts = {};
        chosen.forEach(function (id) {
          var p = placeOf(id), op = p && WZ.advisor ? WZ.advisor.opinions(p, state, {}) : null;
          if (op && (op.likes.length || op.dislikes.length)) B.planReacts[id] = (op.likes.length ? '😊 ' + op.likes.map(function (x) { return x.split('：')[0]; }).join(' ') : '') + (op.dislikes.length ? '  😒 ' + op.dislikes.filter(function (x) { return x.indexOf('🔒') < 0; }).map(function (x) { return x.split('：')[0]; }).join(' ') : '');
        });
        cleanup();
        onConfirm && onConfirm(chosen.slice());
      });
    }

    function refresh() {
      // 游客实时表态
      var pre = [];
      try { pre = (typeof opts.preview === 'function' && opts.preview(chosen.slice())) || []; } catch (e) { pre = []; }
      moods = {};
      guests.forEach(function (g) {
        var item = pre.filter(function (x) { return x && x.guestId === g.id; })[0];
        var mood = (item && item.mood) || 'neutral';
        moods[g.id] = { mood: mood, text: (MOOD[mood] || '') + ' ' + ((item && item.text) || g.line || '') };
      });
      // 插旗：队伍口味 + 真实营业时间/评分，选中变化后实时重算
      var st0 = Object.assign({}, state, { visited: chosen.slice(), clockMin: 0 });
      // 插旗范围 = 精选地点 + 游客中心附近的高德真实店铺
      var h0 = placeOf(homeId()) || { x: 0, y: 0 };
      var near = WZ.poiPlaces ? WZ.poiPlaces(h0.x, h0.y, 700) : [];
      var nearById = {}; near.forEach(function (q) { nearById[q.id] = q; });
      flags = WZ.advisor ? WZ.advisor.flags(st0, cand.concat(near), { walkMin: function (id) {
        var q = nearById[id]; if (!q) return walkFrom(id);
        return Math.round(Math.hypot(q.x - h0.x, q.y - h0.y) * 1.3 / ((P('engine', {}).playerSpeed) || 190) * P('minPerSec', 4));
      } }) : {};
      cand.forEach(function (p) {
        var c = cards[p.id], idx = chosen.indexOf(p.id), f = flags[p.id];
        c.b.setAttribute('aria-pressed', idx >= 0 ? 'true' : 'false');
        c.b.querySelector('.place-no').textContent = idx >= 0 ? String(idx + 1) : '';
        c.b.dataset.flag = f && idx < 0 ? f.level : '';
        while (c.why.firstChild) c.why.removeChild(c.why.firstChild);
        if (f && idx < 0) { c.why.appendChild(B.flagPill(f)); c.why.appendChild(document.createTextNode(' ' + (f.reasons[0] || ''))); }
      });
      // 红旗排前面
      var order = cand.slice().sort(function (a, b) {
        var r = { red: 0, orange: 1, yellow: 2 }, fa = flags[a.id], fb = flags[b.id];
        var ia = chosen.indexOf(a.id) >= 0 ? -1 : (fa ? r[fa.level] : 3), ib = chosen.indexOf(b.id) >= 0 ? -1 : (fb ? r[fb.level] : 3);
        return ia - ib;
      });
      var st0p = list.scrollTop; order.forEach(function (p) { list.appendChild(cards[p.id].b); }); list.scrollTop = st0p;
      applyFilter(); // 区域筛选在重排后仍然生效（10/25）
      var st = B.compute(chosen, [], 0, false);
      // 10/25：出发键实时显示「填满一天」进度——≥920 且 ≤1024 才放行
      var goLabel;
      if (st.endAt > TOTAL) goLabel = '出发（用 ' + st.total + ' / ' + TOTAL + '，超时 −10）';
      else if (st.endAt < FILL) goLabel = '出发（用 ' + st.total + ' / ' + TOTAL + '，也可再加站）';
      else goLabel = '出发（一天排满 ' + st.total + ' / ' + TOTAL + '）';
      B.renderBook(bookHost, st, {
        editable: true, title: '📖 手册（' + chosen.length + ' 站 · 已排到 ' + fmt(st.endAt) + '）',
        onRemove: function (id) { toggle(id); },
        onDrop: function (id, idx) { closeShopCard(); insertAt(id, idx); },
        onTap: function (id) { showCard(id); },
        empty: '点上面的店加入；或长按拖到这里',
        state: state, guests: guests, moods: moods, onGo: depart, goLabel: goLabel
      });
      var g = WZ.advisor ? WZ.advisor.guide(state, cand, { phase: 'plan', planCount: chosen.length, routeMin: MIN, routeMax: MAX,
        planTypes: [].concat.apply([], chosen.map(function (id) { return (placeOf(id) || {}).types || []; })) }) : { tip: '' };
      guide.textContent = g.tip;
      if (chosen.length >= MIN && _.spotlight) setTimeout(function () { _.spotlight('go', '.book-go', '排好了就点「出发」——点之前随时能改'); }, 350);
      if (E() && E().setPlan) E().setPlan({ route: chosen, visited: [], flags: flags, planning: true });
    }

    // 横屏：地图在左边 70%，点地图上的店 = 打开店铺卡
    function cleanup() {
      closeShopCard();
      if (E() && E().setPlanning) E().setPlanning(null);
      if (E() && E().focus) E().focus(null);
      document.getElementById('overlay').classList.remove('ov-side', 'ov-map');
      B._onLayout = null; B._planner = null;
    }
    function layout(on) { document.getElementById('overlay').classList.toggle('ov-side', on); }
    if (E() && E().setPlanning) E().setPlanning(function (pid) { var p = placeOf(pid); if (p) showCard(pid); });
    B._planner = { showCard: showCard, toggle: toggle };
    B._onLayout = layout;
    _.setOverlay(pg);
    layout(isLand());
    refresh();
    if (_.spotlight) setTimeout(function () { _.spotlight('route', '.page-plan .place', '长按店铺卡，拖进下面的手册；点一下也能加入'); }, 700);
    return pg;
  };

  // ========== 出发后：常驻手册（横屏右栏 / 竖屏抽屉） ==========
  var side = null, runRef = null, hooks = null, lastKey = '';
  function ensureSide() {
    if (side) return side;
    side = el('div', 'side-book');
    side.id = 'side';
    var top = el('div', 'side-top');
    var t = el('b', null, '📖 手册');
    var close = btn('收起', 'side-close', function () { B.toggle(false); });
    top.appendChild(t); top.appendChild(close);
    side.appendChild(top);
    side.appendChild(el('div', 'side-guide'));
    side.appendChild(el('div', 'side-book-host'));
    // 竖屏：右缘中部半露的书签（20px 宽，竖排「手册」），点开从右侧滑出；右滑/下滑收起
    var tab = el('button', 'book-tab', '手册'); tab.type = 'button'; tab.id = 'book-tab';
    tab.addEventListener('click', function () { B.toggle(); });
    document.getElementById('app').appendChild(tab);
    var sx0 = 0, sy0 = 0;
    side.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx0 = t.clientX; sy0 = t.clientY; }, { passive: true });
    side.addEventListener('touchend', function (e) { var t = e.changedTouches[0]; if (t.clientX - sx0 > 70 || (t.clientY - sy0 > 90 && side.scrollTop <= 0)) B.toggle(false); }, { passive: true });
    var add = btn('＋ 加一站', 'btn-ghost side-add', function () { openAdd(); });
    side.appendChild(add);
    side.appendChild(el('div', 'side-add-list'));
    document.getElementById('app').appendChild(side);
    return side;
  }
  B.toggle = function (on) {
    ensureSide();
    if (on == null) on = !side.classList.contains('open');
    side.classList.toggle('open', !!on);
    if (on) B.refresh(true);
  };
  B.mount = function (run, h) {
    runRef = run; hooks = h || {};
    ensureSide();
    side.hidden = false;
    var tb = document.getElementById('book-tab'); if (tb) tb.hidden = false;
    side.classList.remove('open');
    side.querySelector('.side-add-list').innerHTML = '';
    lastKey = '';
    B.refresh(true);
  };
  B.unmount = function () { if (side) { side.hidden = true; side.classList.remove('open'); } var tb = document.getElementById('book-tab'); if (tb) tb.hidden = true; runRef = null; closeShopCard(); };
  function setRoute(ids) {
    if (!runRef) return;
    var st = runRef.state;
    var kept = st.route.filter(function (id) { return st.visited.indexOf(id) >= 0; });
    var next = kept.concat(ids.filter(function (id) { return kept.indexOf(id) < 0; }));
    if (hooks.onReplan) hooks.onReplan(next);
    B.refresh(true);
  }
  function remaining() { var st = runRef.state; return st.route.filter(function (id) { return st.visited.indexOf(id) < 0; }); }
  function openAdd() {
    var box = side.querySelector('.side-add-list');
    if (box.childNodes.length) { box.innerHTML = ''; return; }
    var st = runRef.state;
    var fl = WZ.advisor ? WZ.advisor.flags(st, places(), { walkMin: function (id) { return E().walkMinFromPlayer ? E().walkMinFromPlayer(id) : 0; } }) : {};
    var cands = places().filter(function (p) { return !(p.types || []).some(function (t) { return t === 'home' || t === 'toilet'; }) && st.route.indexOf(p.id) < 0; })
      .sort(function (a, b) { var r = { red: 0, orange: 1, yellow: 2 }; return (fl[a.id] ? r[fl[a.id].level] : 3) - (fl[b.id] ? r[fl[b.id].level] : 3); });
    cands.forEach(function (p) {
      var b = el('button', 'add-item'); b.type = 'button';
      var f = fl[p.id];
      if (f) b.appendChild(B.flagPill(f));
      b.appendChild(el('span', 'add-name', ' ' + p.name));
      b.appendChild(el('span', 'add-meta', '🚶 ' + (E().walkMinFromPlayer ? E().walkMinFromPlayer(p.id) : '?') + ' 分钟 · 停 ' + (p.stayMin || 0) + ' 分钟' + (f && f.reasons[0] ? ' · ' + f.reasons[0] : '')));
      b.addEventListener('click', function () { box.innerHTML = ''; setRoute(remaining().concat([p.id])); WZ.ui.toast('已加入：' + p.name); });
      B.dragSource(b, p.id, { from: 'cand' });
      box.appendChild(b);
    });
  }
  B.refresh = function (force) {
    if (!runRef || !side || side.hidden) return;
    var st = runRef.state;
    var key = st.route.join() + '|' + st.visited.join() + '|' + Math.floor(st.clockMin / 2) + '|' + st.guests.map(function (g) { return Math.round(g.patience / 5); }).join();
    if (!force && key === lastKey) return;
    lastKey = key;
    var comp = B.compute(st.route, st.visited, st.clockMin, true);
    B.renderBook(side.querySelector('.side-book-host'), comp, {
      editable: true, title: '路线（已到 ✓）',
      onRemove: function (id) { setRoute(remaining().filter(function (x) { return x !== id; })); },
      onDrop: function (id, idx) { var r = remaining().filter(function (x) { return x !== id; }); r.splice(Math.max(0, Math.min(r.length, idx)), 0, id); setRoute(r); },
      onTap: function (id) { var p = placeOf(id); if (p) { if (E().focus) E().focus(id); B.shopCard(p, { flag: null, state: st, walk: E().walkMinFromPlayer ? E().walkMinFromPlayer(id) : null, host: document.getElementById('app') }); } },
      empty: '路线走完了：加一站，或回游客中心',
      state: st, guests: st.guests, reacts: B.planReacts || {}, onCalm: hooks && hooks.onCalm
    });
    if (hooks && hooks.onComputed) hooks.onComputed(comp);
  };
  B.setGuide = function (g) {
    if (!side) return;
    var box = side.querySelector('.side-guide');
    box.textContent = g && g.tip ? g.tip : '';
  };

// ========== 排一天（PRD-v4 §3.3 商圈带队）：选商圈 → 实时时间轴 → 900~1024 出发（10/25） ==========
// opts: { guests }；onConfirm(plan)——plan = [{ id, stay }] 商圈链（有序，含每圈停留分钟）
var DAY_CAT = { food: '🍜 小吃', cafe: '☕ 茶饮', shop: '🛍️ 手信', sight: '🏞️ 看点', rest: '🪑 歇脚', stage: '🎭 戏台', lane: '🏮 小巷' };
B.dayPlanner = function (opts, onConfirm) {
  opts = opts || {};
  var ui = WZ.ui, _ = U();
  var guests = opts.guests || [];
  var NEED = WZ.advisor ? WZ.advisor.NEED : {};
  var D = (WZ.content.districts || []).slice();
  var plan = []; // [{ id, stay }]
  var TOTAL = P('totalMin', 1024);

  var pg = _.el('div', 'page page-plan page-day');
  pg.setAttribute('role', 'dialog');
  pg.appendChild(_.el('h2', null, '排一天：先选商圈'));
  pg.appendChild(_.el('p', 'hint', '点卡片把商圈加进行程（再点取消）。进圈之后还能在圈里随便点店。'));

  var cardsWrap = _.el('div', 'day-cards');

  var body = _.el('div', 'plan-body');
  var listWrap = _.el('div', 'cand-wrap');
  listWrap.appendChild(_.el('div', 'cand-title', '📖 一天的手册（商圈间路程按真实距离估算）'));
  var tl = _.el('div', 'day-tl');
  listWrap.appendChild(tl);
  body.appendChild(listWrap);
  // 整页放进滚动容器：卡片多时「出发」按钮仍能滚到（10/25 玩不了修复）
  var scroll = _.el('div', 'scroll');
  scroll.appendChild(cardsWrap);
  scroll.appendChild(body);
  pg.appendChild(scroll);

  function districtPlaces(d) { return WZ.day.districtPlaces(d); } // 互斥归属（10/25）
  function catCounts(inD) {
    var c = {};
    inD.forEach(function (p) { (p.types || []).forEach(function (t) { if (t !== 'home' && t !== 'toilet') c[t] = (c[t] || 0) + 1; }); });
    return c;
  }
  function topRated(inD) {
    return inD.filter(function (p) { return p.real && p.real.info && p.real.info.rating; })
      .sort(function (a, b) { return b.real.info.rating - a.real.info.rating; }).slice(0, 3)
      .map(function (p) { return p.name.replace(/[（(].*?[)）]/g, ''); });
  }
  function fitOf(d) {
    var inD = districtPlaces(d), ok = [], no = [];
    guests.forEach(function (g) {
      var need = NEED[g.tag];
      if (!need || g.tag === 'any') return;
      var hit = inD.some(function (p) { return need.some(function (t) { return (p.types || []).indexOf(t) >= 0; }); });
      (hit ? ok : no).push(g.name || g.tag);
    });
    return { ok: ok, no: no };
  }
  function compute() { return WZ.day.computePlan(plan.map(function (x) { return { id: x.id, stay: x.stay }; })); }

  function renderCards() {
    cardsWrap.innerHTML = '';
    D.forEach(function (d) {
      var i = plan.map(function (x) { return x.id; }).indexOf(d.id);
      var inD = districtPlaces(d);
      var cc = catCounts(inD);
      var top = topRated(inD);
      var fit = fitOf(d);
      var stayCur = i >= 0 ? plan[i].stay : d.stayDefault;
      var card = _.el('div', 'day-card' + (i >= 0 ? ' on' : ''));
      card.setAttribute('data-z', d.id);
      var head = _.el('div', 'dc-head');
      head.appendChild(_.el('b', null, d.name));
      head.appendChild(_.el('span', 'dc-kind', d.kind + (d.car ? ' · 需坐车' : ' · 步行可达')));
      card.appendChild(head);
      card.appendChild(_.el('div', 'dc-blurb', d.blurb || ''));
      var stats = _.el('div', 'dc-stats');
      stats.appendChild(_.el('span', null, '共 ' + inD.length + ' 处'));
      Object.keys(cc).forEach(function (t) { stats.appendChild(_.el('span', null, (DAY_CAT[t] || ('📍 ' + t)) + ' ' + cc[t])); });
      if (top.length) stats.appendChild(_.el('span', 'dc-top', '⭐ ' + top.join('、')));
      card.appendChild(stats);
      var fitEl = _.el('div', 'dc-fit');
      if (fit.ok.length) fitEl.appendChild(_.el('span', 'dc-ok', '😊 ' + fit.ok.join('、')));
      if (fit.no.length) fitEl.appendChild(_.el('span', 'dc-no', '😟 ' + fit.no.join('、') + ' 可能不尽兴'));
      card.appendChild(fitEl);
      var stepper = _.el('div', 'dc-stay');
      stepper.appendChild(_.el('span', null, '预计停留'));
      var minus = _.el('button', 'dc-step', '−'); minus.type = 'button'; minus.setAttribute('data-d', '-30'); minus.setAttribute('data-z', d.id);
      stepper.appendChild(minus);
      stepper.appendChild(_.el('b', 'dc-stay-n', stayCur + ' 分'));
      var plus = _.el('button', 'dc-step', '+'); plus.type = 'button'; plus.setAttribute('data-d', '30'); plus.setAttribute('data-z', d.id);
      stepper.appendChild(plus);
      card.appendChild(stepper);
      if (i >= 0) card.appendChild(_.el('div', 'dc-order', '已排 · 第 ' + (i + 1) + ' 站'));
      card.addEventListener('click', function (e) {
        if (e.target && e.target.classList.contains('dc-step')) return;
        var idx = plan.map(function (x) { return x.id; }).indexOf(d.id);
        if (idx >= 0) plan.splice(idx, 1);
        else plan.push({ id: d.id, stay: d.stayDefault });
        renderCards(); renderTl();
      });
      cardsWrap.appendChild(card);
    });
    Array.prototype.forEach.call(cardsWrap.querySelectorAll('.dc-step'), function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = b.getAttribute('data-z'), d = D.filter(function (x) { return x.id === id; })[0];
        var it = plan.filter(function (x) { return x.id === id; })[0];
        if (!it) it = { id: id, stay: d.stayDefault }, plan.push(it);
        it.stay = Math.max(30, Math.min(420, it.stay + Number(b.getAttribute('data-d'))));
        renderCards(); renderTl();
      });
    });
  }
  function renderTl() {
    var c = compute();
    tl.innerHTML = '';
    var t0 = WZ.day.START;
    c.legs.forEach(function (leg) {
      if (leg.type === 'move') {
        var mv = _.el('div', 'daytl-move', (leg.back ? '🏠 回' : '') + (leg.mode === '坐车' ? '🚌 坐车' : '🚶 步行') + ' ' + leg.min + ' 分钟 · ' + fmt(leg.at));
        tl.appendChild(mv);
      } else {
        var row = _.el('div', 'daytl-stop');
        row.appendChild(_.el('b', null, leg.zone.name));
        row.appendChild(_.el('span', null, fmt(leg.at) + ' 到 · 停 ' + leg.stay + ' 分 · ' + fmt(leg.at + leg.stay) + ' 离开'));
        tl.appendChild(row);
      }
    });
    if (!c.legs.length) tl.appendChild(_.el('div', 'muted small', '还没选商圈。'));
    var go = document.querySelector('.day-go');
    if (go) {
      go.disabled = !c.canDepart;
      go.textContent = c.canDepart ? '出发（玩满 ' + fmt(c.end) + ' / 1024）' : c.reason;
    }
  }

  var foot = _.el('div', 'plan-foot');
  var go = _.btn('先选至少一个商圈', 'btn-primary btn-block day-go', function () {
    var c = compute();
    if (!c.canDepart) { if (ui.toast) ui.toast(c.reason); return; }
    ui.hide(); // 收起选商圈页（setOverlay(null) 会 throw）
    onConfirm && onConfirm(plan.map(function (x) { return { id: x.id, stay: x.stay }; }));
  });
  go.disabled = true;
  foot.appendChild(go);
  pg.appendChild(foot);

  _.setOverlay(pg);
  renderCards(); renderTl();
};
})(window.WZ);