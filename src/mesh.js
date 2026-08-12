// ============================================================
// mesh.js — 3〜4人を、常駐サーバーなしで繋ぐ(v2.0 PARTY の中身)
//
// これが解いた問題:
//   4人ぶんのゲームコードは前から書けていたのに、公開版はずっと2人までだった。
//   塞いでいたのは中継サーバー(`server/`)が**どこにも立っていない**こと。
//   立てれば月額が発生し、「サーバーを立てない」という設計の強みも消える。
//
// ここでやったこと:
//   直結(WebRTC)は「相手がひとり」ではない。RTCPeerConnection を人数ぶん
//   持てば網目(mesh)になる。塞いでいたのは直結そのものではなく、
//   **出会いの仕組みが2人ぶんの棚しか持っていなかったこと**だった。
//   `api/signal.js` に部屋(誰が居るか)と組ごとの棚を足したので、
//   中継サーバーを立てなくても4人が繋がる。月額はこれまで通りゼロのまま。
//
// 何を配るか:
//   届いたものは組ごとの線で全員へ流す(中継サーバーと同じ意味になる)。
//   送り主は**線そのもの**で分かるので、名乗りを信じる必要がない。
//   中継サーバーが接続番号を付けていたのと同じ強さを、線が代わりに持つ。
//
// 代わりに背負ったもの(正直に):
//   ホストの上りが人数ぶんになる。中継なら1通で済むワールド状態を、
//   4人なら3通送る。実測 2,211 バイト × 15Hz × 3 ≒ 100KB/秒。
//   Wi-Fi と 4G/5G なら通るが、上りの細い回線ではここが最初に苦しくなる。
//   差分送信(docs/multiplayer.md の宿題)を入れるとここが軽くなる。
// ============================================================

import { Save } from './save.js';
import { iceConfig, gatherIce } from './ice.js';

const SIG = '/api/signal';

// 部屋での呼び名に使う文字。l と o は 1 と 0 に見えるので外す。
//   api/signal.js の okPid が受ける集合の中に収まっていること。
const PID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

/** 1部屋の定員。api/signal.js の ROOM_MAX と src/coop.js の MAX_PLAYERS と揃える。 */
export const ROOM_MAX = 4;
/** ロビーで顔ぶれを見に行く間隔。短くすると KV の命令数がそのまま増える。 */
export const LOBBY_POLL_MS = 3000;
/** 始まってからの間隔。遅れて来た人と、抜けた人の後始末のためだけに回す。 */
export const PLAY_POLL_MS = 15000;
/** ゲストがひとりきりのまま、この時間を過ぎたら「部屋が無い」と言う。 */
export const ALONE_MS = 45000;
/**
 * 線を張り始めてから、これだけ経っても開通しなければ諦めて張り直す。
 *
 * かつてこの見張りは**握手が済んでから**動き出していた。だから握手そのものが
 * 止まった線 —— 相手の合図が棚に載らないまま待ち続ける線 —— は見張られず、
 * 実ブラウザ4枚で「6組のうち1組だけが永久に繋がらない」状態を作っていた。
 * 期限は握手を始めた瞬間から数える。
 */
export const LINK_WATCHDOG_MS = 20000;
/**
 * 生存の合図を送る間隔。
 *
 * ロビーでは名乗ったきり誰も何も送らないので、**居るのに音沙汰が無い**状態になる。
 * `Coop.livePeers()` は2.5秒で相方を数えなくなるため、これが無いと
 * ロビーの顔ぶれが数秒で自分ひとりに戻る。
 */
export const HEARTBEAT_MS = 1200;
/**
 * この時間なにも届かなければ、その線は死んだものとして畳む。
 *
 * **タブを閉じた相手を、ブラウザは教えてくれない。** 実測(Chromium):
 *   DataChannel の onclose … 永久に来ない
 *   iceConnectionState      … 'disconnected' で止まり、'failed' にならない
 *   connectionState         … 'failed' になるまで **約16秒**
 * ブラウザの通知を待つと、その間ずっと全員の世界が止まる。
 * 自前の合図が途絶えたことで判断する方が速く、ブラウザ差にも左右されない。
 */
export const LINK_DEAD_MS = 4500;
/**
 * ひとりの相手に対して、線を張り直す上限。
 *
 * 実ブラウザ4枚で確かめている最中に、**6組のうち1組だけが繋がらないまま
 * 止まる**ことがあった。張り直す道が無かったので、その2人は永久に相手が
 * 見えない。握手は一度きりの儀式ではないので、諦める前に何度か試す。
 */
export const LINK_RETRIES = 5;

/** 部屋での呼び名を作る。4文字なので 32^4 ≒ 100万通り。4人なら衝突しない。 */
export function makePid(rnd = Math.random) {
  let s = '';
  for (let i = 0; i < 4; i++) s += PID_CHARS[Math.floor(rnd() * PID_CHARS.length)];
  return s;
}

