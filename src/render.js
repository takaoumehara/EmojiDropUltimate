// ============================================================
// render.js — 描画(読みやすさ優先: 大きめ・視認性の高いサンセリフ)
// ============================================================
import { BELLS, clamp, stageTint } from './config.js';
import { W, H, ctx, UI } from './env.js';
import { game } from './state.js';
import { stage, dirDef } from './geo.js';
import { t, getLang } from './i18n.js';
import { Weather } from './weather.js';
import { Director } from './director.js';
import { BossAI } from './bossai.js';
import { Save } from './save.js';
import { Coop } from './coop.js';

// 読みやすいサンセリフ(ピクセルフォントは小サイズで潰れるため不使用)
const SANS = `'Baloo 2', 'M PLUS Rounded 1c', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif`;
function f(size, weight = 800) { ctx.font = `${weight} ${Math.round(size)}px ${SANS}`; }
// 縁取り付きテキスト(暗い背景でも明るい背景でも読める)
function label(text, x, y, color, size, align = 'center', weight = 800) {
  f(size, weight);
  ctx.textAlign = align;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.16);
  ctx.strokeStyle = 'rgba(0,0,0,0.72)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
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
  const starAlpha = Weather.mods.night || game.stageIndex >= 4 ? 1 : 0.4;
  for (const s of game.stars) {
    const tw = 0.5 + 0.5 * Math.sin(performance.now() * 0.003 + s.x);
    ctx.fillStyle = `rgba(255,255,255,${(s.b * tw * starAlpha).toFixed(3)})`;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const fl of game.bgFloats) {
    ctx.globalAlpha = fl.alpha; ctx.font = `${Math.round(fl.size * UI)}px serif`;
    ctx.fillText(fl.emoji, fl.x, fl.y);
  }
  ctx.globalAlpha = 1;
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
  const shipCol = rgbCss(curShip || [127, 208, 255]);
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(dirDef().fy, dirDef().fx) + Math.PI / 2);
  // テーマ連動のエンジン光(自機がステージに馴染む)
  ctx.globalAlpha = 0.16 + 0.05 * Math.sin(performance.now() * 0.006);
  ctx.fillStyle = shipCol; ctx.beginPath(); ctx.arc(0, 2, 17, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  const th = 9 + Math.sin(p.anim) * 4;
  const tg = ctx.createLinearGradient(0, 13, 0, 13 + th);
  tg.addColorStop(0, '#fff'); tg.addColorStop(0.35, shipCol); tg.addColorStop(1, 'rgba(0,0,0,0)');
  const sk = Save.currentSkin();
  ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-5, 13); ctx.lineTo(5, 13); ctx.lineTo(1, 13 + th); ctx.lineTo(-1, 13 + th); ctx.fill();
  ctx.fillStyle = sk.body; ctx.fillRect(-6, -4, 12, 18);
  ctx.fillStyle = sk.body2; ctx.fillRect(-4, -2, 8, 14);
  ctx.fillStyle = sk.nose; ctx.fillRect(-3, -15, 6, 13);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-2, -13, 4, 11);
  ctx.fillStyle = sk.wing; ctx.fillRect(-17, 4, 11, 8); ctx.fillRect(6, 4, 11, 8);
  ctx.fillStyle = '#00ffaa'; ctx.fillRect(-2, -8, 4, 6);
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
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = b.opt ? 'rgba(185,103,255,0.45)' : shotGlow; ctx.fillRect(-2.5, 0, 5, 12);
    ctx.fillStyle = b.opt ? '#e3c8ff' : shot; ctx.fillRect(-2, -5, 4, 9);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-1, -5, 2, 7);
    ctx.restore();
  }
  for (const b of game.eBullets) {
    const s = b.size, col = b.col || (b.boss ? '#ff4646' : '#ffaa00');
    ctx.fillStyle = col + '55'; ctx.beginPath(); ctx.arc(b.x, b.y, s + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, s * 0.42, 0, Math.PI * 2); ctx.fill();
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
  ctx.save(); ctx.translate(b.x, b.y);
  const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.06; ctx.scale(pulse, pulse);
  const aura = ['rgba(255,255,255,0.2)', 'rgba(255,170,0,0.28)', 'rgba(255,30,30,0.35)'][b.phase];
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
  const pad = 12 * UI, top = 16 * UI;
  ctx.textBaseline = 'top';
  label(String(game.score).padStart(7, '0'), pad, top, '#fff', 18 * UI, 'left');
  if (game.comboMul > 1 && performance.now() - game.lastKill < 2000) {
    label(`${t('combo')} x${game.comboMul}`, W / 2, top + 4 * UI, '#ff8844', 17 * UI, 'center');
  }
  const p = game.player;
  ctx.font = `${Math.round(19 * UI)}px serif`; ctx.textAlign = 'left';
  ctx.fillText('❤️'.repeat(Math.max(0, game.lives)) + ' ' + '💣'.repeat(game.bombs), pad, H - 52 * UI);
  label(`PW${p.power}${p.options ? ' OP' + p.options : ''}${p.shield ? ' 🛡' : ''}${p.boost ? ' 💨' : ''}`, pad, H - 26 * UI, '#8fd3ff', 12 * UI, 'left');
  const slabel = game.coop ? '👥' : game.endless ? ('W' + game.world) : game.daily ? 'DAILY' : game.aiMode ? 'AI' : ('' + (game.stageIndex + 1));
  label(`${slabel} ${stage().emoji}${dirDef().arrow}`, W - pad, H - 28 * UI, '#fff', 12 * UI, 'right');
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
  if (game.stageIndex === 0 && game.stageTime < 5200 && game.state === 'play') {
    ctx.globalAlpha = clamp((5200 - game.stageTime) / 1000, 0, 0.9);
    label(t('hint_move'), W / 2, H - 118 * UI, '#fff', 12 * UI);
    label(t('hint_bomb'), W / 2, H - 100 * UI, '#fff', 12 * UI);
    ctx.globalAlpha = 1;
  }
}

