// ============================================================
// coop.js — ふたりでプレイ(リアルタイム2人協力)
//   本物の接続: WebRTC DataChannel の P2P 直結(遅延 20〜80ms)。
//   サーバー(/api/signal, Vercel KV)は「出会う瞬間」のSDP交換にだけ使い、
//   ゲーム中の通信は端末同士で直接行う(サーバー費ほぼゼロ)。
//   世界は共有シードの決定論生成 → 送るのは互いの機体位置・スコア・
//   ボスへの与ダメだけ。相方の機体・弾はお互いの画面に見える。
//   サーバー未設定/接続失敗時はオフラインのデモ相方にフォールバック。
// ============================================================
import { Save } from './save.js';
import { CHARS } from './config.js';
import { relayUrl, DualTransport } from './wstransport.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外
function makeCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
const SIG = '/api/signal';
// 既定(サーバーから設定を取れなかった場合の保険)
const ICE_FALLBACK = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
    username: 'openrelayproject', credential: 'openrelayproject' },
];
let iceCache = null;
async function iceConfig() {
  if (iceCache) return iceCache;
  try {
    const r = await fetch(`${SIG}?want=ice`);
    if (r.ok) { const j = await r.json(); if (j.iceServers && j.iceServers.length) iceCache = j.iceServers; }
  } catch (e) { /* 取得失敗時は既定を使う */ }
  return (iceCache = iceCache || ICE_FALLBACK);
}

const P2P_ID = 'p2p';   // 直結は相手がひとりしかいないので、固定の呼び名でよい
const MAX_PLAYERS = 4;

function newPeer(id) {
  return {
    id, name: 'FRIEND', score: 0, alive: true, dmg: 0, char: 0, seenAt: 0,
    x: 0.32, y: 0.85, tx: 0.32, ty: 0.85, firing: false,   // 正規化座標(0..1)
  };
}
// 誰も居ないときに読まれる置き場。描画側が毎フレーム partner を触るので、
//   null を返すと全部に null チェックが要る。中身が空の相方を1つ用意しておく。
const NO_PEER = newPeer('none');

// 中継サーバーが設定されていれば直結と併走させ、無ければ直結だけを試す。
//   設定は index.html の <meta name="coop-relay">。書かなければ挙動は今まで通りで、
//   サーバーは完全に任意のまま。
function makeTransport(coop, role, code) {
  const url = relayUrl();
  const rtc = () => new RtcTransport(coop, role, code);
  return url ? new DualTransport(coop, role, code, rtc, url) : rtc();
}

