#!/usr/bin/env bash
# 《温州玩家 · 1024分钟》一键部署到 ECS。
# 用法：
#   bash deploy/deploy.sh            # 实际部署
#   bash deploy/deploy.sh --dry-run  # 只打印将执行的命令，不触碰服务器
# 可用环境变量覆盖：HOST（默认 root@39.96.72.14）、REMOTE_DIR（默认 /srv/wenzhou）、DOMAIN（默认 play.yaosenai.cn）
set -euo pipefail

HOST="${HOST:-root@39.96.72.14}"
REMOTE_DIR="${REMOTE_DIR:-/srv/wenzhou}"
DOMAIN="${DOMAIN:-player.yaosenai.cn}"
DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run|-n) DRY=1 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "未知参数: $a" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

run() {
  if [ "$DRY" = 1 ]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi
}
remote() {
  # 远端执行一段 shell
  if [ "$DRY" = 1 ]; then printf '[dry-run] ssh %s <<EOF\n%s\nEOF\n' "$HOST" "$1"; else ssh "$HOST" "bash -s" <<<"$1"; fi
}

echo "==> 目标 $HOST:$REMOTE_DIR  域名 $DOMAIN  $( [ "$DRY" = 1 ] && echo '(dry-run)' )"

# 0. 本地自检：语法 + 必要文件
for f in server/index.js server/db.js server/ai.js server/filter.js; do node --check "$f"; done
for d in web content server deploy; do [ -d "$d" ] || { echo "缺少目录 $d" >&2; exit 1; }; done

# 1. 远端建目录
remote "mkdir -p $REMOTE_DIR/data $REMOTE_DIR/web $REMOTE_DIR/content $REMOTE_DIR/server $REMOTE_DIR/deploy"

# 2. 同步代码（不带 node_modules / data / .env；--delete 让远端与本地一致）
RSYNC_OPTS=(-az --delete --exclude node_modules --exclude data --exclude .env --exclude '*.db' --exclude '*.db-*')
run rsync "${RSYNC_OPTS[@]}" web/     "$HOST:$REMOTE_DIR/web/"
run rsync "${RSYNC_OPTS[@]}" content/ "$HOST:$REMOTE_DIR/content/"
run rsync "${RSYNC_OPTS[@]}" server/  "$HOST:$REMOTE_DIR/server/"
run rsync "${RSYNC_OPTS[@]}" deploy/  "$HOST:$REMOTE_DIR/deploy/"

# 3. 远端：.env、依赖、nginx、systemd
remote "set -e
cd $REMOTE_DIR
# 首次没有 .env 则从示例复制（之后请手动填 AI_* 并把 DB_PATH 指到 $REMOTE_DIR/data/wz.db）
if [ ! -f .env ]; then
  cp server/.env.example .env
  sed -i 's#^DB_PATH=.*#DB_PATH=$REMOTE_DIR/data/wz.db#' .env
  echo '!! 已生成 $REMOTE_DIR/.env，请填写 AI_BASE_URL / AI_API_KEY / AI_MODEL（留空则名人全走模板）'
fi
# Node 版本检查（需要 >= 22）
node -e 'const v=+process.versions.node.split(\".\")[0]; if(v<22){console.error(\"Node 版本过低: \"+process.version);process.exit(1)}'
cd server && npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -3 && cd ..
# nginx：域名占位替换 + 安装 conf
sed \"s/play\\.yaosenai\\.cn/$DOMAIN/g\" deploy/nginx.conf > /etc/nginx/conf.d/wenzhou.conf
cp deploy/wenzhou-proxy.inc /etc/nginx/conf.d/wenzhou-proxy.inc
cp deploy/wenzhou-limit.conf /etc/nginx/conf.d/wenzhou-limit.conf
# 证书不存在时，注释掉的 ssl_* 保持注释，nginx -t 会因 443 块缺证书报错 → 先只启用 80 块
if [ ! -f /etc/letsencrypt/live/$DOMAIN/fullchain.pem ]; then
  echo '!! 未找到证书，先只启用 80 端口；签发后重跑本脚本即可自动打开 443'
  awk '/^server \\{/{n++} n<2' deploy/nginx.conf | sed \"s/play\\.yaosenai\\.cn/$DOMAIN/g; s#return 301 https://\\\$host\\\$request_uri;#proxy_pass http://127.0.0.1:8790; include /etc/nginx/conf.d/wenzhou-proxy.inc;#\" > /etc/nginx/conf.d/wenzhou.conf
else
  sed -i 's/^    # \\(ssl_certificate\\|ssl_certificate_key\\|include \\|ssl_dhparam\\)/    \\1/' /etc/nginx/conf.d/wenzhou.conf
fi
nginx -t && systemctl reload nginx
# 目录权限：服务以 www-data 运行，代码只读、data/ 可写、.env 仅 www-data 可读
id www-data >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin www-data
chown -R root:www-data $REMOTE_DIR
chmod -R u=rwX,g=rX,o= $REMOTE_DIR
chown -R www-data:www-data $REMOTE_DIR/data
chmod 640 $REMOTE_DIR/.env
# systemd
cp deploy/wenzhou.service /etc/systemd/system/wenzhou.service
systemctl daemon-reload
systemctl enable wenzhou >/dev/null 2>&1 || true
systemctl restart wenzhou
sleep 1.5
curl -fsS http://127.0.0.1:8790/api/health && echo
systemctl --no-pager --lines=5 status wenzhou || true
"

echo "==> 完成。外网验证：curl -I https://$DOMAIN/play/  （无证书时用 http://）"
