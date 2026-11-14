// Alerts while the app is closed: runs the same detectors as the app and sends new chances of the
// next day and a half to your phone. Run by the scheduled GitHub job every three hours in the day.
//
// Two ways to receive them (either or both):
//   LICHTBLICK_PUSH  the setup code from the app (Settings → Alerts): real notifications from
//                    Lichtblick itself, following your alert settings, with your own spots
//   NTFY_TOPIC       a topic of the free ntfy.sh app: one message listing the chances
// Optional: LICHTBLICK_MIN (lowest score, default 75 or the app's setting), LICHTBLICK_URL (address
//   of the app, for the ntfy link), LICHTBLICK_ONLY="rigi,my-abc" (only these spot ids),
//   LICHTBLICK_STATE (file that remembers what was sent, so nothing is sent twice),
//   LICHTBLICK_TEST=1 (send a test alert and stop), DRY_RUN=1 (print instead of sending).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SPOTS } from '../data/spots.js';
import { HORIZONS } from '../data/horizons.js';
import { SKY } from '../data/sky.js';
import { forecast, gridForecast } from '../js/sources/meteoswiss.js';
import { kpForecast } from '../js/sources/spaceweather.js';
import { opportunitiesFor, makeContext, LOWLAND_REFS, TYPES } from '../js/scoring.js';
import { insidePolygon } from '../js/geo.js';
import { CH_OUTLINE } from '../data/ch-outline.js';
import { hhmm, weekday, localMidnight } from '../js/astro.js';
import { pickAlerts } from './alerts.mjs';
import { sendPush } from './webpush.mjs';

const dry = !!process.env.DRY_RUN, test = !!process.env.LICHTBLICK_TEST && process.env.LICHTBLICK_TEST !== 'false';
const topic = process.env.NTFY_TOPIC || '';
let phones = [];
if (process.env.LICHTBLICK_PUSH) {
  try { const j = JSON.parse(process.env.LICHTBLICK_PUSH.trim()); phones = (Array.isArray(j) ? j : [j]).filter((p) => p && p.sub && p.sub.endpoint && p.vapid); }
  catch { console.log('LICHTBLICK_PUSH is not a valid setup code: copy it again in the app (Settings → Alerts) and replace the secret.'); process.exit(1); }
}
if (!topic && !phones.length && !dry) { console.log('No LICHTBLICK_PUSH or NTFY_TOPIC set: nothing to send.'); process.exit(0); }

// ---- sending ----
async function toPhones(messages) {
  let failed = 0;
  for (const p of phones) {
    for (const m of messages) {
      if (dry) { console.log('push →', JSON.stringify(m)); continue; }
      const r = await sendPush(p.sub, p.vapid, m, { subject: p.app || 'https://github.com/', urgency: m.urgent ? 'high' : 'normal' }).catch((e) => ({ ok: false, status: 0, text: e.message }));
      console.log(`push service answered ${r.status}${r.ok ? '' : ` ${r.text || ''}`}`);
      if (r.gone) { console.log('This phone\'s subscription has ended. Open Lichtblick, Settings → Alerts, turn the alerts on again and replace the secret with the new setup code.'); failed++; break; }
      if (!r.ok) failed++;
    }
  }
  return failed;
}
async function toNtfy(title, body, click, priority) {
  if (!topic) return 0;
  if (dry) { console.log(`ntfy → ${title}\n${body}`); return 0; }
  const headers = { Title: encodeURIComponent(title).length === title.length ? title : `=?UTF-8?B?${Buffer.from(title).toString('base64')}?=`, Tags: 'camera', Priority: priority };
  if (click) headers.Click = click;
  const r = await fetch(`${process.env.NTFY_SERVER || 'https://ntfy.sh'}/${encodeURIComponent(topic)}`, { method: 'POST', body, headers });
  console.log(`ntfy answered ${r.status}`);
  return r.ok ? 0 : 1;
}

if (test) {
  const failed = (await toPhones([{ title: 'Lichtblick alerts are working', body: 'This phone will hear about great photo chances, also while the app is closed.', tag: 'test' }]))
    + (await toNtfy('Lichtblick alerts are working', 'You will hear about great photo chances here.', process.env.LICHTBLICK_URL, '3'));
  process.exit(failed ? 1 : 0);
}

