// The spots: the curated collection and your own. Add a spot by searching swisstopo, from where you
// stand, by long-pressing the map, or from a photo that knows where it was taken.
import { App, bestFor, addMySpot, updateMySpot, loadSpots, refresh, spotById } from '../app.js';
import { iconOf } from '../scoring.js';
import { icon } from '../icons.js';
import { esc, photoUrl, openSheet, closeSheet, sheetHead, toast, debounce, plate } from '../ui.js';
import { favourites, kvSet, getJSON, setJSON } from '../store.js';
import { searchPlaces, height, horizonFor } from '../sources/swisstopo.js';
import { distance, fmtKm } from '../geo.js';
import { readExif, shrinkPhoto } from '../exif.js';
import { openSpot, TAG_LABELS } from './spot.js';
import { SPECIES } from '../../data/species.js';

let filter = '', kind = getJSON('lb.spotsKind', 'all'), sort = getJSON('lb.spotsSort', 'best');
const EDITABLE_TAGS = ['lake', 'reflection', 'peaks', 'alpenglow', 'fogsea', 'mist', 'lowland', 'larch', 'beech', 'chestnut', 'vineyard', 'waterfall', 'river', 'glacier', 'darksky', 'city', 'lightning', 'frozen', 'snow', 'hoarfrost'];
const KINDS = [
  ['all', 'All', null, () => true], ['saved', 'Saved', 'saved', (s, fav) => fav.has(s.id)], ['mine', 'Mine', 'pin', (s) => s.mine],
  ['lake', 'Lakes', 'mirror', (s) => s.tags.includes('lake')], ['peaks', 'Peaks', 'peak', (s) => s.tags.includes('peaks')],
  ['fog', 'Above the fog', 'fogsea', (s) => s.tags.includes('fogsea')], ['dark', 'Dark sky', 'stars', (s) => s.sky && s.sky.bortle <= 4 && s.night !== 'closed'],
  ['wild', 'Wildlife', 'paw', (s) => s.species && s.species.length], ['water', 'Waterfalls', 'waterfall', (s) => s.tags.includes('waterfall') || s.tags.includes('river')],
  ['autumn', 'Autumn', 'autumn', (s) => ['larch', 'beech', 'chestnut', 'vineyard'].some((t) => s.tags.includes(t))], ['city', 'Towns', 'bluehour', (s) => ['city', 'castle', 'bridge'].some((t) => s.tags.includes(t))],
];
const SORTS = [['best', 'Best chance'], ['near', 'Nearest'], ['dark', 'Darkest'], ['high', 'Highest'], ['az', 'A to Z']];

