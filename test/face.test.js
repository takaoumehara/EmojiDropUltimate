// ============================================================
// face.test.js — 顔で遊ぶ実験装置(face.html)を、画面なしで走らせる
//
// カメラ入力は「作った本人の環境で完璧に動き、他人の環境で動かない」分野で、
// しかも壊れ方が**静か**: 例外は出ず、ただ反応しなくなる。
// だから機械に見張らせるべきものが、ふつうのゲームより多い。
//
// ここで守っているのは主に4つ:
//   ① しきい値の境界で震えないこと(チャタリング)
//   ② 個人差の吸収が、何もしなかった人でも壊れないこと
//   ③ 顔を見失っている間にゲームが進まないこと
//   ④ 違う表情を作っても罰されないこと
//
// **測れないものは測れないと書く。** 実際の遅延・疲労・面白さは、
// カメラの前に人間が座らないと分からない(docs/face-game.md §12)。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { OneEuroFilter, makeChannel, makeRig, DEFAULTS } from '../src/face/signal.js';
import { EXPRESSIONS, ASKABLE, BY_KEY } from '../src/face/expressions.js';
import { makeSession, SCHEDULE, TIMING, TOTAL_MS, targetProgress } from '../src/face/game.js';
import { summarize, compare, unusableExpressions } from '../src/face/metrics.js';
import { TAP_CHANNEL_OPTS } from '../src/face/tapsource.js';

const KEYS = EXPRESSIONS.map(e => e.key);
const DT = 1 / 60;

// ---- ① One Euro Filter ---------------------------------------------

test('One Euro: dt が 0 や NaN でも無限大を吐かない(カメラのフレームは実際に飛ぶ)', () => {
  const f = new OneEuroFilter();
  for (const dt of [0, -1, NaN, Infinity, 1 / 60]) {
    const v = f.filter(0.5, dt);
    assert.ok(Number.isFinite(v), `dt=${dt} で ${v} が出た`);
  }
});

test('One Euro: 静止した入力には、いずれ追いつく', () => {
  const f = new OneEuroFilter();
  let v = 0;
  for (let i = 0; i < 240; i++) v = f.filter(0.8, DT);
  assert.ok(Math.abs(v - 0.8) < 0.01, `240フレーム後に ${v}`);
});

test('One Euro: 揺れている入力の振れ幅を、実際に小さくする', () => {
  const raw = [];
  const out = [];
  const f = new OneEuroFilter();
  for (let i = 0; i < 300; i++) {
    // 0.5 のまわりで ±0.06 揺れる = 推定器のジッターの模型
    const r = 0.5 + Math.sin(i * 2.7) * 0.06;
    raw.push(r);
    out.push(f.filter(r, DT));
  }
  const spread = a => Math.max(...a.slice(60)) - Math.min(...a.slice(60));
  assert.ok(spread(out) < spread(raw) * 0.7,
    `揺れが取れていない: 生 ${spread(raw).toFixed(3)} → 後 ${spread(out).toFixed(3)}`);
});

// ---- ② ヒステリシス -------------------------------------------------

test('しきい値のちょうど境目で揺らしても、状態が反転し続けない', () => {
  // これが無いと「たまに反応しない / 勝手に反応する」になる。
  // 単一しきい値なら、この入力で数十回反転する。
  const ch = makeChannel({ key: 'gape' });
  ch.calib.rest = 0; ch.calib.peak = 1;

  let flips = 0, prev = false;
  for (let i = 0; i < 600; i++) {
    const raw = DEFAULTS.enterAt + Math.sin(i * 1.9) * 0.03; // 境目で微振動
    const s = ch.update(raw, 1, DT);
    if (s.active !== prev) flips++;
    prev = s.active;
  }
  assert.ok(flips <= 2, `境目で ${flips} 回も反転した(チャタリング)`);
});

test('入る線と出る線の差はゼロではない', () => {
  assert.ok(DEFAULTS.enterAt - DEFAULTS.exitAt >= 0.15,
    '差をゼロに近づけると必ずチャタリングする');
});

