// ============================================================
// src/face/game.js — 60秒の実験装置そのもの
//
//   ここには DOM が一切出てこない。描画も音も外でやる。
//   おかげで画面なしで丸ごとテストできる(test/face.test.js)。
//
//   確かめたい問いは1つだけ:
//     顔で操作するのは、10秒で飽きる珍しさではなく、
//     もう一回やりたくなる操作なのか。
// ============================================================

import { ASKABLE, BY_KEY } from './expressions.js';

// ---- 数値。触るのはここだけ -----------------------------------------
//
// 入力方式を移し替える時に変えるのは、この表の5つ(判定窓・予告・
// ヒステリシス差・休息比率・1プレイの長さ)だけであるべき。
// ヒステリシス差は signal.js にある。

export const TIMING = {
  // 的が壊せる帯の長さ。**線ではなく帯**なのが要点(docs/face-game.md §6-2)。
  //   遅延を「失敗の原因」ではなく「点数の差」に変えるための幅。
  //   カメラ入力の判定窓は ±150〜200ms より狭くできない。1400ms はその7倍あり、
  //   遅延で落とされることがない。狭めると難しくなるのではなく運ゲーになる。
  bandMs: 1400,

  // 帯に入るより前に、的が読める状態になっている時間。
  //   予告なしの正確な操作は物理的に不可能。カメラ入力の予告は 800〜1200ms 要る。
  travelMs: 1400,

  // 光り始める(予告が始まる)のは帯に入る何ms前か。
  preMs: 800,

  // 次の的までの最短間隔。守らないと「反応できない」のではなく
  //   「前の表情から顔がまだ戻っていない」状態が起きる。
  //   プレイヤーからは「操作を受け付けていない」に見えるので、原因が分からない。
  minGapMs: 700,
};

/** 進行表。休みは合計12秒 ≒ 20%。顎を使う入力の休息比率の下限なので減らさない。 */
export const SCHEDULE = [
  // 新しい表情は1ラウンドにつき1つずつしか増やさない。
  // 一度に3つ出すと、面白いかどうかではなく覚えられるかどうかを測ることになる。
  { kind: 'warmup', ms: 5000, keys: [] },
  { kind: 'round', ms: 12000, keys: ['gape'], intervalMs: 2400 },
  { kind: 'rest', ms: 4000, keys: [] },
  { kind: 'round', ms: 12000, keys: ['gape', 'smile'], intervalMs: 2100 },
  { kind: 'rest', ms: 4000, keys: [] },
  { kind: 'round', ms: 12000, keys: ['gape', 'smile', 'brow'], intervalMs: 1900 },
  { kind: 'rest', ms: 4000, keys: [] },
  { kind: 'round', ms: 12000, keys: ['gape', 'smile', 'brow'], intervalMs: 1650 },
];

export const TOTAL_MS = SCHEDULE.reduce((a, p) => a + p.ms, 0); // 65,000ms

// 安静時の値を測る窓。起動直後の揺れを避けて 0.8秒から。
const REST_FROM_MS = 800;
const REST_TO_MS = 3200;

// 顔を見失った時の作法。いきなり止めるとテンポが切れ、復帰後に状況を
// 把握し直すことになる。多くの欠測は数フレームで戻るので、まず減速。
const LOST_SLOW_AFTER_MS = 500;   // これを超えたら 0.35倍
const LOST_STOP_AFTER_MS = 2000;  // それでも戻らなければ止める
const LOST_SLOW_SCALE = 0.35;

/** 決定論的な乱数。同じ種なら毎回同じ出題順になるので、テストで比較できる。 */
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

let nextId = 1;

