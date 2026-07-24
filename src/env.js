// ============================================================
// env.js — キャンバス / 画面サイズ (W,H,DPR,UI はライブバインディング)
// ============================================================

export const canvas = document.getElementById('c');
export const ctx = canvas.getContext('2d');

export let W = 0, H = 0, DPR = 1, UI = 1;

export function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // 読みやすさ優先で UI スケールを底上げ (小さすぎる端末でも最低 0.95)
  UI = Math.max(0.95, Math.min(W / 400, H / 720, 1.5));
}
