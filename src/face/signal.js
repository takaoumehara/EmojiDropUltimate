// ============================================================
// src/face/signal.js — 入力の契約と、その作り方
//
//   ゲーム側は「どこから来た入力か」を知ってはいけない。
//   タップでも顔でも、ここから出てくるのは必ず同じ形の1本の信号:
//
//     { value, active, justOn, justOff, heldTime, confidence, rawPeak }
//
//   ゲームのコードに jawOpen / landmark / ratio という名前が出てきたら、
//   そこが抽象化の漏れている場所。
//
//   このファイルは DOM を一切触らない。画面なしでテストできる。
// ============================================================

/** 値を lo..hi に収める。 */
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// ---- One Euro Filter ------------------------------------------------
//
// 推定値の細かい揺れ(ジッター)は消したいが、移動平均やローパスで消すと
// 速く動いた時に遅れる。この2つは同じダイヤルの両端で、片方を良くすると
// 片方が悪くなる。One Euro はその配分を「動きの速さ」で自動的に切り替える。
// ゆっくりの時は強くかけて震えを消し、速い時は弱めて追従させる。
//
// 調整は必ず片方ずつ。同時に動かすと、どちらが効いているか永遠に分からない:
//   ① beta = 0 にして、静止したまま minCutoff を下げ、震えが止まる値を探す
//   ② 次に beta を上げ、速く動かした時の遅れが消えるところで止める

export class OneEuroFilter {
  /**
   * @param {number} minCutoff 静止時のなめらかさ(Hz)。
   *        下げる → 静止時の震えが減るが、動き出しが鈍る。
   * @param {number} beta      速い動きへの追従。
   *        上げる → 遅れが減るが、速い動きで震える。
   *
   *        **既定の 0.007 を使ってはいけない。** あれは座標(ピクセルやメートル)を
   *        平滑化するための値で、微分の大きさが数百〜数千になることを前提にしている。
   *        こちらの入力は 0〜1 に正規化済みなので微分はせいぜい 1〜10 にしかならず、
   *        beta * |dx| がほとんど効かない = 速く動いても遅れが減らない。
   *
   *        実測(1/60秒刻み、0.02 → 0.9 の立ち上がりが active になるまで):
   *          beta=0.007 → 233ms / beta=0.15 → 167ms / beta=0.8 → 133ms / beta=3.0 → 117ms
   *        静止時の震えは beta=0.8 まで実質増えない(0.058 → 0.059)。
   *        0.8 より上は 117ms(=最小保持90ms の床)に当たって、ほぼ縮まない。
   *        なので 0.8。**この100msは、そのまま反応時間の数字に乗る。**
   * @param {number} dCutoff   速度推定の平滑化(Hz)。ふつう触らない。
   */
  constructor({ minCutoff = 1.0, beta = 0.8, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
  }

  static alpha(cutoffHz, dtSec) {
    const tau = 1 / (2 * Math.PI * cutoffHz);
    return 1 / (1 + tau / dtSec);
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
  }

  filter(x, dtSec) {
    // dt が 0 や負や NaN でも、フィルタが無限大を吐かないようにする。
    // カメラのフレームが飛ぶと実際に起きる。
    if (!(dtSec > 0) || !Number.isFinite(dtSec)) dtSec = 1 / 60;
    if (this.xPrev === null) {
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }
    const dx = (x - this.xPrev) / dtSec;
    const aD = OneEuroFilter.alpha(this.dCutoff, dtSec);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dtSec);
    const xHat = a * x + (1 - a) * this.xPrev;

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }
}

// ---- 既定値 ---------------------------------------------------------
//
// ここが入力方式を移し替える時に触る数値。ここ以外に手が入るなら、
// 抽象化が漏れている。

export const DEFAULTS = {
  // ヒステリシス(正規化値)。
  //   差をゼロにしてはいけない。「たまに反応しない / 勝手に反応する」の大半がこれ。
  //   差を広げる → 誤爆は減るが、やめたのに続いている感じが出る。
  enterAt: 0.55,
  exitAt: 0.35,

  // 最小保持時間。これはそのまま入力遅延として乗るので、これ以上増やさない。
  minHoldMs: 90,

  // キャリブレーションの最小の幅。
  //   何もしなかった人の peak が rest と同じになると、ゼロ除算か極端な過敏になる。
  //   0.12 は blendshape の生の値での幅。
  minSpan: 0.12,

  // 上限(peak)を下げる速さの時定数(秒)。
  //   疲れてくると動作は小さくなるので、下方向へも追従する。ただし非常にゆっくり。
  //   速くすると「後半だけ簡単になる」ので、疲労が測れなくなる。
  peakDecayTau: 25,

  // これを下回ったら「今の入力は信用できない」。顔を見失った時など。
  confidenceFloor: 0.5,
};

// ---- チャンネル -----------------------------------------------------
//
// 1つの表情 = 1本のチャンネル。生の値を受け取り、契約の形にして返す。

