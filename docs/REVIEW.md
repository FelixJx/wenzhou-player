# REVIEW —— S2 审查员（只读审查）

日期：2026-10-23 ｜ 范围：docs/PRD.md、docs/CONTRACT.md、docs/ISSUES.md 对照 web/、content/、server/、deploy/ ｜ 审查方式：静态阅读 + `node --check` + `node tests/rules.test.js`（27 项全过）

---

## 0. 结论先行

- **Critical：0**
- **High：1**（HUD 暂停按钮失效，且"现在回家"入口不可达）
- **Medium：9**
- **Low：22**

**结论：修复后可部署**（修完 High 1 条 + Medium 中的 M1/M2/M3/M5 即可上线演示；其余可赛后）。

---

## 1. Critical

无。

---

## 2. High

### H1. HUD 暂停按钮永远"取消暂停"，暂停页与"现在回家"按钮不可达
- 文件：`web/main.js:32`、`web/ui.js:391`
- 现象：`ui.js:391` 调 `ui.hud.onPause()` **不传参**；`main.js:32` 写成 `ui().hud.onPause = v => setPaused(!!v)` → 永远 `setPaused(false)`。点 ⏸ 既不暂停、也不弹暂停页；而 `ui.js:403-407` 的"现在回家"按钮只在默认暂停页里出现，因此 `hud.onGoHome` 永远不会被触发。玩家只能靠走回游客中心提前回家（`rules.js:305-307`），现场演示时"按暂停"会直接失效。
- 建议：删掉 `main.js:32` 这一行，让 ui.js 走默认暂停页（默认页直接 `engine.pause(true/false)`，引擎暂停时不发 tick，main 的 `paused` 标志不需要同步）；或改为 `ui().hud.onPause = () => { setPaused(!paused); /* 自行弹页 */ }`。
- 责任人：Lead

---

## 3. Medium

### M1. 停站卡 3 秒计时会把名人卡/中断条期间的暂停"抢先解除"
- 文件：`web/main.js:116-125`、`web/main.js:134-160`
- 现象：`onArrive` 一次可同时发出 `stay` + `celebrity`（或 `stay` + `interrupt`）。`onStay` 设 `setPaused(true)` 并起 3 秒真实时间计时；`onCelebrity` 再设 `setPaused(true)` 弹全屏卡。3 秒后停站卡自动收起 → `setPaused(false)` + `nextLeg()` → **名人卡还在屏幕上，引擎已恢复走路、时钟继续跑**；之后名人卡选择又 `setPaused(false)`。暂停是单布尔，不是引用计数。
- 建议：改成暂停计数（`pauseDepth++/--`），或 `onCelebrity`/`onInterrupt` 前先 `dismissStay`，或 stay 结束时若 `run.state.pendingCeleb || run.state.pendingInterrupt` 则不解除暂停。
- 责任人：Lead

### M2. 离线 / file:// 时名人卡用的是 W2 内置 DEFAULTS 模板，不是 content/celebrities.js
- 文件：`web/main.js:151-158`、`web/celebrity.js:139-148`、`web/celebrity.js:10-44`
- 现象：`main.js` 调 `WZ.celebrity.request(c.who, ctx, cb)` 时 `ctx` **没有 `content` 字段**，`request()` 内 `find(who, ctx.content)` 退回 `DEFAULTS`。联网失败（net.js 2.5s 超时、file://）时 `settle` 回调 `cb(tpl)`，`tpl` 来自 DEFAULTS 的 2 条模板，而不是 W5 的 4 首诗/3 条台词。谢灵运"写诗"在离线演示里看不到诗。
- 建议：`main.js:151` 的 ctx 加 `content: C()`；或 `request()` 内 `find(who, ctx.content || root.WZ.content)`。
- 责任人：Lead（或 W2 兜底）

