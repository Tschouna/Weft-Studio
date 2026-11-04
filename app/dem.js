// Weft panels: elevation models for the Terrain pattern. Reads what swisstopo hands out
// (swissALTI3D as Cloud Optimized GeoTIFF or ASCII X Y Z, DHM25 and others as an ESRI ASCII grid), also
// inside .zip files, and stitches neighbouring tiles together by their coordinates.
import { unzipSync, unzlibSync, inflateSync } from 'fflate';

const ext = (name) => (name.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
export const DEM_EXTENSIONS = ['tif', 'tiff', 'xyz', 'asc', 'txt', 'zip'];

// One file (or a zip of them) into tiles: { x0, y1, cell, w, h, data (Float32Array, NaN where empty), name }.
// x0/y1 are the west and north edges in the file's own units (metres for swisstopo, LV95).
export function readDEM(name, bytes) {
  const e = ext(name);
  if (e === 'zip') {
    const files = unzipSync(bytes);
    const out = [];
    for (const [n, b] of Object.entries(files)) if (/\.(tif|tiff|xyz|asc|txt)$/i.test(n) && !n.startsWith('__MACOSX')) out.push(...readDEM(n, b));
    if (!out.length) throw new Error(`${name} holds no elevation files (.tif, .xyz or .asc)`);
    return out;
  }
  if (e === 'tif' || e === 'tiff' || (bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4d && bytes[1] === 0x4d)) return [{ ...readTIFF(bytes), name }];
  // text: an ESRI ASCII grid starts with its header, anything else is read as X Y Z points
  const head = new TextDecoder().decode(bytes.subarray(0, 400)).toLowerCase();
  if (/^\s*ncols/.test(head) || /\bnrows\b/.test(head)) return [{ ...readASC(bytes), name }];
  return [{ ...readXYZ(bytes), name }];
}

// ---------------------------------------------------------------- GeoTIFF
const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };
export function readTIFF(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const le = dv.getUint16(0) === 0x4949;
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le), u64 = (o) => Number(dv.getBigUint64(o, le));
  const big = u16(2) === 43;
  if (!big && u16(2) !== 42) throw new Error('Not a TIFF file');
  const ifd = big ? u64(8) : u32(4);
  const n = big ? u64(ifd) : u16(ifd);
  const tags = {};
  const values = (type, count, off) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      const o = off + i * TYPE_SIZE[type];
      switch (type) {
        case 1: case 7: out.push(dv.getUint8(o)); break;
        case 2: out.push(dv.getUint8(o)); break;
        case 3: out.push(u16(o)); break;
        case 4: out.push(u32(o)); break;
        case 6: out.push(dv.getInt8(o)); break;
        case 8: out.push(dv.getInt16(o, le)); break;
        case 9: out.push(dv.getInt32(o, le)); break;
        case 11: out.push(dv.getFloat32(o, le)); break;
        case 12: out.push(dv.getFloat64(o, le)); break;
        case 5: out.push(u32(o) / u32(o + 4)); break;
        case 10: out.push(dv.getInt32(o, le) / dv.getInt32(o + 4, le)); break;
        case 16: out.push(u64(o)); break;
        case 17: out.push(Number(dv.getBigInt64(o, le))); break;
        default: out.push(0);
      }
    }
    return type === 2 ? String.fromCharCode(...out).replace(/\0+$/, '') : out;
  };
  for (let i = 0, p = ifd + (big ? 8 : 2); i < n; i++, p += big ? 20 : 12) {
    const tag = u16(p), type = u16(p + 2), count = big ? u64(p + 4) : u32(p + 4);
    if (!TYPE_SIZE[type]) continue;
    const size = TYPE_SIZE[type] * count, inline = big ? 8 : 4;
    const off = size <= inline ? p + (big ? 12 : 8) : big ? u64(p + 12) : u32(p + 8);
    tags[tag] = values(type, count, off);
  }
  const W = tags[256][0], H = tags[257][0];
  const bps = (tags[258] || [8])[0], comp = (tags[259] || [1])[0], spp = (tags[277] || [1])[0];
  const fmt = (tags[339] || [1])[0], pred = (tags[317] || [1])[0], planar = (tags[284] || [1])[0];
  if (![1, 5, 8, 32946, 32773].includes(comp)) throw new Error(`This GeoTIFF uses compression ${comp}, which Weft cannot read yet. Download the XYZ version instead.`);
  const bytesPer = bps / 8;
  const tiled = !!tags[322];
  const tw = tiled ? tags[322][0] : W, th = tiled ? tags[323][0] : (tags[278] || [H])[0];
  const offsets = tiled ? tags[324] : tags[273], counts = tiled ? tags[325] : tags[279];
  const across = Math.ceil(W / tw), down = Math.ceil(H / th);
  const data = new Float32Array(W * H).fill(NaN);
  const nodataText = tags[42113];
  const nodata = nodataText !== undefined && nodataText !== '' ? parseFloat(nodataText) : null;
  // pixels per chunk row, counting every sample when they are interleaved
  const rowSamples = tw * (planar === 1 ? spp : 1);
  for (let k = 0; k < offsets.length; k++) {
    if (planar === 2 && k >= across * down) break; // only the first sample's plane
    const raw = bytes.subarray(offsets[k], offsets[k] + counts[k]);
    let buf = comp === 1 ? raw : comp === 5 ? lzw(raw) : comp === 32773 ? packbits(raw) : inflate(raw);
    const rows = tiled ? th : Math.min(th, H - Math.floor(k % (across * down)) * th);
    const need = rowSamples * rows * bytesPer;
    if (buf.length < need) { const b = new Uint8Array(need); b.set(buf); buf = b; }
    if (pred === 2) undoHorizontal(buf, rowSamples, rows, bytesPer, spp, le);
    if (pred === 3) buf = undoFloat(buf, rowSamples, rows, bytesPer);
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const lePix = pred === 3 ? true : le;
    const read = (i) => {
      const o = i * bytesPer;
      if (fmt === 3) return bps === 64 ? v.getFloat64(o, lePix) : v.getFloat32(o, lePix);
      if (bps === 8) return fmt === 2 ? v.getInt8(o) : v.getUint8(o);
      if (bps === 16) return fmt === 2 ? v.getInt16(o, lePix) : v.getUint16(o, lePix);
      return fmt === 2 ? v.getInt32(o, lePix) : v.getUint32(o, lePix);
    };
    const tx = k % across, ty = Math.floor(k / across) % down;
    for (let j = 0; j < rows; j++) {
      const y = ty * th + j;
      if (y >= H) break;
      for (let i = 0; i < tw; i++) {
        const x = tx * tw + i;
        if (x >= W) break;
        let z = read((j * tw + i) * (planar === 1 ? spp : 1));
        if ((nodata !== null && z === nodata) || !Number.isFinite(z) || z < -1e4) z = NaN;
        data[y * W + x] = z;
      }
    }
  }
  // where the grid sits: tie point and pixel size; without them the grid stands alone at 1 unit per pixel
  const scale = tags[33550] || [1, 1, 0], tie = tags[33922] || [0, 0, 0, 0, 0, 0];
  const cell = scale[0];
  const x0 = tie[3] - tie[0] * scale[0], y1 = tie[4] + tie[1] * scale[1];
  return { x0, y1, cell, cellY: scale[1] || cell, w: W, h: H, data, georef: !!tags[33922] };
}
function inflate(raw) {
  try { return unzlibSync(raw); } catch { return inflateSync(raw); }
}
function packbits(src) {
  const out = [];
  for (let i = 0; i < src.length;) {
    const n = (src[i] << 24) >> 24;
    i++;
    if (n >= 0) { for (let k = 0; k <= n && i < src.length; k++) out.push(src[i++]); }
    else if (n !== -128) { const b = src[i++]; for (let k = 0; k < 1 - n; k++) out.push(b); }
  }
  return Uint8Array.from(out);
}
// TIFF LZW: MSB-first codes of 9 to 12 bits, switching width one code early
function lzw(src) {
  const prefix = new Int16Array(4096), suffix = new Uint8Array(4096), first = new Uint8Array(4096), length = new Uint16Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; first[i] = i; length[i] = 1; }
  let out = new Uint8Array(Math.max(1024, src.length * 3)), on = 0;
  const emit = (code) => {
    const L = length[code];
    if (on + L > out.length) { let n = out.length * 2; while (n < on + L) n *= 2; const b = new Uint8Array(n); b.set(out); out = b; }
    for (let k = L - 1, c = code; k >= 0; k--) { out[on + k] = suffix[c]; c = prefix[c]; }
    on += L;
  };
  let bits = 9, next = 258, prev = -1, pos = 0;
  const total = src.length * 8;
  while (pos + bits <= total) {
    let code = 0;
    for (let k = 0; k < bits; k++) { const p = pos + k; code = (code << 1) | ((src[p >> 3] >> (7 - (p & 7))) & 1); }
    pos += bits;
    if (code === 257) break;
    if (code === 256) { bits = 9; next = 258; prev = -1; continue; }
    if (prev < 0) { emit(code); prev = code; continue; }
    const known = code < next;
    if (next < 4096) { prefix[next] = prev; suffix[next] = known ? first[code] : first[prev]; first[next] = first[prev]; length[next] = length[prev] + 1; next++; }
    emit(code);
    prev = code;
    if (next + 1 >= 1 << bits && bits < 12) bits++;
  }
  return out.subarray(0, on);
}
function undoHorizontal(buf, w, rows, bytesPer, spp, le) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let j = 0; j < rows; j++) {
    const o = j * w * bytesPer;
    for (let i = spp; i < w; i++) {
      const a = o + i * bytesPer, b = o + (i - spp) * bytesPer;
      if (bytesPer === 1) buf[a] = (buf[a] + buf[b]) & 255;
      else if (bytesPer === 2) v.setUint16(a, (v.getUint16(a, le) + v.getUint16(b, le)) & 0xffff, le);
      else v.setUint32(a, (v.getUint32(a, le) + v.getUint32(b, le)) >>> 0, le);
    }
  }
}
// floating-point predictor: bytes differenced along the row, then stored most significant byte first, plane by plane
function undoFloat(buf, w, rows, bytesPer) {
  const out = new Uint8Array(w * rows * bytesPer), rowBytes = w * bytesPer;
  for (let j = 0; j < rows; j++) {
    const o = j * rowBytes;
    for (let i = 1; i < rowBytes; i++) buf[o + i] = (buf[o + i] + buf[o + i - 1]) & 255;
    for (let i = 0; i < w; i++) for (let b = 0; b < bytesPer; b++) out[o + i * bytesPer + b] = buf[o + (bytesPer - 1 - b) * w + i];
  }
  return out;
}

