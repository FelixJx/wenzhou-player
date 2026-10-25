// content/districts.js —— 商圈（PRD-v4 §3.1，勿与 content.zones 人潮区混淆）
// 老城三圈 = pois.js + places.js 落在 center/r 圆内的店；远郊三圈 = placeIds 精选地点（位置示意）。
// 数据与 docs/demo-商圈带队玩法.html 同源（高德实采 + 大众点评实采）。
(function (root) {
  root.WZ = root.WZ || {};
  root.WZ.content = root.WZ.content || {};

  root.WZ.content.districts = [
    { id: 'wuma',     name: '五马街 · 公园路', kind: '老城商圈',   lng: 120.655, lat: 28.019, stayDefault: 150, center: { x: 1100, y: 1430 }, r: 400,
      blurb: '老城核心，手信店和小吃最密；人也最多。' },
    { id: 'mochi',    name: '墨池 · 仓桥街',   kind: '老城商圈',   lng: 120.662, lat: 28.023, stayDefault: 150, center: { x: 900,  y: 1050 }, r: 330,
      blurb: '书卷气的一片：墨池、池上楼、夏鼐故居；吃的要排队。' },
    { id: 'jiangxin', name: '江心屿 · 朔门',   kind: '景区 + 老街', lng: 120.650, lat: 28.032, stayDefault: 180, center: { x: 520,  y: 720 },  r: 420,
      blurb: '坐船上岛，景最好、路最长；朔门古港在岸边。' },
    { id: 'nantang',  name: '南塘街 · 塘河',   kind: '夜游商圈',   lng: 120.676, lat: 27.995, stayDefault: 120, car: true, placeIds: ['tanghe'],
      blurb: '晚上才好看：塘河夜画 19:00 开船；梧田老街在附近。' },
    { id: 'nanxi',    name: '楠溪江 · 丽水街', kind: '远郊景区',   lng: 120.69,  lat: 28.35,  stayDefault: 200, car: true, placeIds: ['nanxi'],
      blurb: '坐车约 1.5 小时，古街 + 江景，一去就是半天。' },
    { id: 'yandang',  name: '雁荡山',          kind: '远郊景区',   lng: 121.05,  lat: 28.37,  stayDefault: 300, car: true, placeIds: ['yandang'],
      blurb: '坐车约 2 小时。携程 10/24 显示「暂停营业，恢复时间待定」，去前请电话确认。' }
  ];

  // 出发点（游客中心）
  root.WZ.content.dayHome = { id: 'home', name: '五马街游客中心', lng: 120.655, lat: 28.0205 };
})(typeof window !== 'undefined' ? window : globalThis);
