// ============================================================
// config.js — ゲーム定数・ステージ定義・純粋ユーティリティ
//   新ステージ/敵/ボスの追加はこのファイルだけで完結する。
// ============================================================

export const CFG = {
  PLAYER_SPEED: 330,
  // 弾速は「威力」ではなく「読めるか」と「敵がどこまで近づけるか」を決める。
  //   遅くしても倒せなくなることは無い(敵は自分に向かって来るため)。
  //   本当の上限は画面の混雑 — 遅い弾は長く残るので、連射も少し落として釣り合わせる。
  //   300 まで落としたが、遅い弾は長く画面に残るので「弾だらけ=簡単」になった。
  //   速度は戻し、代わりに連射を半分にして「1発の重み」で難度を作る。
  BULLET_SPEED: 420,
  EBULLET_SPEED: 190,
  COMBO_WINDOW: 2000,
  INV_TIME: 2200,
  MAX_LIVES: 3,
  MAX_POWER: 3,
  MAX_OPTIONS: 2,
  MAX_BOMBS: 3,
  MAX_COMBO_MUL: 8,
  WARN_TIME: 2200,
  CLEAR_TIME: 3000,
  INTRO_TIME: 2400,
  MAX_SHAKE: 10,
  CONTINUES: 2,
};

// 進行方向(=撃つ方向)。敵は前方から迫る。
export const DIRS = {
  up:    { fx: 0, fy: -1, arrow: '⬆️' },
  right: { fx: 1, fy: 0,  arrow: '➡️' },
  down:  { fx: 0, fy: 1,  arrow: '⬇️' },
  left:  { fx: -1, fy: 0, arrow: '⬅️' },
};

export const STAGES = [
  {
    name: 'スカイラッシュ', en: 'SKY RUSH', emoji: '🌤️', dir: 'up',
    sky: ['#2e86d4', '#a8ddff'], night: ['#0b1240', '#2c3e8f'],
    bgEmojis: ['☁️', '🕊️', '🎈', '🪁'],
    enemies: [
      { type: 'straight', emoji: '🐦', hp: 1, speed: 125, pts: 100, size: 17 },
      { type: 'wave',     emoji: '🦋', hp: 1, speed: 105, pts: 150, size: 18, amp: 70, freq: 2 },
      { type: 'shooter',  emoji: '🦉', hp: 2, speed: 55,  pts: 200, size: 20, shootRate: 0.6 },
      { type: 'kamikaze', emoji: '🐝', hp: 1, speed: 235, pts: 250, size: 15 },
    ],
    boss: { emoji: '👑', name: 'クラウドキング', en: 'CLOUD KING', hp: 70 },
    ship: '#7fd0ff', shot: '#8fe3ff',
    dur: 62000, bpm: 128, scale: [60, 64, 67, 69, 71],
  },
  {
    name: 'ディープダイブ', en: 'DEEP DIVE', emoji: '🌊', dir: 'right',
    sky: ['#014f6d', '#02a8a8'], night: ['#021c30', '#014f6d'],
    bgEmojis: ['🫧', '🐳', '🪸', '🐚'],
    enemies: [
      { type: 'straight', emoji: '🐟', hp: 1, speed: 140, pts: 100, size: 17 },
      { type: 'wave',     emoji: '🪼', hp: 2, speed: 95,  pts: 150, size: 19, amp: 95, freq: 1.5 },
      { type: 'shooter',  emoji: '🦈', hp: 3, speed: 65,  pts: 250, size: 23, shootRate: 0.8 },
      { type: 'kamikaze', emoji: '🐡', hp: 1, speed: 255, pts: 250, size: 16 },
    ],
    boss: { emoji: '🐙', name: 'クラーケン', en: 'KRAKEN', hp: 95 },
    ship: '#3fe0d0', shot: '#5fe6ff',
    dur: 68000, bpm: 132, scale: [62, 65, 69, 72, 74],
  },
  {
    name: 'フリーフォール', en: 'FREE FALL', emoji: '🕳️', dir: 'down',
    sky: ['#3b2a52', '#191026'], night: ['#241634', '#0d0716'],
    bgEmojis: ['🪨', '🕸️', '💎', '🍄'],
    enemies: [
      { type: 'straight', emoji: '🦇', hp: 1, speed: 150, pts: 120, size: 17 },
      { type: 'wave',     emoji: '👻', hp: 2, speed: 105, pts: 170, size: 19, amp: 80, freq: 2.4 },
      { type: 'shooter',  emoji: '🧟', hp: 3, speed: 60,  pts: 260, size: 21, shootRate: 0.9 },
      { type: 'kamikaze', emoji: '🕷️', hp: 1, speed: 275, pts: 270, size: 15 },
    ],
    boss: { emoji: '🕸️', name: 'スパイダークイーン', en: 'SPIDER QUEEN', hp: 115 },
    ship: '#c17bff', shot: '#d29bff',
    dur: 70000, bpm: 138, scale: [57, 60, 62, 64, 67],
  },
  {
    name: 'ネオンシティ', en: 'NEON CITY', emoji: '🏙️', dir: 'left',
    sky: ['#3d0a63', '#c026d3'], night: ['#1c0433', '#701a75'],
    bgEmojis: ['🏙️', '📡', '💾', '🛰️'],
    enemies: [
      { type: 'straight', emoji: '🤖', hp: 2, speed: 135, pts: 150, size: 19 },
      { type: 'wave',     emoji: '👾', hp: 2, speed: 110, pts: 200, size: 20, amp: 110, freq: 1.9 },
      { type: 'shooter',  emoji: '🛸', hp: 3, speed: 70,  pts: 300, size: 22, shootRate: 1.1 },
      { type: 'tank',     emoji: '🚓', hp: 5, speed: 45,  pts: 400, size: 24, shootRate: 0.7 },
    ],
    boss: { emoji: '🖥️', name: 'メインフレーム', en: 'MAINFRAME', hp: 135 },
    ship: '#57e6ff', shot: '#7cf0ff',
    dur: 74000, bpm: 144, scale: [60, 63, 65, 67, 70],
  },
  {
    name: 'マグマコア', en: 'MAGMA CORE', emoji: '🌋', dir: 'up',
    sky: ['#7a0c0c', '#ff7b00'], night: ['#3d0505', '#a33000'],
    bgEmojis: ['🌡️', '🌋', '💥', '🪨'],
    enemies: [
      { type: 'straight', emoji: '😈', hp: 2, speed: 155, pts: 200, size: 19 },
      { type: 'wave',     emoji: '👺', hp: 3, speed: 115, pts: 250, size: 21, amp: 90, freq: 2.1 },
      { type: 'shooter',  emoji: '👹', hp: 4, speed: 75,  pts: 350, size: 23, shootRate: 1.2 },
      { type: 'kamikaze', emoji: '☄️', hp: 1, speed: 320, pts: 300, size: 16 },
    ],
    boss: { emoji: '🐉', name: 'ヘルドラゴン', en: 'HELL DRAGON', hp: 160 },
    ship: '#ff7a3c', shot: '#ffb03c',
    dur: 76000, bpm: 152, scale: [64, 65, 67, 69, 71],
  },
  {
    name: 'ギャラクシーエッジ', en: 'GALAXY EDGE', emoji: '🌌', dir: 'up',
    sky: ['#060618', '#1c1c4e'], night: ['#02020c', '#12123a'],
    bgEmojis: ['⭐', '🪐', '☄️', '🌠'],
    enemies: [
      { type: 'straight', emoji: '👽', hp: 2, speed: 150, pts: 220, size: 19 },
      { type: 'wave',     emoji: '🛸', hp: 3, speed: 115, pts: 280, size: 21, amp: 120, freq: 1.7 },
      { type: 'shooter',  emoji: '👾', hp: 4, speed: 80,  pts: 380, size: 22, shootRate: 1.4 },
      { type: 'tank',     emoji: '🌑', hp: 7, speed: 42,  pts: 500, size: 26, shootRate: 0.9 },
    ],
    boss: { emoji: '🛸', name: 'マザーシップ', en: 'MOTHERSHIP', hp: 200 },
    ship: '#b98cff', shot: '#e879f9',
    dur: 80000, bpm: 160, scale: [57, 59, 60, 64, 65],
  },
];

