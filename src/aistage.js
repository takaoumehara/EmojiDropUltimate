// ============================================================
// aistage.js — AIステージ生成
//   まず Vercel サーバーレス関数 /api/ai-stage (Gemini) に問い合わせ、
//   失敗/未接続時は端末内でユニークなステージを手続き生成する(オフラインOK)。
// ============================================================
import { rand, randInt, pick, clamp, STYLE_KEYS, makeRng, hashStr } from './config.js';

const DIRS_LIST = ['up', 'right', 'down', 'left'];
const HEX = /^#([0-9a-fA-F]{6})$/;
const isEmoji = s => typeof s === 'string' && s.length > 0 && s.length <= 8;
const hex = (c, fb) => (typeof c === 'string' && HEX.test(c.trim())) ? c.trim() : fb;
const clampN = (v, a, b, fb) => (typeof v === 'number' && isFinite(v)) ? Math.max(a, Math.min(b, Math.round(v))) : fb;

// LLM/手続き どちらの結果もここで安全な STAGE 形へ正規化する
export function normalizeStage(raw) {
  raw = raw || {};
  const dir = DIRS_LIST.includes(raw.dir) ? raw.dir : pick(DIRS_LIST);
  const sky = Array.isArray(raw.sky) ? raw.sky : [];
  const night = Array.isArray(raw.night) ? raw.night : [];
  const bg = Array.isArray(raw.bgEmojis) ? raw.bgEmojis.filter(isEmoji).slice(0, 4) : [];
  while (bg.length < 4) bg.push('✨');
  const types = ['straight', 'wave', 'shooter', 'tank', 'kamikaze'];
  let enemies = Array.isArray(raw.enemies) ? raw.enemies : [];
  enemies = enemies.slice(0, 4).map((e, i) => {
    e = e || {};
    const type = types.includes(e.type) ? e.type : ['straight', 'wave', 'shooter', 'tank'][i % 4];
    return {
      type, emoji: isEmoji(e.emoji) ? e.emoji : ['👾', '🦠', '🛸', '🌀'][i % 4],
      hp: clampN(e.hp, 1, 8, 1 + i), speed: clampN(e.speed, 40, 340, 120 + i * 10),
      pts: clampN(e.pts, 50, 800, 120 + i * 60), size: clampN(e.size, 14, 28, 18 + i),
      amp: clampN(e.amp, 40, 140, 90), freq: (typeof e.freq === 'number' ? Math.max(1, Math.min(3, e.freq)) : 2),
      shootRate: (type === 'shooter' || type === 'tank') ? (typeof e.shootRate === 'number' ? Math.max(0.4, Math.min(1.5, e.shootRate)) : 0.9) : 0,
    };
  });
  while (enemies.length < 4) {
    const i = enemies.length;
    enemies.push({ type: ['straight', 'wave', 'shooter', 'tank'][i], emoji: ['👾', '🦠', '🛸', '🌀'][i], hp: 1 + i, speed: 120 + i * 10, pts: 120 + i * 60, size: 18 + i, amp: 90, freq: 2, shootRate: i >= 2 ? 0.9 : 0 });
  }
  const boss = raw.boss || {};
  return {
    name: (typeof raw.name === 'string' && raw.name.trim()) ? raw.name.trim().slice(0, 16) : 'ミステリーゾーン',
    en: (typeof raw.en === 'string' && raw.en.trim()) ? raw.en.trim().slice(0, 24) : 'MYSTERY ZONE',
    emoji: isEmoji(raw.emoji) ? raw.emoji : '🌀',
    dir,
    sky: [hex(sky[0], '#2b1b52'), hex(sky[1], '#7b2ff7')],
    night: [hex(night[0], '#12071f'), hex(night[1], '#3a1466')],
    bgEmojis: bg,
    enemies,
    boss: {
      emoji: isEmoji(boss.emoji) ? boss.emoji : '👹',
      name: (typeof boss.name === 'string' && boss.name.trim()) ? boss.name.trim().slice(0, 16) : 'カオスロード',
      en: (typeof boss.en === 'string' && boss.en.trim()) ? boss.en.trim().slice(0, 24) : 'CHAOS LORD',
      hp: clampN(boss.hp, 60, 260, 150),
      style: STYLE_KEYS.includes(boss.style) ? boss.style : pick(STYLE_KEYS),
    },
    dur: 40000,
    bpm: clampN(raw.bpm, 120, 168, 140),
    scale: Array.isArray(raw.scale) && raw.scale.every(n => typeof n === 'number') ? raw.scale.slice(0, 6) : [60, 63, 65, 67, 70],
    ai: true,
  };
}

