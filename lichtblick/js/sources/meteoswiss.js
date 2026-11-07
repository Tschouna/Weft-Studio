// MeteoSwiss weather.
//
// Forecasts: MeteoSwiss's own numerical models ICON-CH1-EPS (1 km, 33 h) and ICON-CH2-EPS (2 km, 5 days),
// "meteoswiss_icon_seamless". MeteoSwiss publishes them as open data only as GRIB files of the whole
// country (hundreds of MB), far too big for a phone, so the app reads them point by point through
// Open-Meteo's free API, which mirrors the MeteoSwiss open data (CC BY 4.0) unchanged.
//
// Live measurements: straight from MeteoSwiss on data.geo.admin.ch (SwissMetNet, every 10 minutes),
// and the MeteoSwiss weather cameras.
import { cached } from '../store.js';
import { lv95ToWgs } from '../geo.js';

const OM = 'https://api.open-meteo.com/v1/forecast';
export const MODEL = 'meteoswiss_icon_seamless';

// what each name means in the series objects the rest of the app uses
const VARS = {
  temp: 'temperature_2m', rh: 'relative_humidity_2m', dew: 'dew_point_2m',
  precip: 'precipitation', pop: 'precipitation_probability', snow: 'snowfall', snowDepth: 'snow_depth',
  code: 'weather_code', cloud: 'cloud_cover', low: 'cloud_cover_low', mid: 'cloud_cover_mid', high: 'cloud_cover_high',
  wind: 'wind_speed_10m', windDir: 'wind_direction_10m', gust: 'wind_gusts_10m',
  cape: 'cape', freezing: 'freezing_level_height', sun: 'sunshine_duration', vis: 'visibility', pressure: 'pressure_msl',
};
// the minimum that every model run has, if the full request is refused
const CORE = ['temp', 'rh', 'dew', 'precip', 'snow', 'code', 'cloud', 'low', 'mid', 'high', 'wind', 'windDir', 'gust', 'sun'];
const GRID_VARS = ['cloud', 'low', 'mid', 'high', 'precip', 'sun', 'wind', 'code', 'temp'];

function normalise(loc, keys) {
  const h = loc.hourly || {};
  const s = { t: (h.time || []).map((x) => x * 1000), lat: loc.latitude, lon: loc.longitude, elev: loc.elevation };
  for (const k of keys) s[k] = (h[VARS[k]] || []).map((v) => (v == null ? null : v));
  return s;
}

async function omFetch(points, keys, { pastDays = 2, days = 5 } = {}) {
  const q = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    hourly: keys.map((k) => VARS[k]).join(','),
    models: MODEL, timeformat: 'unixtime', timezone: 'GMT',
    past_days: String(pastDays), forecast_days: String(days),
  });
  if (points.every((p) => Number.isFinite(p.elev))) q.set('elevation', points.map((p) => Math.round(p.elev)).join(','));
  const r = await fetch(`${OM}?${q}`);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.error) {
    const e = new Error((j && j.reason) || `forecast service answered ${r.status}`);
    e.status = r.status; throw e;
  }
  const list = Array.isArray(j) ? j : [j];
  return list.map((loc) => normalise(loc, keys));
}