export const BOSS_PHASES = [
  { attacks: [
    { type: 'aimed',  interval: 850,  speed: 240, count: 1 },
    { type: 'spread', interval: 1500, speed: 190, count: 5, arc: 0.5 },
  ]},
  { attacks: [
    { type: 'spread', interval: 1000, speed: 210, count: 7, arc: 0.6 },
    { type: 'aimed',  interval: 620,  speed: 270, count: 2 },
    { type: 'summon', interval: 4200, minion: 0 },
  ]},
  { attacks: [
    { type: 'spread', interval: 750,  speed: 240, count: 9, arc: 0.75 },
    { type: 'aimed',  interval: 430,  speed: 300, count: 3 },
    { type: 'summon', interval: 3400, minion: 1 },
    { type: 'charge', interval: 5200 },
  ]},
];

// ベル(Twinbee風) — 撃つと色が変わる
// === ボススタイル(ステージ毎に弾幕と色が変わる) ===
// 攻撃type: aimed(狙撃) spread(扇) ring(全方位) spiral(渦) wall(壁+隙間) summon(召喚) charge(突進)
export const BOSS_STYLES = {
  king: { shape: 'star', col: '#ffe14d', phases: [
    { attacks: [{ type: 'spread', interval: 1100, speed: 200, count: 5, arc: 0.6 }, { type: 'ring', interval: 1700, speed: 170, count: 10 }] },
    { attacks: [{ type: 'spread', interval: 900, speed: 220, count: 7, arc: 0.7 }, { type: 'aimed', interval: 700, speed: 250, count: 2 }] },
    { attacks: [{ type: 'ring', interval: 900, speed: 200, count: 14, spin: 0.4 }, { type: 'aimed', interval: 500, speed: 280, count: 3 }, { type: 'summon', interval: 3800, minion: 0 }] },
  ]},
  kraken: { shape: 'bubble', col: '#3fe0d0', phases: [
    { attacks: [{ type: 'spiral', interval: 180, speed: 175, count: 2, spin: 0.45 }, { type: 'aimed', interval: 1200, speed: 230, count: 1 }] },
    { attacks: [{ type: 'spiral', interval: 150, speed: 190, count: 3, spin: 0.5 }, { type: 'summon', interval: 4200, minion: 0 }] },
    { attacks: [{ type: 'spiral', interval: 120, speed: 200, count: 3, spin: -0.55 }, { type: 'ring', interval: 1600, speed: 180, count: 12 }, { type: 'aimed', interval: 600, speed: 260, count: 2 }] },
  ]},
  spider: { shape: 'diamond', col: '#c17bff', phases: [
    { attacks: [{ type: 'wall', interval: 1900, speed: 150, count: 11 }, { type: 'aimed', interval: 900, speed: 220, count: 1 }] },
    { attacks: [{ type: 'wall', interval: 1550, speed: 170, count: 13 }, { type: 'summon', interval: 3600, minion: 0 }] },
    { attacks: [{ type: 'wall', interval: 1250, speed: 190, count: 15 }, { type: 'spread', interval: 800, speed: 210, count: 7, arc: 0.6 }, { type: 'summon', interval: 3000, minion: 1 }] },
  ]},
  mainframe: { shape: 'chip', col: '#57e6ff', phases: [
    { attacks: [{ type: 'wall', interval: 1600, speed: 205, count: 12 }, { type: 'aimed', interval: 520, speed: 270, count: 1 }] },
    { attacks: [{ type: 'aimed', interval: 360, speed: 300, count: 2 }, { type: 'wall', interval: 1400, speed: 225, count: 14 }] },
    { attacks: [{ type: 'aimed', interval: 300, speed: 320, count: 3 }, { type: 'wall', interval: 1150, speed: 245, count: 16 }, { type: 'ring', interval: 1500, speed: 200, count: 12 }] },
  ]},
  dragon: { shape: 'flame', col: '#ff7a3c', phases: [
    { attacks: [{ type: 'spread', interval: 900, speed: 230, count: 7, arc: 0.9 }, { type: 'charge', interval: 5000 }] },
    { attacks: [{ type: 'spread', interval: 760, speed: 250, count: 9, arc: 1.0 }, { type: 'ring', interval: 1400, speed: 200, count: 12 }, { type: 'charge', interval: 4200 }] },
    { attacks: [{ type: 'spread', interval: 620, speed: 270, count: 11, arc: 1.1 }, { type: 'aimed', interval: 400, speed: 300, count: 3 }, { type: 'charge', interval: 3400 }, { type: 'ring', interval: 1200, speed: 220, count: 14, spin: 0.5 }] },
  ]},
  mothership: { shape: 'orb', col: '#7CFC00', phases: [
    { attacks: [{ type: 'ring', interval: 1200, speed: 180, count: 12 }, { type: 'summon', interval: 3800, minion: 0 }] },
    { attacks: [{ type: 'ring', interval: 1000, speed: 200, count: 16, spin: 0.35 }, { type: 'spiral', interval: 160, speed: 190, count: 2, spin: 0.5 }] },
    { attacks: [{ type: 'ring', interval: 850, speed: 210, count: 18, spin: 0.4 }, { type: 'aimed', interval: 450, speed: 290, count: 3 }, { type: 'summon', interval: 2800, minion: 1 }, { type: 'charge', interval: 5000 }] },
  ]},
};
export const STYLE_KEYS = ['king', 'kraken', 'spider', 'mainframe', 'dragon', 'mothership'];

