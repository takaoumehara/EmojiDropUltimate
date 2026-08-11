// ============================================================
// mesh.test.js — 3〜4人を、常駐サーバー無しで繋ぐ部分の検証
//
// ここで守りたいのは4つ。どれも壊れると「4人で遊べない」に直結する。
//   1. 誰が申し込む側かが、両者で必ず食い違わないこと
//   2. 顔ぶれが増えたら、その人ぶんの線が張られること(定員は超えないこと)
//   3. 届いたものが「どの線から来たか」で送り主に結びつくこと
//      —— 名乗りを信じないので、なりすましが成立しないこと
//   4. ホストが抜けたとき、残った全員が**同じ後継**を選ぶこと
//
// 本物の WebRTC と合図サーバーは差し替える。ここで確かめたいのは
// ブラウザの実装ではなく、こちらが書いた段取りだから。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './bootstrap.js';
import { MeshTransport, pairKey, isOfferer, electHost, makePid, ROOM_MAX } from '../src/mesh.js';
import { Coop } from '../src/coop.js';

// === 差し替え用の偽物 ===

function fakeChannel(label) {
  return {
    label, sent: [], closed: false,
    send(s) { this.sent.push(s); },
    close() { this.closed = true; },
  };
}

function FakePeerConnection(cfg) {
  this.cfg = cfg;
  this.iceGatheringState = 'complete';   // 候補集めは即完了(待ち時間を作らない)
  this.iceConnectionState = 'new';
  this.localDescription = null;
  this.remoteDescription = null;
  this.channels = [];
  this.closed = false;
  FakePeerConnection.made.push(this);
}
FakePeerConnection.made = [];
FakePeerConnection.prototype.createDataChannel = function (label) {
  const dc = fakeChannel(label); this.channels.push(dc); return dc;
};
FakePeerConnection.prototype.createOffer = async function () { return { type: 'offer', sdp: 'SDP-OFFER' }; };
FakePeerConnection.prototype.createAnswer = async function () { return { type: 'answer', sdp: 'SDP-ANSWER' }; };
FakePeerConnection.prototype.setLocalDescription = async function (d) { this.localDescription = d; };
FakePeerConnection.prototype.setRemoteDescription = async function (d) { this.remoteDescription = d; };
FakePeerConnection.prototype.close = function () { this.closed = true; };

/** 合図サーバーの偽物。部屋の顔ぶれと、組ごとの棚だけを覚える。 */
function fakeSignal(members, opts = {}) {
  const calls = { post: [], get: [] };
  const shelf = new Map();
  const res = obj => ({ ok: true, status: 200, json: async () => obj });
  const fetch = async (url, init) => {
    if (init && init.method === 'POST') {
      const body = JSON.parse(init.body);
      calls.post.push(body);
      if (body.kind === 'room') {
        if (opts.full) return res({ ok: true, full: true, members, you: body.pid, max: ROOM_MAX });
        return res({ ok: true, full: false, members, you: body.pid, max: ROOM_MAX });
      }
      if (body.kind === 'leave') return res({ ok: true });
      shelf.set(`${body.pair}:${body.kind}`, body.sdp);
      return res({ ok: true });
    }
    const u = String(url);
    calls.get.push(u);
    const want = /want=([a-z]+)/.exec(u), pair = /pair=([a-z0-9-]+)/.exec(u);
    return res({ sdp: shelf.get(`${pair && pair[1]}:${want && want[1]}`) || 'SDP-FROM-PEER' });
  };
  return { fetch, calls, shelf };
}

/** 張りかけの線が開通するところまで進める。 */
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

function makeMesh(role, pid, members, opts = {}) {
  Coop.reset();
  Coop.active = true; Coop.role = role;
  FakePeerConnection.made = [];
  const sig = fakeSignal(members, opts);
  const mesh = new MeshTransport(Coop, role, 'ABCDEF', {
    pid, RTC: FakePeerConnection, ice: async () => [], fetch: sig.fetch,
    lobbyPollMs: 1e9, playPollMs: 1e9,          // 周期の再訪はテストしない
    ...opts.mesh,
  });
  Coop.transport = mesh;
  return { mesh, sig };
}

/**
 * 線を開通させる(本物なら DataChannel の onopen が呼ぶところ)。
 * 受ける側は相手が作ったチャンネルが降ってくるので、それも真似る。
 */
