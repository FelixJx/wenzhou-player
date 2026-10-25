# CONTRACT v1 —— 所有 agent 只认这份文件

冻结时间：2026-10-23 15:00。需要改契约 → 写 `docs/ISSUES.md`，由 Lead 裁决；不得私改别人的文件。

## 0. 硬约束

- 纯静态前端：Canvas 2D + 原生 JS，**不用 ES module、不用打包、不用任何 CDN/外链**。必须能用 `file://` 双击打开 `web/index.html` 直接玩（因此内容用 `.js` 不用 `.json`，不用 fetch 读本地文件）。
- 所有前端代码挂在全局命名空间 `window.WZ`。每个文件开头：`window.WZ = window.WZ || {};`
- 规则与内容文件必须能在 Node 里 `require`：用下面的 UMD 壳
  ```js
  (function (root) {
    root.WZ = root.WZ || {};
    // ... root.WZ.rules = { ... }
  })(typeof window !== 'undefined' ? window : globalThis);
  ```
  Node 测试里 `require('../web/rules.js'); const rules = globalThis.WZ.rules;`
- 所有用户可见文字为简体中文。所有数值只从 `content/params.js` 读，不写死。
- 一个文件只有一个写者（见 §7）。

## 1. 目录

```
web/        index.html style.css main.js(Lead) net.js(Lead)
            engine.js map.js render.js input.js        ← W1
            rules.js guests.js scoring.js celebrity.js ← W2
            ui.js ending.js                            ← W3
content/    params.js places.js guests.js knowledge.js celebrities.js
            ending.js seed_troubles.js badwords.js     ← W5
server/     index.js db.js ai.js filter.js package.json ← W4
deploy/     nginx.conf wenzhou.service deploy.sh README.md ← W4
tests/      rules.test.js(W2) path.test.js(W1) api.test.js(W4) smoke.spec.js(QA)
docs/       CONTRACT.md PRD.md EVAL.md AGENT_PLAN.md PROGRESS.md ISSUES.md
```

`web/index.html` 脚本加载顺序（W3 维护）：
`content/params.js → content/places.js → content/guests.js → content/knowledge.js → content/celebrities.js → content/ending.js → content/seed_troubles.js → content/badwords.js → web/map.js → web/render.js → web/input.js → web/engine.js → web/guests.js → web/scoring.js → web/celebrity.js → web/rules.js → web/ui.js → web/ending.js → web/net.js → web/main.js`

## 2. 核心数据

### 2.1 困扰标签 `tag`
`walk`(走不动) `food`(吃不惯) `crowd`(怕挤挤) `shop`(买买买) `bored`(没劲儿) `rush`(催催催) `toilet`(憋不住) `any`(都行哥)

### 2.2 地点 `content/places.js`
```js
WZ.content.places = [
  { id:'center', name:'游客中心', types:['home'], x:0, y:0, stayMin:0, knowledgeId:'k_center' },
  { id:'wuma',   name:'五马街',   types:['shop','sight'], x:0,y:0, stayMin:32, knowledgeId:'k_wuma',
    crowdWindow:[300,600] },  // 游戏分钟（07:00=0），该区间为人潮区
  // types 取值: home | rest(歇脚) | food(本地小吃) | shop(手信) | sight(看点) | toilet | lane(小巷) | stage(戏台)
]
WZ.content.zones = [ { id:'wuma_crowd', placeId:'wuma', x,y,w,h } ]   // 人潮区矩形
WZ.content.mapSize = { w: 1600, h: 2400 }  // 世界坐标，竖屏优先
```
必含地点 id：`center, wuma, mochi(墨池公园), xianqian(县前小吃街), teastall(巷子茶摊), pier(江滨码头), lane1, lane2, toilet1, toilet2, toilet3`。

### 2.3 游客对象（rules 产生，engine/ui 只读）
```js
{ id:'g1', tag:'walk', name:'走不动', line:'一天走了两万步', hearts:3,
  status:'follow'|'sit'|'runaway'|'lost'|'home', calmLeft:2, remembered:false,
  meter:0, pos:{x,y}|null, lostAt:{x,y}|null, satisfied:false }
```

### 2.4 游戏时钟
`clockMin` 0..1024（07:00 起）。实时推进速率 `params.minPerSec = 4`。停站跳 `params.stayMin = 32`，歇脚 `params.restMin = 64`。回头 `params.goBackMin = 64`。天色阶段 `stage(clockMin)` → 0..4 按 256/512/768/972 切。

### 2.5 结果对象 `result`
```js
{ broughtBack:4, total:5, remembered:3, arriveMin:973, overtime:false, lost:[guestId],
  guestLines:[{id,name,text,star:true}], knowledge:[knowledgeId×3], title:'贴心向导',
  celebrities:[who], wentBack:true|false, difficulty:'easy', seat:'abc123' }
```

