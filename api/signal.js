// ============================================================
// api/signal.js — ふたりでプレイ用 WebRTC シグナリング(Vercel KV)
//   役割は「二人を引き合わせる」だけ。SDP(接続情報)をあいことば毎に
//   5分だけ預かる。ゲーム中の通信は P2P (WebRTC DataChannel) で行われ、
//   サーバーは一切経由しない。KV 未設定なら 503(フロントはデモにフォールバック)。
// ============================================================

const URL_BASE = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const TTL = 300; // 5分で自動消滅

async function redis(cmd) {
  const r = await fetch(URL_BASE, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('kv ' + r.status);
  return (await r.json()).result;
}

const okCode = c => /^[A-Z2-9]{6}$/.test(c || '');
const okKind = k => k === 'offer' || k === 'answer';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!URL_BASE || !TOKEN) return res.status(503).json({ error: 'no_kv' });

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
