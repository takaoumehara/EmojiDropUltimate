// ============================================================
// state.js — ゲーム状態の唯一の保持者
//   game は setGame() で差し替える(ライブバインディングで全モジュールに伝播)。
// ============================================================
import { CFG, STAGES } from './config.js';

export function newGame() {
  return {
    state: 'title', // splash/title/coop/intro/play/warn/finale/clear/pause/over/victory
    splashT: 0,
    score: 0,
    hi: parseInt(localStorage.getItem('edu_hiscore') || '0'),
    lives: CFG.MAX_LIVES, bombs: 1, continues: CFG.CONTINUES,
    combo: 0, comboMul: 1, lastKill: 0,
    stages: STAGES, aiMode: false, endless: false, daily: false, coop: false,
    world: 1, pendingStage: null, lastResult: null, skinFlash: 0, finale: null,
    stageIndex: 0, stageTime: 0, waveIdx: 0,
    nextWave: 0, nextBell: 0,
    bossActive: false, warnT: 0, clearT: 0, introT: 0, overT: 0,
    pausedFrom: 'play',
    player: {
      x: 0, y: 0, power: 1, options: 0, trail: [],
      shield: false, boost: false, boostT: 0,
      fireT: 0, inv: false, invT: 0, dead: false, anim: 0,
    },
    pBullets: [], eBullets: [], enemies: [], bells: [], boss: null,
    particles: [], popups: [], bgFloats: [], stars: [],
    shakeX: 0, shakeY: 0, shake: 0, flash: 0,
    lightT: 7, boltAnim: null,
    titleAnim: 0, aiLoading: false, aiMsg: null,
    stats: { shots: 0, hits: 0, kills: 0, deathTimes: [], killTimes: [] },
    overBtns: [], menuBtns: [],
  };
}

export let game = newGame();
export function setGame(g) { game = g; return game; }