### M3. "再来一局"不重置玩家位置 / 天气 / 封路 / HUD
- 文件：`web/main.js:50-69`、`web/engine.js:100-119`
- 现象：`engine.init` 只在 `boot` 调一次；`startRun` 只 `setGuests/setClock`。上一局若午夜结束在码头，下一局 07:00 从码头开始；旧游客实体（id 同为 g1…g5）带着 lost/sit 坐标被 lerp 回队；`hudDom.rows` 复用，`row.el.title` 仍是上一局的名字和困扰句（`ui.js:443` 只在创建时写）。
- 建议：`startRun` 开头调 `engine.setPlayerPos(home.ex, home.ey)`（`engine.getPlace('center')`）、`engine.setWeather('none')`、`engine.setRoadwork(null)`、`ui.hud.reset()`。
- 责任人：Lead

### M4. /api/mine 的"带回家"统计会系统性偏低（assignments 过度分配）
- 文件：`server/index.js:148-150`、`server/db.js:146-164`、`web/main.js:53`
- 现象：前端抽样 `size + 3` 条（8/9/10 条）→ 服务端对**全部**真人条目 `recordAssignments`；但建团只用其中 5/6/7 条（`guests.js:141-152` 按标签挑）。`insertRun` 只绑定最近 `total` 条，其余 assignments 永远 `run_id NULL, brought_home 0`，`mineStats` 却按 `COUNT(*)` 计入 assigned。结果："你写的那句去了 8 个人的队伍，3 个带回家"——数字失真，而这是 PRD 创意项的核心展示。
- 建议：`insertRun` 取该座位**全部**未绑定 assignments；与 `result.troubles` 按 (tag,text) 匹配得上的绑定并写 brought_home，匹配不上的直接 `DELETE`（未入队，不算分配）。
- 责任人：W4

### M5. nginx access_log 默认 combined 格式记录完整 IP
- 文件：`deploy/nginx.conf:33`
- 现象：Node 侧日志确实不记 IP（`server/index.js:95-105` ✅），但 nginx `access_log /var/log/nginx/wenzhou.access.log;` 未指定 `log_format`，默认 `combined` 含 `$remote_addr` 全文。"server 日志不记 IP 全文"实际未达成。
- 建议：在 `wenzhou-limit.conf`（http 级）加 `log_format wz_noip '$time_local "$request" $status $body_bytes_sent $request_time';`，vhost 改 `access_log ... wz_noip;`；或直接 `access_log off;`。
- 责任人：W4

### M6. /api/celebrity、/api/runs 无限流；AI 代理可被刷
- 文件：`server/index.js:154`、`server/index.js:181`、`deploy/nginx.conf:37-41`
- 现象：限流只挂在 `POST /api/troubles`（Node 10/min + nginx 20r/m）。`/api/celebrity` 每次命中真实 AI 调用（付费、3 秒），`/api/runs` 可无限写榜单。现场二维码公开后，一个脚本就能刷爆榜单或 AI 额度。
- 建议：`makeRateLimiter({windowMs:60000,max:20})` 挂到 `/api/celebrity` 与 `/api/runs`；nginx 对 `/api/` 整体 `limit_req`。
- 责任人：W4

### M7. Node 监听 0.0.0.0 且限流按可伪造的 X-Real-IP 分桶
- 文件：`server/index.js:46-52`、`server/index.js:227`
- 现象：`clientIp()` 直接读 `x-real-ip`/`x-forwarded-for` 头（没有用 `req.ip` 配合 `trust proxy`），而服务 `listen(PORT,'0.0.0.0')`。若 ECS 安全组没封 8790，直连即可用随机 X-Real-IP 绕过限流。systemd 以 root 运行（`deploy/wenzhou.service` `User=root`）加大影响面。
- 建议：`listen(PORT, '127.0.0.1')`（nginx 同机）；`clientIp` 改用 `req.ip`；README 写明安全组只放 80/443；service 改 `User=www-data`。
- 责任人：W4

