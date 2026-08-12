// ============================================================
// coopdraw.test.js — 共闘の画面が、例外を出さずに描けることの証明
//
// 規則が正しくても、描く側が落ちればゲームは真っ黒になる。
// 盾持ちとベルの位は**新しく描くもの**なので、ここで一度通しておく。
//
// 見た目そのものは検査しない(no-op のキャンバスなので測れない)。
// 検査するのは「4人ぶんの状態を渡しても、一度も投げずに描き切ること」。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './bootstrap.js';

test('4人・盾持ち・位4のベルが並んだ画面を、例外なく描き切る', async () => {
  const env = await import('../src/env.js');
  env.resize();
  const { game } = await import('../src/state.js');
  const engine = await import('../src/engine.js');
  const { draw } = await import('../src/render.js');
  const { Coop } = await import('../src/coop.js');
  const { updateGuards } = await import('../src/guard.js');

  Coop.role = 'host'; Coop.connected = true; Coop.selfId = 'H';
  Coop.peers.clear();
  const now = performance.now();
  ['G1', 'G2', 'G3'].forEach((id, i) => Coop.peers.set(id, {
    id, name: id, x: 0.25 + i * 0.2, y: 0.85, alive: true, seenAt: now,
    score: 100, dead: false, face: 0,
  }));

  engine.startRun(0);
  game.coop = true;
  game.state = 'play';

  const me = engine.selfKey();
  game.players = [
    { id: me, x: env.W * 0.5, y: env.H * 0.55 },       // 前に出ている = 塞がれる側
    { id: 'G1', x: env.W * 0.25, y: env.H * 0.85 },
    { id: 'G2', x: env.W * 0.45, y: env.H * 0.85 },
    { id: 'G3', x: env.W * 0.65, y: env.H * 0.9 },     // 一番遠い = 撃てる側
  ];
  game.enemies = [{
    id: 1, guard: true, delay: 0, hp: 60, maxHp: 60, size: 22, emoji: '👾',
    x: env.W * 0.5, y: env.H * 0.35, blocked: null, blockFlash: 0.7, flash: 0,
  }];
  updateGuards(game.enemies, game.players);
  assert.equal(game.enemies[0].blocked.size, 3, '4人なら盾は3枚');
  assert.equal(game.enemies[0].blocked.has(me), true, '前に出た自分が塞がれている');
  assert.equal(game.enemies[0].blocked.has('G3'), false, '一番遠い G3 だけが撃てる');

  // 位1〜4のベルを並べる。どの位でも描けること。
  game.bells = [1, 2, 3, 4].map((rank, i) => ({
    id: 100 + i, x: env.W * (0.2 + i * 0.2), y: env.H * 0.45,
    idx: i, size: 16, phase: 0, prog: 0, lat: 0, hits: 0, rank, who: [],
  }));

  assert.doesNotThrow(() => draw(0.016), '共闘の画面が例外なく描けること');

  // 盾が誰も向いていない状態(全員が倒れた直後)でも描けること
  game.players = [];
  updateGuards(game.enemies, game.players);
  assert.doesNotThrow(() => draw(0.016), '相方が居なくなった瞬間も描けること');

  Coop.peers.clear(); Coop.connected = false; Coop.role = ''; Coop.selfId = '';
});
