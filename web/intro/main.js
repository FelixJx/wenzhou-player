import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const $=s=>document.querySelector(s), root=$('#intro');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene=new THREE.Scene();scene.background=new THREE.Color('#eae0c8');scene.fog=new THREE.Fog('#eae0c8',48,105);
const camera=new THREE.PerspectiveCamera(39,innerWidth/innerHeight,.1,170);
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch(e){$('#fallback').hidden=false;throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.22;
$('#scene').append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#fff0d0','#687c6e',2.5));
const sun=new THREE.DirectionalLight('#ffe1a5',3.2);sun.position.set(-14,28,18);scene.add(sun);
const colors={wall:'#d7c8a7',wall2:'#e7d9b6',wall3:'#baaa8b',roof:'#425d53',ridge:'#688073',wood:'#614d37',red:'#b75939',gold:'#e3b978',dark:'#30473f',stone:'#b8b49b'};
const batches=new Map(),matCache=new Map();
function mat(c){if(!matCache.has(c))matCache.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.94}));return matCache.get(c);}
const cube=new THREE.BoxGeometry(1,1,1),sphere=new THREE.SphereGeometry(1,7,5);
const dummy=new THREE.Object3D();
function addGeo(g,c,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){dummy.position.set(x,y,z);dummy.rotation.set(rx,ry,rz);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();const copy=g.clone().applyMatrix4(dummy.matrix);if(!batches.has(c))batches.set(c,[]);batches.get(c).push(copy);}
function box(x,y,z,w,h,d,c,rx=0,ry=0,rz=0){addGeo(cube,c,x,y,z,w,h,d,rx,ry,rz);}
function ball(x,y,z,r,c,sx=1,sy=1,sz=1){addGeo(sphere,c,x,y,z,r*sx,r*sy,r*sz);}
let seed=1024;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function roof(x,y,z,w,d,c=colors.roof){const rise=w*.24,angle=Math.atan2(rise,w/2),slant=Math.hypot(w/2,rise);for(const s of [-1,1]){box(x+s*w/4,y+rise/2,z,slant+.20,.13,d+.45,c,0,0,-s*angle);for(let i=0;i<Math.floor(d/.23);i++)box(x+s*w/4,y+rise/2+.075,z-d/2+i*.23,slant+.24,.035,.035,colors.ridge,0,0,-s*angle);}box(x,y+rise+.09,z,.13,.15,d+.66,colors.dark);for(const s of [-1,1])box(x+s*w/2,y-.02,z,.1,.12,d+.65,colors.dark);}
const signs=[];
function sign(text,x,y,z,w=1.5){const c=document.createElement('canvas');c.width=384;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#e5c991';ctx.fillRect(0,0,384,96);ctx.strokeStyle='#74573b';ctx.lineWidth=6;ctx.strokeRect(8,8,368,80);ctx.fillStyle='#425247';ctx.font='bold 52px "Microsoft YaHei"';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,192,51);const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicMaterial({map:tx}));m.position.set(x,y,z);scene.add(m);signs.push(m);}
function house(x,z,w,d,h,n){const wall=[colors.wall,colors.wall2,colors.wall3][n%3];box(x,h/2+.16,z,w,h,d,wall);box(x,.18,z,w+.22,.28,d+.20,colors.stone);roof(x,h+.16,z,w+.26,d);const front=z+d/2+.035;for(const side of [-1,1])box(x+side*w*.44,h/2,z+d/2+.07,.09,h,.09,colors.wood);box(x,h*.49,front,w,.09,.08,colors.wood);for(let j=0;j<3;j++){const xx=x+(j-1)*w*.29;box(xx,h*.72,front,w*.21,h*.24,.06,colors.dark);box(xx,h*.72,front+.04,.035,h*.24,.03,colors.gold);box(xx,h*.72,front+.04,w*.21,.035,.03,colors.gold);}box(x,h*.21,front,w*.26,h*.4,.08,colors.wood);for(const s of [-1,1]){box(x+s*w*.32,h*.22,front,w*.25,h*.30,.06,'#d7aa66');box(x+s*w*.32,h*.22,front+.04,.035,h*.30,.03,colors.wood);}if(n%3===0){box(x,h*.45,front+.36,w+.2,.09,.7,colors.red,.13);sign(['瓯味','老茶馆','鱼丸铺','南塘小店','温州记'][n%5],x,h*.49,front+.73,w*.65);}if(n%4===0){for(const s of [-1,1]){box(x+s*w*.43,h*.4,front+.30,.025,.35,.025,colors.dark);ball(x+s*w*.43,h*.30,front+.30,.13,colors.red,1,1.3,1);}}}

// Raised riverbank, paved lanes and a pair of dense blocks.
box(0,-.1,-6,35,.75,19,'#b6b79c');box(0,.29,1.9,35,.14,3.3,'#d4c8a9');box(0,.32,-6,2.4,.15,17,'#ddd1b2');
for(let i=-34;i<=34;i++)box(i*.5,.4,3.18,.43,.12,.55,'#c8c3a9');
for(let i=0;i<230;i++){const x=(rand()-.5)*34,z=rand()*2.7+.1;box(x,.385,z,.24+rand()*.4,.012,.018,'#b6ab90');}
let hn=0;for(const z of [-1.4,-5.9,-10.4])for(let x=-15.5;x<16;x+=2.9){if(Math.abs(x)<1.5)continue;house(x+(rand()-.5)*.24,z,2.25+rand()*.35,2.9,1.9+rand()*1.5,hn++);}
// Far island and stylised seven-storey twin pagodas; not a surveyed reconstruction.
ball(-1,-.23,-24,1,'#b2b79a',15,.6,3.9);ball(0,.03,-24,1,'#97a286',13,.5,3.1);
function tower(x,z,h){const levels=7;box(x,.3,z,2.7,.45,2.7,colors.stone);for(let i=0;i<levels;i++){const w=1.75-i*.13,y=.6+i*h/levels;const geo=new THREE.CylinderGeometry(w*.50,w*.55,h/levels,8);addGeo(geo,i%2?colors.wall2:colors.wall,x,y+h/levels/2,z);geo.dispose();const rg=new THREE.ConeGeometry(w*.85,.55,8);addGeo(rg,colors.roof,x,y+h/levels,z);rg.dispose();box(x,y+.28,z+w*.54,.21,.4,.05,colors.dark);}box(x,h+1.1,z,.08,.8,.08,colors.wood);ball(x,h+1.5,z,.13,colors.gold);}
tower(-7,-24,6.6);tower(8,-24,7.9);
// Layered hills on the horizon.
for(let i=0;i<19;i++){const x=-47+i*5;const g=new THREE.SphereGeometry(1,12,8);addGeo(g,'#b4bea5',x,-1.8,-43-rand()*9,7+rand()*6,4+rand()*4,3.5,0,rand(),0);g.dispose();}
function tree(x,z,r=1){box(x,1,z,.13,2,.13,colors.wood);for(let j=0;j<5;j++)ball(x+(rand()-.5)*r,1.9+rand()*r,z+(rand()-.5)*r,r*.62,['#738a67','#819370','#9aa17a'][j%3],1,.7,1);}
for(let i=0;i<29;i++)tree(-16+rand()*32,-20-rand()*7,.65+rand()*.6);
for(let i=0;i<12;i++)tree(-16+i*2.8,-14,.7);
for(const x of [-15,-9,-3,4,10,15])tree(x,1.4,.7);
// Waterfront railing, stairs, mooring poles and market parasols.
for(let x=-17;x<=17;x+=.9){box(x,.73,3.55,.09,.85,.09,colors.stone);}box(0,1,3.55,34,.08,.09,colors.stone);
for(let j=0;j<6;j++)box(5,.3-j*.09,3.7+j*.3,3,.15,.4,colors.stone);
const cone=new THREE.ConeGeometry(.72,.35,8);
for(const x of [-11,-5,2,9,14]){box(x,.86,.9,.06,1.6,.06,colors.wood);addGeo(cone,x%2===0?'#d2b776':colors.red,x,1.7,.9);box(x,.51,.9,1.1,.12,.7,colors.wood);}
cone.dispose();
// Simple pedestrians are animated independently.
const people=[];for(let i=0;i<19;i++){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CylinderGeometry(.07,.12,.28,6),mat([colors.red,colors.dark,'#c0a36c'][i%3]));body.position.y=.32;g.add(body);const head=new THREE.Mesh(new THREE.SphereGeometry(.085,7,5),mat('#cfb58b'));head.position.y=.54;g.add(head);const legs=[];for(const s of [-1,1]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.045,.19,.05),mat(colors.dark));leg.position.set(s*.045,.1,0);g.add(leg);legs.push(leg);}g.position.set(-15+rand()*30,.45,.1+rand()*2.5);scene.add(g);people.push({g,x:g.position.x,z:g.position.z,p:rand()*6,legs});}
for(const [c,geos] of batches){const merged=mergeGeometries(geos);const mesh=new THREE.Mesh(merged,mat(c));scene.add(mesh);geos.forEach(g=>g.dispose());}batches.clear();

