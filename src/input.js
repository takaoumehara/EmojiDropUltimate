// ============================================================
// input.js — キーボード + タッチ/マウス入力
// ============================================================
import { canvas } from './env.js';
import { game } from './state.js';
import { Snd } from './audio.js';
import { toggleLang, getLang } from './i18n.js';
import { startRun, requestAIStage, startDaily, togglePause, useBomb, doContinue, toTitle, handleOverTap, openCoopLobby, startCoop } from './engine.js';
import { Coop } from './coop.js';
import { Save } from './save.js';
import { shareInvite } from './ui.js';

export const keys = {};

let dragging = false, last = null, lastTapT = 0;

function hitMenu(x, y) {
  for (const b of game.menuBtns) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (b.id === 'start') startRun();
      else if (b.id === 'continue') startRun(Save.resumeStage());
      else if (b.id === 'restart') startRun(0);
      else if (b.id === 'ai') requestAIStage();
      else if (b.id === 'daily') startDaily();
      else if (b.id === 'coop') openCoopLobby();
      else if (b.id === 'chars') game.state = 'chars';
      else if (b.id.startsWith('char') && /^char\d+$/.test(b.id)) Save.setChar(parseInt(b.id.slice(4), 10));
      else if (b.id === 'charOk' || b.id === 'charBack') game.state = 'title';
      else if (b.id === 'coopEnter') { // ゲスト: あいことばで参加
        const c = prompt(getLang() === 'ja' ? 'あいことば(6文字)を入力' : 'Enter the 6-char code');
        if (c) Coop.join(c);
      }
      else if (b.id === 'coopDemo') Coop.mockJoin();
      else if (b.id === 'coopLink') shareInvite(Coop.inviteUrl(), Coop.code);
      else if (b.id === 'coopStart') { if (Coop.requestStart()) startCoop(); }
      else if (b.id === 'coopRetry') { if (Coop.role === 'host') openCoopLobby(); else Coop.join(Coop.code); }
      else if (b.id === 'coopBack') toTitle();
      else if (b.id === 'coopModeStory') Coop.mode = 'story';
      else if (b.id === 'coopModeAi') Coop.mode = 'ai';
      else if (b.id === 'lang') toggleLang();
      return true;
    }
  }
  return false;
}

window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  const s = game.state;
  if (s === 'splash') { if (e.key === ' ' || e.key === 'Enter') game.state = 'title'; }
  else if (s === 'title') { if (e.key === ' ' || e.key === 'Enter') startRun(); if (e.key === 'l' || e.key === 'L') toggleLang(); }
  else if (e.key === ' ' && s === 'play') useBomb();
  else if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') && (s === 'play' || s === 'pause' || s === 'warn')) togglePause();
  else if (e.key === 'm' || e.key === 'M') { Snd.init(); updateMuteIcon(Snd.toggleMute()); }
  else if (s === 'over') { if ((e.key === 'c' || e.key === 'C') && game.continues > 0) doContinue(); else if (e.key === ' ' || e.key === 'Enter') toTitle(); }
  else if (s === 'victory' && (e.key === ' ' || e.key === 'Enter')) toTitle();
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

canvas.addEventListener('pointerdown', e => {
  Snd.init();
  const s = game.state, now = performance.now();
  if (s === 'splash') { game.state = 'title'; return; }
  if (s === 'title' || s === 'coop' || s === 'chars') { hitMenu(e.clientX, e.clientY); return; }
  if (s === 'pause') { togglePause(); return; }
  if (s === 'over' || s === 'victory') { handleOverTap(e.clientX, e.clientY); return; }
  if (s === 'play' || s === 'warn') {
    if (now - lastTapT < 280 && last && Math.hypot(e.clientX - last.sx, e.clientY - last.sy) < 40) useBomb();
    lastTapT = now;
  }
  dragging = true; last = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
});
canvas.addEventListener('pointermove', e => {
  if (!dragging || !last) return;
  const p = game.player;
  if ((game.state === 'play' || game.state === 'warn') && !p.dead) {
    p.x = Math.max(22, Math.min(window.innerWidth - 22, p.x + (e.clientX - last.x) * 1.7));
    p.y = Math.max(40, Math.min(window.innerHeight - 22, p.y + (e.clientY - last.y) * 1.7));
  }
  last.x = e.clientX; last.y = e.clientY;
});
window.addEventListener('pointerup', () => { dragging = false; });
window.addEventListener('pointercancel', () => { dragging = false; });

// 音量表示は設定パネル側(main.js)が担当。ここは互換のための空フック。
export function updateMuteIcon(muted) {
  const v = document.getElementById('setSoundV');
  if (v) v.textContent = muted ? 'OFF' : 'ON';
  return muted;
}
