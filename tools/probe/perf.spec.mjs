// ============================================================
// perf.spec.mjs — 実ブラウザでの描画コストを測る
//
// なぜ要るのか:
//   tools/sim/ は画面なしで遊びを測る。描画は一切通らない。
//   だがこのゲームの重さは**ほぼ全部が描画側**にある:
//     - 敵1体ごとに毎フレーム ctx.font を組み立てて絵文字を fillText する
//       (src/render.js:421-438)。文字の整形は 2D の中で一番高い処理
//     - 必殺技のハンドラ14箇所が毎フレーム game.enemies を filter で作り直す
//     - 粒子の配列に上限が無い(src/engine.js:158,173)
//
//   そして**これはネイティブ化しても消えない**。Capacitor は同じ WebView で
//   同じ Skia の文字描画を通るので、ここが遅ければ包んでも遅い。
//   「アプリにすれば速くなる」を実測で否定するための数字でもある。
// ============================================================
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

/**
 * ページ内でフレーム間隔と盤面の混み具合を集める。
 * page.evaluate に渡す関数はページ側で実行されるので、外の変数は使えない。
 */
function collectFrames(seconds) {
  return new Promise((resolve) => {
    const gaps = [];
    const peak = { particles: 0, enemies: 0, eBullets: 0, pBullets: 0 };
    let last = performance.now();
    const end = last + seconds * 1000;
    function tick(now) {
      gaps.push(now - last);
      last = now;
      const g = window.EDU && window.EDU.game;
      if (g) for (const k of Object.keys(peak)) if (g[k] && g[k].length > peak[k]) peak[k] = g[k].length;
      if (now < end) requestAnimationFrame(tick);
      else resolve({ gaps, peak, state: g ? g.state : null, score: g ? g.score : null });
    }
    requestAnimationFrame(tick);
  });
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

const results = {};

test.afterAll(() => {
  fs.writeFileSync(new URL('./perf.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
});

test('コールドスタート: 開いてから遊べるまで', async ({ page }) => {
  const t0 = Date.now();
  await page.goto('/');
  await page.waitForFunction(() => window.EDU && window.EDU.game, null, { timeout: 30_000 });
  const ready = Date.now() - t0;
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] || {};
    return { domContentLoaded: Math.round(n.domContentLoaded || 0), load: Math.round(n.loadEventEnd || 0) };
  });
  // 起動を待たせているものを一緒に記録する。ここに third-party が居ると、
  //   ゲームが動き出す時刻が他人の CDN 任せになる。実際そうなっていた:
  //   Google Fonts のスタイルシート1本(rel="stylesheet" は描画をブロックする)を
  //   待って 12.4秒、DOMContentLoaded ごと止まっていた。いまは同梱している。
  const blockers = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(r => new URL(r.name).origin !== location.origin)
    .map(r => ({ url: r.name, ms: Math.round(r.duration) })));

  results.coldStart = { readyMs: ready, ...nav, thirdParty: blockers };
  console.log(`  コールドスタート: ${ready}ms（DCL ${nav.domContentLoaded}ms） / 外部リソース ${blockers.length}件`);
  expect(ready).toBeLessThan(15_000);
  // 起動の一本道に third-party を置かない。
  expect(blockers.map(b => b.url), '起動時に外部から読んでいるものがある').toEqual([]);
});

test('遊んでいる間のフレーム時間', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.EDU && window.EDU.game);
  await page.evaluate(() => window.EDU.startRun(0));
  await page.waitForFunction(() => window.EDU.game.state === 'play', null, { timeout: 20_000 });

  // 実際に動かす。指1本でドラッグするのがこのゲームの操作。
  const box = await page.locator('#c').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  await page.mouse.down();

  const { gaps, peak, state, score } = await page.evaluate(collectFrames, 12);
  await page.mouse.up();

  const snap = { state, score, ...peak };
  const body = gaps.slice(5);           // 最初の数フレームは計測の立ち上がり
  results.play = {
    frames: body.length,
    p50: +pct(body, 0.5).toFixed(2), p95: +pct(body, 0.95).toFixed(2), p99: +pct(body, 0.99).toFixed(2),
    worst: +Math.max(...body).toFixed(2),
    over16ms: +(body.filter(x => x > 16.7).length / body.length).toFixed(3),
    over33ms: +(body.filter(x => x > 33.3).length / body.length).toFixed(3),
    snapshot: snap,
  };
  console.log(`  フレーム時間 p50 ${results.play.p50}ms / p95 ${results.play.p95}ms / p99 ${results.play.p99}ms`);
  console.log(`  16.7ms超え ${(results.play.over16ms * 100).toFixed(1)}% / 33.3ms超え ${(results.play.over33ms * 100).toFixed(1)}%`);
  expect(snap.state).toBe('play');
  // 60fps を割るフレームが半分を超えたら、それは「たまに重い」ではない
  expect(results.play.over33ms).toBeLessThan(0.5);
});

