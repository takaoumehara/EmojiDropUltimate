# tools/probe — 実ブラウザで測る

`npm` を使うのはこのディレクトリだけ。`src/` と出荷物は依存ゼロのまま。

```bash
npm install            # 初回だけ
npx playwright test    # 全部(約4分)
npx playwright test perf.spec.mjs
node write-report.mjs  # docs/probe-report.md を書き直す
```

> **`npx playwright install` は走らせないこと。** この環境には Chromium が
> `/opt/pw-browsers` に入っていて、`playwright.config.mjs` が実行ファイルを
> 直接指している。別の場所にあるなら `PROBE_CHROME` で渡す。

| | 何を見るか |
|---|---|
| `perf.spec.mjs` | コールドスタート、フレーム時間の p50/p95/p99、1分連続プレイでのメモリ、**CPU を 1/4 に絞ったとき** |
| `offline.spec.mjs` | app shell がキャッシュされるか、回線を切って遊べるか、`localStorage` が例外を投げても遊べるか、manifest がインストール可能条件を満たすか |
| `layout.spec.mjs` | 8ビューポート × 日英。HTML 要素の画面外・重なり・押せない大きさ + スクリーンショット |

## 判定できるもの / できないもの

このゲームの画面は**ほとんどが canvas に描かれている**。題字もボタンの文字も
キャラのカードも DOM には存在しないので、`getBoundingClientRect()` で
判定できるのは HTML で置かれた数個の要素(歯車・ホーム・ポーズ・設定パネル・
あいことば入力・ホーム画面追加の案内)だけ。

`docs/layout.md` が記録した破綻(題字と説明文の重なり、カードの棒のはみ出し)は
**この検査では捕まえられない**。撮った画像は `shots/` に残るので、そこは人が見る。

`shots/` と計測結果の JSON は `.gitignore` してある。数字は
[docs/probe-report.md](../../docs/probe-report.md) に落ちる。
