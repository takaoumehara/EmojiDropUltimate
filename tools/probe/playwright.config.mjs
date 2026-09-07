import { defineConfig, devices } from '@playwright/test';

// この環境には Chromium が導入済み(/opt/pw-browsers/chromium-1194)。
// Playwright の版と同梱ブラウザの版がずれていても動くように、実行ファイルを直接指す。
// `npx playwright install` は**走らせない**(数百MBを落とすうえ、この環境では不要)。
const CHROME = process.env.PROBE_CHROME
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.mjs',
  fullyParallel: false,        // 性能を測るので、並列で走らせて汚さない
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'results.json' }]],
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${process.env.PROBE_PORT || 4173}`,
    ...devices['Pixel 7'],     // 既定は電話の縦持ち。このゲームの主戦場
    launchOptions: { executablePath: CHROME, args: ['--no-sandbox', '--js-flags=--expose-gc'] },
  },
  webServer: {
    command: 'node serve.mjs',
    url: `http://localhost:${process.env.PROBE_PORT || 4173}`,
    reuseExistingServer: true,
    stdout: 'ignore',
  },
});
