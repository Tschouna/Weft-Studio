// Weft panels: flat wall panels carrying a relief or openwork pattern, sliced into tiles that fit the bed.
// Every tile prints face up on its flat back, so its top is a height field and nothing ever overhangs: the
// openings, joints and edges are straight walls, and the pockets in the back only bridge a few millimetres.
//
// Geometry: a tile is a stack of flat slabs (the back pockets end on their ceilings) under a top height
// field. It is meshed on a grid of triangles, each clipped exactly against every boundary that crosses it
// (outline, openings, joints, pockets, the colour split). The fields are linear on a triangle, so the clip is
// exact, and every point where a boundary crosses an edge or two boundaries meet is shared by everything
// that touches it. Every tile comes out closed and manifold.

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ============================================================ noise
function hash2(i, j, s) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul((s | 0) + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
// gradient noise, about 0..1
function gnoise(x, y, s) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const g = (a, b, dx, dy) => { const t = hash2(a, b, s) * TAU; return Math.cos(t) * dx + Math.sin(t) * dy; };
  const n = lerp(lerp(g(i, j, fx, fy), g(i + 1, j, fx - 1, fy), ux), lerp(g(i, j + 1, fx, fy - 1), g(i + 1, j + 1, fx - 1, fy - 1), ux), uy);
  return 0.5 + n * 0.72;
}
function fbm(x, y, s, oct) {
  let v = 0, a = 0.5, n = 0;
  for (let k = 0; k < oct; k++) { v += a * gnoise(x, y, s + k * 17); n += a; x = x * 2.03 + 11.7; y = y * 2.03 - 5.3; a *= 0.5; }
  return v / n;
}
// Voronoi cell of a jittered grid: [i, j, site u, site v, distance to the cell edge]
const VR = [0, 0, 0, 0, 0];
function voronoi(u, v, s, jit) {
  const i0 = Math.floor(u), j0 = Math.floor(v);
  let md = 1e9, mi = 0, mj = 0, mx = 0, my = 0;
  for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
    const ci = i0 + a, cj = j0 + b;
    const px = ci + 0.5 + jit * (hash2(ci, cj, s) - 0.5), py = cj + 0.5 + jit * (hash2(ci, cj, s + 7) - 0.5);
    const d = (px - u) ** 2 + (py - v) ** 2;
    if (d < md) { md = d; mi = ci; mj = cj; mx = px; my = py; }
  }
  let me = 1e9;
  for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
    if (!a && !b) continue;
    const ci = mi + a, cj = mj + b;
    const px = ci + 0.5 + jit * (hash2(ci, cj, s) - 0.5), py = cj + 0.5 + jit * (hash2(ci, cj, s + 7) - 0.5);
    const ex = px - mx, ey = py - my, el = Math.hypot(ex, ey);
    me = Math.min(me, -((u - (mx + px) / 2) * ex + (v - (my + py) / 2) * ey) / el);
  }
  VR[0] = mi; VR[1] = mj; VR[2] = mx; VR[3] = my; VR[4] = me;
  return VR;
}
// Hexagons with centres 1 apart (pointy top): [q, r, centre u, centre v, distance to the cell edge]
const HX = [0, 0, 0, 0, 0];
function hexCell(u, v) {
  const r = (2 * v) / Math.sqrt(3), q = u - r / 2;
  let x = q, z = r;
  const y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  const cx = rx + rz / 2, cy = 0.8660254 * rz;
  const px = u - cx, py = v - cy;
  const m = Math.max(Math.abs(px), Math.abs(0.5 * px + 0.8660254 * py), Math.abs(0.5 * px - 0.8660254 * py));
  HX[0] = rx; HX[1] = rz; HX[2] = cx; HX[3] = cy; HX[4] = 0.5 - m;
  return HX;
}
const SQ = [0, 0, 0, 0, 0];
function squareCell(u, v) {
  const i = Math.floor(u), j = Math.floor(v);
  SQ[0] = i; SQ[1] = j; SQ[2] = i + 0.5; SQ[3] = j + 0.5;
  SQ[4] = 0.5 - Math.max(Math.abs(u - i - 0.5), Math.abs(v - j - 0.5));
  return SQ;
}
function brickCell(u, v) {
  const j = Math.floor(v * 2), off = (j & 1) * 0.5, i = Math.floor(u + off);
  const fu = u + off - i, fv = v * 2 - j;
  SQ[0] = i; SQ[1] = j; SQ[2] = i + 0.5 - off; SQ[3] = (j + 0.5) / 2;
  SQ[4] = Math.min(fu, 1 - fu, fv * 0.5, (1 - fv) * 0.5);
  return SQ;
}
function diamondCell(u, v) {
  const a = (u + v) * 0.70710678, b = (v - u) * 0.70710678;
  const i = Math.floor(a), j = Math.floor(b), fa = a - i - 0.5, fb = b - j - 0.5;
  const ca = i + 0.5, cb = j + 0.5;
  SQ[0] = i; SQ[1] = j; SQ[2] = (ca - cb) * 0.70710678; SQ[3] = (ca + cb) * 0.70710678;
  SQ[4] = 0.5 - Math.max(Math.abs(fa), Math.abs(fb));
  return SQ;
}
// Fish scales: rows half a unit apart; the scale in the higher row lies on top.
const SC = [0, 0, 0, 0, 0];
const SCALE_R = 0.53;
function scaleCell(u, v) {
  const j0 = Math.floor(v * 2);
  let bj = 0, bx = 0, by = 0, bi = 0, found = false;
  for (let jj = j0 + 2; jj >= j0 - 1 && !found; jj--) {
    const cy = jj * 0.5, off = (jj & 1) * 0.5, ii = Math.round(u - off - 0.5), cx = ii + off + 0.5;
    if ((u - cx) ** 2 + (v - cy) ** 2 < SCALE_R * SCALE_R) { found = true; bi = ii; bj = jj; bx = cx; by = cy; }
  }
  if (!found) { bj = j0; const off = (bj & 1) * 0.5; bi = Math.round(u - off - 0.5); bx = bi + off + 0.5; by = bj * 0.5; }
  let d = Math.min(SCALE_R - Math.hypot(u - bx, v - by), 0.5 - Math.abs(u - bx));
  for (let jj = bj + 1; jj <= bj + 2; jj++) {
    const cy = jj * 0.5, off = (jj & 1) * 0.5, ib = Math.round(u - off - 0.5);
    for (let ii = ib - 1; ii <= ib + 1; ii++) d = Math.min(d, Math.hypot(u - (ii + off + 0.5), v - cy) - SCALE_R);
  }
  SC[0] = bi; SC[1] = bj; SC[2] = bx; SC[3] = by; SC[4] = Math.max(d, 0);
  return SC;
}

// ============================================================ patterns
// Each pattern is a height h(u, v) from 0 to 1 in pattern units (one unit = the Scale in mm). Openwork
// patterns also give cut(u, v): positive where the panel stays solid, in pattern units, and set o.bh to
// the height of the bars. Cell patterns give cell(u, v), so tile seams can run along their grooves.
const bar = (o) => Math.max(o.minBar, 0.035 + 0.15 * (1 - o.open));
const rounded = (d, w) => (d < w ? Math.sqrt(1 - (d / w) ** 2) : 0);
const dome = (t) => { t = clamp(t, 0, 1); return Math.sqrt(1 - (1 - t) * (1 - t)); };
function bubbles(u, v, o, cut) {
  const i0 = Math.floor(u), j0 = Math.floor(v);
  let h = 0, c = 9;
  const rmax = Math.min(0.42, 0.46 - o.minBar);
  for (let j = j0 - 1; j <= j0 + 1; j++) for (let i = i0 - 1; i <= i0 + 1; i++) {
    const cx = i + 0.5 + (hash2(i, j, o.seed) - 0.5) * 0.08, cy = j + 0.5 + (hash2(i, j, o.seed + 1) - 0.5) * 0.08;
    let r = rmax * (1 - o.vary * 0.62 * hash2(i, j, o.seed + 2));
    if (cut) r *= 0.5 + 0.5 * o.open;
    const d = Math.hypot(u - cx, v - cy);
    if (d < r) h = Math.max(h, (0.45 + (0.55 * r) / rmax) * Math.sqrt(1 - (d / r) ** 2));
    c = Math.min(c, d - r);
  }
  return cut ? c : h;
}
function quatre(u, v, o) {
  const x = u - Math.floor(u) - 0.5, y = v - Math.floor(v) - 0.5;
  const e = 0.15, rl = clamp(0.13 + 0.11 * o.open, 0.08, 0.35 - o.minBar);
  return Math.min(Math.hypot(x - e, y), Math.hypot(x + e, y), Math.hypot(x, y - e), Math.hypot(x, y + e)) - rl;
}
function halftoneDot(u, v, o) {
  const c = hexCell(u, v);
  const t = o.toneAt(c[2], c[3]);
  const r = Math.min(0.5 - o.minBar, 0.47 * Math.sqrt(clamp(t, 0, 1)));
  return [Math.hypot(u - c[2], v - c[3]), r];
}
function trellisD(u, v) {
  const a = (u + v) * 0.70710678, b = (v - u) * 0.70710678;
  return 0.5 - Math.max(Math.abs(a - Math.floor(a) - 0.5), Math.abs(b - Math.floor(b) - 0.5));
}