// ---- what is coming up ----
const prefs = { ...(phones[0]?.prefs || {}) };
if (process.env.LICHTBLICK_MIN) prefs.min = +process.env.LICHTBLICK_MIN;
const only = (process.env.LICHTBLICK_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const mineFile = fileURLToPath(new URL('../data/my-spots.json', import.meta.url));
const mine = [...(existsSync(mineFile) ? (JSON.parse(readFileSync(mineFile, 'utf8')).spots || []) : []), ...phones.flatMap((p) => p.spots || [])]
  .filter((s, i, all) => s && s.id && Number.isFinite(s.lat) && Number.isFinite(s.lon) && all.findIndex((x) => x.id === s.id) === i);
let spots = [...mine, ...SPOTS.map((s) => ({ ...s, sky: SKY[s.id] || null, horizon: HORIZONS[s.id] ? { alts: HORIZONS[s.id].alts } : null }))];
if (only.length) spots = spots.filter((s) => only.includes(s.id));

const stateFile = process.env.LICHTBLICK_STATE || '';
let state = null;
if (stateFile && existsSync(stateFile)) { try { state = JSON.parse(readFileSync(stateFile, 'utf8')); } catch { state = null; } }

const now = new Date();
let ops;
try {
  const pts = [...spots, ...LOWLAND_REFS].map((s) => ({ lat: s.lat, lon: s.lon, elev: s.elev }));
  const fc = await forecast(pts, { outlook: false }); // the next day and a half: MeteoSwiss only
  const cells = [];
  for (let lat = 45.86; lat <= 47.8; lat += 0.16) for (let lon = 6.0; lon <= 10.5; lon += 0.22) if (insidePolygon(lat, lon, CH_OUTLINE)) cells.push({ lat: +lat.toFixed(3), lon: +lon.toFixed(3) });
  const grid = await gridForecast(cells).then((g) => ({ cells, series: g.data })).catch(() => null);
  const kp = await kpForecast().catch(() => null);
  const ctx = makeContext({ now, refs: LOWLAND_REFS.map((r, i) => ({ ...r, fc: fc[spots.length + i] })), grid, kp });
  ops = spots.flatMap((s, i) => opportunitiesFor(s, fc[i], ctx));
} catch (e) {
  // the free forecast service limits each address, and this job runs on shared ones: the next run tries again
  console.log(`No forecast this time (${e.message}). The next run tries again.`);
  process.exit(0);
}

const { fresh, state: next } = pickAlerts(ops, { prefs, mine: new Set(mine.map((s) => s.id)), state, now: now.getTime() });
if (!fresh.length) { console.log('Nothing new worth an alert in the next 36 hours.'); process.exit(0); }

const name = (id) => spots.find((s) => s.id === id)?.name || id;
const day = (d) => { const n = Math.round((localMidnight(d) - localMidnight(now)) / 864e5); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : weekday(d); };
const when = (o) => `${day(o.peak)} ${hhmm(o.peak)}`;

// phone: one notification per chance, at most three, the rest counted on the last one
const shown = fresh.slice(0, 3), more = fresh.length - shown.length;
const messages = shown.map((o, i) => ({
  title: o.title, spot: o.spotId, tag: `${o.spotId}:${o.type}`, urgent: o.score >= 88,
  body: `${name(o.spotId)} · ${when(o)} · score ${o.score}${i === shown.length - 1 && more > 0 ? ` · and ${more} more in the app` : ''}`,
}));
const lines = fresh.map((o) => `${o.emoji || TYPES[o.type].emoji} ${o.score} · ${o.title} · ${name(o.spotId)} · ${when(o)}`);
const title = `${fresh.length} photo chance${fresh.length > 1 ? 's' : ''}: ${fresh[0].title} at ${name(fresh[0].spotId)}`;
console.log(`${title}\n${lines.join('\n')}`);

const failed = (await toPhones(messages))
  + (await toNtfy(title, `${lines.join('\n')}\n\nMeteoSwiss forecast, ${hhmm(now)}.`, process.env.LICHTBLICK_URL ? `${process.env.LICHTBLICK_URL}#spot=${fresh[0].spotId}` : '', fresh[0].score >= 88 ? '4' : '3'));
if (stateFile && !dry && !failed) writeFileSync(stateFile, JSON.stringify(next));
process.exit(failed ? 1 : 0);