test('入る線を越えても、最小保持時間だけは待ってから確定する', () => {
  const ch = makeChannel({ key: 'gape', minCutoff: 60, beta: 0 });
  ch.calib.rest = 0; ch.calib.peak = 1;

  // 1フレームだけ跳ねた棘は、通してはいけない
  ch.update(0.95, 1, DT);
  ch.update(0.0, 1, DT);
  assert.equal(ch.state.active, false, '1フレームの棘で立ち上がった');

  // 保持時間を越えて越えたままなら、立ち上がる
  let on = false;
  for (let i = 0; i < 30; i++) { ch.update(0.95, 1, DT); if (ch.state.active) { on = true; break; } }
  assert.ok(on, '越えたままなのに立ち上がらない');
});

test('立ち上がりと立ち下がりは1フレームだけ立つ', () => {
  const ch = makeChannel({ key: 'gape', minCutoff: 60, beta: 0 });
  ch.calib.rest = 0; ch.calib.peak = 1;
  let onCount = 0, offCount = 0;
  for (let i = 0; i < 60; i++) { ch.update(0.95, 1, DT); if (ch.state.justOn) onCount++; }
  for (let i = 0; i < 60; i++) { ch.update(0.0, 1, DT); if (ch.state.justOff) offCount++; }
  assert.equal(onCount, 1);
  assert.equal(offCount, 1);
});

// ---- ③ 個人差の吸収 -------------------------------------------------

test('何もしなかった人でも、ゼロ除算にも過敏にもならない', () => {
  // 安静のまま測り終えた = peak と rest が同じになる。ここが最も壊れやすい。
  const ch = makeChannel({ key: 'gape' });
  ch.beginRestSampling();
  for (let i = 0; i < 120; i++) ch.update(0.02, 1, DT);
  ch.endRestSampling();

  assert.ok(ch.calib.peak - ch.calib.rest >= DEFAULTS.minSpan - 1e-9,
    '幅が最小値まで開いていない → ゼロ除算か極端な過敏になる');
  assert.equal(ch.calibrated, false, '動いていない人を「測れた」と言ってはいけない');

  // 安静のままでは、決して立ち上がらないこと
  let fired = false;
  for (let i = 0; i < 300; i++) { ch.update(0.02 + Math.sin(i) * 0.01, 1, DT); if (ch.state.justOn) fired = true; }
  assert.equal(fired, false, '何もしていないのに反応した');
});

test('開く量が小さい人でも、その人の最大で正規化されて届く', () => {
  // 作者の値を定数にすると、他人には反応しないゲームになる。
  const shy = makeChannel({ key: 'gape', minCutoff: 60, beta: 0 });
  shy.beginRestSampling();
  for (let i = 0; i < 120; i++) shy.update(0.03, 1, DT);
  shy.endRestSampling();

  // この人の全力は 0.30 しかない
  for (let i = 0; i < 60; i++) shy.update(0.30, 1, DT);
  assert.ok(shy.state.active, 'その人の全力で反応しないなら、その人は遊べない');
});

test('上限は上へは即座に、下へは非常にゆっくりしか動かない(疲労を隠さないため)', () => {
  const ch = makeChannel({ key: 'gape' });
  ch.calib.rest = 0;
  for (let i = 0; i < 10; i++) ch.update(0.9, 1, DT);
  assert.ok(ch.calib.peak >= 0.89, '上へは即座に追いつくこと');

  // 10秒間ずっと小さい動きしかしなくても、上限はまだ大きく残っている
  for (let i = 0; i < 600; i++) ch.update(0.2, 1, DT);
  assert.ok(ch.calib.peak > 0.55,
    `10秒で ${ch.calib.peak.toFixed(2)} まで落ちた。速すぎると、測ろうとしている疲労が隠れる`);
});