### M8. 内容史实：水心街得名方向写反
- 文件：`content/knowledge.js:116-118`（`k_shuixin`）
- 现象："永嘉学派集大成者叶适号'水心先生'，温州水心一带因他得名。" 实际是**叶适晚年居温州水心村，故号水心先生**——地名在先，人号在后。现文把因果倒置，属事实性错误。
- 建议：改为"叶适晚年定居温州水心村，世称'水心先生'，是永嘉学派集大成者。"
- 责任人：W5

### M9. 城市事件中断（雨 / 人潮 / 修路 → [绕小巷][硬穿]）完全未实现，且不在 §7 任何优先级里
- 文件：`web/rules.js:252-253`（仅 `rainAtMin>0` 才下雨，params 没给）、`web/rules.js` 全文无 `roadwork` 发出、`web/main.js:99-100` 仅有空接口
- 现象：PRD §4.2 六类中断里"城市事件"与"问路 NPC"都没有触发源；`engine.setWeather/setRoadwork/spawnNPC` 都是死接口；朱自清（`weather:rain` 触发）即使 enabled 也永远不出场。PRD §7 P0/P1/P2 清单都没列"城市事件"，范围与 §4.2 自相矛盾。
- 建议：Lead 在 PRD §7 明确降级为 P2 或赛后；若要做，`params.rainAtMin` 给值即可先出"雨"（rules 已有代码路径）。
- 责任人：Lead（范围裁决）/ W2

---

## 4. Low

### 4.1 产品对照（PRD §3.1 / §3.3 / §4）

