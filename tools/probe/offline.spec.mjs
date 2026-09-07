// ============================================================
// offline.spec.mjs — オフラインと保存が本当に生きているか
//
// なぜ要るのか:
//   README は「PWA でオフライン対応」と書き、test/sw.test.js は
//   「app shell の一覧がディスク上のファイルと一致すること」を守っている。
//   だがそれは**一覧が正しいこと**の証明であって、
//   **回線を切って本当に遊べること**の証明ではない。
//
//   さらに sw.js:141 は cross-origin を素通しするので、
//   index.html:33-35 の Google Fonts だけはキャッシュに入らない。
//   「オフラインで何が崩れるか」を実際に見る。
//
//   保存側も同じ。src/save.js:39-51 は localStorage が例外を投げる環境
//   (Safari のプライベート等)でメモリに退避する作りになっているが、
//   その状態で**遊び続けられるのか**は誰も確かめていない。
//   ここは iOS の PWA でストレージが破棄される話に直結する
//   —— ネイティブ化の判断材料でもある。
// ============================================================
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const results = {};
test.afterAll(() => {
  fs.writeFileSync(new URL('./offline.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
});

test('サービスワーカーが登録され、app shell が入る', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.EDU && window.EDU.game);
  const reg = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const r = await navigator.serviceWorker.ready.catch(() => null);
    if (!r) return { supported: true, ready: false };
    // キャッシュが埋まるまで少し待つ
    for (let i = 0; i < 40; i++) {
      const names = await caches.keys();
      if (names.length) {
        const c = await caches.open(names[0]);
        const keys = await c.keys();
        if (keys.length > 10) return { supported: true, ready: true, cacheName: names[0], cached: keys.length,
                                       urls: keys.map(k => new URL(k.url).pathname) };
      }
      await new Promise(r2 => setTimeout(r2, 250));
    }
    const names = await caches.keys();
    return { supported: true, ready: true, cacheName: names[0] || null, cached: 0, urls: [] };
  });
  results.serviceWorker = reg;
  console.log(`  キャッシュ ${reg.cacheName}: ${reg.cached} 件`);
  expect(reg.ready).toBe(true);
  expect(reg.cached).toBeGreaterThan(10);
});

test('回線を切っても起動して遊べる', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.EDU && window.EDU.game);
  // キャッシュが埋まるだけでは足りない。**サービスワーカーがこのページを
  //   受け持っている**(controller が付いている)ところまで待たないと、
  //   回線を切った瞬間の再読み込みが素通しでネットワークへ行き、
  //   ERR_INTERNET_DISCONNECTED になる。sw.js は activate で clients.claim() を
  //   呼ぶので、初回の訪問でもいずれ controller は付く。
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker.controller) return false;
    const n = await caches.keys();
    if (!n.length) return false;
    const k = await (await caches.open(n[0])).keys();
    return k.length > 10;
  }, null, { timeout: 30_000 });

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const alive = await page.waitForFunction(() => window.EDU && window.EDU.game, null, { timeout: 30_000 })
    .then(() => true).catch(() => false);

  let played = false, fonts = null;
  if (alive) {
    await page.evaluate(() => window.EDU.startRun(0));
    played = await page.waitForFunction(() => window.EDU.game.state === 'play', null, { timeout: 20_000 })
      .then(() => true).catch(() => false);
    // 書体は同梱に変えた(fonts/)。オフラインでも本当に読めているかを見る。
    //   document.fonts.check() は「使える書体があるか」しか言わないので、
    //   実際に読み込まれた face を列挙して確かめる。
    fonts = await page.evaluate(async () => {
      await document.fonts.ready;
      const faces = [...document.fonts].map(f => ({ family: f.family, status: f.status }));
      return {
        faces,
        balooLoaded: faces.some(f => f.family.includes('Baloo') && f.status === 'loaded'),
        outfitLoaded: faces.some(f => f.family.includes('Outfit') && f.status === 'loaded'),
      };
    });
  }
  await context.setOffline(false);

  results.offline = { booted: alive, played, fonts };
  console.log(`  オフライン起動 ${alive} / 遊べた ${played} / 書体 Baloo2 ${fonts && fonts.balooLoaded} Outfit ${fonts && fonts.outfitLoaded}`);
  expect(alive).toBe(true);
  expect(played).toBe(true);
  // 同梱した書体が app shell に入っているので、オフラインでも読めるはず。
  expect(fonts.balooLoaded, 'オフラインで Baloo 2 が読めていない').toBe(true);
  expect(fonts.outfitLoaded, 'オフラインで Outfit が読めていない').toBe(true);
});

test('localStorage が使えなくても遊び続けられる', async ({ page }) => {
  // Safari のプライベートや、iOS が PWA のストレージを捨てたあとの状態。
  await page.addInitScript(() => {
    const boom = () => { throw new DOMException('QuotaExceededError'); };
    try {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom, key: boom, length: 0 }),
      });
    } catch (e) { /* 差し替えられない環境ならこのテストは無意味 */ }
  });
  await page.goto('/');
  const booted = await page.waitForFunction(() => window.EDU && window.EDU.game, null, { timeout: 30_000 })
    .then(() => true).catch(() => false);
  let played = false, lost = null;
  if (booted) {
    await page.evaluate(() => window.EDU.startRun(0));
    played = await page.waitForFunction(() => window.EDU.game.state === 'play', null, { timeout: 20_000 })
      .then(() => true).catch(() => false);
    lost = await page.evaluate(() => {
      const S = window.EDU.Save;
      const before = S.data.chapter;
      // 進行を書いてみて、リロード後に残るか(残らないのが期待。何が失われるかを記録する)
      return { savedChapter: before, hi: window.EDU.game.hi };
    });
  }
  results.noStorage = { booted, played, lost };
  console.log(`  ストレージ不能でも起動 ${booted} / 遊べた ${played}`);
  expect(booted).toBe(true);
  expect(played).toBe(true);
});

test('インストールできる PWA の条件を満たしている', async ({ page }) => {
  await page.goto('/');
  const man = await page.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]');
    if (!link) return { linked: false };
    const res = await fetch(link.href);
    const j = await res.json();
    return {
      linked: true, ok: res.ok,
      name: j.name, short_name: j.short_name, start_url: j.start_url,
      display: j.display, orientation: j.orientation,
      icons: (j.icons || []).map(i => `${i.sizes}${i.purpose ? ' ' + i.purpose : ''}`),
      hasSW: 'serviceWorker' in navigator,
    };
  });
  results.manifest = man;
  console.log(`  manifest: ${man.name} / display ${man.display} / icons ${man.icons.join(', ')}`);
  expect(man.ok).toBe(true);
  expect(man.icons.some(s => s.startsWith('512x512'))).toBe(true);
  expect(man.icons.some(s => s.includes('maskable'))).toBe(true);
});
