// Photo opportunities: turns the MeteoSwiss forecast (plus meteoblue's night sky, the moon, the Milky
// Way, autumn-colour statistics and space weather) into "go here, at this time, for this" with a score
// from 0 to 100 and the reasons in plain words. Pure functions: runs in the page and in Node tests.
import { sunAt, moonAt, coreAt, galacticAt, dayEvents, localMidnight, localHour, dayOfYear, zurichParts, hhmm, horizonAlt, meteorShowersNear, fists, terrainSun, TZ } from './astro.js';
import { distance, destination, compass, compassWords } from './geo.js';
import { PHENO_STATIONS, PHENO_TREND } from '../data/phenology.js';
import { at as mbAt, seeingWords } from './sources/meteoblue.js';
import { wildlifeOps } from './wildlife.js';

const H = 3600e3;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (x, x0, x1, y0, y1) => y0 + (y1 - y0) * clamp((x - x0) / (x1 - x0));
const avg = (a) => { const v = a.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const sum = (a) => a.filter((x) => x != null && Number.isFinite(x)).reduce((s, x) => s + x, 0);
const has = (spot, ...tags) => tags.some((t) => (spot.tags || []).includes(t));

export const TYPES = {
  sunrise: { label: 'Sunrise light', icon: '🌅', group: 'light' },
  sunset: { label: 'Sunset light', icon: '🌇', group: 'light' },
  fogsea: { label: 'Sea of fog', icon: '☁️', group: 'fog' },
  mist: { label: 'Fog & mist', icon: '🌫️', group: 'fog' },
  mirror: { label: 'Mirror lake', icon: '🪞', group: 'water' },
  lightning: { label: 'Lightning', icon: '⚡', group: 'storm' },
  rainbow: { label: 'Rainbow', icon: '🌈', group: 'storm' },
  clearing: { label: 'Storm light', icon: '🌦️', group: 'storm' },
  freshsnow: { label: 'Fresh snow', icon: '❄️', group: 'winter' },
  ice: { label: 'Frozen lake', icon: '🧊', group: 'winter' },
  hoarfrost: { label: 'Hoarfrost', icon: '🌨️', group: 'winter' },
  autumn: { label: 'Autumn colours', icon: '🍂', group: 'season' },
  waterfall: { label: 'Waterfall power', icon: '💧', group: 'water' },
  foehn: { label: 'Foehn clarity', icon: '💨', group: 'storm' },
  stars: { label: 'Starry night', icon: '✨', group: 'night' },
  milkyway: { label: 'Milky Way', icon: '🌌', group: 'night' },
  meteors: { label: 'Meteor shower', icon: '🌠', group: 'night' },
  aurora: { label: 'Northern lights', icon: '🟢', group: 'night' },
  bluehour: { label: 'Blue hour', icon: '🏙️', group: 'light' },
  wildlife: { label: 'Wildlife', icon: '🦌', group: 'wildlife' },
};

// Lowland reference points for the sea of fog: Mittelland, Rhine and Rhône valleys, Ticino.
export const LOWLAND_REFS = [
  { id: 'bern', lat: 46.948, lon: 7.447, elev: 540 }, { id: 'zurich', lat: 47.377, lon: 8.540, elev: 410 },
  { id: 'luzern', lat: 47.050, lon: 8.310, elev: 435 }, { id: 'olten', lat: 47.350, lon: 7.903, elev: 400 },
  { id: 'neuchatel', lat: 46.990, lon: 6.930, elev: 430 }, { id: 'lausanne', lat: 46.520, lon: 6.630, elev: 450 },
  { id: 'thun', lat: 46.758, lon: 7.628, elev: 560 }, { id: 'stgallen', lat: 47.424, lon: 9.376, elev: 670 },
  { id: 'buchs', lat: 47.168, lon: 9.478, elev: 450 }, { id: 'basel', lat: 47.559, lon: 7.588, elev: 260 },
  { id: 'schaffhausen', lat: 47.697, lon: 8.634, elev: 400 }, { id: 'geneva', lat: 46.204, lon: 6.143, elev: 380 },
  { id: 'interlaken', lat: 46.686, lon: 7.863, elev: 570 }, { id: 'altdorf', lat: 46.880, lon: 8.641, elev: 450 },
  { id: 'chur', lat: 46.850, lon: 9.530, elev: 590 }, { id: 'sion', lat: 46.233, lon: 7.360, elev: 490 },
  { id: 'locarno', lat: 46.170, lon: 8.795, elev: 200 }, { id: 'lugano', lat: 46.004, lon: 8.951, elev: 275 },
  { id: 'fribourg', lat: 46.806, lon: 7.161, elev: 580 }, { id: 'winterthur', lat: 47.500, lon: 8.724, elev: 440 },
];

// ---------- forecast access ----------
export function idx(fc, t) {
  if (!fc || !fc.t || !fc.t.length) return -1;
  const i = Math.round((t - fc.t[0]) / H);
  return i >= 0 && i < fc.t.length ? i : -1;
}
export function val(fc, key, t) { const i = idx(fc, t); return i < 0 || !fc[key] ? null : fc[key][i]; }
// accumulated values (precipitation, snowfall, sunshine) are for the hour *ending* at the time stamp
const acc = (fc, key, t) => val(fc, key, t + H);
function window(fc, key, from, to) { const out = []; for (let t = from; t <= to; t += H) out.push(val(fc, key, t)); return out; }
const accSum = (fc, key, from, to) => sum(window(fc, key, from + H, to));

// ---------- the context: astronomy and lookups shared by all spots ----------
export function makeContext({ now = new Date(), refs = [], grid = null, kp = null, live = null } = {}) {
  return { now, refs, grid, kp, live, _days: new Map(), _nights: new Map() };
}
// sun events per region (0.25°) and day: all spots in a valley share them
function daysFor(ctx, spot, n = 6) {
  const key = `${spot.lat.toFixed(1)},${(Math.round(spot.lon * 4) / 4).toFixed(2)},${Math.round((spot.elev || 0) / 1500)}`;
  if (!ctx._days.has(key)) {
    const out = [];
    for (let d = -1; d < n; d++) out.push(dayEvents(localMidnight(ctx.now, d), spot));
    ctx._days.set(key, out);
  }
  return ctx._days.get(key);
}
// 15-minute samples of the sun, moon and galactic core for a night, per region; the spot's horizon is applied after
function nightSamples(ctx, spot, day) {
  // half-degree regions: a few minutes of difference in timing, a fraction of a degree in position
  const rl = Math.round(spot.lat * 2) / 2, ro = Math.round(spot.lon * 2) / 2;
  const key = `${rl},${ro},${day.getTime()}`;
  if (!ctx._nights.has(key)) {
    spot = { lat: rl, lon: ro, elev: 1000 };
    const from = day.getTime() + 15 * H, to = day.getTime() + 33 * H, s = [];
    for (let t = from; t <= to; t += 15 * 60e3) {
      const d = new Date(t), sun = sunAt(d, spot);
      if (sun.alt > -1) { if (s.length) break; continue; }
      const moon = moonAt(d, spot), core = coreAt(d, spot), cyg = galacticAt(75, 0, d, spot);
      s.push({ t, sunAlt: sun.alt, moonAlt: moon.alt, moonAz: moon.az, illum: moon.illum, coreAlt: core.alt, coreAz: core.az, bandAlt: cyg.alt, bandAz: cyg.az });
    }
    ctx._nights.set(key, s);
  }
  return ctx._nights.get(key);
}

function refsNear(ctx, spot) {
  return ctx.refs.filter((r) => r.fc && r.elev < (spot.elev || 0) - 250)
    .map((r) => ({ ...r, d: distance(spot, r) })).filter((r) => r.d < 75000).sort((a, b) => a.d - b.d).slice(0, 3);
}
export function gridAt(grid, p, key, t) {
  if (!grid || !grid.cells) return null;
  let best = -1, bd = Infinity;
  grid.cells.forEach((c, i) => { const d = (c.lat - p.lat) ** 2 + ((c.lon - p.lon) * 0.68) ** 2; if (d < bd) { bd = d; best = i; } });
  if (best < 0 || bd > 0.06) return null; // more than ~25 km from any cell: outside the grid
  return val(grid.series[best], key, t);
}

// ---------- autumn colours ----------
const SPECIES_OF = { larch: 'larch', beech: 'beech', chestnut: 'chestnut', maple: 'maple' };
export function autumnWindow(spot, year) {
  const doyToDate = (doy) => new Date(Date.UTC(year, 0, doy, 11));
  if (has(spot, 'vineyard')) return { species: 'vines', peak: doyToDate(298), from: doyToDate(286), to: doyToDate(312), source: 'typical for Swiss vineyards' };
  const sp = Object.keys(SPECIES_OF).find((k) => has(spot, k));
  if (!sp) return null;
  const near = PHENO_STATIONS.filter((s) => s[sp]).map((s) => ({ s, d: distance(spot, s) })).sort((a, b) => a.d - b.d).slice(0, 4);
  if (!near.length) return null;
  const slope = PHENO_TREND[sp].perHundredMetres / 100;
  let wsum = 0, col = 0, fall = 0, fsum = 0;
  for (const { s, d } of near) {
    const w = 1 / Math.max(5000, d) ** 1.5;
    col += w * (s[sp][0] + slope * ((spot.elev || s.alt) - s.alt)); wsum += w;
    if (s[sp][1]) { fall += w * (s[sp][1] + slope * ((spot.elev || s.alt) - s.alt)); fsum += w; }
  }
  const peakDoy = Math.round(col / wsum), fallDoy = fsum ? Math.round(fall / fsum) : peakDoy + 14;
  return { species: sp, peak: doyToDate(peakDoy), from: doyToDate(peakDoy - 6), to: doyToDate(Math.max(peakDoy + 4, Math.round((peakDoy + fallDoy) / 2))), stations: near.map((x) => x.s.name), source: 'MeteoSwiss phenology, median 2011-2025' };
}

// ---------- ice on alpine lakes (an estimate: season, altitude and recent cold) ----------
export function iceLikely(spot, fc, now) {
  if (!has(spot, 'lake', 'frozen')) return { likely: false };
  const m = zurichParts(now).m, elev = spot.elev || 0;
  const past = avg(window(fc, 'temp', now.getTime() - 48 * H, now.getTime()));
  const winter = [12, 1, 2, 3].includes(m) || (m === 4 && elev > 1900) || (m === 11 && elev > 1800 && past != null && past < -2);
  if (elev >= 1500 && winter) return { likely: true, why: `${m === 11 ? 'Late autumn' : 'Winter'} at ${Math.round(elev)} m: alpine lakes are usually frozen` };
  if (has(spot, 'frozen') && elev >= 800 && [1, 2].includes(m) && past != null && past < -4) return { likely: true, why: 'A cold spell: this lake freezes in hard winters' };
  return { likely: false, past };
}

// ---------- detectors ----------
function op(type, spot, start, end, score, title, why, extra = {}) {
  return { ...extra, type, spotId: spot.id, start: new Date(start), end: new Date(end), peak: new Date(extra.peak || start), score: Math.round(clamp(score, 0, 100)), title, why: why.filter(Boolean) };
}

function goldenHours(spot, fc, ctx, days) {
  const out = [];
  for (const d of days) {
    for (const kind of ['sunrise', 'sunset']) {
      const ev = d[kind]; if (!ev) continue;
      const t = ev.getTime(), az = kind === 'sunrise' ? d.sunriseAz : d.sunsetAz;
      if (idx(fc, t) < 0) continue;
      const L = val(fc, 'low', t), M = val(fc, 'mid', t), Hc = val(fc, 'high', t);
      if (L == null) continue;
      const rain = Math.max(acc(fc, 'precip', t) || 0, acc(fc, 'precip', t - H) || 0);
      const colour = Math.max(Hc || 0, (M || 0) * 0.85);
      const colourPotential = colour < 8 ? 0.42 : colour < 85 ? 1 - Math.abs(colour - 45) / 70 : 0.25;
      // the sun has to reach the clouds: low cloud toward the sun (from the grid, 40 km out) or at the spot blocks it
      const toward = destination(spot, az, 40000);
      const lowToward = gridAt(ctx.grid, toward, 'low', t);
      const block = Math.max(L, lowToward ?? L * 0.8) / 100;
      // sunsets are never certain: the light score tops out at 'great', a few points of drama aside
      let s = 90 * (0.18 + 0.52 * colourPotential + 0.3 * (1 - block)) * (1 - clamp(rain / 2, 0, 0.7));
      const why = [];
      if (colour >= 20 && colour <= 75 && block < 0.5) why.push(`${Math.round(colour)} % ${Hc >= (M || 0) ? 'high' : 'mid-level'} clouds to catch the colour`);
      else if (colour < 8) why.push('Clear sky: clean light, little drama in the sky');
      else if (colour > 85) why.push('Thick cloud deck: colour only if the sun finds a gap');
      if (lowToward != null && lowToward < 30) why.push(`Clear toward the ${compassWords(az)}, the sun can light the clouds from below`);
      if (block > 0.6) why.push(`Low cloud ${Math.round(L)} % at the spot${lowToward != null ? `, ${Math.round(lowToward)} % toward the sun` : ''}`);
      if (rain > 0.2) why.push('Showers around');
      let title = kind === 'sunrise' ? 'Sunrise light' : 'Sunset glow';
      if (colourPotential > 0.75 && block < 0.4) { title = kind === 'sunrise' ? 'Fiery sunrise possible' : 'Fiery sunset possible'; s += 6; }
      if (has(spot, 'peaks', 'alpenglow') && (val(fc, 'cloud', t) ?? 100) < 35) { title = 'Alpenglow on the peaks'; why.unshift('Clear sky: the summits turn pink'); s = Math.max(s, 72); if (has(spot, 'alpenglow')) s += 8; }
      const hz = spot.horizon && spot.horizon.alts ? terrainSun(ev, spot, spot.horizon, d) : null;
      if (hz && kind === 'sunrise' && hz.rise && hz.rise - ev > 20 * 60e3) why.push(`The sun clears the ridge at ${hhmm(hz.rise)} (${Math.round((hz.rise - ev) / 60e3)} min after sunrise)`);
      if (hz && kind === 'sunset' && hz.set && ev - hz.set > 20 * 60e3) why.push(`The sun drops behind the mountains at ${hhmm(hz.set)}`);
      why.push(`${kind === 'sunrise' ? 'Sunrise' : 'Sunset'} ${hhmm(ev)}, in the ${compassWords(az)}`);
      const start = kind === 'sunrise' ? (d.civilDawn || ev).getTime() : (d.goldenEveningStart || ev).getTime();
      const end = kind === 'sunrise' ? (d.goldenMorningEnd || ev).getTime() : (d.civilDusk || ev).getTime();
      out.push(op(kind, spot, start, end, s, title, why, { peak: t, az }));
    }
    // blue hour for city lights
    if (has(spot, 'city', 'bluehour', 'castle') && d.blueEveningStart && idx(fc, d.blueEveningStart.getTime()) >= 0) {
      const t = d.blueEveningStart.getTime(), rain = acc(fc, 'precip', t) || 0, c = val(fc, 'cloud', t) ?? 50;
      const s = 62 - rain * 15 + (c > 20 && c < 80 ? 6 : 0);
      out.push(op('bluehour', spot, t, (d.civilDusk || d.blueEveningStart).getTime() + 15 * 60e3, s, 'Blue hour with the lights on', [`Blue hour from ${hhmm(d.blueEveningStart)}`, rain > 0.2 ? 'Wet streets: reflections' : '']));
    }
  }
  return out;
}

function seaOfFog(spot, fc, ctx, days) {
  if (!has(spot, 'fogsea')) return [];
  const refs = refsNear(ctx, spot);
  if (!refs.length) return [];
  const out = [];
  for (const d of days) {
    const day0 = d.day.getTime(), hours = [];
    for (let t = day0 + 5 * H; t <= day0 + 19 * H; t += H) {
      if (idx(fc, t) < 0) continue;
      const refLow = avg(refs.map((r) => val(r.fc, 'low', t))), refT = avg(refs.map((r) => val(r.fc, 'temp', t)));
      const refElev = avg(refs.map((r) => r.elev));
      const L = val(fc, 'low', t), C = val(fc, 'cloud', t), rh = val(fc, 'rh', t), T = val(fc, 'temp', t);
      if (refLow == null || L == null) continue;
      const lapse = T != null && refT != null ? (T - refT) + 0.0065 * ((spot.elev || 0) - refElev) : 0; // > 0: warmer up here than a normal atmosphere = inversion
      let s = lerp(refLow, 60, 95, 0, 1) * lerp(L, 50, 10, 0, 1) * lerp(C ?? L, 85, 30, 0.3, 1) * lerp(rh ?? 70, 95, 75, 0.4, 1);
      s *= lerp(lapse, 0, 6, 0.75, 1.1);
      hours.push({ t, s, refLow, L, lapse });
    }
    const good = hours.filter((h) => h.s > 0.45);
    if (!good.length) continue;
    const best = good.reduce((a, b) => (b.s > a.s ? b : a));
    const sunrise = d.sunrise ? d.sunrise.getTime() : day0 + 7 * H;
    const morning = good.some((h) => Math.abs(h.t - sunrise) <= 1.5 * H);
    const why = [`Lowlands under ${Math.round(best.refLow)} % low cloud (${refs.map((r) => r.id[0].toUpperCase() + r.id.slice(1)).join(', ')})`,
      `${Math.round(best.L)} % low cloud up here: you should be above it`,
      best.lapse > 2 ? `Inversion: ${best.lapse.toFixed(0)} °C warmer than normal for the altitude` : '',
      morning ? `Sunrise ${hhmm(d.sunrise)} over the fog` : ''];
    out.push(op('fogsea', spot, good[0].t, good[good.length - 1].t + H, 100 * best.s + (morning ? 10 : 0), morning ? 'Sea of fog at sunrise' : 'Sea of fog', why, { peak: morning ? sunrise : best.t }));
  }
  return out;
}

function mistAndFog(spot, fc, ctx, days) {
  if (!has(spot, 'mist', 'lowland', 'lake', 'valley', 'river') || has(spot, 'fogsea')) return [];
  const out = [];
  for (const d of days) {
    if (!d.sunrise) continue;
    const sr = d.sunrise.getTime();
    if (idx(fc, sr) < 0) continue;
    const rh = val(fc, 'rh', sr), T = val(fc, 'temp', sr), dew = val(fc, 'dew', sr), wind = val(fc, 'wind', sr);
    const L = val(fc, 'low', sr), code = val(fc, 'code', sr);
    const spread = T != null && dew != null ? T - dew : 3;
    const nightClear = avg(window(fc, 'cloud', sr - 6 * H, sr - 2 * H));
    const foggy = code === 45 || code === 48 || (L != null && L > 85 && rh > 95);
    const mist = rh != null && rh >= 92 && spread <= 1.5 && (wind ?? 5) <= 6;
    if (!foggy && !mist) continue;
    // does the sun break through afterwards? that is the moment
    const later = [1, 2, 3, 4].map((k) => ({ k, sun: acc(fc, 'sun', sr + k * H) || 0, low: val(fc, 'low', sr + k * H) }));
    const clears = later.find((x) => x.sun > 1200 && (x.low ?? 100) < 70);
    let s = foggy ? 58 : 52;
    if (mist && nightClear != null && nightClear < 40) s += 12;
    if (clears) s += 22;
    if ((wind ?? 0) < 3) s += 5;
    const why = [foggy ? 'Fog at dawn' : 'Ground mist likely at dawn (moist air, light wind)',
      nightClear != null && nightClear < 40 ? 'Clear night: radiation fog forms over water and meadows' : '',
      clears ? `Sun breaking through around ${hhmm(new Date(sr + clears.k * H))}` : 'May stay grey: go for moody pictures',
      T != null && T < 0 ? 'Below freezing: watch for frost' : ''];
    out.push(op('mist', spot, (d.civilDawn || d.sunrise).getTime(), sr + (clears ? (clears.k + 1) : 2) * H, s, clears ? 'Fog lifting into sunlight' : 'Misty morning', why, { peak: clears ? sr + clears.k * H : sr }));
  }
  return out;
}

function mirror(spot, fc, ctx, days, ice) {
  if (!has(spot, 'lake', 'reflection') || ice.likely) return [];
  const out = [];
  for (const d of days) {
    const cands = [];
    for (const [t, light] of [[d.sunrise, 1], [d.goldenMorningEnd, 0.85], [d.goldenEveningStart, 0.85], [d.sunset, 0.95]]) {
      if (!t || idx(fc, t.getTime()) < 0) continue;
      const w = val(fc, 'wind', t.getTime()), g = val(fc, 'gust', t.getTime()), rain = acc(fc, 'precip', t.getTime()) || 0, L = val(fc, 'low', t.getTime());
      if (w == null) continue;
      const calm = lerp(w, 2, 9, 1, 0) * lerp(g ?? w * 1.6, 8, 20, 1, 0.3);
      let s = 100 * calm * light * (rain > 0.2 ? 0.4 : 1) * (L != null && L > 90 ? 0.75 : 1) * (has(spot, 'reflection') ? 1 : 0.85);
      cands.push({ t: t.getTime(), s, w, g });
    }
    if (!cands.length) continue;
    const best = cands.reduce((a, b) => (b.s > a.s ? b : a));
    if (best.s < 40) continue;
    const why = [`Wind ${Math.round(best.w)} km/h${best.g != null ? `, gusts ${Math.round(best.g)}` : ''}: the water should be still`,
      has(spot, 'peaks') ? 'The peaks will mirror in the lake' : '', 'Calm usually lasts until the sun warms the slopes: be early'];
    out.push(op('mirror', spot, best.t - H, best.t + H, best.s, 'Mirror-calm water', why, { peak: best.t }));
  }
  return out;
}

function storms(spot, fc, ctx, days) {
  const out = [];
  const first = fc.t.findIndex((t) => t >= ctx.now.getTime() - H);
  if (first < 0) return out;
  // lightning: thunderstorm codes or energy (CAPE) with showers; best when it is dark
  let cur = null;
  const flush = () => { if (cur) { out.push(cur); cur = null; } };
  for (let i = first; i < fc.t.length; i++) {
    const t = fc.t[i], code = fc.code[i], cape = fc.cape ? fc.cape[i] : null, pr = fc.precip[i + 1] ?? fc.precip[i] ?? 0;
    const thunder = code >= 95 || (cape != null && cape >= 700 && pr >= 0.8);
    if (!thunder) { flush(); continue; }
    const sun = sunAt(new Date(t), spot);
    let s = code >= 95 ? 70 : lerp(cape, 700, 2000, 48, 66);
    if (sun.alt < -4) s += 16; else if (sun.alt < 6) s += 8;
    if (has(spot, 'lightning')) s += 8;
    if (!cur) cur = op('lightning', spot, t, t + H, s, sun.alt < -4 ? 'Night thunderstorm: lightning' : 'Thunderstorm', [
      code >= 95 ? 'MeteoSwiss model: thunderstorm' : `Unstable air (CAPE ${Math.round(cape)} J/kg) with showers`,
      sun.alt < -4 ? 'After dark: long exposures catch every bolt' : 'Dramatic clouds; lightning shows best after dusk',
      'Stay safe: shoot from a car or building, leave summits and lakesides early'], { peak: t });
    else { cur.end = new Date(t + H); if (s > cur.score) { cur.score = Math.round(clamp(s, 0, 100)); cur.peak = new Date(t); } }
  }
  flush();
  // rainbows and storm light: showers with sun, the sun low in the sky
  for (let i = Math.max(first, 1); i < fc.t.length - 2; i++) {
    const t = fc.t[i], sun = sunAt(new Date(t + H / 2), spot);
    if (sun.alt < 3 || sun.alt > 40) continue;
    const pr = fc.precip[i + 1] ?? 0, shine = fc.sun ? fc.sun[i + 1] ?? 0 : 0, prBefore = fc.precip[i] ?? 0, shineAfter = fc.sun ? fc.sun[i + 2] ?? 0 : 0;
    if ((pr >= 0.2 || prBefore >= 0.3) && shine >= 900) {
      const anti = (sun.az + 180) % 360;
      out.push(op('rainbow', spot, t, t + H, lerp(sun.alt, 40, 8, 50, 78) + (has(spot, 'waterfall') ? 4 : 0), `Rainbow chance: look ${compassWords(anti)}`,
        ['Showers and sunshine in the same hour', `Sun ${Math.round(sun.alt)}° high in the ${compassWords(sun.az)}; the bow stands opposite, in the ${compassWords(anti)}`,
          sun.alt < 15 ? 'Low sun: a tall, full arc' : ''], { peak: t + H / 2, az: anti }));
      i += 2;
    } else if (prBefore >= 0.5 && pr < 0.1 && shineAfter >= 1500 && sun.alt < 25) {
      out.push(op('clearing', spot, t, t + 2 * H, 55 + lerp(prBefore, 0.5, 4, 0, 12), 'Clearing after the rain', ['Rain moves off and the sun breaks through low: dramatic light on wet land', 'Look for shafts of light and lifting cloud'], { peak: t + H }));
      i += 2;
    }
  }
  return out;
}

function snowAndIce(spot, fc, ctx, days, ice) {
  const out = [];
  for (const d of days) {
    const candidates = [d.sunrise, d.goldenEveningStart, d.day && new Date(d.day.getTime() + 12 * H)].filter(Boolean);
    let best = null;
    for (const c of candidates) {
      const t = c.getTime(); if (idx(fc, t) < 0) continue;
      const fresh = accSum(fc, 'snow', t - 36 * H, t), cloud = val(fc, 'cloud', t), rainNow = acc(fc, 'precip', t) || 0;
      if (fresh < 4 || cloud == null || cloud > 55 || rainNow > 0.2) continue;
      const s = lerp(fresh, 4, 25, 58, 90) * lerp(cloud, 55, 10, 0.7, 1);
      if (!best || s > best.s) best = { t, s, fresh, cloud };
    }
    if (best) {
      const aut = autumnToday(spot, d.day);
      const title = ice.likely && has(spot, 'lake') ? 'Frozen lake under fresh snow' : aut ? `First snow on the ${aut === 'vines' ? 'vineyards' : 'autumn colours'}` : 'Fresh snow and blue sky';
      out.push(op(ice.likely && has(spot, 'lake') ? 'ice' : 'freshsnow', spot, best.t - H, best.t + 3 * H, best.s + (aut ? 8 : 0), title,
        [`About ${Math.round(best.fresh)} cm of fresh snow in the last day and a half (model)`, `Sky ${Math.round(best.cloud)} % cloudy`,
          aut ? 'Snow on autumn colour: a rare combination' : 'Untouched snow is best in the first morning light', ice.likely ? ice.why : ''], { peak: best.t }));
    }
    // a frozen lake in sunshine, without new snow
    if (ice.likely && !best && d.sunrise && idx(fc, d.sunrise.getTime() + 2 * H) >= 0) {
      const t = d.sunrise.getTime() + H, c = avg(window(fc, 'cloud', t, t + 4 * H));
      if (c != null && c < 30) out.push(op('ice', spot, t - H, t + 4 * H, 55 + lerp(c, 30, 5, 0, 10), 'Frozen lake in sunshine', [ice.why, 'Ice patterns, bubbles and cracks in low sun', 'Only step on ice that is officially open'], { peak: t }));
    }
    // hoarfrost: freezing fog or very humid, cold, calm nights
    const morning = d.sunrise ? d.sunrise.getTime() : null;
    if (morning && idx(fc, morning) >= 0) {
      const hrs = window(fc, 'temp', morning - 8 * H, morning).map((T, k) => ({ T, rh: val(fc, 'rh', morning - (8 - k) * H), w: val(fc, 'wind', morning - (8 - k) * H) }));
      const frosty = hrs.filter((h) => h.T != null && h.T <= -2 && (h.rh ?? 0) >= 92 && (h.w ?? 9) <= 9).length;
      if (frosty >= 4) {
        const fog = (val(fc, 'low', morning) ?? 0) > 80;
        const sunAfter = sum([1, 2, 3].map((k) => acc(fc, 'sun', morning + k * H)));
        out.push(op('hoarfrost', spot, morning - H, morning + 4 * H, 55 + frosty * 3 + (sunAfter > 3600 ? 12 : 0), fog ? 'Hoarfrost in freezing fog' : 'Frosted trees (hoarfrost)',
          [`${frosty} hours below −2 °C in near-saturated air`, fog ? 'Freezing fog builds thick white rime' : 'Rime on grass and branches', sunAfter > 3600 ? 'Then sunshine: white trees on blue sky' : ''], { peak: morning + (sunAfter > 3600 ? 2 * H : 0) }));
      }
    }
  }
  return out;
}

function autumnToday(spot, day) {
  const year = zurichParts(day).y;
  const w = autumnWindow(spot, year);
  if (!w) return null;
  return day >= w.from && day <= w.to ? w.species : null;
}

function autumn(spot, fc, ctx, days) {
  const year = zurichParts(ctx.now).y;
  const w = autumnWindow(spot, year);
  if (!w) return [];
  const out = [];
  for (const d of days) {
    const mid = d.day.getTime() + 12 * H;
    const off = (mid - w.peak.getTime()) / 864e5;
    const season = off < -12 || off > 16 ? 0 : off < -6 ? lerp(off, -12, -6, 0.3, 0.85) : off <= 6 ? 1 : lerp(off, 6, 16, 1, 0.25);
    if (season <= 0 || idx(fc, mid) < 0) continue;
    const sunH = sum(window(fc, 'sun', d.day.getTime() + 8 * H, d.day.getTime() + 18 * H)) / 3600;
    const rain = accSum(fc, 'precip', d.day.getTime() + 7 * H, d.day.getTime() + 18 * H);
    const weather = clamp(sunH / 6) * (rain > 3 ? 0.6 : 1);
    const s = 100 * season * (0.35 + 0.65 * weather);
    if (s < 40) continue;
    const name = { larch: 'Golden larches', beech: 'Beech woods in colour', chestnut: 'Chestnut woods in colour', maple: 'Maples in colour', vines: 'Golden vineyards' }[w.species];
    out.push(op('autumn', spot, d.day.getTime() + 8 * H, d.day.getTime() + 18 * H, s, name,
      [`Typical peak here around ${w.peak.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ })} (${w.source}${w.stations ? `: ${w.stations.slice(0, 2).join(', ')}` : ''})`,
        sunH >= 4 ? `About ${Math.round(sunH)} h of sunshine` : sunH >= 1.5 ? 'Some sun between clouds' : 'Mostly cloudy: soft light, saturated colours',
        rain > 3 ? 'Wet day' : ''], { peak: d.day.getTime() + (sunH > 4 ? 16 : 11) * H }));
  }
  return out;
}

function waterfalls(spot, fc, ctx, days) {
  if (!has(spot, 'waterfall')) return [];
  const out = [];
  for (const d of days) {
    const t = d.day.getTime() + 11 * H; if (idx(fc, t) < 0) continue;
    const rain48 = accSum(fc, 'precip', t - 48 * H, t), doy = dayOfYear(d.day);
    const melt = doy >= 135 && doy <= 196;
    if (rain48 < 15 && !melt) continue;
    const s = lerp(rain48, 10, 50, 50, 82) + (melt ? 10 : 0) + ((acc(fc, 'sun', t) || 0) > 1800 ? 6 : 0);
    out.push(op('waterfall', spot, t - 3 * H, t + 5 * H, s, 'Waterfall at full power', [rain48 >= 15 ? `${Math.round(rain48)} mm of rain in the last two days` : '', melt ? 'Snow-melt season' : '', 'Spray and rainbows in the sun'], { peak: t }));
  }
  return out;
}

function foehn(spot, fc, ctx, days) {
  if (spot.lat < 46.55 || (spot.elev || 0) > 2600) return [];
  const out = [];
  for (const d of days) {
    const hrs = [];
    for (let t = d.day.getTime() + 8 * H; t <= d.day.getTime() + 18 * H; t += H) {
      const dir = val(fc, 'windDir', t), g = val(fc, 'gust', t), rh = val(fc, 'rh', t);
      if (dir == null || g == null) continue;
      if (dir >= 140 && dir <= 220 && g >= 40 && (rh ?? 100) <= 50) hrs.push(t);
    }
    if (hrs.length < 2) continue;
    out.push(op('foehn', spot, hrs[0], hrs[hrs.length - 1] + H, 58 + hrs.length * 2, 'Foehn: crystal-clear air', ['Warm, dry south wind: views of 100+ km', 'Lens-shaped (lenticular) clouds over the ridges glow at sunset', 'Gusty: use a sturdy tripod'], { peak: hrs[Math.floor(hrs.length / 2)] }));
  }
  return out;
}

// the night sky: clouds from MeteoSwiss (and meteoblue when you have a key), moon, Milky Way, meteors, aurora
function nightSky(spot, fc, ctx, days, mb, ice) {
  const out = [];
  const dark = has(spot, 'darksky') ? 1 : has(spot, 'city') ? 0.55 : (spot.elev || 0) > 1500 ? 0.9 : 0.8;
  for (const d of days) {
    const samples = nightSamples(ctx, spot, d.day).filter((s) => s.sunAlt <= -18);
    if (!samples.length) continue;
    const pts = samples.filter((s) => idx(fc, s.t) >= 0);
    if (!pts.length) continue;
    const moonOk = (s) => s.moonAlt < -0.5 || s.illum < 0.15 || s.moonAlt < 3;
    const cloudAt = (t) => {
      const ms = val(fc, 'cloud', t), mbv = mb ? mbAt(mb, 'total', t) : null;
      return mbv != null && ms != null ? 0.5 * ms + 0.5 * mbv : mbv ?? ms;
    };
    const clearAt = (t) => { const c = cloudAt(t); return c == null ? 0 : (1 - c / 100) ** 1.4; };
    const hz = spot.horizon;
    const coreClear = (s) => s.coreAlt - Math.max(horizonAlt(hz, s.coreAz), 0);
    const darkMoonless = pts.filter(moonOk);
    const moonFrac = darkMoonless.length / pts.length;
    const clearDark = avg(darkMoonless.map((s) => clearAt(s.t))) ?? 0;
    const clearAll = avg(pts.map((s) => clearAt(s.t))) ?? 0;
    const rh = avg(pts.map((s) => val(fc, 'rh', s.t)));
    const transp = rh == null ? 1 : lerp(rh, 98, 70, 0.75, 1);
    const seeing = mb && mb.seeing ? avg(pts.map((s) => mbAt(mb, 'seeing', s.t))) : null;
    const jet = mb && mb.jet ? avg(pts.map((s) => mbAt(mb, 'jet', s.t))) : null;
    const mbNote = mb ? (mb.tier === 'seeing' ? `meteoblue: seeing ${seeing != null ? `${seeing.toFixed(1)}″ (${seeingWords(seeing)})` : 'n/a'}${jet != null ? `, jet stream ${Math.round(jet)} m/s` : ''}` : 'Clouds: MeteoSwiss and meteoblue combined') : '';
    const moon = pts[0];
    const moonTxt = moonFrac > 0.95 ? 'No moon in the dark hours' : moonFrac < 0.05 ? `Moon up all night (${Math.round(moon.illum * 100)} % lit)` : `Moonless for ${Math.round((darkMoonless.length * 15) / 60 * 10) / 10} h`;
    const start = pts[0].t, end = pts[pts.length - 1].t;
    const lakeNight = has(spot, 'lake', 'reflection') && !ice.likely && (avg(pts.map((s) => val(fc, 'wind', s.t))) ?? 9) < 5;
    // starry night
    const starScore = 100 * clearDark * (0.35 + 0.65 * moonFrac) * dark * transp * (seeing != null ? lerp(seeing, 2.5, 0.8, 0.92, 1.05) : 1);
    if (starScore >= 35 && darkMoonless.length) {
      out.push(op('stars', spot, darkMoonless[0].t, darkMoonless[darkMoonless.length - 1].t, starScore, lakeNight ? 'Stars mirrored in the lake' : 'Clear, dark sky',
        [`${Math.round(clearDark * 100) >= 85 ? 'Clear' : 'Mostly clear'} in the dark hours (${Math.round((1 - (avg(darkMoonless.map((s) => cloudAt(s.t))) ?? 0) / 100) * 100)} % clear)`, moonTxt,
          rh != null && rh > 90 ? 'Humid: some haze and dew on the lens' : '', mbNote, has(spot, 'darksky') ? 'Dark site, little light pollution' : ''], { peak: darkMoonless[Math.floor(darkMoonless.length / 2)].t }));
    }
    // the core of the Milky Way
    const core = pts.filter((s) => moonOk(s) && coreClear(s) > 3);
    if (core.length >= 2) {
      const best = core.reduce((a, b) => (b.coreAlt > a.coreAlt ? b : a));
      const clr = avg(core.map((s) => clearAt(s.t))) ?? 0;
      const sc = 100 * clr * dark * transp * lerp(best.coreAlt, 4, 16, 0.6, 1) * lerp(core.length, 2, 10, 0.75, 1);
      if (sc >= 35) out.push(op('milkyway', spot, core[0].t, core[core.length - 1].t + 15 * 60e3, sc, lakeNight ? 'Milky Way over still water' : 'Milky Way core',
        [`Core visible ${hhmm(new Date(core[0].t))}–${hhmm(new Date(core[core.length - 1].t + 15 * 60e3))}`, `Highest at ${hhmm(new Date(best.t))}: ${fists(best.coreAlt)} in the ${compassWords(best.coreAz)} (${Math.round(best.coreAlt)}°)`,
          `${Math.round(clr * 100)} % clear sky then`, moonTxt, hz ? 'Mountain horizon taken into account' : '', mbNote], { peak: best.t, az: best.coreAz, alt: best.coreAlt }));
    }
    // the summer Milky Way arching overhead (Cygnus), visible even where mountains hide the core
    const band = pts.filter((s) => moonOk(s) && s.bandAlt > 50);
    const coreOp = out.find((o) => o.type === 'milkyway' && o.start.getTime() >= start && o.end.getTime() <= end + H);
    if (band.length >= 4 && (!coreOp || coreOp.score < 60)) {
      const clr = avg(band.map((s) => clearAt(s.t))) ?? 0;
      const sc = 92 * clr * dark * transp * lerp(band.length, 4, 16, 0.8, 1);
      const hidden = pts.some((s) => moonOk(s) && s.coreAlt > 3) && !core.length;
      if (sc >= 35) out.push(op('milkyway', spot, band[0].t, band[band.length - 1].t + 15 * 60e3, sc, lakeNight ? 'Milky Way arch over still water' : 'Milky Way arch overhead',
        [`The Milky Way runs high across the sky ${hhmm(new Date(band[0].t))}–${hhmm(new Date(band[band.length - 1].t + 15 * 60e3))}`,
          hidden ? 'The bright core stays behind the mountains here: frame the arch vertically' : '', `${Math.round(clr * 100)} % clear`, moonTxt, mbNote], { peak: band[Math.floor(band.length / 2)].t, az: band[Math.floor(band.length / 2)].bandAz, alt: band[Math.floor(band.length / 2)].bandAlt }));
    }
    // meteor showers
    for (const sh of meteorShowersNear(d.day, 0)) {
      if (Math.abs(sh.daysToPeak) > sh.span) continue;
      const sc = 100 * clearAll * lerp(sh.zhr, 10, 120, 0.5, 1) * (0.45 + 0.55 * moonFrac) * dark * lerp(Math.abs(sh.daysToPeak), sh.span, 0, 0.6, 1);
      if (sc >= 35) out.push(op('meteors', spot, start, end, sc, `${sh.name}${sh.daysToPeak === 0 ? ' peak night' : ''}`,
        [`Up to ~${sh.zhr} meteors per hour under ideal skies`, sh.note, moonTxt, `${Math.round(clearAll * 100)} % clear`], { peak: pts[Math.floor(pts.length * 0.7)].t }));
    }
    // northern lights
    if (ctx.kp && ctx.kp.length) {
      const kpMax = Math.max(0, ...ctx.kp.filter((k) => k.t >= start - 3 * H && k.t <= end).map((k) => k.kp));
      const north = hz ? Math.max(horizonAlt(hz, 340), horizonAlt(hz, 0), horizonAlt(hz, 20)) : 0;
      if (kpMax >= 6.3) {
        const sc = lerp(kpMax, 6.3, 9, 45, 95) * clearAll * (north > 8 ? 0.6 : 1);
        if (sc >= 30) out.push(op('aurora', spot, start, end, sc, `Northern lights possible (Kp ${kpMax.toFixed(0)})`,
          [`Geomagnetic storm forecast: Kp ${kpMax.toFixed(1)} (NOAA)`, 'From Switzerland: a red-green glow low in the north, often only visible to the camera', north > 8 ? 'Mountains block much of the northern horizon here' : 'Open view to the north', `${Math.round(clearAll * 100)} % clear`], { peak: start + (end - start) / 2, az: 0 }));
      }
    }
  }
  return out;
}

// ---------- all of it, for one spot ----------
export function opportunitiesFor(spot, fc, ctx, { mb = null, days: nDays = 5 } = {}) {
  if (!fc || !fc.t || !fc.t.length) return [];
  const days = daysFor(ctx, spot, nDays);
  const ice = iceLikely(spot, fc, ctx.now);
  const all = [
    ...goldenHours(spot, fc, ctx, days), ...seaOfFog(spot, fc, ctx, days), ...mistAndFog(spot, fc, ctx, days),
    ...mirror(spot, fc, ctx, days, ice), ...storms(spot, fc, ctx, days), ...snowAndIce(spot, fc, ctx, days, ice),
    ...autumn(spot, fc, ctx, days), ...waterfalls(spot, fc, ctx, days), ...foehn(spot, fc, ctx, days),
    ...nightSky(spot, fc, ctx, days, mb, ice), ...wildlifeOps(spot, fc, ctx, days),
  ];
  const now = ctx.now.getTime();
  const inSeason = !spot.months || (() => { const m = zurichParts(ctx.now).m, [a, b] = spot.months; return a <= b ? m >= a && m <= b : m >= a || m <= b; })();
  return all.filter((o) => o.end.getTime() >= now && o.score > 0).map((o) => {
    if (!inSeason) { o.score = Math.round(o.score * 0.55); o.why.unshift('Out of season: the way up is usually closed now'); }
    return o;
  }).sort((a, b) => b.score - a.score);
}

// the best few per spot and day, for the feed
export function topOpportunities(list, { perSpotDay = 2, min = 45 } = {}) {
  const seen = new Map();
  return list.filter((o) => o.score >= min).sort((a, b) => b.score - a.score).filter((o) => {
    const k = `${o.spotId}:${localMidnight(o.peak).getTime()}`;
    const n = seen.get(k) || 0; if (n >= perSpotDay) return false;
    seen.set(k, n + 1); return true;
  });
}

// a 0-100 "photo weather" number for the map at a given hour (clouds that light up, no rain, sun)
export function photoWeatherAt(fc, t) {
  const L = val(fc, 'low', t), M = val(fc, 'mid', t), Hc = val(fc, 'high', t), pr = acc(fc, 'precip', t) || 0, C = val(fc, 'cloud', t);
  if (C == null) return null;
  const drama = Math.max(Hc || 0, M || 0);
  const s = 100 * (0.55 * (1 - (L ?? C) / 100) + 0.25 * (drama > 15 && drama < 80 ? 1 : 0.5) + 0.2 * (1 - C / 100)) * (pr > 0.3 ? 0.45 : 1);
  return Math.round(clamp(s, 0, 100));
}

export const scoreWord = (s) => (s >= 88 ? 'Exceptional' : s >= 75 ? 'Great' : s >= 60 ? 'Good' : s >= 45 ? 'Worth a look' : 'Unlikely');
export const scoreClass = (s) => (s >= 88 ? 's5' : s >= 75 ? 's4' : s >= 60 ? 's3' : s >= 45 ? 's2' : 's1');
export { compass, localHour };
