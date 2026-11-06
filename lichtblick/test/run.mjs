// Checks for the opportunity detectors, with made-up forecasts of exactly the weather each one is about.
//   node test/run.mjs
import assert from 'node:assert/strict';
import { openAt, opportunitiesFor, makeContext, autumnWindow, iceLikely, LOWLAND_REFS, photoWeatherAt, topOpportunities } from '../js/scoring.js';
import { localMidnight, nightInfo, dayEvents, hhmm, moonAt } from '../js/astro.js';
import { SPOTS } from '../data/spots.js';
import { HORIZONS } from '../data/horizons.js';
import { SKY } from '../data/sky.js';
import { lv95ToWgs, wgsToLv95, distance, bearing, compass, insidePolygon } from '../js/geo.js';
import { CH_OUTLINE } from '../data/ch-outline.js';
import { SPECIES } from '../data/species.js';
import { wildlifeDay, approachTip, inSeason } from '../js/wildlife.js';

const H = 3600e3;
const localHourOf = (d) => +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Zurich' }).format(d);
const spot = (id) => { const s = SPOTS.find((x) => x.id === id); return { ...s, sky: SKY[id] || null, horizon: HORIZONS[id] ? { alts: HORIZONS[id].alts } : null }; };

// An hourly forecast like the app gets from MeteoSwiss: two days back, five ahead.
function fc(now, base, fn = () => ({})) {
  const t0 = localMidnight(now, -2).getTime(), s = { t: [] };
  const keys = ['temp', 'rh', 'dew', 'precip', 'pop', 'snow', 'snowDepth', 'code', 'cloud', 'low', 'mid', 'high', 'wind', 'windDir', 'gust', 'cape', 'freezing', 'sun', 'vis', 'pressure'];
  for (const k of keys) s[k] = [];
  for (let i = 0; i < 24 * 7; i++) {
    const t = t0 + i * H, d = new Date(t), lh = (d.getUTCHours() + 1) % 24;
    const row = { temp: 10, rh: 70, dew: 4, precip: 0, pop: 0, snow: 0, snowDepth: 0, code: 1, cloud: 10, low: 5, mid: 5, high: 5, wind: 8, windDir: 270, gust: 15, cape: 0, freezing: 2500, sun: lh > 8 && lh < 17 ? 3600 : 0, vis: 30000, pressure: 1018, ...base, ...fn(t, lh, i) };
    s.t.push(t); for (const k of keys) s[k].push(row[k]);
  }
  return s;
}
const refsWith = (now, base, fn) => LOWLAND_REFS.map((r) => ({ ...r, fc: fc(now, base, fn) }));

