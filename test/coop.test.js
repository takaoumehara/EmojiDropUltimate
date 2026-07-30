// ============================================================
// coop.test.js — 3人以上を、クライアント側が正しく扱えるかの検証
//
// サーバーが4人まで通せることは server.test.js で確かめた。
// ここで見るのは「届いたものを、誰のものとして扱うか」。
// 3人目・4人目が混ざる/上書きされる/消えないのが一番怖い壊れ方なので、
// そこを名指しで押さえる。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './bootstrap.js';
import { Coop } from '../src/coop.js';

function fresh() {
  Coop.reset();
  Coop.active = true; Coop.role = 'host';
  return Coop;
}

test('相方ごとに別の機体として扱われる', () => {
  const c = fresh();
  c.onMsg({ t: 'hello', name: 'あかり' }, '2');
  c.onMsg({ t: 'hello', name: 'ゆうた' }, '3');
  c.onMsg({ t: 'hello', name: 'みお' }, '4');
  assert.equal(c.peers.size, 3);
  assert.equal(c.playerCount(), 4, '自分を入れて4人');
  assert.deepEqual([...c.peers.values()].map(p => p.name), ['あかり', 'ゆうた', 'みお']);
});

test('位置は送り主ごとに別々に入る(上書きされない)', () => {
  const c = fresh();
  c.onMsg({ t: 'pos', x: 0.1, y: 0.2, s: 100, a: 1 }, '2');
  c.onMsg({ t: 'pos', x: 0.8, y: 0.9, s: 700, a: 1 }, '3');
  const [a, b] = [...c.peers.values()];
  assert.deepEqual([a.tx, a.ty, a.score], [0.1, 0.2, 100]);
  assert.deepEqual([b.tx, b.ty, b.score], [0.8, 0.9, 700]);
});

test('ボスへの与ダメは全員ぶん積み上がり、貢献は送り主ごとに記録される', () => {
  const c = fresh();
  c.initBoss(100);
  c.onMsg({ t: 'dmg', d: 10 }, '2');
  c.onMsg({ t: 'dmg', d: 25 }, '3');
  c.dealLocal(5);
  assert.equal(c.bossShared, 60, '100 - (10+25+5)');
  assert.equal(c.peers.get('2').dmg, 10);
  assert.equal(c.peers.get('3').dmg, 25);
  assert.equal(c.peerDmg(), 35);
  assert.equal(c.localDmg, 5);
});

test('相方が抜けたら消える(幽霊機を残さない)', () => {
  const c = fresh();
  c.onMsg({ t: 'hello', name: 'A' }, '2');
  c.onMsg({ t: 'hello', name: 'B' }, '3');
  assert.equal(c.connected, true);
  c.dropPeer('3');
  assert.equal(c.peers.size, 1);
  assert.equal(c.connected, true, 'まだひとり居るので繋がったまま');
  c.dropPeer('2');
  assert.equal(c.connected, false, '誰も居なくなったら切断扱い');
});

test('音沙汰のない相方は描画対象から外れる', () => {
  const c = fresh();
  c.onMsg({ t: 'hello', name: 'A' }, '2');
  c.onMsg({ t: 'hello', name: 'B' }, '3');
  assert.equal(c.livePeers().length, 2);
  // ひとりだけ最後の受信を過去にする
  c.peers.get('3').seenAt = performance.now() - 5000;
  assert.equal(c.livePeers().length, 1);
  assert.equal(c.livePeers()[0].name, 'A');
  assert.equal(c.partnerFresh(), true, '生きている相方が居る限り接続表示は残る');
});

test('定員を超える番号が来ても相方は増えない', () => {
  const c = fresh();
  // サーバーは4人までしか入れないが、番号が化けたメッセージが来ても
  //   際限なく機体が増えてはいけない。
  for (let i = 2; i < 40; i++) c.onMsg({ t: 'hello', name: 'X' + i }, String(i));
  assert.equal(c.peers.size, 3, '自分 + 3人 = 4人が上限');
});

