// ============================================================
// audio.js — WebAudio 自前サウンドエンジン (CDN依存なし・オフラインOK)
//   startBGM は現在ステージ情報を引数で受け取る(他モジュールに依存しない)。
// ============================================================
import { midiFreq } from './config.js';

export const Snd = {
  ctx: null, master: null, muted: localStorage.getItem('edu_mute') === '1',
  bgmTimer: null, bgmStep: 0, bgmStage: null, bgmIndex: 0, bgmMode: 'stage', lastShoot: 0,

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

  startBGM(stage, stageIndex, mode) {
    this.stopBGM();
    if (!this.ctx) return;
    this.bgmStage = stage; this.bgmIndex = stageIndex; this.bgmMode = mode; this.bgmStep = 0;
    const loop = () => {
      const st = this.bgmStage;
      const boss = this.bgmMode === 'boss';
      const bpm = (st.bpm || 130) + (boss ? 32 : 0);
      const stepDur = 60 / bpm / 2;
      const s = this.bgmStep;
      const scale = st.scale || [60, 63, 67, 70, 72];
      if (!this.muted) {
        const mi = Math.abs(Math.floor(Math.sin(s * 12.9898 + this.bgmIndex * 78.233) * 43758.5453) % scale.length);
        let note = scale[mi] + (s % 16 >= 8 ? 12 : 0);
        if (boss) note = scale[mi] - (s % 4 === 3 ? 1 : 0);
        if (s % 2 === 0 || boss) this.tone(midiFreq(note), 'square', stepDur * 0.85, 0.028);
        if (s % 4 === 0) this.tone(midiFreq(scale[0] - 24 + (boss && s % 16 >= 8 ? 3 : 0)), 'triangle', stepDur * 3, 0.06);
        if (s % 2 === 1) this.noise(0.02, 0.015);
        if (boss && s % 8 === 4) this.noise(0.08, 0.05, 0, true);
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