export function makeSession({ seed = 7, mode = 'face' } = {}) {
  const rng = makeRng(seed);

  const state = {
    mode,                 // 'face' | 'tap' — 結果の比較に使うラベル
    timeMs: 0,            // 進行時間(減速・停止の影響を受けた後)
    wallMs: 0,            // 実時間。停止していても進む
    phaseIndex: 0,
    phase: SCHEDULE[0],
    phaseElapsedMs: 0,
    targets: [],
    finished: false,
    score: 0,
    combo: 0,
    bestCombo: 0,
    timeScale: 1,         // 1 / 0.35 / 0
    lostMs: 0,            // 顔が見えていない連続時間
    calibrating: false,
  };

  // --- 計測 ---
  const log = {
    hits: [],             // { key, reactionMs|null, quality, atMs, rawPeak }
    misses: [],           // { key, atMs }
    blocked: [],          // { key, byKeys, atMs } 正しい顔なのに別の顔が邪魔した
    falseFires: [],       // { key, atMs } 出題されていない表情が勝手に立ち上がった
    preFormed: 0,         // 的が出る前から作っていた回数(反応時間が測れない)
    lostEvents: 0,
  };

  let spawnAtMs = Infinity;  // 次に的を出す進行時刻
  let restSampled = false;

  function currentAskable(keys) {
    return keys.map(k => BY_KEY.get(k)).filter(Boolean);
  }

  function spawn(keys) {
    const pool = currentAskable(keys);
    if (!pool.length) return;
    const expr = pool[Math.floor(rng() * pool.length) % pool.length];
    const t = state.timeMs;
    state.targets.push({
      id: nextId++,
      key: expr.key,
      emoji: expr.emoji,
      shownAtMs: t,
      bandFromMs: t + TIMING.travelMs,
      bandToMs: t + TIMING.travelMs + TIMING.bandMs,
      // 的が出た瞬間、既にその顔を作っていたか。反応時間はここでは測れない。
      preFormed: false,
      formedAtMs: null,
      resolved: null,     // 'hit' | 'miss'
      quality: 0,
    });
  }

  /**
   * @param {number} dtSecWall 実時間の経過秒
   * @param {object} rig       signal.js の makeRig が返すもの(更新済み)
   * @param {number} confidence 顔を信用してよいか。タップは常に 1
   * @returns {Array} 描画と音のためのイベント
   */
  function step(dtSecWall, rig, confidence = 1) {
    const events = [];
    if (state.finished) return events;

    state.wallMs += dtSecWall * 1000;

    // --- 顔を見失った時の減速と停止 ---
    if (confidence < 0.5) {
      if (state.lostMs === 0) log.lostEvents++;
      state.lostMs += dtSecWall * 1000;
    } else {
      state.lostMs = 0;
    }
    const prevScale = state.timeScale;
    state.timeScale =
      state.lostMs > LOST_STOP_AFTER_MS ? 0 :
      state.lostMs > LOST_SLOW_AFTER_MS ? LOST_SLOW_SCALE : 1;
    if (state.timeScale !== prevScale) {
      events.push({ type: 'trackingScale', scale: state.timeScale });
    }

    // 見えていない間はゲームを進めない。操作できないのに失敗するのは、
    // 理不尽の中でいちばん強い種類。
    const dtMs = dtSecWall * 1000 * state.timeScale;
    if (dtMs <= 0) return events;

    state.timeMs += dtMs;
    state.phaseElapsedMs += dtMs;

    // --- 安静時の測定。ゲームを止めない ---
    if (!restSampled) {
      if (!state.calibrating && state.timeMs >= REST_FROM_MS) {
        rig.beginRestSampling();
        state.calibrating = true;
      } else if (state.calibrating && state.timeMs >= REST_TO_MS) {
        rig.endRestSampling();
        state.calibrating = false;
        restSampled = true;
        events.push({ type: 'calibrated' });
      }
    }

    // --- 進行表 ---
    while (state.phaseElapsedMs >= state.phase.ms && state.phaseIndex < SCHEDULE.length - 1) {
      state.phaseElapsedMs -= state.phase.ms;
      state.phaseIndex++;
      state.phase = SCHEDULE[state.phaseIndex];
      // 新しいラウンドの1発目は少し待つ。切り替わった瞬間に落ちてくると
      // 「何が増えたのか」を見る時間がない。
      spawnAtMs = state.phase.kind === 'round' ? state.timeMs + 600 : Infinity;
      events.push({
        type: 'phase',
        kind: state.phase.kind,
        keys: state.phase.keys,
        index: state.phaseIndex,
      });
    }
    if (state.phaseIndex >= SCHEDULE.length - 1 && state.phaseElapsedMs >= state.phase.ms) {
      // 最後のラウンドが終わっても、まだ落ちている的は決着させる。
      if (!state.targets.some(t => !t.resolved)) {
        state.finished = true;
        events.push({ type: 'finished' });
        return events;
      }
    }

    // --- 出題 ---
    if (state.phase.kind === 'round' && state.timeMs >= spawnAtMs) {
      const remain = state.phase.ms - state.phaseElapsedMs;
      // ラウンドの終わり際に出すと、休みの最中に判定が来て休みでなくなる。
      if (remain > TIMING.travelMs + TIMING.bandMs * 0.5) {
        spawn(state.phase.keys);
        const gap = Math.max(TIMING.minGapMs, state.phase.intervalMs);
        spawnAtMs = state.timeMs + gap;
      } else {
        spawnAtMs = Infinity;
      }
    }

    // --- 判定 ---
    const active = rig.activeKeys();
    const t = state.timeMs;

    for (const tg of state.targets) {
      if (tg.resolved) continue;
      const ch = rig.get(tg.key);
      if (!ch) continue;

      // 的が出た瞬間に既に作っていたか(反応時間が測れないケース)
      if (tg.formedAtMs === null && t - tg.shownAtMs < dtMs * 1.5 && ch.state.active) {
        tg.preFormed = true;
      }
      if (tg.formedAtMs === null && ch.state.justOn) {
        // 的が出てから、その顔を新しく作るまで。
        // = 人間の反応 + 表情を作る筋肉の時間 + カメラと推論とフィルタの遅れ。
        // この3つはブラウザの中では分けられない。だからタップ版との差で見る。
        tg.formedAtMs = t;
      }

      const inBand = t >= tg.bandFromMs && t <= tg.bandToMs;
      if (inBand && ch.state.active) {
        const others = active.filter(k => k !== tg.key);
        if (others.length) {
          // 違う表情を作っていると壊せない。減点はしない。
          // 実際に、口を開けながら同時に笑うことはできない。画面の中の嘘ではない。
          if (!tg._blockedLogged) {
            tg._blockedLogged = true;
            log.blocked.push({ key: tg.key, byKeys: others.slice(), atMs: t });
            events.push({ type: 'blocked', target: tg, byKeys: others.slice() });
          }
          continue;
        }
        // 帯の真ん中に近いほど良い。遅れは点差になるだけで、失敗にはならない。
        const center = (tg.bandFromMs + tg.bandToMs) / 2;
        const half = TIMING.bandMs / 2;
        const quality = Math.max(0, 1 - Math.abs(t - center) / half);
        tg.resolved = 'hit';
        tg.quality = quality;
        state.combo++;
        state.bestCombo = Math.max(state.bestCombo, state.combo);
        // 連続で当てるほど倍率が上がる。掛けた後に丸める(前に丸めると小数が残る)。
        state.score += Math.round((100 + quality * 100) * Math.min(4, 1 + state.combo * 0.1));

        const reactionMs = (tg.preFormed || tg.formedAtMs === null)
          ? null
          : tg.formedAtMs - tg.shownAtMs;
        if (reactionMs === null) log.preFormed++;
        log.hits.push({
          key: tg.key,
          reactionMs,
          quality,
          atMs: t,
          // しきい値の追従に汚されていない生の振幅。疲労の計測はこれを見る。
          rawPeak: ch.state.rawPeak || ch.calib.peak,
        });
        events.push({ type: 'hit', target: tg, quality });
      } else if (t > tg.bandToMs) {
        tg.resolved = 'miss';
        state.combo = 0;
        log.misses.push({ key: tg.key, atMs: t });
        events.push({ type: 'miss', target: tg });
      }
    }

    // --- 出題していない表情の誤爆を、裏で数える ---
    // プレイ時間ゼロで「どの表情が使えないか」の判断材料が手に入る。
    for (const [key, ch] of rig.channels) {
      if (!ch.state.justOn) continue;
      const wanted = state.targets.some(
        tg => !tg.resolved && tg.key === key && t >= tg.shownAtMs
      );
      if (!wanted) {
        log.falseFires.push({ key, atMs: t });
        events.push({ type: 'falseFire', key });
      }
    }

    // 決着した的は、少し残してから消す(壊れる演出のため)
    state.targets = state.targets.filter(tg => !tg.resolved || t - tg.bandToMs < 600);

    return events;
  }

  return { state, log, step, TIMING, SCHEDULE };
}

/** 進行時刻から、的の画面上の位置(0 = 上, 1 = 下端)を出す。描画側が使う。 */
export function targetProgress(tg, timeMs) {
  const span = tg.bandToMs - tg.shownAtMs;
  return Math.max(0, Math.min(1.15, (timeMs - tg.shownAtMs) / span));
}

/** 帯が画面のどこにあるか(0..1)。的の進み具合と同じ尺度。 */
export function bandRange(tg) {
  const span = tg.bandToMs - tg.shownAtMs;
  return {
    from: (tg.bandFromMs - tg.shownAtMs) / span,
    to: 1,
  };
}

export { ASKABLE };
