// ============================================================
// engine.js — ゲームロジック(更新・生成・当たり判定・状態遷移)
// ============================================================
import { CFG, BELLS, BOSS_PHASES, BOSS_STYLES, STYLE_KEYS, STAGES, PATTERNS, rand, randInt, pick, dist, clamp, lerp, makeRng, hashStr, todayKey } from './config.js';
import { W, H } from './env.js';
import { game, newGame, setGame } from './state.js';
import { stage, dirDef, fwAngle, inAngle, isVert, latSpan, fwSpan, posFromPL, invPL, latOf, playerHome } from './geo.js';
import { Snd } from './audio.js';
import { Weather } from './weather.js';
import { Director } from './director.js';
import { BossAI } from './bossai.js';
import { t, getLang } from './i18n.js';
import { generateStage, proceduralStage, scaleStage } from './aistage.js';
import { Save } from './save.js';
import { SHARE_URL } from './sharecard.js';
import { Leaderboard } from './leaderboard.js';
import { openShare } from './ui.js';
import { Coop } from './coop.js';

const COOP_HP_MUL = 2.2; // 共闘ボスは二人がかり前提で硬くする

export function rankOf(score) { return score >= 180000 ? 'S' : score >= 120000 ? 'A' : score >= 70000 ? 'B' : 'C'; }

// === パーティクル / ポップアップ ===
export function particles(x, y, n, color, mul = 1) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(30, 160) * mul;
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: rand(0.9, 2.6), size: rand(2, 6), color });
  }
}
export function popup(x, y, text, color = '#ffdd44') { game.popups.push({ x, y, text, color, life: 1 }); }
function explosion(x, y, size, color) {
  particles(x, y, size * 3, color, 1.5);
  particles(x, y, size, '#ffffff', 0.8);
  game.shake = Math.min(game.shake + size * 0.5, CFG.MAX_SHAKE);
}

export function initStars() {
  game.stars = [];
  for (let l = 0; l < 3; l++)
    for (let i = 0; i < 36; i++)
      game.stars.push({ x: rand(0, W), y: rand(0, H), l, size: rand(1, 2.6) * (1 + l * 0.3), b: rand(0.3, 1) });
}

// === プレイヤー ===
function resetPlayer() {
  const p = game.player, home = playerHome();
  p.x = home.x; p.y = home.y;
  p.dead = false; p.inv = true; p.invT = CFG.INV_TIME;
  p.fireT = 0; p.trail = [];
}

function updatePlayer(dt, keys) {
  const p = game.player;
  if (p.dead) return;
  let dx = 0, dy = 0;
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) dx -= 1;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) dx += 1;
  if (keys['ArrowUp'] || keys['w'] || keys['W']) dy -= 1;
  if (keys['ArrowDown'] || keys['s'] || keys['S']) dy += 1;
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  const spd = CFG.PLAYER_SPEED * (p.boost ? 1.5 : 1) * dt;
  p.x = clamp(p.x + dx * spd, 22, W - 22);
  p.y = clamp(p.y + dy * spd, 40, H - 22);
  p.trail.unshift({ x: p.x, y: p.y });
  if (p.trail.length > 40) p.trail.pop();
  if (p.inv) { p.invT -= dt * 1000; if (p.invT <= 0) p.inv = false; }
  if (p.boost) { p.boostT -= dt * 1000; if (p.boostT <= 0) p.boost = false; }
  p.fireT -= dt * 1000;
  if (p.fireT <= 0) { fire(); p.fireT = p.power >= 3 ? 105 : 130; }
  if (p.muzzle > 0) p.muzzle -= dt * 11;
  p.anim += dt * 10;
}

function fire() {
  const p = game.player, a = fwAngle();
  const fx = Math.cos(a), fy = Math.sin(a);
  const px = -fy, py = fx;
  p.muzzle = 1;
  Snd.shoot();
  const mk = (ox, spread = 0) => {
    game.pBullets.push({ x: p.x + fx * 20 + px * ox, y: p.y + fy * 20 + py * ox, vx: fx * CFG.BULLET_SPEED + px * spread, vy: fy * CFG.BULLET_SPEED + py * spread, size: 4 });
    game.stats.shots++;
  };
  if (p.power === 1) mk(0);
  else if (p.power === 2) { mk(-9); mk(9); }
  else { mk(0); mk(-13, -45); mk(13, 45); }
  for (let i = 0; i < p.options; i++) {
    const tt = p.trail[Math.min((i + 1) * 14, p.trail.length - 1)];
    if (tt) { game.pBullets.push({ x: tt.x + fx * 16, y: tt.y + fy * 16, vx: fx * CFG.BULLET_SPEED, vy: fy * CFG.BULLET_SPEED, size: 3, opt: true }); game.stats.shots++; }
  }
}

