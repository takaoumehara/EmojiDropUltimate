// ============================================================
// weather.js — AI World Engine (Open-Meteo, キー不要)
//   現実の天気がゲームのルール(敵速度/湧き/落雷/夜/風…)を書き換える。
// ============================================================
import { clamp } from './config.js';
import { getLang } from './i18n.js';

export const Weather = {
  loaded: false, failed: false, place: '',
  temp: null, wind: 0, code: 0, isDay: 1, kind: 'clear',
  mods: { enemySpeed: 1, spawnMul: 1, scoreMul: 1, windLat: 0, lightning: false, fog: false, rain: false, snow: false, night: false },
  effects: [], // {ja, en}

  async load() {
    let lat = 35.68, lon = 139.76, place = getLang() === 'ja' ? '東京(既定)' : 'Tokyo (default)';
    try {
      const pos = await new Promise((res, rej) => {
        if (!navigator.geolocation) return rej();
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3500, maximumAge: 600000 });
      });
      lat = pos.coords.latitude; lon = pos.coords.longitude;
      place = `N${lat.toFixed(1)} E${lon.toFixed(1)}`;
    } catch (e) { /* 位置情報なし */ }
    this.place = place;
    // 都市名(キー不要の逆ジオコーディング)。失敗しても座標表示のまま続行。
    try {
      const gl = getLang() === 'ja' ? 'ja' : 'en';
      const gr = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${gl}`);
      const gj = await gr.json();
      const city = gj.city || gj.locality || gj.principalSubdivision;
      if (city) this.place = city;
    } catch (e) { /* 都市名なしでも動く */ }
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`, { signal: ctrl.signal });
      clearTimeout(to);
      const j = await r.json();
      const cw = j.current_weather;
      this.temp = cw.temperature; this.wind = cw.windspeed;
      this.code = cw.weathercode; this.isDay = cw.is_day;
      this.loaded = true;
    } catch (e) { this.failed = true; return; }
    this.applyMods();
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
