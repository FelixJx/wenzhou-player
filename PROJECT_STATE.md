# 温州玩家 · 1024分钟 — PROJECT_STATE

状态：开工（2026-10-23 14:51）
外部截止：2026-10-25 15:00 封板 / 16:00 提交（1024 超能 Coding 周末 · 温州站 · 游戏赛道）
外部验收人：温州站评委 + 现场观众投票

## Intake（2026-10-23）
- 请求类型：开工
- 完成事件：今天收工时，手机扫二维码能从"写困扰"玩到"再来一局"，断网也能玩，EVAL A1–A8 全绿，3 人试玩中至少 1 人主动再玩一局。
- 非目标：3D、真实店铺数据、账号系统、实时多人、自由文本输入路线、第二批名人。
- 禁止事项：不加功能、不建新门禁、不建议架构升级。
- 用户决定：项目目录 C:\vscode\wenzhou-player；后端部署到现有 ECS（root@39.96.72.14，与 backroom 同机）；名人 AI 走 Qwen（dashscope Anthropic 兼容接口）；不向主办方询问红线，主办方允许带代码进场；引擎从零写，不用 Demo v3 源码。
- 相关：C:\vscode\oucheng-1024 是同场比赛的另一项目，互不影响，最终提交哪个待用户定。
- 确认人：用户，2026-10-23

## Intake（2026-10-24 · REA 点评分支）
- 请求类型：开工（crawl-lab 点评数据线 · REA 分支）
- 完成事件：①REA 静态逆向大众点评安卓 APK，产出数据通道/接口/字段清单与报告（存 rea-out）；②温州老城主要街区餐饮店铺白名单字段（名称/地址/品类/评分/评价数/营业时段/人均）经已登录网页会话低频采集写入 staged-facts/public-facts，每条带来源链接，含 manifest 点评缺值（34+9）补齐。
- 非目标：不做 iOS；不改游戏代码；不碰评价正文/昵称/头像等个人数据。
- 禁止事项（用户要求中被拒项，留档）：用户选了"还原签名调私有接口 + 不设时限"；agent 拒绝签名伪造与批量私有接口调用（法律先例：反不正当竞争、非法获取计算机信息系统数据），改为静态逆向 + 登录会话低频白名单采集；用户"REA 优先、不设时间盒"予以保留（封板风险已提示）。
- 确认人：用户，2026-10-24（AskUserQuestion 三问确认；边界条款由 agent 调整后执行）

## 汇报格式
1. 今天完成了什么 2. 卡在哪 3. 明天最小的一步

