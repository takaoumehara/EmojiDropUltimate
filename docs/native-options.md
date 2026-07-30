# アプリにする道 — React Native / Expo / Capacitor をどう選ぶか

> 2026-07-30。判断の記録。数字は `src/` の実測。

## 0. 先に結論

| やりたいこと | 使うもの |
|---|---|
| **このゲーム**を iOS/Android ストアに出す | **Capacitor**(いまのコードをそのまま包む) |
| RN/Expo を職歴・技術として身につける | **別の小さいアプリを1本**。このゲームの移植は台として不向き |
| Web も同じコードで出したい | RN でも可能(react-native-web)。ただし**このゲームでは利点が出ない** |

## 1. React Native / Expo は何が良いのか

**RN の良さ**

1. **ひとつのコードで iOS と Android**。言語は JS/TS のまま。
2. **本物のネイティブUI**。RN の `<View>` `<Text>` `<ScrollView>` は実際の
   `UIView` / `android.view.View` に変換される。**スクロールの慣性・キーボードの
   挙動・文字選択・読み上げ**が OS そのもの。WebView や canvas では最後まで
   「なんか違う」が残る部分がここ。
3. **ネイティブ機能に JS から手が届く**。プッシュ通知・カメラ・生体認証・
   セキュアストレージ・バックグラウンド処理・アプリ内課金・ヘルスデータ。
4. 求人が多い。エコシステムが大きい。

**Expo の良さ**(RN 単体との差はここ)

1. **EAS Build** — **Mac が無くても iOS ビルドが作れる**(クラウドで署名まで)。
2. **EAS Update** — **JS の変更を審査なしで配れる**。バグ修正が数分で全端末へ。
   ネイティブ部分を変えない限り、App Store の審査待ちが発生しない。
   これは個人開発では効き方が段違い。
3. `expo-notifications` `expo-camera` `expo-av` `expo-image-picker` …
   ひとつずつ自前でネイティブを書けば各1〜2週間かかるものが `npx expo install` で入る。
4. 保存し直すと即反映(Fast Refresh)。

## 2. アプリ専用か? — いいえ、Web にも出せる

**react-native-web** という仕組みで、RN のコンポーネントを DOM に変換します。
Expo はこれを最初から抱えていて、

```
npx expo start --web            # 開発サーバー
npx expo export --platform web  # 静的サイトとして書き出し
```

で **iOS / Android / Web の3つが同じコードから**出ます。Expo Router を使えば
Web 側は URL ルーティングまで面倒を見ます。

ただし「同じコードで Web にも出る」が本当に効くのは **UIの形をしたアプリ**
(リスト・フォーム・タブ・詳細画面)です。次の点は正直に:

- **ネイティブ専用のモジュールは Web で動かない**(カメラ・生体認証・
  バックグラウンド等)。分岐を書くことになる。
- **出力が重い**。react-native-web のランタイムが乗るので、手書きの Web より
  ずっと大きい。このリポジトリは**依存ゼロ・ビルド工程ゼロ**なので、
  そこと真逆の性質。
- **ゲームには向かない**。RN に canvas は無く、Web に出すときだけ canvas が
  使えても意味がない(RN 側で動かないので)。

## 3. このゲームに RN が向かない理由(実測)

| いまあるもの | 数 | RN では |
|---|---|---|
| Canvas 2D の呼び出し | **708箇所** | `<canvas>` も `CanvasRenderingContext2D` も無い。Skia か GL へ全面書き直し |
| `document.` | 46 | 無い |
| `navigator.` | 30 | 無い |
| `addEventListener` | 27 | 無い(RN のイベント系へ) |
| `localStorage` | 18 | AsyncStorage(**同期→非同期**なので呼び出し側も直る) |
| `window.` | 17 | 無い |
| WebRTC / WebSocket | 各1〜2 | `react-native-webrtc` はあるが Expo Go では動かず dev build 必須 |
| サービスワーカー | 1式 | 概念ごと無い |
| **Playwright の検証装置** | test 3,429行 + 多数 | 使えない |

src は **8,926行・依存ゼロ**。移植ではなく作り直しに近く、しかも
**今セッションのバグの大半を見つけた検証装置を失う**のが一番痛い。

## 4. Capacitor との比較

| | Capacitor | React Native / Expo |
|---|---|---|
| いまのコード | **そのまま動く** | 描画層と土台を書き直し |
| 中身 | WebView + ネイティブAPI橋渡し | 本物のネイティブView |
| UIの手触り | Web のまま | OS そのもの |
| 審査(Apple 4.2) | **「包むだけ」は落ちやすい** → 触覚・Game Center・課金・完全オフラインを足す(→ [store-readiness.md](./store-readiness.md)) | 素直に通る |
| Web にも出せるか | **元が Web なのでそのまま** | react-native-web 経由で可 |
| 学習の市場価値 | 低い | **高い** |

## 5. 決め方

- **このゲームを出す** → Capacitor。RN は割に合わない。
- **RN を身につける** → このゲームでやらない。canvas ゲームは RN の一番苦手な
  領域で、覚わるのは Skia の描画APIばかりになり、RN の本体(画面遷移・リスト・
  ネイティブ連携・状態管理)にほとんど触れない。
  **リスト + カメラ + 通知 + 認証が入る小さいアプリを2週間で1本**のほうが、
  この移植3ヶ月より職歴として効く。
