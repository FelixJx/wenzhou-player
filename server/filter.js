'use strict';
// 敏感词过滤：命中则整句替换为该 tag 的默认句。
// 内置词表 + 默认句表；若 content/badwords.js 存在（W5 维护），则合并其 words / fallbackByTag。

const path = require('path');

const TAGS = ['walk', 'food', 'crowd', 'shop', 'bored', 'rush', 'toilet', 'any'];

// 内置默认句（与 content/badwords.js 的 fallbackByTag 同名、同结构）
const fallbackByTag = {
  walk: '一天走了两万步',
  food: '吃不惯外地口味',
  crowd: '人一多就头晕',
  shop: '手信还没买齐',
  bored: '逛街太没劲了',
  rush: '别磨蹭快点走',
  toilet: '找不到厕所急',
  any: '都行，听你的',
};

// 内置敏感词（粗粒度，宁可误杀；AI 输出与用户输入共用）
const BUILTIN_WORDS = [
  // 政治 / 敏感人物与事件（泛化词）
  '习近平', '毛泽东', '共产党', '法轮功', '台独', '港独', '疆独', '藏独', '六四', '天安门事件', '反动', '颠覆',
  // 色情
  '色情', '做爱', '裸体', '淫', '约炮', '援交', '卖淫', '嫖', '性交', '黄片', 'av', '自慰',
  // 暴力 / 违法
  '杀人', '自杀', '爆炸', '炸弹', '枪支', '毒品', '吸毒', '贩毒', '恐怖袭击', '血腥', '砍死', '弄死',
  // 辱骂
  '傻逼', '傻b', '煞笔', 'sb', '尼玛', '你妈', '他妈', '妈的', '操你', '草泥马', '艹', '滚蛋', '去死', '贱人', '婊子', '废物', '白痴', '智障', '脑残', '垃圾人', '狗东西', 'fuck', 'shit',
  // 赌博 / 广告 / 导流
  '赌博', '博彩', '六合彩', '加微信', '加v', '加q', 'qq群', '微信号', '扫码领', '代购', '刷单', '兼职日结', '贷款', '免费领取',
  // 真实商家点名类（规避评价真实商家）
  '差评', '黑店', '骗钱', '宰客',
];

// 联系方式 / 外链等模式
const PATTERNS = [
  /1[3-9]\d{9}/,              // 手机号
  /\d{5,}/,                   // 长数字（QQ 号、电话等）
  /https?:\/\//i,
  /www\./i,
  /\.(com|cn|net|org|cc|top|xyz)\b/i,
  /[vV][xX]|[wW][xX]|微信|威信|薇信|VX|QQ|扣扣/,
];

// 尝试合并 content/badwords.js（UMD 壳，Node 下挂到 globalThis.WZ.content.badwords）
let externalWords = [];
let externalFallback = {};
(function loadExternal() {
  try {
    const file = path.join(__dirname, '..', 'content', 'badwords.js');
    require(file);
    const bw = globalThis.WZ && globalThis.WZ.content && globalThis.WZ.content.badwords;
    if (!bw) return;
    const words = Array.isArray(bw) ? bw : (bw.words || bw.list || []);
    if (Array.isArray(words)) externalWords = words.filter((w) => typeof w === 'string' && w.trim());
    if (bw.fallbackByTag && typeof bw.fallbackByTag === 'object') externalFallback = bw.fallbackByTag;
  } catch (_) {
    // 文件不存在或格式不符时静默，使用内置表
  }
})();

const WORDS = Array.from(new Set(BUILTIN_WORDS.concat(externalWords))).map((w) => w.toLowerCase());

// 规范化：小写、去空白与常见干扰符号
function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s　·•\-_*~.。,，!！?？'"`^|/\\]+/g, '');
}

// 是否命中敏感词；返回命中的词或 null
function hit(text) {
  const raw = String(text || '');
  const norm = normalize(raw);
  for (const w of WORDS) {
    if (w && norm.includes(w)) return w;
  }
  for (const re of PATTERNS) {
    if (re.test(raw)) return re.source;
  }
  return null;
}

function fallbackFor(tag) {
  return externalFallback[tag] || fallbackByTag[tag] || fallbackByTag.any;
}

// 对用户困扰过滤：命中 → 替换为 tag 默认句
// 返回 { text, replaced:boolean, word }
function filterTrouble(text, tag) {
  const word = hit(text);
  if (word) return { text: fallbackFor(tag), replaced: true, word };
  return { text: String(text || '').trim(), replaced: false, word: null };
}

// 对 AI 输出过滤：命中 → 返回 null（由调用方切模板）
function filterAI(text) {
  return hit(text) ? null : String(text || '').trim();
}

module.exports = { TAGS, fallbackByTag, hit, filterTrouble, filterAI, fallbackFor, WORDS };
