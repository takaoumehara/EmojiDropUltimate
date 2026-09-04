// ============================================================
// tools/sim/worker.mjs — 自動プレイを **1回だけ** 走らせるワーカー
//
// なぜ1回だけなのか（ここが一番大事）:
//   test/headless.js の boot() は動的 import() で src/ を読む。
//   **ES モジュールはプロセス内でキャッシュされる**ので、同じプロセスで
//   2回目の boot() を呼んでも、返ってくるのは1回目に汚れたモジュールのままだ。
//   Math.random だけは撒き直されるが、セーブデータ・学習するボス(bossai)・
//   ディレクター・ボス終盤の札の履歴は前の回を引きずる。
//
//   実測（このハーネスを書く前に確かめた）:
//     同一プロセスで seed 7 を2回 → 11195歩/163700点 と 6997歩/144500点。同じ種なのに違う。
//     プロセスを分けて seed 7 を3回 → 3回とも 11195歩/163700点。完全一致。
//
//   なので **1ワーカー = 1実行**。worker_threads はワーカーごとに独立した
//   モジュールレジストリを持つので、使い回さない限り決定性が保てる。
//   使い回しは絶対にしないこと。数字が静かに嘘になる。
//
// 時計について:
//   src/director.js だけが performance.now()（実時間）で
//   「直近25秒の被弾」「直近20秒の撃破」を見ている。ゲームの他の待ちは
//   すべてゲーム内時間へ移された（実時間だと裏タブで止まるため）あとなので、
//   ここだけが取り残されている。
//   自動プレイは実時間の数百倍速で回るため、実時間のままだと
//   **窓が一度も閉じず、走り出しからの全被弾が「直近」に数えられる**。
//   既定では performance.now() をゲーム内時計に差し替えて、
//   ブラウザで遊んだときと同じ条件にする。--wall-clock で素の挙動も測れる。
// ============================================================
import { parentPort, workerData } from 'node:worker_threads';
import { makeCollector } from './metrics.mjs';

const HEADLESS = new URL('../../test/headless.js', import.meta.url).href;

/** ゲーム内時計。bootstrap と src/ が読み込まれる**前に**差し込む必要がある。 */
function installGameClock() {
  const clock = { ms: 0 };
  const real = globalThis.performance;
  globalThis.performance = {
    now: () => clock.ms,
    timeOrigin: real ? real.timeOrigin : 0,
    // 使われていないが、消すと何かが落ちたときに原因が分かりにくくなる
    mark() {}, measure() {}, getEntriesByName: () => [], clearMarks() {}, clearMeasures() {},
  };
  return clock;
}

export async function runOne(cell) {
  const { seed, charIndex, diff, stage, bot: botName, steps, wallClock = false, freezeDirector = false } = cell;
  const clock = wallClock ? null : installGameClock();

  const { boot, sim, shutdown, Bot, makeHunter } = await import(HEADLESS);
  const h = await boot({ seed });
  const { Save } = await import(new URL('../../src/save.js', import.meta.url).href);

  if (charIndex != null) Save.setChar(charIndex);
  if (diff != null) Save.setDiff(diff);

  // ディレクターを凍らせて走らせる比較。engine 側には手を入れず、
  //   update() を無効化して倍率を 1 のまま固定する。
  //   「動的難易度が本当に効いているか」は、これと生きた状態の**分散の差**で見る。
  if (freezeDirector) {
    const { Director } = await import(new URL('../../src/director.js', import.meta.url).href);
    Director.reset();
    Director.update = () => {};
  }

  const bot = botName === 'hunter' ? makeHunter(h.geo) : Bot[botName];
  if (!bot) throw new Error(`未知のボット: ${botName}`);

  const col = makeCollector(h.geo);
  h.engine.startRun(stage);

  const dt = 1 / 60;
  let t = 0, n = 0, error = null;
  const g0 = h.state.game;
  const startStage = g0.stageIndex;

  for (; n < steps; n++) {
    const g = h.state.game;
    if (g.state === 'over' || g.stageIndex > startStage) break;
    try { h.engine.update(dt, bot(t, g)); }
    catch (e) { error = e; break; }
    t += dt;
    if (clock) clock.ms = t * 1000;
    col.step(h.state.game, t);
  }

  const res = col.result(h.state.game, t, n);
  shutdown(h);
  return { ...cell, ...res, cleared: h.state.game.stageIndex > startStage, error: error ? String(error.stack || error.message) : null };
}

if (parentPort) {
  runOne(workerData)
    .then(r => parentPort.postMessage({ ok: true, r }))
    .catch(e => parentPort.postMessage({ ok: false, error: String(e.stack || e) }));
}
