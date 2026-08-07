# Portfolio Case Study — EMOJI DROP ULTIMATE

> takaoumehara.com 用の入稿素材。2026-08-07 作成。
> **数字はすべてこのリポジトリでの実測**。実測できなかったものは "不明・要確認" と書いた。
> 推測で埋めた箇所は無い。

---

## 0. このプロジェクトの見せ方（最初に判定）

- [x] **A: 証拠先行型**
- [ ] B: 物語先行型

**理由**: 実画面のスクリーンショットを **12枚**、この作業で実際に撮影して `media/` に入れた（Chromium で実機同等のビューポート・DPR2・日英両方）。判定の目安（8枚以上）を満たす。

---

## 1. 基本情報

- **プロジェクト名（EN / JP）**:
  - 現行: `EMOJI DROP ULTIMATE` / `エモジドロップ アルティメット`
  - **改名提案（未決定）**: `EMOJI TURN` / `エモジターン`
    → 理由は §6.5・§10 に記載。**ケーススタディ入稿時にどちらを使うか要確認**
- **クライアント/対象**: Personal Project（自主開発）
- **自分の役割**: 企画 / ゲームデザイン / UI・UX設計 / フロントエンド実装の方向決定 / QA設計
  - **要確認**: 肩書きの表記は本人が決める項目。実態としては「単独 + AIエージェントとのペア作業」。
    git のコミット作者は51件中50件が `Claude`（Claude Code がコミットするため）で、
    人間側の仕事は**判断・却下・実測の指示**に寄っている。§6.5 A に具体を書いた
- **制作年・期間**:
  - git に残っているのは **2026-07-28 〜 2026-08-07**（51コミット、コミットのあった日は5日）
  - **git 履歴より前の作業期間は不明・要確認**（最初のコミットが初期コミットの形をしていない）
- **公開リンク**:
  - リポジトリ: `github.com/takaoumehara/EmojiDropUltimate`
  - 公開URL: Vercel にデプロイ済み。**正式な公開ドメインは不明・要確認**
  - デモ動画: **無し**（§8 参照）
- **機密上の制約**: 無し（全て自主開発・公開リポジトリ）

---

## 2. 一覧カード用の要約

- **カード用タイトル**:
  - EN: `EMOJI TURN`（10字）／ 現行名なら `EMOJI DROP ULTIMATE`（19字）
  - JP: `絵文字シューティング`（10字）
- **カテゴリタグ**: `Game Design` / `Web / PWA` / `Realtime Multiplayer`
- **1文の説明**:
  - EN: A browser shooter whose world changes direction every stage — built with zero dependencies and no build step, and tuned by counting what was actually on screen.
  - JP: ステージごとに世界の進行方向が変わるブラウザシューティング。依存ゼロ・ビルド工程なしで作り、手応えは感想ではなく画面上の実測で決めた。

---

## 3. Hero スライド

- **大見出し**
  - EN（60字）: `Six stages. Four directions. One shooter that keeps **turning**.`
  - JP（22字）: `6つの面。4つの向き。毎回、**世界ごと**変わる。`

- **リード文**
  - EN: I built a shooter where the world scrolls up, then right, then down, then left — one direction per stage. Nothing about that is decoration: your dodging habits and where you rest your thumb are rebuilt every stage. I shipped it as a single URL with **zero dependencies and no build step**, so it opens instantly and keeps working offline. Then I stopped adding features and started counting what was actually on the screen.
  - JP: 面が変わるたびに世界の進む向きが変わるシューティングを作りました。上へ、右へ、下へ、左へ。これは飾りではなく、覚えた避け方も指の置き場所も毎面リセットされます。**依存ゼロ・ビルド工程なし**で、URLを開くだけで始まり、オフラインでも動きます。そして途中から、機能を足すのをやめて画面上のものを数え始めました。

- **チップ**（各10字以内）: `Canvas 2D` / `WebRTC P2P` / `PWA`

---

## 4. Tension スライド

### 「前」側

- **タグ**: `Where it started` / `出発点`
- **見出し**
  - EN（27字）: `I shipped every idea I had.`
  - JP（13字）: `作れるものを、全部足した。`
