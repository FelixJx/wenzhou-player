/* intromount.js —— 首访 5 秒开场（Three.js 序章）挂载器（Lead）
 * 交接包：wenzhou-intro-handoff-20261024（接入指南.md 同源 iframe 方案）。
 * 规则：
 *  - 仅 http(s) 下挂载（file:// 离线兜底直接进游戏，A5 不受影响）；
 *  - localStorage['wenzhou-intro-seen']='1' 视为已看过；存储禁用也直接进游戏（try/catch）；
 *  - iframe 全屏覆盖（z-index 高于一切），游戏在下面照常 boot，无需改 main.js；
 *  - introcomplete / 加载失败 / 超时 → dispose + 移除，只进一次游戏；
 *  - 挂载时摘掉序章页里的预览外链（#enter / .brand），防止 iframe 内导航。
 */
(function () {
  'use strict';

  var SEEN_KEY = 'wenzhou-intro-seen';
  var TIMEOUT_MS = 12000;

  function alreadySeen() {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return true; }
  }
  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* 存储禁用忽略 */ }
  }
  function httpProto() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }
  // 自动化环境（Playwright/Puppeteer 均置位）跳过开场：冒烟测试的全新 context 每次都是"首访"
  function isAutomated() {
    try { return navigator.webdriver === true; } catch (e) { return false; }
  }

  function finishOnce(fn) {
    var done = false;
    return function () { if (done) return; done = true; fn(); };
  }

  function mount() {
    if (!httpProto() || alreadySeen() || isAutomated()) return;
    var finish = finishOnce(function () {
      clearTimeout(timer);
      try { if (api) api.dispose(); } catch (e) { /* 已释放 */ }
      if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
      markSeen();
    });
    var frame = document.createElement('iframe');
    frame.src = 'intro/index.html'; // 相对路径：/play/ 与 file: 下都指向 web/intro/
    frame.title = '温州玩家开场';
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:99999;background:#eee4cb';
    var api = null;
    var timer = setTimeout(finish, TIMEOUT_MS);
    frame.addEventListener('load', function () {
      try {
        api = frame.contentWindow && frame.contentWindow.wenzhouIntro;
        var doc = frame.contentDocument;
        var enter = doc && doc.querySelector('#enter');
        if (enter) enter.removeAttribute('href'); // 预览外链摘除（元素保留，序章内部逻辑会引用它）
        var brand = doc && doc.querySelector('.brand');
        if (brand) brand.removeAttribute('href');
        if (!api) return finish(); // 模块没起来（老设备/WebKit 限制）→ 直接进游戏
        doc.querySelector('#intro').addEventListener('introcomplete', finish, { once: true });
        api.play();
      } catch (e) { finish(); }
    }, { once: true });
    document.body.appendChild(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
