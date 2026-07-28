// ============================================================
// render.js — 描画(読みやすさ優先: 大きめ・視認性の高いサンセリフ)
// ============================================================
import { BELLS, clamp, stageTint, CHARS, STAGES } from './config.js';
import { W, H, ctx, UI } from './env.js';
import { game } from './state.js';
import { stage, dirDef } from './geo.js';
import { t, getLang } from './i18n.js';
import { Weather } from './weather.js';
import { Director } from './director.js';
import { BossAI } from './bossai.js';
import { Save } from './save.js';
import { Coop } from './coop.js';
import { txt, surface, scrim, roundPath, COL, FONT_UI, FONT_DISPLAY } from './theme.js';
import { qrMatrix } from './qr.js';

// 既定の UI 書体は幾何学サンセリフ。丸ゴシックはロゴ・祝祭表現に限定する。
const SANS = FONT_UI;
function f(size, weight = 600, family = SANS) { ctx.font = `${weight} ${Math.round(size)}px ${family}`; }
// ゲーム画面の上に重ねる文字。太い黒フチ(にじみの原因)をやめ、
// 締まった影で浮かせる → 明るい背景でも暗い背景でもクッキリ読める。
function label(text, x, y, color, size, align = 'center', weight = 700) {
  ctx.save();
  f(size, weight);
  ctx.textAlign = align;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = Math.max(3, size * 0.3);
  ctx.shadowOffsetY = Math.max(1, size * 0.05);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillText(text, x, y); // 二度描きで芯を出す(影だけだと締まらない)
  ctx.restore();
}

// テーマ色をなめらかに補間(ステージが変わると自機/弾がスッと変色する)
function hexToRgb(h) { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbCss(c, a) { const r = c[0] | 0, g = c[1] | 0, b = c[2] | 0; return a == null ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`; }
let curShip = null, curShot = null;
function tickTint() {
  const tint = stageTint(stage());
  const ts = hexToRgb(tint.ship), to = hexToRgb(tint.shot);
  if (!curShip) { curShip = ts.slice(); curShot = to.slice(); return; }
  const k = 0.08;
  for (let i = 0; i < 3; i++) { curShip[i] += (ts[i] - curShip[i]) * k; curShot[i] += (to[i] - curShot[i]) * k; }
}

let wDrops = null;
function ensureDrops() {
  if (wDrops) return;
  wDrops = [];
  for (let i = 0; i < 90; i++) wDrops.push({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 0.8 });
}

function drawBackground() {
  const st = stage();
  const cols = Weather.mods.night ? st.night : st.sky;
  const d = st.dir;
  const grad = (d === 'left' || d === 'right') ? ctx.createLinearGradient(0, 0, W, 0) : ctx.createLinearGradient(0, 0, 0, H);
  if (d === 'up' || d === 'left') { grad.addColorStop(0, cols[1]); grad.addColorStop(1, cols[0]); }
  else { grad.addColorStop(0, cols[0]); grad.addColorStop(1, cols[1]); }
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  // === 弾の視認性を保証する減光 ===
  //   明るい配色(パステルのピンク等)だと敵弾が背景に溶けるため、
  //   背景の明度に応じて自動で暗く締める。暗いテーマではほぼ無効。
  const lum = c => { const r = hexToRgb(c); return (r[0] * 0.299 + r[1] * 0.587 + r[2] * 0.114) / 255; };
  const bright = Math.max(lum(cols[0]), lum(cols[1]));
  const dim = clamp((bright - 0.32) * 0.86, 0, 0.46);
  if (dim > 0.01) { ctx.fillStyle = `rgba(6,10,26,${dim.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  const starAlpha = Weather.mods.night || game.stageIndex >= 4 ? 1 : 0.4;
  for (const s of game.stars) {
    const tw = 0.5 + 0.5 * Math.sin(performance.now() * 0.003 + s.x);
    ctx.fillStyle = `rgba(255,255,255,${(s.b * tw * starAlpha).toFixed(3)})`;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const fl of game.bgFloats) {
    ctx.globalAlpha = fl.alpha * 0.8; ctx.font = `${Math.round(fl.size * UI)}px serif`;
    ctx.fillText(fl.emoji, fl.x, fl.y);
  }
  ctx.globalAlpha = 1;
  scrim(W, H); // 上下を締めて HUD と弾を読みやすく
}

function drawWeatherFx() {
  const m = Weather.mods;
  if (m.rain || m.snow) {
    ensureDrops();
    const wind = m.windLat * 0.6;
    if (m.rain) {
      ctx.strokeStyle = 'rgba(180,220,255,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (const dr of wDrops) {
        dr.y += (540 * dr.s) / 60; dr.x += wind / 60;
        if (dr.y > H) { dr.y = -12; dr.x = Math.random() * W; }
        if (dr.x > W) dr.x -= W; if (dr.x < 0) dr.x += W;
        ctx.moveTo(dr.x, dr.y); ctx.lineTo(dr.x - wind * 0.03, dr.y - 13 * dr.s);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (const dr of wDrops) {
        dr.y += (60 * dr.s) / 60; dr.x += Math.sin(dr.y * 0.02 + dr.s * 9) * 0.6 + wind / 90;
        if (dr.y > H) { dr.y = -6; dr.x = Math.random() * W; }
        if (dr.x > W) dr.x -= W; if (dr.x < 0) dr.x += W;
        ctx.globalAlpha = 0.4 + 0.4 * dr.s; ctx.fillRect(dr.x, dr.y, 2.2 * dr.s, 2.2 * dr.s);
      }
      ctx.globalAlpha = 1;
    }
  }
  if (Weather.temp !== null) {
    if (Weather.temp >= 32) { ctx.fillStyle = 'rgba(255,60,0,0.06)'; ctx.fillRect(0, 0, W, H); }
    else if (Weather.temp <= 0) { ctx.fillStyle = 'rgba(80,160,255,0.07)'; ctx.fillRect(0, 0, W, H); }
  }
  if (game.boltAnim) {
    ctx.strokeStyle = `rgba(200,230,255,${game.boltAnim.t / 0.35})`; ctx.lineWidth = 3;
    for (const pt of game.boltAnim.pts) {
      ctx.beginPath(); let x = pt.x + (Math.random() - 0.5) * 60, y = 0; ctx.moveTo(x, y);
      while (y < pt.y) { y += 20 + Math.random() * 30; x += (Math.random() - 0.5) * 48; ctx.lineTo(Math.min(x, pt.x + 40), Math.min(y, pt.y)); }
      ctx.lineTo(pt.x, pt.y); ctx.stroke();
    }
  }
}

function drawFog() {
  if (!Weather.mods.fog || game.state !== 'play') return;
  const p = game.player, r = Math.min(W, H) * 0.42;
  const g = ctx.createRadialGradient(p.x, p.y, r * 0.45, p.x, p.y, r * 1.5);
  g.addColorStop(0, 'rgba(20,20,30,0)'); g.addColorStop(1, 'rgba(20,20,30,0.72)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawPlayer() {
  const p = game.player;
  if (p.dead) return;
  if (p.inv && Math.floor(p.invT / 80) % 2 === 0) return;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < p.options; i++) {
    const tt = p.trail[Math.min((i + 1) * 14, p.trail.length - 1)];
    if (!tt) continue;
    const pulse = 5 + Math.sin(performance.now() * 0.008 + i * 2) * 1.5;
    ctx.fillStyle = 'rgba(185,103,255,0.35)'; ctx.beginPath(); ctx.arc(tt.x, tt.y, pulse + 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e3c8ff'; ctx.beginPath(); ctx.arc(tt.x, tt.y, pulse, 0, Math.PI * 2); ctx.fill();
  }
  const ch = Save.char();
  // 自分だけの目印(共闘中に自分を見失わないように、足元に光る輪)
  if (game.coop) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.25 * Math.sin(performance.now() * 0.005);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    txt(getLang() === 'ja' ? 'じぶん' : 'YOU', p.x, p.y + 30, { size: 8.5 * UI, weight: 700, color: '#ffffff', shadow: 0.9 });
  }
  const shipCol = ch.col;
  // 集中リング(踏みとどまっている=火力上昇中の合図)
  const fa = p.focusAnim || 0;
  if (fa > 0.02) {
    ctx.save();
    ctx.globalAlpha = fa * 0.9;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 30 - fa * 8, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = fa * 0.5;
    ctx.strokeStyle = ch.shot; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(p.x, p.y, 30 - fa * 8, -Math.PI / 2, -Math.PI / 2 + fa * Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(dirDef().fy, dirDef().fx) + Math.PI / 2);
  // キャラ色の光背。どんな背景でも自機を見失わないよう、しっかり出す。
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
  halo.addColorStop(0, shipCol + 'aa'); halo.addColorStop(0.55, shipCol + '55'); halo.addColorStop(1, shipCol + '00');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(0, 0, 24, 0, Math.PI * 2); ctx.fill();
  const th = 9 + Math.sin(p.anim) * 4;
  const tg = ctx.createLinearGradient(0, 13, 0, 13 + th);
  tg.addColorStop(0, '#fff'); tg.addColorStop(0.35, shipCol); tg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-5, 13); ctx.lineTo(5, 13); ctx.lineTo(1, 13 + th); ctx.lineTo(-1, 13 + th); ctx.fill();
  // 自機の描画。ここは既に「進行方向が上」になるよう回転済みの座標系。
  ctx.save();
  ctx.fillStyle = '#ffffff';   // 噴射炎のグラデーションが残ると絵文字が消えるため戻す
  if (ch.art === 'ship') {
    // 幾何学的な戦闘機。機首がそのまま進行方向を向く。
    ctx.fillStyle = ch.col; ctx.fillRect(-6, -4, 12, 18);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-4, -2, 8, 14);
    ctx.fillStyle = '#eaf6ff'; ctx.fillRect(-3, -16, 6, 14);
    ctx.fillStyle = ch.shot; ctx.fillRect(-2, -14, 4, 11);
    ctx.fillStyle = '#ff5a5a'; ctx.fillRect(-18, 4, 12, 8); ctx.fillRect(6, 4, 12, 8);
    ctx.fillStyle = '#00ffaa'; ctx.fillRect(-2, -8, 4, 6);
  } else {
    // 絵文字。face を持つものは絵柄が向いている角度ぶん回して機首を進行方向へ。
    if (ch.face != null) ctx.rotate(-Math.PI / 2 - ch.face);
    else ctx.rotate(-(Math.atan2(dirDef().fy, dirDef().fx) + Math.PI / 2));  // 正立のまま
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(32 * UI)}px serif`;
    ctx.fillText(ch.emoji, 0, 0);
  }
  ctx.restore();
  // 発砲マズルフラッシュ(テーマ色・一瞬)
  const mz = p.muzzle || 0;
  if (mz > 0.02) {
    const shotCol = rgbCss(curShot || [143, 227, 255]);
    ctx.globalAlpha = clamp(mz * 0.85, 0, 1);
    ctx.fillStyle = shotCol; ctx.beginPath(); ctx.arc(0, -16, 3 + (1 - mz) * 7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = clamp(mz, 0, 1);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, -16, 2 + (1 - mz) * 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (p.shield) {
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.55 + 0.3 * Math.sin(performance.now() * 0.006);
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  if (p.boost) { ctx.fillStyle = 'rgba(74,158,255,0.22)'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawBullets() {
  const a = Math.atan2(dirDef().fy, dirDef().fx);
  const shot = rgbCss(curShot || [143, 227, 255]);
  const shotGlow = rgbCss(curShot || [143, 227, 255], 0.4);
  for (const b of game.pBullets) {
    if (b.emoji) {   // キャラ固有の弾(🐾 ✨ 💩 など)
      ctx.save(); ctx.translate(b.x, b.y);
      // どの背景でも埋もれないよう、キャラ色の光背を敷く
      const r = b.size * 2;
      const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      gl.addColorStop(0, (b.col || '#fff') + 'cc'); gl.addColorStop(1, (b.col || '#fff') + '00');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(b.size * 3.2)}px serif`;
      ctx.fillText(b.emoji, 0, 0);
      ctx.restore();
      continue;
    }
    const col = b.col || shot;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = b.opt ? 'rgba(185,103,255,0.45)' : (col + '66'); ctx.fillRect(-b.size * 0.62, 0, b.size * 1.24, 12);
    ctx.fillStyle = b.opt ? '#e3c8ff' : col; ctx.fillRect(-b.size / 2, -5, b.size, 9);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -5, 2, 7);
    ctx.restore();
  }
  drawEnemyBullets();
}

