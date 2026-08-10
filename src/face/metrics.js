// ============================================================
// src/face/metrics.js — 60秒で何が分かったのかを、数字にする
//
//   引き継ぎ文書が測ると決めた3つ:
//     ① 反応の遅れ  ② 誤爆  ③ 何秒で顎が疲れるか
//
//   ①は、ブラウザの中だけでは絶対値を測れない(「顔を作った瞬間」を知る手段が
//   カメラしかなく、そのカメラの遅れこそが測りたいものだから)。
//   だから**タップ版との差**として出す。これは引き算で正しく出る。
//
//   ③は主観だと「まあまあ疲れた」しか残らないので、
//   1発ごとの生の振幅の推移として自動で記録する。
// ============================================================

import { BY_KEY, EXPRESSIONS } from './expressions.js';

const STORE_KEY = 'facegame.runs.v1';

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (v, d = 0) => (v === null || v === undefined ? null : Number(v.toFixed(d)));

/**
 * セッションの記録を、読める形にまとめる。
 * @param {object} session makeSession が返したもの
 */
export function summarize(session) {
  const { log, state } = session;

  const hits = log.hits.length;
  const misses = log.misses.length;
  const shown = hits + misses;

  const reactions = log.hits.map(h => h.reactionMs).filter(v => v !== null);

  // --- 表情ごと ---
  const perKey = {};
  for (const expr of EXPRESSIONS) {
    const h = log.hits.filter(x => x.key === expr.key);
    const m = log.misses.filter(x => x.key === expr.key);
    const ff = log.falseFires.filter(x => x.key === expr.key);
    const bl = log.blocked.filter(x => x.byKeys.includes(expr.key));
    perKey[expr.key] = {
      emoji: expr.emoji,
      label: expr.label,
      asked: expr.ask,
      hits: h.length,
      misses: m.length,
      reactionMs: round(mean(h.map(x => x.reactionMs).filter(v => v !== null))),
      // 出題されていないのに勝手に立ち上がった回数
      falseFires: ff.length,
      // 他の的を邪魔した回数。「この表情は他と混ざる」の直接の証拠
      blockedOthers: bl.length,
    };
  }

  // --- 疲労 ---
  // 前半と後半で、1発あたりの生の振幅がどれだけ落ちたか。
  // しきい値は遊びやすさのために追従させているので、そちらを見ても疲労は見えない。
  // 見えるのは生の値だけ。
  const peaks = log.hits.map(h => h.rawPeak).filter(v => Number.isFinite(v) && v > 0);
  let fatigue = null;
  if (peaks.length >= 6) {
    const half = Math.floor(peaks.length / 2);
    const early = mean(peaks.slice(0, half));
    const late = mean(peaks.slice(peaks.length - half));
    fatigue = {
      earlyPeak: round(early, 3),
      latePeak: round(late, 3),
      // 正なら「後半のほうが小さい」= 疲れている
      dropPct: round((1 - late / early) * 100, 1),
      samples: peaks.length,
    };
  }

  return {
    mode: state.mode,
    at: Date.now(),
    durationMs: Math.round(state.wallMs),

    // 引き継ぎ文書が求めた3つ
    hits,
    misses,
    shown,
    hitRate: shown ? round((hits / shown) * 100, 1) : null,
    reactionMs: round(mean(reactions)),
    reactionSamples: reactions.length,
    falseFires: log.falseFires.length,

    // 添えるもの
    blocked: log.blocked.length,
    preFormed: log.preFormed,
    lostEvents: log.lostEvents,
    score: state.score,
    bestCombo: state.bestCombo,
    perKey,
    fatigue,
  };
}

// ---- 保存と比較 ------------------------------------------------------
//
// 顔とタップの結果を並べるために、直近の結果だけを端末に残す。
// **顔の映像も、顔から作った特徴量も、一切保存しない。** 残すのは上の数字だけ。

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch (e) { return null; }
}

export function saveRun(summary) {
  const s = storage();
  if (!s) return;
  try {
    const all = loadRuns();
    all[summary.mode] = summary;
    s.setItem(STORE_KEY, JSON.stringify(all));
  } catch (e) { /* 保存できなくても結果は画面に出ている。落とさない */ }
}

export function loadRuns() {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) { return {}; }
}

export function clearRuns() {
  const s = storage();
  if (!s) return;
  try { s.removeItem(STORE_KEY); } catch (e) { /* noop */ }
}

/**
 * 顔とタップの差。ここが実験装置のいちばん大事な出力。
 *
 * 引き継ぎ文書の分岐条件「200ms 超なら離散的な操作に振り切る」は、
 * 顔の絶対値ではなく**この差**に対して当てるべき数字。
 * 顔の絶対値には人間の反応時間がそのまま乗っているので、
 * それを見て 200ms を判定すると、カメラのせいではないものをカメラのせいにする。
 */
export function compare(runs) {
  const face = runs.face;
  const tap = runs.tap;
  if (!face || !tap) {
    return {
      ready: false,
      missing: !face ? 'face' : 'tap',
    };
  }
  const dReaction =
    face.reactionMs !== null && tap.reactionMs !== null
      ? round(face.reactionMs - tap.reactionMs)
      : null;

  return {
    ready: true,
    reactionDeltaMs: dReaction,
    // 引き継ぎ文書 §5 の分岐そのもの
    verdict:
      dReaction === null ? 'unknown'
      : dReaction > 200 ? 'discrete-only'   // 離散操作に振り切る(=表情マッチ確定、口砲は捨てる)
      : 'continuous-ok',
    hitRateDelta:
      face.hitRate !== null && tap.hitRate !== null
        ? round(face.hitRate - tap.hitRate, 1) : null,
    falseFireDelta: face.falseFires - tap.falseFires,
    face,
    tap,
  };
}

/** 誤爆が多くて使えない表情を名指す。文書「多い表情はゲームで使わない」への答え。 */
export function unusableExpressions(summary, perMinuteLimit = 6) {
  const minutes = Math.max(0.25, summary.durationMs / 60000);
  const out = [];
  for (const [key, v] of Object.entries(summary.perKey)) {
    const rate = v.falseFires / minutes;
    if (rate >= perMinuteLimit) {
      out.push({ key, emoji: v.emoji, label: v.label, perMinute: round(rate, 1) });
    }
  }
  return out.sort((a, b) => b.perMinute - a.perMinute);
}

export { BY_KEY };