test('しきい値は追従しても、記録は生の振幅で取る', () => {
  // 遊びやすさ(追従)と、測れること(生の値)の両立。片方だけだとどちらかが壊れる。
  const ch = makeChannel({ key: 'gape', minCutoff: 60, beta: 0 });
  ch.calib.rest = 0; ch.calib.peak = 1;
  for (let i = 0; i < 40; i++) ch.update(0.62, 1, DT);   // 立ち上がる
  for (let i = 0; i < 40; i++) ch.update(0.0, 1, DT);    // 立ち下がる
  assert.ok(Math.abs(ch.state.rawPeak - 0.62) < 1e-6,
    `記録された振幅が ${ch.state.rawPeak}。正規化後ではなく生の値であること`);
});

// ---- ④ 顔を見失った時 -----------------------------------------------

test('信用できない間は、直前の値を保つ(0 に落とすと入力が暴れて誤爆する)', () => {
  const ch = makeChannel({ key: 'gape', minCutoff: 60, beta: 0 });
  ch.calib.rest = 0; ch.calib.peak = 1;
  for (let i = 0; i < 40; i++) ch.update(0.9, 1, DT);
  const before = ch.state.value;
  ch.update(0, 0, DT); // 見失った。生の値としては 0 が来る
  assert.ok(ch.state.value > before - 0.05, '見失った瞬間に値が落ちた');
  assert.equal(ch.state.active, false, '信用できない入力で active のままにはしない');
});

test('信用できない入力では、立ち上がらない', () => {
  const ch = makeChannel({ key: 'gape', minCutoff: 60, beta: 0 });
  ch.calib.rest = 0; ch.calib.peak = 1;
  let fired = false;
  for (let i = 0; i < 200; i++) { ch.update(0.95, 0.1, DT); if (ch.state.justOn) fired = true; }
  assert.equal(fired, false, '顔が見えていないのに反応した');
});

// ---- 進行表 ---------------------------------------------------------

test('1プレイは65秒。顎が連続で持つ時間の上限に近い', () => {
  assert.equal(TOTAL_MS, 65000);
  assert.ok(TOTAL_MS <= 90000, '90秒を超える設計は、上手い人ほど身体が先に限界に達する');
});

test('休みが総プレイ時間の20%ある', () => {
  const rest = SCHEDULE.filter(p => p.kind === 'rest').reduce((a, p) => a + p.ms, 0);
  const play = SCHEDULE.filter(p => p.kind !== 'warmup').reduce((a, p) => a + p.ms, 0);
  const ratio = rest / play;
  assert.ok(ratio >= 0.19, `休みが ${(ratio * 100).toFixed(0)}% しかない。顎を使う入力の下限は20%`);
});

test('新しい表情は、1ラウンドにつき1つずつしか増えない', () => {
  // 一度に3つ出すと、面白いかどうかではなく覚えられるかどうかを測ることになる。
  const rounds = SCHEDULE.filter(p => p.kind === 'round');
  let prev = 0;
  for (const r of rounds) {
    assert.ok(r.keys.length - prev <= 1,
      `${prev} → ${r.keys.length} と一度に増えた`);
    prev = Math.max(prev, r.keys.length);
  }
  assert.ok(prev <= 4, '同時に扱う新規要素は4つまで');
});

test('出題の間隔は、帯より広い(2つの的が同時に判定できる状態にならない)', () => {
  // 重なると、どの的にどの表情が当たったのか分からなくなり、計測が壊れる。
  for (const p of SCHEDULE.filter(x => x.kind === 'round')) {
    assert.ok(p.intervalMs > TIMING.bandMs,
      `${p.intervalMs}ms 間隔は帯 ${TIMING.bandMs}ms より狭い`);
    assert.ok(p.intervalMs >= TIMING.minGapMs,
      '前の表情から顔が戻る時間を割っている');
  }
});

test('帯も予告も、カメラ入力に要る幅を確保している', () => {
  assert.ok(TIMING.bandMs >= 400, `帯 ${TIMING.bandMs}ms。±200ms より狭い判定はカメラでは運ゲーになる`);
  assert.ok(TIMING.preMs >= 800, `予告 ${TIMING.preMs}ms。カメラ入力の予告は 800〜1200ms 要る`);
});

