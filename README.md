# 温州玩家 · 1024分钟

温州的一天有 1024 分钟。你带 5 个陌生人逛鹿城，他们每人揣着一件旅行中最怕的事——那件事是**另一个真人**开局时写下的。午夜前把大家带回家，路上还会遇到和温州有渊源的古今名人。玩一局，认识一座城。

> 本目录原是「瓯城·1024」旧版（一分钟一局点灯小游戏），2026-10-23 起由《温州玩家》版本覆盖为主游戏。
> 旧版完整备份在 `_archive_oucheng_v1/`（含 server.py / web / data / 文档 / 截图），可随时找回。

## 跑起来（三步）

1. 装 Node ≥ 22，进服务端装依赖（仓库已带 node_modules 可跳过）：
   ```bash
   cd server && npm install
   ```
2. 启动（默认 `127.0.0.1:8790`，只监听本机，由 nginx 反代；需要直连时 `HOST=0.0.0.0`）：
   ```bash
   node server/index.js
   ```
3. 手机连同一 Wi-Fi，打开 `http://<本机IP>:8790/play/`

自检：`curl http://127.0.0.1:8790/api/health`，看到 `"ok": true` 即通。

## 名人 AI（可选）

名人台词默认走人设卡模板，断网/不配置也能玩。接 AI 后输出标注仍为「AI 代拟，非原作」：

```bash
# server/.env
AI_PROTOCOL=openai            # 或 anthropic
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_API_KEY=sk-***
AI_MODEL=qwen3.8-max
```

3 秒超时自动回退模板；输出过服务端敏感词过滤。

## 测试与工具

```bash
node tests/rules.test.js      # 规则逻辑 27 项
node tests/path.test.js       # 寻路/地图连通性
node tests/upgrades.test.js   # PRD-v2 升级逻辑 9 项
node tests/api.test.js        # 后端接口 15 项（自起临时服务）
node scripts/gen-assets.js    # 重新生成 web/assets 六张地标像素图
node tests/smoke-run.js       # 整局冒烟（支持 WZ_CHANNEL=chrome）
```

## 文档

- `docs/PRD-v2.md` — 当前产品需求（互动升级版，含平板 3:7 手册规格）
- `docs/EVAL-v2.md` — 验收框架；`docs/EVAL_LOG.md` — 每轮运行记录
- `docs/PRD.md` / `docs/CONTRACT.md` / `docs/ISSUES.md` — v1 基线与审查
- `PROJECT_STATE.md` — 项目状态与运行记录

## 比赛信息

1024 超能 Coding 周末 · 温州站 · 游戏赛道。2026-10-25 15:00 封板 / 16:00 提交。