## 3. 引擎接口 `WZ.engine`（W1）

```js
WZ.engine.init(canvas, { places, zones, mapSize, params })
WZ.engine.start() / stop() / pause(bool)
WZ.engine.setPlayer({ name })
WZ.engine.setGuests(guests)            // 每帧按 guests[].status/pos 渲染跟随/坐下/走失
WZ.engine.moveTo(x, y)                 // 点地面寻路（A*，网格 32px）
WZ.engine.goTo(placeId)                // 寻路到地点入口；到达触发 'arrive'
WZ.engine.setClock(clockMin)           // 只用于天色/灯笼，不管逻辑
WZ.engine.setWeather('none'|'rain'|'heat'|'typhoon')
WZ.engine.setRoadwork(placeId|null)    // 封路，寻路绕行
WZ.engine.guestSit(id, true|false)
WZ.engine.guestRunTo(id, placeId)      // 游客脱队跑向地点，到达后停在门口
WZ.engine.guestReturn(id)              // 归队
WZ.engine.markLost(id)                 // 变灰留在原地
WZ.engine.bubble(id|'player', text, ms)
WZ.engine.spawnNPC({ id, placeId, label })  // 名人/问路 NPC，点击触发 'tapNPC'
WZ.engine.removeNPC(id)
WZ.engine.flash(ms)                    // 全黑
WZ.engine.on(event, cb)  // 'arrive'(placeId) 'tick'(dtSec) 'tapGuest'(id) 'tapNPC'(id) 'enterZone'(zoneId) 'leaveZone'(zoneId) 'tapGround'
WZ.engine.getPlayerPos() → {x,y}
WZ.engine.distTo(placeId) → px
```
渲染要求：竖屏优先、相机跟随玩家、斜俯视像素风（程序化绘制 + 可选 `web/assets/*.png` 精灵，缺图不报错）、五档调色板、雨粒子、黄昏灯笼亮起、人潮区红色半透明、厕所/歇脚/小吃等类型图标在地点上方始终可见。移动端：点地面走；桌面：WASD + 点地面。60fps 目标。

## 4. 规则接口 `WZ.rules`（W2，纯逻辑，无 DOM）

```js
const run = WZ.rules.createRun({ troubles:[{tag,text}], difficulty:'easy'|'normal'|'hard',
                                 params, places, content, seed, firstRun:true|false })
run.state            // { clockMin, guests, route:[], visited:[], events, celebritiesMet:[], pendingInterrupt }
run.planRoute(ids)   // 设定路线；返回 preview: [{guestId, mood:'happy'|'worry'|'neutral', text}]
run.tick(dtGameMin)  → commands[]
run.onArrive(placeId) → commands[]      // 内含停站：推进 stayMin，并发 {type:'stay'}
run.onTapGuest(id)   → commands[]      // 哄
run.onEnterZone(zoneId) / onLeaveZone(zoneId) → commands[]
run.choose(interruptId, 'a'|'b') → commands[]
run.goHome()         → commands[]      // 玩家主动结束
run.finish({ wentBack:boolean }) → result
```
命令类型（UI/engine 消费）：
```
{type:'bubble', id, text, ms}
{type:'sit', id} {type:'runaway', id, placeId} {type:'return', id} {type:'lost', id}
{type:'stay', placeId, min, knowledgeId}            // UI 显示停站卡 + 知识一句话，engine 暂停
{type:'interrupt', id, title, a:{label}, b:{label}} // 永远只有 a/b 两个
{type:'celebrity', who, card:{name,title,text,source:'template'|'ai',knowledgeId,ask:'poem'|'play'|'talk'|'none'}}
{type:'weather', kind} {type:'roadwork', placeId|null}
{type:'clock', clockMin} {type:'hud'}
{type:'end', reason:'home'|'midnight'}
```
必须实现的规则（数值全部来自 params）：7 种标签行为与征兆；心 3 颗；哄每人 2 次；心 0 → sit/runaway/lost；冲突对同时冒泡 → interrupt；都行哥每局必有且不掉心；easy=5 人且至少一对冲突；normal 6 / hard 7 + 传染；停站推进时钟；1024 自动 end；回头 +64；评分与称号；名人触发（`content/celebrities.js` 的 `trigger` 字段）；知识收集（每次 stay 记录 knowledgeId）。名人文本先用模板，`WZ.celebrity.request(who, ctx, cb)` 预留异步 AI 位，由 `net.js` 注入 `WZ.celebrity.provider`。

## 5. UI 接口 `WZ.ui`（W3）