// === アダプティブBGMの音色パレット(テーマ毎に鳴りが変わる) ===
//   lead=主旋律 / bass=低音 / pad=和音 / feel: 0=明るい 1=暗い
export const MUSIC_PALETTES = [
  { lead: 'square',   bass: 'triangle', pad: 'sine',     feel: 0 }, // 空
  { lead: 'triangle', bass: 'sine',     pad: 'triangle', feel: 0 }, // 水
  { lead: 'sawtooth', bass: 'square',   pad: 'sine',     feel: 1 }, // 洞窟
  { lead: 'square',   bass: 'sawtooth', pad: 'square',   feel: 1 }, // ネオン
  { lead: 'sawtooth', bass: 'square',   pad: 'sawtooth', feel: 1 }, // マグマ
  { lead: 'triangle', bass: 'sine',     pad: 'sine',     feel: 0 }, // 宇宙
];

// ステージ→自機/弾のテーマ色(明示値が無ければ空色から導出)
export function stageTint(st) {
  const sky = (st && st.sky) || ['#4488ff', '#8fd3ff'];
  return {
    ship: (st && st.ship) || sky[1],
    shot: (st && st.shot) || sky[1],
  };
}

export const BELLS = [
  { color: '#ffffff', name: 'SCORE',  ja: 'スコア',   effect: 'points', value: 500 },
  { color: '#4a9eff', name: 'DASH',   ja: 'いどう',   effect: 'speed', duration: 9000 },
  { color: '#ff5252', name: 'POWER',  ja: 'パワー',   effect: 'power' },
  { color: '#b967ff', name: 'OPTION', ja: 'オプション', effect: 'option' },
  { color: '#ffd700', name: 'SHIELD', ja: 'シールド', effect: 'shield' },
  { color: '#7CFC00', name: 'BOMB',   ja: 'ボム',     effect: 'bomb' },
  // 撃つ方向そのものを変える武装。効果は時間切れで消えるので、強いまま居座らない。
  { color: '#ff9f1c', name: 'BOOMER', ja: 'ブーメラン', effect: 'boomerang', duration: 12000 },
  { color: '#3ddc97', name: 'REAR',   ja: 'うしろ撃ち', effect: 'rear',      duration: 14000 },
  { color: '#ff6fae', name: 'SIDE',   ja: 'よこ撃ち',   effect: 'side',      duration: 14000 },
  // SPEED は「自機の移動」が速くなる。弾を速くしたい時はこちら。
  { color: '#ff4d6d', name: 'SWIFT',  ja: 'たまはやく', effect: 'swift',     duration: 13000 },
  { color: '#ff2d55', name: 'LIFE',   ja: 'のこき+1',   effect: 'life' },
];
export const MAX_LIFE_BELL = 5;   // ベルで増やせる残機の上限

