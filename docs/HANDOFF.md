# HANDOFF —— 换机器开工与验收指南

目标读者：在另一台机器上继续开发/验收的人或 AI。看完这一份就能开工，不需要聊天记录。

## 0. 这个项目是什么（30 秒版）

《温州玩家 · 1024分钟》：手机网页游戏。玩家写下自己旅行最怕的事，然后带 5 个陌生人逛像素温州，这 5 个人的"脾气"是别人写的困扰。一局 256 秒（游戏内 1024 分钟 = 一天），午夜前把人带回家。结尾若有人掉队，两个按钮：[回去找他 +64 分钟][继续回家]。第一局结束放一次升华屏，点明"游客就是你们"。
参赛：1024 超能 Coding 周末 · 温州站 · 游戏赛道（"让人想再玩一局"）。封板 10-25 15:00。

## 1. 文档地图（按阅读顺序）

| 文件 | 作用 | 谁必须读 |
|---|---|---|
| `docs/CONTRACT.md` | 模块接口、数据结构、API、文件所有权。**最高优先级，冲突以它为准** | 所有人 |
| `docs/PRD.md` | 产品规则、角色、名人、知识层、范围 P0/P1/P2 | 开发、验收 |
| `docs/EVAL.md` | 自动门禁 A1–A8、人工验收 E1–E10、惊艳度自评、时间节点 | 验收 |
| `docs/AGENT_PLAN.md` | 多 agent 分工、阶段、不做的事 | 开发 Lead |
| `docs/PROGRESS.md` | 各模块进度行（追加式） | 所有人 |
| `docs/ISSUES.md` | 契约不够用的地方，待 Lead 裁决 | Lead |
| `PROJECT_STATE.md` | 完成事件、非目标、用户决定 | Lead |
| `deploy/README.md` | ECS 部署步骤（W4 产出） | 部署 |

## 2. 带走并开工

```bash
# 原机器
cd C:\vscode\wenzhou-player && git add -A && git commit -m "wip: 契约+并行产出" 
# 推到你的远端或直接拷目录（含 .git）

# 新机器（Node ≥ 22，npm；Playwright 可选）
git clone <repo> wenzhou-player && cd wenzhou-player
node --version                      # ≥ 22
cd server && npm install && cd ..
```

**检查当前状态**（哪些模块已就位）：
```bash
ls web content server tests
cat docs/PROGRESS.md
cat docs/ISSUES.md 2>/dev/null
```
缺哪个模块就按 `AGENT_PLAN.md` 对应的 W 任务补；已有的不要重写。

### 2.1 新机器上启动 AI 的统一启动词

```
你接手《温州玩家 · 1024分钟》。项目目录 <path>。先读 docs/CONTRACT.md、docs/PRD.md、docs/PROGRESS.md、docs/ISSUES.md。
只按文件所有权矩阵修改你负责的文件；契约不够用写 docs/ISSUES.md，不要私改接口。
不加新功能、不换框架、不引 CDN、不做 3D/账号/实时多人/自由文本路线。数值只改 content/params.js。
完成一个里程碑就在 docs/PROGRESS.md 追加一行并跑 docs/EVAL.md 的 A1–A7。
汇报只报三件事：做了什么 / 卡在哪 / 下一步最小的一步。
```

## 3. 本地跑起来

```bash
# 纯前端（离线）：直接双击 web/index.html，或
cd web && python -m http.server 8080      # 浏览器开 http://localhost:8080/index.html
# 全栈：
cd server && cp .env.example .env && npm start   # 默认 http://127.0.0.1:8790/play/
```
手机联调：电脑和手机同一 Wi-Fi，手机访问 `http://<电脑IP>:8790/play/`。

## 4. 验收顺序（每次集成都跑）

