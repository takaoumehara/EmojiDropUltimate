// ============================================================
// render.js — 描画(読みやすさ優先: 大きめ・視認性の高いサンセリフ)
// ============================================================
import { BELLS, clamp } from './config.js';
import { W, H, ctx, UI } from './env.js';
import { game } from './state.js';
import { stage, dirDef } from './geo.js';
import { t, getLang } from './i18n.js';
import { Weather } from './weather.js';
import { Director } from './director.js';
import { BossAI } from './bossai.js';
import { Save } from './save.js';

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
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(dirDef().fy, dirDef().fx) + Math.PI / 2);
  const th = 9 + Math.sin(p.anim) * 4;
  const tg = ctx.createLinearGradient(0, 13, 0, 13 + th);
  tg.addColorStop(0, '#fff'); tg.addColorStop(0.4, '#ffd400'); tg.addColorStop(1, 'rgba(255,60,0,0)');
  const sk = Save.currentSkin();
  ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-5, 13); ctx.lineTo(5, 13); ctx.lineTo(1, 13 + th); ctx.lineTo(-1, 13 + th); ctx.fill();
  ctx.fillStyle = sk.body; ctx.fillRect(-6, -4, 12, 18);
  ctx.fillStyle = sk.body2; ctx.fillRect(-4, -2, 8, 14);
  ctx.fillStyle = sk.nose; ctx.fillRect(-3, -15, 6, 13);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-2, -13, 4, 11);
  ctx.fillStyle = sk.wing; ctx.fillRect(-17, 4, 11, 8); ctx.fillRect(6, 4, 11, 8);
  ctx.fillStyle = '#00ffaa'; ctx.fillRect(-2, -8, 4, 6);
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
  for (const b of game.pBullets) {
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = b.opt ? 'rgba(185,103,255,0.45)' : 'rgba(120,210,255,0.4)'; ctx.fillRect(-2, 0, 4, 11);
    ctx.fillStyle = b.opt ? '#e3c8ff' : '#ffffff'; ctx.fillRect(-2, -5, 4, 9);
    ctx.restore();
  }
  for (const b of game.eBullets) {
    const s = b.size;
    ctx.fillStyle = b.boss ? 'rgba(255,80,80,0.3)' : 'rgba(255,190,80,0.3)'; ctx.beginPath(); ctx.arc(b.x, b.y, s + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = b.boss ? '#ff4646' : '#ffaa00'; ctx.beginPath(); ctx.arc(b.x, b.y, s, 0, Math.PI * 2); ctx.fill();
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
  label(t('hiscore') + ' ' + String(game.hi).padStart(7, '0'), pad, top + 24 * UI, '#ffd700', 11 * UI, 'left');
  if (game.comboMul > 1 && performance.now() - game.lastKill < 2000) {
    label(`${t('combo')} x${game.comboMul}`, W / 2, top + 6 * UI, '#ff8844', 18 * UI, 'center');
  }
  const p = game.player;
  ctx.font = `${Math.round(19 * UI)}px serif`; ctx.textAlign = 'left';
  ctx.fillText('❤️'.repeat(Math.max(0, game.lives)) + ' ' + '💣'.repeat(game.bombs), pad, H - 52 * UI);
  label(`PW${p.power}${p.options ? ' OP' + p.options : ''}${p.shield ? ' 🛡' : ''}${p.boost ? ' 💨' : ''}`, pad, H - 26 * UI, '#8fd3ff', 12 * UI, 'left');
  const slabel = game.endless ? ('WORLD ' + game.world) : game.daily ? 'DAILY' : game.aiMode ? 'AI' : ('STAGE ' + (game.stageIndex + 1));
  label(`${slabel} ${stage().emoji} ${dirDef().arrow}`, W - pad, H - 52 * UI, '#fff', 12 * UI, 'right');
  if (Weather.loaded) label(`${Weather.icon()} ${Math.round(Weather.temp)}°C`, W - pad, H - 28 * UI, '#cfe8ff', 12 * UI, 'right');
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
  const cy = H * 0.20;
  const emojis = ['🚀', '🐦', '🐙', '👾', '🐉', '🛸'];
  ctx.font = `${Math.round(30 * UI)}px serif`;
  emojis.forEach((e, i) => ctx.fillText(e, W / 2 + (i - 2.5) * 46 * UI, cy - 66 * UI + Math.sin(time * 3 + i * 1.1) * 10));
  const hue = (time * 40) % 360;
  label('EMOJI DROP', W / 2, cy, `hsl(${hue},90%,66%)`, 40 * UI);
  label('— U L T I M A T E —', W / 2, cy + 40 * UI, '#ffd700', 16 * UI);

  // 天気パネル
  const py = H * 0.36;
  label(t('ai_engine'), W / 2, py, '#00ffcc', 12 * UI);
  label(Weather.statusLine(), W / 2, py + 22 * UI, '#cfe8ff', 12 * UI);
  const ja = getLang() === 'ja';
  if (Weather.loaded) Weather.effects.slice(0, 3).forEach((fx, i) => label(ja ? fx.ja : fx.en, W / 2, py + (44 + i * 18) * UI, '#9fd8b0', 11 * UI));

  // メニューボタン(コンパクト)
  game.menuBtns = [];
  const bw = Math.min(W * 0.74, 348), bx = (W - bw) / 2, bh = 46 * UI, gap = 11 * UI;
  let by = H * 0.505;
  const blink = Math.floor(time * 2) % 2 === 0;
  drawBtn('start', bx, by, bw, bh, '▶ ' + t('start_short'), '#ffffff', blink); by += bh + gap;
  if (game.aiLoading) { drawBtn('none', bx, by, bw, bh, t('ai_generating'), '#00ffcc', true, true); by += bh + gap; }
  else { drawBtn('ai', bx, by, bw, bh, t('endless_ai'), '#b967ff', false); by += bh + gap; }
  drawBtn('daily', bx, by, bw, bh, t('daily') + (Save.playedDailyToday() ? ' ✓' : ''), '#ffd23f', false); by += bh + gap;
  drawBtn('lang', bx, by * 1, bw / 2 - 6 * UI, bh, ja ? '🌐 EN' : '🌐 日本語', '#8fd3ff', false);
  drawBtn('skin', bx + bw / 2 + 6 * UI, by, bw / 2 - 6 * UI, bh, '🎨 ' + Save.currentSkin().name, '#7CFC00', false);

  // 統計/ストリーク
  const sy = H * 0.855;
  const d = Save.data;
  label(`🏆 W${d.bestWorld}   🔥 ${d.streak}${ja ? '日' : 'd'}   ⚔ ${d.kills}   🎯 ${Save.accuracy()}%`, W / 2, sy, '#9fd8b0', 11 * UI);
  if (game.aiMsg && !game.aiLoading) label(game.aiMsg, W / 2, sy + 18 * UI, '#ffcf6f', 10.5 * UI);
  else label(t('hiscore') + ' ' + String(game.hi).padStart(7, '0'), W / 2, sy + 18 * UI, '#ffd700', 11 * UI);
  label(t('howto1'), W / 2, sy + 40 * UI, '#8899bb', 10.5 * UI);
}
function drawBtn(id, x, y, w, h, text, color, glow, spinner = false) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; roundRect(x, y, w, h, 12); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = glow ? 3 : 2; roundRect(x, y, w, h, 12); ctx.stroke();
  if (spinner) {
    const a = performance.now() * 0.005;
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
    ctx.arc(x + 26, y + h / 2, 10, a, a + Math.PI * 1.4); ctx.stroke();
    label(text, x + w / 2 + 12, y + h / 2, color, 13 * UI);
  } else {
    label(text, x + w / 2, y + h / 2, color, 15 * UI);
  }
  ctx.restore();
  if (id !== 'none') game.menuBtns.push({ id, x, y, w, h });
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
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
  ctx.fillText('🏆', W / 2, H * 0.24);
  label(game.aiMode ? t('ai_clear') : t('all_clear'), W / 2, H * 0.35, '#ffd700', 24 * UI);
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
  switch (game.state) {
    case 'title': drawTitle(); break;
    case 'intro': drawIntro(); break;
    case 'play': case 'warn': {
      ctx.save(); ctx.translate(game.shakeX, game.shakeY);
      drawBackground(); drawWeatherFx(); drawBells(); drawEnemies(); drawBoss();
      drawBullets(); drawPlayer(); drawParticles(); drawFog(); drawPopups();
      ctx.restore();
      drawHUD();
      if (game.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${clamp(game.flash, 0, 0.85)})`; ctx.fillRect(0, 0, W, H); }
      break;
    }
    case 'clear': drawClear(); break;
    case 'pause':
      ctx.save(); drawBackground(); drawBells(); drawEnemies(); drawBoss(); drawBullets(); drawPlayer(); ctx.restore();
      drawHUD(); drawPause(); break;
    case 'over': drawBackground(); drawParticles(); drawGameOver(); break;
    case 'victory': drawVictory(); break;
  }
}
