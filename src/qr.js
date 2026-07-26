// ============================================================
// qr.js — QRコード生成(依存ゼロ・ビルド不要・DOM/Node API不使用)
//   バイトモード固定 / 誤り訂正レベル:M / バージョン1〜10を自動選択。
//   GF(256)算術・リードソロモン符号・データマスク選択まで全部自前実装。
//   qrMatrix(text) → { size, modules } (modules[y*size+x]===1 が暗モジュール)
//   収まらない(長すぎる)場合は null を返す。
// ============================================================

// === GF(256) 表(原始多項式 x^8+x^4+x^3+x^2+1 = 0x11d) ===
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();
const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];

// === リードソロモン: 生成多項式 & 符号語(ECC)計算 ===
function polyMul(a, b) {
  const res = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) res[i + j] ^= gfMul(a[i], b[j]);
  }
  return res;
}
function rsGeneratorPoly(eccLen) {
  let poly = [1];
  for (let i = 0; i < eccLen; i++) poly = polyMul(poly, [1, GF_EXP[i]]);
  return poly;
}
function rsEncode(data, eccLen) {
  const gen = rsGeneratorPoly(eccLen);
  const res = new Uint8Array(data.length + eccLen);
  res.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= gfMul(gen[j], factor);
  }
  return res.slice(data.length);
}

// === BCH符号(フォーマット情報・バージョン情報のECC) ===
function bchDivide(value, poly) {
  const polyLen = 32 - Math.clz32(poly);
  let val = value;
  while (val !== 0 && (32 - Math.clz32(val)) >= polyLen) {
    val ^= poly << (32 - Math.clz32(val) - polyLen);
  }
  return val;
}
const FORMAT_MASK = 0x5412;   // 15bit マスク定数
const FORMAT_GEN = 0x537;     // BCH(15,5) 生成多項式
const VERSION_GEN = 0x1f25;   // BCH(18,6) 生成多項式
function formatBits(mask) {
  const data = (0b00 << 3) | mask; // ECCレベル: M=00 固定
  const val = data << 10;
  return (val | bchDivide(val, FORMAT_GEN)) ^ FORMAT_MASK;
}
function versionInfoBits(v) {
  const val = v << 12;
  return val | bchDivide(val, VERSION_GEN);
}

// === バージョン毎のデータ容量表(誤り訂正レベル:M) ===
//   size=モジュール数, ecc=ブロック毎ECC符号語数, g1/g2=ブロック数とブロック毎データ符号語数
const VERSION_INFO = [
  { v: 1,  size: 21, ecc: 10, g1n: 1, g1c: 16, g2n: 0, g2c: 0 },
  { v: 2,  size: 25, ecc: 16, g1n: 1, g1c: 28, g2n: 0, g2c: 0 },
  { v: 3,  size: 29, ecc: 26, g1n: 1, g1c: 44, g2n: 0, g2c: 0 },
  { v: 4,  size: 33, ecc: 18, g1n: 2, g1c: 32, g2n: 0, g2c: 0 },
  { v: 5,  size: 37, ecc: 24, g1n: 2, g1c: 43, g2n: 0, g2c: 0 },
  { v: 6,  size: 41, ecc: 16, g1n: 4, g1c: 27, g2n: 0, g2c: 0 },
  { v: 7,  size: 45, ecc: 18, g1n: 4, g1c: 31, g2n: 0, g2c: 0 },
  { v: 8,  size: 49, ecc: 22, g1n: 2, g1c: 38, g2n: 2, g2c: 39 },
  { v: 9,  size: 53, ecc: 22, g1n: 3, g1c: 36, g2n: 2, g2c: 37 },
  { v: 10, size: 57, ecc: 26, g1n: 4, g1c: 43, g2n: 1, g2c: 44 },
];
const ALIGN_POS = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};
const REMAINDER_BITS = [0, 7, 7, 7, 7, 7, 0, 0, 0, 0]; // index = v-1

function dataCodewordsOf(info) { return info.g1n * info.g1c + info.g2n * info.g2c; }

// 文字列→UTF-8バイト列(通常はASCII/Latin1のみ想定だが一応フル対応)
function toUtf8Bytes(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.codePointAt(i);
    if (code > 0xffff) i++; // サロゲートペアを消費
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return Uint8Array.from(out);
}

// 収まる最小バージョンを選ぶ(バイトモード, ECC:M)
function chooseVersion(byteLen) {
  for (const info of VERSION_INFO) {
    const countBits = info.v <= 9 ? 8 : 16;
    const needed = 4 + countBits + byteLen * 8;
    if (needed <= dataCodewordsOf(info) * 8) return info;
  }
  return null;
}

