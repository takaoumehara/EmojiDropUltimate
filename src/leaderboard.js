// ============================================================
// leaderboard.js — 匿名デイリーランキングのクライアント
//   /api/score (Vercel KV) に問い合わせ。未設定(503)なら available=false。
// ============================================================
export const Leaderboard = {
  available: true, // 503 を受けたら false(UIを隠す)

  async submit(d) {
    try {
      const r = await fetch('/api/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      if (r.status === 503) { this.available = false; return null; }
      if (!r.ok) return null;
      return await r.json(); // {ok, day, rank, total}
    } catch (e) { return null; }
  },

  async top(day) {
    try {
      const r = await fetch('/api/score?day=' + encodeURIComponent(day));
      if (r.status === 503) { this.available = false; return null; }
      if (!r.ok) return null;
      return await r.json(); // {day, top:[{name,score}]}
    } catch (e) { return null; }
  },
};