// 端末内で手続き生成(キーもサーバーも不要)
const THEMES = [
  { name: 'キャンディ地獄', en: 'CANDY HELL', emoji: '🍬', sky: ['#ff6fae', '#ffd1ec'], night: ['#5a123f', '#a11d6e'], bg: ['🍭', '🧁', '🍩', '🍫'], en_list: ['🍬', '🍡', '🧁', '🍰'], boss: ['🎂', 'シュガーロード', 'SUGAR LORD'] },
  { name: '寿司ストーム', en: 'SUSHI STORM', emoji: '🍣', sky: ['#0e6b5a', '#57e0b8'], night: ['#04241d', '#0b5a48'], bg: ['🍤', '🐟', '🍥', '🥢'], en_list: ['🍣', '🍙', '🦐', '🐙'], boss: ['🐋', 'デカネタ大将', 'BIG NETA'] },
  { name: 'ロボ工場', en: 'ROBO FACTORY', emoji: '🏭', sky: ['#3a3f52', '#8b95b8'], night: ['#12141d', '#33384d'], bg: ['⚙️', '🔩', '🔌', '📦'], en_list: ['🤖', '🦾', '🔧', '📡'], boss: ['🦿', 'ギガボット', 'GIGABOT'] },
  { name: '恐竜ジャングル', en: 'DINO JUNGLE', emoji: '🦖', sky: ['#2f7d32', '#a5e86a'], night: ['#0f2a12', '#2c5a1e'], bg: ['🌿', '🌴', '🪨', '🥥'], en_list: ['🦕', '🐊', '🦎', '🐍'], boss: ['🦖', 'ティラノキング', 'TYRANNO KING'] },
  { name: '氷結パレス', en: 'FROST PALACE', emoji: '🧊', sky: ['#2c6fb0', '#bfe8ff'], night: ['#0b2036', '#1d4d7a'], bg: ['🌨️', '🧊', '🏔️', '🌬️'], en_list: ['🐧', '🦭', '🥶', '🐻‍❄️'], boss: ['🧙', 'アイスウィッチ', 'ICE WITCH'] },
  { name: 'お化け屋敷', en: 'HAUNTED HOUSE', emoji: '🏚️', sky: ['#4a2c6b', '#9b6fd4'], night: ['#1a0f2e', '#3a1f5c'], bg: ['🕯️', '🕸️', '⚰️', '🔮'], en_list: ['👻', '🧛', '🦇', '💀'], boss: ['🎃', 'パンプキングド', 'PUMPKIN LORD'] },
  { name: 'エモジ銀河', en: 'EMOJI GALAXY', emoji: '🌠', sky: ['#1b0b3a', '#6d3bd6'], night: ['#08041a', '#2a1466'], bg: ['🪐', '⭐', '🌙', '☄️'], en_list: ['🛸', '👽', '🌟', '☄️'], boss: ['🌞', 'ソーラータイタン', 'SOLAR TITAN'] },
];

