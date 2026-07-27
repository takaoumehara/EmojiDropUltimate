// ============================================================
// api/signal.js — ふたりでプレイ用 WebRTC シグナリング(Vercel KV)
//   役割は「二人を引き合わせる」だけ。SDP(接続情報)をあいことば毎に
//   5分だけ預かる。ゲーム中の通信は P2P (WebRTC DataChannel) で行われ、
//   サーバーは一切経由しない。KV 未設定なら 503(フロントはデモにフォールバック)。
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
    if (req.method === 'GET') {
      const code = String(req.query.code || '').toUpperCase();
      const want = String(req.query.want || '');
      if (!okCode(code) || !okKind(want)) return res.status(400).json({ error: 'bad_request' });
      const sdp = await redis(['GET', `sig:${code}:${want}`]);
      return res.status(200).json({ sdp: sdp || null });
    }
    if (req.method === 'POST') {
      let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      b = b || {};
      const code = String(b.code || '').toUpperCase();
      if (!okCode(code) || !okKind(b.kind) || typeof b.sdp !== 'string' || b.sdp.length > 20000) {
        return res.status(400).json({ error: 'bad_request' });
      }
      await redis(['SET', `sig:${code}:${b.kind}`, b.sdp, 'EX', String(TTL)]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(502).json({ error: 'kv_error', detail: String(e && e.message || e).slice(0, 120) });
  }
};
