# 任务：把本项目首次推送到 GitHub（账号 FelixJx，gh 已登录）

## 已就绪（不要重复做）
- gh auth 登录完成（`gh api user` 应返回 FelixJx）
- `.gitignore` 已配置：.feishu_creds.json/.zcode/.DS_Store/.venv/.claude/备份目录/采集 profile 与 .state 均已排除；web/assets/music/*.mp3 是游戏必需资源，保留入库

## 执行步骤
1. **仓库参数（缺此信息先问用户）**：仓库名建议 `wenzhou-player-1024`；可见性建议 `--private`（比赛作品+游戏音乐有版权，公开前需用户确认）
2. **推送前安全自查**（不通过就不推）：
   - `git grep -iE "sk-[a-zA-Z0-9]{20,}|api[_-]?key\s*[:=]|password\s*=" -- ':!*.md'` 无真实密钥命中
   - 确认 `.feishu_creds.json`、`server/.env` 不在待提交列表
   - `tools/crawl-lab/results/` 内只允许事实 JSON/TSV，不得含 cookie/账号/评价原文
3. **提交**：分三个逻辑提交（conventional commits，不加 attribution）：
   - `feat: 温州玩家·1024分钟 v1.0（真实地图+PRD-v3 互动+音效音乐+后端AI）`
   - `chore: crawl-lab 数据采集管线（携程/高德App两路已通，含固化的封板采集任务书）`
   - `docs: 数据需求/玩法清单/采集提示词与QA报告`
4. **建仓并推送**：
   ```
   gh repo create <仓库名> --private --source . --remote origin --push
   git push -u origin master
   ```
5. **回填**：把远程 URL 写进 PROJECT_STATE.md 顶部，输出仓库地址

## 红线
- 不 force-push、不改历史、不推送 `server/data/`（玩家数据库）
- 大于 50MB 的单文件先报告再决定（git push 会被 GitHub 拒绝 100MB）