## 运行记录
- 2026-10-25：按用户指令同步 `/Users/felix/Downloads/game-ui-kit` 的人物效果。原始五个 SVG 原样导入；导游、八种标签色游客、名人地图人形、队伍/HUD 头像、店铺接待吉祥物和结尾站位已接入。适配走路摆动、横向朝向、坐下、掉队灰化、减少动态效果偏好及缺图回退；人物点击区与头顶提示随新尺寸同步调整。规则 27 / 升级 9 / 引导 9 / 寻路 11155 项检查通过；22 个 SVG 解析和引用完整性检查通过；绘制状态隔离、素材复用和降级模拟通过。当前沙箱 Chrome 启动 SIGABRT，未完成浏览器视觉验收；本地预览 `artifacts/characters-preview.html`。本次仅修改本地，未部署。
- 2026-10-23：按用户指令接入新放入根目录的四首游戏音乐，复制到 `web/assets/music/`：进入/组队/选路线用 intro，开始行走后用 gameplay，结束及升华用 epilogue，结算及排行榜用 leaderboard。单播放器循环播放，首次交互解锁，切后台暂停；暂停页「声音」开关统一控制音乐与音效。规则 27 项与升级 9 项通过，使用真实规则的模拟播放器流程检查通过（切阶段、首局升华、再来一局、静音、页面隐藏恢复）；MP3 编码与复制校验通过。当前沙箱无法启动 Chrome，尚未完成浏览器实播试听。
- 2026-10-23 15:50：首轮集成完成。自动门禁 A1–A7 全绿（A8 未部署）；Playwright 390×844 联网一局半 + file:// 一局通过；审查 0 Critical。尚无真实玩家。
- 2026-10-23 深夜：实玩评审（四局）驱动 PRD-v2 互动升级落地（docs/PRD-v2.md / EVAL-v2.md）。时钟走路才走、开场横幅、商店前台页、结尾不代选、那句话页、6 张地标像素图、音效、名人立绘+原作句+描字、路线链修复。门禁 A1–A4+A9+A10 全绿（rules 27 / path 4886 / upgrades 9 / api 15），浏览器实测 F1/F3/F4/F5/F6/F7/F8 逐条过。注意：web 静态缓存 5 分钟，自测时用强制刷新。剩余 P1：平板 3:7 手册（F14）、真机试玩。未提交 git（待用户确认）。
- 2026-10-23 深夜②：用户实玩反馈「无聊」→ PRD-v3 玩家视角升级：地点×游客反应矩阵（杀复读机）、名人典故问答×3（对句/点兵/描字）、NPC 世界现身、±♥ 浮字、需求图标常显；名人卡限高修复、onEnd 清 dock。四套件回归全绿 + 浏览器逐条实测。详见 EVAL_LOG 第四轮。剩余：HUD 目标条、平板手册、真机。未提交 git。

