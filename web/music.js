// 分阶段背景音乐：复用一个播放器，避免切页叠音；首次交互后才播放。
(function (root) {
  'use strict';
  root.WZ = root.WZ || {};

  var tracks = {
    intro: 'intro.mp3',
    game: 'gameplay.mp3',
    ending: 'epilogue.mp3',
    boards: 'leaderboard.mp3'
  };
  var script = root.document && root.document.currentScript;
  var base = script && script.src ? new URL('assets/music/', script.src).href : 'assets/music/';
  var audio = null, scene = null, unlocked = false, initialized = false;
  var muted = !!(root.WZ.sfx && root.WZ.sfx.muted);

  function resume() {
    if (!audio || !scene || !unlocked || muted || (root.document && root.document.hidden)) return;
    if (!audio.paused) return;
    try {
      var pending = audio.play();
      if (pending && pending.catch) pending.catch(function () { /* 下次手势重试，音频失败不阻断游戏 */ });
    } catch (e) { /* 不支持音频时静默降级 */ }
  }

  function unlock() { unlocked = true; resume(); }

  function init() {
    if (initialized) return;
    initialized = true;
    if (!root.document) return;
    // 保留监听：手机浏览器拒绝一次播放后，后续交互仍有机会恢复。
    ['pointerdown', 'touchend', 'keydown'].forEach(function (event) {
      root.document.addEventListener(event, unlock, true);
    });
    root.document.addEventListener('visibilitychange', function () {
      if (root.document.hidden) { if (audio) audio.pause(); }
      else resume();
    });
    root.addEventListener('pagehide', function () { if (audio) audio.pause(); });
    root.addEventListener('pageshow', resume);
  }

  root.WZ.music = {
    init: init,
    play: function (next) {
      if (!tracks[next]) return;
      init();
      if (!audio) {
        if (!root.Audio) return;
        audio = new root.Audio();
        audio.preload = 'metadata';
        audio.loop = true;
        audio.volume = 0.28;
        audio.muted = muted;
      }
      if (scene !== next) {
        audio.pause();
        scene = next;
        audio.src = base + tracks[next];
      }
      resume();
    },
    setMuted: function (value) {
      muted = !!value;
      if (audio) {
        audio.muted = muted;
        if (muted) audio.pause();
        else resume();
      }
    },
    stop: function () { if (audio) audio.pause(); scene = null; }, // 结尾五幕：全程无音乐
    get scene() { return scene; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