export const PANEL_PATTERNS = {
  dune: { label: 'Dune', note: 'Rolling waves, like a plaster wave panel', h(u, v, o) { const a = 0.16 + 0.34 * o.vary; return 0.5 - 0.5 * Math.cos(TAU * (u + a * Math.sin(TAU * v * 0.42))); } },
  ripple: {
    label: 'Ripple', note: 'Rings spreading from one, two or three drops', radial: true,
    h(u, v, o) {
      const n = 1 + Math.round(o.vary * 2);
      let s = 0;
      for (let k = 0; k < n; k++) {
        const sx = k ? (hash2(k, 1, o.seed) - 0.5) * 1.5 * o.span[0] : 0, sy = k ? (hash2(k, 2, o.seed) - 0.5) * 1.5 * o.span[1] : 0;
        s += Math.cos(TAU * Math.hypot(u - sx, v - sy));
      }
      return 0.5 + (0.5 * s) / n;
    },
  },
  chevron: { label: 'Chevron', note: 'Zigzag ridges across the panel', h(u, v, o) { const t = Math.abs((u - Math.floor(u)) * 2 - 1); return 0.5 - 0.5 * Math.cos(TAU * (v + (0.35 + 0.5 * o.vary) * t)); } },
  vortex: {
    label: 'Vortex', note: 'Spiral arms around a raised boss', radial: true,
    h(u, v, o) {
      const r = Math.hypot(u, v), th = Math.atan2(v, u), N = 2 + Math.round(o.vary * 6);
      const w = 0.5 + 0.5 * Math.cos(TAU * r - N * th);
      return lerp(0.9, w, smooth(0.35, 1.3, r));
    },
  },
  sunburst: {
    label: 'Sunburst', note: 'Art deco rays round a sun disc', radial: true,
    h(u, v, o) {
      const r = Math.hypot(u, v), th = Math.atan2(v, u);
      const N = Math.max(16, Math.round((TAU * (o.span[0] + o.span[1])) / 2 / (1.5 - 0.7 * o.vary)));
      const r0 = Math.max(0.8, (N * 0.62) / TAU);
      const sun = 1 - smooth(r0 - 0.4, r0 - 0.08, r);
      const rays = Math.pow(0.5 + 0.5 * Math.cos(N * th), 0.7) * smooth(r0 + 0.05, r0 + 0.7, r);
      return Math.max(sun, rays);
    },
  },
  contour: {
    label: 'Contour', note: 'Terraced hills like a topographic map',
    h(u, v, o) {
      const n = fbm(u * 0.3, v * 0.3, o.seed, 4), steps = Math.round(5 + 7 * o.vary);
      const t = clamp((n - 0.2) / 0.6, 0, 0.9999) * steps, i = Math.floor(t);
      return (i + smooth(0.68, 1, t - i)) / steps;
    },
  },
  ridge: {
    label: 'Ridge', note: 'A mountain range',
    h(u, v, o) {
      let s = 0, a = 1, f = 0.26, w = 1, n = 0;
      for (let k = 0; k < 4; k++) {
        let r = 1 - Math.abs(gnoise(u * f, v * f, o.seed + k * 31) * 2 - 1);
        r = r * r * w; w = clamp(r * 2, 0, 1);
        s += r * a; n += a; a *= 0.5; f *= 2.05;
      }
      return clamp((s / n) * (1.25 + 0.6 * o.vary), 0, 1);
    },
  },
  silk: {
    label: 'Silk', note: 'Broad diagonal folds drifting across the panel, like pulled silk. Made for ribs',
    h(u, v, o) {
      const drift = 0.3 * Math.sin(TAU * (u - v) * 0.21 + o.seed) + 0.18 * Math.sin(TAU * v * 0.37 + o.seed * 1.7);
      const c = Math.cos(TAU * ((u + v) * 0.55 + drift * (0.6 + o.vary))), fold = Math.sign(c) * Math.abs(c) ** 0.6;
      return clamp(0.5 + 0.44 * fold + 0.06 * Math.sin(TAU * (u * 0.31 - v * 0.17) + o.seed * 2.3), 0, 1);
    },
  },
  bloom: {
    label: 'Bloom', note: 'Petals opening from a dome in the middle. Made for ribs', radial: true,
    h(u, v, o) {
      const r = Math.hypot(u, v), th = Math.atan2(v, u), N = 5 + Math.round(o.vary * 4);
      // the petals open out of a smooth dome, so nothing pinches where they all meet
      const open = smooth(0.25, 1.6, r), petals = lerp(1, 0.5 + 0.5 * Math.cos(N * th + 1.4 * r), open);
      const env = Math.exp(-r * r * 0.18);
      return clamp(env * (0.45 + 0.55 * petals) + 0.12 * Math.cos(TAU * r * 0.5) * (1 - env), 0, 1);
    },
  },
  lens: {
    label: 'Lens', note: 'Two fine wave grids crossing at a shallow angle, gathering into a lens',
    h(u, v, o) {
      const a = 0.18 + 0.25 * o.vary, w1 = Math.cos(TAU * u * 1.6), w2 = Math.cos(TAU * 1.6 * (u * Math.cos(a) + v * Math.sin(a)));
      const lens = Math.exp(-((u * 0.35) ** 2 + (v * 0.5) ** 2));
      return clamp(0.5 + 0.25 * (w1 + w2) * (0.4 + 0.6 * lens), 0, 1);
    },
  },
  pyramid: {
    label: 'Pyramid', note: 'Square pyramids; Variation tilts each apex', cellR: 0.71, grid: [1, 1], cell: squareCell,
    h(u, v, o) {
      const i = Math.floor(u), j = Math.floor(v);
      let ax = 0.5, ay = 0.5;
      if (o.vary > 0) { ax += (hash2(i, j, o.seed) - 0.5) * 0.55 * o.vary; ay += (hash2(i, j, o.seed + 9) - 0.5) * 0.55 * o.vary; }
      const du = u - i - ax, dv = v - j - ay;
      return 1 - Math.max(du > 0 ? du / (1 - ax) : -du / ax, dv > 0 ? dv / (1 - ay) : -dv / ay);
    },
  },
  facet: {
    label: 'Facet', note: 'Low-poly triangles at random heights',
    h(u, v, o) {
      const b = v / 0.8660254, a = u - b * 0.5, i = Math.floor(a), j = Math.floor(b), fa = a - i, fb = b - j;
      const amp = 0.8 + 0.2 * o.vary, H = (p, q) => 0.5 + (hash2(p, q, o.seed) - 0.5) * amp;
      if (fa + fb < 1) return clamp(H(i, j) * (1 - fa - fb) + H(i + 1, j) * fa + H(i, j + 1) * fb, 0, 1);
      return clamp(H(i + 1, j + 1) * (fa + fb - 1) + H(i, j + 1) * (1 - fa) + H(i + 1, j) * (1 - fb), 0, 1);
    },
  },
  pixel: {
    label: 'Pixel', note: 'Square blocks at random heights', cellR: 0.71, grid: [1, 1], cell: squareCell,
    h(u, v, o) {
      const c = squareCell(u, v), top = 1 - o.vary * 0.8 * hash2(c[0], c[1], o.seed);
      return top * Math.min(1, c[4] / clamp(0.6 * o.k * top, 0.03, 0.2));
    },
  },
  basalt: {
    label: 'Basalt', note: 'Hexagonal columns, like a basalt shore', cellR: 0.58, cell: hexCell, cut: true,
    h(u, v, o) { const c = hexCell(u, v), top = 1 - o.vary * 0.7 * hash2(c[0], c[1], o.seed); return top * Math.min(1, c[4] / clamp(0.6 * o.k * top, 0.04, 0.22)); },
    cut(u, v, o) { const d = hexCell(u, v)[4], bw = bar(o); o.bh = rounded(d, bw); return bw - d; },
  },
  brick: {
    label: 'Brick', note: 'Running bond with rounded bricks', cellR: 0.56, grid: [null, 0.5], cell: brickCell,
    h(u, v, o) {
      const c = brickCell(u, v), top = 1 - o.vary * 0.35 * hash2(c[0], c[1], o.seed);
      return top * dome((c[4] - 0.03) / clamp(0.5 * o.k * top, 0.03, 0.12));
    },
  },
  pebble: {
    label: 'Pebble', note: 'Plump cells, like river stones', cellR: 1.1, cut: true, cell: (u, v, o) => voronoi(u, v, o.seed, 0.9),
    h(u, v, o) { const c = voronoi(u, v, o.seed, 0.9), top = 1 - o.vary * 0.55 * hash2(c[0], c[1], o.seed + 3); return top * dome(c[4] / clamp(o.k * top + 0.06, 0.1, 0.42)); },
    cut(u, v, o) { const d = voronoi(u, v, o.seed, 0.9)[4], bw = bar(o) * 0.8; o.bh = rounded(d, bw); return bw - d; },
  },
  scale: {
    label: 'Scale', note: 'Overlapping fish scales', cellR: 0.6, cell: scaleCell,
    h(u, v, o) { const c = scaleCell(u, v), top = 1 - o.vary * 0.5 * hash2(c[0], c[1], o.seed); return top * dome(c[4] / clamp(0.7 * o.k + 0.04, 0.06, 0.24)); },
  },
  deco: {
    label: 'Deco', note: 'Art deco fans with radial ribs', cellR: 0.6, cell: scaleCell,
    h(u, v, o) {
      const c = scaleCell(u, v), r = Math.hypot(u - c[2], v - c[3]) / SCALE_R;
      const ribs = 0.5 + 0.5 * Math.cos(Math.atan2(v - c[3], u - c[2]) * (9 + Math.round(o.vary * 6)));
      return dome(c[4] / clamp(0.7 * o.k + 0.04, 0.06, 0.2)) * (0.6 + 0.4 * lerp(1, ribs, smooth(0.18, 0.42, r)));
    },
  },
  tufted: {
    label: 'Tufted', note: 'Buttoned cushions, like a Chesterfield', cellR: 0.71, cell: diamondCell,
    h(u, v, o) {
      const a = (u + v) * 0.70710678, b = (v - u) * 0.70710678, fa = a - Math.floor(a) - 0.5, fb = b - Math.floor(b) - 0.5;
      let h = Math.pow(Math.max(0, Math.cos(Math.PI * fa) * Math.cos(Math.PI * fb)), 0.65 - 0.3 * o.vary);
      const rc = Math.hypot(0.5 - Math.abs(fa), 0.5 - Math.abs(fb));
      if (rc < 0.075) h = Math.max(h, 0.24 * Math.sqrt(1 - (rc / 0.075) ** 2));
      return h;
    },
  },
  weave: {
    label: 'Weave', note: 'Strips woven over and under',
    h(u, v, o) {
      const i = Math.floor(u), j = Math.floor(v), fu = u - i - 0.5, fv = v - j - 0.5, w = 0.44 - 0.14 * o.vary;
      const zh = 0.5 + 0.5 * Math.cos(Math.PI * (u - 0.5) + Math.PI * j), zv = 0.5 - 0.5 * Math.cos(Math.PI * (v - 0.5) + Math.PI * i);
      return Math.max((0.3 + 0.7 * zh) * rounded(Math.abs(fv), w), (0.3 + 0.7 * zv) * rounded(Math.abs(fu), w));
    },
  },
  reed: {
    label: 'Reed', note: 'Upright half-round reeds; Invert for flutes', grid: [1, null], cut: true,
    h(u) { const f = (u - Math.floor(u)) * 2 - 1; return Math.sqrt(Math.max(0, 1 - f * f)); },
    cut(u, v, o) { const f = Math.abs(u - Math.floor(u) - 0.5), half = Math.max(o.minBar, 0.5 - (0.08 + 0.3 * o.open)); o.bh = rounded(f, half); return half - f; },
  },
  truchet: {
    label: 'Truchet', note: 'A maze of round tubes',
    h(u, v, o) {
      const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j, ax = hash2(i, j, o.seed) < 0.5 ? 0 : 1;
      const d = Math.min(Math.abs(Math.hypot(fx - ax, fy) - 0.5), Math.abs(Math.hypot(fx - (1 - ax), fy - 1) - 0.5));
      return rounded(d, 0.15 + 0.1 * o.vary);
    },
  },
  moroccan: {
    label: 'Moroccan', note: 'A lattice of quatrefoils', cut: true,
    h(u, v, o) { return dome(quatre(u, v, o) / 0.1); },
    cut(u, v, o) { const q = quatre(u, v, o); o.bh = dome(q / 0.12); return q; },
  },
  trellis: {
    label: 'Trellis', note: 'A diagonal lattice of rounded bars', cut: true,
    h(u, v, o) { return rounded(trellisD(u, v), bar(o) + 0.04); },
    cut(u, v, o) { const d = trellisD(u, v), bw = bar(o); o.bh = rounded(d, bw); return bw - d; },
  },
  bubble: {
    label: 'Bubble', note: 'Domes in every size', cut: true,
    h(u, v, o) { return bubbles(u, v, o, false); },
    cut(u, v, o) { const c = bubbles(u, v, o, true); o.bh = Math.min(1, Math.max(0, c) / 0.12); return c; },
  },
  halftone: {
    label: 'Halftone', note: 'Dots that grow with a gradient or your picture', radial: true, cut: true, tone: true,
    h(u, v, o) { const [d, r] = halftoneDot(u, v, o); return rounded(d, r); },
    cut(u, v, o) { const [d, r] = halftoneDot(u, v, o); const c = r < 0.07 ? 1 : d - r; o.bh = Math.min(1, Math.max(0, c) / 0.1); return c; },
  },
  picture: { label: 'Picture', note: 'Your picture in relief: light areas stand out', image: true, h(u, v, o, x, y) { return o.lum ? o.lum(x, y) : 0.5; } },
  plain: { label: 'Plain', hidden: true, h() { return 0; } },
};
export const PANEL_PATTERN_ORDER = Object.keys(PANEL_PATTERNS).filter((k) => !PANEL_PATTERNS[k].hidden);
// broad fields read best through ribs: these open in Ribs
export const RIB_FIELDS = ['silk', 'bloom', 'lens', 'dune', 'ripple', 'vortex', 'sunburst', 'contour', 'ridge', 'chevron'];

export const PANEL_SHAPES = {
  rect: 'Rectangle', rounded: 'Rounded', arch: 'Arch', oval: 'Oval', hex: 'Hexagon',
};

