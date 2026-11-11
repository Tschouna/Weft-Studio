// Drawings: the light ribbon of a day, the light compass, the forecast strip, hour tables, and the
// two pictures of the night sky (panorama and dome). Colours come from the theme, except the sky
// pictures, which are always night.
import { sunAt, moonAt, hhmm, localMidnight, weekday, horizonAlt, milkyWayBand, galacticAt, zurichParts } from '../astro.js';
import { iconOf, scoreClass, val } from '../scoring.js';
import { LIGHT } from '../brief.js';
import { iconAt } from '../icons.js';
import { esc, moonSvg } from '../ui.js';
import { compass } from '../geo.js';

const H = 3600e3;
const COMPASS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
const f1 = (n) => n.toFixed(1);

// ---- the light ribbon: one day of sky, 04:00 to 04:00, with the chances at their hour ----
// lb = lightBands(...); marks = [{ t, icon, score, id }]
export function lightRibbon(lb, { marks = [], now = null, labels = [] } = {}) {
  const W = 360, top = marks.length ? 25 : 4, bar = 30, x = (t) => ((t - lb.d0) / (24 * H)) * W;
  let g = '';
  for (const b of lb.bands) g += `<rect x="${f1(x(b.from))}" y="${top}" width="${f1(x(b.to) - x(b.from) + 0.4)}" height="${bar}" fill="${LIGHT[b.kind].color}"/>`;
  for (const d of lb.direct) g += `<rect x="${f1(x(d.from))}" y="${top}" width="${f1(x(d.to) - x(d.from))}" height="4" fill="var(--sunc)"/>`;
  for (const m of lb.moon) g += `<rect x="${f1(x(m.from))}" y="${top + bar + 3}" width="${f1(x(m.to) - x(m.from))}" height="2.5" fill="var(--ink2)"/>`;
  for (let k = 0; k <= 24; k += 3) {
    const t = lb.d0 + k * H, X = Math.min(W - 0.5, Math.max(0.5, x(t)));
    g += `<line x1="${X}" x2="${X}" y1="${top + bar}" y2="${top + bar + 9}" stroke="var(--ink3)" stroke-width="1"/>`;
    g += `<text x="${k === 0 ? 2 : k === 24 ? W - 2 : X}" y="${top + bar + 21}" font-size="10" fill="var(--ink2)" text-anchor="${k === 0 ? 'start' : k === 24 ? 'end' : 'middle'}" style="font-variant-numeric:tabular-nums">${hhmm(new Date(t)).slice(0, 2)}</text>`;
  }
  // times written into the bar (sunrise, sunset)
  for (const l of labels) {
    if (!l.t) continue;
    const X = x(l.t);
    g += `<line x1="${f1(X)}" x2="${f1(X)}" y1="${top}" y2="${top + bar}" stroke="#fff" stroke-opacity="0.9" stroke-width="1"/><text x="${f1(X + (l.side === 'left' ? -4 : 4))}" y="${top + bar - 6}" font-size="10.5" font-weight="700" fill="${l.dark ? '#101214' : '#fff'}" text-anchor="${l.side === 'left' ? 'end' : 'start'}" style="font-variant-numeric:tabular-nums">${esc(l.text)}</text>`;
  }
  // the chances, best first, kept apart
  const placed = [];
  for (const m of [...marks].sort((a, b) => b.score - a.score)) {
    const X = Math.min(W - 10, Math.max(10, x(m.t)));
    if (placed.some((p) => Math.abs(p - X) < 19)) continue;
    placed.push(X);
    const hot = scoreClass(m.score) === 's5';
    g += `<line x1="${f1(X)}" x2="${f1(X)}" y1="19" y2="${top}" stroke="${hot ? 'var(--accent)' : 'var(--ink)'}" stroke-width="1.5"/>${iconAt(m.icon, X, 9, 17, hot ? 'var(--accent)' : 'var(--ink)')}`;
  }
  if (now != null && now >= lb.d0 && now <= lb.d0 + 24 * H) g += `<path d="M${f1(x(now) - 4)} ${top - 5}h8l-4 5z" fill="var(--accent)"/><line x1="${f1(x(now))}" x2="${f1(x(now))}" y1="${top}" y2="${top + bar + 4}" stroke="var(--accent)" stroke-width="1.5"/>`;
  return `<div class="light"><svg viewBox="0 0 ${W} ${top + bar + 25}" role="img" aria-label="The light of the day from 4 in the morning to 4 the next morning">${g}</svg></div>`;
}
export const lightLegend = (extra = '') => `<div class="light-legend">${['night', 'blue', 'gold', 'day'].map((k) => `<span><i style="background:${LIGHT[k].color}"></i>${LIGHT[k].label}</span>`).join('')}<span><i style="background:var(--ink2);height:3px;vertical-align:3px"></i>Moon up</span>${extra}</div>`;

