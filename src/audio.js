// ============================================================
// audio.js — WebAudio 自前サウンドエンジン (CDN依存なし・オフラインOK)
//   音源ファイルは1つも使わない。残響も含めて全部その場で合成する。
//
//   信号の流れ:
//     音源 ──┬─────────────────────────→ master ─→ compressor ─→ 出力
//            └─→ send(小/中/大) ─→ convolver ─┘
//   compressor は「一斉に鳴ったとき歪む」のを防ぐ。convolver の残響は
//   コードで作った減衰ノイズ(= インパルス応答)なので、外部ファイルは要らない。
// ============================================================
import { midiFreq, MUSIC_PALETTES } from './config.js';

// localStorage は端末設定によっては読むだけで例外を投げる。音は落とさない。
function readMute() {
  try { return localStorage.getItem('edu_mute') === '1'; } catch (e) { return false; }
}
function writeMute(v) {
  try { localStorage.setItem('edu_mute', v ? '1' : '0'); } catch (e) { /* 保存できなくても鳴る */ }
}

// 音階の「度数」で考える。半音で足すと調から外れるが、度数なら必ず調の中に収まる。
function scaleNote(scale, deg) {
  const n = scale.length;
  const oct = Math.floor(deg / n);
  return scale[((deg % n) + n) % n] + oct * 12;
}

// 各レイヤーの周期を互いに素にすると、組み合わせが一周するまでが極端に長くなる。
//   ベース5 / 旋律7 / 和音3 / ハイハット4 → 最小公倍数 420 ステップ(130BPMで約80秒)。
//   1レイヤーずつは短く覚えやすいのに、全体は同じ並びに戻ってこない。
const BASS_WALK = [0, 0, 4, 2, -3];                       // 5
const MOTIFS = [                                          // 7
  [0, 2, 4, 2, 3, 1, 0],
  [4, 3, 2, 4, 5, 2, 1],
  [0, 4, 3, 5, 4, 2, 3],
  [2, 1, 3, 0, 4, 3, 5],
];
const HAT_GROOVE = [1, 0.35, 0.62, 0.4];                  // 4
const CHORDS = [                                          // 3(緊張度の帯ごと)
  [0, 4, 2],
  [0, 3, 5],
  [0, 5, 1],
  [0, 1, 6],
];