- **本文**
  - EN: Weather-reactive rules, an LLM stage generator, a learning boss, daily challenges, share cards, leaderboards, streaks. Each one worked. Together they made a game I could not describe in one sentence — and my own design notes had already recorded the verdict: "it got cluttered." Worse, the difficulty knob was wrong: I had slowed the bullets to make them readable, and slow bullets lingered until **22 of them** filled the screen at once, so aiming stopped mattering.
  - JP: 天気で変わるルール、LLMのステージ生成、学習するボス、デイリー、共有カード、ランキング、ストリーク。どれも動きました。ただ全部乗せた結果、一文で説明できないゲームになり、自分の設計メモには既に「ごちゃごちゃ」と書いてありました。さらに難易度のつまみを取り違えていて、弾を読みやすくしようと弾速を落としたら、遅い弾が残って**画面に22発**溜まり、狙う必要そのものが消えていました。
- **チップ**: `機能過多` / `弾が22発` / `狙わなくていい`

### 「後」側

- **タグ**: `What it became` / `いまの姿`
- **見出し**
  - EN（24字）: `Then I counted, and cut.`
  - JP（8字）: `数えて、削った。`
- **本文**
  - EN: I put the bullet speed back to 420 and halved the fire rate instead — speed was never the knob, cadence was. I measured the smallest size at which 🍌🥛🥚🥖💧 stay distinguishable (18px) and set bullets to 19px. I removed the glow behind every bullet and the ring around the ship, because both made objects read as trapped orbs instead of things in flight. Measured result: **6–11 bullets on screen at power level 1**.
  - JP: 弾速は420に戻し、代わりに連射をほぼ半分にしました。つまみは速度ではなく連射でした。🍌🥛🥚🥖💧 が見分けられる下限を実測（18px）して弾を19pxにし、弾の光背と自機を囲む輪をやめました。どちらも「飛んでいる物」ではなく「閉じ込められた玉」に見せていたからです。実測で**PW1のとき画面上6〜11発**。
- **チップ**: `連射を半分に` / `弾は19px` / `光背を全廃`

---

## 5. Approach スライド

- **大見出し**
  - EN（36字）: `Measure the screen, **not the feeling**.`
  - JP（16字）: `感想ではなく、**画面を数える**。`

- **リード文**
  - EN: "It feels too easy" is not actionable, and it had already sent me the wrong way once. So I stopped trusting the feeling and started counting the artifact: bullets alive on screen, pixels per emoji, bells per sixty seconds, snapshot bytes per tick. Every tuning decision in this project has a number behind it, and the numbers that mattered most contradicted my intuition — which is exactly why I needed them. I wrote **201 automated tests** that lock the balance in place, so the next change cannot quietly undo the last one.
  - JP: 「なんか簡単すぎる」は行動に移せないうえ、一度それで判断を誤っていました。なので感想を信じるのをやめ、成果物を数えることにしました。画面上に生きている弾の数、絵文字1つあたりの画素数、60秒あたりのベルの数、1ティックあたりの同期バイト数。この案件の調整はすべて数字が根拠で、しかも一番効いた数字ほど直感と逆でした。だから必要だったとも言えます。**201件の自動テスト**でバランスを固定し、次の変更が前の変更を黙って壊さないようにしてあります。

---

## 5.5. Structure スライド

### 再設計前の構造

```
タイトル
└─ ステージ 1〜6（フラットな配列 STAGES[6]）
   ├─ 1 スカイラッシュ  ⬆️
   ├─ 2 ディープダイブ  ➡️
   ├─ 3 フリーフォール  ⬇️
   ├─ 4 ネオンシティ    ⬅️
   ├─ 5 マグマコア      ⬆️
   └─ 6 ギャラクシーエッジ ⬆️
        └─ 6面を終える → 静かに別の6面へ入れ替わる（＝第2章。ただし無表示）
```

**何が壊れていたか**: 章が切り替わる仕組みは**最初から動いていた**（`Save.chapter()` と `chapterStages(n)`）。壊れていたのは仕組みではなく**伝達**で、タイトルには「第1章・世界 0/6 制覇」としか出ておらず、なぜ戦うのかも6面の先に何があるのかも、どこにも書いていなかった。区切りが起きたことにプレイヤーが気づけない。

**確信度**: 高い。この構造は `docs/story.md` に判断の記録として残っており、コードの `CHAPTER_LEN` 定数の導入経緯まで追える。

### 再設計後の構造

