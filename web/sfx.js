// sfx.js —— 程序化音效（F9，零资产）。WebAudio 合成短音，失败静默降级为无声。
// 对外：WZ.sfx.init() / WZ.sfx.play(name) / WZ.sfx.setMuted(b) / WZ.sfx.muted
// init 必须在用户手势里调用（自动播放策略）；未 init 时 play() 直接丢弃。
(function (root) {
  'use strict';
  root.WZ = root.WZ || {};

  var ctx = null, master = null, muted = false, inited = false;
  var lastPlay = {};   // name → 时间戳，节流同类音效
  try { muted = root.localStorage && localStorage.getItem('wz_sfx_mute') === '1'; } catch (e) { /* file:// 某些环境 */ }

  function ensureCtx() {
    if (ctx || !inited) return ctx;
    return ctx;
  }

  function init() {
    if (inited) return true;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.1; // 提示词 10：整体调低
      master.connect(ctx.destination);
      inited = true;
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return true;
    } catch (e) { inited = false; return false; }
  }

  // 基础发声：osc 波形 + 频率包络 + 增益包络
  function tone(type, f0, f1, dur, vol, when) {
    var c = ensureCtx(); if (!c) return;
    var t = c.currentTime + (when || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  // 噪声脉冲（雨点/纸张感）
  function noise(dur, vol, when) {
    var c = ensureCtx(); if (!c) return;
    var t = c.currentTime + (when || 0);
    var n = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, n, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = c.createBufferSource(); src.buffer = buf;
    var g = c.createGain(); g.gain.value = vol;
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    src.connect(hp); hp.connect(g); g.connect(master);
    src.start(t);
  }

  // 音色表：name → 函数
  var SOUNDS = {
    bubble: function () { tone('sine', 520, 880, 0.09, 0.5); },
    heart: function () { tone('sine', 660, 990, 0.12, 0.6); tone('sine', 990, 1320, 0.1, 0.35, 0.06); },
    drop: function () { tone('triangle', 330, 165, 0.16, 0.6); },
    stay: function () { tone('sine', 523, 523, 0.1, 0.5); tone('sine', 784, 784, 0.14, 0.5, 0.09); },
    celeb: function () { tone('sine', 523, 523, 0.1, 0.4); tone('sine', 659, 659, 0.1, 0.4, 0.08); tone('sine', 784, 784, 0.1, 0.4, 0.16); tone('sine', 1047, 1047, 0.22, 0.45, 0.24); },
    win: function () { tone('sine', 523, 523, 0.09, 0.5); tone('sine', 659, 659, 0.09, 0.5, 0.07); tone('sine', 784, 784, 0.09, 0.5, 0.14); tone('sine', 1047, 1047, 0.3, 0.55, 0.21); },
    lose: function () { tone('triangle', 392, 392, 0.14, 0.5); tone('triangle', 311, 311, 0.14, 0.5, 0.12); tone('triangle', 233, 233, 0.3, 0.55, 0.24); },
    click: function () { tone('square', 880, 880, 0.03, 0.2); },
    back: function () { tone('sine', 392, 523, 0.18, 0.55); tone('sine', 523, 784, 0.24, 0.5, 0.16); },
    brush: function () { noise(0.12, 0.25); },
    rain: function () { noise(0.5, 0.12); },
    // 10/24 #10 情绪音：耐心掉一格（短促下滑）/ 跌破 50%（两声警示）/ 哄好了（上扬）
    tick: function () { tone('triangle', 440, 330, 0.07, 0.35); },
    warn: function () { tone('square', 494, 494, 0.08, 0.28); tone('square', 392, 392, 0.12, 0.28, 0.1); },
    calm: function () { tone('sine', 440, 660, 0.12, 0.45); tone('sine', 660, 880, 0.16, 0.4, 0.1); },
    // 提示词 10：掉耐心 = 低沉叹气（8-bit，0.25 秒）；低于 50% = 轻微滴答；见底 = 碎裂
    sigh: function () { tone('square', 220, 150, 0.22, 0.22); },
    drip: function () { tone('sine', 1180, 980, 0.05, 0.18); },
    break: function () { tone('square', 330, 110, 0.12, 0.3); tone('square', 260, 90, 0.16, 0.26, 0.08); noise(0.12, 0.12); }
  };
  // 同名音效最小间隔（ms），防止 tick 级连刷
  var THROTTLE = { bubble: 260, drop: 200, rain: 900, brush: 120, tick: 400, warn: 800, sigh: 600, drip: 900, break: 400 };

  root.WZ.sfx = {
    init: init,
    get muted() { return muted; },
    setMuted: function (b) {
      muted = !!b;
      if (master) master.gain.value = muted ? 0 : 0.1; // 提示词 10：整体调低
      if (root.WZ.music) root.WZ.music.setMuted(muted);
      try { localStorage.setItem('wz_sfx_mute', muted ? '1' : '0'); } catch (e) { /* 忽略 */ }
    },
    play: function (name) {
      if (!inited || muted) return;
      var fn = SOUNDS[name];
      if (!fn) return;
      var now = Date.now(), min = THROTTLE[name] || 60;
      if (lastPlay[name] && now - lastPlay[name] < min) return;
      lastPlay[name] = now;
      try { fn(); } catch (e) { /* 音频失败不影响游戏 */ }
    },
    // 测试钩子：暴露内部状态供断言
    _state: function () { return { inited: inited, muted: muted, hasCtx: !!ctx }; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
