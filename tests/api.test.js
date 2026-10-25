'use strict';
// 后端 API 集成测试：spawn server/index.js 到临时 DB + 随机端口，用 fetch 逐个接口验证。
// 运行：node tests/api.test.js（或在 server/ 下 npm test）

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server', 'index.js');
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wz-api-'));
const DB_PATH = path.join(TMP, 'test.db');

let child;
let childLog = '';

async function waitHealthy(ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch (_) { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`服务未在 ${ms}ms 内就绪\n${childLog}`);
}

async function api(method, p, body, headers = {}) {
  const r = await fetch(BASE + p, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await r.json(); } catch (_) { /* 非 JSON */ }
  return { status: r.status, json };
}

before(async () => {
  // 清掉 AI 相关 env，确保走模板分支（置空而非 delete：server/.env 只在 undefined 时才填充）
  const env = { ...process.env, PORT: String(PORT), DB_PATH,
    AI_BASE_URL: '', AI_API_KEY: '', AI_MODEL: '' };
  child = spawn(process.execPath, [SERVER], { env, cwd: path.dirname(SERVER), stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => { childLog += d; });
  child.stderr.on('data', (d) => { childLog += d; });
  await waitHealthy();
});

after(() => {
  if (child) child.kill();
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) { /* Windows 上文件可能仍被占用 */ }
});

// 不同用例使用不同 X-Real-IP，避免互相触发限流
const IP = (name) => ({ 'x-real-ip': `10.0.0.${name}` });

test('health 返回 ok 与 version', async () => {
  const { status, json } = await api('GET', '/api/health');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.ok(json.version);
});

test('troubles：合法写入', async () => {
  const { status, json } = await api('POST', '/api/troubles', { seat: 'seatAAAA', tag: 'walk', text: '脚底板磨出泡了' }, IP(1));
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.ok(Number.isInteger(json.id) && json.id > 0);
  assert.equal(json.replaced, false);
});

test('troubles：非法 tag → 400', async () => {
  const { status, json } = await api('POST', '/api/troubles', { seat: 'seatAAAA', tag: 'sleep', text: '困了' }, IP(1));
  assert.equal(status, 400);
  assert.equal(json.ok, false);
  assert.equal(json.error, 'bad_tag');
});

test('troubles：超过 20 字 → 400（10/24 起一句话 20 字）', async () => {
  const { status, json } = await api('POST', '/api/troubles', { seat: 'seatAAAA', tag: 'walk', text: '一二三四五六七八九十一二三四五六七八九十多' }, IP(1));
  assert.equal(status, 400);
  assert.equal(json.error, 'bad_text');
});

test('troubles：座位不是 8 位 → 400', async () => {
  const { status, json } = await api('POST', '/api/troubles', { seat: 'abc', tag: 'walk', text: '累' }, IP(1));
  assert.equal(status, 400);
  assert.equal(json.error, 'bad_seat');
});

test('troubles：敏感词替换为该 tag 默认句', async () => {
  const filter = require('../server/filter.js');
  const { status, json } = await api('POST', '/api/troubles', { seat: 'seatBBBB', tag: 'food', text: '傻逼店难吃' }, IP(1));
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.replaced, true);
  // fallbackFor 会优先取 content/badwords.js 的 fallbackByTag，缺失时用内置表
  assert.equal(json.text, filter.fallbackFor('food'));
  assert.notEqual(json.text, '傻逼店难吃');
});

test('sample：排除 exclude 座位且补齐到 n', async () => {
  // seatBBBB 再写一条，使库里 seatBBBB 有 2 条、seatAAAA 有 1 条
  await api('POST', '/api/troubles', { seat: 'seatBBBB', tag: 'rush', text: '晚上要赶高铁' }, IP(2));

  const { status, json } = await api('GET', '/api/troubles/sample?n=5&exclude=seatAAAA');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.items.length, 5);
  for (const it of json.items) {
    assert.ok(['walk', 'food', 'crowd', 'shop', 'bored', 'rush', 'toilet', 'any'].includes(it.tag));
    assert.ok(typeof it.text === 'string' && it.text.length > 0);
    assert.notEqual(it.text, '脚底板磨出泡了', '不应出现 exclude 座位自己的困扰');
  }
  // 库里非 exclude 的只有 seatBBBB 的两条，必然被抽到；其余由种子补齐
  const texts = json.items.map((i) => i.text);
  assert.ok(texts.includes('晚上要赶高铁'));

  // n 超界被钳到 10
  const big = await api('GET', '/api/troubles/sample?n=99&exclude=seatAAAA');
  assert.equal(big.json.items.length, 10);
});