export const Coop = {
  active: false,          // ロビー/共闘モード中か
  role: 'host',           // 'host' | 'guest'
  mode: 'story',          // 'story'=オリジナル面 | 'ai'=AI生成面(ホストが選択)
  code: '',               // あいことば(6桁)
  seed: 0,                // 共有ステージ種(ホストが発行 → startでゲストへ)
  connected: false,       // 相方と繋がったか
  p2p: false,             // 本物のP2P接続か(false=デモ)
  joinOpen: false,        // あいことば入力フォームを出しているか
  status: '',             // ロビー表示用ステータス('signal_off'|'connecting'|'failed'|'')
  // 相方は複数いうる(中継サーバー経由なら最大4人)。id → 相方。
  //   直結(2人)のときは id が無いので P2P_ID をひとつ使う。
  peers: new Map(),
  bossShared: 0, bossSharedMax: 0,
  localDmg: 0,
  transport: null,
  snap: null,             // ゲスト: ホストから届いた最新のワールド状態
  snapAt: 0,
  onStartGame: null,      // engine が設定: ゲスト側でホストの開始を受けて起動

  // === ロビー ===
  host() {
    this.reset();
    this.active = true; this.role = 'host';
    this.code = makeCode();
    this.seed = (Math.floor(Math.random() * 1e9)) >>> 0;
    this._connect(makeTransport(this, 'host', this.code));
  },
  join(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
    if (code.length !== 6) return;
    this.reset();
    this.active = true; this.role = 'guest'; this.code = code;
    this._connect(makeTransport(this, 'guest', code));
  },
  /** ロビー表示用: いま何で繋がっているか('p2p' | 'relay' | '')。 */
  via() { return this.transport && this.transport.via ? this.transport.via : (this.p2p ? 'p2p' : ''); },

  // === 相方(複数) ===
  peer(id) {
    let p = this.peers.get(id);
    if (!p) {
      // 満員を超えて増やさない。番号が化けたメッセージで無限に増えるのを防ぐ。
      if (this.peers.size >= MAX_PLAYERS - 1) return this.peers.values().next().value || NO_PEER;
      p = newPeer(id); this.peers.set(id, p);
    }
    return p;
  },
  /** 情報が届いている相方だけ。描画とHUDはこれを使う(幽霊機を出さない)。 */
  livePeers() {
    const now = performance.now();
    return [...this.peers.values()].filter(p => now - p.seenAt < 2500);
  },
  /** 自分を含めた人数。 */
  playerCount() { return 1 + this.peers.size; },
  /** 2人だった頃のコードが読む「相方」。先頭のひとり。 */
  get partner() { return this.peers.values().next().value || NO_PEER; },
  /**
   * 文章に埋める呼び名。ふたりなら相手の名前、3人以上なら人数。
   * 「A と共闘クリア」が4人プレイで嘘にならないようにする。
   */
  partyLabel(ja) {
    const live = this.livePeers();
    if (live.length <= 1) return (live[0] || this.partner).name;
    return ja ? `${live.length + 1}人` : `${live.length + 1} players`;
  },
  _connect(tr) {
    this.transport = tr; this.status = 'connecting';
    tr.init().catch(e => {
      if (this.transport !== tr || tr.open) return;
      const m = String(e && e.message || '');
      this.status = tr.sigDown ? 'signal_off'
        : m === 'timeout' ? (this.role === 'guest' ? 'no_room' : 'timeout')
          : this.status === 'p2p_failed' ? 'p2p_failed' : 'failed';
    });
  },
  // オフラインのデモ相方(サーバー無しでも試せる)
  mockJoin() {
    if (this.transport) this.transport.dispose();
    this.transport = new MockTransport(this);
    this.transport.mockJoin();
    this.status = '';
  },

  reset() {
    if (this.transport) this.transport.dispose();
    this.transport = null;
    this.active = false; this.connected = false; this.p2p = false;
    this.code = ''; this.seed = 0; this.status = '';
    this.peers.clear();
    this.bossShared = 0; this.bossSharedMax = 0; this.localDmg = 0;
  },
  /** 相方が抜けた(中継サーバーが顔ぶれの変化を教えてくれる)。 */
  dropPeer(id) {
    this.peers.delete(id);
    if (this.peers.size === 0) this.connected = false;
  },

  // 招待リンク(QR・テキスト共有用)。開くと自動で参加する。
  inviteUrl() { return location.origin + location.pathname + '?join=' + (this.code || ''); },

  // スタート。どちらが押しても始まる(種はホストのものを正とする)。
  //   ゲストが押した場合はホストに依頼し、ホストが全員へ号令をかける。
  requestStart() {
    if (this.role === 'host') { this.send({ t: 'start', seed: this.seed, mode: this.mode }); return true; }
    this.send({ t: 'reqStart' });
    return false; // 自分ではまだ開始しない(ホストの号令を待つ)
  },
  startGame() { this.send({ t: 'start', seed: this.seed, mode: this.mode }); },

  // === プロトコル ===
  send(o) { if (this.transport) this.transport.send(o); },
  /**
   * @param {object} o   受け取ったメッセージ
   * @param {*} from     送り主。中継サーバーが付けた番号 / 直結なら P2P_ID
   */
  onMsg(o, from = P2P_ID) {
    const p = this.peer(from);
    switch (o.t) {
      case 'hello':
        this.connected = true; this.status = '';
        if (o.name) p.name = String(o.name).slice(0, 14);
        if (typeof o.ch === 'number') p.char = o.ch;
        p.seenAt = performance.now();
        break;
      case 'start': // ゲスト: ホストと同じ種・モードで即開始
        if (this.role === 'guest') {
          this.seed = o.seed >>> 0; this.mode = o.mode === 'ai' ? 'ai' : 'story';
          if (this.onStartGame) this.onStartGame();
        }
        break;
      case 'reqStart': // ゲストからの開始依頼 → ホストが号令をかけて自分も開始
        if (this.role === 'host') {
          this.startGame();
          if (this.onStartGame) this.onStartGame();
        }
        break;
      case 'pos':
        p.tx = o.x; p.ty = o.y; p.firing = !!o.f; p.alive = !!o.a;
        p.seenAt = performance.now();
        if (typeof o.s === 'number') p.score = o.s;
        if (typeof o.ch === 'number') p.char = o.ch;
        break;
      case 'dmg': this.applyPartnerDamage(o.d | 0, p); break;
      case 'w': this.snap = o; this.snapAt = performance.now(); break;   // ゲスト: ワールド状態を受信
      case 'hit': if (this.onPartnerHit) this.onPartnerHit(o.id, o.d | 0, o.sl); break; // ホスト: 相方の命中を反映
      case 'died': if (this.onPartnerDied) this.onPartnerDied(); break;           // ホスト: 共有残機を減らす
      case 'over': if (this.onGameOver) this.onGameOver(); break;                 // ゲスト: 二人まとめて終了
      // ゲスト: ボス撃破。スナップショットは state が finale に移った時点で止まるので、
      //   「ボスが消えた世界」は永久に届かない。撃破だけは明示的に伝える必要がある。
      case 'bd': if (this.onBossDown) this.onBossDown(); break;
    }
  },
  onPartnerHit: null, onPartnerDied: null, onGameOver: null, onBossDown: null,   // engine が設定

  // ホスト → ゲスト: ワールド状態(敵・弾・ベル・ボス)を一定間隔で送る
  _lastSnap: 0,
  sendSnap(build) {
    const now = performance.now();
    if (now - this._lastSnap < 66) return;   // 約15Hz
    this._lastSnap = now;
    this.send(build());
  },

  // 自分の機体位置を送る(20Hz スロットル・正規化座標)
  _lastPos: 0,
  sendPos(nx, ny, firing, score, alive, force) {
    const now = performance.now();
    if (!force && now - this._lastPos < 50) return;
    this._lastPos = now;
    this.send({ t: 'pos', x: +nx.toFixed(4), y: +ny.toFixed(4), f: firing ? 1 : 0, s: score, a: alive ? 1 : 0, ch: Save.charIndex() });
  },
  // 相方の情報が途絶えていないか(ホスト落ち等で幽霊機が残るのを防ぐ)
  partnerFresh() { return this.connected && this.livePeers().length > 0; },

  // === 共有ボスHP ===
  initBoss(maxHp) {
    this.bossSharedMax = maxHp; this.bossShared = maxHp;
    this.localDmg = 0;
    for (const p of this.peers.values()) p.dmg = 0;
  },
  dealLocal(dmg) {
    this.localDmg += dmg;
    this.bossShared = Math.max(0, this.bossShared - dmg);
    this.send({ t: 'dmg', d: dmg });
    return this.bossShared;
  },
  applyPartnerDamage(dmg, peer) {
    (peer || this.partner).dmg += dmg;
    this.bossShared = Math.max(0, this.bossShared - dmg);
  },
  /** 相方全員の与ダメ合計(貢献の表示に使う)。 */
  peerDmg() { let n = 0; for (const p of this.peers.values()) n += p.dmg; return n; },

  update(dt) {
    if (this.transport && this.transport.update) this.transport.update(dt);
    // 相方の機体をなめらかに補間(20Hzの位置更新を60fpsに見せる)
    const k = Math.min(1, dt * 14);
    for (const p of this.peers.values()) {
      p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k;
    }
  },
};

