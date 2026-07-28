// ============================================================
// engine.js — ゲームロジック(更新・生成・当たり判定・状態遷移)
// ============================================================
import { CFG, BELLS, BOSS_PHASES, BOSS_STYLES, STYLE_KEYS, STAGES, PATTERNS, MOVE_BY_EMOJI, rand, randInt, pick, dist, clamp, lerp, makeRng, hashStr, todayKey } from './config.js';
import { W, H } from './env.js';
import { game, newGame, setGame } from './state.js';
import { stage, dirDef, fwAngle, inAngle, isVert, latSpan, fwSpan, posFromPL, invPL, latOf, playerHome } from './geo.js';
import { Snd } from './audio.js';
import { Weather } from './weather.js';
import { Director } from './director.js';
import { BossAI } from './bossai.js';
import { t, getLang } from './i18n.js';
import { generateStage, proceduralStage, scaleStage, chapterStages } from './aistage.js';
import { Save } from './save.js';
import { SHARE_URL } from './sharecard.js';
import { Leaderboard } from './leaderboard.js';
import { openShare } from './ui.js';
import { Coop } from './coop.js';

// ストレージ無効環境でも落ちないように
// 配列を複製してシャッフル(元データは壊さない)
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function trySetHi(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

const COOP_HP_MUL = 2.2; // 共闘ボスは二人がかり前提で硬くする

// === ふたりでプレイ: ホスト権威型の同期 ===
//   敵・弾・ベル・ボスは「ホストの計算結果だけ」を正とし、ゲストはそれを映す。
//   (各端末で別々に乱数・AI難易度調整・天気を回すと必ずズレるため)
//   自機と自分の弾は各端末でローカルに動かす → 操作は遅延ゼロのまま。
const isGuest = () => game.coop && Coop.role === 'guest' && Coop.connected;
const isHost = () => game.coop && Coop.role === 'host' && Coop.connected;
let nextEid = 1;

function buildSnap() {
  const b = game.boss;
  return {
    t: 'w',
    e: game.enemies.filter(e => e.delay <= 0).map(e => [e.id, Math.round(e.x), Math.round(e.y), e.ti, e.hp, e.maxHp]),
    b: game.eBullets.map(x => [Math.round(x.x), Math.round(x.y), Math.round(x.vx), Math.round(x.vy), x.size, x.boss ? 1 : 0]),
    l: game.bells.map(x => [Math.round(x.x), Math.round(x.y), x.idx, x.size]),
    s: b ? [Math.round(b.x), Math.round(b.y), Math.round(b.hp), b.entering ? 1 : 0, b.phase] : null,
    w: Math.round(game.warnT),
    lv: game.lives,
  };
}

// ゲスト: 受け取った状態を反映。
//   重要: 作り直すのは「新しく届いた時だけ」。毎フレーム同じ内容を貼り直すと
//   位置もHPも巻き戻り、敵と弾が凍りつき、自分で与えたダメージも即座に消える。
let lastSnapAt = -1;
function rebuildFromSnap(s) {
  const st = stage();
  const prev = new Map(game.enemies.map(e => [e.id, e]));
  game.enemies = s.e.map(([id, x, y, ti, hp, maxHp]) => {
    const o = prev.get(id);
    if (o) { o.tx = x; o.ty = y; o.hp = hp; return o; }   // 目標位置だけ更新(実座標は補間)
    const type = st.enemies[ti] || st.enemies[0];
    return { id, x, y, tx: x, ty: y, ti, hp, maxHp, size: type.size, emoji: type.emoji, delay: 0, flash: 0 };
  });
  game.eBullets = s.b.map(([x, y, vx, vy, size, boss]) => ({
    x, y, vx, vy, size, boss: !!boss,
    col: boss && game.boss ? game.boss.col : null, shape: boss && game.boss ? game.boss.shape : null,
  }));
  game.bells = s.l.map(([x, y, idx, size]) => ({ x, y, idx, size, phase: 0, prog: 0, lat: 0, hits: 0 }));
  game.warnT = s.w;
  if (typeof s.lv === 'number') game.lives = s.lv;        // 残機はチーム共有(ホストが管理)
  if (s.s) {
    if (!game.boss) spawnBoss();
    const b = game.boss;
    b.tx = s.s[0]; b.ty = s.s[1]; b.hp = s.s[2]; b.entering = !!s.s[3]; b.phase = s.s[4];
    Coop.bossShared = b.hp;                     // 貢献表示用に同期
    if (b.hp <= 0) bossDefeated();              // ホストが倒した → 撃破演出へ
  } else if (game.boss && !game.finale) { bossDefeated(); }
}
function applySnap(dt) {
  const s = Coop.snap;
  if (!s) return;
  if (Coop.snapAt !== lastSnapAt) { lastSnapAt = Coop.snapAt; rebuildFromSnap(s); }
  // 受信の合間は自分で動かす(15Hzでも滑らかに見せるため)
  const k = Math.min(1, dt * 14);
  for (const e of game.enemies) {
    if (e.tx !== undefined) { e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; }
    if (e.flash > 0) e.flash -= dt * 8;
  }
  for (const b of game.eBullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  const b = game.boss;
  if (b && b.tx !== undefined) {
    b.x += (b.tx - b.x) * Math.min(1, dt * 12); b.y += (b.ty - b.y) * Math.min(1, dt * 12);
    if (b.flash > 0) b.flash -= dt * 6;
  }
}

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
  // === 集中モード ===
  //   その場に踏みとどまると火力が上がる。動き回れば安全だが火力は落ちる。
  //   指1本のまま「攻めるか避けるか」の判断が生まれる(撃つボタンは不要)。
  const px0 = p.x, py0 = p.y;
  const spd = CFG.PLAYER_SPEED * (p.boost ? 1.5 : 1) * Save.char().speed * (p.focus ? 0.55 : 1) * dt;
  p.x = clamp(p.x + dx * spd, 22, W - 22);
  p.y = clamp(p.y + dy * spd, 40, H - 22);
  const moved = Math.hypot(p.x - px0, p.y - py0) / Math.max(dt, 0.001);
  if (moved < 26) p.stillT = (p.stillT || 0) + dt * 1000; else p.stillT = 0;
  p.focus = p.stillT > 320;
  // 初回だけヒントを出す(以後は出さない)
  // 冒頭の操作説明が消えてから出す(重なって両方読めなくなるため)
  if (p.focus && !Save.data.sawFocus && game.stageTime > 6000) { game.focusHintT = 2600; Save.data.sawFocus = 1; Save.persist(); }
  if (game.focusHintT > 0) game.focusHintT -= dt * 1000;
  p.focusAnim = lerp(p.focusAnim || 0, p.focus ? 1 : 0, Math.min(1, dt * 9));
  p.trail.unshift({ x: p.x, y: p.y });
  if (p.trail.length > 40) p.trail.pop();
  if (p.inv) { p.invT -= dt * 1000; if (p.invT <= 0) p.inv = false; }
  if (p.boost) { p.boostT -= dt * 1000; if (p.boostT <= 0) p.boost = false; }
  p.fireT -= dt * 1000;
  if (p.fireT <= 0) { fire(); p.fireT = (p.power >= 3 ? 105 : 130) * Save.char().fire * (p.focus ? 0.55 : 1); }
  if (p.muzzle > 0) p.muzzle -= dt * 11;
  p.anim += dt * 10;
}

function fire() {
  const p = game.player, a = fwAngle();
  const fx = Math.cos(a), fy = Math.sin(a);
  const px = -fy, py = fx;
  p.muzzle = 1;
  Snd.shoot();
  const ch = Save.char();
  const mk = (ox, spread = 0) => {
    game.pBullets.push({
      x: p.x + fx * 20 + px * ox, y: p.y + fy * 20 + py * ox,
      vx: fx * CFG.BULLET_SPEED + px * spread, vy: fy * CFG.BULLET_SPEED + py * spread,
      size: ch.size, emoji: ch.shotEmoji, col: ch.shot, pierce: ch.pierce, slow: ch.slow,
    });
    game.stats.shots++;
  };
  if (p.power === 1) mk(0);
  else if (p.power === 2) { mk(-9); mk(9); }
  else { mk(0); mk(-13, -45); mk(13, 45); }
  // キャラ特性: 横に広い(ピザ)
  if (ch.spread) { mk(-20, -95); mk(20, 95); }
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
  game.stats.deathTimes.push(performance.now());
  p.dead = true;
  p.power = Math.max(1, p.power - 1);
  p.options = Math.max(0, p.options - 1);
  game.combo = 0; game.comboMul = 1;
  // 死んだ瞬間に「倒れた」ことを即送る(相方の画面に幽霊機が残らないように)
  if (game.coop) Coop.sendPos(p.x / W, p.y / H, false, game.score, false, true);
  // 共闘は残機をチームで共有する。ゲストはホストに申告し、復活可否はホストの残機に従う。
  if (isGuest()) {
    Coop.send({ t: 'died' });
    setTimeout(() => { if ((game.state === 'play' || game.state === 'warn') && game.lives > 0) resetPlayer(); }, 500);
    return;
  }
  game.lives--;
  if (game.coop && game.lives <= 0) Coop.send({ t: 'over' });
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
      id: nextEid++, ti: Math.max(0, st.enemies.indexOf(tt)),
      move: MOVE_BY_EMOJI[tt.emoji] || null, mvT: rand(400, 1400), mvS: 0,
      mph: rand(0, Math.PI * 2), blink: 0,
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

// 絵柄に応じた癖を、基本の動きの「上に」足す。
// step = このフレームで基本の動きが進めた量。止まる系はこれを打ち消して初めて「止まって見える」。
function applyPersonality(e, dt, step) {
  e.mvT -= dt * 1000;
  e.mph += dt;                                   // 癖専用の位相(基本の動きに依存しない)
  const lim = latSpan();
  switch (e.move) {
    case 'slither':                              // 蛇行(速く細かく)
      e.lat += Math.sin(e.mph * 4.2) * 150 * dt;
      break;
    case 'dive':                                 // 不規則に方向を変えて突っ込む
      if (e.mvT <= 0) { e.mvT = rand(280, 720); e.mvS = rand(-150, 150); }
      e.lat += e.mvS * dt; e.prog += 42 * dt;
      break;
    case 'glide':                                // 滑って止まってまた滑る
      if (e.mvT <= 0) { e.mvT = rand(500, 1000); e.mvS = e.mvS > 0 ? 0 : 1; }
      if (e.mvS) e.prog += 110 * dt;             // 滑走
      else { e.prog -= step * 0.92; e.lat += Math.sin(e.mph * 1.6) * 26 * dt; }  // ほぼ停止
      break;
    case 'blink':                                // ふっと消えて横に現れる
      if (e.mvT <= 0) { e.mvT = rand(900, 1900); e.lat = clamp(e.lat + rand(-130, 130), 30, lim - 30); e.blink = 0.35; }
      if (e.blink > 0) e.blink -= dt;
      break;
    case 'angular':                              // 直角に折れる
      if (e.mvT <= 0) { e.mvT = rand(600, 1200); e.mvS = e.mvS === 0 ? (Math.random() < 0.5 ? -1 : 1) : 0; }
      e.lat += e.mvS * 130 * dt;
      break;
    case 'hop': {                                // ぴょんぴょん跳ねながら来る
      const up = Math.max(0, Math.sin(e.mph * 3.6));
      e.prog += -step * 0.8 + up * 260 * dt;     // 着地中はほぼ止まり、跳ねる時だけ前へ
      e.lat += Math.cos(e.mph * 3.6) * up * 70 * dt;
      break;
    }
    case 'lurk':                                 // 溜めてから一気に喰らいつく
      if (e.mvT <= 0) { e.mvT = rand(1100, 2000); e.mvS = e.mvS > 0 ? 0 : 1; }
      if (e.mvS) { e.prog += 210 * dt; e.lat = lerp(e.lat, latOf(game.player), dt * 1.4); }
      else e.prog -= step * 0.88;                // 息をひそめる
      break;
  }
  e.lat = clamp(e.lat, -60, lim + 60);
}

function updateEnemies(dt) {
  const wMod = Weather.mods, span = fwSpan();
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    if (e.delay > 0) { e.delay -= dt * 1000; continue; }
    if (e.slowT > 0) e.slowT -= dt * 1000;               // 💩 で鈍っている間
    const spd = e.speed * wMod.enemySpeed * (e.slowT > 0 ? 0.45 : 1) * dt;
    const prog0 = e.prog;
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
    if (e.move) applyPersonality(e, dt, e.prog - prog0);
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
    prog: -80, targetProg: game.coop ? 195 : 150, lat: latSpan() / 2, latPhase: 0,
    hp, maxHp: hp, phase: 0,
    atkT: 900, atkIdx: 0, flash: 0, entering: true,
    charging: false, chargeTo: null, returning: false, x: -999, y: -999,
    style: styleKey, col: style.col, shape: style.shape,
    // 出現ごとに攻撃の並びを混ぜる → 同じボスでも毎回パターンが読めない
    phases: style.phases.map(ph => ({ attacks: shuffled(ph.attacks) })),
    ringAng: 0, spiralAng: 0,
    scale: game.coop ? 2.15 : 1,   // ふたりで挑む時は画面を圧するサイズに
  };
  // 共有ボスHPの管理はホストが正。ゲストは表示用の最大値だけ合わせる。
  if (game.coop) { if (isGuest()) Coop.bossSharedMax = hp; else Coop.initBoss(hp); }
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
      // 巨大ボスは振り幅を抑える(画面外にはみ出さないように)
      const amp = 0.3 / Math.max(1, (b.scale || 1) * 0.82);
      const oscLat = latSpan() / 2 + Math.sin(b.latPhase) * latSpan() * amp;
      if (b.returning) {
        b.prog = lerp(b.prog, b.targetProg, dt * 2.5); b.lat = lerp(b.lat, oscLat, dt * 2.5);
        if (Math.abs(b.prog - b.targetProg) < 4) b.returning = false;
      } else b.lat = oscLat;
      b.atkT -= dt * 1000;
      if (b.atkT <= 0 && !b.returning) {
        const ph = (b.phases || BOSS_PHASES)[b.phase];
        const atk = ph.attacks[b.atkIdx % ph.attacks.length];
        b.atkT = atk.interval * rand(0.78, 1.24); b.atkIdx++;   // 間隔をゆらして読ませない
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
  // 共闘のボスHPはホストが正。ゲストは与ダメを送るだけで、HPはスナップショットで受け取る。
  if (isGuest()) { Coop.dealLocal(dmg); return; }
  if (game.coop) { Coop.dealLocal(dmg); b.hp = Coop.bossShared; }
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
  // ストーリー(章モード)は制覇を記録。章を全制覇したら勝利演出 → 次章が開く。
  let chapterDone = false;
  const story = !game.aiMode && !game.coop && !game.daily && !game.endless;
  if (story) chapterDone = Save.markCleared(game.stageIndex, game.stages.length);
  let kind;
  if (game.coop) { kind = 'coop'; recordRunEnd({}); }
  else if (game.endless) { kind = 'world'; game.world++; game.pendingStage = scaleStage(proceduralStage(), game.world); }
  else if (game.daily) { kind = 'victory'; recordRunEnd({ daily: true }); }
  else if (story) { kind = chapterDone ? 'victory' : 'stage'; if (chapterDone) recordRunEnd({}); }
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
  game.bells.push({ prog: 60, lat: rand(50, latSpan() - 50), idx: 0, hits: 0, phase: rand(0, Math.PI * 2), size: 16, x: -999, y: -999, lockFlash: 0 });
}
// ベルは自機が近づくと色が固定される。
//   ツインビーは手動ショットなので「必要な回数だけ撃つ」ができたが、
//   こちらは自動連射なので狙った色を通り過ぎてしまう。近距離でロックすることで
//   「遠くで色を選び、近づいて取りに行く」という判断に変える。
export const BELL_LOCK_R = 118;
function bellLocked(bell) {
  const p = game.player;
  return !p.dead && dist(bell, p) < BELL_LOCK_R;
}
function hitBell(bell) {
  bell.prog -= 26;                     // 撃てば押し戻せるのはそのまま
  if (bellLocked(bell)) {              // ロック中は色を変えない
    bell.lockFlash = 1;
    Snd.bellLocked();                  // 当たってはいるが色は動かない、を音でも
    particles(bell.x, bell.y, 2, '#ffffff');
    return;
  }
  bell.hits++; bell.idx = (bell.idx + 1) % BELLS.length;
  Snd.bell(bell.idx);                  // 色が進むほど音が上がるので、目を離していても耳で追える
  particles(bell.x, bell.y, 3, BELLS[bell.idx].color);
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
    if (bl.lockFlash > 0) bl.lockFlash -= dt * 3;
    bl.lat += Math.sin(bl.phase) * 14 * dt + wind * 0.4 * dt;
    const pos = posFromPL(bl.prog, bl.lat); bl.x = pos.x; bl.y = pos.y;
    if (bl.prog > fwSpan() + 90) game.bells.splice(i, 1);
  }
}

// ゲスト: 自分の弾だけローカルで動かす(敵弾は applySnap 側で自走させる)
function updateGuestBullets(dt) {
  for (let i = game.pBullets.length - 1; i >= 0; i--) {
    const b = game.pBullets[i]; b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < -25 || b.x > W + 25 || b.y < -25 || b.y > H + 25) game.pBullets.splice(i, 1);
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
      if (dist(b, e) < e.size + b.size) {
        if (b.slow) e.slowT = 1400;                      // キャラ特性: ベタッと減速
        if (isGuest()) {          // ゲストの命中はホストへ通知(正はホスト側の計算)
          Coop.send({ t: 'hit', id: e.id, d: 1, sl: b.slow ? 1 : 0 });
          e.flash = 1; e.hp -= 1; particles(e.x, e.y, 3, '#ffffff');
          game.stats.hits++;
          if (e.hp <= 0) { game.enemies.splice(ei, 1); Snd.kill(); particles(e.x, e.y, 12, '#ffd700'); }
        } else damageEnemy(e, 1);
        if (!b.pierce) { game.pBullets.splice(bi, 1); used = true; }   // 貫通弾は消えない
        if (!isGuest() && e.hp <= 0) game.enemies.splice(ei, 1);
        if (!b.pierce) break;
      }
    }
    if (used) continue;
    if (game.boss && !game.boss.entering && dist(b, game.boss) < 42 * game.boss.scale + b.size) { damageBoss(1); if (!b.pierce) { game.pBullets.splice(bi, 1); } continue; }
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
  if (game.boss && !game.boss.entering && dist(game.boss, p) < hitR + 38 * game.boss.scale) { killPlayer(); return; }
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
  if (game.score > game.hi) { game.hi = game.score; trySetHi('edu_hiscore', String(game.hi)); }
}
function freshGame() { const hi = game.hi; setGame(newGame()); game.hi = hi; Director.reset(); Save.startRun(); }

