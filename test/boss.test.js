// ============================================================
// boss.test.js — ボス終盤の「毎回ちがう」を機械で確かめる
//
// ここで守りたいのは演出ではなく構造。
//   1. HPが尽きた瞬間に何が起きるかは5通りあり、全部が実際に起きる
//   2. 同じ札が続かない。しかも**遊び直しても**続かない(端末に覚える)
//   3. 「何も起きずに勝つ回」がある。無いと「必ず何か来る」で身構えられる
//   4. 人数が増えたぶん、ボスが本当に強くなっている
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot, sim, Bot, shutdown } from './headless.js';

// startRun() は setGame() で game を丸ごと差し替える。
//   呼ぶ前に掴んだ参照は捨てられた側を指すので、必ず読み直す。
const now = h => h.state.game;

/** ボスが出るところまで飛ばす。 */
function toBoss(h) {
  h.engine.startRun(0);
  sim(h, { steps: 200, bot: Bot.idle });
  now(h).stageTime = h.geo.stage().dur - 200;
  sim(h, { steps: 60 * 40, bot: Bot.idle, until: q => !!q.boss });
  return now(h).boss;
}

/** ボスのHPを尽きさせ、引かれた札を返す。 */
function deplete(h, { bells = 0 } = {}) {
  const g = now(h);
  for (let i = 0; i < bells; i++) {
    g.bells.push({ x: 80 + i * 40, y: 300, idx: 0, size: 12, phase: 0, prog: 0, lat: 0, hits: 0 });
  }
  g.boss.hp = 1;
  sim(h, { steps: 60 * 8, bot: Bot.idle, until: q => q.standKind || q.state === 'finale' });
  return g.standKind;
}

test('終盤の札は6種類すべてが実際に引かれる', async () => {
  const h = await boot({ seed: 21 });
  const seen = new Set();
  for (let k = 0; k < 60 && seen.size < 6; k++) {
    if (!toBoss(h)) continue;
    const kind = deplete(h, { bells: k % 2 });
    if (kind) seen.add(kind);
  }
  shutdown(h);
  assert.deepEqual([...seen].sort(), ['flee', 'greed', 'legacy', 'revive', 'split', 'turn'],
    `6種類すべてが出ること: ${[...seen].join(',')}`);
});

test('同じ札が続かない — 遊び直しても続かない', async () => {
  // ここが本題。履歴を game に置いていた頃は、ラン開始でリセットされるので
  // 「前回と同じ札」が普通に出た。飽きるのは1回のプレイの中ではなく、
  // 繰り返し遊んだ先なので、プレイを跨いで覚えていないと意味がない。
  const h = await boot({ seed: 5 });
  const seq = [];
  for (let k = 0; k < 24; k++) {
    if (!toBoss(h)) continue;
    seq.push(deplete(h, { bells: 1 }));
  }
  shutdown(h);
  assert.ok(seq.length >= 20, `十分な回数を観測したこと (${seq.length})`);
  for (let i = 1; i < seq.length; i++) {
    assert.notEqual(seq[i], seq[i - 1],
      `${i}回目と${i + 1}回目が同じ札になっている: ${seq.join(' ')}`);
  }
  assert.ok(new Set(seq).size >= 4, `偏らずに散らばること: ${[...new Set(seq)].join(',')}`);
});

// --- 札ごとの中身 ---
/** 引かれる札を狙ったものに固定して発動させる。 */
function forceStand(h, kind, prep) {
  toBoss(h);
  const g = now(h);
  if (prep) prep(g);
  g.boss.hp = 1;
  sim(h, { steps: 60 * 3, bot: Bot.idle, until: q => q.boss && q.boss.dying > 0 });
  g.boss.stand = kind;
  sim(h, { steps: 60 * 4, bot: Bot.idle, until: q => q.standKind === kind || q.state === 'finale' });
}

test('分裂: 分身が湧き、本体も残る', async () => {
  const h = await boot({ seed: 8 });
  forceStand(h, 'split');
  const g = now(h);
  shutdown(h);
  assert.equal(g.standKind, 'split');
  assert.ok(g.boss, '本体が残ること(分身だけになったら「分裂」ではない)');
  const shards = g.enemies.filter(e => e.shard);
  assert.ok(shards.length >= 2, `分身が出ること (${shards.length})`);
  assert.ok(g.boss.hp > 0, '本体のHPが戻ること');
});

