// The day at a glance, for any date: the light from midnight to midnight, the weather region by
// region (from the MeteoSwiss grid), how high the sea of fog reaches, what is in season, and short
// notes on how to shoot each kind of chance.
import { sunAt, moonAt, dayEvents, nightInfo, localMidnight, hhmm, meteorShowersNear, zurichParts, horizonAlt, TZ } from './astro.js';
import { val, autumnWindow } from './scoring.js';
import { SPECIES, eventsOn } from '../data/species.js';

const H = 3600e3;
const avg = (a) => { const v = a.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const CENTRE = { lat: 46.8, lon: 8.23, elev: 500 };

// ---------- the light of a day ----------
// kinds: night (sun below -18°), astro, naut, blue (civil twilight), gold (-0.8° to 6°), day
export const LIGHT = {
  night: { label: 'Night', color: 'var(--sky-night)' }, astro: { label: 'Astronomical twilight', color: 'var(--sky-astro)' },
  naut: { label: 'Nautical twilight', color: 'var(--sky-naut)' }, blue: { label: 'Blue hour', color: 'var(--sky-blue)' },
  gold: { label: 'Golden hour', color: 'var(--sky-gold)' }, day: { label: 'Daylight', color: 'var(--sky-day)' },
};
const kindOf = (alt) => (alt < -18 ? 'night' : alt < -12 ? 'astro' : alt < -6 ? 'naut' : alt < -0.8 ? 'blue' : alt < 6 ? 'gold' : 'day');

// segments of the local day: [{ kind, from, to }] in ms, plus when the moon is up and, with a mountain
// horizon, when the sun really shines on the spot
// The day runs from 04:00 to 04:00, first light to the end of the night, so a night's chances stay with their evening.
export const DAY_START = 4;
export function lightBands(date, spot = CENTRE, horizon = null) {
  const d0 = localMidnight(date).getTime() + DAY_START * H, step = 5 * 60e3;
  const bands = [], moon = [], direct = [];
  let cur = null, m = null, s = null;
  for (let t = d0; t <= d0 + 24 * H; t += step) {
    const sun = sunAt(new Date(t), spot), k = kindOf(sun.alt);
    if (!cur || cur.kind !== k) { if (cur) cur.to = t; cur = { kind: k, from: t, to: t }; bands.push(cur); }
    cur.to = t + step;
    if ((t - d0) % (10 * 60e3) === 0) {
      const up = moonAt(new Date(t), spot).alt > 0;
      if (up) { if (!m) { m = { from: t, to: t }; moon.push(m); } m.to = t + 10 * 60e3; } else m = null;
    }
    if (horizon) {
      const lit = sun.alt > Math.max(0, horizonAlt(horizon, sun.az)) + 0.3;
      if (lit) { if (!s) { s = { from: t, to: t }; direct.push(s); } s.to = t + step; } else s = null;
    }
  }
  const end = d0 + 24 * H;
  for (const list of [bands, moon, direct]) for (const b of list) if (b.to > end) b.to = end;
  return { d0, bands, moon, direct };
}

// ---------- the almanac: sun, moon, Milky Way, showers and seasons for any date ----------
const SEASONS = [
  { from: '10-20', to: '02-20', icon: 'fogsea', title: 'Sea-of-fog season', text: 'Stable high pressure fills the Mittelland with fog. The Jura, Rigi, Pilatus and the Pre-Alps stand above it, often for days.' },
  { from: '12-10', to: '04-15', icon: 'ice', title: 'Frozen alpine lakes', text: 'Lakes above about 1700 m are frozen and snowed in. The high passes (Grimsel, Susten, Furka, Albula) are closed.' },
  { from: '11-25', to: '02-28', icon: 'hoarfrost', title: 'Hoarfrost and rime', text: 'Freezing fog paints trees white along the upper edge of the fog and in cold valleys.' },
  { from: '03-01', to: '10-10', icon: 'milkyway', title: 'Milky Way core season', text: 'The bright core is in the night sky: before dawn in spring, all night in summer, in the evening in autumn.' },
  { from: '04-05', to: '05-05', icon: 'autumn', title: 'Blossom', text: 'Cherry and apple trees bloom in Baselland, Thurgau and around Lake Zug; larches turn fresh green.' },
  { from: '05-10', to: '07-05', icon: 'waterfall', title: 'Snow-melt', text: 'Waterfalls and rivers run at full power; the Staubbach and the Rhine Falls are at their strongest.' },
  { from: '06-15', to: '07-31', icon: 'peak', title: 'Alpine flowers', text: 'Alpenrose and meadows in bloom between 1500 and 2300 m. The high passes open.' },
  { from: '06-01', to: '08-31', icon: 'lightning', title: 'Thunderstorm season', text: 'Evening storms build over the Pre-Alps, the Jura and Ticino on hot days.' },
  { from: '10-08', to: '11-05', icon: 'autumn', title: 'Golden larches', text: 'Larches turn gold in the Engadin, Valais and Lötschental, usually peaking in the second half of October.' },
  { from: '09-25', to: '11-10', icon: 'autumn', title: 'Autumn colours', text: 'Beech woods and vineyards (Lavaux, Bündner Herrschaft) colour from the hills down to the lakes.' },
];
const inRange = (m, d, from, to) => {
  const v = m * 100 + d, [fm, fd] = from.split('-').map(Number), [tm, td] = to.split('-').map(Number), a = fm * 100 + fd, b = tm * 100 + td;
  return a <= b ? v >= a && v <= b : v >= a || v <= b;
};

export function almanac(date, where = CENTRE, spots = []) {
  const p = zurichParts(date), noon = new Date(localMidnight(date).getTime() + 12 * H);
  const ev = dayEvents(noon, where), before = dayEvents(new Date(noon.getTime() - 24 * H), where);
  const len = ev.sunrise && ev.sunset ? (ev.sunset - ev.sunrise) / 60e3 : null;
  const lenBefore = before.sunrise && before.sunset ? (before.sunset - before.sunrise) / 60e3 : null;
  const night = nightInfo(noon, where);
  const moon = moonAt(new Date(localMidnight(date).getTime() + 22 * H), where);
  // what is in season at the spots
  const colour = new Map(), wild = new Map();
  for (const s of spots) {
    const w = autumnWindow(s, p.y);
    if (w && noon >= w.from && noon <= w.to) { const k = w.species; if (!colour.has(k)) colour.set(k, []); colour.get(k).push(s.name); }
    for (const id of s.species || []) for (const e of eventsOn(id, p.m, p.d)) {
      if (/hibernate/i.test(e.title)) continue;
      if (!wild.has(e.title)) wild.set(e.title, { text: e.text, glyph: SPECIES[id].glyph, spots: [] });
      if (!wild.get(e.title).spots.includes(s.name)) wild.get(e.title).spots.push(s.name);
    }
  }
  return {
    date: noon, ev, dayLength: len, dayChange: len != null && lenBefore != null ? Math.round(len - lenBefore) : null,
    moon, night,
    showers: meteorShowersNear(noon, 3).filter((s) => Math.abs(s.daysToPeak) <= s.span + 1),
    seasons: SEASONS.filter((s) => inRange(p.m, p.d, s.from, s.to)),
    colour: [...colour.entries()].map(([species, names]) => ({ species, names })),
    wildlife: [...wild.entries()].map(([title, v]) => ({ title, ...v })),
  };
}

// ---------- the weather, region by region ----------
export const REGIONS = [
  { id: 'jura', name: 'Jura', lat: 47.2, lon: 7.0 }, { id: 'leman', name: 'Lake Geneva', lat: 46.45, lon: 6.5 },
  { id: 'bern', name: 'Bern & Fribourg', lat: 46.9, lon: 7.3 }, { id: 'zurich', name: 'Zürich & Aargau', lat: 47.4, lon: 8.4 },
  { id: 'east', name: 'Eastern Switzerland', lat: 47.4, lon: 9.3 }, { id: 'oberland', name: 'Bernese Oberland', lat: 46.6, lon: 7.8 },
  { id: 'central', name: 'Central Switzerland', lat: 46.9, lon: 8.5 }, { id: 'valais', name: 'Valais', lat: 46.2, lon: 7.6 },
  { id: 'gr', name: 'Graubünden', lat: 46.8, lon: 9.4 }, { id: 'engadin', name: 'Engadin', lat: 46.55, lon: 9.95 },
  { id: 'ticino', name: 'Ticino', lat: 46.2, lon: 8.85 },
];
const regionOf = (c) => REGIONS.reduce((best, r) => { const d = (r.lat - c.lat) ** 2 + ((r.lon - c.lon) * 0.69) ** 2; return d < best.d ? { r, d } : best; }, { r: null, d: Infinity }).r;

export function regionWeather(grid, date) {
  if (!grid || !grid.cells || !grid.series) return null;
  const ev = dayEvents(new Date(localMidnight(date).getTime() + 12 * H), CENTRE);
  if (!ev.sunrise || !ev.sunset) return null;
  const from = Math.ceil(ev.sunrise.getTime() / H) * H, to = Math.floor(ev.sunset.getTime() / H) * H, hours = (to - from) / H;
  if (val(grid.series[0], 'cloud', from + 2 * H) == null) return null; // no forecast for this day
  const acc = new Map(REGIONS.map((r) => [r.id, { ...r, sun: [], cloud: [], fog: [], rain: [], tmin: [], tmax: [], thunder: false }]));
  grid.cells.forEach((c, i) => {
    const s = grid.series[i], r = acc.get(regionOf(c).id);
    if (!s) return;
    let sun = 0, rain = 0, tmin = Infinity, tmax = -Infinity; const cl = [];
    for (let t = from; t <= to; t += H) {
      sun += val(s, 'sun', t + H) || 0; rain += val(s, 'precip', t + H) || 0;
      const T = val(s, 'temp', t); if (T != null) { tmin = Math.min(tmin, T); tmax = Math.max(tmax, T); }
      cl.push(val(s, 'cloud', t));
      if ((val(s, 'code', t) || 0) >= 95) r.thunder = true;
    }
    r.sun.push(sun / 3600); r.rain.push(rain); r.cloud.push(avg(cl));
    if (Number.isFinite(tmin)) { r.tmin.push(tmin); r.tmax.push(tmax); }
    r.fog.push((val(s, 'low', from) ?? 0) >= 80 && (val(s, 'precip', from + H) || 0) < 0.2 ? 1 : 0);
  });
  return [...acc.values()].filter((r) => r.sun.length).map((r) => {
    const sunH = avg(r.sun), frac = Math.min(1, sunH / Math.max(1, hours)), rain = avg(r.rain), fog = avg(r.fog) >= 0.5, tmax = Math.max(...r.tmax), tmin = Math.min(...r.tmin);
    let word, icon;
    if (r.thunder) { word = 'Thunderstorms'; icon = 'lightning'; }
    else if (rain >= 4) { word = tmax < 1.5 ? 'Snow' : 'Rain'; icon = tmax < 1.5 ? 'freshsnow' : 'drop'; }
    else if (rain >= 0.8) { word = tmax < 1.5 ? 'Snow showers' : 'Showers'; icon = tmax < 1.5 ? 'freshsnow' : 'drop'; }
    else if (fog && frac >= 0.4) { word = 'Fog, then sun'; icon = 'mist'; }
    else if (fog) { word = 'Fog and low cloud'; icon = 'mist'; }
    else if (frac >= 0.75) { word = 'Sunny'; icon = 'sun'; }
    else if (frac >= 0.5) { word = 'Mostly sunny'; icon = 'sun'; }
    else if (frac >= 0.22) { word = 'Sun and clouds'; icon = 'clearing'; }
    else { word = 'Cloudy'; icon = 'cloud'; }
    return { id: r.id, name: r.name, sunH, frac, rain, fog, tmin: Math.round(tmin), tmax: Math.round(tmax), word, icon, thunder: r.thunder };
  }).sort((a, b) => b.frac - a.frac || a.rain - b.rain);
}

// ---------- the sea of fog: how high does it reach? ----------
// points: [{ elev, fc }] (grid cells, spots, lowland references). Looks for the altitude that best
// separates "under low cloud" from "clear above" north of the Alps. Returns { top } in metres or null.
export function fogTop(points, t) {
  const pts = points.filter((p) => p.fc && Number.isFinite(p.elev) && (p.lat == null || p.lat > 46.42)).map((p) => {
    const low = val(p.fc, 'low', t), mid = val(p.fc, 'mid', t), rain = val(p.fc, 'precip', t + H) || 0;
    return low == null ? null : { elev: p.elev, fog: low >= 70 && (mid ?? 0) < 70 && rain < 0.3, clear: low < 35 };
  }).filter(Boolean);
  if (pts.length < 20) return null;
  let best = null;
  for (let T = 500; T <= 2400; T += 50) {
    const below = pts.filter((p) => p.elev < T), above = pts.filter((p) => p.elev >= T);
    if (below.length < 6 || above.length < 6) continue;
    const foggy = below.filter((p) => p.fog).length / below.length, clear = above.filter((p) => p.clear).length / above.length;
    const err = below.filter((p) => !p.fog).length + above.filter((p) => !p.clear).length;
    if (!best || err < best.err) best = { top: T, err, foggy, clear, n: below.length };
  }
  if (!best || best.foggy < 0.6 || best.clear < 0.7) return null;
  return { top: best.top, foggy: best.foggy, clear: best.clear };
}

// snow line from the grid: the altitude where it is about 1 °C while it is snowing or raining
function snowLine(grid, t) {
  const pts = grid.cells.map((c, i) => ({ e: grid.series[i]?.elev, T: val(grid.series[i], 'temp', t) })).filter((p) => p.e != null && p.T != null);
  if (pts.length < 20) return null;
  const mx = avg(pts.map((p) => p.e)), my = avg(pts.map((p) => p.T));
  const b = pts.reduce((a, p) => a + (p.e - mx) * (p.T - my), 0) / pts.reduce((a, p) => a + (p.e - mx) ** 2, 0);
  if (!(b < -0.002)) return null;
  return Math.round((mx + (1 - my) / b) / 100) * 100;
}

// two or three plain sentences for the day
export function briefing(date, { grid = null, points = [], regions = null } = {}) {
  const d0 = localMidnight(date).getTime(), out = [];
  const ev = dayEvents(new Date(d0 + 12 * H), CENTRE);
  if (!regions || !ev.sunrise) return { text: [], fog: null };
  const morning = ev.sunrise.getTime() + H, noon = d0 + 13 * H;
  const fm = fogTop(points, Math.round(morning / H) * H), fn = fogTop(points, noon);
  let fog = null;
  if (fm) {
    fog = { top: fm.top, allDay: !!fn, noonTop: fn ? fn.top : null };
    out.push(`<b>Sea of fog</b> over the lowlands, top near <b>${fm.top} m</b>${fn ? (Math.abs(fn.top - fm.top) >= 150 ? `, ${fn.top < fm.top ? 'sinking' : 'rising'} to about ${fn.top} m by midday` : ', holding all day') : ', breaking up around midday'}. Sunshine above it.`);
  }
  const sunny = regions.filter((r) => r.frac >= 0.6 && r.rain < 0.8), wet = regions.filter((r) => r.rain >= 2);
  if (wet.length >= regions.length * 0.6) {
    const sl = grid ? snowLine(grid, noon) : null;
    out.push(`<b>Wet</b> in most regions${sl && sl > 300 && sl < 3200 ? `, snow above about <b>${sl} m</b>` : ''}.${sunny.length ? ` Drier in ${sunny.slice(0, 2).map((r) => r.name).join(' and ')}.` : ''}`);
  } else if (sunny.length >= regions.length * 0.8 && !fm) out.push('<b>Sunny</b> across almost all of Switzerland.');
  else if (sunny.length) out.push(`Best light in <b>${sunny.slice(0, 3).map((r) => r.name).join(', ')}</b>${wet.length ? `; ${wet.length > 2 ? 'rain' : 'showers'} in ${wet.slice(0, 2).map((r) => r.name).join(' and ')}` : ''}.`);
  else if (!fm) out.push('Mostly <b>cloudy</b>: a day for soft light, forests and waterfalls.');
  if (regions.some((r) => r.thunder)) out.push(`<b>Thunderstorms</b> possible in ${regions.filter((r) => r.thunder).slice(0, 3).map((r) => r.name).join(', ')}.`);
  return { text: out, fog };
}

// ---------- how to shoot it ----------
export const SHOOT = {
  sunrise: ['Be in place 45 minutes early: the strongest colour often comes 15 to 20 minutes before the sun.', 'Tripod, f/8 to f/11, ISO 100. Bracket ±2 EV or use a graduated filter for the bright sky.', 'Turn around: the first light on the peaks behind you can be the better picture.'],
  sunset: ['Stay 30 minutes after sunset: the afterglow lights the clouds from below.', 'Tripod, f/8 to f/11, ISO 100. Bracket ±2 EV for the bright sky.', 'Pack a headlamp for the way down.'],
  bluehour: ['Sky and lights balance for about ten minutes, 20 to 40 minutes after sunset.', 'Tripod, f/8, ISO 100, 2 to 15 seconds. Shoot through the whole window and pick later.'],
  fogsea: ['Go 100 to 200 m higher than the forecast top: the fog breathes up and down.', 'A telephoto (70 to 200 mm) compresses the waves and picks out summits, towers and trees.', 'At dusk, 30 to 120 seconds with an ND filter turn the fog to silk; town lights glow from below.'],
  mist: ['Shoot toward the light: backlit mist shows rays between the trees.', 'Add +0.7 to +1 EV, fog fools the meter into grey.', 'Keep a cloth handy, the front lens mists over.'],
  mirror: ['Get low, close to the water: the reflection grows. Wide angle, 14 to 24 mm.', 'Take the polariser off (it eats reflections) or turn it until the mirror is strongest.', 'The reflection is about a stop darker than the sky: a soft graduated filter evens it out.'],
  lightning: ['Safety first: shoot from a car or building, never from a ridge, summit or the water\'s edge.', 'At night: tripod, manual focus at infinity, f/8, ISO 100 to 200, 10 to 30 second exposures one after another.', 'By day: a lightning trigger, or ND filter and many 1 to 2 second frames.'],
  rainbow: ['It stands exactly opposite the sun. The lower the sun, the higher the arc.', 'A full arc is 84° wide: you need 14 to 18 mm, or shoot a panorama.', 'Turn the polariser carefully: one position boosts the bow, the other erases it.'],
  clearing: ['Expose for the highlights (−0.7 EV) so the shafts of light keep their shape.', 'Watch for a single lit peak or village against dark cloud, and be quick: it lasts seconds.'],
  freshsnow: ['Add +1 to +1.7 EV so the snow is white, not grey. Check the histogram.', 'Be first, and think where you walk: your tracks stay in the picture.', 'Keep spare batteries in an inner pocket.'],
  ice: ['A polariser cuts the glare and shows bubbles and cracks.', 'Go low and close with a wide angle; focus-stack ice patterns with the mountains.', 'Only step onto ice that is officially open.'],
  hoarfrost: ['Be there before the sun melts it. Backlight makes the crystals sparkle.', 'White trees on blue sky: a polariser deepens the blue. Add +1 EV.', 'Bring a macro or close-focusing lens for the crystals.'],
  autumn: ['A polariser removes the shine from leaves: richer colour, even in the rain.', 'Larches glow in back or side light; beech woods look best under soft cloud.', 'Use a telephoto to pick out patches of colour against dark rock or shadow.'],
  waterfall: ['1/4 to 1 second for silky water (ND filter, 3 to 6 stops); 1/500 to freeze the spray.', 'Soft, overcast light avoids burnt-out white water.', 'Cloth and lens hood for the spray; look for rainbows with the sun at your back.'],
  foehn: ['The air is glass-clear: a telephoto stacks ridge behind ridge.', 'Lens-shaped clouds over the crest colour last at sunset.', 'It gusts: weigh the tripod down and use a faster shutter.'],
  stars: ['Sharp stars: at most 500 ÷ focal length seconds (20 s at 24 mm, full frame).', 'Widest aperture, ISO 1600 to 6400. Focus by hand on a bright star in magnified live view.', 'On humid nights a hand warmer strapped to the lens keeps dew off.'],
  milkyway: ['14 to 24 mm, f/2.8 or faster, 15 to 25 seconds, ISO 3200 to 6400.', 'Shoot ten identical frames and stack them: far less noise.', 'A foreground exposure at blue hour, blended later, keeps the land detailed.'],
  meteors: ['Wide lens, 15 to 25 second frames back to back for an hour or more (interval timer).', 'Aim about 45° away from the radiant: the trails are longer there.', 'Dress for standing still: it gets cold.'],
  aurora: ['Look north with a clear, dark horizon. The camera sees the colour before you do.', '14 to 24 mm, f/2.8, 5 to 15 seconds, ISO 1600 to 3200.'],
  wildlife: ['1/1000 s or faster for moving animals, 1/2000 for birds in flight; let the ISO float.', 'Get down to eye level and focus on the eye.', 'Stay downwind, move slowly and never walk straight at an animal. If it looks up, stop.'],
};
