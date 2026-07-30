// ============================================================
// engine.js — ゲームロジック(更新・生成・当たり判定・状態遷移)
// ============================================================
import { CFG, BELLS, MAX_LIFE_BELL, BOSS_PHASES, BOSS_STYLES, STYLE_KEYS, STAGES, PATTERNS, MOVE_BY_EMOJI, DIRS, rand, randInt, pick, dist, clamp, lerp, makeRng, hashStr, todayKey } from './config.js';
import { W, H, SAFE } from './env.js';
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
import { Diag } from './diag.js';
import { SUPERS, superKeyOf, SUPER_MAX, SUPER_GAIN, FUSION_WINDOW, fusionMul } from './super.js';
import { TETHER, updateTether, newTetherState, bossDamageMul } from './tether.js';

// ストレージ無効環境でも落ちないように
// 配列を複製してシャッフル(元データは壊さない)
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = randInt(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function trySetHi(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

// 共闘ボスの硬さ。**人数に比例させる。**
//   4人いれば毎秒の火力もほぼ4倍になる。前は「ひとり増えて1.11倍」にしていたが、
//   これだと4人で挑むとボスが2倍以上の速さで溶けて、手応えがまるで無くなっていた。
//   ひとりあたりの戦闘時間が人数によらず一定になるよう、素直に人数を掛ける。
//   2人 ×2.2 / 3人 ×3.3 / 4人 ×4.4。
const COOP_HP_MUL = 2.2;
const coopHpMul = n => COOP_HP_MUL * Math.max(2, n) / 2;
// 攻撃の激しさも人数で上げる。硬いだけのボスは「長い」だけで「強い」ではない。
//   4人だと弾の量が 1.45 倍になり、避ける仕事も人数ぶん増える。
const coopAtkMul = n => 1 + (Math.max(2, n) - 2) * 0.225;
// 残機はチームで共有する。ソロは1人で3機なので、人数で割ると共闘のほうが
//   ずっと厳しかった(2人で3機 = ひとり1.5機)。ひとり2機ぶん + 1 を配る。
//   2人=5 / 3人=7 / 4人=9。多すぎるように見えるが、共有で全員の事故が同じ財布から出る。
const coopLives = n => Math.max(2, n) * 2 + 1;
// 道中の湧きも人数で増やす。「2人でも1人と変わらない」と言われた原因のひとつは、
//   ボスだけ硬くして**道中がそのまま**だったこと。2人なら毎秒の火力は倍近いのに、
//   撃つ相手の数は同じ —— それは強くなったのではなく、待ち時間が半分になっただけ。
//   きずなで群れを薙げるようにしたぶんもここで受ける。2人 ×1.22 / 4人 ×1.66。
const coopSpawnMul = n => 1 + (Math.max(2, n) - 1) * 0.22;

// むずかしさ。Director の自動調整の「上」に掛ける固定倍率。
//   自動調整だけだと、子供に渡すときに明示的に弱くできない。
//   やさしい = 敵が遅く・少なく、残機が多く、こちらの弾が速い。
const DIFF = [
  { enemySpeed: 0.78, spawn: 1.35, lives: 5, bullet: 1.15, bossHp: 0.75 },  // やさしい
  { enemySpeed: 1,    spawn: 1,    lives: 3, bullet: 1,    bossHp: 1 },     // ふつう
  { enemySpeed: 1.18, spawn: 0.82, lives: 2, bullet: 0.95, bossHp: 1.3 },   // むずかしい
];
export const diffMods = () => DIFF[Save.diff()];

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
    // 敵の種類は「ステージの敵リストの番号」でしか送らない。分裂の分身は
    //   ボスの顔をした特別な敵で、その番号に載っていないので、印を1つ足す。
    //   これが無いとゲストの画面では分身が普通の雑魚に見え、一番の見せ場で
    //   全員が別のものを見ることになる。
    e: game.enemies.filter(e => e.delay <= 0).map(e => [e.id, Math.round(e.x), Math.round(e.y), e.ti, e.hp, e.maxHp, e.shard ? 1 : 0]),
    b: game.eBullets.map(x => [Math.round(x.x), Math.round(x.y), Math.round(x.vx), Math.round(x.vy), x.size, x.boss ? 1 : 0]),
    l: game.bells.map(x => [Math.round(x.x), Math.round(x.y), x.idx, x.size]),
    s: b ? [Math.round(b.x), Math.round(b.y), Math.round(b.hp), b.entering ? 1 : 0, b.phase,
            Math.round(b.maxHp), Math.round((b.scale || 1) * 100), b.dying > 0 ? 1 : 0, b.revived ? 1 : 0] : null,
    w: Math.round(game.warnT),
    lv: game.lives,
    // ステージの経過時間も配る。ホストが抜けて誰かが引き継いだとき、
    //   これが無いと引き継いだ側は 0 秒から数え直し、ボスがもう一度
    //   最初から来ることになる。数値ひとつで済むので常に載せる。
    st: Math.round(game.stageTime),
  };
}

// ゲスト: 受け取った状態を反映。
//   重要: 作り直すのは「新しく届いた時だけ」。毎フレーム同じ内容を貼り直すと
//   位置もHPも巻き戻り、敵と弾が凍りつき、自分で与えたダメージも即座に消える。
let lastSnapAt = -1;
function rebuildFromSnap(s) {
  const st = stage();
  const prev = new Map(game.enemies.map(e => [e.id, e]));
  game.enemies = s.e.map(([id, x, y, ti, hp, maxHp, shard]) => {
    const o = prev.get(id);
    if (o) { o.tx = x; o.ty = y; o.hp = hp; return o; }   // 目標位置だけ更新(実座標は補間)
    const type = st.enemies[ti] || st.enemies[0];
    // 分裂の分身はボスの顔・大きさで描く。敵リストの番号では表せない。
    if (shard) {
      return { id, x, y, tx: x, ty: y, ti, hp, maxHp, size: 30, emoji: st.boss.emoji, shard: true, delay: 0, flash: 0 };
    }
    return { id, x, y, tx: x, ty: y, ti, hp, maxHp, size: type.size, emoji: type.emoji, delay: 0, flash: 0 };
  });
  game.eBullets = s.b.map(([x, y, vx, vy, size, boss]) => ({
    x, y, vx, vy, size, boss: !!boss,
    col: boss && game.boss ? game.boss.col : null, shape: boss && game.boss ? game.boss.shape : null,
  }));
  game.bells = s.l.map(([x, y, idx, size]) => ({ x, y, idx, size, phase: 0, prog: 0, lat: 0, hits: 0 }));
  game.warnT = s.w;
  if (typeof s.lv === 'number') game.lives = s.lv;        // 残機はチーム共有(ホストが管理)
  if (typeof s.st === 'number') game.stageTime = s.st;    // 引き継ぎに備えて進行度も合わせる
  if (s.s) {
    if (!game.boss) spawnBoss();
    const b = game.boss;
    b.tx = s.s[0]; b.ty = s.s[1]; b.hp = s.s[2]; b.entering = !!s.s[3]; b.phase = s.s[4];
    if (s.s.length > 5) {
      b.maxHp = s.s[5] || b.maxHp;
      b.scale = (s.s[6] || 100) / 100;
      b.dying = s.s[7] ? 1 : 0;
      if (s.s[8] && !b.revived) { b.revived = true; b.col = '#ff3b5c'; game.bossRevealT = 2400; Snd.warning(); }
    }
    Coop.bossShared = b.hp;                     // 貢献表示用に同期
    // 撃破は 'bd' の受信だけで判定する。HP0=撃破にすると、復活ボスの
    // 「一度0になる」瞬間にゲストだけ先に終わってしまう。
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
  // 「画面のゆれ ひかえめ」では粒子も揺れも抑える(酔い・光過敏への配慮)
  const q = Save.shake() ? 1 : 0.35;
  particles(x, y, Math.round(size * 3 * q), color, 1.5);
  particles(x, y, Math.round(size * q), '#ffffff', 0.8);
  game.shake = Math.min(game.shake + size * 0.5 * q, CFG.MAX_SHAKE);
}

export function initStars() {
  game.stars = [];
  for (let l = 0; l < 3; l++)
    for (let i = 0; i < 36; i++)
      game.stars.push({ x: rand(0, W), y: rand(0, H), l, size: rand(1, 2.6) * (1 + l * 0.3), b: rand(0.3, 1) });
}

// === ゲーム内時間の待ち ===
// 「0.5秒後に復活」「0.9秒後にゲームオーバー」を setTimeout(実時間)で待つと、
//   ゲームの時計(dt)と別の時計で走ることになり、次の3つで壊れる。
//   1. タブが裏に回ると setTimeout は間引かれ、復活だけ取り残される
//   2. 画面を持たないサーバー上でゲームを進めると、実時間が来ないので永久に復活しない
//   3. 死んだ直後にタイトルへ戻って新しく始めると、前の run の復活が新しい run に発火する
//   dt で進む同じ時計に載せれば、3つとも消える。timers は game に持たせてあるので、
//   run を作り直した瞬間に古い待ちは自然に捨てられる。
function after(ms, fn) { (game.timers || (game.timers = [])).push({ t: ms, fn }); }

function updateTimers(dt) {
  const q = game.timers;
  if (!q || !q.length) return;
  const ms = dt * 1000;
  const due = [];
  const rest = [];
  for (const it of q) { it.t -= ms; (it.t <= 0 ? due : rest).push(it); }
  game.timers = rest;
  for (const it of due) it.fn();
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
  // 自機も「触れない縁」の内側に留める。ホームバーの上に乗ると指で隠れる。
  p.x = clamp(p.x + dx * spd, 22 + SAFE.left, W - 22 - SAFE.right);
  p.y = clamp(p.y + dy * spd, 40 + SAFE.top, H - 22 - SAFE.bottom);
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
  // ベル武装は時限式。取り続けないと維持できないので、強いまま居座らない。
  if (p.boomT > 0) p.boomT -= dt * 1000;
  if (p.swiftT > 0) p.swiftT -= dt * 1000;
  if (p.rearT > 0) p.rearT -= dt * 1000;
  if (p.sideT > 0) p.sideT -= dt * 1000;
  p.fireT -= dt * 1000;
  // 連射をおよそ半分に。画面が自分の弾で埋まると、狙う必要が無くなって手応えが消える。
  if (p.fireT <= 0) { fire(); p.fireT = (p.power >= 3 ? 235 : 300) * Save.char().fire * (p.focus ? 0.72 : 1); }
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
  const spd = CFG.BULLET_SPEED * (ch.bspeed || 1) * (p.swiftT > 0 ? 1.5 : 1) * diffMods().bullet;   // 重い物ほど遅く飛ぶ = 何を投げたか見える
  const boom = p.boomT > 0;
  // dx,dy = 飛ばす向き(単位ベクトル)。うしろ撃ち・よこ撃ちはここを差し替えるだけ。
  const mk = (ox, spread = 0, dx = fx, dy = fy, smul = 1, ssize = 1) => {
    const sx = -dy, sy = dx;
    game.pBullets.push({
      x: p.x + dx * 20 + sx * ox, y: p.y + dy * 20 + sy * ox,
      vx: dx * spd * smul + sx * spread, vy: dy * spd * smul + sy * spread,
      size: ch.size * ssize, emoji: boom ? '🪃' : ch.shotEmoji, col: boom ? '#ff9f1c' : ch.shot,
      pierce: boom ? 1 : ch.pierce, slow: ch.slow, dmg: ch.dmg || 1,
      // 折り返す時刻を少しずらす。揃っていると団子になって1個に見える。
      boom: boom ? 1 : 0, bt: boom ? rand(0, 0.1) : 0, spin: rand(0, 6.28),
      // キャラ固有の飛び方。ブーメラン中は飛び方を上書きしない(両立させると読めない)。
      traj: boom ? 'straight' : (ch.traj || 'straight'),
      bx: p.x + dx * 20 + sx * ox, by: p.y + dy * 20 + sy * ox, tt: 0,
      side: (p.shotSide = -(p.shotSide || -1)),   // 曲がる系は1発ごとに左右を入れ替える
      spMax: spd * smul * 2.0, beam: ch.traj === 'beam' ? 1 : 0, size0: ch.size * ssize,
    });
    game.stats.shots++;
  };
  if (p.power === 1) mk(0);
  else if (p.power === 2) { mk(-9); mk(9); }
  else { mk(0); mk(-13, -45); mk(13, 45); }
  // キャラ特性: 横に広い(ピザ)
  if (ch.spread) { mk(-20, -95); mk(20, 95); }
  // ベルで得た武装。撃つ方向が増えるので、囲まれても抜け道ができる。
  //   以前は密度を抑えるため1発おきにしていたが、連射自体を半分にしたので
  //   その間引きを残すと援護がほとんど出てこない。毎回撃たせる。
  //   主砲と見分けがつくよう、少し速く・少し小さいままにしておく。
  if (p.rearT > 0) mk(0, 0, -fx, -fy, 1.3, 0.8);
  if (p.sideT > 0) { mk(0, 0, px, py, 1.3, 0.8); mk(0, 0, -px, -py, 1.3, 0.8); }
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
    after(500, () => { if ((game.state === 'play' || game.state === 'warn') && game.lives > 0) resetPlayer(); });
    return;
  }
  game.lives--;
  if (game.coop && game.lives <= 0) Coop.send({ t: 'over' });
  if (game.lives <= 0) {
    after(900, () => {
      if (game.state !== 'play' && game.state !== 'warn') return;
      recordRunEnd({ daily: game.daily });
      Diag.runEnded(); markResumePoint(); game.state = 'over'; game.overT = 0; saveHi(); Snd.stopBGM();
    });
  } else {
    after(500, () => { if (game.state === 'play' || game.state === 'warn') resetPlayer(); });
  }
}

