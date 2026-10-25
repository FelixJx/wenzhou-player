# A6 冒烟报告 · 2026-10-23 13:47:31

视口 390×844 · DPR 2 · isMobile · hasTouch · chromium。总耗时 652 s。基址 http://127.0.0.1:8790；离线 file:////Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/web/index.html

## 步骤
| 结果 | 场景 | 步骤 | 耗时 | 备注 / 错误 | 怀疑文件 |
|---|---|---|---|---|---|
| PASS | online | 打开 /play/ 并出现开局页 | 0.2s | 温州玩家 \| 1024 MIN \| 出门旅行，你最怕什么？ \| 🚶 \| 走不动 \| 🍜 \| 吃不惯 \| 😣 \| 怕挤挤 \| 🛍️ \| 买买买 \| 🥱 \| 没劲儿 \| ⏱️ \| 催催催 \| 🚻 \| 憋不住 \| 😌 \| 随便，都行 |  |
| PASS | online | 开局：选标签+填困扰+昵称→带队出发 | 0.2s |  |  |
| PASS | online | 接团页出现 5 位游客 | 1.0s | 5 人 |  |
| PASS | online | 排路线 mochi→xianqian→wuma→pier 并出发 | 0.2s | 墨池公园→县前小吃街→五马街→江滨码头 |  |
| **FAIL** | online | 第一局游戏中（轮询驱动至结尾） | 292.4s | Error: drive 超时 290000ms<br>    at drive (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:145:40)<br>    at runNextTicks (node:internal/process/task_queues:65:5)<br>    at process.processImmediate (node:internal/timers:472:9)<br>    at async /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:320:12<br>    at async step (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:28:20)<br>    at async onlineFlow (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:319:5)<br>    at async /Volumes/AI_Data/Projects/o | engine.js/rules.js/main.js |
| PASS | online | 第一局结尾：黑屏→文字→点人头→点「继续回家」 | 0.0s | 无人丢失，跳过结尾页 |  |
| **FAIL** | online | 第一局升华屏出现并在 ≤16 s 内结束 | 8.0s | locator.waitFor: Timeout 8000ms exceeded.<br>Call log:<br>[2m  - waiting for locator('#overlay .page.epi') to be visible[22m<br><br>    at /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:331:48<br>    at step (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:28:26)<br>    at onlineFlow (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:330:11)<br>    at async /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:498:15 | main.js/ui.js |
| **FAIL** | online | 第一局结算页断言 | 5.0s | locator.waitFor: Timeout 5000ms exceeded.<br>Call log:<br>[2m  - waiting for locator('#overlay .page-result') to be visible[22m<br><br>    at waitResult (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:264:47)<br>    at /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:341:18<br>    at step (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:28:26)<br>    at onlineFlow (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:340:11)<br>    at async /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/test | ui.js/rules.js |
| **FAIL** | online | 再来一局 → 难度页，标准/困难已解锁 | 30.0s | locator.click: Timeout 30000ms exceeded.<br>Call log:<br>[2m  - waiting for getByRole('button', { name: /再来一局/ })[22m<br><br>    at /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:349:56<br>    at step (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:28:26)<br>    at onlineFlow (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:348:11)<br>    at async /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:498:15 | ui.js/main.js |
| **FAIL** | online | 第二局：接团→路线 3 站(无手信店)→出发→跑到 clockMin>300 → 回家 | 10.0s | locator.waitFor: Timeout 10000ms exceeded.<br>Call log:<br>[2m  - waiting for locator('.page-team') to be visible[22m<br><br>    at doTeam (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:113:36)<br>    at /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:361:27<br>    at step (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:28:26)<br>    at onlineFlow (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:360:11)<br>    at async /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js | engine.js/rules.js/main.js |
| **FAIL** | online | 第二局结尾：点「回去找他」→ 结算，且无升华屏 | 12.0s | locator.waitFor: Timeout 12000ms exceeded.<br>Call log:<br>[2m  - waiting for locator('#overlay .page-result') to be visible[22m<br><br>    at waitResult (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:264:47)<br>    at /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:371:24<br>    at async step (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:28:20)<br>    at async onlineFlow (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:369:5)<br>    at async /Volumes/AI_Data/Projects/oucheng-1024/wenzhou | ending.js/ui.js/main.js |
| PASS | offline | file:// 打开 web/index.html 出现开局页 | 0.1s | WZ.net.online=false |  |
| PASS | offline | 开局→接团 | 1.1s | 5 人（种子池） |  |
| **FAIL** | offline | 路线 3 站 mochi→xianqian→wuma 出发并跑到 clock≥600 回家 | 263.2s | Error: drive 超时 260000ms<br>    at drive (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:145:40)<br>    at async /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:414:17<br>    at async step (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:28:20)<br>    at async offlineFlow (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:412:5)<br>    at async /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:498:57 | engine.js/rules.js/main.js |
| **FAIL** | offline | 结尾→升华屏→结算：无「我写的那句去哪了」 | 28.0s | locator.waitFor: Timeout 20000ms exceeded.<br>Call log:<br>[2m  - waiting for locator('#overlay .page-result') to be visible[22m<br><br>    at waitResult (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:264:47)<br>    at /Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:420:23<br>    at async step (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:28:20)<br>    at async offlineFlow (/Volumes/AI_Data/Projects/oucheng-1024/wenzhou-player/tests/smoke-run.js:417:5)<br>    at async /Volumes/AI_Data/Projects/oucheng-1024/wenzho | main.js/ui.js |

## 额外检查
| 结果 | 场景 | 检查 | 详情 | 怀疑文件 |
|---|---|---|---|---|
| OK | static | index.html 无外链 script/link |  |  |
| OK | static | style.css 无外链 url()/@import |  |  |
| OK | online | 名人卡 #1 带「AI 代拟，非原作」或「原作」 | 知识点 · 谢灵运任永嘉太守时写下《登池上楼》，"池塘生春草"即出于此。 谢灵运 永嘉太守 · 山水诗鼻祖 冒烟员，你从墨池公园走到江滨码头，脚步太急。池塘生春草，园柳变鸣禽。永嘉的山水，要慢慢看才好。 「池塘生春草，园柳变鸣禽。」 原作 · 《登池上楼》 AI 代拟，非原作 陪 |  |
| OK | offline | 名人卡 #1 带「AI 代拟，非原作」或「原作」 | 知识点 · 谢灵运任永嘉太守时写下《登池上楼》，"池塘生春草"即出于此。 谢灵运 永嘉太守 · 山水诗鼻祖 瓯水向东去， 离线员引众行。 墨池公园一回首， 春草又生情。 「池塘生春草，园柳变鸣禽。」 原作 · 《登池上楼》 AI 代拟，非原作 陪他一会儿 +32 分钟 点头走过 |  |

## 页面错误 / console error / HTTP ≥400（已忽略 /assets/*.png）
### online
- pageerror 0 条
- console.error 0 条
- http/请求失败 0 条
### offline
- pageerror 0 条
- console.error 0 条
- http/请求失败 0 条

## 截图
- artifacts/offline_final.png

## 结论：步骤失败 8，额外检查不过 0，错误 0 → **不通过**