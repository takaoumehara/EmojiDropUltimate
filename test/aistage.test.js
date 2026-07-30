// ============================================================
// test/aistage.test.js — normalizeStage repairs hostile input,
// proceduralStage is deterministic per seed, chapterStages gives 6
// stages with 6 distinct themes and is deterministic per chapter.
// ============================================================
import './bootstrap.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStage, proceduralStage, chapterStages } from '../src/aistage.js';
import { makeRng, hashStr, STAGES, STYLE_KEYS, DIRS } from '../src/config.js';

const DIR_KEYS = new Set(Object.keys(DIRS));
const ENEMY_TYPES = new Set(['straight', 'wave', 'shooter', 'tank', 'kamikaze']);

// Strict shape check for a fresh normalizeStage()/proceduralStage() output —
// bounds here mirror normalizeStage's own clamp ranges exactly.
function assertValidStage(stage, label) {
  assert.ok(stage && typeof stage === 'object', `${label}: stage must be an object`);
  assert.ok(DIR_KEYS.has(stage.dir), `${label}: dir "${stage.dir}" must be one of ${[...DIR_KEYS]}`);
  assert.ok(Array.isArray(stage.enemies) && stage.enemies.length === 4, `${label}: must have exactly 4 enemies`);
  for (const e of stage.enemies) {
    assert.ok(ENEMY_TYPES.has(e.type), `${label}: enemy type "${e.type}" invalid`);
    assert.ok(typeof e.emoji === 'string' && e.emoji.length > 0 && e.emoji.length <= 8, `${label}: enemy emoji "${e.emoji}" invalid`);
    assert.ok(Number.isFinite(e.hp) && e.hp >= 1 && e.hp <= 8, `${label}: enemy hp ${e.hp} out of [1,8]`);
    assert.ok(Number.isFinite(e.speed) && e.speed >= 40 && e.speed <= 340, `${label}: enemy speed ${e.speed} out of [40,340]`);
    assert.ok(Number.isFinite(e.pts) && e.pts >= 50 && e.pts <= 800, `${label}: enemy pts ${e.pts} out of [50,800]`);
    assert.ok(Number.isFinite(e.size) && e.size >= 14 && e.size <= 28, `${label}: enemy size ${e.size} out of [14,28]`);
  }
  assert.ok(stage.boss && typeof stage.boss.emoji === 'string' && stage.boss.emoji.length > 0 && stage.boss.emoji.length <= 8,
    `${label}: boss emoji invalid`);
  assert.ok(Number.isFinite(stage.boss.hp) && stage.boss.hp >= 60 && stage.boss.hp <= 260, `${label}: boss hp ${stage.boss.hp} out of [60,260]`);
  assert.ok(STYLE_KEYS.includes(stage.boss.style), `${label}: boss style "${stage.boss.style}" not in STYLE_KEYS`);
  assert.ok(Array.isArray(stage.sky) && stage.sky.length === 2, `${label}: sky must have 2 colors`);
  assert.ok(Array.isArray(stage.night) && stage.night.length === 2, `${label}: night must have 2 colors`);
  assert.ok(Array.isArray(stage.bgEmojis) && stage.bgEmojis.length === 4, `${label}: bgEmojis must have exactly 4 entries`);
}

