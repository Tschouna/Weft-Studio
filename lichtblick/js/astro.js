// Sun, moon and Milky Way for a spot, on top of Astronomy Engine (MIT, vendor/astronomy.mjs).
// Everything here is computed on the phone, offline: twilight, golden and blue hour, moon phase and
// rise/set, where the galactic core and the Milky Way band stand in the sky, meteor showers.
import * as A from '../vendor/astronomy.mjs';

export const TZ = 'Europe/Zurich';
const H = 3600e3;

export const observer = (spot) => new A.Observer(spot.lat, spot.lon, spot.elev || 0);

export function sunAt(date, spot) {
  const t = A.MakeTime(date), o = observer(spot);
  const eq = A.Equator('Sun', t, o, true, true);
  const h = A.Horizon(t, o, eq.ra, eq.dec, 'normal');
  return { alt: h.altitude, az: h.azimuth };
}

export function moonAt(date, spot) {
  const t = A.MakeTime(date), o = observer(spot);
  const eq = A.Equator('Moon', t, o, true, true);
  const h = A.Horizon(t, o, eq.ra, eq.dec, 'normal');
  const ill = A.Illumination('Moon', t);
  const phase = A.MoonPhase(t);
  return { alt: h.altitude, az: h.azimuth, illum: ill.phase_fraction, phase, waxing: phase < 180, name: phaseName(phase) };
}

export function phaseName(phase) {
  const p = ((phase % 360) + 360) % 360;
  if (p < 11.25 || p >= 348.75) return 'New moon';
  if (p < 78.75) return 'Waxing crescent';
  if (p < 101.25) return 'First quarter';
  if (p < 168.75) return 'Waxing gibbous';
  if (p < 191.25) return 'Full moon';
  if (p < 258.75) return 'Waning gibbous';
  if (p < 281.25) return 'Last quarter';
  return 'Waning crescent';
}

// A point given in galactic coordinates (l, b in degrees) as seen from the spot: { alt, az }.
// The core of the Milky Way (Sagittarius A*) is l = 0, b = 0.
export function galacticAt(l, b, date, spot) {
  const t = A.MakeTime(date);
  const rot = A.CombineRotation(A.Rotation_GAL_EQJ(), A.Rotation_EQJ_HOR(t, observer(spot)));
  const v = A.RotateVector(rot, A.VectorFromSphere(new A.Spherical(b, l, 1), t));
  const s = A.HorizonFromVector(v, 'normal');
  return { alt: s.lat, az: s.lon };
}
export const coreAt = (date, spot) => galacticAt(0, 0, date, spot);

// the Milky Way band as polylines (centre line and both edges, ~±10° wide) for the sky charts
export function milkyWayBand(date, spot, step = 4) {
  const t = A.MakeTime(date);
  const rot = A.CombineRotation(A.Rotation_GAL_EQJ(), A.Rotation_EQJ_HOR(t, observer(spot)));
  const line = (b) => {
    const pts = [];
    for (let l = -180; l <= 180; l += step) {
      const s = A.HorizonFromVector(A.RotateVector(rot, A.VectorFromSphere(new A.Spherical(b, l, 1), t)), 'normal');
      // brightness along the band: the core region (Sagittarius-Scorpius) is far brighter than the anticentre
      const glow = 0.25 + 0.75 * Math.exp(-((l / 50) ** 2));
      pts.push({ l, alt: s.lat, az: s.lon, glow });
    }
    return pts;
  };
  return { centre: line(0), north: line(9), south: line(-9) };
}

// ---- time helpers (Swiss local time, whatever the phone's zone) ----
const fmtCache = new Map();
const fmt = (opts) => {
  const k = JSON.stringify(opts);
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat('en-GB', { timeZone: TZ, ...opts }));
  return fmtCache.get(k);
};
export const hhmm = (d) => (d ? fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d) : '–');
export const dayLabel = (d) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d);
export const weekday = (d) => fmt({ weekday: 'short' }).format(d);
export const longDate = (d) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d);