test('mine：被分配与带回统计', async () => {
  // seatCCCC 抽样（排除自己）→ seatAAAA 的那条会被分配给 seatCCCC
  const s = await api('GET', '/api/troubles/sample?n=5&exclude=seatCCCC');
  assert.equal(s.json.ok, true);
  // seatCCCC 结束一局，无人丢失
  const r = await api('POST', '/api/runs', {
    seat: 'seatCCCC',
    result: { broughtBack: 5, total: 5, remembered: 1, arriveMin: 1000, overtime: false, lost: [], guestLines: [], title: '赶路人', playerName: '小C' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);

  const { status, json } = await api('GET', '/api/mine?seat=seatAAAA');
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.text, '脚底板磨出泡了');
  assert.ok(json.assigned >= 1, `assigned 应 ≥1，实际 ${json.assigned}`);
  assert.ok(json.broughtHome >= 1, `broughtHome 应 ≥1，实际 ${json.broughtHome}`);

  const none = await api('GET', '/api/mine?seat=seatZZZZ');
  assert.equal(none.json.ok, true);
  assert.equal(none.json.text, null);
  assert.equal(none.json.assigned, 0);

  const bad = await api('GET', '/api/mine?seat=x');
  assert.equal(bad.status, 400);
});

test('mine：result.troubles 按 (tag,text) 映射 brought_home', async () => {
  // 两位真人各写一条，被 seatDDDD 抽到
  await api('POST', '/api/troubles', { seat: 'seatEEEE', tag: 'toilet', text: '憋了一上午' }, IP(3));
  await api('POST', '/api/troubles', { seat: 'seatFFFF', tag: 'shop', text: '鸭舌还没买' }, IP(3));
  const s = await api('GET', '/api/troubles/sample?n=5&exclude=seatDDDD');
  const texts = s.json.items.map((i) => i.text);
  assert.ok(texts.includes('憋了一上午') && texts.includes('鸭舌还没买'));

  // 抽样后尚未结算，assigned 不变（只有绑定了 run 的分配才计数）
  const before = (await api('GET', '/api/mine?seat=seatAAAA')).json.assigned;
  assert.equal(before, 1, '仅 seatCCCC 那局已结算');

  // seatDDDD 结束一局：只有这两条真正入队（模拟前端抽 size+3 但只用部分）；
  // 憋不住带回了，买买买丢了；lost 里给的是 guestId（服务端不认识）
  const r = await api('POST', '/api/runs', {
    seat: 'seatDDDD',
    result: {
      broughtBack: 4, total: 5, remembered: 2, arriveMin: 950, overtime: false, lost: ['g4'],
      guestLines: [{ id: 'g4', name: '买买买', text: '店门口再见' }], playerName: '小D',
      troubles: s.json.items
        .filter((i) => ['憋了一上午', '鸭舌还没买'].includes(i.text))
        .map((i) => ({ tag: i.tag, text: i.text, lost: i.text === '鸭舌还没买' })),
    },
  });
  assert.equal(r.json.ok, true);

  // 未出现在 result.troubles 里的分配被删除：seatAAAA 的 assigned 不因本局增加（REVIEW M4）
  const after = (await api('GET', '/api/mine?seat=seatAAAA')).json.assigned;
  assert.equal(after, before, '未入队的分配不应计入 assigned');

  const e = await api('GET', '/api/mine?seat=seatEEEE');
  assert.equal(e.json.text, '憋了一上午');
  assert.equal(e.json.assigned, 1);
  assert.equal(e.json.broughtHome, 1, '未丢失 → broughtHome=1');

  const f = await api('GET', '/api/mine?seat=seatFFFF');
  assert.equal(f.json.assigned, 1);
  assert.equal(f.json.broughtHome, 0, 'troubles.lost=true → broughtHome=0');
});

test('runs 写入与 boards 排序', async () => {
  const mk = (seat, o) => api('POST', '/api/runs', { seat, result: { total: 5, guestLines: [], ...o } });
  assert.equal((await mk('seat0001', { remembered: 5, arriveMin: 900, broughtBack: 5, overtime: false, lost: [], playerName: '甲' })).json.ok, true);
  assert.equal((await mk('seat0002', { remembered: 3, arriveMin: 800, broughtBack: 4, overtime: false, lost: ['g2'], playerName: '乙' })).json.ok, true);
  assert.equal((await mk('seat0003', { remembered: 5, arriveMin: 850, broughtBack: 5, overtime: true, lost: [], playerName: '丙' })).json.ok, true);
  assert.equal((await mk('seat0004', { remembered: 2, arriveMin: 700, broughtBack: 3, overtime: false, lost: ['g1', 'g3'], playerName: '丁' })).json.ok, true);

  const bad = await api('POST', '/api/runs', { seat: 'seat0001', result: 'nope' });
  assert.equal(bad.status, 400);

  const { status, json } = await api('GET', '/api/boards');
  assert.equal(status, 200);
  assert.equal(json.ok, true);

  // remembered：remembered desc, arrive_min asc → 丙(5,850) 在 甲(5,900) 前，乙(3) 在后
  const rem = json.remembered.map((r) => r.name);
  assert.ok(rem.indexOf('丙') < rem.indexOf('甲'));
  assert.ok(rem.indexOf('甲') < rem.indexOf('乙'));
  assert.ok(json.remembered.length <= 20);

  // fastest：仅 brought_back==total 且 !overtime → 甲(900), 小C(1000)；乙(未全带回)与丙(超时)不入榜
  const fast = json.fastest.map((r) => r.name);
  assert.deepEqual(fast, ['甲', '小C']);
  assert.equal(json.fastest[0].value, 900);

  // lost：lost_count desc, id asc → 丁(2)，然后 小D(1，上一用例写入) 与 乙(1)；无丢失者不入榜
  const lost = json.lost.map((r) => r.name);
  assert.deepEqual(lost, ['丁', '小D', '乙']);
  assert.equal(json.lost[0].value, 2);

  // seat 只返回前 4 位；字段齐全
  for (const row of [...json.remembered, ...json.fastest, ...json.lost]) {
    assert.equal(row.seat.length, 4);
    assert.ok('name' in row && 'value' in row && 'at' in row);
  }
});

test('celebrity：无 AI env 时返回 template 且 ≤3.5 秒', async () => {
  const t0 = Date.now();
  const { status, json } = await api('POST', '/api/celebrity', {
    who: 'xielingyun',
    ctx: { playerName: '阿温', route: ['五马街', '墨池公园'], tags: ['walk', 'rush'], place: '墨池公园', stage: 2 },
  });
  const dt = Date.now() - t0;
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.source, 'template');
  assert.ok(typeof json.text === 'string' && json.text.length > 0);
  assert.ok(!json.text.includes('{name}') && !json.text.includes('{place}') && !json.text.includes('{route}'), '占位符应被替换');
  assert.ok(dt <= 3500, `耗时 ${dt}ms 超过 3.5s`);

  // 未知名人也不报错（兜底人设）
  const unk = await api('POST', '/api/celebrity', { who: 'nobody', ctx: {} });
  assert.equal(unk.json.ok, true);
  assert.equal(unk.json.source, 'template');

  const bad = await api('POST', '/api/celebrity', {});
  assert.equal(bad.status, 400);
});