| # | 位置 | 现象 | 建议 | 责任人 |
|---|---|---|---|---|
| L1 | `web/rules.js:262,344,345,361,380,446,450,451,292` | 征兆/后果文案写死在 rules.js（"走不动了……""哪儿有厕所……（原地转圈）""憋不住了！""再磨蹭我拽着你们走！""偏心！"等），不来自 content/guests.js，违背 PRD"文案来自 content" | 挪进 `content/guests.js` 各 tag 的 `lines`（如 `drop`/`drag`），rules 用 `txt()` 取 | W2+W5 |
| L2 | `web/rules.js:259-263` | 走不动"冒汗**变慢**"只做了气泡，没有减速 | engine 已有 `playerSpeed` 参数，可在 hearts≤1 时 `speedMul<1`（注意 main.js 当前把 speedMul 乘在时钟上，见 L4） | W2 |
| L3 | `web/rules.js:274-276` | 买买买"路过店就盯着看"实现为**按时间**（512 分钟后每 128 分钟）冒泡，与是否路过手信店无关 | 在 `onArrive`/`enterZone` 对 shop 类型触发 | W2 |
| L4 | `web/main.js:76` | `speedMul` 被乘在**时钟推进**上（催催催心低 → 一天变短 20%），不是"跑到最前面拽全队"的走路加速 | 要么改 engine playerSpeed，要么 PRD 改口径 | Lead/W2 |
| L5 | `content/guests.js:108`、`web/guests.js:121` | 都行哥 PRD 指定结算台词"都说了随便。但你安排得挺好。"是 `resolved` 数组 3 选 1 随机，只有 1/3 概率出现；且 14 字超自限 12 字（ISSUES W5 #3 已报） | scoring 对 any 固定取 `resolved[0]` | W2 |
| L6 | `web/scoring.js:16` | "赶路人"条件是"全带回且记住≤1"，PRD 为"**最快**但≤1"，没有比较时间 | 若要"最快"需后端榜单回传；或 PRD 改口径 | W2/Lead |
| L7 | `web/scoring.js:5` vs `content/ending.js:28-34` | 称号文案在 scoring.js 写死（TITLES），W5 的 `resultTitles` 没被读；键名也不一致（`fast` vs `rush`） | scoring 读 `content.ending.resultTitles` | W2 |
| L8 | `web/rules.js:317`、`web/scoring.js:31-40` | 每个地点固定只用 `place.knowledgeId` 一条；33 条知识里有 16 条（k_center_name/math/lucheng、k_wuma_shop/port、k_mochi_wang、k_xianqian_fish/cake/wonton、k_teastall_dialect、k_pier_xie/river、k_stage_ouju 等）**永远不会展示** | stay 时按 `placeId` 在 `content.knowledge` 里轮换/随机（ISSUES W5 #4 本意） | W2 |
| L9 | `web/rules.js:312` + `web/scoring.js:34-37` | 厕所/小巷（stayMin=0）只"经过"不出停站卡，但进了 `visited`，结算"3 件事"可能列出玩家从没看过的知识 | knowledge() 只取发过 `stay` 的地点 | W2 |
| L10 | `web/main.js:113` + `web/ui.js:487` | 停站卡出处显示两遍：main 把 `——source` 拼进 text，ui 又另起一行"出处：" | main 只传 `k.text` | Lead |
| L11 | `web/ui.js:578-633` | 结算页不渲染 `result.celebrityLine`（苏步青"你用了 973 分钟"）与 `result.celebrities`（"今天遇见的人"）；PRD §3.2 苏步青结算代言缺失 | showResult 增加两行 | W3 |
| L12 | `web/ui.js:552-553`、`web/celebrity.js:120` | 名人卡只显示代拟文本并标"AI 代拟"；content 里核实过的 `originalQuote`（"池塘生春草…"等）**从未显示**，PRD"核实原句标'原作'"实际没有落地 | 卡正面加一行 `card.quote.text`（标"原作 · 出处"） | W3 |
| L13 | `web/main.js:6-11` | PRD §6 本机存储"最高分、图鉴、累计知识"未实现，只有 has_played/seen_ending | 赛后 | Lead |
| L14 | `web/main.js:200-204` | "我写的那句去哪了"用 1.5 秒 toast 显示一整句，读不完；PRD 列为独立页 | 用 showBoards 风格的页或延长 toastMs | Lead/W3 |
| L15 | `web/ui.js:421` | HUD 总量 `1024` 写死，不读 `params.totalMin`（契约 §0） | `P('totalMin',1024)` | W3 |
| L16 | `web/ui.js:11-24` vs `content/params.js:41-58` | W3 自带一套 tag 图标/颜色/类型图标，与 params 和引擎（render 用 params.tagColors）不一致：HUD 上走不动是 🚶 蓝色，地图上是 🦶 橙红 | ui.js 读 `params.tagIcons/tagColors/typeIcons` | W3 |
| L17 | `web/celebrity.js:91-99`、`content/celebrities.js:25,50` | 一次 arrive 只出**第一个**匹配的名人；谢灵运排在王羲之前且同样在墨池触发，王羲之只有"先去码头遇谢灵运再去墨池"才可能出场 | check 改为按优先级/随机或允许排队 | W2 |
| L18 | `web/rules.js:32-35` | 怕挤挤×买买买打架按钮"[绕小巷][去逛店]"只改心数，不改路线/不绕路，按钮承诺与后果不符 | 文案改为"帮怕挤挤/帮买买买"或真改道 | W2 |
| L19 | PRD §4.2 第一行 | "要闹（心=1）：点他哄 / 就近停站 / 不管"是三选项，与"永远两个按钮"矛盾；代码里心=1 不触发任何中断（只有冲突对才触发） | PRD 改为"心=1 冒泡提示，不出中断" | Lead |
| L20 | `server/index.js:111` | `/api/health` 公开返回 `troubles` 总数；屏幕上没有，但 API 可读 | 去掉或仅内网 | W4 |
| L21 | `server/seed.json`（46 条） vs `content/seed_troubles.js`（56 条） | 两份种子困扰各自维护，已经不一致 | 服务端 `require('../content/seed_troubles.js')` | W4/W5 |
| L22 | `server/index.js:185-189`、`server/ai.js:130-141` | `ctx.route / ctx.place / ctx.tags` 是客户端任意字符串，直接拼进 AI prompt（提示注入面）；输出虽过敏感词且只回给同一客户端，但建议白名单 | route/place 只接受 content/places.js 的 name；tags 只接受 8 个标签；每项截 12 字 | W4 |

### 4.2 内容史实（content/knowledge.js 33 条、content/celebrities.js 7 人）

