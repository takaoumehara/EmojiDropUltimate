// ============================================================
// sharecard.js — SNS共有用スコアカード生成(オフスクリーンcanvas)
//   Web Share(画像)→ 失敗時ダウンロード → さらに失敗ならテキストコピー。
//
//   デザイン方針: 「洗練されたネオアーケード / プレミアムコレクションカード」。
//   紺のベース + ひとつだけの金アクセント、太い黒縁取り+シャドウを多用せず、
//   ランク(バッジ/メダリオン)を主役として描画する。
// ============================================================
import { getLang } from './i18n.js';

export const SHARE_URL = location.origin + location.pathname;
const URL_SHARE = SHARE_URL;
const HASHTAG = '#EmojiDropUltimate';

// ---- ユーティリティ -----------------------------------------------------

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function roundedRectPath(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

// 大見出し/ロゴ/ランク文字/スコア数字専用(丸ゴシックの目立つ書体)
function displayFont(px, weight = 800) {
  return `${weight} ${px}px 'Baloo 2','M PLUS Rounded 1c',system-ui,sans-serif`;
}
// 付随情報(天気・URL・ステージ名ラベル等)専用の締まったサンセリフ
function metaFont(px, weight = 600) {
  return `${weight} ${px}px 'Inter','Segoe UI','Hiragino Sans','Noto Sans JP',system-ui,sans-serif`;
}

// テキスト描画: 極力アウトラインを使わず、うるさい背景の上でも読める程度の
// ソフトシャドウのみで視認性を確保する(小さな文字にはストロークをかけない)。
function drawText(c, str, x, y, font, color, opts = {}) {
  if (str == null || str === '') return;
  const { align = 'center', letterSpacing = 0, shadow = false,
    shadowColor = 'rgba(0,0,0,0.5)', shadowBlur = 10, alpha = 1 } = opts;
  c.save();
  c.font = font; c.textAlign = align; c.textBaseline = 'middle';
  try { c.letterSpacing = letterSpacing + 'px'; } catch (e) { /* Safari/older browsers: ignore */ }
  if (shadow) {
    c.shadowColor = shadowColor; c.shadowBlur = shadowBlur; c.shadowOffsetY = Math.max(2, shadowBlur * 0.2);
  }
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.fillText(str, x, y);
  c.restore();
}

// 幅に収まらない文字列は省略記号で詰める
function fitText(c, str, font, maxWidth) {
  if (!str) return str;
  c.save(); c.font = font;
  let s = String(str);
  if (c.measureText(s).width <= maxWidth) { c.restore(); return s; }
  while (s.length > 1 && c.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  c.restore();
  return s + '…';
}

function drawDivider(c, cx, y, w, color = 'rgba(255,210,63,0.55)') {
  const grad = c.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  grad.addColorStop(0, 'rgba(255,210,63,0)');
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, 'rgba(255,210,63,0)');
  c.save();
  c.strokeStyle = grad; c.lineWidth = 2;
  c.beginPath(); c.moveTo(cx - w / 2, y); c.lineTo(cx + w / 2, y); c.stroke();
  c.restore();
}

function drawPanel(c, x, y, w, h, r) {
  c.save();
  roundedRectPath(c, x, y, w, h, r);
  c.fillStyle = 'rgba(255,255,255,0.05)';
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(255,255,255,0.14)';
  c.stroke();
  c.restore();
}

// ---- 背景: ネビュラ + 星空 + ビネット + グレイン ------------------------

function drawBackground(c, W, H) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#090c24');
  g.addColorStop(0.55, '#0d1338');
  g.addColorStop(1, '#1a0f34');
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  const bloom = (x, y, r, color) => {
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, color);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
  };
  bloom(W * 0.15, H * 0.13, 460, 'rgba(126,98,224,0.20)');
  bloom(W * 0.86, H * 0.2, 400, 'rgba(80,180,255,0.13)');
  bloom(W * 0.5, H * 0.66, 560, 'rgba(255,140,190,0.08)');

  // 星: 大きさ・不透明度・グロー量をばらつかせる
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const roll = Math.random();
    let size, alpha, glow;
    if (roll < 0.72) { size = 0.5 + Math.random() * 1.0; alpha = 0.2 + Math.random() * 0.3; glow = 0; }
    else if (roll < 0.94) { size = 1.1 + Math.random() * 1.4; alpha = 0.35 + Math.random() * 0.35; glow = 2; }
    else { size = 1.7 + Math.random() * 1.8; alpha = 0.55 + Math.random() * 0.3; glow = 6; }
    c.save();
    if (glow) { c.shadowColor = 'rgba(255,255,255,0.85)'; c.shadowBlur = glow; }
    c.fillStyle = `rgba(255,255,255,${alpha})`;
    c.beginPath(); c.arc(x, y, size, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // ビネット
  const vg = c.createRadialGradient(W / 2, H * 0.46, H * 0.22, W / 2, H * 0.5, H * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);

  // 微細なグレイン
  for (let i = 0; i < 700; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.035)';
    c.fillRect(x, y, 1, 1);
  }
}