function killPlayer() {
  const p = game.player;
  if (p.dead || p.inv) return;
  if (p.shield) { p.shield = false; p.inv = true; p.invT = 700; particles(p.x, p.y, 16, '#ffd700'); Snd.hit(); return; }
  Snd.death();
  explosion(p.x, p.y, 9, '#ff6600');
  game.flash = 0.5;
  game.lives--;
  game.stats.deathTimes.push(performance.now());
  p.dead = true;
  p.power = Math.max(1, p.power - 1);
  p.options = Math.max(0, p.options - 1);
  game.combo = 0; game.comboMul = 1;
  if (game.lives <= 0) {
    setTimeout(() => {
      if (game.state !== 'play' && game.state !== 'warn') return;
      recordRunEnd({ daily: game.daily });
      game.state = 'over'; game.overT = 0; saveHi(); Snd.stopBGM();
    }, 900);
  } else {
    setTimeout(() => { if (game.state === 'play' || game.state === 'warn') resetPlayer(); }, 500);
  }
}

export function useBomb() {
  if (game.bombs <= 0 || game.player.dead || game.state !== 'play') return;
  game.bombs--;
  Snd.bomb();
  game.flash = 0.8; game.shake = CFG.MAX_SHAKE;
  for (const e of game.enemies) { if (e.delay > 0) continue; e.hp -= 4; if (e.hp <= 0) killEnemy(e, true); }
  game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
  game.eBullets = [];
  if (game.boss && !game.boss.entering) damageBoss(10);
  particles(game.player.x, game.player.y, 40, '#7CFC00', 3);
}

// === 敵 ===
function spawnWave() {
  const st = stage();
  const list = PATTERNS[game.waveIdx % PATTERNS.length](st.enemies, latSpan());
  for (const it of list) {
    const tt = it.t;
    const lat = clamp(it.lat, 42, latSpan() - 42);
    game.enemies.push({
      type: tt.type, emoji: tt.emoji,
      hp: tt.hp, maxHp: tt.hp, speed: tt.speed, pts: tt.pts, size: tt.size,
      amp: tt.amp || 60, freq: tt.freq || 2, shootRate: tt.shootRate || 0,
      prog: 0, lat0: lat, lat, phase: rand(0, Math.PI * 2),
      shootT: rand(600, 1800), delay: it.delay, flash: 0,
      locked: false, lockLat: 0, x: -999, y: -999,
    });
  }
  game.waveIdx++;
}

function updateEnemies(dt) {
  const wMod = Weather.mods, span = fwSpan();
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    if (e.delay > 0) { e.delay -= dt * 1000; continue; }
    const spd = e.speed * wMod.enemySpeed * dt;
    switch (e.type) {
      case 'straight': e.prog += spd; break;
      case 'wave': e.prog += spd; e.phase += e.freq * dt * Math.PI; e.lat = e.lat0 + Math.sin(e.phase) * e.amp; break;
      case 'shooter': case 'tank':
        e.prog += spd * (e.prog < span * 0.45 ? 1 : 0.25);
        e.shootT -= dt * 1000;
        if (e.shootT <= 0 && e.prog > 60 && e.prog < span * 0.75) {
          e.shootT = 1000 / (e.shootRate * Director.shootMul);
          const a = Math.atan2(game.player.y - e.y, game.player.x - e.x);
          const bs = CFG.EBULLET_SPEED * Director.ebSpeedMul;
          if (e.type === 'tank') for (let k = -1; k <= 1; k++) game.eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a + k * 0.25) * bs, vy: Math.sin(a + k * 0.25) * bs, size: 5 });
          else game.eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs, size: 5 });
        }
        break;
      case 'kamikaze':
        if (!e.locked && e.prog > 70) { e.locked = true; e.lockLat = latOf(game.player); }
        e.prog += spd * (e.locked ? 1.5 : 1);
        if (e.locked) e.lat = lerp(e.lat, e.lockLat, dt * 3);
        break;
    }
    const pos = posFromPL(e.prog, e.lat);
    e.x = pos.x; e.y = pos.y;
    if (e.flash > 0) e.flash -= dt * 8;
    if (e.prog > span + 110 || e.lat < -90 || e.lat > latSpan() + 90) game.enemies.splice(i, 1);
  }
}

