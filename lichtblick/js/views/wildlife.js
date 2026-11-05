// The Wildlife tab: the best chances for animal pictures in the next days, and a planner for one spot
// and one day: when the animals are about (hour by hour), the light, the weather and the wind for your
// approach, what is in season, what people have seen there (iNaturalist), and a species guide.
import { App, spotById } from '../app.js';
import { SPECIES, ETHICS } from '../../data/species.js';
import { wildlifeDay, inSeason } from '../wildlife.js';
import { scoreClass, scoreWord } from '../scoring.js';
import { hhmm, localMidnight, weekday, zurichParts, localHour, TZ } from '../astro.js';
import { esc, photoUrl, relDay, whenText } from '../ui.js';
import { getJSON, setJSON } from '../store.js';
import { compass } from '../geo.js';
import { speciesNearby, recentNearby, exploreUrl } from '../sources/inaturalist.js';
import { openSpot } from './spot.js';

const H = 3600e3;
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const COLOURS = ['#ffcf5c', '#6fdc8c', '#5cc8ff', '#c39bff', '#ff9a76'];
let dayOffset = null; // first time: today, or tomorrow once the evening is over
let spotId = getJSON('lb.wildSpot', null);
let inatMonth = true;

export function showWildFor(id) { spotId = id; setJSON('lb.wildSpot', id); }

const wildSpots = () => App.spots.filter((s) => s.species && s.species.length);