```
タイトル
├─ 📖 オープニング（初回のみ・4コマ・待てば進む）
├─ 進行マップ（いま挑んでいる章の7枠。最後の枠だけ色が違う＝章ボス）
└─ 第N章 ＝ ひとつの「ショー」
   ├─ 面 1〜6   各面にミッション1行（例:「👑クラウドキング から 🐣 をすくえ」）
   └─ 面 7      章ボス（倒した6体が戻って1つになる）
        └─ 制覇 → 幕が上がる →「つぎのショーが はじまる」→ 次章の題とあらすじ

  第1章「さらわれたなかま」  → 🌀シックス
  第2章「ぬすまれたベル」    → 🔇サイレンス
  第3章「さいごのショー」    → 🎪リングマスター（黒幕は座長）
  第4章以降  「何を(6種) × 誰が(6種)」の決定論的な組み合わせ＝実質無限
```

**命名を変えたもの**

| 旧 | 新 | 変えた理由 |
|---|---|---|
| 「スタート」 | ミッション名（「さらわれたなかま」等） | 「スタート」だけでは**何をしに行くのか**が伝わらない |
| 「世界 0/6 制覇」 | 「CH.1 · 0/7」＋ 進行マップ | 6ではなく7（章ボスを足した）。数が合わないと制覇判定が永久に立たない |
| （無名の6面ループ） | 「章」＝「ショー」 | 終わりと始まりに名前がないと、区切りが起きたことに気づけない |

**この2つを並べたときに一番言いたいこと**:
足りなかったのは**仕組みではなく意味**で、コードを1行も足さずに伝わるようにはできなかった、ということ。

---

## 6. Problems / Moves スライド

### Problems 型

| # | 課題 | 解決 |
|---|---|---|
| 1 | ボスが**必ず一度、同じ形で蘇る**。一度見れば二度目からは驚きではなく手順になる | HPが尽きた瞬間に**6枚から引く**（蘇る／同じ大きさで分裂／逃げる／拾い残したベルを喰って硬くなる／何も起きず形見を残す／**世界の進行方向が変わる**）。直近2回に引いた札は引かず、履歴は端末に残すのでプレイを跨いで覚える |
| 2 | 各端末が独立に乱数・難易度調整・天気を回していたので、ふたりで遊ぶと**必ずズレた**（実際にズレた） | **ホスト権威**に変更。敵・弾・ベル・ボスはホストだけが計算し約15Hzで配信、ゲストは補間して映す。自機と自分の弾だけローカルなので**操作遅延はゼロ** |
| 3 | 4人対応したら、**ひとりがタブを閉じると残り3人の世界が凍る**という、2人のときより理不尽な壊れ方が生まれた | 後継を**サーバーが指名**（部屋を見ているのはサーバーだけなので、全員が同じ答えを持てる）。スナップショットにステージ経過時間を載せ、スコア・残機・進行度・戦闘中のボスの残りHPを引き継ぐ |
| 4 | 電話の縦持ち**以外がほぼ全部おかしかった**。デスクトップでは自機が盤面の2%（電話は10%）になり、端の敵まで約700px（電話は約200px）で、**届く前に画面を抜ける＝別のゲーム**になっていた | 盤面を「遊ぶ板」として固定し中央へ。横持ち（852×393）で全ボタンの主文と副文が重なっていた原因は UI倍率の底上げ `Math.max(1.05, …)` で、素の値0.578が1.8倍に持ち上げられていた |
| 5 | カラー絵文字を Canvas に描くと**fillStyle のアルファだけが絵文字に効く**（RGBは無視される）。光背を敷いた直後に描いた 🍌 が中心から外へ透明になり、バナナに見えなくなっていた。**2回踏んだ** | 絵文字を描く直前に必ず `inkEmoji()` を通して不透明に戻す。端数座標のにじみも `Math.round(x * DPR) / DPR` で画素に載せる |
| 6 | 位置情報の許可ダイアログが出るうえ、逆ジオコーディングで第三者APIを叩いていた | `navigator.geolocation` を**コードから完全削除**。端末のタイムゾーンから地域を推定するだけにし、手動で12都市から選べるようにした。**復活したらテストが落ちる**ように縛った |

---

## 6.5. Craft スライド

- [x] **AIを使った** → A

### A（AIを使った場合）

