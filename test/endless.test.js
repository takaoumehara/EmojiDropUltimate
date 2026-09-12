// ============================================================
// endless.test.js — 「終わらない」が本当に終わらないかの検証
//
// ここで押さえたいのは4つ。どれも、遊んで気づくまでに何十分もかかる壊れ方。
//
//   1. 飽き   … テーマは7個しかない。引き方を間違えると2ワールド続けて
//                同じ絵が出る。無限モードを殺すのは難易度ではなく既視感。
//   2. 詰み   … 難易度が青天井だと、どこかで腕と関係なく勝てなくなる。
//                上限があることを、遊ばずに確かめられる形で縛る。
//   3. 途切れ … ボスを倒したあと、勝利画面で解散しないこと。共闘はこれで
//                「4人で集まって1ボスで終わり」になっていた。
//   4. ズレ   … 共闘は次の面を各自が計算する。**全員が同じ面を作る**のが
//                前提で、ここに Math.random が1つ混ざると、同じ部屋にいるのに
//                別々の敵を撃つ。一番怖い壊れ方なので名指しで押さえる。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './bootstrap.js';
import { boot, sim, makeHunter, shutdown, unseed } from './headless.js';
import { themeForWorld, THEME_COUNT, scaleStage, proceduralStage } from '../src/aistage.js';

const LONG = 60 * 900;   // ゲーム内15分ぶん。2ワールド通すのに実測9,500歩ほど

// --- 1. 飽きないか -------------------------------------------------------

test('テーマは一巡するまで繰り返さない', () => {
  const seen = new Set();
  for (let w = 1; w <= THEME_COUNT; w++) seen.add(themeForWorld('run-a', w));
  assert.equal(seen.size, THEME_COUNT, `${THEME_COUNT}ワールドで${THEME_COUNT}種類すべて出ること`);
});

test('周をまたいでも同じテーマが2連続で出ない', () => {
  // 周の変わり目(7→8, 14→15 …)が一番危ない。ここが素通しだと、
  // せっかく袋引きにしても継ぎ目でだけ同じ絵が2回続く。
  for (const seed of ['a', 'b', 'c', 'run-2026', 'coop-99']) {
    let prev = -1;
    for (let w = 1; w <= THEME_COUNT * 6; w++) {
      const th = themeForWorld(seed, w);
      assert.notEqual(th, prev, `種 ${seed} のワールド ${w} でテーマが連続した`);
      prev = th;
    }
  }
});

test('同じ種なら誰が計算しても同じテーマ順になる', () => {
  for (let w = 1; w <= 30; w++) {
    assert.equal(themeForWorld('shared', w), themeForWorld('shared', w));
  }
  // 種が違えば並びも変わる(全ワールド一致は袋引きが効いていない証拠)
  const a = Array.from({ length: 14 }, (_, i) => themeForWorld('seed-a', i + 1));
  const b = Array.from({ length: 14 }, (_, i) => themeForWorld('seed-b', i + 1));
  assert.notDeepEqual(a, b);
});

// --- 2. 詰まないか -------------------------------------------------------

test('難易度は上がり続けるが、頭を打つ', () => {
  const base = proceduralStage(() => 0.5, 0);
  const hp = w => scaleStage(base, w).enemies[0].hp;
  const bossHp = w => scaleStage(base, w).boss.hp;

  // 上がってはいる(伸びないなら、そもそも進む意味がない)
  assert.ok(hp(10) > hp(1), 'ワールド10は1より硬いこと');
  assert.ok(bossHp(10) > bossHp(1), 'ボスも硬くなること');

  // だが青天井ではない。一次関数のままならワールド1000で敵HPは160倍になる。
  assert.ok(hp(1000) <= hp(1) * 3.1, `敵HPの伸びに上限があること (${hp(1)} → ${hp(1000)})`);
  assert.ok(bossHp(1000) <= bossHp(1) * 3.7, `ボスHPの伸びに上限があること (${bossHp(1)} → ${bossHp(1000)})`);

  // 単調(どこかのワールドだけ急に楽になると、進んだ実感が壊れる)
  for (let w = 2; w <= 60; w++) {
    assert.ok(bossHp(w) >= bossHp(w - 1), `ワールド ${w} でボスが弱くなった`);
  }
});

test('道中は詰まるが、ボス連戦にはならない', () => {
  const base = proceduralStage(() => 0.5, 0);
  const dur = w => scaleStage(base, w).dur;
  assert.ok(dur(20) < dur(1), 'ワールドが進むほど道中は短くなること');
  assert.ok(dur(1000) >= 26000, `道中が消滅しないこと (${dur(1000)}ms)`);
});

// --- 3〜4. 実際に走らせて確かめる ----------------------------------------

/**
 * ボスを「あと一撃」の状態に保つボット。
 *
 * ここで見たいのは腕前ではなく **倒したあとに何が起きるか** なので、
 * ボス戦の削りだけを短縮する。道中・湧き・被弾・撃破判定・演出・
 * 次の面の生成・遷移は、すべて本物の経路をそのまま通る。
 * (短縮しないと1ワールドに実測7分かかり、テストとして回せない)
 */
