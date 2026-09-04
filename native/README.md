# native/ — Android と iOS の殻

**Capacitor 6。** `src/` はここに何も依存しない —— ゲーム本体は依存ゼロ・
ビルド工程ゼロのままで、ブラウザでもアプリでも同じコードが動く。

判断の記録は [../docs/native-decision.md](../docs/native-decision.md)。

```bash
npm install            # 初回だけ
npm run sync           # www/ を作り直して両プラットフォームへ配る
npm run android        # → Android Studio が開く
npm run ios            # → Xcode が開く（Mac が要る）
```

## 中身

| | |
|---|---|
| `capacitor.config.json` | `appId: app.emojiblasters.game` / `appName: Emoji Blasters` |
| `copy-web.mjs` | ゲーム本体を `www/` へ写す。**白名簿**で `index.html` `manifest.webmanifest` `og.png` `src/` `icons/` `fonts/` だけ |
| `android/` `ios/` `www/` | 生成物。`.gitignore` してある（`npm run sync` で作り直せる） |

### なぜ copy-web.mjs が要るのか

このゲームには**ビルド工程が無い**ので、Capacitor に素直に webDir を渡すと
`docs/` も `test/` も `tools/` も `server/` も `.git` もアプリに埋まる。
**黒名簿にしない**のは、新しく足したフォルダが黙って混入するから。

サービスワーカーの登録は殻の中では外している。中身は端末に埋まっていて
ネットワークから読まないので、SW を残すと「キャッシュのキャッシュ」になり、
更新の筋道が二重になる。

## 触覚

`src/native.js` が実行時に `window.Capacitor.Plugins.Haptics` を見にいく。
**`import '@capacitor/haptics'` とは書いていない** —— 1行でも書けば
このリポジトリは npm とビルド工程を持ってしまう。
`test/config.test.js` が「`src/` は npm を import しない」を縛っている。

## このリポジトリで確かめていないこと

- **APK も IPA もビルドしていない。** Android SDK が無く、iOS は macOS が要る
- **実機で触覚が鳴るのを見ていない。** コードの分岐はテストで縛っただけ
- ストア審査、Game Center、プッシュ通知
