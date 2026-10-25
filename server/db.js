'use strict';
// SQLite 封装：优先 better-sqlite3；不可用时回退到 Node 22+ 内置 node:sqlite。
// 两者 prepare().run/get/all 语义一致，这里只做极薄的适配。

const fs = require('fs');
const path = require('path');

function openRaw(file) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(file);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 3000');
    return { db, driver: 'better-sqlite3' };
  } catch (e) {
    // better-sqlite3 未安装或原生模块 ABI 不匹配 → 内置 node:sqlite
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 3000');
    return { db, driver: 'node:sqlite' };
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS troubles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  seat        TEXT NOT NULL,
  tag         TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_troubles_seat ON troubles(seat);

CREATE TABLE IF NOT EXISTS runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  seat          TEXT NOT NULL,
  result_json   TEXT NOT NULL,
  remembered    INTEGER NOT NULL DEFAULT 0,
  arrive_min    INTEGER NOT NULL DEFAULT 0,
  overtime      INTEGER NOT NULL DEFAULT 0,
  lost_count    INTEGER NOT NULL DEFAULT 0,
  brought_back  INTEGER NOT NULL DEFAULT 0,
  score         INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_seat ON runs(seat);

CREATE TABLE IF NOT EXISTS assignments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  trouble_id   INTEGER NOT NULL,
  seat         TEXT NOT NULL,
  run_id       INTEGER,
  brought_home INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assign_trouble ON assignments(trouble_id);
CREATE INDEX IF NOT EXISTS idx_assign_seat ON assignments(seat);
`;

function addColumn(db, table, col, ddl) {
  try { db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`).run(); } catch (_) { /* 列已存在 */ }
}

