# EMOJI DROP ULTIMATE — ケーススタディ素材

> 書いた人: このリポジトリの開発に携わってきたAIセッション
> 最終更新: 2026-08-12
> 対象コミット: `0046ca0`（ブランチ `claude/multi-game-concurrent-tech-6y36cx` / PR #4・未マージ）
>
> **未確定の項目は `OPEN-QUESTIONS.md` に全部集約してあります。そちらから読んでください。**

---

## 0. このプロジェクトの見せ方（判定）

- [x] **A: 証拠先行型**（全8〜10枚）

**理由**: 実画面のスクリーンショットが10枚あり、全部このリポジトリの実物から撮っている（`assets/`）。モックアップは1枚も無い。

補足: 判定基準の「8枚以上」は満たしているが、**この案件は物語も強い**（後述の Tension / Structure が空欄にならない）。A の骨格に、Tension と Structure を省略せず入れる形を想定している。C ではない — 道具ではなく遊ぶもの。

---

## 1. 基本情報

- **プロジェクト名**
  - EN: `EMOJI DROP ULTIMATE`
  - JP: `エモジドロップ アルティメット`
- **スラッグ**: `emoji-drop-ultimate`
- **掲載カテゴリー**:
  - [x] **Interactive Experience** — その場の全端末が入力になるもの
  - 理由: この作品の核は「その場にある1〜4台のスマホが、常駐サーバーを介さず直接つながって1つのゲームになる」こと。**⚠️ AI Products も成立しうる**（ステージ生成に Gemini を使っている）ので、`OPEN-QUESTIONS.md` Q1 で確認をお願いしています。
- **入力ラベル（1語）**: `Every phone`
- **クライアント/対象**: Personal Project
- **自分の役割**: **不明・要確認**（`OPEN-QUESTIONS.md` Q2）。リポジトリからは「本人が方向を決め、AIセッションが実装した」構図しか読み取れず、肩書きの表記は本人にしか決められない。候補: `Game Designer / Creative Director (AI-assisted implementation)`
- **制作年・期間**: 2026-07-28 〜 2026-08-12（**約2週間・56コミット**。出典: `git log`、確認日 2026-08-12）
- **公開リンク**:
  - リポジトリ: https://github.com/takaoumehara/EmojiDropUltimate
  - 公開URL: **不明・要確認**（Vercel の本番ドメインは `emoji-drop-ultimate.vercel.app` と推測されるが、公開してよいURLかは本人判断。`OPEN-QUESTIONS.md` Q3）
- **現在の状態**: 公開中（ソロ・ふたり）/ 4人対応は **PR #4 で未マージ**
- **機密上の制約**: 無し

---

## 2. 一覧カード用の要約

- **カード用タイトル**
  - EN: `Emoji Drop Ultimate`（EN 19字）
  - JP: `エモジドロップ`（JP 7字）
- **カテゴリタグ**: `Game Design` / `Real-time Multiplayer` / `Browser Game`
- **1文の説明**
  - EN: `A browser shooter where every phone in the room joins the same fight — no game server, and the more of you there are, the harder it gets.`
  - JP: `その場のスマホが全部そのまま参戦するブラウザシューティング。常駐サーバーは無く、人数が増えるほど難しくなる。`
- **フッター用メタ**: `Vanilla JS · Canvas 2D · WebRTC mesh · Vercel Functions · Gemini`

---

## 3. Hero スライド

- **大見出し**
  - EN: `Two players made it **easier**. That was the bug.`（EN 45字）
  - JP: `ふたりで遊ぶと**簡単になった**。それが不具合だった。`（JP 24字）

- **リード文**
  - EN: `I built a co-op shooter for up to four phones, with no game server behind it. Then someone played it with a friend and it got *easier* — the party gained firepower while the game gained almost nothing. I tore out the mechanic that was doing that and replaced it with one where power costs you your freedom.`
  - JP: `スマホ4台までが常駐サーバー無しで繋がる共闘シューティングを作った。ところが、ふたりで遊ぶと**簡単になった**。火力は人数ぶん増えるのに、脅威はほとんど増えていなかったからだ。原因になっていた仕組みを丸ごと捨て、「強くなる代わりに自由を失う」形に置き換えた。`

- **チップ（3個・各10文字以内）**
  - EN: `WebRTC mesh` / `Zero deps` / `4 players`
  - JP: `網目型P2P` / `依存ゼロ` / `4人同時`

---

## 4. Tension スライド

### 「前」側

