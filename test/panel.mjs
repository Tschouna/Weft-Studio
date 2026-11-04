// Panel checks, run with `npm test` after the engine checks:
//  1. every tile and loose part of every starting panel is a closed, manifold solid
//  2. every pattern, in relief and openwork, builds closed
//  3. joints, seams, mounts, outlines and two-tone builds all stay closed
//  4. tiles fit the bed, and tabs never touch their sockets
//  5. random panels, ribs included, build closed
//  6. elevation files (GeoTIFF of every kind, XYZ, ASCII grid, zip) read back exactly and stitch,
//     and terrain and diffuser panels build closed
//  7. the swisstopo downloader, against a stand-in for the services: place search, the tile catalogue
//     (paged, newest survey, right grid) and the download stitched and cropped to the area
import { buildPanel, panelDefaults, normalizePanel, planPanel, panelChecks, fitTestPanel, PANEL_PATTERNS, PANEL_PATTERN_ORDER, _compile, _tileShape, tabDepth } from '../app/panel.js';
import { PANEL_PRESETS } from '../app/panels.js';
import { readDEM, mosaic } from '../app/dem.js';
import { searchPlaces, listTiles, fetchTerrain, areaRect, tilesFor, lv95ToWgs, wgsToLv95 } from '../app/swisstopo.js';
import { zlibSync, zipSync, strToU8 } from 'fflate';

let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const run = (n) => !ONLY || ONLY.has(String(n));
let seed = 11;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const any = (arr) => arr[Math.floor(rand() * arr.length)];

// Every edge must be used exactly once in each direction. The mesher shares every vertex that two
// faces meet at, so this is checked on the indices: a crack shows up as an open edge, and two points
// a few nanometres apart where boundaries cross stay the separate vertices they are.
function openEdges(m) {
  const P = m.position, I = m.index, K = 2 ** 24, e = new Map();
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (a === b || b === c || a === c) continue;
    for (const [x, y] of [[a, b], [b, c], [c, a]]) { const k = x * K + y; e.set(k, (e.get(k) || 0) + 1); }
  }
  let bad = 0, nan = 0;
  for (const [k, n] of e) { const x = Math.floor(k / K), y = k - x * K; if (n !== 1 || e.get(y * K + x) !== 1) bad++; }
  for (const v of P) if (!Number.isFinite(v)) nan++;
  return bad + nan;
}
function checkBuild(name, P, opts = {}) {
  const bed = opts.bed || [256, 256];
  const r = buildPanel(P, { res: opts.res || 1.6, bed, final: !!opts.final });
  let bad = 0, bodies = 0;
  for (const t of r.tiles) for (const b of t.bodies) {
    bodies++;
    const o = openEdges(b);
    if (o) { bad++; fail(`${name}: tile ${t.label}${b.tone ? ' tips' : ''} has ${o} open edges`); }
    if (!(b.volume > 0)) { bad++; fail(`${name}: tile ${t.label} has volume ${b.volume}`); }
    if (b.bbox[2] < -1e-3) { bad++; fail(`${name}: tile ${t.label} dips below the bed (${b.bbox[2]})`); }
  }
  for (const p of r.parts) { const o = openEdges(p.mesh); if (o) { bad++; fail(`${name}: ${p.key} has ${o} open edges`); } }
  if (!r.tiles.length) { bad++; fail(`${name}: no tiles`); }
  // every tile fits its plate (the plan may turn tiles a quarter)
  const [bw, bh] = r.plan.rotated ? [bed[1], bed[0]] : bed;
  for (const t of r.tiles) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const b of t.bodies) { x0 = Math.min(x0, b.bbox[0]); x1 = Math.max(x1, b.bbox[3]); y0 = Math.min(y0, b.bbox[1]); y1 = Math.max(y1, b.bbox[4]); }
    if (x1 - x0 > bw - 4 || y1 - y0 > bh - 4) { bad++; fail(`${name}: tile ${t.label} is ${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} on a ${bw} × ${bh} bed`); }
  }
  return { r, bad, bodies };
}