/**
 * ふたりぶんの合図を置く棚の名前。
 * どちらから見ても同じ名前になるよう、番号の若い方を先に置く。
 */
export function pairKey(a, b) { return a < b ? `${a}-${b}` : `${b}-${a}`; }

/**
 * 申し込む側(offer を作る側)は、いつも番号の若い方。
 * 決めておかないと両者が同時に申し込み、どちらの申し込みも成立しない。
 */
export function isOfferer(me, them) { return me < them; }

/**
 * ホストが消えたときの後継。
 * 全員が同じ答えを出せなければ意味がないので、番号の若い順という
 * 誰から見ても同じになる規則にする(中継サーバーが指名していた役目)。
 */
export function electHost(ids) {
  return [...ids].filter(Boolean).sort()[0] || null;
}

// === 1本の線 ===
class Link {
  constructor(mesh, peerId) {
    this.m = mesh; this.id = peerId;
    this.pc = null; this.dc = null;
    this.open = false; this.dead = false;
    this.lastRecvAt = 0;   // 最後に何かが届いた時刻。生死の判断はここだけを見る
    this._wd = null;
  }

  async start() {
    const RTC = this.m.RTC;
    if (!RTC) throw new Error('no_webrtc');
    this.watchdog();     // 期限は「開通するまで」に掛ける。握手の途中で止まっても気づけるように
    this.pc = new RTC({ iceServers: await this.m.ice(), iceCandidatePoolSize: 2 });
    // 'disconnected' は一時的に起きて自力回復することがあるので失敗扱いにしない。
    //   なお相手がタブを閉じた場合、ここは 'disconnected' で止まって
    //   'failed' まで進まない(実測)。当てにできるのは connectionState と、
    //   合図の途絶え(LINK_DEAD_MS)の方。
    this.pc.oniceconnectionstatechange = () => {
      if (this.pc && this.pc.iceConnectionState === 'failed') this.kill();
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc && this.pc.connectionState;
      if (s === 'failed' || s === 'closed') this.kill();
    };
    const key = pairKey(this.m.pid, this.id);
    if (isOfferer(this.m.pid, this.id)) {
      this.setup(this.pc.createDataChannel('coop'));
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await gatherIce(this.pc);
      if (this.dead || this.m.disposed) return;
      await this.m.postSdp(key, 'offer', this.pc.localDescription.sdp);
      const ans = await this.m.pollSdp(key, 'answer');
      if (this.dead || this.m.disposed) return;
      await this.pc.setRemoteDescription({ type: 'answer', sdp: ans });
    } else {
      this.pc.ondatachannel = e => this.setup(e.channel);
      const off = await this.m.pollSdp(key, 'offer');
      if (this.dead || this.m.disposed) return;
      await this.pc.setRemoteDescription({ type: 'offer', sdp: off });
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await gatherIce(this.pc);
      if (this.dead || this.m.disposed) return;
      await this.m.postSdp(key, 'answer', this.pc.localDescription.sdp);
    }
  }

  watchdog() {
    clearTimeout(this._wd);
    this._wd = setTimeout(() => { if (!this.open) this.kill(); }, LINK_WATCHDOG_MS);
  }

  setup(dc) {
    this.dc = dc;
    dc.onopen = () => {
      clearTimeout(this._wd);
      if (this.dead) return;
      this.open = true;
      this.lastRecvAt = this.m.now();
      this.m.onLinkOpen(this);
    };
    // 送り主は**この線**で決まる。相手の名乗りを信じないので、なりすませない。
    dc.onmessage = e => {
      this.lastRecvAt = this.m.now();
      try { this.m.c.onMsg(JSON.parse(e.data), this.id); } catch (err) {}
    };
    dc.onclose = () => {
      const was = this.open;
      this.open = false;
      if (was) this.m.onLinkClose(this);
    };
  }

  sendRaw(text) {
    if (!this.open || !this.dc) return;
    try { this.dc.send(text); } catch (e) { /* 満杯・切断直後は捨てる */ }
  }

  kill() {
    if (this.dead) return;
    this.dead = true;
    const was = this.open;
    this.open = false;
    clearTimeout(this._wd);
    try { if (this.dc) this.dc.close(); } catch (e) {}
    try { if (this.pc) this.pc.close(); } catch (e) {}
    if (was) this.m.onLinkClose(this);
    else this.m.onLinkFail(this);
  }
}