function openLink(mesh, peerId) {
  const link = mesh.links.get(peerId);
  assert.ok(link, `${peerId} への線が張られていること`);
  if (!link.dc) {
    assert.ok(link.pc && link.pc.ondatachannel, `${peerId} からのチャンネルを待っていること`);
    link.pc.ondatachannel({ channel: fakeChannel('coop') });
  }
  link.dc.onopen();
  return link;
}

// === 1. 役割の決め方 ===

test('組の棚の名前は、どちらから見ても同じになる', () => {
  assert.equal(pairKey('ab12', 'cd34'), pairKey('cd34', 'ab12'));
  assert.equal(pairKey('cd34', 'ab12'), 'ab12-cd34');
});

test('申し込む側はきっかりひとり(両者が同時に申し込まない)', () => {
  const a = 'ab12', b = 'cd34';
  assert.equal(isOfferer(a, b) !== isOfferer(b, a), true, 'どちらか一方だけが申し込む');
  assert.equal(isOfferer(a, b), true, '番号の若い方が申し込む');
});

test('部屋での呼び名は、紛らわしい文字を含まない', () => {
  let seq = 0;
  const rnd = () => (seq++ % 32) / 32;              // 全文字をひと通り引く
  for (let i = 0; i < 40; i++) {
    const pid = makePid(rnd);
    assert.match(pid, /^[a-z2-9]{4}$/, `${pid} は合図サーバーが受ける形`);
    assert.equal(/[lo01]/.test(pid), false, `${pid} に l/o/0/1 が混ざらない`);
  }
});

// === 2. 顔ぶれから線を張る ===

test('顔ぶれに居る人ぶんだけ線が張られる(自分には張らない)', async () => {
  const { mesh } = makeMesh('host', 'aaaa', ['aaaa', 'bbbb', 'cccc']);
  await mesh.init();
  await flush();
  assert.deepEqual([...mesh.links.keys()], ['bbbb', 'cccc']);
  assert.equal(FakePeerConnection.made.length, 2, '相手の数だけ RTCPeerConnection を持つ');
  mesh.dispose();
});

test('定員を超えて線は張られない(番号が化けても機体が増えない)', async () => {
  const many = ['aaaa'];
  for (let i = 0; i < 30; i++) many.push('p' + String(i).padStart(3, '2'));
  const { mesh } = makeMesh('host', 'aaaa', many);
  await mesh.init();
  await flush();
  assert.equal(mesh.links.size, ROOM_MAX - 1, '自分 + 3人 = 4人が上限');
  mesh.dispose();
});

test('満員の部屋に入ろうとしたら、待たされずにそう言われる', async () => {
  const { mesh } = makeMesh('guest', 'zzzz', ['aaaa', 'bbbb', 'cccc', 'dddd'], { full: true });
  await mesh.init();
  await flush(2);
  assert.equal(Coop.status, 'room_full');
  assert.equal(mesh.links.size, 0, '入れないのに線を張らない');
  mesh.dispose();
});

test('申し込む側は棚に offer を置き、受ける側は answer を置く', async () => {
  // 自分('aaaa')は 'zzzz' より若いので申し込む側
  const a = makeMesh('host', 'aaaa', ['aaaa', 'zzzz']);
  await a.mesh.init(); await flush();
  const posted = a.sig.calls.post.filter(p => p.kind === 'offer' || p.kind === 'answer');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].kind, 'offer');
  assert.equal(posted[0].pair, 'aaaa-zzzz');
  a.mesh.dispose();

  // 自分('zzzz')は 'aaaa' より後なので受ける側
  const b = makeMesh('guest', 'zzzz', ['aaaa', 'zzzz']);
  await b.mesh.init(); await flush();
  const posted2 = b.sig.calls.post.filter(p => p.kind === 'offer' || p.kind === 'answer');
  assert.equal(posted2.length, 1);
  assert.equal(posted2[0].kind, 'answer');
  assert.equal(posted2[0].pair, 'aaaa-zzzz');
  b.mesh.dispose();
});

// === 3. 送り主は「線」で決まる ===

