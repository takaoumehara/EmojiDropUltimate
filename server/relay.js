// ============================================================
// server/relay.js — あいことばの部屋と、そこへの中継
//
// これが解くもの:
//   いまの2人プレイは端末どうしの直結(WebRTC)。速くて安いが、
//   厳しい回線どうしだと直通が張れず「直接つながれませんでした」で終わる。
//   ここを通せば、必ず繋がる道ができる。
//
// あえてやらないこと:
//   ゲームの中身を理解しない。届いたものを部屋の他の人へそのまま流すだけ。
//   こうしておけば、ゲームのプロトコル(pos/dmg/w/bd…)が増えても
//   サーバーを直さずに済む。ワールドをサーバーが計算する形へ進むのは別の段。
// ============================================================

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;   // coop.js の CODE_CHARS と同じ集合

export const LIMITS = {
  MEMBERS: 4,          // 1部屋の上限。3〜4人はここが開けば届く
  ROOMS: 500,          // プロセス全体。メモリを守るための上限
  MSG_PER_SEC: 90,     // 1接続あたり。位置20Hz + スナップ15Hz + 余裕
  BYTES_PER_SEC: 200 * 1024,
  IDLE_MS: 10 * 60 * 1000,   // 誰も喋らない部屋を畳むまで
};

let nextId = 1;

class Room {
  constructor(code) {
    this.code = code;
    this.members = new Map();   // id -> member
    this.createdAt = Date.now();
    this.touchedAt = Date.now();
  }
  get size() { return this.members.size; }

  add(member) {
    this.members.set(member.id, member);
    this.touchedAt = Date.now();
  }
  remove(id) {
    this.members.delete(id);
    this.touchedAt = Date.now();
  }
  /**
   * 送り主以外の全員へ流す。
   *
   * 誰から来たのかを頭に付ける("7|{...}")。3人以上だと、受け取った側は
   * 「これは誰の機体の位置か」を知らないと描き分けられない。
   *
   * 送り主の名乗りを信じるのではなく、サーバーが接続そのものに紐づく番号を
   * 付ける。こうすれば他人になりすませない。
   * JSON として解析し直さないので、毎秒何百通あっても費用はほぼゼロ。
   * サーバーが作ったメッセージは '{' で始まるので、受け取る側で区別できる。
   */
  relay(fromId, text) {
    this.touchedAt = Date.now();
    const tagged = fromId + '|' + text;
    for (const m of this.members.values()) {
      if (m.id === fromId) continue;
      m.conn.send(tagged);
    }
  }
  /** 部屋の顔ぶれが変わったことを全員に伝える。 */
  announce() {
    const roster = [...this.members.values()].map(m => ({ id: m.id, role: m.role, name: m.name }));
    for (const m of this.members.values()) {
      m.conn.sendJson({ t: '_room', code: this.code, you: m.id, role: m.role, members: roster });
    }
  }
}

export class Relay {
  constructor(limits = {}) {
    this.lim = { ...LIMITS, ...limits };
    this.rooms = new Map();
    this.stats = { joined: 0, relayed: 0, rejected: 0 };
  }

  /**
   * 新しい接続を部屋に入れる。
   * @param {*} conn server/ws.js の Conn
   * @param {URL} url  ?code=ABCDEF&name=...
   */
  accept(conn, url) {
    const code = String(url.searchParams.get('code') || '').toUpperCase();
    if (!CODE_RE.test(code)) { this.stats.rejected++; conn.close(4000, 'bad code'); return null; }

    let room = this.rooms.get(code);
    if (!room) {
      if (this.rooms.size >= this.lim.ROOMS) { this.stats.rejected++; conn.close(4003, 'server full'); return null; }
      room = new Room(code);
      this.rooms.set(code, room);
    }
    if (room.size >= this.lim.MEMBERS) { this.stats.rejected++; conn.close(4001, 'room full'); return null; }

    // 最初に来た人がホスト。いまのゲームは「ホストが世界を計算する」ので、
    //   誰がホストかは全員が同じ答えを持っている必要がある。
    const role = room.size === 0 ? 'host' : 'guest';
    const member = {
      id: nextId++, conn, role, room,
      name: String(url.searchParams.get('name') || '').slice(0, 14),
      msgs: 0, bytes: 0, windowAt: Date.now(),
    };
    room.add(member);
    this.stats.joined++;

    conn.onmessage = text => this._onMessage(member, text);
    conn.onclose = () => this._onClose(member);
    room.announce();
    return member;
  }

  _onMessage(member, text) {
    // 1接続あたりの流量を見る。壊れたクライアントや悪意のある相手が
    //   部屋の全員を巻き込んで詰まらせるのを防ぐ。
    const now = Date.now();
    if (now - member.windowAt >= 1000) { member.windowAt = now; member.msgs = 0; member.bytes = 0; }
    member.msgs++; member.bytes += text.length;
    if (member.msgs > this.lim.MSG_PER_SEC || member.bytes > this.lim.BYTES_PER_SEC) {
      this.stats.rejected++;
      member.conn.close(4002, 'too fast');
      return;
    }
    this.stats.relayed++;
    member.room.relay(member.id, text);
  }

  _onClose(member) {
    const room = member.room;
    const wasHost = member.role === 'host';
    room.remove(member.id);
    if (room.size === 0) { this.rooms.delete(room.code); return; }
    // ホストが抜けたら、残っている中で一番早く来た人に引き継ぐ。
    //   ホストは世界を計算している側なので、空席のままだと敵が止まって
    //   全員の画面が凍る。誰がホストかは全員が同じ答えを持つ必要があるので、
    //   サーバーが決めて全員に伝える。
    if (wasHost) {
      const next = [...room.members.values()].sort((a, b) => a.id - b.id)[0];
      if (next) next.role = 'host';
    }
    room.announce();   // 残った人に「相方が抜けた」「ホストが変わった」が伝わる
  }

  /** 誰も喋らなくなった部屋を畳む。定期的に呼ぶ。 */
  sweep(now = Date.now()) {
    let n = 0;
    for (const [code, room] of this.rooms) {
      if (now - room.touchedAt > this.lim.IDLE_MS) {
        for (const m of room.members.values()) m.conn.close(1001, 'idle');
        this.rooms.delete(code); n++;
      }
    }
    return n;
  }

  snapshot() {
    return {
      rooms: this.rooms.size,
      players: [...this.rooms.values()].reduce((n, r) => n + r.size, 0),
      ...this.stats,
    };
  }
}