逐条核对结果：**33 条知识中 1 条事实性错误（M8 水心街）、4 条措辞建议；7 人 bio 共 21 条无事实性错误；传说均已标"相传"**。

| # | 位置 | 现象 | 建议 | 责任人 |
|---|---|---|---|---|
| L23 | `content/knowledge.js:37-39` `k_mochi_xie` 挂在 `mochi`（墨池公园） | 《登池上楼》的"池"是谢池/积谷山下的池上楼，不是王羲之墨池；玩家在墨池公园看到"池塘生春草即出于此"，会把两个地方混成一处（content 已另有 `xiechi` 谢池巷 + `k_xiechi`） | `k_mochi_xie.placeId` 改 `xiechi`，或文案改"在永嘉（今温州）任上写下" | W5 |
| L24 | `content/knowledge.js:111-113` `k_xiechi` | "他的山水诗**大多**写在温州任上"偏强；谢灵运山水诗相当一部分作于始宁隐居与临川期 | 改"不少名篇写于温州任上" | W5 |
| L25 | `content/knowledge.js:84-86` `k_lane2` | 玄觉《证道歌》出处《景德传灯录》卷五 ✅，但"松台山净光塔"一句不在该出处内 | source 补"《温州市志·文物》"或拆成两条 | W5 |
| L26 | `content/celebrities.js:169` 高则诚 | "温州瑞安人"引《南词叙录》；徐渭原文作"永嘉高明"（永嘉=温州府），"瑞安"需另引（如《瑞安县志》） | source 改为"《南词叙录》；《瑞安县志》" | W5 |
| L27 | `docs/PRD.md:57` | PRD 写"1276 年从**江心屿脱险**南下"——文天祥是在镇江脱险后由海路到温州、驻江心寺，不是在江心屿脱险。content（`k_pier_wen`、bio）写法正确，只有 PRD 错 | PRD 改"1276 年镇江脱险后由海路至温州，驻江心屿" | Lead |
| L28 | `content/knowledge.js:54-56` `k_xianqian_wonton` | "长人馄饨"既是小吃品类名，也是温州注册老字号/店名，与 PRD §5"品类名不用店名"及 §C"不评价具体店铺"擦边（文案是中性介绍，不是评价） | 可保留，或改"温州馄饨皮薄如纸" | W5 |

逐条通过（供 Lead 复核的要点）：
- 谢灵运：385—433 ✅；永初三年（422）出任永嘉太守 ✅；《登池上楼》作于永嘉（423 春）✅；《文选》卷二十二 ✅；《登江中孤屿》写江心屿、《文选》卷二十六 ✅。
- 王羲之：永和九年（353）兰亭 ✅；"任永嘉郡守正史无载，属地方传说" ✅（`k_mochi_wang` 写得很稳）；墨池、五马街得名均标"相传" ✅。
- 文天祥：1236—1283 ✅；宝祐四年（1256）状元 ✅；德祐二年（1276）元营被扣 → 镇江脱险 → 海路至温州 → 上表劝进 ✅；《过零丁洋》原句 ✅。
- 苏步青：1902 平阳 ✅；1931 东北帝国大学理学博士、同年回国任教浙大 ✅；1978—1983 复旦校长 ✅；`originalQuote:null` 宁缺勿滥 ✅。
- 朱自清：1898—1948 ✅；1923 浙江省立第十中学（温州）✅；《温州的踪迹·绿》写仙岩梅雨潭（1924）✅；原句"我第二次到仙岩的时候，我惊诧于梅雨潭的绿了。" ✅。
- 弘一：1880—1942 ✅；1918 杭州虎跑出家 ✅；1921 起驻锡温州庆福寺、前后十余年 ✅；《送别》原句 ✅。
- 高则诚：高明字则诚、元末、《琵琶记》、"不关风化体，纵好也徒然"（第一出）✅。
- 其他：东瓯/东海王（《史记·东越列传》）✅；675 年置温州 ✅；郭璞卜城"斗城"标相传 ✅；江心屿东塔唐（869）、西塔宋（969）✅；1876《烟台条约》温州开埠 ✅；瓯江浙江第二大河 ✅；乐清黄杨木雕/细纹刻纸 2006 首批 ✅；瓯绣/瓯塑/瓯剧 2008 第二批 ✅；永嘉学派"事功"与理学/心学鼎足 ✅；南戏/永嘉杂剧引《南词叙录》✅；乌牛早 ✅；温州话吴语瓯江片 ✅；糯米饭/鱼丸/灯盏糕描述 ✅。
- 全部 33 条均 ≤30 字、均带 source ✅；游客台词除 PRD 指定那句外均 ≤12 字 ✅；种子困扰 56 条均 ≤10 字 ✅。

