// ============================================================
// coop.js — みんなでプレイ(リアルタイム最大4人協力)
//   本物の接続: WebRTC DataChannel の P2P 直結(遅延 20〜80ms)。
//   サーバー(/api/signal, Vercel KV)は「出会う瞬間」のSDP交換にだけ使い、
//   ゲーム中の通信は端末同士で直接行う(サーバー費ほぼゼロ)。
//   世界は共有シードの決定論生成 → 送るのは互いの機体位置・スコア・
//   ボスへの与ダメだけ。相方の機体・弾はお互いの画面に見える。
//   サーバー未設定/接続失敗時はオフラインのデモ相方にフォールバック。
//
//   3〜4人の形: 星型(ホストを中心に、各ゲストが1本ずつ直結)。
//   ゲスト同士は繋がっていないので、**ホストが届いたものを他のゲストへ
//   そのまま流す**(中継サーバーの relay() と同じ考え方。src/coop.js の
//   下の方、RtcHostTransport を参照)。これで中継サーバーを別途立てなくても
//   3〜4人が繋がる — 費用も運用もソロ・2人のときと変わらない。
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

const P2P_ID = 'p2p';   // 直結2人の頃の呼び名(相方はひとりしかいなかった)
const MAX_PLAYERS = 4;
// ゲストの枠は最大3つ(ホスト+3人=4人)。ホストからは「相手を識別する番号」、
//   信号サーバーへは「どのSDPを預けるか」の両方に使う。
const GUEST_SLOTS = [1, 2, 3];
// 直結でホストと繋がっているとき、ホスト自身を指す呼び名。
//   ゲストの Coop.peers はここに host、他のスロット番号にそれぞれの
//   ゲストが入る(=自分以外の全員が名前つきで並ぶ)。
const HOST_ID = 'p2p-host';
const slotId = n => 'p2p-' + n;

function newPeer(id) {
  return {
    id, name: 'FRIEND', score: 0, alive: true, dmg: 0, char: 0, seenAt: 0, ready: false, superAt: 0,
    x: 0.32, y: 0.85, tx: 0.32, ty: 0.85, firing: false,   // 正規化座標(0..1)
  };
}
// 誰も居ないときに読まれる置き場。描画側が毎フレーム partner を触るので、
//   null を返すと全部に null チェックが要る。中身が空の相方を1つ用意しておく。
const NO_PEER = newPeer('none');