// Hourly forecast for many points (spots). Batches of 40, cached for an hour per batch.
export async function forecast(points, { force = false } = {}) {
  const out = new Array(points.length);
  const batches = [];
  for (let i = 0; i < points.length; i += 40) batches.push(points.slice(i, i + 40).map((p, j) => ({ ...p, idx: i + j })));
  await Promise.all(batches.map(async (b) => {
    const key = `fc:${MODEL}:` + b.map((p) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)},${Math.round(p.elev || 0)}`).join(';');
    const res = await cached(key, 55 * 60e3, async () => {
      try { return await omFetch(b, Object.keys(VARS)); }
      catch (e) { if (e.status === 400) return omFetch(b, CORE); throw e; }
    }, { force });
    res.data.forEach((s, j) => { out[b[j].idx] = { ...s, fetchedAt: res.at, stale: res.stale }; });
  }));
  return out;
}

// A coarse grid over Switzerland for the "where is the good weather" map (about 18 km apart).
export async function gridForecast(cells, { force = false } = {}) {
  const res = await cached(`grid:${MODEL}:${cells.length}`, 90 * 60e3, async () => {
    const out = [];
    for (let i = 0; i < cells.length; i += 60) out.push(...(await omFetch(cells.slice(i, i + 60), GRID_VARS, { pastDays: 0, days: 5 })));
    return out;
  }, { force });
  return res;
}

// ---- live measurements (SwissMetNet, every 10 min) ----
export const LIVE = {
  temp: { layer: 'messwerte-lufttemperatur-10min', label: 'Temperature', unit: '°C' },
  rh: { layer: 'messwerte-luftfeuchtigkeit-10min', label: 'Humidity', unit: '%' },
  dew: { layer: 'messwerte-taupunkt-10min', label: 'Dew point', unit: '°C' },
  wind: { layer: 'messwerte-windgeschwindigkeit-kmh-10min', label: 'Wind', unit: 'km/h' },
  gust: { layer: 'messwerte-wind-boeenspitze-kmh-10min', label: 'Gusts', unit: 'km/h' },
  sun: { layer: 'messwerte-sonnenscheindauer-10min', label: 'Sunshine (10 min)', unit: 'min' },
  foehn: { layer: 'messwerte-foehn-10min', label: 'Foehn', unit: '' },
  fresh: { layer: 'messwerte-neuschnee-1d', label: 'Fresh snow (24 h)', unit: 'cm' },
  snow: { layer: 'messwerte-gesamtschnee-1d', label: 'Snow depth', unit: 'cm' },
  rain: { layer: 'messwerte-niederschlag-1h', label: 'Rain (1 h)', unit: 'mm' },
};
const GEO = 'https://data.geo.admin.ch/ch.meteoschweiz.';

export async function live(kind, { force = false } = {}) {
  const def = LIVE[kind];
  const res = await cached(`live:${kind}`, 9 * 60e3, async () => {
    const r = await fetch(`${GEO}${def.layer}/ch.meteoschweiz.${def.layer}_en.json`);
    if (!r.ok) throw new Error(`MeteoSwiss answered ${r.status}`);
    const j = await r.json();
    return (j.features || []).map((f) => {
      const [e, n] = f.geometry.coordinates, p = f.properties || {}, w = lv95ToWgs(e, n);
      return { id: f.id, name: p.station_name, lat: w.lat, lon: w.lon, alt: parseFloat(p.altitude), value: p.value, dir: p.wind_direction, at: p.reference_ts };
    }).filter((s) => s.value != null && s.value !== '' && Number.isFinite(+s.value));
  }, { force });
  return res.data;
}

export async function webcams() {
  const res = await cached('live:webcams', 6 * 3600e3, async () => {
    const r = await fetch(`${GEO}messnetz-webcams/ch.meteoschweiz.messnetz-webcams_en.json`);
    if (!r.ok) throw new Error(`MeteoSwiss answered ${r.status}`);
    const j = await r.json();
    return (j.features || []).map((f) => {
      const [e, n] = f.geometry.coordinates, p = f.properties || {}, w = lv95ToWgs(e, n);
      const img = ((p.description || '').match(/<img[^>]+src="([^"]+)"/) || [])[1] || null;
      return { id: f.id, name: p.station_name, lat: w.lat, lon: w.lon, alt: parseFloat(p.altitude), thumb: img,
        page: `https://www.meteoswiss.admin.ch/services-and-publications/applications/measurement-values-and-measuring-networks.html#param=messnetz-webcams&station=${f.id}` };
    });
  });
  return res.data;
}

// MeteoSwiss weather codes as used by the model output (WMO): a short word and an icon name
export function weatherWord(code) {
  if (code == null) return '';
  if (code >= 95) return 'Thunderstorm';
  if (code >= 85) return 'Snow showers';
  if (code >= 80) return 'Showers';
  if (code >= 71) return 'Snow';
  if (code >= 66) return 'Freezing rain';
  if (code >= 61) return 'Rain';
  if (code >= 51) return 'Drizzle';
  if (code >= 45) return 'Fog';
  if (code === 3) return 'Overcast';
  if (code === 2) return 'Partly cloudy';
  if (code === 1) return 'Mostly clear';
  return 'Clear';
}
