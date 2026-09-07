// ============================================================
// layout.spec.mjs — 画面が壊れていないかを、実際に並べて見る
//
// なぜ要るのか:
//   docs/layout.md は「11ビューポート × 13画面 × 日英で実測した」と書いている。
//   そのとき見つかったのは、題字と説明文の重なり・ボタンの主文と副文の重なり・
//   カードの棒のはみ出し・ロビーの下端切れ —— **電話の縦持ち以外がほぼ全部**だった。
//   だがその装置はコミットされていない。同じ壊れ方をしても、もう誰も気づけない。
//
// 何を機械が判定し、何を人が見るか（ここを正直に分ける）:
//   このゲームの画面は**ほとんどが canvas に描かれている**。
//   題字も、ボタンの文字も、キャラのカードも、DOM 上には存在しない。
//   だから getBoundingClientRect() で重なりを判定できるのは、
//   HTML で置かれている数個の要素（歯車・ホーム・ポーズ・設定パネル・
//   あいことば入力・ホーム画面追加の案内）だけ。
//
//   → **DOM で置かれているものは機械が判定する**（画面外・重なり・押せない大きさ）
//   → **canvas に描かれているものはスクリーンショットを撮って人が見る**
//
//   canvas 側まで機械で判定するには、ゲームが自分の描画矩形を
//   外に出す仕組みが要る。それは src/ に手を入れる話なので、ここではやらない。
// ============================================================
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// docs/layout.md が実測に使った並び。電話の縦持ち以外が壊れていた。
const VIEWPORTS = [
  ['phone-small', 360, 640],
  ['phone-se-chrome', 375, 553],
  ['phone-15pro-chrome', 393, 665],
  ['phone-15pro', 393, 852],
  ['phone-max', 430, 932],
  ['phone-landscape', 852, 393],   // 横持ち: 縦が短い。ここが一番壊れていた
  ['tablet', 820, 1180],
  ['desktop', 1920, 1080],
];

const SHOTS = new URL('./shots/', import.meta.url);
const findings = [];

test.beforeAll(() => { fs.mkdirSync(SHOTS, { recursive: true }); });
test.afterAll(() => {
  fs.writeFileSync(new URL('./layout.json', import.meta.url),
    JSON.stringify({ viewports: VIEWPORTS.map(v => v[0]), findings }, null, 2) + '\n');
});

/** 押せる大きさ（Apple HIG 44pt / Material 48dp。ここは緩めに 40）。 */
const MIN_TAP = 40;

for (const [name, width, height] of VIEWPORTS) {
  for (const lang of ['ja', 'en']) {
    test(`${name} ${width}x${height} / ${lang}`, async ({ browser }) => {
      const ctx = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 2, isMobile: width < 700, hasTouch: true,
        locale: lang === 'ja' ? 'ja-JP' : 'en-US',
      });
      const page = await ctx.newPage();
      await page.addInitScript((l) => {
        try { localStorage.setItem('edu_lang', l); } catch (e) {}
      }, lang);
      await page.goto('/');
      await page.waitForFunction(() => window.EDU && window.EDU.game, null, { timeout: 30_000 });
      await page.waitForTimeout(600);   // タイトルの立ち上がり

      // --- DOM で置かれている要素だけを機械で判定する ---
      const probe = await page.evaluate((min) => {
        const ids = ['homeBtn', 'pauseBtn', 'setBtn', 'setPanel', 'pwaNudge', 'joinForm'];
        const vw = window.innerWidth, vh = window.innerHeight;
        const out = [];
        for (const id of ids) {
          const el = document.getElementById(id);
          if (!el) { out.push({ id, missing: true }); continue; }
          const cs = getComputedStyle(el);
          const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01;
          const r = el.getBoundingClientRect();
          out.push({
            id, shown,
            rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            offscreen: shown && (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh),
            clipped: shown && (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1),
            tooSmall: shown && el.tagName === 'BUTTON' && (r.width < min || r.height < min),
          });
        }
        // 見えている要素どうしが重なっていないか
        const vis = out.filter(o => o.shown && o.rect && o.rect.w > 0);
        const overlaps = [];
        for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
          const a = vis[i].rect, b = vis[j].rect;
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 2 && oy > 2) overlaps.push([vis[i].id, vis[j].id, ox * oy]);
        }
        return { vw, vh, out, overlaps, canvas: (() => {
          const c = document.getElementById('c');
          const r = c.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height), attrW: c.width, attrH: c.height };
        })() };
      }, MIN_TAP);

      // --- 人が見るためのスクリーンショット ---
      for (const [screen, go] of [
        ['title', null],
        ['settings', async () => { await page.locator('#setBtn').click(); await page.waitForTimeout(300); }],
      ]) {
        if (go) await go();
        await page.screenshot({ path: path.join(SHOTS.pathname, `${name}-${lang}-${screen}.png`) });
      }

      const bad = probe.out.filter(o => o.offscreen || o.clipped || o.tooSmall);
      if (bad.length || probe.overlaps.length) {
        findings.push({ viewport: name, lang, bad, overlaps: probe.overlaps });
      }

      await ctx.close();

      // 画面の外に出ている / 重なっている HTML 要素は、そのまま押せないバグ。
      expect(probe.out.filter(o => o.offscreen).map(o => o.id), '画面の外に出ている要素').toEqual([]);
      expect(probe.overlaps.map(o => `${o[0]}×${o[1]}`), '重なっている要素').toEqual([]);
      expect(probe.out.filter(o => o.tooSmall).map(o => o.id), `${MIN_TAP}px 未満の押せないボタン`).toEqual([]);
    });
  }
}