// ボス戦のあいだのベルの間隔(ms)。道中(17〜26秒)より明確に遅い。
//   なぜ要るのか: 「盤面が札を決める」という設計で、終盤の `greed`(ボスが
//   残ったベルを喰う)は**撃破の瞬間に盤面へベルが在ること**を条件にしている。
//   ところがベルの供給はボスが出た瞬間に止まっていて、道中のベルは数秒で
//   流れ去るので、条件が満たされる盤面が**一度も作られなかった**。
//   自動プレイ66回で `greed` が0回だったのはそのため(→ docs/sim-report.md)。
//   条件を緩めるのではなく、条件が満たされうる盤面を作る。
//   ついでに、拾うか残すかという判断がボス戦に生まれる。
export const BOSS_BELL_MIN = 9000;
export const BOSS_BELL_MAX = 15000;

// ベルで手に入る武装が使う絵文字。敵や背景と被らせない(テストで縛ってある)。
export const POWER_SHOT_EMOJIS = ['🪃'];

// 編隊パターン: (敵タイプ配列, 横軸の幅 span) → [{t, lat, delay}]
export const PATTERNS = [
  (types, span) => {
    const t = types[randInt(0, 1)];
    const n = randInt(4, 6);
    return Array.from({ length: n }, (_, i) => ({ t, lat: span * (i + 1) / (n + 1), delay: i * 140 }));
  },
  (types, span) => {
    const t = types[randInt(0, 2)];
    const mid = span / 2;
    return Array.from({ length: 5 }, (_, i) => ({ t, lat: mid + (i - 2) * 52, delay: Math.abs(i - 2) * 220 }));
  },
  (types, span) => {
    const t = types[randInt(1, types.length - 1)];
    return [0, 1, 2, 3].map(i => ({ t, lat: span * (i % 2 ? 0.7 : 0.3), delay: i * 240 }));
  },
  (types, span) => {
    const t = types[randInt(0, 1)];
    return Array.from({ length: 4 }, (_, i) => ({ t, lat: span * (0.2 + i * 0.2), delay: i * 190 }));
  },
  (types, span) => {
    const t = types[types.length - 1];
    return [{ t: { ...t, hp: t.hp + 2, pts: t.pts * 2 }, lat: span / 2, delay: 0 }];
  },
  (types, span) => {
    const t = types[randInt(0, 2)];
    return [0, 1, 2, 3, 4, 5].map(i => ({ t, lat: span * (i % 2 ? 0.12 : 0.88), delay: Math.floor(i / 2) * 300 }));
  },
  // === 隊列(インベーダー) ===
  //   横一列に並んで行進し、端に着いたら一段下がって折り返す。
  //   倒すほど残りが速くなる。時々1体が隊列を離れて急に突っ込んでくる。
  //   1体ずつ流れてくる他のパターンと違い、**画面全部が同時に迫る**圧を作る。
  (types, span) => {
    const t = types[randInt(0, Math.min(1, types.length - 1))];
    const cols = span < 420 ? 5 : 6, rows = 3;
    const gap = Math.min(66, (span - 110) / (cols - 1));
    const left = (span - gap * (cols - 1)) / 2;
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push({ t, lat: left + c * gap, delay: 0, march: { row: r, rows } });
      }
    }
    return out;
  },
];