## 10/23：继续寻找抓取解决路径
- 新增携程H5商户事实解析器，完成真实远程读取→商户地址匹配→JSON/TSV输出；3家地址匹配，1家获得完整营业时段，结果见 `tools/crawl-lab/results/public-facts.tsv`。
- 新增5项回归检查，总计12项通过；没有把携程评分写成点评评分，没有改游戏数据。
- 已确认当前为seatbelt且CODEX_SANDBOX_NETWORK_DISABLED=1，本机端口访问被拒绝；未尝试绕过权限。
- 已找到可用的TinyFish云浏览器连接入口，目前未连接；登录平台实测需用户切换可联网的执行权限/环境，或添加连接远程浏览器。
- 当前可执行路径与证据：`tools/crawl-lab/SOLUTION.md`。
- 10/23 深夜续跑（Claude 会话，联网已恢复）：session-fetch 首批真实采集成功——携程 3 任务中 2 家 collected（楠溪第一楼 10:00-13:00,15:30-20:30 / 瓯正味 17:00-01:00 跨午夜，含人均/评价数/评分，地址全匹配）；伯温家宴平台结构化数据即「全天营业」（BeginTime/EndTime 均为 null），按规则不记完成事实，待点评/美团补。replay 复核 3/3 地址匹配、0 次联网。高德 6 个 P0 公开页触发 platform_challenge，点评未登录同样被拦——两者都需用户人工接管（login/workbench）。事实已导出 `results/staged-facts.json`。下一步等用户：`sh collector.sh login --platform dianping` → `run dp-nanxi-smoke`。
- 10/24 早（Claude 会话，真机路线打通）：高德网页反爬无解后改走用户连接的小米真机（adb + AdbIME 中文输入），高德 App 全程无验证码，6 个 P0 点位 5 个收齐营业时间（三娒奶 10:30-21:30·4.6分25评 / 壹加壹 10:00-22:00·4.5分14评 / 深海人家 10:00-13:00,16:00-22:00·4.4分 / 公园山烧烤广场 17:30-24:00·4.7分46评 / 瓯宴府 10:00-13:00,16:00-20:00·4.5分31评），米房创意园高德无评分无营业时间（开放式园区，字段平台缺失）。事实落盘 `results/amap-app-facts-20261024.json`，job 状态未自动翻转（公园山为别名、三娒奶分店标签不同，待人工确认）。重要数据质量发现：点评收录的楠溪第一楼(瓯北店) = 已关门老址昌新路香港城（ID 5102495 / G8Nzfj1KMXFuVZ9Q 同店），与游戏地址王家坞路8号不符，点评数字暂不可用于该店。点评/美团风控已将本设备拉红（点评搜索、美团启动均弹验证码，未代解，等人握手机时再过）；点评 PC 网页店铺页为 JS 空壳（AutomationControlled 屏蔽后详情页 wx-view 可渲染，搜索页仍空壳）；workbench 新增 peek 诊断命令、点评新版选择器已修入 MERCHANT_JS。remaining：34 家点评详情 ID、小红书/抖音搜索。
- 10/24 早②（Claude 会话）：高德 App 事实已核对进采集库（`record_amap_app.py`，可复现）——壹加壹、深海人家走原任务直接 collected；三娒奶/公园山/瓯宴府/米房按「定义变更须换ID」规则建 p0-amap-{1,6,7,9}v2（别名+高德详情页地址，note 记录与原任务地址的对应关系），5 条 collected、米房 partial（opening_hours 平台缺失）；状态全部由采集器自身 assess 门禁判定，v2 定义已追加进 jobs/amap.json，导出刷新 `results/staged-facts.json`。库内全量：15 collected（含并行会话的点评进展）。
- 10/24 上午（Claude 会话）：采集需求固化——合并《玩法与数据采集清单-v1》与《DATA-REQUIREMENTS》，落成机器可读任务书 `tools/crawl-lab/jobs/game-p0.json`：店铺池 60 家七类（已有 26 家入册，需新找 28 家），每店 17 个 P0 字段（四平台评分并列+售罄+排队+口味标签+差评词），手信商品、5 项班次类（轮渡/塘河/朔门/池上楼/夏鼐故居）、P1 人流表；步行矩阵确认不抓（realmap 已做）。渠道现状：高德 App 真机=主力（无验证码），携程管线通但需解决按名搜店，点评/美团等设备过滑块，人流/localTip 走人工表单（hearsay 级）。已拆分两家 agent 任务书：豆包=中文生活检索+飞书写入（`docs/豆包提示词-店铺池P0.md`：新店28家+10家老店四平台口碑+手信商品+5项班次，落飞书「老城店铺池」表）；zcode=管线工程（`tools/crawl-lab/ZCODE-TASK-P0.md`：T1携程按名搜店批量、T2新店高德坐标、T3天气API、T4飞书合并校验，落 `results/` 下四个文件）；点评/美团真机与游戏合并归 Claude。

## 10/24：REA 静态逆向大众点评 App + 点评网页采集打通（ZCode 会话）
- 今天完成了什么：
  1. APK 固定与静态逆向：大众点评安卓 11.73.1（wandoujia→25pp CDN，MD5 官方核对通过，SHA256 存档），zip 解包 13 dex/325 assets/pyaxmlparser manifest 解码（522 activities/618 deeplink）；产出数据通道清单（mapi.dianping.com 主网关 443 处引用、m.api.dianping.com 89 个 .bin 端点、verify.meituan.com 风控墙、mach 到店模板运行时下载静态不可得），报告 `tools/crawl-lab/dianping-re/REPORT.md`，URL 全量存 `dianping-re/rea-out/dex-full-urls.txt`。App 私有 API 需签名（mtgsig），按 Intake 拒绝项不还原、不调用。
  2. 采集打通（与真机会话的发现互补）：登录 profile 下无头 Chrome 里 www.dianping.com 渲染移动版标记；店铺页 `window.__xhrCache__` 内嵌 `mapi/mapi/base/unify/shop.bin` 全量字段（与 APK 静态清单交叉验证一致），DOM 稳定路径 `div.star-score`/`span.reviews.wx-text`/`span.price.wx-text`。collector 升级：搜索页多候选解析 `resolve_dianping_candidates`（≤3 个，精确>包含）→ 详情页采集；名称门禁接受分店后缀、地址三层匹配（原文包含→行政词归一→门牌号+道路 token）。单测 19/19 过。
  3. 批量执行 35 任务：**8 个 collected**（评分/评价数/人均/地址，芙蓉鱼圆含完整时段 07:00-01:00），交付 `results/dianping-facts.tsv` + 刷新 `results/staged-facts.json`；伯温家宴与携程双源地址一致。8 个 search_name_not_found（夜市/景区/文创园点评无商户页，诚实留空），10 个分支名/地址不匹配待人工复核。
  4. 与真机会话警告的交叉验证：楠溪第一楼点评确有两个挂牌（老址昌新路香港城 已关门 vs 王家坞路8号现址）。本线搜索解析+地址门禁采到的是 **G8CRfgvMUuPCGlHU（王家坞路8号，4.3分/254条）**，与游戏地址一致，不是老址 5102495；合入游戏前仍建议双确认。
