// ============================================================
// tools/sim/grid.mjs — 何を何通り走らせるかの定義
//
//   軸は「遊びが壊れる場所」に対応させてある:
//     キャラ  … 16体。開放順と強さが相関していないかを実測で確かめる
//     難易度  … 3段。やさしいが本当にやさしいか
//     ステージ… 章1の6面。**進行方向が4方向すべて**出てくる
//     ボット  … 上手い人 / 普通の人 / 初見の人
//     種      … 同じ条件でも運で変わる幅を見るため
// ============================================================
import { CHARS } from '../../src/config.js';

export const BOTS = ['hunter', 'dodge', 'sweep', 'idle'];
export const DIFFS = [0, 1, 2];
export const DIFF_NAME = { 0: 'やさしい', 1: 'ふつう', 2: 'むずかしい' };

/** 1面ぶんに十分な歩数。実測でステージ0の完全クリアが約11,000歩。 */
export const STAGE_STEPS = 60 * 900;

export function buildGrid(opt = {}) {
  const seeds = opt.seeds || [1, 2, 3];
  const chars = opt.chars || CHARS.map((_, i) => i);
  const diffs = opt.diffs || DIFFS;
  const stages = opt.stages || [0];
  const bots = opt.bots || ['hunter'];
  const steps = opt.steps || STAGE_STEPS;
  const wallClock = !!opt.wallClock;
  const freezeDirector = !!opt.freezeDirector;

  const cells = [];
  for (const seed of seeds)
    for (const charIndex of chars)
      for (const diff of diffs)
        for (const stage of stages)
          for (const bot of bots)
            cells.push({
              seed, charIndex, charId: CHARS[charIndex].id, charEmoji: CHARS[charIndex].emoji,
              diff, stage, bot, steps, wallClock, freezeDirector,
            });
  return cells;
}
