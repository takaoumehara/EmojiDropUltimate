// ============================================================
// state.js — ゲーム状態の唯一の保持者
//   game は setGame() で差し替える(ライブバインディングで全モジュールに伝播)。
// ============================================================
import { CFG, STAGES } from './config.js';

// localStorage の読み取りは Safari プライベートブラウジング等で例外を投げうる。
// ここは newGame() 呼び出し時(モジュール読込時含む)に即実行されるため、
// 例外を握って安全側(ハイスコア未保存扱い)にフォールバックする。
function safeHiScore() {
  try { return parseInt(localStorage.getItem('edu_hiscore') || '0'); }
  catch (e) { return 0; }
}

export function newGame() {
  return {
    state: 'title', // splash/title/coop/intro/play/warn/finale/clear/pause/over/victory
    splashT: 0,
    score: 0,
    hi: safeHiScore(),
    lives: CFG.MAX_LIVES, bombs: 1, continues: CFG.CONTINUES,
    combo: 0, comboMul: 1, lastKill: 0,
    stages: STAGES, aiMode: false, endless: false, daily: false, coop: false,
    world: 1, pendingStage: null, lastResult: null, skinFlash: 0, finale: null, chapter: 0,
    stageIndex: 0, stageTime: 0, waveIdx: 0,
    nextWave: 0, nextBell: 0,
    bossActive: false, warnT: 0, clearT: 0, introT: 0, overT: 0,
    pausedFrom: 'play',
    player: {
      x: 0, y: 0, power: 1, options: 0, trail: [],
      shield: false, boost: false, boostT: 0,
      fireT: 0, inv: false, invT: 0, dead: false, anim: 0,
      stillT: 0, focus: false, focusAnim: 0, muzzle: 0,
    },
    pBullets: [], eBullets: [], enemies: [], bells: [], boss: null,
    particles: [], popups: [], bgFloats: [], stars: [],
    shakeX: 0, shakeY: 0, shake: 0, flash: 0,
    lightT: 7, boltAnim: null,
    titleAnim: 0, aiLoading: false, aiMsg: null, focusHintT: 0,
    stats: { shots: 0, hits: 0, kills: 0, deathTimes: [], killTimes: [] },
    overBtns: [], menuBtns: [],
    timers: [],   // ゲーム内時間で待つ処理(復活・決着)。engine.js の after() が積む
    standKind: null,    // 終盤に引いた札('revive'|'split'|'flee'|'greed'|'legacy')
    standHistory: [],   // 直前2回に引いた札。3連続で同じにならないように
    bossGrudge: 0,      // 逃がしたボスの数。次の面のボスが硬くなる
    // === 必殺技 ===
    superCharge: 0,     // 0..SUPER_MAX。敵を倒す・ベルを拾うで溜まる
    superT: 0,          // 効いている残り時間(ms)。0 なら出ていない
    superKind: null,    // いま出ている技('blizzard' など)
    superFusion: 0,     // 合体した人数(0=単独)。2以上で見た目と威力が上がる
    superAge: 0,        // 出てからの経過(ms)。演出の進み具合に使う
    superPets: [],      // 追尾する仲間(ネコ)
    superFood: [],      // 降る/生える物(ごちそう・しゅうかく)
    superShots: [],     // 飛び道具(ミサイル・骨・卵)
    superChain: [],     // 連鎖する雷のつなぎ目
    superOrbit: [],     // 自機の周りを回る腕
    superSweep: null,   // 画面を横切る帯
    superAt: 0,         // 自分が撃った時刻。合体の受付判定に使う
    // === きずな(共闘のみ) ===
    //   相方とのあいだに張る線。触れた敵を切る。ひとりでは張れない。
    tether: null,       // tether.js の newTetherState()。共闘の初回更新で作る
    charView: 'card', charDrag: 0, charReturn: null,   // キャラ選択: カード/一覧・スワイプ量・戻り先
  };
}

export let game = newGame();
export function setGame(g) { game = g; return game; }
