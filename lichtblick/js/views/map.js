// The map: where the photo weather is good at a chosen hour (MeteoSwiss forecast over a grid of
// Switzerland), the spots coloured by their chances then, and live layers: wind, humidity, fresh snow,
// foehn from MeteoSwiss stations, MeteoSwiss webcams, and night lights (light pollution, NASA).
import { App, bestFor, spotById } from '../app.js';
import { CH_OUTLINE } from '../../data/ch-outline.js';
import { photoWeatherAt, val, TYPES, scoreClass } from '../scoring.js';
import { live, webcams, LIVE } from '../sources/meteoswiss.js';
import { WMTS } from '../sources/swisstopo.js';
import { dayEvents, hhmm, weekday } from '../astro.js';
import { esc, toast, photoUrl } from '../ui.js';
import { openSpot } from './spot.js';
import { addSpotAt } from './spots.js';
import { getJSON, setJSON } from '../store.js';

const H = 3600e3;
let map = null, heat = null, pins = null, liveLayer = null, camLayer = null, lights = null, base = null, meMarker = null;
let mode = getJSON('lb.mapMode', 'photo');
let liveKind = getJSON('lb.mapLive', '');
let showCams = getJSON('lb.mapCams', false), showLights = getJSON('lb.mapLights', false);
const WILD_LAYERS = { game: ['ch.bafu.bundesinventare-jagdbanngebiete', 'Federal game reserves (ibex, chamois, deer)'], birds: ['ch.bafu.bundesinventare-vogelreservate', 'Water & migratory bird reserves'], rest: ['ch.bafu.wrz-wildruhezonen_portal', 'Wildlife rest zones (winter rules)'] };
let wildOn = getJSON('lb.mapWild', {});
const wildTiles = {};
let baseKind = getJSON('lb.mapBase', 'dark');
let tSel = null;

const MODES = {
  photo: { label: 'Photo weather', legend: 'linear-gradient(90deg,#27324d,#4f7cc4,#6fdc8c,#ffcf5c)', ends: ['grey', 'great'] },
  low: { label: 'Fog & low cloud', legend: 'linear-gradient(90deg,rgba(255,255,255,0),#ffffff)', ends: ['clear', 'fog/low cloud'] },
  cloud: { label: 'All clouds', legend: 'linear-gradient(90deg,rgba(255,255,255,0),#c8d4ee)', ends: ['clear', 'overcast'] },
  precip: { label: 'Rain & snow', legend: 'linear-gradient(90deg,rgba(80,160,255,0),#4fa8ff,#b388ff)', ends: ['dry', 'heavy'] },
};

export function renderMap(root) {
  if (!map) build(root);
  else { map.invalidateSize(); update(); }
}

