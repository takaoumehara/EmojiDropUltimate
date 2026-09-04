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
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

// ============================================================
// 書体を自分で配っていること
//
//   もともと <head> で Google Fonts を rel="stylesheet" で読んでいた。
//   これは2つの意味で効いていた:
//     1. **描画をブロックする。** third-party の CDN が返るまでゲームが動けない。
//        実測(Playwright)では、その1本が返るのを 12.4秒待って
//        DOMContentLoaded ごと止まっていた(秒数は環境固有だが、
//        third-party が起動の一本道に居るという形そのものが問題)。
//     2. **オフラインでキャッシュされない。** sw.js は cross-origin を素通しする
//        (そうしないと api/ まで巻き込む)ので、この1本だけ毎回取りに行っていた。
//
//   同梱に戻したので、その両方が閉じている。ここで釘を打っておかないと、
//   誰かがまた <head> に CDN の1行を足したときに黙って戻る。
// ============================================================

test('index.html は書体を外から読んでいない', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const external = [...html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(external, [],
    `出荷される HTML が外部から読んでいる: ${external.join(', ')}\n` +
    '  → 起動が third-party 任せになり、オフラインでもキャッシュされない');
});

test('同梱した書体が app shell に入っている', () => {
  for (const must of ['/fonts/fonts.css', '/fonts/Baloo2.woff2', '/fonts/Outfit.woff2']) {
    assert.ok(sw.includes(`'${must}'`), `${must} が APP_SHELL に無い(オフラインで書体が落ちる)`);
  }
});

test('app shell に挙げた書体のファイルが実在する', () => {
  const listedFonts = (sw.match(/'\/fonts\/[^']+'/g) || []).map(s => s.replace(/'/g, ''));
  assert.ok(listedFonts.length >= 3, '書体が一覧に入っていない');
  for (const f of listedFonts) {
    assert.ok(existsSync(join(ROOT, f.slice(1))), `sw.js に在るが実在しない: ${f}`);
  }
});

test('fonts.css が参照する書体ファイルが実在する', () => {
  const css = readFileSync(join(ROOT, 'fonts/fonts.css'), 'utf8');
  const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map(m => m[1]);
  assert.ok(urls.length >= 2, `@font-face が足りない (${urls.length})`);
  for (const u of urls) {
    assert.ok(!/^https?:/.test(u), `fonts.css が外部を参照している: ${u}`);
    assert.ok(existsSync(join(ROOT, 'fonts', u)), `fonts.css が指すファイルが無い: ${u}`);
  }
});
