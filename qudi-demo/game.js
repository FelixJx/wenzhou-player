// game.js —— M1 经济骨架：盘店 + 金币 tick + 冒字 + 计时
(function () {
  'use strict';
  var cv = document.getElementById('map'), ctx = cv.getContext('2d');
  var coinsEl = document.getElementById('coins'), ownedEl = document.getElementById('owned'), timerEl = document.getElementById('timer').querySelector('b');

  function fit() { cv.width = innerWidth; cv.height = innerHeight - 56; }
  addEventListener('resize', fit); fit();

  var S = {
    coins: 500, left: 300, // 5:00 = 300 秒
    shops: WZD.shops.map(function (s) { return Object.assign({}, s, { owned: false }); }),
    floats: [], tick: 0, over: false
  };
  window.__S = S; // 调试钩子（demo 用）

  // ---------- M5：金币音效（音高随金额上扬） ----------
  var AC = null;
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
  addEventListener('pointerdown', function () { if (AC && AC.state === 'suspended') AC.resume(); });
  WZD.sfx = function (text) {
    if (!AC) return;
    var m = parseFloat(String(text).replace(/[^0-9.]/g, '')) || 5;
    var f = 440 + Math.min(600, m * 8);
    try {
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.05, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.12);
      o.connect(g); g.connect(AC.destination);
      o.start(); o.stop(AC.currentTime + 0.13);
    } catch (e) { /* 静默 */ }
  };

  // ---------- 数值（docs/QUDI-DEMO-DESIGN.md §四） ----------
  function ratingMul(r) { return r >= 4.5 ? 1.5 : r >= 4.0 ? 1.0 : r >= 3.5 ? 0.9 : 0.8; }
  function popBase(p) { return p >= 500 ? 15 : p >= 100 ? 10 : 6; }
  function priceOf(s) { var c = s.rating >= 4.5 ? 3 : s.rating >= 4.0 ? 2 : 1; return Math.round(s.price * c); }
  function incomeOf(s) {
    var base = Math.max(2, Math.round(popBase(s.pop) * ratingMul(s.rating)));
    if (s.staff) base = Math.round(base * (s.staff.match ? 1.5 : 0.7)); // M3：人岗匹配
    return base;
  }

  // ---------- 冒字 ----------
  function addFloat(x, y, text, color, big) {
    S.floats.push({ x: x, y: y, text: text, color: color || '#ffd166', born: performance.now(), big: !!big });
    if (S.floats.length > 24) S.floats.shift();
    if (WZD.sfx) WZD.sfx(text);
  }

  // ---------- 圈地：领地与连片（PRD M2） ----------
  function ownedNeighbors(s) { // 已盘邻居数（140px 内视为接壤）
    return S.shops.filter(function (o) { return o.owned && o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 140; }).length;
  }
  function chainSize(s) { // 连片规模：从 s 出发沿接壤关系 flood
    var seen = {}, stack = [s], n = 0;
    while (stack.length) {
      var cur = stack.pop();
      if (seen[cur.id]) continue;
      seen[cur.id] = true; n += 1;
      S.shops.forEach(function (o) {
        if (!o.owned || seen[o.id]) return;
        if (Math.hypot(o.x - cur.x, o.y - cur.y) < 140) stack.push(o);
      });
    }
    return n;
  }

  // ---------- 收益 tick：每 10 秒，已盘店铺从左到右连冒；连片 ≥3 加成 20% ----------
  function incomeTick() {
    if (S.over) return;
    var owned = S.shops.filter(function (s) { return s.owned; });
    owned.sort(function (a, b) { return a.x - b.x; });
    owned.forEach(function (s, i) {
      setTimeout(function () {
        var chain = chainSize(s);
        var bonus = chain >= 3 ? 1.2 : 1;
        var n = Math.max(2, Math.round(incomeOf(s) * bonus));
        S.coins += n;
        addFloat(s.x + 20, s.y - 6, '+' + n + (bonus > 1 ? ' 连片' : ''), bonus > 1 ? '#7ee08a' : (i === owned.length - 1 ? '#ffb347' : '#ffd166'), i === owned.length - 1);
        coinsEl.textContent = S.coins;
      }, i * 220);
    });
  }
  setInterval(incomeTick, 10000);

  // ---------- 时钟 + 维护费 sink + near-miss 提示 ----------
  setInterval(function () {
    if (S.over) return;
    S.left -= 1;
    var m = Math.floor(S.left / 60), sec = S.left % 60;
    timerEl.textContent = m + ':' + (sec < 10 ? '0' : '') + sec;
    // 维护费（M2 sink）：30 秒宽限后，每 30 秒每店 −5
    var elapsed = 300 - S.left;
    var owned = S.shops.filter(function (s) { return s.owned; });
    if (elapsed >= 30 && owned.length && elapsed % 30 === 0) {
      var fee = 5 * owned.length;
      S.coins = Math.max(0, S.coins - fee);
      addFloat(cv.width / 2, 70, '−' + fee + ' 维护费', '#8a9099');
      coinsEl.textContent = S.coins;
    }
    // near-miss 提示条：差 30 金币内够得着黄金铺位 / 连片差 1 家
    var tip = document.getElementById('tip');
    var msg = null;
    S.shops.forEach(function (s) {
      if (s.golden && !s.owned && S.coins >= priceOf(s) - 30 && S.coins < priceOf(s)) msg = '差 ' + (priceOf(s) - S.coins) + ' 金币拿下黄金铺位：' + (s.golden.split('黄金')[0]);
    });
    if (!msg) owned.some(function (s) {
      if (chainSize(s) === 2 && ownedNeighbors(s) >= 1) { msg = '连片还差 1 家，收益 +20%'; return true; }
      return false;
    });
    if (msg) tip.textContent = '🎯 ' + msg; else tip.textContent = '点店铺盘下来 · 盘下的店每 10 秒冒金币 · 越好的店越贵';
    if (S.left <= 0) { S.over = true; closeStaffPanel(); if (S.auction) finishAuction(true); showResult(); return; }
    if (!S.auction && (S.left === 230 || S.left === 110)) openAuction(); // M4：一局两场竞拍
  }, 1000);

  // ---------- 点击盘店 ----------
  function hit(sx, sy) {
    for (var i = 0; i < S.shops.length; i++) {
      var s = S.shops[i];
      if (sx >= s.x - 22 && sx <= s.x + 62 && sy >= s.y - 26 && sy <= s.y + 18) return s;
    }
    return null;
  }
  cv.addEventListener('pointerdown', function (ev) {
    if (S.over) return;
    var r = cv.getBoundingClientRect(), sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    var s = hit(sx, sy);
    if (!s) return;
    if (s.owned) { openStaffPanel(s); return; } // M3：派驻游客店员
    var price = priceOf(s);
    if (S.coins < price) { addFloat(s.x + 20, s.y - 26, '差 ' + (price - S.coins) + ' 金币', '#ff6b6b'); return; }
    S.coins -= price; s.owned = true;
    coinsEl.textContent = S.coins;
    ownedEl.textContent = '已盘 ' + S.shops.filter(function (x) { return x.owned; }).length + '/16 家';
    addFloat(s.x + 20, s.y - 26, '−' + price, '#ff6b6b');
    setTimeout(function () { addFloat(s.x + 20, s.y - 6, '开张！', '#5ee6a8', true); }, 260);
  });

  // ---------- M3：游客店员派驻面板 ----------
  var staffPanel = null;
  function closeStaffPanel() { if (staffPanel) { staffPanel.parentNode.removeChild(staffPanel); staffPanel = null; } }
  function openStaffPanel(s) {
    closeStaffPanel();
    var panel = document.createElement('div'); // 先局部构建，成功后再赋 staffPanel（避免半途抛错留下“幽灵面板”锁死 quiz）
    panel.style.cssText = 'position:fixed;left:50%;bottom:52px;transform:translateX(-50%);width:min(360px,92vw);background:#171c2a;border:2px solid #2a3350;border-radius:14px;padding:12px;z-index:8';
    var title = document.createElement('div');
    title.textContent = '给「' + s.name + '」派一位游客店员：';
    title.style.cssText = 'font-size:13px;color:#8a9099;margin-bottom:8px';
    panel.appendChild(title);
    var cands = WZD.staffPool.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 3);
    cands.forEach(function (c) {
      var match = WZD.matchCat(s.cat, c.tag);
      var b = document.createElement('button');
      b.style.cssText = 'display:block;width:100%;text-align:left;margin:6px 0;padding:8px 10px;border-radius:10px;border:1px solid ' + (match ? '#5ee6a8' : '#4a4f63') + ';background:#10131c;color:#e8ecf4;font:inherit;font-size:13px;cursor:pointer';
      b.textContent = (match ? '✔ ' : '・') + c.name + '「' + c.text + '」' + (match ? ' · 正对口！' : ' · 不太对口');
      b.onclick = function () {
        s.staff = { name: c.name, tag: c.tag, match: match };
        addFloat(s.x + 20, s.y - 26, match ? '人岗匹配！+50%' : '不太对口…', match ? '#5ee6a8' : '#ffb347');
        if (match) S.rescued = (S.rescued || 0) + 1; // 义：接住 1 位
        closeStaffPanel();
      };
      panel.appendChild(b);
    });
    var close = document.createElement('button');
    close.textContent = '以后再说';
    close.style.cssText = 'display:block;width:100%;margin-top:6px;padding:6px;border:0;border-radius:8px;background:transparent;color:#8a9099;font:inherit;font-size:12px;cursor:pointer';
    close.onclick = closeStaffPanel;
    panel.appendChild(close);
    document.body.appendChild(panel);
    staffPanel = panel;
  }

  // ---------- M3：事件题连击（quiz 题库样式沿用主游戏） ----------
  S.combo = 1; S.rescued = 0;
  var QUIZ = [
    { q: '「池塘生春草」的下一句是？', o: ['园柳变鸣禽', '岸柳变鸣蝉', '园柳落鸣琴'], a: 0 },
    { q: '温州古称「瓯」，瓯窑青瓷始于？', o: ['东汉', '唐代', '宋代'], a: 0 },
    { q: '朔门古港出土的瓷片以哪个窑为主？', o: ['龙泉窑', '景德镇窑', '耀州窑'], a: 0 },
    { q: '江心屿双塔旧时的作用是？', o: ['夜航灯标', '烽火台', '钟楼'], a: 0 },
  ];
  var quizIdx = 0;
  function showQuiz() {
    if (S.over || staffPanel || document.querySelector('.qdlg')) return;
    var item = QUIZ[quizIdx % QUIZ.length]; quizIdx += 1;
    var dlg = document.createElement('div');
    dlg.className = 'qdlg';
    dlg.style.cssText = 'position:fixed;left:50%;bottom:52px;transform:translateX(-50%);width:min(360px,92vw);background:#171c2a;border:2px solid #d4a017;border-radius:14px;padding:12px;z-index:8';
    var tag = document.createElement('div');
    tag.textContent = '📜 事件题 · 当前连击 ×' + S.combo;
    tag.style.cssText = 'font-size:12px;color:#d4a017;margin-bottom:6px';
    dlg.appendChild(tag);
    var q = document.createElement('div');
    q.textContent = item.q; q.style.cssText = 'font-size:14px;margin-bottom:8px';
    dlg.appendChild(q);
    item.o.forEach(function (opt, oi) {
      var b = document.createElement('button');
      b.textContent = opt;
      b.style.cssText = 'display:block;width:100%;text-align:left;margin:5px 0;padding:8px 10px;border-radius:10px;border:1px solid #4a4f63;background:#10131c;color:#e8ecf4;font:inherit;font-size:13px;cursor:pointer';
      b.onclick = function () {
        var right = oi === item.a;
        if (right) {
          S.combo = Math.min(3, S.combo + 1); S.coins += 10;
          coinsEl.textContent = S.coins;
          addFloat(cv.width / 2, 90, '答对 +10 · 连击 ×' + S.combo, '#ffd166', true);
        } else {
          S.combo = 1;
          addFloat(cv.width / 2, 90, '答错，连击归零', '#ff6b6b');
        }
        if (dlg.parentNode) dlg.parentNode.removeChild(dlg);
      };
      dlg.appendChild(b);
    });
    document.body.appendChild(dlg);
    setTimeout(function () { if (dlg.parentNode) dlg.parentNode.removeChild(dlg); }, 15000); // 15 秒不答自动消失，不惩罚
  }
  setInterval(showQuiz, 45000);
  setTimeout(showQuiz, 30000);
  window.__quiz = showQuiz; // 调试钩子

  // ---------- M4：黄金铺位竞拍（3 AI 人格 + 30 秒权威窗口） ----------
  var AI_BIDDERS = [
    { name: '温州老油条', style: 'follow' },  // 最后 8 秒杀出 1.2 倍
    { name: '外地炒家',   style: 'aggr' },    // 开局就压 90
    { name: '小本经营',   style: 'careful' }, // 超 120 缩手
  ];
  S.auction = null;
  var aPanel = null;
  function openAuction() {
    var cand = S.shops.filter(function (s) { return s.golden && !s.owned; });
    if (!cand.length || S.auction) return;
    var shop = cand[Math.floor(Math.random() * cand.length)];
    S.auction = { shop: shop, price: 80, leader: '底价', endsAt: performance.now() + 30000, bids: {} };
    addFloat(shop.x + 20, shop.y - 26, '竞拍开始！', '#d4a017', true);
    if (WZD.sfxAlert) WZD.sfxAlert();
    renderAuctionPanel();
  }
  function renderAuctionPanel() {
    var a = S.auction; if (!a) return;
    if (!aPanel) {
      aPanel = document.createElement('div');
      aPanel.style.cssText = 'position:fixed;left:50%;bottom:52px;transform:translateX(-50%);width:min(360px,92vw);background:#171c2a;border:2px solid #d4a017;border-radius:14px;padding:12px;z-index:9';
      document.body.appendChild(aPanel);
    }
    var remain = Math.max(0, Math.ceil((a.endsAt - performance.now()) / 1000));
    aPanel.innerHTML = '';
    var head = document.createElement('div');
    head.innerHTML = '🔨 <b>' + a.shop.golden + '</b> 竞拍中 · 当前 <b style="color:#ffd166">' + a.price + '</b> 金币 · 领先：<b>' + a.leader + '</b> · 剩 <b>' + remain + '</b>s';
    head.style.cssText = 'font-size:13px;margin-bottom:8px';
    aPanel.appendChild(head);
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px';
    [[10, '+10'], [25, '+25'], [0, '放弃']].forEach(function (it) {
      var b = document.createElement('button');
      b.textContent = it[1];
      b.style.cssText = 'flex:1;padding:9px 0;border-radius:10px;border:1px solid #4a4f63;background:#10131c;color:#e8ecf4;font:inherit;font-size:14px;cursor:pointer';
      b.onclick = function () {
        var a2 = S.auction; if (!a2 || a2.done) return;
        if (it[0] === 0) { finishAuction(true); return; }
        var nb = a2.price + it[0];
        if (S.coins < nb) { addFloat(a2.shop.x + 20, a2.shop.y - 26, '金币不够', '#ff6b6b'); return; }
        a2.price = nb; a2.leader = '你';
        addFloat(a2.shop.x + 20, a2.shop.y - 26, '出价 ' + nb, '#ffd166');
        renderAuctionPanel();
      };
      row.appendChild(b);
    });
    aPanel.appendChild(row);
  }
  function aiBidTick() {
    var a = S.auction;
    if (!a || a.done) { if (aPanel && a && a.done) { /* 等落槌动画 */ } return; }
    var remain = a.endsAt - performance.now();
    AI_BIDDERS.forEach(function (ai) {
      if (a.bids[ai.name]) return;
      var fireAt = ai.style === 'aggr' ? 22000 : ai.style === 'follow' ? 8000 : 15000;
      if (30000 - remain >= fireAt) {
        var bid = a.price + (ai.style === 'aggr' ? 25 : 10);
        if (ai.style === 'careful' && bid > 120) { a.bids[ai.name] = true; return; }
        a.price = bid; a.leader = ai.name; a.bids[ai.name] = true;
        renderAuctionPanel();
      }
    });
    if (remain <= 3000 && a.leader === '你' && !a.sniped) { // near-miss：最后一刻被截胡
      a.sniped = true;
      a.price = Math.round(a.price * 1.2); a.leader = '温州老油条';
      addFloat(a.shop.x + 20, a.shop.y - 26, '被截胡！', '#ff6b6b', true);
      renderAuctionPanel();
    }
    if (remain <= 0) finishAuction(false);
    else if (aPanel) renderAuctionPanel();
  }
  setInterval(aiBidTick, 300);
  function finishAuction(gaveUp) {
    var a = S.auction; if (!a || a.done) return;
    a.done = true;
    if (a.leader === '你' && !gaveUp) {
      S.coins -= a.price;
      a.shop.owned = true; a.shop.goldWin = true;
      coinsEl.textContent = S.coins;
      addFloat(a.shop.x + 20, a.shop.y - 6, '得标！', '#5ee6a8', true);
      ownedEl.textContent = '已盘 ' + S.shops.filter(function (s) { return s.owned; }).length + '/16 家';
    } else {
      addFloat(a.shop.x + 20, a.shop.y - 6, gaveUp ? '你放弃了竞拍' : a.leader + ' 得标', '#8a9099');
    }
    if (aPanel) { aPanel.parentNode.removeChild(aPanel); aPanel = null; }
    S.auction = null;
  }

  // ---------- M4：结算双榜（利 × 义 → 义利并举） ----------
  function showResult() {
    var owned = S.shops.filter(function (s) { return s.owned; }).length;
    var rescued = S.rescued || 0;
    var title = (rescued >= 3 && S.coins >= 600) ? '义利并举' : (S.coins >= 600 ? '钞能力者' : rescued >= 3 ? '暖心派' : '温州过客');
    var pg = document.createElement('div');
    pg.style.cssText = 'position:fixed;inset:0;background:rgba(8,10,18,0.96);z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px';
    var html = '<div style="font-size:26px;font-weight:800;color:#ffd166">今天到此为止</div>'
      + '<div style="font-size:15px;color:#8a9099">净资产 <b style="color:#e8ecf4;font-size:22px">' + S.coins + '</b> 金币 · 盘下 ' + owned + ' 家 · 接住游客 <b style="color:#5ee6a8;font-size:22px">' + rescued + '</b> 位</div>'
      + '<div style="font-size:30px;font-weight:900;letter-spacing:0.15em;color:#ffd166;margin:6px 0">『 ' + title + ' 』</div>'
      + '<div style="font-size:12px;color:#8a9099">义利并举——赚钱的同时把人招呼好。温州人把这件事，做得早了一点。</div>';
    var btnr = document.createElement('button');
    btnr.textContent = '再来一局';
    btnr.style.cssText = 'margin-top:10px;padding:10px 40px;border-radius:12px;border:0;background:linear-gradient(135deg,#ffd166,#ff8a6b);color:#10131c;font:inherit;font-size:16px;font-weight:700;cursor:pointer';
    btnr.onclick = function () { location.reload(); };
    pg.innerHTML = html;
    pg.appendChild(btnr);
    document.body.appendChild(pg);
  }

  // ---------- 渲染 ----------
  function draw(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#151a28'; ctx.fillRect(0, 0, cv.width, cv.height);
    // 瓯江
    ctx.fillStyle = '#1d3a5f'; ctx.fillRect(0, 20, cv.width, 46);
    ctx.fillStyle = '#24466f'; ctx.fillRect(0, 20, cv.width, 4);
    ctx.font = '11px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.textAlign = 'left';
    ctx.fillText('瓯江', 12, 46);
    // 街区格子底 + 领地色块（圈地可视化）
    S.shops.forEach(function (s) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(s.x - 26, s.y - 30, 92, 52);
      if (s.owned) { // 领地：本店 + 左右两格染自己的颜色
        ctx.fillStyle = 'rgba(192,57,43,0.22)';
        ctx.fillRect(s.x - 26, s.y - 30, 92, 52);
        ctx.fillRect(s.x - 78, s.y - 30, 46, 52);
        ctx.fillRect(s.x + 70, s.y - 30, 46, 52);
      }
    });
    // 店铺
    S.shops.forEach(function (s) {
      var body = s.owned ? '#c0392b' : '#39445c';
      var edge = s.owned ? '#ff8a6b' : (s.golden ? '#d4a017' : '#26304a');
      ctx.fillStyle = body; ctx.fillRect(s.x - 20, s.y - 20, 80, 34);
      ctx.strokeStyle = edge; ctx.lineWidth = s.golden ? 2 : 1; ctx.strokeRect(s.x - 20, s.y - 20, 80, 34);
      if (s.golden && !s.owned) { // 黄金铺位光晕脉冲
        var a = 0.35 + 0.25 * Math.sin(t / 300);
        ctx.strokeStyle = 'rgba(255,209,102,' + a + ')'; ctx.lineWidth = 3;
        ctx.strokeRect(s.x - 24, s.y - 24, 88, 42);
        ctx.fillStyle = '#ffd166'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('★ 黄金铺位', s.x + 20, s.y - 28);
      }
      ctx.fillStyle = '#e8ecf4'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText((s.staff ? '👤' : '') + s.name.slice(0, 8), s.x + 20, s.y - 6);
      ctx.fillStyle = s.rating >= 4.5 ? '#ffd166' : '#8a9099';
      ctx.fillText('⭐' + s.rating + ' · 💰' + priceOf(s), s.x + 20, s.y + 8);
      if (s.owned) {
        var shown = incomeOf(s) * (chainSize(s) >= 3 ? 1.2 : 1); // 显示与 tick 同一公式
        var cn = ownedNeighbors(s);
        ctx.fillStyle = cn >= 2 ? '#7ee08a' : '#ff8a6b';
        ctx.fillText('收益 ' + Math.round(shown) + '/10s' + (cn >= 2 ? ' · 连片' : ''), s.x + 20, s.y + 20);
      }
    });
    // 浮字（上飘淡出）
    var now = performance.now();
    S.floats = S.floats.filter(function (f) { return now - f.born < 1200; });
    S.floats.forEach(function (f) {
      var age = (now - f.born) / 1200;
      ctx.globalAlpha = Math.max(0, 1 - age);
      ctx.font = (f.big ? 'bold 18px' : 'bold 14px') + ' sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      var fx = f.x + 20, fy = f.y - 10 - age * 40;
      ctx.strokeText(f.text, fx, fy); ctx.fillStyle = f.color; ctx.fillText(f.text, fx, fy);
      ctx.globalAlpha = 1;
    });
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
