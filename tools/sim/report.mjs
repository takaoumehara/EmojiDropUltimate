// ============================================================
// tools/sim/report.mjs — 集計を docs/sim-report.md に書き出す
//
//   数字を JSON のまま置いても誰も読まない。判断に使える形にする。
//   ここは「良く見せる」ためではなく「次に何を直すか決める」ために書く。
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { CHARS } from '../../src/config.js';
import { DIFF_NAME } from './grid.mjs';

const n = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d));
const pctS = (v) => (v == null ? '—' : `${(v * 100).toFixed(0)}%`);

export function writeReport(res, rows, root) {
  const L = [];
  const date = new Date().toISOString().slice(0, 10);

  L.push('# 自動プレイで測ったバランス');
  L.push('');
  L.push(`> ${date} 生成。\`node tools/sim/run.mjs --report\` で再生成する。**手で書き換えない。**`);
  L.push('>');
  L.push(`> ${res.cells}本の自動プレイ（${(res.elapsedMs / 1000).toFixed(1)}秒）。`);
  L.push(`> 軸: 種${JSON.stringify(res.axes.seeds)} × キャラ${res.axes.chars === 'all' ? '全16体' : JSON.stringify(res.axes.chars)}`);
  L.push(`> × 難易度${res.axes.diffs === 'all' ? '3段' : JSON.stringify(res.axes.diffs)} × ボット${JSON.stringify(res.axes.bots)} × ステージ${JSON.stringify(res.axes.stages)}。`);
  L.push(`> 時計: ${res.axes.wallClock ? '**実時間**（素の挙動）' : 'ゲーム内時間（ブラウザで遊んだときと同条件）'}`);
  L.push('');

  const o = res.overall;
  L.push('## 全体');
  L.push('');
  L.push('| | |');
  L.push('|---|---:|');
  L.push(`| 実行数 | ${o.n} |`);
  L.push(`| 突破率（1面クリア） | **${pctS(o.clearRate)}** |`);
  L.push(`| 所要時間の中央値 | ${n(o.medSeconds)} 秒 |`);
  L.push(`| 命中率の中央値 | ${pctS(o.medAccuracy)} |`);
  L.push(`| 初回被弾までの中央値 | ${n(o.ttfd)} 秒 |`);
  L.push(`| 一度も死ななかった実行 | ${o.neverDied} / ${o.n} |`);
  L.push(`| **空白の最長**（敵も弾もボスも居ない） | **${n(o.deadMaxSec, 2)} 秒** |`);
  L.push(`| 空白が占める割合 | ${pctS(o.deadRatio)} |`);
  L.push(`| 粒子の最大同時数 | ${o.peakParticles} |`);
  L.push(`| ベル 出た / 取った / 逃した | ${o.bellsSeen} / ${o.bellsGot} / ${o.bellsMissed} |`);
  L.push('');

  // --- キャラ -----------------------------------------------
  const cs = Object.entries(res.byChar);
  if (cs.length > 1) {
    const sorted = [...cs].sort((a, b) => (a[1].medSeconds ?? 1e9) - (b[1].medSeconds ?? 1e9));
    const fast = sorted[0][1].medSeconds, slow = sorted[sorted.length - 1][1].medSeconds;
    L.push('## キャラ別（上手いボット `hunter` のみ）');
    L.push('');
    L.push('> **開放順と強さが相関していないか**をここで見る。');
    L.push('> `test/balance.test.js` の `powerScore()` は式から出した解析値で、');
    L.push('> これは**実際に遊ばせて測った値**。両方が揃って初めて「同じ強さ」と言える。');
    L.push('');
    L.push('| 開放順 | キャラ | 突破率 | 所要(中央) | 命中率 | 初回被弾 | 死亡(中央) |');
    L.push('|---:|---|---:|---:|---:|---:|---:|');
    for (const [id, s] of cs) {
      const i = CHARS.findIndex(c => c.id === id);
      const c = CHARS[i];
      L.push(`| ${i} | ${c.emoji} ${c.name} | ${pctS(s.clearRate)} | ${n(s.medSeconds)}s | ${pctS(s.medAccuracy)} | ${n(s.ttfd)}s | ${s.medDeaths} |`);
    }
    L.push('');
    L.push(`**所要時間の開き: ${n(slow / fast, 2)}倍**（速い ${sorted[0][0]} ${n(fast)}s ↔ 遅い ${sorted[sorted.length - 1][0]} ${n(slow)}s）`);
    L.push('');
  }

  // --- 難易度 -----------------------------------------------
  const ds = Object.entries(res.byDiff);
  if (ds.length > 1) {
    L.push('## 難易度別');
    L.push('');
    L.push('| 難易度 | 突破率 | 所要(中央) | 初回被弾 | 死亡(中央) |');
    L.push('|---|---:|---:|---:|---:|');
    for (const [d, s] of ds.sort((a, b) => a[0] - b[0])) {
      L.push(`| ${DIFF_NAME[d] || d} | ${pctS(s.clearRate)} | ${n(s.medSeconds)}s | ${n(s.ttfd)}s | ${s.medDeaths} |`);
    }
    L.push('');
    L.push('> やさしい→むずかしい が**単調に効いているか**。効いていなければ設定が飾りになっている。');
    L.push('');
  }

  // --- ボット -----------------------------------------------
  const bs = Object.entries(res.byBot);
  if (bs.length > 1) {
    L.push('## 腕前別（同じ盤面を、違う上手さで遊ぶ）');
    L.push('');
    const what = {
      hunter: '狙って避ける（キー操作）', drag: '**指の速さで避ける（実機に一番近い）**',
      dodge: '避けるが狙わない（キー操作）', sweep: '往復するだけ（キー操作）', idle: '何も押さない（床）',
    };
    L.push('');
    L.push('| ボット | 何を代表するか | 突破率 | 初回被弾 | 死因: 弾 / 敵本体 |');
    L.push('|---|---|---:|---:|---:|');
    for (const [b, s] of bs) {
      const c = s.causes || {};
      L.push(`| \`${b}\` | ${what[b] || ''} | ${pctS(s.clearRate)} | ${n(s.ttfd)}s | ${c.bullet || 0} / ${c.enemy || 0} |`);
    }
    L.push('');
    L.push('> **キー操作のボットと `drag` を混ぜて読まないこと。**');
    L.push('> `src/input.js` は指の移動量を1.7倍して自機へ渡すので、');
    L.push('> 指は `CFG.PLAYER_SPEED`(330px/秒)の**約4倍**動ける。');
    L.push('> キーのボットで「動いても避けられない」と出ても、それはゲームの性質ではなく');
    L.push('> **ボットが遅いだけ**のことがある（実際そうだった → docs/verify-loop.md §3.2）。');
    L.push('');
  }

  // --- ボス終盤の札 ------------------------------------------
  const st = Object.entries(res.stands).sort((a, b) => b[1] - a[1]);
  if (st.length) {
    const total = st.reduce((s, [, v]) => s + v, 0);
    L.push('## ボス終盤の6札');
    L.push('');
    L.push('| 札 | 回数 | 割合 |');
    L.push('|---|---:|---:|');
    for (const [k, v] of st) L.push(`| \`${k}\` | ${v} | ${pctS(v / total)} |`);
    L.push('');
    L.push(`> 6枚に対して観測 ${st.length} 種 / ${total} 回。`);
    L.push('> 「直近2枚を除外」ルールがあるので完全な均等にはならないが、');
    L.push('> **一度も出ない札があれば、それは実質存在していない。**');
    L.push('');
  }

  if (res.errors.length) {
    L.push('## 例外が出た実行');
    L.push('');
    for (const e of res.errors.slice(0, 20)) L.push(`- ${e.char} seed${e.seed} diff${e.diff} \`${e.bot}\` — ${e.error}`);
    L.push('');
  }

  L.push('## この装置に測れないこと');
  L.push('');
  L.push('| 測れる | 測れない |');
  L.push('|---|---|');
  L.push('| 詰みが無い / 空白が無い / 例外が出ない | 楽しいかどうか |');
  L.push('| 突破率・所要時間・命中率・死亡数 | 二度目を自分から始めるか |');
  L.push('| キャラ間の実測の開き | 難易度が「気持ちいい」か |');
  L.push('| 札が全部出るか | 人に見せたくなるか |');
  L.push('');
  L.push('**面白さは測れない。** ここで上がるのは床であって天井ではない。');
  L.push('`docs/store-readiness.md` が書いているとおり、本当の関門は');
  L.push('「家庭の外の人が5人以上遊び、2回目を自分から始めるか」で、そこはコードでは動かない。');
  L.push('');

  const p = path.join(root, 'docs/sim-report.md');
  fs.writeFileSync(p, L.join('\n'));
  return p;
}
