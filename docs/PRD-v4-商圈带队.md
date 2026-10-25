# PRD v4 · 商圈带队版（把正式游戏改成 Demo 的表达形式）

> 对照物：`docs/demo-商圈带队玩法.html`（可玩 Demo）+ `docs/demo-介绍视频.mp4`。
> 本文告诉落地的 agent：**现有代码里哪一块对应 Demo 的哪一幕、要改什么、怎么改、改完怎么验**。验收措施见 `docs/EVAL-v4-商圈带队.md`。
> 写给非程序员也能看懂：每条先说"玩家看到什么"，再说"代码动哪里"。

## 0. 先说结论：分三期，别一口气全做

| 期 | 内容 | 动到的文件 | 工作量 | 建议 |
|---|---|---|---|---|
| **P0 可当天上线** | ① 带队积分（每进一家店每位游客 ± 分，HUD 显示）② 进店后"每位游客逐个表态"卡片 ③ 店铺卡/停站卡显示三平台评分 ④ 结算页加积分 + 商家物料位（示例券）| `rules.js` `scoring.js` `ui.js` `main.js` `content/places.js` `content/promos.js`（新）| 半天 | **先做这个**，Demo 的"反馈 → 积分"闭环就有了 |
| **P1 下一版** | ⑤ 多商圈排一天：选商圈 → 实时算路程 → 900～1024 分钟才能出发 → 商圈间过场 | `book.js` `content/zones.js`（新）`advisor.js` `main.js` | 1～2 天 | 现有"排路线"改成两层：先选商圈，再在商圈里点店 |
| **P2 以后** | ⑥ 斜 45° 体素街区地图 | `render.js` `engine.js` `map.js` | 2～3 天 | 现在是正俯视像素风，改成等轴要重写绘制；Demo 里的 `buildBg()` 可以直接搬 |

**今天 14:00 冻结、16:00 提交。P0 都未必来得及全做完，建议 P0 里先做 ①②④，③ 的数据已经在 `content/places.js` 里，只是补显示。**

---

## 1. 现状 ↔ Demo 对照表

| Demo 的一幕 | 现有代码里对应什么 | 差距 |
|---|---|---|
| ① AI 游客各说一句需求 | 开场页 `ui.showIntro` → `guests.buildTeam()`（8 种标签 + 一句话困扰）| **已有**。只差把"需求"用 Demo 的句式再显示一遍（可选）|
| ② 排一天（多商圈 + 时间预算）| `book.js` 的 `B.planner`：在**一张老城地图**里选 3～5 站，`B.compute()` 算步行 + 停留 + 回程 | 差"商圈"这一层。现有 planner 只有一个片区，没有"商圈间坐车"概念 |
| ③ 商圈俯视图点店 → 队伍走过去 | `engine.js`：`E.goTo(placeId)`、`tapPoi` 事件、`E.addPlace()`；`main.js` `ensurePoiPlace()` 已能把高德 POI 变成可走的一站 | **已有 80%**。点图钉现在弹店铺卡再"加进路线"，Demo 是点了直接走。改一个分支即可 |
| 真实店铺 + 三平台评分 | `content/pois.js` 2281 家（只有位置/类别）；`content/places.js` 32 家精选带点评分；`tools/crawl-lab/results/*.json` 有 105 家的点评/高德/小红书 | 评分**没合并进** pois；店铺卡只显示点评分 |
| 进店动画 → 每位游客逐个表态 → 积分 ± | `rules.onArrive()` 产出 `stay` 命令 → `ui.showStay()` 停站卡（已有每人一句话）| **没有积分**。现在是"耐心百分比"，没有带队得分；停站卡的台词是随机池，不按店铺评分变化 |
| 结算：积分 + 满意度 + 商家券 | `scoring.build()` 产出带回人数/记住/称号/评审卡；`ui.showResult` | 没有积分、没有商家物料位 |

---

## 2. P0 详细规格（今天做）

### 2.1 带队积分（新）

**玩家看到**：HUD 右上角多一个「积分 ±N」数字；每进一家店跳一次；结算页第一行是积分。

