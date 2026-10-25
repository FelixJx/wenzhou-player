/* 温州玩家 · 1024分钟 —— 结尾（W3）
   WZ.ui.showEnding(result, onChoice(wentBack))
   节奏：全黑 0.3s 无过渡 → 打字机「天黑了。」停 2s → 「队伍回到出发点。」→ 灯亮：固定站位画人头，
   丢失者位置空着（不点名、不报数）→ 1.5s 后左侧巷口一个灰色小人剪影，不动 →
   两按钮同一行：[回去找他 +64 分钟(灰小字)] [继续回家]；8s 不选 = 继续回家。
   选回去 → 3 段各 1s：小人往回跑半步 / 黑屏「你跑回去了一趟。」/ 两个人走进光里 → onChoice(true)。
   使用结束升华背景音乐、无数字（除按钮旁的 +64 分钟）。若 result.lost 为空则直接 onChoice(false)。 */
window.WZ = window.WZ || {};
(function (WZ) {
  'use strict';

  var ui = WZ.ui = WZ.ui || {};
  var U = ui._;
  if (!U) { throw new Error('ending.js 需要在 ui.js 之后加载'); }
  var el = U.el, later = U.later, P = U.P, REDUCED = U.REDUCED;

  // 固定站位（百分比坐标），最多 7 人；玩家在最前
  var SLOTS = [
    [38, 56], [50, 53], [62, 56],
    [32, 66], [46, 68], [60, 68], [72, 64]
  ];
  var ME = [50, 80];
  var ALLEY_FIG = [8, 58];  // 巷口剪影位置

  function typewriter(target, text, onDone) {
    var cs = U.chars(text);
    target.textContent = '';
    if (REDUCED) { target.textContent = text; onDone && onDone(); return; }
    var caret = el('span', 'caret');
    target.appendChild(caret);
    var i = 0;
    (function step() {
      if (i < cs.length) {
        target.insertBefore(document.createTextNode(cs[i]), caret);
        i++;
        later(step, 140);
      } else {
        later(function () { if (caret.parentNode) caret.parentNode.removeChild(caret); onDone && onDone(); }, 200);
      }
    })();
  }

  function fig(cls, pos, tag) {
    var f = el('div', 'fig' + (cls ? ' ' + cls : ''));
    if (WZ.characters) {
      f.classList.add('fig-kit');
      var img = el('img');
      img.alt = ''; img.draggable = false;
      img.src = WZ.characters.src(cls === 'me' ? 'hero' : (tag || 'any'));
      img.onerror = function () { img.remove(); f.classList.remove('fig-kit'); };
      f.appendChild(img);
    }
    f.style.left = pos[0] + '%';
    f.style.top = pos[1] + '%';
    return f;
  }

  ui.showEnding = function (result, onChoice) {
    result = result || {};
    var lost = result.lost || [];
    var done = false;
    function choose(v) { if (done) return; done = true; onChoice && onChoice(!!v); }

    if (!lost.length) { choose(false); return; }

    var total = result.total || (result.guestLines && result.guestLines.length) || 5;
    // 用 guestLines 的顺序确定每人站位；丢失者的位置留空
    var order = (result.guestLines || []).map(function (l) { return l.id; });
    while (order.length < total) order.push('_' + order.length);
    var lostIdx = {};
    lost.forEach(function (id) { var i = order.indexOf(id); if (i >= 0) lostIdx[i] = true; });
    // 若 guestLines 缺失导致找不到丢失者，退而把最后几个位置留空
    if (!Object.keys(lostIdx).length) for (var n = 0; n < lost.length && n < total; n++) lostIdx[total - 1 - n] = true;

    var pg = el('div', 'page ending no-anim');
    pg.setAttribute('role', 'dialog');
    pg.setAttribute('aria-live', 'polite');
    var text = el('div', 'ending-text', '');
    pg.appendChild(text);

    var yard = el('div', 'yard');
    yard.appendChild(el('div', 'alley'));
    var me = fig('me', ME);
    yard.appendChild(me);
    for (var i = 0; i < total && i < SLOTS.length; i++) {
      if (lostIdx[i]) continue; // 位置空着
      yard.appendChild(fig('', SLOTS[i], (result.guestLines || [])[i] && result.guestLines[i].tag));
    }
    var missingGuest = (result.guestLines || []).filter(function (g) { return lost.indexOf(g.id) >= 0; })[0];
    var shadow = fig('shadow', ALLEY_FIG, missingGuest && missingGuest.tag);
    yard.appendChild(shadow);
    pg.appendChild(yard);

    var btns = el('div', 'ending-btns');
    var backLabel = el('span');
    backLabel.appendChild(document.createTextNode('回去找他'));
    backLabel.appendChild(el('span', 'cost', '+' + P('goBackMin', 64) + ' 分钟'));
    var bBack = U.btn(backLabel, null, function () { goBack(); });
    var bHome = U.btn('继续回家', null, function () { choose(false); });
    bBack.disabled = bHome.disabled = true;
    btns.appendChild(bBack);
    btns.appendChild(bHome);
    pg.appendChild(btns);

    U.setOverlay(pg);
    if (ui.hud && ui.hud.hide) ui.hud.hide();

    // t=0 全黑 0.3 秒
    later(function () {
      typewriter(text, '天黑了。', function () {
        later(function () {
          typewriter(text, '队伍回到出发点。', function () {
            later(lightsOn, 1500);
          });
        }, 2000);
      });
    }, 300);

    var decideTimer = null;
    function lightsOn() {
      text.style.opacity = '0';
      pg.classList.add('lit');
      later(function () { shadow.classList.add('on'); }, 1500);   // 巷口剪影出现，不动
      later(function () {
        btns.classList.add('on');
        bBack.disabled = bHome.disabled = false;
        try { bHome.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        // PRD-v2 F5：道德抉择交还玩家——默认不代选（0 = 不限时）；params.endingDecideMs>0 可恢复旧自动续走
        var decideMs = P('endingDecideMs', 0);
        if (decideMs > 0) decideTimer = later(function () { choose(false); }, decideMs);
      }, 2100);
    }

    function goBack() {
      if (done) return;
      clearTimeout(decideTimer);
      bBack.disabled = bHome.disabled = true;
      btns.classList.remove('on');
      // 第 1 段：小人往回跑半步
      me.classList.add('step');
      me.style.left = (ME[0] - 16) + '%';
      me.style.top = (ME[1] - 6) + '%';
      later(function () {
        // 第 2 段：黑屏一句话
        var black = el('div', 'ending-black', '你跑回去了一趟。');
        pg.appendChild(black);
        later(function () {
          // 第 3 段：两个人走进光里
          pg.removeChild(black);
          shadow.classList.remove('shadow');
          shadow.classList.add('step');
          shadow.style.left = (ME[0] - 10) + '%';
          shadow.style.top = (ME[1] - 2) + '%';
          me.style.left = ME[0] + '%';
          me.style.top = ME[1] + '%';
          later(function () { choose(true); }, 1000);
        }, 1000);
      }, 1000);
    }
  };

})(window.WZ);
