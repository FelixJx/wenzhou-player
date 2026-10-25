# 部署说明 —— 《温州玩家 · 1024分钟》

目标机：已有 ECS（`root@39.96.72.14`，与 backroom 同机）。目录 `/srv/wenzhou`。域名占位 `play.yaosenai.cn`。

```
/srv/wenzhou/
├── .env            ← 唯一需要手填的文件（从 server/.env.example 复制）
├── data/wz.db      ← SQLite（自动建表；备份只需拷这个文件）
├── web/            ← 前端静态
├── content/        ← 内容 .js
├── server/         ← Node 服务（node_modules 在远端 npm ci 生成）
└── deploy/         ← 本目录的副本
```

架构：nginx 只做 TLS 终止与反代（`/ → 127.0.0.1:8790`），静态文件（`/play/*`、`/content/*`）与 `/api/*` 都由 Node 服务处理；`/` 302 到 `/play/`。

## 0. 前置条件（只做一次）

- 服务器已装 **nginx** 与 **Node ≥ 22**（`node -v`）。Node 22 安装示例：`curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs`（或用 nvm）。
- 本机有 `ssh`、`rsync`，且能免密登录 `root@39.96.72.14`。
- DNS：把 `play.yaosenai.cn`（或你的域名）A 记录指向 `39.96.72.14`。

### 换域名

三处替换 `play.yaosenai.cn` 即可：
1. 运行部署时传环境变量：`DOMAIN=你的域名 bash deploy/deploy.sh`（脚本会在写入 nginx conf 时自动替换）。
2. 或手动改 `deploy/nginx.conf` 里的两处 `server_name`。
3. certbot 命令里的 `-d` 参数。

## 1. 首次部署

```bash
# 在仓库根目录
bash deploy/deploy.sh --dry-run     # 先看会执行什么，不触碰服务器
bash deploy/deploy.sh               # 实际部署
```

脚本做的事：本地 `node --check` → 远端建目录 → `rsync` 四个目录（排除 node_modules / data / .env）→ 远端若无 `.env` 则从 `.env.example` 生成并把 `DB_PATH` 指到 `/srv/wenzhou/data/wz.db` → `npm ci --omit=dev` → 安装 nginx conf（`/etc/nginx/conf.d/wenzhou.conf` + `wenzhou-proxy.inc` + `wenzhou-limit.conf`）→ `nginx -t && reload` → 安装并重启 systemd `wenzhou.service` → `curl /api/health`。

**证书**：首次没有证书时脚本只启用 80 端口直连 Node（不跳 https）。签证书后重跑一次脚本会自动启用 443 块与 80→443 跳转：

```bash
ssh root@39.96.72.14 'apt-get install -y certbot python3-certbot-nginx && certbot --nginx -d play.yaosenai.cn'
bash deploy/deploy.sh
```

**AI**：编辑服务器上的 `/srv/wenzhou/.env`，填 `AI_BASE_URL / AI_API_KEY / AI_MODEL`，然后 `systemctl restart wenzhou`。三项任一为空则名人台词全部走模板（`source:'template'`），功能不受影响。

验证：

```bash
curl -s https://play.yaosenai.cn/api/health      # {"ok":true,"version":"1.0.0","driver":"better-sqlite3","ai":true,...}
curl -I https://play.yaosenai.cn/play/           # 200
curl -s 'https://play.yaosenai.cn/api/troubles/sample?n=5'
```

## 2. .env 变量表

| 变量 | 默认 | 说明 |
|---|---|---|
| `HOST` | `127.0.0.1` | Node 监听地址。默认只听本机，外网只能经 nginx 进入；本地直连调试才改 `0.0.0.0` |
| `PORT` | `8790` | Node 监听端口；nginx 反代到它 |
| `DB_PATH` | `./data/wz.db`（相对 server/） | SQLite 文件路径。服务器上请用绝对路径 `/srv/wenzhou/data/wz.db` |
| `AI_BASE_URL` | 空 | Anthropic 兼容 `/v1/messages` 根地址。dashscope：`https://dashscope.aliyuncs.com/apps/anthropic`；可带或不带 `/v1/messages` 后缀 |
| `AI_API_KEY` | 空 | 同时放入 `x-api-key` 与 `Authorization: Bearer` 两个头 |
| `AI_MODEL` | 空 | 如 `qwen-plus`、`qwen-turbo` |

