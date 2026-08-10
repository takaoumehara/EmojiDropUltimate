// ============================================================
// src/face/audio.js — 効果音。素の Web Audio だけ。外部依存なし。
//
//   カメラ入力には「押した感触」が無い。反応が返らない時、プレイヤーは
//   「自分の動きが足りない」のか「認識されていない」のか「壊れている」のかを
//   区別できない。この不安は遅延そのものより強く体験を壊す。
//   だから音は飾りではなく、**入力が届いたことの証拠**として要る。
//
//   Web Audio は間違えても例外を出さずに無音になる分野なので、
//   以下は「良くない」ではなく「動かないものを出荷する」ことになる:
//     - ユーザー操作の外で resume しても成功しない(例外は出ない。無音になるだけ)
//     - exponentialRampToValueAtTime に 0 を渡すと例外になる
//     - 一度 start() したノードは再利用できない
//     - 発音数を無制限にするとモバイルはフレームレートごと落ちる
// ============================================================

const MAX_VOICES = 24;

export class Sfx {
  constructor() {
    this.ctx = null;
    this.bus = null;
    this.voices = 0;
    this.muted = false;
  }

  /** **必ず pointerdown / keydown のハンドラの中から呼ぶこと。** */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.bus = this.ctx.createGain();
      this.bus.gain.value = 0.5;
      // 同時に鳴った時に歪まないよう、軽く潰す
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 8;
      this.bus.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx.state === 'running';
  }

  _voice(dur) {
    if (!this.ctx || this.muted) return null;
    if (this.voices >= MAX_VOICES) return null;
    this.voices++;
    setTimeout(() => { this.voices = Math.max(0, this.voices - 1); }, dur * 1000 + 60);
    return this.ctx;
  }

  /** @param {number} f0 開始周波数 @param {number} f1 終了周波数 */
  _tone({ f0, f1, dur, type = 'sine', gain = 0.3, delay = 0 }) {
    const ctx = this._voice(dur + delay);
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    // 目標に 0 を渡すと例外になる。0.0001 を使う。
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise({ dur = 0.12, gain = 0.2, hp = 800 }) {
    const ctx = this._voice(dur);
    if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start();
  }

  /** 表情が立ち上がった瞬間。**判定の成否とは切り離す。押したこと自体に返す。** */
  formed() { this._tone({ f0: 420, f1: 620, dur: 0.06, type: 'triangle', gain: 0.16 }); }

  /** 的が壊れた。帯の中心に近いほど高く鳴る = どれだけ良かったかが耳で分かる。 */
  hit(quality = 0.5) {
    const base = 520 + quality * 320;
    this._tone({ f0: base, f1: base * 2, dur: 0.1, type: 'square', gain: 0.22 });
    this._tone({ f0: base * 1.5, f1: base * 3, dur: 0.14, type: 'sine', gain: 0.14, delay: 0.03 });
    this._noise({ dur: 0.09, gain: 0.1, hp: 2400 });
  }

  /** 落としてしまった。責める音にはしない。低く短く。 */
  miss() { this._tone({ f0: 220, f1: 110, dur: 0.16, type: 'sine', gain: 0.14 }); }

  /** 正しい顔なのに、別の顔が邪魔している。**咎める音ではなく、詰まった音。** */
  blocked() { this._tone({ f0: 180, f1: 150, dur: 0.09, type: 'sawtooth', gain: 0.07 }); }

  /** 的が帯に入る予告。 */
  pre() { this._tone({ f0: 900, f1: 900, dur: 0.04, type: 'sine', gain: 0.06 }); }

  round() {
    this._tone({ f0: 523, f1: 523, dur: 0.1, type: 'triangle', gain: 0.16 });
    this._tone({ f0: 784, f1: 784, dur: 0.16, type: 'triangle', gain: 0.16, delay: 0.09 });
  }

  finish() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this._tone({ f0: f, f1: f, dur: 0.24, type: 'triangle', gain: 0.18, delay: i * 0.1 }));
  }

  stop() {
    try { this.ctx?.close(); } catch (e) { /* noop */ }
    this.ctx = null;
  }
}
