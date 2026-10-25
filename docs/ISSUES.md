
## W5 内容 → 契约字段建议（2026-10-23）
1. `celebrities[].originalQuote` 可能为 `null`（苏步青未找到可靠出处的原话，宁缺勿滥）；W2/W3 读取时需判空。
2. `celebrities[]` 新增字段：`enabled`（第二批为 false，rules 应跳过）、`trigger.places`（谢灵运限定 mochi/pier）、`trigger.alsoAt:'result'` 与 `resultTemplates`（苏步青结算页台词，占位 {min} {back} {total}）、`playHint`（王羲之小游戏提示）。契约 §2 未定义，是否采纳由 Lead 定。
3. `guests.any.lines.resolved[0]`「都说了随便。但你安排得挺好。」为 PRD 指定原文，14 字，超过「≤12 字」自限；UI 气泡请按 ≤14 字预留宽度。
4. `knowledge[]` 增加了 `placeId:null` 的 3 条（名人卡背/结算抽取用），stay 时不应抽到它们；抽取请按 placeId 过滤。
5. `params` 新增 `typeNames`/`typeIcons`（地点类型中文名与图标），供 W1 渲染地点图标、W3 路线页使用，契约未列。
6. `ending.epilogueFirstRun[1]` 写死「5 个人」，因首局固定 easy=5 可接受；若将来首局可选难度需改为 {n}。

## W4 后端 → 契约问题（2026-10-23）
1. **`result.lost` 无法映射回困扰条目**：契约 §2.5 `lost:[guestId]`，但服务端只知道发给该座位的困扰文本，不知道 guestId ↔ 困扰的对应关系，影响 `/api/mine` 的 `broughtHome` 统计。当前实现：`lost` 为空 → 本局全部困扰 brought_home=1；否则按 `guestLines[].text`（lost 的 id 对应项）或 `lost` 原值与困扰文本匹配，匹配不到的按带回处理（偏乐观）。建议 Lead 在 `result` 增加 `troubles:[{tag,text,lost:boolean}]`，或让 `guestLines[]` 带困扰原句字段 `line`；服务端已兼容"lost 里直接放困扰文本"的写法。
2. **榜单 `name` 字段来源**：契约 §6 boards 返回 `{seat,name,value,at}`，但 §2.5 `result` 没有玩家昵称字段。服务端取 `result.playerName`（兜底 `result.name`），否则 name 为空串。请 `net.js` 在 `POST /api/runs` 前把昵称写入 `result.playerName`。
3. **名人文本字数**：PRD §3.2 为"≤40 字或四行诗"，契约 §6 为"≤60 字"。服务端按契约 60 字截断（四行诗保留换行）；W3 名人卡请按 60 字 / 4 行预留。
4. **`who` 取值**：以 `content/celebrities.js` 的 `who` 为准（`xie_lingyun / wang_xizhi / wen_tianxiang / su_buqing`），服务端同时兼容按 `name`（如"谢灵运"）查找；未知 who 不报错，回退苏步青模板。
5. **deploy/ 目录多出两个 nginx 附属文件** `wenzhou-proxy.inc`、`wenzhou-limit.conf`（`limit_req_zone` 必须在 http 级声明，无法放进 vhost 文件），均属 W4 所有，不影响他人。
6. **`POST /api/troubles` 响应多返回 `text` 与 `replaced`**（契约只要求 `{ok,id}`），便于前端提示"已替换为默认句"；向后兼容，可忽略。

