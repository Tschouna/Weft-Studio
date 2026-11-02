// Engine checks, run with `npm test` (and on every push by the GitHub build):
//  1. every part of every collection piece is a closed solid, and relief textures print without supports
//  2. multicolour bands are each closed, and cutting them adds no overhang
//  3. the print mesh follows the intended relief closely (no saw-tooth on creases)
//  4. a batch of random designs all build closed
//  5. self-watering inserts drop into their pots
//  6. bold, deep relief keeps its undersides printable on bellied, twisted and flared shapes
import { generate, makeProfile, easeProfile, __test } from '../app/engine.js';
import { COLLECTION, design } from '../app/presets.js';

const { buildSurface, sampleRows, cellFor, processRelief, makeSection } = __test;
const TAU = Math.PI * 2;
let failures = 0;
const fail = (msg) => { failures++; console.log(`  FAIL ${msg}`); };

// open or non-manifold edges among the triangles [first, first + count)
function openEdges(p, first = 0, count = p.index.length / 3) {
  const K = 2 ** 23, e = new Map();
  for (let t = first; t < first + count; t++) {
    const a = p.weld[p.index[t * 3]], b = p.weld[p.index[t * 3 + 1]], c = p.weld[p.index[t * 3 + 2]];
    if (a === b || b === c || a === c) continue;
    for (const [x, y] of [[a, b], [b, c], [c, a]]) { const k = x * K + y; e.set(k, (e.get(k) || 0) + 1); }
  }
  let bad = 0;
  for (const [k, n] of e) { const x = Math.floor(k / K), y = k - x * K; if (n !== 1 || e.get(y * K + x) !== 1) bad++; }
  return bad;
}
const mainOf = (r) => r.parts.find((p) => p.key === r.info.mainKey);

// ONLY=3,5 npm test runs just those sections
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const run = (n) => !ONLY || ONLY.has(String(n));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const any = (arr) => arr[Math.floor(rand() * arr.length)];

// ---------------------------------------------------------------- 1
if (run(1)) {
console.log('1. collection: closed solids and overhang');
for (const d of COLLECTION) {
  const r = generate(d, 1);
  for (const p of r.parts) {
    const bad = openEdges(p);
    if (bad) fail(`${d.name} ${p.key}: ${bad} open edges`);
  }
  const over = r.parts.reduce((s, p) => s + p.stats.overhang, 0);
  const tris = r.parts.reduce((s, p) => s + p.stats.tris, 0);
  console.log(`  ${d.name.padEnd(9)} ${d.surface.pattern.padEnd(9)} ${d.surface.mode.padEnd(6)} ${(tris / 1000).toFixed(0).padStart(5)}k tris  overhang ${over.toFixed(0).padStart(4)} mm²`);
  if (d.surface.mode === 'relief' && over > 5) fail(`${d.name}: relief overhang ${over.toFixed(0)} mm²`);
}
}

// ---------------------------------------------------------------- 2
if (run(2)) {
console.log('2. multicolour bands');
for (const base of COLLECTION) {
  const H = base.form.height, plain = mainOf(generate(base, 0.6)).stats.overhang;
  for (const cuts of [[H * 0.42], [H / 3, (2 * H) / 3]]) {
    const r = generate({ ...base, multicolor: { cuts, slots: [0, 1, 2] } }, 0.6), m = mainOf(r);
    for (const rg of m.regions || []) { const bad = openEdges(m, rg.first, rg.count); if (bad) fail(`${base.name} band ${rg.slot}: ${bad} open edges`); }
    if (m.stats.overhang > plain + 5) fail(`${base.name}: bands add ${(m.stats.overhang - plain).toFixed(0)} mm² overhang`);
  }
}
console.log('  done');
}