// 敵弾は数が多い(弾幕で100発超)。1発ずつ save/restore して3回描くと
// スマホで確実にフレームが落ちるため、色ごとに1本のパスへまとめて塗る。
function drawEnemyBullets() {
  const list = game.eBullets;
  if (!list.length) return;
  const tNow = performance.now() * 0.004;
  const groups = new Map();
  for (const b of list) {
    const col = b.col || (b.boss ? '#ff4646' : '#ffaa00');
    let g = groups.get(col);
    if (!g) { g = []; groups.set(col, g); }
    g.push(b);
  }
  // 弾幕が濃い時は半透明の光背を省く(塗り面積が重なって低スペック機で落ちるため)。
  // 白い芯は必ず描くので、省いても弾は見失わない。
  const glow = list.length <= 70;
  ctx.save();
  for (const [col, bs] of groups) {
    // ① 外周のにじみ(位置が背景に埋もれないように)
    if (glow) {
      ctx.beginPath();
      for (const b of bs) { ctx.moveTo(b.x + b.size + 3.5, b.y); ctx.arc(b.x, b.y, b.size + 3.5, 0, Math.PI * 2); }
      ctx.fillStyle = col + '55'; ctx.fill();
    }
    // ② 本体(テーマごとの形。回転は座標計算で行い、変換行列は触らない)
    ctx.beginPath();
    for (const b of bs) shapePath(b, tNow);
    ctx.fillStyle = col; ctx.fill();
    // ③ 一部の形だけ輪郭を足す(配列は作らずその場で数える)
    let ring = 0;
    ctx.beginPath();
    for (const b of bs) {
      if (b.shape !== 'bubble' && b.shape !== 'orb') continue;
      ring = b.shape === 'orb' ? 2 : 1;
      const r = b.size + (b.shape === 'orb' ? 4 : 2);
      ctx.moveTo(b.x + r, b.y); ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    }
    if (ring) { ctx.strokeStyle = ring === 2 ? col : '#ffffffcc'; ctx.lineWidth = 1.6; ctx.stroke(); }
    // ④ 白い芯(明るい背景でも必ず見える)
    ctx.beginPath();
    for (const b of bs) { const r = b.size * 0.4; ctx.moveTo(b.x + r, b.y); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); }
    ctx.fillStyle = '#fff'; ctx.fill();
  }
  ctx.restore();
}