function damageEnemy(e, dmg) {
  e.hp -= dmg; e.flash = 1; game.stats.hits++; Snd.hit(); particles(e.x, e.y, 2, '#ffffff');
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e, silent = false) {
  const now = performance.now();
  if (now - game.lastKill < CFG.COMBO_WINDOW) { game.combo++; game.comboMul = Math.min(1 + Math.floor(game.combo / 3), CFG.MAX_COMBO_MUL); }
  else { game.combo = 0; game.comboMul = 1; }
  game.lastKill = now;
  game.stats.kills++; game.stats.killTimes.push(now);
  if (game.stats.killTimes.length > 200) game.stats.killTimes.shift();
  const pts = Math.round(e.pts * game.comboMul * Weather.mods.scoreMul);
  game.score += pts;
  if (!silent) Snd.kill();
  explosion(e.x, e.y, 5, stage().sky[1]);
  popup(e.x, e.y - 18, '+' + pts, game.comboMul > 1 ? '#ff8844' : '#ffdd44');
}

// === ボス ===
function spawnBoss() {
  const st = stage();
  const styleKey = (st.boss.style && BOSS_STYLES[st.boss.style]) ? st.boss.style : STYLE_KEYS[game.stageIndex % STYLE_KEYS.length];
  const style = BOSS_STYLES[styleKey];
  const hp = Math.round(st.boss.hp * (game.coop ? COOP_HP_MUL : 1)); // 共闘は二人がかり前提で硬く
  game.boss = {
    prog: -80, targetProg: 150, lat: latSpan() / 2, latPhase: 0,
    hp, maxHp: hp, phase: 0,
    atkT: 900, atkIdx: 0, flash: 0, entering: true,
    charging: false, chargeTo: null, returning: false, x: -999, y: -999,
    style: styleKey, col: style.col, shape: style.shape, phases: style.phases, ringAng: 0, spiralAng: 0,
  };
  if (game.coop) Coop.initBoss(hp);
  game.bossActive = true;
  BossAI.reset();
  Snd.startBGM(st, game.stageIndex, 'boss');
}

function updateBoss(dt) {
  const b = game.boss;
  if (!b) return;
  BossAI.observe(dt);
  if (b.entering) {
    b.prog = lerp(b.prog, b.targetProg, dt * 2);
    if (Math.abs(b.prog - b.targetProg) < 3) { b.entering = false; b.prog = b.targetProg; }
  } else {
    // 共闘: 相方の与ダメを反映(相方が削り切れば撃破)
    if (game.coop) { b.hp = Coop.bossShared; if (b.hp <= 0) { bossDefeated(); return; } }
    if (b.flash > 0) b.flash -= dt * 6;
    const hpR = b.hp / b.maxHp;
    b.phase = hpR <= 0.33 ? 2 : hpR <= 0.66 ? 1 : 0;
    if (b.charging) {
      b.x = lerp(b.x, b.chargeTo.x, dt * 4); b.y = lerp(b.y, b.chargeTo.y, dt * 4);
      if (Math.hypot(b.x - b.chargeTo.x, b.y - b.chargeTo.y) < 12) {
        b.charging = false;
        const inv = invPL(b.x, b.y); b.prog = inv.prog; b.lat = inv.lat; b.returning = true;
      }
      if (b.charging) return;
    } else {
      b.latPhase += dt * (1.2 + b.phase * 0.4);
      const oscLat = latSpan() / 2 + Math.sin(b.latPhase) * latSpan() * 0.3;
      if (b.returning) {
        b.prog = lerp(b.prog, b.targetProg, dt * 2.5); b.lat = lerp(b.lat, oscLat, dt * 2.5);
        if (Math.abs(b.prog - b.targetProg) < 4) b.returning = false;
      } else b.lat = oscLat;
      b.atkT -= dt * 1000;
      if (b.atkT <= 0 && !b.returning) {
        const ph = (b.phases || BOSS_PHASES)[b.phase];
        const atk = ph.attacks[b.atkIdx % ph.attacks.length];
        b.atkT = atk.interval; b.atkIdx++;
        bossAttack(b, atk);
      }
    }
  }
  if (!b.charging) { const pos = posFromPL(b.prog, b.lat); b.x = pos.x; b.y = pos.y; }
}

