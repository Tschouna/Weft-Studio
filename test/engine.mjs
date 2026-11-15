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
// 10. faceted wall planters: the original's exact shape at 160 mm (its planes and volume), scaled whole to
//     every width, closed, rim on the bed, a flat back with two Ø 6 mm screw holes, nothing worse than a warning
// 11. domed bottoms on hanging and wall planters: a round bottom is a true ellipse that closes in a point,
//     a pointed one prints with no overhang; every outline, pattern, rim edge, drainage hole and colour
//     band builds closed with the rim flat on the bed; the pattern reaches the tip; a wall planter's back
//     stays flat and a wall's thickness thick right down to the tip
// 12. wall planters: every row is the same D on the wall (nothing is stretched), the pattern runs round to
//     the back and the wall's plane cuts it off flat; one or two mounting holes, keyholes or screw holes,
//     sized and spaced as asked and kept on the flat of the back; a self-watering insert drops in with its
//     clearance all round, clears the mounting screws from its foot up, and prints without supports
import { generate, makeProfile, easeProfile, shapeProfile, globeShape, glowTest, GLOW_STEPS, facetedWall, __test } from '../app/engine.js';
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
  const r0 = generate(base, 0.6), H = base.form.height, plain = mainOf(r0).stats.overhang;
  // (a piece that needs supports by design, a closed globe or a round-bottomed planter, has a large overhang
  // of its own inside; cutting it into bands re-meshes that inside, which moves the count by a few percent)
  const slack = r0.checks.some((c) => /^Needs supports/.test(c.text)) ? Math.max(5, 0.04 * plain) : 5;
  for (const cuts of [[H * 0.42], [H / 3, (2 * H) / 3]]) {
    const r = generate({ ...base, multicolor: { cuts, slots: [0, 1, 2] } }, 0.6), m = mainOf(r);
    for (const rg of m.regions || []) { const bad = openEdges(m, rg.first, rg.count); if (bad) fail(`${base.name} band ${rg.slot}: ${bad} open edges`); }
    if (m.stats.overhang > plain + slack) fail(`${base.name}: bands add ${(m.stats.overhang - plain).toFixed(0)} mm² overhang`);
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
// the original (WP013) at 160 mm wide: its outside faces, measured from its STL, and its volume
const nz = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const r19 = (19 * Math.PI) / 180;
const FACES = [['sides', [1, 0, 0]], ['sides', [-1, 0, 0]], ['front', nz([30, 80, 0])], ['front', nz([-30, 80, 0])],
  ['bottom', nz([52.5, 0, 80])], ['bottom', nz([-52.5, 0, 80])], ['diamond', [0, Math.cos(r19), Math.sin(r19)]], ['back', [0, -1, 0]], ['rim', [0, 0, -1]]];
const cases = [['1:1 with the original', 160, 3], ['larger', 240, 3], ['largest', 300, 3], ['smaller, thinner wall', 90, 2], ['thick wall', 160, 4], ['smallest', 60, 1.6]];
for (const [name, W, wall] of cases) {
  const k = W / 160, d = design({ object: 'wall', form: { diameter: W, wall, floor: 3 }, extras: { wallStyle: 'facet' } });
  const r = generate(d, 1), p = r.parts[0], P = p.position, I = p.index, g = facetedWall(d.form, d.extras);
  let vol = 0;
  const found = FACES.map(() => 0);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(...n);
    if (l < 1e-9) continue;
    // an outside face lies on the original's plane (scaled): facing the right way, and as far out as the hull
    FACES.forEach(([, f], q) => { if (f[0] * n[0] + f[1] * n[1] + f[2] * n[2] > 0.99999 * l) found[q] += l / 2; });
  }
  const open = openEdges(p), bb = p.stats.bbox;
  // the outline scales exactly: 160 × 90 × 150 mm at 1:1
  const sizeOk = [bb[0] + 80 * k, bb[1], bb[2], bb[3] - 80 * k, bb[4] - 90 * k, bb[5] - 150 * k].every((e) => Math.abs(e) < 0.01);
  const volOk = W !== 160 || wall !== 3 || Math.abs(vol / 1000 - 179.11) < 179.11 * 0.01;
  const missing = FACES.filter((_, q) => found[q] < 1).map(([nm]) => nm);
  const holesOk = g.holes === 2 || W < 80;
  const ok = !open && vol > 0 && sizeOk && volOk && !missing.length && holesOk && !r.checks.some((c) => c.level === 'bad');
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name} (${W} mm, wall ${wall}): ${p.stats.tris} tris, ${open} open edges, ${(vol / 1000).toFixed(1)} cm³, ${bb.slice(3).map((v, i) => (v - bb[i]).toFixed(1)).join(' × ')} mm, ${g.holes} screw holes, overhang ${(p.stats.overhang / 100).toFixed(0)} cm²${missing.length ? `, missing faces: ${missing.join(', ')}` : ''}${!sizeOk ? ', wrong size' : ''}${!volOk ? ', volume off the original' : ''}`);
  if (!ok) fail(`faceted ${name}`);
}
}

// ---------------------------------------------------------------- 11
if (run(11)) {
console.log('11. domed bottoms');
// the silhouette: a round bottom is a true quarter ellipse from the widest point down to a point on the axis
{
  const F = design({ object: 'hanging', form: { bottom: 'round', height: 160, diameter: 150, belly: 0.5, top: 1 } }).form;
  const fn = shapeProfile(F).fn, R = 75, zb = 80;
  let worst = 0;
  for (let k = 0; k <= 200; k++) { const z = (zb * k) / 200, u = 1 - z / zb; worst = Math.max(worst, Math.abs(fn(z) - R * Math.sqrt(Math.max(0, 1 - u * u)))); }
  const ok = worst < 0.05 && fn(0) < 1e-6 && Math.abs(fn(zb) - R) < 0.05;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} round silhouette: off a true ellipse by at most ${worst.toFixed(3)} mm, closes at ${fn(0).toFixed(3)} mm`);
  if (!ok) fail('round silhouette');
  // a pointed bottom never leans past 44° (for a wall planter: its front, which leans 1 + back times as far)
  for (const [nm, back] of [['hanging', 0], ['wall', 0.3]]) {
    const g = shapeProfile({ ...F, bottom: 'point' }, back).fn;
    let lean = 0;
    for (let k = 0; k < 400; k++) { const z0 = (160 * k) / 400, z1 = (160 * (k + 1)) / 400; lean = Math.max(lean, (Math.abs(g(z1) - g(z0)) / (z1 - z0)) * (1 + back)); }
    const deg = (Math.atan(lean) * 180) / Math.PI, okP = deg < 44.6 && g(0) < 1e-6;
    console.log(`  ${okP ? 'ok  ' : 'FAIL'} pointed silhouette (${nm}): leans ${deg.toFixed(1)}° at most, closes at ${g(0).toFixed(3)} mm`);
    if (!okP) fail(`pointed silhouette ${nm}`);
  }
}
const relief = (pattern, extra = {}) => ({ pattern, mode: 'relief', count: 16, depth: 2.5, fill: 1, profile: 'round', bandBottom: 0, bandTop: 0, ...extra });
const smooth = { pattern: 'smooth', mode: 'none', bandBottom: 0, bandTop: 0 };
const cases = [
  ['hanging, round, smooth', { object: 'hanging', form: { bottom: 'round' }, surface: smooth }],
  ['hanging, round, prism relief', { object: 'hanging', form: { bottom: 'round' }, surface: relief('prism', { angle: 58, depth: 3.2, profile: 'sharp' }) }],
  ['hanging, round, ribs, rolled lip, 4 cords', { object: 'hanging', form: { bottom: 'round', rimEdge: 'rolled' }, extras: { hangers: 4 }, surface: relief('ribs', { count: 36 }) }],
  ['hanging, round, drainage hole', { object: 'hanging', form: { bottom: 'round', rimEdge: 'round' }, extras: { drain: 10 }, surface: relief('quilt') }],
  ['hanging, round, lobed outline', { object: 'hanging', form: { bottom: 'round', section: 'lobed', lobes: 10, lobeDepth: 0.08 }, surface: smooth }],
  ['hanging, round, twisted hexagon', { object: 'hanging', form: { bottom: 'round', section: 'polygon', sides: 6, corner: 0.3, twist: 40 }, surface: relief('waves', { rows: 10 }) }],
  ['hanging, round, three colour bands', { object: 'hanging', form: { bottom: 'round' }, surface: relief('facets'), multicolor: { cuts: [40, 80], slots: [0, 1, 2] } }],
  ['hanging, round, shallow bowl', { object: 'hanging', form: { bottom: 'round', belly: 0.25, height: 110 }, surface: relief('hammered') }],
  ['hanging, round, deep and narrow', { object: 'hanging', form: { bottom: 'round', belly: 0.8, height: 220, diameter: 110 }, surface: relief('prism', { angle: 58 }) }],
  ['hanging, pointed, prism relief', { object: 'hanging', form: { bottom: 'point' }, surface: relief('prism', { angle: 58, depth: 3.2, profile: 'sharp' }) }],
  ['hanging, pointed, drainage hole, bevel', { object: 'hanging', form: { bottom: 'point', rimEdge: 'bevel' }, extras: { drain: 8 }, surface: relief('ribs', { count: 30 }) }],
  ['hanging, pointed, twisted octagon', { object: 'hanging', form: { bottom: 'point', section: 'polygon', sides: 8, corner: 0.3, twist: 30 }, surface: smooth }],
  ['hanging, pointed, spikes', { object: 'hanging', form: { bottom: 'point' }, surface: relief('spikes', { count: 20, angle: 60, depth: 5, profile: 'sharp' }) }],
  ['wall, round, smooth', { object: 'wall', form: { bottom: 'round' }, surface: smooth }],
  ['wall, round, prism relief', { object: 'wall', form: { bottom: 'round', height: 125, diameter: 165, belly: 0.56, top: 0.96 }, surface: relief('prism', { angle: 58, depth: 3.2, profile: 'sharp' }) }],
  ['wall, round, ribs, rounded rim', { object: 'wall', form: { bottom: 'round', rimEdge: 'round' }, surface: relief('ribs', { count: 40 }) }],
  ['wall, round, two colour bands', { object: 'wall', form: { bottom: 'round' }, surface: relief('quilt'), multicolor: { cuts: [70], slots: [1, 0] } }],
  ['wall, round, deep back', { object: 'wall', form: { bottom: 'round' }, extras: { back: 0.55 }, surface: relief('waves', { rows: 8 }) }],
  ['wall, pointed, smooth', { object: 'wall', form: { bottom: 'point' }, surface: smooth }],
  ['wall, pointed, prism relief', { object: 'wall', form: { bottom: 'point' }, surface: relief('prism', { angle: 58, depth: 3.2, profile: 'sharp' }) }],
  ['wall, pointed, hammered, rolled lip', { object: 'wall', form: { bottom: 'point', rimEdge: 'rolled' }, surface: relief('hammered') }],
];
for (const [name, o] of cases) {
  const d = design(o), r = generate(d, 0.8), p = r.parts.find((q) => q.key === 'pot'), P = p.position, I = p.index, bb = p.stats.bbox;
  const point = d.form.bottom === 'point', wall = d.object === 'wall', H = d.form.height, t = d.form.wall, R = d.form.diameter / 2;
  const open = openEdges(p);
  // the rim is flat on the bed; near the tip the pattern still stands out of the wall
  let rimArea = 0, backOff = 0, backArea = 0, tipRelief = 0, vol = 0;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
    vol += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, area = Math.hypot(nx, ny, nz) / 2;
    if (nz < -1.99 * area && Math.max(P[a + 2], P[b + 2], P[c + 2]) < 1e-3) rimArea += area;
    // a wall planter's back: flat on the wall's plane, at the full height
    if (wall && ny > 1.99999 * area) { const y = (P[a + 1] + P[b + 1] + P[c + 1]) / 3; if (y > bb[4] - 0.5) { backArea += area; backOff = Math.max(backOff, bb[4] - Math.min(P[a + 1], P[b + 1], P[c + 1])); } }
  }
  // the back wall's thickness in the dome (the last third of the print): inside faces that look away from the
  // wall (on a smooth pot: a pattern's own faces look that way too, right up to the wall)
  let thin = Infinity;
  const plain = d.surface.mode !== 'relief';
  if (wall && plain) for (let v = 0; v < P.length / 3; v++) if (p.normal[v * 3 + 1] < -0.92 && P[v * 3 + 1] > bb[4] - 2.5 * t && Math.abs(P[v * 3]) < 10 && P[v * 3 + 2] > H * 0.6) thin = Math.min(thin, bb[4] - P[v * 3 + 1]);
  // relief within 30% of the radius of the tip: how far the surface stands off the bare silhouette there
  if (d.surface.mode === 'relief') {
    const fn = shapeProfile(d.form, wall ? clamp(d.extras.back ?? 0.3, 0.1, 0.6) : 0).fn;
    for (let v = 0; v < P.length / 3; v++) {
      const z = H - P[v * 3 + 2];
      if (z < 0 || z > H * 0.5 || (wall && p.normal[v * 3 + 1] > -0.2)) continue;
      const rr = Math.hypot(P[v * 3], wall ? 0 : P[v * 3 + 1]);
      if (!wall && fn(z) < 0.3 * R && fn(z) > 0.12 * R) tipRelief = Math.max(tipRelief, rr - fn(z));
      if (wall && fn(z) < 0.3 * R && fn(z) > 0.12 * R && Math.abs(P[v * 3 + 1] - (bb[4] - fn(z) * (1 + (d.extras.back ?? 0.3)))) < 6) tipRelief = Math.max(tipRelief, 1);
    }
  }
  const supported = r.checks.some((c) => /^Needs supports/.test(c.text)), bad = r.checks.filter((c) => c.level === 'bad');
  const tall = bb[5] - bb[2], bands = d.multicolor ? (p.regions || []).length : 0;
  // (a drainage hole takes the very tip off: on a pointed bottom that is a few millimetres)
  const cutOff = d.extras.drain > 0 ? (point ? 1.5 * (d.extras.drain / 2 + t) : 1.5) : 0.6;
  const ok = !open && vol > 0 && Math.abs(bb[2]) < 1e-6 && rimArea > 200 && tall > H - cutOff && tall < H + d.surface.depth + 0.5 && !bad.length
    && (point ? p.stats.overhang < 60 && !supported : supported)
    && (!wall || (backOff < 0.05 && backArea > 0.5 * R * H && Math.abs(bb[4] - r.info.wallY) < 1e-4 && (!plain || (thin > 0.85 * t && thin < 1.2 * t))))
    && (d.surface.mode !== 'relief' || tipRelief > 0.3)
    && (!d.multicolor || bands === d.multicolor.cuts.length + 1)
    && r.parts[0].place.flipZ && r.parts[0].place.turnY;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${(p.stats.tris / 1000).toFixed(0)}k tris, ${open} open edges, ${tall.toFixed(1)} mm tall, rim ${(rimArea / 100).toFixed(0)} cm² on the bed, overhang ${(p.stats.overhang / 100).toFixed(1)} cm²${supported ? ' (says it needs supports)' : ''}${wall ? `, back ${(backArea / 100).toFixed(0)} cm² flat within ${backOff.toFixed(3)} mm${plain ? `, ${thin.toFixed(2)} mm thick at the tip` : ''}` : ''}${d.surface.mode === 'relief' ? `, relief at the tip ${tipRelief.toFixed(1)} mm` : ''}${bands ? `, ${bands} bands` : ''}${bad.length ? ` BAD: ${bad.map((c) => c.text).join(' ')}` : ''}`);
  if (!ok) fail(`domed ${name}`);
}
}

// ---------------------------------------------------------------- 12
if (run(12)) {
console.log('12. wall planters: pattern to the back, mounting holes, self-watering inserts');
const smooth = { pattern: 'smooth', mode: 'none', bandBottom: 0, bandTop: 0 };
const prism = { pattern: 'prism', mode: 'relief', count: 12, angle: 58, fill: 0.6, depth: 3.2, profile: 'sharp', bandBottom: 0, bandTop: 0 };
// a part's points as they are shown (a domed pot is built upside down and turned over)
const shown = (p) => {
  const P = p.position, out = new Float64Array(P.length), pl = p.place;
  for (let v = 0; v < P.length; v += 3) {
    if (pl.flipZ) { out[v] = pl.turnY ? -P[v] : P[v]; out[v + 1] = pl.turnY ? P[v + 1] : -P[v + 1]; out[v + 2] = pl.z - P[v + 2]; }
    else { out[v] = P[v]; out[v + 1] = P[v + 1]; out[v + 2] = P[v + 2] + (pl.z || 0); }
  }
  return out;
};
// the flat of the back: faces square to the wall, on its plane
const backArea = (p, plane) => {
  const P = p.position, I = p.index; let a = 0;
  for (let k = 0; k < I.length; k += 3) {
    const i = I[k] * 3, j = I[k + 1] * 3, m = I[k + 2] * 3;
    if (Math.min(P[i + 1], P[j + 1], P[m + 1]) < plane - 1e-3) continue;
    a += Math.abs((P[j] - P[i]) * (P[m + 2] - P[i + 2]) - (P[m] - P[i]) * (P[j + 2] - P[i + 2])) / 2;
  }
  return a;
};

// (a) every row is the same D standing on the wall: its depth is always (1 + back) / 2 of its width
for (const [name, form, back] of [['tapered, flat bottom', { base: 0.5, top: 1.1 }, 0.3], ['bellied, deep back', { base: 0.7, top: 0.8, belly: 0.45 }, 0.5], ['pointed', { bottom: 'point' }, 0.3], ['round', { bottom: 'round' }, 0.3]]) {
  const d = design({ object: 'wall', form, extras: { back }, surface: smooth }), r = generate(d, 0.8), p = r.parts[0], P = shown(p), plane = r.info.wallY;
  const rows = new Map();
  for (let v = 0; v < P.length; v += 3) {
    const k = Math.round(P[v + 2] / 4); let e = rows.get(k);
    if (!e) rows.set(k, e = { x: 0, y0: Infinity, y1: -Infinity });
    e.x = Math.max(e.x, Math.abs(P[v])); e.y0 = Math.min(e.y0, P[v + 1]); e.y1 = Math.max(e.y1, P[v + 1]);
  }
  let worst = 0, n = 0, off = 0;
  for (const [k, e] of rows) {
    if (e.x < 20 || k * 4 < 8 || k * 4 > d.form.height - 6) continue; // (the floor, the rim's edge and the very tip aside)
    worst = Math.max(worst, Math.abs((e.y1 - e.y0) / (2 * e.x) - (1 + back) / 2)); off = Math.max(off, Math.abs(e.y1 - plane)); n++;
  }
  const ok = n > 10 && worst < 0.02 && off < 1e-3 && Math.abs(p.stats.bbox[4] - plane) < 1e-4 && !openEdges(p);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${n} slices, depth over width off (1 + back) / 2 by at most ${worst.toFixed(4)}, back on the wall within ${off.toFixed(4)} mm`);
  if (!ok) fail(`wall shape ${name}`);
}

