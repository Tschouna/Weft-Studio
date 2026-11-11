// One spot: the photograph, what is coming up there and how to shoot it, a planner for any forecast
// day with the light over the real mountains, the light compass, the forecast strip, what lives
// there, how to get there and when you may be there, live MeteoSwiss readings and webcams.
import { App, spotById, deleteMySpot, loadSpots } from '../app.js';
import { iconOf, autumnWindow, iceLikely, CONF_WORDS, opDayOf } from '../scoring.js';
import { dayEvents, hhmm, terrainSun, moonAt, localMidnight, weekday, TZ, zurichParts } from '../astro.js';
import { lightBands, SHOOT, DAY_START } from '../brief.js';
import { lightAt, inSeason } from '../wildlife.js';
import { icon, signal } from '../icons.js';
import { esc, photoUrl, commonsPage, credit, openSheet, closeSheet, sheetHead, whenText, toast, moonSvg, rerenderSheet, plate } from '../ui.js';
import { favourites, setFavourites, kvDel } from '../store.js';
import { compass, compassWords, distance, fmtKm, wgsToLv95, bearing } from '../geo.js';
import { live, webcams, LIVE } from '../sources/meteoswiss.js';
import { horizonFor } from '../sources/swisstopo.js';
import { seeingPage } from '../sources/meteoblue.js';
import { BORTLE_WORDS } from '../lightpollution.js';
import { meteogram, panorama, sunPath, lightRibbon, lightLegend, lightCompass, hourTable, weatherRows } from './charts.js';

const H = 3600e3, DAY = 864e5;
const NIGHT = { free: ['moon', 'Open at night'], hike: ['walk', 'At night on foot only'], stay: ['bed', 'Stay up there overnight'], closed: ['lock', 'Closed at night'], reserve: ['shield', 'Protected area'] };
export function skyLine(spot) {
  if (!spot.sky) return '';
  const g = spot.sky.glow && spot.sky.glow.share > 0.2 && spot.sky.bortle >= 3 ? `, main light glow from ${spot.sky.glow.name} in the ${compassWords(spot.sky.glow.az)}` : '';
  return `${BORTLE_WORDS[spot.sky.bortle]} (Bortle ${spot.sky.bortle})${g}${spot.lit ? '; artificial lights on site' : ''}`;
}

export const TAG_LABELS = {
  lake: 'Lake or pond', reflection: 'Mirror reflections', peaks: 'Mountain view', alpenglow: 'Alpenglow peaks', fogsea: 'Above the sea of fog',
  mist: 'Morning mist', lowland: 'Lowland / valley floor', larch: 'Larches', beech: 'Beech & deciduous', chestnut: 'Chestnut woods', vineyard: 'Vineyards',
  waterfall: 'Waterfall', river: 'River', glacier: 'Glacier', darksky: 'Dark sky', city: 'City lights', lightning: 'Storm viewpoint',
  frozen: 'Lake that freezes', snow: 'Snow scenes', hoarfrost: 'Hoarfrost', sunrise: 'Sunrise spot', sunset: 'Sunset spot', bluehour: 'Blue hour', castle: 'Castle', bridge: 'Bridge', railway: 'Railway', valley: 'Valley', cliff: 'Cliff',
  wildlife: 'Wildlife', park: 'Wildlife park',
};
const monthName = (m) => new Date(Date.UTC(2026, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long' });
const fmtD = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });

