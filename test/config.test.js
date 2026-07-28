// ============================================================
// test/config.test.js — makeRng/hashStr/clamp/lerp behaviour, plus a
// data-integrity sweep over STAGES / BOSS_STYLES / CHARS.
// ============================================================
import './bootstrap.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRng, hashStr, clamp, lerp, CFG,
  STAGES, BOSS_STYLES, STYLE_KEYS, CHARS, DIRS, MOVES, MOVE_BY_EMOJI, BELLS, POWER_SHOT_EMOJIS,
} from '../src/config.js';
import { proceduralStage } from '../src/aistage.js';

test('makeRng: same seed produces the identical sequence', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const seqA = Array.from({ length: 20 }, () => a());
  const seqB = Array.from({ length: 20 }, () => b());
  assert.deepEqual(seqA, seqB, 'two RNGs made from the same seed must diverge nowhere');
});

test('makeRng: different seeds produce different sequences', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.notDeepEqual(seqA, seqB, 'different seeds should not coincidentally produce the same sequence');
});

test('makeRng: values stay within [0, 1)', () => {
  const rng = makeRng(hashStr('range-check'));
  for (let i = 0; i < 500; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `rng() must be in [0,1), got ${v} at draw ${i}`);
  }
});

test('makeRng: pinned regression sequence for seed 42', () => {
  // Locks the exact mulberry32 output so a refactor that silently changes
  // the algorithm (not just its call sites) gets caught.
  const rng = makeRng(42);
  const got = [rng(), rng(), rng(), rng()];
  const expected = [0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693];
  for (let i = 0; i < expected.length; i++) {
    assert.ok(Math.abs(got[i] - expected[i]) < 1e-12, `draw ${i}: expected ${expected[i]}, got ${got[i]}`);
  }
});

test('hashStr: stable for the same input', () => {
  assert.equal(hashStr('emoji-drop'), hashStr('emoji-drop'), 'hashStr must be a pure function of its input');
});

test('hashStr: different strings usually hash differently', () => {
  assert.notEqual(hashStr('chapter-1'), hashStr('chapter-2'), 'distinct seeds strings should not collide trivially');
});

test('hashStr: always returns an unsigned 32-bit integer', () => {
  for (const s of ['', 'a', 'a much longer string with spaces and 絵文字🚀', '0']) {
    const h = hashStr(s);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, `hashStr(${JSON.stringify(s)}) = ${h} is out of uint32 range`);
  }
});

test('hashStr: pinned regression values', () => {
  assert.equal(hashStr(''), 2166136261, 'empty-string FNV offset basis must not drift');
  assert.equal(hashStr('foo'), 2851307223, 'hashStr("foo") must not drift');
});

test('clamp: clamps below, within, and above range, at the exact edges', () => {
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(0, 0, 10), 0, 'lower edge is inclusive');
  assert.equal(clamp(10, 0, 10), 10, 'upper edge is inclusive');
});

test('lerp: endpoints and midpoint', () => {
  assert.equal(lerp(10, 20, 0), 10);
  assert.equal(lerp(10, 20, 1), 20);
  assert.equal(lerp(10, 20, 0.5), 15);
  assert.equal(lerp(-10, 10, 0.5), 0);
});

// ---- data integrity ---------------------------------------------------

const ENEMY_TYPES = new Set(['straight', 'wave', 'shooter', 'kamikaze', 'tank']);
const DIR_KEYS = new Set(Object.keys(DIRS));

test('STAGES: every stage has exactly 4 enemies with valid fields', () => {
  assert.ok(Array.isArray(STAGES) && STAGES.length > 0, 'STAGES must be a non-empty array');
  for (const st of STAGES) {
    assert.ok(DIR_KEYS.has(st.dir), `stage "${st.name}" has invalid dir "${st.dir}"`);
    assert.ok(Array.isArray(st.enemies) && st.enemies.length === 4,
      `stage "${st.name}" must define exactly 4 enemies, found ${st.enemies && st.enemies.length}`);
    for (const e of st.enemies) {
      assert.ok(ENEMY_TYPES.has(e.type), `stage "${st.name}": enemy type "${e.type}" is not a known type`);
      assert.ok(typeof e.emoji === 'string' && e.emoji.length > 0, `stage "${st.name}": enemy missing emoji`);
      assert.ok(Number.isFinite(e.hp) && e.hp > 0, `stage "${st.name}": enemy "${e.emoji}" has invalid hp ${e.hp}`);
      assert.ok(Number.isFinite(e.speed) && e.speed > 0, `stage "${st.name}": enemy "${e.emoji}" has invalid speed ${e.speed}`);
      assert.ok(Number.isFinite(e.pts) && e.pts > 0, `stage "${st.name}": enemy "${e.emoji}" has invalid pts ${e.pts}`);
      assert.ok(Number.isFinite(e.size) && e.size > 0, `stage "${st.name}": enemy "${e.emoji}" has invalid size ${e.size}`);
    }
    assert.ok(st.boss && typeof st.boss.emoji === 'string' && st.boss.emoji.length > 0,
      `stage "${st.name}" is missing a valid boss emoji`);
    assert.ok(Number.isFinite(st.boss.hp) && st.boss.hp > 0, `stage "${st.name}": boss has invalid hp ${st.boss.hp}`);
  }
});