const waterMat=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`varying vec2 p;varying vec3 viewPos;void main(){p=uv;vec3 q=position; q.z+=.025*sin(q.x*1.8+q.y*.8);vec4 v=modelViewMatrix*vec4(q,1.);viewPos=v.xyz;gl_Position=projectionMatrix*v;}`,fragmentShader:`varying vec2 p;varying vec3 viewPos;uniform float time;void main(){vec2 q=p*vec2(100.,80.);float a=sin(q.y*9.+sin(q.x*.7+time*.6)*1.3-time*1.8);float b=sin(q.y*17.+q.x*.8-time);float shine=pow(max(0.,a*.65+b*.35),12.);vec3 col=mix(vec3(.40,.53,.46),vec3(.64,.69,.56),p.y);col+=shine*vec3(.12,.11,.07);float glint=pow(max(0.,sin(q.y*4.+time)*sin(q.x*.8-time*.2)),26.);col+=glint*.12;col=mix(col,vec3(.918,.878,.784),smoothstep(43.,100.,length(viewPos)));gl_FragColor=vec4(col,1.);}`});
const water=new THREE.Mesh(new THREE.PlaneGeometry(160,160,1,1),waterMat);water.rotation.x=-Math.PI/2;water.position.y=-.35;scene.add(water);
// A small wooden boat with a warm sail glides through the foreground.
const boat=new THREE.Group();const hull=new THREE.Mesh(new THREE.SphereGeometry(1,12,6),mat('#63533b'));hull.scale.set(1.65,.23,.48);boat.add(hull);const deck=new THREE.Mesh(new THREE.BoxGeometry(2.3,.08,.7),mat('#b69b6f'));deck.position.y=.12;boat.add(deck);const mast=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,2.3,6),mat(colors.wood));mast.position.set(0,1.15,0);boat.add(mast);const sailShape=new THREE.Shape();sailShape.moveTo(.08,.4);sailShape.lineTo(.08,2.2);sailShape.quadraticCurveTo(1.1,1.5,1.1,.5);sailShape.closePath();const sail=new THREE.Mesh(new THREE.ShapeGeometry(sailShape),new THREE.MeshStandardMaterial({color:'#d9b97f',side:THREE.DoubleSide,roughness:1}));boat.add(sail);boat.position.set(-6,-.05,10);scene.add(boat);
// Thin decorative route along the promenade, revealed during the camera move.
const routePoints=[];for(let i=0;i<100;i++)routePoints.push(new THREE.Vector3(-16+i*.32,.51,2.8+.1*Math.sin(i*.1)));
const routeGeo=new THREE.BufferGeometry().setFromPoints(routePoints),route=new THREE.Line(routeGeo,new THREE.LineBasicMaterial({color:'#d88645',transparent:true,opacity:.65}));scene.add(route);
const steam=[];for(let i=0;i<12;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.1,6,5),new THREE.MeshBasicMaterial({color:'#fff3d4',transparent:true,opacity:.25,depthWrite:false}));scene.add(m);steam.push(m);}
const birds=[];for(let i=0;i<5;i++){const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.22,0,0),new THREE.Vector3(0,.09,0),new THREE.Vector3(.22,0,0)]);const b=new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#5b6f60'}));scene.add(b);birds.push(b);}

