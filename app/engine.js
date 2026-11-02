// Weft geometry engine. Pure functions, no DOM: runs in a worker or on the main thread.
// Coordinates are millimetres, Z up, in print orientation (z = 0 is the build plate).
//
// Patterned walls are built on the unrolled surface of revolution: a 2D field f(u, v) is
// sampled on a grid, marching squares picks out the solid region of every cell, and that
// region is extruded through the wall. Shared edge crossings make the result watertight.

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- small math helpers
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fract = (x) => x - Math.floor(x);
function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}
function hash(a, b, seed) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function hermite(p0, p1, m0, m1, u) {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
}

// Relief cross-section: x = 0 on the crest, 1 at the foot.
const PROFILE = { round: 0, sharp: 1, soft: 2, flat: 3 };
function crest(x, kind) {
  if (x >= 1) return 0;
  if (x <= 0) return 1;
  switch (kind) {
    case 0: return Math.sqrt(1 - x * x);
    case 1: return 1 - x;
    case 2: return 0.5 + 0.5 * Math.cos(Math.PI * x);
    default: return smoothstep(1, 0.7, x);
  }
}

// ---------------------------------------------------------------- growable buffers
class Buf {
  constructor(Type, n = 1 << 16) { this.T = Type; this.a = new Type(n); this.n = 0; }
  grow(k) { if (this.n + k > this.a.length) { const b = new this.T(Math.max(this.a.length * 2, this.n + k)); b.set(this.a); this.a = b; } }
  push3(x, y, z) { this.grow(3); const a = this.a, n = this.n; a[n] = x; a[n + 1] = y; a[n + 2] = z; this.n = n + 3; }
  push1(x) { this.grow(1); this.a[this.n++] = x; }
  out() { return this.a.slice(0, this.n); }
}

class Mesh {
  constructor() { this.P = new Buf(Float32Array); this.I = new Buf(Uint32Array); this.W = new Buf(Int32Array); this.G = new Buf(Uint8Array); this.nv = 0; this.g = 0; }
  // weld: identity of the geometric point; render vertices sharing it are merged on export
  v(x, y, z, weld) { this.P.push3(x, y, z); this.W.push1(weld); return this.nv++; }
  tri(a, b, c) { if (a !== b && b !== c && a !== c) { this.I.push3(a, b, c); this.G.push1(this.g); } }
}

// ---------------------------------------------------------------- silhouettes
// r(z) from a handful of designer-facing parameters.
export function makeProfile(F) {
  const H = F.height, R = F.diameter / 2;
  const rb = R * F.base, rm = R, rt = R * F.top;
  const tb = clamp(F.belly, 0.08, 0.92);
  const f = clamp(F.fullness, -0.6, 1);
  const s0 = (rm - rb) / tb, s1 = (rt - rm) / (1 - tb);
  const m0 = s0 * (1 - f), m2 = s1 * (1 - f);
  const m1 = s0 * s1 <= 0 ? 0 : (2 * s0 * s1) / (s0 + s1);
  const lipH = Math.min(F.lipH || 0, H * 0.5), lip = F.lip || 0, inset = F.inset || 0;
  return (z) => {
    const t = clamp(z / H, 0, 1);
    let r;
    if (t <= tb) r = hermite(rb, rm, m0 * tb, m1 * tb, t / tb);
    else r = hermite(rm, rt, m1 * (1 - tb), m2 * (1 - tb), (t - tb) / (1 - tb));
    if (lip && lipH > 0 && z > H - lipH) { const q = (z - (H - lipH)) / lipH; r += lip * q * q; }
    if (inset > 0 && z < inset) r -= inset - z;
    return Math.max(r, 2);
  };
}

// Limit how far the silhouette may lean from vertical, so walls print without supports.
// Returns the eased profile and how far (mm) it had to move.
export function easeProfile(rFn, H, maxDeg = 46) {
  const n = 2400, dz = H / (n - 1), lim = Math.tan((maxDeg * Math.PI) / 180) * dz;
  const r = new Float64Array(n);
  let moved = 0;
  for (let k = 0; k < n; k++) {
    const want = rFn(k * dz);
    r[k] = k ? clamp(want, r[k - 1] - lim, r[k - 1] + lim) : want;
    moved = Math.max(moved, Math.abs(r[k] - want));
  }
  const fn = (z) => {
    const x = clamp(z / dz, 0, n - 1), k = Math.min(n - 2, Math.floor(x)), w = x - k;
    return r[k] + (r[k + 1] - r[k]) * w;
  };
  return { fn, moved };
}

// ---------------------------------------------------------------- cross-sections
// A closed, star-shaped outline with a maximum radius of 1, sampled at even arc length.
// Columns of the wall mesh are attached to arc-length positions, so patterns keep their scale.
const SECTION_SAMPLES = 2048;
const sectionCache = new Map();
export function makeSection(F = {}) {
  const kind = F.section === 'polygon' || F.section === 'lobed' ? F.section : 'round';
  const key = kind === 'polygon' ? `p${F.sides}|${F.corner}` : kind === 'lobed' ? `l${F.lobes}|${F.lobeDepth}|${F.lobeStyle}` : 'round';
  if (sectionCache.has(key)) return sectionCache.get(key);
  const pts = [];
  if (kind === 'polygon') {
    const n = clamp(Math.round(F.sides || 6), 3, 12);
    const c = clamp(F.corner ?? 0.2, 0.03, 0.85);
    const R0 = 1 - c;
    // start mid-face so pattern cells line up with the faces
    pts.push([R0 * Math.cos(Math.PI / n) + c, 0]);
    for (let k = 0; k < n; k++) {
      // corners at pi/n + 2pi k/n: a flat side faces +x and the outline is mirror-symmetric about x
      const a = Math.PI / n + (TAU * k) / n;
      const cx = R0 * Math.cos(a), cy = R0 * Math.sin(a);
      for (let q = 0; q <= 40; q++) {
        const b = a - Math.PI / n + ((TAU / n) * q) / 40;
        pts.push([cx + c * Math.cos(b), cy + c * Math.sin(b)]);
      }
    }
  } else if (kind === 'lobed') {
    const k = clamp(Math.round(F.lobes || 8), 2, 24), A = clamp(F.lobeDepth ?? 0.1, 0, 0.45);
    const scallop = F.lobeStyle === 'scallop';
    const e = 0.16, norm = Math.sqrt(1 + e * e) - e;
    for (let q = 0; q < 4096; q++) {
      const th = (TAU * q) / 4096;
      const w = scallop ? (Math.sqrt(Math.cos((k * th) / 2) ** 2 + e * e) - e) / norm : 0.5 + 0.5 * Math.cos(k * th);
      const rho = 1 - A * (1 - w);
      pts.push([rho * Math.cos(th), rho * Math.sin(th)]);
    }
  } else {
    for (let q = 0; q < 1024; q++) { const th = (TAU * q) / 1024; pts.push([Math.cos(th), Math.sin(th)]); }
  }
  const m = pts.length, cum = new Float64Array(m + 1);
  for (let q = 0; q < m; q++) { const a = pts[q], b = pts[(q + 1) % m]; cum[q + 1] = cum[q] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const L = cum[m], M = SECTION_SAMPLES;
  const x = new Float64Array(M), y = new Float64Array(M), nx = new Float64Array(M), ny = new Float64Array(M);
  let q = 0, minR = Infinity;
  for (let k = 0; k < M; k++) {
    const target = (L * k) / M;
    while (q < m - 1 && cum[q + 1] < target) q++;
    const a = pts[q], b = pts[(q + 1) % m], w = (target - cum[q]) / (cum[q + 1] - cum[q] || 1);
    x[k] = a[0] + (b[0] - a[0]) * w; y[k] = a[1] + (b[1] - a[1]) * w;
    minR = Math.min(minR, Math.hypot(x[k], y[k]));
  }
  for (let k = 0; k < M; k++) {
    const p = (k + M - 1) % M, n2 = (k + 1) % M;
    const tx = x[n2] - x[p], ty = y[n2] - y[p], tl = Math.hypot(tx, ty) || 1;
    nx[k] = ty / tl; ny[k] = -tx / tl;
  }
  const sec = { kind, round: kind === 'round', L, minR, x, y, nx, ny, M };
  sectionCache.set(key, sec);
  return sec;
}
// Point, normal and polar angle of the outline at arc-length fraction s.
function sectionColumns(sec, count) {
  const CX = new Float64Array(count), CY = new Float64Array(count), NX = new Float64Array(count), NY = new Float64Array(count), A = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const f = (i / count) * sec.M, k = Math.floor(f), k2 = (k + 1) % sec.M, w = f - k;
    CX[i] = sec.x[k] + (sec.x[k2] - sec.x[k]) * w;
    CY[i] = sec.y[k] + (sec.y[k2] - sec.y[k]) * w;
    const nx = sec.nx[k] + (sec.nx[k2] - sec.nx[k]) * w, ny = sec.ny[k] + (sec.ny[k2] - sec.ny[k]) * w, nl = Math.hypot(nx, ny) || 1;
    NX[i] = nx / nl; NY[i] = ny / nl;
    A[i] = Math.atan2(CY[i], CX[i]);
  }
  return { CX, CY, NX, NY, A };
}
const ROUND = () => makeSection({ section: 'round' });

// Resample the meridian at even arc-length steps.
// fineTop: { zone (mm of arc under the rim), count } adds dense rows there for shaped rim edges
// cutZ: heights that must land exactly on a row (colour band boundaries)
function sampleRows(rFn, H, step, zFrom = 0, fineTop = null, cutZ = null) {
  const nd = 1600, dz = (H - zFrom) / (nd - 1);
  const dr = new Float64Array(nd), dzA = new Float64Array(nd), dl = new Float64Array(nd);
  for (let k = 0; k < nd; k++) { dzA[k] = zFrom + k * dz; dr[k] = rFn(dzA[k]); }
  for (let k = 1; k < nd; k++) dl[k] = dl[k - 1] + Math.sqrt((dr[k] - dr[k - 1]) ** 2 + (dzA[k] - dzA[k - 1]) ** 2);
  const L = dl[nd - 1];
  const NV = Math.max(6, Math.ceil(L / step));
  const targets = [];
  if (fineTop && fineTop.zone > 0 && fineTop.zone < L * 0.5) {
    const lz = L - fineTop.zone;
    for (let j = 0; j <= NV; j++) { const t = (L * j) / NV; if (t < lz - step * 0.4) targets.push(t); }
    for (let q = 0; q <= fineTop.count; q++) targets.push(lz + (fineTop.zone * q) / fineTop.count);
  } else for (let j = 0; j <= NV; j++) targets.push((L * j) / NV);
  if (cutZ && cutZ.length) {
    const cutL = cutZ.map((zc) => {
      const x = clamp((zc - zFrom) / dz, 0, nd - 1), kk = Math.min(nd - 2, Math.floor(x));
      return dl[kk] + (dl[kk + 1] - dl[kk]) * (x - kk);
    });
    const keep = targets.filter((t) => cutL.every((c) => Math.abs(t - c) > step * 0.35));
    targets.length = 0;
    targets.push(...keep, ...cutL);
    targets.sort((a, b) => a - b);
  }
  const n = targets.length;
  const rows = { n, L, r: new Float64Array(n), z: new Float64Array(n), nr: new Float64Array(n), nz: new Float64Array(n), l: new Float64Array(n) };
  let k = 0;
  for (let j = 0; j < n; j++) {
    const target = targets[j];
    while (k < nd - 2 && dl[k + 1] < target) k++;
    const seg = dl[k + 1] - dl[k] || 1, w = clamp((target - dl[k]) / seg, 0, 1);
    rows.r[j] = dr[k] + (dr[k + 1] - dr[k]) * w;
    rows.z[j] = dzA[k] + (dzA[k + 1] - dzA[k]) * w;
    rows.l[j] = target;
    const ka = Math.max(0, k - 1), kb = Math.min(nd - 1, k + 2);
    const tr = dr[kb] - dr[ka], tz = dzA[kb] - dzA[ka], tl = Math.sqrt(tr * tr + tz * tz) || 1;
    rows.nr[j] = tz / tl; rows.nz[j] = -tr / tl;
  }
  rows.z[0] = zFrom; rows.z[n - 1] = H;
  return rows;
}

// ---------------------------------------------------------------- surface patterns
// Each pattern yields g (mm, > 0 = material, used for cut-through) and h (0..1 relief height).
export const PATTERN_IDS = ['lattice', 'prism', 'ogee', 'arches', 'voronoi', 'honeycomb', 'dots', 'perforated', 'wicker', 'ribs', 'chevron',
  'reeds', 'bark', 'waves', 'dunes', 'topo', 'rings', 'hammered', 'carved', 'gouge', 'cubes', 'knurl', 'seigaiha', 'herringbone',
  'knit', 'weave', 'petals', 'quilt', 'facets', 'tiles', 'blocks', 'spikes', 'shards', 'fins', 'hobnail', 'smooth'];
// Patterns that share another pattern's geometry and differ only in their defaults.
const ALIAS = { knurl: 'quilt', perforated: 'dots', spikes: 'quilt', shards: 'facets', fins: 'ribs', hobnail: 'dots' };
export const basePattern = (p) => ALIAS[p] || p;
// Openings are closed cells: any that would reach into a rim is filled, so rims meet whole cells.
const CELL_PATTERNS = new Set(['lattice', 'prism', 'ogee', 'arches', 'voronoi', 'honeycomb', 'dots', 'wicker']);

function makeVoronoi(S, N, rowsY, jitter) {
  const h = Math.sqrt(3) / 2;
  const k0 = -3, k1 = Math.ceil(rowsY / h) + 3, nk = k1 - k0 + 1;
  const sx = new Float64Array(nk * N), sy = new Float64Array(nk * N);
  const jit = clamp(jitter, 0, 1) * 0.9;
  for (let k = k0; k <= k1; k++) {
    const off = (k & 1) * 0.5;
    for (let m = 0; m < N; m++) {
      const id = (k - k0) * N + m;
      sx[id] = m + off + (hash(m, k, S.seed) - 0.5) * jit;
      sy[id] = k * h + (hash(m + 7919, k, S.seed) - 0.5) * jit * h;
    }
  }
  return { h, k0, k1, sx, sy };
}

const C_X = new Float64Array(32), C_Y = new Float64Array(32);
let V_SX = 0, V_SY = 0, V_ID = 0; // offset from the sample to the owning seed (cell units), and its id

