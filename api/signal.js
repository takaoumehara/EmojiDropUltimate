// ============================================================
// api/signal.js — 共闘プレイ用 WebRTC シグナリング(Vercel KV)
//   役割は「集まる人たちを引き合わせる」だけ。SDP(接続情報)をあいことば毎に
//   5分だけ預かる。ゲーム中の通信は P2P (WebRTC DataChannel) で行われ、
//   サーバーは一切経由しない。KV 未設定なら 503(フロントはデモにフォールバック)。
//
// v2 で足したもの — 部屋(roster)と、組ごとの棚(pair)
//   2人のときは棚が offer / answer の2つで足りた。3〜4人を網目で繋ぐには
//   「誰と誰の組の合図か」を区別する必要があるので、棚の名前に組を混ぜる。
//   さらに「いま誰が居るのか」を知る手段が無いと、そもそも相手を見つけられない。
//
//   v1(2人版)が使っていた棚の名前は**そのまま残してある**。
//   古い版のクライアントは、この同じ API で今まで通り繋がる。
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
// 部屋での呼び名。4文字。src/mesh.js の PID_CHARS と同じ集合。
const okPid = p => /^[a-z2-9]{4}$/.test(p || '');
// 組の棚。若い番号が先に来るよう、クライアント側で並べてから渡す。
const okPair = p => /^[a-z2-9]{4}-[a-z2-9]{4}$/.test(p || '');

// 部屋の定員。src/coop.js の MAX_PLAYERS と server/relay.js の LIMITS.MEMBERS と揃える。
const ROOM_MAX = 4;
// 何秒名乗りが途絶えたら「もう居ない」とみなすか。
//   クライアントは3秒ごとに名乗るので、2回落としても消えない幅を取る。
const ROOM_STALE_MS = 25000;

/**
 * 合図の棚の名前。
 *   組が指定されていれば組ごとの棚、無ければ v1 と同じ「部屋にひとつ」の棚。
 *   後者を残しているのは、2人版(v1.0-duo)のクライアントを壊さないため。
 */
function sdpKey(code, kind, pair) {
  return pair ? `sig:${code}:${pair}:${kind}` : `sig:${code}:${kind}`;
}

// レート制限。無いと第三者に叩かれて KV の無料枠と費用が飛ぶ。
//   Redis の INCR + EX で「1分あたり何回」を数えるだけ。
//   KV そのものが落ちている時に遊べなくなる方が損なので、
//   数えられなかった場合は通す(fail-open)。
const RATE_WINDOW = 60;      // 秒
// 4人が同じ Wi-Fi(=同じ出口IP)から入ると、名乗りだけで 1分あたり 80回に届く。
//   2人時代の 40 のままだと、家族4人で遊ぶ**正常な使い方**が弾かれる。
const RATE_MAX = 300;
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

/**
 * HGETALL の戻りを {id, t} の配列にする。
 *   Upstash は素の配列(["a","1","b","2"])を返すこともあれば、
 *   オブジェクトを返すこともある。両方受ける。
 */
function parseRoom(raw) {
  const out = [];
  if (!raw) return out;
  if (Array.isArray(raw)) {
    for (let i = 0; i + 1 < raw.length; i += 2) out.push({ id: String(raw[i]), t: Number(raw[i + 1]) || 0 });
  } else if (typeof raw === 'object') {
    for (const k of Object.keys(raw)) out.push({ id: String(k), t: Number(raw[k]) || 0 });
  }
  return out;
}

/** 入った順。全員が同じ並びを持てるよう、時刻が同じときは番号で決める。 */
function byJoinOrder(a, b) { return a.t - b.t || (a.id < b.id ? -1 : 1); }

/**
 * 部屋に名乗って、いまの顔ぶれを受け取る。
 *
 * 消えた人を消す作業はしない(HDEL を撃つとその分だけ命令が増える)。
 * 古い名乗りは**読むときに落とす**。部屋そのものは5分で勝手に消える。
 *
 * 先に顔ぶれを読んでから名乗るのは、満員の判定のため。
 * 名乗ってから数えると、弾かれる5人目が一瞬だけ他の人の画面に出てしまう。
 */
async function joinRoom(code, pid, deps = {}) {
  const call = deps.redis || redis;
  const now = (deps.now || Date.now)();
  const key = `sig:${code}:room`;
  const before = parseRoom(await call(['HGETALL', key])).filter(m => now - m.t < ROOM_STALE_MS);
  const known = before.some(m => m.id === pid);
  if (!known && before.length >= ROOM_MAX) {
    return { full: true, members: before.sort(byJoinOrder).map(m => m.id) };
  }
  await call(['HSET', key, pid, String(now)]);
  // 名乗るたびに寿命を延ばす。長いロビーの途中で部屋が消えると、
  //   全員が繋がっているのに新しい人だけ入れなくなる。
  await call(['EXPIRE', key, String(TTL)]);
  const live = known ? before : [...before, { id: pid, t: now }];
  return { full: false, members: live.sort(byJoinOrder).map(m => m.id) };
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
      const pair = String(req.query.pair || '');
      if (!okCode(code) || !okKind(want)) return res.status(400).json({ error: 'bad_request' });
      if (pair && !okPair(pair)) return res.status(400).json({ error: 'bad_pair' });
      const sdp = await redis(['GET', sdpKey(code, want, pair)]);
      return res.status(200).json({ sdp: sdp || null });
    }
    if (req.method === 'POST') {
      let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
      b = b || {};
      const code = String(b.code || '').toUpperCase();
      if (!okCode(code)) return res.status(400).json({ error: 'bad_request' });

      // 部屋に名乗る / 抜ける(v2: 3〜4人の網目を組むために要る)
      if (b.kind === 'room' || b.kind === 'leave') {
        const pid = String(b.pid || '');
        if (!okPid(pid)) return res.status(400).json({ error: 'bad_pid' });
        if (b.kind === 'leave') {
          await redis(['HDEL', `sig:${code}:room`, pid]);
          return res.status(200).json({ ok: true });
        }
        const room = await joinRoom(code, pid);
        return res.status(200).json({ ok: true, you: pid, max: ROOM_MAX, ...room });
      }

      const pair = String(b.pair || '');
      if (!okKind(b.kind) || typeof b.sdp !== 'string' || b.sdp.length > 20000) {
        return res.status(400).json({ error: 'bad_request' });
      }
      if (pair && !okPair(pair)) return res.status(400).json({ error: 'bad_pair' });
      await redis(['SET', sdpKey(code, b.kind, pair), b.sdp, 'EX', String(TTL)]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    return res.status(502).json({ error: 'kv_error', detail: String(e && e.message || e).slice(0, 120) });
  }
};

// テストから触れるように出しておく(本番の経路は上の handler だけを使う)。
module.exports.ROOM_MAX = ROOM_MAX;
module.exports.ROOM_STALE_MS = ROOM_STALE_MS;
module.exports.RATE_MAX = RATE_MAX;
module.exports._sdpKey = sdpKey;
module.exports._parseRoom = parseRoom;
module.exports._joinRoom = joinRoom;
module.exports._okPair = okPair;
module.exports._okPid = okPid;