const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
let audioOffset=0;
let playing=false,time=5,raf=0,last=0,sound=false,audio=null,completed=false,disposed=false;
const title=$('#title-card'),opening=$('#opening'),letters=[...document.querySelectorAll('h1 span')];
function render(t){$('#scene').style.clipPath=`inset(0 ${(1-smooth(t/.65))*100}% 0 0)`;const portrait=innerWidth<600;const p=smooth(t/3.35);const start=new THREE.Vector3(10,7.5,14),end=portrait?new THREE.Vector3(24,27,49):new THREE.Vector3(27,25,39);camera.position.lerpVectors(start,end,p);const look=new THREE.Vector3().lerpVectors(new THREE.Vector3(-2,1,-5),new THREE.Vector3(0,portrait?5.5:4.5,-6),p);camera.lookAt(look);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();waterMat.uniforms.time.value=t;boat.position.x=-7+t*.50;boat.position.y=-.04+Math.sin(t*2)*.045;boat.rotation.z=Math.sin(t*1.7)*.018;people.forEach((o,i)=>{o.g.position.x=o.x+Math.sin(t*.4+o.p)*.6;o.g.position.z=o.z;o.legs.forEach((l,j)=>l.rotation.x=Math.sin(t*7+o.p+j*Math.PI)*.35);});steam.forEach((m,i)=>{const p=(t*.35+i/12)%1;m.position.set(-5+Math.sin(p*5+i)*.15,1+p*1.4,1);m.scale.setScalar(.5+p*1.8);m.material.opacity=(1-p)*.24;});birds.forEach((b,i)=>{b.position.set(-10+i*1.2+t*.5,8+i*.4,-21-i);b.rotation.z=Math.sin(t*4+i)*.16;});routeGeo.setDrawRange(0,Math.floor(clamp((t-.3)/2.5)*100));const a=smooth((t-3.05)/.55);title.style.opacity=a;title.style.transform=`translateX(-50%) translateY(${(1-a)*16}px)`;letters.forEach((l,i)=>{const u=smooth((t-3.08-i*.075)/.35);l.style.transform=`translateY(${(1-u)*24}px) scale(${1.12-.12*u})`;l.style.opacity=u;});$('.seal').style.opacity=smooth((t-3.8)/.25);opening.style.opacity=smooth(t/.4)*(1-smooth((t-1.3)/.4));$('#progress').style.width=`${t/5*100}%`;$('#clock').textContent=t.toFixed(2).padStart(5,'0');$('#chapter').textContent=t<.65?'01 / 瓯江 · 城市苏醒':t<2.1?'02 / 穿行 · 老街烟火':t<3.2?'03 / 展卷 · 一城故事':'04 / 温州玩家 · 即刻入城';renderer.render(scene,camera);root.dataset.time=t.toFixed(3);}
function tone(freq,at,duration,volume=.03,type='sine'){if(!audio||at+duration<=audioOffset)return;duration-=Math.max(0,audioOffset-at);at=Math.max(0,at-audioOffset);const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime+at);o.frequency.exponentialRampToValueAtTime(freq*.6,audio.currentTime+at+duration);g.gain.setValueAtTime(0,audio.currentTime+at);g.gain.linearRampToValueAtTime(volume,audio.currentTime+at+.02);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+at+duration);o.connect(g).connect(audio.destination);o.start(audio.currentTime+at);o.stop(audio.currentTime+at+duration+.05);}
async function stopAudio(){const old=audio;audio=null;if(old&&old.state!=='closed')await old.close();}
function soundtrack(offset=0){audioOffset=offset;if(!sound||reduced)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audio=new AC();void audio.resume();tone(320,0,.5,.02);tone(523,1,.6,.018);tone(784,2.1,.8,.025);tone(98,3.2,.65,.07,'triangle');tone(392,3.28,1.5,.025);tone(588,3.32,1.3,.012);}
function finish(reason='complete'){if(completed)return;completed=true;playing=false;cancelAnimationFrame(raf);time=5;render(time);$('#play').textContent='重播序章 ↻';$('#play').style.display='';$('#skip').style.display='none';$('#enter').style.display='inline-block';void stopAudio();try{localStorage.setItem('wenzhou-intro-seen','1');}catch{}root.dataset.state='complete';root.dispatchEvent(new CustomEvent('introcomplete',{bubbles:true,detail:{reason}}));}
function tick(now){if(!playing||disposed)return;if(!last)last=now;time=Math.min(5,time+(now-last)/1000);last=now;render(time);if(time>=5)finish();else raf=requestAnimationFrame(tick);}
async function play(){if(disposed)return;cancelAnimationFrame(raf);await stopAudio();completed=false;time=0;last=0;playing=true;root.dataset.state='playing';$('#play').style.display='none';$('#enter').style.display='none';$('#skip').style.display='inline-block';if(reduced){finish('reduced-motion');return;}soundtrack();render(0);raf=requestAnimationFrame(tick);}
$('#play').addEventListener('click',play);$('#skip').addEventListener('click',()=>finish('skip'));$('#sound').addEventListener('click',()=>{sound=!sound;$('#sound').textContent=`声音 ${sound?'开':'关'}`;$('#sound').setAttribute('aria-pressed',String(sound));if(!sound)void stopAudio();else if(playing)soundtrack(time);});
function resize(){renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);render(time);}window.addEventListener('resize',resize);
function visibility(){if(document.hidden){cancelAnimationFrame(raf);if(audio)void audio.suspend();}else if(playing){last=0;if(audio)void audio.resume();raf=requestAnimationFrame(tick);}}document.addEventListener('visibilitychange',visibility);
function dispose(){disposed=true;playing=false;cancelAnimationFrame(raf);void stopAudio();window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);const gs=new Set(),ms=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])ms.add(m);});gs.forEach(g=>g.dispose());ms.forEach(m=>{m.map?.dispose();m.dispose();});renderer.dispose();renderer.domElement.remove();}
window.wenzhouIntro={play,skip:()=>finish('skip'),dispose,seek(t){playing=false;cancelAnimationFrame(raf);void stopAudio();time=clamp(t,0,5);render(time);},get state(){return {time,playing,completed,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}};
render(5);root.dataset.state='ready';

// Optional offline QA adapter: measures the WebGL scene; DOM typography is tested separately.
if(new URLSearchParams(location.search).has('render')){
 window.__canvas=document.createElement('canvas');window.__canvas.width=innerWidth;window.__canvas.height=innerHeight;
 window.ERAS=[{id:'wenzhou',t0:0,t1:5}];window.__total=5;
 window.renderSolo=(_id,t)=>{render(t);window.__canvas.getContext('2d').drawImage(renderer.domElement,0,0,innerWidth,innerHeight);};
 window.renderFrame=t=>window.renderSolo('wenzhou',t);window.prepare=async()=>{};window.__ready=true;
}