export function renderWildlife(root) {
  const spots = wildSpots();
  if (dayOffset == null) dayOffset = localHour(new Date()) >= 19 ? 1 : 0;
  if (!spotId || !spotById(spotId)) spotId = spots[0]?.id;
  const day = localMidnight(new Date(), dayOffset);
  const dayEnd = day.getTime() + 24 * H;
  // the best of the day, at most two per species so the list shows the variety
  const per = new Map();
  const ops = App.ops.filter((o) => o.type === 'wildlife' && o.start.getTime() < dayEnd && o.end.getTime() > day.getTime()).sort((a, b) => b.score - a.score)
    .filter((o) => { const n = per.get(o.species) || 0; per.set(o.species, n + 1); return n < 2; });
  const days = Array.from({ length: 5 }, (_, i) => localMidnight(new Date(), i));
  const spot = spotById(spotId);
  const groups = [
    ['Mountains', spots.filter((s) => !s.tags.includes('park') && (s.elev || 0) >= 1000)],
    ['Lakes, rivers & wetlands', spots.filter((s) => !s.tags.includes('park') && (s.elev || 0) < 1000)],
    ['Wildlife parks', spots.filter((s) => s.tags.includes('park'))],
  ];
  root.innerHTML = `<div class="wrap">
    <div class="hero-line"><h2>Wildlife</h2><span class="small muted">${spots.length} spots · animal activity, light & wind</span></div>
    <div class="chips">${days.map((d, i) => `<button class="chip" data-day="${i}" aria-pressed="${i === dayOffset}">${esc(relDay(d))}</button>`).join('')}</div>
    <div class="day-head">Best chances ${dayOffset === 0 ? 'today' : esc(relDay(day).toLowerCase())}</div>
    ${App.loading && !App.ops.length ? `<div class="cards">${'<div class="skeleton"></div>'.repeat(3)}</div>`
      : ops.length ? `<div class="cards">${ops.slice(0, 8).map((o) => card(o)).join('')}</div>` : '<div class="notice">No forecast for this day yet, or nothing promising.</div>'}

    <div class="section" id="planner">
      <div class="row sp" style="gap:8px;margin-top:22px"><h3>Plan your day</h3>
        <select class="spotpick" id="wspot" aria-label="Spot">${groups.map(([g, list]) => (list.length ? `<optgroup label="${esc(g)}">${list.map((s) => `<option value="${esc(s.id)}" ${s.id === spotId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>` : '')).join('')}</select></div>
      <div id="plan"></div>
    </div>

    <div class="section"><h3>Species guide</h3>${guide()}</div>
    <div class="section"><h3>Respect the animals</h3><ul class="small muted" style="padding-left:18px;margin:0">${ETHICS.map((e) => `<li style="margin:4px 0">${esc(e)}</li>`).join('')}</ul>
      <p class="tiny faint">The map shows wildlife rest zones, federal game reserves and bird reserves (Map → Layers → Wildlife).</p></div>
  </div>`;
  root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { dayOffset = +b.dataset.day; renderWildlife(root); }));
  root.querySelectorAll('[data-wild]').forEach((b) => b.addEventListener('click', () => { showWildFor(b.dataset.wild); renderWildlife(root); root.querySelector('#planner').scrollIntoView({ behavior: 'smooth' }); }));
  root.querySelector('#wspot')?.addEventListener('change', (e) => { showWildFor(e.target.value); renderPlan(root, spotById(spotId), day); });
  if (spot) renderPlan(root, spot, day);
}

function card(o) {
  const s = spotById(o.spotId);
  if (!s) return '';
  return `<button class="opcard" data-wild="${esc(s.id)}">
    <div class="ph" style="background-image:url('${esc(photoUrl(s.photos?.[0], 330))}')"><span class="ic">${o.icon}</span></div>
    <div class="bd"><div class="row sp"><span class="when">${esc(whenText(o))}</span><span class="score ${scoreClass(o.score)}" title="${scoreWord(o.score)}">${o.score}</span></div>
      <div class="t">${esc(o.title)}</div><div class="s">${esc(s.name)}${s.elev ? ` · ${Math.round(s.elev)} m` : ''}</div>
      <div class="w">${esc(o.why.slice(0, 2).join(' · '))}</div></div></button>`;
}

function renderPlan(root, spot, day) {
  const el = root.querySelector('#plan');
  if (!spot) { el.innerHTML = ''; return; }
  const fc = App.fc.get(spot.id);
  const date = new Date(day.getTime() + 12 * H);
  const r = fc ? wildlifeDay(spot, fc, date) : null;
  const season = inSeason(spot, date);
  const ph = spot.photos?.[0];
  el.innerHTML = `
    <button class="spotrow" data-open="${esc(spot.id)}" style="margin-top:10px"><div class="th" style="${ph ? `background-image:url('${esc(photoUrl(ph, 250))}')` : ''}">${ph ? '' : '📍'}</div>
      <div><div class="nm">${esc(spot.name)}</div><div class="small muted">${esc(spot.region || '')}${spot.elev ? ` · ${Math.round(spot.elev)} m` : ''}</div><div class="small">${season.slice(0, 4).map((x) => x.sp.icon).join(' ')} ${esc(season.slice(0, 3).map((x) => x.sp.name).join(', '))}</div></div><span class="small muted">Spot ›</span></button>
    ${r ? `<div class="sky-card" style="margin-top:12px">
        <div class="row sp"><div><div class="when">${esc(relDay(day))} · ${hhmm(new Date(r.start))}–${hhmm(new Date(r.end))}</div><b style="font-size:17px">${r.icon} ${esc(r.title)}</b></div><span class="score ${scoreClass(r.score)}">${r.score}</span></div>
        <ul class="small muted" style="padding-left:18px;margin:8px 0 0">${r.why.map((w) => `<li style="margin:2px 0">${esc(w)}</li>`).join('')}</ul></div>
      <div style="margin-top:12px">${activityChart(r)}</div>
      ${weatherStrip(fc, r)}`
      : `<div class="notice">${fc ? 'No species in season here on this day.' : 'The forecast reaches five days ahead; pick an earlier day.'}</div>`}
    <h3 style="margin:18px 0 8px">In season here</h3>
    <div class="oplist">${season.map((x) => `<div class="opline"><div class="ic">${x.sp.icon}</div><div><b>${esc(x.sp.name)}</b> <span class="small muted">${esc(x.sp.local)}</span>
      ${seasonBar(x.sp.season, zurichParts(date).m)}
      ${x.events.length ? `<div class="small" style="color:var(--gold2);margin-top:3px">${esc(x.events.map((e) => e.title).join(' · '))}</div>` : ''}
      <div class="small muted" style="margin-top:3px">${esc(x.sp.tips)}</div></div><span></span></div>`).join('')}</div>
    <h3 style="margin:18px 0 8px">Seen near here <span class="small muted">(iNaturalist, 10 km)</span></h3>
    <div class="segbar"><button data-im="1" aria-pressed="${inatMonth}">In ${new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: TZ }).format(date)}</button><button data-im="0" aria-pressed="${!inatMonth}">All year</button></div>
    <div id="inat" style="margin-top:8px"><div class="skeleton" style="height:90px"></div></div>
    <h3 style="margin:18px 0 8px">Latest photos from here</h3><div id="inatphotos"><div class="skeleton" style="height:90px"></div></div>
    <p class="tiny faint"><a href="${exploreUrl(spot)}" target="_blank" rel="noopener">All observations on iNaturalist ↗</a></p>`;
  el.querySelector('[data-open]').addEventListener('click', () => openSpot(spot.id));
  el.querySelectorAll('[data-im]').forEach((b) => b.addEventListener('click', () => { inatMonth = b.dataset.im === '1'; el.querySelectorAll('[data-im]').forEach((x) => x.setAttribute('aria-pressed', (x.dataset.im === '1') === inatMonth)); fillInat(el, spot, date); }));
  fillInat(el, spot, date);
  fillPhotos(el, spot);
}

// the day's activity, species by species, over the light
function activityChart(r) {
  const hrs = r.hours, n = hrs.length, W = 340, Hh = 170, top = 18, bot = 34, left = 6, right = 6;
  const x = (i) => left + (i / Math.max(1, n - 1)) * (W - left - right), y = (v) => Hh - bot - v * (Hh - top - bot);
  let g = '';
  const lightCol = { dark: '#070c18', twilight: '#1d2550', golden: '#4a3520', harsh: '#1c2a44', good: '#17233b', soft: '#1a2338' };
  hrs.forEach((h, i) => { const w = (W - left - right) / Math.max(1, n - 1); g += `<rect x="${(x(i) - w / 2).toFixed(1)}" y="${top}" width="${(w + 0.5).toFixed(1)}" height="${Hh - top - bot}" fill="${lightCol[h.light.word]}"/>`; });
  const ids = [...new Set(hrs.flatMap((h) => Object.keys(h.by)))].map((id) => [id, Math.max(...hrs.map((h) => h.by[id] || 0))]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  ids.forEach(([id], k) => {
    const d = hrs.map((h, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(h.by[id] || 0).toFixed(1)}`).join('');
    g += `<path d="${d}" fill="none" stroke="${COLOURS[k]}" stroke-width="${k ? 1.6 : 2.6}" stroke-linejoin="round"/>`;
  });
  const i0 = hrs.findIndex((h) => h.t === r.start), i1 = hrs.findIndex((h) => h.t === r.end - H);
  if (i0 >= 0) g += `<rect x="${x(i0) - 3}" y="${top}" width="${x(Math.max(i1, i0)) - x(i0) + 6}" height="${Hh - top - bot}" fill="none" stroke="#ffb547" stroke-dasharray="4 3" rx="4"/>`;
  hrs.forEach((h, i) => { if (i % 2 === 0) g += `<text x="${x(i)}" y="${Hh - bot + 13}" font-size="9.5" fill="#7d8bab" text-anchor="middle">${hhmm(new Date(h.t)).slice(0, 2)}</text>`; });
  const mark = (t, label) => { const i = (t - hrs[0].t) / H; if (i < 0 || i > n - 1) return; const X = left + (i / Math.max(1, n - 1)) * (W - left - right); g += `<line x1="${X}" x2="${X}" y1="${top}" y2="${Hh - bot}" stroke="#ffcf5c" stroke-opacity="0.5"/><text x="${X}" y="${top - 5}" font-size="9.5" fill="#ffcf5c" text-anchor="middle">${label}</text>`; };
  mark(r.ev.sunrise.getTime(), `☀︎↑ ${hhmm(r.ev.sunrise)}`); mark(r.ev.sunset.getTime(), `☀︎↓ ${hhmm(r.ev.sunset)}`);
  const legend = ids.map(([id], k) => `<span><i style="background:${COLOURS[k]}"></i>${esc(SPECIES[id].name)}</span>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="Animal activity through the day">${g}<text x="${W - 8}" y="${Hh - 6}" font-size="9" fill="#5e6c8a" text-anchor="end">brown = golden light · dark = night</text></svg>
    <div class="legend">${legend}<span>dashed box: best window</span></div>`;
}

