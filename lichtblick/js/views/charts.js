// SVG charts: the photo-weather meteogram, the horizon panorama and the sky dome.
import { sunAt, moonAt, hhmm, localMidnight, weekday, horizonAlt, milkyWayBand, galacticAt } from '../astro.js';
import { TYPES } from '../scoring.js';
import { esc, moonSvg } from '../ui.js';

const H = 3600e3;
const COMPASS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];

// ---- meteogram: cloud layers as bands (high, mid, low), rain and snow, wind, opportunities ----
export function meteogram(fc, spot, ops = [], { hours = 120, now = Date.now(), px = 7 } = {}) {
  if (!fc || !fc.t.length) return '<div class="notice">No forecast yet.</div>';
  const start = Math.floor(now / H) * H - 3 * H;
  const i0 = Math.max(0, fc.t.findIndex((t) => t >= start));
  const n = Math.min(hours, fc.t.length - i0);
  const W = n * px + 36, top = 26, band = 16, cl = top + 3 * band, pr = cl + 6, prH = 34, wy = pr + prH + 8, wH = 26, Hh = wy + wH + 18;
  const x = (k) => 30 + k * px;
  let g = '';
  // night shading
  for (let k = 0; k < n; k++) {
    const t = fc.t[i0 + k], s = sunAt(new Date(t + H / 2), spot);
    if (s.alt < -6) g += `<rect x="${x(k)}" y="${top - 2}" width="${px + 0.5}" height="${Hh - top - 14}" fill="#070c18"/>`;
    else if (s.alt < 6) g += `<rect x="${x(k)}" y="${top - 2}" width="${px + 0.5}" height="${Hh - top - 14}" fill="#2a2240" opacity="0.55"/>`;
  }
  // clouds
  const layers = [['high', top, '#dbe4ff'], ['mid', top + band, '#b4c1dd'], ['low', top + 2 * band, '#8f9cb8']];
  for (const [key, y, col] of layers) for (let k = 0; k < n; k++) {
    const v = fc[key] ? fc[key][i0 + k] : null;
    if (v > 2) g += `<rect x="${x(k)}" y="${y}" width="${px + 0.5}" height="${band - 1}" fill="${col}" opacity="${(0.08 + 0.85 * v / 100).toFixed(2)}"/>`;
  }
  // precipitation (mm/h; snow in white)
  for (let k = 0; k < n; k++) {
    const p = fc.precip[i0 + k + 1] ?? 0, sn = fc.snow ? fc.snow[i0 + k + 1] ?? 0 : 0;
    if (p > 0.05) { const h = Math.min(prH, 6 + p * 9); g += `<rect x="${x(k) + 1}" y="${pr + prH - h}" width="${px - 1.5}" height="${h}" rx="1" fill="${sn > 0.1 ? '#f2f6ff' : '#4fa8ff'}"/>`; }
  }
  // wind line
  let wl = '';
  for (let k = 0; k < n; k++) { const w = fc.wind[i0 + k]; if (w == null) continue; wl += `${wl ? 'L' : 'M'}${(x(k) + px / 2).toFixed(1)},${(wy + wH - Math.min(wH, (w / 40) * wH)).toFixed(1)}`; }
  g += `<path d="${wl}" fill="none" stroke="#7fe0b0" stroke-width="1.5"/>`;
  // days, hours, temperatures
  for (let k = 0; k < n; k++) {
    const t = fc.t[i0 + k], d = new Date(t), lh = +hhmm(d).slice(0, 2);
    if (lh === 0) g += `<line x1="${x(k)}" x2="${x(k)}" y1="2" y2="${Hh - 12}" stroke="#3a4a6c"/><text x="${x(k) + 4}" y="12" font-size="11" fill="#c9d3e8" font-weight="600">${weekday(d)}</text>`;
    if (lh % 6 === 0) {
      g += `<text x="${x(k)}" y="${Hh - 2}" font-size="9.5" fill="#6d7b99" text-anchor="middle">${String(lh).padStart(2, '0')}</text>`;
      const T = fc.temp[i0 + k];
      if (T != null && lh % 12 === 0) g += `<text x="${x(k) + 2}" y="${wy + 9}" font-size="9.5" fill="#ffcf8a">${Math.round(T)}°</text>`;
    }
  }
  if (!g.includes('font-weight="600"')) g += `<text x="${x(0) + 4}" y="12" font-size="11" fill="#c9d3e8" font-weight="600">${weekday(new Date(fc.t[i0]))}</text>`;
  // now
  const kn = (now - fc.t[i0]) / H;
  if (kn >= 0 && kn < n) g += `<line x1="${x(kn)}" x2="${x(kn)}" y1="${top - 4}" y2="${Hh - 12}" stroke="#ffb547" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  // opportunities
  for (const o of ops.slice(0, 40)) {
    const k = (o.peak - fc.t[i0]) / H;
    if (k < 0 || k > n) continue;
    g += `<text x="${x(k)}" y="${top - 5}" font-size="12" text-anchor="middle">${TYPES[o.type]?.icon || '•'}</text>`;
  }
  // labels
  const lab = `<g font-size="9" fill="#8796b3"><text x="2" y="${top + 11}">high</text><text x="2" y="${top + band + 11}">mid</text><text x="2" y="${top + 2 * band + 11}">low</text><text x="2" y="${pr + prH - 2}">rain</text><text x="2" y="${wy + wH - 2}">wind</text></g>`;
  return `<div class="scroll-x"><svg class="chart" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}" style="width:${W}px;max-width:none" role="img" aria-label="Five-day cloud, rain and wind forecast">${g}${lab}</svg></div>
  <div class="legend"><span><i style="background:#dbe4ff"></i>high clouds</span><span><i style="background:#8f9cb8"></i>low clouds / fog</span><span><i style="background:#4fa8ff"></i>rain</span><span><i style="background:#f2f6ff"></i>snow</span><span><i style="background:#7fe0b0"></i>wind (top = 40 km/h)</span><span><i style="background:#070c18;border:1px solid #333"></i>night</span></div>`;
}

// ---- panorama: what you see standing there, the real mountains included ----
// objects: { band: true, core: {alt, az}, moon: {alt, az, phase}, sun: {alt,az}, paths: [{ pts:[{alt,az,label}], color }] }
export function panorama(spot, horizon, date, { centre = 180, w = 720, h = 260, maxAlt = 45, band = true, paths = [], showSun = true, showMoon = true, showCore = true } = {}) {
  const x = (az) => ((((az - centre + 540) % 360) - 180) / 360 + 0.5) * w;
  const y = (alt) => h - 24 - (alt / maxAlt) * (h - 40);
  let g = `<defs><linearGradient id="pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#070b18"/><stop offset="1" stop-color="#16244a"/></linearGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${(w / 360) * 3}"/></filter>
    <radialGradient id="core"><stop offset="0" stop-color="#fff3d6" stop-opacity="0.95"/><stop offset="0.5" stop-color="#ffd27a" stop-opacity="0.45"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#pg)"/>`;
  // altitude guides in fists
  for (let a = 10; a <= maxAlt; a += 10) g += `<line x1="0" x2="${w}" y1="${y(a)}" y2="${y(a)}" stroke="#ffffff" stroke-opacity="0.07"/><text x="4" y="${y(a) - 3}" font-size="9.5" fill="#7d8bab">${a / 10} fist${a > 10 ? 's' : ''} · ${a}°</text>`;
  // Milky Way
  if (band) {
    const mw = milkyWayBand(date, spot, 3);
    let c = '';
    const rpx = (9 / maxAlt) * (h - 40);
    for (const p of mw.centre) if (p.alt > -12) c += `<circle cx="${x(p.az).toFixed(1)}" cy="${y(p.alt).toFixed(1)}" r="${rpx.toFixed(1)}" fill="#cfd8ff" opacity="${(0.05 + 0.13 * p.glow).toFixed(3)}"/>`;
    g += `<g filter="url(#blur)">${c}</g>`;
  }
  const core = galacticAt(0, 0, date, spot);
  if (showCore && core.alt > -10) g += `<circle cx="${x(core.az)}" cy="${y(core.alt)}" r="${(w / 360) * 9}" fill="url(#core)"/><text x="${x(core.az)}" y="${y(core.alt) - (w / 360) * 9 - 3}" font-size="11" fill="#ffd27a" text-anchor="middle" font-weight="600">core ${core.alt > 0 ? Math.round(core.alt) + '°' : ''}</text>`;
  // paths (sun, moon, core over time)
  for (const p of paths) {
    let d = '', prev = null, labels = '';
    for (const q of p.pts) {
      const X = x(q.az), Y = y(q.alt);
      d += prev && Math.abs(X - prev) < w / 2 ? `L${X.toFixed(1)},${Y.toFixed(1)}` : `M${X.toFixed(1)},${Y.toFixed(1)}`;
      prev = X;
      if (q.label && q.alt > -2) labels += `<circle cx="${X}" cy="${Y}" r="2.2" fill="${p.color}"/><text x="${X + 3}" y="${Y - 4}" font-size="9.5" fill="${p.color}">${esc(q.label)}</text>`;
    }
    g += `<path d="${d}" fill="none" stroke="${p.color}" stroke-width="1.6" stroke-opacity="0.85" ${p.dash ? 'stroke-dasharray="4 3"' : ''}/>${labels}`;
  }
  if (showMoon) {
    const m = moonAt(date, spot);
    if (m.alt > -5) g += `<g transform="translate(${x(m.az) - 9},${y(m.alt) - 9})">${moonSvg(m.phase, 18)}</g><text x="${x(m.az)}" y="${y(m.alt) + 20}" font-size="10" fill="#f4ecd2" text-anchor="middle">moon ${Math.round(m.illum * 100)}%</text>`;
  }
  if (showSun) {
    const s = sunAt(date, spot);
    if (s.alt > -3) g += `<circle cx="${x(s.az)}" cy="${y(s.alt)}" r="9" fill="#ffcf5c"/>`;
  }
  // the terrain
  let t = `M0,${h}`;
  for (let az = centre - 180; az <= centre + 180; az += 1.25) t += `L${x(az === centre + 180 ? az - 0.001 : az).toFixed(1)},${y(Math.max(horizonAlt(horizon, az), 0)).toFixed(1)}`;
  t += `L${w},${h}Z`;
  g += `<path d="${t}" fill="#03060c" stroke="#3b4e78" stroke-width="1"/>`;
  for (const [name, az] of COMPASS) g += `<text x="${x(az)}" y="${h - 7}" font-size="11.5" fill="${name === 'S' || name === 'N' ? '#ffb547' : '#9fb0d3'}" text-anchor="middle" font-weight="600">${name}</text>`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Panorama of the sky above the real horizon">${g}</svg>`;
}