test('届いたものは、その線の相手のものとして扱われる', async () => {
  const { mesh } = makeMesh('host', 'aaaa', ['aaaa', 'bbbb', 'cccc']);
  await mesh.init(); await flush();
  const lb = openLink(mesh, 'bbbb'), lc = openLink(mesh, 'cccc');
  lb.dc.onmessage({ data: JSON.stringify({ t: 'hello', name: 'あかり' }) });
  lc.dc.onmessage({ data: JSON.stringify({ t: 'hello', name: 'ゆうた' }) });
  lb.dc.onmessage({ data: JSON.stringify({ t: 'pos', x: 0.1, y: 0.2, s: 100, a: 1 }) });
  assert.equal(Coop.peers.get('bbbb').name, 'あかり');
  assert.equal(Coop.peers.get('cccc').name, 'ゆうた');
  assert.equal(Coop.peers.get('bbbb').tx, 0.1);
  assert.equal(Coop.playerCount(), 3);
  mesh.dispose();
});

test('名乗りで他人になりすませない(送り主は線が決める)', async () => {
  const { mesh } = makeMesh('host', 'aaaa', ['aaaa', 'bbbb', 'cccc']);
  await mesh.init(); await flush();
  const lb = openLink(mesh, 'bbbb'); openLink(mesh, 'cccc');
  // 'bbbb' の線から「自分は cccc だ」と言い張っても、cccc の機体は動かない
  lb.dc.onmessage({ data: JSON.stringify({ t: 'pos', from: 'cccc', x: 0.9, y: 0.9, a: 1 }) });
  assert.equal(Coop.peers.get('bbbb').tx, 0.9, '線の持ち主の機体が動く');
  assert.equal(Coop.peers.has('cccc'), false, '名乗っただけの相手は作られない');
  mesh.dispose();
});

test('送信は開いている線すべてへ届き、組み立ては1回で済む', async () => {
  const { mesh } = makeMesh('host', 'aaaa', ['aaaa', 'bbbb', 'cccc']);
  await mesh.init(); await flush();
  const lb = openLink(mesh, 'bbbb'), lc = openLink(mesh, 'cccc');
  lb.dc.sent.length = 0; lc.dc.sent.length = 0;    // 名乗りぶんを捨てる
  mesh.send({ t: 'w', e: [1, 2, 3] });
  assert.equal(lb.dc.sent.length, 1);
  assert.equal(lc.dc.sent.length, 1);
  assert.equal(lb.dc.sent[0], lc.dc.sent[0], '同じ文字列を配る(組み立ては1回)');
  mesh.dispose();
});

test('開通したら、自分がホストかどうかも一緒に名乗る', async () => {
  const { mesh } = makeMesh('host', 'aaaa', ['aaaa', 'bbbb']);
  await mesh.init(); await flush();
  const lb = openLink(mesh, 'bbbb');
  const hello = JSON.parse(lb.dc.sent[0]);
  assert.equal(hello.t, 'hello');
  assert.equal(hello.h, 1, 'ホストはそう名乗る(抜けたときに引き継げるように)');
  mesh.dispose();

  const g = makeMesh('guest', 'aaaa', ['aaaa', 'bbbb']);
  await g.mesh.init(); await flush();
  assert.equal(JSON.parse(openLink(g.mesh, 'bbbb').dc.sent[0]).h, 0);
  g.mesh.dispose();
});

// === 4. ホストが抜けたとき ===

test('ホストの名乗りを覚え、抜けたら後継を選ぶ', async () => {
  const { mesh } = makeMesh('guest', 'bbbb', ['aaaa', 'bbbb', 'cccc']);
  await mesh.init(); await flush();
  const la = openLink(mesh, 'aaaa'), lc = openLink(mesh, 'cccc');
  la.dc.onmessage({ data: JSON.stringify({ t: 'hello', name: 'ホスト', h: 1 }) });
  lc.dc.onmessage({ data: JSON.stringify({ t: 'hello', name: 'もうひとり', h: 0 }) });
  assert.equal(Coop.hostId, 'aaaa');

  let took = 0;
  Coop.onBecomeHost = () => { took++; };
  la.dc.onclose();                         // ホストがタブを閉じた
  assert.equal(Coop.hostId, 'bbbb', '残った中で番号の若い自分が引き継ぐ');
  assert.equal(Coop.role, 'host');
  assert.equal(took, 1);
  Coop.onBecomeHost = null;
  mesh.dispose();
});