// Physical distance from (X, Y) to the nearest edge of its Voronoi cell.
function evalVoronoi(V, N, X, Y, stretch, scale, kR) {
  const kc = Math.round(Y / V.h);
  let nc = 0;
  for (let k = kc - 1; k <= kc + 1; k++) {
    if (k < V.k0 || k > V.k1) continue;
    const base = (k - V.k0) * N, off = (k & 1) * 0.5, mc = Math.round(X - off);
    for (let m = mc - 2; m <= mc + 2; m++) {
      let mm = m % N; if (mm < 0) mm += N;
      const id = base + mm;
      let dx = V.sx[id] - X;
      if (dx > N * 0.5) dx -= N; else if (dx < -N * 0.5) dx += N;
      C_X[nc] = dx; C_Y[nc] = V.sy[id] - Y; nc++;
    }
  }
  let best = 0, bd = Infinity;
  for (let c = 0; c < nc; c++) { const d = C_X[c] * C_X[c] + C_Y[c] * C_Y[c]; if (d < bd) { bd = d; best = c; } }
  const bx = C_X[best], by = C_Y[best];
  V_SX = bx; V_SY = by;
  let D = Infinity;
  const s2 = stretch * stretch;
  for (let c = 0; c < nc; c++) {
    if (c === best) continue;
    const ex = C_X[c] - bx, ey = C_Y[c] - by, e2 = ex * ex + ey * ey;
    if (e2 < 1e-12) continue;
    const el = Math.sqrt(e2);
    const delta = (C_X[c] * C_X[c] + C_Y[c] * C_Y[c] - bd) / (2 * el);
    const phys = (scale * delta * stretch * el) / Math.sqrt(ey * ey + s2 * ex * ex);
    D = smin(D, phys, kR);
  }
  return D;
}
function nearestSeed(V, N, X, Y) {
  const kc = Math.round(Y / V.h);
  let bd = Infinity;
  for (let k = kc - 1; k <= kc + 1; k++) {
    if (k < V.k0 || k > V.k1) continue;
    const base = (k - V.k0) * N, off = (k & 1) * 0.5, mc = Math.round(X - off);
    for (let m = mc - 1; m <= mc + 1; m++) {
      let mm = m % N; if (mm < 0) mm += N;
      const id = base + mm;
      let dx = V.sx[id] - X;
      if (dx > N * 0.5) dx -= N; else if (dx < -N * 0.5) dx += N;
      const dy = V.sy[id] - Y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; V_SX = dx; V_SY = dy; V_ID = id; }
    }
  }
}

function interpTau(rows, tau, l) {
  let j = 0;
  while (j < rows.n - 2 && rows.l[j + 1] < l) j++;
  const w = clamp((l - rows.l[j]) / (rows.l[j + 1] - rows.l[j] || 1), 0, 1);
  return tau[j] + (tau[j + 1] - tau[j]) * w;
}

// Fill every opening that reaches into the rim zones (zone[id] = 1).
function fillRimHoles(F, NU, n, zone, val) {
  const seen = new Uint8Array(n * NU), list = new Int32Array(n * NU);
  for (let start = 0; start < n * NU; start++) {
    if (F[start] > 0 || seen[start]) continue;
    let len = 0, touch = false;
    list[len++] = start; seen[start] = 1;
    for (let q = 0; q < len; q++) {
      const id = list[q], j = (id / NU) | 0, i = id - j * NU;
      if (zone[id]) touch = true;
      const r = j * NU + (i + 1 === NU ? 0 : i + 1), l = j * NU + (i === 0 ? NU - 1 : i - 1);
      if (!seen[r] && F[r] <= 0) { seen[r] = 1; list[len++] = r; }
      if (!seen[l] && F[l] <= 0) { seen[l] = 1; list[len++] = l; }
      if (j > 0) { const d = id - NU; if (!seen[d] && F[d] <= 0) { seen[d] = 1; list[len++] = d; } }
      if (j < n - 1) { const u = id + NU; if (!seen[u] && F[u] <= 0) { seen[u] = 1; list[len++] = u; } }
    }
    if (touch) for (let q = 0; q < len; q++) F[list[q]] = val;
  }
}

