// ============================================================
// balance.test.js — キャラの釣り合い
//
// 「ファーマーは連射も弾速も速い。ってことは簡単な方のキャラってこと?
//   でもベイカーは遅いの? 正直わかんない」と言われた。
// 読んで分からなかったのではなく、**実際にファーマーがベイカーに全部
// 勝っていた**。ここで守るのは:
//   1. 押しただけで強い状態から始まらない(最初は誰でも1発)
//   2. 誰も誰かに全部勝っていない(必ずどこかで払っている)
//   3. カードに出ている数字が、実際に効いている値と同じ向きを向いている
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot, sim, Bot, shutdown } from './headless.js';
import { CHARS, trajTrait } from '../src/config.js';

/** カードで比べている軸ぜんぶ。ここに無い長所は「隠れた長所」になる。 */
function axes(c) {
  const t = trajTrait(c.traj);
  return {
    ひとげき: c.dmg || 1,
    れんしゃ: 1 / c.fire,
    たまのはやさ: c.bspeed,
    みのこなし: c.speed,
    たまのおおきさ: c.size,
    ねらい: t.acc,
    とどく距離: t.range,
    おまけ: (c.pierce ? 1 : 0) + (c.slow ? 1 : 0) + (c.spread ? 1 : 0),
  };
}

test('最初は誰でも1発。3方向から始まるキャラを作らない', async () => {
  const h = await boot({ seed: 200 });
  const { Save } = await import('../src/save.js');
  const bad = [];
  for (let i = 0; i < CHARS.length; i++) {
    Save.setChar(i);
    h.engine.startRun(0);
    const g = h.state.game;
    g.state = 'play'; g.introT = 0;
    assert.equal(g.player.power, 1, `${CHARS[i].en}: power が1で始まること`);
    g.pBullets.length = 0;
    g.player.fireT = 0;
    sim(h, { steps: 2, bot: Bot.idle });
    // 1トリガーで出る主砲の数。オプション弾(opt)は数えない
    const shots = h.state.game.pBullets.filter(b => !b.opt).length;
    if (shots > 1) bad.push(`${CHARS[i].en}=${shots}発`);
  }
  shutdown(h);
  assert.equal(bad.length, 0, `1トリガー1発であること。多いキャラ: ${bad.join(', ')}`);
});

test('誰も誰かに全部勝っていない', () => {
  const dom = [];
  for (const a of CHARS) {
    for (const b of CHARS) {
      if (a === b) continue;
      const A = axes(a), B = axes(b);
      const keys = Object.keys(A);
      if (keys.every(k => A[k] >= B[k]) && keys.some(k => A[k] > B[k])) {
        const win = keys.filter(k => A[k] > B[k]).join('・');
        dom.push(`${a.en} が ${b.en} に全部勝っている (${win} で上、他は同じ)`);
      }
    }
  }
  assert.equal(dom.length, 0, dom.join('\n'));
});

test('全員がどこかで一番、どこかで最下位に近い(平均だけのキャラを作らない)', () => {
  // 「まっすぐ・素直」を売りにしているファイターだけは基準点なので免除する。
  const keys = Object.keys(axes(CHARS[0]));
  const vals = {};
  for (const k of keys) vals[k] = CHARS.map(c => axes(c)[k]);
  const flat = [];
  for (const c of CHARS) {
    if (c.id === 'fighter') continue;
    const A = axes(c);
    const hasEdge = keys.some(k => {
      const hi = Math.max(...vals[k]);
      return A[k] >= hi - (hi - Math.min(...vals[k])) * 0.15;
    });
    if (!hasEdge) flat.push(c.en);
  }
  assert.equal(flat.length, 0, `どこかで抜きん出ていること。平べったいキャラ: ${flat.join(', ')}`);
});

