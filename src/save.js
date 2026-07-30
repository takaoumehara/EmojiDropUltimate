// ============================================================
// save.js — アカウント不要のローカルセーブ(localStorage)
//   統計・ストリーク(連続日数)・ベスト・スキン解禁を保存。
//
//   耐障害性メモ: Safari プライベートブラウジングやストレージ無効環境では
//   localStorage への「読み取り」すら例外を投げることがあり(書き込みは
//   クォータ超過でも例外を投げる)、このモジュールの外へ例外が漏れると
//   ゲームが起動不能になる。そのため全アクセスを safeGet/safeSet でラップし、
//   失敗時はメモリ上のフォールバックストアに静かに切り替える(セーブは
//   永続化されないが、ゲーム自体は最後まで普通に遊べる)。
// ============================================================
import { SKINS, CHARS, todayKey } from './config.js';

const KEY = 'edu_save';
const DEF = {
  bestScore: 0, bestWorld: 0, bestDailyScore: 0,
  kills: 0, shots: 0, hits: 0, deaths: 0, runs: 0,
  streak: 0, lastPlay: '', dailyPlayed: '', dailyBest: 0,
  skin: 0, name: '', cid: '', char: 0,
  cleared: 0,   // 現在の章で制覇したステージのビットマスク(1<<i)
  resume: 0,    // 次に挑むステージ番号(つづきから)
  rp: null,     // 死んだ地点(ステージ内の進行度)
  diff: 1,      // むずかしさ 0=やさしい 1=ふつう 2=むずかしい
  shake: 1,     // 画面のゆれ(0にすると揺れ・閃光・粒子を抑える)
  chapter: 0,   // いま挑んでいる章(0=第1章)
  sawStory: 0,  // オープニングを見た章のビットマスク
  tcuts: 0,     // きずなで切った数(案内をやめる判断に使う)
};

// 1章の面数 = 道中6 + 決着1。ここを 6 のまま数えていると章が終わらない。
export const CHAPTER_LEN = 7;

// localStorage が使えない/例外を投げる場合の代替(タブ生存中のみ保持)
const memoryStore = Object.create(null);

// 読み取り: localStorage が丸ごと無い/読めない場合もモジュール外に例外を出さない
function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  }
}
// 書き込み: メモリには常に反映(以後の safeGet が最新値を返せるように)。
// 実ストレージへの書き込みが失敗しても静かに無視する。
function safeSet(key, value) {
  memoryStore[key] = value;
  try { localStorage.setItem(key, value); } catch (e) {}
}