// === 必殺技 ===
//
// 操作はダブルタップのまま。溜まっていれば必殺技、溜まっていなければボム。
//   新しいジェスチャーを覚えさせずに、同じ指で結果が変わる。
export function superReady() { return game.superCharge >= SUPER_MAX; }

export function gainSuper(n) {
  if (game.superT > 0) return;        // 出ている間は溜めない(撃ちっぱなしを防ぐ)
  game.superCharge = Math.min(SUPER_MAX, game.superCharge + n);
}

/** ダブルタップの入口。溜まっていれば必殺技、無ければボム。 */
export function useBombOrSuper() {
  if (game.state !== 'play' || game.player.dead) return;
  if (superReady() && game.superT <= 0) { fireSuper(); return; }
  useBomb();
}

function fireSuper(fromPeer) {
  const key = superKeyOf(Save.char().id);
  const sup = SUPERS[key];
  game.superCharge = 0;
  game.superKind = key;
  game.superT = sup.dur;
  game.superAge = 0;
  game.superAt = performance.now();
  game.superPets = []; game.superFood = [];
  game.superShots = []; game.superChain = []; game.superOrbit = []; game.superSweep = null;

  // 合体。誰かの必殺技が出ている間に自分も撃つと、両方が育つ。
  //   ひとりでは絶対に起きないので、これが「2人でやる理由」になる。
  let fuse = 0;
  if (game.coop) {
    const now = performance.now();
    for (const p of Coop.peers.values()) {
      if (p.superAt && now - p.superAt < FUSION_WINDOW) fuse++;
    }
  }
  game.superFusion = fuse ? fuse + 1 : 0;
  if (game.superFusion >= 2) {
    game.superT = Math.round(sup.dur * 1.4);
    Snd.victory();
  } else {
    Snd.bomb();
  }
  if (!fromPeer && game.coop) Coop.send({ t: 'sup', k: key });

  if (sup.kind === 'pets') {
    const n = (sup.pets || 5) + game.superFusion * 2;
    for (let i = 0; i < n; i++) {
      game.superPets.push({ x: game.player.x, y: game.player.y, t: rand(0, 400), target: null });
    }
  }
  game.flash = 0.9; game.shake = CFG.MAX_SHAKE;
  particles(game.player.x, game.player.y, 40, sup.col, 3);
  // 名前は画面上部の大見出しで出す。ここで同じ言葉をもう一度出すと、
  //   自機のまわりが文字で埋まって弾が見えなくなる。
}

// 相方が必殺技を撃った。こちらの画面でも同じ技が見えないと、
//   合体しても「何が起きたか」が分からない。
Coop.onPeerSuper = (peerId, key) => {
  if (!game.coop || game.state !== 'play') return;
  const p = Coop.peers.get(peerId);
  if (p) p.superAt = performance.now();
  // 自分が出している最中なら、こちらも合体扱いに格上げする
  if (game.superT > 0) {
    game.superFusion = Math.max(2, game.superFusion + 1);
    game.superT = Math.max(game.superT, 900);
    game.flash = 1; game.shake = CFG.MAX_SHAKE;
    Snd.victory();
    popup(game.player.x, game.player.y - 66, getLang() === 'ja' ? '✨ 合体!' : '✨ FUSION!', '#ffd700');
  }
  void key;
};

function updateSuper(dt) {
  if (game.superT <= 0) return;
  const sup = SUPERS[game.superKind]; if (!sup) { game.superT = 0; return; }
  game.superT -= dt * 1000;
  game.superAge += dt * 1000;
  const mul = game.superFusion >= 2 ? fusionMul(game.superFusion) : 1;
  const dmg = sup.tick * mul * dt;
  const p = game.player;

  switch (sup.kind) {
    case 'lane': {
      // 射線の帯だけを薙ぐ。狙う必要があるから、当てたときの手応えが出る。
      const a = fwAngle(), wide = 54 * (1 + (mul - 1) * 0.5);
      for (const e of game.enemies) {
        if (e.delay > 0) continue;
        const rel = (e.x - p.x) * Math.cos(a) + (e.y - p.y) * Math.sin(a);
        const off = Math.abs(-(e.x - p.x) * Math.sin(a) + (e.y - p.y) * Math.cos(a));
        if (rel > -20 && off < wide) damageEnemy(e, dmg * 2);
      }
      game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
      const bb = game.boss;
      if (bb && !bb.entering) {
        const off = Math.abs(-(bb.x - p.x) * Math.sin(a) + (bb.y - p.y) * Math.cos(a));
        if (off < wide * 1.4) damageBoss(dmg * 2);
      }
      game.eBullets = game.eBullets.filter(b => {
        const off = Math.abs(-(b.x - p.x) * Math.sin(a) + (b.y - p.y) * Math.cos(a));
        const rel = (b.x - p.x) * Math.cos(a) + (b.y - p.y) * Math.sin(a);
        return !(rel > -10 && off < wide);
      });
      break;
    }
    case 'ring': {
      const r = (game.superAge / sup.dur) * Math.max(W, H) * 0.85 * (1 + (mul - 1) * 0.3);
      for (const e of game.enemies) {
        if (e.delay > 0) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < r) damageEnemy(e, dmg * (1.6 - Math.min(1, d / r)));
      }
      game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
      if (game.boss && !game.boss.entering &&
          Math.hypot(game.boss.x - p.x, game.boss.y - p.y) < r) damageBoss(dmg);
      game.eBullets = game.eBullets.filter(b => Math.hypot(b.x - p.x, b.y - p.y) > r * 0.85);
      if (sup.shake) game.shake = Math.max(game.shake, 6);
      break;
    }
    case 'freeze':
      // 敵を止め、弾を鈍らせる。避ける仕事が消えるのが爽快さの源。
      for (const e of game.enemies) { if (e.delay <= 0) e.slowT = Math.max(e.slowT || 0, 400); }
      for (const b of game.eBullets) { b.vx *= 0.90; b.vy *= 0.90; }
      hurtAll(dmg);
      break;
    case 'stink':
      for (const e of game.enemies) {
        if (e.delay > 0) continue;
        e.slowT = Math.max(e.slowT || 0, 500);
        e.prog -= 40 * dt;
      }
      hurtAll(dmg);
      break;
    case 'wall':
      // 攻めではなく守り。敵弾を消して、木が生えている間だけ安全になる。
      //   削りは弱いが、他の技より長い。役割そのものが違う。
      game.eBullets = game.eBullets.filter(b => {
        const inv = invPL(b.x, b.y);
        return inv.prog < fwSpan() * 0.66;
      });
      for (const e of game.enemies) { if (e.delay <= 0) e.prog -= 22 * dt; }
      hurtAll(dmg);
      break;
    case 'pets': updatePets(dt, dmg, sup); break;
    case 'rain': updateFalling(dt, dmg, mul, sup, 'down'); break;
    case 'harvest': updateFalling(dt, dmg, mul, sup, 'up'); break;
    case 'chain': updateChain(dt, dmg); break;
    case 'orbit': updateOrbit(dt, dmg, sup, mul); break;
    case 'sweep': updateSweep(dt, dmg, sup, mul); break;
    case 'missiles': updateMissiles(dt, dmg, mul); break;
    case 'bones': updateBones(dt, dmg, mul); break;
    case 'eggs': updateEggs(dt, dmg, mul); break;
    case 'wish':
      if (Math.random() < dt * 3) {
        const roll = randInt(0, 3);
        if (roll === 0) hurtAll(sup.tick * mul * 0.5);
        else if (roll === 1) game.eBullets = [];
        else if (roll === 2) { for (const e of game.enemies) e.slowT = 600; }
        else if (game.boss && !game.boss.entering) damageBoss(sup.tick * mul * 0.4);
      }
      hurtAll(dmg * 0.4);
      break;
  }

  if (game.superT <= 0) {
    game.superKind = null; game.superFusion = 0;
    game.superPets = []; game.superFood = [];
    game.superShots = []; game.superChain = []; game.superOrbit = []; game.superSweep = null;
  }
}

