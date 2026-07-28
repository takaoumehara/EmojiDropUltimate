// ============================================================
// test/save.test.js — chapter/progress bit logic, setChar/setName
// sanitization, streak logic across day boundaries, and full
// storage-resilience (localStorage throwing on both read and write).
// ============================================================
import { installGlobals, makeMemoryLocalStorage, makeThrowingLocalStorage } from './bootstrap.js';
installGlobals();
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARS, todayKey } from '../src/config.js';

// save.js reads localStorage once at import time (`data: load()`), so to
// exercise different storage backends across test cases we need a *fresh*
// module instance each time. Node's ESM loader caches by full specifier
// (including any query string), so a unique query bypasses the cache and
// re-runs the module's top-level code against whatever localStorage is
// installed globally at that moment.
let seq = 0;
async function freshSave(storage) {
  globalThis.localStorage = storage;
  const mod = await import(`../src/save.js?instance=${++seq}`);
  return mod.Save;
}

function dayKeyDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---- chapter / progress bit logic --------------------------------------

test('save: clearedCount reflects exactly which bits are set', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  assert.equal(Save.clearedCount(), 0, 'fresh save should have nothing cleared');
  Save.data.cleared = (1 << 0) | (1 << 2) | (1 << 4);
  assert.equal(Save.clearedCount(), 3, 'clearedCount must count exactly the set bits among the first 6');
  assert.ok(Save.isCleared(0) && Save.isCleared(2) && Save.isCleared(4), 'isCleared must be true for set bits');
  assert.ok(!Save.isCleared(1) && !Save.isCleared(3) && !Save.isCleared(5), 'isCleared must be false for unset bits');
});

test('save: markCleared sets the bit and advances resume, without finishing early', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  const done0 = Save.markCleared(0, 6);
  assert.equal(done0, false, 'clearing stage 0 of 6 must not report the chapter as finished');
  assert.ok(Save.isCleared(0), 'stage 0 must now be marked cleared');
  assert.equal(Save.resumeStage(), 1, 'resume should advance to the next stage (1)');
  assert.equal(Save.chapter(), 0, 'chapter must not change until all stages are cleared');

  const done1 = Save.markCleared(2, 6); // clear out of order
  assert.equal(done1, false);
  assert.equal(Save.clearedCount(), 2, 'two distinct stages cleared so far');
  assert.equal(Save.resumeStage(), 3, 'resume follows (i+1) of the just-cleared stage, here 3');
});

test('save: markCleared returns true and rolls over to the next chapter exactly when all 6 are cleared', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  let done = false;
  for (let i = 0; i < 6; i++) {
    done = Save.markCleared(i, 6);
    if (i < 5) assert.equal(done, false, `stage ${i}/6 must not finish the chapter yet`);
  }
  assert.equal(done, true, 'clearing the 6th and final stage must report the chapter as finished');
  assert.equal(Save.chapter(), 1, 'chapter must advance by exactly 1 on rollover');
  assert.equal(Save.clearedCount(), 0, 'cleared bitmask must reset to 0 on rollover');
  assert.equal(Save.resumeStage(), 0, 'resume must reset to 0 (start of new chapter) on rollover');
});

test('save: markCleared rollover works when stages are cleared out of numeric order', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  const order = [3, 0, 5, 1, 4, 2];
  let done = false;
  for (const i of order) done = Save.markCleared(i, 6);
  assert.equal(done, true, 'clearing all 6 stages in any order must eventually finish the chapter');
  assert.equal(Save.chapter(), 1);
});

test('save: resumeStage only returns values within (0, 6)', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  assert.equal(Save.resumeStage(), 0, 'resume=0 means "start from stage 0"');
  Save.data.resume = 5;
  assert.equal(Save.resumeStage(), 5);
  Save.data.resume = 6; // out of range, should not be trusted
  assert.equal(Save.resumeStage(), 0, 'resumeStage must guard against an out-of-range resume value');
});

// ---- setChar --------------------------------------------------------

