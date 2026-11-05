// Wildlife chances: for each spot with species, an hour-by-hour estimate of how likely you are to see
// and photograph them, from the season (rut, young, hibernation, migration), the species' daily rhythm,
// the MeteoSwiss forecast (rain, wind, heat, sunshine, pressure, fresh snow) and the light. Plus the
// approach: where the wind carries your scent.
import { SPECIES, eventsOn } from '../data/species.js';
import { sunAt, dayEvents, localMidnight, hhmm, zurichParts, terrainSun, localHour } from './astro.js';
import { compass, compassWords } from './geo.js';

const H = 3600e3;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (x, x0, x1, y0, y1) => y0 + (y1 - y0) * clamp((x - x0) / (x1 - x0));
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const at = (fc, key, t) => { if (!fc || !fc.t || !fc[key]) return null; const i = Math.round((t - fc.t[0]) / H); return i >= 0 && i < fc.t.length ? fc[key][i] : null; };
const acc = (fc, key, t) => at(fc, key, t + H); // rain, snow and sunshine are for the hour ending at the stamp
const sumAcc = (fc, key, from, to) => { let s = 0; for (let t = from; t < to; t += H) s += acc(fc, key, t) || 0; return s; };

// how good the light is for animal pictures, 0-1, and a word for it
export function lightAt(t, spot, fc) {
  const s = sunAt(new Date(t), spot);
  if (s.alt < -8) return { q: 0, word: 'dark' };
  if (s.alt < -3) return { q: 0.35, word: 'twilight' };
  if (s.alt < 9) return { q: 1, word: 'golden' };
  const c = at(fc, 'cloud', t) ?? 50;
  if (c > 75) return { q: 0.88, word: 'soft' };
  if (s.alt > 38 && c < 30) return { q: 0.68, word: 'harsh' };
  return { q: 0.85, word: 'good' };
}

// the daily rhythm of a species, 0-1, at time t of the day with events ev
function rhythm(sp, t, ev, m) {
  const sr = ev.sunrise.getTime(), ss = ev.sunset.getTime(), noon = (sr + ss) / 2;
  const a = (t - sr) / H, b = (t - ss) / H, c = (t - noon) / H;
  switch (sp.rhythm) {
    case 'crepuscular': return Math.max(sp === SPECIES.chamois ? 0.45 : 0.28, bell(a, 0.5, 1.7), bell(b, -0.5, 1.7));
    case 'ibex': return [11, 12, 1, 2, 3].includes(m) ? Math.max(0.35, bell(c, 0, 3)) : Math.max(0.5, bell(a, 1.5, 2), bell(b, -1.5, 2));
    case 'marmot': return Math.max(0.15, bell(a, 2.5, 2.2), 0.85 * bell(b, -2.5, 2));
    case 'raptor': return Math.max(0.15, bell(c, 0.5, 3.2));
    case 'lek': return Math.max(0.04, bell(a, -0.3, 1));
    case 'waterbird': return Math.max(0.65, bell(a, 1.5, 2.5), bell(b, -1, 2));
    case 'wader': return Math.max(0.45, bell(a, 1.5, 2.5), bell(b, -1.5, 2));
    case 'songbird': return Math.max(0.25, bell(a, 1, 2));
    case 'beaver': return Math.max(0.03, bell(b, 0.3, 1.2), 0.6 * bell(a, -0.5, 1));
    case 'park': { const lh = localHour(new Date(t)); return lh >= 9 && lh <= 17.5 ? 0.85 : 0; }
    default: return Math.max(0.4, bell(a, 2.5, 3), bell(b, -2.5, 3));
  }
}

