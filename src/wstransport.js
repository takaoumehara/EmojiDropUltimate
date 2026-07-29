// ============================================================
// wstransport.js — 常駐サーバー経由の接続と、直結との併走
//
//   WsTransport   … サーバーの部屋に入って中継してもらう。必ず繋がる。
//   DualTransport … 直結(WebRTC)と中継を同時に試し、開通した方で始める。
//
// なぜ「同時」なのか:
//   直結が張れない回線どうしだと、いまは 30〜80 秒待たされた末に
//   「直接つながれませんでした」で終わる。順番に試すとこの待ちが残る。
//   両方いっぺんに投げれば、中継はほぼ即座に開くので待ちが消え、
//   直結が間に合った場合はそちらを使うので速さも失わない。
//
// 途中で乗り換えない理由:
//   ゲームが始まってから経路を変えると、古い経路のメッセージが
//   新しい経路のメッセージを追い越して届きうる。ボスへの与ダメのように
//   積み上げていく値がある以上、順序が崩れる余地は作らない。
//   経路を決めるのはロビーにいる間だけ。
// ============================================================

import { Save } from './save.js';

/** index.html の <meta name="coop-relay" content="wss://..."> を読む。無ければ null。 */
export function relayUrl() {
  if (typeof document === 'undefined') return null;
  const m = document.querySelector('meta[name="coop-relay"]');
  const v = m && m.getAttribute('content');
  return v && /^wss?:\/\//.test(v) ? v.replace(/\/+$/, '') : null;
}

export class WsTransport {
  constructor(coop, role, code, url) {
    this.c = coop; this.role = role; this.code = code; this.url = url;
    this.ws = null; this.open = false; this.disposed = false;
    this.members = 1;
  }

  init() {
    return new Promise((resolve, reject) => {
      let ws;
      const q = `?code=${encodeURIComponent(this.code)}&name=${encodeURIComponent(Save.name() || '')}`;
      try { ws = new WebSocket(this.url + '/' + q); }
      catch (e) { reject(new Error('relay_failed')); return; }
      this.ws = ws;

      const fail = () => {
        if (this.disposed || this.open) return;
        reject(new Error('relay_failed'));
      };
      // 中継が即座に開かないなら、そのサーバーは当てにならない。
      //   直結側の待ちを邪魔しないよう短く見切る。
      const to = setTimeout(() => { if (!this.open) { try { ws.close(); } catch (e) {} fail(); } }, 8000);

      ws.onopen = () => {
        clearTimeout(to);
        if (this.disposed) { try { ws.close(); } catch (e) {} return; }
        this.open = true;
        this.hello();
        resolve();
      };
      ws.onmessage = e => {
        const raw = String(e.data);
        // サーバーが作った通知は '{' で始まる。中継されたものは "7|{...}" のように
        //   送り主の番号が頭に付く。3人以上だと、誰の機体かを知らないと描き分けられない。
        if (raw[0] === '{') { this._server(raw); return; }
        const bar = raw.indexOf('|');
        if (bar < 1) return;
        const from = raw.slice(0, bar);
        let o; try { o = JSON.parse(raw.slice(bar + 1)); } catch (err) { return; }
        this.c.onMsg(o, from);
      };
      ws.onerror = () => { clearTimeout(to); fail(); };
      ws.onclose = ev => {
        clearTimeout(to);
        const wasOpen = this.open;
        this.open = false;
        if (this.disposed) return;
        if (!wasOpen) { fail(); return; }
        // 4001 = 部屋が満員 / 4002 = 送りすぎ / 4000 = あいことばが不正
        this.c.status = ev && ev.code === 4001 ? 'room_full' : 'closed';
      };
    });
  }