// ---- the light compass: where the sun and moon travel, over the real horizon ----
export function lightCompass(spot, day, horizon, { size = 300 } = {}) {
  const c = size / 2, R = size / 2 - 34, d0 = localMidnight(day).getTime();
  const pt = (alt, az, r = R) => { const rr = ((90 - Math.max(alt, 0)) / 90) * r, a = (az * Math.PI) / 180; return [c + rr * Math.sin(a), c - rr * Math.cos(a)]; };
  let g = `<circle cx="${c}" cy="${c}" r="${R}" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.5"/>`;
  for (const a of [30, 60]) g += `<circle cx="${c}" cy="${c}" r="${f1(((90 - a) / 90) * R)}" fill="none" stroke="var(--rule)"/>`;
  for (let az = 0; az < 360; az += 10) { const a = (az * Math.PI) / 180, r0 = R + 1, r1 = R + (az % 30 ? 4 : 8); g += `<line x1="${f1(c + r0 * Math.sin(a))}" y1="${f1(c - r0 * Math.cos(a))}" x2="${f1(c + r1 * Math.sin(a))}" y2="${f1(c - r1 * Math.cos(a))}" stroke="var(--ink)" stroke-width="${az % 90 ? 1 : 2}"/>`; }
  // the mountains, eating into the dial from the rim
  if (horizon && horizon.alts) {
    let d = `M${c} ${c - R}A${R} ${R} 0 1 1 ${c - 0.01} ${c - R}Z`;
    for (let az = 0; az <= 360; az += 2.5) { const [X, Y] = pt(horizonAlt(horizon, az), az); d += `${az ? 'L' : 'M'}${f1(X)} ${f1(Y)}`; }
    g += `<path d="${d}Z" fill="var(--ink)" fill-rule="evenodd" opacity="0.2"/>`;
  }
  // the photo's direction
  if (Number.isFinite(spot.heading)) {
    const a0 = ((spot.heading - 22) * Math.PI) / 180, a1 = ((spot.heading + 22) * Math.PI) / 180;
    g += `<path d="M${c} ${c}L${f1(c + R * Math.sin(a0))} ${f1(c - R * Math.cos(a0))}A${R} ${R} 0 0 1 ${f1(c + R * Math.sin(a1))} ${f1(c - R * Math.cos(a1))}Z" fill="var(--accent)" opacity="0.13"/>`;
  }
  // sun and moon across the sky
  const path = (fn, step) => { let d = '', on = false; const marks = []; for (let m = 0; m <= 1440; m += step) { const t = new Date(d0 + m * 60e3), p = fn(t); if (p.alt < 0) { on = false; continue; } const [X, Y] = pt(p.alt, p.az); d += `${on ? 'L' : 'M'}${f1(X)} ${f1(Y)}`; on = true; if (m % 180 === 0) marks.push([X, Y, hhmm(t).slice(0, 2)]); } return { d, marks }; };
  const moon = path((t) => moonAt(t, spot), 15), sun = path((t) => sunAt(t, spot), 10);
  if (moon.d) g += `<path d="${moon.d}" fill="none" stroke="var(--ink2)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  if (sun.d) g += `<path d="${sun.d}" fill="none" stroke="var(--sunc)" stroke-width="3.5"/>`;
  for (const [X, Y, l] of sun.marks) g += `<circle cx="${f1(X)}" cy="${f1(Y)}" r="3" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.5"/><text x="${f1(X)}" y="${f1(Y - 7)}" font-size="10" font-weight="700" fill="var(--ink)" text-anchor="middle">${l}</text>`;
  for (const [n, az] of COMPASS.filter((_, i) => i % 2 === 0)) { const a = (az * Math.PI) / 180, r = R + 20; g += `<text x="${f1(c + r * Math.sin(a))}" y="${f1(c - r * Math.cos(a) + 4.5)}" font-size="13" font-weight="800" fill="${n === 'N' ? 'var(--accent)' : 'var(--ink)'}" text-anchor="middle">${n}</text>`; }
  g += `<circle cx="${c}" cy="${c}" r="3.5" fill="var(--accent)"/>`;
  return `<svg class="chart" viewBox="0 0 ${size} ${size}" style="max-width:${size + 30}px;margin:0 auto" role="img" aria-label="Path of the sun and the moon over the horizon">${g}</svg>`;
}