// ---- 実験装置を丸ごと走らせる ---------------------------------------

/**
 * 画面なしで人間の代わりをする。
 * @param reactionMs 的が出てから表情を作り始めるまで(＝人間 + カメラの遅れの模型)
 */
function playthrough({ mode = 'face', reactionMs = 400, jitter = 0.02,
                       wrongFaceAt = null, loseFaceFrom = null, loseFaceTo = null,
                       amplitude = () => 0.9, seed = 7 } = {}) {
  const session = makeSession({ seed, mode });
  const rig = makeRig(KEYS, mode === 'tap' ? TAP_CHANNEL_OPTS : {});
  const raws = {};
  for (const k of KEYS) raws[k] = 0.02;

  let frames = 0;
  const maxFrames = 90 * 60; // 90秒ぶんで打ち切る(無限ループの保険)

  while (!session.state.finished && frames < maxFrames) {
    frames++;
    const t = session.state.timeMs;
    const wall = session.state.wallMs;

    const lost = loseFaceFrom !== null && wall >= loseFaceFrom && wall < loseFaceTo;
    const confidence = lost ? 0 : 1;

    // どの表情を作るべきか: いま出ている的のうち、反応時間を過ぎたもの
    const want = new Set();
    for (const tg of session.state.targets) {
      if (tg.resolved) continue;
      if (t >= tg.shownAtMs + reactionMs && t <= tg.bandToMs) want.add(tg.key);
    }

    for (const k of KEYS) {
      const base = 0.02 + (Math.sin(frames * 1.7 + k.length) * jitter);
      raws[k] = want.has(k) ? amplitude(t) : base;
    }
    // わざと違う顔も作る(邪魔されるはずだが、罰されてはいけない)
    if (wrongFaceAt && t >= wrongFaceAt[0] && t <= wrongFaceAt[1]) raws.smile = 0.9;

    rig.update(raws, confidence, DT);
    session.step(DT, rig, confidence);
  }
  return { session, rig, frames };
}

test('60秒を通しで走らせると、ちゃんと的が出て、当たる', () => {
  const { session } = playthrough({ reactionMs: 350 });
  assert.equal(session.state.finished, true, '65秒で終わらなかった');
  const s = summarize(session);
  assert.ok(s.shown >= 15, `的が ${s.shown} 個しか出ていない`);
  assert.ok(s.hits >= s.shown * 0.8, `${s.shown} 個中 ${s.hits} 個しか当たらない`);
  assert.ok(s.reactionMs !== null && s.reactionMs > 0, '反応時間が取れていない');
});

test('出題される表情は、増える順のとおりに出る', () => {
  const { session } = playthrough({ reactionMs: 300 });
  const s = summarize(session);
  for (const e of EXPRESSIONS) {
    const v = s.perKey[e.key];
    if (e.ask) assert.ok(v.hits + v.misses > 0, `${e.emoji} が一度も出題されていない`);
    else assert.equal(v.hits + v.misses, 0, `${e.emoji} は出題しないはずなのに出た`);
  }
});

test('反応が遅いほど、点は下がるが、当たらなくなるわけではない', () => {
  // 遅延を「失敗の原因」ではなく「点数の差」に変える、が本当に成立しているか。
  const fast = summarize(playthrough({ reactionMs: 250 }).session);
  const slow = summarize(playthrough({ reactionMs: 1100 }).session);

  assert.ok(slow.hits >= slow.shown * 0.8,
    `850ms 遅いだけで命中率が ${slow.hitRate}% に落ちた。それは点差ではなく失敗になっている`);
  assert.ok(slow.reactionMs > fast.reactionMs + 500, '反応時間の差が記録に出ていない');
});

