// The spots: the curated collection and your own. Add a spot by searching swisstopo, from where you
// stand, by long-pressing the map, or from a photo that knows where it was taken.
import { App, bestFor, addMySpot, updateMySpot, loadSpots, refresh, spotById } from '../app.js';
import { TYPES, scoreClass } from '../scoring.js';
import { esc, photoUrl, openSheet, closeSheet, sheetHead, toast, debounce } from '../ui.js';
import { favourites, kvSet, settings } from '../store.js';
import { searchPlaces, height, horizonFor } from '../sources/swisstopo.js';
import { distance, fmtKm } from '../geo.js';
import { readExif, shrinkPhoto } from '../exif.js';
import { openSpot, TAG_LABELS } from './spot.js';
import { SPECIES } from '../../data/species.js';

let filter = '';
const EDITABLE_TAGS = ['lake', 'reflection', 'peaks', 'alpenglow', 'fogsea', 'mist', 'lowland', 'larch', 'beech', 'chestnut', 'vineyard', 'waterfall', 'river', 'glacier', 'darksky', 'city', 'lightning', 'frozen', 'snow', 'hoarfrost'];

export function renderSpots(root) {
  const fav = favourites();
  const q = filter.trim().toLowerCase();
  const match = (s) => !q || `${s.name} ${s.region || ''} ${(s.tags || []).map((t) => TAG_LABELS[t] || t).join(' ')}`.toLowerCase().includes(q);
  const sortKey = (s) => (App.me ? distance(App.me, s) : 0);
  const list = App.spots.filter(match);
  const favs = list.filter((s) => fav.has(s.id)).sort((a, b) => sortKey(a) - sortKey(b));
  const mine = list.filter((s) => s.mine && !fav.has(s.id));
  const curated = list.filter((s) => s.curated && !fav.has(s.id)).sort((a, b) => (App.me ? sortKey(a) - sortKey(b) : a.name.localeCompare(b.name)));
  const section = (title, arr) => (arr.length ? `<div class="day-head">${title} · ${arr.length}</div><div class="cards">${arr.map(row).join('')}</div>` : '');
  root.innerHTML = `<div class="wrap">
    <div class="hero-line"><h2>Spots</h2><button class="btn primary small" id="addspot">＋ Add a spot</button></div>
    <input type="search" id="spotq" placeholder="Search: lake, larches, Engadin, dark sky…" value="${esc(filter)}" autocomplete="off">
    ${section('★ Favourites', favs)}${section('Your spots', mine)}${section(App.me ? 'Curated, nearest first' : 'Curated', curated)}
    ${!list.length ? '<div class="empty">No spot matches.</div>' : ''}
    <p class="tiny faint" style="margin-top:20px">Curated photos from Wikimedia Commons; each spot shows the author and licence. Spot positions are where the photographer stood when the camera recorded it, otherwise the classic viewpoint.</p>
  </div>`;
  const qi = root.querySelector('#spotq');
  qi.addEventListener('input', debounce(() => { filter = qi.value; const pos = qi.selectionStart; renderSpots(root); const n = root.querySelector('#spotq'); n.focus(); n.setSelectionRange(pos, pos); }, 200));
  root.querySelector('#addspot').addEventListener('click', () => openAdd());
  root.querySelectorAll('[data-spot]').forEach((b) => b.addEventListener('click', () => openSpot(b.dataset.spot)));
}

function row(s) {
  const o = bestFor(s.id);
  const ph = s.photos?.[0];
  return `<button class="spotrow" data-spot="${esc(s.id)}">
    <div class="th" style="${ph ? `background-image:url('${esc(photoUrl(ph, 250))}')` : ''}">${ph ? '' : '📍'}</div>
    <div style="min-width:0"><div class="nm">${esc(s.name)}</div><div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.region || '')}${s.elev ? ` · ${Math.round(s.elev)} m` : ''}${App.me ? ` · ${fmtKm(distance(App.me, s))}` : ''}</div>
      ${o ? `<div class="small" style="margin-top:2px">${o.icon || TYPES[o.type].icon} ${esc(o.title)}</div>` : ''}</div>
    ${o ? `<span class="score ${scoreClass(o.score)}">${o.score}</span>` : '<span></span>'}</button>`;
}

