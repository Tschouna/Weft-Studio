// "Chances": the best photo opportunities across Switzerland in the next five days.
import { App, feedOps, spotById } from '../app.js';
import { TYPES, scoreClass, scoreWord } from '../scoring.js';
import { esc, photoUrl, whenText, relDay, ago } from '../ui.js';
import { favourites, settings } from '../store.js';
import { distance, fmtKm } from '../geo.js';
import { openSpot } from './spot.js';

const GROUPS = [['all', 'All'], ['fav', '★ Mine'], ['light', '🌅 Light'], ['fog', '☁️ Fog'], ['water', '🪞 Water'], ['storm', '⚡ Storms'], ['winter', '❄️ Winter'], ['season', '🍂 Autumn'], ['night', '🌌 Night'], ['wildlife', '🦌 Wildlife']];
let group = 'all';

export function renderFeed(root) {
  const fav = favourites();
  let ops = feedOps({ min: 45, perSpotDay: 2 });
  if (group === 'fav') ops = ops.filter((o) => fav.has(o.spotId) || spotById(o.spotId)?.mine);
  else if (group !== 'all') ops = ops.filter((o) => TYPES[o.type]?.group === group);
  else ops = ops.filter((o) => o.type !== 'wildlife' || o.score >= 80); // the Wildlife tab has the rest
  const now = new Date();
  const top = ops.slice(0, 60).sort((a, b) => a.start - b.start || b.score - a.score);
  const byDay = new Map();
  for (const o of top) {
    const k = relDay(o.start < now ? now : o.start, now);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(o);
  }
  for (const list of byDay.values()) list.sort((a, b) => b.score - a.score);
  const best = ops[0];
  const head = `<div class="hero-line"><h2>Best chances</h2><span class="small muted">${App.spots.length} spots · next 5 days</span></div>`;
  const chips = `<div class="chips" role="toolbar">${GROUPS.map(([k, l]) => `<button class="chip" data-group="${k}" aria-pressed="${k === group}">${l}</button>`).join('')}</div>`;
  let body = '';
  if (App.loading && !App.ops.length) body = `<div class="cards">${'<div class="skeleton"></div>'.repeat(5)}</div>`;
  else if (App.error && !App.ops.length) body = `<div class="notice warn">Could not load the MeteoSwiss forecast (${esc(App.error.message)}). Check the connection and pull refresh.</div>`;
  else if (!top.length) body = `<div class="empty">Nothing special in the forecast${group !== 'all' ? ' for this filter' : ''}.<br><span class="small">Grey days happen. Check back after the next model run.</span></div>`;
  else {
    if (best && best.score >= 80) {
      const s = spotById(best.spotId);
      body += `<button class="notice" data-op data-spot="${esc(best.spotId)}" style="border-color:#5a4a1e;color:#ffe3a6;width:100%;text-align:left;cursor:pointer">${TYPES[best.type].icon} <b>Top pick:</b> ${esc(best.title)} · ${esc(s?.name || '')}<br><span class="small">${esc(whenText(best, now))} · score ${best.score}</span></button>`;
    }
    for (const [day, list] of byDay) body += `<div class="day-head">${esc(day)}</div><div class="cards">${list.map((o) => card(o, now)).join('')}</div>`;
  }
  const foot = App.updatedAt ? `<p class="tiny faint" style="margin-top:22px">Forecast: MeteoSwiss ICON-CH1/CH2 (via Open-Meteo), ${ago(App.updatedAt)}. Scores are estimates from the model; check the sky before you drive.</p>` : '';
  root.innerHTML = `<div class="wrap">${head}${chips}${body}${foot}</div>`;
  root.querySelectorAll('[data-group]').forEach((b) => b.addEventListener('click', () => { group = b.dataset.group; renderFeed(root); }));
  root.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', () => openSpot(b.dataset.spot)));
}

function card(o, now) {
  const s = spotById(o.spotId);
  if (!s) return '';
  const ph = s.photos?.find((p) => (TYPES[o.type].group === 'night' ? p.night : !p.night)) || s.photos?.[0];
  const dist = App.me ? ` · ${fmtKm(distance(App.me, s))}` : '';
  return `<button class="opcard" data-op data-spot="${esc(s.id)}">
    <div class="ph" style="background-image:url('${esc(photoUrl(ph, 330))}')"><span class="ic">${o.icon || TYPES[o.type].icon}</span></div>
    <div class="bd">
      <div class="row sp"><span class="when">${esc(whenText(o, now))}</span><span class="score ${scoreClass(o.score)}" title="${scoreWord(o.score)}">${o.score}</span></div>
      <div class="t">${esc(o.title)}</div>
      <div class="s">${esc(s.name)}${s.elev ? ` · ${Math.round(s.elev)} m` : ''}${dist}</div>
      <div class="w">${esc(o.why.slice(0, 2).join(' · '))}</div>
    </div></button>`;
}
