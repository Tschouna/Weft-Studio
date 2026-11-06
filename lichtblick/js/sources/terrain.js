// Terrain for the 3D view: swisstopo's swissALTIRegio, 10 m elevation of Switzerland and its border
// regions, published as one cloud-optimised GeoTIFF (10 GB). Only the 256-pixel tiles around a spot are
// read, with HTTP range requests, from the full 10 m level or the 40 m overview. Plus the swisstopo aerial
// photos and maps for the same square, in the Swiss grid (LV95), so nothing needs reprojecting.
import { wgsToLv95 } from '../geo.js';
import { kvGet, kvSet } from '../store.js';

const TIF = 'https://data.geo.admin.ch/ch.swisstopo.swissaltiregio/swissaltiregio/swissaltiregio_2056_5728.tif';
const ORIGIN_E = 2385000, ORIGIN_N = 1404000, RES = 10;

async function range(a, b) {
  if (!(b >= a && b - a < 8e6)) throw new Error(`bad byte range ${a}-${b}`);
  const r = await fetch(TIF, { headers: { Range: `bytes=${a}-${b}` } });
  // never read a full answer: that would be the whole 10 GB file
  if (r.status !== 206) { try { r.body && r.body.cancel(); } catch { /* ignore */ } throw new Error(`swisstopo answered ${r.status} to a range request`); }
  return new Uint8Array(await r.arrayBuffer());
}

// ---- the BigTIFF header: one entry per resolution level ----
let headerP = null;
function header() {
  if (!headerP) headerP = (async () => {
    const b = await range(0, 65535), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (v.getUint16(2, true) !== 43) throw new Error('not a BigTIFF');
    const u64 = (o) => Number(v.getBigUint64(o, true));
    const levels = [];
    let off = u64(8);
    while (off && off + 8 < b.length) {
      const n = u64(off), ifd = {};
      for (let i = 0; i < n; i++) {
        const e = off + 8 + i * 20, tag = v.getUint16(e, true), type = v.getUint16(e + 2, true), count = u64(e + 4);
        const val = count === 1 ? (type === 3 ? v.getUint16(e + 12, true) : type === 4 ? v.getUint32(e + 12, true) : u64(e + 12)) : u64(e + 12);
        ifd[tag] = { val, count, type };
      }
      const size = (t) => (t === 16 ? 8 : t === 4 ? 4 : 2); // the tables may hold 8-, 4- or 2-byte numbers
      levels.push({ w: ifd[256].val, h: ifd[257].val, tw: ifd[322].val, th: ifd[323].val, offsets: ifd[324].val, offSize: size(ifd[324].type), counts: ifd[325].val, cntSize: size(ifd[325].type), comp: ifd[259].val });
      off = u64(off + 8 + n * 20);
    }
    levels.forEach((l) => { l.scale = Math.round(levels[0].w / l.w); l.across = Math.ceil(l.w / l.tw); });
    return levels;
  })().catch((e) => { headerP = null; throw e; });
  return headerP;
}

// TIFF LZW: MSB-first codes of 9 to 12 bits, switching width one code early (as in Weft's dem.js)
function lzw(src, size) {
  const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096), length = new Uint16Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; first[i] = i; length[i] = 1; }
  const out = new Uint8Array(size + 4100); // a string is at most 4096 bytes long
  let on = 0, bits = 9, next = 258, prev = -1, pos = 0;
  const total = src.length * 8;
  while (pos + bits <= total && on < size) {
    const p = pos >> 3;
    const v24 = (src[p] << 16) | ((src[p + 1] || 0) << 8) | (src[p + 2] || 0);
    const code = (v24 >> (24 - (pos & 7) - bits)) & ((1 << bits) - 1);
    pos += bits;
    if (code === 257) break;
    if (code === 256) { bits = 9; next = 258; prev = -1; continue; }
    if (prev < 0) { out[on++] = code; prev = code; continue; }
    const known = code < next;
    if (next < 4096) { prefix[next] = prev; suffix[next] = known ? first[code] : first[prev]; first[next] = first[prev]; length[next] = length[prev] + 1; next++; }
    for (let k = length[code] - 1, c = code; k >= 0; k--) { out[on + k] = suffix[c]; c = prefix[c]; }
    on += length[code];
    prev = code;
    if (next + 1 >= 1 << bits && bits < 12) bits++;
  }
  return out.subarray(0, size);
}

