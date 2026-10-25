// tests/smoke-run.js —— A6 浏览器冒烟（QA）。直接 `node tests/smoke-run.js`，退出码 0=全过。
// 手机视口 390×844、DPR 2、触屏；联网一局半（含结尾/升华屏/再来一局）+ file:// 断网一局。
// 产物：artifacts/0x_*.png、artifacts/smoke-report.md。
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.WZ_PLAYWRIGHT || 'playwright'); // 原机器用 WZ_PLAYWRIGHT 指绝对路径；本机装了 npm 包
// 本机（Darwin 27）自带 chromium_headless_shell 画 canvas 会卡死，用 WZ_CHANNEL=chrome（系统 Chrome）或 WZ_EXEC 指定可执行文件绕过
const LAUNCH_OPTS = {
  ...(process.env.WZ_CHANNEL ? { channel: process.env.WZ_CHANNEL } : {}),
  ...(process.env.WZ_EXEC ? { executablePath: process.env.WZ_EXEC } : {}),
};

const ROOT = path.resolve(__dirname, '..');
const ART = path.join(ROOT, 'artifacts');
const BASE = process.env.WZ_BASE || 'http://127.0.0.1:8791';
const FILE_URL = 'file:///' + path.join(ROOT, 'web', 'index.html').replace(/\\/g, '/');
const POLL = 500;
const STALL_MS = 60000;
fs.mkdirSync(ART, { recursive: true });

// ---------- 报告 ----------
const report = { steps: [], extra: [], errors: {}, startedAt: Date.now() };
function log(tag, msg) { console.log(`[${((Date.now() - report.startedAt) / 1000).toFixed(1)}s][${tag}] ${msg}`); }
async function step(tag, name, fn, suspects) {
  const t0 = Date.now();
  const rec = { tag, name, ok: false, ms: 0, error: '', suspects: suspects || '' };
  try { rec.note = await fn(); rec.ok = true; }
  catch (e) { rec.error = (e && e.stack) || String(e); }
  rec.ms = Date.now() - t0;
  report.steps.push(rec);
  log(tag, `${rec.ok ? 'PASS' : 'FAIL'} ${name} (${rec.ms}ms)${rec.ok ? (rec.note ? ' — ' + rec.note : '') : '\n    ' + rec.error.split('\n').slice(0, 3).join('\n    ')}`);
  return rec.ok;
}
function check(tag, name, ok, detail, suspects) {
  report.extra.push({ tag, name, ok: !!ok, detail: detail || '', suspects: suspects || '' });
  log(tag, `${ok ? 'OK  ' : 'BAD '} ${name}${detail ? ' — ' + detail : ''}`);
}

// ---------- 页面探针 ----------
const INIT_SCRIPT = `
  window.__wz = { epi: 0, celeb: [], ending: 0, result: 0, interrupts: 0, stays: 0 };
  document.addEventListener('DOMContentLoaded', () => {
    const ov = document.getElementById('overlay'), dock = document.getElementById('dock');
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (!(n instanceof Element)) return;
      if (n.classList.contains('epi')) __wz.epi++;
      if (n.classList.contains('ending')) __wz.ending++;
      if (n.classList.contains('page-result')) __wz.result++;
      if (n.classList.contains('page-celeb')) __wz.celeb.push(n.innerText);
    }))).observe(ov, { childList: true });
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (!(n instanceof Element)) return;
      if (n.classList.contains('interrupt')) __wz.interrupts++;
      if (n.classList.contains('stay-card')) __wz.stays++;
    }))).observe(dock, { childList: true });
  });
`;

async function probe(page) {
  return page.evaluate(() => {
    const r = WZ.main && WZ.main.run; const s = r && r.state;
    const ov = document.getElementById('overlay'), dock = document.getElementById('dock');
    const vis = el => !!el && !el.hidden && el.offsetParent !== null;
    const btns = [...document.querySelectorAll('button')].filter(vis).map(b => b.textContent.trim().replace(/\s+/g, ' '));
    const pageEl = ov.hidden ? null : ov.querySelector('.page');
    return {
      clock: s ? s.clockMin : null, ended: s ? !!s.ended : null, pi: s && s.pendingInterrupt ? s.pendingInterrupt.id : null,
      guests: s ? s.guests.map(g => `${g.tag}:${g.status}:${g.hearts}`).join(' ') : '',
      pos: WZ.engine.getPlayerPos(), pageCls: pageEl ? pageEl.className : '',
      overlayText: ov.hidden ? '' : ov.innerText.slice(0, 400), dockText: dock.innerText.slice(0, 300),
      hasInterrupt: !!dock.querySelector('.interrupt'), hasStay: !!dock.querySelector('.stay-card'), hasQuiz: !!dock.querySelector('.quiz-dlg .qd-skip'),
      celebReady: !!(pageEl && pageEl.classList.contains('page-celeb') && pageEl.querySelector('.celeb-foot.ready')),
      btns, probe: window.__wz,
    };
  });
}