/** 画面上の敵とボスをまとめて削る。 */
function hurtAll(dmg) {
  for (const e of game.enemies) { if (e.delay <= 0) damageEnemy(e, dmg); }
  game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
  if (game.boss && !game.boss.entering) damageBoss(dmg * 0.6);
}

/** 追尾する仲間(ネコ)。 */
function updatePets(dt, dmg, sup) {
  const sp = sup.petSpeed || 340;
  for (const pet of game.superPets) {
    pet.t += dt * 1000;
    if (!pet.target || !game.enemies.includes(pet.target)) pet.target = nearestEnemy(pet.x, pet.y, 9999);
    const tgt = pet.target || game.boss;
    if (tgt) {
      const a = Math.atan2(tgt.y - pet.y, tgt.x - pet.x);
      pet.x += Math.cos(a) * sp * dt; pet.y += Math.sin(a) * sp * dt;
      if (Math.hypot(tgt.x - pet.x, tgt.y - pet.y) < 26) {
        if (pet.target) { damageEnemy(pet.target, dmg * 3); particles(pet.x, pet.y, 4, '#ffcf6b'); }
        else damageBoss(dmg);
      }
    } else pet.y -= 200 * dt;
  }
  game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
}

/**
 * 降ってくる/生えてくる物。
 * ごちそうは上から降り、しゅうかくは下から突き上げる。
 * 同じ仕組みでも向きが逆なので、避け方も当たり方もまるで違う。
 */
function updateFalling(dt, dmg, mul, sup, dir) {
  const items = sup.items || ['🍕'];
  if (Math.random() < dt * (30 * mul)) {
    const up = dir === 'up';
    game.superFood.push({
      x: rand(20, W - 20), y: up ? H + 20 : -20,
      vy: (up ? -1 : 1) * rand(220, 380), e: pick(items), s: rand(16, 26),
    });
  }
  for (const f of game.superFood) {
    f.y += f.vy * dt;
    for (const e of game.enemies) {
      if (e.delay > 0) continue;
      if (Math.hypot(e.x - f.x, e.y - f.y) < f.s + e.size) {
        damageEnemy(e, dmg * 4);
        game.score += 40;
        particles(f.x, f.y, 5, sup.col);
        f.y = dir === 'up' ? -99 : H + 99;
      }
    }
  }
  game.superFood = game.superFood.filter(f => f.y > -40 && f.y < H + 40);
  game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
}

/**
 * 連鎖する雷。一番近い敵から次の敵へ飛び移る。
 * 敵が固まっているほど強いので、**どこで撃つか**が効く。
 */
function updateChain(dt, dmg) {
  game.superChain = game.superChain || [];
  if (game.superAge % 1 < 1) { /* 毎フレーム張り直す */ }
  const alive = game.enemies.filter(e => e.delay <= 0);
  const links = [];
  let from = { x: game.player.x, y: game.player.y };
  const used = new Set();
  for (let i = 0; i < 6; i++) {
    let best = null, bd = 240 * 240;
    for (const e of alive) {
      if (used.has(e)) continue;
      const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) break;
    used.add(best);
    links.push({ ax: from.x, ay: from.y, bx: best.x, by: best.y });
    damageEnemy(best, dmg * 2.4);
    from = best;
  }
  game.superChain = links;
  game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
  if (game.boss && !game.boss.entering &&
      Math.hypot(game.boss.x - game.player.x, game.boss.y - game.player.y) < 260) damageBoss(dmg);
}

/**
 * 自機の周りを回る腕。近づいた敵を刻む。
 * 「離れて撃つ」他の技と逆で、**踏み込まないと当たらない**。
 */
function updateOrbit(dt, dmg, sup, mul) {
  const arms = (sup.arms || 3) + (mul > 1 ? 2 : 0);
  const r = 86 * (1 + (mul - 1) * 0.35);
  const ang = game.superAge * 0.006;
  game.superOrbit = [];
  for (let i = 0; i < arms; i++) {
    const a = ang + (i / arms) * Math.PI * 2;
    const ox = game.player.x + Math.cos(a) * r, oy = game.player.y + Math.sin(a) * r;
    game.superOrbit.push({ x: ox, y: oy });
    for (const e of game.enemies) {
      if (e.delay > 0) continue;
      if (Math.hypot(e.x - ox, e.y - oy) < 26 + e.size) damageEnemy(e, dmg * 2.2);
    }
    if (game.boss && !game.boss.entering && Math.hypot(game.boss.x - ox, game.boss.y - oy) < 60) damageBoss(dmg * 0.8);
  }
  game.eBullets = game.eBullets.filter(b =>
    !game.superOrbit.some(o => Math.hypot(b.x - o.x, b.y - o.y) < 24));
  game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
}

/**
 * 画面を横切る帯。虹は横から、ミルクは自機の後ろから前へ。
 * 通り過ぎた場所は安全になるので、**通過を待つ**という遊びが生まれる。
 */
function updateSweep(dt, dmg, sup, mul) {
  const prog = game.superAge / sup.dur;
  const thick = 120 * (1 + (mul - 1) * 0.4);
  const side = sup.from === 'side';
  const pos = side ? prog * (W + thick) - thick / 2 : prog * (H + thick) - thick / 2;
  game.superSweep = { side, pos, thick };
  for (const e of game.enemies) {
    if (e.delay > 0) continue;
    const v = side ? e.x : e.y;
    if (Math.abs(v - pos) < thick / 2) damageEnemy(e, dmg * 3);
  }
  game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
  game.eBullets = game.eBullets.filter(b => Math.abs((side ? b.x : b.y) - pos) > thick / 2);
  if (game.boss && !game.boss.entering) {
    const v = side ? game.boss.x : game.boss.y;
    if (Math.abs(v - pos) < thick) damageBoss(dmg);
  }
}

/** 追尾するミサイル。次々に飛び出して、一番近い敵へ曲がる。 */
function updateMissiles(dt, dmg, mul) {
  game.superShots = game.superShots || [];
  if (Math.random() < dt * (14 * mul)) {
    const a = fwAngle() + rand(-0.7, 0.7);
    game.superShots.push({ x: game.player.x, y: game.player.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, t: 0, e: '🚀' });
  }
  for (const m of game.superShots) {
    m.t += dt;
    const tgt = nearestEnemy(m.x, m.y, 9999) || game.boss;
    if (tgt) {
      const want = Math.atan2(tgt.y - m.y, tgt.x - m.x);
      const cur = Math.atan2(m.vy, m.vx);
      let d = want - cur;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const na = cur + Math.max(-3.4 * dt, Math.min(3.4 * dt, d));
      const sp = 430;
      m.vx = Math.cos(na) * sp; m.vy = Math.sin(na) * sp;
    }
    m.x += m.vx * dt; m.y += m.vy * dt;
    for (const e of game.enemies) {
      if (e.delay > 0) continue;
      if (Math.hypot(e.x - m.x, e.y - m.y) < 20 + e.size) {
        damageEnemy(e, dmg * 5); explosion(m.x, m.y, 6, '#ff8a5c'); m.t = 99;
      }
    }
    if (game.boss && !game.boss.entering && Math.hypot(game.boss.x - m.x, game.boss.y - m.y) < 54) {
      damageBoss(dmg * 2); explosion(m.x, m.y, 6, '#ff8a5c'); m.t = 99;
    }
  }
  game.superShots = game.superShots.filter(m => m.t < 3 && m.x > -40 && m.x < W + 40 && m.y > -40 && m.y < H + 40);
  game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
}

