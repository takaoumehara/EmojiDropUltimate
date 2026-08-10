// ============================================================
// sw.js — EMOJI DROP ULTIMATE service worker
//   方針:
//   - アプリシェル(HTML/manifest/icons/src の全モジュール)は install 時に precache。
//   - ナビゲーションと /src/*.js は network-first: デプロイを即座に反映しつつ、
//     オフライン時は precache/runtime cache にフォールバック。
//   - アイコン等の静的アセットは cache-first。
//   - /api/* は絶対にキャッシュしない。SW は一切介入せず素通しする(常に生きたデータ)。
//   - どんな fetch エラーが起きても投げっぱなしにせず、キャッシュ/ネットワークへ
//     フォールバックする(フェイルセーフ)。
// ============================================================

// バージョンを上げると古い shell キャッシュが捨てられ、precache がやり直される。
//   **モジュールを追加したら必ず上げる。** 上げないと、すでに遊んだ端末は
//   新しいファイルが入っていない古い shell を持ち続ける。
const VERSION = 'edu-v4';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const CURRENT_CACHES = [SHELL_CACHE, RUNTIME_CACHE];

// アプリシェル: これが無いとゲームが起動しないファイル一式。
// src/ 配下は明示的に全列挙(ディレクトリ走査はせず、実ファイルと同期させる)。
const APP_SHELL = [
  '/',
  '/index.html',
  // 顔で遊ぶ実験装置(別ページ)。precache に入れておかないと、オフライン時に
  // ナビゲーションが caches.match('/index.html') へ落ちて、別のゲームが出てしまう。
  // なお /src/face/*.js は isSrcModule() が拾うので network-first になる。
  // **/src/ の外に置くと cache-first になり、新しいコードが永久に届かない。**
  '/face.html',
  '/manifest.webmanifest',
  '/og.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
  '/src/aistage.js',
  '/src/audio.js',
  '/src/bossai.js',
  '/src/config.js',
  '/src/coop.js',
  '/src/diag.js',
  '/src/director.js',
  '/src/engine.js',
  '/src/env.js',
  '/src/geo.js',
  '/src/i18n.js',
  '/src/input.js',
  '/src/leaderboard.js',
  '/src/main.js',
  '/src/qr.js',
  '/src/render.js',
  '/src/save.js',
  '/src/sharecard.js',
  '/src/state.js',
  '/src/story.js',
  '/src/super.js',
  '/src/tether.js',
  '/src/theme.js',
  '/src/ui.js',
  '/src/weather.js',
  '/src/wstransport.js',
  // 顔ゲームのモジュール。**ゆびの経路は外部依存ゼロでオフラインでも遊べる**と
  // 謳っている以上、ここに入っていないとその約束が嘘になる。
  // MediaPipe は CDN から、カメラの許可が下りた後にだけ読むので precache しない。
  '/src/face/main.js',
  '/src/face/game.js',
  '/src/face/signal.js',
  '/src/face/metrics.js',
  '/src/face/audio.js',
  '/src/face/tapsource.js',
  '/src/face/expressions.js',
  // facesource.js 自体は入口の画面から読む(HTTPS かどうかの判定に要る)ので precache する。
  // 中の MediaPipe は import() で CDN から、許可が下りた後にだけ落ちてくる。
  '/src/face/facesource.js',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL_CACHE);
      // 1つの404で install 全体が失敗しないよう、個別に addAll する
      await Promise.all(APP_SHELL.map(async url => {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res && res.ok) await cache.put(url, res.clone());
        } catch (e) { /* オフライン初回インストール等は無視して続行 */ }
      }));
    } catch (e) { /* precache 失敗してもインストール自体は続行させる */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(
        names.filter(n => !CURRENT_CACHES.includes(n)).map(n => caches.delete(n))
      );
    } catch (e) { /* noop */ }
    await self.clients.claim();
  })());
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/');
}

function isSrcModule(url) {
  return url.pathname.startsWith('/src/') && url.pathname.endsWith('.js');
}

// network-first: 生きた最新版を優先し、失敗時のみキャッシュへ。
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      try { await cache.put(request, fresh.clone()); } catch (e) { /* noop */ }
    }
    return fresh;
  } catch (e) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // ナビゲーション自体がキャッシュに無い場合は index.html を最終フォールバックに
    if (request.mode === 'navigate') {
      const shellIndex = await caches.match('/index.html');
      if (shellIndex) return shellIndex;
    }
    throw e;
  }
}

// cache-first: アイコン等の不変な静的アセット向け。
async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      try { await cache.put(request, fresh.clone()); } catch (e) { /* noop */ }
    }
    return fresh;
  } catch (e) {
    throw e;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return; // POST(score送信等)は素通し

  let url;
  try { url = new URL(request.url); } catch (e) { return; }

  // 別オリジン(フォント等)は一切介入しない
  if (url.origin !== self.location.origin) return;

  // /api/* は絶対にキャッシュしない。SW を完全にバイパスしてブラウザに任せる
  // (シグナリング・リーダーボード・AIステージ生成は常にライブである必要がある)。
  if (isApiRequest(url)) return;

  const isNavigation = request.mode === 'navigate';

  if (isNavigation || isSrcModule(url)) {
    event.respondWith(
      networkFirst(request).catch(() => new Response(
        'Offline and no cached version available.',
        { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      ))
    );
    return;
  }

  // それ以外(アイコン・manifest・og.png 等)は cache-first
  event.respondWith(
    cacheFirst(request).catch(() => new Response(
      '', { status: 504, statusText: 'Offline' }
    ))
  );
});
