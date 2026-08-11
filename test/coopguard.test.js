// ============================================================
// coopguard.test.js — 盾持ちが「実際にエンジンの中で」効いていることの検証
//
// guard.test.js は規則そのものを見る。ここは規則が**繋がっている**かを見る。
// 単体で正しくても、配線が抜けていれば遊びには一切現れない —— 実際、
// きずなの頃も「線は見えるのに何も起きない」で一度そうなった。
//
// 確かめること:
//   1. ソロには盾持ちが1体も湧かないこと(ひとりでは倒せない敵なので)
//   2. 共闘では湧き、盾が誰かに向いていること
//   3. **塞がれている人の弾は通らないこと**(HPが減らないこと)
//   4. 塞がれていない人の弾は通り、しかも普通より大きく入ること
//   5. 相方から届いた命中も、ホスト側で同じ規則で弾かれること
//      —— 名乗りではなく線が送り主を決めるので、なりすませない
//   6. 人数ぶんの脅威が正比例で増えていること
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot, sim, makeHunter, shutdown, unseed } from './headless.js';

/** 共闘の状態を、通信なしで作る。相方は「そこに居ることになっている」だけ。 */
function fakeParty(Coop, ids, place) {
  Coop.role = 'host';
  Coop.connected = true;
  Coop.selfId = 'H';
  Coop.peers.clear();
  const now = 1e9;   // seenAt を未来に置いて livePeers から落ちないようにする
  ids.forEach((id, i) => {
    Coop.peers.set(id, {
      id, name: id, x: place[i].x, y: place[i].y, alive: true,
      seenAt: now, score: 0, dead: false, face: 0,
    });
  });
  // livePeers() は performance.now() との差を見る。未来の seenAt でも通るように、
  //   「いま」を固定して常に新鮮に見せる。
  const realNow = performance.now.bind(performance);
  performance.now = () => now;
  return () => { performance.now = realNow; };
}

test('ソロには盾持ちが湧かない(ひとりでは倒せない敵を出さない)', async () => {
  const h = await boot({ seed: 3 });
  h.engine.startRun(0);
  let sawGuard = false;
  sim(h, {
    steps: 60 * 90,
    bot: makeHunter(h.geo),
    until: g => { if (g.enemies.some(e => e.guard)) sawGuard = true; return sawGuard || g.state === 'over'; },
  });
  shutdown(h); unseed();
  assert.equal(sawGuard, false, 'ソロの画面に盾持ちが混ざっていないこと');
});

test('共闘では盾持ちが湧き、盾が誰かを向いている', async () => {
  const h = await boot({ seed: 11 });
  const { Coop } = await import('../src/coop.js');
  const restore = fakeParty(Coop, ['G1'], [{ x: 0.5, y: 0.9 }]);
  h.engine.startRun(0);
  h.state.game.coop = true;

  let guard = null;
  sim(h, {
    steps: 60 * 120,
    bot: makeHunter(h.geo),
    until: g => {
      const found = g.enemies.find(e => e.guard && e.blocked);
      if (found) guard = found;
      return !!guard || g.state === 'over';
    },
  });
  const players = h.state.game.players;
  shutdown(h); restore(); unseed();

  assert.ok(guard, '盾持ちが湧いたこと');
  assert.equal(guard.blocked.size, 1, '2人なら盾は1枚');
  assert.ok(players && players.length === 2, '自分と相方の2人が数えられていること');
});

