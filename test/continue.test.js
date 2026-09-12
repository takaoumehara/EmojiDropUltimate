// ============================================================
// continue.test.js — コンティニューは「片方だけ」再開しないことの検証
//
// 直したバグ: 共闘でチームの残機が尽きると、両方の画面が同時に
// ゲームオーバーになる(ここは既に合っていた)。だが**コンティニューは
// 完全に個人の操作**で、押した端末だけが startStage() を呼んでいた。
// 押していない側はゲームオーバー画面に取り残されたまま、押した側だけが
// ひとりで飛び回る —— 実際にそう起きていた。
//
// 直した形は「スタート」と同じ号令方式:
//   ゲストは自分では再開しない → ホストに頼む(reqContinue)
//   ホストが号令(continue)を出し、**再開位置つきで**全員に配る
//   受け取った側は自分の Save を見ない(ホストと言うことが違うと意味が無い)
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot, shutdown } from './headless.js';

const now = h => h.state.game;

/**
 * 共闘で、チームの残機が尽きてゲームオーバーになったところを作る。
 *
 * startRun() は setGame() で game を丸ごと差し替える。呼ぶ前に掴んだ参照は
 * 捨てられた側を指すので、**呼んだ後に**読み直す(boss.test.js と同じ注意)。
 */
function toCoopGameOver(h, Save) {
  h.engine.startRun(0);
  const g = now(h);
  g.coop = true; g.continues = 2;
  g.state = 'over'; g.overT = 0;
  Save.clearResumePoint();
  return g;
}

test('ホストが押すと、再開位置つきの号令が全員へ配られる', async () => {
  const h = await boot({ seed: 60 });
  const { Coop } = await import('../src/coop.js');
  const { Save } = await import('../src/save.js');
  Coop.reset(); Coop.active = true; Coop.role = 'host'; Coop.connected = true;
  const g = toCoopGameOver(h, Save);
  Save.setResumePoint(0, 12345, 3);   // ボス戦の途中で死んだ想定

  const sent = [];
  const realSend = Coop.send.bind(Coop);
  Coop.send = o => sent.push(o);

  h.engine.doContinue();

  Coop.send = realSend;
  assert.notEqual(g.state, 'over', 'ホスト自身の画面も再開すること');
  assert.equal(g.continues, 1, '残り回数が減ること');
  assert.equal(g.stageTime, 12345, '死んだ地点から再開すること(頭からではない)');
  assert.equal(g.waveIdx, 3);

  const msg = sent.find(o => o.t === 'continue');
  assert.ok(msg, 'continue の号令が送られること');
  assert.equal(msg.has, true);
  assert.equal(msg.time, 12345, '号令に再開地点そのものが載ること');
  assert.equal(msg.wave, 3);

  Coop.reset(); shutdown(h);
});

test('ゲストが押しても自分では再開しない。ホストに頼むだけ', async () => {
  const h = await boot({ seed: 61 });
  const { Coop } = await import('../src/coop.js');
  const { Save } = await import('../src/save.js');
  Coop.reset(); Coop.active = true; Coop.role = 'guest'; Coop.connected = true;
  const g = toCoopGameOver(h, Save);

  const sent = [];
  const realSend = Coop.send.bind(Coop);
  Coop.send = o => sent.push(o);

  h.engine.doContinue();

  Coop.send = realSend;
  assert.equal(g.state, 'over', '号令が来るまでは動かないこと(片方だけ先に走らない)');
  assert.equal(g.continues, 2, '自分ではまだ1回も消費しないこと');
  assert.deepEqual(sent, [{ t: 'reqContinue' }], 'ホストに頼むだけであること');

  Coop.reset(); shutdown(h);
});

test('ゲストは、ホストの号令が持ってきた地点をそのまま使う(自分のSaveは見ない)', async () => {
  const h = await boot({ seed: 62 });
  const { Coop } = await import('../src/coop.js');
  const { Save } = await import('../src/save.js');
  Coop.reset(); Coop.active = true; Coop.role = 'guest'; Coop.connected = true;
  const g = toCoopGameOver(h, Save);
  // 自分の端末には無関係な記録が残っている想定(別のステージ・別の地点)。
  //   これに引きずられたら、ホストとは違う場所から再開してしまう。
  Save.setResumePoint(4, 99999, 9);

  Coop.onMsg({ t: 'continue', has: true, time: 555, wave: 1 });

  assert.notEqual(g.state, 'over', 'ホストの号令だけで再開すること(強制)');
  assert.equal(g.stageTime, 555, '自分のSaveではなく、号令に載った地点を使うこと');
  assert.equal(g.waveIdx, 1);
  assert.equal(g.continues, 1);

  Coop.reset(); shutdown(h);
});

test('号令が「頭から」(has:false)なら、ゲストも頭から再開する', async () => {
  const h = await boot({ seed: 63 });
  const { Coop } = await import('../src/coop.js');
  const { Save } = await import('../src/save.js');
  Coop.reset(); Coop.active = true; Coop.role = 'guest'; Coop.connected = true;
  const g = toCoopGameOver(h, Save);

  Coop.onMsg({ t: 'continue', has: false });

  assert.notEqual(g.state, 'over');
  assert.equal(g.stageTime, 0, 'has:false なら頭から(ホストにも再開地点が無かった)');
  assert.equal(g.waveIdx, 0);

  Coop.reset(); shutdown(h);
});

test('ゲストの依頼(reqContinue)を受けたホストは、自分の号令として配り直す', async () => {
  const h = await boot({ seed: 64 });
  const { Coop } = await import('../src/coop.js');
  const { Save } = await import('../src/save.js');
  Coop.reset(); Coop.active = true; Coop.role = 'host'; Coop.connected = true;
  const g = toCoopGameOver(h, Save);
  Save.setResumePoint(0, 7000, 2);

  const sent = [];
  const realSend = Coop.send.bind(Coop);
  Coop.send = o => sent.push(o);

  Coop.onMsg({ t: 'reqContinue' });   // 相方の依頼が届いた、という想定

  Coop.send = realSend;
  assert.notEqual(g.state, 'over', 'ホスト自身も号令と同時に再開すること');
  assert.ok(sent.find(o => o.t === 'continue' && o.time === 7000), '号令が配られること');

  Coop.reset(); shutdown(h);
});

test('ソロでは今まで通り、号令なしでその場で再開する', async () => {
  const h = await boot({ seed: 65 });
  const { Coop } = await import('../src/coop.js');
  const { Save } = await import('../src/save.js');
  Coop.reset();   // 共闘ではない
  h.engine.startRun(0);
  const g = now(h);
  g.coop = false; g.continues = 2; g.state = 'over'; g.overT = 0;
  Save.clearResumePoint();

  h.engine.doContinue();

  assert.notEqual(g.state, 'over');
  assert.equal(g.continues, 1);

  shutdown(h);
});
