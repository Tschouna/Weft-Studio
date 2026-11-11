// The night at a spot: how dark and for how long, the moon, where the Milky Way stands over the real
// mountains, the planets, clouds hour by hour (MeteoSwiss) with meteoblue's seeing and jet stream,
// exposure times for sharp stars, a moon calendar, meteor showers and northern lights.
import { App, spotById } from '../app.js';
import { nightInfo, hhmm, localMidnight, fists, weekday, TZ, zurichParts, METEOR_SHOWERS, planetsTonight, starShutter } from '../astro.js';
import { astroForecast, at as mbAt, seeingWords, seeingPage, creditsUsed } from '../sources/meteoblue.js';
import { val, TYPES, iconOf } from '../scoring.js';
import { SHOOT } from '../brief.js';
import { icon } from '../icons.js';
import { esc, moonSvg, plate } from '../ui.js';
import { settings, getJSON, setJSON, favourites } from '../store.js';
import { compass, compassWords } from '../geo.js';
import { BORTLE_WORDS } from '../lightpollution.js';
import { panorama, dome, corePath, hourTable } from './charts.js';
import { openSettings } from './settings.js';
import { openSpot, skyLine } from './spot.js';

const H = 3600e3;
let spotId = getJSON('lb.skySpot', null);
let nightOffset = 0, view = 'pano', slider = null;
const mbCache = new Map();

export function showSkyFor(id) { spotId = id; setJSON('lb.skySpot', id); nightOffset = 0; slider = null; }
const dur = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;

