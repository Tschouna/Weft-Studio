// Home: pick a day, see its light and its chances. Ten days of forecast (five from MeteoSwiss, then
// an outlook), and for any later date the almanac: sun, moon, Milky Way and what is in season.
import { App, opsOn, opDay, spotById, fogPoints } from '../app.js';
import { TYPES, iconOf, scoreClass } from '../scoring.js';
import { lightBands, almanac, regionWeather, briefing, DAY_START } from '../brief.js';
import { localMidnight, hhmm, zurichParts, weekday, TZ, fists } from '../astro.js';
import { icon } from '../icons.js';
import { esc, photoUrl, plate, relDay, ago, moonSvg, credit } from '../ui.js';
import { favourites, getJSON, setJSON } from '../store.js';
import { compassWords } from '../geo.js';
import { lightRibbon, lightLegend } from './charts.js';
import { chanceRow, whereLine, sortTime } from './parts.js';
import { openSpot } from './spot.js';

const H = 3600e3, DAY = 864e5;
const GROUPS = [['all', 'All'], ['fav', 'Saved'], ['light', 'Light'], ['fog', 'Fog'], ['water', 'Water'], ['storm', 'Storms'], ['winter', 'Winter'], ['season', 'Autumn'], ['night', 'Night'], ['wildlife', 'Wildlife']];
const GROUP_ICON = { fav: 'saved', light: 'sunrise', fog: 'fogsea', water: 'mirror', storm: 'lightning', winter: 'freshsnow', season: 'autumn', night: 'stars', wildlife: 'paw' };
let group = 'all', sort = getJSON('lb.homeSort', 'best');
let sel = null;            // the chosen day (local midnight, ms); null = today
const cache = new Map();   // per day: almanac and light
App.on('ops', () => cache.clear());
App.on('me', () => cache.clear());