export function startRun(from = 0) {
  Snd.init(); freshGame();
  game.stages = chapterStages(Save.chapter(), STAGES);   // 章ごとに6ステージ
  game.chapter = Save.chapter();
  startStage(clamp(from, 0, game.stages.length - 1));
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
// ホスト: 相方が当てた敵に実ダメージを与える(判定の正はホスト)
Coop.onPartnerHit = (id, d, sl) => {
  const e = game.enemies.find(x => x.id === id);
  if (e) { if (sl) e.slowT = 1400; damageEnemy(e, d); if (e.hp <= 0) game.enemies = game.enemies.filter(x => x !== e); }
};
// ホスト: 相方が被弾 → チーム共有の残機を減らす。尽きたら二人まとめて終了。
Coop.onPartnerDied = () => {
  if (!isHost() || game.state === 'over') return;
  game.lives--;
  if (game.lives <= 0) {
    Coop.send({ t: 'over' });
    recordRunEnd({});
    game.state = 'over'; game.overT = 0; saveHi(); Snd.stopBGM();
  }
};
// ゲスト: ホストから終了の合図
Coop.onGameOver = () => {
  if (game.state === 'over' || game.state === 'victory') return;
  recordRunEnd({});
  game.state = 'over'; game.overT = 0; saveHi(); Snd.stopBGM();
};

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
    case 'chars':
      game.titleAnim += dt;
      break;
    case 'intro':
      game.introT -= dt * 1000;
      updateBg(dt);
      if (game.introT <= 0) { game.state = 'play'; Snd.startBGM(stage(), game.stageIndex, 'stage'); }
      break;
    case 'play':
    case 'warn':
      if (isGuest()) {
        // ゲスト: 世界はホストの状態を映す。自機と自分の弾だけローカルに動かす。
        applySnap(dt);
        updatePlayer(dt, keys);
        updateGuestBullets(dt);
      } else {
        updateStage(dt);
        updatePlayer(dt, keys);
        updateEnemies(dt);
        updateBoss(dt);
        updateBullets(dt);
      }
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
        if (isHost()) Coop.sendSnap(buildSnap);   // ホストがワールドを配信
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