- **AIに何をさせたか**
  1. **実装そのもの**。git の51コミット中50件は Claude Code が作者。私の仕事は方向の決定・却下・実測の指示に寄っている
  2. **アイデアの虱潰し**。ボス終盤の飽きを潰すために、要素を5つのレンズで分解して前提を名指しし、8つの変換技法で総当たりさせた。台帳の実数は **生成62案 / 生存11 / 却下51 / 採用6**
  3. **ゲーム内のステージ生成**（Gemini）。名前・配色・敵絵文字・ボス・進行方向をその場で生成する。**キーが無ければ端末内の手続き生成にフォールバック**する設計にした
  4. **回帰の検出**。画面なしでゲームを最後まで自動プレイする `test/headless.js` を書かせ、その過程で実バグを2件見つけた

- **AIが出した案のどこがダメだったか**
  最初に出るのは決まって「そのままの復活（HP全快＋巨大化＋色変え）」「素直な第2形態」「素直な分裂」の3つでした。**綺麗にまとまっていて、どれも他のシューティングに既にある**。個別の演出をいくら磨いても「どうせ蘇るんでしょ」は消えません。AIは平均の中心を返すので、平均そのものが問題のときは何度聞いても同じ場所に戻ってきます。

- **そこに人間として何を足したか**
  **生成させる前に、その3案を名指しで禁止しました。** そして「どの案が面白いか」ではなく **「抽選にすること自体が答えで、そこに『何も起きない回』を混ぜる」** という構造の判断をした。これは案の優劣の比較からは出てきません。もう一つは**捨てる判断**で、生存11案のうち5案（影武者・自機のコピー・倒れた味方の復帰など）は良いと分かったうえで**今回は入れない**と決めました。

- **試した案の数と、選定の基準**
  62案を生成し、4軸（新規性 / 実装の重さ / 予測不能さ / このゲームらしさ）で採点して6案を採用。最高得点は **`turn`（38点）＝ ボス戦の最中に世界の進行方向が変わる**。選定基準は「禁止した平凡3案からの距離」で、既存のどれかに言い換えられる案は全部落としました。

### A・B 共通 — 採用しなかった選択肢

| 案 | その案の魅力 | 捨てた理由 |
|---|---|---|
| **React Native 移植** | ひとつのコードで iOS と Android に出せ、本物のネイティブUIが手に入り、**求人が多いので技術としての市場価値が高い** | 実測すると Canvas 2D の呼び出しが **708箇所**、`document.` 46、`window.` 17、サービスワーカー1式。RN に canvas は無いので移植ではなく作り直しで、しかも**このセッションのバグの大半を見つけた検証装置（テスト3,429行）を丸ごと失う**。RNを覚えたいなら、このゲームより「リスト＋カメラ＋通知＋認証」の小さいアプリを1本作るほうが早い |
| **常駐ゲームサーバーへ移す** | ホストだけ遅延ゼロという不公平、ホストが抜けると終わる問題、ホストが改造できてしまう問題、人数の上限が**まとめて消える** | シューティングは弾を避けるゲームなので、往復遅延が体験を壊す。加えて月$2〜7が**実際に発生する**。**外の人が誰も遊んでいない段階で、毎月払う理由がまだ無い**。同期ロジックはそのまま流用できるよう作ってあるので、遊ばれ始めてからで間に合う |
| **弾速を落として読みやすくする** | 「弾が速すぎて見えない」という指摘への**一番素直な答え**で、実際に読みやすくはなった | 実測したら**逆に簡単になった**。遅い弾が長く残って画面が自弾で埋まり（ウシで22発）、狙う必要が消えた。難度のつまみは速度ではなく**連射**だった |
| **iOS を先に出す** | ストアの検索とランキングに乗り、通知で呼び戻せ、課金の仕組みが揃っている | Web を包んだだけのアプリは Apple のガイドライン **4.2** で落とされやすく、$99 かかる。Google Play は TWA/WebView が通常どおり受理されて **$25**。いま iOS に行くのは**一番お金がかかり、一番落とされやすく、一番学びが少ない** |

---

## 7. Evidence（証拠）

### グループ 1 — 「向きが変わる」を見せる

- **見出し**: EN `Four directions, one game.`（26字） / JP `4つの向き、ひとつのゲーム。`（14字）
- **リード文**: EN: The spine of the design is visible in a single frame — the HUD, the play board and the ship all belong to a direction that will not survive the next stage. / JP: 設計の芯は1枚で見えます。HUDも盤面も自機も、次の面には残らない「向き」に属しています。
- **含まれる素材**: `04-play-ja.png`（道中）, `05-boss-ja.png`（ボス戦・👑クラウドキング）, `12-desktop-play-ja.png`