```bash
node --check web/*.js content/*.js server/*.js        # A1
node tests/rules.test.js                              # A2
node tests/path.test.js                               # A3
(cd server && npm start &) && sleep 2 && node tests/api.test.js   # A4
# A5 离线：关掉服务，浏览器 file:// 打开 web/index.html 玩完整一局
# A6 冒烟（需要 Playwright 包；联网一局半 + file:// 一局，约 4 分钟，退出码 0 = 通过）：
node tests/smoke-run.js          # 环境变量 WZ_BASE 改基址，WZ_SERIAL=1 串行
grep -rnE "<script[^>]+src=\"?https?://" web/index.html && echo "有外链，不通过" || echo "A7 通过"
```
人工 E1–E10 见 `docs/EVAL.md` 第 B 节；每轮结果写到 `docs/EVAL_LOG.md`（日期、A 全绿与否、E 逐条、惊艳度五维分）。

### 4.1 必过的 5 条（不过不叫完成）
1. 手机 390×844 从"写困扰"到"再来一局"无卡死，再来一局不闪封面。
2. 断网（file://）完整一局。
3. 第一局结束升华屏只出现一次；刷新后不再出现；清本机存储后恢复。
4. 结尾黑屏→点人头→两按钮，`+64 分钟` 是灰色小字，8 秒不选默认继续回家。
5. 名人卡出现时底部有"AI 代拟，非原作"或"原作"标注；后端关掉时名人仍出现（模板）。

## 5. 部署（ECS，与 backroom 同机）

- 服务器：`root@39.96.72.14`，Ubuntu，Node 22，Nginx 1.28，vhost 放 `/etc/nginx/conf.d/`，服务用 systemd；已有 `yaosen.service`、`/var/www/backrooms` 等，**不要动它们**。
- 目标目录 `/srv/wenzhou`，端口 8790，域名占位 `play.yaosenai.cn`（需在阿里云解析加 A 记录并 certbot 签证书）。
- 步骤见 `deploy/README.md`；`deploy/deploy.sh --dry-run` 先看会做什么。
- `.env` 必填：`PORT=8790 DB_PATH=/srv/wenzhou/data/wz.db`；可选 `AI_BASE_URL AI_API_KEY AI_MODEL`（Qwen dashscope Anthropic 兼容端点；缺失则名人全走模板，功能不缺）。
- 回滚：`systemctl stop wenzhou`；nginx conf 删掉 `wenzhou.conf` 后 `nginx -t && systemctl reload nginx`。
- 上线后：`curl -s https://play.yaosenai.cn/api/health`，用手机扫码跑一局，看 `/api/boards` 有数据。

## 6. 现场三层回退（周日 14:00 前备好）

1. 线上版（二维码）→ 2. 本机离线版（笔记本 file:// + 本机困扰池）→ 3. 完整录屏（含结尾与升华屏，真机录）。
海报上的二维码指向线上版；路演电脑同时打开离线版备用。

## 7. 已做出的决定（不要重新讨论）

- 像素 2.5D 斜俯视，不做 3D。
- 游客名字 = 困扰：走不动 / 吃不惯 / 怕挤挤 / 买买买 / 没劲儿 / 催催催 / 憋不住 / 都行哥。
- 名人第一批 4 人：谢灵运（写诗）、王羲之（描字）、文天祥（叙事）、苏步青（1024）；模板优先，AI 增强。
- 回头代价 +64 分钟，不扣分；1024 只作为时间，不报任何现场人数。
- 心 3 颗、哄 2 次、停站 32、歇脚 64、一局 256 秒——调参只改 `content/params.js`。
- 引擎从零写，不用 Demo v3 源码；主办方允许带代码进场（用户决定）。
- 另一个同场项目 `oucheng-1024` 与本项目独立，最终提交哪个由用户定。

## 8. 周六现场清单

- 11:30 组队登记用"温州玩家"；14:45 起按 `docs/EVAL.md` 第 D 节节奏。
- 现场找 ≥10 名参赛者在手机上写困扰（真人种子池）。
- 18:00 一分钟同步：说"手机扫码可玩一局，游客脾气来自在座写的困扰"。
- 周日 15:00 封板前：A1–A8 全绿、E1–E4 过、录屏备好、海报二维码测过。