function makeCtxLogger(tag, page) {
  const errs = report.errors[tag] = { pageerror: [], console: [], http: [] };
  page.on('pageerror', e => { errs.pageerror.push(String(e && e.stack || e)); log(tag, 'PAGEERROR ' + e); });
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text(), url = (m.location() && m.location().url) || '';
    if (/\/assets\/[^/]+\.png/.test(t + ' ' + url)) return; // 可选精灵图缺失（契约允许）
    errs.console.push(t + (url ? ` @ ${url}` : '')); log(tag, 'CONSOLE.ERROR ' + t + ' @ ' + url);
  });
  page.on('response', r => {
    if (r.status() >= 400 && !/\/assets\/[^/]+\.png$/.test(r.url())) { errs.http.push(`${r.status()} ${r.url()}`); log(tag, `HTTP ${r.status()} ${r.url()}`); }
  });
  page.on('requestfailed', r => {
    if (/\/assets\/[^/]+\.png$/.test(r.url())) return;
    // 背景乐切场景会中止在途媒体请求（net::ERR_ABORTED 是浏览器正常行为，music.js 已静默处理），不算错误；缺文件仍计错
    if (/\/assets\/music\//.test(r.url()) && r.failure() && r.failure().errorText === 'net::ERR_ABORTED') return;
    errs.http.push(`FAILED ${r.url()} ${r.failure() && r.failure().errorText}`); log(tag, 'REQFAILED ' + r.url());
  });
  return errs;
}

async function shot(page, name) { const p = path.join(ART, name); await page.screenshot({ path: p }); log('shot', name); return p; }

// ---------- 流程片段 ----------
async function doIntro(page, tag, name, text) {
  await page.locator('.page-intro .tag').first().waitFor({ timeout: 10000 });
  await page.locator('.page-intro .tag', { hasText: tag }).first().click();
  const inputs = page.locator('.page-intro input.input');
  await inputs.nth(0).fill(text);
  await inputs.nth(1).fill(name);
  const go = page.getByRole('button', { name: /带队出发/ });
  if (await go.isDisabled()) throw new Error('带队出发按钮仍禁用');
  await go.click();
}

async function doTeam(page, tag) {
  await page.locator('.page-team').waitFor({ timeout: 10000 });
  await page.waitForTimeout(900); // 等卡片入场动画
  const text = await page.locator('.page-team').innerText();
  const n = await page.locator('.page-team .guest-card').count();
  log(tag, `接团页：${n} 位游客\n    ` + text.replace(/\n+/g, ' | ').slice(0, 300));
  return { n, text };
}

async function doRoute(page, tag, ids) {
  await page.getByRole('button', { name: /出发前排个路线/ }).click();
  await page.locator('.page-plan').waitFor({ timeout: 10000 });
  const names = await page.evaluate(ids => ids.map(id => (WZ.content.places.find(p => p.id === id) || {}).name), ids);
  for (const nm of names) {
    if (!nm) throw new Error('地点缺失：' + ids);
    await page.locator('.page-plan .place', { hasText: nm }).first().click();
  }
  const cnt = await page.locator('.page-plan .book-head b').innerText();
  const pv = await page.locator('.page-plan .book-guests').innerText();
  log(tag, `路线 ${names.join('→')}，计数 ${cnt}，预览：${pv.replace(/\n+/g, ' ')}`);
  const go = page.locator('.page-plan .book-go');
  if (await go.isDisabled()) throw new Error('出发按钮禁用，计数=' + cnt);
  await go.click();
  // 10/24 #6：出发二次确认「这一天就这样定了吗？」
  const yes = page.locator('.confirm button', { hasText: '就这么走' });
  await yes.waitFor({ timeout: 5000 });
  log(tag, '确认框：' + (await page.locator('.confirm').innerText()).replace(/\n+/g, ' ').slice(0, 120));
  await yes.click();
  return names;
}

