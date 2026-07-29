// ============================================================
// headless.test.js — ゲームが画面なしで、最後まで正しく走ることの証明
//
// ここが通ることの意味:
//   1. src/engine.js はブラウザから独立している(常駐サーバーに載せられる)
//   2. 「湧く→撃つ→当たる→死ぬ→復活→ボス→クリア→次の面」の全経路が生きている
//   3. 待ち時間が実時間ではなくゲーム内時間で進む(裏タブ・サーバーで壊れない)
//
// サーバーへ進まないと決めても、これは長時間プレイの回帰テストとして残る。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot, sim, makeHunter, Bot, shutdown } from './headless.js';

// 1ステージぶんに十分な歩数。実測ではステージ0の完全クリアが約16,000歩。
const STAGE_STEPS = 60 * 1200;   // ゲーム内20分ぶん

test('ゲームロジックは画面なしで起動できる', async () => {
  const h = await boot({ seed: 1 });
  assert.ok(h.env.W > 0 && h.env.H > 0, 'resize() 後に画面サイズが入っていること');
  assert.equal(typeof h.engine.update, 'function');
  h.engine.startRun(0);
  assert.ok(['intro', 'play'].includes(h.state.game.state));
  shutdown(h);
});

test('1ステージを通しでクリアでき、次のステージへ進む', async () => {
  const h = await boot({ seed: 7 });
  h.engine.startRun(0);
  const r = sim(h, {
    steps: STAGE_STEPS,
    bot: makeHunter(h.geo),
    until: g => g.stageIndex > 0 || g.state === 'over',
  });
  shutdown(h);

  assert.equal(r.error, null, r.error && r.error.stack);
  assert.equal(r.game.stageIndex, 1, 'ボスを倒してステージ1へ進んでいること');
  // 「湧く→撃つ→当たる」が全部起きた証拠。どれか0なら経路が死んでいる。
  assert.ok(r.peak.enemies > 0, '敵が湧いたこと');
  assert.ok(r.peak.pBullets > 0, '自機が撃ったこと');
  assert.ok(r.peak.eBullets > 0, '敵が撃ち返したこと');
  assert.ok(r.peak.boss > 0, 'ボスが出たこと');
  assert.ok(r.game.score > 1000, `スコアが積み上がったこと (${r.game.score})`);
  // クリア演出を必ず通っていること
  assert.ok(r.states.includes('finale'), `クリア演出を通ること: ${r.states.join('>')}`);
});

test('残機が尽きるとゲームオーバーへ到達する(実時間に依存しない)', async () => {
  // 後半ステージは実測で必ず力尽きる。ここで見たいのは「終われること」。
  // かつてこの待ちは setTimeout(実時間)だったため、dt で進めるだけの
  // 実行では永久に復活せず、ゲームオーバーにも到達しなかった。
  const h = await boot({ seed: 7 });
  h.engine.startRun(4);
  const r = sim(h, {
    steps: STAGE_STEPS,
    bot: makeHunter(h.geo),
    until: g => g.state === 'over',
  });
  shutdown(h);

  assert.equal(r.error, null, r.error && r.error.stack);
  assert.equal(r.game.state, 'over');
  assert.equal(r.game.lives, 0);
});

test('死んでも残機があれば復活する', async () => {
  const h = await boot({ seed: 3 });
  h.engine.startRun(4);
  // 一度死ぬまで進める
  const a = sim(h, { steps: STAGE_STEPS, bot: Bot.idle, until: g => g.lives < 3 });
  assert.ok(a.game.lives < 3, '被弾して残機が減ったこと');
  // 復活は 500ms 後。ゲーム内時間で 1 秒ぶん進めれば必ず戻っている。
  sim(h, { steps: 60, bot: Bot.idle });
  shutdown(h);
  assert.equal(h.state.game.player.dead, false, '残機があるうちは復活すること');
});