test('限流：同一 IP 第 11 次 POST /api/troubles → 429', async () => {
  let last;
  for (let i = 1; i <= 11; i++) {
    last = await api('POST', '/api/troubles', { seat: 'seatRATE', tag: 'any', text: `第${i}次` }, IP(77));
    if (i <= 10) assert.equal(last.status, 200, `第 ${i} 次应 200`);
  }
  assert.equal(last.status, 429);
  assert.equal(last.json.ok, false);
  assert.equal(last.json.error, 'rate_limited');
  // 其它 IP 不受影响
  const other = await api('POST', '/api/troubles', { seat: 'seatRATE', tag: 'any', text: '别的IP' }, IP(78));
  assert.equal(other.status, 200);
});

test('限流：celebrity 6/min、runs 20/min', async () => {
  let last;
  for (let i = 1; i <= 7; i++) {
    last = await api('POST', '/api/celebrity', { who: 'su_buqing', ctx: { playerName: '刷' } }, IP(88));
    if (i <= 6) assert.equal(last.status, 200, `celebrity 第 ${i} 次应 200`);
  }
  assert.equal(last.status, 429);

  const result = { total: 5, broughtBack: 5, remembered: 0, arriveMin: 1024, overtime: false, lost: [], guestLines: [] };
  for (let i = 1; i <= 21; i++) {
    last = await api('POST', '/api/runs', { seat: 'seatSPAM', result }, IP(89));
    if (i <= 20) assert.equal(last.status, 200, `runs 第 ${i} 次应 200`);
  }
  assert.equal(last.status, 429);
  assert.equal(last.json.error, 'rate_limited');
});

