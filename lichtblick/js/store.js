// Where things are kept on the phone. Settings and your own spots in localStorage (small, instant);
// forecasts, horizons and photos in IndexedDB (bigger). Everything stays on the device.

const LS = typeof localStorage !== 'undefined' ? localStorage : null;
const mem = new Map();

export function getJSON(key, fallback) {
  try { const v = LS ? LS.getItem(key) : mem.get(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function setJSON(key, value) {
  const s = JSON.stringify(value);
  try { LS ? LS.setItem(key, s) : mem.set(key, s); } catch { /* quota: forget it */ }
}

// ---- tiny IndexedDB key-value store ----
let dbp = null;
function db() {
  if (typeof indexedDB === 'undefined') return null;
  if (!dbp) {
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open('lichtblick', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }).catch(() => null);
  }
  return dbp;
}
const memKV = new Map();
export async function kvGet(key) {
  const d = await db();
  if (!d) return memKV.get(key);
  return new Promise((res) => {
    const r = d.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(undefined);
  });
}
export async function kvSet(key, value) {
  const d = await db();
  if (!d) { memKV.set(key, value); return; }
  return new Promise((res) => {
    const tx = d.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}
export async function kvDel(key) {
  const d = await db();
  if (!d) { memKV.delete(key); return; }
  return new Promise((res) => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(key); tx.oncomplete = () => res(); tx.onerror = () => res(); });
}

// Fetch-through cache: returns { data, at, stale } and keeps the last good answer for offline use.
const inflight = new Map();
export async function cached(key, ttlMs, loader, { force = false } = {}) {
  const hit = await kvGet(key);
  if (!force && hit && Date.now() - hit.at < ttlMs) return { data: hit.data, at: hit.at, stale: false };
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const data = await loader();
      const rec = { data, at: Date.now() };
      await kvSet(key, rec);
      return { ...rec, stale: false };
    } catch (err) {
      if (hit) return { data: hit.data, at: hit.at, stale: true, error: err };
      throw err;
    } finally { inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

// ---- settings ----
const DEFAULTS = {
  meteoblueKey: '',
  meteoblueSeeing: 'auto', // 'auto' tries the Seeing package and falls back to the free packages
  alertMin: 75,            // notify about opportunities scoring at least this
  alertTypes: null,        // null = all
  notify: false,
  showCurated: true,
  home: null,              // { lat, lon, name } for distances
};
export const settings = () => ({ ...DEFAULTS, ...getJSON('lb.settings', {}) });
export const saveSettings = (patch) => setJSON('lb.settings', { ...settings(), ...patch });

// ---- your own spots ----
export const mySpots = () => getJSON('lb.spots', []);
export const saveMySpots = (list) => setJSON('lb.spots', list);
export const hiddenSpots = () => new Set(getJSON('lb.hidden', []));
export const setHidden = (set) => setJSON('lb.hidden', [...set]);
export const favourites = () => new Set(getJSON('lb.fav', []));
export const setFavourites = (set) => setJSON('lb.fav', [...set]);
