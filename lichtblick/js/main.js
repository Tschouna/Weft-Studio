// Lichtblick: photo opportunities in Switzerland. Starts the app, switches tabs, keeps data fresh.
import { App, loadSpots, refresh } from './app.js';
import { $, $$, toast, sheetOpen, status } from './ui.js';
import { renderFeed } from './views/feed.js';
import { renderMap, focusSpot } from './views/map.js';
import { renderSky, showSkyFor } from './views/sky.js';
import { renderSpots } from './views/spots.js';
import { openSpot } from './views/spot.js';
import { openSettings } from './views/settings.js';
import { getJSON, setJSON } from './store.js';

const VIEWS = { feed: renderFeed, map: renderMap, sky: renderSky, spots: renderSpots };
let current = getJSON('lb.tab', 'feed');

function show(tab) {
  current = tab; setJSON('lb.tab', tab);
  $$('.tabbar [data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
  $$('.view').forEach((v) => { v.hidden = v.dataset.view !== tab; });
  VIEWS[tab]($(`#view-${tab}`));
}
const rerender = () => { if (current !== 'map') VIEWS[current]($(`#view-${current}`)); };

$$('.tabbar [data-tab]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.tab === current) $(`#view-${current}`).scrollTo({ top: 0, behavior: 'smooth' });
  show(b.dataset.tab);
}));
$('#btn-settings').addEventListener('click', () => openSettings());
$('#btn-refresh').addEventListener('click', () => refresh({ force: true }));

App.on('ops', rerender);
App.on('spots', rerender);
App.on('error', rerender);
App.on('loading', (on) => { $('#btn-refresh').classList.toggle('spin', on); if (on && !App.ops.length) rerender(); });
App.on('goto', (tab) => show(tab));
App.on('show-sky', (id) => { showSkyFor(id); show('sky'); });
App.on('show-map', (id) => { show('map'); setTimeout(() => focusSpot(id), 100); });
App.on('locate', (explicit) => locate(explicit));

function locate(explicit) {
  if (!navigator.geolocation) { if (explicit) toast('No location on this device'); return; }
  navigator.geolocation.getCurrentPosition((p) => {
    App.me = { lat: p.coords.latitude, lon: p.coords.longitude };
    setJSON('lb.me', { ...App.me, at: Date.now() });
    App.emit('me'); rerender();
    if (explicit) toast('Distances from where you are');
  }, () => { if (explicit) toast('Location not allowed'); }, { timeout: 12000, maximumAge: 30 * 60e3 });
}

// fresh data when the app comes back to the front after a while
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && App.updatedAt && Date.now() - App.updatedAt > 50 * 60e3) refresh();
});
window.addEventListener('online', () => refresh());

async function start() {
  const me = getJSON('lb.me', null);
  if (me) App.me = me;
  if (navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') locate(false); }).catch(() => {});
  await loadSpots();
  show(VIEWS[current] ? current : 'feed');
  await refresh();
  const m = location.hash.match(/spot=([\w-]+)/);
  if (m) openSpot(m[1]);
}
start().catch((e) => { console.error(e); status('Something went wrong'); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.spot) openSpot(e.data.spot); });
}