// Builds the field arrays F (cut) and D (relief displacement) for a shell.
// opts.perim: outline perimeter / 2pi, so non-round sections keep the pattern scale.
function buildSurface(rows, NU, S, mode, opts) {
  const n = rows.n, L = rows.L;
  const perim = opts.perim || 1;
  const F = new Float32Array(n * NU);
  const pid = basePattern(S.pattern), look = S.pattern;
  const topL = opts.topL || null, edge = opts.edge || null;
  const Dsp = mode === 'cut' && !(S.bulge > 0) && pid !== 'wicker' && !edge ? null : new Float32Array(n * NU);
  // swirl: the whole pattern turns around the piece by this much from bottom to top (opts.unswirl
  // cancels a twist of the shape, in turns, so openings stay upright when the outline twists)
  const swirlTurns = (S.swirl || 0) / 360 + (opts.unswirl || 0), zTop = Math.max(1e-6, rows.z[rows.n - 1]);
  const Din = edge ? new Float32Array(n * NU) : null;
  const zoneMask = new Uint8Array(n * NU);
  const N = Math.max(1, Math.round(S.count));
  const prof = PROFILE[S.profile] ?? 0;
  const ang = (clamp(S.angle, 5, 85) * Math.PI) / 180;
  const cotA = 1 / Math.tan(ang), sinA = Math.sin(ang);
  const lean = (clamp(S.angle, -70, 70) * Math.PI) / 180;
  const tanB = Math.tan(lean), cosB = Math.cos(lean);
  const zig = (clamp(Math.abs(S.angle), 5, 65) * Math.PI) / 180;
  const stretch = clamp(S.stretch || 1, 0.3, 4);
  const fill = clamp(S.fill || 1, 0.1, 1);
  const kR = Math.max(0, S.round || 0);
  const bandB = opts.bandBottom, bandT = opts.bandTop;
  const depth = S.depth || 0;
  const follow = S.edge !== 'straight';
  const cellFill = mode === 'cut' && follow && CELL_PATTERNS.has(pid);

  // conformal coordinate along the meridian (one unit = one repeat around)
  const tau = new Float64Array(n);
  for (let j = 1; j < n; j++) {
    const dl = rows.l[j] - rows.l[j - 1];
    tau[j] = tau[j - 1] + (dl * 0.5 * (1 / (rows.r[j] * perim) + 1 / (rows.r[j - 1] * perim)) * N) / TAU;
  }
  const tauMax = tau[n - 1];
  // arches: whole rows that exactly fill the space between the rims
  const tauBot = interpTau(rows, tau, Math.max(0, bandB)), tauTop = interpTau(rows, tau, Math.max(0, L - Math.max(0, bandT)));
  const archSpan = Math.max(0.5, tauTop - tauBot);
  const archRows = Math.max(1, Math.round(archSpan / (1.6 * stretch)));
  const archH = archSpan / archRows;
  let V = null;
  if (pid === 'voronoi' || pid === 'honeycomb') V = makeVoronoi(S, N, tauMax / stretch, pid === 'honeycomb' ? 0 : S.jitter);
  if (pid === 'dots') V = makeVoronoi(S, N, tauMax / stretch, S.jitter || 0);
  if (pid === 'hammered' || pid === 'rings') V = makeVoronoi(S, N, tauMax / stretch, pid === 'rings' ? 0.95 : S.jitter ?? 0.85);
  if (pid === 'gouge') V = makeVoronoi(S, N, tauMax / stretch, S.jitter ?? 0.8);
  if (pid === 'carved') V = makeVoronoi(S, N, tauMax / stretch, 0);
  const wN = pid === 'weave' && (N & 1) ? N + 1 : N;

  const waveA = S.wave || 0, waveF = S.waveFreq || 1;
  const rowsN = Math.max(2, S.rows || 24);
  const knTh = 0.52, knA = 0.6, knB = 0.25 * fill * 1.1;
  const knC = Math.cos(knTh), knS = Math.sin(knTh);
  const rampLen = Math.max(1.5, depth * 1.3);
  const minRim = 1.2;
  // ogee: two mirrored sine families crossing into onion-domed cells
  const ogP = 2 * stretch, ogA = clamp(S.wave || 0.33, 0.27, 0.48);
  // chevron: zigzag amplitude from the leg angle
  const chP = 2 * stretch, chA = (Math.tan(zig) * chP) / 4, cosZ = Math.cos(zig);
  // topo: a few integer-wrapped waves summed into a smooth height field
  const topo = [];
  if (pid === 'topo') {
    const mult = [0.5, 0.85, 1.4, 2.2], wts = [1, 0.62, 0.38, 0.22];
    for (let q = 0; q < 4; q++) {
      const sgn = hash(q, 11, S.seed) < 0.5 ? -1 : 1;
      topo.push({ a: sgn * Math.max(1, Math.round(N * mult[q] * 0.25)), b: (hash(q, 23, S.seed) - 0.5) * N * mult[q] * 0.5, p: hash(q, 37, S.seed) * TAU, w: wts[q] });
    }
  }
  const topoLv = Math.max(0.5, rowsN / 10);
  const warp = [];
  if (pid === 'dunes' || pid === 'bark') {
    const mult = pid === 'dunes' ? [0.35, 0.7, 1.3] : [0.6, 1.1, 2.3], wts = [1, 0.55, 0.3];
    for (let q = 0; q < 3; q++) {
      const sgn = hash(q, 53, S.seed) < 0.5 ? -1 : 1;
      warp.push({ a: sgn * Math.max(1, Math.round(N * mult[q] * (pid === 'dunes' ? 0.12 : 0.04))), b: (hash(q, 61, S.seed) - 0.3) * mult[q] * (pid === 'dunes' ? 0.55 : 3.5), p: hash(q, 71, S.seed) * TAU, w: wts[q] });
    }
  }
  const leanT = Math.min(0.9, Math.tan(pid === 'chevron' ? zig : Math.abs(lean)));
  const archK = Math.max(1.6, 0.966 / Math.max(0.12, 1 - 0.966 * leanT) + 0.2);

  // across the base chamfer the relief runs straight down, so it never steepens the chamfer
  const freezeL = mode === 'relief' && bandB <= 0 ? opts.freezeL || 0 : 0;
  const tauFreeze = freezeL > 0 ? interpTau(rows, tau, freezeL) : 0;
  for (let j = 0; j < n; j++) {
    const r = rows.r[j] * perim, l = rows.l[j];
    const frozen = l < freezeL;
    const t = frozen ? tauFreeze : tau[j];
    const lt = (frozen ? freezeL : l) / L;
    const grad = 1 + (S.gradient || 0) * (lt - 0.5) * 2;
    const halfW = Math.max(0.3, ((S.width || 2) * grad) / 2);
    // band fields (positive inside the solid rims)
    const bandG = Math.max(bandB - l, l - (L - bandT));
    const rimG = Math.max(minRim - l, l - (L - minRim));
    // relief starts full depth at the bed, ramps in at 45° above a plain band
    const fadeLo = bandB > 0 ? smoothstep(bandB, bandB + rampLen, l) : 1;
    const fadeHi = bandT > 0 ? smoothstep(L - bandT, L - bandT - rampLen, l) : 1;
    const dep = depth * Math.max(0, grad) * fadeLo * fadeHi;
    const wavePhase = waveA * Math.sin(TAU * waveF * lt);
    const Y = t / stretch;
    const NN = pid === 'weave' ? wN : N;
    const Sc = (TAU * r) / NN;
    const bulgeFade = smoothstep(0, 2, -(cellFill ? rimG : bandG));
    const swirl = swirlTurns * NN * (rows.z[j] / zTop);

    for (let i = 0; i < NU; i++) {
      let sig = (NN * i) / NU + swirl;
      if (swirl) sig -= Math.floor(sig / NN) * NN;
      // the rim line can vary around the piece (wavy or slanted tops)
      const lTop = topL ? topL[i] : L, u = lTop - l;
      const bandGi = topL ? Math.max(bandB - l, l - (lTop - bandT)) : bandG;
      const rimGi = topL ? Math.max(minRim - l, l - (lTop - minRim)) : rimG;
      const fadeHiI = topL ? (bandT > 0 ? smoothstep(lTop - bandT, lTop - bandT - rampLen, l) : 1) : 1;
      let g = 1e3, h = 0, bandHere = cellFill ? rimGi : bandGi, lift = 0;
      switch (pid) {
        case 'lattice':
        case 'prism': {
          const a = sig + t * cotA, b = sig - t * cotA;
          const da = Math.abs(a - Math.round(a)) * Sc * sinA;
          const db = Math.abs(b - Math.round(b)) * Sc * sinA;
          let d = smin(da, db, kR);
          if (pid === 'prism') {
            // vertical mullions through the crossings split each diamond into two triangles
            const vs = S.alt ? sig : sig * 2;
            d = smin(d, Math.abs(vs - Math.round(vs)) * Sc * (S.alt ? 1 : 0.5), kR);
          }
          g = halfW - d;
          h = crest(d / Math.max(0.2, fill * Sc * sinA * (pid === 'prism' ? 0.3 : 0.5)), prof);
          break;
        }
        case 'ogee': {
          const ph = (TAU * t) / ogP, sn = Math.sin(ph);
          const slope = ((ogA * TAU) / ogP) * Math.cos(ph), corr = 1 / Math.sqrt(1 + slope * slope);
          const x1 = sig - ogA * sn, x2 = sig + ogA * sn - 0.5;
          const d = smin(Math.abs(x1 - Math.round(x1)) * Sc * corr, Math.abs(x2 - Math.round(x2)) * Sc * corr, kR);
          g = halfW - d;
          h = crest(d / Math.max(0.2, fill * Sc * 0.32), prof);
          break;
        }
        case 'arches': {
          // lancet windows: straight jambs under an acute pointed arch (arc radius 3.6x the half-span),
          // steep enough that even the apex prints without support
          const rowH = archH, tr = t - tauBot, k = Math.floor(tr / rowH);
          const off = S.alt && (k & 1) ? 0.5 : 0, xs = sig - off;
          const x = (xs - Math.floor(xs) - 0.5) * Sc, y = (tr - k * rowH) * Sc, Hm = rowH * Sc;
          const a2 = Math.max(0.4, Sc * 0.5 - halfW), y0 = halfW, yS = Math.max(y0, Hm - halfW - 2.49 * a2);
          const ax = Math.abs(x);
          let dh = smax(ax - a2, y0 - y, kR);
          if (y > yS) dh = Math.max(dh, Math.sqrt((ax + 2.6 * a2) ** 2 + (y - yS) ** 2) - 3.6 * a2);
          g = dh;
          h = crest(1 - clamp(-dh / Math.max(0.5, a2 * fill), 0, 1), prof);
          break;
        }
        case 'ribs':
        case 'chevron': {
          let s, d;
          if (pid === 'ribs') { s = sig + t * tanB + wavePhase; d = Math.abs(s - Math.round(s)) * Sc * cosB; }
          else { s = sig + chA * (1 - 4 * Math.abs(fract(t / chP + 0.25) - 0.5)); d = Math.abs(s - Math.round(s)) * Sc * cosZ; }
          const half = Sc * (pid === 'ribs' ? cosB : cosZ) * 0.5;
          g = halfW - d;
          h = crest(d / Math.max(0.2, fill * half), prof);
          if (follow && mode === 'cut') {
            // pointed slot ends: steep enough on the downhill side of a leaning slot to stay under 46°
            const arch = (Sc * 0.5 - Math.abs(s - Math.round(s)) * Sc) * archK;
            bandHere = Math.max(bandB - l + arch, l - (lTop - bandT) + arch);
          }
          break;
        }
        case 'reeds': {
          const m = Math.round(sig), d = Math.abs(sig - m) * Sc;
          let mm = m % N; if (mm < 0) mm += N;
          const nodeP = Math.max(6, L / Math.max(1, rowsN));
          const ph = l / nodeP + hash(mm, 17, S.seed);
          const node = smoothstep(1.8, 0, Math.abs(ph - Math.round(ph)) * nodeP);
          h = crest(d / Math.max(0.2, fill * Sc * 0.5), prof) * (0.84 + 0.16 * node);
          break;
        }
        case 'voronoi':
        case 'honeycomb': {
          const d = evalVoronoi(V, N, sig, Y, stretch, Sc, kR);
          g = halfW - d;
          h = crest(d / halfW, prof);
          if (mode === 'cut' && S.arch) {
            // 50° pointed roof over each opening so it prints without bridging
            const apex = (V_SY + 0.48) * stretch * Sc;
            g = Math.max(g, halfW - (apex - 1.2 * Math.abs(V_SX) * Sc));
          }
          break;
        }
        case 'dots': {
          nearestSeed(V, N, sig, Y);
          const dx = -V_SX * Sc, dy = -V_SY * stretch * Sc;
          const R = Math.max(0.6, fill * 0.45 * Sc * (1 - (S.vary || 0) * 0.7 * hash(V_ID, 3, S.seed)));
          const ax = Math.abs(dx), dist = Math.sqrt(dx * dx + dy * dy);
          let d = dist - R;
          if (mode === 'cut' && S.arch) {
            // teardrop: a 50° point on top of each round opening
            d = Math.min(d, Math.max(0.766 * ax + 0.643 * dy - R, R * 0.643 - dy));
          }
          g = d;
          h = crest(dist / R, prof);
          break;
        }
        case 'wicker': {
          const rowH = stretch, Yw = t / rowH;
          const mV = Math.round(sig), kH = Math.round(Yw);
          const dv = Math.abs(sig - mV) * Sc, dh = Math.abs(Yw - kH) * rowH * Sc;
          g = halfW - smin(dv, dh, kR);
          // over-under: each strand rises over one crossing and dips under the next
          const wV = 0.5 + 0.5 * Math.cos(Math.PI * (Yw + mV)), wH = 0.5 + 0.5 * Math.cos(Math.PI * (sig + kH + 1));
          const hv = dv < halfW ? wV * crest(dv / halfW, 2) : 0;
          const hh = dh < halfW ? wH * crest(dh / halfW, 2) : 0;
          lift = (hv > hh ? hv : hh) * Math.min(S.depth ?? 1, halfW * 0.6);
          h = hv > hh ? hv : hh;
          break;
        }
        case 'waves': {
          const s = rowsN * lt + waveA * Math.sin(TAU * sig);
          const d = Math.abs(s - Math.round(s));
          h = crest(d / (0.5 * fill), prof);
          break;
        }
        case 'topo': {
          const u = (TAU * sig) / N, v = (TAU * t) / N;
          let val = 0, gu = 0, gv = 0;
          for (const w of topo) {
            const arg = w.a * u + w.b * v + w.p, c = Math.cos(arg);
            val += w.w * Math.sin(arg); gu += w.w * w.a * c; gv += w.w * w.b * c;
          }
          const lv = val * topoLv;
          const dn = Math.abs(lv - Math.round(lv)) / topoLv;
          const dmm = (dn * r) / Math.max(0.25, Math.sqrt(gu * gu + gv * gv));
          h = crest(dmm / halfW, prof);
          break;
        }
        case 'hammered':
        case 'carved': {
          // a concave dish in every cell, meeting its neighbours in crisp ridges
          const D = evalVoronoi(V, N, sig, Y, stretch, Sc, 0);
          const F1 = Math.sqrt((V_SX * Sc) ** 2 + (V_SY * stretch * Sc) ** 2);
          const tt = clamp(F1 / Math.max(1e-6, F1 + D), 0, 1);
          h = prof === 1 ? tt : prof === 2 ? smoothstep(0, 1, tt) : Math.pow(tt, pid === 'carved' ? 1.45 : 1.7);
          break;
        }
        case 'rings': {
          // ripples spreading from scattered drops, merging where they meet
          const kc = Math.round(Y / V.h);
          let F = Infinity;
          for (let k = kc - 1; k <= kc + 1; k++) {
            if (k < V.k0 || k > V.k1) continue;
            const base = (k - V.k0) * N, off = (k & 1) * 0.5, mc = Math.round(sig - off);
            for (let m = mc - 2; m <= mc + 2; m++) {
              let mm = m % N; if (mm < 0) mm += N;
              let dx = V.sx[base + mm] - sig;
              if (dx > N * 0.5) dx -= N; else if (dx < -N * 0.5) dx += N;
              const dy = (V.sy[base + mm] - Y) * stretch;
              F = smin(F, Math.sqrt(dx * dx + dy * dy) * Sc, (S.width || 4) * 1.6);
            }
          }
          const lam = Math.max(1.5, S.width || 4);
          const xr = Math.abs(fract(F / lam) - 0.5) * 2;
          h = crest(1 - xr / Math.max(0.2, fill), prof);
          break;
        }
        case 'dunes': {
          // wind ripples: a long gentle rise facing down and a short steep fall facing up, so they print
          const u = (TAU * sig) / N, v = (TAU * t) / N;
          let w = 0;
          for (const q of warp) w += q.w * Math.sin(q.a * u + q.b * v + q.p);
          const ph = fract(rowsN * lt + waveA * w);
          const fall = 0.28;
          h = ph < 1 - fall ? smoothstep(0, 1, ph / (1 - fall)) : smoothstep(0, 1, (1 - ph) / fall);
          break;
        }
        case 'bark': {
          // vertical ridges that wander, split and change depth like tree bark
          const u = (TAU * sig) / N, v = (TAU * t) / N;
          let w = 0;
          for (const q of warp) w += q.w * Math.sin(q.a * u + q.b * v + q.p);
          const s = sig + waveA * w * 0.6;
          const m = Math.round(s), d = Math.abs(s - m) * Sc;
          let mm = m % N; if (mm < 0) mm += N;
          const seg = 0.55 + 0.45 * Math.sin(t * 0.9 + hash(mm, 5, S.seed) * TAU) * Math.sin(t * 0.37 + hash(mm, 9, S.seed) * TAU);
          h = crest(d / Math.max(0.2, fill * Sc * 0.5), prof) * clamp(seg, 0.2, 1);
          break;
        }
        case 'knit': {
          const m0 = Math.floor(sig), k0 = Math.floor(Y);
          for (let k = k0 - 1; k <= k0 + 1; k++) for (let m = m0 - 1; m <= m0 + 1; m++) {
            for (let side = 0; side < 2; side++) {
              const dx = sig - (m + (side ? 0.74 : 0.26)), dy = Y - (k + 0.5);
              const sx = side ? knS : -knS;
              const along = (dx * sx + dy * knC) / knA, across = (dx * knC - dy * sx) / knB;
              const q = along * along + across * across;
              if (q < 1) { const vv = crest(Math.sqrt(q), prof); if (vv > h) h = vv; }
            }
          }
          break;
        }
        case 'weave': {
          const kk = Math.floor(Y), mm = Math.floor(sig);
          const aH = (Math.abs(fract(Y) - 0.5) * 2) / fill, aV = (Math.abs(fract(sig) - 0.5) * 2) / fill;
          const wH = 0.5 + 0.5 * Math.cos(Math.PI * (sig - 0.5 + kk));
          const wV = 0.5 + 0.5 * Math.cos(Math.PI * (Y - 0.5 + mm + 1));
          const hH = crest(aH, prof) * (0.3 + 0.7 * wH), hV = crest(aV, prof) * (0.3 + 0.7 * wV);
          h = hH > hV ? hH : hV;
          break;
        }
        case 'petals': {
          // shingles with their free edge facing up, so every step faces the nozzle
          const rowH = 0.5, rho = 0.62;
          const kc = Math.floor(Y / rowH);
          // the scale on top and the one it overlaps, so the free edge can step down over a short ramp
          let top = -1, under = -1;
          for (let k = kc - 1; k <= kc + 2 && under < 0; k++) {
            const off = (k & 1) * 0.5, dy = Y - k * rowH;
            const mc = Math.round(sig - off);
            for (let m = mc - 1; m <= mc + 1; m++) {
              let dx = sig - (m + off);
              if (dx > N * 0.5) dx -= N; else if (dx < -N * 0.5) dx += N;
              const dd = Math.sqrt(dx * dx + dy * dy) / rho;
              if (dd < 1) { if (top < 0) top = dd; else { under = dd; break; } }
            }
          }
          const sh = (dd) => (dd < 0 ? 0 : Math.pow(dd, 1.6) * (prof === 2 ? smoothstep(1, 0.9, dd) : 1));
          // a cliff would alias into a saw-tooth on any grid; a 0.7 mm ramp prints as a crisp step
          const ramp = top < 0 ? 0 : smoothstep(1, 1 - 0.7 / (rho * Sc), top);
          h = sh(under) + (sh(top) - sh(under)) * ramp;
          break;
        }
        case 'cubes': {
          // tumbling blocks: each hexagon is three flat rhombi, a cube corner seen end-on. The corners of
          // all hexagons share heights (1/3 or 2/3), so the surface is continuous and needs no cliffs.
          const R = 1 / Math.sqrt(3), x = sig, y = Y;
          const qf = ((Math.sqrt(3) / 3) * x - y / 3) / R, rf = ((2 / 3) * y) / R;
          let qx = qf, qz = rf, qy = -qf - rf;
          let rx = Math.round(qx), ry = Math.round(qy), rz = Math.round(qz);
          const dx = Math.abs(rx - qx), dy = Math.abs(ry - qy), dz = Math.abs(rz - qz);
          if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
          const cx = R * Math.sqrt(3) * (rx + rz / 2), cy = R * 1.5 * rz;
          let lx = x - cx; const ly = y - cy;
          if (lx > N * 0.5) lx -= N; else if (lx < -N * 0.5) lx += N;
          const th = (Math.atan2(ly, lx) * 180) / Math.PI;
          const v = (deg) => [R * Math.cos((deg * Math.PI) / 180), R * Math.sin((deg * Math.PI) / 180)];
          const [s1, s2] = th >= 30 && th < 150 ? [v(30), v(150)] : th >= -90 && th < 30 ? [v(-90), v(30)] : [v(150), v(-90)];
          const det = s1[0] * s2[1] - s1[1] * s2[0];
          const a = (lx * s2[1] - ly * s2[0]) / det, b = (s1[0] * ly - s1[1] * lx) / det;
          h = clamp(1 - (a + b) * 0.5, 0, 1);
          break;
        }
        case 'gouge': {
          // overlapping chisel scoops in staggered rows, each tilted a little and deepest at its lower end
          const kc = Math.round(Y / V.h);
          let carve = 0;
          for (let k = kc - 2; k <= kc + 2; k++) {
            if (k < V.k0 || k > V.k1) continue;
            const base = (k - V.k0) * N, off = (k & 1) * 0.5, mc = Math.round(sig - off);
            for (let m = mc - 1; m <= mc + 1; m++) {
              let mm = m % N; if (mm < 0) mm += N;
              let dx = sig - V.sx[base + mm];
              if (dx > N * 0.5) dx -= N; else if (dx < -N * 0.5) dx += N;
              const dy = (Y - V.sy[base + mm]) * stretch;
              const tilt = (hash(mm, k * 7 + 3, S.seed) - 0.5) * 0.8, ct = Math.cos(tilt), st = Math.sin(tilt);
              const u = (dx * ct - dy * st) / 0.74, w = (dx * st + dy * ct) / (1.05 * Math.max(0.6, stretch * 0.9));
              const q = u * u + w * w;
              if (q < 1) { const c = (1 - q) * (0.8 - 0.2 * w); if (c > carve) carve = c; }
            }
          }
          h = 1 - Math.min(1, carve);
          break;
        }
        case 'seigaiha': {
          // Japanese waves: overlapping fans in rows, each with concentric ridges
          const rowH = 0.5, rho = 0.62, nR = Math.max(2, Math.round(S.rows || 4));
          const kc = Math.floor(Y / rowH);
          let top = -1, under = -1;
          for (let k = kc - 1; k <= kc + 2 && under < 0; k++) {
            const off = (k & 1) * 0.5, dy = Y - k * rowH;
            const mc = Math.round(sig - off);
            for (let m = mc - 1; m <= mc + 1; m++) {
              let dx = sig - (m + off);
              if (dx > N * 0.5) dx -= N; else if (dx < -N * 0.5) dx += N;
              const dd = Math.sqrt(dx * dx + dy * dy) / rho;
              if (dd < 1) { if (top < 0) top = dd; else { under = dd; break; } }
            }
          }
          const fan = (dd) => (dd < 0 ? 0 : 0.3 + 0.7 * crest(Math.abs(fract(dd * nR + 0.5) - 0.5) * 2 / Math.max(0.3, fill), prof));
          const ramp = top < 0 ? 0 : smoothstep(1, 1 - 0.7 / (rho * Sc), top);
          h = fan(under) + (fan(top) - fan(under)) * ramp;
          break;
        }
        case 'herringbone': {
          // parquet: 2:1 planks in a herringbone, turned 45° so the planks rise in chevrons
          const x = (sig + Y) * 2, y = (Y - sig) * 2;
          const ix = Math.floor(x), iy = Math.floor(y);
          const c4 = (((ix + iy) % 4) + 4) % 4;
          let x0, x1, y0, y1;
          if (c4 === 0) { x0 = ix; x1 = ix + 2; y0 = iy; y1 = iy + 1; } else if (c4 === 1) { x0 = ix - 1; x1 = ix + 1; y0 = iy; y1 = iy + 1; }
          else if (c4 === 2) { x0 = ix; x1 = ix + 1; y0 = iy; y1 = iy + 2; } else { x0 = ix; x1 = ix + 1; y0 = iy - 1; y1 = iy + 1; }
          const e = Math.min(x - x0, x1 - x, y - y0, y1 - y) * (Sc / (2 * Math.SQRT2));
          const plank = hash(((x0 % 4096) + 4096) % 4096, y0 * 3 + (c4 >> 1), S.seed);
          const bevel = Math.max(0.6, depth * 1.2);
          h = crest(1 - clamp((e - halfW * 0.5) / bevel, 0, 1), prof) * (0.86 + 0.14 * plank);
          break;
        }
        case 'quilt': {
          const a = sig + t * cotA, b = sig - t * cotA;
          const va = 1 - Math.abs(2 * fract(a) - 1), vb = 1 - Math.abs(2 * fract(b) - 1);
          h = crest((1 - (va < vb ? va : vb)) / fill, prof);
          break;
        }
        case 'facets': {
          // flat triangles on a triangular lattice with a height at every vertex: low-poly crystal
          const hY = 0.8660254, Yf = Y / hY, k = Math.floor(Yf), fy = Yf - k;
          const ok = (k & 1) * 0.5, delta = ((k + 1) & 1) * 0.5 - ok;
          const u = sig - ok - delta * fy, m = Math.floor(u), fu = u - m;
          const jit = clamp(S.jitter ?? 0.6, 0, 1);
          const hv = (kk, mm) => {
            let w = mm % N; if (w < 0) w += N;
            return clamp(0.5 + ((kk & 1) ? 0.35 : -0.35) * (1 - jit) + (hash(w, kk, S.seed) - 0.5) * jit, 0, 1);
          };
          const hA = hv(k, m), hB = hv(k, m + 1), hD = hv(k + 1, m), hC = hv(k + 1, m + 1);
          if (delta > 0) h = fu + fy < 1 ? hA + (hB - hA) * fu + (hD - hA) * fy : hC + (hD - hC) * (1 - fu) + (hB - hC) * (1 - fy);
          else h = fu > fy ? hA + (hB - hA) * fu + (hC - hB) * fy : hA + (hC - hD) * fu + (hD - hA) * fy;
          break;
        }
        case 'tiles': {
          // beveled tiles in brick bond; the 45° bevel keeps every lower edge printable
          const rowH = 0.5 * stretch, k = Math.floor(t / rowH);
          const off = S.alt !== false && (k & 1) ? 0.5 : 0, xs = sig - off;
          const ex = (0.5 - Math.abs(xs - Math.floor(xs) - 0.5)) * Sc, ey = (0.5 - Math.abs(t / rowH - k - 0.5)) * rowH * Sc;
          const e = smin(ex, ey, kR);
          const bevel = Math.max(0.8, depth * 1.6);
          h = crest(1 - clamp((e - halfW) / bevel, 0, 1), prof);
          break;
        }
        case 'blocks': {
          // staggered stone blocks standing out at different depths, some split in two. Their sides are
          // steep and their tops flat; the underside limiter turns each lower edge into a 45° chamfer.
          const rowH = 0.5 * stretch, k = Math.floor(t / rowH);
          const xs = sig - hash(k, 17, S.seed), m = Math.floor(xs), fx = xs - m;
          let mm = m % N; if (mm < 0) mm += N;
          const split = hash(mm, k * 5 + 1, S.seed) < 0.4, part = split ? (fx < 0.5 ? 0 : 1) : 2;
          const ex = (split ? 0.25 - Math.abs(fx - 0.25 - 0.5 * part) : 0.5 - Math.abs(fx - 0.5)) * Sc;
          const ey = (0.5 - Math.abs(t / rowH - k - 0.5)) * rowH * Sc;
          const e = smin(ex, ey, kR);
          const lvl = 1 - clamp(S.jitter ?? 0.7, 0, 1) * 0.75 * hash(mm * 3 + part, k * 7 + 2, S.seed);
          const bevel = Math.max(0.6, depth * 0.35);
          h = lvl * crest(1 - clamp((e - halfW * 0.5) / bevel, 0, 1), prof);
          break;
        }
        default: break;
      }
      if (S.invert && mode !== 'cut') h = 1 - h;
      const id = j * NU + i;
      if (l <= bandB || l >= lTop - bandT) zoneMask[id] = 1;
      let fv;
      if (mode === 'cut') {
        g = cellFill ? Math.max(g, bandHere) : smax(g, bandHere, kR);
        fv = g;
        if (Dsp) {
          const bulge = g > 0 ? Math.min(S.bulge || 0, halfW * 0.6) * crest(1 - clamp(g / halfW, 0, 1), 2) : 0;
          Dsp[id] = (bulge + (g > 0 ? lift : 0)) * bulgeFade * (topL ? smoothstep(0, 2, -rimGi) : 1);
        }
      } else {
        fv = 1;
        if (Dsp) Dsp[id] = mode === 'relief' ? dep * h * fadeHiI : 0;
      }
      // trim along the rim line; the edge profile rounds or bevels just under it
      if (topL) fv = Math.min(fv, u);
      if (edge) { Dsp[id] += edge.out(Math.max(0, u)); Din[id] = edge.inn(Math.max(0, u)); }
      F[id] = Math.abs(fv) < 1e-4 ? (fv < 0 ? -1e-4 : 1e-4) : fv;
    }
  }
  if (cellFill) fillRimHoles(F, NU, n, zoneMask, 0.5);
  return { F, D: mode === 'none' && !edge ? null : Dsp, Din };
}
function smax(a, b, k) { return -smin(-a, -b, k); }

