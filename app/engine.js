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

// the release this geometry comes from (pictures drawn of it are kept until it changes)
export const ENGINE_VERSION = '2.12.0';

// ---------------------------------------------------------------- growable buffers
class Buf {
  constructor(Type, n = 1 << 16) { this.T = Type; this.a = new Type(n); this.n = 0; }
  grow(k) { if (this.n + k > this.a.length) { const b = new this.T(Math.max(this.a.length * 2, this.n + k)); b.set(this.a); this.a = b; } }
  push3(x, y, z) { this.grow(3); const a = this.a, n = this.n; a[n] = x; a[n + 1] = y; a[n + 2] = z; this.n = n + 3; }
  push1(x) { this.grow(1); this.a[this.n++] = x; }
  out() { return this.a.slice(0, this.n); }
}

class Mesh {
  // (nv, nt: about how many vertices and triangles it will get, so its buffers rarely need to grow)
  constructor(nv = 1 << 14, nt = 1 << 14) {
    const v = Math.max(1 << 12, Math.ceil(nv)), t = Math.max(1 << 12, Math.ceil(nt));
    this.P = new Buf(Float32Array, 3 * v); this.I = new Buf(Uint32Array, 3 * t); this.W = new Buf(Int32Array, v); this.G = new Buf(Uint8Array, t); this.nv = 0; this.g = 0;
  }
  // weld: identity of the geometric point; render vertices sharing it are merged on export
  v(x, y, z, weld) { this.P.push3(x, y, z); this.W.push1(weld); return this.nv++; }
  tri(a, b, c) { if (a !== b && b !== c && a !== c) { this.I.push3(a, b, c); this.G.push1(this.g); } }
}

// ---------------------------------------------------------------- silhouettes
// a bottom that closes in a dome: truly round, or a cone to a point
export const domedBottom = (F) => F.bottom === 'round' || F.bottom === 'point';
const POINT_DEG = 43.5;
// r(z) from a handful of designer-facing parameters.
// (back: how far behind the centre a wall planter's flat back is, as a fraction of its radius)
export function makeProfile(F, back = 0) {
  const H = F.height, R = F.diameter / 2;
  const rb = R * F.base, rm = R, rt = R * F.top;
  const tb = clamp(F.belly, 0.08, 0.92);
  const f = clamp(F.fullness, -0.6, 1);
  const s0 = (rm - rb) / tb, s1 = (rt - rm) / (1 - tb);
  const m0 = s0 * (1 - f), m2 = s1 * (1 - f);
  const m1 = s0 * s1 <= 0 ? 0 : (2 * s0 * s1) / (s0 + s1);
  const lipH = Math.min(F.lipH || 0, H * 0.5), lip = F.lip || 0;
  // a domed bottom (hanging and wall planters) closes in a point on the axis instead of a flat base. Round:
  // below its widest point the silhouette is a quarter ellipse, a true hemisphere when the widest point is
  // as high up as the piece is wide across the middle. Pointed: it closes as a 43.5° cone instead, which
  // prints without supports. Either way the piece prints rim-down, the dome last. (A wall planter's dome
  // closes onto the wall, which leans its front further: its cone is that much steeper, so the front is 43.5°.)
  const dome = domedBottom(F), point = F.bottom === 'point', inset = dome ? 0 : F.inset || 0;
  // the base chamfer runs at 45°, steeper (35°) on twisted shaped pieces, whose flanks the twist leans further
  const chk = F.twist && F.section && F.section !== 'round' ? 0.7 : 1;
  const k = R * 0.3, slope = Math.tan((POINT_DEG * Math.PI) / 180) / (1 + back);
  return (z) => {
    const t = clamp(z / H, 0, 1);
    let r;
    if (dome && t <= tb) { const u = 1 - t / tb; r = rm * Math.sqrt(Math.max(0, 1 - u * u)); }
    else if (t <= tb) r = hermite(rb, rm, m0 * tb, m1 * tb, t / tb);
    else r = hermite(rm, rt, (dome ? 0 : m1) * (1 - tb), m2 * (1 - tb), (t - tb) / (1 - tb));
    if (lip && lipH > 0 && z > H - lipH) { const q = (z - (H - lipH)) / lipH; r += lip * q * q; }
    if (inset > 0 && z < inset / chk) r -= inset - z * chk;
    // (the blend narrows toward the tip, so the cone runs true to its point)
    if (point) { const c = z * slope; r = smin(r, c, Math.min(k, 0.8 * c)); }
    return dome ? Math.max(r, 0) : Math.max(r, 2);
  };
}

// Limit how far the silhouette may lean from vertical, so walls print without supports.
// Returns the eased profile and how far (mm) it had to move.
// (from `freeFrom` up it may narrow `capK` times as fast: without limit for a round dome closing over the
// top of the print)
export function easeProfile(rFn, H, maxDeg = 46, freeFrom = Infinity, capK = 1) {
  const n = 2400, dz = H / (n - 1), lim = Math.tan((maxDeg * Math.PI) / 180) * dz;
  const r = new Float64Array(n);
  let moved = 0;
  for (let k = 0; k < n; k++) {
    const want = rFn(k * dz);
    r[k] = k ? clamp(want, r[k - 1] - lim * (k * dz >= freeFrom ? capK : 1), r[k - 1] + lim) : want;
    moved = Math.max(moved, Math.abs(r[k] - want));
  }
  const fn = (z) => {
    const x = clamp(z / dz, 0, n - 1), k = Math.min(n - 2, Math.floor(x)), w = x - k;
    return r[k] + (r[k + 1] - r[k]) * w;
  };
  return { fn, moved };
}

// The silhouette as it is built, the right way up (z = 0 at its lowest point), eased so that it prints
// without supports. A domed bottom prints rim-down, so it is eased from the rim, and a round end stays round.
// (back: a wall planter's rows are all the same D standing on the wall, so its front leans 1 + back times
// as far as the silhouette: the silhouette is eased that much more, and the front keeps to 44°)
export function shapeProfile(F, back = 0) {
  const H = F.height, raw = makeProfile(F, back);
  if (F.printable === false) return { fn: raw, moved: 0 };
  const deg = (Math.atan(Math.tan((44 * Math.PI) / 180) / (1 + back)) * 180) / Math.PI;
  if (!domedBottom(F)) return easeProfile(raw, H, deg);
  const zb = clamp(F.belly, 0.08, 0.92) * H;
  const e = easeProfile((z) => raw(H - z), H, deg, H - zb, F.bottom === 'round' ? Infinity : 1);
  return { fn: (z) => e.fn(H - z), moved: e.moved };
}