export function openSpot(id) {
  if (!spotById(id)) return toast('Spot not found');
  let photoIdx = 0, planDay = null;
  openSheet((root) => render(root));

  function render(root) {
    const spot = spotById(id);
    if (!spot) { closeSheet(); return; }
    const fav = favourites(), fc = App.fc.get(id), hz = spot.horizon, now = new Date();
    const ops = (App.opsBySpot.get(id) || []).filter((o) => o.score >= 40);
    const upcoming = [...ops].sort((a, b) => b.score - a.score).slice(0, 6).sort((a, b) => a.peak - b.peak);
    const ph = spot.photos?.[photoIdx] || spot.photos?.[0];
    const { e, n } = wgsToLv95(spot.lat, spot.lon);
    const aw = autumnWindow(spot, zurichParts(now).y);
    const ice = fc ? iceLikely(spot, fc, now) : { likely: false };
    const today = localMidnight(now).getTime();
    const reach = fc && fc.t.length ? Math.max(1, Math.min(10, Math.floor((fc.t[fc.t.length - 1] - today - DAY_START * H) / DAY) + 1)) : 1;
    const days = Array.from({ length: reach }, (_, i) => localMidnight(new Date(today + 12 * H), i).getTime());
    if (planDay == null || !days.includes(planDay)) planDay = days[0];
    const [nIcon, nWord] = NIGHT[spot.night] || ['moon', ''];

    root.innerHTML = `${sheetHead(spot.mine ? 'Your spot' : spot.region || 'Spot')}
      ${ph ? `<div class="photo"><img src="${esc(photoUrl(ph, 960))}" alt="${esc(spot.name)}">
        ${spot.photos.length > 1 ? `<div class="swap">${spot.photos.map((p, i) => `<button data-ph="${i}" aria-pressed="${i === photoIdx}" aria-label="${p.night ? 'Night photo' : 'Day photo'}"></button>`).join('')}</div>` : ''}</div>` : ''}
      <div class="sheet-body">
        ${ph && ph.file ? `<p class="tiny faint mt4" style="text-align:right">Photo: <a href="${commonsPage(ph)}" target="_blank" rel="noopener" style="color:inherit">${esc(credit(ph))}</a></p>` : ''}
        <h1 class="h1 mt12">${esc(spot.name)}</h1>
        <div class="muted mt4">${esc(spot.region || '')}${spot.elev ? ` · <span class="peak tnum">${Math.round(spot.elev)} m</span>` : ''}${App.me ? ` · ${fmtKm(distance(App.me, spot))} away` : ''}</div>
        <div class="btns mt12">
          <button class="btn small ${fav.has(id) ? 'primary' : ''}" data-act="fav">${icon(fav.has(id) ? 'saved' : 'save')}${fav.has(id) ? 'Saved' : 'Save'}</button>
          <button class="btn small" data-act="3d">${icon('terrain')}3D &amp; shadows</button>
          <button class="btn small" data-act="sky">${icon('night')}Night sky</button>
          ${spot.species && spot.species.length ? `<button class="btn small" data-act="wild">${icon('paw')}Wildlife</button>` : ''}
          <a class="btn small" href="https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lon}" target="_blank" rel="noopener">${icon('route')}Directions</a>
          ${spot.mine ? `<button class="btn small" data-act="edit">Edit</button>` : ''}
        </div>
        ${spot.blurb ? `<p class="mt16" style="font-size:16px;line-height:1.42">${esc(spot.blurb)}</p>` : ''}
        <div class="tags mt12">${(spot.tags || []).map((t) => `<span class="tag">${esc(TAG_LABELS[t] || t)}</span>`).join('')}</div>

        <div class="facts mt16">
          <div><b class="num">${spot.sky ? `Bortle ${spot.sky.bortle}` : '–'}</b><span>Night sky</span><small>${spot.sky ? esc(BORTLE_WORDS[spot.sky.bortle]) : 'not measured yet'}</small></div>
          <div><b>${icon(nIcon, 20)}</b><span>${esc(nWord || 'Access')}</span><small>${spot.open ? 'opening hours' : spot.night === 'free' ? 'any hour' : ''}</small></div>
          <div><b class="num">${spot.months ? `${monthName(spot.months[0]).slice(0, 3)}–${monthName(spot.months[1]).slice(0, 3)}` : 'All year'}</b><span>Season</span><small>${spot.months ? 'normally reachable' : ''}</small></div>
        </div>

        <div class="sec"><div class="sec-head"><span class="eyebrow">Now, at MeteoSwiss stations nearby</span></div><div id="live" class="facts"><div class="skeleton" style="grid-column:1/-1;height:58px"></div></div></div>

        <div class="sec"><div class="sec-head"><span class="eyebrow">Coming up here</span><span class="tiny faint">${reach} days</span></div>
          ${upcoming.length ? `<div class="rows">${upcoming.map((o) => `<div class="opl">${icon(iconOf(o))}
            <div><div class="when">${esc(whenText(o))}</div><b>${esc(o.title)}</b><ul>${o.why.slice(0, 3).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
              <div class="meta"><span title="${esc(CONF_WORDS[o.conf] || '')}">${signal(o.conf, 13)}${esc((CONF_WORDS[o.conf] || '').split(':')[0])}</span></div>
              <details class="more"><summary>${icon('right', 12)}${o.why.length > 3 ? 'More, and how to shoot it' : 'How to shoot it'}</summary>
                ${o.why.length > 3 ? `<ul class="bul">${o.why.slice(3).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
                <ul class="bul" style="color:var(--ink)">${(SHOOT[o.type] || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details></div>
            ${plate(o.score)}</div>`).join('')}</div>`
            : `<div class="notice">${App.loading ? 'Loading the forecast…' : 'Nothing special here in the coming days.'}</div>`}
        </div>

        <div class="sec"><div class="sec-head"><span class="eyebrow">Plan a day</span><span class="tiny faint">light over the real horizon</span></div>
          <div class="chips">${days.map((d) => `<button class="chip" data-plan="${d}" aria-pressed="${d === planDay}">${d === today ? 'Today' : `${weekday(new Date(d + 12 * H))} ${zurichParts(new Date(d + 12 * H)).d}`}</button>`).join('')}</div>
          <div id="plan" class="mt12"></div>
        </div>

        <div class="sec"><div class="sec-head"><span class="eyebrow">Light compass</span><span class="tiny faint">${esc(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(planDay + 12 * H)))}</span></div>
          <div id="compass">${lightCompass(spot, new Date(planDay + 12 * H), hz)}</div>
          <div class="legend"><span><i style="background:var(--sunc)"></i>sun, with the hours</span><span><i style="background:var(--ink2);height:2px;vertical-align:3px"></i>moon</span><span><i style="background:var(--ink);opacity:.2"></i>mountains: the further in, the higher</span>${Number.isFinite(spot.heading) ? '<span><i style="background:var(--accent);opacity:.3"></i>direction of the photo</span>' : ''}</div>
          <details class="fold mt12"><summary>${icon('photo')}Horizon as a panorama</summary><div id="pano">${hz ? panorama(spot, hz, new Date(planDay + 12 * H), { centre: 180, paths: [{ pts: sunPath(spot, new Date(planDay + 12 * H)), color: '#ffcf5c' }], band: false, showCore: false, showMoon: false, maxAlt: 60 }) : '<div class="notice">Working out the mountain horizon from swisstopo elevation data…</div>'}
            <p class="tiny faint mt8">Mountains from swisstopo elevation profiles out to 60 km (Swiss terrain only). Yellow: the sun's path with times.</p></div></details>
        </div>

        <div class="sec"><div class="sec-head"><span class="eyebrow">Forecast</span><span class="tiny faint">MeteoSwiss, then outlook</span></div>${meteogram(fc, spot, ops)}</div>

        ${spot.species && spot.species.length ? `<div class="sec"><div class="sec-head"><span class="eyebrow">Wildlife here</span><button class="btn small quiet" data-act="wild">Activity, light &amp; wind ${icon('right', 12)}</button></div>
          <div class="rows">${inSeason(spot, now).map((x) => `<div class="opl" style="grid-template-columns:26px 1fr auto">${icon(x.sp.glyph)}<div><b>${esc(x.sp.name)}</b> <span class="small muted">${esc(x.sp.local)}</span>${x.events.length ? `<div class="small accent strong">${esc(x.events.map((ev) => ev.title).join(' · '))}</div>` : ''}</div>
            <span class="tag">${x.season >= 0.85 ? 'best time of year' : x.season >= 0.6 ? 'good time' : x.season > 0.05 ? 'possible' : 'not now'}</span></div>`).join('')}</div></div>` : ''}

        <div class="sec"><div class="sec-head"><span class="eyebrow">Good to know</span></div><div class="rows">
          ${spot.access ? know('route', 'Getting there', spot.access) : ''}
          ${spot.night ? know(nIcon, nWord, spot.nightNote || (spot.night === 'free' ? 'Reachable at any hour.' : '')) : ''}
          ${spot.months ? know('calendar', 'Season', `Usually reachable ${monthName(spot.months[0])} to ${monthName(spot.months[1])}.`) : ''}
          ${spot.sky ? know('night', 'Night sky', `${skyLine(spot)}. Measured from NASA satellite night lights.`) : ''}
          ${aw ? know('autumn', 'Autumn colour', `Usually peaks around ${fmtD(aw.peak)} (${fmtD(aw.from)} to ${fmtD(aw.to)}; ${aw.source}).`) : ''}
          ${ice.likely ? know('ice', 'Ice', `${ice.why}. An estimate: check a webcam before you go.`) : ''}
          ${spot.note ? know('info', 'Your notes', spot.note) : ''}
        </div></div>

        <div class="sec"><div class="sec-head"><span class="eyebrow">Webcams nearby</span></div><div id="cams" class="rows"><div class="skeleton"></div></div></div>

        <p class="tiny faint mt24 tnum">${spot.lat.toFixed(5)}° N, ${spot.lon.toFixed(5)}° E · LV95 ${Math.round(e).toLocaleString('de-CH')} / ${Math.round(n).toLocaleString('de-CH')}<br>
          <a href="https://map.geo.admin.ch/?lang=en&E=${Math.round(e)}&N=${Math.round(n)}&zoom=9&crosshair=marker" target="_blank" rel="noopener">swisstopo map</a> · <a href="${seeingPage(spot)}" target="_blank" rel="noopener">meteoblue seeing</a></p>
        ${spot.mine ? `<div class="btns mt12"><button class="btn small quiet" data-act="horizon">Recompute horizon</button><button class="btn small quiet accent" data-act="delete">Delete spot</button></div>` : ''}
      </div>`;

    root.querySelectorAll('[data-ph]').forEach((b) => b.addEventListener('click', () => { photoIdx = +b.dataset.ph; render(root); }));
    root.querySelector('[data-act="fav"]').addEventListener('click', () => { const f = favourites(); f.has(id) ? f.delete(id) : f.add(id); setFavourites(f); render(root); App.emit('spots'); });
    root.querySelector('[data-act="sky"]').addEventListener('click', () => { closeSheet(); App.emit('show-sky', id); });
    root.querySelector('[data-act="3d"]').addEventListener('click', async () => { const m = await import('./terrain3d.js'); m.open3D(spotById(id)); });
    root.querySelectorAll('[data-act="wild"]').forEach((b) => b.addEventListener('click', () => { closeSheet(); App.emit('show-wild', id); }));
    root.querySelector('[data-act="edit"]')?.addEventListener('click', async () => { const m = await import('./spots.js'); m.editSpot(spot); });
    root.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${spot.name}"?`)) return;
      deleteMySpot(id); await kvDel(`hz:${spot.lat.toFixed(4)},${spot.lon.toFixed(4)}`);
      closeSheet(); await loadSpots(); toast('Spot deleted');
    });
    root.querySelector('[data-act="horizon"]')?.addEventListener('click', () => computeHorizon(spot, root, true));
    root.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => { planDay = +b.dataset.plan; const y = root.scrollTop; render(root); root.scrollTop = y; }));

    plan(root, spot, fc, ops, planDay, today);
    fillLive(spot, root);
    fillCams(spot, root);
    if (!hz) computeHorizon(spot, root, false);
  }
}