export function renderSky(root) {
  if (!spotId || !spotById(spotId)) {
    const fav = favourites();
    spotId = (App.spots.find((s) => fav.has(s.id) && s.night !== 'closed') || App.spots.find((s) => s.sky && s.sky.bortle <= 3) || App.spots[0])?.id;
  }
  const spot = spotById(spotId);
  if (!spot) { root.innerHTML = '<div class="empty">No spots yet.</div>'; return; }
  const day = localMidnight(new Date(), nightOffset), noon = new Date(day.getTime() + 12 * H);
  const n = nightInfo(noon, spot, spot.horizon);
  const fc = App.fc.get(spot.id), st = settings(), mb = mbCache.get(spot.id);
  const ops = (App.opsBySpot.get(spot.id) || []).filter((o) => TYPES[o.type].group === 'night' && o.start >= n.sunset - H && o.start <= n.sunrise);
  const tStart = n.sunset.getTime(), tEnd = n.sunrise.getTime();
  if (slider == null || slider < tStart || slider > tEnd) slider = n.coreBest ? n.coreBest.t.getTime() : (n.darkStart ? n.darkStart.getTime() + H : tStart + 2 * H);

  let mw, mwSmall;
  if (!n.coreSeason) {
    const hidden = n.samples.some((s) => s.dark && s.coreAlt > 3);
    mw = hidden ? 'hidden' : 'out of season'; mwSmall = hidden ? 'behind the mountains tonight' : 'core up at night March to early October';
  } else if (!n.core.length) { mw = 'moonlit'; mwSmall = 'the moon washes it out'; }
  else { mw = `${hhmm(n.core[0].start)}–${hhmm(new Date(n.core[n.core.length - 1].end.getTime() + 10 * 60e3))}`; mwSmall = `best ${hhmm(n.coreBest.t)}, ${fists(n.coreBest.coreAlt).replace(' above the horizon', '')}, ${compassWords(n.coreBest.coreAz)}`; }
  const moonUp = n.samples.filter((s) => s.moonUp);
  const moonSmall = !moonUp.length ? 'below the horizon all night' : moonUp.length === n.samples.length ? 'up all night' : `up ${hhmm(moonUp[0].t)}–${hhmm(moonUp[moonUp.length - 1].t)}`;
  const nightCloud = fc ? (() => { const v = n.samples.filter((s) => s.dark).map((s) => val(fc, 'cloud', Math.round(s.t / H) * H)).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; })() : null;

  const nights = Array.from({ length: 14 }, (_, i) => localMidnight(new Date(), i));
  const rank = (s) => (s.night === 'closed' ? 20 : 0) + (s.sky ? s.sky.bortle : s.tags?.includes('darksky') ? 3 : 6);
  const options = [...App.spots].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const planets = planetsTonight(noon, spot);

  root.innerHTML = `<div class="wrap">
    <div class="pagehead"><div style="min-width:0"><div class="eyebrow">Night sky at</div>
      <select class="pick mt4" id="skyspot" aria-label="Spot">${options.map((s) => `<option value="${esc(s.id)}" ${s.id === spot.id ? 'selected' : ''}>${esc(s.name)}${s.sky ? ` · Bortle ${s.sky.bortle}` : ''}${s.night === 'closed' ? ' · closed at night' : ''}</option>`).join('')}</select></div>
      <button class="btn small quiet" id="skyopen">Spot ${icon('right', 12)}</button></div>
    <div class="chips">${nights.map((d, i) => `<button class="chip" data-night="${i}" aria-pressed="${i === nightOffset}">${i === 0 ? 'Tonight' : i === 1 ? 'Tomorrow' : `${weekday(d)} ${zurichParts(d).d}`}</button>`).join('')}</div>

    <h1 class="h1 num mt16" style="font-size:44px">${n.darkStart ? `${hhmm(n.darkStart)}–${hhmm(n.darkEnd)}` : 'No full darkness'}</h1>
    <p class="muted mt4">${n.darkStart ? `${dur((n.darkEnd - n.darkStart) / 60e3)} of full darkness (sun 18° below the horizon), ${dur(n.darkMoonlessMinutes)} of it without the moon.` : 'A short summer night: the sky never gets fully dark, only twilight.'}</p>
    ${spot.night === 'closed' ? `<div class="notice warn mt12"><b>Closed at night.</b> ${esc(spot.nightNote || '')}</div>` : spot.nightNote && ['hike', 'stay', 'reserve'].includes(spot.night) ? `<div class="notice mt12">${esc(spot.nightNote)}</div>` : ''}
    <div class="facts mt12 two">
      <div><div class="row gap6">${moonSvg(n.moon.phase, 24)}<b class="num">${Math.round(n.moon.illum * 100)}%</b></div><span>${esc(n.moon.name)}</span><small>${moonSmall}</small></div>
      <div><b class="num" style="${n.core.length ? '' : 'font-size:15px;font-stretch:90%'}">${mw}</b><span>Milky Way core</span><small>${mwSmall}</small></div>
      <div><b class="num">${spot.sky ? `Bortle ${spot.sky.bortle}` : '–'}</b><span>Sky darkness</span><small>${spot.sky ? esc(BORTLE_WORDS[spot.sky.bortle]) + (spot.sky.glow && spot.sky.glow.share > 0.2 && spot.sky.bortle >= 3 ? `, glow of ${esc(spot.sky.glow.name)} ${compass(spot.sky.glow.az)}` : '') : ''}</small></div>
      <div><b class="num">${nightCloud == null ? '–' : `${nightCloud}%`}</b><span>Cloud in the dark hours</span><small>${nightCloud == null ? 'beyond the forecast' : nightCloud < 20 ? 'clear' : nightCloud < 50 ? 'some cloud' : nightCloud < 80 ? 'mostly cloudy' : 'overcast'}</small></div>
    </div>

    <div class="sec"><div class="sec-head"><span class="eyebrow">Chances this night</span></div>
      ${ops.length ? `<div class="rows">${ops.slice(0, 4).map((o) => `<div class="opl">${icon(iconOf(o))}<div><b>${esc(o.title)}</b><ul>${o.why.slice(0, 4).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
          <details class="more"><summary>${icon('right', 12)}How to shoot it</summary><ul class="bul" style="color:var(--ink)">${(SHOOT[o.type] || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details></div>${plate(o.score)}</div>`).join('')}</div>`
        : `<p class="small muted">${fc && nightCloud != null ? 'No clear-sky chance in the forecast for this night.' : 'Beyond the forecast: astronomy only.'}</p>`}</div>

    <div class="sec"><div class="sec-head"><span class="eyebrow">Where to look</span>
        <div class="seg"><button data-view="pano" aria-pressed="${view === 'pano'}">Panorama</button><button data-view="dome" aria-pressed="${view === 'dome'}">Whole sky</button></div></div>
      <div id="skychart"></div>
      <div class="row sp mt8"><b class="num" id="skytime" style="font-size:22px"></b><span class="small muted" id="skycore"></span></div>
      <input type="range" id="skyslider" min="${tStart}" max="${tEnd}" step="${10 * 60e3}" value="${slider}" aria-label="Time of night">
      <p class="tiny faint mt8">The pale band is the Milky Way, the warm glow its core, the dashed line the core's path through the night. A fist at arm's length covers about 10°. Black: the real mountains${spot.horizon ? '' : ' (not computed yet: open the spot once while online)'}.</p>
    </div>

    <div class="sec"><div class="sec-head"><span class="eyebrow">Planets</span></div>
      ${planets.length ? `<div class="rows">${planets.map((p) => `<div class="opl" style="grid-template-columns:26px 1fr auto">${icon('planet')}<div><b>${p.name}</b><div class="small muted">Visible ${hhmm(p.from)}–${hhmm(p.to)} · highest ${hhmm(p.best.t)}, ${Math.round(p.best.alt)}° in the ${compassWords(p.best.az)}</div></div><span class="tag" title="Brightness: the lower, the brighter">mag ${p.mag.toFixed(1)}</span></div>`).join('')}</div>` : '<p class="small muted">No bright planet well placed tonight.</p>'}</div>

    <div class="sec"><div class="sec-head"><span class="eyebrow">Hour by hour</span></div><div id="hours"></div><div id="mbnote" class="small muted mt8"></div></div>

    <div class="sec"><div class="sec-head"><span class="eyebrow">Sharp stars: longest shutter</span></div>
      <div class="scroll-x"><table class="hours"><tr><th class="rh">Lens</th>${[14, 20, 24, 35, 50].map((f) => `<th>${f} mm</th>`).join('')}</tr>
        <tr><th class="rh">Full frame</th>${[14, 20, 24, 35, 50].map((f) => `<td>${starShutter(f).ok} s</td>`).join('')}</tr>
        <tr><th class="rh">APS-C</th>${[14, 20, 24, 35, 50].map((f) => `<td>${starShutter(f, 1.5).ok} s</td>`).join('')}</tr>
        <tr><th class="rh">Large prints</th>${[14, 20, 24, 35, 50].map((f) => `<td>${starShutter(f).sharp} s</td>`).join('')}</tr></table></div>
      <p class="tiny faint mt8">The 500 rule (500 ÷ focal length); for large prints or high-resolution sensors use the stricter last row.</p></div>

    <div class="sec"><div class="sec-head"><span class="eyebrow">Moon calendar</span><span class="tiny faint">red bar: Milky Way night</span></div>
      <div class="cal" id="cal"></div>
      <p class="tiny faint mt8">Marked nights: the Milky Way core is up in full darkness without moonlight for at least an hour at ${esc(spot.name)}.</p></div>

    <div class="sec"><div class="sec-head"><span class="eyebrow">Meteor showers</span></div><div class="rows">${upcomingShowers().map((s) => `<div class="opl" style="grid-template-columns:26px 1fr auto">${icon('meteors')}<div><b>${esc(s.name)}</b><div class="small muted">Up to about ${s.zhr} an hour under a perfect sky. ${esc(s.note)}</div></div><span class="tag tnum">${s.peak.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: TZ })}</span></div>`).join('')}</div></div>

    <div class="sec"><div class="sec-head"><span class="eyebrow">Northern lights</span></div><div id="aurora" class="small"></div></div>
    <p class="tiny faint mt24">Astronomy computed on your phone (Astronomy Engine). Night clouds: MeteoSwiss ICON-CH; seeing, jet stream and cloud layers: meteoblue. Sky darkness: ${esc(skyLine(spot) || 'not measured')}. <a href="${seeingPage(spot)}" target="_blank" rel="noopener">meteoblue seeing page</a></p>
  </div>`;

  root.querySelector('#skyspot').addEventListener('change', (e) => { showSkyFor(e.target.value); renderSky(root); });
  root.querySelector('#skyopen').addEventListener('click', () => openSpot(spot.id));
  root.querySelectorAll('[data-night]').forEach((b) => b.addEventListener('click', () => { nightOffset = +b.dataset.night; slider = null; renderSky(root); }));
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view; root.querySelectorAll('[data-view]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.view === view)); drawChart(); }));
  const sl = root.querySelector('#skyslider');
  sl.addEventListener('input', () => { slider = +sl.value; drawChart(); });

  function drawChart() {
    const t = new Date(slider), el = root.querySelector('#skychart');
    if (view === 'pano') {
      const from = Math.ceil((n.darkStart ? n.darkStart.getTime() : tStart) / H) * H, to = n.darkEnd ? n.darkEnd.getTime() : tEnd;
      const centre = n.coreBest ? Math.round(n.coreBest.coreAz / 5) * 5 : 180;
      el.innerHTML = panorama(spot, spot.horizon, t, { centre, maxAlt: 60, paths: n.coreSeason ? [{ pts: corePath(spot, from, to, 30), color: '#ffd27a', dash: true }] : [] });
    } else el.innerHTML = dome(spot, spot.horizon, t, { size: Math.min(380, root.clientWidth - 32) });
    root.querySelector('#skytime').textContent = hhmm(t);
    const s = n.samples.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), n.samples[0]);
    root.querySelector('#skycore').textContent = s ? (s.coreAlt > 0 ? `core ${Math.round(s.coreAlt)}° ${compassWords(s.coreAz)}` : 'core below the horizon') + (s.sunAlt > -18 ? ' · twilight' : '') : '';
  }
  drawChart();
  drawHours(root, n, fc, mb);
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
    drawHours(root, n, fc, mb);
    mbNote(root, mb);
  } catch (e) {
    note.innerHTML = `meteoblue: ${esc(e.message)}. <a href="#" data-mbset>Check the key in Settings</a>.`;
    note.querySelector('[data-mbset]')?.addEventListener('click', (ev) => { ev.preventDefault(); openSettings(); });
  }
}

