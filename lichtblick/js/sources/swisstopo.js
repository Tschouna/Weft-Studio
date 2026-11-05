// swisstopo: the place search, heights, and the real mountain horizon round a spot (from the
// elevation profile service), so the app knows when the sun or the Milky Way clears the ridge.
// All of it is open data from api3.geo.admin.ch and allows requests from any page.
import { lv95ToWgs, wgsToLv95 } from '../geo.js';
import { cached } from '../store.js';

const API = 'https://api3.geo.admin.ch/rest/services';
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const RANK = [
  [/\b(peak|summit|gipfel|massif|mountain|hill|ridge|rock|lake|see|glacier|pass|valley|gorge|waterfall)\b/i, 0],
  [/^gg25$|^zipcode$|^TLM_SIEDLUNGSNAME$|^TLM_NAME_PKT$|populated|village|town/i, 1],
  [/^TLM_GELAENDENAME$|^TLM_GEBIETSNAME$|^TLM_FLURNAME$|^TLM_STEHENDES_GEWAESSER$/i, 2],
  [/kanton|district|canton/i, 3],
  [/^address$/i, 8],
  [/bahn|haltestelle|gebaeude|strasse|freizeit|nutzungsareal|parkplatz|lift|transport|building|road|bus|train|campground|golf|plant/i, 9],
];
const rankOf = (r) => { for (const [re, k] of RANK) if (re.test(r.type) || re.test(r.kind)) return k; return 5; };

// A place name, or coordinates ("46.5, 7.9" or LV95 "2617050 1091670"). Returns [{ name, where, type, lat, lon }]
export async function searchPlaces(text) {
  const q = String(text || '').trim();
  const nums = q.match(/-?\d+(?:\.\d+)?/g);
  if (nums && nums.length === 2 && /^[\s\d.,'°NSEOW-]+$/i.test(q)) {
    const [a, b] = nums.map(Number);
    if (a > 2400000 && b > 1000000) return [{ name: `E ${Math.round(a)} · N ${Math.round(b)}`, where: 'Coordinates', ...lv95ToWgs(a, b) }];
    if (b > 2400000 && a > 1000000) return [{ name: `E ${Math.round(b)} · N ${Math.round(a)}`, where: 'Coordinates', ...lv95ToWgs(b, a) }];
    const [lat, lon] = a > b ? [a, b] : [b, a];
    if (lat > 45 && lat < 48.5 && lon > 5 && lon < 11.5) return [{ name: `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`, where: 'Coordinates', lat, lon }];
  }
  if (q.length < 2) return [];
  const r = await fetch(`${API}/api/SearchServer?searchText=${encodeURIComponent(q)}&type=locations&sr=2056&limit=30&lang=en`);
  if (!r.ok) throw new Error(`swisstopo search answered ${r.status}`);
  const j = await r.json();
  const hits = [];
  for (const x of j.results || []) {
    const a = x.attrs || {}, raw = String(a.label || '');
    const type = strip((raw.match(/<i>([\s\S]*?)<\/i>/) || [])[1]) || a.origin || '';
    const name = strip((raw.match(/<b>([\s\S]*?)<\/b>/) || [])[1] || raw).replace(/\|/g, ' / ');
    let where = strip(raw.replace(/<i>[\s\S]*?<\/i>|<b>[\s\S]*?<\/b>/g, ''));
    const m = where.match(/^\(([^)]*)\)\s*-?\s*(.*)$/);
    if (m) where = [m[2], m[1]].filter(Boolean).join(', ');
    const e = +a.y, n = +a.x; // the service names the axes the Swiss way: y is east, x is north
    if (Number.isFinite(e) && Number.isFinite(n) && e > 2400000 && n > 1000000) hits.push({ name, type, where, kind: a.objectclass || a.origin || '', ...lv95ToWgs(e, n) });
  }
  const want = q.toLowerCase();
  const sorted = hits.map((p, i) => ({ p, i, rank: rankOf(p), exact: p.name.toLowerCase() === want ? 0 : 1 }))
    .sort((a, b) => a.exact - b.exact || a.rank - b.rank || a.i - b.i).map((x) => x.p);
  const out = [];
  for (const p of sorted) if (!out.some((o) => o.name === p.name && Math.abs(o.lat - p.lat) < 0.004 && Math.abs(o.lon - p.lon) < 0.006)) out.push(p);
  return out.slice(0, 12);
}