// (b) the pattern runs round to the back: close to the wall the textured pot is wider than the bare one,
// nothing passes the wall's plane, and the back is flat
for (const [name, form, surface] of [['flat bottom, prism', {}, prism], ['pointed, prism', { bottom: 'point' }, prism], ['round, ribs', { bottom: 'round' }, { ...prism, pattern: 'ribs', count: 40, depth: 2.5, profile: 'round', fill: 1 }], ['flat bottom, hammered (pressed in)', {}, { ...prism, pattern: 'hammered', count: 14, depth: 1.6, profile: 'round', fill: 1 }], ['tapered, rolled lip, prism', { base: 0.55, rimEdge: 'rolled' }, prism]]) {
  const mk = (surf) => { const d = design({ object: 'wall', form, surface: surf }); return [d, generate(d, 0.8)]; };
  const [d, r] = mk(surface), [, r0] = mk(smooth), p = r.parts[0], plane = r.info.wallY;
  // how far the surface stands off the bare one, among points 1.5 to 6 mm in front of the wall
  const reach = (res) => { const P = shown(res.parts[0]), m = new Map(); for (let v = 0; v < P.length; v += 3) { const dy = plane - P[v + 1]; if (dy < 1.5 || dy > 6) continue; const k = Math.round(P[v + 2] / 5); m.set(k, Math.max(m.get(k) ?? 0, Math.abs(P[v]))); } return m; };
  const A = reach(r), B = reach(r0);
  let stand = 0, dent = 0;
  for (const [k, x] of A) if (B.has(k) && k * 5 > 15 && k * 5 < d.form.height - 12) { stand = Math.max(stand, x - B.get(k)); dent = Math.max(dent, B.get(k) - x); }
  const pressed = surface.pattern === 'hammered';
  const flat = backArea(p, plane), flat0 = backArea(r0.parts[0], plane);
  // (a pattern pressed into the wall leaves the back as it is: flat, and no smaller)
  const ok = !openEdges(p) && Math.abs(p.stats.bbox[4] - plane) < 1e-4 && (pressed ? Math.abs(flat - flat0) < 0.06 * flat0 : stand > 0.4 * surface.depth) && flat > 0.98 * flat0 && !r.checks.some((c) => c.level === 'bad')
    && (d.form.bottom === 'round' || p.stats.overhang < 60);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: by the wall the pattern ${pressed ? 'is pressed in, and the back is whole' : `stands out ${stand.toFixed(1)} mm`}, nothing passes the wall (${(p.stats.bbox[4] - plane).toExponential(1)} mm), flat back ${(flat / 100).toFixed(0)} cm² (bare: ${(flat0 / 100).toFixed(0)}), overhang ${(p.stats.overhang / 100).toFixed(1)} cm²`);
  if (!ok) fail(`wall pattern ${name}`);
}

// (c) mounting holes: as many, as large, as long and as far apart as asked, kept on the flat of the back
{
  const mk = (extras, form = {}) => { const d = design({ object: 'wall', form, extras, surface: smooth }), r = generate(d, 0.8); return { d, r, p: r.parts[0], m: r.info.mount, flat: backArea(r.parts[0], r.info.wallY) }; };
  const one = mk({}), two = mk({ mountCount: 2, mountSpacing: 70 }), long = mk({ mountSlot: 30 }), big = mk({ mountHead: 14, mountShaft: 6 });
  const screws = mk({ mount: 'screw', mountCount: 2, mountShaft: 5, mountSpacing: 60 }), wide = mk({ mountCount: 2, mountSpacing: 400 }), low = mk({ mountDrop: 60 });
  const narrow = mk({ mountCount: 2, mountSpacing: 80, mountHead: 16 }, { diameter: 44, height: 80 }), domed = mk({ mountCount: 2, mountSpacing: 90, mountDrop: 115 }, { bottom: 'round' }), tip = mk({ mountCount: 2, mountSpacing: 60, mountDrop: 200 }, { bottom: 'round' });
  const oneScrew = mk({ mount: 'screw', mountShaft: 5 });
  const hole = one.flat - two.flat, rows = [
    ['one keyhole by default', one.m.count === 1 && !one.m.screw && one.m.slot === 9 && one.m.drop === 22, `Ø ${one.m.head} opening, ${one.m.shaft} × ${one.m.slot} mm slot, ${one.m.drop} mm under the rim`],
    ['a second keyhole takes as much out of the back as the first', two.m.count === 2 && two.m.spacing === 70 && hole > 80 && hole < 160, `${hole.toFixed(0)} mm² each, ${two.m.spacing} mm apart`],
    ['a longer slot', long.m.slot === 30 && Math.abs(one.flat - long.flat - 21 * 4.6) < 12, `+21 mm of slot takes ${(one.flat - long.flat).toFixed(0)} mm² more (${(21 * 4.6).toFixed(0)} expected)`],
    ['a bigger opening and a wider slot', big.m.head === 14 && big.m.shaft === 6 && one.flat - big.flat > 60, `Ø ${big.m.head} mm opening, ${big.m.shaft} mm slot`],
    ['two plain screw holes', screws.m.screw && screws.m.count === 2 && screws.m.slot === 0 && Math.abs(oneScrew.flat - screws.flat - 1.1 * Math.PI * 2.5 ** 2) < 6, `Ø ${screws.m.shaft} mm, ${screws.m.spacing} mm apart, ${(oneScrew.flat - screws.flat).toFixed(1)} mm² each (${(1.1 * Math.PI * 2.5 ** 2).toFixed(1)} for a Ø 5 mm teardrop)`],
    ['too far apart: as far as the flat of the back allows', wide.m.count === 2 && wide.m.spacing < 125 && wide.m.spacing > 90 && wide.r.checks.some((c) => /as far apart as the flat of the back allows/.test(c.text)), `${wide.m.spacing.toFixed(0)} mm`],
    ['lower down', low.m.drop === 60, `${low.m.drop} mm under the rim`],
    ['a back too narrow for two has one, and says so', narrow.m.count === 1 && narrow.r.checks.some((c) => /too narrow there for two/.test(c.text)), `${narrow.m.count} hole`],
    ['low in a round bowl they move together', domed.m.count === 2 && domed.m.drop === 115 && domed.m.spacing < 90 && domed.m.spacing > 30 && domed.r.checks.some((c) => /as far apart as the flat of the back allows/.test(c.text)), `${domed.m.drop.toFixed(0)} mm under the rim, ${domed.m.spacing.toFixed(0)} mm apart`],
    ['at the very tip there is room for one', tip.m.count === 1 && tip.m.drop < 140 && tip.r.checks.some((c) => /too narrow there for two/.test(c.text)), `${tip.m.drop.toFixed(0)} mm under the rim`],
  ];
  for (const [name, ok, note] of rows) { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: ${note}`); if (!ok) fail(`mount ${name}`); }
  for (const x of [one, two, long, big, screws, oneScrew, wide, low, narrow, domed, tip]) { if (openEdges(x.p)) fail('a wall planter with mounting holes is not closed'); if (x.p.stats.overhang > 60 && x.d.form.bottom !== 'round') fail('mounting holes overhang'); }
}