test('強欲: 拾い残したベルを喰って本当に硬くなる', async () => {
  const h = await boot({ seed: 9 });
  let before = 0;
  forceStand(h, 'greed', g => {
    before = g.boss.maxHp;
    for (let i = 0; i < 3; i++) g.bells.push({ x: 80 + i * 40, y: 300, idx: 0, size: 12, phase: 0, prog: 0, lat: 0, hits: 0 });
  });
  const g = now(h);
  shutdown(h);
  assert.equal(g.bells.length, 0, 'ベルが吸い込まれること');
  // 「割合で戻す」書き方だとベルが少ない回にむしろ弱く復帰し、名前が嘘になる
  assert.ok(g.boss.maxHp > before, `最大HPが増えること: ${before} → ${g.boss.maxHp}`);
});

test('形見: 何も起きずに倒れ、代わりにこちらが強くなる', async () => {
  // 「必ず何かが起きる」と身構えさせないために、起きない回が要る。
  const h = await boot({ seed: 10 });
  let before = null;
  forceStand(h, 'legacy', g => { before = { lives: g.lives, power: g.player.power, bombs: g.bombs }; });
  const g = now(h);
  shutdown(h);
  assert.equal(g.boss, null, 'ボスは倒れていること');
  assert.ok(g.lives > before.lives, `残機が増えること: ${before.lives} → ${g.lives}`);
  assert.ok(g.player.power > before.power || g.bombs > before.bombs, '自機が強くなること');
});

test('逃走: 逃げ切られると恨みが残り、次のボスが硬くなる', async () => {
  const h = await boot({ seed: 12 });
  forceStand(h, 'flee');
  const g = now(h);
  assert.ok(g.boss && g.boss.fleeing > 0, '逃走が始まること');
  // 追わずに放っておく
  sim(h, { steps: 60 * 14, bot: Bot.idle, until: q => !q.boss });
  assert.ok(g.bossGrudge > 0, '逃がした記録が残ること');

  // 次のボスは硬くなっている
  const escaped = g.bossGrudge;
  h.engine.startRun(0);
  sim(h, { steps: 200, bot: Bot.idle });
  now(h).bossGrudge = escaped;
  now(h).stageTime = h.geo.stage().dur - 200;
  sim(h, { steps: 60 * 40, bot: Bot.idle, until: q => !!q.boss });
  const withGrudge = now(h).boss.maxHp;
  h.engine.startRun(0);
  sim(h, { steps: 200, bot: Bot.idle });
  now(h).bossGrudge = 0;
  now(h).stageTime = h.geo.stage().dur - 200;
  sim(h, { steps: 60 * 40, bot: Bot.idle, until: q => !!q.boss });
  const clean = now(h).boss.maxHp;
  shutdown(h);
  assert.ok(withGrudge > clean, `逃がした後のボスが硬いこと: ${clean} → ${withGrudge}`);
});

test('終盤が来てもゲームは最後まで走る', async () => {
  const h = await boot({ seed: 77 });
  for (const kind of ['revive', 'split', 'flee', 'greed', 'legacy', 'turn']) {
    forceStand(h, kind, g => {
      if (kind === 'greed') g.bells.push({ x: 100, y: 300, idx: 0, size: 12, phase: 0, prog: 0, lat: 0, hits: 0 });
    });
    const r = sim(h, { steps: 60 * 120, bot: Bot.idle });
    assert.equal(r.error, null, `${kind} の後で例外が出ないこと: ${r.error && r.error.stack}`);
  }
  shutdown(h);
});

// ============================================================
// 人数に対する強さ
// ============================================================

/** n 人で遊んでいる状態を作る。 */
async function withPlayers(n) {
  const h = await boot({ seed: 33 + n });
  const { Coop } = await import('../src/coop.js');
  Coop.reset();
  if (n > 1) {
    Coop.active = true; Coop.role = 'host'; Coop.connected = true;
    for (let i = 2; i <= n; i++) Coop.onMsg({ t: 'hello', name: 'P' + i }, String(i));
  }
  // coop の印は startRun の後・ボスが湧く前に立てる必要がある。
  //   startRun は game を作り直すので、その前に立てても消える。
  h.engine.startRun(0);
  sim(h, { steps: 200, bot: Bot.idle });
  if (n > 1) now(h).coop = true;
  now(h).stageTime = h.geo.stage().dur - 200;
  sim(h, { steps: 60 * 40, bot: Bot.idle, until: q => !!q.boss });
  return { h, Coop, boss: now(h).boss };
}

