// ============================================================
// screenshots.mjs — 本物のブラウザで「あそびかた」を撮って、目で確かめる
//
// なぜ要るのか:
//   test/ のキャンバスは何もしない偽物なので、「例外を出さずに描き切った」
//   ことしか証明できない。**読めるかどうかは一切分からない。**
//
//   実際、自動テストが全部緑のまま、この道具で撮って初めて3つ見つかった:
//     1. 見出しの絵文字がタイトルに重なっていた
//     2. 日本語の本文から一節が消えていた(文中の半角スペース1個が原因で
//        折り返しが単語モードに切り替わり、はみ出したぶんが画面外へ出ていた)
//     3. それを直した拍子に、英語の "carries a cost" が "carriesa cost" になった
//
//   1〜3はどれも例外を出さない。**描いて見るまで誰も気づかない種類の壊れ方**で、
//   だからこの道具は残してある。
//
// 使い方(playwright はこのリポジトリの依存ではないので、その場で入れる):
//   npm i -D playwright
//   python3 -m http.server 8099 &
//   node tools/screenshots.mjs [出力先ディレクトリ]
//
// 出るもの: help-<端末>-<言語>-<ページ>.png / pause-<端末>.png / title-<端末>.png
//   と、実際にボタンを押した結果のログ(押せたか・遷移したか・44pt あるか)。
// ============================================================

import { chromium } from 'playwright';

const OUT = process.argv[2] || '.';
const URL = process.env.SHOT_URL || 'http://localhost:8099/index.html';
// Playwright が入れた Chromium。版が変わるとフォルダ名も変わるので拾い直す。
const EXE = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

// 狭い順。iPhone SE(375×667) が一番きつく、ここで壊れなければまず大丈夫。
const SCREENS = [[375, 667, 'se'], [390, 844, 'p14'], [820, 1180, 'tab']];

const log = [];
const say = s => { log.push(s); console.log(s); };

// 板の座標 → 画面の座標。板は窓の中で中央に置かれるので VIEW のぶんずれる。
const btnAt = (pg, id) => pg.evaluate(id => {
  const b = window.EDU.game.menuBtns.find(x => x.id === id), V = window.EDU.VIEW;
  return b ? { cx: b.x + b.w / 2 + V.x, cy: b.y + b.h / 2 + V.y, w: b.w, h: b.h } : null;
}, id);

const browser = await chromium.launch({ executablePath: EXE });
for (const [w, h, tag] of SCREENS) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => say(`!! ${tag}: ページで例外 — ${e.message}`));
  await pg.goto(URL, { waitUntil: 'domcontentloaded' });
  await pg.waitForTimeout(2200);
  await pg.evaluate(() => window.EDU.toTitle());     // スプラッシュ/オープニングを飛ばす
  await pg.waitForTimeout(600);

  // タイトルの「あそびかた」を **実際に押す**。座標を計算するだけでは、
  //   押せない場所にボタンがあっても気づけない。
  const b = await btnAt(pg, 'help');
  if (!b) say(`!! ${tag}: タイトルにあそびかたが無い`);
  else {
    // 指の当たる最小は 44pt。下回ると「押したのに反応しない」が起きる。
    say(`${tag}: ボタンの高さ ${b.h.toFixed(1)}px ${b.h >= 44 ? '✓' : '← 44pt を割っている'}`);
    await pg.mouse.click(b.cx, b.cy); await pg.waitForTimeout(350);
    const st = await pg.evaluate(() => window.EDU.game.state);
    say(`${tag}: 押した後 = ${st} ${st === 'help' ? '✓' : '← 開いていない'}`);
  }

  // ▶ で最後までめくれるか
  for (let i = 0; i < 4; i++) {
    const n = await btnAt(pg, 'helpNext');
    if (!n) { say(`!! ${tag}: ${i}ページ目で ▶ が消えた`); break; }
    await pg.mouse.click(n.cx, n.cy); await pg.waitForTimeout(250);
  }
  say(`${tag}: 4回めくって page=${await pg.evaluate(() => window.EDU.game.helpPage)} (4なら正)`);

  for (const lang of ['a', 'b']) {                   // 端末の言語しだいで日英どちらが先かは変わる
    for (let i = 0; i < 5; i++) {
      await pg.evaluate(i => { const g = window.EDU.game; g.state = 'help'; g.helpPage = i; g.helpReturn = 'title'; }, i);
      await pg.waitForTimeout(160);
      await pg.screenshot({ path: `${OUT}/help-${tag}-${lang}-${i}.png` });
    }
    await pg.evaluate(() => { window.EDU.game.state = 'title'; });
    await pg.keyboard.press('l'); await pg.waitForTimeout(200);
  }

  // 一時停止から開いて、閉じたら一時停止に戻るか(遊びの途中で開く人の経路)
  await pg.evaluate(() => { const g = window.EDU.game; g.state = 'pause'; g.pausedFrom = 'play'; });
  await pg.waitForTimeout(220);
  await pg.screenshot({ path: `${OUT}/pause-${tag}.png` });
  const pb = await btnAt(pg, 'help');
  if (!pb) say(`!! ${tag}: 一時停止にあそびかたが無い`);
  else {
    await pg.mouse.click(pb.cx, pb.cy); await pg.waitForTimeout(300);
    say(`${tag}: 一時停止 → ${await pg.evaluate(() => window.EDU.game.state)}`);
    const cb = await btnAt(pg, 'helpClose');
    if (cb) {
      await pg.mouse.click(cb.cx, cb.cy); await pg.waitForTimeout(300);
      const back = await pg.evaluate(() => window.EDU.game.state);
      say(`${tag}: とじる → ${back} ${back === 'pause' ? '✓' : '← 一時停止に戻っていない'}`);
    }
  }
  await pg.screenshot({ path: `${OUT}/title-${tag}.png` });
  await ctx.close();
}
await browser.close();

const bad = log.filter(l => l.startsWith('!!') || l.includes('←'));
console.log(bad.length ? `\n${bad.length}件おかしい` : '\nぜんぶ通った');
process.exit(bad.length ? 1 : 0);
