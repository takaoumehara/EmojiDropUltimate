// ============================================================
// test/headless.js — 画面なしでゲームを最後まで走らせるハーネス
//
// なぜ要るのか:
//   ゲームロジック(src/engine.js)が本当にブラウザから独立しているかは、
//   「DOM を呼んでいない」だけでは証明にならない。実際に1ステージ通しで
//   走らせて、敵が湧き、弾が飛び、ボスが出て、決着がつくところまで
//   確かめて初めて言える。
//
//   これは常駐サーバー(サーバー側でワールドを計算する形)へ進む場合の
//   土台でもある。サーバーに載せられるかどうかは、結局
//   「画面なしで正しく走るか」に等しい。ここが通れば移植は成立する。
//   進まないと決めても、回帰テストとして残るので無駄にならない。
//
// 使い方:
//   import { boot, sim, Bot } from './headless.js';
//   const h = await boot();
//   const r = sim(h, { steps: 60 * 60, bot: Bot.dodge });
// ============================================================

import './bootstrap.js';

// Math.random を差し替えるための保存先。boot() で seed を渡すと決定的になる。
const realRandom = Math.random;

// mulberry32 — config.js の makeRng と同じ系列。ここで再実装するのは、
// bootstrap より前に Math.random を握る必要があるため(engine の import 時点で
// すでに乱数を引くモジュールがある)。
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ゲームを Node 上で起動できる状態にする。
 * @param {{seed?: number}} opt seed を渡すと Math.random を固定して再現可能にする
 */
export async function boot(opt = {}) {
  if (opt.seed != null) Math.random = mulberry32(opt.seed);
  const env = await import('../src/env.js');
  // W/H はモジュール読込時 0。resize() を呼ばないと自機が (0,0) に張り付き、
  // 画面比で置かれる敵もベルも全部同じ場所に湧いてしまう。
  env.resize();
  const engine = await import('../src/engine.js');
  const state = await import('../src/state.js');
  const config = await import('../src/config.js');
  const geo = await import('../src/geo.js');
  const { Snd } = await import('../src/audio.js');
  // オープニングは「一度だけ自動で出る」ので、画面なしの検査では見たことにする。
  //   ここを外すと startRun がオープニングに寄り道して、遊びの検査が全部止まる。
  //   オープニング自体は test/story.test.js が受け持つ。
  const { Save } = await import('../src/save.js');
  if (!opt.story) for (let i = 0; i < 8; i++) Save.markSawStory(i);
  // 画面なしの実行にスピーカーは無い。鳴らさないと決めておけば
  //   BGM スケジューラが毎回の刻みで空回りする分も消える。
  Snd.muted = true;
  return { env, engine, state, config, geo, Snd };
}

/** 走らせ終わったら呼ぶ。BGM タイマーを止めてプロセスを綺麗に終わらせる。 */
export function shutdown(h) { if (h && h.Snd) h.Snd.stopBGM(); }

/** boot({seed}) で差し替えた Math.random を元に戻す。 */
export function unseed() { Math.random = realRandom; }

// === ボット(自動操縦) ===
// 「人が触っていないのに走った」では検証にならないので、実際に入力を与える。
export const Bot = {
  /** 何も押さない。敵の攻撃が本当に届くかを見るとき用。 */
  idle() { return {}; },

  /** ひたすら左右に往復する。弾幕の中を動き続ける状況を作る。 */
  sweep(t) {
    return Math.floor(t / 0.8) % 2 === 0 ? { ArrowLeft: true } : { ArrowRight: true };
  },

  /**
   * 一番近い敵弾から横に逃げる。完璧ではない(それでいい)。
   * 目的は「生存時間を人が遊んだときの幅に近づける」こと。
   */
  dodge(t, game) {
    const p = game.player;
    let near = null, nd = 1e9;
    for (const b of game.eBullets) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < nd) { nd = d; near = b; }
    }
    if (near && nd < 140) return near.x > p.x ? { ArrowLeft: true } : { ArrowRight: true };
    return Bot.sweep(t);
  },
};

/**
 * 実際にステージをクリアできる強さのボットを作る。
 *
 * 「例外なく走った」だけでは、決着まで到達する経路(ボス撃破・ステージ遷移・
 * クリア演出)が一度も踏まれない。倒せるボットが要る。
 *
 * 進行方向はステージごとに変わるので、画面の x/y ではなく
 * geo.js の lat(進行と垂直な軸)で狙う。これで4方向すべてに同じ論理が効く。
 *
 * @param {*} geo boot() 後に import した src/geo.js
 */
export function makeHunter(geo, opt = {}) {
  const fear = opt.fear ?? 130;   // この距離まで敵弾が近づいたら狙いを捨てて逃げる
  return function hunt(t, game) {
    const p = game.player;
    if (p.dead) return {};
    const vert = geo.isVert();
    const lat = o => (vert ? o.x : o.y);
    const my = lat(p);
    const key = neg => (vert
      ? (neg ? { ArrowLeft: true } : { ArrowRight: true })
      : (neg ? { ArrowUp: true } : { ArrowDown: true }));

    // 逃げる相手は「一番近い弾」ではなく「横に一番寄っている弾」。
    //   真横をかすめる弾より、自分の射線上をまっすぐ来る弾のほうが危ない。
    let worst = null, wd = 1e9;
    for (const b of [...game.eBullets, ...game.enemies]) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < wd && Math.abs(lat(b) - my) < 46) { wd = d; worst = b; }
    }
    if (worst && wd < fear) return key(lat(worst) > my);

    const target = game.boss || game.enemies[0];
    if (!target) return {};
    const tl = lat(target);
    if (Math.abs(tl - my) < 6) return {};   // 揃っている: 動かずに撃ち込む
    return key(tl < my);
  };
}

/**
 * 決まったステップ数だけゲームを進める。
 * dt は固定(既定 1/60)。実時間ではなく歩数で回すので、速いマシンでも
 * 遅いマシンでも同じ結果になる。
 *
 * @param {*} h boot() の戻り
 * @param {{steps?: number, dt?: number, bot?: Function, until?: Function}} opt
 * @returns {{steps: number, states: string[], peak: object, game: object, error: Error|null}}
 */
export function sim(h, opt = {}) {
  const { steps = 3600, dt = 1 / 60, bot = Bot.idle, until = null } = opt;
  const states = [];
  const peak = { enemies: 0, pBullets: 0, eBullets: 0, bells: 0, boss: 0, score: 0 };
  let t = 0, n = 0, error = null;

  for (; n < steps; n++) {
    const g = h.state.game;
    if (states[states.length - 1] !== g.state) states.push(g.state);
    peak.enemies = Math.max(peak.enemies, g.enemies.length);
    peak.pBullets = Math.max(peak.pBullets, g.pBullets.length);
    peak.eBullets = Math.max(peak.eBullets, g.eBullets.length);
    peak.bells = Math.max(peak.bells, g.bells.length);
    if (g.boss) peak.boss = Math.max(peak.boss, g.boss.hp || 0);
    peak.score = Math.max(peak.score, g.score);

    if (until && until(g, n)) break;
    try { h.engine.update(dt, bot(t, g)); }
    catch (e) { error = e; break; }
    t += dt;
  }
  return { steps: n, states, peak, game: h.state.game, error };
}
