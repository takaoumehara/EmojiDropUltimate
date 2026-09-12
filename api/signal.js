// ============================================================
// api/signal.js — 2〜4人プレイ用 WebRTC シグナリング(Vercel KV)
//   役割は「引き合わせる」だけ。SDP(接続情報)をあいことば毎に
//   5分だけ預かる。ゲーム中の通信は P2P (WebRTC DataChannel) で行われ、
//   サーバーは一切経由しない。KV 未設定なら 503(フロントはデモにフォールバック)。
//
//   3〜4人にするための鍵は「枠(slot)」。ホストは自分ひとりに1本、
//   ではなく **相方の分だけ(最大3本)** RTCPeerConnection を張る
//   (host.js 側の話)。ここではその3本ぶんのSDPを枠ごとに別の鍵で預かる:
//     sig:{code}:{slot}:offer / sig:{code}:{slot}:answer   (slot = 1|2|3)
//   answer だけは SET…NX で書く。**同じ枠に二人が同時に飛びついた**とき、
//   先に書けた方だけがその枠を使い、負けた方は 409 を受けて次の枠を試す。
//   ここを NX にしないと、後から来た人の answer が先客のものを黙って
//   上書きし、先客の接続がホスト側で完成しなくなる。
// ============================================================

// Vercel KV / Upstash はインテグレーションによって環境変数名が違うので両方受ける。
//   Vercel KV        : KV_REST_API_URL / KV_REST_API_TOKEN
//   Upstash(直/市場): UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
const URL_BASE = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const TTL = 300; // 5分で自動消滅

async function redis(cmd) {
  const r = await fetch(URL_BASE, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('kv ' + r.status);
  return (await r.json()).result;
}

const okCode = c => /^[A-Z2-9]{6}$/.test(c || '');
const okKind = k => k === 'offer' || k === 'answer';
const okSlot = s => s === '1' || s === '2' || s === '3';

// レート制限。無いと第三者に叩かれて KV の無料枠と費用が飛ぶ。
//   Redis の INCR + EX で「1分あたり何回」を数えるだけ。
//   KV そのものが落ちている時に遊べなくなる方が損なので、
//   数えられなかった場合は通す(fail-open)。
const RATE_WINDOW = 60;      // 秒
// answer を待つ側は 1.3 秒に1回 GET する。60/1.3 ≈ 46 回/分で、
//   これは **ふつうに2人で遊ぶだけでも** 旧設定の 40 を超えて弾かれていた
//   (「2人なら十分」という見積もりが、実際のポーリング間隔と合っていなかった)。
//   3〜4人でも合計の問い合わせ頻度は変えない設計(下記)なので、
//   ここは人数によらず「1台が出す速さ」に少し余裕を持たせるだけでよい。
const RATE_MAX = 60;
function clientKey(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.headers['x-real-ip'] || 'unknown';
  return 'rl:' + ip;
}
async function overRateLimit(req) {
  try {
    const key = clientKey(req);
    const n = await redis(['INCR', key]);
    if (n === 1) await redis(['EXPIRE', key, String(RATE_WINDOW)]);
    return n > RATE_MAX;
  } catch (e) {
    return false;   // 数えられないなら通す(遊べなくする方が害が大きい)
  }
}

// WebRTC の接続先候補(STUN=自分の外側アドレス発見 / TURN=直通不可時の中継)。
//   携帯回線や厳しいNAT同士だと STUN だけでは直通が張れないため TURN が要る。
//   独自の TURN を使う場合は Vercel に TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL を設定。
//   未設定なら公開の無料 TURN(ベストエフォート)にフォールバックする。
function iceServers() {
  const list = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  ];
  const urls = (process.env.TURN_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    list.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  } else {
    list.push({
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject', credential: 'openrelayproject',
    });
  }
  return list;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  // ICE 設定はストア不要なので、KV 未設定でも先に返す
  if (req.method === 'GET' && req.query.want === 'ice') {
    return res.status(200).json({ iceServers: iceServers() });
  }
  if (!URL_BASE || !TOKEN) {
    return res.status(503).json({
      error: 'no_kv',
      hint: 'Vercel の Storage で Upstash Redis(KV)を接続してください。KV_REST_API_URL/KV_REST_API_TOKEN または UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN が必要です。',
      sawUrl: !!URL_BASE, sawToken: !!TOKEN,
    });
  }

  try {
    if (await overRateLimit(req)) {
      res.setHeader('Retry-After', String(RATE_WINDOW));
      return res.status(429).json({ error: 'rate_limited' });
    }
    if (req.method === 'GET') {
      const code = String(req.query.code || '').toUpperCase();
      const want = String(req.query.want || '');
      const slot = String(req.query.slot || '');
      if (!okCode(code) || !okKind(want) || !okSlot(slot)) return res.status(400).json({ error: 'bad_request' });
      const sdp = await redis(['GET', `sig:${code}:${slot}:${want}`]);
      return res.status(200).json({ sdp: sdp || null });
    }
    if (req.method === 'POST') {
      let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      b = b || {};
      const code = String(b.code || '').toUpperCase();
      const slot = String(b.slot || '');
      if (!okCode(code) || !okKind(b.kind) || !okSlot(slot) || typeof b.sdp !== 'string' || b.sdp.length > 20000) {
        return res.status(400).json({ error: 'bad_request' });
      }
      const key = `sig:${code}:${slot}:${b.kind}`;
      if (b.kind === 'answer') {
        // 早い者勝ち(NX)。書けなければ、その枠は既に他の誰かのもの。
        const ok = await redis(['SET', key, b.sdp, 'EX', String(TTL), 'NX']);
        if (!ok) return res.status(409).json({ ok: false, taken: true });
        return res.status(200).json({ ok: true });
      }
      await redis(['SET', key, b.sdp, 'EX', String(TTL)]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(502).json({ error: 'kv_error', detail: String(e && e.message || e).slice(0, 120) });
  }
};