// === 自機キャラクター(スマブラ方式: 選ぶと見た目・弾・性能が変わる) ===
//   ここの絵文字は「敵として絶対に使わない」約束。敵側の候補(config の STAGES と
//   aistage.js の THEMES)と重複させないこと。
//   speed=移動 / fire=連射(小さいほど速い) / size=弾の大きさ /
//   spread=追加の横広がり / pierce=貫通 / slow=命中した敵を鈍らせる
//   art:'ship' は幾何学的な戦闘機を描く(進行方向にちゃんと機首が向く)。
//   face は絵文字が元々向いている角度。指定すると進行方向へ回して描く。
export const CHARS = [
  // 並び順 = 開放される順。**強くなる順ではない。**
  //   前に置いてあるほど素直で、後ろに行くほどクセが強い。実効火力(powerScore)は
  //   全員 ±5% に収めてあり、テストで縛っている —— 後から来るキャラが強かったら、
  //   それは「進めた人だけ簡単になる」ということで、遊びが壊れる。
  //
  //   need = ステージを通算で何面クリアすると開くか(0 = 最初から)。
  //   traj = 弾の飛び方。straight 以外は engine の updateBullets が面倒を見る。
  //   pierce = **何体まで抜けるか**(0 = 抜けない)。無制限は作らない。
  //   強い癖には必ず埋め合わせを付ける(遅い/連射が落ちる/射程が短い など)。

  // --- 最初から使える3体。どれも「見た方向へ飛ぶ」ので、初手で迷わない ---
  { id: 'fighter', emoji: '🛩️', name: 'ファイター', en: 'FIGHTER', col: '#6cc6ff', need: 0,
    shot: '#8fe3ff', shotEmoji: null, speed: 1, fire: 1, size: 4, spread: 0, pierce: 0, slow: 0,
    bspeed: 1, traj: 'straight', dmg: 1, art: 'ship',
    tag: 'まっすぐ・素直', tagEn: 'Straight and honest',
    lore: '素直にまっすぐ飛ぶ。迷ったらこれ。', loreEn: 'Flies straight. Start here.' },

  // 最速の連射に値札を付ける。ミルクは **一番遅くて一番小さい**。
  //   手数は出るが、遠くの敵には届くまで待つことになる。
  { id: 'cow', emoji: '🐄', name: 'ウシ', en: 'COW', col: '#eaeaea', need: 0,
    shot: '#ffffff', shotEmoji: '🥛', speed: 0.95, fire: 0.84, size: 3, spread: 0, pierce: 0, slow: 0,
    bspeed: 0.6, traj: 'straight', dmg: 1,
    tag: '最速の連射・最遅の弾', tagEn: 'Fastest fire, slowest shot',
    lore: 'とにかく手数。ただしミルクは一番遅くて一番小さいので、遠くの敵には届くまで待つことになる。',
    loreEn: 'Sheer volume — but the slowest, smallest shot in the game, so distant enemies take a while.' },

  { id: 'cat', emoji: '🐱', name: 'ネコ', en: 'CAT', col: '#ffb26b', need: 0,
    shot: '#ffd7a8', shotEmoji: '🐾', speed: 1.3, fire: 0.95, size: 3.6, spread: 0, pierce: 0, slow: 0,
    bspeed: 0.95, traj: 'seek', dmg: 1,
    tag: '追いかける・一番身軽', tagEn: 'Chases, nimblest',
    lore: '獲物を見つけると少し曲がって追う。当たり判定も一番小さいが、弾は細い。',
    loreEn: 'Bends toward whatever it spots, and slips through the tightest gaps. The shot is thin, though.' },

  // --- ここから先は遊ぶほど開く。クセが強くなるだけで、強くはならない ---
  { id: 'rocket', emoji: '🚀', name: 'ロケット', en: 'ROCKET', col: '#ff9d5c', need: 1,
    shot: '#ffb44d', shotEmoji: '🔥', speed: 1.08, fire: 0.99, size: 4.8, spread: 0, pierce: 0, slow: 0,
    bspeed: 0.62, traj: 'accel', dmg: 1, face: -Math.PI / 4,
    tag: '出は遅い、伸びる', tagEn: 'Slow start, then flies',
    lore: '噴かしてから伸びる。近くは当てにくく、遠くまで一気に届く。',
    loreEn: 'Starts slow, then tears away. Poor up close, deadly at range.' },

  // 「広い」を弾の数ではなく **1発の大きさ** で出す。
  //   1発は1発。ただしその1発が大きいので、雑に撃っても当たる。
  { id: 'pizza', emoji: '🍕', name: 'ピザ', en: 'PIZZA', col: '#ff8a4d', need: 2,
    shot: '#ffc07a', shotEmoji: '🍕', speed: 0.92, fire: 0.84, size: 9, spread: 0, pierce: 0, slow: 0,
    bspeed: 0.8, traj: 'short', dmg: 1,
    tag: '一番大きいが近距離', tagEn: 'Biggest but short',
    lore: '一切れが大きいので狙いが甘くても当たる。ただし途中で落ちる。近づいてナンボ。',
    loreEn: 'One huge slice — sloppy aim still connects. But it drops early. Get close.' },

  { id: 'unicorn', emoji: '🦄', name: 'ユニコーン', en: 'UNICORN', col: '#e879f9', need: 3,
    shot: '#f5b8ff', shotEmoji: '✨', speed: 1, fire: 1.75, size: 5, spread: 0, pierce: 2, slow: 0,
    bspeed: 1, traj: 'grow', dmg: 1,
    tag: '育ちながら2体抜く', tagEn: 'Grows, pierces two',
    lore: '飛ぶほど輝きが大きくなり、2体まで抜ける。手前は細く、連射は遅い。',
    loreEn: 'The sparkle swells as it flies and passes through two. Thin up close, and slow to fire.' },

  { id: 'chicken', emoji: '🐓', name: 'ニワトリ', en: 'CHICKEN', col: '#ff8a80', need: 4,
    shot: '#ffd7b0', shotEmoji: '🥚', speed: 0.98, fire: 2.03, size: 5.4, spread: 0, pierce: 0, slow: 0,
    bspeed: 0.88, traj: 'split', dmg: 2,
    tag: '割れて二手に', tagEn: 'Splits in two',
    lore: '飛んでいる途中で割れて左右に分かれる。手前は1発、奥は2発ぶん。そのぶん次の卵は遅い。',
    loreEn: 'Cracks mid-flight and splits. One shot near, two shots far — but the next egg is slow to come.' },

  { id: 'snowman', emoji: '⛄', name: 'ゆきだるま', en: 'SNOWMAN', col: '#8fd8ff', need: 5,
    shot: '#d6f2ff', shotEmoji: '❄️', speed: 0.98, fire: 0.94, size: 5.4, spread: 0, pierce: 0, slow: 1,
    bspeed: 0.85, traj: 'spiral', dmg: 1,
    tag: '渦を巻いて凍らせる', tagEn: 'Spirals and freezes',
    lore: 'ぐるぐる回りながら進む。狙いはつけにくいが、当たれば敵が凍って鈍る。',
    loreEn: 'Corkscrews forward. Hard to aim, but it freezes what it touches.' },

  { id: 'poop', emoji: '💩', name: 'ウンチ', en: 'POOP', col: '#a9744f', need: 6,
    shot: '#c58a5e', shotEmoji: '💩', speed: 0.95, fire: 1.82, size: 8, spread: 0, pierce: 0, slow: 1,
    bspeed: 0.78, traj: 'decel', dmg: 2,
    tag: '重い・近距離', tagEn: 'Heavy, short range',
    lore: '重いので失速して落ちる。遠くには届かないが、当たった敵はしばらく鈍る。',
    loreEn: 'So heavy it stalls out. No reach, but whatever it hits slows down.' },

  { id: 'genie', emoji: '🧞‍♂️', name: 'ランプの精', en: 'GENIE', col: '#4fc3f7', need: 7,
    shot: '#9be7ff', shotEmoji: '💧', speed: 1.02, fire: 1.4, size: 5, spread: 0, pierce: 2, slow: 0,
    bspeed: 0.95, traj: 'wave', dmg: 1,
    tag: '波打って2体抜く', tagEn: 'Weaving jet, pierces two',
    lore: '水流は左右に揺れながら進み、2体まで抜ける。狙った一点には当てにくい。',
    loreEn: 'The jet weaves as it goes, passing through two. Hard to place precisely.' },

  { id: 'farmer', emoji: '🧑‍🌾', name: 'ファーマー', en: 'FARMER', col: '#ff9f45', need: 8,
    shot: '#ffc888', shotEmoji: '🥕', speed: 1.06, fire: 0.875, size: 4.4, spread: 0, pierce: 0, slow: 0,
    bspeed: 1.15, traj: 'scatter', dmg: 1,
    tag: '速いが散らばる', tagEn: 'Rapid but scattered',
    lore: '手で投げるので狙いが甘く、少しずつ散る。そのぶん手数と弾速はある。',
    loreEn: 'Thrown by hand, so they wander. Makes up for it in volume and speed.' },

  { id: 'chef', emoji: '🧑‍🍳', name: 'パン職人', en: 'BAKER', col: '#f0c27b', need: 9,
    shot: '#ffd9a0', shotEmoji: '🥖', speed: 0.95, fire: 2.13, size: 5.2, spread: 0, pierce: 0, slow: 0,
    bspeed: 0.72, traj: 'lure', dmg: 2,
    tag: '匂いで引き寄せる', tagEn: 'Lures them in',
    lore: '焼きたての匂いに敵が吸い寄せられる。まとめて釣れるが、こっちにも寄ってくる。焼き上がりは遅い。',
    loreEn: 'Enemies drift toward the smell. Gathers them up — and brings them closer. Slow to bake.' },

  { id: 'dog', emoji: '🦮', name: 'イヌ', en: 'DOG', col: '#d9a066', need: 10,
    shot: '#f0e2c8', shotEmoji: '🦴', speed: 1.22, fire: 0.88, size: 4.5, spread: 0, pierce: 0, slow: 0,
    bspeed: 1, traj: 'bounce', dmg: 1,
    tag: '壁で跳ね返る', tagEn: 'Bounces off walls',
    lore: '骨は画面の端で跳ね返って戻ってくる。端に寄るほど手数が増えるが、どこへ返るかは読みにくい。',
    loreEn: 'Bones ricochet off the sides. Hug a wall for extra hits — but good luck predicting where they land.' },

  // ツリーは1枚の葉が **止まらずに列を薙ぐ**(3体まで)。
  //   横に流れるので狙って当てられない。当たったときだけ大きい。
  { id: 'tree', emoji: '🌲', name: 'ツリー', en: 'TREE', col: '#67c96a', need: 11,
    shot: '#a8e8a0', shotEmoji: '🍃', speed: 0.88, fire: 1.15, size: 6.5, spread: 0, pierce: 3, slow: 0,
    bspeed: 0.72, traj: 'drift', dmg: 1,
    tag: '流れて3体を薙ぐ', tagEn: 'Drifts, mows down three',
    lore: '葉は風に流されて横へ逃げるが、当たった敵を3体まで突き抜けていく。狙うより置く。',
    loreEn: 'The leaf drifts away from your aim, but passes through up to three. Place it, do not aim it.' },

  // ⚡ は「無制限に貫く光」だった。列に並んだ敵を丸ごと消せて、他の15体と
  //   同じゲームを遊んでいなかった。**2体まで**に区切り、そのぶん一番速い弾と
  //   一番長い溜めを持たせている。抜けるのは2体、狙いは自分で通す。
  { id: 'bolt', emoji: '⚡', name: 'カミナリ', en: 'BOLT', col: '#ffe14d', need: 12,
    shot: '#fff2a0', shotEmoji: null, speed: 1.05, fire: 2.02, size: 3, spread: 0, pierce: 2, slow: 0,
    bspeed: 2.1, traj: 'beam', dmg: 1,
    tag: '一直線に2体を貫く', tagEn: 'Pierces two in a line',
    lore: '細い光が一瞬で走り、2体まで貫く。ゲーム中で一番速い弾だが、次の一発まで一番長く待つ。',
    loreEn: 'A thin bolt crosses the screen instantly and pierces two. The fastest shot in the game — and the longest wait for the next one.' },

  { id: 'gorilla', emoji: '🦍', name: 'ゴリラ', en: 'GORILLA', col: '#ffd54f', need: 13,
    shot: '#ffe89a', shotEmoji: '🍌', speed: 0.85, fire: 2.11, size: 5.2, spread: 0, pierce: 0, slow: 0,
    bspeed: 0.6, traj: 'curve', dmg: 3,
    tag: '曲がる・最重量', tagEn: 'Curves, hits hardest',
    lore: 'バナナは弧を描いて飛ぶのでまっすぐ当たらない。当たれば一番重いが、投げ直すのに一番時間がかかる。',
    loreEn: 'Bananas arc, so they never go where you point. Nothing hits harder — and nothing is slower to throw again.' },
];

