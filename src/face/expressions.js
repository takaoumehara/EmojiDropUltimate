// ============================================================
// src/face/expressions.js — どの顔を、どの信号で読むか
//
//   blendshape の名前は face_landmarker.task の中の face_blendshapes.tflite から
//   実際に取り出して確認したもの(52個)。それでも名前を直接前提にはしない。
//   モデルが差し替わった時に静かに無反応になるのが最悪なので、起動時に実在を
//   確かめ、無ければその表情を出題から外す(facesource.js)。
// ============================================================

/**
 * shapes: 平均を取る blendshape 名。複数あるのは左右があるもの。
 * ask:    出題するか。false のものは「裏で誤爆だけ数える」。
 */
export const EXPRESSIONS = [
  {
    key: 'gape',
    emoji: '😮',
    label: '口をあける',
    shapes: ['jawOpen'],
    ask: true,
    // 顔の中でいちばん信号が大きい。眼鏡でも、少し暗くても、離れていても取れる。
    // 最初の一本はこれで正しい。
  },
  {
    key: 'smile',
    emoji: '😊',
    label: 'にっこり',
    shapes: ['mouthSmileLeft', 'mouthSmileRight'],
    ask: true,
  },
  {
    key: 'brow',
    emoji: '😲',
    label: 'まゆを上げる',
    shapes: ['browInnerUp'],
    ask: true,
    // 口と完全に別の部位。「部位が自然に散る」が本当かは、これで分かる。
  },
  {
    key: 'pucker',
    emoji: '😗',
    label: 'くちをすぼめる',
    shapes: ['mouthPucker'],
    ask: false,
    // 出題しない。開口・笑顔と同じ口を使うので誤爆の温床になる。
    // ただし60秒のあいだ、何回勝手に反応したかは数える。
  },
  {
    key: 'blink',
    emoji: '😑',
    label: 'めをとじる',
    shapes: ['eyeBlinkLeft', 'eyeBlinkRight'],
    ask: false,
    // 出題しない。画面を見ていないと成立しないので、連続操作には原理的に向かない。
    // これも数えるだけ。
  },
];

export const ASKABLE = EXPRESSIONS.filter(e => e.ask);
export const ALL_KEYS = EXPRESSIONS.map(e => e.key);
export const BY_KEY = new Map(EXPRESSIONS.map(e => [e.key, e]));

/** そのモデルが必要な blendshape を全部持っているか。 */
export function shapesAvailable(expr, availableNames) {
  return expr.shapes.every(s => availableNames.has(s));
}
