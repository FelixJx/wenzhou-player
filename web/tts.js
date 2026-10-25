// tts.js —— 名人「听他说」：浏览器语音合成读一句台词（零后端、离线可用、不支持则静默）
// 用法（ui.js showCelebrity 内）：
//   卡片页加按钮：if (WZ.tts.supported()) foot.appendChild(btn('🔊 听他说', 'btn-ghost', ...WZ.tts.speak(card.text, card.who)...));
//   页面关闭（pick）时调 WZ.tts.stop()。
// 声线按名人微调：诗人类放慢，将军低沉。多行诗按「，」连读，保留换行停顿感。
// 独立开关存 localStorage（wz_tts_mute），与 F9 音效开关（wz_sfx_mute）互不影响。
(function (root) {
  root.WZ = root.WZ || {};

  var MUTE_KEY = 'wz_tts_mute';
  // content/celebrities.js 的 who 是 xie_lingyun 风格；server/ai.js BUILTIN 是 xielingyun —— 两种都认
  var VOICES = {
    xie_lingyun: { rate: 0.86, pitch: 0.95 }, // 山水诗人，慢
    xielingyun: { rate: 0.86, pitch: 0.95 },
    wang_xizhi: { rate: 0.92, pitch: 0.9 }, // 长者，沉稳
    wangxizhi: { rate: 0.92, pitch: 0.9 },
    wen_tianxiang: { rate: 0.88, pitch: 0.82 }, // 凝重
    wentianxiang: { rate: 0.88, pitch: 0.82 },
    subuqing: { rate: 1.0, pitch: 1.05 } // 老教授，轻快
  };

  function supported() {
    return 'speechSynthesis' in root && typeof root.speechSynthesis.speak === 'function';
  }
  function muted() {
    try { return root.localStorage.getItem(MUTE_KEY) === '1'; } catch (_) { return false; }
  }
  function setMuted(v) {
    try {
      if (v) root.localStorage.setItem(MUTE_KEY, '1');
      else root.localStorage.removeItem(MUTE_KEY);
    } catch (_) { /* 隐私模式存不进就算了 */ }
    if (v) stop();
  }
  function stop() {
    try { root.speechSynthesis.cancel(); } catch (_) { /* 忽略 */ }
  }
  function speaking() {
    try { return root.speechSynthesis.speaking; } catch (_) { return false; }
  }
  function pickVoice() {
    // 声音列表在部分浏览器异步加载（voiceschanged），调用时现取；拿不到就用默认
    var vs = root.speechSynthesis.getVoices() || [];
    var zh = vs.filter(function (v) { return /^zh([-_]|$)/i.test(v.lang || ''); });
    return zh[0] || vs[0] || null;
  }
  // 读 text（who 选声线）；多行诗用逗号连读。返回是否真的开始（供调用方决定按钮文案）
  function speak(text, who, onEnd) {
    if (!supported() || muted() || !text) return false;
    stop();
    var clean = String(text).trim();
    if (!clean) return false;
    // 多行诗逐行连读：行尾已有标点就不重复加「，」，避免叠出「，，」多停顿
    var parts = clean.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var joined = '';
    for (var i = 0; i < parts.length; i++) {
      joined += parts[i];
      if (i < parts.length - 1 && !/[，。！？；、,.!?;]$/.test(parts[i])) joined += '，';
    }
    var u = new root.SpeechSynthesisUtterance(joined);
    var v = VOICES[who] || { rate: 0.92, pitch: 1.0 };
    u.lang = 'zh-CN';
    u.rate = v.rate;
    u.pitch = v.pitch;
    var voice = pickVoice();
    if (voice) u.voice = voice;
    if (onEnd) {
      u.onend = onEnd;
      u.onerror = onEnd;
    }
    try {
      root.speechSynthesis.speak(u);
      return true;
    } catch (_) {
      return false;
    }
  }

  root.WZ.tts = { supported: supported, speak: speak, stop: stop, speaking: speaking, muted: muted, setMuted: setMuted };
})(typeof window !== 'undefined' ? window : globalThis);