// === 本物: WebRTC P2P transport ===
//   非トリクルICE(候補収集完了後にSDPを1回だけ交換)なので、
//   シグナリングは KV への PUT/GET 数回で済む。
class RtcTransport {
  constructor(coop, role, code) {
    this.c = coop; this.role = role; this.code = code;
    this.pc = null; this.dc = null; this.open = false;
    this.disposed = false; this.sigDown = false;
  }
  async init() {
    this.pc = new RTCPeerConnection({ iceServers: await iceConfig(), iceCandidatePoolSize: 2 });
    // 直通が張れない回線(厳しいNAT)を検知して、原因が分かる形で失敗させる
    //   'disconnected' は一時的に起きて自力回復することがあるので失敗扱いにしない
    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc && this.pc.iceConnectionState;
      if (s === 'failed' && !this.open && !this.disposed) this.fail('p2p_failed');
    };
    if (this.role === 'host') {
      this.setup(this.pc.createDataChannel('coop'));
      await this.pc.setLocalDescription(await this.pc.createOffer());
      await this.gathered();
      await this.post('offer', this.pc.localDescription.sdp);
      // 相手が来るまで長く待つ(以前は約2分で監視をやめてしまい、
      // その後にQRを読まれても永久に繋がらなかった)
      const ans = await this.poll('answer', 600);
      if (this.disposed) return;
      await this.pc.setRemoteDescription({ type: 'answer', sdp: ans });
      this.watchdog();
    } else {
      this.pc.ondatachannel = e => this.setup(e.channel);
      const off = await this.poll('offer', 60);
      if (this.disposed) return;
      await this.pc.setRemoteDescription({ type: 'offer', sdp: off });
      await this.pc.setLocalDescription(await this.pc.createAnswer());
      await this.gathered();
      await this.post('answer', this.pc.localDescription.sdp);
      this.watchdog();
    }
  }
  // 握手後、一定時間で開通しなければ「回線の問題」として諦める(無限待ちを防ぐ)
  watchdog() {
    clearTimeout(this._wd);
    this._wd = setTimeout(() => { if (!this.open && !this.disposed) this.fail('p2p_failed'); }, 30000);
  }
  fail(reason) {
    if (this.disposed || this.open) return;
    this.c.status = reason;
  }
  setup(dc) {
    this.dc = dc;
    dc.onopen = () => {
      clearTimeout(this._wd);
      this.open = true; this.c.p2p = true; this.c.status = '';
      this.send({ t: 'hello', name: Save.name(), ch: Save.charIndex() });
    };
    // 直結は相手がひとりしかいないので、送り主は固定の呼び名でよい
    dc.onmessage = e => { try { this.c.onMsg(JSON.parse(e.data), P2P_ID); } catch (err) {} };
    dc.onclose = () => { this.open = false; if (!this.disposed) this.c.status = 'closed'; };
  }
  // ICE候補の収集。ここを早く打ち切ると「自宅LAN内アドレスしか無いSDP」を
  // 送ってしまい、別回線の相手とは直通が張れない。外向き候補(srflx/relay)が
  // 取れるまで待ち、最大12秒で打ち切る。
  gathered() {
    const pc = this.pc;
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise(res => {
      let got = false;
      const done = () => { clearTimeout(hard); clearTimeout(soft); pc.onicecandidate = null; res(); };
      const hard = setTimeout(done, 12000);
      let soft = null;
      pc.onicecandidate = e => {
        if (!e.candidate) return done();                       // 収集完了
        const c = e.candidate.candidate || '';
        if (/typ (srflx|relay)/.test(c) && !got) {
          got = true;                                          // 外から見えるアドレスを確保
          soft = setTimeout(done, 1500);                       // 少しだけ追加候補を待つ
        }
      };
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') done(); };
    });
  }
  async post(kind, sdp) {
    const r = await fetch(SIG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: this.code, kind, sdp }) });
    if (r.status === 503) { this.sigDown = true; throw new Error('signal_off'); }
    if (!r.ok) throw new Error('signal ' + r.status);
  }
  async poll(kind, tries = 90) {
    for (let i = 0; i < tries; i++) {
      if (this.disposed) throw new Error('disposed');
      const r = await fetch(`${SIG}?code=${this.code}&want=${kind}`);
      if (r.status === 503) { this.sigDown = true; throw new Error('signal_off'); }
      if (r.ok) { const j = await r.json(); if (j.sdp) return j.sdp; }
      await new Promise(res => setTimeout(res, 1300));
    }
    throw new Error('timeout');
  }
  send(o) { if (this.open && this.dc) { try { this.dc.send(JSON.stringify(o)); } catch (e) {} } }
  dispose() { this.disposed = true; clearTimeout(this._wd); try { if (this.dc) this.dc.close(); if (this.pc) this.pc.close(); } catch (e) {} }
}

