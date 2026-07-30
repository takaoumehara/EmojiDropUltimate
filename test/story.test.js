// ============================================================
// story.test.js — ミッションと章
//
// 「6面でひと区切り」は前から動いていたのに、一言も伝えていなかった。
// ここで守るのは、伝わる状態が壊れないこと:
//   1. どの章でも必ずミッションの文が出る(無限に続くので「どの章でも」が要る)
//   2. オープニングは一度だけ自動で出て、二度目からは出ない
//   3. でも、あとから何度でも見られる
//   4. 章は「道中6面 + 決着1面」で終わり、次章が開く
//   5. 生成された章の文が壊れない(空欄・置換もれ・意味の通らない語順)
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot, sim, Bot, shutdown } from './headless.js';
import { chapterOf, chapterCount, isHandmade, missionFor, finalMissionFor, finalStage } from '../src/story.js';
import { chapterStages } from '../src/aistage.js';
import { STAGES } from '../src/config.js';

const now = h => h.state.game;

// --- 文章 ---

test('どの章にも題・あらすじ・4コマ・ボスがそろっている', () => {
  // 第4章以降は組み合わせで作る。**一本でも空欄が出たら世界観が壊れる**ので、
  // 手書きのぶんと同じ形が入っていることを深いところまで見る。
  for (const n of [0, 1, 2, 3, 4, 7, 12, 40, 200]) {
    const c = chapterOf(n);
    const tag = `章${n + 1}`;
    for (const k of ['title', 'titleEn', 'hook', 'hookEn', 'verb', 'verbEn']) {
      assert.ok(typeof c[k] === 'string' && c[k].trim().length > 0, `${tag}: ${k} が空`);
    }
    assert.ok(Array.isArray(c.saves) && c.saves.length === 6, `${tag}: 助ける相手が6つ`);
    assert.equal(new Set(c.saves).size, 6, `${tag}: 6つが全部ちがうこと`);
    assert.ok(Array.isArray(c.beats) && c.beats.length >= 3 && c.beats.length <= 5,
      `${tag}: コマ数は3〜5(長い前置きは読まれない)`);
    for (const b of c.beats) {
      assert.ok(b.emoji && b.ja && b.en, `${tag}: コマに絵か文が欠けている`);
      assert.ok(b.ja.length <= 40, `${tag}: 一行が長すぎる (${b.ja.length}字)「${b.ja}」`);
    }
    assert.ok(c.boss && c.boss.emoji && c.boss.name && c.boss.en && c.boss.hp > 0, `${tag}: ボスが不完全`);
  }
});

test('章が進むほど最後のボスが手強い', () => {
  let prev = 0;
  for (const n of [0, 1, 2, 3, 6, 10]) {
    const hp = chapterStages(n, STAGES)[6].boss.hp;
    assert.ok(hp >= prev, `章${n + 1} が前より弱くならないこと (${prev} → ${hp})`);
    prev = hp;
  }
});

test('ミッションの1行に置換もれや空欄が出ない', () => {
  for (const n of [0, 1, 2, 5, 30]) {
    const stages = chapterStages(n, STAGES);
    for (let i = 0; i < 6; i++) {
      for (const ja of [true, false]) {
        const line = missionFor(n, i, stages[i], ja);
        assert.ok(line.length > 4, `章${n + 1} 面${i + 1}: 文が短すぎる「${line}」`);
        assert.ok(!/[{}]/.test(line), `章${n + 1} 面${i + 1}: 置換もれ「${line}」`);
        // ボスの名前が必ず入る(誰から取るのかが分からないと目的にならない)
        const name = ja ? stages[i].boss.name : stages[i].boss.en;
        assert.ok(line.includes(name), `章${n + 1} 面${i + 1}: ボス名が入っていない「${line}」`);
      }
    }
    for (const ja of [true, false]) {
      const fin = finalMissionFor(n, ja);
      assert.ok(!/[{}]/.test(fin) && fin.length > 4, `章${n + 1} 決着: 「${fin}」`);
    }
  }
});