const know = (ic, title, text) => `<div class="opl" style="grid-template-columns:26px 1fr">${icon(ic)}<div><b>${esc(title)}</b>${text ? `<div class="small muted mt4">${esc(text)}</div>` : ''}</div></div>`;

// one day at the spot: its light over the real mountains, the key times, the weather hour by hour
function plan(root, spot, fc, ops, d0, today) {
  const el = root.querySelector('#plan'), noon = new Date(d0 + 12 * H), hz = spot.horizon;
  const ev = dayEvents(noon, spot), lb = lightBands(noon, spot, hz), ts = hz ? terrainSun(noon, spot, hz, ev) : null;
  const moon = moonAt(new Date(d0 + 22 * H), spot);
  const dayOps = ops.filter((o) => opDayOf(o) === d0);
  const marks = dayOps.map((o) => ({ t: o.peak.getTime(), icon: iconOf(o), score: o.score }));
  const direct = lb.direct.reduce((a, b) => a + (b.to - b.from), 0) / 60e3;
  const from = Math.floor(((ev.civilDawn || ev.sunrise || noon).getTime() - H) / H) * H, to = Math.ceil(((ev.civilDusk || ev.sunset || noon).getTime() + H) / H) * H;
  const times = []; for (let t = from; t <= to; t += H) times.push(t);
  const late = (a, b) => a && b && a - b > 5 * 60e3;
  el.innerHTML = `${lightRibbon(lb, { marks, now: d0 === today ? Date.now() : null })}
    ${lightLegend(hz ? '<span><i style="background:var(--sunc);height:4px;vertical-align:2px"></i>Sun on the spot</span>' : '')}
    <div class="facts mt12">
      <div><b class="num">${hhmm(ev.sunrise)}</b><span>Sunrise ${ev.sunriseAz != null ? compass(ev.sunriseAz) : ''}</span><small>blue hour from ${hhmm(ev.civilDawn)}</small></div>
      <div><b class="num">${ts && late(ts.rise, ev.sunrise) ? hhmm(ts.rise) : hhmm(ev.sunrise)}</b><span>Sun reaches the spot</span><small>${ts && late(ts.rise, ev.sunrise) ? `${Math.round((ts.rise - ev.sunrise) / 60e3)} min after sunrise` : hz ? 'open horizon' : 'horizon not computed'}</small></div>
      <div><b class="num">${hhmm(ev.goldenMorningEnd)}</b><span>Golden hour ends</span><small></small></div>
      <div><b class="num">${hhmm(ev.goldenEveningStart)}</b><span>Golden hour starts</span><small></small></div>
      <div><b class="num">${ts && late(ev.sunset, ts.set) ? hhmm(ts.set) : hhmm(ev.sunset)}</b><span>Sun leaves the spot</span><small>${ts && late(ev.sunset, ts.set) ? `${Math.round((ev.sunset - ts.set) / 60e3)} min before sunset` : ''}</small></div>
      <div><b class="num">${hhmm(ev.sunset)}</b><span>Sunset ${ev.sunsetAz != null ? compass(ev.sunsetAz) : ''}</span><small>blue hour to ${hhmm(ev.civilDusk)}</small></div>
      <div><div class="row gap6">${moonSvg(moon.phase, 22)}<b class="num">${Math.round(moon.illum * 100)}%</b></div><span>${esc(moon.name)}</span><small>${ev.moonrise ? `rises ${hhmm(ev.moonrise)} ${compass(ev.moonriseAz)}` : ''}</small></div>
      <div><b class="num">${ev.moonset ? hhmm(ev.moonset) : '–'}</b><span>Moonset ${ev.moonsetAz != null ? compass(ev.moonsetAz) : ''}</span><small></small></div>
      <div><b class="num">${hz ? `${Math.floor(direct / 60)} h ${String(Math.round(direct % 60)).padStart(2, '0')}` : '–'}</b><span>Direct sun</span><small>${hz ? 'on the spot' : ''}</small></div>
    </div>
    ${fc && times.some((t) => fc.t.includes(t)) ? `<div class="mt12">${hourTable(times, weatherRows(fc, { light: (t) => ({ dark: '·', twilight: 'dim', golden: 'gold', harsh: 'hard', good: 'good', soft: 'soft' }[lightAt(t, spot, fc).word]) }))}</div>
      <p class="tiny faint mt8">${fc.outlookFrom && times[0] >= fc.outlookFrom ? 'Outlook from the ECMWF model: gusts and sunshine are estimates, wind direction is missing.' : 'MeteoSwiss model for this exact point and altitude.'} Wind arrows point where the wind blows to.</p>` : '<div class="notice mt12">No forecast for this day yet.</div>'}`;
}

