# EmojiDrop Ultimate — ポートフォリオ・ケーススタディ素材

> 作成: 2026-09-06 ／ 対象リポジトリ: `takaoumehara/EmojiDropUltimate`
> ブランチ: `claude/portfolio-content-distribution-md5fmk`
> 掲載先: takaoumehara.com のケーススタディページ（1枚1メッセージのスライド構成）
>
> **不明・要確認**の項目は本文中にそのまま残し、`OPEN-QUESTIONS.md` に全部転記してあります。
> 素材の在庫と撮影指示は `MEDIA.md` に、配布用の事実だけを抜いたものは
> `DISTRIBUTION-FACTS.md` にあります。
>
> **名前について（先に断り）**: このリポジトリ・README・会社サイトの表記は
> **「EmojiDrop Ultimate」/「EmojiDrop」**です。会話では「Emoji Blast」と呼ばれることが
> ありますが、こちらで改名はしていません。どちらを正にするかは
> `OPEN-QUESTIONS.md` Q-2 に出してあります。

---

## 0. このプロジェクトの見せ方（判定）

- [ ] A: 証拠先行型（全8〜10枚）
- [x] **B: 物語先行型（全10〜13枚）**
- [ ] C: ツール紹介型（全3〜4枚）

**理由（1行）**: 実際のゲーム画面のスクリーンショットが**リポジトリに1枚も無い**（実在する画像は
OGP 1枚とアイコン4枚だけ）ので、証拠は**実測値・構造図・「直す前と後」の数字**で作るのが正しい。

補足（判定の根拠を1段だけ）:

- リポジトリ内の実画像は `og.png`（1200×630）と `icons/` の4枚（192 / 512 / 512-maskable /
  apple-touch 180）のみ。**プレイ画面の静止画も動画も存在しない**（`ls` で確認、2026-09-06）。
  ゲームはブラウザで動くので撮れば撮れますが、それは③（本人が撮る）の仕事です（→ `MEDIA.md`）。
- 一方で、語れる**判断**と**実測**は多い。棒グラフでは捕まらなかったキャラの壊れ方、
  電話の縦持ち以外がほぼ全滅していたレイアウト、画面なしでゲームを最後まで走らせる装置、
  「サーバー」と呼んでいたものが3種類あった話 — 全部リポジトリの `docs/` 13本と
  コミットメッセージに残っています。
- **そしてこの作品は、止め絵で一番損をする種類のもの**です。芯が「ステージごとに
  進行方向が変わる」なので、静止画は「絵文字が飛んでいる画面」にしか見えません。

→ **Variant B**。全 **12枚** 構成（Hero / Tension（対比2列）/ Approach / Structure /
Evidence×3 / Craft / Craft-不採用 / Proof / Retrospective / Closing）。

---

## 1. 基本情報

| 項目 | 内容 |
|---|---|
| プロジェクト名（EN） | **EmojiDrop Ultimate** |
| プロジェクト名（JP） | **EMOJI DROP ULTIMATE**（リポジトリ／README／`manifest.webmanifest` の表記どおり） |
| スラッグ | `emojidrop` |
| 掲載カテゴリー | **Interactive Experience**（Games サブグループ。既存の `interactive.html` の "Game projects" グリッドに既にカードがあります） |
| 入力ラベル（1語） | **`Two phones`** — 理由は下記 |
| クライアント/対象 | Personal Project（自主開発） |
| 自分の役割 | 単独。企画・ゲーム設計・バランス調整・エンジン/描画/同期の設計・音・UI・技術文書、および**AIエージェントの運用と判断**（実装の大半はエージェントが書いています。§6.5 に正直に書きました） |
| 制作年・期間 | リポジトリの履歴は **2026-07-28 〜 2026-08-22（50コミット）**（`git log`、2026-09-06 確認）。ただし**最初のコミットの時点で既に章・集中モード・PWA が入っている**ので、着手日そのものは履歴からは分かりません（**不明・要確認**） |
| 公開リンク | リポジトリ: `github.com/takaoumehara/EmojiDropUltimate`（`git remote -v`。**公開/非公開は不明・要確認**）／ 本番URL: **不明・要確認**（`vercel.json` はあるが、リポジトリ内に本番URLの記載は1件も無い。会社サイト `creativityiseverywhere.com/playable.html` も 2026-08-19 時点で "No public URL yet"）／ デモ動画: **無し** |
| 現在の状態 | **プロトタイプ**（ソロと2人プレイはコード上完成し、テストも通っている。公開URLが確認できないため「公開中」とは書けません） |
| 機密上の制約 | 無し（自主開発・外部クライアント無し） |

**カテゴリー判定の理由**: 入力は指のドラッグと、もう1台の端末です。AI は3系統がゲームの中に
入っていますが（天気・難易度・ボス）、**製品の主語はゲーム体験のほう**なので "AI Products"
ではなく Interactive Experience に置きます。

**入力ラベルを `Two phones` にした理由（`Drag` を採らなかった理由）**

1. `Drag` は正しいけれど、**このカードを他のどのスマホゲームとも区別しません**。索引ページの
   ラベルは「この体験は何で動くのか」を並べて見せるためのものなので、区別しない語は仕事をしない。
2. この作品で**1台では絶対に成立しない遊び**が実装されています。2機のあいだに線が張り、
   線に触れた敵が切れる「きずな」（`src/tether.js`）です。ソースのコメントに
   「これは1人では絶対に成立しない —— 線の相手が居ないので線が無い」と書いてあり、
   `test/tether.test.js` がそれを縛っています。**ラベルが指すべきはここ**です。
3. `interactive.html` の既存カードが**すでに `Two phones` / 「2台のスマホ」**になっています
   （`interactive.html:752`）。変える理由が無い。

※ ただしソロでも完全に遊べます。ラベルを1語に潰す以上どちらかが落ちるので、
`Drag` に寄せたい場合は `OPEN-QUESTIONS.md` Q-5 で切り替えてください。

---

## 2. 一覧カード用の要約

- **カード用タイトル**
  - EN: `Every stage turns`（17字 / 上限25）
  - JP: `面ごとに向きが変わる`（10字 / 上限12）
