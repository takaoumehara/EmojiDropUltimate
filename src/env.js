// ============================================================
// env.js — キャンバス / 画面サイズ (W,H,DPR,UI はライブバインディング)
// ============================================================

export const canvas = document.getElementById('c');
export const ctx = canvas.getContext('2d');

export let W = 0, H = 0, DPR = 1, UI = 1;

export function resize() {
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