function open(file) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const { db, driver } = openRaw(file);
  db.exec(SCHEMA);
  addColumn(db, 'runs', 'score', 'INTEGER NOT NULL DEFAULT 0'); // 旧库迁移（10/25 积分）
  const now = () => Date.now();

  const st = {
    insertTrouble: db.prepare('INSERT INTO troubles (seat, tag, text, created_at) VALUES (?, ?, ?, ?)'),
    sampleTroubles: db.prepare(
      'SELECT id, seat, tag, text FROM troubles WHERE seat <> ? ORDER BY RANDOM() LIMIT ?'
    ),
    lastTroubleBySeat: db.prepare(
      'SELECT id, tag, text, created_at FROM troubles WHERE seat = ? ORDER BY id DESC LIMIT 1'
    ),
    insertAssignment: db.prepare(
      'INSERT INTO assignments (trouble_id, seat, run_id, brought_home, created_at) VALUES (?, ?, NULL, 0, ?)'
    ),
    // 该座位全部未绑定 run 的 assignments（新→旧）；runs 时匹配上的绑定、匹配不上的删除
    pendingAssignments: db.prepare(
      'SELECT a.id, a.trouble_id, t.tag, t.text FROM assignments a JOIN troubles t ON t.id = a.trouble_id ' +
      'WHERE a.seat = ? AND a.run_id IS NULL ORDER BY a.id DESC'
    ),
    bindAssignment: db.prepare('UPDATE assignments SET run_id = ?, brought_home = ? WHERE id = ?'),
    deleteAssignment: db.prepare('DELETE FROM assignments WHERE id = ?'),
    insertRun: db.prepare(
      'INSERT INTO runs (seat, result_json, remembered, arrive_min, overtime, lost_count, brought_back, score, created_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ),
    boardScore: db.prepare(
      'SELECT seat, result_json, score AS value, created_at AS at FROM runs ' +
      'WHERE score > 0 ORDER BY score DESC, id ASC LIMIT 20'
    ),
    boardRemembered: db.prepare(
      'SELECT seat, result_json, remembered AS value, created_at AS at FROM runs ' +
      'ORDER BY remembered DESC, arrive_min ASC, id ASC LIMIT 20'
    ),
    boardFastest: db.prepare(
      'SELECT seat, result_json, arrive_min AS value, created_at AS at FROM runs ' +
      "WHERE overtime = 0 AND brought_back = json_extract(result_json, '$.total') " +
      'ORDER BY arrive_min ASC, id ASC LIMIT 20'
    ),
    boardLost: db.prepare(
      'SELECT seat, result_json, lost_count AS value, created_at AS at FROM runs ' +
      'WHERE lost_count > 0 ORDER BY lost_count DESC, id ASC LIMIT 20'
    ),
    // 只统计已结算（绑定了 run）的分配：sample 多抽的、弃局未结算的都不算（REVIEW M4）
    mineStats: db.prepare(
      'SELECT COUNT(*) AS assigned, COALESCE(SUM(brought_home), 0) AS broughtHome ' +
      'FROM assignments a JOIN troubles t ON t.id = a.trouble_id WHERE t.seat = ? AND a.run_id IS NOT NULL'
    ),
    // 清理某座位超过 1 小时仍未结算的分配（弃局）
    purgeStalePending: db.prepare('DELETE FROM assignments WHERE seat = ? AND run_id IS NULL AND created_at < ?'),
    countTroubles: db.prepare('SELECT COUNT(*) AS c FROM troubles'),
  };

  return {
    driver,
    file,

    insertTrouble(seat, tag, text) {
      const r = st.insertTrouble.run(seat, tag, text, now());
      return Number(r.lastInsertRowid);
    },

    // 随机抽样（排除 exclude 座位）
    sampleTroubles(n, exclude) {
      return st.sampleTroubles.all(exclude || '', n);
    },

    // 记录这些困扰被分配给了 seat（run_id 稍后由 insertRun 绑定）
    recordAssignments(seat, troubleIds) {
      const t = now();
      st.purgeStalePending.run(seat, t - 60 * 60 * 1000);
      for (const id of troubleIds) st.insertAssignment.run(id, seat, t);
    },

    // 保存一局；同时把该座位最近 total 条待绑定 assignments 绑定到本 run
    insertRun(seat, result) {
      const lost = Array.isArray(result.lost) ? result.lost : [];
      const lostTexts = new Set(
        (Array.isArray(result.guestLines) ? result.guestLines : [])
          .filter((g) => lost.includes(g.id))
          .map((g) => g.text)
      );
      const r = st.insertRun.run(
        seat,
        JSON.stringify(result),
        Number(result.remembered) || 0,
        Number(result.arriveMin) || 0,
        result.overtime ? 1 : 0,
        lost.length,
        Number(result.broughtBack) || 0,
        Number(typeof result.score === 'object' && result.score !== null ? result.score.total : result.score) || 0,
        now()
      );
      const runId = Number(r.lastInsertRowid);
      const total = Math.max(1, Number(result.total) || 5);
      const pend = st.pendingAssignments.all(seat);
      // 判定游客是否被带回家（Lead 裁决 2026-10-23，REVIEW M4）：
      // 前端抽样条数（size+3）多于实际入队数，所以 sample 时只"记录"，这里才"结算"：
      // - 有 result.troubles:[{tag,text,lost}]：按 (tag,text) 匹配得上的绑定 run 并写 brought_home = !lost，
      //   匹配不上的（未入队）直接删除，不计入 assigned；同一条困扰只匹配一次。
      // - 无 result.troubles：兜底绑定最近 total 条（lost 里既可能是 guestId 也可能是困扰文本），其余删除。
      const troubles = Array.isArray(result.troubles) ? result.troubles : null;
      const lostSet = new Set(lost.map(String));
      if (troubles) {
        const remaining = troubles.filter((t) => t && typeof t === 'object').map((t) => ({ tag: t.tag, text: String(t.text), lost: Boolean(t.lost) }));
        for (const a of pend) {
          const i = remaining.findIndex((t) => t.tag === a.tag && t.text === a.text);
          if (i < 0) { st.deleteAssignment.run(a.id); continue; }
          st.bindAssignment.run(runId, remaining[i].lost ? 0 : 1, a.id);
          remaining.splice(i, 1);
        }
      } else {
        pend.forEach((a, idx) => {
          if (idx >= total) { st.deleteAssignment.run(a.id); return; }
          const isLost = lostTexts.has(a.text) || lostSet.has(a.text) || lostSet.has(String(a.trouble_id));
          st.bindAssignment.run(runId, isLost ? 0 : 1, a.id);
        });
      }
      return runId;
    },

    boards() {
      const fmt = (rows) => rows.map((r) => {
        let name = '';
        try { name = JSON.parse(r.result_json).playerName || JSON.parse(r.result_json).name || ''; } catch (_) { /* 忽略 */ }
        return { seat: String(r.seat).slice(0, 4), name, value: r.value, at: r.at };
      });
      return {
        remembered: fmt(st.boardRemembered.all()),
        fastest: fmt(st.boardFastest.all()),
        lost: fmt(st.boardLost.all()),
        score: fmt(st.boardScore.all()),
      };
    },

    mine(seat) {
      const last = st.lastTroubleBySeat.get(seat);
      const stats = st.mineStats.get(seat) || { assigned: 0, broughtHome: 0 };
      return {
        text: last ? last.text : null,
        tag: last ? last.tag : null,
        assigned: Number(stats.assigned) || 0,
        broughtHome: Number(stats.broughtHome) || 0,
      };
    },

    countTroubles() {
      return Number(st.countTroubles.get().c);
    },

    close() {
      try { db.close(); } catch (_) { /* 忽略 */ }
    },
  };
}

module.exports = { open };