export function zurichParts(d) {
  const p = Object.fromEntries(fmt({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}
// UTC instant of local midnight (Europe/Zurich) of the local day containing `d`, shifted by `addDays`.
// Swiss time is UTC+1 or UTC+2, so local midnight is one of two instants.
export function localMidnight(d, addDays = 0) {
  const p = zurichParts(d);
  const target = new Date(Date.UTC(p.y, p.m - 1, p.d + addDays));
  for (const off of [1, 2]) {
    const cand = new Date(target.getTime() - off * H), q = zurichParts(cand);
    if (q.h === 0 && q.min === 0 && q.d === target.getUTCDate()) return cand;
  }
  return new Date(target.getTime() - H);
}
export const localHour = (d) => { const p = zurichParts(d); return p.h + p.min / 60; };
export const dayKey = (d) => { const p = zurichParts(d); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };
export const dayOfYear = (d) => { const p = zurichParts(d); return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(p.y, 0, 1)) / 864e5) + 1; };

// ---- events of one local day ----
function searchAlt(body, o, dir, start, alt, limit = 1.2) {
  const r = A.SearchAltitude(body, o, dir, A.MakeTime(start), limit, alt);
  return r ? r.date : null;
}
function searchRiseSet(body, o, dir, start, limit = 1.2) {
  const r = A.SearchRiseSet(body, o, dir, A.MakeTime(start), limit);
  return r ? r.date : null;
}
const within = (t, a, b) => (t && t >= a && t < b ? t : null);

// sunrise, sunset, the twilights, golden and blue hours and the moon for the local day containing `date`
export function dayEvents(date, spot) {
  const o = observer(spot), d0 = localMidnight(date), d1 = new Date(d0.getTime() + 24 * H);
  const e = {
    day: d0,
    sunrise: within(searchRiseSet('Sun', o, +1, d0), d0, d1),
    sunset: within(searchRiseSet('Sun', o, -1, d0), d0, d1),
    civilDawn: within(searchAlt('Sun', o, +1, d0, -6), d0, d1),
    civilDusk: within(searchAlt('Sun', o, -1, d0, -6), d0, d1),
    nauticalDawn: within(searchAlt('Sun', o, +1, d0, -12), d0, d1),
    nauticalDusk: within(searchAlt('Sun', o, -1, d0, -12), d0, d1),
    astroDawn: within(searchAlt('Sun', o, +1, d0, -18), d0, d1),
    astroDusk: within(searchAlt('Sun', o, -1, d0, -18), d0, d1),
    goldenMorningEnd: within(searchAlt('Sun', o, +1, d0, 6), d0, d1),
    goldenEveningStart: within(searchAlt('Sun', o, -1, d0, 6), d0, d1),
    blueMorningEnd: within(searchAlt('Sun', o, +1, d0, -4), d0, d1),
    blueEveningStart: within(searchAlt('Sun', o, -1, d0, -4), d0, d1),
    moonrise: within(searchRiseSet('Moon', o, +1, d0), d0, d1),
    moonset: within(searchRiseSet('Moon', o, -1, d0), d0, d1),
  };
  const noon = new Date(d0.getTime() + 12 * H);
  e.noonSun = sunAt(noon, spot);
  e.sunriseAz = e.sunrise ? sunAt(e.sunrise, spot).az : null;
  e.sunsetAz = e.sunset ? sunAt(e.sunset, spot).az : null;
  e.moon = moonAt(new Date(d0.getTime() + 22 * H), spot);
  e.moonriseAz = e.moonrise ? moonAt(e.moonrise, spot).az : null;
  e.moonsetAz = e.moonset ? moonAt(e.moonset, spot).az : null;
  return e;
}

// When does the sun really appear / disappear behind the mountains? Needs the terrain horizon
// (an array of horizon altitudes, one per `step` degrees of azimuth).
export function horizonAlt(horizon, az) {
  if (!horizon || !horizon.alts) return 0;
  const n = horizon.alts.length, step = 360 / n, x = (((az % 360) + 360) % 360) / step;
  const i = Math.floor(x) % n, j = (i + 1) % n, f = x - Math.floor(x);
  return horizon.alts[i] * (1 - f) + horizon.alts[j] * f;
}
export function terrainSun(date, spot, horizon, ev = null) {
  if (!horizon || !horizon.alts) return null;
  const e = ev || dayEvents(date, spot);
  const above = (t) => { const s = sunAt(t, spot); return s.alt > horizonAlt(horizon, s.az) + 0.25; };
  let rise = null, set = null;
  // only the hours after sunrise and before sunset can hide the sun behind a ridge
  if (e.sunrise) for (let m = 0; m <= 300; m += 3) { const t = new Date(e.sunrise.getTime() + m * 60e3); if (above(t)) { rise = t; break; } }
  if (e.sunset) for (let m = 0; m <= 300; m += 3) { const t = new Date(e.sunset.getTime() - m * 60e3); if (above(t)) { set = t; break; } }
  return { rise, set };
}

// ---- the night that starts on the evening of `date` ----
// Samples every 10 minutes from sunset to sunrise: darkness, the moon, the galactic core.
export function nightInfo(date, spot, horizon = null) {
  const o = observer(spot), d0 = localMidnight(date);
  const noon = new Date(d0.getTime() + 12 * H), nextNoon = new Date(noon.getTime() + 24 * H);
  const sunset = searchRiseSet('Sun', o, -1, noon) || new Date(noon.getTime() + 8 * H);
  const sunrise = searchRiseSet('Sun', o, +1, sunset) || new Date(nextNoon.getTime() - 6 * H);
  const astroDusk = searchAlt('Sun', o, -1, noon, -18);
  const astroDawn = astroDusk ? searchAlt('Sun', o, +1, astroDusk, -18) : null;
  const darkStart = astroDusk && astroDusk < nextNoon ? astroDusk : null;
  const darkEnd = darkStart && astroDawn ? astroDawn : null;
  const samples = [];
  for (let t = sunset.getTime(); t <= sunrise.getTime(); t += 10 * 60e3) {
    const d = new Date(t), sun = sunAt(d, spot), moon = moonAt(d, spot), core = coreAt(d, spot);
    const coreHorizon = horizonAlt(horizon, core.az);
    samples.push({
      t: d, sunAlt: sun.alt, moonAlt: moon.alt, moonAz: moon.az, illum: moon.illum,
      coreAlt: core.alt, coreAz: core.az, coreClear: core.alt - Math.max(coreHorizon, 0),
      dark: sun.alt <= -18, moonUp: moon.alt > -0.5,
      // moonlight that matters: a bright moon above the horizon (a thin crescent is harmless)
      moonBright: moon.alt > -0.5 && moon.illum > 0.15 ? moon.illum * Math.min(1, (moon.alt + 3) / 15) : 0,
    });
  }
  const windows = (pred) => {
    const out = []; let cur = null;
    for (const s of samples) {
      if (pred(s)) { if (!cur) cur = { start: s.t, end: s.t, best: s }; cur.end = s.t; if (s.coreAlt > cur.best.coreAlt) cur.best = s; }
      else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out;
  };
  const darkMoonless = windows((s) => s.dark && s.moonBright < 0.08);
  const core = windows((s) => s.dark && s.moonBright < 0.12 && s.coreClear > 3);
  const moon = moonAt(darkStart || new Date(sunset.getTime() + 2 * H), spot);
  const minutes = (ws) => ws.reduce((a, w) => a + (w.end - w.start) / 60e3 + 10, 0);
  return {
    sunset, sunrise, darkStart, darkEnd, samples, moon,
    darkMoonless, darkMoonlessMinutes: minutes(darkMoonless),
    core, coreMinutes: minutes(core),
    coreBest: core.length ? core.reduce((a, w) => (w.best.coreAlt > a.best.coreAlt ? w : a)).best : null,
    // core above the horizon at all during darkness (ignoring the moon): is it Milky Way season?
    coreSeason: samples.some((s) => s.dark && s.coreClear > 3),
  };
}

// Moon phases (new, first quarter, full, last quarter) between two dates
export function moonQuarters(from, to) {
  const out = []; let t = A.MakeTime(from);
  for (let i = 0; i < 20; i++) {
    const q = A.SearchMoonQuarter(t);
    if (!q || q.time.date > to) break;
    out.push({ date: q.time.date, quarter: q.quarter, name: ['New moon', 'First quarter', 'Full moon', 'Last quarter'][q.quarter] });
    t = A.MakeTime(new Date(q.time.date.getTime() + 864e5));
  }
  return out;
}

// Major meteor showers: typical peak (month, day), activity span in days around it, zenithal hourly rate.
export const METEOR_SHOWERS = [
  { name: 'Quadrantids', m: 1, d: 4, span: 1, zhr: 110, note: 'Short, sharp peak; best after midnight, radiant in the north-east.' },
  { name: 'Lyrids', m: 4, d: 22, span: 2, zhr: 18, note: 'Best in the second half of the night.' },
  { name: 'Eta Aquariids', m: 5, d: 6, span: 3, zhr: 50, note: 'Low radiant from Switzerland: only the hour before dawn.' },
  { name: 'Perseids', m: 8, d: 12, span: 3, zhr: 100, note: 'Warm nights, bright meteors; the Milky Way is up too.' },
  { name: 'Draconids', m: 10, d: 8, span: 1, zhr: 10, note: 'Evening shower; sometimes surprises.' },
  { name: 'Orionids', m: 10, d: 21, span: 3, zhr: 20, note: 'After midnight, fast meteors from Halley\'s comet.' },
  { name: 'Leonids', m: 11, d: 17, span: 2, zhr: 15, note: 'After midnight.' },
  { name: 'Geminids', m: 12, d: 14, span: 2, zhr: 150, note: 'The richest shower of the year, active all night.' },
  { name: 'Ursids', m: 12, d: 22, span: 1, zhr: 10, note: 'Radiant near the Little Dipper, visible all night.' },
];
export function meteorShowersNear(date, days = 2) {
  const p = zurichParts(date), out = [];
  for (const s of METEOR_SHOWERS) {
    for (const y of [p.y - 1, p.y, p.y + 1]) {
      const peak = Date.UTC(y, s.m - 1, s.d), now = Date.UTC(p.y, p.m - 1, p.d);
      const off = Math.round((peak - now) / 864e5);
      if (off >= -s.span && off <= days + s.span) out.push({ ...s, peak: new Date(peak), daysToPeak: off });
    }
  }
  return out;
}

// "how high is it?" in hands at arm's length: a fist is about 10°, a spread hand about 20°
export function fists(alt) {
  if (alt < 1) return 'on the horizon';
  const f = alt / 10;
  if (f < 0.75) return 'less than a fist above the horizon';
  if (f < 1.25) return 'one fist above the horizon';
  return `${(Math.round(f * 2) / 2).toString().replace('.5', '½')} fists above the horizon`;
}

// The bright planets of the night that starts on the evening of `date`: when each is well above the
// horizon in a dark enough sky, where it stands highest, and how bright it is.
export function planetsTonight(date, spot) {
  const o = observer(spot), noon = new Date(localMidnight(date).getTime() + 12 * H);
  const sunset = searchRiseSet('Sun', o, -1, noon) || new Date(noon.getTime() + 8 * H);
  const sunrise = searchRiseSet('Sun', o, +1, sunset) || new Date(noon.getTime() + 20 * H);
  const out = [];
  for (const body of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) {
    let first = null, last = null, best = null;
    for (let t = sunset.getTime(); t <= sunrise.getTime(); t += 15 * 60e3) {
      const d = new Date(t);
      if (sunAt(d, spot).alt > -5) continue;
      const time = A.MakeTime(d), eq = A.Equator(body, time, o, true, true), h = A.Horizon(time, o, eq.ra, eq.dec, 'normal');
      if (h.altitude < 6) continue;
      if (!first) first = d;
      last = d;
      if (!best || h.altitude > best.alt) best = { t: d, alt: h.altitude, az: h.azimuth };
    }
    if (best && last - first >= 30 * 60e3) out.push({ name: body, from: first, to: last, best, mag: A.Illumination(body, A.MakeTime(best.t)).mag });
  }
  return out.sort((a, b) => a.mag - b.mag);
}

// longest shutter for point-like stars: the "500 rule" and a stricter one for large prints
export const starShutter = (focal, crop = 1) => ({ ok: Math.floor(500 / (focal * crop)), sharp: Math.floor(300 / (focal * crop)) });