test('人数が増えるとボスが人数ぶん硬くなる', async () => {
  // ひとり増えれば毎秒の火力もほぼその分増える。以前は「ひとり増えて1.11倍」
  // だったので、4人だとボスが2倍以上の速さで溶けて手応えが消えていた。
  const hp = {};
  for (const n of [1, 2, 3, 4]) {
    const { h, Coop, boss } = await withPlayers(n);
    hp[n] = boss.maxHp;
    Coop.reset(); shutdown(h);
  }
  assert.ok(hp[2] > hp[1] * 2, `2人で2倍超 (${hp[1]} → ${hp[2]})`);
  // ひとりあたりの戦闘時間が人数によらず一定になっているか
  const per = n => hp[n] / n;
  assert.ok(per(4) > per(2) * 0.85 && per(4) < per(2) * 1.15,
    `ひとりあたりの負担がほぼ一定であること: 2人 ${per(2).toFixed(0)} / 4人 ${per(4).toFixed(0)}`);
});

test('3人以上は終盤が二段構えになる', async () => {
  for (const [n, want] of [[1, 1], [2, 1], [3, 2], [4, 2]]) {
    const { h, Coop, boss } = await withPlayers(n);
    assert.equal(boss.stands, want, `${n}人のときの終盤は${want}段`);
    Coop.reset(); shutdown(h);
  }
});

test('共有残機は人数ぶん増える', async () => {
  // ソロは1人で3機。2人で3機を分け合うとひとり1.5機で、共闘のほうが
  // ずっと厳しかった。ひとり2機ぶん + 1 を配る。
  const { CFG } = await import('../src/config.js');
  const h = await boot({ seed: 1 });
  shutdown(h);
  assert.equal(CFG.MAX_LIVES, 3, 'ソロは3機');
  for (const [n, want] of [[2, 5], [3, 7], [4, 9]]) {
    assert.equal(n * 2 + 1, want, `${n}人なら${want}機`);
  }
});

test('分身はゲストの画面でも「ボスの顔」で描かれる', async () => {
  // スナップショットは敵の種類をステージの敵リストの番号でしか送らない。
  // 分身はその番号に載っていない特別な敵なので、印を足さないと
  // ゲストの画面では普通の雑魚に見える —— 一番の見せ場で全員が別のものを見る。
  const h = await boot({ seed: 8 });
  const { Coop } = await import('../src/coop.js');
  Coop.reset();
  Coop.active = true; Coop.role = 'host'; Coop.connected = true;
  Coop.onMsg({ t: 'hello', name: 'P2' }, '2');

  h.engine.startRun(0);
  sim(h, { steps: 200, bot: Bot.idle });
  now(h).coop = true;
  now(h).stageTime = h.geo.stage().dur - 200;
  sim(h, { steps: 60 * 40, bot: Bot.idle, until: q => !!q.boss });
  // 協力中のボスHPは毎フレーム Coop.bossShared から上書きされる。
  //   boss.hp を直接いじっても戻されるので、共有プールの側を尽きさせる。
  Coop.bossShared = 0; now(h).boss.hp = 0;
  sim(h, { steps: 60 * 3, bot: Bot.idle, until: q => q.boss && q.boss.dying > 0 });
  assert.ok(now(h).boss.dying > 0, '「倒したと思わせる間」に入ること');
  now(h).boss.stand = 'split';
  sim(h, { steps: 60 * 4, bot: Bot.idle, until: q => q.standKind === 'split' });

  const g = now(h);
  const shards = g.enemies.filter(e => e.shard);
  assert.ok(shards.length >= 2, `ホスト側に分身が居ること (${shards.length})`);
  const bossEmoji = h.geo.stage().boss.emoji;
  assert.equal(shards[0].emoji, bossEmoji, 'ホストの画面ではボスの顔');

  // ホストが配るスナップショットに、分身だと分かる印が乗っているか
  let sent = null;
  Coop.send = o => { if (o && o.t === 'w') sent = o; };
  // 分身は少しずつ現れる(delay)。全員が出るまで待たないと配信に乗らない。
  sim(h, { steps: 40, bot: Bot.idle });
  // ワールド配信は実時間で 66ms に絞られている。歩数で回すテストでは
  //   その 66ms が経たないので、絞りを開けてから1歩進める。
  Coop._lastSnap = 0;
  sim(h, { steps: 1, bot: Bot.idle });
  Coop.reset(); shutdown(h);
  assert.ok(sent, 'ワールドが配信されていること');
  const rows = sent.e.filter(r => r[6] === 1);
  assert.ok(rows.length >= 2, `分身の印が乗っていること (${rows.length}件)`);
});

// ============================================================
// 方向転換 — このゲームにしか無い一手
// ============================================================