function drawFrame(c, W, H) {
  c.save();
  roundedRectPath(c, 30, 30, W - 60, H - 60, 36);
  c.strokeStyle = 'rgba(255,210,63,0.32)'; c.lineWidth = 2; c.stroke();
  roundedRectPath(c, 38, 38, W - 76, H - 76, 28);
  c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1; c.stroke();
  c.restore();
}

function drawEmojiGlow(c, cx, cy, r) {
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.5, 'rgba(160,140,255,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.save();
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.restore();
}

// ---- ランク・メダリオン(主役の描画) -------------------------------------

const RANK_THEME = {
  S: { base: '#ffd23f', light: '#fff6d8', deep: '#7a5410', level: 4 },
  A: { base: '#ff6fa8', light: '#ffd9e7', deep: '#6e1c40', level: 3 },
  B: { base: '#7fd6ff', light: '#e3f7ff', deep: '#12455c', level: 2 },
  C: { base: '#8fce9c', light: '#e7f6e9', deep: '#2a5230', level: 1 },
};

function drawSparkle(c, x, y, size, color, alpha = 0.85) {
  c.save();
  c.translate(x, y);
  c.globalAlpha = alpha;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, -size); c.quadraticCurveTo(size * 0.18, -size * 0.18, size, 0);
  c.quadraticCurveTo(size * 0.18, size * 0.18, 0, size);
  c.quadraticCurveTo(-size * 0.18, size * 0.18, -size, 0);
  c.quadraticCurveTo(-size * 0.18, -size * 0.18, 0, -size);
  c.closePath(); c.fill();
  c.restore();
}

// S ランクだけの月桂樹風フラリッシュ(小さなダイヤ形の粒を弧状に配置)
function drawLaurelFlourish(c, cx, cy, R, th) {
  const count = 4;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / count;
      const ang = Math.PI / 2 + side * (0.26 + t * 0.5);
      const dist = R + 8 + i * 5;
      const x = cx + Math.cos(ang) * dist, y = cy + Math.sin(ang) * dist;
      const size = 6.5 - i * 0.9;
      c.save();
      c.translate(x, y); c.rotate(ang);
      c.fillStyle = hexToRgba(th.light, 0.5 - i * 0.08);
      c.beginPath();
      c.moveTo(0, -size); c.lineTo(size * 0.55, 0); c.lineTo(0, size); c.lineTo(-size * 0.55, 0);
      c.closePath(); c.fill();
      c.restore();
    }
  }
}

