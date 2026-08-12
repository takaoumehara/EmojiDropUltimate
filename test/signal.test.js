// ============================================================
// signal.test.js — 出会いの仕組み(api/signal.js)の検証
//
// ここが壊れると、遊ぶ前に詰む。守りたいのは3つ。
//   1. **v1(2人版)のクライアントが今まで通り繋がること。**
//      2人版と4人版が同時に世に出るので、片方だけが動く状態を作れない
//   2. 部屋の顔ぶれが、全員に同じ順で見えること(ホストの後継がここで決まる)
//   3. 5人目が弾かれること、そして消えた人が居座らないこと
//
// KV は差し替える。ここで確かめたいのは Redis ではなく、こちらの段取り。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/signal.js';

const { _joinRoom: joinRoom, _sdpKey: sdpKey, _parseRoom: parseRoom,
  _okPid: okPid, _okPair: okPair, ROOM_MAX, ROOM_STALE_MS, RATE_MAX } = handler;

/** KV の偽物。ハッシュ1つぶんだけ覚える。 */
function fakeKv(initial = {}) {
  const store = { ...initial };
  const calls = [];
  return {
    calls, store,
    redis: async cmd => {
      calls.push(cmd);
      const [op, , field, value] = cmd;
      if (op === 'HGETALL') return Object.entries(store).flat();
      if (op === 'HSET') { store[field] = value; return 1; }
      if (op === 'HDEL') { delete store[field]; return 1; }
      if (op === 'EXPIRE') return 1;
      return null;
    },
  };
}

// === 1. v1 のクライアントを壊さない ===

test('組を指定しない合図は、2人版と同じ棚に置かれる', () => {
  // v1.0-duo のクライアントは pair を送らない。棚の名前が変わると、
  //   新しい API に差し替えた瞬間に2人版が繋がらなくなる。
  assert.equal(sdpKey('ABCDEF', 'offer', ''), 'sig:ABCDEF:offer');
  assert.equal(sdpKey('ABCDEF', 'answer', undefined), 'sig:ABCDEF:answer');
});

test('組を指定した合図は、組ごとの別の棚に置かれる', () => {
  assert.equal(sdpKey('ABCDEF', 'offer', 'aaaa-bbbb'), 'sig:ABCDEF:aaaa-bbbb:offer');
  // 別の組が同じ部屋で同時に握手しても、棚がぶつからないこと
  assert.notEqual(sdpKey('ABCDEF', 'offer', 'aaaa-bbbb'), sdpKey('ABCDEF', 'offer', 'aaaa-cccc'));
});

test('部屋での呼び名と組の形だけを受ける', () => {
  assert.equal(okPid('ab23'), true);
  assert.equal(okPid('AB23'), false, '大文字は受けない');
  assert.equal(okPid('ab2'), false, '3文字は受けない');
  assert.equal(okPair('ab23-cd45'), true);
  assert.equal(okPair('ab23_cd45'), false);
  assert.equal(okPair('../../etc'), false, '鍵の名前に細工できない');
});

// === 2. 部屋の顔ぶれ ===

test('名乗ると顔ぶれに入り、入った順に並ぶ', async () => {
  const kv = fakeKv({ aaaa: '1000', cccc: '1200' });
  const r = await joinRoom('ABCDEF', 'bbbb', { redis: kv.redis, now: () => 1300 });
  assert.equal(r.full, false);
  assert.deepEqual(r.members, ['aaaa', 'cccc', 'bbbb'], '後から来た人は後ろ');
});

test('同じ人が名乗り直しても増えない', async () => {
  const kv = fakeKv({ aaaa: '1000' });
  const r = await joinRoom('ABCDEF', 'aaaa', { redis: kv.redis, now: () => 2000 });
  assert.deepEqual(r.members, ['aaaa']);
});

test('名乗りが途絶えた人は顔ぶれから落ちる', async () => {
  const kv = fakeKv({ aaaa: '1000', ghost: '1000' });
  const now = 1000 + ROOM_STALE_MS + 1;
  const r = await joinRoom('ABCDEF', 'bbbb', { redis: kv.redis, now: () => now });
  assert.deepEqual(r.members, ['bbbb'], '古い名乗りは残さない(幽霊が定員を食わない)');
});

test('名乗るたびに部屋の寿命が延びる', async () => {
  const kv = fakeKv({});
  await joinRoom('ABCDEF', 'aaaa', { redis: kv.redis, now: () => 1000 });
  assert.ok(kv.calls.some(c => c[0] === 'EXPIRE'), '長いロビーの途中で部屋が消えない');
});

// === 3. 定員 ===

test('5人目は入れず、しかも部屋を汚さない', async () => {
  const kv = fakeKv({ aaaa: '1000', bbbb: '1001', cccc: '1002', dddd: '1003' });
  const r = await joinRoom('ABCDEF', 'eeee', { redis: kv.redis, now: () => 1100 });
  assert.equal(r.full, true);
  assert.equal(r.members.length, ROOM_MAX);
  assert.equal('eeee' in kv.store, false, '弾いた人を書き込まない(他の人に5人目として見えない)');
  assert.equal(kv.calls.some(c => c[0] === 'HSET'), false);
});

test('満員でも、すでに居る人は締め出されない', async () => {
  const kv = fakeKv({ aaaa: '1000', bbbb: '1001', cccc: '1002', dddd: '1003' });
  const r = await joinRoom('ABCDEF', 'cccc', { redis: kv.redis, now: () => 1100 });
  assert.equal(r.full, false, '名乗り直しただけで自分が弾かれたら遊べなくなる');
  assert.equal(r.members.length, 4);
});

test('抜けた席は、次の人がすぐ使える', async () => {
  const kv = fakeKv({ aaaa: '1000', bbbb: '1001', cccc: '1002', dddd: '1003' });
  await kv.redis(['HDEL', 'sig:ABCDEF:room', 'dddd']);
  const r = await joinRoom('ABCDEF', 'eeee', { redis: kv.redis, now: () => 1100 });
  assert.equal(r.full, false);
  assert.deepEqual(r.members, ['aaaa', 'bbbb', 'cccc', 'eeee']);
});

// === KV の戻りの形 ===

test('Upstash が配列で返しても、辞書で返しても読める', () => {
  assert.deepEqual(parseRoom(['aaaa', '1', 'bbbb', '2']), [{ id: 'aaaa', t: 1 }, { id: 'bbbb', t: 2 }]);
  assert.deepEqual(parseRoom({ aaaa: '1' }), [{ id: 'aaaa', t: 1 }]);
  assert.deepEqual(parseRoom(null), []);
});

// === レート制限 ===

test('4人が同じ回線から入っても、正常な使い方が弾かれない', () => {
  // ロビーで3秒ごとに名乗る → ひとり毎分20回。4人で80回。
  //   握手のやりとりと ICE の取得を足しても、まだ十分な余裕があること。
  const perPlayerPerMin = 60 / 3;
  assert.ok(RATE_MAX > perPlayerPerMin * ROOM_MAX * 3,
    `4人ぶん(${perPlayerPerMin * ROOM_MAX}回/分)の3倍以上の余裕を持たせる`);
});