// === デモ: オフラインのモック相方(サーバー不要の体験用) ===
class MockTransport {
  constructor(coop) { this.c = coop; this.joined = false; this.t = 0; this.dmgAccum = 0; this.scoreT = 0; }
  mockJoin() { this.joined = true; this.c.connected = true; this.c.partner.name = 'FRIEND'; }
  send(o) { /* デモ: 送信先なし */ }
  dispose() { this.joined = false; }
  update(dt) {
    const c = this.c;
    if (!this.joined) return;
    this.t += dt;
    // 機体: ゆらゆら飛び回る(見た目のリアリティ)
    c.onMsg({ t: 'pos', x: 0.5 + Math.sin(this.t * 0.7) * 0.3, y: 0.78 + Math.sin(this.t * 1.13) * 0.1, f: 1, a: 1, s: c.partner.score });
    // スコアが少しずつ伸びる
    this.scoreT += dt;
    if (this.scoreT > 0.5) { this.scoreT = 0; c.partner.score += Math.floor(80 + Math.random() * 140); }
    // ボス戦: 共有HPを削る(単独換算 約40秒ペース)
    if (c.bossSharedMax > 0 && c.bossShared > 0) {
      this.dmgAccum += (c.bossSharedMax / 40) * dt * (0.8 + Math.random() * 0.5);
      if (this.dmgAccum >= 1) {
        const d = Math.floor(this.dmgAccum); this.dmgAccum -= d;
        c.onMsg({ t: 'dmg', d });
      }
    }
  }
}