- **カテゴリタグ**: `Interactive Experience` / `Game Design` / `WebRTC`
- **1文の説明**
  - EN: A phone shooter whose scroll direction changes with every stage — and whose sixteen
    ships arrive one per cleared stage without any of them ever being stronger than the
    three you started with.
  - JP: ステージが変わるたびに進む向きが変わるスマホ用シューティング。自機は遊ぶほど増えて
    16体になりますが、**あとから開いた機体が強いことは一度もありません**。増えるのは
    火力ではなくクセのほうです。
- **フッター用メタ**: `Vanilla JS (ESモジュール・ビルド無し) · Canvas 2D · WebRTC DataChannel · Web Audio · Gemini · Open-Meteo · PWA`

> **既存カードの記述の訂正が2件あります**（サイト側で直す必要があります・詳細は `OPEN-QUESTIONS.md` Q-3）:
> `interactive.html:754` の "two players head-to-head" は**対戦ではなく協力**（co-op）です。
> 同行の "no server relay either" も、いまは**任意の中継サーバーが `server/` に実装済み**
> （既定はオフ）なので、正確ではありません。

---

## 3. Hero スライド

### 大見出し

- **EN**: `The screen turns every stage. Your **thumb** has to relearn.`
- **JP**: `面が変わるたび、進む向きが変わる。**指の置き場**から作り直す。`

（EN 56字 / JP 29字）※`**` は字数に数えていません（EN 上限60 / JP 上限30）

### リード文

- **EN**:
  Most shooters point one way forever. This one points up, then right, then down, then
  left, and the background, the enemies, the music and the boss change with it. Six stages
  make a chapter, and clearing a chapter opens the next one — hand-written for the first
  three, then generated deterministically, so the same chapter is the same story for
  everybody. The whole thing is one folder of ES modules: no build step, no framework,
  no CDN, and it still runs with the network off.

- **JP**:
  シューティングはふつう、最後まで同じ向きに進みます。この作品は上・右・下・左と面ごとに
  向きが変わり、背景も敵も音楽もボスも一緒に入れ替わります。6面で1章、章を制覇すると次の章が
  開き、第3章までは手書き、以降は決定論で生成されるので**誰がいつ遊んでも第N章のM面は同じ話**
  になります。中身は ES モジュールのフォルダひとつだけ。ビルド工程もフレームワークも CDN も
  無く、電波が無くても起動します。

### チップ（3個・各10文字以内）

| # | EN | JP |
|---|---|---|
| 1 | `No build`（8） | `ビルド無し`（5） |
| 2 | `Offline`（7） | `オフライン`（5） |
| 3 | `Two phones`（10） | `二台で協力`（5） |

---

## 4. Tension スライド（前 / 後）