// ---- forecast strip: cloud layers, rain and snow, wind, temperature, with the chances on top ----
export function meteogram(fc, spot, ops = [], { now = Date.now(), px = 7 } = {}) {
  if (!fc || !fc.t.length) return '<div class="notice">No forecast yet.</div>';
  const start = Math.floor(now / H) * H - 3 * H;
  const i0 = Math.max(0, fc.t.findIndex((t) => t >= start));
  const n = fc.t.length - i0;
  const L = 34, top = 44, band = 14, pr = top + 3 * band + 6, prH = 30, wy = pr + prH + 8, wH = 24, ty = wy + wH + 16, Hh = ty + 20, W = n * px + L + 6;
  const x = (k) => L + k * px;
  let g = '';
  for (let k = 0; k < n; k++) {
    const t = fc.t[i0 + k], s = sunAt(new Date(t + H / 2), spot);
    if (s.alt < -6) g += `<rect x="${x(k)}" y="${top - 2}" width="${px + 0.4}" height="${ty - top - 6}" fill="var(--nightfill)"/>`;
    else if (s.alt < 6) g += `<rect x="${x(k)}" y="${top - 2}" width="${px + 0.4}" height="${ty - top - 6}" fill="var(--duskfill)"/>`;
  }
  ['high', 'mid', 'low'].forEach((key, r) => {
    for (let k = 0; k < n; k++) { const v = fc[key] ? fc[key][i0 + k] : null; if (v > 2) g += `<rect x="${x(k)}" y="${top + r * band}" width="${px + 0.4}" height="${band - 1}" fill="rgb(var(--cloud))" opacity="${(0.06 + 0.86 * v / 100).toFixed(2)}"/>`; }
  });
  for (let k = 0; k < n; k++) {
    const p = fc.precip[i0 + k + 1] ?? 0, sn = fc.snow ? fc.snow[i0 + k + 1] ?? 0 : 0;
    if (p > 0.05) { const h = Math.min(prH, 5 + p * 8); g += `<rect x="${x(k) + 1}" y="${pr + prH - h}" width="${px - 1.6}" height="${h}" fill="${sn > 0.1 ? 'var(--snowc)' : 'var(--rain)'}"/>`; }
  }
  let wl = '';
  for (let k = 0; k < n; k++) { const w = fc.wind[i0 + k]; if (w == null) continue; wl += `${wl ? 'L' : 'M'}${f1(x(k) + px / 2)},${f1(wy + wH - Math.min(wH, (w / 40) * wH))}`; }
  g += `<line x1="${L}" x2="${W}" y1="${wy + wH}" y2="${wy + wH}" stroke="var(--rule)"/><path d="${wl}" fill="none" stroke="var(--windc)" stroke-width="1.5"/>`;
  let firstDay = true;
  for (let k = 0; k < n; k++) {
    const t = fc.t[i0 + k], d = new Date(t), lh = +hhmm(d).slice(0, 2);
    if (lh === 0 || k === 0) {
      if (lh === 0) g += `<line x1="${x(k)}" x2="${x(k)}" y1="2" y2="${Hh - 4}" stroke="var(--ink)" stroke-width="1"/>`;
      if (lh < 18 || !firstDay) g += `<text x="${x(k) + 4}" y="12" font-size="11" font-weight="800" fill="var(--ink)" letter-spacing="0.06em">${weekday(d).toUpperCase()} ${zurichParts(d).d}</text>`;
      firstDay = false;
    }
    if (lh % 6 === 0) {
      g += `<text x="${x(k)}" y="${Hh - 6}" font-size="9.5" fill="var(--ink2)" text-anchor="middle">${String(lh).padStart(2, '0')}</text>`;
      const T = fc.temp[i0 + k];
      if (T != null) g += `<text x="${x(k)}" y="${ty}" font-size="10" font-weight="700" fill="var(--ink)" text-anchor="middle">${Math.round(T)}°</text>`;
    }
  }
  if (fc.outlookFrom) {
    const k = (fc.outlookFrom - fc.t[i0]) / H;
    if (k > 0 && k < n) g += `<rect x="${x(k)}" y="${top - 2}" width="${W - x(k)}" height="${ty - top - 6}" fill="var(--bg)" opacity="0.45"/><line x1="${x(k)}" x2="${x(k)}" y1="16" y2="${Hh - 4}" stroke="var(--ink)" stroke-dasharray="3 3"/><text x="${x(k) + 4}" y="26" font-size="9.5" font-weight="700" fill="var(--ink2)" letter-spacing="0.08em">OUTLOOK</text>`;
  }
  const kn = (now - fc.t[i0]) / H;
  if (kn >= 0 && kn < n) g += `<line x1="${f1(x(kn))}" x2="${f1(x(kn))}" y1="${top - 4}" y2="${ty - 8}" stroke="var(--accent)" stroke-width="1.5"/>`;
  const placed = [];
  for (const o of [...ops].sort((a, b) => b.score - a.score).slice(0, 60)) {
    const k = (o.peak - fc.t[i0]) / H, X = x(k);
    if (k < 0 || k > n || placed.some((p) => Math.abs(p - X) < 15)) continue;
    placed.push(X);
    g += iconAt(iconOf(o), X, 33, 13, scoreClass(o.score) === 's5' ? 'var(--accent)' : 'var(--ink)');
  }
  const lab = `<g font-size="8.5" font-weight="700" fill="var(--ink2)" letter-spacing="0.06em"><text x="2" y="${top + 10}">HIGH</text><text x="2" y="${top + band + 10}">MID</text><text x="2" y="${top + 2 * band + 10}">LOW</text><text x="2" y="${pr + prH - 2}">RAIN</text><text x="2" y="${wy + wH - 2}">WIND</text><text x="2" y="${ty}">°C</text></g>`;
  return `<div class="chartbox"><div class="scroll-x"><svg class="chart" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" style="width:${W}px;max-width:none" role="img" aria-label="Cloud, rain, wind and temperature forecast">${g}${lab}</svg></div></div>
  <div class="legend"><span><i style="background:rgb(var(--cloud))"></i>cloud by layer</span><span><i style="background:var(--rain)"></i>rain</span><span><i style="background:var(--snowc)"></i>snow</span><span><i style="background:var(--windc);height:2px;vertical-align:3px"></i>wind, top = 40 km/h</span><span><i style="background:var(--nightfill);outline:1px solid var(--rule)"></i>night</span></div>`;
}