// Everything that happens to the relief field between sampling and meshing.
// Creases are rounded to a small fillet first (a fixed size in mm, so the shape does not depend on the
// grid): flat triangles can follow a rounded crease, while a sharp one at an angle to the grid always
// turns into a staircase that the printer reproduces. Then undersides are held at 45°.
const RELIEF_FILLET = 0.45;
function processRelief(D, rows, NU, o) {
  const lim = () => limitUndersides(D, rows, NU, o.sec, o.twist, o.H, o.fillBelow);
  if (o.mode !== 'relief') { if (o.mode !== 'none') lim(); return; }
  smoothRelief(D, rows, NU, o.perim, o.fillet ?? RELIEF_FILLET);
  lim();
  // the edge where a fill meets the texture is a new crease: round it too, then re-check the undersides
  smoothRelief(D, rows, NU, o.perim, 0.3);
  lim();
}

// Gaussian smoothing with a radius in millimetres, on the uneven grid: columns are closer where the piece
// is narrow, and rows bunch up under the rim.
function smoothRelief(D, rows, NU, perim, sigma) {
  if (!(sigma > 0)) return;
  const n = rows.n, T = new Float32Array(D.length), wk = new Float64Array(64);
  // around: wraps
  for (let j = 0; j < n; j++) {
    const du = (TAU * Math.max(1e-3, rows.r[j]) * perim) / NU, su = sigma / du;
    if (su < 0.25) { for (let i = 0; i < NU; i++) T[j * NU + i] = D[j * NU + i]; continue; }
    const K = Math.min(30, Math.ceil(3 * su));
    let ws = 0;
    for (let k = -K; k <= K; k++) { wk[k + K] = Math.exp((-k * k) / (2 * su * su)); ws += wk[k + K]; }
    for (let i = 0; i < NU; i++) {
      let acc = 0;
      for (let k = -K; k <= K; k++) { let ii = i + k; if (ii < 0) ii += NU; else if (ii >= NU) ii -= NU; acc += wk[k + K] * D[j * NU + ii]; }
      T[j * NU + i] = acc / ws;
    }
  }
  // along the meridian: weights from the real row spacing
  const inv = 1 / (2 * sigma * sigma), reach = 3 * sigma;
  for (let j = 0; j < n; j++) {
    let j0 = j, j1 = j;
    while (j0 > 0 && rows.l[j] - rows.l[j0 - 1] <= reach) j0--;
    while (j1 < n - 1 && rows.l[j1 + 1] - rows.l[j] <= reach) j1++;
    if (j1 - j0 > 60) { const c = (j1 - j0 - 60) / 2; j0 += Math.ceil(c); j1 -= Math.ceil(c); }
    let ws = 0;
    for (let q = j0; q <= j1; q++) { const dl = rows.l[q] - rows.l[j]; wk[q - j0] = Math.exp(-dl * dl * inv); ws += wk[q - j0]; }
    for (let i = 0; i < NU; i++) {
      let acc = 0;
      for (let q = j0; q <= j1; q++) acc += wk[q - j0] * T[q * NU + i];
      D[j * NU + i] = acc / ws;
    }
  }
}

// Anti-aliasing for cliffs: where the relief drops faster than about 50° between grid points, a cliff
// would land on the grid as a staircase. There, and only there, the field takes a one-cell soften.
function softenCliffs(D, rows, NU, perim) {
  const n = rows.n, B = new Float32Array(D.length);
  for (let j = 0; j < n; j++) {
    const jm = j > 0 ? j - 1 : 0, jp = j + 1 < n ? j + 1 : n - 1;
    for (let i = 0; i < NU; i++) {
      const im = i > 0 ? i - 1 : NU - 1, ip = i + 1 < NU ? i + 1 : 0;
      const row = (jj) => D[jj * NU + im] + 2 * D[jj * NU + i] + D[jj * NU + ip];
      B[j * NU + i] = (row(jm) + 2 * row(j) + row(jp)) / 16;
    }
  }
  for (let j = 0; j < n; j++) {
    const jm = j > 0 ? j - 1 : 0, jp = j + 1 < n ? j + 1 : n - 1;
    const du = (TAU * rows.r[j] * perim) / NU, dv = Math.max(1e-3, (rows.l[jp] - rows.l[jm]) / Math.max(1, jp - jm));
    for (let i = 0; i < NU; i++) {
      const im = i > 0 ? i - 1 : NU - 1, ip = i + 1 < NU ? i + 1 : 0, id = j * NU + i;
      const s = Math.max(Math.abs(D[j * NU + ip] - D[j * NU + im]) / (2 * du), Math.abs(D[jp * NU + i] - D[jm * NU + i]) / ((jp - jm || 1) * dv));
      if (s > 1.2) { const w = Math.min(1, (s - 1.2) / 0.8); D[id] += (B[id] - D[id]) * w; }
    }
  }
}

// Printability: the relief moves the wall sideways, so a surface faces down wherever the wall plus relief
// grows outward faster than it climbs. Walking down each column, any underside steeper than `deg` is
// filled out to that slope, like a chamfer under a ledge. The tops and faces of the texture stay as drawn.
// A twisted outline also swings sideways from row to row, which counts as growing outward on the flanks.
// Up to `fillBelow` (the base chamfer) it may also fill where the bare wall alone is too steep; higher up
// it only stops the relief from making a wall worse, so a long flare never piles material up.
function limitUndersides(D, rows, NU, sec, twist = 0, H = 0, fillBelow = 0, deg = 45.5) {
  const T = Math.tan((deg * Math.PI) / 180), n = rows.n;
  const { CX, CY, NX, NY } = sectionColumns(sec, NU);
  const Htot = H || rows.z[n - 1] || 1;
  const dphi = new Float64Array(n);
  for (let j = 0; j + 1 < n; j++) dphi[j] = (twist * (rows.z[j] - rows.z[j + 1])) / Htot;
  // A twist also slides each row sideways over the one below: the point straight under column i sits a
  // fraction of a column further round, so a deep bump's flank leans out by its own side slope. The
  // check compares with that point and fills the two columns around it.
  const colsPerRad = NU / (sec.L || TAU);
  for (let j = n - 2; j >= 0; j--) {
    const c = Math.cos(dphi[j]), sn = Math.sin(dphi[j]);
    for (let i = 0; i < NU; i++) {
      // outward travel of the bare wall between the rows, measured along the upper row's normal
      const o0 = rows.off ? rows.off[j] : 0, o1 = rows.off ? rows.off[j + 1] : 0;
      const vx = rows.r[j] * CX[i] + o0 * NX[i], vy = rows.r[j] * CY[i] + o0 * NY[i];
      const below = (vx * c - vy * sn) * NX[i] + (vx * sn + vy * c) * NY[i];
      const kN = CX[i] * NX[i] + CY[i] * NY[i];
      const above = rows.r[j + 1] * kN + o1;
      const dR = above - below;
      const raw = (rows.z[j + 1] - rows.z[j]) * T - dR;
      const allow = rows.l[j + 1] <= fillBelow ? raw : Math.max(0, raw);
      const need = D[(j + 1) * NU + i] - allow;
      if (!twist) { const a = j * NU + i; if (D[a] < need) D[a] = need; continue; }
      const s = i - dphi[j] * kN * colsPerRad, f = Math.floor(s), w = s - f;
      const i0 = ((f % NU) + NU) % NU, i1 = i0 + 1 === NU ? 0 : i0 + 1;
      fillBetween(D, j * NU + i0, j * NU + i1, w, need);
    }
  }
}
// Raise D[a0], D[a1] as little as possible so that their blend (weight w on a1) reaches `need`, never
// lifting either above `need` (a column that is already higher is left alone, so fills cannot snowball).
function fillBetween(D, a0, a1, w, need) {
  let x0 = D[a0], x1 = D[a1];
  const cur = x0 * (1 - w) + x1 * w;
  if (!(cur < need)) return;
  const u0 = x0 < need ? 1 - w : 0, u1 = x1 < need ? w : 0;
  const k = (need - cur) / (u0 * u0 + u1 * u1);
  if (u0) x0 = Math.min(need, x0 + k * u0);
  if (u1) x1 = Math.min(need, x1 + k * u1);
  for (let pass = 0; pass < 2; pass++) {
    const rest = need - (x0 * (1 - w) + x1 * w);
    if (rest <= 1e-9) break;
    if (x0 < need && w < 1) x0 = Math.min(need, x0 + rest / (1 - w));
    else if (x1 < need && w > 0) x1 = Math.min(need, x1 + rest / w);
  }
  D[a0] = x0; D[a1] = x1;
}

