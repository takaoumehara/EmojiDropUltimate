// ============================================================
// api/ai-stage.js — Vercel サーバーレス関数
//   Gemini でユニークなシューティングステージを生成して返す。
//   APIキー(GEMINI_API_KEY)はサーバー側の環境変数に隠される。
//   キー未設定/失敗時は 5xx を返し、フロント側でローカル生成にフォールバック。
// ============================================================

const MODEL = 'gemini-2.0-flash';

// Gemini 構造化出力スキーマ (OpenAPI サブセット)
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    en: { type: 'STRING' },
    emoji: { type: 'STRING' },
    dir: { type: 'STRING', enum: ['up', 'right', 'down', 'left'] },
    sky: { type: 'ARRAY', items: { type: 'STRING' } },
    night: { type: 'ARRAY', items: { type: 'STRING' } },
    bgEmojis: { type: 'ARRAY', items: { type: 'STRING' } },
    enemies: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['straight', 'wave', 'shooter', 'tank', 'kamikaze'] },
          emoji: { type: 'STRING' },
          hp: { type: 'INTEGER' },
          speed: { type: 'INTEGER' },
          pts: { type: 'INTEGER' },
          size: { type: 'INTEGER' },
          shootRate: { type: 'NUMBER' },
        },
        required: ['type', 'emoji', 'hp', 'speed', 'pts', 'size'],
      },
    },
    boss: {
      type: 'OBJECT',
      properties: {
        emoji: { type: 'STRING' }, name: { type: 'STRING' }, en: { type: 'STRING' }, hp: { type: 'INTEGER' },
      },
      required: ['emoji', 'name', 'en', 'hp'],
    },
    bpm: { type: 'INTEGER' },
  },
  required: ['name', 'en', 'emoji', 'dir', 'sky', 'night', 'bgEmojis', 'enemies', 'boss'],
};

function buildPrompt(weather, seed) {
  return `You design one stage for a retro EMOJI shoot-'em-up.
Invent a fresh, surprising theme (food world, animals, myth, cyber, seasons, sports, etc.). Be creative and playful — never reuse "space" or "ocean".
Let the current real-world weather subtly inspire mood/colors: "${weather}".
Random seed for variety: ${seed}.

Rules:
- "name" is a short catchy Japanese stage name (<= 12 chars). "en" is the English name (<= 20 chars).
- "emoji" is ONE emoji representing the stage. "bgEmojis" is 4 decorative background emojis.
- "dir" is the player's travel/shoot direction: up, right, down, or left.
- "sky" and "night" are each 2 hex colors like "#1a2b3c" (day gradient / night gradient). Make them fit the theme and readable.
- "enemies" is EXACTLY 4 entries, each a themed emoji creature. Vary the "type":
  straight (fodder), wave (zigzag), shooter (fires at player), tank (tough, fires), kamikaze (dives).
  hp 1-7, speed 40-320, pts 80-500, size 14-26. Include shootRate 0.6-1.3 only for shooter/tank.
- "boss" is a big themed emoji with a fun Japanese "name", English "en", and hp 140-220.
- "bpm" 130-160.
Return ONLY the JSON object, nothing else.`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'no_key' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const weather = String(body.weather || 'clear sky').slice(0, 80);
  const seed = String(body.seed || Math.floor(Math.random() * 1e9)).slice(0, 20);

  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 11000);
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(weather, seed) }] }],
          generationConfig: { temperature: 1.15, responseMimeType: 'application/json', responseSchema: SCHEMA },
        }),
        signal: ctrl.signal,
      }
    );
    clearTimeout(to);
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 200);
      return res.status(502).json({ error: 'gemini_error', status: r.status, detail });
    }
    const data = await r.json();
    const text = data && data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
      && data.candidates[0].content.parts[0].text;
    if (!text) return res.status(502).json({ error: 'empty_response' });
    let stage;
    try { stage = JSON.parse(text); } catch { return res.status(502).json({ error: 'parse_error' }); }
    return res.status(200).json({ stage });
  } catch (e) {
    return res.status(502).json({ error: 'exception', detail: String(e && e.message || e).slice(0, 120) });
  }
};