// ---- hour table: times across, one row per quantity ----
// rows = [{ label, cell: (t) => string | { text, bg, color, title } , sep }]
export function hourTable(times, rows) {
  const head = `<tr><th class="rh"></th>${times.map((t) => `<th>${hhmm(new Date(t)).slice(0, 2)}</th>`).join('')}</tr>`;
  const body = rows.map((r) => `<tr${r.sep ? ' class="sep"' : ''}><th class="rh">${esc(r.label)}</th>${times.map((t) => {
    const c = r.cell(t), o = c != null && typeof c === 'object' ? c : { text: c };
    return `<td${o.title ? ` title="${esc(o.title)}"` : ''} style="${o.bg ? `background:${o.bg};` : ''}${o.color ? `color:${o.color};` : ''}">${o.text ?? ''}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="scroll-x"><table class="hours">${head}${body}</table></div>`;
}
// the usual weather rows for a forecast series
export function weatherRows(fc, { light = null } = {}) {
  const cloud = (k) => (t) => { const v = val(fc, k, t); return v == null ? '' : { text: Math.round(v), bg: `rgba(var(--cloud), ${(0.05 + 0.5 * v / 100).toFixed(2)})` }; };
  return [
    { label: '°C', cell: (t) => { const v = val(fc, 'temp', t); return v == null ? '' : Math.round(v); } },
    { label: 'Cloud %', cell: cloud('cloud'), sep: true }, { label: '· high', cell: cloud('high') }, { label: '· mid', cell: cloud('mid') }, { label: '· low', cell: cloud('low') },
    { label: 'Rain mm', sep: true, cell: (t) => { const p = val(fc, 'precip', t + H), s = val(fc, 'snow', t + H); return p > 0.05 ? { text: p.toFixed(1), color: s > 0.1 ? 'var(--ink)' : 'var(--rain)', title: s > 0.1 ? 'snow' : 'rain' } : ''; } },
    { label: 'Wind', cell: (t) => { const w = val(fc, 'wind', t), d = val(fc, 'windDir', t); return w == null ? '' : { text: `${d == null ? '' : `<span style="display:inline-block;transform:rotate(${(d + 180) % 360}deg)">↑</span>`}${Math.round(w)}`, title: d == null ? '' : `from ${compass(d)}` }; } },
    { label: 'Gusts', cell: (t) => { const g = val(fc, 'gust', t); return g == null ? '' : { text: Math.round(g), color: g >= 50 ? 'var(--accent)' : '' }; } },
    { label: 'Humidity', cell: (t) => { const v = val(fc, 'rh', t); return v == null ? '' : Math.round(v); } },
    ...(light ? [{ label: 'Light', sep: true, cell: (t) => { const w = light(t); return { text: `<span class="tiny">${w}</span>` }; } }] : []),
  ];
}

// ---- pictures of the night sky (always dark) ----
const SKY = { top: '#04060c', low: '#101a3a', land: '#000000', edge: '#4a5a80', text: '#aab6d0', core: '#ffd27a' };
// what you see standing there, the real mountains included
export function panorama(spot, horizon, date, { centre = 180, w = 720, h = 280, maxAlt = 45, band = true, paths = [], showSun = true, showMoon = true, showCore = true } = {}) {
  const x = (az) => ((((az - centre + 540) % 360) - 180) / 360 + 0.5) * w;
  const y = (alt) => h - 26 - (alt / maxAlt) * (h - 42);
  let g = `<defs><linearGradient id="pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${SKY.top}"/><stop offset="1" stop-color="${SKY.low}"/></linearGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(w / 360) * 3}"/></filter>
    <radialGradient id="core"><stop offset="0" stop-color="#fff3d6" stop-opacity="0.95"/><stop offset="0.5" stop-color="${SKY.core}" stop-opacity="0.45"/><stop offset="1" stop-color="${SKY.core}" stop-opacity="0"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#pg)"/>`;
  for (let a = 10; a <= maxAlt; a += 10) g += `<line x1="0" x2="${w}" y1="${y(a)}" y2="${y(a)}" stroke="#fff" stroke-opacity="0.08"/><text x="6" y="${y(a) - 4}" font-size="12" fill="${SKY.text}" opacity="0.8">${a / 10} fist${a > 10 ? 's' : ''} · ${a}°</text>`;
  if (band) {
    const mw = milkyWayBand(date, spot, 3), rpx = (9 / maxAlt) * (h - 42);
    let c = '';
    for (const p of mw.centre) if (p.alt > -12) c += `<circle cx="${f1(x(p.az))}" cy="${f1(y(p.alt))}" r="${f1(rpx)}" fill="#cfd8ff" opacity="${(0.05 + 0.13 * p.glow).toFixed(3)}"/>`;
    g += `<g filter="url(#blur)">${c}</g>`;
  }
  const core = galacticAt(0, 0, date, spot);
  if (showCore && core.alt > -10) g += `<circle cx="${x(core.az)}" cy="${y(core.alt)}" r="${(w / 360) * 9}" fill="url(#core)"/><text x="${x(core.az)}" y="${y(core.alt) - (w / 360) * 9 - 4}" font-size="14" fill="${SKY.core}" text-anchor="middle" font-weight="700">core${core.alt > 0 ? ` ${Math.round(core.alt)}°` : ''}</text>`;
  for (const p of paths) {
    let d = '', prev = null, labels = '';
    for (const q of p.pts) {
      const X = x(q.az), Y = y(q.alt);
      d += prev != null && Math.abs(X - prev) < w / 2 ? `L${f1(X)},${f1(Y)}` : `M${f1(X)},${f1(Y)}`;
      prev = X;
      if (q.label && q.alt > -2) labels += `<circle cx="${X}" cy="${Y}" r="2.6" fill="${p.color}"/><text x="${X + 4}" y="${Y - 5}" font-size="12" fill="${p.color}">${esc(q.label)}</text>`;
    }
    g += `<path d="${d}" fill="none" stroke="${p.color}" stroke-width="2" stroke-opacity="0.9" ${p.dash ? 'stroke-dasharray="5 4"' : ''}/>${labels}`;
  }
  if (showMoon) {
    const m = moonAt(date, spot);
    if (m.alt > -5) g += `<g transform="translate(${x(m.az) - 11},${y(m.alt) - 11})">${moonSvg(m.phase, 22, '#3a4050', '#f4efe2')}</g><text x="${x(m.az)}" y="${y(m.alt) + 26}" font-size="12" fill="#f4efe2" text-anchor="middle">moon ${Math.round(m.illum * 100)}%</text>`;
  }
  if (showSun) { const s = sunAt(date, spot); if (s.alt > -3) g += `<circle cx="${x(s.az)}" cy="${y(s.alt)}" r="10" fill="#ffcf5c"/>`; }
  let t = `M0,${h}`;
  for (let az = centre - 180; az <= centre + 180; az += 1.25) t += `L${f1(x(az === centre + 180 ? az - 0.001 : az))},${f1(y(Math.max(horizonAlt(horizon, az), 0)))}`;
  g += `<path d="${t}L${w},${h}Z" fill="${SKY.land}" stroke="${SKY.edge}" stroke-width="1"/>`;
  for (const [name, az] of COMPASS) g += `<text x="${x(az)}" y="${h - 8}" font-size="14" fill="${name === 'N' ? '#ff5a4d' : '#fff'}" text-anchor="middle" font-weight="800">${name}</text>`;
  return `<div class="skybox"><svg class="chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Panorama of the sky above the real horizon">${g}</svg></div>`;
}

