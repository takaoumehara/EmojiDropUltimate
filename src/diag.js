// ============================================================
// diag.js — 自己診断とプレイ記録(すべて端末内で完結)
//   目的は2つ。
//   1) 自分の持っていない端末で落ちても気づけるようにする
//   2) 「2回目を遊んだか」を主観ではなく数で答えられるようにする
//
//   外部の解析サービスは入れない。この作品の売りは
//   「外部依存ゼロ・URL1本で即遊べる」なので、そこを崩してまで取る数字ではない。
//   代わりに端末内に貯めて、設定画面から本人がまとめて送れるようにする。
//   → 何も自動送信しないので、プライバシー申告の対象が増えない。
// ============================================================

const KEY = 'edu_diag';
const MAX_ERRORS = 8;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 壊れていたら作り直す */ }
  return null;
}
function blank() {
  return {
    v: 1,
    firstDay: '', lastDay: '', days: 0,   // 何日にわたって遊ばれたか
    sessions: 0,                           // 起動回数
    runs: 0, finishes: 0, deaths: 0,       // 開始したプレイ / ステージ制覇 / 全滅
    bestStage: 0,
    errors: [],                            // 直近の例外(端末内のみ)
  };
}

export const Diag = {
  data: load() || blank(),
  started: false,

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 保存できなくても続行 */ }
  },

  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  // 起動時に一度だけ。例外の捕捉もここで仕掛ける。
  boot() {
    if (this.started) return;
    this.started = true;
    const t = this.today();
    if (!this.data.firstDay) this.data.firstDay = t;
    if (this.data.lastDay !== t) { this.data.lastDay = t; this.data.days++; }
    this.data.sessions++;
    this.save();

    // ここが無いと、自分の端末以外で落ちたことに永久に気づけない。
    addEventListener('error', e => {
      this.logError((e.error && e.error.stack) || e.message || 'error', e.filename, e.lineno);
    });
    addEventListener('unhandledrejection', e => {
      const r = e.reason;
      this.logError('unhandled: ' + ((r && r.stack) || r), '', 0);
    });
  },

  logError(msg, file, line) {
    const text = String(msg || '').slice(0, 300);
    const at = `${String(file || '').split('/').pop()}:${line || 0}`;
    const last = this.data.errors[this.data.errors.length - 1];
    if (last && last.m === text) { last.n++; this.save(); return; }   // 同じ例外の連発は畳む
    this.data.errors.push({ m: text, at, n: 1, d: this.today() });
    while (this.data.errors.length > MAX_ERRORS) this.data.errors.shift();
    this.save();
  },

  runStarted() { this.data.runs++; this.save(); },
  stageFinished(stageIndex) {
    this.data.finishes++;
    this.data.bestStage = Math.max(this.data.bestStage, (stageIndex | 0) + 1);
    this.save();
  },
  runEnded() { this.data.deaths++; this.save(); },

  // 「2回目を遊んだか」= この作品にとって唯一の合否判定。
  //   1回しか起動していない/1回しか遊んでいないなら、面白くなかったということ。
  cameBack() { return this.data.days >= 2 || this.data.runs >= 2; },

  // 本人が設定画面からコピー/共有するための1枚。個人を特定する情報は入れない。
  report() {
    const d = this.data;
    const ua = navigator.userAgent || '';
    // 端末の種類だけ分かれば足りる。詳細なUAは載せない。
    const kind = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
      : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'other';
    const lines = [
      'EMOJI DROP ULTIMATE / 動作レポート',
      `端末: ${kind}  画面: ${innerWidth}x${innerHeight}`,
      `遊んだ日数: ${d.days}  起動: ${d.sessions}  プレイ: ${d.runs}  制覇: ${d.finishes}  全滅: ${d.deaths}`,
      `最高到達: ステージ${d.bestStage}  もう一度遊んだ: ${this.cameBack() ? 'はい' : 'いいえ'}`,
    ];
    if (d.errors.length) {
      lines.push('', `エラー ${d.errors.length}件:`);
      for (const e of d.errors) lines.push(`  [${e.d}] x${e.n} ${e.at} ${e.m}`);
    } else {
      lines.push('', 'エラーはありません');
    }
    return lines.join('\n');
  },

  reset() { this.data = blank(); this.save(); },
};
