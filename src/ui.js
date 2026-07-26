// ============================================================
// ui.js — 共有パネル(HTMLオーバーレイ)
//   スコアカード画像 + 各SNSシェア(X/LINE/Facebook/Instagram/TikTok/ネイティブ)
//   + スクリーンネーム編集 + デイリーランキング表示。
//
// iOS Safari 対応方針(重要):
//   ・ユーザー操作(タップ)から `await` を挟んだ後に navigator.share /
//     navigator.clipboard / window.open を呼ぶと「ユーザー操作」とみなされず
//     サイレントにブロックされる。→ 画像Blob/File/canShare判定はパネルを
//     開いた時点で先に(クリック前に)生成して変数に保持し、各クリック
//     ハンドラは完全に同期関数にする。
//   ・window.open(url,'_blank','features') はポップアップ扱いでブロック
//     されがちなので使わない。X/LINE/Facebook は実体の <a target="_blank"
//     rel="noopener"> をそのままマークアップに描画し、OS標準のリンク遷移
//     (ユニバーサルリンク)に任せる。
//   ・<a download> は iOS Safari では「写真に保存」されない(ダウンロード
//     バーに出るだけ)。navigator.canShare({files}) が true な端末では
//     navigator.share({files}) を使う(共有シートに「画像を保存」が出る)。
//     <a download> は非対応環境向けのフォールバックとしてのみ使う。
//   ・navigator.clipboard.writeText は iOS で reject することがあるため、
//     同期的な <textarea> + document.execCommand('copy') フォールバックを
//     必ず用意する。
//   ・Instagram / TikTok は Web 経由の共有インテントが存在しないため、
//     ネイティブ共有シート(navigator.share)へ誘導し、UI 上でもその旨を
//     正直に説明する。
// ============================================================
import { buildCanvas, summaryText, SHARE_URL } from './sharecard.js';
import { getLang, t } from './i18n.js';
import { Save } from './save.js';
import { Leaderboard } from './leaderboard.js';

let overlay = null;
let blobUrl = null;      // <a download> フォールバック用オブジェクトURL
let curBlob = null;      // スコアカード画像のBlob
let curFile = null;      // Web Share Files 用 File(Blobから作成)
let canShareFiles = false; // この端末が navigator.share({files}) に対応しているか
let curData = null;
let shareText = '';

