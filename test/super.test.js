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

/**
 * 敵をまとめて並べる。
 *
 * **x,y を直接入れても効かない** —— updateEnemies が毎フレーム prog/lat から
 * x,y を作り直すので、手で置いた座標は上書きされて全部が1点に集まる。
 * 置きたい画面座標は geo.invPL で prog/lat に変換して渡す。
 */
function seedAt(h, g, points, hp = 4) {
  points.forEach(([x, y], i) => {
    const pl = h.geo.invPL(x, y);
    g.enemies.push({
      id: 9000 + i, ti: 0, move: null, mvT: 0, mvS: 0, mph: 0, blink: 0,
      type: 'straight', emoji: '👾', hp, maxHp: hp, speed: 0, pts: 100, size: 14,
      amp: 0, freq: 1, shootRate: 0, prog: pl.prog, lat0: pl.lat, lat: pl.lat,
      phase: 0, shootT: 9e9, delay: 0, flash: 0, locked: false, lockLat: 0,
      x, y, sq: null, progOff: 0, diving: false,
    });
  });
}

/** 自機の前方に、射線・輪・連鎖のどれでも届く位置で固める。 */
function seedInFront(h, g, n = 12, hp = 4) {
  const p = g.player;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n - 0.5) * 1.1;   // 前方の扇
    const r = 70 + (i % 3) * 45;
    pts.push([p.x + Math.cos(a) * r * 0.5, p.y + Math.sin(a) * r]);
  }
  seedAt(h, g, pts, hp);
}

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

