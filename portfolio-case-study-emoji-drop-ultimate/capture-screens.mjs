// ============================================================
// capture-screens.mjs — media/ のスクリーンショットを撮り直す
//
//   使い方:
//     1) リポジトリのルートで  python3 -m http.server 8899
//     2) どこかで              npm i playwright-core
//     3) node portfolio-case-study-emoji-drop-ultimate/capture-screens.mjs
//
//   Chromium は Playwright 同梱のものを使う(PLAYWRIGHT_BROWSERS_PATH か
//   下の EXE を環境に合わせて書き換える)。ブラウザ以外の依存は playwright-core だけで、
//   リポジトリ本体の「依存ゼロ」は汚さない(この撮影道具はゲームから独立している)。
//
//   画面遷移は src/main.js:17 の window.EDU(デバッグハンドル)を叩いて行う。
//   タップ座標に頼らないので、レイアウトを変えてもこのスクリプトは壊れない。
// ============================================================
import { chromium } from 'playwright-core';

const EXE = process.env.CHROMIUM_EXE || '/opt/pw-browsers/chromium';
const URL = process.env.GAME_URL || 'http://localhost:8899/index.html';
const OUT = new URL('./media/', import.meta.url).pathname;

const PHONE = { width: 393, height: 852 };      // iPhone 相当の縦持ち
const DESKTOP = { width: 1440, height: 900 };
const LANDSCAPE = { width: 852, height: 393 };  // 同じ端末の横持ち

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-gpu'] });

async function open({ viewport = PHONE, locale = 'ja-JP', dpr = 2, mobile = true } = {}) {
  const p = await browser.newPage({
    viewport, locale, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile,
  });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(6500);   // 起動スプラッシュ 2秒 + タイトルの登場アニメ
  return p;
}

const shot = (p, name) => p.screenshot({ path: OUT + name }).then(() => console.log('  ✓', name));

// 撮影中に死なせない。オープニングが出ていたら飛ばす。
const holdOpen = p => p.evaluate(() => setInterval(() => {
  const g = window.EDU.game;
  g.player.inv = true; g.player.invT = 9e9; g.player.dead = false; g.lives = 3;
  if (g.state === 'opening') { g.openBeat = 9; g.openT = 9e5; }
}, 100));

// --- タイトルとキャラクター選択 ---------------------------------
let p = await open({ locale: 'en-US' });
await shot(p, '01-title-en.png');
await p.evaluate(() => { window.EDU.game.state = 'chars'; });
await p.waitForTimeout(1200);
await shot(p, '03-chars-en.png');
await p.close();

// --- 道中とボス戦 -----------------------------------------------
p = await open();
await shot(p, '02-title-ja.png');
await p.evaluate(() => window.EDU.startRun());
await holdOpen(p);
await p.waitForTimeout(14000);
await shot(p, '04-play-ja.png');
await p.evaluate(() => { window.EDU.game.stageTime = 999999; });  // ボスを呼ぶ
await p.waitForTimeout(9000);
await shot(p, '05-boss-ja.png');
await p.close();

// --- 共闘ロビーとオープニング -----------------------------------
p = await open();
await p.evaluate(() => window.EDU.openCoopLobby());
await p.waitForTimeout(2500);
await shot(p, '06-coop-lobby-ja.png');
await p.evaluate(() => {
  const g = window.EDU.game;
  g.state = 'opening'; g.openBeat = 1; g.openT = 400; g.openChapter = 0;
});
await p.waitForTimeout(900);
await shot(p, '07-opening-ja.png');
await p.close();

// --- 横に広い画面(盤面が「板」に収まっていること) ----------------
p = await open({ viewport: DESKTOP, dpr: 1, mobile: false });
await shot(p, '08-desktop-ja.png');
await p.evaluate(() => window.EDU.startRun());
await holdOpen(p);
await p.waitForTimeout(16000);
await shot(p, '12-desktop-play-ja.png');
await p.close();

// --- 縦が短い画面(横持ち) ---------------------------------------
p = await open({ viewport: LANDSCAPE });
await shot(p, '10-landscape-ja.png');
await p.evaluate(() => { window.EDU.game.state = 'chars'; });
await p.waitForTimeout(1500);
await shot(p, '11-landscape-chars-ja.png');
await p.close();

await browser.close();
console.log('done →', OUT);
