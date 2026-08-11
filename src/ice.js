// ============================================================
// ice.js — WebRTC の接続先候補(STUN/TURN)と、候補集めの待ち方
//
//   直結(2人)と網目(3〜4人)の両方が同じものを使うので、ここに出した。
//   もとは coop.js の中にあり、mesh.js から使うには複製するしかなかった。
//   複製すると「片方だけ直す」事故が必ず起きる種類のコードなので、1か所にする。
// ============================================================

const SIG = '/api/signal';

// 既定(サーバーから設定を取れなかった場合の保険)
export const ICE_FALLBACK = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
    username: 'openrelayproject', credential: 'openrelayproject' },
];

let iceCache = null;

export async function iceConfig() {
  if (iceCache) return iceCache;
  try {
    const r = await fetch(`${SIG}?want=ice`);
    if (r.ok) { const j = await r.json(); if (j.iceServers && j.iceServers.length) iceCache = j.iceServers; }
  } catch (e) { /* 取得失敗時は既定を使う */ }
  return (iceCache = iceCache || ICE_FALLBACK);
}

/** テスト用: 取得済みの設定を捨てる。 */
export function resetIceCache() { iceCache = null; }

/**
 * ICE候補の収集を待つ。
 *
 * ここを早く打ち切ると「自宅LAN内アドレスしか無いSDP」を送ってしまい、
 * 別回線の相手とは直通が張れない。外向き候補(srflx/relay)が取れるまで待ち、
 * 最大12秒で打ち切る。
 */
export function gatherIce(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(res => {
    let got = false;
    const done = () => { clearTimeout(hard); clearTimeout(soft); pc.onicecandidate = null; res(); };
    const hard = setTimeout(done, 12000);
    let soft = null;
    pc.onicecandidate = e => {
      if (!e.candidate) return done();                       // 収集完了
      const c = e.candidate.candidate || '';
      if (/typ (srflx|relay)/.test(c) && !got) {
        got = true;                                          // 外から見えるアドレスを確保
        soft = setTimeout(done, 1500);                       // 少しだけ追加候補を待つ
      }
    };
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') done(); };
  });
}
