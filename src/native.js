// ============================================================
// native.js — アプリの殻(Capacitor)が居るときだけ、そこに手を伸ばす
//
// なぜこの形なのか:
//   同じ src/ が **ブラウザでもアプリでも動く**必要がある。
//   `import '@capacitor/haptics'` と書いた瞬間に、このリポジトリは
//   npm とビルド工程を持つことになり、いちばんの性質を失う。
//
//   Capacitor はプラグインを **`window.Capacitor.Plugins` に生やす**ので、
//   実行時に見にいけば import は要らない。殻が居なければ何も起きない。
//   つまり:
//     - ブラウザ    … Capacitor は居ない → navigator.vibrate があれば使う
//     - アプリ      … Capacitor が居る   → 本物の触覚エンジンを使う
//     - どちらも無い… 黙って何もしない
//
//   触覚は Apple のガイドライン 4.2(最低限の機能)に対して
//   「Web を包んだだけではない」と言える数少ない実装のひとつでもある。
//   → docs/native-decision.md
// ============================================================

/** 殻の中に居るか。Capacitor が注入する目印を見る。 */
export function isNative() {
  try {
    return !!(globalThis.Capacitor && globalThis.Capacitor.isNativePlatform
      && globalThis.Capacitor.isNativePlatform());
  } catch (e) { return false; }
}

/** 'ios' | 'android' | 'web' */
export function platform() {
  try {
    return (globalThis.Capacitor && globalThis.Capacitor.getPlatform)
      ? globalThis.Capacitor.getPlatform() : 'web';
  } catch (e) { return 'web'; }
}

function plugin(name) {
  try { return (globalThis.Capacitor && globalThis.Capacitor.Plugins) ? globalThis.Capacitor.Plugins[name] : null; }
  catch (e) { return null; }
}

// 触覚は「出しすぎない」ことのほうが難しい。撃つたびに震えると、
//   手のひらが鈍って**強い場面が強く感じられなくなる**。
//   ここでは節目だけに割り当て、同じ節目の連打も間引く。
const MIN_GAP_MS = 60;
let lastAt = 0;
let enabled = true;

/** 設定から切れるようにしておく(画面のゆれと同じ理由で、苦手な人が居る)。 */
export function setHaptics(on) { enabled = !!on; }
export function hapticsEnabled() { return enabled; }

/**
 * 触覚をひとつ出す。
 * @param {'light'|'medium'|'heavy'} weight
 */
export function tap(weight = 'light') {
  if (!enabled) return false;
  const now = (globalThis.performance && performance.now) ? performance.now() : Date.now();
  if (now - lastAt < MIN_GAP_MS) return false;
  lastAt = now;

  const H = plugin('Haptics');
  if (H && typeof H.impact === 'function') {
    // 本物の触覚エンジン(iOS の Taptic Engine / Android の VibrationEffect)。
    try { H.impact({ style: weight.toUpperCase() }); return true; } catch (e) { /* 下に落ちる */ }
  }
  // ブラウザ。iOS Safari には無いので、実質 Android だけが震える。
  try {
    if (navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(weight === 'heavy' ? 28 : weight === 'medium' ? 16 : 8);
      return true;
    }
  } catch (e) { /* 何も起きなくてよい */ }
  return false;
}

/** 節目ごとの割り当て。呼ぶ側が強さを覚えなくていいように名前で持つ。 */
export const Haptic = {
  bell: () => tap('light'),      // ベルを拾った
  combo: () => tap('light'),     // コンボが上がった
  hit: () => tap('medium'),      // 被弾した
  boss: () => tap('heavy'),      // ボスを倒した
  super: () => tap('heavy'),     // 必殺技が出た
};
