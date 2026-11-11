// The map: where the light is at a chosen hour (MeteoSwiss forecast on a grid over Switzerland), the
// spots marked by their chance at that hour, the directions of sunrise, sunset and moon from a spot,
// and layers: live MeteoSwiss stations, webcams, night lights, wildlife areas.
import { App, bestFor, spotById } from '../app.js';
import { CH_OUTLINE } from '../../data/ch-outline.js';
import { photoWeatherAt, val, iconOf, scoreClass } from '../scoring.js';
import { live, webcams, LIVE } from '../sources/meteoswiss.js';
import { WMTS } from '../sources/swisstopo.js';
import { dayEvents, hhmm, weekday, zurichParts, sunAt } from '../astro.js';
import { destination, compass } from '../geo.js';
import { icon } from '../icons.js';
import { esc, toast, photoUrl, plate } from '../ui.js';
import { openSpot } from './spot.js';
import { addSpotAt } from './spots.js';
import { getJSON, setJSON } from '../store.js';

const H = 3600e3;
let map = null, heat = null, pins = null, liveLayer = null, camLayer = null, lights = null, base = null, meMarker = null, lines = null, lineSpot = null;
let mode = getJSON('lb.mapMode', 'photo');
let liveKind = getJSON('lb.mapLive', '');
let showCams = getJSON('lb.mapCams', false), showLights = getJSON('lb.mapLights', false);
const WILD_LAYERS = { game: ['ch.bafu.bundesinventare-jagdbanngebiete', 'Game reserves (ibex, chamois, deer)'], birds: ['ch.bafu.bundesinventare-vogelreservate', 'Water and migratory bird reserves'], rest: ['ch.bafu.wrz-wildruhezonen_portal', 'Wildlife rest zones (winter rules)'] };
let wildOn = getJSON('lb.mapWild', {});
const wildTiles = {};
let baseKind = getJSON('lb.mapBase', 'auto'); if (baseKind === 'dark') baseKind = 'auto';
let tSel = null;
const isDark = () => document.documentElement.dataset.theme === 'dark';

const MODES = {
  photo: { label: 'Light', icon: 'sun', ends: ['gloom', 'good light'], legend: () => 'linear-gradient(90deg,rgba(70,78,88,.75),rgba(125,133,142,.5),rgba(255,214,102,.6),rgba(255,190,30,.85))' },
  low: { label: 'Fog', icon: 'fogsea', ends: ['clear', 'fog, low cloud'], legend: () => (isDark() ? 'linear-gradient(90deg,rgba(255,255,255,0),#fff)' : 'linear-gradient(90deg,rgba(70,82,98,0),rgb(70,82,98))') },
  cloud: { label: 'Cloud', icon: 'cloud', ends: ['clear', 'overcast'], legend: () => (isDark() ? 'linear-gradient(90deg,rgba(215,222,232,0),rgb(215,222,232))' : 'linear-gradient(90deg,rgba(90,100,114,0),rgb(90,100,114))') },
  precip: { label: 'Rain, snow', icon: 'drop', ends: ['dry', 'heavy'], legend: () => 'linear-gradient(90deg,rgba(47,127,208,0),#2f7fd0,#8a5fd8)' },
};

export function renderMap(root) {
  if (!map) build(root);
  else { map.invalidateSize(); update(); }
}