// === スプラッシュ(起動演出 → 数秒でタイトルへ。タップでスキップ) ===
function drawSplash() {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#06061c'); grad.addColorStop(1, '#1a0f3d');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  for (const s of game.stars) { ctx.fillStyle = `rgba(255,255,255,${(s.b * 0.5).toFixed(2)})`; ctx.fillRect(s.x, s.y, s.size, s.size); }
  const k = clamp(1 - game.splashT / 1800, 0, 1);          // 0→1 進行
  const ein = 1 - Math.pow(1 - Math.min(1, k * 2.2), 3);   // ease-out(前半で完了)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save(); ctx.translate(W / 2, H * 0.42); ctx.scale(0.86 + ein * 0.14, 0.86 + ein * 0.14);
  ctx.globalAlpha = ein;
  ctx.font = `${Math.round(58 * UI)}px serif`; ctx.fillText('🚀', 0, -64 * UI);
  label('EMOJI DROP', 0, 0, '#ffffff', 38 * UI);
  label('— U L T I M A T E —', 0, 34 * UI, '#ffd700', 13 * UI);
  ctx.restore();
  if (k > 0.45) {
    ctx.globalAlpha = clamp((k - 0.45) * 3, 0, 0.7);
    label(getLang() === 'ja' ? 'タップでスキップ' : 'tap to skip', W / 2, H * 0.88, '#8fa3c8', 11 * UI);
  }
  ctx.globalAlpha = 1;
}

