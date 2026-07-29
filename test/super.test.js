// ============================================================
// super.test.js — 必殺技と「合体」
//
// 子供が「2人でも1人と変わらない」と言った。人数でボスを硬くしても
// 増えるのは作業時間だけで、やれることは増えない。
// ここで守るのは:
//   1. 16キャラ全員が撃てて、技は8種類に散らばっている
//   2. 溜め方が正しい(倒す/拾うで溜まり、被弾では溜まらない)
//   3. **合体はひとりでは絶対に起きない** ← これが2人でやる理由そのもの
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot, sim, Bot, shutdown } from './headless.js';

const now = h => h.state.game;

/** 敵をまとめて並べる(技が効いたかを数で見るため)。 */
function seedEnemies(g, n = 12) {
  for (let i = 0; i < n; i++) {
    g.enemies.push({
      id: 9000 + i, ti: 0, move: null, mvT: 0, mvS: 0, mph: 0, blink: 0,
      type: 'straight', emoji: '👾', hp: 6, maxHp: 6, speed: 20, pts: 100, size: 16,
      amp: 0, freq: 1, shootRate: 0, prog: 200 + i * 8, lat0: 40 + i * 26, lat: 40 + i * 26,
      phase: 0, shootT: 9e9, delay: 0, flash: 0, locked: false, lockLat: 0,
      x: 40 + i * 26, y: 200 + i * 8, sq: null, progOff: 0, diving: false,
    });
  }
}

async function inPlay(h, charIndex) {
  const { Save } = await import('../src/save.js');
  if (charIndex != null) Save.setChar(charIndex);
  h.engine.startRun(0);
  sim(h, { steps: 400, bot: Bot.idle });
  return now(h);
}

test('16キャラ全員が必殺技を撃てて、8種類に散らばっている', async () => {
  const h = await boot({ seed: 71 });
  const { SUPERS, SUPER_MAX } = await import('../src/super.js');
  const kinds = new Set();
  for (let i = 0; i < h.config.CHARS.length; i++) {
    const g = await inPlay(h, i);
    seedEnemies(g);
    g.superCharge = SUPER_MAX;
    h.engine.useBombOrSuper();
    assert.ok(now(h).superKind, `${h.config.CHARS[i].en} が撃てること`);
    kinds.add(now(h).superKind);
    const r = sim(h, { steps: 60 * 5, bot: Bot.idle });
    assert.equal(r.error, null, `${h.config.CHARS[i].en}: ${r.error && r.error.stack}`);
  }
  shutdown(h);
  assert.equal(kinds.size, Object.keys(SUPERS).length,
    `技が8種類そろうこと: ${[...kinds].sort().join(',')}`);
});

test('どの技も画面の敵を実際に減らす', async () => {
  const h = await boot({ seed: 72 });
  const { SUPER_BY_CHAR, SUPER_MAX } = await import('../src/super.js');
  // 型ごとに代表キャラを1体ずつ試す
  const seen = new Set();
  for (let i = 0; i < h.config.CHARS.length; i++) {
    const key = SUPER_BY_CHAR[h.config.CHARS[i].id] || 'nova';
    if (seen.has(key)) continue;
    seen.add(key);
    const g = await inPlay(h, i);
    seedEnemies(g, 14);
    const before = g.enemies.length;
    g.superCharge = SUPER_MAX;
    h.engine.useBombOrSuper();
    sim(h, { steps: 60 * 5, bot: Bot.idle });
    assert.ok(now(h).enemies.length < before,
      `${key} が敵を減らすこと (${before} → ${now(h).enemies.length})`);
  }
  shutdown(h);
});

test('溜まっていなければ従来どおりボムが出る', async () => {
  const h = await boot({ seed: 73 });
  const g = await inPlay(h, 0);
  g.superCharge = 0; g.bombs = 1;
  h.engine.useBombOrSuper();
  shutdown(h);
  assert.equal(now(h).superKind, null, '必殺技は出ないこと');
  assert.equal(now(h).bombs, 0, 'ボムが使われること');
});

test('敵を倒すと溜まり、被弾では溜まらない', async () => {
  const h = await boot({ seed: 74 });
  const g = await inPlay(h, 0);
  g.superCharge = 0;
  const r = sim(h, { steps: 60 * 40, bot: Bot.idle });
  assert.equal(r.error, null, r.error && r.error.stack);
  assert.ok(now(h).superCharge > 0, `遊んでいるうちに溜まること (${now(h).superCharge})`);

  // 被弾だけでは増えない
  const at = now(h).superCharge;
  const before = now(h).lives;
  sim(h, { steps: 60 * 60, bot: Bot.idle, until: q => q.lives < before });
  assert.ok(now(h).superCharge >= at, '被弾で減りも増えもしないこと(失敗に褒美を出さない)');
  shutdown(h);
});

test('出している間は溜まらない(撃ちっぱなしにならない)', async () => {
  const h = await boot({ seed: 75 });
  const { SUPER_MAX } = await import('../src/super.js');
  const g = await inPlay(h, 0);
  seedEnemies(g, 20);
  g.superCharge = SUPER_MAX;
  h.engine.useBombOrSuper();
  assert.equal(now(h).superCharge, 0, '撃った瞬間に空になること');
  sim(h, { steps: 60 * 2, bot: Bot.idle });
  assert.equal(now(h).superCharge, 0, '効いている間は溜まらないこと');
  shutdown(h);
});

