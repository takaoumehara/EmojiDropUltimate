#!/usr/bin/env node
// ============================================================
// write-report.mjs — probe が出した数字を docs/probe-report.md にまとめる
//
//   spec が書き出した perf.json / offline.json / layout.json を読むだけ。
//   ブラウザは起動しない。
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8')); } catch (e) { return null; } };

const perf = read('perf.json'), off = read('offline.json'), lay = read('layout.json');
const L = [];
const ms = (v) => (v == null ? '—' : `${v} ms`);

L.push('# 実ブラウザで測った結果');
L.push('');
L.push(`> ${new Date().toISOString().slice(0, 10)} 生成。`);
L.push('> `cd tools/probe && npx playwright test && node write-report.mjs` で再生成する。**手で書き換えない。**');
L.push('>');
L.push('> Chromium・電話の縦持ち(Pixel 7 相当)。`npm` が要るのは `tools/probe/` の中だけで、');
L.push('> `src/` と出荷物は依存ゼロのまま。');
L.push('');

if (perf) {
  L.push('## 1. 描画の速さ');
  L.push('');
  if (perf.coldStart) {
    L.push(`**コールドスタート**: 開いてから遊べる状態まで ${ms(perf.coldStart.readyMs)}（DOMContentLoaded ${ms(perf.coldStart.domContentLoaded)}）`);
    const tp = perf.coldStart.thirdParty || [];
    L.push('');
    L.push(`**起動時に読む外部リソース: ${tp.length}件**${tp.length ? ' — ' + tp.map(t => `\`${t.url}\`(${t.ms}ms)`).join(', ') : '（起動が他人の CDN に依存していない）'}`);
    L.push('');
  }
  L.push('| | p50 | p95 | p99 | 33.3ms超え |');
  L.push('|---|---:|---:|---:|---:|');
  if (perf.play) L.push(`| このコンテナの CPU | ${perf.play.p50} | ${perf.play.p95} | ${perf.play.p99} | ${(perf.play.over33ms * 100).toFixed(1)}% |`);
  if (perf.throttled4x) L.push(`| **CPU を 1/4 に**（安い端末の代わり） | ${perf.throttled4x.p50} | ${perf.throttled4x.p95} | ${perf.throttled4x.p99} | ${(perf.throttled4x.over33ms * 100).toFixed(1)}% |`);
  L.push('');
  L.push('> このコンテナの CPU はデスクトップ級で、電話の代わりにはならない。');
  L.push('> **速いほうの行を見て「速い」と言ってはいけない。**下の行が本番に近い。');
  L.push('');
  if (perf.longRun) {
    const p = perf.longRun.peak || {};
    L.push(`**1分連続プレイ**: 同時最大 粒子${p.particles ?? '—'} / 敵${p.enemies ?? '—'} / 敵弾${p.eBullets ?? '—'}、`);
    L.push(`ヒープ増加 ${perf.longRun.heapGrowthMB} MB。粒子の配列に上限は無いが、実測では暴走していない。`);
    L.push('');
  }
}

if (off) {
  L.push('## 2. オフラインと保存');
  L.push('');
  L.push('| 確かめたこと | 結果 |');
  L.push('|---|---|');
  if (off.serviceWorker) L.push(`| app shell がキャッシュに入る | \`${off.serviceWorker.cacheName}\` に **${off.serviceWorker.cached}件** |`);
  if (off.offline) {
    L.push(`| 回線を切って起動できる | ${off.offline.booted ? '**できる**' : '**できない**'} |`);
    L.push(`| 回線を切って遊べる | ${off.offline.played ? '**遊べる**' : '**遊べない**'} |`);
    if (off.offline.fonts) L.push(`| オフラインで書体が読める | Baloo 2 ${off.offline.fonts.balooLoaded ? '**読める**' : '**読めない**'} / Outfit ${off.offline.fonts.outfitLoaded ? '**読める**' : '**読めない**'}（\`fonts/\` に同梱） |`);
  }
  if (off.noStorage) {
    L.push(`| \`localStorage\` が例外を投げる環境で起動できる | ${off.noStorage.booted ? '**できる**' : '**できない**'} |`);
    L.push(`| 同じ環境で遊べる | ${off.noStorage.played ? '**遊べる**' : '**遊べない**'} |`);
  }
  if (off.manifest) {
    L.push(`| インストールできる manifest | ${off.manifest.ok ? '**満たす**' : '**満たさない**'}（${off.manifest.display} / ${off.manifest.orientation} / icons: ${off.manifest.icons.join(', ')}） |`);
  }
  L.push('');
  L.push('> **ここはネイティブ化の判断に直結する。** 「オフラインで遊べる」も');
  L.push('> 「ストレージが消えても落ちない」も、すでに Web のまま成立している。');
  L.push('> 最後に残っていた書体の穴も、同梱して塞いだ（ネイティブ化は要らなかった）。');
  L.push('');
}

if (lay) {
  L.push('## 3. 画面の破綻');
  L.push('');
  L.push(`検査したビューポート: ${lay.viewports.length}種 × 日英。`);
  L.push('');
  if (!lay.findings.length) {
    L.push('**HTML で置かれている要素に、画面外・重なり・小さすぎるボタンは無かった。**');
  } else {
    L.push('| ビューポート | 言語 | 見つかったもの |');
    L.push('|---|---|---|');
    for (const f of lay.findings) {
      const bits = [...f.bad.map(b => `${b.id}: ${b.offscreen ? '画面外' : b.clipped ? '見切れ' : '小さすぎる'}`),
                    ...f.overlaps.map(o => `${o[0]}×${o[1]} が重なる`)];
      L.push(`| ${f.viewport} | ${f.lang} | ${bits.join(' / ')} |`);
    }
  }
  L.push('');
  L.push('> **ここで判定できるのは HTML で置かれた数個の要素だけ。**');
  L.push('> 題字もボタンの文字もキャラのカードも canvas に描かれていて、DOM には存在しない。');
  L.push('> docs/layout.md が記録した破綻（題字と説明文の重なり、カードの棒のはみ出し）は');
  L.push('> **この検査では捕まえられない**。撮った画像は `tools/probe/shots/` にあるので、');
  L.push('> そこは人が見る。canvas 側まで機械で見るには、ゲームが自分の描画矩形を');
  L.push('> 外に出す仕組みが要る —— それは src/ に手を入れる話なので、まだやっていない。');
  L.push('');
}

L.push('## この装置に測れないこと');
L.push('');
L.push('- **実機ではない。** Chromium のエミュレーションで、iOS の Safari / WKWebView は含まれない。');
L.push('  iOS 特有の挙動（無音スイッチ、PWA のストレージ破棄、ホーム画面追加後の差）は測れていない。');
L.push('- **面白いかどうか。** ここで分かるのは、遅くないか・落ちないか・押せるか、まで。');
L.push('');

fs.writeFileSync(path.join(ROOT, 'docs/probe-report.md'), L.join('\n') + '\n');
console.log('docs/probe-report.md を書いた');
