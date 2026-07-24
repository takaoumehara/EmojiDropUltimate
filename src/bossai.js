// ============================================================
// bossai.js — 学習するボス
//   プレイヤーの移動速度と「よく居る場所」を観測し、フェーズが進むほど偏差撃ち。
// ============================================================
import { clamp, lerp, dist } from './config.js';
import { game } from './state.js';
import { isVert, latSpan, latOf } from './geo.js';

export const BossAI = {
  hist: new Array(16).fill(0), sampleT: 0, px: 0, py: 0, vx: 0, vy: 0, thinking: 0,

  reset() { this.hist.fill(0); this.sampleT = 0; this.vx = 0; this.vy = 0; this.thinking = 0; },

  observe(dt) {
    const p = game.player;
    this.sampleT += dt;
    if (this.sampleT >= 0.1) {
      const inv = 1 / this.sampleT;
      this.vx = lerp(this.vx, (p.x - this.px) * inv, 0.35);
      this.vy = lerp(this.vy, (p.y - this.py) * inv, 0.35);
      this.px = p.x; this.py = p.y;
      this.sampleT = 0;
      const b = clamp(Math.floor(latOf(p) / latSpan() * 16), 0, 15);
      this.hist[b] += 1;
    }
    if (this.thinking > 0) this.thinking -= dt;
  },

  aimPoint(from, bulletSpeed, phase) {
    const p = game.player;
    if (phase === 0) return { x: p.x, y: p.y };
    const t = clamp(dist(from, p) / bulletSpeed, 0, 1.4);
    let ax = p.x + this.vx * t * 0.85;
    let ay = p.y + this.vy * t * 0.85;
    if (phase >= 2 && Math.random() < 0.4) {
      let bi = 0;
      for (let i = 1; i < 16; i++) if (this.hist[i] > this.hist[bi]) bi = i;
      const lat = (bi + 0.5) / 16 * latSpan();
      if (isVert()) ax = lerp(ax, lat, 0.6); else ay = lerp(ay, lat, 0.6);
      this.thinking = 0.8;
    }
    return { x: ax, y: ay };
  },
};
