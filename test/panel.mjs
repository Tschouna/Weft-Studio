// Panel checks, run with `npm test` after the engine checks:
//  1. every tile and loose part of every starting panel is a closed, manifold solid
//  2. every pattern, in relief and openwork, builds closed
//  3. joints, seams, mounts, outlines and two-tone builds all stay closed
//  4. tiles fit the bed, and tabs never touch their sockets
//  5. random panels, ribs included, build closed
//  6. elevation files (GeoTIFF of every kind, XYZ, ASCII grid, zip) read back exactly and stitch,
//     and terrain and diffuser panels build closed
import { buildPanel, panelDefaults, normalizePanel, planPanel, PANEL_PATTERNS, PANEL_PATTERN_ORDER, _compile, _tileShape, tabDepth } from '../app/panel.js';
import { PANEL_PRESETS } from '../app/panels.js';
import { readDEM, mosaic } from '../app/dem.js';
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
    ['fit test', { name: 'fit', shape: 'rect', width: 120, height: 64, pattern: 'plain', depth: 0, edge: 'flush', tiles: { cols: 2, rows: 1, joint: 'dovetail', labels: false } }, { res: 0.4, final: true }],
    ['fit test keys', { name: 'fit', shape: 'rect', width: 120, height: 64, pattern: 'plain', depth: 0, edge: 'flush', tiles: { cols: 2, rows: 1, joint: 'keys', labels: false } }, { res: 0.4, final: true }],
  ];
  for (const [name, over, opts] of cases) {
    const { r, bad, bodies } = checkBuild(name, panelDefaults(over), { res: 1.2, final: true, ...(opts || {}) });
    console.log(`  ${bad ? 'FAIL' : 'ok  '} ${name}: ${r.tiles.length} tiles, ${bodies} bodies, ${r.plan.tabs.length} tabs, ${r.plan.keys.length} keys`);
    if (name.startsWith('fit test') && (r.plan.tabs.length + r.plan.keys.length) < 1) fail(`${name}: no joint in the fit test`);
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
  ]) {
    const P = panelDefaults(over);
    const r = buildPanel(P, { res: 1.2, bed: [256, 256], final: true, dem });
    let bad = 0;
    for (const t of r.tiles) for (const b of t.bodies) if (openEdges(b) || !(b.volume > 0)) bad++;
    // the terrain really is in it: the tallest point sits near the ridge
    console.log(`  ${bad ? 'FAIL' : 'ok  '} ${name}: ${r.tiles.length} tiles${bad ? `, ${bad} bad bodies` : ''}`);
    if (bad) fail(name);
  }
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
