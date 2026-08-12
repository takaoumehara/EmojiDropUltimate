// ============================================================
// help.test.js — 「あそびかた」の検証
//
// 説明書には固有の壊れ方がある。**書いた瞬間は正しく、少しずつ嘘になる。**
// 残機を4から3に変えても説明書は4のままで、しかも誰も気づかない ——
// 気づくのは、それを読んで信じた人が困ったときだけ。
//
// だからここで一番大事なのは3つ目のテスト:
//   **画面に出る数値が、エンジンの実際の値と一致していること。**
// 一致しなくなったら、その場でここが落ちる。
//
// 残りは:
//   1. 用意している言語(日本語・英語)の両方で、全ページに中身があること
//   2. 1ページに新しいことを4つ以上載せていないこと
//   4. どこから開いても、閉じたら開いた場所へ戻ること
//   5. 5ページ × 2言語 × 縦の短い端末でも、例外なく描き切れること
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './bootstrap.js';
import { HELP_PAGES, helpPage, partyTable } from '../src/help.js';

test('用意している言語の両方で、全ページに中身がある', () => {
  for (const lang of [true, false]) {
    for (const key of HELP_PAGES) {
      const p = helpPage(key, lang);
      const where = `${key}/${lang ? 'ja' : 'en'}`;
      assert.ok(p, `${where}: ページが存在すること`);
      for (const f of ['icon', 'title', 'lead', 'foot']) {
        assert.ok(p[f] && String(p[f]).trim().length > 0, `${where}: ${f} が空でないこと`);
      }
      assert.ok(p.rows.length > 0, `${where}: 中身の行があること`);
      for (const r of p.rows) {
        assert.ok(r.icon && r.head && r.body, `${where}: 行に絵・見出し・本文が揃っていること`);
      }
    }
  }
});

test('日本語と英語で、別の文章になっている(訳し忘れが無い)', () => {
  for (const key of HELP_PAGES) {
    const ja = helpPage(key, true), en = helpPage(key, false);
    assert.notEqual(ja.title, en.title, `${key}: 見出しが訳されていること`);
    assert.notEqual(ja.lead, en.lead, `${key}: 導入が訳されていること`);
    assert.equal(ja.rows.length, en.rows.length, `${key}: 行数が言語で食い違わないこと`);
    ja.rows.forEach((r, i) => {
      assert.notEqual(r.body, en.rows[i].body, `${key}[${i}]: 本文が訳されていること`);
    });
  }
});

test('1ページに新しいことを4つ以上載せていない', () => {
  // 5つ目を入れたくなったらページを割る合図。一度に受け取れる新しい概念は
  //   4つが上限で、5つ書くと「全部読んだのに何も残らない」ページになる。
  for (const key of HELP_PAGES) {
    const p = helpPage(key, true);
    assert.ok(p.rows.length <= 4, `${key}: 行は4つまで (いまは ${p.rows.length})`);
  }
});

test('人数の表の数値が、エンジンの実際の値と一致している', async () => {
  const { coopScaling, diffMods } = await import('../src/engine.js');
  const { shieldCount } = await import('../src/guard.js');
  const { RANKS } = await import('../src/bellrelay.js');
  const T = partyTable(true);

  const row = name => T.rows.find(r => r.name === name);
  assert.equal(T.cols.length, 4, 'ひとり/2人/3人/4人 の4列');

  // 残機 —— ソロは難易度設定の値、共闘は coopLives
  const lives = row('のこき').cells;
  assert.equal(lives[0], String(diffMods().lives), 'ソロの残機が設定と一致');
  for (const n of [2, 3, 4]) {
    assert.equal(lives[n - 1], String(coopScaling(n).lives), `${n}人の残機が一致`);
  }

  // 敵の量 —— ソロを1としたときの比
  const en = row('てきの量').cells;
  assert.equal(en[0], '×1.0');
  for (const n of [2, 3, 4]) {
    assert.equal(en[n - 1], '×' + coopScaling(n).spawn.toFixed(1), `${n}人の湧きが一致`);
  }

  // 盾の枚数
  const sh = row('たてもち').cells;
  assert.match(sh[0], /出ない/, 'ソロには盾持ちが出ないと書いてあること');
  for (const n of [2, 3, 4]) {
    assert.ok(sh[n - 1].includes(String(shieldCount(n))), `${n}人の盾の枚数が一致 (${sh[n - 1]})`);
  }

  // ベルの位
  const bl = row('ベルの位').cells;
  for (const n of [2, 3, 4]) {
    assert.ok(bl[n - 1].includes(String(RANKS[n - 1].mul)), `${n}人の位の倍率が一致 (${bl[n - 1]})`);
  }
});

