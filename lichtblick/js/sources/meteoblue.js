// meteoblue astronomy data for the night sky: seeing (arc seconds and meteoblue's seeing indices),
// jet stream, the "bad layer" of turbulence, cloud layers, visibility, fog and night-sky brightness.
//
// You need your own meteoblue API key (Settings). With a key that includes the Seeing package the app
// asks for  seeing-1h, clouds-1h and moonlight-1h. The free meteoblue key (10 million credits for a
// year) does not include Seeing; then it asks for clouds-3h only (8000 credits per call) and keeps the
// answer for three hours, so a year of normal use fits in the free credits.
import { cached, settings, saveSettings, getJSON, setJSON } from '../store.js';

const API = 'https://my.meteoblue.com/packages/';
const FULL = 'seeing-1h,clouds-1h,moonlight-1h';
const FREE = 'clouds-3h';
const COST = { [FULL]: 24000, [FREE]: 8000 }; // seeing-1h is not in meteoblue's public price list; estimate

export class MeteoblueError extends Error {}

async function call(pkg, spot, key) {
  const q = new URLSearchParams({
    lat: spot.lat.toFixed(4), lon: spot.lon.toFixed(4), apikey: key,
    format: 'json', timeformat: 'timestamp_utc', tz: 'utc', forecastDays: '3',
  });
  if (Number.isFinite(spot.elev)) q.set('asl', String(Math.round(spot.elev)));
  const r = await fetch(`${API}${pkg}?${q}`);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) {
    const e = new MeteoblueError((j && (j.error_message || j.message)) || `meteoblue answered ${r.status}`);
    e.status = r.status; throw e;
  }
  const used = getJSON('lb.mbCredits', { since: Date.now(), credits: 0, calls: 0 });
  setJSON('lb.mbCredits', { ...used, credits: used.credits + (COST[pkg] || 8000), calls: used.calls + 1 });
  return j;
}

const arr = (o, k) => (o && Array.isArray(o[k]) ? o[k] : []);

function normalise(j, tier) {
  const h = j.data_1h || j.data_3h || {};
  const s = {
    tier, step: j.data_1h ? 1 : 3,
    t: arr(h, 'time').map((x) => (typeof x === 'number' ? x * 1000 : Date.parse(x))),
    total: arr(h, 'totalcloudcover'), low: arr(h, 'lowclouds'), mid: arr(h, 'midclouds'), high: arr(h, 'highclouds'),
    vis: arr(h, 'visibility'), fog: arr(h, 'fog_probability'),
  };
  if (j.data_1h && j.data_1h.seeing_arcsec) {
    const d = j.data_1h;
    Object.assign(s, {
      seeing: arr(d, 'seeing_arcsec'), seeing1: arr(d, 'seeing1'), seeing2: arr(d, 'seeing2'),
      jet: arr(d, 'jetstream'), badBottom: arr(d, 'badlayer_bottom'), badTop: arr(d, 'badlayer_top'), badGrad: arr(d, 'badlayer_gradient'),
      sky: arr(d, 'nightskybrightness_actual'), moonlight: arr(d, 'moonlight_actual'),
    });
  }
  s.model = j.metadata && j.metadata.modelrun_utc;
  return s;
}

// The astro forecast for a spot, or null without a key. Cached for 3 hours per place.
export async function astroForecast(spot, { force = false } = {}) {
  const st = settings();
  const key = (st.meteoblueKey || '').trim();
  if (!key) return null;
  const where = `${spot.lat.toFixed(2)},${spot.lon.toFixed(2)}`;
  const res = await cached(`mb:${where}`, 3 * 3600e3, async () => {
    if (st.meteoblueSeeing !== 'no') {
      try {
        const j = await call(FULL, spot, key);
        if (st.meteoblueSeeing !== 'yes') saveSettings({ meteoblueSeeing: 'yes' });
        return normalise(j, 'seeing');
      } catch (e) {
        if (e.status === 401 && /not valid/i.test(e.message)) throw e; // wrong key: say so
        saveSettings({ meteoblueSeeing: 'no' }); // this key has no Seeing package: use the free one from now on
      }
    }
    return normalise(await call(FREE, spot, key), 'free');
  }, { force });
  return { ...res.data, fetchedAt: res.at, stale: res.stale };
}

export const creditsUsed = () => getJSON('lb.mbCredits', { since: Date.now(), credits: 0, calls: 0 });

// value at time t (nearest step), for series with 1 h or 3 h steps
export function at(series, key, t) {
  if (!series || !series.t.length || !series[key] || !series[key].length) return null;
  const step = series.step * 3600e3;
  let best = -1, bd = Infinity;
  for (let i = 0; i < series.t.length; i++) { const d = Math.abs(series.t[i] + (series.step === 3 ? step / 2 : 0) - t); if (d < bd) { bd = d; best = i; } }
  return bd <= step ? series[key][best] : null;
}

// a plain-language reading of the seeing
export function seeingWords(arcsec) {
  if (arcsec == null) return '';
  if (arcsec < 0.8) return 'excellent';
  if (arcsec < 1.2) return 'good';
  if (arcsec < 1.8) return 'average';
  if (arcsec < 2.5) return 'poor';
  return 'bad';
}

// meteoblue's own seeing page for the place (free to look at in the browser)
export const seeingPage = (spot) => `https://www.meteoblue.com/en/weather/outdoorsports/seeing/${spot.lat.toFixed(3)}N${spot.lon.toFixed(3)}E`;