// how the weather of the hour helps or hinders a species, 0-1
function weather(sp, fc, t, midday) {
  const rain = acc(fc, 'precip', t) ?? 0, wind = at(fc, 'wind', t) ?? 5, gust = at(fc, 'gust', t) ?? wind * 1.6;
  const T = at(fc, 'temp', t), low = at(fc, 'low', t) ?? 0, rh = at(fc, 'rh', t) ?? 70, sun = acc(fc, 'sun', t) ?? 0;
  let f = 1;
  const rainSens = sp.rhythm === 'marmot' ? 0.95 : sp.rhythm === 'raptor' ? 0.9 : sp.group === 'water' ? 0.35 : sp.group === 'park' ? 0.5 : 0.7;
  if (rain > 0.1) f *= 1 - rainSens * clamp(rain / 2.5, 0.25, 1);
  if (sp.rhythm === 'raptor') f *= wind < 4 ? 0.85 : wind < 30 ? 1 : 0.6; // a breeze helps them soar
  else f *= lerp(gust, 25, 60, 1, 0.5); // gusty: animals nervous, birds sheltering
  if (sp.heat && T != null && T > 20) f *= midday ? 0.45 : 0.85; // they hide from the heat
  if (sp.cold && T != null) f *= lerp(T, -2, 6, 0.3, 1);
  if (sp.rhythm === 'raptor' && !midday) f *= 0.8;
  if (sp.rhythm === 'raptor') f *= lerp(sun, 0, 2400, 0.45, 1); // thermals need sunshine
  if (sp.rhythm === 'marmot') f *= lerp(sun, 0, 1800, 0.55, 1); // sun warms the burrows
  if (low > 90 && rh > 96) f *= 0.6; // inside the cloud: little to see
  return clamp(f);
}

// what is in season at a spot on a date
export function inSeason(spot, date) {
  const p = zurichParts(date);
  return (spot.species || []).filter((id) => SPECIES[id]).map((id) => ({ id, sp: SPECIES[id], season: SPECIES[id].season[p.m - 1], events: eventsOn(id, p.m, p.d) }))
    .sort((x, y) => y.season - x.season);
}

// where your scent goes
export function approachTip(dir, speed, t, mountain) {
  if (dir == null || speed == null) return '';
  if (speed < 3) {
    if (!mountain) return 'Almost no wind: move slowly and keep low.';
    return localHour(new Date(t)) < 11 ? 'Almost no wind: in the morning the cool air slides downhill, so come from below.' : 'Almost no wind: from late morning the air rises up the slopes, so come from above or across.';
  }
  return `Wind from the ${compassWords(dir)}: approach from the ${compassWords((dir + 180) % 360)} side so they cannot smell you.`;
}