// ---- adding ----
export function openAdd() {
  openSheet((root) => {
    root.innerHTML = `${sheetHead('Add a spot')}<div class="pad">
      <p class="small muted" style="margin-top:0">Pick a place. You can name it and say what it is good for next.</p>
      <input type="search" id="addq" placeholder="Search a place, peak or lake (swisstopo)" autocomplete="off">
      <div class="search-results" id="addres"></div>
      <div class="btns" style="margin-top:14px">
        <button class="btn" id="addgps">📍 Where I am</button>
        <label class="btn" style="position:relative;overflow:hidden">🖼️ From a photo<input type="file" accept="image/jpeg,image/*" id="addphoto" style="position:absolute;inset:0;opacity:0"></label>
        <button class="btn" id="addmap">🗺️ Long-press on the map</button>
      </div>
      <p class="tiny faint">From a photo: the app reads the GPS position (and compass direction) the camera stored. On iPhone, in the photo picker tap <i>Options</i> and keep <i>Location</i> on.</p>
    </div>`;
    const q = root.querySelector('#addq'), res = root.querySelector('#addres');
    q.addEventListener('input', debounce(async () => {
      if (q.value.trim().length < 2) { res.innerHTML = ''; return; }
      try {
        const hits = await searchPlaces(q.value);
        res.innerHTML = hits.map((h, i) => `<button data-hit="${i}"><b>${esc(h.name)}</b><div class="small muted">${esc([h.type, h.where].filter(Boolean).join(' · '))}</div></button>`).join('') || '<div class="small muted">Nothing found.</div>';
        res.querySelectorAll('[data-hit]').forEach((b) => b.addEventListener('click', () => { const h = hits[+b.dataset.hit]; editNew({ name: h.name, lat: h.lat, lon: h.lon }); }));
      } catch (e) { res.innerHTML = `<div class="small muted">Search not available (${esc(e.message)}).</div>`; }
    }, 300));
    root.querySelector('#addgps').addEventListener('click', () => {
      if (!navigator.geolocation) return toast('No location on this device');
      toast('Finding you…');
      navigator.geolocation.getCurrentPosition((p) => editNew({ name: 'My spot', lat: p.coords.latitude, lon: p.coords.longitude, elev: p.coords.altitude ?? undefined }),
        () => toast('Location not allowed'), { enableHighAccuracy: true, timeout: 15000 });
    });
    root.querySelector('#addmap').addEventListener('click', () => { closeSheet(); App.emit('goto', 'map'); toast('Long-press the map where the spot is'); });
    root.querySelector('#addphoto').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const ex = await readExif(f).catch(() => null);
      const shrunk = await shrinkPhoto(f).catch(() => null);
      if (!ex || ex.lat == null) {
        toast('This photo has no GPS position. Place it on the map or search instead.', 5000);
        if (shrunk) pendingPhoto = { ...shrunk, heading: null };
        return;
      }
      editNew({ name: (f.name || 'Photo spot').replace(/\.[a-z]+$/i, '').replace(/^IMG[_-]?/i, 'Photo '), lat: ex.lat, lon: ex.lon, elev: ex.alt, heading: ex.heading, taken: ex.taken }, shrunk);
    });
  });
}

let pendingPhoto = null;
export function addSpotAt(lat, lon) { editNew({ name: 'New spot', lat, lon }); }

function suggestTags(name, elev) {
  const t = new Set();
  if (/see|lac|lago|lai|lej|lägh|lagh|lake|weiher|teich/i.test(name)) { t.add('lake'); t.add('reflection'); }
  if (elev > 900 && elev < 2400) t.add('fogsea');
  if (elev >= 1500) { t.add('peaks'); t.add('darksky'); t.add('snow'); }
  if (elev < 700) t.add('lowland');
  if (/fall|chute|cascata|wasserfall/i.test(name)) t.add('waterfall');
  return [...t];
}

function editNew(base, photo = null) {
  const id = `my-${Date.now().toString(36)}`;
  const spot = { id, name: base.name, lat: base.lat, lon: base.lon, elev: Number.isFinite(base.elev) ? Math.round(base.elev) : null, tags: [], blurb: '', heading: base.heading ?? null, created: Date.now(), photos: [] };
  photo = photo || pendingPhoto; pendingPhoto = null;
  editor(spot, true, photo, base.taken);
}
export function editSpot(spot) { editor({ ...spot }, false, null); }