### 4.3 安全与合规

| 项 | 结论 | 位置 |
|---|---|---|
| 具体店铺评价 | ✅ 无（只有品类名；"长人馄饨"见 L28） | content/* |
| 政府徽标 / 官方背书措辞 | ✅ 无（grep 官方/政府/文旅局/主办/授权/logo 全空） | web/ content/ deploy/ |
| AI 代拟标注 | ✅ 名人卡一律标"AI 代拟，非原作"（模板也标）；但原作原句从未显示（L12） | `web/ui.js:553` |
| 敏感词双重过滤 | ✅ 客户端 `web/ui.js:146-158`（子串匹配，10 字内）+ 服务端 `server/filter.js`（规范化 + 词表 + 手机号/链接/微信正则）；服务端还过滤玩家昵称（`index.js:163`）与 AI 输出（`ai.js:200`） | |
| 日志不记 IP | ⚠️ Node ✅（`index.js:95-105`），nginx ❌（M5） | |
| 限流 | ⚠️ 只在 /api/troubles（M6）；IP 分桶可伪造（M7） | |
| XSS / SQL | ✅ UI 全部 `textContent`；`main.js:216` innerHTML 只拼静态串；SQL 全预编译 | |
| 外链 / CDN | ✅ web/、content/、style.css 无任何 http(s)、@import、url()、字体外链 | |
| 密钥 | ✅ `.env.example` + `.gitignore`；AI key 只在服务端 | |

### 4.4 契约一致性（D）

**rules.js 实际发出的命令类型**：`bubble, sit, runaway, return, lost, clock, hud, weather, stay, interrupt, celebrity, end`（12 种；`roadwork` 从未发出）。
**main.js `handle()` 覆盖**：以上 12 种 + `roadwork` —— ✅ 全覆盖，无遗漏。

**engine 实际 emit 的事件**：`tick, arrive, enterZone, leaveZone, tapGuest, tapNPC, tapPlace, tapGround`。
**main.js 绑定**：`tick, arrive, tapGuest, enterZone, leaveZone` —— ✅ 需要的都绑了；`tapNPC/tapPlace/tapGround` 未绑属合理（无 NPC；点地点引擎自动 goTo）。注意 `tapPlace` 会让玩家脱离排好的路线（"主动改道"），`nextLeg()` 之后仍会拉回下一个未访问站 —— 行为可接受。

**main.js → engine 调用**：`init, setPlayer, setGuests, setClock, start, stop, pause, goTo, bubble, guestSit, guestRunTo, guestReturn, markLost, setWeather, setRoadwork` —— ✅ 全部存在、签名一致。

**main.js → ui 调用**：`showIntro, showDifficulty, showTeam, showRoutePlanner, hud.update, hud.onPause, hud.onGoHome, showStay, showInterrupt, showCelebrity, showEnding, showResult, showEpilogue, showBoards, toast` —— 签名全部一致，**唯一不一致是 `hud.onPause` 的调用约定**（ui 无参调用，main 当作带布尔参）→ H1。

**rules ↔ celebrity**：`choose('celeb_'+who)` 前缀约定 ✅；`request()` 需要 `ctx.content` 而 main 没传 → M2。

**result 字段**：`scoring.build` 已含 `troubles/celebrityLine/stops`；main 再补 `playerName/seat/troubles` ✅（`troubles` 被覆盖一次，值相同，无害）。

**天色档位**：`rules.stage`（`<` 阈值）与 `render.stageOf`（`>=` 阈值）对 `[256,512,768,972]` 结果一致（0..4）✅。

**座位号**：net.js 生成 8 位 `[0-9a-z]` ✅ 匹配服务端 `SEAT_RE` ✅。

---

## 5. 验收清单对照（PRD 关键条款）

| 条款 | 结果 | 依据 |
|---|---|---|
| §3.1 八种游客需求/征兆/后果 | ⚠️ 7/8 完整；催催催"拽全队"降级为时钟提速（L4），走不动"变慢"缺（L2），买买买"路过盯店"按时间（L3）；文案部分写死（L1） | `rules.js:256-368` |
| §3.1 每局必有都行哥、至少一对冲突、不重复 | ✅ | `guests.js:88-94,162-165` |
| §3.1 头顶名字+图标+3 心+一句话 | ✅ 名字/心/气泡；地点图标 ✅；游客身上无困扰图标（颜色区分） | `engine.js:407-411`、`render.js:445` |
| §3.3 停站一句话 ≤30 字带出处 3 秒淡出 | ✅（出处重复显示 L10） | `ui.js:471-493` |
| §3.3 名人卡背知识 | ✅ | `ui.js:545-546` |
| §3.3 结算 3 条 | ✅（可能含未展示过的，L9） | `scoring.js:31-40` |
| §3.3 全部内容带 source | ✅ 33/33 | `content/knowledge.js` |
| §4.1 走（点地面/WASD）+ 哄（2 次，第 2 次台词，第 3 次无效） | ✅ | `input.js:45`、`rules.js:375-394`、`content/guests.js` calm2 |
| §4.2 中断永远两按钮、8 秒默认 b | ✅（城市事件/问路未实现 M9；"要闹"口径 L19） | `rules.js:157-168`、`ui.js:497-533` |
| §4.3 四称号 | ✅（"赶路人"未比时间 L6） | `scoring.js:8-19` |
| §4.3 三榜；最快榜要求全员带回且未超时 | ✅ | `db.js:87-99` |
| §4.3 回头 +64、可能超时、不进最快榜、不扣分 | ✅ | `rules.js:465-468`、`scoring.js:55` |
| §4.4 1024 只作时间；进度条只报读数 | ✅ | `ui.js:429` |
| §4.4 天色五档只换调色板 | ✅ | `render.js:14-15,373-376` |
| §4.4 结尾句、不报现场人数 | ✅（health 接口暴露条数 L20） | `content/ending.js:24` |
| S6 升华屏仅首局一次、不可跳过 | ✅ | `main.js:184-197`、`ui.js:636-654` |
| 第一局锁初级 | ✅ | `main.js:42,47` |
| 离线兜底：2.5s 超时、静默切种子、pending 重试、隐藏"去哪了" | ✅ | `net.js:4,82-89,55-67`、`main.js:189` |
| file:// 直接可玩 | ✅（net.js offlineOnly；content 用 .js） | `net.js:6` |
| 无 CDN/外链 | ✅ | grep |
| 敏感词双重过滤 | ✅ | `ui.js:146`、`filter.js` |
| AI 3 秒超时切模板、标注代拟 | ✅ 服务端 3000ms、客户端 3300ms 兜底 | `ai.js:8`、`main.js:157` |

---

## 6. 建议修复顺序（上线前）

1. H1 暂停按钮（Lead，1 行）
2. M2 名人 ctx 补 content（Lead，1 行）
3. M3 再来一局重置（Lead，4 行）
4. M1 暂停计数（Lead，~10 行）
5. M5 nginx 日志格式 + M6/M7 限流与监听地址（W4）
6. M8 水心街文案（W5，1 行）+ L23 谢池/墨池归位（W5）
7. M4 assignments 清理（W4）

**最终结论：修复后可部署。**