function ebPush(b, x, y, a, speed, size) {
  game.eBullets.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size, boss: true, col: b.col, shape: b.shape, spin: Math.random() * 6.28 });
}
function bossAttack(b, atk) {
  switch (atk.type) {
    case 'aimed': {
      const aim = BossAI.aimPoint(b, atk.speed, b.phase);
      const base = Math.atan2(aim.y - b.y, aim.x - b.x);
      for (let i = 0; i < atk.count; i++) ebPush(b, b.x, b.y, base + (i - (atk.count - 1) / 2) * 0.16, atk.speed, 7);
      break;
    }
    case 'spread': {
      const base = inAngle();
      for (let i = 0; i < atk.count; i++) ebPush(b, b.x, b.y, base - atk.arc / 2 + atk.arc / (atk.count - 1) * i, atk.speed, 6);
      break;
    }
    case 'ring': {
      b.ringAng += atk.spin || 0;
      for (let i = 0; i < atk.count; i++) ebPush(b, b.x, b.y, b.ringAng + i / atk.count * Math.PI * 2, atk.speed, 6);
      break;
    }
    case 'spiral': {
      for (let i = 0; i < atk.count; i++) ebPush(b, b.x, b.y, b.spiralAng + i / atk.count * Math.PI * 2, atk.speed, 6);
      b.spiralAng += atk.spin || 0.4;
      break;
    }
    case 'wall': {
      const base = inAngle();
      const gap = latOf(game.player), span = latSpan();
      for (let i = 0; i < atk.count; i++) {
        const lat = span * (i + 0.5) / atk.count;
        if (Math.abs(lat - gap) < span * 0.13) continue; // プレイヤー位置に隙間
        const pos = posFromPL(b.prog, lat);
        ebPush(b, pos.x, pos.y, base, atk.speed, 6);
      }
      break;
    }
    case 'summon': {
      const tt = stage().enemies[atk.minion] || stage().enemies[0];
      for (let i = 0; i < 3; i++) {
        game.enemies.push({
          type: tt.type === 'tank' ? 'shooter' : tt.type, emoji: tt.emoji,
          hp: 1, maxHp: 1, speed: tt.speed * 0.85, pts: tt.pts, size: tt.size,
          amp: tt.amp || 60, freq: tt.freq || 2, shootRate: tt.shootRate || 0,
          prog: b.prog + 20, lat0: b.lat + (i - 1) * 46, lat: b.lat + (i - 1) * 46,
          phase: rand(0, Math.PI * 2), shootT: 1600, delay: i * 180, flash: 0,
          locked: false, lockLat: 0, x: -999, y: -999,
        });
      }
      break;
    }
    case 'charge': {
      b.charging = true;
      const p = game.player, a = fwAngle();
      b.chargeTo = { x: p.x + Math.cos(a) * 60, y: p.y + Math.sin(a) * 60 };
      break;
    }
  }
}

function damageBoss(dmg) {
  const b = game.boss;
  if (!b || b.entering) return;
  b.flash = 1; game.stats.hits++; Snd.bossHit();
  game.shake = Math.min(game.shake + 1.5, CFG.MAX_SHAKE);
  if (game.coop) { Coop.dealLocal(dmg); b.hp = Coop.bossShared; } // 共闘: 共有HPを削る
  else b.hp -= dmg;
  if (b.hp <= 0) bossDefeated();
}

// ボス撃破 → フィナーレ(爽快感の余韻)。ソロ/共闘/エンドレスで分岐。
function bossDefeated() {
  const b = game.boss;
  if (!b) return;
  Snd.kill(); Snd.bomb();
  const bx = b.x, by = b.y, emoji = stage().boss.emoji;
  explosion(bx, by, 18, '#ffd700');
  game.boss = null; game.bossActive = false;
  game.eBullets = []; game.enemies = [];
  const bonus = Math.round((game.coop ? 8000 : game.endless ? 3000 * game.world : 5000 * (game.stageIndex + 1)) * Weather.mods.scoreMul);
  game.score += bonus; saveHi();
  let kind;
  if (game.coop) { kind = 'coop'; recordRunEnd({}); }
  else if (game.endless) { kind = 'world'; game.world++; game.pendingStage = scaleStage(proceduralStage(), game.world); }
  else if (game.daily) { kind = 'victory'; recordRunEnd({ daily: true }); }
  else if (game.stageIndex >= game.stages.length - 1) { kind = 'victory'; recordRunEnd({}); }
  else kind = 'stage';
  const big = kind === 'victory' || kind === 'coop';
  game.finale = { t: 0, dur: big ? 3400 : 2300, kind, bx, by, emoji, bonus, snd: false };
  game.state = 'finale';
  game.flash = 0.95; game.shake = CFG.MAX_SHAKE;
  Snd.stopBGM();
}