// 自機スキン(bestWorld で解禁。見た目のみ・性能に影響しない)
export const SKINS = [
  { name: 'CLASSIC', body: '#4488ff', body2: '#66aaff', nose: '#ffffff', wing: '#ff4444', trail: '#ffd400', need: 0 },
  { name: 'EMERALD', body: '#0fa36b', body2: '#3fd99a', nose: '#eafff5', wing: '#ffd23f', trail: '#7CFC00', need: 3 },
  { name: 'MAGMA',   body: '#ff5a3c', body2: '#ff8a5c', nose: '#fff0e0', wing: '#ffd23f', trail: '#ff3b00', need: 6 },
  { name: 'GALAXY',  body: '#8b5cf6', body2: '#b98cff', nose: '#f3e8ff', wing: '#22d3ee', trail: '#e879f9', need: 10 },
];

// === 敵の「性格」 ===
//   絵文字を見た瞬間に動きが想像でき、しかも基本4種より読みにくい。
//   乱数で散らすと理不尽になるだけなので、絵柄に紐づく決まった癖として与える。
//   slither=蛇行 / dive=不規則な急降下 / glide=滑走と停止 / blink=瞬間移動 /
//   angular=直角に曲がる / hop=跳ねる / lurk=溜めてから突進
export const MOVES = {
  slither: ['🐍', '🦎', '🪼', '🐙', '🦑', '🦋', '🐟', '🦐', '🦠', '🌀'],
  dive:    ['🦇', '🐝', '🕷️', '🦅', '☄️', '😈', '👺'],
  glide:   ['🐧', '🦭', '🐻‍❄️', '🥶', '🧊', '🕊️', '🍣', '🍙', '🌑'],
  blink:   ['👻', '🧛', '💀', '🔮', '👾', '🛸', '👽', '🌟'],
  angular: ['🤖', '🦾', '🔧', '📡', '💾', '🚓'],
  hop:     ['🐸', '🐰', '🍡', '🧁', '🍬', '🍰', '🐦'],
  lurk:    ['🦈', '🐊', '🦖', '🦕', '🐡', '👹', '🦉', '🧟'],
};
// 絵文字 → 性格 の逆引き(起動時に1度だけ作る)
export const MOVE_BY_EMOJI = (() => {
  const m = {};
  for (const [k, list] of Object.entries(MOVES)) for (const e of list) m[e] = k;
  return m;
})();