// ---------------------------------------------------------------- shell mesher
// rows: sampled meridian; F: field (> 0 solid); D: outward displacement (or null)
// floor: { type: 'solid' | 'hole' | 'open', thick, holeR }; top: 'rim' | 'cap'
// opts: { sec, twist (radians over the full height), H, zShift }
function buildShell(rows, NU, F, D, t, floor, top, opts = {}) {
  const NR = rows.n;
  const NC = NU * NR, NHE = NU * NR, NVE = NU * (NR - 1);
  const K = NC + NHE + NVE;
  const sec = opts.sec || ROUND();
  const { CX, CY, NX, NY, A: ANG } = sectionColumns(sec, NU);
  const zShift = opts.zShift ? opts.zShift(NU, ANG) : null;
  const Din = opts.Din || null;

  // each row: outline scale r, outward offset off, twist angle; inner wall sits t further in
  const off = new Float64Array(NR), offIn = new Float64Array(NR), zIn = new Float64Array(NR), zw = new Float64Array(NR);
  const cphi = new Float64Array(NR), sphi = new Float64Array(NR);
  const Htot = opts.H || rows.z[NR - 1] || 1;
  for (let j = 0; j < NR; j++) {
    off[j] = rows.off ? rows.off[j] : 0;
    offIn[j] = off[j] - t * rows.nr[j];
    zIn[j] = rows.z[j] - t * rows.nz[j];
    // the tilt shear starts above shiftFrom, so chamfers near the plate keep their angle
    const s0 = opts.shiftTop ? Math.max(0, rows.L - opts.shiftTop) : opts.shiftFrom || 0;
    zw[j] = clamp((rows.l[j] - s0) / (rows.L - s0), 0, 1);
    const phi = ((opts.twist || 0) * rows.z[j]) / Htot;
    cphi[j] = Math.cos(phi); sphi[j] = Math.sin(phi);
  }
  if (floor.type !== 'open') {
    const need = floor.thick + 0.8;
    let jb = 1;
    while (jb < NR - 1 && (rows.l[jb] < floor.band || zIn[jb] < need)) jb++;
    for (let j = 0; j < jb; j++) zIn[j] = floor.thick + (zIn[jb] - floor.thick) * (rows.l[j] / rows.l[jb]);
  } else if (!floor.cut) {
    zIn[0] = rows.z[0];
    zIn[NR - 1] = rows.z[NR - 1];
  }
  if (floor.type !== 'open') {
    // where the base chamfer turns upright, the inner offset folds back inward a little; near the floor
    // that fold would be a small ceiling, so the inner wall never steps in going up there
    // (a shaped outline grows by a different amount at corners than on flats: take the tightest column)
    let kLo = Infinity, kHi = 0;
    for (let i = 0; i < NU; i++) { const k = CX[i] * NX[i] + CY[i] * NY[i]; kLo = Math.min(kLo, k); kHi = Math.max(kHi, k); }
    const zone = floor.thick + (floor.band || 0) + 4;
    for (let j = NR - 2; j >= 0; j--) {
      if (rows.l[j] > zone) continue;
      const dr = rows.r[j + 1] - rows.r[j];
      offIn[j] = Math.min(offIn[j], offIn[j + 1] + dr * (dr >= 0 ? kLo : kHi));
    }
    // ...and it must climb at least as fast as it widens, or that ring would print in the air over the floor
    for (let j = 1; j < NR; j++) {
      const dr = rows.r[j] - rows.r[j - 1];
      const dRin = dr * (dr >= 0 ? kHi : kLo) + offIn[j] - offIn[j - 1];
      zIn[j] = Math.max(zIn[j], zIn[j - 1] + Math.max(dRin * 1.1, 1e-3));
    }
  }
  if (top === 'rim' || top === 'cap') zIn[NR - 1] = rows.z[NR - 1];
  // keep the inner wall monotone so a flared rim or floor never folds over itself
  for (let j = NR - 2; j >= 0; j--) if (zIn[j] > zIn[j + 1] - 1e-3) zIn[j] = zIn[j + 1] - 1e-3;
  for (let j = 1; j < NR; j++) if (zIn[j] < zIn[j - 1] + 1e-3) zIn[j] = zIn[j - 1] + 1e-3;

  const mesh = new Mesh();
  const mapO = new Int32Array(K).fill(-1), mapI = new Int32Array(K).fill(-1), mapW = new Int32Array(2 * K).fill(-1);
  let px = 0, py = 0, pz = 0;

  function corner(i, j, inner) {
    let o, zz;
    if (inner) { o = offIn[j] + (Din ? Din[j * NU + i] : 0); zz = zIn[j]; }
    else { o = off[j] + (D ? D[j * NU + i] : 0); zz = rows.z[j]; }
    if (zShift) zz += zShift[i] * zw[j];
    const sc = rows.r[j];
    const x0 = sc * CX[i] + o * NX[i], y0 = sc * CY[i] + o * NY[i];
    px = x0 * cphi[j] - y0 * sphi[j]; py = x0 * sphi[j] + y0 * cphi[j]; pz = zz;
  }
  function point(key, inner) {
    if (key < NC) { const j = (key / NU) | 0; corner(key - j * NU, j, inner); return; }
    let i, j, i2, j2, fa, fb;
    if (key < NC + NHE) { const k = key - NC; j = (k / NU) | 0; i = k - j * NU; i2 = (i + 1) % NU; j2 = j; }
    else { const k = key - NC - NHE; j = (k / NU) | 0; i = k - j * NU; i2 = i; j2 = j + 1; }
    fa = F[j * NU + i]; fb = F[j2 * NU + i2];
    const w = fa / (fa - fb);
    corner(i, j, inner); const ax = px, ay = py, az = pz;
    corner(i2, j2, inner);
    px = ax + (px - ax) * w; py = ay + (py - ay) * w; pz = az + (pz - az) * w;
  }
  const vO = (key) => { let v = mapO[key]; if (v < 0) { point(key, false); v = mapO[key] = mesh.v(px, py, pz, key); } return v; };
  const vI = (key) => { let v = mapI[key]; if (v < 0) { point(key, true); v = mapI[key] = mesh.v(px, py, pz, key + K); } return v; };
  const vW = (key, inner) => {
    const s = inner ? key + K : key;
    let v = mapW[s]; if (v < 0) { point(key, inner); v = mapW[s] = mesh.v(px, py, pz, s); } return v;
  };
  const wall = (p, q) => {
    const po = vW(p, false), pi = vW(p, true), qo = vW(q, false), qi = vW(q, true);
    mesh.tri(po, pi, qi); mesh.tri(po, qi, qo);
  };

  const hasInner = top !== 'cap';
  // A solid wall (no openings) has a plain inner surface: it gets a coarser grid of its own, stitched to
  // full-resolution rows at the floor, the rim and anywhere the inner edge is shaped.
  const kIn = opts.innerStep || 1;
  let innerCoarse = hasInner && kIn > 1 && NU % kIn === 0 && NR > 2 * kIn;
  if (innerCoarse) for (let q = 0; q < NC; q++) if (!(F[q] > 0)) { innerCoarse = false; break; }
  const pk = new Int32Array(8), pc = new Float32Array(8), pX = new Uint8Array(8);
  const poly = (start, len) => {
    for (let k = 1; k < len - 1; k++) {
      const a = pk[start], b = pk[start + k], c = pk[start + k + 1];
      mesh.tri(vO(a), vO(b), vO(c));
      if (hasInner && !innerCoarse) mesh.tri(vI(a), vI(c), vI(b));
    }
    for (let k = 0; k < len; k++) {
      const a = start + k, b = start + ((k + 1) % len);
      if (pX[a] && pX[b]) { mesh.g = 1; wall(pk[a], pk[b]); mesh.g = 0; continue; }
      const ca = pc[a], cb = pc[b];
      // group 3: the face where one colour band sits on the next, which never needs support
      if (rowJ === 0 && floor.type === 'open' && inRange(ca, 0, 1) && inRange(cb, 0, 1) && cb > ca) { mesh.g = floor.cut ? 3 : 0; wall(pk[a], pk[b]); mesh.g = 0; }
      if (rowJ === NR - 2 && (top === 'rim' || top === 'cut') && inRange(ca, 2, 3) && inRange(cb, 2, 3) && cb > ca) { mesh.g = top === 'cut' ? 3 : 0; wall(pk[a], pk[b]); mesh.g = 0; }
    }
  };
  const inRange = (c, a, b) => c >= a && c <= b;
  let rowJ = 0;

  for (let j = 0; j < NR - 1; j++) {
    rowJ = j;
    for (let i = 0; i < NU; i++) {
      const i1 = (i + 1) % NU;
      const ka = j * NU + i, kb = j * NU + i1, kc = (j + 1) * NU + i1, kd = (j + 1) * NU + i;
      const fa = F[ka], fb = F[kb], fc = F[kc], fd = F[kd];
      const sa = fa > 0, sb = fb > 0, sc = fc > 0, sd = fd > 0;
      if (!sa && !sb && !sc && !sd) continue;
      const eab = NC + j * NU + i, ebc = NC + NHE + j * NU + i1, ecd = NC + (j + 1) * NU + i, eda = NC + NHE + j * NU + i;
      let n = 0;
      const add = (key, code, cross) => { pk[n] = key; pc[n] = code; pX[n] = cross; n++; };
      const saddle = sa === sc && sb === sd && sa !== sb;
      if (saddle && (fa + fb + fc + fd) / 4 <= 0) {
        // separated: two triangles around the solid corners
        if (sa) {
          add(ka, 0, 0); add(eab, 0.5, 1); add(eda, 3.5, 1);
          poly(0, 3); n = 0;
          add(kc, 2, 0); add(ecd, 2.5, 1); add(ebc, 1.5, 1);
          poly(0, 3);
        } else {
          add(kb, 1, 0); add(ebc, 1.5, 1); add(eab, 0.5, 1);
          poly(0, 3); n = 0;
          add(kd, 3, 0); add(eda, 3.5, 1); add(ecd, 2.5, 1);
          poly(0, 3);
        }
        continue;
      }
      if (sa) add(ka, 0, 0);
      if (sa !== sb) add(eab, 0.5, 1);
      if (sb) add(kb, 1, 0);
      if (sb !== sc) add(ebc, 1.5, 1);
      if (sc) add(kc, 2, 0);
      if (sc !== sd) add(ecd, 2.5, 1);
      if (sd) add(kd, 3, 0);
      if (sd !== sa) add(eda, 3.5, 1);
      if (n === 4 && D && sa && sb && sc && sd) {
        // split the cell along the crease: the diagonal in whose direction the relief bends least.
        // A fixed diagonal would saw-tooth every ridge that runs the other way.
        const jm = j > 0 ? j - 1 : 0, jp = j + 2 < NR ? j + 2 : NR - 1, im = (i - 1 + NU) % NU, ip = (i + 2) % NU;
        const Da = D[ka], Db = D[kb], Dc = D[kc], Dd = D[kd];
        const ac = Math.abs(D[jm * NU + im] - 2 * Da + Dc) + Math.abs(Da - 2 * Dc + D[jp * NU + ip]);
        const bd = Math.abs(D[jm * NU + ip] - 2 * Db + Dd) + Math.abs(Db - 2 * Dd + D[jp * NU + im]);
        if (bd < ac) { pk[0] = kb; pk[1] = kc; pk[2] = kd; pk[3] = ka; pc[0] = 1; pc[1] = 2; pc[2] = 3; pc[3] = 0; }
      }
      poly(0, n);
    }
  }

  if (innerCoarse) {
    const full = new Uint8Array(NR), keep = [];
    const botZone = floor.type !== 'open' ? floor.thick + (floor.band || 0) + 6 : 0, L = rows.l[NR - 1];
    for (let j = 0; j < NR; j++) {
      let shaped = false;
      if (Din) for (let i = 0; i < NU && !shaped; i += 4) if (Din[j * NU + i] !== 0) shaped = true;
      full[j] = j === 0 || j === NR - 1 || rows.l[j] < botZone || rows.l[j] > L - 3 || shaped ? 1 : 0;
      if (full[j] || j % kIn === 0) keep.push(j);
    }
    const key = (i, j) => j * NU + (i % NU);
    // inner winding: quad a(i,j) b(i2,j) c(i2,j2) d(i,j2) -> (a,c,b) (a,d,c)
    for (let q = 0; q + 1 < keep.length; q++) {
      const ja = keep[q], jb = keep[q + 1], fa = full[ja], fb = full[jb];
      if (fa === fb) {
        const st = fa ? 1 : kIn;
        for (let i = 0; i < NU; i += st) {
          const a = vI(key(i, ja)), b = vI(key(i + st, ja)), c = vI(key(i + st, jb)), d = vI(key(i, jb));
          mesh.tri(a, c, b); mesh.tri(a, d, c);
        }
        continue;
      }
      // a full row meets a coarse row: fan each coarse span over its fine edges
      for (let i = 0; i < NU; i += kIn) {
        const half = i + kIn / 2;
        if (fa) {
          // fine below (ja), coarse above (jb)
          const c0 = vI(key(i, jb)), c1 = vI(key(i + kIn, jb));
          for (let f = i; f < i + kIn; f++) mesh.tri(vI(key(f, ja)), f < half ? c0 : c1, vI(key(f + 1, ja)));
          mesh.tri(vI(key(half, ja)), c0, c1);
        } else {
          // coarse below (ja), fine above (jb)
          const c0 = vI(key(i, ja)), c1 = vI(key(i + kIn, ja));
          for (let f = i; f < i + kIn; f++) mesh.tri(f < half ? c0 : c1, vI(key(f, jb)), vI(key(f + 1, jb)));
          mesh.tri(c0, vI(key(half, jb)), c1);
        }
      }
    }
  }

  // floor / caps
  let extra = 2 * K;
  const capV = (x, y, z) => mesh.v(x, y, z, extra++);
  const ringO = [], ringI = [];
  for (let i = 0; i < NU; i++) {
    point(i, false); ringO.push(mesh.v(px, py, pz, i));
    if (floor.type !== 'open' && hasInner) { point(i, true); ringI.push(mesh.v(px, py, pz, i + K)); }
  }
  const z0 = rows.z[0];
  if (floor.type === 'solid') {
    const cb = capV(0, 0, z0);
    for (let i = 0; i < NU; i++) mesh.tri(cb, ringO[(i + 1) % NU], ringO[i]);
    if (hasInner) {
      const ct = capV(0, 0, zIn[0]);
      for (let i = 0; i < NU; i++) mesh.tri(ct, ringI[i], ringI[(i + 1) % NU]);
    }
  } else if (floor.type === 'hole' || floor.type === 'groove') {
    const hb = [], ht = [], wb = [], wt = [];
    for (let i = 0; i < NU; i++) {
      const a = ANG[i] + Math.atan2(sphi[0], cphi[0]);
      const x = floor.holeR * Math.cos(a), y = floor.holeR * Math.sin(a);
      const idB = extra++, idT = extra++;
      hb.push(mesh.v(x, y, z0, idB)); ht.push(mesh.v(x, y, zIn[0], idT));
      wb.push(mesh.v(x, y, z0, idB)); wt.push(mesh.v(x, y, zIn[0], idT));
    }
    // the underside, from the outer edge in to the hole: flat, or with a groove that locates a shade
    const strip = (A, B) => { for (let i = 0; i < NU; i++) { const i1 = (i + 1) % NU; mesh.tri(B[i], B[i1], A[i1]); mesh.tri(B[i], A[i1], A[i]); } };
    if (floor.type === 'groove') {
      const G = floor.groove;
      const ring = (o, z) => {
        const r = [];
        for (let i = 0; i < NU; i++) {
          const x0 = G.sc * CX[i] + o * NX[i], y0 = G.sc * CY[i] + o * NY[i];
          r.push(mesh.v(x0 * cphi[0] - y0 * sphi[0], x0 * sphi[0] + y0 * cphi[0], z, extra++));
        }
        return r;
      };
      const g0 = ring(G.oOut, z0), g1 = ring(G.oOut, z0 + G.depth), g2 = ring(G.oIn, z0 + G.depth), g3 = ring(G.oIn, z0);
      strip(ringO, g0); strip(g0, g1);
      mesh.g = 1; strip(g1, g2); mesh.g = 0; // the groove's roof is a short bridge
      strip(g2, g3); strip(g3, hb);
    } else strip(ringO, hb);
    for (let i = 0; i < NU; i++) {
      const i1 = (i + 1) % NU;
      mesh.tri(ht[i], ringI[i], ringI[i1]); mesh.tri(ht[i], ringI[i1], ht[i1]);
      mesh.tri(wb[i], wt[i1], wb[i1]); mesh.tri(wb[i], wt[i], wt[i1]);
    }
  }
  if (top === 'cap') {
    const jt = NR - 1, ring = [];
    for (let i = 0; i < NU; i++) { point(jt * NU + i, false); ring.push(mesh.v(px, py, pz, jt * NU + i)); }
    let zc = 0; for (let i = 0; i < NU; i++) zc += mesh.P.a[ring[i] * 3 + 2]; zc /= NU;
    const ct = capV(0, 0, zc);
    for (let i = 0; i < NU; i++) mesh.tri(ct, ring[i], ring[(i + 1) % NU]);
  }
  return mesh;
}

