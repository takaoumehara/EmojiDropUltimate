// ============================================================
// tools/emoji-sheet.mjs — docs/emoji.html を生成する
//   ゲームが実際に使っている文字をソースから集めるので、絵文字を足したり
//   差し替えたりしても、生成し直せば台帳は必ず現物と一致する。
//
//   使い方: node tools/emoji-sheet.mjs
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// config.js / aistage.js はブラウザ前提の値をわずかに触るので、テストと同じ土台を敷く
await import(path.join(ROOT, 'test/bootstrap.js'));
const CFG = await import(path.join(ROOT, 'src/config.js'));
const { proceduralStage } = await import(path.join(ROOT, 'src/aistage.js'));
const { STAGES, CHARS, MOVES, MOVE_BY_EMOJI, makeRng, hashStr } = CFG;

const THEME_COUNT = 7;   // aistage.js の THEMES と揃える

const roles = new Map();
function add(emoji, role) {
  if (!emoji) return;
  if (!roles.has(emoji)) roles.set(emoji, new Set());
  roles.get(emoji).add(role);
}

for (const st of STAGES) {
  for (const e of st.enemies) add(e.emoji, '敵');
  add(st.boss.emoji, 'ボス');
  for (const b of (st.bgEmojis || [])) add(b, '背景');
  add(st.emoji, 'ステージ看板');
}
const rng = makeRng(hashStr('emoji-sheet'));
for (let i = 0; i < THEME_COUNT; i++) {
  const s = proceduralStage(rng, i);
  for (const e of s.enemies) add(e.emoji, '敵');
  add(s.boss.emoji, 'ボス');
  for (const b of (s.bgEmojis || [])) add(b, '背景');
  add(s.emoji, 'ステージ看板');
}
for (const c of CHARS) {
  add(c.emoji, '自機キャラ');
  if (c.shotEmoji) add(c.shotEmoji, '自機の弾');
}
for (const [kind, list] of Object.entries(MOVES)) for (const e of list) add(e, '性格:' + kind);

// UI や演出でソースに直書きされているもの
const EMOJI_RE = /(\p{Extended_Pictographic}([\uFE0E\uFE0F]|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)+/gu;
for (const f of ['src/render.js', 'src/engine.js', 'src/ui.js', 'src/sharecard.js', 'src/coop.js', 'src/config.js', 'index.html']) {
  const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of txt.matchAll(EMOJI_RE)) if (!roles.has(m[0])) add(m[0], 'UI・演出');
}

const codepoints = e => [...e].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
// 単独では「文字」として扱われる記号は、U+FE0F が無いと端末によって白黒で出る
const isTextDefault = e => [...e].length === 1 && !/\p{Emoji_Presentation}/u.test(e);
function shape(e) {
  const pts = [...e];
  if (pts.includes('‍')) return 'zwj';
  if (pts.includes('︎')) return 'text15';   // わざと白黒に固定してあるもの
  if (pts.includes('️')) return 'vs16';
  return pts.length > 1 ? 'multi' : 'single';
}
// 台帳の並び順。ゲームの中で目に入る順序に合わせる。
const GROUP_ORDER = ['player', 'enemy', 'boss', 'bg', 'sign', 'ui', 'spare'];
function group(rs) {
  if (rs.some(r => r === '自機キャラ' || r === '自機の弾')) return 'player';
  if (rs.includes('敵')) return 'enemy';
  if (rs.includes('ボス')) return 'boss';
  if (rs.includes('背景')) return 'bg';
  if (rs.includes('ステージ看板')) return 'sign';
  if (rs.includes('UI・演出')) return 'ui';
  return 'spare';
}

const data = [...roles.entries()].map(([emoji, set]) => {
  const rs = [...set];
  return {
    e: emoji,
    cp: codepoints(emoji),
    s: shape(emoji),
    t: isTextDefault(emoji) ? 1 : 0,
    g: group(rs),
    r: rs.filter(r => !r.startsWith('性格:')),
    m: MOVE_BY_EMOJI[emoji] || null,
  };
}).sort((a, b) => GROUP_ORDER.indexOf(a.g) - GROUP_ORDER.indexOf(b.g));

const tpl = fs.readFileSync(path.join(ROOT, 'tools/emoji-sheet.tpl.html'), 'utf8');
const html = tpl.replace('/*__DATA__*/null', JSON.stringify(data));
fs.writeFileSync(path.join(ROOT, 'docs/emoji.html'), html);

const counts = GROUP_ORDER.map(g => `${g}:${data.filter(d => d.g === g).length}`).join(' ');
console.log(`docs/emoji.html を書き出しました — ${data.length}字 (${counts})`);
console.log(`  合字・複数コードポイント: ${data.filter(d => d.s !== 'single').length}`);
console.log(`  異体字セレクタ無し(白黒で出る恐れ): ${data.filter(d => d.t).length} → ${data.filter(d => d.t).map(d => d.e).join(' ')}`);