## W3 流程 UI（2026-10-23）
1. 契约 §5 的 `hud.update(state)` 没有暂停/回家回调。UI 侧已加 `WZ.ui.hud.onPause` / `WZ.ui.hud.onGoHome`（可选，main.js 赋值即可）；未赋值时 ⏸ 默认调 `WZ.engine.pause(true/false)` 并弹简单暂停页。请 Lead 决定 main.js 是否接管。
2. `showBoards(data)` 契约无关闭回调。UI 侧加了可选第二参 `onClose`；缺省时「返回」回到上一页（通常是结算页）。
3. `showCelebrity(card)`：契约 card 无 `isOriginal` 字段。UI 按 `card.isOriginal || card.original` 为真显示「原作」，否则显示「AI 代拟，非原作」（template 也按代拟标注）。请 W2/W5 在原句卡上带 `isOriginal:true`。
4. `showStay(place, knowledgeText)` 的出处小字：契约只传文本，UI 通过 `place.knowledgeId` 在 `WZ.content.knowledge` 里反查 `source`；若 rules 传的 knowledgeId 与 place.knowledgeId 不同，出处会对不上。建议 stay 命令里的 knowledgeId 一并传给 UI（或 main.js 传 `{...place, knowledgeId}`）。
5. 排路线页排除 `types` 含 `home` 的地点，其余（含厕所、小巷）都可选为路线点；若规则不希望厕所成为路线站点，请 W2 在 preview/planRoute 里处理或 Lead 在契约里明确。
6. 结尾页用 `result.guestLines` 的顺序决定站位，并按 `result.lost` 的 id 留空；若 guestLines 不含全部游客，则退化为末尾留空。请 W2 保证 guestLines 覆盖全员。
7. 脚本路径：index.html 用 `../content/*.js` 引内容，file:// 与 `/play/` 下均可；但若访问 `/play`（无尾斜杠）相对路径会错，nginx 需 301 到 `/play/`。

## W2 规则 → 契约补充与偏差（2026-10-23）
1. **params 键名**：契约只列了 minPerSec/stayMin/restMin/goBackMin，W5 用 `totalMin/walkTiredMin/foodDropEveryMin/crowdDropEveryMin/infectDelayMin`，rules.js 做了别名映射；以下阈值 W5 未给，rules 用内置默认（可在 params 里加同名键覆盖）：`walkWarnRatio 0.75, foodWarnMin 256, shopWarnMin 512, shopWarnEvery 128, boredGraceStops 1, rushSpeedBonus 0.2, sitToLostMin 64, runawayToLostMin 128, titleKindMin 3, titleRushMax 1, titleLostMin 2, knowledgeCount 3, lineMax 10, rainAtMin 0`。
2. **"经过"与"到达"**：引擎只有 `arrive` 事件，rules 以 `place.stayMin > 0` 区分停站（推进时钟、计停站数）与经过（厕所/小巷 stayMin=0 只记 visited）。因此"吃不惯经过小吃店 → 自己钻进去"实现为：心归零 → runaway 到最近 food 地点；到该地点 arrive 即归队并满足。
3. **坐下/跑开不是终态**：sit 超过 `sitToLostMin`、runaway 超过 `runawayToLostMin` 没人管 → 变 lost 并发掉队 interrupt；这样 ending 页的 lost 名单与"回去找他"同构。main.js 结束时把 sit/runaway 也计入 lost，与此一致。
4. **买买买到家丢人**不发 interrupt（由 ending 页的两按钮处理），只发 `{type:'lost'}` + `{type:'end'}`，`lostAt` 为最近手信店坐标。
5. **哄**按 Lead 指令字面实现：calmLeft>0 即消耗并 +1 心（心满也消耗）；第 2 次优先取 `content.guests[tag].lines.calm2`。
6. **run 额外方法/字段**（契约未列，向后兼容）：`run.setWeather(kind)`（触发 `weather:rain` 名人）、`run.params(key)`、`createRun({tags:[...]})` 测试用固定组队、`createRun({playerName})` 用于模板 {name}；`state` 额外有 `speedMul/stops/weather/zone/celebritiesSeen/pendingCeleb/started/ended/hasSight`。
7. **result 额外字段**：`troubles:[{tag,text,lost}]`（回应 W4 问题 1）、`guestLines[].tag/line`、`celebrityLine:{who,name,text}|null`（苏步青 `resultTemplates`，占位 {name}{min}{back}{total}）、`stops`。`playerName/seat` 仍由 main.js 填。
8. **名人 `who`**以 content 为准（`xie_lingyun/wang_xizhi/wen_tianxiang/su_buqing`）；`effect` 接受 `bored_satisfied/walk_satisfied/all_heart/none`（也接受 `satisfy:<tag>/hearts:+1`）；`enabled:false` 跳过；`trigger.requireNoHeartLoss`（弘一）已支持；`trigger.alsoAt:'result'` 只用于结算句，不发 celebrity 命令。文天祥 `stageMin:2`（content）与 PRD"黄昏后"略早，按 content。
9. **催催催心 0 不脱队**（PRD"跑到最前面拽全队"）：实现为 `state.speedMul = 1 + rushSpeedBonus` 并发 `{type:'hud'}`，main.js 已读 speedMul；没有"全队被拽丢"的后果。
10. **怕挤挤的满足条件**契约未定义：到过 lane 类型地点，或到家时从未掉过心。

