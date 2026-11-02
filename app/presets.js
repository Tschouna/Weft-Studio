// Default parameters, silhouettes and the starter collection.

export const BASE = {
  name: 'Untitled',
  object: 'planter',
  form: {
    height: 140, diameter: 150, base: 0.88, top: 1.0, belly: 0.5, fullness: 0.3, lip: 0, lipH: 12, inset: 1.5, wall: 3, floor: 3,
    section: 'round', sides: 6, corner: 0.18, lobes: 8, lobeDepth: 0.1, lobeStyle: 'scallop', twist: 0,
    rimEdge: 'flat', rimShape: 'level', rimWaves: 6, rimDepth: 8,
  },
  surface: {
    pattern: 'lattice', mode: 'cut', count: 24, angle: 55, width: 2.0, fill: 0.85, depth: 1.6, profile: 'round', invert: false,
    jitter: 0.6, stretch: 1, round: 0.6, wave: 0, waveFreq: 1.5, rows: 24, gradient: 0, bandBottom: 6, bandTop: 4, bulge: 0, seed: 7,
    alt: false, vary: 0, arch: false, edge: 'pattern', swirl: 0,
  },
  extras: {
    drain: 0, base: 'none', sleeveH: 0.38, sleeveTilt: 18, gap: 1.0, lid: true, knob: 'ball', knobSize: 26, lidOverhang: 0.6,
    clearance: 0.35, plugDepth: 6, socket: 40, vaseMode: false, reservoir: 30, baseH: 55, cord: true, hangers: 3, back: 0.3,
  },
  finish: {
    color: '#22211f', color2: '#eeebe4', color3: '#22211f', material: 'matte',
    // used only while multicolour is switched on
    multi: { layout: 'split', split: 0.42, stripes: 5, slots: ['#a34f31', '#d8a647', '#6f7d6b'] },
  },
};

// watertight: holds soil or water, so surfaces are raised, never cut through
export const OBJECTS = {
  planter: { label: 'Planter', blurb: 'Watertight pot, optional sleeve or saucer', watertight: true },
  vase: { label: 'Vase', blurb: 'Watertight, holds water and stems', watertight: true },
  bowl: { label: 'Bowl', blurb: 'Catch-all, fruit bowl, key tray' },
  box: { label: 'Storage box', blurb: 'Basket with a press-fit lid and knob' },
  cup: { label: 'Cup & holder', blurb: 'Pen cups, utensil holders, sleeves' },
  pendant: { label: 'Pendant lamp', blurb: 'Shade for an E27 or E14 socket', lamp: true },
  lamp: { label: 'Table lamp', blurb: 'Shade on a base for an E27 lamp kit', lamp: true },
  hanging: { label: 'Hanging planter', blurb: 'Watertight pot with holes for hanging cords', watertight: true },
  wall: { label: 'Wall planter', blurb: 'Flat back with a keyhole for one screw', watertight: true },
  orchid: { label: 'Orchid pot', blurb: 'Open sides let the roots breathe' },
  lantern: { label: 'Tealight lantern', blurb: 'Openwork glow around an LED tealight', lamp: true, candle: true },
  tray: { label: 'Tray', blurb: 'Low dish for keys, rings and jewellery' },
  ring: { label: 'Napkin ring', blurb: 'Open band: napkin rings, bangles, sleeves' },
};

