// Engine checks, run with `npm test` (and on every push by the GitHub build):
//  1. every part of every collection piece is a closed solid, and relief textures print without supports
//  2. multicolour bands are each closed, and cutting them adds no overhang
//  3. the print mesh follows the intended relief closely (no saw-tooth on creases)
//  4. a batch of random designs all build closed
//  5. self-watering inserts drop into their pots
//  6. bold, deep relief keeps its undersides printable on bellied, twisted and flared shapes
//  7. shuffled designs print without supports
//  8. lids fit twisted, shaped boxes
//  9. globe lamps: every top, underside, outline and pattern builds closed, a closed ball says it needs
//     supports and a peak with a cone underside needs none, relief covers the whole ball; the glow test
//     strip is closed
// 10. faceted wall planters: every tilt, depth, diamond shape and rim builds closed, with no overhangs, a
//     flat foot on the bed, a flat back on the wall and a keyhole through it
import { generate, makeProfile, easeProfile, globeShape, glowTest, GLOW_STEPS, facetedWall, __test } from '../app/engine.js';
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
  // a closed globe leans past 45° on purpose (and says so); the rest must not
  const supported = r.checks.some((c) => /^Needs supports/.test(c.text));
  if (d.object === 'globe' && supported !== (d.extras.globeTop !== 'peak' || d.extras.globeUnder !== 'cone')) fail(`${d.name}: support warning ${supported ? 'shown' : 'missing'}`);
  if (d.surface.mode === 'relief' && over > 5 && !supported) fail(`${d.name}: relief overhang ${over.toFixed(0)} mm²`);
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
const objects = ['planter', 'vase', 'bowl', 'box', 'cup', 'pendant', 'lamp', 'hanging', 'wall', 'orchid', 'lantern', 'tray', 'ring', 'candle'];
const patterns = ['lattice', 'prism', 'ogee', 'arches', 'voronoi', 'honeycomb', 'dots', 'perforated', 'ribs', 'chevron', 'reeds', 'waves', 'knit', 'weave', 'petals', 'quilt', 'facets', 'tiles',
  'hammered', 'carved', 'rings', 'dunes', 'bark', 'gouge', 'cubes', 'knurl', 'seigaiha', 'herringbone', 'blocks', 'spikes', 'shards', 'fins', 'hobnail', 'smooth'];
