// Checks for the opportunity detectors, with made-up forecasts of exactly the weather each one is about.
//   node test/run.mjs
import assert from 'node:assert/strict';
import { TYPES, confidence, openAt, opportunitiesFor, makeContext, autumnWindow, iceLikely, LOWLAND_REFS, photoWeatherAt, topOpportunities } from '../js/scoring.js';
import { localMidnight, nightInfo, dayEvents, hhmm, moonAt, planetsTonight, starShutter } from '../js/astro.js';
import { lightBands, almanac, regionWeather, fogTop, briefing, SHOOT } from '../js/brief.js';
import { splice, fetchRetry, limitText } from '../js/sources/meteoswiss.js';
import { ICONS } from '../js/icons.js';
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
const pending = []; // tests that return a promise are counted when it settles
function test(name, f) {
  const ok = () => { pass++; console.log(`  ok  ${name}`); };
  const bad = (e) => { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); };
  try { const r = f(); if (r && typeof r.then === 'function') pending.push(r.then(ok, bad)); else ok(); }
  catch (e) { bad(e); }
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

console.log('briefing, outlook, almanac');
test('the light of a day adds up to 24 hours, with two golden hours', () => {
  const lb = lightBands(new Date('2026-11-12T10:00:00Z'), { lat: 46.8, lon: 8.2, elev: 500 });
  assert.equal(Math.round(lb.bands.reduce((a, b) => a + (b.to - b.from), 0) / 60e3), 1440);
  assert.equal(lb.bands.filter((b) => b.kind === 'gold').length, 2);
  assert.ok(lb.bands[0].kind === 'night' && lb.bands.some((b) => b.kind === 'day'));
});
test('with a mountain horizon the sun reaches Riffelsee late and leaves early', () => {
  const s = spot('riffelsee'), lb = lightBands(new Date('2026-11-12T10:00:00Z'), s, s.horizon);
  const direct = lb.direct.reduce((a, b) => a + (b.to - b.from), 0) / 3600e3, ev = dayEvents(new Date('2026-11-12T10:00:00Z'), s);
  assert.ok(direct > 4 && direct < (ev.sunset - ev.sunrise) / 3600e3 - 1.5, `${direct} h`);
});
test('outlook is spliced after the last MeteoSwiss hour and marked', () => {
  const now = new Date('2026-11-12T06:00:00Z'), t0 = localMidnight(now).getTime();
  const ms = { lat: 47, lon: 8, t: [], temp: [], rh: [], cloud: [], wind: [], sun: [], dew: [], gust: [], windDir: [], precip: [] };
  for (let i = 0; i < 144; i++) { ms.t.push(t0 + i * H); const ok = i < 120; ms.temp.push(ok ? 5 : null); for (const k of ['rh', 'cloud', 'wind', 'sun', 'dew', 'gust', 'windDir', 'precip']) ms[k].push(ok ? 1 : null); }
  const out = { t: [], temp: [], rh: [], cloud: [], wind: [], precip: [] };
  for (let i = 0; i < 240; i++) { out.t.push(t0 + i * H); out.temp.push(9); out.rh.push(80); out.cloud.push(20); out.wind.push(10); out.precip.push(0); }
  const s = splice(ms, out);
  assert.equal(s.outlookFrom, t0 + 120 * H);
  assert.equal(s.t.length, 240);
  assert.equal(s.temp[119], 5); assert.equal(s.temp[120], 9);
  assert.ok(s.gust[130] > 10 && s.dew[130] < 9 && s.windDir[130] === null);
  assert.ok(Math.max(...s.sun.slice(120)) > 2000 && Math.min(...s.sun.slice(120)) === 0, 'estimated sunshine by day only');
  assert.equal(confidence(t0 + 130 * H, s, now.getTime()), 'low');
  assert.equal(confidence(now.getTime() + 20 * H, s, now.getTime()), 'high');
  assert.equal(confidence(now.getTime() + 60 * H, s, now.getTime()), 'medium');
});
test('chances beyond day five are found, marked as outlook and scored lower', () => {
  const now = new Date('2026-07-14T06:00:00Z');
  const f = fc(now, { cloud: 0, wind: 1, gust: 2 }); f.outlookFrom = localMidnight(now, 3).getTime();
  const ops = opportunitiesFor(spot('bachalpsee'), f, makeContext({ now }));
  const far = ops.filter((o) => o.outlook), near = ops.filter((o) => !o.outlook && o.type === 'mirror');
  assert.ok(far.length && near.length);
  assert.ok(far.every((o) => o.conf === 'low' && /Outlook/.test(o.why.join(' '))));
  assert.ok(best(far, 'mirror').score < best(near, 'mirror').score);
});
test('sea of fog: top found between foggy lowlands and clear heights', () => {
  const t = Date.UTC(2026, 10, 12, 8), pts = [];
  for (let e = 300; e <= 2600; e += 50) pts.push({ elev: e, lat: 47, fc: { t: [t, t + H], low: [e < 950 ? 100 : 5, 0], mid: [0, 0], precip: [0, 0] } });
  const f = fogTop(pts, t);
  assert.ok(f && Math.abs(f.top - 950) <= 50, JSON.stringify(f));
  assert.equal(fogTop(pts.map((p) => ({ ...p, fc: { ...p.fc, low: [10, 10] } })), t), null);
});
test('regions: sunny Engadin ranks above a rainy Jura', () => {
  const day = new Date('2026-07-14T10:00:00Z'), t0 = localMidnight(day).getTime();
  const cells = [], series = [];
  for (const [lat, lon, wet] of [[46.55, 9.95, 0], [46.6, 9.9, 0], [47.2, 7.0, 1], [47.25, 7.1, 1]]) {
    cells.push({ lat, lon });
    const s = { t: [], elev: 1000, cloud: [], low: [], precip: [], sun: [], temp: [], code: [] };
    for (let i = 0; i < 48; i++) { s.t.push(t0 + i * H); s.cloud.push(wet ? 100 : 5); s.low.push(wet ? 90 : 0); s.precip.push(wet ? 1.2 : 0); s.sun.push(wet ? 0 : 3600); s.temp.push(14); s.code.push(wet ? 63 : 0); }
    series.push(s);
  }
  const r = regionWeather({ cells, series }, day);
  assert.equal(r[0].id, 'engadin'); assert.equal(r[0].word, 'Sunny');
  assert.equal(r[r.length - 1].id, 'jura'); assert.equal(r[r.length - 1].word, 'Rain');
  assert.match(briefing(day, { regions: r }).text.join(' '), /Engadin/);
});
test('almanac for any date: winter brings frozen lakes and the ibex rut, no Milky Way core', () => {
  const a = almanac(new Date('2027-12-18T10:00:00Z'), { lat: 46.8, lon: 8.2, elev: 500 }, SPOTS);
  assert.ok(a.seasons.some((s) => /Frozen/.test(s.title)) && a.seasons.some((s) => /fog/i.test(s.title)));
  assert.ok(a.wildlife.some((w) => /Ibex rut/.test(w.title) && w.spots.length >= 3));
  assert.equal(a.night.coreMinutes, 0);
  assert.ok(a.dayLength > 500 && a.dayLength < 520 && Math.abs(a.dayChange) <= 1, `${a.dayLength} ${a.dayChange}`);
  const o = almanac(new Date('2027-10-20T10:00:00Z'), { lat: 46.8, lon: 8.2, elev: 500 }, SPOTS);
  assert.ok(o.colour.some((c) => c.species === 'larch' && c.names.length >= 3), JSON.stringify(o.colour));
});
test('planets: bright ones listed with a sensible window', () => {
  const p = planetsTonight(new Date('2026-11-12T10:00:00Z'), { lat: 46.8, lon: 8.2, elev: 500 });
  assert.ok(Array.isArray(p) && p.length >= 1 && p.every((x) => x.best.alt >= 6 && x.from <= x.to && Number.isFinite(x.mag)), JSON.stringify(p.map((x) => x.name)));
  assert.deepEqual(starShutter(24), { ok: 20, sharp: 12 });
});
test('every chance type and species has a pictogram and shooting notes', () => {
  for (const [k, t] of Object.entries(TYPES)) { assert.ok(ICONS[t.icon], `${k}: ${t.icon}`); assert.ok(SHOOT[k] && SHOOT[k].length, `notes for ${k}`); assert.ok(t.emoji); }
  for (const [k, sp] of Object.entries(SPECIES)) assert.ok(ICONS[sp.glyph], `${k}: ${sp.glyph}`);
});