// === ベル ===
function spawnBell() {
  game.bells.push({ prog: 60, lat: rand(50, latSpan() - 50), idx: 0, hits: 0, phase: rand(0, Math.PI * 2), size: 16, x: -999, y: -999 });
}
function hitBell(bell) {
  bell.hits++; bell.idx = (bell.idx + 1) % BELLS.length; bell.prog -= 26;
  Snd.bell(); particles(bell.x, bell.y, 3, BELLS[bell.idx].color);
}
function collectBell(bell) {
  const bt = BELLS[bell.idx], p = game.player;
  Snd.power(); particles(bell.x, bell.y, 14, bt.color);
  popup(bell.x, bell.y - 16, bt.name + '!', bt.color);
  switch (bt.effect) {
    case 'points': game.score += Math.round(bt.value * game.comboMul * Weather.mods.scoreMul); break;
    case 'speed': p.boost = true; p.boostT = bt.duration; break;
    case 'power': p.power = Math.min(p.power + 1, CFG.MAX_POWER); break;
    case 'option': p.options = Math.min(p.options + 1, CFG.MAX_OPTIONS); break;
    case 'shield': p.shield = true; break;
    case 'bomb': game.bombs = Math.min(game.bombs + 1, CFG.MAX_BOMBS); break;
  }
}

// === ステージ進行 ===
function startStage(i) {
  game.stageIndex = i;
  game.stageTime = 0; game.waveIdx = 0;
  game.bossActive = false; game.warnT = 0;
  game.nextWave = 1400; game.nextBell = 6500;
  game.enemies = []; game.eBullets = []; game.pBullets = [];
  game.bells = []; game.bgFloats = []; game.popups = []; game.boss = null;
  game.state = 'intro'; game.introT = CFG.INTRO_TIME;
  resetPlayer(); initStars(); Snd.stopBGM();
}

function updateStage(dt) {
  game.stageTime += dt * 1000;
  const st = stage();
  if (!game.bossActive && game.warnT <= 0) {
    game.nextWave -= dt * 1000;
    if (game.nextWave <= 0) {
      spawnWave();
      const base = (2900 - game.stageIndex * 260) * Director.spawnMul / Weather.mods.spawnMul;
      game.nextWave = Math.max(1000, base + rand(-400, 400));
    }
    game.nextBell -= dt * 1000;
    if (game.nextBell <= 0) {
      spawnBell();
      const clearBonus = Weather.kind === 'clear' ? 0.8 : 1;
      game.nextBell = rand(9000, 15000) * clearBonus / Director.bellMul;
    }
    if (game.stageTime >= st.dur) {
      game.warnT = CFG.WARN_TIME; Snd.warning();
      game.enemies = []; game.eBullets = []; game.bells = [];
    }
  }
  if (game.warnT > 0) { game.warnT -= dt * 1000; if (game.warnT <= 0) spawnBoss(); }
}

function updateBullets(dt) {
  const wind = Weather.mods.windLat;
  const a = fwAngle();
  const px = -Math.sin(a), py = Math.cos(a);
  for (let i = game.pBullets.length - 1; i >= 0; i--) {
    const b = game.pBullets[i]; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < -25 || b.x > W + 25 || b.y < -25 || b.y > H + 25) game.pBullets.splice(i, 1);
  }
  for (let i = game.eBullets.length - 1; i >= 0; i--) {
    const b = game.eBullets[i];
    b.x += (b.vx + px * wind * 0.5) * dt; b.y += (b.vy + py * wind * 0.5) * dt;
    if (b.x < -25 || b.x > W + 25 || b.y < -25 || b.y > H + 25) game.eBullets.splice(i, 1);
  }
  for (let i = game.bells.length - 1; i >= 0; i--) {
    const bl = game.bells[i];
    bl.prog += 42 * dt; bl.phase += dt * 3;
    bl.lat += Math.sin(bl.phase) * 14 * dt + wind * 0.4 * dt;
    const pos = posFromPL(bl.prog, bl.lat); bl.x = pos.x; bl.y = pos.y;
    if (bl.prog > fwSpan() + 90) game.bells.splice(i, 1);
  }
}