function mbNote(root, mb) {
  const note = root.querySelector('#mbnote');
  if (!note) return;
  if (!settings().meteoblueKey) {
    note.innerHTML = 'Add your free meteoblue API key for meteoblue\'s night clouds, visibility and fog, and (with the Seeing package) seeing and jet stream. <a href="#" data-mbset>Settings</a>';
    note.querySelector('[data-mbset]').addEventListener('click', (e) => { e.preventDefault(); openSettings(); });
    return;
  }
  if (!mb) return;
  const c = creditsUsed();
  note.innerHTML = mb.tier === 'seeing' ? `meteoblue Seeing package: seeing, jet stream and bad layers, read ${new Date(mb.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`
    : `meteoblue free key: cloud layers, visibility and fog every 3 hours. Seeing and jet stream need meteoblue's Seeing package. About ${Math.round(c.credits / 1000)}k of 10 000k credits used.`;
}

function drawHours(root, n, fc, mb) {
  const el = root.querySelector('#hours');
  if (!el) return;
  const hours = [];
  for (let t = Math.ceil(n.sunset.getTime() / H) * H; t <= n.sunrise.getTime(); t += H) hours.push(t);
  const sample = (t) => n.samples.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a), n.samples[0]);
  const cloud = (get) => (t) => { const v = get(t); return v == null ? '' : { text: Math.round(v), bg: `rgba(var(--cloud), ${(0.05 + 0.5 * v / 100).toFixed(2)})` }; };
  const rows = [
    { label: 'Sky', cell: (t) => { const s = sample(t); return { text: s.sunAlt <= -18 ? 'dark' : s.sunAlt <= -12 ? 'astro' : 'dusk', bg: s.sunAlt <= -18 ? 'var(--sky-night)' : s.sunAlt <= -12 ? 'var(--sky-astro)' : 'var(--sky-naut)', color: '#fff' }; } },
    { label: 'Moon', cell: (t) => { const s = sample(t); return s.moonAlt > 0 ? `${Math.round(s.moonAlt)}°` : ''; } },
    { label: 'Core', cell: (t) => { const s = sample(t); return s.coreAlt > 0 ? { text: `${Math.round(s.coreAlt)}°`, color: s.coreClear > 3 ? 'var(--ink)' : 'var(--ink3)', title: s.coreClear > 3 ? 'above the mountains' : 'behind the mountains' } : ''; } },
  ];
  if (fc) rows.push({ label: 'Cloud %', sep: true, cell: cloud((t) => val(fc, 'cloud', t)) }, { label: '· low', cell: cloud((t) => val(fc, 'low', t)) }, { label: '· high', cell: cloud((t) => val(fc, 'high', t)) },
    { label: 'Humidity', cell: (t) => { const v = val(fc, 'rh', t); return v == null ? '' : { text: Math.round(v), color: v > 92 ? 'var(--accent)' : '' }; } },
    { label: '°C', cell: (t) => { const v = val(fc, 'temp', t); return v == null ? '' : Math.round(v); } },
    { label: 'Wind', cell: (t) => { const v = val(fc, 'wind', t); return v == null ? '' : Math.round(v); } });
  if (mb) {
    rows.push({ label: 'mb cloud', sep: true, cell: cloud((t) => mbAt(mb, 'total', t)) });
    if (mb.fog && mb.fog.length) rows.push({ label: 'mb fog %', cell: (t) => { const v = mbAt(mb, 'fog', t); return v == null ? '' : Math.round(v); } });
    if (mb.seeing) rows.push(
      { label: 'Seeing ″', cell: (t) => { const v = mbAt(mb, 'seeing', t); return v == null ? '' : { text: v.toFixed(1), title: seeingWords(v), color: v < 1.2 ? '' : v < 1.8 ? 'var(--ink2)' : 'var(--accent)' }; } },
      { label: 'Jet m/s', cell: (t) => { const v = mbAt(mb, 'jet', t); return v == null ? '' : { text: Math.round(v), color: v < 35 ? '' : 'var(--accent)' }; } },
      { label: 'Index 1/2', cell: (t) => { const a = mbAt(mb, 'seeing1', t), b = mbAt(mb, 'seeing2', t); return a == null ? '' : `${a}/${b}`; } });
  }
  el.innerHTML = `${hourTable(hours, rows)}<div class="legend"><span>Cloud from MeteoSwiss${mb ? ', "mb" rows from meteoblue' : ''}. Humidity above 92% in red: dew on the lens.</span>${mb && mb.seeing ? '<span>Seeing under 1.2″ is good; jet stream under 20 m/s means steady air.</span>' : ''}</div>`;
}