function weatherStrip(fc, r) {
  const rows = r.hours.filter((h, i) => i % 2 === 0);
  const v = (k, t) => { const i = Math.round((t - fc.t[0]) / H); return i >= 0 && i < fc.t.length && fc[k] ? fc[k][i] : null; };
  return `<div class="scroll-x" style="margin-top:10px"><table class="hours"><tr><th class="rh"></th>${rows.map((h) => `<th>${hhmm(new Date(h.t)).slice(0, 2)}</th>`).join('')}</tr>
    <tr><th class="rh">°C</th>${rows.map((h) => `<td>${v('temp', h.t) == null ? '' : Math.round(v('temp', h.t))}</td>`).join('')}</tr>
    <tr><th class="rh">Wind</th>${rows.map((h) => { const d = v('windDir', h.t), w = v('wind', h.t); return `<td title="from ${d == null ? '' : compass(d)}">${d == null ? '' : `<span style="display:inline-block;transform:rotate(${(d + 180) % 360}deg)">↑</span>`}${w == null ? '' : Math.round(w)}</td>`; }).join('')}</tr>
    <tr><th class="rh">Rain</th>${rows.map((h) => { const p = v('precip', h.t + H); return `<td style="color:#4fa8ff">${p > 0.1 ? p.toFixed(1) : ''}</td>`; }).join('')}</tr>
    <tr><th class="rh">Clouds</th>${rows.map((h) => { const c = v('cloud', h.t); return `<td style="background:rgba(200,212,238,${c == null ? 0 : (0.1 + 0.6 * c / 100).toFixed(2)})">${c == null ? '' : Math.round(c)}</td>`; }).join('')}</tr>
    <tr><th class="rh">Light</th>${rows.map((h) => `<td class="tiny">${{ dark: '·', twilight: 'dim', golden: 'gold', harsh: 'hard', good: 'good', soft: 'soft' }[h.light.word]}</td>`).join('')}</tr></table></div>
    <div class="legend"><span>Arrows show where the wind blows to: keep it in your face as you approach.</span></div>`;
}

