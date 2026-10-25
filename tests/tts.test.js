// tests/tts.test.js —— 名人「听他说」模块单测。运行：node tests/tts.test.js（退出码 0 = 全部 PASS）
// Node 里没有 speechSynthesis，用假对象覆盖：只测模块自身行为，不测浏览器真实朗读。
'use strict';
const assert = require('assert');

// ---------- mock：speechSynthesis / localStorage ----------
function freshEnv(withSynth) {
  const store = {};
  const synth = {
    spoken: [], cancelled: 0, speakingFlag: false, voices: [],
    getVoices() { return this.voices; },
    cancel() { this.cancelled++; this.speakingFlag = false; },
    speak(u) { this.spoken.push(u); this.speakingFlag = true; },
    get speaking() { return this.speakingFlag; },
  };
  globalThis.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
  if (withSynth) {
    globalThis.speechSynthesis = synth;
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  } else {
    delete globalThis.speechSynthesis;
    delete globalThis.SpeechSynthesisUtterance;
  }
  delete globalThis.WZ;
  delete require.cache[require.resolve('../web/tts.js')]; // 清缓存，保证按新环境重新挂载
  require('../web/tts.js');
  return { synth, store };
}

let n = 0;
function t(name, fn) {
  n++;
  try { fn(); console.log(`PASS ${n} ${name}`); }
  catch (e) { console.error(`FAIL ${n} ${name}\n  ${e.message}`); process.exitCode = 1; }
}

// ---------- 用例 ----------
t('模块挂到 WZ.tts，五个接口齐全', () => {
  freshEnv(true);
  const m = globalThis.WZ.tts;
  assert.strictEqual(typeof m.speak, 'function');
  assert.strictEqual(typeof m.stop, 'function');
  assert.strictEqual(typeof m.speaking, 'function');
  assert.strictEqual(typeof m.supported, 'function');
  assert.strictEqual(typeof m.setMuted, 'function');
  assert.strictEqual(m.supported(), true);
});

t('没有 speechSynthesis 的环境：supported=false，speak 静默返回 false', () => {
  freshEnv(false);
  const m = globalThis.WZ.tts;
  assert.strictEqual(m.supported(), false);
  assert.strictEqual(m.speak('池塘生春草', 'xie_lingyun'), false);
  assert.strictEqual(m.speaking(), false); // 不炸即过
});

t('speak：多行诗用「，」连读，谢灵运声线放慢', () => {
  const { synth } = freshEnv(true);
  const m = globalThis.WZ.tts;
  assert.strictEqual(m.speak('瓯水向东去，\n评委引众行。\n墨池一回首，\n春草又生情。', 'xie_lingyun'), true);
  assert.strictEqual(synth.spoken.length, 1);
  const u = synth.spoken[0];
  assert.strictEqual(u.text, '瓯水向东去，评委引众行。墨池一回首，春草又生情。');
  assert.strictEqual(u.lang, 'zh-CN');
  assert.ok(u.rate <= 0.9, `诗人语速应 ≤0.9，实际 ${u.rate}`);
  assert.ok(u.pitch < 1.0, `诗人音调应 <1.0，实际 ${u.pitch}`);
  assert.strictEqual(m.speaking(), true);
});

t('未知名人也有默认声线；空文本返回 false', () => {
  const { synth } = freshEnv(true);
  const m = globalThis.WZ.tts;
  assert.strictEqual(m.speak('你好，朋友。', 'who_is_this'), true);
  assert.ok(synth.spoken[0].rate > 0 && synth.spoken[0].rate <= 1.1);
  assert.strictEqual(m.speak('', 'xie_lingyun'), false);
  assert.strictEqual(m.speak('   \n  ', 'xie_lingyun'), false);
  assert.strictEqual(synth.spoken.length, 1);
});

t('stop：取消并结束说话状态；每次 speak 前先清场', () => {
  const { synth } = freshEnv(true);
  const m = globalThis.WZ.tts;
  m.speak('第一句', 'subuqing');
  assert.strictEqual(synth.cancelled, 1, 'speak 内部先 cancel 清场');
  assert.strictEqual(m.speaking(), true);
  m.stop();
  assert.strictEqual(synth.cancelled, 2);
  assert.strictEqual(m.speaking(), false);
  m.speak('第二句', 'subuqing');
  assert.strictEqual(synth.cancelled, 3, '第二次 speak 前再 cancel 一次');
  assert.strictEqual(synth.spoken.length, 2);
});

t('静音开关：setMuted(true) 立即停 + 持久化，muted 读取一致', () => {
  const { synth, store } = freshEnv(true);
  const m = globalThis.WZ.tts;
  assert.strictEqual(m.muted(), false);
  m.speak('还在说', 'subuqing');
  m.setMuted(true);
  assert.strictEqual(synth.cancelled >= 1, true, '静音应停止当前朗读');
  assert.strictEqual(m.muted(), true);
  assert.strictEqual(store.wz_tts_mute, '1');
  assert.strictEqual(m.speak('静音中', 'subuqing'), false);
  m.setMuted(false);
  assert.strictEqual(m.muted(), false);
  assert.strictEqual(m.speak('恢复了', 'subuqing'), true);
});

t('onEnd 回调挂到 onend/onerror', () => {
  freshEnv(true);
  const m = globalThis.WZ.tts;
  let ended = 0;
  m.speak('念完这句', 'wen_tianxiang', () => { ended++; });
  globalThis.speechSynthesis.spoken[0].onend();
  globalThis.speechSynthesis.spoken[0].onerror();
  assert.strictEqual(ended, 2);
});

console.log(process.exitCode ? '有失败' : `tts.test.js 全部通过（${n} 项）`);
