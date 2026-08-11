// ============================================================
// bellrelay.js — ベルの受け渡し
//
// ツインビーのベルは、撃つたびに色が変わる。2人で遊ぶと、同じベルを
// 取り合ったり譲り合ったりすることになる —— **ひとつしかないものを、
// 複数人で触る**というだけで、そこに会話が生まれていた。
//
// ここではもう一歩進める。**ベルは「違う人」が鳴らさないと熟さない。**
//
//   ひとりで何発撃っても、ベルは青いまま(位)。
//   2人が代わるがわる鳴らすと金(位2)。3人で虹(位3)。4人で極(位4)。
//   位が上がると、拾ったときの効き目がそのぶん強くなる。
//
// ソロでは位1より上には**絶対に**ならない。人数がそのまま
// 「取れる強さの上限」になる —— これが「4人だからこそ」の見返り側。
//
// 色を選ぶ仕組み(撃つと色が回る・近づくと固定される)はそのまま残す。
// 位は色とは別の軸なので、「どの色を、何人で熟させるか」の2択になる。
// ============================================================

/** 位の上限。部屋の定員と揃える。 */
export const MAX_RANK = 4;

/** 位ごとの見た目。描画とHUDが読む。 */
export const RANKS = [
  { color: '#8fd3ff', name: 'SOLO', ja: '',     mul: 1 },   // 位1: ひとりぶん
  { color: '#ffd700', name: 'DUO',  ja: '金',   mul: 2 },   // 位2: ふたりで熟した
  { color: '#b967ff', name: 'TRIO', ja: '虹',   mul: 3 },
  { color: '#7CFC00', name: 'QUAD', ja: '極',   mul: 4 },
];

export const rankInfo = rank => RANKS[Math.min(Math.max(rank | 0, 1), MAX_RANK) - 1];

/**
 * ベルを鳴らした人を記録して、位を返す。
 *
 * **同じ人が何度鳴らしても位は上がらない。** ここが全部で、
 * これが無いとソロの連射がそのまま最高位になってしまう。
 *
 * @param bell {who:string[]} 鳴らした人の id(重複なし)
 * @param byId 鳴らした人の id
 * @returns 新しい位(1..MAX_RANK)。上がった時だけ before < after になる
 */
export function ring(bell, byId) {
  if (!bell.who) bell.who = [];
  if (byId && !bell.who.includes(byId) && bell.who.length < MAX_RANK) bell.who.push(byId);
  // **下げない。** ゲストは受け取った位を持ったまま自分のぶんを先に鳴らすので、
  //   who の長さで上書きすると、スナップショットが来るたび位1に落ちて点滅する。
  bell.rank = Math.max(1, bell.rank | 0, bell.who.length);
  return bell.rank;
}

/**
 * 効き目の倍率。位がそのまま倍率になる。
 *
 * 倍率の掛け方は効果の種類で変える —— 数を増やすもの(パワー、オプション、
 * ボム、残機)は**+1ずつ**にする。位4で残機が4個増えると、難しくした意味が
 * 全部消えるため。時間で効くもの(いどう、ブーメラン等)とスコアは素直に掛ける。
 */
export function bellBoost(effect, rank) {
  const r = Math.min(Math.max(rank | 0, 1), MAX_RANK);
  switch (effect) {
    case 'points': return { mul: r * r, add: 0 };          // スコアだけは派手に(位4=16倍)
    case 'power': case 'option': case 'bomb': case 'life':
      return { mul: 1, add: r - 1 };                        // 位2で+1個ぶん多く入る
    default: return { mul: 1 + (r - 1) * 0.6, add: 0 };     // 持続時間: 位4で2.8倍
  }
}