// 游戏中轮询驱动；返回退出原因
async function drive(page, tag, opts) {
  const { goHomeAt, stopAt, maxMs } = Object.assign({ goHomeAt: 700, stopAt: Infinity, maxMs: 300000 }, opts);
  let lastClock = -1, lastAdvance = Date.now(), lastPos = null, interruptFlip = 0, goHomeSent = 0, celebSeen = 0;
  const t0 = Date.now();
  const stats = { interrupts: 0, stays: 0, celebs: 0, maxClock: 0 };
  while (true) {
    if (Date.now() - t0 > maxMs) throw new Error('drive 超时 ' + maxMs + 'ms');
    const s = await probe(page);
    if (s.clock == null) throw new Error('run.state 不存在');
    stats.maxClock = Math.max(stats.maxClock, s.clock);
    if (s.clock !== lastClock) { lastClock = s.clock; lastAdvance = Date.now(); }

    // 结尾 / 结算 / 升华屏出现 → 交给外层
    if (/\bending\b/.test(s.pageCls) || /page-result|\bepi\b|page-diff/.test(s.pageCls)) return { reason: 'overlay:' + s.pageCls, stats, s };
    if (s.ended && !s.pageCls && !s.hasInterrupt && !s.hasStay) {
      // end 已发但页面还没出：等一会
      await page.waitForTimeout(POLL); continue;
    }

    // 提示词 8：谢公问答对话框（屏幕下方三分之一）
    if (s.hasQuiz) {
      stats.celebs++;
      const qt = await page.locator('.quiz-dlg .qd-say').innerText().catch(() => '');
      log(tag, '谢公问答：' + qt);
      if (!/小友，我谢公考你一句|小友/.test(qt)) throw new Error('问答对话框没有题目文字');
      const o = page.locator('.quiz-dlg .qd-opt');
      if (await o.count()) { await o.first().click().catch(() => {}); await page.waitForTimeout(300); }
      await page.locator('.quiz-dlg .qd-skip').click().catch(() => {});
      await page.waitForTimeout(300);
      continue;
    }
    // 名人卡
    if (/page-celeb/.test(s.pageCls)) {
      if (s.celebReady) {
        stats.celebs++;
        const txt = s.overlayText.replace(/\n+/g, ' ');
        log(tag, `名人卡：${txt.slice(0, 160)}`);
        if (celebSeen === 0) await shot(page, `${tag === 'online' ? '04' : '14'}_celebrity.png`);
        celebSeen++;
        // 名人卡必须走按钮关闭（pick 是唯一释放暂停的路径）：普通卡点「陪他一会儿」，
        // 问答/描字卡点「点头走过」/「跳过」——答错选项卡片不会关，不能点第一个按钮了事
        const pref = ['陪他一会儿', '点头走过', '跳过'];
        let clicked = false;
        for (const label of pref) {
          const b = page.locator('.page-celeb .celeb-foot button', { hasText: label });
          if (await b.count()) { await b.first().click({ timeout: 3000 }); clicked = true; break; }
        }
        if (!clicked) await page.locator('.page-celeb .celeb-foot button').last().click();
        // 点完应收起；1.5 s 还在 → 记 BAD 并强制 WZ.ui.hide() 继续往下测
        const gone = await page.locator('#overlay .page-celeb').waitFor({ state: 'detached', timeout: 1500 }).then(() => true).catch(() => false);
        if (!gone) {
          const still = await page.evaluate(() => !!document.querySelector('#overlay:not([hidden]) .page-celeb'));
          if (still) {
            if (!stats.celebStuck) check(tag, '名人卡点「陪他一会儿」后应收起', false, `卡片仍在屏上（游戏在卡片后面继续跑）；已用 WZ.ui.hide() 兜底。卡：${txt.slice(0, 60)}`, 'main.js(onCelebrity 未调 ui.hide) / ui.js(showCelebrity pick 未自收)');
            stats.celebStuck = (stats.celebStuck || 0) + 1;
            await page.evaluate(() => WZ.ui.hide());
          }
        }
        await page.waitForTimeout(300);
      } else await page.waitForTimeout(200);
      continue;
    }
    // 中断条
    if (s.hasInterrupt) {
      stats.interrupts++;
      const which = interruptFlip++ % 2;
      const bs = page.locator('#dock .interrupt button');
      const title = await page.locator('#dock .interrupt .interrupt-title').innerText().catch(() => '');
      const labels = await bs.allInnerTexts().catch(() => []);
      log(tag, `中断：${title.trim()} [${labels.join(' / ')}] → 选 ${which === 0 ? 'a' : 'b'}`);
      await bs.nth(which).click({ timeout: 3000 }).catch(e => log(tag, '中断按钮点击失败 ' + e.message));
      await page.waitForTimeout(300);
      continue;
    }
    // 停站前台页（PRD-v2 F1）：无定时器，唯一关闭是「继续出发」按钮——直接点它，不再等自动收起
    if (s.hasStay) {
      stats.stays++;
      const txt = s.dockText.replace(/\n+/g, ' ');
      log(tag, `停站卡：${txt.slice(0, 120)}`);
      if (stats.stays === 1) await shot(page, `${tag === 'online' ? '03' : '13'}_stay.png`);
      const sb = page.locator('#dock .stay-card .btn', { hasText: '继续出发' });
      if (await sb.count()) await sb.first().click({ timeout: 3000 }).catch(e => log(tag, '「继续出发」点击失败 ' + e.message));
      else await page.locator('#dock .stay-card button').first().click().catch(() => {});
      await page.waitForTimeout(300);
      continue;
    }
    // 其它未知覆盖层（暂停页等）
    if (s.pageCls) { log(tag, '未知覆盖层：' + s.pageCls + ' 按钮=' + s.btns.join('|')); await page.waitForTimeout(POLL); continue; }

    // 停滞检测
    if (Date.now() - lastAdvance > STALL_MS) {
      await shot(page, `${tag}_stall.png`);
      throw new Error(`clockMin=${s.clock} 60 秒未推进；guests=${s.guests}；pendingInterrupt=${s.pi}；dock=${s.dockText.slice(0, 80)}`);
    }
    if (s.clock >= stopAt) return { reason: 'stopAt', stats, s };

    // 回家：clock≥goHomeAt 且玩家不在移动
    const moving = lastPos && (Math.abs(lastPos.x - s.pos.x) > 0.5 || Math.abs(lastPos.y - s.pos.y) > 0.5);
    lastPos = s.pos;
    if (s.clock >= goHomeAt && !moving && Date.now() - goHomeSent > 8000) {
      goHomeSent = Date.now();
      log(tag, `clock=${s.clock.toFixed(0)} 玩家静止 → engine.goTo('center')`);
      await page.evaluate(() => WZ.engine.goTo('center'));
    } else if (!moving && s.clock < goHomeAt) {
      // F4 适配：时钟只在移动时走——走完路线一站住钟就停。扮演"闲逛的玩家"：先续走路线，走完就随便逛
      const nudged = await page.evaluate(() => {
        const r = WZ.main && WZ.main.run && WZ.main.run.state; if (!r) return '';
        const next = (r.route || []).find(id => !(r.visited || []).includes(id));
        if (next) { WZ.engine.goTo(next); return '路线下一站 ' + next; }
        const ps = ((WZ.content && WZ.content.places) || []).filter(p => p.id !== 'center' && p.id !== r.lastPlaceId);
        if (!ps.length) return '';
        window.__wzWander = (window.__wzWander || 0) + 1;
        const p = ps[window.__wzWander % ps.length];
        WZ.engine.goTo(p.id); return '闲逛 ' + p.id;
      });
      if (nudged) log(tag, `玩家静止 → 代点：${nudged}`);
    }
    await page.waitForTimeout(POLL);
  }
}