test('ホストでない人が抜けても、引き継ぎは起きない', async () => {
  const { mesh } = makeMesh('guest', 'bbbb', ['aaaa', 'bbbb', 'cccc']);
  await mesh.init(); await flush();
  const la = openLink(mesh, 'aaaa'), lc = openLink(mesh, 'cccc');
  la.dc.onmessage({ data: JSON.stringify({ t: 'hello', h: 1 }) });
  lc.dc.onmessage({ data: JSON.stringify({ t: 'hello', h: 0 }) });
  let took = 0; Coop.onBecomeHost = () => { took++; };
  lc.dc.onclose();
  assert.equal(took, 0);
  assert.equal(Coop.role, 'guest');
  assert.equal(Coop.hostId, 'aaaa', 'ホストは変わらない');
  Coop.onBecomeHost = null;
  mesh.dispose();
});

test('後継は全員が同じ答えになる(番号の若い順)', () => {
  // 同じ顔ぶれを、どの席から見ても答えが一致すること
  const survivors = ['cccc', 'bbbb', 'dddd'];
  const seen = new Set(survivors.map(me => electHost([me, ...survivors.filter(x => x !== me)])));
  assert.equal(seen.size, 1, '席によって答えが変わらない');
  assert.equal([...seen][0], 'bbbb');
  assert.equal(electHost([]), null);
});

test('引き継いだ人は、見落とした人のために宣言もする', async () => {
  const { mesh } = makeMesh('guest', 'bbbb', ['aaaa', 'bbbb', 'cccc']);
  await mesh.init(); await flush();
  const la = openLink(mesh, 'aaaa'), lc = openLink(mesh, 'cccc');
  la.dc.onmessage({ data: JSON.stringify({ t: 'hello', h: 1 }) });
  lc.dc.onmessage({ data: JSON.stringify({ t: 'hello', h: 0 }) });
  lc.dc.sent.length = 0;
  la.dc.onclose();
  const said = lc.dc.sent.map(s => JSON.parse(s).t);
  assert.ok(said.includes('hostis'), '残った相手に「自分がホストだ」と伝える');
  mesh.dispose();
});

test('宣言を受け取った側も、ホストの居場所を更新する', async () => {
  const { mesh } = makeMesh('guest', 'cccc', ['aaaa', 'bbbb', 'cccc']);
  await mesh.init(); await flush();
  const la = openLink(mesh, 'aaaa'), lb = openLink(mesh, 'bbbb');
  la.dc.onmessage({ data: JSON.stringify({ t: 'hello', h: 1 }) });
  lb.dc.onmessage({ data: JSON.stringify({ t: 'hello', h: 0 }) });
  assert.equal(Coop.hostId, 'aaaa');
  lb.dc.onmessage({ data: JSON.stringify({ t: 'hostis' }) });
  assert.equal(Coop.hostId, 'bbbb');
  mesh.dispose();
});

// === 待っている人を、黙って待たせない ===

test('ゲストがひとりきりのまま時間が過ぎたら、部屋が無いと言う', async () => {
  let t = 0;
  const { mesh } = makeMesh('guest', 'zzzz', ['zzzz'], { mesh: { now: () => t } });
  await mesh.init(); await flush(2);
  assert.notEqual(Coop.status, 'no_room', 'まだ待っているうちは言い切らない');
  t = 60000;
  mesh._checkAlone();
  assert.equal(Coop.status, 'no_room');
  mesh.dispose();
});

test('繋がったあとは、ひとりきりの見張りが働かない', async () => {
  let t = 0;
  const { mesh } = makeMesh('guest', 'zzzz', ['aaaa', 'zzzz'], { mesh: { now: () => t } });
  await mesh.init(); await flush();
  openLink(mesh, 'aaaa');
  t = 60000;
  mesh._checkAlone();
  assert.notEqual(Coop.status, 'no_room');
  mesh.dispose();
});

// === 定員の表示 ===

test('ロビーは「網目なら4人」と答える', async () => {
  const { mesh } = makeMesh('host', 'aaaa', ['aaaa']);
  await mesh.init();
  assert.equal(Coop.roomCapacity(), 4);
  mesh.dispose();
  Coop.transport = null;
  assert.equal(Coop.roomCapacity(), 2, '経路が無いときは控えめに2人と答える');
  Coop.reset();
});

test('始まったら、顔ぶれを見に行く間隔を落とす', async () => {
  const { mesh } = makeMesh('host', 'aaaa', ['aaaa', 'bbbb']);
  await mesh.init(); await flush();
  assert.equal(mesh.started, false);
  Coop.startGame();
  assert.equal(mesh.started, true, '遊んでいる間は合図サーバーを叩き続けない');
  mesh.dispose();
});
