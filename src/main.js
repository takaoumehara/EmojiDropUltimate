// ============================================================
// main.js — 起動・メインループ・上部ボタン配線
// ============================================================
import { ctx, DPR, resize } from './env.js';
import { game } from './state.js';
import { Snd } from './audio.js';
import { Weather, CITIES, pickCity, setCity } from './weather.js';
import { update, initStars, togglePause, toTitle, startRun, requestAIStage, startDaily, startFromSeed, shareRun, doContinue, openCoopLobby, startCoop } from './engine.js';
import { draw } from './render.js';
import { keys, updateMuteIcon } from './input.js';
import { Save } from './save.js';
import { Coop } from './coop.js';
import { toggleLang, getLang } from './i18n.js';
import { Diag } from './diag.js';

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

Diag.boot();   // 例外の捕捉とプレイ記録。ここより前に落ちた分は拾えないので最初に。
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
const DIFF_JA = ['やさしい', 'ふつう', 'むずかしい'];
const DIFF_EN = ['EASY', 'NORMAL', 'HARD'];
function syncSettings() {
  const ja = getLang() === 'ja';
  const T = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  T('setDiffL', ja ? 'むずかしさ' : 'Difficulty');
  T('setDiffV', (ja ? DIFF_JA : DIFF_EN)[Save.diff()]);
  T('setSoundL', ja ? 'サウンド' : 'Sound');
  T('setSoundV', Snd.muted ? 'OFF' : 'ON');
  T('setCityL', ja ? '地域(天気)' : 'Region (weather)');
  T('setCityV', (() => { const c = Weather.city || pickCity(); return ja ? c.ja : c.en; })());
  T('setMotionL', ja ? '画面のゆれ' : 'Screen shake');
  T('setMotionV', Save.shake() ? (ja ? 'あり' : 'ON') : (ja ? 'ひかえめ' : 'REDUCED'));
  T('setLangL', ja ? '言語' : 'Language');
  T('setLangV', ja ? '日本語' : 'English');
  T('setDiagL', ja ? '動作レポート' : 'Diagnostics');
  T('setDiagV', ja ? 'みる' : 'VIEW');
  T('setResetL', ja ? '進行データを消す' : 'Clear progress');
  T('setResetV', ja ? 'リセット' : 'RESET');
}
setBtn.addEventListener('click', e => { e.stopPropagation(); Snd.init(); setPanel.classList.toggle('show'); syncSettings(); });
document.getElementById('setSound').addEventListener('click', () => { Snd.init(); updateMuteIcon(Snd.toggleMute()); syncSettings(); });
document.getElementById('setDiff').addEventListener('click', () => { Save.setDiff((Save.diff() + 1) % 3); syncSettings(); });
document.getElementById('setMotion').addEventListener('click', () => { Save.setShake(!Save.shake()); syncSettings(); });
// 天気の地域。位置情報は使わないので、当たっていなければここで直す。
document.getElementById('setCity').addEventListener('click', async () => {
  const cur = (Weather.city || pickCity()).id;
  const i = CITIES.findIndex(c => c.id === cur);
  const next = CITIES[(i + 1) % CITIES.length];
  setCity(next.id);
  Weather.city = next;
  syncSettings();
  await Weather.reload();
  syncSettings();
});
// 端末内に貯めた不具合とプレイ記録をまとめて渡せるようにする(自動送信はしない)
document.getElementById('setDiag').addEventListener('click', async () => {
  const text = Diag.report();
  try {
    if (navigator.share) { await navigator.share({ title: 'EMOJI DROP 動作レポート', text }); return; }
    await navigator.clipboard.writeText(text);
    alert((getLang() === 'ja' ? 'コピーしました:\n\n' : 'Copied:\n\n') + text);
  } catch (e) { alert(text); }
});
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
  // キャラ選択はカード自身が「戻る」を持っているので、ホームボタンは隠す(カードに被る)
  homeBtn.style.display = (title || s === 'splash' || s === 'chars') ? 'none' : 'flex';
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
