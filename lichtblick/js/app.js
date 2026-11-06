// The app's state: the spots, their forecasts, and the opportunities computed from them.
import { SPOTS } from '../data/spots.js';
import { HORIZONS } from '../data/horizons.js';
import { SKY } from '../data/sky.js';
import { measureSky, browserTile } from './lightpollution.js';
import { CH_OUTLINE } from '../data/ch-outline.js';
import { forecast, gridForecast } from './sources/meteoswiss.js';
import { kpForecast } from './sources/spaceweather.js';
import { horizonIfKnown } from './sources/swisstopo.js';
import { opportunitiesFor, makeContext, LOWLAND_REFS, topOpportunities } from './scoring.js';
import { insidePolygon, distance } from './geo.js';
import { mySpots, saveMySpots, hiddenSpots, favourites, setFavourites, settings, kvSet, getJSON, setJSON } from './store.js';
import { status, loadLocalPhotos, ago } from './ui.js';

const listeners = new Map();
export const App = {
  spots: [], byId: new Map(), fc: new Map(), refs: [], grid: null, kp: null,
  ops: [], opsBySpot: new Map(), updatedAt: null, loading: false, error: null, me: null,
  on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); },
  emit(ev, data) { for (const fn of listeners.get(ev) || []) { try { fn(data); } catch (e) { console.error(e); } } },
};

export async function loadSpots() {
  const hidden = hiddenSpots();
  const curated = SPOTS.filter((s) => !hidden.has(s.id)).map((s) => ({ ...s, curated: true, sky: SKY[s.id] || null, horizon: HORIZONS[s.id] ? { alts: HORIZONS[s.id].alts } : null }));
  const mine = await Promise.all(mySpots().map(async (s) => ({ ...s, mine: true, horizon: await horizonIfKnown(s) })));
  App.spots = [...mine, ...(settings().showCurated ? curated : [])];
  App.byId = new Map([...App.spots, ...curated].map((s) => [s.id, s]));
  await loadLocalPhotos(mine);
  // your own spots: measure the sky darkness once, in the background
  for (const s of mine.filter((x) => !x.sky)) measureSky(s, browserTile).then((sky) => { updateMySpot(s.id, { sky }); s.sky = sky; }).catch(() => {});
  // the service worker reads this copy for background checks
  kvSet('mirror:spots', mine.map(({ horizon, ...s }) => s));
  App.emit('spots');
}
export const spotById = (id) => App.byId.get(id);

export function addMySpot(spot) {
  const list = mySpots();
  list.unshift(spot);
  saveMySpots(list);
  const fav = favourites(); fav.add(spot.id); setFavourites(fav);
}
export function updateMySpot(id, patch) {
  saveMySpots(mySpots().map((s) => (s.id === id ? { ...s, ...patch } : s)));
}
export function deleteMySpot(id) { saveMySpots(mySpots().filter((s) => s.id !== id)); }

// the forecast grid for the map and for "is the horizon toward the sun clear?"
export function gridCells() {
  const cells = [];
  for (let lat = 45.86; lat <= 47.8; lat += 0.16) for (let lon = 6.0; lon <= 10.5; lon += 0.22) {
    if (insidePolygon(lat, lon, CH_OUTLINE)) cells.push({ lat: +lat.toFixed(3), lon: +lon.toFixed(3) });
  }
  return cells;
}

export async function refresh({ force = false } = {}) {
  if (App.loading) return;
  App.loading = true; App.error = null; App.emit('loading', true);
  status('MeteoSwiss forecast…');
  try {
    const curated = App.spots.filter((s) => s.curated), mine = App.spots.filter((s) => !s.curated);
    const pts = [...curated, ...LOWLAND_REFS].map((s) => ({ lat: s.lat, lon: s.lon, elev: s.elev }));
    const [main, own] = await Promise.all([forecast(pts, { force }), mine.length ? forecast(mine.map((s) => ({ lat: s.lat, lon: s.lon, elev: s.elev })), { force }) : []]);
    curated.forEach((s, i) => App.fc.set(s.id, main[i]));
    mine.forEach((s, i) => App.fc.set(s.id, own[i]));
    App.refs = LOWLAND_REFS.map((r, i) => ({ ...r, fc: main[curated.length + i] }));
    App.updatedAt = Math.min(...main.map((m) => m.fetchedAt));
    const stale = main.some((m) => m.stale);
    status('Map grid & space weather…');
    const cells = gridCells();
    const [g, kp] = await Promise.allSettled([gridForecast(cells, { force }), kpForecast()]);
    if (g.status === 'fulfilled') App.grid = { cells, series: g.value.data, at: g.value.at };
    if (kp.status === 'fulfilled') App.kp = kp.value;
    await score();
    status(stale ? `Offline · forecast from ${ago(App.updatedAt)}` : `MeteoSwiss · ${ago(App.updatedAt)}`);
  } catch (e) {
    console.error(e);
    App.error = e;
    status(navigator.onLine === false ? 'Offline' : 'Forecast not available');
    App.emit('error', e);
  } finally {
    App.loading = false; App.emit('loading', false);
  }
}

export async function score() {
  const ctx = makeContext({ now: new Date(), refs: App.refs, grid: App.grid, kp: App.kp });
  const all = [], bySpot = new Map();
  let n = 0;
  for (const s of App.spots) {
    const fc = App.fc.get(s.id);
    if (!fc) continue;
    const ops = opportunitiesFor(s, fc, ctx);
    bySpot.set(s.id, ops); all.push(...ops);
    if (++n % 5 === 0) await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
  }
  App.ops = all.sort((a, b) => b.score - a.score);
  App.opsBySpot = bySpot;
  App.ctx = ctx;
  App.emit('ops');
  notifyNew();
}

export const feedOps = (opts) => topOpportunities(App.ops, opts);

// best opportunity of a spot in the next days (for lists and pins)
export function bestFor(spotId, from = Date.now(), to = Infinity) {
  const ops = App.opsBySpot.get(spotId) || [];
  return ops.filter((o) => o.end >= from && o.start <= to).sort((a, b) => b.score - a.score)[0] || null;
}

export function sortByDistance(list) {
  if (!App.me) return list;
  return [...list].sort((a, b) => distance(App.me, a) - distance(App.me, b));
}

// ---- notifications: new great opportunities since last time ----
async function notifyNew() {
  const st = settings();
  if (!st.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const fav = favourites();
  const seen = new Set(getJSON('lb.notified', []));
  const fresh = feedOps({ min: st.alertMin }).filter((o) => (!st.alertFavsOnly || fav.has(o.spotId)) && (!st.alertTypes || st.alertTypes.includes(o.type)))
    .filter((o) => !seen.has(opKey(o))).slice(0, 3);
  if (!fresh.length) return;
  const reg = await navigator.serviceWorker?.getRegistration();
  for (const o of fresh) {
    const s = spotById(o.spotId);
    const body = `${s ? s.name : ''} · ${new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' }).format(o.peak)} · score ${o.score}`;
    try {
      if (reg) await reg.showNotification(o.title, { body, tag: opKey(o), icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { spot: o.spotId } });
      else new Notification(o.title, { body, icon: 'icons/icon-192.png' });
    } catch { /* not allowed here */ }
    seen.add(opKey(o));
  }
  setJSON('lb.notified', [...seen].slice(-300));
}
export const opKey = (o) => `${o.spotId}:${o.type}:${Math.round(o.peak / 3600e3)}`;