// 结尾：黑屏 → 文字 → 点人头 → 两按钮
async function doEnding(page, tag, choice, shotName) {
  const s = await probe(page);
  if (!/\bending\b/.test(s.pageCls)) {
    log(tag, `无结尾页（${s.pageCls || '无覆盖层'}），按契约"无人丢失直接结算"`);
    return { skipped: true };
  }
  const seen = { black: false, t1: false, t2: false, lit: false };
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const st = await page.evaluate(() => {
      const pg = document.querySelector('#overlay .page.ending'); if (!pg) return null;
      const bg = getComputedStyle(pg).backgroundColor;
      return { text: (pg.querySelector('.ending-text') || {}).textContent || '', lit: pg.classList.contains('lit'), bg,
        btnsOn: !!pg.querySelector('.ending-btns.on'), figs: pg.querySelectorAll('.fig').length,
        btns: [...pg.querySelectorAll('.ending-btns button')].map(b => ({ t: b.textContent.trim(), d: b.disabled })) };
    });
    if (!st) break;
    if (!seen.black && !st.lit) { seen.black = true; log(tag, `结尾黑屏 bg=${st.bg}`); await shot(page, shotName + '_black.png'); }
    if (!seen.t1 && /天黑了/.test(st.text)) { seen.t1 = true; log(tag, '文字：天黑了。'); }
    if (!seen.t2 && /队伍回到出发点/.test(st.text)) { seen.t2 = true; log(tag, '文字：队伍回到出发点。'); }
    if (!seen.lit && st.lit) { seen.lit = true; log(tag, `灯亮，人头 ${st.figs} 个`); }
    if (st.btnsOn && st.btns.every(b => !b.d)) {
      await shot(page, shotName + '.png');
      const cost = await page.evaluate(() => { const c = document.querySelector('.ending-btns .cost'); if (!c) return null; const cs = getComputedStyle(c); const bs = getComputedStyle(c.parentElement); return { text: c.textContent, size: cs.fontSize, color: cs.color, btnSize: bs.fontSize }; });
      log(tag, `两按钮：${st.btns.map(b => b.t).join(' | ')}；+64 样式=${JSON.stringify(cost)}`);
      check(tag, '结尾两按钮出现（回去找他 / 继续回家）', st.btns.some(b => /回去找他/.test(b.t)) && st.btns.some(b => /继续回家/.test(b.t)), st.btns.map(b => b.t).join('|'), 'ending.js');
      check(tag, '+64 分钟为小字', cost && parseFloat(cost.size) < parseFloat(cost.btnSize), cost ? `${cost.size} vs 按钮 ${cost.btnSize}，颜色 ${cost.color}` : '无 .cost', 'ending.js/style.css');
      await page.locator('.ending-btns button', { hasText: choice }).click();
      log(tag, `点了「${choice}」`);
      return Object.assign({ seen, cost }, { skipped: false });
    }
    await page.waitForTimeout(250);
  }
  throw new Error('结尾页 30 s 内按钮未就绪：' + JSON.stringify(seen));
}

