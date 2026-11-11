// Pieces shared by several screens: the timetable row of a chance, the conditions at its hour.
import { App, spotById } from '../app.js';
import { iconOf, val, TYPES, CONF_WORDS } from '../scoring.js';
import { icon, signal } from '../icons.js';
import { esc, photoUrl, plate, hhmm } from '../ui.js';
import { distance, fmtKm, compass } from '../geo.js';

const H = 3600e3;

// "▲ 1797 m · 34 km"
export function whereLine(s) {
  const bits = [esc(s.name)];
  if (s.elev) bits.push(`<span class="peak tnum">${Math.round(s.elev)} m</span>`);
  if (App.me) bits.push(fmtKm(distance(App.me, s)));
  return bits.join(' · ');
}

// temperature, wind and cloud at the hour of a chance, with how far to trust it
export function condMeta(o, fc) {
  const t = Math.round(o.peak.getTime() / H) * H, out = [];
  if (o.conf) out.push(`<span title="${esc(CONF_WORDS[o.conf])}">${signal(o.conf, 13)}${o.conf === 'low' ? 'outlook' : o.conf}</span>`);
  if (fc) {
    const T = val(fc, 'temp', t), w = val(fc, 'wind', t), d = val(fc, 'windDir', t), c = val(fc, 'cloud', t), p = val(fc, 'precip', t + H);
    if (T != null) out.push(`<span class="tnum">${Math.round(T)}°</span>`);
    if (w != null) out.push(`<span class="tnum">${icon('wind')}${Math.round(w)} km/h${d != null ? ` ${compass(d)}` : ''}</span>`);
    if (c != null) out.push(`<span class="tnum">${icon('cloud')}${Math.round(c)}%</span>`);
    if (p > 0.1) out.push(`<span class="tnum">${icon('drop')}${p.toFixed(1)} mm</span>`);
  }
  return out.length ? `<div class="meta">${out.join('')}</div>` : '';
}

// the time column: the best moment, with the whole window underneath
export function timeCol(o) {
  const point = o.end - o.start < 20 * 60e3;
  return `<div class="t num">${hhmm(o.peak)}${point ? '' : `<small>${hhmm(o.start)}–${hhmm(o.end)}</small>`}</div>`;
}
export const sortTime = (o) => o.peak.getTime();

// one line of the timetable
export function chanceRow(o, { attr = 'data-spot', thumb = true, where = true } = {}) {
  const s = spotById(o.spotId);
  if (!s) return '';
  const night = TYPES[o.type]?.group === 'night';
  const ph = s.photos?.find((p) => (night ? p.night : !p.night)) || s.photos?.[0];
  return `<button class="tt" ${attr}="${esc(s.id)}">
    ${timeCol(o)}
    <div style="min-width:0">
      <div class="ttl">${icon(iconOf(o))}<span>${esc(o.title)}</span></div>
      ${where ? `<div class="where clip1">${whereLine(s)}</div>` : ''}
      <div class="why clip2">${esc(o.why.slice(0, 2).join(' · '))}</div>
      ${condMeta(o, App.fc.get(s.id))}
    </div>
    <div class="side">${plate(o.score)}${thumb && ph ? `<div class="thumb" style="background-image:url('${esc(photoUrl(ph, 250))}')"></div>` : ''}</div>
  </button>`;
}