// Looser structural check for chapterStages() output: scaleStage()
// deliberately pushes enemy/boss stats (hp, pts, speed...) above
// normalizeStage's raw clamp ranges as chapters get harder, by design — so
// we only check shape/type here, not normalizeStage's numeric bounds.
function assertValidChapterStage(stage, label) {
  assert.ok(stage && typeof stage === 'object', `${label}: stage must be an object`);
  assert.ok(DIR_KEYS.has(stage.dir), `${label}: dir "${stage.dir}" must be one of ${[...DIR_KEYS]}`);
  assert.ok(Array.isArray(stage.enemies) && stage.enemies.length === 4, `${label}: must have exactly 4 enemies`);
  for (const e of stage.enemies) {
    assert.ok(ENEMY_TYPES.has(e.type), `${label}: enemy type "${e.type}" invalid`);
    assert.ok(typeof e.emoji === 'string' && e.emoji.length > 0, `${label}: enemy emoji invalid`);
    assert.ok(Number.isFinite(e.hp) && e.hp >= 1, `${label}: enemy hp ${e.hp} must be a positive number`);
    assert.ok(Number.isFinite(e.speed) && e.speed > 0, `${label}: enemy speed ${e.speed} must be positive`);
  }
  assert.ok(stage.boss && typeof stage.boss.emoji === 'string' && stage.boss.emoji.length > 0, `${label}: boss emoji invalid`);
  assert.ok(Number.isFinite(stage.boss.hp) && stage.boss.hp > 0, `${label}: boss hp ${stage.boss.hp} must be positive`);
}

test('normalizeStage: undefined/empty input never throws and yields valid defaults', () => {
  assertValidStage(normalizeStage(undefined), 'normalizeStage(undefined)');
  assertValidStage(normalizeStage(null), 'normalizeStage(null)');
  assertValidStage(normalizeStage({}), 'normalizeStage({})');
});

test('normalizeStage: wrong-typed top-level fields fall back safely', () => {
  const raw = {
    dir: 'sideways',           // not a real direction
    sky: 'red',                // should be an array
    night: 42,                 // should be an array
    bgEmojis: 12345,           // should be an array
    enemies: 'nope',           // should be an array
    boss: null,                // should be an object
    name: 123, en: {}, emoji: {},
    bpm: 'fast', scale: 'pentatonic',
  };
  const stage = normalizeStage(raw);
  assertValidStage(stage, 'normalizeStage(hostile top-level)');
  assert.equal(typeof stage.name, 'string');
  assert.equal(typeof stage.en, 'string');
});

test('normalizeStage: absurd numeric values in enemies/boss are clamped, not passed through', () => {
  const raw = {
    enemies: [
      { type: 'bogus-type', emoji: 'thisiswaytoolongtobeavalidemojistring', hp: 99999, speed: -500, pts: 1e9, size: -10, freq: 'x' },
    ],
    boss: { emoji: 'also-way-too-long-to-be-an-emoji', hp: -50, style: 'not-a-real-style' },
  };
  const stage = normalizeStage(raw);
  assertValidStage(stage, 'normalizeStage(absurd numbers)');
  // Explicitly pin the repaired values for the one enemy we deliberately broke.
  const e = stage.enemies[0];
  assert.ok(e.hp <= 8, 'hp must be clamped down from 99999');
  assert.ok(e.speed >= 40, 'speed must be clamped up from -500');
  assert.ok(e.pts <= 800, 'pts must be clamped down from 1e9');
  assert.ok(e.size >= 14, 'size must be clamped up from -10');
  assert.notEqual(e.emoji, 'thisiswaytoolongtobeavalidemojistring', 'oversized "emoji" string must be replaced with a real fallback emoji');
});

test('normalizeStage: pads short enemy lists up to 4 and truncates long ones down to 4', () => {
  const short = normalizeStage({ enemies: [{ type: 'straight', emoji: '🐦' }] });
  assert.equal(short.enemies.length, 4, 'fewer than 4 enemies must be padded to 4');

  const long = normalizeStage({ enemies: Array.from({ length: 9 }, (_, i) => ({ type: 'straight', emoji: '🐦', hp: 1 + i })) });
  assert.equal(long.enemies.length, 4, 'more than 4 enemies must be truncated to 4');
});

test('normalizeStage: non-emoji garbage strings for name/en are truncated but never throw', () => {
  const stage = normalizeStage({ name: 'x'.repeat(500), en: 'y'.repeat(500) });
  assert.ok(stage.name.length <= 16, 'name must be truncated');
  assert.ok(stage.en.length <= 24, 'en must be truncated');
});

