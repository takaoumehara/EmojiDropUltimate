// ============================================================
// server.test.js — 中継サーバーが「本物のWebSocketとして」動くことの証明
//
// 偽の接続ではなく、Node 22 標準の WebSocket クライアントで実際に繋いで確かめる。
// 自前で RFC 6455 を書いた以上、ブラウザが喋る言葉と噛み合っているかは
// 実接続でしか分からない。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/ws.js';
import { Relay } from '../server/relay.js';

// --- テスト用のサーバーを立てて、後始末まで面倒を見る ---
async function withServer(fn, limits) {
  const relay = new Relay(limits);
  const app = createServer({ onConnection: (conn, url) => relay.accept(conn, url) });
  await new Promise(res => app.listen(0, res));
  const port = app.server.address().port;
  try { return await fn({ port, relay, url: `ws://127.0.0.1:${port}` }); }
  finally { app.close(); }
}

// --- 受け取ったメッセージを溜めておくクライアント ---
function client(url, code, name = '') {
  const ws = new WebSocket(`${url}/?code=${code}&name=${encodeURIComponent(name)}`);
  const got = [];
  const waiters = [];
  // src/wstransport.js と同じ読み方をする。サーバーが作った通知は '{' で始まり、
  //   中継されたものは "7|{...}" のように送り主の番号が頭に付く。
  ws.addEventListener('message', e => {
    const raw = String(e.data);
    let o;
    if (raw[0] === '{') { try { o = JSON.parse(raw); } catch (err) { o = raw; } }
    else {
      const bar = raw.indexOf('|');
      try { o = JSON.parse(raw.slice(bar + 1)); o._from = raw.slice(0, bar); }
      catch (err) { o = raw; }
    }
    got.push(o);
    for (const w of waiters.splice(0)) w();
  });
  const closed = new Promise(res => ws.addEventListener('close', e => res(e)));
  return {
    ws, got, closed,
    opened: new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', () => rej(new Error('ws error')));
    }),
    send(o) { ws.send(JSON.stringify(o)); },
    /** 条件を満たすメッセージが来るまで待つ。 */
    async until(pred, ms = 3000) {
      const end = Date.now() + ms;
      for (;;) {
        const hit = got.find(pred);
        if (hit) return hit;
        if (Date.now() > end) throw new Error('timeout waiting; got ' + JSON.stringify(got));
        await new Promise(res => { waiters.push(res); setTimeout(res, 30); });
      }
    },
    close() { try { ws.close(); } catch (e) {} },
  };
}

test('ブラウザのWebSocketで実際に接続できる', async () => {
  await withServer(async ({ url }) => {
    const a = client(url, 'ABCDEF');
    await a.opened;
    const room = await a.until(m => m.t === '_room');
    assert.equal(room.code, 'ABCDEF');
    assert.equal(room.role, 'host', '最初に来た人がホストになること');
    assert.equal(room.members.length, 1);
    a.close();
  });
});

test('同じあいことばの2人がメッセージを届けあえる', async () => {
  await withServer(async ({ url }) => {
    const a = client(url, 'QWERTY', 'A');
    await a.opened;
    const b = client(url, 'QWERTY', 'B');
    await b.opened;

    // 2人揃ったことが両方に伝わる
    await a.until(m => m.t === '_room' && m.members.length === 2);
    const rb = await b.until(m => m.t === '_room' && m.members.length === 2);
    assert.equal(rb.role, 'guest', '後から来た人がゲストになること');

    // ゲームのメッセージがそのまま相手に届く
    a.send({ t: 'pos', x: 0.5, y: 0.9, s: 1234 });
    const pos = await b.until(m => m.t === 'pos');
    assert.equal(pos.s, 1234);
    assert.equal(pos.x, 0.5);
    // 誰から来たのかがサーバーによって付いている。3人以上で機体を描き分けるのに要る。
    const ra = a.got.find(m => m.t === '_room');
    assert.equal(pos._from, String(ra.you), '送り主の番号が付くこと');

    // 逆方向も
    b.send({ t: 'dmg', d: 7 });
    const dmg = await a.until(m => m.t === 'dmg');
    assert.equal(dmg.d, 7);

    a.close(); b.close();
  });
});

test('自分が送ったものは自分には返ってこない', async () => {
  await withServer(async ({ url }) => {
    const a = client(url, 'AAAAAA');
    await a.opened;
    const b = client(url, 'AAAAAA');
    await b.opened;
    await b.until(m => m.t === '_room' && m.members.length === 2);

    a.send({ t: 'pos', x: 1 });
    await b.until(m => m.t === 'pos');
    assert.equal(a.got.filter(m => m.t === 'pos').length, 0, '送り主には戻らないこと');
    a.close(); b.close();
  });
});