// === 網目 ===
export class MeshTransport {
  /**
   * @param {object} coop  src/coop.js の Coop
   * @param {string} role  'host' | 'guest'
   * @param {string} code  あいことば
   * @param {object} opts  テストから差し替える口(fetch / RTC / ice / pid / 時計)
   */
  constructor(coop, role, code, opts = {}) {
    this.c = coop; this.role = role; this.code = code;
    this.pid = opts.pid || makePid();
    this.links = new Map();       // 相手の番号 → 線
    this.members = [];            // 部屋の顔ぶれ(合図サーバーが見ている範囲)
    this.disposed = false;
    this.sigDown = false;
    this.roomFull = false;
    this.started = false;         // ゲームが始まったか(顔ぶれを見る間隔が変わる)
    this.capacity = ROOM_MAX;
    this._fetch = opts.fetch || ((...a) => fetch(...a));
    this.ice = opts.ice || iceConfig;
    this.RTC = opts.RTC || (typeof RTCPeerConnection === 'function' ? RTCPeerConnection : null);
    this.now = opts.now || (() => Date.now());
    this.sig = opts.sig || SIG;
    this.lobbyPollMs = opts.lobbyPollMs || LOBBY_POLL_MS;
    this.playPollMs = opts.playPollMs || PLAY_POLL_MS;
    this.heartbeatMs = opts.heartbeatMs || HEARTBEAT_MS;
    this.deadMs = opts.deadMs || LINK_DEAD_MS;
    this._timer = null;
    this._beat = null;
    this._lastHb = 0;
    this._used = new Map();    // 棚 → 一度読んだ合図。同じものを二度使わないため
    this._tries = new Map();   // 相手 → 張り直した回数
    this._aloneSince = null;   // ひとりきりで待ち始めた時刻(繋がったら null)
  }

  /** どれか1本でも開いていれば「繋がっている」。 */
  get open() { for (const l of this.links.values()) if (l.open) return true; return false; }
  /** ロビー表示用。網目も端末どうしの直結なので ⚡ のまま。 */
  get via() { return this.open ? 'p2p' : ''; }
  /** いま開いている線の本数。 */
  get linkCount() { let n = 0; for (const l of this.links.values()) if (l.open) n++; return n; }

  async init() {
    this.c.selfId = this.pid;
    if (this.role === 'host') this.c.hostId = this.pid;
    this._aloneSince = this.now();
    await this.pump();            // 最初の1回。ここで合図サーバーの生死が分かる
    this._schedule();
    this.startBeat();
  }

  /**
   * 生存の合図と、途絶えた線の後始末。
   *
   * ゲームのループ(`Coop.update`)には載せない —— あれは遊んでいる間しか
   * 回らないので、ロビーで抜けた人がいつまでも顔ぶれに残ってしまう。
   */
  startBeat() {
    if (this._beat) return;
    this._beat = setInterval(() => this.beat(), Math.max(200, this.heartbeatMs));
    if (this._beat && this._beat.unref) this._beat.unref();   // Node で走らせても居座らない
  }

  beat() {
    if (this.disposed) return;
    const now = this.now();
    // 音沙汰が絶えた線を畳む。ブラウザの通知より速く、ブラウザ差にも左右されない。
    for (const l of [...this.links.values()]) {
      if (l.open && now - l.lastRecvAt > this.deadMs) l.kill();
    }
    if (now - this._lastHb >= this.heartbeatMs) { this._lastHb = now; this.send({ t: 'hb' }); }
  }