### グループ 2 — 説明を読ませない画面

- **見出し**: EN `The screen is the manual.`（25字） / JP `画面が説明書。`（7字）
- **リード文**: EN: Every character throws what its emoji would throw — 🦍 throws 🍌 — so what happens next is legible before you read anything. / JP: どのキャラも「その絵文字なら投げるもの」を撃ちます（🦍→🍌）。読む前に、何が飛ぶか分かります。
- **含まれる素材**: `01-title-en.png`, `02-title-ja.png`, `03-chars-en.png`, `11-landscape-chars-ja.png`, `07-opening-ja.png`

### グループ 3 — インストールを挟まずに、ふたりで

- **見出し**: EN `A QR code instead of an install.`（32字） / JP `インストールの代わりにQR。`（13字）
- **リード文**: EN: The QR encoder is hand-written — no library — and the game connects device-to-device over WebRTC at 20–80ms, with the server touched only at the moment of meeting. / JP: QRエンコーダは外部ライブラリ無しの自前実装です。端末どうしが WebRTC で20〜80msで直結し、サーバーは「出会う瞬間」しか通りません。
- **含まれる素材**: `06-coop-lobby-ja.png`, 図解1（同期アーキテクチャ・§8 Diagram）

### グループ 4 — 電話の縦持ち以外も、同じゲームであること

- **見出し**: EN `Same game on every screen.`（26字） / JP `どの画面でも、同じゲーム。`（13字）
- **リード文**: EN: I measured 11 viewports × 13 screens × 2 languages, and fixed the play area to a board so a wide screen does not quietly become an easier game. / JP: 11ビューポート × 13画面 × 日英で実測し、盤面を「板」に固定しました。画面が広いだけで別のゲームになるのを止めるためです。
- **含まれる素材**: `08-desktop-ja.png`, `09-desktop-opening-ja.png`, `10-landscape-ja.png`, `12-desktop-play-ja.png`, 図解2（§8 Diagram）

---

## 8. メディア素材リスト

> **凡例**: ① 既にある ／ ② AIが今から生成できる ／ ③ 本人が新たに撮影・収録する必要がある

| 種別 | 有無 | 取得方法 | 場所 |
|---|---|---|---|
| **Hero背景画像** | **① 既にある（1枚）** | 既存。`og.png` 1200×630。ただし**旧名が焼き込まれている**ので改名するなら作り直し（②で再生成可） | `og.png` |
| **UI screenshot** | **① 既にある（12枚・すべて実画面）** | **この作業で実際に撮影済み**（Chromium・DPR2・日英）。追加が要れば②で何枚でも撮れる | `portfolio-case-study-emoji-drop-ultimate/media/` |
| **Dark UI shot** | **① 既にある（12枚すべてが暗背景）** | 同上。このゲームは全画面が `#05050f` 基調なので、明背景のUIは**存在しない** | 同上 |
| **Photo（4:3・人が遊んでいる様子）** | **無い** | **③ 本人が撮影する必要がある。** 子供2人が遊んだ実績はあるが写真が残っていない。**顔が写る場合の公開可否は要確認** | — |
| **Diagram（構造図・フロー図）** | **無い** | **② AIが今から生成できる。** 作るべきは3点 →（1）ホスト権威の同期（誰が何を計算し、何が15Hzで流れるか）（2）章の構造 旧→新（§5.5のツリー）（3）「遊ぶ板」— 広い画面で盤面を固定する考え方 | — |
| **Before/After動画（9:16・2本）** | **無い** | **③ 本人が収録する必要がある。** ただし**②で代替可能**: この環境で操作を自動再生して録画できる（Chromium + ffmpeg あり）。撮るべき2本 →（1）**向きが変わる3秒**（ステージ1⬆️→ステージ2➡️の切り替わり）（2）ボス終盤の6枚抽選のうち `turn`（世界の向きが変わる） | — |
| **Brand asset（ロゴ・アイコン）** | **① 既にある（4枚）** | 既存。**ロゴは画像ではなく Canvas のテキスト描画**（`src/render.js:659`）なので、改名しても画像の差し替えは不要 | `icons/icon-192.png` / `icon-512.png` / `icon-512-maskable.png` / `apple-touch-icon.png` |

### 撮影済みスクリーンショット一覧

