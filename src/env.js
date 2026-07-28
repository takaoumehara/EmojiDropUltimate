// ============================================================
// env.js — キャンバス / 画面サイズ (W,H,DPR,UI はライブバインディング)
// ============================================================

export const canvas = document.getElementById('c');
export const ctx = canvas.getContext('2d');

export let W = 0, H = 0, DPR = 1, UI = 1;

// 画面の「触れない縁」。iPhone のダイナミックアイランドとホームバーの下は
//   見えていても読めないので、キャンバスに描く HUD もここを避ける必要がある。
//   viewport-fit=cover を入れた時点で W/H は画面いっぱいになり、
//   何もしないとスコアも残機もその下に潜る。
export const SAFE = { top: 0, right: 0, bottom: 0, left: 0 };

function readSafeArea() {
  // ブラウザ以外(テスト)や、CSS 変数を読めない環境では 0 のまま先へ進む
  if (typeof getComputedStyle !== 'function' || !document.documentElement) return;
  const cs = getComputedStyle(document.documentElement);
  if (!cs || typeof cs.getPropertyValue !== 'function') return;
  const px = name => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? v : 0;
  };
  SAFE.top = px('--sat'); SAFE.right = px('--sar');
  SAFE.bottom = px('--sab'); SAFE.left = px('--sal');
  // ホームバーのある端末は下端ぎりぎりに置くと指が届かない。少し余裕を足す。
  if (SAFE.bottom > 0) SAFE.bottom += 4;
}

export function resize() {
  readSafeArea();
  // 回転→戻しでレイアウトが崩れる不具合対策:
  //   iOS/一部WebViewは回転直後 window.innerWidth が古い値を返す。
  //   スケール非依存で安定している documentElement.clientWidth を優先して使う。
  const de = document.documentElement;
  W = de.clientWidth || window.innerWidth;
  H = de.clientHeight || window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // 読みやすさ優先で UI スケールを底上げ (小さすぎる端末でも最低 1.05)
  UI = Math.max(1.05, Math.min(W / 380, H / 680, 1.6));
}