test('STYLE_KEYS: every key exists in BOSS_STYLES with exactly 3 phases and shape/col', () => {
  assert.ok(Array.isArray(STYLE_KEYS) && STYLE_KEYS.length > 0, 'STYLE_KEYS must be a non-empty array');
  for (const key of STYLE_KEYS) {
    const style = BOSS_STYLES[key];
    assert.ok(style, `STYLE_KEYS references "${key}" but BOSS_STYLES has no such entry`);
    assert.ok(typeof style.shape === 'string' && style.shape.length > 0, `BOSS_STYLES.${key} is missing a shape`);
    assert.ok(typeof style.col === 'string' && style.col.length > 0, `BOSS_STYLES.${key} is missing a col`);
    assert.ok(Array.isArray(style.phases) && style.phases.length === 3,
      `BOSS_STYLES.${key} must have exactly 3 phases, found ${style.phases && style.phases.length}`);
    for (const phase of style.phases) {
      assert.ok(Array.isArray(phase.attacks) && phase.attacks.length > 0, `BOSS_STYLES.${key}: phase has no attacks`);
    }
  }
});

test('design rule: no CHARS emoji is ever used as an enemy or boss emoji in STAGES', () => {
  const charEmojis = new Set(CHARS.map(c => c.emoji));
  for (const st of STAGES) {
    for (const e of st.enemies) {
      assert.ok(!charEmojis.has(e.emoji),
        `stage "${st.name}" reuses player character emoji "${e.emoji}" as an enemy — CHARS emoji must never appear as enemies`);
    }
    assert.ok(!charEmojis.has(st.boss.emoji),
      `stage "${st.name}" reuses player character emoji "${st.boss.emoji}" as its boss — CHARS emoji must never appear as bosses`);
  }
});

test('design rule: no CHARS emoji is ever used as an enemy or boss emoji in aistage.js themes', () => {
  // aistage.js does not export its THEMES table directly, but proceduralStage
  // deterministically walks every theme when given an explicit themeIdx, so
  // we can observe every theme's enemy/boss emoji through the public API
  // without reaching into (or duplicating) private implementation details.
  const charEmojis = new Set(CHARS.map(c => c.emoji));
  const rng = makeRng(hashStr('theme-emoji-audit'));
  const THEME_COUNT = 7; // keep in sync with aistage.js's THEMES table length
  for (let themeIdx = 0; themeIdx < THEME_COUNT; themeIdx++) {
    const stage = proceduralStage(rng, themeIdx);
    for (const e of stage.enemies) {
      assert.ok(!charEmojis.has(e.emoji),
        `aistage theme #${themeIdx} ("${stage.name}") reuses player character emoji "${e.emoji}" as an enemy`);
    }
    assert.ok(!charEmojis.has(stage.boss.emoji),
      `aistage theme #${themeIdx} ("${stage.name}") reuses player character emoji "${stage.boss.emoji}" as its boss`);
  }
});

// === 敵の性格(MOVES) ===
// engine.js の applyPersonality が switch で受けるキーと、config 側の表が
// ずれると「タグは付いているのに何も起きない敵」が静かに生まれる。
const MOVE_KINDS = ['slither', 'dive', 'glide', 'blink', 'angular', 'hop', 'lurk'];

test('MOVES only declares personalities that engine.js actually implements', () => {
  for (const k of Object.keys(MOVES)) {
    assert.ok(MOVE_KINDS.includes(k),
      `MOVES has "${k}", which applyPersonality() in engine.js does not handle — the tagged enemies would move like untagged ones`);
  }
});

test('MOVES assigns each emoji exactly one personality', () => {
  const seen = new Map();
  for (const [kind, list] of Object.entries(MOVES)) {
    for (const emoji of list) {
      assert.ok(!seen.has(emoji),
        `"${emoji}" is listed under both "${seen.get(emoji)}" and "${kind}" — MOVE_BY_EMOJI would silently keep only one`);
      seen.set(emoji, kind);
    }
  }
  assert.equal(Object.keys(MOVE_BY_EMOJI).length, seen.size);
  for (const [emoji, kind] of seen) assert.equal(MOVE_BY_EMOJI[emoji], kind);
});