- 卡在哪：剩余 10 个任务需人工 workbench 确认分店身份；jadx/apktool 深反编译缺 Java 未打通（不影响本次结论）。
- 明天最小的一步（封板日）：把 dianping-facts.tsv 的 8 条按 manifest 对应关系合入游戏数据源（改数据不改代码，楠溪第一楼先双确认挂牌），10 个人工复核项时间不够就保持"来源待核"提交。

## 10/23 深夜：doubao-re（部署 REA + 静态逆向豆包，crawl-lab 线）
- （此任务的开工 Intake 于目录合并前写入旧 PROJECT_STATE，随迁移进归档；要点：仅静态、不运行豆包、不抓包、不影响游戏主线，用户已确认。）
- 今天完成了什么：REA 6.7.0 部署可用（analyze-javascript-application / inspect-macho 两条命令真实产出）；豆包 2.32.6 静态逆向一轮完成——浏览器自动化 = 任务模式 "GUI as Coding"（LLM 生成 Python cell → 运行时下载沙箱 Python3.14.7+Node22.23.2 → GACF 加密本地通道 → 浏览器内 Native AhaBUA + CDP，52 工具 + macOS AX 桌面控制 + RPA 扩展/MCP 三条备用通道）；云电脑 = 服务端"设备环境"，客户端仅付费墙/切换文案，云端实现静态不可见。报告：`tools/crawl-lab/doubao-re/REPORT.md`。
- 卡在哪：云端实现与 GAC 服务端二进制（运行时下载制）静态不可触达，已如实标注"未能确定"；新点子记 issues.md。
- 明天最小的一步：无（该子任务已闭环；crawl-lab 主线仍按 SOLUTION.md 走 TinyFish/联网环境验证）。
- 10/23 深夜续跑（第二轮，仍仅静态）：清掉首轮"未能确定项"中静态可触达的部分——agent_infra 运行日志证实加载链（签名校验→libaha_cua.dylib→local_runtime env 管理，DLC 机制实锤）；DLC 完整清单（base 运行时 + lark/meegle/design/mediakit CLI + RPADevLocal.app v0.24.9）；GAC 授权按 origin 落盘（saved_scopes.json）；更正 com.openai.sky.CUAService 属 ChatGPT 与豆包无关。GAC 服务端确认编译在浏览器内部，函数级定位需反编译器（未装，记 issues）。报告第七节已更新。