// 中継サーバーが設定されていれば直結と併走させ、無ければ直結だけを試す。
//   設定は index.html の <meta name="coop-relay">。書かなければ挙動は今まで通りで、
//   サーバーは完全に任意のまま。直結だけでも 2〜4人まで届く
//   (ホスト=RtcHostTransport が最大3ゲストぶん、ゲスト=RtcGuestTransport が
//   空いている枠を1つ選ぶ)。
function makeTransport(coop, role, code) {
  const url = relayUrl();
  const rtc = () => role === 'host' ? new RtcHostTransport(coop, code) : new RtcGuestTransport(coop, code);
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
    // いつから待っているか。**黙って待たせない**ために画面へ出す。
    //   合図サーバーの取りこぼしは 117 秒だまって待ってから初めて見えていた。
    //   子供はその前に諦めるし、こちらも原因が分からない。
    this.connectAt = performance.now();
    this.sigNote = '';
    tr.init().catch(e => {
      if (this.transport !== tr || tr.open) return;
      const m = String(e && e.message || '');
      this.status = tr.sigDown ? 'signal_off'
        : m === 'room_full' ? 'room_full'   // ゲスト: 3人ぶん、既に埋まっている
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

  /** 待ち始めてからの秒数。繋がっていれば 0。 */
  waitedSec() {
    if (this.connected || !this.connectAt) return 0;
    return Math.max(0, (performance.now() - this.connectAt) / 1000);
  },

  reset() {
    if (this.transport) this.transport.dispose();
    this.transport = null;
    this.active = false; this.connected = false; this.p2p = false;
    this.code = ''; this.seed = 0; this.status = '';
    this.connectAt = 0; this.sigNote = '';
    this.peers.clear();
    this.myReady = false;
    this.bossShared = 0; this.bossSharedMax = 0; this.localDmg = 0;
  },
  /**
   * ホストを引き取る。中継サーバーが「前のホストが抜けたので次はあなた」と
   * 指名したときに呼ばれる。engine 側で世界の計算を引き継ぐ。
   */
  onBecomeHost: null,   // engine が設定
  becomeHost() {
    if (this.role === 'host') return;
    this.role = 'host';
    if (this.onBecomeHost) this.onBecomeHost();
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
  myReady: false,
  requestStart() {
    // 押した人が「準備できた」ことを先に配る。全員が押すのを待つ作りにはしない
    //   —— ひとりが席を外しただけで誰も遊べなくなるほうが困る。
    //   見えるようにするだけで、始めるのは今まで通り誰が押してもよい。
    this.myReady = true;
    this.send({ t: 'ready' });
    if (this.role === 'host') { this.send({ t: 'start', seed: this.seed, mode: this.mode }); return true; }
    this.send({ t: 'reqStart' });
    return false; // 自分ではまだ開始しない(ホストの号令を待つ)
  },
  /** ロビー表示用: 自分を含めた顔ぶれ。 */
  roster() {
    return [
      { id: 'me', name: Save.name(), ready: this.myReady, me: true },
      ...this.livePeers().map(p => ({ id: p.id, name: p.name, ready: !!p.ready, me: false })),
    ];
  },
  readyCount() { return this.roster().filter(r => r.ready).length; },
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
      case 'ready':   // 誰が押したかをロビーに出すためだけの印
        p.ready = true; p.seenAt = performance.now();
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
      // ゲスト: ホストが終盤に何を引いたか。世界そのものはスナップショットで
      //   届くが、演出と「形見」の効果は各自の画面で焚く必要がある。
      // 相方が必殺技を撃った。合体の受付はここが起点。
      case 'sup':
        p.superAt = performance.now(); p.seenAt = performance.now();
        if (this.onPeerSuper) this.onPeerSuper(from, String(o.k || ''));
        break;
      case 'ls': if (this.onLastStand) this.onLastStand(String(o.k || ''), o.d ? String(o.d) : null); break;
      // コンティニュー。**片方だけ再開して置き去りにしない。**
      //   ゲストは自分では再開せず、ホストに頼む(reqContinue)。号令
      //   (continue)はホストが引いた再開位置つきで全員へ配るので、
      //   ステージの頭からズレて再開する人が出ない。
      case 'reqContinue': if (this.role === 'host' && this.onReqContinue) this.onReqContinue(); break;
      case 'continue': if (this.onContinue) this.onContinue(o); break;
    }
  },
  onPartnerHit: null, onPartnerDied: null, onGameOver: null, onBossDown: null, onLastStand: null, onPeerSuper: null,   // engine が設定
  onReqContinue: null, onContinue: null,   // engine が設定

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

const sleep = ms => new Promise(res => setTimeout(res, ms));

// ICE候補の収集(ホスト・ゲスト共通)。ここを早く打ち切ると「自宅LAN内アドレス
// しか無いSDP」を送ってしまい、別回線の相手とは直通が張れない。外向き候補
// (srflx/relay)が取れるまで待ち、最大12秒で打ち切る。
function gatherIce(pc) {
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
// 1回きりの GET/POST。ループと再試行は呼ぶ側に任せる
// (ホストとゲストで「何回・どんな間隔で」が違うため)。
async function getSdp(code, slot, kind) {
  const r = await fetch(`${SIG}?code=${code}&slot=${slot}&want=${kind}`);
  if (r.status === 503) { const e = new Error('signal_off'); e.signalOff = true; throw e; }
  if (!r.ok) { const e = new Error('http' + r.status); e.httpStatus = r.status; throw e; }
  const j = await r.json();
  return j.sdp || null;
}
/** @returns {boolean} answer が 409(先客あり)なら false。それ以外は true。 */
async function postSdp(code, slot, kind, sdp) {
  const r = await fetch(SIG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, slot, kind, sdp }) });
  if (r.status === 503) { const e = new Error('signal_off'); e.signalOff = true; throw e; }
  if (r.status === 409) return false;
  if (!r.ok) throw new Error('signal ' + r.status);
  return true;
}