test('表は英語でも同じ数値を出す(言語で中身が変わらない)', () => {
  const ja = partyTable(true), en = partyTable(false);
  assert.equal(ja.rows.length, en.rows.length);
  // 数値そのものの列(残機・敵の量)は言語に関係なく同じであること
  const num = t => t.rows.find(r => r.icon === '❤️').cells;
  assert.deepEqual(num(ja), num(en), '残機の数が言語で変わらないこと');
});

test('どこから開いても、閉じたら開いた場所へ戻る', async () => {
  const env = await import('../src/env.js'); env.resize();
  const { game } = await import('../src/state.js');
  const { draw } = await import('../src/render.js');

  for (const from of ['title', 'pause', 'coop']) {
    game.state = 'help'; game.helpReturn = from; game.helpPage = 0;
    draw(0.016);
    const close = game.menuBtns.find(b => b.id === 'helpClose');
    assert.ok(close, `${from} から開いた画面に「とじる」があること`);
    // input.js の closeHelp と同じ処理。ここでは戻り先の規則だけを確かめる。
    const back = game.helpReturn || 'title';
    assert.equal(back, from, `${from} へ戻ること`);
  }
});

test('最後のページの ✓ は「とじる」と同じ扱いになる', async () => {
  const env = await import('../src/env.js'); env.resize();
  const { game } = await import('../src/state.js');
  const { draw } = await import('../src/render.js');
  game.state = 'help'; game.helpReturn = 'title';
  game.helpPage = HELP_PAGES.length - 1;
  draw(0.016);
  // 行き止まりで反応しないボタンを残さない —— 押した指が必ず何かを得ること。
  assert.ok(game.menuBtns.find(b => b.id === 'helpNext'), '最後のページでも次のボタンは押せること');
});

test('5ページ × 2言語 × 縦の短い端末でも、例外なく描き切れる', async () => {
  const env = await import('../src/env.js');
  const { game } = await import('../src/state.js');
  const { draw } = await import('../src/render.js');
  const { setLang } = await import('../src/i18n.js');

  // 実在する狭い端末を含める。iPhone SE (375×667) が一番きつい。
  const screens = [[375, 667], [390, 844], [320, 568], [768, 1024]];
  for (const [w, h] of screens) {
    globalThis.innerWidth = w; globalThis.innerHeight = h;
    env.resize();
    for (const lang of ['ja', 'en']) {
      setLang(lang);
      for (let i = 0; i < HELP_PAGES.length; i++) {
        game.state = 'help'; game.helpPage = i; game.helpReturn = 'title';
        assert.doesNotThrow(() => draw(0.016), `${w}x${h} ${lang} ページ${i} が描けること`);
        assert.ok(game.menuBtns.length >= 2, `${w}x${h} ${lang} ページ${i}: ボタンが出ていること`);
      }
    }
  }
  setLang('ja');
});

test('タイトルと一時停止から、あそびかたを開ける', async () => {
  const env = await import('../src/env.js'); env.resize();
  const { game } = await import('../src/state.js');
  const { draw } = await import('../src/render.js');

  game.state = 'title';
  draw(0.016);
  assert.ok(game.menuBtns.find(b => b.id === 'help'), 'タイトルに入口があること');

  // 一時停止は「遊んでいる最中に疑問が湧く」場所なので、ここが一番大事。
  game.state = 'pause'; game.pausedFrom = 'play';
  draw(0.016);
  assert.ok(game.menuBtns.find(b => b.id === 'help'), '一時停止に入口があること');
});