  // === 合図サーバー ===
  async post(body) {
    const r = await this._fetch(this.sig, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: this.code, ...body }),
    });
    if (r.status === 503) { this.sigDown = true; throw new Error('signal_off'); }
    // 部屋を知らない合図サーバー(= v1 のまま)。呼び出し元が直結へ戻す。
    if (r.status === 400) throw new Error('signal_room');
    if (!r.ok) throw new Error('signal ' + r.status);
    return r.json();
  }

  async postSdp(pair, kind, sdp) { return this.post({ kind, pair, sdp }); }

  /**
   * 相手の合図が棚に置かれるのを待つ。
   *
   * **一度使った合図は二度使わない。** 組の棚は名前が固定なので、張り直しの
   * ときに前回の合図がまだ載っている。それを読むと、相手はもう捨てた接続に
   * 向かって握手を続けることになり、その組だけ永久に繋がらない。
   * 読んだ中身を覚えておいて、違うものが載るまで待つ。
   */
  async pollSdp(pair, kind, tries = 20) {
    const memo = `${pair}:${kind}`;
    for (let i = 0; i < tries; i++) {
      if (this.disposed) throw new Error('disposed');
      let r;
      try {
        r = await this._fetch(`${this.sig}?code=${this.code}&want=${kind}&pair=${pair}`);
      } catch (e) {
        this.c.sigNote = 'net';                       // 電波が切れているだけかもしれない
        await this._sleep(1300); continue;
      }
      if (r.status === 503) { this.sigDown = true; throw new Error('signal_off'); }
      if (!r.ok) { this.c.sigNote = 'http' + r.status; }
      else {
        this.c.sigNote = '';
        const j = await r.json();
        if (j && j.sdp && j.sdp !== this._used.get(memo)) { this._used.set(memo, j.sdp); return j.sdp; }
      }
      await this._sleep(1300);
    }
    throw new Error('timeout');
  }

  _sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

  /** 部屋に名乗り、増えた相手に線を張る。 */
  async pump() {
    const j = await this.post({ kind: 'room', pid: this.pid });
    if (this.disposed) return;
    this.roomFull = !!j.full;
    if (j.full) { this.c.status = 'room_full'; return; }
    this.applyMembers(Array.isArray(j.members) ? j.members : []);
  }

  applyMembers(ids) {
    this.members = ids;
    for (const id of ids) {
      if (id === this.pid || this.links.has(id)) continue;
      // 定員を超えて線を張らない。番号が化けても機体が無限に増えないこと。
      if (this.links.size >= ROOM_MAX - 1) continue;
      // **張り直しはするが、無限にはしない。**
      //   4人のうち1組だけ直通が張れない回線の組み合わせは実在する。
      //   そこを黙って諦めると「その人だけ入れない」になり、
      //   際限なく試すと合図サーバーを叩き続けることになる。
      const n = this._tries.get(id) || 0;
      if (n >= LINK_RETRIES) continue;
      this._tries.set(id, n + 1);
      const link = new Link(this, id);
      this.links.set(id, link);
      link.start().catch(() => link.kill());
    }
    if (this.linkCount > 0) this._aloneSince = null;
  }

  _schedule() {
    if (this.disposed) return;
    clearTimeout(this._timer);
    this._timer = setTimeout(async () => {
      if (this.disposed) return;
      try { await this.pump(); } catch (e) { /* 一時的な失敗は次の周回で取り返す */ }
      this._checkAlone();
      this._schedule();
    }, this.started ? this.playPollMs : this.lobbyPollMs);
  }

  /**
   * ゲストがひとりきりのまま待たされ続けるのを止める。
   * あいことばを打ち間違えても部屋は作られてしまうので、
   * 「誰も来ない部屋」と「間違えた部屋」は外からは区別できない。
   * 黙って待たせるより、45秒で言い切ってやり直させる方がいい。
   */
  _checkAlone() {
    if (this.role !== 'guest' || this.linkCount > 0 || this._aloneSince == null) return;
    if (this.now() - this._aloneSince > ALONE_MS && !this.c.connected) this.c.status = 'no_room';
  }

  /** ゲームが始まった。顔ぶれを見に行く間隔を落とす(命令数と電池のため)。 */
  lobbyClosed() { this.started = true; this._schedule(); }

  // === 線の開閉 ===
  onLinkOpen(link) {
    this.c.p2p = true;
    this.c.status = '';
    this._aloneSince = null;
    // 繋がったので、この相手ぶんの張り直し回数は帳消し。
    //   途中で一度切れた相手が、以前の失敗のせいで戻れなくなるのを防ぐ。
    this._tries.delete(link.id);
    // 自分が何者で、ホストなのかを名乗る。ホストが誰かを全員が知らないと、
    //   ホストが抜けたときに誰も引き継げない。
    link.sendRaw(JSON.stringify({
      t: 'hello', name: Save.name(), ch: Save.charIndex(),
      h: this.c.role === 'host' ? 1 : 0,
    }));
  }

  onLinkClose(link) {
    this.links.delete(link.id);
    this.c.dropPeer(link.id);
    if (!this.disposed && this.linkCount === 0 && this.c.status === '') this.c.status = 'closed';
  }

  onLinkFail(link) {
    this.links.delete(link.id);
    // まだ誰とも繋がっていないなら、原因を画面に出す。
    //   既に他の人と遊べているなら、1本失敗したことは黙って飲み込む。
    if (!this.disposed && this.linkCount === 0 && !this.c.connected) this.c.status = 'p2p_failed';
  }

  // === 送信 ===
  /** 開いている線すべてへ。文字列化は1回だけ(ホストは人数ぶん同じものを送る)。 */
  send(o) {
    let s;
    for (const l of this.links.values()) {
      if (!l.open) continue;
      if (s === undefined) { try { s = JSON.stringify(o); } catch (e) { return; } }
      l.sendRaw(s);
    }
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this._timer);
    clearInterval(this._beat); this._beat = null;
    for (const l of this.links.values()) { l.dead = true; l.open = false; clearTimeout(l._wd); try { if (l.dc) l.dc.close(); if (l.pc) l.pc.close(); } catch (e) {} }
    this.links.clear();
    // 部屋から名前を消す。残しても25秒で落ちるが、消せるなら消しておく方が
    //   「もう居ない人が定員を1つ占めている」時間が短くなる。
    try { this.post({ kind: 'leave', pid: this.pid }).catch(() => {}); } catch (e) {}
  }
}