async function waitResult(page, tag, timeoutMs) {
  await page.locator('#overlay .page-result').waitFor({ timeout: timeoutMs });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const pg = document.querySelector('#overlay .page-result');
    const know = [...pg.querySelectorAll('.res-know li')].map(li => ({ text: li.textContent, hasSrc: !!li.querySelector('.src') }));
    return { text: pg.innerText, know, btns: [...pg.querySelectorAll('button')].map(b => b.textContent.trim()), lines: pg.querySelectorAll('.res-line').length };
  });
}

function assertResult(tag, r) {
  check(tag, '结算含「带回家」', /带回家/.test(r.text), '', 'ui.js');
  check(tag, '结算含「记住你」', /记住你/.test(r.text), '', 'ui.js');
  check(tag, '结算含「到家时刻」', /到家时刻|超时到家/.test(r.text), /到家时刻/.test(r.text) ? '到家时刻' : '显示的是「超时到家」', 'ui.js/rules');
  check(tag, '结算知识 3 条且都带出处', r.know.length === 3 && r.know.every(k => k.hasSrc), `${r.know.length} 条：` + r.know.map(k => k.text.slice(0, 40)).join(' / '), r.know.length < 3 ? 'rules.js(knowledge 收集)/main.js(nextLeg)' : 'ui.js');
}