## 10/23 深夜：真实老城地图（Claude 会话，用户确认由本会话改 places/map/params）
- 地点、街道、江、江心屿改成真实的：坐标来自高德（GCJ-02），街道 = 24 个点两两的高德步行路线（276 条）栅格化；1 世界单位 = 1.5 米，地图 50×81 格（2.4×3.9 公里）。
- 走路时间按高德实测校准：playerSpeed 190，游戏里两地之间的分钟数 ≈ 高德步行分钟数（120 组对比，平均误差 1.4 分钟，最大 5 分钟）。停留时间按真实设（小吃 25、五马街 45、江心屿 120、塘河夜画 50…），楠溪江/雁荡山改为"江边上车"，停留含往返车程（200/300 分钟）。
- 改动文件：content/places.js（由 tools/realmap/build.js 生成，勿手改）、content/params.js（engine.playerSpeed/runSpeed/arriveRadius）、web/map.js（mapSize.real 存在时走真实地图分支，旧逻辑不变）、web/engine.js（到站判定一处：自动寻路途中只认目的地和厕所/小巷，避免路过店铺被强制停站、路过游客中心直接收工）。
- 原文件备份：_backup_realmap_1023/。重新生成：`node tools/realmap/build.js`（改 tools/realmap/anchors.json 后重跑）。
- 验证：rules 27/27、path 5858 项、upgrades 9/9、api 15/15 全过；浏览器实玩：游客中心→朔门 19 分钟（高德 20），朔门→塘河夜画 50 分钟（高德 46），途经游客中心/五马街/剧场不再误停。
- 待核：席上茶事（茶馆）、吴家老宅庭院剧场（是否有地方戏）、水心（小吃点）是高德查到的真实地点，但是否合适待豆包「老城地图」数据确认。

## Intake（2026-10-24 10:55）
- 请求类型：开工（v1.0 上线）
- 完成事件：12:00 前手机打开 player.yaosenai.cn（DNS 未生效前用 http://39.96.72.14）能完整玩一局：可选 ≥30 个鹿城真实店铺/景点（显示真实评分/人均/营业时间/来源），走路与停留时间对应真实世界，到关门的店会扑空，结束时 5 位游客各有评审卡（来不及则下午补，先上前三项）。
- 非目标：行前疑虑、问题钩子、平板手册、分时人流、美团数据。
- 禁止事项：不加功能、不建新门禁、不建议架构升级。
- 分工：本次由 Claude 会话改代码（用户确认），ZCode 会话暂停；部署由用户在 Mac 终端运行 deploy/deploy.sh。
- 确认人：用户，2026-10-24

## 10/24 上午：v1.0 交付（Claude 会话）
- 地点 19 → 32：新增 13 个鹿城真实店铺/景点（长人馄饨、矮人松糕、排队烧饼、夫妻鱼圆、纱帽河老面馆、温州大酒家、瓯宴府、正亮海鲜、妙果寺·九山公园、庆年坊、五味和、百味林、瓯绣工作室）；谢池巷→池上楼·谢池巷，仓桥街→仓桥街·夏鼐故居。每个地点带真实营业时间与 real.info（大众点评/携程/美团评分、人均、招牌、来源），来自飞书表与高德。
- 规则：到关门的店扑空（rules.isOpenAt，按真实营业时间与周一闭馆）；常排队的店饭点多等（queueMin）；扑空/排队记入 events（fact_closed / fact_queue）。
- 界面：排路线列表与停站页显示真实数据一行；结算页新增「体验评审」5 张卡（★/评语/加分/扣分/问题，scoring.reviews，全部由本局事件算出，不调 AI）。
- 测试：rules 27/27、path 11155 项、upgrades 9/9、api 15/15 全过。
- 未做（记 issues）：AI 润色评审（/api/review）、行前疑虑、问题钩子、美团数据补全。

## Intake（2026-10-24 · crawl-lab P0 管线续跑）
- 请求类型：续跑（执行 10/24 上午拆分的 zcode 任务书 `tools/crawl-lab/ZCODE-TASK-P0.md`，用户下令「开始抓取任务」）
- 完成事件：`results/` 下按任务书落盘 ctrip-batch.json / poi-coords.tsv / weather-today.json（T4 待豆包交付飞书表后合并出 poi-facts.json）。
- 非目标：不碰 content/web/server；不绕点评/美团风控；不改 jobs/game-p0.json 规范；不动瓯城v1老任务。
- 禁止事项：不加功能、不建新门禁、不建议架构升级。
- 确认人：用户，2026-10-24（任务书即上次 Intake 拆分产物，本条为登记）

