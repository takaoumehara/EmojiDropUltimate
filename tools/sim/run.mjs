#!/usr/bin/env node
// ============================================================
// tools/sim/run.mjs — 自動プレイを何百回も回して、遊びの数字を出す
//
// なぜ要るのか:
//   このリポジトリのテストは「壊れていないこと」を守るが、
//   **面白さの手前にある欠陥**——初見が即死する / 30秒なにも起きない /
//   1体だけ突出して強い / 難易度の段差が崖になっている——には触れない。
//   人に遊ばせるまで分からない、とされてきた部分のうち、
//   **人が要らない部分**をここで先に潰す。
//
//   面白いかどうかは測れない。測れるのは床のほうだけ。
//   （測れないことの一覧は docs/sim-report.md の末尾に書いてある）
//
// 使い方:
//   node tools/sim/run.mjs                      # 既定の全量（約30秒）
//   node tools/sim/run.mjs --seeds 1 --chars 0  # 素早い確認
//   node tools/sim/run.mjs --bots hunter,dodge,sweep
//   node tools/sim/run.mjs --wall-clock         # director を実時間のまま測る
//   node tools/sim/run.mjs --baseline           # tools/sim/baseline.json を更新
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAll } from './pool.mjs';
import { buildGrid, DIFF_NAME } from './grid.mjs';
import { pct, mean } from './metrics.mjs';
import { CHARS } from '../../src/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

// --- 引数 ---------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const val = (name, d) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const list = (name, d) => {
  const v = val(name, null);
  return v === null ? d : (v === 'all' ? null : v.split(',').map(s => s.trim()));
};

const seeds = (list('seeds', ['1', '2', '3']) || ['1', '2', '3']).map(Number);
const charsArg = list('chars', null);
const chars = charsArg ? charsArg.map(s => (/^\d+$/.test(s) ? Number(s) : CHARS.findIndex(c => c.id === s))) : null;
const diffsArg = list('diffs', null);
const diffs = diffsArg ? diffsArg.map(Number) : null;
const bots = list('bots', ['hunter']) || ['hunter', 'dodge', 'sweep', 'idle'];
const stagesArg = list('stages', null);
const stages = stagesArg ? stagesArg.map(Number) : [0];

if (chars && chars.some(i => i < 0 || i >= CHARS.length)) {
  console.error('--chars に未知のキャラがある。id か 0..15 の番号で指定する。');
  process.exit(2);
}

const cells = buildGrid({ seeds, chars, diffs, bots, stages, wallClock: flag('wall-clock'), freezeDirector: flag('freeze-director'), maxSecs: Number(val('secs', 0)) });