function updateBg(dt) {
  const st = stage();
  const a = inAngle();
  const mx = Math.cos(a), my = Math.sin(a);
  for (const s of game.stars) {
    const spd = 22 + s.l * 32;
    s.x += mx * spd * dt; s.y += my * spd * dt;
    if (s.x < -12) s.x = W + 10; if (s.x > W + 12) s.x = -10;
    if (s.y < -12) s.y = H + 10; if (s.y > H + 12) s.y = -10;
  }
  if (Math.random() < dt * 0.65) {
    game.bgFloats.push({ emoji: pick(st.bgEmojis), prog: -60, lat: rand(20, latSpan() - 20), speed: rand(28, 62), size: rand(22, 44), alpha: rand(0.13, 0.3), x: -999, y: -999 });
  }
  for (let i = game.bgFloats.length - 1; i >= 0; i--) {
    const f = game.bgFloats[i]; f.prog += f.speed * dt;
    const pos = posFromPL(f.prog, f.lat); f.x = pos.x; f.y = pos.y;
    if (f.prog > fwSpan() + 130) game.bgFloats.splice(i, 1);
  }
}

function updateLightning(dt) {
  if (!Weather.mods.lightning || game.state !== 'play') return;
  game.lightT -= dt;
  if (game.boltAnim) { game.boltAnim.t -= dt; if (game.boltAnim.t <= 0) game.boltAnim = null; }
  if (game.lightT <= 0) {
    game.lightT = rand(6, 11);
    const targets = game.enemies.filter(e => e.delay <= 0).slice(0, 3);
    if (targets.length) {
      game.flash = Math.max(game.flash, 0.55); Snd.zap();
      const pts = [];
      for (const e of targets) { pts.push({ x: e.x, y: e.y }); explosion(e.x, e.y, 5, '#aaddff'); popup(e.x, e.y - 16, '⚡ +' + e.pts, '#aaddff'); game.score += e.pts; }
      game.enemies = game.enemies.filter(e => !targets.includes(e));
      game.boltAnim = { t: 0.35, pts };
      Director.say(t('lightning_msg'));
    }
  }
}

// === 当たり判定 ===
function checkCollisions() {
  const p = game.player;
  const hitR = 7, collectR = 24;
  for (let bi = game.pBullets.length - 1; bi >= 0; bi--) {
    const b = game.pBullets[bi];
    let used = false;
    for (let ei = game.enemies.length - 1; ei >= 0; ei--) {
      const e = game.enemies[ei];
      if (e.delay > 0) continue;
      if (dist(b, e) < e.size + b.size) { damageEnemy(e, 1); game.pBullets.splice(bi, 1); used = true; if (e.hp <= 0) game.enemies.splice(ei, 1); break; }
    }
    if (used) continue;
    if (game.boss && !game.boss.entering && dist(b, game.boss) < 42 + b.size) { damageBoss(1); game.pBullets.splice(bi, 1); continue; }
    for (let li = game.bells.length - 1; li >= 0; li--) {
      const bl = game.bells[li];
      if (dist(b, bl) < bl.size + b.size + 4) { hitBell(bl); game.pBullets.splice(bi, 1); break; }
    }
  }
  if (!p.dead) {
    for (let i = game.bells.length - 1; i >= 0; i--) if (dist(game.bells[i], p) < collectR + game.bells[i].size) { collectBell(game.bells[i]); game.bells.splice(i, 1); }
  }
  if (p.dead || p.inv) return;
  for (let i = game.eBullets.length - 1; i >= 0; i--) if (dist(game.eBullets[i], p) < hitR + game.eBullets[i].size) { game.eBullets.splice(i, 1); killPlayer(); return; }
  for (const e of game.enemies) { if (e.delay > 0) continue; if (dist(e, p) < hitR + e.size * 0.72) { killPlayer(); return; } }
  if (game.boss && !game.boss.entering && dist(game.boss, p) < hitR + 38) { killPlayer(); return; }
}

// === 汎用更新 ===
export function updateParticles(dt) {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; p.life -= p.decay * dt;
    if (p.life <= 0) game.particles.splice(i, 1);
  }
}
function updatePopups(dt) {
  for (let i = game.popups.length - 1; i >= 0; i--) { game.popups[i].life -= dt * 1.1; if (game.popups[i].life <= 0) game.popups.splice(i, 1); }
}
function updateShake(dt) {
  if (game.shake > 0.1) {
    game.shakeX = (Math.random() - 0.5) * game.shake * 2;
    game.shakeY = (Math.random() - 0.5) * game.shake * 2;
    game.shake *= Math.pow(0.0015, dt);
  } else { game.shakeX = 0; game.shakeY = 0; game.shake = 0; }
  if (game.flash > 0) game.flash -= dt * 2;
}

// === 状態遷移 ===
function saveHi() {
  if (game.score > game.hi) { game.hi = game.score; localStorage.setItem('edu_hiscore', String(game.hi)); }
}
function freshGame() { const hi = game.hi; setGame(newGame()); game.hi = hi; Director.reset(); Save.startRun(); }