// ============================================================ the panel
export const PANEL_BASE = {
  kind: 'panel', name: 'Dune',
  shape: 'rect', width: 480, height: 320, corner: 40,
  base: 5, edge: 'frame', edgeW: 16,
  pattern: 'dune', mode: 'relief', depth: 10, scale: 60, angle: 0, vary: 0.4, warp: 0, seed: 7, open: 0.5,
  invert: false, origin: 'centre', morph: 'none', morphDir: 'up', fade: 0, fadeDir: 'top',
  ribs: { width: 6, gap: 6, angle: 0, bend: 0, floor: 0.15 },
  tiles: { cols: 0, rows: 0, seams: 'straight', joint: 'dovetail', clearance: 0.2, tab: 1, labels: true, snap: true },
  mount: 'tape',
  finish: { color: '#eeebe4', color2: '#d8a647', twoTone: false, toneAt: 0.6, material: 'matte', wall: '#e4e1da', backlight: false, led: '#ffb46b' },
};
export function panelDefaults(over = {}) {
  const P = JSON.parse(JSON.stringify(PANEL_BASE));
  for (const k of Object.keys(over)) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && P[k] && typeof P[k] === 'object') Object.assign(P[k], over[k]);
    else P[k] = over[k];
  }
  return P;
}
// Fills in anything an older saved panel is missing and keeps every value in range.
export function normalizePanel(src) {
  const P = panelDefaults(src || {});
  if (!PANEL_PATTERNS[P.pattern]) P.pattern = 'dune';
  if (!PANEL_SHAPES[P.shape]) P.shape = 'rect';
  P.width = clamp(+P.width || 480, 80, 2400); P.height = clamp(+P.height || 320, 80, 2400);
  P.base = clamp(+P.base || 5, 2.4, 14); P.depth = clamp(+P.depth, 0, P.mode === 'ribs' ? 60 : 30); P.scale = clamp(+P.scale || 60, 6, 600);
  if (P.mode === 'ribs') {
    P.ribs.width = clamp(+P.ribs.width || 6, 1.6, 30); P.ribs.gap = clamp(+P.ribs.gap || 6, 1.6, 40);
    P.ribs.angle = clamp(+P.ribs.angle || 0, -90, 90); P.ribs.bend = clamp(+P.ribs.bend || 0, 0, 1); P.ribs.floor = clamp(+P.ribs.floor, 0.04, 0.8);
    if (P.tiles.seams === 'pattern') P.tiles.seams = 'straight';
  }
  if (P.mode === 'cut' && !PANEL_PATTERNS[P.pattern].cut) P.mode = 'relief';
  if (!['relief', 'cut', 'ribs'].includes(P.mode)) P.mode = 'relief';
  if (P.morph !== 'none' && (!PANEL_PATTERNS[P.morph] || PANEL_PATTERNS[P.morph].hidden)) P.morph = 'none';
  P.tiles.clearance = clamp(+P.tiles.clearance || 0, 0, 0.8);
  P.tiles.tab = clamp(+P.tiles.tab || 1, 0.6, 1.6);
  if (P.tiles.seams === 'pattern' && !PANEL_PATTERNS[P.pattern].cell) P.tiles.seams = 'straight';
  if (P.tiles.seams === 'pattern' && (P.tiles.joint === 'dovetail' || P.tiles.joint === 'jigsaw' || P.tiles.joint === 'keys')) P.tiles.joint = 'none';
  return P;
}

// Where the ribs start across the panel. A rib edge exactly on a straight side of the outline would give
// two boundaries in one place, so the ribs shift (by a half or a quarter pitch) until both sides are clear.
function ribPhase(P) {
  const RB = P.ribs || {}, w = RB.width || 6, pitch = w + (RB.gap || 6), ang = ((((RB.angle || 0) % 180) + 180) % 180);
  const ext = ang < 0.01 ? P.width / 2 : Math.abs(ang - 90) < 0.01 ? P.height / 2 : null;
  if (ext === null || RB.bend > 0) return 0;
  const clear = (phi) => Math.min(...[ext, -ext].map((e) => { const f = ((e - phi) / pitch - Math.round((e - phi) / pitch)) * pitch; return Math.abs(Math.abs(f) - w / 2); }));
  const need = Math.min(1, pitch * 0.1);
  let best = 0, bc = -1;
  for (const phi of [0, pitch / 2, pitch / 4, -pitch / 4, pitch / 8]) { const c = clear(phi); if (c >= need) return phi; if (c > bc) { bc = c; best = phi; } }
  return best;
}
const ribEdgeGap = (P, v) => {
  const RB = P.ribs, pitch = RB.width + RB.gap, f = ((v - ribPhase(P)) / pitch - Math.round((v - ribPhase(P)) / pitch)) * pitch;
  return Math.abs(Math.abs(f) - RB.width / 2);
};

function outlineFn(P) {
  const a = P.width / 2, b = P.height / 2;
  switch (P.shape) {
    case 'rounded': {
      const r = clamp(P.corner, 0, Math.min(a, b));
      return (x, y) => { const qx = Math.abs(x) - a + r, qy = Math.abs(y) - b + r; return -(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r); };
    }
    case 'arch': {
      const r = a, cy = b - r;
      return (x, y) => Math.min(y + b, Math.max(Math.min(a - Math.abs(x), cy - y), r - Math.hypot(x, y - cy)));
    }
    case 'oval': {
      if (Math.abs(a - b) < 1e-6) return (x, y) => a - Math.hypot(x, y);
      return (x, y) => { const k0 = Math.hypot(x / a, y / b), k1 = Math.hypot(x / (a * a), y / (b * b)); return k1 > 1e-12 ? -(k0 * (k0 - 1)) / k1 : Math.min(a, b); };
    }
    case 'hex': {
      const len = Math.hypot(b, a / 2);
      return (x, y) => { const ax = Math.abs(x), ay = Math.abs(y); return Math.min(b - ay, -(b * (ax - a) + (a / 2) * ay) / len); };
    }
    default: return (x, y) => Math.min(a - Math.abs(x), b - Math.abs(y));
  }
}
// An SVG path of the outline in panel millimetres, y up (the caller flips it).
export function outlinePath(P) {
  const a = P.width / 2, b = P.height / 2, f = (n) => +n.toFixed(2);
  switch (P.shape) {
    case 'rounded': { const r = clamp(P.corner, 0, Math.min(a, b)); return `M${f(-a + r)} ${f(-b)}H${f(a - r)}A${f(r)} ${f(r)} 0 0 1 ${f(a)} ${f(-b + r)}V${f(b - r)}A${f(r)} ${f(r)} 0 0 1 ${f(a - r)} ${f(b)}H${f(-a + r)}A${f(r)} ${f(r)} 0 0 1 ${f(-a)} ${f(b - r)}V${f(-b + r)}A${f(r)} ${f(r)} 0 0 1 ${f(-a + r)} ${f(-b)}Z`; }
    case 'arch': {
      const cy = b - a;
      if (cy >= -b) return `M${f(-a)} ${f(-b)}H${f(a)}V${f(cy)}A${f(a)} ${f(a)} 0 0 1 ${f(-a)} ${f(cy)}Z`;
      const xs = Math.sqrt(Math.max(0, a * a - (-b - cy) ** 2));
      return `M${f(-xs)} ${f(-b)}H${f(xs)}A${f(a)} ${f(a)} 0 0 1 ${f(-xs)} ${f(-b)}Z`;
    }
    case 'oval': return `M${f(-a)} 0A${f(a)} ${f(b)} 0 1 1 ${f(a)} 0A${f(a)} ${f(b)} 0 1 1 ${f(-a)} 0Z`;
    case 'hex': return `M${f(-a)} 0L${f(-a / 2)} ${f(-b)}H${f(a / 2)}L${f(a)} 0L${f(a / 2)} ${f(b)}H${f(-a / 2)}Z`;
    default: return `M${f(-a)} ${f(-b)}H${f(a)}V${f(b)}H${f(-a)}Z`;
  }
}

// How deep each kind of back pocket goes, kept below the thinnest part of the panel (its chamfered edge).
function pocketDepths(P) {
  const mag = P.mount === 'magnets' || P.mount === 'halo' ? 3.2 : 0;
  const slot = P.mount === 'slots' ? clamp(P.base - 1.6, 2.4, 6) : 0;
  const key = P.tiles.joint === 'keys' && P.tiles.seams !== 'pattern' ? clamp(P.base * 0.5, 1.6, 3) : 0;
  const deepest = Math.max(mag, slot, key, P.tiles.labels ? 0.6 : 0);
  const chamfer = P.mode === 'ribs' ? 0 : clamp(P.base - deepest - 0.7, 0.4, 1.2);
  const edgeLow = P.base - chamfer, cap = edgeLow - 0.6;
  return { mag: Math.min(mag, cap), slot: Math.min(slot, cap), key: Math.min(key, cap), label: Math.min(0.6, cap), chamfer, edgeLow, wantMag: mag, wantSlot: slot };
}