function ja() { return getLang() === 'ja'; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---- ブランドアイコン(インラインSVG、外部画像/CDN不使用) ----
const ICONS = {
  x: `<svg viewBox="0 0 24 24"><path fill="#fff" d="M18.24 2.5h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.96 6.82H1.66l7.73-8.84L1.25 2.5h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.38H5.12z"/></svg>`,
  line: `<svg viewBox="0 0 24 24"><path fill="#fff" d="M12 4C6.98 4 3 7.28 3 11.2c0 2.32 1.4 4.36 3.55 5.68-.16.6-.6 2.13-.68 2.46-.1.4.15.4.31.29.13-.08 2.06-1.36 2.9-1.92.94.24 1.93.37 2.92.37 5.02 0 9-3.28 9-7.2S17.02 4 12 4z"/><circle cx="8.6" cy="11.2" r="1" fill="#06C755"/><circle cx="12" cy="11.2" r="1" fill="#06C755"/><circle cx="15.4" cy="11.2" r="1" fill="#06C755"/></svg>`,
  fb: `<svg viewBox="0 0 24 24"><path fill="#fff" d="M14.5 8.5h2V5.8s-1-.2-2-.2c-2 0-3.3 1.2-3.3 3.4v2H9v3h2.2V21h3v-6.8h2.1l.4-3h-2.5V9.2c0-.5.1-.7.7-.7z"/></svg>`,
  ig: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="16.8" cy="7.2" r="1.1" fill="#fff" stroke="none"/></svg>`,
  tt: `<svg viewBox="0 0 24 24"><path fill="#25F4EE" transform="translate(-.6,.35)" d="M14.5 3.5c.3 1.7 1.4 3 3 3.5v2.6c-1.1 0-2.2-.3-3-.9v5.4a4.6 4.6 0 1 1-4-4.6v2.7a2 2 0 1 0 2 2V3.5h2z"/><path fill="#FE2C55" transform="translate(.6,-.35)" d="M14.5 3.5c.3 1.7 1.4 3 3 3.5v2.6c-1.1 0-2.2-.3-3-.9v5.4a4.6 4.6 0 1 1-4-4.6v2.7a2 2 0 1 0 2 2V3.5h2z"/><path fill="#fff" d="M14.5 3.5c.3 1.7 1.4 3 3 3.5v2.6c-1.1 0-2.2-.3-3-.9v5.4a4.6 4.6 0 1 1-4-4.6v2.7a2 2 0 1 0 2 2V3.5h2z"/></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>`,
  save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11M8 10l4 4 4-4"/><path d="M5 20h14"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 14.5l5-5"/><path d="M8 9l1.6-1.6a3 3 0 0 1 4.24 4.24L12 13.4"/><path d="M16 15l-1.6 1.6a3 3 0 0 1-4.24-4.24L11.8 10.6"/></svg>`,
};

function ensure() {
  if (overlay) return;
  const css = document.createElement('style');
  css.textContent = `
  #eduOv{position:fixed;inset:0;z-index:40;display:none;background:rgba(2,3,10,.965);align-items:center;justify-content:center;padding:20px 14px max(20px,env(safe-area-inset-bottom));overflow:auto;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  #eduOv.show{display:flex}
  #eduPanel{position:relative;width:min(380px,100%);display:flex;flex-direction:column;align-items:center;padding:10px 6px 4px;animation:eduIn .25s cubic-bezier(.2,.85,.35,1.1)}
  @keyframes eduIn{from{opacity:0;transform:scale(.94) translateY(6px)}to{opacity:1;transform:none}}
  .eduX{position:absolute;top:-2px;right:-2px;width:34px;height:34px;border:0;background:rgba(255,255,255,.08);color:#fff;font-size:19px;line-height:1;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif}
  .eduX:active{background:rgba(255,255,255,.2);transform:scale(.9)}
  .eduTitle{font-family:'Baloo 2','M PLUS Rounded 1c',system-ui,sans-serif;font-size:19px;font-weight:800;color:#ffd23f;text-align:center;margin:4px 0 16px;letter-spacing:.02em}
  #eduPrev{display:block;width:70%;max-width:250px;margin:0 auto 18px;border-radius:18px;box-shadow:0 20px 44px rgba(0,0,0,.55),0 2px 10px rgba(0,0,0,.45);background:#111}
  .eduName{display:flex;gap:6px;align-items:center;justify-content:center;margin-bottom:20px;font-size:12.5px;color:#8a92b8}
  .eduName b{color:#e9edfb;font-weight:700}
  .eduEdit{appearance:none;border:0;background:transparent;color:#8a92b8;font-size:13px;cursor:pointer;padding:2px 5px;font-family:inherit}
  .eduEdit:active{color:#ffd23f;transform:scale(.9)}
  .eduRow6{display:flex;justify-content:center;gap:8px;width:100%;margin-bottom:8px;flex-wrap:wrap}
  .eduIc{appearance:none;border:0;background:transparent;color:#cfd6ee;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;text-decoration:none;font-family:inherit;padding:0;-webkit-tap-highlight-color:transparent}
  .eduCircle{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 5px 14px rgba(0,0,0,.4);transition:transform .1s ease}
  .eduCircle svg{width:22px;height:22px;display:block}
  .eduIc .eduLbl{font-size:9.5px;color:#8a92b8;font-weight:600;white-space:nowrap}
  .eduIc:active .eduCircle{transform:scale(.88)}
  .c-x{background:#0a0a0a;border:1px solid rgba(255,255,255,.22)}
  .c-line{background:#06c755}
  .c-fb{background:#1877f2}
  .c-ig{background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)}
  .c-tt{background:#0a0a0a;border:1px solid rgba(255,255,255,.22)}
  .c-more{background:#2a3055}
  .eduNote{font-size:10.5px;line-height:1.4;color:#5a628c;text-align:center;margin:0 auto 16px;max-width:290px}
  .eduRow2{display:flex;justify-content:center;gap:10px;margin-bottom:6px}
  .eduIc2{appearance:none;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);color:#cfd6ee;display:flex;align-items:center;gap:6px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;padding:9px 15px;border-radius:22px;-webkit-tap-highlight-color:transparent}
  .eduIc2 svg{width:15px;height:15px}
  .eduIc2:active{transform:scale(.94);background:rgba(255,255,255,.12)}
  .eduLb{margin-top:18px;padding-top:14px;width:100%;border-top:1px solid rgba(255,255,255,.14)}
  .eduLb h4{font-family:'Baloo 2','M PLUS Rounded 1c',system-ui,sans-serif;font-size:13px;color:#ffd23f;text-align:center;margin-bottom:8px;font-weight:800}
  .eduRow{display:flex;justify-content:space-between;font-size:13px;padding:4px 8px;border-radius:8px;color:#b9c2e6}
  .eduRow.me{background:rgba(255,210,63,.18);color:#fff;font-weight:800}
  .eduRow .rk{width:24px;color:#666f9a;display:inline-block}
  .eduMuted{font-size:11px;color:#666f9a;text-align:center;margin-top:6px}
  `;
  document.head.appendChild(css);
  overlay = document.createElement('div');
  overlay.id = 'eduOv';
  overlay.innerHTML = `<div id="eduPanel"></div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
}

function close() {
  if (overlay) overlay.classList.remove('show');
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }
}

function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:60;background:#000c;color:#fff;padding:10px 16px;border-radius:20px;font-family:system-ui,sans-serif;font-weight:700;font-size:13px;max-width:86vw;text-align:center';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// ---- コピー(同期) : clipboard API → だめなら textarea + execCommand ----
function textAreaCopy(text, okMsg) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus(); ta.select();
    document.execCommand('copy');
    ta.remove();
    toast(okMsg);
  } catch (e) { toast('URL: ' + text); }
}
function copyText(text, okMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    // iOS では await を挟まず、クリックハンドラから直接呼ぶことが重要。
    // reject した場合のみ同期フォールバックへ。
    navigator.clipboard.writeText(text).then(() => toast(okMsg)).catch(() => textAreaCopy(text, okMsg));
  } else {
    textAreaCopy(text, okMsg);
  }
}

// ---- 画像保存(同期) : Web Share(Files) → だめなら <a download> ----
function downloadFallback() {
  if (!blobUrl && curBlob) blobUrl = URL.createObjectURL(curBlob);
  if (!blobUrl) return;
  const a = document.createElement('a');
  a.href = blobUrl; a.download = 'emoji-drop-score.png';
  document.body.appendChild(a); a.click(); a.remove();
}
function doSave() {
  if (!curBlob) { toast(ja() ? '画像を準備中…もう一度タップしてね' : 'Preparing image… tap again'); return; }
  if (canShareFiles && curFile) {
    navigator.share({ files: [curFile], title: 'EMOJI DROP ULTIMATE', text: shareText })
      .catch(e => { if (!e || e.name !== 'AbortError') downloadFallback(); });
  } else {
    downloadFallback();
  }
}
function doCopy() {
  copyText(shareText + ' ' + curData.url, ja() ? 'コピーしました' : 'Copied');
}

// ---- Instagram / TikTok / その他 : ネイティブ共有シートへ(Web版に共有インテントが無い) ----
function shareViaSheet(appName) {
  if (canShareFiles && curFile) {
    navigator.share({ files: [curFile], text: shareText, title: 'EMOJI DROP ULTIMATE' })
      .catch(e => { if (!e || e.name !== 'AbortError') fallbackShare(appName); });
  } else if (navigator.share) {
    navigator.share({ text: shareText, url: curData.url, title: 'EMOJI DROP ULTIMATE' })
      .catch(e => { if (!e || e.name !== 'AbortError') fallbackShare(appName); });
  } else {
    fallbackShare(appName);
  }
}
function fallbackShare(appName) {
  downloadFallback();
  toast(ja() ? `画像を保存しました。${appName || 'アプリ'}で投稿してね` : `Image saved — post it on ${appName || 'the app'}`);
}

function renderLeaderboard(res, myName) {
  if (!res || !res.top || !res.top.length) return `<div class="eduLb"><h4>🏆 ${ja() ? '本日のランキング' : "Today's Ranking"}</h4><div class="eduMuted">${ja() ? 'まだスコアがありません' : 'No scores yet'}</div></div>`;
  const rows = res.top.map((r, i) => `<div class="eduRow ${r.name === myName ? 'me' : ''}"><span><span class="rk">${i + 1}</span>${esc(r.name)}</span><span>${r.score.toLocaleString()}</span></div>`).join('');
  return `<div class="eduLb"><h4>🏆 ${ja() ? '本日のランキング' : "Today's Ranking"}</h4>${rows}</div>`;
}

// data: {emoji, mode, stageName, rank, score, sub, weather, daily, day, url}
export async function openShare(data) {
  ensure();
  curData = data;
  curData.url = data.url || SHARE_URL;
  curBlob = null; curFile = null; canShareFiles = false;
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; }

  const panel = overlay.querySelector('#eduPanel');
  const name = Save.name();
  shareText = summaryText(data);
  const encText = encodeURIComponent(shareText);
  const encUrl = encodeURIComponent(curData.url);
  // モバイルのユニバーサルリンク: 実 <a target=_blank> による遷移でアプリへハンドオフさせる
  const xUrl = `https://twitter.com/intent/tweet?text=${encText}&url=${encUrl}`;
  const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(shareText + ' ' + curData.url)}`;
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encUrl}`;

  panel.innerHTML = `
    <button class="eduX" id="s-close" aria-label="${ja() ? '閉じる' : 'Close'}">×</button>
    <h3 class="eduTitle">${ja() ? 'スコアを共有' : 'Share your score'}</h3>
    <img id="eduPrev" alt="score card"/>
    <div class="eduName">${ja() ? '名前' : 'Name'}: <b id="eduNm">${esc(name)}</b><button class="eduEdit" id="eduRen" aria-label="edit">✎</button></div>
    <div class="eduRow6">
      <a class="eduIc" id="s-x" href="${xUrl}" target="_blank" rel="noopener"><span class="eduCircle c-x">${ICONS.x}</span><span class="eduLbl">X</span></a>
      <a class="eduIc" id="s-line" href="${lineUrl}" target="_blank" rel="noopener"><span class="eduCircle c-line">${ICONS.line}</span><span class="eduLbl">LINE</span></a>
      <a class="eduIc" id="s-fb" href="${fbUrl}" target="_blank" rel="noopener"><span class="eduCircle c-fb">${ICONS.fb}</span><span class="eduLbl">Facebook</span></a>
      <button class="eduIc" id="s-ig" type="button"><span class="eduCircle c-ig">${ICONS.ig}</span><span class="eduLbl">Instagram</span></button>
      <button class="eduIc" id="s-tt" type="button"><span class="eduCircle c-tt">${ICONS.tt}</span><span class="eduLbl">TikTok</span></button>
      <button class="eduIc" id="s-native" type="button"><span class="eduCircle c-more">${ICONS.more}</span><span class="eduLbl">${ja() ? 'その他' : 'More'}</span></button>
    </div>
    <div class="eduNote">${ja() ? 'Instagram / TikTok はアプリの共有シートから選んでね' : 'Instagram & TikTok open your share sheet — pick the app there'}</div>
    <div class="eduRow2">
      <button class="eduIc2" id="s-save" type="button">${ICONS.save}${ja() ? '保存' : 'Save'}</button>
      <button class="eduIc2" id="s-copy" type="button">${ICONS.link}${ja() ? 'リンクをコピー' : 'Copy link'}</button>
    </div>
    <div id="eduLbWrap"></div>`;

  panel.querySelector('#s-ig').onclick = () => shareViaSheet('Instagram');
  panel.querySelector('#s-tt').onclick = () => shareViaSheet('TikTok');
  panel.querySelector('#s-native').onclick = () => shareViaSheet();
  panel.querySelector('#s-save').onclick = doSave;
  panel.querySelector('#s-copy').onclick = doCopy;
  panel.querySelector('#s-close').onclick = close;
  panel.querySelector('#eduRen').onclick = () => {
    const v = prompt(ja() ? '名前(14文字まで・任意)' : 'Name (up to 14 chars)', Save.data.name || '');
    if (v != null) { const nn = Save.setName(v); panel.querySelector('#eduNm').textContent = nn; }
  };

  overlay.classList.add('show');

  // スコアカード画像を生成(クリック前に完了させ、以降のクリックは同期のみで完結させる)
  try {
    const cv = buildCanvas({ ...data, name });
    panel.querySelector('#eduPrev').src = cv.toDataURL('image/png');
    curBlob = await new Promise(res => cv.toBlob(res, 'image/png'));
    if (curBlob) {
      curFile = new File([curBlob], 'emoji-drop-score.png', { type: 'image/png' });
      try { canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [curFile] })); } catch (e) { canShareFiles = false; }
      blobUrl = URL.createObjectURL(curBlob);
    }
  } catch (e) { curBlob = null; curFile = null; canShareFiles = false; }

  // デイリーはランキングを表示
  if (data.daily && Leaderboard.available) {
    const wrap = panel.querySelector('#eduLbWrap');
    wrap.innerHTML = `<div class="eduMuted">${ja() ? 'ランキング取得中…' : 'loading ranking…'}</div>`;
    const res = await Leaderboard.top(data.day);
    wrap.innerHTML = Leaderboard.available ? renderLeaderboard(res, name) : '';
  }
}

export function closeShare() { close(); }

// 共闘の招待リンクを共有する。クリックハンドラから同期的に呼べる。
// navigator.share が使えればアプリ選択(LINE/メッセージ等)、無ければリンクをコピー。
export function shareInvite(url, code) {
  const text = ja() ? `絵文字ドロップ ウルトラメイトで共闘しよう!あいことば: ${code}` : `Play EMOJI DROP ULTIMATE with me! Code: ${code}`;
  if (navigator.share) {
    navigator.share({ title: 'EMOJI DROP ULTIMATE', text, url })
      .catch(e => { if (!e || e.name !== 'AbortError') copyText(text + ' ' + url, ja() ? 'コピーしました' : 'Copied'); });
  } else {
    copyText(text + ' ' + url, ja() ? 'コピーしました' : 'Copied');
  }
}
