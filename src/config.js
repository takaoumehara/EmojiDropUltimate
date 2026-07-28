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
    bgEmojis: ['🔥', '🌋', '💥', '🪨'],
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
  { color: '#4a9eff', name: 'SPEED',  ja: 'スピード', effect: 'speed', duration: 9000 },
  { color: '#ff5252', name: 'POWER',  ja: 'パワー',   effect: 'power' },
  { color: '#b967ff', name: 'OPTION', ja: 'オプション', effect: 'option' },
  { color: '#ffd700', name: 'SHIELD', ja: 'シールド', effect: 'shield' },
  { color: '#7CFC00', name: 'BOMB',   ja: 'ボム',     effect: 'bomb' },
  // 撃つ方向そのものを変える武装。効果は時間切れで消えるので、強いまま居座らない。
  { color: '#ff9f1c', name: 'BOOMER', ja: 'ブーメラン', effect: 'boomerang', duration: 12000 },
  { color: '#3ddc97', name: 'REAR',   ja: 'うしろ撃ち', effect: 'rear',      duration: 14000 },
  { color: '#ff6fae', name: 'SIDE',   ja: 'よこ撃ち',   effect: 'side',      duration: 14000 },
];

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
];

// === 自機キャラクター(スマブラ方式: 選ぶと見た目・弾・性能が変わる) ===
//   ここの絵文字は「敵として絶対に使わない」約束。敵側の候補(config の STAGES と
//   aistage.js の THEMES)と重複させないこと。
//   speed=移動 / fire=連射(小さいほど速い) / size=弾の大きさ /
//   spread=追加の横広がり / pierce=貫通 / slow=命中した敵を鈍らせる
//   art:'ship' は幾何学的な戦闘機を描く(進行方向にちゃんと機首が向く)。
//   face は絵文字が元々向いている角度。指定すると進行方向へ回して描く。
export const CHARS = [
  { id: 'fighter', emoji: '🛩️', name: 'ファイター', en: 'FIGHTER', col: '#6cc6ff',
    shot: '#8fe3ff', shotEmoji: null, speed: 1, fire: 1, size: 4, spread: 0, pierce: 0, slow: 0, bspeed: 1.0,
    art: 'ship', tag: 'バランス', tagEn: 'All-round' },
  { id: 'rocket', emoji: '🚀', name: 'ロケット', en: 'ROCKET', col: '#ff9d5c',
    shot: '#ffc48f', shotEmoji: null, speed: 1.08, fire: 1.05, size: 4.6, spread: 0, pierce: 0, slow: 0, bspeed: 1.15,
    face: -Math.PI / 4, tag: '加速重視', tagEn: 'Boosted' },
  { id: 'cat', emoji: '🐱', name: 'ネコ', en: 'CAT', col: '#ffb26b',
    shot: '#ffd7a8', shotEmoji: '🐾', speed: 1.3, fire: 0.95, size: 3.4, spread: 0, pierce: 0, slow: 0, bspeed: 1.1,
    tag: 'すばやい', tagEn: 'Fastest move' },
  { id: 'bolt', emoji: '⚡', name: 'カミナリ', en: 'BOLT', col: '#ffe14d',
    shot: '#fff2a0', shotEmoji: null, speed: 1.05, fire: 0.62, size: 3, spread: 0, pierce: 0, slow: 0, bspeed: 1.2,
    tag: '連射', tagEn: 'Rapid fire' },
  { id: 'pizza', emoji: '🍕', name: 'ピザ', en: 'PIZZA', col: '#ff8a4d',
    shot: '#ffc07a', shotEmoji: null, speed: 0.92, fire: 1.45, size: 4.2, spread: 1, pierce: 0, slow: 0, bspeed: 0.95,
    tag: '横に広い', tagEn: 'Wide shot' },
  { id: 'unicorn', emoji: '🦄', name: 'ユニコーン', en: 'UNICORN', col: '#e879f9',
    shot: '#f5b8ff', shotEmoji: '✨', speed: 1, fire: 1.25, size: 5.2, spread: 0, pierce: 1, slow: 0, bspeed: 1.05,
    tag: 'つらぬく', tagEn: 'Piercing' },
  { id: 'poop', emoji: '💩', name: 'ウンチ', en: 'POOP', col: '#a9744f',
    shot: '#c58a5e', shotEmoji: '💩', speed: 0.95, fire: 1.4, size: 8, spread: 0, pierce: 0, slow: 1, bspeed: 0.8,
    tag: 'ベタッと減速', tagEn: 'Sticky slow' },

  // --- 「その絵文字なら何を投げるか」で決めた面々 ---
  //   dmg を持つキャラは1発が重いぶん連射が遅い。合計火力はどれもほぼ同じで、
  //   違うのは「当てやすさ」と「取り回し」。見た目だけの差にはしない。
  { id: 'genie', emoji: '🧞‍♂️', name: 'ランプの精', en: 'GENIE', col: '#4fc3f7',
    shot: '#9be7ff', shotEmoji: '💧', speed: 1.02, fire: 1.3, size: 5.4, spread: 0, pierce: 1, slow: 0, dmg: 1, bspeed: 1.05,
    tag: '水流がつらぬく', tagEn: 'Piercing jet' },
  { id: 'chef', emoji: '🧑‍🍳', name: 'パン職人', en: 'BAKER', col: '#f0c27b',
    shot: '#ffd9a0', shotEmoji: '🥖', speed: 0.95, fire: 1.5, size: 6.4, spread: 0, pierce: 0, slow: 0, dmg: 2, bspeed: 0.72,
    tag: '固いパンで殴る', tagEn: 'Heavy loaf' },
  { id: 'farmer', emoji: '🧑‍🌾', name: 'ファーマー', en: 'FARMER', col: '#ff9f45',
    shot: '#ffc888', shotEmoji: '🥕', speed: 1.06, fire: 0.74, size: 4.8, spread: 0, pierce: 0, slow: 0, dmg: 1, bspeed: 1.0,
    tag: '人参を速射', tagEn: 'Carrot volley' },
  { id: 'snowman', emoji: '⛄', name: 'ゆきだるま', en: 'SNOWMAN', col: '#8fd8ff',
    shot: '#d6f2ff', shotEmoji: '❄️', speed: 0.98, fire: 1.15, size: 5.6, spread: 0, pierce: 0, slow: 1, dmg: 1, bspeed: 0.85,
    tag: '凍らせて止める', tagEn: 'Freezes' },
  { id: 'tree', emoji: '🌲', name: 'ツリー', en: 'TREE', col: '#67c96a',
    shot: '#a8e8a0', shotEmoji: '🍃', speed: 0.88, fire: 1.3, size: 5, spread: 1, pierce: 0, slow: 0, dmg: 1, bspeed: 0.8,
    tag: '葉が横に広がる', tagEn: 'Wide leaves' },
  { id: 'dog', emoji: '🦮', name: 'イヌ', en: 'DOG', col: '#d9a066',
    shot: '#f0e2c8', shotEmoji: '🦴', speed: 1.22, fire: 0.8, size: 4.4, spread: 0, pierce: 0, slow: 1, dmg: 1, bspeed: 1.05,
    tag: '走りながら撒く', tagEn: 'Hit and run' },
  { id: 'gorilla', emoji: '🦍', name: 'ゴリラ', en: 'GORILLA', col: '#ffd54f',
    shot: '#ffe89a', shotEmoji: '🍌', speed: 0.85, fire: 1.9, size: 7.6, spread: 0, pierce: 0, slow: 0, dmg: 3, bspeed: 0.68,
    tag: '最重量の一撃', tagEn: 'Heaviest hit' },
  { id: 'cow', emoji: '🐄', name: 'ウシ', en: 'COW', col: '#eaeaea',
    shot: '#ffffff', shotEmoji: '🥛', speed: 0.95, fire: 0.68, size: 4.6, spread: 0, pierce: 0, slow: 0, dmg: 1, bspeed: 1.15,
    tag: 'ミルク最速連射', tagEn: 'Fastest fire' },
  { id: 'chicken', emoji: '🐓', name: 'ニワトリ', en: 'CHICKEN', col: '#ff8a80',
    shot: '#ffd7b0', shotEmoji: '🥚', speed: 0.98, fire: 1.42, size: 5.6, spread: 0, pierce: 0, slow: 0, dmg: 2, bspeed: 0.85,
    tag: '卵は当たりやすい', tagEn: 'Big egg' },
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