function build(root) {
  root.innerHTML = `<div id="map"></div>
    <div class="map-ui map-top">
      <div class="chips">${Object.entries(MODES).map(([k, m]) => `<button class="mapbtn" data-mode="${k}" aria-pressed="${k === mode}">${icon(m.icon)}${m.label}</button>`).join('')}</div>
    </div>
    <div class="map-side">
      <button class="mapbtn" data-layers aria-label="Layers" title="Layers">${icon('layers')}</button>
      <button class="mapbtn" data-locate aria-label="Where I am" title="Where I am">${icon('locate')}</button>
    </div>
    <div class="layers-panel" hidden>
      <div class="eyebrow">Base map</div>
      ${[['auto', 'Map'], ['color', 'National map in colour'], ['sat', 'Aerial photo']].map(([k, l]) => `<label><input type="radio" name="base" value="${k}" ${k === baseKind ? 'checked' : ''}>${l}</label>`).join('')}
      <div class="eyebrow">Live from MeteoSwiss stations</div>
      ${[['', 'None'], ['wind', 'Wind'], ['rh', 'Humidity'], ['temp', 'Temperature'], ['fresh', 'Fresh snow, 24 h'], ['snow', 'Snow depth'], ['foehn', 'Foehn'], ['sun', 'Sunshine now']].map(([k, l]) => `<label><input type="radio" name="live" value="${k}" ${k === liveKind ? 'checked' : ''}>${l}</label>`).join('')}
      <div class="eyebrow">More</div>
      <label><input type="checkbox" name="cams" ${showCams ? 'checked' : ''}>MeteoSwiss webcams</label>
      <label><input type="checkbox" name="lights" ${showLights ? 'checked' : ''}>Night lights (light pollution)</label>
      <div class="eyebrow">Wildlife areas</div>
      ${Object.entries(WILD_LAYERS).map(([k, [, l]]) => `<label><input type="checkbox" name="wild" value="${k}" ${wildOn[k] ? 'checked' : ''}>${l}</label>`).join('')}
      <p class="tiny faint mt8">Long-press the map to add a spot there. Tap a spot for the directions of sunrise and sunset.</p>
    </div>
    <div class="map-ui map-bottom">
      <div class="row sp"><div><b class="num" id="tlabel" style="font-size:22px">Now</b> <span class="small muted" id="tday"></span></div>
        <span class="btns gap6"><button class="btn small quiet" data-jump="now">Now</button><button class="btn small quiet" data-jump="sunrise">${icon('sunrise')}</button><button class="btn small quiet" data-jump="sunset">${icon('sunset')}</button></span></div>
      <input type="range" id="tslider" min="0" max="119" step="1" value="0" aria-label="Forecast hour">
      <div class="map-legend"><span id="lg0"></span><div class="grad" id="lgrad"></div><span id="lg1"></span></div>
    </div>`;

  map = L.map(root.querySelector('#map'), { zoomControl: false, attributionControl: true, minZoom: 7, maxZoom: 17, maxBounds: [[45.2, 4.9], [48.4, 11.6]], tapHold: true })
    .setView([46.8, 8.23], window.innerWidth < 500 ? 7 : 8);
  map.attributionControl.setPrefix('');
  map.attributionControl.addAttribution('© <a href="https://www.swisstopo.admin.ch" target="_blank">swisstopo</a> · forecast MeteoSwiss');
  setBase(baseKind);
  lines = L.layerGroup().addTo(map);
  pins = L.layerGroup().addTo(map);
  liveLayer = L.layerGroup().addTo(map);
  camLayer = L.layerGroup().addTo(map);

  const panel = root.querySelector('.layers-panel');
  root.querySelector('[data-layers]').addEventListener('click', (e) => { panel.hidden = !panel.hidden; e.currentTarget.setAttribute('aria-pressed', !panel.hidden); });
  root.querySelector('[data-locate]').addEventListener('click', () => { if (App.me) map.setView([App.me.lat, App.me.lon], Math.max(map.getZoom(), 10)); App.emit('locate', true); });
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode; setJSON('lb.mapMode', mode);
    root.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.mode === mode));
    drawHeat();
  }));
  panel.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'base') { baseKind = t.value; setJSON('lb.mapBase', baseKind); setBase(baseKind); }
    if (t.name === 'live') { liveKind = t.value; setJSON('lb.mapLive', liveKind); drawLive(); }
    if (t.name === 'cams') { showCams = t.checked; setJSON('lb.mapCams', showCams); drawCams(); }
    if (t.name === 'lights') { showLights = t.checked; setJSON('lb.mapLights', showLights); drawLights(); }
    if (t.name === 'wild') { wildOn = { ...wildOn, [t.value]: t.checked }; setJSON('lb.mapWild', wildOn); drawWild(); }
  });
  const slider = root.querySelector('#tslider');
  slider.addEventListener('input', () => { tSel = hourStart() + +slider.value * H; drawTime(); });
  root.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
    const now = Date.now(), c = { lat: 46.8, lon: 8.2, elev: 500 };
    let t = now;
    if (b.dataset.jump !== 'now') {
      for (let d = 0; d < 3; d++) {
        const ev = dayEvents(new Date(now + d * 864e5), c), x = b.dataset.jump === 'sunset' ? ev.sunset : ev.sunrise;
        if (x && x.getTime() > Math.max(now, tSel || 0) - 30 * 60e3 + (Math.abs((tSel || 0) - x.getTime()) < 40 * 60e3 ? H : 0)) { t = x.getTime(); break; }
      }
    }
    slider.value = Math.max(0, Math.round((t - hourStart()) / H));
    tSel = hourStart() + +slider.value * H; drawTime();
  }));
  map.on('contextmenu', (e) => {
    const p = e.latlng;
    L.popup().setLatLng(p).setContent(`<b>New spot here?</b><br><span class="small muted tnum">${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</span><br><button class="btn small primary mt8" id="addhere">${icon('plus')}Add spot</button>`).openOn(map);
    setTimeout(() => document.getElementById('addhere')?.addEventListener('click', () => { map.closePopup(); addSpotAt(p.lat, p.lng); }), 0);
  });
  App.on('ops', () => { if (map) update(); });
  App.on('spots', () => { if (map) drawPins(); });
  App.on('me', () => drawMe());
  map.on('zoomend', () => { if (lineSpot) drawLines(lineSpot); });
  document.addEventListener('lb-theme', () => { if (map) { drawHeat(); if (lineSpot) drawLines(lineSpot); } });
  setTimeout(() => { map.invalidateSize(); update(); drawLive(); drawCams(); drawLights(); drawWild(); drawMe(); }, 50);
}

