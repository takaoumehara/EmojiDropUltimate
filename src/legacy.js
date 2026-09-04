// ============================================================
// legacy.js — 旧名のときの保存データを引き継ぐ
//
// なぜ要るのか:
//   ゲームの名前が EMOJI DROP ULTIMATE から EMOJI BLASTERS に変わった。
//   localStorage のキーもそれに合わせて `edu_*` → `eb_*` にしたが、
//   **すでに遊んでいる人の端末には `edu_*` しか入っていない**。
//   そのまま新しいキーだけを見ると、章の進行・ハイスコア・連続日数・
//   選んだキャラが、名前を変えただけで全部消える。
//
//   遊んだ時間を製品側の都合で捨ててはいけない。ここで引き継ぐ。
//
// 安全側に倒してある:
//   - **新しいキーが既にあるときは何もしない**(上書きしない)
//   - **古いキーは消さない**(引き継ぎに失敗しても元が残る)
//   - localStorage が例外を投げる環境(Safari プライベート等)では黙って諦める
//   つまり最悪でも「引き継がれない」だけで、壊れることはない。
//
// なぜモジュールなのか:
//   保存を読むモジュール(save / state / audio / i18n / weather / diag)は
//   **読み込まれた瞬間に読む**ものがある。ES モジュールは依存を先に実行するので、
//   それらの先頭で `import './legacy.js'` しておけば、必ず引き継ぎが先に走る。
//   index.html の inline script より確実で、テストからも触れる。
// ============================================================

/** 旧キー → 新キー。増やしたらここだけ直せばよい。 */
export const LEGACY_KEYS = {
  edu_save: 'eb_save',
  edu_hiscore: 'eb_hiscore',
  edu_mute: 'eb_mute',
  edu_lang: 'eb_lang',
  edu_city: 'eb_city',
  edu_diag: 'eb_diag',
  edu_pwa_dismissed: 'eb_pwa_dismissed',
};

/**
 * 引き継ぎを一度だけ行う。
 * @param {Storage} [store] テスト用。省略すると localStorage。
 * @returns {string[]} 実際に引き継いだ新キーの一覧
 */
export function migrateLegacyKeys(store) {
  const moved = [];
  let s = store;
  if (!s) {
    try { s = localStorage; } catch (e) { return moved; }
  }
  if (!s) return moved;

  for (const [old, next] of Object.entries(LEGACY_KEYS)) {
    try {
      if (s.getItem(next) !== null) continue;   // 新しい方が既にある → 触らない
      const v = s.getItem(old);
      if (v === null) continue;                 // 引き継ぐものが無い
      s.setItem(next, v);
      moved.push(next);
    } catch (e) {
      // 1つ失敗しても残りは試す。保存が使えない端末では全部ここに来る。
    }
  }
  return moved;
}

// 読み込まれた時点で一度だけ走る。
migrateLegacyKeys();
