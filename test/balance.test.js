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
