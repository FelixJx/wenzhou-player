// staff.js —— 游客店员池（demo）：困扰句风格沿用主游戏真人种子句；昵称模拟“其他玩家报名表”
window.WZD.staffPool = [
  { name: '阿瓯', tag: 'crowd', text: '人多的地方我就想逃' },
  { name: '小满', tag: 'food',  text: '糯米饭过午就没了' },
  { name: '老陈', tag: 'walk',  text: '一天两万步要命' },
  { name: '阿香', tag: 'shop',  text: '临走没买手信' },
  { name: '大鹏', tag: 'rush',  text: '一直在赶车' },
  { name: '小鹿', tag: 'bored', text: '逛半天没记住啥' },
  { name: '阿磊', tag: 'toilet',text: '找不到厕所' },
  { name: '绵绵', tag: 'food',  text: '太清淡吃不惯' },
  { name: '阿吉', tag: 'shop',  text: '老字号关门太早' },
  { name: '多多', tag: 'crowd', text: '网红街寸步难行' },
];
// 店铺类别 ↔ 困扰 tag 匹配表（对口才加成）
window.WZD.matchCat = function (cat, tag) {
  var M = { food: ['food'], cafe: ['food'], shop: ['shop'], sight: ['bored'], stage: ['bored'] };
  return !!(M[cat] && M[cat].indexOf(tag) >= 0);
};
