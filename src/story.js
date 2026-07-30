// ============================================================
// story.js — ミッションと章
//
// 「6面でひと区切り」は前から動いていた(Save.chapter + chapterStages)。
// 動いていたのに、**一言も伝えていなかった**。だから誰も気づかない。
// 足りなかったのは仕組みではなく、なぜ戦うのかという理由のほう。
//
// 通した比喩は **ショー**。この世界はエモジの旅まわりの見世物で、
// 1章がひとつのショー。ショーが終われば次のショーが来る。
//   ・第1章〜第3章 … 手で書く。起・承・結。3章目で座長本人が出る
//   ・第4章以降   … 組み合わせで作る。無限に続く
//
// 3章で切らないのは、このゲームの一番の強みが「終わらない」ことだから。
// 逆に文章を全部機械に作らせないのは、外れた1本が世界観を壊すから。
// 手で書いた3章で骨格を見せてから、同じ型で無限に流す。
//
// 最後の1面(7面目)は **6体が戻ってきて1つになる**。倒した相手が合体して
// 出てくるのは、絵で一番分かりやすい「大詰め」で、ボスの仕組みも流用できる。
// ============================================================

import { makeRng, hashStr } from './config.js';

/** 助け出す相手。章ごとに6人ぶん。 */
const CHAPTERS = [
  {
    id: 'friends',
    title: 'さらわれたなかま', titleEn: 'THE TAKEN FRIENDS',
    hook: '6人のなかまが、6つの世界に連れ去られた。',
    hookEn: 'Six friends. Six worlds. All of them taken.',
    verb: 'すくえ', verbEn: 'Save',
    line: '{boss} から {target} をすくえ', lineEn: 'Save {target} from {boss}',
    saves: ['🐣', '🐥', '🐤', '🐰', '🐨', '🐼'],
    beats: [
      { emoji: '🎪', ja: 'エモジドロップ団の、いつもの夜だった。', en: 'Just another night at the Emoji Drop show.' },
      { emoji: '🌪️', ja: 'とつぜん幕がめくれ、6人のなかまが連れ去られた。', en: 'The curtain tore. Six friends were dragged away.' },
      { emoji: '🐣', ja: 'ひとりずつ、ちがう世界に隠された。', en: 'One hidden in each world.' },
      { emoji: '🛩️', ja: 'かわりに飛べるのは、きみだけだ。', en: 'You are the only one left who can fly.' },
    ],
    boss: { emoji: '🌀', name: 'シックス', en: 'THE SIX', hp: 260 },
    bossLine: '倒した6体がもどってきて、ひとつになった。',
    bossLineEn: 'All six came back — and became one.',
  },
  {
    id: 'bells',
    title: 'ぬすまれたベル', titleEn: 'THE STOLEN BELLS',
    hook: 'なかまは帰った。でも世界からベルが消えた。ベルが鳴らないと、ショーは始まらない。',
    hookEn: 'The friends came home. But every bell is gone — and without bells, there is no show.',
    verb: 'とりもどせ', verbEn: 'Recover',
    line: '{boss} から {target} をとりもどせ', lineEn: 'Take {target} back from {boss}',
    saves: ['🔔', '🔕', '🎐', '📢', '🎺', '🥁'],
    beats: [
      { emoji: '🎊', ja: 'なかまは帰ってきた。ショーは満員だった。', en: 'The friends came home. The house was full.' },
      { emoji: '🔕', ja: 'ところが開幕のベルが、どこにも無い。', en: 'But the opening bell was nowhere to be found.' },
      { emoji: '🌫️', ja: '6つの世界から、音がぜんぶ盗まれていた。', en: 'Every sound had been stolen from all six worlds.' },
      { emoji: '🚀', ja: '鳴らしにいこう。音がもどれば、幕はあがる。', en: 'Go make some noise. The curtain rises when it rings.' },
    ],
    boss: { emoji: '🔇', name: 'サイレンス', en: 'SILENCE', hp: 300 },
    bossLine: '音を飲みこんだものが、まだ静かに待っていた。',
    bossLineEn: 'The thing that swallowed every sound was still waiting, quietly.',
  },
  {
    id: 'ringmaster',
    title: 'さいごのショー', titleEn: 'THE LAST SHOW',
    hook: 'ぜんぶ仕組んでいた座長が、最後の舞台にきみを呼んだ。',
    hookEn: 'The ringmaster behind all of it has called you to one final stage.',
    verb: 'ぶちやぶれ', verbEn: 'Break through',
    line: '{boss} をたおして {target} をうばえ', lineEn: 'Beat {boss} and take {target}',
    saves: ['🎫', '🎟️', '🪄', '🎭', '🎬', '👑'],
    beats: [
      { emoji: '✉️', ja: '招待状が1枚、ひとりでに届いた。', en: 'An invitation arrived on its own.' },
      { emoji: '🎪', ja: '「ぜんぶ、わたしの演出でした」', en: '"All of it was my staging."' },
      { emoji: '🎭', ja: 'さらったのも、音を盗んだのも、座長だった。', en: 'The kidnapping, the silence — the ringmaster, all along.' },
      { emoji: '⚡', ja: '最後の6舞台。幕を、こっちから閉めにいく。', en: 'Six stages left. This time you close the curtain.' },
    ],
    boss: { emoji: '🎪', name: 'リングマスター', en: 'THE RINGMASTER', hp: 340 },
    bossLine: '座長みずから、舞台の中央に立った。',
    bossLineEn: 'The ringmaster himself took center stage.',
  },
];