// ---------------------------------------------------------------- 3
if (run(3)) {
// The mesh is compared with the same relief on a grid four times finer; the gap is the saw-tooth a print shows.
console.log('3. relief surface accuracy (mm)');
function field(P, cell, NU) {
  const F = P.form, S = P.surface, H = F.height;
  const rFn = easeProfile(makeProfile(F), H, 44).fn, sec = makeSection(F), perim = sec.L / TAU;
  const rows = sampleRows(rFn, H, cell);
  const { D } = buildSurface(rows, NU, S, 'relief', { bandBottom: S.bandBottom, bandTop: S.bandTop, perim, topL: null, edge: null, freezeL: (F.inset || 0) * 1.45 + 0.4 });
  processRelief(D, rows, NU, { sec, perim, mode: 'relief', twist: ((F.twist || 0) * Math.PI) / 180, H, fillBelow: (F.inset || 0) * 1.45 + 1 });
  return { D, rows };
}
function accuracy(P) {
  const F = P.form, H = F.height, rFn = easeProfile(makeProfile(F), H, 44).fn, sec = makeSection(F);
  let rMin = Infinity, rMax = 0;
  for (let k = 0; k <= 100; k++) { const r = rFn((H * k) / 100); rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); }
  const cell = cellFor(P.surface, 'relief', (rMin * sec.L) / TAU, H, 1);
  let NU = Math.ceil((rMax * sec.L) / cell); NU += (4 - (NU % 4)) % 4;
  const c = field(P, cell, NU), f = field(P, cell / 4, NU * 4), Rc = c.rows, Rf = f.rows, NF = NU * 4, errs = [];
  let j = 0;
  for (let jf = 0; jf < Rf.n; jf++) {
    const l = Rf.l[jf];
    while (j < Rc.n - 2 && Rc.l[j + 1] < l) j++;
    if (Rc.l[j] < 6 || Rc.l[j + 1] > Rc.L - 6) continue;
    const fv = Math.min(1, Math.max(0, (l - Rc.l[j]) / (Rc.l[j + 1] - Rc.l[j])));
    for (let q = 0; q < NF; q++) {
      const u = q / 4, i = Math.floor(u), fu = u - i, i1 = (i + 1) % NU, D = c.D;
      const Da = D[j * NU + i], Db = D[j * NU + i1], Dc = D[(j + 1) * NU + i1], Dd = D[(j + 1) * NU + i];
      const jm = j > 0 ? j - 1 : 0, jp = j + 2 < Rc.n ? j + 2 : Rc.n - 1, im = (i - 1 + NU) % NU, ip = (i + 2) % NU;
      const ac = Math.abs(D[jm * NU + im] - 2 * Da + Dc) + Math.abs(Da - 2 * Dc + D[jp * NU + ip]);
      const bd = Math.abs(D[jm * NU + ip] - 2 * Db + Dd) + Math.abs(Db - 2 * Dd + D[jp * NU + im]);
      const v = !(bd < ac)
        ? (fu >= fv ? Da + (Db - Da) * fu + (Dc - Db) * fv : Da + (Dc - Dd) * fu + (Dd - Da) * fv)
        : (fu + fv <= 1 ? Da + (Db - Da) * fu + (Dd - Da) * fv : Dc + (Dd - Dc) * (1 - fu) + (Db - Dc) * (1 - fv));
      errs.push(Math.abs(v - f.D[jf * NF + q]));
    }
  }
  errs.sort((a, b) => a - b);
  return { p99: errs[Math.floor(0.99 * (errs.length - 1))], max: errs[errs.length - 1] };
}
const pick = (n) => JSON.parse(JSON.stringify(COLLECTION.find((d) => d.name === n)));
for (const [name, d] of [
  ['carved', pick('Comb')], ['hammered', pick('Quarry')], ['shingles', pick('Shingle')], ['ribs', pick('Dune')],
  ['voronoi', design({ object: 'planter', surface: { pattern: 'voronoi', mode: 'relief', count: 14, jitter: 0.8, stretch: 1.3, depth: 1.6, width: 2.4, profile: 'round' } })],
  ['prism', design({ object: 'planter', surface: { pattern: 'prism', mode: 'relief', count: 16, angle: 58, depth: 1.8, fill: 0.7 } })],
  ['knurl', pick('Pinecone')], ['cubes', pick('Isomer')], ['gouge', pick('Chisel')],
  // bold, deep relief
  ['blocks', design({ object: 'planter', surface: { pattern: 'blocks', mode: 'relief', count: 14, stretch: 1.4, width: 1.2, jitter: 0.75, depth: 6, profile: 'sharp', round: 0 } })],
  ['spikes', design({ object: 'planter', surface: { pattern: 'spikes', mode: 'relief', count: 20, angle: 60, fill: 1, depth: 7, profile: 'sharp' } })],
  ['shards', design({ object: 'planter', surface: { pattern: 'shards', mode: 'relief', count: 26, stretch: 0.7, jitter: 0.85, depth: 8 } })],
  ['fins', design({ object: 'planter', surface: { pattern: 'fins', mode: 'relief', count: 24, angle: 0, fill: 0.5, depth: 8, profile: 'flat', swirl: 90 } })],
  ['hobnail', design({ object: 'planter', surface: { pattern: 'hobnail', mode: 'relief', count: 24, fill: 0.85, jitter: 0, vary: 0, stretch: 1, arch: false, depth: 4.5, profile: 'round' } })],
  ['deep cubes', design({ object: 'planter', surface: { pattern: 'cubes', mode: 'relief', count: 10, stretch: 1, depth: 7 } })],
]) {
  const a = accuracy(d);
  console.log(`  ${name.padEnd(9)} p99 ${a.p99.toFixed(3)}  max ${a.max.toFixed(3)}`);
  if (a.p99 > 0.06 || a.max > 0.15) fail(`${name}: relief strays from the intended surface (p99 ${a.p99.toFixed(3)}, max ${a.max.toFixed(3)} mm)`);
}
}

