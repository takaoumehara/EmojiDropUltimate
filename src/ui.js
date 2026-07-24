// ============================================================
// ui.js — 共有パネル(HTMLオーバーレイ)
//   スコアカード画像 + 各SNSシェア(X/LINE/Facebook/Instagram/TikTok/ネイティブ)
//   + スクリーンネーム編集 + デイリーランキング表示。
// ============================================================
import { buildCanvas, summaryText, SHARE_URL } from './sharecard.js';
import { getLang, t } from './i18n.js';
import { Save } from './save.js';
import { Leaderboard } from './leaderboard.js';

let overlay = null, blobUrl = null, curBlob = null, curData = null;

function ja() { return getLang() === 'ja'; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function ensure() {
  if (overlay) return;
  const css = document.createElement('style');
  css.textContent = `
  #eduOv{position:fixed;inset:0;z-index:40;display:none;background:rgba(4,4,14,.82);backdrop-filter:blur(3px);align-items:center;justify-content:center;padding:14px;overflow:auto;font-family:'Baloo 2','M PLUS Rounded 1c',system-ui,sans-serif}
  #eduOv.show{display:flex}
  #eduPanel{width:min(420px,94vw);background:linear-gradient(180deg,#141433,#0d0d22);border:2px solid #34346a;border-radius:18px;padding:16px;color:#fff;box-shadow:0 12px 50px rgba(0,0,0,.6)}
  #eduPanel h3{font-size:17px;font-weight:800;text-align:center;margin-bottom:8px;color:#ffe94d}
  #eduPrev{display:block;width:56%;max-width:220px;margin:2px auto 10px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.5)}
  .eduName{display:flex;gap:6px;align-items:center;justify-content:center;margin-bottom:12px;font-size:14px;color:#cfe8ff}
  .eduName b{color:#fff}
  .eduBtns{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .eduBtn{appearance:none;border:0;border-radius:12px;padding:11px 6px;font-size:13px;font-weight:800;color:#fff;cursor:pointer;font-family:inherit;line-height:1.15}
  .eduBtn:active{transform:scale(.96)}
  .b-x{background:#000;border:1px solid #444} .b-line{background:#06c755} .b-fb{background:#1877f2}
  .b-ig{background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)} .b-tt{background:#111;border:1px solid #444}
  .b-native{background:#6d3bd6} .b-save{background:#2b7a5b} .b-copy{background:#3a3f66}
  .eduWide{grid-column:1/-1}
  .eduClose{margin-top:12px;width:100%;background:#22223f;color:#aab;border:0;border-radius:12px;padding:11px;font-weight:800;cursor:pointer;font-family:inherit}
  .eduLb{margin-top:14px;border-top:1px solid #34346a;padding-top:10px}
  .eduLb h4{font-size:13px;color:#ffd23f;text-align:center;margin-bottom:6px}
  .eduRow{display:flex;justify-content:space-between;font-size:13px;padding:3px 6px;border-radius:6px;color:#cfe8ff}
  .eduRow.me{background:rgba(255,210,63,.16);color:#fff;font-weight:800}
  .eduRow .rk{width:26px;color:#8899bb} .eduMuted{font-size:11px;color:#8899bb;text-align:center;margin-top:6px}
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
  el.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:60;background:#000c;color:#fff;padding:10px 16px;border-radius:20px;font-family:inherit;font-weight:700;font-size:13px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

async function nativeOrSave(appName) {
  const text = summaryText(curData) + ' ' + curData.url;
  if (curBlob && navigator.canShare) {
    try {
      const file = new File([curBlob], 'emoji-drop.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text, title: 'EMOJI DROP ULTIMATE' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  saveImage();
  toast(ja() ? `画像を保存しました。${appName || 'アプリ'}で投稿してね` : `Image saved — post it on ${appName || 'the app'}`);
}
function saveImage() {
  if (!curBlob) return;
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(curBlob);
  const a = document.createElement('a'); a.href = blobUrl; a.download = 'emoji-drop-score.png';
  document.body.appendChild(a); a.click(); a.remove();
}
function openIntent(url) {
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (!w) location.href = url; // ポップアップがブロックされたら同タブで遷移
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
  const panel = overlay.querySelector('#eduPanel');
  const name = Save.name();
  const text = encodeURIComponent(summaryText(data));
  const url = encodeURIComponent(curData.url);
  const xUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
  const lineUrl = `https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`;
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`;

  panel.innerHTML = `
    <h3>${ja() ? '📸 スコアを共有' : '📸 Share your score'}</h3>
    <img id="eduPrev" alt="score card"/>
    <div class="eduName">${ja() ? '名前' : 'Name'}: <b id="eduNm">${esc(name)}</b> <button class="eduBtn b-copy" id="eduRen" style="padding:5px 10px;font-size:12px">${ja() ? '変更' : 'Edit'}</button></div>
    <div class="eduBtns">
      <button class="eduBtn b-x" id="s-x">𝕏</button>
      <button class="eduBtn b-line" id="s-line">LINE</button>
      <button class="eduBtn b-fb" id="s-fb">Facebook</button>
      <button class="eduBtn b-ig" id="s-ig">Instagram</button>
      <button class="eduBtn b-tt" id="s-tt">TikTok</button>
      <button class="eduBtn b-native" id="s-native">${ja() ? 'その他' : 'More'}</button>
      <button class="eduBtn b-save eduWide" id="s-save">${ja() ? '🖼 画像を保存' : '🖼 Save image'}</button>
      <button class="eduBtn b-copy eduWide" id="s-copy">${ja() ? '🔗 リンクをコピー' : '🔗 Copy link'}</button>
    </div>
    <div id="eduLbWrap"></div>
    <button class="eduClose" id="s-close">${ja() ? '閉じる' : 'Close'}</button>`;

  // プレビュー画像
  try {
    const cv = buildCanvas({ ...data, name });
    curBlob = await new Promise(res => cv.toBlob(res, 'image/png'));
    panel.querySelector('#eduPrev').src = cv.toDataURL('image/png');
  } catch (e) { curBlob = null; }

  panel.querySelector('#s-x').onclick = () => openIntent(xUrl);
  panel.querySelector('#s-line').onclick = () => openIntent(lineUrl);
  panel.querySelector('#s-fb').onclick = () => openIntent(fbUrl);
  panel.querySelector('#s-ig').onclick = () => nativeOrSave('Instagram');
  panel.querySelector('#s-tt').onclick = () => nativeOrSave('TikTok');
  panel.querySelector('#s-native').onclick = () => nativeOrSave();
  panel.querySelector('#s-save').onclick = saveImage;
  panel.querySelector('#s-copy').onclick = async () => { try { await navigator.clipboard.writeText(summaryText(data) + ' ' + curData.url); toast(ja() ? 'コピーしました' : 'Copied'); } catch (e) { toast('URL: ' + curData.url); } };
  panel.querySelector('#s-close').onclick = close;
  panel.querySelector('#eduRen').onclick = () => {
    const v = prompt(ja() ? '名前(14文字まで・任意)' : 'Name (up to 14 chars)', Save.data.name || '');
    if (v != null) { const nn = Save.setName(v); panel.querySelector('#eduNm').textContent = nn; }
  };

  // デイリーはランキングを表示
  if (data.daily && Leaderboard.available) {
    const wrap = panel.querySelector('#eduLbWrap');
    wrap.innerHTML = `<div class="eduMuted">${ja() ? 'ランキング取得中…' : 'loading ranking…'}</div>`;
    const res = await Leaderboard.top(data.day);
    wrap.innerHTML = Leaderboard.available ? renderLeaderboard(res, name) : '';
  }

  overlay.classList.add('show');
}

export function closeShare() { close(); }