/** 跳ね回る骨。**寿命がある**ので画面が埋まらない(通常弾の跳ね返りで起きた失敗)。 */
function updateBones(dt, dmg, mul) {
  game.superShots = game.superShots || [];
  if (Math.random() < dt * (16 * mul)) {
    const a = rand(0, Math.PI * 2);
    game.superShots.push({ x: game.player.x, y: game.player.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, t: 0, e: '🦴', spin: rand(0, 6) });
  }
  for (const m of game.superShots) {
    m.t += dt; m.spin += dt * 9;
    m.x += m.vx * dt; m.y += m.vy * dt;
    if ((m.x < 14 && m.vx < 0) || (m.x > W - 14 && m.vx > 0)) m.vx = -m.vx;
    if ((m.y < 14 && m.vy < 0) || (m.y > H - 14 && m.vy > 0)) m.vy = -m.vy;
    for (const e of game.enemies) {
      if (e.delay > 0) continue;
      if (Math.hypot(e.x - m.x, e.y - m.y) < 18 + e.size) { damageEnemy(e, dmg * 2.4); particles(m.x, m.y, 3, '#e8ddc0'); }
    }
    if (game.boss && !game.boss.entering && Math.hypot(game.boss.x - m.x, game.boss.y - m.y) < 54) damageBoss(dmg * 0.5);
  }
  // 2.2秒で消える。跳ね返りに寿命を付けないと、骨だらけで避ける必要がなくなる。
  game.superShots = game.superShots.filter(m => m.t < 2.2);
  game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
}

/** 落ちて割れて分裂する卵。着弾点で小さく散る。 */
function updateEggs(dt, dmg, mul) {
  game.superShots = game.superShots || [];
  if (Math.random() < dt * (11 * mul)) {
    game.superShots.push({ x: rand(30, W - 30), y: -20, vx: 0, vy: rand(240, 340), t: 0, e: '🥚', frag: 0 });
  }
  const born = [];
  for (const m of game.superShots) {
    m.t += dt;
    m.x += m.vx * dt; m.y += m.vy * dt;
    let hit = false;
    for (const e of game.enemies) {
      if (e.delay > 0) continue;
      if (Math.hypot(e.x - m.x, e.y - m.y) < 18 + e.size) { damageEnemy(e, dmg * 3); hit = true; }
    }
    // 当たったか、下まで落ちたら割れて散る(1回だけ)
    if ((hit || m.y > H * 0.72) && !m.frag) {
      m.frag = 1; m.t = 99;
      explosion(m.x, m.y, 8, '#ffe9a8');
      for (const k of [-0.8, -0.3, 0.3, 0.8]) {
        born.push({ x: m.x, y: m.y, vx: Math.sin(k) * 300, vy: -Math.cos(k) * 300, t: 0, e: '🐣', frag: 1 });
      }
    }
  }
  game.superShots.push(...born);
  game.superShots = game.superShots.filter(m => m.t < 1.6 && m.y > -40 && m.y < H + 40);
  game.enemies = game.enemies.filter(e => e.hp > 0 || e.delay > 0);
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
  // 隊列は「1体ずつ」ではなく「かたまり」として動くので、共有の台帳を1つ作る。
  //   端に着いたか・何体残っているか・次に誰が突っ込むかは全員で1つの答えを持つ。
  const squad = list.some(it => it.march) ? newSquad(list.length) : null;
  for (const it of list) {
    const tt = it.t;
    const lat = clamp(it.lat, 42, latSpan() - 42);
    const m = it.march;
    game.enemies.push({
      id: nextEid++, ti: Math.max(0, st.enemies.indexOf(tt)),
      move: m ? null : (MOVE_BY_EMOJI[tt.emoji] || null),   // 隊列は癖より隊列が優先
      mvT: rand(400, 1400), mvS: 0,
      mph: rand(0, Math.PI * 2), blink: 0,
      type: m ? 'march' : tt.type, emoji: tt.emoji,
      hp: tt.hp, maxHp: tt.hp, speed: tt.speed, pts: tt.pts, size: tt.size,
      amp: tt.amp || 60, freq: tt.freq || 2,
      // 隊列は元の型が撃たない相手でも撃つ。並んで迫るだけでは圧が足りない。
      shootRate: m ? Math.max(0.16, tt.shootRate || 0) : (tt.shootRate || 0),
      prog: 0, lat0: lat, lat, phase: rand(0, Math.PI * 2),
      shootT: rand(600, 1800), delay: it.delay, flash: 0,
      locked: false, lockLat: 0, x: -999, y: -999,
      sq: squad, progOff: m ? (m.rows - 1 - m.row) * 54 : 0, diving: false,
    });
  }
  game.waveIdx++;
}

// === 隊列(インベーダー) ===
const MARCH_STEP = 34;          // 端で折り返すときに一段進む量
const MARCH_BASE = 46;          // 横に行進する速さ(px/秒)
const MARCH_ACCEL = 2.4;        // 全滅間際で何倍まで速くなるか

function newSquad(total) {
  return {
    total, latOff: 0, prog: 0, dir: Math.random() < 0.5 ? 1 : -1,
    // 最初の1体が飛び出すまでの間。すぐには来ない方が、来たときに驚く。
    diveT: rand(3200, 5200),
  };
}

function updateSquads(dt) {
  const seen = new Set();
  for (const e of game.enemies) {
    const sq = e.sq;
    if (!sq || seen.has(sq)) continue;
    seen.add(sq);
    const members = game.enemies.filter(x => x.sq === sq && !x.diving && x.delay <= 0);
    if (!members.length) continue;

    // 減るほど速くなる。倒すほど楽になるのではなく、**追い詰められる**のが元ネタの怖さ。
    const left = members.length / sq.total;
    const spd = MARCH_BASE * (1 + (1 - left) * (MARCH_ACCEL - 1))
      * Weather.mods.enemySpeed * diffMods().enemySpeed;

    sq.latOff += sq.dir * spd * dt;
    // 端に着いたか。かたまりの端で見るので、外側の1体が欠けると折り返し幅が広がる。
    let lo = Infinity, hi = -Infinity;
    for (const m of members) { const l = m.lat0 + sq.latOff; if (l < lo) lo = l; if (l > hi) hi = l; }
    const span = latSpan();
    if ((sq.dir > 0 && hi > span - 46) || (sq.dir < 0 && lo < 46)) {
      sq.dir *= -1;
      sq.prog += MARCH_STEP;   // 折り返すたびに一段こちらへ
    }

    // ときどき1体が隊列を離れて突っ込む。予告はしない。
    sq.diveT -= dt * 1000;
    if (sq.diveT <= 0) {
      sq.diveT = rand(2600, 4600) * (0.5 + left * 0.5);   // 残りが減るほど頻繁に
      const d = members[randInt(0, members.length - 1)];
      if (d) {
        d.diving = true; d.locked = false;
        d.flash = 0.6;
        Snd.warning();
      }
    }
  }
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
  updateSquads(dt);   // 隊列は「かたまり」として先に動かす(個々はその結果を読む)
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    if (e.delay > 0) { e.delay -= dt * 1000; continue; }
    if (e.slowT > 0) e.slowT -= dt * 1000;               // 💩 で鈍っている間
    const spd = e.speed * wMod.enemySpeed * diffMods().enemySpeed * (e.slowT > 0 ? 0.45 : 1) * dt;
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
      case 'march':
        if (e.diving) {
          // 隊列を離れた1体。狙いを定めて一気に来る。カミカゼより速い。
          if (!e.locked) { e.locked = true; e.lockLat = latOf(game.player); }
          e.prog += spd * 3.4;
          e.lat = lerp(e.lat, e.lockLat, dt * 2.6);
        } else if (e.sq) {
          // 隊列の中。位置は自分では決めず、かたまりの台帳から取る。
          e.prog = e.sq.prog + e.progOff;
          e.lat = e.lat0 + e.sq.latOff;
        }
        // 隊列も撃つ。狙い撃ちではなく、まっすぐ落とす(避ける余地を残す)。
        e.shootT -= dt * 1000;
        if (e.shootT <= 0 && e.prog > 40) {
          e.shootT = 1000 / (e.shootRate * Director.shootMul);
          const a = e.diving
            ? Math.atan2(game.player.y - e.y, game.player.x - e.x)
            : fwAngle();
          const bs = CFG.EBULLET_SPEED * Director.ebSpeedMul * 0.85;
          game.eBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * bs, vy: Math.sin(a) * bs, size: 5 });
        }
        break;
    }
    if (e.move) applyPersonality(e, dt, e.prog - prog0);
    // 🥖 の匂いに釣られる。まとめて集められるが、そのぶん敵はこちらへ近づいてくる。
    for (const pb of game.pBullets) {
      if (pb.traj !== 'lure') continue;
      const dx = pb.x - e.x, dy = pb.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 > 150 * 150 || d2 < 1) continue;
      const d = Math.sqrt(d2), pull = (1 - d / 150) * 120 * dt;
      const inv = invPL(e.x + dx / d * pull, e.y + dy / d * pull);
      e.prog = inv.prog; e.lat = inv.lat;
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
  gainSuper(SUPER_GAIN.kill);   // 必殺技は「倒した数」で溜まる。被弾では溜めない
  if (game.stats.killTimes.length > 200) game.stats.killTimes.shift();
  const pts = Math.round(e.pts * game.comboMul * Weather.mods.scoreMul);
  game.score += pts;
  if (!silent) Snd.kill();
  explosion(e.x, e.y, 5, stage().sky[1]);
  popup(e.x, e.y - 18, '+' + pts, game.comboMul > 1 ? '#ff8844' : '#ffdd44');
  // 硬い敵(撃ってくる奴・戦車)を倒すとベルに変わる
  if (!isGuest() && (e.maxHp || 1) >= BELL_DROP_HP
      && game.stageTime - (game.lastBellDrop || -9999) > BELL_DROP_COOLDOWN
      && Math.random() < BELL_DROP_CHANCE) {
    game.lastBellDrop = game.stageTime;
    spawnBellAt(e.x, e.y);
    popup(e.x, e.y - 40, '🔔', '#ffd700');
  }
}

