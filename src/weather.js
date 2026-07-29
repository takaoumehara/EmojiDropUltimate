// ============================================================
// weather.js — AI World Engine (Open-Meteo, キー不要)
//   現実の天気がゲームのルール(敵速度/湧き/落雷/夜/風…)を書き換える。
// ============================================================
import { clamp } from './config.js';
import { getLang } from './i18n.js';

// 端末の位置情報は一切使わない。
//   以前は navigator.geolocation で正確な座標を取り、第三者API2社へ送っていた。
//   子供が遊ぶゲームでそれは重すぎるので、**タイムゾーンから地域を推定**する方式にした。
//   タイムゾーンは端末内の設定で、外に送るのは「その都市の固定座標」だけ。
//   結果として許可ダイアログが消え、逆ジオコーディングのAPIも1社まるごと不要になった。
export const CITIES = [
  { id: 'tokyo',    tz: ['Asia/Tokyo'],                       lat: 35.68, lon: 139.76, ja: '東京',        en: 'Tokyo' },
  { id: 'osaka',    tz: [],                                   lat: 34.69, lon: 135.50, ja: '大阪',        en: 'Osaka' },
  { id: 'sapporo',  tz: [],                                   lat: 43.06, lon: 141.35, ja: '札幌',        en: 'Sapporo' },
  { id: 'okinawa',  tz: [],                                   lat: 26.21, lon: 127.68, ja: '沖縄',        en: 'Okinawa' },
  { id: 'seoul',    tz: ['Asia/Seoul'],                       lat: 37.57, lon: 126.98, ja: 'ソウル',      en: 'Seoul' },
  { id: 'taipei',   tz: ['Asia/Taipei'],                      lat: 25.03, lon: 121.57, ja: '台北',        en: 'Taipei' },
  { id: 'singapore',tz: ['Asia/Singapore', 'Asia/Kuala_Lumpur'], lat: 1.35, lon: 103.82, ja: 'シンガポール', en: 'Singapore' },
  { id: 'sydney',   tz: ['Australia/Sydney', 'Australia/Melbourne'], lat: -33.87, lon: 151.21, ja: 'シドニー', en: 'Sydney' },
  { id: 'sf',       tz: ['America/Los_Angeles', 'America/Vancouver'], lat: 37.77, lon: -122.42, ja: 'サンフランシスコ', en: 'San Francisco' },
  { id: 'newyork',  tz: ['America/New_York', 'America/Toronto'], lat: 40.71, lon: -74.01, ja: 'ニューヨーク', en: 'New York' },
  { id: 'london',   tz: ['Europe/London', 'Europe/Dublin'],   lat: 51.51, lon: -0.13,  ja: 'ロンドン',    en: 'London' },
  { id: 'paris',    tz: ['Europe/Paris', 'Europe/Berlin', 'Europe/Madrid'], lat: 48.86, lon: 2.35, ja: 'パリ', en: 'Paris' },
];

function savedCity() {
  try { return localStorage.getItem('edu_city') || ''; } catch (e) { return ''; }
}
export function setCity(id) {
  try { localStorage.setItem('edu_city', id); } catch (e) { /* 保存できなくても動く */ }
}
// タイムゾーンから地域を当てる。当たらなければ東京。位置情報の許可は一切求めない。
export function pickCity() {
  const saved = savedCity();
  const byId = CITIES.find(c => c.id === saved);
  if (byId) return byId;
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* 取れない環境 */ }
  return CITIES.find(c => c.tz.includes(tz)) || CITIES[0];
}