// (d) self-watering inserts. The pot is sliced every millimetre and rays are cast from a point just inside
// the insert's back: where each first meets a slice is the inside of the pot at that height, and the way
// in from above is as wide as the narrowest slice above. The insert has to keep clear of that all round.
function insertFit(r, d) {
  const pot = r.parts.find((p) => p.key === 'pot'), ins = r.parts.find((p) => p.key === 'insert');
  const P = shown(pot), Q = shown(ins), H = d.form.height + (r.info.lift || 0), t = d.form.wall;
  const oy = r.info.wallY - t - 9, A = 720, bins = Math.ceil(H) + 1, inner = new Float64Array(A * bins).fill(Infinity), I = pot.index;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3;
    const zlo = Math.min(P[a + 2], P[b + 2], P[c + 2]), zhi = Math.max(P[a + 2], P[b + 2], P[c + 2]);
    for (let hb = Math.max(0, Math.ceil(zlo)); hb <= Math.min(bins - 1, Math.floor(zhi)); hb++) {
      const pts = [];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const z0 = P[u + 2], z1 = P[v + 2];
        if ((z0 - hb) * (z1 - hb) > 0 || z0 === z1) continue;
        const f = (hb - z0) / (z1 - z0);
        pts.push([P[u] + (P[v] - P[u]) * f, P[u + 1] + (P[v + 1] - P[u + 1]) * f - oy]);
      }
      if (pts.length < 2) continue;
      const [p, q] = pts, a0 = Math.atan2(p[1], p[0]), a1 = Math.atan2(q[1], q[0]);
      let lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      if (hi - lo > Math.PI) { const tmp = lo; lo = hi; hi = tmp + TAU; }
      for (let q2 = Math.ceil((lo / TAU) * A); q2 <= Math.floor((hi / TAU) * A); q2++) {
        const ang = (q2 / A) * TAU, dx = Math.cos(ang), dy = Math.sin(ang), ex = q[0] - p[0], ey = q[1] - p[1], det = dx * -ey + ex * dy;
        if (Math.abs(det) < 1e-12) continue;
        const sd = (p[0] * -ey + ex * p[1]) / det, w = (dx * p[1] - dy * p[0]) / det;
        if (sd > 0 && w >= -1e-9 && w <= 1 + 1e-9) { const id = (((q2 % A) + A) % A) * bins + hb; if (sd < inner[id]) inner[id] = sd; }
      }
    }
  }
  for (let a = 0; a < A; a++) for (let hb = bins - 2; hb >= 0; hb--) inner[a * bins + hb] = Math.min(inner[a * bins + hb], inner[a * bins + hb + 1]);
  let gap = Infinity, head = Infinity;
  const m = r.info.mount, yIn = r.info.wallY - t;
  for (let v = 0; v < Q.length; v += 3) {
    const z = Q[v + 2];
    // the screw heads stand 4 mm in from the pot's back: the insert keeps clear of them from its foot up to the holes
    for (const x of m.xs) if (Math.abs(Q[v] - x) < (m.screw ? 5.5 : m.head / 2) && z < H - m.drop + 6) head = Math.min(head, yIn - Q[v + 1]);
    if (z > H - 0.5) continue; // the flare above the rim rests on it
    const x = Q[v], y = Q[v + 1] - oy, af = ((Math.atan2(y, x) / TAU + 1) % 1) * A, a0 = Math.floor(af) % A, hb = clamp(Math.ceil(z), 0, bins - 1);
    const l0 = inner[a0 * bins + hb], l1 = inner[((a0 + 1) % A) * bins + hb];
    if (Number.isFinite(l0) && Number.isFinite(l1)) gap = Math.min(gap, l0 + (l1 - l0) * (af - Math.floor(af)) - Math.hypot(x, y));
  }
  return { gap, head };
}
const ins = [
  ['flat bottom', {}, {}], ['flat bottom, two keyholes', {}, { mountCount: 2 }], ['tapered, flared rim, two screw holes', { base: 0.5, top: 1.1 }, { mountCount: 2, mount: 'screw' }],
  ['narrow rim, tall reservoir', { top: 0.7, belly: 0.4 }, { reservoir: 30 }], ['round bottom', { bottom: 'round' }, {}], ['round bottom, deep back, two keyholes', { bottom: 'round' }, { back: 0.5, mountCount: 2 }],
  ['pointed bottom', { bottom: 'point' }, { reservoir: 50 }], ['pointed bottom, long slots low down', { bottom: 'point' }, { mountSlot: 25, mountDrop: 45 }], ['small', { height: 100, diameter: 110 }, {}],
];
for (const [name, form, extras] of ins) {
  const d = design({ object: 'wall', form, extras: { base: 'insert', gap: 1.5, drain: 8, ...extras }, surface: prism }), r = generate(d, 0.7);
  const pot = r.parts.find((p) => p.key === 'pot'), part = r.parts.find((p) => p.key === 'insert'), fit = insertFit(r, d), domed = d.form.bottom === 'round' || d.form.bottom === 'point';
  const ml = +(r.checks.find((c) => /^Self-watering/.test(c.text))?.text.match(/about (\d+) ml/) || [0, 0])[1];
  const open = openEdges(part) + openEdges(pot), bb = part.stats.bbox, potTall = pot.stats.bbox[5] - pot.stats.bbox[2];
  const ok = !open && fit.gap > 0.8 && fit.head > 5.5 && part.stats.overhang < 30 && Math.abs(bb[2]) < 1e-6 && ml >= 10 && !r.checks.some((c) => c.level === 'bad')
    // (the pot keeps its water: no drainage hole through a flat floor, or through a dome's tip)
    && (!domed || potTall > d.form.height - 0.6) && (d.form.bottom === 'round' || pot.stats.overhang < 60);
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} insert, ${name}: clearance ${fit.gap.toFixed(2)} mm all round, ${fit.head.toFixed(1)} mm behind each screw, ${Math.round(bb[5])} mm tall, reservoir about ${ml} ml, overhang ${part.stats.overhang.toFixed(0)} mm², ${open} open edges`);
  if (!ok) fail(`wall insert ${name}`);
}
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