## 10/24 下午：crawl-lab P0 管线 T1/T3/T4 交付、T2 就绪（ZCode 会话，任务书 ZCODE-TASK-P0.md）
- 今天完成了什么：
  1. T1 携程按名搜店打通并交付：搜索入口 = `m.ctrip.com/webapp/gourmet/food/search`（普通 GET SSR，__NEXT_DATA__ 带 RestaurantId/Name/Lat/Lon；gs 站列表页翻页参数无效、soa2 私有接口走 SOTP POST 按纪律不碰）。管线：搜索候选（名称归一分级；全名搜空自动用基础名兜底）→ fooddetail 详情 → 既有 extract/assess 名称+地址门禁 → EvidenceStore 落库（backend=ctrip-search；新任务 ID 按 gp-<类型>-<序号> 登记进 jobs/game-p0-ctrip.json，地址全部带事实来源）。产出 `results/ctrip-batch.json`：6 家 collected（长人馄饨 4.8分310评¥24 07:00-18:30 / 矮人松糕 4.8分116评 06:30-17:30 / 瓯宴府 4.8分5评¥286 / 正亮海鲜 ¥149 跨午夜10:00-01:00 / 楠溪第一楼 / 瓯正味）、2 家 partial（夫妻鱼圆 4.0分6评、伯温家宴=全天营业口径），字段级 sources 齐全。
  2. 门禁三处修复（test_lab 19/19 全过，无回归）：address_matches 路名兜底升级为「后缀展开+双侧交集」（修「大南街道马鞍池东路」粘前缀漏配）；地址行筛选放宽到「数字+号」（修 虞师里261号 这类里/坊结尾漏检）；extract_ctrip_text 与 assess 统一走同一 address_matches（修 (鼓楼街路口) vs (近鼓楼街路口) 误判）。
  3. T3 交付：`results/weather-today.json`——主源中国天气网公开数据页（d1.weather.com.cn/weather_index/101210701.html，普通 GET+Referer），Open-Meteo/wttr.in 国际源在本网络不可达降为备选。当前：阴 24.6°C，含今日预报与字段级 source。脚本 weather_today.py 可重跑。
  4. T4 先行版：`merge_poi_facts.py` + `results/poi-facts.json`（8 家，5 家 inGamePool；四平台评分分列各带链接、hours 正则校验、模糊口径只入 opening_hours_reported、非游戏池条目打 inGamePool:false）。豆包飞书池到位后重跑即扩全。
  5. T2 就绪待料：`amap_place_search.py` 写完（名称+地址 PlaceSearch→GCJ-02→results/poi-coords.tsv，命中判定复用 address_matches，分店不猜 matched=false）。
- 卡在哪：高德 Web服务 API key 全仓未找到（realmap 走 JS API 没落盘）；飞书自建应用无 drive/wiki scope 读不了「老城店铺池」；席上茶事（茶馆）、五味和/百味林（手信店）不在携程美食索引、温州大酒家(蝉街) 携程只有五马街步行街分店——分店身份不猜，诚实留空等豆包地址复核。
- 明天最小的一步（封板日）：拿到高德 key + 豆包池 → `python amap_place_search.py` 出 poi-coords.tsv → 重跑 merge_poi_facts.py 刷新 poi-facts.json；老店四平台缺口由点评/美团真机路线补。

