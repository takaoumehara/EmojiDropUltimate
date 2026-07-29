// ============================================================
// server/ws.js — WebSocket サーバー(依存パッケージ ゼロ)
//
// なぜ自前で書くのか:
//   このプロジェクトは「ビルド無し・外部ライブラリ無し」を通している。
//   サーバー側だけ npm install を持ち込むと、動かすのに毎回段取りが要り、
//   「そのまま git clone して node で起動」が崩れる。
//   必要なのは RFC 6455 のごく一部(テキストフレーム・ping・close)だけなので、
//   Node 標準の http と crypto で足りる。
//
// 対応していないもの(意図的):
//   - binary フレーム: 送るのは JSON だけ
//   - permessage-deflate: 圧縮は後で足せる。まず正しく動くことを優先
//   - サブプロトコル交渉
// ============================================================

import http from 'node:http';
import crypto from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';   // RFC 6455 で決められた固定値
const OP = { CONT: 0x0, TEXT: 0x1, BIN: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };
const MAX_FRAME = 512 * 1024;   // 1メッセージの上限。壊れた/悪意ある相手で無限に太らせない

function acceptKey(key) {
  return crypto.createHash('sha1').update(key + GUID).digest('base64');
}

// === 1本の接続 ===
class Conn {
  constructor(socket, req) {
    this.socket = socket;
    this.req = req;
    this.open = true;
    this.buf = Buffer.alloc(0);
    this.frags = [];        // 分割フレームの途中
    this.fragOp = 0;
    this.alive = true;      // ping に応えているか
    this.onmessage = null;
    this.onclose = null;
    this.ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || socket.remoteAddress || '';

    socket.on('data', d => this._feed(d));
    socket.on('error', () => this.close(1011, 'socket error'));
    socket.on('close', () => this._down());
    socket.setNoDelay(true);   // 弾の位置を 66ms ごとに送る。Nagle で溜められると台無し
  }

  _down() {
    if (!this.open) return;
    this.open = false;
    if (this.onclose) this.onclose();
  }

  _feed(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    // 1チャンクに複数フレームが入ることも、1フレームが複数チャンクに割れることもある
    for (;;) {
      const frame = this._readFrame();
      if (!frame) break;
      this._handle(frame);
      if (!this.open) break;
    }
  }

  /** バッファの先頭から1フレーム取り出す。足りなければ null を返して待つ。 */
  _readFrame() {
    const b = this.buf;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const op = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < off + 2) return null;
      len = b.readUInt16BE(off); off += 2;
    } else if (len === 127) {
      if (b.length < off + 8) return null;
      const big = b.readBigUInt64BE(off); off += 8;
      if (big > BigInt(MAX_FRAME)) { this.close(1009, 'too big'); return null; }
      len = Number(big);
    }
    if (len > MAX_FRAME) { this.close(1009, 'too big'); return null; }
    // 仕様上、クライアントからのフレームは必ずマスクされている。
    //   マスクされていない = 仕様違反か、WebSocket ではない何か。
    if (!masked) { this.close(1002, 'unmasked'); return null; }
    if (b.length < off + 4 + len) return null;
    const mask = b.subarray(off, off + 4); off += 4;
    const payload = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) payload[i] = b[off + i] ^ mask[i & 3];
    this.buf = b.subarray(off + len);
    return { fin, op, payload };
  }

  _handle(f) {
    switch (f.op) {
      case OP.PING: this._write(OP.PONG, f.payload); break;
      case OP.PONG: this.alive = true; break;
      case OP.CLOSE: this.close(1000, ''); break;
      case OP.TEXT:
      case OP.BIN:
      case OP.CONT: {
        if (f.op !== OP.CONT) { this.frags = []; this.fragOp = f.op; }
        this.frags.push(f.payload);
        const total = this.frags.reduce((n, p) => n + p.length, 0);
        if (total > MAX_FRAME) { this.close(1009, 'too big'); return; }
        if (!f.fin) return;
        const body = Buffer.concat(this.frags);
        this.frags = [];
        if (this.fragOp === OP.TEXT && this.onmessage) this.onmessage(body.toString('utf8'));
        break;
      }
      default: this.close(1002, 'bad opcode');
    }
  }

  _write(op, payload) {
    if (!this.open || this.socket.destroyed) return;
    const len = payload.length;
    let head;
    // サーバー → クライアントはマスクしない(仕様)。長さの表し方だけ3通り。
    if (len < 126) {
      head = Buffer.allocUnsafe(2);
      head[0] = 0x80 | op; head[1] = len;
    } else if (len < 65536) {
      head = Buffer.allocUnsafe(4);
      head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.allocUnsafe(10);
      head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2);
    }
    try { this.socket.write(Buffer.concat([head, payload])); } catch (e) { this._down(); }
  }

  /** 文字列を送る。JSON はここへ。 */
  send(text) { this._write(OP.TEXT, Buffer.from(String(text), 'utf8')); }
  sendJson(obj) { try { this.send(JSON.stringify(obj)); } catch (e) { /* 循環参照など */ } }
  ping() { this.alive = false; this._write(OP.PING, Buffer.alloc(0)); }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    const r = Buffer.from(reason, 'utf8');
    const p = Buffer.allocUnsafe(2 + r.length);
    p.writeUInt16BE(code, 0); r.copy(p, 2);
    this._write(OP.CLOSE, p);
    this.open = false;
    try { this.socket.end(); } catch (e) {}
    if (this.onclose) this.onclose();
  }
}

/**
 * WebSocket サーバーを立てる。
 * @param {{port?: number, onConnection: (conn: Conn, url: URL) => void, onHttp?: Function}} opt
 */
export function createServer(opt) {
  const server = http.createServer((req, res) => {
    if (opt.onHttp && opt.onHttp(req, res)) return;
    // 生存確認。ロードバランサや「動いているか」の目視に使う。
    if (req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    res.writeHead(426, { 'content-type': 'text/plain' });
    res.end('this endpoint speaks WebSocket');
  });

  const conns = new Set();

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    const ver = req.headers['sec-websocket-version'];
    if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !key || ver !== '13') {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`
    );
    const conn = new Conn(socket, req);
    conns.add(conn);
    const prevClose = conn.onclose;
    conn.onclose = () => { conns.delete(conn); if (prevClose) prevClose(); };
    let url;
    try { url = new URL(req.url, 'ws://x'); } catch (e) { url = new URL('/', 'ws://x'); }
    opt.onConnection(conn, url);
  });

  // 切れたのに気づかない接続(モバイル回線でよくある)を掃除する。
  //   30秒ごとに ping し、次の ping までに pong が返らなければ切る。
  const heartbeat = setInterval(() => {
    for (const c of conns) {
      if (!c.alive) { c.close(1001, 'no pong'); continue; }
      c.ping();
    }
  }, 30000);
  heartbeat.unref();

  return {
    server,
    conns,
    listen(port, cb) { server.listen(port, cb); return this; },
    close() { clearInterval(heartbeat); for (const c of conns) c.close(1001, 'shutdown'); server.close(); },
  };
}

export { Conn };