// Everything about the panel that does not depend on the tile: the outline, the pattern and the top.
function compile(P, img) {
  const pat = PANEL_PATTERNS[P.pattern] || PANEL_PATTERNS.dune;
  const cutMode = P.mode === 'cut' && !!pat.cut;
  const patB = !cutMode && P.morph !== 'none' && PANEL_PATTERNS[P.morph] ? PANEL_PATTERNS[P.morph] : null;
  const a = P.width / 2, b = P.height / 2, s = P.scale;
  const outline = outlineFn(P);
  const ang = (P.angle * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
  const radial = pat.radial || (patB && patB.radial);
  const [ox, oy] = !radial ? [0, 0] : ({ bottom: [0, -b], top: [0, b], left: [-a, 0], corner: [-a, -b] }[P.origin] || [0, 0]);
  const warp = P.warp, seed = P.seed | 0;
  const pd = pocketDepths(P);
  const base = P.base, depth = P.depth;
  const lum = img && img.data ? sampler(img, a, b) : null;
  const o = {
    seed, vary: clamp(P.vary, 0, 1), open: clamp(P.open, 0, 1), k: depth / s, span: [(a + Math.abs(ox)) / s, (b + Math.abs(oy)) / s],
    minBar: 1.1 / s, bh: 0, lum,
  };
  const fromUV = (u, v) => [ox + (u * ca - v * sa) * s, oy + (u * sa + v * ca) * s];
  const rmax = Math.hypot(a + Math.abs(ox), b + Math.abs(oy));
  o.toneAt = (u, v) => {
    const [x, y] = fromUV(u, v);
    if (lum) return 1 - lum(x, y);
    const t = 1 - Math.hypot(x - ox, y - oy) / rmax;
    return clamp(0.5 + (t - 0.5) * (1 + o.vary * 1.6), 0, 1);
  };
  const uv = [0, 0];
  const toUV = (x, y) => {
    const dx = x - ox, dy = y - oy;
    let u = (dx * ca + dy * sa) / s, v = (-dx * sa + dy * ca) / s;
    if (warp > 0) {
      const f = 1 / 2.6, wu = gnoise(u * f, v * f, seed + 101) - 0.5, wv = gnoise(u * f + 31.7, v * f - 12.1, seed + 202) - 0.5;
      u += warp * 1.5 * wu; v += warp * 1.5 * wv;
    }
    uv[0] = u; uv[1] = v;
    return uv;
  };
  const ramp = (dir, x, y) => {
    switch (dir) {
      case 'top': return (y + b) / (2 * b);
      case 'bottom': return (b - y) / (2 * b);
      case 'left': return (a - x) / (2 * a);
      case 'right': return (x + a) / (2 * a);
      case 'centre': return 1 - Math.hypot(x / a, y / b) / Math.SQRT2;
      case 'edges': return Math.hypot(x / a, y / b) / Math.SQRT2;
      case 'up': return (y + b) / (2 * b);
      case 'out': return Math.hypot(x / a, y / b) / Math.SQRT2;
      default: return 0;
    }
  };
  const frame = P.edge === 'frame', ew = clamp(P.edgeW, 3, Math.min(a, b) * 0.6);
  const frameTop = base + depth;
  // inside a frame the relief eases out over a short margin, so the frame's slope meets a clean flat band
  const mat = clamp(s * 0.35, 6, 22);
  const band = cutMode ? (frame ? ew : Math.max(6, P.edge === 'fade' ? ew * 0.5 : 6)) : 0;
  // ribs: parallel fins across the panel, their tops following the pattern
  const ribMode = P.mode === 'ribs';
  const RB = P.ribs || {}, pitch = (RB.width || 6) + (RB.gap || 6), ra = ((RB.angle || 0) * Math.PI) / 180, rc = Math.cos(ra), rs = Math.sin(ra);
  const bendA = (RB.bend || 0) * pitch * 2.4, bendK = TAU / (Math.max(P.width, P.height) * 0.62), floor = RB.floor ?? 0.15, phi = ribMode ? ribPhase(P) : 0;
  const ribAt = (x, y) => {
    const along = -x * rs + y * rc, ph = bendK * along + seed;
    const sAcross = x * rc + y * rs + bendA * Math.sin(ph) - phi;
    const f = sAcross / pitch - Math.round(sAcross / pitch);
    return ((RB.width || 6) / 2 - Math.abs(f) * pitch) / Math.sqrt(1 + (bendA * bendK * Math.cos(ph)) ** 2);
  };
  // fills R.t (top height, mm), R.c (openwork field, mm, positive = solid) and R.r (rib field)
  const R = { t: 0, c: 0, d: 0, r: 1 };
  const evalAt = (x, y) => {
    const d = outline(x, y);
    toUV(x, y);
    let h, c = 1;
    if (cutMode) { c = pat.cut(uv[0], uv[1], o, x, y) * s; h = o.bh; }
    else {
      h = pat.h(uv[0], uv[1], o, x, y);
      if (patB) h = lerp(h, patB.h(uv[0], uv[1], o, x, y), smooth(0.2, 0.8, ramp(P.morphDir, x, y)));
      if (P.invert) h = 1 - h;
    }
    if (P.fade > 0) h *= 1 - P.fade * smooth(0, 1, ramp(P.fadeDir, x, y));
    h = clamp(h, 0, 1);
    if (ribMode) h = floor + (1 - floor) * h;
    let t;
    if (frame) { const inner = d - ew; t = inner <= 0 ? frameTop : Math.max(base + depth * h * smooth(depth + 1, depth + 1 + mat, inner), frameTop - inner); }
    else if (P.edge === 'fade') t = base + depth * h * smooth(0, ew, d);
    else if (P.edge === 'bevel') t = Math.min(base + depth * h, base + Math.max(0, d - pd.chamfer));
    else t = base + depth * h;
    if (ribMode) {
      // rib tops ease down at 45° to just above the back at the outline; a frame joins the ribs
      R.t = Math.max(base + 0.6, Math.min(t, base + 0.6 + Math.max(0, d)));
      R.r = frame ? Math.max(ribAt(x, y), ew - d) : ribAt(x, y);
      R.c = 1;
    } else {
      R.t = Math.min(t, pd.edgeLow + Math.max(0, d));
      R.c = cutMode ? Math.max(c, band - d) : 1;
      R.r = 1;
    }
    R.d = d;
    return R;
  };
  let zc = 0;
  if (P.finish.twoTone) zc = clamp(base + clamp(P.finish.toneAt, 0.05, 0.95) * depth, (ribMode ? base + 0.6 : pd.edgeLow) + 0.3, base + depth - 0.3);
  return { P, pat, patB, cutMode, ribMode, pitch, outline, evalAt, toUV, fromUV, o, s, a, b, pd, zc, twoTone: !!P.finish.twoTone && depth > 1.2 && zc > (ribMode ? base + 0.6 : pd.edgeLow) };
}
// A picture becomes brightness 0..1 over the panel, filling it like a cover photo.
function sampler(img, a, b) {
  const { w, h, data } = img;
  const sc = Math.max(w / (2 * a), h / (2 * b));
  return (x, y) => {
    const px = clamp(w / 2 + x * sc - 0.5, 0, w - 1.001), py = clamp(h / 2 - y * sc - 0.5, 0, h - 1.001);
    const i = Math.floor(px), j = Math.floor(py), fx = px - i, fy = py - j, k = j * w + i;
    return lerp(lerp(data[k], data[k + 1], fx), lerp(data[k + w], data[k + w + 1], fx), fy);
  };
}

// ============================================================ tiles
const TAB = { dovetail: { L: 12, n: 14, w: 22 }, jigsaw: { L: 17, R: 7.5, nk: 4.5 } };
export function tabDepth(P) {
  const f = P.tiles.tab || 1;
  return P.tiles.joint === 'dovetail' ? TAB.dovetail.L * f : P.tiles.joint === 'jigsaw' ? TAB.jigsaw.L * f : 0;
}
// signed distance of a tab (positive inside), in its own frame: lx outward across the seam, ly along it
function tabSDF(joint, f, lx, ly) {
  if (joint === 'dovetail') {
    const L = TAB.dovetail.L * f, n = TAB.dovetail.n * f, w = TAB.dovetail.w * f, len = Math.hypot((w - n) / 2, L + 2);
    return Math.min(lx + 2, L - lx, (((w - n) / 2) * (lx + 2) - (L + 2) * (Math.abs(ly) - n / 2)) / len);
  }
  const L = TAB.jigsaw.L * f, R = TAB.jigsaw.R * f, nk = TAB.jigsaw.nk * f, cx = L - R;
  return Math.max(R - Math.hypot(lx - cx, ly), Math.min(lx + 2, cx - lx, nk - Math.abs(ly)));
}
const bowtie = (lx, ly) => Math.min(15 - Math.abs(lx), (4 + 0.2 * Math.abs(lx) - Math.abs(ly)) / 1.0198);
const local = (j, x, y) => (j.dir === 'x' ? [x - j.x, y - j.y] : [y - j.y, j.x - x]);

// Splits the panel into tiles that fit the bed. Straight seams are spread evenly, or moved onto the
// pattern's grooves where it has straight ones, so they hide in the relief.
export function planPanel(P, bed = [256, 256]) {
  const W = P.width, H = P.height, a = W / 2, b = H / 2;
  const pat = PANEL_PATTERNS[P.pattern] || PANEL_PATTERNS.dune;
  const T = P.tiles, margin = 6;
  // seams can only follow cells that are small next to the bed; bigger ones fall back to straight cuts
  const pattern = T.seams === 'pattern' && pat.cell && P.mode !== 'cut' && 2 * pat.cellR * P.scale + 2 < 0.34 * Math.min(bed[0], bed[1]);
  const protrude = pattern ? 2 * pat.cellR * P.scale + 2 : tabDepth(P);
  const opts = [[bed[0], bed[1], false], [bed[1], bed[0], true]].map(([bw, bh, rot]) => {
    const cw = bw - 2 * margin - protrude, ch = bh - 2 * margin - protrude;
    const cols = T.cols > 0 ? T.cols : Math.max(1, Math.ceil((W - 0.5) / Math.max(20, cw)));
    const rows = T.rows > 0 ? T.rows : Math.max(1, Math.ceil((H - 0.5) / Math.max(20, ch)));
    return { cols, rows, rot, cw, ch, n: cols * rows };
  });
  const best = opts[1].n < opts[0].n ? opts[1] : opts[0];
  const { cols, rows } = best;
  const even = (n, lo, hi) => Array.from({ length: n + 1 }, (_, k) => lo + ((hi - lo) * k) / n);
  let xs = even(cols, -a, a), ys = even(rows, -b, b), snapped = false;
  // seams on grooves: only for straight grooves, an unturned and unwarped pattern
  const turn = ((P.angle % 360) + 360) % 360;
  if (T.snap && !pattern && pat.grid && P.mode !== 'cut' && !P.warp && (turn === 0 || turn === 90 || turn === 180 || turn === 270)) {
    const g = turn === 90 || turn === 270 ? [pat.grid[1], pat.grid[0]] : pat.grid;
    const snap = (arr, per, max) => {
      if (!per) return arr;
      const p = per * P.scale, out = arr.slice();
      for (let k = 1; k < out.length - 1; k++) {
        let v = Math.round(out[k] / p) * p;
        if (v - out[k - 1] > max) v = Math.floor(out[k] / p) * p;
        if (v - out[k - 1] > 1 && v < out[out.length - 1] - 1) out[k] = v;
      }
      if (out[out.length - 1] - out[out.length - 2] > max) return arr;
      return out;
    };
    const nx = snap(xs, g[0], best.cw), ny = snap(ys, g[1], best.ch);
    snapped = nx !== xs || ny !== ys;
    xs = nx; ys = ny;
  }
  if (T.snap && P.mode === 'ribs' && !(P.ribs.bend > 0)) {
    const pitch = P.ribs.width + P.ribs.gap, ang = ((P.ribs.angle % 180) + 180) % 180, phi = ribPhase(P);
    const moveGap = (arr, max) => {
      const out = arr.slice();
      for (let k = 1; k < out.length - 1; k++) {
        let v = phi + (Math.round((out[k] - phi) / pitch - 0.5) + 0.5) * pitch;
        if (v - out[k - 1] > max) v -= pitch;
        if (v - out[k - 1] > 1 && v < out[out.length - 1] - 1) out[k] = v;
      }
      return out[out.length - 1] - out[out.length - 2] > max ? arr : out;
    };
    if (ang < 0.01) { const nx = moveGap(xs, best.cw); snapped = snapped || nx !== xs; xs = nx; }
    else if (Math.abs(ang - 90) < 0.01) { const ny = moveGap(ys, best.ch); snapped = snapped || ny !== ys; ys = ny; }
  }
  // any seam left running along a straight rib's edge moves a millimetre clear of it
  if (P.mode === 'ribs' && !(P.ribs.bend > 0)) {
    const ang = ((P.ribs.angle % 180) + 180) % 180, arr = ang < 0.01 ? xs : Math.abs(ang - 90) < 0.01 ? ys : null;
    if (arr) for (let k = 1; k < arr.length - 1; k++) if (ribEdgeGap(P, arr[k]) < 0.6) arr[k] += 1;
  }
  const outline = outlineFn(P);
  const tiles = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x0 = xs[c], x1 = xs[c + 1], y0 = ys[r], y1 = ys[r + 1];
    let inside = -1e9;
    for (let j = 0; j <= 12; j++) for (let i = 0; i <= 12; i++) inside = Math.max(inside, outline(lerp(x0, x1, i / 12), lerp(y0, y1, j / 12)));
    const label = `${String.fromCharCode(65 + (rows - 1 - r))}${c + 1}`;
    tiles.push({ index: tiles.length, c, r, label, x0, x1, y0, y1, empty: inside < 2 });
  }
  const at = (c, r) => tiles[r * cols + c];
  // tabs and keys along every straight seam inside the outline
  const tabs = [], keys = [];
  const joint = pattern ? 'none' : T.joint;
  if (joint === 'dovetail' || joint === 'jigsaw' || joint === 'keys') {
    const f = T.tab || 1;
    const half = joint === 'keys' ? 7 : joint === 'dovetail' ? (TAB.dovetail.w * f) / 2 : TAB.jigsaw.R * f;
    const reach = joint === 'keys' ? 15 : tabDepth(P);
    const seam = (dir, s0, lo, hi, A, B) => {
      if (A.empty || B.empty) return;
      // the stretch of this seam where a tab has room inside the outline
      const ok = (t) => {
        const pts = dir === 'x' ? [[s0 - reach, t], [s0 + reach, t], [s0, t - half - 3], [s0, t + half + 3]] : [[t, s0 - reach], [t, s0 + reach], [t - half - 3, s0], [t + half + 3, s0]];
        return pts.every(([x, y]) => outline(x, y) > 5);
      };
      const end = half + 10;
      let first = null, last = null;
      for (let t = lo + end; t <= hi - end; t += 2) if (ok(t)) { if (first === null) first = t; last = t; }
      if (first === null) return;
      const span = last - first, n = Math.max(1, Math.round((span + 2 * end) / (joint === 'keys' ? 130 : 110)));
      for (let k = 0; k < n; k++) {
        const t = n === 1 ? (first + last) / 2 : first + (span * k) / (n - 1);
        if (!ok(t)) continue;
        const j = dir === 'x' ? { dir, x: s0, y: t, owner: A.index, other: B.index } : { dir, x: t, y: s0, owner: A.index, other: B.index };
        (joint === 'keys' ? keys : tabs).push(j);
      }
    };
    for (let c = 1; c < cols; c++) for (let r = 0; r < rows; r++) seam('x', xs[c], ys[r], ys[r + 1], at(c - 1, r), at(c, r));
    for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) seam('y', ys[r], xs[c], xs[c + 1], at(c, r - 1), at(c, r));
  }
  return { W, H, cols, rows, xs, ys, rotated: best.rot, maxTile: [best.cw, best.ch], bed, tiles, tabs, keys, joint, pattern: !!pattern, patternWanted: T.seams === 'pattern', protrude, snapped };
}

