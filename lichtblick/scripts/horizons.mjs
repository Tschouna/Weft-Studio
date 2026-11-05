// Precomputes the terrain horizon of every curated spot into data/horizons.js, so the app knows from
// the start when the sun or the Milky Way clears the mountains there (your own spots get theirs on the
// phone, from the same swisstopo service).
//
//   node scripts/horizons.mjs            (behind a proxy: NODE_USE_ENV_PROXY=1 node scripts/horizons.mjs)
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPOTS } from '../data/spots.js';
import { computeHorizon } from '../js/sources/swisstopo.js';

const file = fileURLToPath(new URL('../data/horizons.js', import.meta.url));
let have = {};
if (existsSync(file)) have = (await import(file)).HORIZONS;
const args = process.argv.slice(2), all = args.includes('--all'), only = args.filter((a) => !a.startsWith('--'));
const RAYS = 144; // every 2.5°: narrow peaks like the Matterhorn need it
for (const s of SPOTS) {
  if (only.length ? !only.includes(s.id) : !all && have[s.id] && have[s.id].alts.length === RAYS) continue;
  const t = Date.now();
  const h = await computeHorizon(s, { rays: RAYS });
  have[s.id] = { alts: h.alts, h0: h.h0 };
  const max = Math.max(...h.alts);
  console.log(`${s.id.padEnd(14)} highest ${max.toFixed(1)}° at ${h.alts.indexOf(max) * 360 / RAYS}°  (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  writeFileSync(file, `// Terrain horizon of each curated spot: altitude in degrees every 2.5° of azimuth from north
// (swisstopo elevation profiles to 60 km, Earth curvature and refraction included). Built by scripts/horizons.mjs.
export const HORIZONS = ${JSON.stringify(have)};
`);
}