function drawCalendar(root, spot) {
  const el = root.querySelector('#cal'), today = localMidnight(new Date());
  let html = '';
  for (let i = 0; i < 35; i++) {
    const d = localMidnight(today, i), n = nightInfo(new Date(d.getTime() + 12 * H), spot, spot.horizon);
    html += `<div class="${i === 0 ? 'today' : ''} ${n.coreMinutes >= 60 ? 'mw' : ''}" title="${esc(n.moon.name)}">${weekday(d).slice(0, 2)} ${zurichParts(d).d}${moonSvg(n.moon.phase, 22)}${Math.round(n.moon.illum * 100)}%</div>`;
  }
  el.innerHTML = html;
}

function drawAurora(root) {
  const el = root.querySelector('#aurora');
  if (!App.kp || !App.kp.length) { el.innerHTML = '<span class="muted">Space-weather forecast not loaded.</span>'; return; }
  const next = App.kp.filter((k) => k.t >= Date.now() - 3 * H);
  const max = next.reduce((a, b) => (b.kp > a.kp ? b : a), next[0] || { kp: 0, t: Date.now() });
  const word = max.kp >= 8 ? 'a severe storm: northern lights possible from Switzerland' : max.kp >= 7 ? 'a strong storm: a faint glow low in the north is possible for cameras' : max.kp >= 5 ? 'a minor storm: too weak for Switzerland' : 'quiet';
  el.innerHTML = `<div class="row" style="align-items:flex-start;gap:12px"><span class="plate num big ${max.kp >= 7 ? 's5' : max.kp >= 5 ? 's3' : 's1'}">Kp ${max.kp.toFixed(0)}</span><span class="muted">Highest in NOAA's three-day forecast (${weekday(new Date(max.t))} ${hhmm(new Date(max.t))}): ${word}. Switzerland needs about Kp 7.</span></div>`;
}