console.log('network');
test('a dropped forecast request is tried again; a lasting failure is reported', async () => {
  const real = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async () => { calls++; if (calls === 1) throw new TypeError('Failed to fetch'); if (calls === 2) return { status: 503, ok: false }; return { status: 200, ok: true }; };
    const r = await fetchRetry('https://example.invalid/', { wait: 1 });
    assert.equal(r.status, 200); assert.equal(calls, 3);
    calls = 0;
    globalThis.fetch = async () => { calls++; throw new TypeError('Failed to fetch'); };
    await assert.rejects(fetchRetry('https://example.invalid/', { wait: 1 }), /Failed to fetch/);
    assert.equal(calls, 3);
    calls = 0;
    for (const refused of [400, 429]) { // a refused request, or one over the request limit, is not repeated
      calls = 0;
      globalThis.fetch = async () => { calls++; return { status: refused, ok: false }; };
      assert.equal((await fetchRetry('https://example.invalid/', { wait: 1 })).status, refused); assert.equal(calls, 1);
    }
    assert.match(limitText('Daily API request limit exceeded. Please try again tomorrow.'), /tomorrow$/);
    assert.match(limitText('Hourly API request limit exceeded.'), /in an hour$/);
    assert.match(limitText('Minutely API request limit exceeded.'), /in a minute$/);
  } finally { globalThis.fetch = real; }
});

