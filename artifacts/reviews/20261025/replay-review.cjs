'use strict';
// 可复现的规则回放。未启动浏览器，不代表触屏、画面或真人试玩。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../../..');
global.window = global;
for (const f of ['params','places','guests','knowledge','celebrities','ending','promos','ratings','districts','seed_troubles']) {
  require(path.join(ROOT, 'content', f + '.js'));
}
for (const f of ['map','guests','scoring','celebrity','rules','day']) require(path.join(ROOT, 'web', f + '.js'));
const W = global.WZ, C = W.content;
const map = W.map.create({ places: C.places, zones: C.zones || [], mapSize: C.mapSize, params: C.params });
const files = ['web/rules.js','web/main.js','web/ui.js','web/day.js','web/scoring.js','server/db.js','server/index.js','content/params.js','content/places.js'];
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
const before = Object.fromEntries(files.map(f => [f, hash(f)]));
function mk(seed = 7, difficulty = 'easy', tags) {
  return W.rules.createRun({ seed, difficulty, tags, troubles: C.seedTroubles || [], params: C.params, places: C.places, content: C });
}
function settle(run, cmds, events) {
  const todo = (cmds || []).slice();
  let guard = 0;
  while (todo.length && guard++ < 500) {
    const c = todo.shift();
    if (events) events.push(c);
    if (c.type === 'celebrity') todo.push(...run.choose('celeb_' + c.who, 'b'));
    if (c.type === 'interrupt') todo.push(...run.choose(c.id, 'a'));
  }
}
function tick(run, min, events) {
  for (let left = min; left > 1e-8 && !run.state.ended; left -= Math.min(2, left)) {
    settle(run, run.tick(Math.min(2, left)), events);
  }
}
// 采用当前地图 A* 路径长度及配置速度估算步行分钟；不回放引擎碰撞/区域进入事件。
function walking(a, b) {
  const pts = map.findPath(a.ex, a.ey, b.ex, b.ey);
  if (!pts) throw new Error('unreachable ' + b.id);
  let prev = {x:a.ex,y:a.ey}, distance = 0;
  for (const p of pts) { distance += Math.hypot(p.x-prev.x,p.y-prev.y); prev=p; }
  return distance / (C.params.playerSpeed || 120) * (C.params.minPerSec || 4);
}
function play(seed, difficulty, route) {
  const run = mk(seed, difficulty), events = [];
  run.planRoute(route);
  settle(run, run.tick(0), events);
  let prev = map.placeById('center');
  for (const id of route) {
    if (run.state.ended) break;
    const to = map.placeById(id);
    tick(run, walking(prev, to), events);
    settle(run, run.onArrive(id), events);
    prev = to;
  }
  if (!run.state.ended) { tick(run, walking(prev, map.placeById('center')), events); settle(run, run.onArrive('center'), events); }
  const result = run.finish({wentBack:false});
  return { seed, difficulty, tags:run.state.guests.map(g=>g.tag), score:result.score, broughtBack:result.broughtBack,
    remembered:result.remembered, total:result.total, arriveMin:result.arriveMin, stops:result.stops,
    closed:events.filter(c=>c.type==='closed').map(c=>c.placeId), interrupts:events.filter(c=>c.type==='interrupt').length,
    says:result.scoreLog.flatMap(x=>x.lines.map(l=>l.say)) };
}
const routes = {
  balanced: ['f_changren','mochi','p_wuweihe','wuma','pier'],
  food: C.places.filter(p=>(p.types||[]).includes('food') && p.stayMin>0).slice(0,5).map(p=>p.id),
  sightseeing: C.places.filter(p=>(p.types||[]).includes('sight') && p.stayMin>0).slice(0,5).map(p=>p.id)
};
const samples = [];
for (const difficulty of ['easy','normal','hard']) for (let seed=1;seed<=30;seed++) {
  for (const [route,ids] of Object.entries(routes)) samples.push({route,...play(seed,difficulty,ids)});
}
const summary = [];
for (const difficulty of ['easy','normal','hard']) for (const route of Object.keys(routes)) {
  const a=samples.filter(x=>x.difficulty===difficulty&&x.route===route), avg=k=>+(a.reduce((s,x)=>s+x[k],0)/a.length).toFixed(2);
  summary.push({difficulty,route,runs:a.length,scoreMean:avg('score'),scoreMin:Math.min(...a.map(x=>x.score)),scoreMax:Math.max(...a.map(x=>x.score)),
    broughtBackMean:avg('broughtBack'),rememberedMean:avg('remembered'),clockMean:avg('arriveMin'),
    uniqueScoreLines:new Set(a.flatMap(x=>x.says)).size});
  summary.at(-1).closedMean=+(a.reduce((s,x)=>s+x.closed.length,0)/a.length).toFixed(2);
}
const same=mk(7,'easy',['food','walk','shop','bored','any']);
same.onArrive('f_changren');const first=same.state.score;same.onArrive('f_changren');const second=same.state.score;
const shortcut=mk(7,'easy',['food','walk','bored','rush','any']);shortcut.planRoute(routes.balanced);shortcut.tick(1);shortcut.onArrive('center');const quick=shortcut.finish({wentBack:false});
const base=mk(7,'easy',['food','walk','shop','bored','any']);base.onArrive('f_changren');const offline=base.state.score;
base.addBonus(4,'模拟同一次游玩中 Qwen 成功返回');const online=base.state.score;
const midnight=mk(7,'easy',['food','walk','shop','bored','any']);midnight.addTime(2000);const midnightResult=midnight.finish({wentBack:false});
const provenancePlaces=JSON.parse(JSON.stringify(C.places));
const provenancePlace=provenancePlaces.find(p=>p.id==='f_changren');
provenancePlace.real={info:{rating:4.8,ratingSrc:'携程',reviews:120}};
const provenanceRun=W.rules.createRun({seed:7,difficulty:'easy',tags:['food','walk','shop','bored','any'],troubles:C.seedTroubles||[],params:C.params,places:provenancePlaces,content:{...C,places:provenancePlaces}});
const provenanceStay=provenanceRun.onArrive('f_changren').find(c=>c.type==='stay');
const db = require(path.join(ROOT,'server/db')).open(':memory:');
const app=require(path.join(ROOT,'server/index')).createApp(db);
const handler=app._router.stack.find(l=>l.route&&l.route.path==='/api/runs').route.stack.at(-1).handle;
function post(seat, result) {
  const out={status:200};
  const res={status(n){out.status=n;return this},json(v){out.body=v;return this}};
  handler({body:{seat,result}},res);
  return out;
}
const fake={playerName:'本地隔离评审样本',total:5,broughtBack:5,remembered:5,arriveMin:1,overtime:false,lost:[],troubles:[],guestLines:[],score:500};
const injected=[post('REVIEW01',{...fake}),post('REVIEW01',{...fake,score:499}),post('REVIEW01',{...fake,score:498})];
const rangeReject=post('REVIEW02',{...fake,score:501});
post('REVIEW03',{...quick,playerName:'真实规则回放 1 分钟收队'});
const boards=db.boards();db.close();
const result={createdAt:new Date().toISOString(),method:'规则回放 + 同进程 Express handler + 内存 SQLite；无浏览器/真机/线上 API 请求',
  limitations:['步行按 A* 路径与配置速度估算，未进入区域，不模拟鼠标/手势/画面','冲突统一选 a，名人统一走过；不评估真人乐趣、渲染速度或实时 Qwen 输出','所有榜单数据只写内存库，不接触线上榜单'],
  routes,runCount:samples.length,summary,special:{sameShopRevisit:{first,second,extra:second-first},oneMinuteHome:{score:quick.score,broughtBack:quick.broughtBack,total:quick.total,remembered:quick.remembered,arriveMin:quick.arriveMin},
  onlineBonus:{sameActionsOffline:offline,sameActionsWithOneModelSuccess:online,delta:online-offline},ratingProvenance:{fixtureSource:'携程',fixtureRating:4.8,emitted:provenanceStay.score.lines.find(l=>l.say.includes('点评'))?.say},midnight:{clock:midnightResult.arriveMin,overtime:midnightResult.overtime,broughtBack:midnightResult.broughtBack,total:midnightResult.total,score:midnightResult.score,scoreLog:midnightResult.scoreLog},
  leaderboard:{fabricatedRunResponses:injected,range501Response:rangeReject,scoreEntriesForSameSeat:boards.score.filter(x=>x.seat==='REVI').length,score:boards.score,fastest:boards.fastest}},
  hashesBefore:before,hashesAfter:Object.fromEntries(files.map(f=>[f,hash(f)])),samples};
fs.writeFileSync(path.join(__dirname,'replay-results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,samples:undefined,hashesBefore:undefined,hashesAfter:undefined},null,2));