export function startRun() {
  Snd.init(); freshGame();
  startStage(0);
}
// エンドレスAI: 第1ワールドはサーバー(Gemini)で生成→以降はローカル手続き生成で無限連戦
export function requestAIStage() {
  if (game.aiLoading) return;
  Snd.init();
  game.aiLoading = true; game.aiMsg = t('ai_generating');
  generateStage(Weather.summary()).then(res => {
    game.aiLoading = false;
    if (game.state !== 'title') return;
    if (res.source === 'local') game.aiMsg = t('ai_failed');
    startEndless(res.stage);
  }).catch(() => { game.aiLoading = false; game.aiMsg = t('ai_failed'); });
}
function startEndless(stageObj) {
  Snd.init(); freshGame();
  game.stages = [stageObj]; game.aiMode = true; game.endless = true; game.world = 1;
  startStage(0);
}
function startEndlessNext() {
  const st = game.pendingStage; game.pendingStage = null;
  game.stages = [st]; game.aiMode = false;
  startStage(0);
}
// デイリー: 日付シードでローカル生成(全員同じステージ)。1画面クリアでスコア確定。
export function startDaily() {
  Snd.init(); freshGame();
  const seed = hashStr('daily-' + todayKey());
  game.stages = [proceduralStage(makeRng(seed))]; game.aiMode = true; game.daily = true;
  startStage(0);
}
// URL の ?seed=xxxx で同じステージを再現
export function startFromSeed(seedStr) {
  Snd.init(); freshGame();
  const seed = hashStr('seed-' + seedStr);
  game.stages = [proceduralStage(makeRng(seed))]; game.aiMode = true;
  startStage(0);
}

// === 2人共闘 ===
// ロビーを開く(ホストとしてコード発行、相方待ち)
export function openCoopLobby() {
  Snd.init();
  Coop.host();
  game.state = 'coop';
}
// 共闘スタート: 共有の種でステージ決定 → 短めの道中 → 共有ボス
//   Coop.mode: 'story'=オリジナル6ステージから種で1面 / 'ai'=AI生成面
export function startCoop() {
  if (!Coop.connected) return; // 相方が参加してから
  Snd.init(); freshGame();
  const rng = makeRng(Coop.seed || hashStr('coop'));
  let st;
  if (Coop.mode === 'story') st = JSON.parse(JSON.stringify(STAGES[Math.floor(rng() * STAGES.length)]));
  else st = proceduralStage(rng);
  st.dur = 34000; // 共闘は短めセッション(ソロより早くボスへ)
  game.coop = true; game.aiMode = Coop.mode !== 'story';
  game.stages = [st];
  startStage(0);
}
// ゲスト: ホストの開始合図(共有種つき)を受けて同時スタート
Coop.onStartGame = () => startCoop();

function recordRunEnd({ daily = false } = {}) {
  const r = {
    score: game.score,
    world: game.endless ? game.world : (game.stageIndex + 1),
    kills: game.stats.kills, shots: game.stats.shots, hits: game.stats.hits,
    deaths: game.stats.deathTimes.length, daily,
  };
  const newSkins = Save.recordRun(r);
  game.lastResult = { ...r, rank: rankOf(game.score), newSkins };
  if (newSkins > 0) game.skinFlash = 4;
  // デイリーは匿名ランキングへスコア送信(名前=任意のスクリーンネーム)
  if (daily) {
    Leaderboard.submit({ name: Save.name(), cid: Save.clientId(), score: game.score, day: todayKey() });
  }
}

