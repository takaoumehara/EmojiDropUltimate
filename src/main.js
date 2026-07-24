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
const _seed = new URLSearchParams(location.search).get('seed');
if (_seed) { setTimeout(() => startFromSeed(_seed), 400); }

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
const muteBtn = document.getElementById('muteBtn');
const homeBtn = document.getElementById('homeBtn');
const langBtn = document.getElementById('langBtn');
pauseBtn.addEventListener('click', () => { Snd.init(); togglePause(); });
muteBtn.addEventListener('click', () => { Snd.init(); updateMuteIcon(Snd.toggleMute()); });
homeBtn.addEventListener('click', () => { if (game.state !== 'title') toTitle(); });
// 言語ボタン: 「切り替え先」を表示(JA表示中→「EN」)
function syncLangBtn() { langBtn.textContent = getLang() === 'ja' ? 'EN' : '日本語'; }
langBtn.addEventListener('click', () => { Snd.init(); toggleLang(); syncLangBtn(); });
syncLangBtn();

function syncButtons() {
  const s = game.state;
  const title = s === 'title';
  const playing = s === 'play' || s === 'warn' || s === 'pause';
  muteBtn.style.display = s === 'splash' ? 'none' : 'flex';
  langBtn.style.display = title ? 'flex' : 'none';
  homeBtn.style.display = (title || s === 'splash') ? 'none' : 'flex';
  pauseBtn.style.display = playing ? 'flex' : 'none';
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