- **タグ**: EN `Where it started` / JP `出発点`
- **見出し**
  - EN: `More players, less game.`（EN 24字）
  - JP: `人が増えるほど、楽になる。`（JP 13字）
- **本文**
  - EN: `Two players brought roughly double the firepower. The game answered with 22% more enemies and a boss with 2.2× health. On top of that sat a mechanic called the Tether — a line strung between two phones that cut any enemy it touched. It worked without anyone doing anything.`
  - JP: `ふたりなら毎秒の火力はおよそ2倍になる。それに対してゲームが返していたのは、敵の湧き1.22倍とボスの体力2.2倍だけだった。さらにその上に「きずな」が乗っていた —— 2台のあいだに張られ、触れた敵が勝手に切れる線。**誰も何もしなくても効いていた。**`
- **チップ3個**
  - EN: `Free damage` / `Scales wrong` / `No cost`
  - JP: `タダの火力` / `割に合わない` / `代償が無い`

### 「後」側

- **タグ**: EN `What it became` / JP `再設計後の姿`
- **見出し**
  - EN: `Power you pay for, in freedom.`（EN 30字）
  - JP: `力の代金は、自由で払う。`（JP 12字）
- **本文**
  - EN: `An enemy now raises its shield toward whoever is nearest, and it carries one shield fewer than there are players. So exactly one person — the furthest — can hurt it. Step forward and you cannot shoot, but you are holding the shield off everyone else. Nobody can do this alone.`
  - JP: `敵は一番近い人に盾を向ける。盾の数は「人数−1枚」。だから、いつでも**一番遠いひとりだけ**が背中を撃てる。前に出た人は撃てないが、そのぶん盾を引きつけている。ひとりでは自分が必ず一番近いので、**物理的に倒せない。**`
- **チップ3個**
  - EN: `Bait & shoot` / `Roles rotate` / `Solo-proof`
  - JP: `囮と狙撃` / `役が回る` / `ソロ不可`

---

## 5. Approach スライド

- **大見出し**
  - EN: `Do not add power. Add a **price**.`（EN 30字）
  - JP: `力を足さない。**代償**を足す。`（JP 13字）

- **リード文**
  - EN: `The Tether was not too strong — it was free. A co-op mechanic that pays out while both players just exist reads as cheating, because nobody gave anything up for it. So I stopped asking "what can two people do that one cannot?" and started asking "what can two people *afford* that one cannot?" The answer was position: one player spends their ability to shoot so another gets a clear line. That trade cannot be made alone, and it has to be re-made every few seconds.`
  - JP: `きずなの問題は強さではなく、**タダだったこと**。ふたりが存在しているだけで効いてしまう共闘は、遊ぶ側からは「ずるい」としか見えない。何も差し出していないからだ。だから問いを変えた。「ふたりだからできることは何か」ではなく、「**ふたりだから払えるものは何か**」。答えは立ち位置だった。ひとりが撃つ能力を差し出して、もうひとりの射線を空ける。この取引はひとりでは成立しないし、数秒ごとに結び直さなければならない。`

---

## 5.5. Structure スライド

このプロジェクトには**構造の作り替えが2つ**ある。ページに入れるなら 5.5-A のほうが強い（見た目の変化ではなく、成立条件そのものが変わっているため）。5.5-B は §6 Moves に回してもよい。

### 5.5-A. 共闘の繋ぎ方（v1.0 → v2.0）

**再設計前の構造**

```
部屋（あいことば6文字）
└── api/signal.js の棚 … 1部屋につき 2枚だけ
    ├── offer   … ホストが置く
    └── answer  … ゲストが置く
        └── RTCPeerConnection … 1本だけ
            └── 相手 = ひとり  ← ここで打ち止め

3人目以降:
└── 中継サーバー（server/）を経由する前提
    └── そのサーバーは どこにも立っていなかった → 遊べない
```

**そのツリーの何が壊れていたか**: 「直結は相手ひとりまで」は WebRTC の制約ではなく、このコードの決めごとだった。本当に足りなかったのは**握手を置く場所**で、3人目は自分の offer を置く棚すら持っていなかった。だから「4人で遊べない」は、ゲームの問題ではなく**出会い方の問題**だった。

**再設計後の構造**

```
部屋（あいことば6文字）
├── 名簿          … いま誰が居るか。全員が同じ顔ぶれを見る
├── 組ごとの棚     … 「A×B」「A×C」「B×C」… 組の数だけ独立して持つ
│   └── 各組が自分の offer/answer をそこに置く
├── 直結の束（網目）… 各自が「自分以外の人数」ぶんの線を張る
│   └── 4人なら 各自3本・全体で6本
├── 権威           … 世界の計算はホスト1人が持ち、15〜20Hz で配る
└── 後継の規則      … ホストが消えたら、番号の若い人が引き継ぐ
                     （誰から見ても同じ答えになる規則にする）
```