// --- 実行 ---------------------------------------------------
const t0 = Date.now();
let lastPrint = 0;
const rows = await runAll(cells, {
  onProgress(done, total) {
    if (Date.now() - lastPrint < 400 && done !== total) return;
    lastPrint = Date.now();
    process.stderr.write(`\r  ${done}/${total} …`);
  },
});
process.stderr.write(`\r  ${rows.length}/${rows.length} 完了 (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);

const failed = rows.filter(r => r.error);
if (failed.length) {
  console.error(`\n例外が出た実行が ${failed.length} 件ある:`);
  for (const f of failed.slice(0, 3)) console.error(`  ${f.charEmoji} seed${f.seed} diff${f.diff}: ${String(f.error).split('\n')[0]}`);
}

// --- 集計 ---------------------------------------------------
const ok = rows.filter(r => !r.error);
const by = (rowsIn, keyFn) => {
  const m = new Map();
  for (const r of rowsIn) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
};

const summarize = (rs) => ({
  n: rs.length,
  clearRate: +(rs.filter(r => r.cleared).length / rs.length).toFixed(3),
  medSeconds: pct(rs.map(r => r.seconds), 0.5),
  medScore: pct(rs.map(r => r.score), 0.5),
  medDeaths: pct(rs.map(r => r.deaths), 0.5),
  medAccuracy: pct(rs.filter(r => r.accuracy != null).map(r => r.accuracy), 0.5),
  ttfd: pct(rs.filter(r => r.timeToFirstDeath != null).map(r => r.timeToFirstDeath), 0.5),
  neverDied: rs.filter(r => r.timeToFirstDeath === null).length,
  deadMaxSec: Math.max(...rs.map(r => r.deadMaxSec)),
  deadRatio: +mean(rs.map(r => r.deadRatio)).toFixed(4),
  causes: rs.reduce((a, r) => {
    for (const k of Object.keys(r.causes || {})) a[k] = (a[k] || 0) + r.causes[k];
    return a;
  }, {}),
  meanThreatDist: (() => {
    const v = rs.map(r => r.meanThreatDist).filter(x => x != null);
    return v.length ? +mean(v).toFixed(1) : null;
  })(),
  peakParticles: Math.max(...rs.map(r => r.peakParticles)),
  bellsSeen: rs.reduce((s, r) => s + r.bellsSeen, 0),
  bellsGot: rs.reduce((s, r) => s + r.bellsGot, 0),
  bellsMissed: rs.reduce((s, r) => s + r.bellsMissed, 0),
});

const result = {
  generatedBy: 'tools/sim/run.mjs',
  cells: cells.length, ok: ok.length, failed: failed.length,
  elapsedMs: Date.now() - t0,
  axes: { seeds, chars: chars || 'all', diffs: diffs || 'all', bots, stages, wallClock: flag('wall-clock'), freezeDirector: flag('freeze-director') },
  overall: ok.length ? summarize(ok) : null,
  byChar: Object.fromEntries([...by(ok.filter(r => r.bot === 'hunter'), r => r.charId)]
    .map(([k, v]) => [k, summarize(v)])),
  byDiff: Object.fromEntries([...by(ok.filter(r => r.bot === 'hunter'), r => r.diff)]
    .map(([k, v]) => [k, summarize(v)])),
  byBot: Object.fromEntries([...by(ok, r => r.bot)].map(([k, v]) => [k, summarize(v)])),
  stands: ok.flatMap(r => r.stands).reduce((m, s) => (m[s] = (m[s] || 0) + 1, m), {}),
  errors: failed.map(f => ({ char: f.charId, seed: f.seed, diff: f.diff, bot: f.bot, error: String(f.error).split('\n')[0] })),
};

const outPath = val('out', null);
if (outPath) fs.writeFileSync(path.resolve(ROOT, outPath), JSON.stringify(result, null, 2) + '\n');
if (flag('baseline')) {
  fs.writeFileSync(path.join(HERE, 'baseline.json'), JSON.stringify(result, null, 2) + '\n');
  console.error('  tools/sim/baseline.json を更新した');
}
if (flag('json')) console.log(JSON.stringify(result, null, 2));
if (flag('report')) {
  const { writeReport } = await import('./report.mjs');
  const p = writeReport(result, ok, ROOT);
  console.error(`  ${path.relative(ROOT, p)} を書いた`);
}

// --- 端末向けの要約 -----------------------------------------
if (!flag('json')) {
  const o = result.overall;
  if (!o) { console.log('成功した実行が無い。'); process.exit(1); }
  console.log(`\n全体: ${o.n}本 / 突破率 ${(o.clearRate * 100).toFixed(0)}% / 中央値 ${o.medSeconds}秒 / 命中率 ${(o.medAccuracy * 100).toFixed(0)}%`);
  console.log(`空白: 最長 ${o.deadMaxSec}秒 / 全体の ${(o.deadRatio * 100).toFixed(1)}%`);
  console.log(`ベル: 出た${o.bellsSeen} 取った${o.bellsGot} 逃した${o.bellsMissed}`);
  console.log(`札  : ${Object.entries(result.stands).map(([k, v]) => `${k}=${v}`).join(' ') || '(引かれず)'}`);
  if (Object.keys(result.byChar).length > 1) {
    const cs = Object.entries(result.byChar).sort((a, b) => (a[1].medSeconds ?? 1e9) - (b[1].medSeconds ?? 1e9));
    const fast = cs[0], slow = cs[cs.length - 1];
    console.log(`速い: ${fast[0]} ${fast[1].medSeconds}秒 / 遅い: ${slow[0]} ${slow[1].medSeconds}秒 (比 ${(slow[1].medSeconds / fast[1].medSeconds).toFixed(2)}倍)`);
  }
}
process.exit(failed.length ? 1 : 0);