// ---------------------------------------------------------------- 4
if (run(4)) {
console.log('4. random designs');
const objects = ['planter', 'vase', 'bowl', 'box', 'cup', 'pendant', 'lamp', 'hanging', 'wall', 'orchid', 'lantern', 'tray', 'ring'];
const patterns = ['lattice', 'prism', 'ogee', 'arches', 'voronoi', 'honeycomb', 'dots', 'perforated', 'ribs', 'chevron', 'reeds', 'waves', 'knit', 'weave', 'petals', 'quilt', 'facets', 'tiles',
  'hammered', 'carved', 'rings', 'dunes', 'bark', 'gouge', 'cubes', 'knurl', 'seigaiha', 'herringbone', 'blocks', 'spikes', 'shards', 'fins', 'hobnail', 'smooth'];
for (let k = 0; k < 48; k++) {
  const obj = any(objects), pat = any(patterns);
  const low = obj === 'tray' || obj === 'ring';
  const d = design({
    object: obj,
    form: { height: low ? 25 + rand() * 30 : 60 + rand() * 160, diameter: (obj === 'ring' ? 40 : 70) + rand() * (obj === 'ring' ? 40 : 160), base: 0.6 + rand() * 0.5, top: 0.7 + rand() * 0.5, section: any(['round', 'round', 'polygon', 'lobed']), twist: any([0, 0, 40]), rimEdge: any(['flat', 'round', 'bevel']) },
    surface: { pattern: pat, mode: obj === 'pendant' || obj === 'lamp' || obj === 'lantern' ? 'cut' : any(['relief', 'relief', 'cut']), bandBottom: low ? 2 : 6, bandTop: low ? 2 : 4, count: 8 + Math.floor(rand() * 30), depth: 0.8 + rand() * rand() * 8, swirl: any([0, 0, 90, -150]) },
    extras: { base: obj === 'planter' ? any(['none', 'saucer', 'sleeve', 'insert']) : obj === 'orchid' ? any(['none', 'saucer']) : 'none', baseH: 40 + rand() * 50, hangers: any([3, 4]), back: rand() * 0.6, drain: any([0, 10]) },
  });
  const r = generate(d, 0.7);
  for (const p of r.parts) { const bad = openEdges(p); if (bad) fail(`random #${k} ${obj}/${pat} ${p.key}: ${bad} open edges`); }
}
console.log('  done');
}

