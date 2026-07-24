// ============================================================
// director.js — AIディレクター(動的難易度調整)
//   命中率・撃破ペース・被弾を観測しスキルを推定、湧き/射撃/支援を調整。
// ============================================================
import { clamp, lerp, pick } from './config.js';
import { getLang } from './i18n.js';

export const Director = {
  skill: 0.5, spawnMul: 1, shootMul: 1, ebSpeedMul: 1, bellMul: 1,
  timer: 0, msg: null, msgT: 0, trend: 0,

  reset() {
    this.skill = 0.5; this.spawnMul = 1; this.shootMul = 1;
    this.ebSpeedMul = 1; this.bellMul = 1; this.timer = 0; this.msg = null; this.msgT = 0;
  },

  update(dt, game) {
    if (this.msgT > 0) this.msgT -= dt;
    this.timer += dt;
    if (this.timer < 6) return;
    this.timer = 0;
    const s = game.stats;
    const acc = s.shots > 20 ? s.hits / s.shots : 0.5;
    const now = performance.now();
    const recentDeaths = s.deathTimes.filter(t => now - t < 25000).length;
    const kpm = s.killTimes.filter(t => now - t < 20000).length * 3;
    let target = 0.25 + acc * 0.5 + clamp(kpm / 60, 0, 0.35) - recentDeaths * 0.28;
    target = clamp(target, 0, 1);
    const prev = this.skill;
    this.skill = lerp(this.skill, target, 0.5);
    this.trend = this.skill - prev;
    this.spawnMul = lerp(1.35, 0.72, this.skill);
    this.shootMul = lerp(0.6, 1.45, this.skill);
    this.ebSpeedMul = lerp(0.85, 1.2, this.skill);
    this.bellMul = lerp(1.6, 0.85, this.skill);
    const ja = getLang() === 'ja';
    if (Math.abs(this.trend) > 0.09) {
      this.say(this.trend > 0
        ? (ja ? pick(['🤖 好調を検知 → 敵が本気を出す', '🤖 腕前上昇 → 難易度アップ']) : pick(['🤖 On fire → enemies get serious', '🤖 Skill up → difficulty raised']))
        : (ja ? pick(['🤖 苦戦を検知 → 支援ベル増加', '🤖 敵の攻勢を緩和中…']) : pick(['🤖 Struggling → more support bells', '🤖 Easing the assault…'])));
    }
  },
  say(text) { this.msg = text; this.msgT = 4; },
};
