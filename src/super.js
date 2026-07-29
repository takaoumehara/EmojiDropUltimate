// ============================================================
// super.js — キャラごとの必殺技
//
// なぜ入れるか:
//   子供が「2人でも1人と変わらない」と言った。人数でボスを硬くしても、
//   増えるのは作業時間で、**やれることは増えない**。増やすべきは
//   「自分にしかできないこと」で、それがキャラごとに違えば、
//   誰を選ぶかにも、誰と組むかにも意味が出る。
//
// 貯め方:
//   敵を倒す・ベルを拾うで溜まる。被弾では溜めない(失敗に褒美を出さない)。
//
// 撃ち方:
//   **ダブルタップのまま**。溜まっていれば必殺技、溜まっていなければ
//   これまで通りボム。新しい操作を覚えさせずに、同じ指で結果が変わる。
//
// 2人以上のとき:
//   **誰かの必殺技が出ている間に自分も撃つと「合体」する。**
//   これは人数でしか起きない。ボスが硬いのは我慢だが、合体は
//   ひとりでは絶対に見られないので、**2人でやる理由**そのものになる。
// ============================================================

/**
 * 必殺技の型。16キャラを8つの型に割り当てる。
 *   dur    … 効いている時間(ms)
 *   tick   … 毎秒どれだけ削るか(敵/ボス共通の目安)
 *   reach  … 効く範囲('all'=画面全体 / 'lane'=射線 / 'ring'=自機から広がる)
 */
export const SUPERS = {
  blizzard: {
    emoji: '❄️', col: '#8fd3ff', dur: 2600, tick: 5, reach: 'all',
    ja: 'ブリザード', en: 'BLIZZARD',
    jaDesc: '画面ぜんぶが凍る。敵は止まり、弾も遅くなる。',
    enDesc: 'The screen freezes. Enemies stop and bullets crawl.',
  },
  beam: {
    emoji: '🔆', col: '#ffe27a', dur: 1800, tick: 26, reach: 'lane',
    ja: 'メガビーム', en: 'MEGA BEAM',
    jaDesc: '進む方向へ極太のビーム。当たったものは押し流される。',
    enDesc: 'A pillar of light straight ahead. Everything in it is swept away.',
  },
  nova: {
    emoji: '💥', col: '#ff6bd6', dur: 1400, tick: 16, reach: 'ring',
    ja: 'ノヴァ', en: 'NOVA',
    jaDesc: '自機から衝撃の輪が広がる。近いほど痛い。',
    enDesc: 'Shockwave rings spread from your ship. Closer hurts more.',
  },
  swarm: {
    emoji: '🐾', col: '#8affc1', dur: 3200, tick: 7, reach: 'all',
    ja: 'なかまをよぶ', en: 'CALL THE PACK',
    jaDesc: '仲間が飛び出して、敵を追いかけて食べる。',
    enDesc: 'Your friends leap out, chase enemies down and eat them.',
  },
  quake: {
    emoji: '🌊', col: '#ffb347', dur: 1600, tick: 20, reach: 'ring',
    ja: 'じしん', en: 'QUAKE',
    jaDesc: '地面から突き上げる。画面が揺れ、近くのものが砕ける。',
    enDesc: 'The ground bucks. The screen shakes and everything near you breaks.',
  },
  feast: {
    emoji: '🍽️', col: '#ffd27f', dur: 2800, tick: 11, reach: 'all',
    ja: 'ごちそう', en: 'FEAST',
    jaDesc: 'ごちそうが降ってくる。触れた敵は食べられて、点になる。',
    enDesc: 'Food rains down. Enemies that touch it get eaten, and become points.',
  },
  wish: {
    emoji: '🪄', col: '#c9a0ff', dur: 2200, tick: 11, reach: 'all',
    ja: 'ねがいごと', en: 'ONE WISH',
    jaDesc: '何が起きるか毎回わからない。願いは一度きり。',
    enDesc: 'Nobody knows what happens. A wish only works once.',
  },
  stink: {
    emoji: '☁️', col: '#a8d86b', dur: 3000, tick: 8, reach: 'all',
    ja: 'におい', en: 'THE SMELL',
    jaDesc: 'においが広がる。敵はよろけて、こちらへ来られない。',
    enDesc: 'The smell spreads. Enemies stagger and cannot reach you.',
  },
};

/**
 * どのキャラがどの必殺技を持つか。
 * 見た目と技が噛み合っていないと「なぜそれ?」になるので、
 * 絵柄から素直に想像できるものだけを割り当てる。
 */
export const SUPER_BY_CHAR = {
  snowman: 'blizzard', tree: 'blizzard',
  fighter: 'beam', rocket: 'beam',
  bolt: 'nova', unicorn: 'nova',
  cat: 'swarm', dog: 'swarm', chicken: 'swarm',
  gorilla: 'quake', cow: 'quake',
  pizza: 'feast', chef: 'feast', farmer: 'feast',
  genie: 'wish',
  poop: 'stink',
};

/** そのキャラの必殺技(未定義なら nova を既定にして、必ず何か撃てる)。 */
export function superOf(charId) {
  return SUPERS[SUPER_BY_CHAR[charId] || 'nova'];
}
export function superKeyOf(charId) {
  return SUPER_BY_CHAR[charId] || 'nova';
}

// === 溜まり方 ===
// 満タンまでに必要な量。1ステージで2〜3回撃てるくらいを狙う。
export const SUPER_MAX = 100;
export const SUPER_GAIN = {
  kill: 4,        // 雑魚1体
  bellPick: 14,   // ベルを拾う
  bossHit: 0.6,   // ボスに1発当てる
};

/**
 * 合体の受付時間。誰かの必殺技が出ている間に自分も撃つと合体する。
 * 短すぎると狙って合わせられず、長すぎると「たまたま」になる。
 */
export const FUSION_WINDOW = 2200;

/** 合体したときの倍率。人数ぶん強くなり、見た目も派手になる。 */
export function fusionMul(n) { return 1 + (Math.max(2, n) - 1) * 0.85; }
