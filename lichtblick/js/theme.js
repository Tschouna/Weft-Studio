// The app wears the light: bright by day, dark once the sun is down (at your position, or the middle
// of Switzerland), or fixed if you prefer. "Red night" passes everything through a red filter so a
// glance at the phone does not cost you your night vision.
import { sunAt } from './astro.js';
import { settings, saveSettings, setJSON } from './store.js';

export const THEMES = [['auto', 'Follow the sun'], ['light', 'Light'], ['dark', 'Dark'], ['red', 'Red night']];
let where = { lat: 46.8, lon: 8.23, elev: 500 }, last = null;
export function themeAt(pos) { if (pos) where = { ...pos, elev: 500 }; applyTheme(); }

export function resolved() {
  const t = settings().theme || 'auto';
  if (t !== 'auto') return t;
  return sunAt(new Date(), where).alt > -4 ? 'light' : 'dark';
}
export function applyTheme() {
  const t = resolved(), root = document.documentElement;
  root.dataset.theme = t === 'light' ? 'light' : 'dark';
  root.classList.toggle('red', t === 'red');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'light' ? '#eff0ee' : t === 'red' ? '#000000' : '#0a0b0c';
  setJSON('lb.themeNow', t);
  if (t !== last) { last = t; document.dispatchEvent(new CustomEvent('lb-theme', { detail: t })); }
  return t;
}
export function setTheme(t) { saveSettings({ theme: t }); applyTheme(); }
if (typeof document !== 'undefined') {
  setInterval(applyTheme, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') applyTheme(); });
}