// ホストが「他のゲストへもそのまま流す」メッセージの種類。
//   server/relay.js の relay() と同じ発想 —— 挙動が読める型だけを選ぶ。
//   'dmg'/'hit'/'died' はホスト専用の入力(共有ボスHP・残機の計算に使う)なので
//   流さない。他のゲストにも流すと、そちら側で同じ計算がもう一度走ってしまう。
export const RELAY_TYPES = new Set(['hello', 'ready', 'pos', 'sup']);

// === 本物: WebRTC P2P transport(ゲスト) ===
//   ホストが用意した3枠(GUEST_SLOTS)のうち、空いている1つを選んで直結する。
//   「空いている」の判定は信号サーバー側の早い者勝ち(answer への SET…NX、
//   api/signal.js)。取り合いに負けたら次の枠を試す。
export class RtcGuestTransport {
  constructor(coop, code) {
    this.c = coop; this.code = code;
    this.pc = null; this.dc = null; this.open = false;
    this.disposed = false; this.sigDown = false;
    this.slot = 0;
  }
  async init() {
    // 3枠は(ホスト側で)だいたい同時に開くので、1枠あたりの待ちは
    //   長すぎなくてよい。ここで1枠に78秒かけると、3枠試すだけで
    //   4分近く待たせてしまう。
    let sawAnyOffer = false;
    for (const slot of GUEST_SLOTS) {
      if (this.disposed) return;
      const r = await this.tryClaim(slot);
      if (r === 'connected') { this.slot = slot; return; }
      if (r === 'offer_seen') sawAnyOffer = true;
    }
    if (this.disposed) return;
    // 3枠とも駄目だった。**なぜ駄目だったか**で言葉を変える。
    //   1つもオファーが無かった = そもそもその部屋が無い(あいことば違い/未オープン)。
    //   オファーはあった = 3人ぶん、既に埋まっている。
    throw new Error(sawAnyOffer ? 'room_full' : 'timeout');
  }
  /** @returns {'connected'|'offer_seen'|'no_offer'} */
  async tryClaim(slot) {
    const off = await this.pollOffer(slot, 20);   // 約26秒
    if (this.disposed || !off) return 'no_offer';
    const pc = new RTCPeerConnection({ iceServers: await iceConfig(), iceCandidatePoolSize: 2 });
    pc.ondatachannel = e => this.setup(e.channel);
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: off });
      await pc.setLocalDescription(await pc.createAnswer());
      await gatherIce(pc);
      if (this.disposed) { pc.close(); return 'no_offer'; }
      const claimed = await postSdp(this.code, slot, 'answer', pc.localDescription.sdp);
      if (!claimed) { pc.close(); return 'offer_seen'; }   // 先を越された。次の枠へ
    } catch (e) {
      try { pc.close(); } catch (err) {}
      if (e && e.signalOff) { this.sigDown = true; throw e; }
      return 'offer_seen';
    }
    this.pc = pc;
    // 直通が張れない回線(厳しいNAT)を検知して、原因が分かる形で失敗させる
    //   'disconnected' は一時的に起きて自力回復することがあるので失敗扱いにしない
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' && !this.open && !this.disposed) this.fail('p2p_failed');
    };
    this.watchdog();
    return 'connected';
  }
  async pollOffer(slot, tries) {
    for (let i = 0; i < tries; i++) {
      if (this.disposed) return null;
      let sdp;
      try { sdp = await getSdp(this.code, slot, 'offer'); }
      catch (e) {
        if (e && e.signalOff) { this.sigDown = true; throw e; }
        this.c.sigNote = e && e.httpStatus ? 'http' + e.httpStatus : 'net';
        await sleep(1300); continue;
      }
      this.c.sigNote = '';
      if (sdp) return sdp;
      await sleep(1300);
    }
    return null;
  }
  // 握手後、一定時間で開通しなければ「回線の問題」として諦める(無限待ちを防ぐ)
  watchdog() {
    clearTimeout(this._wd);
    this._wd = setTimeout(() => { if (!this.open && !this.disposed) this.fail('p2p_failed'); }, 30000);
  }
  fail(reason) { if (this.disposed || this.open) return; this.c.status = reason; }
  setup(dc) {
    this.dc = dc;
    dc.onopen = () => {
      clearTimeout(this._wd);
      this.open = true; this.c.p2p = true; this.c.status = '';
      this.send({ t: 'hello', name: Save.name(), ch: Save.charIndex() });
    };
    dc.onmessage = e => {
      let o; try { o = JSON.parse(e.data); } catch (err) { return; }
      // _r が付いていれば「ホストが他のゲストから中継してきたもの」。
      //   無ければホスト自身のメッセージ。ゲストの回線はホストへの1本だけなので、
      //   誰から来たかは中身のこの印だけで分かる。
      if (o && typeof o._r !== 'undefined') { const r = o._r; delete o._r; this.c.onMsg(o, slotId(r)); }
      else this.c.onMsg(o, HOST_ID);
    };
    dc.onclose = () => { this.open = false; if (!this.disposed) this.c.status = 'closed'; };
  }
  send(o) { if (this.open && this.dc) { try { this.dc.send(JSON.stringify(o)); } catch (e) {} } }
  dispose() { this.disposed = true; clearTimeout(this._wd); try { if (this.dc) this.dc.close(); if (this.pc) this.pc.close(); } catch (e) {} }
}