test('「みのこなし」は本当に効いている(指で動かす端末でも)', async () => {
  // 前のカードには「スピード」と書いてあったが、指でドラッグする限り
  // その値は移動に効いていなかった —— 数字だけがそこにあった。
  // いまは当たり判定の小ささとして効かせている。**同じ弾で、身軽な子は
  // 当たらず、鈍い子は当たる**ことを確かめる。ここが崩れたらカードが嘘になる。
  const h = await boot({ seed: 202 });
  const { Save } = await import('../src/save.js');
  const nimble = CHARS.reduce((a, c) => (c.speed > a.speed ? c : a), CHARS[0]);
  const heavy = CHARS.reduce((a, c) => (c.speed < a.speed ? c : a), CHARS[0]);

  const dies = (id, gap) => {
    Save.setChar(CHARS.findIndex(c => c.id === id));
    h.engine.startRun(0);
    const g = h.state.game;
    g.state = 'play'; g.introT = 0;
    g.enemies.length = 0; g.eBullets.length = 0;
    const p = g.player;
    p.inv = false; p.invT = 0; p.shield = false;
    const before = g.lives;
    // 当たり判定の縁ぎわに、止まった弾を1発置く
    g.eBullets.push({ x: p.x + gap, y: p.y, vx: 0, vy: 0, size: 2, tt: 0 });
    sim(h, { steps: 3, bot: Bot.idle });
    return h.state.game.lives < before || h.state.game.player.dead;
  };

  // 身軽な子には当たらず、鈍い子には当たる隙間を探す
  let found = null;
  for (let gap = 5; gap <= 12; gap += 0.5) {
    if (!dies(nimble.id, gap) && dies(heavy.id, gap)) { found = gap; break; }
  }
  shutdown(h);
  assert.ok(found !== null,
    `同じ弾で結果が分かれる隙間があること (${nimble.en} speed=${nimble.speed} / ${heavy.en} speed=${heavy.speed})`);
});

test('カードの数字と実際の弾が同じ向きを向いている', async () => {
  // 弾速の棒が実際の弾速と逆だと、カードは嘘になる。
  const h = await boot({ seed: 201 });
  const { Save } = await import('../src/save.js');
  const measured = [];
  for (const id of ['cow', 'bolt']) {          // 最遅と最速
    Save.setChar(CHARS.findIndex(c => c.id === id));
    h.engine.startRun(0);
    const g = h.state.game;
    g.state = 'play'; g.introT = 0;
    g.pBullets.length = 0; g.player.fireT = 0;
    sim(h, { steps: 2, bot: Bot.idle });
    const b = h.state.game.pBullets.find(x => !x.opt);
    assert.ok(b, `${id}: 弾が出ること`);
    measured.push({ id, v: Math.hypot(b.vx, b.vy) });
  }
  shutdown(h);
  const cow = measured.find(m => m.id === 'cow'), bolt = measured.find(m => m.id === 'bolt');
  assert.ok(bolt.v > cow.v,
    `カードで速いと書いてある方が実際に速いこと (bolt=${Math.round(bolt.v)} > cow=${Math.round(cow.v)})`);
});

// === 貫通 ===
//   「⚡ を使ったけど、とにかく強すぎる」という指摘から入れた2本。
//   原因は2つあり、どちらもカードにも数値にも出ていなかった:
//     1. pierce が **無制限** で、一列に並んだ敵を1発で全部消せた
//     2. 貫通弾はボスに当たっても消えないので、**体に重なっているあいだ
//        毎フレーム** damageBoss が走り、1発が5〜6発ぶんになっていた
//   どちらも「数字を下げる」では直らないので、仕組みのほうを直した。
//   ここが緩むと同じ壊れ方に戻るので、両方を縛る。

const nowG = h => h.state.game;