// === 純粋ユーティリティ ===
export const rand = (a, b) => Math.random() * (b - a) + a;
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const midiFreq = m => 440 * Math.pow(2, (m - 69) / 12);

// 文字列 → 32bit シード
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// 決定論的乱数(mulberry32)。同じシード→同じ結果。
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// きょうの日付キー(ローカル)
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 弾道の見本線。カード画面で「どう飛ぶか」を絵で見せるためのもの。
//   実装(engine の applyTraj)を figures にしたものなので、片方だけ変えないこと。
//   x は 0=発射点 → 1=画面奥、y は横ずれ(-1..1)。
/**
 * 飛び方から決まる2つの軸。
 *
 * 「ファーマーとベイカーの違いが正直わからない」と言われた。棒4本(威力・
 * 連射・弾速・身のこなし)では、ファーマーがベイカーに全部勝っているように
 * 見える。実際の差は **狙ったところへ行くか** と **どこまで届くか** で、
 * どちらも数字になっていなかった。ここで数字にして、カードにも出す。
 *
 *   acc   … 狙いどおりに飛ぶ度合い。1.0 = まっすぐ
 *   range … 届く距離。近距離キャラの短所を数字にする
 *
 * 飛び方に紐づけて1か所で持つ。16人ぶんを手で書くと必ずズレる。
 */
export const TRAJ_TRAITS = {
  straight: { acc: 1.00, range: 1.0 },
  accel:    { acc: 0.95, range: 1.0 },
  beam:     { acc: 1.00, range: 1.0 },
  seek:     { acc: 1.00, range: 1.0 },   // 追尾。曲がるが必ず寄っていく
  lure:     { acc: 1.00, range: 1.0 },
  grow:     { acc: 0.95, range: 1.0 },
  split:    { acc: 0.85, range: 1.0 },
  wave:     { acc: 0.75, range: 1.0 },
  bounce:   { acc: 0.72, range: 1.0 },   // 跳ね返った先は読めないが、往路はまっすぐ
  spiral:   { acc: 0.60, range: 1.0 },
  scatter:  { acc: 0.68, range: 1.0 },   // 散るのは少しずつ。絵の振れ幅に合わせた
  drift:    { acc: 0.45, range: 1.0 },
  curve:    { acc: 0.40, range: 1.0 },
  short:    { acc: 0.90, range: 0.45 },
  decel:    { acc: 0.90, range: 0.50 },
};
export function trajTrait(k) { return TRAJ_TRAITS[k || 'straight'] || TRAJ_TRAITS.straight; }

