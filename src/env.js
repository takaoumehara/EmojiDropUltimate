// ============================================================
// env.js — キャンバス / 画面サイズ (W,H,DPR,UI はライブバインディング)
//
// **W,H は「窓の大きさ」ではなく「遊ぶ板の大きさ」。**
//   横に広い画面で窓いっぱいを盤面にすると、同じゲームではなくなる。
//   1920px の画面で測ったら、自機は盤面の 2%(電話では 10%)まで縮み、
//   敵は左右 700px の彼方に湧いて、届く前に画面を抜けていった。
//   見た目が寂しいだけの話ではなく、遊びそのものが変わってしまう。
//
//   なので盤面は縦長の板に固定し、窓の中央に置く。外側は飾りにする。
//   電話では板が窓とぴったり同じになるので、これまでと1pxも変わらない。
// ============================================================

export const canvas = document.getElementById('c');
export const ctx = canvas.getContext('2d');

export let W = 0, H = 0, DPR = 1, UI = 1;

// 板の上限。電話の幅(393〜430)を大きく超えない値にする。
//   ここを窓なりに広げると上に書いた「別のゲーム」に戻る。
export const STAGE_MAX_W = 560;
// 板の細長さの下限(幅/高さ)。縦に長い画面で糸のようにならないように。
export const STAGE_MIN_ASPECT = 0.45;

// 窓の中の板の位置。飾りを描くときと、指の位置を板の座標に直すときに使う。
export const VIEW = { winW: 0, winH: 0, x: 0, y: 0, w: 0, h: 0, boxed: false };

// 画面の「触れない縁」。iPhone のダイナミックアイランドとホームバーの下は
//   見えていても読めないので、キャンバスに描く HUD もここを避ける必要がある。
//   viewport-fit=cover を入れた時点で W/H は画面いっぱいになり、
//   何もしないとスコアも残機もその下に潜る。
export const SAFE = { top: 0, right: 0, bottom: 0, left: 0 };

/** 窓の大きさから板の大きさを出す。描画に触らないので単体で試せる。 */
export function stageSize(winW, winH) {
  const w = Math.min(winW, STAGE_MAX_W);
  const h = Math.min(winH, w / STAGE_MIN_ASPECT);
  return { w, h };
}

/**
 * 板の大きさから UI の倍率を出す。
 *
 * 底上げ(最低 1.05)は **幅の狭い端末で字が小さくなりすぎない**ための措置。
 * 縦が短いとき(横持ち)にまで効かせると、行の間隔だけが詰まって字は縮まず、
 * 見出しと小見出し、ボタンの2行が重なって **かえって読めなくなる**。
 * 実測: 852x393 では題字が説明文に、ボタンの主文が副文に、全部重なっていた。
 * なので縦が短いところでは底上げそのものを緩める。
 * h >= 546 では従来と同じ値になるので、電話の縦持ちは一切変わらない。
 */
export function uiScale(w, h) {
  const floor = Math.min(1.05, h / 520);
  return Math.max(floor, Math.min(w / 380, h / 680, 1.6));
}

function readSafeArea() {
  // ブラウザ以外(テスト)や、CSS 変数を読めない環境では 0 のまま先へ進む
  if (typeof getComputedStyle !== 'function' || !document.documentElement) return { top: 0, right: 0, bottom: 0, left: 0 };
  const cs = getComputedStyle(document.documentElement);
  if (!cs || typeof cs.getPropertyValue !== 'function') return { top: 0, right: 0, bottom: 0, left: 0 };
  const px = name => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? v : 0;
  };
  const s = { top: px('--sat'), right: px('--sar'), bottom: px('--sab'), left: px('--sal') };
  // ホームバーのある端末は下端ぎりぎりに置くと指が届かない。少し余裕を足す。
  if (s.bottom > 0) s.bottom += 4;
  return s;
}

export function resize() {
  const raw = readSafeArea();
  // 回転→戻しでレイアウトが崩れる不具合対策:
  //   iOS/一部WebViewは回転直後 window.innerWidth が古い値を返す。
  //   スケール非依存で安定している documentElement.clientWidth を優先して使う。
  const de = document.documentElement;
  const winW = de.clientWidth || window.innerWidth;
  const winH = de.clientHeight || window.innerHeight;
  const box = stageSize(winW, winH);
  W = box.w; H = box.h;
  VIEW.winW = winW; VIEW.winH = winH;
  VIEW.w = W; VIEW.h = H;
  VIEW.x = Math.round((winW - W) / 2);
  VIEW.y = Math.round((winH - H) / 2);
  VIEW.boxed = W !== winW || H !== winH;

  // 縁の余白は「窓」の話。板が縁から離れているぶんはもう避ける必要がない。
  SAFE.top = Math.max(0, raw.top - VIEW.y);
  SAFE.left = Math.max(0, raw.left - VIEW.x);
  SAFE.bottom = Math.max(0, raw.bottom - (winH - VIEW.y - H));
  SAFE.right = Math.max(0, raw.right - (winW - VIEW.x - W));

  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = winW * DPR;
  canvas.height = winH * DPR;
  canvas.style.width = winW + 'px';
  canvas.style.height = winH + 'px';
  // HTML のボタン(歯車・ホーム・ポーズ)は窓の角に貼ってある。板が窓より
  //   小さいときは板の角に寄せないと、盤面から離れたところに浮いてしまう。
  if (de.style && typeof de.style.setProperty === 'function') {
    de.style.setProperty('--vt', VIEW.y + 'px');
    de.style.setProperty('--vl', VIEW.x + 'px');
    de.style.setProperty('--vr', (winW - VIEW.x - W) + 'px');
    de.style.setProperty('--vb', (winH - VIEW.y - H) + 'px');
  }

  applyTransform();
  UI = uiScale(W, H);
}

/**
 * 以降の描画をすべて板の左上を原点にする。既存の描画コードは触らずに済む。
 * 毎フレーム掛け直す(main.js のループが取りこぼしを防ぐために呼ぶ)。
 */
export function applyTransform() {
  ctx.setTransform(DPR, 0, 0, DPR, VIEW.x * DPR, VIEW.y * DPR);
}

/** 窓の座標(clientX/clientY)を板の座標に直す。 */
export function toStageX(x) { return x - VIEW.x; }
export function toStageY(y) { return y - VIEW.y; }

/** 板の外(窓いっぱい)に描く。飾りの帯を塗るときだけ使う。 */
export function inWindow(fn) {
  ctx.save();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  fn();
  ctx.restore();
}
