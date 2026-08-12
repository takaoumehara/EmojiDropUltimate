// ============================================================
// wrap.test.js — 文章の折り返し
//
// ここは全画面が通る道なので、壊れると被害が広い。しかも壊れ方が
// **静か**なのが厄介 —— 例外は出ず、文字が少し消えるだけ。
// 実機で描いて目で見るまで誰も気づかない(実際そうなった)。
//
// 実際に起きた事故を、そのままテストにしてある:
//   1. 日本語の文に半角スペースが1つ混じると、文全体が1単語扱いになり、
//      はみ出したぶんが黙って消えた
//   2. それを直したら、今度は英語の1文字単語("a")の前の空白が落ちて
//      「carries a cost」が「carriesa cost」になった
//   3. 行頭に読点が落ちて「代わりに / 、ひとりでは」になった
// ============================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './bootstrap.js';
import { wrapLines } from '../src/theme.js';

// 偽キャンバスは幅を必ず0で返すので、ここだけ「1文字=10」で測るようにする。
//   幅が常に0だと折り返しが一度も起きず、何を書いても通ってしまう。
import { ctx } from '../src/env.js';
const CH = 10;
ctx.measureText = s => ({ width: [...String(s)].length * CH });

test('日本語の文に半角スペースが混じっても、どの行も幅に収まる', () => {
  // これが本当の不変条件。「文字が消えていない」だけでは足りない ——
  //   返ってきた行が幅を超えていると、描く側で黙って画面外へはみ出す。
  //   実際に消えて見えたのはそれで、返り値そのものは揃っていた。
  const src = '前に出た人は撃てない。かわりに盾を引きつける。撃てるのは一番遠い ひとりだけ。';
  const w = CH * 12;
  const lines = wrapLines(src, w, { maxLines: 8 });
  for (const ln of lines) {
    assert.ok([...ln].length * CH <= w, `幅に収まること: ${JSON.stringify(ln)}`);
  }
  assert.equal(lines.join('').replace(/\s/g, ''), src.replace(/\s/g, ''), '1文字も落ちていないこと');
});

test('英語の1文字単語の前の空白が落ちない', () => {
  const src = 'Every strong quirk carries a cost and I know it';
  const lines = wrapLines(src, CH * 14, { maxLines: 8 });
  const got = lines.join(' ');
  assert.match(got, /carries a cost/, '“carriesa” にならないこと');
  assert.match(got, /and I know/, '“andI” にならないこと');
});

test('英語は単語の途中で割らない(入る限りは)', () => {
  const lines = wrapLines('alpha beta gamma delta', CH * 11, { maxLines: 8 });
  for (const ln of lines) assert.ok(!/^\w{1,2}$/.test(ln.trim()) || ln.trim().length > 2 || ln.trim() === 'a',
    `単語が千切れていないこと: ${JSON.stringify(lines)}`);
  assert.equal(lines.join(' '), 'alpha beta gamma delta');
});

test('1単語が幅より長ければ、文字単位で割る(はみ出させない)', () => {
  const lines = wrapLines('short PneumonoultramicroscopicSilicovolcanoconiosis end', CH * 10, { maxLines: 8 });
  for (const ln of lines) {
    assert.ok([...ln].length <= 10, `どの行も幅に収まること: ${JSON.stringify(ln)}`);
  }
  assert.match(lines.join(''), /Pneumono/, '長い単語も消えずに残ること');
});

test('行の頭に読点や閉じ括弧を置かない', () => {
  const src = '人数が増えると、簡単にはならない。難しくなる代わりに、ひとりでは取れない強さが取れる。';
  for (const w of [8, 10, 12, 14, 16, 20]) {
    const lines = wrapLines(src, CH * w, { maxLines: 12 });
    for (const ln of lines) {
      assert.ok(!/^[、。」』）]/.test(ln), `幅${w}: 行頭に句読点が来ないこと ${JSON.stringify(lines)}`);
    }
  }
});

test('maxLines を超えない', () => {
  const src = 'あ'.repeat(200);
  assert.equal(wrapLines(src, CH * 10, { maxLines: 3 }).length, 3);
});

test('空文字でも落ちない', () => {
  assert.deepEqual(wrapLines('', CH * 10, {}), []);
});