export function renderSpots(root) {
  const fav = favourites(), q = filter.trim().toLowerCase();
  const match = (s) => !q || `${s.name} ${s.region || ''} ${(s.tags || []).map((t) => TAG_LABELS[t] || t).join(' ')} ${(s.species || []).map((k) => SPECIES[k]?.name || '').join(' ')}`.toLowerCase().includes(q);
  const k = KINDS.find((x) => x[0] === kind) || KINDS[0];
  if (sort === 'near' && !App.me) sort = 'best';
  const best = new Map(App.spots.map((s) => [s.id, bestFor(s.id)]));
  const by = {
    best: (a, b) => (best.get(b.id)?.score || 0) - (best.get(a.id)?.score || 0) || a.name.localeCompare(b.name),
    near: (a, b) => distance(App.me, a) - distance(App.me, b), dark: (a, b) => (a.sky?.bortle ?? 9) - (b.sky?.bortle ?? 9) || (b.elev || 0) - (a.elev || 0),
    high: (a, b) => (b.elev || 0) - (a.elev || 0), az: (a, b) => a.name.localeCompare(b.name),
  };
  const list = App.spots.filter((s) => match(s) && k[3](s, fav)).sort(by[sort]);
  root.innerHTML = `<div class="wrap">
    <div class="pagehead"><div><div class="eyebrow">${App.spots.length} places${App.spots.some((s) => s.mine) ? `, ${App.spots.filter((s) => s.mine).length} your own` : ''}</div><h1 class="h1 mt4">Spots</h1></div>
      <button class="btn primary small" id="addspot">${icon('plus')}Add a spot</button></div>
    <input type="search" id="spotq" placeholder="Search: lake, larches, Engadin, ibex…" value="${esc(filter)}" autocomplete="off" aria-label="Search spots">
    <div class="chips mt12">${KINDS.map(([id, label, ic]) => `<button class="chip" data-kind="${id}" aria-pressed="${id === kind}">${ic ? icon(ic) : ''}${label}</button>`).join('')}</div>
    <div class="row sp mt12"><span class="eyebrow">${list.length} ${list.length === 1 ? 'spot' : 'spots'}</span>
      <label class="row gap6 small muted">${icon('sort')}<select id="spotsort" class="pick" style="padding:5px 8px;font-size:13px;border-color:var(--rule)" aria-label="Sort">${SORTS.filter(([id]) => id !== 'near' || App.me).map(([id, l]) => `<option value="${id}" ${id === sort ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    ${list.length ? `<div class="grid2 mt12">${list.map((s) => cardOf(s, best.get(s.id), fav)).join('')}</div>` : '<div class="empty">No spot matches.</div>'}
    <p class="tiny faint mt24">Photos from Wikimedia Commons; each spot names the author and licence. A spot stands where the photographer stood when the camera recorded it, otherwise at the classic viewpoint.</p>
  </div>`;
  const qi = root.querySelector('#spotq');
  qi.addEventListener('input', debounce(() => { filter = qi.value; const pos = qi.selectionStart; renderSpots(root); const n = root.querySelector('#spotq'); n.focus(); n.setSelectionRange(pos, pos); }, 200));
  root.querySelector('#addspot').addEventListener('click', () => openAdd());
  root.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.kind; setJSON('lb.spotsKind', kind); renderSpots(root); }));
  root.querySelector('#spotsort').addEventListener('change', (e) => { sort = e.target.value; setJSON('lb.spotsSort', sort); renderSpots(root); });
  root.querySelectorAll('[data-spot]').forEach((b) => b.addEventListener('click', () => openSpot(b.dataset.spot)));
}

function cardOf(s, o, fav) {
  const ph = s.photos?.[0];
  const sub = sort === 'dark' && s.sky ? `Bortle ${s.sky.bortle}` : sort === 'near' && App.me ? fmtKm(distance(App.me, s)) : (s.region || '').replace(/\s*\([A-Z/]+\)$/, '');
  return `<button class="spotc" data-spot="${esc(s.id)}">
    <div class="ph" style="${ph ? `background-image:url('${esc(photoUrl(ph, 330))}')` : ''}">${fav.has(s.id) ? `<span class="sv">${icon('saved', 18)}</span>` : ''}${o ? plate(o.score) : ''}</div>
    <div class="nm clip1">${esc(s.name)}</div>
    <div class="sub clip1">${s.elev ? `<span class="peak tnum">${Math.round(s.elev)} m</span> · ` : ''}${esc(sub)}</div>
    ${o ? `<div class="op"><span>${icon(iconOf(o))}</span><span class="clip1">${esc(o.title)}</span></div>` : ''}</button>`;
}

// ---- adding ----
export function openAdd() {
  openSheet((root) => {
    root.innerHTML = `${sheetHead('Add a spot')}<div class="sheet-body">
      <h1 class="h1 mt16">Where is it?</h1>
      <p class="muted mt8">Pick a place. Next you name it and say what it is good for.</p>
      <input type="search" id="addq" class="mt12" placeholder="Search a place, peak or lake (swisstopo)" autocomplete="off" aria-label="Search a place">
      <div class="search-results" id="addres"></div>
      <div class="stack mt16">
        <button class="btn" id="addgps" style="justify-content:flex-start">${icon('locate')}Where I am now</button>
        <label class="btn" style="position:relative;overflow:hidden;justify-content:flex-start">${icon('photo')}From a photo with GPS<input type="file" accept="image/jpeg,image/*" id="addphoto" style="position:absolute;inset:0;opacity:0"></label>
        <button class="btn" id="addmap" style="justify-content:flex-start">${icon('map')}Long-press on the map</button>
      </div>
      <p class="tiny faint mt12">From a photo: the app reads the GPS position (and compass direction) the camera stored. On iPhone, in the photo picker tap <i>Options</i> and keep <i>Location</i> on.</p>
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
    root.innerHTML = `${sheetHead(isNew ? 'New spot' : 'Edit spot')}
      ${photoBlob ? `<div class="photo"><img src="${URL.createObjectURL(photoBlob.blob)}" style="max-height:40vh" alt=""></div>` : ''}<div class="sheet-body">
      <label class="field">Name<input type="text" id="ename" value="${esc(spot.name)}"></label>
      <div class="small muted tnum" id="ewhere">${spot.lat.toFixed(5)}° N, ${spot.lon.toFixed(5)}° E · <span id="eelev">${spot.elev ? `${spot.elev} m` : 'height…'}</span>${spot.heading != null ? ` · camera looked ${Math.round(spot.heading)}°` : ''}${taken ? ` · photo taken ${esc(taken.slice(0, 10).replace(/:/g, '-'))}` : ''}</div>
      <div class="eyebrow mt24" style="margin-bottom:8px">What is it good for?</div>
      <div class="tagpick" id="etags">${EDITABLE_TAGS.map((t) => `<label><input type="checkbox" value="${t}" ${spot.tags.includes(t) ? 'checked' : ''}>${esc(TAG_LABELS[t])}</label>`).join('')}</div>
      <div class="eyebrow mt24" style="margin-bottom:8px">Wildlife here</div>
      <div class="tagpick" id="especies">${Object.entries(SPECIES).filter(([k]) => k !== 'park').map(([k, sp]) => `<label><input type="checkbox" value="${k}" ${(spot.species || []).includes(k) ? 'checked' : ''}>${icon(sp.glyph)}${esc(sp.name)}</label>`).join('')}</div>
      <label class="field">Notes<textarea id="enote" rows="3" placeholder="Parking, best angle, what to bring…">${esc(spot.blurb || '')}</textarea></label>
      ${!photoBlob && isNew ? `<label class="btn small quiet" style="position:relative;overflow:hidden">${icon('photo')}Add a photo<input type="file" accept="image/*" id="ephoto" style="position:absolute;inset:0;opacity:0"></label>` : ''}
      <div class="btns mt16"><button class="btn primary" id="esave">Save spot</button><button class="btn quiet" data-close>Cancel</button></div>
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