// Silhouettes as ratios; the size sliders stay where they are.
export const SILHOUETTES = {
  cylinder: { label: 'Cylinder', base: 1, top: 1, belly: 0.5, fullness: 0 },
  taper: { label: 'Taper', base: 0.78, top: 1.08, belly: 0.5, fullness: 0 },
  cone: { label: 'Cone', base: 1.3, top: 0.7, belly: 0.5, fullness: 0 },
  funnel: { label: 'Funnel', base: 0.66, top: 1.34, belly: 0.5, fullness: 0 },
  barrel: { label: 'Barrel', base: 0.84, top: 0.86, belly: 0.5, fullness: 0.75 },
  lantern: { label: 'Lantern', base: 0.88, top: 0.88, belly: 0.5, fullness: 1 },
  ovoid: { label: 'Ovoid', base: 0.6, top: 0.62, belly: 0.46, fullness: 0.85 },
  globe: { label: 'Globe', base: 0.5, top: 0.48, belly: 0.5, fullness: 1, lip: 3, lipH: 10 },
  tulip: { label: 'Tulip', base: 0.72, top: 0.96, belly: 0.34, fullness: 0.55 },
  amphora: { label: 'Amphora', base: 0.6, top: 0.5, belly: 0.36, fullness: 0.55, lip: 11, lipH: 34 },
  urn: { label: 'Urn', base: 0.62, top: 0.8, belly: 0.62, fullness: 0.45, lip: 6, lipH: 18 },
  bowl: { label: 'Bowl', base: 0.6, top: 0.97, belly: 0.66, fullness: 0.55 },
  bell: { label: 'Bell', base: 0.46, top: 0.94, belly: 0.62, fullness: 0.3 },
  waist: { label: 'Waist', base: 1.16, top: 1.2, belly: 0.46, fullness: 0 },
  orb: { label: 'Orb', base: 0.58, top: 0.8, belly: 0.46, fullness: 0.95 },
};

const merge = (a, b) => {
  const o = Array.isArray(a) ? [...a] : { ...a };
  for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(a[k] || {}, b[k]) : b[k];
  return o;
};
export const design = (over) => merge(BASE, over);
export const clone = (d) => JSON.parse(JSON.stringify(d));

