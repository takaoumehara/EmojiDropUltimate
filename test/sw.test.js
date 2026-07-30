// ============================================================
// sw.test.js — サービスワーカーの取りこぼし
//
// sw.js は「これが無いとゲームが起動しない一式」を **手で並べて** 持っている。
// モジュールを1つ足すたびにここへ書き足す必要があるが、書き忘れても
// オンラインでは動いてしまう(/src/*.js は network-first なので)。
// 気づくのは **電波が悪いときとホーム画面から開いたとき** —— つまり
// 子供が実際に遊ぶ場面で、しかもゲームが丸ごと起動しなくなる。
//
// 実際に story.js・tether.js・super.js・wstransport.js・diag.js の5本が
// 抜けていた。人が覚えておく話ではないので、機械に見張らせる。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');

/** sw.js が列挙している /src/*.js */
function listed() {
  return (sw.match(/'\/src\/[^']+\.js'/g) || []).map(s => s.replace(/'/g, ''));
}
/** 実際に存在する src/*.js */
function actual() {
  return readdirSync(join(ROOT, 'src')).filter(f => f.endsWith('.js')).map(f => '/src/' + f);
}

test('sw.js の一覧と src の中身が一致している', () => {
  const L = new Set(listed()), A = new Set(actual());
  const missing = [...A].filter(f => !L.has(f)).sort();
  const extra = [...L].filter(f => !A.has(f)).sort();
  assert.deepEqual(missing, [],
    `sw.js の APP_SHELL に足りない: ${missing.join(', ')}\n` +
    '  → 足したうえで VERSION も上げること(上げないと既存の端末は古い一式を持ち続ける)');
  assert.deepEqual(extra, [], `sw.js に在るが実在しないファイル: ${extra.join(', ')}`);
});

test('起動に要るファイルが一覧に入っている', () => {
  const L = listed();
  for (const must of ['/src/main.js', '/src/engine.js', '/src/render.js', '/src/state.js', '/src/config.js']) {
    assert.ok(L.includes(must), `${must} が無いとゲームが起動しない`);
  }
  for (const must of ['/index.html', '/manifest.webmanifest']) {
    assert.ok(sw.includes(`'${must}'`), `${must} が一覧に無い`);
  }
});

test('index.html が読み込むモジュールは全部一覧に入っている', () => {
  // 入口から辿れるものが1本でも欠けると、オフラインで真っ白になる。
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const entries = [...html.matchAll(/(?:src|href)="\.?\/?(src\/[^"]+\.js)"/g)].map(m => '/' + m[1]);
  assert.ok(entries.length > 0, 'index.html からモジュールを1つも読み取れないのは検査の誤り');
  const L = new Set(listed());
  for (const e of entries) assert.ok(L.has(e), `index.html が読む ${e} が sw.js に無い`);
});

test('/api/* はキャッシュしない(合言葉の交換が古い返事で壊れる)', () => {
  assert.match(sw, /isApiRequest\(url\)\)\s*return/, '/api/* は素通しであること');
});

test('VERSION が付いていて、キャッシュ名に使われている', () => {
  const m = sw.match(/const VERSION = '([^']+)'/);
  assert.ok(m, 'VERSION が読み取れること');
  assert.match(sw, /\$\{VERSION\}-shell/, 'shell キャッシュ名に VERSION が入ること');
  assert.match(sw, /\$\{VERSION\}-runtime/, 'runtime キャッシュ名に VERSION が入ること');
  // 古いキャッシュを捨てる処理があること(無いと VERSION を上げても意味がない)
  assert.match(sw, /caches\.delete/, '古いキャッシュを消す処理があること');
});