// heights (metres) on a square of `half` metres either side of the spot, at the level whose pixels are
// closest to `res` metres. Returns { grid: Float32Array (row 0 = north), cols, rows, e0, n0, res }
export async function readTerrain(lat, lon, half, res = 10, onProgress) {
  const levels = await header();
  const level = levels.reduce((a, l) => (Math.abs(RES * l.scale - res) < Math.abs(RES * a.scale - res) ? l : a));
  const px = RES * level.scale;
  const { e, n } = wgsToLv95(lat, lon);
  const col0 = Math.floor((e - half - ORIGIN_E) / px), col1 = Math.ceil((e + half - ORIGIN_E) / px);
  const row0 = Math.floor((ORIGIN_N - (n + half)) / px), row1 = Math.ceil((ORIGIN_N - (n - half)) / px);
  const cols = col1 - col0, rows = row1 - row0, grid = new Float32Array(cols * rows).fill(NaN);
  const tx0 = Math.floor(col0 / level.tw), tx1 = Math.floor((col1 - 1) / level.tw), ty0 = Math.floor(row0 / level.th), ty1 = Math.floor((row1 - 1) / level.th);
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    const i0 = ty * level.across + tx0, i1 = ty * level.across + tx1;
    const os = level.offSize, cs = level.cntSize;
    const [ob, cb] = await Promise.all([range(level.offsets + i0 * os, level.offsets + (i1 + 1) * os - 1), range(level.counts + i0 * cs, level.counts + (i1 + 1) * cs - 1)]);
    const ov = new DataView(ob.buffer, ob.byteOffset, ob.byteLength), cv = new DataView(cb.buffer, cb.byteOffset, cb.byteLength);
    const num = (v, i, n) => (n === 8 ? Number(v.getBigUint64(i * 8, true)) : n === 4 ? v.getUint32(i * 4, true) : v.getUint16(i * 2, true));
    for (let tx = tx0; tx <= tx1; tx++) jobs.push({ tx, ty, off: num(ov, tx - tx0, os), len: num(cv, tx - tx0, cs) });
  }
  let done = 0;
  const tileBytes = level.tw * level.th * 4;
  await Promise.all(jobs.map(async (j) => {
    if (!j.len) return;
    const raw = await range(j.off, j.off + j.len - 1);
    const bytes = level.comp === 5 ? lzw(raw, tileBytes) : raw;
    const f = new Float32Array(bytes.buffer, bytes.byteOffset, tileBytes / 4);
    for (let y = 0; y < level.th; y++) {
      const r = j.ty * level.th + y - row0;
      if (r < 0 || r >= rows) continue;
      for (let x = 0; x < level.tw; x++) {
        const c = j.tx * level.tw + x - col0;
        if (c < 0 || c >= cols) continue;
        const h = f[y * level.tw + x];
        grid[r * cols + c] = h > -1000 && h < 9000 ? h : NaN;
      }
    }
    done++; if (onProgress) onProgress(done / jobs.length);
  }));
  return { grid, cols, rows, e0: ORIGIN_E + col0 * px, n0: ORIGIN_N - row0 * px, res: px, ec: e, nc: n };
}

// cached per spot and size, so the second visit is instant and works offline
export async function terrainFor(spot, half, res, onProgress) {
  const key = `dem:${spot.lat.toFixed(4)},${spot.lon.toFixed(4)},${half},${res}`;
  const hit = await kvGet(key);
  if (hit) return hit;
  const t = await readTerrain(spot.lat, spot.lon, half, res, onProgress);
  await kvSet(key, t);
  return t;
}

// ---- swisstopo imagery in the Swiss grid (WMTS 2056) ----
const WMTS_RES = [4000, 3750, 3500, 3250, 3000, 2750, 2500, 2250, 2000, 1750, 1500, 1250, 1000, 750, 650, 500, 250, 100, 50, 20, 10, 5, 2.5, 2, 1.5, 1, 0.5, 0.25, 0.1];
const W_E = 2420000, W_N = 1350000;
export const IMAGERY = {
  aerial: (z, x, y) => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/2056/${z}/${x}/${y}.jpeg`,
  map: (z, x, y) => `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/2056/${z}/${x}/${y}.jpeg`,
};

// a canvas with the imagery exactly covering [e0, e0 + width] x [n0 - height, n0]
export async function imagery(kind, e0, n0, width, height, mPerPx, onProgress) {
  const z = WMTS_RES.findIndex((r) => r <= mPerPx);
  const r = WMTS_RES[z], span = 256 * r;
  const x0 = Math.floor((e0 - W_E) / span), x1 = Math.floor((e0 + width - W_E) / span);
  const y0 = Math.floor((W_N - n0) / span), y1 = Math.floor((W_N - (n0 - height)) / span);
  const W = Math.round(width / r), H = Math.round(height / r);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#3d4a3a'; g.fillRect(0, 0, W, H); // outside Switzerland there are no aerial photos
  const jobs = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) jobs.push({ x, y });
  let done = 0;
  await Promise.all(jobs.map(async ({ x, y }) => {
    try {
      const img = new Image(); img.crossOrigin = 'anonymous'; img.src = IMAGERY[kind](z, x, y);
      await img.decode();
      g.drawImage(img, Math.round((W_E + x * span - e0) / r), Math.round((n0 - (W_N - y * span)) / r), 256, 256);
    } catch { /* missing tile */ }
    done++; if (onProgress) onProgress(done / jobs.length);
  }));
  return canvas;
}

export { lzw as _lzw };