// 現在のパスへ弾1発分の輪郭を足す(fill は呼び出し側でまとめて1回)。
//   毎フレーム100発以上を通るホットパス。配列もクロージャも作らないこと。
function shapePath(b, tNow) {
  const s = b.size, x = b.x, y = b.y;
  switch (b.shape) {
    case 'star': {
      const a0 = (b.spin || 0) + tNow, R = s * 1.45, r = s * 0.62;
      for (let i = 0; i < 10; i++) {
        const a = a0 + i * 0.6283185307, rad = i % 2 ? r : R;   // π/5
        const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); break;
    }
    case 'diamond': {
      const a = (b.spin || 0) + tNow * 0.6, c = Math.cos(a), n = Math.sin(a), d = s * 1.35;
      ctx.moveTo(x + n * d, y - c * d);
      ctx.lineTo(x + c * s, y + n * s);
      ctx.lineTo(x - n * d, y + c * d);
      ctx.lineTo(x - c * s, y - n * s);
      ctx.closePath(); break;
    }
    case 'chip': {
      const h = s * 1.16;                                        // 45°回転した正方形=菱形
      ctx.moveTo(x, y - h); ctx.lineTo(x + h, y); ctx.lineTo(x, y + h); ctx.lineTo(x - h, y);
      ctx.closePath(); break;
    }
    case 'flame':
      ctx.moveTo(x, y - s * 1.5);
      ctx.quadraticCurveTo(x + s * 1.1, y, x, y + s * 1.15);
      ctx.quadraticCurveTo(x - s * 1.1, y, x, y - s * 1.5);
      ctx.closePath(); break;
    default:
      ctx.moveTo(x + s, y); ctx.arc(x, y, s, 0, Math.PI * 2);
  }
}

function drawEnemies() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const e of game.enemies) {
    if (e.delay > 0) continue;
    ctx.save(); ctx.translate(e.x, e.y); ctx.font = `${e.size * 2}px serif`;
    ctx.fillText(e.emoji, 0, 0);
    if (e.flash > 0) { ctx.globalAlpha = clamp(e.flash, 0, 1); ctx.fillText('✨', 0, 0); ctx.globalAlpha = 1; }
    if (e.maxHp > 2) {
      const bw = e.size * 1.6;
      ctx.fillStyle = '#222'; ctx.fillRect(-bw / 2, -e.size - 8, bw, 3.5);
      ctx.fillStyle = '#ff4646'; ctx.fillRect(-bw / 2, -e.size - 8, bw * (e.hp / e.maxHp), 3.5);
    }
    ctx.restore();
  }
}