test('違う表情を作っても、罰されない(邪魔されるだけ)', () => {
  // 人は遊んでいると勝手に笑う。自分のせいではないことで損をした瞬間に、人はやめる。
  const clean = summarize(playthrough({ reactionMs: 350 }).session);
  const messy = summarize(playthrough({ reactionMs: 350, wrongFaceAt: [8000, 12000] }).session);

  assert.ok(messy.blocked > 0, '邪魔された記録が付いていない(検査が効いていない)');
  assert.ok(messy.misses <= clean.misses + 3,
    `違う顔を作っただけで見逃しが ${clean.misses} → ${messy.misses} に増えた。それは罰`);
});

test('顔を見失っている間、ゲームは進まない', () => {
  // 操作できないのに失敗するのは、理不尽の中でいちばん強い種類。
  const { session } = playthrough({ reactionMs: 350, loseFaceFrom: 20000, loseFaceTo: 26000 });
  assert.ok(session.state.wallMs > session.state.timeMs + 3000,
    `実時間 ${Math.round(session.state.wallMs)}ms に対し進行 ${Math.round(session.state.timeMs)}ms。` +
    '見失っている間も進んでしまっている');
  const s = summarize(session);
  assert.ok(s.lostEvents > 0, '見失ったことが記録されていない');
});

test('決定論的: 同じ種なら、同じ出題順になる', () => {
  const a = summarize(playthrough({ seed: 99, reactionMs: 350 }).session);
  const b = summarize(playthrough({ seed: 99, reactionMs: 350 }).session);
  assert.equal(a.hits, b.hits);
  assert.equal(a.shown, b.shown);
});

test('疲れて動きが小さくなっても、遊べなくならない', () => {
  // 後半ほど動作は小さくなる。しきい値を固定していると「後半だけ反応しない」になる。
  const tired = playthrough({
    reactionMs: 400,
    amplitude: t => Math.max(0.30, 0.9 - (t / 65000) * 0.6), // 0.9 → 0.30 まで落ちる
  });
  const s = summarize(tired.session);
  const late = tired.session.log.hits.filter(h => h.atMs > 40000).length;
  assert.ok(late >= 4, `後半に ${late} 発しか当たっていない。疲れた人が締め出されている`);
  assert.ok(s.fatigue && s.fatigue.dropPct > 20,
    `疲れ(振幅の低下)が ${s.fatigue?.dropPct}% としか出ていない。追従が記録まで汚している`);
});

// ---- 計測 -----------------------------------------------------------

test('タップとの差で、引き継ぎ文書の分岐条件を判定する', () => {
  // 顔の絶対値には人間の反応時間がそのまま乗っている。それを見て 200ms を
  // 判定すると、カメラのせいではないものをカメラのせいにしてしまう。
  const tap = summarize(playthrough({ mode: 'tap', reactionMs: 300 }).session);
  const slowFace = summarize(playthrough({ mode: 'face', reactionMs: 700 }).session);
  const okFace = summarize(playthrough({ mode: 'face', reactionMs: 420 }).session);

  const bad = compare({ tap, face: slowFace });
  assert.equal(bad.ready, true);
  assert.ok(bad.reactionDeltaMs > 200);
  assert.equal(bad.verdict, 'discrete-only', '200ms を超えたのに離散操作へ振り切る判定が出ない');

  const good = compare({ tap, face: okFace });
  assert.ok(good.reactionDeltaMs <= 200);
  assert.equal(good.verdict, 'continuous-ok');
});

test('片方しか遊んでいなければ、差は「まだ出ていない」と言う', () => {
  const tap = summarize(playthrough({ mode: 'tap', reactionMs: 300 }).session);
  const cmp = compare({ tap });
  assert.equal(cmp.ready, false);
  assert.equal(cmp.missing, 'face');
});

test('誤爆が多い表情を名指しできる', () => {
  const { session } = playthrough({ reactionMs: 350 });
  // 出題していない 😗 が勝手に立ち上がった状況を作る
  for (let i = 0; i < 12; i++) session.log.falseFires.push({ key: 'pucker', atMs: i * 3000 });
  const s = summarize(session);
  const bad = unusableExpressions(s);
  assert.ok(bad.some(b => b.key === 'pucker'), '誤爆の多い表情を名指しできていない');
});