export const Snd = {
  ctx: null, master: null, comp: null, sends: null,
  muted: readMute(),
  bgmTimer: null, bgmStep: 0, bgmStage: null, bgmIndex: 0, bgmMode: 'stage', lastShoot: 0,
  bgmPalette: MUSIC_PALETTES[0], bgmIntensity: 0.35, bgmTargetIntensity: 0.35,
  bgmBand: 0, stepDur: 60 / 130 / 2, gridT0: 0, nextStep: 0,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // 出口の圧縮。同時発音が増えても頭打ちにするだけで、音量差は残す。
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18; this.comp.knee.value = 22;
      this.comp.ratio.value = 3.4; this.comp.attack.value = 0.004; this.comp.release.value = 0.18;
      this.comp.connect(this.ctx.destination);

      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.comp);

      const verb = this.ctx.createConvolver();
      verb.buffer = this._impulse(1.5, 2.6);
      const verbOut = this.ctx.createGain();
      verbOut.gain.value = 0.9;
      verb.connect(verbOut); verbOut.connect(this.comp);
      // 送り量は3段だけ共有する。音符ごとにノードを作らずに済む。
      this.sends = [null, 0.09, 0.24, 0.5].map(a => {
        if (a === null) return null;
        const g = this.ctx.createGain(); g.gain.value = a; g.connect(verb); return g;
      });
    } catch (e) { /* 音なしでも動作 */ }
  },

  // 残響の正体は「指数関数で減衰するノイズ」。左右で別の乱数にすると広がりが出る。
  _impulse(dur, decay) {
    const sr = this.ctx.sampleRate, len = Math.max(1, Math.floor(sr * dur));
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
      // 初期反射をひとつ混ぜると「箱の中で鳴っている」感じが出る
      const e = Math.floor(sr * 0.017);
      if (e < len) d[e] += (ch ? -0.6 : 0.6);
    }
    return buf;
  },

  // 絶対時刻で鳴らす内部版。rev = 0..3 で残響の送り量を選ぶ。
  _tone(freq, type, dur, vol, at, slideTo = null, rev = 0, pan = 0) {
    if (!this.ctx || this.muted) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), at + dur);
    // 立ち上がりに数msかけるだけでプチッというクリックが消える
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    let tail = g;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); tail = p;
    }
    tail.connect(this.master);
    if (rev && this.sends && this.sends[rev]) tail.connect(this.sends[rev]);
    osc.start(at); osc.stop(at + dur + 0.03);
  },

  _noise(dur, vol, at, low = false, rev = 0) {
    if (!this.ctx || this.muted) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, vol), at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node = src;
    if (low) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 500;
      src.connect(f); node = f;
    }
    node.connect(g); g.connect(this.master);
    if (rev && this.sends && this.sends[rev]) g.connect(this.sends[rev]);
    src.start(at);
  },

  // 従来どおりの相対時刻API(効果音はこちらを使う=即座に鳴る)
  tone(freq, type, dur, vol, when = 0, slideTo = null, rev = 0) {
    if (!this.ctx) return;
    this._tone(freq, type, dur, vol, this.ctx.currentTime + when, slideTo, rev);
  },
  noise(dur, vol, when = 0, low = false, rev = 0) {
    if (!this.ctx) return;
    this._noise(dur, vol, this.ctx.currentTime + when, low, rev);
  },

  // 次の拍(8分×2=4分)の頭。BGMが止まっていても直前のテンポ格子は残す。
  _nextBeat() {
    if (!this.ctx) return 0;
    const t = this.ctx.currentTime + 0.02;
    if (!this.stepDur || !this.gridT0) return t;
    const beat = this.stepDur * 2;
    const k = Math.ceil((t - this.gridT0) / beat);
    const at = this.gridT0 + k * beat;
    return (at - t > beat * 1.2) ? t : at;    // 格子が古すぎるときは待たない
  },

  // === 効果音(戦闘中のものは即座に。遅れると手応えが濁る) ===
  shoot() {
    const now = performance.now();
    if (now - this.lastShoot < 85) return;
    this.lastShoot = now;
    this.tone(880, 'square', 0.05, 0.05, 0, 500);
  },
  hit() { this.tone(300, 'square', 0.05, 0.07, 0, null, 1); },
  // 撃破音: エンベロープは全ステージ共通(混乱しない)。音程だけステージの
  //   スケール/音色に合わせて色づけする → テーマごとに"らしさ"が出る。
  kill() {
    const st = this.bgmStage, pal = this.bgmPalette || { lead: 'triangle' };
    const scale = (st && st.scale) || [60, 64, 67, 69, 71];
    const root = scale[0] + 12;
    this.noise(0.11, 0.11, 0, false, 1);
    this.tone(midiFreq(root + 7), pal.lead, 0.1, 0.085, 0.01, midiFreq(root - 12), 1);
    this.tone(midiFreq(root + 12), 'triangle', 0.07, 0.05, 0.03, null, 2);
  },

  // ベルは連打で何十回も鳴る。教会の鐘のように長く重く鳴らすと必ず耳に障るので、
  //   狙いは「鐘」ではなく グロッケン/チェレスタ の一撃 — 高く、短く、軽く。
  //   倍音は3本だけ、上ほど速く減衰させて、余韻を残さない。
  //   idx は色の周回位置。上がるほど高くなるので、見ていなくても今どの色か分かる。
  bell(idx = 0) {
    if (!this.ctx || this.muted) return;
    const at = this.ctx.currentTime;
    // 同じ音が並ぶと機械的に聞こえるので、ごく僅かに音程を散らす
    const base = 1046 * Math.pow(2, (idx % 9) / 12) * (1 + (Math.random() - 0.5) * 0.006);
    const PARTIALS = [[1, 0.05, 0.17], [2.76, 0.018, 0.09], [5.4, 0.006, 0.05]];
    for (const [ratio, vol, dur] of PARTIALS) {
      this._tone(base * ratio, 'sine', dur, vol, at, null, 1);
    }
    this._noise(0.008, 0.022, at);           // 撥が当たる一瞬だけ
  },
  // ロック中: 弾は当たっているが色は動かない、を音で伝える(詰まった打撃音)
  bellLocked() {
    if (!this.ctx || this.muted) return;
    const at = this.ctx.currentTime;
    this._tone(392, 'sine', 0.055, 0.045, at, 330);
    this._noise(0.02, 0.03, at, true);
  },

  power() { [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 'triangle', 0.1, 0.1, i * 0.08, null, 2)); },
  death() { this.tone(440, 'sawtooth', 0.55, 0.14, 0, 50, 2); this.noise(0.45, 0.14, 0.1, true, 1); },
  bossHit() { this.tone(130, 'square', 0.07, 0.09); },
  bomb() { this.noise(0.6, 0.22, 0, true, 2); this.tone(60, 'sine', 0.6, 0.25, 0, 30, 1); },
  zap() { this.noise(0.25, 0.15, 0, false, 1); this.tone(2000, 'sawtooth', 0.2, 0.08, 0, 100, 2); },
  warning() { for (let i = 0; i < 6; i++) this.tone(i % 2 ? 660 : 880, 'square', 0.14, 0.08, i * 0.22, null, 1); },

  // === 祝いのファンファーレ(拍に乗せる。半拍ずれるだけで素人くさく聞こえる) ===
  _fanfare(notes, gap, dur, vol) {
    if (!this.ctx || this.muted) return;
    const at = this._nextBeat();
    notes.forEach((m, i) => {
      this._tone(midiFreq(m), 'triangle', dur, vol, at + i * gap, null, 2, (i % 2 ? 0.18 : -0.18));
      this._tone(midiFreq(m + 12), 'sine', dur * 0.7, vol * 0.35, at + i * gap, null, 3);
    });
  },
  clear() { this._fanfare([72, 76, 79, 84], 0.15, 0.22, 0.11); },
  victory() { this._fanfare([72, 74, 76, 79, 81, 79, 76, 84], 0.19, 0.25, 0.11); },
  continueJingle() { this._fanfare([60, 64, 67, 72, 76, 79], 0.1, 0.12, 0.1); },

  // ゲーム状況で高まる緊張度(0=静か 1=最高潮)。engine から毎フレーム更新。
  setIntensity(v) { this.bgmTargetIntensity = Math.max(0, Math.min(1, v)); },

  // 緊張度を4つの帯に落とす。上がる閾値と下がる閾値をずらしてあるので、
  //   境目をうろうろしてもレイヤーがパタパタ出入りしない(ヒステリシス)。
  _band(I) {
    const up = [0.30, 0.52, 0.78], dn = [0.20, 0.42, 0.68];
    let b = this.bgmBand;
    while (b < 3 && I > up[b]) b++;
    while (b > 0 && I < dn[b - 1]) b--;
    this.bgmBand = b;
    return b;
  },

  // アダプティブBGM: テーマで音色が変わり、緊張度でレイヤーと和音が変わる
  startBGM(stage, stageIndex, mode) {
    this.stopBGM();
    if (!this.ctx) return;
    this.bgmStage = stage; this.bgmIndex = stageIndex; this.bgmMode = mode; this.bgmStep = 0;
    const pi = ((stageIndex % MUSIC_PALETTES.length) + MUSIC_PALETTES.length) % MUSIC_PALETTES.length;
    this.bgmPalette = MUSIC_PALETTES[pi];
    this.bgmTargetIntensity = mode === 'boss' ? 0.9 : 0.35;
    this.bgmBand = mode === 'boss' ? 3 : 0;
    this.stepDur = 60 / ((stage.bpm || 130) + (mode === 'boss' ? 30 : 0)) / 2;
    this.gridT0 = this.ctx.currentTime + 0.08;
    this.nextStep = this.gridT0;
    // setTimeout は数ms単位でずれる。先読みして「絶対時刻」で予約すれば、
    //   タブが少し詰まってもリズムは揺れない。
    this.bgmTimer = setInterval(() => this._tick(), 25);
    this._tick();
  },

  _tick() {
    if (!this.ctx || this.bgmTimer === null) return;
    const now = this.ctx.currentTime;
    // 裏に回っていた等で大きく遅れたら、過去の分をまとめて鳴らさずに now へ寄せる
    if (this.nextStep < now - 0.4) { this.nextStep = now + 0.02; this.gridT0 = this.nextStep; }
    let guard = 0;
    while (this.nextStep < now + 0.2 && guard++ < 32) {
      this._step(this.bgmStep, this.nextStep);
      this.bgmStep++;
      this.nextStep += this.stepDur;
    }
  },

  _step(s, at) {
    const st = this.bgmStage, pal = this.bgmPalette;
    if (!st || this.muted) return;
    const boss = this.bgmMode === 'boss';
    this.stepDur = 60 / ((st.bpm || 130) + (boss ? 30 : 0)) / 2;
    const sd = this.stepDur;
    this.bgmIntensity += (this.bgmTargetIntensity - this.bgmIntensity) * 0.12;
    const I = this.bgmIntensity;
    const band = this._band(boss ? Math.max(I, 0.8) : I);
    const scale = st.scale || [60, 63, 67, 70, 72];
    const root = scale[0];
    // ごく小さな揺らぎ。完全に等間隔だと打ち込み臭くなる。
    const hum = Math.sin(s * 78.233) * 0.004;

    // 和音は3ステップ周期で回る。帯が上がるほど不安な並びになる。
    const chord = CHORDS[band][Math.floor(s / 8) % 3];

    // --- ドラム(常時。ここだけは揺らさない) ---
    if (s % 2 === 0) this._tone(midiFreq(root - 36), 'sine', sd * 1.1, 0.09, at, midiFreq(root - 42));
    if (boss && s % 8 === 6) this._tone(midiFreq(root - 36), 'sine', sd * 0.7, 0.07, at + sd * 0.5, midiFreq(root - 44));
    if (s % 4 === 2 && band >= 1) this._noise(0.07, 0.05 + I * 0.04, at, false, 1);
    if (s % 2 === 1 || (boss && band >= 2)) this._noise(0.02, (0.012 + I * 0.028) * HAT_GROOVE[s % 4], at);

    // --- ベース(5歩で一巡) ---
    if (s % 2 === 0) {
      const deg = chord + BASS_WALK[Math.floor(s / 2) % BASS_WALK.length];
      this._tone(midiFreq(scaleNote(scale, deg) - 24), pal.bass, sd * 1.8, 0.06, at + hum);
    }

    // --- パッド(帯1以上。和音は必ず調の中の3和音) ---
    if (s % 8 === 0 && band >= 1) {
      [0, 2, 4].forEach((iv, i) => {
        this._tone(midiFreq(scaleNote(scale, chord + iv)), pal.pad, sd * 8,
          0.016 + I * 0.012, at + hum, null, 2, (i - 1) * 0.35);
      });
    }

    // --- 主旋律(帯2以上。7音の動機を和音に合わせて移す) ---
    if (band >= 2) {
      const motif = MOTIFS[Math.abs(this.bgmIndex) % MOTIFS.length];
      const deg = chord + motif[s % motif.length] + (s % 16 >= 8 ? scale.length : 0);
      if (s % 2 === 0 || boss) {
        const v = (0.022 + Math.max(0, I - 0.4) * 0.02) * (0.88 + (s % 3) * 0.06);
        this._tone(midiFreq(scaleNote(scale, deg)), pal.lead, sd * 0.9, v, at + hum, null, 2, 0.2);
      }
    }

    // --- ピンチ(帯3。調の外の音を1つだけ混ぜる) ---
    if (band >= 3 && s % 8 === 4) this._tone(midiFreq(root + 6), 'sawtooth', sd * 2, 0.018, at, null, 2);
  },

  stopBGM() {
    if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; }
    // stepDur / gridT0 は残す。止めた直後のファンファーレも同じテンポに乗る。
  },
  toggleMute() {
    this.muted = !this.muted;
    writeMute(this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    return this.muted;
  },
};