for (let k = 0; k < 48; k++) {
  const obj = any(objects), pat = any(patterns);
  const low = obj === 'tray' || obj === 'ring';
  const d = design({
    object: obj,
    form: { bottom: any(['flat', 'round']), rimEdge: any(['flat', 'round', 'bevel', 'rolled']), height: low ? 25 + rand() * 30 : 60 + rand() * 160, diameter: (obj === 'ring' ? 40 : 70) + rand() * (obj === 'ring' ? 40 : 160), base: 0.6 + rand() * 0.5, top: 0.7 + rand() * 0.5, section: any(['round', 'round', 'polygon', 'lobed']), twist: any([0, 0, 40]), rimEdge: any(['flat', 'round', 'bevel']) },
    surface: { pattern: pat, mode: obj === 'pendant' || obj === 'lamp' || obj === 'lantern' ? 'cut' : any(['relief', 'relief', 'cut']), bandBottom: low ? 2 : 6, bandTop: low ? 2 : 4, count: 8 + Math.floor(rand() * 30), depth: 0.8 + rand() * rand() * 8, swirl: any([0, 0, 90, -150]) },
    extras: { base: obj === 'planter' ? any(['none', 'saucer', 'sleeve', 'insert']) : obj === 'orchid' ? any(['none', 'saucer']) : 'none', baseH: 40 + rand() * 50, hangers: any([3, 4]), back: rand() * 0.6, drain: any([0, 10]), stand: any(['none', 'none', 'mid', 'upright', 'wide']), standLift: 40 + rand() * 120, standHug: 0.2 + rand() * 0.4, candle: any(['tealight', 'maxi', 'taper']), edgeBoth: any([true, false]), innerChamfer: any([0, 1.5]) },
  });
  const r = generate(d, 0.7);
  for (const p of r.parts) { const bad = openEdges(p); if (bad) fail(`random #${k} ${obj}/${pat} ${p.key}: ${bad} open edges`); }
  for (const p of r.parts.filter((q) => q.key.startsWith('stand'))) if (p.stats.overhang > 0) fail(`random #${k} ${p.key}: stand overhang ${p.stats.overhang.toFixed(0)} mm²`);
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
  inserts.push(design({ name: `random insert ${k}`, object: 'planter', extras: { base: 'insert', reservoir: 8 + rand() * 30 },
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

// ---------------------------------------------------------------- 7
if (run(7)) {
// Shuffle on its own (before the studio's own retry) should almost always land on a design that prints
// without supports. The shuffle code is the studio's own, read out of app/app.js.
console.log('7. shuffled designs print without supports');
const { makeShuffler } = await import('./shuffle-lib.mjs');
const { OBJECTS } = await import('../app/presets.js');
const S = makeShuffler(11), objs = Object.keys(OBJECTS), n = objs.length * 6;
let warn = 0, bad = 0;
for (let k = 0; k < n; k++) {
  const d = S.shuffled(objs[k % objs.length]);
  const r = generate(d, 0.7), over = r.parts.reduce((a, p) => a + p.stats.overhang, 0);
  // a closed globe needs supports by design, and says so
  if (d.object === 'globe' && r.checks.some((c) => /^Needs supports/.test(c.text))) continue;
  if (r.checks.some((c) => c.level === 'bad')) { bad++; console.log(`  bad: ${d.object} ${d.surface.pattern}/${d.surface.mode} ${d.form.section} twist ${d.form.twist}: ${r.checks.filter((c) => c.level === 'bad').map((c) => c.text).join(' ')}`); }
  else if (over > 60) warn++;
}
console.log(`  ${n} shuffles: ${bad} unprintable, ${warn} with small overhangs`);
if (bad) fail(`${bad} shuffled designs need supports`);
if (warn > n * 0.08) fail(`${warn} of ${n} shuffled designs have small overhangs (more than 8%)`);
}

// ---------------------------------------------------------------- 8
if (run(8)) {
// A lid's plug on a twisted, shaped box keeps the box's outline and must pass the opening as it turns:
// at every angle and depth, the plug stays inside the box's inner wall.
console.log('8. lids fit twisted boxes');
for (const [sec, extra] of [['polygon', { sides: 4, corner: 0.3 }], ['polygon', { sides: 6, corner: 0.2 }], ['lobed', { lobes: 8, lobeDepth: 0.1 }]]) for (const twist of [35, -70]) {
  const d = design({ object: 'box', form: { height: 100, diameter: 170, section: sec, twist, ...extra }, extras: { lid: true }, surface: { pattern: 'smooth', mode: 'none' } });
  const r = generate(d, 0.7), box = r.parts.find((p) => p.key === 'box'), lid = r.parts.find((p) => p.key === 'lid');
  const A = 720, H = d.form.height, bins = Math.ceil(H) + 1, inner = new Float64Array(A * bins).fill(Infinity), P = box.position;
  for (let v = 0; v < P.length; v += 3) {
    const z = P[v + 2]; if (z < 10) continue;
    const a = Math.floor(((Math.atan2(P[v + 1], P[v]) / TAU) + 1) * A) % A, hb = Math.floor(z);
    inner[a * bins + hb] = Math.min(inner[a * bins + hb], Math.hypot(P[v], P[v + 1]));
  }
  // the plug passes every height above where it ends up on its way in
  for (let a = 0; a < A; a++) for (let hb = bins - 2; hb >= 0; hb--) inner[a * bins + hb] = Math.min(inner[a * bins + hb], inner[a * bins + hb + 1]);
  // the lid prints upside down: placed on the box it is mirrored in y and z
  let worst = Infinity;
  const Q = lid.position, z0 = lid.place.z;
  for (let v = 0; v < Q.length; v += 3) {
    const x = Q[v], y = -Q[v + 1], z = z0 - Q[v + 2];
    if (z > H - 0.3 || z < H - 20) continue;
    const a = Math.floor(((Math.atan2(y, x) / TAU) + 1) * A) % A;
    for (const hb of [Math.floor(z), Math.ceil(z)]) { const lim = inner[a * bins + clamp(hb, 0, bins - 1)]; if (Number.isFinite(lim)) worst = Math.min(worst, lim - Math.hypot(x, y)); }
  }
  console.log(`  ${sec.padEnd(7)} ${JSON.stringify(extra).padEnd(26)} twist ${String(twist).padStart(3)}: clearance ${worst.toFixed(2)} mm, lid overhang ${lid.stats.overhang.toFixed(0)} mm²`);
  if (!(worst > 0.1)) fail(`${sec} twist ${twist}: the lid plug hits the box (clearance ${worst.toFixed(2)} mm)`);
  if (lid.stats.overhang > 5) fail(`${sec} twist ${twist}: lid overhang ${lid.stats.overhang.toFixed(0)} mm²`);
}
}

// ---------------------------------------------------------------- 9
if (run(9)) {
console.log('9. globe lamps');
const base = { object: 'globe', form: { height: 210, diameter: 210, wall: 1.8, section: 'round', twist: 0 }, surface: { pattern: 'smooth', mode: 'none', bandBottom: 0, bandTop: 0 }, extras: { opening: 90, baseH: 45 } };
const mk = (o) => {
  const d = design(base);
  for (const k of ['form', 'surface', 'extras']) Object.assign(d[k], o[k] || {});
  if (o.multicolor) d.multicolor = o.multicolor;
  return d;
};
const cases = [];
for (const globeTop of ['round', 'peak']) for (const globeUnder of ['round', 'cone']) cases.push([`${globeTop} top, ${globeUnder} underside`, { extras: { globeTop, globeUnder } }]);
cases.push(
  ['egg, 3 mm wall', { form: { height: 250, diameter: 190, wall: 3 } }],
  ['flattened orb, narrow opening', { form: { height: 150, diameter: 230 }, extras: { opening: 60 } }],
  ['lobed melon with relief ribs', { form: { section: 'lobed', lobes: 12, lobeDepth: 0.07 }, surface: { pattern: 'ribs', mode: 'relief', count: 50, depth: 1.8, fill: 1, profile: 'round' } }],
  ['octagon, peak top, cone underside', { form: { section: 'polygon', sides: 8, corner: 0.4 }, extras: { globeTop: 'peak', globeUnder: 'cone' } }],
  ['twisted hexagon', { form: { section: 'polygon', sides: 6, corner: 0.45, twist: 60 } }],
  ['lattice openwork', { surface: { pattern: 'lattice', mode: 'cut', count: 22, width: 2.2, angle: 55 } }],
  ['two-tone bands', { multicolor: { cuts: [70, 140], slots: [0, 1, 0] } }],
);
for (const [name, o] of cases) {
  const d = mk(o), r = generate(d, 0.8), g = mainOf(r);
  let open = 0;
  for (const p of r.parts) open += openEdges(p);
  for (const rg of g.regions || []) open += openEdges(g, rg.first, rg.count);
  const supported = r.checks.some((c) => /^Needs supports/.test(c.text));
  const wantSupports = (d.extras.globeTop || 'round') === 'round' || (d.extras.globeUnder || 'round') === 'round';
  const over = r.parts.reduce((a, p) => a + p.stats.overhang, 0);
  const b = g.stats.bbox, gs = globeShape(d.form, d.extras, d.form.wall);
  // the ball is as tall and wide as asked, stands on its collar, and the base is there
  const sizeOk = Math.abs(b[5] - d.form.height) < 1.5 && Math.abs(b[3] - b[0] - d.form.diameter) < d.form.diameter * 0.08 + (d.form.section === 'round' ? 1 : 30);
  const ok = !open && supported === wantSupports && (wantSupports || over < 60) && sizeOk && r.parts.some((p) => p.key === 'base') && Math.abs(gs.dome.zOut - gs.dome.zIn) >= d.form.wall - 1e-6;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${(g.stats.tris / 1000).toFixed(0)}k tris, ${open} open edges, ${b[5].toFixed(0)} mm tall, overhang ${(over / 100).toFixed(0)} cm², ${supported ? 'needs supports (said so)' : 'no supports'}`);
  if (!ok) fail(`globe ${name}`);
}
// a relief runs over the whole ball: it stands out near the top and on the underside as well as at the middle
{
  const d = mk({ surface: { pattern: 'waves', mode: 'relief', count: 4, rows: 24, wave: 0.45, depth: 1.8, fill: 1, profile: 'soft' } });
  const r = generate(d, 0.8), g = mainOf(r), gs = globeShape(d.form, d.extras, d.form.wall), P = g.position;
  const zone = { top: 0, middle: 0, under: 0 };
  for (let v = 0; v < P.length; v += 3) {
    const u = (P[v + 2] - gs.zc) / gs.c, h = (Math.sqrt((P[v] ** 2 + P[v + 1] ** 2) / gs.R ** 2 + u * u) - 1) * gs.R;
    const k = u > 0.88 ? 'top' : u < -0.75 && P[v + 2] > gs.collar + 3 ? 'under' : Math.abs(u) < 0.3 ? 'middle' : null;
    if (k && h > zone[k]) zone[k] = h;
  }
  const ok = zone.top > 0.9 && zone.under > 0.9 && zone.middle > 0.9 && !openEdges(g);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} relief all over: stands out ${zone.top.toFixed(1)} mm near the top, ${zone.middle.toFixed(1)} mm round the middle, ${zone.under.toFixed(1)} mm underneath`);
  if (!ok) fail('globe relief coverage');
}
// the glow test strip: closed, outward, with every step
const gt = glowTest(), gOpen = openEdges(gt);
const gOk = !gOpen && gt.stats.volume > 3000 && gt.stats.overhang < 1 && GLOW_STEPS.length >= 5;
console.log(`  ${gOk ? 'ok  ' : 'FAIL'} glow test: ${GLOW_STEPS.join(', ')} mm, ${(gt.stats.volume / 1000).toFixed(1)} cm³, ${gOpen} open edges`);
if (!gOk) fail('glow test');
}

// ---------------------------------------------------------------- 10
if (run(10)) {
console.log('10. faceted wall planters');
const cases = [['cube', {}], ['shallow tilt', { facetTilt: 15 }], ['steep tilt, raised rim', { facetTilt: 44, facetRim: 25 }], ['tall diamond', { facetStretch: 1.5, facetTilt: 30 }],
  ['squat diamond', { facetStretch: 0.75 }], ['shallow, rim cut low', { facetDepth: 0.65, facetRim: -30 }], ['deep', { facetDepth: 1.35 }], ['small, thin wall', { facetTilt: 38 }, { diameter: 90, wall: 1.6 }]];
for (const [name, ex, fo] of cases) {
  const d = design({ object: 'wall', form: { diameter: 160, wall: 3, floor: 3, ...(fo || {}) }, extras: { wallStyle: 'facet', ...ex } });
  const r = generate(d, 1), p = r.parts[0], P = p.position, I = p.index, g = facetedWall(d.form, d.extras);
  let vol = 0, foot = 0, back = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, area = Math.hypot(nx, ny, nz) / 2;
    if (nz < 0 && Math.max(P[a + 2], P[b + 2], P[c + 2]) < 1e-3) foot += area;
    if (ny > 0 && Math.min(P[a + 1], P[b + 1], P[c + 1]) > -1e-3) back += area;
  }
  const open = openEdges(p), bb = p.stats.bbox;
  const ok = !open && vol > 0 && p.stats.overhang < 1 && foot > 60 && back > 500 && Math.abs(bb[2]) < 1e-3 && Math.abs(bb[4]) < 1e-3 && g.keyhole !== null && Math.abs(bb[3] - bb[0] - d.form.diameter) < 0.01 && !r.checks.some((c) => c.level === 'bad');
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${p.stats.tris} tris, ${open} open edges, ${(vol / 1000).toFixed(0)} cm³, ${Math.round(bb[5])} mm tall, ${Math.round(-bb[1])} mm out, foot ${foot.toFixed(0)} mm², back ${(back / 100).toFixed(0)} cm², overhang ${p.stats.overhang.toFixed(1)} mm²${g.keyhole === null ? ', no keyhole' : ''}`);
  if (!ok) fail(`faceted ${name}`);
}
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