const hourStart = () => Math.floor(Date.now() / H) * H;

function setBase(kind) {
  if (base) map.removeLayer(base);
  const opts = { maxZoom: 18, maxNativeZoom: kind === 'sat' ? 19 : 17, bounds: [[45.4, 5.4], [48.3, 11.2]], className: kind === 'auto' ? 'tiles-auto' : '' };
  base = L.tileLayer(kind === 'sat' ? WMTS('ch.swisstopo.swissimage') : WMTS(kind === 'auto' ? 'ch.swisstopo.pixelkarte-grau' : 'ch.swisstopo.pixelkarte-farbe'), opts).addTo(map);
  base.bringToBack();
}

function update() {
  if (tSel == null) tSel = hourStart();
  const s = document.getElementById('tslider');
  if (s && App.grid && App.grid.series[0]) s.max = Math.max(24, Math.round((App.grid.series[0].t[App.grid.series[0].t.length - 1] - hourStart()) / H) - 1);
  drawTime();
}
function drawTime() {
  const d = new Date(tSel), now = Math.abs(tSel - hourStart()) < H;
  const lab = document.getElementById('tlabel'), day = document.getElementById('tday');
  if (lab) lab.textContent = now ? hhmm(new Date()) : hhmm(d);
  if (day) day.textContent = now ? 'now' : `${weekday(d)} ${zurichParts(d).d}`;
  drawHeat(); drawPins(); if (lineSpot) drawLines(lineSpot);
}

