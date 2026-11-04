// Weft panels: the Panels compartment. A wall panel you shape, pattern and slice into tiles that fit the
// bed, beside the studio in the same app. The geometry lives in panel.js and builds in panel-worker.js.
import {
  PANEL_PATTERNS, PANEL_PATTERN_ORDER, PANEL_SHAPES, RIB_FIELDS, normalizePanel, panelDefaults, planPanel, buildPanel,
  previewRes, panelChecks, outlinePath, _compile, fitTestPanel,
} from './panel.js';
import { readDEM, mosaic, DEM_EXTENSIONS } from './dem.js';
import { searchPlaces, fetchTerrain, areaRect, tilesFor, mapURL, TILE_MB } from './swisstopo.js';
import { deflateSync, inflateSync } from 'fflate';

// Starting points: each one a whole panel, ready to slice.
export const PANEL_PRESETS = [
  { name: 'Veil', mode: 'ribs', pattern: 'silk', width: 400, height: 600, scale: 230, depth: 35, base: 6, vary: 0.5, edge: 'flush', ribs: { width: 6, gap: 6, angle: 0, bend: 0, floor: 0.15 }, finish: { color: '#c9b8a3', wall: '#d5dbe0' } },
  { name: 'Noir', mode: 'ribs', pattern: 'dune', width: 600, height: 400, scale: 190, depth: 30, base: 6, vary: 0.55, edge: 'flush', ribs: { width: 6, gap: 6, angle: 0, bend: 0, floor: 0.2 }, finish: { color: '#22211f', wall: '#e4e1da' } },
  { name: 'Corolla', mode: 'ribs', pattern: 'bloom', width: 520, height: 520, scale: 92, depth: 30, base: 6, vary: 0.35, edge: 'flush', ribs: { width: 5, gap: 5, angle: 0, bend: 0, floor: 0.12 }, finish: { color: '#d8a647', material: 'silk' } },
  { name: 'Moiré', mode: 'ribs', pattern: 'lens', width: 600, height: 400, scale: 62, depth: 24, base: 5, vary: 0.4, edge: 'flush', ribs: { width: 4, gap: 4, angle: 0, bend: 0, floor: 0.2 }, finish: { color: '#eeebe4' } },
  { name: 'Canyon', mode: 'ribs', pattern: 'contour', width: 640, height: 420, scale: 110, depth: 30, base: 6, vary: 0.4, seed: 21, edge: 'flush', ribs: { width: 4, gap: 4, angle: 90, bend: 0, floor: 0.1 }, finish: { color: '#26324a', color2: '#d8a647', twoTone: true, toneAt: 0.62 } },
  { name: 'Eddy', mode: 'ribs', pattern: 'vortex', width: 520, height: 520, scale: 72, depth: 26, base: 6, vary: 0.4, edge: 'flush', ribs: { width: 5, gap: 5, angle: 0, bend: 0.5, floor: 0.15 }, finish: { color: '#6f7d6b' } },
  { name: 'Echo', pattern: 'diffuser', width: 600, height: 600, scale: 30, depth: 50, base: 5, vary: 0.8, seed: 9, edge: 'flush', groove: 2, finish: { color: '#8d8f8e', wall: '#e4e1da' } },
  { name: 'Dune', pattern: 'dune', width: 600, height: 400, scale: 64, depth: 11, vary: 0.45, edge: 'frame', edgeW: 18, finish: { color: '#eeebe4' } },
  { name: 'Basalt', pattern: 'basalt', width: 640, height: 420, scale: 46, depth: 13, vary: 0.75, edge: 'flush', tiles: { seams: 'pattern', joint: 'none' }, mount: 'magnets', finish: { color: '#3a3b3d' } },
  { name: 'Atlas', pattern: 'contour', shape: 'rounded', corner: 28, width: 620, height: 420, scale: 48, depth: 16, vary: 0.35, seed: 12, edge: 'frame', edgeW: 14, finish: { color: '#26324a', color2: '#d8a647', twoTone: true, toneAt: 0.55 } },
  { name: 'Sunrise', pattern: 'sunburst', shape: 'arch', width: 380, height: 560, scale: 26, depth: 10, vary: 0.4, origin: 'bottom', edge: 'frame', edgeW: 16, finish: { color: '#a34f31' } },
  { name: 'Chester', pattern: 'tufted', shape: 'rounded', corner: 36, width: 520, height: 520, scale: 70, depth: 12, vary: 0.4, edge: 'frame', edgeW: 20, finish: { color: '#6f7d6b', material: 'satin' } },
  { name: 'Riad', pattern: 'moroccan', mode: 'cut', shape: 'arch', width: 460, height: 700, scale: 58, depth: 4, open: 0.7, edge: 'frame', edgeW: 22, mount: 'halo', finish: { color: '#eeebe4', backlight: true, led: '#ffb46b', wall: '#5d6166' } },
  { name: 'Kiln', pattern: 'brick', width: 640, height: 300, scale: 60, depth: 7, vary: 0.6, edge: 'flush', tiles: { joint: 'keys' }, finish: { color: '#a34f31' } },
  { name: 'Loom', pattern: 'weave', width: 420, height: 420, scale: 44, depth: 9, vary: 0.3, edge: 'frame', edgeW: 16, finish: { color: '#b9a58a' } },
  { name: 'Tidal', pattern: 'ripple', width: 640, height: 420, scale: 42, depth: 8, vary: 0.5, seed: 4, edge: 'fade', edgeW: 40, finish: { color: '#b7c7cf' } },
  { name: 'Pixel', pattern: 'pixel', width: 480, height: 480, scale: 40, depth: 14, vary: 0.85, edge: 'flush', finish: { color: '#22211f', color2: '#eeebe4', twoTone: true, toneAt: 0.5 } },
  { name: 'Maelstrom', pattern: 'vortex', shape: 'oval', width: 520, height: 520, scale: 38, depth: 10, vary: 0.35, edge: 'bevel', finish: { color: '#4b5a3e' } },
  { name: 'Halftone', pattern: 'halftone', mode: 'cut', shape: 'oval', width: 480, height: 480, scale: 17, depth: 2, vary: 0.6, edge: 'frame', edgeW: 12, mount: 'halo', finish: { color: '#22211f', backlight: true, led: '#ffd7a0' } },
  { name: 'Shingle', pattern: 'scale', width: 440, height: 560, scale: 46, depth: 9, vary: 0.35, edge: 'frame', edgeW: 16, finish: { color: '#5b4a3a', material: 'satin' } },
  { name: 'Kinetic', pattern: 'pyramid', width: 520, height: 360, scale: 52, depth: 12, vary: 0.7, edge: 'flush', tiles: { joint: 'none' }, finish: { color: '#c9cbc8' } },
  { name: 'Truchet', pattern: 'truchet', width: 480, height: 360, scale: 40, depth: 8, vary: 0.4, edge: 'frame', edgeW: 14, finish: { color: '#eeebe4', color2: '#26324a', twoTone: true, toneAt: 0.45 } },
  { name: 'Odeon', pattern: 'deco', shape: 'arch', width: 420, height: 600, scale: 50, depth: 8, vary: 0.5, edge: 'frame', edgeW: 18, finish: { color: '#d8a647', material: 'silk' } },
];
const PANEL_NAMES = ['Atlas', 'Dune', 'Tide', 'Mesa', 'Strata', 'Loom', 'Riad', 'Kiln', 'Fresco', 'Relief', 'Plinth', 'Facade', 'Cornice', 'Frieze', 'Lintel', 'Tessera', 'Mosaic', 'Zellige', 'Terrazzo', 'Travertine', 'Basalt', 'Quarry', 'Cairn', 'Moraine', 'Delta', 'Estuary', 'Sirocco', 'Mistral', 'Aurora', 'Halcyon', 'Solace', 'Vesper', 'Lumen', 'Odeon', 'Lido', 'Riviera', 'Cloister', 'Atrium', 'Portico', 'Arcade', 'Bastion', 'Rampart', 'Canopy', 'Grove', 'Thicket', 'Bramble', 'Fable', 'Echo', 'Cadence', 'Meridian'];
const WALLS = [['Plaster', '#e4e1da'], ['Linen', '#ece6dc'], ['Sage', '#cfd5c9'], ['Terracotta', '#c9a48f'], ['Slate', '#5d6166'], ['Night', '#1d1e1c']];
const LEDS = [['Candle', '#ff9f4a'], ['Warm', '#ffb46b'], ['Soft', '#ffd7a0'], ['Daylight', '#f4f1ff'], ['Rose', '#ff7aa8'], ['Ocean', '#5ab8ff']];
const DETAIL = { draft: { label: 'Draft', res: 0.8, note: 'quick, a little soft' }, standard: { label: 'Standard', res: 0.55, note: 'sharp for 0.4 mm nozzles' }, fine: { label: 'Fine', res: 0.4, note: 'biggest files' } };
const STEPS = [
  ['shape', 'Shape', 'Outline, size, edge and back.', '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 15l5-4 4 3 3-2 4 3"/>'],
  ['pattern', 'Pattern', 'A relief or openwork, and how far it stands out.', '<path d="M3 8c3-3 6 3 9 0s6 3 9 0M3 13c3-3 6 3 9 0s6 3 9 0M3 18c3-3 6 3 9 0s6 3 9 0"/>'],
  ['tiles', 'Tiles', 'How it slices up to fit your bed, joins and hangs.', '<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M12 4v7c-1.6 0-1.6 2 0 2v7M3.5 12h7c0-1.6 2-1.6 2 0h8"/>'],
  ['finish', 'Finish', 'Filament colours, two-tone tips, the wall and the light.', '<circle cx="9.5" cy="9.5" r="5.5"/><circle cx="14.5" cy="14.5" r="5.5"/>'],
  ['export', 'Export', 'The print check, the tiles, and files for your slicer.', '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 16.5V20h15v-3.5"/>'],
];