**规则**（纯函数，放 `web/rules.js` 新增 `scoreStop(place, guests, clockMin)`，返回 `{total, lines:[{guestId, pts, say}]}`）：

| 游客标签 | 店铺情况 | 分数 | 台词模板（≤ 20 字）|
|---|---|---|---|
| 需求匹配（food→food，shop→shop，walk→rest，bored→sight/stage，toilet→toilet）| 第一次满足 | +12 | 「就是这个味，值了」「这手信够发一圈」「终于能坐下了」「这个有故事，我听」「谢谢你，记住了」|
| 同上 | 再次满足 | +5 | 同上 |
| 需求匹配 且 店铺评分 ≥ 4.5 | | 额外 +3 | 台词后加「（大众点评 4.9）没白来」|
| 需求匹配 且 评分 < 4.0 | | 额外 −4 | 「评分才 3.5，将就吃吧」|
| 不匹配 | | −2 | 「还没吃到正宗的」「没地方买东西？」「还要走多久」「这里…有点没劲」「厕所到底在哪」|
| 不匹配 但店是厕所 | | 0 | 「顺便上个厕所」|
| rush | 停留 > 45 分钟 | −6 | 「要待 75 分钟？太久了」|
| rush | 停留 ≤ 45 | +3 | 「站少，好」|
| crowd | 店在人潮区（`zones`）或评价数 > 3000 | −8 | 「3000 多条评价的店肯定排队，我在外面等」|
| crowd | 店类型含 lane | +10 | 「人少，我才进」|
| crowd | 其他 | +1 | 「还行，不挤」|
| any | | +2 | 有评分：「评分 4.6，看着行」；无评分：「没评分，试试呗」|
| 全队 | 过了 00:04 才回游客中心 | −10 | 结算页一行「过了午夜才回来 −10」|

**代码改动**：
- `content/params.js` 加 `score: { match:12, matchAgain:5, hiRating:3, loRating:-4, miss:-2, rushLong:-6, rushOk:3, crowdBad:-8, crowdLane:10, crowdOk:1, any:2, late:-10, hiRatingAt:4.5, loRatingAt:4.0, rushLongAt:45, crowdReviewsAt:3000 }`（**数值只从这里读**，CONTRACT §0）。
- `rules.js` `onArrive()` 里，在 `cmds.push({type:'stay',...})` 之前调用 `scoreStop`，把结果写进 `state.score += total`、`state.scoreLog.push({placeId, total, lines})`，并把 `lines` 塞进 `stay` 命令：`cmds.push({type:'stay', placeId, min, knowledgeId, score: {total, lines}})`。
- `state` 初始化加 `score: 0, scoreLog: []`。
- `finish()` / `scoring.build()` 返回值加 `score`、`scoreLog`；`overtime` 为真时 `score -= late`。
- 游客"耐心"系统**不动**，积分是叠加在上面的新维度；耐心仍决定走丢/回家。

### 2.2 停站卡改成"进店动画 + 逐个表态"

**玩家看到**：到店先弹一张店铺卡（图标、店名、评分行、停留分钟），0.9 秒后翻出「+11 分」，再 1 秒自动收起；然后 5 位游客的表态一条条出现（每条 0.3 秒错开），每条右边是 ±分；积分数字跳一下。

**代码改动**（`web/ui.js`）：
- `ui.showStay(place, knowledge, onDone, opts)` 加 `opts.score`：
  - 卡片顶部新增 `.stay-rating` 一行：用 `ratingText(place)`（见 2.3）。
  - 原来的"每人一句"列表改成按 `opts.score.lines` 渲染：`头像 · 名字 · 「台词」 · ±分`，分数用 `.plus/.minus` 配色，逐条 `animation-delay: i*0.3s`。
  - 卡片出现前先放 `.enter-flash`（现有 `engine.flash()` 可直接用）+ 卡片 `pop` 动画（Demo 的 `@keyframes pop` 搬过来）。
- `main.js` `onStay(c)`：把 `c.score` 透传给 `showStay`；收起后 `ui.hud.setScore(run.state.score)`（新增 HUD 方法，数字变化时加 `.bump`）。

### 2.3 店铺评分：三平台合并显示

