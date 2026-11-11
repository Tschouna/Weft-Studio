// Wildlife: the best chances for animal pictures on each forecast day, and a planner for one spot and
// day: when each species is about, hour by hour, over the light; the weather and where the wind takes
// your scent; what is in season; what people have photographed there (iNaturalist); a species guide.
import { App, spotById } from '../app.js';
import { SPECIES, ETHICS } from '../../data/species.js';
import { wildlifeDay, inSeason, lightAt } from '../wildlife.js';
import { opDayOf } from '../scoring.js';
import { DAY_START } from '../brief.js';
import { hhmm, localMidnight, weekday, zurichParts, TZ } from '../astro.js';
import { icon } from '../icons.js';
import { esc, photoUrl, relDay, plate } from '../ui.js';
import { getJSON, setJSON } from '../store.js';
import { speciesNearby, recentNearby, exploreUrl } from '../sources/inaturalist.js';
import { hourTable, weatherRows } from './charts.js';
import { chanceRow } from './parts.js';
import { openSpot } from './spot.js';

const H = 3600e3, DAY = 864e5;
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const LINES = [['var(--ink)', 3, ''], ['var(--accent)', 2, ''], ['var(--link)', 2, ''], ['var(--ink2)', 1.5, '4 3']];
let sel = null; // chosen day (local midnight, ms)
let spotId = getJSON('lb.wildSpot', null);
let inatMonth = true;

export function showWildFor(id) { spotId = id; setJSON('lb.wildSpot', id); }
const wildSpots = () => App.spots.filter((s) => s.species && s.species.length);

