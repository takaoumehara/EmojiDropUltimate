// ============================================================
// main.js — 起動・メインループ・上部ボタン配線
// ============================================================
import { ctx, DPR, resize } from './env.js';
import { game } from './state.js';
import { Snd } from './audio.js';
import { Weather } from './weather.js';
import { update, initStars, togglePause, toTitle, startRun, requestAIStage, doContinue } from './engine.js';
import { draw } from './render.js';
import { keys, updateMuteIcon } from './input.js';

// デバッグ用ハンドル(DevTools から状態確認・操作できる。無害)
window.EDU = { get game() { return game; }, startRun, requestAIStage, doContinue, toTitle, Weather };

resize();
window.addEventListener('resize', resize);
initStars();
updateMuteIcon(Snd.muted);
Weather.load();

// 上部ボタン
const pauseBtn = document.getElementById('pauseBtn');
const muteBtn = document.getElementById('muteBtn');
const homeBtn = document.getElementById('homeBtn');
pauseBtn.addEventListener('click', () => { Snd.init(); togglePause(); });
muteBtn.addEventListener('click', () => { Snd.init(); updateMuteIcon(Snd.toggleMute()); });
homeBtn.addEventListener('click', () => { if (game.state !== 'title') toTitle(); });
pauseBtn.style.display = 'flex';
muteBtn.style.display = 'flex';
homeBtn.style.display = 'flex';

document.addEventListener('visibilitychange', () => { if (document.hidden && (game.state === 'play' || game.state === 'warn')) togglePause(); });

let lastT = performance.now();
function loop(now) {
  const dt = Math.min((now - lastT) / 1000, 0.034);
  lastT = now;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  update(dt, keys);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
