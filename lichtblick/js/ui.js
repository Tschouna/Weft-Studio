// Small UI helpers: escaping, sheets, toasts, photo URLs, friendly times, the moon drawing.
import { hhmm, localMidnight, weekday, dayLabel, TZ } from './astro.js';
import { kvGet } from './store.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer = null;
export function toast(msg, ms = 2800) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export function status(msg) { const el = $('#status'); if (el) el.textContent = msg || ''; }

// ---- bottom sheets ----
const stack = [];
export function openSheet(render, { onClose } = {}) {
  const sheet = $('#sheet'), inner = sheet.querySelector('.sheet-inner');
  if (stack.length) stack[stack.length - 1].scroll = inner.scrollTop;
  const entry = { render, onClose };
  stack.push(entry);
  sheet.hidden = false;
  inner.innerHTML = '';
  inner.scrollTop = 0;
  render(inner);
  history.pushState({ sheet: stack.length }, '');
  return inner;
}
export function closeSheet(fromHistory = false) {
  const sheet = $('#sheet'), inner = sheet.querySelector('.sheet-inner');
  const top = stack.pop();
  if (top && top.onClose) top.onClose();
  if (stack.length) { inner.innerHTML = ''; stack[stack.length - 1].render(inner); inner.scrollTop = stack[stack.length - 1].scroll || 0; }
  else { sheet.hidden = true; inner.innerHTML = ''; }
  if (!fromHistory) history.back();
}
export const sheetOpen = () => stack.length > 0;
export function rerenderSheet() {
  if (!stack.length) return;
  const inner = $('#sheet .sheet-inner'), y = inner.scrollTop;
  inner.innerHTML = ''; stack[stack.length - 1].render(inner); inner.scrollTop = y;
}
window.addEventListener('popstate', () => { if (stack.length) closeSheet(true); });
document.addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

export const sheetHead = (title = '') => `<div class="grab"></div><div class="sheet-head"><b>${esc(title)}</b><button class="iconbtn" data-close aria-label="Close"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z"/></svg></button></div>`;
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });

// ---- photos ----
const objectUrls = new Map();
export function photoUrl(photo, width = 500) {
  if (!photo) return '';
  if (photo.file) return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(photo.file).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}?width=${width}`;
  if (photo.local) return objectUrls.get(photo.local) || '';
  return photo.url || '';
}
// own photos live in IndexedDB; load them once into object URLs
export async function loadLocalPhotos(spots) {
  for (const s of spots) for (const p of s.photos || []) {
    if (p.local && !objectUrls.has(p.local)) {
      const blob = await kvGet(`photo:${p.local}`);
      if (blob) objectUrls.set(p.local, URL.createObjectURL(blob));
    }
  }
}
export const commonsPage = (photo) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(photo.file.replace(/ /g, '_'))}`;
export const credit = (p) => (p.file ? `© ${p.author} · ${p.license} · Wikimedia Commons` : 'Your photo');

// ---- times ----
export function relDay(d, now = new Date()) {
  const a = localMidnight(d).getTime(), b = localMidnight(now).getTime(), n = Math.round((a - b) / 864e5);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: TZ }).format(d);
  return dayLabel(d);
}
export function whenText(o, now = new Date()) {
  const night = o.end - o.start > 3 * 3600e3 && new Date(o.start).getUTCHours() >= 15;
  const day = relDay(o.start, now);
  const len = o.end - o.start;
  const span = len > 6 * 3600e3 && !night ? `${hhmm(o.peak || o.start)} → ${hhmm(o.end)}` : len > 20 * 60e3 ? `${hhmm(o.start)}–${hhmm(o.end)}` : hhmm(o.peak || o.start);
  if (o.start <= now && o.end >= now) return `Now · until ${hhmm(o.end)}`;
  return `${night && day === 'Today' ? 'Tonight' : night && day === 'Tomorrow' ? 'Tomorrow night' : day} · ${span}`;
}
export const ago = (t) => { const m = Math.round((Date.now() - t) / 60e3); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

// ---- the moon, drawn for a phase angle (0 new, 180 full) ----
export function moonSvg(phase, size = 40) {
  const r = size / 2 - 1, c = size / 2, p = ((phase % 360) + 360) % 360;
  const k = Math.cos((p * Math.PI) / 180); // 1 new, -1 full
  const waxing = p < 180;
  // lit part: half disc on the lit side plus/minus an ellipse
  const rx = Math.abs(k) * r;
  const sweepOuter = waxing ? 1 : 0;
  const sweepInner = k > 0 ? (waxing ? 0 : 1) : (waxing ? 1 : 0);
  const d = `M ${c} ${c - r} A ${r} ${r} 0 0 ${sweepOuter} ${c} ${c + r} A ${rx} ${r} 0 0 ${sweepInner} ${c} ${c - r} Z`;
  return `<svg class="moon" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${r}" fill="#26324d"/><path d="${d}" fill="#f4ecd2"/></svg>`;
}

export const scoreBadge = (s, cls) => `<span class="score ${cls}">${s}</span>`;
export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export { weekday, hhmm };