function build(root) {
  root.innerHTML = `<div id="map"></div>
    <div class="map-ui map-top">
      <div class="chips" style="flex:1;padding:0">${Object.entries(MODES).map(([k, m]) => `<button class="mapbtn" data-mode="${k}" aria-pressed="${k === mode}">${m.label}</button>`).join('')}</div>
      <button class="mapbtn" data-layers>Layers</button>
    </div>
    <div class="layers-panel" hidden>
      <h4>Base map</h4>
      ${[['dark', 'Night map'], ['color', 'National map'], ['sat', 'Aerial (SWISSIMAGE)']].map(([k, l]) => `<label><input type="radio" name="base" value="${k}" ${k === baseKind ? 'checked' : ''}>${l}</label>`).join('')}
      <h4>Live MeteoSwiss</h4>
      ${[['', 'None'], ['wind', 'Wind'], ['rh', 'Humidity'], ['temp', 'Temperature'], ['fresh', 'Fresh snow (24 h)'], ['snow', 'Snow depth'], ['foehn', 'Foehn'], ['sun', 'Sunshine now']].map(([k, l]) => `<label><input type="radio" name="live" value="${k}" ${k === liveKind ? 'checked' : ''}>${l}</label>`).join('')}
      <h4>More</h4>
      <label><input type="checkbox" name="cams" ${showCams ? 'checked' : ''}>MeteoSwiss webcams</label>
      <label><input type="checkbox" name="lights" ${showLights ? 'checked' : ''}>Night lights (light pollution)</label>
      <h4>Wildlife (swisstopo / FOEN)</h4>
      ${Object.entries(WILD_LAYERS).map(([k, [, l]]) => `<label><input type="checkbox" name="wild" value="${k}" ${wildOn[k] ? 'checked' : ''}>${l}</label>`).join('')}
      <p class="tiny faint" style="margin:6px 0 4px">Long-press the map to add a spot.</p>
    </div>
    <div class="map-ui map-bottom">
      <div class="row sp"><b id="tlabel">Now</b><span class="btns"><button class="btn small" data-jump="now">Now</button><button class="btn small" data-jump="sunset">Sunset</button><button class="btn small" data-jump="sunrise">Sunrise</button></span></div>
      <input type="range" id="tslider" min="0" max="119" step="1" value="0" aria-label="Forecast hour">
      <div class="map-legend"><span id="lg0"></span><div class="grad" id="lgrad"></div><span id="lg1"></span></div>
    </div>`;

  map = L.map(root.querySelector('#map'), { zoomControl: false, attributionControl: true, minZoom: 7, maxZoom: 17, maxBounds: [[45.2, 4.9], [48.4, 11.6]], tapHold: true })
    .setView([46.8, 8.23], window.innerWidth < 500 ? 7 : 8);
  map.attributionControl.setPrefix('');
  map.attributionControl.addAttribution('© <a href="https://www.swisstopo.admin.ch" target="_blank">swisstopo</a> · forecast MeteoSwiss');
  setBase(baseKind);
  pins = L.layerGroup().addTo(map);
  liveLayer = L.layerGroup().addTo(map);
  camLayer = L.layerGroup().addTo(map);

  const panel = root.querySelector('.layers-panel');
  root.querySelector('[data-layers]').addEventListener('click', () => { panel.hidden = !panel.hidden; });
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
        if (x && x.getTime() > now - 30 * 60e3) { t = x.getTime(); break; }
      }
    }
    slider.value = Math.max(0, Math.round((t - hourStart()) / H));
    tSel = hourStart() + +slider.value * H; drawTime();
  }));
  map.on('contextmenu', (e) => {
    const p = e.latlng;
    L.popup().setLatLng(p).setContent(`<b>New spot here?</b><br><span class="small muted">${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</span><br><button class="btn small primary" style="margin-top:8px" id="addhere">Add spot</button>`).openOn(map);
    setTimeout(() => document.getElementById('addhere')?.addEventListener('click', () => { map.closePopup(); addSpotAt(p.lat, p.lng); }), 0);
  });
  App.on('ops', () => { if (map) update(); });
  App.on('spots', () => { if (map) drawPins(); });
  App.on('me', () => drawMe());
  setTimeout(() => { map.invalidateSize(); update(); drawLive(); drawCams(); drawLights(); drawWild(); drawMe(); }, 50);
}

const hourStart = () => Math.floor(Date.now() / H) * H;

function setBase(kind) {
  if (base) map.removeLayer(base);
  const opts = { maxZoom: 18, maxNativeZoom: kind === 'sat' ? 19 : 17, bounds: [[45.4, 5.4], [48.3, 11.2]], className: kind === 'dark' ? 'tiles-dark' : '' };
  base = L.tileLayer(kind === 'sat' ? WMTS('ch.swisstopo.swissimage') : WMTS(kind === 'dark' ? 'ch.swisstopo.pixelkarte-grau' : 'ch.swisstopo.pixelkarte-farbe'), opts).addTo(map);
  base.bringToBack();
  document.getElementById('map').classList.toggle('dark', kind === 'dark');
}

function update() { if (tSel == null) tSel = hourStart(); drawTime(); }
function drawTime() {
  const d = new Date(tSel);
  const lab = document.getElementById('tlabel');
  if (lab) lab.textContent = Math.abs(tSel - hourStart()) < H ? `Now · ${hhmm(new Date())}` : `${weekday(d)} ${hhmm(d)}`;
  drawHeat(); drawPins();
}