// === ボス ===
function spawnBoss() {
  const st = stage();
  const styleKey = (st.boss.style && BOSS_STYLES[st.boss.style]) ? st.boss.style : STYLE_KEYS[game.stageIndex % STYLE_KEYS.length];
  const style = BOSS_STYLES[styleKey];
  // 逃がしたボスは次の面で強くなって出る。失敗が次の形を変える。
  const grudge = 1 + Math.min(0.6, (game.bossGrudge || 0) * 0.2);
  const hp = Math.round(st.boss.hp * (game.coop ? coopHpMul(Coop.playerCount()) : 1) * diffMods().bossHp * grudge);
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
    // 「倒した」と思わせてから蘇る。1面だけで起きて2面3面で起きないと
    //   「たまたま」に見えて驚きにならないので、**全ボスが必ず一度は蘇る**。
    // 終盤に引ける札の数。人数が多いほど二段構えになる。
    stands: standCount(), stand: null, fleeing: 0,
    dying: 0, revived: false,
    // 突進の予備動作。蘇ってから使う。
    dashT: 0, dashing: 0, dashVx: 0, dashVy: 0,
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
  if (game.bossRevealT > 0) game.bossRevealT -= dt * 1000;
  // 蘇ったボスの奇襲。ふつうの左右移動の途中で、いきなり高速で突っ込んでくる。
  //   攻撃パターンを覚えても「読み切った」状態にさせないための一手。
  if (b.revived && !b.entering && b.dying <= 0) {
    if (b.dashing > 0) {
      b.dashing -= dt * 1000;
      b.x += b.dashVx * dt; b.y += b.dashVy * dt;
      const lim = latSpan();
      const inv = invPL(b.x, b.y);
      b.prog = clamp(inv.prog, 40, fwSpan() * 0.62);
      b.lat = clamp(inv.lat, 50, lim - 50);
      if (Math.random() < dt * 24) particles(b.x, b.y, 2, b.col);
      if (b.dashing <= 0) { b.returning = true; b.dashT = rand(3200, 5200); }
      const pos = posFromPL(b.prog, b.lat); b.x = pos.x; b.y = pos.y;
      return;
    }
    b.dashT -= dt * 1000;
    if (b.dashT <= 0) {
      // 自機の少し先を狙って突っ込む(完全な追尾にすると避けられない)
      const a = Math.atan2(game.player.y - b.y, game.player.x - b.x) + rand(-0.35, 0.35);
      const v = 900;
      b.dashVx = Math.cos(a) * v; b.dashVy = Math.sin(a) * v;
      b.dashing = 420; b.charging = false;
      game.shake = Math.min(game.shake + 6, CFG.MAX_SHAKE);
      Snd.zap();
    }
  }
  // 逃走中。背を向けて奥へ下がりながら弾を撒く。
  //   追い詰めたはずが逃げるので、「あと少し」が「間に合うか」に変わる。
  //   逃がしても終わりではなく、次のステージのボスが恨みを抱えて出てくる。
  if (b.fleeing > 0 && b.dying <= 0) {
    b.fleeing -= dt * 1000;
    b.prog -= 150 * dt;
    b.lat += Math.sin(b.fleeing * 0.004) * 90 * dt;
    const pos = posFromPL(b.prog, b.lat); b.x = pos.x; b.y = pos.y;
    if (Math.random() < dt * 10) particles(b.x, b.y, 2, '#4ad6a0');
    if (b.fleeing <= 0 || b.prog < -70) { bossEscaped(); return; }
  }
  if (b.dying > 0) {                       // 倒したと思わせている最中
    b.dying -= dt * 1000;
    b.flash = 1;
    if (Math.random() < dt * 14) explosion(b.x + rand(-60, 60), b.y + rand(-60, 60), 6, '#ffd700');
    if (b.dying <= 0) runLastStand();
    return;
  }
  if (b.entering) {
    b.prog = lerp(b.prog, b.targetProg, dt * 2);
    if (Math.abs(b.prog - b.targetProg) < 3) { b.entering = false; b.prog = b.targetProg; }
  } else {
    // 共闘: 相方の与ダメを反映(相方が削り切れば撃破)
    if (game.coop) { b.hp = Coop.bossShared; if (b.hp <= 0) { bossDepleted(); return; } }
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
        // 人数が多いほど攻撃の間隔が詰まる。硬くするだけでは「長い」だけで「強い」にならない。
        b.atkT = atk.interval * rand(0.78, 1.24) / (game.coop ? coopAtkMul(Coop.playerCount()) : 1);
        b.atkIdx++;   // 間隔をゆらして読ませない
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
  // きずながボスにかかっているあいだは弾がよく通る。線そのものはボスを削らない
  //   —— 削れるようにすると、離れて放っておくだけで勝ててしまう。
  //   「ふたりで挟んで、そのあいだに撃ちこむ」形にだけ褒美を出す。
  dmg *= bossDamageMul(game.tether);
  gainSuper(SUPER_GAIN.bossHit * dmg);
  const b = game.boss;
  if (!b || b.entering) return;
  b.flash = 1; game.stats.hits++; Snd.bossHit();
  game.shake = Math.min(game.shake + 1.5, CFG.MAX_SHAKE);
  // 共闘のボスHPはホストが正。ゲストは与ダメを送るだけで、HPはスナップショットで受け取る。
  if (isGuest()) { Coop.dealLocal(dmg); return; }
  if (game.coop) { Coop.dealLocal(dmg); b.hp = Coop.bossShared; }
  else b.hp -= dmg;
  if (b.hp <= 0) bossDepleted();
}

// === 終盤の抽選(ラストスタンド) ===
//
// 以前は「全ボスが必ず一度、同じ形で蘇る」だった。一度でも見れば
// 二度目からは驚きではなく手順になり、「どうせ蘇るんでしょ」で終わる。
// 直したのは演出ではなく**構造**で、HPが尽きた瞬間に何が起きるかを
// 毎回引き直す。「何も起きずに勝つ回」も札の1枚に入れてあるので、
// 蘇りを前提に構えることもできない。
//
//   revive … 蘇る(以前の唯一の答え。いまは5枚のうちの1枚)
//   split  … 分身が出る。全部が同時に襲ってくる
//   flee   … 逃げ出す。追いつけば即撃破、逃がすと次のボスが強い
//   greed  … 画面に残っているベルを吸い込んで強くなる
//   legacy … 何も起きない。ただし形見が残り、こちらが強くなる
//   turn   … 世界の進行方向そのものが変わる(このゲームにしか無い一手)
const LAST_STANDS = ['revive', 'split', 'flee', 'greed', 'legacy', 'turn'];

/**
 * 次に引く札を決める。
 * - 直前2回に出た札は引かない(3連続で同じにならない)
 * - greed は画面にベルが残っているときだけ。**盤面が札を決める**ので、
 *   同じステージでも毎回同じ抽選にならない
 */
function pickLastStand() {
  // 履歴は端末に残す。game に置くと遊び直すたびに空へ戻り、
  //   「前回と同じ札」が普通に出てしまう。飽きるのは繰り返した先なので、
  //   プレイを跨いで覚えていないと意味がない。
  const recent = Save.recentStands();
  let pool = LAST_STANDS.filter(k => !recent.includes(k));
  if (!game.bells.length) pool = pool.filter(k => k !== 'greed');
  if (!pool.length) pool = LAST_STANDS.filter(k => k !== 'greed' || game.bells.length);
  const k = pick(pool);
  Save.pushStand(k);
  return k;
}

/** このボスに何回ラストスタンドを持たせるか。人数が多いほど終盤が長い。 */
function standCount() {
  if (!game.coop) return 1;
  return Coop.playerCount() >= 3 ? 2 : 1;   // 3〜4人は終盤が二段構え
}

// HPが尽きた。まだ札が残っていれば「倒したと思わせる間」に入る。
function bossDepleted() {
  const b = game.boss;
  if (!b || b.dying > 0) return;
  if (b.stands > 0) {
    b.stands--;
    // 何を引いたかはここで決めるが、見せるのは間が明けてから。
    //   先に見せると「今回は分裂か」と身構えられて、驚きが消える。
    b.stand = pickLastStand();
    b.dying = 1500; b.hp = 0; b.charging = false; b.returning = false;
    Snd.kill(); Snd.bomb(); Snd.stopBGM();
    game.flash = 0.9; game.shake = CFG.MAX_SHAKE;
    return;
  }
  bossDefeated();
}

/** 間が明けた。引いた札をめくる。 */
function runLastStand() {
  const b = game.boss;
  if (!b) return;
  const k = b.stand || 'revive';
  b.stand = null; b.dying = 0;
  // 相方には結果ではなく「何が起きたか」を伝える。世界そのものは
  //   スナップショットで届くが、演出と形見の効果は各自で焚く必要がある。
  applyLastStand(k);
  // 方向転換だけは「どの向きに回ったか」も要る。各自で引くと全員バラバラになる。
  if (game.coop && isHost()) Coop.send({ t: 'ls', k, d: k === 'turn' ? stage().dir : undefined });
}

function applyLastStand(k) {
  game.standKind = k;
  game.bossRevealT = 2400;
  switch (k) {
    case 'split': standSplit(); break;
    case 'flee': standFlee(); break;
    case 'greed': standGreed(); break;
    case 'legacy': standLegacy(); break;
    case 'turn': standTurn(); break;
    default: bossRevive(); break;
  }
}
// ゲスト: ホストが引いた札を同じように焚く
Coop.onLastStand = (k, arg) => {
  if (!game.boss || game.finale) return;
  game.standKind = k; game.bossRevealT = 2400;
  if (k === 'legacy') grantLegacy();          // 形見は各自の機体に効く
  else if (k === 'revive') { game.boss.revived = true; game.boss.col = '#ff3b5c'; }
  // 向きは各自のステージ定義を書き換えないと、自機と背景だけ元の向きのまま残る。
  //   ホストが引いた向きをそのまま使う(各自で引くと全員バラバラになる)。
  else if (k === 'turn' && arg) turnWorld(arg);
  Snd.warning();
};

// --- 分裂: 同じ姿の分身が出る。小さくならないので圧が減らない ---
function standSplit() {
  const b = game.boss;
  b.hp = Math.round(b.maxHp * 0.55);
  b.scale = Math.max(1, (b.scale || 1) * 0.78);
  b.col = '#b76bff';
  b.phase = Math.max(1, b.phase);
  const n = game.coop ? Math.min(4, Coop.playerCount()) : 2;
  const st = stage();
  for (let i = 0; i < n; i++) {
    const lat = clamp(latSpan() * (i + 1) / (n + 1), 60, latSpan() - 60);
    game.enemies.push({
      id: nextEid++, ti: 0,
      move: null, mvT: 0, mvS: 0, mph: rand(0, Math.PI * 2), blink: 0,
      type: 'shooter', emoji: st.boss.emoji,
      hp: 14, maxHp: 14, speed: 34, pts: 1400, size: 30,
      amp: 40, freq: 1.4, shootRate: 0.5,
      prog: b.prog * 0.6, lat0: lat, lat, phase: rand(0, Math.PI * 2),
      shootT: rand(300, 900), delay: i * 120, flash: 0,
      locked: false, lockLat: 0, x: -999, y: -999,
      sq: null, progOff: 0, diving: false, shard: true,
    });
  }
  explosion(b.x, b.y, 20, '#b76bff');
  game.flash = 1; game.shake = CFG.MAX_SHAKE;
  if (game.coop && isHost()) Coop.initBoss(b.maxHp);
  Snd.warning(); Snd.startBGM(stage(), game.stageIndex, 'boss');
}

// --- 逃走: 追い詰めたはずが背を向ける。追いつけば即撃破、逃がせば次が強い ---
function standFlee() {
  const b = game.boss;
  b.hp = Math.round(b.maxHp * 0.2);
  b.fleeing = 5600; b.returning = false; b.charging = false;
  b.col = '#4ad6a0';
  explosion(b.x, b.y, 14, '#4ad6a0');
  if (game.coop && isHost()) Coop.initBoss(b.maxHp), (Coop.bossShared = b.hp);
  Snd.warning(); Snd.startBGM(stage(), game.stageIndex, 'boss');
}

// --- 強欲: 拾い残したベルを吸い込んで強くなる ---
//   「拾い忘れ」が初めて罰になる。次からベルの見え方が変わる。
function standGreed() {
  const b = game.boss;
  const n = game.bells.length;
  for (const bl of game.bells) { particles(bl.x, bl.y, 8, '#ffd700'); }
  game.bells = [];
  // 喰ったベルの数だけ本当に硬くなる。1個で 22% 増し。
  //   ここを「割合で戻す」書き方にすると、ベルが少ない回はむしろ弱く復帰して
  //   「強欲」の名前が嘘になる。最大値そのものを上げる。
  b.maxHp = Math.round(b.maxHp * (1 + 0.22 * Math.min(4, n)));
  b.hp = b.maxHp;
  b.scale = Math.min((b.scale || 1) * 1.3, game.coop ? 2.9 : 1.95);
  b.col = '#ffd700';
  b.phase = 2; b.atkT = 600;
  b.dashT = rand(2200, 3600); b.revived = true;   // 突進も解禁する
  explosion(b.x, b.y, 22, '#ffd700');
  game.flash = 1; game.shake = CFG.MAX_SHAKE;
  if (game.coop && isHost()) Coop.initBoss(b.maxHp);
  Snd.warning(); Snd.startBGM(stage(), game.stageIndex, 'boss');
}

// --- 方向転換: 世界そのものが回る ---
//   このゲームは「進行方向がステージごとに変わる」のが芯にある。
//   それを**ボス戦の最中に**やる。覚えた弾の避け方も、指の置き場所も、
//   画面のどちらが「奥」かも、その場で全部作り直しになる。
//   他のシューティングには真似のしようがない一手なので、ここに置く。
function standTurn() {
  const b = game.boss;
  const from = stage().dir;
  const to = pick(Object.keys(DIRS).filter(d => d !== from));
  turnWorld(to);
  b.hp = Math.round(b.maxHp * 0.5);
  b.col = '#8fd3ff';
  b.entering = false; b.returning = true; b.charging = false;
  explosion(b.x, b.y, 20, '#8fd3ff');
  game.flash = 1; game.shake = CFG.MAX_SHAKE;
  if (game.coop && isHost()) { Coop.initBoss(b.maxHp); Coop.bossShared = b.hp; }
  Snd.warning(); Snd.startBGM(stage(), game.stageIndex, 'boss');
}

/**
 * 進行方向を差し替え、いま画面にあるものを新しい向きに置き直す。
 * ホストもゲストも同じ引数で呼ぶ(各自で向きを引くと全員バラバラになる)。
 */
function turnWorld(to) {
  if (!DIRS[to]) return;
  const oldSpan = latSpan();
  const b = game.boss;
  // 横に長い向きと縦に長い向きでは lat の幅そのものが違う。
  //   px のまま持ち越すと画面外へ飛ぶので、割合で持ち越す。
  const bossLatRatio = b ? b.lat / oldSpan : 0.5;

  stage().dir = to;                     // chapterStages が深いコピーを返すので定数は壊れない

  if (b) {
    b.lat = clamp(bossLatRatio * latSpan(), 60, latSpan() - 60);
    b.targetProg = game.coop ? 195 : 150;
    b.prog = Math.min(b.prog, b.targetProg);
    const pos = posFromPL(b.prog, b.lat); b.x = pos.x; b.y = pos.y;
  }
  // 回った瞬間に古い向きの弾が残っていると、どこから来たのか読めないまま当たる。
  //   道中の敵も同じ理由で流す。**回った直後の一拍**が、そのまま猶予になる。
  game.eBullets = []; game.enemies = []; game.bells = [];
  const home = playerHome();
  const p = game.player;
  p.x = home.x; p.y = home.y; p.trail = [];
  p.inv = true; p.invT = Math.max(p.invT, 1200);   // 置き直した直後の事故を防ぐ
  initStars();
  game.bgFloats = [];
}

// --- 形見: 何も起きない。そのまま倒れ、こちらが強くなる ---
//   「必ず何かが起きる」と身構えさせないために、**起きない回**が要る。
function standLegacy() {
  grantLegacy();
  game.score += 4000;
  bossDefeated();
}

// 逃げ切られた。撃破ではないので大きな加点は無い。
//   代わりに次のステージのボスが「恨み」を1つ抱えて出てくる。
//   失敗が次の面の形を変えるので、逃がした回だけ違うステージになる。
function bossEscaped() {
  const b = game.boss;
  if (!b) return;
  game.bossGrudge = (game.bossGrudge || 0) + 1;
  game.score += 800;
  popup(W / 2, H * 0.4, t('boss_escaped'), '#4ad6a0');
  if (game.coop && isHost()) Coop.send({ t: 'bd' });
  Snd.warning();
  bossDefeated();
}

function grantLegacy() {
  const p = game.player;
  p.power = Math.min(4, p.power + 1);
  game.bombs = Math.min(5, game.bombs + 1);
  game.lives++;
  popup(p.x, p.y - 40, '🎗️', '#ffd27f');
  particles(p.x, p.y, 20, '#ffd27f');
  Snd.power ? Snd.power() : Snd.bell();
}

// 復活。別物だと一目で分かるように、大きさ・色・名前・音を全部変える。
function bossRevive() {
  const b = game.boss;
  if (!b) return;
  b.revived = true; b.dying = 0;
  // 大きくなるぶん、定位置を奥へ押し下げる。そうしないとHPバーとホームボタンに
  // 頭がめり込む。共闘は元から2.15倍なので、上限を決めて画面を潰さない。
  b.scale = Math.min((b.scale || 1) * 1.75, game.coop ? 2.9 : 1.95);
  b.targetProg += 86; b.returning = true;
  b.maxHp = Math.round(b.maxHp * 1.45); b.hp = b.maxHp;
  b.dashT = rand(2600, 4200);
  b.col = '#ff3b5c';
  b.phase = 2; b.atkT = 700; b.atkIdx = 0;      // いきなり最終フェーズの攻撃から
  b.phases = (b.phases || BOSS_PHASES).map(ph => ({ attacks: shuffled(ph.attacks) }));
  game.bossRevealT = 2400;
  if (game.coop && !isGuest()) Coop.initBoss(b.maxHp);
  explosion(b.x, b.y, 22, '#ff3b5c');
  game.flash = 1; game.shake = CFG.MAX_SHAKE;
  Snd.warning();
  Snd.startBGM(stage(), game.stageIndex, 'boss');
}

// ボス撃破 → フィナーレ(爽快感の余韻)。ソロ/共闘/エンドレスで分岐。
function bossDefeated() {
  const b = game.boss;
  if (!b) return;
  // ここで state が finale に移り、ワールド配信が止まる。相方には
  // 「ボスが消えた世界」が永久に届かないので、撃破そのものを送る。
  if (game.coop && Coop.role === 'host') Coop.send({ t: 'bd' });
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
  Diag.stageFinished(game.stageIndex);
  game.finale = { t: 0, dur: big ? 3400 : 2300, kind, bx, by, emoji, bonus, snd: false };
  game.state = 'finale';
  game.flash = 0.95; game.shake = CFG.MAX_SHAKE;
  Snd.stopBGM();
}

// === ベル ===
const MAX_BELLS = 3;                    // 画面に溜めない。溜まると結局「無料の火力」になる
// 追い詰められている時だけ、ベルの方から来てくれる。
//   ボス戦で丸腰のまま殴られ続けるのは「難しい」ではなく「詰み」なので、
//   1ステージ2回までだけ救いを入れる。取れる位置に出し、色も最初から役に立つものにする。
const MERCY_MAX = 2, MERCY_GAP = 12000;
/**
 * きずなを進める。
 *
 * 位置は「自分 → 参加順の相方」で数珠つなぎにする。倒れている人は飛ばす
 * —— 復活待ちの機体に線が伸びていると、休んでいるだけで貢献してしまう。
 * ダメージを入れるのはホストだけ(ゲストは描くための状態だけ作る)。
 */
function updateTetherStep(dt) {
  if (!game.tether) game.tether = newTetherState();
  const st = game.tether;
  if (!game.coop) { st.links.length = 0; st.branded = false; return; }
  const p = game.player;
  const pts = [];
  if (!p.dead) pts.push({ x: p.x, y: p.y });
  for (const q of Coop.livePeers()) if (q.alive) pts.push({ x: q.x * W, y: q.y * H });
  updateTether(dt, pts, st, {
    host: !isGuest(),
    enemies: game.enemies,
    boss: game.boss,
    hurt: (e, dmg) => damageEnemy(e, dmg),
    onBreak: () => {
      game.shake = Math.min(game.shake + 6, CFG.MAX_SHAKE);
      popup(W / 2, H * 0.42, t('tether_snap'), '#ff6a6a');
      Snd.hit();
    },
    // 線で切った敵はゲージに乗せる。合体技へつながって、
    //   「離れずに寄り添って戦う」が必殺技の回転につながる。
    onCut: () => gainSuper(SUPER_GAIN.kill * 0.6),
  });
}

function inTrouble() {
  const p = game.player;
  return game.lives <= 1 || (game.bossActive && p.power <= 1 && !p.shield);
}
function updateMercyBell(dt) {
  if (isGuest()) return;
  if ((game.mercyUsed || 0) >= MERCY_MAX || !inTrouble()) return;
  game.mercyT = (game.mercyT || 0) + dt * 1000;
  if (game.mercyT < MERCY_GAP) return;
  game.mercyT = 0; game.mercyUsed = (game.mercyUsed || 0) + 1;
  // 残機が本当に危ない時は LIFE、そうでなければ SHIELD から始める
  const want = game.lives <= 1 ? 'life' : 'shield';
  const idx = Math.max(0, BELLS.findIndex(b => b.effect === want));
  const lat = clamp(latOf(game.player), 60, latSpan() - 60);
  game.bells.push({ prog: 60, lat, idx, hits: 0, phase: rand(0, Math.PI * 2),
    size: 16, x: -999, y: -999, lockFlash: 0, mercy: 1 });
  popup(game.player.x, game.player.y - 54, getLang() === 'ja' ? '🔔 たすけ!' : '🔔 HELP!', '#ffd700');
}
function spawnBell() {
  if (game.bells.length >= MAX_BELLS) return;
  game.bells.push({ prog: 60, lat: rand(50, latSpan() - 50), idx: 0, hits: 0, phase: rand(0, Math.PI * 2), size: 16, x: -999, y: -999, lockFlash: 0 });
}
// 倒した敵の位置からベルを出す。ベルを「湧いてくるもの」から
//   「強い敵を倒した見返り」に変えると、取りに行く判断が生まれる。
function spawnBellAt(x, y) {
  if (game.bells.length >= MAX_BELLS) return;
  const inv = invPL(x, y);
  game.bells.push({ prog: Math.max(20, inv.prog), lat: clamp(inv.lat, 40, latSpan() - 40),
    idx: 0, hits: 0, phase: rand(0, Math.PI * 2), size: 16, x, y, lockFlash: 0 });
}
export const BELL_DROP_HP = 3;          // これ以上硬い敵=撃ち返してくる連中だけが落とす
const BELL_DROP_CHANCE = 0.5;
// 後半のステージは硬い敵が大量に出るので、確率だけだと逆に降り注いでしまう。
// 「前のドロップから何秒空いたか」で頭を押さえる。
const BELL_DROP_COOLDOWN = 9000;
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
  gainSuper(SUPER_GAIN.bellPick);   // ベルは必殺技への一番大きな供給源
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
    case 'boomerang': p.boomT = bt.duration; break;
    case 'swift': p.swiftT = bt.duration; break;                              // 弾が速くなる
    case 'life': game.lives = Math.min(game.lives + 1, MAX_LIFE_BELL); break;  // ボス戦の救済
    case 'rear': p.rearT = bt.duration; break;
    case 'side': p.sideT = bt.duration; break;
  }
}