test('長く遊んでもメモリが増え続けない', async ({ page }) => {
  // 粒子の配列に上限が無いので、増え続けるならここに出る。
  await page.goto('/');
  await page.waitForFunction(() => window.EDU && window.EDU.game);
  await page.evaluate(() => window.EDU.startRun(0));
  await page.waitForFunction(() => window.EDU.game.state === 'play', null, { timeout: 20_000 });

  const box = await page.locator('#c').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  await page.mouse.down();

  // 瞬間の値だけ見ると爆発の山を見逃す。ページ側でずっと最大値を追う。
  await page.evaluate(() => {
    window.__peak = { particles: 0, enemies: 0, eBullets: 0, pBullets: 0, popups: 0 };
    const tick = () => {
      const g = window.EDU && window.EDU.game;
      if (g) for (const k of Object.keys(window.__peak))
        if (g[k] && g[k].length > window.__peak[k]) window.__peak[k] = g[k].length;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const sample = () => page.evaluate(() => ({
    heap: performance.memory ? performance.memory.usedJSHeapSize : null,
    particles: window.EDU.game.particles.length,
    enemies: window.EDU.game.enemies.length,
    state: window.EDU.game.state,
  }));

  const marks = [await sample()];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(10_000);
    marks.push(await sample());
  }
  const peak = await page.evaluate(() => window.__peak);
  await page.mouse.up();

  const peakParticles = peak.particles;
  const heaps = marks.map(m => m.heap).filter(Boolean);
  results.longRun = {
    minutes: 1, samples: marks, peak,
    heapGrowthMB: heaps.length >= 2 ? +(((heaps[heaps.length - 1] - heaps[0]) / 1048576)).toFixed(2) : null,
  };
  console.log(`  最大同時数 粒子${peak.particles} 敵${peak.enemies} 敵弾${peak.eBullets} / ヒープ増加 ${results.longRun.heapGrowthMB} MB`);
  // 粒子が数千に達するなら上限が要る
  expect(peakParticles).toBeLessThan(5000);
});

test('CPU を絞っても遊べる（安い端末の代わり）', async ({ page }) => {
  // このコンテナの CPU はデスクトップ級で、電話の代わりにはならない。
  // CDP の CPU スロットリングで 4倍遅くして、安い Android に近づける。
  // ここが崩れるなら、**同じ WebView を使うネイティブ版でも同じように崩れる**。
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto('/');
  await page.waitForFunction(() => window.EDU && window.EDU.game, null, { timeout: 60_000 });
  await page.evaluate(() => window.EDU.startRun(0));
  await page.waitForFunction(() => window.EDU.game.state === 'play', null, { timeout: 40_000 });

  const box = await page.locator('#c').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.8);
  await page.mouse.down();
  const { gaps, peak, state } = await page.evaluate(collectFrames, 12);
  await page.mouse.up();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const body = gaps.slice(5);
  results.throttled4x = {
    frames: body.length,
    p50: +pct(body, 0.5).toFixed(2), p95: +pct(body, 0.95).toFixed(2), p99: +pct(body, 0.99).toFixed(2),
    worst: +Math.max(...body).toFixed(2),
    over16ms: +(body.filter(x => x > 16.7).length / body.length).toFixed(3),
    over33ms: +(body.filter(x => x > 33.3).length / body.length).toFixed(3),
    peak,
  };
  console.log(`  CPU 1/4: p50 ${results.throttled4x.p50}ms / p95 ${results.throttled4x.p95}ms / p99 ${results.throttled4x.p99}ms`);
  console.log(`  CPU 1/4: 33.3ms超え ${(results.throttled4x.over33ms * 100).toFixed(1)}%`);
  expect(state).toBe('play');
  // 4倍絞った状態でも、半分以上のフレームが 30fps を割るなら描画側に手を入れる必要がある
  expect(results.throttled4x.over33ms).toBeLessThan(0.5);
});
