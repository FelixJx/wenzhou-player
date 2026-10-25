# EVAL v4 · 商圈带队版验收与保障措施

> 配套 `docs/PRD-v4-商圈带队.md`。每一条都写明：怎么跑、看到什么算过。
> 原则：**测试先于代码**——落地 agent 先把下面 P0 的单测写进 `tests/score.test.js`（全红），再改代码直到全绿；现有门禁一条不能变红。

## 0. 现有门禁（改动后必须仍然全绿）

```
node tests/rules.test.js      # 27 项
node tests/upgrades.test.js   # 9 项
node tests/advisor.test.js    # 9 项
node tests/path.test.js       # PASS
node tests/api.test.js        # 15 项（需本地服务 PORT=8790）
WZ_BASE=http://127.0.0.1:8790 node tests/smoke-run.js   # 整局自动试玩 → artifacts/smoke-report.md 「通过」
OUT=artifacts/deep/ python3 tests/deep-ui.py             # 5 种屏幕：无 H溢出 / 省略号 / 出屏 / 重叠
```

## 1. P0 单元测试 `tests/score.test.js`（新建，目标 ≥ 14 项）

用 `tests/rules.test.js` 的加载方式（`global.window = global` 后 require content + rules），构造 `createRun({ seed, tags:[...] })`，直接调 `run.scoreStop(place, guests, clockMin)` 或走 `run.onArrive(placeId)` 看 `cmds` 里的 `stay.score`。

| # | 场景 | 断言 |
|---|---|---|
| 1 | food 游客进 food 店（无评分）第一次 | 该游客 `pts === params.score.match`（12），台词含「值了」|
| 2 | 同一游客第二次进 food 店 | `pts === matchAgain`（5）|
| 3 | food 游客进评分 4.9 的 food 店 | `pts === 12 + 3`，台词含「4.9」|
| 4 | food 游客进评分 3.5 的 food 店 | `pts === 12 − 4`，台词含「将就」|
| 5 | shop 游客进 food 店 | `pts === miss`（−2）|
| 6 | 任意非 toilet 游客进厕所 | `pts === 0`，台词「顺便上个厕所」|
| 7 | rush 游客进停留 75 分钟的店 | `pts === rushLong`（−6），台词含「75」|
| 8 | rush 游客进停留 25 分钟的店 | `pts === rushOk`（+3）|
| 9 | crowd 游客进评价数 4843 的店 | `pts === crowdBad`（−8），台词含「4843」或「排队」|
| 10 | crowd 游客进 lane 类型 | `pts === crowdLane`（+10）|
| 11 | any 游客进有评分的店 | `pts === 2`，台词含评分数字 |
| 12 | 全队 5 人进一家店 | `total === 各人 pts 之和`；`state.score` 累加正确；`state.scoreLog.length === 1` |
| 13 | 到店关门（`hours` 不含当前时刻）| **不产生** `stay.score`，`state.score` 不变（扑空不计分）|
| 14 | `finish()` 时 `clockMin > 1024` | `result.score === state.score − 10`，`result.overtime === true` |
| 15 | `finish()` 正常回家 | `result.score === state.score`，`result.promos` 只含真停过（`state.stayed`）且在 `content.promos` 里的店 |
| 16 | 所有分值 | 全部来自 `params.score.*`，把 params 改成 0 后所有 pts 为 0（防写死）|

## 1b. 排行榜 + 分享测试

**`tests/api.test.js` 补 5 条**（需本地服务）
| # | 断言 |
|---|---|
| 1 | `POST /api/runs` 带 `result.score = 123` → 200；`score = 'abc'` 或 9999 → 400 `bad_score` |
| 2 | `GET /api/boards/score?seat=X` → `top` ≤ 20 条，每条只有 `playerName/score/title/stops/at`，**没有** `seat`、`troubles`、`text` 字段 |
| 3 | 插入 3 局分数 10/50/90 后，seat 为 50 的那局 `mine.rank === 2`，`percentile` 在总局数 < 10 时为 `null` |
| 4 | 插入 ≥ 10 局后 `percentile` 为 0～100 的整数，且 = 低于我的局数/总数×100 四舍五入 |
| 5 | 昵称含敏感词的局在 `top` 里显示为「游客」 |

**`tests/share.test.js`（新建，node + canvas 不可用时只测文案）**
| # | 断言 |
|---|---|
| 1 | `share.text(result)` 含积分数字、`player.yaosenai.cn`，长度 ≤ 80 字 |
| 2 | 文案和成绩卡数据里**不含**任何游客的困扰原文（`result.troubles[].text` 的每一句都不出现）|
| 3 | 总局数 < 10 时文案不含「超过」「%」|

**界面（deep-ui 补）**：结算页 `.share-btn` 可见；点击后手机视口出现全屏 `<img>` 和「长按保存」提示，桌面视口出现 `a[download]`；成绩卡 PNG 尺寸 1080×1350；5 种屏幕下弹层不出屏。

**人工**：把成绩卡发到微信给自己看一遍——二维码能扫、字能看清、没有别人写的困扰原文。

## 1c. 每局不同测试 `tests/variety.test.js`（新建）

| # | 断言 |
|---|---|
| 1 | 用 seed 1～50 各建一局，5 人标签集合**两两相同的比例 < 30%**（随机但不单调）|
| 2 | 同一 seed 建两局，标签、硬要求、今日规则完全一致（可复现）|
| 3 | `content/demands.js` 每个标签 ≥ 4 条；`rules_of_day.js` ≥ 10 条；每条文本 ≤ 24 字，都有 `id/text/apply` |
| 4 | 硬要求达成：food 游客在 13:00 前进 food 店 → `finish().demands` 里该条 `ok === true`，`score` 含 +15；未达成 → `ok === false`，−10 |
| 5 | 今日规则「雨天」：`walkMin` 结果 = 原值 ×1.3（取整）；规则「限时 21:00」：21:30 回家 → 额外 −20 |
| 6 | 连续两局（模拟 `localStorage.wz_last_rule`）不抽同一条规则；连续两局标签集合不同 |
| 7 | `result.seed` 存在且 `POST /api/runs` 后能从 `/api/boards/score` 的 `mine` 里读回 |