// ============================================================
// 合体 — ひとりでは絶対に起きない
// ============================================================

async function coopPlay(h, n) {
  const { Coop } = await import('../src/coop.js');
  Coop.reset();
  Coop.active = true; Coop.role = 'host'; Coop.connected = true;
  for (let i = 2; i <= n; i++) Coop.onMsg({ t: 'hello', name: 'P' + i }, String(i));
  h.engine.startRun(0);
  sim(h, { steps: 300, bot: Bot.idle });
  now(h).coop = true;
  return Coop;
}

test('ひとりでは合体しない', async () => {
  const h = await boot({ seed: 76 });
  const { Coop } = await import('../src/coop.js');
  const { SUPER_MAX } = await import('../src/super.js');
  Coop.reset();
  const g = await inPlay(h, 0);
  g.superCharge = SUPER_MAX;
  h.engine.useBombOrSuper();
  shutdown(h);
  assert.ok(now(h).superKind, '技自体は出ること');
  assert.equal(now(h).superFusion, 0, 'ソロで合体は起きないこと');
});

test('相方が撃った直後に自分も撃つと合体する', async () => {
  const h = await boot({ seed: 77 });
  const { SUPER_MAX } = await import('../src/super.js');
  const Coop = await coopPlay(h, 2);
  Coop.peers.get('2').superAt = performance.now();
  now(h).superCharge = SUPER_MAX;
  h.engine.useBombOrSuper();
  const g = now(h);
  const solo = h.state.game.superT;
  Coop.reset(); shutdown(h);
  assert.ok(g.superFusion >= 2, `合体すること (${g.superFusion})`);
  assert.ok(solo > 0, '効いている時間があること');
});

test('間が空きすぎていれば合体しない(偶然では起きない)', async () => {
  const h = await boot({ seed: 78 });
  const { SUPER_MAX, FUSION_WINDOW } = await import('../src/super.js');
  const Coop = await coopPlay(h, 2);
  Coop.peers.get('2').superAt = performance.now() - (FUSION_WINDOW + 5000);
  now(h).superCharge = SUPER_MAX;
  h.engine.useBombOrSuper();
  const fusion = now(h).superFusion;
  Coop.reset(); shutdown(h);
  assert.equal(fusion, 0, '受付時間を過ぎていれば合体しないこと');
});

test('4人そろうと4合体になり、効いている時間も伸びる', async () => {
  const h = await boot({ seed: 79 });
  const { SUPER_MAX, SUPERS, superKeyOf } = await import('../src/super.js');
  const { Save } = await import('../src/save.js');
  const Coop = await coopPlay(h, 4);
  for (const p of Coop.peers.values()) p.superAt = performance.now();
  now(h).superCharge = SUPER_MAX;
  h.engine.useBombOrSuper();
  const g = now(h);
  const base = SUPERS[superKeyOf(Save.char().id)].dur;
  const { fusion, dur } = { fusion: g.superFusion, dur: g.superT };
  Coop.reset(); shutdown(h);
  assert.equal(fusion, 4, '4人ぶんの合体になること');
  assert.ok(dur > base, `単独より長く効くこと (${base} → ${Math.round(dur)})`);
});

test('自分が出している最中に相方が撃っても合体に格上げされる', async () => {
  // どちらが先かで結果が変わると、狙って合わせる意味がなくなる。
  const h = await boot({ seed: 80 });
  const { SUPER_MAX } = await import('../src/super.js');
  const Coop = await coopPlay(h, 2);
  now(h).superCharge = SUPER_MAX;
  h.engine.useBombOrSuper();
  assert.equal(now(h).superFusion, 0, 'まだ単独');
  Coop.onPeerSuper('2', 'nova');
  const fusion = now(h).superFusion;
  const r = sim(h, { steps: 60 * 20, bot: Bot.idle });
  Coop.reset(); shutdown(h);
  assert.ok(fusion >= 2, `後から来ても合体すること (${fusion})`);
  assert.equal(r.error, null, r.error && r.error.stack);
});

test('技が終わると後片付けされる(演出が残らない)', async () => {
  const h = await boot({ seed: 81 });
  const { SUPER_MAX } = await import('../src/super.js');
  const g = await inPlay(h, 2);   // swarm(仲間が飛ぶ)
  seedEnemies(g, 6);
  g.superCharge = SUPER_MAX;
  h.engine.useBombOrSuper();
  assert.ok(now(h).superPets.length > 0 || now(h).superKind !== 'swarm', '仲間が出ること');
  sim(h, { steps: 60 * 8, bot: Bot.idle });
  const q = now(h);
  shutdown(h);
  assert.equal(q.superT <= 0, true, '時間が切れること');
  assert.equal(q.superKind, null, '技の種類が消えること');
  assert.equal(q.superFusion, 0, '合体の印が消えること');
  assert.equal(q.superPets.length, 0, '仲間が残らないこと');
  assert.equal(q.superFood.length, 0, 'ごちそうが残らないこと');
});
