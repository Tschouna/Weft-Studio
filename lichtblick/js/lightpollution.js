// How dark is the sky at a spot? Measured from NASA's Black Marble night-lights map (VIIRS satellite,
// public domain): every lit pixel within 100 km adds sky glow, fading with distance roughly as d^-2.5
// (Walker's law). The result is turned into a Bortle-like class from 1 (pristine) to 9 (inner city),
// and the town whose glow dominates is named, with its direction, for framing the night sky.
// High viewpoints count as darker: they are above much of the hazy air that scatters the lights.
// Works in the page (tiles decoded by a canvas) and in Node (scripts/darkness.mjs).
import { distance, bearing } from './geo.js';

export const NIGHT_TILES = (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/${z}/${y}/${x}.png`;
const Z = 8, RADIUS = 100; // km

// towns that light up the Swiss night sky, and their neighbours across the borders
export const TOWNS = [
  ['Zürich', 47.377, 8.540], ['Geneva', 46.204, 6.143], ['Basel', 47.559, 7.588], ['Lausanne', 46.520, 6.633], ['Bern', 46.948, 7.447],
  ['Winterthur', 47.500, 8.724], ['Lucerne', 47.050, 8.309], ['St. Gallen', 47.424, 9.377], ['Lugano', 46.004, 8.951], ['Biel', 47.137, 7.247],
  ['Thun', 46.758, 7.628], ['Fribourg', 46.806, 7.161], ['Chur', 46.850, 9.530], ['Sion', 46.233, 7.360], ['Neuchâtel', 46.990, 6.930],
  ['Schaffhausen', 47.697, 8.634], ['Zug', 47.166, 8.515], ['Aarau', 47.392, 8.044], ['Olten', 47.350, 7.903], ['Solothurn', 47.208, 7.537],
  ['Baden', 47.473, 8.307], ['Montreux', 46.433, 6.911], ['Interlaken', 46.686, 7.863], ['Locarno', 46.170, 8.795], ['Bellinzona', 46.192, 9.017],
  ['Visp', 46.293, 7.881], ['Brig', 46.316, 7.988], ['Martigny', 46.102, 7.072], ['Monthey', 46.255, 6.954], ['Yverdon', 46.778, 6.641],
  ['La Chaux-de-Fonds', 47.100, 6.826], ['Frauenfeld', 47.557, 8.898], ['Rapperswil', 47.226, 8.818], ['Wil', 47.462, 9.045], ['Buchs SG', 47.168, 9.478],
  ['Zermatt', 46.020, 7.749], ['Davos', 46.802, 9.836], ['St. Moritz', 46.498, 9.839], ['Glarus', 47.040, 9.068], ['Altdorf', 46.880, 8.641], ['Schwyz', 47.021, 8.654],
  ['Milan', 45.464, 9.190], ['Como', 45.808, 9.085], ['Varese', 45.820, 8.825], ['Lecco', 45.856, 9.398], ['Bergamo', 45.698, 9.677], ['Novara', 45.446, 8.622],
  ['Domodossola', 46.115, 8.292], ['Aosta', 45.737, 7.320], ['Annecy', 45.899, 6.129], ['Thonon', 46.371, 6.479], ['Chamonix', 45.924, 6.869],
  ['Mulhouse', 47.750, 7.336], ['Freiburg', 47.999, 7.842], ['Konstanz', 47.663, 9.175], ['Friedrichshafen', 47.655, 9.479], ['Bregenz', 47.505, 9.749],
  ['Feldkirch', 47.238, 9.598], ['Vaduz', 47.141, 9.521], ['Besançon', 47.238, 6.024], ['Pontarlier', 46.904, 6.354], ['Sondrio', 46.170, 9.871], ['Bormio', 46.467, 10.371],
];

const worldPx = (lat, lon) => {
  const n = 256 * 2 ** Z, s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
};
const pxToLatLon = (x, y) => {
  const n = 256 * 2 ** Z, lon = (x / n) * 360 - 180, m = Math.PI * (1 - (2 * y) / n);
  return { lat: (Math.atan(Math.sinh(m)) * 180) / Math.PI, lon };
};

// getTile(z, x, y) -> Promise<Uint8ClampedArray|Uint8Array of 256*256 RGB(A), channels>
export async function measureSky(spot, getTile) {
  const c = worldPx(spot.lat, spot.lon);
  const kmPerPx = (40075 * Math.cos((spot.lat * Math.PI) / 180)) / (256 * 2 ** Z);
  const r = Math.ceil(RADIUS / kmPerPx);
  const tx0 = Math.floor((c.x - r) / 256), tx1 = Math.floor((c.x + r) / 256), ty0 = Math.floor((c.y - r) / 256), ty1 = Math.floor((c.y + r) / 256);
  const tiles = new Map();
  await Promise.all([...Array((tx1 - tx0 + 1) * (ty1 - ty0 + 1)).keys()].map(async (i) => {
    const tx = tx0 + (i % (tx1 - tx0 + 1)), ty = ty0 + Math.floor(i / (tx1 - tx0 + 1));
    try { tiles.set(`${tx},${ty}`, await getTile(Z, tx, ty)); } catch { /* sea, or offline */ }
  }));
  let total = 0, local = 0;
  const byTown = new Map();
  const towns = TOWNS.map(([name, lat, lon]) => ({ name, ...worldPx(lat, lon) }));
  for (let y = Math.floor(c.y - r); y <= c.y + r; y++) for (let x = Math.floor(c.x - r); x <= c.x + r; x++) {
    const t = tiles.get(`${Math.floor(x / 256)},${Math.floor(y / 256)}`);
    if (!t) continue;
    const px = (((y % 256) + 256) % 256) * 256 + (((x % 256) + 256) % 256);
    const ch = t.channels || 3, R = t.data[px * ch], G = t.data[px * ch + 1], B = t.data[px * ch + 2];
    const lum = (0.3 * R + 0.59 * G + 0.11 * B) / 255;
    const lin = Math.max(0, lum ** 2.2 - 0.004); // the map's dark background is not light
    if (lin <= 0) continue;
    const dist = Math.hypot(x - c.x, y - c.y) * kmPerPx;
    if (dist > RADIUS) continue;
    // a few lamps next to you light the ground more than the sky: closer than 3 km counts as 3 km
    const d = Math.max(3, dist);
    const w = lin * d ** -2.5;
    total += w;
    if (dist < 3) local += w;
    // whose light is it? the nearest listed town within 12 km of the pixel
    let best = null, bd = (12 / kmPerPx) ** 2;
    for (const tw of towns) { const dd = (tw.x - x) ** 2 + (tw.y - y) ** 2; if (dd < bd) { bd = dd; best = tw.name; } }
    if (best && d > 3) byTown.set(best, (byTown.get(best) || 0) + w);
  }
  // high up you are above most of the hazy air that scatters the valley lights back down
  const index = Math.log10(total + 1e-9) - Math.max(0, (spot.elev || 500) - 500) / 3000;
  const glowName = [...byTown.entries()].sort((a, b) => b[1] - a[1])[0];
  const town = glowName && TOWNS.find((t) => t[0] === glowName[0]);
  return {
    index: Math.round(index * 100) / 100,
    bortle: bortleOf(index),
    localShare: total ? Math.round((local / total) * 100) / 100 : 0,
    glow: town ? { name: town[0], az: Math.round(bearing(spot, { lat: town[1], lon: town[2] })), km: Math.round(distance(spot, { lat: town[1], lon: town[2] }) / 1000), share: Math.round((glowName[1] / total) * 100) / 100 } : null,
  };
}

// calibrated on the curated spots: Lucerne and Zürich ~9, the Swiss National Park ~2, high Alpine lakes ~3
export const BORTLE_STEPS = [-1.6, -1.25, -0.95, -0.65, -0.3, 0.15, 0.6, 0.9];
export function bortleOf(index) {
  let b = 1;
  for (const s of BORTLE_STEPS) if (index > s) b++;
  return b;
}
export const BORTLE_WORDS = ['', 'pristine dark', 'truly dark', 'rural dark', 'rural / suburban', 'suburban', 'bright suburban', 'suburban / urban', 'city', 'inner city'];
// how much of the night sky's beauty survives (for the scores)
export const darkFactor = (b) => [1, 1, 1, 0.96, 0.9, 0.8, 0.68, 0.55, 0.45, 0.4][b] ?? 0.8;

// in the page: decode the tile with a canvas
const cache = new Map();
export function browserTile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (!cache.has(k)) {
    cache.set(k, (async () => {
      const r = await fetch(NIGHT_TILES(z, x, y));
      if (!r.ok) throw new Error(`NASA answered ${r.status}`);
      const bmp = await createImageBitmap(await r.blob());
      const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
      const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
      return { data: g.getImageData(0, 0, 256, 256).data, channels: 4 };
    })());
  }
  return cache.get(k);
}
