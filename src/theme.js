// ============================================================
// theme.js — デザイントークンと精密な描画プリミティブ
//   方針: 「かわいい」は EMOJI DROP のロゴと絵文字が担当し、
//         UI(枠・文字・数値)は洗練された高コントラストで支える。
//   ・角丸/枠線は整数座標にスナップ → にじまない(DPR拡大でもクッキリ)
//   ・黒フチ(stroke)は乱用しない。ゲーム画面の上だけ薄い影で可読性を確保。
// ============================================================
import { ctx } from './env.js';

// 表示用(ロゴ・見出し)は丸ゴシック、UI・数値は幾何学サンセリフで対比をつける
export const FONT_DISPLAY = `'Baloo 2','M PLUS Rounded 1c',system-ui,sans-serif`;
export const FONT_UI = `'Outfit','Helvetica Neue',system-ui,-apple-system,sans-serif`;

export const COL = {
  ink: '#ffffff',
  sub: '#a8b8d4',     // 補助テキスト
  mute: '#6f819f',    // さらに弱い注釈
  gold: '#ffd23f',    // 主アクセント(唯一の強い色)
  mint: '#4ad6a0',    // 協力プレイ
  violet: '#b98cff',  // AI
  sky: '#8fd3ff',
  danger: '#ff5a5a',
  panel: 'rgba(12,18,38,0.72)',
  line: 'rgba(255,255,255,0.14)',
};

const snap = v => Math.round(v) + 0.5;   // 1px 線を画素境界に載せる
const snapR = v => Math.round(v);

export function font(size, weight = 600, family = FONT_UI) {
  ctx.font = `${weight} ${Math.round(size)}px ${family}`;
}

// UI テキスト(パネル上・フチなし・くっきり)
export function txt(s, x, y, {
  size = 14, color = COL.ink, weight = 600, align = 'center',
  family = FONT_UI, baseline = 'middle', alpha = 1, track = 0, shadow = 0, maxW = 0,
} = {}) {
  ctx.save();
  font(size, weight, family);
  // maxW 指定時は収まるまで縮小(言語や端末幅が変わってもはみ出さない)
  if (maxW > 0) {
    let w = ctx.measureText(s).width + track * Math.max(0, [...s].length - 1);
    if (w > maxW) {
      size = Math.max(7, size * (maxW / w));
      track *= maxW / w;
      font(size, weight, family);
    }
  }
  ctx.textAlign = track ? 'left' : align;
  ctx.textBaseline = baseline;
  ctx.globalAlpha = alpha;
  if (shadow) { ctx.shadowColor = `rgba(0,0,0,${shadow})`; ctx.shadowBlur = size * 0.34; ctx.shadowOffsetY = size * 0.06; }
  ctx.fillStyle = color;
  if (track) {                     // 字間を開ける(小見出し用)
    const chars = [...s];
    const total = chars.reduce((w, c) => w + ctx.measureText(c).width + track, -track);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    for (const c of chars) { ctx.fillText(c, cx, y); cx += ctx.measureText(c).width + track; }
  } else ctx.fillText(s, x, y);
  ctx.restore();
}

// ゲーム画面に重ねる文字(背景が読めないので影で浮かせる。黒フチは使わない)
export function gtxt(s, x, y, o = {}) {
  txt(s, x, y, { shadow: 0.85, weight: 700, ...o });
}

export function roundPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// くっきりしたパネル/ボタン面
export function surface(x, y, w, h, {
  r = 14, fill = COL.panel, border = COL.line, lw = 2, glow = 0,
} = {}) {
  ctx.save();
  const X = snapR(x), Y = snapR(y), Wd = snapR(w), Ht = snapR(h);
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 18; }
  if (fill) { roundPath(X, Y, Wd, Ht, r); ctx.fillStyle = fill; ctx.fill(); }
  ctx.shadowBlur = 0;
  if (border) {
    roundPath(snap(x) - 0.5, snap(y) - 0.5, Wd, Ht, r);
    ctx.strokeStyle = border; ctx.lineWidth = lw; ctx.stroke();
  }
  ctx.restore();
}

// 背景の上に敷く可読性レイヤ(弾が必ず見えるように上下を締める)
export function scrim(W, H) {
  ctx.save();
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.22);
  top.addColorStop(0, 'rgba(4,7,18,0.55)'); top.addColorStop(1, 'rgba(4,7,18,0)');
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, H * 0.22);
  const bot = ctx.createLinearGradient(0, H * 0.78, 0, H);
  bot.addColorStop(0, 'rgba(4,7,18,0)'); bot.addColorStop(1, 'rgba(4,7,18,0.5)');
  ctx.fillStyle = bot; ctx.fillRect(0, H * 0.78, W, H * 0.22);
  ctx.restore();
}