// === ビットバッファ ===
class BitBuffer {
  constructor() { this.bits = []; }
  get length() { return this.bits.length; }
  put(val, len) { for (let i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1); }
}

// データ符号語列を作る: モード+文字数+データ+終端+パディング
function encodeData(bytes, version, dataCodewords) {
  const bb = new BitBuffer();
  bb.put(0b0100, 4); // バイトモード指示子
  bb.put(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) bb.put(b, 8);
  const capacityBits = dataCodewords * 8;
  bb.put(0, Math.min(4, Math.max(0, capacityBits - bb.length))); // 終端(最大4bit)
  while (bb.length % 8 !== 0) bb.put(0, 1); // 8bit境界まで0埋め
  const codewords = [];
  for (let i = 0; i < bb.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb.bits[i + j];
    codewords.push(byte);
  }
  const PAD = [0xec, 0x11];
  for (let p = 0; codewords.length < dataCodewords; p++) codewords.push(PAD[p % 2]);
  return Uint8Array.from(codewords);
}

// データ符号語をブロックに分割
function splitBlocks(dataCw, info) {
  const blocks = [];
  let off = 0;
  for (let i = 0; i < info.g1n; i++, off += info.g1c) blocks.push(dataCw.slice(off, off + info.g1c));
  for (let i = 0; i < info.g2n; i++, off += info.g2c) blocks.push(dataCw.slice(off, off + info.g2c));
  return blocks;
}

// データ符号語・ECC符号語をインターリーブしてビット列にする
function interleave(blocks, eccBlocks, remainderBits) {
  const bb = new BitBuffer();
  const maxData = Math.max(...blocks.map(b => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.length) bb.put(b[i], 8);
  }
  const eccLen = eccBlocks[0].length;
  for (let i = 0; i < eccLen; i++) {
    for (const e of eccBlocks) bb.put(e[i], 8);
  }
  bb.put(0, remainderBits);
  return bb.bits;
}

// === 8種類のマスクパターン(x=列, y=行) ===
const MASK_FNS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (((y >> 1) + Math.floor(x / 3)) % 2) === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) === 0,
  (x, y) => (((x * y) % 2 + (x * y) % 3) % 2) === 0,
  (x, y) => (((x + y) % 2 + (x * y) % 3) % 2) === 0,
];

// === 機能パターン(ファインダー・タイミング・アライメント等)を配置し、
//     データ配置禁止領域(rsv)も同時に記録する ===
function buildMatrix(info) {
  const size = info.size;
  const mat = new Uint8Array(size * size);
  const rsv = new Uint8Array(size * size);
  const set = (x, y, val) => { mat[y * size + x] = val; rsv[y * size + x] = 1; };

  // ファインダーパターン+セパレータ(白枠)
  function placeFinder(cx, cy) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const inCore = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const dark = inCore && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        set(x, y, dark ? 1 : 0);
      }
    }
  }
  placeFinder(0, 0);
  placeFinder(size - 7, 0);
  placeFinder(0, size - 7);

  // タイミングパターン(行6・列6の交互パターン)
  for (let i = 8; i < size - 8; i++) {
    if (!rsv[6 * size + i]) set(i, 6, i % 2 === 0 ? 1 : 0);
    if (!rsv[i * size + 6]) set(6, i, i % 2 === 0 ? 1 : 0);
  }

  // アライメントパターン(ファインダーと重なる組は除外)
  const aligns = ALIGN_POS[info.v];
  for (const cy of aligns) {
    for (const cx of aligns) {
      if (cx <= 8 && cy <= 8) continue;           // 左上
      if (cx >= size - 9 && cy <= 8) continue;    // 右上
      if (cx <= 8 && cy >= size - 9) continue;    // 左下
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
          set(cx + dx, cy + dy, dark ? 1 : 0);
        }
      }
    }
  }

  // ダークモジュール(常に暗)
  set(8, 4 * info.v + 9, 1);

  // フォーマット情報の予約領域(値は最後に書き込む)
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { set(i, 8, 0); set(8, i, 0); }
  }
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, 0);
  for (let i = 0; i < 7; i++) set(8, size - 1 - i, 0);

  // バージョン情報の予約領域(v7以上)
  if (info.v >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        set(i, size - 11 + j, 0);
        set(size - 11 + j, i, 0);
      }
    }
  }

  return { size, mat, rsv };
}

// データビットをジグザグ(2列単位・上下交互)で配置する
function placeData(state, bits) {
  const { size, mat, rsv } = state;
  let bi = 0;
  let dir = -1; // -1: 上向き, 1: 下向き
  let col = size - 1;
  while (col > 0) {
    if (col === 6) col--; // 縦のタイミング列はスキップ
    for (let i = 0; i < size; i++) {
      const y = dir === -1 ? size - 1 - i : i;
      for (let dx = 0; dx < 2; dx++) {
        const x = col - dx;
        if (rsv[y * size + x]) continue;
        mat[y * size + x] = bi < bits.length ? bits[bi] : 0;
        bi++;
      }
    }
    dir = -dir;
    col -= 2;
  }
}

