// ============================================================
// src/face/facesource.js — カメラと MediaPipe。生の表情の値を作るところ
//
//   **推論は端末の中だけで完結する。映像はどこにも送らない。**
//   フレームを溜めることも、保存することもしない。子供の顔を扱う以上ここは譲らない。
//
//   このファイルは、許可が下りた後に初めて読み込まれる。
//   タップで遊ぶ人のところには MediaPipe は 1バイトも降ってこない。
// ============================================================

import { EXPRESSIONS, shapesAvailable } from './expressions.js';

// バージョンを固定する。latest にすると、ある朝いきなり動かなくなる。
// 1.0.1 は npm で最新であることを確認したもの(2026-08-10)。
const VERSION = '1.0.1';
const DEFAULT_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;

// float16 v1。実測 3,758,596 バイト。
const DEFAULT_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/**
 * 置き場所を差し替えられるようにしておく。既存の coop-relay と同じ meta タグ方式。
 *
 * 要る理由は2つあって、どちらも本番の話:
 *   1. **合計 15.6MB を自分のドメインから brotli で配りたくなる**(wasm は圧縮が効く)。
 *      CDN 直だと圧縮も期限も相手任せになる。
 *   2. CDN が塞がれている回線が実在する。会社・学校・国。
 *      その時に「動かないゲーム」になるか「置き場所を変えれば動く」かの差は大きい。
 *
 * 例)  <meta name="mediapipe-base" content="/vendor/tasks-vision">
 *      <meta name="face-model" content="/vendor/face_landmarker.task">
 * 検証用に ?mp=... &model=... でも上書きできる。
 */
function override(metaName, param, fallback) {
  try {
    const q = new URLSearchParams(location.search).get(param);
    if (q) return q.replace(/\/$/, '');
    const m = document.querySelector(`meta[name="${metaName}"]`)?.content?.trim();
    if (m) return m.replace(/\/$/, '');
  } catch (e) { /* meta が無いのが普通 */ }
  return fallback;
}

const CDN = override('mediapipe-base', 'mp', DEFAULT_CDN);
const MODEL_URL = override('face-model', 'model', DEFAULT_MODEL);

/** 合計のダウンロード量。画面に出して、待たせている理由を隠さないために使う。 */
export const APPROX_BYTES = 3_758_596 + 12_000_000 + 152_000;

export class FaceSource {
  constructor() {
    this.video = null;
    this.stream = null;
    this.landmarker = null;
    this.lastVideoTimeMs = -1;
    this.lastTimestampMs = 0;
    this.raws = {};            // { gape: 0.0, smile: 0.0, ... }
    this.confidence = 0;
    this.landmarks = null;     // 描画用。画面に「認識されている」ことを見せるため
    this.available = new Set();
    this.unusable = [];        // モデルに blendshape が無くて出題できない表情
    this.delegate = null;      // 'GPU' | 'CPU'
    this.faceCount = 0;
    for (const e of EXPRESSIONS) this.raws[e.key] = 0;
  }

