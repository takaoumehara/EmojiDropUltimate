// ============================================================
// guard.test.js — 盾持ち(せなか)の検証
//
// 守りたいのは5つ。どれが壊れても「人数が増えると楽になる」に逆戻りする。
//   1. ひとりでは絶対に成立しないこと(=ソロに紛れ込ませても倒せてしまわない)
//   2. **必ずちょうど1人だけ**が撃てる側に残ること(詰みも、ザルも作らない)
//   3. 撃てる人が「一番遠い人」であること(前に出た人が代償を払っていること)
//   4. 距離が同じでも、どの端末から見ても同じ答えになること
//      —— 割れると「自分は撃てるつもりなのにホストが弾く」が起きる
//   5. 倒れた人が数から抜けること(残った人が詰まないこと)
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUARD, shieldCount, blockedIds, updateGuards, canHit } from '../src/guard.js';

const P = (id, x, y) => ({ id, x, y });

test('ひとりのときは盾が立たない(ソロに出しても詰みにならない)', () => {
  const b = blockedIds(100, 100, [P('A', 100, 400)]);
  assert.equal(b.size, 0);
  assert.equal(canHit({ guard: true, blocked: b }, 'A'), true);
});

test('盾の枚数は人数より必ず1枚少ない', () => {
  assert.equal(shieldCount(1), 0);
  assert.equal(shieldCount(2), 1);
  assert.equal(shieldCount(3), 2);
  assert.equal(shieldCount(4), 3);
});

test('5人ぶん渡されても盾は3枚で頭打ち(部屋の定員を超えた数が来ても壊れない)', () => {
  assert.equal(shieldCount(5), GUARD.MAX_SHIELDS);
  assert.equal(shieldCount(99), GUARD.MAX_SHIELDS);
});

for (const n of [2, 3, 4]) {
  test(`${n}人なら、撃てるのはちょうど1人だけ`, () => {
    // 敵を真ん中に置き、距離を全員バラバラにする
    const players = [];
    for (let i = 0; i < n; i++) players.push(P('P' + i, 100, 200 + i * 60));
    const blocked = blockedIds(100, 100, players);
    const free = players.filter(p => !blocked.has(p.id));
    assert.equal(free.length, 1, '撃てる人がちょうど1人');
    assert.equal(blocked.size, n - 1, '残り全員が塞がれている');
  });
}

test('撃てるのは「一番遠い人」—— 前に出た人は撃てない', () => {
  const near = P('near', 100, 150);    // 敵のすぐ下(囮)
  const mid = P('mid', 100, 300);
  const far = P('far', 100, 600);      // 一番下がっている(狙撃)
  const blocked = blockedIds(100, 100, [near, mid, far]);
  assert.equal(blocked.has('near'), true, '一番近い人は塞がれる');
  assert.equal(blocked.has('mid'), true);
  assert.equal(blocked.has('far'), false, '一番遠い人だけが撃てる');
});

test('前に出れば役が入れ替わる(立ち位置だけで交代できる)', () => {
  const a = P('A', 100, 600), b = P('B', 100, 200);
  assert.equal(blockedIds(100, 100, [a, b]).has('B'), true, 'B が近いので B が塞がれる');
  // A が前に出て、B が下がる
  a.y = 200; b.y = 600;
  assert.equal(blockedIds(100, 100, [a, b]).has('A'), true, '入れ替わったら A が塞がれる');
  assert.equal(blockedIds(100, 100, [a, b]).has('B'), false);
});

test('距離が完全に同じでも、どの端末から見ても同じ答えになる', () => {
  // まったく同じ距離。並び順だけが違う2つの配列を渡す。
  const l = P('L', 60, 100), r = P('R', 140, 100);
  const one = blockedIds(100, 100, [l, r]);
  const two = blockedIds(100, 100, [r, l]);
  assert.deepEqual([...one], [...two], '渡す順で答えが変わらないこと');
});

test('倒れた人を外して渡せば、残った人数ぶんの盾になる', () => {
  // 4人のうち2人が倒れた = 生きているのは2人。盾は1枚に減る。
  const alive = [P('A', 100, 300), P('B', 100, 500)];
  const blocked = blockedIds(100, 100, alive);
  assert.equal(blocked.size, 1);
  assert.equal(blocked.has('B'), false, '生き残りのうち遠いほうは撃てる');
});

test('ひとりだけ生き残ったら盾はゼロ(残された人が詰まない)', () => {
  const blocked = blockedIds(100, 100, [P('A', 100, 300)]);
  assert.equal(blocked.size, 0);
});

test('盾持ちでない敵は誰でも撃てる', () => {
  const e = { guard: false, blocked: new Set(['A']) };
  assert.equal(canHit(e, 'A'), true);
});

test('updateGuards は湧く前(delay 中)の敵には盾を張らない', () => {
  const waiting = { guard: true, delay: 400, x: 0, y: 0, blocked: null };
  const live = { guard: true, delay: 0, x: 100, y: 100, blocked: null };
  updateGuards([waiting, live], [P('A', 100, 300), P('B', 100, 500)]);
  assert.equal(waiting.blocked, null, 'まだ出てきていない敵は判定しない');
  assert.equal(live.blocked.size, 1);
});

test('背中を撃った時の倍率が、ただの雑魚より大きい', () => {
  // 数値そのものを固定はしない(調整するので)。**向き**だけを守る。
  assert.ok(GUARD.BACK_MUL > 1, '回り込んだ見返りが出ていること');
  assert.ok(GUARD.HP_MUL > 1, '一度も役が入れ替わらないうちに溶けないこと');
  assert.ok(GUARD.SPEED_MUL < 1, '距離の順位が事故で決まらない程度に遅いこと');
});