// the whole day: hourly chances per species, the best window, and the reasons
export function wildlifeDay(spot, fc, date) {
  const list = inSeason(spot, date).filter((x) => x.season > 0.05);
  if (!list.length || !fc) return null;
  const ev = dayEvents(date, spot);
  if (!ev.sunrise || !ev.sunset) return null;
  const m = zurichParts(date).m;
  const d0 = localMidnight(date).getTime();
  const from = Math.floor(((ev.civilDawn || ev.sunrise).getTime() - H) / H) * H, to = Math.ceil(((ev.civilDusk || ev.sunset).getTime() + H) / H) * H;
  // day-wide bonuses
  const pNow = at(fc, 'pressure', d0 + 12 * H), pBefore = at(fc, 'pressure', d0);
  const falling = pNow != null && pBefore != null && pBefore - pNow >= 3;
  const fresh = sumAcc(fc, 'snow', d0 - 24 * H, d0 + 10 * H);
  const hours = [];
  for (let t = from; t <= to; t += H) {
    if (at(fc, 'temp', t) == null) continue;
    const light = lightAt(t, spot, fc);
    const noon = (ev.sunrise.getTime() + ev.sunset.getTime()) / 2, midday = Math.abs(t - noon) < 2.5 * H;
    const rainBefore = sumAcc(fc, 'precip', t - 6 * H, t - H), dryNow = (acc(fc, 'precip', t) ?? 0) < 0.1;
    const by = {};
    let total = 0, best = null;
    for (const { id, sp, season, events } of list) {
      let p = season * (sp.detect ?? 0.8) * rhythm(sp, t, ev, m) * weather(sp, fc, t, midday) * (sp.rhythm === 'park' ? Math.max(light.q, 0.8) : light.q);
      if (sp.group === 'hoofed' || sp.group === 'small') {
        if (rainBefore >= 1 && dryNow) p *= 1.06; // out to feed after the rain
        if (falling) p *= 1.04;
        if (fresh >= 3 && sp.group === 'hoofed') p *= 1.04;
      }
      if (events.some((e) => !/hibernate/i.test(e.title))) p *= 1.06;
      p = clamp(p);
      by[id] = p;
      if (p > total) { total = p; best = id; }
    }
    hours.push({ t, total, best, by, light });
  }
  if (!hours.length) return null;
  const peak = hours.reduce((a, b) => (b.total > a.total ? b : a));
  let i0 = hours.indexOf(peak), i1 = i0;
  while (i0 > 0 && hours[i0 - 1].total >= 0.75 * peak.total) i0--;
  while (i1 < hours.length - 1 && hours[i1 + 1].total >= 0.75 * peak.total) i1++;
  const sp = SPECIES[peak.best];
  const evs = list.find((x) => x.id === peak.best)?.events.filter((e) => !/hibernate/i.test(e.title)) || [];
  const T = at(fc, 'temp', peak.t), w = at(fc, 'wind', peak.t), wd = at(fc, 'windDir', peak.t), rain = acc(fc, 'precip', peak.t) ?? 0;
  const mountain = (spot.elev || 0) > 1000 || (spot.tags || []).includes('peaks');
  const tsun = spot.horizon && (sp.rhythm === 'marmot' || sp.rhythm === 'ibex') ? terrainSun(date, spot, spot.horizon, ev) : null;
  const others = Object.entries(peak.by).filter(([id, p]) => id !== peak.best && p >= 0.45 * peak.total).sort((a, b) => b[1] - a[1]).map(([id]) => SPECIES[id].name.toLowerCase());
  const why = [
    evs[0] ? evs[0].text : '',
    `Best ${hhmm(new Date(hours[i0].t))}–${hhmm(new Date(hours[i1].t + H))}${peak.light.word === 'golden' ? ', in golden light' : peak.light.word === 'soft' ? ', soft cloud light for fur detail' : peak.light.word === 'harsh' ? ' (hard midday light)' : ''}`,
    T != null ? `${Math.round(T)} °C, wind ${Math.round(w ?? 0)} km/h${rain > 0.1 ? ', showers' : ', dry'}` : '',
    tsun && tsun.rise && tsun.rise - ev.sunrise > 20 * 60e3 ? `The sun reaches the slope at ${hhmm(tsun.rise)}` : '',
    falling ? 'Pressure falling before a front: animals often feed intensively' : '',
    fresh >= 3 && (sp.group === 'hoofed' || sp.group === 'small') ? `${Math.round(fresh)} cm of fresh snow: tracks, and animals stand out` : '',
    sp.group === 'hoofed' || sp.group === 'small' ? approachTip(wd, w, peak.t, mountain) : '',
    others.length ? `Also likely: ${others.slice(0, 3).join(', ')}` : '',
  ].filter(Boolean);
  const part = peak.t < ev.sunrise.getTime() + 3.5 * H ? 'morning' : peak.t > ev.sunset.getTime() - 3.5 * H ? 'evening' : 'midday';
  const title = evs[0] ? evs[0].title : sp.rhythm === 'park' ? `${spot.name}: animals up close` : `${sp.name} ${{ morning: 'in the morning', evening: 'in the evening', midday: 'by day' }[part]}`;
  const raw = clamp(peak.total);
  const score = Math.round(100 * raw * (sp.rhythm === 'park' ? 0.75 : 1));
  return { hours, peak, start: hours[i0].t, end: hours[i1].t + H, species: peak.best, icon: sp.icon, title, why, score, ev, falling, fresh, list };
}

export function wildlifeOps(spot, fc, ctx, days) {
  if (!spot.species || !spot.species.length) return [];
  const out = [];
  for (const d of days) {
    const r = wildlifeDay(spot, fc, new Date(d.day.getTime() + 12 * H));
    if (!r || r.score < 40) continue;
    out.push({ type: 'wildlife', spotId: spot.id, start: new Date(r.start), end: new Date(r.end), peak: new Date(r.peak.t), score: r.score, title: r.title, why: r.why, icon: r.icon, species: r.species });
  }
  return out;
}