// ---- the forecast grid as a smooth image, cut to the border ----
function colourFor(v) {
  if (mode === 'photo') {
    const stops = [[0, [70, 78, 88, 190]], [45, [125, 133, 142, 125]], [70, [255, 214, 102, 135]], [92, [255, 190, 30, 205]]];
    let i = 0; while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
    const [a, ca] = stops[i], [b, cb] = stops[i + 1], f = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return ca.map((x, k) => Math.round(x + (cb[k] - x) * f));
  }
  const dark = isDark(), p = Math.min(1, v / 100);
  if (mode === 'low') return dark ? [255, 255, 255, Math.round(p * 220)] : [70, 82, 98, Math.round(p * 200)];
  if (mode === 'cloud') return dark ? [215, 222, 232, Math.round(p * 200)] : [90, 100, 114, Math.round(p * 175)];
  const q = Math.min(1, v / 4);
  return v < 0.05 ? [0, 0, 0, 0] : [Math.round(47 + 91 * q), Math.round(127 - 32 * q), Math.round(208 + 8 * q), Math.round(90 + 150 * q)];
}
function drawHeat() {
  if (heat) { map.removeLayer(heat); heat = null; }
  const m = MODES[mode];
  document.getElementById('lgrad').style.background = m.legend();
  document.getElementById('lg0').textContent = m.ends[0]; document.getElementById('lg1').textContent = m.ends[1];
  if (!App.grid) return;
  const { cells, series } = App.grid;
  const lat0 = 45.86, dLat = 0.16, lon0 = 6.0, dLon = 0.22;
  const rows = Math.round((47.8 - lat0) / dLat) + 1, cols = Math.round((10.5 - lon0) / dLon) + 1;
  const small = document.createElement('canvas'); small.width = cols; small.height = rows;
  const sctx = small.getContext('2d'), img = sctx.createImageData(cols, rows);
  const grid = new Array(rows * cols).fill(null);
  cells.forEach((c, i) => {
    const r = Math.round((c.lat - lat0) / dLat), k = Math.round((c.lon - lon0) / dLon), s = series[i];
    if (!s) return;
    const v = mode === 'photo' ? photoWeatherAt(s, tSel) : mode === 'low' ? val(s, 'low', tSel) : mode === 'cloud' ? val(s, 'cloud', tSel) : val(s, 'precip', tSel + H);
    if (v != null) grid[(rows - 1 - r) * cols + k] = v;
  });
  for (let pass = 0; pass < 3; pass++) { // grow into empty cells so the clipped edge keeps its colour
    const copy = grid.slice();
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      if (copy[r * cols + k] != null) continue;
      const nb = [[r - 1, k], [r + 1, k], [r, k - 1], [r, k + 1]].map(([a, b]) => (a >= 0 && a < rows && b >= 0 && b < cols ? copy[a * cols + b] : null)).filter((x) => x != null);
      if (nb.length) grid[r * cols + k] = nb.reduce((a, b) => a + b, 0) / nb.length;
    }
  }
  grid.forEach((v, i) => { img.data.set(v == null ? [0, 0, 0, 0] : colourFor(v), i * 4); });
  sctx.putImageData(img, 0, 0);
  const south = lat0 - dLat / 2, north = lat0 + (rows - 0.5) * dLat, west = lon0 - dLon / 2, east = lon0 + (cols - 0.5) * dLon;
  const W = 900, Hh = Math.round(W * 0.68);
  const big = document.createElement('canvas'); big.width = W; big.height = Hh;
  const b = big.getContext('2d');
  b.imageSmoothingEnabled = true; b.imageSmoothingQuality = 'high';
  b.drawImage(small, 0, 0, W, Hh);
  const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const yN = merc(north), yS = merc(south);
  b.globalCompositeOperation = 'destination-in';
  b.beginPath();
  CH_OUTLINE.forEach(([lon, lat], i) => { const X = ((lon - west) / (east - west)) * W, Y = ((yN - merc(lat)) / (yN - yS)) * Hh; i ? b.lineTo(X, Y) : b.moveTo(X, Y); });
  b.closePath(); b.fill();
  b.globalCompositeOperation = 'source-over';
  b.strokeStyle = isDark() ? 'rgba(255,255,255,0.55)' : 'rgba(16,18,20,0.75)'; b.lineWidth = 1.4; b.stroke();
  heat = L.imageOverlay(big.toDataURL(), [[south, west], [north, east]], { opacity: 1, interactive: false }).addTo(map);
}

