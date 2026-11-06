// One spot: the photo, what is coming up there, the five-day photo weather, today's light, the real
// horizon with the sun's path, live MeteoSwiss measurements and webcams nearby.
import { App, spotById, deleteMySpot, loadSpots, refresh, updateMySpot } from '../app.js';
import { TYPES, scoreClass, scoreWord, autumnWindow, iceLikely } from '../scoring.js';
import { dayEvents, hhmm, terrainSun, moonAt, TZ, zurichParts } from '../astro.js';
import { esc, photoUrl, commonsPage, credit, openSheet, closeSheet, sheetHead, whenText, toast, moonSvg, rerenderSheet } from '../ui.js';
import { favourites, setFavourites, kvDel } from '../store.js';
import { compass, compassWords, distance, fmtKm, wgsToLv95 } from '../geo.js';
import { live, webcams, LIVE } from '../sources/meteoswiss.js';
import { horizonFor } from '../sources/swisstopo.js';
import { seeingPage } from '../sources/meteoblue.js';
import { meteogram, panorama, sunPath } from './charts.js';
import { inSeason } from '../wildlife.js';
import { BORTLE_WORDS } from '../lightpollution.js';

const NIGHT_WORDS = { free: '🌙 Open at night', hike: '🥾 Night: on foot only', stay: '🛏️ Night: stay up there', closed: '⛔ Closed at night', reserve: '🛡️ Protected area at night' };
export function skyLine(spot) {
  if (!spot.sky) return '';
  const g = spot.sky.glow && spot.sky.glow.share > 0.2 && spot.sky.bortle >= 3 ? `, main light glow from ${spot.sky.glow.name} in the ${compassWords(spot.sky.glow.az)}` : '';
  return `${BORTLE_WORDS[spot.sky.bortle]} (Bortle ~${spot.sky.bortle})${g}${spot.lit ? '; artificial lights on site' : ''}`;
}

export const TAG_LABELS = {
  lake: 'Lake or pond', reflection: 'Mirror reflections', peaks: 'Mountain view', alpenglow: 'Alpenglow peaks', fogsea: 'Above the sea of fog',
  mist: 'Morning mist', lowland: 'Lowland / valley floor', larch: 'Larches', beech: 'Beech & deciduous', chestnut: 'Chestnut woods', vineyard: 'Vineyards',
  waterfall: 'Waterfall', river: 'River', glacier: 'Glacier', darksky: 'Dark sky', city: 'City lights', lightning: 'Storm viewpoint',
  frozen: 'Lake that freezes', snow: 'Snow scenes', hoarfrost: 'Hoarfrost', sunrise: 'Sunrise spot', sunset: 'Sunset spot', bluehour: 'Blue hour', castle: 'Castle', bridge: 'Bridge', railway: 'Railway', valley: 'Valley', cliff: 'Cliff',
};