async function computeHorizon(spot, root, force) {
  const el = root.querySelector('#compass');
  try {
    const h = await horizonFor(spot, { force, onProgress: (p) => { if (el && el.isConnected) el.innerHTML = `<div class="notice">Mountain horizon from swisstopo… ${Math.round(p * 100)}%<div class="progress mt8"><i style="width:${Math.round(p * 100)}%"></i></div></div>`; } });
    spot.horizon = h;
    const st = spotById(spot.id); if (st) st.horizon = h;
    if (root.isConnected) rerenderSheet();
  } catch (e) {
    if (el && el.isConnected) el.innerHTML = `<div class="notice">Horizon not available (${esc(e.message)}).</div>`;
  }
}

async function fillLive(spot, root) {
  const el = root.querySelector('#live');
  const kinds = ['temp', 'wind', 'gust', 'rh', 'sun', 'fresh', 'snow', 'foehn'];
  const res = await Promise.allSettled(kinds.map((k) => live(k)));
  if (!el || !el.isConnected) return;
  let html = '';
  res.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value.length) return;
    const k = kinds[i];
    const near = r.value.map((s) => ({ ...s, d: distance(spot, s), dz: Math.abs((s.alt || 0) - (spot.elev || 0)) }))
      .filter((s) => s.d < 35000).sort((a, b) => (a.d / 1000 + a.dz / 120) - (b.d / 1000 + b.dz / 120))[0];
    if (!near) return;
    let v = `${(+near.value).toFixed(k === 'rh' || near.value >= 10 ? 0 : 1)}${LIVE[k].unit === '°C' ? '°' : LIVE[k].unit === '%' ? '%' : ` ${LIVE[k].unit}`}`;
    if (k === 'wind' && near.dir != null) v += ` ${compass(near.dir)}`;
    if (k === 'foehn') { if (+near.value === 0) return; v = +near.value === 2 ? 'Foehn' : 'Foehn mix'; }
    if (k === 'sun') v = `${Math.round(near.value)}/10 min`;
    if ((k === 'fresh' || k === 'snow') && +near.value === 0) return;
    html += `<div><b class="num">${esc(v)}</b><span>${esc(LIVE[k].label)}</span><small class="clip1">${esc(near.name)} · ${Math.round(near.alt)} m · ${fmtKm(near.d)}</small></div>`;
  });
  el.innerHTML = html || '<div style="grid-column:1/-1" class="small muted">No MeteoSwiss station within 35 km.</div>';
}

async function fillCams(spot, root) {
  const el = root.querySelector('#cams');
  try {
    const cams = (await webcams()).map((c) => ({ ...c, d: distance(spot, c) })).filter((c) => c.d < 45000).sort((a, b) => a.d - b.d).slice(0, 3);
    if (!el || !el.isConnected) return;
    el.innerHTML = cams.length ? cams.map((c) => `<a class="webcam" href="${esc(c.page)}" target="_blank" rel="noopener">${c.thumb ? `<img src="${esc(c.thumb)}" alt="" loading="lazy">` : '<img alt="">'}<div><b>${esc(c.name)}</b><div class="small muted">MeteoSwiss camera · <span class="peak tnum">${Math.round(c.alt)} m</span> · ${fmtKm(c.d)} ${compassWords(bearing(spot, c))}</div></div></a>`).join('')
      : '<div class="small muted" style="padding:10px 0">No MeteoSwiss webcam within 45 km.</div>';
  } catch { if (el && el.isConnected) el.innerHTML = '<div class="small muted" style="padding:10px 0">Webcams are not available offline.</div>'; }
}