// NOTE (discovered bug, not fixed here — aistage.js is outside this
// change's ownership): proceduralStage() never assigns raw.boss.style, so
// normalizeStage() falls back to config.js's `pick(STYLE_KEYS)`, which
// reads the *global, unseeded* Math.random() instead of the deterministic

test('proceduralStage: deterministic for a fixed seed', () => {
  const seed = hashStr('daily-2026-07-28');
  const a = proceduralStage(makeRng(seed));
  const b = proceduralStage(makeRng(seed));
  assert.deepEqual(a, b, 'the same seed must produce byte-for-byte identical procedural stages');
  assertValidStage(a, 'proceduralStage(seed)');
});

test('proceduralStage: boss.style is deterministic for a fixed seed', () => {
  // Regression guard. proceduralStage must seed boss.style itself; if it is
  // omitted, normalizeStage falls back to config.js pick(), which reads the
  // global unseeded Math.random(). That silently breaks the two promises that
  // depend on a shared seed: Daily giving everyone the same stage, and co-op
  // showing both players the same world (the guest would render a different
  // boss colour and bullet pattern than the host).
  const seed = hashStr('style-determinism');
  const styles = new Set();
  for (let i = 0; i < 30; i++) styles.add(proceduralStage(makeRng(seed)).boss.style);
  assert.equal(styles.size, 1,
    `boss.style must be identical for an identical seed, got: ${JSON.stringify([...styles])}`);
});

test('proceduralStage: different seeds usually produce different stages', () => {
  const a = proceduralStage(makeRng(1));
  const b = proceduralStage(makeRng(2));
  assert.notDeepEqual(a, b, 'different seeds should not coincidentally produce identical stages');
});

test('chapterStages: 道中6面 + 決着の1面 = 7面。道中のテーマは全部ちがう', () => {
  // 6面だけだと「終わった」感じが出ないので、7面目に章のボスを足した。
  const stages = chapterStages(1, STAGES);
  assert.equal(stages.length, 7, 'a chapter is 6 stages plus one finale');
  for (const s of stages) assertValidChapterStage(s, 'chapterStages stage');
  const names = stages.slice(0, 6).map(s => s.name);
  assert.equal(new Set(names).size, 6, `the six road stages must pick 6 DISTINCT themes, got: ${JSON.stringify(names)}`);
  const fin = stages[6];
  assert.equal(fin.finale, true, 'the last stage must be marked as the finale');
  assert.ok(fin.dur < stages[0].dur, 'the finale is a boss fight, not a road — it must be shorter');
  assert.ok(fin.boss && fin.boss.hp > 0, 'the finale must have a boss');
});

test('chapterStages: deterministic per chapter number', () => {
  const a = chapterStages(3, STAGES);
  const b = chapterStages(3, STAGES);
  assert.deepEqual(a, b, 'the same chapter number must always produce the same 6 stages');
});

test('chapterStages: different chapters generally differ, and difficulty scales up', () => {
  const ch1 = chapterStages(1, STAGES);
  const ch2 = chapterStages(2, STAGES);
  assert.notDeepEqual(ch1.slice(0, 6).map(s => s.name), ch2.slice(0, 6).map(s => s.name), 'consecutive chapters should not reuse the exact same theme order');
  // Later chapters scale enemy hp up (see scaleStage); spot-check on stage 0.
  assert.ok(ch2[0].boss.hp >= ch1[0].boss.hp * 0.9, 'later chapters should not be dramatically weaker than earlier ones');
});

test('chapterStages: 第1章の道中は手書きのまま、しかも独立したコピー', () => {
  const copy = chapterStages(0, STAGES);
  assert.deepEqual(copy.slice(0, 6), STAGES.slice(0, 6),
    'chapter 1 must reproduce the hand-made stages exactly');
  copy[0].name = 'MUTATED';
  assert.notEqual(STAGES[0].name, 'MUTATED', 'mutating the returned copy must not affect the original STAGES data');
});