  _server(raw) {
    let o; try { o = JSON.parse(raw); } catch (err) { return; }
    if (o.t !== '_room') return;
    const was = this.members;
    const ids = (o.members || []).map(m => String(m.id));
    this.members = ids.length;
    this.myId = String(o.you);
    // ホストが抜けると、サーバーが残った中の誰かをホストに指名する。
    //   指名されたら世界の計算を引き取る(でないと全員の画面で敵が止まる)。
    if (o.role === 'host' && this.c.role !== 'host') this.c.becomeHost();
    // 抜けた人の機体を画面に残さない。時間切れを待たずに消せる。
    for (const p of [...this.c.peers.keys()]) {
      if (!ids.includes(String(p))) this.c.dropPeer(p);
    }
    // 自分が先に入っていた場合、最初の hello は誰にも届いていない。
    //   顔ぶれが増えたと分かった時点でもう一度名乗る。
    if (this.members > was) this.hello();
  }

  hello() { this.send({ t: 'hello', name: Save.name(), ch: Save.charIndex() }); }

  send(o) {
    if (!this.open || !this.ws) return;
    try { this.ws.send(JSON.stringify(o)); } catch (e) {}
  }

  dispose() {
    this.disposed = true; this.open = false;
    try { if (this.ws) this.ws.close(); } catch (e) {}
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 相方が来てから、直結の開通をどれだけ待つか。
//   両者が揃っていれば ICE と DTLS は普通 1〜3 秒で終わる。それを過ぎるなら
//   その回線では張れない見込みが高いので、中継で始めてしまう方が体験がいい。
const P2P_GRACE = 5000;
// 相方も中継も来ないまま待ち続ける上限。ホストがロビーを開いたまま
//   放置している状態はここに当たらない(相方が来るまでは何も決めない)。
const GIVE_UP = 10 * 60 * 1000;

/**
 * 直結(WebRTC)と中継(WebSocket)を同時に走らせ、**相方が居る**と分かった
 * 経路のうち速い方で始める。
 *
 * 「先に開いた方」では駄目な理由:
 *   ホストは相方が来る前から中継の部屋に入れてしまう。開通の早さで選ぶと、
 *   直結が張れる相手でも必ず中継になる。判定は「相方が居るか」で行う。
 */
export class DualTransport {
  constructor(coop, role, code, makeRtc, url) {
    this.c = coop; this.role = role; this.code = code;
    this.rtc = makeRtc();
    this.ws = new WsTransport(coop, role, code, url);
    this.picked = null;       // 決まった経路。以後ここだけを使う
    this.disposed = false;
    this.rtcFailed = false; this.wsFailed = false;
  }

  get open() { return !!(this.picked && this.picked.open); }
  /** ロビー表示用: 直結で繋がったのか、中継なのか。 */
  get via() { return this.picked === this.rtc ? 'p2p' : this.picked === this.ws ? 'relay' : ''; }
  /** 中継に相方が居るか。直結が開いていれば相方が居るのは自明。 */
  get relayReady() { return this.ws.open && this.ws.members >= 2; }

  async init() {
    // 両方いっぺんに投げる。失敗は握って、印だけ立てる。
    this.rtc.init().catch(() => { this.rtcFailed = true; });
    this.ws.init().catch(() => { this.wsFailed = true; });

    const t0 = Date.now();
    let readyAt = 0;
    while (!this.disposed) {
      // 直結が開いた = 相方が居て、かつ速い。迷わずこれ。
      if (this.rtc.open) return this._pick(this.rtc);

      if (this.relayReady) {
        if (!readyAt) readyAt = Date.now();
        // 直結が既に諦めているなら待つ意味がない
        if (this.rtcFailed || Date.now() - readyAt > P2P_GRACE) return this._pick(this.ws);
      }
      if (this.rtcFailed && this.wsFailed) throw new Error('p2p_failed');
      if (Date.now() - t0 > GIVE_UP) throw new Error('timeout');
      await sleep(80);
    }
  }

  _pick(tr) {
    this.picked = tr;
    const other = tr === this.rtc ? this.ws : this.rtc;
    other.dispose();
    this.c.p2p = tr === this.rtc;
    this.c.status = '';
    return tr;
  }

  send(o) { if (this.picked) this.picked.send(o); }
  update(dt) { if (this.picked && this.picked.update) this.picked.update(dt); }
  dispose() {
    this.disposed = true;
    this.rtc.dispose(); this.ws.dispose();
  }
}