// ---- spots, marked by their chance at the chosen hour ----
function drawPins() {
  pins.clearLayers();
  const t = tSel ?? Date.now();
  for (const s of App.spots) {
    const o = bestFor(s.id, t - 1.5 * H, t + 1.5 * H), cls = o ? scoreClass(o.score) : 's1';
    const ic = L.divIcon({ className: '', html: `<div class="pin ${cls} ${s.mine ? 'mine' : ''}">${o && o.score >= 45 ? icon(iconOf(o)) : ''}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
    const m = L.marker([s.lat, s.lon], { icon: ic, title: s.name, zIndexOffset: o ? o.score * 10 : 0 }).addTo(pins);
    const ph = s.photos?.[0];
    m.bindPopup(() => `<div style="width:210px">${ph ? `<img src="${esc(photoUrl(ph, 330))}" style="width:100%;display:block;margin-bottom:8px;border-radius:2px" alt="">` : ''}
      <div class="row sp" style="align-items:flex-start"><div><b style="font-size:15px">${esc(s.name)}</b><div class="small muted">${s.elev ? `<span class="peak tnum">${Math.round(s.elev)} m</span>` : ''}</div></div>${o ? plate(o.score) : ''}</div>
      ${o ? `<div class="small mt4">${icon(iconOf(o))} ${esc(o.title)}</div>` : '<div class="small muted mt4">Nothing special at this hour.</div>'}
      <div class="btns mt8"><button class="btn small primary" data-open="${esc(s.id)}" style="flex:1">Open</button><button class="btn small" data-lines="${esc(s.id)}" aria-pressed="${lineSpot === s.id}" title="Directions of sunrise, sunset and moon">${icon('compass')}${lineSpot === s.id ? 'Hide lines' : 'Sun lines'}</button></div></div>`, { autoPanPaddingTopLeft: [12, 110], autoPanPaddingBottomRight: [12, 150] });
    m.on('popupopen', (e) => {
      const el = e.popup.getElement();
      el.querySelector('[data-open]')?.addEventListener('click', () => { map.closePopup(); openSpot(s.id); });
      el.querySelector('[data-lines]')?.addEventListener('click', () => { lineSpot = lineSpot === s.id ? null : s.id; drawLines(lineSpot); map.closePopup(); if (lineSpot) { map.setView([s.lat, s.lon], Math.max(map.getZoom(), 12)); toast('Yellow: sunrise. Red: sunset. Dashed: the moon.'); } });
    });
  }
}

// ---- from one spot: where the sun rises and sets, the moon, and the sun at the chosen hour ----
function drawLines(id) {
  lines.clearLayers();
  const s = id && spotById(id);
  if (!s) return;
  const ev = dayEvents(new Date(tSel ?? Date.now()), s);
  const len = 120 * ((156543 * Math.cos((s.lat * Math.PI) / 180)) / 2 ** map.getZoom()); // about 120 px on screen at any zoom
  const ray = (az, color, dash, label) => {
    if (az == null) return;
    const end = destination(s, az, len);
    L.polyline([[s.lat, s.lon], [end.lat, end.lon]], { color, weight: 3, dashArray: dash || null, opacity: 0.95 }).addTo(lines);
    L.marker([end.lat, end.lon], { icon: L.divIcon({ className: '', html: `<span class="stationlabel raylabel">${esc(label)}</span>`, iconSize: null }), interactive: false }).addTo(lines);
  };
  ray(ev.sunriseAz, '#f2b01e', null, `sunrise ${hhmm(ev.sunrise)} ${compass(ev.sunriseAz ?? 0)}`);
  ray(ev.sunsetAz, '#e0251b', null, `sunset ${hhmm(ev.sunset)} ${compass(ev.sunsetAz ?? 0)}`);
  ray(ev.moonriseAz, '#6f777e', '6 6', `moonrise ${hhmm(ev.moonrise)}`);
  ray(ev.moonsetAz, '#6f777e', '2 6', `moonset ${hhmm(ev.moonset)}`);
  const sun = sunAt(new Date(tSel ?? Date.now()), s);
  if (sun.alt > 0) { const end = destination(s, sun.az, len * 0.6); L.polyline([[s.lat, s.lon], [end.lat, end.lon]], { color: isDark() ? '#fff' : '#101214', weight: 1.5 }).addTo(lines); L.marker([end.lat, end.lon], { icon: L.divIcon({ className: '', html: `<span class="stationlabel raylabel">sun now, ${Math.round(sun.alt)}° high</span>`, iconSize: null }), interactive: false }).addTo(lines); }
}

async function drawLive() {
  liveLayer.clearLayers();
  if (!liveKind) return;
  try {
    const data = await live(liveKind);
    if (liveKind !== getJSON('lb.mapLive', '')) return;
    for (const s of data) {
      let txt = `${(+s.value).toFixed(liveKind === 'temp' ? 1 : 0)}${LIVE[liveKind].unit === '%' ? '%' : LIVE[liveKind].unit === '°C' ? '°' : ''}`;
      if (liveKind === 'foehn') { if (+s.value === 0) continue; txt = +s.value === 2 ? 'Foehn' : 'mix'; }
      if ((liveKind === 'fresh' || liveKind === 'snow') && +s.value === 0) continue;
      if (liveKind === 'fresh' || liveKind === 'snow') txt += ' cm';
      if (liveKind === 'sun') txt = `${Math.round(s.value)}′`;
      let html = `<span class="stationlabel">${esc(txt)}</span>`;
      if (liveKind === 'wind' && s.dir != null) html = `<span class="stationlabel"><span style="display:inline-block;transform:rotate(${(s.dir + 180) % 360}deg)">↑</span> ${esc(txt)}</span>`;
      L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html, iconSize: null }), interactive: true, keyboard: false })
        .bindTooltip(`${esc(s.name)}, ${Math.round(s.alt)} m · ${esc(LIVE[liveKind].label)}`).addTo(liveLayer);
    }
  } catch { toast('Live data not available'); }
}

async function drawCams() {
  camLayer.clearLayers();
  if (!showCams) return;
  try {
    for (const c of await webcams()) {
      L.marker([c.lat, c.lon], { icon: L.divIcon({ className: '', html: `<div class="pin cam">${icon('video')}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] }) })
        .bindPopup(`<div style="width:220px"><b>${esc(c.name)}</b><div class="small muted"><span class="peak tnum">${Math.round(c.alt)} m</span> · MeteoSwiss camera</div>${c.thumb ? `<a href="${esc(c.page)}" target="_blank" rel="noopener"><img src="${esc(c.thumb)}" style="width:100%;margin-top:8px;display:block" alt="Webcam"></a>` : ''}<a href="${esc(c.page)}" target="_blank" rel="noopener" class="small">Open at MeteoSwiss</a></div>`).addTo(camLayer);
    }
  } catch { toast('Webcams not available'); }
}

