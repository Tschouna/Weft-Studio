// Measures the sky darkness of every curated spot from NASA's night-lights map and writes data/sky.js
// (your own spots are measured on the phone the same way, see js/lightpollution.js).
//
//   node scripts/darkness.mjs            (behind a proxy: NODE_USE_ENV_PROXY=1 node scripts/darkness.mjs)
import { writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { SPOTS } from '../data/spots.js';
import { measureSky, NIGHT_TILES, BORTLE_WORDS } from '../js/lightpollution.js';

// a small PNG reader: 8-bit RGB or RGBA, not interlaced (what the NASA tiles are)
function readPNG(buf) {
  let p = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12]) throw new Error('unsupported PNG'); }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0;
  if (!ch) throw new Error(`PNG colour type ${ct}`);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, out = new Uint8Array(w * h * 3);
  const cur = new Uint8Array(stride), prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) out[(y * w + x) * 3 + k] = cur[x * ch + Math.min(k, ch - 1)];
    prev.set(cur);
  }
  return { data: out, channels: 3 };
}

const tiles = new Map();
const getTile = (z, x, y) => {
  const k = `${z}/${x}/${y}`;
  if (!tiles.has(k)) tiles.set(k, fetch(NIGHT_TILES(z, x, y)).then(async (r) => { if (!r.ok) throw new Error(`${r.status}`); return readPNG(Buffer.from(await r.arrayBuffer())); }));
  return tiles.get(k);
};

const out = {};
for (const s of SPOTS) {
  const m = await measureSky(s, getTile);
  out[s.id] = m;
  console.log(`${s.id.padEnd(15)} ${m.index.toFixed(2).padStart(6)}  Bortle ~${m.bortle} ${BORTLE_WORDS[m.bortle].padEnd(17)} local ${Math.round(m.localShare * 100)}%  glow ${m.glow ? `${m.glow.name} ${m.glow.km} km ${m.glow.az}°` : '-'}`);
}
const file = fileURLToPath(new URL('../data/sky.js', import.meta.url));
writeFileSync(file, `// Sky darkness of each curated spot, measured from NASA Black Marble night lights (scripts/darkness.mjs):
// index = log of the summed sky glow, bortle = Bortle-like class 1 (pristine) to 9 (inner city),
// localShare = part of the glow from within 3 km, glow = the town whose light dominates, its direction and distance.
export const SKY = ${JSON.stringify(out)};
`);
