// net.js —— 联网层（Lead 拥有）。所有请求 2.5 秒超时；失败静默切本机种子；file:// 下完全离线。
window.WZ = window.WZ || {};
(function () {
  const TIMEOUT = 2500;
  const BASE = '/api';
  const offlineOnly = location.protocol === 'file:';
  let online = !offlineOnly;

  function seat() {
    let s = localStorage.getItem('wz_seat');
    if (!s) {
      s = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
      localStorage.setItem('wz_seat', s);
    }
    return s;
  }

  async function req(method, path, body, timeout) {
    if (offlineOnly) throw new Error('offline');
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout || TIMEOUT);
    try {
      const r = await fetch(BASE + path, {
        method, signal: ctl.signal,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json();
      if (!j || j.ok === false) throw new Error((j && j.error) || 'bad response');
      online = true;
      return j;
    } catch (e) {
      online = false;
      throw e;
    } finally { clearTimeout(t); }
  }

  function seeds() {
    const c = (WZ.content && WZ.content.seedTroubles) || [];
    return c.length ? c : [
      { tag: 'walk', text: '一天两万步' }, { tag: 'food', text: '太清淡吃不惯' },
      { tag: 'crowd', text: '排队两个半小时' }, { tag: 'shop', text: '临走没买手信' },
      { tag: 'bored', text: '逛半天没记住啥' }, { tag: 'rush', text: '一直在赶车' },
      { tag: 'toilet', text: '找不到厕所' },
    ];
  }

  function pickSeeds(n) {
    const pool = seeds().slice();
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }

  // 未上传的困扰队列
  function pending() { try { return JSON.parse(localStorage.getItem('wz_pending') || '[]'); } catch (e) { return []; } }
  function setPending(a) { localStorage.setItem('wz_pending', JSON.stringify(a)); }

  async function flushPending() {
    const q = pending();
    if (!q.length) return;
    const left = [];
    for (const item of q) {
      try { await req('POST', '/troubles', item); } catch (e) { left.push(item); }
    }
    setPending(left);
  }

  WZ.net = {
    get online() { return online; },
    seat,

    async postTrouble(tag, text) {
      const item = { seat: seat(), tag, text };
      localStorage.setItem('wz_my_trouble', JSON.stringify(item));
      try { await req('POST', '/troubles', item); }
      catch (e) { const q = pending(); q.push(item); setPending(q); }
      flushPending().catch(() => {});
    },

    // 返回 [{tag,text}]，永远凑够 n 条
    async sampleTroubles(n) {
      try {
        const j = await req('GET', `/troubles/sample?n=${n}&exclude=${seat()}`);
        const items = (j.items || []).filter(x => x && x.tag && x.text);
        if (items.length >= n) return items.slice(0, n);
        return items.concat(pickSeeds(n - items.length));
      } catch (e) { return pickSeeds(n); }
    },

    async postRun(result) {
      try { await req('POST', '/runs', { seat: seat(), result }); } catch (e) { /* 静默 */ }
    },

    async boards() {
      try { return await req('GET', '/boards'); } catch (e) { return null; }
    },

    async mine() {
      try { return await req('GET', `/mine?seat=${seat()}`); } catch (e) { return null; }
    },

    // 名人 AI：失败交回规则层用模板。ctx.content 只在客户端兜底用（M2），服务端读自己的
    // content/celebrities.js，不上传——否则整个内容库塞进请求体会撑爆 32kb 限制（冒烟实测 413）
    celebrity(who, ctx, cb) {
      const slim = {};
      for (const k in ctx) if (k !== 'content') slim[k] = ctx[k];
      req('POST', '/celebrity', { who, ctx: slim }, 3200)
        .then(j => cb(null, { text: j.text, source: j.source || 'ai' }))
        .catch(err => cb(err));
    },

    // 进店游客感想（10/25）：失败返回 null，调用方走本地池兜底
    async shopFeedback(shop, ctx) {
      const slim = {};
      for (const k in (ctx || {})) if (k !== 'content') slim[k] = ctx[k];
      try {
        const j = await req('POST', '/shop-feedback', { shop, ctx: slim }, 3200);
        return j && j.text ? { text: j.text, source: j.source || 'ai' } : null;
      } catch (e) { return null; }
    },
  };
})();