export const COLLECTION = [
  design({
    name: 'Atrium', object: 'pendant',
    form: { height: 190, diameter: 250, base: 0.42, top: 0.93, belly: 0.6, fullness: 0.3, inset: 0, wall: 3, floor: 3 },
    surface: { pattern: 'lattice', mode: 'cut', count: 22, angle: 54, width: 2.2, round: 0.8, bandBottom: 8, bandTop: 6 },
    finish: { color: '#22211f', material: 'matte' },
  }),
  design({
    name: 'Filo', object: 'bowl',
    form: { height: 82, diameter: 260, base: 0.62, top: 0.95, belly: 0.66, fullness: 0.62, inset: 1.2, wall: 3, floor: 3 },
    surface: { pattern: 'lattice', mode: 'cut', count: 54, angle: 52, width: 2.0, round: 0.5, bandBottom: 5, bandTop: 3 },
    finish: { color: '#3a3b3d', material: 'satin' },
  }),
  design({
    name: 'Cellula', object: 'cup',
    form: { height: 105, diameter: 92, base: 0.93, top: 1.03, belly: 0.5, fullness: 0.2, inset: 1, wall: 3, floor: 3 },
    surface: { pattern: 'voronoi', mode: 'cut', count: 11, jitter: 0.75, stretch: 1.35, width: 2.4, round: 1.6, bandBottom: 5, bandTop: 3, seed: 11, arch: true },
    finish: { color: '#a34f31', material: 'matte' },
  }),
  design({
    name: 'Dune', object: 'planter',
    form: { height: 150, diameter: 170, base: 0.97, top: 0.98, belly: 0.45, fullness: 0.7, inset: 0, wall: 3, floor: 3 },
    surface: { pattern: 'ribs', mode: 'relief', count: 46, angle: 34, fill: 1, depth: 2.4, profile: 'round', bandBottom: 0, bandTop: 0 },
    extras: { drain: 8, base: 'sleeve', sleeveH: 0.4, sleeveTilt: 26 },
    finish: { color: '#eeebe4', color2: '#8d8f8e', material: 'matte' },
  }),
  design({
    name: 'Mesh', object: 'planter',
    form: { height: 140, diameter: 165, base: 0.97, top: 0.98, belly: 0.45, fullness: 0.7, inset: 0, wall: 3, floor: 3 },
    surface: { pattern: 'lattice', mode: 'relief', count: 34, angle: 58, fill: 0.5, depth: 1.8, profile: 'round', bandBottom: 0, bandTop: 3 },
    extras: { drain: 8, base: 'sleeve', sleeveH: 0.42, sleeveTilt: 24 },
    finish: { color: '#3a3b3d', color2: '#8d8f8e', material: 'matte' },
  }),
  design({
    name: 'Cove', object: 'box',
    form: { height: 100, diameter: 200, base: 0.84, top: 0.88, belly: 0.5, fullness: 0.8, inset: 1.2, wall: 3, floor: 3 },
    surface: { pattern: 'lattice', mode: 'cut', count: 40, angle: 56, width: 2.0, round: 0.6, bandBottom: 5, bandTop: 9 },
    extras: { lid: true, knob: 'ball', knobSize: 24 },
    finish: { color: '#22211f', color3: '#22211f', material: 'matte' },
  }),
  design({
    name: 'Flute', object: 'vase',
    form: { height: 220, diameter: 112, base: 0.8, top: 0.66, belly: 0.36, fullness: 0.5, lip: 7, lipH: 26, inset: 1.2, wall: 3, floor: 3 },
    surface: { pattern: 'ribs', mode: 'relief', count: 32, angle: 0, fill: 1, depth: 2.6, profile: 'round', bandBottom: 0, bandTop: 0 },
    extras: { vaseMode: true },
    finish: { color: '#c9b8a3', material: 'silk' },
  }),
  design({
    name: 'Hive', object: 'box',
    form: { height: 120, diameter: 180, base: 0.9, top: 1.0, belly: 0.5, fullness: 0.15, inset: 1.2, wall: 3, floor: 3 },
    surface: { pattern: 'honeycomb', mode: 'cut', count: 18, stretch: 1.8, width: 2.6, round: 1.0, bandBottom: 6, bandTop: 4 },
    extras: { lid: false },
    finish: { color: '#d8a647', material: 'satin' },
  }),
  design({
    name: 'Shingle', object: 'planter',
    form: { height: 130, diameter: 150, base: 0.8, top: 1.0, belly: 0.55, fullness: 0.35, inset: 1.5, wall: 3, floor: 3 },
    surface: { pattern: 'petals', mode: 'relief', count: 16, stretch: 0.9, depth: 1.3, profile: 'round', bandBottom: 2, bandTop: 4 },
    extras: { drain: 10, base: 'saucer' },
    finish: { color: '#6f7d6b', color2: '#eeebe4', material: 'matte' },
  }),
  design({
    name: 'Ripple', object: 'vase',
    form: { height: 170, diameter: 118, base: 0.9, top: 0.9, belly: 0.5, fullness: 0.55, inset: 1.2, wall: 3, floor: 3 },
    surface: { pattern: 'waves', mode: 'relief', count: 4, rows: 24, wave: 0.45, fill: 1, depth: 1.1, profile: 'soft', bandBottom: 0, bandTop: 3 },
    extras: { vaseMode: true },
    finish: { color: '#eeebe4', material: 'satin' },
  }),
  design({
    name: 'Cocoon', object: 'pendant',
    form: { height: 240, diameter: 220, base: 0.36, top: 0.56, belly: 0.5, fullness: 0.62, inset: 0, wall: 3, floor: 3 },
    surface: { pattern: 'voronoi', mode: 'cut', count: 18, jitter: 0.8, stretch: 1.4, width: 2.0, round: 1.4, bandBottom: 8, bandTop: 5, seed: 4, arch: true },
    finish: { color: '#eeebe4', material: 'matte' },
  }),
  design({
    name: 'Tote', object: 'box',
    form: { height: 110, diameter: 190, base: 0.92, top: 1.0, belly: 0.5, fullness: 0.25, inset: 1.2, wall: 3, floor: 3 },
    surface: { pattern: 'weave', mode: 'relief', count: 30, stretch: 1, fill: 0.92, depth: 1.6, profile: 'round', bandBottom: 4, bandTop: 6 },
    extras: { lid: true, knob: 'disc', knobSize: 30 },
    finish: { color: '#b9a58a', color3: '#5b4a3a', material: 'matte' },
  }),
  design({
    name: 'Riad', object: 'pendant',
    form: { height: 230, diameter: 240, base: 0.4, top: 0.6, belly: 0.5, fullness: 0.75, inset: 0, wall: 3, floor: 3 },
    surface: { pattern: 'ogee', mode: 'cut', count: 14, wave: 0.34, stretch: 1.25, width: 2.2, round: 0.6, bandBottom: 8, bandTop: 6 },
    finish: { color: '#d8a647', material: 'silk' },
  }),
  design({
    name: 'Spire', object: 'vase',
    form: { height: 230, diameter: 105, base: 0.92, top: 0.82, belly: 0.4, fullness: 0.4, lip: 0, inset: 1.2, wall: 3, floor: 3, section: 'polygon', sides: 6, corner: 0.16, twist: 90 },
    surface: { pattern: 'smooth', mode: 'none' },
    extras: { vaseMode: true },
    finish: { color: '#26324a', material: 'silk' },
  }),
  design({
    name: 'Bloom', object: 'planter',
    form: { height: 130, diameter: 170, base: 0.8, top: 1.0, belly: 0.6, fullness: 0.4, inset: 1.5, wall: 3, floor: 3, section: 'lobed', lobes: 9, lobeDepth: 0.1, lobeStyle: 'scallop', twist: 24 },
    surface: { pattern: 'reeds', mode: 'relief', count: 54, rows: 5, fill: 0.96, depth: 1.4, profile: 'round', bandBottom: 0, bandTop: 2 },
    extras: { drain: 10, base: 'saucer' },
    finish: { color: '#d9a79a', color2: '#eeebe4', material: 'matte' },
  }),
  design({
    name: 'Nave', object: 'cup',
    form: { height: 180, diameter: 120, base: 1, top: 1, belly: 0.5, fullness: 0, inset: 1.2, wall: 3, floor: 3, section: 'polygon', sides: 8, corner: 0.1 },
    surface: { pattern: 'arches', mode: 'cut', count: 16, stretch: 1.35, width: 2.6, round: 1.0, bandBottom: 10, bandTop: 8, alt: true },
    finish: { color: '#eeebe4', material: 'matte' },
  }),
  design({
    name: 'Quarry', object: 'planter',
    form: { height: 150, diameter: 160, base: 0.96, top: 0.98, belly: 0.5, fullness: 0.6, inset: 1.5, wall: 3, floor: 3, section: 'polygon', sides: 4, corner: 0.34 },
    surface: { pattern: 'hammered', mode: 'relief', count: 16, jitter: 0.85, stretch: 1.1, depth: 2.2, profile: 'round', bandBottom: 0, bandTop: 2 },
    extras: { drain: 8 },
    finish: { color: '#4b5a3e', material: 'matte' },
  }),
  design({
    name: 'Comb', object: 'planter',
    form: { height: 120, diameter: 190, base: 0.74, top: 0.86, belly: 0.55, fullness: 0.8, inset: 1.5, wall: 3, floor: 3 },
    surface: { pattern: 'carved', mode: 'relief', count: 16, stretch: 1.15, depth: 2.6, profile: 'round', bandBottom: 0, bandTop: 0 },
    extras: { drain: 10 },
    finish: { color: '#3a3b3d', material: 'satin' },
  }),
  design({
    name: 'Ondine', object: 'planter',
    form: { height: 140, diameter: 150, base: 0.97, top: 1.0, belly: 0.5, fullness: 0.4, inset: 1.5, wall: 3, floor: 3, section: 'polygon', sides: 4, corner: 0.45 },
    surface: { pattern: 'rings', mode: 'relief', count: 3, width: 5.5, fill: 1, depth: 0.8, profile: 'soft', bandBottom: 0, bandTop: 2, seed: 9 },
    extras: { drain: 8 },
    finish: { color: '#26324a', material: 'matte' },
  }),
  design({
    name: 'Sirocco', object: 'vase',
    form: { height: 210, diameter: 120, base: 0.82, top: 0.72, belly: 0.4, fullness: 0.5, lip: 5, lipH: 22, inset: 1.2, wall: 3, floor: 3 },
    surface: { pattern: 'dunes', mode: 'relief', count: 8, rows: 30, wave: 0.35, depth: 1.1, bandBottom: 0, bandTop: 3, seed: 3 },
    finish: { color: '#c9b8a3', material: 'satin' },
  }),
  design({
    name: 'Pinecone', object: 'planter',
    form: { height: 130, diameter: 190, base: 0.58, top: 0.8, belly: 0.46, fullness: 0.95, inset: 1.5, wall: 3, floor: 3 },
    surface: { pattern: 'knurl', mode: 'relief', count: 64, angle: 58, depth: 1.3, fill: 1, profile: 'sharp', bandBottom: 0, bandTop: 4 },
    extras: { base: 'insert', reservoir: 28, gap: 1.5 },
    finish: { color: '#3a3b3d', color2: '#8d8f8e' },
  }),
  design({
    name: 'Torsion', object: 'planter',
    form: { height: 120, diameter: 170, base: 0.6, top: 0.8, belly: 0.46, fullness: 0.9, inset: 1.5, wall: 3, floor: 3 },
    surface: { pattern: 'ribs', mode: 'relief', count: 72, angle: 0, depth: 1.3, fill: 0.92, profile: 'round', swirl: 110, bandBottom: 0, bandTop: 4 },
    extras: { base: 'insert', reservoir: 26, gap: 1.5 },
    finish: { color: '#5b4a3a', color2: '#8d8f8e', material: 'satin' },
  }),
  design({
    name: 'Isomer', object: 'planter',
    form: { height: 150, diameter: 160, base: 0.98, top: 1, belly: 0.5, fullness: 0, inset: 1.5, wall: 3, floor: 3 },
    surface: { pattern: 'cubes', mode: 'relief', count: 11, depth: 2.4, stretch: 1, bandBottom: 0, bandTop: 0 },
    extras: { drain: 8 },
    finish: { color: '#c9cbc8' },
  }),
  design({
    name: 'Chisel', object: 'planter',
    form: { height: 120, diameter: 150, section: 'polygon', sides: 4, corner: 0.36, base: 0.92, top: 1, belly: 0.5, fullness: 0.15, inset: 1.5, wall: 3, floor: 3 },
    surface: { pattern: 'gouge', mode: 'relief', count: 16, depth: 2.2, stretch: 1.25, jitter: 0.8, bandBottom: 0, bandTop: 3, seed: 11 },
    extras: { drain: 8 },
    finish: { color: '#6f7d6b', material: 'satin' },
  }),
  design({
    name: 'Strala', object: 'lamp',
    form: { height: 210, diameter: 140, section: 'polygon', sides: 4, corner: 0.42, twist: 70, base: 1, top: 1.02, belly: 0.5, fullness: 0.12, inset: 0, wall: 3, floor: 3 },
    surface: { pattern: 'perforated', mode: 'cut', count: 52, fill: 0.5, jitter: 0, arch: true, bandBottom: 8, bandTop: 5 },
    extras: { socket: 40, baseH: 55, cord: true },
    finish: { color: '#d8a647', color2: '#a34f31' },
  }),
  design({
    name: 'Seigaiha', object: 'vase',
    form: { height: 190, diameter: 120, base: 0.8, top: 0.74, belly: 0.42, fullness: 0.55, lip: 4, lipH: 20, inset: 1.2, wall: 3, floor: 3 },
    surface: { pattern: 'seigaiha', mode: 'relief', count: 12, rows: 4, depth: 1.2, fill: 0.8, profile: 'round', bandBottom: 0, bandTop: 4 },
    finish: { color: '#26324a', material: 'silk' },
  }),
  design({
    name: 'Parquet', object: 'box',
    form: { height: 95, diameter: 170, section: 'polygon', sides: 4, corner: 0.3, base: 0.95, top: 1, belly: 0.5, fullness: 0, inset: 1.2, wall: 3, floor: 3 },
    surface: { pattern: 'herringbone', mode: 'relief', count: 18, depth: 1.2, width: 1.4, profile: 'sharp', bandBottom: 0, bandTop: 0 },
    extras: { lid: true, knob: 'disc', knobSize: 30 },
    finish: { color: '#b9a58a', color3: '#5b4a3a' },
  }),
];
