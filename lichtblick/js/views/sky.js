// The night sky at a spot: darkness, the moon, where the Milky Way stands over the real mountains,
// hour by hour clouds (MeteoSwiss) with meteoblue's seeing, jet stream and cloud layers, a moon calendar
// with the Milky Way nights marked, meteor showers and northern-lights alerts.
import { App, spotById } from '../app.js';
import { nightInfo, hhmm, localMidnight, moonQuarters, meteorShowersNear, fists, weekday, TZ, zurichParts, METEOR_SHOWERS } from '../astro.js';
import { astroForecast, at as mbAt, seeingWords, seeingPage, creditsUsed } from '../sources/meteoblue.js';
import { val, scoreClass, TYPES } from '../scoring.js';
import { esc, moonSvg, toast } from '../ui.js';
import { settings, getJSON, setJSON, favourites } from '../store.js';
import { compassWords } from '../geo.js';
import { panorama, dome, corePath } from './charts.js';
import { openSettings } from './settings.js';
import { openSpot } from './spot.js';

const H = 3600e3;
let spotId = getJSON('lb.skySpot', null);
let nightOffset = 0;
let view = 'pano';
let slider = null;
let mbCache = new Map();

export function showSkyFor(id) { spotId = id; setJSON('lb.skySpot', id); nightOffset = 0; slider = null; }