| ファイル | 寸法 | 中身 | 何の証拠になるか |
|---|---|---|---|
| `01-title-en.png` | 786×1704 | タイトル（英） | 章の進行マップ、ミッション名がボタンになっている、`Weather offline — standard rules`＝**ネットワーク無しでも壊れず劣化する**実例 |
| `02-title-ja.png` | 786×1704 | タイトル（日） | バイリンガル対応 |
| `03-chars-en.png` | 786×1704 | キャラクター選択（英） | 16体の性能差をカード1枚で見せる設計 |
| `04-play-ja.png` | 786×1704 | 道中（ステージ1・⬆️） | 弾19px・光背なし・尾だけ、の実物 |
| `05-boss-ja.png` | 786×1704 | ボス戦（👑クラウドキング） | 集中モードの弧、必殺技ゲージ、そして **`🤖 敵の攻勢を緩和中…`＝AIディレクターが実際に働いている瞬間** |
| `06-coop-lobby-ja.png` | 786×1704 | 共闘ロビー | **自前エンコーダで描いた実物のQR**、6桁あいことば、遊ぶ面の選択 |
| `07-opening-ja.png` | 786×1704 | オープニング（第1章） | 「足りなかったのは仕組みではなく意味」の解決そのもの |
| `08-desktop-ja.png` | 1440×900 | デスクトップのタイトル | 広い画面でも盤面が「板」に収まっている |
| `09-desktop-opening-ja.png` | 1440×900 | デスクトップのオープニング | 同上。左右の帯が「遊ぶ板」の外側 |
| `10-landscape-ja.png` | 1704×786 | 横持ちのタイトル | **縦が短い画面**での再設計後の姿 |
| `11-landscape-chars-ja.png` | 1704×786 | 横持ちのキャラ選択 | **旧: 5本の数値バーがカード枠の外へはみ出し、ページ点・READYボタンと重なっていた画面**。いまは収まっている |
| `12-desktop-play-ja.png` | 1440×900 | デスクトップの道中 | 盤面固定の効果が一番はっきり見える1枚 |

**再撮影の方法**（誰でも再現できるよう記録）:
`python3 -m http.server` でリポジトリを配信し、Playwright（`playwright-core`）+ Chromium で `window.EDU`（`src/main.js:17` のデバッグハンドル）を叩いて任意の画面へ遷移して撮る。スクリプトは §11 の後に添付。

---

## 9. Proof（成果）

### 数値化できる成果（3つ）

| 数字 | 説明 | 実測 / 見込み |
|---|---|---|
| **201** | 自動テストが全パス（`node --test test/*.test.js`）。バランス（素の火力の開きは2.45倍以内）、絵文字の役割の住み分け（自機・弾の絵文字を敵やボスに使わない）、レイアウト、同期、セーブまでを縛っていて、**次の変更が前の変更を黙って壊せない** | **実測**（2026-08-07 に実行） |
| **0** | 依存パッケージ。`package.json` が存在せず、ビルド工程も無い。src 9,067行・全JS 13,336行が**素の JavaScript のまま**動く。だから URL を開くだけで始まり、オフラインでも動く | **実測** |
| **1.63ms** | 中継サーバーの p95 遅延（50部屋・100接続時）。ゲーム中の通信は端末どうしの P2P（20〜80ms）で、スナップショットは約15Hz・1回2,211バイト。4人で106KB/秒 | **実測**（サーバー負荷試験。**実機4台・携帯回線での確認は未実施**） |

### この設計は、誰の・何を動かしたか

**私自身の判断を2回、実測が覆しました。** 「弾が速すぎる」と思って弾速を落としたら逆に簡単になり、つまみが連射だと分かった。「自機を囲む輪」を演出だと思っていたら、それは集中モードの表示が出っぱなしになっていただけだった。**この2つは、遊んだ感想からは永久に出てこない結論です。**

### 定性的な証明

- **子供2人が、言われずに「面白い」と言った**（家庭内）。これが現時点で唯一の第三者に近い反応
- **家庭の外の人には、まだ一度も遊ばせていない**。自己評価で「面白さの証明」を100点満点の**45点**に据え置いてあるのはこのため（§10）
- 受賞・採用・次の仕事への接続: **無し**

### 使った技術・ツール・手法