// ---------------------------------------------------------------- text grids
// numbers out of a text buffer without building strings for every line
function* numbers(bytes) {
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    let c = bytes[i];
    while (i < n && !((c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46)) { c = bytes[++i]; }
    if (i >= n) return;
    let neg = false;
    if (c === 45 || c === 43) { neg = c === 45; c = bytes[++i]; }
    let v = 0, frac = 0, scale = 1, seen = false;
    while (c >= 48 && c <= 57) { v = v * 10 + (c - 48); c = bytes[++i]; seen = true; }
    if (c === 46) { c = bytes[++i]; while (c >= 48 && c <= 57) { frac = frac * 10 + (c - 48); scale *= 10; c = bytes[++i]; seen = true; } }
    v += frac / scale;
    if (c === 101 || c === 69) {
      c = bytes[++i]; let en = false;
      if (c === 45 || c === 43) { en = c === 45; c = bytes[++i]; }
      let e = 0; while (c >= 48 && c <= 57) { e = e * 10 + (c - 48); c = bytes[++i]; }
      v *= 10 ** (en ? -e : e);
    }
    if (seen) yield neg ? -v : v;
  }
}
export function readXYZ(bytes) {
  let pts = new Float64Array(1 << 16), n = 0;
  const it = numbers(bytes);
  for (;;) {
    const x = it.next(); if (x.done) break;
    const y = it.next(), z = it.next(); if (z.done) break;
    if (n + 3 > pts.length) { const b = new Float64Array(pts.length * 2); b.set(pts); pts = b; }
    pts[n++] = x.value; pts[n++] = y.value; pts[n++] = z.value;
  }
  if (n < 12) throw new Error('No X Y Z points found');
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, cell = Infinity;
  for (let k = 0; k < n; k += 3) {
    const x = pts[k], y = pts[k + 1];
    if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    if (k >= 3) { const d = Math.abs(x - pts[k - 3]); if (d > 1e-6 && d < cell) cell = d; const e = Math.abs(y - pts[k - 2]); if (e > 1e-6 && e < cell) cell = e; }
  }
  if (!Number.isFinite(cell)) cell = 1;
  const w = Math.round((xmax - xmin) / cell) + 1, h = Math.round((ymax - ymin) / cell) + 1;
  if (w * h > 64e6) throw new Error('That XYZ grid is too large to read in one go');
  const data = new Float32Array(w * h).fill(NaN);
  for (let k = 0; k < n; k += 3) data[Math.round((ymax - pts[k + 1]) / cell) * w + Math.round((pts[k] - xmin) / cell)] = pts[k + 2];
  // points are cell centres
  return { x0: xmin - cell / 2, y1: ymax + cell / 2, cell, w, h, data, georef: true };
}
export function readASC(bytes) {
  const text = new TextDecoder().decode(bytes.subarray(0, 2000));
  const head = {};
  let at = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([a-zA-Z_]+)\s+([-+0-9.eE]+)/);
    if (!m) break;
    head[m[1].toLowerCase()] = parseFloat(m[2]);
    at += line.length + 1;
  }
  const w = head.ncols, h = head.nrows, cell = head.cellsize || head.dx;
  if (!w || !h || !cell) throw new Error('This ASCII grid has no ncols, nrows or cellsize');
  const x0 = head.xllcorner ?? head.xllcenter - cell / 2, ybottom = head.yllcorner ?? head.yllcenter - cell / 2;
  const nod = head.nodata_value;
  const data = new Float32Array(w * h).fill(NaN);
  let k = 0;
  for (const v of numbers(bytes.subarray(at))) { if (k >= w * h) break; data[k++] = v === nod ? NaN : v; }
  return { x0, y1: ybottom + h * cell, cell, w, h, data, georef: true };
}

