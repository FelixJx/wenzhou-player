// content/promos.js —— 商家物料位（PRD-v4 §2.4）
// 全部为「演示用示例，非真实优惠」；接商家后台前不许出现真实券面（数据诚实边界 §5）。
// t = 物料文案；k = 类型（coupon 券 / activity 活动）。key = content/places.js 的地点 id。
(function (root) {
  root.WZ = root.WZ || {};
  root.WZ.content = root.WZ.content || {};

  root.WZ.content.promos = {
    f_changren: { t: '示例券：馄饨第二碗半价', k: 'coupon' },
    p_wuweihe: { t: '示例券：老字号糕点满 60 减 10', k: 'coupon' },
    f_paidui: { t: '示例活动：凭游戏积分免排队一次', k: 'activity' },
    teastall: { t: '示例券：茶点套餐 9 折', k: 'coupon' },
    jiangxin: { t: '示例活动：带队积分 ≥ 60 船票 9 折', k: 'activity' },
    tanghe: { t: '示例活动：带队积分换夜游游船优先位', k: 'activity' }
  };
})(typeof window !== 'undefined' ? window : globalThis);