// ============================================================ letters for the back
const GLYPHS = {
  0: [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]]], 1: [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]], 2: [[[0, 6], [4, 6], [4, 3], [0, 3], [0, 0], [4, 0]]],
  3: [[[0, 6], [4, 6], [4, 0], [0, 0]], [[1, 3], [4, 3]]], 4: [[[0, 6], [0, 3], [4, 3]], [[3, 6], [3, 0]]], 5: [[[4, 6], [0, 6], [0, 3], [4, 3], [4, 0], [0, 0]]],
  6: [[[4, 6], [0, 6], [0, 0], [4, 0], [4, 3], [0, 3]]], 7: [[[0, 6], [4, 6], [1, 0]]], 8: [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]], [[0, 3], [4, 3]]], 9: [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 3], [4, 3]]],
  A: [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 3], [4, 3]]], B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 6], [0, 6], [0, 0], [4, 0]]], D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]], E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]], G: [[[4, 6], [0, 6], [0, 0], [4, 0], [4, 3], [2, 3]]], H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]], [[1, 0], [3, 0]], [[1, 6], [3, 6]]], J: [[[4, 6], [4, 0], [0, 0], [0, 2]]], K: [[[0, 0], [0, 6]], [[4, 6], [0, 3], [4, 0]]], L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]], N: [[[0, 0], [0, 6], [4, 0], [4, 6]]], O: [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]]], P: [[[0, 0], [0, 6], [4, 6], [4, 3], [0, 3]]],
  Q: [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]], [[2.5, 1.5], [4.5, -0.5]]], R: [[[0, 0], [0, 6], [4, 6], [4, 3], [0, 3], [4, 0]]], S: [[[4, 6], [0, 6], [0, 3], [4, 3], [4, 0], [0, 0]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]], U: [[[0, 6], [0, 0], [4, 0], [4, 6]]], V: [[[0, 6], [2, 0], [4, 6]]], W: [[[0, 6], [1, 0], [2, 3], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]], Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]], Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]], '^': [[[2, 0], [2, 6]], [[0, 4], [2, 6], [4, 4]]],
};
// The tile's name engraved in its back, mirrored so it reads from behind, with an arrow to the top.
function labelPocket(text, cx, cy, hgt = 10) {
  const u = hgt / 6, segs = [];
  const chars = ['^', ' ', ...text];
  const width = chars.length * 6 * u - 2 * u;
  chars.forEach((ch, k) => {
    const g = GLYPHS[ch];
    if (!g) return;
    const x0 = -width / 2 + k * 6 * u;
    for (const line of g) for (let i = 0; i + 1 < line.length; i++) {
      // mirrored in x: the back is seen from behind
      segs.push([cx - (x0 + line[i][0] * u), cy + (line[i][1] - 3) * u, cx - (x0 + line[i + 1][0] * u), cy + (line[i + 1][1] - 3) * u]);
    }
  });
  const sw = 0.85, hw = width / 2 + 2, hh = hgt / 2 + 2;
  return {
    kind: 'label', x: cx, y: cy, rx: hw, ry: hh, r: Math.hypot(hw, hh),
    sdf(x, y) {
      if (Math.abs(x - cx) > hw || Math.abs(y - cy) > hh) return -2;
      let m = 1e9;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        m = Math.min(m, Math.hypot(x - ax - dx * t, y - ay - dy * t));
      }
      return sw - m;
    },
  };
}

// The tile's shape where its edges are not plain straight cuts: tabs, sockets, or the pattern's cells.
function tileShape(C, plan, tile) {
  const P = C.P, c2 = P.tiles.clearance / 2, f = P.tiles.tab || 1;
  const { xs, ys, cols, rows } = plan;
  const ex0 = tile.c > 0 ? tile.x0 + c2 : -1e9, ex1 = tile.c < cols - 1 ? tile.x1 - c2 : 1e9;
  const ey0 = tile.r > 0 ? tile.y0 + c2 : -1e9, ey1 = tile.r < rows - 1 ? tile.y1 - c2 : 1e9;
  if (plan.pattern) {
    const pat = C.pat, s = C.s;
    const find = (arr, v) => { let k = 0; while (k < arr.length - 2 && v > arr[k + 1]) k++; return k; };
    return (x, y) => {
      const uv = C.toUV(x, y), cell = pat.cell(uv[0], uv[1], C.o);
      const [cx, cy] = C.fromUV(cell[2], cell[3]);
      const own = find(xs, cx) === tile.c && find(ys, cy) === tile.r;
      return own ? cell[4] * s - c2 : -cell[4] * s - c2;
    };
  }
  const mine = plan.tabs.filter((t) => t.owner === tile.index), theirs = plan.tabs.filter((t) => t.other === tile.index);
  if (!mine.length && !theirs.length) return null;
  const joint = plan.joint;
  return (x, y) => {
    let v = Math.min(x - ex0, ex1 - x, y - ey0, ey1 - y);
    for (const t of mine) { const [lx, ly] = local(t, x, y); if (lx > -4 && lx < 40 && Math.abs(ly) < 40) v = Math.max(v, tabSDF(joint, f, lx, ly) - c2); }
    for (const t of theirs) { const [lx, ly] = local(t, x, y); if (lx > -6 && lx < 42 && Math.abs(ly) < 42) v = Math.min(v, -(tabSDF(joint, f, lx, ly) + c2)); }
    return v;
  };
}

// Where the back pockets go on one tile: the label, then magnets or hanging slots, each only where it has room.
function tilePockets(C, plan, tile, shape, final) {
  const P = C.P, pd = C.pd, out = [];
  const clear = (x, y) => {
    let d = C.outline(x, y);
    if (shape) d = Math.min(d, shape(x, y));
    else {
      if (tile.c > 0) d = Math.min(d, x - tile.x0); if (tile.c < plan.cols - 1) d = Math.min(d, tile.x1 - x);
      if (tile.r > 0) d = Math.min(d, y - tile.y0); if (tile.r < plan.rows - 1) d = Math.min(d, tile.y1 - y);
    }
    return d;
  };
  const keys = plan.keys.filter((k) => k.owner === tile.index || k.other === tile.index);
  const free = (x, y, r) => keys.every((k) => Math.hypot(x - k.x, y - k.y) > r + 20) && out.every((p) => Math.hypot(x - p.x, y - p.y) > r + p.r + 3);
  // the part of the tile inside the outline
  let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
  for (let j = 0; j <= 16; j++) for (let i = 0; i <= 16; i++) {
    const x = lerp(tile.x0, tile.x1, i / 16), y = lerp(tile.y0, tile.y1, j / 16);
    if (C.outline(x, y) > 0) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  }
  if (bx0 > bx1) return out;
  const mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2;
  const place = (x, y, r, need) => {
    for (let k = 0; k < 14; k++) {
      const px = lerp(x, mx, k / 14), py = lerp(y, my, k / 14);
      if (clear(px, py) > need && free(px, py, r)) return [px, py];
    }
    return null;
  };
  const w = bx1 - bx0, h = by1 - by0;
  if (P.mount === 'magnets' || P.mount === 'halo') {
    const R = 5.2, ins = Math.min(24, w / 4, h / 4);
    const spots = w < 90 && h < 90 ? [[mx, my]] : w < 120 ? [[mx, by1 - ins], [mx, by0 + ins]] : h < 120 ? [[bx0 + ins, my], [bx1 - ins, my]]
      : [[bx0 + ins, by1 - ins], [bx1 - ins, by1 - ins], [bx0 + ins, by0 + ins], [bx1 - ins, by0 + ins]];
    for (const [x, y] of spots) { const p = place(x, y, R, R + 5); if (p) out.push({ kind: P.mount === 'halo' ? 'halo' : 'magnet', x: p[0], y: p[1], r: R, depth: pd.mag, sdf: (qx, qy) => R - Math.hypot(qx - p[0], qy - p[1]) }); }
  }
  if (P.mount === 'slots') {
    const R = 5.2, L = 7, top = by1 - Math.min(30, h / 3);
    const spots = w < 150 ? [[mx, top]] : [[bx0 + w * 0.25, top], [bx0 + w * 0.75, top]];
    for (const [x, y] of spots) {
      const p = place(x, y, R + L, R + L + 5);
      if (!p) continue;
      const [cx, cy] = p;
      out.push({ kind: 'slot', x: cx, y: cy, r: R + L, depth: pd.slot, sdf: (qx, qy) => R - Math.hypot(qx - cx, qy - clamp(qy, cy - L, cy + L)) });
    }
  }
  if (P.tiles.labels && final && pd.label > 0.3) {
    for (const [x, y] of [[mx, my], [mx, my - 26], [mx, my + 26], [mx - 30, my], [mx + 30, my]]) {
      const lab = labelPocket(tile.label, x, y);
      if (clear(x, y) > lab.r + 3 && free(x, y, lab.r)) { lab.depth = pd.label; out.push(lab); break; }
    }
  }
  for (const k of keys) {
    const c2 = P.tiles.clearance / 2;
    out.push({ kind: 'key', x: k.x, y: k.y, r: 17, depth: pd.key, sdf: (x, y) => { const [lx, ly] = local(k, x, y); return Math.abs(lx) > 18 || Math.abs(ly) > 10 ? -3 : bowtie(lx, ly) + c2; } });
  }
  return out;
}

