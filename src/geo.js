// ============================================================
// geo.js — 進行方向に依存する座標系ヘルパー
//   prog: 前方エッジからの侵入距離 / lat: 進行方向と垂直な座標(px)
// ============================================================
import { DIRS } from './config.js';
import { W, H } from './env.js';
import { game } from './state.js';

export function stage() { return game.stages[game.stageIndex]; }
export function dirDef() { return DIRS[stage().dir]; }
export function fwAngle() { const d = dirDef(); return Math.atan2(d.fy, d.fx); }
export function inAngle() { const d = dirDef(); return Math.atan2(-d.fy, -d.fx); }
export function isVert() { const d = stage().dir; return d === 'up' || d === 'down'; }
export function latSpan() { return isVert() ? W : H; }   // 横軸(進行と垂直)の幅
export function fwSpan() { return isVert() ? H : W; }     // 奥行き(進行方向)

export function posFromPL(prog, lat) {
  switch (stage().dir) {
    case 'up':    return { x: lat, y: -50 + prog };
    case 'down':  return { x: lat, y: H + 50 - prog };
    case 'right': return { x: W + 50 - prog, y: lat };
    case 'left':  return { x: -50 + prog, y: lat };
  }
}
export function invPL(x, y) {
  switch (stage().dir) {
    case 'up':    return { prog: y + 50, lat: x };
    case 'down':  return { prog: H + 50 - y, lat: x };
    case 'right': return { prog: W + 50 - x, lat: y };
    case 'left':  return { prog: x + 50, lat: y };
  }
}
export function latOf(p) { return isVert() ? p.x : p.y; }

export function playerHome() {
  switch (stage().dir) {
    case 'up':    return { x: W / 2, y: H - 120 };
    case 'down':  return { x: W / 2, y: 120 };
    case 'right': return { x: 120, y: H / 2 };
    case 'left':  return { x: W - 120, y: H / 2 };
  }
}