`.env` 不进 git、不被 rsync 覆盖；`.env.example` 里绝不写真实密钥。

## 3. 日常更新

```bash
bash deploy/deploy.sh        # 重复执行即可；数据库与 .env 不会被动
```

只改了前端/内容时也走同一个脚本（会 restart Node，数秒内恢复；静态缓存 5 分钟）。

## 4. 回滚

代码回滚：在本地 `git checkout <上一个好版本>` 后重新 `bash deploy/deploy.sh`（rsync `--delete` 会让远端与本地一致）。

数据回滚：部署前可在服务器 `cp /srv/wenzhou/data/wz.db /srv/wenzhou/data/wz.db.bak-$(date +%s)`；需要时 `systemctl stop wenzhou && cp 备份 wz.db && systemctl start wenzhou`。建表语句全部 `IF NOT EXISTS`，旧库可直接被新版本打开。

服务异常时：

```bash
systemctl status wenzhou
journalctl -u wenzhou -n 100 --no-pager      # 每请求一行：方法 路径 状态 耗时（不含 IP）
systemctl restart wenzhou
```

## 5. 运行用户与目录权限

`wenzhou.service` 以 `User=www-data` 运行，并用 `ReadOnlyPaths=/srv/wenzhou` + `ReadWritePaths=/srv/wenzhou/data` 把可写范围限制在数据目录。`deploy.sh` 每次都会重设权限：

| 路径 | 属主 | 权限 | 说明 |
|---|---|---|---|
| `/srv/wenzhou`（含 web/ content/ server/ deploy/） | `root:www-data` | `u=rwX,g=rX,o=` | 代码只读 |
| `/srv/wenzhou/data` | `www-data:www-data` | `u=rwX,g=rX,o=` | SQLite 及 WAL 文件可写 |
| `/srv/wenzhou/.env` | `root:www-data` | `640` | 含 AI 密钥，其它用户不可读 |

手动改过文件后若服务起不来（`EACCES`），重跑 `deploy.sh` 或执行脚本里的 `chown/chmod` 三行即可。

**安全组**：ECS 只放行 80/443；8790 不要对外开放（Node 默认也只监听 127.0.0.1）。

**限流分桶**：Node 只有在连接来自本机（nginx）时才信任 `X-Real-IP`，直连请求按 socket 地址分桶，伪造头无法绕过。

## 6. SQLite 驱动

`server/db.js` 优先使用 `better-sqlite3`（本机 Node 24 与服务器 Node 22 均有预编译二进制）；若 `npm ci` 因网络或 ABI 问题装不上，它会自动回退到 Node 22+ 内置的 `node:sqlite`，无需改代码。`/api/health` 的 `driver` 字段会显示当前实际使用的驱动。

## 7. 限流

两层：
- nginx `limit_req`：`/api/troubles` 20 次/分钟/IP（burst 5）；`/api/` 整体 60 次/分钟/IP（burst 20）。
- Node 内部（每 IP 每分钟）：`/api/troubles` 10、`/api/runs` 20、`/api/celebrity` 6（后者命中付费 AI）。超限返回 `429 {ok:false,error:'rate_limited'}`。

Node 单进程部署，内存限流足够；若将来多进程，只保留 nginx 这层。

## 7.1 日志

- Node：每请求一行 `方法 路径 状态 耗时`，不含 IP，进 journald。
- nginx：`access_log` 使用 `wz_noip` 格式（定义在 `wenzhou-limit.conf`），不含 `$remote_addr`；需要排障时可临时换回 `combined`。

## 8. 生成二维码

二维码内容为 `https://play.yaosenai.cn/play/`。任何本地工具均可生成（例如 `pip install qrcode[pil] && qr 'https://play.yaosenai.cn/play/' > qr.png`，或 `npx qrcode -o qr.png 'https://play.yaosenai.cn/play/'`），不要用在线生成站。建议打印时在二维码下方标注"扫码写下你旅行最怕的事"。

## 9. 本地开发

```bash
cd server && npm install
npm start                       # http://127.0.0.1:8790/play/
npm test                        # 等价于 node ../tests/api.test.js（自动起临时服务与临时 DB）
```