function drawLights() {
  if (lights) { map.removeLayer(lights); lights = null; }
  if (!showLights) return;
  lights = L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    { maxNativeZoom: 8, maxZoom: 17, opacity: 0.85, attribution: 'night lights NASA Black Marble 2016', className: 'tiles-lights' }).addTo(map);
}

function drawWild() {
  for (const [k, [layer]] of Object.entries(WILD_LAYERS)) {
    if (!map.getPane('wild')) map.createPane('wild').style.zIndex = 450; // above the forecast layer
    if (wildOn[k] && !wildTiles[k]) wildTiles[k] = L.tileLayer(WMTS(layer, 'png'), { pane: 'wild', maxZoom: 18, maxNativeZoom: 17, opacity: 0.8, attribution: 'wildlife areas FOEN' }).addTo(map);
    if (!wildOn[k] && wildTiles[k]) { map.removeLayer(wildTiles[k]); delete wildTiles[k]; }
  }
}

function drawMe() {
  if (!map || !App.me) return;
  if (meMarker) map.removeLayer(meMarker);
  meMarker = L.circleMarker([App.me.lat, App.me.lon], { radius: 7, color: '#fff', weight: 2.5, fillColor: '#e0251b', fillOpacity: 1 }).addTo(map).bindTooltip('You are here');
}

export function focusSpot(id) {
  const s = spotById(id);
  if (map && s) map.setView([s.lat, s.lon], 12);
}