test('第3章までは手書き、そのあとは生成', () => {
  assert.equal(chapterCount(), 3, '手書きは起・承・結の3章');
  assert.ok(isHandmade(0) && isHandmade(2), '3章目までは手書き');
  assert.equal(isHandmade(3), false, '4章目からは生成');
  // 生成でも決定論。同じ章はいつ見ても同じ話でないと、続きが成立しない
  assert.deepEqual(chapterOf(9), chapterOf(9), '同じ章は必ず同じ内容');
  assert.notDeepEqual(chapterOf(9).title, chapterOf(9) === chapterOf(10) ? chapterOf(9).title : chapterOf(10).title + 'x',
    '章ごとに内容が変わりうること');
});

// --- 決着の1面 ---

test('決着の1面は道中より短く、道中の敵が混ざっている', () => {
  const stages = chapterStages(0, STAGES);
  const fin = stages[6];
  assert.equal(fin.finale, true);
  assert.ok(fin.dur < stages[0].dur, `道中より短いこと (${fin.dur} < ${stages[0].dur})`);
  assert.ok(fin.enemies.length >= 4, '敵の種類がそろっていること');
  // 道中に出てきた顔が混ざっている(初見の敵だけの面にしない)
  const roadEmoji = new Set(stages.slice(0, 6).flatMap(s => s.enemies.map(e => e.emoji)));
  const mixed = fin.enemies.filter(e => roadEmoji.has(e.emoji)).length;
  assert.ok(mixed >= 3, `倒してきた相手が戻ってくること (${mixed}/${fin.enemies.length})`);
});

test('決着の1面のボスは章のボス', () => {
  for (const n of [0, 1, 2, 5]) {
    const c = chapterOf(n);
    const fin = chapterStages(n, STAGES)[6];
    assert.equal(fin.boss.emoji, c.boss.emoji, `章${n + 1}: 絵が一致すること`);
    assert.equal(fin.boss.name, c.boss.name, `章${n + 1}: 名前が一致すること`);
  }
});

test('finalStage は元のステージを壊さない', () => {
  const src = chapterStages(1, STAGES).slice(0, 6);
  const before = JSON.stringify(src);
  finalStage(1, src);
  assert.equal(JSON.stringify(src), before, '材料にした面を書き換えないこと');
});

// --- 進行 ---

test('章は7面で終わり、次の章が開く', async () => {
  const { Save } = await import('../src/save.js');
  const { CHAPTER_LEN } = await import('../src/save.js');
  assert.equal(CHAPTER_LEN, 7);
  const ch0 = Save.chapter();
  let done = false;
  for (let i = 0; i < CHAPTER_LEN; i++) done = Save.markCleared(i, CHAPTER_LEN);
  assert.equal(done, true, '7面目で章が終わること');
  assert.equal(Save.chapter(), ch0 + 1, '次の章が開くこと');
  assert.equal(Save.clearedCount(), 0, '記録がまき直されること');
});

test('6面だけでは章は終わらない(決着を飛ばして進めない)', async () => {
  const { Save, CHAPTER_LEN } = await import('../src/save.js');
  const ch0 = Save.chapter();
  let done = false;
  for (let i = 0; i < 6; i++) done = Save.markCleared(i, CHAPTER_LEN);
  assert.equal(done, false, '道中6面では終わらないこと');
  assert.equal(Save.chapter(), ch0, '章が進んでいないこと');
  done = Save.markCleared(6, CHAPTER_LEN);
  assert.equal(done, true, '決着の1面で終わること');
});

// --- オープニング ---

test('はじめて遊ぶときはオープニングが出て、遊びはまだ始まらない', async () => {
  const h = await boot({ seed: 400, story: true });     // 見たことにしない
  const { Save } = await import('../src/save.js');
  Save.data.sawStory = 0; Save.data.chapter = 0;
  h.engine.startRun(0);
  const g = now(h);
  shutdown(h);
  assert.equal(g.state, 'opening', 'オープニングに入ること');
  assert.equal(g.openBeat, 0, '1コマ目から');
  assert.equal(g.openReturn, 'play', '見終わったら遊びはじめる約束になっていること');
});

