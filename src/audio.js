// ============================================================
// audio.js — WebAudio 自前サウンドエンジン (CDN依存なし・オフラインOK)
//   startBGM は現在ステージ情報を引数で受け取る(他モジュールに依存しない)。
// ============================================================
import { midiFreq, MUSIC_PALETTES } from './config.js';

export const Snd = {
  ctx: null, master: null, muted: localStorage.getItem('edu_mute') === '1',
  bgmTimer: null, bgmStep: 0, bgmStage: null, bgmIndex: 0, bgmMode: 'stage', lastShoot: 0,
  bgmPalette: MUSIC_PALETTES[0], bgmIntensity: 0.35, bgmTargetIntensity: 0.35,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
    } catch (e) { /* 音なしでも動作 */ }
  },

  tone(freq, type, dur, vol, when = 0, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },

  noise(dur, vol, when = 0, low = false) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = src;
    if (low) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 500;
      src.connect(f); node = f;
    }
    node.connect(g); g.connect(this.master);
    src.start(t0);
  },

  shoot() {
    const now = performance.now();
    if (now - this.lastShoot < 85) return;
    this.lastShoot = now;
    this.tone(880, 'square', 0.05, 0.05, 0, 500);
  },
  hit()      { this.tone(300, 'square', 0.05, 0.07); },
  kill()     { this.noise(0.12, 0.12); this.tone(660, 'triangle', 0.1, 0.09, 0.02, 120); },
  bell()     { this.tone(1320, 'triangle', 0.07, 0.1); },
  power()    { [660, 880, 1100, 1320].forEach((f, i) => this.tone(f, 'triangle', 0.1, 0.1, i * 0.08)); },
  death()    { this.tone(440, 'sawtooth', 0.55, 0.14, 0, 50); this.noise(0.45, 0.14, 0.1, true); },
  bossHit()  { this.tone(130, 'square', 0.07, 0.09); },
  bomb()     { this.noise(0.6, 0.22, 0, true); this.tone(60, 'sine', 0.6, 0.25, 0, 30); },
  zap()      { this.noise(0.25, 0.15); this.tone(2000, 'sawtooth', 0.2, 0.08, 0, 100); },
  warning()  { for (let i = 0; i < 6; i++) this.tone(i % 2 ? 660 : 880, 'square', 0.14, 0.08, i * 0.22); },
  clear()    { [72, 76, 79, 84].forEach((m, i) => this.tone(midiFreq(m), 'triangle', 0.22, 0.11, i * 0.15)); },
  victory()  { [72, 74, 76, 79, 81, 79, 76, 84].forEach((m, i) => this.tone(midiFreq(m), 'triangle', 0.25, 0.11, i * 0.19)); },
  continueJingle() { [60, 64, 67, 72, 76, 79].forEach((m, i) => this.tone(midiFreq(m), 'triangle', 0.12, 0.1, i * 0.1)); },

  // ゲーム状況で高まる緊張度(0=静か 1=最高潮)。engine から毎フレーム更新。
  setIntensity(v) { this.bgmTargetIntensity = Math.max(0, Math.min(1, v)); },

  // アダプティブBGM: テーマで音色が変わり、緊張度でレイヤーが増減する
  startBGM(stage, stageIndex, mode) {
    this.stopBGM();
    if (!this.ctx) return;
    this.bgmStage = stage; this.bgmIndex = stageIndex; this.bgmMode = mode; this.bgmStep = 0;
    const pi = ((stageIndex % MUSIC_PALETTES.length) + MUSIC_PALETTES.length) % MUSIC_PALETTES.length;
    this.bgmPalette = MUSIC_PALETTES[pi];
    this.bgmTargetIntensity = mode === 'boss' ? 0.9 : 0.35;
    const loop = () => {
      const st = this.bgmStage, pal = this.bgmPalette;
      const boss = this.bgmMode === 'boss';
      const bpm = (st.bpm || 130) + (boss ? 30 : 0);
      const stepDur = 60 / bpm / 2;                 // 8分音符
      const s = this.bgmStep;
      this.bgmIntensity += (this.bgmTargetIntensity - this.bgmIntensity) * 0.12;
      const I = this.bgmIntensity;
      const scale = st.scale || [60, 63, 67, 70, 72];
      const root = scale[0];
      if (!this.muted) {
        // --- ドラム(常時) ---
        if (s % 2 === 0) this.tone(midiFreq(root - 36), 'sine', stepDur * 1.1, 0.09, 0, midiFreq(root - 42)); // キック
        if (s % 4 === 2 && (boss || I > 0.2)) this.noise(0.07, 0.05 + I * 0.04);                              // スネア
        if (s % 2 === 1 || (boss && I > 0.6)) this.noise(0.02, 0.012 + I * 0.028);                            // ハイハット
        // --- ベース(常時・歩く) ---
        if (s % 2 === 0) {
          const walk = [0, 0, 4, 0, 0, -3, 4, 2][Math.floor(s / 2) % 8];
          this.tone(midiFreq(root - 24 + walk + (boss && s % 16 >= 8 ? -1 : 0)), pal.bass, stepDur * 1.8, 0.06);
        }
        // --- パッド(和音・緊張度>0.25 で入る) ---
        if (s % 8 === 0 && (boss || I > 0.25)) {
          const third = (pal.feel || boss) ? 3 : 4;   // 暗いテーマ/ボスは短調感
          [0, third, 7].forEach(iv => this.tone(midiFreq(root + iv), pal.pad, stepDur * 8, 0.016 + I * 0.012));
        }
        // --- 主旋律(緊張度>0.4 で入る) ---
        if (I > 0.4 || boss) {
          const mi = Math.abs(Math.floor(Math.sin(s * 12.9898 + this.bgmIndex * 78.233) * 43758.5453) % scale.length);
          let note = scale[mi] + (s % 16 >= 8 ? 12 : 0);
          if (boss) note -= (s % 4 === 3 ? 1 : 0);
          if (s % 2 === 0 || boss) this.tone(midiFreq(note), pal.lead, stepDur * 0.9, 0.022 + Math.max(0, I - 0.4) * 0.02);
        }
        // --- ピンチ緊張(緊張度>0.8) ---
        if (I > 0.8 && s % 8 === 4) this.tone(midiFreq(root + 6), 'sawtooth', stepDur * 2, 0.018);
      }
      this.bgmStep++;
      this.bgmTimer = setTimeout(loop, stepDur * 1000);
    };
    loop();
  },
  stopBGM() { if (this.bgmTimer) { clearTimeout(this.bgmTimer); this.bgmTimer = null; } },
  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('edu_mute', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.8;
    return this.muted;
  },
};
