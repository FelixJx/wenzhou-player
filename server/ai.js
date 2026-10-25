'use strict';
// 名人 AI 代理：两种协议（ISSUES 2026-10-23 Lead 追认）——
//   AI_PROTOCOL=anthropic（默认）→ POST {base}/v1/messages（Anthropic 兼容，如 dashscope apps/anthropic）
//   AI_PROTOCOL=openai        → POST {base}/chat/completions（OpenAI 兼容，如 dashscope compatible-mode、局域网 DeepSeek）；
//                                思考模型必须带 enable_thinking:false（实测 qwen3.8-max：开思考 10s+，关思考 1.6s）。
// 3 秒超时；任何失败 → 人设卡模板。人设卡优先读 content/celebrities.js，缺失则用内置最小人设。

const path = require('path');
const filter = require('./filter');

const AI_TIMEOUT_MS = 3000;
const MAX_LEN = 60;

// 内置最小人设（仅在 content/celebrities.js 不存在时使用；生平只写有把握的）
const BUILTIN = {
  xielingyun: {
    id: 'xielingyun', name: '谢灵运', title: '永嘉太守 · 山水诗人',
    bio: ['南朝宋人，曾任永嘉太守，是中国山水诗的开创者之一。', '名句"池塘生春草，园柳变鸣禽"出自在永嘉所作的《登池上楼》。'],
    tone: '清旷、好游山水、略带文人的疏放，爱用四句短诗说话。',
    templates: [
      '{name}，你带的这队人，走的也是我当年的山水路。{place}这一步，值得。',
      '池塘生春草，园柳变鸣禽。{name}今日所行，{route}，也算一首诗了。',
      '永嘉的山水，我写过；{name}的路线，今天我也记下了。',
    ],
  },
  wangxizhi: {
    id: 'wangxizhi', name: '王羲之', title: '书圣 · 传永嘉郡守',
    bio: ['东晋书法家，被后世尊为"书圣"，代表作《兰亭集序》。', '温州墨池相传为其洗砚之处，"墨池"地名由此而来。'],
    tone: '从容、温厚，爱以写字比喻做事，语气像长者。',
    templates: [
      '{name}，写字要慢，带人也要慢。{place}这一笔，你落得稳。',
      '一池墨水洗了多少年，{name}今天在{place}停下来，便是一横一竖的功夫。',
      '笔要提得起，队伍要带得住。{name}，不急。',
    ],
  },
  wentianxiang: {
    id: 'wentianxiang', name: '文天祥', title: '南宋丞相 · 曾过江心屿',
    bio: ['南宋末年丞相、诗人，以忠烈著称，有《正气歌》《过零丁洋》。', '1276 年从元军中脱险，经温州南下，江心屿后建有文信国公祠纪念。'],
    tone: '凝重、克制、不说漂亮话，一句话点到为止。',
    templates: [
      '{name}，我当年从江心屿过，没有回头的余地。你今天有，别浪费。',
      '江水向东，人要往回走一回，才知道谁还在。{place}，记住它。',
      '走得再远，也要点一次人头。{name}，这话我送你。',
    ],
  },
  subuqing: {
    id: 'subuqing', name: '苏步青', title: '数学家 · 平阳人',
    bio: ['温州平阳人，中国现代数学家，微分几何学派的开创者之一。', '长期任教于复旦大学，曾任复旦大学校长。'],
    tone: '亲切、爱算数、像个会讲笑话的老教授。',
    templates: [
      '{name}，2 的 10 次方是 1024。温州的一天也刚好这么长，你算好了吗？',
      '一天 1024 分钟，{name}走过{route}，每一分钟我都替你数着。',
      '数学家只关心一件事：{name}，你带回来的人数，等于出发时的人数吗？',
    ],
  },
};

// 读取人设卡：优先 content/celebrities.js
function loadCelebrities() {
  try {
    const file = path.join(__dirname, '..', 'content', 'celebrities.js');
    require(file);
    const list = globalThis.WZ && globalThis.WZ.content && globalThis.WZ.content.celebrities;
    if (Array.isArray(list) && list.length) {
      // W5 的卡用 who 作主键（如 'xie_lingyun'），同时兼容 id / name 查找
      const map = {};
      for (const c of list) {
        if (!c || typeof c !== 'object') continue;
        const key = c.who || c.id;
        if (!key) continue;
        if (!c.id) c.id = key;
        map[key] = c;
        if (c.name) map[c.name] = c;
      }
      return map;
    }
    if (list && typeof list === 'object' && Object.keys(list).length) return list;
  } catch (_) {
    // 文件不存在则使用内置
  }
  return BUILTIN;
}

