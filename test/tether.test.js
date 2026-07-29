// ============================================================
// tether.test.js — きずな
//
// 「2人ならではの遊び」を名乗るなら、ひとりでは成立しないことが証明できる
// 必要がある。ここで守るのは:
//   1. ひとりでは線が張れない(これが「2人だから面白い」の根拠)
//   2. 線に触れた敵は実際に減る
//   3. 離れすぎれば切れて、切れているあいだは何も起きない
//   4. ボスは線では削れない(離れて放置すれば勝てる、をふさぐ)
//      代わりに、線がかかっているあいだは弾がよく通る
//   5. ダメージを入れるのはホストだけ(ゲストも入れると二重に削れる)
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot, sim, Bot, shutdown } from './headless.js';
import { TETHER, segDist, strengthFor, newTetherState, updateTether, bossDamageMul } from '../src/tether.js';

const now = h => h.state.game;

function line(ax, ay, bx, by) { return [{ x: ax, y: ay }, { x: bx, y: by }]; }
function enemy(x, y, hp = 100) {
  return { id: 1, x, y, hp, maxHp: hp, size: 16, delay: 0 };
}
function api(over = {}) {
  return {
    host: true, enemies: [], boss: null,
    hurt: (e, d) => { e.hp -= d; },
    ...over,
  };
}

// --- 幾何 ---

test('線分と点の距離が正しい', () => {
  assert.equal(segDist(0, 0, 100, 0, 50, 30), 30);            // 真横
  assert.equal(segDist(0, 0, 100, 0, -40, 0), 40);            // 端の外
  assert.equal(segDist(0, 0, 100, 0, 140, 0), 40);
  assert.equal(segDist(10, 10, 10, 10, 13, 14), 5);           // 長さゼロ
});

test('短いほうが強い', () => {
  assert.ok(strengthFor(50) > strengthFor(250));
  assert.ok(strengthFor(250) > strengthFor(600));
  assert.equal(strengthFor(50), TETHER.TIGHT_MUL);
});

// --- ひとりでは張れない ---

test('ひとりでは線が張れない', () => {
  const st = newTetherState();
  updateTether(0.1, [{ x: 100, y: 100 }], st, api());
  assert.equal(st.links.length, 0, '線が1本も無いこと');
  updateTether(0.1, [], st, api());
  assert.equal(st.links.length, 0);
});

test('ふたりで線が1本、4人で3本(総当たりにしない)', () => {
  const st = newTetherState();
  const pt = n => Array.from({ length: n }, (_, i) => ({ x: 100 + i * 60, y: 200 }));
  updateTether(0.1, pt(2), st, api());
  assert.equal(st.links.length, 1);
  updateTether(0.1, pt(3), st, api());
  assert.equal(st.links.length, 2);
  updateTether(0.1, pt(4), st, api());
  assert.equal(st.links.length, 3, '4人でも6本にはしない(読めなくなる)');
});

// --- 切れる ---

test('線に触れた敵が減り、離れた敵は減らない', () => {
  const st = newTetherState();
  const on = enemy(200, 200), off = enemy(200, 400);
  updateTether(0.5, line(100, 200, 300, 200), st, api({ enemies: [on, off] }));
  assert.ok(on.hp < 100, `線の上の敵が減ること (${on.hp})`);
  assert.equal(off.hp, 100, '線から離れた敵は減らないこと');
});

test('線が重なっている場所でも二重に削らない', () => {
  const st = newTetherState();
  const e = enemy(200, 200);
  // 3人で、2本の線が同じ敵の上を通る形に置く
  const pts = [{ x: 100, y: 200 }, { x: 300, y: 200 }, { x: 100, y: 201 }];
  updateTether(0.5, pts, st, api({ enemies: [e] }));
  const twoLines = 100 - e.hp;
  const st2 = newTetherState();
  const e2 = enemy(200, 200);
  updateTether(0.5, line(100, 200, 300, 200), st2, api({ enemies: [e2] }));
  assert.equal(twoLines.toFixed(4), (100 - e2.hp).toFixed(4), '線の本数で倍にならないこと');
});

