'use strict';
// gen-assets.js —— 生成三张地标像素图（F10）。Node 零依赖：RGBA 缓冲 + 手写 PNG 编码器。
// 产物：web/assets/wuma.png(160×120) mochi.png(96×96) center.png(160×110)
// 运行：node scripts/gen-assets.js（可重复执行，覆盖旧图）
// 像素画法：逻辑坐标 1 单位 = SCALE 物理像素（最近邻放大，出像素颗粒感）。

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SCALE = 2;

// ---------- 极简 PNG 编码器（RGBA8，filter 0） ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 画布 ----------
function Canvas(w, h) {
  this.w = w; this.h = h;
  this.buf = Buffer.alloc(w * h * 4);
}
Canvas.prototype.px = function (x, y, hex) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  const i = (y * this.w + x) * 4;
  this.buf[i] = parseInt(hex.slice(1, 3), 16);
  this.buf[i + 1] = parseInt(hex.slice(3, 5), 16);
  this.buf[i + 2] = parseInt(hex.slice(5, 7), 16);
  this.buf[i + 3] = 255;
};
Canvas.prototype.rect = function (x, y, w, h, hex) {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.px(x + dx, y + dy, hex);
};
// 1 物理像素 = SCALE 逻辑像素由调用方保证；这里再提供放大写入
Canvas.prototype.out = function () { return encodePNG(this.w, this.h, this.buf); };

// ---------- 调色板 ----------
const C = {
  sky: '#00000000',
  stone: '#9aa0a8', stoneD: '#7d838c',
  wallR: '#b3261e', wallRD: '#8f1d16',
  roofD: '#3d4450', roofDD: '#2e3440',
  beam: '#2f6b4f', beamD: '#24523c',
  gold: '#ffd166', goldD: '#d9a93e',
  white: '#f1ece2', whiteD: '#ddd5c6',
  ink: '#1c2030',
  water: '#232a3e', waterL: '#2e3752', waterHL: '#48557a',
  grass: '#3e8a3c', grassD: '#2f6b2f',
  wood: '#8a5a2b', woodD: '#6b4a2b',
  blue: '#3f6fb5', blueD: '#33598f',
  red: '#c0392b',
  skin: '#f3cba5',
  glow: '#ffe08a',
};

// ---------- 1. 五马街牌楼 160×120 ----------
function drawWuma() {
  const c = new Canvas(160, 120);
  const W = 160, cx = 80;
  // 地基与石阶
  c.rect(8, 112, W - 16, 8, C.stoneD);
  c.rect(4, 108, W - 8, 4, C.stone);
  // 三根红柱（到顶）
  const pillars = [20, 72, 124];
  pillars.forEach((px) => {
    c.rect(px, 24, 12, 84, C.wallR);
    c.rect(px + 9, 24, 3, 84, C.wallRD); // 侧影
  });
  // 下层绿枋
  c.rect(12, 78, W - 24, 8, C.beam);
  c.rect(12, 78, W - 24, 2, '#3d8562');
  // 一层大屋檐（灰瓦，翘角）
  c.rect(4, 70, W - 8, 8, C.roofD);
  c.rect(0, 72, 6, 4, C.roofDD); c.rect(W - 6, 72, 6, 4, C.roofDD); // 翘角
  c.rect(4, 70, W - 8, 2, '#566072');
  // 中层屋檐
  c.rect(30, 46, W - 60, 8, C.roofD);
  c.rect(26, 48, 6, 4, C.roofDD); c.rect(W - 32, 48, 6, 4, C.roofDD);
  c.rect(30, 46, W - 60, 2, '#566072');
  // 金匾（下层檐与枋之间，无文字——地名由地图标签标注）
  c.rect(cx - 30, 84, 60, 18, C.gold);
  c.rect(cx - 30, 84, 60, 2, '#fff1c0');
  c.rect(cx - 30, 100, 60, 2, C.goldD);
  c.rect(cx - 30, 84, 3, 18, C.goldD); c.rect(cx + 27, 84, 3, 18, C.goldD);
  // 匾上五个"马"字抽象刻痕
  for (let i = 0; i < 5; i++) c.rect(cx - 24 + i * 11, 90, 6, 7, '#8a5a12');
  // 顶脊
  c.rect(cx - 18, 40, 36, 6, C.roofD);
  c.rect(cx - 22, 42, 5, 4, C.roofDD); c.rect(cx + 17, 42, 5, 4, C.roofDD);
  // 灯笼 ×2（挂在中柱）
  c.rect(74, 32, 8, 10, C.red); c.rect(76, 30, 4, 2, C.gold);
  c.rect(118 - 44 + 36, 0, 0, 0, C.sky); // noop 占位保持行宽
  c.rect(118, 32, 8, 10, C.red); c.rect(120, 30, 4, 2, C.gold);
  // 石狮抽象（基座两侧）
  c.rect(8, 96, 10, 12, C.stone); c.rect(10, 92, 6, 5, C.stone);
  c.rect(142, 96, 10, 12, C.stone); c.rect(144, 92, 6, 5, C.stone);
  return c;
}

