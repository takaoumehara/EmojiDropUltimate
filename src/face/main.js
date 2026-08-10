// ============================================================
// src/face/main.js — 画面をつなぐところ
//
//   ゲームのルールは game.js にあり、そこには DOM が一切出てこない。
//   ここは「描く・鳴らす・カメラを開く」だけを持つ。
// ============================================================

import { makeRig } from './signal.js';
import { EXPRESSIONS, BY_KEY } from './expressions.js';
import { makeSession, TIMING, TOTAL_MS, targetProgress, bandRange } from './game.js';
import { TapSource, TAP_CHANNEL_OPTS } from './tapsource.js';
import { summarize, saveRun, loadRuns, clearRuns, compare, unusableExpressions } from './metrics.js';
import { Sfx } from './audio.js';

const $ = id => document.getElementById(id);
const screens = ['intro', 'loading', 'play', 'result'];
function show(name) {
  for (const s of screens) $(s).classList.toggle('on', s === name);
}

const sfx = new Sfx();
// 音は必ずユーザー操作の中で起こす。外で resume しても例外は出ず、無音になるだけ。
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
window.addEventListener('keydown', () => sfx.unlock(), { once: true });

const ALL_KEYS = EXPRESSIONS.map(e => e.key);

let mode = 'tap';
let source = null;       // TapSource | FaceSource
let faceMod = null;      // 遅延読み込みした facesource.js
let rig = null;
let session = null;
let rafId = 0;
let lastT = 0;
let hitstopMs = 0;       // 当たった瞬間だけ時間を止める。手応えの正体
let shake = 0;
const bursts = [];

// ---- 入口 -----------------------------------------------------------

$('goTap').addEventListener('click', () => start('tap'));
$('goFace').addEventListener('click', () => start('face'));

(async function introChecks() {
  // HTTPS でないとカメラは開けない。押してから断られるより先に伝える。
  const { isSecureForCamera } = await import('./facesource.js').catch(() => ({}));
  if (isSecureForCamera && !isSecureForCamera()) {
    $('goFace').disabled = true;
    $('introNote').innerHTML =
      '<span class="warn">この URL ではカメラを開けません（https か localhost が要ります）。' +
      'ゆびの経路はそのまま遊べます。</span>';
  }
})();

// ---- 開始 -----------------------------------------------------------

async function start(which) {
  mode = which;
  sfx.unlock();

  if (mode === 'tap') {
    source = new TapSource();
    // ヒステリシスと最小保持は顔と同じ。平滑化だけ切る(遅れは差に出るべきなので)。
    rig = makeRig(ALL_KEYS, TAP_CHANNEL_OPTS);
    buildTapPad();
    $('mirror').hidden = true;
    beginPlay();
    return;
  }

  show('loading');
  let cancelled = false;
  $('loadCancel').onclick = () => { cancelled = true; show('intro'); };

  try {
    if (!faceMod) faceMod = await import('./facesource.js');
    const fs = new faceMod.FaceSource();

    // **許可はここで初めて求める。理由は入口の画面で既に見せてある。**
    $('loadMsg').textContent = 'カメラの許可をまっています…';
    await fs.openCamera($('cam'));
    if (cancelled) { fs.stop(); return; }

    await fs.load(msg => { $('loadMsg').textContent = msg + '…'; });
    if (cancelled) { fs.stop(); return; }

    fs.probe();
    if (fs.unusable.length) {
      // モデルに blendshape が無い = 出題しても永久に反応しない。黙って進めない。
      console.warn('このモデルでは読めない表情:', fs.unusable);
    }
    source = fs;
    rig = makeRig(ALL_KEYS);
    $('mirror').hidden = false;
    $('tapPad').classList.remove('on');
    beginPlay();
  } catch (err) {
    const denied = /NotAllowed|Permission/i.test(String(err?.name || err));
    // 拒否は失敗ではなく分岐。ここで詰まらせない。
    $('loadMsg').textContent = denied ? 'カメラは つかいません' : 'カメラを ひらけませんでした';
    $('loadNote').innerHTML = denied
      ? 'ゆびの経路で、おなじものが あそべます。'
      : `${String(err?.message || err)}<br>ゆびの経路で、おなじものが あそべます。`;
    $('loadCancel').textContent = 'ゆびで あそぶ';
    $('loadCancel').onclick = () => start('tap');
  }
}