test('切った数が数えられ、ゲージに回せる', () => {
  const st = newTetherState();
  const e = enemy(200, 200, 1);
  let cut = 0;
  updateTether(0.5, line(100, 200, 300, 200), st, api({ enemies: [e], onCut: () => cut++ }));
  assert.equal(st.cuts, 1, '倒した数が数えられること');
  assert.equal(cut, 1, '呼び出し側に通知されること');
});

// --- 離れすぎ ---

test('離れすぎると軋み、やがて切れる', () => {
  const st = newTetherState();
  const far = line(0, 200, TETHER.LOOSE + 120, 200);
  let broke = 0;
  updateTether(0.2, far, st, api({ onBreak: () => broke++ }));
  assert.ok(st.strainT > 0, '軋みはじめること');
  assert.equal(st.links.length, 1, '軋んでいるあいだはまだ張っていること');
  assert.equal(st.links[0].strain, true, '軋んでいる印が立つこと');
  for (let i = 0; i < 40 && !broke; i++) updateTether(0.05, far, st, api({ onBreak: () => broke++ }));
  assert.equal(broke, 1, `切れること (strainT=${st.strainT})`);
  assert.equal(st.links.length, 0, '切れたら線が消えること');
});

test('切れているあいだは敵が減らない', () => {
  const st = newTetherState();
  st.coolT = TETHER.COOL;
  const e = enemy(200, 200);
  updateTether(0.5, line(100, 200, 300, 200), st, api({ enemies: [e] }));
  assert.equal(e.hp, 100, '休んでいるあいだは何も起きないこと');
  assert.equal(st.links.length, 0);
});

test('休みが終われば戻る', () => {
  const st = newTetherState();
  st.coolT = 0.3;
  const e = enemy(200, 200);
  updateTether(0.4, line(100, 200, 300, 200), st, api({ enemies: [e] }));
  updateTether(0.4, line(100, 200, 300, 200), st, api({ enemies: [e] }));
  assert.equal(st.links.length, 1, '線が戻ること');
  assert.ok(e.hp < 100, '戻ったら切れること');
});

test('近づけば軋みは戻る(切れる前にやり直せる)', () => {
  const st = newTetherState();
  updateTether(0.3, line(0, 200, TETHER.LOOSE + 100, 200), st, api());
  const strained = st.strainT;
  assert.ok(strained > 0);
  updateTether(0.3, line(100, 200, 260, 200), st, api());
  assert.ok(st.strainT < strained, `寄れば軋みが戻ること (${strained} → ${st.strainT})`);
  assert.equal(st.coolT, 0, '切れていないこと');
});

// --- ボス ---

test('ボスは線では削れないが、線がかかっていると印が立つ', () => {
  const st = newTetherState();
  const boss = { x: 200, y: 200, scale: 1, hp: 500, entering: false };
  updateTether(0.5, line(100, 200, 300, 200), st, api({ boss }));
  assert.equal(boss.hp, 500, '線そのものではボスを削らないこと');
  assert.equal(st.branded, true, '挟めていれば印が立つこと');

  const st2 = newTetherState();
  updateTether(0.5, line(100, 600, 300, 600), st2, api({ boss }));
  assert.equal(st2.branded, false, '外していれば印は立たないこと');
});

test('入場中のボスには印が立たない', () => {
  const st = newTetherState();
  const boss = { x: 200, y: 200, scale: 1, hp: 500, entering: true };
  updateTether(0.5, line(100, 200, 300, 200), st, api({ boss }));
  assert.equal(st.branded, false);
});

// --- ホストだけが削る ---

test('ゲストは線を描くが敵は削らない', () => {
  const st = newTetherState();
  const e = enemy(200, 200);
  const boss = { x: 200, y: 200, scale: 1, hp: 500, entering: false };
  updateTether(0.5, line(100, 200, 300, 200), st, api({ host: false, enemies: [e], boss }));
  assert.equal(st.links.length, 1, 'ゲストでも線は見えること');
  assert.equal(st.branded, true, '印の表示もゲスト側で出ること');
  assert.equal(e.hp, 100, 'ゲストは削らないこと(二重ダメージ防止)');
});

// --- 実際のエンジンに載せる ---