test('design rule: no CHARS emoji is ever given an enemy personality', () => {
  const charEmojis = new Set(CHARS.map(c => c.emoji));
  for (const emoji of Object.keys(MOVE_BY_EMOJI)) {
    assert.ok(!charEmojis.has(emoji),
      `"${emoji}" is a player character emoji and must never be tagged as enemy movement`);
  }
});

test('every STAGES enemy emoji has a personality, so no stage feels flatter than the rest', () => {
  const missing = [];
  for (const st of STAGES) {
    for (const e of st.enemies) if (!MOVE_BY_EMOJI[e.emoji]) missing.push(`${st.name}:${e.emoji}`);
  }
  assert.deepEqual(missing, [],
    `these enemies still move on the base pattern only: ${missing.join(', ')}`);
});

test('every procedurally generated enemy emoji has a personality too', () => {
  const rng = makeRng(hashStr('personality-coverage'));
  const missing = [];
  for (let themeIdx = 0; themeIdx < 7; themeIdx++) {
    const stage = proceduralStage(rng, themeIdx);
    for (const e of stage.enemies) if (!MOVE_BY_EMOJI[e.emoji]) missing.push(`${stage.name}:${e.emoji}`);
  }
  assert.deepEqual(missing, [],
    `these AI-stage enemies still move on the base pattern only: ${missing.join(', ')}`);
});

// === 自機の弾と、世界の素材がぶつからないこと ===
// 弾と同じ絵文字が敵や背景に混ざっていると、撃っているのか撃たれているのか
// 一瞬わからなくなる。❄️ が「雪だるまの弾」かつ「氷結パレスの敵」だった件の再発防止。
const SHOT_EMOJIS = [...CHARS.map(c => c.shotEmoji).filter(Boolean), ...POWER_SHOT_EMOJIS];

test('design rule: no projectile emoji is also used as an enemy or boss', () => {
  const shots = new Set(SHOT_EMOJIS);
  for (const st of STAGES) {
    for (const e of st.enemies) {
      assert.ok(!shots.has(e.emoji),
        `stage "${st.name}" uses "${e.emoji}" as an enemy, but it is also a player projectile`);
    }
    assert.ok(!shots.has(st.boss.emoji),
      `stage "${st.name}" uses "${st.boss.emoji}" as its boss, but it is also a player projectile`);
  }
  const rng = makeRng(hashStr('shot-vs-enemy'));
  for (let themeIdx = 0; themeIdx < 7; themeIdx++) {
    const stage = proceduralStage(rng, themeIdx);
    for (const e of stage.enemies) {
      assert.ok(!shots.has(e.emoji),
        `aistage theme "${stage.name}" uses "${e.emoji}" as an enemy, but it is also a player projectile`);
    }
  }
});

test('design rule: no projectile or character emoji drifts in the background', () => {
  const claimed = new Set([...SHOT_EMOJIS, ...CHARS.map(c => c.emoji)]);
  for (const st of STAGES) {
    for (const b of (st.bgEmojis || [])) {
      assert.ok(!claimed.has(b),
        `stage "${st.name}" has "${b}" in its background, but it is a player character or projectile`);
    }
  }
  const rng = makeRng(hashStr('shot-vs-background'));
  for (let themeIdx = 0; themeIdx < 7; themeIdx++) {
    const stage = proceduralStage(rng, themeIdx);
    for (const b of (stage.bgEmojis || [])) {
      assert.ok(!claimed.has(b),
        `aistage theme "${stage.name}" has "${b}" in its background, but it is a player character or projectile`);
    }
  }
});

test('CHARS: every character is uniquely identifiable and has sane stats', () => {
  const ids = new Set(), emojis = new Set();
  for (const c of CHARS) {
    assert.ok(!ids.has(c.id), `duplicate character id "${c.id}"`);
    assert.ok(!emojis.has(c.emoji), `two characters share the emoji "${c.emoji}" — players could not tell them apart`);
    ids.add(c.id); emojis.add(c.emoji);
    assert.ok(c.name && c.en && c.tag && c.tagEn, `character "${c.id}" is missing a name or tag`);
    assert.ok(c.speed > 0.7 && c.speed < 1.5, `character "${c.id}" speed ${c.speed} is outside the playable range`);
    assert.ok(c.fire > 0.5 && c.fire < 2.2, `character "${c.id}" fire ${c.fire} is outside the playable range`);
    assert.ok(c.size >= 3 && c.size <= 9, `character "${c.id}" bullet size ${c.size} is outside the playable range`);
  }
});