// the whole sky: zenith in the middle, horizon round the edge, north up
export function dome(spot, horizon, date, { size = 340 } = {}) {
  const R = size / 2 - 22, c = size / 2;
  const pt = (alt, az) => { const r = ((90 - alt) / 90) * R, a = (az * Math.PI) / 180; return [c + r * Math.sin(a), c - r * Math.cos(a)]; };
  let g = `<defs><radialGradient id="dg"><stop offset="0" stop-color="${SKY.top}"/><stop offset="1" stop-color="${SKY.low}"/></radialGradient>
    <filter id="db"><feGaussianBlur stdDeviation="${R / 40}"/></filter>
    <radialGradient id="dcore"><stop offset="0" stop-color="#fff3d6" stop-opacity="0.95"/><stop offset="1" stop-color="${SKY.core}" stop-opacity="0"/></radialGradient></defs>
    <rect width="${size}" height="${size}" fill="${SKY.land}"/><circle cx="${c}" cy="${c}" r="${R}" fill="url(#dg)"/>`;
  for (const a of [30, 60]) g += `<circle cx="${c}" cy="${c}" r="${((90 - a) / 90) * R}" fill="none" stroke="#fff" stroke-opacity="0.1"/>`;
  const mw = milkyWayBand(date, spot, 3);
  let m = '';
  for (const p of mw.centre) if (p.alt > -5) { const [X, Y] = pt(p.alt, p.az); m += `<circle cx="${f1(X)}" cy="${f1(Y)}" r="${f1(R / 10)}" fill="#cfd8ff" opacity="${(0.06 + 0.14 * p.glow).toFixed(3)}"/>`; }
  g += `<g filter="url(#db)">${m}</g>`;
  const core = galacticAt(0, 0, date, spot);
  if (core.alt > -3) { const [X, Y] = pt(core.alt, core.az); g += `<circle cx="${X}" cy="${Y}" r="${R / 9}" fill="url(#dcore)"/>`; }
  const mo = moonAt(date, spot);
  if (mo.alt > -2) { const [X, Y] = pt(mo.alt, mo.az); g += `<g transform="translate(${X - 9},${Y - 9})">${moonSvg(mo.phase, 18, '#3a4050', '#f4efe2')}</g>`; }
  let d = '';
  for (let az = 0; az <= 360; az += 2.5) { const [X, Y] = pt(Math.max(0, horizonAlt(horizon, az)), az); d += `${d ? 'L' : 'M'}${f1(X)},${f1(Y)}`; }
  g += `<path d="${d} Z M${c + R},${c} A${R},${R} 0 1 0 ${c - R},${c} A${R},${R} 0 1 0 ${c + R},${c} Z" fill="${SKY.land}" fill-rule="evenodd" stroke="${SKY.edge}"/>`;
  for (const [name, az] of COMPASS) { const [X, Y] = pt(-13, az); g += `<text x="${X}" y="${Y + 4}" font-size="12" fill="${name === 'N' ? '#ff5a4d' : '#fff'}" text-anchor="middle" font-weight="800">${name}</text>`; }
  return `<div class="skybox"><svg class="chart" viewBox="0 0 ${size} ${size}" style="max-width:${size + 60}px;margin:0 auto" role="img" aria-label="The whole sky">${g}</svg></div>`;
}

export function sunPath(spot, day, step = 20) {
  const d0 = localMidnight(day).getTime(), pts = [];
  for (let m = 0; m <= 24 * 60; m += step) { const t = new Date(d0 + m * 60e3), s = sunAt(t, spot); pts.push({ ...s, label: m % 120 === 0 && s.alt > 0 ? hhmm(t) : '' }); }
  return pts;
}
export function corePath(spot, from, to, step = 20) {
  const pts = [];
  for (let t = from; t <= to; t += step * 60e3) { const d = new Date(t), c = galacticAt(0, 0, d, spot); pts.push({ ...c, label: new Date(t).getUTCMinutes() === 0 ? hhmm(d) : '' }); }
  return pts;
}