test('直結(2人)は今まで通り動く', () => {
  const c = fresh();
  // 送り主を指定しない = 直結。固定の呼び名でひとりぶんだけ入る。
  c.onMsg({ t: 'hello', name: 'FRIEND2' });
  c.onMsg({ t: 'pos', x: 0.4, y: 0.7, s: 42, a: 1 });
  assert.equal(c.peers.size, 1);
  assert.equal(c.partner.name, 'FRIEND2');
  assert.equal(c.partner.score, 42);
  assert.equal(c.playerCount(), 2);
});

test('文章の呼び名は人数で変わる', () => {
  const c = fresh();
  c.onMsg({ t: 'hello', name: 'あかり' }, '2');
  assert.equal(c.partyLabel(true), 'あかり', 'ふたりなら相手の名前');
  c.onMsg({ t: 'hello', name: 'ゆうた' }, '3');
  assert.equal(c.partyLabel(true), '3人', '3人以上なら人数(「あかりと共闘クリア」が嘘にならない)');
  assert.equal(c.partyLabel(false), '3 players');
});

test('リセットで全員消える', () => {
  const c = fresh();
  c.onMsg({ t: 'hello', name: 'A' }, '2');
  c.onMsg({ t: 'hello', name: 'B' }, '3');
  c.reset();
  assert.equal(c.peers.size, 0);
  assert.equal(c.connected, false);
  assert.equal(c.partner.name, 'FRIEND', '誰も居なくても描画側が落ちない置き場が返ること');
});

test('補間は全員ぶん進む', () => {
  const c = fresh();
  c.onMsg({ t: 'pos', x: 1, y: 1, a: 1 }, '2');
  c.onMsg({ t: 'pos', x: 0, y: 0, a: 1 }, '3');
  const before = [...c.peers.values()].map(p => p.x);
  c.update(1 / 60);
  const after = [...c.peers.values()].map(p => p.x);
  assert.notEqual(after[0], before[0], '1人目が目標へ寄ること');
  assert.notEqual(after[1], before[1], '2人目も寄ること');
});

test('ホストの引き継ぎ指名を受けると役割が変わり、engine に知らせる', () => {
  const c = fresh();
  c.role = 'guest';
  let called = 0;
  c.onBecomeHost = () => { called++; };
  c.becomeHost();
  assert.equal(c.role, 'host');
  assert.equal(called, 1);
  // 二度目は何も起きない(同じ通知が繰り返し届いても世界を作り直さない)
  c.becomeHost();
  assert.equal(called, 1);
  c.onBecomeHost = null;
});

// ============================================================
// 待っているあいだ、黙らない
//
// ホストは 90回 × 1.3秒 = 117秒 のあいだ「相方の参加を待っています…」
// だけを見せられていた。繋がらないのか、まだ来ていないだけなのかが
// 区別できず、実際に「二人プレーができない」という報告になった。
// 経過と原因が必ず出ることを固定する。
// ============================================================

test('待ち始めた時刻が記録され、経過が読める', async () => {
  const { Coop } = await import('../src/coop.js');
  Coop.reset();
  assert.equal(Coop.waitedSec(), 0, '待っていなければ0');
  Coop.active = true; Coop.role = 'host';
  Coop.connectAt = performance.now() - 5000;
  Coop.connected = false;
  const w = Coop.waitedSec();
  assert.ok(w >= 4.5 && w <= 6, `経過が秒で読めること (${w})`);
  Coop.connected = true;
  assert.equal(Coop.waitedSec(), 0, '繋がったら経過は出さない');
  Coop.reset();
});

test('reset で待ちの記録も消える(前回の秒数が残らない)', async () => {
  const { Coop } = await import('../src/coop.js');
  Coop.connectAt = performance.now() - 9000; Coop.sigNote = 'http500';
  Coop.reset();
  assert.equal(Coop.connectAt, 0);
  assert.equal(Coop.sigNote, '');
  assert.equal(Coop.waitedSec(), 0);
});
