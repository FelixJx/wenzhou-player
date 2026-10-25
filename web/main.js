// main.js —— 总装（Lead 拥有）。把 engine / rules / ui / net 串成一局。
window.WZ = window.WZ || {};
(function () {
  const C = () => WZ.content || {};
  const P = () => (WZ.content && WZ.content.params) || {};
  const flags = {
    get hasPlayed() { return localStorage.getItem('wz_has_played') === '1'; },
    set hasPlayed(v) { localStorage.setItem('wz_has_played', v ? '1' : '0'); },
    get seenEnding() { return localStorage.getItem('wz_seen_ending') === '1'; },
    set seenEnding(v) { localStorage.setItem('wz_seen_ending', v ? '1' : '0'); },
  };

  let run = null;          // 当前一局
  let player = { name: '', mine: '' };
  let paused = false;
  let engineReady = false;
  let ended = false;

  function engine() { return WZ.engine; }
  function ui() { return WZ.ui; }
  function music(scene) { if (WZ.music) WZ.music.play(scene); }

  // ---------- 启动 ----------
  function boot() {
    const canvas = document.getElementById('game');
    engine().init(canvas, { places: C().places, zones: C().zones, mapSize: C().mapSize, params: P(), pois: C().pois });
    engineReady = true;
    bindEngine();
    music('intro');
    // PRD-v2 F9：首次用户手势解锁音频（自动播放策略），失败静默
    const unlockSfx = () => { if (WZ.sfx) WZ.sfx.init(); window.removeEventListener('pointerdown', unlockSfx); window.removeEventListener('keydown', unlockSfx); };
    window.addEventListener('pointerdown', unlockSfx);
    window.addEventListener('keydown', unlockSfx);
    // PRD-v2 F6：改道后空闲 4 秒自动回路线
    setInterval(() => {
      if (!run || ended || paused || !engineReady) return;
      if (!deviateAt || Date.now() - deviateAt < 4000) return;
      const moving = engine().isPlayerMoving ? engine().isPlayerMoving() : false;
      if (moving || engine().isPaused()) return;
      const next = (run.state.route || []).find(id => !(run.state.visited || []).includes(id));
      if (!next) { deviateAt = 0; return; }
      deviateAt = 0;
      const pl = (C().places || []).find(p => p.id === next);
      ui().toast('回到路线：' + (pl ? pl.name : next));
      engine().goTo(next);
    }, 1000);
    // 名人 AI 提供者（失败由规则层回退模板）
    if (WZ.celebrity) WZ.celebrity.provider = (who, ctx, cb) => WZ.net.celebrity(who, ctx, cb);
    // HUD 的暂停/回家（W3 ISSUES #1）
    if (ui().hud) {
      // onPause 不接管：UI 默认暂停页直接调 engine.pause，引擎暂停时不发 tick（审查 H1）
      ui().hud.onGoHome = () => { if (run && !ended) handle(run.goHome()); };
      ui().hud.onGuest = id => openGuest(id); // 10/24 #3：点头像看完整心声
      ui().hud.onBanner = () => { // 提示词 5：点横幅，地图平移居中到下一站
        if (!run) return; const nx = (run.state.route || []).find(id => !(run.state.visited || []).includes(id));
        if (nx) engine().focus(nx);
      };
      // 10/25：🗺 全览全温州（可玩范围 + 商圈划分），再点回到跟队
      ui().hud.onOverview = btn => {
        const on = !engine().isOverview();
        engine().fitMap(on);
        if (btn) btn.textContent = on ? '🎯' : '🗺';
        if (on) ui().toast('全览：琥珀虚线 = 可玩范围，色块 = 各商圈');
      };
      // 10/25：点积分 → 本局得分明细
      ui().hud.onScore = () => {
        if (!run) return;
        const st = run.state, U = WZ.ui._;
        const pg = U.page('page-score');
        pg.appendChild(U.el('h2', null, '积分 · ' + (st.score || 0)));
        const list = U.el('div', 'score-log');
        (st.scoreLog || []).slice(-14).reverse().forEach(function (e) {
          const row = U.el('div', 'score-row');
          row.appendChild(U.el('span', 'score-pts', (e.total >= 0 ? '+' : '') + e.total));
          row.appendChild(U.el('span', 'score-reason', e.name || ''));
          row.appendChild(U.el('span', 'score-at', WZ.ui._.fmtClock ? WZ.ui._.fmtClock(e.at) : e.at + '分'));
          list.appendChild(row);
        });
        if (!(st.scoreLog || []).length) list.appendChild(U.el('p', 'muted small', '还没得分——去逛没去过的店吧。'));
        pg.appendChild(list);
        pg.appendChild(U.btn('返回', 'btn-primary btn-block', () => WZ.ui.hide()));
        WZ.ui._.setOverlay(pg);
      };
    }
    if (WZ.book) WZ.book.applyLayout(); // 10/24 #7：横屏 3:7
    // 10/24 #4/#5/#9：插旗、路线、引导语、手册每 0.5 秒刷新一次（插旗 1.5 秒）
    let lastFlagAt = 0, flagsNow = {};
    setInterval(() => {
      if (!run || ended || !engineReady || !planned || day) return; // day 模式：无手册/插旗/引导

      const now = Date.now();
      if (now - lastFlagAt > 1500 && WZ.advisor) {
        lastFlagAt = now;
        const pp = engine().getPlayerPos();
        const near = WZ.poiPlaces(pp.x, pp.y, 520);
        const sp = P().engine && P().engine.playerSpeed || 190, mps = P().minPerSec || 4;
        flagsNow = WZ.advisor.flags(run.state, (C().places || []).concat(near), { walkMin: id => id.indexOf('poi_') === 0 ? Math.round(Math.hypot(((engine().getPoi(id) || {}).x || 0) - pp.x, ((engine().getPoi(id) || {}).y || 0) - pp.y) * 1.3 / sp * mps) : engine().walkMinFromPlayer(id) });
      }
      engine().setPlan({ route: run.state.route, visited: run.state.visited, flags: flagsNow, dim: true });
      engine().setGuide((run.state.route || []).find(id => !(run.state.visited || []).includes(id)) || null); // 提示词 9
      if (day && day.zi >= 0) {
        const left = Math.max(0, day.zoneLeft - (run.state.clockMin - day.zoneStart));
        if (left <= 0 && !day.warned) { day.warned = true; ui().toast('⏰ 这个商圈的预计停留用完了——点下方按钮去下一站'); }
        updateDayChip(); // codex #7：倒计时实时刷新
      }
      const g = WZ.advisor ? WZ.advisor.guide(run.state, C().places || [], { phase: 'walk', walkMin: id => engine().walkMinFromPlayer(id), totalMin: P().totalMin || 1024 }) : null;
      if (g) { ui().hud.setGuide(g); if (WZ.book) WZ.book.setGuide(g); }
      if (WZ.book) WZ.book.refresh(false);
    }, 500);
    ui().showIntro(onIntro);
  }

  async function onIntro({ name, tag, text, picks }) {
    player.name = name || '玩家';
    player.mine = text || '';
    engine().setPlayer({ name: player.name });
    // 10/24 #1：多选标签 → 每个标签各投一句进池子（第一句是玩家写的）
    (picks && picks.length ? picks : [{ tag, text }]).forEach(p => WZ.net.postTrouble(p.tag, p.text));
    const difficulty = flags.hasPlayed ? await pickDifficulty() : 'easy';
    await startRun(difficulty);
  }

  function pickDifficulty() {
    music('intro');
    return new Promise(res => ui().showDifficulty({ easy: true, normal: flags.hasPlayed, hard: flags.hasPlayed }, res));
  }

  let planned = false;
  async function startRun(difficulty) {
    ended = false; paused = false; pauseDepth = 0; planned = false;
    day = null; unmountDayChip();
    lastRegionAnnounced = '';
    feedbackSeen = {}; // codex #11：每局重建
    if (WZ.book) WZ.book.unmount();
    engine().setPlan(null);
    music('intro');
    // 再来一局重置引擎环境（审查 M3）
    engine().pause(false);
    engine().setWeather('none');
    engine().setRoadwork(null);
    const home = engine().getPlace && engine().getPlace('center');
    if (home && engine().setPlayerPos) engine().setPlayerPos(home.ex, home.ey);
    const size = (P().teamSize || { easy: 5, normal: 6, hard: 7 })[difficulty] || 5;
    const troubles = await WZ.net.sampleTroubles(size + 3);
    run = WZ.rules.createRun({
      troubles, difficulty, params: P(), places: C().places, content: C(),
      seed: Date.now() % 100000, firstRun: !flags.hasPlayed, playerName: player.name,
    });
    engine().setGuests(run.state.guests);
    engine().setClock(run.state.clockMin);
    ui().hud.update(run.state);
    ui().showTeam(run.state.guests, spec => {
      // 10/24：接团页改过队伍（加人/删人/改脾气和那句话）→ 按新名单重建这一局
      if (spec && spec.length) {
        run = WZ.rules.createRun({
          troubles, difficulty, params: P(), places: C().places, content: C(),
          seed: Date.now() % 100000, firstRun: !flags.hasPlayed, playerName: player.name,
          tags: spec.map(x => x.tag), lines: spec.map(x => x.line),
        });
        engine().setGuests(run.state.guests);
        ui().hud.reset(); ui().hud.update(run.state);
      }
      // 排路线时地图也活着（横屏左侧 70% 能点店看理由），但时钟不走
      engine().pause(true); engine().start();
      // 10/25：先看「今天的旅客想要…」需求页，再选玩法：商圈带队（新）/ 经典模式
      showNeedsPage(run.state.guests, () => {
      // 单一入口（10/25 裁决）：直接进商圈带队；dayPlanner 缺失才回落旧排线
      if (WZ.book && WZ.book.dayPlanner) {
        WZ.book.dayPlanner({ guests: run.state.guests }, plan => startDayMode(plan));
        return;
      }
      ui().showRoutePlanner({ places: C().places, guests: run.state.guests, state: run.state, preview: ids => run.planRoute(ids) }, ids => {
        ui().hide(); // PRD-v2 F3 副作用修复：开场名人改横幅后不再替我们盖掉 planner 页，需主动关闭
        run.planRoute(ids);
        planned = true;
        engine().pause(false);
        engine().start();
        music('game');
        if (WZ.book) WZ.book.mount(run, { onReplan, onCalm: gid => { handle(run.calm(gid)); ui().hud.update(run.state); } });
        engine().setPlan({ route: run.state.route, visited: run.state.visited, flags: {}, dim: true });
        // 苏步青等 when:'start' 的名人由规则层在首个 tick 发出
        if (ids[0]) engine().goTo(ids[0]);
        setTimeout(() => { if (!WZ.book.isLand()) ui().spotlight('book', '#book-tab', '路线单在这里：点「手册」看每一站，出发后也能改'); }, 2500);
      });
      });
    });
    }

    // 10/25 需求②：开局先看「今天的旅客想要……」，再进俯视图插旗
    function showNeedsPage(guestList, onDone) {
      const U = WZ.ui._;
      const NEED_TEXT = { walk: '每隔一段路要有地方歇脚', food: '要吃上地道温州小吃', crowd: '避开人多的街，走走小巷', shop: '要买到温州手信', bored: '要有真正好看的看点', rush: '少停几站，别磨蹭', toilet: '沿途得有厕所', any: '都行，跟着走就挺好' };
      const ICON = { walk: '🦶', food: '🍚', crowd: '😵', shop: '🛍️', bored: '🥱', rush: '⏰', toilet: '🚻', any: '😎' };
      const pg = U.el('div', 'page page-needs');
      pg.appendChild(U.el('h2', null, '今天的旅客，想要……'));
      pg.appendChild(U.el('p', 'hint', '他们是别的玩家写的困扰——这一天的路线，得把每个人的心愿都照顾到。'));
      const list = U.el('div', 'team-list');
      (guestList || []).forEach(function (g) {
        const row = U.el('div', 'guest-card');
        row.appendChild(U.avatar(g.tag));
        const body = U.el('div', 'guest-body');
        body.appendChild(U.el('div', 'guest-name', (ICON[g.tag] || '📍') + ' ' + (g.name || '') + '：' + (NEED_TEXT[g.tag] || '跟着走')));
        body.appendChild(U.el('div', 'guest-line', '「' + (g.line || '') + '」'));
        row.appendChild(body);
        list.appendChild(row);
      });
      pg.appendChild(list);
      pg.appendChild(U.el('p', 'hint', '接下来是温州俯视图：旗子按大众点评分数插——🔴 高分必去，🟠 值得去，🟡 顺路。'));
      pg.appendChild(U.btn('看温州全图 · 选商圈排一天', 'btn-primary btn-block', function () { onDone('day'); }));
      U.setOverlay(pg);
    }

  // ---------- 商圈带队（PRD-v4 §3，10/25）：商圈链场景制 ----------
  let day = null;
  function districtOf(id) { return (WZ.content.districts || []).find(d => d.id === id) || null; }
  function startDayMode(plan) {
    day = { plan: plan, zi: -1, zoneLeft: 0, zoneStart: 0, warned: false, chip: null };
    // 轻量局（10/25 裁决）：砍掉掉心/名人/答题/营业时间扑空；排计划时长入账（结算给时间规划分）
    run = WZ.rules.createRun({
      troubles: run ? run.state.guests.map(g => ({ tag: g.tag, text: g.line })) : [],
      difficulty: run ? run.state.difficulty : 'easy', params: P(), places: C().places, content: C(),
      seed: Date.now() % 100000, firstRun: !flags.hasPlayed, playerName: player.name,
      light: true,
    });
    const dayPlan = WZ.day.computePlan(plan.map(x => ({ id: x.id, stay: x.stay })));
    run.state.dayTotal = dayPlan.total;
    engine().setGuests(run.state.guests);
    engine().setClock(run.state.clockMin);
    ui().hud.reset(); ui().hud.update(run.state);
    planned = true;
    engine().pause(false); engine().start();
    music('game');
    ui().hide();
    mountDayChip();
    goZone(0);
  }
  function goZone(i) {
    if (!day || !run || ended) return;
    if (day.transit) return; // codex #1：过场期间锁定，连点不排队
    day.transit = true;
    day.zi = i;
    const d = districtOf(day.plan[i].id);
    const prev = i ? districtOf(day.plan[i - 1].id) : (C().dayHome || { name: '游客中心' });
    const tr = WZ.day.travel(prev, d);
    const departAt = run.state.clockMin;
    engine().pause(true);
    ui().showTransit({ from: prev.name, to: d.name, mode: tr.mode, min: tr.min, at: departAt }, () => {
      day.transit = false;
      engine().pause(false);
      if (!run || ended) { ui().hide(); return; } // codex #1：午夜已收工 → 让结算页留着
      handle(run.addTime(tr.min)); // 车程推进时钟
      if (run.state.ended) { ui().hide(); return; }
      engine().setDistrict(d.id);
      // codex #2：队伍落到圈内第一家店门口，清掉上一圈的路径/目标/路线残留
      // 注意：districtPlaces 返回 content 原始对象（无 ex/ey），必须经 getPlace 取地图注册副本
      const inD = WZ.day.districtPlaces(d).filter(pl => !((pl.types || []).includes('home')));
      const gate0 = inD[0] || null;
      const gate = gate0 ? engine().getPlace(gate0.id) : null;
      if (gate && engine().setPlayerPos) engine().setPlayerPos(gate.ex, gate.ey);
      run.state.route = [];
      day.zoneLeft = day.plan[i].stay != null ? day.plan[i].stay : (d.stayDefault || 120);
      day.zoneStart = run.state.clockMin;
      day.warned = false;
      ui().hide(); // 过场页收起（放最后：期间 ending 等全屏页不被盖掉）
      ui().toast('进入 ' + d.name + '——点店铺图钉或地名，队伍就走过去');
      updateDayChip();
    });
  }
  function mountDayChip() {
    unmountDayChip();
    const chip = document.createElement('button');
    chip.id = 'day-next';
    chip.type = 'button';
    chip.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0) + 12px);z-index:25;min-height:44px;padding:0 18px;border-radius:999px;border:2px solid #4a4133;background:linear-gradient(180deg,#3f7d5a,#2f6b4a);color:#fff7ea;font:600 15px var(--font);box-shadow:0 3px 0 rgba(58,48,34,.3);cursor:pointer';
    chip.addEventListener('click', () => {
      if (!day || ended) return;
      if (day.zi < day.plan.length - 1) goZone(day.zi + 1);
      else {
        // codex #5：收队先推进「当前商圈 → 游客中心」的返程车程，再结束
        const d = districtOf(day.plan[day.zi].id);
        const back = WZ.day.travel(d, C().dayHome || { name: '游客中心' });
        handle(run.addTime(back.min));
        if (run.state.ended) return;
        if (ui().hud.onGoHome) ui().hud.onGoHome();
      }
    });
    document.getElementById('dock').appendChild(chip);
    day.chip = chip;
    // 商圈商家清单（10/25 对照 demo §③：筛选 + 评分排序 + 点行走店）
    const listBtn = document.createElement('button');
    listBtn.id = 'day-shops';
    listBtn.type = 'button';
    listBtn.style.cssText = 'position:absolute;right:12px;bottom:calc(env(safe-area-inset-bottom,0) + 66px);z-index:25;min-height:40px;padding:0 14px;border-radius:999px;border:2px solid #4a4133;background:#fbf6ea;color:#33302a;font:600 13px var(--font);box-shadow:0 2px 0 rgba(58,48,34,.25);cursor:pointer';
    listBtn.textContent = '🍽 商家';
    listBtn.addEventListener('click', () => { if (WZ.shopsheet) WZ.shopsheet.toggle(); });
    document.getElementById('dock').appendChild(listBtn);
  }
  function unmountDayChip() {
    const c = document.getElementById('day-next'); if (c) c.remove();
    const l = document.getElementById('day-shops'); if (l) l.remove();
    if (WZ.shopsheet) WZ.shopsheet.close();
    if (day) day.chip = null;
  }
  function updateDayChip() {
    if (!day || !day.chip || !run) return;
    const dCur = districtOf(day.plan[day.zi].id);
    const left = Math.max(0, day.zoneLeft - (run.state.clockMin - day.zoneStart));
    const last = day.zi >= day.plan.length - 1;
    const nextName = last ? '' : '→ 去下一站：' + districtOf(day.plan[day.zi + 1].id).name;
    day.chip.textContent = (last ? '🏠 收队，回游客中心' : nextName) + '（这站剩 ' + left + ' 分钟）';
  }

  // 10/24 #6：出发后改路线——立刻生效，下一站变了就掉头
  function onReplan(ids) {
    if (!run || ended) return;
    const before = (run.state.route || []).find(id => !(run.state.visited || []).includes(id));
    const moods = run.planRoute(ids);
    const after = ids.find(id => !(run.state.visited || []).includes(id));
    engine().setPlan({ route: run.state.route, visited: run.state.visited, flags: {}, dim: true });
    if (after && after !== before) { deviateAt = 0; engine().goTo(after); }
    // 游客当场表态（只挑一个最有感的人说）
    const m = (moods || []).find(x => x.mood === 'worry') || (moods || []).find(x => x.mood === 'happy');
    if (m && m.text) handle([{ type: 'bubble', id: m.guestId, text: m.text, tone: m.mood === 'worry' ? 'bad' : 'good' }]);
  }

  // 提示词 10：第一次有游客掉耐心——暂停 1 秒，半透明引导层圈住他：「有游客不开心了——点点他，哄一哄」
  let spotDone = false;
  function firstUnhappy(id) {
    if (spotDone || !ui().spotlight) return; spotDone = true;
    setPaused(true);
    const ok = ui().spotlight('unhappy', () => engine().screenOfGuest(id), '有游客不开心了——点点他，哄一哄', () => openGuest(id));
    setTimeout(() => setPaused(false), ok ? 1000 : 0);
  }
  // 提示词 10：耐心低于 50% 的游客，每分钟一次轻微滴答提醒
  setInterval(() => { if (run && !ended && !paused && planned && run.state.guests.some(g => g.status === 'follow' && g.patience > 0 && g.patience < 50) && WZ.sfx) WZ.sfx.play('drip'); }, 15000);

  // 提示词 3/10：游客面板（完整心声 + 哄一哄 + 不花钱的「带他去」）
  function openGuest(id) {
    if (!run || ended) return;
    const g = run.state.guests.find(x => x.id === id); if (!g) return;
    const wasOpen = ui().isGuestOpen && ui().isGuestOpen();
    if (!wasOpen) setPaused(true);
    let fix = null;
    const need = WZ.advisor && WZ.advisor.NEED[g.tag];
    if (need && planned) {
      const st = run.state;
      const cand = (C().places || []).filter(p => need.some(t => (p.types || []).includes(t)) && !st.visited.includes(p.id) && WZ.advisor.isOpenAt(p, st.clockMin))
        .map(p => ({ p, m: engine().walkMinFromPlayer(p.id) })).sort((a, b) => a.m - b.m)[0];
      if (cand) fix = { label: '带他去 ' + cand.p.name + '（步行 ' + cand.m + ' 分钟，设为下一站）', go: () => {
        const rest = st.route.filter(x => !st.visited.includes(x) && x !== cand.p.id);
        onReplan(st.route.filter(x => st.visited.includes(x)).concat([cand.p.id], rest));
        ui().toast('下一站改成：' + cand.p.name);
      } };
    }
    ui().showGuest(g, {
      calmMin: P().calmCostMin, calmUp: P().calmPatience, fix,
      onCalm: gid => { handle(run.calm(gid)); ui().hud.update(run.state); openGuest(gid); },
      onClose: () => setPaused(false),
    });
  }

  // ---------- 引擎事件 → 规则 ----------
  function bindEngine() {
    const e = engine();
    e.on('tick', dt => {
      if (!run || paused || ended) return;
      // PRD-v2 F4：走路才走钟——商圈带队局例外（demo：时间一直在走）
      if (!day) {
        const moving = engine().isPlayerMoving ? engine().isPlayerMoving() : true;
        const detached = run.state.guests.some(g => g.status === 'sit' || g.status === 'runaway');
        if (!moving && !detached) { ui().hud.update(run.state); return; }
      }
      handle(run.tick(dt * (P().minPerSec || 4) * (run.state.speedMul || 1)));
      ui().hud.update(run.state);
    });
    e.on('arrive', id => {
      if (!run || ended) return;
      const wasNext = (run.state.route || []).find(x => !(run.state.visited || []).includes(x)) === id;
      handle(run.onArrive(id));
      if (wasNext) { const pl = engine().getPlace(id); if (pl) engine().addFloat(pl.ex, pl.ey - 20, '✓ 已到达', '#57C79A'); } // 提示词 9
      ui().hud.update(run.state);
      enterRegionFanfare(id); // 10/25：首入商圈 → 聚焦动画 + 通报
      shopFeedback(id); // 10/25：进店 AI 游客感想（异步，不阻塞）
      nextLeg(); // F6：零停站地点（小巷/厕所）到达后同样续走路线；无未访问点时是 no-op
    });
    // F6：手动点地 = 改道；点地点图标是明确导航，交给 arrive 后的 nextLeg
    e.on('tapGround', () => { deviateAt = Date.now(); });
    e.on('tapPlace', () => { deviateAt = 0; });
    e.on('tapGuest', id => { if (run && !ended && !paused && planned) openGuest(id); });
    // 提示词 4/7：长按旗子 = 一句话推荐理由（3 秒自动消失）；长按店铺 = 店铺小卡
    // 10/24 晚：点地图上的真实店铺图钉 → 店铺小卡；加进路线时它就成了可去的一站
    e.on('tapPoi', q => {
      if (!run || ended || !q || (ui().isStayOpen && ui().isStayOpen()) || document.querySelector('.quiz-dlg')) return; // 停站卡/答题时不响应
      const p = ensurePoiPlace(q); if (!p) return;
      if (day) { // 商圈带队（demo 规则）：点店即走，无路线链；去过的店拒绝再进
        if (run.state.visited.includes(p.id)) { ui().toast(p.name + ' 已经去过了'); return; }
        engine().goTo(p.id);
        ui().toast('去 ' + p.name);
        return;
      }
      if (!planned) { if (WZ.book._planner) WZ.book._planner.showCard(p.id); return; }
      // PRD-v4 §2.5：出发后点图钉 → 直接插到路线下一站并走过去；店铺卡只在长按时弹
      const st = run.state;
      if (st.visited.includes(p.id)) { ui().toast(p.name + ' 已经去过了'); return; }
      const rest = st.route.filter(x => !st.visited.includes(x) && x !== p.id);
      onReplan(st.route.filter(x => st.visited.includes(x)).concat([p.id], rest));
      engine().goTo(p.id);
      ui().toast('下一站：' + p.name);
    });
    e.on('longPlace', (pid, o) => {
      if (!run || ended) return;
      const fl = lastFlags();
      if (o && o.flag && fl[pid]) { ui().flagTip(WZ.advisor.flagSentence(fl[pid]), o.sx, o.sy); return; }
      if (!planned) return; // 排路线阶段由手册自己处理
      openPlaceCard(pid);
    });
    e.on('enterZone', z => { if (run && !ended) handle(run.onEnterZone(z)); });
    e.on('leaveZone', z => { if (run && !ended) handle(run.onLeaveZone(z)); });
  }
  function lastFlags() { return (engine().getState().plan && engine().getState().plan.flags) || {}; }

  // ---------- 进店 AI 游客感想（10/25 需求）----------
  // 到店（有停站的）后挑 1–2 个「需求对上且还没满足」的游客，要一句 AI 感想；每店冷却一次，
  // 全局限 6 家/局；失败/离线 → guests.placeReaction 本地池，不阻塞、不暂停。
  let feedbackSeen = {};
  let lastRegionAnnounced = '';
  // 10/25 需求：首入一个商圈 → 镜头推进到该商圈 + 通报（俯视图上看清这片有什么）
  function enterRegionFanfare(placeId) {
    if (!run) return;
    const p = (C().places || []).find(x => x.id === placeId);
    if (!p || !(p.stayMin > 0)) return;
    const reg = run.regionOf ? run.regionOf(p) : null;
    if (!reg || reg === lastRegionAnnounced) return;
    lastRegionAnnounced = reg;
    const box = ((P().regions || []).find(r => r.name === reg)) || null;
    if (box && box.w > 0 && engine().focusBox) {
      engine().focusBox(box);
      ui().toast('进入 ' + reg + '——旗子是这片的高分店，点店名就进');
    } else if (p.id) engine().focus(p.id);
  }
  function shopFeedback(placeId) {
    if (!run || ended || !planned) return;
    const p = (C().places || []).find(x => x.id === placeId);
    if (!p || !(p.stayMin > 0) || feedbackSeen[placeId]) return;
    const hungriest = run.state.guests
      .filter(g => g.status === 'follow' && !g.satisfied && g.tag !== 'any')
      .sort((a, b) => (a.patience || 100) - (b.patience || 100)).slice(0, 2);
    if (!hungriest.length) return;
    feedbackSeen[placeId] = true;
    const st = run.state;
    const stageNames = ['清晨', '上午', '午后', '黄昏', '夜里'];
    const stage = stageNames[Math.floor((st.clockMin || 0) / 256)] || '午后';
    const ctx = {
      playerName: player.name || '游客',
      tags: hungriest.map(g => g.tag).join('、'),
      place: p.name, stage,
    };
    const localLine = () => {
      try { return WZ.guests.placeReaction(C(), hungriest[0].tag, (p.types || [])[0] || 'food'); } catch (e) { return ''; }
    };
    const myRun = run;
    Promise.resolve(WZ.net && WZ.net.online ? WZ.net.shopFeedback(p.name, ctx) : null).then(fb => {
      if (!run || ended || run !== myRun) return; // codex #11：局已切换丢弃旧响应
      if (!run.state.guests.some(g => g.status === 'follow')) return;
      const text = (fb && fb.text) || localLine();
      if (!text) return;
      // 说给最饿的那个游客；星级按真实点评分（无数据 3.5 星），AI 版反馈到货还带积分（每局限 8 次）
      const rt = (p.real && p.real.info && (p.real.info.rating || p.real.info.ctrip)) || 3.5;
      const stars = Math.max(2, Math.min(5, Math.round(rt)));
      const gp = engine().getGuestPos(hungriest[0].id) || engine().getPlayerPos();
      engine().addFloat(gp.x, gp.y - 56, '★'.repeat(stars) + '☆'.repeat(5 - stars) + ' 体验分', '#ffd166');
      handle([{ type: 'bubble', id: hungriest[0].id, text: text, ms: 2600, tone: 'info' }]);
      if (fb && fb.source === 'ai') {
        handle(run.addBonus(4, '进店感想·' + p.name));
        ui().hud.update(run.state);
      }
    }).catch(() => { /* 静默 */ });
  }
  function openPlaceCard(pid) {
    {
      const p = (C().places || []).find(x => x.id === pid); if (!p) return;
      const fl = lastFlags();
      const inRoute = run.state.route.includes(pid) && !run.state.visited.includes(pid);
      WZ.book.shopCard(p, { flag: fl[pid], state: run.state, walk: engine().walkMinFromPlayer(pid), inRoute,
        toggleLabel: inRoute ? '从路线移出' : '加进路线（排在下一站后）',
        onToggle: id => {
          const st = run.state, rest = st.route.filter(x => !st.visited.includes(x) && x !== id);
          if (!inRoute) rest.splice(Math.min(1, rest.length), 0, id);
          onReplan(st.route.filter(x => st.visited.includes(x)).concat(rest));
        } });
    }
  }
  // 真实 POI → 游戏地点（只用高德给的名称/类别/坐标；不编营业时间和评分）
  const POI_TYPES = { food: ['food'], cafe: ['food', 'rest'], shop: ['shop'], sight: ['sight'] };
  const POI_STAY = { food: 25, cafe: 30, shop: 20, sight: 30, hotel: 30 };
  function poiPlaceOf(q) {
    return { id: q.id, name: q.name.replace(/[（(].*?[)）]/g, '') || q.name, types: (POI_TYPES[q.cat] || []).slice(), x: q.x, y: q.y,
      stayMin: POI_STAY[q.cat] || 15, poi: true,
      real: { name: q.name, poi: q.aid, info: { src: ['高德'], note: '高德实采 POI，营业时间未采' } } };
  }
  function ensurePoiPlace(q) {
    let p = (C().places || []).find(x => x.id === q.id);
    if (p) return p;
    p = poiPlaceOf(q);
    C().places.push(p);
    engine().addPlace(p);
    return p;
  }
  WZ.poiPlaces = (cx, cy, r) => { // 插旗用：玩家附近的真实店铺（伪地点，不入库）
    const S = engine().getState(); if (!S || !S.pois) return [];
    return S.pois.filter(q => POI_TYPES[q.cat] && !q.added && Math.hypot(q.x - cx, q.y - cy) < r).map(poiPlaceOf);
  };


  // 暂停计数：停站卡/中断/名人卡叠加时，全部释放才恢复（审查 M1）
  let pauseDepth = 0;
  let deviateAt = 0; // 玩家手动点地的时刻（PRD-v2 F6 空闲回归用）
  function setPaused(v) {
    pauseDepth = Math.max(0, pauseDepth + (v ? 1 : -1));
    paused = pauseDepth > 0;
    engine().pause(paused);
  }

  // ---------- 规则命令 → 引擎/UI ----------
  function handle(cmds) {
    if (!cmds || !cmds.length) return;
    for (const c of cmds) {
      switch (c.type) {
        case 'bubble':
          engine().bubble(c.id, c.text, c.ms || 2200, c.tone);
          if (WZ.sfx) WZ.sfx.play('bubble');
          if (c.tone === 'bad') setTimeout(() => ui().tutorial('need', '红边气泡 = 他在抱怨。点他能看他今天说过的每一句；顶部引导条会告诉你最近能去哪解决。'), 600);
          break;
        case 'patience': { // 提示词 10：掉耐心叹气（同一时刻只响一声）/ 见底碎裂 / 哄好上扬 + 小爱心
          if (WZ.sfx && !c.quiet) WZ.sfx.play(c.calmed ? 'calm' : c.value <= 0 ? 'break' : c.delta < 0 ? 'sigh' : 'calm');
          if (c.calmed) { const gp = engine().getGuestPos(c.id); if (gp) { engine().addFloat(gp.x - 8, gp.y - 40, '❤', '#ff8ba9'); engine().addFloat(gp.x + 8, gp.y - 46, '❤', '#ff8ba9'); } }
          if (c.delta < 0) { ui().hud.pulse(c.id); firstUnhappy(c.id); }
          break;
        }
        case 'sit': engine().guestSit(c.id, true); if (WZ.sfx) WZ.sfx.play('drop'); break;
        case 'return': engine().guestSit(c.id, false); engine().guestReturn(c.id); if (WZ.sfx) WZ.sfx.play('back'); break;
        case 'runaway': engine().guestRunTo(c.id, c.placeId); if (WZ.sfx) WZ.sfx.play('drop'); break;
        case 'lost': engine().markLost(c.id); if (WZ.sfx) WZ.sfx.play('lose'); break;
        case 'clock': engine().setClock(c.clockMin); break;
        case 'hud': ui().hud.update(run.state); break;
        case 'weather': engine().setWeather(c.kind); break;
        case 'roadwork': engine().setRoadwork(c.placeId); break;
        case 'float': { // PRD-v3 P3：±♥ 浮字，飘在对应实体头顶
          const pos = engine().getGuestPos ? engine().getGuestPos(c.id) : null;
          const pp = pos || engine().getPlayerPos();
          engine().addFloat(pp.x, pp.y - 30, c.text, c.color);
          break;
        }
        case 'score': { // 积分（10/25）：队伍位置飘「+N」，HUD 计分
          const pp = engine().getPlayerPos();
          engine().addFloat(pp.x + 14, pp.y - 52, '+' + c.delta + ' 分', '#ffd166');
          if (WZ.sfx) WZ.sfx.play('calm');
          break;
        }
        case 'stay': if (WZ.sfx) WZ.sfx.play('stay'); onStay(c); break;
        case 'closed': if (WZ.sfx) WZ.sfx.play('drop'); ui().toast('🔒 ' + c.name + ' 已经关门了（营业 ' + c.hours + '）'); break;
        case 'interrupt': if (WZ.sfx) WZ.sfx.play('click'); onInterrupt(c); break;
        case 'celebrity': if (WZ.sfx) WZ.sfx.play('celeb'); onCelebrity(c); break;
        case 'end': if (WZ.sfx) WZ.sfx.play(c.reason === 'home' ? 'back' : 'lose'); onEnd(c.reason); break;
        default: break;
      }
    }
    engine().setGuests(run.state.guests);
  }

  function knowledgeText(id) {
    const k = (C().knowledge || []).find(x => x.id === id);
    return k ? k.text : ''; // 出处由 ui.showStay 按 knowledgeId 自行显示（QA #2）
  }

  function onStay(c) {
    const base = (C().places || []).find(p => p.id === c.placeId) || { id: c.placeId, name: c.placeId };
    const place = Object.assign({}, base, c.knowledgeId ? { knowledgeId: c.knowledgeId } : {}); // W3 ISSUES #4
    setPaused(true);
    engine().flash(240); // PRD-v4 §2.2：进店闪一帧（enter-flash）
    ui().showStay(place, knowledgeText(c.knowledgeId), () => {
      setPaused(false);
      engine().setClock(run.state.clockMin);
      if (ui().hud.setScore) ui().hud.setScore(run.state.score); // PRD-v4：收卡后 HUD 分数同步
      nextLeg();
    }, { score: c.score }); // PRD-v4 §2.2：逐个表态 ±分
  }

  // 自动走向路线中下一个未访问地点；没有则等待玩家点地面
  function nextLeg() {
    if (!run || ended) return;
    const next = (run.state.route || []).find(id => !(run.state.visited || []).includes(id));
    if (next) engine().goTo(next);
  }

  function onInterrupt(c) {
    setPaused(true);
    ui().showInterrupt({ title: c.title, a: c.a, b: c.b }, choice => {
      setPaused(false);
      handle(run.choose(c.id, choice));
    });
  }

  function onCelebrity(c) {
    // PRD-v2 F3：开场名人不挡路——顶部横幅，自动按「点头走过」结算（无成本）
    if (c.when === 'start') {
      const card = c.card || {};
      ui().showBanner({ tag: 'any', title: (card.name || '') + ' · ' + (card.title || ''), text: card.text || '' }, () => {
        if (!run || ended) return;
        handle(run.choose('celeb_' + c.who, 'b'));
        engine().setClock(run.state.clockMin);
      });
      return;
    }
    setPaused(true);
    // PRD-v3 P2：名人在世界里现身于典故地点——卡片出现前，先看到头顶跳「!」的小人
    const celebPlace = (C().places || []).find(p => p.name === (c.card.place || ''));
    if (celebPlace) {
      engine().spawnNPC({ id: 'celeb_' + c.who, label: c.card.name || '', placeId: celebPlace.id });
      engine().bubble('celeb_' + c.who, c.who === 'xie_lingyun' ? '且慢，考你一题。' : '且慢——', 1600, 'info');
    }
    // 10/24 提示词 8：谢灵运不再弹全屏卡，而是小跑进场后在屏幕下方三分之一出题（地图仍可见）
    if (c.who === 'xie_lingyun' && WZ.quiz && ui().showQuiz) {
      const q = WZ.quiz.pick(celebPlace ? celebPlace.id : run.state.lastPlaceId);
      const lines = ['小友，这一路山水，都是诗。', '云日相辉映，空水共澄鲜。今日的温州，也是这样。', '走累了就歇歇，山水不会跑。'];
      // 停站卡还开着就先等它收起（问答不和停站卡叠在一起）
      const whenFree = fn => { const t0 = Date.now(); const w = () => (ui().isStayOpen && ui().isStayOpen() && Date.now() - t0 < 120000) ? setTimeout(w, 300) : fn(); w(); };
      setTimeout(() => whenFree(() => ui().showQuiz({
        q, line: lines[Math.floor(Math.random() * lines.length)],
        onAnswer: right => { handle(run.quizResult(right)); ui().hud.update(run.state); },
        onDone: () => {
          engine().removeNPC('celeb_' + c.who);
          setPaused(false);
          handle(run.choose('celeb_' + c.who, 'b')); // 不花时间
          engine().setClock(run.state.clockMin);
        },
      })), celebPlace ? 1200 : 0);
      return;
    }
    let quiz = null;
    const show = card0 => ui().showCelebrity(quiz ? Object.assign({}, card0, { quiz }) : card0, choice => {
      if (ui().hide) ui().hide(); // 卡片由调用方收起（QA #1）
      engine().removeNPC('celeb_' + c.who);
      setPaused(false);
      handle(run.choose('celeb_' + c.who, choice === 'stay' ? 'a' : 'b'));
      engine().setClock(run.state.clockMin);
    });
    // 先尝试 AI 版文本，拿不到用模板
    if (WZ.celebrity && WZ.celebrity.request) {
      const ctx = {
        playerName: player.name,
        route: (run.state.route || []).map(id => ((C().places || []).find(p => p.id === id) || {}).name).filter(Boolean),
        tags: run.state.guests.map(g => g.tag), place: c.card.place || '', stage: c.card.stage || 0,
        content: C(), // 离线时名人模板也用 content/celebrities.js（审查 M2）
      };
      // 10/24：先让名人在地图上小跑进场（约 1.2 秒），再翻出卡片
      let done = false, got = null;
      const t0 = Date.now(), ENTER = celebPlace ? 1200 : 0;
      const go = card => { if (done) return; done = true; setTimeout(() => show(card), Math.max(0, ENTER - (Date.now() - t0))); };
      const t = setTimeout(() => go(c.card), 3300);
      WZ.celebrity.request(c.who, ctx, card => { clearTimeout(t); go(card || c.card); });
    } else setTimeout(() => show(c.card), celebPlace ? 1200 : 0);
  }

  // ---------- 结束 ----------
  function onEnd(reason) {
    if (ended) return;
    ended = true;
    day = null; unmountDayChip();
    if (engine().resetDistrict) engine().resetDistrict(); // codex #9：恢复全量 POI
    engine().stop();
    music('ending');
    if (ui().hideStay) ui().hideStay(); // PRD-v3：goHome 时清掉可能残留的停站前台页（dock 不归 overlay 管）
    if (ui().hideBanner) ui().hideBanner();
    if (ui().hideGuest) ui().hideGuest(true);
    if (ui().hideQuiz) ui().hideQuiz();
    if (WZ.book) { WZ.book.unmount(); WZ.book.closeShopCard(); }
    engine().setPlan(null); engine().setGuide(null);
    const lost = run.state.guests.filter(g => g.status === 'lost' || g.status === 'sit' || g.status === 'runaway').map(g => g.id);
    // 结尾站位按 guestLines 顺序画，丢失者留空（W3 ISSUES #6）
    const pre = {
      total: run.state.guests.length, lost, reason,
      guestLines: run.state.guests.map(g => ({ id: g.id, tag: g.tag, name: g.name, text: '', star: false })),
    };
    ui().showEnding(pre, wentBack => finishRun(!!wentBack));
  }

  async function finishRun(wentBack) {
    const result = run.finish({ wentBack });
    result.playerName = player.name;
    result.seat = WZ.net.seat();
    // 给后端 /api/mine 统计用：每位游客的困扰原句与是否丢失（W4 ISSUES #1）
    const lostSet = new Set(result.lost || []);
    result.troubles = run.state.guests.map(g => ({ tag: g.tag, text: g.line, lost: lostSet.has(g.id) }));
    WZ.net.postRun(result);
    const first = !flags.hasPlayed;
    flags.hasPlayed = true;

    // 提示词 11：结尾五幕放在「结算之后、再来一局之前」，只在人生第一局放一次（seen_ending）
    const playEpilogue = first && !flags.seenEnding;
    music('boards');
    ui().showResult(result, {
      onAgain: async () => {
        if (playEpilogue && !flags.seenEnding) {
          flags.seenEnding = true;
          const acts = (C().ending && C().ending.epilogueActs) || [];
          ui().showEpilogue(acts, async () => { const d = await pickDifficulty(); startRun(d); }, { finalLabel: '再来一局' });
          return;
        }
        const d = await pickDifficulty(); startRun(d);
      },
      onWhere: WZ.net.online ? showMine : null,
      onBoards: showBoards,
    });
  }

  async function showMine() {
    const m = await WZ.net.mine();
    if (!m) { ui().toast('暂时查不到，稍后再试'); return; }
    ui().showMine(m); // PRD-v2 F7：全屏页（含「还在池子里」文案），替代 1.5 秒 toast（评审 L14）
  }

  async function showBoards() {
    const b = await WZ.net.boards();
    if (!b) { ui().toast('排行榜需要联网'); return; }
    ui().showBoards(b);
  }

  // ---------- 入口 ----------
  window.addEventListener('DOMContentLoaded', () => {
    const missing = ['engine', 'rules', 'ui', 'net'].filter(k => !WZ[k]);
    if (missing.length) {
      document.body.innerHTML = `<pre style="color:#f87171;padding:20px">缺少模块：${missing.join(', ')}</pre>`;
      return;
    }
    boot();
  });

  // 商圈商家清单（shopsheet.js）需要的钩子——并入 WZ.main 字面量（先赋值再挂会炸）
  WZ.main = {
    flags, get run() { return run; }, startRun,
    dayInfo: () => (day && day.zi >= 0 ? { districtId: day.plan[day.zi].id, zi: day.zi } : null),
    walkToShop: e => {
      if (!run || ended) return;
      if (run.state.visited.includes(e.id)) { ui().toast(e.name + ' 已经去过了'); return; }
      if (e.poi) {
        const S = engine().getState();
        const q = (S.pois || []).find(x => x.id === e.id);
        if (!q) return;
        const p = ensurePoiPlace(q);
        engine().goTo(p.id);
      } else {
        engine().goTo(e.id);
      }
      ui().toast('去 ' + e.name);
    },
  };
})();