// A domed bottom as it prints: the rim on the bed, the dome closing over the top. `rUp` is the silhouette
// the right way up. The profile stops at a small ring near the tip, closed by a cap to each wall's pole,
// or left open as a drainage hole.
function domeShape(F, X, rUp, back = 0) {
  const H = F.height, t = F.wall || 3, R = F.diameter / 2, point = F.bottom === 'point';
  const fn = (z) => rUp(H - z);
  const capFrom = H - clamp(F.belly, 0.08, 0.92) * H;
  // the height at which the dome has narrowed to radius r
  const zAt = (r) => {
    let hi = H, lo = H;
    while (lo > capFrom * 0.5 && fn(lo) < r) lo -= 0.25;
    for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2; if (fn(mid) >= r) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  const holeR = X.drain > 0 ? X.drain / 2 : 0;
  let rEnd = point ? Math.max(3, t + 1.2) : Math.max(2.5, 0.02 * R);
  if (holeR > 0) {
    // the hole is as wide as asked on the inside, where the wall's thickness narrows it
    rEnd = holeR;
    for (let it = 0; it < 4; it++) { const z = zAt(rEnd), sl = (fn(z - 0.05) - fn(Math.min(H, z + 0.05))) / 0.1; rEnd = Math.max(1.2, holeR + t / Math.sqrt(1 + sl * sl)); }
  }
  const zEnd = zAt(rEnd), slEnd = Math.max(0.2, (fn(zEnd - 0.05) - fn(Math.min(H, zEnd + 0.05))) / (Math.min(H, zEnd + 0.05) - (zEnd - 0.05)));
  // where a round dome starts to lean past 45° (the inside needs supports from there up)
  let zOver = Infinity, rOver = 0;
  if (!point) for (let z = capFrom; z < zEnd; z += 0.25) if ((fn(z) - fn(z + 0.25)) * (1 + back) > 0.25) { zOver = z; rOver = fn(z); break; }
  const arcFrom = (rStop) => { let L = 0, z0 = zAt(rStop), rp = fn(z0); const n = 200; for (let q = 1; q <= n; q++) { const z = z0 + ((zEnd - z0) * q) / n, r = fn(z); L += Math.hypot(r - rp, (zEnd - z0) / n); rp = r; } return L; };
  return { fn, H: zEnd, top: H, R, rEnd, capFrom, point, zOver, rOver, arcFrom, hole: holeR > 0,
    // the inside comes to its own pole, a wall's thickness (measured square to the wall) under the tip
    dome: { zOut: H, zIn: H - (t * Math.sqrt(1 + slEnd * slEnd)) / slEnd, hole: holeR > 0 } };
}

// ---------------------------------------------------------------- globe lamps
// A closed ball (an ellipsoid when Height and Diameter differ) on a short upright collar that stands in
// the base's groove. Its top is round, which needs supports inside, or rises to a 45° peak that closes
// on its own; its underside is round, held by supports round the collar, or a 45° cone that needs none.
// The profile ends in a small ring near the top, closed there by a cap to each wall's pole.
export const GLOBE_COLLAR = 10;
export function globeShape(F, X = {}, t = F.wall || 2) {
  const R = F.diameter / 2, hc = GLOBE_COLLAR;
  const rn = clamp((X.opening ?? 0.42 * F.diameter) / 2, Math.min(18, 0.6 * R), 0.8 * R);
  const s = Math.sqrt(1 - (rn / R) ** 2);
  const peak = X.globeTop === 'peak', cone = X.globeUnder === 'cone';
  // for radii R across and c up: where the outline leans 45° (u in units of c from the centre)
  const geo = (c) => {
    const k = c / R, u45 = k / Math.sqrt(1 + k * k), r45 = R * Math.sqrt(1 - u45 * u45);
    const coneOn = cone && r45 > rn + 0.5;
    const zc = coneOn ? hc + (r45 - rn) + c * u45 : hc + c * s;
    return { c, zc, u45, r45, coneOn, top: peak ? zc + c * u45 + r45 : zc + c };
  };
  // the height decides how tall the ball is: solve for c
  let lo = Math.max(8, 0.15 * R), hi = 4 * R;
  const want = clamp(F.height, geo(lo).top, geo(hi).top);
  for (let it = 0; it < 60; it++) { const mid = (lo + hi) / 2; if (geo(mid).top < want) lo = mid; else hi = mid; }
  const g = geo((lo + hi) / 2), { c, zc, u45, r45, coneOn } = g;
  const zConeTop = zc - c * u45, zPeak = zc + c * u45;
  const fn = (z) => {
    if (z <= hc) return rn;
    if (coneOn && z < zConeTop) return rn + (z - hc);
    if (peak && z > zPeak) return Math.max(0, r45 - (z - zPeak));
    const u = (z - zc) / c;
    return R * Math.sqrt(Math.max(0, 1 - u * u));
  };
  // where the profile stops: a ring a few mm across (wider than the wall on a peak, so its inside stays open)
  const rEnd = peak ? Math.max(3, t + 1.2) : Math.max(2.5, 0.02 * R);
  const zEnd = peak ? g.top - rEnd : zc + c * Math.sqrt(1 - (rEnd / R) ** 2);
  const dome = { zOut: g.top, zIn: peak ? g.top - t * Math.SQRT2 : g.top - t };
  // arc length along the profile, for keeping patterns off the collar and out of the narrow top
  const arc = (z0, z1) => { let L = 0, rp = fn(z0); const n = 400; for (let k = 1; k <= n; k++) { const z = z0 + ((z1 - z0) * k) / n, r = fn(z); L += Math.hypot(r - rp, (z1 - z0) / n); rp = r; } return L; };
  // the pattern stops where the ball has narrowed to a third of its width
  const rBand = Math.max(rn, 0.34 * R);
  let zBand = zEnd;
  for (let k = 0; k <= 800; k++) { const z = zc + ((zEnd - zc) * k) / 800; if (fn(z) < rBand) { zBand = z; break; } }
  // arc length of the cap above the point where the ball has narrowed to radius rStop
  const topBandAt = (rStop) => {
    let z0 = zEnd;
    for (let k = 0; k <= 800; k++) { const z = zc + ((zEnd - zc) * k) / 800; if (fn(z) < rStop) { z0 = z; break; } }
    return arc(z0, zEnd);
  };
  return {
    fn, H: zEnd, top: g.top, R, c, zc, rn, collar: hc, peak, cone: coneOn, dome, rBand, topBandAt,
    topBand: arc(zBand, zEnd) + 2, bottomBand: hc + 2,
    // the round underside leans past 45° from the collar out to here; a round top leans past 45° above here
    underTo: coneOn ? 0 : r45 > rn ? r45 : 0, zOver: peak ? Infinity : zPeak,
  };
}

// ---------------------------------------------------------------- cross-sections
// A closed, star-shaped outline with a maximum radius of 1, sampled at even arc length.
// Columns of the wall mesh are attached to arc-length positions, so patterns keep their scale.
const SECTION_SAMPLES = 2048;
const sectionCache = new Map();
export function makeSection(F = {}) {
  const kind = F.section === 'polygon' || F.section === 'lobed' || F.section === 'flatback' ? F.section : 'round';
  const key = kind === 'polygon' ? `p${F.sides}|${F.corner}` : kind === 'lobed' ? `l${F.lobes}|${F.lobeDepth}|${F.lobeStyle}` : kind === 'flatback' ? `f${F.back}` : 'round';
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
  } else if (kind === 'flatback') {
    // a D for wall planters: the circle cut by a straight back at y = b (towards +y), with rounded
    // corners; it runs anticlockwise from the middle of the front
    const b = clamp(F.back ?? 0.3, 0, 0.7), c = 0.16, yc = b - c, xc = Math.sqrt(Math.max(1e-6, (1 - c) ** 2 - yc ** 2));
    // (with the back behind the centre, the corner centres dip below the x axis: keep thL past pi)
    const thR = Math.atan2(yc, xc), thL = Math.atan2(yc, -xc) + (yc < 0 ? TAU : 0);
    const arc = (cx, cy, rad, a0, a1, n) => { for (let q = 0; q < n; q++) { const a = a0 + ((a1 - a0) * q) / n; pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); } };
    arc(0, 0, 1, -Math.PI / 2, thR, 600);
    arc(xc, yc, c, thR, Math.PI / 2, 80);
    for (let q = 0; q < 200; q++) pts.push([xc - (2 * xc * q) / 200, b]);
    arc(-xc, yc, c, Math.PI / 2, thL, 80);
    arc(0, 0, 1, thL, (3 * Math.PI) / 2, 600);
  } else {
    for (let q = 0; q < 1024; q++) { const th = (TAU * q) / 1024; pts.push([Math.cos(th), Math.sin(th)]); }
  }
  const sec = sectionFromPoints(pts, kind);
  sectionCache.set(key, sec);
  return sec;
}
// An outline from anticlockwise points, resampled at even arc length, with outward normals.
function sectionFromPoints(pts, kind = 'custom') {
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
  return { kind, round: kind === 'round', L, minR, x, y, nx, ny, M };
}
// How far an outline must shrink to stay inside itself while it turns by up to ±dphi: a lid plug the
// same shape as the box, just small enough to pass its twisted opening.
function turnedScale(sec, dphi) {
  const K = 1440, rad = new Float64Array(K);
  for (let q = 0; q < sec.M; q++) {
    const a = Math.atan2(sec.y[q], sec.x[q]), k = ((Math.round((a / TAU) * K) % K) + K) % K;
    rad[k] = Math.max(rad[k], Math.hypot(sec.x[q], sec.y[q]));
  }
  for (let k = 0; k < K; k++) if (!rad[k]) { let a = k, b = k; while (!rad[(a + K) % K]) a--; while (!rad[b % K]) b++; rad[k] = rad[(a + K) % K] + ((rad[b % K] - rad[(a + K) % K]) * (k - a)) / (b - a); }
  const span = Math.ceil((dphi / TAU) * K);
  let s = 1;
  for (let k = 0; k < K; k++) for (let d = -span; d <= span; d++) s = Math.min(s, rad[(((k + d) % K) + K) % K] / rad[k]);
  return s;
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

const NORMAL_SPAN = 2.5;
// Resample the meridian at even arc-length steps.
// fineTop: { zone (mm of arc under the rim), count } adds dense rows there for shaped rim edges
// cutZ: heights that must land exactly on a row (colour band boundaries)
function sampleRows(rFn, H, step, zFrom = 0, fineTop = null, cutZ = null, fineBot = null) {
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
  // dense rows over the bottom edge of an open piece too
  if (fineBot && fineBot.zone > 0 && fineBot.zone < L * 0.4) {
    const keep = targets.filter((t) => t > fineBot.zone + step * 0.4);
    targets.length = 0;
    for (let q = 0; q <= fineBot.count; q++) targets.push((fineBot.zone * q) / fineBot.count);
    targets.push(...keep);
  }
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
    // the wall's direction, averaged over 5 mm of the profile: where an eased silhouette meets its natural
    // curve the profile has a corner, and a normal that turned there abruptly would fold the inner wall
    const at = (sl) => {
      let q = 0; while (q < nd - 2 && dl[q + 1] < sl) q++;
      const u = clamp((sl - dl[q]) / (dl[q + 1] - dl[q] || 1), 0, 1);
      return [dr[q] + (dr[q + 1] - dr[q]) * u, dzA[q] + (dzA[q + 1] - dzA[q]) * u];
    };
    const [ra, za] = at(Math.max(0, target - NORMAL_SPAN)), [rb, zb] = at(Math.min(L, target + NORMAL_SPAN));
    const tr = rb - ra, tz = zb - za, tl = Math.sqrt(tr * tr + tz * tz) || 1;
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

// ---------------------------------------------------------------- even sizing
// A pattern keeps its size where the piece narrows: fewer cells fit round it there. The meridian is cut into
// courses, each with a whole number of cells around (so the pattern still closes round the piece). Within a
// course the pattern is conformal, as before: its cells keep their shape, and their size changes only as much
// as the radius does inside the course. Courses start and end on the pattern's own row lines, so a seam
// between two counts runs where the pattern already has a line.
//  - patterns whose rows stand on their own (scales, tiles, bricks, stitches, scattered cells) may drop a
//    cell at any row, like roof tiles on a dome: there is no seam to see.
//  - running patterns (diamonds, waves) step by about a third at a time, at least two cells apart, so they
//    have few seams; each is drawn as a strut, a fine plain line or a soft blend, whichever suits it.
//  - ribs halve: every other rib tapers out and the rest run straight on, like the flutes of a dome.
// The count asked for is the count at the widest point. Near a pole it stops falling at a few cells round,
// and those few shrink into the tip.
const PATTERN_ROWS = {
  petals: 'scales', seigaiha: 'scales', tiles: 'rows', blocks: 'rows', arches: 'arches', knit: 'knit',
  voronoi: 'seeds', honeycomb: 'seeds', dots: 'seeds', hammered: 'seeds', carved: 'seeds', rings: 'seeds', gouge: 'seeds',
  lattice: 'ridge', prism: 'ridge', ogee: 'ridge', wicker: 'strand',
  quilt: 'groove', chevron: 'groove', herringbone: 'groove', cubes: 'groove', facets: 'groove', weave: 'groove',
  ribs: 'flute', reeds: 'flute', bark: 'flute',
  waves: 'blend', topo: 'blend', dunes: 'blend',
};
const FINE_ROWS = new Set(['scales', 'rows', 'arches', 'knit', 'seeds']);
// how a pattern keeps its size where the piece narrows (for the studio's notes)
export const evenStyle = (pattern) => { const f = PATTERN_ROWS[basePattern(pattern)]; return FINE_ROWS.has(f) ? 'rows' : f || 'blend'; };
// the fewest cells round a course, near a pole
export const evenMin = (N) => Math.min(N, Math.max(3, Math.round(N / 5)));
// rows: the sampled meridian; perim: outline perimeter / 2 pi; N: cells round at the widest
// unit, phase: the pattern's row height and where its rows start, in t (one unit = one cell's width)
// fine: the count may change at every row; otherwise in steps of about q (halve: by half), with some
// hysteresis, and no sooner than two cells after the last step
// pairs: counts are kept even (an over-under weave needs them in pairs)
function makeCourses(rows, perim, N, { even = true, unit = 1, phase = 0, fine = false, q = 1.35, halve = false, pairs = false, seams = false } = {}) {
  const n = rows.n, tau = new Float64Array(n), cnt = new Int32Array(n);
  let rRef = 0;
  for (let j = 0; j < n; j++) rRef = Math.max(rRef, rows.r[j]);
  const pr = (j) => Math.max(0.5, rows.r[j]) * perim;
  if (!even) {
    for (let j = 1; j < n; j++) tau[j] = tau[j - 1] + ((rows.l[j] - rows.l[j - 1]) * 0.5 * (1 / pr(j) + 1 / pr(j - 1)) * N) / TAU;
    cnt.fill(N);
    return { tau, cnt, count: () => N, seamD: null, seamN: null, seamS: null, rRef };
  }
  const nMin = evenMin(N), L = rows.l[n - 1], lq = Math.log(halve ? 2 : q), hyst = halve ? 0.6 : 0.5;
  const fix = (c) => (pairs ? Math.max(Math.min(N, 4), 2 * Math.round(c / 2)) : c);
  // the count at each step down: by about q, or by half (a third, for an odd count that three divides)
  const countOf = (i) => {
    if (!halve) return fix(Math.max(nMin, Math.min(N, Math.round(N / q ** i))));
    let c = N;
    for (let s = 0; s < i; s++) { const nx = c % 2 === 0 ? c / 2 : c % 3 === 0 ? c / 3 : Math.round(c / 2); if (nx < nMin) break; c = nx; }
    return c;
  };
  // (no sooner than a cell and a half's width, at the widest, after the last step; one level at a time,
  // unless the piece narrows or widens so fast that the count falls more than a level and a half behind)
  const minRun = fine ? 0 : (1.1 * TAU * rRef * perim) / N;
  let lvMax = 0;
  while (lvMax < 40 && countOf(lvMax + 1) !== countOf(lvMax)) lvMax++;
  let idx = -1, lastL = -Infinity;
  const countAt = (r, Nc, l) => {
    if (fine) return fix(clamp(Math.round((r / rRef) * N), nMin, N));
    const lv = clamp(Math.log(rRef / Math.max(1e-6, r)) / lq, 0, lvMax + 0.4);
    if (idx < 0) { idx = Math.round(lv); return countOf(idx); }
    if (l - lastL < minRun || Math.abs(lv - idx) <= hyst) return Nc;
    idx = Math.abs(lv - idx) > 1.5 ? Math.round(lv) : idx + Math.sign(Math.round(lv) - idx);
    return countOf(idx);
  };
  let pj = 0;
  const rAt = (l) => {
    if (l <= 0) return rows.r[0];
    if (l >= L) return rows.r[n - 1];
    while (pj > 0 && rows.l[pj] > l) pj--;
    while (pj < n - 2 && rows.l[pj + 1] < l) pj++;
    const w = clamp((l - rows.l[pj]) / (rows.l[pj + 1] - rows.l[pj] || 1), 0, 1);
    return rows.r[pj] + (rows.r[pj + 1] - rows.r[pj]) * w;
  };
  // the count of a course is set by the radius halfway through it
  const decide = (l, Nc) => countAt(rAt(Math.min(L, l + 0.5 * unit * ((TAU * Math.max(0.5, rAt(l)) * perim) / Nc))), Nc, l);
  let k = Math.floor(-phase / unit), Nc = countAt(rAt(0), N, 0);
  idx = -1; Nc = decide(0, Nc);
  const k0 = k, counts = [Nc], seamL = [], seamA = [], seamB = [], seamT = [];
  let tb = phase + (k + 1) * unit;
  cnt[0] = Nc;
  for (let j = 1; j < n; j++) {
    let l0 = rows.l[j - 1], rem = rows.l[j] - l0, tc = tau[j - 1];
    const ra = Math.max(0.5, (rows.r[j - 1] + rows.r[j]) / 2) * perim;
    for (let guard = 0; guard < 100000; guard++) {
      const rate = Nc / (TAU * ra), need = (tb - tc) / rate;
      if (need > rem) { tc += rem * rate; break; }
      tc = tb; rem -= need; l0 += need; k++;
      const Nn = decide(l0, Nc);
      if (Nn !== Nc) { seamL.push(l0); seamB.push(Nc); seamA.push(Nn); seamT.push(tc); lastL = l0; }
      Nc = Nn; counts.push(Nc); tb = phase + (k + 1) * unit;
    }
    tau[j] = tc; cnt[j] = Nc;
  }
  const count = (kk) => counts[clamp(kk - k0, 0, counts.length - 1)];
  // for each row, how far it is (mm along the wall) from the nearest seam, and the count across it
  let seamD = null, seamN = null, seamS = null, seamTau = null;
  if (seams && seamL.length) {
    seamD = new Float64Array(n).fill(Infinity); seamN = new Int32Array(n); seamS = new Int8Array(n); seamTau = new Float64Array(n);
    let q2 = 0;
    for (let j = 0; j < n; j++) {
      const l = rows.l[j];
      while (q2 < seamL.length - 1 && Math.abs(seamL[q2 + 1] - l) <= Math.abs(seamL[q2] - l)) q2++;
      seamD[j] = Math.abs(l - seamL[q2]); seamN[j] = l < seamL[q2] ? seamA[q2] : seamB[q2]; seamS[j] = l < seamL[q2] ? -1 : 1; seamTau[j] = seamT[q2];
    }
  }
  return { tau, cnt, count, seamD, seamN, seamS, seamTau, rRef };
}

// Seeds for cell patterns, in rows of height h (in Y), each row with its own count (see makeCourses).
function makeVoronoi(S, rowsY, jitter, countOf) {
  const h = Math.sqrt(3) / 2;
  const k0 = -3, k1 = Math.ceil(rowsY / h) + 3, nk = k1 - k0 + 1;
  const cnt = new Int32Array(nk), base = new Int32Array(nk);
  let tot = 0;
  for (let k = k0; k <= k1; k++) { cnt[k - k0] = countOf(k); base[k - k0] = tot; tot += cnt[k - k0]; }
  const sx = new Float64Array(tot), sy = new Float64Array(tot);
  const jit = clamp(jitter, 0, 1) * 0.9;
  for (let k = k0; k <= k1; k++) {
    const off = (k & 1) * 0.5, Nk = cnt[k - k0];
    for (let m = 0; m < Nk; m++) {
      const id = base[k - k0] + m;
      sx[id] = m + off + (hash(m, k, S.seed) - 0.5) * jit;
      sy[id] = k * h + (hash(m + 7919, k, S.seed) - 0.5) * jit * h;
    }
  }
  return { h, k0, k1, sx, sy, cnt, base };
}

const C_X = new Float64Array(32), C_Y = new Float64Array(32), C_I = new Int32Array(32), C_N = new Int32Array(32);
// offset from the sample to the owning seed (in the sample's cell units), its id, and its row's count
let V_SX = 0, V_SY = 0, V_ID = 0, V_N = 1;
// where the sample is along the wall (mm) and how many mm one unit of Y is there: seeds placed along the wall
// (V.sl) are measured from it in mm, so distances stay true where rows of different counts meet
let V_LP = 0, V_VS = 1;

// Physical distance from (X, Y) to the nearest edge of its Voronoi cell.
// The highest point of each cell's opening, the cell shrunk by the strip half-width, relative to its seed in
// units where the cell's shape is true (x = X, y = Y * stretch; multiply by the row's cell size for mm).
// A cell is convex, so a 50° roof from this point leaves no flatter ceiling anywhere in the opening.
function voronoiTops(V, stretch, halfWAt) {
  const n = V.sx.length, tx = new Float64Array(n), ty = new Float64Array(n), ex = [], ey = [], eb = [];
  for (let k = V.k0; k <= V.k1; k++) {
    const Nk = V.cnt[k - V.k0];
    for (let m = 0; m < Nk; m++) {
      const id = V.base[k - V.k0] + m, sx = V.sx[id], sy = V.sy[id], hw = halfWAt(sy, Nk);
      ex.length = ey.length = eb.length = 0;
      for (let kk = k - 2; kk <= k + 2; kk++) {
        if (kk < V.k0 || kk > V.k1) continue;
        // (a neighbour row may have another count: its seeds are measured in this row's cells)
        const Nq = V.cnt[kk - V.k0], bq = V.base[kk - V.k0], xq = (sx / Nk) * Nq, f = Nk / Nq, mc = Math.round(xq);
        for (let mm = mc - 3; mm <= mc + 3; mm++) {
          const nid = bq + (((mm % Nq) + Nq) % Nq);
          if (nid === id) continue;
          let dx = V.sx[nid] - xq; if (dx > Nq * 0.5) dx -= Nq; else if (dx < -Nq * 0.5) dx += Nq;
          dx *= f;
          const dy = V.sl ? (V.sl[nid] - V.sl[id]) / V.sc[id] : (V.sy[nid] - sy) * stretch, L = Math.hypot(dx, dy);
          if (L < 1e-9) continue;
          // half-plane: p . e <= |e|^2 / 2 - hw |e|   (inside the cell, at least hw from its edge)
          ex.push(dx); ey.push(dy); eb.push((L * L) / 2 - hw * L);
        }
      }
      let bx = 0, by = -Infinity;
      for (let a = 0; a < ex.length; a++) for (let b = a + 1; b < ex.length; b++) {
        const det = ex[a] * ey[b] - ey[a] * ex[b];
        if (Math.abs(det) < 1e-12) continue;
        const x = (eb[a] * ey[b] - ey[a] * eb[b]) / det, y = (ex[a] * eb[b] - eb[a] * ex[b]) / det;
        if (y <= by) continue;
        let ok = true;
        for (let c = 0; c < ex.length && ok; c++) if (ex[c] * x + ey[c] * y > eb[c] + 1e-9) ok = false;
        if (ok) { bx = x; by = y; }
      }
      tx[id] = bx; ty[id] = by; // -Infinity: the strips swallow the whole cell
    }
  }
  return { tx, ty };
}

// The seeds near (X, Y), with X in cells of a row of N; each row's seeds in their own row's count.
function seedsNear(V, N, X, Y, dk, dm) {
  const kc = Math.round(Y / V.h), th = X / N;
  let nc = 0;
  for (let k = kc - dk; k <= kc + dk; k++) {
    if (k < V.k0 || k > V.k1) continue;
    const Nk = V.cnt[k - V.k0], base = V.base[k - V.k0], off = (k & 1) * 0.5, Xk = th * Nk, f = N / Nk, mc = Math.round(Xk - off);
    for (let m = mc - dm; m <= mc + dm; m++) {
      let mm = m % Nk; if (mm < 0) mm += Nk;
      const id = base + mm;
      let dx = V.sx[id] - Xk;
      if (dx > Nk * 0.5) dx -= Nk; else if (dx < -Nk * 0.5) dx += Nk;
      C_X[nc] = dx * f; C_Y[nc] = V.sl ? (V.sl[id] - V_LP) / V_VS : V.sy[id] - Y; C_I[nc] = id; C_N[nc] = Nk; nc++;
    }
  }
  return nc;
}
function evalVoronoi(V, N, X, Y, stretch, scale, kR) {
  const nc = seedsNear(V, N, X, Y, 1, 2);
  let best = 0, bd = Infinity;
  for (let c = 0; c < nc; c++) { const d = C_X[c] * C_X[c] + C_Y[c] * C_Y[c]; if (d < bd) { bd = d; best = c; } }
  const bx = C_X[best], by = C_Y[best];
  V_SX = bx; V_SY = by; V_ID = C_I[best]; V_N = C_N[best];
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
  const nc = seedsNear(V, N, X, Y, 1, 1);
  let bd = Infinity;
  for (let c = 0; c < nc; c++) { const d = C_X[c] * C_X[c] + C_Y[c] * C_Y[c]; if (d < bd) { bd = d; V_SX = C_X[c]; V_SY = C_Y[c]; V_ID = C_I[c]; V_N = C_N[c]; } }
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
  const edgeBot = opts.edgeBot || null;
  const Dsp = mode === 'cut' && !(S.bulge > 0) && pid !== 'wicker' && !edge && !edgeBot ? null : new Float32Array(n * NU);
  // swirl: the whole pattern turns around the piece by this much from bottom to top (opts.unswirl
  // cancels a twist of the shape, in turns, so openings stay upright when the outline twists)
  // (the user's swirl runs along the pattern's own up-the-wall coordinate, so it winds at the same angle on a
  // narrow neck as on a wide belly; cancelling a twist follows the height, like the twist itself)
  const swirlTurns = (S.swirl || 0) / 360, unswirlTurns = opts.unswirl || 0, zTop = Math.max(1e-6, rows.z[rows.n - 1]);
  const Din = edge || edgeBot ? new Float32Array(n * NU) : null;
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

  // The coordinate along the meridian, t: conformal within each course (one unit = one cell's width there),
  // and the count of cells round each course (see makeCourses). With even sizing off, one course: the
  // same number all the way round, and the cells shrink where the piece narrows.
  const even = opts.even ?? S.sizing !== 'count';
  const fam = PATTERN_ROWS[pid] || 'blend', fine = FINE_ROWS.has(fam);
  const cotA0 = 1 / Math.tan((clamp(S.angle, 5, 85) * Math.PI) / 180);
  const rowT = { lattice: 0.5 / cotA0, prism: 0.5 / cotA0, quilt: 0.5 / cotA0, ogee: stretch, wicker: stretch, chevron: stretch, weave: stretch, herringbone: stretch,
    cubes: 0.866 * stretch, facets: 0.866 * stretch, tiles: 0.5 * stretch, blocks: 0.5 * stretch, petals: 0.5 * stretch, seigaiha: 0.5 * stretch, knit: stretch }[pid]
    ?? (fam === 'seeds' ? 0.866 * stretch : 0.5);
  const rowP = { chevron: -0.5 * stretch, cubes: 0.433 * stretch, petals: -0.25 * stretch, seigaiha: -0.25 * stretch }[pid] ?? (fam === 'seeds' ? -0.433 * stretch : 0);
  const courseOpts = { even, unit: rowT, phase: rowP, fine, halve: fam === 'flute', pairs: pid === 'weave', seams: !fine && fam !== 'strand' };
  let C = makeCourses(rows, perim, N, courseOpts);
  // arches: whole rows that exactly fill the space between the rims (the rows are the courses, so this
  // settles in a pass or two)
  let tauBot = 0, archH = 1.6 * stretch;
  if (pid === 'arches') {
    let archRows = 0;
    for (let pass = 0; pass < 5; pass++) {
      const tb = interpTau(rows, C.tau, Math.max(0, bandB)), tt = interpTau(rows, C.tau, Math.max(0, L - Math.max(0, bandT)));
      const span = Math.max(0.5, tt - tb);
      if (!archRows) archRows = Math.max(1, Math.round(span / (1.6 * stretch)));
      const h2 = span / archRows;
      if (pass && Math.abs(tb - tauBot) < 1e-4 && Math.abs(h2 - archH) < 1e-4) break;
      tauBot = tb; archH = h2;
      C = makeCourses(rows, perim, N, { ...courseOpts, unit: archH, phase: tauBot });
    }
  }
  const tau = C.tau, cntRow = C.cnt, rowCount = C.count, seamD = C.seamD, seamN = C.seamN, seamS = C.seamS, seamTau = C.seamTau, rRefP = C.rRef * perim;
  const tauMax = tau[n - 1];
  // the vertical coordinate of the organic patterns, in radians of the widest circle (or, with even sizing
  // off, conformal as before)
  const vArr = Float64Array.from(rows.l, (l, j) => (even ? l / Math.max(1e-6, rRefP) : (TAU * tau[j]) / N));
  // a rib's lean, as turns round the piece (so ribs keep their angle, and stay in line where they halve)
  const helix = new Float64Array(n);
  for (let j = 1; j < n; j++) helix[j] = helix[j - 1] + ((rows.l[j] - rows.l[j - 1]) * tanB) / (TAU * Math.max(0.5, 0.5 * (rows.r[j] + rows.r[j - 1])) * perim);
  const w0 = (TAU * rRefP) / N;
  let scMin = Infinity;
  let V = null;
  // seeds, placed along the wall: each one's arc length and the cell's width in mm in its row
  const seedRows = (jit) => {
    const Vs = makeVoronoi(S, tauMax / stretch, jit, rowCount);
    if (!even) return Vs;
    const nS = Vs.sx.length, rate0 = (tau[1] - tau[0]) / Math.max(1e-9, rows.l[1] - rows.l[0]), rate1 = (tau[n - 1] - tau[n - 2]) / Math.max(1e-9, rows.l[n - 1] - rows.l[n - 2]);
    Vs.sl = new Float64Array(nS); Vs.sc = new Float64Array(nS);
    for (let k = Vs.k0; k <= Vs.k1; k++) {
      const Nk = Vs.cnt[k - Vs.k0];
      for (let m = 0; m < Nk; m++) {
        const id = Vs.base[k - Vs.k0] + m, ts = Vs.sy[id] * stretch;
        let ls, rs;
        if (ts <= 0) { ls = ts / Math.max(1e-9, rate0); rs = rows.r[0]; }
        else if (ts >= tauMax) { ls = rows.l[n - 1] + (ts - tauMax) / Math.max(1e-9, rate1); rs = rows.r[n - 1]; }
        else {
          let lo = 0, hi = n - 1;
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tau[mid] <= ts) lo = mid; else hi = mid; }
          const w = (ts - tau[lo]) / Math.max(1e-12, tau[hi] - tau[lo]);
          ls = rows.l[lo] + (rows.l[hi] - rows.l[lo]) * w; rs = rows.r[lo] + (rows.r[hi] - rows.r[lo]) * w;
        }
        Vs.sl[id] = ls; Vs.sc[id] = (TAU * Math.max(0.5, rs) * perim) / Nk;
      }
    }
    return Vs;
  };
  if (pid === 'voronoi' || pid === 'honeycomb') V = seedRows(pid === 'honeycomb' ? 0 : S.jitter);
  // the top of every opening, for pointed roofs that really cover it: strip half-width in cell units at
  // the seed's height (cells scale with the radius, the strips do not)
  let vTops = null;
  if (pid === 'voronoi' && mode === 'cut' && S.arch) {
    vTops = voronoiTops(V, stretch, (sy, Nk) => {
      const t = sy * stretch;
      let j = 0; while (j < n - 1 && tau[j + 1] < t) j++;
      return Math.max(0.3, ((S.width || 2) / 2) / ((TAU * rows.r[j] * perim) / Nk));
    });
  }
  if (pid === 'dots') V = seedRows(S.jitter || 0);
  if (pid === 'hammered' || pid === 'rings') V = seedRows(pid === 'rings' ? 0.95 : S.jitter ?? 0.85);
  if (pid === 'gouge') V = seedRows(S.jitter ?? 0.8);
  if (pid === 'carved') V = seedRows(0);

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
  // Relief gets shallower where the wall leans out: there is less room under each feature before it
  // overhangs, and filling under deep features there drags them into long streaks. Full depth up to
  // about 20°, two thirds at 30°, a quarter at 40°, almost none at 44°. (The base chamfer takes the
  // depth of the wall just above it.)
  const leanK = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    const tl = Math.max(0, -rows.nz[j]) / Math.max(1e-3, rows.nr[j]);
    leanK[j] = mode === 'relief' && !opts.keepDepth ? clamp((1 - tl) / 0.65, 0.04, 1) : 1;
  }
  let jFreeze = 0;
  while (jFreeze < n - 1 && rows.l[jFreeze] < freezeL) jFreeze++;
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
    const dep = depth * Math.max(0, grad) * fadeLo * fadeHi * leanK[frozen ? jFreeze : j];
    const wavePhase = waveA * Math.sin(TAU * waveF * lt);
    const Y = t / stretch;
    // this course's count round, and the cell's width in mm
    const NN = frozen ? cntRow[jFreeze] : cntRow[j];
    const Sc = (TAU * r) / NN;
    V_LP = frozen ? freezeL : l; V_VS = Sc * stretch;
    if (l >= bandB && l <= L - bandT && Sc < scMin) scMin = Sc;
    const bulgeFade = smoothstep(0, 2, -(cellFill ? rimG : bandG));
    const swT = swirlTurns * (tau[j] / Math.max(1e-6, tauMax)) + unswirlTurns * (rows.z[j] / zTop);
    // where the count steps: how far this row is from the seam (mm), the count across it, and how much of
    // that other course an organic pattern blends in (half, right at the seam)
    const dS = seamD ? seamD[j] : Infinity, No = seamN ? seamN[j] : NN;
    // (over the wider of the two cells: a rib that tapers out takes a cell and a half to do it)
    const wB = (fam === 'blend' || fam === 'flute') && seamD ? 0.5 * (1 - smoothstep(0, (fam === 'flute' ? 1.5 : 0.6) * ((TAU * r) / Math.min(NN, No)), dS)) : 0;
    // Openwork just under that strut: the strut cuts cells in half, and each half gets a pointed top (two
    // 50° lines up to a point at its middle), so none has a flat ceiling. The cells' sides meet the strut at
    // these points round the piece (in cells, from 0 to 1): diamonds' corners, and a prism's mullions.
    const underSeam = mode === 'cut' && seamD && seamS[j] < 0 && dS < Sc;
    let walls = null;
    if (underSeam) {
      const v0 = fract(-seamTau[j] * cotA0);
      walls = pid === 'ogee' ? [0, 0.5] : pid === 'prism' ? (S.alt ? [0, v0] : [0, 0.5, v0, fract(v0 + 0.5)]) : [v0];
      walls = [...new Set(walls.map((w) => Math.round(fract(w) * 1e6) / 1e6))].sort((a, b) => a - b);
    }
    // how far (mm, round the piece) a point is from the middle of the half cell it is in
    const offMid = (sg) => {
      const f = fract(sg);
      let a = walls[walls.length - 1] - 1, b = walls[0];
      for (let q = 0; q < walls.length; q++) { if (walls[q] <= f) a = walls[q]; if (walls[q] > f) { b = walls[q]; break; } if (q === walls.length - 1) b = walls[0] + 1; }
      return Math.abs(f - (a + b) / 2) * Sc;
    };

    for (let i = 0; i < NU; i++) {
      // th: turns round the piece; sig: the same in this course's cells
      const th = i / NU + swT;
      let sig = NN * th;
      sig -= Math.floor(sig / NN) * NN;
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
          // where the count steps, a strut runs round the piece and the diamonds meet it at their points
          const d0 = d;
          if (dS < 1e3) d = smin(d, dS, kR);
          g = halfW - d;
          if (underSeam) bandHere = Math.max(bandHere, halfW + 1.19 * offMid(sig) - dS);
          h = crest(d / Math.max(0.2, fill * Sc * sinA * (pid === 'prism' ? 0.3 : 0.5)), prof);
          break;
        }
        case 'ogee': {
          const ph = (TAU * t) / ogP, sn = Math.sin(ph);
          const slope = ((ogA * TAU) / ogP) * Math.cos(ph), corr = 1 / Math.sqrt(1 + slope * slope);
          const x1 = sig - ogA * sn, x2 = sig + ogA * sn - 0.5;
          let d = smin(Math.abs(x1 - Math.round(x1)) * Sc * corr, Math.abs(x2 - Math.round(x2)) * Sc * corr, kR);
          const d0 = d;
          if (dS < 1e3) d = smin(d, dS, kR);
          g = halfW - d;
          if (underSeam) bandHere = Math.max(bandHere, halfW + 1.19 * offMid(sig) - dS);
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
          if (pid === 'ribs') {
            // the lean and the wave, as turns round the piece (with even sizing off: as before)
            const offT = even ? helix[j] + (wavePhase * w0) / (TAU * r) : (t * tanB + wavePhase) / NN;
            s = NN * (th + offT); d = Math.abs(s - Math.round(s)) * Sc * cosB;
            g = halfW - d;
            h = crest(d / Math.max(0.2, fill * Sc * cosB * 0.5), prof);
            // where the count halves, every other rib tapers out and the rest widen to fill the space
            if (wB > 0) { const s2 = No * (th + offT), d2 = Math.abs(s2 - Math.round(s2)) * ((TAU * r) / No) * cosB; h = (1 - wB) * h + wB * crest(d2 / Math.max(0.2, fill * ((TAU * r) / No) * cosB * 0.5), prof); }
          } else {
            s = sig + chA * (1 - 4 * Math.abs(fract(t / chP + 0.25) - 0.5)); d = Math.abs(s - Math.round(s)) * Sc * cosZ;
            g = halfW - d;
            h = crest(d / Math.max(0.2, fill * Sc * cosZ * 0.5), prof);
          }
          const arch = follow && mode === 'cut' ? (Sc * 0.5 - Math.abs(s - Math.round(s)) * Sc) * archK : 0;
          if (follow && mode === 'cut') {
            // pointed slot ends: steep enough on the downhill side of a leaning slot to stay under 46°
            bandHere = Math.max(bandB - l + arch, l - (lTop - bandT) + arch);
          }
          // where the count steps, the slots end in a strip round the piece (pointed toward it, both ways)
          if (mode === 'cut' && dS < 1e3) bandHere = Math.max(bandHere, halfW + arch - dS);
          break;
        }
        case 'reeds': {
          const reed = (Nz) => {
            const sz = Nz * th, Scz = (TAU * r) / Nz, m = Math.round(sz), d = Math.abs(sz - m) * Scz;
            let mm = m % Nz; if (mm < 0) mm += Nz;
            const nodeP = Math.max(6, L / Math.max(1, rowsN));
            const ph = l / nodeP + hash(mm, 17, S.seed);
            const node = smoothstep(1.8, 0, Math.abs(ph - Math.round(ph)) * nodeP);
            return crest(d / Math.max(0.2, fill * Scz * 0.5), prof) * (0.84 + 0.16 * node);
          };
          // where the count halves, every other reed tapers out
          h = wB > 0 ? (1 - wB) * reed(NN) + wB * reed(No) : reed(NN);
          break;
        }
        case 'voronoi':
        case 'honeycomb': {
          const d = evalVoronoi(V, NN, sig, Y, stretch, Sc, kR);
          g = halfW - d;
          h = crest(d / halfW, prof);
          if (mode === 'cut' && S.arch) {
            // 50° pointed roof over each opening so it prints without bridging, from the top of the
            // actual opening (cells are irregular, so it is worked out per cell)
            if (vTops) {
              // (measured in the cells of the seed's own row)
              const px = (-V_SX * V_N) / NN, py = -V_SY * stretch, ty = vTops.ty[V_ID];
              g = ty === -Infinity ? Math.max(g, 1) : Math.max(g, ((py - ty + 1.2 * Math.abs(px - vTops.tx[V_ID])) * Sc) / 1.562);
            } else {
              const apex = (V_SY + 0.48) * stretch * Sc;
              g = Math.max(g, halfW - (apex - 1.2 * Math.abs(V_SX) * Sc));
            }
          }
          break;
        }
        case 'dots': {
          nearestSeed(V, NN, sig, Y);
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
          // (where the count steps, the wiggle blends from one count into the other)
          const wig = wB > 0 ? (1 - wB) * Math.sin(TAU * sig) + wB * Math.sin(TAU * No * th) : Math.sin(TAU * sig);
          const s = rowsN * lt + waveA * wig;
          const d = Math.abs(s - Math.round(s));
          h = crest(d / (0.5 * fill), prof);
          break;
        }
        case 'topo': {
          // u: the angle round; v: up the wall (see vArr). The waves round are scaled to the course's count.
          const u = TAU * th, v = vArr[j];
          let val = 0, gu = 0, gv = 0;
          const sum = (Nz, wt) => {
            const k = Nz / N;
            for (const w of topo) {
              const a = k === 1 ? w.a : Math.sign(w.a) * Math.max(1, Math.round(Math.abs(w.a) * k));
              const arg = a * u + w.b * v + w.p, c = Math.cos(arg);
              val += wt * w.w * Math.sin(arg); gu += wt * w.w * a * c; gv += wt * w.w * w.b * c;
            }
          };
          sum(NN, 1 - wB); if (wB > 0) sum(No, wB);
          const lv = val * topoLv;
          const dn = Math.abs(lv - Math.round(lv)) / topoLv;
          const vmm = even ? rRefP : r;
          const dmm = dn / Math.max(0.25 / r, Math.hypot(gu / r, gv / vmm));
          h = crest(dmm / halfW, prof);
          break;
        }
        case 'hammered':
        case 'carved': {
          // a concave dish in every cell, meeting its neighbours in crisp ridges
          const D = evalVoronoi(V, NN, sig, Y, stretch, Sc, 0);
          const F1 = Math.sqrt((V_SX * Sc) ** 2 + (V_SY * stretch * Sc) ** 2);
          const tt = clamp(F1 / Math.max(1e-6, F1 + D), 0, 1);
          h = prof === 1 ? tt : prof === 2 ? smoothstep(0, 1, tt) : Math.pow(tt, pid === 'carved' ? 1.45 : 1.7);
          break;
        }
        case 'rings': {
          // ripples spreading from scattered drops, merging where they meet
          const nc = seedsNear(V, NN, sig, Y, 1, 2);
          let F = Infinity;
          for (let c = 0; c < nc; c++) { const dy = C_Y[c] * stretch; F = smin(F, Math.sqrt(C_X[c] * C_X[c] + dy * dy) * Sc, (S.width || 4) * 1.6); }
          const lam = Math.max(1.5, S.width || 4);
          const xr = Math.abs(fract(F / lam) - 0.5) * 2;
          h = crest(1 - xr / Math.max(0.2, fill), prof);
          break;
        }
        case 'dunes': {
          // wind ripples: a long gentle rise facing down and a short steep fall facing up, so they print
          const u = TAU * th, v = vArr[j];
          let w = 0;
          for (let z = 0; z < (wB > 0 ? 2 : 1); z++) {
            const k = (z ? No : NN) / N, wt = wB > 0 ? (z ? wB : 1 - wB) : 1;
            for (let qi = 0; qi < warp.length; qi++) {
              const q = warp[qi];
              w += wt * q.w * Math.sin((k === 1 ? q.a : Math.sign(q.a) * Math.max(1, Math.round(Math.abs(q.a) * k))) * u + q.b * v + q.p);
            }
          }
          const ph = fract(rowsN * lt + waveA * w);
          const fall = 0.28;
          h = ph < 1 - fall ? smoothstep(0, 1, ph / (1 - fall)) : smoothstep(0, 1, (1 - ph) / fall);
          break;
        }
        case 'bark': {
          // vertical ridges that wander, split and change depth like tree bark (where the count steps, the
          // ridges of the two courses blend into each other)
          const u = TAU * th, v = vArr[j];
          const ridge = (Nz) => {
            const k = Nz / N, sz = Nz * th, Scz = (TAU * r) / Nz;
            let w = 0;
            for (const q of warp) w += q.w * Math.sin((k === 1 ? q.a : Math.sign(q.a) * Math.max(1, Math.round(Math.abs(q.a) * k))) * u + q.b * v + q.p);
            const s = sz + waveA * w * 0.6;
            const m = Math.round(s), d = Math.abs(s - m) * Scz;
            let mm = m % Nz; if (mm < 0) mm += Nz;
            const seg = 0.55 + 0.45 * Math.sin(t * 0.9 + hash(mm, 5, S.seed) * TAU) * Math.sin(t * 0.37 + hash(mm, 9, S.seed) * TAU);
            return crest(d / Math.max(0.2, fill * Scz * 0.5), prof) * clamp(seg, 0.2, 1);
          };
          h = wB > 0 ? (1 - wB) * ridge(NN) + wB * ridge(No) : ridge(NN);
          break;
        }
        case 'knit': {
          // (each row of stitches has its own count: rows of fewer stitches decrease, as on a knitted hat)
          const k0 = Math.floor(Y);
          for (let k = k0 - 1; k <= k0 + 1; k++) {
            const sk = rowCount(k) * th, m0 = Math.floor(sk);
            for (let m = m0 - 1; m <= m0 + 1; m++) for (let side = 0; side < 2; side++) {
              const dx = sk - (m + (side ? 0.74 : 0.26)), dy = Y - (k + 0.5);
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
          let topN = NN;
          for (let k = kc - 1; k <= kc + 2 && under < 0; k++) {
            // (each row of scales has its own count, so they keep their size, like roof tiles on a dome)
            const Nk = rowCount(k), sk = Nk * th, off = (k & 1) * 0.5, dy = Y - k * rowH;
            const mc = Math.round(sk - off);
            for (let m = mc - 1; m <= mc + 1; m++) {
              let dx = sk - (m + off);
              dx -= Math.round(dx / Nk) * Nk;
              const dd = Math.sqrt(dx * dx + dy * dy) / rho;
              if (dd < 1) { if (top < 0) { top = dd; topN = Nk; } else { under = dd; break; } }
            }
          }
          const sh = (dd) => (dd < 0 ? 0 : Math.pow(dd, 1.6) * (prof === 2 ? smoothstep(1, 0.9, dd) : 1));
          // a cliff would alias into a saw-tooth on any grid; a 0.7 mm ramp prints as a crisp step
          const ramp = top < 0 ? 0 : smoothstep(1, 1 - 0.7 / ((rho * TAU * r) / topN), top);
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
          if (lx > NN * 0.5) lx -= NN; else if (lx < -NN * 0.5) lx += NN;
          const ang = (Math.atan2(ly, lx) * 180) / Math.PI;
          const v = (deg) => [R * Math.cos((deg * Math.PI) / 180), R * Math.sin((deg * Math.PI) / 180)];
          const [s1, s2] = ang >= 30 && ang < 150 ? [v(30), v(150)] : ang >= -90 && ang < 30 ? [v(-90), v(30)] : [v(150), v(-90)];
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
            const Nk = V.cnt[k - V.k0], base = V.base[k - V.k0], off = (k & 1) * 0.5, sk = Nk * th, f = NN / Nk, mc = Math.round(sk - off);
            for (let m = mc - 1; m <= mc + 1; m++) {
              let mm = m % Nk; if (mm < 0) mm += Nk;
              let dx = sk - V.sx[base + mm];
              if (dx > Nk * 0.5) dx -= Nk; else if (dx < -Nk * 0.5) dx += Nk;
              dx *= f;
              const dy = V.sl ? (V_LP - V.sl[base + mm]) / Sc : (Y - V.sy[base + mm]) * stretch;
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
          let topN = NN;
          for (let k = kc - 1; k <= kc + 2 && under < 0; k++) {
            // (each row of scales has its own count, so they keep their size, like roof tiles on a dome)
            const Nk = rowCount(k), sk = Nk * th, off = (k & 1) * 0.5, dy = Y - k * rowH;
            const mc = Math.round(sk - off);
            for (let m = mc - 1; m <= mc + 1; m++) {
              let dx = sk - (m + off);
              dx -= Math.round(dx / Nk) * Nk;
              const dd = Math.sqrt(dx * dx + dy * dy) / rho;
              if (dd < 1) { if (top < 0) { top = dd; topN = Nk; } else { under = dd; break; } }
            }
          }
          const fan = (dd) => (dd < 0 ? 0 : 0.3 + 0.7 * crest(Math.abs(fract(dd * nR + 0.5) - 0.5) * 2 / Math.max(0.3, fill), prof));
          const ramp = top < 0 ? 0 : smoothstep(1, 1 - 0.7 / ((rho * TAU * r) / topN), top);
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
            let w = mm % NN; if (w < 0) w += NN;
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
          let mm = m % NN; if (mm < 0) mm += NN;
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
      // where a running pattern's count steps, a fine plain line round the piece
      if (fam === 'groove' && dS < 1e3) h *= smoothstep(0.35, 0.35 + Math.max(1, depth * 0.8), dS);
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
      if (edgeBot && l < edgeBot.zone) { Dsp[id] += edgeBot.out(l); Din[id] += edgeBot.inn(l); }
      F[id] = Math.abs(fv) < 1e-4 ? (fv < 0 ? -1e-4 : 1e-4) : fv;
    }
  }
  if (cellFill) fillRimHoles(F, NU, n, zoneMask, 0.5);
  return { F, D: mode === 'none' && !edge && !edgeBot ? null : Dsp, Din, scMin, counts: cntRow };
}
function smax(a, b, k) { return -smin(-a, -b, k); }

// Everything that happens to the relief field between sampling and meshing.
// Creases are rounded to a small fillet first (a fixed size in mm, so the shape does not depend on the
// grid): flat triangles can follow a rounded crease, while a sharp one at an angle to the grid always
// turns into a staircase that the printer reproduces. Then undersides are held at 45°.
const RELIEF_FILLET = 0.45;
function processRelief(D, rows, NU, o) {
  const lim = () => limitUndersides(D, rows, NU, o.sec, o.twist, o.H, o.fillBelow, 45.5, o.slide, o.skipOverhung);
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
// skipOverhung: where the bare wall itself leans past the limit (a globe's underside, printed on supports),
// the relief there is left as it is
function limitUndersides(D, rows, NU, sec, twist = 0, H = 0, fillBelow = 0, deg = 45.5, slide = null, skipOverhung = false) {
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
      // a flat-backed row moves toward +y between the rows: its part along the normal is outward travel
      const dSl = slide ? slide.all[j + 1] - slide.all[j] : 0;
      const dR = above - below + dSl * NY[i];
      const raw = (rows.z[j + 1] - rows.z[j]) * T - dR;
      if (skipOverhung && raw < 0) continue;
      const allow = rows.l[j + 1] <= fillBelow ? raw : Math.max(0, raw);
      const need = D[(j + 1) * NU + i] - allow;
      if (!twist && sec.round && !slide) { const a = j * NU + i; if (D[a] < need) D[a] = need; continue; }
      // the point straight under this one: a twist turns the row round, and on the flank of a shaped
      // outline a widening (or narrowing) wall slides sideways as well, by the radius change times the
      // outline's tangential component (in columns: that distance over the row's column spacing)
      const kT = CY[i] * NX[i] - CX[i] * NY[i], rj = Math.max(1e-3, rows.r[j]);
      const s = i + (-dphi[j] * kN + ((rows.r[j + 1] - rows.r[j]) * kT + dSl * NX[i]) / rj) * colsPerRad, f = Math.floor(s), w = s - f;
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
// floor: { type: 'solid' | 'hole' | 'open', thick, holeR }; top: 'rim' | 'cap' | 'pocket' | 'dome' | 'cut'
// opts: { sec, twist (radians over the full height), H, zShift }
function buildShell(rows, NU, F, D, t, floor, top, opts = {}) {
  const NR = rows.n;
  const NC = NU * NR, NHE = NU * NR, NVE = NU * (NR - 1);
  const K = NC + NHE + NVE;
  const sec = opts.sec || ROUND();
  const { CX, CY, NX, NY, A: ANG } = sectionColumns(sec, NU);
  const zShift = opts.zShift ? opts.zShift(NU, ANG) : null;
  const Din = opts.Din || null, slide = opts.slide || null;

  // each row: outline scale r, outward offset off, twist angle; inner wall sits t further in
  const off = new Float64Array(NR), offIn = new Float64Array(NR), zIn = new Float64Array(NR), zw = new Float64Array(NR);
  const cphi = new Float64Array(NR), sphi = new Float64Array(NR);
  // a flat-backed piece: how far each row's inside has moved toward the wall, and, where rows of the inside
  // are collapsed onto one line at a flared rim, the outline scale they all take there (so that they
  // really are one line all the way round a D, whose back does not move with its radius)
  const slIn = slide ? Float64Array.from(slide.all, (a, j) => a + slide.inAll[j]) : null, colR = slide ? new Float64Array(NR) : null;
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
    if (top !== 'dome') zIn[NR - 1] = rows.z[NR - 1];
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
    // (a twist swings the flanks of a shaped outline out too: count that as widening)
    let kT = 0;
    if (opts.twist) for (let i = 0; i < NU; i++) kT = Math.max(kT, Math.abs(CY[i] * NX[i] - CX[i] * NY[i]));
    for (let j = 1; j < NR; j++) {
      const dr = rows.r[j] - rows.r[j - 1];
      const swing = kT ? (rows.r[j] * kT * Math.abs(opts.twist) * (rows.z[j] - rows.z[j - 1])) / Htot : 0;
      const dRin = dr * (dr >= 0 ? kHi : kLo) + offIn[j] - offIn[j - 1] + swing;
      // (at 45°: the outside is eased to 44°, so an even wall never trips this; a stricter limit here
      // pushed a bowl's inside up row after row until the rows piled up into folds under the rim)
      zIn[j] = Math.max(zIn[j], zIn[j - 1] + Math.max(dRin, 1e-3));
    }
  }
  if (top === 'rim' || top === 'cap') zIn[NR - 1] = rows.z[NR - 1];
  // A wall that flares out at the rim has its inside higher than its outside, so the inner surface would
  // pass the rim: it ends where it meets the rim plane, and the rows beyond collapse onto that line
  // (instead of folding back over it, which left a strip of downward-facing faces around the rim).
  if (top === 'rim') {
    const zTop = rows.z[NR - 1];
    let b = NR - 1;
    while (b > 1 && zIn[b - 1] >= zTop) b--;
    if (b < NR - 1) {
      const a = b - 1, f = clamp((zTop - zIn[a]) / Math.max(1e-9, zIn[b] - zIn[a]), 0, 1);
      const rc = rows.r[a] + (rows.r[b] - rows.r[a]) * f, oc = offIn[a] + (offIn[b] - offIn[a]) * f;
      const slc = slide ? slIn[a] + (slIn[b] - slIn[a]) * f : 0;
      for (let j = b; j < NR; j++) { offIn[j] = oc + (rc - rows.r[j]); zIn[j] = zTop; if (slide) { colR[j] = rc; slIn[j] = slc; } }
    }
  }
  // The same at the bottom of an open piece (rings, lamp shades) whose wall narrows going up: its inside
  // starts lower than its outside, under the bed, so it starts where it meets the base plane instead.
  if (floor.type === 'open' && !floor.cut) {
    const z0 = rows.z[0];
    let b = 0;
    while (b < NR - 2 && zIn[b + 1] <= z0) b++;
    if (b > 0) {
      const a = b + 1, f = clamp((z0 - zIn[b]) / Math.max(1e-9, zIn[a] - zIn[b]), 0, 1);
      const rc = rows.r[b] + (rows.r[a] - rows.r[b]) * f, oc = offIn[b] + (offIn[a] - offIn[b]) * f;
      const slc = slide ? slIn[b] + (slIn[a] - slIn[b]) * f : 0;
      for (let j = 0; j <= b; j++) { offIn[j] = oc + (rc - rows.r[j]); zIn[j] = z0; if (slide) { colR[j] = rc; slIn[j] = slc; } }
    }
  }
  // a dome that comes to a sharp tip is tighter than the wall is thick: its inside stays open all the same
  // (a D is only as deep as its front and back are apart: the inside keeps to less than half of that)
  if (opts.dome) { const kG = slide ? (0.85 * (1 + slide.b)) / 2 : 0.85; for (let j = 0; j < NR; j++) offIn[j] = Math.max(offIn[j], off[j] - kG * rows.r[j]); }
  // keep the inner wall monotone so a flared rim or floor never folds over itself
  for (let j = NR - 2; j >= 0; j--) if (zIn[j] > zIn[j + 1] - 1e-3) zIn[j] = zIn[j + 1] - 1e-3;
  for (let j = 1; j < NR; j++) if (zIn[j] < zIn[j - 1] + 1e-3) zIn[j] = zIn[j - 1] + 1e-3;
  // Where the wall bends sharply inward (a tight belly under the rim), the inside, a wall's thickness in,
  // folds back on itself, and keeping it monotone flattens the fold into a little ceiling. Going up, the
  // inside may step in no faster than 45°: the wall is a little thinner across the bend instead.
  // (A closed globe's dome leans past 45° on purpose, and is printed with supports: every colour band of
  // a domed piece is left as it is, so the bands still meet exactly.)
  if (!opts.dome) {
    for (let j = 1; j < NR; j++) {
      const rPrev = rows.r[j - 1] + offIn[j - 1], rIn = rows.r[j] + offIn[j], lo = rPrev - (zIn[j] - zIn[j - 1]);
      if (rIn < lo) offIn[j] += Math.min(lo, rows.r[j] + off[j] - 0.8) - rIn;
    }
  }

  const mesh = new Mesh(NC * 2.4, NC * 4.4);
  const mapO = new Int32Array(K).fill(-1), mapI = new Int32Array(K).fill(-1), mapW = new Int32Array(2 * K).fill(-1);
  let px = 0, py = 0, pz = 0;

  function corner(i, j, inner) {
    let o, zz;
    if (inner) { o = offIn[j] + (Din ? Din[j * NU + i] : 0); zz = zIn[j]; }
    else if (opts.normalRelief && D && opts.bedK) {
      // (it follows the surface only where the wall leans in, as a dome does; where the wall leans out, and
      // just above the bed, it stands straight out sideways like any other relief, so that its undersides
      // are held at 45° and nothing dips under the bed)
      const dd = D[j * NU + i], up = rows.nz[j] > 0 ? opts.bedK[j] : 0;
      o = off[j] + dd * (1 + (rows.nr[j] - 1) * up); zz = rows.z[j] + dd * rows.nz[j] * up;
    } else if (opts.normalRelief && D) { const dd = D[j * NU + i]; o = off[j] + dd * rows.nr[j]; zz = rows.z[j] + dd * rows.nz[j]; }
    else { o = off[j] + (D ? D[j * NU + i] : 0); zz = rows.z[j]; }
    if (zShift) zz += zShift[i] * zw[j];
    let sc = rows.r[j];
    if (inner && colR && colR[j] > 0) { o += sc - colR[j]; sc = colR[j]; }
    let x0 = sc * CX[i] + o * NX[i], y0 = sc * CY[i] + o * NY[i];
    // A D set in by more than its corners are round (the inside of a small section, or an insert's foot)
    // has sharp corners there: where its inset arc meets its inset back. Every point that the plain
    // offset would carry past that corner goes to it, instead of folding the outline over.
    if (slide && o < -slide.c * sc) {
      const d = -o, yI = slide.b * sc - d, rI = sc - d, xI = Math.sqrt(Math.max(0, rI * rI - yI * yI));
      if (NY[i] > slide.fa + 1e-6 || y0 > yI) { x0 = NY[i] >= 0.9995 ? clamp(x0, -xI, xI) : CX[i] >= 0 ? xI : -xI; y0 = yI; }
    }
    if (slide) y0 += inner ? slIn[j] : slide.all[j];
    if (slide) {
      // a flat back stays flat: texture that would stand out past the wall's plane is cut off by it
      if (!inner && y0 > slide.plane) y0 = slide.plane;
      // grooves down the back, from top to bottom (a self-watering insert clears the heads of the mounting
      // screws with them): nothing in a groove's width comes nearer the wall than its floor
      if (slide.grooves) for (const g of slide.grooves) {
        const xm = Math.abs(x0 - g.x);
        if (xm < g.half + g.edge) { const lim = slide.plane - (inner ? g.wall : 0) - g.depth * (1 - smoothstep(g.half - g.edge, g.half + g.edge, xm)); if (y0 > lim) y0 = lim; }
      }
    }
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

  const hasInner = top !== 'cap' && top !== 'pocket';
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
  // A flat-backed outline is a D that has moved toward the wall: its floor's centre, and any hole in the
  // floor, sit halfway between its front and its back (the back as it is in the middle, behind the hole,
  // where an insert may have a groove), and the hole's points lie on the rays out to the outline's.
  const midY = (ring) => {
    let lo = Infinity, hi = -Infinity;
    for (const v of ring) { const x = mesh.P.a[v * 3], y = mesh.P.a[v * 3 + 1]; if (Math.abs(x) < 9) { if (y < lo) lo = y; if (y > hi) hi = y; } }
    return Number.isFinite(lo) ? (lo + hi) / 2 : 0;
  };
  const cyO = slide ? midY(ringO) : 0, cyI = slide ? midY(ringI.length ? ringI : ringO) : 0;
  // An outline with grooves in it cannot be fanned out from its middle (the grooves' far sides face away
  // from it): its floor is cut into triangles ear by ear instead. Points that share a place (a sharp
  // corner gathers several) are joined by flat slivers, so every edge of the wall still meets the floor.
  const earFloor = !!(slide && slide.grooves) && floor.type !== 'open';
  const earFace = (ring, hole, up) => {
    const at = (v) => [mesh.P.a[v * 3], mesh.P.a[v * 3 + 1], v];
    let o = ring.map(at);
    if (signedArea2D(o) < 0) o.reverse();
    const tri = (a, b, c) => (up ? mesh.tri(a, b, c) : mesh.tri(a, c, b));
    const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-7 && Math.abs(p[1] - q[1]) < 1e-7;
    const kept = [];
    for (let k = 0; k < o.length; k++) if (!same(o[k], o[(k + o.length - 1) % o.length])) kept.push(k);
    for (let q = 0; q < kept.length; q++) {
      // the run of points on top of kept[q], closed onto the next point that stands apart
      const from = kept[q], to = kept[(q + 1) % kept.length], nxt = o[to][2];
      for (let k = from; (k + 1) % o.length !== to; k = (k + 1) % o.length) tri(o[k][2], o[(k + 1) % o.length][2], nxt);
    }
    let pts = kept.map((k) => o[k]);
    if (hole) { let hl = hole.map(at); if (signedArea2D(hl) > 0) hl.reverse(); pts = bridgeHoles(pts, [hl]); }
    for (const [a, b, c] of earClip(pts)) tri(pts[a][2], pts[b][2], pts[c][2]);
  };
  if (earFloor && floor.type === 'solid') {
    earFace(ringO, null, false);
    if (hasInner) earFace(ringI, null, true);
  } else if (floor.type === 'solid') {
    const cb = capV(0, cyO, z0);
    for (let i = 0; i < NU; i++) mesh.tri(cb, ringO[(i + 1) % NU], ringO[i]);
    if (hasInner) {
      const ct = capV(0, cyI, zIn[0]);
      for (let i = 0; i < NU; i++) mesh.tri(ct, ringI[i], ringI[(i + 1) % NU]);
    }
  } else if (floor.type === 'hole' || floor.type === 'groove') {
    const hb = [], ht = [], wb = [], wt = [];
    for (let i = 0; i < NU; i++) {
      const a = earFloor ? (TAU * i) / NU : slide ? Math.atan2(mesh.P.a[ringI[i] * 3 + 1] - cyI, mesh.P.a[ringI[i] * 3]) : ANG[i] + Math.atan2(sphi[0], cphi[0]);
      const x = floor.holeR * Math.cos(a), y = floor.holeR * Math.sin(a) + cyI;
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
    } else if (earFloor) { earFace(ringO, hb, false); earFace(ringI, ht, true); }
    else strip(ringO, hb);
    for (let i = 0; i < NU; i++) {
      const i1 = (i + 1) % NU;
      if (!earFloor) { mesh.tri(ht[i], ringI[i], ringI[i1]); mesh.tri(ht[i], ringI[i1], ht[i1]); }
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
  if (top === 'dome') {
    // a closed top (globe lamps): the outer and the inner wall each end in a small ring near the top,
    // and each ring closes onto its own pole
    // (a flat-backed dome closes onto the wall, so its poles sit in the middle of their rings; and a
    // drainage hole leaves the tip open: the two rings are joined by the hole's own wall instead)
    const jt = NR - 1, ro = [], ri = [];
    let ox = 0, oy = 0, ix = 0, iy = 0;
    for (let i = 0; i < NU; i++) {
      point(jt * NU + i, false); ro.push(mesh.v(px, py, pz, jt * NU + i)); ox += px / NU; oy += py / NU;
      point(jt * NU + i, true); ri.push(mesh.v(px, py, pz, jt * NU + i + K)); ix += px / NU; iy += py / NU;
    }
    if (!slide) ox = oy = ix = iy = 0;
    if (opts.dome.hole) for (let i = 0; i < NU; i++) { const i1 = (i + 1) % NU; mesh.tri(ro[i], ri[i1], ri[i]); mesh.tri(ro[i], ro[i1], ri[i1]); }
    else {
      const po = capV(ox, oy, opts.dome.zOut), pi = capV(ix, iy, opts.dome.zIn);
      for (let i = 0; i < NU; i++) { const i1 = (i + 1) % NU; mesh.tri(po, ro[i], ro[i1]); mesh.tri(pi, ri[i1], ri[i]); }
    }
  }
  if (top === 'pocket') {
    // a solid body with a round pocket in its top (a candle holder): a flat ring from the outside in to
    // the pocket, its upright wall, and its floor. Each pocket point sits at the angle of its rim point.
    const jt = NR - 1, ring = [], pr = [], pf = [], P = opts.pocket;
    for (let i = 0; i < NU; i++) { point(jt * NU + i, false); ring.push(mesh.v(px, py, pz, jt * NU + i)); }
    let zc = 0; for (let i = 0; i < NU; i++) zc += mesh.P.a[ring[i] * 3 + 2]; zc /= NU;
    const zf = zc - P.depth;
    for (let i = 0; i < NU; i++) {
      const a = Math.atan2(mesh.P.a[ring[i] * 3 + 1], mesh.P.a[ring[i] * 3]);
      pr.push(capV(P.r * Math.cos(a), P.r * Math.sin(a), zc));
      pf.push(capV(P.r * Math.cos(a), P.r * Math.sin(a), zf));
    }
    const cf = capV(0, 0, zf);
    for (let i = 0; i < NU; i++) {
      const i1 = (i + 1) % NU;
      mesh.tri(pr[i], ring[i], ring[i1]); mesh.tri(pr[i], ring[i1], pr[i1]);
      mesh.tri(pr[i], pr[i1], pf[i1]); mesh.tri(pr[i], pf[i1], pf[i]);
      mesh.tri(cf, pf[i], pf[i1]);
    }
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
  const cols0 = sectionColumns(sec, segs);
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
    const cols = cols0;
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

// An inside chamfer at an open end: the inner wall flares out by c at the very edge, at 40° (not 45°, so
// that a ring whose wall leans in a little still keeps its lower chamfer under 45°).
const chamferEdge = (c) => ({ zone: c / 0.84, out: () => 0, inn: (u) => Math.max(0, c - u * 0.84) });
// Two edge profiles at once: the outside follows the first, the inside takes whichever cuts deeper.
function combineEdges(a, b) {
  if (!a) return b; if (!b) return a;
  return { zone: Math.max(a.zone, b.zone), out: (u) => a.out(u) + b.out(u), inn: (u) => Math.max(a.inn(u), b.inn(u)), extra: Math.max(a.extra || 0, b.extra || 0) };
}
// A rim edge mirrored onto the bottom of an open piece (a napkin ring) and kept printable: going up from
// the bed, the outside may lean out and the inside lean in by at most 45°, so curves that would hang out
// over the bed become chamfers there.
function bottomEdge(edge) {
  const zone = edge.zone + 0.5, du = 0.02, n = Math.ceil(zone / du) + 2;
  const out = new Float64Array(n), inn = new Float64Array(n);
  for (let k = 0; k < n; k++) { out[k] = edge.out(k * du); inn[k] = edge.inn(k * du); }
  for (let k = n - 2; k >= 0; k--) { out[k] = Math.max(out[k], out[k + 1] - du); inn[k] = Math.min(inn[k], inn[k + 1] + du); }
  const at = (arr) => (u) => { if (u <= 0) return arr[0]; const x = u / du, k = Math.floor(x); return k >= n - 1 ? arr[n - 1] : arr[k] + (arr[k + 1] - arr[k]) * (x - k); };
  return { zone, out: at(out), inn: at(inn), extra: edge.extra || 0 };
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
  // the grid has to resolve the smallest cells: with even sizing they are all about the same size, except
  // where a narrow part runs below the fewest a course may have round it
  let rCell = extra.rMinCell ?? rMin;
  if (S.sizing !== 'count' && mode !== 'none') { const N0 = Math.max(1, Math.round(S.count || 1)); rCell = Math.max(rCell, Math.min(rMax / 1.3, (rMin * N0) / evenMin(N0))); }
  rMax += extra.offset || 0;
  let cell = extra.cell || cellFor(S, mode, rCell * perim, coarse.L, quality);
  // holes through the wall need a grid fine enough to come out at their size (a smooth wall's is coarse)
  if (extra.holes && extra.holes.length && !extra.cell) cell = Math.min(cell, Math.max(0.5, Math.min(...extra.holes.map((hl) => Math.min(hl.r, hl.w || hl.r))) / 2.4));
  // keep the grid within budget
  const budget = 2.4e6 * Math.min(quality, 1.6);
  const est = () => (Math.ceil((rMax * sec.L) / cell) * coarse.L) / cell;
  while (est() > budget) cell *= 1.12;
  const rimSet = top === 'rim' ? extra.rim : null;
  // (a piece that prints rim-down has its rim edge at the bottom)
  const rimEdgeP = rimSet ? rimProfile(rimSet.edge, P.form.wall) : extra.rimBottom ? rimProfile(extra.rimBottom, P.form.wall) : null;
  // edge profiles at the rim and, on open pieces, at the bottom (the same edge mirrored, an inside chamfer)
  const chamfer = extra.innerChamfer > 0 ? chamferEdge(extra.innerChamfer) : null;
  const rim = top === 'rim' ? combineEdges(rimEdgeP, chamfer) : null;
  const edgeBot = floor.type === 'open' && !floor.cut ? combineEdges((extra.edgeBoth || extra.rimBottom) && rimEdgeP ? bottomEdge(rimEdgeP) : null, chamfer) : null;
  const drop = rimSet && rimSet.shape !== 'level' ? rimSet.drop : 0;
  // dense rows where the rim edge and any wavy rim line live
  const notchD = extra.notch ? extra.notch.depth : 0;
  const zoneTot = (rim ? rim.zone * 1.15 : 0) + Math.max(drop, notchD);
  const fine = Math.min(cell, rim ? rim.zone / 10 : cell * 0.6);
  // colour bands: cuts stay clear of the floor and of the shaped rim
  let cuts = [];
  if (extra.bands && top !== 'cap' && top !== 'pocket') {
    const lo = Math.max(P.form.floor + P.form.wall + 3, mode === 'cut' ? Math.max(S.bandBottom, P.form.floor + 1.2) + 0.5 : 0, 3);
    const hi = H - (rim ? rim.zone * 1.15 : 0) - drop - 3;
    for (const zc of extra.bands.cuts) {
      const z = Math.round(clamp(zc, lo, hi) / 0.2) * 0.2; // land on a 0.2 mm layer line
      if (z > lo - 0.01 && z < hi + 0.01 && cuts.every((c) => Math.abs(c - z) >= 2)) cuts.push(z);
    }
    cuts.sort((a, b) => a - b);
  }
  const rows = sampleRows(rFn, H, cell, 0, zoneTot > 0 ? { zone: zoneTot, count: Math.min(180, Math.ceil(zoneTot / fine)) } : null, cuts,
    edgeBot ? { zone: edgeBot.zone * 1.15, count: Math.min(180, Math.ceil((edgeBot.zone * 1.15) / Math.min(cell, edgeBot.zone / 10))) } : null);
  if (extra.offset) rows.off = new Float64Array(rows.n).fill(extra.offset);
  // (an insert inside a leaning wall: measured level, that wall is thicker than it is square to itself, by
  // 1 / the cosine of its lean, so the insert stands that much further in there)
  if (extra.offset && extra.offsetLean) for (let j = 0; j < rows.n; j++) if (rows.z[j] < extra.offsetLean.to) rows.off[j] -= extra.offsetLean.wall * (1 / Math.max(0.6, rows.nr[j]) - 1);
  if (rim) rMax += rim.extra || 0; else if (edgeBot) rMax += edgeBot.extra || 0;
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
  const bandB = Math.max(mode === 'cut' ? Math.max(S.bandBottom, floor.type === 'open' ? 1.2 : floor.thick + 1.2) : S.bandBottom, extra.minBottomBand || 0, edgeBot ? edgeBot.zone + 1.5 : 0);
  // patterns stop below a shaped rim so the edge profile stays clean
  const rimBand = rim ? rim.zone + 1.5 : 0;
  const bandT = mode === 'cut' ? Math.max(S.bandTop, extra.minTopBand || 1.2, rimBand) : Math.max(S.bandTop, extra.minTopBand || 0, rimBand);
  const freezeL = extra.freezeChamfer ? (P.form.inset || 0) * 1.45 + 0.4 : 0;
  // openings must keep their printable orientation, so a twisted outline does not drag them round
  const unswirl = mode === 'cut' ? ((extra.twist || 0) / TAU) * (H / Math.max(1e-6, rows.z[rows.n - 1])) : 0;
  let { F, D, Din, scMin } = buildSurface(rows, NU, S, mode, { bandBottom: bandB, bandTop: bandT, perim, topL, edge: rim, edgeBot, freezeL, unswirl, keepDepth: extra.keepDepth });
  // toward a closed top (globes) the cells shrink to nothing: the relief eases off within poleFade of the axis
  if (D && extra.poleFade > 0) for (let j = 0; j < rows.n; j++) { const k = smoothstep(0, extra.poleFade, rows.r[j]); if (k < 1) for (let i = 0; i < NU; i++) D[j * NU + i] *= k; }
  // In the valleys of a shaped outline the inside of the wall is wider than the outside, so an opening is
  // stretched sideways on its way through and its pointed top flattens. Where that stretch passes 12%
  // the wall stays solid; openings there end in upright sides instead.
  if (mode === 'cut' && !sec.round) {
    const cols = sectionColumns(sec, NU), ds = sec.L / NU, kap = new Float64Array(NU);
    for (let i = 0; i < NU; i++) {
      const a = (i + NU - 1) % NU, b = (i + 1) % NU;
      const turn = Math.atan2(cols.NX[a] * cols.NY[b] - cols.NY[a] * cols.NX[b], cols.NX[a] * cols.NX[b] + cols.NY[a] * cols.NY[b]);
      kap[i] = turn / (2 * ds); // curvature of the unit outline: > 0 where it bulges, < 0 in a valley
    }
    const t = P.form.wall;
    for (let j = 0; j < rows.n; j++) {
      const rr = Math.max(1e-3, rows.r[j]), tn = t * (rows.nr[j] ?? 1);
      for (let i = 0; i < NU; i++) {
        if (kap[i] >= 0) continue;
        const stretch = 1 - (tn * kap[i]) / rr;
        if (stretch > 1.1) { const id = j * NU + i; F[id] = Math.max(F[id], (stretch - 1.12) * 30); }
      }
    }
  }
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
  // A flat back (wall planters): it stands upright on one plane whatever the silhouette does. Each row is
  // the same D, moved toward the wall as a whole by however much narrower it is than the widest one, so
  // the outline is never stretched (a pattern keeps its proportions right round to the back) and a dome
  // closes onto a point on the wall. The front then leans 1 + b times as far as the silhouette does, which
  // the silhouette's easing allows for. Inside, each row moves back out by what the wall's lean takes off
  // the back's thickness, so the back wall is a full wall thick, and flat inside as well, from rim to tip.
  let slide = null;
  if (extra.flatBack) {
    const cols = sectionColumns(sec, NU), tw = P.form.wall;
    let rTop = extra.flatBack.rTop || 0;
    if (!rTop) for (let j = 0; j < rows.n; j++) rTop = Math.max(rTop, rows.r[j]);
    const fb = extra.flatBack.b, fc = 0.16;
    slide = { all: new Float64Array(rows.n), inAll: new Float64Array(rows.n), plane: fb * rTop + (extra.offset || 0), b: fb, c: fc, fa: (fb - fc) / (1 - fc) };
    for (let j = 0; j < rows.n; j++) { slide.all[j] = extra.flatBack.b * (rTop - rows.r[j]); slide.inAll[j] = -tw * (1 - rows.nr[j]); }
    // The texture runs on round the sides and the corners right to the back, where the wall's plane cuts
    // it off flat (in the mesher: nothing may pass that plane). Only where the outline has all but turned
    // onto the back does it ease off, and whatever is pressed into the wall eases off a little sooner, so
    // the back itself is never dented.
    if (D) for (let i = 0; i < NU; i++) {
      const ny = cols.NY[i], kOut = 1 - smoothstep(0.93, 0.999, ny), kIn = 1 - smoothstep(0.7, 0.96, ny);
      if (kIn < 1) for (let j = 0; j < rows.n; j++) { const id = j * NU + i; D[id] *= D[id] > 0 ? kOut : kIn; }
    }
    if (extra.flatBack.grooves && extra.flatBack.grooves.length) slide.grooves = extra.flatBack.grooves.map((g) => ({ x: g.x, half: g.width / 2, edge: Math.min(3, g.width / 4), depth: g.depth, wall: tw }));
  }
  if (D) processRelief(D, rows, NU, { sec, perim, mode, twist: extra.twist || 0, H, fillBelow: extra.freezeChamfer ? (P.form.inset || 0) * 1.45 + 1 : 0, slide, skipOverhung: extra.skipOverhung });
  // holes through the wall: teardrops for hanging cords, keyholes for a screw
  if (extra.holes && extra.holes.length) {
    const cols = sectionColumns(sec, NU), du = sec.L / NU;
    for (const hole of extra.holes) {
      let ic = 0, best = Infinity;
      for (let i = 0; i < NU; i++) { const da = Math.abs(Math.atan2(Math.sin(cols.A[i] - hole.angle), Math.cos(cols.A[i] - hole.angle))); if (da < best) { best = da; ic = i; } }
      const reach = hole.r * 2 + (hole.slot || 0) + 3, kN = cols.CX[ic] * cols.NX[ic] + cols.CY[ic] * cols.NY[ic];
      for (let j = 0; j < rows.n; j++) {
        const dy = rows.z[j] - hole.z;
        if (dy < -reach || dy > reach) continue;
        const rr = rows.r[j] + (rows.off ? rows.off[j] : 0);
        for (let di = -NU / 2; di < NU / 2; di++) {
          const sArc = di * du * rr - (hole.dx || 0);
          if (Math.abs(sArc) > reach) continue;
          // a twist turns each row a little further round: follow it, so the hole stays upright
          const i = (ic + di + NU) % NU, g = holeField(hole, sArc + (rr * kN * (extra.twist || 0) * dy) / H, dy), id = j * NU + i;
          if (g < F[id]) F[id] = Math.abs(g) < 1e-4 ? (g < 0 ? -1e-4 : 1e-4) : g;
        }
      }
    }
  }
  const shellOpts = { sec, twist: extra.twist || 0, H, zShift: extra.zShift, shiftFrom: extra.shiftFrom, Din, innerStep: mode === 'relief' ? 4 : 1, slide, pocket: extra.pocket, dome: extra.dome, normalRelief: extra.normalRelief };
  // relief that stands out along the surface, on a wall that starts at the bed: sideways for the first few mm
  if (extra.normalRelief && extra.reliefFromBed) shellOpts.bedK = Float64Array.from(rows.z, (z) => smoothstep(0, 5, z - rows.z[0]));
  if (!cuts.length) {
    const mesh = buildShell(rows, NU, F, D, P.form.wall, { ...floor, band: bandB }, top, shellOpts);
    return { mesh, rows, NU, cell, rMax, rMin, perim, scMin };
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
    bodies.push(buildShell(sub, NU, view(F), view(D), P.form.wall, fl, tp, { ...shellOpts, Din: view(Din), bedK: shellOpts.bedK && shellOpts.bedK.subarray(a, e + 1), slide: slide && { plane: slide.plane, b: slide.b, c: slide.c, fa: slide.fa, grooves: slide.grooves, all: slide.all.subarray(a, e + 1), inAll: slide.inAll.subarray(a, e + 1) } }));
  }
  const merged = mergeMeshes(bodies);
  // which original band each body falls in, so its filament slot survives clamping
  const req = [0, ...extra.bands.cuts.slice().sort((x, y) => x - y), Infinity];
  const slotAt = (z) => { for (let k = 0; k + 1 < req.length; k++) if (z < req[k + 1]) return extra.bands.slots[k] ?? 0; return 0; };
  const regions = merged.ranges.map((rg, b) => ({ ...rg, slot: slotAt((rows.z[bounds[b]] + rows.z[bounds[b + 1]]) / 2), z0: rows.z[bounds[b]], z1: rows.z[bounds[b + 1]] }));
  return { mesh: merged.mesh, rows, NU, cell, rMax, rMin, perim, regions, cuts, scMin };
}

// A flat part: a simple polygon (anticlockwise, in x/y) extruded t mm up. It prints lying as it is.
function extrudePolygon(pts, t) {
  const n = pts.length, mesh = new Mesh();
  const bot = pts.map(([x, y], i) => mesh.v(x, y, 0, i)), top = pts.map(([x, y], i) => mesh.v(x, y, t, n + i));
  // ear clipping
  const idx = pts.map((_, i) => i), area2 = (a, b, c) => (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[c][0] - pts[a][0]) * (pts[b][1] - pts[a][1]);
  const inside = (p, a, b, c) => area2(a, b, p) >= 0 && area2(b, c, p) >= 0 && area2(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length], b = idx[k], c = idx[(k + 1) % idx.length];
      if (area2(a, b, c) <= 1e-9) continue;
      if (idx.some((p) => p !== a && p !== b && p !== c && inside(p, a, b, c))) continue;
      mesh.tri(top[a], top[b], top[c]); mesh.tri(bot[a], bot[c], bot[b]);
      idx.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) { const [a, b, c] = idx; mesh.tri(top[a], top[b], top[c]); mesh.tri(bot[a], bot[c], bot[b]); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; mesh.tri(bot[i], bot[j], top[j]); mesh.tri(bot[i], top[j], top[i]); }
  return mesh;
}

// A test piece for translucent filament: a curved strip, 20 mm tall, whose wall steps from one line
// (0.45 mm) at one end to 3 mm at the other. Stand it over a phone torch or an LED tealight to see how
// much light each thickness lets through, and how well it hides the bulb.
export const GLOW_STEPS = [0.45, 0.9, 1.35, 1.8, 2.25, 3];
export function glowTest() {
  const Ro = 32, per = 42, n = 10, a0 = 90 - (per * GLOW_STEPS.length) / 2, rad = (d) => (d * Math.PI) / 180, pts = [];
  for (let k = 0; k <= GLOW_STEPS.length * n; k++) { const a = rad(a0 + (per * k) / n); pts.push([Ro * Math.cos(a), Ro * Math.sin(a)]); }
  for (let s = GLOW_STEPS.length - 1; s >= 0; s--) {
    const ri = Ro - GLOW_STEPS[s];
    for (let k = n; k >= 0; k--) { const a = rad(a0 + per * (s + k / n)); pts.push([ri * Math.cos(a), ri * Math.sin(a)]); }
  }
  const m = finish(extrudePolygon(pts, 20), { overhangLimit: 46 });
  return { key: 'glowtest', label: 'Glow test', ...m, place: { z: 0, color: 0 } };
}

// A plant stand in two flat pieces that slot together into a cross: each is a pair of legs joined by a
// crossbar the pot rests on, with a half-lap notch in the middle (one cut from the top, one from the
// bottom). ext(h) is how far the pot reaches out at height h above its base, in the piece's plane.
// style: splay (degrees), taper (foot width / top width).
function standOutline({ lift, hug, leg, bar, ext, splay, taper, notch }) {
  const yTop = lift + hug, tn = Math.tan((splay * Math.PI) / 180), clr = 1.2;
  // the legs' inner edges are straight lines that clear the pot all the way up
  let xTop = 0;
  for (let k = 0; k <= 40; k++) { const y = lift + (hug * k) / 40; xTop = Math.max(xTop, ext(y - lift) + clr - (yTop - y) * tn); }
  const xin = (y) => xTop + (yTop - y) * tn;
  const wTop = leg, wBot = leg * taper;
  const xout = (y) => xin(y) + wBot + ((wTop - wBot) * y) / yTop;
  const c = Math.min(2, leg * 0.18); // softened top corners
  const nw = (notch.w) / 2, nd = bar / 2, yb = lift - bar;
  const right = [];
  // right leg, from the floor round to the bar top
  right.push([xin(0), 0], [xout(0), 0], [xout(yTop - c), yTop - c], [xout(yTop) - c, yTop], [xin(yTop) + c, yTop], [xin(yTop), yTop - c], [xin(lift), lift]);
  const pts = [];
  // bottom edge of the left leg, then up its inner edge to the underside of the bar
  pts.push([-xout(0), 0], [-xin(0), 0], [-xin(yb), yb]);
  // underside of the bar (with the notch for the piece that sits on top)
  if (notch.from === 'bottom') pts.push([-nw, yb], [-nw, yb + nd], [nw, yb + nd], [nw, yb]);
  pts.push([xin(yb), yb]);
  pts.push(...right);
  // top of the bar, right to left (with the notch for the piece underneath)
  if (notch.from === 'top') pts.push([nw, lift], [nw, lift - nd], [-nw, lift - nd], [-nw, lift]);
  // up the left leg's inner edge, over its top, down its outer edge
  pts.push([-xin(lift), lift], [-xin(yTop), yTop - c], [-xin(yTop) - c, yTop], [-xout(yTop) + c, yTop], [-xout(yTop - c), yTop - c]);
  return { pts, span: 2 * xout(0), height: yTop };
}

// Signed distance (mm, > 0 = wall) to a hole at arc offset s and height offset dy from its centre.
// Every top is a 50° point, so the holes print without bridging.
function holeField(hole, s, dy) {
  const ax = Math.abs(s), R = hole.r;
  const drop = (rad, y) => Math.min(Math.hypot(ax, y) - rad, Math.max(0.766 * ax + 0.643 * y - rad, rad * 0.643 - y));
  let d = drop(R, dy);
  if (hole.slot) {
    // keyhole: a narrow slot rising from the round opening; the screw shaft rests at its pointed top
    const w = hole.w || 2.3, L = hole.slot;
    // (on a piece that prints rim-down the slot runs down the print instead, to a round end, and the
    // round opening above it keeps its pointed top)
    if (hole.down) d = Math.min(d, dy > -L ? Math.max(ax - w, dy) : Math.hypot(ax, dy + L) - w);
    else d = Math.min(d, Math.max(ax - w, -dy, Math.min(dy - L, 0.766 * ax + 0.643 * (dy - L) - 0.766 * w)));
  }
  return d;
}

function maxRelief(S) {
  if (S.pattern === 'smooth') return 0;
  if (S.mode === 'relief') return (S.depth || 0) * (1 + Math.abs(S.gradient || 0));
  if (S.mode === 'cut') return (S.bulge || 0) + (S.pattern === 'wicker' ? S.depth || 0 : 0);
  return 0;
}

// Pieces that hold soil or water never get cut-through patterns.
// ---------------------------------------------------------------- faceted wall planters
// The geometric wall planter, copied exactly from the original model: upright sides round a pointed opening,
// a bottom of two slopes meeting in a keel, and a steep diamond facet in front, with a flat back screwed to
// the wall. It is built as solid minus cavity: both are convex, cut by the same planes (the cavity's moved in
// by the wall thickness), so every face is a flat polygon.
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// the corners of a convex body { p : n·p <= d for every plane }, and each plane's face as a ring of corners
// in order, anticlockwise seen from outside
function convexFromPlanes(planes) {
  const V = [], m = planes.length;
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) for (let k = j + 1; k < m; k++) {
    const A = planes[i].n, B = planes[j].n, C = planes[k].n, det = dot3(A, cross3(B, C));
    if (Math.abs(det) < 1e-9) continue;
    const bc = cross3(B, C), ca = cross3(C, A), ab = cross3(A, B), di = planes[i].d, dj = planes[j].d, dk = planes[k].d;
    const p = [0, 1, 2].map((q) => (di * bc[q] + dj * ca[q] + dk * ab[q]) / det);
    if (planes.some((pl) => dot3(pl.n, p) > pl.d + 1e-6)) continue;
    if (!V.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1], v[2] - p[2]) < 1e-5)) V.push(p);
  }
  const faces = planes.map((pl) => {
    const on = V.filter((v) => Math.abs(dot3(pl.n, v) - pl.d) < 1e-5);
    if (on.length < 3) return null;
    const c = [0, 1, 2].map((q) => on.reduce((a, v) => a + v[q], 0) / on.length);
    const u = unit3(Math.abs(pl.n[2]) < 0.9 ? cross3([0, 0, 1], pl.n) : cross3([1, 0, 0], pl.n)), w = cross3(pl.n, u);
    const ang = (v) => { const r = [v[0] - c[0], v[1] - c[1], v[2] - c[2]]; return Math.atan2(dot3(r, w), dot3(r, u)); };
    return on.sort((p, q) => ang(p) - ang(q));
  });
  return { V, faces };
}
// Ear clipping of a simple polygon given as 2D points (anticlockwise); bridged holes appear as repeated points.
function earClip(pts) {
  const n = pts.length, idx = pts.map((_, i) => i), out = [];
  const area2 = (a, b, c) => (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[c][0] - pts[a][0]) * (pts[b][1] - pts[a][1]);
  const same = (p, q) => Math.abs(pts[p][0] - pts[q][0]) < 1e-9 && Math.abs(pts[p][1] - pts[q][1]) < 1e-9;
  let guard = 0;
  while (idx.length > 3 && guard++ < 4 * n * n) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length], b = idx[k], c = idx[(k + 1) % idx.length];
      if (area2(a, b, c) <= 1e-10) continue;
      let blocked = false;
      for (const p of idx) {
        if (p === a || p === b || p === c || same(p, a) || same(p, b) || same(p, c)) continue;
        if (area2(a, b, p) >= 0 && area2(b, c, p) >= 0 && area2(c, a, p) >= 0) { blocked = true; break; }
      }
      if (blocked) continue;
      out.push([a, b, c]); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
// Several holes (clockwise) joined into an outline (anticlockwise), each by the shortest bridge that crosses
// no edge of the outline or of any hole.
function bridgeHoles(outer, holes) {
  const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
  const crosses = (a, b, c, d) => {
    if (same(a, c) || same(a, d) || same(b, c) || same(b, d)) return false;
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
  };
  const edgesOf = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
  let poly = outer.slice();
  const todo = holes.slice();
  while (todo.length) {
    const hole = todo.shift();
    const blockers = [...edgesOf(poly), ...edgesOf(hole), ...todo.flatMap(edgesOf)];
    let best = null;
    for (let hi = 0; hi < hole.length; hi++) for (let pi = 0; pi < poly.length; pi++) {
      const d = Math.hypot(hole[hi][0] - poly[pi][0], hole[hi][1] - poly[pi][1]);
      if (best && d >= best.d) continue;
      if (blockers.some(([c, e]) => crosses(hole[hi], poly[pi], c, e))) continue;
      best = { d, hi, pi };
    }
    if (!best) continue;
    poly = [...poly.slice(0, best.pi + 1), ...hole.slice(best.hi), ...hole.slice(0, best.hi + 1), poly[best.pi], ...poly.slice(best.pi + 1)];
  }
  return poly;
}
const signedArea2D = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
export function facetedWall(F, X = {}) {
  // The geometric wall planter (WP013), exactly: its planes measured from the original STL at 160 mm wide,
  // scaled as a whole. Built as it prints, from the open end: the rim on the bed at z = 0, the back on the
  // plane y = 0 and the planter reaching toward +y, the keel at the top. At 160 mm: sides 60 mm straight out
  // from the wall, the front coming to a point 30 mm past them (faces at 20.56°), upright sides 97.5 mm deep,
  // bottom slopes rising 52.5 mm over 80 to a keel 150 mm from the rim, and a diamond facet 19° off upright.
  const W = clamp(F.diameter || 160, 60, 400), k = W / 160;
  const t = clamp(F.wall || 3, 1.2, 8), tb = Math.max(t, 3);
  const nrm = (v, d) => { const l = Math.hypot(...v); return { n: v.map((c) => c / l), d: (d / l) * k }; };
  const s19 = Math.sin((19 * Math.PI) / 180), c19 = Math.cos((19 * Math.PI) / 180);
  const hull = [
    nrm([1, 0, 0], 80), nrm([-1, 0, 0], 80), // the sides
    nrm([30, 80, 0], 7200), nrm([-30, 80, 0], 7200), // the front faces: corners at 60 mm, the point at 90 mm
    nrm([52.5, 0, 80], 12000), nrm([-52.5, 0, 80], 12000), // the bottom slopes: 97.5 mm at the sides, 150 at the keel
    { n: [0, c19, s19], d: 88.9174 * k }, // the diamond: 11.74 mm under the rim at the point, 42.39 mm out at the keel
  ];
  const BACK = hull.length, RIM = hull.length + 1;
  const planes = (inset, back) => [...hull.map((pl) => ({ n: pl.n, d: pl.d - inset })), { n: [0, -1, 0], d: -back }, { n: [0, 0, -1], d: 0 }];
  const Po = convexFromPlanes(planes(0, 0)), Pi = convexFromPlanes(planes(t, tb));
  // two Ø 6 mm screw holes through the back, 20 mm in from the sides and 15 mm under the rim (at 160 mm wide)
  const backIn = Pi.faces[BACK].map((v) => [v[0], v[2]]);
  const inside = (pt, poly, margin) => { for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ex, ey) || 1; if ((ex * (pt[1] - p[1]) - ey * (pt[0] - p[0])) / l < margin) return false; } return true; };
  const ccw = signedArea2D(backIn) > 0 ? backIn : backIn.slice().reverse();
  const circle = (cx, cz, r = 3) => Array.from({ length: 32 }, (_, q) => [cx + r * Math.cos((q * Math.PI) / 16), cz + r * Math.sin((q * Math.PI) / 16)]);
  const holes = [];
  for (let z = 15 * k; z < 60 * k; z += 0.5) {
    const L = circle(-60 * k, z), R = circle(60 * k, z);
    if (L.every((p) => inside(p, ccw, 1.5)) && R.every((p) => inside(p, ccw, 1.5))) { holes.push(L, R); break; }
  }

  // every triangle gets corners of its own, so each facet shades flat and its edges stay crisp; the weld id
  // (one per point in space) joins them back up for export
  const mesh = new Mesh(), ids = new Map();
  const wid = (p) => { const k = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`; let w = ids.get(k); if (w === undefined) { w = ids.size; ids.set(k, w); } return w; };
  const vtx = (p) => mesh.v(p[0], p[1], p[2], wid(p));
  const tri = (p, q, r, want) => {
    const nrm = cross3([q[0] - p[0], q[1] - p[1], q[2] - p[2]], [r[0] - p[0], r[1] - p[1], r[2] - p[2]]);
    if (Math.hypot(nrm[0], nrm[1], nrm[2]) < 1e-10) return;
    if (dot3(nrm, want) >= 0) mesh.tri(vtx(p), vtx(q), vtx(r)); else mesh.tri(vtx(p), vtx(r), vtx(q));
  };
  const fan = (poly, want) => { for (let k = 1; k + 1 < poly.length; k++) tri(poly[0], poly[k], poly[k + 1], want); };
  // a flat face with holes in it: 2D on the plane, bridged and ear-clipped, then back in 3D
  const holed = (outer3, holes2, to2, to3, want) => {
    let o = outer3.map(to2);
    if (signedArea2D(o) < 0) o = o.reverse();
    const hs2 = holes2.map((hl) => (signedArea2D(hl) > 0 ? hl.slice().reverse() : hl.slice()));
    const pts = bridgeHoles(o, hs2);
    for (const [i, j, k] of earClip(pts)) tri(to3(pts[i]), to3(pts[j]), to3(pts[k]), want);
  };
  const po = planes(0, 0);
  Po.faces.forEach((f, q) => {
    if (!f || q === RIM) return;
    if (q === BACK && holes.length) holed(f, holes, (v) => [v[0], v[2]], (p2) => [p2[0], 0, p2[1]], po[q].n);
    else fan(f, po[q].n);
  });
  Pi.faces.forEach((f, q) => {
    if (!f || q === RIM) return;
    const into = po[q].n.map((x) => -x);
    if (q === BACK && holes.length) holed(f, holes, (v) => [v[0], v[2]], (p2) => [p2[0], tb, p2[1]], into);
    else fan(f, into);
  });
  // the rim, on the bed: a flat ring between the outside and the opening
  holed(Po.faces[RIM], [Pi.faces[RIM].map((v) => [v[0], v[1]])], (v) => [v[0], v[1]], (p2) => [p2[0], p2[1], 0], [0, 0, -1]);
  // the holes' sides, through the back wall
  for (const hole of holes) {
    for (let q = 0; q < hole.length; q++) {
      const A = hole[q], B = hole[(q + 1) % hole.length], into = [-(B[1] - A[1]), 0, B[0] - A[0]];
      const want = signedArea2D(hole) > 0 ? into : into.map((x) => -x);
      const a0 = [A[0], 0, A[1]], b0 = [B[0], 0, B[1]], a1 = [A[0], tb, A[1]], b1 = [B[0], tb, B[1]];
      tri(a0, b0, b1, want); tri(a0, b1, a1, want);
    }
  }
  const depth = Math.max(...Po.V.map((v) => v[1])), height = Math.max(...Po.V.map((v) => v[2]));
  return { mesh, W, height, depth, holes: holes.length, wall: t, back: tb };
}

export const WATERTIGHT = new Set(['planter', 'vase', 'hanging', 'wall', 'candle']);

// A faceted wall planter is a polyhedron of its own: no silhouette, outline or pattern.
function generateFaceted(P) {
  const F = P.form, X = P.extras, g = facetedWall(F, X);
  const m = finish(g.mesh, { overhangLimit: 46, cutDepth: F.wall });
  // it prints from the open end: shown the right way up, hanging, by turning the print over
  const parts = [{ key: 'pot', label: 'Pot', ...m, place: { z: g.height, flipZ: true, color: 0 } }];
  const checks = [], loops = Math.max(1, Math.round(g.wall / 0.45));
  if (g.wall < 0.8) checks.push({ level: 'bad', text: 'Walls under 0.8 mm are too thin for a 0.4 mm nozzle.' });
  else checks.push({ level: g.wall < 2 ? 'warn' : 'ok', text: `Wall ${g.wall.toFixed(1)} mm ≈ ${loops} wall loop${loops > 1 ? 's' : ''} at 0.45 mm line width${g.wall < 2 ? '. It can flex: 3 mm makes a sturdy planter' : ''}.` });
  const over = m.stats.overhang, area = m.stats.area;
  // the original's bottom slopes rise 33° from level, so printed from the open end their insides lean 57°
  if (over > 1) checks.push({ level: 'warn', text: `Prints from the open end, rim on the bed. Inside, the two bottom slopes lean 57° as they print (${(over / 100).toFixed(0)} cm², striped in Print check): that is the original design, and with the part fan on most printers manage it without supports. If yours sags there, add tree supports from the bed; they come out through the opening.` });
  else checks.push({ level: 'ok', text: 'Prints from the open end, rim on the bed, with no supports.' });
  if (g.holes) checks.push({ level: 'ok', text: 'Two Ø 6 mm screw holes near the top corners of the back, as on the original: screw it straight to the wall from inside.' });
  else checks.push({ level: 'warn', text: 'The back is too small for screw holes: make it wider, or hang it with strong mounting tape.' });
  checks.push({ level: 'ok', text: 'No drainage hole, so it never drips: water sparingly, or stand a small nursery pot inside it.' });
  return { parts, checks, info: { cell: 0, NU: 0, rows: 0, mainKey: 'pot', eased: 0, lift: 0, colorChanges: [], wallY: 0, hangers: null, stand: null, globe: null, facet: { height: g.height, depth: g.depth, width: g.W } } };
}

export function generate(P, quality = 1) {
  if (P.object === 'wall' && P.extras.wallStyle === 'facet') return generateFaceted(P);
  // only hanging and wall planters can have a domed bottom; it has no base chamfer
  if (domedBottom(P.form)) P = { ...P, form: P.object === 'hanging' || P.object === 'wall' ? { ...P.form, inset: 0 } : { ...P.form, bottom: 'flat' } };
  const F = P.form, X = P.extras;
  const domed = domedBottom(F);
  let S = P.surface;
  if (WATERTIGHT.has(P.object) && S.mode === 'cut') { S = { ...S, mode: 'relief' }; P = { ...P, surface: S }; }
  // a globe lamp has a shape of its own; everything else follows the silhouette
  const globe = P.object === 'globe';
  const gs = globe ? globeShape(F, X, F.wall) : null;
  const H = globe ? gs.H : F.height;
  // wall planters always have the flat back; their outline cannot twist away from the wall
  const wallObj = P.object === 'wall';
  let wallBack = wallObj ? clamp(X.back ?? 0.3, 0.1, 0.6) : 0;
  let rFn = gs ? gs.fn : null, eased = 0;
  const shape = () => { const sp = shapeProfile(F, wallBack); rFn = sp.fn; eased = sp.moved; };
  if (!globe) shape();
  // (the back stays far enough behind the centre for the floor and the inner wall; a dome is left out of
  // that, as it narrows to nothing)
  if (wallObj) {
    let rLo = Infinity;
    const z0 = domed ? clamp(F.belly, 0.08, 0.92) * H : 0;
    for (let k = 0; k <= 100; k++) rLo = Math.min(rLo, rFn(z0 + ((H - z0) * k) / 100));
    const need = clamp(Math.max(wallBack, (F.wall + 3) / Math.max(10, rLo)), 0.1, 0.6);
    if (need !== wallBack) { wallBack = need; shape(); }
  }
  // a domed bottom is built as it prints: rim on the bed, the dome closing over the top
  // (a self-watering pot keeps its water: no drainage hole through the tip)
  const insert = (P.object === 'planter' || wallObj) && X.base === 'insert';
  const ds = domed ? domeShape(F, insert ? { ...X, drain: 0 } : X, rFn, wallBack) : null;
  // the widest the wall planter gets: its flat back stands that far (times its depth) behind the axis
  let wallRTop = 0;
  if (wallObj) for (let k = 0; k <= 1000; k++) wallRTop = Math.max(wallRTop, rFn((H * k) / 1000));
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
  if (globe) rMinAll = gs.rBand;
  if (domed) rMinAll = 0.34 * ds.R;
  let secF = F;
  if (wallObj) secF = { ...F, section: 'flatback', back: wallBack, twist: 0 };
  if (secF.section === 'polygon') {
    const need = (F.wall + relief + 1) / Math.max(5, rMinAll);
    if ((F.corner ?? 0.2) < need) { secF = { ...F, corner: Math.min(0.85, need) }; warnings.push({ level: 'ok', text: 'Corners were rounded a little more so the inner wall stays clean.' }); }
  }
  const sec = makeSection(secF);
  const twist = wallObj ? 0 : ((F.twist || 0) * Math.PI) / 180;
  // accessories follow the outline unless a twist would stop the pot from sliding in
  const accSec = sec.round || twist === 0 ? sec : ROUND();

  const obj = P.object;
  let floor = { type: 'solid', thick: F.floor };
  let top = 'rim';
  let minTopBand = 0;
  const lamp = obj === 'lamp';
  // table lamps and globes stand in a groove in a printed base that holds the lamp socket
  const onBase = lamp || globe;
  const pot = obj === 'planter' || obj === 'hanging' || obj === 'wall' || obj === 'orchid';
  // the pot's base accessory: planters have them all, orchid pots a saucer
  const potBase = obj === 'planter' ? X.base || 'none' : obj === 'orchid' && X.base === 'saucer' ? 'saucer' : 'none';
  // a plant stand under planters, orchid pots and vases
  const standOn = (obj === 'planter' || obj === 'orchid' || obj === 'vase') && X.stand && X.stand !== 'none';
  let standInfo = null;
  // a self-watering pot keeps its water: no drain hole in the outer pot
  if (pot && X.drain > 0 && !insert) floor = { type: 'hole', thick: F.floor, holeR: X.drain / 2 };
  if (obj === 'pendant') floor = { type: 'hole', thick: F.floor, holeR: X.socket / 2 };
  // a table-lamp shade is open at both ends and stands in a groove in the base; so is a napkin ring
  const GROOVE = 3;
  if (onBase || obj === 'ring' || domed) floor = { type: 'open' };
  if (globe || domed) top = 'dome';
  if (obj === 'vase' && X.vaseMode && mode !== 'cut') top = 'cap';
  // a candle holder is solid, with a pocket in the top just the size of the candle
  const CANDLES = { tealight: { d: 40, depth: 17, label: 'tealight' }, maxi: { d: 60, depth: 24, label: 'maxi tealight' }, taper: { d: 22.5, depth: 20, label: 'taper candle' } };
  const candle = obj === 'candle' ? CANDLES[X.candle] || CANDLES.tealight : null;
  if (candle) top = 'pocket';
  const lidOn = obj === 'box' && X.lid;
  if (lidOn) minTopBand = X.plugDepth + 2;

  // keep holes inside the floor
  if (floor.type === 'hole') {
    const r0 = (wallObj ? (rFn(0) * (1 + secF.back)) / 2 : rFn(0) * sec.minR) - F.wall - 3;
    if (floor.holeR > r0) { floor.holeR = Math.max(4, r0); warnings.push({ level: 'warn', text: 'The centre hole was reduced to fit inside the floor.' }); }
  }

  // rim: an edge profile, and a wavy or slanted top line (not where a lid has to sit flat)
  // (a domed planter prints rim-down: its rim edge is on the bed, and its rim line has to be level)
  const rimEdge = top === 'rim' || domed ? F.rimEdge || 'flat' : 'flat';
  // a lid or a self-watering insert has to sit on a level rim
  const rimShape = top === 'rim' && !lidOn && !insert && !domed ? F.rimShape || 'level' : 'level';
  const rimDrop = clamp(F.rimDepth || 0, 0, H * 0.35);
  const shaped = rimShape !== 'level' && rimDrop > 0.5;
  const extraMain = { minTopBand, sec, twist, freezeChamfer: floor.type !== 'open', minBottomBand: onBase ? GROOVE + 3 : 0 };
  // a globe keeps its pattern off the collar and out of the narrow top, where the dome closes
  if (globe) {
    // the pattern runs over the whole ball. Relief stands out along the surface (not sideways), keeps its
    // full depth on the underside too (the print check says where that needs supports), and softens only
    // right at the top, where its cells shrink below its depth; openwork stops where its openings would
    // get narrower than its strips.
    const cutStop = clamp((2 * (S.width || 2) * Math.max(1, S.count)) / TAU, 6, 0.34 * gs.R);
    Object.assign(extraMain, {
      dome: gs.dome, minBottomBand: gs.bottomBand, rMinCell: gs.rBand,
      minTopBand: mode === 'cut' ? gs.topBandAt(cutStop) + 2 : gs.topBandAt(3) + 0.5,
      normalRelief: true, keepDepth: true, skipOverhung: true,
      poleFade: mode === 'relief' ? clamp((relief * (S.sizing !== 'count' ? evenMin(Math.max(1, S.count)) : Math.max(1, S.count))) / Math.PI, 6, 0.25 * gs.R) : 0,
    });
  }
  // napkin rings: the rim edge at both ends, and an inside chamfer
  if (obj === 'ring') { extraMain.edgeBoth = X.edgeBoth !== false; extraMain.innerChamfer = clamp(X.innerChamfer || 0, 0, Math.max(0, F.wall - 0.8)); }
  if (candle) extraMain.pocket = { r: candle.d / 2, depth: Math.min(candle.depth, H - 6) };
  // A domed bottom is one piece with the wall: the pattern runs on over the dome right to its tip. Relief
  // stands out along the surface there, and eases off only at the very tip, where its cells shrink below
  // its depth.
  if (domed) {
    Object.assign(extraMain, {
      dome: ds.dome, rimBottom: rimEdge !== 'flat' ? rimEdge : null, rMinCell: 0.4 * ds.R, normalRelief: true, reliefFromBed: true,
      minTopBand: ds.hole ? 2 : ds.arcFrom(Math.max(ds.rEnd + 0.5, 3)) + 0.5,
      poleFade: mode === 'relief' ? clamp((relief * (S.sizing !== 'count' ? evenMin(Math.max(1, S.count)) : Math.max(1, S.count))) / Math.PI, 6, 0.25 * ds.R) : 0,
    });
  }
  // hanging planter: teardrop holes for the cords in a plain collar under the rim
  const holes = [];
  const rimZone = rimEdge !== 'flat' ? (rimProfile(rimEdge, F.wall)?.zone || 0) + 1.5 : 0;
  // (heights here are the right way up; on a domed planter each hole is turned over with the print below)
  if (obj === 'hanging') {
    const n = clamp(Math.round(X.hangers || 3), 2, 6), r = 2.6, zc = H - (shaped ? rimDrop : 0) - rimZone - 8;
    // on a shaped outline each hole goes on the nearest lobe crest or flat face, where the wall is even
    const lobes = secF.section === 'lobed' ? clamp(Math.round(F.lobes || 8), 2, 24) : secF.section === 'polygon' ? clamp(Math.round(F.sides || 6), 3, 12) : 0;
    const snap = (a) => (lobes ? Math.round((a * lobes) / TAU) * (TAU / lobes) : a);
    for (let k = 0; k < n; k++) holes.push({ angle: snap(-Math.PI / 2 + (TAU * k) / n), z: zc, r });
    if (domed) extraMain.minBottomBand = Math.max(extraMain.minBottomBand, H - zc + r + 2.5);
    else extraMain.minTopBand = Math.max(extraMain.minTopBand, H - zc + r + 2.5);
  }
  // wall planter: one or two mounting holes in the flat back. A keyhole hooks over a screw left standing
  // out of the wall (a round opening for its head, and a slot above it for its shaft); a plain screw hole
  // is screwed through from inside the pot.
  let mount = null;
  if (wallObj) {
    const b = secF.back, c = 0.16, flatU = Math.sqrt(Math.max(0, (1 - c) ** 2 - (b - c) ** 2));
    const screw = X.mount === 'screw';
    const headR = clamp((X.mountHead ?? 9.2) / 2, 3, 9);
    const w = screw ? clamp((X.mountShaft ?? 4.6) / 2, 1.5, 5) : clamp((X.mountShaft ?? 4.6) / 2, 1.2, headR - 0.7);
    const L = screw ? 0 : clamp(X.mountSlot ?? 9, 3, 40), R0 = screw ? w : headR;
    // how far under the rim the round opening sits: the slot above it stays clear of the rim's edge, and
    // the opening stays on the flat of the back, above the floor or the dome
    const above = screw ? 1.7 * R0 + 3 : L + 1.3 * w + 3, below = (screw ? 1 : 1.7) * R0 + 3;
    const dropMin = (shaped ? rimDrop : 0) + rimZone + above;
    let zLow = (domed ? 0 : F.floor) + below + 2;
    while (zLow < H - dropMin && flatU * rFn(zLow - below) < R0 + 5) zLow += 1;
    const drop = clamp(X.mountDrop ?? 22, dropMin, Math.max(dropMin, H - zLow)), zc = H - drop;
    // two holes: as far apart as asked, both on the flat of the back
    let rFlat = Infinity;
    for (let q = 0; q <= 12; q++) rFlat = Math.min(rFlat, rFn(clamp(zc - below + ((below + above) * q) / 12, 0, H)));
    const halfMax = flatU * rFlat - R0 - 3, halfMin = R0 + 3;
    let count = X.mountCount === 2 ? 2 : 1, half = 0;
    if (count === 2 && halfMax < halfMin) { count = 1; warnings.push({ level: 'warn', text: 'The back is too narrow there for two mounting holes, so it has one. Make the planter wider, the holes smaller, or move them up.' }); }
    if (count === 2) {
      half = clamp((X.mountSpacing ?? 80) / 2, halfMin, halfMax);
      if (Math.abs(2 * half - (X.mountSpacing ?? 80)) > 1) warnings.push({ level: 'ok', text: `The mounting holes are ${Math.round(2 * half)} mm apart: that is as ${2 * half < (X.mountSpacing ?? 80) ? 'far apart as the flat of the back allows' : 'close as they can be'}.` });
    }
    for (const dx of count === 2 ? [-half, half] : [0]) holes.push({ angle: Math.PI / 2, z: zc, r: R0, slot: L || 0, w, dx });
    mount = { count, screw, head: 2 * headR, shaft: 2 * w, slot: L, spacing: 2 * half, drop, xs: count === 2 ? [-half, half] : [0] };
    extraMain.flatBack = { b, rTop: wallRTop };
  }
  // as it prints, a domed planter is upside down: so are its holes (a keyhole's slot runs down the print),
  // its plain bands, its pattern's gradient and its colour bands
  const mc = P.multicolor && P.multicolor.cuts && P.multicolor.cuts.length ? P.multicolor : null;
  let Pmain = P;
  if (domed) {
    Pmain = { ...P, surface: { ...S, bandBottom: S.bandTop, bandTop: S.bandBottom, gradient: -(S.gradient || 0) } };
    if (holes.length) extraMain.holes = holes.map((hl) => ({ ...hl, z: H - hl.z, down: !!hl.slot }));
    if (mc) {
      const order = mc.cuts.map((z, k) => [z, k]).sort((a, b) => a[0] - b[0]), nb = order.length + 1;
      extraMain.bands = { cuts: order.map(([z]) => H - z).reverse(), slots: Array.from({ length: nb }, (_, k) => mc.slots[nb - 1 - k] ?? 0) };
    }
  } else {
    if (holes.length) extraMain.holes = holes;
    if (mc) extraMain.bands = mc;
  }
  if (!domed && (rimEdge !== 'flat' || shaped)) extraMain.rim = { edge: rimEdge, shape: shaped ? rimShape : 'level', drop: rimDrop, waves: clamp(Math.round(F.rimWaves || 6), 2, 24) };
  const shell = makePatternedShell(domed ? ds.fn : rFn, domed ? ds.H : H, Pmain, quality, floor, top, extraMain);
  const mainKey = { globe: 'globe', candle: 'holder', planter: 'pot', hanging: 'pot', wall: 'pot', orchid: 'pot', box: 'box', pendant: 'shade', lamp: 'shade', lantern: 'lantern', bowl: 'bowl', tray: 'tray', vase: 'vase', cup: 'cup', ring: 'ring' }[obj];
  const mainLabel = { globe: 'Globe', candle: 'Candle holder', planter: 'Pot', hanging: 'Pot', wall: 'Pot', orchid: 'Pot', box: 'Box', pendant: 'Shade', lamp: 'Shade', lantern: 'Lantern', bowl: 'Bowl', tray: 'Tray', vase: top === 'cap' ? 'Vase (solid, for spiral vase mode)' : 'Vase', cup: 'Cup', ring: 'Ring' }[obj];

  let mainLift = 0;

  // ---- planter accessories
  if (potBase === 'sleeve') {
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
  if (potBase === 'saucer') {
    const r0 = rFn(0);
    const gap = relief + Math.max(3, X.gap + 2), t = 2, tf = 2, hs = 14, c = 1.2, fl = 2.5;
    const poly = [[0, 0, 0, true], [r0, 0, gap + t - c], [r0, c, gap + t], [r0, hs, gap + t + fl], [r0, hs, gap + fl], [r0, tf, gap], [0, tf, 0, true]];
    const segs = Math.max(96, Math.ceil(((r0 + gap) * accSec.L) / 1.2));
    add('saucer', 'Saucer', sweep(poly, accSec, segs), { z: 0, color: 1 });
    mainLift = tf;
  }

  // ---- table lamp base: printed top-down. Its top plate holds an E27 socket in a centre hole and has a
  // groove the shade stands in; a notch in the bottom edge lets the cord out.
  if (onBase) {
    const c = 0.45, tB = 3, plate = GROOVE + 2.6, Hb = clamp(X.baseH || (globe ? 45 : 55), 30, 140);
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
    const gap = clamp(X.gap ?? 1.5, 0.8, 4), tI = clamp(F.wall, 1.6, 3);
    // In a domed pot the insert stands above the part of the dome that is too steep to print the right
    // way up, and where the pot is wide enough for its floor: the bowl under it is the reservoir.
    let zrMin = F.floor + 6;
    if (domed) {
      const lim = Math.tan((44.5 * Math.PI) / 180) / (1 + wallBack), zb = clamp(F.belly, 0.08, 0.92) * H;
      let z = zb;
      // (a D's floor is as deep as its front and back are apart; it has to hold the wick hole and the
      // groove behind the mounting screw)
      const need = wallObj ? (2 * (F.wall + gap) + 2 * tI + 5.5 + 18) / (1 + wallBack) : 18 + F.wall + gap;
      while (z > 2 && (rFn(z) - rFn(z - 0.5)) / 0.5 <= lim && rFn(z - 0.5) >= need) z -= 0.5;
      zrMin = z + 1;
    }
    const zr = clamp(X.reservoir ?? 14, zrMin, Math.max(zrMin, H * 0.45));
    const fH = F.wall + gap + 1.5, Hi = H - zr + fH;
    // (a wall planter's rows are Ds on the wall, whose front moves 1 + back times as far as their radius
    // changes: the flare is that much gentler, so its front still rises at 45°)
    const flare = 1 / (1 + wallBack);
    // the insert has to drop in from above: at each height it may be no wider than the narrowest part of
    // the pot above it (a round insert in a twisted outline keeps to the circle inside that outline)
    const scaleIn = accSec === sec ? 1 : sec.minR, steps = 400, sufMin = new Float64Array(steps + 1);
    sufMin[steps] = rFn(H) * scaleIn;
    for (let k = steps - 1; k >= 0; k--) sufMin[k] = Math.min(sufMin[k + 1], rFn((H * k) / steps) * scaleIn);
    const fit = (z) => { const x = clamp((z / H) * steps, 0, steps), k = Math.min(steps - 1, Math.floor(x)); return sufMin[k] + (sufMin[k + 1] - sufMin[k]) * (x - k); };
    const iFn = (z) => fit(Math.min(H, z + zr)) + Math.max(0, z - (H - zr)) * flare;
    const PI2 = { ...P, form: { ...F, wall: tI, floor: tI, height: Hi }, surface: { ...S, pattern: 'smooth', mode: 'none', bandBottom: 0, bandTop: 0, swirl: 0 } };
    // water slots round the bottom of the insert: water poured in drains straight down, and the soil
    // drinks back up through them. Each has a round foot and a pointed top, so it prints; none sits in
    // the pour channel.
    const slots = [];
    if (X.slots !== false) {
      const w = 1.6, zc = tI + 3 + w, L = clamp((Hi - fH) * 0.22, 8, 22), rLow = Math.max(10, iFn(zc) - (F.wall + gap));
      const n = clamp(Math.round((TAU * rLow * (accSec.L / TAU)) / 14), 6, 40), keepOut = (13 + 7) / rLow;
      for (let k = 0; k < n; k++) {
        const a = -0.6 + (TAU * (k + 0.5)) / n, da = Math.abs(Math.atan2(Math.sin(a + 0.6), Math.cos(a + 0.6)));
        if (da > keepOut) slots.push({ angle: a, z: zc, r: w, slot: L, w });
      }
    }
    const insExtra = { cell: 1.6 / quality, sec: accSec, offset: -(F.wall + gap), channel: { angle: -0.6, width: 26, depth: 7 }, holes: slots };
    // the wick hole: Ø 14 mm, less where a small D-shaped floor has no room for it
    const insHole = wallObj ? clamp(((1 + secF.back) * iFn(0)) / 2 - (F.wall + gap) - tI - 5, 3, 7) : 7;
    // In a wall planter the insert is a D as well, its back a clearance in front of the pot's. A groove
    // down its back at each mounting hole clears the screw's head, so it drops in after the pot is hung.
    if (wallObj) {
      // (the floor keeps room for its wick hole in front of the groove)
      const room = (1 + secF.back) * iFn(0) - 2 * (F.wall + gap) - 2 * tI - 2 * insHole - 3, depth = Math.min(5.5, room);
      const headW = mount.screw ? Math.max(11, 2.4 * mount.shaft) : mount.head;
      // (no water slot sits in a groove: its pointed top would lose its slope where the groove sets the wall back)
      if (depth > 1 && slots.length) {
        const cols = sectionColumns(accSec, 720);
        insExtra.holes = slots.filter((sl) => {
          let ic = 0, best = Infinity;
          for (let i = 0; i < 720; i++) { const da = Math.abs(Math.atan2(Math.sin(cols.A[i] - sl.angle), Math.cos(cols.A[i] - sl.angle))); if (da < best) { best = da; ic = i; } }
          // (from its foot to its tip: the wall widens on the way up, and carries the slot sideways with it)
          const clear = (z) => { const x = iFn(z) * cols.CX[ic] - (F.wall + gap) * cols.NX[ic]; return mount.xs.every((gx) => Math.abs(x - gx) > (headW + 7) / 2 + 5); };
          return cols.NY[ic] < 0.3 || (clear(sl.z - sl.r) && clear(sl.z + sl.slot / 2) && clear(sl.z + sl.slot + 3));
        });
      }
      insExtra.offsetLean = { wall: F.wall, to: Hi - fH - 0.5 };
      insExtra.flatBack = { b: secF.back, rTop: wallRTop, grooves: depth > 1 ? mount.xs.map((x) => ({ x, width: headW + 7, depth })) : [] };
      if (depth < 4.5) warnings.push({ level: 'warn', text: `The insert is too shallow at the back for a full groove behind the mounting screw: its groove is ${Math.max(0, depth).toFixed(1)} mm deep. Use a screw with a head no thicker than ${Math.max(0, depth - 1.5 + gap).toFixed(1)} mm, or make the planter deeper under Object.` });
    }
    const ins = makePatternedShell(iFn, Hi, PI2, quality, { type: 'hole', thick: tI, holeR: insHole }, 'rim', insExtra);
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
    // (in a dome the reservoir is the bowl itself: its inside, slice by slice, up to just under the insert)
    if (domed) {
      const unit = Math.abs(area) / Math.max(1e-6, (rIn - F.wall) ** 2), z0 = F.wall * 1.2, n = 40;
      reservoirMl = 0;
      for (let q = 0; q < n; q++) { const z = z0 + ((zr - 2 - z0) * (q + 0.5)) / n; reservoirMl += (unit * Math.max(0, rFn(z) - F.wall) ** 2 * Math.max(0, zr - 2 - z0)) / n / 1000; }
    }
    if (zr > H - 25) warnings.push({ level: 'warn', text: 'The reservoir is very tall; the insert has little room for soil.' });
  }

  // (a domed planter is shown the right way up by turning the print over, about the axis square to the
  // wall, so a flat back stays on the wall)
  add(mainKey, mainLabel, shell.mesh, domed ? { z: H, flipZ: true, turnY: true, color: 0 } : { z: mainLift, color: 0, flip: obj === 'pendant' });
  // (relief near the tip stands a little past it: the piece is lifted by that much, so nothing dips under z = 0)
  if (domed) { const pm = parts[parts.length - 1]; mainLift = Math.max(0, pm.stats.bbox[5] - H); pm.place.z = H + mainLift; for (const p of parts) if (p !== pm) p.place.z = (p.place.z || 0) + mainLift; }
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
    // a twisted, shaped opening turns under the plug as it goes in, so the plug keeps the outline's shape,
    // shrunk just enough to stay inside the opening through that turn
    const plugScale = !sec.round && twist !== 0 ? turnedScale(sec, (Math.abs(twist) * (hp + 1)) / H + 0.01) : 1;
    const po = -wallN - X.clearance;
    const pl = (z, extraO) => [rP * plugScale, z, po + extraO];
    const poly = [
      [holeR, 0, 0, true], [rT, 0, oOut - c], [rT, c, oOut], [rT, tp, oOut],
      pl(tp, 0), pl(tp + hp - 0.8, 0), pl(tp + hp, -0.8), pl(tp + hp, -tpl), pl(tp, -tpl), [holeR, tp, 0, true],
    ];
    const segs = Math.max(128, Math.ceil(((rT + oOut) * sec.L) / 1.0));
    // printed upside down: mirror the twist so it lines up once flipped onto the box
    add('lid', 'Lid', sweep(poly, sec, segs, -twist), { z: H + tp, flipZ: true, color: 2, lidLift: true });
    const plugInner = rP * plugScale * sec.minR + po - tpl;
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

  // ---- plant stand: two flat interlocking pieces; the pot and its accessories sit on the crossbars
  if (standOn) {
    const style = { mid: { splay: 8, taper: 0.7 }, upright: { splay: 0, taper: 1 }, wide: { splay: 15, taper: 0.62 } }[X.stand] || { splay: 8, taper: 0.7 };
    const leg = clamp(X.standLeg ?? 12, 8, 24), bar = clamp(leg * 1.15, 10, 26), lift = clamp(X.standLift ?? 70, bar + 6, 300);
    const hug = clamp((X.standHug ?? 0.35) * H, 8, H * 0.9);
    // how far the piece (with its sleeve or saucer) reaches out at each height, along each bar's direction
    const secPts = makeSection(secF), far = (ax) => { let m = 0; for (let q = 0; q < secPts.M; q += 2) m = Math.max(m, Math.abs(secPts.x[q] * Math.cos(ax) + secPts.y[q] * Math.sin(ax))); return m; };
    const extFor = (ax) => {
      const k = far(ax);
      return (h) => {
        let e = rFn(clamp(h - mainLift, 0, H)) * k + relief;
        if (potBase === 'sleeve') e = Math.max(e, rFn(0) * k + relief + X.gap + 4.5);
        if (potBase === 'saucer' && h < 16) e = Math.max(e, rFn(0) * k + relief + Math.max(3, X.gap + 2) + 4.5);
        return e;
      };
    };
    const T = leg;
    const a = standOutline({ lift, hug: hug + mainLift, leg, bar, ext: extFor(0), ...style, notch: { from: 'top', w: T + 0.35 } });
    const b = standOutline({ lift, hug: hug + mainLift, leg, bar, ext: extFor(Math.PI / 2), ...style, notch: { from: 'bottom', w: T + 0.35 } });
    for (const p of parts) p.place.z = (p.place.z || 0) + lift;
    mainLift += lift;
    add('standA', 'Stand, piece A', extrudePolygon(a.pts, T), { z: 0, rot: [Math.PI / 2, 0, 0], pos: [0, T / 2, 0], span: a.span, height: a.height, color: 1 });
    add('standB', 'Stand, piece B', extrudePolygon(b.pts, T), { z: 0, rot: [Math.PI / 2, 0, Math.PI / 2], pos: [-T / 2, 0, 0], span: b.span, height: b.height, color: 1 });
    standInfo = { lift, leg: T, span: Math.max(a.span, b.span), height: Math.max(a.height, b.height) };
  }

  // ---- checks
  const checks = [];
  const cellW = (TAU * shell.rMax * shell.perim) / Math.max(1, S.count);
  const cellMin = Number.isFinite(shell.scMin) ? shell.scMin : (TAU * shell.rMin * shell.perim) / Math.max(1, S.count);
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
  else if (F.wall < 2 && top !== 'cap' && top !== 'pocket' && !globe) checks.push({ level: 'warn', text: `Wall ${F.wall.toFixed(1)} mm is thin and can flex or crack. 3 mm makes a sturdy piece.` });
  else if (!globe) checks.push({ level: 'ok', text: `Wall ${F.wall.toFixed(1)} mm ≈ ${loops} wall loop${loops > 1 ? 's' : ''} at 0.45 mm line width.` });
  const overArea = parts.reduce((acc, p) => acc + p.stats.overhang, 0);
  const bridgeArea = parts.reduce((acc, p) => acc + p.stats.bridge, 0);
  const totalArea = parts.reduce((acc, p) => acc + p.stats.area, 0);
  // a closed globe leans past 45° by design: say where it needs supports, and how to print it
  const globeNeeds = [];
  if (globe && !gs.peak) globeNeeds.push(`the round top leans past 45° above ${Math.round(gs.zOver)} mm, so it needs supports inside`);
  if (globe && gs.underTo > 0) globeNeeds.push(`the round underside leans past 45° from the collar out to Ø ${Math.round(2 * gs.underTo)} mm, so it needs supports round the collar`);
  if (globe && !globeNeeds.length && mode === 'relief' && overArea > 60) globeNeeds.push(`the raised pattern leans past 45° in places (${(overArea / 100).toFixed(1)} cm², striped on the model), so it needs supports there too; openwork or Smooth keeps this shape support-free`);
  if (globeNeeds.length) {
    const fix = [!gs.peak ? 'a Peak top' : null, gs.underTo > 0 ? 'a Cone underside' : null].filter(Boolean).join(' and ');
    checks.push({ level: 'warn', text: `Needs supports. This is a closed globe: ${globeNeeds.join('; ')}. Use tree supports on the build plate only: inside the ball they grow up through the Ø ${Math.round(2 * (gs.rn - F.wall))} mm opening and come out through it. Supports leave marks that show when it is lit.${fix ? ` ${fix[0].toUpperCase()}${fix.slice(1)} would print without them (striped on the model).` : ''}` });
  } else if (domed && !ds.point && overArea > 60) {
    // a round dome closes over the top of the print: inside, it leans past 45° from here up
    checks.push({ level: 'warn', text: `Needs supports inside. It prints rim-down, and the round bottom closes over the top of the print: inside, it leans past 45° for the last ${Math.round(H - ds.zOver)} mm (Ø ${Math.round(2 * ds.rOver)} mm, ${(overArea / 100).toFixed(0)} cm², striped in Print check). Use tree supports on the build plate only: they grow up inside the pot and come out through the opening. A Pointed bottom closes at 45° and prints without them.` });
  } else if (overArea / totalArea > 0.01 || overArea > 500) checks.push({ level: 'bad', text: `${(overArea / 100).toFixed(1)} cm² overhangs past 46°. It is striped on the model; add supports or change the shape.` });
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
  if (domed) checks.push({ level: 'ok', text: `Prints rim-down, the ${ds.point ? 'pointed' : 'round'} bottom last, and the pattern runs over it to the tip.${ds.hole ? ` The Ø ${Math.round(X.drain)} mm drainage hole is at the tip.` : ''}${F.rimShape && F.rimShape !== 'level' && (F.rimDepth || 0) > 0.5 ? ' The rim is level, as it stands on the bed.' : ''}` });
  if (obj === 'hanging') checks.push({ level: 'ok', text: `Hangs from ${holes.length} cords through teardrop holes under the rim (up to Ø 4 mm cord).${floor.type === 'hole' || (domed && ds.hole) ? ' Water drips from the drainage hole.' : ' No drainage hole: water sparingly.'}` });
  if (wallObj && mount) {
    const two = mount.count === 2, apart = two ? `, ${Math.round(mount.spacing)} mm apart` : '';
    checks.push({ level: 'ok', text: mount.screw
      ? `The flat back has ${two ? 'two' : 'a'} Ø ${mount.shaft.toFixed(1)} mm screw hole${two ? 's' : ''}${apart}, ${Math.round(mount.drop)} mm under the rim: screw it to the wall from inside the pot.`
      : `The flat back has ${two ? 'two keyholes' : 'a keyhole'}${apart}, for ${two ? 'screws' : 'a screw'} with a head up to ${(mount.head - 1.2).toFixed(0)} mm and a shaft up to ${(mount.shaft - 0.4).toFixed(1)} mm. Leave the head${two ? 's' : ''} 4 mm out of the wall and hook the planter over ${two ? 'them' : 'it'}; it drops ${Math.round(mount.slot)} mm onto the shaft${two ? 's' : ''}.` });
  }
  if (standInfo) checks.push({ level: 'ok', text: `Stand: two flat pieces that slot together into a cross; the pot sits ${Math.round(standInfo.lift)} mm up on the crossbars. Both print flat with no supports.` });
  if (candle) {
    let rMin = Infinity; for (let j = 0; j < shell.rows.n; j++) if (shell.rows.z[j] > H - candle.depth - 1) rMin = Math.min(rMin, shell.rows.r[j] * sec.minR);
    if (rMin < candle.d / 2 + 2.5) checks.push({ level: 'bad', text: `The top is too narrow for a ${candle.label} (Ø ${candle.d} mm): widen the rim to at least Ø ${Math.ceil(candle.d + 6)} mm.` });
    else checks.push({ level: 'ok', text: `The ${candle.label} sits in a Ø ${candle.d} × ${Math.round(extraMain.pocket.depth)} mm pocket in the top. Print it solid with 15% infill. LED candles are safest; a real one needs a glass or metal cup.` });
  }
  if (obj === 'lantern') checks.push({ level: 'ok', text: 'For LED tealights only, never a real flame: PLA and PETG soften from about 60 °C.' });
  if (insert) checks.push({ level: 'ok', text: `Self-watering: the reservoir holds about ${Math.round(reservoirMl / 10) * 10} ml under the insert${X.slots !== false ? ', and the slots round its foot let the soil drink from it' : ''}. Fill it through the channel at the rim${X.slots !== false ? '' : ", and thread a cotton wick through the hole in the insert's floor"}.${wallObj ? ` The insert is flat at the back like the pot, with a groove behind ${mount.count === 2 ? 'each mounting screw' : 'the mounting screw'}: hang the pot first, then drop the insert in.${domed ? ' It prints the right way up, on its own floor.' : ''}` : ''}` });
  if (globe) {
    const lines = Math.max(1, Math.round(F.wall / 0.44)), inner = 2 * (gs.rn - F.wall - 0.45);
    if (inner < 64) checks.push({ level: 'warn', text: `The opening is Ø ${Math.round(inner)} mm inside, too narrow to lift the globe over an A60 bulb (Ø 60 mm). Widen it, or use a G45 or P45 bulb (Ø 45 mm).` });
    else checks.push({ level: 'ok', text: `The globe stands in a groove in the base and lifts off over the bulb (opening Ø ${Math.round(inner)} mm inside).` });
    checks.push({ level: 'ok', text: 'A closed globe keeps the heat in: LED bulbs only, 7 W or less. PETG copes with warmth better than PLA.' });
    checks.push({ level: 'ok', text: `Wall ${F.wall.toFixed(1)} mm is about ${lines} line${lines > 1 ? 's' : ''} wide. In translucent filament ${lines <= 2 ? 'that is the brightest, but the bulb shows through as a bright spot' : lines <= 4 ? 'it glows evenly and stays bright' : 'it glows softly but noticeably dimmer'}; 3 to 4 lines (1.3 to 1.8 mm) is the usual sweet spot.` });
  }
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
  const colorChanges = mc && (top === 'cap' || top === 'pocket') ? mc.cuts.map((z) => Math.round(clamp(z, 3, H - 3) / 0.2) * 0.2) : shell.cuts || [];
  // where the wall is, for the preview: the plane of a wall planter's flat back
  let wallY = null;
  if (wallObj) wallY = secF.back * wallRTop;
  // and where the hanging cords leave the holes (just outside the wall, after any twist)
  let hangers = null;
  if (obj === 'hanging') {
    const cols = sectionColumns(sec, 720);
    hangers = holes.map((hl) => {
      let ic = 0, best = Infinity;
      for (let i = 0; i < 720; i++) { const da = Math.abs(Math.atan2(Math.sin(cols.A[i] - hl.angle), Math.cos(cols.A[i] - hl.angle))); if (da < best) { best = da; ic = i; } }
      // (a domed planter is built upside down and turned over for the view: its twist runs from the rim)
      const r = rFn(hl.z), phi = (twist * (domed ? H - hl.z : hl.z)) / (domed ? ds.H : H);
      const x0 = r * cols.CX[ic] + 1.5 * cols.NX[ic], y0 = r * cols.CY[ic] + 1.5 * cols.NY[ic];
      return { x: (domed ? -1 : 1) * (x0 * Math.cos(phi) - y0 * Math.sin(phi)), y: x0 * Math.sin(phi) + y0 * Math.cos(phi), z: hl.z };
    });
  }
  return { parts, checks, info: { cell: shell.cell, NU: shell.NU, rows: shell.rows.n, mainKey, eased, lift: mainLift, colorChanges, wallY, hangers, domed, mount, stand: standInfo, globe: gs ? { top: gs.top, R: gs.R, zc: gs.zc, rn: gs.rn, peak: gs.peak, cone: gs.cone } : null } };
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