**玩家看到**：店铺卡、停站卡、排路线卡的评分行统一写成
`大众点评 4.0（4843评）· 高德 4.1 · 小红书 未采`；没有任何评分的店写 `暂无平台评分（宁空勿编）`。

**数据**：
- 新建 `tools/realmap/build_ratings.js`（可直接改自 `tools/realmap/build_demo_data.js` 的匹配逻辑）：读 `tools/crawl-lab/results/meituan-ratings.json`（点评/美团同池）、`amap-poi-105.json`（高德评分）、`xhs-heat-20261024.json`（小红书热度），输出 `content/ratings.js`：`WZ.content.ratings = { '<name核心>': {dp, dpn, am, xhs} }`。
- **匹配规则（防错挂）**：店名去括号、去 `店/铺/老店/坊` 后缀后**完全相等**才挂；游戏精选 32 家用显式映射表（`build_demo_data.js` 里的 `GM`）。宁可少挂，不挂错。
- `places.js` 里已有的 `real.info.rating/ratingSrc/reviews` 优先级高于 `ratings.js`。
- 小红书：105 家里只有 2 家有值，其余显示「未采」。**不要**把空值显示成 0 或"无"。

**代码改动**：
- `web/book.js` 新增 `B.ratingText(place)`，`shopCard` / planner 卡片 / `renderBook` 都改用它。
- `web/advisor.js` `flags()` 里评分加权的那一句改用合并后的 `dp || am`。

### 2.4 结算页：积分 + 商家物料位

**玩家看到**：结算页最上面「带队积分 N」+ 一句评语（≥80 带得漂亮 / ≥40 带得不错 / ≥15 还行 / 否则没带好）；中间保留现有"带回 X 人 / 记住 X 人 / 称号"；下面新增「这一天解锁的商家物料」：走过的店里有物料的，一张张列出来，每张标「演示用示例，非真实优惠」。

**数据**：新建 `content/promos.js`：`WZ.content.promos = { f_changren: {t:'示例券：馄饨第二碗半价', k:'coupon'}, p_wuweihe: {...}, f_paidui: {...}, teastall: {...}, jiangxin: {...}, tanghe: {...} }`。**全部标示例**，接商家后台前不许出现真实券面。

**代码改动**：
- `scoring.build()` 返回 `promos: state.stayed.filter(id => promos[id]).map(...)`。
- `ui.showResult` 加积分块和 `.promo` 列表（样式搬 Demo 的 `.promo`）。
- 地图上有物料的店插一面红「惠」旗：`render.js` `drawLabels` 里 `placeLabels` 的 `p.promo` 为真时调用现有 `drawPennant(ctx, x, y, 'red', ...)` 再叠一个「惠」字。
- 后端 `POST /api/runs` 的 payload 加 `score`（`server/index.js` 校验：整数，−200～500），`/api/boards` 排行榜**暂不**按积分排（保持"带回人数"），避免改榜单逻辑。

### 2.5 点图钉直接走（小改）

现在：点高德图钉 → 弹店铺卡 → 点「加进路线」才走。
改成：出发后点图钉 → 直接 `ensurePoiPlace(q)` + 插到路线下一站 + `engine.goTo(p.id)`，店铺卡只在长按时弹。
`main.js` `e.on('tapPoi')` 的 `planned` 分支改一行即可；`onReplan` 已能处理路线插入。

---

## 3. P1 规格：多商圈排一天

### 3.1 商圈数据 `content/zones.js`（新文件，别和现有 `content.zones` 人潮区混淆，命名 `districts`）