// ---------------------------------------------------------------- stitching
// Tiles onto one grid at most `max` samples on its long side, averaging the samples that fall in each cell.
// Returns { w, h, data (0..1, NaN filled), zmin, zmax, widthM, heightM, cell, tiles }.
export function mosaic(tiles, max = 1400) {
  if (!tiles.length) throw new Error('No elevation data');
  // tiles without coordinates sit side by side, left to right
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  let cursor = 0;
  for (const t of tiles) {
    if (!t.georef) { t.x0 = cursor; t.y1 = t.h * t.cell; cursor += t.w * t.cell; }
    X0 = Math.min(X0, t.x0); X1 = Math.max(X1, t.x0 + t.w * t.cell);
    Y1 = Math.max(Y1, t.y1); Y0 = Math.min(Y0, t.y1 - t.h * (t.cellY || t.cell));
  }
  const fine = Math.min(...tiles.map((t) => t.cell));
  const cell = Math.max(fine, Math.max(X1 - X0, Y1 - Y0) / max);
  const w = Math.max(2, Math.round((X1 - X0) / cell)), h = Math.max(2, Math.round((Y1 - Y0) / cell));
  const sum = new Float64Array(w * h), cnt = new Uint32Array(w * h);
  for (const t of tiles) {
    const cy = t.cellY || t.cell;
    for (let j = 0; j < t.h; j++) {
      const gy = Math.min(h - 1, Math.max(0, Math.floor((Y1 - (t.y1 - (j + 0.5) * cy)) / cell)));
      for (let i = 0; i < t.w; i++) {
        const z = t.data[j * t.w + i];
        if (z !== z) continue;
        const gx = Math.min(w - 1, Math.max(0, Math.floor((t.x0 + (i + 0.5) * t.cell - X0) / cell)));
        sum[gy * w + gx] += z; cnt[gy * w + gx]++;
      }
    }
  }
  const data = new Float32Array(w * h);
  let zmin = Infinity, zmax = -Infinity, holes = 0;
  for (let k = 0; k < w * h; k++) {
    if (cnt[k]) { const z = sum[k] / cnt[k]; data[k] = z; if (z < zmin) zmin = z; if (z > zmax) zmax = z; } else { data[k] = NaN; holes++; }
  }
  if (!Number.isFinite(zmin)) throw new Error('The files hold no heights');
  // gaps (between tiles that do not touch, or empty cells when upsampling) take the nearest heights
  if (holes) fillHoles(data, w, h);
  const range = Math.max(1e-6, zmax - zmin);
  for (let k = 0; k < w * h; k++) data[k] = (data[k] - zmin) / range;
  return { w, h, data, zmin, zmax, widthM: X1 - X0, heightM: Y1 - Y0, cell, tiles: tiles.length, x0: X0, y1: Y1 };
}
function fillHoles(d, w, h) {
  for (let pass = 0; pass < 64; pass++) {
    let left = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (d[k] === d[k]) continue;
      let s = 0, n = 0;
      if (i > 0 && d[k - 1] === d[k - 1]) { s += d[k - 1]; n++; }
      if (i < w - 1 && d[k + 1] === d[k + 1]) { s += d[k + 1]; n++; }
      if (j > 0 && d[k - w] === d[k - w]) { s += d[k - w]; n++; }
      if (j < h - 1 && d[k + w] === d[k + w]) { s += d[k + w]; n++; }
      if (n) d[k] = s / n; else left++;
    }
    if (!left) return;
  }
  for (let k = 0; k < d.length; k++) if (d[k] !== d[k]) d[k] = 0;
}
