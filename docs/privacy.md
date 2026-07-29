# プライバシーポリシー / Privacy Policy

**EMOJI DROP ULTIMATE**
最終更新: 2026-07-29

日本語のあとに English があります。

---

## 日本語

### 集めていない情報

このゲームは、以下を**一切集めません**。

- 氏名・メールアドレス・電話番号などの個人情報
- **位置情報**(GPS)。以前のWeb版は端末の位置情報を使っていましたが、**廃止しました**。
  いまは端末のタイムゾーン設定(例: `Asia/Tokyo`)から地域を推定するだけで、
  位置情報の許可も求めず、座標を外部に送ることもありません。
- 連絡先・写真・カメラ・マイク
- 広告用の識別子、行動追跡

### 端末の中だけに保存するもの

以下は**あなたの端末の中だけ**に保存され、外部には送信されません。

- ハイスコア、章の進行、選んだキャラクター
- 設定(音・言語・むずかしさ・画面のゆれ・地域)
- 動作レポート(起動回数、プレイ回数、発生したエラーの内容)

**動作レポートは自動送信されません。** 設定画面の「動作レポート」を押したときだけ、
あなた自身の操作で内容を確認・共有できます。

### 外部に通信するもの

| 宛先 | 何を送るか | なぜ |
|---|---|---|
| Open-Meteo (`api.open-meteo.com`) | **選ばれた都市の固定座標**(あなたの位置ではありません) | 天気をゲームのルールに反映するため |
| このゲームのサーバー (`/api/signal`) | あいことば(6文字)と、接続用の技術情報(SDP) | 「ふたりでプレイ」で相手と出会うため。**5分で自動的に消えます** |
| STUN / TURN サーバー | 接続用のネットワーク情報 | 2台の端末を直接つなぐため |
| このゲームのサーバー (`/api/score`) | スコアと、あなたが入力した表示名 | ランキング表示のため(任意) |

**「ふたりでプレイ」の対戦中の通信は、サーバーを経由しません**(端末同士の直接通信)。

### 共有ボタンについて

スコアの共有ボタンを押したときだけ、X (`twitter.com`) / LINE (`line.me`) /
Facebook (`www.facebook.com`) の共有画面が開きます。**押さなければ何も送られません。**
開いたあとは各社のプライバシーポリシーが適用されます。

### 子供の利用について

このゲームは全年齢向けです。位置情報・広告・行動追跡を使わないため、
児童から個人情報を収集することはありません。

### お問い合わせ

不明な点は、リポジトリの Issue または配布元に記載の連絡先へお願いします。

---

## English

### What we do not collect

This game collects **none** of the following:

- Personal information: name, email, phone number
- **Location.** An earlier web build used device GPS; that has been **removed**.
  The game now infers a region from your device's timezone setting (e.g.
  `Asia/Tokyo`). It never asks for location permission and never sends your
  coordinates anywhere.
- Contacts, photos, camera, microphone
- Advertising identifiers or behavioural tracking

### Stored only on your device

- High score, chapter progress, chosen character
- Settings (sound, language, difficulty, screen shake, region)
- A diagnostics record (launch count, play count, any errors that occurred)

**Diagnostics are never sent automatically.** They are shown only when you
tap "Diagnostics" in Settings, and shared only if you choose to share them.

### What leaves the device

| Destination | What is sent | Why |
|---|---|---|
| Open-Meteo (`api.open-meteo.com`) | The **fixed coordinates of a chosen city** — not your location | To let real weather change the game rules |
| This game's server (`/api/signal`) | A 6-character room code and connection data (SDP) | So two players can find each other. **Deleted automatically after 5 minutes** |
| STUN / TURN servers | Network connection candidates | To connect the two devices directly |
| This game's server (`/api/score`) | Score and the display name you typed | Optional leaderboard |

**During two-player games, gameplay traffic does not pass through any server** —
the devices talk directly to each other.

### Share buttons

Tapping a share button opens the share page for X (`twitter.com`), LINE
(`line.me`) or Facebook (`www.facebook.com`). **Nothing is sent unless you tap
one**, and once opened, each company's own privacy policy applies.

### Children

The game is suitable for all ages. Because it uses no location data, no ads
and no behavioural tracking, it does not collect personal information from
children.

### Contact

Please use the repository issue tracker, or the contact address given
wherever you obtained the game.