// ---------- 2. 墨池亭 96×96 ----------
function drawMochi() {
  const c = new Canvas(96, 96);
  // 草地
  c.rect(0, 60, 96, 36, C.grass);
  c.rect(0, 60, 96, 2, '#4d9c4a');
  for (let i = 0; i < 14; i++) c.px((i * 7 + 3) % 96, 66 + (i * 5) % 26, C.grassD);
  // 墨池（椭圆感：三段矩形叠出）
  c.rect(14, 52, 68, 26, C.water);
  c.rect(20, 48, 56, 4, C.water);
  c.rect(10, 58, 76, 14, C.water);
  // 池沿石
  c.rect(10, 78, 76, 4, '#8b8f94');
  c.rect(8, 56, 4, 24, '#8b8f94'); c.rect(84, 56, 4, 24, '#8b8f94');
  // 墨色涟漪
  c.rect(30, 60, 16, 2, C.waterL); c.rect(52, 66, 20, 2, C.waterL);
  c.rect(38, 70, 10, 2, C.waterHL);
  // 亭（右上）
  c.rect(62, 18, 4, 26, C.wood); c.rect(84, 18, 4, 26, C.wood);
  c.rect(58, 14, 34, 5, C.roofD);
  c.rect(54, 16, 5, 4, C.roofDD); c.rect(91, 16, 5, 4, C.roofDD);
  c.rect(66, 8, 20, 6, C.roofD);
  c.rect(70, 22, 10, 12, C.beam); // 亭内碑影
  // 石碑（左）
  c.rect(18, 20, 12, 30, '#2f3237');
  c.rect(16, 18, 16, 4, '#55595f');
  c.rect(22, 26, 4, 4, C.white); c.rect(22, 34, 4, 8, C.white); // 碑文刻痕
  // 荷叶
  c.px(26, 64, C.grass); c.px(30, 68, '#57a04a'); c.px(64, 72, '#57a04a');
  return c;
}

// ---------- 3. 游客中心 160×110 ----------
function drawCenter() {
  const c = new Canvas(160, 110);
  // 主楼白墙
  c.rect(10, 26, 140, 76, C.white);
  c.rect(10, 26, 140, 4, '#fffdf7');
  c.rect(10, 96, 140, 6, C.whiteD);
  // 蓝色屋顶带
  c.rect(4, 12, 152, 16, C.blue);
  c.rect(4, 12, 152, 3, '#5a8ac9');
  c.rect(4, 26, 152, 2, C.blueD);
  // 窗 ×6
  for (let i = 0; i < 6; i++) {
    c.rect(18 + i * 22, 38, 14, 12, '#9fc5e8');
    c.rect(18 + i * 22, 38, 14, 2, '#c5e0f5');
  }
  // 红招牌带
  c.rect(10, 58, 140, 14, C.red);
  c.rect(10, 58, 140, 2, '#e05a48');
  // 五个"字"刻痕
  for (let i = 0; i < 5; i++) c.rect(30 + i * 22, 62, 10, 7, '#ffffff');
  // 双开门
  c.rect(64, 76, 14, 26, C.blue); c.rect(82, 76, 14, 26, C.blue);
  c.rect(64, 76, 14, 2, '#6a94c9'); c.rect(82, 76, 14, 2, '#6a94c9');
  c.px(74, 90, C.gold); c.px(92, 90, C.gold);
  // 旗杆与旗
  c.rect(146, 6, 2, 88, '#777777');
  c.rect(148, 8, 10, 6, C.gold);
  // 台阶
  c.rect(4, 102, 152, 4, C.stone);
  c.rect(0, 106, 160, 4, C.stoneD);
  return c;
}