// ---- sky dome: zenith in the middle, horizon round the edge, north up ----
export function dome(spot, horizon, date, { size = 320 } = {}) {
  const R = size / 2 - 18, c = size / 2;
  const pt = (alt, az) => { const r = ((90 - alt) / 90) * R, a = (az * Math.PI) / 180; return [c + r * Math.sin(a), c - r * Math.cos(a)]; };
  let g = `<defs><radialGradient id="dg"><stop offset="0" stop-color="#0a1024"/><stop offset="1" stop-color="#1a2a55"/></radialGradient>
    <filter id="db"><feGaussianBlur stdDeviation="${R / 40}"/></filter>
    <radialGradient id="dcore"><stop offset="0" stop-color="#fff3d6" stop-opacity="0.95"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient></defs>
    <circle cx="${c}" cy="${c}" r="${R}" fill="url(#dg)"/>`;
  for (const a of [30, 60]) g += `<circle cx="${c}" cy="${c}" r="${((90 - a) / 90) * R}" fill="none" stroke="#fff" stroke-opacity="0.08"/>`;
  const mw = milkyWayBand(date, spot, 3);
  let m = '';
  for (const p of mw.centre) if (p.alt > -5) { const [X, Y] = pt(p.alt, p.az); m += `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="${(R / 10).toFixed(1)}" fill="#cfd8ff" opacity="${(0.06 + 0.14 * p.glow).toFixed(3)}"/>`; }
  g += `<g filter="url(#db)">${m}</g>`;
  const core = galacticAt(0, 0, date, spot);
  if (core.alt > -3) { const [X, Y] = pt(core.alt, core.az); g += `<circle cx="${X}" cy="${Y}" r="${R / 9}" fill="url(#dcore)"/>`; }
  const mo = moonAt(date, spot);
  if (mo.alt > -2) { const [X, Y] = pt(mo.alt, mo.az); g += `<g transform="translate(${X - 8},${Y - 8})">${moonSvg(mo.phase, 16)}</g>`; }
  // terrain ring
  let d = '';
  for (let az = 0; az <= 360; az += 2.5) { const [X, Y] = pt(Math.max(0, horizonAlt(horizon, az)), az); d += `${d ? 'L' : 'M'}${X.toFixed(1)},${Y.toFixed(1)}`; }
  g += `<path d="${d} Z M${c + R},${c} A${R},${R} 0 1 0 ${c - R},${c} A${R},${R} 0 1 0 ${c + R},${c} Z" fill="#03060c" fill-rule="evenodd" stroke="#3b4e78"/>`;
  for (const [name, az] of COMPASS) { const [X, Y] = pt(-14, az); g += `<text x="${X}" y="${Y + 4}" font-size="11" fill="${name === 'N' ? '#ffb547' : '#9fb0d3'}" text-anchor="middle" font-weight="600">${name}</text>`; }
  return `<svg class="chart" viewBox="0 0 ${size} ${size}" width="100%" style="max-width:${size + 40}px;margin:auto;background:none" role="img" aria-label="Sky dome">${g}</svg>`;
}

// sun, moon and core paths for the panorama
export function sunPath(spot, day, step = 20) {
  const d0 = localMidnight(day).getTime(), pts = [];
  for (let m = 0; m <= 24 * 60; m += step) {
    const t = new Date(d0 + m * 60e3), s = sunAt(t, spot), lh = m / 60;
    pts.push({ ...s, label: m % 120 === 0 && s.alt > 0 ? hhmm(t) : '' });
  }
  return pts;
}
export function corePath(spot, from, to, step = 20) {
  const pts = [];
  for (let t = from; t <= to; t += step * 60e3) {
    const d = new Date(t), c = galacticAt(0, 0, d, spot);
    pts.push({ ...c, label: new Date(t).getUTCMinutes() === 0 ? hhmm(d) : '' });
  }
  return pts;
}