test('save: setChar wraps negative and overflowing indices, and clamps to a valid CHARS index', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  Save.setChar(-1);
  assert.equal(Save.charIndex(), CHARS.length - 1, 'setChar(-1) must wrap to the last character');
  Save.setChar(CHARS.length);
  assert.equal(Save.charIndex(), 0, 'setChar(CHARS.length) must wrap to the first character');
  Save.setChar(CHARS.length + 2);
  assert.equal(Save.charIndex(), 2, 'setChar must wrap arbitrarily large indices modulo CHARS.length');
  const c = Save.setChar(1);
  assert.equal(c, CHARS[1], 'setChar must return the resulting CHARS entry');
  assert.equal(Save.char(), CHARS[1]);
});

// ---- setName --------------------------------------------------------

test('save: setName strips dangerous characters, trims, and truncates to 14 chars', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  const dirty = '  <b>Hello\nWorld<script>\t</script>  ';
  const clean = Save.setName(dirty);
  assert.ok(!/[<>\n\r\t]/.test(clean), `setName must strip <, >, newline, CR, and tab characters, got: ${JSON.stringify(clean)}`);
  assert.ok(clean.length <= 14, `setName must truncate to at most 14 characters, got length ${clean.length}: ${JSON.stringify(clean)}`);
  assert.equal(clean, clean.trim(), 'setName must not leave leading/trailing whitespace');
});

test('save: setName ignores a name that sanitizes down to nothing', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  const before = Save.setName('Kenji');
  const after = Save.setName('   \n\t  ');
  assert.equal(after, before, 'a name that sanitizes to empty must not overwrite the previous name');
});

test('save: setName truncation keeps exactly the first 14 characters', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  const result = Save.setName('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  assert.equal(result, 'ABCDEFGHIJKLMN', 'must keep exactly the first 14 characters after sanitizing');
});

// ---- streak logic across day boundaries -----------------------------

test('save: startRun begins a streak at 1 on first play', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  const streak = Save.startRun();
  assert.equal(streak, 1, 'first-ever run must start the streak at 1');
  assert.equal(Save.data.lastPlay, todayKey());
});

test('save: startRun increments the streak when the previous play was exactly yesterday', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  Save.data.lastPlay = dayKeyDaysAgo(1);
  Save.data.streak = 5;
  const streak = Save.startRun();
  assert.equal(streak, 6, 'playing on consecutive days must increment the streak');
  assert.equal(Save.data.lastPlay, todayKey());
});

test('save: startRun resets the streak to 1 when a day was missed', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  Save.data.lastPlay = dayKeyDaysAgo(2);
  Save.data.streak = 5;
  const streak = Save.startRun();
  assert.equal(streak, 1, 'missing a day must reset the streak to 1, not continue counting');
});

test('save: startRun is a no-op if already played today', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  Save.data.lastPlay = todayKey();
  Save.data.streak = 3;
  const streak = Save.startRun();
  assert.equal(streak, 3, 'calling startRun again on the same day must not change the streak');
});

test('save: streakAtRisk is true only when the streak is alive but today is unplayed', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  Save.data.streak = 0;
  Save.data.lastPlay = dayKeyDaysAgo(1);
  assert.equal(Save.streakAtRisk(), false, 'a streak of 0 can never be "at risk"');

  Save.data.streak = 4;
  Save.data.lastPlay = dayKeyDaysAgo(1);
  assert.equal(Save.streakAtRisk(), true, 'a positive streak not yet played today is at risk');

  Save.data.lastPlay = todayKey();
  assert.equal(Save.streakAtRisk(), false, 'once played today, the streak is no longer at risk');
});

// ---- full storage resilience -----------------------------------------

test('save: constructing Save never throws even when storage throws on read', async () => {
  const Save = await freshSave(makeThrowingLocalStorage());
  assert.deepEqual(
    { bestScore: Save.data.bestScore, chapter: Save.data.chapter, streak: Save.data.streak, name: Save.data.name },
    { bestScore: 0, chapter: 0, streak: 0, name: '' },
    'with storage throwing on read, Save must fall back to default in-memory data instead of crashing',
  );
});

