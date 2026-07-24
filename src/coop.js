// ============================================================
// coop.js — 2人共闘セッション
//   設計: 二人が「同じ種の同じステージ」を各自プレイし、ボスHPだけを共有する。
//   → 位置や弾は同期しない(低遅延・低コスト)のに「一緒に倒した」感が出る。
//   Phase 0 は完全オフラインのモック transport。将来 Firebase(snap-pair)へ
//   差し替えられるよう、送受信は Transport インターフェースに閉じている。
// ============================================================

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 紛らわしい文字を除外
function makeCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export const Coop = {
  active: false,          // 共闘モード中か
  role: 'host',           // 'host' | 'guest'
  mode: 'story',          // 'story'=オリジナル面 | 'ai'=AI生成面(ロビーで選択)
  code: '',               // 相方が入力する6桁コード
  seed: 0,                // 共有ステージ種
  connected: false,       // 相方が参加したか
  partner: { name: 'FRIEND', score: 0, alive: true, dmg: 0 },
  bossShared: 0, bossSharedMax: 0, // 共有ボスHP
  localDmg: 0,            // 自分の与ダメ累計(貢献表示用)
  transport: null,

  // ロビー開始(ホスト)。コードと種を確定し、相方待ち。
  host() {
    this.reset();
    this.active = true; this.role = 'host';
    this.code = makeCode();
    this.seed = (Math.floor(Math.random() * 1e9)) >>> 0;
    this.transport = new MockTransport(this);
  },

  // Phase 0: モックの相方を参加させる(デモ用)
  mockJoin() { if (this.transport) this.transport.mockJoin(); },

  reset() {
    if (this.transport) this.transport.dispose();
    this.transport = null;
    this.active = false; this.connected = false;
    this.code = ''; this.seed = 0;
    this.partner = { name: 'FRIEND', score: 0, alive: true, dmg: 0 };
    this.bossShared = 0; this.bossSharedMax = 0; this.localDmg = 0;
  },

  // ボス出現時に共有HPを初期化(maxHp は既に共闘用に増量済み)
  initBoss(maxHp) {
    this.bossSharedMax = maxHp; this.bossShared = maxHp;
    this.localDmg = 0; this.partner.dmg = 0;
  },

  // 自分の与ダメを共有プールへ。新しい共有HPを返す。
  dealLocal(dmg) {
    this.localDmg += dmg;
    this.bossShared = Math.max(0, this.bossShared - dmg);
    if (this.transport) this.transport.sendDamage(dmg);
    return this.bossShared;
  },

  // 相方の与ダメ(transport から呼ばれる)
  applyPartnerDamage(dmg) {
    this.partner.dmg += dmg;
    this.bossShared = Math.max(0, this.bossShared - dmg);
  },

  setLocalStatus(score, alive) { if (this.transport) this.transport.sendStatus(score, alive); },

  update(dt) { if (this.transport) this.transport.update(dt); },
};

// === Phase 0: オフライン・モック transport ===
//   相方をローカルで擬似的に動かす。将来ここを FirebaseTransport に差し替える。
class MockTransport {
  constructor(coop) { this.c = coop; this.joined = false; this.dmgAccum = 0; this.hitT = 0; this.scoreT = 0; }
  mockJoin() { this.joined = true; this.c.connected = true; this.c.partner.name = 'FRIEND'; this.c.partner.alive = true; }
  sendDamage() { /* mock: 送信不要 */ }
  sendStatus() { /* mock: 送信不要 */ }
  dispose() { this.joined = false; }
  update(dt) {
    const c = this.c;
    if (!this.joined) return;
    // 道中: 相方のスコアが少しずつ伸びる(生存感)
    this.scoreT += dt;
    if (this.scoreT > 0.5) { this.scoreT = 0; if (c.partner.alive) c.partner.score += Math.floor(80 + Math.random() * 140); }
    // ボス戦: 相方も共有HPを削る(単独なら約40秒で削り切るペース → 二人だと約半分)
    if (c.bossSharedMax > 0 && c.bossShared > 0 && c.partner.alive) {
      const dps = c.bossSharedMax / 40;
      this.dmgAccum += dps * dt * (0.8 + Math.random() * 0.5);
      if (this.dmgAccum >= 1) {
        const d = Math.floor(this.dmgAccum); this.dmgAccum -= d;
        c.applyPartnerDamage(d); c.partner.score += d * 25;
      }
    }
    // たまに被弾して一瞬ダウン→復帰(相方の生存トグル演出)
    this.hitT -= dt;
    if (this.hitT <= 0) {
      this.hitT = 2.5 + Math.random() * 3.5;
      if (c.partner.alive && Math.random() < 0.5) { c.partner.alive = false; setTimeoutSafe(() => { c.partner.alive = true; }, 700); }
    }
  }
}

// setTimeout をモジュール内に閉じる(テスト差し替え用の薄いラッパ)
function setTimeoutSafe(fn, ms) { try { setTimeout(fn, ms); } catch (e) { /* noop */ } }