**命名を変えたもの**: 無し。**v1.0 が使っていた棚の名前をそのまま残した**ので、旧版のクライアントは同じ API で今までどおり繋がる（互換を壊さないための判断）。

**この2つを並べて一番言いたいこと**: 4人で遊べなかったのはゲームの限界ではなく、**握手を置く棚が2枚しか無かったから**だった。

### 5.5-B. 共闘の核（v2.0 → v2.1）

**再設計前**

```
きずな（線）
├── 発生条件: ふたり以上が生きている  ← 立ち位置も操作も関係ない
├── 効果: 線に触れた敵が切れる
└── 人数が増えると … 線が増える → さらに楽になる
```

**壊れていたところ**: 発生条件に**プレイヤーの選択が1つも入っていない**。人数が増えるほど有利になり、「4人だからこそ」の逆へ進んでいた。

**再設計後**

```
盾持ち（敵）
├── 盾の枚数 = 生きている人数 − 1     ← 必ずひとり余る（詰みもザルも作らない）
├── 盾の向き = 近い順に人へ            ← 角度ではなく「距離の順位」で決める
├── 撃てる人 = 一番遠いひとり だけ
└── 前に出た人 … 撃てない／盾持ちに狙われる（＝囮の代償）

ベル
├── 位 = そのベルを鳴らした「異なる人」の数
└── ソロは位1が上限                    ← 人数がそのまま強さの上限になる
```

**この2つを並べて一番言いたいこと**: 共闘を成立させるのは**能力の足し算**ではなく、**ひとりでは払えない代償**だった。

---

## 6. Problems / Moves スライド

**Moves 型**（順を追った意思決定）を推奨。この案件は「調べる → 直す」ではなく「疑う → 数える → 捨てる → 置き換える」の順で進んだ。

- **01 疑う**
  - 見出し: EN `A complaint, not a bug report.` / JP `バグ報告ではなく、感想だった。`
  - 説明: 「ふたりでやったら全然簡単になっちゃってる」。これは再現手順のある不具合ではない。何が起きているのか、まず数えられる形にする必要があった。

- **02 数える**
  - 見出し: EN `The arithmetic did not add up.` / JP `足し算が合っていなかった。`
  - 説明: 火力は人数にほぼ比例して増える（2人で約2倍）。一方で脅威は、湧き1.22倍・ボス2.2倍・弾の量は据え置き。数えた時点で、感想ではなく**設計の誤り**だと確定した。

- **03 捨てる**
  - 見出し: EN `The strongest feature was the problem.` / JP `一番強い機能が、原因だった。`
  - 説明: きずなは看板機能で、専用のテストもあった。だが問題は強さではなく「タダで効くこと」だったので、数値調整では直らない。モジュールごと削除した。

- **04 置き換える**
  - 見出し: EN `Make position the currency.` / JP `立ち位置を、通貨にする。`
  - 説明: 盾持ちとベルの受け渡しを入れ、脅威を人数に正比例させた。調整点は `COOP_TUNE` 1箇所に集約し、後から締め具合だけを動かせるようにした。

---

## 6.5. Craft スライド

**判定: [x] 使った** — このプロジェクトは実装のほぼ全量をAIセッションが書いている。本人は方向と却下を担当した。

### A（AIを使った場合）

- **AIに何をさせたか**: 設計の提案、実装、テストの作成、ドキュメント。加えて **検証の道具づくり**（実ブラウザを4枚立ち上げて WebRTC を握手させる、実機幅でスクリーンショットを撮ってボタンを実際に押す）。

- **AIが出した案のどこがダメだったか** — 3つとも、このリポジトリで実際に起きたこと:

  1. **代償を設計しなかった。** 「ふたりで遊ぶ意味」を求められたAIは、ふたりのあいだに線を張って敵を切る機能を作った。強くて、見た目も派手で、ちゃんと動いた。**払うものが1つも無いことに気づいていなかった。** 力を足すのは簡単で、力に値段を付けるのは難しい。そこが抜ける。
  2. **「テストが緑＝できた」と判断した。** 「あそびかた」ページは自動テストが全部通っていたが、実ブラウザで描かせたら3つ壊れていた —— タップ領域が iPhone SE で31px（最小44ptを下回る）、日本語の本文から一節が消えていた、そして英語が `carriesa cost` になっていた。**どれも例外を出さない壊れ方**で、テストからは見えない。
  3. **直した拍子に別の場所を壊した。** 上の2つ目を直した実装が、3つ目を生んだ。1文字の単語（"a" / "I"）の前の空白を落としていた。