// マスク適用後のペナルティスコア(規則1〜4)
function computePenalty(mat, size) {
  let penalty = 0;
  // 規則1: 同色が5つ以上連続(行・列)
  for (let y = 0; y < size; y++) {
    let color = -1, run = 0;
    for (let x = 0; x < size; x++) {
      const v = mat[y * size + x];
      if (v === color) { run++; } else { if (run >= 5) penalty += 3 + (run - 5); color = v; run = 1; }
    }
    if (run >= 5) penalty += 3 + (run - 5);
  }
  for (let x = 0; x < size; x++) {
    let color = -1, run = 0;
    for (let y = 0; y < size; y++) {
      const v = mat[y * size + x];
      if (v === color) { run++; } else { if (run >= 5) penalty += 3 + (run - 5); color = v; run = 1; }
    }
    if (run >= 5) penalty += 3 + (run - 5);
  }
  // 規則2: 2x2 同色ブロック
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const v = mat[y * size + x];
      if (v === mat[y * size + x + 1] && v === mat[(y + 1) * size + x] && v === mat[(y + 1) * size + x + 1]) penalty += 3;
    }
  }
  // 規則3: ファインダー風パターン(1:1:3:1:1、前後に白4つ)
  const P1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const P2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const matchAt = (get, pat) => { for (let k = 0; k < pat.length; k++) if (get(k) !== pat[k]) return false; return true; };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x <= size - 11; x++) {
      const get = k => mat[y * size + x + k];
      if (matchAt(get, P1) || matchAt(get, P2)) penalty += 40;
    }
  }
  for (let x = 0; x < size; x++) {
    for (let y = 0; y <= size - 11; y++) {
      const get = k => mat[(y + k) * size + x];
      if (matchAt(get, P1) || matchAt(get, P2)) penalty += 40;
    }
  }
  // 規則4: 暗モジュール比率の50%からの偏り
  let dark = 0;
  for (let i = 0; i < mat.length; i++) dark += mat[i];
  const ratio = (dark * 100) / (size * size);
  penalty += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return penalty;
}

// フォーマット情報(15bit)を2箇所に書き込む
function writeFormatInfo(size, mat, bits) {
  const b = i => (bits >> i) & 1;
  const A = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8], [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]];
  for (let i = 0; i < 15; i++) { const [x, y] = A[i]; mat[y * size + x] = b(i); }
  for (let i = 0; i < 8; i++) mat[8 * size + (size - 1 - i)] = b(i);
  for (let i = 8; i < 15; i++) mat[(size - 15 + i) * size + 8] = b(i);
}

// バージョン情報(18bit, v7以上)を2箇所に書き込む
function writeVersionInfo(size, mat, bits) {
  const b = i => (bits >> i) & 1;
  for (let i = 0; i < 18; i++) {
    const col = Math.floor(i / 3), row = i % 3;
    mat[(size - 11 + row) * size + col] = b(i);
    mat[col * size + (size - 11 + row)] = b(i);
  }
}

// === 公開API ===
// text を QR コード行列にエンコードする。収まらない場合は null。
export function qrMatrix(text) {
  const bytes = toUtf8Bytes(String(text));
  const info = chooseVersion(bytes.length);
  if (!info) return null;

  const dataCw = encodeData(bytes, info.v, dataCodewordsOf(info));
  const blocks = splitBlocks(dataCw, info);
  const eccBlocks = blocks.map(b => rsEncode(b, info.ecc));
  const bits = interleave(blocks, eccBlocks, REMAINDER_BITS[info.v - 1]);

  const state = buildMatrix(info);
  placeData(state, bits);

  // 8種のマスクを試し、ペナルティ最小のものを採用する
  let bestScore = Infinity, bestMat = null, bestMask = 0;
  for (let m = 0; m < 8; m++) {
    const trial = state.mat.slice();
    for (let y = 0; y < state.size; y++) {
      for (let x = 0; x < state.size; x++) {
        if (!state.rsv[y * state.size + x] && MASK_FNS[m](x, y)) trial[y * state.size + x] ^= 1;
      }
    }
    const score = computePenalty(trial, state.size);
    if (score < bestScore) { bestScore = score; bestMat = trial; bestMask = m; }
  }

  writeFormatInfo(state.size, bestMat, formatBits(bestMask));
  if (info.v >= 7) writeVersionInfo(state.size, bestMat, versionInfoBits(info.v));

  return { size: state.size, modules: bestMat };
}
