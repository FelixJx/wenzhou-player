// UI kit 的矢量人物：地图与流程页使用同一套素材和游客配色。
(function (root) {
  'use strict';
  root.WZ = root.WZ || {};
  var script = root.document && root.document.currentScript;
  var base = script && script.src ? new URL('assets/characters/', script.src).href : 'assets/characters/';
  var tags = ['walk', 'food', 'crowd', 'shop', 'bored', 'rush', 'toilet', 'any'];
  var images = {};
  var motion = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function src(kind, portrait) {
    if (tags.indexOf(kind) >= 0) return base + (portrait ? 'avatar-' : 'guest-') + kind + '.svg';
    if (kind === 'hero' || kind === 'shopkeeper') return base + (portrait ? 'avatar-' : 'char-') + kind + '.svg';
    if (kind === 'scholar' || kind === 'customer') return base + 'char-' + kind + '.svg';
    return base + (portrait ? 'avatar-any' : 'guest-any') + '.svg';
  }
  function load(kind) {
    if (images[kind]) return images[kind];
    var entry = images[kind] = { image: null, loaded: false };
    if (!root.Image) return entry;
    var img = entry.image = new root.Image();
    img.onload = function () { entry.loaded = true; };
    img.onerror = function () { entry.loaded = false; }; // 缺图时 drawPerson 使用原绘制兜底
    img.src = src(kind);
    return entry;
  }
  function height(o) { return o.flag ? 60 : o.hat === 'npc' ? 52 : o.sit ? 37 : 47; }
  function draw(ctx, x, y, o) {
    var kind = o.hat === 'cap' ? 'hero' : o.hat === 'npc' ? 'scholar' : (o.tag || 'any');
    var entry = load(kind);
    if (!entry.loaded) return false;
    var animate = !(motion && motion.matches);
    var phase = (o.anim != null ? o.anim : o.frame || 0) * Math.PI;
    var bob = o.moving && animate && !o.sit ? Math.abs(Math.sin(phase)) * 1.4 : 0;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (o.gray) ctx.filter = 'grayscale(1) brightness(0.8)';
    ctx.translate(x, y - bob);
    // 原素材提供正面立绘；横向行走镜像，迈步用轻微摆动表达。
    ctx.scale(o.dir && o.dir.x < -0.1 ? -1 : 1, o.sit ? 0.78 : 1);
    if (o.moving && animate && !o.sit) ctx.rotate(Math.sin(phase) * 0.035);
    ctx.drawImage(entry.image, -18, -47.1, 36, 51);
    ctx.restore();
    if (o.flag) {
      ctx.save();
      ctx.strokeStyle = '#735235'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x + 11, y - 22); ctx.lineTo(x + 11, y - 57); ctx.stroke();
      ctx.fillStyle = '#E4553F'; ctx.strokeStyle = '#A93A28'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x + 11, y - 57); ctx.lineTo(x + 23, y - 53); ctx.lineTo(x + 11, y - 49); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    return true;
  }
  root.WZ.characters = { src: src, draw: draw, height: height };
  // 首次进场即预加载 SVG；后续帧仅复用已解码图片，不重复请求。
  ['hero', 'scholar'].concat(tags).forEach(load);
})(typeof window !== 'undefined' ? window : globalThis);