// ============================================================ the mesher
// A body: faces at levels over clipped regions, and walls between levels along the region boundaries.
// clip lists are [field, sign, field, sign, ...]: the region where sign * field >= 0 for every pair.
function meshBody(G, B) {
  const { nx, ny, x0, y0, gx, gy, T, diag } = G;
  const F = B.fields, NF = F.length;
  const W1 = nx + 1, NG = W1 * (ny + 1), NH = nx * (ny + 1), NV = W1 * ny;
  const levels = B.levels, NL = levels.length, groups = B.groups ? 3 : 1;
  // points past the grid: 1 on an edge (a, b, w), 2 inside a triangle (a, b, c and weights), 3 free (x, y, t)
  const pk = [], pa = [], pb = [], pc = [], pw = [], pl1 = [], pl2 = [], pz = [], px = [], py = [], ptv = [];
  const gX = (id) => x0 + (id % W1) * gx, gY = (id) => y0 + Math.floor(id / W1) * gy;
  const X = (id) => (id < NG ? gX(id) : px[id - NG]), Y = (id) => (id < NG ? gY(id) : py[id - NG]);
  const tAt = (id) => (id < NG ? T[id] : ptv[id - NG]);
  const val = (id, f) => {
    if (id < NG) return F[f][id];
    const k = id - NG;
    if (pz[k] & (1 << f)) return 0;
    const Ff = F[f];
    if (pk[k] === 1) return Ff[pa[k]] + (Ff[pb[k]] - Ff[pa[k]]) * pw[k];
    return (1 - pl1[k] - pl2[k]) * Ff[pa[k]] + pl1[k] * Ff[pb[k]] + pl2[k] * Ff[pc[k]];
  };
  const ecache = new Map(), mcache = new Map();
  function crossing(e, f, a, b) {
    const key = e * NF + f;
    let id = ecache.get(key);
    if (id !== undefined) return id;
    const fa = F[f][a], fb = F[f][b], w = fa / (fa - fb);
    id = NG + pk.length;
    pk.push(1); pa.push(a); pb.push(b); pc.push(0); pw.push(w); pl1.push(0); pl2.push(0); pz.push(1 << f);
    px.push(gX(a) + (gX(b) - gX(a)) * w); py.push(gY(a) + (gY(b) - gY(a)) * w); ptv.push(T[a] + (T[b] - T[a]) * w);
    ecache.set(key, id);
    return id;
  }
  // the point where the boundaries of f and g meet inside triangle tri, found on a segment P-Q along f
  let tv0 = 0, tv1 = 0, tv2 = 0, tri = 0;
  function meet(f, g, P, Q) {
    const lo = f < g ? f : g, hi = f < g ? g : f, key = (tri * NF + lo) * NF + hi;
    let id = mcache.get(key);
    if (id !== undefined) return id;
    const gP = val(P, g), gQ = val(Q, g), w = gP / (gP - gQ);
    const x = X(P) + (X(Q) - X(P)) * w, y = Y(P) + (Y(Q) - Y(P)) * w;
    // barycentric weights in the triangle
    const ax = gX(tv0), ay = gY(tv0), bx = gX(tv1) - ax, by = gY(tv1) - ay, cx = gX(tv2) - ax, cy = gY(tv2) - ay, det = bx * cy - by * cx;
    const l1 = ((x - ax) * cy - (y - ay) * cx) / det, l2 = (bx * (y - ay) - by * (x - ax)) / det;
    id = NG + pk.length;
    pk.push(2); pa.push(tv0); pb.push(tv1); pc.push(tv2); pw.push(0); pl1.push(l1); pl2.push(l2);
    pz.push((1 << f) | (1 << g) | (P >= NG && Q >= NG ? pz[P - NG] & pz[Q - NG] : 0));
    px.push(x); py.push(y); ptv.push((1 - l1 - l2) * T[tv0] + l1 * T[tv1] + l2 * T[tv2]);
    mcache.set(key, id);
    return id;
  }
  function freePoint(x, y, t) {
    const id = NG + pk.length;
    pk.push(3); pa.push(0); pb.push(0); pc.push(0); pw.push(0); pl1.push(0); pl2.push(0); pz.push(0); px.push(x); py.push(y); ptv.push(t);
    return id;
  }
  // ---- output
  let pos = new Float32Array(1 << 16), pn = 0, idx = new Uint32Array(1 << 17), ixn = 0;
  const gmaps = new Array(NL * groups).fill(null), omaps = new Map();
  const merge = B.merge;
  function vid(id, L, grp) {
    if (merge && L === merge.top && id >= NG && (pz[id - NG] & merge.bit)) L = merge.base;
    const s = L * groups + (groups > 1 ? grp : 0);
    let m;
    if (id < NG) {
      m = gmaps[s];
      if (!m) { m = gmaps[s] = new Int32Array(NG).fill(-1); }
      if (m[id] >= 0) return m[id];
    } else {
      const v = omaps.get(id * NL * groups + s);
      if (v !== undefined) return v;
    }
    const lv = levels[L];
    const z = lv.z !== undefined ? lv.z : lv.cap !== undefined ? Math.min(tAt(id), lv.cap) : tAt(id);
    if (pn + 3 > pos.length) { const n = new Float32Array(pos.length * 2); n.set(pos); pos = n; }
    const v = pn / 3;
    pos[pn++] = X(id); pos[pn++] = Y(id); pos[pn++] = z;
    if (id < NG) m[id] = v; else omaps.set(id * NL * groups + s, v);
    return v;
  }
  function tri3(a, b, c) {
    if (a === b || b === c || a === c) return;
    if (ixn + 3 > idx.length) { const n = new Uint32Array(idx.length * 2); n.set(idx); idx = n; }
    idx[ixn++] = a; idx[ixn++] = b; idx[ixn++] = c;
  }
  // ---- splitting: every polygon edge carries every point any boundary puts on it
  const onEdge = [];
  function edgeSplits(e, a, b) {
    onEdge.length = 0;
    for (let f = 0; f < NF; f++) { const fa = F[f][a], fb = F[f][b]; if ((fa > 0) !== (fb > 0)) { const id = crossing(e, f, a, b); onEdge.push(id, pw[id - NG]); } }
    return onEdge;
  }
  const paramOn = (id, a) => (id < NG ? (id === a ? 0 : 1) : pw[id - NG]);
  // the boundary segments of the active fields inside the current triangle, with the points on them
  const seg = new Array(NF);
  for (let f = 0; f < NF; f++) seg[f] = { on: false, P: 0, Q: 0, pts: [] };
  function expand(ids, tags, ea, eb, out) {
    out.length = 0;
    const n = ids.length;
    for (let k = 0; k < n; k++) {
      const P = ids[k], Q = ids[(k + 1) % n], tag = tags[k];
      out.push(P);
      if (tag >= 0) {
        const a = ea[tag], b = eb[tag], sp = edgeSplits(G.eid[tag], a, b);
        if (!sp.length) continue;
        const tp = paramOn(P, a), tq = paramOn(Q, a);
        const list = [];
        for (let i = 0; i < sp.length; i += 2) { const t = sp[i + 1]; if ((t > tp && t < tq) || (t < tp && t > tq)) list.push(sp[i], t); }
        if (list.length === 2) out.push(list[0]);
        else if (list.length > 2) {
          const pairs = []; for (let i = 0; i < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
          pairs.sort((u, v) => (tq > tp ? u[1] - v[1] : v[1] - u[1]));
          for (const [id] of pairs) out.push(id);
        }
      } else {
        const sg = seg[-tag - 1];
        if (sg.pts.length < 2) continue;
        const tp = sg.param(P), tq = sg.param(Q);
        const list = [];
        for (let i = 0; i < sg.pts.length; i += 2) { const t = sg.pts[i + 1]; if ((t > tp && t < tq) || (t < tp && t > tq)) list.push([sg.pts[i], t]); }
        list.sort((u, v) => (tq > tp ? u[1] - v[1] : v[1] - u[1]));
        for (const [id] of list) out.push(id);
      }
    }
    return out;
  }
  // Sutherland-Hodgman against one field; tags >= 0 are triangle edges, negative ones are -(field + 1)
  function clip(ids, tags, f, s, ea, eb, oi, ot) {
    oi.length = 0; ot.length = 0;
    const n = ids.length;
    for (let k = 0; k < n; k++) {
      const P = ids[k], Q = ids[(k + 1) % n], tag = tags[k];
      const vp = s * val(P, f), vq = s * val(Q, f);
      if (vp >= 0) {
        if (vq >= 0) { oi.push(P); ot.push(tag); }
        else if (vp === 0) { oi.push(P); ot.push(-f - 1); }
        else { oi.push(P); ot.push(tag); oi.push(cross(tag, f, P, Q, ea, eb)); ot.push(-f - 1); }
      } else if (vq > 0) { oi.push(cross(tag, f, P, Q, ea, eb)); ot.push(tag); }
    }
  }
  const cross = (tag, f, P, Q, ea, eb) => (tag >= 0 ? crossing(G.eid[tag], f, ea[tag], eb[tag]) : meet(-tag - 1, f, P, Q));
  // ---- faces and walls of one triangle
  const bufA = [], bufB = [], tagA = [], tagB = [], ring = [];
  function region(clipList, v0, v1, v2, ea, eb) {
    bufA.length = 0; tagA.length = 0;
    bufA.push(v0, v1, v2); tagA.push(0, 1, 2);
    let ci = bufA, ct = tagA, ni = bufB, nt = tagB;
    for (let k = 0; k < clipList.length; k += 2) {
      clip(ci, ct, clipList[k], clipList[k + 1], ea, eb, ni, nt);
      [ci, ni] = [ni, ci]; [ct, nt] = [nt, ct];
      if (ci.length < 3) return null;
    }
    return [ci, ct];
  }
  function emitPoly(ids, L, up, grp) {
    const n = ids.length;
    if (n < 3) return;
    if (n === 3) {
      const a = vid(ids[0], L, grp), b = vid(ids[1], L, grp), c = vid(ids[2], L, grp);
      if (up) tri3(a, b, c); else tri3(a, c, b);
      return;
    }
    let sx = 0, sy = 0, st = 0;
    for (const id of ids) { sx += X(id); sy += Y(id); st += tAt(id); }
    const c = vid(freePoint(sx / n, sy / n, st / n), L, grp);
    for (let k = 0; k < n; k++) {
      const a = vid(ids[k], L, grp), b = vid(ids[(k + 1) % n], L, grp);
      if (up) tri3(c, a, b); else tri3(c, b, a);
    }
  }
  function emitWall(pts, lo, hi) {
    for (let k = 0; k + 1 < pts.length; k++) {
      const a0 = vid(pts[k], lo, 1), b0 = vid(pts[k + 1], lo, 1), b1 = vid(pts[k + 1], hi, 1), a1 = vid(pts[k], hi, 1);
      tri3(a0, b0, b1); tri3(a0, b1, a1);
    }
  }
  const wallPts = [];
  function wallsOf(ids, tags, W, ea, eb, bnd) {
    const n = ids.length;
    for (let k = 0; k < n; k++) {
      const tag = tags[k];
      const isWall = tag >= 0 ? bnd[tag] : (W.tags & (1 << (-tag - 1))) !== 0;
      if (!isWall) continue;
      // the same splitting as the faces get
      expand([ids[k], ids[(k + 1) % n]], [tag, tag], ea, eb, wallPts);
      // expand treats the pair as a closed loop, so it added the return trip: keep the forward run only
      const P = ids[k], Q = ids[(k + 1) % n], run = [P];
      for (let i = 1; i < wallPts.length && wallPts[i] !== Q; i++) run.push(wallPts[i]);
      run.push(Q);
      emitWall(run, W.lo, W.hi);
    }
  }
  // ---- flat runs merge into rectangles
  const flatMarks = B.faces.map((fc) => (!B.noMerge && (fc.flat || levels[fc.L].z === undefined) ? new Float64Array(nx * ny).fill(NaN) : null));
  const E = [0, 0, 0], EA = [0, 0, 0], EB = [0, 0, 0], BND = [false, false, false];
  G.eid = E;
  const insideAll = (clipList, v) => { for (let k = 0; k < clipList.length; k += 2) if (clipList[k + 1] * F[clipList[k]][v] < 0) return false; return true; };
  const triVerts = [[0, 0, 0], [0, 0, 0]], triEdges = [[[0, 0, 0], [0, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0], [0, 0, 0]]];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const cell = j * nx + i, v00 = j * W1 + i, v10 = v00 + 1, v01 = v00 + W1, v11 = v01 + 1;
    const hB = j * nx + i, hT = (j + 1) * nx + i, vL = NH + j * W1 + i, vR = vL + 1, dg = NH + NV + cell;
    const d1 = diag[cell] === 1;
    // triangles (counter-clockwise) and their edges: [edge id, canonical start, canonical end]
    if (!d1) {
      triVerts[0] = [v00, v10, v11]; triEdges[0] = [[hB, v00, v10], [vR, v10, v11], [dg, v00, v11]];
      triVerts[1] = [v00, v11, v01]; triEdges[1] = [[dg, v00, v11], [hT, v01, v11], [vL, v00, v01]];
    } else {
      triVerts[0] = [v00, v10, v01]; triEdges[0] = [[hB, v00, v10], [dg, v10, v01], [vL, v00, v01]];
      triVerts[1] = [v10, v11, v01]; triEdges[1] = [[vR, v10, v11], [hT, v01, v11], [dg, v10, v01]];
    }
    // a cell is simple when no field changes sign across its four corners
    let simple = true;
    for (let f = 0; f < NF && simple; f++) { const s = F[f][v00] > 0; if ((F[f][v10] > 0) !== s || (F[f][v01] > 0) !== s || (F[f][v11] > 0) !== s) simple = false; }
    const onBnd = j === 0 || i === 0 || j === ny - 1 || i === nx - 1;
    if (simple) {
      const flatT = T[v00] === T[v10] && T[v00] === T[v01] && T[v00] === T[v11];
      for (let fi = 0; fi < B.faces.length; fi++) {
        const fc = B.faces[fi];
        if (!insideAll(fc.clip, v00)) continue;
        const lv = levels[fc.L], marks = flatMarks[fi];
        if (marks) {
          if (lv.z !== undefined) { marks[cell] = lv.z; continue; }
          if (lv.cap !== undefined && T[v00] >= lv.cap && T[v10] >= lv.cap && T[v01] >= lv.cap && T[v11] >= lv.cap) { marks[cell] = lv.cap; continue; }
          if (flatT) { marks[cell] = T[v00]; continue; }
        }
        const grp = lv.z === undefined ? 0 : 2;
        for (let h = 0; h < 2; h++) {
          const [a, b, c] = triVerts[h];
          const A = vid(a, fc.L, grp), Bv = vid(b, fc.L, grp), Cv = vid(c, fc.L, grp);
          if (fc.up) tri3(A, Bv, Cv); else tri3(A, Cv, Bv);
        }
      }
      if (onBnd) {
        for (let h = 0; h < 2; h++) {
          const tv = triVerts[h], te = triEdges[h];
          for (let k = 0; k < 3; k++) {
            const e = te[k][0];
            if (!isBoundary(e)) continue;
            for (const Wl of B.walls) {
              if (!insideAll(Wl.clip, v00)) continue;
              emitWall([tv[k], tv[(k + 1) % 3]], Wl.lo, Wl.hi);
            }
          }
        }
      }
      continue;
    }
    for (let h = 0; h < 2; h++) {
      const [a, b, c] = triVerts[h], te = triEdges[h];
      tri = cell * 2 + h; tv0 = a; tv1 = b; tv2 = c;
      for (let k = 0; k < 3; k++) { E[k] = te[k][0]; EA[k] = te[k][1]; EB[k] = te[k][2]; BND[k] = onBnd && isBoundary(te[k][0]); }
      // boundary segments of the active fields, and every place two of them meet
      const act = [];
      for (let f = 0; f < NF; f++) {
        const sg = seg[f];
        sg.on = false; sg.pts.length = 0;
        const s0 = F[f][a] > 0, s1 = F[f][b] > 0, s2 = F[f][c] > 0;
        if (s0 === s1 && s1 === s2) continue;
        const ends = [];
        for (let k = 0; k < 3; k++) { const fa = F[f][EA[k]], fb = F[f][EB[k]]; if ((fa > 0) !== (fb > 0)) ends.push(crossing(E[k], f, EA[k], EB[k])); }
        sg.on = true; sg.P = ends[0]; sg.Q = ends[1];
        act.push(f);
      }
      for (let x = 0; x < act.length; x++) for (let y = x + 1; y < act.length; y++) {
        const f = act[x], g = act[y], sf = seg[f];
        const gP = val(sf.P, g), gQ = val(sf.Q, g);
        if ((gP > 0) === (gQ > 0) || gP === 0 || gQ === 0) continue;
        const m = meet(f, g, sf.P, sf.Q);
        sf.pts.push(m, gP / (gP - gQ));
        const sg = seg[g], fP = val(sg.P, f), fQ = val(sg.Q, f);
        sg.pts.push(m, (fP > 0) !== (fQ > 0) && fP !== fQ ? fP / (fP - fQ) : 0.5);
      }
      for (const f of act) {
        const sg = seg[f], P = sg.P, Q = sg.Q, dx = X(Q) - X(P), dy = Y(Q) - Y(P), ll = dx * dx + dy * dy || 1;
        sg.param = (id) => ((X(id) - X(P)) * dx + (Y(id) - Y(P)) * dy) / ll;
        for (let k = 1; k < sg.pts.length; k += 2) sg.pts[k] = sg.param(sg.pts[k - 1]);
      }
      for (const fc of B.faces) {
        const r = region(fc.clip, a, b, c, EA, EB);
        if (!r) continue;
        expand(r[0], r[1], EA, EB, ring);
        emitPoly(ring.slice(), fc.L, fc.up, levels[fc.L].z === undefined ? 0 : 2);
      }
      for (const Wl of B.walls) {
        const r = region(Wl.clip, a, b, c, EA, EB);
        if (!r) continue;
        wallsOf(r[0].slice(), r[1].slice(), Wl, EA, EB, BND);
      }
    }
  }
  function isBoundary(e) {
    if (e < NH) { const j = Math.floor(e / nx); return j === 0 || j === ny; }
    if (e < NH + NV) { const i = (e - NH) % W1; return i === 0 || i === nx; }
    return false;
  }
  // rectangles of flat cells, fanned from their centre with every grid point on their rim
  for (let fi = 0; fi < B.faces.length; fi++) {
    const marks = flatMarks[fi];
    if (!marks) continue;
    const fc = B.faces[fi], grp = levels[fc.L].z === undefined ? 0 : 2, used = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const c0 = j * nx + i, z = marks[c0];
      if (z !== z || used[c0]) continue;
      let w = 1;
      while (i + w < nx && w < 48 && marks[c0 + w] === z && !used[c0 + w]) w++;
      let hgt = 1;
      grow: while (j + hgt < ny && hgt < 48) { for (let k = 0; k < w; k++) { const c2 = (j + hgt) * nx + i + k; if (marks[c2] !== z || used[c2]) break grow; } hgt++; }
      for (let q = 0; q < hgt; q++) for (let k = 0; k < w; k++) used[(j + q) * nx + i + k] = 1;
      const rim = [];
      for (let k = 0; k < w; k++) rim.push(j * W1 + i + k);
      for (let q = 0; q < hgt; q++) rim.push((j + q) * W1 + i + w);
      for (let k = w; k > 0; k--) rim.push((j + hgt) * W1 + i + k);
      for (let q = hgt; q > 0; q--) rim.push((j + q) * W1 + i);
      if (w === 1 && hgt === 1) {
        const [a, b, c, d] = rim.map((id) => vid(id, fc.L, grp));
        if (fc.up) { tri3(a, b, c); tri3(a, c, d); } else { tri3(a, c, b); tri3(a, d, c); }
        continue;
      }
      const cv = vid(freePoint(x0 + (i + w / 2) * gx, y0 + (j + hgt / 2) * gy, z), fc.L, grp);
      for (let k = 0; k < rim.length; k++) {
        const a = vid(rim[k], fc.L, grp), b = vid(rim[(k + 1) % rim.length], fc.L, grp);
        if (fc.up) tri3(cv, a, b); else tri3(cv, b, a);
      }
    }
  }
  return { position: pos.slice(0, pn), index: idx.slice(0, ixn) };
}

