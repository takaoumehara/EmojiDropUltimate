// ============================================================
// sharecard.js — SNS共有用スコアカード生成(オフスクリーンcanvas)
//   Web Share(画像)→ 失敗時ダウンロード → さらに失敗ならテキストコピー。
// ============================================================
import { getLang } from './i18n.js';

export const SHARE_URL = location.origin + location.pathname;
const URL_SHARE = SHARE_URL;
const HASHTAG = '#EmojiDropUltimate';

export function buildCanvas(d) {
  const W = 1080, Hgt = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = Hgt;
  const c = cv.getContext('2d');
  // 背景
  const g = c.createLinearGradient(0, 0, 0, Hgt);
  g.addColorStop(0, '#0a0a2a'); g.addColorStop(1, '#26134f');
  c.fillStyle = g; c.fillRect(0, 0, W, Hgt);
  for (let i = 0; i < 140; i++) { c.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.4})`; const s = 1 + Math.random() * 3; c.fillRect(Math.random() * W, Math.random() * Hgt, s, s); }
  c.strokeStyle = 'rgba(255,255,255,0.15)'; c.lineWidth = 6; c.strokeRect(28, 28, W - 56, Hgt - 56);

  const sans = `800 %PXpx 'Baloo 2','M PLUS Rounded 1c',system-ui,sans-serif`;
  const text = (t, x, y, px, color, align = 'center', stroke = true) => {
    c.font = sans.replace('%PX', px); c.textAlign = align; c.textBaseline = 'middle';
    if (stroke) { c.lineJoin = 'round'; c.lineWidth = px * 0.14; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.strokeText(t, x, y); }
    c.fillStyle = color; c.fillText(t, x, y);
  };

  // ロゴ
  text('EMOJI DROP', W / 2, 130, 78, '#ffe94d');
  text('— ULTIMATE —', W / 2, 205, 40, '#8fd3ff');

  // 大きな絵文字
  c.font = `230px serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(d.emoji || '🚀', W / 2, 430);

  // モード/ステージ名
  text(d.mode || '', W / 2, 600, 40, '#b98cff');
  if (d.stageName) text(d.stageName, W / 2, 660, 46, '#ffffff');

  // ランク大
  if (d.rank) {
    const rc = { S: '#ffd700', A: '#ff66aa', B: '#8fd3ff', C: '#99cc99' }[d.rank] || '#fff';
    text((getLang() === 'ja' ? 'ランク ' : 'RANK ') + d.rank, W / 2, 800, 110, rc);
  }

  // スコア
  text((getLang() === 'ja' ? 'スコア' : 'SCORE'), W / 2, 930, 40, '#aab');
  text(String(d.score).padStart(7, '0'), W / 2, 1005, 96, '#ffffff');

  // サブ(ワールド/命中率/天気)
  if (d.sub) text(d.sub, W / 2, 1105, 40, '#9fd8b0');
  if (d.weather) text(d.weather, W / 2, 1165, 36, '#cfe8ff');

  // フッター
  text(HASHTAG, W / 2, 1250, 40, '#ffd23f');
  text(URL_SHARE.replace(/^https?:\/\//, ''), W / 2, 1300, 32, '#8899bb');
  return cv;
}

// SNS本文(URLは含めない。各共有先で url は別パラメータで渡す)
export function summaryText(d) {
  const ja = getLang() === 'ja';
  const parts = [];
  parts.push(ja ? `EMOJI DROP ULTIMATE で ${d.score} 点!` : `Scored ${d.score} in EMOJI DROP ULTIMATE!`);
  if (d.rank) parts.push(ja ? `ランク ${d.rank}` : `Rank ${d.rank}`);
  if (d.sub) parts.push(d.sub);
  parts.push(HASHTAG);
  return parts.join(' ');
}

export async function cardBlob(d) {
  return new Promise(res => buildCanvas(d).toBlob(res, 'image/png'));
}

// 生成 → 共有/保存。戻り値: 'shared' | 'downloaded' | 'copied' | 'error'
export async function shareCard(d) {
  let cv;
  try { cv = buildCanvas(d); } catch (e) { return 'error'; }
  const txt = summaryText(d);
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  if (blob && navigator.canShare) {
    try {
      const file = new File([blob], 'emoji-drop-score.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: txt, title: 'EMOJI DROP ULTIMATE' });
        return 'shared';
      }
    } catch (e) { if (e && e.name === 'AbortError') return 'shared'; }
  }
  // フォールバック: ダウンロード
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'emoji-drop-score.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    try { await navigator.clipboard.writeText(txt); } catch (e) {}
    return 'downloaded';
  } catch (e) {
    try { await navigator.clipboard.writeText(txt); return 'copied'; } catch (e2) { return 'error'; }
  }
}