  /**
   * カメラを開く。**これを呼ぶ前に、何に使うかを画面で見せること。**
   * いきなり getUserMedia を呼ぶと拒否される。
   */
  async openCamera(videoEl) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('CAMERA_UNSUPPORTED');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
    this.video = videoEl;
    videoEl.srcObject = this.stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    await videoEl.play();
    await new Promise(res => {
      if (videoEl.videoWidth > 0) return res();
      videoEl.addEventListener('loadeddata', res, { once: true });
    });
    return this.stream;
  }

  /** MediaPipe を読み込む。ここで 15MB 前後が降ってくる。 */
  async load(onProgress) {
    onProgress?.('ライブラリを読み込み中');
    const { FilesetResolver, FaceLandmarker } = await import(
      /* @vite-ignore */ `${CDN}/vision_bundle.mjs`
    );

    onProgress?.('推論エンジンを読み込み中');
    const fileset = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);

    onProgress?.('顔のモデルを読み込み中');
    const opts = {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
      numFaces: 1, // ふたりプレイは後回し。まず1人で成立してから
    };
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts);
      this.delegate = 'GPU';
    } catch (e) {
      // GPU が使えない端末は実在する。黙って落ちるより CPU で動いたほうがよい。
      opts.baseOptions.delegate = 'CPU';
      this.landmarker = await FaceLandmarker.createFromOptions(fileset, opts);
      this.delegate = 'CPU';
    }
    return this;
  }

  /**
   * モデルが本当にその blendshape を持っているか、1フレーム走らせて確かめる。
   * 名前を前提にしたまま静かに無反応になるのが最悪なので、ここで先に分かるようにする。
   */
  probe() {
    if (!this.landmarker || !this.video) return;
    try {
      const ts = this._nextTimestamp();
      const res = this.landmarker.detectForVideo(this.video, ts);
      const cats = res?.faceBlendshapes?.[0]?.categories;
      if (cats?.length) {
        for (const c of cats) this.available.add(c.categoryName);
        this.unusable = EXPRESSIONS
          .filter(e => e.ask && !shapesAvailable(e, this.available))
          .map(e => e.key);
      }
    } catch (e) { /* 顔がまだ映っていないだけ。次のフレームで取れる */ }
  }

  /** MediaPipe は時刻が必ず増えることを要求する。同じ値を渡すと例外を投げる。 */
  _nextTimestamp() {
    const t = Math.max(this.lastTimestampMs + 1, Math.round(performance.now()));
    this.lastTimestampMs = t;
    return t;
  }

  /**
   * 1フレーム分の推定。カメラは 30fps、画面は 60fps なので、
   * 新しいフレームが来ていない時は前の値をそのまま返す。
   */
  tick() {
    if (!this.landmarker || !this.video || this.video.readyState < 2) {
      this.confidence = 0;
      return this.raws;
    }
    const vt = this.video.currentTime * 1000;
    if (vt === this.lastVideoTimeMs) return this.raws; // 同じフレーム。走らせない
    this.lastVideoTimeMs = vt;

    let res;
    try {
      res = this.landmarker.detectForVideo(this.video, this._nextTimestamp());
    } catch (e) {
      this.confidence = 0;
      return this.raws;
    }

    const faces = res?.faceBlendshapes || [];
    this.faceCount = faces.length;
    const cats = faces[0]?.categories;
    this.landmarks = res?.faceLandmarks?.[0] || null;

    if (!cats?.length) {
      // 見失った。値は 0 に落とさない。落とすと入力が一瞬暴れて誤爆する。
      this.confidence = 0;
      return this.raws;
    }
    this.confidence = 1;

    const byName = new Map();
    for (const c of cats) byName.set(c.categoryName, c.score);
    if (this.available.size === 0) {
      for (const c of cats) this.available.add(c.categoryName);
      this.unusable = EXPRESSIONS
        .filter(e => e.ask && !shapesAvailable(e, this.available))
        .map(e => e.key);
    }

    for (const e of EXPRESSIONS) {
      let sum = 0, n = 0;
      for (const s of e.shapes) {
        const v = byName.get(s);
        if (typeof v === 'number') { sum += v; n++; }
      }
      // 名前が1つも取れない表情は、前の値を保つ(0 にしない)。
      if (n > 0) this.raws[e.key] = sum / n;
    }
    return this.raws;
  }

  /** カメラを完全に手放す。画面を離れる時は必ず呼ぶ。 */
  stop() {
    try { this.stream?.getTracks().forEach(t => t.stop()); } catch (e) { /* noop */ }
    try { this.landmarker?.close?.(); } catch (e) { /* noop */ }
    if (this.video) this.video.srcObject = null;
    this.stream = null;
    this.landmarker = null;
    this.confidence = 0;
  }
}

/** HTTPS でないとカメラは開けない(localhost は例外)。先に伝えるために使う。 */
export function isSecureForCamera() {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}