function meltBoss(bot, Coop) {
  return (t, g) => {
    const b = g.boss;
    if (b && !b.entering && b.hp > 6) {
      b.hp = 6;
      if (g.coop) Coop.bossShared = 6;   // 共闘のHPはこちらが正
    }
    return bot(t, g);
  };
}

/** ワールド2の頭まで共闘を走らせる。randomSeed = 「どの端末か」。 */
async function runCoop(randomSeed, lives = 12) {
  const h = await boot({ seed: randomSeed });
  const { Coop } = await import('../src/coop.js');
  Coop.reset();
  Coop.active = true; Coop.role = 'host'; Coop.connected = true;
  Coop.seed = 4242; Coop.mode = 'ai';
  Coop.onMsg({ t: 'hello', name: 'ともだち' }, '2');   // 2人部屋にする
  h.engine.startCoop();
  h.state.game.lives = lives;   // 道中で力尽きる前にワールドの継ぎ目まで届かせる
  const r = sim(h, {
    steps: LONG,
    bot: meltBoss(makeHunter(h.geo), Coop),
    until: g => (g.world >= 2 && (g.state === 'intro' || g.state === 'play'))
      || g.state === 'over' || g.state === 'victory',
  });
  shutdown(h);
  return { r, game: h.state.game };
}

test('共闘はボスを倒しても終わらず、次のワールドが出る', async () => {
  const { r, game } = await runCoop(11);
  unseed();
  assert.equal(r.error, null, r.error && r.error.stack);
  assert.notEqual(game.state, 'victory', 'ボス1体で解散しないこと');
  assert.ok(game.world >= 2, `次のワールドへ進むこと (world=${game.world})`);
  assert.ok(r.states.includes('finale'), `突破の演出を通ること: ${r.states.join('>')}`);
  assert.ok(game.stages[0] && game.stages[0].boss, '次の面にもボスが居ること');
  assert.equal(game.stageIndex, 0, '次のワールドは新しい1面として始まること');
});

test('共闘の次の面は、端末が違っても同じになる', async () => {
  // 同じ部屋(同じ Coop.seed)なら、各自が別々に計算しても同じ面でなければ
  // ならない。Math.random の種を変えるのは「別の端末で回した」ということ。
  const a = await runCoop(101);
  const stageA = JSON.parse(JSON.stringify(a.game.stages[0]));
  const worldA = a.game.world;
  const b = await runCoop(999);
  const stageB = JSON.parse(JSON.stringify(b.game.stages[0]));
  unseed();

  assert.ok(worldA >= 2 && b.game.world >= 2, '両方とも次のワールドまで進むこと');
  assert.equal(worldA, b.game.world, '同じワールド番号であること');
  assert.deepEqual(stageA, stageB, '乱数の種が違っても、同じ部屋なら同じ面になること');
});

test('ワールド突破の残機回復は、上限を超えている人から取り上げない', async () => {
  // 上限(2人部屋なら5)より多く持った状態でワールドを突破させる。
  //   Math.min(lives + 1, cap) で書くと、ここで 99 が 5 に切り下がる ——
  //   ベルや形見で増やした残機を、突破したごほうびとして没収することになる。
  const { game } = await runCoop(23, 99);
  unseed();
  assert.ok(game.world >= 2, 'ワールドを突破していること');
  assert.ok(game.livesCap > 0 && game.livesCap < 20, `回復の上限が決まっていること (${game.livesCap})`);
  assert.ok(game.lives > game.livesCap, `上限超えの残機が没収されないこと (${game.lives} > ${game.livesCap})`);
});

test('ソロのエンドレスはワールドが繋がり続ける', async () => {
  const h = await boot({ seed: 5 });
  const { Coop } = await import('../src/coop.js');
  // requestAIStage はサーバーを叩く。ここで見たいのは繋がり方なので、
  // 手続き生成の面から始める(サーバーが落ちていても通る経路と同じ)。
  h.engine.startFromSeed('endless-test');
  const g0 = h.state.game;
  g0.endless = true; g0.world = 1; g0.worldSeed = 'endless-test';
  g0.lives = 12; g0.livesCap = 12;
  const r = sim(h, {
    steps: LONG,
    bot: meltBoss(makeHunter(h.geo), Coop),
    until: g => g.world >= 3 || g.state === 'over' || g.state === 'victory',
  });
  shutdown(h); unseed();
  assert.equal(r.error, null, r.error && r.error.stack);
  assert.notEqual(r.game.state, 'victory', 'エンドレスに勝利画面は無い');
  assert.ok(r.game.world >= 3, `2回続けて次のワールドへ進むこと (world=${r.game.world})`);
  assert.ok(r.game.aiMode, '2ワールド目以降も「エンドレス」の見出しのままであること');
});
