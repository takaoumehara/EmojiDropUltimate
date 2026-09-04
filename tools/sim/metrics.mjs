// ============================================================
// tools/sim/metrics.mjs — 1回の自動プレイから指標を取り出す
//
// なぜ要るのか:
//   test/headless.js は「走った / 例外が出なかった」までは証明できるが、
//   **遊びとして成立しているか**は何も言わない。初見が3秒で死んでいても、
//   30秒なにも起きない空白があっても、テストは緑のまま通る。
//
//   ここはその隙間を埋める。フレームごとに盤面を覗いて、
//   「人が遊んだらどう感じるか」に対応する数字だけを取り出す。
//
//   純関数と、状態を持つ Collector に分けてある。Collector は
//   worker.mjs が毎フレーム呼ぶ。集計側(run.mjs)は数字しか見ない。
// ============================================================

/** 遊びが止まっている = 敵も弾もボスも居ない。演出中(intro/finale)は数えない。 */
export function isDeadFrame(g) {
  return g.state === 'play' && !g.boss
    && g.enemies.length === 0 && g.eBullets.length === 0;
}

/** パーセンタイル。空配列は null。 */
export function pct(arr, p) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}

export function mean(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
}

/**
 * 1回の実行ぶんの観測者。
 * @param {*} geo src/geo.js（ベルの取り逃しを進行方向で判定するのに要る）
 */
export function makeCollector(geo) {
  let deadRun = 0, deadMax = 0, deadTotal = 0;
  let firstDeath = null, deaths = 0, prevLives = null;
  let peakParticles = 0, peakEnemies = 0, peakEBullets = 0, peakPBullets = 0;
  let peakPower = 0, peakOptions = 0;
  const bells = new Map();          // ベル実体 -> 最後に見た prog
  let bellsSeen = 0, bellsGot = 0, bellsMissed = 0;
  const stands = [];                // ボス終盤に引いた札
  let lastStand = null;

  return {
    /** 毎フレーム、update() の**あとに**呼ぶ。t はゲーム内の経過秒。 */
    step(g, t) {
      if (isDeadFrame(g)) { deadRun++; deadTotal++; if (deadRun > deadMax) deadMax = deadRun; }
      else deadRun = 0;

      if (prevLives !== null && g.lives < prevLives) {
        deaths++;
        if (firstDeath === null) firstDeath = t;
      }
      prevLives = g.lives;

      if (g.particles.length > peakParticles) peakParticles = g.particles.length;
      if (g.enemies.length > peakEnemies) peakEnemies = g.enemies.length;
      if (g.eBullets.length > peakEBullets) peakEBullets = g.eBullets.length;
      if (g.pBullets.length > peakPBullets) peakPBullets = g.pBullets.length;
      if (g.player.power > peakPower) peakPower = g.player.power;
      if (g.player.options > peakOptions) peakOptions = g.player.options;

      // ベル: 消えた瞬間に「拾った」か「流れ去った」かを prog で判定する。
      //   engine.js は画面外(prog > fwSpan()+90)で捨て、拾うと splice する。
      const live = new Set(g.bells);
      for (const b of g.bells) {
        if (!bells.has(b)) bellsSeen++;
        bells.set(b, b.prog);
      }
      const span = geo.fwSpan() + 90;
      for (const [b, prog] of bells) {
        if (live.has(b)) continue;
        if (prog > span - 4) bellsMissed++; else bellsGot++;
        bells.delete(b);
      }

      if (g.standKind && g.standKind !== lastStand) { stands.push(g.standKind); }
      lastStand = g.standKind;
    },

    result(g, t, steps) {
      // 実行終了時にまだ残っているベルは「まだ盤面に居た」ので、どちらにも数えない。
      return {
        steps, seconds: +t.toFixed(2),
        state: g.state,
        cleared: g.state === 'finale' || g.state === 'clear' || g.state === 'victory',
        stageIndex: g.stageIndex,
        score: g.score, lives: g.lives,
        deaths, timeToFirstDeath: firstDeath === null ? null : +firstDeath.toFixed(2),
        shots: g.stats.shots, hits: g.stats.hits, kills: g.stats.kills,
        accuracy: g.stats.shots ? +(g.stats.hits / g.stats.shots).toFixed(4) : null,
        deadMaxSec: +(deadMax / 60).toFixed(2),
        deadRatio: steps ? +(deadTotal / steps).toFixed(4) : 0,
        peakParticles, peakEnemies, peakEBullets, peakPBullets,
        peakPower, peakOptions,
        bellsSeen, bellsGot, bellsMissed,
        stands,
      };
    },
  };
}