function findCard(who) {
  const cards = loadCelebrities();
  if (cards[who]) return cards[who];
  // 兼容按 name 查找
  for (const k of Object.keys(cards)) {
    const c = cards[k];
    if (c && (c.id === who || c.who === who || c.name === who)) return c;
  }
  return null;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function fillTemplate(tpl, ctx) {
  const route = Array.isArray(ctx.route) && ctx.route.length ? ctx.route.join('、') : '这一程';
  return String(tpl)
    .replace(/\{name\}/g, ctx.playerName || '朋友')
    .replace(/\{place\}/g, ctx.place || '这里')
    .replace(/\{route\}/g, route);
}

function templateText(card, ctx) {
  const tpls = (card && Array.isArray(card.templates) && card.templates.length)
    ? card.templates.map((t) => (typeof t === 'string' ? t : (t && t.text) || ''))
    : BUILTIN.subuqing.templates;
  return fillTemplate(pick(tpls.filter(Boolean)), ctx);
}

function buildSystem(card) {
  const bio = Array.isArray(card.bio) ? card.bio : (Array.isArray(card.facts) ? card.facts : []);
  const bioLines = bio.map((b) => (typeof b === 'string' ? b : (b && b.text) || '')).filter(Boolean);
  const q = card.originalQuote || card.quote;
  const quote = q ? (typeof q === 'string' ? q : q.text) : '';
  let forbidden = card.forbidden || card.taboo || '不得编造未列出的史实，不评价真实商家。';
  if (Array.isArray(forbidden)) forbidden = forbidden.join('；') + '。';
  return [
    `你现在扮演${card.name}（${card.title || ''}），在手机小游戏《温州玩家·1024分钟》里对玩家说一句话。`,
    '人物生平（只能使用以下内容）：',
    ...bioLines.map((b) => `- ${b}`),
    quote ? `原句：${quote}` : '',
    `口吻：${card.tone || card.voice || '平和、简短'}`,
    `禁区：${forbidden} 不得涉及政治、宗教争议与色情暴力。`,
    `输出要求：简体中文；纯文本，不要标题、引号、Markdown；不超过 ${MAX_LEN} 字，或四行短诗；`,
    '必须自然提到玩家名字；可以提到玩家走过的地名；不要解释自己是 AI。',
  ].filter(Boolean).join('\n');
}

function buildUser(ctx) {
  const stageNames = ['清晨', '上午', '午后', '黄昏', '夜里'];
  const stage = typeof ctx.stage === 'number' ? (stageNames[ctx.stage] || '') : (ctx.stage || '');
  return [
    `玩家名字：${ctx.playerName || '朋友'}`,
    `已走路线：${Array.isArray(ctx.route) && ctx.route.length ? ctx.route.join(' → ') : '刚出发'}`,
    `队里游客的困扰标签：${Array.isArray(ctx.tags) && ctx.tags.length ? ctx.tags.join('、') : '无'}`,
    `当前地点：${ctx.place || '未知'}`,
    `天色：${stage || '未知'}`,
    '请对玩家说一句话。',
  ].join('\n');
}

function aiConfigured() {
  return Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL);
}