export const Weather = {
  loaded: false, failed: false, place: '', city: null,
  temp: null, wind: 0, code: 0, isDay: 1, kind: 'clear',
  mods: { enemySpeed: 1, spawnMul: 1, scoreMul: 1, windLat: 0, lightning: false, fog: false, rain: false, snow: false, night: false },
  effects: [], // {ja, en}

  async load() {
    const city = pickCity();
    this.city = city;
    this.place = getLang() === 'ja' ? city.ja : city.en;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current_weather=true`, { signal: ctrl.signal });
      clearTimeout(to);
      const j = await r.json();
      const cw = j.current_weather;
      this.temp = cw.temperature; this.wind = cw.windspeed;
      this.code = cw.weathercode; this.isDay = cw.is_day;
      this.loaded = true;
    } catch (e) { this.failed = true; return; }
    this.applyMods();
  },

  // 設定から地域を変えたとき: 効果を作り直す
  async reload() {
    this.loaded = false; this.failed = false; this.effects = [];
    this.mods = { enemySpeed: 1, spawnMul: 1, scoreMul: 1, windLat: 0, lightning: false, fog: false, rain: false, snow: false, night: false };
    await this.load();
  },

  applyMods() {
    const c = this.code, m = this.mods, fx = this.effects;
    const add = (ja, en) => fx.push({ ja, en });
    if (c >= 95) { this.kind = 'thunder'; m.lightning = true; m.rain = true; add('⛈️ 雷雨 → 落雷が敵を焼く!', '⛈️ Storm → lightning fries enemies!'); }
    else if (c >= 71 && c <= 86 && !(c >= 80 && c <= 82)) { this.kind = 'snow'; m.snow = true; m.enemySpeed *= 0.9; add('❄️ 雪 → 敵が凍えて減速', '❄️ Snow → enemies slowed'); }
    else if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) { this.kind = 'rain'; m.rain = true; m.spawnMul *= 1.1; add('🌧️ 雨 → 敵が活性化', '🌧️ Rain → enemies more active'); }
    else if (c === 45 || c === 48) { this.kind = 'fog'; m.fog = true; m.scoreMul *= 1.25; add('🌫️ 霧 → 視界不良・スコア+25%', '🌫️ Fog → low visibility, +25% score'); }
    else if (c >= 1 && c <= 3) { this.kind = 'clouds'; add('⛅ くもり → 平常運転', '⛅ Cloudy → standard mode'); }
    else { this.kind = 'clear'; add('☀️ 快晴 → ベル出現アップ', '☀️ Clear → more bells'); }
    if (this.wind >= 15) { m.windLat = clamp((this.wind - 10) * 4, 0, 130); add(`💨 強風${Math.round(this.wind)}km/h → 弾が流される`, `💨 Wind ${Math.round(this.wind)}km/h → shots drift`); }
    if (this.temp !== null && this.temp >= 32) { m.enemySpeed *= 1.12; add('🥵 猛暑 → 敵がヒートアップ', '🥵 Heat → enemies fired up'); }
    if (this.temp !== null && this.temp <= 0) { m.enemySpeed *= 0.88; add('🥶 氷点下 → 敵がスローダウン', '🥶 Freezing → enemies sluggish'); }
    if (!this.isDay) { m.night = true; m.scoreMul *= 1.2; add('🌙 夜 → ナイトモード・スコア+20%', '🌙 Night → night mode, +20% score'); }
  },

  icon() { return ({ clear: '☀️', clouds: '⛅', fog: '🌫️', rain: '🌧️', snow: '❄️', thunder: '⛈️' })[this.kind] || '☀️'; },
  conditionLabel() {
    const ja = getLang() === 'ja';
    const m = { clear: ['快晴', 'Clear'], clouds: ['くもり', 'Cloudy'], fog: ['霧', 'Fog'], rain: ['雨', 'Rain'], snow: ['雪', 'Snow'], thunder: ['雷雨', 'Storm'] };
    const p = m[this.kind] || m.clear; return ja ? p[0] : p[1];
  },

  statusLine() {
    const ja = getLang() === 'ja';
    if (this.failed) return ja ? '📡 天気オフライン → 標準モード' : '📡 Weather offline → standard';
    if (!this.loaded) return ja ? '📡 天気データ受信中…' : '📡 fetching weather…';
    return `${this.icon()} ${this.place} ${Math.round(this.temp)}°C ${ja ? '風' : 'wind'}${Math.round(this.wind)}km/h ${this.isDay ? '☀' : '🌙'}`;
  },

  // AIステージ生成のテーマ用サマリ
  summary() {
    if (!this.loaded) return 'clear sky, mild';
    return `${this.kind}, ${Math.round(this.temp)}C, wind ${Math.round(this.wind)}km/h, ${this.isDay ? 'daytime' : 'night'}`;
  },
};
