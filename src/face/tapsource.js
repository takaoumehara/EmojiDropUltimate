// ============================================================
// src/face/tapsource.js — 同じゲームを、指で遊ぶための経路
//
//   これは「カメラが使えない人のための劣化版」ではない。
//   実験装置の**基準線**であり、無いと測った数字の意味が確定しない。
//
//   ブラウザの中からは「顔を作った瞬間」を知る手段がカメラしかなく、
//   そのカメラの遅れこそが測りたいもの。自分の遅れを自分では測れない。
//   同じ人が同じ的をタップでも撃てば、差がカメラ由来の遅れになる。
//
//   外部依存はゼロ。オフラインでも動く。
// ============================================================

import { EXPRESSIONS } from './expressions.js';

/**
 * タップ経路のチャンネル設定。
 *
 * ヒステリシスと最小保持は**顔と同じ値**にする(引き算で消えるように)。
 * 平滑化だけ実質切る — 指の入力には取るべき揺れが無く、
 * One Euro の遅れはカメラ側の費用なので、差にちゃんと出るべきだから。
 */
export const TAP_CHANNEL_OPTS = {
  minCutoff: 30,  // 実質そのまま通す
  beta: 0,
};

export class TapSource {
  constructor() {
    this.raws = {};
    this.confidence = 1; // 指は見失わない
    for (const e of EXPRESSIONS) this.raws[e.key] = 0;
    this._held = new Set();
  }

  press(key) {
    if (!(key in this.raws)) return;
    this._held.add(key);
    this.raws[key] = 1;
  }

  release(key) {
    if (!(key in this.raws)) return;
    this._held.delete(key);
    this.raws[key] = 0;
  }

  releaseAll() {
    for (const k of this._held) this.raws[k] = 0;
    this._held.clear();
  }

  isHeld(key) { return this._held.has(key); }

  tick() { return this.raws; }

  stop() { this.releaseAll(); }

  /**
   * ボタンを配線する。pointer で拾うのは、マウスと指と Pencil を1本で扱うため。
   * pointerup を window で拾うのは、ボタンの外で指を離した時に押しっぱなしに
   * ならないようにするため(これを忘れると「勝手に反応し続ける」バグになる)。
   */
  bind(buttons) {
    const onUp = () => this.releaseAll();
    for (const [key, el] of Object.entries(buttons)) {
      if (!el) continue;
      el.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        try { el.setPointerCapture(ev.pointerId); } catch (e) { /* noop */ }
        this.press(key);
      });
      el.addEventListener('pointerup', () => this.release(key));
      el.addEventListener('pointercancel', () => this.release(key));
      el.addEventListener('pointerleave', () => this.release(key));
      // キーボードでも遊べるようにする。1/2/3。
      el.setAttribute('tabindex', '0');
    }
    window.addEventListener('pointerup', onUp);
    window.addEventListener('blur', onUp);

    const keyMap = Object.keys(buttons);
    window.addEventListener('keydown', ev => {
      if (ev.repeat) return;
      const i = ['1', '2', '3', '4', '5'].indexOf(ev.key);
      if (i >= 0 && keyMap[i]) { ev.preventDefault(); this.press(keyMap[i]); }
    });
    window.addEventListener('keyup', ev => {
      const i = ['1', '2', '3', '4', '5'].indexOf(ev.key);
      if (i >= 0 && keyMap[i]) this.release(keyMap[i]);
    });
  }
}