function drawRankMedallion(c, cx, cy, rank) {
  const th = RANK_THEME[rank] || { base: '#c7d2e0', light: '#eef2f8', deep: '#3c4657', level: 1 };
  const level = th.level;
  const R = 136;

  // 外側のグロー(ランクが高いほど大きく強い)
  const glowR = R * (1.3 + level * 0.22);
  const glowAlpha = 0.09 + level * 0.055;
  const gg = c.createRadialGradient(cx, cy, R * 0.3, cx, cy, glowR);
  gg.addColorStop(0, hexToRgba(th.base, glowAlpha));
  gg.addColorStop(1, 'rgba(0,0,0,0)');
  c.save();
  c.fillStyle = gg; c.beginPath(); c.arc(cx, cy, glowR, 0, Math.PI * 2); c.fill();
  c.restore();

  // 放射状レイ(S・Aのみ、ランクが高いほど本数・長さが増す)
  if (level >= 3) {
    const rayCount = level === 4 ? 16 : 10;
    const rayLen = level === 4 ? R * 0.5 : R * 0.32;
    for (let i = 0; i < rayCount; i++) {
      const ang = (Math.PI * 2 / rayCount) * i;
      const long = i % 2 === 0;
      const len = long ? rayLen : rayLen * 0.58;
      const alpha = long ? 0.22 : 0.12;
      c.save();
      c.translate(cx, cy); c.rotate(ang);
      const grad = c.createLinearGradient(R, 0, R + len, 0);
      grad.addColorStop(0, hexToRgba(th.base, alpha));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      c.strokeStyle = grad; c.lineWidth = long ? 4 : 2.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(R, 0); c.lineTo(R + len, 0); c.stroke();
      c.restore();
    }
  }

  // 控えめなティック(Bランクの質感)
  if (level === 2) {
    const tickCount = 20;
    for (let i = 0; i < tickCount; i++) {
      const ang = (Math.PI * 2 / tickCount) * i;
      c.save();
      c.translate(cx, cy); c.rotate(ang);
      c.strokeStyle = hexToRgba(th.base, 0.28); c.lineWidth = 2.2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(R + 4, 0); c.lineTo(R + 13, 0); c.stroke();
      c.restore();
    }
  }

  // Sランクだけの月桂樹フラリッシュ + きらめき
  if (level === 4) {
    drawLaurelFlourish(c, cx, cy, R, th);
    const sparkPos = [[-0.98, -1.05], [1.02, -0.85], [-1.08, 0.85], [0.95, 1.05]];
    sparkPos.forEach(([dx, dy]) => drawSparkle(c, cx + dx * R * 0.74, cy + dy * R * 0.74, 6.5, th.light));
  }

  // 金属的なリング(帯)
  const ringW = 15;
  const ringGrad = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  ringGrad.addColorStop(0, th.light);
  ringGrad.addColorStop(0.45, th.base);
  ringGrad.addColorStop(0.55, th.deep);
  ringGrad.addColorStop(1, th.base);
  c.save();
  c.beginPath(); c.arc(cx, cy, R - ringW / 2, 0, Math.PI * 2);
  c.strokeStyle = ringGrad; c.lineWidth = ringW; c.stroke();

  // 内側のハイライト線(二重リングの質感)
  c.beginPath(); c.arc(cx, cy, R - ringW - 4, 0, Math.PI * 2);
  c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1.4; c.stroke();
  c.restore();

  // 内側の円盤(文字の背景・奥行き)
  const discR = R - ringW - 8;
  const discGrad = c.createRadialGradient(cx, cy - discR * 0.3, discR * 0.1, cx, cy, discR);
  discGrad.addColorStop(0, hexToRgba(th.base, 0.16));
  discGrad.addColorStop(0.7, 'rgba(10,14,34,0.92)');
  discGrad.addColorStop(1, 'rgba(6,8,22,0.96)');
  c.save();
  c.beginPath(); c.arc(cx, cy, discR, 0, Math.PI * 2); c.fillStyle = discGrad; c.fill();
  c.restore();

  // ランク文字(大・丸ゴシック・薄いグローのみで縁取りなし)
  drawText(c, rank, cx, cy - 12, displayFont(122, 800), '#ffffff',
    { shadow: true, shadowColor: hexToRgba(th.base, 0.9), shadowBlur: 24 });
  // 小さな "RANK" キャプション(締まったサンセリフ・低コントラスト)
  drawText(c, getLang() === 'ja' ? 'ランク' : 'RANK', cx, cy + 58, metaFont(15, 700),
    'rgba(255,255,255,0.72)', { letterSpacing: 5 });
}

// ---- メインのカード描画 ---------------------------------------------------