function buildTapPad() {
  const pad = $('tapPad');
  pad.innerHTML = '';
  pad.classList.add('on');
  const buttons = {};
  for (const e of EXPRESSIONS) {
    if (!e.ask) continue; // 出題しない表情はボタンも出さない
    const b = document.createElement('button');
    b.textContent = e.emoji;
    b.setAttribute('aria-label', e.label);
    pad.appendChild(b);
    buttons[e.key] = b;
  }
  source.bind(buttons);
  source._buttons = buttons;
}

function buildMeters() {
  const box = $('meters');
  box.innerHTML = '';
  for (const e of EXPRESSIONS) {
    if (!e.ask) continue;
    const d = document.createElement('div');
    d.className = 'meter';
    d.dataset.key = e.key;
    d.innerHTML =
      `<div class="cap"><span class="em">${e.emoji}</span><span>${e.label}</span></div>` +
      `<div class="bar"><div class="fill"></div><div class="tick" style="left:55%"></div></div>`;
    box.appendChild(d);
  }
}

function beginPlay() {
  buildMeters();
  session = makeSession({ seed: (Date.now() & 0xffff) | 1, mode });
  bursts.length = 0;
  hitstopMs = 0;
  shake = 0;
  lastT = 0;
  show('play');
  resize();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

// ---- ループ ---------------------------------------------------------

function loop(t) {
  rafId = requestAnimationFrame(loop);
  if (!lastT) lastT = t;
  let dt = (t - lastT) / 1000;
  lastT = t;
  // タブが戻ってきた時に、溜まった時間が一気に流れないようにする
  if (!(dt > 0) || dt > 0.25) dt = 1 / 60;

  const raws = source.tick();
  const conf = source.confidence ?? 1;

  // 当たった瞬間だけ時間を止める。2〜5フレーム(30〜80ms)。
  // 伸ばすと重く、削ると手応えが消える。
  if (hitstopMs > 0) {
    hitstopMs -= dt * 1000;
    rig.update(raws, conf, dt); // 入力の読み取りは止めない(取りこぼすと誤爆に見える)
    draw(0);
    return;
  }

  rig.update(raws, conf, dt);

  const events = session.step(dt, rig, conf);
  for (const ev of events) handleEvent(ev);

  // 立ち上がりそのものに音を返す。判定の成否とは切り離す。
  for (const [k, ch] of rig.channels) {
    if (ch.state.justOn && BY_KEY.get(k)?.ask) sfx.formed();
  }

  updateHud();
  draw(dt);

  if (session.state.finished) {
    cancelAnimationFrame(rafId);
    finish();
  }
}

function handleEvent(ev) {
  if (ev.type === 'hit') {
    sfx.hit(ev.quality);
    hitstopMs = 30 + ev.quality * 45;
    shake = 4 + ev.quality * 8;
    spawnBurst(ev.target);
  } else if (ev.type === 'miss') {
    sfx.miss();
  } else if (ev.type === 'blocked') {
    sfx.blocked();
  } else if (ev.type === 'phase') {
    if (ev.kind === 'round') sfx.round();
  } else if (ev.type === 'trackingScale') {
    $('edge').classList.toggle('on', ev.scale === 0);
    $('mirror').classList.toggle('lost', ev.scale < 1);
  } else if (ev.type === 'finished') {
    sfx.finish();
  }
}

function updateHud() {
  const left = Math.max(0, Math.ceil((TOTAL_MS - session.state.timeMs) / 1000));
  $('clock').textContent = String(left);
  $('score').textContent = String(session.state.score);
  const ph = session.state.phase;
  $('phaseTag').textContent =
    ph.kind === 'rest' ? 'やすみ — なにもしないのが せいかい'
    : ph.kind === 'warmup' ? 'かおを さがしています'
    : '';

  for (const d of $('meters').children) {
    const ch = rig.get(d.dataset.key);
    if (!ch) continue;
    d.classList.toggle('on', ch.state.active);
    d.querySelector('.fill').style.width = `${(ch.state.value * 100).toFixed(1)}%`;
  }
  if (mode === 'tap' && source._buttons) {
    for (const [k, b] of Object.entries(source._buttons)) {
      b.classList.toggle('held', source.isHeld(k));
    }
  }
}

// ---- 描画 -----------------------------------------------------------

const cv = $('stage');
const ctx = cv.getContext('2d');
let W = 0, H = 0;

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect();
  W = Math.max(1, Math.round(r.width));
  H = Math.max(1, Math.round(r.height));
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ov = $('overlay');
  const mr = $('mirror').getBoundingClientRect();
  ov.width = Math.round(mr.width * dpr);
  ov.height = Math.round(mr.height * dpr);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

function spawnBurst(tg) {
  const p = targetProgress(tg, session.state.timeMs);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    bursts.push({
      x: W / 2, y: p * H,
      vx: Math.cos(a) * (90 + Math.random() * 130),
      vy: Math.sin(a) * (90 + Math.random() * 130),
      life: 0.55, max: 0.55, em: tg.emoji,
    });
  }
}

