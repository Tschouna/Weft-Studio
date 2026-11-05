// Lichtblick service worker: keeps the app itself available offline (the forecasts are cached by the
// app in IndexedDB) and opens the right spot when you tap a notification.
const VERSION = 'lichtblick-__BUILD__';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'vendor/astronomy.mjs',
  'vendor/leaflet/images/layers.png', 'vendor/leaflet/images/layers-2x.png', 'vendor/leaflet/images/marker-icon.png',
  'js/main.js', 'js/app.js', 'js/ui.js', 'js/store.js', 'js/geo.js', 'js/astro.js', 'js/scoring.js', 'js/exif.js',
  'js/sources/meteoswiss.js', 'js/sources/meteoblue.js', 'js/sources/swisstopo.js', 'js/sources/spaceweather.js',
  'js/views/feed.js', 'js/views/map.js', 'js/views/sky.js', 'js/views/spots.js', 'js/views/spot.js', 'js/views/settings.js', 'js/views/charts.js',
  'data/spots.js', 'data/horizons.js', 'data/phenology.js', 'data/ch-outline.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('lichtblick-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// The app's own files: from the cache at once, refreshed in the background. Everything else
// (forecasts, maps, photos) goes to the network as usual.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const spot = e.notification.data && e.notification.data.spot;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { c.postMessage({ spot }); return c.focus(); }
    return self.clients.openWindow(`./${spot ? `#spot=${spot}` : ''}`);
  }));
});
