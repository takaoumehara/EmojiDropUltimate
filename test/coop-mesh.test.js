// ============================================================
// coop-mesh.test.js — 3〜4人の「星型」がちゃんと星型になっているかの検証
//
// 実際の WebRTC ハンドシェイク(RTCPeerConnection の SDP 交換・ICE)は
// ブラウザと信号サーバー(Vercel KV)が要るので、ここでは確かめられない
// (→ 実機での確認が別途要る)。ここで押さえるのは、繋がった **あと** の
// 中継が正しいかどうか —— ホストが RTCDataChannel をどう扱うかだけを見る。
//
// 「ゲストが3人まで繋がるようになった」の半分は信号サーバー側(NX)、
// もう半分がここ: **ゲスト同士は直接繋がっていない**ので、ホストが
// 届いたものを他のゲストへ流さないと、誰にも他人の機体が見えない。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './bootstrap.js';
import { Coop, RtcHostTransport, RELAY_TYPES } from '../src/coop.js';

// 本物の RTCDataChannel の代わり。send() したものを溜めるだけの入れ物。
function fakeDc() {
  const dc = { sent: [], onopen: null, onmessage: null, onclose: null };
  dc.send = data => dc.sent.push(JSON.parse(data));
  return dc;
}

function freshHost() {
  Coop.reset();
  Coop.active = true; Coop.role = 'host';
  return new RtcHostTransport(Coop, 'ABCDEF');
}

test('中継の白名単は「本人がどこでも扱える」型だけ', () => {
  // dmg/hit/died は共有ボスHP・残機を減らすホスト専用の入力。
  //   これを他のゲストにも流すと、そちらの画面でも同じ処理がもう一度走り、
  //   二重に減ってしまう。関わる4つの型が正しく分かれていることを名指しで縛る。
  assert.ok(RELAY_TYPES.has('pos'));
  assert.ok(RELAY_TYPES.has('hello'));
  assert.ok(RELAY_TYPES.has('ready'));
  assert.ok(RELAY_TYPES.has('sup'));
  for (const t of ['dmg', 'hit', 'died', 'over', 'bd', 'ls', 'w', 'start']) {
    assert.ok(!RELAY_TYPES.has(t), `${t} は中継されないこと`);
  }
});

test('ゲストAの位置は、ゲストBへ「誰から来たか」の印つきで届く', () => {
  const tr = freshHost();
  const [sA, sB] = tr.slots;
  const dcA = fakeDc(), dcB = fakeDc();
  tr.wireDc(sA, dcA); tr.wireDc(sB, dcB);
  dcA.onopen(); dcB.onopen();
  dcA.sent.length = 0; dcB.sent.length = 0;   // 開通時の hello 埋め合わせを流す

  dcA.onmessage({ data: JSON.stringify({ t: 'pos', x: 0.4, y: 0.6, a: 1 }) });

  const relayed = dcB.sent.find(o => o.t === 'pos');
  assert.ok(relayed, 'Bにも中継されること');
  assert.equal(relayed._r, sA.n, '送り主の枠番号が印として付くこと');
  assert.equal(dcA.sent.length, 0, '自分自身には返ってこないこと(こだま防止)');
});

test('dmg/hit/died はホストだけが受け取り、他のゲストへは流れない', () => {
  const tr = freshHost();
  const [sA, sB] = tr.slots;
  const dcA = fakeDc(), dcB = fakeDc();
  tr.wireDc(sA, dcA); tr.wireDc(sB, dcB);
  dcA.onopen(); dcB.onopen();
  dcB.sent.length = 0;
  Coop.initBoss(100);

  dcA.onmessage({ data: JSON.stringify({ t: 'dmg', d: 30 }) });

  assert.equal(Coop.bossShared, 70, 'ホスト自身の計算は動くこと');
  assert.equal(dcB.sent.length, 0, '他のゲストへは流れないこと(二重計算を防ぐ)');
});

test('遅れて繋がった3人目にも、先に来ていた人たちの名前が届く', () => {
  // A の hello は、C の枠がまだ無かった頃に流れてしまっている。
  //   何もしないと C の画面では A がずっと「FRIEND」のまま(実際にそう見える)。
  const tr = freshHost();
  const [sA, , sC] = tr.slots;
  const dcA = fakeDc();
  tr.wireDc(sA, dcA);
  dcA.onopen();
  dcA.onmessage({ data: JSON.stringify({ t: 'hello', name: 'あかり', ch: 2 }) });

  const dcC = fakeDc();
  tr.wireDc(sC, dcC);
  dcC.onopen();

  const backfilled = dcC.sent.find(o => o.t === 'hello' && o._r === sA.n);
  assert.ok(backfilled, '先客の名前が中継の形で届くこと');
  assert.equal(backfilled.name, 'あかり');
  assert.equal(backfilled.ch, 2);
});

test('枠が閉じたら、その人の機体は消え、席は空いたままにしない', () => {
  const tr = freshHost();
  const [sA] = tr.slots;
  const dcA = fakeDc();
  tr.wireDc(sA, dcA);
  dcA.onopen();
  dcA.onmessage({ data: JSON.stringify({ t: 'hello', name: 'あかり' }) });
  assert.equal(Coop.peers.size, 1);

  dcA.onclose();

  assert.equal(sA.open, false);
  assert.equal(Coop.peers.size, 0, '抜けた人の機体が消えること(幽霊機を残さない)');
});

test('全員ぶんまとめて呼ぶと、繋がっている枠すべてに届く(Coop.send の一斉送信)', () => {
  const tr = freshHost();
  const [sA, sB, sC] = tr.slots;
  const dcA = fakeDc(), dcB = fakeDc(), dcC = fakeDc();
  tr.wireDc(sA, dcA); tr.wireDc(sB, dcB); tr.wireDc(sC, dcC);
  dcA.onopen(); dcB.onopen();   // C はまだ繋がっていない
  dcA.sent.length = 0; dcB.sent.length = 0;

  tr.send({ t: 'bd' });

  assert.ok(dcA.sent.some(o => o.t === 'bd'));
  assert.ok(dcB.sent.some(o => o.t === 'bd'));
  assert.equal(dcC.sent.length, 0, '繋がっていない枠には送らないこと');
});