function draw(dt) {
  ctx.clearRect(0, 0, W, H);

  let ox = 0, oy = 0;
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 44);
    ox = (Math.random() - 0.5) * shake;
    oy = (Math.random() - 0.5) * shake;
  }
  ctx.save();
  ctx.translate(ox, oy);

  // --- 帯。線ではなく帯なのが要点。遅れは点差になるだけで失敗にはならない ---
  const sample = { shownAtMs: 0, bandFromMs: TIMING.travelMs, bandToMs: TIMING.travelMs + TIMING.bandMs };
  const band = bandRange(sample);
  const bandTop = band.from * H;
  const grad = ctx.createLinearGradient(0, bandTop, 0, H);
  grad.addColorStop(0, 'rgba(255,210,63,0.05)');
  grad.addColorStop(0.5, 'rgba(255,210,63,0.17)');
  grad.addColorStop(1, 'rgba(255,210,63,0.05)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandTop, W, H - bandTop);

  // 帯に入った瞬間が見える線。ここから壊せる、が形として分かる。
  ctx.strokeStyle = 'rgba(255,210,63,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, bandTop); ctx.lineTo(W, bandTop); ctx.stroke();

  // いちばん良い高さ。ここに近いほど点が高い。
  const sweet = bandTop + (H - bandTop) / 2;
  ctx.strokeStyle = 'rgba(255,210,63,0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 9]);
  ctx.beginPath(); ctx.moveTo(0, sweet); ctx.lineTo(W, sweet); ctx.stroke();
  ctx.setLineDash([]);

  // --- 的 ---
  const t = session.state.timeMs;
  const size = Math.min(96, Math.max(48, W * 0.19));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const tg of session.state.targets) {
    const p = targetProgress(tg, t);
    const y = p * H;
    const ch = rig.get(tg.key);

    if (tg.resolved === 'hit') continue;
    if (tg.resolved === 'miss') {
      ctx.globalAlpha = Math.max(0, 1 - (t - tg.bandToMs) / 600) * 0.35;
      ctx.font = `${size}px system-ui, sans-serif`;
      ctx.fillStyle = '#eceaff';
      ctx.fillText(tg.emoji, W / 2, y);
      ctx.globalAlpha = 1;
      continue;
    }

    // 予告。帯に入る 800ms 前から光り始める。
    // 予告なしの正確な操作は物理的に不可能なので、これは飾りではない。
    const preAt = tg.bandFromMs - TIMING.preMs;
    const pre = Math.max(0, Math.min(1, (t - preAt) / TIMING.preMs));
    const inBand = t >= tg.bandFromMs && t <= tg.bandToMs;

    // 入力の現在値を、的そのものに出す。「もう少しで届く」が見える。
    if (ch && ch.state.value > 0.02) {
      ctx.beginPath();
      ctx.arc(W / 2, y, size * (0.62 + ch.state.value * 0.5), 0, Math.PI * 2);
      ctx.strokeStyle = ch.state.active ? 'rgba(78,227,154,0.95)' : 'rgba(255,210,63,0.45)';
      ctx.lineWidth = ch.state.active ? 5 : 3;
      ctx.stroke();
    }

    if (pre > 0) {
      ctx.beginPath();
      ctx.arc(W / 2, y, size * (0.55 + pre * 0.16), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,210,63,${(inBand ? 0.2 : 0.1) * pre})`;
      ctx.fill();
    }

    // **どの顔かは、出た瞬間から読めていないといけない。**
    // 予告が意味を持つのは「何を作るか決める時間」を渡すからで、
    // 薄くて読めない的は、予告時間をゼロにしているのと同じ。
    ctx.font = `${size * (inBand ? 1.06 : 1)}px system-ui, sans-serif`;
    ctx.globalAlpha = 0.78 + 0.22 * pre;
    // 色を必ず入れ直す。入れないと直前の帯のグラデーションを引き継いで、
    // 絵文字が黄色く沈む(カラー絵文字が無い環境で実際にそう見えた)。
    ctx.fillStyle = '#eceaff';
    ctx.fillText(tg.emoji, W / 2, y);
    ctx.globalAlpha = 1;
  }

  // --- はじけた粒 ---
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    b.life -= dt;
    if (b.life <= 0) { bursts.splice(i, 1); continue; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.vy += 420 * dt;
    ctx.globalAlpha = b.life / b.max;
    ctx.font = `${18 + 16 * (b.life / b.max)}px system-ui, sans-serif`;
    ctx.fillStyle = '#eceaff';
    ctx.fillText(b.em, b.x, b.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (mode === 'face') drawOverlay();
}

/**
 * 映像だけだと「映っている」ことしか分からず、「認識されている」ことが分からない。
 * だから推定結果を必ず重ねる。
 */
function drawOverlay() {
  const ov = $('overlay');
  const octx = ov.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = ov.width / dpr, h = ov.height / dpr;
  octx.clearRect(0, 0, w, h);
  const lms = source.landmarks;
  if (!lms) return;
  octx.fillStyle = source.confidence >= 0.5 ? 'rgba(78,227,154,0.85)' : 'rgba(255,107,107,0.85)';
  // 映像を鏡像にしているので、点も同じように反転させる
  for (let i = 0; i < lms.length; i += 4) {
    const p = lms[i];
    octx.fillRect((1 - p.x) * w - 0.8, p.y * h - 0.8, 1.6, 1.6);
  }
  // 複数人映っている時は、黙って切り替えず、そう見せる
  if (source.faceCount > 1) {
    octx.strokeStyle = 'rgba(255,210,63,0.9)';
    octx.lineWidth = 2;
    octx.strokeRect(2, 2, w - 4, h - 4);
  }
}

// ---- 結果 -----------------------------------------------------------

function finish() {
  const sum = summarize(session);
  saveRun(sum);
  source.stop();
  $('tapPad').classList.remove('on');
  $('edge').classList.remove('on');
  renderResult(sum);
  show('result');
}

function card(k, v, u = '') {
  return `<div class="card"><div class="k">${k}</div><div class="v">${v}<span class="u">${u}</span></div></div>`;
}

function renderResult(sum) {
  const isFace = sum.mode === 'face';
  const label = isFace ? 'カメラ' : 'ゆび';

  // **「誤爆」と「押し間違い」を同じ言葉で並べてはいけない。**
  // 顔の誤爆は「作っていないのに反応した」＝機械の失敗。
  // ゆびの押し間違いは、本人が押した＝人の選択。数は比べられるが、意味が違う。
  // 同じ札に同じ名前で出すと、タップ側の数字を見て「この表情は使えない」と
  // 判断してしまう。それは判断ミスをこちらが作っていることになる。
  //
  // 顎の疲れも同じで、ゆびには顎が無い。ゆびの振幅は常に最大なので 0% にしかならず、
  // 「疲れていない」という嘘の結論が出る。
  $('cards').innerHTML = [
    card('あてた数', sum.hits, ` / ${sum.shown}`),
    card('反応の時間', sum.reactionMs ?? '—', ' ms'),
    isFace ? card('誤爆', sum.falseFires, ' 回')
           : card('押し間違い', sum.falseFires, ' 回'),
    card('じゃまされた', sum.blocked, ' 回'),
    isFace ? card('顎の疲れ', sum.fatigue ? sum.fatigue.dropPct : '—', sum.fatigue ? ' % 小さく' : '')
           : card('顎の疲れ', '—', ' カメラのみ'),
    card('スコア', sum.score),
  ].join('');

  // --- 表情ごと ---
  const rows = Object.entries(sum.perKey).map(([k, v]) => `
    <tr>
      <td>${v.emoji} ${v.label}${v.asked ? '' : ' <span class="u">(出題なし)</span>'}</td>
      <td>${v.asked ? `${v.hits}/${v.hits + v.misses}` : '—'}</td>
      <td>${v.reactionMs ?? '—'}</td>
      <td>${v.falseFires}</td>
      <td>${v.blockedOthers}</td>
    </tr>`).join('');
  $('perKey').innerHTML =
    `<tr><th>表情</th><th>あてた</th><th>反応ms</th><th>誤爆</th><th>じゃま</th></tr>${rows}`;

  // --- 判定 ---
  const runs = loadRuns();
  const cmp = compare(runs);
  const bad = unusableExpressions(sum);
  const parts = [];

  if (!cmp.ready) {
    const need = cmp.missing === 'tap' ? 'ゆび' : 'カメラ';
    parts.push(
      `<b>いちばん大事な数字は、まだ出ていません。</b><br>` +
      `いま出ている「反応の時間 ${sum.reactionMs ?? '—'}ms」には、人間の反応時間が` +
      `そのまま入っています。カメラのせいで何ms遅いのかは、この数字だけでは分かりません。<br>` +
      `<b>同じ人が「${need}」でもう一度遊ぶと、その差が出ます。</b>それが本当に測りたかった数字です。`
    );
  } else {
    const d = cmp.reactionDeltaMs;
    const ok = cmp.verdict === 'continuous-ok';
    parts.push(
      `<b>カメラの分の遅れ: ${d >= 0 ? '+' : ''}${d} ms</b>` +
      `（カメラ ${cmp.face.reactionMs}ms − ゆび ${cmp.tap.reactionMs}ms）<br>` +
      (ok
        ? '200ms を超えていません。表情マッチのまま進めて大丈夫です。'
        : '<b>200ms を超えました。</b>離散的な操作に振り切るのが正解です' +
          '（＝表情マッチで確定。口砲は捨てる）。') +
      // 誤爆はここで引き算しない。ゆび側の同じ数字は「押し間違い」であって、
      // 引くと意味の違うものを引くことになる。カメラ側の実数をそのまま出す。
      `<br>あてた率の差: ${cmp.hitRateDelta ?? '—'} 点 ／ カメラでの誤爆: ${cmp.face.falseFires} 回`
    );
  }

  // 「この表情は使えない」の判断はカメラでしか出せない。
  // ゆびの押し間違いを根拠にその判断を出すと、無実の表情を切り捨てることになる。
  if (isFace && bad.length) {
    parts.push(
      `<b>誤爆が多い表情:</b> ` +
      bad.map(b => `${b.emoji} ${b.label}（1分あたり ${b.perMinute} 回）`).join('、') +
      `<br>ゲームでは使わないか、しきい値を上げるほうがよさそうです。`
    );
  }

  if (!isFace) {
    parts.push(
      '<span class="u">ゆびの経路では、疲れも誤爆も測れません（顎が無く、押したのは本人だから）。' +
      'ここで測っているのは<b>基準線</b>だけです。</span>'
    );
  } else if (sum.fatigue) {
    const d = sum.fatigue.dropPct;
    parts.push(
      d >= 15
        ? `<b>後半は、顔の動きが ${d}% 小さくなっています。</b>60秒でここまで落ちるなら、` +
          `1ステージは30〜40秒にして、休みをもっと入れるべきです。<br>` +
          `<span class="u">ここでゲームの長さと休憩の入れ方が全部決まります。</span>`
        : `後半の動きの小ささは ${d}%。60秒はまだ持ちます。`
    );
  } else {
    parts.push('あてた数が少なくて、疲れの推移は出せませんでした（6発以上あると出ます）。');
  }

  if (sum.lostEvents > 0) {
    parts.push(`<span class="u">顔を見失った回数: ${sum.lostEvents}。明るさとカメラの位置を変えると減ります。</span>`);
  }

  const v = $('verdict');
  v.innerHTML = parts.join('<hr style="border:none;border-top:1px solid var(--line);margin:11px 0">');
  v.className = 'verdict ' + (cmp.ready && cmp.verdict !== 'continuous-ok' ? 'warn' : 'good');

  $('other').textContent = sum.mode === 'face' ? 'ゆびで ためす' : 'カメラで ためす';
  $('other').onclick = () => start(sum.mode === 'face' ? 'tap' : 'face');
  $('again').textContent = `${label}で もういちど`;
  $('again').onclick = () => start(sum.mode);
  $('reset').onclick = () => { clearRuns(); renderResult(sum); };

  $('footnote').innerHTML =
    'この画面の数字は、この端末の中にだけ残ります（顔の映像も特徴量も保存していません）。<br>' +
    '「反応の時間」は、的が出てからその表情を作るまで＝<b>人の反応＋顔の筋肉＋カメラと推論の遅れ</b>の合計です。' +
    '3つはブラウザの中では分けられないので、ゆびとの差で見ています。<br>' +
    '本当の遅延を知りたい時は、画面と自分の顔を60fps以上で同時に撮ってフレームを数えてください。推測はしないこと。';
}

// 画面を離れる時は必ずカメラを手放す
window.addEventListener('pagehide', () => { try { source?.stop(); } catch (e) { /* noop */ } });
