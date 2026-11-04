// Weft panels: fetching swissALTI3D straight from swisstopo. A place search (api3.geo.admin.ch) finds
// where; the STAC catalogue (data.geo.admin.ch) lists the 1 km tiles round it; the tiles download and
// go through dem.js like any loaded file; wms.geo.admin.ch draws the map for picking the area. All of it
// is open data and allows requests from any page.
import { readDEM, mosaicInto } from './dem.js';

const SEARCH = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';
const STAC = 'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissalti3d/items';
const WMS = 'https://wms.geo.admin.ch/';
const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// LV95 (Swiss grid, metres) to WGS84, swisstopo's approximate formulas: about a metre off, plenty for a search box.
export function lv95ToWgs(e, n) {
  const y = (e - 2600000) / 1e6, x = (n - 1200000) / 1e6;
  const lon = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const lat = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.014 * x * x * x;
  return [(lon * 100) / 36, (lat * 100) / 36];
}
// and back, for coordinates typed in degrees
export function wgsToLv95(lon, lat) {
  const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;
  const e = 2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l * l * l;
  const n = 1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p * p * p;
  return [e, n];
}

// How useful a search hit is for a landscape: summits and places first, cable cars and buildings last.
const RANK = [
  [/\b(peak|summit|gipfel|massif|mountain|hill|ridge|rock)\b/i, 0],
  [/^gg25$|^zipcode$|^TLM_SIEDLUNGSNAME$|^TLM_NAME_PKT$|populated|village|town/i, 1],
  [/glacier|lake|valley|pass|gorge|^TLM_GELAENDENAME$|^TLM_GEBIETSNAME$|^TLM_FLURNAME$|^TLM_STEHENDES_GEWAESSER$/i, 2],
  [/kanton|district|^gg25|canton/i, 3],
  [/^address$/i, 8],
  [/bahn|haltestelle|gebaeude|strasse|freizeit|nutzungsareal|parkplatz|lift|transport|building|road|bus|train|campground|golf|plant/i, 9],
];
const rankOf = (r) => { for (const [re, k] of RANK) if (re.test(r.type) || re.test(r.kind)) return k; return 5; };
const ORIGIN = { gg25: 'Municipality', zipcode: 'Postcode', address: 'Address', district: 'District', kantone: 'Canton', parcel: 'Parcel', TLM_SIEDLUNGSNAME: 'Place' };

// A place name, or coordinates: "2617050 1091670" (LV95) or "45.976, 7.658" (degrees).
export async function searchPlaces(text, fetchFn = fetch) {
  const q = String(text || '').trim();
  const nums = q.match(/-?\d+(?:\.\d+)?/g);
  if (nums && nums.length === 2 && /^[\s\d.,'°NSEOW-]+$/i.test(q)) {
    const [a, b] = nums.map(Number);
    const at = (label, e, n) => [{ name: label, type: 'Coordinates', where: '', label, kind: 'coordinates', e, n }];
    if (a > 2400000 && b > 1000000) return at(`E ${Math.round(a)} · N ${Math.round(b)}`, a, b);
    if (b > 2400000 && a > 1000000) return at(`E ${Math.round(b)} · N ${Math.round(a)}`, b, a);
    const [lat, lon] = a > b ? [a, b] : [b, a];
    if (lat > 45 && lat < 48.5 && lon > 5 && lon < 11.5) { const [e, n] = wgsToLv95(lon, lat); return at(`${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`, e, n); }
  }
  if (q.length < 2) return [];
  const url = `${SEARCH}?searchText=${encodeURIComponent(q)}&type=locations&sr=2056&limit=30&lang=en`;
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`swisstopo search answered ${r.status}`);
  const j = await r.json();
  const hits = [];
  for (const x of j.results || []) {
    const a = x.attrs || {}, raw = String(a.label || '');
    // labels look like "<i>Alpin peak</i> <b>Eiger</b> (BE) - Grindelwald"
    const type = strip((raw.match(/<i>([\s\S]*?)<\/i>/) || [])[1]) || ORIGIN[a.origin] || ORIGIN[a.objectclass] || '';
    const name = strip((raw.match(/<b>([\s\S]*?)<\/b>/) || [])[1] || raw).replace(/\|/g, ' / ');
    let where = strip(raw.replace(/<i>[\s\S]*?<\/i>|<b>[\s\S]*?<\/b>/g, ''));
    const m = where.match(/^\(([^)]*)\)\s*-?\s*(.*)$/);
    if (m) where = [m[2], m[1]].filter(Boolean).join(', ');
    // the service names the axes the Swiss way: y is east, x is north
    const p = { name, type, where, label: strip(raw), kind: a.objectclass || a.origin || '', e: +a.y, n: +a.x };
    if (Number.isFinite(p.e) && Number.isFinite(p.n) && p.e > 2400000 && p.n > 1000000) hits.push(p);
  }
  const want = q.toLowerCase();
  const sorted = hits.map((p, i) => ({ p, i, rank: rankOf(p), exact: p.name.toLowerCase().split(' / ').some((s) => s === want) ? 0 : 1 }))
    .sort((a, b) => a.rank - b.rank || a.exact - b.exact || a.i - b.i).map((x) => x.p);
  // the gazetteer lists one spot several times (the summit, its viewpoint, its cable car): keep the best
  const out = [];
  for (const p of sorted) if (!out.some((o) => o.name === p.name && Math.hypot(o.e - p.e, o.n - p.n) < 400)) out.push(p);
  return out;
}