export function shareRun() {
  const r = game.lastResult || { score: game.score, world: game.stageIndex + 1, rank: rankOf(game.score) };
  const ja = getLang() === 'ja';
  const mode = game.coop ? (ja ? '2人共闘' : 'CO-OP')
    : game.endless ? (ja ? 'エンドレスAI' : 'ENDLESS AI')
      : game.daily ? (ja ? 'デイリー ' + todayKey() : 'DAILY ' + todayKey())
        : game.aiMode ? (ja ? 'AIステージ' : 'AI STAGE') : (ja ? 'ストーリー' : 'STORY');
  const sub = game.coop ? (ja ? `${Coop.partner.name} と共闘クリア` : `Cleared with ${Coop.partner.name}`)
    : game.endless ? (ja ? `ワールド ${r.world} 到達` : `Reached World ${r.world}`)
      : (ja ? `ステージ ${r.world}` : `Stage ${r.world}`);
  return openShare({
    emoji: stage().emoji, mode, stageName: game.stages[game.stageIndex] && game.stages[game.stageIndex].name,
    rank: r.rank, score: r.score, sub, weather: Weather.loaded ? Weather.statusLine() : '',
    daily: game.daily, day: todayKey(), url: SHARE_URL,
  });
}
export function toTitle() {
  saveHi(); Snd.stopBGM(); Coop.reset();
  const hi = Math.max(game.hi, game.score);
  setGame(newGame()); game.hi = hi;
  initStars();
}
export function doContinue() {
  if (game.continues <= 0) return;
  game.continues--;
  Snd.continueJingle();
  startStage(game.stageIndex);
  game.lives = CFG.MAX_LIVES; game.bombs = 1;
}
export function togglePause() {
  if (game.state === 'play' || game.state === 'warn') {
    game.pausedFrom = game.state; game.state = 'pause'; Snd.stopBGM();
  } else if (game.state === 'pause') {
    game.state = game.pausedFrom; Snd.startBGM(stage(), game.stageIndex, game.bossActive ? 'boss' : 'stage');
  }
}
function retryRun() {
  if (game.coop && Coop.connected) { startCoop(); return; }
  const d = game.daily, e = game.endless || game.aiMode;
  if (d) startDaily(); else if (e) requestAIStage(); else startRun();
}
export function handleOverTap(x, y) {
  for (const btn of game.overBtns) {
    if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      if (btn.id === 'continue') doContinue();
      else if (btn.id === 'share') shareRun();
      else if (btn.id === 'retry') retryRun();
      else toTitle();
      return;
    }
  }
}

// === メイン更新(ロジックのみ・描画は render.js) ===
export function update(dt, keys) {
  switch (game.state) {
    case 'splash':
      game.titleAnim += dt;
      game.splashT -= dt * 1000;
      if (game.splashT <= 0) game.state = 'title';
      break;
    case 'title':
    case 'coop':
      game.titleAnim += dt;
      break;
    case 'intro':
      game.introT -= dt * 1000;
      updateBg(dt);
      if (game.introT <= 0) { game.state = 'play'; Snd.startBGM(stage(), game.stageIndex, 'stage'); }
      break;
    case 'play':
    case 'warn':
      updateStage(dt);
      updatePlayer(dt, keys);
      updateEnemies(dt);
      updateBoss(dt);
      updateBullets(dt);
      updateBg(dt);
      updateParticles(dt);
      updatePopups(dt);
      updateShake(dt);
      updateLightning(dt);
      Director.update(dt, game);
      checkCollisions();
      if (game.coop) {
        Coop.update(dt);
        Coop.sendPos(game.player.x / W, game.player.y / H, !game.player.dead, game.score, !game.player.dead);
      }
      // BGM緊張度: ボス=最高潮 / コンボ・残機ピンチで高まる
      Snd.setIntensity(game.bossActive ? 0.92 : 0.32 + Math.min(0.34, game.combo * 0.03) + (game.lives <= 1 ? 0.22 : 0));
      break;
    case 'finale': {
      const F = game.finale;
      F.t += dt * 1000;
      if (Math.random() < dt * 9) explosion(F.bx + rand(-80, 80), F.by + rand(-80, 80), 8, pick(['#ffd700', '#ff8a3c', '#ff2a2a', '#8fd3ff']));
      updateParticles(dt); updateShake(dt);
      if (game.skinFlash > 0) game.skinFlash -= dt;
      if (!F.snd && F.t > (F.kind === 'victory' || F.kind === 'coop' ? 700 : 450)) { F.snd = true; (F.kind === 'victory' || F.kind === 'coop' ? Snd.victory() : Snd.clear()); }
      if (F.t >= F.dur) {
        if (F.kind === 'victory' || F.kind === 'coop') game.state = 'victory';
        else if (F.kind === 'world') { if (game.pendingStage) startEndlessNext(); }
        else startStage(game.stageIndex + 1);
      }
      break;
    }
    case 'clear':
      game.clearT -= dt * 1000;
      updateParticles(dt); updateBg(dt);
      if (game.clearT <= 0) startStage(game.stageIndex + 1);
      break;
    case 'over':
      game.overT += dt; updateParticles(dt);
      break;
    case 'victory':
      if (Math.random() < 0.35) particles(rand(0, W), rand(0, H * 0.5), 5, pick(['#ffd700', '#ff66aa', '#66ffcc', '#8fd3ff']));
      updateParticles(dt);
      break;
    case 'pause':
      break;
  }
}
