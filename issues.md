## 2026-10-23 doubao-re 逆向过程产生（不修不做）
- RPA 扩展（豆包浏览器自动化助手）的 nativeMessaging 宿主清单为空目录，宿主注册是运行时行为——只有动态分析能补。
- 本机同时存在 ~/Library/Caches/com.openai.sky.CUAService（OpenAI 系 CUA 服务缓存）与豆包 cua-driver.sock——"CUA SDK 是否同源/互操作"值得一次单独观察（与豆包逆向无关，别展开）。
- ai-views 前端 JS（任务模式 UI）与 pb_server.desc 的 AGENT_TASK_* 消息字段未逐字段分析；如后续要做云端任务协议对照再开。
- GAC 服务端（AhaBUA/cua-driver）二进制按 checksum 运行时下载（sandbox_runtime/downloads/ 有 7+ blobs），如需完整服务端协议需解包验证归属——本轮只确认机制。
- crawl-lab 可借鉴：read_all 批量字段读取 + 观察字符预算（8000/4000 默认）设计，接入 CN Scraper MCP 的回传格式时可参考。

## 2026-10-23 doubao-re 第二轮更正与新增（不修不做）
- 更正：com.openai.sky.CUAService* 缓存与豆包无关，是 ChatGPT 桌面版（sky）的 CUA 容器——上一轮存疑已解决，不再观察。
- 新增：任务模式 DLC 会给沙箱装字节系 CLI（lark-cli、meegle-cli、design-cli、mediakit-cli、RPADevLocal）——若 crawl-lab 以后要"LLM 写代码调 CLI"的执行面，这是现成范式（代码生成 + 预装工具 + 输出预算）。
- 新增：GAC 会话授权按 origin 落盘（saved_scopes.json 含 url/title/时间戳）——做自有爬虫代理时同样该有"作用域授权"记录，方便审计。
- 反编译 GAC 服务端函数级实现需装 Hopper/Ghidra（rea doctor 报缺失）；属基础设施引入，无具体卡点项目，先记不做。

## 2026-10-24 冒烟稳定复现：到关门的店 → 路线死循环 + 时钟冻结（ZCode 部署会话诊断）
- 现象：tests/smoke-run.js 联网第二局 100% 复现挂 2 步（两次运行同签名）：路线 xianqian→mochi→teastall，08:43（clockMin=103.13）到席上茶事门口后时钟 60 秒不推进。第一局/断网局全绿。
- 根因链（全部静态+本地复现验证）：
  1. rules.js:108 一天从 07:00 起算；teastall 营业 09:00-21:00，08:43 到达 → onArrive 走「关门扑空」分支（rules.js:337-346）：只发 toast（main.js:156）+ fact_closed 事件，**不把 placeId 记入 state.visited**。
  2. engine.js:340 nearPlace 闩锁：玩家站在 48px 内 arrive 永不重发。
  3. F4（main.js:108 / engine isPlayerMoving）：时钟与规则 tick 只在移动时走 → 玩家站在关门店门口，全冻结。
  4. main.js:36-46 自动回轨：空闲玩家每秒被拽回「下一个未访问站」= 这家关门的店；tapPlace 还会清零 deviateAt（main.js:120）。真人要靠手动点别的可停地点才能跳出。
- 连带证据：第一局 26.1s 闲逛 teastall「没停站」同因（07:45 未开门）。塘河夜画（19:00 开）、瓯宴府/正亮海鲜（10:00 开）等晚开门店铺同样会踩。
- 影响分级：真人非硬锁（可点别处继续，toast 可见），但比赛现场路线碰到晚开门店必踩、体验差；自动化门禁 A 系列被它卡死。
- 最小修复（1 行，归代码会话）：rules.js 关门分支补 `if (state.visited.indexOf(placeId) < 0) state.visited.push(placeId);`（扑空也算到过，路线自动跳过）。备选：closed 时也推一条 stay=0 的停站卡说明扑空。改后重跑 smoke 应全绿。
- 部署决策：待用户定（agent 建议：先部署——第一局完整可玩满足上线完成事件；修复后重跑 deploy.sh 即可，rsync 增量几十秒）。
  → 2026-10-24 12:25 已决：用户下令「部署上线」，v1.0 按现状上线 https://player.yaosenai.cn（证书/443 已开）；本条死循环仍未修，1 行修复仍归代码会话，修完重跑 deploy.sh。

## 2026-10-24 crawl-lab P0 管线（ZCode 会话）：已交付 4 件、2 个外部依赖缺口
- 交付：`results/ctrip-batch.json`（T1 按名搜店管线，6 家 collected/2 家 partial 带字段级溯源）；`results/weather-today.json`（T3 中国天气网实时，Open-Meteo 国际源被墙为备选）；`results/poi-facts.json`（T4 先行版，8 家/5 家在游戏池，评分分平台分列）；T2 脚本 `amap_place_search.py` 就绪。
- 缺口1（T2 卡点）：高德 Web服务 API key 全仓未找到（realmap 走的是 JS API，key 没落盘）。需要用户提供一个有 PlaceSearch 权限的 key（环境变量 AMAP_KEY），豆包新店清单到位后 `python amap_place_search.py` 即出 `poi-coords.tsv`。
- 缺口2（T2/T4 数据源）：飞书自建应用（.feishu_creds.json）无 drive/wiki 读取 scope，「老城店铺池」列不出。豆包交付后：要么飞书表加授权 scope，要么豆包/用户导出 CSV 放 `results/feishu-shop-pool.json`，重跑 `merge_poi_facts.py` 即扩全。
- 修复记录：`address_matches` 路名 token 兜底升级为「后缀展开+交集」双侧匹配（修「大南街道马鞍池东路」粘前缀漏配），7 个新单测全过；携程地址行筛选放宽到含「数字+号」（覆盖 虞师里261号 这类里/坊结尾）；extract 内部门禁统一走 address_matches（修 (鼓楼街路口) vs (近鼓楼街路口) 误判）。
- 诚实留空：席上茶事（茶馆不在携程美食索引）、五味和/百味林（手信店同）、温州大酒家(蝉街)（携程只有五马街步行街店分店，分店身份不猜）→ 坐等豆包池地址复核。