> このスライドが扱うのは、**キャラクター**です。ここに一番はっきりした「前」と「後」があり、
> しかも両方が数字で残っているためです（`docs/balance.md` / コミット `41627b4` (#5)）。

### 「前」側

- **タグ**: EN `Where it started` / JP `出発点`
- **見出し**
  - EN: `One card was a different game.`（30字 / 上限30）
  - JP: `一枚だけ別のゲーム`（9字 / 上限15）
- **本文**
  - EN: Sixteen ships were on the select screen from the first second, and one of them —
    ⚡ BOLT — was not playing the same game as the other fifteen. Its `pierce: 1` did not
    mean "passes through one enemy", it meant "never despawns", so the fastest, straightest
    shot in the game deleted an entire column at once. The guard that was supposed to catch
    this compared damage against fire rate, and both of ⚡'s numbers were ordinary.
  - JP: 選択画面には最初から16体が並んでいて、そのうちの1体 — ⚡ カミナリ — だけが
    残り15体と同じゲームを遊んでいませんでした。`pierce: 1` は「1体だけ貫通する」ではなく
    「**永久に消えない**」という意味で、全キャラ最速でまっすぐ飛ぶ弾が、一列に並んだ敵を
    1発で丸ごと消していました。それを止めるはずのテストは「一撃 ÷ 連射」しか見ておらず、
    ⚡ はどちらの数字も平凡だったので素通りしていました。
- **チップ3個**
  - EN: `16 cards at once` / `Unlimited pierce` / `Guard looked away`
  - JP: `初手で16枚` / `貫通が無制限` / `番人が見ていない`

### 「後」側

- **タグ**: EN `What it became` / JP `再設計後の姿`
- **見出し**
  - EN: `Later: showier, not stronger.`（29字 / 上限30）
  - JP: `後のキャラは派手なだけ`（11字 / 上限15）
- **本文**
  - EN: You now start with three ships that all fly exactly where you point, and one more
    arrives for every stage you clear, all sixteen by the thirteenth. None of the later ones
    is stronger — a single `powerScore` multiplies punch, rate, aim, shot width, range,
    pierce and shot speed into one figure, and all sixteen sit inside ±1% of each other.
    What grows is the quirk: the last ship you unlock throws the heaviest hit in the game
    on an arc that will not go where you aimed.
  - JP: 最初に選べるのは、まっすぐ飛ぶ3体だけです。1面制覇するごとに1体増え、13面で16体そろいます。
    **後から開く機体が強いことはありません。** 一撃・連射・狙い・弾の太さ・射程・貫通・弾速を
    掛け合わせた `powerScore` という1本の数字で見ていて、16体が **±1%** に収まっています。
    増えるのはクセのほうで、最後に開く 🦍 は一番重い一撃を持っている代わりに、
    バナナが弧を描くので狙った所へは飛びません。
- **チップ3個**
  - EN: `3 → 16 by play` / `±1% power` / `Quirk, not power`
  - JP: `3体から16体へ` / `火力は ±1%` / `増えるのはクセ`

---

## 5. Approach スライド

### 大見出し

- **EN**: `Balance by **one number**, not five bars.`
- **JP**: `棒5本ではなく、**数字ひとつ**で縛る。`

（EN 37字 / JP 17字）※`**` は字数に数えていません（EN 上限40 / JP 上限20）

### リード文

- **EN**:
  Two requests arrived together and, left alone, they contradict each other: characters
  should arrive gradually and feel like a reward, but no character should ever make the
  game easier — otherwise progress is a cheat code wearing the costume of skill. I decided
  the honest answer was that later characters are showier and harder to steer, and that
  this could not be left as an intention. The card already showed five stat bars, and five
  bars are exactly what lets you raise one and lower another while the total quietly climbs.
  So I collapsed the five into a single multiplication and let a test own it: sixteen
  characters within ±1%, and a separate test that fails if the first half of the unlock
  ladder averages more than 4% away from the second half. That second test is the
  machine-readable form of "later does not mean stronger".

- **JP**:
  同時に来た2つの要望は、放っておくと矛盾します。**キャラは遊ぶほど増えてほしい。でも後から
  手に入るキャラが強かったら、それは腕前ではなくチートになる。** 私が出した答えは
  「後のキャラは強くない。派手で、扱いが難しい」でした。ただしこれは、心がけとして書いても
  必ず崩れます。カードには5本の棒（ひとげき・れんしゃ・たまのはやさ・ねらい・みのこなし）が
  出ていて、**棒が5本あるということは、1本を伸ばして1本を削るあいだに全体が強くなっていても
  誰も気づけない**ということだからです。だから5本を1本の掛け算に潰し、テストに持たせました。
  16体が ±1% に収まっていること。そして**開放順の前半8体と後半8体の平均が4%以上ずれたら
  落ちること**。後者が「後から開くキャラは強くない」の機械で読める形です。

（※採用しなかった選択肢は §6.5 に書いています）

---

## 5.5. Structure スライド

> このスライドは**2つの構造**を並べます。片方は画面の座標系、もう片方は語彙です。
> どちらも「結果だけ書くと何が直ったのか判定できない」典型なので、前を必ず出します。

### A. 再設計前の構造 — 「窓 = 盤面」だった

確信度: **高**（記憶ではなく `docs/layout.md` と コミット `720c684` (#1) の実測に基づく。
Playwright で 11ビューポート × 13画面 × 日英を撮って突き合わせた記録が残っています）

```
ブラウザの窓（= W / H）
├── 盤面（窓いっぱい）
│   ├── 自機の可動域        … 窓の幅そのもの
│   ├── 敵の湧く幅          … 窓の幅そのもの
│   └── 弾・演出            … 窓いっぱい
├── HUD（スコア・残機）      … 窓の左上と右上に直接貼る
└── HTML のボタン（⚙ / ⌂ / ❚❚） … 窓の角に position で貼る
```

**このツリーの何が壊れていたか**

1. **画面が広いほど、別のゲームになっていた。** 1920×1080 では自機が盤面の幅の **2%**
   （電話では 10%）、敵は **約700px** 先に湧いて、**届く前に画面を抜けていきます**。
   見た目が寂しいのではなく、遊びとして成立していませんでした。
2. **HUD が視線に入らない。** 左上と右上が 1900px 離れる。
3. **縦が短い窓（電話の横持ち・852×393）で、文字が全部重なっていた。** UI 倍率の底上げ
   `Math.max(1.05, …)` は「幅の狭い端末で字が小さくなりすぎない」ためのものでしたが、
   素の値が 0.578 になる窓では**倍率だけが1.8倍に持ち上がり、行間は高さに比例して詰まったまま**。
   題字が説明文に、ボタンの主文が副文に、キャラカードの5本の棒がカードの外にはみ出して
   READY ボタンに重なり、**ふたりで遊ぶロビーは下端で切れて最後のボタンが押せませんでした**。

### B. 再設計後の構造 — 「遊ぶ板」を決めた

```
ブラウザの窓
└── 遊ぶ板（= W / H。縦長・幅は最大 560px・窓の中央）   ← ここが盤面
    ├── 自機の可動域 / 敵の湧く幅 / 弾・演出            … すべて板の中（ctx.clip で切り抜く）
    ├── HUD                                          … 板の角
    └── HTML のボタン（⚙ / ⌂ / ❚❚）                   … env.js が書く CSS 変数で板の角へ
   （板の外は「飾りの帯」= 板の後ろに淡い光。真っ黒だと読み込み失敗に見えるため）
```

| 窓 | 板 | 電話と同じか |
|---|---|---|
| 360×640 / 375×553 / 393×665 / 393×852 / 430×932 | そのまま | **完全に同じ** |
| 852×393（横持ち） | 560×393 | 中央に寄る |
| 768×1024 / 1440×900 / 1920×1080 / 2560×1080 | 560×高さ | 中央に寄る |

**描画コードは1行も変えていません。** `ctx.setTransform` で原点を板の左上へずらすだけで、
既存の `W` / `H` を使ったコードがそのまま板の中に収まります。指の座標だけは窓のものなので、
**絶対位置を読むところだけ**変換しました（動かす量は差分なので、寄せても変わらない）。

### C. もうひとつの構造 — 「サーバー」が3つの別物を指していた

これは画面ではなく**語彙**の構造です。同じ単語で3つのものを呼んでいたので、
「サーバーに移すべきか」という問いに誰も答えられませんでした（`docs/multiplayer.md` §0.5）。

| 旧: ぜんぶ「サーバー」 | 新: 名前を分けた | 何をするものか |
|---|---|---|
| — | **① 出会わせるサーバー** | `api/signal.js`。あいことばと接続情報(SDP)を**5分だけ**預かる。今も使用中 |
| — | **② snap-pair（別プロジェクトの基盤）** | 部屋 + ゆっくり変わる共有状態。**このゲームでは一度も使っていない** |
| — | **③ 常駐ゲームサーバー** | 世界を毎秒60回計算する。**未着手**。「サーバーに移す」と言っていたのはこれだけ |

②が重要です。**このゲームは snap-pair を使っていません**（リポジトリ全体を検索して
Firebase への参照は0件。2人プレイは `src/coop.js` の自前 WebRTC 実装）。
`docs/brief.md` に「snap-pair のような基盤の横展開」と書いたのは将来の事業の話で、
実装の由来ではありません。**この混同は文書の中で数週間生きていました。**

### 命名を変えたもの

| 旧 | 新 | 変えた理由 |
|---|---|---|
| `W` / `H` = 窓の大きさ | **`W` / `H` = 遊ぶ板の大きさ** | 「窓が広いほど有利/不利」という、誰も設計していない難易度差を消すため |
| `pierce: 1` =「消えない」 | **`pierce` = 何体まで当てられるかの予算（0〜4）** | 無制限が**表現できてしまう**形だったのが事故の原因。上限のある型に変えた |
| 復活の待ち = `setTimeout`（実時間） | **ゲーム内時間の待ち行列** | 時計が2本あると、裏タブで復活が止まり、死んだ直後に始め直すと前回の復活が新しい回に発火する |
| 「サーバー」（3つの意味） | **①出会わせる / ②snap-pair / ③常駐ゲームサーバー** | 判断ができない語彙は、判断を止める |

### この2つを並べたときに一番言いたいこと

**壊れていたのは画面ではなく、座標系と語彙のほうでした。**
（EN: What was broken was never the screen. It was the coordinate system, and the words.）

---

## 6. Problems / Moves スライド

**Problems 型**（課題 → 解決を4組。すべてリポジトリに記録があります）

**① 「2人でも1人と変わらない」と言われた**
- 課題: 子供が遊んで出た一言。技を配り、合体を足し、人数でボスを硬くしても、遊びは
  「**同じことをする人が2人いる**」ままだった。人数で難易度を足しても、やることは増えない。
- 解決: **やることそのものを、相方の位置で決まるようにした。**2機のあいだに線が張り、
  線に触れた敵が切れる（`src/tether.js`「きずな」）。短く保てば鋭く、離れれば広く薄く、
  離れすぎると切れる。ボスには効かないが、線がかかっているあいだは弾がよく通る。
  **1人では線の相手が居ないので成立しない**遊びで、`test/tether.test.js` がそれを縛っている。
  3人以上は総当たりにせず数珠つなぎ（4人で6本は読めない）。

**② ボスが必ず一度、同じ形で蘇っていた**
- 課題: 全ボスに必ず1回の復活を入れていた。一度見れば二度目からは驚きではなく**手順**になり、
  「どうせ蘇るんでしょ」で終わる。
- 解決: HP が尽きた瞬間に **6枚から引く**（蘇る / 分裂する / 逃げ出す / 拾い残したベルを喰って
  硬くなる / 何も起きずに形見を残す / **世界の進行方向そのものが変わる**）。
  **「何も起きない回」があるので、蘇りを前提に構えられない。** 直近2回に引いた札は引かず、
  履歴は端末に残る。ベルを拾い残していると、その回だけボスが喰える（**盤面の状態が抽選を変える**）。
  逃がすと次のステージのボスが硬くなる。生成の前に「そのままの復活 / 素直な第2形態 /
  素直な分裂」の**平凡3案を先に禁止**してから案を出しています（`docs/product-idea.md`）。

**③ 電話の縦持ち以外が、ほぼ全部おかしかった**
- 課題: 13画面 × 11ビューポート × 日英を撮って並べたら、正しかったのは電話の縦持ちだけ。
  広い窓では別のゲームになり、縦が短い窓では文字が重なってボタンが押せなかった（→ §5.5）。
- 解決: `W`/`H` の意味を窓から**遊ぶ板**へ変えた。加えて、読みやすさの底上げを
  **縦の短さで緩める**（`floor = Math.min(1.05, h/520)`）ことで、**高さ546px以上では
  従来と1ミリも変わらない**ようにした。iPhone SE の 553 もこちら側です。

**④ 「サーバー」という言葉が判断を止めていた**
- 課題: 「サーバーに移すべきか」に答えられなかった。同じ単語が3つの別物を指していたため。
- 解決: 名前を3つに分け、それぞれの上限と用途を表にした（→ §5.5-C）。分けた結果、
  「2人で遊ぶ限り**直結のほうが速くて安くて正しい**」「常駐サーバーに移す合図は
  5人以上をやると決めたとき、または**実際のテスターから『ホストが抜けて理不尽』が出たとき**」
  という、実行可能な条件に落ちました。

---

## 6.5. Craft スライド

**判定**: - [x] **AIを使った** → A を記載

### A（AIを使った場合）

**AIに何をさせたか（具体的に）**

1. **実装のほぼ全部。** `git shortlog -sn` は 50コミット中 **48がエージェント名義**、
   2が私名義（2026-09-06 確認）。`src/` は 26ファイル・**9,348行**、`test/` は
   17ファイル・3,748行で、私が手で書いた行はごくわずかです。私がやったのは、
   何を作るか・何を作らないか・何が壊れているかの判断です。
2. **自作のスキル群（superforge）で工程を固定した。** 企画 / 設計 / 実装 / テスト /
   デバッグ / 批評 / 検証 / 引き継ぎ を分けて呼び出します。`docs/superforge.md` には
   **「ユーザーが固定したこと」**として、私の言葉がそのまま3行だけ書き留めてあります —
   キャラは遊ぶほど増える／後から手に入るキャラが強いわけではない（崩れるとチートになる）／
   ⚡ が強すぎる。**この3行が、その後の実装と2本のテストの根拠になっています。**
3. **アイデアの虱潰し。** ボス終盤の設計では、生成の前に「平凡3案」を名指しで禁止し、
   要素と前提を表にしてから技法を回しました（`docs/product-idea.md`）。
4. **判断の記録。** `docs/` 13本は全部「なぜ今この形なのか」を残すためのもので、
   会話が消えても別のセッション（別のAI）が続きを作れるようにしてあります。

**AIが出した案の、どこがダメだったか**

- **番人が、測りやすいものを測っていた。** キャラの釣り合いを守るテストは
  `dmg ÷ fire` を 2.45倍以内に縛るものでした。⚡ はその式に**出てこない項**
  （貫通の無制限さ、弾速）で壊れていたので、堂々と素通りします。
  **テストがあること自体が安心の理由になっていた**のが一番危ないところでした。
- **無制限が「表現できてしまう」型を選んでいた。** `pierce: 1` に「永久に消えない」の意味を
  持たせた設計は、書いた時点では短くて綺麗です。壊れ方が見えるのは、あとで速い弾と
  まっすぐな狙いが同じキャラに乗ったときだけ。**有限の予算にすれば、そもそも起きません。**
- **同じ弾がボスを毎フレーム削っていた。** 貫通弾はボスに当たっても消えないので、
  重なっているあいだ毎フレーム `damageBoss` が走る。⚡ の弾は 882px/s、ボスの当たり判定は
  半径45px前後なので、**1発が5〜6発ぶん**入っていました。カードにも棒グラフにも出ない壊れ方です。
- **見ていない画面には、何も足せていない。** 機能を何週間も足し続けたのに、
  **確認されていたのは電話の縦持ちだけ**でした。11ビューポートで撮るまで、
  ロビーの最後のボタンが押せないことに誰も気づいていません。
- **文書が実装より先に古びる。** いま現在も、この README は「キャラクター選択(6体)」と
  書いていますが、`src/config.js` の `CHARS` は **16体**です（2026-07-28 に9体足された
  同じ日に書かれた記述が、そのまま残っている）。同じ種類のずれで、
  「このゲームは snap-pair 基盤」という誤解も数週間生きていました。
  **エージェントの速度で作ると、記録のほうが先に嘘になります。**

**そこに人間として何を足したか**

- **矛盾する2つの要望を、そのまま両方守ると決めたこと。** 「増えてほしい」と
  「強くなってはいけない」を、片方に寄せて解決しませんでした。
  答えは「派手で扱いが難しい」という**第三の軸**で、これは AI に決めさせると
  ほぼ必ず「後半を少し強く」に倒れます（それが普通のゲームの作り方だからです）。
- **心がけを、落ちるテストに変えること。** ±1% と「前半/後半で4%以上ずれたら落ちる」は
  私が要求した形です。**書いた原則は必ず崩れる**が、テストは崩れると音が鳴る。
- **平凡を、生成の前に禁止すること。** 復活・第2形態・分裂の3つを先に殺してから
  案を出させました。あとから「ありきたりだ」と言うより速く、そして角が立ちません。
- **「動いた」と言える範囲を狭く言うこと。** `docs/status.md` は
  「1台のブラウザ4枚では確認済み。**外はまだ何も分かっていない**」と書いてあります。
  これはエージェントが自分から書く文章ではありません。
- **子供の一言を設計要求として扱ったこと。** 「2人でも1人と変わらない」を、
  難易度の話ではなく**遊びの構造の話**として受け取ったのは私の判断です。

**試した案の数と、選定の基準**

- ボス終盤は約80セルのスイープから6枚を選びました。基準は**禁止した平凡3案からの距離**と、
  「**盤面の状態が抽選を変えるか**」の2つ。同じ演出の別バージョンは採りません。
- キャラは16体で固定。基準は「**その絵文字なら何を投げるか**」（🦍→🍌 / 🐄→🥛 / 🧑‍🍳→🥖）で、
  見た瞬間に何が飛ぶか分かるものだけを残しました。まっすぐ飛ぶままなのは2体だけで、
  それ以上増やすとテストが落ちます。

### A・B 共通 — 検討したが採用しなかった選択肢

**① 「React Native / Expo でネイティブに作り直す」**（コミット `728664c`・`docs/native-options.md`）
- 魅力: 正直に言えば、**職歴として一番効くのはこれ**でした。ひとつのコードで iOS と Android、
  本物のネイティブUI、そして Expo の EAS Update なら**JS の修正を審査なしで数分で全端末へ**配れる。
  Mac が無くても iOS ビルドが作れる。求人も多い。
- 捨てた理由: 実測すると移植ではなく作り直しでした — Canvas 2D の呼び出し **708箇所**、
  `document.` 46、`navigator.` 30、`addEventListener` 27、`localStorage` 18、
  WebRTC とサービスワーカー、**依存ゼロの 8,926行**。RN に canvas はありません。
  そして一番痛いのは、**このセッションのバグの大半を見つけた Playwright の検証装置を失う**こと。
  ストアに出すなら **Capacitor**（いまのコードをそのまま包む）。
  **RN は「別の小さいアプリを2週間で1本」で学ぶほうが速い**、と結論を分けて書きました。

**② 「ストリーク催促のプッシュ通知を入れる」**（README「まだ実装していない拡張」）
- 魅力: 連続日数は**夜のあいだに死ぬ**ので、通知はこの手のゲームで最も効く定石です。
  新しいコンテンツを1つも作らずに、戻ってくる理由を作れる。
- 捨てた理由: 本格対応には Service Worker + Web Push（VAPID鍵）+ Vercel Cron が要り、
  iOS はホーム画面に追加した人にしか出せません。**新しい常駐依存を1つ増やす**のに対して、
  得られるのは「タイトルで催促する」との差分だけ。いまは開いた時のタイトル催促で軽く済ませています。

**③ 「世界の計算を常駐サーバーへ移す」**（`docs/multiplayer.md` 段3）
- 魅力: これをやると4つの問題が**まとめて消えます** — ホストだけ遅延ゼロの不公平、
  ホストが抜けると世界が消える、ホストが改造すれば何でもできる、人数の上限。
  3〜4人と遠隔の安定運用に進むなら、これが正攻法です。
- 捨てた理由: **2人で遊ぶ限り、直結のほうが速くて安くて正しい。** 往復が1回増えるので、
  直結できている組にとっては改悪になります。そして自分で書いた原則
  「サーバーはゲーム中の経路に入れない」を破ることになる。
  **やる合図は決めてあります**（5人以上をやると決めたとき、または実際のテスターから
  「ホストが抜けて理不尽」が出たとき）。

**④ 「後半のキャラを、ほんの少しだけ強くする」**（`docs/balance.md` §6）
- 魅力: ほぼすべてのゲームが「進むと強くなる」で報酬を作っています。**一番実装が楽で、
  一番よく効く**設計で、開放を報酬に見せるならこれが自然です。
- 捨てた理由: これがまさに「チートになる」と言われた当のものでした。
  そして **1%でも入れたら、次の調整で必ず広がります**。開放と火力の相関そのものを
  テストで禁止するほうを選びました。

---

## 7. Evidence（証拠）— 3グループ

> 判定 B なので、実素材ではなく **実測値・構造図・「前と後」の数字**で証拠を作ります。
> 動画の型は **§8-3（合成して1本）**です — スマホを触ると**もう1台のスマホに相方が飛ぶ**
> という**同時性そのもの**が主張なので、2本を並べるのではなく編集で1本に合成します。
> 比較（§8-4）ではありません。

### グループ 1 — 窓ではなく、遊ぶ板

- **見出し**
  - EN: `The window was never the playfield.`（35字 / 上限40）
  - JP: `窓ではなく、遊ぶ板を決めた`（13字 / 上限20）
- **リード文**
  - EN: On a 1920px window the ship was 2% of the board's width and enemies spawned 700px
    away — they left the screen before you could reach them. That is not a cosmetic problem;
    it was a different game. The fix was to redefine what W and H mean, without touching a
    single line of drawing code.
  - JP: 1920px の窓では自機が盤面の幅の **2%**（電話では10%）、敵は **700px** 先に湧いて、
    届く前に画面を抜けていました。見た目の問題ではなく、**別のゲームになっていた**。
    直したのは `W` / `H` の意味だけで、**描画コードは1行も触っていません**。
- **含まれる素材**: 「窓 → 板」の対比図（`MEDIA.md` ② AIができる・文字で書けば十分）／
  実測の表（電話 10% vs デスクトップ 2%、敵まで 200px vs 700px）／
  検証の表（30画面すべて一致 / 重なり4組が0組へ / はみ出し0件 / 4つの窓幅で実際にクリック）

### グループ 2 — 十六体を、ひとつの数字で縛る

- **見出し**
  - EN: `Sixteen characters, one number.`（31字 / 上限40）
  - JP: `十六体を、ひとつの数字で縛る`（14字 / 上限20）
- **リード文**
  - EN: Five stat bars let you raise one and lower another while the total climbs unseen.
    One multiplication cannot. `powerScore` folds punch, rate, aim, width, range, pierce and
    speed into a single figure, all sixteen sit inside ±1%, and a second test fails if the
    early half of the unlock ladder drifts more than 4% from the late half.
  - JP: 棒が5本あると、1本を伸ばして1本を削るあいだに全体が強くなっていても誰も気づけません。
    掛け算1本ならそれができない。`powerScore` は一撃・連射・狙い・太さ・射程・貫通・弾速を
    1本に畳んだ数字で、**16体が ±1%**。もう1本のテストが、**開放順の前半と後半で
    4%以上ずれたら落ちます**。
- **含まれる素材**: `powerScore` の式と、各項が「何を値段として付けているか」の表
  （② AIができる・原稿は `docs/balance.md` §3-2 にそのまま在ります）／
  ⚡ の「前 = 無制限の貫通・1発が5〜6発ぶん」→「いま = 2体・1発1回」の対比帯（②）／
  開放の階段（3体 → 1面ごとに1体 → 13面で16体）の図（②）

### グループ 3 — 画面なしで、ゲーム内5分を0.29秒

- **見出し**
  - EN: `Five game-minutes, no screen, 0.29s.`（36字 / 上限40）
  - JP: `画面なしで五分を0.29秒`（13字 / 上限20）
- **リード文**
  - EN: An auto-pilot bot clears a stage, dies, respawns, burns through its lives and ends
    the run, with no screen attached — `src/engine.js` contains zero DOM references. Building
    that harness found two real bugs that had nothing to do with tests: a BGM timer that kept
    Node alive forever, and a respawn that waited on wall-clock time instead of game time.
  - JP: 自動操縦のボットが1ステージをクリアし、死んで復活し、残機を使い切って終わる —
    その全経路を画面なしで通します（`src/engine.js` の DOM 参照は **0件**）。
    そしてこの装置を作る過程で、**テストとは無関係の実バグが2つ**出ました。
    BGM のタイマーが止まらず Node が終わらない件と、**復活が実時間で待たれていた**件です。
    後者は、裏タブで復活が止まるバグと、死んだ直後に始め直すと前回の復活が新しい回に
    発火するバグを、同時に消しました。
- **含まれる素材**: 実測値の帯（0.29秒 / 実時間の1,030倍 / 1歩16.2μs / DOM参照0件）（②）／
  ホスト権威の同期の図（ホストだけが計算し約15Hz（66ms）で配信、ゲストは補間、
  自機と自分の弾はローカル）（②）／`node --test test/*.test.js` の出力（③ 本人が撮る・
  この環境では実行していません）

---

## 8. メディア素材リスト

→ **`MEDIA.md`** に全部書きました。①既にある／②AIができる／③本人が撮る の振り分けと、
③には6項目の撮影指示を付けてあります。冒頭に「本人のTODO」だけを抜き出した表があります。

**この案件は③が多くなります。** 実際のプレイ画面がリポジトリに1枚も無く、
2台のスマホが関わる収録は全部③だからです。②に振り分けたものは**まだ何も作っていません**
（`MEDIA.md` の「② の確認待ちリスト」）。

---

## 9. Proof（成果）

> 数字はページ全体でここ1回だけ。**3つとも実測**で、出典と確認日を付けています。
> **重要**: このセッションではテストもビルドも実行していません（読む・検索する・書くだけ）。
> ①②はリポジトリの文書に記録された実測値で、**記録された日**を確認日として書いています。
> ③だけが 2026-09-06 に私が数え直したものです。

### ① `0.29秒` — ゲーム内5分を、画面なしで

- 実測 / 見込み: **実測**
- 出典: `docs/multiplayer.md:267`（`README.md:189` にも同じ記載）。
  自動操縦のボットが `test/headless.js` の上で走った計測。実時間の **1,030倍**・1歩 **16.2μs**。
  同じ文書に **`src/engine.js` の DOM 参照が0件**であることも併記されています。
- 確認日: **2026-07-29**（文書に記録された日。**2026-09-06 の本作業では再測していません**）
- 説明（EN）: The whole path — spawn, shoot, hit, die, respawn, boss, clear, next stage —
  runs with no screen attached. That is what makes the engine portable to a server, and it
  is also a regression test for long sessions that no human has the patience to run.
- 説明（JP）: 「湧く→撃つ→当たる→死ぬ→復活→ボス→クリア→次の面」の全経路を、画面なしで通します。
  これは常駐サーバーへ載せられることの証明であり、同時に**人間には退屈で走らせられない
  長時間プレイの回帰テスト**でもあります。

### ② `±1%` — 16体の実効火力の幅

- 実測 / 見込み: **実測**
- 出典: `docs/balance.md` §3-2。`src/config.js` の `CHARS` に対して `powerScore` を計算し、
  16体が **1.011倍の幅**に収まっていること。テストは **1.15倍**で落ち、
  さらに**開放順の前半8体と後半8体の平均が4%以上ずれたら落ちる**テストが別にあります。
- 確認日: **2026-08-19**（`docs/balance.md` / `docs/status.md` に記録された日）
- 説明（EN）: "Later characters are not stronger" is usually a promise. Here it is a test
  that fails. The ladder is allowed to add quirk and take away obedience, and nothing else.
- 説明（JP）: 「後から開くキャラは強くない」はふつう約束事ですが、ここでは**落ちるテスト**です。
  階段が足していいのはクセだけで、代わりに**言うことを聞かなくなる**。それ以外は足せません。

### ③ `0` — 依存パッケージも、ビルド工程も

- 実測 / 見込み: **実測**
- 出典: 私がこのリポジトリを 2026-09-06 に確認したもの。**`package.json` も lock ファイルも
  バンドラの設定も存在しない**。`src/` は 26ファイル・**9,348行**、`test/` は 17ファイル・3,748行
  （`wc -l`）。テストは Node 22 標準の `node --test` だけで走ります。実行時に自動で外へ出る
  第三者は `api.open-meteo.com` の**1つだけ**で、増えたらテストが落ちるように縛ってあります
  （`docs/store-readiness.md` §2）。
- 確認日: **2026-09-06**
- 説明（EN）: `index.html` opened over plain HTTP is the whole product. No build, no
  framework, no CDN — which is also why it starts with the network off, and why the
  Service Worker has something small enough to cache in the first place.
- 説明（JP）: `index.html` を開けば、それが製品の全部です。ビルドもフレームワークも CDN も無い。
  **電波が無くても起動する**のも、Service Worker がキャッシュできる大きさに収まっているのも、
  もとを辿ればここです。

### 数字が言えない部分（正直に）

> **この設計が動かしたのは、いまのところ私自身の判断です。**
> `docs/status.md` に、**コードでは動かせない唯一の項目**として
> 「家庭の外の人に5人以上遊ばせる。判定は『言われなくても2回目を始めるか』だけ」と
> 自分で書いて、そこで止めてあります（2026-07-29 / 2026-08-19 更新）。

利用者数・継続率・売上といった外向きの数字は **一つもありません**。
公開URLが確認できず、家庭の外の人に一度も遊ばせていないからです。
`docs/store-readiness.md` は「面白さの証明」を **45点**とし、
その根拠を「**子供2人が自発的に面白いと言ったから**」と書いています。
数字として弱いことを承知で、そう書いてあることのほうが証拠だと思っています。

### 定性的な証明

- **子供の一言が、実装を1本生んだ**。「2人でも1人と変わらない」→「きずな」（`src/tether.js`）。
  同じ一言から、技16種と合体も入りました（`docs/status.md` 17項）。
- **位置情報を、機能ごと捨てた**。`navigator.geolocation` の呼び出しをコードから完全に削除し、
  端末のタイムゾーンから地域を推定する形に変えた。許可ダイアログも出ず、座標も送らず、
  逆ジオコーディングの第三者APIも丸ごと不要になった。**復活したらテストが落ちます**
  （`docs/store-readiness.md` §2、2026-07-29）。
- **中継サーバーは、実際に接続して検証している**。Node 22 標準の WebSocket クライアントで
  3〜4人の部屋・送り主の識別・流量制限・70KBのメッセージ・絵文字まで通す
  （`test/server.test.js`）。負荷は 50部屋/100接続で **p95 1.63ms**（`docs/status.md`、2026-07-29）。
- **判断が全部文書に残っている**。`docs/` 13本（brief / balance / layout / story / multiplayer /
  costs / native-options / store-readiness / privacy / status / product-idea / superforge / emoji）。

### 参考として持っている実測値（**ページには載せない**・要再測）

| 値 | 出典 | 記載時点 |
|---|---|---|
| 自動テスト 192件・全パス | `docs/status.md` | 2026-07-29 |
| 自動テスト 201件・全パス | `docs/layout.md` §3 | 2026-08-01 |
| `test/*.test.js` の `test(` 宣言 **212件**（15ファイル） | 私が 2026-09-06 に静的に数えたもの。**実行していません** | 2026-09-06 |
| ワールド配信 1通 **2,211バイト**を毎秒15回。2人=122MB/時 / 4人=391MB/時 | `docs/costs.md`（このゲームの実測から計算） | 2026-07-29 |
| P2P 直結の遅延 20〜80ms | `docs/brief.md` / README | 2026-07 |
| ボスHP 2人154 / 3人231 / 4人308、残機 5/7/9 | README（`src/` の実装値） | 2026-08 |
| React Native 判断の根拠: Canvas2D 708箇所 / `document.` 46 / `navigator.` 30 / 8,926行 | `docs/native-options.md` | 2026-07-30 |

### 使った技術・ツール・手法

`Vanilla JavaScript（ESモジュール・ビルド工程なし・依存パッケージ0）` / `Canvas 2D` /
`Web Audio API（自前合成BGM・先読みスケジューラ・緊張度によるレイヤー増減）` /
`WebRTC DataChannel（ホスト権威・約15Hz スナップショット・補間）` /
`WebSocket（RFC 6455 を自前実装した任意の中継サーバー・依存ゼロ）` /
`自前QRエンコーダ` / `Vercel サーバーレス関数（Gemini / シグナリング / ランキング）` /
`Gemini（ステージ生成・端末内の手続き生成にフォールバック）` / `Open-Meteo（キー不要の天気）` /
`PWA・Service Worker（本体は network-first / アイコンは cache-first / api は非キャッシュ）` /
`localStorage（ストレージ障害に耐性）` / `node --test（Node 22 標準）` /
`Playwright（レイアウトの数値計測）` / `画面なしのゲームハーネス` /
`AIエージェント運用（superforge スキル群）`

---

## 10. Retrospective スライド

### ① 4人プレイは、テストの中では動いている

- **見出し**
  - EN: `Four players work in tests, not in public.`（42字 / 上限50）
  - JP: `4人は動くが、公開状態では遊べない`（17字 / 上限25）
- **本文**
  - EN: The four-player code is written and its tests pass, and four browser windows on one
    machine stay in sync — positions, enemies, lives, even the host handover. It does not
    work in public because no relay server is running anywhere, and `index.html:12` is the
    one empty line that says so. That is a money decision, not a code decision, and I
    deliberately stopped in front of it instead of spending on it.
  - JP: 4人プレイのコードは書けていて、テストも通り、1台のブラウザ4枚なら位置も敵も残機も、
    ホストの引き継ぎまで一致します。公開状態で遊べないのは、**中継サーバーがどこにも
    立っていない**からで、`index.html:12` の空の1行がそれを示しています。
    これはコードの問題ではなく**お金の判断**なので、踏み込まずに止めてあります。
    月$2〜7から立てられることまでは調べてあります（`docs/costs.md`）。

### ② 面白さの証拠は、子供二人ぶんしかない

- **見出し**
  - EN: `Two children liked it. That is the whole evidence.`（50字 / 上限50）
  - JP: `面白さの証拠は、子供二人ぶんしかない`（18字 / 上限25）
- **本文**
  - EN: My own readiness document scores "proof that it is fun" at 45 out of 100, and says
    the reason for the 45 is that two children said so unprompted. The test I wrote for
    myself is whether five strangers play it and start a second run without being asked.
    I have never run it. Real phones have never run it either — the layout work was verified
    in eleven viewports in a headless browser, not on an actual iPhone.
  - JP: 自分で書いた準備状況の文書は「面白さの証明」を **45点**とし、その45の理由を
    「子供2人が自発的に面白いと言ったから」と書いています。私が自分に課した判定は
    **「家庭の外の人が5人以上遊んで、言われなくても2回目を始めるか」**だけですが、
    一度もやっていません。**実機も同じです** — レイアウトの検証は11のビューポートを
    画面なしのブラウザで撮ったもので、**本物の iPhone では一度も確認していません**。

### ③ この README が、いまだに別のゲームを説明している

- **見出し**
  - EN: `My own README still describes a different game.`（47字 / 上限50）
  - JP: `README がいまだに別のゲームを説明している`（24字 / 上限25）
- **本文**
  - EN: The repository README says the game has six characters. `src/config.js` has sixteen,
    and has had sixteen since the same day that line was written. The same drift produced a
    longer-lived error: for weeks the documents implied this game was built on my own
    Snap Pair library, and it has never used it once. When agents write the code faster than
    anyone reads it, the record goes wrong before the code does — and the record is what the
    next session, human or not, will believe.
  - JP: リポジトリの README は「キャラクター選択(6体)」と書いています。`src/config.js` は
    **16体**で、しかもその行が書かれたのと同じ日から16体でした。同じずれから、もっと長生きした
    間違いも出ています — 数週間のあいだ、文書はこのゲームが自作の Snap Pair 基盤の上に
    建っているかのように読めましたが、**一度も使っていません**。
    **誰かが読むより速くエージェントがコードを書くと、コードより先に記録のほうが嘘になります。**
    そして次のセッション（人でもAIでも）が信じるのは、記録のほうです。

---

## 11. Closing（締めの一文）

- **EN**: `Progress should add **quirk**, never power.`
- **JP**: `進んで増えるのは**クセ**で、強さではない。`

（EN 39字 / JP 19字）※`**` は字数に数えていません（EN 上限50 / JP 上限25）

補足（スライド下に小さく添えるなら）:
- EN: Sixteen ships, all within one percent of each other, and a test that fails if the
  ladder ever starts to slope.
- JP: 16体が ±1% に並び、階段が傾き始めたらテストが落ちます。

---

## 12. アクセント色

**ティール `#0d9488`** を推します。

- 理由: 指定表で **Interactive / その他 = ティール**（`portfolio-template-system.md` §2-4）。
  この作品自身は面ごとに配色が総入れ替えになるので、**「この作品の色」と言える1色が存在しません**
  （🌤 スカイ / 🌊 ディープ / 🕳 フリーフォール / 🏙 ネオン / 🌋 マグマ / 🌌 ギャラクシー）。
  だから索引ページ側の秩序に合わせるのが正しい。地の色は `#05050f`（`manifest.webmanifest` の
  `theme_color`）なので、暗地にティールは素直に乗ります。
- **注意（要確認）**: `resona` のケーススタディも同じティールを提案しています。
  同じ索引（Interactive Experience）で隣り合うなら片方をずらす必要があります。
  ずらすならこちら側を **紫 `#7c3aed`**（AIが製品の中に3系統入っていることの合図になる）に
  するのを推します。→ `OPEN-QUESTIONS.md` Q-8。

---

## 提出前の自己確認

- [x] 見出しは全部、字数を書き添えた。上限超過は **0件**（EN/JP とも `**` を除いて計測）
- [x] EN と JP が両方ある（見出し・リード・本文・チップ・説明文すべて）
- [x] §9 の数字3つに、実測/見込み・出典・確認日を付けた。
      **①②は文書に記録された日であって、本作業で再測した値ではないと明記した**
- [x] 「不明・要確認」は `OPEN-QUESTIONS.md` に全部転記した
- [x] §6.5 の不採用案4つに、それぞれ**魅力**を書いた（特に①は「職歴として一番効く」と認めた）
- [x] Retrospective に、成果欄に書けないことだけを書いた（3つとも未解決・未検証）
- [x] メディアは**1点も生成していない**。①はコピー、②は確認待ち、③は撮影指示（→ `MEDIA.md`）