// === 本物: WebRTC P2P transport(ホスト) ===
//   ゲストの枠ぶん(最大3本)の RTCPeerConnection を同時に用意する。
//   「答えが来たか」の確認だけは3枠まとめて1本のポーリングで回す ——
//   枠ごとに別々のタイマーで回すと、2人だけの対戦でも信号サーバーへの
//   問い合わせが3倍速になり、レート制限に真っ先に引っかかる(api/signal.js)。
export class RtcHostTransport {
  constructor(coop, code) {
    this.c = coop; this.code = code;
    this.disposed = false; this.sigDown = false;
    this.slots = GUEST_SLOTS.map(n => ({ n, pc: null, dc: null, open: false, answering: false, stale: false, _wd: 0 }));
  }
  get open() { return this.slots.some(s => s.open); }
  async init() {
    // 3枠ぶんのオファーをまとめて作る。ここは一度きりの作成なので、
    //   信号サーバーへの問い合わせ頻度(レート制限)には効かない。
    let signalOff = false;
    await Promise.all(this.slots.map(s => this.makeOffer(s).catch(e => {
      if (e && e.signalOff) { this.sigDown = true; signalOff = true; }
    })));
    if (this.disposed) return;
    if (signalOff) throw new Error('signal_off');
    this.pollLoop();   // 応答待ちは裏で回し続ける。init() 自体はここで完了扱いにする
  }
  async makeOffer(s) {
    // 焼き直しの場合、前の(実らなかった)接続を残さない。
    if (s.pc) { try { s.pc.close(); } catch (e) {} }
    const pc = new RTCPeerConnection({ iceServers: await iceConfig(), iceCandidatePoolSize: 2 });
    s.pc = pc;
    this.wireDc(s, pc.createDataChannel('coop'));
    pc.oniceconnectionstatechange = () => {
      // この枠のオファーはもう実らない。答えが来ていなければ、
      //   次のポーリングで(pollLoop が)オファーを作り直す。
      if (pc.iceConnectionState === 'failed' && !s.open && !this.disposed) s.stale = true;
    };
    await pc.setLocalDescription(await pc.createOffer());
    await gatherIce(pc);
    if (this.disposed) return;
    await postSdp(this.code, s.n, 'offer', pc.localDescription.sdp);
  }
  /**
   * 「誰か来たか」を3枠まとめて確認し続ける。
   *
   * ロビーは長く開けておける(以前の2人専用でも最大13分待っていた)ので、
   * ここも同じだけ待つ。ただし1回のHTTPは「まだ埋まっていない枠のうち1つ」
   * だけを順番に見る形にして、問い合わせの速さそのものは枠の数によらず一定。
   */
  async pollLoop() {
    let i = 0;
    for (let tries = 0; tries < 600 && !this.disposed; tries++) {
      const pending = this.slots.filter(s => !s.open && !s.answering);
      if (pending.length === 0) return;   // 全枠が埋まった
      const s = pending[i % pending.length]; i++;
      if (s.stale) { s.stale = false; this.makeOffer(s).catch(() => {}); }
      else {
        let ans = null;
        try { ans = await getSdp(this.code, s.n, 'answer'); }
        catch (e) {
          if (e && e.signalOff) { this.sigDown = true; this.c.status = 'signal_off'; return; }
        }
        if (ans && !s.answering) {
          s.answering = true;
          this.acceptAnswer(s, ans).catch(() => { s.answering = false; s.stale = true; });
        }
      }
      await sleep(1300);
    }
    // 13分、誰も来なかった。init() は既に完了扱いなので、ここで直接知らせる。
    if (!this.disposed && !this.open) this.c.status = 'timeout';
  }
  async acceptAnswer(s, sdp) {
    await s.pc.setRemoteDescription({ type: 'answer', sdp });
    clearTimeout(s._wd);
    // 開通の見込みが立ったので、開かなければ諦めるまでの時間を計る
    s._wd = setTimeout(() => { if (!s.open && !this.disposed) { s.answering = false; s.stale = true; } }, 30000);
  }
  wireDc(s, dc) {
    s.dc = dc;
    dc.onopen = () => {
      clearTimeout(s._wd);
      s.open = true; this.c.p2p = true; this.c.status = '';
      this.sendTo(s, { t: 'hello', name: Save.name(), ch: Save.charIndex() });
      // 既に居る全員の名前は、この枠が無い頃に流れてしまっている。
      //   新顔にも、先に来た全員にも、いま埋め合わせる。
      for (const other of this.slots) {
        if (other === s || !other.open) continue;
        const op = this.c.peer(slotId(other.n));
        this.sendTo(s, { t: 'hello', name: op.name, ch: op.char, _r: other.n });
      }
    };
    dc.onmessage = e => {
      let o; try { o = JSON.parse(e.data); } catch (err) { return; }
      this.c.onMsg(o, slotId(s.n));
      if (RELAY_TYPES.has(o.t)) {
        for (const other of this.slots) {
          if (other !== s && other.open) this.sendTo(other, { ...o, _r: s.n });
        }
      }
    };
    dc.onclose = () => {
      s.open = false;
      if (this.disposed) return;
      // この枠の人は抜けた。**別の誰かがこの枠に来て良いことにはしない**
      //   (試合の途中で見ず知らずの4人目に化ける方が不気味)。席は畳む。
      this.c.dropPeer(slotId(s.n));
    };
  }
  sendTo(s, o) { if (s.open && s.dc) { try { s.dc.send(JSON.stringify(o)); } catch (e) {} } }
  /** Coop.send() から呼ばれる一斉送信(繋がっている全ゲストへ)。 */
  send(o) { for (const s of this.slots) this.sendTo(s, o); }
  dispose() {
    this.disposed = true;
    for (const s of this.slots) {
      clearTimeout(s._wd);
      try { if (s.dc) s.dc.close(); if (s.pc) s.pc.close(); } catch (e) {}
    }
  }
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
