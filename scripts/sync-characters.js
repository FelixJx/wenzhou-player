// 导入 UI kit 原始 SVG，并生成与游客标签色一致的全身图及头像。
// node scripts/sync-characters.js /path/to/game-ui-kit
// 已导入后可直接 node scripts/sync-characters.js 重新生成派生素材。
'use strict';
const fs = require('fs');
const path = require('path');
require('../content/params.js');
const out = path.resolve(__dirname, '../web/assets/characters');
fs.mkdirSync(out, { recursive: true });
if (process.argv[2]) {
  for (const name of ['char-hero', 'char-customer', 'char-shopkeeper', 'avatar-hero', 'avatar-shopkeeper']) {
    fs.copyFileSync(path.join(process.argv[2], 'assets', name + '.svg'), path.join(out, name + '.svg'));
  }
}
const read = name => fs.readFileSync(path.join(out, name + '.svg'), 'utf8');
const write = (name, svg) => fs.writeFileSync(path.join(out, name + '.svg'), svg);
const hero = read('char-hero'), customer = read('char-customer');
function shade(hex, factor) {
  return '#' + hex.slice(1).match(/../g).map(c => Math.max(0, Math.min(255, Math.round(parseInt(c, 16) * factor))).toString(16).padStart(2, '0')).join('');
}
function recolor(svg, color, female) {
  const colors = female
    ? { '#7FE0B6': 1.23, '#4FBE92': 1, '#2E8C68': .73 }
    : { '#FFCB74': 1.23, '#F2A03D': 1, '#C4701C': .73, '#FFD48F': 1.3, '#A85F13': .6 };
  return svg.replace(/#[0-9a-f]{6}/gi, c => colors[c.toUpperCase()] ? shade(color, colors[c.toUpperCase()]) : c);
}
const femaleTags = new Set(['crowd', 'shop', 'bored', 'toilet']);
const tags = globalThis.WZ.content.params.tagColors;
for (const [tag, color] of Object.entries(tags)) {
  const svg = recolor(femaleTags.has(tag) ? customer : hero, color, femaleTags.has(tag));
  write('guest-' + tag, svg);
  // 裁切原矢量的头部，仍保留全部渐变/描边，不经过位图缩放。
  write('avatar-' + tag, svg.replace('viewBox="0 0 120 170" width="120" height="170"', 'viewBox="22 8 76 76" width="100" height="100"'));
}
// 古人仍是人形：由主角骨架衍生长袍和冠帽，不将柴犬素材用于历史人物。
let scholar = recolor(hero, '#6a4c93', false).replace(/<!-- 胸牌 -->[\s\S]*?(?=<!-- ===== 脖子)/, `
  <path d="M44 80Q60 87 76 80L83 143Q60 152 37 143Z" fill="#6A4C93" stroke="#45315F" stroke-width="2"/>
  <path d="M44 82L40 141L50 144L56 84Z" fill="#9679B7"/>
  <path d="M65 84L76 82L81 142L68 146Z" fill="#50376F"/>
  <path d="M48 80L61 101L72 80M61 101L60 145" fill="none" stroke="#F5E9C9" stroke-width="2.4"/>
  <path d="M42 110Q60 115 78 110" fill="none" stroke="#302D42" stroke-width="5"/>
`);
scholar = scholar.replace('</svg>', '<path d="M34 24Q60 14 86 24L84 30Q60 24 36 30Z" fill="#323346" stroke="#242536" stroke-width="2"/><path d="M45 22L47 6Q60 0 73 6L75 22Z" fill="#44465D" stroke="#242536" stroke-width="2"/><path d="M50 8L49 19" stroke="#7D7F99" stroke-width="2"/></svg>');
write('char-scholar', scholar);
console.log('Synced character kit: 3 originals, 2 original avatars, 8 guests + avatars, 1 scholar.');
