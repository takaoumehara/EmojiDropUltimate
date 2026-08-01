// ============================================================
// test/layout.test.js — 遊ぶ板の大きさと UI の倍率
//
// なぜ要るのか:
//   横に広い画面で窓いっぱいを盤面にすると、機体は盤面の 2%(電話では 10%)
//   まで縮み、敵は届かない距離に湧く —— 見た目だけでなく遊びが変わる。
//   そこで盤面を縦長の板に固定した。この計算が壊れると、
//   **電話の見た目が黙って変わる**ので、そこを釘で止めておく。
//
//   もうひとつは UI の倍率。読みやすさのための底上げ(最低 1.05)は
//   「幅が狭い端末」のためのもので、縦が短い横持ちにまで効かせると
//   行が重なって逆に読めなくなっていた(852x393 で実測)。
//   底上げが縦の短さで緩むこと、かつ **電話の縦持ちでは一切変わらないこと**
//   の両方をここで守る。
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './bootstrap.js';

const env = await import('../src/env.js');
const { stageSize, uiScale, STAGE_MAX_W, STAGE_MIN_ASPECT } = env;

// 直したい相手(古い式)。これと一致することが「電話は変わっていない」の意味。
const oldUi = (w, h) => Math.max(1.05, Math.min(w / 380, h / 680, 1.6));

const PHONES = [
  ['小さい Android', 360, 640],
  ['iPhone SE + Chrome バー', 375, 553],
  ['iPhone 15 Pro + Chrome バー', 393, 665],
  ['iPhone 15 Pro 全面', 393, 852],
  ['iPhone Pro Max', 430, 932],
  ['bootstrap の既定', 390, 844],
];

test('電話の縦持ちでは、板が窓とぴったり同じ', () => {
  for (const [name, w, h] of PHONES) {
    const s = stageSize(w, h);
    assert.equal(s.w, w, `${name} の幅が変わった`);
    assert.equal(s.h, h, `${name} の高さが変わった`);
  }
});

test('電話の縦持ちでは、UI の倍率が以前と1ミリも変わらない', () => {
  for (const [name, w, h] of PHONES) {
    assert.equal(uiScale(w, h), oldUi(w, h), `${name} の UI 倍率が変わった`);
  }
});

test('横に広い画面では、板の幅が上限で頭打ちになる', () => {
  for (const [w, h] of [[1440, 900], [1920, 1080], [2560, 1080], [1024, 768]]) {
    const s = stageSize(w, h);
    assert.equal(s.w, STAGE_MAX_W, `${w}x${h} の板が広すぎる`);
    assert.ok(s.w < w, `${w}x${h} で letterbox になっていない`);
  }
});

test('縦に長い画面では、板が糸のように細長くならない', () => {
  const s = stageSize(560, 4000);
  assert.equal(s.h, STAGE_MAX_W / STAGE_MIN_ASPECT);
  assert.ok(s.w / s.h >= STAGE_MIN_ASPECT - 1e-9, '板が細長すぎる');
});

test('板は窓より大きくならない', () => {
  for (const [w, h] of [[320, 480], [360, 640], [1920, 1080], [2560, 1440], [100, 100]]) {
    const s = stageSize(w, h);
    assert.ok(s.w <= w && s.h <= h, `${w}x${h} で板が窓からはみ出した`);
  }
});

test('縦が短い横持ちでは、読みやすさの底上げが緩む', () => {
  // 852x393 の板は 560x393。ここで 1.05 に底上げすると、ボタンの2行が
  // 重なって読めなくなる —— それが実際に起きていた不具合。
  const box = stageSize(852, 393);
  const ui = uiScale(box.w, box.h);
  assert.ok(ui < 1.05, `横持ちで底上げが効いたまま (UI=${ui})`);
  assert.ok(ui > Math.min(box.w / 380, box.h / 680), '素の値より小さくしすぎ');
  assert.ok(ui > 0.6, `縮めすぎて読めない (UI=${ui})`);
});

test('底上げが緩むのは、縦が短いときだけ', () => {
  // 546px 以上あれば従来どおり。iPhone SE(553)がぎりぎりこちら側に入る。
  for (const h of [546, 553, 600, 640, 680, 852, 1080]) {
    assert.equal(uiScale(393, h), oldUi(393, h), `高さ ${h} で従来と違う値になった`);
  }
});

test('UI の倍率は高さに対して単調 —— 縦が伸びて小さくなることはない', () => {
  let prev = 0;
  for (let h = 200; h <= 1200; h += 10) {
    const ui = uiScale(560, h);
    assert.ok(ui >= prev - 1e-9, `高さ ${h} で倍率が下がった`);
    prev = ui;
  }
});

test('resize すると板が窓の中央に置かれ、指の座標がそこへ直る', () => {
  const de = globalThis.document.documentElement;
  const save = { w: de.clientWidth, h: de.clientHeight };
  try {
    de.clientWidth = 1920; de.clientHeight = 1080;
    env.resize();
    assert.equal(env.W, STAGE_MAX_W);
    assert.equal(env.H, 1080);
    assert.equal(env.VIEW.x, (1920 - STAGE_MAX_W) / 2);
    assert.equal(env.VIEW.y, 0);
    assert.equal(env.VIEW.boxed, true);
    // 窓の中央を押したら、板の中央になる
    assert.equal(env.toStageX(960), STAGE_MAX_W / 2);
    assert.equal(env.toStageY(540), 540);
    // 板の左上の角
    assert.equal(env.toStageX(env.VIEW.x), 0);

    de.clientWidth = 393; de.clientHeight = 665;
    env.resize();
    assert.equal(env.VIEW.boxed, false, '電話で letterbox になってはいけない');
    assert.equal(env.toStageX(200), 200, '電話では座標を直す必要がない');
  } finally {
    de.clientWidth = save.w; de.clientHeight = save.h;
    env.resize();
  }
});