test('同じ種は同じ結果になる(サーバーとクライアントで再現できる)', async () => {
  const run = async () => {
    const h = await boot({ seed: 99 });
    h.engine.startRun(0);
    const r = sim(h, { steps: 60 * 60, bot: makeHunter(h.geo) });
    shutdown(h);
    return { score: r.game.score, lives: r.game.lives, kills: r.game.stats.kills };
  };
  const a = await run();
  const b = await run();
  assert.deepEqual(b, a, `同じ種なら同じ結果になること: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
});

test('長時間まわしても例外が出ない', async () => {
  // ゲーム内で 1 時間ぶん。実測で 1 秒未満で終わる。
  const h = await boot({ seed: 2026 });
  h.engine.startRun(0);
  const r = sim(h, { steps: 60 * 3600, bot: makeHunter(h.geo) });
  shutdown(h);
  assert.equal(r.error, null, r.error && r.error.stack);
});

test('サーバーに載せられる速度で回る', async () => {
  // 常駐サーバーは 1 部屋あたり毎秒 60 歩を進める必要がある。
  // ここでは実時間の何倍で回せるかを測り、余裕があることを示す。
  const h = await boot({ seed: 5 });
  h.engine.startRun(0);
  const steps = 60 * 60;   // ゲーム内 1 分
  const t0 = process.hrtime.bigint();
  const r = sim(h, { steps, bot: makeHunter(h.geo) });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  shutdown(h);
  assert.equal(r.error, null, r.error && r.error.stack);
  const realtimeFactor = (steps / 60) / (ms / 1000);
  assert.ok(realtimeFactor > 20,
    `実時間の20倍以上で回ること(=1コアで20部屋ぶんの余裕): 実測 ${realtimeFactor.toFixed(0)}倍`);
});

// ============================================================
// 隊列(インベーダー) — 「画面全部が同時に迫る」set-piece
// ============================================================

/** 隊列のウェーブだけを狙って湧かせる。 */
async function spawnMarch(seed = 11) {
  const h = await boot({ seed });
  h.engine.startRun(0);
  sim(h, { steps: 200, bot: Bot.idle });          // intro を抜ける
  const g = h.state.game;
  g.waveIdx = h.config.PATTERNS.length - 1;       // 隊列は PATTERNS の最後
  g.nextWave = 0; g.enemies = [];
  sim(h, { steps: 4, bot: Bot.idle });
  return { h, g, march: g.enemies.filter(e => e.type === 'march') };
}

test('隊列はひとかたまりとして湧く', async () => {
  const { h, march } = await spawnMarch();
  shutdown(h);
  assert.ok(march.length >= 12, `複数列ぶん湧くこと (${march.length})`);
  const squads = new Set(march.map(e => e.sq));
  assert.equal(squads.size, 1, '全員が同じ台帳を共有すること(バラバラに動かない)');
  // 3段に分かれて並んでいる
  const rows = new Set(march.map(e => e.progOff));
  assert.equal(rows.size, 3);
});

test('端に着いたら折り返し、そのたびに一段こちらへ進む', async () => {
  const { h, g, march } = await spawnMarch();
  const sq = march[0].sq;
  let flips = 0, last = sq.dir;
  const progAt = [];
  for (let i = 0; i < 60 * 30; i++) {
    h.engine.update(1 / 60, {});
    if (sq.dir !== last) { flips++; last = sq.dir; progAt.push(sq.prog); }
  }
  shutdown(h);
  assert.ok(flips >= 4, `何度も折り返すこと (${flips})`);
  // 折り返すたびに必ず前へ出る(その場で往復し続けない)
  for (let i = 1; i < progAt.length; i++) {
    assert.ok(progAt[i] > progAt[i - 1], '折り返しのたびに前進すること');
  }
});

test('隊列は画面の外へはみ出さない', async () => {
  const { h, g, march } = await spawnMarch();
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 60 * 25; i++) {
    h.engine.update(1 / 60, {});
    for (const e of g.enemies) {
      if (e.type !== 'march' || e.diving) continue;
      const l = h.geo.isVert() ? e.x : e.y;
      if (l < lo) lo = l; if (l > hi) hi = l;
    }
  }
  const span = h.geo.isVert() ? h.env.W : h.env.H;
  shutdown(h);
  assert.ok(lo > 0 && hi < span, `画面内に収まること (${lo.toFixed(0)}..${hi.toFixed(0)} / ${span})`);
  assert.ok(hi - lo > span * 0.5, `画面の幅を実際に使って往復すること (${(hi - lo).toFixed(0)})`);
});

test('倒すほど残りが速くなる', async () => {
  const { h, g, march } = await spawnMarch();
  const sq = march[0].sq;
  const rate = () => {
    const a = sq.latOff;
    for (let i = 0; i < 30; i++) h.engine.update(1 / 60, {});
    return Math.abs(sq.latOff - a);
  };
  const full = rate();
  // 半分倒す
  const alive = g.enemies.filter(e => e.sq === sq);
  for (const e of alive.slice(0, Math.floor(alive.length / 2))) {
    g.enemies = g.enemies.filter(x => x !== e);
  }
  const half = rate();
  shutdown(h);
  assert.ok(half > full * 1.2,
    `残りが減ったら速くなること: 満員 ${full.toFixed(1)} → 半減 ${half.toFixed(1)}`);
});

test('ときどき1体が隊列を離れて突っ込んでくる', async () => {
  const { h, g, march } = await spawnMarch();
  let sawDive = false, maxAtOnce = 0;
  for (let i = 0; i < 60 * 30 && !sawDive; i++) {
    h.engine.update(1 / 60, {});
    const d = g.enemies.filter(e => e.diving).length;
    maxAtOnce = Math.max(maxAtOnce, d);
    if (d > 0) sawDive = true;
  }
  shutdown(h);
  assert.ok(sawDive, '30秒のうちに必ず1体は飛び出すこと');
  assert.ok(maxAtOnce <= 2, `一度に飛び出すのは1〜2体まで(全員来たら避けようがない): ${maxAtOnce}`);
});

test('隊列が出ても例外なく最後まで走る', async () => {
  const { h, g } = await spawnMarch(2026);
  const r = sim(h, { steps: 60 * 300, bot: makeHunter(h.geo) });
  shutdown(h);
  assert.equal(r.error, null, r.error && r.error.stack);
});