const where = () => (App.me ? { ...App.me, elev: 500 } : { lat: 46.8, lon: 8.23, elev: 500 });
const fmtLong = (d) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(d);
const dur = (min) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}`;

function dayData(d0) {
  if (!cache.has(d0)) {
    const noon = new Date(d0 + 12 * H), w = where();
    const regions = regionWeather(App.grid, noon);
    cache.set(d0, { alm: almanac(noon, w, App.spots), lb: lightBands(noon, w), regions, brief: regions ? briefing(noon, { grid: App.grid, points: fogPoints(), regions }) : null });
  }
  return cache.get(d0);
}

function pick(ops) {
  const fav = favourites();
  let list = ops.filter((o) => o.score >= 45);
  if (group === 'fav') list = list.filter((o) => fav.has(o.spotId) || spotById(o.spotId)?.mine);
  else if (group !== 'all') list = list.filter((o) => TYPES[o.type]?.group === group);
  else list = list.filter((o) => o.type !== 'wildlife' || o.score >= 80); // the Wildlife tab has the rest
  const per = new Map();
  return list.sort((a, b) => b.score - a.score).filter((o) => { const n = per.get(o.spotId) || 0; per.set(o.spotId, n + 1); return n < 2; });
}

export function renderFeed(root) {
  const today = localMidnight(new Date()).getTime();
  if (sel == null || sel < today) sel = today;
  const reachDays = App.reach ? Math.max(1, Math.min(10, Math.floor((App.reach - today - DAY_START * H) / DAY) + 1)) : 5;
  const days = Array.from({ length: reachDays }, (_, i) => localMidnight(new Date(today + 12 * H), i).getTime());
  const far = !days.includes(sel);
  const best = new Map();
  for (const o of App.ops) { const k = opDay(o); if (o.score > (best.get(k) || 0)) best.set(k, o.score); }
  const outFrom = App.outlookFrom && Number.isFinite(App.outlookFrom) ? localMidnight(new Date(App.outlookFrom)).getTime() : Infinity;

  const cell = (d, extra = '') => {
    const b = best.get(d) || 0, dt = new Date(d + 12 * H);
    return `<button class="day ${d > outFrom ? 'out' : ''} ${extra}" data-day="${d}" aria-pressed="${d === sel}">
      <span class="dw">${d === today ? 'Today' : weekday(dt)}</span><span class="dn num">${zurichParts(dt).d}</span>
      <span class="bar ${scoreClass(b)}"><i style="width:${b}%"></i></span></button>`;
  };
  const selDate = new Date(sel + 12 * H), p = zurichParts(selDate);
  const iso = `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  const { alm, lb, regions, brief } = dayData(sel);
  const hasFc = !far && App.ops.length > 0;
  const ops = hasFc ? pick(opsOn(selDate)) : [];
  const top = ops[0] && ops[0].score >= 60 ? ops[0] : null;
  const list = [...ops].slice(0, 40);
  if (sort === 'time') list.sort((a, b) => sortTime(a) - sortTime(b));
  const outlook = sel > outFrom || (sel === outFrom && false);
  const kind = far ? 'Almanac · no forecast yet' : outlook ? 'Outlook · ECMWF, low confidence' : 'Forecast · MeteoSwiss';
  const ev = alm.ev, n = alm.night;

  // ---- the light of the day ----
  const marks = ops.slice(0, 14).map((o) => ({ t: o.peak.getTime(), icon: iconOf(o), score: o.score }));
  const labels = [ev.sunrise && { t: ev.sunrise.getTime(), text: hhmm(ev.sunrise), side: 'right', dark: true }, ev.sunset && { t: ev.sunset.getTime(), text: hhmm(ev.sunset), side: 'left', dark: true }].filter(Boolean);
  const moonTxt = `${Math.round(alm.moon.illum * 100)}%`;
  const coreTxt = n.core.length ? `${hhmm(n.core[0].start)}–${hhmm(new Date(n.core[n.core.length - 1].end.getTime() + 10 * 60e3))}` : n.coreSeason ? 'moonlit' : 'out of season';
  const light = `
    ${lightRibbon(lb, { marks, labels, now: sel === today ? Date.now() : null })}
    ${lightLegend()}
    <div class="facts mt12">
      <div><b class="num">${hhmm(ev.sunrise)}</b><span>Sunrise</span><small>golden to ${hhmm(ev.goldenMorningEnd)}</small></div>
      <div><b class="num">${hhmm(ev.sunset)}</b><span>Sunset</span><small>golden from ${hhmm(ev.goldenEveningStart)}</small></div>
      <div><b class="num">${alm.dayLength ? dur(alm.dayLength) : '–'}</b><span>Daylight</span><small>${alm.dayChange == null ? '' : `${alm.dayChange > 0 ? '+' : alm.dayChange < 0 ? '−' : '±'}${Math.abs(alm.dayChange)} min a day`}</small></div>
      <div><div class="row gap6">${moonSvg(alm.moon.phase, 22)}<b class="num">${moonTxt}</b></div><span>${esc(alm.moon.name)}</span><small>${ev.moonrise ? `rises ${hhmm(ev.moonrise)}` : ev.moonset ? `sets ${hhmm(ev.moonset)}` : ''}</small></div>
      <div><b class="num">${n.darkStart ? `${hhmm(n.darkStart)}–${hhmm(n.darkEnd)}` : '–'}</b><span>Full darkness</span><small>${n.darkStart ? `${dur(n.darkMoonlessMinutes)} without moon` : 'twilight all night'}</small></div>
      <div><b class="num" style="${n.core.length ? '' : 'font-size:14px;font-stretch:90%'}">${coreTxt}</b><span>Milky Way core</span><small>${n.coreBest ? `${fists(n.coreBest.coreAlt).replace(' above the horizon', '')}, ${compassWords(n.coreBest.coreAz)}` : ''}</small></div>
    </div>
    <p class="tiny faint mt8">Times for ${App.me ? 'your position' : 'the middle of Switzerland'}, flat horizon. Each spot has its own, with its mountains.</p>`;

  // ---- top pick ----
  let hero = '';
  if (top) {
    const s = spotById(top.spotId), ph = s?.photos?.find((x) => (TYPES[top.type].group === 'night' ? x.night : !x.night)) || s?.photos?.[0];
    if (s) hero = `<button class="hero bleed mt16" data-spot="${esc(s.id)}" style="${ph ? `background-image:url('${esc(photoUrl(ph, 800))}')` : ''}">
        <div class="top"><span class="eyebrow">Top pick${group !== 'all' ? ` · ${esc(GROUPS.find((g) => g[0] === group)[1])}` : ''}</span>${plate(top.score, true)}</div>
        <div class="bot"><div class="h1">${esc(top.title)}</div><div class="t">${whereLine(s)} · <span class="tnum">${hhmm(top.peak)}</span></div></div>
      </button>${ph && ph.file ? `<p class="tiny faint mt4" style="text-align:right">Photo: ${esc(credit(ph))}</p>` : ''}`;
  }

  // ---- chances ----
  let chances;
  if (far) chances = `<div class="notice">Forecasts reach ten days. For this date you see the light, the moon and what is in season; come back from <b>${esc(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: TZ }).format(new Date(sel - 9 * DAY)))}</b> for the weather.</div>`;
  else if (App.loading && !App.ops.length) chances = `<div class="stack">${'<div class="skeleton"></div>'.repeat(4)}</div>`;
  else if (App.error && !App.ops.length) chances = App.error.status === 429 ? `<div class="notice warn"><b>No forecast for the moment.</b> ${esc(App.error.message)}.</div>`
    : `<div class="notice warn"><b>No forecast.</b> ${esc(App.error.message)}. Check the connection and press refresh.</div>`;
  else if (!list.length) chances = `<div class="empty">Nothing special in the forecast${group !== 'all' ? ' for this filter' : ''}.<br><span class="small">Grey days happen. Try another day in the strip above.</span></div>`;
  else chances = `<div class="rows">${list.map((o) => chanceRow(o)).join('')}</div>`;

  // ---- where the light is ----
  const reg = regions && !far ? `<div class="sec"><div class="sec-head"><span class="eyebrow">Where the light is</span><span class="tiny faint">sunshine by region</span></div>
      <div class="rows">${regions.map((r) => `<div class="reg"><span class="nm">${esc(r.name)}</span><span class="wx">${icon(r.icon)}${esc(r.word)}</span>
        <span class="sunbar" title="${r.sunH.toFixed(1)} h of sun"><i style="width:${Math.round(r.frac * 100)}%"></i></span><span class="tnum small" style="min-width:52px;text-align:right">${r.tmin}/${r.tmax}°</span></div>`).join('')}</div>
      <p class="tiny faint mt8">Daytime sunshine from the MeteoSwiss model on a grid over Switzerland. The Map tab shows it hour by hour.</p></div>` : '';

  // ---- in season ----
  const season = [
    ...alm.showers.map((s) => ({ icon: 'meteors', title: `${s.name}${s.daysToPeak === 0 ? ': peak night' : s.daysToPeak > 0 ? `: peak in ${s.daysToPeak} day${s.daysToPeak > 1 ? 's' : ''}` : ': just past the peak'}`, text: `Up to about ${s.zhr} meteors an hour under a dark sky. ${s.note}` })),
    ...alm.colour.map((c) => ({ icon: 'autumn', title: { larch: 'Larches at their peak', beech: 'Beech woods in colour', chestnut: 'Chestnut woods in colour', maple: 'Maples in colour', vines: 'Vineyards in colour' }[c.species] || 'Autumn colour', text: c.names.slice(0, 6).join(', ') })),
    ...alm.wildlife.map((w) => ({ icon: w.glyph, title: w.title, text: `${w.text} ${w.spots.slice(0, 4).join(', ')}.` })),
    ...alm.seasons.map((s) => ({ icon: s.icon, title: s.title, text: s.text })),
  ];
  const seasonHtml = season.length ? `<div class="sec"><div class="sec-head"><span class="eyebrow">In season</span></div><div class="rows">${season.map((s) => `<div class="opl" style="grid-template-columns:26px 1fr">${icon(s.icon)}<div><b>${esc(s.title)}</b><div class="small muted mt4">${esc(s.text)}</div></div></div>`).join('')}</div></div>` : '';

  root.innerHTML = `<div class="wrap">
    <div class="ribbon"><div class="days">${days.map((d) => cell(d)).join('')}${far ? cell(sel, 'far') : ''}</div>
      <label class="cal" title="Pick any date">${icon('calendar', 22)}<input type="date" id="pickdate" value="${iso}" min="${new Date(today + 12 * H).toISOString().slice(0, 10)}" aria-label="Pick any date"></label></div>
    <div class="pagehead"><div><div class="eyebrow">${esc(kind)}</div><h1 class="h1 mt4">${esc(sel === today ? `Today, ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: TZ }).format(selDate)}` : fmtLong(selDate))}</h1></div></div>
    ${brief && brief.text.length ? `<p class="brief">${brief.text.join(' ')}</p>` : ''}
    ${hero}
    <div class="sec"><div class="sec-head"><span class="eyebrow">The light</span><span class="tiny faint">04:00 to 04:00</span></div>${light}</div>
    <div class="sec"><div class="sec-head"><span class="eyebrow">${far ? 'Chances' : `Chances · ${ops.length}`}</span>
        ${far ? '' : `<div class="seg"><button data-sort="best" aria-pressed="${sort === 'best'}">Best</button><button data-sort="time" aria-pressed="${sort === 'time'}">By time</button></div>`}</div>
      ${far ? '' : `<div class="chips" role="toolbar" style="margin-bottom:6px">${GROUPS.map(([k, l]) => `<button class="chip" data-group="${k}" aria-pressed="${k === group}">${GROUP_ICON[k] ? icon(GROUP_ICON[k]) : ''}${l}</button>`).join('')}</div>`}
      ${chances}</div>
    ${reg}${seasonHtml}
    ${App.updatedAt ? `<p class="tiny faint mt24">Forecast: MeteoSwiss ICON-CH1 and CH2 for five days (through Open-Meteo), read ${ago(App.updatedAt)}; then the ECMWF model as an outlook. Scores are estimates: look at the sky before you drive.</p>` : ''}
  </div>`;

  root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { sel = +b.dataset.day; renderFeed(root); root.scrollTo({ top: 0 }); }));
  root.querySelector('#pickdate').addEventListener('change', (e) => {
    const [y, m, d] = e.target.value.split('-').map(Number);
    if (!y) return;
    sel = localMidnight(new Date(Date.UTC(y, m - 1, d, 12))).getTime(); renderFeed(root); root.scrollTo({ top: 0 });
  });
  root.querySelectorAll('[data-group]').forEach((b) => b.addEventListener('click', () => { group = b.dataset.group; renderFeed(root); }));
  root.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { sort = b.dataset.sort; setJSON('lb.homeSort', sort); renderFeed(root); }));
  root.querySelectorAll('[data-spot]').forEach((b) => b.addEventListener('click', () => openSpot(b.dataset.spot)));
  const pressed = root.querySelector('.day[aria-pressed="true"]');
  if (pressed) pressed.scrollIntoView({ block: 'nearest', inline: 'center' });
}