export function initPanels(api) {
  const {
    THREE, OrbitControls, RoomEnvironment, zipSync, strToU8, h, store, toast, saveFile, stl, sliderCtl, chipsCtl, switchCtl,
    group, groupAct, FILAMENTS, MATERIALS, PRINTERS, UI, desktop, slug, clamp, copyText, bedMesh,
  } = api;
  const v2 = UI === 'v2';
  const root = document.getElementById('panels');
  if (!root) return null;
  const mmf = (v) => `${(+v).toFixed(Math.abs(v) < 10 && v % 1 ? 1 : 0)} mm`;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const deg = (v) => `${Math.round(v)}°`;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------------------------------------------------------------- state
  const savedImg = store.get('weft.panel.img', null);
  const ps = {
    P: normalizePanel(store.get('weft.panel', null) || PANEL_PRESETS[0]),
    tab: store.get('weft.panel.tab', 'shape'),
    view: 'wall',
    back: false,
    light: store.get('weft.panel.light', 24),
    detail: store.get('weft.panel.detail', 'standard'),
    format: store.get('weft.panel.format', 'kit'),
    img: null,
    res: null,
    plan: null,
    started: false,
    active: false,
    // the place picked for a swisstopo download: { name, type, e, n, km, fine }
    geo: store.get('weft.panel.geo', null),
    geoQuery: '',
    geoHits: null,
    geoBusy: null,
  };
  const history = { stack: [JSON.stringify(ps.P)], at: 0 };
  const printer = () => PRINTERS.find((q) => q.id === api.getPrinter()) || PRINTERS[0];
  // width, depth and height of the build volume
  const bed = () => printer().bed.slice(0, 3);
  const maxDepth = () => Math.max(10, Math.floor(bed()[2] - 2 - P().base));
  const P = () => ps.P;

  // ---------------------------------------------------------------- builder (worker, or here when workers are blocked)
  const builder = (() => {
    let w = null, local = false, seq = 0, sentDem = null;
    const cb = new Map();
    let ready = new Promise((res) => {
      try {
        w = new Worker(new URL('./panel-worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => {
          const m = e.data;
          if (m.ready) { res(true); return; }
          const c = cb.get(m.id); if (!c) return;
          cb.delete(m.id);
          if (m.error) c.reject(new Error(m.error)); else c.resolve(m.res);
        };
        w.onerror = (e) => { e.preventDefault?.(); local = true; res(false); for (const [id, c] of cb) { cb.delete(id); runLocal(c.params, c.opts).then(c.resolve, c.reject); } };
        setTimeout(() => res(false), 6000);
      } catch { local = true; res(false); }
    });
    const runLocal = async (params, opts) => { await new Promise((r) => setTimeout(r, 0)); return buildPanel(params, opts); };
    return {
      async run(params, opts) {
        if (!local && !(await ready)) local = true;
        if (local) return runLocal(params, opts);
        const id = ++seq;
        // the elevation model goes over once; after that the worker keeps it and gets only its id
        let o = opts;
        if (opts.dem) { o = { ...opts, dem: sentDem === opts.dem.id ? { id: opts.dem.id } : opts.dem }; sentDem = opts.dem.id; }
        return new Promise((resolve, reject) => { cb.set(id, { resolve, reject, params, opts }); w.postMessage({ id, params, opts: o }); });
      },
    };
  })();
  const imgOpt = () => (ps.img ? { w: ps.img.w, h: ps.img.h, data: ps.img.data } : null);
  const demOpt = () => (ps.dem && PANEL_PATTERNS[P().pattern]?.terrain ? { id: ps.dem.id, w: ps.dem.w, h: ps.dem.h, data: ps.dem.data } : null);

  // ---------------------------------------------------------------- skeleton
  const svgIcon = (inner, size = 24) => h('svg', { viewBox: `0 0 ${size} ${size}`, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', html: inner });
  const DICE = '<rect x="3" y="3" width="14" height="14" rx="3"/><circle cx="7.5" cy="7.5" r=".7" fill="currentColor"/><circle cx="12.5" cy="12.5" r=".7" fill="currentColor"/><circle cx="12.5" cy="7.5" r=".7" fill="currentColor"/><circle cx="7.5" cy="12.5" r=".7" fill="currentColor"/>';
  const el = {};
  el.canvas = h('canvas', { id: 'pn-view', tabindex: '0', 'aria-label': '3D preview of the panel. Drag to turn, scroll or pinch to zoom.' });
  el.kind = h('span', { class: 'kind', id: 'pn-kind' });
  el.name = h('input', { class: 'name-input', id: 'pn-name', maxlength: '28', spellcheck: 'false', 'aria-label': 'Panel name' });
  el.dice = h('button', { class: 'icon-btn name-dice', type: 'button', title: 'New name', 'aria-label': 'Generate a new name', html: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${DICE}</svg>` });
  el.views = h('div', { class: 'seg', role: 'group', 'aria-label': 'View' },
    ...[['wall', 'On the wall'], ['tiles', 'Tiles'], ['print', 'Print beds']].map(([k, l]) => h('button', { type: 'button', 'data-v': k, 'aria-pressed': k === ps.view, onclick: () => setView(k) }, l)));
  el.busy = h('div', { class: 'overlay busy', 'aria-live': 'polite' }, h('i'), h('span', {}, 'Building tiles'));
  el.labels = h('div', { class: 'pn-labels', 'aria-hidden': 'true' });
  el.readout = h('div', { class: 'readout', id: 'pn-readout', 'aria-live': 'polite' });
  el.statusText = h('span', {}, h('b', {}, 'Checking'));
  el.weight = h('span', { class: 'mono' });
  el.statusBtn = h('button', { type: 'button', title: 'Open the print check', onclick: () => setTab('export') }, h('span', { class: 'dot' }), el.statusText);
  el.status = h('div', { class: 'status' }, el.statusBtn, el.weight);
  const tool = (id, label, title, icon, on) => {
    const b = h('button', { class: v2 ? 'tool' : 'pill-btn', id, type: 'button', 'aria-pressed': 'false', 'aria-label': label, title },
      h('svg', { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: icon }), v2 ? h('span', { class: 'lbl' }, label) : label);
    b.addEventListener('click', on);
    return b;
  };
  el.tGlow = tool('pn-t-glow', 'Backlight', 'An LED strip behind the panel, lighting the wall round it', '<path d="M7 13a5 5 0 116 0v2H7z"/><path d="M8 18h4"/>', () => { P().finish.backlight = !P().finish.backlight; commit(); applyLook(); syncTools(); renderPane('finish'); });
  el.tBack = tool('pn-t-back', 'Back', 'Turn the panel round to see the pockets and labels on its back', '<path d="M4 10a6 6 0 0110.5-4M16 10a6 6 0 01-10.5 4"/><path d="M14.5 2.5V6H11M5.5 17.5V14H9"/>', () => { ps.back = !ps.back; layout(); frame(false); syncTools(); });
  el.tLight = tool('pn-t-light', 'Raking', 'Sweep the light low across the panel, or bring it round to the front', '<circle cx="10" cy="10" r="3.2"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4"/>', () => { ps.light = ps.light === 24 ? 12 : ps.light === 12 ? 52 : 24; store.set('weft.panel.light', ps.light); aimLight(); invalidate(); syncTools(); toast(ps.light === 12 ? 'Low raking light: every ridge throws a shadow' : ps.light === 52 ? 'Light from the front' : 'Light from above'); });
  el.frameBtn = h('button', { class: v2 ? 'frame-btn' : 'pill-btn', type: 'button', title: 'Frame the panel', 'aria-label': 'Frame the panel', onclick: () => frame(true), html: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 7V3h4M17 7V3h-4M3 13v4h4M17 13v4h-4"/></svg>' });
  el.shuffle = h('button', { class: v2 ? 'shuffle-btn' : 'pill-btn', type: 'button', title: 'A random panel in your size and tiles', onclick: () => shuffle('all'), html: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${DICE}</svg><span>Shuffle</span>` });
  el.shuffleMenu = h('div', { class: 'shuffle-menu', hidden: true },
    h('span', { class: 'eyebrow' }, 'Shuffle only'),
    h('div', { class: 'chips' }, ...[['pattern', 'Pattern'], ['colour', 'Colours'], ['shape', 'Outline']].map(([k, l]) => h('button', { class: 'chip', type: 'button', onclick: () => { el.shuffleMenu.hidden = true; shuffle(k); } }, l))));
  el.caret = h('button', { class: v2 ? 'caret' : 'pill-btn caret', type: 'button', 'aria-label': 'Choose what Shuffle changes', 'aria-haspopup': 'true', title: 'Shuffle only the pattern, the colours or the outline', onclick: (e) => { e.stopPropagation(); el.shuffleMenu.hidden = !el.shuffleMenu.hidden; }, html: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12l4-4 4 4"/></svg>' });
  document.addEventListener('pointerdown', (e) => { if (!el.shuffleMenu.hidden && !e.target.closest('.shuffle-menu') && e.target !== el.caret && !el.caret.contains(e.target)) el.shuffleMenu.hidden = true; });
  const split = h('div', { class: 'split-btn' }, el.shuffle, el.caret, el.shuffleMenu);
  el.tabs = {}; el.panes = {};
  for (const [k, label, , icon] of STEPS) {
    const n = String(STEPS.findIndex((s) => s[0] === k) + 1).padStart(2, '0');
    el.tabs[k] = h('button', { role: 'tab', id: `pn-tab-${k}`, 'aria-controls': `pn-pane-${k}`, 'aria-selected': 'false', title: label, onclick: () => setTab(k) },
      ...(v2 ? [svgIcon(icon), h('b', {}, label), h('span', {}, n)] : [h('span', {}, n), h('b', {}, label)]));
    el.panes[k] = h('div', { class: 'pane', id: `pn-pane-${k}`, role: 'tabpanel', 'aria-labelledby': `pn-tab-${k}`, hidden: true });
  }
  el.steps = h('div', { class: 'steps', role: 'tablist', 'aria-label': 'Panel steps', 'aria-orientation': v2 ? 'vertical' : 'horizontal' }, ...Object.values(el.tabs));
  el.panesWrap = h('div', { class: 'panes', id: 'pn-panes' }, ...Object.values(el.panes));
  el.headNum = h('span', { class: 'mono' }); el.headTitle = h('h2'); el.headSub = h('p');
  el.stage = h('div', { class: 'stage pn-stage', id: 'pn-stage' }, el.canvas, el.labels,
    h('div', { class: 'overlay stage-head' }, ...(v2 ? [el.kind, h('div', { class: 'name-row' }, el.name, el.dice)] : [h('label', { class: 'eyebrow', for: 'pn-name' }, 'Panel name'), h('div', { class: 'name-row' }, el.name, el.dice), el.kind])),
    h('div', { class: 'overlay stage-views' }, el.views, ...(v2 ? [] : [h('div', { class: 'toggles' }, el.tGlow, el.tBack, el.tLight)])),
    el.busy,
    ...(v2 ? [h('div', { class: 'overlay dock glass', role: 'toolbar', 'aria-label': 'View tools' }, h('div', { class: 'dock-tools' }, el.tGlow, el.tBack, el.tLight), h('span', { class: 'sep', 'aria-hidden': 'true' }), h('div', { class: 'dock-main' }, el.frameBtn, split))]
      : [h('div', { class: 'overlay stage-foot' }, el.readout, h('div', { class: 'stage-btns' }, split, el.frameBtn))]));
  if (v2) {
    root.replaceChildren(
      el.steps,
      h('aside', { class: 'inspector', 'aria-label': 'Panel controls' },
        h('div', { class: 'inspector-head pn-head' }, h('div', { class: 'step-title' }, el.headNum, el.headTitle), el.headSub),
        el.panesWrap),
      h('div', { class: 'viewport' }, el.stage, h('footer', { class: 'statusbar' }, el.readout, el.status)));
  } else {
    root.replaceChildren(el.stage, h('aside', { class: 'rail', 'aria-label': 'Panel controls' }, el.steps, el.panesWrap, el.status));
  }
  root.classList.add('pn-root');

  // ---------------------------------------------------------------- 3D stage
  const SC = 0.001;
  const renderer = new THREE.WebGLRenderer({ canvas: el.canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0, 0);
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  const controls = new OrbitControls(camera, el.canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8f8a80, 0.42);
  const key = new THREE.DirectionalLight(0xfffaf2, 3.1);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.0006;
  scene.add(hemi, key, key.target);
  const wallMat = new THREE.MeshStandardMaterial({ color: P().finish.wall, roughness: 0.96 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), wallMat);
  wall.receiveShadow = true;
  scene.add(wall);
  const glowMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat);
  glow.visible = false;
  scene.add(glow);
  const panelRoot = new THREE.Group();
  if (/[?&]debug/.test(location.search)) window.__pnScene = scene;
  panelRoot.scale.setScalar(SC);
  scene.add(panelRoot);
  let tileGroups = [], beds = null, partsGroup = null;
  let needs = true;
  const invalidate = () => { needs = true; };
  controls.addEventListener('change', invalidate);
  function resize() {
    const r = el.stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    invalidate();
  }
  new ResizeObserver(resize).observe(el.stage);
  const _v = new THREE.Vector3();
  function loop() {
    if (ps.active) {
      if (controls.update()) needs = true;
      if (needs) { renderer.render(scene, camera); placeLabels(); needs = false; }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  const mats = { base: null, tips: null };
  function material(hex) {
    const M = MATERIALS[P().finish.material] || MATERIALS.matte;
    return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: M.roughness, metalness: M.metalness, sheen: M.sheen, sheenRoughness: 0.6, clearcoat: M.clearcoat, envMapIntensity: M.env * 0.45 });
  }
  function refreshMaterials() {
    mats.base?.dispose(); mats.tips?.dispose();
    mats.base = material(P().finish.color); mats.tips = material(P().finish.color2);
    panelRoot.traverse((o) => { if (o.isMesh && o.userData.tone !== undefined) o.material = o.userData.tone ? mats.tips : mats.base; });
    wallMat.color.set(P().finish.wall);
    applyLook();
    invalidate();
  }
  function geometry(m) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    if (m.normal) g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3)); else g.computeVertexNormals();
    g.setIndex(new THREE.BufferAttribute(m.index, 1));
    g.computeBoundingSphere();
    return g;
  }
  function clearPanel() {
    panelRoot.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.userData.own) o.material.dispose(); } });
    panelRoot.clear();
    tileGroups = []; beds = null; partsGroup = null;
  }
  function show(res) {
    clearPanel();
    if (!mats.base) refreshMaterials();
    for (const t of res.tiles) {
      const outer = new THREE.Group(), inner = new THREE.Group();
      outer.add(inner);
      for (const b of t.bodies) {
        const m = new THREE.Mesh(geometry(b), b.tone ? mats.tips : mats.base);
        m.userData.tone = b.tone; m.castShadow = true; m.receiveShadow = true;
        inner.add(m);
      }
      outer.userData = { tile: t };
      panelRoot.add(outer);
      tileGroups.push(outer);
    }
    if (res.parts.length) {
      partsGroup = new THREE.Group();
      let x = 0;
      for (const p of res.parts) {
        const n = Math.min(p.count, 12), cols = Math.ceil(Math.sqrt(n));
        for (let k = 0; k < n; k++) {
          const m = new THREE.Mesh(geometry(p.mesh), mats.base);
          m.userData.tone = 0; m.castShadow = true;
          m.position.set(x + (k % cols) * (p.size[0] + 6), Math.floor(k / cols) * (p.size[1] + 6), 0);
          partsGroup.add(m);
        }
        x += cols * (p.size[0] + 6) + 14;
      }
      panelRoot.add(partsGroup);
    }
    layout();
  }
  function layout() {
    const res = ps.res;
    if (!res) return;
    if (beds) { panelRoot.remove(beds); beds.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } }); beds = null; }
    const plan = res.plan, standoff = standoffMM();
    panelRoot.rotation.set(0, 0, 0);
    panelRoot.position.set(0, 0, 0);
    if (partsGroup) partsGroup.visible = ps.view === 'print';
    wall.visible = ps.view !== 'print' && !ps.back;
    if (ps.view === 'print') {
      const bd = bed(), n = tileGroups.length + (partsGroup ? 1 : 0), cols = Math.ceil(Math.sqrt(n)), gap = 40;
      beds = new THREE.Group();
      panelRoot.add(beds);
      panelRoot.rotation.x = -Math.PI / 2;
      tileGroups.forEach((g, k) => {
        const t = g.userData.tile, [x0, x1, y0, y1] = t.cell, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const bx = (k % cols) * (bd[0] + gap), by = -Math.floor(k / cols) * (bd[1] + gap);
        g.position.set(bx, by, 0);
        g.rotation.set(0, 0, plan.rotated ? Math.PI / 2 : 0);
        g.children[0].position.set(-cx, -cy, 0);
        const b = bedMesh(bd); b.position.set(bx, by, -0.6); beds.add(b);
      });
      if (partsGroup) {
        const k = tileGroups.length, bx = (k % cols) * (bd[0] + gap), by = -Math.floor(k / cols) * (bd[1] + gap);
        const box = new THREE.Box3().setFromObject(partsGroup);
        partsGroup.position.set(0, 0, 0);
        const b0 = new THREE.Box3().setFromObject(partsGroup);
        void box;
        const w = (b0.max.x - b0.min.x) / SC, hh = (b0.max.y - b0.min.y) / SC;
        partsGroup.position.set(bx - w / 2 - b0.min.x / SC, by - hh / 2 - b0.min.y / SC, 0);
        const b = bedMesh(bd); b.position.set(bx, by, -0.6); beds.add(b);
      }
      // centre the whole layout
      panelRoot.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(panelRoot);
      const c = box.getCenter(_v);
      panelRoot.position.set(-c.x, -box.min.y, -c.z);
    } else {
      const spread = ps.view === 'tiles' ? 16 : 0;
      tileGroups.forEach((g) => {
        const t = g.userData.tile;
        g.rotation.set(0, 0, 0);
        g.children[0].position.set(0, 0, 0);
        g.position.set((t.c - (plan.cols - 1) / 2) * spread, (t.r - (plan.rows - 1) / 2) * spread, 0);
      });
      panelRoot.position.set(0, 0, standoff * SC);
      if (ps.back) { panelRoot.rotation.y = Math.PI; panelRoot.position.z = (standoff + P().base + P().depth) * SC; }
    }
    wall.position.set(0, 0, 0);
    placeGlow();
    aimLight();
    applyLook();
    syncTools();
    invalidate();
  }
  const standoffMM = () => (P().mount === 'halo' ? 16 : P().finish.backlight ? 12 : 0);
  function aimLight() {
    const res = ps.res; if (!res) return;
    const W = res.plan.W * SC, H = res.plan.H * SC, R = Math.max(W, H);
    const e = (ps.light * Math.PI) / 180;
    if (ps.view === 'print') key.position.set(-R * 0.6, R * 1.6, R * 0.9);
    else key.position.set(-Math.cos(e) * R * 0.78, Math.cos(e) * R * 0.62, Math.sin(e) * R + 0.05);
    key.target.position.set(0, 0, 0);
    const sc = key.shadow.camera, S = ps.view === 'print' ? R * 2.2 : R * 0.85;
    sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.near = 0.01; sc.far = R * 8;
    sc.updateProjectionMatrix();
  }
  function placeGlow() {
    const F = P().finish, res = ps.res;
    glow.visible = !!(F.backlight && res && ps.view !== 'print' && !ps.back);
    if (!glow.visible) return;
    const plan = res.plan, fall = 26 + standoffMM() * 2.2, pad = fall * 3.2;
    const W = plan.W + pad * 2, H = plan.H + pad * 2;
    const C = _compile(normalizePanel(P()), null);
    const n = 256, cw = Math.round(n * Math.min(1, W / H)), ch = Math.round(n * Math.min(1, H / W));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d'), img = g.createImageData(cw, ch);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const x = -W / 2 + ((i + 0.5) / cw) * W, y = H / 2 - ((j + 0.5) / ch) * H, d = C.outline(x, y);
      const v = d > -4 ? 1 : Math.exp((d + 4) / fall);
      const k = (j * cw + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.round(255 * v); img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    glowMat.map?.dispose();
    glowMat.map = new THREE.CanvasTexture(cv); glowMat.map.colorSpace = THREE.SRGBColorSpace;
    glowMat.color.set(F.led).multiplyScalar(0.95);
    glowMat.needsUpdate = true;
    glow.scale.set(W * SC, H * SC, 1);
    glow.position.set(0, 0, 0.0004);
  }
  function applyLook() {
    const night = P().finish.backlight && ps.view !== 'print';
    const c = new THREE.Color(P().finish.color), dark = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b < 0.06;
    hemi.intensity = night ? 0.1 : dark ? 0.8 : 0.42;
    key.intensity = night ? 0.22 : dark ? 4.2 : 3.1;
    wallMat.color.set(P().finish.wall);
    if (night) wallMat.color.multiplyScalar(0.55);
    el.stage.classList.toggle('night', !!night);
    invalidate();
  }
  function frame(keepDir = false) {
    const res = ps.res; if (!res) return;
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    tileGroups.forEach((g) => box.expandByObject(g));
    if (partsGroup && partsGroup.visible) box.expandByObject(partsGroup);
    if (beds) box.expandByObject(beds);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const fov = (camera.fov * Math.PI) / 180;
    let dir;
    if (ps.view === 'print') dir = new THREE.Vector3(0.05, 1.25, 0.95).normalize();
    else dir = new THREE.Vector3(ps.back ? -0.2 : 0.2, 0.06, 1).normalize();
    if (keepDir && ps.framedView === ps.view) dir = camera.position.clone().sub(controls.target).normalize();
    let dist;
    if (ps.view === 'print') {
      // the whole layout of plates inside the view, whichever way the window is shaped
      const r = box.getBoundingSphere(new THREE.Sphere()).radius;
      dist = (r / Math.sin(Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * camera.aspect)) / 2)) * 0.92;
    } else dist = (Math.max(s.x / camera.aspect, s.y) / 2 / Math.tan(fov / 2)) * 1.22 + s.z;
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(dir, dist);
    camera.near = dist / 200; camera.far = dist * 20; camera.updateProjectionMatrix();
    controls.minDistance = dist * 0.15; controls.maxDistance = dist * 4;
    if (ps.view === 'print') { controls.minPolarAngle = 0.05; controls.maxPolarAngle = Math.PI * 0.47; controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity; }
    else { controls.minPolarAngle = 0.35; controls.maxPolarAngle = Math.PI - 0.5; controls.minAzimuthAngle = ps.back ? Math.PI - 1.2 : -1.2; controls.maxAzimuthAngle = ps.back ? Math.PI + 1.2 : 1.2; if (ps.back) { controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity; } }
    ps.framedView = ps.view;
    controls.update();
    invalidate();
  }
  // tile names float over the tiles view and the print beds
  function placeLabels() {
    const show = ps.res && (ps.view !== 'wall' || ps.back) && tileGroups.length > 1;
    el.labels.hidden = !show;
    if (!show) return;
    const r = el.canvas.getBoundingClientRect();
    if (el.labels.childElementCount !== tileGroups.length) el.labels.replaceChildren(...tileGroups.map((g) => h('span', {}, g.userData.tile.label)));
    tileGroups.forEach((g, k) => {
      const t = g.userData.tile, [x0, x1, y0, y1] = t.cell;
      const p = ps.view === 'print' ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, P().base + P().depth + 2);
      g.localToWorld(ps.view === 'print' ? p.set(0, 0, P().base + P().depth + 4) : p);
      p.project(camera);
      const s = el.labels.children[k];
      s.style.transform = `translate(${((p.x + 1) / 2) * r.width}px, ${((1 - p.y) / 2) * r.height}px) translate(-50%, -50%)`;
    });
  }

  // ---------------------------------------------------------------- building
  let building = false, pending = null, lastMs = 300, finalTimer = 0;
  function rebuild(final = true) {
    clearTimeout(finalTimer);
    pending = final ? 'final' : pending === 'final' ? 'final' : 'draft';
    pump();
  }
  async function pump() {
    if (building || !pending || !ps.started) return;
    const kind = pending; pending = null;
    building = true;
    el.busy.classList.add('show');
    const Pn = normalizePanel(P());
    const base = previewRes(Pn);
    const res = kind === 'draft' && lastMs > 260 ? base * 1.7 : base;
    const t0 = performance.now();
    try {
      const out = await builder.run(Pn, { res, bed: bed(), normals: true, groups: true, img: imgOpt(), dem: demOpt() });
      if (kind !== 'draft') lastMs = performance.now() - t0;
      const first = !ps.res || ps.res.plan.W !== out.plan.W || ps.res.plan.H !== out.plan.H;
      ps.res = out; ps.plan = out.plan;
      show(out);
      if (first || !ps.framedView) frame(false);
      refreshInfo();
    } catch (e) {
      console.error(e);
      toast('Could not build the panel. Try fewer tiles or a coarser pattern.');
    }
    building = false;
    el.busy.classList.toggle('show', !!pending);
    if (pending) pump();
    else if (kind === 'draft') finalTimer = setTimeout(() => rebuild(true), 220);
  }
  function refreshInfo() {
    const res = ps.res, Pn = P();
    if (!res) return;
    const g = res.tiles.reduce((s, t) => s + t.bodies.reduce((q, b) => q + b.grams, 0), 0) + res.parts.reduce((s, p) => s + p.mesh.grams * p.count, 0);
    const n = res.tiles.length;
    el.readout.replaceChildren(
      h('span', {}, h('strong', {}, `${Math.round(Pn.width)} × ${Math.round(Pn.height)}`), ' mm'),
      h('span', {}, h('strong', {}, String(n)), ` tile${n > 1 ? 's' : ''} · ${res.plan.cols} × ${res.plan.rows}`),
      h('span', {}, h('strong', {}, Pn.base + Pn.depth > 0 ? mmf(Pn.base + Pn.depth) : ''), ' deep'),
      h('span', {}, h('strong', {}, g > 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`), ' PLA'));
    const checks = panelChecks({ ...Pn, _hasImage: !!ps.img, _hasDem: !!ps.dem }, res.plan, res);
    const worst = checks.some((c) => c.level === 'bad') ? 'bad' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok';
    el.status.className = `status ${worst === 'ok' ? '' : worst}`;
    el.statusText.replaceChildren(h('b', {}, worst === 'bad' ? 'Fix before printing' : worst === 'warn' ? 'Print check: notes' : 'Ready to print'));
    el.weight.textContent = '';
    updateKind();
    if (ps.tab === 'tiles') renderTileMap();
    if (ps.tab === 'export') renderPane('export');
  }
  function updateKind() {
    const Pn = P(), pat = PANEL_PATTERNS[Pn.pattern];
    el.kind.textContent = `${PANEL_SHAPES[Pn.shape]} panel · ${pat.label} ${Pn.mode === 'cut' ? 'openwork' : Pn.mode === 'ribs' ? 'ribs' : 'relief'}`;
  }

  // ---------------------------------------------------------------- history
  let commitTimer = 0;
  function commit(soon = false) {
    clearTimeout(commitTimer);
    const go = () => {
      const s = JSON.stringify(P());
      if (s === history.stack[history.at]) return;
      history.stack.length = history.at + 1;
      history.stack.push(s);
      if (history.stack.length > 120) history.stack.shift();
      history.at = history.stack.length - 1;
      store.set('weft.panel', P());
      api.syncUndo?.();
    };
    if (soon) commitTimer = setTimeout(go, 450); else go();
  }
  function travel(dir) {
    const at = history.at + dir;
    if (at < 0 || at >= history.stack.length) return;
    history.at = at;
    ps.P = normalizePanel(JSON.parse(history.stack[at]));
    store.set('weft.panel', ps.P);
    afterLoad();
    api.syncUndo?.();
  }
  function afterLoad() {
    el.name.value = P().name;
    fitName();
    refreshMaterials();
    renderAll();
    rebuild(true);
  }
  // edits: rebuild (a quick draft while dragging) and remember
  const edit = (structural = false) => () => { commit(true); rebuild(false); if (structural) renderAll(); };
  const local = (structural) => ({ local: true, after: edit(structural) });

  // ---------------------------------------------------------------- panes
  function setTab(t) {
    ps.tab = t;
    store.set('weft.panel.tab', t);
    for (const [k] of STEPS) { el.tabs[k].setAttribute('aria-selected', k === t); el.panes[k].hidden = k !== t; }
    const i = STEPS.findIndex((s) => s[0] === t);
    el.headNum.textContent = String(i + 1).padStart(2, '0');
    el.headTitle.textContent = STEPS[i][1];
    el.headSub.textContent = STEPS[i][2];
    renderPane(t);
    el.panesWrap.scrollTop = 0;
  }
  function renderAll() { renderPane(ps.tab); updateKind(); }
  function renderPane(t) {
    const pane = el.panes[t];
    if (!pane || pane.hidden) return;
    const fn = { shape: paneShape, pattern: panePattern, tiles: paneTiles, finish: paneFinish, export: paneExport }[t];
    pane.replaceChildren(...fn().filter(Boolean));
    if (t === 'tiles') renderTileMap();
  }

  // previews: the height field shaded like raking light, in the panel's own colours
  // a stand-in picture for the Picture swatch: a sun over rolling hills
  const sample = (() => {
    const n = 48, data = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i / n, y = j / n, sun = Math.hypot(x - 0.62, y - 0.34) < 0.16 ? 1 : 0, hill = y > 0.62 + 0.12 * Math.sin(x * 7) ? 0.55 + 0.25 * Math.sin(x * 13 + y * 9) : 0.18;
      data[j * n + i] = Math.max(sun, hill);
    }
    return { w: n, h: n, data };
  })();
  function shade(cv, src, { w = 160, hgt = 120, light = true } = {}) {
    const Pn = normalizePanel(src);
    const C = _compile(Pn, src === P() ? imgOpt() : PANEL_PATTERNS[Pn.pattern].image ? sample : null, src === P() ? demOpt() : null);
    const sc = Math.min(w / Pn.width, hgt / Pn.height) * 0.92, cw = w, ch = hgt;
    cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d'), img = g.createImageData(cw, ch);
    const T = new Float32Array(cw * ch), M = new Uint8Array(cw * ch);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const x = (i + 0.5 - cw / 2) / sc, y = (ch / 2 - j - 0.5) / sc, R = C.evalAt(x, y), k = j * cw + i;
      T[k] = R.r > 0 ? R.t : Pn.base; M[k] = R.d > 0 && R.c > 0 ? 1 : 0;
    }
    const base = new THREE.Color(Pn.finish.color), tips = new THREE.Color(Pn.finish.color2), bg = new THREE.Color(Pn.finish.wall);
    const lx = -0.62, ly = 0.55, lz = 0.56, px = 1 / sc;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const k = j * cw + i, o = k * 4;
      let col;
      if (!M[k]) { col = bg.clone().multiplyScalar(0.96); if (light && i > 0 && j > 0 && M[k - 1 - cw]) col.multiplyScalar(0.8); }
      else {
        const tx = (T[Math.min(k + 1, k - i + cw - 1)] - T[Math.max(k - 1, k - i)]) / (2 * px), ty = (T[Math.max(k - cw, i)] - T[Math.min(k + cw, (ch - 1) * cw + i)]) / (2 * px);
        const nl = Math.hypot(tx, ty, 1), dot = Math.max(0, (-tx * lx - ty * ly + lz) / nl);
        const c0 = C.twoTone && T[k] > C.zc ? tips : base, lift = 0.16 * dot ** 6;
        col = c0.clone().multiplyScalar(0.38 + 0.8 * dot).addScalar(lift);
      }
      img.data[o] = Math.min(255, col.r * 255); img.data[o + 1] = Math.min(255, col.g * 255); img.data[o + 2] = Math.min(255, col.b * 255); img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 400 }) : setTimeout(fn, 30));
  const thumbCache = new Map();
  function presetCard(src, onOpen, extra) {
    const cv = h('canvas', { 'aria-hidden': 'true' });
    const keyStr = JSON.stringify(src);
    const cached = thumbCache.get(keyStr);
    if (cached) idle(() => { cv.width = cached.width; cv.height = cached.height; cv.getContext('2d').drawImage(cached, 0, 0); });
    else idle(() => { shade(cv, src); const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height; c2.getContext('2d').drawImage(cv, 0, 0); thumbCache.set(keyStr, c2); });
    const Pn = normalizePanel(src);
    const b = h('button', { class: 'pn-card', type: 'button', title: `Open ${Pn.name}`, onclick: onOpen }, cv, h('b', {}, Pn.name), h('small', {}, `${PANEL_PATTERNS[Pn.pattern].label} · ${Math.round(Pn.width)} × ${Math.round(Pn.height)}`));
    return extra ? h('div', { class: 'pn-card-wrap' }, b, extra) : b;
  }
  function openPanel(src) {
    const keep = { tiles: { ...P().tiles }, mount: P().mount };
    ps.P = normalizePanel(src);
    if (src.tiles === undefined) ps.P.tiles = keep.tiles;
    if (src.mount === undefined) ps.P.mount = keep.mount;
    commit();
    ps.back = false;
    ps.framedView = null;
    afterLoad();
  }

  function paneShape() {
    const Pn = P();
    const presets = h('div', { class: 'pn-cards' }, ...PANEL_PRESETS.map((pr) => presetCard(pr, () => { openPanel(JSON.parse(JSON.stringify(pr))); toast(`${pr.name} opened`); })));
    const saved = store.get('weft.panels.saved', []);
    const savedGrid = saved.length ? h('div', { class: 'pn-cards' }, ...saved.map((s, i) => presetCard(s, () => openPanel(s),
      h('button', { class: 'icon-btn pn-del', type: 'button', title: `Delete ${s.name}`, 'aria-label': `Delete ${s.name}`, onclick: () => { const list = store.get('weft.panels.saved', []); list.splice(i, 1); store.set('weft.panels.saved', list); renderPane('shape'); }, html: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>' })))) : null;
    const sizeMax = 2400;
    return [
      group('Starting panels', 'Each opens in its own size, pattern, colours and edge, ready to slice for your printer.', presets),
      savedGrid ? group('Your panels', 'Saved from the Export step, on this device.', savedGrid) : null,
      group('Outline', null,
        chipsCtl('', Object.entries(PANEL_SHAPES).map(([k, l]) => ({ value: k, label: l })), () => Pn.shape, (v) => { Pn.shape = v; if (v === 'oval' && Math.abs(Pn.width - Pn.height) < 60) Pn.height = Pn.width; }, local(true)),
        Pn.shape === 'rounded' ? sliderCtl('pn-corner', 'Corner radius', { min: 4, max: Math.round(Math.min(Pn.width, Pn.height) / 2), step: 1, fmt: mmf }, () => Pn.corner, (v) => { Pn.corner = v; }, local()) : null,
        Pn.shape === 'arch' ? h('p', { class: 'note' }, 'A semicircle on a straight-sided panel, like a doorway or a mirror.') : null),
      group('Size', 'Up to 2.4 m either way. The panel slices into as many tiles as it needs.',
        sliderCtl('pn-w', 'Width', { min: 120, max: sizeMax, step: 10, fmt: mmf }, () => Pn.width, (v) => { Pn.width = v; }, local()),
        sliderCtl('pn-h', 'Height', { min: 120, max: sizeMax, step: 10, fmt: mmf }, () => Pn.height, (v) => { Pn.height = v; }, local()),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Common sizes' }, ...[[300, 300], [400, 300], [600, 400], [800, 500], [1000, 600], [500, 700]].map(([w, hh]) =>
          h('button', { class: 'chip', type: 'button', onclick: () => { Pn.width = w; Pn.height = hh; commit(); rebuild(); renderPane('shape'); } }, `${w} × ${hh}`)))),
      group('Edge', 'How the pattern meets the outside of the panel.',
        chipsCtl('', [{ value: 'frame', label: 'Frame', title: 'A flat raised border round the pattern' }, { value: 'bevel', label: 'Bevel', title: 'The relief is cut back at 45° to the edge' }, { value: 'fade', label: 'Fade', title: 'The relief eases out towards the edge' }, { value: 'flush', label: 'Flush', title: 'The pattern runs right to the edge' }], () => Pn.edge, (v) => { Pn.edge = v; }, local(true)),
        Pn.edge === 'frame' || Pn.edge === 'fade' ? sliderCtl('pn-ew', Pn.edge === 'frame' ? 'Frame width' : 'Fade width', { min: 4, max: Pn.edge === 'fade' ? 120 : 60, step: 1, fmt: mmf }, () => Pn.edgeW, (v) => { Pn.edgeW = v; }, local()) : null),
      group('Back', 'The solid plate behind the pattern. Pockets for magnets and screws sit in it.',
        sliderCtl('pn-base', 'Back thickness', { min: 2.4, max: 12, step: 0.2, fmt: mmf }, () => Pn.base, (v) => { Pn.base = v; }, local())),
    ];
  }
  const swatchCache = new Map();
  function patternSwatch(k) {
    const cv = h('canvas', { width: 64, height: 64, 'aria-hidden': 'true' });
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    const ck = `${k}-${P().mode === 'cut' && PANEL_PATTERNS[k].cut ? 'cut' : 'rel'}-${dark}`;
    const done = swatchCache.get(ck);
    if (done) { cv.getContext('2d').drawImage(done, 0, 0); return cv; }
    idle(() => {
      const pat = PANEL_PATTERNS[k];
      const src = panelDefaults({ pattern: k, mode: P().mode === 'cut' && pat.cut ? 'cut' : 'relief', width: 120, height: 120, scale: k === 'reed' ? 14 : k === 'halftone' ? 12 : k === 'contour' || k === 'ridge' ? 34 : k === 'sunburst' || k === 'vortex' || k === 'ripple' ? 18 : 30, depth: 8, edge: 'flush', seed: 3,
        finish: { color: dark ? '#cfcec7' : '#eeebe4', wall: dark ? '#22231f' : '#ffffff' } });
      shade(cv, src, { w: 64, hgt: 64, light: false });
      const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 64; c2.getContext('2d').drawImage(cv, 0, 0); swatchCache.set(ck, c2);
    });
    return cv;
  }
  function panePattern() {
    const Pn = P(), pat = PANEL_PATTERNS[Pn.pattern], cut = Pn.mode === 'cut', ribs = Pn.mode === 'ribs';
    const setMode = (m) => {
      if (Pn.mode === m) return;
      Pn.mode = m;
      if (m === 'cut') { Pn.depth = Math.min(Pn.depth, 4); if (Pn.tiles.seams === 'pattern') Pn.tiles.seams = 'straight'; }
      else if (m === 'ribs') {
        Pn.depth = Math.max(Pn.depth, 22); Pn.base = Math.max(Pn.base, 5); if (Pn.tiles.seams === 'pattern') Pn.tiles.seams = 'straight';
        if (!RIB_FIELDS.includes(Pn.pattern)) { Pn.pattern = 'silk'; }
        tunePattern(Pn, Pn.pattern);
      } else Pn.depth = Math.min(Math.max(Pn.depth, 8), 30);
      commit(); rebuild(); renderAll();
    };
    const grid = h('div', { class: 'patterns', role: 'group', 'aria-label': 'Pattern' });
    for (const k of PANEL_PATTERN_ORDER) {
      const p = PANEL_PATTERNS[k], off = cut && !p.cut;
      grid.append(h('button', { class: 'pat', type: 'button', 'aria-pressed': Pn.pattern === k, disabled: off, title: off ? `${p.label} has no openwork` : p.note, onclick: () => { Pn.pattern = k; tunePattern(Pn, k); commit(); rebuild(); renderAll(); } }, patternSwatch(k), p.label));
    }
    const radial = pat.radial;
    const img = pat.image || pat.tone;
    return [
      groupAct('Pattern', pat.note, h('button', { class: 'mini-btn', type: 'button', title: 'New random pattern, everything else stays', onclick: () => shuffle('pattern'), html: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${DICE}</svg><span>Shuffle</span>` }),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Relief, ribs or openwork' },
          h('button', { type: 'button', 'aria-pressed': Pn.mode === 'relief', title: 'A solid relief surface', onclick: () => setMode('relief') }, 'Relief'),
          h('button', { type: 'button', 'aria-pressed': ribs, title: 'Parallel ribs whose heights follow the pattern', onclick: () => setMode('ribs') }, 'Ribs'),
          pat.cut ? h('button', { type: 'button', 'aria-pressed': cut, title: 'Cut right through, so light and the wall show through', onclick: () => setMode('cut') }, 'Openwork') : null),
        grid,
        cut ? h('p', { class: 'note' }, 'Openwork cuts right through, so light and the wall show through. Every tile keeps solid rails along its seams and round its joints and pockets.') : null,
        ribs ? h('p', { class: 'note' }, 'Thin parallel ribs stand on the back, each one following the pattern\'s height. Broad patterns read best: Silk, Bloom, Lens, Dune, Ripple, Vortex, Contour.') : null),
      pat.terrain ? group('From swisstopo', 'Type a peak, a place or coordinates, frame the area, and Weft downloads the swissALTI3D heights and stitches them. Switzerland and Liechtenstein.', ...swisstopoCtl()) : null,
      pat.terrain ? group('Elevation model', 'The landscape on the panel. You can also load files you downloaded yourself: swissALTI3D as GeoTIFF or XYZ (also zipped), or DHM25 and other ASCII grids. Neighbouring tiles are stitched by their coordinates.', ...terrainCtl()) : null,
      ribs ? group('Ribs', 'Every rib is a straight-sided wall, so it prints crisp without supports.',
        sliderCtl('pn-rw', 'Rib width', { min: 1.6, max: 20, step: 0.2, fmt: mmf }, () => Pn.ribs.width, (v) => { Pn.ribs.width = v; }, local()),
        sliderCtl('pn-rg', 'Gap', { min: 1.6, max: 30, step: 0.2, fmt: mmf }, () => Pn.ribs.gap, (v) => { Pn.ribs.gap = v; }, local()),
        sliderCtl('pn-ra', 'Direction', { min: -90, max: 90, step: 1, fmt: (v) => (v === 0 ? 'upright' : Math.abs(v) === 90 ? 'level' : deg(v)) }, () => Pn.ribs.angle, (v) => { Pn.ribs.angle = v; }, local()),
        sliderCtl('pn-rb', 'Bend', { min: 0, max: 1, step: 0.01, fmt: (v) => (v ? pct(v) : 'straight') }, () => Pn.ribs.bend, (v) => { Pn.ribs.bend = v; }, local()),
        sliderCtl('pn-rf', 'Lowest rib', { min: 0.04, max: 0.8, step: 0.01, fmt: (v) => mmf(v * Pn.depth) }, () => Pn.ribs.floor, (v) => { Pn.ribs.floor = v; }, local()),
        h('p', { class: 'note' }, `${Math.round(Pn.width / (Pn.ribs.width + Pn.ribs.gap))} ribs across. Straight upright or level ribs keep the seams in the gaps between them.`)) : null,
      img ? group('Picture', pat.image ? 'The relief follows its brightness: light areas stand out.' : 'Without a picture the dots follow a gradient from the origin.', pictureCtl()) : null,
      group('Relief', null,
        sliderCtl('pn-depth', cut ? 'Bar relief' : ribs ? 'Rib depth' : 'Depth', { min: 0, max: cut ? 10 : pat.terrain ? maxDepth() : ribs ? 60 : 30, step: 0.5, fmt: mmf }, () => Pn.depth, (v) => { Pn.depth = v; }, { local: true, after: () => { commit(true); rebuild(false); if (pat.terrain) refreshTerrainNote(); } }),
        sliderCtl('pn-scale', ribs ? 'Wave size' : 'Scale', { min: 8, max: ribs ? 600 : 240, step: 1, fmt: mmf }, () => Pn.scale, (v) => { Pn.scale = v; }, local()),
        pat.image || pat.terrain ? null : sliderCtl('pn-vary', pat.blocks ? 'Tilt' : 'Variation', { min: 0, max: 1, step: 0.01, fmt: pct }, () => Pn.vary, (v) => { Pn.vary = v; }, local()),
        pat.blocks && Pn.mode === 'relief' ? sliderCtl('pn-groove', 'Groove between blocks', { min: 1.2, max: 8, step: 0.1, fmt: mmf }, () => Pn.groove, (v) => { Pn.groove = v; }, local()) : null,
        cut ? sliderCtl('pn-open', 'Openness', { min: 0, max: 1, step: 0.01, fmt: pct }, () => Pn.open, (v) => { Pn.open = v; }, local()) : null,
        sliderCtl('pn-angle', 'Angle', { min: -90, max: 90, step: 1, fmt: deg }, () => Pn.angle, (v) => { Pn.angle = v; }, local()),
        pat.image ? null : sliderCtl('pn-warp', 'Warp', { min: 0, max: 1, step: 0.01, fmt: (v) => (v ? pct(v) : 'none') }, () => Pn.warp, (v) => { Pn.warp = v; }, local()),
        cut ? null : switchCtl('pn-inv', pat.label === 'Reed' ? 'Invert (flutes)' : 'Invert', () => Pn.invert, (v) => { Pn.invert = v; }, local()),
        radial ? chipsCtl('Centre', [{ value: 'centre', label: 'Middle' }, { value: 'bottom', label: 'Bottom' }, { value: 'top', label: 'Top' }, { value: 'left', label: 'Left' }, { value: 'corner', label: 'Corner' }], () => Pn.origin, (v) => { Pn.origin = v; }, local()) : null,
        h('div', { class: 'row-ctl' }, h('span', {}, `Seed ${Pn.seed}`), h('button', { class: 'mini-btn', type: 'button', onclick: () => { Pn.seed = 1 + Math.floor(Math.random() * 9999); commit(); rebuild(); renderPane('pattern'); }, html: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${DICE}</svg><span>New seed</span>` }))),
      cut ? null : group('Morph', 'Blend into a second pattern across the panel.',
        h('select', { class: 'select', 'aria-label': 'Second pattern', onchange: (e) => { Pn.morph = e.target.value; commit(); rebuild(); renderPane('pattern'); } },
          h('option', { value: 'none', selected: Pn.morph === 'none' }, 'No morph'),
          ...PANEL_PATTERN_ORDER.filter((k) => k !== Pn.pattern && !PANEL_PATTERNS[k].image).map((k) => h('option', { value: k, selected: Pn.morph === k }, `Into ${PANEL_PATTERNS[k].label}`))),
        Pn.morph !== 'none' ? chipsCtl('Direction', [{ value: 'up', label: 'Upwards' }, { value: 'right', label: 'Left to right' }, { value: 'out', label: 'Outwards' }], () => Pn.morphDir, (v) => { Pn.morphDir = v; }, local()) : null),
      group('Fade', 'Let the pattern melt away towards one side.',
        sliderCtl('pn-fade', 'Fade', { min: 0, max: 1, step: 0.01, fmt: (v) => (v ? pct(v) : 'none') }, () => Pn.fade, (v) => { Pn.fade = v; }, local(true)),
        Pn.fade > 0 ? chipsCtl('Towards', [{ value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'centre', label: 'Middle' }, { value: 'edges', label: 'Edges' }], () => Pn.fadeDir, (v) => { Pn.fadeDir = v; }, local()) : null),
    ];
  }
  // sensible numbers when a pattern is picked
  function tunePattern(Pn, k) {
    if (k === 'diffuser' && Pn.mode === 'relief') { Pn.scale = 30; Pn.depth = Math.max(Pn.depth, 40); Pn.vary = Math.max(Pn.vary, 0.6); Pn.edge = 'flush'; return; }
    if (k === 'terrain') { Pn.edge = Pn.edge === 'frame' ? 'frame' : 'flush'; if (Pn.mode === 'relief') Pn.depth = Math.max(Pn.depth, 18); }
    if (Pn.mode === 'ribs') {
      const R = { silk: 0.5, bloom: 0.2, lens: 0.13, dune: 0.32, ripple: 0.14, vortex: 0.15, sunburst: 0.07, contour: 0.22, ridge: 0.2, chevron: 0.18 };
      Pn.scale = Math.round((R[k] || 0.2) * Math.max(Pn.width, Pn.height));
      return;
    }
    const S = { reed: 22, halftone: 16, contour: 46, ridge: 44, sunburst: 26, vortex: 36, ripple: 40, dune: 60, chevron: 44, truchet: 40, tufted: 66, weave: 44, brick: 60, bubble: 34, moroccan: 52, trellis: 40, basalt: 42, pebble: 40, scale: 44, deco: 48, pixel: 40, pyramid: 50, facet: 44, picture: 60 };
    if (S[k]) Pn.scale = Math.round(S[k] * clamp(Math.sqrt((Pn.width * Pn.height) / (520 * 380)), 0.7, 1.5));
    if (Pn.mode === 'cut' && !PANEL_PATTERNS[k].cut) Pn.mode = 'relief';
    if (Pn.tiles.seams === 'pattern' && !PANEL_PATTERNS[k].cell) Pn.tiles.seams = 'straight';
    if (k === 'contour' && Pn.depth < 12) Pn.depth = 14;
  }
  function pictureCtl() {
    const input = h('input', { type: 'file', accept: 'image/*', hidden: true });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return;
      try { await loadPicture(f); commit(); rebuild(); renderPane('pattern'); toast('Picture loaded'); } catch (e) { console.error(e); toast('Could not read that picture'); }
    });
    const thumb = ps.img ? h('img', { class: 'pn-pic', src: ps.img.url, alt: 'Your picture' }) : h('div', { class: 'pn-pic empty' }, 'No picture yet');
    return h('div', { class: 'pn-picrow' }, thumb, h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => input.click() }, ps.img ? 'Change picture' : 'Choose a picture'),
      ps.img ? h('button', { class: 'btn', type: 'button', onclick: () => { ps.img = null; try { localStorage.removeItem('weft.panel.img'); } catch { /* ok */ } rebuild(); renderPane('pattern'); } }, 'Remove') : null), input);
  }
  // ---------------------------------------------------------------- elevation models
  function terrainCtl() {
    const Pn = P(), T = Pn.terrain;
    const input = h('input', { type: 'file', multiple: true, accept: DEM_EXTENSIONS.map((e) => `.${e}`).join(','), hidden: true });
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])];
      if (files.length) await loadDEM(files);
      input.value = '';
    });
    const d = ps.dem;
    const thumb = h('canvas', { class: 'pn-pic', width: 96, height: 72, 'aria-hidden': 'true' });
    if (d) idle(() => drawDEM(thumb, d));
    const out = [h('div', { class: 'pn-picrow' }, d ? thumb : h('div', { class: 'pn-pic empty' }, 'No model yet'), h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => input.click() }, d ? 'Load other files' : 'Load elevation files'),
      d ? h('button', { class: 'btn', type: 'button', onclick: () => { ps.dem = null; try { localStorage.removeItem('weft.panel.dem'); } catch { /* ok */ } rebuild(); renderPane('pattern'); } }, 'Remove') : null), input)];
    if (d) {
      const m = d.meta, perM = Math.max(Pn.width / m.widthM, Pn.height / m.heightM);
      const relief = (m.zmax - m.zmin) * perM, ratio = Math.round(1000 / perM);
      out.push(h('p', { class: 'note pn-terrain-note' }, terrainNote()));
      out.push(h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', title: 'Keep the width and set the height so the whole map fits with nothing cut off', onclick: () => { Pn.height = clamp(Math.round((Pn.width * m.heightM) / m.widthM), 80, 2400); commit(); rebuild(); renderAll(); } }, 'Shape the panel like the map'),
        h('button', { class: 'btn', type: 'button', title: 'Depth at the true scale of the map, as far as the printer is tall', onclick: () => {
          const want = +relief.toFixed(1), most = maxDepth();
          Pn.depth = clamp(want, 0.5, most); commit(); rebuild(); renderPane('pattern');
          if (want > most) toast(`True scale is ${Math.round(want)} mm deep; your printer takes ${most} mm, so it is ${most} mm. A smaller area or a larger panel gets closer.`);
        } }, 'True scale depth')));
    }
    out.push(
      sliderCtl('pn-water', 'Water level', { min: 0, max: 0.9, step: 0.01, fmt: (v) => (v ? (d ? `${Math.round(d.meta.zmin + v * (d.meta.zmax - d.meta.zmin)).toLocaleString()} m` : pct(v)) : 'none') }, () => T.water, (v) => { T.water = v; }, local()),
      sliderCtl('pn-steps', 'Terraces', { min: 0, max: 40, step: 1, fmt: (v) => (v ? `${v} steps` : 'smooth') }, () => T.steps, (v) => { T.steps = v; }, local()),
      h('p', { class: 'note' }, 'Everything below the water level prints flat, like a lake. Terraces turn the slopes into steps like a contour map; with Two-tone tips the peaks come out snowy.'));
    return out;
  }
  // how the chosen Depth compares with the real relief at this panel's scale
  function terrainNote() {
    const Pn = P(), d = ps.dem;
    if (!d) return '';
    const m = d.meta, perM = Math.max(Pn.width / m.widthM, Pn.height / m.heightM);
    const relief = (m.zmax - m.zmin) * perM, ratio = Math.round(1000 / perM), k = Pn.depth / Math.max(relief, 1e-3);
    const how = k > 1.08 ? `Depth ${Pn.depth} mm stretches it ${k.toFixed(1)}× taller than true.` : k < 0.92 ? `Depth ${Pn.depth} mm squashes it to ${k < 0.5 ? `1/${Math.round(1 / k)}` : `${Math.round(k * 100)}%`} of its true height.` : `Depth ${Pn.depth} mm is true scale.`;
    return `${m.source ? `${m.source} · ` : ''}${m.tiles} tile${m.tiles > 1 ? 's' : ''} · ${fmtLen(m.widthM)} × ${fmtLen(m.heightM)} · ${Math.round(m.zmin).toLocaleString()} to ${Math.round(m.zmax).toLocaleString()} m. On this panel that is 1 : ${ratio.toLocaleString()}, so the true relief is ${relief < 1 ? relief.toFixed(2) : Math.round(relief)} mm tall. ${how}`;
  }
  function refreshTerrainNote() { const n = el.panes.pattern.querySelector('.pn-terrain-note'); if (n) n.textContent = terrainNote(); }
  // ---------------------------------------------------------------- swisstopo downloads
  const GEO_MAX = { 2: 150, 0.5: 9 };
  const geoAspect = () => P().width / P().height;
  const geoRect = () => areaRect(ps.geo.e, ps.geo.n, ps.geo.km, geoAspect());
  const geoGsd = () => (ps.geo.fine && ps.geo.km <= 1.5 ? 0.5 : 2);
  const fmtKm = (m) => `${+(m / 1000).toFixed(m < 10000 ? 1 : 0)}`;
  const geoSize = (r) => `${fmtKm(r.e1 - r.e0)} × ${fmtKm(r.n1 - r.n0)} km`;
  const saveGeo = () => store.set('weft.panel.geo', ps.geo);
  function swisstopoCtl() {
    const q = h('input', { class: 'text', type: 'search', placeholder: 'A peak, a place, or coordinates', value: ps.geoQuery, 'aria-label': 'Place or coordinates', spellcheck: 'false', autocomplete: 'off', enterkeyhint: 'search' });
    const go = h('button', { class: 'btn pn-geo-go', type: 'button' }, 'Search');
    const hits = h('div', { class: 'pn-hits', 'aria-label': 'Places found' });
    const area = h('div', { class: 'pn-geo' });
    const search = async () => {
      const text = q.value.trim();
      ps.geoQuery = text;
      if (!text) { q.focus(); return; }
      go.disabled = true; go.textContent = 'Searching…';
      try {
        ps.geoHits = (await searchPlaces(text)).slice(0, 6);
        if (!ps.geoHits.length) toast('Nothing by that name. Try another spelling, or type coordinates.');
        // typed coordinates need no list
        else if (ps.geoHits[0].kind === 'coordinates') { go.disabled = false; go.textContent = 'Search'; pickPlace(ps.geoHits[0]); return; }
      } catch (e) { console.warn(e); ps.geoHits = null; toast(offline(e)); }
      go.disabled = false; go.textContent = 'Search';
      paintHits();
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    q.addEventListener('input', () => { ps.geoQuery = q.value; });
    go.addEventListener('click', search);
    function paintHits() {
      hits.replaceChildren(...(ps.geoHits || []).map((p) => h('button', { class: 'pn-hit', type: 'button', onclick: () => pickPlace(p) },
        h('b', {}, p.name), h('small', {}, [p.type, p.where].filter(Boolean).join(' · ')))));
      hits.hidden = !(ps.geoHits && ps.geoHits.length);
    }
    function pickPlace(p) {
      const was = ps.geo || {};
      ps.geo = { name: p.name, type: p.type, e: Math.round(p.e), n: Math.round(p.n), km: was.km || 3, fine: !!was.fine };
      ps.geoHits = null;
      saveGeo(); paintHits(); paintArea();
    }
    function paintArea() {
      if (!ps.geo) { area.replaceChildren(); return; }
      const G = ps.geo;
      // the national map round the area; a click moves the area there
      const img = h('img', { alt: '', draggable: 'false', decoding: 'async' });
      const box = h('div', { class: 'pn-geo-box' });
      const pin = h('div', { class: 'pn-geo-pin' });
      const map = h('div', { class: 'pn-geo-map', title: 'Click to move the area there' }, img, box, pin,
        h('span', { class: 'pn-geo-credit' }, '© swisstopo'));
      let shown = null, want = null, timer = 0;
      const viewFor = () => {
        const r = geoRect(), s = Math.max((r.e1 - r.e0) / 4, (r.n1 - r.n0) / 3) * 2.1;
        return { e0: G.e - 2 * s, e1: G.e + 2 * s, n0: G.n - 1.5 * s, n1: G.n + 1.5 * s };
      };
      const place = () => {
        const v = shown || viewFor(), r = geoRect(), W = v.e1 - v.e0, H = v.n1 - v.n0;
        Object.assign(box.style, { left: `${((r.e0 - v.e0) / W) * 100}%`, top: `${((v.n1 - r.n1) / H) * 100}%`, width: `${((r.e1 - r.e0) / W) * 100}%`, height: `${((r.n1 - r.n0) / H) * 100}%` });
        Object.assign(pin.style, { left: `${((G.e - v.e0) / W) * 100}%`, top: `${((v.n1 - G.n) / H) * 100}%` });
      };
      const load = () => {
        const v = viewFor(), url = mapURL(v, 640, 480);
        if (want === url) return;
        want = url;
        const im = new Image();
        im.onload = () => { if (want !== url) return; img.src = url; shown = v; map.classList.remove('off'); place(); };
        im.onerror = () => { if (want === url) map.classList.add('off'); };
        im.src = url;
      };
      const later = () => { clearTimeout(timer); timer = setTimeout(load, 260); };
      map.addEventListener('click', (e) => {
        if (!shown || ps.geoBusy) return;
        const b = map.getBoundingClientRect(), v = shown;
        G.e = Math.round(v.e0 + ((e.clientX - b.left) / b.width) * (v.e1 - v.e0));
        G.n = Math.round(v.n1 - ((e.clientY - b.top) / b.height) * (v.n1 - v.n0));
        G.moved = true;
        saveGeo(); place(); sum(); later();
      });
      const fineRow = switchCtl('pn-geo-fine', 'Finest detail (0.5 m grid)', () => G.fine, (v) => { G.fine = v; }, { local: true, after: () => { saveGeo(); sum(); } });
      const note = h('p', { class: 'note pn-geo-sum' });
      const fetchBtn = h('button', { class: 'btn primary pn-geo-fetch', type: 'button' });
      const sum = () => {
        const r = geoRect(), gsd = geoGsd(), n = tilesFor(r), max = GEO_MAX[gsd];
        fineRow.style.display = G.km > 1.5 ? 'none' : '';
        const mb = Math.max(1, Math.round(n * TILE_MB[gsd]));
        // the area already on the panel
        const d = ps.dem && ps.dem.meta, here = !!d && d.e === Math.round((r.e0 + r.e1) / 2) && d.n === Math.round((r.n0 + r.n1) / 2) && Math.abs(d.widthM - (r.e1 - r.e0)) < 1 && Math.abs(d.heightM - (r.n1 - r.n0)) < 1 && d.gsd === gsd;
        note.textContent = n > max
          ? `${geoSize(r)} touches ${n} tiles at ${gsd} m, more than the ${max} Weft fetches at once. Make the area smaller${gsd < 2 ? ' or turn off Finest detail' : ''}.`
          : `${G.moved ? 'Near ' : ''}${G.name}: ${geoSize(r)}, ${n} tile${n > 1 ? 's' : ''} at ${gsd} m${here ? '. This area is on the panel now.' : `, up to about ${mb} MB to download.`}`;
        if (!ps.geoBusy) { fetchBtn.textContent = here ? 'On the panel' : 'Fetch the heights'; fetchBtn.disabled = n > max || here; }
      };
      fetchBtn.addEventListener('click', () => (ps.geoBusy ? ps.geoBusy.abort() : download(fetchBtn, sum)));
      const size = sliderCtl('pn-geo-km', 'Area', { min: 0.5, max: 12, step: 0.1, fmt: (v) => geoSize(areaRect(0, 0, v, geoAspect())) }, () => G.km, (v) => { G.km = v; }, { local: true, after: () => { saveGeo(); place(); sum(); later(); } });
      area.replaceChildren(map, size, fineRow, note, fetchBtn);
      place(); sum(); load();
    }
    paintHits(); paintArea();
    return [h('div', { class: 'pn-geo-search' }, q, go), hits, area];
  }
  const offline = (e) => `Could not reach swisstopo${e && e.message && !/fetch|network/i.test(e.message) ? ` (${e.message})` : ''}. Check the connection, or download the tiles yourself and load them below.`;
  async function download(btn, done) {
    const G = ps.geo, rect = geoRect(), gsd = geoGsd(), ctl = new AbortController();
    ps.geoBusy = ctl;
    btn.setAttribute('aria-busy', 'true');
    btn.textContent = 'Finding the tiles…';
    try {
      const m = await fetchTerrain(rect, {
        gsd, max: 1400, signal: ctl.signal,
        onProgress: ({ done: k, total, bytes }) => { btn.textContent = k < total ? `Downloading ${k + 1} of ${total} (${(bytes / 1e6).toFixed(1)} MB) · click to stop` : 'Stitching…'; },
      });
      if (ctl.signal.aborted) throw new Error('Cancelled');
      ps.geoBusy = null;
      if (m.empty > 0.98) { toast('No heights there: swissALTI3D covers Switzerland and Liechtenstein only.'); return; }
      const name = `${G.moved ? 'Near ' : ''}${G.name}`;
      useDEM(m, { tiles: m.files, source: name, e: Math.round((rect.e0 + rect.e1) / 2), n: Math.round((rect.n0 + rect.n1) / 2), gsd });
      toast(`${name}: ${geoSize(rect)}, ${Math.round(m.zmin).toLocaleString()} to ${Math.round(m.zmax).toLocaleString()} m${m.empty > 0.02 ? ` · ${Math.round(m.empty * 100)}% lies outside Switzerland and prints at the lowest height` : ''}`);
    } catch (e) {
      if (ctl.signal.aborted || /cancel|abort/i.test(e.message || '')) toast('Download cancelled');
      else { console.warn(e); toast(/no swissALTI3D/.test(e.message) ? e.message : offline(e)); }
    } finally {
      if (ps.geoBusy === ctl) ps.geoBusy = null;
      btn.removeAttribute('aria-busy');
      if (btn.isConnected) done();
    }
  }
  const fmtLen = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);
  function drawDEM(cv, d) {
    const g = cv.getContext('2d'), w = cv.width, hh = cv.height, img = g.createImageData(w, hh);
    const sc = Math.max(d.w / w, d.h / hh);
    for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
      const x = Math.min(d.w - 2, Math.max(0, Math.floor(d.w / 2 + (i - w / 2) * sc))), y = Math.min(d.h - 2, Math.max(0, Math.floor(d.h / 2 + (j - hh / 2) * sc)));
      const k = y * d.w + x, z = d.data[k], sx = d.data[k + 1] - z, sy = d.data[k + d.w] - z;
      const shade = clamp(0.62 + (sy - sx) * 40, 0, 1) * (0.55 + 0.45 * z), o = (j * w + i) * 4;
      img.data[o] = 120 + 135 * shade; img.data[o + 1] = 115 + 130 * shade; img.data[o + 2] = 100 + 120 * shade; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  async function loadDEM(files) {
    toast(`Reading ${files.length > 1 ? `${files.length} files` : files[0].name}…`);
    await new Promise((r) => setTimeout(r, 30));
    const tiles = [], bad = [];
    for (const f of files) {
      try { tiles.push(...readDEM(f.name, new Uint8Array(await f.arrayBuffer()))); }
      catch (e) { console.warn(e); bad.push(`${f.name}: ${e.message}`); }
    }
    if (!tiles.length) { toast(bad[0] || 'No elevation data in those files'); return; }
    try {
      const m = mosaic(tiles, 1400);
      useDEM(m, { tiles: tiles.length });
      toast(`${tiles.length} tile${tiles.length > 1 ? 's' : ''}: ${fmtLen(m.widthM)} × ${fmtLen(m.heightM)}, ${Math.round(m.zmin).toLocaleString()} to ${Math.round(m.zmax).toLocaleString()} m${bad.length ? ` · ${bad.length} file${bad.length > 1 ? 's' : ''} skipped` : ''}`);
    } catch (e) { console.error(e); toast(e.message || 'Could not read the elevation files'); }
  }
  // a stitched model onto the panel, with a depth that suits it
  function useDEM(m, meta) {
    ps.dem = { id: Date.now(), w: m.w, h: m.h, data: m.data, meta: { widthM: m.widthM, heightM: m.heightM, zmin: m.zmin, zmax: m.zmax, ...meta } };
    const Pn = P();
    if (!PANEL_PATTERNS[Pn.pattern].terrain) { Pn.pattern = 'terrain'; if (Pn.mode === 'cut') Pn.mode = 'relief'; tunePattern(Pn, 'terrain'); }
    // true scale where that is printable and still reads as a panel; mountains are usually far taller than that
    const perM = Math.max(Pn.width / m.widthM, Pn.height / m.heightM), relief = (m.zmax - m.zmin) * perM;
    Pn.depth = Math.round(clamp(relief, 8, Math.min(maxDepth(), 0.35 * Math.min(Pn.width, Pn.height))));
    saveDEM();
    commit(); rebuild(); renderAll();
  }
  // kept on this device at up to 1024 samples across, as 16-bit heights
  function saveDEM() {
    const d = ps.dem; if (!d) return;
    for (const max of [1024, 640, 400]) {
      const sc = Math.max(1, Math.max(d.w, d.h) / max), w = Math.max(2, Math.round(d.w / sc)), hh = Math.max(2, Math.round(d.h / sc));
      const q = new Uint16Array(w * hh);
      for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) q[j * w + i] = Math.round(65535 * d.data[Math.min(d.h - 1, Math.floor((j + 0.5) * sc)) * d.w + Math.min(d.w - 1, Math.floor((i + 0.5) * sc))]);
      const z = deflateSync(new Uint8Array(q.buffer), { level: 6 });
      let b = ''; for (let k = 0; k < z.length; k += 0x8000) b += String.fromCharCode(...z.subarray(k, k + 0x8000));
      if (store.set('weft.panel.dem', { w, h: hh, meta: d.meta, data: btoa(b) })) return;
    }
  }
  try {
    const sd = store.get('weft.panel.dem', null);
    if (sd && sd.data) {
      const bin = atob(sd.data), z = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) z[k] = bin.charCodeAt(k);
      const q = new Uint16Array(inflateSync(z).slice().buffer), data = new Float32Array(q.length);
      for (let k = 0; k < q.length; k++) data[k] = q[k] / 65535;
      ps.dem = { id: Date.now(), w: sd.w, h: sd.h, data, meta: sd.meta };
    }
  } catch (e) { console.warn('elevation model', e); }
  async function loadPicture(file) {
    const url = URL.createObjectURL(file);
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    setPicture(im);
    URL.revokeObjectURL(url);
  }
  function setPicture(im) {
    const max = 320, s = Math.min(1, max / Math.max(im.naturalWidth || im.width, im.naturalHeight || im.height));
    const w = Math.max(8, Math.round((im.naturalWidth || im.width) * s)), hh = Math.max(8, Math.round((im.naturalHeight || im.height) * s));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
    const g = cv.getContext('2d');
    g.filter = 'blur(0.6px)';
    g.drawImage(im, 0, 0, w, hh);
    const d = g.getImageData(0, 0, w, hh).data, data = new Float32Array(w * hh);
    for (let k = 0; k < w * hh; k++) data[k] = (0.2126 * d[k * 4] + 0.7152 * d[k * 4 + 1] + 0.0722 * d[k * 4 + 2]) / 255;
    // stretch the tones so a dull photo still makes a bold relief
    let lo = 1, hi = 0;
    for (const v of data) { if (v < lo) lo = v; if (v > hi) hi = v; }
    for (let k = 0; k < data.length; k++) data[k] = clamp((data[k] - lo) / Math.max(0.05, hi - lo), 0, 1);
    const tc = document.createElement('canvas'); const ts = Math.min(1, 160 / Math.max(w, hh)); tc.width = Math.round(w * ts); tc.height = Math.round(hh * ts);
    tc.getContext('2d').drawImage(cv, 0, 0, tc.width, tc.height);
    ps.img = { w, h: hh, data, url: tc.toDataURL('image/jpeg', 0.8) };
    store.set('weft.panel.img', cv.toDataURL('image/jpeg', 0.85));
  }
  if (savedImg) { const i = new Image(); i.onload = () => { setPicture(i); if (ps.started) rebuild(); }; i.src = savedImg; }

  function paneTiles() {
    const Pn = P(), T = Pn.tiles, pat = PANEL_PATTERNS[Pn.pattern];
    const plan = planPanel(normalizePanel(Pn), bed());
    const auto = !T.cols && !T.rows;
    const patternSeams = T.seams === 'pattern';
    return [
      group('Printer', 'Tiles are sized to fit its bed with a margin all round.',
        h('select', { class: 'select', 'aria-label': 'Printer', onchange: (e) => { api.setPrinter(e.target.value); rebuild(); renderPane('tiles'); } }, ...PRINTERS.map((q) => h('option', { value: q.id, selected: q.id === printer().id }, q.label)))),
      group('Slicing', `${plan.cols * plan.rows - plan.tiles.filter((t) => t.empty).length} tiles, up to ${Math.round(Math.max(...plan.tiles.map((t) => t.x1 - t.x0)))} × ${Math.round(Math.max(...plan.tiles.map((t) => t.y1 - t.y0)))} mm each.`,
        switchCtl('pn-auto', 'Fewest tiles that fit', () => auto, (v) => { if (v) { T.cols = 0; T.rows = 0; } else { T.cols = plan.cols; T.rows = plan.rows; } }, local(true)),
        auto ? null : sliderCtl('pn-cols', 'Tiles across', { min: 1, max: 12, step: 1 }, () => T.cols || plan.cols, (v) => { T.cols = v; T.rows = T.rows || plan.rows; }, local(true)),
        auto ? null : sliderCtl('pn-rows', 'Tiles down', { min: 1, max: 12, step: 1 }, () => T.rows || plan.rows, (v) => { T.rows = v; T.cols = T.cols || plan.cols; }, local(true)),
        h('div', { class: 'pn-map', id: 'pn-map' })),
      group('Seams', patternSeams ? 'Tiles break along the pattern\'s own grooves, so the joins vanish into the relief.' : 'Straight cuts between tiles.',
        chipsCtl('', [{ value: 'straight', label: 'Straight' }, ...(pat.cell && Pn.mode !== 'cut' ? [{ value: 'pattern', label: 'Follow the pattern' }] : [])], () => T.seams, (v) => { T.seams = v; if (v === 'pattern') T.joint = 'none'; else if (T.joint === 'none') T.joint = 'dovetail'; }, local(true)),
        !patternSeams && pat.grid ? switchCtl('pn-snap', 'Put seams in the grooves', () => T.snap, (v) => { T.snap = v; }, local(true)) : null),
      patternSeams ? null : group('Joints', T.joint === 'keys' ? 'Bowtie keys press into pockets in the backs, hidden once it hangs.' : T.joint === 'none' ? 'Plain edges: hang each tile on its own, or glue them.' : 'Tabs through the full thickness lock the tiles together. Press them down into each other on a flat table.',
        chipsCtl('', [{ value: 'dovetail', label: 'Dovetail' }, { value: 'jigsaw', label: 'Jigsaw' }, { value: 'keys', label: 'Hidden keys' }, { value: 'none', label: 'None' }], () => T.joint, (v) => { T.joint = v; }, local(true)),
        T.joint === 'dovetail' || T.joint === 'jigsaw' ? sliderCtl('pn-tab', 'Tab size', { min: 0.6, max: 1.6, step: 0.05, fmt: pct }, () => T.tab, (v) => { T.tab = v; }, local()) : null,
        T.joint !== 'none' ? sliderCtl('pn-clear', 'Clearance', { min: 0, max: 0.6, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm` }, () => T.clearance, (v) => { T.clearance = v; }, local()) : null,
        T.joint !== 'none' ? h('button', { class: 'btn', type: 'button', onclick: fitTest }, 'Download a fit test') : null),
      group('On the back', null,
        switchCtl('pn-labels', 'Tile names in the back (A1, A2…)', () => T.labels, (v) => { T.labels = v; }, local()),
        chipsCtl('Hanging', [{ value: 'tape', label: 'Mounting tape', title: 'A flat back for picture-hanging strips or foam tape' }, { value: 'magnets', label: 'Magnets', title: 'Pockets for 10 × 3 mm magnets; screw steel washers to the wall' }, { value: 'slots', label: 'Screw slots', title: 'Pockets that hang on screw heads' }, { value: 'halo', label: 'Halo stand-offs', title: 'Printed pucks hold the panel 16 mm off the wall for an LED strip behind' }], () => Pn.mount, (v) => { Pn.mount = v; if (v === 'halo') Pn.finish.backlight = true; if ((v === 'magnets' || v === 'halo') && Pn.base < 4.6) Pn.base = 5; if (v === 'slots' && Pn.base < 5.2) Pn.base = 6; }, local(true)),
        h('p', { class: 'note' }, {
          tape: 'Stick picture-hanging strips or foam tape on each tile. Nothing to drill.',
          magnets: 'Glue a 10 × 3 mm magnet into each pocket and screw a steel washer to the wall behind it. Tiles come off and go back in a second.',
          slots: 'Each tile hangs on screw heads standing 4 mm off the wall. The map in the download marks where the screws go.',
          halo: 'Printed pucks press into the pockets and stick to the wall, holding the panel 16 mm out. Run an LED strip round the back for a glowing halo.',
        }[Pn.mount])),
    ];
  }
  // a map of the tiles, drawn to scale
  function renderTileMap() {
    const box = document.getElementById('pn-map');
    if (!box) return;
    const Pn = normalizePanel(P()), plan = planPanel(Pn, bed());
    const pad = 14, W = Pn.width, Hh = Pn.height;
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `${-W / 2 - pad} ${-Hh / 2 - pad} ${W + pad * 2} ${Hh + pad * 2}`);
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', `Tile map: ${plan.cols} by ${plan.rows} tiles`);
    const add = (tag, at, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(at)) e.setAttribute(k, v); if (text) e.textContent = text; s.append(e); return e; };
    const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', 'scale(1,-1)'); s.append(g);
    const path = document.createElementNS(NS, 'path'); path.setAttribute('d', outlinePath(Pn)); path.setAttribute('class', 'pn-map-out'); g.append(path);
    const lw = Math.max(W, Hh) / 260;
    for (let c = 1; c < plan.cols; c++) { const l = document.createElementNS(NS, 'line'); Object.entries({ x1: plan.xs[c], x2: plan.xs[c], y1: -Hh / 2, y2: Hh / 2, class: 'pn-map-seam', 'stroke-width': lw }).forEach(([k, v]) => l.setAttribute(k, v)); g.append(l); }
    for (let r = 1; r < plan.rows; r++) { const l = document.createElementNS(NS, 'line'); Object.entries({ x1: -W / 2, x2: W / 2, y1: plan.ys[r], y2: plan.ys[r], class: 'pn-map-seam', 'stroke-width': lw }).forEach(([k, v]) => l.setAttribute(k, v)); g.append(l); }
    for (const j of [...plan.tabs, ...plan.keys]) { const c = document.createElementNS(NS, 'circle'); Object.entries({ cx: j.x, cy: j.y, r: lw * 3.2, class: 'pn-map-joint' }).forEach(([k, v]) => c.setAttribute(k, v)); g.append(c); }
    const fs = Math.max(W, Hh) / 22;
    for (const t of plan.tiles) if (!t.empty) add('text', { x: (t.x0 + t.x1) / 2, y: -(t.y0 + t.y1) / 2, 'font-size': fs, class: 'pn-map-label', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, t.label);
    box.replaceChildren(s, h('span', { class: 'pn-map-cap' }, plan.pattern ? 'Seams follow the pattern near these lines' : plan.snapped ? 'Seams moved into the grooves' : `${plan.cols} × ${plan.rows}, seen from the front${plan.tabs.length + plan.keys.length ? ' · dots are joints' : ''}`));
  }

  function swatchRow(label, get, set) {
    const wrap = h('div', { class: 'swatches', role: 'group', 'aria-label': label });
    const name = h('span', { class: 'sw-name' });
    const paint = () => {
      wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.c === get()));
      const f = FILAMENTS.find(([, c]) => c === get());
      name.textContent = f ? f[0] : `Custom ${get()}`;
    };
    for (const [n, c] of FILAMENTS) wrap.append(h('button', { class: 'sw', type: 'button', style: `--c:${c}`, 'data-c': c, title: n, 'aria-label': n, onclick: () => { set(c); paint(); refreshMaterials(); commit(); } }));
    const custom = h('input', { type: 'color', value: get(), 'aria-label': `Custom ${label.toLowerCase()}`, style: 'width:30px;height:30px;border:0;padding:0;background:none' });
    custom.addEventListener('input', () => { set(custom.value); paint(); refreshMaterials(); });
    custom.addEventListener('change', () => commit());
    wrap.append(custom);
    paint();
    return [wrap, name];
  }
  function paneFinish() {
    const Pn = P(), F = Pn.finish;
    const leds = h('div', { class: 'chips', role: 'group', 'aria-label': 'LED colour' }, ...LEDS.map(([n, c]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': F.led === c, onclick: () => { F.led = c; commit(); placeGlow(); invalidate(); renderPane('finish'); } }, h('i', { class: 'pn-led', style: `--c:${c}` }), n)));
    const walls = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Wall colour' }, ...WALLS.map(([n, c]) => h('button', { class: 'sw', type: 'button', style: `--c:${c}`, title: n, 'aria-label': n, 'aria-pressed': F.wall === c, onclick: () => { F.wall = c; commit(); refreshMaterials(); renderPane('finish'); } })));
    return [
      groupAct('Filament', F.twoTone ? 'The base colour' : null, h('button', { class: 'mini-btn', type: 'button', onclick: () => shuffle('colour'), html: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${DICE}</svg><span>Shuffle colours</span>` }), ...swatchRow('Filament colour', () => F.color, (c) => { F.color = c; })),
      group('Two-tone tips', 'The top of the relief prints in a second colour. With an AMS it swaps by itself; without one, add one filament change.',
        switchCtl('pn-two', 'Two-tone', () => F.twoTone, (v) => { F.twoTone = v; }, local(true)),
        F.twoTone ? h('div', { class: 'group', style: 'gap:8px' }, ...swatchRow('Tips colour', () => F.color2, (c) => { F.color2 = c; })) : null,
        F.twoTone ? sliderCtl('pn-tone', 'Split height', { min: 0.1, max: 0.9, step: 0.01, fmt: (v) => `${mmf(Pn.base + v * Pn.depth)} up` }, () => F.toneAt, (v) => { F.toneAt = v; }, local()) : null),
      group('Material', 'Preview only', chipsCtl('', Object.entries(MATERIALS).map(([k, m]) => ({ value: k, label: m.label })), () => F.material, (v) => { F.material = v; }, { local: true, after: () => { refreshMaterials(); commit(); } })),
      group('Wall', 'The wall in the preview.', walls),
      group('Backlight', 'An LED strip on the back lights the wall round the panel, and through it if it is openwork.',
        switchCtl('pn-glow', 'Backlight on', () => F.backlight, (v) => { F.backlight = v; }, { local: true, after: () => { commit(); layout(); renderPane('finish'); } }),
        F.backlight ? leds : null,
        F.backlight && Pn.mount !== 'halo' ? h('p', { class: 'note' }, 'For a real halo the panel needs to stand off the wall: choose Halo stand-offs under Tiles.') : null),
    ];
  }
  function paneExport() {
    const Pn = P(), res = ps.res;
    if (!res) return [h('p', { class: 'note' }, 'Building…')];
    const checks = panelChecks({ ...Pn, _hasImage: !!ps.img, _hasDem: !!ps.dem }, res.plan, res);
    const rows = res.tiles.map((t) => {
      const bb = t.bodies.reduce((b, m) => [Math.min(b[0], m.bbox[0]), Math.min(b[1], m.bbox[1]), Math.max(b[2], m.bbox[3]), Math.max(b[3], m.bbox[4]), Math.max(b[4], m.bbox[5])], [1e9, 1e9, -1e9, -1e9, 0]);
      const g = t.bodies.reduce((s, b) => s + b.grams, 0);
      return h('tr', {}, h('td', {}, `Tile ${t.label}`), h('td', { class: 'mono' }, `${Math.round(bb[2] - bb[0])} × ${Math.round(bb[3] - bb[1])} × ${(bb[4]).toFixed(1)}`), h('td', { class: 'mono' }, `${Math.round(g)} g`));
    });
    for (const p of res.parts) rows.push(h('tr', {}, h('td', {}, `${p.label} × ${p.count}`), h('td', { class: 'mono' }, `${p.size[0]} × ${p.size[1]} × ${p.size[2].toFixed(1)}`), h('td', { class: 'mono' }, `${Math.round(p.mesh.grams * p.count)} g`)));
    const total = res.tiles.reduce((s, t) => s + t.bodies.reduce((q, b) => q + b.grams, 0), 0) + res.parts.reduce((s, p) => s + p.mesh.grams * p.count, 0);
    el.dl = h('button', { class: 'btn primary', type: 'button', onclick: exportFiles }, svgIcon('<path d="M10 3v10M6 9l4 4 4-4"/><path d="M3.5 14.5v2h13v-2"/>', 20), h('span', {}, 'Download print files'));
    return [
      group('Print check', null, h('ul', { class: 'checks' }, ...checks.map((c) => h('li', { class: c.level === 'ok' ? '' : c.level }, c.text)))),
      group('Parts', `About ${total > 1000 ? `${(total / 1000).toFixed(2)} kg` : `${Math.round(total)} g`} of PLA in all, at 15% infill.`,
        h('table', { class: 'parts' }, h('thead', {}, h('tr', {}, h('th', {}, 'Part'), h('th', {}, 'Size, mm'), h('th', {}, 'Weight'))), h('tbody', {}, ...rows))),
      group('Files', null,
        chipsCtl('Mesh detail', Object.entries(DETAIL).map(([k, d]) => ({ value: k, label: d.label, title: `${d.res} mm grid: ${d.note}` })), () => ps.detail, (v) => { ps.detail = v; store.set('weft.panel.detail', v); }, { local: true }),
        chipsCtl('Format', [{ value: 'kit', label: 'Complete kit', title: 'A 3MF and an STL for every tile, plus the maps and parts list' }, { value: 'tiles', label: 'A 3MF per tile', title: 'Each tile opens on its own plate, ready to print' }, { value: 'one', label: 'One 3MF', title: 'Every tile in one project, for a MakerWorld listing' }, { value: 'stl', label: 'STL per tile', title: 'For any slicer' }], () => ps.format, (v) => { ps.format = v; store.set('weft.panel.format', v); }, { local: true }),
        h('div', { class: 'btn-row' }, el.dl),
        h('p', { class: 'note' }, 'Every download is a production kit: the tiles and loose parts, an assembly map, a 1:1 wall template, a parts list and print settings. Tiles print face up with no supports.')),
      group('Keep it', null,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn', type: 'button', onclick: saveToDevice }, 'Save to my panels'),
          h('button', { class: 'btn', type: 'button', onclick: saveCover }, 'Save cover image'),
          h('button', { class: 'btn', type: 'button', onclick: () => copyText(JSON.stringify(P())) }, 'Copy design code'))),
    ];
  }

  // ---------------------------------------------------------------- shuffle
  function shuffle(what = 'all') {
    const Pn = P();
    if (what === 'all' || what === 'pattern') {
      const ribsNext = Math.random() < (Pn.mode === 'ribs' ? 0.6 : 0.28);
      const pool = (ribsNext ? RIB_FIELDS : PANEL_PATTERN_ORDER).filter((k) => !PANEL_PATTERNS[k].image && k !== Pn.pattern);
      const k = pick(pool), pat = PANEL_PATTERNS[k];
      Pn.pattern = k;
      Pn.mode = ribsNext ? 'ribs' : pat.cut && Math.random() < 0.3 ? 'cut' : 'relief';
      tunePattern(Pn, k);
      Pn.scale = Math.round(Pn.scale * rnd(0.8, 1.25));
      Pn.depth = Pn.mode === 'cut' ? Math.round(rnd(1.5, 4.5) * 2) / 2 : Pn.mode === 'ribs' ? Math.round(rnd(20, 36)) : Math.round(rnd(7, k === 'contour' ? 18 : 14) * 2) / 2;
      if (Pn.mode === 'ribs') {
        const w = pick([3, 4, 5, 6, 6, 8]), gp = pick([w, w, w * 0.8, w * 1.4]);
        Pn.ribs = { width: w, gap: +gp.toFixed(1), angle: pick([0, 0, 0, 90, 30, -30]), bend: Math.random() < 0.25 ? +rnd(0.2, 0.7).toFixed(2) : 0, floor: +rnd(0.08, 0.25).toFixed(2) };
        Pn.base = Math.max(Pn.base, 5);
      }
      Pn.vary = Math.round(rnd(0.15, 0.85) * 100) / 100;
      Pn.open = Math.round(rnd(0.35, 0.8) * 100) / 100;
      Pn.seed = 1 + Math.floor(Math.random() * 9999);
      Pn.angle = Math.random() < 0.7 ? 0 : pick([45, -45, 90, 30, -30]);
      Pn.warp = Math.random() < 0.18 ? Math.round(rnd(0.2, 0.6) * 100) / 100 : 0;
      if (Pn.mode === 'ribs') tunePattern(Pn, k);
      Pn.invert = Math.random() < 0.12;
      Pn.fade = Math.random() < 0.15 ? Math.round(rnd(0.4, 0.9) * 100) / 100 : 0;
      Pn.fadeDir = pick(['top', 'bottom', 'centre', 'edges', 'left']);
      Pn.morph = Pn.mode !== 'cut' && Math.random() < 0.12 ? pick(PANEL_PATTERN_ORDER.filter((q) => q !== k && !PANEL_PATTERNS[q].image)) : 'none';
      if (PANEL_PATTERNS[k].radial) Pn.origin = pick(['centre', 'centre', 'bottom', 'corner']);
      if (Pn.tiles.seams === 'pattern' && (!pat.cell || Pn.mode === 'cut')) { Pn.tiles.seams = 'straight'; Pn.tiles.joint = 'dovetail'; }
    }
    if (what === 'all' || what === 'shape') {
      Pn.edge = Pn.mode === 'ribs' ? pick(['flush', 'flush', 'frame', 'fade']) : pick(['frame', 'frame', 'flush', 'bevel', 'fade']);
      Pn.edgeW = Pn.edge === 'fade' ? Math.round(rnd(30, 70)) : Math.round(rnd(10, 24));
      if (what === 'shape' || Math.random() < 0.3) {
        Pn.shape = pick(['rect', 'rounded', 'arch', 'oval', 'hex']);
        Pn.corner = Math.round(rnd(16, 60));
        if (Pn.shape === 'arch' && Pn.height < Pn.width * 0.8) [Pn.width, Pn.height] = [Pn.height, Pn.width];
      }
    }
    if (what === 'all' || what === 'colour') {
      const fil = FILAMENTS.map(([, c]) => c);
      Pn.finish.color = pick(fil);
      Pn.finish.twoTone = Pn.mode !== 'cut' && Pn.depth > 6 && Math.random() < (what === 'colour' ? 0.5 : 0.28);
      if (Pn.finish.twoTone) {
        const lum = (c) => { const n = parseInt(c.slice(1), 16); return 0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255); };
        const far = fil.filter((c) => Math.abs(lum(c) - lum(Pn.finish.color)) > 70);
        Pn.finish.color2 = pick(far.length ? far : fil);
        Pn.finish.toneAt = Math.round(rnd(0.4, 0.7) * 100) / 100;
      }
      Pn.finish.material = pick(['matte', 'matte', 'satin', 'silk']);
      if (!Pn.finish.backlight) Pn.finish.wall = pick(WALLS.slice(0, 5))[1];
    }
    if (what === 'all') Pn.name = newName();
    el.name.value = Pn.name;
    fitName();
    commit();
    refreshMaterials();
    renderAll();
    rebuild(true);
  }
  const newName = () => pick(PANEL_NAMES.filter((n) => n !== P().name));

  // ---------------------------------------------------------------- files
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const f3 = (x) => String(Math.round(x * 1000) / 1000);
  // a tile mesh centred on the plate, turned a quarter when the plan lays tiles across the bed
  function plateMesh(m, turn) {
    const P0 = m.position, pos = new Float32Array(P0.length);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < P0.length; k += 3) {
      const x = turn ? -P0[k + 1] : P0[k], y = turn ? P0[k] : P0[k + 1];
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = P0[k + 2];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, P0[k + 2]); z1 = Math.max(z1, P0[k + 2]);
    }
    return { pos, idx: m.index, box: [x0, x1, y0, y1, z0, z1] };
  }
  function centreAll(meshes) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity;
    for (const m of meshes) { x0 = Math.min(x0, m.box[0]); x1 = Math.max(x1, m.box[1]); y0 = Math.min(y0, m.box[2]); y1 = Math.max(y1, m.box[3]); z0 = Math.min(z0, m.box[4]); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    for (const m of meshes) for (let k = 0; k < m.pos.length; k += 3) { m.pos[k] -= cx; m.pos[k + 1] -= cy; m.pos[k + 2] -= z0; }
    return [x1 - x0, y1 - y0];
  }
  function meshXml(out, pos, idx) {
    out.push('<mesh><vertices>');
    let chunk = [];
    for (let k = 0; k < pos.length; k += 3) { chunk.push(`<vertex x="${f3(pos[k])}" y="${f3(pos[k + 1])}" z="${f3(pos[k + 2])}"/>`); if (chunk.length > 20000) { out.push(chunk.join('')); chunk = []; } }
    out.push(chunk.join('')); chunk = [];
    out.push('</vertices><triangles>');
    for (let t = 0; t < idx.length; t += 3) { chunk.push(`<triangle v1="${idx[t]}" v2="${idx[t + 1]}" v3="${idx[t + 2]}"/>`); if (chunk.length > 20000) { out.push(chunk.join('')); chunk = []; } }
    out.push(chunk.join(''));
    out.push('</triangles></mesh>');
  }
  // objects: [{ name, parts: [{ name, pos, idx, fil }], at: [x, y] }]. Bambu Studio and OrcaSlicer read
  // each object's parts with their filaments from Metadata/model_settings.config.
  function threeMF(objects, fils, title) {
    const out = [], cfg = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">\n');
    out.push(`<metadata name="Title">${esc(title)}</metadata>\n<metadata name="Application">Weft studio</metadata>\n<resources>\n`);
    fils.forEach((c, k) => out.push(`<m:colorgroup id="${k + 1}"><m:color color="${c.toUpperCase()}FF"/></m:colorgroup>\n`));
    let next = fils.length + 1;
    const items = [];
    for (const o of objects) {
      if (o.parts.length > 1) {
        const comps = o.parts.map((p) => { const id = next++; out.push(`<object id="${id}" type="model" name="${esc(p.name)}" pid="${p.fil + 1}" pindex="0">`); meshXml(out, p.pos, p.idx); out.push('</object>\n'); return { id, p }; });
        const id = next++;
        out.push(`<object id="${id}" type="model" name="${esc(o.name)}"><components>${comps.map((c) => `<component objectid="${c.id}"/>`).join('')}</components></object>\n`);
        cfg.push(`  <object id="${id}">\n    <metadata key="name" value="${esc(o.name)}"/>\n    <metadata key="extruder" value="${o.parts[0].fil + 1}"/>\n${comps.map((c) => `    <part id="${c.id}" subtype="normal_part">\n      <metadata key="name" value="${esc(c.p.name)}"/>\n      <metadata key="extruder" value="${c.p.fil + 1}"/>\n    </part>\n`).join('')}  </object>\n`);
        items.push([id, o.at]);
      } else {
        const p = o.parts[0], id = next++;
        out.push(`<object id="${id}" type="model" name="${esc(o.name)}" pid="${p.fil + 1}" pindex="0">`); meshXml(out, p.pos, p.idx); out.push('</object>\n');
        cfg.push(`  <object id="${id}">\n    <metadata key="name" value="${esc(o.name)}"/>\n    <metadata key="extruder" value="${p.fil + 1}"/>\n    <part id="${id}" subtype="normal_part">\n      <metadata key="name" value="${esc(o.name)}"/>\n      <metadata key="extruder" value="${p.fil + 1}"/>\n    </part>\n  </object>\n`);
        items.push([id, o.at]);
      }
    }
    out.push('</resources>\n<build>\n');
    for (const [id, at] of items) out.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${f3(at[0])} ${f3(at[1])} 0"/>\n`);
    out.push('</build>\n</model>\n');
    return zipSync({
      '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
      '3D/3dmodel.model': strToU8(out.join('')),
      'Metadata/model_settings.config': strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${cfg.join('')}</config>\n`),
    }, { level: 6 });
  }
  // copies of a small part laid out in rows on one plate
  function partsObjects(parts, bedSize) {
    const objs = [];
    let y = 0;
    for (const p of parts) {
      const m = plateMesh(p.mesh, false);
      const [w, d] = centreAll([m]);
      const per = Math.max(1, Math.floor((bedSize[0] - 20) / (w + 6)));
      for (let k = 0; k < p.count; k++) objs.push({ name: `${p.label} ${k + 1}`, parts: [{ name: p.label, pos: m.pos, idx: m.idx, fil: 0 }], at: [(k % per) * (w + 6), y + Math.floor(k / per) * (d + 6)] });
      y += Math.ceil(p.count / per) * (d + 6) + 8;
    }
    // centre the rows on the plate
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const o of objs) { x0 = Math.min(x0, o.at[0]); x1 = Math.max(x1, o.at[0]); y0 = Math.min(y0, o.at[1]); y1 = Math.max(y1, o.at[1]); }
    for (const o of objs) o.at = [o.at[0] - (x0 + x1) / 2 + bedSize[0] / 2, o.at[1] - (y0 + y1) / 2 + bedSize[1] / 2];
    return objs;
  }
  function tileObject(t, fils, F, turn, at, name) {
    const parts = t.bodies.map((b) => ({ m: plateMesh(b, turn), tone: b.tone }));
    centreAll(parts.map((p) => p.m));
    return {
      name: `${name} ${t.label}`,
      parts: parts.map((p) => ({ name: p.tone ? `Tile ${t.label} tips` : `Tile ${t.label}`, pos: p.m.pos, idx: p.m.idx, fil: fils.indexOf((p.tone ? F.color2 : F.color).toLowerCase()) })),
      at,
    };
  }
  function mapSVG(Pn, plan, tiles) {
    const W = Pn.width, Hh = Pn.height, pad = 20, lw = Math.max(W, Hh) / 400;
    const seams = [];
    for (let c = 1; c < plan.cols; c++) seams.push(`<line x1="${f3(plan.xs[c])}" y1="${f3(-Hh / 2)}" x2="${f3(plan.xs[c])}" y2="${f3(Hh / 2)}"/>`);
    for (let r = 1; r < plan.rows; r++) seams.push(`<line x1="${f3(-W / 2)}" y1="${f3(plan.ys[r])}" x2="${f3(W / 2)}" y2="${f3(plan.ys[r])}"/>`);
    const holes = tiles.flatMap((t) => t.pockets.filter((p) => p.kind === 'magnet' || p.kind === 'slot' || p.kind === 'halo').map((p) => `<circle cx="${f3(p.x)}" cy="${f3(p.y + (p.kind === 'slot' ? 7 : 0))}" r="${f3(lw * 3)}"/>`));
    const labels = tiles.map((t) => `<text x="${f3((t.cell[0] + t.cell[1]) / 2)}" y="${f3(-(t.cell[2] + t.cell[3]) / 2)}">${esc(t.label)}</text>`);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${f3(W + pad * 2)}mm" height="${f3(Hh + pad * 2)}mm" viewBox="${f3(-W / 2 - pad)} ${f3(-Hh / 2 - pad)} ${f3(W + pad * 2)} ${f3(Hh + pad * 2)}">
<title>${esc(Pn.name)}: tile map, seen from the front, at actual size</title>
<g transform="scale(1,-1)" fill="none" stroke="#1b1c1a" stroke-width="${f3(lw)}">
<path d="${outlinePath(Pn)}"/>
<g stroke-dasharray="${f3(lw * 4)} ${f3(lw * 3)}">${seams.join('')}</g>
<g fill="#b3361d" stroke="none">${holes.join('')}</g>
</g>
<g font-family="Helvetica, Arial, sans-serif" font-size="${f3(Math.max(W, Hh) / 20)}" text-anchor="middle" dominant-baseline="central" fill="#1b1c1a">${labels.join('')}</g>
<text x="${f3(-W / 2)}" y="${f3(Hh / 2 + pad * 0.7)}" font-family="Helvetica, Arial, sans-serif" font-size="${f3(pad * 0.45)}" fill="#696a63">${esc(Pn.name)} · ${Math.round(W)} × ${Math.round(Hh)} mm · ${tiles.length} tiles${holes.length ? ' · red dots: screws or washers behind each tile' : ''}</text>
</svg>
`;
  }
  // the overview: every tile where it goes, with its size and weight beside the picture
  function assemblySVG(Pn, plan, tiles, parts) {
    const W = Pn.width, Hh = Pn.height, sc = 520 / Math.max(W, Hh), pw = W * sc, ph = Hh * sc, pad = 28, side = 250;
    const X = (x) => f3(pad + (x + W / 2) * sc), Y = (y) => f3(pad + 40 + (Hh / 2 - y) * sc);
    const rows = tiles.map((t, i) => `<text x="${f3(pad * 2 + pw)}" y="${f3(pad + 70 + i * 20)}">${esc(t.label)}</text><text x="${f3(pad * 2 + pw + 44)}" y="${f3(pad + 70 + i * 20)}" fill="#696a63">${Math.round(t.size[0])} × ${Math.round(t.size[1])} × ${t.size[2].toFixed(0)} mm · ${Math.round(t.grams)} g</text>`);
    const extra = parts.map((p, i) => `<text x="${f3(pad * 2 + pw)}" y="${f3(pad + 80 + (tiles.length + i) * 20)}">${esc(p.label)} × ${p.count}</text>`);
    const cells = tiles.map((t) => {
      const [x0, x1, y0, y1] = t.cell;
      return `<rect x="${X(x0)}" y="${Y(y1)}" width="${f3((x1 - x0) * sc)}" height="${f3((y1 - y0) * sc)}" fill="#c9a07a" stroke="#f7f6f3" stroke-width="1.5"/><text x="${X((x0 + x1) / 2)}" y="${Y((y0 + y1) / 2)}" text-anchor="middle" dominant-baseline="central" font-size="${f3(Math.max(10, Math.min(22, (x1 - x0) * sc * 0.18)))}" font-weight="700" fill="#2b2016">${esc(t.label)}</text>`;
    });
    const clip = `<clipPath id="o"><path transform="translate(${f3(pad + (W / 2) * sc)} ${f3(pad + 40 + (Hh / 2) * sc)}) scale(${f3(sc)} ${f3(-sc)})" d="${outlinePath(Pn)}"/></clipPath>`;
    const hgt = Math.max(ph + pad * 2 + 40, pad + 100 + (tiles.length + parts.length) * 20);
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${f3(pw + side + pad * 3)}" height="${f3(hgt)}" viewBox="0 0 ${f3(pw + side + pad * 3)} ${f3(hgt)}" font-family="Helvetica, Arial, sans-serif" font-size="12">
<title>${esc(Pn.name)}: assembly map</title>
<rect width="100%" height="100%" fill="#f7f6f3"/>
<text x="${pad}" y="${pad + 8}" font-size="18" font-weight="700" fill="#1b1c1a">${esc(Pn.name)}</text>
<text x="${pad}" y="${pad + 26}" fill="#696a63">${Math.round(W)} × ${Math.round(Hh)} mm · ${tiles.length} tiles, ${plan.cols} × ${plan.rows} · seen from the front</text>
<defs>${clip}</defs>
<g clip-path="url(#o)">${cells.join('')}</g>
<path transform="translate(${f3(pad + (W / 2) * sc)} ${f3(pad + 40 + (Hh / 2) * sc)}) scale(${f3(sc)} ${f3(-sc)})" d="${outlinePath(Pn)}" fill="none" stroke="#1b1c1a" stroke-width="${f3(1.5 / sc)}"/>
<text x="${f3(pad * 2 + pw)}" y="${f3(pad + 46)}" font-weight="700" fill="#1b1c1a">Parts</text>
<g fill="#1b1c1a">${rows.join('')}${extra.join('')}</g>
</svg>
`;
  }
  function partsCSV(Pn, tiles, parts, name) {
    const lines = ['part,count,width_mm,height_mm,thickness_mm,grams_each,file'];
    for (const t of tiles) lines.push(`Tile ${t.label},1,${t.size[0].toFixed(1)},${t.size[1].toFixed(1)},${t.size[2].toFixed(1)},${Math.round(t.grams)},${name}-${t.label}`);
    for (const p of parts) lines.push(`${p.label},${p.count},${p.size[0]},${p.size[1]},${p.size[2].toFixed(1)},${Math.round(p.mesh.grams)},${name}-${p.key}`);
    return lines.join('\n') + '\n';
  }
  function settingsText(Pn, plan, built, parts, name, zc) {
    const grid = [];
    for (let r = plan.rows - 1; r >= 0; r--) grid.push('   ' + plan.tiles.filter((t) => t.r === r).map((t) => (t.empty ? '  ' : t.label).padEnd(4)).join(''));
    const F = Pn.finish, g = built.reduce((s, t) => s + t.grams, 0);
    const lines = [
      `${Pn.name} · ${PANEL_SHAPES[Pn.shape]} wall panel, ${Math.round(Pn.width)} × ${Math.round(Pn.height)} mm, ${PANEL_PATTERNS[Pn.pattern].label} ${Pn.mode === 'cut' ? 'openwork' : 'relief'}`,
      `Made with Weft Studio. ${built.length} tiles, about ${g > 1000 ? `${(g / 1000).toFixed(2)} kg` : `${Math.round(g)} g`} of filament.`,
      '', 'Tiles, seen from the front', ...grid,
      '', 'Each tile has its name and an arrow pointing up engraved in its back. assembly-map.svg shows every tile in place with its size, wall-template.svg is the same at actual size, and parts-list.csv lists every part.',
      '', 'Printing',
      '• Every tile prints face up, flat on its back. No supports, no brim (add one for a tile under 80 mm).',
      '• 0.2 mm layers, 2–3 walls, 4 top and 4 bottom layers, 15% infill (gyroid or grid).',
      '• A textured PEI plate gives the back a fine grip pattern; a smooth plate keeps it flat for tape.',
      '• Print one tile first and check it against the next before printing the rest.',
    ];
    if (F.twoTone) lines.push('', 'Two-tone',
      `• The tips are their own part from ${zc.toFixed(2)} mm up. Bambu Studio or OrcaSlicer: open the 3MF; base and tips are already set to filaments 1 and 2. With an AMS it swaps by itself.`,
      `• No AMS: print it all in the base colour and add a filament change (M600 or pause) at ${zc.toFixed(2)} mm.`);
    if (plan.joint === 'dovetail' || plan.joint === 'jigsaw') lines.push('', 'Joining',
      `• ${plan.tabs.length} ${plan.joint} tabs, ${Pn.tiles.clearance.toFixed(2)} mm clearance. Lay the tiles face down on a flat table and press each one down into its neighbour.`,
      '• Too tight: sand the tab lightly or raise Clearance. Too loose: a drop of CA glue in each socket.');
    if (plan.joint === 'keys') lines.push('', 'Joining',
      `• ${plan.keys.length} bowtie keys (parts file). Lay the tiles face down, butt them together and press a key into each pair of half-pockets. A drop of glue makes it permanent.`);
    if (plan.pattern) lines.push('', 'Joining', '• The seams follow the pattern, so neighbours slot together like a puzzle. Hang each tile on its own, or glue edge to edge.');
    lines.push('', 'Hanging', {
      tape: '• Picture-hanging strips or foam tape on the back of every tile. Hang from the top row down.',
      magnets: '• Glue a 10 × 3 mm neodymium magnet into each pocket (check the polarity matches). Screw a steel washer to the wall behind each one: wall-template.svg shows where, at actual size.',
      slots: '• Each tile hangs on screws standing 4 mm off the wall. wall-template.svg prints at actual size: tape it to the wall and drill through the red dots.',
      halo: `• Press a stand-off puck into each pocket (${parts.find((p) => p.key === 'puck')?.count || 0} pucks, parts file), then stick the pucks to the wall with mounting tape. Run a 5 V or 12 V LED strip round the back, about 2 cm in from the edge, facing the wall.`,
    }[Pn.mount]);
    lines.push('', 'Design code (paste into Weft Panels to edit):', JSON.stringify(Pn));
    return lines.join('\n');
  }
  async function exportFiles() {
    const btn = el.dl;
    const label = btn?.lastChild?.textContent;
    const say = (t) => { if (btn) btn.lastChild.textContent = t; };
    if (btn) btn.disabled = true;
    const Pn = normalizePanel(P()), F = Pn.finish, name = slug(Pn.name), bd = bed();
    const res = DETAIL[ps.detail]?.res || 0.55;
    try {
      say('Planning…');
      const head = await builder.run(Pn, { res, bed: bd, final: true, only: [], parts: true, img: imgOpt(), dem: demOpt() });
      const plan = head.plan, parts = head.parts, files = {};
      const fils = [F.color.toLowerCase()];
      if (F.twoTone && !fils.includes(F.color2.toLowerCase())) fils.push(F.color2.toLowerCase());
      const tiles = [], objs = [];
      const live = plan.tiles.filter((t) => !t.empty);
      const cols = Math.ceil(Math.sqrt(live.length)), stride = [bd[0] + 30, bd[1] + 30];
      for (const [k, tile] of live.entries()) {
        say(`Tile ${tile.label} (${k + 1} of ${live.length})…`);
        const out = await builder.run(Pn, { res, bed: bd, final: true, only: [tile.index], img: imgOpt(), dem: demOpt() });
        const t = out.tiles[0];
        if (!t) continue;
        const bb = t.bodies.reduce((q, b) => [Math.min(q[0], b.bbox[0]), Math.min(q[1], b.bbox[1]), Math.max(q[2], b.bbox[3]), Math.max(q[3], b.bbox[4]), Math.max(q[4], b.bbox[5])], [1e9, 1e9, -1e9, -1e9, 0]);
        tiles.push({ label: t.label, cell: t.cell, pockets: t.pockets, grams: t.bodies.reduce((s, b) => s + b.grams, 0), size: [bb[2] - bb[0], bb[3] - bb[1], bb[4]] });
        if (ps.format === 'tiles' || ps.format === 'kit') files[`3mf/${name}-${t.label}.3mf`] = [threeMF([tileObject(t, fils, F, plan.rotated, [bd[0] / 2, bd[1] / 2], Pn.name)], fils, `${Pn.name} ${t.label}`), { level: 0 }];
        if (ps.format === 'one') objs.push(tileObject(t, fils, F, plan.rotated, [(k % cols) * stride[0] + bd[0] / 2, -Math.floor(k / cols) * stride[1] + bd[1] / 2], Pn.name));
        if (ps.format === 'stl' || ps.format === 'kit') {
          for (const b of t.bodies) {
            const m = plateMesh(b, plan.rotated);
            files[`stl/${name}-${t.label}${F.twoTone ? (b.tone ? '-tips' : '-base') : ''}.stl`] = stl({ pos: m.pos, idx: m.idx }, `${Pn.name} ${t.label}`);
          }
        }
        await new Promise((r) => setTimeout(r, 0));
      }
      if (ps.format === 'one') files[`${name}.3mf`] = [threeMF(objs.concat(parts.length ? partsObjects(parts, bd).map((o) => ({ ...o, at: [o.at[0] + (live.length % cols) * stride[0], o.at[1] - Math.floor(live.length / cols) * stride[1]] })) : []), fils, Pn.name), { level: 0 }];
      if (parts.length && ps.format !== 'one') {
        if (ps.format === 'stl' || ps.format === 'kit') for (const p of parts) { const m = plateMesh(p.mesh, false); centreAll([m]); files[`stl/${name}-${p.key}.stl`] = stl({ pos: m.pos, idx: m.idx }, `${Pn.name} ${p.label}`); }
        if (ps.format !== 'stl') files[`3mf/${name}-parts.3mf`] = [threeMF(partsObjects(parts, bd), [F.color.toLowerCase()], `${Pn.name} parts`), { level: 0 }];
      }
      say('Packing files…');
      files['wall-template.svg'] = strToU8(mapSVG(Pn, plan, tiles));
      files['assembly-map.svg'] = strToU8(assemblySVG(Pn, plan, tiles, parts));
      files['parts-list.csv'] = strToU8(partsCSV(Pn, tiles, parts, name));
      files['print-settings.txt'] = strToU8(settingsText(Pn, plan, tiles, parts, name, head.info.zc));
      const zip = zipSync(files, { level: 6 });
      await saveFile(`${name}-panel-files.zip`, new Blob([zip], { type: 'application/zip' }));
    } catch (e) {
      console.error(e);
      toast('Export failed. Try Draft detail or fewer tiles.');
    }
    if (btn) { btn.disabled = false; say(label); }
  }
  // two small pieces with one joint, to dial in the clearance before printing the panel
  async function fitTest() {
    const Pn = normalizePanel(P()), test = fitTestPanel(Pn), T = test.tiles;
    toast('Building the fit test…');
    try {
      const out = await builder.run(test, { res: 0.3, bed: bed(), final: true });
      const objs = out.tiles.map((t, k) => tileObject(t, [Pn.finish.color.toLowerCase()], test.finish, false, [bed()[0] / 2 + (k ? 35 : -35), bed()[1] / 2], 'Fit test'));
      if (out.parts.length) objs.push(...partsObjects(out.parts, bed()).map((o) => ({ ...o, at: [o.at[0], o.at[1] - 50] })));
      // a zip, which every view (the web page included) can save
      const name = `${slug(Pn.name)}-fit-test`, files = { [`${name}.3mf`]: [threeMF(objs, [Pn.finish.color.toLowerCase()], test.name), { level: 0 }] };
      for (const t of out.tiles) { const m = plateMesh(t.bodies[0], false); files[`stl/${name}-${t.label}.stl`] = stl({ pos: m.pos, idx: m.idx }, `Fit test ${t.label}`); }
      for (const p of out.parts) { const m = plateMesh(p.mesh, false); centreAll([m]); files[`stl/${name}-${p.key}.stl`] = stl({ pos: m.pos, idx: m.idx }, `Fit test ${p.label}`); }
      files['fit-test.txt'] = strToU8([
        `Fit test for ${Pn.name}: two small ${test.base} mm pieces (${test.width} × ${test.height} mm together) with one ${T.joint === 'keys' ? 'hidden key' : `${T.joint} tab`} at ${T.clearance.toFixed(2)} mm clearance.`,
        'The fit is all in the outline of the joint, so this thin test fits exactly like the full-thickness panel.',
        '', 'Print it with the same filament and settings as the panel, then join the pieces on a flat table.',
        '• Too tight to press together: raise Clearance by 0.05 to 0.1 mm.',
        '• Loose or rattling: lower Clearance by 0.05 mm.',
        '• Just right: firm hand pressure and no gap you can see.',
      ].join('\n'));
      await saveFile(`${name}.zip`, new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' }));
    } catch (e) { console.error(e); toast('Could not build the fit test'); }
  }
  function saveToDevice() {
    const list = store.get('weft.panels.saved', []);
    list.unshift(JSON.parse(JSON.stringify(P())));
    if (list.length > 24) list.length = 24;
    if (store.set('weft.panels.saved', list)) toast(`${P().name} saved to your panels`); else toast('This browser is not keeping saved panels');
  }
  async function saveCover() {
    const W = 2000, Hh = 1500, size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(W, Hh, false);
    camera.aspect = W / Hh; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const out = document.createElement('canvas'); out.width = W; out.height = Hh;
    const g = out.getContext('2d');
    g.fillStyle = wallMat.color.getStyle(); g.fillRect(0, 0, W, Hh);
    g.drawImage(renderer.domElement, 0, 0, W, Hh);
    const night = P().finish.backlight || new THREE.Color(P().finish.wall).getHSL({}).l < 0.4;
    g.fillStyle = night ? '#ecece6' : '#1b1c1a';
    g.font = `700 ${Math.round(W * 0.04)}px "Bricolage Grotesque", Arial, sans-serif`;
    g.fillText(P().name, W * 0.05, Hh - W * 0.07);
    g.globalAlpha = 0.7;
    g.font = `400 ${Math.round(W * 0.015)}px "DM Mono", monospace`;
    g.fillText(`WALL PANEL  ·  ${Math.round(P().width)} × ${Math.round(P().height)} MM  ·  ${ps.res?.tiles.length || 1} TILES  ·  NO SUPPORTS`, W * 0.052, Hh - W * 0.042);
    g.globalAlpha = 1;
    renderer.setPixelRatio(pr); renderer.setSize(size.x, size.y, false);
    camera.aspect = size.x / size.y; camera.updateProjectionMatrix();
    invalidate();
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    await saveFile(`${slug(P().name)}-cover.png`, blob);
  }

  // ---------------------------------------------------------------- view switching and tools
  function setView(v) {
    ps.view = v;
    el.views.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v));
    layout();
    frame(false);
  }
  function syncTools() {
    const F = P().finish;
    for (const [b, on] of [[el.tGlow, F.backlight], [el.tBack, ps.back], [el.tLight, ps.light !== 24]]) { b.setAttribute('aria-pressed', !!on); b.classList.toggle('on', !!on); }
    el.tBack.disabled = ps.view === 'print';
    el.tGlow.disabled = ps.view === 'print';
  }
  const measure = document.createElement('canvas').getContext('2d');
  function fitName() {
    const cs = getComputedStyle(el.name);
    if (!cs.fontSize) return;
    measure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    el.name.style.width = `${Math.ceil(measure.measureText(el.name.value || ' ').width + 8)}px`;
  }
  el.name.addEventListener('input', () => { P().name = el.name.value || 'Untitled'; fitName(); });
  el.name.addEventListener('change', () => commit());
  el.dice.addEventListener('click', () => { P().name = newName(); el.name.value = P().name; fitName(); commit(); });

  // ---------------------------------------------------------------- styles shared by both designs
  if (!document.getElementById('pn-css')) {
    const css = document.createElement('style');
    css.id = 'pn-css';
    css.textContent = `
.pn-root { --pn-raised: var(--raised, #fff); --pn-line: var(--line, #ddd); --pn-muted: var(--muted, #777); }
.pn-stage canvas { cursor: grab; }
.pn-labels { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
.pn-labels span { position: absolute; left: 0; top: 0; font: 600 12px/1 var(--f-mono, monospace); color: var(--ink); background: color-mix(in srgb, var(--pn-raised) 86%, transparent); border: 1px solid var(--pn-line); border-radius: 6px; padding: 4px 6px; white-space: nowrap; }
.pn-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.pn-card { border: 1px solid var(--pn-line); background: var(--pn-raised); border-radius: 10px; padding: 0 0 8px; display: grid; gap: 2px; text-align: left; overflow: hidden; color: inherit; transition: border-color 0.12s, transform 0.12s; width: 100%; }
.pn-card:hover { border-color: var(--faint, #aaa); transform: translateY(-1px); }
.pn-card canvas { width: 100%; aspect-ratio: 4 / 3; display: block; background: var(--sunken, #eee); border-bottom: 1px solid var(--pn-line); margin-bottom: 4px; }
.pn-card b { font-size: 12.5px; padding: 0 9px; }
.pn-card small { font-size: 11px; color: var(--pn-muted); padding: 0 9px; }
.pn-card-wrap { position: relative; }
.pn-del { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; background: color-mix(in srgb, var(--pn-raised) 85%, transparent); }
.pn-map { display: grid; gap: 6px; }
.pn-map svg { width: 100%; max-height: 260px; background: var(--sunken, #eee); border-radius: 8px; }
.pn-map-out { fill: color-mix(in srgb, var(--pn-raised) 85%, transparent); stroke: var(--ink); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.pn-map-seam { stroke: var(--accent); stroke-dasharray: 6 4; vector-effect: non-scaling-stroke; }
.pn-map-joint { fill: var(--accent); }
.pn-map-label { fill: var(--ink); font-family: var(--f-mono, monospace); font-weight: 600; }
.pn-map-cap { font: 11px var(--f-mono, monospace); color: var(--pn-muted); }
.pn-picrow { display: grid; grid-template-columns: 96px 1fr; gap: 12px; align-items: center; }
.pn-pic { width: 96px; height: 72px; object-fit: cover; border-radius: 8px; border: 1px solid var(--pn-line); display: grid; place-items: center; font-size: 11px; color: var(--pn-muted); text-align: center; }
.pn-geo-search { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.pn-geo-search .btn { width: auto; }
.pn-hits { display: grid; gap: 2px; border: 1px solid var(--pn-line); border-radius: 9px; padding: 3px; background: var(--pn-raised); }
.pn-hits[hidden] { display: none; }
.pn-hit { display: grid; gap: 1px; text-align: left; padding: 6px 8px; border-radius: 7px; border: 0; background: transparent; color: inherit; min-width: 0; }
.pn-hit:hover, .pn-hit:focus-visible { background: var(--sunken, #eee); }
.pn-hit b { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pn-hit small { font-size: 11px; color: var(--pn-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pn-geo { display: grid; gap: 10px; }
.pn-geo:empty { display: none; }
.pn-geo-map { position: relative; aspect-ratio: 4 / 3; border-radius: 9px; overflow: hidden; border: 1px solid var(--pn-line); background: var(--sunken, #eee); cursor: crosshair; }
.pn-geo-map img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; user-select: none; }
.pn-geo-map.off { aspect-ratio: auto; height: 0; border: 0; }
.pn-geo-box { position: absolute; border: 2px solid var(--accent, #c43); border-radius: 2px; box-shadow: 0 0 0 9999px rgba(20, 18, 16, 0.28); pointer-events: none; transition: left 0.15s, top 0.15s, width 0.15s, height 0.15s; }
.pn-geo-pin { position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; border-radius: 50%; background: var(--accent, #c43); border: 2px solid #fff; pointer-events: none; }
.pn-geo-credit { position: absolute; right: 4px; bottom: 3px; font-size: 9.5px; color: #333; background: rgba(255, 255, 255, 0.75); padding: 1px 4px; border-radius: 3px; pointer-events: none; }
.pn-geo-fetch[aria-busy=true] { opacity: 0.85; }
.pn-led { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--c); margin-right: 6px; box-shadow: 0 0 6px var(--c); vertical-align: -1px; }
.pn-head .step-title { display: flex !important; }
.pn-head p { display: block !important; }
`;
    document.head.append(css);
  }

  // ---------------------------------------------------------------- public
  function start() {
    if (ps.started) return;
    ps.started = true;
    el.name.value = P().name;
    fitName();
    document.fonts?.ready?.then(fitName);
    refreshMaterials();
    setTab(ps.tab);
    syncTools();
    resize();
    rebuild(true);
  }
  // in the classic design the panels sit further down the page: build them once they scroll into view
  if (!v2 && 'IntersectionObserver' in window) {
    new IntersectionObserver((ents) => { for (const e of ents) { ps.active = e.isIntersecting; if (e.isIntersecting) { start(); resize(); } } }, { rootMargin: '200px' }).observe(root);
  }
  return {
    show() { ps.active = true; start(); resize(); invalidate(); },
    hide() { if (v2) ps.active = false; },
    undo: () => travel(-1),
    redo: () => travel(1),
    canUndo: () => history.at > 0,
    canRedo: () => history.at < history.stack.length - 1,
    exportFiles: () => { setTab('export'); return exportFiles(); },
    goExport: () => setTab('export'),
    shuffle,
    refreshTheme() { swatchCache.clear(); renderPane(ps.tab); },
    frame: () => frame(false),
    loadCode(text) { try { const o = JSON.parse(text); if (o && o.kind === 'panel') { openPanel(o); return true; } } catch { /* not a panel */ } return false; },
    get active() { return ps.active; },
  };
}