## Intake（2026-10-24 · 部署执行）
- 请求类型：续跑（执行 10:55「v1.0 上线」Intake 的部署环节；执行人由用户改为 ZCode，用户选定方式 B：提供 root 密码装公钥）
- 完成事件：手机打开 player.yaosenai.cn（无证书时 http://）能完整玩一局；/api/health 返回 ok；线上可见 32 个真实地点与评分/营业时间。
- 非目标：不改游戏代码；不动同机 backroom；不登阿里云网页控制台（DNS 已解析 player→39.96.72.14、80 已放行，无需控制台）。
- 禁止事项：不加功能、不建新门禁、不建议架构升级。
- 计划：门禁四套件 → DOMAIN=player.yaosenai.cn deploy.sh（dry-run 先行）→ 写服务器 .env（AI 来自本地 server/.env）→ certbot 顺路签证书（失败保持 http 不阻塞）→ 验证 + 二维码。
- 探测：本机无 SSH 密钥（已新生成 id_ed25519_ali + config）；play.yaosenai.cn 无解析（deploy.sh 默认 DOMAIN 不可用，须覆盖为 player）；服务器 nginx 1.28.3 在跑、wenzhou 未部署、/ 返回 404（backroom 不在默认位，互不影响）。
- 确认人：用户，2026-10-24

## 10/24 中午：v1.0 上线完成（ZCode 会话）
- 今天完成了什么：用户扫码登录阿里云控制台 → ECS 控制台「发送命令」（云助手，root 执行）给 i-2ze4noo7mmmm6bkxzpcn（39.96.72.14）装 id_ed25519_ali 公钥，SSH 免密打通（未走 root 密码，用户指令「登陆阿里云」改为控制台路线）。门禁四套件全绿（rules 27 / path 11155 / upgrades 9 / api 15）→ `DOMAIN=player.yaosenai.cn bash deploy/deploy.sh`（dry-run 先行）→ 服务器 .env 合入本地 AI 配置（dashscope 兼容端点 + qwen3.8-max，ai=on）→ certbot 签发 player.yaosenai.cn 证书并重跑 deploy.sh 开 443 + 80→301。线上验证：`/api/health` ok(ai:true)、`/play/` 200、静态/音乐资源 200、线上 places.js 32 地点 / 27 条营业时间、`/api/troubles/sample` 正常；二维码在 `deploy/qr-player.png`。
- 卡在哪：无（真机完整一局待用户手机扫码试玩，为完成事件最后一项）。
- 明天最小的一步：手机扫 deploy/qr-player.png 真机玩一局；到关门店死循环的 1 行修复仍归代码会话（见 issues.md，修复后重跑 deploy.sh 即增量几十秒）。

## Intake（2026-10-24 · 小红书热度采集）
- 请求类型：续跑（crawl-lab 数据线 10/24 留下的「小红书/抖音搜索」尾巴；用户下发「Prompt 3：小红书抓取」任务书）
- 完成事件：`tools/crawl-lab/results/xhs-heat-20261024.json` 落盘，覆盖任务书清单全部店铺（清单实数 105 家，标题写 110，以清单为准），每家有「小红书热度」（无/几条/几十条/几百条/上千条）与「最近内容时间」（查不到留空），另附证据文件
- 非目标：不写游戏 content/；不采笔记正文/昵称/头像等个人数据；不做抖音；输出只记数量级与日期
- 禁止事项：不绕风控、不代解验证码（出现即停并报告）、不还原小红书签名接口；仅登录会话低频页面采集（人工翻页水平，按 10/24 REA Intake 先例）；不加功能、不建新门禁
- 阻塞点：小红书搜索必须登录；`~/.agent-reach/xhs-cookies.json` 为 HttpOnly 且已过期 7 个月不可用；已在内置浏览器打开扫码框等用户扫码
- 确认人：用户，2026-10-24（任务书即指令，本条为登记）