## W1 引擎 → 契约补充与偏差（2026-10-23）
1. **params 键名**：引擎读 `params.engine.*`（也接受顶层同名）：`playerSpeed 120, runSpeed 170, followSpacing 26, arriveRadius 40, mapSeed 1024, viewWorldWidth 280（决定缩放档：视宽/280 取最近的 1/1.5/2/2.5/3）, zoom（指定则不自动）, camFollow 6, maxDpr 2.5, playerColor, sprites[]（要探测的 assets 图名，默认只探 wuma/mochi/center）`，W5 的 params.js 没有 `engine` 块时全用默认；`stageThresholds`/`typeIcons`/`tagColors` 直接用 W5 顶层键。
2. **arrive 语义**：玩家距地点入口 < arriveRadius 触发一次，离开 >1.6 倍半径后再进再触发；init/setPlayerPos 时已在范围内的地点不触发（否则开局就 arrive center）。goTo 到达也是走同一判定，没有单独的"路径走完"事件。
3. **enterZone/leaveZone 只按矩形几何触发，不看 crowdWindow**；是否在人潮时段由 rules 用时钟判断。引擎渲染人潮红区时才按 `place.crowdWindow` 过滤。
4. **tick 只在 running 且未 pause 时发**；pause(true) 期间不更新移动、不发 arrive/zone，但仍渲染（气泡按实时过期）。
5. **setGuests 与命令式接口并存**：setGuests 只在 guest.status 变化时切换引擎内模式；`runaway` 状态需要目标地点，仍需 main 调 `guestRunTo(id, placeId)`。引擎不改写 guests[] 对象（pos/lostAt 不回写），rules 若需要坐标用 `getGuestPos(id)`。
6. **契约外新增（向后兼容）**：`setPlayerPos(x,y)`、`getGuestPos(id)`、`getPlace(id)`（含 ex/ey 入口坐标与 cx/cy 格位）、`getStage()`、`isPaused()`、`off(ev,cb)`、`redraw()`、`getState()`（调试）；事件 `'tapPlace'(placeId)`——点地点图标会自动 goTo 并发此事件；`'tapGround'` 回调参数是 `{x,y}`。
7. **地图结构会截断主干道**：地点结构（如游客中心 5×3 格）允许覆盖路面，路被截断后由连通性兜底保证全图可达；content 若把地点放在同一列密集排布（目前 center/wuma/pier 都在 x=800），主干道只能部分避让。
8. **封路**：在入口周边 3~4 格（退而求其次 2~3 格）的一侧封一段可走格，必须保持全图连通，找不到安全封法就不封（返回 cells 空）；当前 14 个地点全部能封。
9. **精灵**：缺图只在控制台出现资源 404，不抛异常；人物精灵未做默认探测，需要时在 `params.engine.sprites` 列名。

## 冒烟与兼容性发现（2026-10-23 晚，Lead 修复）
1. **A6 无法在本机自带 headless_shell 跑**：Darwin 27 上 Playwright chromium_headless_shell 的 canvas 栅格化会同步卡死主线程（最小复现：320×240 canvas 连画 3750 次 fillRect 即挂；有头/系统 Chrome/完整 chromium-1228 均正常）。原始代码（git stash 验证）同样卡死，**与本次改动无关**。对策：smoke-run.js 的 launch 支持 `WZ_CHANNEL`/`WZ_EXEC` 环境变量，本机用 `WZ_CHANNEL=chrome`（系统 Chrome headless）跑通。
2. **游戏内 /api/celebrity 413（真 bug，冒烟抓到）**：main.js 的 ctx 按审查 M2 带整个 content 对象，知识库扩容后请求体超过服务端 32kb 限制。修复：net.js celebrity() 上传前剥离 ctx.content（服务端 ai.js 本来就读自己盘上的 content/celebrities.js，该字段只有客户端模板兜底用）；服务端限额 32kb→64kb 留余量。
3. tests/smoke-run.js 的 Playwright require 路径原为原机器 Windows 绝对路径（`C:/vscode/...`），改为 `WZ_PLAYWRIGHT || 'playwright'`；项目根 package.json 增 devDependencies.playwright（仅测试用）。