export function renderSky(root) {
  if (!spotId || !spotById(spotId)) {
    const fav = favourites();
    spotId = (App.spots.find((s) => fav.has(s.id)) || App.spots.find((s) => s.tags?.includes('darksky')) || App.spots[0])?.id;
  }
  const spot = spotById(spotId);
  if (!spot) { root.innerHTML = '<div class="empty">No spots yet.</div>'; return; }
  const day = localMidnight(new Date(), nightOffset);
  const n = nightInfo(new Date(day.getTime() + 12 * H), spot, spot.horizon);
  const fc = App.fc.get(spot.id);
  const st = settings();
  const ops = (App.opsBySpot.get(spot.id) || []).filter((o) => TYPES[o.type].group === 'night' && o.start >= n.sunset - H && o.start <= n.sunrise);
  const tStart = n.sunset.getTime(), tEnd = n.sunrise.getTime();
  if (slider == null || slider < tStart || slider > tEnd) slider = n.coreBest ? n.coreBest.t.getTime() : (n.darkStart ? n.darkStart.getTime() + H : tStart + 2 * H);
  const mb = mbCache.get(spot.id);

  // the Milky Way line in words
  let mwLine;
  if (!n.coreSeason) {
    const anyCore = n.samples.some((s) => s.dark && s.coreAlt > 3);
    mwLine = anyCore ? 'The core of the Milky Way stays behind the mountains here tonight.' : 'Not Milky Way core season: the core is only up at night from about March to early October.';
  } else if (!n.core.length) mwLine = 'The core is up in darkness, but the moon washes it out tonight.';
  else {
    const b = n.coreBest;
    mwLine = `Core visible <b>${hhmm(n.core[0].start)}–${hhmm(new Date(n.core[n.core.length - 1].end.getTime() + 10 * 60e3))}</b>. Best at <b>${hhmm(b.t)}</b>: ${fists(b.coreAlt)} in the ${compassWords(b.coreAz)} (${Math.round(b.coreAlt)}°).`;
  }
  const moonTimes = n.samples.filter((s) => s.moonUp);
  const moonLine = !moonTimes.length ? 'The moon stays below the horizon all night.'
    : moonTimes.length === n.samples.length ? `Up all night, ${Math.round(n.moon.illum * 100)}% lit.`
      : `Up ${hhmm(moonTimes[0].t)}–${hhmm(moonTimes[moonTimes.length - 1].t)}, ${Math.round(n.moon.illum * 100)}% lit.`;

  const nights = Array.from({ length: 14 }, (_, i) => localMidnight(new Date(), i));
  const options = [...App.spots].sort((a, b) => (b.tags?.includes('darksky') ? 1 : 0) - (a.tags?.includes('darksky') ? 1 : 0) || a.name.localeCompare(b.name));

  root.innerHTML = `<div class="wrap">
    <div class="row sp" style="margin-bottom:10px;gap:8px">
      <select class="spotpick" id="skyspot" aria-label="Spot">${options.map((s) => `<option value="${esc(s.id)}" ${s.id === spot.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <button class="btn small ghost" id="skyopen">Spot ›</button>
    </div>
    <div class="chips">${nights.map((d, i) => `<button class="chip" data-night="${i}" aria-pressed="${i === nightOffset}">${i === 0 ? 'Tonight' : i === 1 ? 'Tomorrow' : `${weekday(d)} ${zurichParts(d).d}`}</button>`).join('')}</div>

    <div class="sky-card">
      <div class="row" style="gap:12px">${moonSvg(n.moon.phase, 46)}
        <div><div class="bigline">${n.darkStart ? `${hhmm(n.darkStart)} – ${hhmm(n.darkEnd)}` : 'No full darkness'}</div>
        <div class="small muted">${n.darkStart ? 'astronomical night (sun 18° below the horizon)' : 'Short summer night: twilight all night'}</div></div></div>
      <p style="margin:12px 0 4px">🌙 ${esc(n.moon.name)}. ${moonLine}</p>
      <p style="margin:4px 0">🌌 ${mwLine}</p>
      ${ops.length ? `<div class="oplist" style="margin-top:10px">${ops.slice(0, 3).map((o) => `<div class="opline"><div class="ic">${TYPES[o.type].icon}</div><div><b>${esc(o.title)}</b><ul>${o.why.slice(0, 3).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div><span class="score ${scoreClass(o.score)}">${o.score}</span></div>`).join('')}</div>`
        : `<p class="small muted" style="margin:8px 0 0">${fc ? 'No clear-sky chance in the MeteoSwiss forecast for this night.' : 'Forecast beyond five days: astronomy only.'}</p>`}
    </div>

    <div class="section">
      <div class="row sp"><h3>Where to look</h3>
        <div class="segbar"><button data-view="pano" aria-pressed="${view === 'pano'}">Panorama</button><button data-view="dome" aria-pressed="${view === 'dome'}">Whole sky</button></div></div>
      <div id="skychart" style="margin-top:8px"></div>
      <div class="row sp" style="margin-top:6px"><b id="skytime"></b><span class="small muted" id="skycore"></span></div>
      <input type="range" id="skyslider" min="${tStart}" max="${tEnd}" step="${10 * 60e3}" value="${slider}" style="width:100%;accent-color:var(--gold)" aria-label="Time of night">
      <p class="tiny faint">The glow is the Milky Way, the gold ball its bright core, the dashed line the core's path through the night. A fist at arm's length covers about 10°. Black: the real mountains${spot.horizon ? '' : ' (not computed yet: open the spot once online)'}.</p>
    </div>

    <div class="section"><h3>Hour by hour</h3><div id="hours"></div>
      <div id="mbnote" class="small muted" style="margin-top:6px"></div></div>

    <div class="section"><h3>Moon calendar</h3>
      <p class="small muted" style="margin:0 0 8px">Violet outline: the Milky Way core is up in darkness without moonlight for at least an hour at ${esc(spot.name)}.</p>
      <div class="cal" id="cal"></div></div>

    <div class="section"><h3>Meteor showers</h3><div class="oplist">${upcomingShowers().map((s) => `<div class="opline"><div class="ic">🌠</div><div><b>${esc(s.name)}</b> <span class="when">peak ${s.peak.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ })}</span><ul><li>Up to ~${s.zhr} per hour under a perfect sky</li><li>${esc(s.note)}</li></ul></div><span></span></div>`).join('')}</div></div>

    <div class="section"><h3>Northern lights</h3><div id="aurora" class="small"></div></div>
    <p class="tiny faint">Astronomy computed on your phone (Astronomy Engine). Night clouds: MeteoSwiss ICON-CH; seeing, jet stream and cloud layers: meteoblue. <a href="${seeingPage(spot)}" target="_blank" rel="noopener">meteoblue seeing page ↗</a></p>
  </div>`;

  root.querySelector('#skyspot').addEventListener('change', (e) => { showSkyFor(e.target.value); renderSky(root); });
  root.querySelector('#skyopen').addEventListener('click', () => openSpot(spot.id));
  root.querySelectorAll('[data-night]').forEach((b) => b.addEventListener('click', () => { nightOffset = +b.dataset.night; slider = null; renderSky(root); }));
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view; root.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.view === view)); drawChart(); }));
  const sl = root.querySelector('#skyslider');
  sl.addEventListener('input', () => { slider = +sl.value; drawChart(); });

  function drawChart() {
    const t = new Date(slider);
    const el = root.querySelector('#skychart');
    if (view === 'pano') {
      const from = Math.ceil((n.darkStart ? n.darkStart.getTime() : tStart) / H) * H, to = n.darkEnd ? n.darkEnd.getTime() : tEnd;
      const centre = n.coreBest ? Math.round(n.coreBest.coreAz / 5) * 5 : 180;
      el.innerHTML = panorama(spot, spot.horizon, t, { centre, maxAlt: 60, paths: n.coreSeason ? [{ pts: corePath(spot, from, to, 30), color: '#ffd27a', dash: true }] : [] });
    } else el.innerHTML = dome(spot, spot.horizon, t, { size: Math.min(380, root.clientWidth - 40) });
    root.querySelector('#skytime').textContent = `${hhmm(t)}`;
    const s = n.samples.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), n.samples[0]);
    root.querySelector('#skycore').textContent = s ? (s.coreAlt > 0 ? `core ${Math.round(s.coreAlt)}° ${compassWords(s.coreAz)}` : 'core below the horizon') + (s.sunAlt > -18 ? ' · twilight' : '') : '';
  }
  drawChart();
  drawHours(root, spot, n, fc, mb);
  drawCalendar(root, spot);
  drawAurora(root);
  if (st.meteoblueKey && !mb) loadMeteoblue(root, spot, n, fc);
  else mbNote(root, mb);
}

function upcomingShowers() {
  const now = new Date(), y = zurichParts(now).y, out = [];
  for (const s of METEOR_SHOWERS) for (const yy of [y, y + 1]) {
    const peak = new Date(Date.UTC(yy, s.m - 1, s.d, 12));
    if (peak.getTime() > now.getTime() - (s.span + 1) * 864e5) out.push({ ...s, peak });
  }
  return out.sort((a, b) => a.peak - b.peak).slice(0, 4);
}

async function loadMeteoblue(root, spot, n, fc) {
  const note = root.querySelector('#mbnote');
  note.textContent = 'Asking meteoblue…';
  try {
    const mb = await astroForecast(spot);
    mbCache.set(spot.id, mb);
    if (!root.isConnected) return;
    drawHours(root, spot, n, fc, mb);
    mbNote(root, mb);
  } catch (e) {
    note.innerHTML = `meteoblue: ${esc(e.message)}. <a href="#" data-mbset>Check the key in Settings</a>.`;
    note.querySelector('[data-mbset]')?.addEventListener('click', (ev) => { ev.preventDefault(); openSettings(); });
  }
}

function mbNote(root, mb) {
  const note = root.querySelector('#mbnote');
  if (!note) return;
  const st = settings();
  if (!st.meteoblueKey) {
    note.innerHTML = 'Add your free meteoblue API key for meteoblue\'s night clouds, visibility and fog, and (with the Seeing package) seeing and jet stream. <a href="#" data-mbset>Settings</a>';
    note.querySelector('[data-mbset]').addEventListener('click', (e) => { e.preventDefault(); openSettings(); });
    return;
  }
  if (!mb) return;
  const c = creditsUsed();
  note.innerHTML = mb.tier === 'seeing' ? `meteoblue Seeing package: seeing, jet stream and bad layers, updated ${new Date(mb.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`
    : `meteoblue free key: cloud layers, visibility and fog every 3 hours. Seeing and jet stream need meteoblue's Seeing package. About ${Math.round(c.credits / 1000)}k of 10 000k credits used.`;
}

function drawHours(root, spot, n, fc, mb) {
  const el = root.querySelector('#hours');
  const hours = [];
  for (let t = Math.ceil(n.sunset.getTime() / H) * H; t <= n.sunrise.getTime(); t += H) hours.push(t);
  const cell = (v, max, col, txt) => `<td style="background:${v == null ? 'transparent' : col.replace('A', (0.12 + 0.8 * Math.min(1, v / max)).toFixed(2))}">${txt ?? ''}</td>`;
  const sample = (t) => n.samples.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), n.samples[0]);
  const rows = [
    ['', hours.map((t) => `<th>${hhmm(new Date(t)).slice(0, 2)}</th>`).join('')],
    ['Dark', hours.map((t) => { const s = sample(t); return `<td style="background:${s.sunAlt <= -18 ? '#0a0f1e' : s.sunAlt <= -12 ? '#1d2550' : '#3b3c6e'}">${s.sunAlt <= -18 ? '●' : ''}</td>`; }).join('')],
    ['Moon', hours.map((t) => { const s = sample(t); return `<td style="color:#f4ecd2">${s.moonAlt > 0 ? Math.round(s.moonAlt) + '°' : ''}</td>`; }).join('')],
    ['Core', hours.map((t) => { const s = sample(t); return `<td style="color:#ffd27a">${s.coreAlt > 0 ? Math.round(s.coreAlt) + '°' : ''}</td>`; }).join('')],
  ];
  if (fc) {
    rows.push(['Clouds', hours.map((t) => { const v = val(fc, 'cloud', t); return cell(v, 100, 'rgba(200,212,238,A)', v == null ? '' : Math.round(v)); }).join('')]);
    rows.push(['· low', hours.map((t) => { const v = val(fc, 'low', t); return cell(v, 100, 'rgba(200,212,238,A)', v == null ? '' : Math.round(v)); }).join('')]);
    rows.push(['· high', hours.map((t) => { const v = val(fc, 'high', t); return cell(v, 100, 'rgba(200,212,238,A)', v == null ? '' : Math.round(v)); }).join('')]);
    rows.push(['Humid.', hours.map((t) => { const v = val(fc, 'rh', t); return `<td>${v == null ? '' : Math.round(v)}</td>`; }).join('')]);
  }
  if (mb) {
    rows.push(['mb clouds', hours.map((t) => { const v = mbAt(mb, 'total', t); return cell(v, 100, 'rgba(166,140,255,A)', v == null ? '' : Math.round(v)); }).join('')]);
    if (mb.fog && mb.fog.length) rows.push(['mb fog %', hours.map((t) => { const v = mbAt(mb, 'fog', t); return `<td>${v == null ? '' : Math.round(v)}</td>`; }).join('')]);
    if (mb.seeing) {
      rows.push(['Seeing ″', hours.map((t) => { const v = mbAt(mb, 'seeing', t); return `<td title="${seeingWords(v)}" style="color:${v == null ? '' : v < 1.2 ? '#6fdc8c' : v < 1.8 ? '#ffd27a' : '#ff8f8f'}">${v == null ? '' : v.toFixed(1)}</td>`; }).join('')]);
      rows.push(['Jet m/s', hours.map((t) => { const v = mbAt(mb, 'jet', t); return `<td style="color:${v == null ? '' : v < 20 ? '#6fdc8c' : v < 35 ? '#ffd27a' : '#ff8f8f'}">${v == null ? '' : Math.round(v)}</td>`; }).join('')]);
      rows.push(['Index 1/2', hours.map((t) => { const a = mbAt(mb, 'seeing1', t), b = mbAt(mb, 'seeing2', t); return `<td>${a == null ? '' : `${a}/${b}`}</td>`; }).join('')]);
    }
  }
  el.innerHTML = `<div class="scroll-x"><table class="hours">${rows.map(([h, r]) => `<tr><th class="rh">${h}</th>${r}</tr>`).join('')}</table></div>
    <div class="legend"><span>Clouds in % (MeteoSwiss${mb ? '; violet: meteoblue' : ''})</span>${mb && mb.seeing ? '<span>Seeing: smaller is sharper (&lt;1.2″ good)</span><span>Jet stream: under 20 m/s steady air</span>' : ''}</div>`;
}

function drawCalendar(root, spot) {
  const el = root.querySelector('#cal');
  const today = localMidnight(new Date());
  let html = '';
  for (let i = 0; i < 35; i++) {
    const d = localMidnight(today, i);
    const n = nightInfo(new Date(d.getTime() + 12 * H), spot, spot.horizon);
    const mw = n.coreMinutes >= 60;
    html += `<div class="${i === 0 ? 'today' : ''} ${mw ? 'mw' : ''}" title="${esc(n.moon.name)}">${weekday(d).slice(0, 2)} ${zurichParts(d).d}${moonSvg(n.moon.phase, 22)}${Math.round(n.moon.illum * 100)}%</div>`;
  }
  el.innerHTML = html;
}

function drawAurora(root) {
  const el = root.querySelector('#aurora');
  if (!App.kp || !App.kp.length) { el.innerHTML = '<span class="muted">Space-weather forecast not loaded.</span>'; return; }
  const next = App.kp.filter((k) => k.t >= Date.now() - 3 * H);
  const max = next.reduce((a, b) => (b.kp > a.kp ? b : a), next[0] || { kp: 0 });
  const word = max.kp >= 8 ? 'a severe storm: northern lights possible from Switzerland' : max.kp >= 7 ? 'a strong storm: a faint glow low in the north is possible for cameras' : max.kp >= 5 ? 'a minor storm: too weak for Switzerland' : 'quiet';
  el.innerHTML = `Highest Kp in the NOAA 3-day forecast: <b>${max.kp.toFixed(1)}</b> (${hhmm(new Date(max.t))}, ${weekday(new Date(max.t))}): ${word}. Switzerland needs about Kp 7 or more.`;
}

const style = document.createElement('style');
style.textContent = `.hours{border-collapse:separate;border-spacing:2px;font-size:11.5px;min-width:100%}.hours th{color:var(--muted);font-weight:600;padding:2px 3px}.hours th.rh{text-align:left;white-space:nowrap;position:sticky;left:0;background:var(--bg);padding-right:6px}.hours td{text-align:center;min-width:26px;height:22px;border-radius:5px;background:var(--card);color:var(--text)}`;
document.head.appendChild(style);