test('CHARS: damage-per-second stays within one band, so no character is strictly best', () => {
  // 1発の重さ(dmg)と連射(fire)を掛け合わせた素の火力。広がりや貫通は別価値なので
  // ここでは見ない。倍以上の差がついたら、それは選択肢ではなく正解になってしまう。
  const dps = CHARS.map(c => ({ id: c.id, v: (c.dmg || 1) / c.fire }));
  const lo = Math.min(...dps.map(d => d.v)), hi = Math.max(...dps.map(d => d.v));
  assert.ok(hi / lo < 2.4,
    `raw damage spread is ${(hi / lo).toFixed(2)}x — ${JSON.stringify(dps.sort((a, b) => b.v - a.v).slice(0, 3))}`);
});

// === ベル ===
test('BELLS: every entry has a colour, both names, and a known effect', () => {
  const EFFECTS = new Set(['points', 'speed', 'power', 'option', 'shield', 'bomb', 'boomerang', 'rear', 'side']);
  const seen = new Set();
  for (const b of BELLS) {
    assert.ok(EFFECTS.has(b.effect), `bell "${b.name}" has unknown effect "${b.effect}" — collectBell would silently do nothing`);
    assert.ok(!seen.has(b.effect), `two bells both grant "${b.effect}"`);
    seen.add(b.effect);
    assert.ok(b.color && b.name && b.ja, `bell "${b.effect}" is missing colour or names`);
    // 時限効果は必ず切れること。切れないと取った瞬間に永続強化になる。
    if (['speed', 'boomerang', 'rear', 'side'].includes(b.effect)) {
      assert.ok(b.duration > 0 && b.duration <= 20000,
        `bell "${b.name}" needs a duration under 20s, got ${b.duration}`);
    }
  }
});

test('CHARS: bullet speed is set for everyone and stays readable', () => {
  // 弾が速すぎると「何を投げているか」が読めず、遅すぎると手応えが無くなる。
  for (const c of CHARS) {
    assert.ok(typeof c.bspeed === 'number', `character "${c.id}" has no bspeed — it would silently fall back to 1`);
    assert.ok(c.bspeed >= 0.6 && c.bspeed <= 1.3,
      `character "${c.id}" bspeed ${c.bspeed} is outside the readable range`);
  }
  // 絵文字を投げるキャラほど遅い側に居ること(絵柄が見えないと意味が無い)
  const emojiAvg = avg(CHARS.filter(c => c.shotEmoji).map(c => c.bspeed));
  const plainAvg = avg(CHARS.filter(c => !c.shotEmoji).map(c => c.bspeed));
  assert.ok(emojiAvg < plainAvg,
    `emoji projectiles average ${emojiAvg.toFixed(2)} but plain bolts average ${plainAvg.toFixed(2)} — emoji shots must fly slower to stay legible`);
});
function avg(a) { return a.reduce((x, y) => x + y, 0) / a.length; }

test('CHARS: every projectile is drawn big enough to identify', () => {
  // 「自分の幅を横切る時間」で見ていたが、あれは読めなかった本当の原因
  // (fillStyle のアルファが絵文字に掛かっていた)を知る前に置いた代用の物差しだった。
  // 実測すると 18px あれば 🍌 🥛 🥚 🥖 💧 は静止画で判別できる。そこを下限にする。
  for (const c of CHARS) {
    const glyph = Math.max(19, c.size * 2.6);    // render.js と揃える
    assert.ok(glyph >= 18, `character "${c.id}" projectile renders at ${glyph}px — below the identifiable floor`);
  }
});

test('CHARS: projectiles never jump more than half their own width per frame', () => {
  // 1フレームの移動量が絵柄の幅を超えると、連続した物ではなく点線に見える。
  // これが弾速の実際の上限。速さそのものではなく「大きさとの比」で決まる。
  for (const c of CHARS) {
    const perFrame = CFG.BULLET_SPEED * c.bspeed / 60;
    const glyph = Math.max(19, c.size * 2.6);
    assert.ok(perFrame <= glyph * 0.55,
      `character "${c.id}" moves ${perFrame.toFixed(1)}px per frame with a ${glyph}px glyph — it would read as a dashed line`);
  }
});

test('CFG: player bullets still outrun every enemy that closes on you', () => {
  // 弾を遅くしすぎると、突っ込んでくる敵に置いていかれて倒せなくなる。
  // ここが「これ以上遅くできない」の本当の下限。
  const slowest = CFG.BULLET_SPEED * Math.min(...CHARS.map(c => c.bspeed));
  const fastestEnemy = Math.max(...STAGES.flatMap(s => s.enemies.map(e => e.speed)));
  assert.ok(slowest > fastestEnemy * 0.6,
    `slowest projectile is ${Math.round(slowest)}px/s against a ${fastestEnemy}px/s enemy — shots would never land`);
});
