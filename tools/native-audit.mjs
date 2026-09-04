#!/usr/bin/env node
// ============================================================
// tools/native-audit.mjs — ネイティブ化の価値を「台帳」にして再生成する
//
// なぜ要るのか:
//   この判断についてのドキュメントは**すでに3本ある**
//   (native-options / store-readiness / costs)。結論も書いてある。
//   足りないのは数字のほうで、4本目の意見書を足しても何も決まらない。
//
//   このリポジトリは「708回の canvas 呼び出し」「1通2,211バイト」
//   「p95 1.63ms」のように、判断のとなりに実測を置く流儀で書かれている。
//   ネイティブ化の判断だけがそれを持っていなかった。
//
//   ここは src/ を実際に数えて docs/native-value.md を作り直す。
//   コードが変われば数字も変わるので、**古びない**。
//
// 使い方: node tools/native-audit.mjs
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');

const srcFiles = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
const sources = srcFiles.map(f => ({ f, code: fs.readFileSync(path.join(SRC, f), 'utf8') }));
const shell = ['index.html', 'sw.js'].map(f => ({ f, code: fs.readFileSync(path.join(ROOT, f), 'utf8') }));
const all = [...sources, ...shell];

/** src/ と出荷される HTML/SW 全体での出現回数と、出たファイル名。 */
function count(re) {
  let n = 0; const where = [];
  for (const { f, code } of all) {
    const m = code.match(new RegExp(re, 'g'));
    if (m) { n += m.length; where.push(`${f}(${m.length})`); }
  }
  return { n, where };
}

const srcLines = sources.reduce((s, x) => s + x.code.split('\n').length, 0);

// --- いま何を使っていて、何を使っていないか ------------------
const usage = {
  'Canvas 2D の呼び出し': count('ctx\\.[a-zA-Z]'),
  'localStorage': count('localStorage'),
  'navigator.': count('navigator\\.'),
  'requestAnimationFrame': count('requestAnimationFrame'),
  'サービスワーカー': count('serviceWorker'),
};

// ネイティブ側の売りになる API。0 件なら「まだ一度も取りに行っていない」。
const untapped = {
  '触覚(バイブ)': { re: 'navigator\\s*\\.\\s*vibrate', hook: 'ベル取得・コンボ上昇・ボス撃破', apple42: true },
  'プッシュ通知': { re: '\\bNotification\\b|pushManager', hook: 'デイリーチャレンジ / ストリーク', apple42: true },
  '画面スリープ防止': { re: 'wakeLock', hook: '遊んでいるあいだ', apple42: false },
  '全画面': { re: 'requestFullscreen', hook: '没入。PWA では manifest 任せ', apple42: false },
  '画面の向きの固定': { re: 'screen\\s*\\.\\s*orientation', hook: '縦持ちの固定', apple42: false },
  'ゲームパッド': { re: 'getGamepads', hook: 'デスクトップ', apple42: false },
  '課金': { re: '\\bIAP\\b|purchase|checkout|stripe', hook: '無し。ゼロから', apple42: true },
  '解析': { re: 'gtag|analytics|posthog|mixpanel', hook: '意図的に入れていない(src/diag.js:6-10)', apple42: false },
};

const untappedRows = Object.entries(untapped).map(([name, d]) => ({
  name, ...d, n: count(d.re).n,
}));

// --- オフラインの穴（cross-origin は SW がキャッシュしない） ---
const html = shell.find(s => s.f === 'index.html').code;
const crossOrigin = [...html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)]
  .map(m => m[1])
  .filter(u => !u.includes('schema.org'));
const swSkipsCrossOrigin = /url\.origin\s*!==\s*self\.location\.origin/.test(
  shell.find(s => s.f === 'sw.js').code);