```js
WZ.ui.showIntro(onSubmit({ name, tag, text }))         // 昵称 + 选标签 + ≤10字；敏感词用 content/badwords.js 替换为模板默认句
WZ.ui.showTeam(guests, onReady)                          // 5 位游客亮相，各念一句
WZ.ui.showRoutePlanner({ places, guests, preview(ids) }, onConfirm(ids))  // 点选 3-5 个，实时显示 preview 表情
WZ.ui.hud.update(state)                                  // 顶部 1024 内存条进度条（只报读数）、游客头像+心+图标、哄次数
WZ.ui.showStay(place, knowledgeText, onDone)             // 底部卡片，3 秒自动收起
WZ.ui.showInterrupt({ title, a, b }, cb('a'|'b'))        // 底部两按钮，不弹全屏，8 秒默认 'b'
WZ.ui.showCelebrity(card, onChoice('stay'|'pass'))       // 全屏名人卡（旋转翻面动效，可跳过）
WZ.ui.showEnding(result, onChoice(wentBack))             // 黑屏→"天黑了。"→"队伍回到出发点。"→灯亮点人头→[回去找他 +64分钟][继续回家]；无人丢失则直接进结算
WZ.ui.showResult(result, { onAgain, onWhere, onBoards })
WZ.ui.showEpilogue(lines, onDone)                        // 升华屏：每层 2 秒，不可跳过，仅首局
WZ.ui.showDifficulty(unlocked, onPick)                    // 第一局锁初级
WZ.ui.showBoards(data)
WZ.ui.toast(text)
```
所有页面在 390×844 可完整显示；桌面居中 9:16 容器。颜色/字体在 `style.css`。

## 6. 后端 API（W4）与前端 `net.js`（Lead）

Base：同源 `/api`。全部 JSON，失败返回 `{ok:false,error}`。
```
POST /api/troubles   { seat, tag, text }                → { ok, id }        // 服务端再过一遍敏感词；限流 10/min/IP
GET  /api/troubles/sample?n=5&exclude=<seat>            → { ok, items:[{tag,text}] }  // 随机，排除本座位，不足用种子补
POST /api/runs       { seat, result }                   → { ok }
GET  /api/boards     → { ok, remembered:[...], fastest:[...], lost:[...] }  // 各前 20，字段 {seat(前4位), name, value, at}
GET  /api/mine?seat= → { ok, text, assigned, broughtHome }   // "我写的那句去哪了"
POST /api/celebrity  { who, ctx:{playerName, route:[names], tags:[], place, stage} } → { ok, text, source:'ai'|'template' }
GET  /api/health     → { ok, version }
```
`server/ai.js`：读 env `AI_BASE_URL`（Anthropic 兼容，如 dashscope）、`AI_API_KEY`、`AI_MODEL`；3 秒超时或缺 env → 返回 `content/celebrities.js` 模板。输出 ≤60 字，并由 filter 过一遍。
静态：`/play/*` → `web/`，`/content/*` → `content/`。SQLite 文件路径 env `DB_PATH`（默认 `./data/wz.db`）。端口 env `PORT`（默认 8790）。
`net.js` 行为：所有请求 2.5 秒超时；失败静默，切 `WZ.content.seedTroubles`，并把未上传的困扰存 `localStorage.wz_pending` 下次重试；`seat` 为本机随机 8 位存 localStorage。

## 7. 文件所有权

| 文件 | 写者 |
|---|---|
| web/engine.js map.js render.js input.js, tests/path.test.js | W1 |
| web/rules.js guests.js scoring.js celebrity.js, tests/rules.test.js | W2 |
| web/index.html ui.js ending.js style.css | W3 |
| server/**, deploy/**, tests/api.test.js | W4 |
| content/*.js | W5 |
| web/main.js web/net.js docs/* | Lead |
| tests/smoke.spec.js artifacts/ | QA |

## 8. 完成定义（每个 W 的交付）

- 代码 `node --check` 通过；自己的测试通过；在 `docs/PROGRESS.md` 追加一行（文件、功能、怎么验证）。
- W1 另交 `web/engine-demo.html`（仅引入 content + 自己的文件，可点地面走、看天色变化）。
- W3 另交 `web/ui-demo.html`（用 mock state 依次演示所有页面）。
- W2 的 `tests/rules.test.js` 覆盖：每种标签的征兆→后果；哄 2 次上限；冲突 interrupt；1024 自动结束；回头 +64 与 overtime；称号 4 种；easy 必含 any 且含冲突对；hard 传染。
- W4 的 `tests/api.test.js` 在本地起服务后跑；`deploy/README.md` 写清在 ECS 上的步骤（nginx conf.d vhost、systemd、目录 `/srv/wenzhou`、域名占位 `play.yaosenai.cn`）。
- W5 每条内容带 `source`；名人生平只写有把握且标注出处的；全部中文。