```js
WZ.content.districts = [
  { id:'wuma',     name:'五马街 · 公园路', kind:'老城商圈', lng:120.655, lat:28.019, stayDefault:150, center:{x:1100,y:1430}, r:400 },
  { id:'mochi',    name:'墨池 · 仓桥街',   kind:'老城商圈', lng:120.662, lat:28.023, stayDefault:150, center:{x:900, y:1050}, r:330 },
  { id:'jiangxin', name:'江心屿 · 朔门',   kind:'景区+老街', lng:120.650, lat:28.032, stayDefault:180, center:{x:520, y:720},  r:420 },
  { id:'nantang',  name:'南塘街 · 塘河',   kind:'夜游商圈', lng:120.676, lat:27.995, stayDefault:120, car:true, placeIds:['tanghe'] },
  { id:'nanxi',    name:'楠溪江 · 丽水街', kind:'远郊景区', lng:120.69,  lat:28.35,  stayDefault:200, car:true, placeIds:['nanxi'] },
  { id:'yandang',  name:'雁荡山',          kind:'远郊景区', lng:121.05,  lat:28.37,  stayDefault:300, car:true, placeIds:['yandang'] }
];
```
老城三片的店 = `pois.js` + `places.js` 里落在 `center/r` 圆内、且离本圈最近的（去重逻辑在 `build_demo_data.js`）。远郊三片只有 `placeIds` 里的精选地点 + 清单店铺（示意位置）。

### 3.2 商圈间路程（`advisor.js` 或新 `web/travel.js`）

```
km = 经纬度球面距离 × 1.3
≤ 3 km：步行，min = km / 4.5 × 60
> 3 km：坐车，min = km / 35 × 60 + 15（候车）
```
页面上凡显示路程都带「估算」二字。现有 `engine.walkMin()` 只管圈内步行，不动。

### 3.3 排一天页（`book.js` 新增 `B.dayPlanner`）

- 卡片：商圈名、类型、共 N 处 / M 家有评分、类别计数、评分最高 3 家、游客谁满意谁抱怨（复用 `advisor.flags` 的需求匹配）、预计停留 ±30 分钟。
- 右侧手册：07:00 出发 → 每段路（步行/坐车 N 分钟）→ 每站到达/离开时刻 → 回到游客中心时刻；时间条「路上 / 停留 / 剩余」。
- **出发条件**：`900 ≤ 路上 + 停留 + 回程 ≤ 1024`。不满足时按钮灰掉并写明差多少、建议加站还是减停留。数值放 `params.dayMinFloor = 900`。
- 出发后：`state.day = { districts:[id...], idx:0, zoneLeft }`；进圈时 `engine.init` 只加载该圈的店（`E.setDistrict(id)` 新方法：换掉 `S.pois` 子集 + 镜头 `focus` 到圈中心）；圈内规则不变（现有 `planRoute`/`onArrive` 全部复用，路线就是玩家在圈里点的店）。
- 「去下一站」：过场页（步行/坐车动画 1.8 秒）→ `state.clockMin += travel.min` → `setDistrict(next)`。最后一站后 → `goHome()`。
- 圈内"预计停留"用完只提示，不强制。

### 3.4 保留现有玩法的部分
- 谢灵运答题、名人卡、天气、走丢/回头找人、耐心、哄一哄：**全部保留**，只是发生在当前商圈里。
- 现有单片区"排路线"保留为「经典模式」入口（开场页两个按钮），避免冻结前改坏主流程。

---

## 4. P2 规格：斜 45° 体素街区（以后）

Demo 的 `buildBg()`（等轴投影 + 按格子生成建筑体块 + 街名沿路）可以整体搬进 `render.js` 当一个新的 `R.drawIsoGround()`；
`engine.js` 的 `worldToScreen` 要换成 `toScreen()`（等轴），人物、气泡、路线线段都跟着换。
真实道路/水面/绿地数据已经在 `tools/realmap/build.js` 的 `real.mask` 里。
这是整套渲染重写，**不在本次范围**。

---

## 5. 数据诚实边界（所有期都适用）

- 评分只在店名完全对上时挂；挂不上 = 「暂无平台评分（宁空勿编）」。
- 小红书热度：有值显示值，没值显示「未采」。
- 商圈间路程、远郊店铺位置：标「估算」「示意位置」。
- 券/活动：标「演示用示例，非真实优惠」，接商家后台前不许去掉。
- 雁荡山：保留「携程 10/24 显示暂停营业」提示。

## 6. 不做的事
- 不加金钱；积分不换现金。
- 不改排行榜排序逻辑（仍按带回人数）。
- 不动 `server/.env`、不写任何 key。
- 不建新门禁、不升级架构。