function meshStats(m) {
  const P = m.position, I = m.index;
  let vol = 0, area = 0;
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let k = 0; k < P.length; k += 3) {
    for (let d = 0; d < 3; d++) { if (P[k + d] < bb[d]) bb[d] = P[k + d]; if (P[k + d] > bb[d + 3]) bb[d + 3] = P[k + d]; }
  }
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    vol += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  m.volume = vol / 6; m.area = area; m.bbox = bb; m.tris = I.length / 3;
  // a printed panel is mostly skin: walls and top and bottom layers about 0.9 mm, 15% infill inside
  const skin = Math.min(m.volume, area * 0.9);
  m.grams = (skin + Math.max(0, m.volume - skin) * 0.15) * 1.24e-3;
  return m;
}
function addNormals(m) {
  const P = m.position, I = m.index, N = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { N[v] += nx; N[v + 1] += ny; N[v + 2] += nz; }
  }
  for (let k = 0; k < N.length; k += 3) { const l = Math.hypot(N[k], N[k + 1], N[k + 2]) || 1; N[k] /= l; N[k + 1] /= l; N[k + 2] /= l; }
  m.normal = N;
  return m;
}

// ============================================================ building
// A tile at a grid spacing of res mm. Returns its bodies: one, or the base and the tips when two-tone.
function buildTile(C, plan, tile, res, opts) {
  const P = C.P, pd = C.pd, c2 = P.tiles.clearance / 2;
  const shape = tileShape(C, plan, tile);
  const pockets = tilePockets(C, plan, tile, shape, opts.final);
  // the grid: straight cuts are its edges; tabs and pattern seams get room around the tile
  const room = plan.pattern ? plan.protrude + 2 : tabDepth(P) + 3;
  const left = tile.c === 0, right = tile.c === plan.cols - 1, bottom = tile.r === 0, top = tile.r === plan.rows - 1;
  const gx0 = left ? -C.a - 1.5 : shape ? tile.x0 - room : tile.x0 + c2;
  const gx1 = right ? C.a + 1.5 : shape ? tile.x1 + room : tile.x1 - c2;
  const gy0 = bottom ? -C.b - 1.5 : shape ? tile.y0 - room : tile.y0 + c2;
  const gy1 = top ? C.b + 1.5 : shape ? tile.y1 + room : tile.y1 - c2;
  const nx = Math.max(2, Math.ceil((gx1 - gx0) / res)), ny = Math.max(2, Math.ceil((gy1 - gy0) / res));
  const gx = (gx1 - gx0) / nx, gy = (gy1 - gy0) / ny, W1 = nx + 1, NG = W1 * (ny + 1);
  const T = new Float32Array(NG);
  const Fo = new Float32Array(NG), Fc = C.cutMode ? new Float32Array(NG) : null, Fs = shape ? new Float32Array(NG) : null, Fr = C.ribMode ? new Float32Array(NG) : null;
  const depthsSet = [...new Set(pockets.filter((p) => p.depth > 0.25).map((p) => +p.depth.toFixed(2)))].sort((p, q) => p - q);
  const Fp = depthsSet.map(() => new Float32Array(NG));
  // values right at zero make crossings that sit on the grid points: keep every value a little clear of zero
  const eps = 0.05 * Math.min(gx, gy), nudge = (v) => (v >= 0 ? (v < eps ? eps : v) : v > -eps ? -eps : v);
  // a flat terrace right at the colour split stays in the base colour rather than a sheet of nothing on top
  const tzOf = (t) => { const v = t - C.zc; return v < 0.02 ? Math.min(v, -0.02) : v; };
  // openwork keeps solid rails along the seams and pads round the joints and pockets
  const rail = C.cutMode ? (x, y) => {
    let v = -1e9;
    if (!plan.pattern) {
      if (tile.c > 0) v = Math.max(v, 3.6 - Math.abs(x - tile.x0)); if (tile.c < plan.cols - 1) v = Math.max(v, 3.6 - Math.abs(x - tile.x1));
      if (tile.r > 0) v = Math.max(v, 3.6 - Math.abs(y - tile.y0)); if (tile.r < plan.rows - 1) v = Math.max(v, 3.6 - Math.abs(y - tile.y1));
    }
    for (const t of plan.tabs) if (t.owner === tile.index || t.other === tile.index) { const [lx, ly] = local(t, x, y); if (Math.abs(lx) < 40 && Math.abs(ly) < 40) v = Math.max(v, tabSDF(plan.joint, P.tiles.tab, lx, ly) + 4.5); }
    for (const p of pockets) { const d = Math.hypot(x - p.x, y - p.y); if (d < p.r + 8) v = Math.max(v, p.r + 3.5 - d); }
    return v;
  } : null;
  for (let j = 0; j <= ny; j++) {
    const y = gy0 + j * gy;
    for (let i = 0; i <= nx; i++) {
      const x = gx0 + i * gx, k = j * W1 + i;
      const R = C.evalAt(x, y);
      T[k] = R.t;
      Fo[k] = nudge(R.d);
      if (Fc) Fc[k] = nudge(Math.max(R.c, rail(x, y)));
      if (Fr) Fr[k] = nudge(R.r);
      if (Fs) Fs[k] = nudge(shape(x, y));
      for (let q = 0; q < depthsSet.length; q++) {
        let v = -1e9;
        for (const p of pockets) if (+p.depth.toFixed(2) === depthsSet[q] && Math.abs(x - p.x) < p.r + 4 && Math.abs(y - p.y) < p.r + 4) v = Math.max(v, p.sdf(x, y));
        Fp[q][k] = nudge(v === -1e9 ? -5 : v);
      }
    }
  }
  // each quad splits along the diagonal that follows the surface best
  const diag = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const v00 = j * W1 + i, a = T[v00], b = T[v00 + 1], d = T[v00 + W1], c = T[v00 + W1 + 1];
    if (opts.final) {
      const m = C.evalAt(gx0 + (i + 0.5) * gx, gy0 + (j + 0.5) * gy).t;
      diag[j * nx + i] = Math.abs((b + d) / 2 - m) < Math.abs((a + c) / 2 - m) ? 1 : 0;
    } else diag[j * nx + i] = Math.abs(b - d) < Math.abs(a - c) ? 1 : 0;
  }
  const G = { nx, ny, x0: gx0, y0: gy0, gx, gy, T, diag };
  const solid = [Fo, Fc, Fs].filter(Boolean);
  const bodies = [];
  const Sclip = (fields) => fields.flatMap((_, k) => [k, 1]);
  // the base body (the whole tile when it is one colour). With ribs, the back is one slab and the ribs
  // stand on it: the gaps between them are a floor at the back's thickness.
  {
    const ns = solid.length, sb = Sclip(solid), Stags = (1 << ns) - 1;
    const ri = Fr ? ns : -1, p0 = ns + (Fr ? 1 : 0);
    const fields = [...solid, ...(Fr ? [Fr] : []), ...Fp];
    let Ftz = null;
    if (C.twoTone) { Ftz = new Float32Array(NG); for (let k = 0; k < NG; k++) Ftz[k] = tzOf(T[k]); fields.push(Ftz); }
    const tz = C.twoTone ? fields.length - 1 : -1;
    const levels = [{ z: 0 }, ...depthsSet.map((z) => ({ z })), ...(Fr ? [{ z: P.base }] : []), C.twoTone ? { cap: C.zc } : {}];
    const Ltop = levels.length - 1, Lb = Fr ? Ltop - 1 : -1;
    const topClip = Fr ? [...sb, ri, 1] : sb;
    const faces = [{ clip: [...sb, ...Fp.flatMap((_, q) => [p0 + q, -1])], L: 0, up: false, flat: true }];
    depthsSet.forEach((_, q) => faces.push({ clip: [...sb, p0 + q, 1], L: 1 + q, up: false, flat: true }));
    if (Fr) faces.push({ clip: [...sb, ri, -1], L: Lb, up: true, flat: true });
    if (C.twoTone) { faces.push({ clip: [...topClip, tz, -1], L: Ltop, up: true }); faces.push({ clip: [...topClip, tz, 1], L: Ltop, up: true, flat: true }); }
    else faces.push({ clip: topClip, L: Ltop, up: true });
    const walls = [];
    for (let k = 0; k <= depthsSet.length; k++) {
      const open = Fp.map((_, q) => q).filter((q) => q >= k);
      walls.push({ clip: [...sb, ...open.flatMap((q) => [p0 + q, -1])], tags: Stags | open.reduce((m, q) => m | (1 << (p0 + q)), 0), lo: k, hi: k + 1 });
    }
    if (Fr) walls.push({ clip: topClip, tags: Stags | (1 << ri), lo: Lb, hi: Ltop });
    const m = meshBody(G, { fields, levels, faces, walls, groups: opts.groups, noMerge: !!opts.normals });
    bodies.push({ tone: 0, ...m });
  }
  if (C.twoTone) {
    const Ftz = new Float32Array(NG);
    for (let k = 0; k < NG; k++) Ftz[k] = tzOf(T[k]);
    const ns = solid.length, sb = Sclip(solid);
    const fields = [...solid, ...(Fr ? [Fr] : []), Ftz], tz = fields.length - 1;
    const clipU = [...sb, ...(Fr ? [ns, 1] : []), tz, 1];
    const m = meshBody(G, {
      fields, levels: [{ z: C.zc }, {}], merge: { top: 1, base: 0, bit: 1 << tz },
      faces: [{ clip: clipU, L: 0, up: false, flat: true }, { clip: clipU, L: 1, up: true }],
      walls: [{ clip: clipU, tags: (1 << ns) - 1 | (Fr ? 1 << ns : 0), lo: 0, hi: 1 }], groups: opts.groups, noMerge: !!opts.normals,
    });
    if (m.index.length) bodies.push({ tone: 1, ...m });
  }
  for (const bd of bodies) { meshStats(bd); if (opts.normals) addNormals(bd); }
  return { index: tile.index, label: tile.label, c: tile.c, r: tile.r, cell: [tile.x0, tile.x1, tile.y0, tile.y1], bodies, pockets: pockets.map((p) => ({ kind: p.kind, x: p.x, y: p.y })) };
}