function yesterdayKey() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const Save = {
  data: load(),

  persist() { try { safeSet(KEY, JSON.stringify(this.data)); } catch (e) {} },

  // ラン開始時: ストリーク更新
  startRun() {
    const t = todayKey();
    if (this.data.lastPlay !== t) {
      this.data.streak = (this.data.lastPlay === yesterdayKey()) ? this.data.streak + 1 : 1;
      this.data.lastPlay = t;
      this.persist();
    }
    return this.data.streak;
  },

  // ラン終了時: 統計反映。解禁されたスキン数(増分)を返す。
  recordRun(r) {
    const d = this.data;
    const beforeUnlocked = this.unlockedCount();
    d.runs++;
    d.kills += r.kills || 0; d.shots += r.shots || 0; d.hits += r.hits || 0;
    d.deaths += r.deaths || 0;
    if (r.score > d.bestScore) d.bestScore = r.score;
    if ((r.world || 0) > d.bestWorld) d.bestWorld = r.world;
    if (r.daily) {
      if (r.score > d.dailyBest || d.dailyPlayed !== todayKey()) { d.dailyBest = Math.max(d.dailyBest, r.score); }
      d.dailyPlayed = todayKey();
    }
    // 新しく解禁されたら自動で装着(スキン切替UIは持たない方針)
    const after = this.unlockedCount();
    if (after > beforeUnlocked) {
      const unlocked = SKINS.map((s, i) => (d.bestWorld >= s.need ? i : -1)).filter(i => i >= 0);
      d.skin = unlocked[unlocked.length - 1];
    }
    this.persist();
    return after - beforeUnlocked; // 新規解禁数
  },

  unlockedCount() { return SKINS.filter(s => this.data.bestWorld >= s.need).length; },
  currentSkin() {
    // 選択スキンが未解禁なら、解禁済みで最高のものにフォールバック
    const unlocked = SKINS.map((s, i) => (this.data.bestWorld >= s.need ? i : -1)).filter(i => i >= 0);
    return SKINS[unlocked.includes(this.data.skin) ? this.data.skin : (unlocked[unlocked.length - 1] || 0)];
  },
  cycleSkin() {
    const unlocked = SKINS.map((s, i) => (this.data.bestWorld >= s.need ? i : -1)).filter(i => i >= 0);
    const cur = unlocked.indexOf(this.data.skin);
    this.data.skin = unlocked[(cur + 1) % unlocked.length];
    this.persist();
    return SKINS[this.data.skin];
  },

  // === 進行状況: 道中6面 + 決着1面 = 1章。章を制覇すると次の章が開く ===
  chapter() { return this.data.chapter | 0; },

  // オープニングを見たか。章ごとにビットで持つ。
  //   一度見たら二度目からは出さない(出続けると「早く遊ばせろ」になる)。
  //   32章ぶんで足りる —— それ以降は「見た」ものとして扱う。
  // きずなで何体切ったか。**説明をいつやめるか**の判断に使う。
  //   数回できたなら、もう案内は要らない。
  tetherCuts() { return this.data.tcuts | 0; },
  bumpTetherCuts() {
    this.data.tcuts = Math.min(999, this.tetherCuts() + 1);
    if (this.data.tcuts % 4 === 0) this.persist();     // 毎回書かない
  },

  sawStory(ch) { return ch >= 32 ? true : !!((this.data.sawStory | 0) & (1 << ch)); },
  markSawStory(ch) {
    if (ch >= 32) return;
    this.data.sawStory = (this.data.sawStory | 0) | (1 << ch);
    this.persist();
  },

  // ボス終盤の「直前に引いた札」。**端末に残す**のが肝で、game に置くと
  //   遊び直すたびに空に戻り、毎回同じ札を引きうる。プレイヤーが飽きるのは
  //   1回のプレイの中ではなく、繰り返し遊んだときなので、跨いで覚える必要がある。
  recentStands() { return Array.isArray(this.data.stands) ? this.data.stands : []; },
  pushStand(k) {
    const a = this.recentStands();
    a.push(k);
    while (a.length > 2) a.shift();
    this.data.stands = a;
    this.persist();
    return a;
  },
  isCleared(i) { return !!(this.data.cleared & (1 << i)); },
  // 1章は「道中6面 + 決着の1面」= 7面。ここを 6 で数えていると
  //   7面目を倒しても章が終わらない(制覇の判定が永久に立たない)。
  clearedCount() { let n = 0; for (let i = 0; i < CHAPTER_LEN; i++) if (this.isCleared(i)) n++; return n; },
  // ステージ制覇を記録。章を全制覇したら true を返す(勝利演出→次章解放)
  markCleared(i, total) {
    this.data.cleared |= (1 << i);
    const done = this.clearedCount() >= total;
    if (done) { this.data.chapter = this.chapter() + 1; this.data.cleared = 0; this.data.resume = 0; }
    else this.data.resume = Math.min(i + 1, total - 1);
    this.persist();
    return done;
  },
  resumeStage() { const r = this.data.resume | 0; return r > 0 && r < CHAPTER_LEN ? r : 0; },
  // むずかしさ。Director の自動調整とは別に、明示のつまみを持たせる。
  //   自動調整だけだと「子供に渡すときに弱くする」ができない。
  diff() { const d = this.data.diff; return d === 0 || d === 2 ? d : 1; },
  setDiff(d) { this.data.diff = d === 0 || d === 2 ? d : 1; this.persist(); },
  shake() { return this.data.shake === 0 ? 0 : 1; },
  setShake(v) { this.data.shake = v ? 1 : 0; this.persist(); },
  // 死んだ地点(ステージ内のどこまで進んでいたか)。ステージ番号だけだと
  // 「つづき」がいつも頭からになり、同じ道のりを何度もやり直すことになる。
  setResumePoint(stage, time, wave) {
    this.data.rp = { s: stage | 0, t: Math.max(0, time | 0), w: Math.max(0, wave | 0) };
    this.persist();
  },
  resumePoint() {
    const r = this.data.rp;
    if (!r || typeof r.s !== 'number') return null;
    return { stage: r.s, time: r.t | 0, wave: r.w | 0 };
  },
  clearResumePoint() { this.data.rp = null; this.persist(); },

  // 自機キャラクター(全員最初から選べる)
  charIndex() { const i = this.data.char | 0; return i >= 0 && i < CHARS.length ? i : 0; },
  char() { return CHARS[this.charIndex()]; },
  setChar(i) { this.data.char = ((i % CHARS.length) + CHARS.length) % CHARS.length; this.persist(); return this.char(); },

  accuracy() { return this.data.shots ? Math.round(this.data.hits / this.data.shots * 100) : 0; },
  playedDailyToday() { return this.data.dailyPlayed === todayKey(); },

  // スクリーンネーム(個人情報なし・任意)。未設定なら自動生成。
  name() {
    if (!this.data.name) { this.data.name = 'Player' + (1000 + Math.floor(Math.random() * 9000)); this.persist(); }
    return this.data.name;
  },
  setName(n) {
    n = String(n || '').replace(/[<>\n\r\t]/g, '').trim().slice(0, 14);
    if (n) { this.data.name = n; this.persist(); }
    return this.data.name;
  },
  // 端末ID(匿名・ランキングの重複更新キー用。個人情報ではない)
  clientId() {
    if (!this.data.cid) { this.data.cid = 'c' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); this.persist(); }
    return this.data.cid;
  },
  // ストリークが途切れそう(今日まだ遊んでいない)
  streakAtRisk() { return this.data.streak > 0 && this.data.lastPlay !== todayKey(); },
};

function load() {
  try { return Object.assign({}, DEF, JSON.parse(safeGet(KEY) || '{}')); }
  catch (e) { return { ...DEF }; }
}