// ---------------------------------------------------------------- 5
if (run(5)) {
// A self-watering insert must drop in from above: at every angle and height, the insert's outside has
// to be inside the pot's inner wall at that height and everywhere above it.
console.log('5. self-watering inserts fit');
function insertGap(r, d) {
  const pot = mainOf(r), ins = r.parts.find((p) => p.key === 'insert');
  if (!ins) return null;
  const A = 360, H = d.form.height, bins = Math.ceil(H) + 1;
  const inner = new Float64Array(A * bins).fill(Infinity);
  const P = pot.position;
  for (let v = 0; v < P.length; v += 3) {
    const z = P[v + 2] + (pot.place.z || 0);
    if (z < d.form.floor + 6 || z > H) continue;
    const a = Math.floor(((Math.atan2(P[v + 1], P[v]) / TAU) + 1) * A) % A, hb = Math.floor(z);
    inner[a * bins + hb] = Math.min(inner[a * bins + hb], Math.hypot(P[v], P[v + 1]));
  }
  for (let a = 0; a < A; a++) for (let hb = bins - 2; hb >= 0; hb--) inner[a * bins + hb] = Math.min(inner[a * bins + hb], inner[a * bins + hb + 1]);
  let worst = Infinity;
  const Q = ins.position;
  for (let v = 0; v < Q.length; v += 3) {
    const z = Q[v + 2] + ins.place.z;
    if (z > H - 0.5) continue; // the flare above the rim rests on it
    const a = Math.floor(((Math.atan2(Q[v + 1], Q[v]) / TAU) + 1) * A) % A, hb = clamp(Math.ceil(z), 0, bins - 1);
    const lim = inner[a * bins + hb];
    if (Number.isFinite(lim)) worst = Math.min(worst, lim - Math.hypot(Q[v], Q[v + 1]));
  }
  return worst;
}
const inserts = [...COLLECTION.filter((d) => d.extras.base === 'insert')];
for (let k = 0; k < 10; k++) {
  inserts.push(design({ name: `random insert ${k}`, object: 'planter', extras: { base: 'insert', reservoir: 20 + rand() * 30 },
    form: { height: 90 + rand() * 120, diameter: 110 + rand() * 120, base: 0.5 + rand() * 0.5, top: 0.6 + rand() * 0.5, belly: 0.25 + rand() * 0.5, fullness: rand(),
      section: any(['round', 'round', 'polygon', 'lobed']), twist: any([0, 0, 45, -60]) },
    surface: { pattern: any(['knurl', 'ribs', 'smooth', 'hammered']), mode: 'relief', count: 20 + Math.floor(rand() * 40) } }));
}
for (const d of inserts) {
  const g = insertGap(generate(d, 0.6), d);
  console.log(`  ${d.name.padEnd(17)} clearance ${g.toFixed(2)} mm`);
  if (!(g > 0.3)) fail(`${d.name}: the insert does not drop into the pot (clearance ${g.toFixed(2)} mm)`);
}
}

// ---------------------------------------------------------------- 6
if (run(6)) {
// Bold relief stands far out of the wall; its undersides must still be held at 45° on every kind of shape.
console.log('6. bold relief prints without supports');
const forms = {
  belly: { height: 150, diameter: 170, base: 0.75, top: 0.85, belly: 0.45, fullness: 0.9 },
  twist: { height: 170, diameter: 140, base: 0.9, top: 1, section: 'polygon', sides: 6, corner: 0.25, twist: 40 },
  flare: { height: 90, diameter: 220, base: 0.55, top: 1, belly: 0.65, fullness: 0.5 },
};
const bold = [
  ['blocks', { count: 14, stretch: 1.4, width: 1.2, jitter: 0.75, depth: 7, profile: 'sharp', round: 0 }],
  ['spikes', { count: 20, angle: 60, fill: 1, depth: 8, profile: 'sharp' }],
  ['shards', { count: 26, stretch: 0.7, jitter: 0.85, depth: 9 }],
  ['fins', { count: 24, angle: 0, fill: 0.45, depth: 9, profile: 'flat', swirl: 90 }],
  ['hobnail', { count: 24, fill: 0.85, jitter: 0, vary: 0, stretch: 1, arch: false, depth: 5, profile: 'round' }],
  ['cubes', { count: 10, stretch: 1, depth: 7 }],
  ['facets', { count: 14, stretch: 1, jitter: 0.5, depth: 7 }],
  ['carved', { count: 14, stretch: 1.15, depth: 5.5, profile: 'round' }],
  ['quilt', { count: 14, angle: 60, fill: 1, depth: 5, profile: 'round' }],
];
for (const [pat, sv] of bold) {
  const row = [];
  for (const [fk, form] of Object.entries(forms)) {
    const d = design({ name: `${pat}/${fk}`, object: fk === 'flare' ? 'bowl' : 'planter', form, surface: { pattern: pat, mode: 'relief', bandBottom: 0, bandTop: 4, ...sv } });
    const r = generate(d, 0.7), m = mainOf(r), bad = openEdges(m);
    if (bad) fail(`${pat}/${fk}: ${bad} open edges`);
    if (m.stats.overhang > 5) fail(`${pat}/${fk}: ${m.stats.overhang.toFixed(0)} mm² overhang`);
    row.push(`${fk} ${m.stats.overhang.toFixed(0)}`);
  }
  console.log(`  ${pat.padEnd(8)} ${row.join('  ')} mm²`);
}
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