// ---- the forecast grid as a smooth, clipped image ----
function colourFor(v) {
  if (mode === 'photo') {
    const stops = [[0, [39, 50, 77]], [45, [79, 124, 196]], [72, [111, 220, 140]], [92, [255, 207, 92]]];
    let i = 0; while (i < stops.length - 2 && v > stops[i + 1][0]) i++;
    const [a, ca] = stops[i], [b, cb] = stops[i + 1], f = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return [...ca.map((x, k) => Math.round(x + (cb[k] - x) * f)), 150];
  }
  if (mode === 'low') return [255, 255, 255, Math.round(Math.min(1, v / 100) * 215)];
  if (mode === 'cloud') return [200, 212, 238, Math.round(Math.min(1, v / 100) * 200)];
  const p = Math.min(1, v / 4);
  return v < 0.05 ? [0, 0, 0, 0] : [Math.round(79 + 100 * p), Math.round(168 - 32 * p), 255, Math.round(80 + 150 * p)];
}
function drawHeat() {
  if (heat) { map.removeLayer(heat); heat = null; }
  const m = MODES[mode];
  document.getElementById('lgrad').style.background = m.legend;
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
  // grow values into empty cells so the clipped edges keep their colour
  for (let pass = 0; pass < 3; pass++) {
    const copy = grid.slice();
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      if (copy[r * cols + k] != null) continue;
      const nb = [[r - 1, k], [r + 1, k], [r, k - 1], [r, k + 1]].map(([a, b]) => (a >= 0 && a < rows && b >= 0 && b < cols ? copy[a * cols + b] : null)).filter((x) => x != null);
      if (nb.length) grid[r * cols + k] = nb.reduce((a, b) => a + b, 0) / nb.length;
    }
  }
  grid.forEach((v, i) => { const c = v == null ? [0, 0, 0, 0] : colourFor(v); img.data.set(c, i * 4); });
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
  b.strokeStyle = 'rgba(255,255,255,0.35)'; b.lineWidth = 1.2; b.stroke();
  heat = L.imageOverlay(big.toDataURL(), [[south, west], [north, east]], { opacity: 1, interactive: false }).addTo(map);
}