`Canvas 2D` `Web Audio API`（録音を再生せず合成。先読みスケジューラで25ms毎に200ms先を予約）
`WebRTC DataChannel`（ホスト権威 + スナップショット補間）`WebSocket`（依存ゼロの中継サーバー）
`Service Worker / PWA` `localStorage`（使えない環境でも落ちない）`Vercel Functions` `Upstash Redis`
`Gemini API`（キー無しでも動くフォールバック付き）`Open-Meteo`（キー不要）
`node --test` `Playwright`（11ビューポート × 13画面 × 日英の実測）`Claude Code`

---

## 10. Retrospective スライド

### 1. 一番大事な数字を、まだ取りに行っていない

- **見出し**: EN（46字）`No stranger has ever played this. Not once.` / JP（21字）`家の外の人は、まだ一度も遊んでいない。`
- **本文**: EN: I can prove the code works — 201 tests, a load-tested relay, four browsers synchronised in one room. I cannot prove anyone wants to play it, and that is the only number that decides whether the rest mattered. It is also the one thing I cannot move by writing more code, which is probably why it has stayed still the longest. / JP: コードが動くことは証明できます（201件のテスト、負荷試験済みの中継、1部屋で同期した4画面）。でも**遊びたい人がいるかは証明できていません**。そしてそれが、他の全部に意味があったかを決める唯一の数字です。ここだけはコードを書いても動かせないので、たぶん一番長く止まったままになっています。

### 2. 「4人で遊べる」は、書けているのに動いていない

- **見出し**: EN（48字）`The four-player code passes. It is switched off.` / JP（22字）`4人ぶんのコードは通る。動いていない。`
- **本文**: EN: Four-player co-op is implemented, tested, and verified across four real browsers in one room. In public it still caps at two, because it needs a relay server that costs a few dollars a month and I decided not to pay before anyone outside my house had played. The decision still looks right, but it means one of the loudest things in my README is not true of the live build. / JP: 4人プレイは実装もテストも済み、1部屋の実ブラウザ4枚で確認しています。それでも公開状態は2人までです。月数ドルの中継サーバーが要り、**外の人が誰も遊んでいない段階で払わない**と決めたからです。判断は今でも正しいと思いますが、READMEで一番大きく書いてあることの一つが、公開中のビルドでは真ではないということでもあります。

### 3. 売りを否定する名前を、最後まで疑わなかった

- **見出し**: EN（50字）`I named it DROP. Only one of six stages drops.` / JP（24字）`DROP と名付けた。落ちるのは6面中1面。`
- **本文**: EN: The spine of this game is that direction changes — and I called it EMOJI **DROP**. Stages go up, right, down, left, up, up. I had already written in my own design notes that the direction change was the one thing competitors could not copy, and still did not connect it to the title until I sat down to describe the product to someone else. Describing it to an outsider found in one hour what building it for weeks did not. / JP: このゲームの芯は**向きが変わること**なのに、名前は EMOJI **DROP** でした。面は上・右・下・左・上・上と進みます。設計メモには「進行方向の変化こそ他が真似できない点」と自分で書いてあったのに、**人に説明するために書き出すまで、タイトルと結びつけませんでした。** 外の人に向けて説明する作業が、作り続けた数週間より速く問題を見つけました。

---

## 11. Closing（締めの一文）

- **見出し**
  - EN（46字）: `Working and playable are **not the same thing**.`
  - JP（18字）: `動くことと遊べることは、**別のこと**。`

---

## 12. アクセント色

**黄（`#ffd23f`）** — このゲームが唯一の強いアクセントとして使っている色そのもの（`src/theme.js` の `COL.gold`）。背景は `#05050f`。作品側とサイト側で色が一致します。

---

## 付録: 改名について（入稿前に決める必要あり）

「EMOJI を名前に残す」前提での推奨は **`EMOJI TURN`**。

- `DROP` → `TURN` の**1語差し替え**だけで、名前が売りを否定している状態が解消する
- 2語構成・字数感が現行とほぼ同じなので、Canvas のロゴ描画（`src/render.js:659`）がそのまま通る
- `ULTIMATE` は落とす（続編でもないのに ULTIMATE は、個人作品では「盛っている」信号として読まれる）
- **弱点**: `emoji turn` は一般語の組み合わせなので検索での占有力が弱い。
  検索を優先するなら `EMOJI TURNSHOW`（short_name は `TURNSHOW`）。`TURNSHOW` は主要ストアに同名が見当たらず、`docs/story.md` の「1章＝ひとつのショー」の骨格ともそのまま噛み合う

判断の詳細は `docs/brand.md`。**このケーススタディを現行名で出すか新名で出すかは要確認。**