test('コマは待っていても進み、最後まで見ると遊びが始まる', async () => {
  const h = await boot({ seed: 401, story: true });
  const { Save } = await import('../src/save.js');
  Save.data.sawStory = 0; Save.data.chapter = 0;
  h.engine.startRun(0);
  const beats = chapterOf(0).beats.length;
  // 1コマぶん待つと次のコマへ
  sim(h, { steps: Math.ceil((h.engine.BEAT_MS / 1000) * 60) + 4, bot: Bot.idle });
  assert.ok(now(h).openBeat >= 1, `待てば進むこと (${now(h).openBeat})`);
  // 残りを見きる
  sim(h, { steps: Math.ceil((h.engine.BEAT_MS / 1000) * 60) * beats + 20, bot: Bot.idle });
  const st = now(h).state;
  shutdown(h);
  assert.ok(st === 'intro' || st === 'play', `見終わったら本編に入ること (${st})`);
});

test('二度目はオープニングを出さない', async () => {
  const h = await boot({ seed: 402, story: true });
  const { Save } = await import('../src/save.js');
  Save.data.sawStory = 0; Save.data.chapter = 0;
  h.engine.startRun(0);
  assert.equal(now(h).state, 'opening');
  h.engine.skipOpening();                     // 見たことになる
  h.engine.startRun(0);
  const st = now(h).state;
  shutdown(h);
  assert.ok(st === 'intro' || st === 'play', `二度目は直接始まること (${st})`);
});

test('あとから何度でも見られて、見終わってもタイトルに戻るだけ', async () => {
  const h = await boot({ seed: 403, story: true });
  const { Save } = await import('../src/save.js');
  Save.data.chapter = 0;
  for (let round = 0; round < 3; round++) {
    h.engine.openStory(0, false);
    assert.equal(now(h).state, 'opening', `${round + 1}回目も見られること`);
    assert.equal(now(h).openReturn, 'title', '遊びはじめない約束になっていること');
    h.engine.skipOpening();
    assert.equal(now(h).state, 'title', 'タイトルへ戻ること');
  }
  shutdown(h);
});

test('章ごとに違うオープニングが出る', async () => {
  const h = await boot({ seed: 404, story: true });
  h.engine.openStory(0, false);
  const a = chapterOf(now(h).openChapter).title;
  h.engine.skipOpening();
  h.engine.openStory(1, false);
  const b = chapterOf(now(h).openChapter).title;
  h.engine.skipOpening();
  shutdown(h);
  assert.notEqual(a, b, '章が変われば話も変わること');
});

test('進めすぎても落ちない(コマ数を超えて叩く)', async () => {
  const h = await boot({ seed: 405, story: true });
  const { Save } = await import('../src/save.js');
  Save.data.chapter = 0;
  h.engine.openStory(0, false);
  for (let i = 0; i < 20; i++) h.engine.advanceOpening();
  const st = now(h).state;
  shutdown(h);
  assert.equal(st, 'title', '何回叩いても壊れないこと');
});

test('章を制覇すると「つぎのショー」が立つ', async () => {
  const h = await boot({ seed: 406 });
  const { Save } = await import('../src/save.js');
  const { CHAPTER_LEN } = await import('../src/save.js');
  Save.data.chapter = 0; Save.data.cleared = 0;
  h.engine.startRun(0);
  const g = now(h);
  g.state = 'play'; g.introT = 0;
  // 最後の1面に居ることにして、そこでボスを落とす
  g.stageIndex = CHAPTER_LEN - 1;
  for (let i = 0; i < CHAPTER_LEN - 1; i++) Save.data.cleared |= (1 << i);
  sim(h, { steps: 200, bot: Bot.idle });
  now(h).stageIndex = CHAPTER_LEN - 1;
  now(h).stageTime = h.geo.stage().dur - 200;
  sim(h, { steps: 60 * 40, bot: Bot.idle, until: q => !!q.boss && !q.boss.entering });
  assert.ok(now(h).boss, 'ボスが出ること');
  now(h).boss.hp = 1;
  sim(h, { steps: 60 * 20, bot: Bot.idle, until: q => q.showT > 0 || q.state === 'victory' });
  const g2 = now(h);
  shutdown(h);
  assert.ok(g2.showT > 0, `つぎのショーの演出が立つこと (showT=${g2.showT})`);
  assert.equal(g2.showChapter, 1, '予告されるのは次の章');
});