- **そこに人間として何を足したか**: 「ずるい」という一語。これは測れないし、テストにも書けない。**数値ではなく、遊んでいる人の座り心地が判定基準**だと決めたのが人間側で、そこからは「強すぎるのか / タダなのか」を切り分ける作業になった。

- **試した案の数と、選定の基準**: 共闘の核として4案（下の「採用しなかった案」参照）。基準はひとつ、**「ひとりでは物理的に成立しないか」**。ふたりで有利になるだけの案は全部落とした。

### A・B 共通 — 採用しなかった選択肢

1. **「きずなの数値だけ弱める」**
   - 魅力: 変更が小さく、既存の見た目・テスト・ドキュメントを1つも壊さない。1時間で終わる。
   - 捨てた理由: 弱いきずなは「弱いのにタダ」になるだけで、「何もしなくても効く」構造はそのまま残る。感想は「簡単すぎる」から「地味」に変わるだけで、原因は消えない。

2. **「盾を角度で判定する」**
   - 魅力: 物理的に自然。回り込むという身体的な動きがそのまま効くので、説明しなくても伝わる。
   - 捨てた理由: 敵が画面の上にいるあいだ、下にいる全員はほぼ同じ方向に見える。1枚の盾が全員を塞ぎ、「何をしても効かない」時間ができる。距離の順位に変えると、どんな距離でも必ずちょうど1人が撃てる側に残る。

3. **「人数の違いを、起動時のチュートリアルで説明する」**
   - 魅力: 確実に伝わる。作るのも一番速い。
   - 捨てた理由: 起動して最初に見せたものは飛ばされる。そして飛ばされたものは、本当に知りたくなった時にはもう開かれない。**任意で開ける常設ページ**に変え、一時停止からも開けるようにした（疑問が湧くのは遊んでいる最中だから）。

---

## 7. Evidence（証拠）

3グループに分ける。

### グループ1: 「遊びそのもの」

- 見出し: EN `A shooter you can read at a glance.`（EN 35字）/ JP `見ればわかるシューティング。`（JP 14字）
- リード: EN `Everything on screen is an emoji, so what is a threat and what is a reward never needs a legend.` / JP `画面のものが全部絵文字なので、何が敵で何が褒美かに凡例が要らない。`
- 素材: `01-title.png` / `04-play-solo.png` / `05-boss.png`

### グループ2: 「その場の全端末が繋がる」

- 見出し: EN `Six characters, and everyone is in.`（EN 35字）/ JP `6文字で、その場の全員が入る。`（JP 15字）
- リード: EN `A room code, a QR, or a link. Up to four phones connect straight to each other — there is no game server to wait for.` / JP `あいことば・QR・リンクのどれでもいい。4台までが直接つながる。待つべきサーバーが無い。`
- 素材: `06-coop-lobby.png`（**⚠️ 要撮り直し。`MEDIA.md` 参照**）

### グループ3: 「人数で、遊びが変わる」

- 見出し: EN `The same game, re-tuned per person.`（EN 35字）/ JP `人数ごとに、別の遊びになる。`（JP 14字）
- リード: EN `Lives, enemy volume, shields and bell rank all move with the party size — and the in-game page shows the exact table, pulled live from the engine.` / JP `残機・敵の量・盾の枚数・ベルの位が、人数でそのまま動く。ゲーム内のページはその表を、エンジンから直接引いて出している。`
- 素材: `07-help-solo-vs-party.png` / `08-help-how-to-connect.png` / `10-pause.png`

---

## 8. メディア素材リスト

→ 詳細は **`MEDIA.md`**（チェックボックス形式）。

---

## 9. Proof（成果）

### 数値化できる成果（3つまで）

このプロジェクトは**個人開発で、利用者数の計測はしていない**。だから「何人が遊んだか」は書けない。書けるのは、**作りの性質そのものを示す数字**だけ。以下の3つはすべて、この文書を書いた日にこのリポジトリで実行して確認した。

