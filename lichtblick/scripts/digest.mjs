// Push alerts while the app is closed: runs the same detectors as the app on the curated spots (plus
// your own, if you export them from the app to data/my-spots.json) and sends the best chances of the
// next day and a half to your phone through ntfy.sh (free app for iPhone and Android).
//
//   NTFY_TOPIC=your-secret-topic node scripts/digest.mjs        (DRY_RUN=1 prints instead of sending)
// Optional: LICHTBLICK_MIN (default 75), LICHTBLICK_URL (link to open, e.g. your GitHub Pages address),
//           LICHTBLICK_ONLY="rigi,my-abc" (only these spot ids), NTFY_SERVER (default https://ntfy.sh)
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPOTS } from '../data/spots.js';
import { HORIZONS } from '../data/horizons.js';
import { forecast, gridForecast } from '../js/sources/meteoswiss.js';
import { kpForecast } from '../js/sources/spaceweather.js';
import { opportunitiesFor, makeContext, LOWLAND_REFS, topOpportunities, TYPES } from '../js/scoring.js';
import { insidePolygon } from '../js/geo.js';
import { CH_OUTLINE } from '../data/ch-outline.js';
import { hhmm, weekday, localMidnight } from '../js/astro.js';

const topic = process.env.NTFY_TOPIC, dry = !!process.env.DRY_RUN;
if (!topic && !dry) { console.log('No NTFY_TOPIC set: nothing to send.'); process.exit(0); }
const min = +(process.env.LICHTBLICK_MIN || 75);
const only = (process.env.LICHTBLICK_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);

const mineFile = fileURLToPath(new URL('../data/my-spots.json', import.meta.url));
const mine = existsSync(mineFile) ? (JSON.parse(readFileSync(mineFile, 'utf8')).spots || []) : [];
let spots = [...mine, ...SPOTS.map((s) => ({ ...s, horizon: HORIZONS[s.id] ? { alts: HORIZONS[s.id].alts } : null }))];
if (only.length) spots = spots.filter((s) => only.includes(s.id));

const pts = [...spots, ...LOWLAND_REFS].map((s) => ({ lat: s.lat, lon: s.lon, elev: s.elev }));
const fc = await forecast(pts);
const cells = [];
for (let lat = 45.86; lat <= 47.8; lat += 0.16) for (let lon = 6.0; lon <= 10.5; lon += 0.22) if (insidePolygon(lat, lon, CH_OUTLINE)) cells.push({ lat: +lat.toFixed(3), lon: +lon.toFixed(3) });
const grid = await gridForecast(cells).then((g) => ({ cells, series: g.data })).catch(() => null);
const kp = await kpForecast().catch(() => null);
const now = new Date();
const ctx = makeContext({ now, refs: LOWLAND_REFS.map((r, i) => ({ ...r, fc: fc[spots.length + i] })), grid, kp });
const ops = spots.flatMap((s, i) => opportunitiesFor(s, fc[i], ctx));
const horizon = now.getTime() + 36 * 3600e3;
// the best chance per spot, then the best spots
const seen = new Set();
const best = topOpportunities(ops, { min, perSpotDay: 1 }).filter((o) => o.peak.getTime() <= horizon)
  .filter((o) => (seen.has(o.spotId) ? false : seen.add(o.spotId))).slice(0, 6);

if (!best.length) { console.log(`Nothing at ${min}+ in the next 36 hours.`); process.exit(0); }
const name = (id) => spots.find((s) => s.id === id)?.name || id;
const day = (d) => { const n = Math.round((localMidnight(d) - localMidnight(now)) / 864e5); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : weekday(d); };
const lines = best.map((o) => `${TYPES[o.type].icon} ${o.score} · ${o.title} · ${name(o.spotId)} · ${day(o.peak)} ${hhmm(o.peak)}`);
const title = `${best.length} photo chance${best.length > 1 ? 's' : ''}: ${best[0].title} at ${name(best[0].spotId)}`;
const body = `${lines.join('\n')}\n\nMeteoSwiss forecast, ${hhmm(now)}.`;
console.log(title + '\n' + body);
if (dry) process.exit(0);

const server = process.env.NTFY_SERVER || 'https://ntfy.sh';
const headers = { Title: encodeURIComponent(title).length === title.length ? title : `=?UTF-8?B?${Buffer.from(title).toString('base64')}?=`, Tags: 'camera', Priority: best[0].score >= 88 ? '4' : '3' };
if (process.env.LICHTBLICK_URL) headers.Click = `${process.env.LICHTBLICK_URL}#spot=${best[0].spotId}`;
const r = await fetch(`${server}/${encodeURIComponent(topic)}`, { method: 'POST', body, headers });
console.log(`ntfy answered ${r.status}`);
if (!r.ok) process.exit(1);