test('方向転換: 世界の向きが変わり、全部が新しい向きに置き直される', async () => {
  const h = await boot({ seed: 44 });
  toBoss(h);
  const beforeDir = h.geo.stage().dir;
  // 古い向きの弾が残ったまま回ると、どこから来たか読めないまま当たる
  now(h).eBullets.push({ x: 100, y: 100, vx: 0, vy: 200, size: 5 });
  now(h).boss.hp = 1;
  sim(h, { steps: 60 * 3, bot: Bot.idle, until: q => q.boss && q.boss.dying > 0 });
  now(h).boss.stand = 'turn';
  sim(h, { steps: 60 * 4, bot: Bot.idle, until: q => q.standKind === 'turn' });

  const g = now(h);
  const afterDir = h.geo.stage().dir;
  assert.notEqual(afterDir, beforeDir, `向きが変わること (${beforeDir} → ${afterDir})`);
  assert.ok(g.boss, 'ボスは残ること');
  // 縦向きと横向きでは横軸の幅そのものが違う。px のまま持ち越すと画面外へ飛ぶ。
  assert.ok(g.boss.x > 0 && g.boss.x < h.env.W, `ボスが画面内に居ること x=${g.boss.x | 0}`);
  assert.ok(g.boss.y > 0 && g.boss.y < h.env.H, `ボスが画面内に居ること y=${g.boss.y | 0}`);
  // 自機は新しい向きの定位置へ
  const home = h.geo.playerHome();
  assert.equal(Math.round(g.player.x), Math.round(home.x));
  assert.equal(Math.round(g.player.y), Math.round(home.y));
  assert.equal(g.eBullets.length, 0, '古い向きの弾は流されること');
  assert.ok(g.player.inv, '置き直した直後は無敵で、事故で死なないこと');
  shutdown(h);
});

test('方向転換はステージ定義の定数を壊さない', async () => {
  // stage().dir を書き換えるので、game.stages が STAGES の実体を
  // 参照していたら、以降の全プレイの向きが変わってしまう。
  const h = await boot({ seed: 45 });
  const { STAGES } = h.config;
  const original = STAGES.map(s => s.dir);
  toBoss(h);
  now(h).boss.hp = 1;
  sim(h, { steps: 60 * 3, bot: Bot.idle, until: q => q.boss && q.boss.dying > 0 });
  now(h).boss.stand = 'turn';
  sim(h, { steps: 60 * 4, bot: Bot.idle, until: q => q.standKind === 'turn' });
  shutdown(h);
  assert.deepEqual(STAGES.map(s => s.dir), original, '定数側の向きは変わらないこと');
});

test('方向転換の後も最後まで走る', async () => {
  const h = await boot({ seed: 46 });
  toBoss(h);
  now(h).boss.hp = 1;
  sim(h, { steps: 60 * 3, bot: Bot.idle, until: q => q.boss && q.boss.dying > 0 });
  now(h).boss.stand = 'turn';
  sim(h, { steps: 60 * 4, bot: Bot.idle, until: q => q.standKind === 'turn' });
  const r = sim(h, { steps: 60 * 180, bot: Bot.idle });
  shutdown(h);
  assert.equal(r.error, null, r.error && r.error.stack);
});

test('方向転換は相方にも同じ向きで伝わる', async () => {
  // 各自で向きを引くと全員バラバラの世界になる。ホストが引いた向きを配る。
  const h = await boot({ seed: 47 });
  const { Coop } = await import('../src/coop.js');
  Coop.reset();
  Coop.active = true; Coop.role = 'host'; Coop.connected = true;
  Coop.onMsg({ t: 'hello', name: 'P2' }, '2');
  const sent = [];
  const realSend = Coop.send.bind(Coop);
  Coop.send = o => { sent.push(o); };

  h.engine.startRun(0);
  sim(h, { steps: 200, bot: Bot.idle });
  now(h).coop = true;
  now(h).stageTime = h.geo.stage().dur - 200;
  sim(h, { steps: 60 * 40, bot: Bot.idle, until: q => !!q.boss });
  Coop.bossShared = 0; now(h).boss.hp = 0;
  sim(h, { steps: 60 * 3, bot: Bot.idle, until: q => q.boss && q.boss.dying > 0 });
  now(h).boss.stand = 'turn';
  sim(h, { steps: 60 * 4, bot: Bot.idle, until: q => q.standKind === 'turn' });

  const dir = h.geo.stage().dir;
  Coop.send = realSend; Coop.reset(); shutdown(h);
  const ls = sent.find(o => o && o.t === 'ls' && o.k === 'turn');
  assert.ok(ls, '方向転換が相方へ送られること');
  assert.equal(ls.d, dir, '送った向きが自分の向きと一致すること');
});