// === タイトル(メニューボタン付き) ===
function drawTitle() {
  const time = game.titleAnim;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a0a2a'); grad.addColorStop(1, '#20124d');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  for (const s of game.stars) {
    ctx.fillStyle = `rgba(255,255,255,${(s.b * (0.5 + 0.5 * Math.sin(time * 2 + s.x))).toFixed(3)})`;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cy = H * 0.155;
  const emojis = ['🚀', '🐦', '🐙', '👾', '🐉', '🛸'];
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(26 * UI)}px serif`;
  emojis.forEach((e, i) => ctx.fillText(e, W / 2 + (i - 2.5) * 42 * UI, cy - 56 * UI + Math.sin(time * 3 + i * 1.1) * 8));
  const hue = (time * 40) % 360;
  label('EMOJI DROP', W / 2, cy, `hsl(${hue},90%,66%)`, 36 * UI);
  label('— U L T I M A T E —', W / 2, cy + 34 * UI, '#ffd700', 13 * UI);

  const ja = getLang() === 'ja';
  // 天気(1行+説明。中央寄せでコンパクトに)
  const wy = cy + 66 * UI;
  if (Weather.loaded) {
    label(`📍 ${Weather.place}   ${Weather.icon()} ${Weather.conditionLabel()} ${Math.round(Weather.temp)}°C`, W / 2, wy, '#dcebff', 13 * UI);
    label(`🎨 ${t('weather_scene')}`, W / 2, wy + 20 * UI, '#93c9a8', 11 * UI);
  } else {
    label(`📡 ${Weather.failed ? (ja ? '天気オフライン' : 'weather offline') : t('locating')}`, W / 2, wy + 10 * UI, '#9fb6d8', 12 * UI);
  }

  // === メニュー: 画面に必ず収まるよう高さを自動調整 ===
  game.menuBtns = [];
  const bw = Math.min(W * 0.8, 340), bx = (W - bw) / 2;
  const streak = Save.streakAtRisk();
  let h1 = 62 * UI, h2 = 56 * UI, h3 = 50 * UI, gap = 12 * UI;
  let top = wy + 40 * UI;
  const avail = H * 0.87 - top;
  const need = h1 + gap + h2 + gap + h3 + (streak ? 24 * UI : 0);
  if (need > avail) { const f = avail / need; h1 *= f; h2 *= f; h3 *= f; gap *= f; }
  else top += (avail - need) * 0.34; // 背の高い画面では中央寄りに(親指も届きやすい)
  let by = top;
  // ▶ スタート(主役: ゴールドの塗りボタン)
  const pulse = 1 + Math.sin(time * 3.2) * 0.012;
  ctx.save(); ctx.translate(W / 2, by + h1 / 2); ctx.scale(pulse, pulse); ctx.translate(-W / 2, -(by + h1 / 2));
  ctx.fillStyle = '#ffd23f'; roundRect(bx, by, bw, h1, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5; roundRect(bx, by, bw, h1, 14); ctx.stroke();
  label('▶ ' + t('start_short'), W / 2, by + h1 / 2, '#231a00', 21 * UI);
  ctx.restore();
  game.menuBtns.push({ id: 'start', x: bx, y: by, w: bw, h: h1 });
  by += h1 + gap;
  // ♾️ AI無限 / 🗓 デイリー
  const half = (bw - 10 * UI) / 2;
  if (game.aiLoading) drawBtn('none', bx, by, bw, h2, t('ai_generating'), '#00ffcc', true, true);
  else {
    drawBtnSub('ai', bx, by, half, h2, t('endless_ai'), t('endless_sub'), '#b967ff');
    drawBtnSub('daily', bx + half + 10 * UI, by, half, h2, t('daily') + (Save.playedDailyToday() ? ' ✓' : ''), t('daily_sub'), '#ffd23f');
  }
  by += h2 + gap;
  // 👥 ふたりでプレイ
  drawBtnSub('coop', bx, by, bw, h3, '👥 ' + t('coop'), t('coop_sub'), '#4ad6a0');
  by += h3;

  // ストリーク催促(途切れそうな時だけ・控えめ)
  if (streak) {
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(time * 4);
    label(ja ? `🔥 ${Save.data.streak}日連続中 — 今日プレイで継続` : `🔥 ${Save.data.streak}-day streak — play today`, W / 2, by + 14 * UI, '#ff9d3c', 11.5 * UI);
    ctx.globalAlpha = 1;
  }

  // ハイスコア / 生成メッセージ
  label(game.aiMsg && !game.aiLoading ? game.aiMsg : `🏆 ${t('hiscore')} ${String(game.hi).padStart(7, '0')}`,
    W / 2, H * 0.935, game.aiMsg && !game.aiLoading ? '#ffcf6f' : '#ffd700', 13.5 * UI);
}
// アイコン+ラベル(上)とサブ説明(下)の2段ボタン
function drawBtnSub(id, x, y, w, h, main, sub, color) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,12,26,0.62)'; roundRect(x, y, w, h, 14); ctx.fill();
  ctx.globalAlpha = 0.8; ctx.strokeStyle = color; ctx.lineWidth = 1.5; roundRect(x, y, w, h, 14); ctx.stroke(); ctx.globalAlpha = 1;
  label(main, x + w / 2, y + h * 0.36, color, 14.5 * UI);
  label(sub, x + w / 2, y + h * 0.71, '#b7c4dc', 10 * UI);
  ctx.restore();
  game.menuBtns.push({ id, x, y, w, h });
}
function drawBtn(id, x, y, w, h, text, color, glow, spinner = false, fs = 15 * UI) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,12,26,0.62)'; roundRect(x, y, w, h, 14); ctx.fill();
  ctx.globalAlpha = glow ? 1 : 0.8; ctx.strokeStyle = color; ctx.lineWidth = glow ? 2.5 : 1.5; roundRect(x, y, w, h, 14); ctx.stroke(); ctx.globalAlpha = 1;
  if (spinner) {
    const a = performance.now() * 0.005;
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
    ctx.arc(x + 26, y + h / 2, 10, a, a + Math.PI * 1.4); ctx.stroke();
    label(text, x + w / 2 + 12, y + h / 2, color, 13 * UI);
  } else {
    label(text, x + w / 2, y + h / 2, color, fs);
  }
  ctx.restore();
  if (id !== 'none') game.menuBtns.push({ id, x, y, w, h });
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// === ふたりでプレイ: ロビー ===
function drawCoopLobby() {
  const time = game.titleAnim, ja = getLang() === 'ja';
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#07211c'); grad.addColorStop(1, '#0a2a4d');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  for (const s of game.stars) { ctx.fillStyle = `rgba(255,255,255,${(s.b * 0.6).toFixed(2)})`; ctx.fillRect(s.x, s.y, s.size, s.size); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const host = Coop.role === 'host';
  ctx.font = `${Math.round(36 * UI)}px serif`; ctx.fillText('👥', W / 2, H * 0.135);
  label(t('coop'), W / 2, H * 0.205, '#4ad6a0', 24 * UI);
  label(ja ? 'リアルタイムで一緒に戦う' : 'Fight together in real time', W / 2, H * 0.25, '#bfe8d8', 11.5 * UI);

  label(ja ? 'あいことば' : 'ROOM CODE', W / 2, H * 0.315, '#8fb0c8', 11.5 * UI);
  label(Coop.code || '------', W / 2, H * 0.37, '#ffffff', 42 * UI);
  label(host ? (ja ? '友達に送って「参加」で入力してもらう' : 'Send it — your friend taps Join & enters it')
    : (ja ? 'このあいことばで参加しています' : 'Joining with this code'), W / 2, H * 0.425, '#9fb6d8', 10.5 * UI);

  game.menuBtns = [];
  const bw = Math.min(W * 0.8, 340), bx = (W - bw) / 2;
  // あそぶ面(ホストが選択)
  if (host) {
    const half = (bw - 10 * UI) / 2, my = H * 0.475;
    const chip = (id, x, txt, sel, col) => {
      ctx.fillStyle = sel ? col : 'rgba(8,12,26,0.62)'; roundRect(x, my, half, 38 * UI, 12); ctx.fill();
      if (!sel) { ctx.globalAlpha = 0.6; ctx.strokeStyle = col; ctx.lineWidth = 1.5; roundRect(x, my, half, 38 * UI, 12); ctx.stroke(); ctx.globalAlpha = 1; }
      label(txt, x + half / 2, my + 19 * UI, sel ? '#10231c' : col, 12 * UI);
      game.menuBtns.push({ id, x, y: my, w: half, h: 38 * UI });
    };
    chip('coopModeStory', bx, ja ? '📖 オリジナル面' : '📖 Original', Coop.mode === 'story', '#8fd3ff');
    chip('coopModeAi', bx + half + 10 * UI, ja ? '✨ AI生成面' : '✨ AI stage', Coop.mode === 'ai', '#b967ff');
  }

  // 接続ステータス
  const sy = H * 0.575;
  if (Coop.connected) {
    label((ja ? `✅ ${Coop.partner.name} と接続中` : `✅ Connected: ${Coop.partner.name}`) + (Coop.p2p ? '  ⚡P2P' : '  🤖DEMO'), W / 2, sy, '#7CFC00', 13 * UI);
  } else if (Coop.status === 'signal_off') {
    label(ja ? '🔌 オンライン部屋は未設定(デモで体験できます)' : '🔌 Online rooms not set up (try the demo)', W / 2, sy, '#ffb37f', 11 * UI);
  } else if (Coop.status === 'failed') {
    label(ja ? '⚠ 接続できませんでした(デモで体験できます)' : '⚠ Connection failed (try the demo)', W / 2, sy, '#ff9d9d', 11 * UI);
  } else {
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 4);
    label(ja ? '📡 相方を待っています…' : '📡 waiting for your partner…', W / 2, sy, '#ffd27f', 12 * UI);
    ctx.globalAlpha = 1;
  }

  // ボタン列(必ず画面内に収まるコンパクト設計)
  let by = H * 0.625;
  const bh = 46 * UI, gap = 9 * UI;
  if (Coop.connected) {
    if (host) {
      const blink = Math.floor(time * 2) % 2 === 0;
      drawBtn('coopStart', bx, by, bw, 54 * UI, ja ? '▶ いっしょにスタート' : '▶ START TOGETHER', '#ffffff', blink, false, 19 * UI);
      by += 54 * UI + gap;
    } else {
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 4);
      label(ja ? '🕐 ホストの開始を待っています…' : '🕐 waiting for host to start…', W / 2, by + 12 * UI, '#8fd3ff', 12 * UI);
      ctx.globalAlpha = 1;
      by += 34 * UI;
    }
  } else {
    drawBtn('coopEnter', bx, by, bw, bh, ja ? '🔑 あいことばで参加する' : '🔑 Join with a code', '#ffd23f'); by += bh + gap;
    drawBtn('coopDemo', bx, by, bw, bh, ja ? '🤖 ひとりでデモを試す' : '🤖 Try the demo solo', '#4ad6a0'); by += bh + gap;
  }
  drawBtn('coopBack', bx, by, bw, 42 * UI, ja ? '← 戻る' : '← Back', '#5577aa');
}

// === ふたりでプレイ: 相方の機体(自分の画面に相方が飛ぶ) ===
let pShots = [], pShotT = 0, pLastT = 0;
function drawPartner() {
  if (!game.coop || !Coop.connected) return;
  const p = Coop.partner;
  const now = performance.now();
  const dt = Math.min(0.05, (now - (pLastT || now)) / 1000); pLastT = now;
  const px = p.x * W, py = p.y * H;
  const a = Math.atan2(dirDef().fy, dirDef().fx);
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
    ctx.fillStyle = 'rgba(255,139,208,0.4)'; ctx.beginPath(); ctx.arc(bx, byy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd7ec'; ctx.beginPath(); ctx.arc(bx, byy, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // 機体(ピンクの相方カラー・半透明で「味方」感)
  ctx.save(); ctx.translate(px, py); ctx.rotate(a + Math.PI / 2);
  ctx.globalAlpha = p.alive ? 0.92 : 0.3;
  ctx.fillStyle = 'rgba(255,139,208,0.22)'; ctx.beginPath(); ctx.arc(0, 2, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0559f'; ctx.fillRect(-6, -4, 12, 18);
  ctx.fillStyle = '#ff8bd0'; ctx.fillRect(-4, -2, 8, 14);
  ctx.fillStyle = '#fff0f8'; ctx.fillRect(-3, -15, 6, 13);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(-16, 4, 10, 7); ctx.fillRect(6, 4, 10, 7);
  ctx.restore();
  ctx.globalAlpha = 1;
  label(p.name, px, py - 32, '#ff8bd0', 9.5 * UI);
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
  label(game.coop ? (getLang() === 'ja' ? `${Coop.partner.name} と共闘クリア!` : `Co-op clear with ${Coop.partner.name}!`) : (game.aiMode ? t('ai_clear') : t('all_clear')), W / 2, H * 0.35, '#ffd700', game.coop ? 18 * UI : 24 * UI);
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