// rng を渡すと決定論的(デイリー/URLシードで全員同じステージ)。省略時は Math.random。
export function proceduralStage(rng = Math.random, themeIdx = -1) {
  const R = (a, b) => rng() * (b - a) + a;
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const PK = arr => arr[Math.floor(rng() * arr.length)];
  const th = themeIdx >= 0 ? THEMES[themeIdx % THEMES.length] : PK(THEMES);
  const dir = PK(DIRS_LIST);
  const mk = (i, type) => ({
    type, emoji: th.en_list[i % th.en_list.length],
    hp: type === 'tank' ? RI(4, 7) : type === 'shooter' ? RI(2, 4) : RI(1, 2),
    speed: type === 'kamikaze' ? RI(240, 320) : type === 'tank' ? RI(42, 60) : RI(100, 160),
    pts: 120 + i * 70, size: RI(16, 24),
    amp: RI(70, 120), freq: R(1.5, 2.6),
    shootRate: (type === 'shooter' || type === 'tank') ? R(0.7, 1.3) : 0,
  });
  return normalizeStage({
    name: th.name, en: th.en, emoji: th.emoji, dir,
    sky: th.sky, night: th.night, bgEmojis: th.bg,
    enemies: [mk(0, 'straight'), mk(1, 'wave'), mk(2, 'shooter'), mk(3, PK(['tank', 'kamikaze']))],
    // style も rng から決める。ここを省くと normalizeStage が Math.random() に
    // フォールバックし、同じシードでも人によってボスの弾幕と色が変わってしまう
    // (デイリーの「全員同じ面」と共闘の「二人に同じ世界」が壊れる)。
    boss: { emoji: th.boss[0], name: th.boss[1], en: th.boss[2], hp: RI(150, 210), style: PK(STYLE_KEYS) },
    bpm: RI(132, 160),
  });
}

// === 章(チャプター): 6ステージで1章。制覇したら次の章が開く ===
//   第1章は手書きの6ステージ。第2章以降はテーマから決定論生成するので、
//   誰がいつ遊んでも同じ内容になり、章が進むほど手強くなる。
export function chapterStages(n, baseStages) {
  if (n <= 0) return JSON.parse(JSON.stringify(baseStages));
  // テーマが被らないよう、章ごとに決定論シャッフルしてから6つ取る
  const order = THEMES.map((_, i) => i);
  const shuf = makeRng(hashStr(`chapter-order-${n}`));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(shuf() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const out = [];
  for (let i = 0; i < 6; i++) {
    const rng = makeRng(hashStr(`chapter-${n}-${i}`));
    out.push(scaleStage(proceduralStage(rng, order[i]), 1 + n * 2 + i * 0.4));
  }
  return out;
}

// エンドレス用: ワールドが進むほど強く(世界1=等倍)
export function scaleStage(base, world) {
  const f = 1 + (world - 1) * 0.11;
  const s = JSON.parse(JSON.stringify(base));
  s.enemies = s.enemies.map(e => ({
    ...e,
    hp: Math.max(1, Math.round(e.hp * (1 + (world - 1) * 0.16))),
    speed: Math.round(clamp(e.speed * (1 + (world - 1) * 0.05), 40, 360)),
    shootRate: e.shootRate ? clamp(e.shootRate * f, 0.4, 2.0) : 0,
    pts: Math.round(e.pts * f),
  }));
  s.boss = { ...s.boss, hp: Math.round(s.boss.hp * (1 + (world - 1) * 0.18)) };
  s.dur = Math.max(24000, Math.round((s.dur || 40000) * (1 - (world - 1) * 0.03)));
  return s;
}

// メイン: サーバー(Gemini)→ 失敗時ローカル
export async function generateStage(weatherSummary) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch('/api/ai-stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weather: weatherSummary || 'clear', seed: Math.floor(Math.random() * 1e9) }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!r.ok) throw new Error('http ' + r.status);
    const data = await r.json();
    if (!data || !data.stage) throw new Error('no stage');
    return { stage: normalizeStage(data.stage), source: 'ai' };
  } catch (e) {
    return { stage: proceduralStage(), source: 'local' };
  }
}