// === ステージ進行 ===
function startStage(i) {
  game.stageIndex = i;
  // resumeAt があれば、そこまで進んだ状態で始める(死んだ場所からの再開)
  const rs = game.resumeAt; game.resumeAt = null;
  game.stageTime = rs ? rs.time : 0;
  game.waveIdx = rs ? rs.wave : 0;
  game.lastBellDrop = -9999;   // ステージを跨いで持ち越さない
  game.mercyUsed = 0; game.mercyT = 0;
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
      const base = (2900 - game.stageIndex * 260) * Director.spawnMul * diffMods().spawn / Weather.mods.spawnMul
                 / (game.coop ? coopSpawnMul(Coop.playerCount()) : 1);
      game.nextWave = Math.max(1000, base + rand(-400, 400));
    }
    updateMercyBell(dt);
    game.nextBell -= dt * 1000;
    if (game.nextBell <= 0) {
      spawnBell();
      const clearBonus = Weather.kind === 'clear' ? 0.8 : 1;
      // 大幅に間隔を空けた。前は1ステージで5個以上降ってきて、撃つ前に最大火力に
      // なってしまい手応えが消えていた。主な供給源は下の「硬い敵の撃破」に移した。
      game.nextBell = rand(17000, 26000) * clearBonus / Director.bellMul;
    }
    if (game.stageTime >= st.dur) {
      game.warnT = CFG.WARN_TIME; Snd.warning();
      game.enemies = []; game.eBullets = []; game.bells = [];
    }
  }
  if (game.warnT > 0) { game.warnT -= dt * 1000; if (game.warnT <= 0) spawnBoss(); }
}