// === 第4章以降。組み合わせで作る ===
//   1本の外れが世界観を壊すので、部品はどう混ざっても意味が通るものだけにする。
const GEN = {
  what: [
    { s: ['🍰', '🍭', '🍩', '🧁', '🍪', '🍫'], ja: 'ごちそう', en: 'THE FEAST', verb: 'とりもどせ', verbEn: 'Recover' },
    { s: ['⭐', '🌟', '✨', '💫', '🌠', '☄️'], ja: 'ほしのかけら', en: 'THE STAR SHARDS', verb: 'あつめろ', verbEn: 'Collect' },
    { s: ['🐶', '🐱', '🐭', '🐹', '🦊', '🐻'], ja: 'まいごたち', en: 'THE LOST ONES', verb: 'すくえ', verbEn: 'Save' },
    { s: ['🎈', '🎁', '🎀', '🪁', '🎠', '🎡'], ja: 'おまつりの道具', en: 'THE CARNIVAL', verb: 'とりかえせ', verbEn: 'Take back' },
    { s: ['🌱', '🌷', '🌻', '🍀', '🌸', '🌳'], ja: 'みどりのたね', en: 'THE SEEDS', verb: 'まきなおせ', verbEn: 'Replant' },
    { s: ['💧', '🌊', '❄️', '☔', '🌈', '⛲'], ja: '水のながれ', en: 'THE WATERS', verb: 'ながしなおせ', verbEn: 'Set flowing' },
  ],
  who: [
    { e: '👹', ja: 'おおおに', en: 'THE OGRE' },
    { e: '🐲', ja: 'ふたごりゅう', en: 'THE TWIN DRAGON' },
    { e: '🧿', ja: 'まなこ', en: 'THE EYE' },
    { e: '🕰️', ja: 'とまった時計', en: 'THE STOPPED CLOCK' },
    { e: '🌑', ja: 'かげのぬし', en: 'THE SHADOW' },
    { e: '🤡', ja: 'にせ座長', en: 'THE FALSE MASTER' },
  ],
};