// ---------- 4. 江心屿双塔 64×112 ----------
function drawJiangxin() {
  const c = new Canvas(64, 112);
  // 小岛绿地
  c.rect(4, 92, 56, 20, C.grass);
  c.rect(4, 92, 56, 3, '#4d9c4a');
  // 双塔（东塔唐/西塔宋，一高一矮）
  const tower = (cx, topY, floors) => {
    for (let i = 0; i < floors; i++) {
      const fw = 16 - (i % 2);
      const fy = topY + i * 12;
      c.rect(cx - fw / 2, fy, fw, 12, i % 2 ? '#b9ac96' : '#c8bca6');
      c.rect(cx - fw / 2 - 3, fy - 2, fw + 6, 3, '#5b5e66'); // 檐
      c.rect(cx - 2, fy + 4, 4, 5, C.ink); // 门窗
    }
    c.rect(cx - 1, topY - 8, 2, 8, '#5b5e66');
    c.rect(cx - 2, topY - 11, 4, 4, C.glow); // 塔尖金顶
  };
  tower(20, 28, 6);
  tower(44, 40, 5);
  return c;
}

// ---------- 5. 雁荡山峰 96×88 ----------
function drawYandang() {
  const c = new Canvas(96, 88);
  // 三峰
  const peaks = [[22, '#4e6b52'], [50, '#5d7a5f'], [76, '#44604a']];
  peaks.forEach(([px, col]) => {
    for (let row = 0; row < 64; row++) {
      const w = Math.round((row / 64) * 40);
      if (w < 1) continue;
      c.rect(px - w / 2, 16 + row, w, 1, col);
    }
  });
  // 山脊高光
  c.rect(20, 18, 2, 40, 'rgba(255,255,255,1)'.slice(0, 7));
  c.rect(48, 20, 2, 34, '#7a917c');
  // 底部植被带
  c.rect(0, 76, 96, 12, C.grassD);
  c.rect(0, 76, 96, 2, C.grass);
  // 瀑布（大龙湫意笔）
  c.rect(46, 40, 3, 36, '#bcd8ee');
  c.rect(46, 40, 1, 36, '#e2f1fc');
  return c;
}

// ---------- 6. 楠溪江·丽水街 112×80 ----------
function drawNanxi() {
  const c = new Canvas(112, 80);
  // 水面（楠溪江）
  c.rect(0, 52, 112, 28, C.water);
  c.rect(0, 52, 112, 2, C.waterHL);
  c.rect(18, 60, 22, 2, C.waterL);
  c.rect(58, 68, 26, 2, C.waterL);
  // 长廊式老街（明嘉靖蓄水堤上的长廊）
  c.rect(6, 24, 100, 28, C.wood);
  c.rect(6, 24, 100, 3, '#a97142');
  for (let i = 0; i < 9; i++) c.rect(10 + i * 11, 30, 2, 22, C.woodD); // 廊柱
  c.rect(2, 16, 108, 8, C.roofD); // 长廊瓦顶
  c.rect(2, 16, 108, 2, '#566072');
  // 石堤
  c.rect(0, 50, 112, 4, C.stone);
  // 乌篷船
  c.rect(30, 60, 18, 6, C.ink);
  c.rect(34, 56, 10, 4, '#2a2f3e');
  return c;
}

// ---------- 写盘 ----------
const outDir = path.join(__dirname, '..', 'web', 'assets');
fs.mkdirSync(outDir, { recursive: true });
const jobs = [
  ['wuma.png', drawWuma],
  ['mochi.png', drawMochi],
  ['center.png', drawCenter],
  ['jiangxin.png', drawJiangxin],
  ['yandang.png', drawYandang],
  ['nanxi.png', drawNanxi],
];
for (const [name, draw] of jobs) {
  const c = draw();
  fs.writeFileSync(path.join(outDir, name), c.out());
  process.stdout.write(`OK ${name} ${c.w}x${c.h} ${fs.statSync(path.join(outDir, name)).size}B\n`);
}
process.stdout.write('done: 3 assets\n');
