/* web/input.js —— 输入：触摸/鼠标点地面，桌面 WASD/方向键（W1）
 * attach(canvas, { onTap(x, y, ev), onKey(key, down) }) → { axis(), keys, detach() }
 * 坐标为相对画布左上角的 CSS 像素。
 */
(function (root) {
  'use strict';
  root.WZ = root.WZ || {};

  function normKey(key) {
    switch (key) {
      case 'w': case 'W': case 'ArrowUp': return 'up';
      case 's': case 'S': case 'ArrowDown': return 'down';
      case 'a': case 'A': case 'ArrowLeft': return 'left';
      case 'd': case 'D': case 'ArrowRight': return 'right';
      default: return null;
    }
  }

  function attach(canvas, h) {
    h = h || {};
    var keys = {};
    var hasPointer = typeof window !== 'undefined' && 'onpointerdown' in window;

    function pos(ev) {
      var r = canvas.getBoundingClientRect();
      return { x: ev.clientX - r.left, y: ev.clientY - r.top };
    }
    // 10/24 提示词 7/4：点 = 抬手时触发（没拖动、没长按）；拖动 = 平移地图；双指 = 缩放；按住 0.5 秒 = 长按
    var ptrs = {}, gest = null, lpTimer = 0;
    function count() { return Object.keys(ptrs).length; }
    function onPointerDown(ev) {
      if (ev.button != null && ev.button !== 0) return;
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      var p = pos(ev);
      ptrs[ev.pointerId] = p;
      if (count() === 1) {
        gest = { sx: p.x, sy: p.y, lx: p.x, ly: p.y, moved: false, long: false, pinch: false };
        clearTimeout(lpTimer);
        lpTimer = setTimeout(function () { if (gest && !gest.moved && !gest.pinch) { gest.long = true; if (h.onLongPress) h.onLongPress(gest.sx, gest.sy, ev); } }, 420); // 亲子适配：长按更快
      } else if (count() === 2 && gest) {
        gest.pinch = true; gest.moved = true; clearTimeout(lpTimer);
        var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]];
        gest.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      }
      if (ev.cancelable) ev.preventDefault();
    }
    function onPointerMove(ev) {
      if (!ptrs[ev.pointerId] || !gest) return;
      var p = pos(ev); ptrs[ev.pointerId] = p;
      if (gest.pinch && count() >= 2) {
        var ks = Object.keys(ptrs), a = ptrs[ks[0]], b = ptrs[ks[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        if (h.onPinch) h.onPinch(d / gest.d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
        gest.d0 = d;
        return;
      }
      if (!gest.moved && Math.hypot(p.x - gest.sx, p.y - gest.sy) > 14) { gest.moved = true; clearTimeout(lpTimer); } // 亲子适配：14px 才算拖动
      if (gest.moved && !gest.long && h.onDrag) h.onDrag(p.x - gest.lx, p.y - gest.ly);
      gest.lx = p.x; gest.ly = p.y;
    }
    function onPointerUp(ev) {
      if (!ptrs[ev.pointerId]) return;
      delete ptrs[ev.pointerId];
      clearTimeout(lpTimer);
      if (count() > 0) return;
      var g = gest; gest = null;
      if (g && !g.moved && !g.long && h.onTap) h.onTap(g.sx, g.sy, ev);
    }
    function onWheel(ev) { if (h.onPinch) { var p = pos(ev); h.onPinch(ev.deltaY < 0 ? 1.1 : 1 / 1.1, p.x, p.y); ev.preventDefault(); } }
    function onTouchStart(ev) {
      var t = ev.changedTouches && ev.changedTouches[0]; if (!t) return;
      var p = pos(t);
      if (h.onTap) h.onTap(p.x, p.y, ev);
      if (ev.cancelable) ev.preventDefault();
    }
    function prevent(ev) { if (ev.cancelable) ev.preventDefault(); }
    function isTyping() {
      var a = typeof document !== 'undefined' ? document.activeElement : null;
      return !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable));
    }
    function onKeyDown(ev) {
      if (isTyping()) return;
      var k = normKey(ev.key); if (!k) return;
      if (!keys[k]) { keys[k] = true; if (h.onKey) h.onKey(k, true); }
      ev.preventDefault();
    }
    function onKeyUp(ev) {
      var k = normKey(ev.key); if (!k) return;
      keys[k] = false; if (h.onKey) h.onKey(k, false);
    }
    function onBlur() { keys = {}; }

    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitUserSelect = 'none';
    if (hasPointer) {
      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
    } else { canvas.addEventListener('mousedown', function (ev) { var p = pos(ev); if (h.onTap) h.onTap(p.x, p.y, ev); }); canvas.addEventListener('touchstart', onTouchStart, { passive: false }); }
    canvas.addEventListener('touchmove', prevent, { passive: false });
    canvas.addEventListener('contextmenu', prevent);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return {
      keys: keys,
      // 键盘方向向量（已归一化）
      axis: function () {
        var x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
        if (x && y) { x *= 0.7071; y *= 0.7071; }
        return { x: x, y: y };
      },
      detach: function () {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('touchstart', onTouchStart);
        canvas.removeEventListener('touchmove', prevent);
        canvas.removeEventListener('contextmenu', prevent);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
      }
    };
  }

  root.WZ.input = { attach: attach, normKey: normKey };
})(typeof window !== 'undefined' ? window : globalThis);
