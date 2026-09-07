// ============================================================
// test/sim.test.js — 自動プレイで測った数字が「崩壊」していないかの門番
//
// なぜ要るのか:
//   tools/sim/ は 576本の自動プレイから、突破率・所要時間・空白・
//   キャラ間の開きを出す。だがそれは 50秒かかるので `node --test` には置けない
//   （このスイートは 2.5秒で終わることに意味がある）。
//
//   そこでここでは **数字そのものを固定しない**。固定すると、バランスを
//   1ミリ触るたびにテストが落ち、やがて全員が失敗を無視するようになる。
//   守るのは「崩壊の検知」だけ —— どれかのキャラが完全に遊べなくなった、
//   難易度設定が効かなくなった、空白が延びた、例外が出るようになった。
//
//   精密な数字は docs/sim-report.md に、崩壊の検知だけをここに置く。
//
//   baseline.json は `node tools/sim/run.mjs --chars all --diffs all \
//   --seeds 1,2,3 --bots hunter,dodge,sweep,idle --baseline --report` で更新する。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARS } from '../src/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/sim/baseline.json'), 'utf8'));

// === 基準そのものの健全性 ===================================

test('基準は16体すべてを走らせた結果になっている', () => {
  const ids = Object.keys(base.byChar);
  assert.equal(ids.length, CHARS.length,
    `基準が ${ids.length} 体ぶんしかない。--chars all で取り直すこと`);
  for (const c of CHARS) {
    assert.ok(base.byChar[c.id], `${c.emoji} ${c.id} が基準に無い`);
  }
});

test('自動プレイで例外がひとつも出ていない', () => {
  assert.equal(base.failed, 0,
    `例外が出た実行が ${base.failed} 件ある: ${JSON.stringify(base.errors?.slice(0, 3))}`);
});

// === 遊びが成立しているか ===================================

test('どのキャラも「一度も進めない」状態になっていない', () => {
  // 突破率0%のキャラは居てよい（ボットの操縦の癖が出るため）。
  // 許さないのは **一度も敵を倒せない / 一度も撃てない** ような完全な死に体。
  for (const [id, s] of Object.entries(base.byChar)) {
    assert.ok(s.medScore > 0, `${id} は一度も得点していない`);
    assert.ok(s.medAccuracy === null || s.medAccuracy > 0.02,
      `${id} の命中率が ${s.medAccuracy} —— 弾が当たっていない`);
  }
});

test('むずかしさの設定が効いている（やさしい > ふつう > むずかしい）', () => {
  const e = base.byDiff['0'], n = base.byDiff['1'], h = base.byDiff['2'];
  assert.ok(e && n && h, '3段すべての結果が要る');
  assert.ok(e.clearRate > n.clearRate,
    `やさしい(${e.clearRate}) がふつう(${n.clearRate}) より易しくない`);
  assert.ok(n.clearRate > h.clearRate,
    `ふつう(${n.clearRate}) がむずかしい(${h.clearRate}) より易しくない`);
});

test('遊びが止まる空白が長すぎない', () => {
  // 敵も弾もボスも居ないフレームが続く = 何もすることがない時間。
  // 10秒は「間」ではなく「バグ」の水準。
  assert.ok(base.overall.deadMaxSec < 10,
    `空白が最長 ${base.overall.deadMaxSec} 秒ある。10秒未満に保つこと`);
});

test('キャラ間の開きが、これ以上ひらいていない', () => {
  // いまの実測は 3.19倍（docs/sim-report.md）。
  // 「全員ほぼ同じ強さ」という設計意図（docs/superforge.md）とは開きがあり、
  // そこは report 側で扱う。ここで止めるのは **さらなる悪化**だけ。
  const times = Object.values(base.byChar).map(s => s.medSeconds).filter(v => v != null);
  const ratio = Math.max(...times) / Math.min(...times);
  assert.ok(ratio < 5,
    `所要時間の開きが ${ratio.toFixed(2)}倍。5倍を超えたら、もう「クセの違い」では説明できない`);
});

test('ボス終盤の札が、ひとつの札に偏っていない', () => {
  const counts = Object.values(base.stands);
  const total = counts.reduce((s, v) => s + v, 0);
  assert.ok(total > 0, '札が一度も引かれていない');
  assert.ok(Math.max(...counts) / total < 0.5,
    `1枚の札が全体の ${((Math.max(...counts) / total) * 100).toFixed(0)}% を占めている`);
  assert.ok(Object.keys(base.stands).length >= 4,
    `観測された札が ${Object.keys(base.stands).length} 種しかない。6枚のうち4種は出ること`);
});

// === ハーネス自体がまだ生きているか =========================

test('自動プレイは、いまも決定的に走る', async () => {
  // ここだけ実際に走らせる。2本ぶん(約0.6秒)。
  // 同じ種で結果が変わったら、tools/sim が出す数字はすべて信用できない。
  const { runAll } = await import('../tools/sim/pool.mjs');
  const { buildGrid } = await import('../tools/sim/grid.mjs');
  const cells = buildGrid({ seeds: [7], chars: [0], diffs: [1], bots: ['hunter'] });
  const a = await runAll(cells);
  const b = await runAll(cells);
  assert.equal(a[0].error, null, a[0].error);
  assert.deepEqual(b, a, '同じ種なのに結果が変わった —— ワーカーの使い回しを疑うこと');
});
