# 多 Agent 并行执行方案 v1.0

生命周期：契约 → 并行工蚁 → 集成 → 兵蚁审查 → 修复 → 部署。**一个文件只有一个写者。**

## Phase 0 契约（Lead，30 分钟，串行）

Lead 先写 `docs/CONTRACT.md`，其余 agent 只认契约不认猜测：

1. **状态结构** `state`：`clock(0–1024)`, `player{x,y,name}`, `guests[{id,tag,name,line,hearts,status,calmLeft,remembered}]`, `route[]`, `events[]`, `civic`, `flags{hasPlayed,seenEnding}`
2. **引擎 → 规则 事件**：`onArrive(placeId)`, `onTick(dtGameMin)`, `onTapGuest(id)`, `onEnterZone(zoneId)`, `onLeaveZone`
3. **规则 → 引擎/UI 命令**：`guestSit(id)`, `guestRun(id,placeId)`, `bubble(id,text)`, `interrupt({title,a,b,onA,onB})`, `celebrity(cardSpec)`, `endRun(reason)`
4. **地点表** `content/places.json`：`id,name,type[],x,y,stayMin,knowledgeId`
5. **API**：`POST /troubles {seat,tag,text}` → `{id}`；`GET /troubles/sample?n&exclude` → `[{tag,text}]`；`POST /runs {seat,result}`；`GET /boards`；`POST /celebrity {who,ctx}` → `{text,source:"ai"|"template"}`
6. **文件所有权矩阵**（见下）

## Phase 1 并行工蚁（3 小时）

| Agent | 角色 | 拥有的文件（只能写这些） | 交付与自测 |
|---|---|---|---|
| **W1 引擎** | 前端 | `web/engine.js`, `web/map.js`, `web/render.js`, `web/input.js` | 相机跟随、贪吃蛇跟随、点地面寻路、停站触发、五档调色、雨/灯笼粒子；`tests/path.test.js` 通过 |
| **W2 规则** | 前端 | `web/rules.js`, `web/guests.js`, `web/scoring.js`, `web/celebrity.js`, `tests/rules.test.js` | 7 种游客行为、哄、掉队、冲突打架、1024 时钟、评分/称号、名人触发 + 模板；纯逻辑无 DOM，单测全绿 |
| **W3 流程 UI** | 前端 | `web/index.html`, `web/ui.js`, `web/style.css`, `web/ending.js` | 开局写困扰、接团、排路线页、HUD、中断双按钮、黑屏→点人头→两按钮、结算、升华屏、再来一局；用 mock state 可独立演示 |
| **W4 后端** | 后端 | `server/**`, `deploy/**`, `tests/api.test.js` | Express + SQLite 4 接口 + 名人代理 + 敏感词 + 限流；`npm start` 即跑；Nginx 配置 + pm2；部署脚本 |
| **W5 内容** | 内容 | `content/*.json`（guests, places, knowledge, celebrities, ending, seed_troubles, badwords） | 8 种游客台词（每种 ≥4 句，分开局/闹/化解/结算）；4 名人人设卡 + 各 3 条模板；≥20 条带出处知识；≥40 条种子困扰；升华文案；每条 `source` |

并行规则：
- 各 agent 开工前读 `CONTRACT.md`；发现契约不够用，**写进 `docs/ISSUES.md` 由 Lead 裁决**，不得私改别人文件。
- 每完成一个可运行里程碑，在 `docs/PROGRESS.md` 追加一行（文件、功能、如何验证）。
- W1/W2/W3 用同一份 `content/*.json`，W5 先在 30 分钟内交出字段齐全的占位版本再充实。

## Phase 2 集成（Lead + W3，1 小时）

- `web/main.js`（Lead 拥有）把 engine/rules/ui 串起来；替换 mock。
- 跑 A1–A7。失败按所有权退回对应 W。

## Phase 3 审查与修复（1.5 小时）

| Agent | 角色 | 动作 |
|---|---|---|
| **S1 QA** | 兵蚁 | 写并跑 Playwright 冒烟（390×844）+ 断网回归；输出 `artifacts/` 截图与问题清单（按 P0/P1） |
| **S2 审查** | 兵蚁（只读） | 对照 PRD 第 3/4 章逐条核对；核对名人史实出处；输出 `docs/REVIEW.md` |
| W1–W5 | 修复 | 只修自己文件；最多 2 轮 |

## Phase 4 部署与试玩（1 小时）

- W4 执行 `deploy/deploy.sh` 到 ECS，A8 通过；二维码生成。
- Lead 找 3 人试玩，记录 E8；惊艳度自评写入 `docs/EVAL_LOG.md`。
- 写 `PROJECT_STATE.md`（Intake + 运行记录）。

## 不做的事（写给所有 agent）

- 不引入打包工具、框架、CDN。
- 不做 3D、账号、实时多人、自由文本路线。
- 不编造名人生平；`source` 为空的内容不渲染。
- 不改公式：心 3 颗、哄 2 次、停站 32、回头 +64、一局 256 秒。调参只改 `content/params.json`。