**冒烟**：开场页出现「今日规则」卡；每位游客卡上有「硬要求」一行；结算页有逐条 ✓/✗。

**数据诚实**：今日规则里凡引用店铺属性（老字号、营业年限）的，只在 `places.js` 该店有对应字段时生效，没字段的店不判、不猜。

## 2. P0 评分数据测试 `tests/ratings.test.js`（新建）

| # | 断言 |
|---|---|
| 1 | `node tools/realmap/build_ratings.js` 可重复运行，输出 `content/ratings.js` 能被 require，键数 ≥ 20 |
| 2 | 32 家精选里映射表 `GM` 的每个 id 都能在 ratings 里找到对应（或 places.js 自带评分）|
| 3 | **防错挂**：`五马街老锅贴`、`县前头消防池`、`森马潮鞋五马街旗舰店` 三个名字**不能**匹配到任何评分（这三个是上一版误挂的真实案例）|
| 4 | `ratingText()`：有 dp+am 无 xhs → 文本形如「大众点评 4.0（4843评）· 高德 4.1 · 小红书 未采」；三者皆无 → 「暂无平台评分（宁空勿编）」；xhs 为空串时显示「未采」而不是「无」或「0」|
| 5 | ratings.js 里不存在 `评价正文`、`昵称`、`头像` 字段（只采数量级与分数）|

## 3. P0 界面检查（扩展 `tests/deep-ui.py`）

在现有 `8walk` 之后加步骤：
- `a_stay` 截图时断言 `.stay-rating` 存在且非空；`.stay-line` 数量 === 队伍人数；每条含 `.plus` 或 `.minus`。
- HUD `#hud-score` 存在；进店后数值变化（前后 `innerText` 不等）。
- 结算页：`.result-score` 存在；`.promo` 每张都含「示例」二字；5 种屏幕下 `.promo` 无 H溢出。
- 排路线卡片 `.place-meta` 含「大众点评」或「暂无平台评分」。

## 4. P0 冒烟（`tests/smoke-run.js` 补 3 条）

- 进第一家店后 `WZ.main.run.state.score !== 0`。
- 停站卡关闭后 `#hud-score` 文本等于 `state.score`。
- 结算页积分 === `result.score`；`result.promos.length` ≤ `state.stayed.length`。

## 5. P1 验收（多商圈）

**单测 `tests/day.test.js`**
| # | 断言 |
|---|---|
| 1 | `travel(游客中心, 墨池)` 为步行且 10～16 分钟；`travel(游客中心, 雁荡山)` 为坐车且 120～150 分钟（允许 ±10%）|
| 2 | `computePlan([wuma, mochi])` 的 `total` = 各段路 + 各站停留 + 回程；`end` = 420 + total |
| 3 | 总时长 < 900 → `canDepart === false` 且理由含「还差」；> 1024 → 理由含「超出」；区间内 → `true` |
| 4 | 三个老城圈的店互不重复（同一 POI id 只属于一个圈）|
| 5 | 远郊圈里每家店 `sketch === true`；老城圈没有 `sketch` |
| 6 | 「去下一站」后 `state.clockMin` 增加了该段 `travel.min`；最后一站后调用的是 `goHome()` |

**冒烟**：排 3 圈 → 出发 → 每圈进 1 家 → 收队 → 结算；`state.day.idx` 依次 0,1,2；总用时 ≤ 1024 时无超时扣分。

**界面**：手机竖屏下排一天页的手册可滚到「出发」按钮；过场页 1.8 秒内自动进圈（截图前后对比）。

## 6. 数据诚实检查（人工 + 脚本，提交前必过）

```
grep -rn "示例" content/promos.js | wc -l        # == 券的条数（每条都带"示例"）
grep -rn "宁空勿编" web/book.js                   # 兜底文案在
node -e "...ratings.js 里 xhs 值只能是 '' | '几条' | '几十条' | '几百条' | '上千条'"
```
- 结算页截图人工看一遍：没有任何一张券看起来像真的（都有「演示用示例」小字）。
- 雁荡山卡片仍有「携程显示暂停营业」提示。
- `git diff --stat` 里没有 `server/.env`、`.feishu_creds.json`、`tools/crawl-lab/profiles`。

## 7. 上线前清单（按顺序）

1. 第 0 节 7 条门禁全绿。
2. 第 1、1b、1c、2 节新单测全绿（`score / share / variety / ratings`）。
3. `deep-ui.py` 5 种屏幕无告警。
4. 手机真机：开场看到今日规则和硬要求 → 排路线 → 走 → 进店看到逐个表态和积分跳动 → 结算看到积分、排名、示例券 → 晒成绩卡能长按保存。
5. `DOMAIN=player.yaosenai.cn bash deploy/deploy.sh`（只有 Xiang 的 Mac 能跑）。
6. 线上 `curl https://player.yaosenai.cn/api/health` 返回 `ok:true`；用手机玩一局，`POST /api/runs` 的 payload 带 `score`。

## 8. 回滚

所有 P0 改动走一个 git 分支 `feat/score-p0`；合并前 `main` 可随时部署。若 14:00 前 P0 没全绿，只合并 ①②（积分 + 逐个表态），③④ 留到下一版——它们各自独立，不互相依赖。