function generatedChapter(n) {
  const rng = makeRng(hashStr(`story-chapter-${n}`));
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const what = pick(GEN.what), who = pick(GEN.who);
  const num = n + 1;
  return {
    id: `gen-${n}`,
    title: `${what.ja}を${what.verb}`, titleEn: `${what.verb === 'すくえ' ? 'SAVE' : 'RECOVER'} ${what.en}`,
    hook: `新しいショーが始まった。${who.ja}が${what.ja}を6つの世界に隠した。`,
    hookEn: `A new show begins. ${who.en} has hidden ${what.en} across six worlds.`,
    verb: what.verb, verbEn: what.verbEn,
    line: `{boss} から {target} を${what.verb}`, lineEn: `${what.verbEn} {target} from {boss}`,
    saves: what.s,
    beats: [
      { emoji: '🎪', ja: `第${num}のショー、開幕。`, en: `Show number ${num}. Curtain up.` },
      { emoji: who.e, ja: `${who.ja}が舞台をのっとった。`, en: `${who.en} has taken the stage.` },
      { emoji: what.s[0], ja: `${what.ja}は6つの世界に散らばっている。`, en: `${what.en} is scattered across six worlds.` },
      { emoji: '🚀', ja: 'いつもどおり、飛ぶのはきみだ。', en: 'Same as always — you are the one who flies.' },
    ],
    boss: { emoji: who.e, name: who.ja, en: who.en, hp: 260 + Math.min(160, n * 22) },
    bossLine: `${who.ja}が、6つの力をまとめて舞台に立った。`,
    bossLineEn: `${who.en} took the stage with all six powers at once.`,
  };
}

/** どの章でも必ず中身が返る。 */
export function chapterOf(n) {
  const i = Math.max(0, n | 0);
  return i < CHAPTERS.length ? CHAPTERS[i] : generatedChapter(i);
}

export function chapterCount() { return CHAPTERS.length; }

/** 手書きの3章を終えたか。演出を1段あげる合図に使う。 */
export function isHandmade(n) { return (n | 0) < CHAPTERS.length; }

/**
 * その面ぶんのミッション1行。
 * 「🐙クラーケンから🐣をすくえ」——誰から、何を、どうするのかを1行で。
 */
export function missionFor(chapterIdx, stageIndex, st, ja) {
  const c = chapterOf(chapterIdx);
  const target = c.saves[stageIndex % c.saves.length];
  const bossName = st && st.boss ? (ja ? st.boss.name : st.boss.en) : '';
  const bossEmoji = st && st.boss ? st.boss.emoji : '';
  // 章ごとに文型が違う。共通テンプレートにすると「切符をぶちやぶれ」のような
  //   意味の通らない一文が出る(第3章は奪う話で、助ける話ではない)。
  const tpl = (ja ? c.line : c.lineEn) || (ja ? '{boss} から {target} を{verb}' : '{verb} {target} from {boss}');
  return tpl.replace('{boss}', `${bossEmoji}${bossName}`).replace('{target}', target)
            .replace('{verb}', ja ? c.verb : c.verbEn);
}

/** 最後の1面のミッション。 */
export function finalMissionFor(chapterIdx, ja) {
  const c = chapterOf(chapterIdx);
  return ja ? `${c.boss.emoji}${c.boss.name} をたおせ` : `Defeat ${c.boss.emoji}${c.boss.en}`;
}

/**
 * 章の最後の1面(7面目)。
 *
 * 6つの面の敵をぜんぶ混ぜて、そこに章のボスを立てる。短くする —— ここは
 * 道中を歩く場所ではなく、決着をつける場所なので。
 */
export function finalStage(chapterIdx, stages) {
  const c = chapterOf(chapterIdx);
  const src = stages.slice(0, 6);
  const rng = makeRng(hashStr(`final-${chapterIdx}`));
  // 各面から1体ずつ引いて、最後の面だけの寄せ集めにする
  const enemies = src.map((s, i) => {
    const list = s.enemies || [];
    const e = list[Math.min(list.length - 1, 1 + (i % 3))] || list[0];
    return JSON.parse(JSON.stringify(e));
  }).filter(Boolean);
  const base = src[src.length - 1] || stages[0];
  return {
    name: c.title, en: c.titleEn, emoji: c.boss.emoji,
    dir: ['up', 'right', 'down', 'left'][Math.floor(rng() * 4)],
    sky: ['#2a0b3a', '#8b2fb0'], night: ['#120418', '#3d0f52'],
    bgEmojis: ['🎪', '🎭', '✨', '🎆'],
    enemies,
    boss: { emoji: c.boss.emoji, name: c.boss.name, en: c.boss.en, hp: c.boss.hp, style: 'king' },
    ship: base.ship || '#ffd54f', shot: base.shot || '#ffe89a',
    // 短い。ここはボス戦であって道中ではない。
    dur: 34000, bpm: 168, scale: base.scale || [60, 63, 67, 70, 74],
    finale: true,
  };
}