export function renderWildlife(root) {
  const spots = wildSpots(), today = localMidnight(new Date()).getTime();
  const reach = App.reach ? Math.max(1, Math.min(10, Math.floor((App.reach - today - DAY_START * H) / DAY) + 1)) : 5;
  const days = Array.from({ length: reach }, (_, i) => localMidnight(new Date(today + 12 * H), i).getTime());
  const all = App.ops.filter((o) => o.type === 'wildlife');
  if (sel == null || !days.includes(sel)) sel = App.ops.length && !all.some((o) => opDayOf(o) === today) ? days[1] ?? today : today;
  if (!spotId || !spotById(spotId)) spotId = spots[0]?.id;
  const per = new Map(); // at most two per species, so the list shows the variety
  const ops = all.filter((o) => opDayOf(o) === sel).sort((a, b) => b.score - a.score).filter((o) => { const n = per.get(o.species) || 0; per.set(o.species, n + 1); return n < 2; });
  const groups = [
    ['Mountains', spots.filter((s) => !s.tags.includes('park') && (s.elev || 0) >= 1000)],
    ['Lakes, rivers and wetlands', spots.filter((s) => !s.tags.includes('park') && (s.elev || 0) < 1000)],
    ['Wildlife parks', spots.filter((s) => s.tags.includes('park'))],
  ];
  root.innerHTML = `<div class="wrap">
    <div class="pagehead"><div><div class="eyebrow">${spots.length} places · activity, light and wind</div><h1 class="h1 mt4">Wildlife</h1></div></div>
    <div class="chips">${days.map((d) => `<button class="chip" data-day="${d}" aria-pressed="${d === sel}">${d === today ? 'Today' : `${weekday(new Date(d + 12 * H))} ${zurichParts(new Date(d + 12 * H)).d}`}</button>`).join('')}</div>
    <div class="sec" style="margin-top:14px"><div class="sec-head"><span class="eyebrow">Best chances · ${esc(relDay(new Date(sel + 12 * H)))}</span></div>
      ${App.loading && !App.ops.length ? `<div class="stack">${'<div class="skeleton"></div>'.repeat(3)}</div>`
        : ops.length ? `<div class="rows">${ops.slice(0, 8).map((o) => chanceRow(o, { attr: 'data-wild' })).join('')}</div>` : '<p class="small muted">Nothing promising in the forecast for this day.</p>'}</div>

    <div class="sec" id="planner"><div class="sec-head"><span class="eyebrow">Plan a place</span></div>
      <select class="pick" id="wspot" aria-label="Spot" style="width:100%">${groups.map(([g, list]) => (list.length ? `<optgroup label="${esc(g)}">${list.map((s) => `<option value="${esc(s.id)}" ${s.id === spotId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>` : '')).join('')}</select>
      <div id="plan"></div></div>

    <div class="sec"><div class="sec-head"><span class="eyebrow">Species guide</span><span class="tiny faint">${Object.keys(SPECIES).length - 1} species</span></div>${guide()}</div>
    <div class="sec"><div class="sec-head"><span class="eyebrow">Respect the animals</span></div><ul class="bul" style="font-size:13.5px">${ETHICS.map((e) => `<li style="margin:5px 0">${esc(e)}</li>`).join('')}</ul>
      <p class="tiny faint mt8">The map shows wildlife rest zones, federal game reserves and bird reserves: Map, Layers, Wildlife.</p></div>
  </div>`;
  root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { sel = +b.dataset.day; renderWildlife(root); }));
  root.querySelectorAll('[data-wild]').forEach((b) => b.addEventListener('click', () => { showWildFor(b.dataset.wild); renderWildlife(root); root.querySelector('#planner').scrollIntoView({ behavior: 'smooth' }); }));
  root.querySelector('#wspot')?.addEventListener('change', (e) => { showWildFor(e.target.value); renderPlan(root, spotById(spotId)); });
  const spot = spotById(spotId);
  if (spot) renderPlan(root, spot);
}

function renderPlan(root, spot) {
  const el = root.querySelector('#plan');
  if (!spot) { el.innerHTML = ''; return; }
  const fc = App.fc.get(spot.id), date = new Date(sel + 12 * H);
  const r = fc ? wildlifeDay(spot, fc, date) : null;
  const season = inSeason(spot, date), ph = spot.photos?.[0];
  el.innerHTML = `
    <button class="spotrow mt8" data-open="${esc(spot.id)}"><div class="th" style="${ph ? `background-image:url('${esc(photoUrl(ph, 250))}')` : ''}">${ph ? '' : icon('pin')}</div>
      <div style="min-width:0"><div class="nm">${esc(spot.name)}</div><div class="small muted clip1">${esc(spot.region || '')}${spot.elev ? ` · <span class="peak tnum">${Math.round(spot.elev)} m</span>` : ''}</div></div><span class="small muted">Spot ${icon('right', 12)}</span></button>
    ${r ? `<div class="card pad mt8"><div class="row sp" style="align-items:flex-start"><div><div class="eyebrow">${esc(relDay(date))} · ${hhmm(new Date(r.start))}–${hhmm(new Date(r.end))}</div><div class="h2 mt4">${icon(r.icon)} ${esc(r.title)}</div></div>${plate(r.score, true)}</div>
        <ul class="bul" style="font-size:13.5px">${r.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>
      <div class="mt12">${activityChart(r)}</div>
      ${hourTable(r.hours.map((h) => h.t), weatherRows(fc, { light: (t) => ({ dark: '·', twilight: 'dim', golden: 'gold', harsh: 'hard', good: 'good', soft: 'soft' }[lightAt(t, spot, fc).word]) }))}
      <p class="tiny faint mt8">Wind arrows point where the wind blows to: keep it in your face as you approach.</p>`
      : `<div class="notice mt8">${fc ? 'No species in season here on this day.' : 'No forecast for this day.'}</div>`}
    <div class="eyebrow mt24">In season here</div>
    <div class="rows mt4">${season.map((x) => `<div class="opl" style="grid-template-columns:26px 1fr">${icon(x.sp.glyph)}<div><b>${esc(x.sp.name)}</b> <span class="small muted">${esc(x.sp.local)}</span>
      ${monthBar(x.sp.season, zurichParts(date).m)}
      ${x.events.length ? `<div class="small accent strong mt4">${esc(x.events.map((e) => e.title).join(' · '))}</div>` : ''}
      <div class="small muted mt4">${esc(x.sp.tips)}</div></div></div>`).join('')}</div>
    <div class="row sp mt24"><span class="eyebrow">Seen near here</span><div class="seg"><button data-im="1" aria-pressed="${inatMonth}">${new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: TZ }).format(date)}</button><button data-im="0" aria-pressed="${!inatMonth}">All year</button></div></div>
    <div id="inat" class="mt8"><div class="skeleton"></div></div>
    <div class="eyebrow mt24">Latest photos from here</div><div id="inatphotos" class="mt8"><div class="skeleton"></div></div>
    <p class="tiny faint mt8">Research-grade sightings within 10 km on <a href="${exploreUrl(spot)}" target="_blank" rel="noopener">iNaturalist</a>.</p>`;
  el.querySelector('[data-open]').addEventListener('click', () => openSpot(spot.id));
  el.querySelectorAll('[data-im]').forEach((b) => b.addEventListener('click', () => { inatMonth = b.dataset.im === '1'; el.querySelectorAll('[data-im]').forEach((x) => x.setAttribute('aria-pressed', (x.dataset.im === '1') === inatMonth)); fillInat(el, spot, date); }));
  fillInat(el, spot, date);
  fillPhotos(el, spot);
}

// the day's activity, species by species, over the light
function activityChart(r) {
  const hrs = r.hours, n = hrs.length, W = 360, Hh = 170, top = 20, bot = 24, x = (i) => 4 + (i / Math.max(1, n - 1)) * (W - 8), y = (v) => Hh - bot - v * (Hh - top - bot);
  const band = { dark: 'var(--sky-night)', twilight: 'var(--sky-blue)', golden: 'var(--sky-gold)' };
  let g = `<rect x="0" y="${top}" width="${W}" height="${Hh - top - bot}" fill="var(--paper)"/>`;
  hrs.forEach((h, i) => { const w = (W - 8) / Math.max(1, n - 1), c = band[h.light.word]; if (c) g += `<rect x="${(x(i) - w / 2).toFixed(1)}" y="${top}" width="${(w + 0.4).toFixed(1)}" height="${Hh - top - bot}" fill="${c}" opacity="${h.light.word === 'golden' ? 0.45 : 0.9}"/>`; });
  for (const v of [0.5, 1]) g += `<line x1="0" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)"/>`;
  const ids = [...new Set(hrs.flatMap((h) => Object.keys(h.by)))].map((id) => [id, Math.max(...hrs.map((h) => h.by[id] || 0))]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  [...ids].reverse().forEach(([id], rk) => {
    const k = ids.length - 1 - rk, [col, sw, dash] = LINES[k];
    g += `<path d="${hrs.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.by[id] || 0).toFixed(1)}`).join('')}" fill="none" stroke="${col}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"/>`;
  });
  const i0 = hrs.findIndex((h) => h.t === r.start), i1 = hrs.findIndex((h) => h.t === r.end - H);
  if (i0 >= 0) g += `<rect x="${x(i0) - 3}" y="${top + 1}" width="${x(Math.max(i1, i0)) - x(i0) + 6}" height="${Hh - top - bot - 2}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  hrs.forEach((h, i) => { if (i % 2 === 0) g += `<text x="${x(i)}" y="${Hh - 8}" font-size="10" fill="var(--ink2)" text-anchor="middle" style="font-variant-numeric:tabular-nums">${hhmm(new Date(h.t)).slice(0, 2)}</text>`; });
  const mark = (t, label) => { const i = (t - hrs[0].t) / H; if (i < 0 || i > n - 1) return; g += `<line x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${Hh - bot}" stroke="var(--ink)" stroke-width="1"/><text x="${x(i)}" y="${top - 6}" font-size="10" font-weight="700" fill="var(--ink)" text-anchor="middle">${label}</text>`; };
  mark(r.ev.sunrise.getTime(), `rise ${hhmm(r.ev.sunrise)}`); mark(r.ev.sunset.getTime(), `set ${hhmm(r.ev.sunset)}`);
  return `<div class="chartbox"><svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Animal activity through the day">${g}</svg></div>
    <div class="legend">${ids.map(([id], k) => `<span><i style="background:${LINES[k][0]};height:${LINES[k][1] + 1}px;vertical-align:3px"></i>${esc(SPECIES[id].name)}</span>`).join('')}<span><i style="outline:1.5px dashed var(--accent);background:none"></i>best window</span></div>`;
}

