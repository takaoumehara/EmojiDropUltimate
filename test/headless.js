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
//
// ⚠ 1プロセスで boot() を呼べるのは実質1回だけ:
//   boot() は動的 import() で src/ を読む。**ES モジュールはプロセス内で
//   キャッシュされる**ので、2回目の boot() は Math.random を撒き直すだけで、
//   モジュール階層に溜まった状態——セーブデータ、学習するボス(bossai.js)、
//   ディレクター(director.js)、ボス終盤の札の履歴——は前の回のまま残る。
//
//   実測: 同一プロセスで seed 7 を2回、1面クリアまで走らせると
//     1回目 11,195歩 / 163,700点 / 残機1
//     2回目  6,997歩 / 144,500点 / 残機2   ← 同じ種なのに違う
//   プロセスを分ければ3回とも 11,195歩 / 163,700点 で完全に一致する。
//
//   短い実行なら差が出ないので、下の「同じ種は同じ結果になる」テストは
//   ゲーム内1分で通る。だが**通っている理由は短いからでしかない**。
//   何本も回して統計を取るときは 1実行 = 1ワーカーにすること
//   (→ tools/sim/worker.mjs)。使い回すと数字が静かに嘘になる。
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
  // テストは16体ぜんぶを触る。実際の遊びでは3体から始まって徐々に開くが、
  //   ここでその門を閉じたままにすると Save.setChar が黙って失敗し、
  //   「全員ぶん確かめたつもり」で1体しか見ていない状態になる。
  //   門そのものは test/save.test.js が別に縛っている。
  if (opt.locked !== true) { Save.data.sc = 99; Save.persist(); }
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
 * **指でドラッグする人**を模したボット。
 *
 * なぜ要るのか:
 *   上の Bot.* は矢印キーを押す。キーボードの移動は
 *   `CFG.PLAYER_SPEED`(330px/秒)× キャラ係数に縛られるが、
 *   このゲームの主な入力は**指のドラッグ**で、`src/input.js` は
 *   指の移動量を **1.7倍して自機にそのまま渡す**。画面幅を 0.3秒で
 *   横切れば秒速1300px を超え、**キーボードの約4倍**動ける。
 *
 *   つまりキーのボットで「動いても避けられない」と出ても、それは
 *   ゲームの性質ではなく**ボットが遅いだけ**かもしれない。
 *   実際、序盤の計測でその区別が付かなくなった(→ docs/verify-loop.md)。
 *   指の速さで動くボットを別に用意して、初めて両者を比べられる。
 *
 *   キー入力は返さず、input.js と同じように座標を直接動かす。
 *   可動域の clamp も engine 側と同じにしてある。
 *
 * @param {*} env boot() 後の src/env.js
 * @param {{pxPerSec?: number, fear?: number}} opt
 */
export function makeDragBot(env, opt = {}) {
  const speed = opt.pxPerSec ?? 1300;   // 指ドラッグの実測相当
  const fear = opt.fear ?? 150;
  return function drag(t, game) {
    const p = game.player;
    if (p.dead) return {};
    // 一番危ない脅威(近い順)から離れる向きを求める
    let tx = p.x, ty = p.y, worst = null, wd = 1e9;
    for (const b of game.eBullets) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < wd) { wd = d; worst = b; }
    }
    for (const e of game.enemies) {
      if (e.delay > 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y) - (e.size || 12);
      if (d < wd) { wd = d; worst = e; }
    }
    if (worst && wd < fear) {
      const ax = p.x - worst.x, ay = p.y - worst.y;
      const m = Math.hypot(ax, ay) || 1;
      tx = p.x + (ax / m) * 60; ty = p.y + (ay / m) * 60;
    }
    const dx = tx - p.x, dy = ty - p.y;
    const m = Math.hypot(dx, dy);
    if (m > 0.5) {
      const step = Math.min(m, speed / 60);
      const W = env.W, H = env.H, S = env.SAFE;
      p.x = Math.max(22 + S.left, Math.min(W - 22 - S.right, p.x + (dx / m) * step));
      p.y = Math.max(40 + S.top, Math.min(H - 22 - S.bottom, p.y + (dy / m) * step));
    }
    return {};   // キーは押さない。移動は座標で済ませた
  };
}

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
