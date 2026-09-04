# tools/ — 検証の道具

このゲームの本体(`src/`)と出荷されるもの(`index.html` / `sw.js` / `manifest`)は
**依存ゼロ・ビルド工程ゼロ**。それがこの作品の性質なので崩さない。

**npm が入るのは `tools/probe/` の中だけ。** 開発時にしか使わず、出荷物には一切載らない。

## 入口

```bash
node tools/verify.mjs           # テスト + 自動プレイ + 台帳(約1分・依存ゼロ)
node tools/verify.mjs --full    # 実ブラウザの計測も(約5分・Playwright が要る)
node tools/verify.mjs --quick   # テストだけ(3秒)
```

## 中身

| | 何をするか | 依存 | 出力 |
|---|---|---|---|
| `sim/` | 自動プレイを何百本も回して**遊びを測る** | ゼロ | [docs/sim-report.md](../docs/sim-report.md) |
| `probe/` | 実ブラウザで**性能・オフライン・画面を測る** | Playwright | [docs/probe-report.md](../docs/probe-report.md) |
| `native-audit.mjs` | ネイティブ化の価値を**台帳にする** | ゼロ | [docs/native-value.md](../docs/native-value.md) |
| `emoji-sheet.mjs` | 絵文字の見え方を並べる | ゼロ | `docs/emoji.html` |

判断そのものは [docs/verify-loop.md](../docs/verify-loop.md) と
[docs/native-decision.md](../docs/native-decision.md) にある。

## 気をつけること

- **`tools/sim` は 1実行 = 1ワーカー。** 使い回すと同じ種で結果が変わる
  (ES モジュールがプロセス内でキャッシュされるため)。理由は `sim/worker.mjs` のヘッダ。
- **`tools/probe` は `npx playwright install` を走らせない。** この環境には
  Chromium が導入済みで、`playwright.config.mjs` が実行ファイルを直接指している。
- **速い機械で測って「速い」と言わない。** このコンテナの CPU はデスクトップ級。
  電話に近づけるには CPU を絞る(`perf.spec.mjs` がやっている)。