async function callAI(card, ctx) {
  const base = process.env.AI_BASE_URL.replace(/\/+$/, '');
  const protocol = (process.env.AI_PROTOCOL || 'anthropic').toLowerCase();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), AI_TIMEOUT_MS);
  try {
    let url, headers, body;
    if (protocol === 'openai') {
      // base 形如 …/compatible-mode/v1 或局域网 http://host:8000/v1；也容忍不带 /v1
      url = /\/chat\/completions$/.test(base) ? base : (/\/v1$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`);
      headers = { 'content-type': 'application/json' };
      if (process.env.AI_API_KEY) headers.authorization = `Bearer ${process.env.AI_API_KEY}`;
      body = {
        model: process.env.AI_MODEL,
        max_tokens: 200,
        temperature: 0.8,
        enable_thinking: false, // qwen3 系思考模型：不关思考会超时（ISSUES 2026-10-23）
        messages: [
          { role: 'system', content: buildSystem(card) },
          { role: 'user', content: buildUser(ctx) },
        ],
      };
    } else {
      url = /\/v1\/messages$/.test(base) ? base : `${base}/v1/messages`;
      headers = {
        'content-type': 'application/json',
        'x-api-key': process.env.AI_API_KEY,
        'authorization': `Bearer ${process.env.AI_API_KEY}`,
        'anthropic-version': '2023-06-01',
      };
      body = {
        model: process.env.AI_MODEL,
        max_tokens: 200,
        temperature: 0.8,
        system: buildSystem(card),
        messages: [{ role: 'user', content: buildUser(ctx) }],
      };
    }
    const res = await fetch(url, { method: 'POST', signal: ac.signal, headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`ai http ${res.status}`);
    const data = await res.json();
    let text = '';
    if (protocol === 'openai') {
      const m = (data.choices && data.choices[0] && data.choices[0].message) || {};
      text = String(m.content || ''); // reasoning_content 一律忽略
    } else {
      const parts = Array.isArray(data.content) ? data.content : [];
      text = parts.filter((p) => p && p.type === 'text').map((p) => p.text).join('\n');
    }
    text = text.trim();
    if (!text) throw new Error('ai empty');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// 清洗 AI 输出：去引号/Markdown，截到 MAX_LEN
function clean(text) {
  let t = String(text).replace(/[*#>`"“”「」]/g, '').trim();
  const lines = t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const isPoem = lines.length >= 2 && lines.length <= 4 && lines.every((l) => l.length <= 16);
  if (isPoem) return lines.join('\n');
  t = lines.join('');
  if (t.length > MAX_LEN) t = t.slice(0, MAX_LEN - 1) + '…';
  return t;
}

// ctx 白名单清洗（审查 L22 / PRD-v2）：客户端字符串进 prompt 前只留安全字符并截断
function sanitizeCtx(ctx) {
  const clean = (v, max) => String(v == null ? '' : v).replace(/[^一-龥a-zA-Z0-9·、，。！？]/g, '').slice(0, max);
  const out = ctx && typeof ctx === 'object' ? { ...ctx } : {};
  if (Array.isArray(out.route)) out.route = out.route.slice(0, 8).map((s) => clean(s, 12)).filter(Boolean);
  else if (out.route != null) out.route = clean(out.route, 24);
  if (out.place != null) out.place = clean(out.place, 12);
  if (Array.isArray(out.tags)) out.tags = out.tags.slice(0, 8).map((s) => clean(s, 6)).filter(Boolean);
  if (out.playerName != null) out.playerName = clean(out.playerName, 12);
  return out;
}

// 主入口：返回 { text, source:'ai'|'template', who }
async function generate(who, ctx, log) {
  ctx = sanitizeCtx(ctx && typeof ctx === 'object' ? ctx : {});
  const card = findCard(who) || BUILTIN.subuqing;
  const fallback = () => ({ text: templateText(card, ctx), source: 'template', who: card.id || who });
  if (!aiConfigured()) return fallback();
  try {
    const raw = await callAI(card, ctx);
    const safe = filter.filterAI(clean(raw));
    if (!safe) {
      if (log) log('ai output blocked by filter');
      return fallback();
    }
    return { text: safe, source: 'ai', who: card.id || who };
  } catch (e) {
    if (log) log(`ai fallback: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    return fallback();
  }
}

// 进店游客感想（10/25）：到店时队伍里 AI 游客的一句真实感想。与名人生成同一 HTTP 通道、
// 同一过滤与超时；无 AI env 或失败 → 通用模板，由调用方再兜底本地池。
const SHOP_CARD = {
  id: 'shop_traveler', name: '队伍里的游客', title: '旅行者',
  bio: [
    '你是旅行队伍里的一位游客，刚跟导游走进温州的一家真实店铺。',
    '只对这家店本身和当下感受发言：可以馋、可以想买、可以嫌人多、可以夸氛围。',
    '不编造店内没有的东西（菜名、价格、招牌），不做广告腔，不评价老板。',
  ],
  tone: '口语、短句、带情绪，像随口说的一句话',
  templates: [
    '{place}？闻着就有点馋了。',
    '这家看着挺有味道，进去转转。',
    '走走走，正好歇会儿。',
  ],
};

// shopFeedback(shopName, ctx, log) → { text, source:'ai'|'template' }
async function shopFeedback(shopName, ctx, log) {
  ctx = ctx && typeof ctx === 'object' ? ctx : {};
  ctx.place = shopName;
  const fallback = () => ({ text: templateText(SHOP_CARD, ctx), source: 'template' });
  if (!aiConfigured()) return fallback();
  try {
    const raw = await callAI(SHOP_CARD, ctx);
    const safe = filter.filterAI(clean(raw));
    if (!safe) {
      if (log) log('shop feedback blocked by filter');
      return fallback();
    }
    return { text: safe, source: 'ai' };
  } catch (e) {
    if (log) log(`shop feedback fallback: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
    return fallback();
  }
}

module.exports = { generate, templateText, findCard, aiConfigured, sanitizeCtx, BUILTIN, AI_TIMEOUT_MS, shopFeedback };