// Concatenate meshes as separate bodies; returns the triangle range of each.
function mergeMeshes(list) {
  const out = new Mesh();
  const ranges = [];
  let vBase = 0, wBase = 0;
  for (const m of list) {
    const n = m.nv, W = m.W.a;
    let wMax = 0;
    for (let k = 0; k < n; k++) if (W[k] > wMax) wMax = W[k];
    const remap = new Int32Array(wMax + 1).fill(-1);
    let wc = 0;
    out.P.grow(n * 3); out.P.a.set(m.P.a.subarray(0, n * 3), out.P.n); out.P.n += n * 3;
    out.W.grow(n);
    for (let k = 0; k < n; k++) { let id = remap[W[k]]; if (id < 0) id = remap[W[k]] = wc++; out.W.a[out.W.n++] = wBase + id; }
    const t0 = out.I.n / 3;
    out.I.grow(m.I.n);
    for (let k = 0; k < m.I.n; k++) out.I.a[out.I.n++] = m.I.a[k] + vBase;
    out.G.grow(m.G.n); out.G.a.set(m.G.a.subarray(0, m.G.n), out.G.n); out.G.n += m.G.n;
    ranges.push({ first: t0, count: m.I.n / 3 });
    vBase += n; wBase += wc; out.nv += n;
  }
  return { mesh: out, ranges };
}

// ---------------------------------------------------------------- swept solids (lids, knobs, trays)
// poly: closed loop of [r, z, offset = 0, round = false]. Each point becomes the outline scaled by r
// and pushed out by offset (or a circle of radius r + offset when round). Points on the axis become poles.
function sweep(poly, sec, segs, rot = 0) {
  const mesh = new Mesh();
  const n = poly.length;
  const cols = sectionColumns(sec, segs);
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const eff = poly.map(([r, z, o = 0]) => [r + o, z]);
  // sharp corners get their own vertex columns per edge
  const sharp = eff.map((p, k) => {
    const a = eff[(k - 1 + n) % n], b = eff[(k + 1) % n];
    const ux = p[0] - a[0], uz = p[1] - a[1], vx = b[0] - p[0], vz = b[1] - p[1];
    const c = (ux * vx + uz * vz) / (Math.hypot(ux, uz) * Math.hypot(vx, vz) || 1);
    return c < Math.cos((28 * Math.PI) / 180);
  });
  const shared = new Map();
  const column = (k, edge) => {
    const key = sharp[k] ? `${k}:${edge}` : `${k}`;
    if (shared.has(key)) return shared.get(key);
    const [r, z, o = 0, round = false] = poly[k];
    const col = [];
    if ((round || sec.round) ? r + o < 1e-6 : r < 1e-6 && Math.abs(o) < 1e-6) {
      const v = mesh.v(0, 0, z, k * segs); for (let q = 0; q < segs; q++) col.push(v);
    } else {
      for (let q = 0; q < segs; q++) {
        let x0, y0;
        if (round) { const rad = r + o; x0 = rad * Math.cos(cols.A[q]); y0 = rad * Math.sin(cols.A[q]); }
        else { x0 = r * cols.CX[q] + o * cols.NX[q]; y0 = r * cols.CY[q] + o * cols.NY[q]; }
        col.push(mesh.v(x0 * cr - y0 * sr, x0 * sr + y0 * cr, z, k * segs + q));
      }
    }
    shared.set(key, col);
    return col;
  };
  for (let k = 0; k < n; k++) {
    const k2 = (k + 1) % n;
    const A = column(k, k), B = column(k2, k);
    for (let q = 0; q < segs; q++) {
      const q1 = (q + 1) % segs;
      mesh.tri(A[q], B[q], B[q1]);
      mesh.tri(A[q], B[q1], A[q1]);
    }
  }
  // make the winding face outward whatever direction the loop was drawn in
  const Pa = mesh.P.a, Ia = mesh.I.a;
  let vol = 0;
  for (let t = 0; t < mesh.I.n; t += 3) {
    const a = Ia[t] * 3, b = Ia[t + 1] * 3, c = Ia[t + 2] * 3;
    vol += Pa[a] * (Pa[b + 1] * Pa[c + 2] - Pa[b + 2] * Pa[c + 1]) - Pa[a + 1] * (Pa[b] * Pa[c + 2] - Pa[b + 2] * Pa[c]) + Pa[a + 2] * (Pa[b] * Pa[c + 1] - Pa[b + 1] * Pa[c]);
  }
  if (vol < 0) for (let t = 0; t < mesh.I.n; t += 3) { const x = Ia[t + 1]; Ia[t + 1] = Ia[t + 2]; Ia[t + 2] = x; }
  return mesh;
}
const revolve = (poly, segs) => sweep(poly, ROUND(), segs);

// ---------------------------------------------------------------- mesh finishing
// Overhang patches smaller than minArea mm² print fine; unflag them so the stripes show real problems.
// A patch on the side of an opening runs through the whole wall, so there it is judged by its length
// along the opening's edge instead: under 2.5 mm it is a short corner the printer simply bridges.
function dropSpecks(P, I, flag, minArea, G = null, cutDepth = 0) {
  const nt = flag.length, parent = new Int32Array(nt), owner = new Int32Array(P.length / 3).fill(-1);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < nt; t++) {
    parent[t] = t;
    if (flag[t] !== 1) continue;
    for (let k = 0; k < 3; k++) {
      const v = I[t * 3 + k];
      if (owner[v] < 0) owner[v] = t;
      else { const a = find(owner[v]), b = find(t); if (a !== b) parent[a] = b; }
    }
  }
  const area = new Float64Array(nt);
  const triArea = (t) => {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    return Math.sqrt((uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2) / 2;
  };
  const onCut = new Uint8Array(nt).fill(1);
  for (let t = 0; t < nt; t++) if (flag[t] === 1) { const root = find(t); area[root] += triArea(t); if (!G || G[t] !== 1) onCut[root] = 0; }
  const cutArea = Math.max(minArea, 2.5 * cutDepth);
  let removed = 0;
  for (let t = 0; t < nt; t++) {
    if (flag[t] !== 1) continue;
    const root = find(t);
    if (area[root] < (onCut[root] ? cutArea : minArea)) { flag[t] = 0; removed += triArea(t); }
  }
  return removed;
}

