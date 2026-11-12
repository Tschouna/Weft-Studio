// Alerts while the app is closed. The phone subscribes to its maker's push service (Apple, Google,
// Mozilla) with a key pair made on the phone itself. A "setup code" with that subscription, the key
// and your alert settings goes into one GitHub secret; the scheduled job (scripts/digest.mjs) reads
// it and sends the alerts. Nothing passes through any other server.
import { settings, getJSON, setJSON, mySpots, favourites } from './store.js';

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const within = (promise, ms, message) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error(message)), ms))]);

// can this phone do it, and if not, why
export function pushSupport() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
  return { ok, ios, installed, why: ok ? '' : ios && !installed ? 'install' : 'unsupported' };
}

async function keyPair() {
  let k = getJSON('lb.pushKeys', null);
  if (k && k.publicKey && k.privateKey) return k;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  k = { publicKey: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)), privateKey: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d };
  setJSON('lb.pushKeys', k);
  return k;
}

export async function currentSubscription() {
  if (!pushSupport().ok) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush() {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are not allowed for Lichtblick. Allow them in the phone\'s settings, then try again');
  const k = await keyPair();
  const reg = await within(navigator.serviceWorker.ready, 8000, 'The app is not ready for alerts yet. Close it, open it again and retry');
  let sub = await reg.pushManager.getSubscription();
  const key = sub && sub.options && sub.options.applicationServerKey;
  if (sub && (!key || b64u(key) !== k.publicKey)) { await sub.unsubscribe(); sub = null; } // made with another key: start over
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(k.publicKey) });
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (sub) await sub.unsubscribe();
}

// Everything the alerts job needs, as one line of text for the secret LICHTBLICK_PUSH.
export function setupCode(sub) {
  const st = settings();
  const spots = mySpots().slice(0, 40).map((s) => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev, tags: s.tags, heading: s.heading, species: s.species, night: s.night, months: s.months, mine: true }));
  return JSON.stringify({
    v: 1, app: location.origin + location.pathname.replace(/[^/]*$/, ''),
    sub: sub.toJSON(), vapid: getJSON('lb.pushKeys', null),
    prefs: { min: st.alertMin, types: st.alertTypes, favsOnly: !!st.alertFavsOnly, favs: [...favourites()] },
    spots,
  });
}

// where to paste it: the repository this copy of the app is published from (GitHub Pages address)
export function secretsUrl() {
  const owner = location.hostname.match(/^([^.]+)\.github\.io$/), repo = location.pathname.split('/').filter(Boolean)[0];
  return owner && repo ? `https://github.com/${owner[1]}/${repo}/settings/secrets/actions/new` : null;
}