## Lead 裁决记录（2026-10-23 晚 · 温州关联度扩充 + 大脑接线）
1. **AI 协议扩充（契约 §6 变更，追认）**：`server/ai.js` 新增 `AI_PROTOCOL=openai` 分支（POST {base}/chat/completions，思考模型自动带 `enable_thinking:false`），默认仍为 anthropic。动机：qwen3.8-max 实测——Anthropic 兼容端点思考全开 10.4s 必超 3s 时限；OpenAI 兼容端点关思考 1.6s。同一分支同时覆盖周六现场局域网 DeepSeek（192.168.3.124:8000，OpenAI 协议）。测试已适配：api.test 的 env 置空方式改为 `AI_*= ''`（server/.env 只在 undefined 时填充），AI mock 测试固定 `AI_PROTOCOL=anthropic`。
2. **地图扩充（契约 §2.2「必含 id」为下限，新增不违反）**：新增 5 地点——jiangxin 江心屿（江中岛，engine 造岛+双塔结构，pier 栈道为登岛通道）、shuomen 朔门古港、nanxi 楠溪江·丽水街、yandang 雁荡山（后两者 hill 视觉）、tanghe 塘河夜画。map.js 新增 jiangxin/hill 两个 visual 分支与 4c 排除；render.js 新增 pagoda/hill 结构绘制（黄昏后塔灯）。
3. **店名规则修订（PRD §5 原文「品类名不用店名」废止）**：允许在知识条目中**中性列举**老字号店名（不评价、不排位、不写价格），条目来源标「大众点评、高德地图收录（2026）」。已上：县前小吃街 4 家、五马街瓯菜馆 1 家。
4. **名人触发点增补**：谢灵运 places 增 jiangxin（《登江中孤屿》）；文天祥 place:'pier' 改 places:['pier','jiangxin']（《北归宿中川寺》）。
5. **知识层修复（审查 L8/L9）**：rules 停站卡按 placeId 从 content.knowledge 轮换（不再固定一条）；结算 3 条知识只取真停站过的地点（state.stayed），路过不计。rules.test 对应断言更新（旧断言把只路过的厕所知识算进结算，即 L9 所述 bug）。
6. **种子困扰增补**：+12 条温州味（糯米饭过午就没了 / 五马街挤成照片 / 雁荡太远怕赶不回 / 老字号关门太早 等），每 tag ≤10 字不变。
7. **tests/smoke-run.js 移植适配**：Playwright require 路径原为原机器 Windows 绝对路径，改为 `process.env.WZ_PLAYWRIGHT || 'playwright'`；项目根 package.json 增加 devDependencies.playwright（仅测试用，不进 server）。

## 环境适配（2026-10-23 换机，非契约变更）
- 新机器上 wenzhou-player 被放在 `oucheng-1024/` 目录内，父目录 package.json 有 `"type":"module"`，导致 `node tests/*.test.js` 被当作 ES module（A2/A3 报 `require is not defined`）。已在项目根新增 `package.json`（`{"type":"commonjs"}`，仅此三键）隔离；不影响 server/（自带 package.json）与部署（rsync 只传 web/content/server/deploy）。tests 文件未改名、契约文件清单未动。

## Lead 裁决记录（2026-10-23 审查后）
- H1/M1/M2/M3：已在 web/main.js 修复（删 onPause 覆盖；暂停改计数；名人 ctx 带 content；再来一局重置天气/封路/玩家位置）。
- M4–M7 退回 W4；M8、L23 退回 W5。
- M9（§4.2 城市事件中断：雨/人潮/修路 与 问路 NPC）：**裁决为 P2，周六现场再做**；当前天气只由规则层 rainAtMin 触发（默认关）。朱自清因此暂不出场，content 保持 enabled:false。
- PRD §3.2 文天祥表述已修正为"镇江脱险后经海路至温州"。