console.log('alerts while the app is closed');
test('push encryption gives exactly the example of the standard (RFC 8291, appendix A)', async () => {
  const { encrypt, b64u, unb64u } = await import('../scripts/webpush.mjs');
  const out = encrypt('When I grow up, I want to be a watermelon', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg',
    { salt: unb64u('DGv6ra1nlYgDCS1FRnbzlw'), localKey: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw' });
  assert.equal(b64u(out), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  assert.notEqual(b64u(encrypt('x', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg')), b64u(encrypt('x', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg')), 'a fresh key and salt each time');
});
test('the push request is signed with the phone-made key, for the right push service', async () => {
  const { vapidHeader, b64u, unb64u } = await import('../scripts/webpush.mjs');
  const { generateKeyPairSync, verify } = await import('node:crypto');
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]);
  const now = Date.UTC(2026, 10, 12, 8);
  const h = vapidHeader('https://web.push.apple.com/QGk3abc', { publicKey: b64u(raw), privateKey: jwk.d }, 'https://example.org/app/', now);
  const [, token, key] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(key, b64u(raw));
  const [head, claims, sig] = token.split('.');
  assert.deepEqual(JSON.parse(unb64u(head)), { typ: 'JWT', alg: 'ES256' });
  const c = JSON.parse(unb64u(claims));
  assert.equal(c.aud, 'https://web.push.apple.com'); assert.equal(c.sub, 'https://example.org/app/');
  assert.ok(c.exp > now / 1000 && c.exp <= now / 1000 + 24 * 3600, 'valid for less than a day');
  assert.ok(verify('sha256', Buffer.from(`${head}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, unb64u(sig)));
});
test('alerts: only new chances, by your settings, never twice unless clearly better', async () => {
  const { pickAlerts, alertKey } = await import('../scripts/alerts.mjs');
  const now = Date.UTC(2026, 10, 12, 8), at = (h) => new Date(now + h * 3600e3);
  const ops = [
    { spotId: 'rigi', type: 'fogsea', score: 92, peak: at(22), title: 'Sea of fog at sunrise' },
    { spotId: 'rigi', type: 'sunrise', score: 80, peak: at(22), title: 'Sunrise' },          // same spot: only its best
    { spotId: 'oeschinen', type: 'mirror', score: 78, peak: at(23), title: 'Mirror-calm water' },
    { spotId: 'grimsel', type: 'milkyway', score: 85, peak: at(60), title: 'Milky Way' },   // beyond 36 hours
    { spotId: 'creux', type: 'sunset', score: 70, peak: at(8), title: 'Sunset' },            // below the lowest score
    { spotId: 'far', type: 'fogsea', score: 95, peak: at(30), outlook: true, title: 'Outlook' },
  ];
  let r = pickAlerts(ops, { now });
  assert.deepEqual(r.fresh.map((o) => o.spotId), ['rigi', 'oeschinen']);
  assert.equal(r.fresh[0].type, 'fogsea');
  // three hours later the same forecast: nothing new
  let again = pickAlerts(ops, { now: now + 3 * 3600e3, state: r.state });
  assert.equal(again.fresh.length, 0);
  // ... unless a chance has become clearly better
  again = pickAlerts(ops.map((o) => (o.spotId === 'oeschinen' ? { ...o, score: 93 } : o)), { now: now + 3 * 3600e3, state: r.state });
  assert.deepEqual(again.fresh.map((o) => o.spotId), ['oeschinen']);
  // your settings: lowest score, kinds of chance, saved spots only (own spots always count)
  assert.deepEqual(pickAlerts(ops, { now, prefs: { min: 60 } }).fresh.map((o) => o.spotId), ['rigi', 'oeschinen', 'creux']);
  assert.deepEqual(pickAlerts(ops, { now, prefs: { types: ['mirror'] } }).fresh.map((o) => o.spotId), ['oeschinen']);
  assert.deepEqual(pickAlerts(ops, { now, prefs: { favsOnly: true, favs: ['oeschinen'] } }).fresh.map((o) => o.spotId), ['oeschinen']);
  assert.deepEqual(pickAlerts(ops, { now, prefs: { favsOnly: true, favs: [] }, mine: new Set(['rigi']) }).fresh.map((o) => o.spotId), ['rigi']);
  // what was sent is forgotten after a few days
  const old = pickAlerts(ops, { now: now + 5 * 24 * 3600e3, state: r.state });
  assert.ok(!old.state.sent[alertKey(ops[0])] || old.state.sent[alertKey(ops[0])].at > now);
});

console.log('app shell');
test('the service worker caches every module and data file', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const walk = (dir) => readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  for (const f of [...walk('js'), ...walk('data')].filter((f) => /\.(js|mjs)$/.test(f))) assert.ok(sw.includes(`'${f}'`), `${f} missing from sw.js`);
});

await Promise.all(pending);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