// ---- spot pins coloured by their chances at the chosen time ----
function drawPins() {
  pins.clearLayers();
  const t = tSel ?? Date.now();
  for (const s of App.spots) {
    const o = bestFor(s.id, t - 1.5 * H, t + 1.5 * H);
    const cls = o ? scoreClass(o.score) : 's1';
    const colour = { s5: 'var(--s5)', s4: 'var(--s4)', s3: 'var(--s3)', s2: 'var(--s2)', s1: '#2a3550' }[cls];
    const icon = L.divIcon({ className: '', html: `<div class="pin ${s.mine ? 'mine' : ''}" style="background:${colour}">${o ? o.icon || TYPES[o.type].icon : ''}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
    const m = L.marker([s.lat, s.lon], { icon, title: s.name, zIndexOffset: o ? o.score * 10 : 0 }).addTo(pins);
    const ph = s.photos?.[0];
    m.bindPopup(`<div style="width:200px">${ph ? `<img src="${esc(photoUrl(ph, 330))}" style="width:100%;border-radius:10px;display:block;margin-bottom:6px" alt="">` : ''}
      <b>${esc(s.name)}</b><div class="small muted">${s.elev ? Math.round(s.elev) + ' m' : ''}</div>
      ${o ? `<div style="margin-top:4px">${o.icon || TYPES[o.type].icon} ${esc(o.title)} <span class="score ${cls}" style="height:20px;min-width:30px">${o.score}</span></div>` : '<div class="small muted">Nothing special at this hour</div>'}
      <button class="btn small primary" style="margin-top:8px;width:100%" data-open="${esc(s.id)}">Open</button></div>`);
    m.on('popupopen', (e) => { e.popup.getElement().querySelector('[data-open]')?.addEventListener('click', () => { map.closePopup(); openSpot(s.id); }); });
  }
}

async function drawLive() {
  liveLayer.clearLayers();
  if (!liveKind) return;
  try {
    const data = await live(liveKind);
    if (liveKind !== (getJSON('lb.mapLive', ''))) return;
    for (const s of data) {
      let txt = `${(+s.value).toFixed(liveKind === 'temp' ? 1 : 0)}${LIVE[liveKind].unit === '%' ? '%' : LIVE[liveKind].unit === '°C' ? '°' : ''}`;
      if (liveKind === 'foehn') { if (+s.value === 0) continue; txt = +s.value === 2 ? 'Foehn' : 'mix'; }
      if ((liveKind === 'fresh' || liveKind === 'snow') && +s.value === 0) continue;
      if (liveKind === 'fresh' || liveKind === 'snow') txt += ' cm';
      if (liveKind === 'sun') txt = `${Math.round(s.value)}′`;
      let html = `<span class="stationlabel">${esc(txt)}</span>`;
      if (liveKind === 'wind' && s.dir != null) html = `<span class="stationlabel"><span style="display:inline-block;transform:rotate(${(s.dir + 180) % 360}deg)">↑</span> ${esc(txt)}</span>`;
      L.marker([s.lat, s.lon], { icon: L.divIcon({ className: '', html, iconSize: null }), interactive: true, keyboard: false })
        .bindTooltip(`${esc(s.name)} (${Math.round(s.alt)} m) · ${esc(LIVE[liveKind].label)}`).addTo(liveLayer);
    }
  } catch (e) { toast('Live data not available'); }
}

async function drawCams() {
  camLayer.clearLayers();
  if (!showCams) return;
  try {
    for (const c of await webcams()) {
      L.marker([c.lat, c.lon], { icon: L.divIcon({ className: '', html: '<div class="pin" style="background:#1a2640;width:26px;height:26px;font-size:13px">📷</div>', iconSize: [26, 26], iconAnchor: [13, 13] }) })
        .bindPopup(`<div style="width:220px"><b>${esc(c.name)}</b><div class="small muted">${Math.round(c.alt)} m · MeteoSwiss</div>${c.thumb ? `<a href="${esc(c.page)}" target="_blank" rel="noopener"><img src="${esc(c.thumb)}" style="width:100%;border-radius:8px;margin-top:6px" alt="Webcam"></a>` : ''}<a href="${esc(c.page)}" target="_blank" rel="noopener" class="small">Open at MeteoSwiss ↗</a></div>`).addTo(camLayer);
    }
  } catch { toast('Webcams not available'); }
}

function drawLights() {
  if (lights) { map.removeLayer(lights); lights = null; }
  if (!showLights) return;
  lights = L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png',
    { maxNativeZoom: 8, maxZoom: 17, opacity: 0.85, attribution: 'Night lights: NASA Black Marble 2016', className: 'tiles-lights' }).addTo(map);
}

function drawWild() {
  for (const [k, [layer, label]] of Object.entries(WILD_LAYERS)) {
    if (!map.getPane('wild')) map.createPane('wild').style.zIndex = 450; // above the forecast layer
    if (wildOn[k] && !wildTiles[k]) wildTiles[k] = L.tileLayer(WMTS(layer, 'png'), { pane: 'wild', maxZoom: 18, maxNativeZoom: 17, opacity: 0.8, attribution: 'wildlife areas FOEN' }).addTo(map);
    if (!wildOn[k] && wildTiles[k]) { map.removeLayer(wildTiles[k]); delete wildTiles[k]; }
  }
}

function drawMe() {
  if (!map || !App.me) return;
  if (meMarker) map.removeLayer(meMarker);
  meMarker = L.circleMarker([App.me.lat, App.me.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#4fa8ff', fillOpacity: 1 }).addTo(map).bindTooltip('You');
}

export function focusSpot(id) {
  const s = spotById(id);
  if (map && s) map.setView([s.lat, s.lon], 12);
}