test('出題しない2つも、裏でずっと数えている', () => {
  const notAsked = EXPRESSIONS.filter(e => !e.ask).map(e => e.key);
  assert.deepEqual(notAsked.sort(), ['blink', 'pucker'],
    '出題しない表情が変わったら、その理由を docs/face-game.md §5-1 に書くこと');
  const s = summarize(playthrough({ reactionMs: 350 }).session);
  for (const k of notAsked) {
    assert.ok(k in s.perKey, `${k} が集計から抜けている。数えないなら測る意味がない`);
  }
});

// ---- 入力層が漏れていないか -----------------------------------------

test('ゲームのルールに、カメラ固有の名前が1つも出てこない', () => {
  // 入力を差し替えても作り直しにならないことの、機械で見られる唯一の証拠。
  // jawOpen / landmark / blendshape が game.js に出てきたら、そこが漏れている場所。
  const src = readFileSync(new URL('../src/face/game.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const bad of ['jawOpen', 'landmark', 'blendshape', 'getUserMedia', 'video']) {
    assert.ok(!code.includes(bad), `game.js に ${bad} が出てきている = 入力層が漏れている`);
  }
});

test('タップと顔で、ヒステリシスと最小保持は同じ値(差に出てはいけない)', () => {
  // ここが違うと、引き算で消えず、カメラのせいでない差がカメラの数字に混ざる。
  assert.equal(TAP_CHANNEL_OPTS.enterAt, undefined);
  assert.equal(TAP_CHANNEL_OPTS.exitAt, undefined);
  assert.equal(TAP_CHANNEL_OPTS.minHoldMs, undefined);
  // 平滑化だけは切る。One Euro の遅れはカメラ側の費用なので、差に出るべき。
  assert.ok(TAP_CHANNEL_OPTS.minCutoff > 10, 'タップ側で平滑化が効いていると、差が小さく見える');
  assert.equal(TAP_CHANNEL_OPTS.beta, 0);
});

test('同じ人が両方遊べば、同じゲームとして成立する', () => {
  const tap = summarize(playthrough({ mode: 'tap', reactionMs: 300 }).session);
  const face = summarize(playthrough({ mode: 'face', reactionMs: 450 }).session);
  assert.equal(tap.shown, face.shown, '入力を変えたら的の数まで変わった = 別のゲームになっている');
});

// ---- 描画に渡す値 ---------------------------------------------------

test('的の位置は 0 から始まり、帯を通って下端へ抜ける', () => {
  const tg = { shownAtMs: 1000, bandFromMs: 1000 + TIMING.travelMs, bandToMs: 1000 + TIMING.travelMs + TIMING.bandMs };
  assert.equal(targetProgress(tg, 1000), 0);
  const atBandTop = targetProgress(tg, tg.bandFromMs);
  assert.ok(atBandTop > 0.3 && atBandTop < 0.7, `帯の入口が ${atBandTop} では画面の外`);
  assert.ok(targetProgress(tg, tg.bandToMs) >= 1);
  assert.ok(targetProgress(tg, tg.bandToMs + 99999) <= 1.15, '画面の下に無限に落ちていく');
});

// ---- 表情の定義 -----------------------------------------------------

test('使う blendshape の名前は、モデルに実在する52個の中にある', () => {
  // face_landmarker.task の中の face_blendshapes.tflite から実際に取り出した一覧。
  // ここを間違えると、例外は出ず、ただ永久に反応しなくなる。
  const REAL = new Set(`_neutral browDownLeft browDownRight browInnerUp browOuterUpLeft
browOuterUpRight cheekPuff cheekSquintLeft cheekSquintRight eyeBlinkLeft eyeBlinkRight
eyeLookDownLeft eyeLookDownRight eyeLookInLeft eyeLookInRight eyeLookOutLeft eyeLookOutRight
eyeLookUpLeft eyeLookUpRight eyeSquintLeft eyeSquintRight eyeWideLeft eyeWideRight
jawForward jawLeft jawOpen jawRight mouthClose mouthDimpleLeft mouthDimpleRight
mouthFrownLeft mouthFrownRight mouthFunnel mouthLeft mouthLowerDownLeft mouthLowerDownRight
mouthPressLeft mouthPressRight mouthPucker mouthRight mouthRollLower mouthRollUpper
mouthShrugLower mouthShrugUpper mouthSmileLeft mouthSmileRight mouthStretchLeft
mouthStretchRight mouthUpperUpLeft mouthUpperUpRight noseSneerLeft noseSneerRight`.split(/\s+/));
  assert.equal(REAL.size, 52, '一覧そのものが壊れている');
  for (const e of EXPRESSIONS) {
    for (const s of e.shapes) {
      assert.ok(REAL.has(s), `${e.emoji} が使う "${s}" はモデルに無い`);
    }
  }
});

// ---- 画面とコードのつなぎ目 -----------------------------------------

test('main.js が触る要素は、すべて face.html に実在する', () => {
  // id を1つ書き換えただけで画面が黙って動かなくなる。例外はコンソールの中で、
  // 遊んでいる人には「反応しないゲーム」としか見えない。
  const js = readFileSync(new URL('../src/face/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../face.html', import.meta.url), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  const used = new Set([...js.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
  assert.ok(used.size > 10, '検査そのものが要素を拾えていない');
  const missing = [...used].filter(k => !ids.has(k)).sort();
  assert.deepEqual(missing, [], `face.html に無い要素を触っている: ${missing.join(', ')}`);
});

test('face.html は、カメラを開く前に何に使うかを見せている', () => {
  // いきなり getUserMedia を呼ぶと拒否される。そして拒否は取り返しがつかない。
  const html = readFileSync(new URL('../face.html', import.meta.url), 'utf8');
  const intro = html.slice(html.indexOf('id="intro"'), html.indexOf('id="loading"'));
  assert.match(intro, /端末の中だけ/, '推論がローカル完結であることを許可の前に書く');
  assert.match(intro, /送りません/, '映像を送らないことを許可の前に書く');
  assert.match(intro, /ゆびだけでも|指だけでも/, '拒否した人の経路を許可の前に示す');
  assert.ok(html.indexOf('id="goFace"') > intro.indexOf('端末の中だけ') + html.indexOf('id="intro"'),
    'カメラのボタンより先に、理由が画面に出ていること');
});

test('画面のどこにも、治療や効果をうたう言葉が無い', () => {
  // 日本では治療効果をうたうと医療機器の該当性の話になる。
  // 「顔の体操」「表情のトレーニング」「遊び」なら問題ない。中身は同じで言葉だけの違い。
  const html = readFileSync(new URL('../face.html', import.meta.url), 'utf8');
  const js = ['main.js', 'metrics.js', 'game.js', 'expressions.js']
    .map(f => readFileSync(new URL(`../src/face/${f}`, import.meta.url), 'utf8')).join('\n');
  // コメントは実装者向けなので、画面に出る文字列だけを見る
  const visible = html + js.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const word of ['リハビリ', '治療', '医療', '改善します', '効果があります', '症状']) {
    assert.ok(!visible.includes(word), `画面に出る文字列に「${word}」がある`);
  }
});

test('出題する表情は、口と眉に散っている(部位が散るかの検証になる)', () => {
  const parts = new Set(ASKABLE.map(e => e.shapes[0].replace(/[A-Z].*$/, '')));
  assert.ok(parts.size >= 2, `出題する表情が ${[...parts]} だけ。同じ部位なら「散る」の検証にならない`);
  assert.ok(ASKABLE.length === 3, '出題は3つ。5つ同時は覚えられるかどうかの測定になる');
  assert.ok(BY_KEY.get('gape').ask, '顎はいちばん信号が大きい。最初の一本はこれ');
});