const monthBar = (season, m) => `<div class="monthbar">${season.map((v, i) => `<i class="${i === m - 1 ? 'now' : ''}" style="opacity:${(0.1 + 0.9 * v).toFixed(2)}" title="${MONTHS[i]}">${MONTHS[i]}</i>`).join('')}</div>`;

function guide() {
  const m = zurichParts(new Date()).m;
  return Object.entries(SPECIES).filter(([id]) => id !== 'park').map(([, sp]) => `<details class="fold"><summary>${icon(sp.glyph)}<span>${esc(sp.name)} <span class="small muted" style="font-weight:400">${esc(sp.local)}</span></span></summary><div>
    ${monthBar(sp.season, m)}
    ${sp.events.map((e) => `<p class="small mt8"><b>${esc(e.title)}</b> <span class="muted">${fmtRange(e.from, e.to)}.</span> ${esc(e.text)}</p>`).join('')}
    <p class="small muted mt8">${esc(sp.tips)}</p></div></details>`).join('');
}
const fmtRange = (a, b) => { const f = (s) => { const [m, d] = s.split('-').map(Number); return new Date(Date.UTC(2026, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }; return `${f(a)} to ${f(b)}`; };

async function fillInat(el, spot, date) {
  const box = el.querySelector('#inat');
  if (!box) return;
  box.innerHTML = '<div class="skeleton"></div>';
  try {
    const r = await speciesNearby(spot, { month: inatMonth ? zurichParts(date).m : null });
    if (!box.isConnected) return;
    if (!r.list.length) { box.innerHTML = '<p class="small muted">No research-grade mammal or bird records here yet.</p>'; return; }
    const max = r.list[0].count;
    box.innerHTML = `<div class="rows">${r.list.slice(0, 10).map((s) => `<div class="inat">
      ${s.photo ? `<img src="${esc(s.photo)}" alt="" loading="lazy" title="${esc(s.attribution || '')}">` : `<div class="noimg">${icon(s.group === 'Aves' ? 'bird' : 'paw')}</div>`}
      <div style="min-width:0"><div class="small strong clip1">${esc(s.name)}</div><div class="progress mt4"><i style="width:${Math.round((s.count / max) * 100)}%;background:var(--ink)"></i></div></div>
      <span class="small muted tnum">${s.count}×</span></div>`).join('')}</div>`;
  } catch (e) { if (box.isConnected) box.innerHTML = `<p class="small muted">iNaturalist is not reachable (${esc(e.message)}).</p>`; }
}

async function fillPhotos(el, spot) {
  const box = el.querySelector('#inatphotos');
  try {
    const list = await recentNearby(spot);
    if (!box || !box.isConnected) return;
    box.innerHTML = list.length ? `<div class="thumbs3">${list.slice(0, 9).map((o) => `<a href="${esc(o.uri)}" target="_blank" rel="noopener"><img src="${esc(o.photo)}" alt="${esc(o.name)}" loading="lazy"><span>${esc(o.name)}<br>${esc(o.date || '')}</span></a>`).join('')}</div>
      <p class="tiny faint mt8">Photos by their authors on iNaturalist under Creative Commons licences; tap one for the observation.</p>` : '<p class="small muted">No recent photos here.</p>';
  } catch (e) { if (box && box.isConnected) box.innerHTML = `<p class="small muted">iNaturalist is not reachable (${esc(e.message)}).</p>`; }
}