export function openSpot(id) {
  const s = spotById(id);
  if (!s) return toast('Spot not found');
  let photoIdx = 0;
  openSheet((root) => render(root));

  function render(root) {
    const spot = spotById(id);
    if (!spot) { closeSheet(); return; }
    const fav = favourites();
    const ops = (App.opsBySpot.get(id) || []).filter((o) => o.score >= 40);
    const upcoming = [...ops].sort((a, b) => b.score - a.score).slice(0, 8).sort((a, b) => a.start - b.start);
    const ph = spot.photos?.[photoIdx] || spot.photos?.[0];
    const ev = dayEvents(new Date(), spot);
    const hz = spot.horizon;
    const tsun = hz ? terrainSun(new Date(), spot, hz, ev) : null;
    const moon = moonAt(new Date(), spot);
    const { e, n } = wgsToLv95(spot.lat, spot.lon);
    const aw = autumnWindow(spot, zurichParts(new Date()).y);
    const fc = App.fc.get(id);
    const ice = fc ? iceLikely(spot, fc, new Date()) : { likely: false };
    const dist = App.me ? fmtKm(distance(App.me, spot)) : null;
    const fmtD = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ });

    root.innerHTML = `${sheetHead(spot.mine ? 'Your spot' : 'Spot')}
      ${ph ? `<div class="photo"><img src="${esc(photoUrl(ph, 960))}" alt="${esc(spot.name)}" loading="eager">
        ${ph.file ? `<a class="credit" href="${commonsPage(ph)}" target="_blank" rel="noopener">${esc(credit(ph))}</a>` : ''}
        ${spot.photos.length > 1 ? `<div class="swap">${spot.photos.map((p, i) => `<button data-ph="${i}" aria-pressed="${i === photoIdx}" aria-label="${p.night ? 'Night photo' : 'Day photo'}"></button>`).join('')}</div>` : ''}
      </div>` : ''}
      <div class="spot-title"><h2>${esc(spot.name)}</h2>
        <div class="muted small">${esc(spot.region || '')}${spot.elev ? ` · ${Math.round(spot.elev)} m` : ''}${dist ? ` · ${dist} away` : ''}</div></div>
      <div class="pad">
        <div class="tags" style="margin:6px 0 12px">${(spot.tags || []).map((t) => `<span class="tag">${esc(TAG_LABELS[t] || t)}</span>`).join('')}</div>
        <div class="btns">
          <button class="btn small ${fav.has(id) ? 'primary' : ''}" data-act="fav">${fav.has(id) ? '★ Favourite' : '☆ Favourite'}</button>
          <a class="btn small" href="https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lon}" target="_blank" rel="noopener">Directions</a>
          <a class="btn small" href="https://map.geo.admin.ch/?lang=en&E=${Math.round(e)}&N=${Math.round(n)}&zoom=9&crosshair=marker" target="_blank" rel="noopener">swisstopo map</a>
          <button class="btn small" data-act="sky">🌌 Night sky</button>
          ${spot.species && spot.species.length ? '<button class="btn small" data-act="wild">🦌 Wildlife</button>' : ''}
          ${spot.mine ? '<button class="btn small" data-act="edit">Edit</button>' : ''}
        </div>
        ${spot.blurb ? `<p>${esc(spot.blurb)}</p>` : ''}
        ${spot.access ? `<p class="small muted"><b>Getting there:</b> ${esc(spot.access)}</p>` : ''}
        ${spot.months ? `<p class="small muted"><b>Season:</b> usually reachable ${monthName(spot.months[0])} to ${monthName(spot.months[1])}.</p>` : ''}
        ${spot.night ? `<p class="small muted"><b>${NIGHT_WORDS[spot.night] || ''}</b>${spot.nightNote ? `: ${esc(spot.nightNote)}` : ''}</p>` : ''}
        ${spot.sky ? `<p class="small muted"><b>Night sky:</b> ${esc(skyLine(spot))}. <span class="faint">Measured from NASA satellite night lights.</span></p>` : ''}
        <div class="btns" style="margin:10px 0"><button class="btn primary small" data-act="3d">⛰️ 3D view &amp; shadows</button></div>
        ${spot.note ? `<p class="small">${esc(spot.note)}</p>` : ''}

        <div class="section"><h3>Coming up here</h3>
          ${upcoming.length ? `<div class="oplist">${upcoming.map((o) => `<div class="opline"><div class="ic">${o.icon || TYPES[o.type].icon}</div>
            <div><div class="when">${esc(whenText(o))}</div><b>${esc(o.title)}</b><ul>${o.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>
            <span class="score ${scoreClass(o.score)}" title="${scoreWord(o.score)}">${o.score}</span></div>`).join('')}</div>`
            : `<div class="notice">${App.loading ? 'Loading the forecast…' : 'Nothing special in the next five days here.'}</div>`}
          ${aw ? `<p class="small muted">🍂 Autumn colour here usually peaks around <b>${fmtD(aw.peak)}</b> (${fmtD(aw.from)}–${fmtD(aw.to)}; ${esc(aw.source)}).</p>` : ''}
          ${ice.likely ? `<p class="small muted">🧊 ${esc(ice.why)}. An estimate: check a webcam before you go.</p>` : ''}
        </div>

        <div class="section"><h3>Five-day photo weather</h3>${meteogram(fc, spot, ops)}</div>

        <div class="section"><h3>Today's light</h3>
          <div class="kv">
            ${kv('Blue hour', ev.civilDawn && ev.blueMorningEnd ? `${hhmm(ev.civilDawn)}–${hhmm(ev.blueMorningEnd)}` : '–')}
            ${kv(`Sunrise ${ev.sunriseAz ? compass(ev.sunriseAz) : ''}`, hhmm(ev.sunrise))}
            ${tsun && tsun.rise && ev.sunrise && tsun.rise - ev.sunrise > 5 * 60e3 ? kv('Sun over the ridge', hhmm(tsun.rise)) : ''}
            ${kv('Golden hour', ev.goldenMorningEnd ? `until ${hhmm(ev.goldenMorningEnd)}` : '–')}
            ${kv('Golden hour', ev.goldenEveningStart ? `from ${hhmm(ev.goldenEveningStart)}` : '–')}
            ${tsun && tsun.set && ev.sunset && ev.sunset - tsun.set > 5 * 60e3 ? kv('Sun behind ridge', hhmm(tsun.set)) : ''}
            ${kv(`Sunset ${ev.sunsetAz ? compass(ev.sunsetAz) : ''}`, hhmm(ev.sunset))}
            ${kv('Blue hour', ev.blueEveningStart && ev.civilDusk ? `${hhmm(ev.blueEveningStart)}–${hhmm(ev.civilDusk)}` : '–')}
            <div><div class="row">${moonSvg(moon.phase, 26)}<div><b>${Math.round(moon.illum * 100)}%</b><span>${esc(moon.name)}</span></div></div></div>
            ${kv('Moonrise', ev.moonrise ? `${hhmm(ev.moonrise)} ${compass(ev.moonriseAz)}` : '–')}
            ${kv('Moonset', ev.moonset ? `${hhmm(ev.moonset)} ${compass(ev.moonsetAz)}` : '–')}
          </div>
        </div>

        <div class="section"><h3>The real horizon and today's sun</h3>
          <div id="pano">${hz ? panorama(spot, hz, new Date(), { centre: 180, paths: [{ pts: sunPath(spot, new Date()), color: '#ffcf5c' }], band: false, showCore: false, maxAlt: 60 }) : '<div class="notice">Working out the mountain horizon from swisstopo elevation data…</div>'}</div>
          <p class="tiny faint">Mountains from swisstopo elevation profiles out to 60 km (Swiss terrain only). Yellow: the sun's path today, with times.</p>
        </div>

        ${spot.species && spot.species.length ? `<div class="section"><h3>Wildlife here</h3><div class="oplist">${inSeason(spot, new Date()).map((x) => `<div class="opline"><div class="ic">${x.sp.icon}</div><div><b>${esc(x.sp.name)}</b> <span class="small muted">${x.season >= 0.85 ? 'best time of year' : x.season >= 0.6 ? 'good time' : x.season > 0.05 ? 'possible' : 'not now'}</span>${x.events.length ? `<div class="small" style="color:var(--gold2)">${esc(x.events.map((e) => e.title).join(' · '))}</div>` : ''}</div><span></span></div>`).join('')}</div>
          <button class="btn small" data-act="wild" style="margin-top:8px">Plan: activity, light & wind ›</button></div>` : ''}
        <div class="section"><h3>Live at MeteoSwiss stations nearby</h3><div id="live" class="kv"><div class="skeleton" style="height:52px"></div></div></div>
        <div class="section"><h3>Webcams nearby</h3><div id="cams" class="oplist"><div class="skeleton" style="height:70px"></div></div></div>

        <div class="section small muted">
          <a href="${seeingPage(spot)}" target="_blank" rel="noopener">meteoblue astronomy seeing for this place ↗</a><br>
          ${spot.lat.toFixed(5)}° N, ${spot.lon.toFixed(5)}° E · LV95 ${Math.round(e)} / ${Math.round(n)}
        </div>
        ${spot.mine ? '<div class="btns"><button class="btn small ghost" data-act="horizon">Recompute horizon</button><button class="btn small ghost" data-act="delete" style="color:#ff8f8f">Delete spot</button></div>' : ''}
      </div>`;

    root.querySelectorAll('[data-ph]').forEach((b) => b.addEventListener('click', () => { photoIdx = +b.dataset.ph; render(root); }));
    root.querySelector('[data-act="fav"]').addEventListener('click', () => {
      const f = favourites(); f.has(id) ? f.delete(id) : f.add(id); setFavourites(f); render(root); App.emit('spots');
    });
    root.querySelector('[data-act="sky"]').addEventListener('click', () => { closeSheet(); App.emit('show-sky', id); });
    root.querySelector('[data-act="3d"]')?.addEventListener('click', async () => { const m = await import('./terrain3d.js'); m.open3D(spotById(id)); });
    root.querySelectorAll('[data-act="wild"]').forEach((b) => b.addEventListener('click', () => { closeSheet(); App.emit('show-wild', id); }));
    root.querySelector('[data-act="edit"]')?.addEventListener('click', async () => { const m = await import('./spots.js'); m.editSpot(spot); });
    root.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
      if (!confirm(`Delete "${spot.name}"?`)) return;
      deleteMySpot(id); await kvDel(`hz:${spot.lat.toFixed(4)},${spot.lon.toFixed(4)}`);
      closeSheet(); await loadSpots(); toast('Spot deleted');
    });
    root.querySelector('[data-act="horizon"]')?.addEventListener('click', () => computeHorizon(spot, root, true));

    fillLive(spot, root);
    fillCams(spot, root);
    if (!hz) computeHorizon(spot, root, false);
  }
}

