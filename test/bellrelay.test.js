// ============================================================
// bellrelay.test.js — ベルの受け渡しの検証
//
// 守りたいのは4つ。
//   1. 同じ人が何度鳴らしても位は上がらないこと
//      —— ここが崩れると、ソロの連射がそのまま最高位になる
//   2. 人数がそのまま位の上限になること(4人だからこその見返り)
//   3. 位が下がらないこと —— ゲストはスナップショットで who を捨てるので、
//      長さで上書きすると位が点滅する
//   4. 数を増やす効果(残機・パワー)が掛け算にならないこと
//      —— 位4で残機が4個増えたら、難しくした意味が全部消える
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ring, bellBoost, rankInfo, MAX_RANK, RANKS } from '../src/bellrelay.js';

test('ひとりが何発鳴らしても位1のまま(ソロの上限)', () => {
  const bell = {};
  for (let i = 0; i < 20; i++) ring(bell, 'A');
  assert.equal(bell.rank, 1);
});

test('違う人が鳴らすたびに位が上がる', () => {
  const bell = {};
  assert.equal(ring(bell, 'A'), 1);
  assert.equal(ring(bell, 'B'), 2);
  assert.equal(ring(bell, 'C'), 3);
  assert.equal(ring(bell, 'D'), 4);
});

test('位は部屋の定員で頭打ち(5人目が来ても壊れない)', () => {
  const bell = {};
  for (const id of ['A', 'B', 'C', 'D', 'E', 'F']) ring(bell, id);
  assert.equal(bell.rank, MAX_RANK);
  assert.equal(bell.who.length, MAX_RANK);
});

test('間に同じ人が挟まっても数え間違えない', () => {
  const bell = {};
  ring(bell, 'A'); ring(bell, 'A'); ring(bell, 'B');
  ring(bell, 'A'); ring(bell, 'B'); ring(bell, 'C');
  assert.equal(bell.rank, 3);
});

test('位は下がらない —— ゲストが who を捨てても点滅しない', () => {
  // ホストから位3で届く。ゲストは who を空で持つ(誰が鳴らしたかは知らない)。
  const bell = { rank: 3, who: [] };
  // ゲストが自分で1発鳴らす。who の長さは1だが、位は3のまま。
  assert.equal(ring(bell, 'me'), 3);
});

test('スコアだけは派手に伸びる(位4で16倍)', () => {
  assert.deepEqual(bellBoost('points', 1), { mul: 1, add: 0 });
  assert.deepEqual(bellBoost('points', 2), { mul: 4, add: 0 });
  assert.deepEqual(bellBoost('points', 4), { mul: 16, add: 0 });
});

test('数を増やす効果は +1 ずつ。掛け算にしない', () => {
  for (const eff of ['power', 'option', 'bomb', 'life']) {
    assert.deepEqual(bellBoost(eff, 1), { mul: 1, add: 0 }, eff);
    assert.deepEqual(bellBoost(eff, 4), { mul: 1, add: 3 }, eff);
  }
});

test('持続時間は位で伸びるが、青天井にはしない', () => {
  assert.equal(bellBoost('speed', 1).mul, 1);
  assert.ok(bellBoost('speed', 4).mul > 1 && bellBoost('speed', 4).mul <= 3);
});

test('位の情報は 1〜4 の外を渡されても落ちない', () => {
  assert.equal(rankInfo(0), RANKS[0]);
  assert.equal(rankInfo(99), RANKS[MAX_RANK - 1]);
  assert.equal(rankInfo(undefined), RANKS[0]);
});

test('位ごとの倍率が単調に増える(見た目と効果が食い違わない)', () => {
  for (let r = 2; r <= MAX_RANK; r++) {
    assert.ok(RANKS[r - 1].mul > RANKS[r - 2].mul, `位${r}`);
  }
});