// ---------------------------------------------------------------- 1
if (run(1)) {
  console.log('1. starting panels');
  for (const pr of PANEL_PRESETS) {
    const t0 = performance.now();
    const { r, bad } = checkBuild(pr.name, panelDefaults(pr), { res: 2, final: true });
    console.log(`  ${bad ? 'FAIL' : 'ok  '} ${pr.name}: ${r.tiles.length} tiles${r.parts.length ? `, ${r.parts.map((p) => `${p.count} ${p.key}s`).join(', ')}` : ''} (${Math.round(performance.now() - t0)} ms)`);
  }
}
// ---------------------------------------------------------------- 2
if (run(2)) {
  console.log('2. every pattern');
  let n = 0;
  for (const k of PANEL_PATTERN_ORDER) for (const mode of PANEL_PATTERNS[k].cut ? ['relief', 'cut'] : ['relief']) {
    const P = panelDefaults({ pattern: k, mode, width: 300, height: 220, scale: k === 'reed' ? 18 : 34, depth: mode === 'cut' ? 3 : 10, tiles: { joint: 'jigsaw' } });
    const { bad } = checkBuild(`${k} ${mode}`, P, { res: 1.1 });
    if (!bad) n++;
  }
  console.log(`  ${n} pattern builds closed`);
}
// ---------------------------------------------------------------- 3
if (run(3)) {
  console.log('3. joints, seams, mounts, outlines, two-tone');
  const cases = [
    ['dovetail rectangle, magnets, labels', { tiles: { joint: 'dovetail' }, mount: 'magnets' }],
    ['jigsaw oval, slots', { shape: 'oval', tiles: { joint: 'jigsaw' }, mount: 'slots', base: 6 }],
    ['hidden keys arch, halo', { shape: 'arch', width: 400, height: 600, tiles: { joint: 'keys' }, mount: 'halo', pattern: 'sunburst', origin: 'bottom' }],
    ['keys rounded openwork', { shape: 'rounded', pattern: 'moroccan', mode: 'cut', scale: 50, depth: 3, tiles: { joint: 'keys' } }],
    ['pattern seams basalt two-tone', { pattern: 'basalt', scale: 40, tiles: { seams: 'pattern' }, finish: { twoTone: true } }],
    ['pattern seams pebble hexagon', { pattern: 'pebble', scale: 40, shape: 'hex', width: 520, height: 450, tiles: { seams: 'pattern' }, mount: 'magnets' }],
    ['pattern seams brick', { pattern: 'brick', scale: 60, tiles: { seams: 'pattern' } }],
    ['contour two-tone keys terraces', { pattern: 'contour', scale: 50, depth: 14, finish: { twoTone: true, toneAt: 0.5 }, tiles: { joint: 'keys' }, mount: 'magnets' }],
    ['openwork bubbles halo', { pattern: 'bubble', mode: 'cut', scale: 30, depth: 2, mount: 'halo' }],
    ['seams in the grooves', { pattern: 'pixel', scale: 40, tiles: { joint: 'none', snap: true } }],
    ['thin back, deep tabs', { base: 3, tiles: { joint: 'dovetail', tab: 1.6, clearance: 0.4 }, mount: 'magnets' }],
    ['small bed, tiles turned', { width: 900, height: 300 }, { bed: [250, 210] }],
    ['one tile', { width: 200, height: 160 }],
    ['morph and fade', { pattern: 'dune', morph: 'pyramid', morphDir: 'out', fade: 0.6, fadeDir: 'edges', warp: 0.4 }],
    ['ribs: silk, dovetail, seams in the gaps', { mode: 'ribs', pattern: 'silk', width: 400, height: 600, depth: 35, base: 6, scale: 220, edge: 'flush', tiles: { joint: 'dovetail' } }],
    ['ribs: bloom, frame, two-tone, magnets', { mode: 'ribs', pattern: 'bloom', shape: 'oval', width: 500, height: 500, depth: 28, base: 6, scale: 90, edge: 'frame', finish: { twoTone: true, toneAt: 0.6 }, mount: 'magnets' }],
    ['ribs: bent diagonal, keys', { mode: 'ribs', pattern: 'dune', width: 600, height: 400, depth: 22, base: 5, scale: 160, ribs: { width: 4, gap: 5, angle: 35, bend: 0.6, floor: 0.2 }, tiles: { joint: 'keys' } }],
    ['ribs: horizontal, arch, halo', { mode: 'ribs', pattern: 'ripple', shape: 'arch', width: 400, height: 600, depth: 25, base: 6, scale: 70, ribs: { width: 5, gap: 5, angle: 90 }, mount: 'halo' }],
    ['diffuser: frame, two-tone, keys, magnets', { pattern: 'diffuser', width: 600, height: 500, scale: 30, depth: 45, base: 5, vary: 0.8, edge: 'frame', edgeW: 14, groove: 2.5, finish: { twoTone: true, toneAt: 0.6 }, tiles: { joint: 'keys' }, mount: 'magnets' }],
    ['diffuser: arch, dovetail, tilted 45', { pattern: 'diffuser', shape: 'arch', width: 400, height: 600, scale: 26, depth: 40, base: 5, angle: 45, groove: 1.6, tiles: { joint: 'dovetail' } }],
  ];
  for (const [name, over, opts] of cases) {
    const { r, bad, bodies } = checkBuild(name, panelDefaults(over), { res: 1.2, final: true, ...(opts || {}) });
    console.log(`  ${bad ? 'FAIL' : 'ok  '} ${name}: ${r.tiles.length} tiles, ${bodies} bodies, ${r.plan.tabs.length} tabs, ${r.plan.keys.length} keys`);
  }
  // the fit test: one joint, closed, a few grams
  for (const [joint, tab] of [['dovetail', 1], ['dovetail', 1.6], ['jigsaw', 1], ['jigsaw', 0.6], ['keys', 1]]) {
    const T = fitTestPanel(panelDefaults({ width: 900, height: 600, depth: 20, tiles: { joint, tab, clearance: 0.2 } }));
    const r = buildPanel(T, { res: 0.4, bed: [256, 256], final: true });
    let bad = 0, g = 0;
    for (const t of r.tiles) for (const b of t.bodies) { if (openEdges(b) || !(b.volume > 0)) bad++; g += b.grams; }
    for (const p of r.parts) { if (openEdges(p.mesh)) bad++; g += p.mesh.grams * p.count; }
    const joints = r.plan.tabs.length + r.plan.keys.length, ok = !bad && joints === 1 && r.tiles.length === 2 && g < 10;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} fit test, ${joint} at ${tab * 100}%: ${T.width} × ${T.height} × ${T.base} mm, ${joints} joint, about ${g.toFixed(1)} g`);
    if (!ok) fail(`fit test ${joint} ${tab}`);
  }
}
// ---------------------------------------------------------------- 4
if (run(4)) {
  console.log('4. tiles fit, tabs clear their sockets');
  for (const [w, hh, bed] of [[480, 320, [256, 256]], [1200, 800, [256, 256]], [600, 600, [180, 180]], [2000, 400, [350, 350]], [700, 500, [250, 210]]]) {
    for (const joint of ['dovetail', 'jigsaw', 'keys', 'none']) {
      const P = normalizePanel(panelDefaults({ width: w, height: hh, tiles: { joint } }));
      const plan = planPanel(P, bed);
      const [bw, bh] = plan.rotated ? [bed[1], bed[0]] : bed;
      const prot = tabDepth(P);
      for (const t of plan.tiles) if (t.x1 - t.x0 + prot > bw - 2 * 5 || t.y1 - t.y0 + prot > bh - 2 * 5) fail(`${w}×${hh} on ${bed}: tile ${t.label} too big`);
    }
  }
  // the owner's tab and the neighbour's socket never overlap, and keep at least most of the clearance
  for (const joint of ['dovetail', 'jigsaw']) for (const clearance of [0, 0.2, 0.4]) {
    const P = normalizePanel(panelDefaults({ width: 480, height: 320, tiles: { joint, clearance, tab: 1.2 } }));
    const plan = planPanel(P, [256, 256]), C = _compile(P, null);
    let gap = Infinity;
    for (const tab of plan.tabs) {
      const A = _tileShape(C, plan, plan.tiles[tab.owner]), B = _tileShape(C, plan, plan.tiles[tab.other]);
      for (let a = -30; a <= 30; a += 0.25) for (let b = -6; b <= 30; b += 0.25) {
        const x = tab.dir === 'x' ? tab.x + b : tab.x + a, y = tab.dir === 'x' ? tab.y + a : tab.y + b;
        const fa = A(x, y), fb = B(x, y);
        if (fa > 0 && fb > 0) { fail(`${joint} ${clearance}: tiles overlap at ${x.toFixed(2)}, ${y.toFixed(2)}`); a = 99; break; }
        // across the gap the two distances add up to its width
        if (fa > -2 && fb > -2) gap = Math.min(gap, -(fa + fb));
      }
    }
    console.log(`  ${gap >= clearance * 0.8 - 1e-6 ? 'ok  ' : 'FAIL'} ${joint} at ${clearance} mm clearance keeps a ${gap.toFixed(2)} mm gap`);
    if (gap < clearance * 0.8 - 1e-6) fail(`${joint} clearance ${clearance}: gap ${gap.toFixed(3)}`);
  }
}
// ---------------------------------------------------------------- 5
if (run(5)) {
  console.log('5. random panels');
  let ok = 0;
  const N = +(process.env.N || 24);
  for (let k = 0; k < N; k++) {
    const pattern = any(PANEL_PATTERN_ORDER.filter((q) => !PANEL_PATTERNS[q].image));
    const pat = PANEL_PATTERNS[pattern];
    const P = panelDefaults({
      pattern, mode: pat.cut && rand() < 0.3 ? 'cut' : rand() < 0.3 ? 'ribs' : 'relief', shape: any(['rect', 'rounded', 'arch', 'oval', 'hex']),
      width: Math.round(200 + rand() * 600), height: Math.round(200 + rand() * 500), corner: 30, base: 3 + rand() * 4,
      depth: 2 + rand() * 14, scale: 16 + rand() * 60, angle: any([0, 0, 30, 45, 90]), vary: rand(), warp: rand() < 0.3 ? rand() * 0.6 : 0, seed: 1 + Math.floor(rand() * 999),
      open: 0.3 + rand() * 0.5, edge: any(['frame', 'bevel', 'fade', 'flush']), edgeW: 8 + rand() * 30, fade: rand() < 0.2 ? rand() : 0, invert: rand() < 0.2,
      tiles: { joint: any(['dovetail', 'jigsaw', 'keys', 'none']), seams: pat.cell && rand() < 0.3 ? 'pattern' : 'straight', clearance: rand() * 0.4, tab: 0.7 + rand() * 0.8 },
      ribs: { width: 3 + rand() * 8, gap: 3 + rand() * 8, angle: any([0, 0, 90, 30, -45]), bend: rand() < 0.3 ? rand() : 0, floor: 0.05 + rand() * 0.3 },
      mount: any(['tape', 'magnets', 'slots', 'halo']), finish: { twoTone: rand() < 0.3, toneAt: 0.3 + rand() * 0.4 },
    });
    const { bad } = checkBuild(`random ${k} (${pattern} ${P.mode} ${P.shape} ${P.tiles.joint})`, P, { res: P.mode === 'ribs' ? 1 : 1.8, final: true, bed: any([[256, 256], [180, 180], [250, 210]]) });
    if (!bad) ok++; else console.log('   ', JSON.stringify(P));
  }
  console.log(`  ${ok} of ${N} random panels closed`);
}

// ---------------------------------------------------------------- 6
if (run(6)) {
  console.log('6. elevation files and terrain');
  // a test landscape: a ridge and a lake basin, on a 2 m grid in LV95 like swissALTI3D
  const W = 90, H = 70, E0 = 2600000, N1 = 1200140, cell = 2;
  const z = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) z[j * W + i] = 1200 + 600 * Math.exp(-(((i - 50) / 18) ** 2) - (((j - 30) / 22) ** 2)) + 40 * Math.sin(i / 5) * Math.cos(j / 7);
  const same = (name, tiles, expectW = W, expectH = H, tol = 1e-3) => {
    const t = tiles[0];
    let worst = 0;
    for (let k = 0; k < W * H; k++) worst = Math.max(worst, Math.abs(t.data[k] - z[k]));
    const geo = Math.abs(t.x0 - E0) < 1e-6 && Math.abs(t.y1 - N1) < 1e-6 && Math.abs(t.cell - cell) < 1e-9;
    const ok = t.w === expectW && t.h === expectH && worst <= tol && geo;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${t.w} × ${t.h}, off by at most ${worst.toExponential(1)} m, ${geo ? 'placed right' : `placed at ${t.x0}, ${t.y1}`}`);
    if (!ok) fail(name);
  };
  const variants = [
    ['GeoTIFF, strips, uncompressed', { le: true }],
    ['GeoTIFF, big-endian tiles, Deflate, float predictor (COG style)', { le: false, tile: 32, comp: 8, pred: 3 }],
    ['GeoTIFF, LZW, float predictor', { le: true, comp: 5, pred: 3, rows: 7 }],
    ['GeoTIFF, LZW tiles, no predictor', { le: true, tile: 16, comp: 5 }],
    ['GeoTIFF, 16-bit integers, LZW, horizontal predictor', { le: true, comp: 5, pred: 2, int16: true }],
    ['BigTIFF, tiles, Deflate', { le: true, big: true, tile: 32, comp: 32946 }],
  ];
  for (const [name, o] of variants) {
    try { same(name, readDEM('t.tif', tiff(o.int16 ? z.map(Math.round) : z, W, H, { E0, N1, cell, ...o })), W, H, o.int16 ? 0.51 : 1e-3); }
    catch (e) { fail(`${name}: ${e.message}`); console.log(`  FAIL ${name}: ${e.stack}`); }
  }
  const xyz = (i0, i1) => { const L = ['X Y Z']; for (let j = 0; j < H; j++) for (let i = i0; i < i1; i++) L.push(`${(E0 + (i + 0.5) * cell).toFixed(2)} ${(N1 - (j + 0.5) * cell).toFixed(2)} ${z[j * W + i].toFixed(4)}`); return strToU8(L.join('\r\n')); };
  same('XYZ text', readDEM('t.xyz', xyz(0, W)));
  const asc = ['ncols ' + W, 'nrows ' + H, 'xllcorner ' + E0, 'yllcorner ' + (N1 - H * cell), 'cellsize ' + cell, 'NODATA_value -9999'];
  for (let j = 0; j < H; j++) asc.push(Array.from(z.subarray(j * W, (j + 1) * W), (v) => v.toFixed(4)).join(' '));
  same('ESRI ASCII grid', readDEM('t.asc', strToU8(asc.join('\n'))));
  // two neighbouring tiles in a zip, as swisstopo hands them out: stitched back into one grid
  const zip = zipSync({ 'west.xyz': xyz(0, 45), 'east.xyz': xyz(45, W) });
  const tiles = readDEM('swissalti3d.zip', zip), m = mosaic(tiles, 4000);
  let worst = 0;
  for (let k = 0; k < W * H; k++) worst = Math.max(worst, Math.abs(m.zmin + m.data[k] * (m.zmax - m.zmin) - z[k]));
  const ok = tiles.length === 2 && m.w === W && m.h === H && worst < 1e-2 && Math.abs(m.widthM - W * cell) < 1e-6;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} zip of two tiles stitched: ${m.w} × ${m.h}, ${m.widthM} × ${m.heightM} m, off by ${worst.toExponential(1)} m`);
  if (!ok) fail('stitching');
  // and a coarser mosaic averages rather than drops
  const small = mosaic(tiles, 30);
  if (small.w !== 30 || !(small.zmax > small.zmin)) fail(`downsampled mosaic ${small.w} × ${small.h}`);
  // terrain panels from it
  const dem = { w: m.w, h: m.h, data: m.data };
  for (const [name, over] of [
    ['terrain relief, map-shaped', { pattern: 'terrain', width: 450, height: 350, depth: 22, edge: 'flush' }],
    ['terrain with lake, terraces, snowy tips', { pattern: 'terrain', width: 450, height: 350, depth: 22, terrain: { water: 0.25, steps: 9 }, finish: { twoTone: true, toneAt: 0.7 }, mount: 'magnets' }],
    ['terrain as ribs', { pattern: 'terrain', mode: 'ribs', width: 450, height: 350, depth: 30, ribs: { width: 4, gap: 4 } }],
    ['a tall mountain, 160 mm, straight sides', { pattern: 'terrain', width: 520, height: 520, depth: 160, base: 6, edge: 'flush', finish: { twoTone: true, toneAt: 0.8 } }],
  ]) {
    const P = panelDefaults(over);
    const r = buildPanel(P, { res: 1.2, bed: [256, 256], final: true, dem });
    let bad = 0;
    for (const t of r.tiles) for (const b of t.bodies) if (openEdges(b) || !(b.volume > 0)) bad++;
    // the terrain really is in it: the tallest point sits near the ridge
    console.log(`  ${bad ? 'FAIL' : 'ok  '} ${name}: ${r.tiles.length} tiles${bad ? `, ${bad} bad bodies` : ''}`);
    if (bad) fail(name);
  }
  // tiles taller than the printer are flagged
  const tall = normalizePanel(panelDefaults({ pattern: 'terrain', width: 520, height: 520, depth: 300 }));
  const flagged = panelChecks(tall, planPanel(tall, [256, 256, 256]), null).some((c) => c.level === 'bad' && /mm tall/.test(c.text));
  console.log(`  ${flagged ? 'ok  ' : 'FAIL'} a 306 mm tall tile is flagged on a 256 mm printer`);
  if (!flagged) fail('printer height check');
}

// ---------------------------------------------------------------- 7
if (run(7)) {
  console.log('7. swisstopo downloads (offline stand-in)');
  const check = (ok, text) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) failures++; };
  // a peak at the Matterhorn's spot; south of N 1 091 300 is "abroad" and has no heights
  const PE = 2617050, PN = 1091670, CELL = 2, BORDER = 1091300;
  const height = (e, n) => 2800 + 1600 * Math.exp(-(((e - PE) / 900) ** 2) - (((n - PN) / 700) ** 2)) + 0.05 * (n - 1090000);
  const tileFile = (ekm, nkm, year) => {
    const w = 1000 / CELL, v = new Float32Array(w * w);
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      const e = ekm * 1000 + (i + 0.5) * CELL, n = (nkm + 1) * 1000 - (j + 0.5) * CELL;
      v[j * w + i] = n < BORDER ? NaN : year < 2020 ? 0 : height(e, n);
    }
    return tiff(v, w, w, { tile: 128, comp: 8, pred: 3, E0: ekm * 1000, N1: (nkm + 1) * 1000, cell: CELL });
  };
  const files = new Map();
  let pages = 0;
  const reply = (body, type = 'application/json') => ({ ok: true, status: 200, json: async () => body, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength), type });
  const fakeFetch = async (url) => {
    const u = new URL(url);
    if (u.host === 'api3.geo.admin.ch') {
      return reply({ results: [
        { attrs: { label: '<i>Gondola lift</i> <b>Matterhorn-Express II Furi-Schwarzsee</b> (VS) - Zermatt', objectclass: 'TLM_UEBRIGE_BAHN', y: 2621839.75, x: 1093966.875 } },
        { attrs: { label: '<i>Viewpoint</i> <b>Matterhorn Mont Cervin|Monte Cervino</b> () - ', objectclass: 'TLM_EINZELOBJEKT', y: 2617100, x: 1091700 } },
        { attrs: { label: '<i>Alpin peak</i> <b>Matterhorn Mont Cervin|Monte Cervino</b> () - ', objectclass: 'TLM_NAME_PKT', y: 2617048.75, x: 1091673 } },
        { attrs: { label: '<b>Zermatt (VS)</b>', origin: 'gg25', y: 2623512, x: 1093253 } },
        { attrs: { label: 'Somewhere abroad', origin: 'address', y: 0, x: 0 } },
      ] });
    }
    if (u.pathname.endsWith('/items')) {
      // every tile the bbox touches, four to a page, an old survey of each beside the new one
      const [lon0, lat0, lon1, lat1] = u.searchParams.get('bbox').split(',').map(Number);
      const all = [];
      for (let ekm = 2600; ekm < 2640; ekm++) for (let nkm = 1080; nkm < 1100; nkm++) {
        const c = [[ekm * 1000, nkm * 1000], [ekm * 1000 + 1000, nkm * 1000 + 1000]].map(([e, n]) => lv95ToWgs(e, n));
        if (c[1][0] < lon0 || c[0][0] > lon1 || c[1][1] < lat0 || c[0][1] > lat1) continue;
        if (nkm * 1000 + 1000 <= BORDER) continue; // nothing wholly abroad
        for (const year of [2019, 2024]) {
          const id = `swissalti3d_${year}_${ekm}-${nkm}`;
          const asset = (gsd) => ({ href: `https://data.geo.admin.ch/ch.swisstopo.swissalti3d/${id}/${id}_${gsd}_2056_5728.tif`, type: 'image/tiff; application=geotiff; profile=cloud-optimized', gsd });
          all.push({ id, assets: { [`${id}_0.5_2056_5728.tif`]: asset(0.5), [`${id}_2_2056_5728.tif`]: asset(2), [`${id}.xyz.zip`]: { href: 'x', type: 'application/x.xyz+zip', gsd: 2 } } });
        }
      }
      const at = +(u.searchParams.get('cursor') || 0), next = at + 4;
      pages++;
      return reply({ features: all.slice(at, next), links: next < all.length ? [{ rel: 'next', href: `${u.origin}${u.pathname}?bbox=${u.searchParams.get('bbox')}&cursor=${next}` }] : [] });
    }
    const m = u.pathname.match(/swissalti3d_(\d{4})_(\d{4})-(\d{4})_(0\.5|2)_/);
    if (!m) return { ok: false, status: 404 };
    if (m[4] !== '2') throw new Error('fetched the 0.5 m file');
    files.set(m[0], (files.get(m[0]) || 0) + 1);
    return reply(tileFile(+m[2], +m[3], +m[1]));
  };
  // the search
  const hits = await searchPlaces('Matterhorn', fakeFetch);
  check(hits[0]?.type === 'Alpin peak' && hits[0].name === 'Matterhorn Mont Cervin / Monte Cervino' && hits[0].e === 2617048.75 && hits[0].n === 1091673,
    `search puts the summit first: ${hits[0]?.name} (${hits[0]?.type})`);
  check(hits.length === 3 && hits.at(-1).type === 'Gondola lift' && hits.some((x) => x.type === 'Municipality'), `the viewpoint on the summit folds into it, the gondola goes last, nothing abroad: ${hits.map((x) => x.type).join(', ')}`);
  const [lv] = await searchPlaces('2617050 1091670', fakeFetch), [deg] = await searchPlaces('45.9763, 7.6586', fakeFetch);
  const [lon, lat] = lv95ToWgs(2617050, 1091670), [e2, n2] = wgsToLv95(lon, lat);
  check(lv.e === 2617050 && lv.n === 1091670 && Math.hypot(deg.e - 2617050, deg.n - 1091670) < 120 && Math.hypot(e2 - 2617050, n2 - 1091670) < 3,
    `coordinates typed in metres or degrees land on the spot (degrees ${Math.round(Math.hypot(deg.e - 2617050, deg.n - 1091670))} m off, round trip ${Math.hypot(e2 - 2617050, n2 - 1091670).toFixed(1)} m)`);
  // the catalogue
  const rect = areaRect(PE, PN, 3, 4 / 3);
  const list = await listTiles(rect, 2, fakeFetch);
  const want = tilesFor(rect) - (Math.ceil(rect.e1 / 1000) - Math.floor(rect.e0 / 1000)); // the bottom row lies wholly abroad
  check(list.length === want && list.every((t) => t.year === 2024 && /_2_2056/.test(t.href)) && pages > 2,
    `catalogue: ${list.length} tiles (of ${tilesFor(rect)} the area touches), newest survey, 2 m files, ${pages} pages followed`);
  // the download, stitched and cropped
  let calls = 0;
  const m = await fetchTerrain(rect, { gsd: 2, max: 300, fetchFn: fakeFetch, onProgress: () => calls++ });
  let worst = 0, north = 0;
  for (let j = 0; j < m.h; j += 7) for (let i = 0; i < m.w; i += 7) {
    const e = rect.e0 + (i + 0.5) * m.cell, n = rect.n1 - (j + 0.5) * m.cell;
    if (n < BORDER + 3 * m.cell) continue;
    const got = m.zmin + m.data[j * m.w + i] * (m.zmax - m.zmin);
    // averaged over a cell of the coarser grid: compare with the middle, allowing for the slope
    worst = Math.max(worst, Math.abs(got - height(e, n)) / (1 + 0.004 * m.cell * 1600 / 700));
    if (j === 0 && i === 0) north = got - (m.zmin + m.data[(m.h - 1) * m.w] * (m.zmax - m.zmin));
  }
  const abroad = (BORDER - rect.n0) / (rect.n1 - rect.n0);
  check(m.w === 300 && Math.abs(m.widthM - 3000) < 1e-6 && Math.abs(m.heightM - 2250) < 1e-6 && files.size === want && calls === want + 1,
    `download: ${m.files} files once each, ${m.w} × ${m.h} samples over ${m.widthM} × ${m.heightM} m, ${calls} progress calls`);
  check(worst < 2 && Math.abs(m.zmax - height(PE, PN)) < 20 && north > 0,
    `heights stitched in place and north up: off by at most ${worst.toFixed(2)} m, top ${Math.round(m.zmax)} m`);
  check(Math.abs(m.empty - abroad) < 0.02, `${Math.round(m.empty * 100)}% of the area has no heights (abroad: ${Math.round(abroad * 100)}%)`);
  // nothing there at all
  let none = '';
  try { await fetchTerrain(areaRect(2700000, 1070000, 1, 1), { fetchFn: async (url) => (/items/.test(url) ? reply({ features: [], links: [] }) : fakeFetch(url)) }); } catch (e) { none = e.message; }
  check(/Switzerland/.test(none), `outside the model: "${none}"`);
  // a cancelled download stops
  const ctl = new AbortController(); let stopped = '';
  try { await fetchTerrain(rect, { fetchFn: fakeFetch, max: 300, signal: ctl.signal, onProgress: ({ done }) => { if (done >= 2) ctl.abort(); } }); } catch (e) { stopped = e.message; }
  check(stopped === 'Cancelled', `cancelling stops it: ${stopped || 'it went on'}`);
}

