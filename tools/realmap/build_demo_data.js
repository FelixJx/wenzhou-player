global.window=global;global.WZ={content:{}};require('/home/claude/wz/content/places.js');require('/home/claude/wz/content/pois.js');
const fs=require('fs');const C=WZ.content,P=C.pois;
const mt=JSON.parse(fs.readFileSync('/home/claude/wz/tools/crawl-lab/results/meituan-ratings.json'));
const am=JSON.parse(fs.readFileSync('/home/claude/wz/tools/crawl-lab/results/amap-poi-105.json'));
const xh=JSON.parse(fs.readFileSync('/home/claude/wz/tools/crawl-lab/results/xhs-heat-20261024.json'));
const norm=s=>String(s).replace(/[（(].*?[)）]/g,'').replace(/[·\s]/g,'');const core=s=>norm(s).replace(/(老店|总店|饭店|排档|店|铺|坊)$/,'').replace(/历史文化街区$/,'街');
const names105=Object.keys(mt);
const GM={xianqian:'县前头汤圆店',f_changren:'长人馄饨铺',f_airen:'矮人松糕',f_paidui:'排队烧饼',f_shamaohe:'纱帽河老面馆',f_wzdjj:'温州大酒家瓯菜馆',f_ouyan:'瓯宴府',f_zhengliang:'正亮海鲜',lane2:'夏鼐故居',xiechi:'池上楼',shuomen:'朔门古港',jiangxin:'江心屿',s_miaoguo:'妙果寺',s_qingnian:'庆年坊',tanghe:'塘河夜画',wuma:'五马历史文化街区',yandang:'雁荡山',nanxi:'丽水古街'};
function match(n,gid){ if(gid) return GM[gid]||null; const s=core(n); return names105.find(k=>core(k)===s)||null; }
function info(k){ if(!k) return null; const o={}; if(mt[k]&&mt[k]['美团评分']){o.dp=mt[k]['美团评分'];o.dpn=mt[k]['美团评价数'];} if(am[k]&&am[k]['高德评分']) o.am=am[k]['高德评分']; if(xh[k]&&xh[k]['小红书热度']) o.xhs=xh[k]['小红书热度']; return Object.keys(o).length?o:null; }
const ZB={wuma:{cx:1100,cy:1430,r:400},mochi:{cx:900,cy:1050,r:330},jiangxin:{cx:520,cy:720,r:420}};
const out={}; const used=new Set(); function nearest(x,y){let b=null,bd=1e9;for(const z in ZB){const d=Math.hypot(x-ZB[z].cx,y-ZB[z].cy);if(d<bd){bd=d;b=z;}}return b;}
for(const z in ZB){ const b=ZB[z]; const arr=[];
  P.list.forEach(r=>{ const cat=P.cats[r[1]]; if(!['food','cafe','shop','sight'].includes(cat)) return; const d=Math.hypot(r[2]-b.cx,r[3]-b.cy); if(d>b.r) return; if(nearest(r[2],r[3])!==z) return;
    const k=match(r[0],null); arr.push({n:r[0],c:cat,x:r[2],y:r[3],a:r[4],k:k||null,i:info(k)}); if(k) used.add(k); });
  // game places in range
  C.places.forEach(p=>{ if(Math.hypot(p.x-b.cx,p.y-b.cy)>b.r) return; if(/坐车/.test(p.name)) return; if(nearest(p.x,p.y)!==z) return; if(['home'].some(t=>(p.types||[]).includes(t))) return; const ri=p.real&&p.real.info||{}; const k=match(p.name,p.id); if(k) used.add(k);
    arr.push({n:p.name,c:(p.types||[])[0],types:p.types,x:p.x,y:p.y,g:p.id,stay:p.stayMin,hours:p.hours,i:Object.assign({},info(k)||{},ri.rating?{dp:ri.rating,dpn:ri.reviews,src:ri.ratingSrc}:{}),crowd:!!(C.zones||[]).find(zn=>zn.placeId===p.id)}); });
  out[z]=arr; console.log(z,arr.length,'matched105',arr.filter(a=>a.k).length,'game',arr.filter(a=>a.g).length);
}
// outside map: by address keyword
const far={nantang:[],nanxi:[],yandang:[]};
names105.forEach(k=>{ const ad=(am[k]&&am[k]['详细地址'])||''; let z=null; if(/南塘|塘河|梧田|三垟|瓯海/.test(ad+k)) z='nantang'; else if(/永嘉|楠溪|丽水古街|苍坡/.test(ad+k)) z='nanxi'; else if(/乐清|雁荡/.test(ad+k)) z='yandang'; if(z&&!used.has(k)) far[z].push({n:k,i:info(k),ad:ad}); });
for(const z in far) console.log(z,far[z].map(a=>a.n+(a.i?JSON.stringify(a.i):'')).join(' | '));
// 没落进任何圈的游戏地点挂到最近的商圈（远郊的除外）
C.places.forEach(p=>{ if((p.types||[]).includes('home')) return; if(/坐车/.test(p.name)) return; if(Object.values(out).some(arr=>arr.some(a=>a.g===p.id))) return;
  let best=null,bd=1e9; for(const z in ZB){const d=Math.hypot(p.x-ZB[z].cx,p.y-ZB[z].cy); if(d<bd){bd=d;best=z;}} if(bd>900) return;
  const ri=p.real&&p.real.info||{}; const k=match(p.name,p.id); if(k) used.add(k);
  out[best].push({n:p.name,c:(p.types||[])[0],types:p.types,x:p.x,y:p.y,g:p.id,stay:p.stayMin,hours:p.hours,far:true,i:Object.assign({},info(k)||{},ri.rating?{dp:ri.rating,dpn:ri.reviews,src:ri.ratingSrc}:{})}); console.log('attach',p.name,'->',best,Math.round(bd)); });
fs.writeFileSync('/tmp/claude-0/zonedata.json',JSON.stringify({out,far}));
console.log('used105',used.size);console.log('UNUSED',names105.filter(k=>!used.has(k)).join(' '));