test('save: every mutating method stays usable end-to-end when storage throws on both read and write', async () => {
  const Save = await freshSave(makeThrowingLocalStorage());

  assert.doesNotThrow(() => Save.persist(), 'persist() must swallow write failures');
  assert.doesNotThrow(() => Save.startRun(), 'startRun() must swallow write failures');
  assert.doesNotThrow(() => Save.recordRun({ kills: 3, shots: 10, hits: 3, deaths: 0, score: 500, world: 2 }),
    'recordRun() must swallow write failures');
  assert.doesNotThrow(() => Save.setChar(2), 'setChar() must swallow write failures');
  assert.doesNotThrow(() => Save.setName('Yuki'), 'setName() must swallow write failures');
  assert.doesNotThrow(() => Save.clientId(), 'clientId() must swallow write failures');
  assert.doesNotThrow(() => Save.name(), 'name() must swallow write failures');
  assert.doesNotThrow(() => Save.cycleSkin(), 'cycleSkin() must swallow write failures');
  assert.doesNotThrow(() => Save.markCleared(0, 6), 'markCleared() must swallow write failures');

  // Game logic itself must still be internally consistent — only
  // persistence-to-disk is allowed to silently fail, never the in-memory
  // state the rest of the game reads every frame.
  assert.equal(Save.charIndex(), 2, 'in-memory state must still update correctly even though persistence fails');
  assert.doesNotThrow(() => Save.setName(''), 'setName("") must not throw on edge input');
  assert.ok(Save.isCleared(0), 'markCleared must still flip the in-memory bit even though persistence fails');
  assert.equal(typeof Save.clientId(), 'string');
  assert.ok(Save.clientId().length > 0);
});

test('save: read-only-throwing storage (write succeeds, read throws) still yields usable defaults', async () => {
  // A storage that can be written to but never read back from (e.g. some
  // odd sandboxed / quota-adjacent failure mode) must not crash load().
  const store = makeMemoryLocalStorage();
  const readThrows = {
    getItem() { throw new Error('read blocked'); },
    setItem: store.setItem.bind(store),
    removeItem: store.removeItem.bind(store),
  };
  const Save = await freshSave(readThrows);
  assert.equal(Save.data.bestScore, 0, 'must fall back to defaults when read throws, even if write would have worked');
  assert.doesNotThrow(() => Save.recordRun({ score: 999, world: 1 }), 'writes must still be attempted without throwing');
});

test('resume point: round-trips the exact spot the run ended', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  assert.equal(Save.resumePoint(), null, 'a fresh save has nowhere to resume from');
  Save.setResumePoint(2, 27500, 9);
  assert.deepEqual(Save.resumePoint(), { stage: 2, time: 27500, wave: 9 });
});

test('resume point: never returns a negative time or wave', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  Save.setResumePoint(0, -5000, -3);
  assert.deepEqual(Save.resumePoint(), { stage: 0, time: 0, wave: 0 });
});

test('resume point: clearing it sends the next run back to the stage start', async () => {
  const Save = await freshSave(makeMemoryLocalStorage());
  Save.setResumePoint(3, 1000, 4);
  Save.clearResumePoint();
  assert.equal(Save.resumePoint(), null);
});

test('resume point: survives a whole save/load round trip', async () => {
  const storage = makeMemoryLocalStorage();
  const Save = await freshSave(storage);
  Save.setResumePoint(4, 18000, 6);
  const Reloaded = await freshSave(storage);       // アプリを開き直した状態
  assert.deepEqual(Reloaded.resumePoint(), { stage: 4, time: 18000, wave: 6 },
    'the death point must outlive a reload, or "continue" is useless after closing the app');
});

test('resume point: storage that throws does not break the run', async () => {
  const Save = await freshSave(makeThrowingLocalStorage());
  Save.setResumePoint(1, 5000, 2);
  assert.deepEqual(Save.resumePoint(), { stage: 1, time: 5000, wave: 2 },
    'the point must still be usable in memory even when it cannot be persisted');
});