function finish(mesh, { overhangLimit = 46, cutDepth = 0 } = {}) {
  const P = mesh.P.out(), I = mesh.I.out(), W = mesh.W.out(), G = mesh.G.out();
  let vol = 0, area = 0, over = 0, bridge = 0;
  const overFace = new Uint8Array(I.length / 3);
  const cosLim = Math.cos(((90 - overhangLimit) * Math.PI) / 180);
  const N = new Float32Array(P.length);
  let zMin = Infinity;
  for (let k = 2; k < P.length; k += 3) if (P[k] < zMin) zMin = P[k];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ax = P[a], ay = P[a + 1], az = P[a + 2];
    const ux = P[b] - ax, uy = P[b + 1] - ay, uz = P[b + 2] - az;
    const vx = P[c] - ax, vy = P[c + 1] - ay, vz = P[c + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    vol += (ax * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - ay * (P[b] * P[c + 2] - P[b + 2] * P[c]) + az * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    area += len / 2;
    if (len > 0) {
      const zlo = Math.min(az, P[b + 2], P[c + 2]);
      if (-nz / len > cosLim && zlo > zMin + 0.25 && G[t / 3] !== 3) {
        // a near-flat roof over an opening is a bridge; anything sloped is a true overhang
        const isBridge = G[t / 3] === 1 && -nz / len > 0.94;
        if (isBridge) bridge += len / 2; else over += len / 2;
        overFace[t / 3] = isBridge ? 2 : 1;
      }
    }
    N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
    N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
    N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
  }
  over -= dropSpecks(P, I, overFace, 4, G, cutDepth);
  for (let k = 0; k < N.length; k += 3) {
    const l = Math.sqrt(N[k] * N[k] + N[k + 1] * N[k + 1] + N[k + 2] * N[k + 2]) || 1;
    N[k] /= l; N[k + 1] /= l; N[k + 2] /= l;
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < P.length; k += 3) {
    if (P[k] < x0) x0 = P[k]; if (P[k] > x1) x1 = P[k];
    if (P[k + 1] < y0) y0 = P[k + 1]; if (P[k + 1] > y1) y1 = P[k + 1];
    if (P[k + 2] > z1) z1 = P[k + 2];
  }
  // compact weld ids to 0..m-1
  let wMax = 0;
  for (let k = 0; k < W.length; k++) if (W[k] > wMax) wMax = W[k];
  const remap = new Int32Array(wMax + 1).fill(-1);
  const weld = new Uint32Array(W.length);
  let wc = 0;
  for (let k = 0; k < W.length; k++) {
    let id = remap[W[k]];
    if (id < 0) id = remap[W[k]] = wc++;
    weld[k] = id;
  }
  return {
    position: P, normal: N, index: I, weld, weldCount: wc, overFace,
    stats: { volume: Math.abs(vol), area, overhang: over, bridge, tris: I.length / 3, bbox: [x0, y0, zMin, x1, y1, z1] },
  };
}

// ---------------------------------------------------------------- object recipes
// Grid spacing in mm: fine enough to resolve the thinnest feature of the chosen pattern.
function cellFor(S0, mode, rMinEff, L, quality) {
  const S = { ...S0, pattern: basePattern(S0.pattern) };
  const N = Math.max(1, S.count);
  const Sc = (TAU * rMinEff) / N;
  let c;
  if (mode === 'cut') {
    c = Math.min((S.width || 2) * 0.36, Sc / 9);
    if (S.pattern === 'dots') c = Math.min(c, (Sc * (1 - 0.9 * (S.fill || 0.5))) / 2.5);
    c = clamp(c, 0.3, 0.6);
  } else if (mode === 'relief') {
    let f = Sc / 9;
    switch (S.pattern) {
      case 'waves': f = Math.min(f, L / Math.max(2, S.rows) / 8); break;
      case 'knit': case 'weave': case 'petals': f *= 0.5; break;
      case 'tiles': f = Math.min(f, (S.width || 2) / 1.6, (S.depth || 1) * 0.6); break;
      case 'blocks': f = Math.min(f, (S.width || 1.2) / 1.6, Math.max(0.6, (S.depth || 1) * 0.35) / 6); break;
      // deep ribs with flat or sharp tops (fins) turn over a narrow edge
      case 'ribs': if ((S.depth || 0) > 3) f = Math.min(f, ((S.fill || 1) * Sc * (S.profile === 'flat' ? 0.15 : 0.5)) / 4); break;
      case 'topo': f = Math.min(f * 0.6, (S.width || 2) / 3); break;
      case 'prism': f *= 0.7; break;
      case 'hammered': case 'carved': f *= 0.9; break;
      case 'voronoi': case 'honeycomb': f = Math.min(f, (S.width || 2) * 0.2); break;
      case 'dots': f = Math.min(f, Math.max(0.6, (S.fill || 0.5) * 0.45 * Sc) / 3); break;
      case 'cubes': case 'gouge': f *= 0.8; break;
      case 'seigaiha': f = Math.min(f * 0.5, (0.62 * Sc) / Math.max(2, S.rows || 4) / 6); break;
      case 'herringbone': f = Math.min(f, (Sc * 0.35) / 8); break;
      case 'rings': f = Math.min(f, (S.width || 4) / 6); break;
      case 'dunes': f = Math.min(f, L / Math.max(2, S.rows) / 10); break;
      default: break;
    }
    // creases need a fine grid to print crisp; 0.8 mm keeps a ridge within a fraction of a line width
    c = clamp(f, 0.25, 0.5);
  } else c = 2.2;
  return c / quality;
}

// Rim edge profiles: how far the outer wall moves out (+) and the inner wall moves out (+) at
// distance u below the rim. Every lower edge stays under 45° so rims print without support.
export function rimProfile(edge, t) {
  if (edge === 'round') {
    const r = 0.46 * t;
    const q = (u) => (u >= r ? 0 : r - Math.sqrt(Math.max(0, r * r - (r - u) * (r - u))));
    return { zone: r, out: (u) => -q(u), inn: (u) => q(u) };
  }
  if (edge === 'bevel') {
    const c = 0.62 * t;
    return { zone: c, out: (u) => (u >= c ? 0 : -(c - u)), inn: () => 0 };
  }
  if (edge === 'rolled') {
    // a bead on the outside: rounded on top, a 27° underside back into the wall
    const bw = clamp(0.95 * t, 1.2, 3), hb = bw * 3, ri = 0.3 * t;
    const out = (u) => (u < bw ? Math.sqrt(Math.max(0, bw * bw - (bw - u) * (bw - u))) : u < hb ? bw * (1 - (u - bw) / (hb - bw)) : 0);
    const inn = (u) => (u >= ri ? 0 : ri - Math.sqrt(Math.max(0, ri * ri - (ri - u) * (ri - u))));
    return { zone: hb, out, inn, extra: bw };
  }
  return null;
}

function makePatternedShell(rFn, H, P, quality, floor, top, extra = {}) {
  const S = P.surface;
  const mode = S.pattern === 'smooth' ? 'none' : S.mode;
  const sec = extra.sec || ROUND();
  const perim = sec.L / TAU;
  // coarse pass to know radii
  const coarse = sampleRows(rFn, H, 4);
  let rMin = Infinity, rMax = 0;
  for (let j = 0; j < coarse.n; j++) { rMin = Math.min(rMin, coarse.r[j]); rMax = Math.max(rMax, coarse.r[j]); }
  rMax += extra.offset || 0;
  let cell = extra.cell || cellFor(S, mode, rMin * perim, coarse.L, quality);
  // keep the grid within budget
  const budget = 2.4e6 * Math.min(quality, 1.6);
  const est = () => (Math.ceil((rMax * sec.L) / cell) * coarse.L) / cell;
  while (est() > budget) cell *= 1.12;
  const rimSet = top === 'rim' ? extra.rim : null;
  const rim = rimSet ? rimProfile(rimSet.edge, P.form.wall) : null;
  const drop = rimSet && rimSet.shape !== 'level' ? rimSet.drop : 0;
  // dense rows where the rim edge and any wavy rim line live
  const notchD = extra.notch ? extra.notch.depth : 0;
  const zoneTot = (rim ? rim.zone * 1.15 : 0) + Math.max(drop, notchD);
  const fine = Math.min(cell, rim ? rim.zone / 10 : cell * 0.6);
  // colour bands: cuts stay clear of the floor and of the shaped rim
  let cuts = [];
  if (extra.bands && top !== 'cap') {
    const lo = Math.max(P.form.floor + P.form.wall + 3, mode === 'cut' ? Math.max(S.bandBottom, P.form.floor + 1.2) + 0.5 : 0, 3);
    const hi = H - (rim ? rim.zone * 1.15 : 0) - drop - 3;
    for (const zc of extra.bands.cuts) {
      const z = Math.round(clamp(zc, lo, hi) / 0.2) * 0.2; // land on a 0.2 mm layer line
      if (z > lo - 0.01 && z < hi + 0.01 && cuts.every((c) => Math.abs(c - z) >= 2)) cuts.push(z);
    }
    cuts.sort((a, b) => a - b);
  }
  const rows = sampleRows(rFn, H, cell, 0, zoneTot > 0 ? { zone: zoneTot, count: Math.min(180, Math.ceil(zoneTot / fine)) } : null, cuts);
  if (extra.offset) rows.off = new Float64Array(rows.n).fill(extra.offset);
  if (rim) rMax += rim.extra || 0;
  let NU = Math.ceil((rMax * sec.L) / cell);
  NU += (4 - (NU % 4)) % 4;
  let topL = null;
  if (drop > 0) {
    const ang = sectionColumns(sec, NU).A, k = rimSet.shape === 'slant' ? 1 : rimSet.waves;
    topL = new Float64Array(NU);
    for (let i = 0; i < NU; i++) topL[i] = rows.L - drop * (0.5 - 0.5 * Math.cos(k * ang[i]));
  }
  // a rounded notch cut down into the rim, e.g. for a lamp cord
  if (extra.notch) {
    const { angle, width, depth } = extra.notch, ang = sectionColumns(sec, NU).A, half = width / 2, rTop = rFn(H);
    if (!topL) topL = new Float64Array(NU).fill(rows.L);
    for (let i = 0; i < NU; i++) {
      const xm = Math.abs(Math.atan2(Math.sin(ang[i] - angle), Math.cos(ang[i] - angle))) * rTop;
      if (xm < half) topL[i] = Math.min(topL[i], rows.L - depth * Math.sqrt(1 - (xm / half) ** 2));
    }
  }
  const bandB = Math.max(mode === 'cut' ? Math.max(S.bandBottom, floor.type === 'open' ? 1.2 : floor.thick + 1.2) : S.bandBottom, extra.minBottomBand || 0);
  // patterns stop below a shaped rim so the edge profile stays clean
  const rimBand = rim ? rim.zone + 1.5 : 0;
  const bandT = mode === 'cut' ? Math.max(S.bandTop, extra.minTopBand || 1.2, rimBand) : Math.max(S.bandTop, extra.minTopBand || 0, rimBand);
  const freezeL = extra.freezeChamfer ? (P.form.inset || 0) * 1.45 + 0.4 : 0;
  // openings must keep their printable orientation, so a twisted outline does not drag them round
  const unswirl = mode === 'cut' ? ((extra.twist || 0) / TAU) * (H / Math.max(1e-6, rows.z[rows.n - 1])) : 0;
  let { F, D, Din } = buildSurface(rows, NU, S, mode, { bandBottom: bandB, bandTop: bandT, perim, topL, edge: rim, freezeL, unswirl });
  // a vertical channel pressed into the whole wall (outside in, inside out by the same amount)
  if (extra.channel) {
    const { angle, width, depth } = extra.channel, ang = sectionColumns(sec, NU).A, half = width / 2, edgeW = Math.min(6, half * 0.6);
    D = D || new Float32Array(rows.n * NU); Din = Din || new Float32Array(rows.n * NU);
    for (let i = 0; i < NU; i++) {
      const xm = Math.abs(Math.atan2(Math.sin(ang[i] - angle), Math.cos(ang[i] - angle))) * rMax;
      const w = depth * (1 - smoothstep(half - edgeW, half + edgeW, xm));
      if (w > 1e-4) for (let j = 0; j < rows.n; j++) { D[j * NU + i] -= w; Din[j * NU + i] -= w; }
    }
  }
  if (D) processRelief(D, rows, NU, { sec, perim, mode, twist: extra.twist || 0, H, fillBelow: extra.freezeChamfer ? (P.form.inset || 0) * 1.45 + 1 : 0 });
  const shellOpts = { sec, twist: extra.twist || 0, H, zShift: extra.zShift, shiftFrom: extra.shiftFrom, Din, innerStep: mode === 'relief' ? 4 : 1 };
  if (!cuts.length) {
    const mesh = buildShell(rows, NU, F, D, P.form.wall, { ...floor, band: bandB }, top, shellOpts);
    return { mesh, rows, NU, cell, rMax, rMin, perim };
  }
  // one closed body per band; neighbours share the exact same interface face
  const bounds = [0];
  for (const zc of cuts) { let best = 0; for (let j = 1; j < rows.n; j++) if (Math.abs(rows.z[j] - zc) < Math.abs(rows.z[best] - zc)) best = j; if (best > bounds[bounds.length - 1]) bounds.push(best); }
  bounds.push(rows.n - 1);
  const bodies = [];
  for (let b = 0; b + 1 < bounds.length; b++) {
    const a = bounds[b], e = bounds[b + 1];
    const pick = (arr) => arr.slice(a, e + 1);
    const sub = { n: e - a + 1, L: rows.L, r: pick(rows.r), z: pick(rows.z), nr: pick(rows.nr), nz: pick(rows.nz), l: pick(rows.l) };
    if (rows.off) sub.off = pick(rows.off);
    const view = (arr) => (arr ? arr.subarray(a * NU, (e + 1) * NU) : null);
    const fl = b === 0 ? { ...floor, band: bandB } : { type: 'open', cut: true };
    const tp = b + 2 === bounds.length ? top : 'cut';
    bodies.push(buildShell(sub, NU, view(F), view(D), P.form.wall, fl, tp, { ...shellOpts, Din: view(Din) }));
  }
  const merged = mergeMeshes(bodies);
  // which original band each body falls in, so its filament slot survives clamping
  const req = [0, ...extra.bands.cuts.slice().sort((x, y) => x - y), Infinity];
  const slotAt = (z) => { for (let k = 0; k + 1 < req.length; k++) if (z < req[k + 1]) return extra.bands.slots[k] ?? 0; return 0; };
  const regions = merged.ranges.map((rg, b) => ({ ...rg, slot: slotAt((rows.z[bounds[b]] + rows.z[bounds[b + 1]]) / 2), z0: rows.z[bounds[b]], z1: rows.z[bounds[b + 1]] }));
  return { mesh: merged.mesh, rows, NU, cell, rMax, rMin, perim, regions, cuts };
}

function maxRelief(S) {
  if (S.pattern === 'smooth') return 0;
  if (S.mode === 'relief') return (S.depth || 0) * (1 + Math.abs(S.gradient || 0));
  if (S.mode === 'cut') return (S.bulge || 0) + (S.pattern === 'wicker' ? S.depth || 0 : 0);
  return 0;
}

// Pieces that hold soil or water never get cut-through patterns.
export const WATERTIGHT = new Set(['planter', 'vase']);

export function generate(P, quality = 1) {
  const F = P.form, X = P.extras;
  let S = P.surface;
  if (WATERTIGHT.has(P.object) && S.mode === 'cut') { S = { ...S, mode: 'relief' }; P = { ...P, surface: S }; }
  const H = F.height;
  let rFn = makeProfile(F);
  let eased = 0;
  if (F.printable !== false) { const e = easeProfile(rFn, H, 44); rFn = e.fn; eased = e.moved; }
  const parts = [];
  const warnings = [];
  const mode = S.pattern === 'smooth' ? 'none' : S.mode;
  const add = (key, label, mesh, place) => {
    const m = finish(mesh, { overhangLimit: 46, cutDepth: F.wall });
    parts.push({ key, label, ...m, place });
  };
  const relief = maxRelief(S);

  // cross-section: round corners must stay wider than the wall, or the inner outline would fold
  let rMinAll = Infinity;
  for (let k = 0; k <= 200; k++) rMinAll = Math.min(rMinAll, rFn((H * k) / 200));
  let secF = F;
  if (F.section === 'polygon') {
    const need = (F.wall + relief + 1) / Math.max(5, rMinAll);
    if ((F.corner ?? 0.2) < need) { secF = { ...F, corner: Math.min(0.85, need) }; warnings.push({ level: 'ok', text: 'Corners were rounded a little more so the inner wall stays clean.' }); }
  }
  const sec = makeSection(secF);
  const twist = ((F.twist || 0) * Math.PI) / 180;
  // accessories follow the outline unless a twist would stop the pot from sliding in
  const accSec = sec.round || twist === 0 ? sec : ROUND();

  const obj = P.object;
  let floor = { type: 'solid', thick: F.floor };
  let top = 'rim';
  let minTopBand = 0;
  const insert = obj === 'planter' && X.base === 'insert';
  const lamp = obj === 'lamp';
  // a self-watering pot keeps its water: no drain hole in the outer pot
  if (obj === 'planter' && X.drain > 0 && !insert) floor = { type: 'hole', thick: F.floor, holeR: X.drain / 2 };
  if (obj === 'pendant') floor = { type: 'hole', thick: F.floor, holeR: X.socket / 2 };
  // a table-lamp shade is open at both ends and stands in a groove in the base
  const GROOVE = 3;
  if (lamp) floor = { type: 'open' };
  if (obj === 'vase' && X.vaseMode && mode !== 'cut') top = 'cap';
  const lidOn = obj === 'box' && X.lid;
  if (lidOn) minTopBand = X.plugDepth + 2;

  // keep holes inside the floor
  if (floor.type === 'hole') {
    const r0 = rFn(0) * sec.minR - F.wall - 3;
    if (floor.holeR > r0) { floor.holeR = Math.max(4, r0); warnings.push({ level: 'warn', text: 'The centre hole was reduced to fit inside the floor.' }); }
  }

  // rim: an edge profile, and a wavy or slanted top line (not where a lid has to sit flat)
  const rimEdge = top === 'rim' ? F.rimEdge || 'flat' : 'flat';
  // a lid or a self-watering insert has to sit on a level rim
  const rimShape = top === 'rim' && !lidOn && !insert ? F.rimShape || 'level' : 'level';
  const rimDrop = clamp(F.rimDepth || 0, 0, H * 0.35);
  const shaped = rimShape !== 'level' && rimDrop > 0.5;
  const extraMain = { minTopBand, sec, twist, freezeChamfer: !lamp, minBottomBand: lamp ? GROOVE + 3 : 0 };
  const mc = P.multicolor && P.multicolor.cuts && P.multicolor.cuts.length ? P.multicolor : null;
  if (mc) extraMain.bands = mc;
  if (rimEdge !== 'flat' || shaped) extraMain.rim = { edge: rimEdge, shape: shaped ? rimShape : 'level', drop: rimDrop, waves: clamp(Math.round(F.rimWaves || 6), 2, 24) };
  const shell = makePatternedShell(rFn, H, P, quality, floor, top, extraMain);
  const mainKey = { planter: 'pot', box: 'box', pendant: 'shade', lamp: 'shade', bowl: 'bowl', vase: 'vase', cup: 'cup' }[obj];
  const mainLabel = { planter: 'Pot', box: 'Box', pendant: 'Shade', lamp: 'Shade', bowl: 'Bowl', vase: top === 'cap' ? 'Vase (solid, for spiral vase mode)' : 'Vase', cup: 'Cup' }[obj];

  let mainLift = 0;

  // ---- planter accessories
  if (obj === 'planter' && X.base === 'sleeve') {
    const fS = 2.0, gap = X.gap, ts = 2.0;
    const Hs = Math.max(20, H * X.sleeveH);
    // inner clearance, monotone so the pot can drop in from above
    let run = rFn(Math.min(H, F.inset + 0.5));
    const steps = 400; const prefix = new Float64Array(steps + 1);
    for (let k = 0; k <= steps; k++) { run = Math.max(run, rFn(Math.max(0, (Hs * k) / steps - fS))); prefix[k] = run; }
    const inset = Math.min(3, F.inset + 1.5);
    const tilt = Math.min(X.sleeveTilt, Hs * 0.45), shiftFrom = Math.min(Hs * 0.4, inset + 6);
    // the slanted top squeezes the wall's height on its low side, which steepens any flare there:
    // ease the flare by that much more so it is still 44° after the squeeze
    const squeeze = Math.max(0.3, 1 - tilt / Math.max(1, Hs - shiftFrom));
    const sDeg = (Math.atan(Math.tan((44 * Math.PI) / 180) * squeeze) * 180) / Math.PI;
    const sFn = easeProfile((z) => {
      const x = clamp((z / Hs) * steps, 0, steps), k = Math.min(steps - 1, Math.floor(x));
      return prefix[k] + (prefix[k + 1] - prefix[k]) * (x - k) - (z < inset ? inset - z : 0);
    }, Hs, sDeg).fn;
    const P2 = { ...P, form: { ...F, wall: ts }, surface: { ...S, pattern: 'smooth', mode: 'none', bandBottom: 0, bandTop: 0 } };
    const sl = makePatternedShell(sFn, Hs, P2, quality, { type: 'solid', thick: fS }, 'rim', {
      cell: 1.6 / quality, sec: accSec, offset: relief + gap + ts, shiftFrom,
      zShift: (NU, ang) => { const a = new Float64Array(NU); for (let i = 0; i < NU; i++) a[i] = -tilt * 0.5 + tilt * 0.5 * Math.cos(ang[i]); return a; },
    });
    mainLift = fS;
    add('sleeve', 'Sleeve', sl.mesh, { z: 0, color: 1 });
    if (Hs >= H - 5) warnings.push({ level: 'warn', text: 'The sleeve almost covers the pot. Lower the sleeve height.' });
  }
  if (obj === 'planter' && X.base === 'saucer') {
    const r0 = rFn(0);
    const gap = relief + Math.max(3, X.gap + 2), t = 2, tf = 2, hs = 14, c = 1.2, fl = 2.5;
    const poly = [[0, 0, 0, true], [r0, 0, gap + t - c], [r0, c, gap + t], [r0, hs, gap + t + fl], [r0, hs, gap + fl], [r0, tf, gap], [0, tf, 0, true]];
    const segs = Math.max(96, Math.ceil(((r0 + gap) * accSec.L) / 1.2));
    add('saucer', 'Saucer', sweep(poly, accSec, segs), { z: 0, color: 1 });
    mainLift = tf;
  }

  // ---- table lamp base: printed top-down. Its top plate holds an E27 socket in a centre hole and has a
  // groove the shade stands in; a notch in the bottom edge lets the cord out.
  if (lamp) {
    const c = 0.45, tB = 3, plate = GROOVE + 2.6, Hb = clamp(X.baseH || 55, 30, 140);
    let kLo = Infinity;
    const cols = sectionColumns(sec, 256);
    for (let i = 0; i < 256; i++) kLo = Math.min(kLo, cols.CX[i] * cols.NX[i] + cols.CY[i] * cols.NY[i]);
    const rS = rFn(0), rB = rS + (F.wall + c + 4) / Math.max(0.4, kLo);
    let holeR = (X.socket || 40) / 2;
    const room = rS * sec.minR - F.wall - c - 3;
    if (holeR > room) { holeR = Math.max(8, room); warnings.push({ level: 'warn', text: 'The socket hole was reduced to stay inside the shade groove.' }); }
    const bFn = (z) => rB - Math.max(0, 1.2 - z);
    const PB = { ...P, form: { ...F, wall: tB, floor: plate, height: Hb }, surface: { ...S, pattern: 'smooth', mode: 'none', bandBottom: 0, bandTop: 0, swirl: 0 } };
    const bs = makePatternedShell(bFn, Hb, PB, quality, { type: 'groove', thick: plate, holeR, groove: { sc: rS, oIn: -(F.wall + c), oOut: c, depth: GROOVE } }, 'rim', {
      sec, cell: 1.4 / quality, notch: X.cord !== false ? { angle: -Math.PI / 2, width: 10, depth: 8 } : null,
    });
    add('base', 'Base', bs.mesh, { z: Hb, flipZ: true, color: 1 });
    mainLift = Hb - GROOVE;
  }

  // ---- self-watering insert: an inner pot hanging from the rim on a 45° flare, with a wick hole in its
  // floor. Water goes in through a channel down one side, which also leaves a pour gap in the flare.
  let reservoirMl = 0;
  if (insert) {
    const gap = clamp(X.gap ?? 1.5, 0.8, 4), tI = clamp(F.wall, 1.6, 3), zr = clamp(X.reservoir || 30, F.floor + 10, H * 0.45);
    const fH = F.wall + gap + 1.5, Hi = H - zr + fH;
    // the insert has to drop in from above: at each height it may be no wider than the narrowest part of
    // the pot above it (a round insert in a twisted outline keeps to the circle inside that outline)
    const scaleIn = accSec === sec ? 1 : sec.minR, steps = 400, sufMin = new Float64Array(steps + 1);
    sufMin[steps] = rFn(H) * scaleIn;
    for (let k = steps - 1; k >= 0; k--) sufMin[k] = Math.min(sufMin[k + 1], rFn((H * k) / steps) * scaleIn);
    const fit = (z) => { const x = clamp((z / H) * steps, 0, steps), k = Math.min(steps - 1, Math.floor(x)); return sufMin[k] + (sufMin[k + 1] - sufMin[k]) * (x - k); };
    const iFn = (z) => fit(Math.min(H, z + zr)) + Math.max(0, z - (H - zr));
    const PI2 = { ...P, form: { ...F, wall: tI, floor: tI, height: Hi }, surface: { ...S, pattern: 'smooth', mode: 'none', bandBottom: 0, bandTop: 0, swirl: 0 } };
    const ins = makePatternedShell(iFn, Hi, PI2, quality, { type: 'hole', thick: tI, holeR: 7 }, 'rim', {
      cell: 1.6 / quality, sec: accSec, offset: -(F.wall + gap), channel: { angle: -0.6, width: 26, depth: 7 },
    });
    add('insert', 'Self-watering insert', ins.mesh, { z: zr, color: 1 });
    // water below the insert: the inner outline's area times the depth
    const cols = sectionColumns(accSec, 256), rIn = rFn(zr * 0.5);
    let area = 0;
    for (let i = 0; i < 256; i++) {
      const j = (i + 1) % 256;
      const xa = rIn * cols.CX[i] - F.wall * cols.NX[i], ya = rIn * cols.CY[i] - F.wall * cols.NY[i];
      const xb = rIn * cols.CX[j] - F.wall * cols.NX[j], yb = rIn * cols.CY[j] - F.wall * cols.NY[j];
      area += (xa * yb - xb * ya) / 2;
    }
    reservoirMl = (Math.abs(area) * Math.max(0, zr - F.floor - 2)) / 1000;
    if (zr > H - 25) warnings.push({ level: 'warn', text: 'The reservoir is very tall; the insert has little room for soil.' });
  }

  add(mainKey, mainLabel, shell.mesh, { z: mainLift, color: 0, flip: obj === 'pendant' });
  if (shell.regions) parts[parts.length - 1].regions = shell.regions;

  // ---- box lid + knob
  if (lidOn) {
    const rows = shell.rows;
    const rT = rFn(H);
    const reliefTop = S.mode === 'relief' && S.bandTop <= 0 ? relief : 0;
    let rP = Infinity, wallN = 0;
    for (let j = 0; j < rows.n; j++) if (rows.z[j] >= H - X.plugDepth - 0.5) { rP = Math.min(rP, rows.r[j]); wallN = Math.max(wallN, F.wall * rows.nr[j]); }
    const tp = 2.4, hp = X.plugDepth, tpl = 1.6, c = 0.8;
    const oOut = reliefTop + X.lidOverhang;
    const knob = X.knob !== 'none';
    const pegR = 4, holeR = knob ? pegR + 0.15 : 0;
    // a twisted, non-round opening turns under the plug, so the plug becomes a circle that clears it
    const roundPlug = !sec.round && twist !== 0;
    const pr = roundPlug ? rP * sec.minR - wallN - X.clearance : rP;
    const po = roundPlug ? 0 : -wallN - X.clearance;
    const pl = (z, extraO) => (roundPlug ? [pr, z, extraO, true] : [rP, z, po + extraO]);
    const poly = [
      [holeR, 0, 0, true], [rT, 0, oOut - c], [rT, c, oOut], [rT, tp, oOut],
      pl(tp, 0), pl(tp + hp - 0.8, 0), pl(tp + hp, -0.8), pl(tp + hp, -tpl), pl(tp, -tpl), [holeR, tp, 0, true],
    ];
    const segs = Math.max(128, Math.ceil(((rT + oOut) * sec.L) / 1.0));
    // printed upside down: mirror the twist so it lines up once flipped onto the box
    add('lid', 'Lid', sweep(poly, sec, segs, -twist), { z: H + tp, flipZ: true, color: 2, lidLift: true });
    const plugInner = roundPlug ? pr - tpl : rP * sec.minR + po - tpl;
    if (knob) {
      let kp;
      const pegL = tp - 0.3;
      if (X.knob === 'ball') {
        const R = X.knobSize / 2, d = 0.7 * R;
        kp = [[0, 0]];
        const a0 = Math.acos(-d / R), a1 = Math.acos(d / R); // polar angles from +z
        const steps = 28;
        for (let k = 0; k <= steps; k++) {
          const ang = a0 + ((a1 - a0) * k) / steps;
          kp.push([R * Math.sin(ang), d + R * Math.cos(ang)]);
        }
        const zTop = 2 * d;
        kp.push([pegR, zTop], [pegR, zTop + pegL - 0.5], [pegR - 0.5, zTop + pegL], [0, zTop + pegL]);
        add('knob', 'Knob', revolve(kp, 72), { z: H + tp + zTop, flipZ: true, color: 2, lidLift: true });
      } else {
        const R = X.knobSize / 2, hk = Math.max(8, R * 0.7), c2 = 1.2;
        kp = [[0, 0], [R - c2, 0], [R, c2], [R, hk - c2], [R - c2 * 2, hk], [pegR, hk], [pegR, hk + pegL - 0.5], [pegR - 0.5, hk + pegL], [0, hk + pegL]];
        add('knob', 'Knob', revolve(kp, 72), { z: H + tp + hk, flipZ: true, color: 2, lidLift: true });
      }
    }
    if (plugInner < 10) warnings.push({ level: 'bad', text: 'The opening is too narrow for a lid.' });
  }

  // ---- checks
  const checks = [];
  const cellW = (TAU * shell.rMax * shell.perim) / Math.max(1, S.count);
  const cellMin = (TAU * shell.rMin * shell.perim) / Math.max(1, S.count);
  const pBase = basePattern(S.pattern);
  if (mode === 'cut') {
    const strip = pBase === 'dots' ? cellMin * (1 - 0.9 * (S.fill || 0.5)) : S.width;
    const what = pBase === 'dots' ? 'The thinnest gap between holes is' : 'Strips are';
    if (strip < 0.85) checks.push({ level: 'bad', text: `${what} ${strip.toFixed(1)} mm. Use 0.9 mm or more so a 0.4 mm nozzle can lay two lines.` });
    else if (strip < 1.3) checks.push({ level: 'warn', text: `${what} ${strip.toFixed(1)} mm. They print, but 1.3 mm or more is sturdier.` });
    else checks.push({ level: 'ok', text: `${what} ${strip.toFixed(1)} mm: prints with a 0.4 mm nozzle.` });
    if ((S.pattern === 'lattice' || S.pattern === 'prism') && S.angle < 44) checks.push({ level: 'warn', text: `Lattice angle ${Math.round(S.angle)}° is shallow. 46° or steeper prints cleanly without supports.` });
  }
  const loops = Math.max(1, Math.round(F.wall / 0.45));
  if (F.wall < 0.8) checks.push({ level: 'bad', text: 'Walls under 0.8 mm are too thin for a 0.4 mm nozzle.' });
  else if (F.wall < 2 && top !== 'cap') checks.push({ level: 'warn', text: `Wall ${F.wall.toFixed(1)} mm is thin and can flex or crack. 3 mm makes a sturdy piece.` });
  else checks.push({ level: 'ok', text: `Wall ${F.wall.toFixed(1)} mm ≈ ${loops} wall loop${loops > 1 ? 's' : ''} at 0.45 mm line width.` });
  const overArea = parts.reduce((acc, p) => acc + p.stats.overhang, 0);
  const bridgeArea = parts.reduce((acc, p) => acc + p.stats.bridge, 0);
  const totalArea = parts.reduce((acc, p) => acc + p.stats.area, 0);
  if (overArea / totalArea > 0.01 || overArea > 500) checks.push({ level: 'bad', text: `${(overArea / 100).toFixed(1)} cm² overhangs past 46°. It is striped on the model; add supports or change the shape.` });
  else if (overArea > 60) checks.push({ level: 'warn', text: `${(overArea / 100).toFixed(1)} cm² of small overhangs past 46°, striped on the model. Usually prints fine.` });
  else checks.push({ level: 'ok', text: 'No overhangs past 46°. Prints without supports.' });
  if (mode === 'cut' && bridgeArea > 40) {
    const follow = S.edge !== 'straight';
    let span = 0;
    if (['lattice', 'prism', 'ogee', 'arches'].includes(S.pattern)) span = follow ? 0 : cellW * 0.9 - S.width;
    else if (S.pattern === 'ribs' || S.pattern === 'chevron') span = follow ? 0 : cellW - S.width;
    else if (S.pattern === 'wicker') span = cellW - S.width;
    else if (pBase === 'dots') span = !S.arch ? cellW * 0.9 * (S.fill || 0.5) : 0;
    else span = S.arch ? 0 : cellW * (S.pattern === 'honeycomb' ? 0.5 / Math.max(1, S.stretch) : 0.62) - S.width;
    if (span > 14) checks.push({ level: 'warn', text: `Some openings bridge about ${Math.round(span)} mm. Use pointed tops, more cells, or taller cells.` });
    else checks.push({ level: 'ok', text: 'Opening tops are short bridges or self-supporting.' });
  }
  if (eased > 0.5) checks.push({ level: 'ok', text: `Silhouette eased by up to ${eased.toFixed(1)} mm to keep walls under 44°.` });
  if (insert) checks.push({ level: 'ok', text: `Self-watering: the reservoir holds about ${Math.round(reservoirMl / 10) * 10} ml under the insert. Fill it through the channel at the rim, and thread a cotton wick through the hole in the insert's floor.` });
  if (lamp) {
    let rMinIn = Infinity;
    for (let j = 0; j < shell.rows.n; j++) if (shell.rows.z[j] > 25 && shell.rows.z[j] < 140) rMinIn = Math.min(rMinIn, shell.rows.r[j] * sec.minR - F.wall);
    if (rMinIn < 45) checks.push({ level: 'warn', text: 'The shade is narrow around the bulb. Keep 3 cm around the bulb and use LED bulbs only.' });
    else checks.push({ level: 'ok', text: 'Room for an A60 LED bulb. The shade stands in a groove in the base and lifts off to change the bulb.' });
  }
  if (obj === 'pendant') {
    // an A60 bulb hangs roughly 30-110 mm below the socket
    let rMinIn = Infinity;
    for (let j = 0; j < shell.rows.n; j++) if (shell.rows.z[j] > 50 && shell.rows.z[j] < 115) rMinIn = Math.min(rMinIn, shell.rows.r[j] * sec.minR - F.wall);
    if (rMinIn < 50) checks.push({ level: 'warn', text: 'The shade is narrow near the bulb. Keep 3 cm around the bulb and use LED bulbs only.' });
    else checks.push({ level: 'ok', text: 'Room for a standard A60 LED bulb with clearance.' });
  }
  for (const w of warnings) checks.push(w);

  // spiral vase mode prints one body, so colours become filament changes at these heights instead
  const colorChanges = mc && top === 'cap' ? mc.cuts.map((z) => Math.round(clamp(z, 3, H - 3) / 0.2) * 0.2) : shell.cuts || [];
  return { parts, checks, info: { cell: shell.cell, NU: shell.NU, rows: shell.rows.n, mainKey, eased, lift: mainLift, colorChanges } };
}

// ---------------------------------------------------------------- pattern swatches
// A flat tile of a pattern for the picker: returns the field F (cut) and relief D on a w x h grid.
const SWATCH_REPEATS = {
  lattice: 3, prism: 3, ogee: 3, arches: 4, voronoi: 3, honeycomb: 3, dots: 4, wicker: 5, ribs: 6, chevron: 5,
  reeds: 6, waves: 2, topo: 3, knit: 4, weave: 4, petals: 3, quilt: 3, facets: 4, tiles: 3, smooth: 1,
  hammered: 3, carved: 3, rings: 2, dunes: 2, bark: 5, gouge: 4, cubes: 3, knurl: 6, seigaiha: 3, herringbone: 3, perforated: 7,
  blocks: 3, spikes: 3, shards: 3, fins: 5, hobnail: 3,
};
export function swatch(S0, mode, w, h) {
  const reps = SWATCH_REPEATS[S0.pattern] || 3;
  const cellMM = ['ribs', 'reeds', 'chevron', 'bark', 'fins'].includes(S0.pattern) ? 9 : S0.pattern === 'tiles' ? 26 : S0.pattern === 'rings' ? 30 : 22;
  const C = reps * cellMM, r = C / TAU, px = C / w;
  const rows = { n: h, L: h * px, r: new Float64Array(h).fill(r), z: new Float64Array(h), nr: new Float64Array(h).fill(1), nz: new Float64Array(h), l: new Float64Array(h) };
  for (let j = 0; j < h; j++) { rows.l[j] = j * px; rows.z[j] = j * px; }
  const S = { ...S0, count: reps, rows: S0.pattern === 'waves' ? 7 : S0.pattern === 'dunes' ? 6 : S0.pattern === 'reeds' ? 3 : S0.rows, gradient: 0, edge: 'straight', bulge: 0 };
  return buildSurface(rows, w, S, mode, { bandBottom: -1, bandTop: -1 });
}

// Internals for the test scripts.
export const __test = { buildSurface, sampleRows, cellFor, processRelief, sectionColumns, makeSection };
