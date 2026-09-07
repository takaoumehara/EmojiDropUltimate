#!/usr/bin/env node
// ============================================================
// copy-web.mjs — ゲーム本体を native/www/ へ写す
//
// なぜスクリプトが要るのか:
//   このゲームには**ビルド工程が無い**。配るものはリポジトリのファイルそのもの。
//   Capacitor は「webDir を丸ごとアプリに埋める」ので、素直に指すと
//   docs/ も test/ も tools/ も server/ も .git も入ってしまう。
//   要るものだけを白名簿で写す。
//
//   白名簿にしているのは、黒名簿だと**新しく足したフォルダが黙って混入する**から。
//   アプリの中身は小さく、説明できる状態に保つ。
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'www');

// アプリに入れるもの。これ以外は入らない。
const FILES = ['index.html', 'manifest.webmanifest', 'og.png'];
const DIRS = ['src', 'icons', 'fonts'];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let n = 0;
for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) { console.error(`  ない: ${f}`); process.exit(1); }
  fs.copyFileSync(src, path.join(OUT, f)); n++;
}
for (const d of DIRS) {
  const src = path.join(ROOT, d);
  if (!fs.existsSync(src)) { console.error(`  ない: ${d}/`); process.exit(1); }
  copyDir(src, path.join(OUT, d));
  n += fs.readdirSync(src).length;
}

// サービスワーカーは**入れない**。
//   アプリの中身は端末に埋まっていて、そもそもネットワークから読まない。
//   SW を残すと「キャッシュのキャッシュ」になり、更新の筋道が二重になる。
//   → index.html の登録も外す(下)。
const idx = path.join(OUT, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
const before = html.length;
html = html.replace(/navigator\.serviceWorker\.register\([^)]*\)/g, 'Promise.resolve()');
fs.writeFileSync(idx, html);

console.log(`native/www へ ${n} 件を写した${html.length !== before ? '（サービスワーカーの登録は外した）' : ''}`);