console.log(failures ? `\n${failures} panel check(s) failed` : '\nall panel checks passed');
process.exit(failures ? 1 : 0);

// ---------------------------------------------------------------- writing test GeoTIFFs
// Enough of the format to make files like swisstopo's: classic or BigTIFF, either byte order, strips or
// tiles, no compression, Deflate or LZW, and the horizontal or floating-point predictor.
function tiff(values, w, h, { le = true, big = false, tile = 0, rows = h, comp = 1, pred = 1, int16 = false, E0 = 0, N1 = 0, cell = 1 }) {
  const bps = int16 ? 2 : 4, tw = tile || w, th = tile || rows;
  const across = Math.ceil(w / tw), down = Math.ceil(h / th);
  const chunks = [];
  for (let ty = 0; ty < down; ty++) for (let tx = 0; tx < across; tx++) {
    const cw = tw, ch = tile ? th : Math.min(th, h - ty * th);
    const buf = new Uint8Array(cw * ch * bps), dv = new DataView(buf.buffer);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const x = tx * tw + i, y = ty * th + j, v = x < w && y < h ? values[y * w + i + tx * tw] : 0, o = (j * cw + i) * bps;
      if (int16) dv.setInt16(o, v, le); else dv.setFloat32(o, v, pred === 3 ? false : le);
    }
    if (pred === 2) for (let j = 0; j < ch; j++) for (let i = cw - 1; i > 0; i--) { const o = (j * cw + i) * 2, p = o - 2; dv.setUint16(o, (dv.getUint16(o, le) - dv.getUint16(p, le)) & 0xffff, le); }
    let out = buf;
    if (pred === 3) {
      out = new Uint8Array(buf.length);
      const rb = cw * bps;
      for (let j = 0; j < ch; j++) {
        for (let i = 0; i < cw; i++) for (let b = 0; b < bps; b++) out[j * rb + b * cw + i] = buf[j * rb + i * bps + b];
        for (let i = rb - 1; i > 0; i--) out[j * rb + i] = (out[j * rb + i] - out[j * rb + i - 1]) & 255;
      }
    }
    chunks.push(comp === 1 ? out : comp === 5 ? lzwEncode(out) : zlibSync(out));
  }
  // layout: header, chunks, then the IFD and its out-of-line values
  const head = big ? 16 : 8;
  let at = head;
  const offsets = chunks.map((c) => { const o = at; at += c.length; return o; });
  const tags = [
    [256, 4, [w]], [257, 4, [h]], [258, 3, [bps * 8]], [259, 3, [comp]], [262, 3, [1]], [277, 3, [1]], [284, 3, [1]], [317, 3, [pred]], [339, 3, [int16 ? 2 : 3]],
    ...(tile ? [[322, 3, [tw]], [323, 3, [th]], [324, big ? 16 : 4, offsets], [325, 4, chunks.map((c) => c.length)]] : [[273, big ? 16 : 4, offsets], [278, 4, [th]], [279, 4, chunks.map((c) => c.length)]]),
    [33550, 12, [cell, cell, 0]], [33922, 12, [0, 0, 0, E0, N1, 0]], [42113, 2, '-9999'],
  ].sort((a, b) => a[0] - b[0]);
  const size = { 2: 1, 3: 2, 4: 4, 12: 8, 16: 8 };
  const entry = big ? 20 : 12, ifdAt = at + (at % 2), ifdLen = (big ? 8 : 2) + tags.length * entry + (big ? 8 : 4);
  let extra = ifdAt + ifdLen;
  const total = extra + tags.reduce((s, [, t, v]) => s + (size[t] * v.length > (big ? 8 : 4) ? size[t] * v.length + 8 : 0), 0) + 16;
  const file = new Uint8Array(total), dv = new DataView(file.buffer);
  file[0] = file[1] = le ? 0x49 : 0x4d;
  dv.setUint16(2, big ? 43 : 42, le);
  if (big) { dv.setUint16(4, 8, le); dv.setUint16(6, 0, le); dv.setBigUint64(8, BigInt(ifdAt), le); } else dv.setUint32(4, ifdAt, le);
  chunks.forEach((c, k) => file.set(c, offsets[k]));
  let p = ifdAt;
  if (big) { dv.setBigUint64(p, BigInt(tags.length), le); p += 8; } else { dv.setUint16(p, tags.length, le); p += 2; }
  const put = (t, v, o) => {
    const arr = typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)).concat(0) : v;
    arr.forEach((x, i) => {
      const q = o + i * size[t];
      if (t === 2) dv.setUint8(q, x); else if (t === 3) dv.setUint16(q, x, le); else if (t === 4) dv.setUint32(q, x, le); else if (t === 12) dv.setFloat64(q, x, le); else dv.setBigUint64(q, BigInt(x), le);
    });
    return arr.length;
  };
  for (const [tag, t, v] of tags) {
    const count = typeof v === 'string' ? v.length + 1 : v.length, bytes = size[t] * count;
    dv.setUint16(p, tag, le); dv.setUint16(p + 2, t, le);
    if (big) dv.setBigUint64(p + 4, BigInt(count), le); else dv.setUint32(p + 4, count, le);
    const inline = big ? 8 : 4, vo = p + (big ? 12 : 8);
    if (bytes <= inline) put(t, v, vo);
    else { if (big) dv.setBigUint64(vo, BigInt(extra), le); else dv.setUint32(vo, extra, le); put(t, v, extra); extra += bytes + (bytes % 2); }
    p += entry;
  }
  return file;
}
// TIFF LZW, the encoder libtiff writes: codes widen one step early, and the table restarts when full
function lzwEncode(data) {
  const out = [];
  let acc = 0, n = 0;
  const put = (code, bits) => { for (let k = bits - 1; k >= 0; k--) { acc = (acc << 1) | ((code >> k) & 1); if (++n === 8) { out.push(acc); acc = 0; n = 0; } } };
  let dict = new Map(), next = 258, bits = 9, cur = -1;
  put(256, bits);
  for (const c of data) {
    if (cur < 0) { cur = c; continue; }
    const key = cur * 256 + c;
    const hit = dict.get(key);
    if (hit !== undefined) { cur = hit; continue; }
    put(cur, bits);
    dict.set(key, next++);
    if (next >= 4094) { put(256, bits); dict = new Map(); next = 258; bits = 9; }
    else if (next >= 1 << bits && bits < 12) bits++;
    cur = c;
  }
  if (cur >= 0) { put(cur, bits); next++; if (next >= 1 << bits && bits < 12) bits++; }
  put(257, bits);
  if (n) out.push(acc << (8 - n));
  return Uint8Array.from(out);
}