1. **常駐サーバー 0台 / 月額 0円で、4人同時**
   - 実測 / 見込み: **実測**（構成として。実機4台での通しプレイは未検証 → §10）
   - 出典: `src/coop.js` の `MAX_PLAYERS = 4`。サーバーは Vercel のサーバーレス関数（`api/signal.js`）だけで、常駐プロセスは無い。実 Chromium 4枚で4人接続・各自3本の直結・ホスト離脱時の後継選出まで確認済み
   - 確認日: **2026-08-12**

2. **依存パッケージ 0 / ビルド工程 0**
   - 実測 / 見込み: **実測**
   - 出典: リポジトリに `package.json` が存在しない。`index.html` を開けば動く。全 37 本の JS モジュール・10,247 行はすべて素の JS
   - 確認日: **2026-08-12**

3. **自動テスト 268件・全通過**
   - 実測 / 見込み: **実測**
   - 出典: `node --test test/*.test.js` をこのリポジトリで実行（22ファイル）。うち `wrap.test.js` の3件は、実ブラウザで見つけた不具合の再現テストとして後から足したもので、**修正前のコードでは落ちる**ことを確認済み
   - 確認日: **2026-08-12**

### この設計は、誰の・何を動かしたか（数字が無くても必ず書く一文）

- EN: `Four people who happen to be in the same room can be playing the same game about fifteen seconds after one of them says six letters out loud — with nothing installed, no account, and no server running anywhere.`
- JP: `同じ場所に居合わせた4人が、誰かが6文字を口に出してから**およそ15秒**で同じゲームの中にいる。インストールも、アカウントも、どこかで動いているサーバーも要らない。`

  ※「およそ15秒」の出典: 実 Chromium 4枚での接続試行4回のうち3回が15秒前後で全員接続。残り1回は握手のやり直しが入り81秒。確認日 **2026-08-11**。**実機・携帯回線では未検証**。

### 定性的な証明

**現時点では無し。** 外部からのフィードバック・採用実績・受賞はまだ無い。ここに書けることが出てきたら追記する。（無いものを埋めないほうがよいと判断した）

### 使った技術・ツール・手法

`Vanilla JavaScript (ES Modules)` / `Canvas 2D` / `WebRTC DataChannel (mesh)` / `Vercel Serverless Functions` / `Google Gemini (ステージ生成)` / `Service Worker (オフライン)` / `node:test` / `Playwright + Chromium (実機幅の検証)` / `Web Audio API`

---

## 10. Retrospective スライド

1. **見出し**: EN `I have not played it with another human yet.`（EN 44字）/ JP `まだ、人と一緒に遊んでいない。`（JP 15字）
   - 本文: 検証はすべて自動化されたブラウザで、相方はスクリプトだった。だが「囮になった人が撃てない時間をどう感じるか」は、数値でもテストでも出てこない。**2人プレイでそこが退屈だったら、この再設計は正しくても失敗になる。** 締め具合を1箇所（`COOP_TUNE`）に集約したのは、そこを直す前提だから。

2. **見出し**: EN `Four phones, one room, all on the same Wi-Fi.`（EN 45字）/ JP `4台とも、同じ1台の中の話だった。`（JP 17字）
   - 本文: 4人接続の検証は、1台のマシンで Chromium を4枚立ち上げたもの。遅延も回線品質も、NAT の厳しさも現実とは違う。**「6組のうち1組だけ直通が張れない」は、実際の携帯回線どうしで初めて本番になる。** 中継サーバーへの逃げ道は残してあるが、それが要るかどうかはまだ分からない。

3. **見出し**: EN `Needing a manual is itself a finding.`（EN 37字）/ JP `説明書が要った時点で、答えが出ている。`（JP 19字）
   - 本文: 人数ごとの違いを説明するページを作った。だが「🗡 が出たらあなたの番」が画面だけで伝わるなら、つなげ方以外のページは本来要らないはずだ。**このページがよく開かれるなら、それは盾持ちの見せ方が足りていないという報告**として読むことになる。まだ計測していない。

---

## 11. Closing（締めの一文）

- **見出し**
  - EN: `Co-op is a price **only two can pay**.`（EN 34字）
  - JP: `共闘とは、**ふたりでしか払えない**代償だ。`（JP 19字）

---

## 12. アクセント色

- **希望: ティール `#0d9488`**（Interactive / その他）
- ただし konosaki 系が既に使用中とのことなので、重複を避けたい場合は **`OPEN-QUESTIONS.md` Q4** を参照してください。ゲーム画面の基調はベルの金（`#ffd700`）と盾の警告色（`#ff6a6a`）なので、金寄りのオレンジ `#f97316` でも画面と喧嘩しません（こちらも kitadoko 等で使用中）。**最終的には「おまかせ」で構いません。**