export function buildCanvas(d) {
  d = d || {};
  const W = 1080, H = 1350;
  const cx = W / 2;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const ja = getLang() === 'ja';

  drawBackground(c, W, H);

  // ---- ヘッダー: ロゴ(唯一の金アクセントを効かせる) -------------------
  drawText(c, 'EMOJI DROP', cx, 100, displayFont(56, 800), '#ffd23f',
    { letterSpacing: 1, shadow: true, shadowColor: 'rgba(0,0,0,0.35)', shadowBlur: 14 });
  drawText(c, 'U L T I M A T E', cx, 139, metaFont(17, 700), 'rgba(150,205,255,0.85)', { letterSpacing: 3 });
  drawDivider(c, cx, 166, 90);

  // ---- 大きな絵文字 + ソフトなグロー ------------------------------------
  const emojiCy = 330;
  drawEmojiGlow(c, cx, emojiCy, 132);
  c.save();
  c.font = `188px serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#ffffff';
  c.fillText(d.emoji || '🚀', cx, emojiCy + 6);
  c.restore();

  // ---- モード / ステージ名(1つのグループとしてパネルにまとめる) --------
  const mode = (d.mode || '').trim();
  const stageName = (d.stageName || '').trim();
  if (mode || stageName) {
    const panelW = 640, panelTop = 476;
    const panelH = (mode && stageName) ? 92 : 58;
    drawPanel(c, cx - panelW / 2, panelTop, panelW, panelH, 20);
    const maxW = panelW - 90;
    if (mode && stageName) {
      drawText(c, fitText(c, mode.toUpperCase(), metaFont(17, 700), maxW), cx, panelTop + 27,
        metaFont(17, 700), 'rgba(200,180,255,0.8)', { letterSpacing: 2 });
      drawText(c, fitText(c, stageName, displayFont(31, 700), maxW), cx, panelTop + 65,
        displayFont(31, 700), '#ffffff');
    } else if (stageName) {
      drawText(c, fitText(c, stageName, displayFont(30, 700), maxW), cx, panelTop + panelH / 2,
        displayFont(30, 700), '#ffffff');
    } else {
      drawText(c, fitText(c, mode.toUpperCase(), metaFont(19, 700), maxW), cx, panelTop + panelH / 2,
        metaFont(19, 700), 'rgba(200,180,255,0.85)', { letterSpacing: 2 });
    }
  }

  // ---- ランク・メダリオン(主役) -----------------------------------------
  const rank = (d.rank || '').trim().toUpperCase();
  if (rank) drawRankMedallion(c, cx, 800, rank);

  // ---- スコア(独立したグループ) ------------------------------------------
  drawText(c, ja ? 'スコア' : 'SCORE', cx, 1048, metaFont(18, 700), 'rgba(180,195,225,0.8)', { letterSpacing: 6 });
  const scoreStr = String(d.score != null ? d.score : 0).padStart(7, '0');
  drawText(c, scoreStr, cx, 1110, displayFont(88, 800), '#ffffff',
    { shadow: true, shadowColor: 'rgba(255,210,63,0.35)', shadowBlur: 18 });

  drawDivider(c, cx, 1160, 110);

  // ---- フッター: 名前 / サブ情報 / ハッシュタグ / URL(下端に固定) -------
  const metaLines = [];
  if (d.name) metaLines.push(String(d.name).trim());
  const subWeather = [d.sub, d.weather].filter(v => v != null && String(v).trim() !== '').join('   ·   ');
  if (subWeather) metaLines.push(subWeather);

  const hashtagY = 1256, urlY = 1292;
  let footY = hashtagY - 42;
  for (let i = metaLines.length - 1; i >= 0; i--) {
    drawText(c, fitText(c, metaLines[i], metaFont(24, 600), 820), cx, footY,
      metaFont(24, 600), i === metaLines.length - 1 ? 'rgba(200,215,235,0.8)' : 'rgba(255,255,255,0.85)');
    footY -= 34;
  }

  drawText(c, HASHTAG, cx, hashtagY, metaFont(26, 700), '#ffd23f');
  drawText(c, fitText(c, URL_SHARE.replace(/^https?:\/\//, ''), metaFont(20, 600), 820), cx, urlY,
    metaFont(20, 600), 'rgba(150,165,195,0.75)');

  drawFrame(c, W, H);
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