// ---------- 联网一局半 ----------
async function onlineFlow(browser, ctxOpts) {
  const tag = 'online';
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(() => { try { ['route', 'go', 'book', 'unhappy'].forEach(k => localStorage.setItem('wz_spot_' + k, '1')); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  await page.addInitScript(INIT_SCRIPT);
  const errs = makeCtxLogger(tag, page);
  let celebTexts = [];
  try {
    await step(tag, '打开 /play/ 并出现开局页', async () => {
      const r = await page.goto(BASE + '/play/', { waitUntil: 'load', timeout: 20000 });
      if (!r || r.status() !== 200) throw new Error('HTTP ' + (r && r.status()));
      await page.locator('.page-intro').waitFor({ timeout: 10000 });
      await shot(page, '01_intro.png');
      const t = await page.locator('.page-intro').innerText();
      return t.replace(/\n+/g, ' | ').slice(0, 120);
    }, 'ui.js/server');

    await step(tag, '开局：选标签+填困扰+昵称→带队出发', () => doIntro(page, '怕挤挤', '冒烟员', '人多就头晕'), 'ui.js/main.js/net.js');

    let team;
    await step(tag, '接团页出现 5 位游客', async () => {
      team = await doTeam(page, tag);
      await shot(page, '02_team.png');
      if (team.n !== 5) throw new Error('游客数 ' + team.n + ' ≠ 5');
      if (!/都行|随便/.test(team.text)) throw new Error('队伍里没有都行哥');
      return team.n + ' 人';
    }, 'rules.js/net.js/ui.js');

    await step(tag, '排路线 mochi→xianqian→wuma→pier 并出发', async () => {
      const names = await doRoute(page, tag, ['mochi', 'xianqian', 'wuma', 'pier']);
      // 出发后 startRun 先 await 网络抽样（≤2.5s）才切队伍页，固定 800ms 会误报（本机实测），改为有界等待
      await page.waitForFunction(() => !document.querySelector('#overlay .page-plan'), null, { timeout: 6000 }).catch(() => {});
      const s = await probe(page);
      if (s.pageCls && !/page-celeb/.test(s.pageCls)) throw new Error('出发后仍有覆盖层：' + s.pageCls);
      return names.join('→');
    }, 'ui.js/main.js');

    let d1;
    await step(tag, '第一局游戏中（轮询驱动至结尾）', async () => {
      d1 = await drive(page, tag, { goHomeAt: 700, maxMs: 290000 });
      return `退出=${d1.reason} maxClock=${d1.stats.maxClock.toFixed(0)} 中断=${d1.stats.interrupts} 停站=${d1.stats.stays} 名人=${d1.stats.celebs} guests=${d1.s.guests}`;
    }, 'engine.js/rules.js/main.js');

    let e1;
    await step(tag, '第一局结尾：黑屏→文字→点人头→点「继续回家」', async () => {
      e1 = await doEnding(page, tag, '继续回家', '05_ending');
      return e1.skipped ? '无人丢失，跳过结尾页' : JSON.stringify(e1.seen);
    }, 'ending.js/main.js');

    let r1;
    await step(tag, '第一局结算页断言', async () => {
      r1 = await waitResult(page, tag, 8000);
      await shot(page, '06_result.png');
      assertResult(tag, r1);
      check(tag, '联网时有「我写的那句去哪了」按钮', r1.btns.some(b => /我写的那句去哪了/.test(b)), r1.btns.join('|'), 'main.js/net.js');
      return r1.text.replace(/\n+/g, ' | ').slice(0, 200);
    }, 'ui.js/rules.js');

    await step(tag, '结算后点「再来一局」→ 结尾五幕（提示词 11：一屏一幕、轻点继续、最后［再来一局］）', async () => {
      await page.getByRole('button', { name: /再来一局/ }).click();
      await page.locator('#overlay .page.epi').waitFor({ timeout: 8000 });
      await page.waitForTimeout(1200);
      await shot(page, '05b_epilogue.png');
      const acts = [];
      for (let i = 0; i < 5; i++) {
        acts.push((await page.locator('.epi-box').innerText().catch(() => '')).replace(/\n+/g, ' '));
        if (i < 4) { await page.locator('#overlay .page.epi').click().catch(() => {}); await page.waitForTimeout(700); }
      }
      check(tag, '结尾不含已删除的两句（1024 个游客/名次退了 15 位）', !acts.join('').match(/今晚有 1024 个游客|名次退了/), acts.join(' / ').slice(0, 300), 'content/ending.js');
      check(tag, '第一幕原文', /还记得开场写下的那句话吗/.test(acts[0]), acts[0], 'content/ending.js');
      const again = page.locator('.epi-again');
      await again.waitFor({ timeout: 5000 });
      await page.waitForTimeout(1200);
      await again.click();
      return `五幕：${acts.map(a => a.slice(0, 12)).join(' / ')}`;
    }, 'main.js/ui.js');

    await step(tag, '再来一局 → 难度页，标准/困难已解锁', async () => {
      await page.locator('#overlay .page-diff').waitFor({ timeout: 5000 });
      await shot(page, '07_difficulty.png');
      const diffs = await page.evaluate(() => [...document.querySelectorAll('.page-diff .diff')].map(b => ({ t: b.textContent.trim().replace(/\s+/g, ' '), d: b.disabled })));
      const normal = diffs.find(d => /标准/.test(d.t)), hard = diffs.find(d => /困难/.test(d.t));
      if (!normal || normal.d) throw new Error('标准未解锁：' + JSON.stringify(diffs));
      if (!hard || hard.d) throw new Error('困难未解锁：' + JSON.stringify(diffs));
      await page.locator('.page-diff .diff', { hasText: '初级' }).click();
      return diffs.map(d => d.t + (d.d ? '(锁)' : '')).join(' | ');
    }, 'ui.js/main.js');

    await step(tag, '第二局：接团→路线 3 站(无手信店)→出发→跑到 clockMin>300 → 回家', async () => {
      const team2 = await doTeam(page, tag);
      if (team2.n !== 5) throw new Error('第二局游客数 ' + team2.n);
      await doRoute(page, tag, ['xianqian', 'mochi', 'teastall']); // 不含手信店：若队里有买买买，结尾会丢人，便于走「回去找他」分支
      const d2 = await drive(page, tag, { goHomeAt: 300, maxMs: 200000 });
      if (d2.reason === 'stopAt') throw new Error('不应 stopAt');
      return `退出=${d2.reason} maxClock=${d2.stats.maxClock.toFixed(0)} 中断=${d2.stats.interrupts} 停站=${d2.stats.stays} guests=${d2.s.guests}`;
    }, 'engine.js/rules.js/main.js');

    await step(tag, '第二局结尾：点「回去找他」→ 结算，且无升华屏', async () => {
      const e2 = await doEnding(page, tag, '回去找他', '08_ending2');
      const r2 = await waitResult(page, tag, 12000);
      await shot(page, '09_result2.png');
      assertResult(tag, r2);
      const epi = await page.evaluate(() => window.__wz.epi);
      check(tag, '升华屏全程只出现 1 次（第二局不出现）', epi === 1, `__wz.epi=${epi}`, 'main.js');
      if (!e2.skipped) check(tag, '回去找他后结算显示「你回去了一趟」', /你回去了一趟/.test(r2.text), '', 'ui.js/rules.js');
      return (e2.skipped ? '第二局无人丢失（未能走回去分支）' : '走了回去找他分支') + '；' + r2.text.replace(/\n+/g, ' | ').slice(0, 160);
    }, 'ending.js/ui.js/main.js');

    celebTexts = await page.evaluate(() => window.__wz.celeb).catch(() => []);
  } finally {
    await shot(page, 'online_final.png').catch(() => {});
    await ctx.close().catch(() => {});
  }
  return { errs, celebTexts };
}

// ---------- 断网（file://）一局 ----------
async function offlineFlow(browser, ctxOpts) {
  const tag = 'offline';
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(() => { try { ['route', 'go', 'book', 'unhappy'].forEach(k => localStorage.setItem('wz_spot_' + k, '1')); } catch (e) { /* ignore */ } });
  const page = await ctx.newPage();
  await page.addInitScript(INIT_SCRIPT);
  const errs = makeCtxLogger(tag, page);
  let celebTexts = [];
  try {
    await step(tag, 'file:// 打开 web/index.html 出现开局页', async () => {
      await page.goto(FILE_URL, { waitUntil: 'load', timeout: 20000 });
      await page.locator('.page-intro').waitFor({ timeout: 10000 });
      await shot(page, '11_offline_intro.png');
      const online = await page.evaluate(() => WZ.net.online);
      if (online) throw new Error('file:// 下 WZ.net.online 应为 false');
      return 'WZ.net.online=false';
    }, 'net.js/index.html');
    await step(tag, '开局→接团', async () => {
      await doIntro(page, '走不动', '离线员', '一天两万步');
      const t = await doTeam(page, tag);
      await shot(page, '12_offline_team.png');
      if (t.n !== 5) throw new Error('游客数 ' + t.n);
      return t.n + ' 人（种子池）';
    }, 'net.js/rules.js');
    await step(tag, '路线 3 站 mochi→xianqian→wuma 出发并跑到 clock≥600 回家', async () => {
      await doRoute(page, tag, ['mochi', 'xianqian', 'wuma']);
      const d = await drive(page, tag, { goHomeAt: 600, maxMs: 260000 });
      return `退出=${d.reason} maxClock=${d.stats.maxClock.toFixed(0)} 中断=${d.stats.interrupts} 停站=${d.stats.stays} 名人=${d.stats.celebs} guests=${d.s.guests}`;
    }, 'engine.js/rules.js/main.js');
    await step(tag, '结尾→升华屏→结算：无「我写的那句去哪了」', async () => {
      const e = await doEnding(page, tag, '继续回家', '15_offline_ending');
      const epiSeen = await page.locator('#overlay .page.epi').waitFor({ timeout: 2000 }).then(() => true).catch(() => false);
      const r = await waitResult(page, tag, 20000);
      await shot(page, '16_offline_result.png');
      assertResult(tag, r);
      check(tag, '断网结算无「我写的那句去哪了」按钮', !r.btns.some(b => /我写的那句去哪了/.test(b)), r.btns.join('|'), 'main.js/net.js');
      check(tag, '结算先出、结尾五幕放在再来一局之前', !epiSeen, '', 'main.js');
      return (e.skipped ? '无人丢失直接结算' : '走了结尾页') + '；按钮=' + r.btns.join('|');
    }, 'main.js/ui.js');
    celebTexts = await page.evaluate(() => window.__wz.celeb).catch(() => []);
  } finally {
    await shot(page, 'offline_final.png').catch(() => {});
    await ctx.close().catch(() => {});
  }
  return { errs, celebTexts };
}

// ---------- 静态检查 ----------
function staticChecks() {
  const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'web', 'style.css'), 'utf8');
  const ext = html.match(/<(script|link)[^>]+(src|href)=["']?(https?:)?\/\//gi) || [];
  check('static', 'index.html 无外链 script/link', ext.length === 0, ext.join(' '), 'index.html');
  const cssExt = css.match(/url\(\s*["']?(https?:)?\/\//gi) || [];
  const cssImport = css.match(/@import[^;]*https?:/gi) || [];
  check('static', 'style.css 无外链 url()/@import', cssExt.length + cssImport.length === 0, cssExt.concat(cssImport).join(' '), 'style.css');
}

function celebChecks(tag, texts) {
  if (!texts.length) { check(tag, '名人卡标注（本局未触发名人卡，无法检查）', true, '未触发', 'rules.js/celebrities.js'); return; }
  texts.forEach((t, i) => {
    const one = t.replace(/\n+/g, ' ');
    check(tag, `名人卡 #${i + 1} 带「AI 代拟，非原作」或「原作」`, /AI 代拟，非原作|原作/.test(one), one.slice(0, 140), 'ui.js/celebrity.js');
  });
}

// ---------- 报告 ----------
function writeReport(results) {
  const total = (Date.now() - report.startedAt) / 1000;
  const L = [];
  L.push('# A6 冒烟报告 · ' + new Date().toISOString().replace('T', ' ').slice(0, 19));
  L.push('');
  L.push(`视口 390×844 · DPR 2 · isMobile · hasTouch · chromium。总耗时 ${total.toFixed(0)} s。基址 ${BASE}；离线 ${FILE_URL}`);
  L.push('');
  L.push('## 步骤');
  L.push('| 结果 | 场景 | 步骤 | 耗时 | 备注 / 错误 | 怀疑文件 |');
  L.push('|---|---|---|---|---|---|');
  for (const s of report.steps) L.push(`| ${s.ok ? 'PASS' : '**FAIL**'} | ${s.tag} | ${s.name} | ${(s.ms / 1000).toFixed(1)}s | ${(s.ok ? (s.note || '') : s.error).replace(/\|/g, '\\|').replace(/\n/g, '<br>').slice(0, 600)} | ${s.ok ? '' : s.suspects} |`);
  L.push('');
  L.push('## 额外检查');
  L.push('| 结果 | 场景 | 检查 | 详情 | 怀疑文件 |');
  L.push('|---|---|---|---|---|');
  for (const c of report.extra) L.push(`| ${c.ok ? 'OK' : '**BAD**'} | ${c.tag} | ${c.name} | ${c.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 400)} | ${c.ok ? '' : c.suspects} |`);
  L.push('');
  L.push('## 页面错误 / console error / HTTP ≥400（已忽略 /assets/*.png）');
  for (const [tag, e] of Object.entries(report.errors)) {
    L.push(`### ${tag}`);
    L.push(`- pageerror ${e.pageerror.length} 条` + (e.pageerror.length ? '\n' + e.pageerror.map(x => '  - `' + x.split('\n')[0] + '`').join('\n') : ''));
    L.push(`- console.error ${e.console.length} 条` + (e.console.length ? '\n' + e.console.map(x => '  - `' + x.slice(0, 200) + '`').join('\n') : ''));
    L.push(`- http/请求失败 ${e.http.length} 条` + (e.http.length ? '\n' + e.http.map(x => '  - `' + x + '`').join('\n') : ''));
  }
  L.push('');
  L.push('## 截图');
  for (const f of fs.readdirSync(ART).filter(f => f.endsWith('.png')).sort()) L.push(`- artifacts/${f}`);
  L.push('');
  const failSteps = report.steps.filter(s => !s.ok).length, badExtra = report.extra.filter(c => !c.ok).length;
  const errCount = Object.values(report.errors).reduce((n, e) => n + e.pageerror.length + e.console.length + e.http.length, 0);
  L.push(`## 结论：步骤失败 ${failSteps}，额外检查不过 ${badExtra}，错误 ${errCount} → ${failSteps + badExtra + errCount === 0 ? '**通过**' : '**不通过**'}`);
  fs.writeFileSync(path.join(ART, 'smoke-report.md'), L.join('\n'), 'utf8');
  return failSteps + badExtra + errCount === 0;
}

(async () => {
  for (const f of fs.readdirSync(ART)) if (/\.(png|md)$/.test(f)) fs.unlinkSync(path.join(ART, f));
  staticChecks();
  const browser = await chromium.launch({ headless: true, ...LAUNCH_OPTS });
  const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' };
  const parallel = process.env.WZ_SERIAL !== '1';
  let on, off;
  if (parallel) [on, off] = await Promise.all([onlineFlow(browser, ctxOpts), offlineFlow(browser, ctxOpts)]);
  else { on = await onlineFlow(browser, ctxOpts); off = await offlineFlow(browser, ctxOpts); }
  await browser.close();
  celebChecks('online', on.celebTexts || []);
  celebChecks('offline', off.celebTexts || []);
  const ok = writeReport();
  console.log(`\n报告：${path.join(ART, 'smoke-report.md')}  →  ${ok ? '通过' : '不通过'}`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FATAL', e); try { writeReport(); } catch (_) {} process.exit(2); });