function seasonBar(season, m) {
  return `<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:2px;margin-top:5px;max-width:300px">${season.map((v, i) => `<div title="${MONTHS[i]}" style="height:16px;border-radius:3px;background:rgba(111,220,140,${(0.08 + 0.85 * v).toFixed(2)});${i === m - 1 ? 'outline:1.5px solid #ffb547;' : ''}font-size:9px;text-align:center;color:#0b1220;line-height:16px">${MONTHS[i]}</div>`).join('')}</div>`;
}

function guide() {
  return Object.entries(SPECIES).filter(([id]) => id !== 'park').map(([id, sp]) => `<details class="card" style="padding:10px 12px;margin:6px 0"><summary style="cursor:pointer"><b>${sp.icon} ${esc(sp.name)}</b> <span class="small muted">${esc(sp.local)}</span></summary>
    ${seasonBar(sp.season, zurichParts(new Date()).m)}
    ${sp.events.map((e) => `<p class="small" style="margin:6px 0 0"><span style="color:var(--gold2)">${esc(e.title)}</span> <span class="muted">(${fmtRange(e.from, e.to)})</span>: ${esc(e.text)}</p>`).join('')}
    <p class="small muted" style="margin:6px 0 0">${esc(sp.tips)}</p></details>`).join('');
}
const fmtRange = (a, b) => { const f = (s) => { const [m, d] = s.split('-').map(Number); return new Date(Date.UTC(2026, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }; return `${f(a)} – ${f(b)}`; };

async function fillInat(el, spot, date) {
  const box = el.querySelector('#inat');
  if (!box) return;
  box.innerHTML = '<div class="skeleton" style="height:90px"></div>';
  try {
    const r = await speciesNearby(spot, { month: inatMonth ? zurichParts(date).m : null });
    if (!box.isConnected) return;
    if (!r.list.length) { box.innerHTML = '<div class="notice">No research-grade mammal or bird records here yet.</div>'; return; }
    const max = r.list[0].count;
    box.innerHTML = `<div class="oplist">${r.list.slice(0, 12).map((s) => `<div class="row" style="gap:10px;background:var(--card);border-radius:12px;padding:6px 8px">
      ${s.photo ? `<img src="${esc(s.photo)}" alt="" width="40" height="40" style="border-radius:8px;object-fit:cover" loading="lazy" title="${esc(s.attribution || '')}">` : '<div style="width:40px;height:40px;border-radius:8px;background:var(--card2);display:grid;place-items:center">' + (s.group === 'Aves' ? '🐦' : '🐾') + '</div>'}
      <div style="flex:1;min-width:0"><div class="small"><b>${esc(s.name)}</b></div><div class="progress" style="margin-top:4px"><i style="width:${Math.round((s.count / max) * 100)}%"></i></div></div>
      <span class="small muted">${s.count}×</span></div>`).join('')}</div>`;
  } catch (e) { if (box.isConnected) box.innerHTML = `<div class="notice">iNaturalist not reachable (${esc(e.message)}).</div>`; }
}

async function fillPhotos(el, spot) {
  const box = el.querySelector('#inatphotos');
  try {
    const list = await recentNearby(spot);
    if (!box.isConnected) return;
    box.innerHTML = list.length ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px">${list.slice(0, 9).map((o) => `<a href="${esc(o.uri)}" target="_blank" rel="noopener" style="position:relative;display:block;aspect-ratio:1;border-radius:10px;overflow:hidden;background:var(--card2)">
      <img src="${esc(o.photo)}" alt="${esc(o.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover">
      <span class="tiny" style="position:absolute;left:0;right:0;bottom:0;padding:3px 5px;background:linear-gradient(transparent,rgba(0,0,0,.75));color:#fff">${esc(o.name)}<br>${esc(o.date || '')}</span></a>`).join('')}</div>
      <p class="tiny faint">Photos © their authors on iNaturalist, Creative Commons; tap one for the observation and its licence.</p>` : '<div class="notice">No recent photos here.</div>';
  } catch (e) { if (box.isConnected) box.innerHTML = `<div class="notice">iNaturalist not reachable (${esc(e.message)}).</div>`; }
}
