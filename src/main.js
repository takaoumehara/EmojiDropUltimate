// ============================================================
// main.js — 起動・メインループ・上部ボタン配線
// ============================================================
import { ctx, DPR, resize } from './env.js';
import { game } from './state.js';
import { Snd } from './audio.js';
import { Weather } from './weather.js';
import { update, initStars, togglePause, toTitle, startRun, requestAIStage, startDaily, startFromSeed, shareRun, doContinue, openCoopLobby, startCoop } from './engine.js';
import { draw } from './render.js';
import { keys, updateMuteIcon } from './input.js';
import { Save } from './save.js';
import { Coop } from './coop.js';
import { toggleLang, getLang } from './i18n.js';

// デバッグ用ハンドル(DevTools から状態確認・操作できる。無害)
window.EDU = { get game() { return game; }, startRun, requestAIStage, startDaily, startFromSeed, shareRun, doContinue, toTitle, openCoopLobby, startCoop, Coop, Weather, Save };

// URL ?seed=xxxx で同じステージを再現(共有リンク用)
const _q = new URLSearchParams(location.search);
const _seed = _q.get('seed');
if (_seed) { setTimeout(() => startFromSeed(_seed), 400); }
// URL ?join=CODE(QR/招待リンク)で、そのままロビーに合流する
const _join = (_q.get('join') || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
if (_join.length === 6) {
  setTimeout(() => { game.state = 'coop'; game.splashT = 0; Coop.join(_join); }, 500);
}

// 起動スプラッシュ(数秒でタイトルへ。タップでスキップ可)
game.state = 'splash'; game.splashT = 2000;

resize();
window.addEventListener('resize', resize);
// 端末回転: iOS は回転直後に寸法が確定しないため、少し遅らせて数回測り直す。
window.addEventListener('orientationchange', () => {
  resize(); initStars();
  setTimeout(() => { resize(); initStars(); }, 200);
  setTimeout(() => { resize(); initStars(); }, 500);
});
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
initStars();
updateMuteIcon(Snd.muted);
Weather.load();

// 上部ボタン
const pauseBtn = document.getElementById('pauseBtn');
const homeBtn = document.getElementById('homeBtn');
const setBtn = document.getElementById('setBtn');
const setPanel = document.getElementById('setPanel');
pauseBtn.addEventListener('click', () => { Snd.init(); togglePause(); });
homeBtn.addEventListener('click', () => { if (game.state !== 'title') toTitle(); });

// === 設定パネル(音・言語をタイトルの絵文字と被らない位置へ集約) ===
function syncSettings() {
  const ja = getLang() === 'ja';
  document.getElementById('setSoundL').textContent = ja ? 'サウンド' : 'Sound';
  document.getElementById('setSoundV').textContent = Snd.muted ? 'OFF' : 'ON';
  document.getElementById('setLangL').textContent = ja ? '言語' : 'Language';
  document.getElementById('setLangV').textContent = ja ? '日本語' : 'English';
  document.getElementById('setResetL').textContent = ja ? '進行データを消す' : 'Clear progress';
  document.getElementById('setResetV').textContent = ja ? 'リセット' : 'RESET';
}
setBtn.addEventListener('click', e => { e.stopPropagation(); Snd.init(); setPanel.classList.toggle('show'); syncSettings(); });
document.getElementById('setSound').addEventListener('click', () => { Snd.init(); updateMuteIcon(Snd.toggleMute()); syncSettings(); });
document.getElementById('setLang').addEventListener('click', () => { Snd.init(); toggleLang(); syncSettings(); });
// 章の進行を消して第1章からやり直す(タイトルの極小ボタンより誤爆しない)
document.getElementById('setReset').addEventListener('click', () => {
  const ja = getLang() === 'ja';
  if (!confirm(ja ? '章の進行をすべて消して、第1章の最初からやり直しますか?' : 'Clear all chapter progress and start over from Chapter 1?')) return;
  Save.data.cleared = 0; Save.data.resume = 0; Save.data.chapter = 0;
  Save.persist();
  setPanel.classList.remove('show');
  toTitle();
});
document.addEventListener('pointerdown', e => {
  if (setPanel.classList.contains('show') && !setPanel.contains(e.target) && e.target !== setBtn) setPanel.classList.remove('show');
}, true);
syncSettings();

function syncButtons() {
  const s = game.state;
  const title = s === 'title';
  const playing = s === 'play' || s === 'warn' || s === 'pause';
  setBtn.style.display = title ? 'flex' : 'none';
  homeBtn.style.display = (title || s === 'splash') ? 'none' : 'flex';
  pauseBtn.style.display = playing ? 'flex' : 'none';
  if (!title && setPanel.classList.contains('show')) setPanel.classList.remove('show');
}

document.addEventListener('visibilitychange', () => { if (document.hidden && (game.state === 'play' || game.state === 'warn')) togglePause(); });

let lastT = performance.now();
function loop(now) {
  const dt = Math.min((now - lastT) / 1000, 0.034);
  lastT = now;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  update(dt, keys);
  draw();
  syncButtons();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
