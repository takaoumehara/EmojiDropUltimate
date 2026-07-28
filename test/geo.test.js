// ============================================================
// test/geo.test.js — direction-relative coordinate helpers round-trip.
// ============================================================
import './bootstrap.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posFromPL, invPL } from '../src/geo.js';
import { setGame, game } from '../src/state.js';
import { resize } from '../src/env.js';

// Give W/H real (non-zero) values, same as a real page load would after
// the initial resize() — some of the direction transforms are offsets
// from W/H, so leaving them at their 0 default would make e.g. 'down' and
// 'right' degenerate to the same screen point for identical prog/lat.
resize();

const EPS = 1e-9;

function withDir(dir, fn) {
  const prev = game.stages[game.stageIndex];
  setGame({ ...game, stages: [{ dir }], stageIndex: 0 });
  try { fn(); } finally { setGame({ ...game, stages: [prev], stageIndex: 0 }); }
}

test('geo: posFromPL/invPL round-trip for every direction', () => {
  const dirs = ['up', 'down', 'left', 'right'];
  const samples = [
    [0, 0], [50, 120], [123.5, -40], [999, 0], [-30, 500.25],
  ];
  for (const dir of dirs) {
    withDir(dir, () => {
      for (const [prog, lat] of samples) {
        const p = posFromPL(prog, lat);
        const back = invPL(p.x, p.y);
        assert.ok(Math.abs(back.prog - prog) < EPS,
          `[${dir}] prog round-trip failed: started ${prog}, got back ${back.prog} (via pos ${JSON.stringify(p)})`);
        assert.ok(Math.abs(back.lat - lat) < EPS,
          `[${dir}] lat round-trip failed: started ${lat}, got back ${back.lat} (via pos ${JSON.stringify(p)})`);
      }
    });
  }
});

test('geo: each direction maps prog/lat to a distinct, direction-appropriate axis', () => {
  // Sanity check that the four directions are not accidentally aliased to
  // the same transform (which would make the round-trip test above pass
  // vacuously for the wrong reason).
  const prog = 40, lat = 10;
  const seen = new Set();
  for (const dir of ['up', 'down', 'left', 'right']) {
    withDir(dir, () => {
      const p = posFromPL(prog, lat);
      seen.add(`${p.x},${p.y}`);
    });
  }
  assert.equal(seen.size, 4, 'the four directions must produce four distinct screen positions for the same prog/lat');
});