test('ソロで遊んでも線は張られない', async () => {
  const h = await boot({ seed: 300 });
  h.engine.startRun(0);
  const r = sim(h, { steps: 60 * 6, bot: Bot.sweep });
  assert.equal(r.error, null, r.error && r.error.stack);
  const st = now(h).tether;
  shutdown(h);
  assert.ok(st, '状態自体は用意されること');
  assert.equal(st.links.length, 0, 'ソロでは1本も張らないこと');
});

test('ふたりで遊ぶと線が張られ、落ちない', async () => {
  const h = await boot({ seed: 301 });
  const { Coop } = await import('../src/coop.js');
  Coop.reset();
  Coop.active = true; Coop.role = 'host'; Coop.connected = true;
  Coop.onMsg({ t: 'hello', name: 'P2' }, '2');
  h.engine.startRun(0);
  now(h).coop = true;
  // 相方を自機の近くに置き、生きている印を新しく保つ
  const keep = () => {
    const p = Coop.peers.get('2');
    p.alive = true; p.seenAt = performance.now();
    p.x = 0.5; p.y = 0.62;
  };
  keep();
  let links = 0;
  const r = sim(h, { steps: 60 * 5, bot: Bot.idle, until: () => { keep(); links = Math.max(links, (now(h).tether || { links: [] }).links.length); return false; } });
  const st = now(h).tether;
  Coop.reset(); shutdown(h);
  assert.equal(r.error, null, r.error && r.error.stack);
  assert.equal(links, 1, 'ふたりで線が張られること');
  assert.ok(st.coolT === 0 || st.coolT > 0, '状態が壊れていないこと');
});

test('印が立っているあいだの倍率', () => {
  const st = newTetherState();
  assert.equal(bossDamageMul(st), 1);
  st.branded = true;
  assert.ok(bossDamageMul(st) > 1.2, '目に見えて通るようになること');
  assert.equal(bossDamageMul(null), 1, '共闘していないときは素のまま');
});

test('ふたりでボスを挟むと、挟まないときより早く減る', async () => {
  // 倍率の関数だけ通っても、engine が掛けていなければ意味がない。
  //   本物の共闘・本物のボス・本物の弾で、挟む/挟まないを比べる。
  const h = await boot({ seed: 302 });
  const { Coop } = await import('../src/coop.js');

  const measure = across => {
    Coop.reset();
    Coop.active = true; Coop.role = 'host'; Coop.connected = true;
    Coop.onMsg({ t: 'hello', name: 'P2' }, '2');
    h.engine.startRun(0);
    now(h).coop = true;
    sim(h, { steps: 200, bot: Bot.idle });
    now(h).coop = true;
    now(h).stageTime = h.geo.stage().dur - 200;
    sim(h, { steps: 60 * 40, bot: Bot.idle, until: q => !!q.boss && !q.boss.entering });
    const g = now(h);
    if (!g.boss) return null;
    g.boss.hp = g.boss.maxHp = 100000;   // 途中で倒れないよう厚くする
    Coop.bossShared = Coop.bossSharedMax = 100000;
    g.eBullets.length = 0;

    // 相方の位置を毎フレーム置き直す。across=true なら自機の反対側 ——
    //   ふたりを結ぶ線がボスの上を通る。false なら手前に並べる。
    const place = () => {
      const p = Coop.peers.get('2');
      const b = now(h).boss, me = now(h).player;
      p.alive = true; p.seenAt = performance.now();
      if (across && b) { p.x = (2 * b.x - me.x) / h.env.W; p.y = (2 * b.y - me.y) / h.env.H; }
      else { p.x = (me.x + 40) / h.env.W; p.y = (me.y + 10) / h.env.H; }
    };
    const before = 100000;
    for (let i = 0; i < 300 && now(h).boss; i++) {
      place();
      sim(h, { steps: 1, bot: Bot.idle });
    }
    const left = now(h).boss ? Math.min(now(h).boss.hp, Coop.bossShared) : 0;
    return before - left;
  };
  const near = measure(false);
  const across = measure(true);
  Coop.reset(); shutdown(h);
  assert.ok(near !== null && across !== null, 'ボスが出ること');
  assert.ok(near > 0, `並んでいてもボスは減ること (${near})`);
  assert.ok(across > near * 1.1,
    `挟んだほうがよく通ること (並ぶ=${near.toFixed(1)} → 挟む=${across.toFixed(1)})`);
});
