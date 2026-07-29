// ============================================================
// super.js — キャラごとの必殺技(16人ぜんぶ別)
//
// 前回は8種類を2人ずつで共有していた。「雪だるまと木がどちらもブリザード」は
// 理由が説明できず、キャラを選び分ける意味も薄れる。**16人ぜんぶ違う技**にした。
//
// 貯め方: 敵を倒す・ベルを拾うで溜まる。被弾では溜めない。
// 撃ち方: ダブルタップのまま。溜まっていれば必殺技、空ならボム。
// 2人以上: 誰かの技が出ている間に自分も撃つと「合体」する。
//
// kind = 中身の仕組み。名前と見た目だけ変えた「同じ技」にはしない。
//   lane     … 進行方向の帯を薙ぐ
//   ring     … 自機から広がる輪
//   freeze   … 画面全体を止める
//   stink    … 近寄れなくする雲
//   pets     … 追尾する仲間
//   rain     … 上から降ってくる
//   harvest  … 下から突き上げる
//   chain    … 敵から敵へ連鎖する
//   orbit    … 自機の周りを回る
//   sweep    … 帯が画面を横切る
//   wall     … 敵弾を止める壁
//   missiles … 追尾する飛び道具
//   eggs     … 落ちて割れて分裂する
//   wish     … 毎回ちがう
// ============================================================

export const SUPERS = {
  // --- 🛩️ ファイター ---
  megabeam: {
    kind: 'lane', emoji: '🔆', col: '#ffe27a', dur: 1800, tick: 26,
    ja: 'メガビーム', en: 'MEGA BEAM',
  },
  // --- 🚀 ロケット ---
  missilerain: {
    kind: 'missiles', emoji: '🚀', col: '#ff8a5c', dur: 2600, tick: 9,
    ja: 'ミサイルの雨', en: 'MISSILE RAIN',
  },
  // --- 🐈 ネコ ---
  catpack: {
    kind: 'pets', emoji: '🐈', col: '#ffcf6b', dur: 3200, tick: 7,
    ja: 'ねこのむれ', en: 'CAT PACK', pet: '🐈', pets: 5, petSpeed: 340,
  },
  // --- ⚡ カミナリ ---
  thunderweb: {
    kind: 'chain', emoji: '⚡', col: '#fff36b', dur: 2000, tick: 15,
    ja: 'かみなりの網', en: 'THUNDER WEB',
  },
  // --- 🍕 ピザ ---
  pizzawheel: {
    kind: 'orbit', emoji: '🍕', col: '#ffb04d', dur: 2600, tick: 18,
    ja: 'ピザホイール', en: 'PIZZA WHEEL', orbit: '🍕', arms: 3,
  },
  // --- 🦄 ユニコーン ---
  rainbowbridge: {
    kind: 'sweep', emoji: '🌈', col: '#ff9de2', dur: 2200, tick: 17,
    ja: 'にじのはし', en: 'RAINBOW BRIDGE', from: 'side',
  },
  // --- 💩 ウンチ ---
  thesmell: {
    kind: 'stink', emoji: '☁️', col: '#a8d86b', dur: 3000, tick: 8,
    ja: 'におい', en: 'THE SMELL',
  },
  // --- 🧞 ジーニー ---
  onewish: {
    kind: 'wish', emoji: '🪄', col: '#c9a0ff', dur: 2200, tick: 11,
    ja: 'ねがいごと', en: 'ONE WISH',
  },
  // --- 👨‍🍳 パン職人 ---
  feast: {
    kind: 'rain', emoji: '🍽️', col: '#ffd27f', dur: 2800, tick: 11,
    ja: 'ごちそう', en: 'FEAST', items: ['🍞', '🥐', '🍰', '🍩', '🥖'],
  },
  // --- 🧑‍🌾 農家 ---
  harvest: {
    kind: 'harvest', emoji: '🌽', col: '#9ede6b', dur: 2600, tick: 13,
    ja: 'しゅうかく', en: 'HARVEST', items: ['🌽', '🥕', '🍅', '🥔', '🍆'],
  },
  // --- ⛄ 雪だるま ---
  blizzard: {
    kind: 'freeze', emoji: '❄️', col: '#8fd3ff', dur: 2600, tick: 5,
    ja: 'ブリザード', en: 'BLIZZARD',
  },
  // --- 🎄 ツリー ---
  forestwall: {
    kind: 'wall', emoji: '🌲', col: '#7fd68a', dur: 3400, tick: 6,
    ja: 'もりのかべ', en: 'FOREST WALL',
  },
  // --- 🐕 イヌ ---
  bonestorm: {
    kind: 'bones', emoji: '🦴', col: '#e8ddc0', dur: 2600, tick: 10,
    ja: 'ほねのあらし', en: 'BONE STORM',
  },
  // --- 🦍 ゴリラ ---
  quake: {
    kind: 'ring', emoji: '🌊', col: '#ffb347', dur: 1600, tick: 20,
    ja: 'じしん', en: 'QUAKE', shake: true,
  },
  // --- 🐄 ウシ ---
  milkflood: {
    kind: 'sweep', emoji: '🥛', col: '#ffffff', dur: 2400, tick: 14,
    ja: 'ミルクの洪水', en: 'MILK FLOOD', from: 'back',
  },
  // --- 🐔 ニワトリ ---
  eggbomb: {
    kind: 'eggs', emoji: '🥚', col: '#ffe9a8', dur: 2600, tick: 12,
    ja: 'たまごばくだん', en: 'EGG BOMBS',
  },
};

/** キャラ → 技。**16人ぜんぶ違う。** */
export const SUPER_BY_CHAR = {
  fighter: 'megabeam',
  rocket: 'missilerain',
  cat: 'catpack',
  bolt: 'thunderweb',
  pizza: 'pizzawheel',
  unicorn: 'rainbowbridge',
  poop: 'thesmell',
  genie: 'onewish',
  chef: 'feast',
  farmer: 'harvest',
  snowman: 'blizzard',
  tree: 'forestwall',
  dog: 'bonestorm',
  gorilla: 'quake',
  cow: 'milkflood',
  chicken: 'eggbomb',
};

export function superKeyOf(charId) { return SUPER_BY_CHAR[charId] || 'megabeam'; }
export function superOf(charId) { return SUPERS[superKeyOf(charId)]; }

// === 溜まり方 ===
export const SUPER_MAX = 100;
export const SUPER_GAIN = {
  kill: 4,        // 雑魚1体
  bellPick: 14,   // ベルを拾う
  bossHit: 0.6,   // ボスに1発当てる
};

/** 合体の受付時間。短すぎると狙って合わせられず、長すぎると偶然になる。 */
export const FUSION_WINDOW = 2200;

/** 合体したときの倍率。 */
export function fusionMul(n) { return 1 + (Math.max(2, n) - 1) * 0.85; }