const kv = (label, v) => `<div><b>${esc(v)}</b><span>${esc(label)}</span></div>`;
const monthName = (m) => new Date(Date.UTC(2026, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long' });

async function computeHorizon(spot, root, force) {
  const el = root.querySelector('#pano');
  try {
    const h = await horizonFor(spot, { force, onProgress: (p) => { if (el && el.isConnected) el.innerHTML = `<div class="notice">Mountain horizon from swisstopo… ${Math.round(p * 100)}%<div class="progress"><i style="width:${Math.round(p * 100)}%"></i></div></div>`; } });
    spot.horizon = h;
    const st = spotById(spot.id); if (st) st.horizon = h;
    if (root.isConnected) rerenderSheet();
  } catch (e) {
    if (el && el.isConnected) el.innerHTML = `<div class="notice">Horizon not available (${esc(e.message)}).</div>`;
  }
}

async function fillLive(spot, root) {
  const el = root.querySelector('#live');
  const kinds = ['wind', 'rh', 'temp', 'sun', 'fresh', 'snow', 'foehn'];
  const res = await Promise.allSettled(kinds.map((k) => live(k)));
  if (!el.isConnected) return;
  let html = '';
  res.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value.length) return;
    const k = kinds[i];
    const near = r.value.map((s) => ({ ...s, d: distance(spot, s), dz: Math.abs((s.alt || 0) - (spot.elev || 0)) }))
      .filter((s) => s.d < 35000).sort((a, b) => (a.d / 1000 + a.dz / 120) - (b.d / 1000 + b.dz / 120))[0];
    if (!near) return;
    let v = `${(+near.value).toFixed(k === 'temp' || k === 'rh' ? 0 : near.value < 10 ? 1 : 0)} ${LIVE[k].unit}`;
    if (k === 'wind' && near.dir != null) v += ` ${compass(near.dir)}`;
    if (k === 'foehn') { if (+near.value === 0) return; v = +near.value === 2 ? 'Foehn' : 'Foehn mix'; }
    if (k === 'sun') v = `${Math.round(near.value)}/10 min`;
    if ((k === 'fresh' || k === 'snow') && +near.value === 0) return;
    html += `<div><b>${esc(v)}</b><span>${esc(LIVE[k].label)} · ${esc(near.name)} (${Math.round(near.alt)} m, ${fmtKm(near.d)})</span></div>`;
  });
  el.innerHTML = html || '<div class="notice" style="grid-column:1/-1">No MeteoSwiss station close enough.</div>';
}

async function fillCams(spot, root) {
  const el = root.querySelector('#cams');
  try {
    const cams = (await webcams()).map((c) => ({ ...c, d: distance(spot, c) })).filter((c) => c.d < 45000).sort((a, b) => a.d - b.d).slice(0, 3);
    if (!el.isConnected) return;
    el.innerHTML = cams.length ? cams.map((c) => `<a class="webcam" href="${esc(c.page)}" target="_blank" rel="noopener">${c.thumb ? `<img src="${esc(c.thumb)}" alt="" loading="lazy">` : '<img alt="">'}<div><b>${esc(c.name)}</b><div class="small muted">MeteoSwiss camera · ${Math.round(c.alt)} m · ${fmtKm(c.d)} ${compassWords(bearingTo(spot, c))}</div></div></a>`).join('')
      : '<div class="notice">No MeteoSwiss webcam within 45 km.</div>';
  } catch { if (el.isConnected) el.innerHTML = '<div class="notice">Webcams not available offline.</div>'; }
}
import { bearing as bearingTo } from '../geo.js';