function drawBoss() {
  const b = game.boss;
  if (!b) return;
  const bs = b.scale || 1;
  ctx.save(); ctx.translate(b.x, b.y);
  const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.06; ctx.scale(pulse * bs, pulse * bs);
  const aura = ['rgba(255,255,255,0.2)', 'rgba(255,170,0,0.28)', 'rgba(255,30,30,0.35)'][b.phase];
  // 巨大ボスは さらに威圧的なオーラをもう一枚重ねる
  if (bs > 1.4) {
    const og = ctx.createRadialGradient(0, 0, 30, 0, 0, 72);
    og.addColorStop(0, b.col + '44'); og.addColorStop(1, b.col + '00');
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(0, 0, 72, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = aura; ctx.beginPath(); ctx.arc(0, 0, 48, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '68px serif';
  ctx.fillText(stage().boss.emoji, 0, 0);
  if (b.flash > 0) { ctx.globalAlpha = clamp(b.flash * 0.7, 0, 1); ctx.font = '74px serif'; ctx.fillText('💥', 0, 0); ctx.globalAlpha = 1; }
  if (BossAI.thinking > 0) { ctx.font = '22px serif'; ctx.fillText('🧠', 40, -42); }
  ctx.restore();
  if (!b.entering) {
    const bw = Math.min(W * 0.72, 420), bx = (W - bw) / 2, by = 52 + 8 * UI;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(bx - 3, by - 3, bw + 6, 15);
    ctx.fillStyle = '#3a0a0a'; ctx.fillRect(bx, by, bw, 9);
    const r = clamp(b.hp / b.maxHp, 0, 1);
    ctx.fillStyle = r > 0.66 ? '#ff5050' : r > 0.33 ? '#ff9430' : '#ffe14d'; ctx.fillRect(bx, by, bw * r, 9);
    const nm = getLang() === 'ja' ? stage().boss.name : stage().boss.en;
    label(`${stage().boss.emoji} ${nm}`, W / 2, by - 12, '#fff', 12 * UI);
  }
}

function drawBells() {
  ctx.textBaseline = 'middle';
  for (const bl of game.bells) {
    const bt = BELLS[bl.idx];
    ctx.save(); ctx.translate(bl.x, bl.y + Math.sin(bl.phase) * 3);
    ctx.fillStyle = bt.color + '55'; ctx.beginPath(); ctx.arc(0, 0, bl.size + 5, 0, Math.PI * 2); ctx.fill();
    ctx.font = `${bl.size * 2}px serif`; ctx.textAlign = 'center'; ctx.fillText('🔔', 0, 0);
    ctx.strokeStyle = bt.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, bl.size + 3, 0, Math.PI * 2); ctx.stroke();
    label(bt.name, 0, bl.size + 16, bt.color, 10 * UI);
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of game.particles) {
    ctx.globalAlpha = clamp(p.life, 0, 1); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPopups() {
  ctx.textAlign = 'center';
  for (const s of game.popups) {
    ctx.globalAlpha = clamp(s.life, 0, 1);
    label(s.text, s.x, s.y - (1 - s.life) * 46, s.color, 13 * UI);
  }
  ctx.globalAlpha = 1;
}

function drawHUD() {
  const pad = 14 * UI, top = 14 * UI;
  ctx.textBaseline = 'top';
  // スコア(左上・数字は等幅感のある太字。上部ボタンとは反対側に置く)
  txt(String(game.score).padStart(7, '0'), pad, top, { size: 19 * UI, weight: 700, color: '#fff', align: 'left', baseline: 'top', shadow: 0.8 });
  if (game.comboMul > 1 && performance.now() - game.lastKill < 2000) {
    txt(`x${game.comboMul}`, pad, top + 24 * UI, { size: 14 * UI, weight: 800, color: '#ff9a4d', align: 'left', baseline: 'top', shadow: 0.8 });
  }
  const p = game.player;
  ctx.font = `${Math.round(17 * UI)}px serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('❤️'.repeat(Math.max(0, game.lives)) + (game.bombs ? '  ' + '💣'.repeat(game.bombs) : ''), pad, H - 46 * UI);
  const st8 = `PW${p.power}${p.options ? ' · OP' + p.options : ''}${p.shield ? ' · 🛡' : ''}${p.boost ? ' · 💨' : ''}`;
  txt(st8, pad, H - 24 * UI, { size: 10.5 * UI, weight: 600, color: COL.sub, align: 'left', baseline: 'top', shadow: 0.7 });
  const slabel = game.coop ? '👥' : game.endless ? ('W' + game.world) : game.daily ? 'DAILY' : game.aiMode ? 'AI' : ('' + (game.stageIndex + 1));
  txt(`${slabel} ${stage().emoji}${dirDef().arrow}`, W - pad, H - 24 * UI, { size: 10.5 * UI, weight: 600, color: COL.sub, align: 'right', baseline: 'top', shadow: 0.7 });
  if (game.coop) drawCoopHud();
  if (Director.msg && Director.msgT > 0) {
    ctx.globalAlpha = clamp(Director.msgT, 0, 1);
    label(Director.msg, W / 2, H - 78 * UI, '#00ffcc', 12 * UI);
    ctx.globalAlpha = 1;
  }
  if (game.warnT > 0 && Math.floor(game.warnT / 220) % 2 === 0) {
    ctx.fillStyle = 'rgba(255,0,0,0.16)'; ctx.fillRect(0, H / 2 - 62, W, 124);
    label('⚠ ' + t('warning') + ' ⚠', W / 2, H / 2 - 12, '#ff3030', 30 * UI);
    const nm = getLang() === 'ja' ? stage().boss.name : stage().boss.en;
    label(`${nm} ${t('approach')}`, W / 2, H / 2 + 26, '#ffb0b0', 14 * UI);
  }
  // 集中モードの発見用ヒント: 初めて踏みとどまった時に一度だけ出す
  if (game.focusHintT > 0) {
    const k = Math.min(1, game.focusHintT / 400);
    ctx.globalAlpha = clamp(game.focusHintT / 900, 0, 1) * 0.95;
    const p2 = game.player;
    txt(getLang() === 'ja' ? '止まると集中 — 攻撃力アップ' : 'Hold still to focus — more firepower',
      W / 2, p2.y - 62 * UI, { size: 12.5 * UI, weight: 700, color: '#ffffff', shadow: 0.95, maxW: W * 0.86 });
    ctx.globalAlpha = 1;
  }
  if (game.stageIndex === 0 && game.stageTime < 5200 && game.state === 'play') {
    // 自機(画面下部)と重ならない高さに出す
    ctx.globalAlpha = clamp((5200 - game.stageTime) / 1000, 0, 0.9);
    label(t('hint_move'), W / 2, H - 196 * UI, '#fff', 12 * UI);
    label(t('hint_bomb'), W / 2, H - 178 * UI, '#fff', 12 * UI);
    ctx.globalAlpha = 1;
  }
}

// 夜空グラデーション(タイトル/ロビー共通の下地)
function nightSky(from = '#070b1e', to = '#141a3c') {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, from); g.addColorStop(1, to);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 中央にほのかな光のにじみ(奥行き)
  const b = ctx.createRadialGradient(W / 2, H * 0.34, 0, W / 2, H * 0.34, W * 0.85);
  b.addColorStop(0, 'rgba(96,120,255,0.16)'); b.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = b; ctx.fillRect(0, 0, W, H);
}

// ロゴ(唯一「かわいい」を全開にする場所)
function wordmark(cx, cy, scale = 1, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const size = 38 * UI * scale;
  const g = ctx.createLinearGradient(0, cy - size * 0.6, 0, cy + size * 0.55);
  g.addColorStop(0, '#fff6d0'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#f2a52c');
  ctx.shadowColor = 'rgba(255,190,60,0.45)'; ctx.shadowBlur = 26 * scale;
  txt('EMOJI DROP', cx, cy, { size, weight: 800, family: FONT_DISPLAY, color: g });
  ctx.shadowBlur = 0;
  txt('U L T I M A T E', cx, cy + size * 0.72, { size: 10.5 * UI * scale, weight: 500, color: '#8ea6cc', track: 3.4 * scale });
  ctx.restore();
}

// === スプラッシュ(起動演出 → 数秒でタイトルへ。タップでスキップ) ===
function drawSplash() {
  nightSky('#05081a', '#0f1430');
  for (const s of game.stars) { ctx.fillStyle = `rgba(255,255,255,${(s.b * 0.45).toFixed(2)})`; ctx.fillRect(s.x, s.y, s.size, s.size); }
  const k = clamp(1 - game.splashT / 2000, 0, 1);
  const ein = 1 - Math.pow(1 - Math.min(1, k * 2.4), 3);     // ロゴ登場(ease-out)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // 絵文字が下から舞い上がってロゴを組み立てる
  const crew = ['🚀', '👾', '🐙', '🐉'];
  crew.forEach((e, i) => {
    const d = clamp((k - 0.06 * i) * 2.6, 0, 1);
    const e2 = 1 - Math.pow(1 - d, 3);
    ctx.globalAlpha = e2 * 0.95;
    ctx.font = `${Math.round(26 * UI)}px serif`;
    ctx.fillText(e, W / 2 + (i - 1.5) * 48 * UI, H * 0.40 - 20 * UI + (1 - e2) * 40);
  });
  ctx.globalAlpha = 1;
  wordmark(W / 2, H * 0.485, 0.94 + ein * 0.06, ein);
  if (k > 0.5) {
    txt(getLang() === 'ja' ? 'タップでスキップ' : 'TAP TO SKIP', W / 2, H * 0.88,
      { size: 10.5 * UI, weight: 500, color: '#6f819f', alpha: clamp((k - 0.5) * 3, 0, 0.85), track: 1.6 });
  }
}

// === タイトル ===
function drawTitle() {
  const time = game.titleAnim, ja = getLang() === 'ja';
  nightSky();
  for (const s of game.stars) {
    ctx.fillStyle = `rgba(255,255,255,${(s.b * (0.4 + 0.35 * Math.sin(time * 2 + s.x))).toFixed(3)})`;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // 絵文字の隊列(⚙ボタンと干渉しない高さに配置)
  const ey = H * 0.125;
  const crew = ['🚀', '🐦', '🐙', '👾', '🐉', '🛸'];
  ctx.save();
  ctx.font = `${Math.round(25 * UI)}px serif`;
  crew.forEach((e, i) => {
    const cx = W / 2 + (i - 2.5) * 40 * UI, cyy = ey + Math.sin(time * 2.2 + i * 0.9) * 6;
    ctx.fillText(e, cx, cyy);   // 光背は敷かない(絵文字がぼやけて見えるため)
  });
  ctx.restore();
  wordmark(W / 2, H * 0.205);

  // 天気チップ(中央・都市名つき)。天気が何をするのかを一言で明示。
  const wy = H * 0.30;
  if (Weather.loaded) {
    const line = `${Weather.icon()}  ${Weather.place}  ${Math.round(Weather.temp)}°`;
    f(13 * UI, 600);
    const cw = Math.min(W * 0.86, ctx.measureText(line).width + 34 * UI);
    surface(W / 2 - cw / 2, wy - 16 * UI, cw, 32 * UI, { r: 16 * UI, fill: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.12)', lw: 1 });
    txt(line, W / 2, wy, { size: 13 * UI, weight: 600, color: '#e6efff' });
    txt(ja ? '実際の天気が今日のルールを変えます' : "Live weather rewrites today's rules",
      W / 2, wy + 27 * UI, { size: 10.5 * UI, weight: 500, color: COL.mute });
  } else {
    txt(Weather.failed ? (ja ? '天気オフライン — 標準ルール' : 'Weather offline — standard rules') : t('locating'),
      W / 2, wy, { size: 11.5 * UI, weight: 500, color: COL.mute });
  }

  // === メニュー(必ず画面内に収まる) ===
  game.menuBtns = [];
  const bw = Math.min(W * 0.82, 348), bx = (W - bw) / 2;
  const streak = Save.streakAtRisk();
  let h1 = 64 * UI, h2 = 58 * UI, h3 = 52 * UI, gap = 11 * UI;
  let top = wy + 48 * UI;
  const avail = H * 0.885 - top;
  const need = h1 + gap + h2 + gap + h3 + (streak ? 26 * UI : 0) + 44 * UI;
  if (need > avail) { const k = avail / need; h1 *= k; h2 *= k; h3 *= k; gap *= k; }
  else top += (avail - need) * 0.4;
  let by = top;

  // 制覇マップ: 6つの世界のうちどこまで進んだかを一目で(=目標が見える)
  const done = Save.clearedCount(), res = Save.resumeStage();
  const mw = Math.min(bw, 300), mx = (W - mw) / 2, my = by - 38 * UI;
  STAGES.forEach((s, i) => {
    const cx = mx + (i + 0.5) * (mw / STAGES.length);
    const got = Save.isCleared(i);
    ctx.save();
    ctx.globalAlpha = got ? 1 : 0.28;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(19 * UI)}px serif`;
    ctx.fillText(s.emoji, cx, my);
    ctx.restore();
    if (got) txt('✓', cx + 9 * UI, my + 8 * UI, { size: 8 * UI, weight: 800, color: '#7CFC00' });
  });
  txt((ja ? `第${Save.chapter() + 1}章 ・ 世界 ${done}/${STAGES.length} 制覇` : `CHAPTER ${Save.chapter() + 1} · ${done}/${STAGES.length} conquered`),
    W / 2, my + 20 * UI, { size: 9.5 * UI, weight: 600, color: done ? COL.mint : COL.mute, track: 1, maxW: bw });

  // 主役: 単色ゴールドの実体ボタン(迷いようがない)
  const pulse = 1 + Math.sin(time * 3) * 0.01;
  ctx.save();
  ctx.translate(W / 2, by + h1 / 2); ctx.scale(pulse, pulse); ctx.translate(-W / 2, -(by + h1 / 2));
  ctx.shadowColor = 'rgba(255,190,60,0.4)'; ctx.shadowBlur = 22;
  const gg = ctx.createLinearGradient(0, by, 0, by + h1);
  gg.addColorStop(0, '#ffdf6b'); gg.addColorStop(1, '#f5b429');
  surface(bx, by, bw, h1, { r: 16, fill: gg, border: null });
  ctx.shadowBlur = 0;
  if (res) {   // 続きがある時は「つづきから」を主役に
    txt(ja ? 'つづきから' : 'CONTINUE', W / 2, by + h1 * 0.38, { size: 19 * UI, weight: 800, color: '#20180a', family: FONT_DISPLAY });
    txt(ja ? `ステージ ${res + 1}  ${STAGES[res].emoji} ${STAGES[res].name}` : `Stage ${res + 1}  ${STAGES[res].emoji} ${STAGES[res].en}`,
      W / 2, by + h1 * 0.73, { size: 10.5 * UI, weight: 600, color: 'rgba(32,24,10,0.75)', maxW: bw - 20 * UI });
  } else {
    txt(t('start_short'), W / 2, by + h1 / 2, { size: 21 * UI, weight: 800, color: '#20180a', family: FONT_DISPLAY });
  }
  ctx.restore();
  game.menuBtns.push({ id: res ? 'continue' : 'start', x: bx, y: by, w: bw, h: h1 });
  by += h1 + gap;

  // 副: エンドレス / デイリー
  const half = (bw - 9 * UI) / 2;
  if (game.aiLoading) drawBtn('none', bx, by, bw, h2, t('ai_generating'), COL.violet, true, true);
  else drawBtnSub('ai', bx, by, bw, h2, t('endless_ai'), t('endless_sub'), COL.violet, '♾️');
  by += h2 + gap;
  const halfB = (bw - 9 * UI) / 2;
  drawBtnSub('coop', bx, by, halfB, h3, t('coop'), t('coop_sub'), COL.mint, '👥');
  // キャラクター選択(いま選んでいるキャラを見せる)
  const myc = Save.char();
  surface(bx + halfB + 9 * UI, by, halfB, h3, { r: 14, fill: 'rgba(13,19,40,0.82)', border: myc.col, lw: 2 });
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(20 * UI)}px serif`;
  ctx.fillText(myc.emoji, bx + halfB + 9 * UI + halfB / 2 - 26 * UI, by + h3 * 0.42);
  txt(ja ? 'キャラ' : 'FIGHTER', bx + halfB + 9 * UI + halfB / 2 + 12 * UI, by + h3 * 0.37, { size: 13 * UI, weight: 700, color: myc.col, maxW: halfB - 44 * UI });
  txt(ja ? myc.name : myc.en, bx + halfB + 9 * UI + halfB / 2, by + h3 * 0.74, { size: 10 * UI, weight: 500, color: COL.sub, maxW: halfB - 14 * UI });
  game.menuBtns.push({ id: 'chars', x: bx + halfB + 9 * UI, y: by, w: halfB, h: h3 });
  by += h3;

  if (streak) {
    txt(ja ? `🔥 ${Save.data.streak}日連続 — 今日プレイで継続` : `🔥 ${Save.data.streak}-day streak — play today`,
      W / 2, by + 15 * UI, { size: 11 * UI, weight: 600, color: '#ff9d3c', alpha: 0.7 + 0.3 * Math.sin(time * 4) });
  }

  // フッター: ハイスコア
  const msg = game.aiMsg && !game.aiLoading;
  txt(msg ? game.aiMsg : (ja ? 'ハイスコア' : 'HI-SCORE'), W / 2, H * 0.935,
    { size: msg ? 11.5 * UI : 9.5 * UI, weight: 500, color: msg ? '#ffcf6f' : COL.mute, track: msg ? 0 : 2 });
  if (!msg) txt(String(game.hi).padStart(7, '0'), W / 2, H * 0.968, { size: 17 * UI, weight: 700, color: COL.gold });
}
// アイコン+ラベル(上)とサブ説明(下)の2段ボタン
// 2段ボタン(見出し + 意味の説明)。枠は 2px の実線でクッキリ。
// icon は絵文字。文字と別フォントで測って「アイコン+文字」をひと塊で中央に置く。
//   (絵文字を同じ文字列に混ぜると、絵文字の送り幅と実際の描画幅がずれて
//    見た目が中央からずれる。日本語ラベルで特に目立った。)
function drawBtnSub(id, x, y, w, h, main, sub, color, icon) {
  surface(x, y, w, h, { r: 14, fill: 'rgba(13,19,40,0.82)', border: color, lw: 2 });
  const pad = 14 * UI, cx = x + w / 2, ty = y + h * 0.37;
  if (icon) {
    const fs = 14.5 * UI, is = 15 * UI, gap = 6 * UI;
    f(fs, 700);
    const tw = ctx.measureText(main).width;
    const total = is + gap + tw;
    const left = cx - total / 2;
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(is)}px serif`; ctx.fillStyle = '#fff';
    ctx.fillText(icon, left, ty);
    ctx.restore();
    txt(main, left + is + gap, ty, { size: fs, weight: 700, color, align: 'left' });
  } else {
    txt(main, cx, ty, { size: 14.5 * UI, weight: 700, color, maxW: w - pad });
  }
  txt(sub, cx, y + h * 0.71, { size: 10 * UI, weight: 500, color: COL.sub, maxW: w - pad });
  game.menuBtns.push({ id, x, y, w, h });
}
function drawBtn(id, x, y, w, h, text, color, glow, spinner = false, fs = 15 * UI) {
  surface(x, y, w, h, { r: 14, fill: 'rgba(13,19,40,0.82)', border: color, lw: glow ? 2.5 : 2 });
  if (spinner) {
    const a = performance.now() * 0.005;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.arc(x + 28, y + h / 2, 10, a, a + Math.PI * 1.4); ctx.stroke();
    ctx.restore();
    txt(text, x + w / 2 + 12, y + h / 2, { size: 13 * UI, weight: 600, color, maxW: w - 56 * UI });
  } else {
    txt(text, x + w / 2, y + h / 2, { size: fs, weight: 700, color, maxW: w - 16 * UI });
  }
  if (id !== 'none') game.menuBtns.push({ id, x, y, w, h });
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// === キャラクター選択(スマブラ方式) ===
function drawCharSelect() {
  const time = game.titleAnim, ja = getLang() === 'ja';
  nightSky('#0a0718', '#1d1436');
  for (const s of game.stars) { ctx.fillStyle = `rgba(255,255,255,${(s.b * 0.45).toFixed(2)})`; ctx.fillRect(s.x, s.y, s.size, s.size); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  txt(ja ? 'キャラクターをえらぶ' : 'CHOOSE YOUR FIGHTER', W / 2, H * 0.085,
    { size: 18 * UI, weight: 800, color: COL.gold, family: FONT_DISPLAY, maxW: W * 0.9 });

  game.menuBtns = [];
  const cur = Save.charIndex();
  const cols = 3, gap = 9 * UI;
  const gw = Math.min(W * 0.88, 340), gx = (W - gw) / 2;
  const cw = (gw - gap * (cols - 1)) / cols, chh = cw * 1.02;
  const gy = H * 0.16;
  CHARS.forEach((c, i) => {
    const x = gx + (i % cols) * (cw + gap), y = gy + Math.floor(i / cols) * (chh + gap);
    const sel = i === cur;
    surface(x, y, cw, chh, { r: 14, fill: sel ? c.col : 'rgba(13,19,40,0.82)', border: sel ? '#ffffff' : 'rgba(255,255,255,0.18)', lw: sel ? 3 : 2 });
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(cw * 0.42)}px serif`;
    ctx.fillText(c.emoji, x + cw / 2, y + chh * 0.42);
    txt(ja ? c.name : c.en, x + cw / 2, y + chh * 0.79, { size: 10.5 * UI, weight: 700, color: sel ? '#141018' : '#e6efff', maxW: cw - 8 });
    game.menuBtns.push({ id: 'char' + i, x, y, w: cw, h: chh });
  });

  // 選択中キャラの説明
  const c = CHARS[cur];
  const iy = gy + Math.ceil(CHARS.length / cols) * (chh + gap) + 16 * UI;
  txt(ja ? c.name : c.en, W / 2, iy, { size: 17 * UI, weight: 800, color: c.col, family: FONT_DISPLAY });
  txt(ja ? c.tag : c.tagEn, W / 2, iy + 24 * UI, { size: 12 * UI, weight: 600, color: COL.sub, maxW: W * 0.86 });

  const bw = Math.min(W * 0.82, 348), bx = (W - bw) / 2;
  let by = Math.min(H * 0.78, iy + 44 * UI);
  const pulse = 1 + Math.sin(time * 3) * 0.01;
  ctx.save(); ctx.translate(W / 2, by + 28 * UI); ctx.scale(pulse, pulse); ctx.translate(-W / 2, -(by + 28 * UI));
  const gg = ctx.createLinearGradient(0, by, 0, by + 56 * UI);
  gg.addColorStop(0, '#ffdf6b'); gg.addColorStop(1, '#f5b429');
  surface(bx, by, bw, 56 * UI, { r: 16, fill: gg, border: null });
  txt(ja ? 'これでいく' : 'READY', W / 2, by + 28 * UI, { size: 19 * UI, weight: 800, color: '#20180a', family: FONT_DISPLAY });
  ctx.restore();
  game.menuBtns.push({ id: 'charOk', x: bx, y: by, w: bw, h: 56 * UI });
  by += 56 * UI + 10 * UI;
  drawBtn('charBack', bx, by, bw, 40 * UI, ja ? '戻る' : 'Back', '#61748f');
}

// QR をキャンバスに描く(外部ライブラリなし)
let qrCache = { text: '', m: null };
function drawQR(text, cx, cy, box) {
  if (qrCache.text !== text) qrCache = { text, m: qrMatrix(text) };
  const m = qrCache.m;
  if (!m) return false;
  const quiet = 2, total = m.size + quiet * 2;
  const px = Math.max(1, Math.floor(box / total));
  const size = px * total, x0 = Math.round(cx - size / 2), y0 = Math.round(cy - size / 2);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  roundPath(x0 - 4, y0 - 4, size + 8, size + 8, 10); ctx.fill();
  ctx.fillStyle = '#0a0f1e';
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.modules[y * m.size + x]) ctx.fillRect(x0 + (x + quiet) * px, y0 + (y + quiet) * px, px, px);
    }
  }
  ctx.restore();
  return true;
}

// === ふたりでプレイ: ロビー ===
function drawCoopLobby() {
  const time = game.titleAnim, ja = getLang() === 'ja';
  nightSky('#04140f', '#0a2038');
  for (const s of game.stars) { ctx.fillStyle = `rgba(255,255,255,${(s.b * 0.5).toFixed(2)})`; ctx.fillRect(s.x, s.y, s.size, s.size); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const host = Coop.role === 'host';
  const joining = Coop.joinOpen;   // 合言葉フォーム表示中は QR/コードを隠す

  txt(t('coop'), W / 2, H * 0.085, { size: 21 * UI, weight: 800, color: COL.mint, family: FONT_DISPLAY });
  txt(ja ? 'リアルタイムで一緒に戦う' : 'Fight together in real time', W / 2, H * 0.122, { size: 11 * UI, weight: 500, color: COL.mute });

  game.menuBtns = [];
  const bw = Math.min(W * 0.82, 348), bx = (W - bw) / 2;

  if (host && !joining) {
    // QR(かざすだけ) + あいことば
    const joinUrl = Coop.inviteUrl();
    const box = Math.min(W * 0.40, 142 * UI);
    const qy = H * 0.255;
    const ok = drawQR(joinUrl, W / 2, qy, box);
    if (!ok) txt('QR --', W / 2, qy, { size: 12 * UI, color: COL.mute });
    txt(ja ? 'カメラでかざすだけ' : 'SCAN TO JOIN', W / 2, qy + box / 2 + 18 * UI,
      { size: 9.5 * UI, weight: 600, color: COL.mint, track: 1.8 });

    const cy2 = H * 0.455;
    txt(ja ? 'または あいことば' : 'OR ENTER CODE', W / 2, cy2 - 20 * UI, { size: 9.5 * UI, weight: 600, color: COL.mute, track: 1.8 });
    txt(Coop.code || '------', W / 2, cy2 + 10 * UI, { size: 32 * UI, weight: 800, color: '#fff', track: 5 * UI });

    // 遊ぶ面
    const half = (bw - 9 * UI) / 2, my = H * 0.525;
    const chip = (id, x, tx, sel, col) => {
      surface(x, my, half, 36 * UI, { r: 12, fill: sel ? col : 'rgba(13,19,40,0.82)', border: sel ? col : 'rgba(255,255,255,0.16)', lw: 2 });
      txt(tx, x + half / 2, my + 18 * UI, { size: 11.5 * UI, weight: 700, color: sel ? '#0c1a16' : COL.sub });
      game.menuBtns.push({ id, x, y: my, w: half, h: 36 * UI });
    };
    chip('coopModeStory', bx, ja ? 'オリジナル' : 'Original', Coop.mode === 'story', COL.sky);
    chip('coopModeAi', bx + half + 9 * UI, ja ? 'AI生成' : 'AI stage', Coop.mode === 'ai', COL.violet);
  } else if (!joining) {
    txt(ja ? 'あいことば' : 'ROOM CODE', W / 2, H * 0.30, { size: 9.5 * UI, weight: 600, color: COL.mute, track: 1.8 });
    txt(Coop.code || '------', W / 2, H * 0.36, { size: 38 * UI, weight: 800, color: '#fff', track: 5 * UI });
  }

  if (joining) return;   // 以降はHTMLフォームが担当

  // 接続ステータス
  const sy = H * 0.60;
  if (Coop.connected) {
    txt((ja ? `${Coop.partner.name} と接続` : `Connected: ${Coop.partner.name}`) + (Coop.p2p ? '  ⚡' : '  🤖'),
      W / 2, sy, { size: 13 * UI, weight: 700, color: '#7CFC00' });
  } else if (Coop.status && Coop.status !== 'connecting') {
    // 失敗の理由を具体的に出す(原因が自分で分かるように)
    const S = {
      signal_off: [ja ? '対戦サーバーが未接続です' : 'Play server not connected',
        ja ? 'Vercel に Upstash Redis を接続 → 再デプロイ' : 'Connect Upstash Redis on Vercel, then redeploy'],
      no_room: [ja ? 'この部屋が見つかりません' : 'Room not found',
        ja ? '相手がロビーを開き直して、新しいQRを出してもらってください' : 'Ask your friend to reopen the lobby for a fresh QR'],
      timeout: [ja ? '時間内に相手が来ませんでした' : 'Nobody joined in time',
        ja ? '「もう一度つなぐ」で新しい部屋を作れます' : 'Reconnect to open a fresh room'],
      p2p_failed: [ja ? '直接つながれませんでした' : "Couldn't link the devices",
        ja ? '同じWi-Fiに繋ぐと成功しやすくなります' : 'Try putting both phones on the same Wi-Fi'],
      closed: [ja ? '接続が切れました' : 'Connection lost', ja ? 'もう一度つないでください' : 'Please reconnect'],
    }[Coop.status] || [ja ? '接続できませんでした' : 'Connection failed', ja ? 'もう一度お試しください' : 'Please try again'];
    txt(S[0], W / 2, sy - 8 * UI, { size: 11.5 * UI, weight: 700, color: '#ffb37f', maxW: bw });
    txt(S[1], W / 2, sy + 9 * UI, { size: 9.5 * UI, weight: 500, color: COL.mute, maxW: bw });
  } else {
    txt(host ? (ja ? '相方の参加を待っています…' : 'waiting for your partner…')
      : (ja ? 'ホストに接続中…' : 'connecting to host…'), W / 2, sy,
      { size: 11.5 * UI, weight: 500, color: COL.gold, alpha: 0.55 + 0.45 * Math.sin(time * 4) });
  }

  let by = H * 0.645;
  const bh = 44 * UI, gap = 8 * UI;
  if (Coop.connected) {
    // つながったら「どちらの端末でも」開始できる(ホスト待ちで詰まらない)
    drawBtn('coopStart', bx, by, bw, 52 * UI, ja ? 'いっしょにスタート' : 'START TOGETHER', '#ffffff', true, false, 18 * UI);
    by += 52 * UI + gap;
    if (!host) txt(ja ? 'どちらが押してもふたり同時に始まります' : 'either player can start', W / 2, by + 2 * UI,
      { size: 9.5 * UI, weight: 500, color: COL.mute, maxW: bw });
    if (!host) by += 16 * UI;
  } else if (host) {
    const broke = Coop.status && Coop.status !== 'connecting';
    if (broke) { drawBtn('coopRetry', bx, by, bw, bh, ja ? '🔄 新しい部屋を作る' : '🔄 Open a fresh room', COL.gold); by += bh + gap; }
    else { drawBtn('coopLink', bx, by, bw, bh, ja ? '🔗 リンクを友達に送る' : '🔗 Send invite link', COL.mint); by += bh + gap; }
    drawBtn('coopEnter', bx, by, bw, bh, ja ? '🔑 友達の部屋に入る' : "🔑 Join a friend's room", COL.gold); by += bh + gap;
  } else {
    // ゲストが繋がらない時に手詰まりにならないよう、必ず次の手を出す
    drawBtn('coopRetry', bx, by, bw, bh, ja ? '🔄 もう一度つなぐ' : '🔄 Reconnect', COL.gold); by += bh + gap;
  }
  drawBtn('coopBack', bx, by, bw, 40 * UI, ja ? '戻る' : 'Back', '#61748f');
}

// === ふたりでプレイ: 相方の機体(自分の画面に相方が飛ぶ) ===
let pShots = [], pShotT = 0, pLastT = 0;
function drawPartner() {
  if (!game.coop || !Coop.partnerFresh()) return;   // 情報が途絶えたら描かない(幽霊機防止)
  const p = Coop.partner;
  const now = performance.now();
  const dt = Math.min(0.05, (now - (pLastT || now)) / 1000); pLastT = now;
  const px = p.x * W, py = p.y * H;
  const a = Math.atan2(dirDef().fy, dirDef().fx);
  const pch = CHARS[p.char] || CHARS[0];
  // 倒れている間は機体を消し、復活待ちの印だけ出す(撃ち続ける幽霊機をなくす)
  if (!p.alive) {
    pShots = [];
    ctx.save(); ctx.globalAlpha = 0.5 + 0.3 * Math.sin(now * 0.006);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(20 * UI)}px serif`; ctx.fillText('💫', px, py);
    ctx.restore();
    txt(p.name, px, py - 26 * UI, { size: 9 * UI, weight: 600, color: '#8899aa', shadow: 0.8 });
    return;
  }
  // 相方の弾(コスメ・当たり判定なし。撃ってる感を出す)
  pShotT -= dt;
  if (p.firing && p.alive && pShotT <= 0) {
    pShotT = 0.13;
    pShots.push({ x: px + Math.cos(a) * 22, y: py + Math.sin(a) * 22, born: now });
  }
  pShots = pShots.filter(s => now - s.born < 1000);
  for (const s of pShots) {
    const d = (now - s.born) / 1000 * 540;
    const bx = s.x + Math.cos(a) * d, byy = s.y + Math.sin(a) * d;
    ctx.fillStyle = pch.shot + '66'; ctx.beginPath(); ctx.arc(bx, byy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(bx, byy, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  // 相方の機体は「相方が選んだキャラ」で描く → 両方の画面で同じ姿に見える
  ctx.save(); ctx.translate(px, py);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = pch.col; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(26 * UI)}px serif`; ctx.fillText(pch.emoji, 0, 0);
  ctx.restore();
  txt(p.name, px, py - 26 * UI, { size: 9 * UI, weight: 600, color: pch.col, shadow: 0.8 });
}

// === 2人共闘: プレイ中の相方パネル ===
function drawCoopHud() {
  const c = Coop, ja = getLang() === 'ja';
  const x = W - 12 * UI, y = 60 * UI;
  const face = c.partner.alive ? '🧑‍🚀' : '💫';
  label(`${face} ${c.partner.name}`, x, y, c.partner.alive ? '#4ad6a0' : '#8899aa', 12 * UI, 'right');
  label(String(c.partner.score).padStart(6, '0'), x, y + 16 * UI, '#cfe8ff', 12 * UI, 'right');
  if (c.bossSharedMax > 0 && game.bossActive) {
    const tot = Math.max(1, c.localDmg + c.partner.dmg);
    label((ja ? '👥 貢献 ' : '👥 ') + `${Math.round(c.localDmg / tot * 100)}% : ${Math.round(c.partner.dmg / tot * 100)}%`, x, y + 32 * UI, '#ffd27f', 11 * UI, 'right');
  }
}

function drawIntro() {
  const st = stage(), d = dirDef();
  const tt = 1 - game.introT / 2400;
  drawBackground();
  ctx.fillStyle = 'rgba(0,0,10,0.55)'; ctx.fillRect(0, 0, W, H);
  const slide = tt < 0.2 ? (0.2 - tt) * 5 * 60 : 0;
  label(game.aiMode ? '✨ AI STAGE ✨' : (t('stage') + ' ' + (game.stageIndex + 1)), W / 2, H * 0.30 - slide, '#8fd3ff', 14 * UI);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.round(56 * UI)}px serif`;
  ctx.fillText(st.emoji, W / 2, H * 0.42 - slide);
  label(st.name, W / 2, H * 0.52 - slide, '#ffffff', 22 * UI);
  label(st.en, W / 2, H * 0.565 - slide, '#aab', 11 * UI);
  const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.18;
  ctx.save(); ctx.translate(W / 2, H * 0.69); ctx.scale(pulse, pulse);
  ctx.font = `${Math.round(46 * UI)}px serif`; ctx.fillText(d.arrow, 0, 0); ctx.restore();
  label(t('dir_' + st.dir), W / 2, H * 0.77, '#ffd700', 14 * UI);
}

function drawClear() {
  drawBackground(); drawParticles();
  ctx.fillStyle = 'rgba(0,0,10,0.5)'; ctx.fillRect(0, 0, W, H);
  label(t('stage_clear'), W / 2, H * 0.40, '#ffd700', 26 * UI);
  label(t('score') + ' ' + game.score, W / 2, H * 0.50, '#fff', 14 * UI);
  const next = game.stages[game.stageIndex + 1];
  if (next) label(`${t('next')}: ${next.emoji} ${next.name}`, W / 2, H * 0.58, '#8fd3ff', 12 * UI);
}

function drawPause() {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  label(t('paused'), W / 2, H * 0.45, '#fff', 26 * UI);
  label(t('resume'), W / 2, H * 0.53, '#8fd3ff', 12 * UI);
}

function drawFinale() {
  const F = game.finale; if (!F) return;
  const ja = getLang() === 'ja';
  const k = clamp(F.t / F.dur, 0, 1);
  ctx.save(); ctx.translate(game.shakeX, game.shakeY);
  drawBackground();
  // 回転しながら崩れ落ちて消えるボス
  ctx.save(); ctx.translate(F.bx, F.by); ctx.rotate(k * 7); ctx.scale(1 + k * 1.6, 1 + k * 1.6);
  ctx.globalAlpha = clamp(1 - k * 1.15, 0, 1);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '72px serif'; ctx.fillText(F.emoji, 0, 0);
  ctx.globalAlpha = 1; ctx.restore();
  drawParticles();
  ctx.restore();
  // 大きなクリア文字(バウンドイン)
  const pop = Math.min(1, F.t / 400);
  const s = 1 + (1 - pop) * 0.7 + Math.sin(F.t * 0.012) * 0.03;
  const title = F.kind === 'victory' ? (ja ? '勝  利!' : 'VICTORY!')
    : F.kind === 'coop' ? (ja ? '共闘クリア!' : 'CO-OP CLEAR!')
      : F.kind === 'world' ? `WORLD ${game.world - 1} ${ja ? '突破!' : 'CLEAR!'}`
        : (ja ? 'ステージクリア!' : 'STAGE CLEAR!');
  const gold = F.kind === 'victory' || F.kind === 'coop';
  ctx.save(); ctx.translate(W / 2, H * 0.40); ctx.scale(s, s);
  label(title, 0, 0, gold ? '#ffd700' : '#8fff9d', 36 * UI);
  ctx.restore();
  if (F.t > 500) label(`+${F.bonus}`, W / 2, H * 0.40 + 42 * UI, '#ffe14d', 20 * UI);
  if (F.kind === 'victory' && F.t > 900) label(ja ? '✨ 全ステージ制覇 ✨' : '✨ ALL STAGES CLEAR ✨', W / 2, H * 0.40 + 72 * UI, '#b98cff', 14 * UI);
  if (F.kind === 'coop' && F.t > 900) label(ja ? `👥 ${Coop.partner.name} と一緒に撃破!` : `👥 Beaten with ${Coop.partner.name}!`, W / 2, H * 0.40 + 72 * UI, '#4ad6a0', 14 * UI);
  if (game.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${clamp(game.flash, 0, 0.85)})`; ctx.fillRect(0, 0, W, H); }
}

function drawGameOver() {
  ctx.fillStyle = 'rgba(0,0,0,0.74)'; ctx.fillRect(0, 0, W, H);
  label(t('game_over'), W / 2, H * 0.20, '#ff3030', 30 * UI);
  const r = game.lastResult;
  if (r && (game.endless)) label(`${t('world')} ${r.world}`, W / 2, H * 0.28, '#b98cff', 17 * UI);
  label(t('score') + ' ' + game.score, W / 2, H * 0.345, '#fff', 16 * UI);
  if (game.score >= game.hi && game.score > 0) label(t('new_record'), W / 2, H * 0.40, '#ffd700', 13 * UI);
  if (game.skinFlash > 0) label(t('new_skin') + ' ' + Save.currentSkin().name, W / 2, H * 0.44, '#7CFC00', 13 * UI);
  game.overBtns = [];
  const bw = Math.min(W * 0.74, 330), bh = 48 * UI, bx = W / 2 - bw / 2, gap = 13 * UI;
  let by = H * 0.50;
  if (game.continues > 0) { overBtn('continue', bx, by, bw, bh, `${t('continue')} (${t('remain')} ${game.continues})`, '#00cc88'); by += bh + gap; }
  overBtn('share', bx, by, bw, bh, t('share'), '#ff8bd0'); by += bh + gap;
  overBtn('retry', bx, by, bw, bh, t('retry'), '#8fd3ff'); by += bh + gap;
  overBtn('title', bx, by, bw, bh, t('to_title'), '#5577aa');
}
function overBtn(id, x, y, w, h, text, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 2; roundRect(x, y, w, h, 12); ctx.stroke();
  label(text, x + w / 2, y + h / 2, color, 14 * UI);
  game.overBtns.push({ id, x, y, w, h });
}

function drawVictory() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0a2a'); grad.addColorStop(1, '#3d1d6b');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  drawParticles();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.round(52 * UI)}px serif`;
  ctx.fillText(game.coop ? '👥' : '🏆', W / 2, H * 0.24);
  const jaV = getLang() === 'ja';
  const vTitle = game.coop ? (jaV ? `${Coop.partner.name} と共闘クリア!` : `Co-op clear with ${Coop.partner.name}!`)
    : game.aiMode ? t('ai_clear')
      : (jaV ? `第${(game.chapter | 0) + 1}章 制覇!` : `CHAPTER ${(game.chapter | 0) + 1} CONQUERED!`);
  label(vTitle, W / 2, H * 0.35, '#ffd700', game.coop ? 18 * UI : 22 * UI);
  if (!game.coop && !game.aiMode) {
    label(jaV ? `▶ 第${(game.chapter | 0) + 2}章 が開放されました` : `▶ Chapter ${(game.chapter | 0) + 2} unlocked`,
      W / 2, H * 0.40, '#7CFC00', 13 * UI);
  }
  label(t('final_score') + ' ' + game.score, W / 2, H * 0.45, '#fff', 14 * UI);
  const rank = game.score >= 180000 ? 'S' : game.score >= 120000 ? 'A' : game.score >= 70000 ? 'B' : 'C';
  label(t('rank') + ' ' + rank, W / 2, H * 0.55, { S: '#ffd700', A: '#ff66aa', B: '#8fd3ff', C: '#99cc99' }[rank], 38 * UI);
  const acc = game.stats.shots ? Math.round(game.stats.hits / game.stats.shots * 100) : 0;
  label(`${t('kills')} ${game.stats.kills}   ${t('accuracy')} ${acc}%   ${t('hits_taken')} ${game.stats.deathTimes.length}`, W / 2, H * 0.62, '#aab', 12 * UI);
  game.overBtns = [];
  const bw = Math.min(W * 0.7, 320), bh = 48 * UI, bx = W / 2 - bw / 2, gap = 13 * UI;
  let by = H * 0.70;
  overBtn('share', bx, by, bw, bh, t('share'), '#ff8bd0'); by += bh + gap;
  overBtn('title', bx, by, bw, bh, t('to_title'), '#5577aa');
}

// === メイン描画 ===
export function draw() {
  ctx.clearRect(0, 0, W, H);
  tickTint();
  switch (game.state) {
    case 'splash': drawSplash(); break;
    case 'title': drawTitle(); break;
    case 'coop': drawCoopLobby(); break;
    case 'chars': drawCharSelect(); break;
    case 'intro': drawIntro(); break;
    case 'play': case 'warn': {
      ctx.save(); ctx.translate(game.shakeX, game.shakeY);
      drawBackground(); drawWeatherFx(); drawBells(); drawEnemies(); drawBoss();
      drawBullets(); drawPartner(); drawPlayer(); drawParticles(); drawFog(); drawPopups();
      ctx.restore();
      drawHUD();
      if (game.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${clamp(game.flash, 0, 0.85)})`; ctx.fillRect(0, 0, W, H); }
      break;
    }
    case 'finale': drawFinale(); break;
    case 'clear': drawClear(); break;
    case 'pause':
      ctx.save(); drawBackground(); drawBells(); drawEnemies(); drawBoss(); drawBullets(); drawPlayer(); ctx.restore();
      drawHUD(); drawPause(); break;
    case 'over': drawBackground(); drawParticles(); drawGameOver(); break;
    case 'victory': drawVictory(); break;
  }
}
