// ============================================================
// input.js — キーボード + タッチ/マウス入力
// ============================================================
import { canvas, W, H, SAFE } from './env.js';
import { game } from './state.js';
import { Snd } from './audio.js';
import { toggleLang, getLang } from './i18n.js';
import { startRun, requestAIStage, startDaily, togglePause, useBombOrSuper, doContinue, toTitle, handleOverTap, openCoopLobby, startCoop, openStory, advanceOpening, skipOpening } from './engine.js';
import { Coop } from './coop.js';
import { Save } from './save.js';
import { CHARS } from './config.js';
import { shareInvite } from './ui.js';

// === あいことば入力(ページ内フォーム。ブラウザの prompt は使わない) ===
const jf = () => document.getElementById('joinForm');
export function openJoinForm() {
  const el = jf(); if (!el) return;
  Coop.joinOpen = true;
  const ja = getLang() === 'ja';
  document.getElementById('jfTitle').textContent = ja ? 'あいことばを入力' : 'Enter the room code';
  document.getElementById('jfSub').textContent = ja ? '友達の画面に出ている6文字' : "The 6 characters on your friend's screen";
  document.getElementById('jfGo').textContent = ja ? '参加' : 'Join';
  document.getElementById('jfCancel').textContent = ja ? 'やめる' : 'Cancel';
  const inp = document.getElementById('jfInput');
  inp.value = '';
  el.classList.add('show');
  setTimeout(() => inp.focus(), 30);
}
export function closeJoinForm() {
  const el = jf(); if (el) el.classList.remove('show');
  Coop.joinOpen = false;
}
function submitJoinForm() {
  const inp = document.getElementById('jfInput');
  const code = String(inp && inp.value || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
  if (code.length !== 6) { if (inp) { inp.style.borderColor = '#ff6b6b'; setTimeout(() => { inp.style.borderColor = ''; }, 900); } return; }
  closeJoinForm();
  Coop.join(code);
}
if (jf()) {
  document.getElementById('jfGo').addEventListener('click', submitJoinForm);
  document.getElementById('jfCancel').addEventListener('click', closeJoinForm);
  document.getElementById('jfInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitJoinForm(); });
}

export const keys = {};

let dragging = false, last = null, lastTapT = 0, charSwipe = null;

function hitMenu(x, y) {
  for (const b of game.menuBtns) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (b.id === 'start') startRun();
      else if (b.id === 'continue') startRun(Save.resumeStage(), true);   // 死んだところから
      else if (b.id === 'restart') startRun(0);
      else if (b.id === 'ai') requestAIStage();
      else if (b.id === 'daily') startDaily();
      else if (b.id === 'coop') openCoopLobby();
      else if (b.id === 'chars') game.state = 'chars';
      else if (b.id.startsWith('char') && /^char\d+$/.test(b.id)) {
        Save.setChar(parseInt(b.id.slice(4), 10));
        game.charView = 'card';           // 一覧で選んだら、そのキャラのカードを見せる
      }
      else if (b.id === 'clearChar') { game.charReturn = 'clear'; game.charView = 'card'; game.state = 'chars'; }
      else if (b.id === 'charGrid') game.charView = 'grid';
      else if (b.id === 'charOk') { game.charView = 'card'; game.state = game.charReturn || 'title'; game.charReturn = null; }
      else if (b.id === 'charBack') {
        if (game.charView === 'grid') game.charView = 'card';
        else { game.state = game.charReturn || 'title'; game.charReturn = null; }
      }
      else if (b.id === 'coopEnter') openJoinForm();
      else if (b.id === 'coopJoinCancel') closeJoinForm();
      else if (b.id === 'coopDemo') Coop.mockJoin();
      else if (b.id === 'coopLink') shareInvite(Coop.inviteUrl(), Coop.code);
      else if (b.id === 'coopStart') { if (Coop.requestStart()) startCoop(); }
      else if (b.id === 'coopRetry') { if (Coop.role === 'host') openCoopLobby(); else Coop.join(Coop.code); }
      else if (b.id === 'coopBack') toTitle();
      else if (b.id === 'coopModeStory') Coop.mode = 'story';
      else if (b.id === 'coopModeAi') Coop.mode = 'ai';
      // ミッションをもう一度見る。遊びはじめずに見るだけ(見終わればタイトルへ)
      else if (b.id === 'story') openStory(Save.chapter(), false);
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
  else if (s === 'opening') { if (e.key === ' ' || e.key === 'Enter') advanceOpening(); else if (e.key === 'Escape') skipOpening(); }
  else if (s === 'title') { if (e.key === ' ' || e.key === 'Enter') startRun(); if (e.key === 'l' || e.key === 'L') toggleLang(); }
  else if (e.key === ' ' && s === 'play') useBombOrSuper();
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
  // オープニングはタップで次のコマへ。長押しで飛ばす必要はない —— 4コマしかない。
  if (s === 'opening') { advanceOpening(); return; }
  if (s === 'chars' && game.charView !== 'grid') {
    // カードは横スワイプでめくる。指を離した時点で、動いた量が小さければタップ扱い。
    charSwipe = { x0: e.clientX, y0: e.clientY, moved: 0 };
    game.charDrag = 0;
    return;
  }
  if (s === 'clear') { hitMenu(e.clientX, e.clientY); return; }
  if (s === 'title' || s === 'coop' || s === 'chars') { hitMenu(e.clientX, e.clientY); return; }
  if (s === 'pause') { togglePause(); return; }
  // 「つぎのショー」を出している間のタップは、演出を飛ばすだけ。
  //   下に隠れている勝利画面のボタンを押してしまわないように先に受ける。
  if (s === 'victory' && game.showT > 0) { game.showT = 0; return; }
  if (s === 'over' || s === 'victory') { handleOverTap(e.clientX, e.clientY); return; }
  if (s === 'play' || s === 'warn') {
    if (now - lastTapT < 280 && last && Math.hypot(e.clientX - last.sx, e.clientY - last.sy) < 40) useBombOrSuper();
    lastTapT = now;
  }
  dragging = true; last = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
});
canvas.addEventListener('pointermove', e => {
  if (charSwipe) {
    game.charDrag = e.clientX - charSwipe.x0;
    charSwipe.moved = Math.max(charSwipe.moved, Math.hypot(e.clientX - charSwipe.x0, e.clientY - charSwipe.y0));
    return;
  }
  if (!dragging || !last) return;
  const p = game.player;
  if ((game.state === 'play' || game.state === 'warn') && !p.dead) {
    // 可動域は engine 側の clamp と同じにする(片方だけ端に届くとズレて見える)
    p.x = Math.max(22 + SAFE.left, Math.min(W - 22 - SAFE.right, p.x + (e.clientX - last.x) * 1.7));
    p.y = Math.max(40 + SAFE.top, Math.min(H - 22 - SAFE.bottom, p.y + (e.clientY - last.y) * 1.7));
  }
  last.x = e.clientX; last.y = e.clientY;
});
window.addEventListener('pointerup', e => {
  if (charSwipe) {
    const dx = game.charDrag || 0;
    if (Math.abs(dx) > 48) {                       // めくる
      const n = CHARS.length;
      Save.setChar(((Save.charIndex() + (dx < 0 ? 1 : -1)) % n + n) % n);
    } else if (charSwipe.moved < 12) {             // 動いていなければタップ
      hitMenu(e.clientX, e.clientY);
    }
    game.charDrag = 0; charSwipe = null;
    dragging = false;
    return;
  }
  dragging = false;
});
window.addEventListener('pointercancel', () => { dragging = false; });

// 音量表示は設定パネル側(main.js)が担当。ここは互換のための空フック。
export function updateMuteIcon(muted) {
  const v = document.getElementById('setSoundV');
  if (v) v.textContent = muted ? 'OFF' : 'ON';
  return muted;
}