test('celebrity：配置 AI 时走 AI；超时与敏感输出回退模板', async (t) => {
  const http = require('node:http');
  // mock Anthropic /v1/messages：按 user 内容里的玩家名决定行为
  const mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let user = '';
      try { user = JSON.parse(body).messages[0].content; } catch (_) { /* 忽略 */ }
      if (user.includes('SLOW')) return; // 不响应 → 触发 3 秒超时
      const text = user.includes('BAD') ? '傻逼，你走错路了' : '阿温，池塘生春草，墨池的水还等着你。';
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ type: 'message', role: 'assistant', content: [{ type: 'text', text }] }));
    });
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const mockPort = mock.address().port;

  const port2 = PORT + 1;
  const env = { ...process.env, PORT: String(port2), DB_PATH: path.join(TMP, 'ai.db'),
    AI_PROTOCOL: 'anthropic',  // mock 按 Anthropic 格式应答；固定协议，不受本机 .env 影响
    AI_BASE_URL: `http://127.0.0.1:${mockPort}`, AI_API_KEY: 'test-key', AI_MODEL: 'mock-model' };
  const child2 = spawn(process.execPath, [SERVER], { env, cwd: path.dirname(SERVER), stdio: ['ignore', 'pipe', 'pipe'] });
  let log2 = '';
  child2.stdout.on('data', (d) => { log2 += d; });
  child2.stderr.on('data', (d) => { log2 += d; });
  t.after(() => { child2.kill(); mock.close(); });

  const base2 = `http://127.0.0.1:${port2}`;
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    try { if ((await fetch(`${base2}/api/health`)).ok) break; } catch (_) { /* 未就绪 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const post = async (playerName) => {
    const r = await fetch(`${base2}/api/celebrity`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ who: 'xie_lingyun', ctx: { playerName, route: ['五马街'], tags: [], place: '墨池公园', stage: 1 } }),
    });
    return r.json();
  };

  const ok = await post('阿温');
  assert.equal(ok.ok, true, log2);
  assert.equal(ok.source, 'ai');
  assert.ok(ok.text.includes('阿温'));
  assert.ok(Array.from(ok.text).length <= 60);

  const bad = await post('BAD');
  assert.equal(bad.source, 'template', 'AI 输出命中敏感词应回退模板');
  assert.ok(!bad.text.includes('傻逼'));

  const t1 = Date.now();
  const slow = await post('SLOW');
  const dt = Date.now() - t1;
  assert.equal(slow.source, 'template', '超时应回退模板');
  assert.ok(dt >= 2500 && dt <= 4500, `超时回退耗时 ${dt}ms，应约 3s`);
});

test('静态与根路径：/ → 302 /play/；/api 未知路径 → 404 JSON', async () => {
  const root = await fetch(`${BASE}/`, { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/play/');
  // 不带斜杠的 /play → 301 /play/（index.html 相对路径 ../content 依赖尾斜杠）
  const play = await fetch(`${BASE}/play`, { redirect: 'manual' });
  assert.equal(play.status, 301);
  assert.equal(play.headers.get('location'), '/play/');
  const playSlash = await fetch(`${BASE}/play/`);
  assert.equal(playSlash.status, 200);
  const nf = await api('GET', '/api/nothing');
  assert.equal(nf.status, 404);
  assert.equal(nf.json.ok, false);
});

// ---------- PRD-v4：带队积分（EVAL-v4 §1b） ----------
test('PRD-v4：/api/runs 的 score 校验（123→200；abc/9999→400 bad_score）', async () => {
  const good = await api('POST', '/api/runs', { seat: 'scoreOK1', result: { score: 123, remembered: 3, arriveMin: 500, overtime: false, lost: [], broughtBack: 4, total: 5, playerName: '评分员' } });
  assert.equal(good.status, 200);
  assert.equal(good.json.ok, true);
  const abc = await api('POST', '/api/runs', { seat: 'scoreOK1', result: { score: 'abc' } });
  assert.equal(abc.status, 400);
  assert.equal(abc.json.error, 'bad_score');
  const big = await api('POST', '/api/runs', { seat: 'scoreOK1', result: { score: 9999 } });
  assert.equal(big.status, 400);
  assert.equal(big.json.error, 'bad_score');
});

test('PRD-v4：boards 含 score 榜（不改变原有三榜排序）', async () => {
  const b = await api('GET', '/api/boards');
  assert.equal(b.status, 200);
  assert.ok(Array.isArray(b.json.score), 'score 榜应存在');
  assert.ok(Array.isArray(b.json.remembered) && Array.isArray(b.json.fastest) && Array.isArray(b.json.lost));
});