export function makeChannel(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const filter = new OneEuroFilter(cfg);

  const state = {
    key: cfg.key || 'ch',
    // --- 契約。ゲームが見てよいのはここだけ ---
    value: 0,
    active: false,
    justOn: false,
    justOff: false,
    heldTime: 0,
    confidence: 1,
    // --- 計測のため。ゲームは見ない ---
    //     しきい値は疲労に追従させる(遊べる)が、記録は生の値で取る(測れる)。
    //     片方だけにすると、遊べないか測れないかのどちらかになる。
    rawPeak: 0,
  };

  const calib = {
    rest: 0,
    peak: cfg.minSpan,
    restSum: 0,
    restCount: 0,
    sampling: false,
  };

  let lastRaw = 0;
  let holdTimer = 0;      // 最小保持の残り(秒)
  let pendingOn = false;  // 立ち上がりを保持時間で確定させるまでの保留
  let heldPeak = 0;       // active の間の生の最大値

  /** 安静時の値を測り始める。ゲームは止めない。 */
  function beginRestSampling() {
    calib.sampling = true;
    calib.restSum = 0;
    calib.restCount = 0;
  }

  /** 安静時の測定を終え、下限を確定する。 */
  function endRestSampling() {
    calib.sampling = false;
    if (calib.restCount > 0) calib.rest = calib.restSum / calib.restCount;
    // 下限が動いたら、上限は必ずその上に置き直す。
    calib.peak = Math.max(calib.peak, calib.rest + cfg.minSpan);
  }

  /** 生の値を 0..1 に直す。個人差はここで吸収される。 */
  function normalize(raw) {
    const span = Math.max(cfg.minSpan, calib.peak - calib.rest);
    return clamp((raw - calib.rest) / span, 0, 1);
  }

  /**
   * @param {number} raw        推定器から出た生の値(0..1)
   * @param {number} confidence 今この入力を信用してよいか(0..1)。タップは常に 1
   * @param {number} dtSec      前回からの経過秒
   */
  function update(raw, confidence, dtSec) {
    if (!Number.isFinite(raw)) raw = lastRaw;
    if (!(dtSec > 0) || !Number.isFinite(dtSec)) dtSec = 1 / 60;

    const trusted = confidence >= cfg.confidenceFloor;

    // 信用できない間は、直前の値を保つ。0 に落とすと入力が一瞬暴れて誤爆する。
    if (!trusted) raw = lastRaw;
    lastRaw = raw;

    if (calib.sampling && trusted) {
      calib.restSum += raw;
      calib.restCount++;
    }

    // 上限の追従。上へは即座に、下へは非常にゆっくり。
    if (trusted) {
      if (raw > calib.peak) {
        calib.peak = raw;
      } else if (cfg.peakDecayTau > 0) {
        const target = Math.max(calib.rest + cfg.minSpan, raw);
        if (calib.peak > target) {
          const k = 1 - Math.exp(-dtSec / cfg.peakDecayTau);
          calib.peak += (target - calib.peak) * k;
        }
      }
      calib.peak = Math.max(calib.peak, calib.rest + cfg.minSpan);
    }

    const v = clamp(filter.filter(normalize(raw), dtSec), 0, 1);

    // --- ヒステリシス ---
    // 1つのしきい値で判定すると、境界で毎フレーム反転する(チャタリング)。
    // 推定値は常に揺れているので必ず起きる。だから入る線と出る線を分ける。
    const wasActive = state.active;
    let nextActive = wasActive;

    if (holdTimer > 0) holdTimer = Math.max(0, holdTimer - dtSec * 1000);

    if (!wasActive) {
      if (v >= cfg.enterAt && trusted) {
        // 越えてすぐには通さない。minHoldMs のあいだ越えたままなら確定。
        if (!pendingOn) {
          pendingOn = true;
          holdTimer = cfg.minHoldMs;
        } else if (holdTimer <= 0) {
          nextActive = true;
          pendingOn = false;
        }
      } else {
        pendingOn = false;
        holdTimer = 0;
      }
    } else if (v <= cfg.exitAt || !trusted) {
      nextActive = false;
      pendingOn = false;
      holdTimer = 0;
    }

    state.justOn = !wasActive && nextActive;
    state.justOff = wasActive && !nextActive;
    state.active = nextActive;
    state.value = v;
    state.confidence = clamp(confidence, 0, 1);
    state.heldTime = nextActive ? (wasActive ? state.heldTime + dtSec : 0) : 0;

    // 生の振幅。疲労の計測はこちらを見る(しきい値の追従に汚されていない値)。
    if (state.justOn) heldPeak = raw;
    else if (nextActive) heldPeak = Math.max(heldPeak, raw);
    if (state.justOff) state.rawPeak = heldPeak;

    return state;
  }

  function reset() {
    filter.reset();
    state.value = 0;
    state.active = false;
    state.justOn = false;
    state.justOff = false;
    state.heldTime = 0;
    state.confidence = 1;
    state.rawPeak = 0;
    holdTimer = 0;
    pendingOn = false;
    heldPeak = 0;
    lastRaw = 0;
  }

  return {
    get key() { return state.key; },
    state,
    calib,
    update,
    reset,
    beginRestSampling,
    endRestSampling,
    normalize,
    /** 上限がまともに取れたか。取れていない = その人はまだ一度も大きく動かしていない。 */
    get calibrated() { return calib.peak - calib.rest > cfg.minSpan * 1.001; },
  };
}

/**
 * 表情のまとまり。ソース(タップ/顔)が生の値の辞書を渡し、契約の束を返す。
 */
export function makeRig(keys, opts = {}) {
  const channels = new Map();
  for (const k of keys) channels.set(k, makeChannel({ ...opts, key: k }));

  return {
    channels,
    get(k) { return channels.get(k); },
    /** @param {Record<string, number>} raws @param {number} confidence */
    update(raws, confidence, dtSec) {
      for (const [k, ch] of channels) {
        ch.update(raws[k] ?? 0, confidence, dtSec);
      }
      return channels;
    },
    beginRestSampling() { for (const ch of channels.values()) ch.beginRestSampling(); },
    endRestSampling() { for (const ch of channels.values()) ch.endRestSampling(); },
    reset() { for (const ch of channels.values()) ch.reset(); },
    /** いま active になっているキーの一覧。 */
    activeKeys() {
      const out = [];
      for (const [k, ch] of channels) if (ch.state.active) out.push(k);
      return out;
    },
  };
}