test('塞がれている人の弾は通らず、塞がれていない人の弾は大きく入る', async () => {
  const h = await boot({ seed: 5 });
  const { Coop } = await import('../src/coop.js');
  const { canHit, GUARD } = await import('../src/guard.js');
  const restore = fakeParty(Coop, ['G1'], [{ x: 0.5, y: 0.9 }]);
  h.engine.startRun(0);
  h.state.game.coop = true;

  // 敵を手で1体置く。湧きを待つと、どの位置に来るかが運になる。
  const g = h.state.game;
  const e = { id: 9001, guard: true, delay: 0, hp: 100, maxHp: 100, size: 20,
    x: g.player.x, y: g.player.y - 200, blocked: null, blockFlash: 0, flash: 0 };

  // 自分を近くに、相方を遠くに置く → 自分が塞がれる
  g.players = [
    { id: h.engine.selfKey(), x: e.x, y: e.y + 40 },
    { id: 'G1', x: e.x, y: e.y + 500 },
  ];
  const { updateGuards } = await import('../src/guard.js');
  updateGuards([e], g.players);

  assert.equal(canHit(e, h.engine.selfKey()), false, '近い自分は弾かれる');
  assert.equal(canHit(e, 'G1'), true, '遠い相方は通る');

  // 立ち位置を入れ替えると、役もそのまま入れ替わる
  g.players[0].y = e.y + 500; g.players[1].y = e.y + 40;
  updateGuards([e], g.players);
  assert.equal(canHit(e, h.engine.selfKey()), true, '下がったら撃てる側になる');
  assert.equal(canHit(e, 'G1'), false);

  shutdown(h); restore(); unseed();
  assert.ok(GUARD.BACK_MUL > 1, '背中は普通より大きく入ること');
});

test('相方から届いた命中も、ホスト側の盾で弾かれる', async () => {
  const h = await boot({ seed: 6 });
  const { Coop } = await import('../src/coop.js');
  const { updateGuards } = await import('../src/guard.js');
  const restore = fakeParty(Coop, ['G1'], [{ x: 0.5, y: 0.9 }]);
  h.engine.startRun(0);
  const g = h.state.game;
  g.coop = true;

  const e = { id: 9002, guard: true, delay: 0, hp: 100, maxHp: 100, size: 20,
    x: 200, y: 200, blocked: null, blockFlash: 0, flash: 0, pts: 10 };
  g.enemies = [e];
  // 相方 G1 を敵のすぐ横に = 一番近い = 塞がれる側にする
  g.players = [{ id: h.engine.selfKey(), x: 200, y: 700 }, { id: 'G1', x: 200, y: 240 }];
  updateGuards(g.enemies, g.players);

  const before = e.hp;
  Coop.onPartnerHit(9002, 30, 0, 'G1');
  assert.equal(e.hp, before, '塞がれている相方の命中は入らない');

  // 自分は遠いので通る
  Coop.onPartnerHit(9002, 30, 0, h.engine.selfKey());
  assert.equal(e.hp, before - 30, '塞がれていない側の命中は入る');

  shutdown(h); restore(); unseed();
});

test('人数ぶんの脅威が正比例で増える(人数が増えて楽にならない)', async () => {
  const h = await boot({ seed: 2 });
  const { coopScaling } = h.engine;
  shutdown(h); unseed();

  const two = coopScaling(2), three = coopScaling(3), four = coopScaling(4);
  // 人数が2倍なら、湧きもボスの硬さも約2倍。**比が人数の比に一致すること。**
  assert.ok(Math.abs(four.spawn / two.spawn - 2) < 0.01, `湧きが人数に比例 (${two.spawn}→${four.spawn})`);
  assert.ok(Math.abs(four.hp / two.hp - 2) < 0.01, `ボスの硬さが人数に比例 (${two.hp}→${four.hp})`);
  // 弾の量と残機は比例まではしないが、必ず増える向きであること
  assert.ok(four.atk > three.atk && three.atk > two.atk, '弾の量が人数で増える');
  assert.ok(four.lives > three.lives && three.lives > two.lives, '残機が人数で増える');
  // **残機はソロ(3機)から離れすぎない。** 前は 2人=5機で、配りすぎていた。
  assert.equal(two.lives, 4);
  // 4人なら盾持ちは2体。1体だと3人が手持ち無沙汰になる。
  assert.equal(four.guards, 2);
  assert.equal(two.guards, 1);
});