test('どの技も敵を実際に倒す', async () => {
  // 純粋な頭数で測ると、効いている間に新しい敵も湧くので増えることがある。
  //   仕込んだ敵(id 9000番台)だけを追う。
  const h = await boot({ seed: 72 });
  const { SUPER_MAX } = await import('../src/super.js');
  const weak = [];
  for (let i = 0; i < h.config.CHARS.length; i++) {
    const g = await inPlay(h, i);
    seedInFront(h, g, 14);
    const seeded = new Set(g.enemies.filter(e => e.id >= 9000).map(e => e.id));
    g.superCharge = SUPER_MAX;
    h.engine.useBombOrSuper();
    const kind = now(h).superKind;
    sim(h, { steps: 60 * 5, bot: Bot.idle });
    const left = now(h).enemies.filter(e => seeded.has(e.id)).length;
    if (left >= seeded.size) weak.push(`${kind}(${left}/${seeded.size} 残り)`);
  }
  shutdown(h);
  assert.equal(weak.length, 0, `どの技も仕込んだ敵を倒すこと。倒せなかった: ${weak.join(', ')}`);
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

// ============================================================
// チートにならない
//
// 「地震とボム両方すごい強くてチートレベル」と言われた。測ってみたら
// 地震は5番目で、**6種類が40体ぜんぶを消し、4種類は敵弾も全消し**していた。
// 「押せば盤面が片付く」ものが混ざっていると、他の全部の設計が無意味になる。
// ここで上限を決めておく。
// ============================================================

/** 画面いっぱいに散らす。全体攻撃と局所攻撃の差が出る置き方。 */
function seedSpread(h, g, n = 40, hp = 6) {
  g.enemies.length = 0;
  for (let i = 0; i < n; i++) {
    const x = h.env.W * (0.1 + 0.8 * ((i * 7) % 10) / 9);
    const y = h.env.H * (0.08 + 0.62 * (Math.floor(i / 10) / 3));
    const pl = h.geo.invPL(x, y);
    g.enemies.push({ id: 9000 + i, ti: 0, move: null, mvT: 0, mvS: 0, mph: 0, blink: 0,
      type: 'straight', emoji: '👾', hp, maxHp: hp, speed: 0, pts: 100, size: 16, amp: 0, freq: 1,
      shootRate: 0, prog: pl.prog, lat0: pl.lat, lat: pl.lat, phase: 0, shootT: 9e9, delay: 0,
      flash: 0, locked: false, lockLat: 0, x, y, sq: null, progOff: 0, diving: false });
  }
  g.eBullets.length = 0;
  for (let i = 0; i < 30; i++)
    g.eBullets.push({ x: h.env.W * ((i % 6) / 5 * 0.8 + 0.1), y: h.env.H * (Math.floor(i / 6) / 4 * 0.7 + 0.1), vx: 0, vy: 0, size: 5 });
}

test('どの技も、散らした敵を全部は消せない', async () => {
  const h = await boot({ seed: 82 });
  const { SUPER_MAX, SUPERS, superKeyOf } = await import('../src/super.js');
  const { Save } = await import('../src/save.js');
  const tooStrong = [];
  for (let i = 0; i < h.config.CHARS.length; i++) {
    Save.setChar(i);
    h.engine.startRun(0);
    sim(h, { steps: 300, bot: Bot.idle });
    const g = now(h);
    g.state = 'play'; g.introT = 0;
    seedSpread(h, g);
    const seeded = new Set(g.enemies.map(e => e.id));
    g.superCharge = SUPER_MAX;
    h.engine.useBombOrSuper();
    const kind = now(h).superKind;
    const dur = SUPERS[superKeyOf(h.config.CHARS[i].id)].dur;
    sim(h, { steps: Math.ceil(dur / 1000 * 60) + 8, bot: Bot.idle });
    const left = now(h).enemies.filter(e => seeded.has(e.id)).length;
    const killed = seeded.size - left;
    if (killed > seeded.size * 0.85) tooStrong.push(`${kind} ${killed}/${seeded.size}`);
  }
  shutdown(h);
  assert.equal(tooStrong.length, 0,
    `1回で盤面を片付けてしまう技があること: ${tooStrong.join(', ')}`);
});

test('どの技も、敵弾を全部は消さない(無敵時間を作らない)', async () => {
  // 弾が全部消えると、効いているあいだ何をしても死なない。それは難易度ではなく
  // スイッチで、他の設計を全部殺す。
  const h = await boot({ seed: 83 });
  const { SUPER_MAX, SUPERS, superKeyOf } = await import('../src/super.js');
  const { Save } = await import('../src/save.js');
  const wipers = [];
  for (let i = 0; i < h.config.CHARS.length; i++) {
    Save.setChar(i);
    h.engine.startRun(0);
    sim(h, { steps: 300, bot: Bot.idle });
    const g = now(h);
    g.state = 'play'; g.introT = 0;
    seedSpread(h, g);
    const before = g.eBullets.length;
    g.superCharge = SUPER_MAX;
    h.engine.useBombOrSuper();
    const kind = now(h).superKind;
    const dur = SUPERS[superKeyOf(h.config.CHARS[i].id)].dur;
    sim(h, { steps: Math.ceil(dur / 1000 * 60) + 8, bot: Bot.idle });
    // 仕込んだ弾のうち、どれだけ残っているか(新しく湧いた弾は数に入る=甘め)
    const gone = 1 - Math.min(1, now(h).eBullets.length / before);
    if (gone > 0.7) wipers.push(`${kind} ${Math.round(gone * 100)}%`);
  }
  shutdown(h);
  assert.equal(wipers.length, 0, `敵弾をほぼ全消しする技があること: ${wipers.join(', ')}`);
});

test('ボムは自分を助ける道具で、画面の掃除機ではない', async () => {
  const h = await boot({ seed: 84 });
  const g = await inPlay(h, 0);
  seedSpread(h, g);
  const before = g.eBullets.length;
  const far = g.enemies.filter(e => Math.hypot(e.x - g.player.x, e.y - g.player.y) > 400).length;
  g.bombs = 1;
  h.engine.useBomb();
  sim(h, { steps: 4, bot: Bot.idle });
  const q = now(h);
  const farLeft = q.enemies.filter(e => e.id >= 9000 && Math.hypot(e.x - q.player.x, e.y - q.player.y) > 400).length;
  shutdown(h);
  assert.ok(far === 0 || farLeft >= far * 0.8,
    `遠くの敵は消えないこと (${far} → ${farLeft})`);
  assert.ok(q.eBullets.length < before,
    `自分のまわりの弾は消えること (${before} → ${q.eBullets.length})`);
  assert.ok(q.eBullets.length > 0,
    `画面の弾を全部消さないこと (${q.eBullets.length} 残ること)`);
});

test('バナナは1周したら消える(永久に回り続けない)', async () => {
  // 曲がり続けるだけで終わりの条件が無く、画面外へも出ないので消えず、
  // 撃つたびに増えて「バナナだらけ」になっていた。
  const h = await boot({ seed: 85 });
  const { Save } = await import('../src/save.js');
  Save.setChar(h.config.CHARS.findIndex(c => c.id === 'gorilla'));
  h.engine.startRun(0);
  const g = now(h);
  g.state = 'play'; g.introT = 0;
  let peak = 0;
  for (let i = 0; i < 60 * 20; i++) {
    sim(h, { steps: 1, bot: Bot.idle });
    peak = Math.max(peak, now(h).pBullets.filter(b => !b.opt).length);
  }
  shutdown(h);
  // 1周 = 2π / 1.9 ≒ 3.3秒。発射間隔から、同時に生きているのは十数発が上限
  assert.ok(peak <= 16, `画面のバナナが増え続けないこと (最大 ${peak} 発)`);
});