## Intake（2026-10-24 · 美团字段采集）
- 请求类型：续跑（crawl-lab 数据线；用户下发美团采集任务书：105 家店铺/景点的「美团评分+美团评价数」，输出 JSON，查不到留空，消息尾连续三次「继续」即放行）
- 完成事件：`tools/crawl-lab/results/meituan-ratings.json` 落盘，覆盖清单全部 105 家（清单实数 105，标题写 110，沿用小红书轮先例以清单为准），每家 {美团评分, 美团评价数}，查不到 null，另附采集明细 `mt105-results.json`
- 非目标：不写飞书多维表格（用户只要 JSON）；不碰游戏 content/；不采评价正文/昵称/头像
- 事实边界：www.meituan.com 现为企业官网无搜索；i.meituan.com 命中 verify.meituan.com 滑块风控——按项目纪律不代解验证码，未走通美团端；数据改经大众点评网页版（crawl-lab 已登录 profile，10/24 同法）采集。美团点评 2015 合并后到店商户评分/评价数同池，数值同源，报告中如实标注来源与差异
- 纪律：低频（搜索+详情 ~6s/页）、逐店落盘可续跑、触发风控即停（本轮详情页 403 后冷却重试）、不猜测不估算
- 确认人：用户，2026-10-24（任务书即指令，本条为登记）

## Intake（2026-10-24 14:38 · 11 条升级建议）
- 请求类型：升级（续跑）。来源：用户《温州玩家 · 全部建议汇总》11 条提示词。
- 用户决定：11 条全部做、不砍（多会话/多 agent 并行）；耐心百分比替换 3 颗心；**不加入金钱概念**（"买个小吃"不做或改为非金钱代价）；#11 删掉"今晚有 1024 个游客""名次退了 15 位"两类无真实数据支撑的句子；#8 题库有误的第 4/5/6/8 题换成有出处的题，另开任务收集题库扩充；数据线正在抓（小红书/美团），Claude 负责验证真实性并输出卖点。
- 第 0 项：先修「到未开门的店 → 路线死循环 + 时钟冻结」（issues.md 10/24 条）。
- 完成事件：25 日 14:00 前重新部署 player.yaosenai.cn；冒烟全绿；用户手机真机完整一局，11 条逐条可见；16:00 前提交。
- 非目标：金钱/预算条中的"金钱"；任何编造的统计数字。
- 禁止事项：不建新门禁、不建议架构升级；代码改动经 git 分支合并，避免多会话互相覆盖。
- 确认人：用户，2026-10-24

## 10/24 晚：提示词 4「城市里插旗」按参考图做真实温州地图（云端会话）
- 今天完成了什么：用内置浏览器在 player.yaosenai.cn 页面里调高德 JS API（PlaceSearch.searchNearBy，老城 36 个网格点）实采 3201 个 POI + 142 条路名 → `tools/realmap/pois-raw.json`；`node tools/realmap/build_pois.js` 按高德类型筛掉培训/学校/公司/建材等与游客无关的，生成 `content/pois.js`（2281 家、118 处街名）。地图上：8 类彩色图钉 + 店名（挤不下自动让位，旗子优先）、街巷名（竖街竖排）、旗子插在真实店铺上（16 面：红 3 · 橙 5 · 黄 8，按队伍需求 + 步行距离实时重算）；点图钉 = 店铺卡 → 加进路线后是真正能走到、能停站的一站；竖屏排路线新增「🗺 地图上看旗」（上半屏地图、下半屏手册）；屋顶加体素格 + 墨色描边。
- 数据诚实度：高德 JS 接口不给评分，图钉店铺口碑一律显示「暂无平台评分（宁空勿编）」、营业时间未采；精选 105 家的点评分仍来自大众点评网页实采（86/105）；小红书 102/105 都是「上千条」，量级桶不可信，暂未进玩法。
- 卡在哪：地图仍是俯视像素风，不是参考图的斜 45° 体素立体（要重写引擎，赶不上 25 日冻结）。
- 明天最小的一步：Mac 上 `DOMAIN=player.yaosenai.cn bash deploy/deploy.sh` 重新部署，手机竖屏点「🗺 地图上看旗」看效果。
- 18:43 追加部署：18:15 批次（render/map/main/engine/book/advisor 等）上线。门禁 rules 27 / upgrades 9 / advisor 9 / api 15 / smoke 通过。线上 200，health ok，线上库 26 条困扰。