test('3人・4人も同じ部屋に入れる(2人固定はクライアント側の制限)', async () => {
  await withServer(async ({ url }) => {
    const cs = [];
    for (let i = 0; i < 4; i++) { const c = client(url, 'FUURPZ'); await c.opened; cs.push(c); }
    const last = await cs[0].until(m => m.t === '_room' && m.members.length === 4);
    assert.equal(last.members.length, 4);

    // ひとりの発言が残り全員に届き、全員が「誰から来たか」を同じ番号で見る
    cs[0].send({ t: 'pos', x: 0.11 });
    const senderId = String((cs[1].got.find(m => m.t === '_room').members[0]).id);
    for (let i = 1; i < 4; i++) {
      const p = await cs[i].until(m => m.t === 'pos');
      assert.equal(p.x, 0.11);
      assert.equal(p._from, senderId, '全員が同じ番号で送り主を識別できること');
    }

    // 4人がそれぞれ喋ると、受け手には4通りの番号で届く(機体を描き分けられる)
    for (let i = 1; i < 4; i++) cs[i].send({ t: 'hello', name: 'P' + i });
    const seen = new Set();
    for (let tries = 0; tries < 100 && seen.size < 3; tries++) {
      for (const m of cs[0].got) if (m.t === 'hello') seen.add(m._from);
      if (seen.size < 3) await new Promise(r => setTimeout(r, 30));
    }
    assert.equal(seen.size, 3, '3人の相方が別々の番号として見えること');
    for (const c of cs) c.close();
  });
});

test('定員を超えた5人目は理由付きで断られる', async () => {
  await withServer(async ({ url }) => {
    const cs = [];
    for (let i = 0; i < 4; i++) { const c = client(url, 'FULLUP'); await c.opened; cs.push(c); }
    const fifth = client(url, 'FULLUP');
    const ev = await fifth.closed;
    assert.equal(ev.code, 4001, '「満員」として断ること');
    for (const c of cs) c.close();
  });
});

test('あいことばの形が違えば入れない', async () => {
  await withServer(async ({ url }) => {
    for (const bad of ['ABC', 'abcdefg', 'AAAAA0', 'AAAAAI']) {   // 0 と I は紛らわしいので使わない字
      const c = client(url, encodeURIComponent(bad));
      const ev = await c.closed;
      assert.equal(ev.code, 4000, `${bad} は弾かれること`);
    }
  });
});

test('抜けたら残った人に伝わり、空になった部屋は消える', async () => {
  await withServer(async ({ url, relay }) => {
    const a = client(url, 'LEAVES');
    await a.opened;
    const b = client(url, 'LEAVES');
    await b.opened;
    await a.until(m => m.t === '_room' && m.members.length === 2);

    b.close();
    await a.until(m => m.t === '_room' && m.members.length === 1);
    assert.equal(relay.rooms.size, 1);

    a.close();
    // close の伝播を待つ
    for (let i = 0; i < 60 && relay.rooms.size > 0; i++) await new Promise(r => setTimeout(r, 30));
    assert.equal(relay.rooms.size, 0, '誰も居ない部屋は残さないこと');
  });
});

test('送りすぎる相手は切る(他の人を巻き添えにしない)', async () => {
  await withServer(async ({ url }) => {
    const a = client(url, 'FLZZDY');
    await a.opened;
    for (let i = 0; i < 200; i++) a.send({ t: 'pos', x: i });
    const ev = await a.closed;
    assert.equal(ev.code, 4002);
  }, { MSG_PER_SEC: 30 });
});

test('長いメッセージも壊れずに届く(スナップショットは数KBある)', async () => {
  await withServer(async ({ url }) => {
    const a = client(url, 'BGMSGX');
    await a.opened;
    const b = client(url, 'BGMSGX');
    await b.opened;
    await b.until(m => m.t === '_room' && m.members.length === 2);

    // 実際のワールド配信に近い大きさ。126/65536 バイト境界のまたぎを踏む。
    for (const n of [100, 200, 5000, 70000]) {
      const payload = 'x'.repeat(n);
      a.send({ t: 'w', big: payload, n });
      const got = await b.until(m => m.t === 'w' && m.n === n, 5000);
      assert.equal(got.big.length, n, `${n} バイトが欠けずに届くこと`);
    }
    a.close(); b.close();
  });
});

test('絵文字(マルチバイト)が壊れない', async () => {
  await withServer(async ({ url }) => {
    const a = client(url, 'EMJRUN');
    await a.opened;
    const b = client(url, 'EMJRUN');
    await b.opened;
    await b.until(m => m.t === '_room' && m.members.length === 2);
    const name = '🍌🦍👨‍🍳ゴリラ';
    a.send({ t: 'hello', name });
    const got = await b.until(m => m.t === 'hello');
    assert.equal(got.name, name);
    a.close(); b.close();
  });
});

test('別のあいことばの部屋には漏れない', async () => {
  await withServer(async ({ url }) => {
    const a = client(url, 'RXXMAA');
    const b = client(url, 'RXXMBB');
    await a.opened; await b.opened;
    a.send({ t: 'pos', x: 0.9 });
    await new Promise(r => setTimeout(r, 200));
    assert.equal(b.got.filter(m => m.t === 'pos').length, 0);
    a.close(); b.close();
  });
});
