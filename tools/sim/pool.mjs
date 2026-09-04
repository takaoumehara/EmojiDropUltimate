// ============================================================
// tools/sim/pool.mjs — ワーカーを CPU 数だけ並べて回す
//
//   1実行 = 1ワーカー（理由は worker.mjs のヘッダ）。使い回さないので
//   起動コストは毎回かかるが、そのぶん結果が決定的になる。
//   実測でワーカー1本あたり 0.1〜0.4 秒なので、これで困らない。
// ============================================================
import { Worker } from 'node:worker_threads';
import os from 'node:os';

const WORKER = new URL('./worker.mjs', import.meta.url);

function runCell(cell) {
  return new Promise((resolve) => {
    const w = new Worker(WORKER, { workerData: cell });
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    w.on('message', (m) => finish(m.ok ? m.r : { ...cell, error: m.error }));
    w.on('error', (e) => finish({ ...cell, error: String(e.stack || e) }));
    w.on('exit', (code) => finish({ ...cell, error: `ワーカーが結果を返さずに終了した (code ${code})` }));
  });
}

/**
 * セルの配列を並列に走らせる。結果は**入力と同じ順**で返す。
 * @param {object[]} cells
 * @param {{concurrency?: number, onProgress?: (done:number, total:number)=>void}} opt
 */
export async function runAll(cells, opt = {}) {
  const limit = opt.concurrency || Math.max(1, os.cpus().length);
  const out = new Array(cells.length);
  let next = 0, done = 0;

  async function lane() {
    while (true) {
      const i = next++;
      if (i >= cells.length) return;
      out[i] = await runCell(cells[i]);
      done++;
      if (opt.onProgress) opt.onProgress(done, cells.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, cells.length) }, lane));
  return out;
}