// 一番近い敵(半径内)。ネコの追尾に使う。
function nearestEnemy(x, y, r) {
  let best = null, bd = r * r;
  for (const e of game.enemies) {
    if (e.delay > 0) continue;
    const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// キャラ固有の弾道。ここで位置まで決めるので、呼んだ側は前進させない。
//   false を返したら寿命切れ(ピザの近距離弾など)。
function applyTraj(b, dt) {
  b.tt += dt;
  const sp = Math.hypot(b.vx, b.vy);
  switch (b.traj) {
    case 'accel':                                   // 🚀 出は遅く、じわじわ伸びる
      if (sp < b.spMax) { const k = 1 + dt * 2.6; b.vx *= k; b.vy *= k; }
      break;
    case 'grow':                                    // ✨ 進むほど大きくなる(当たり判定も)
      b.size = Math.min(b.size0 * 2.2, b.size + dt * b.size0 * 1.5);
      break;
    case 'decel':                                   // 💩 重くて失速する。遠くへは届かない。
      b.vx *= 1 - dt * 1.35; b.vy *= 1 - dt * 1.35;
      if (sp < 90) return false;
      break;
    case 'scatter': {                               // 🥕 手投げなので少しずつ散る
      // 曲がり方に個体差を持たせる。同じ弧ばかりだと当たり方が固定される。
      if (b.curveK === undefined) { b.curveK = rand(4.2, 8.4); b.curveA = rand(0.6, 1.25); }
      const a = Math.atan2(b.vy, b.vx) + Math.sin(b.tt * b.curveK + b.side * 2.1) * b.curveA * dt;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      break;
    }
    case 'seek': {                                  // 🐾 近くの敵へ少しだけ曲がる
      const t = nearestEnemy(b.x, b.y, 240);
      if (t) {
        const want = Math.atan2(t.y - b.y, t.x - b.x), cur = Math.atan2(b.vy, b.vx);
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const na = cur + clamp(d, -2.6 * dt, 2.6 * dt);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
      break;
    }
    case 'curve': {                                 // 🍌 弧を描く。まっすぐは飛ばない。
      const a = Math.atan2(b.vy, b.vx) + 1.9 * dt * b.side;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      break;
    }
    case 'drift': {                                 // 🍃 風に流されて横へ広がる
      const a = Math.atan2(b.vy, b.vx) + 1.15 * dt * b.side;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      break;
    }
    case 'bounce': {                                // 🦴 画面の端で跳ね返る
      // 真上に撃つと壁に当たらず、跳ね返りが一生見えない。最初に斜めへ蹴り出す。
      if (!b.kicked) {
        b.kicked = 1;
        const a0 = Math.atan2(b.vy, b.vx) + 0.30 * b.side;
        b.vx = Math.cos(a0) * sp; b.vy = Math.sin(a0) * sp;
      }
      // 跳ね返る弾は画面外へ出ないので、寿命を付けないと溜まり続ける。
      //   実際に「骨だらけで避ける必要がない」状態になっていた。
      //   跳ね返り2回まで、かつ1.6秒で消える。
      if ((b.x < 16 && b.vx < 0) || (b.x > W - 16 && b.vx > 0)) { b.vx = -b.vx; b.bounces = (b.bounces || 0) + 1; b.bounced = 1; }
      if ((b.y < 16 && b.vy < 0) || (b.y > H - 16 && b.vy > 0)) { b.vy = -b.vy; b.bounces = (b.bounces || 0) + 1; b.bounced = 1; }
      if ((b.bounces || 0) > 2 || b.tt > 1.6) return false;
      break;
    }
    case 'short':                                   // 🍕 途中で落ちる(近距離特化)
      if (b.tt > 0.62) return false;
      break;
    case 'split':                                   // 🥚 割れて二手に
      if (b.tt > 0.40) {
        const a = Math.atan2(b.vy, b.vx);
        for (const k of [-0.30, 0.30]) {
          game.pBullets.push({
            ...b, x: b.x, y: b.y, bx: b.x, by: b.y, tt: 0, traj: 'straight',
            vx: Math.cos(a + k) * sp, vy: Math.sin(a + k) * sp,
            size: b.size * 0.72, dmg: Math.max(1, (b.dmg || 1) - 1),
          });
        }
        Snd.hit();
        return false;
      }
      break;
    case 'wave': {                                  // 💧 左右に波打ちながら貫く
      b.bx += b.vx * dt; b.by += b.vy * dt;
      const a = Math.atan2(b.vy, b.vx), px = -Math.sin(a), py = Math.cos(a);
      const off = Math.sin(b.tt * 12) * 17;
      b.x = b.bx + px * off; b.y = b.by + py * off;
      return true;
    }
    case 'spiral': {                                // ❄️ 渦を巻いて進む
      b.bx += b.vx * dt; b.by += b.vy * dt;
      const a = Math.atan2(b.vy, b.vx), px = -Math.sin(a), py = Math.cos(a);
      const w = b.tt * 8.5 * b.side, r = 21;
      b.x = b.bx + px * Math.cos(w) * r + Math.cos(a) * Math.sin(w) * r * 0.4;
      b.y = b.by + py * Math.cos(w) * r + Math.sin(a) * Math.sin(w) * r * 0.4;
      return true;
    }
    // 'lure'(🥖) は敵側で処理する。弾そのものはまっすぐ飛ぶ。
  }
  b.x += b.vx * dt; b.y += b.vy * dt;
  return true;
}

function updateBullets(dt) {
  const wind = Weather.mods.windLat;
  const a = fwAngle();
  const px = -Math.sin(a), py = Math.cos(a);
  for (let i = game.pBullets.length - 1; i >= 0; i--) {
    const b = game.pBullets[i];
    if (b.traj && b.traj !== 'straight' && !b.boom) {
      if (!applyTraj(b, dt)) { game.pBullets.splice(i, 1); continue; }
      if (b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) game.pBullets.splice(i, 1);
      continue;
    }
    if (b.boom) {
      b.bt += dt; b.spin += dt * 13;
      // 行きが終わったら折り返す。帰り道にも当たるので、前に出て撃つ価値が生まれる。
      if (!b.back && b.bt > 0.44) { b.back = 1; b.vx = -b.vx; b.vy = -b.vy; }
      if (b.back && b.bt > 1.25) { game.pBullets.splice(i, 1); continue; }
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    // 戻ってくる弾は画面外に出ても消さない(消すと帰ってこられない)
    if (!(b.boom && !b.back) && (b.x < -25 || b.x > W + 25 || b.y < -25 || b.y > H + 25)) game.pBullets.splice(i, 1);
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
  // 当たり判定はキャラで変える。
  //   もともと speed(移動の速さ)で差を付けていたが、指でドラッグする限り
  //   その値は一切効いていなかった(input.js は 1:1 で動かす)。
  //   つまり「いどう」はスマホでは嘘の数値だった。
  //   代わりに **身のこなし = 当たり判定の大きさ** に置き換える。
  //   すり抜けた/当たったが毎回felt になるので、指で遊んでも差が出る。
  const agi = Save.char().speed || 1;
  const hitR = clamp(7 / Math.pow(agi, 0.8), 4.4, 10.5);
  const collectR = 24;
  for (let bi = game.pBullets.length - 1; bi >= 0; bi--) {
    const b = game.pBullets[bi];
    let used = false;
    for (let ei = game.enemies.length - 1; ei >= 0; ei--) {
      const e = game.enemies[ei];
      if (e.delay > 0) continue;
      if (dist(b, e) < e.size + b.size) {
        if (b.slow) e.slowT = 1400;                      // キャラ特性: ベタッと減速
        if (isGuest()) {          // ゲストの命中はホストへ通知(正はホスト側の計算)
          const dmg = b.dmg || 1;
          Coop.send({ t: 'hit', id: e.id, d: dmg, sl: b.slow ? 1 : 0 });
          e.flash = 1; e.hp -= dmg; particles(e.x, e.y, 3, '#ffffff');
          game.stats.hits++;
          if (e.hp <= 0) { game.enemies.splice(ei, 1); Snd.kill(); particles(e.x, e.y, 12, '#ffd700'); }
        } else damageEnemy(e, b.dmg || 1);
        if (!b.pierce) { game.pBullets.splice(bi, 1); used = true; }   // 貫通弾は消えない
        if (!isGuest() && e.hp <= 0) game.enemies.splice(ei, 1);
        if (!b.pierce) break;
      }
    }
    if (used) continue;
    if (game.boss && !game.boss.entering && dist(b, game.boss) < 42 * game.boss.scale + b.size) { damageBoss(b.dmg || 1); if (!b.pierce) { game.pBullets.splice(bi, 1); } continue; }
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
function freshGame() {
  const hi = game.hi; setGame(newGame()); game.hi = hi;
  game.lives = diffMods().lives;    // むずかしさで残機が変わる(やさしい=5、むずかしい=2)
  Director.reset(); Save.startRun();
}

export function startRun(from = 0, resume = false) {
  Snd.init(); freshGame();
  game.stages = chapterStages(Save.chapter(), STAGES);   // 章ごとに6ステージ
  game.chapter = Save.chapter();
  const idx = clamp(from, 0, game.stages.length - 1);
  Diag.runStarted();
  // タイトルの「つづき」も、前回死んだところから始める
  if (resume) {
    const r = Save.resumePoint();
    if (r && r.stage === idx) game.resumeAt = { time: r.time, wave: r.wave };
  }
  startStage(idx);
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
  game.lives = coopLives(Coop.playerCount());
  game.stages = [st];
  startStage(0);
}
// ゲスト: ホストの開始合図(共有種つき)を受けて同時スタート
Coop.onStartGame = () => startCoop();

// ホストが抜けた → 残った誰かが世界の計算を引き取る。
//
//   ゲストの画面にある敵は「見た目を再現したもの」で、動きの内部状態
//   (進行度・揺れの位相・発射のタイマー)を持っていない。そのまま動かすと
//   一斉に瞬間移動する。なので**道中の敵と弾は流す**。
//   代わりに、失うと理不尽なもの — スコア・残機・ステージの進行度・
//   戦っているボスとその残りHP — は全部そのまま引き継ぐ。
//   一番大事な「ボス戦の途中で投げ出される」がこれで起きない。
Coop.onBecomeHost = () => {
  if (!game.coop || (game.state !== 'play' && game.state !== 'warn')) return;
  game.enemies = []; game.eBullets = []; game.bells = [];
  game.nextWave = 1200;    // 引き継いだ直後に湧かせない(呼吸を置く)
  const b = game.boss;
  if (b) {
    // 表示用に追っていた共有HPが、ここからは正になる
    Coop.initBoss(b.maxHp);
    Coop.bossShared = b.hp;
    b.x = b.tx !== undefined ? b.tx : b.x;
    b.y = b.ty !== undefined ? b.ty : b.y;
    // 既に一度蘇っているボスを、引き継いだ側がもう一度蘇らせないようにする
    b.stands = Math.min(b.stands || 0, 1);   // 引き継いだ側が札を配り直さない
  }
  popup(W / 2, H * 0.42, t('coop_host_left'), '#ffd27f');
  Snd.warning();
};
// ホストがボスを倒した → ゲストも同じ撃破演出へ
Coop.onBossDown = () => { if (game.boss && !game.finale) bossDefeated(); };
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
    Diag.runEnded(); markResumePoint(); game.state = 'over'; game.overT = 0; saveHi(); Snd.stopBGM();
  }
};
// ゲスト: ホストから終了の合図
Coop.onGameOver = () => {
  if (game.state === 'over' || game.state === 'victory') return;
  recordRunEnd({});
  Diag.runEnded(); markResumePoint(); game.state = 'over'; game.overT = 0; saveHi(); Snd.stopBGM();
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
  const sub = game.coop ? (ja ? `${Coop.partyLabel(true)} と共闘クリア` : `Cleared with ${Coop.partyLabel(false)}`)
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
// 「つづき」は死んだところから。ステージの頭に戻されると、
//   もう一度同じ道のりをやり直すことになって続ける気が失せる。
//   ただし本当に同じ一瞬から再開すると、自分を殺した弾に突っ込むだけなので
//   数秒だけ巻き戻す。ボス戦で死んだ場合はボスの直前から。
const RESUME_REWIND = 4500;
export function markResumePoint() {
  const st = stage();
  const boss = game.bossActive || game.warnT > 0;
  const time = boss ? Math.max(0, (st.dur || 60000) - 200)
                    : Math.max(0, game.stageTime - RESUME_REWIND);
  Save.setResumePoint(game.stageIndex, time, Math.max(0, game.waveIdx - 2));
}
export function doContinue() {
  if (game.continues <= 0) return;
  game.continues--;
  Snd.continueJingle();
  const r = Save.resumePoint();
  if (r && r.stage === game.stageIndex) game.resumeAt = { time: r.time, wave: r.wave };
  startStage(game.stageIndex);
  game.lives = diffMods().lives; game.bombs = 1;
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
      // 押した効果が分かるように、やり直したあとに一度だけ知らせる
      else if (btn.id === 'easier') { Save.setDiff(Math.max(0, Save.diff() - 1)); retryRun(); popup(W / 2, H * 0.4, t('made_easier'), '#ffd166'); }
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
      updateTetherStep(dt);
      updateSuper(dt);
      updateTimers(dt);
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