// The loose parts: bowtie keys for hidden joints and stand-off pucks for a halo light.
function buildParts(C, plan, opts) {
  const P = C.P;
  const parts = [];
  const flat = (field, w, h, levelsZ, faces, walls, res = 0.25) => {
    const nx = Math.ceil(w / res), ny = Math.ceil(h / res), gx = w / nx, gy = h / ny, W1 = nx + 1, NG = W1 * (ny + 1);
    const T = new Float32Array(NG), fields = field.map(() => new Float32Array(NG));
    const eps = 0.05 * Math.min(gx, gy);
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) field.forEach((fn, q) => { const v = fn(-w / 2 + i * gx, -h / 2 + j * gy); fields[q][j * W1 + i] = v >= 0 ? Math.max(v, eps) : Math.min(v, -eps); });
    const m = meshBody({ nx, ny, x0: -w / 2, y0: -h / 2, gx, gy, T, diag: new Uint8Array(nx * ny) }, { fields, levels: levelsZ.map((z) => ({ z })), faces, walls, groups: opts.groups });
    meshStats(m); if (opts.normals) addNormals(m);
    return m;
  };
  if (plan.keys.length) {
    const pd = C.pd, c2 = P.tiles.clearance / 2, t = Math.max(1.2, pd.key - 0.25);
    const m = flat([(x, y) => bowtie(x, y) - c2], 34, 18, [0, t], [{ clip: [0, 1], L: 0, up: false, flat: true }, { clip: [0, 1], L: 1, up: true, flat: true }], [{ clip: [0, 1], tags: 1, lo: 0, hi: 1 }]);
    parts.push({ key: 'key', label: 'Joint key', count: plan.keys.length, mesh: m, size: [30, 14, t] });
  }
  let pucks = 0;
  if (P.mount === 'halo') for (const t of plan.tiles) if (!t.empty) pucks += tilePockets(C, plan, t, tileShape(C, plan, t), false).filter((p) => p.kind === 'halo').length;
  if (pucks) {
    const H = 16, peg = 3;
    const m = flat([(x, y) => 12 - Math.hypot(x, y), (x, y) => 4.85 - Math.hypot(x, y)], 26, 26, [0, H, H + peg],
      [{ clip: [0, 1], L: 0, up: false, flat: true }, { clip: [0, 1, 1, -1], L: 1, up: true, flat: true }, { clip: [1, 1], L: 2, up: true, flat: true }],
      [{ clip: [0, 1], tags: 1, lo: 0, hi: 1 }, { clip: [1, 1], tags: 2, lo: 1, hi: 2 }], 0.2);
    parts.push({ key: 'puck', label: 'Halo stand-off', count: pucks, mesh: m, size: [24, 24, H + peg] });
  }
  return parts;
}

// Builds the panel: every tile (or only opts.only), and the loose parts.
// opts: { res (mm), bed, final, normals, groups, only: [tile index], img }
export function buildPanel(src, opts = {}) {
  const P = normalizePanel(src);
  const plan = planPanel(P, opts.bed || [256, 256]);
  const C = compile(P, opts.img);
  const res = Math.min(opts.res || previewRes(P), P.mode === 'ribs' && !opts.res ? Math.min(P.ribs.width, P.ribs.gap) / 3 : Infinity);
  const tiles = [];
  for (const t of plan.tiles) {
    if (t.empty || (opts.only && !opts.only.includes(t.index))) continue;
    const built = buildTile(C, plan, t, res, opts);
    // a tile the seams left without any of the panel (pattern seams round big cells) is dropped
    if (built.bodies.length && built.bodies[0].tris > 0) tiles.push(built); else t.empty = true;
  }
  const parts = opts.only && !opts.parts ? [] : buildParts(C, plan, opts);
  const pd = C.pd;
  return { tiles, parts, plan, info: { res, zc: C.zc, twoTone: C.twoTone, cut: C.cutMode, depths: pd } };
}
// A grid spacing that keeps the whole panel near the given number of samples.
export function previewRes(P, budget = 260000) {
  const r = clamp(Math.sqrt((P.width * P.height) / budget), 0.6, 4);
  // ribs need a few samples across each rib and gap to keep their walls straight; allow more samples for them
  if (P.mode === 'ribs' && P.ribs) return Math.max(Math.min(r, Math.min(P.ribs.width, P.ribs.gap) / 2.5), Math.sqrt((P.width * P.height) / 1.1e6));
  return r;
}

// What to check before printing. Returns [{ level: 'ok' | 'warn' | 'bad', text }].
export function panelChecks(src, plan, built) {
  const P = normalizePanel(src), out = [];
  const pd = pocketDepths(P);
  const bed = plan.bed, pat = PANEL_PATTERNS[P.pattern];
  const max = plan.tiles.filter((t) => !t.empty).reduce((m, t) => [Math.max(m[0], t.x1 - t.x0), Math.max(m[1], t.y1 - t.y0)], [0, 0]);
  const [bw, bh] = plan.rotated ? [bed[1], bed[0]] : bed;
  const n = plan.tiles.filter((t) => !t.empty).length;
  if (max[0] + plan.protrude > bw - 4 || max[1] + plan.protrude > bh - 4) out.push({ level: 'bad', text: `Tiles are up to ${Math.round(max[0] + plan.protrude)} × ${Math.round(max[1] + plan.protrude)} mm; the bed takes ${bw} × ${bh}. Use more tiles.` });
  else out.push({ level: 'ok', text: `${n} tile${n > 1 ? 's' : ''}, each fits the ${bed[0]} × ${bed[1]} mm bed${plan.rotated ? ' turned a quarter' : ''}.` });
  out.push({ level: 'ok', text: 'No overhangs: every tile prints face up, flat on its back, without supports.' });
  if (n > 36) out.push({ level: 'warn', text: `${n} tiles make a big download. Draft detail keeps the files smaller, or use a larger printer.` });
  if (P.base < 3) out.push({ level: 'warn', text: `A ${P.base} mm back can bow on a wide tile. 4 mm or more stays flat.` });
  if (P.mode === 'cut') {
    const bw2 = P.pattern === 'reed' || P.pattern === 'bubble' || P.pattern === 'halftone' || P.pattern === 'moroccan' ? null : 2 * Math.max(1.1 / P.scale, 0.035 + 0.15 * (1 - P.open)) * P.scale;
    if (bw2 !== null && bw2 < 2.5) out.push({ level: 'warn', text: `Openwork bars are about ${bw2.toFixed(1)} mm wide. Raise Scale or lower Openness for sturdier bars.` });
    else out.push({ level: 'ok', text: 'Openwork bars stay at least 2 mm wide, with solid rails along every seam.' });
  }
  if (P.mode === 'ribs') {
    const RB = P.ribs, tall = P.depth / RB.width;
    out.push({ level: 'ok', text: `${Math.round(P.width / (RB.width + RB.gap))} ribs, ${RB.width} mm wide with ${RB.gap} mm gaps, up to ${(P.base + P.depth).toFixed(0)} mm deep.` });
    if (RB.width < 2.4) out.push({ level: 'warn', text: `${RB.width} mm ribs are only a few lines wide. 3 mm or more prints crisp.` });
    if (tall > 9) out.push({ level: 'warn', text: `The ribs are ${tall.toFixed(0)} times taller than they are wide and may wobble near the top. Widen them, lower Depth, or slow the outer walls.` });
  }
  if (plan.snapped) out.push({ level: 'ok', text: P.mode === 'ribs' ? 'Seams run down the gaps between ribs, so no rib is cut along its length.' : 'Seams sit in the pattern\'s grooves, so they hide in the relief.' });
  if (plan.pattern) out.push({ level: 'ok', text: 'Seams follow the pattern\'s cells. Mount each tile on its own, or glue them edge to edge.' });
  else if (plan.patternWanted) out.push({ level: 'warn', text: 'The pattern\'s cells are too big for seams to follow them on this bed, so the seams are straight. Lower Scale to bring them back.' });
  if (plan.joint === 'keys') out.push({ level: 'ok', text: `${plan.keys.length} bowtie keys join the tiles from behind. They print flat on their own plate.` });
  if ((plan.joint === 'dovetail' || plan.joint === 'jigsaw') && plan.tabs.length) out.push({ level: 'ok', text: `${plan.tabs.length} ${plan.joint} tabs lock the tiles together with ${P.tiles.clearance.toFixed(2)} mm clearance. Print the fit test first if your printer runs tight.` });
  if ((P.mount === 'magnets' || P.mount === 'halo') && pd.mag < pd.wantMag - 0.05) out.push({ level: 'warn', text: `The back is too thin for 3 mm magnets: the pockets are ${pd.mag.toFixed(1)} mm deep. Raise Back thickness to 5 mm.` });
  if (P.mount === 'slots' && pd.slot < 3.4) out.push({ level: 'warn', text: `Hanging slots are only ${pd.slot.toFixed(1)} mm deep, so a screw head may hold the panel off the wall. Raise Back thickness.` });
  if (built) {
    const g = built.tiles.reduce((s, t) => s + t.bodies.reduce((q, b) => q + b.grams, 0), 0);
    if (g > 2000) out.push({ level: 'warn', text: `About ${(g / 1000).toFixed(1)} kg of filament. Check you have enough on the spool, or lower Depth.` });
  }
  if (pat.image && !src._hasImage) out.push({ level: 'warn', text: 'Pick a picture in Pattern for the relief to follow.' });
  return out;
}
export { compile as _compile, meshBody as _meshBody, tileShape as _tileShape, pocketDepths };
