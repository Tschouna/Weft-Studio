// Panel checks, run with `npm test` after the engine checks:
//  1. every tile and loose part of every starting panel is a closed, manifold solid
//  2. every pattern, in relief and openwork, builds closed
//  3. joints, seams, mounts, outlines and two-tone builds all stay closed
//  4. tiles fit the bed, and tabs never touch their sockets
//  5. random panels, ribs included, build closed
import { buildPanel, panelDefaults, normalizePanel, planPanel, PANEL_PATTERNS, PANEL_PATTERN_ORDER, _compile, _tileShape, tabDepth } from '../app/panel.js';
import { PANEL_PRESETS } from '../app/panels.js';

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

console.log(failures ? `\n${failures} panel check(s) failed` : '\nall panel checks passed');
process.exit(failures ? 1 : 0);