// === 実効火力 ===
//   「後から開くキャラのほうが強い」を **数字で禁止する** ための物差し。
//   カードの棒(ひとげき・れんしゃ…)は1本ずつしか見えないので、
//   1本を伸ばして別の1本を削る調整をしていると、全体では強くなっていても
//   誰も気づけない。掛け算にして1つの数にすると、それが見える。
//
//   各項の意味と、上げたときに何が起きるか:
//     dmg × (1/fire) … 1発の重さ × 毎秒の発射回数。素の手数。
//     aim   0.45+acc*0.55 … 狙った所へ行くか。曲がる弾は当たらないので割り引く。
//     girth (size/4)^0.4  … 弾の太さ。太いほど雑な狙いでも当たる。効きは緩やか。
//     reach 0.38+range*0.62 … 届く距離。近距離キャラは敵に寄る=死ぬ危険を払っている。
//     multi 貫通            … 列に何体並んでいても抜ける。**狙えない弾の貫通は価値が低い**
//                             ので acc を掛け、**遅い弾は列が崩れる前に届かない**ので
//                             弾速も掛ける。⚡ が壊れていたのはこの項が無制限だったから。
//     util  鈍化・横広がり  … おまけ。効果は小さいが 0 ではない。
//     swift 弾速            … 速い弾は敵が近づく前に当たる。効きは弱め(読みやすさが主目的)。
//
//   ファイターが 1.00 になるように作ってある。全員 ±5% 以内に収め、
//   test/balance.test.js がそれを縛る。数字を触ったらテストを走らせること。
export function powerScore(c) {
  const t = trajTrait(c.traj);
  const bsp = c.bspeed || 1;
  return (c.dmg || 1) * (1 / c.fire)
    * (0.45 + t.acc * 0.55)
    * Math.pow((c.size || 4) / 4, 0.40)
    * (0.38 + t.range * 0.62)
    * (1 + (c.pierce || 0) * t.acc * 0.34 * (0.62 + bsp * 0.38))
    * (1 + (c.slow ? 0.09 : 0) + (c.spread ? 0.11 : 0))
    * (0.86 + bsp * 0.14);
}

// === クセの強さ(0..1) ===
//   カードに「つよさ」を出すと嘘になる(全員同じにしてあるので)。代わりに
//   **どれだけ言うことを聞かないか** を出す。狙いが通らない・届かない・
//   溜めが長い、の3つ。開放順はおおむねこの順(＋見た目の派手さ)で並べてあるが、
//   **火力は順番と無関係**。そこはテストで縛る。
export function quirkScore(c) {
  const t = trajTrait(c.traj);
  const aim = 1 - t.acc;                       // 狙いが通らない
  const shortness = 1 - t.range;               // 届かない
  const slowRate = Math.min(1, Math.max(0, (c.fire - 0.8) / 1.3));   // 溜めが長い
  return Math.min(1, aim * 0.55 + shortness * 0.55 + slowRate * 0.30);
}

// === 開放 ===
//   need = 通算で何ステージ制覇したら開くか。CHARS の並び順 = 開放順。
export const CHAR_NEED = (c) => (c && c.need) | 0;
/** 通算クリア数から、使えるキャラの人数を出す。最初の3体は常に使える。 */
export function unlockedCharCount(cleared) {
  let n = 0;
  for (const c of CHARS) if ((cleared | 0) >= CHAR_NEED(c)) n++;
  return n;
}
/** そのキャラが使えるか。 */
export function charUnlocked(i, cleared) {
  const c = CHARS[i];
  return !!c && (cleared | 0) >= CHAR_NEED(c);
}
/** 次に開くキャラ(と、あと何面か)。全部開いていたら null。 */
export function nextCharUnlock(cleared) {
  for (let i = 0; i < CHARS.length; i++) {
    if (!charUnlocked(i, cleared)) return { index: i, char: CHARS[i], left: CHAR_NEED(CHARS[i]) - (cleared | 0) };
  }
  return null;
}

export const TRAJ_PREVIEW = {
  straight: { name: 'まっすぐ', en: 'Straight', pts: [[0, 0], [1, 0]] },
  accel:    { name: '加速',     en: 'Accelerates', pts: [[0, 0], [0.12, 0], [0.3, 0], [0.6, 0], [1, 0]], speed: 1 },
  seek:     { name: '追尾',     en: 'Homing', pts: [[0, 0], [0.3, 0.05], [0.6, 0.35], [0.85, 0.55], [1, 0.6]] },
  beam:     { name: '貫通ビーム', en: 'Piercing beam', pts: [[0, 0], [1, 0]], beam: 1 },
  short:    { name: '近距離',   en: 'Short range', pts: [[0, 0], [0.45, 0]], fade: 1 },
  wave:     { name: '波打つ',   en: 'Weaves', pts: [[0, 0], [0.15, 0.35], [0.3, 0], [0.45, -0.35], [0.6, 0], [0.75, 0.35], [0.9, 0], [1, -0.2]] },
  lure:     { name: '敵を引き寄せ', en: 'Lures enemies', pts: [[0, 0], [1, 0]], lure: 1 },
  spiral:   { name: '渦巻き',   en: 'Corkscrew', pts: [[0, 0], [0.12, 0.4], [0.25, 0], [0.37, -0.4], [0.5, 0], [0.62, 0.4], [0.75, 0], [0.87, -0.4], [1, 0]] },
  drift:    { name: '横に流れる', en: 'Drifts sideways', pts: [[0, 0], [0.3, 0.12], [0.6, 0.38], [1, 0.8]] },
  bounce:   { name: '壁で跳ねる', en: 'Bounces', pts: [[0, 0], [0.35, 0.85], [0.7, -0.85], [1, 0.3]] },
  curve:    { name: '弧を描く', en: 'Curves', pts: [[0, 0], [0.3, 0.1], [0.6, 0.34], [0.85, 0.7], [1, 1]] },
  split:    { name: '割れる',   en: 'Splits', pts: [[0, 0], [0.4, 0]], split: [[[0.4, 0], [1, 0.55]], [[0.4, 0], [1, -0.55]]] },
  grow:     { name: '育つ',     en: 'Grows', pts: [[0, 0], [1, 0]], grow: 1 },
  decel:    { name: '失速する', en: 'Stalls out', pts: [[0, 0], [0.55, 0]], fade: 1 },
  scatter:  { name: '散らばる', en: 'Scatters', pts: [[0, 0], [0.25, 0.1], [0.5, -0.06], [0.75, 0.18], [1, 0.05]] },
};
