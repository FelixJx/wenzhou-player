/* 温州玩家 · 1024分钟 —— 流程 UI（W3）
   实现契约 §5 的 WZ.ui（showEnding 在 ending.js）。
   DOM 覆盖层叠在 <canvas id="game"> 之上；canvas 由 engine 接管，这里只负责 HTML 层。 */
window.WZ = window.WZ || {};
(function (WZ) {
  'use strict';

  var ui = WZ.ui = WZ.ui || {};

  // ---------- 常量：标签 / 地点类型 ----------
  var TAGS = {
    walk:   { name: '走不动', icon: '🚶', color: '#5bc0eb', fallback: '一天走了两万步' },
    food:   { name: '吃不惯', icon: '🍜', color: '#f2a541', fallback: '吃不惯外地口味' },
    crowd:  { name: '怕挤挤', icon: '😣', color: '#9b5de5', fallback: '人一多就头晕' },
    shop:   { name: '买买买', icon: '🛍️', color: '#f15bb5', fallback: '没时间买手信' },
    bored:  { name: '没劲儿', icon: '🥱', color: '#8d99ae', fallback: '景点都长一样' },
    rush:   { name: '催催催', icon: '⏱️', color: '#ef476f', fallback: '时间太赶了' },
    toilet: { name: '憋不住', icon: '🚻', color: '#06d6a0', fallback: '找不到厕所' },
    any:    { name: '都行哥', icon: '😌', color: '#ffd166', fallback: '随便，都行', display: '随便，都行' }
  };
  var TAG_ORDER = ['walk', 'food', 'crowd', 'shop', 'bored', 'rush', 'toilet', 'any'];

  var TYPE_ICONS = { home: '🏠', rest: '🪑', food: '🍜', shop: '🛍️', sight: '🏞️', toilet: '🚻', lane: '🏮', stage: '🎭' };
  var TYPE_NAMES = { home: '出发点', rest: '歇脚', food: '小吃', shop: '手信', sight: '看点', toilet: '厕所', lane: '小巷', stage: '戏台' };
  var MOOD_ICONS = { happy: '😊', worry: '😟', neutral: '😐' };
  var STATUS_NAMES = { follow: '', sit: '坐下', runaway: '跑开', lost: '没跟上', home: '到家' };
  var DIFFS = [
    { key: 'easy',   name: '初级', icon: '🌤️', desc: '5 位游客' },
    { key: 'normal', name: '标准', icon: '🌆', desc: '6 位游客' },
    { key: 'hard',   name: '困难', icon: '🌧️', desc: '7 位游客 · 坏情绪会传染' }
  ];

  var REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 参数 / 内容 读取（数值只从 params 来，缺则用契约默认值） ----------
  // v1.0：真实数据一行（评分/人均/营业时间/招牌/来源），数据来自 content/places.js 的 real.info
  function realFacts(p) {
    var r = (p && p.real) || {}, f = r.info || {}, out = [];
    if (f.statusNote) out.push('⚠ ' + f.statusNote);
    if (f.rating) out.push((f.ratingSrc || '点评') + ' ' + Number(f.rating).toFixed(1) + (f.reviews ? '（' + f.reviews + '评' + (f.asOf ? ' · ' + f.asOf + '采' : '') + '）' : ''));
    if (f.ctrip) out.push('携程 ' + f.ctrip);
    if (f.meituan) out.push('美团 ' + f.meituan);
    if (!f.rating && !f.ctrip && !f.meituan && WZ.ratingText) { // PRD-v4 §2.3：无精选评分时回退 ratings.js 三平台合并
      var rtLine = WZ.ratingText(p);
      if (rtLine && rtLine.indexOf('宁空勿编') < 0) out.push(rtLine);
    }
    if (f.cost != null) out.push(f.cost ? '人均¥' + f.cost : '免费');
    if (p.hours && p.hours !== '00:00-24:00') out.push('营业 ' + p.hours + (p.closedDow ? '（周一闭馆）' : '')); else if (p.hours) out.push('全天开放');
    if (f.sign) out.push(f.sign);
    if (p.queueMin) out.push('饭点排队约' + p.queueMin + '分钟');
    if (!out.length) return '';
    return out.join(' · ') + (f.src ? '　｜来源：' + f.src.join('/') : '');
  }

  function P(key, def) {
    var c = WZ.content && WZ.content.params;
    return c && c[key] != null ? c[key] : def;
  }
  function tagInfo(tag) {
    // 图标/配色优先读 content/params（与地图渲染一致，评审 L16）
    var base = TAGS[tag] || { name: tag || '游客', icon: '🙂', color: '#8a9099', fallback: '随便，都行' };
    var ic = P('tagIcons', null), col = P('tagColors', null);
    if (ic && ic[tag]) base = Object.assign({}, base, { icon: ic[tag] });
    if (col && col[tag]) base = Object.assign({}, base, { color: col[tag] });
    return base;
  }
  function tagDisplayName(tag) { var t = tagInfo(tag); return t.display || t.name; }

  function findKnowledge(id) {
    var k = WZ.content && WZ.content.knowledge;
    if (!k || !id) return null;
    if (Array.isArray(k)) {
      for (var i = 0; i < k.length; i++) if (k[i] && k[i].id === id) return k[i];
      return null;
    }
    var item = k[id];
    if (!item) return null;
    return typeof item === 'string' ? { id: id, text: item } : item;
  }

  function fmtClock(min) {
    var total = 7 * 60 + Math.max(0, Math.round(min || 0));
    var h = Math.floor(total / 60) % 24, m = total % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function pad4(n) { n = Math.max(0, Math.min(9999, Math.round(n || 0))); return ('0000' + n).slice(-4); }
  function chars(s) { return Array.from(String(s || '')); }

  // ---------- DOM 工具 ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, cls, onClick) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    if (typeof label === 'string') b.textContent = label; else b.appendChild(label);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function avatar(tag, size) {
    var t = tagInfo(tag);
    var a = el('span', 'ava', t.icon);
    if (WZ.characters) {
      a.textContent = '';
      a.classList.add('ava-character');
      var face = el('img', 'character-face');
      face.alt = ''; face.draggable = false;
      face.onerror = function () { a.textContent = t.icon; a.classList.remove('ava-character'); };
      face.src = WZ.characters.src(tag || 'any', true);
      a.appendChild(face);
      a.appendChild(el('span', 'ava-badge', t.icon));
    }
    a.style.setProperty('--c', t.color);
    a.setAttribute('aria-label', t.name);
    if (size) { a.style.width = a.style.height = size + 'px'; a.style.fontSize = Math.round(size / 2) + 'px'; }
    return a;
  }
  // 耐心条（10/24 替换 3 颗心）：n = 0–100 的耐心百分比；兼容旧调用传心数（≤ max 时按心换算）
  function patienceColor(p) { return p >= 50 ? '#57C79A' : p >= 25 ? '#F2A03D' : '#E4553F'; } // 薄荷/橘/珊瑚（iso 令牌）
  function hearts(n, max) {
    max = max || P('hearts', 3);
    var pct = n > max ? n : Math.round(n / max * 100);
    var h = el('span', 'patience');
    h.setAttribute('aria-label', '耐心 ' + Math.round(pct) + '%');
    var bar = el('i', 'pb'); var fill = el('b'); fill.style.width = Math.max(0, Math.min(100, pct)) + '%'; fill.style.background = patienceColor(pct);
    bar.appendChild(fill); h.appendChild(bar); h.appendChild(el('span', 'pt', Math.round(pct) + '%'));
    return h;
  }

  var root, hud, overlay, dock, toastBox, bannerBox;
  function ensureLayers() {
    if (root) return;
    root = document.getElementById('app') || document.body;
    hud = document.getElementById('hud');
    overlay = document.getElementById('overlay');
    dock = document.getElementById('dock');
    toastBox = document.getElementById('toast');
    bannerBox = document.getElementById('banner');
    if (!hud) { hud = el('div'); hud.id = 'hud'; root.appendChild(hud); }
    if (!dock) { dock = el('div'); dock.id = 'dock'; root.appendChild(dock); }
    if (!overlay) { overlay = el('div'); overlay.id = 'overlay'; root.appendChild(overlay); }
    if (!toastBox) { toastBox = el('div'); toastBox.id = 'toast'; root.appendChild(toastBox); }
    if (!bannerBox) { bannerBox = el('div'); bannerBox.id = 'banner'; root.appendChild(bannerBox); } // F3 横幅层
    hud.hidden = true;
    overlay.hidden = true;
  }

  // 页面定时器：切页时统一清掉
  var pageTimers = [];
  function later(fn, ms) {
    var id = setTimeout(function () {
      var i = pageTimers.indexOf(id); if (i >= 0) pageTimers.splice(i, 1);
      fn();
    }, ms);
    pageTimers.push(id);
    return id;
  }
  function clearPageTimers() { pageTimers.forEach(clearTimeout); pageTimers.length = 0; }

  var pageStack = [];
  function setOverlay(page, opts) {
    ensureLayers();
    clearPageTimers();
    if (opts && opts.keepPrev && overlay.firstChild) pageStack.push(overlay.firstChild);
    else pageStack.length = 0;
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    overlay.appendChild(page);
    overlay.hidden = false;
    var first = page.querySelector('input, button:not(:disabled)');
    if (first && !('ontouchstart' in window)) { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    return page;
  }
  function restorePrev() {
    var prev = pageStack.pop();
    if (prev) { clearPageTimers(); while (overlay.firstChild) overlay.removeChild(overlay.firstChild); overlay.appendChild(prev); overlay.hidden = false; }
    else ui.hide();
  }
  ui.hide = function () { ensureLayers(); clearPageTimers(); overlay.hidden = true; while (overlay.firstChild) overlay.removeChild(overlay.firstChild); pageStack.length = 0; };
  function page(cls) { var p = el('div', 'page' + (cls ? ' ' + cls : '')); p.setAttribute('role', 'dialog'); return p; }

  // 供 ending.js 复用的内部工具
  ui._ = { el: el, btn: btn, avatar: avatar, hearts: hearts, setOverlay: setOverlay, later: later, P: P, fmtClock: fmtClock, chars: chars, tagInfo: tagInfo, REDUCED: REDUCED, ensureLayers: ensureLayers, realFacts: realFacts, tutorial: function (k, t) { return ui.tutorial(k, t); } };

  // ---------- 一次性教学提示（10/24 #10）：每个 key 只出现一次（localStorage 记住） ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 隐私模式：本局内记住 */ } }
  var tutShown = {}, tutQueue = [], tutOn = false;
  ui.tutorial = function (key, text, ms) {
    ensureLayers();
    if (tutShown[key] || lsGet('wz_tut_' + key) === '1') return false;
    tutShown[key] = true; lsSet('wz_tut_' + key, '1');
    if (tutOn) { tutQueue.push([text, ms]); return true; } // 一次只出一条，排队
    showTut(text, ms);
    return true;
  };
  function showTut(text, ms) {
    tutOn = true;
    var t = el('div', 'tutorial');
    t.setAttribute('role', 'note');
    t.appendChild(el('span', 'tut-ico', '💡'));
    t.appendChild(el('span', 'tut-text', text));
    var ok = btn('知道了', 'tut-ok', function () { close(); });
    t.appendChild(ok);
    var done = false;
    function close() {
      if (done) return; done = true;
      if (t.parentNode) t.parentNode.removeChild(t);
      tutOn = false;
      var nx = tutQueue.shift(); if (nx) setTimeout(function () { showTut(nx[0], nx[1]); }, 400);
    }
    root.appendChild(t);
    setTimeout(close, ms || 7000);
  }

  // ---------- 提示词 10：单次聚光引导（半透明引导层 + 发光圆圈 + 一句话），每个 key 一辈子只出一次 ----------
  // target: CSS 选择器 | 元素 | function() → {x,y,r}（屏幕坐标，可跟着游客动）；onHit: 点中圆圈时回调
  ui.spotlight = function (key, target, text, onHit) {
    ensureLayers();
    if (/[?&]nospot/.test(location.search)) return false; // 测试开关：?nospot 关闭新手聚光灯（冒烟/E2E 用）
    if (lsGet('wz_spot_' + key) === '1' || tutShown['spot_' + key]) return false;
    function rectOf() {
      if (typeof target === 'function') return target();
      var e = typeof target === 'string' ? document.querySelector(target) : target;
      if (!e) return null;
      var r = e.getBoundingClientRect(), a = root.getBoundingClientRect();
      if (!r.width) return null;
      return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2, r: Math.max(r.width, r.height) / 2 + 10 };
    }
    if (!rectOf()) return false;
    tutShown['spot_' + key] = true; lsSet('wz_spot_' + key, '1');
    var layer = el('div', 'spot-layer'), ring = el('div', 'spot-ring'), tip = el('div', 'spot-tip', text);
    layer.appendChild(ring); layer.appendChild(tip); root.appendChild(layer);
    var alive = true;
    function place() {
      if (!alive) return;
      var c = rectOf(); if (c) {
        var r = Math.min(c.r, 140);
        ring.style.width = ring.style.height = (r * 2) + 'px';
        ring.style.left = (c.x - r) + 'px'; ring.style.top = (c.y - r) + 'px';
        var below = c.y < root.clientHeight * 0.55;
        tip.style.left = Math.max(10, Math.min(root.clientWidth - 250, c.x - 120)) + 'px';
        tip.style.top = (below ? c.y + r + 14 : c.y - r - 64) + 'px';
        tip.classList.toggle('up', !below);
        layer._c = { x: c.x, y: c.y, r: r };
      }
      requestAnimationFrame(place);
    }
    place();
    layer.addEventListener('click', function (e) {
      var a = root.getBoundingClientRect(), c = layer._c, hit = false;
      if (c) hit = Math.hypot(e.clientX - a.left - c.x, e.clientY - a.top - c.y) <= c.r + 6;
      alive = false; if (layer.parentNode) layer.parentNode.removeChild(layer);
      if (hit && onHit) onHit();
      else if (hit && typeof target === 'string') { var t = document.querySelector(target); if (t) t.click(); }
    });
    return true;
  };
  ui._.spotlight = function (k, t, x, h) { return ui.spotlight(k, t, x, h); };

  // ---------- 敏感词 ----------
  function filterText(tag, text) {
    text = chars((text || '').trim()).slice(0, 20).join(''); // 10/24 #1：一句话 10 → 20 字
    var bw = WZ.content && WZ.content.badwords;
    var fallback = (bw && bw.fallbackByTag && bw.fallbackByTag[tag]) || tagInfo(tag).fallback;
    if (!text) return fallback;
    var words = (bw && bw.words) || [];
    var lower = text.toLowerCase();
    for (var i = 0; i < words.length; i++) {
      var w = String(words[i] || '').toLowerCase();
      if (w && lower.indexOf(w) >= 0) return fallback; // 命中：静默替换为该标签默认句
    }
    return text;
  }

  // ========== S0 开局（10/24 #1：标签可编辑 / ＋自定义 / 多选 / 一句话 20 字） ==========
  // 标签存档：{ hidden:[基础标签], rename:{tag:文字}, custom:[{id,label,maps}] }。自定义标签按关键词映射到 8 种规则之一，映射不到 = 都行哥
  var TAG_KEY = 'wz_tags_v1', MAX_PICK = 3;
  function loadTags() { try { var o = JSON.parse(lsGet(TAG_KEY) || '{}'); return { hidden: o.hidden || [], rename: o.rename || {}, custom: o.custom || [] }; } catch (e) { return { hidden: [], rename: {}, custom: [] }; } }
  function saveTags(o) { lsSet(TAG_KEY, JSON.stringify(o)); }
  var KW = [['walk', /走|累|腿|脚|爬|步/], ['food', /吃|饿|辣|甜|口味|饭|菜/], ['crowd', /挤|人多|排队|吵|闹/], ['shop', /买|手信|特产|逛街|购物|带回/],
    ['bored', /无聊|没劲|没意思|一样|网红/], ['rush', /赶|急|慢|时间|迟到|磨蹭/], ['toilet', /厕所|洗手间|卫生间|憋/]];
  function mapTag(label) { for (var i = 0; i < KW.length; i++) if (KW[i][1].test(label)) return KW[i][0]; return 'any'; }
  ui._mapTag = mapTag;

  ui.showIntro = function (onSubmit) {
    var pg = page('page-intro');
    var brand = el('header', 'brand');
    brand.appendChild(el('div', 'brand-title', '温州玩家'));
    brand.appendChild(el('div', 'brand-sub', '1024 MIN'));
    pg.appendChild(brand);
    pg.appendChild(el('h1', 'q', '出门旅行，你最怕什么？'));
    pg.appendChild(el('p', 'small muted intro-tip', '可多选（最多 ' + MAX_PICK + ' 个）· 长按标签改字或删除 · ＋ 写一个自己的'));

    var store = loadTags();
    var selected = []; // [{key, base, label}]
    var grid = el('div', 'tag-grid');
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', '选你最怕的事，可多选');

    function items() {
      var out = [];
      TAG_ORDER.forEach(function (tag) { if (store.hidden.indexOf(tag) < 0) out.push({ key: tag, base: tag, label: store.rename[tag] || tagDisplayName(tag), icon: tagInfo(tag).icon, color: tagInfo(tag).color }); });
      store.custom.forEach(function (c) { out.push({ key: c.id, base: c.maps, label: c.label, icon: c.icon || '✏️', color: tagInfo(c.maps).color, custom: true }); });
      return out;
    }
    function isSel(k) { return selected.some(function (x) { return x.key === k; }); }
    function render() {
      while (grid.firstChild) grid.removeChild(grid.firstChild);
      items().forEach(function (it) {
        var b = el('button', 'tag' + (it.custom ? ' tag-custom' : ''));
        b.type = 'button';
        b.style.setProperty('--c', it.color);
        b.setAttribute('aria-pressed', isSel(it.key) ? 'true' : 'false');
        b.appendChild(el('span', 'ico', it.icon));
        b.appendChild(el('span', 'nm', it.label));
        b.addEventListener('click', function () {
          if (b._lp) { b._lp = false; return; }
          if (isSel(it.key)) selected = selected.filter(function (x) { return x.key !== it.key; });
          else { if (selected.length >= MAX_PICK) { ui.toast('最多选 ' + MAX_PICK + ' 个'); return; } selected.push(it); }
          sync();
        });
        longPress(b, function () { b._lp = true; editTag(it); });
        grid.appendChild(b);
      });
      var plus = el('button', 'tag tag-plus'); plus.type = 'button';
      plus.appendChild(el('span', 'ico', '＋')); plus.appendChild(el('span', 'nm', '写一个'));
      plus.addEventListener('click', function () { editTag(null); });
      grid.appendChild(plus);
      if (store.hidden.length || Object.keys(store.rename).length) {
        var rs = el('button', 'tag tag-reset'); rs.type = 'button';
        rs.appendChild(el('span', 'ico', '↺')); rs.appendChild(el('span', 'nm', '恢复默认'));
        rs.addEventListener('click', function () { store.hidden = []; store.rename = {}; saveTags(store); render(); });
        grid.appendChild(rs);
      }
    }
    function longPress(node, fn) {
      var t = 0, x0 = 0, y0 = 0;
      node.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; clearTimeout(t); t = setTimeout(function () { t = 0; fn(); }, 520); });
      node.addEventListener('pointermove', function (e) { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) { clearTimeout(t); t = 0; } });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { node.addEventListener(ev, function () { clearTimeout(t); t = 0; }); });
      node.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    // 编辑框：it=null 新建；基础标签可改字/删除（删除=隐藏，可恢复）；自定义标签可改字/删除
    function editTag(it) {
      var mask = el('div', 'confirm-mask');
      var d = el('div', 'confirm');
      d.appendChild(el('h3', null, it ? '改这个标签' : '写一个你自己的'));
      var inp = el('input', 'input'); inp.type = 'text'; inp.maxLength = 6; inp.value = it ? it.label : ''; inp.placeholder = '最多 6 个字，比如：怕晒';
      d.appendChild(inp);
      // 提示词 1：新标签可选一个 emoji
      var emo = (it && it.icon && it.custom) ? it.icon : '✏️', emoRow = null;
      if (!it || it.custom) {
        emoRow = el('div', 'emo-row');
        ['✏️', '☀️', '🌧️', '📷', '🐟', '💸', '🧳', '😴', '🚕', '🍵', '🦟', '🗣️'].forEach(function (e) {
          var b = el('button', 'emo' + (e === emo ? ' on' : ''), e); b.type = 'button';
          b.addEventListener('click', function () { emo = e; Array.prototype.forEach.call(emoRow.children, function (x) { x.classList.toggle('on', x === b); }); });
          emoRow.appendChild(b);
        });
        d.appendChild(emoRow);
      }
      if (!it) d.appendChild(el('p', 'small muted', '会按意思自动归到一种游客脾气里（比如写「怕排队」= 怕挤挤）。'));
      var row = el('div', 'btn-row');
      if (it) row.appendChild(btn('删除', 'btn-ghost', function () {
        if (it.custom) store.custom = store.custom.filter(function (c) { return c.id !== it.key; });
        else { store.hidden.push(it.key); delete store.rename[it.key]; }
        selected = selected.filter(function (x) { return x.key !== it.key; });
        saveTags(store); close(); render(); sync();
      }));
      row.appendChild(btn('取消', 'btn-ghost', close));
      row.appendChild(btn('保存', 'btn-primary', function () {
        var v = chars(inp.value.trim()).slice(0, 6).join('');
        if (!v) { ui.toast('写几个字吧'); return; }
        if (!it) {
          var c = { id: 'c' + Date.now().toString(36), label: v, maps: mapTag(v), icon: emo };
          store.custom.push(c);
          if (selected.length < MAX_PICK) selected.push({ key: c.id, base: c.maps, label: v, custom: true });
        } else if (it.custom) store.custom.forEach(function (c) { if (c.id === it.key) { c.label = v; c.maps = mapTag(v); c.icon = emo; } });
        else store.rename[it.key] = v;
        selected.forEach(function (x) { if (x.key === (it && it.key)) x.label = v; });
        saveTags(store); close(); render(); sync();
      }));
      d.appendChild(row);
      mask.appendChild(d); pg.appendChild(mask);
      setTimeout(function () { try { inp.focus(); } catch (e) { /* ignore */ } }, 50);
      function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
    }
    function sync() {
      Array.prototype.forEach.call(grid.querySelectorAll('.tag'), function (b, i) { var it = items()[i]; if (it) b.setAttribute('aria-pressed', isSel(it.key) ? 'true' : 'false'); });
      submit.disabled = !selected.length;
    }
    pg.appendChild(grid);

    var f1 = el('label', 'field');
    var l1 = el('div', 'field-label');
    l1.appendChild(el('span', null, '用一句话说说（可不填）'));
    var cnt = el('span', 'count', '0/20');
    l1.appendChild(cnt);
    f1.appendChild(l1);
    var textIn = el('input', 'input');
    textIn.type = 'text'; textIn.maxLength = 40; textIn.placeholder = '写一句，它今晚就上场'; textIn.autocomplete = 'off';
    textIn.addEventListener('input', function () {
      var c = chars(textIn.value);
      if (c.length > 20) textIn.value = c.slice(0, 20).join('');
      cnt.textContent = Math.min(20, chars(textIn.value).length) + '/20';
    });
    f1.appendChild(textIn);
    pg.appendChild(f1);

    var f2 = el('label', 'field');
    var l2 = el('div', 'field-label');
    l2.appendChild(el('span', null, '你的昵称'));
    l2.appendChild(el('span', null, '≤6 字'));
    f2.appendChild(l2);
    var nameIn = el('input', 'input');
    nameIn.type = 'text'; nameIn.maxLength = 6; nameIn.placeholder = '游客'; nameIn.autocomplete = 'off';
    nameIn.addEventListener('input', function () { var c = chars(nameIn.value); if (c.length > 6) nameIn.value = c.slice(0, 6).join(''); });
    f2.appendChild(nameIn);
    pg.appendChild(f2);

    var foot = el('div', 'intro-foot');
    var submit = btn('带队出发', 'btn-primary btn-block', function () {
      if (!selected.length) { ui.toast('先选一个最怕的事'); return; }
      submit.disabled = true;
      var name = chars(nameIn.value.trim()).slice(0, 6).join('') || '游客';
      var first = selected[0];
      var said = chars(textIn.value.trim()).length ? filterText(first.base, textIn.value) : (first.custom ? filterText(first.base, first.label) : filterText(first.base, ''));
      var picks = selected.map(function (x, i) { return { tag: x.base, label: x.label, text: i === 0 ? said : filterText(x.base, x.custom ? x.label : '') }; });
      onSubmit && onSubmit({ name: name, tag: first.base, text: said, picks: picks });
    });
    submit.disabled = true;
    foot.appendChild(submit);
    foot.appendChild(el('p', 'small muted center', '温州的一天有 1024 分钟。带 5 个陌生人逛鹿城，午夜前回家。'));
    pg.appendChild(foot);

    pg.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !submit.disabled && (e.target === textIn || e.target === nameIn)) submit.click(); });
    render();
    setOverlay(pg);
  };

  // ========== S1 接团（10/24：队伍可编辑——加人 / 删人 / 改脾气和那句话） ==========
  // onReady(spec)：spec = null 表示没改；否则 [{tag, line}]，main 按它重建队伍
  ui.showTeam = function (guests, onReady) {
    var TMIN = P('teamMin', 3), TMAX = P('teamMax', 7);
    var team = (guests || []).map(function (g) { return { tag: g.tag, line: g.line || tagInfo(g.tag).fallback, name: g.name }; });
    var changed = false;
    var pg = page('page-team');
    pg.appendChild(el('h2', null, '今天的队伍'));
    pg.appendChild(el('p', 'hint', '每个人都揣着一件最怕的事。点 ✏️ 改，× 请走，＋ 再拉一位（' + TMIN + '～' + TMAX + ' 人）。'));
    var list = el('div', 'team-list scroll');
    pg.appendChild(list);
    function render() {
      while (list.firstChild) list.removeChild(list.firstChild);
      team.forEach(function (g, i) {
        var c = el('div', 'card guest-card');
        c.style.animationDelay = (REDUCED || changed ? 0 : i * 0.14) + 's';
        c.appendChild(avatar(g.tag));
        var body = el('div', 'guest-body');
        body.appendChild(el('div', 'guest-name', tagDisplayName(g.tag)));
        body.appendChild(el('div', 'guest-line', '「' + g.line + '」'));
        c.appendChild(body);
        var ops = el('div', 'gc-ops'); // 接团页不放耐心条（开局都是 100%），给那句话留宽度
        var eb = btn('✏️', 'gc-op', function () { edit(i); }); eb.setAttribute('aria-label', '改 ' + tagDisplayName(g.tag));
        var xb = btn('×', 'gc-op', function () {
          if (team.length <= TMIN) { ui.toast('队伍至少 ' + TMIN + ' 个人'); return; }
          team.splice(i, 1); changed = true; render();
        });
        xb.setAttribute('aria-label', '请 ' + tagDisplayName(g.tag) + ' 离队');
        ops.appendChild(eb); ops.appendChild(xb);
        c.appendChild(ops);
        list.appendChild(c);
      });
      if (team.length < TMAX) {
        var add = btn('＋ 再拉一位游客', 'btn-ghost btn-block team-add', function () { edit(-1); });
        list.appendChild(add);
      }
      count.textContent = team.length + ' 人';
    }
    // 编辑框：选脾气（8 种规则）+ 写一句（≤20 字）
    function edit(i) {
      var cur = i >= 0 ? team[i] : { tag: 'food', line: '' };
      var pick = cur.tag;
      var mask = el('div', 'confirm-mask');
      var d = el('div', 'confirm team-edit');
      d.appendChild(el('h3', null, i >= 0 ? '改这位游客' : '再拉一位游客'));
      var g8 = el('div', 'tag-grid te-grid');
      var tbs = {};
      TAG_ORDER.forEach(function (tag) {
        var t = tagInfo(tag);
        var b = el('button', 'tag'); b.type = 'button';
        b.style.setProperty('--c', t.color);
        b.setAttribute('aria-pressed', tag === pick ? 'true' : 'false');
        b.appendChild(el('span', 'ico', t.icon)); b.appendChild(el('span', 'nm', tagDisplayName(tag)));
        b.addEventListener('click', function () {
          pick = tag;
          TAG_ORDER.forEach(function (k) { tbs[k].setAttribute('aria-pressed', k === tag ? 'true' : 'false'); });
          if (!inp.value) inp.placeholder = tagInfo(tag).fallback;
        });
        tbs[tag] = b; g8.appendChild(b);
      });
      d.appendChild(g8);
      var inp = el('input', 'input'); inp.type = 'text'; inp.maxLength = 40;
      inp.value = i >= 0 ? cur.line : ''; inp.placeholder = tagInfo(pick).fallback;
      var cnt = el('div', 'small muted te-count', chars(inp.value).length + '/20');
      inp.addEventListener('input', function () { var c = chars(inp.value); if (c.length > 20) inp.value = c.slice(0, 20).join(''); cnt.textContent = Math.min(20, chars(inp.value).length) + '/20'; });
      d.appendChild(inp); d.appendChild(cnt);
      var row = el('div', 'btn-row');
      row.appendChild(btn('取消', 'btn-ghost', close));
      row.appendChild(btn(i >= 0 ? '保存' : '加入队伍', 'btn-primary', function () {
        var line = filterText(pick, inp.value || '');
        if (i >= 0) team[i] = { tag: pick, line: line };
        else team.push({ tag: pick, line: line });
        changed = true; close(); render();
      }));
      d.appendChild(row);
      mask.appendChild(d); pg.appendChild(mask);
      function close() { if (mask.parentNode) mask.parentNode.removeChild(mask); }
    }
    var foot = el('div', 'team-foot');
    var count = el('span', 'plan-count');
    var b = btn('出发前排个路线', 'btn-primary btn-block', function () {
      b.disabled = true;
      onReady && onReady(changed ? team.map(function (g) { return { tag: g.tag, line: g.line }; }) : null);
    });
    var fr = el('div', 'team-foot-row'); fr.appendChild(count); fr.appendChild(b);
    foot.appendChild(fr);
    pg.appendChild(foot);
    render();
    setOverlay(pg);
  };

  // ========== S2 排路线 ==========
  ui.showRoutePlanner = function (opts, onConfirm) {
    if (WZ.book && WZ.book.planner && !(opts && opts.legacy)) return WZ.book.planner(opts, onConfirm); // 10/24：手册版排路线
    opts = opts || {};
    var places = (opts.places || []).filter(function (p) { return !(p.types || []).some(function (t) { return t === 'home'; }); });
    var guests = opts.guests || [];
    var MIN = P('routeMin', 3), MAX = P('routeMax', 5);
    var chosen = [];

    var pg = page('page-plan');
    pg.appendChild(el('h2', null, '出发前排个路线'));
    pg.appendChild(el('p', 'hint', '点 ' + MIN + '～' + MAX + ' 个地点，按点的顺序走。游客会实时表态。'));

    var bar = el('div', 'preview-bar');
    bar.setAttribute('aria-live', 'polite');
    var pvs = {};
    guests.forEach(function (g) {
      var pv = el('div', 'pv');
      pv.dataset.mood = 'neutral';
      pv.appendChild(avatar(g.tag));
      pv.appendChild(el('span', 'pv-mood', MOOD_ICONS.neutral));
      pv.appendChild(el('span', 'pv-text', g.name || tagInfo(g.tag).name));
      pvs[g.id] = pv;
      bar.appendChild(pv);
    });
    pg.appendChild(bar);

    function refreshPreview() {
      var pre = [];
      try { pre = (typeof opts.preview === 'function' && opts.preview(chosen.slice())) || []; } catch (e) { pre = []; }
      guests.forEach(function (g) {
        var pv = pvs[g.id]; if (!pv) return;
        var item = null;
        for (var i = 0; i < pre.length; i++) if (pre[i] && pre[i].guestId === g.id) { item = pre[i]; break; }
        var mood = (item && item.mood) || 'neutral';
        pv.dataset.mood = mood;
        pv.querySelector('.pv-mood').textContent = MOOD_ICONS[mood] || MOOD_ICONS.neutral;
        pv.querySelector('.pv-text').textContent = (item && item.text) || (g.name || tagInfo(g.tag).name);
      });
      count.textContent = chosen.length + '/' + MAX;
      go.disabled = chosen.length < MIN;
    }

    var list = el('div', 'place-list scroll');
    list.setAttribute('role', 'group');
    var cards = {};
    places.forEach(function (p) {
      var b = el('button', 'place');
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      var types = p.types || [];
      b.appendChild(el('span', 'place-ico', TYPE_ICONS[types[0]] || '📍'));
      var body = el('div', 'place-body');
      body.appendChild(el('span', 'place-name', p.name || p.id));
      var meta = types.map(function (t) { return TYPE_NAMES[t] || t; }).join(' · ');
      meta += (meta ? ' · ' : '') + '停 ' + (p.stayMin != null ? p.stayMin : P('stayMin', 32)) + ' 分钟';
      if (p.crowdWindow) meta += ' · ' + fmtClock(p.crowdWindow[0]) + '–' + fmtClock(p.crowdWindow[1]) + ' 人多';
      body.appendChild(el('span', 'place-meta', meta));
      var facts = realFacts(p);
      if (facts) body.appendChild(el('span', 'place-meta place-real', facts));
      b.appendChild(body);
      var no = el('span', 'place-no', '');
      b.appendChild(no);
      b.addEventListener('click', function () {
        var idx = chosen.indexOf(p.id);
        if (idx >= 0) chosen.splice(idx, 1);
        else if (chosen.length >= MAX) { ui.toast('最多 ' + MAX + ' 个地点'); return; }
        else chosen.push(p.id);
        renumber();
        refreshPreview();
      });
      cards[p.id] = b;
      list.appendChild(b);
    });
    function renumber() {
      places.forEach(function (p) {
        var idx = chosen.indexOf(p.id);
        var c = cards[p.id];
        c.setAttribute('aria-pressed', idx >= 0 ? 'true' : 'false');
        c.querySelector('.place-no').textContent = idx >= 0 ? String(idx + 1) : '';
      });
    }
    pg.appendChild(list);

    var foot = el('div', 'plan-foot');
    var count = el('span', 'plan-count', '0/' + MAX);
    var go = btn('出发', 'btn-primary', function () {
      if (chosen.length < MIN) { ui.toast('至少选 ' + MIN + ' 个地点'); return; }
      go.disabled = true;
      onConfirm && onConfirm(chosen.slice());
    });
    go.style.flex = '1 1 auto';
    foot.appendChild(count);
    foot.appendChild(go);
    pg.appendChild(foot);

    setOverlay(pg);
    refreshPreview();
  };

  // ========== HUD ==========
  var hudDom = null;
  function buildHud() {
    ensureLayers();
    while (hud.firstChild) hud.removeChild(hud.firstChild);
    var bar = el('div', 'hud-bar');
    if (WZ.characters) {
      var guideFace = el('img', 'hud-avatar');
      guideFace.src = WZ.characters.src('hero', true);
      guideFace.alt = '导游'; guideFace.draggable = false;
      guideFace.onerror = function () { guideFace.remove(); };
      bar.appendChild(guideFace);
    }
    var mem = el('div', 'mem');
    mem.dataset.heat = 'cool';
    mem.setAttribute('role', 'progressbar');
    mem.setAttribute('aria-valuemin', '0');
    mem.setAttribute('aria-valuemax', String(P('totalMin', 1024)));
    var fill = el('div', 'mem-fill');
    mem.appendChild(fill);
    mem.appendChild(el('div', 'mem-ticks'));
    bar.appendChild(mem);
    var read = el('div', 'mem-read');
    read.dataset.heat = 'cool';
    var readNum = el('b', null, '0000');
    read.appendChild(readNum);
    read.appendChild(el('span', null, '/' + P('totalMin', 1024)));
    bar.appendChild(read);
    var scoreChip = el('div', 'hud-score');
    scoreChip.setAttribute('aria-label', '积分');
    var scoreNum = el('b', null, '0');
    scoreChip.appendChild(scoreNum);
    scoreChip.appendChild(el('span', null, ' 分'));
    scoreChip.addEventListener('click', function () { if (typeof ui.hud.onScore === 'function') ui.hud.onScore(); });
    bar.appendChild(scoreChip);
    var overviewBtn = el('button', 'hud-pause hud-overview', '🗺');
    overviewBtn.type = 'button'; overviewBtn.setAttribute('aria-label', '全览全温州');
    overviewBtn.addEventListener('click', function () { if (typeof ui.hud.onOverview === 'function') ui.hud.onOverview(overviewBtn); });
    bar.appendChild(overviewBtn);
    var muteBtn = el('button', 'hud-pause hud-mute', WZ.sfx && WZ.sfx.muted ? '🔇' : '🔊'); // 提示词 10：全局静音
    muteBtn.type = 'button'; muteBtn.setAttribute('aria-label', '静音');
    muteBtn.addEventListener('click', function () { if (!WZ.sfx) return; WZ.sfx.setMuted(!WZ.sfx.muted); muteBtn.textContent = WZ.sfx.muted ? '🔇' : '🔊'; });
    bar.appendChild(muteBtn);
    var pause = el('button', 'hud-pause', '⏸');
    pause.type = 'button';
    pause.setAttribute('aria-label', '暂停');
    pause.addEventListener('click', onPauseClick);
    bar.appendChild(pause);
    hud.appendChild(bar);
    // 提示词 5：进度条正下方的窄横幅「下一站：××× · 步行 N 分钟」，点一下地图平移到下一站
    var gd = el('div', 'hud-guide');
    var gNext = el('b', 'hg-next'), gTip = el('span', 'hg-tip');
    gd.appendChild(gNext);
    gd.hidden = true;
    gd.addEventListener('click', function () { if (typeof ui.hud.onBanner === 'function') ui.hud.onBanner(); });
    hud.appendChild(gd);
    var gl = el('div', 'hud-guests');
    hud.appendChild(gl);
    hudDom = { mem: mem, fill: fill, read: read, readNum: readNum, scoreChip: scoreChip, scoreNum: scoreNum, overviewBtn: overviewBtn, guests: gl, rows: {}, guide: gd, gNext: gNext, gTip: gTip };
  }

  function onPauseClick() {
    if (typeof ui.hud.onPause === 'function') { ui.hud.onPause(); return; }
    // 默认行为：暂停引擎 + 简单暂停页
    if (WZ.engine && typeof WZ.engine.pause === 'function') WZ.engine.pause(true);
    var pg = page('pause');
    pg.appendChild(el('h2', null, '暂停'));
    pg.appendChild(el('p', 'muted small', '队伍在原地等你。'));
    var resume = btn('继续', 'btn-primary', function () {
      if (WZ.engine && typeof WZ.engine.pause === 'function') WZ.engine.pause(false);
      ui.hide();
    });
    resume.style.minWidth = '200px';
    pg.appendChild(resume);
    if (WZ.sfx) { // PRD-v2 F9：静音开关
      var sfxBtn = btn(WZ.sfx.muted ? '🔇 声音：关' : '🔊 声音：开', 'btn-ghost', function () {
        WZ.sfx.setMuted(!WZ.sfx.muted);
        sfxBtn.textContent = WZ.sfx.muted ? '🔇 声音：关' : '🔊 声音：开';
      });
      sfxBtn.style.minWidth = '200px';
      pg.appendChild(sfxBtn);
    }
    if (typeof ui.hud.onGoHome === 'function') {
      var home = btn('现在回家', 'btn-ghost', function () { ui.hide(); ui.hud.onGoHome(); });
      home.style.minWidth = '200px';
      pg.appendChild(home);
    }
    setOverlay(pg);
  }

  ui.hud = {
    onPause: null,
    onGoHome: null,
    onGuest: null,
    onBanner: null,
    onOverview: null,  // 10/25：全览按钮（main.js 挂：engine.fitMap 切换）
    onScore: null,     // 10/25：点积分查看明细（main.js 挂）
    setGuide: function (g) {
      if (!hudDom) return;
      g = g || {};
      if (hudDom.gNext.textContent !== (g.next || '')) hudDom.gNext.textContent = g.next || '';
      hudDom.guide.hidden = !g.next;
    },
    setScore: function (n) { // PRD-v4 §2.2：积分数字变化时跳一下
      if (!hudDom || !hudDom.scoreNum) return;
      hudDom.scoreNum.textContent = String(n || 0);
      hudDom.scoreChip.classList.remove('bump');
      void hudDom.scoreChip.offsetWidth;
      hudDom.scoreChip.classList.add('bump');
    },
    show: function () { ensureLayers(); if (!hudDom) buildHud(); hud.hidden = false; },
    hide: function () { ensureLayers(); hud.hidden = true; },
    update: function (state) {
      ensureLayers();
      if (!hudDom) buildHud();
      hud.hidden = false;
      state = state || {};
      var total = P('totalMin', 1024);
      var clock = Math.max(0, Math.min(total, state.clockMin || 0));
      var pct = clock / total;
      var heat = pct >= 0.95 ? 'hot' : pct >= 0.75 ? 'warm' : 'cool';
      hudDom.fill.style.width = (pct * 100).toFixed(2) + '%';
      hudDom.mem.dataset.heat = heat;
      hudDom.read.dataset.heat = heat;
      hudDom.mem.setAttribute('aria-valuenow', String(Math.round(clock)));
      hudDom.readNum.textContent = pad4(clock); // 只报读数，不报秒
      // 积分实时显示（10/25）
      if (hudDom.scoreNum) hudDom.scoreNum.textContent = String(state.score || 0); // codex #12：负分如实显示

      var guests = state.guests || [];
      var seen = {};
      var maxH = P('hearts', 3), calmMax = P('calmTimes', 2);
      guests.forEach(function (g) {
        seen[g.id] = true;
        var row = hudDom.rows[g.id];
        if (!row) {
          row = { el: el('div', 'hg') };
          row.el.appendChild(avatar(g.tag));
          row.hearts = el('span', 'patience'); row.hbar = el('i', 'pb'); row.hfill = el('b'); row.hbar.appendChild(row.hfill);
          row.htxt = el('span', 'pt'); row.hearts.appendChild(row.hbar); row.hearts.appendChild(row.htxt); row.el.appendChild(row.hearts);
          row.status = el('span', 'hg-status', ''); row.el.appendChild(row.status);
          row.calm = el('span', 'hg-calm'); row.el.appendChild(row.calm);
          row.el.title = (g.name || tagInfo(g.tag).name) + '：' + (g.line || '');
          (function (gid) { row.el.addEventListener('click', function () { if (typeof ui.hud.onGuest === 'function') ui.hud.onGuest(gid); }); })(g.id); // 10/24 #3：点头像看他说过的话
          hudDom.rows[g.id] = row;
          hudDom.guests.appendChild(row.el);
        }
        var pc = Math.round(g.patience != null ? g.patience : (g.hearts != null ? g.hearts / maxH * 100 : 100));
        if (row.pc !== pc) {
          row.pc = pc; row.hfill.style.width = pc + '%'; row.hfill.style.background = patienceColor(pc);
          row.htxt.textContent = pc + '%'; row.hearts.setAttribute('aria-label', '耐心 ' + pc + '%');
          row.el.classList.toggle('low', pc < 50 && pc > 0);
          row.el.classList.toggle('zero', pc <= 0);
        }
        var st = g.status || 'follow';
        if (row.el.dataset.status !== st) { row.el.dataset.status = st; row.status.textContent = STATUS_NAMES[st] != null ? STATUS_NAMES[st] : st; }
        var left = g.calmLeft != null ? g.calmLeft : calmMax;
        if (row.calm.childNodes.length !== calmMax) { while (row.calm.firstChild) row.calm.removeChild(row.calm.firstChild); for (var j = 0; j < calmMax; j++) row.calm.appendChild(el('i')); }
        for (var k = 0; k < calmMax; k++) row.calm.childNodes[k].className = k < left ? '' : 'used';
      });
      Object.keys(hudDom.rows).forEach(function (id) { if (!seen[id]) { hudDom.guests.removeChild(hudDom.rows[id].el); delete hudDom.rows[id]; } });
    },
    reset: function () { ensureLayers(); hudDom = null; while (hud.firstChild) hud.removeChild(hud.firstChild); hud.hidden = true; },
    pulse: function (id) { // 掉耐心时 HUD 头像抖一下
      var row = hudDom && hudDom.rows[id]; if (!row) return;
      row.el.classList.remove('hit'); void row.el.offsetWidth; row.el.classList.add('hit');
    }
  };

  // ========== 停站前台页（PRD-v2 F1：底部大面板，无倒计时，点「继续出发」才走） ==========
  var stayEl = null;
  function dismissStay(cb) {
    if (!stayEl) return;
    var e = stayEl; stayEl = null;
    e.classList.add('out');
    setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); cb && cb(); }, REDUCED ? 0 : 240);
  }
  // 三平台评分行（PRD-v4 §2.3）：「大众点评 4.0（4843评）· 高德 4.1 · 小红书 未采」；全无 → 宁空勿编
  WZ.ratingText = function (place) {
    if (!place) return '';
    var info = place.real && place.real.info;
    var dp = info && info.rating ? Number(info.rating) : 0;
    var dpn = info && info.reviews ? Number(info.reviews) : 0;
    var am = info && info.am ? Number(info.am) : 0;
    var xhs = info && info.xhs != null ? String(info.xhs) : '';
    var rt = WZ.content && WZ.content.ratings;
    if (rt && rt.lookup && !dp && !am) {
      var r = rt.lookup(place.name);
      if (r) { dp = Number(r.dp) || 0; dpn = Number(r.dpn) || 0; am = Number(r.am) || 0; xhs = r.xhs != null ? String(r.xhs) : ''; }
    }
    var seg = [];
    if (dp) seg.push('大众点评 ' + dp.toFixed(1) + (dpn ? '（' + dpn + '评）' : ''));
    if (am) seg.push('高德 ' + am.toFixed(1));
    seg.push('小红书 ' + (xhs || '未采'));
    return (dp || am) ? seg.join(' · ') : '暂无平台评分（宁空勿编）';
  };
  ui.showStay = function (place, knowledgeText, onDone, opts) {
    ensureLayers();
    if (stayEl) dismissStay();
    place = place || {};
    opts = opts || {};
    var k = findKnowledge(place.knowledgeId);
    var text = knowledgeText || (k && k.text) || '';
    var src = k && k.source;
    var c = el('div', 'stay-card stay-front pop');
    c.setAttribute('role', 'status');
    var head = el('div', 'stay-head');
    if (WZ.characters && (place.types || []).some(function (t) { return t === 'food' || t === 'shop'; })) {
      var host = el('img', 'stay-host');
      host.src = WZ.characters.src('shopkeeper', true); host.alt = '店铺接待吉祥物';
      host.onerror = function () { host.remove(); };
      head.appendChild(host);
    }
    head.appendChild(el('span', null, (TYPE_ICONS[(place.types || [])[0]] || '📍') + ' 停站'));
    head.appendChild(el('b', null, place.name || place.id || ''));
    head.appendChild(el('span', 'muted small', '+' + (place.stayMin != null ? place.stayMin : P('stayMin', 32)) + ' 分钟'));
    c.appendChild(head);
    c.appendChild(el('div', 'stay-rating', WZ.ratingText(place))); // PRD-v4 §2.3 三平台评分行
    var sf = realFacts(place);
    if (sf) c.appendChild(el('div', 'place-real stay-real', sf));
    // 进店逐个表态（PRD-v4 §2.2）：opts.score.lines 存在时按 ±分渲染，逐条 0.3 秒错开
    var guests = (WZ.main && WZ.main.run && WZ.main.run.state && WZ.main.run.state.guests) || [];
    var byId = {};
    guests.forEach(function (g) { byId[g.id] = g; });
    var G = WZ.guests;
    var voices = el('div', 'stay-voices');
    if (opts.score && Array.isArray(opts.score.lines) && opts.score.lines.length) {
      opts.score.lines.forEach(function (ln, i) {
        var g = byId[ln.guestId] || {};
        var row = el('div', 'sv-row');
        row.style.animationDelay = (i * 0.3) + 's';
        row.appendChild(avatar(g.tag, 24));
        row.appendChild(el('span', 'sv-text', (g.name ? g.name + ' ' : '') + '「' + ln.say + '」'));
        var b = el('b', ln.pts >= 0 ? 'plus' : 'minus', (ln.pts >= 0 ? '+' : '') + ln.pts);
        row.appendChild(b);
        voices.appendChild(row);
      });
    } else {
      guests.forEach(function (g) {
        if (g.status !== 'follow') return;
        var row = el('div', 'sv-row');
        row.appendChild(avatar(g.tag, 24));
        // PRD-v3 P1：满足者说对店的评价；未满足者说「此时此地」的反应（不再复读开场白）
        var say = g.satisfied
          ? G.text(WZ.content, g.tag, 'resolved', function () { return 0; }, { place: place.name || '' })
          : (G.placeReaction(WZ.content, g.tag, (place.types || [])[0]) || g.line || tagInfo(g.tag).fallback);
        row.appendChild(el('span', 'sv-text', '「' + say + '」'));
        if (g.satisfied) row.appendChild(el('span', 'sv-star', '⭐'));
        voices.appendChild(row);
      });
    }
    if (voices.childNodes.length) c.appendChild(voices);
    if (opts.score && opts.score.total != null) {
      var total = el('div', 'stay-total');
      total.appendChild(el('b', opts.score.total >= 0 ? 'plus' : 'minus', (opts.score.total >= 0 ? '+' : '') + opts.score.total + ' 分'));
      c.appendChild(total);
    }
    if (text) {
      c.appendChild(el('div', 'stay-knowledge', '温州一句话 · ' + text));
      if (src) c.appendChild(el('div', 'stay-src', '出处：' + src));
    }
    var foot = el('div', 'stay-foot');
    foot.appendChild(btn('继续出发', 'btn-primary btn-block', function () { dismissStay(onDone); }));
    c.appendChild(foot);
    dock.appendChild(c);
    stayEl = c;
  };
  ui.hideStay = function () { dismissStay(); }; // PRD-v3：onEnd 时清残留（main.js 调用）
  ui.isStayOpen = function () { return !!stayEl; };

  // ========== 中断条（底部两按钮，8 秒默认 b） ==========
  var interruptEl = null;
  // ========== 游客面板（10/24 #3 完整心声 + #10 哄一哄） ==========
  // g: 规则层游客对象（含 msgs 最近 5 条、patience、calmLeft）；h: { onCalm(id), onClose() , calmMin, calmUp }
  var guestEl = null;
  ui.showGuest = function (g, h) {
    ensureLayers();
    ui.hideGuest(true);
    h = h || {};
    var t = tagInfo(g.tag);
    var c = el('div', 'guest-panel');
    c.setAttribute('role', 'dialog');
    var head = el('div', 'gp-head');
    head.appendChild(avatar(g.tag, 44));
    var hb = el('div', 'gp-hb');
    hb.appendChild(el('b', null, (g.name && g.name !== t.name ? g.name + ' · ' : '') + t.name));
    hb.appendChild(el('div', 'gp-line', '「' + (g.line || t.fallback) + '」'));
    head.appendChild(hb);
    head.appendChild(btn('×', 'sc-x', function () { ui.hideGuest(); }));
    c.appendChild(head);
    var pc = Math.round(g.patience != null ? g.patience : 100);
    var pr = el('div', 'gp-pat' + (pc <= 0 ? ' zero' : pc < 50 ? ' low' : ''));
    pr.appendChild(el('span', null, '耐心'));
    pr.appendChild(hearts(pc, 1));
    pr.appendChild(el('span', 'gp-state', g.satisfied ? '😊 需求已满足' : pc <= 0 ? '😶 不想理你了' : pc < 50 ? '😣 快没耐心了' : g.status === 'sit' ? '🪑 坐下了' : ''));
    c.appendChild(pr);
    c.appendChild(el('div', 'gp-title', '他今天说过的话（最近 5 句）'));
    var ul = el('div', 'gp-msgs');
    var msgs = (g.msgs || []).slice().reverse();
    if (!msgs.length) ul.appendChild(el('div', 'gp-msg ' + (h.preview && /😊/.test(h.preview) ? 'good' : h.preview && /😟/.test(h.preview) ? 'bad' : 'info'), h.preview ? '看了路线：' + h.preview : '还没开口。'));
    msgs.forEach(function (m) {
      var row = el('div', 'gp-msg ' + (m.tone || 'info'));
      row.appendChild(el('span', 'gp-at', fmtClock(m.at)));
      row.appendChild(el('span', 'gp-text', m.text));
      ul.appendChild(row);
    });
    c.appendChild(ul);
    c.appendChild(el('div', 'gp-legend small muted', '绿 = 被照顾到了　红 = 在抱怨　灰 = 随口一说'));
    var left = g.calmLeft != null ? g.calmLeft : P('calmTimes', 2);
    var calmable = g.status === 'sit' || pc < 100;
    var can = left > 0 && calmable && g.status !== 'lost' && g.status !== 'runaway' && g.status !== 'home';
    var label = can ? '哄一哄 · 花' + (h.calmMin || P('calmCostMin', 2)) + '分钟 · 耐心+' + (h.calmUp || P('calmPatience', 30)) + '% · 剩' + left + '次'
      : g.status === 'runaway' ? '他跑远了，先去把他接回来' : g.status === 'lost' ? '他没跟上，得回去找' : left > 0 && !calmable ? '他现在心情不错，不用哄' : '今天哄不动了（每人最多 ' + P('calmTimes', 2) + ' 次）';
    var calm = btn(label, can ? 'btn-primary btn-block' : 'btn-ghost btn-block', function () { if (can && h.onCalm) h.onCalm(g.id); });
    calm.disabled = !can || !h.onCalm;
    c.appendChild(calm);
    // 提示词 10「买个小吃」→ 不加金钱：改成「带他去最近能解决的地方」，花的是步行时间
    if (h.fix && !g.satisfied && g.status === 'follow') {
      var fx = btn(h.fix.label, 'btn-ghost btn-block gp-fix', function () { ui.hideGuest(); h.fix.go(); });
      c.appendChild(fx);
    }
    root.appendChild(c);
    guestEl = c; guestEl._close = h.onClose;
    return c;
  };
  ui.hideGuest = function (silent) {
    if (!guestEl) return;
    var e = guestEl, cb = e._close; guestEl = null;
    if (e.parentNode) e.parentNode.removeChild(e);
    if (!silent && cb) cb();
  };
  ui.isGuestOpen = function () { return !!guestEl; };
  // 提示词 4：长按旗子的推荐理由浮层（一句话，3 秒自动消失，点空白也关）
  var flagTipEl = null;
  ui.flagTip = function (text, sx, sy) {
    ensureLayers();
    if (flagTipEl && flagTipEl.parentNode) flagTipEl.parentNode.removeChild(flagTipEl);
    var t = el('div', 'flag-tip', text);
    var cv = document.getElementById('game'), a = root.getBoundingClientRect(), r = cv ? cv.getBoundingClientRect() : a;
    t.style.left = Math.max(8, Math.min((r.left - a.left) + (sx || 0) - 110, (r.right - a.left) - 228)) + 'px';
    t.style.top = Math.max(8, (r.top - a.top) + (sy || 0) - 64) + 'px';
    root.appendChild(t); flagTipEl = t;
    function close() { if (t.parentNode) t.parentNode.removeChild(t); document.removeEventListener('pointerdown', close, true); }
    setTimeout(close, 3000);
    setTimeout(function () { document.addEventListener('pointerdown', close, true); }, 50);
  };

  ui.showInterrupt = function (spec, cb) {
    ensureLayers();
    spec = spec || {};
    if (interruptEl && interruptEl.parentNode) interruptEl.parentNode.removeChild(interruptEl);
    var box = el('div', 'interrupt');
    box.setAttribute('role', 'alertdialog');
    var title = el('div', 'interrupt-title');
    title.appendChild(el('span', null, spec.title || '怎么办？'));
    var ring = el('span', 'ring');
    ring.style.marginLeft = 'auto';
    title.appendChild(ring);
    box.appendChild(title);
    var row = el('div', 'btn-row');
    var done = false;
    var TOTAL = P('interruptMs', 8000), start = Date.now(), raf = 0, timer = 0;
    function finish(choice) {
      if (done) return; done = true;
      clearTimeout(timer); cancelAnimationFrame(raf);
      box.classList.add('out');
      box.style.animation = REDUCED ? 'none' : 'dock-out 0.2s ease-in both';
      setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); if (interruptEl === box) interruptEl = null; }, REDUCED ? 0 : 200);
      cb && cb(choice);
    }
    var ba = btn((spec.a && spec.a.label) || '去', null, function () { finish('a'); });
    var bb = btn((spec.b && spec.b.label) || '算了', 'btn-primary', function () { finish('b'); });
    row.appendChild(ba); row.appendChild(bb);
    box.appendChild(row);
    dock.appendChild(box);
    interruptEl = box;
    function tick() {
      var p = Math.min(1, (Date.now() - start) / TOTAL);
      ring.style.setProperty('--p', String(Math.round((1 - p) * 100)));
      if (p < 1 && !done) raf = requestAnimationFrame(tick);
    }
    tick();
    timer = setTimeout(function () { finish('b'); }, TOTAL);
  };

  // ========== 名人卡（PRD-v2 F2：立绘 + 原作句 + 描字小游戏） ==========
  // F2a：24×24 运行时像素立绘（零图片资产）
  var PORTRAITS = {
    xie_lingyun:  { robe: '#3e7c6a', robeD: '#2c584b', hat: '#24523c', skin: '#f3cba5', hair: '#1c1c1c', acc: '#ffd166' },
    wang_xizhi:   { robe: '#5a4a8a', robeD: '#43366a', hat: '#2c2440', skin: '#f3cba5', hair: '#3a3a3a', acc: '#e8e8e8' },
    wen_tianxiang:{ robe: '#4a4a58', robeD: '#35353f', hat: '#1f1f2e', skin: '#e8c39e', hair: '#22222a', acc: '#b3261e' },
    su_buqing:    { robe: '#6e7480', robeD: '#565b66', hat: '#8a8f99', skin: '#f3cba5', hair: '#9a9a9a', acc: '#35e0e0' },
  };
  function pixelPortrait(who) {
    try {
      var p = PORTRAITS[who] || PORTRAITS.su_buqing;
      var cv = document.createElement('canvas'); cv.width = 24; cv.height = 24;
      var g = cv.getContext('2d');
      var px = function (x, y, w, h, col) { g.fillStyle = col; g.fillRect(x, y, w, h); };
      px(4, 14, 16, 10, p.robe);  px(4, 14, 3, 10, p.robeD); px(11, 15, 2, 8, p.robeD); // 袍+侧影+衣襟
      px(8, 4, 8, 8, p.skin);     px(8, 4, 8, 2, p.hair);                            // 脸+发
      px(10, 8, 1, 1, '#1b1b1b'); px(13, 8, 1, 1, '#1b1b1b');                          // 眼
      px(7, 2, 10, 3, p.hat);     px(6, 5, 1, 3, p.hat); px(17, 5, 1, 3, p.hat);     // 冠
      px(6, 17, 2, 2, p.acc);     px(16, 16, 3, 4, p.acc);                           // 配饰
      var img = el('img', 'celeb-portrait');
      img.src = cv.toDataURL();
      img.alt = '';
      return img;
    } catch (e) { return null; }
  }

  // 10/24 提示词 8：谢灵运全身像素立绘（32×44，头巾 + 执杖），放大 2 倍显示约 64px 宽
  function xieFigure() {
    try {
      var cv = document.createElement('canvas'); cv.width = 32; cv.height = 44;
      var g = cv.getContext('2d');
      var px = function (x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); };
      var ink = '#2E3A33';
      // 杖（右手执，竹节）
      px(25, 8, 2, 34, '#7E5527'); px(25, 14, 2, 1, '#B98A55'); px(25, 22, 2, 1, '#B98A55'); px(25, 30, 2, 1, '#B98A55'); px(24, 7, 4, 2, '#5c3b19');
      // 袍（青绿，左上受光）
      px(8, 20, 15, 20, '#3e7c6a'); px(8, 20, 4, 20, '#57a08a'); px(19, 20, 4, 20, '#2c584b');
      px(14, 20, 2, 18, '#2c584b');                 // 衣襟
      px(7, 38, 17, 3, '#2c584b');                  // 下摆
      px(9, 41, 4, 2, ink); px(18, 41, 4, 2, ink); // 鞋
      px(8, 27, 15, 2, '#d9b45a');                  // 腰带
      px(22, 22, 4, 4, '#f3cba5');                  // 右手握杖
      px(5, 22, 4, 8, '#3e7c6a'); px(5, 28, 3, 3, '#f3cba5'); // 左袖
      // 头：脸 + 胡须
      px(11, 9, 10, 10, '#f3cba5'); px(11, 9, 2, 10, '#f8dcc0');
      px(13, 13, 1, 1, ink); px(18, 13, 1, 1, ink);           // 眼
      px(13, 17, 6, 3, '#3a3a3a'); px(15, 20, 2, 2, '#3a3a3a'); // 须
      // 头巾（幞头：深色软巾 + 两条垂脚）
      px(10, 5, 12, 5, '#24523c'); px(11, 3, 10, 3, '#24523c'); px(12, 2, 8, 1, '#2f6a4e');
      px(9, 8, 2, 7, '#24523c'); px(21, 8, 2, 7, '#24523c');   // 垂脚
      px(12, 4, 4, 1, '#3d8a66');                              // 高光
      var img = el('img', 'xie-fig'); img.src = cv.toDataURL(); img.alt = '谢灵运';
      return img;
    } catch (e) { return null; }
  }

  // 问答对话框：屏幕下方三分之一，不遮地图行走区。q=null 时是彩蛋对话（谢公只说风景）
  // o: { q:{q,options,answer,explain,source}|null, line:彩蛋台词, onAnswer(right), onDone() }
  var quizEl = null;
  ui.showQuiz = function (o) {
    ensureLayers();
    ui.hideQuiz();
    o = o || {};
    var d = el('div', 'quiz-dlg');
    d.setAttribute('role', 'dialog');
    var who = el('div', 'qd-who');
    var fig = xieFigure(); if (fig) who.appendChild(fig);
    who.appendChild(el('div', 'qd-name', '谢灵运'));
    d.appendChild(who);
    var bub = el('div', 'qd-bubble');
    var q = o.q;
    bub.appendChild(el('div', 'qd-say', q ? '小友，我谢公考你一句：' + q.q : (o.line || '小友，这一路山水，都是诗。')));
    var row = el('div', 'qd-opts');
    var foot = el('div', 'qd-foot');
    var answered = false;
    if (q) {
      q.options.forEach(function (opt, i) {
        var b = btn(opt, 'qd-opt', function () {
          if (answered) return; answered = true;
          var right = i === q.answer;
          b.classList.add(right ? 'right' : 'wrong');
          if (!right && row.children[q.answer]) row.children[q.answer].classList.add('right');
          Array.prototype.forEach.call(row.children, function (x) { x.disabled = true; });
          if (WZ.sfx) WZ.sfx.play(right ? 'win' : 'drop');
          var res = el('div', 'qd-res ' + (right ? 'ok' : 'no'));
          res.appendChild(el('b', null, right ? '对喽！游客们都在鼓掌。' : '差一点——是「' + q.options[q.answer] + '」。游客叹了口气。'));
          if (q.explain) res.appendChild(el('div', 'qd-ex', q.explain));
          if (q.source) res.appendChild(el('div', 'qd-src', '出处：' + q.source));
          bub.insertBefore(res, foot);
          skip.textContent = '继续走'; skip.classList.add('btn-primary');
          o.onAnswer && o.onAnswer(right);
        });
        row.appendChild(b);
      });
      bub.appendChild(row);
    }
    d.appendChild(bub);
    var skip = btn(q ? '点头走过' : '好，接着走', 'qd-skip', function () { ui.hideQuiz(); o.onDone && o.onDone(answered); });
    foot.appendChild(skip);
    bub.appendChild(foot);
    dock.appendChild(d);
    quizEl = d;
    requestAnimationFrame(function () { d.classList.add('on'); });
    return d;
  };
  ui.hideQuiz = function () { if (quizEl && quizEl.parentNode) quizEl.parentNode.removeChild(quizEl); quizEl = null; };

  // F2d：描"永"字小游戏。沿金点滑动，走完即成（成功=陪他一会儿）；限时 12 秒
  function miniGame(container, onDone) {
    var W = 240;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = W; cv.className = 'mg-canvas';
    container.appendChild(cv);
    var g = cv.getContext('2d');
    var PTS = [[120, 36], [120, 118], [76, 196], [168, 88], [196, 168]]; // 「永」意笔五段
    var seg = 0, cur = null, done = false, timer = 0;
    function draw() {
      g.clearRect(0, 0, W, W);
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 16;
      g.beginPath();
      PTS.forEach(function (p, i) { if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
      g.stroke();
      g.strokeStyle = '#ffd166'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(PTS[0][0], PTS[0][1]);
      for (var i = 1; i <= seg; i++) g.lineTo(PTS[i][0], PTS[i][1]);
      if (seg < PTS.length - 1 && cur) g.lineTo(cur[0], cur[1]);
      g.stroke();
      PTS.forEach(function (p, i) {
        g.beginPath(); g.arc(p[0], p[1], i <= seg ? 5 : 7, 0, Math.PI * 2);
        g.fillStyle = i <= seg ? '#ffd166' : 'rgba(255,209,102,0.35)';
        g.fill();
      });
    }
    function pos(ev) {
      var r = cv.getBoundingClientRect();
      var t = ev.touches ? ev.touches[0] : ev;
      return [(t.clientX - r.left) * (W / r.width), (t.clientY - r.top) * (W / r.height)];
    }
    function finish(ok) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerdown', onMove);
      onDone(ok);
    }
    function onMove(ev) {
      if (done || seg >= PTS.length - 1) return;
      var p = pos(ev); cur = p;
      var d = Math.hypot(p[0] - PTS[seg + 1][0], p[1] - PTS[seg + 1][1]);
      if (d < 22) {
        seg += 1;
        if (WZ.sfx) WZ.sfx.play('brush');
        if (seg === PTS.length - 1) { draw(); finish(true); return; }
      }
      draw();
    }
    cv.style.touchAction = 'none';
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerdown', onMove);
    if (REDUCED) { later(function () { finish(true); }, 600); }
    else { timer = setTimeout(function () { finish(false); }, 12000); } // 超时 = 点头走过
    draw();
    return finish;
  }

  ui.showCelebrity = function (card, onChoice) {
    card = card || {};
    var pg = page('page-celeb dim');
    var scene = el('div', 'celeb-scene');
    var c = el('div', 'celeb-card');
    c.setAttribute('role', 'button');
    c.setAttribute('tabindex', '0');
    c.setAttribute('aria-label', '名人卡，点击跳过动画');
    var back = el('div', 'face back');
    var k = findKnowledge(card.knowledgeId);
    back.appendChild(el('div', null, k ? '知识点 · ' + k.text : '温州 · 名人'));
    c.appendChild(back);
    var front = el('div', 'face front');
    var port = pixelPortrait(card.who);
    if (port) front.appendChild(port);
    front.appendChild(el('div', 'celeb-name', card.name || '路人'));
    if (card.title) front.appendChild(el('div', 'celeb-title', card.title));
    front.appendChild(el('div', 'celeb-text', card.text || ''));
    if (card.quote && card.quote.text) { // F2b：原作句展示（数据在 buildCard 里早就备好）
      var q = el('div', 'celeb-quote');
      q.appendChild(el('div', 'celeb-quote-text', '「' + card.quote.text + '」'));
      q.appendChild(el('div', 'celeb-quote-src', '原作 · ' + (card.quote.source || '')));
      front.appendChild(q);
    }
    var isOriginal = !!(card.isOriginal || card.original);
    front.appendChild(el('div', 'celeb-src', isOriginal ? '原作' : 'AI 代拟，非原作'));
    if (WZ.tts && WZ.tts.supported()) { // 「听他说」：读这一句台词，关卡片即停；行内样式避免动 style.css
      var ttsBtn = btn('🔊 听他说', 'btn-ghost', function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (WZ.tts.speaking()) { WZ.tts.stop(); ttsBtn.textContent = '🔊 听他说'; return; }
        if (WZ.tts.speak(card.text, card.who, function () { ttsBtn.textContent = '🔊 听他说'; })) ttsBtn.textContent = '⏹ 停止';
      });
      ttsBtn.setAttribute('style', 'display:block;margin:6px auto 0;padding:4px 16px;border-radius:999px;font-size:13px;');
      front.appendChild(ttsBtn);
    }
    c.appendChild(front);
    scene.appendChild(c);
    pg.appendChild(scene);

    var foot = el('div', 'celeb-foot btn-row');
    var done = false;
    function pick(v) { if (done) return; done = true; WZ.tts && WZ.tts.stop(); onChoice && onChoice(v); }
    var playMode = card.ask === 'play' && card.playHint;
    var quizMode = !playMode && card.quiz && card.quiz.options;
    if (playMode) {
      // F2d：描字替代两按钮；成功 = 陪他一会儿，超时/跳过 = 点头走过
      var mg = el('div', 'mg');
      var hint = el('div', 'mg-hint', card.playHint + '：手指沿金点描一笔');
      mg.appendChild(hint);
      foot.appendChild(mg);
      foot.appendChild(btn('跳过（不描了）', 'btn-ghost btn-block', function () { finishMG(false); }));
      foot.classList.add('mg-foot');
    } else if (quizMode) {
      // PRD-v3 P2：典故问答（谢灵运对句 / 文天祥点兵）——答对 = 陪他一会儿
      var qz = el('div', 'quiz');
      var qh = el('div', 'quiz-q');
      qh.appendChild(el('span', 'quiz-tag', card.ask === 'talk' ? '点兵' : '谢公考你'));
      qh.appendChild(el('div', 'quiz-hint', String(card.quiz.hint || '').replace(/^谢公考你[一句]*[：:]\s*/, '')));
      qz.appendChild(qh);
      if (card.ask === 'talk' && card.quiz.heads) { // 点兵：剪影里数少了几人
        var sil = el('div', 'quiz-sil');
        for (var si = 0; si < card.quiz.heads - card.quiz.missing; si++) sil.appendChild(el('span', 'quiz-head'));
        qz.appendChild(sil);
      }
      var opts = el('div', 'quiz-opts');
      var answered = false;
      card.quiz.options.forEach(function (opt, oi) {
        var ob = btn(opt, 'quiz-opt', function () {
          if (answered) return;
          answered = true;
          var right = oi === card.quiz.answer;
          ob.classList.add(right ? 'right' : 'wrong');
          if (!right && opts.children[card.quiz.answer]) opts.children[card.quiz.answer].classList.add('right');
          Array.prototype.forEach.call(opts.children, function (x) { x.disabled = true; });
          if (WZ.sfx) WZ.sfx.play(right ? 'win' : 'drop');
          qz.appendChild(el('div', right ? 'quiz-win' : 'quiz-lose', right ? (card.quiz.win || '对。') : '差一点。正确答案是「' + card.quiz.options[card.quiz.answer] + '」。'));
          if (card.quiz.explain) qz.appendChild(el('div', 'quiz-explain', card.quiz.explain));
          if (card.quiz.source) qz.appendChild(el('div', 'quiz-src', '出处：' + card.quiz.source));
          if (right) later(function () { pick('stay'); }, REDUCED ? 0 : 2600); // 答对 = 陪他一会儿
        });
        opts.appendChild(ob);
      });
      qz.appendChild(opts);
      foot.appendChild(qz);
      foot.appendChild(btn('点头走过', 'btn-ghost btn-block', function () { pick('pass'); }));
      foot.classList.add('mg-foot');
    } else {
      var stayLabel = el('span');
      stayLabel.appendChild(document.createTextNode('陪他一会儿'));
      stayLabel.appendChild(el('span', 'btn-sub', '+' + P('stayMin', 32) + ' 分钟'));
      foot.appendChild(btn(stayLabel, 'btn-primary', function () { pick('stay'); }));
      foot.appendChild(btn('点头走过', null, function () { pick('pass'); }));
    }
    pg.appendChild(foot);

    var ready = false;
    function settle() { if (ready) return; ready = true; c.classList.add('done'); foot.classList.add('ready'); }
    c.addEventListener('click', settle);
    c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); settle(); } });
    c.addEventListener('animationend', settle);
    later(settle, REDUCED ? 0 : 900); // 兜底：动画 0.6–0.9 秒内到位
    setOverlay(pg);
    if (playMode) {
      settle();
      var finishMG = function (ok) { if (WZ.sfx && ok) WZ.sfx.play('win'); pick(ok ? 'stay' : 'pass'); };
      miniGame(foot.querySelector('.mg') || foot, function (ok) { finishMG(ok); });
    } else if (quizMode) {
      if (REDUCED) settle(); // 10/24：答题也先播翻卡出场，翻完（≤0.9 秒）题目再出现
    }
  };

  // ========== 顶部横幅（PRD-v2 F3：开场名人不挡路，自动收起） ==========
  var bannerTimer = null;
  ui.showBanner = function (opts, onDone) {
    ensureLayers();
    ui.hideBanner();
    opts = opts || {};
    var b = el('div', 'banner');
    b.appendChild(avatar(opts.tag || 'any', 30));
    var body = el('div', 'banner-body');
    body.appendChild(el('b', null, opts.title || ''));
    body.appendChild(el('span', null, opts.text || ''));
    b.appendChild(body);
    bannerBox.appendChild(b);
    later(function () { b.classList.add('on'); }, 20);
    bannerTimer = setTimeout(function () {
      b.classList.add('out');
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); onDone && onDone(); }, REDUCED ? 0 : 300);
    }, P('bannerMs', 5000));
  };
  ui.hideBanner = function () {
    clearTimeout(bannerTimer); bannerTimer = null;
    if (bannerBox) while (bannerBox.firstChild) bannerBox.removeChild(bannerBox.firstChild);
  };

  // ========== 结算 ==========
  ui.showResult = function (result, handlers) {
    result = result || {}; handlers = handlers || {};
    var total = result.total || (result.guestLines && result.guestLines.length) || 5;
    var pg = page('page-result');
    pg.appendChild(el('h2', null, '今天到此为止'));

    var grid = el('div', 'res-grid');
    function cell(v, k, extra) { var c = el('div', 'card res-cell' + (extra ? ' ' + extra : '')); c.appendChild(el('div', 'v', v)); c.appendChild(el('div', 'k', k)); return c; }
    grid.appendChild(cell((result.broughtBack != null ? result.broughtBack : 0) + '/' + total, '带回家'));
    grid.appendChild(cell((result.remembered != null ? result.remembered : 0) + '/' + total + ' ⭐', '记住你'));
    grid.appendChild(cell(fmtClock(result.arriveMin), result.overtime ? '超时到家' : '到家时刻', result.overtime ? 'over' : ''));
    pg.appendChild(grid);

    var tt = el('div', 'res-title');
    tt.appendChild(el('div', 'k', '今天的称号'));
    tt.appendChild(el('div', 't', result.title || '向导'));
    pg.appendChild(tt);

    var body = el('div', 'scroll');
    if (result.reviews && result.reviews.length) { // v1.0 体验评审卡
      var avg = result.reviews.reduce(function (a, r) { return a + r.score; }, 0) / result.reviews.length;
      body.appendChild(el('div', 'res-sec', '体验评审 · ' + result.reviews.length + ' 位游客平均 ' + avg.toFixed(1) + ' 星'));
      var rv = el('div', 'res-reviews');
      result.reviews.forEach(function (r) {
        var card = el('div', 'card rev-card');
        var h = el('div', 'rev-head');
        h.appendChild(avatar(r.tag));
        h.appendChild(el('b', null, r.name || ''));
        var st = ''; for (var i = 1; i <= 5; i++) st += r.score >= i ? '★' : r.score >= i - 0.5 ? '☆' : '·';
        h.appendChild(el('span', 'rev-stars', st + ' ' + r.score.toFixed(1)));
        card.appendChild(h);
        card.appendChild(el('div', 'rev-comment', r.comment));
        if (r.pro) card.appendChild(el('div', 'rev-pro', '加分：' + r.pro));
        if (r.con) card.appendChild(el('div', 'rev-con', '扣分：' + r.con));
        if (r.question) card.appendChild(el('div', 'rev-q', '问你：' + r.question));
        rv.appendChild(card);
      });
      body.appendChild(rv);
    }
    body.appendChild(el('div', 'res-sec', '他们说'));
    var lines = el('div', 'res-lines');
    var byId = {};
    (result.guestLines || []).forEach(function (l) {
      var row = el('div', 'res-line');
      var tag = l.tag;
      if (!tag) { for (var k in TAGS) if (TAGS[k].name === l.name) tag = k; }
      row.appendChild(avatar(tag));
      row.appendChild(el('span', 'who', l.name || ''));
      row.appendChild(el('span', 'say', (l.text || '') + (l.star ? ' ⭐' : '')));
      lines.appendChild(row);
      byId[l.id] = l;
    });
    body.appendChild(lines);

    if (result.celebrities && result.celebrities.length) { // F8：今天遇见的人（立绘行）
      var metWrap = el('div');
      metWrap.appendChild(el('div', 'res-sec', '今天遇见的人'));
      var met = el('div', 'res-met');
      result.celebrities.forEach(function (who) {
        var p = pixelPortrait(who);
        if (p) met.appendChild(p);
        else met.appendChild(el('span', 'res-met-name', who));
      });
      metWrap.appendChild(met);
      body.appendChild(metWrap);
    }
    if (result.celebrityLine && result.celebrityLine.text) { // F8：苏步青结算台词（此前从未渲染，评审 L11）
      var cl = el('div', 'res-celebrity');
      cl.appendChild(el('b', null, result.celebrityLine.name || ''));
      cl.appendChild(el('span', null, '「' + result.celebrityLine.text + '」'));
      body.appendChild(cl);
    }
    // 带队积分（PRD-v4 §2.4）：最上面「带队积分 N」+ 评语；下面物料位
    if (result.score != null) {
      var scN = Number(result.score) || 0;
      var verdict = scN >= 80 ? '带得漂亮' : scN >= 40 ? '带得不错' : scN >= 15 ? '还行' : '没带好';
      var scWrap = el('div', 'res-sec', '带队积分');
      body.appendChild(scWrap);
      var scCard = el('div', 'score-card');
      scCard.appendChild(el('div', 'score-total', String(scN) + ' 分'));
      scCard.appendChild(el('div', 'score-bits', verdict + ' · 进了 ' + ((result.timeline || []).length) + ' 家店 · ' + fmtClock(result.arriveMin) + ' 回到游客中心'));
      body.appendChild(scCard);
      // 逐店 ±明细（PRD-v4 EVAL：走过的店）
      var logLines = result.scoreLog || [];
      if (logLines.length) {
        var slog = el('ul', 'res-know res-timeline');
        logLines.forEach(function (e) {
          var li = el('li', null, (e.name || '') + ' ' + (e.total >= 0 ? '+' : '') + e.total + ' 分');
          var sp = el('span', 'src', (e.lines || []).map(function (l) { return l.say + '（' + (l.pts >= 0 ? '+' : '') + l.pts + '）'; }).join(' · '));
          li.appendChild(sp);
          slog.appendChild(li);
        });
        body.appendChild(slog);
      }
      // 商家物料位（PRD-v4 §2.4）：全部标「演示用示例，非真实优惠」
      if (Array.isArray(result.promos) && result.promos.length) {
        body.appendChild(el('div', 'res-sec', '这一天解锁的商家物料'));
        var promoWrap = el('div', 'promo-wrap');
        result.promos.forEach(function (pm) {
          var pc = el('div', 'promo');
          pc.appendChild(el('div', 'promo-t', '🎫 ' + pm.t));
          pc.appendChild(el('div', 'promo-n', (pm.name && pm.name.name) || pm.placeId || ''));
          pc.appendChild(el('div', 'promo-note', '演示用示例，非真实优惠'));
          promoWrap.appendChild(pc);
        });
        body.appendChild(promoWrap);
      }
    }
    // 10/25 需求：回来后公布一天的行程（每站到达/离开时刻）
    if (Array.isArray(result.timeline) && result.timeline.length) {
      body.appendChild(el('div', 'res-sec', '今日行程公布'));
      var tl = el('ul', 'res-know res-timeline');
      result.timeline.forEach(function (t) {
        var li = el('li', null, fmtClock(t.arrive) + ' 到 ' + (t.name || t.placeId) + '（' + (t.region || '') + '）');
        var sp = el('span', 'src', fmtClock(t.arrive) + ' – ' + fmtClock(t.leave));
        li.appendChild(sp);
        tl.appendChild(li);
      });
      body.appendChild(tl);
    }

    var know = (result.knowledge || []).slice(0, 3);
    body.appendChild(el('div', 'res-sec', '今天你认识了温州的 ' + know.length + ' 件事')); // F8：条数按实际
    var ul = el('ul', 'res-know');
    know.forEach(function (id) {
      var k = findKnowledge(id);
      var li = el('li', null, k ? k.text : String(id));
      if (k && k.source) li.appendChild(el('span', 'src', '出处：' + k.source));
      ul.appendChild(li);
    });
    if (!ul.childNodes.length) ul.appendChild(el('li', 'muted', '这一局走得太急，什么都没来得及看。'));
    body.appendChild(ul);
    if (result.wentBack) body.appendChild(el('p', 'small muted center', '你回去了一趟。'));
    pg.appendChild(body);

    var foot = el('div', 'res-foot');
    foot.appendChild(btn('再来一局', 'btn-primary btn-block', function () { handlers.onAgain && handlers.onAgain(); }));
    var row = el('div', 'btn-row');
    if (typeof handlers.onWhere === 'function') row.appendChild(btn('我写的那句去哪了', null, handlers.onWhere));
    if (typeof handlers.onBoards === 'function') row.appendChild(btn('排行榜', null, handlers.onBoards));
    if (row.childNodes.length) foot.appendChild(row);
    pg.appendChild(foot);
    setOverlay(pg);
  };

  // ========== 结尾五幕（提示词 11）：一屏一幕，黑底白字，同幕各行间隔 0.3 秒淡入；
  // 底部「轻点屏幕，继续」呼吸闪烁，点任意处进下一幕，不点 6 秒自动进；第五幕后换成［再来一局］，停住不动。无音乐无音效。
  // acts: [{k, lines:[...]}]（兼容旧格式字符串 / {t}）；opts: { finalLabel, onFinal }
  ui.showEpilogue = function (acts, onDone, opts) {
    opts = opts || {};
    acts = (acts || []).map(function (a) {
      if (typeof a === 'string') return { lines: a.split('\n') };
      return { k: a.k || '', lines: a.lines || String(a.t || '').split('\n') };
    }).filter(function (a) { return a.lines && a.lines.length; });
    if (WZ.music && WZ.music.stop) WZ.music.stop();
    var pg = page('epi epi-acts no-anim');
    pg.setAttribute('aria-live', 'polite');
    var box = el('div', 'epi-box'), hint = el('div', 'epi-hint', '轻点屏幕，继续');
    pg.appendChild(box); pg.appendChild(hint);
    setOverlay(pg);
    var HOLD = P('epilogueActMs', 6000), i = -1, timer = 0, last = false;
    function next() {
      if (last) return;
      clearTimeout(timer);
      i += 1;
      while (box.firstChild) box.removeChild(box.firstChild);
      var a = acts[i];
      a.lines.forEach(function (t, j) {
        var ln = el('div', 'epi-l', t);
        ln.style.transitionDelay = (REDUCED ? 0 : j * 0.3) + 's';
        box.appendChild(ln);
      });
      requestAnimationFrame(function () { requestAnimationFrame(function () { Array.prototype.forEach.call(box.children, function (x) { x.classList.add('on'); }); }); });
      if (i >= acts.length - 1) {
        last = true;
        hint.style.display = 'none';
        var again = btn(opts.finalLabel || '再来一局', 'epi-again', function () { onDone && onDone(); });
        pg.appendChild(again);
        setTimeout(function () { again.classList.add('on'); }, (a.lines.length * 300) + 600);
        return;
      }
      timer = setTimeout(next, HOLD);
    }
    pg.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.epi-again')) return; next(); });
    if (!acts.length) { onDone && onDone(); return; }
    next();
  };

  // ========== 「我写的那句去哪了」（PRD-v2 F7：全屏页替代 1.5 秒 toast） ==========
  ui.showMine = function (m, onClose) {
    m = m || {};
    var pg = page('page-mine');
    pg.appendChild(el('h2', null, '我写的那句去哪了'));
    var card = el('div', 'card mine-card');
    card.appendChild(el('div', 'mine-label', '你开场写下的话'));
    card.appendChild(el('div', 'mine-text', m.text ? '「' + m.text + '」' : '（还没有记录）'));
    pg.appendChild(card);
    var stats = el('div', 'res-grid');
    [['去过的队伍', m.assigned], ['被带回家', m.broughtHome]].forEach(function (kv) {
      var c2 = el('div', 'card res-cell');
      c2.appendChild(el('div', 'v', String(kv[1] != null ? kv[1] : 0)));
      c2.appendChild(el('div', 'k', kv[0]));
      stats.appendChild(c2);
    });
    pg.appendChild(stats);
    pg.appendChild(el('p', 'mine-note', (m.assigned > 0)
      ? '有 ' + m.assigned + ' 队陌生人带着你这句话，正在温州的街上走。'
      : '你的话还在池子里，等下一队人来抽中它。'));
    var foot = el('div', 'res-foot');
    foot.appendChild(btn('返回', 'btn-primary btn-block', function () { if (typeof onClose === 'function') onClose(); else restorePrev(); }));
    pg.appendChild(foot);
    setOverlay(pg, { keepPrev: true });
  };

  // ========== 难度 ==========
  function isUnlocked(unlocked, key) {
    if (key === 'easy') return true;
    if (unlocked === true) return true;
    if (!unlocked) return false;
    if (Array.isArray(unlocked)) return unlocked.indexOf(key) >= 0;
    if (typeof unlocked === 'object') return !!unlocked[key];
    return false;
  }
  ui.showDifficulty = function (unlocked, onPick) {
    var pg = page('page-diff');
    pg.appendChild(el('h2', null, '今天带几个人？'));
    pg.appendChild(el('p', 'hint', '第一局先从初级开始。'));
    var list = el('div', 'diff-list');
    DIFFS.forEach(function (d) {
      var ok = isUnlocked(unlocked, d.key);
      var b = el('button', 'diff');
      b.type = 'button';
      b.disabled = !ok;
      b.appendChild(el('span', 'diff-ico', ok ? d.icon : '🔒'));
      var body = el('div');
      body.appendChild(el('div', 'diff-name', d.name));
      body.appendChild(el('div', 'diff-desc', d.desc));
      b.appendChild(body);
      if (!ok) b.appendChild(el('span', 'diff-lock', '玩过一局后开放'));
      b.addEventListener('click', function () { if (ok) onPick && onPick(d.key); });
      list.appendChild(b);
    });
    pg.appendChild(list);
    setOverlay(pg);
  };

  // ========== 榜单 ==========
  ui.showBoards = function (data, onClose) {
    data = data || {};
    var TABS = [
      { key: 'score', name: '积分榜', unit: ' 分' },
      { key: 'remembered', name: '被记住榜', unit: ' ⭐' },
      { key: 'fastest', name: '最快榜', unit: ' 分钟' },
      { key: 'lost', name: '最丢人榜', unit: ' 人' }
    ];
    var pg = page('page-boards');
    pg.appendChild(el('h2', null, '排行榜'));
    var tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    var board = el('div', 'board scroll');
    board.setAttribute('role', 'tabpanel');
    var tabEls = {};
    function render(key) {
      TABS.forEach(function (t) { tabEls[t.key].setAttribute('aria-selected', t.key === key ? 'true' : 'false'); });
      while (board.firstChild) board.removeChild(board.firstChild);
      var items = data[key] || [];
      var unit = TABS.filter(function (t) { return t.key === key; })[0].unit;
      if (!items.length) { board.appendChild(el('div', 'board-empty', '还没有人上榜。')); return; }
      items.forEach(function (it, i) {
        var r = el('div', 'board-row');
        r.appendChild(el('span', 'rank', String(i + 1)));
        r.appendChild(el('span', 'seat', String(it.seat || '').slice(0, 4)));
        r.appendChild(el('span', 'name', it.name || '游客'));
        r.appendChild(el('span', 'val', (it.value != null ? it.value : '-') + unit));
        board.appendChild(r);
      });
    }
    TABS.forEach(function (t) {
      var b = el('button', 'tab', t.name);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { render(t.key); });
      tabEls[t.key] = b;
      tabs.appendChild(b);
    });
    pg.appendChild(tabs);
    pg.appendChild(board);
    var foot = el('div', 'board-foot');
    foot.appendChild(btn('返回', 'btn-block', function () { if (typeof onClose === 'function') onClose(); else restorePrev(); }));
    pg.appendChild(foot);
    setOverlay(pg, { keepPrev: true });
    render('remembered');
  };

  // ========== toast ==========
  var toastTimer = null;
  ui.toast = function (text) {
    ensureLayers();
    while (toastBox.firstChild) toastBox.removeChild(toastBox.firstChild);
    clearTimeout(toastTimer);
    var m = el('div', 'toast-msg', text);
    m.setAttribute('role', 'status');
    toastBox.appendChild(m);
    toastTimer = setTimeout(function () {
      m.classList.add('out');
      setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, REDUCED ? 0 : 250);
    }, P('toastMs', 1500));
  };

  // 对外暴露少量常量，方便 main.js / 其它模块复用图标与颜色
  ui.TAGS = TAGS;
  ui.TYPE_ICONS = TYPE_ICONS;
  ui.filterText = filterText;
  ui.fmtClock = fmtClock;


// ========== 换商圈过场（PRD-v4 §3，10/25）：🚶/🚌 1.8 秒动画 ==========
ui.showTransit = function (o, onDone) {
  ensureLayers();
  o = o || {};
  var pg = el('div', 'page page-transit');
  pg.appendChild(el('div', 'transit-eyebrow', '换商圈'));
  pg.appendChild(el('h2', null, (o.from || '') + ' → ' + (o.to || '')));
  pg.appendChild(el('p', 'hint', (o.mode === '坐车' ? '🚌 坐车' : '🚶 步行') + ' 约 ' + (o.min || 0) + ' 分钟' + (o.at != null ? ' · ' + fmtClock(o.at) + ' 出发' : '')));
  var road = el('div', 'transit-road');
  var bus = el('div', 'transit-bus', o.mode === '坐车' ? '🚌' : '🚶');
  road.appendChild(bus);
  pg.appendChild(road);
  setOverlay(pg);
  setTimeout(function () { bus.style.left = 'calc(100% - 56px)'; }, 60);
  setTimeout(function () { if (onDone) onDone(); }, 1800);
};
})(window.WZ);