/** 進行方向の一直線に、動かない敵を n 体並べて1発だけ撃たせる。 */
async function lineOfEnemies(h, id, n) {
  const { Save } = await import('../src/save.js');
  Save.setChar(CHARS.findIndex(c => c.id === id));
  h.engine.startRun(0);
  // 湧いた敵を1体だけ借りて、それを複製して並べる。
  //   湧くのを待って n 体そろえようとすると、波の組み方に依存して不安定になる。
  sim(h, { steps: 600, bot: Bot.idle, until: g => g.enemies.length >= 1 });
  const g = nowG(h);
  g.state = 'play'; g.introT = 0;
  const tpl = g.enemies[0];
  assert.ok(tpl, '敵が1体は湧くこと');
  g.enemies.length = 0;
  g.eBullets.length = 0;
  g.pBullets.length = 0;
  g.bells.length = 0;
  const p = g.player;
  const base = h.geo.invPL(p.x, p.y).prog;
  const ids = new Set();
  for (let i = 0; i < n; i++) {
    const e = { ...tpl, id: 90000 + i };
    // 自機の真正面(lat が同じ)に 34px 間隔で並べる。速度0なので動かない。
    e.prog = base - 70 - i * 34;
    e.lat = h.geo.latOf(p);
    e.hp = 1; e.maxHp = 1; e.speed = 0; e.delay = 0;
    e.move = null; e.type = 'straight'; e.sq = null; e.shootRate = 0;
    g.enemies.push(e);
    ids.add(e.id);
  }
  g.player.fireT = 0;
  g.player.power = 1;
  g.player.focus = false; g.player.stillT = 0;
  // 1発だけ出させて、その1発が並びを抜け切るまで走らせる(次弾が出る前に止める)
  sim(h, { steps: 2, bot: Bot.idle });
  const shots = nowG(h).pBullets.filter(b => !b.opt).length;
  sim(h, { steps: 16, bot: Bot.idle });
  const left = nowG(h).enemies.filter(e => ids.has(e.id)).length;
  return { killed: n - left, shots };
}

test('貫通弾は「何体まで」を必ず守る(⚡ が列を丸ごと消さない)', async () => {
  const h = await boot({ seed: 310 });
  const bad = [];
  for (const c of CHARS) {
    const limit = Math.max(1, c.pierce | 0);
    const { killed, shots } = await lineOfEnemies(h, c.id, 6);
    // 1トリガーで複数発出るキャラ(いまは居ない)を将来足しても壊れないように、
    // 実際に出た弾数ぶんは許す。
    const allowed = limit * Math.max(1, shots);
    if (killed > allowed) bad.push(`${c.en}: pierce=${c.pierce | 0} なのに ${killed} 体倒した(弾 ${shots} 発)`);
  }
  shutdown(h);
  assert.equal(bad.length, 0, bad.join('\n'));
});

test('ボスに重なっているあいだ、同じ弾が何度も削らない', async () => {
  // これが「⚡ が強すぎる」の正体のうち大きいほう。貫通弾はボスに当たっても
  // 消えないので、体に重なっているあいだ毎フレーム当たり判定が通り、
  // 1発が数十発ぶんになっていた。**わざとボスの中に置いて、ゆっくり通す。**
  const h = await boot({ seed: 311 });
  const { Save } = await import('../src/save.js');
  Save.setChar(CHARS.findIndex(c => c.id === 'bolt'));
  h.engine.startRun(0);
  sim(h, { steps: 200, bot: Bot.idle });
  nowG(h).stageTime = h.geo.stage().dur - 200;
  sim(h, { steps: 60 * 40, bot: Bot.idle, until: q => !!q.boss && !q.boss.entering });
  const g = nowG(h);
  assert.ok(g.boss && !g.boss.entering, 'ボスが出ていること');
  g.enemies.length = 0; g.eBullets.length = 0; g.pBullets.length = 0; g.bells.length = 0;
  g.player.fireT = 9e9;                       // 自動連射を止めて、置いた1発だけを見る
  const ch = CHARS.find(c => c.id === 'bolt');
  const before = g.boss.hp;
  g.pBullets.push({
    x: g.boss.x, y: g.boss.y, vx: 0, vy: -60,   // ボスの中を 0.7 秒かけて通る
    size: ch.size, dmg: ch.dmg, pierce: ch.pierce, traj: 'straight',
    tt: 0, hits: 0, bossHit: 0, bx: g.boss.x, by: g.boss.y,
    spMax: 900, size0: ch.size, side: 1, spin: 0,
  });
  sim(h, { steps: 40, bot: Bot.idle });
  const dealt = before - (nowG(h).boss ? nowG(h).boss.hp : 0);
  shutdown(h);
  assert.ok(dealt > 0, '1発ぶんは必ず入ること');
  assert.ok(dealt <= ch.dmg,
    `1発でボスに入った量が ${dealt} —— ${ch.dmg} 以下であること(重なっているあいだ毎フレーム入っていないか)`);
});