// --- 出す前に要る書類（コードでは解決しない） ----------------
const paperwork = [
  ['プライバシーポリシー本文', fs.existsSync(path.join(ROOT, 'docs/privacy.md')), 'docs/privacy.md'],
  ['LICENSE', fs.existsSync(path.join(ROOT, 'LICENSE')), 'LICENSE'],
  ['PWA アイコン一式', fs.existsSync(path.join(ROOT, 'icons/icon-512-maskable.png')), 'icons/'],
  ['ストア規定サイズのスクリーンショット', fs.existsSync(path.join(ROOT, 'store/screenshots')), 'store/screenshots/'],
  ['公開URL（プライバシーポリシーを貼る先）', /https?:\/\/[a-z0-9-]+\.(vercel\.app|github\.io)/i.test(
    fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')), 'README.md'],
];

// --- 出力 ---------------------------------------------------
const L = [];
const yn = b => (b ? '**済**' : '**未**');
L.push('# ネイティブ化の価値 — 台帳');
L.push('');
L.push(`> ${new Date().toISOString().slice(0, 10)} 生成。\`node tools/native-audit.mjs\` で再生成する。**手で書き換えない。**`);
L.push('>');
L.push('> 判断そのものは [native-decision.md](./native-decision.md) にある。ここはその材料。');
L.push(`> 数字は \`src/\`(${srcFiles.length}ファイル・${srcLines}行)・\`index.html\`・\`sw.js\` の実測。`);
L.push('');

L.push('## 1. いま何で出来ているか');
L.push('');
L.push('| | 件数 | どこに |');
L.push('|---|---:|---|');
for (const [k, v] of Object.entries(usage)) L.push(`| ${k} | ${v.n} | ${v.where.slice(0, 4).join(' ')}${v.where.length > 4 ? ' …' : ''} |`);
L.push('');
L.push('> Canvas 2D と DOM でここまで書かれている以上、React Native への移植は');
L.push('> 移植ではなく作り直しになる（→ [native-options.md](./native-options.md)）。');
L.push('> ネイティブに行くなら WebView を包む形しかない。');
L.push('');

L.push('## 2. ネイティブでしか取れないもの — いくつ取りに行っているか');
L.push('');
L.push('| 機能 | いまの実装 | 繋ぐ先 | Apple 4.2 に効くか |');
L.push('|---|---:|---|:--:|');
for (const r of untappedRows) {
  L.push(`| ${r.name} | ${r.n === 0 ? '**0件**' : `${r.n}件`} | ${r.hook} | ${r.apple42 ? '○' : '—'} |`);
}
const zero = untappedRows.filter(r => r.n === 0).length;
L.push('');
L.push(`**${untappedRows.length} 項目のうち ${zero} 項目が 0 件。**`);
L.push('つまり「ネイティブにすると device API が使える」という利点を、');
L.push('**このゲームはまだ一度も取りに行っていない**。');
L.push('包むだけでは、この列は 0 のままで何も増えない。');
L.push('');

L.push('## 3. オフラインの穴');
L.push('');
L.push(`サービスワーカーは cross-origin を素通しする: ${swSkipsCrossOrigin ? '**する**（`sw.js`）' : 'しない'}。`);
L.push(`出荷される HTML が外部から読むもの: **${crossOrigin.length}件**`);
L.push('');
for (const u of crossOrigin) L.push(`- \`${u}\``);
L.push('');
L.push(crossOrigin.length
  ? '> ここだけが初回オフラインでキャッシュに入らない。**同梱すれば Web のまま塞がる**。ネイティブ化の理由にはならない。'
  : '> 外部から読むものは無い。オフラインの穴はこの経路には無い。');
L.push('');

L.push('## 4. 出すのに要る書類（コードでは解決しない）');
L.push('');
L.push('| | 状態 | 置き場所 |');
L.push('|---|---|---|');
for (const [name, ok, where] of paperwork) L.push(`| ${name} | ${yn(ok)} | \`${where}\` |`);
L.push('');

fs.writeFileSync(path.join(ROOT, 'docs/native-value.md'), L.join('\n') + '\n');
console.log('docs/native-value.md を書いた');
console.log(`  ネイティブ機能 ${untappedRows.length} 項目中 ${zero} 項目が未着手`);
console.log(`  オフラインの穴（cross-origin）: ${crossOrigin.length} 件`);