function editor(spot, isNew, photo, taken) {
  let photoBlob = photo;
  openSheet((root) => {
    root.innerHTML = `${sheetHead(isNew ? 'New spot' : 'Edit spot')}<div class="pad">
      ${photoBlob ? `<img src="${URL.createObjectURL(photoBlob.blob)}" style="width:100%;border-radius:14px;max-height:40vh;object-fit:cover" alt="">` : ''}
      <label class="field">Name<input type="text" id="ename" value="${esc(spot.name)}"></label>
      <div class="small muted" id="ewhere">${spot.lat.toFixed(5)}° N, ${spot.lon.toFixed(5)}° E · <span id="eelev">${spot.elev ? `${spot.elev} m` : 'height…'}</span>${spot.heading != null ? ` · camera looked ${Math.round(spot.heading)}°` : ''}${taken ? ` · photo taken ${esc(taken.slice(0, 10).replace(/:/g, '-'))}` : ''}</div>
      <label class="field">What is it good for? (drives the alerts)</label>
      <div class="tagpick" id="etags">${EDITABLE_TAGS.map((t) => `<label><input type="checkbox" value="${t}" ${spot.tags.includes(t) ? 'checked' : ''}>${esc(TAG_LABELS[t])}</label>`).join('')}</div>
      <label class="field">Wildlife here (for the Wildlife tab)</label>
      <div class="tagpick" id="especies">${Object.entries(SPECIES).filter(([k]) => k !== 'park').map(([k, sp]) => `<label><input type="checkbox" value="${k}" ${(spot.species || []).includes(k) ? 'checked' : ''}>${sp.icon} ${esc(sp.name)}</label>`).join('')}</div>
      <label class="field">Notes<textarea id="enote" rows="3" placeholder="Parking, best angle, what to bring…">${esc(spot.blurb || '')}</textarea></label>
      ${!photoBlob && isNew ? '<label class="btn small ghost" style="position:relative;overflow:hidden">Add a photo<input type="file" accept="image/*" id="ephoto" style="position:absolute;inset:0;opacity:0"></label>' : ''}
      <div class="btns" style="margin-top:14px"><button class="btn primary" id="esave">Save spot</button><button class="btn ghost" data-close>Cancel</button></div>
    </div>`;
    const setTags = (tags) => root.querySelectorAll('#etags input').forEach((i) => { i.checked = tags.includes(i.value); });
    if (!spot.elev) {
      height(spot.lat, spot.lon).then((h) => {
        spot.elev = h ? Math.round(h) : null;
        const el = root.querySelector('#eelev'); if (el) el.textContent = spot.elev ? `${spot.elev} m` : 'outside Switzerland?';
        if (isNew && !spot.tags.length) setTags(suggestTags(spot.name, spot.elev || 0));
      }).catch(() => {});
    } else if (isNew && !spot.tags.length) setTags(suggestTags(spot.name, spot.elev));
    root.querySelector('#ephoto')?.addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { photoBlob = await shrinkPhoto(f); toast('Photo added'); } });
    root.querySelector('#esave').addEventListener('click', async () => {
      spot.name = root.querySelector('#ename').value.trim() || 'My spot';
      spot.tags = [...root.querySelectorAll('#etags input:checked')].map((i) => i.value);
      spot.species = [...root.querySelectorAll('#especies input:checked')].map((i) => i.value);
      spot.blurb = root.querySelector('#enote').value.trim();
      if (photoBlob) { const key = `${spot.id}-${Date.now().toString(36)}`; await kvSet(`photo:${key}`, photoBlob.blob); spot.photos = [{ local: key, ratio: photoBlob.ratio }, ...(spot.photos || [])]; }
      if (!spot.elev) spot.elev = await height(spot.lat, spot.lon).catch(() => null);
      const { horizon, mine, curated, ...clean } = spot;
      if (isNew) addMySpot(clean); else updateMySpot(spot.id, clean);
      closeSheet();
      await loadSpots();
      toast(isNew ? 'Spot saved. Fetching its forecast…' : 'Saved');
      refresh().then(() => { if (isNew) openSpot(spot.id); });
      // the mountain horizon, in the background
      horizonFor(spot).then((h) => { const s = spotById(spot.id); if (s) s.horizon = h; }).catch(() => {});
    });
  });
}
