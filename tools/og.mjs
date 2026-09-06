#!/usr/bin/env node
// ============================================================
// tools/og.mjs — SNS のリンクプレビュー画像(og.png)を作り直す
//
// なぜスクリプトなのか:
//   手で作った画像は必ず腐る。改名したときに実際そうなった
//   —— タイトルもロゴも docs も EMOJI BLASTERS に変えたのに、
//   og.png の中だけ EMOJI DROP ULTIMATE が焼き込まれたまま残り、
//   リンクを貼るたびに旧名が出る状態になっていた。
//   **再生成できる形にしておけば、次の改名でも1コマンドで済む。**
//
//   色と書体はゲーム本体と同じものを使う(src/theme.js の COL と fonts/)。
//   別々に持つと、ここだけ古い配色になる。
//
// 使い方:
//   node tools/og.mjs            # og.png を書き出す
//   node tools/og.mjs --out /tmp/preview.png
//
//   ブラウザは tools/probe が持っている Chromium をそのまま使う。
//   新しい依存は増やさない。
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const outArg = argv.indexOf('--out');
const OUT = outArg >= 0 && argv[outArg + 1] ? path.resolve(argv[outArg + 1]) : path.join(ROOT, 'og.png');

const W = 1200, H = 630;

// src/theme.js から実際の色を読む(重複して持たない)
const theme = await import(pathToFileURL(path.join(ROOT, 'src/theme.js')).href)
  .catch(() => null);
// theme.js は ctx を要求するので、読めないときは同じ値を直に使う
const COL = theme?.COL ?? {
  ink: '#ffffff', sub: '#a8b8d4', gold: '#ffd23f',
  mint: '#4ad6a0', violet: '#b98cff', sky: '#8fd3ff',
};

const HTML = `<!doctype html><meta charset="utf-8">
<style>
  @font-face { font-family:'Baloo 2'; src:url('fonts/Baloo2.woff2') format('woff2'); font-weight:400 800; }
  @font-face { font-family:'Outfit'; src:url('fonts/Outfit.woff2') format('woff2'); font-weight:100 900; }
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{
    background:radial-gradient(120% 140% at 50% -10%, #1b2a5e 0%, #0a0e24 55%, #05050f 100%);
    color:${COL.ink}; font-family:'Outfit',system-ui,sans-serif;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    position:relative;
  }
  /* 星。ゲームの背景と同じ密度感にする */
  .stars{position:absolute;inset:0}
  .stars i{position:absolute;background:#fff;border-radius:50%}
  .row{display:flex;gap:26px;font-size:74px;line-height:1;margin-bottom:26px;filter:drop-shadow(0 6px 18px rgba(0,0,0,.55))}
  h1{
    font-family:'Baloo 2',system-ui,sans-serif; font-weight:800;
    font-size:118px; line-height:1; letter-spacing:-1px;
    background:linear-gradient(180deg, #fff 0%, ${COL.gold} 100%);
    -webkit-background-clip:text; background-clip:text; color:transparent;
    filter:drop-shadow(0 8px 26px rgba(255,210,63,.28));
  }
  p{margin-top:22px;font-size:31px;font-weight:500;color:${COL.sub};letter-spacing:.4px}
  .tags{margin-top:34px;display:flex;gap:14px}
  .tags b{
    font-size:23px;font-weight:600;padding:11px 22px;border-radius:999px;
    display:flex;align-items:center;gap:9px;   /* 絵文字と字がくっつかないように */
    background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.16);
  }
  .t1{color:${COL.gold}} .t2{color:${COL.mint}} .t3{color:${COL.violet}} .t4{color:${COL.sky}}
</style>
<div class="stars" id="s"></div>
<div class="row">\u{1F680} \u{1F431} \u26A1\uFE0F \u{1F984} \u{1F355} \u{1F98D}</div>
<h1>EMOJI BLASTERS</h1>
<p>方向がガラッと変わる絵文字シューティング</p>
<div class="tags">
  <b class="t1">⬆️➡️⬇️⬅️ 方向が変わる</b>
  <b class="t2">👥 最大4人</b>
  <b class="t3">🤖 AIがステージ生成</b>
  <b class="t4">\u{1F324}\uFE0F リアル天気連動</b>
</div>
<script>
  // 星は決定的に置く(生成のたびに絵が変わると差分が読めない)
  let seed = 20260904;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const s = document.getElementById('s');
  for (let i = 0; i < 90; i++) {
    const el = document.createElement('i');
    const r = rnd() * 2 + 0.6;
    el.style.left = (rnd() * ${W}) + 'px';
    el.style.top = (rnd() * ${H}) + 'px';
    el.style.width = el.style.height = r.toFixed(2) + 'px';
    el.style.opacity = (0.15 + rnd() * 0.5).toFixed(2);
    s.appendChild(el);
  }
</script>`;

// --- 描画 ---------------------------------------------------
const probe = path.join(ROOT, 'tools/probe');
if (!fs.existsSync(path.join(probe, 'node_modules'))) {
  console.error('tools/probe の依存が入っていない。先に `cd tools/probe && npm install`');
  process.exit(1);
}
// playwright-core は CommonJS。ESM から読むと名前付きが出ないので default 経由で取る。
const pw = await import(pathToFileURL(path.join(probe, 'node_modules/playwright-core/index.js')).href);
const chromium = pw.chromium || (pw.default && pw.default.chromium);
if (!chromium) { console.error('playwright-core から chromium を取れなかった'); process.exit(1); }
const CHROME = process.env.PROBE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const tmp = path.join(ROOT, '.og-tmp.html');
fs.writeFileSync(tmp, HTML);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: OUT });
} finally {
  await browser.close();
  fs.rmSync(tmp, { force: true });
}
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`${path.relative(ROOT, OUT)} を書いた (${W}x${H}, ${kb}KB)`);