// The rectangle (LV95 metres) round a centre: the long side in km, shaped like the panel (width : height).
export function areaRect(e, n, km, aspect = 1) {
  const L = km * 1000, w = aspect >= 1 ? L : L * aspect, h = aspect >= 1 ? L / aspect : L;
  return { e0: e - w / 2, e1: e + w / 2, n0: n - h / 2, n1: n + h / 2 };
}
// How many 1 km tiles a rectangle touches, and roughly how many megabytes one is (alpine tiles are the largest).
export const tilesFor = (r) => (Math.ceil(r.e1 / 1000) - Math.floor(r.e0 / 1000)) * (Math.ceil(r.n1 / 1000) - Math.floor(r.n0 / 1000));
export const TILE_MB = { 2: 1.2, 0.5: 18 };
// A picture of the national map round a rectangle, for the area picker.
export function mapURL(r, w, h) {
  const bbox = [r.e0, r.n0, r.e1, r.n1].map((v) => Math.round(v)).join(',');
  return `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ch.swisstopo.pixelkarte-farbe&STYLES=&CRS=EPSG:2056&BBOX=${bbox}&WIDTH=${Math.round(w)}&HEIGHT=${Math.round(h)}&FORMAT=image/jpeg`;
}

// The swissALTI3D tiles that cover a rectangle (LV95 metres), newest survey of each, at 2 or 0.5 m.
export async function listTiles(rect, gsd = 2, fetchFn = fetch) {
  const pad = 30;
  const corners = [[rect.e0 - pad, rect.n0 - pad], [rect.e1 + pad, rect.n0 - pad], [rect.e0 - pad, rect.n1 + pad], [rect.e1 + pad, rect.n1 + pad]].map(([e, n]) => lv95ToWgs(e, n));
  const lons = corners.map((c) => c[0]), lats = corners.map((c) => c[1]);
  const bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)].map((v) => v.toFixed(6)).join(',');
  let url = `${STAC}?bbox=${bbox}&limit=100`;
  const tiles = new Map();
  for (let page = 0; url && page < 40; page++) {
    const r = await fetchFn(url);
    if (!r.ok) throw new Error(`swisstopo tile list answered ${r.status}`);
    const j = await r.json();
    for (const f of j.features || []) {
      const m = String(f.id).match(/_(\d{4})_(\d{4})-(\d{4})$/);
      if (!m) continue;
      const year = +m[1], ekm = +m[2], nkm = +m[3];
      // only tiles that really overlap the rectangle (the degree box is a little larger)
      if (ekm * 1000 >= rect.e1 || (ekm + 1) * 1000 <= rect.e0 || nkm * 1000 >= rect.n1 || (nkm + 1) * 1000 <= rect.n0) continue;
      const asset = Object.values(f.assets || {}).find((a) => /geotiff/i.test(a.type || '') && Math.abs((a.gsd ?? a['eo:gsd'] ?? 0) - gsd) < 1e-6);
      if (!asset) continue;
      const key = `${ekm}-${nkm}`, had = tiles.get(key);
      if (!had || had.year < year) tiles.set(key, { key, year, href: asset.href, name: asset.href.split('/').pop() });
    }
    url = (j.links || []).find((l) => l.rel === 'next')?.href || null;
  }
  return [...tiles.values()].sort((a, b) => a.key.localeCompare(b.key));
}

// Downloads and reads the tiles, a few at a time, and stitches each into the rectangle as it arrives.
export async function fetchTerrain(rect, { gsd = 2, max = 1400, onProgress, fetchFn = fetch, signal } = {}) {
  const list = await listTiles(rect, gsd, fetchFn);
  if (!list.length) throw new Error('swisstopo has no swissALTI3D tiles there. The model covers Switzerland and Liechtenstein.');
  const acc = mosaicInto(rect, gsd, max);
  let done = 0, bytes = 0;
  onProgress?.({ done, total: list.length, bytes });
  const queue = list.slice();
  const worker = async () => {
    while (queue.length) {
      if (signal?.aborted) throw new Error('Cancelled');
      const t = queue.shift();
      const r = await fetchFn(t.href, signal ? { signal } : undefined);
      if (!r.ok) throw new Error(`Tile ${t.key} answered ${r.status}`);
      const b = new Uint8Array(await r.arrayBuffer());
      bytes += b.length;
      for (const tile of readDEM(t.name, b)) acc.add(tile);
      done++;
      onProgress?.({ done, total: list.length, bytes });
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  // cells with no heights (outside Switzerland) are counted before they are filled
  return { ...acc.finish(), files: list.length, bytes };
}