export async function height(lat, lon) {
  const { e, n } = wgsToLv95(lat, lon);
  const r = await fetch(`${API}/height?easting=${e.toFixed(1)}&northing=${n.toFixed(1)}&sr=2056`);
  if (!r.ok) throw new Error(`swisstopo height answered ${r.status}`);
  const h = parseFloat((await r.json()).height);
  return Number.isFinite(h) ? h : null;
}

async function profile(e0, n0, e1, n1, points) {
  const geom = JSON.stringify({ type: 'LineString', coordinates: [[Math.round(e0), Math.round(n0)], [Math.round(e1), Math.round(n1)]] });
  const r = await fetch(`${API}/profile.json?geom=${encodeURIComponent(geom)}&sr=2056&nb_points=${points}`);
  if (!r.ok) throw new Error(`swisstopo profile answered ${r.status}`);
  return r.json();
}

// The terrain horizon: for every few degrees of azimuth, how many degrees above the flat horizon the
// mountains reach, looking out to 60 km (with the Earth's curve and normal refraction).
// Swiss terrain data only, so across the border far peaks may be missing.
export async function computeHorizon(spot, { rays = 72, onProgress } = {}) {
  const { e, n } = wgsToLv95(spot.lat, spot.lon);
  const h0 = (Number.isFinite(spot.elev) ? spot.elev : (await height(spot.lat, spot.lon)) || 500) + 1.7;
  const alts = new Array(rays).fill(0), far = new Array(rays).fill(0);
  const jobs = [];
  for (let i = 0; i < rays; i++) for (const [d0, d1, pts] of [[0, 4000, 100], [4000, 60000, 220]]) jobs.push({ i, d0, d1, pts });
  let done = 0;
  const K = (1 - 0.13) / (2 * 6371000);
  const worker = async () => {
    while (jobs.length) {
      const { i, d0, d1, pts } = jobs.shift();
      const az = (i * 360) / rays, sx = Math.sin((az * Math.PI) / 180), cy = Math.cos((az * Math.PI) / 180);
      let prof = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        try { prof = await profile(e + sx * d0, n + cy * d0, e + sx * d1, n + cy * d1, pts); break; } catch { await new Promise((r) => setTimeout(r, 600 * (attempt + 1))); }
      }
      for (const p of prof) {
        const d = d0 + (p.dist || 0), z = p.alts && (p.alts.COMB ?? p.alts.DTM25 ?? p.alts.DTM2);
        // ignore the first 150 m: a GPS position a few metres off next to a slope would fake a wall
        if (d < 150 || z == null) continue;
        const ang = (Math.atan2(z - h0 - d * d * K, d) * 180) / Math.PI;
        if (ang > alts[i]) { alts[i] = ang; far[i] = d; }
      }
      done++;
      if (onProgress) onProgress(done / (rays * 2));
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { alts: alts.map((a) => Math.round(a * 10) / 10), dist: far.map((d) => Math.round(d / 100) / 10), h0: Math.round(h0), at: Date.now() };
}

export async function horizonFor(spot, opts = {}) {
  if (spot.horizon) return spot.horizon;
  const key = `hz:${spot.lat.toFixed(4)},${spot.lon.toFixed(4)}`;
  const res = await cached(key, 365 * 864e5, () => computeHorizon(spot, opts), opts);
  return res.data;
}
export async function horizonIfKnown(spot) {
  if (spot.horizon) return spot.horizon;
  const { kvGet } = await import('../store.js');
  const hit = await kvGet(`hz:${spot.lat.toFixed(4)},${spot.lon.toFixed(4)}`);
  return hit ? hit.data : null;
}

// swisstopo map tiles in Web Mercator for Leaflet
export const WMTS = (layer, ext = 'jpeg') => `https://wmts.geo.admin.ch/1.0.0/${layer}/default/current/3857/{z}/{x}/{y}.${ext}`;
