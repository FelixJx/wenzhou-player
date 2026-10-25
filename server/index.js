'use strict';
// 《温州玩家 · 1024分钟》后端入口：Express + SQLite + 名人 AI 代理 + 静态托管
// 接口见 docs/CONTRACT.md §6。

const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('./db');
const ai = require('./ai');
const filter = require('./filter');

const VERSION = require('./package.json').version;

// ---------- 读取 .env（不引入 dotenv，支持 server/.env 与 cwd/.env） ----------
function loadEnv() {
  for (const file of [path.join(__dirname, '.env'), path.join(process.cwd(), '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m || line.trim().startsWith('#')) continue;
      let v = m[2];
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}
loadEnv();

const PORT = Number(process.env.PORT) || 8790;
// 默认只监听本机，由同机 nginx 反代；需要直连时用 HOST=0.0.0.0 覆盖（REVIEW M7）
const HOST = process.env.HOST || '127.0.0.1';
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'data', 'wz.db');

const WEB_DIR = path.join(__dirname, '..', 'web');
const CONTENT_DIR = path.join(__dirname, '..', 'content');
const SEED = require('./seed.json');

// 每 IP 每分钟上限（REVIEW M6：celebrity 走付费 AI、runs 写榜单，都要限）
const RATE_LIMIT = {
  troubles: { windowMs: 60 * 1000, max: 10 },
  runs: { windowMs: 60 * 1000, max: 20 },
  celebrity: { windowMs: 60 * 1000, max: 6 },
  shopFeedback: { windowMs: 60 * 1000, max: 20 }, // 进店游客感想（10/25）
};
const SEAT_RE = /^[A-Za-z0-9_-]{8}$/;
const MAX_TEXT_CHARS = 20; // 10/24 #1：一句话 10 → 20 字

function log(line) {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`);
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// 限流分桶用的客户端地址：只有连接来自本机（nginx 反代）时才信任 X-Real-IP / X-Forwarded-For，
// 直连 Node 的请求一律按 socket 地址分桶，避免伪造头绕过限流（REVIEW M7）
function clientIp(req) {
  const remote = req.socket.remoteAddress || 'unknown';
  if (!LOOPBACK.has(remote)) return remote;
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return remote;
}

// 内存滑动窗口限流（单进程足够；多进程请改为 nginx limit_req）
function makeRateLimiter({ windowMs, max }) {
  const hits = new Map(); // ip → timestamps[]
  setInterval(() => {
    const cut = Date.now() - windowMs;
    for (const [ip, arr] of hits) {
      const keep = arr.filter((t) => t > cut);
      if (keep.length) hits.set(ip, keep); else hits.delete(ip);
    }
  }, windowMs).unref();
  return (req, res, next) => {
    const ip = clientIp(req);
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter((t) => t > now - windowMs);
    if (arr.length >= max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ ok: false, error: 'rate_limited' });
    }
    arr.push(now);
    hits.set(ip, arr);
    next();
  };
}

function charLen(s) {
  return Array.from(String(s)).length;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createApp(store) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // 仅信任本机 nginx 的转发头

  // 每请求一行日志：方法 路径 状态 耗时（不记录 IP）
  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    // 用 originalUrl：静态中间件挂载后 req.path 会被截掉前缀
    const urlPath = String(req.originalUrl || req.url).split('?')[0];
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      log(`${req.method} ${urlPath} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  });

  app.use('/api', express.json({ limit: '64kb' }));

  app.get('/favicon.ico', (req, res) => { res.status(204).end(); }); // 免得每次加载都 404 一条 console error

  // ---------- API ----------
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, version: VERSION, driver: store.driver, ai: ai.aiConfigured(), troubles: store.countTroubles() });
  });

  app.post('/api/troubles', makeRateLimiter(RATE_LIMIT.troubles), (req, res) => {
    const body = req.body || {};
    const seat = String(body.seat || '');
    const tag = String(body.tag || '');
    const text = String(body.text || '').trim();
    if (!SEAT_RE.test(seat)) return res.status(400).json({ ok: false, error: 'bad_seat' });
    if (!filter.TAGS.includes(tag)) return res.status(400).json({ ok: false, error: 'bad_tag' });
    if (!text || charLen(text) > MAX_TEXT_CHARS) return res.status(400).json({ ok: false, error: 'bad_text' });
    if (/[\r\n]/.test(text)) return res.status(400).json({ ok: false, error: 'bad_text' });

    const f = filter.filterTrouble(text, tag);
    const id = store.insertTrouble(seat, tag, f.text);
    res.json({ ok: true, id, text: f.text, replaced: f.replaced });
  });

  app.get('/api/troubles/sample', (req, res) => {
    let n = parseInt(req.query.n, 10);
    if (!Number.isFinite(n)) n = 5;
    n = Math.min(10, Math.max(1, n));
    const exclude = String(req.query.exclude || '');

    const rows = store.sampleTroubles(n, exclude);
    const items = rows.map((r) => ({ tag: r.tag, text: r.text }));
    const used = new Set(items.map((i) => i.text));

    // 不足用内置种子补齐（去重）
    if (items.length < n) {
      const pool = shuffle(SEED.filter((s) => !used.has(s.text)));
      for (const s of pool) {
        if (items.length >= n) break;
        items.push({ tag: s.tag, text: s.text });
      }
    }
    // 记录真人困扰被分配给了该座位（用于 /api/mine）
    if (SEAT_RE.test(exclude) && rows.length) {
      store.recordAssignments(exclude, rows.map((r) => r.id));
    }
    res.json({ ok: true, items: shuffle(items) });
  });

  app.post('/api/runs', makeRateLimiter(RATE_LIMIT.runs), (req, res) => {
    const body = req.body || {};
    const seat = String(body.seat || '');
    const result = body.result;
    if (!SEAT_RE.test(seat)) return res.status(400).json({ ok: false, error: 'bad_seat' });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return res.status(400).json({ ok: false, error: 'bad_result' });
    }
    // 结果里可能含玩家名，用于榜单展示；统一过一遍敏感词
    if (typeof result.playerName === 'string' && filter.hit(result.playerName)) result.playerName = '游客';
    if (typeof result.name === 'string' && filter.hit(result.name)) result.name = '游客';
    // PRD-v4：score 必须是 −200～500 的整数（容忍 {total:N} 形态），否则 400 bad_score
    if (result.score != null) {
      const raw = typeof result.score === 'object' && result.score !== null ? result.score.total : result.score;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < -200 || n > 500) return res.status(400).json({ ok: false, error: 'bad_score' });
      result.score = n;
    }
    const id = store.insertRun(seat, result);
    res.json({ ok: true, id });
  });

  app.get('/api/boards', (req, res) => {
    const b = store.boards();
    res.json({ ok: true, remembered: b.remembered, fastest: b.fastest, lost: b.lost, score: b.score });
  });

  app.get('/api/mine', (req, res) => {
    const seat = String(req.query.seat || '');
    if (!SEAT_RE.test(seat)) return res.status(400).json({ ok: false, error: 'bad_seat' });
    const m = store.mine(seat);
    res.json({ ok: true, text: m.text, tag: m.tag, assigned: m.assigned, broughtHome: m.broughtHome });
  });

  app.post('/api/celebrity', makeRateLimiter(RATE_LIMIT.celebrity), async (req, res) => {
    const body = req.body || {};
    const who = String(body.who || '');
    if (!who) return res.status(400).json({ ok: false, error: 'bad_who' });
    const ctx = body.ctx && typeof body.ctx === 'object' ? body.ctx : {};
    // 玩家名也要过敏感词，避免注入到 AI 输出里
    if (typeof ctx.playerName === 'string') {
      ctx.playerName = filter.hit(ctx.playerName) ? '朋友' : ctx.playerName.slice(0, 12);
    }
    try {
      const out = await ai.generate(who, ctx, log);
      res.json({ ok: true, text: out.text, source: out.source, who: out.who });
    } catch (e) {
      // generate 内部已兜底，这里是最后防线
      const card = ai.findCard(who) || ai.BUILTIN.subuqing;
      res.json({ ok: true, text: ai.templateText(card, ctx), source: 'template', who });
    }
  });

  // 进店游客感想（10/25）：队伍 AI 游客对刚走进店铺的一句反馈；AI 挂了回通用模板
  app.post('/api/shop-feedback', makeRateLimiter(RATE_LIMIT.shopFeedback), async (req, res) => {
    const body = req.body || {};
    const shop = String(body.shop || '').trim().slice(0, 24);
    if (!shop) return res.status(400).json({ ok: false, error: 'bad_shop' });
    const ctx = body.ctx && typeof body.ctx === 'object' ? body.ctx : {};
    const safeCtx = ai.sanitizeCtx ? ai.sanitizeCtx(ctx) : ctx;
    try {
      const out = await ai.shopFeedback(shop, safeCtx, log);
      res.json({ ok: true, text: out.text, source: out.source });
    } catch (e) {
      res.json({ ok: true, text: '走走走，正好歇会儿。', source: 'template' });
    }
  });

  app.all('/api/*', (req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

  // ---------- 静态 ----------
  app.get('/', (req, res) => res.redirect(302, '/play/'));
  // index.html 用相对路径引 ../content/*.js，不带斜杠的 /play 会让相对路径解析到根，必须 301 到 /play/
  // 注意 Express 非严格路由下 '/play' 也会匹配 '/play/'，须按原始路径判断，否则循环跳转
  app.get('/play', (req, res, next) => {
    if (String(req.originalUrl).split('?')[0] !== '/play') return next();
    res.redirect(301, '/play/');
  });
  // STATIC_MAX_AGE：开发自测可设 0 关强缓存（默认 5m 不变，PRD-v3 调试开关）
  const STATIC_MAX_AGE = process.env.STATIC_MAX_AGE || '5m';
  app.use('/play', express.static(WEB_DIR, { extensions: ['html'], maxAge: STATIC_MAX_AGE }));
  app.use('/content', express.static(CONTENT_DIR, { maxAge: STATIC_MAX_AGE }));

  // 统一错误处理（JSON 解析失败等）
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) log(`error ${req.method} ${req.path}: ${err.message}`);
    res.status(status).json({ ok: false, error: status === 400 ? 'bad_json' : (err.type || 'server_error') });
  });

  return app;
}

function start() {
  const store = db.open(DB_PATH);
  const app = createApp(store);
  const server = app.listen(PORT, HOST, () => {
    log(`listening on ${HOST}:${PORT} db=${DB_PATH} driver=${store.driver} ai=${ai.aiConfigured() ? 'on' : 'template-only'}`);
  });
  const shutdown = () => {
    log('shutting down');
    server.close(() => { store.close(); process.exit(0); });
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

if (require.main === module) start();

module.exports = { createApp, start };