let pass = 0, fail = 0;
function test(name, f) {
  try { f(); pass++; console.log(`  ok  ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
const best = (ops, type) => ops.filter((o) => o.type === type).sort((a, b) => b.score - a.score)[0];

console.log('geometry');
test('LV95 round trip (Bern)', () => {
  const { e, n } = wgsToLv95(46.9511, 7.4386), w = lv95ToWgs(e, n);
  assert.ok(Math.abs(e - 2600000) < 300 && Math.abs(n - 1200000) < 300, `${e} ${n}`);
  assert.ok(Math.abs(w.lat - 46.9511) < 1e-4 && Math.abs(w.lon - 7.4386) < 1e-4);
});
test('distance and bearing Zürich → Bern', () => {
  const zh = { lat: 47.3769, lon: 8.5417 }, be = { lat: 46.948, lon: 7.4474 };
  assert.ok(Math.abs(distance(zh, be) / 1000 - 95.5) < 2);
  assert.equal(compass(bearing(zh, be)), 'WSW');
});
test('Switzerland outline contains Bern, not Milan', () => {
  assert.ok(insidePolygon(46.948, 7.447, CH_OUTLINE));
  assert.ok(!insidePolygon(45.464, 9.19, CH_OUTLINE));
});

console.log('astronomy');
test('Zürich day length on the solstice ~ 15 h 55', () => {
  const e = dayEvents(new Date('2026-06-21T10:00:00Z'), { lat: 47.377, lon: 8.54, elev: 410 });
  const len = (e.sunset - e.sunrise) / 60e3;
  assert.ok(Math.abs(len - 955) < 12, `${len} min, ${hhmm(e.sunrise)}-${hhmm(e.sunset)}`);
  assert.ok(hhmm(e.sunrise) >= '05:25' && hhmm(e.sunrise) <= '05:35', hhmm(e.sunrise));
});
test('galactic core: about 14.5° high, due south, from Kandersteg in July', () => {
  const n = nightInfo(new Date('2026-07-14T12:00:00Z'), spot('oeschinensee'));
  const maxAlt = Math.max(...n.samples.map((s) => s.coreAlt));
  assert.ok(Math.abs(maxAlt - (90 - 46.5 - 29.0)) < 1, `${maxAlt}`);
  assert.ok(n.moon.illum < 0.05, 'new moon on 14 July 2026');
});
test('no Milky Way core in a December night', () => {
  const n = nightInfo(new Date('2026-12-10T12:00:00Z'), spot('oeschinensee'));
  assert.equal(n.coreMinutes, 0);
});
test('full moon of 24 Nov 2026', () => { assert.ok(moonAt(new Date('2026-11-24T15:00:00Z'), spot('rigi')).illum > 0.98); });

console.log('opportunities');
test('sea of fog over the Mittelland, seen from Rigi', () => {
  const now = new Date('2026-11-12T05:00:00Z');
  const ctx = makeContext({ now, refs: refsWith(now, { low: 100, cloud: 100, rh: 99, temp: 1, code: 45, sun: 0 }) });
  const ops = opportunitiesFor(spot('rigi'), fc(now, { low: 0, cloud: 5, rh: 45, temp: 7, wind: 6 }), ctx);
  const o = best(ops, 'fogsea');
  assert.ok(o && o.score >= 80, JSON.stringify(o && [o.score, o.why]));
  assert.match(o.title, /sunrise/i);
});
test('no sea of fog when the lowlands are clear', () => {
  const now = new Date('2026-11-12T05:00:00Z');
  const ctx = makeContext({ now, refs: refsWith(now, { low: 5, cloud: 10 }) });
  assert.equal(best(opportunitiesFor(spot('rigi'), fc(now, { low: 0 }), ctx), 'fogsea'), undefined);
});
test('mirror lake at dawn without wind; none in a gale', () => {
  const now = new Date('2026-07-20T02:00:00Z');
  const ctx = makeContext({ now });
  const calm = best(opportunitiesFor(spot('bachalpsee'), fc(now, { wind: 1, gust: 4 }), ctx), 'mirror');
  assert.ok(calm && calm.score >= 75, JSON.stringify(calm));
  assert.equal(best(opportunitiesFor(spot('bachalpsee'), fc(now, { wind: 25, gust: 50 }), ctx), 'mirror'), undefined);
});
test('night thunderstorm over Lake Lugano', () => {
  const now = new Date('2026-07-20T12:00:00Z');
  const ops = opportunitiesFor(spot('montebre'), fc(now, {}, (t, lh, i) => (i === 48 + 22 ? { code: 95, cape: 1800, precip: 6 } : {})), makeContext({ now }));
  const o = best(ops, 'lightning');
  assert.ok(o && o.score >= 85, JSON.stringify(o));
});
test('fresh snow then blue sky', () => {
  const now = new Date('2026-12-02T06:00:00Z');
  const snowUntil = localMidnight(now).getTime() + 2 * H;
  const f = fc(now, { temp: -4, cloud: 5, low: 0 }, (t) => (t > snowUntil - 18 * H && t <= snowUntil ? { snow: 1.2, precip: 1, cloud: 100, low: 100, code: 73 } : {}));
  const o = best(opportunitiesFor(spot('landwasser'), f, makeContext({ now })), 'freshsnow');
  assert.ok(o && o.score >= 75, JSON.stringify(o));
});
test('Lago Bianco is frozen in January: ice, no mirror', () => {
  const now = new Date('2027-01-15T06:00:00Z');
  const f = fc(now, { temp: -10, wind: 1, gust: 3, cloud: 5 });
  assert.ok(iceLikely(spot('lagobianco'), f, now).likely);
  const ops = opportunitiesFor(spot('lagobianco'), f, makeContext({ now }));
  assert.ok(best(ops, 'ice'), 'frozen-lake opportunity');
  assert.equal(best(ops, 'mirror'), undefined);
});
test('larches around Lai da Palpuogna turn in October', () => {
  const w = autumnWindow(spot('palpuogna'), 2026);
  const doy = (w.peak - Date.UTC(2026, 0, 1)) / 864e5;
  assert.ok(doy > 280 && doy < 300, `peak day ${doy}`);
  const now = new Date(w.peak.getTime() - 2 * 864e5);
  const o = best(opportunitiesFor(spot('palpuogna'), fc(now, { cloud: 10 }), makeContext({ now })), 'autumn');
  assert.ok(o && o.score >= 75 && /larch/i.test(o.title), JSON.stringify(o));
  assert.equal(best(opportunitiesFor(spot('palpuogna'), fc(new Date('2026-07-10T06:00Z'), {}), makeContext({ now: new Date('2026-07-10T06:00Z') })), 'autumn'), undefined);
});
test('Milky Way core over Grimsel (open southern horizon) at new moon in July', () => {
  const now = new Date('2026-07-14T16:00:00Z');
  const o = best(opportunitiesFor(spot('grimsel'), fc(now, { cloud: 0, rh: 60 }), makeContext({ now })), 'milkyway');
  assert.ok(o && o.score >= 70 && /core/i.test(o.title), JSON.stringify(o));
  assert.ok(o.alt > 5 && o.az > 150 && o.az < 230, `${o.alt} ${o.az}`);
});
test('Oeschinensee: walls hide the core, the arch overhead is still there', () => {
  const now = new Date('2026-07-14T16:00:00Z');
  const ops = opportunitiesFor(spot('oeschinensee'), fc(now, { cloud: 0, rh: 60, wind: 2, gust: 4 }), makeContext({ now }));
  assert.ok(!ops.some((o) => /core/i.test(o.title)), 'core should be hidden by the Blüemlisalp');
  const o = best(ops, 'milkyway');
  assert.ok(o && o.score >= 70 && /arch/i.test(o.title), JSON.stringify(o));
});
test('no stars under clouds', () => {
  const now = new Date('2026-07-14T16:00:00Z');
  const ops = opportunitiesFor(spot('oeschinensee'), fc(now, { cloud: 100, low: 100 }), makeContext({ now }));
  assert.equal(best(ops, 'stars'), undefined);
  assert.equal(best(ops, 'milkyway'), undefined);
});
test('rainbow with showers and low sun', () => {
  const now = new Date('2026-08-03T12:00:00Z');
  const t0 = localMidnight(now).getTime();
  const f = fc(now, {}, (t) => (t === t0 + 18 * H || t === t0 + 19 * H ? { precip: 1.5, sun: 2400 } : {}));
  const o = best(opportunitiesFor(spot('lauterbrunnen'), f, makeContext({ now })), 'rainbow');
  assert.ok(o && o.score >= 55, JSON.stringify(o));
});
test('fiery sunset with high clouds and a clear western horizon', () => {
  const now = new Date('2026-09-10T12:00:00Z');
  const o = best(opportunitiesFor(spot('lavaux'), fc(now, { high: 45, mid: 20, low: 0, cloud: 50 }), makeContext({ now })), 'sunset');
  assert.ok(o && o.score >= 75 && /fiery/i.test(o.title), JSON.stringify(o));
});
test('hoarfrost after a freezing, humid, calm night', () => {
  const now = new Date('2026-12-20T03:00:00Z');
  const o = best(opportunitiesFor(spot('sihlsee'), fc(now, { temp: -6, rh: 97, dew: -6.5, wind: 2, low: 90, cloud: 95, code: 45 }), makeContext({ now })), 'hoarfrost');
  assert.ok(o && o.score >= 60, JSON.stringify(o));
});
test('northern lights only with a strong storm and a clear sky', () => {
  const now = new Date('2026-11-12T16:00:00Z');
  const t0 = localMidnight(now).getTime();
  const kp = [{ t: t0 + 21 * H, kp: 8.3 }, { t: t0 + 24 * H, kp: 8.0 }];
  const o = best(opportunitiesFor(spot('creuxduvan'), fc(now, { cloud: 0 }), makeContext({ now, kp })), 'aurora');
  assert.ok(o && o.score >= 65, JSON.stringify(o));
  assert.equal(best(opportunitiesFor(spot('creuxduvan'), fc(now, { cloud: 0 }), makeContext({ now, kp: [{ t: t0 + 21 * H, kp: 4 }] })), 'aurora'), undefined);
});
test('every opportunity has real Date times and a reason', () => {
  const now = new Date('2026-07-14T16:00:00Z');
  const ops = opportunitiesFor(spot('stellisee'), fc(now, { cloud: 0, wind: 1, gust: 2 }), makeContext({ now }));
  assert.ok(ops.length > 3);
  for (const o of ops) { assert.ok(o.start instanceof Date && o.end instanceof Date && o.peak instanceof Date, o.type); assert.ok(o.why.length, o.type); }
});
test('feed keeps at most two per spot and day', () => {
  const now = new Date('2026-07-14T16:00:00Z');
  const ops = opportunitiesFor(spot('stellisee'), fc(now, { cloud: 0, wind: 1, gust: 2 }), makeContext({ now }));
  const top = topOpportunities(ops);
  const perDay = new Map();
  for (const o of top) { const k = localMidnight(o.peak).getTime(); perDay.set(k, (perDay.get(k) || 0) + 1); }
  assert.ok([...perDay.values()].every((n) => n <= 2));
});
test('photo weather number: sun beats rain', () => {
  const now = new Date('2026-07-14T10:00:00Z');
  const sunny = photoWeatherAt(fc(now, { cloud: 20, low: 0, high: 30 }), now.getTime());
  const rainy = photoWeatherAt(fc(now, { cloud: 100, low: 100, precip: 3 }), now.getTime());
  assert.ok(sunny > 70 && rainy < 20, `${sunny} ${rainy}`);
});
test('every curated spot has a photo, tags and a sensible elevation', () => {
  for (const s of SPOTS) {
    assert.ok(s.photos.length && s.tags.length, s.id);
    assert.ok(s.elev > 150 && s.elev < 3500, `${s.id} ${s.elev}`); // Lake Maggiore is at 193 m
    assert.ok(insidePolygon(s.lat, s.lon, CH_OUTLINE), `${s.id} outside Switzerland`);
  }
});

console.log('access and darkness');
test('every curated spot has a measured sky and a night-access class', () => {
  for (const s of SPOTS) {
    assert.ok(SKY[s.id] && SKY[s.id].bortle >= 1 && SKY[s.id].bortle <= 9, s.id);
    assert.ok(['free', 'hike', 'stay', 'closed', 'reserve'].includes(s.night), `${s.id}: ${s.night}`);
  }
  assert.ok(SKY.margunet.bortle <= 3 && SKY.luzern.bortle >= 8 && SKY.uetliberg.bortle >= 8, 'National Park dark, cities bright');
});
test('Blausee: nothing before opening or at night', () => {
  const now = new Date('2026-07-14T16:00:00Z');
  const ops = opportunitiesFor(spot('blausee'), fc(now, { cloud: 0, wind: 1, gust: 2 }), makeContext({ now }));
  for (const o of ops) { const h = localHourOf(o.peak); assert.ok(h >= 9 && h < 21, `${o.type} at ${h}`); assert.ok(localHourOf(o.start) >= 9, `${o.type} starts ${o.start}`); }
  assert.ok(!ops.some((o) => ['stars', 'milkyway', 'meteors'].includes(o.type)));
});
test('no Milky Way from the city', () => {
  const now = new Date('2026-07-14T16:00:00Z');
  for (const id of ['luzern', 'uetliberg']) assert.ok(!opportunitiesFor(spot(id), fc(now, { cloud: 0, rh: 50 }), makeContext({ now })).some((o) => o.type === 'milkyway'), id);
});
test('dark sites beat bright ones on the same starry night', () => {
  const now = new Date('2026-08-20T16:00:00Z'), f = fc(now, { cloud: 0, rh: 50 });
  const stars = (id) => best(opportunitiesFor(spot(id), f, makeContext({ now })), 'stars')?.score || 0;
  assert.ok(stars('grimsel') > stars('rigi') && stars('rigi') > stars('uetliberg'), `${stars('grimsel')} ${stars('rigi')} ${stars('uetliberg')}`);
});
test('opening hours: Neeracherried on a Wednesday afternoon, not on a Monday, only the 2nd Sunday in winter', () => {
  const s = spot('neeracherried');
  assert.ok(openAt(s, new Date('2026-05-13T14:00:00Z')));   // Wed 16:00
  assert.ok(!openAt(s, new Date('2026-05-13T08:00:00Z')));  // Wed 10:00
  assert.ok(!openAt(s, new Date('2026-05-11T14:00:00Z')));  // Monday
  assert.ok(openAt(s, new Date('2026-12-13T10:00:00Z')));   // 2nd Sunday of December, 11:00
  assert.ok(!openAt(s, new Date('2026-12-20T10:00:00Z')));  // 3rd Sunday
  assert.ok(!openAt(spot('goldau'), new Date('2026-12-01T17:30:00Z')) && openAt(spot('goldau'), new Date('2026-07-01T15:30:00Z')));
});

console.log('wildlife');
const wild = (id, iso, base = {}, fn) => { const now = new Date(iso); return opportunitiesFor(spot(id), fc(now, base, fn), makeContext({ now })).filter((o) => o.type === 'wildlife'); };
test('ibex rut on the Niederhorn in December', () => {
  const o = wild('niederhorn', '2026-12-10T06:00:00Z', { temp: -3, wind: 4, gust: 8, cloud: 20 })[0];
  assert.ok(o && /ibex rut/i.test(o.title) && o.score >= 70, JSON.stringify(o));
  assert.equal(o.species, 'ibex');
});
test('no marmots while they hibernate', () => {
  const ops = wild('spielboden', '2027-01-15T06:00:00Z', { temp: -8 });
  assert.ok(!ops.some((o) => o.species === 'marmot'), JSON.stringify(ops.map((o) => o.title)));
});
test('marmots on a sunny July morning, in the morning', () => {
  const o = wild('spielboden', '2026-07-08T03:00:00Z', { temp: 9, wind: 5, cloud: 10 })[0];
  assert.ok(o && o.species === 'marmot' && o.score >= 60, JSON.stringify(o));
  const h = +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Zurich' }).format(o.peak);
  assert.ok(h >= 7 && h <= 11, `peak hour ${h}`);
});
test('rain all day cuts the chances', () => {
  const dry = wild('trupchun', '2026-09-26T04:00:00Z', { cloud: 30 })[0];
  const wet = wild('trupchun', '2026-09-26T04:00:00Z', { cloud: 100, low: 100, precip: 3, sun: 0 })[0];
  assert.ok(dry && (!wet || wet.score < dry.score - 15), `${dry && dry.score} vs ${wet && wet.score}`);
});
test('red deer rut in Val Trupchun at dawn or dusk', () => {
  const o = wild('trupchun', '2026-09-26T04:00:00Z', { cloud: 30, temp: 4 })[0];
  assert.ok(o && /red deer rut/i.test(o.title), JSON.stringify(o));
  const h = +new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Zurich' }).format(o.peak);
  assert.ok(h <= 9 || h >= 17, `peak hour ${h}`);
});
test('wintering waterbirds at the Ermatinger Becken in January', () => {
  const o = wild('ermatingen', '2027-01-12T06:00:00Z', { temp: 1, cloud: 60 })[0];
  assert.ok(o && /waterbirds/i.test(o.title) && o.score >= 60, JSON.stringify(o));
});
test('wildlife parks never outscore the wild', () => {
  for (const o of wild('goldau', '2026-10-10T06:00:00Z', { cloud: 20 })) assert.ok(o.score <= 75, `${o.score}`);
});
test('scent tip: wind from the south-west means approach from the north-east', () => {
  assert.match(approachTip(225, 12, Date.now(), true), /approach from the northeast/);
  assert.match(approachTip(0, 1, new Date('2026-07-08T05:00:00Z').getTime(), true), /come from below/);
});
test('every spot species is known, every species has 12 months', () => {
  for (const s of SPOTS) for (const id of s.species || []) assert.ok(SPECIES[id], `${s.id}: ${id}`);
  for (const [id, sp] of Object.entries(SPECIES)) assert.equal(sp.season.length, 12, id);
  assert.ok(inSeason(spot('trupchun'), new Date('2026-09-26T10:00:00Z'))[0].events.length);
});

console.log('app shell');
test('the service worker caches every module and data file', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const walk = (dir) => readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  for (const f of [...walk('js'), ...walk('data')].filter((f) => /\.(js|mjs)$/.test(f))) assert.ok(sw.includes(`'${f}'`), `${f} missing from sw.js`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
