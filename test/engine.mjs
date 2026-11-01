// Engine checks, run with `npm test` (and on every push by the GitHub build):
//  1. every part of every collection piece is a closed solid, and relief textures print without supports
//  2. multicolour bands are each closed, and cutting them adds no overhang
//  3. the print mesh follows the intended relief closely (no saw-tooth on creases)
//  4. a batch of random designs all build closed
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

// ---------------------------------------------------------------- 1
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

// ---------------------------------------------------------------- 2
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

// ---------------------------------------------------------------- 3
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
]) {
  const a = accuracy(d);
  console.log(`  ${name.padEnd(9)} p99 ${a.p99.toFixed(3)}  max ${a.max.toFixed(3)}`);
  if (a.p99 > 0.06 || a.max > 0.15) fail(`${name}: relief strays from the intended surface (p99 ${a.p99.toFixed(3)}, max ${a.max.toFixed(3)} mm)`);
}

// ---------------------------------------------------------------- 4
console.log('4. random designs');
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const any = (arr) => arr[Math.floor(rand() * arr.length)];
const objects = ['planter', 'vase', 'bowl', 'box', 'cup', 'pendant', 'lamp'];
const patterns = ['lattice', 'prism', 'ogee', 'arches', 'voronoi', 'honeycomb', 'dots', 'perforated', 'ribs', 'chevron', 'reeds', 'waves', 'knit', 'weave', 'petals', 'quilt', 'facets', 'tiles',
  'hammered', 'carved', 'rings', 'dunes', 'bark', 'gouge', 'cubes', 'knurl', 'seigaiha', 'herringbone', 'smooth'];
for (let k = 0; k < 32; k++) {
  const obj = any(objects), pat = any(patterns);
  const d = design({
    object: obj,
    form: { height: 60 + rand() * 160, diameter: 70 + rand() * 160, base: 0.6 + rand() * 0.5, top: 0.7 + rand() * 0.5, section: any(['round', 'round', 'polygon', 'lobed']), twist: any([0, 0, 40]), rimEdge: any(['flat', 'round', 'bevel']) },
    surface: { pattern: pat, mode: obj === 'pendant' || obj === 'lamp' ? 'cut' : any(['relief', 'relief', 'cut']), count: 8 + Math.floor(rand() * 30), depth: 0.8 + rand() * 1.5, swirl: any([0, 0, 90, -150]) },
    extras: { base: obj === 'planter' ? any(['none', 'saucer', 'sleeve', 'insert']) : 'none', baseH: 40 + rand() * 50 },
  });
  const r = generate(d, 0.7);
  for (const p of r.parts) { const bad = openEdges(p); if (bad) fail(`random #${k} ${obj}/${pat} ${p.key}: ${bad} open edges`); }
}
console.log('  done');

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
