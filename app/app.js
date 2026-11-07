import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { zipSync, strToU8 } from 'fflate';
import { generate, swatch, makeProfile, easeProfile, makeSection, glowTest, GLOW_STEPS, facetedWall } from './engine.js';
import { BASE, OBJECTS, SILHOUETTES, COLLECTION, clone } from './presets.js';
import { initPanels } from './panels.js';

// ============================================================ catalogue
const PATTERNS = {
  lattice: { label: 'Lattice', modes: ['cut', 'relief'], cellMM: 24, count: 'Diamonds around', def: { angle: 55, width: 2.0, fill: 0.55, depth: 2.6, profile: 'round', round: 0.6, bulge: 0 } },
  prism: { label: 'Prism', modes: ['cut', 'relief'], cellMM: 28, count: 'Diamonds around', def: { angle: 58, width: 2.0, fill: 0.6, depth: 3.2, profile: 'sharp', round: 0.5, alt: false, bulge: 0 } },
  ogee: { label: 'Ogee', modes: ['cut', 'relief'], cellMM: 30, count: 'Cells around', def: { wave: 0.34, stretch: 1.2, width: 2.2, fill: 0.7, depth: 2.4, profile: 'round', round: 0.6, bulge: 0 } },
  arches: { label: 'Arches', modes: ['cut', 'relief'], cellMM: 22, count: 'Arches around', def: { stretch: 1.3, width: 2.4, fill: 0.7, depth: 2.4, profile: 'flat', round: 0.8, alt: false } },
  voronoi: { label: 'Voronoi', modes: ['cut', 'relief'], cellMM: 26, count: 'Cells around', def: { jitter: 0.75, stretch: 1.35, width: 2.2, round: 1.4, depth: 2.6, profile: 'round', arch: true } },
  honeycomb: { label: 'Honeycomb', modes: ['cut', 'relief'], cellMM: 26, count: 'Cells around', def: { stretch: 1.8, width: 2.4, round: 1.0, depth: 2.6, profile: 'round', arch: false } },
  dots: { label: 'Dots', modes: ['cut', 'relief'], cellMM: 12, count: 'Dots around', def: { fill: 0.6, jitter: 0, vary: 0, stretch: 1, arch: true, depth: 2.2, profile: 'soft' } },
  perforated: { label: 'Perforated', modes: ['cut', 'relief'], cellMM: 7, count: 'Holes around', def: { fill: 0.5, jitter: 0, vary: 0, stretch: 1, arch: true, depth: 1.2, profile: 'soft' } },
  wicker: { label: 'Wicker', modes: ['cut'], cellMM: 10, count: 'Strands around', def: { stretch: 1, width: 2.4, depth: 0.7, round: 0.4 } },
  ribs: { label: 'Ribs', modes: ['relief', 'cut'], cellMM: 11, count: 'Ribs around', def: { angle: 0, fill: 1, depth: 3.5, profile: 'round', width: 2.4, wave: 0, waveFreq: 1.5, round: 0.4 } },
  chevron: { label: 'Chevron', modes: ['relief', 'cut'], cellMM: 12, count: 'Ribs around', def: { angle: 32, stretch: 1, fill: 1, depth: 3.0, profile: 'round', width: 2.4, round: 0.4 } },
  reeds: { label: 'Reeds', modes: ['relief'], cellMM: 10, count: 'Reeds around', def: { rows: 6, fill: 0.96, depth: 3.0, profile: 'round' } },
  bark: { label: 'Bark', modes: ['relief'], cellMM: 9, count: 'Ridges around', def: { wave: 0.6, fill: 0.9, depth: 3.8, profile: 'sharp' } },
  waves: { label: 'Ripples', modes: ['relief'], cellMM: 0, count: 'Waves around', def: { count: 4, rows: 24, wave: 0.4, fill: 1, depth: 2.2, profile: 'soft' } },
  dunes: { label: 'Dunes', modes: ['relief'], cellMM: 60, count: 'Drift scale', def: { rows: 26, wave: 0.35, depth: 1.8 } },
  topo: { label: 'Topo', modes: ['relief'], cellMM: 60, count: 'Contours around', def: { rows: 16, width: 1.6, depth: 1.4, profile: 'soft' } },
  rings: { label: 'Rings', modes: ['relief'], cellMM: 160, count: 'Drops around', def: { width: 5.5, fill: 1, depth: 1.2, profile: 'soft' } },
  hammered: { label: 'Hammered', modes: ['relief'], cellMM: 30, count: 'Dimples around', def: { jitter: 0.85, stretch: 1.1, depth: 3.2, profile: 'round' } },
  carved: { label: 'Carved', modes: ['relief'], cellMM: 30, count: 'Cells around', def: { stretch: 1.15, depth: 4.2, profile: 'round' } },
  gouge: { label: 'Gouge', modes: ['relief'], cellMM: 28, count: 'Scoops around', def: { jitter: 0.8, stretch: 1.25, depth: 3.6 } },
  cubes: { label: 'Cubes', modes: ['relief'], cellMM: 40, count: 'Cubes around', def: { stretch: 1, depth: 4.5 } },
  knurl: { label: 'Knurl', modes: ['relief'], cellMM: 9, count: 'Diamonds around', def: { angle: 58, fill: 1, depth: 2.2, profile: 'sharp' } },
  knit: { label: 'Knit', modes: ['relief'], cellMM: 14, count: 'Stitches around', def: { stretch: 0.8, fill: 1, depth: 2.4, profile: 'soft' } },
  weave: { label: 'Basket', modes: ['relief'], cellMM: 18, count: 'Strands around', def: { stretch: 1, fill: 0.92, depth: 2.8, profile: 'round' } },
  petals: { label: 'Shingles', modes: ['relief'], cellMM: 30, count: 'Shingles around', def: { stretch: 0.9, depth: 2.4, profile: 'round' } },
  seigaiha: { label: 'Seigaiha', modes: ['relief'], cellMM: 36, count: 'Waves around', def: { rows: 4, fill: 0.8, stretch: 1, depth: 2.0, profile: 'round' } },
  quilt: { label: 'Quilt', modes: ['relief'], cellMM: 30, count: 'Diamonds around', def: { angle: 60, fill: 1, depth: 3.4, profile: 'round' } },
  facets: { label: 'Facets', modes: ['relief'], cellMM: 34, count: 'Facets around', def: { stretch: 1, jitter: 0.5, depth: 4.5 } },
  tiles: { label: 'Tiles', modes: ['relief'], cellMM: 34, count: 'Tiles around', def: { stretch: 1, width: 1.6, depth: 2.4, profile: 'sharp', alt: true, round: 0.5 } },
  herringbone: { label: 'Herringbone', modes: ['relief'], cellMM: 26, count: 'Chevrons around', def: { width: 1.4, depth: 2.2, profile: 'sharp' } },
  blocks: { label: 'Blocks', modes: ['relief'], cellMM: 32, count: 'Blocks around', def: { stretch: 1.4, width: 1.2, jitter: 0.75, depth: 5, profile: 'sharp', round: 0 } },
  spikes: { label: 'Spikes', modes: ['relief'], cellMM: 22, count: 'Spikes around', def: { angle: 60, fill: 1, depth: 6, profile: 'sharp' } },
  shards: { label: 'Shards', modes: ['relief'], cellMM: 18, count: 'Shards around', def: { stretch: 0.7, jitter: 0.85, depth: 7 } },
  fins: { label: 'Fins', modes: ['relief'], cellMM: 18, count: 'Fins around', def: { angle: 0, fill: 0.5, depth: 7, profile: 'flat', wave: 0, waveFreq: 1.5 } },
  hobnail: { label: 'Hobnail', modes: ['relief'], cellMM: 18, count: 'Bumps around', def: { fill: 0.85, jitter: 0, vary: 0, stretch: 1, arch: false, depth: 4, profile: 'round' } },
  smooth: { label: 'Smooth', modes: ['none'], cellMM: 0, count: '', def: {} },
};
const PATTERN_CONTROLS = {
  lattice: { cut: ['count', 'angle', 'width', 'round', 'bulge', 'gradient'], relief: ['count', 'angle', 'fill', 'depth', 'profile', 'invert', 'gradient'] },
  prism: { cut: ['count', 'angle', 'width', 'round', 'split', 'bulge', 'gradient'], relief: ['count', 'angle', 'split', 'fill', 'depth', 'profile', 'invert', 'gradient'] },
  ogee: { cut: ['count', 'curve', 'cellH', 'width', 'round', 'bulge', 'gradient'], relief: ['count', 'curve', 'cellH', 'fill', 'depth', 'profile', 'invert'] },
  arches: { cut: ['count', 'archH', 'width', 'round', 'stagger', 'gradient'], relief: ['count', 'archH', 'fill', 'depth', 'profile', 'invert', 'stagger'] },
  ribs: { relief: ['count', 'twist', 'wave', 'waveFreq', 'fill', 'depth', 'profile', 'invert', 'gradient'], cut: ['count', 'twistCut', 'wave', 'waveFreq', 'width', 'round', 'gradient'] },
  chevron: { relief: ['count', 'zig', 'zigH', 'fill', 'depth', 'profile', 'invert', 'gradient'], cut: ['count', 'zigCut', 'zigH', 'width', 'round', 'gradient'] },
  voronoi: { cut: ['count', 'jitter', 'stretch', 'width', 'round', 'arch', 'gradient', 'seed'], relief: ['count', 'jitter', 'stretch', 'width', 'depth', 'profile', 'invert', 'seed'] },
  honeycomb: { cut: ['count', 'stretch', 'width', 'round', 'arch', 'gradient'], relief: ['count', 'stretch', 'width', 'depth', 'profile', 'invert'] },
  dots: { cut: ['count', 'dotSize', 'rowGap', 'jitter', 'vary', 'teardrop', 'seed'], relief: ['count', 'dotSize', 'rowGap', 'jitter', 'vary', 'depth', 'profile', 'invert', 'seed'] },
  perforated: { cut: ['count', 'dotSize', 'rowGap', 'teardrop'], relief: ['count', 'dotSize', 'rowGap', 'depth', 'profile', 'invert'] },
  gouge: { relief: ['count', 'jitter', 'stretch', 'depth', 'seed'] },
  cubes: { relief: ['count', 'stretch', 'depth', 'invert'] },
  knurl: { relief: ['count', 'angle', 'fill', 'depth', 'profile', 'invert'] },
  seigaiha: { relief: ['count', 'fanRings', 'stretch', 'fill', 'depth', 'profile'] },
  herringbone: { relief: ['count', 'grout', 'depth', 'profile', 'seed'] },
  wicker: { cut: ['count', 'strandGap', 'width', 'weaveDepth', 'round'] },
  reeds: { relief: ['count', 'nodes', 'fill', 'depth', 'profile', 'seed'] },
  bark: { relief: ['count', 'wander', 'fill', 'depth', 'profile', 'seed'] },
  dunes: { relief: ['ripples', 'count', 'drift', 'depth', 'seed'] },
  rings: { relief: ['count', 'ringGap', 'fill', 'depth', 'profile', 'seed'] },
  hammered: { relief: ['count', 'jitter', 'stretch', 'depth', 'dish', 'invert', 'seed'] },
  carved: { relief: ['count', 'stretch', 'depth', 'dish', 'invert'] },
  waves: { relief: ['rows', 'count', 'wave', 'fill', 'depth', 'profile', 'invert', 'gradient'] },
  topo: { relief: ['count', 'lines', 'lineW', 'depth', 'profile', 'seed'] },
  knit: { relief: ['count', 'stretch', 'fill', 'depth', 'profile', 'gradient'] },
  weave: { relief: ['count', 'stretch', 'fill', 'depth', 'profile'] },
  petals: { relief: ['count', 'stretch', 'depth', 'profile', 'gradient'] },
  quilt: { relief: ['count', 'angle', 'fill', 'depth', 'profile', 'invert'] },
  facets: { relief: ['count', 'stretch', 'facetVar', 'depth', 'seed'] },
  tiles: { relief: ['count', 'tileH', 'grout', 'depth', 'profile', 'brick', 'round'] },
  blocks: { relief: ['count', 'blockH', 'grout', 'depthVar', 'depth', 'invert', 'seed'] },
  spikes: { relief: ['count', 'angle', 'fill', 'depth', 'profile', 'invert'] },
  shards: { relief: ['count', 'stretch', 'facetVar', 'depth', 'seed'] },
  fins: { relief: ['count', 'twist', 'wave', 'waveFreq', 'fill', 'depth', 'profile'] },
  hobnail: { relief: ['count', 'dotSize', 'rowGap', 'vary', 'depth', 'profile', 'invert'] },
  smooth: { none: [] },
};
const mm = (v) => `${(+v).toFixed(Math.abs(v) < 10 && v % 1 ? 1 : 0)} mm`;
const mm1 = (v) => `${(+v).toFixed(1)} mm`;
const pct = (v) => `${Math.round(v * 100)}%`;
const times = (v) => `${v.toFixed(2)}×`;
const SURF_SPECS = {
  count: { min: 3, max: 120, step: 1, fmt: (v) => `${v}` },
  rows: { label: 'Rows up the side', min: 6, max: 60, step: 1, fmt: (v) => `${v}` },
  angle: { label: 'Angle', min: 35, max: 78, step: 1, fmt: (v) => `${v}°` },
  twist: { key: 'angle', label: 'Lean', min: -60, max: 60, step: 1, fmt: (v) => `${v}°` },
  twistCut: { key: 'angle', label: 'Lean', min: -40, max: 40, step: 1, fmt: (v) => `${v}°` },
  zig: { key: 'angle', label: 'Zigzag angle', min: 10, max: 60, step: 1, fmt: (v) => `${v}°` },
  zigCut: { key: 'angle', label: 'Zigzag angle', min: 10, max: 40, step: 1, fmt: (v) => `${v}°` },
  zigH: { key: 'stretch', label: 'Zigzag height', min: 0.5, max: 3, step: 0.05, fmt: times },
  width: { label: 'Strip width', min: 0.8, max: 6, step: 0.1, fmt: mm1 },
  fill: { label: 'Coverage', min: 0.2, max: 1, step: 0.01, fmt: pct },
  depth: { label: 'Depth', min: 0.3, max: 12, step: 0.1, fmt: mm1 },
  jitter: { label: 'Irregularity', min: 0, max: 1, step: 0.01, fmt: pct },
  stretch: { label: 'Cell height', min: 0.5, max: 2.6, step: 0.05, fmt: times },
  cellH: { key: 'stretch', label: 'Cell height', min: 0.9, max: 2.2, step: 0.05, fmt: times },
  curve: { key: 'wave', label: 'Curve', min: 0.27, max: 0.48, step: 0.01, fmt: (v) => v.toFixed(2) },
  archH: { key: 'stretch', label: 'Arch height', min: 0.8, max: 2.4, step: 0.05, fmt: times },
  dotSize: { key: 'fill', label: 'Dot size', min: 0.2, max: 0.95, step: 0.01, fmt: pct },
  rowGap: { key: 'stretch', label: 'Row spacing', min: 0.7, max: 1.8, step: 0.05, fmt: times },
  vary: { label: 'Size variation', min: 0, max: 1, step: 0.01, fmt: pct },
  strandGap: { key: 'stretch', label: 'Strand spacing, vertical', min: 0.6, max: 2, step: 0.05, fmt: times },
  weaveDepth: { key: 'depth', label: 'Over-under depth', min: 0, max: 1.4, step: 0.05, fmt: mm1 },
  nodes: { key: 'rows', label: 'Nodes up the side', min: 2, max: 20, step: 1, fmt: (v) => `${v}` },
  lines: { key: 'rows', label: 'Line density', min: 6, max: 40, step: 1, fmt: (v) => `${v}` },
  lineW: { key: 'width', label: 'Line width', min: 0.8, max: 4, step: 0.1, fmt: mm1 },
  facetVar: { key: 'jitter', label: 'Randomness', min: 0, max: 1, step: 0.01, fmt: pct },
  tileH: { key: 'stretch', label: 'Tile height', min: 0.5, max: 2.5, step: 0.05, fmt: times },
  blockH: { key: 'stretch', label: 'Block height', min: 0.6, max: 3, step: 0.05, fmt: times },
  depthVar: { key: 'jitter', label: 'Depth variation', min: 0, max: 1, step: 0.01, fmt: pct },
  grout: { key: 'width', label: 'Grout width', min: 0.6, max: 4, step: 0.1, fmt: mm1 },
  wander: { key: 'wave', label: 'Wander', min: 0, max: 1.5, step: 0.05, fmt: (v) => v.toFixed(2) },
  ripples: { key: 'rows', label: 'Ripples up the side', min: 8, max: 60, step: 1, fmt: (v) => `${v}` },
  drift: { key: 'wave', label: 'Drift', min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
  ringGap: { key: 'width', label: 'Ring spacing', min: 2.5, max: 12, step: 0.1, fmt: mm1 },
  fanRings: { key: 'rows', label: 'Rings per wave', min: 2, max: 7, step: 1, fmt: (v) => `${v}` },
  swirl: { label: 'Swirl around the piece', min: -360, max: 360, step: 5, fmt: (v) => (v ? `${v > 0 ? '+' : ''}${v}°` : 'none') },
  round: { label: 'Fillet', min: 0, max: 3, step: 0.1, fmt: mm1 },
  wave: { label: 'Wave', min: 0, max: 1.2, step: 0.01, fmt: (v) => v.toFixed(2) },
  waveFreq: { label: 'Waves up the side', min: 0.5, max: 6, step: 0.5, fmt: (v) => `${v}` },
  gradient: { label: 'Gradient, bottom to top', min: -0.8, max: 0.8, step: 0.05, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` },
  bulge: { label: 'Rounded strips', min: 0, max: 1.6, step: 0.1, fmt: (v) => (v ? mm1(v) : 'flat') },
  bandBottom: { label: 'Plain band, bottom', min: 0, max: 40, step: 0.5, fmt: mm },
  bandTop: { label: 'Plain band, top', min: 0, max: 40, step: 0.5, fmt: mm },
};
// On/off controls: key in the surface params and the label shown
const SURF_SWITCHES = {
  invert: ['invert', 'Invert relief'],
  arch: ['arch', 'Pointed tops (no bridging)'],
  teardrop: ['arch', 'Teardrop tops (no bridging)'],
  split: ['alt', 'Split every other diamond only'],
  stagger: ['alt', 'Stagger the rows'],
  brick: ['alt', 'Brick bond'],
};

const OBJECT_DEFAULTS = {
  planter: { form: { height: 140, diameter: 150, base: 0.88, top: 1, belly: 0.5, fullness: 0.3, lip: 0, lipH: 12, inset: 1.5, wall: 3, floor: 3 }, extras: { drain: 8 } },
  box: { form: { height: 100, diameter: 180, base: 0.86, top: 0.9, belly: 0.5, fullness: 0.75, lip: 0, lipH: 12, inset: 1.2, wall: 3, floor: 3 }, extras: { lid: true } },
  pendant: { form: { height: 190, diameter: 250, base: 0.42, top: 0.93, belly: 0.6, fullness: 0.3, lip: 0, lipH: 12, inset: 0, wall: 3, floor: 3 }, extras: {} },
  lamp: { form: { height: 210, diameter: 140, base: 1, top: 1.02, belly: 0.5, fullness: 0.12, lip: 0, lipH: 12, inset: 0, wall: 3, floor: 3 }, extras: { socket: 40, baseH: 55, cord: true } },
  // a globe glows best with a thinner wall: 4 lines, about 1.8 mm
  globe: { form: { height: 220, diameter: 220, base: 1, top: 1, belly: 0.5, fullness: 0, lip: 0, lipH: 12, inset: 0, wall: 1.8, floor: 3, section: 'round', twist: 0 }, extras: { socket: 40, baseH: 45, cord: true, opening: 92, globeTop: 'round', globeUnder: 'round' }, surface: { pattern: 'smooth', bandBottom: 0, bandTop: 0, swirl: 0 }, finish: { color: '#eeebe4', material: 'translucent' } },
  bowl: { form: { height: 80, diameter: 240, base: 0.62, top: 0.97, belly: 0.7, fullness: 0.45, lip: 0, lipH: 12, inset: 1.2, wall: 3, floor: 3 }, extras: {} },
  vase: { form: { height: 180, diameter: 110, base: 0.85, top: 0.8, belly: 0.4, fullness: 0.5, lip: 4, lipH: 20, inset: 1.2, wall: 3, floor: 3 }, extras: {} },
  cup: { form: { height: 105, diameter: 90, base: 0.93, top: 1.03, belly: 0.5, fullness: 0.2, lip: 0, lipH: 12, inset: 1, wall: 3, floor: 3 }, extras: {} },
  hanging: { form: { height: 120, diameter: 160, base: 0.62, top: 0.96, belly: 0.56, fullness: 0.6, lip: 0, lipH: 12, inset: 1.2, wall: 3, floor: 3 }, extras: { drain: 0, hangers: 3 } },
  wall: { form: { height: 150, diameter: 150, base: 0.8, top: 1, belly: 0.5, fullness: 0.3, lip: 0, lipH: 12, inset: 0, wall: 3, floor: 3, twist: 0 }, extras: { drain: 0, back: 0.3 } },
  orchid: { form: { height: 140, diameter: 130, base: 0.8, top: 1, belly: 0.5, fullness: 0.1, lip: 0, lipH: 12, inset: 1.2, wall: 3, floor: 3 }, extras: { drain: 14, base: 'saucer' } },
  lantern: { form: { height: 120, diameter: 95, base: 1, top: 0.92, belly: 0.5, fullness: 0.35, lip: 0, lipH: 12, inset: 0.8, wall: 3, floor: 3 }, extras: {} },
  tray: { form: { height: 32, diameter: 180, base: 0.84, top: 1, belly: 0.6, fullness: 0.25, lip: 0, lipH: 12, inset: 1, wall: 3, floor: 3 }, extras: {}, surface: { bandBottom: 0, bandTop: 2 } },
  candle: { form: { height: 90, diameter: 90, base: 0.9, top: 0.72, belly: 0.4, fullness: 0.6, lip: 0, lipH: 12, inset: 1, wall: 3, floor: 3 }, extras: { candle: 'tealight' }, surface: { bandBottom: 0, bandTop: 4 } },
  ring: { form: { height: 36, diameter: 52, base: 1, top: 1, belly: 0.5, fullness: 0.15, lip: 0, lipH: 12, inset: 0, wall: 3, floor: 3 }, extras: {}, surface: { bandBottom: 2, bandTop: 2 } },
};

const FILAMENTS = [
  ['Charcoal', '#22211f'], ['Graphite', '#3a3b3d'], ['Ash', '#8d8f8e'], ['Fog', '#c9cbc8'], ['Bone', '#eeebe4'],
  ['Sand', '#c9b8a3'], ['Oat', '#b9a58a'], ['Walnut', '#5b4a3a'], ['Clay', '#a34f31'], ['Blush', '#d9a79a'],
  ['Mustard', '#d8a647'], ['Sage', '#6f7d6b'], ['Moss', '#4b5a3e'], ['Ice', '#b7c7cf'], ['Navy', '#26324a'],
];
const PRINTERS = [
  { id: 'bambu', label: 'Bambu Lab X1, P1 or A1 · 256 mm', bed: [256, 256, 256] },
  { id: 'a1mini', label: 'Bambu Lab A1 mini · 180 mm', bed: [180, 180, 180] },
  { id: 'mk4', label: 'Prusa MK4 · 250 × 210 × 220 mm', bed: [250, 210, 220] },
  { id: 'core1', label: 'Prusa Core One · 250 × 220 × 270 mm', bed: [250, 220, 270] },
  { id: 'ender', label: 'Creality Ender-3 V3 or K1 · 220 mm', bed: [220, 220, 250] },
  { id: 'big', label: 'Large format · 350 mm', bed: [350, 350, 350] },
];
const BACKDROPS = [['Stone', '#e3e2dd'], ['Plaster', '#ece6dc'], ['Sage', '#cfd5c9'], ['Mist', '#d5dbe0'], ['Night', '#1d1e1c']];
const MATERIALS = {
  matte: { label: 'Matte', roughness: 0.82, metalness: 0, sheen: 0.35, clearcoat: 0, env: 0.75 },
  satin: { label: 'Satin', roughness: 0.5, metalness: 0, sheen: 0.2, clearcoat: 0.25, env: 0.95 },
  silk: { label: 'Silk', roughness: 0.3, metalness: 0.55, sheen: 0.6, clearcoat: 0.15, env: 1.15 },
  // translucent PLA or PETG: glassy, and it lets a lamp's light through its wall
  translucent: { label: 'Translucent', roughness: 0.28, metalness: 0, sheen: 0.1, clearcoat: 0.5, env: 1.05, glow: 1 },
};
const ICONS = {
  planter: '<path d="M9 14h22l-2.5 17a3 3 0 01-3 2.6h-11a3 3 0 01-3-2.6z"/><path d="M8 14h24"/><path d="M20 14c0-5 3-8 7-9M20 14c-1-4-4-6-8-6"/>',
  box: '<path d="M8 15h24l-1.5 15.5a3 3 0 01-3 2.5H12.5a3 3 0 01-3-2.5z"/><path d="M7 15c0-2 1-3 3-3h20c2 0 3 1 3 3z"/><path d="M18 12c0-2 1-3 2-3s2 1 2 3"/><path d="M12 19l4 10M18 19l4 10M24 19l4 10M28 19l-4 10M22 19l-4 10M16 19l-4 10" stroke-width="1" opacity=".6"/>',
  lamp: '<path d="M13 5h14l3 21H10z"/><path d="M11 26h18v8H11z"/><path d="M15 9l11 13M25 9L14 22M12 16l6 7M28 16l-6 7" stroke-width="1" opacity=".6"/>',
  globe: '<circle cx="20" cy="16" r="11.5"/><path d="M16 27.2V30h8v-2.8"/><path d="M12.5 30h15v4h-15z"/><path d="M13.6 12.6a7.4 7.4 0 015-4.6" stroke-width="1" opacity=".6"/>',
  pendant: '<path d="M20 3v9"/><path d="M15 12h10l7 14c1 3-1 5-4 5H12c-3 0-5-2-4-5z"/><path d="M15 16l12 15M25 16L13 31M11 22l18 9M29 22l-18 9" stroke-width="1" opacity=".6"/>',
  bowl: '<path d="M5 18h30c0 7-6 13-15 13S5 25 5 18z"/><path d="M14 31h12"/><path d="M8 22l8 8M14 19l11 11M20 18l10 10M26 18l7 7M32 21l-9 9M26 19l-11 11M20 18L10 28" stroke-width="1" opacity=".6"/>',
  vase: '<path d="M15 4h10M16 4c0 4-6 7-6 15 0 7 3 13 5 15h10c2-2 5-8 5-15 0-8-6-11-6-15"/><path d="M16 15v18M20 13v21M24 15v18" stroke-width="1" opacity=".6"/>',
  hanging: '<path d="M20 3v4"/><path d="M20 7L9.5 18M20 7l10.5 11M20 7v11" stroke-width="1.1"/><path d="M8 18h24c0 8-5 15-12 15S8 26 8 18z"/>',
  wall: '<path d="M33 4v32"/><path d="M33 9H10c0 12 5 21 14 22h9"/><path d="M14 9c0-3 3-5 6-5M20 9c1-3 4-4 7-3" stroke-width="1.1"/>',
  orchid: '<path d="M10 17h20l-2 15a2.6 2.6 0 01-2.6 2.2H14.6A2.6 2.6 0 0112 32z"/><path d="M15 21v9M20 21v10M25 21v9" stroke-width="1"/><path d="M20 17c0-6 2-10 7-12"/><circle cx="28" cy="5.5" r="2.2"/><circle cx="24" cy="9.6" r="1.7"/>',
  lantern: '<path d="M12 9h16v25H12z"/><path d="M14 9l2-4h8l2 4"/><path d="M20 29c-2.2-1.8-2.2-4.2 0-7 2.2 2.8 2.2 5.2 0 7z"/><path d="M15 14l2 2M23 14l2 2M15 18l2 2M23 18l2 2" stroke-width="1"/>',
  tray: '<path d="M4 21h32l-2.6 6a3 3 0 01-2.8 1.8H9.4A3 3 0 016.6 27z"/><circle cx="15" cy="17.8" r="2.4"/><path d="M21.5 18.4h8M27 18.4v2" stroke-width="1.2"/>',
  candle: '<path d="M11 17h18c0 9-3 13-3 17H14c0-4-3-8-3-17z"/><path d="M15 17v-4h10v4"/><path d="M20 13c-1.8-1.6-1.8-3.4 0-6 1.8 2.6 1.8 4.4 0 6z"/>',
  ring: '<ellipse cx="20" cy="13" rx="11" ry="4"/><path d="M9 13v13c0 2.2 4.9 4 11 4s11-1.8 11-4V13"/><path d="M12 19l2.7 4 2.7-4 2.6 4 2.7-4 2.6 4 2.7-4" stroke-width="1" opacity=".6"/>',
  cup: '<path d="M10 15h20l-1.6 16.2a3 3 0 01-3 2.8h-10.8a3 3 0 01-3-2.8z"/><path d="M15 15l-3-11 3.2-.8 3 11.8M23 15l3.5-9.5-2.8-1-3.9 10.5"/><path d="M13 20l3 4 3-4 3 4 3-4 3 4" stroke-width="1" opacity=".6"/>',
};

// ============================================================ names
// Short product names, themed by object and surface, so every new piece arrives with one.
const NAMES = {
  general: ['Alba', 'Alder', 'Amber', 'Arden', 'Aria', 'Aster', 'Basalt', 'Birch', 'Bramble', 'Brisa', 'Cedar', 'Cinder', 'Clover', 'Dahlia', 'Delta', 'Drift', 'Echo', 'Elm', 'Fable', 'Fjord', 'Flint', 'Glen', 'Haven', 'Hazel', 'Heath', 'Isla', 'Ivy', 'Jade', 'Juniper', 'Kiln', 'Lark', 'Linden', 'Loam', 'Luna', 'Maple', 'Marl', 'Mesa', 'Mira', 'Nova', 'Oak', 'Ochre', 'Onyx', 'Opal', 'Orla', 'Pebble', 'Pine', 'Quartz', 'Rowan', 'Saffron', 'Shale', 'Sienna', 'Slate', 'Sorrel', 'Spruce', 'Thistle', 'Umber', 'Vale', 'Wren', 'Willow', 'Yarrow', 'Zephyr'],
  planter: ['Fern', 'Moss', 'Grove', 'Canopy', 'Bracken', 'Meadow', 'Terra', 'Verde', 'Sprig', 'Thyme', 'Laurel', 'Olive', 'Sage', 'Frond'],
  vase: ['Iris', 'Calla', 'Lily', 'Stem', 'Petal', 'Posy', 'Orchid', 'Peony', 'Freesia', 'Tulip', 'Aster', 'Sprig'],
  bowl: ['Basin', 'Cove', 'Tide', 'Lagoon', 'Harbor', 'Crater', 'Atoll', 'Eddy', 'Shoal', 'Inlet', 'Pool', 'Bay'],
  box: ['Cache', 'Nest', 'Coffer', 'Trove', 'Keep', 'Burrow', 'Locket', 'Vault', 'Hearth', 'Ark', 'Den', 'Hollow'],
  cup: ['Quill', 'Nib', 'Spool', 'Thimble', 'Bobbin', 'Tally', 'Cairn', 'Pocket', 'Nook', 'Inkwell', 'Easel', 'Sketch'],
  pendant: ['Lumen', 'Halo', 'Aurora', 'Corona', 'Nimbus', 'Vesper', 'Lucia', 'Ember', 'Beacon', 'Solstice', 'Comet', 'Lyra', 'Stella', 'Orion'],
  lamp: ['Strala', 'Glow', 'Lantern', 'Hearth', 'Candela', 'Lux', 'Dusk', 'Ember', 'Firefly', 'Nocturne'],
  hanging: ['Swing', 'Hammock', 'Orbit', 'Cradle', 'Trailing', 'Ivy', 'Wisteria', 'Pothos', 'Tendril', 'Liana'],
  wall: ['Ledge', 'Niche', 'Alcove', 'Perch', 'Balcony', 'Terrace', 'Espalier', 'Loggia', 'Sill', 'Corbel'],
  orchid: ['Vanda', 'Cattleya', 'Aerial', 'Epiphyte', 'Breeze', 'Orchis', 'Oncidium', 'Miltonia'],
  lantern: ['Glimmer', 'Votive', 'Vigil', 'Flicker', 'Luminaria', 'Wick', 'Taper', 'Lucerna', 'Fanal'],
  tray: ['Valet', 'Catchall', 'Salver', 'Platter', 'Tablet', 'Plinth', 'Trinket', 'Coin'],
  ring: ['Loop', 'Band', 'Bangle', 'Cuff', 'Hoop', 'Torus', 'Ringlet', 'Coil'],
  candle: ['Vesper', 'Altar', 'Plinth', 'Hearth', 'Taper', 'Chapel', 'Lumen', 'Matins', 'Beacon', 'Ember'],
  lattice: ['Trellis', 'Lattice', 'Arbor'], prism: ['Prisma', 'Facet', 'Spectra'], ogee: ['Riad', 'Medina', 'Souk', 'Kasbah'],
  arches: ['Nave', 'Cloister', 'Vault', 'Abbey'], voronoi: ['Cellula', 'Coral', 'Sponge'], honeycomb: ['Hive', 'Comb', 'Apis'],
  dots: ['Pip', 'Polka', 'Dew'], wicker: ['Rattan', 'Cane', 'Wicker'], ribs: ['Pleat', 'Flute', 'Fold'], chevron: ['Zigzag', 'Herring', 'Arrow'],
  reeds: ['Bamboo', 'Cane', 'Reed'], waves: ['Ripple', 'Swell', 'Current'], topo: ['Contour', 'Strata', 'Ridge'], knit: ['Purl', 'Stitch', 'Cable'],
  weave: ['Loom', 'Warp', 'Basket'], petals: ['Scale', 'Shingle', 'Petal'], quilt: ['Tuft', 'Pillow', 'Quilt'], facets: ['Gem', 'Crystal', 'Shard'],
  tiles: ['Tessera', 'Mosaic', 'Zellige'], perforated: ['Sieve', 'Pore', 'Glimmer'], knurl: ['Pinecone', 'Knurl', 'Rasp'],
  cubes: ['Isomer', 'Cubist', 'Escher'], gouge: ['Chisel', 'Adze', 'Whittle'], seigaiha: ['Seigaiha', 'Nami', 'Kai'], herringbone: ['Parquet', 'Oak', 'Chevron'], hammered: ['Anvil', 'Forge', 'Pewter', 'Tinsmith'], carved: ['Chisel', 'Gouge', 'Burl', 'Comb'],
  rings: ['Ondine', 'Rain', 'Puddle', 'Droplet'], dunes: ['Sirocco', 'Erg', 'Sahel', 'Drift'], bark: ['Cork', 'Timber', 'Bough', 'Cedar'],
  blocks: ['Ashlar', 'Quarry', 'Masonry', 'Bastion'], spikes: ['Agave', 'Thorn', 'Spire', 'Bristle'], shards: ['Quartz', 'Geode', 'Flint', 'Obsidian'],
  fins: ['Turbine', 'Radiant', 'Vane', 'Gill'], hobnail: ['Hobnail', 'Bead', 'Pearl', 'Cobble'],
};
function makeName(d) {
  const roll = Math.random();
  const pool = roll < 0.4 ? NAMES[d.object] : roll < 0.65 ? NAMES[d.surface.pattern] : NAMES.general;
  const list = (pool && pool.length ? pool : NAMES.general).filter((n) => n !== d.name);
  return list[Math.floor(Math.random() * list.length)];
}
function rename() {
  state.design.name = makeName(state.design);
  $('#design-name').value = state.design.name;
  fitName();
  syncTitle();
}

// ============================================================ helpers
const $ = (s) => document.querySelector(s);
const SVG_NS = 'http://www.w3.org/2000/svg';
function h(tag, attrs = {}, ...kids) {
  const el = tag === 'svg' ? document.createElementNS(SVG_NS, 'svg') : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('aria-') && typeof v === 'boolean') { el.setAttribute(k, String(v)); continue; }
    if (v === false || v == null) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const slug = (s) => (s || 'design').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
let toastTimer = 0;
// The desktop app (Electron) exposes window.weftDesktop; in a browser it is undefined.
const desktop = window.weftDesktop || null;
// Which design this page is: 'v2' (Weft 2.0) or 'classic' (the 1.x layout, kept so it can be switched back).
const UI = document.querySelector('meta[name="weft-ui"]')?.content || 'classic';
function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(msg);
  if (action) t.append(h('button', { class: 'toast-act', type: 'button', onclick: () => { action.run(); t.classList.remove('show'); } }, action.label));
  t.classList.toggle('has-act', !!action);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 6000 : 2600);
}
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

// ============================================================ state
const state = {
  design: clone(COLLECTION[0]),
  view: 'studio',
  cut: false,
  explode: false,
  light: { on: false, bright: 1, warm: 'warm', bulb: true, ...store.get('weft.light', {}) },
  xray: false,
  multicolor: store.get('weft.multicolor', false),
  dims: store.get('weft.dims', false),
  ref: !!store.get('weft.ref', false),
  refKind: store.get('weft.refKind', 'hand'),
  handles: store.get('weft.handles', true),
  spin: true,
  tab: 'object',
  printer: store.get('weft.printer', 'bambu'),
  quality: 1,
  backdrop: '#e3e2dd',
  caption: true,
  aspect: '4:3',
  result: null,
  version: 0,
};
const history = { stack: [JSON.stringify(state.design)], at: 0 };
// the Panels compartment keeps its own history; undo and the top bar follow whichever is in front
let panels = null;
const panelsFocused = () => !!panels && (UI === 'v2' ? document.body.dataset.view === 'panels' : panels.active);
function commitHistory() {
  const snap = JSON.stringify(state.design);
  if (snap === history.stack[history.at]) return;
  history.stack = history.stack.slice(0, history.at + 1);
  history.stack.push(snap);
  if (history.stack.length > 80) history.stack.shift();
  history.at = history.stack.length - 1;
  syncUndo();
}
function syncUndo() {
  if (panelsFocused()) { $('#undo').disabled = !panels.canUndo(); $('#redo').disabled = !panels.canRedo(); return; }
  $('#undo').disabled = history.at <= 0;
  $('#redo').disabled = history.at >= history.stack.length - 1;
}
function travel(dir) {
  if (panelsFocused()) { if (dir < 0) panels.undo(); else panels.redo(); return; }
  const at = history.at + dir;
  if (at < 0 || at >= history.stack.length) return;
  history.at = at;
  state.design = JSON.parse(history.stack[at]);
  syncUndo();
  renderAll();
  rebuild(true);
}

// ============================================================ multicolour
// Colour bands split the piece at layer heights: every layer is one colour, so there is almost no purge.
const MULTI_LAYOUTS = [
  ['split', 'Two-tone'], ['rim', 'Accent rim'], ['base', 'Accent base'], ['tri', 'Three bands'], ['stripes', 'Stripes'], ['gradient', 'Four bands'],
];
function bandsFor(d) {
  if (!state.multicolor) return null;
  const M = d.finish.multi || {}, H = d.form.height;
  switch (M.layout) {
    case 'rim': return { cuts: [H - Math.max(6, H * 0.12)], slots: [0, 1] };
    case 'base': return { cuts: [Math.max(d.form.floor + 7, H * 0.16)], slots: [1, 0] };
    case 'tri': return { cuts: [H / 3, (2 * H) / 3], slots: [0, 1, 2] };
    case 'stripes': {
      const n = clamp(Math.round(M.stripes || 5), 3, 11);
      return { cuts: Array.from({ length: n - 1 }, (_, k) => (H * (k + 1)) / n), slots: Array.from({ length: n }, (_, k) => k % 2) };
    }
    case 'gradient': return { cuts: [H * 0.25, H * 0.5, H * 0.75], slots: [0, 1, 2, 3] };
    default: return { cuts: [H * clamp(M.split ?? 0.42, 0.1, 0.9)], slots: [0, 1] };
  }
}
function ensureMulti(d) {
  d.finish.multi = { ...clone(BASE.finish.multi), ...(d.finish.multi || {}) };
  return d.finish.multi;
}
// Band colours that repeat the main colour (or each other) would print as one block, so swap them for accents.
const ACCENTS = ['#a34f31', '#d8a647', '#6f7d6b', '#26324a', '#22211f', '#eeebe4', '#d9a79a', '#4b5a3e'];
function distinctSlots(d) {
  const M = ensureMulti(d), used = [d.finish.color.toLowerCase()];
  M.slots = M.slots.map((c) => {
    const k = String(c).toLowerCase();
    const v = used.includes(k) ? ACCENTS.find((a) => !used.includes(a) && !M.slots.some((x) => String(x).toLowerCase() === a)) || ACCENTS.find((a) => !used.includes(a)) : k;
    used.push(v);
    return v;
  });
}
const slotsUsed = (b) => (b ? Math.max(...b.slots) + 1 : 1);
function slotColor(d, k) { return k === 0 ? d.finish.color : (d.finish.multi?.slots || [])[k - 1] || d.finish.color; }
const engineParams = (d) => ({ ...d, multicolor: bandsFor(d) });

// ============================================================ engine client
class EngineClient {
  constructor() {
    this.local = false; this.seq = 0; this.cb = new Map();
    this.ready = new Promise((res) => { this._ready = res; });
    try {
      this.w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      this.w.onmessage = (e) => {
        const m = e.data;
        if (m.ready) { this._ready(true); return; }
        const c = this.cb.get(m.id);
        if (!c) return;
        this.cb.delete(m.id);
        if (m.error) c.reject(new Error(m.error)); else c.resolve(m.res);
      };
      this.w.onerror = (e) => { if (e.preventDefault) e.preventDefault(); this.toLocal(); };
      setTimeout(() => this._ready(false), 6000);
    } catch { this.local = true; this._ready(false); }
  }
  toLocal() {
    if (this.local) return;
    this.local = true;
    this._ready(false);
    try { this.w.terminate(); } catch { /* already gone */ }
    for (const [id, c] of this.cb) { this.cb.delete(id); this.runLocal(c.params, c.q).then(c.resolve, c.reject); }
  }
  async runLocal(params, q) { await new Promise((r) => setTimeout(r, 0)); return generate(params, q); }
  async run(params, q) {
    if (!this.local && !(await this.ready)) this.toLocal();
    if (this.local) return this.runLocal(params, q);
    const id = ++this.seq;
    return new Promise((resolve, reject) => { this.cb.set(id, { resolve, reject, params, q }); this.w.postMessage({ id, params, quality: q }); });
  }
}
const engine = new EngineClient();

// ============================================================ 3D stage
const SCALE = 0.01; // one scene unit = 100 mm
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.setClearColor(0x000000, 0);

function makeStage(r) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(r);
  scene.environment = pmrem.fromScene(new RoomEnvironment(r), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.02, 200);
  camera.position.set(3.2, 2.2, 4.2);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8f8d86, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  scene.add(key, key.target);
  const shadowMat = new THREE.ShadowMaterial({ opacity: 0.2 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3b3833, roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 64), shadowMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const spin = new THREE.Group();
  scene.add(spin);
  return { scene, camera, hemi, key, ground, shadowMat, floorMat, spin, content: null, extras: [] };
}
const stage = makeStage(renderer);
const controls = new OrbitControls(stage.camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.4;
controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI * 0.495;
const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
let needsRender = true;
const invalidate = () => { needsRender = true; };
controls.addEventListener('change', invalidate);
controls.addEventListener('start', () => { $('#hint').style.opacity = 0; if (state.spin) setSpin(false); });

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  if (!r.width || !r.height) return; // hidden behind another view: keep the last size
  renderer.setSize(r.width, r.height, false);
  stage.camera.aspect = r.width / Math.max(1, r.height);
  stage.camera.updateProjectionMatrix();
  invalidate();
}
new ResizeObserver(resize).observe(canvas.parentElement);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.spin && state.view === 'studio') { stage.spin.rotation.y += dt * 0.22; needsRender = true; }
  if (controls.update()) needsRender = true;
  if (needsRender) { updateHandles(); updateDims(); renderer.render(stage.scene, stage.camera); needsRender = false; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// ---------- display groups
function geometryFor(p) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(p.normal, 3));
  g.setIndex(new THREE.BufferAttribute(p.index, 1));
  g.computeBoundingSphere();
  return g;
}
function partColor(d, idx) { return [d.finish.color, d.finish.color2, d.finish.color3][idx] || d.finish.color; }
function materialFor(d, hex, opts = {}) {
  const M = MATERIALS[d.finish.material] || MATERIALS.matte;
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex), roughness: M.roughness, metalness: M.metalness, sheen: M.sheen, sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0xffffff), clearcoat: M.clearcoat, clearcoatRoughness: 0.5,
    envMapIntensity: (opts.glow ? 0.12 : 1) * M.env, side: opts.cut || opts.xray ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (opts.xray) seeThrough(m);
  if (opts.cut) { m.clippingPlanes = [clipPlane]; m.clipShadows = true; }
  return m;
}
function seeThrough(m) {
  m.transparent = true; m.opacity = 0.28; m.depthWrite = false;
}
function printMaterial(p, opts = {}) {
  const n = p.position.length / 3;
  const col = new Float32Array(n * 3);
  const base = new THREE.Color(0xbfc0bb), amber = new THREE.Color(0xe8a41c);
  for (let v = 0; v < n; v++) { col[v * 3] = base.r; col[v * 3 + 1] = base.g; col[v * 3 + 2] = base.b; }
  const I = p.index, F = p.overFace;
  for (let t = 0; t < F.length; t++) {
    if (F[t] !== 2) continue;
    for (let k = 0; k < 3; k++) { const v = I[t * 3 + k]; col[v * 3] = amber.r; col[v * 3 + 1] = amber.g; col[v * 3 + 2] = amber.b; }
  }
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, side: opts.cut || opts.xray ? THREE.DoubleSide : THREE.FrontSide });
  if (opts.xray) seeThrough(m);
  if (opts.cut) m.clippingPlanes = [clipPlane];
  return { m, col };
}

// Overhangs past 46° get diagonal pink and yellow stripes: one of the two always contrasts with the filament.
function hazardMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: `
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      #include <common>
      #include <clipping_planes_pars_fragment>
      varying vec3 vW;
      void main() {
        #include <clipping_planes_fragment>
        float s = fract((vW.x + vW.y * 1.4 + vW.z) * 15.0);
        gl_FragColor = vec4(s < 0.5 ? vec3(1.0, 0.13, 0.52) : vec3(1.0, 0.86, 0.05), 1.0);
      }`,
    side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
    clipping: !!opts.cut,
    clippingPlanes: opts.cut ? [clipPlane] : null,
  });
}
function hazardOverlay(geo, p, opts) {
  const F = p.overFace;
  let n = 0;
  for (let t = 0; t < F.length; t++) if (F[t] === 1) n++;
  if (!n) return null;
  const idx = new Uint32Array(n * 3), I = p.index;
  let k = 0;
  for (let t = 0; t < F.length; t++) if (F[t] === 1) { idx[k++] = I[t * 3]; idx[k++] = I[t * 3 + 1]; idx[k++] = I[t * 3 + 2]; }
  // the stripes sit a hair off the surface, along its normal, rather than pulled towards the camera: that
  // way stripes on an inside face (a closed globe's ceiling) never show through the wall at its outline
  const P = geo.getAttribute('position').array, N = geo.getAttribute('normal')?.array, Q = new Float32Array(P.length);
  for (let v = 0; v < P.length; v++) Q[v] = P[v] + (N ? N[v] * 0.06 : 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Q, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = hazardMaterial(opts);
  if (N) { m.polygonOffsetFactor = 0; m.polygonOffsetUnits = -1; }
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 3;
  mesh.userData.noFrame = true;
  mesh.userData.hazard = true;
  return mesh;
}

// a faceted wall planter is a polyhedron with no silhouette, outline or pattern
const isFacet = (d) => d.object === 'wall' && d.extras.wallStyle === 'facet';
// lamps and lanterns light up, and so does a candle holder's candle
const hasLight = (obj) => !!(OBJECTS[obj].lamp || OBJECTS[obj].light);
const WARMTH = { candle: 0xff9f4a, warm: 0xffc07a, neutral: 0xffe2c2, daylight: 0xfff4ea };
// while a handle is dragged the lamp's hanging height stays put, so the crown does not jump
let hangFreeze = null;
const pendantHang = (d) => (d.object === 'pendant' ? hangFreeze ?? d.form.height * 0.55 + 60 : 0);

function bedMesh(bed) {
  const [bx, by] = bed;
  const c = document.createElement('canvas');
  const px = 4;
  c.width = Math.round(bx * px); c.height = Math.round(by * px);
  const g = c.getContext('2d');
  g.fillStyle = '#2b2c2a'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
  for (let x = 0; x <= bx; x += 10) { g.beginPath(); g.moveTo(x * px, 0); g.lineTo(x * px, c.height); g.stroke(); }
  for (let y = 0; y <= by; y += 10) { g.beginPath(); g.moveTo(0, y * px); g.lineTo(c.width, y * px); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,0.2)';
  for (let x = 0; x <= bx; x += 50) { g.beginPath(); g.moveTo(x * px, 0); g.lineTo(x * px, c.height); g.stroke(); }
  for (let y = 0; y <= by; y += 50) { g.beginPath(); g.moveTo(0, y * px); g.lineTo(c.width, y * px); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(bx, by), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  m.position.z = -0.6;
  m.receiveShadow = true;
  return m;
}

// Builds a group in engine coordinates (mm, Z up). opts: { mode, explode, cut, glow, xray, printer, light }
function buildDisplay(res, d, opts) {
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  root.scale.setScalar(SCALE);
  const H = d.form.height;
  const lift = opts.explode ? Math.max(40, H * 0.35) : 0;
  const meshes = [];
  if (opts.mode === 'print') {
    const gap = 14;
    const widths = res.parts.map((p) => p.stats.bbox[3] - p.stats.bbox[0]);
    let x = -(widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1)) / 2;
    res.parts.forEach((p, i) => {
      const { m, col } = printMaterial(p, opts);
      const geo = geometryFor(p);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, m);
      const b = p.stats.bbox;
      mesh.position.set(x - b[0], -(b[1] + b[4]) / 2, -b[2]);
      x += widths[i] + gap;
      mesh.castShadow = !opts.xray; mesh.receiveShadow = true;
      const over = hazardOverlay(geo, p, opts);
      if (over) mesh.add(over);
      root.add(mesh); meshes.push(mesh);
    });
    const printer = PRINTERS.find((q) => q.id === opts.printer) || PRINTERS[0];
    root.add(bedMesh(printer.bed));
    const [bx, by, bz] = printer.bed;
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bx, by, bz)), new THREE.LineBasicMaterial({ color: 0x8d8f8a, transparent: true, opacity: 0.35 }));
    box.position.z = bz / 2;
    root.add(box);
    return { root, meshes };
  }
  const hang = pendantHang(d);
  for (const p of res.parts) {
    const geo = geometryFor(p);
    let mat;
    if (p.regions && opts.multicolor !== false) {
      mat = p.regions.map((rg) => materialFor(d, slotColor(d, rg.slot), opts));
      p.regions.forEach((rg, i) => geo.addGroup(rg.first * 3, rg.count * 3, i));
    } else if (opts.multicolor !== false && p.key === res.info.mainKey && res.info.colorChanges?.length && state.multicolor) {
      // spiral vase mode: one body, coloured by height to preview the filament changes
      const n = p.position.length / 3, col = new Float32Array(n * 3), bands = bandsFor(d), cuts = res.info.colorChanges;
      const cs = bands.slots.map((k) => new THREE.Color(slotColor(d, k)));
      for (let v = 0; v < n; v++) {
        let b = 0; while (b < cuts.length && p.position[v * 3 + 2] > cuts[b]) b++;
        const c = cs[Math.min(b, cs.length - 1)]; col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      mat = materialFor(d, '#ffffff', opts); mat.vertexColors = true;
    } else mat = materialFor(d, partColor(d, p.place.color), opts);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !opts.xray; mesh.receiveShadow = true;
    if (p.place.flip) { mesh.rotation.x = Math.PI; mesh.position.z = H + hang; }
    else if (p.place.flipZ) { mesh.rotation.x = Math.PI; mesh.position.z = p.place.z + (p.place.lidLift ? lift : 0); }
    else if (p.place.rot) {
      // flat-printed parts (the stand) stand up in place
      mesh.rotation.order = 'ZYX'; mesh.rotation.set(...p.place.rot);
      mesh.position.set(...(p.place.pos || [0, 0, 0]));
    } else mesh.position.z = p.place.z || 0;
    if (opts.overhangs !== false) { const over = hazardOverlay(geo, p, opts); if (over) mesh.add(over); }
    root.add(mesh); meshes.push(mesh);
  }
  const L = opts.light || { on: false, bright: 1, warm: 'warm', bulb: true };
  const tint = WARMTH[L.warm] || WARMTH.warm;
  const glowMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.55) });
  let bulb = null, lightZ = 0, power = 0;
  if (d.object === 'pendant') {
    const top = H + hang;
    const cordMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1b, roughness: 0.6 });
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3000, 10), cordMat);
    cord.rotation.x = Math.PI / 2; cord.position.z = top + 1500;
    const sockR = Math.max(10, d.extras.socket / 2 - 1.5);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(sockR, sockR, 62, 32), cordMat);
    sock.rotation.x = Math.PI / 2; sock.position.z = top - 20;
    sock.castShadow = true;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(sockR + 4, sockR + 4, 8, 32), cordMat);
    cup.rotation.x = Math.PI / 2; cup.position.z = top + 4;
    bulb = new THREE.Mesh(new THREE.SphereGeometry(30, 40, 24), opts.glow ? glowMat() : new THREE.MeshPhysicalMaterial({ color: 0xf3f1ec, roughness: 0.25, transparent: true, opacity: 0.85 }));
    bulb.position.z = top - 51 - 30;
    bulb.scale.set(1, 1, 1.15);
    for (const o of [cord, sock, cup]) o.userData.noFrame = true;
    root.add(cord, sock, cup);
    lightZ = top - 81; power = 30;
  }
  if (d.object === 'lamp' || d.object === 'globe') {
    // table lamp or globe: the socket stands in the base's centre hole, the bulb above it inside the shade
    const plate = d.extras.baseH ?? (d.object === 'globe' ? 45 : 55);
    const sockMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1b, roughness: 0.6 });
    const sockR = Math.max(10, d.extras.socket / 2 - 1.5);
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(sockR, sockR, 56, 32), sockMat);
    sock.rotation.x = Math.PI / 2; sock.position.z = plate + 6;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(sockR + 5, sockR + 5, 5, 32), sockMat);
    ring.rotation.x = Math.PI / 2; ring.position.z = plate + 2.5;
    for (const o of [sock, ring]) { o.castShadow = true; o.userData.noFrame = true; }
    root.add(sock, ring);
    bulb = new THREE.Mesh(new THREE.SphereGeometry(30, 40, 24), opts.glow ? glowMat() : new THREE.MeshPhysicalMaterial({ color: 0xf3f1ec, roughness: 0.25, transparent: true, opacity: 0.85 }));
    bulb.position.z = plate + 34 + 32;
    bulb.scale.set(1, 1, 1.15);
    lightZ = plate + 66; power = 30;
  }
  if (d.object === 'lantern') {
    // an LED tealight on the floor: a white cup with a small flame
    const floorZ = d.form.floor + (res.info.lift || 0);
    const cupMat = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.5 });
    const tea = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 15, 40), cupMat);
    tea.rotation.x = Math.PI / 2; tea.position.z = floorZ + 7.5;
    tea.castShadow = true; tea.userData.noFrame = true;
    root.add(tea);
    bulb = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 14), opts.glow ? glowMat() : new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.4 }));
    bulb.scale.set(1, 1, 1.9);
    bulb.position.z = floorZ + 22;
    lightZ = floorZ + 24; power = 6;
  }
  if (d.object === 'candle') {
    // the candle in its pocket: a tealight cup, or a taper candle standing up out of it
    const top = d.form.height + (res.info.lift || 0), kind = d.extras.candle || 'tealight';
    const cupMat = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.5 });
    if (kind === 'taper') {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11, 160, 32), cupMat);
      stick.rotation.x = Math.PI / 2; stick.position.z = top - 18 + 80;
      stick.castShadow = true; stick.userData.noFrame = true; root.add(stick);
      bulb = new THREE.Mesh(new THREE.SphereGeometry(4.5, 20, 14), opts.glow ? glowMat() : new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.4 }));
      bulb.scale.set(1, 1, 2.1); bulb.position.z = top - 18 + 160 + 9;
      lightZ = top + 160; power = 6;
    } else {
      const R = kind === 'maxi' ? 29 : 19, ht = kind === 'maxi' ? 22 : 15, depth = kind === 'maxi' ? 24 : 17;
      const tea = new THREE.Mesh(new THREE.CylinderGeometry(R, R, ht, 40), cupMat);
      tea.rotation.x = Math.PI / 2; tea.position.z = top - depth + ht / 2;
      tea.castShadow = true; tea.userData.noFrame = true; root.add(tea);
      bulb = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 14), opts.glow ? glowMat() : new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.4 }));
      bulb.scale.set(1, 1, 1.9); bulb.position.z = top - depth + ht + 7;
      lightZ = top - depth + ht + 9; power = 6;
    }
  }
  if (d.object === 'hanging' && res.info.hangers) {
    // cords from each hole up to a ring above the pot, then one cord on to the ceiling
    const cordMat = new THREE.MeshStandardMaterial({ color: 0xcbb89a, roughness: 0.9 });
    const top = d.form.height + Math.max(120, d.form.diameter * 0.9), lift0 = res.info.lift || 0;
    for (const hole of res.info.hangers) {
      const a = new THREE.Vector3(hole.x, hole.y, hole.z + lift0), b = new THREE.Vector3(0, 0, top);
      const len = a.distanceTo(b);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, len, 8), cordMat);
      c.position.copy(a).add(b).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      c.userData.noFrame = true; c.castShadow = true;
      root.add(c);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 1.8, 10, 28), new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.4, metalness: 0.6 }));
    ring.position.z = top + 6; ring.rotation.x = Math.PI / 2;
    const up = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3000, 8), cordMat);
    up.rotation.x = Math.PI / 2; up.position.z = top + 12 + 1500;
    for (const o of [ring, up]) { o.userData.noFrame = true; root.add(o); }
  }
  if (d.object === 'wall' && res.info.wallY != null) {
    // the wall it hangs on, just behind the flat back
    // (one-sided, facing the planter, so it disappears when the view turns round behind it)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(700, 600), new THREE.MeshStandardMaterial({ color: 0xd9d3c8, roughness: 0.95 }));
    wall.rotation.x = Math.PI / 2;
    wall.position.set(0, res.info.wallY + 0.4, 300);
    wall.receiveShadow = true; wall.userData.noFrame = true; wall.userData.wall = true;
    root.add(wall);
  }
  if (bulb) {
    bulb.userData.noFrame = true;
    bulb.visible = L.bulb !== false;
    root.add(bulb);
    root.userData.bulb = bulb;
  }
  // a lit globe glows through its wall, brightest close to the bulb
  const glowMats = [];
  if (opts.glow && d.object === 'globe') {
    res.parts.forEach((p, i) => {
      if (p.key !== 'globe') return;
      const mesh = meshes[i], pass = glowPass(d);
      mesh.castShadow = false;
      const bulbAt = new THREE.Vector3(0, 0, lightZ - (p.place.z || 0)), R = d.form.diameter / 2, spot = clamp(0.75 / Math.max(0.4, d.form.wall), 0.12, 1.2);
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const base = m.color.clone();
        m.userData.glow = { base, pass };
        m.emissive.copy(base).multiply(new THREE.Color(tint)).lerp(new THREE.Color(tint), 0.25);
        m.emissiveIntensity = pass * (L.bright ?? 1);
        m.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, { uBulb: { value: bulbAt }, uR: { value: R }, uSpot: { value: spot } });
          sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlowPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlowPos = position;');
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlowPos;\nuniform vec3 uBulb;\nuniform float uR;\nuniform float uSpot;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float dd = max(distance(vGlowPos, uBulb), 1.0); totalEmissiveRadiance *= 0.55 + uSpot * clamp(uR * uR / (dd * dd), 0.0, 3.0); }');
        };
        m.customProgramCacheKey = () => 'globe-glow';
        glowMats.push(m);
      }
      power *= clamp(pass, 0.3, 1.2);
    });
  }
  root.userData.glowMats = glowMats;
  if (opts.glow && hasLight(d.object)) {
    const light = new THREE.PointLight(tint, power * (L.bright ?? 1), 0, 2);
    light.position.z = lightZ;
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0006;
    light.shadow.normalBias = 0.002;
    light.shadow.camera.near = 0.02;
    light.shadow.camera.far = 12;
    light.userData.power = power;
    root.add(light);
    root.userData.light = light;
  }
  return { root, meshes };
}

// How much of a lamp's light gets through a closed wall: translucent filament passes most, light colours
// some; every extra line of wall takes some away.
function glowPass(d) {
  const M = MATERIALS[d.finish.material] || MATERIALS.matte, c = new THREE.Color(partColor(d, 0));
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return (M.glow ? 1 : 0.4 * Math.min(1, lum * 1.4)) * clamp(1.6 / Math.max(0.4, d.form.wall), 0.3, 1.6);
}
// Brightness, warmth and bulb visibility change in place, without rebuilding meshes.
function applyLightSettings() {
  const root = stage.content;
  if (!root) return;
  const L = state.light, tint = WARMTH[L.warm] || WARMTH.warm;
  for (const m of root.userData.glowMats || []) {
    const g = m.userData.glow;
    m.emissive.copy(g.base).multiply(new THREE.Color(tint)).lerp(new THREE.Color(tint), 0.25);
    m.emissiveIntensity = g.pass * L.bright;
  }
  if (root.userData.light) { root.userData.light.intensity = root.userData.light.userData.power * L.bright; root.userData.light.color.set(tint); }
  if (root.userData.bulb) {
    root.userData.bulb.visible = L.bulb !== false;
    if (L.on && root.userData.bulb.material.isMeshBasicMaterial) root.userData.bulb.material.color.set(new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.55));
  }
  invalidate();
}
function saveLight() { store.set('weft.light', state.light); }

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }
  });
}

function boundsOf(root) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh && !o.userData.noFrame) box.expandByObject(o); });
  return box;
}
function frameStage(st, root, { keepDir = true, fit = 1.12, also = null } = {}) {
  const box = boundsOf(root);
  if (also) box.union(boundsOf(also));
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const cam = st.camera;
  const dir = keepDir && st.target ? cam.position.clone().sub(st.target).normalize() : new THREE.Vector3(0.62, 0.42, 0.66).normalize();
  const fov = (cam.fov * Math.PI) / 180;
  const dist = (sphere.radius / Math.sin(Math.min(fov, fov * cam.aspect) / 2)) * fit;
  const target = center.clone();
  target.y = Math.max(center.y, size.y * 0.42);
  cam.position.copy(target).addScaledVector(dir, dist);
  cam.near = dist / 100; cam.far = dist * 20;
  cam.updateProjectionMatrix();
  st.target = target;
  // light rig follows the object size
  const R = Math.max(size.x, size.y, size.z);
  st.key.position.set(target.x - R * 1.4, target.y + R * 2.4, target.z + R * 1.2);
  st.key.target.position.copy(target);
  const sc = st.key.shadow.camera;
  sc.left = -R * 1.6; sc.right = R * 1.6; sc.top = R * 1.6; sc.bottom = -R * 1.6;
  sc.near = 0.01; sc.far = R * 8;
  sc.updateProjectionMatrix();
  return { target, dist };
}

function applyLook(st, glow) {
  st.hemi.intensity = glow ? 0.02 : 0.55;
  st.key.intensity = glow ? 0.05 : 2.3;
  st.floorMat.envMapIntensity = 0.04;
  st.ground.material = glow ? st.floorMat : st.shadowMat;
}

let lastObjectKey = '';
function showResult(res) {
  state.result = res;
  const d = state.design;
  const glow = state.light.on && hasLight(d.object) && state.view === 'studio';
  const { root } = buildDisplay(res, d, { mode: state.view, explode: state.explode, cut: state.cut, glow, xray: state.xray, printer: state.printer, light: state.light });
  if (stage.content) { stage.spin.remove(stage.content); disposeGroup(stage.content); }
  stage.content = root;
  stage.spin.add(root);
  if (state.view === 'print') stage.spin.rotation.y = 0;
  placeRef();
  applyLook(stage, glow);
  $('#stage').classList.toggle('night', glow);
  const key = `${d.object}|${state.view}|${Math.round(d.form.height / 25)}|${Math.round(d.form.diameter / 25)}|${state.explode}`;
  if (key !== lastObjectKey) {
    const f = frameStage(stage, root, { keepDir: !!lastObjectKey, also: refState.group });
    controls.target.copy(f.target);
    lastObjectKey = key;
  } else {
    // keep the camera, refresh the light rig for the new size
    const prev = controls.target.clone();
    const camPos = stage.camera.position.clone();
    frameStage(stage, root, { keepDir: true, also: refState.group });
    stage.camera.position.copy(camPos);
    controls.target.copy(prev);
    stage.camera.updateProjectionMatrix();
  }
  controls.update();
  invalidate();
  updateReadout();
  renderChecks();
  updateLegend();
  updateHandles();
  refreshDimColor();
  setTimeout(settleDim, 0);
  const roles = res.parts.map((p) => p.place.color).sort().join();
  if (roles !== lastRoles) { lastRoles = roles; renderFinish(); } else multiUi?.update();
}
function updateLegend() {
  const res = state.result;
  if (!res) return;
  const over = res.parts.reduce((acc, p) => acc + p.stats.overhang, 0);
  const bridge = res.parts.reduce((acc, p) => acc + p.stats.bridge, 0);
  const showOver = over > 0.5, showBridge = state.view === 'print' && bridge > 0.5;
  const ref = refState.group ? REFS[state.refKind] : null;
  $('#lg-ref').hidden = !ref;
  if (ref) $('#lg-ref-text').textContent = `${ref.label} for scale · ${ref.size}`;
  $('#lg-over').hidden = !showOver;
  $('#lg-over-text').textContent = `Overhang past 46° · ${over >= 100 ? `${(over / 100).toFixed(1)} cm²` : `${Math.round(over)} mm²`}`;
  $('#lg-bridge').hidden = !showBridge;
  $('#legend').classList.toggle('show', showOver || showBridge || !!ref);
}
let lastRoles = '';

// ============================================================ dimensions
// Model-based dimensions in the spirit of a CAD drawing: extension lines, dimension lines and arrowheads
// drawn on top of the piece in a plane that faces the camera, with the values as crisp HTML labels.
const dimState = { group: new THREE.Group(), lines: null, arrows: null, labels: [], color: new THREE.Color('#1f4fbf'), shown: [] };
stage.scene.add(dimState.group);
(() => {
  const mat = () => ({ color: dimState.color, depthTest: false, depthWrite: false, transparent: true });
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(32 * 6), 3));
  dimState.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ ...mat(), opacity: 0.9 }));
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 9), 3));
  dimState.arrows = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ ...mat(), side: THREE.DoubleSide }));
  for (const o of [dimState.lines, dimState.arrows]) { o.renderOrder = 8; o.frustumCulled = false; dimState.group.add(o); }
  const box = $('#dims');
  for (let k = 0; k < 4; k++) {
    const el = h('span', { class: 'dim-label', hidden: true, title: 'Click to type a new value', role: 'button', tabindex: '0' });
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); editDim(k); });
    el.addEventListener('keydown', (e) => { if (e.target === el && e.key === 'Enter' && dimState.editing == null) { e.preventDefault(); editDim(k); } });
    box.append(el); dimState.labels.push(el);
  }
})();
function refreshDimColor() {
  const c = getComputedStyle($('#stage')).getPropertyValue('--dim').trim();
  if (c) { dimState.color.set(c); dimState.lines.material.color.copy(dimState.color); dimState.arrows.material.color.copy(dimState.color); }
  invalidate();
}
// Dimension layout in the camera-facing plane, in millimetres: u runs to the right, y up from the floor.
// minGap: the smallest spacing (mm) that still keeps stacked labels apart at the current zoom.
function dimLayout(minGap = 0) {
  const res = state.result, d = state.design, F = d.form, R = F.diameter / 2;
  const { w, h: ht } = assembledSize(res, d);
  if (isFacet(d)) {
    const g = Math.max(clamp(0.1 * Math.max(w, ht), 8, 22), minGap), uH = -(w / 2 + g), yl = ht + g;
    return [
      { key: 'height', value: ht, a: [uH, 0], b: [uH, ht], text: `${Math.round(ht)} mm`, ext: [[[-2, 0], [uH - 3, 0]], [[-w / 2 - 2, ht], [uH - 3, ht]]] },
      { key: 'width', value: w, a: [-w / 2, yl], b: [w / 2, yl], text: `${Math.round(w)} mm`, ext: [[[-w / 2, ht * 0.6], [-w / 2, yl + 3]], [[w / 2, ht * 0.6], [w / 2, yl + 3]]] },
    ];
  }
  const pend = d.object === 'pendant', lift = res.info.lift || 0;
  const round = (F.section || 'round') === 'round';
  const yBot = pend ? pendantHang(d) : 0, yTop = yBot + ht;
  // outline radius at the open rim and at the base (for a lamp: the opening hangs at the bottom)
  let rRim = R * F.top + (F.lip || 0), rBase = R * F.base;
  let yRim = pend ? yBot : F.height + lift, yBase = pend ? yTop : 0;
  for (const p of res.parts) {
    const b = p.stats.bbox, half = Math.max(b[3] - b[0], b[4] - b[1]) / 2;
    if ((p.key === 'saucer' || p.key === 'sleeve' || p.key === 'base') && lift > 0) rBase = Math.max(rBase, half);
    if (p.key === 'lid') { rRim = Math.max(rRim, half); yRim = yTop; }
  }
  const g = Math.max(clamp(0.1 * Math.max(w, ht), 8, 22), minGap);
  const L = [];
  const lin = (u, y) => [u, y];
  // height, on the left
  const uH = -(w / 2 + g);
  L.push({ key: 'height', value: ht, a: lin(uH, yBot), b: lin(uH, yTop), text: `${Math.round(ht)} mm`,
    ext: [[lin(-(pend ? rRim : rBase) - 2, yBot), lin(uH - 3, yBot)], [lin(-(pend ? rBase : rRim) - 2, yTop), lin(uH - 3, yTop)]] });
  const out = (y) => (y > (yBot + yTop) / 2 ? 1 : -1);
  const across = (key, r, y, off, label) => {
    const s = out(y), yl = y + s * off;
    L.push({ key, value: 2 * r, a: lin(-r, yl), b: lin(r, yl), text: label, ext: [[lin(-r, y + s * 2), lin(-r, yl + s * 3)], [lin(r, y + s * 2), lin(r, yl + s * 3)]] });
  };
  const fmtW = (v) => `${round ? 'Ø ' : ''}${Math.round(v)} mm`;
  if (round) across('rim', rRim, yRim, g, fmtW(2 * rRim));
  if (round && Math.abs(rBase - rRim) > 2) across('base', rBase, yBase, g, fmtW(2 * rBase));
  if (!round || w / 2 > Math.max(rRim, rBase) + 1.5) {
    // the widest point, dimensioned out past the base
    const rFn = displayProfile(F);
    let zw = 0, rw = 0;
    for (let k = 0; k <= 48; k++) { const z = (F.height * k) / 48, r = rFn(z); if (r > rw) { rw = r; zw = z; } }
    const yw = pend ? F.height + pendantHang(d) - zw : zw + lift, s = out(yBase), yl = yBase + s * (round ? 2 * g : g);
    L.push({ key: 'width', value: w, a: lin(-w / 2, yl), b: lin(w / 2, yl), text: fmtW(w), ext: [[lin(-w / 2, yw), lin(-w / 2, yl + s * 3)], [lin(w / 2, yw), lin(w / 2, yl + s * 3)]] });
  }
  return L;
}
const _dv = new THREE.Vector3(), _dr = new THREE.Vector3();
function dimWorld(right, u, y, out) { return out.copy(right).multiplyScalar(u * SCALE).setY(y * SCALE); }
// Rebuilds the dimension lines for the current camera and returns the labels in normalised screen space.
function updateDims() {
  const show = state.dims && state.view === 'studio' && !!state.result;
  dimState.group.visible = show;
  if (!show) { dimState.labels.forEach((el) => { el.hidden = true; }); dimState.shown = []; return []; }
  const cam = stage.camera;
  cam.updateMatrixWorld();
  const right = _dr.setFromMatrixColumn(cam.matrixWorld, 0);
  right.y = 0;
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  // arrowheads and label spacing keep a constant share of the view, whatever the zoom
  const dist = cam.position.distanceTo(controls.target);
  const viewMM = (dist * Math.tan((cam.fov * Math.PI) / 360) * 2) / SCALE;
  const L = dimLayout(viewMM * 0.04);
  const a = viewMM * 0.016, aw = a * 0.3;
  const lp = dimState.lines.geometry.attributes.position, ap = dimState.arrows.geometry.attributes.position;
  let li = 0, ai = 0;
  const seg = (p, q) => { dimWorld(right, p[0], p[1], _dv); lp.setXYZ(li++, _dv.x, _dv.y, _dv.z); dimWorld(right, q[0], q[1], _dv); lp.setXYZ(li++, _dv.x, _dv.y, _dv.z); };
  const arrow = (tip, dir) => {
    const bx = tip[0] - dir[0] * a, by = tip[1] - dir[1] * a, nx = -dir[1] * aw, ny = dir[0] * aw;
    for (const [u, y] of [tip, [bx + nx, by + ny], [bx - nx, by - ny]]) { dimWorld(right, u, y, _dv); ap.setXYZ(ai++, _dv.x, _dv.y, _dv.z); }
  };
  const labels = [];
  for (const dm of L) {
    seg(dm.a, dm.b);
    for (const [p, q] of dm.ext) seg(p, q);
    const dx = dm.b[0] - dm.a[0], dy = dm.b[1] - dm.a[1], len = Math.hypot(dx, dy) || 1;
    arrow(dm.a, [-dx / len, -dy / len]); arrow(dm.b, [dx / len, dy / len]);
    dimWorld(right, (dm.a[0] + dm.b[0]) / 2, (dm.a[1] + dm.b[1]) / 2, _dv).project(cam);
    labels.push({ key: dm.key, value: dm.value, text: dm.text, x: _dv.x, y: _dv.y });
  }
  for (let k = li; k < lp.count; k++) lp.setXYZ(k, 0, 0, 0);
  for (let k = ai; k < ap.count; k++) ap.setXYZ(k, 0, 0, 0);
  lp.needsUpdate = true; ap.needsUpdate = true;
  dimState.lines.geometry.setDrawRange(0, li);
  dimState.arrows.geometry.setDrawRange(0, ai);
  const rect = canvas.getBoundingClientRect();
  dimState.labels.forEach((el, k) => {
    const lb = labels[k];
    el.hidden = !lb;
    if (!lb) return;
    el.dataset.key = lb.key;
    if (dimState.editing !== k && el.textContent !== lb.text) el.textContent = lb.text;
    el.style.transform = `translate(${((lb.x + 1) / 2) * rect.width}px, ${((1 - lb.y) / 2) * rect.height}px) translate(-50%, -50%)`;
  });
  dimState.shown = labels;
  return labels;
}
function setDims(on) {
  state.dims = on; store.set('weft.dims', on); syncToggles(); invalidate();
  if (on && !store.get('weft.dimsTip', false)) { toast('Click any dimension to type an exact value'); store.set('weft.dimsTip', true); }
}
// Type a value straight into a dimension on the model.
function editDim(k) {
  if (dimState.editing === k) return;
  if (dimState.editing != null) document.activeElement?.blur?.();
  const lb = dimState.shown[k], el = dimState.labels[k];
  if (!lb) return;
  dimState.editing = k;
  const inp = h('input', { class: 'dim-input', type: 'text', inputmode: 'decimal', 'aria-label': `${lb.text}, type a new value in mm`, value: String(Math.round(lb.value * 10) / 10) });
  el.replaceChildren(inp, h('span', {}, ' mm'));
  inp.focus(); inp.select();
  let cancel = false;
  inp.addEventListener('pointerdown', (e) => e.stopPropagation());
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } else if (e.key === 'Escape') { cancel = true; inp.blur(); }
  });
  inp.addEventListener('blur', () => {
    const v = cancel ? null : parseTyped(inp.value, { min: -1e9, max: 1e9, step: 0.1, fmt: (x) => `${x} mm` });
    dimState.editing = null;
    el.textContent = lb.text;
    if (v != null && Number.isFinite(v) && Math.abs(v - lb.value) > 0.05) applyDim(lb.key, v, lb.value);
    invalidate();
  });
}
// After the rebuild, a typed size is checked once more and nudged, since relief adds a little width.
let pendingDim = null;
function settleDim() {
  if (!pendingDim || !state.result) return;
  const p = pendingDim, cur = dimLayout().find((x) => x.key === p.key);
  if (!cur || Math.abs(cur.value - p.target) < 0.3 || p.tries >= 2) { pendingDim = null; return; }
  p.tries++;
  applyDim(p.key, p.target, cur.value, true);
}
function applyDim(key, mm, shown, again = false) {
  if (!again) pendingDim = { key, target: mm, tries: 0 };
  const d = state.design, F = d.form, R = F.diameter / 2, r2 = (v) => Math.round(v * 1000) / 1000;
  let kept = false;
  const lim = (v, a, b) => { if (v < a || v > b) kept = true; return clamp(v, a, b); };
  if (key === 'height') F.height = Math.round(lim(F.height + (mm - shown), 30, 320) * 10) / 10;
  else if (key === 'rim') F.top = r2(lim(F.top + (mm - shown) / (2 * R), 0.3, 1.6));
  else if (key === 'base') F.base = r2(lim(F.base + (mm - shown) / (2 * R), 0.3, 1.6));
  else if (key === 'width') {
    // the rim and base keep their size, like dragging the widest point
    const rb = R * F.base, rt = R * F.top, old = F.diameter;
    F.diameter = Math.round(lim(F.diameter + (mm - shown), 40, 320) * 10) / 10;
    const nr = F.diameter / 2;
    F.base = r2(clamp(rb / nr, 0.3, 1.6)); F.top = r2(clamp(rt / nr, 0.3, 1.6));
    rescaleCount(old, F.diameter);
  }
  if (kept) { toast('Kept within the printable range for this shape'); pendingDim = null; }
  onEdit(true);
  renderForm();
}

// ============================================================ size reference
// Everyday objects at true size, standing on the floor beside the piece. They do not turn with it.
const REFS = {
  hand: { label: 'Hand', size: 'adult, about 185 mm long', half: 100, build: refHand },
  banana: { label: 'Banana', size: 'about 190 mm long', half: 86, build: refBanana },
  can: { label: 'Drinks can', size: 'Ø 66 × 115 mm', half: 33, build: refCan },
  mug: { label: 'Mug', size: 'Ø 82 × 95 mm', half: 41, build: refMug },
  phone: { label: 'Phone', size: '147 × 72 mm', half: 36, build: refPhone },
  pencil: { label: 'Pencil', size: '175 mm long', half: 88, build: refPencil },
  card: { label: 'Bank card', size: '86 × 54 mm', half: 43, build: refCard },
};
const refState = { group: null, kind: null, dir: null };
const refMat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.5, metalness: 0, ...o });
function roundRect(w, hgt, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -hgt / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + hgt - r); s.quadraticCurveTo(x + w, y + hgt, x + w - r, y + hgt);
  s.lineTo(x + r, y + hgt); s.quadraticCurveTo(x, y + hgt, x, y + hgt - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// An adult hand lying flat, palm down, fingers towards the piece: about 185 mm from wrist to fingertip.
// Wood-toned like an artist's mannequin, so it reads as a size, not a person.
function refHand() {
  const g = new THREE.Group();
  const mat = refMat('#b98a5e', { roughness: 0.58, sheen: 0.35, sheenRoughness: 0.6, clearcoat: 0.1 });
  const add = (geo) => { const m = new THREE.Mesh(geo, mat); g.add(m); return m; };
  // back of the hand: a dome, flat underneath, fuller at the knuckles than at the wrist
  const back = new THREE.SphereGeometry(1, 56, 28, 0, Math.PI * 2, 0, Math.PI / 2);
  const P = back.attributes.position;
  for (let k = 0; k < P.count; k++) {
    const x = P.getX(k), y = P.getY(k), z = P.getZ(k); // x: -1 knuckles .. +1 wrist
    const wide = 44 - 9 * Math.max(0, x);
    P.setXYZ(k, 44 + x * 57, y * (24 - 5 * Math.max(0, x)), z * wide);
  }
  back.computeVertexNormals();
  add(back);
  // tapered finger: from its knuckle (x0, z0) towards -x, fanned by `ang`, drooping onto the floor
  const finger = (x0, z0, len, r, ang, y0) => {
    const geo = new THREE.CapsuleGeometry(r, len, 8, 16);
    const Q = geo.attributes.position, half = len / 2 + r;
    for (let k = 0; k < Q.count; k++) {
      const t = (Q.getY(k) + half) / (2 * half); // 0 at the knuckle, 1 at the tip
      const sc = 1 - 0.24 * t;
      Q.setX(k, Q.getX(k) * sc); Q.setZ(k, Q.getZ(k) * sc);
    }
    geo.translate(0, half - r * 0.7, 0);
    geo.rotateZ(Math.PI / 2 + Math.atan2(y0 - r * 0.76, len)); // tip down to rest on the floor
    geo.rotateY((ang * Math.PI) / 180);
    geo.translate(x0, y0, z0);
    geo.computeVertexNormals();
    add(geo);
    // a knuckle bump where the finger meets the back of the hand
    const kn = add(new THREE.SphereGeometry(r * 1.05, 18, 12));
    kn.position.set(x0 + 2, y0 + 1.5, z0);
  };
  finger(-6, 29, 66, 9.3, 7, 11);
  finger(-10, 10, 74, 9.6, 2, 12);
  finger(-8, -9.5, 69, 9.1, -3, 12);
  finger(-2, -28, 52, 8.0, -9, 10);
  // thumb: two joints, out to the side and forward
  const thumb1 = new THREE.CapsuleGeometry(11.5, 30, 8, 16);
  thumb1.rotateZ(Math.PI / 2); thumb1.rotateY((24 * Math.PI) / 180); thumb1.translate(50, 11.5, 34);
  add(thumb1);
  finger(30, 43, 36, 10.2, 22, 11);
  return g;
}
function refBanana() {
  const g = new THREE.Group();
  // a gentle smile: the belly rests on the floor and both ends lift
  const Rc = 118, span = (48 * Math.PI) / 180, r0 = 17;
  const pts = [];
  for (let k = 0; k <= 24; k++) { const f = -span + (2 * span * k) / 24; pts.push(new THREE.Vector3(Rc * Math.sin(f), Rc + r0 - Rc * Math.cos(f), 0)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const TS = 80, RS = 20;
  const geo = new THREE.TubeGeometry(curve, TS, 1, RS, false);
  const P = geo.attributes.position, col = new Float32Array(P.count * 3);
  const yellow = new THREE.Color('#e3bf3f'), green = new THREE.Color('#9aa23a'), brown = new THREE.Color('#4a3a22'), c = new THREE.Color();
  for (let i = 0; i <= TS; i++) {
    const t = i / TS, ctr = curve.getPointAt(t);
    const stem = t > 0.9, u = Math.min(1, t / 0.9);
    const r = stem ? 3.4 : Math.max(u > 0.5 ? 4.2 : 2.6, r0 * Math.pow(Math.sin(Math.PI * u), 0.42));
    for (let j = 0; j <= RS; j++) {
      const v = i * (RS + 1) + j, th = (j / RS) * Math.PI * 2;
      const k = r * (1 + 0.06 * Math.cos(5 * th));
      P.setXYZ(v, ctr.x + (P.getX(v) - ctr.x) * k, ctr.y + (P.getY(v) - ctr.y) * k, ctr.z + (P.getZ(v) - ctr.z) * k);
      if (t < 0.035) c.copy(brown); else if (stem) c.copy(green).lerp(brown, 0.45); else c.copy(yellow).lerp(green, clamp((t - 0.72) / 0.18, 0, 1) * 0.7);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, refMat('#ffffff', { vertexColors: true, roughness: 0.62, sheen: 0.3 })));
  for (const t of [0, 1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(t ? 3.4 : 2.6, 12, 8), refMat(t ? '#5f5c2c' : '#3b2f1e', { roughness: 0.8 }));
    cap.position.copy(curve.getPointAt(t));
    g.add(cap);
  }
  return g;
}
function refCan() {
  const g = new THREE.Group();
  const prof = [[0, 3.5], [21, 2.6], [26.5, 0.4], [29, 0], [31.2, 1.6], [33, 9], [33, 104], [29.6, 111.6], [27.4, 113.6], [27.6, 115], [26.4, 115.3], [25.4, 113.2], [0, 113.2]];
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 56), refMat('#c9cdd2', { metalness: 0.9, roughness: 0.3 }));
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(33.15, 33.15, 78, 56, 1, true), refMat('#2f5d62', { roughness: 0.38, metalness: 0.35, clearcoat: 0.5 }));
  sleeve.position.y = 54;
  g.add(body, sleeve);
  return g;
}
function refMug() {
  const g = new THREE.Group();
  const prof = [[0, 0], [35, 0], [39, 1.6], [41, 5.5], [41, 93], [40.3, 95], [38.7, 95], [37.6, 93.4], [37.6, 9.5], [35.5, 7.5], [0, 7.5]];
  const ceramic = refMat('#f1eee7', { roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 64), ceramic);
  body.material.side = THREE.DoubleSide;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(25, 5.2, 14, 36, Math.PI), ceramic);
  handle.rotation.z = -Math.PI / 2;
  handle.scale.set(0.85, 1.12, 1);
  handle.position.set(40, 52, 0);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(37.7, 48), refMat('#3a2417', { roughness: 0.15, clearcoat: 1 }));
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = 80;
  g.add(body, handle, coffee);
  return g;
}
function refPhone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRect(69.1, 144.6, 9), { depth: 5.4, bevelEnabled: true, bevelSize: 1.2, bevelThickness: 1.2, bevelSegments: 3, curveSegments: 10 }), refMat('#34363b', { metalness: 0.6, roughness: 0.35 }));
  body.position.z = -2.7;
  const screen = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(66.5, 142, 7.5), 10), refMat('#0c0d10', { roughness: 0.08, clearcoat: 1 }));
  screen.position.z = 3.95;
  const tilt = new THREE.Group();
  tilt.add(body, screen);
  // propped up, leaning back a little
  tilt.rotation.x = -0.12;
  tilt.position.set(0, 73.5 * Math.cos(0.12) + 3.9 * Math.sin(0.12), -73.5 * Math.sin(0.12));
  g.add(tilt);
  return g;
}
function refPencil() {
  const g = new THREE.Group();
  const r = 3.75 / Math.cos(Math.PI / 6);
  const part = (geo, mat, x0, x1) => { const m = new THREE.Mesh(geo, mat); m.rotation.z = Math.PI / 2; m.position.set((x0 + x1) / 2 - 87.5, 3.75, 0); g.add(m); return m; };
  part(new THREE.CylinderGeometry(r, r, 142, 6), refMat('#e8b523', { roughness: 0.42, clearcoat: 0.4 }), 18, 160);
  const wood = part(new THREE.ConeGeometry(3.7, 15, 24), refMat('#e2c39a', { roughness: 0.85 }), 3, 18);
  wood.rotation.z = Math.PI / 2;
  const lead = part(new THREE.ConeGeometry(1.15, 4, 16), refMat('#2d2d2d', { roughness: 0.4, metalness: 0.3 }), -1, 3);
  lead.rotation.z = Math.PI / 2;
  part(new THREE.CylinderGeometry(3.95, 3.95, 8, 24), refMat('#bdb7a9', { metalness: 0.85, roughness: 0.3 }), 160, 168);
  part(new THREE.CylinderGeometry(3.7, 3.7, 7, 24), refMat('#e3868b', { roughness: 0.85 }), 168, 175);
  return g;
}
function refCard() {
  const g = new THREE.Group();
  const card = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRect(85.6, 53.98, 3.2), { depth: 0.76, bevelEnabled: false, curveSegments: 6 }), refMat('#2c4a78', { roughness: 0.3, clearcoat: 0.6 }));
  const chip = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(11.5, 9, 1.4), 4), refMat('#cdb36b', { metalness: 0.9, roughness: 0.3 }));
  chip.position.set(-28, 6, 0.8);
  const tilt = new THREE.Group();
  tilt.add(card, chip);
  tilt.rotation.x = -0.18;
  tilt.position.set(0, 27 * Math.cos(0.18), -27 * Math.sin(0.18));
  g.add(tilt);
  return g;
}
const _rd = new THREE.Vector3();
function refDirection() {
  // to the right of the piece as the camera sees it
  const cam = stage.camera;
  cam.updateMatrixWorld();
  const r = _rd.setFromMatrixColumn(cam.matrixWorld, 0).clone();
  r.y = 0;
  return r.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : r.normalize();
}
function placeRef() {
  const want = state.ref && state.view === 'studio' && state.result ? state.refKind : null;
  if (refState.group && refState.kind !== want) { stage.scene.remove(refState.group); disposeGroup(refState.group); refState.group = null; refState.kind = null; }
  if (!want) return;
  const R = REFS[want] || REFS.banana;
  if (!refState.group) {
    refState.group = R.build();
    refState.group.scale.setScalar(SCALE);
    refState.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    refState.kind = want;
    stage.scene.add(refState.group);
  }
  if (!refState.dir) refState.dir = refDirection();
  const { w } = assembledSize(state.result, state.design);
  const dir = refState.dir, off = (w / 2 + Math.max(24, w * 0.14) + R.half) * SCALE;
  refState.group.position.set(dir.x * off, 0, dir.z * off);
  // face the camera: local x runs along the placement direction
  refState.group.rotation.y = Math.atan2(-dir.z, dir.x);
}
function setRef(on, kind) {
  state.ref = on;
  if (kind) state.refKind = kind;
  store.set('weft.ref', on); store.set('weft.refKind', state.refKind);
  if (on && !kind) refState.dir = refDirection();
  lastObjectKey = '';
  syncToggles();
  redisplay();
}
function renderRefPick() {
  const box = $('#ref-pick');
  box.replaceChildren(...Object.entries(REFS).map(([k, r]) => h('button', { type: 'button', 'aria-pressed': state.refKind === k, title: r.size, onclick: () => setRef(true, k) }, r.label)));
}

// ============================================================ shape handles
// Points on the silhouette you can drag. They sit in a vertical plane facing the camera, so they
// stay on the visible outline while the piece turns underneath them.
const handleState = { group: new THREE.Group(), items: [], line: null, drag: null, hover: null, right: new THREE.Vector3(1, 0, 0), accent: new THREE.Color('#3243c4') };
stage.scene.add(handleState.group);
const HANDLE_IDS = ['top', 'belly', 'full', 'base'];
(() => {
  const geo = new THREE.SphereGeometry(1, 24, 16);
  for (const id of HANDLE_IDS) {
    const outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
    const inner = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x3243c4, depthTest: false, transparent: true }));
    inner.scale.setScalar(0.66);
    outer.renderOrder = 10; inner.renderOrder = 11;
    outer.add(inner);
    outer.userData.handle = id;
    handleState.group.add(outer);
    handleState.items.push(outer);
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
  handleState.line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0x3243c4, depthTest: false, transparent: true, opacity: 0.85 }));
  handleState.line.renderOrder = 9;
  handleState.line.frustumCulled = false;
  handleState.group.add(handleState.line);
})();
function refreshAccent() { handleState.accent.set(cssVar('--accent') || '#3243c4'); invalidate(); }

let profileMemo = { key: '', fn: null };
function displayProfile(F) {
  const key = JSON.stringify(F);
  if (profileMemo.key !== key) {
    let fn = makeProfile(F);
    if (F.printable !== false) fn = easeProfile(fn, F.height, 44).fn;
    profileMemo = { key, fn };
  }
  return profileMemo.fn;
}
function handlePoints(d) {
  const F = d.form, R = F.diameter / 2, H = F.height;
  const rFn = displayProfile(F);
  const zf = F.belly * H * 0.5;
  return { rFn, pts: { base: [R * F.base, 0], belly: [R, F.belly * H], full: [rFn(zf), zf], top: [R * F.top + (F.lip || 0), H] } };
}
function engineToWorld(d, r, z, out) {
  const lift = state.result?.info?.lift || 0;
  const y = d.object === 'pendant' ? d.form.height + pendantHang(d) - z : z + lift;
  return out.copy(handleState.right).multiplyScalar(r * SCALE).setY(y * SCALE);
}
const _hv = new THREE.Vector3();
function updateHandles() {
  const show = state.handles && state.view === 'studio' && !!state.result && state.design.object !== 'globe' && !isFacet(state.design);
  handleState.group.visible = show;
  if (!show) return;
  const d = state.design, cam = stage.camera;
  const right = _hv.setFromMatrixColumn(cam.matrixWorld, 0);
  right.y = 0;
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  handleState.right.copy(right.normalize());
  const { rFn, pts } = handlePoints(d);
  for (const m of handleState.items) {
    const id = m.userData.handle;
    const [hr, hz] = pts[id];
    engineToWorld(d, hr, hz, m.position);
    const hot = handleState.hover === id || handleState.drag?.id === id;
    m.scale.setScalar(cam.position.distanceTo(m.position) * (hot ? 0.0115 : 0.0085));
    m.children[0].material.color.copy(handleState.accent);
  }
  const pos = handleState.line.geometry.attributes.position;
  for (let k = 0; k < 64; k++) {
    const z = (d.form.height * k) / 63;
    engineToWorld(d, rFn(z), z, _hv);
    pos.setXYZ(k, _hv.x, _hv.y, _hv.z);
  }
  pos.needsUpdate = true;
  handleState.line.material.color.copy(handleState.accent);
  handleState.group.updateMatrixWorld(true);
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const dragPlane = new THREE.Plane();
function pickHandle(e) {
  if (!handleState.group.visible) return null;
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  const hits = raycaster.intersectObjects(handleState.items, false);
  return hits.length ? hits[0].object.userData.handle : null;
}
function handleText(id, F) {
  const R = F.diameter / 2;
  if (id === 'base') return `Base Ø ${Math.round(2 * R * F.base)} mm`;
  if (id === 'top') return `Rim Ø ${Math.round(2 * (R * F.top + (F.lip || 0)))} mm · height ${F.height} mm`;
  if (id === 'belly') return `Widest Ø ${F.diameter} mm at ${Math.round(F.belly * 100)}% up`;
  return `Fullness ${F.fullness.toFixed(2)}`;
}
function showTip(e, text) {
  const tip = $('#drag-tip'), rect = $('#stage').getBoundingClientRect();
  tip.hidden = !text;
  if (!text) return;
  tip.textContent = text;
  tip.style.left = `${Math.min(e.clientX - rect.left, rect.width - 240)}px`;
  tip.style.top = `${e.clientY - rect.top - 22}px`;
}
function dragTo(e) {
  const drag = handleState.drag, d = state.design, F = d.form;
  const rect = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, stage.camera);
  const n = new THREE.Vector3(-handleState.right.z, 0, handleState.right.x);
  dragPlane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3());
  const p = raycaster.ray.intersectPlane(dragPlane, new THREE.Vector3());
  if (!p) return;
  const r = Math.max(0, p.dot(handleState.right) / SCALE);
  const lift = state.result?.info?.lift || 0;
  const z = d.object === 'pendant' ? F.height + pendantHang(d) - p.y / SCALE : p.y / SCALE - lift;
  const R = F.diameter / 2, r2 = (v) => Math.round(v * 100) / 100;
  if (drag.id === 'base') F.base = r2(clamp(r / R, 0.3, 1.6));
  else if (drag.id === 'top') {
    F.top = r2(clamp((r - (F.lip || 0)) / R, 0.3, 1.6));
    if (d.object === 'pendant') F.height = Math.round(clamp(drag.crown - p.y / SCALE, 30, 320));
    else F.height = Math.round(clamp(z, 30, 320));
  } else if (drag.id === 'belly') {
    const nr = clamp(r, 20, 160), oldD = F.diameter;
    F.diameter = Math.round(nr * 2);
    F.base = r2(clamp(drag.rb / nr, 0.3, 1.6));
    F.top = r2(clamp(drag.rt / nr, 0.3, 1.6));
    rescaleCount(oldD, F.diameter);
    F.belly = r2(clamp(z / F.height, 0.15, 0.85));
  } else F.fullness = r2(clamp(drag.f0 + (r - drag.r0) / (0.3 * R), -0.5, 1));
  showTip(e, handleText(drag.id, F));
  invalidate();
  onEdit(false);
}
// capture on the stage so a grab never reaches the orbit controls
$('#stage').addEventListener('pointerdown', (e) => {
  if (e.target !== canvas || e.button > 0) return;
  const id = pickHandle(e);
  if (!id) return;
  e.stopImmediatePropagation(); e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  controls.enabled = false;
  if (state.spin) setSpin(false);
  const d = state.design, F = d.form, R = F.diameter / 2;
  if (d.object === 'pendant') hangFreeze = pendantHang(d);
  handleState.drag = { id, r0: handlePoints(d).pts.full[0], f0: F.fullness, rb: R * F.base, rt: R * F.top, crown: F.height + pendantHang(d) };
  $('#stage').classList.add('dragging');
  $('#hint').style.opacity = 0;
  invalidate();
}, { capture: true });
canvas.addEventListener('pointermove', (e) => {
  if (handleState.drag) { dragTo(e); return; }
  if (e.pointerType === 'touch' || e.buttons) return;
  const id = pickHandle(e);
  if (id !== handleState.hover) { handleState.hover = id; canvas.style.cursor = id ? 'grab' : ''; invalidate(); }
  showTip(e, id ? handleText(id, state.design.form) : '');
});
canvas.addEventListener('pointerleave', () => { if (!handleState.drag) { handleState.hover = null; showTip(null, ''); invalidate(); } });
function endDrag(e) {
  if (!handleState.drag) return;
  try { canvas.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  handleState.drag = null;
  hangFreeze = null;
  controls.enabled = true;
  $('#stage').classList.remove('dragging');
  showTip(null, '');
  onEdit(true);
  renderForm();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ============================================================ build pipeline
let building = false, pending = null, finalTimer = 0, lastFinalMs = 200;
function rebuild(final) {
  state.version++;
  clearTimeout(finalTimer);
  if (final || lastFinalMs < 140) request('final');
  else { request('draft'); finalTimer = setTimeout(() => request('final'), 260); }
}
function request(kind) {
  pending = { kind, version: state.version };
  pump();
}
async function pump() {
  if (building || !pending) return;
  const job = pending; pending = null;
  building = true;
  $('#busy').classList.add('show');
  const q = job.kind === 'draft' ? 0.5 : 1;
  const t0 = performance.now();
  try {
    const res = await engine.run(engineParams(state.design), q);
    if (job.kind === 'final') lastFinalMs = performance.now() - t0;
    if (job.version === state.version || !pending) showResult(res);
  } catch (err) {
    console.error(err);
    toast('That combination could not be built. Try a smaller value.');
  }
  building = false;
  if (!pending) $('#busy').classList.remove('show');
  if (pending) pump();
  else if (thumbQueue.length) setTimeout(pumpThumbs, 60);
}

function onEdit(commit, structural) {
  if (structural) renderAll();
  updateKind();
  rebuild(!!commit);
  if (commit) commitHistory();
}

// ============================================================ readout + checks
const spiralVase = (p, d) => p.key === 'vase' && d.extras.vaseMode && d.surface.mode !== 'cut';
function partWeight(p, d) {
  // a candle holder is solid: a 1.2 mm skin (walls, top and bottom layers) round 15% infill
  if (d.object === 'candle' && p.key === 'holder') { const skin = p.stats.area * 1.2; return (skin + Math.max(0, p.stats.volume - skin) * 0.15) * 1.24e-3; }
  if (!spiralVase(p, d)) return partGrams(p, d);
  const rFn = makeProfile(d.form);
  const bottom = Math.PI * rFn(0) ** 2, top = Math.PI * rFn(d.form.height) ** 2;
  return ((p.stats.area - bottom - top) * 0.6 + bottom * 1.0) * 1.24e-3;
}
function partsWeight(res, d) { return res.parts.reduce((g, p) => g + partWeight(p, d), 0); }
// Volume of each colour band (closed bodies, so the divergence theorem is exact), or for a spiral
// vase the wall area in each band, which is what the single wall's weight follows.
function slotShares(p, d, res) {
  const P = p.position, I = p.index, out = new Map();
  if (p.regions) {
    for (const rg of p.regions) {
      let v = 0;
      for (let t = rg.first * 3; t < (rg.first + rg.count) * 3; t += 3) {
        const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
        v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
      }
      out.set(rg.slot, (out.get(rg.slot) || 0) + Math.abs(v / 6));
    }
    return out;
  }
  const cuts = res.info.colorChanges, slots = bandsFor(d)?.slots;
  if (!cuts?.length || !slots || p.key !== res.info.mainKey) return null;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const z = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const area = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    let k = 0; while (k < cuts.length && z > cuts[k]) k++;
    const slot = slots[Math.min(k, slots.length - 1)];
    out.set(slot, (out.get(slot) || 0) + area);
  }
  return out;
}
// Grams of each filament, in the order of filamentList.
function filamentUse(res, d) {
  const fils = filamentList(d, res), grams = fils.map(() => 0), roles = fils.map(() => new Set());
  const at = (c) => Math.max(0, fils.indexOf(String(c).toLowerCase()));
  for (const p of res.parts) {
    const g = partWeight(p, d), share = state.multicolor ? slotShares(p, d, res) : null;
    if (share && share.size) {
      let tot = 0; share.forEach((v) => { tot += v; });
      share.forEach((v, slot) => { const k = at(slotColor(d, slot)); grams[k] += (g * v) / (tot || 1); roles[k].add(p.label); });
    } else { const k = at(partColor(d, p.place.color)); grams[k] += g; roles[k].add(p.label); }
  }
  return fils.map((color, k) => ({ color, grams: grams[k], roles: [...roles[k]] }));
}
const filamentName = (c) => FILAMENTS.find(([, x]) => x.toLowerCase() === String(c).toLowerCase())?.[0] || 'Custom';
// Walls are solid perimeters; anything thicker than the perimeters gets 15% infill.
function partGrams(p, d) {
  const loops = Math.max(2, Math.round(d.form.wall / 0.45));
  const shell = Math.min(p.stats.volume, (p.stats.area * loops * 0.45) / 2);
  return ((shell + 0.15 * (p.stats.volume - shell)) * 1.24) / 1000;
}
function assembledSize(res, d) {
  let w = 0, hgt = 0;
  for (const p of res.parts) {
    const b = p.stats.bbox;
    if (p.place.rot) { w = Math.max(w, p.place.span || 0); hgt = Math.max(hgt, p.place.height || 0); continue; }
    w = Math.max(w, b[3] - b[0], b[4] - b[1]);
    hgt = Math.max(hgt, b[5] - b[2] + (p.place.z && !p.place.flipZ && !p.place.flip ? p.place.z : 0));
  }
  if (d.object === 'box' && d.extras.lid) {
    const knob = res.parts.find((p) => p.key === 'knob');
    hgt = d.form.height + 2.4 + (knob ? knob.place.z - d.form.height - 2.4 : 0);
  }
  return { w, h: hgt };
}
function updateReadout() {
  const res = state.result; if (!res) return;
  const d = state.design;
  const { w, h: ht } = assembledSize(res, d);
  const g = partsWeight(res, d);
  const tris = res.parts.reduce((a, p) => a + p.stats.tris, 0);
  const el = $('#readout');
  el.replaceChildren(
    // a faceted wall planter: width, height, and how far it reaches out from the wall
    res.info.facet ? h('span', {}, h('strong', {}, `${Math.round(res.info.facet.width)}`), ' × ', h('strong', {}, `${Math.round(res.info.facet.height)}`), ' × ', h('strong', {}, `${Math.round(res.info.facet.depth)}`), ' mm')
      : h('span', {}, 'Ø ', h('strong', {}, `${Math.round(w)}`), ' × ', h('strong', {}, `${Math.round(ht)}`), ' mm'),
    h('span', {}, h('strong', {}, `${Math.round(g)} g`), ' PLA'),
    h('span', {}, `${res.parts.length} part${res.parts.length > 1 ? 's' : ''}`),
    h('span', {}, tris < 1000 ? `${tris} triangles` : `${(tris / 1000).toFixed(0)}k triangles`),
  );
  $('#status-weight').textContent = `${Math.round(g)} g · ${(g / 1.24 / 2.405).toFixed(1)} m`;
}
function fitChecks(res) {
  const printer = PRINTERS.find((q) => q.id === state.printer) || PRINTERS[0];
  const [bx, by, bz] = printer.bed;
  const out = [];
  for (const p of res.parts) {
    const b = p.stats.bbox, w = b[3] - b[0], dp = b[4] - b[1], ht = b[5] - b[2];
    const fits = (w <= bx && dp <= by) || (w <= by && dp <= bx);
    if (!fits || ht > bz) out.push({ level: 'bad', text: `${p.label} is ${Math.round(w)} × ${Math.round(dp)} × ${Math.round(ht)} mm and does not fit a ${bx} × ${by} × ${bz} mm bed.` });
  }
  if (!out.length) out.push({ level: 'ok', text: `Every part fits the ${printer.label.split(' · ')[0]} bed.` });
  return out;
}
function allChecks() {
  const res = state.result; if (!res) return [];
  return [...fitChecks(res), ...res.checks];
}
function renderChecks() {
  const checks = allChecks();
  const bad = checks.filter((c) => c.level === 'bad').length, warn = checks.filter((c) => c.level === 'warn').length;
  const st = $('#status');
  st.className = `status ${bad ? 'bad' : warn ? 'warn' : ''}`;
  $('#status-text').replaceChildren(
    bad ? h('b', {}, `${bad} issue${bad > 1 ? 's' : ''} to fix`) : warn ? h('b', {}, `Printable, ${warn} note${warn > 1 ? 's' : ''}`) : h('b', {}, 'Ready to print'),
    bad || warn ? ' · see Export' : ' · no supports',
  );
  const list = $('#check-list');
  if (list) list.replaceChildren(...checks.map((c) => h('li', { class: c.level }, c.text)));
  const parts = $('#parts-body');
  if (parts && state.result) {
    parts.replaceChildren(...state.result.parts.map((p) => {
      const b = p.stats.bbox;
      return h('tr', {}, h('td', {}, p.label), h('td', { class: 'mono' }, `${Math.round(b[3] - b[0])} × ${Math.round(b[5] - b[2])}`), h('td', { class: 'mono' }, `${Math.round(partWeight(p, state.design))} g`));
    }));
    const use = filamentUse(state.result, state.design), changes = state.multicolor ? colorChangeHeights(state.design) : [];
    $('#fil-sub').textContent = use.length === 1 ? 'One filament for the whole print'
      : `${use.length} filaments${changes.length ? ` · colour changes at ${changes.map((z) => z.toFixed(1)).join(', ')} mm` : ''}`;
    $('#fil-body').replaceChildren(...use.map((f, k) => h('tr', {},
      h('td', {}, h('span', { class: 'fil-dot', style: `--c:${f.color}` }), `${k + 1} · ${filamentName(f.color)}`),
      h('td', {}, f.roles.join(', ')),
      h('td', { class: 'mono' }, `${Math.round(f.grams)} g`))));
  }
  refreshListing();
}

// ============================================================ panes
function setTab(tab) {
  state.tab = tab;
  document.body.dataset.tab = tab;
  for (const t of ['object', 'form', 'surface', 'finish', 'export']) {
    $(`#tab-${t}`).setAttribute('aria-selected', t === tab);
    $(`#pane-${t}`).hidden = t !== tab;
  }
  $('#panes').scrollTop = 0;
}

// Typed values: the text after the number is optional ("152", "152 mm", "42%", "none").
// Lengths keep 0.1 mm; everything else snaps to the slider's step.
function parseTyped(text, spec) {
  const fmt = spec.fmt || ((x) => `${x}`);
  const t = String(text).trim().replace(',', '.');
  if (/^(none|off|no)$/i.test(t)) return clamp(0, spec.min, spec.max);
  const m = t.match(/[-+]?\d*\.?\d+/);
  if (!m) return null;
  let v = parseFloat(m[0]);
  if (/%/.test(String(fmt(spec.max)))) v /= 100;
  return v;
}
function snapTyped(v, spec) {
  const fmt = spec.fmt || ((x) => `${x}`);
  if (/mm/.test(String(fmt(spec.max)))) return Math.round(v * 10) / 10;
  const dec = (String(spec.step).split('.')[1] || '').length;
  return +(Math.round(v / spec.step) * spec.step).toFixed(dec);
}
function sliderCtl(id, label, spec, get, set, opts = {}) {
  const fmt = spec.fmt || ((x) => `${x}`);
  const input = h('input', { type: 'range', id, min: spec.min, max: spec.max, step: spec.step });
  const val = h('input', { class: 'ctl-val', type: 'text', inputmode: 'decimal', spellcheck: 'false', autocomplete: 'off', 'aria-label': `${label}, type a value`, title: 'Type a value' });
  let editing = false, cancel = false;
  const pctFmt = /%/.test(String(fmt(spec.max)));
  const paint = () => {
    const v = get();
    input.value = v;
    if (!editing) val.value = fmt(v);
    input.style.setProperty('--p', `${clamp(((v - spec.min) / (spec.max - spec.min)) * 100, 0, 100)}%`);
  };
  const changed = (commit) => { if (opts.local) opts.after?.(); else onEdit(commit, opts.structural); };
  input.addEventListener('input', () => { set(parseFloat(input.value)); paint(); changed(false); });
  input.addEventListener('change', () => { if (!opts.local) onEdit(true); });
  val.addEventListener('focus', () => {
    editing = true; cancel = false;
    const v = get();
    val.value = pctFmt ? `${+(v * 100).toFixed(2)}` : `${+(+v).toFixed(2)}`;
    val.select();
  });
  val.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); val.blur(); }
    else if (e.key === 'Escape') { cancel = true; val.blur(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const v = clamp(get() + (e.key === 'ArrowUp' ? 1 : -1) * spec.step * (e.shiftKey ? 10 : 1), spec.min, spec.max);
      set(snapTyped(v, spec)); editing = false; paint(); editing = true;
      val.value = pctFmt ? `${+(get() * 100).toFixed(2)}` : `${+(+get()).toFixed(2)}`;
      changed(true);
    }
  });
  val.addEventListener('blur', () => {
    editing = false;
    const v = cancel ? null : parseTyped(val.value, spec);
    if (v == null || !Number.isFinite(v)) { paint(); return; }
    const c = snapTyped(clamp(v, spec.min, spec.max), spec);
    if (Math.abs(c - v) > 1e-6 && (v < spec.min || v > spec.max)) toast(`${label}: kept within ${fmt(spec.min)} and ${fmt(spec.max)}`);
    if (c !== get()) { set(c); paint(); changed(true); } else paint();
  });
  paint();
  return h('div', { class: 'ctl' }, h('label', { for: id }, label), val, input);
}
function chipsCtl(label, options, get, set, opts = {}) {
  const wrap = h('div', { class: 'chips', role: 'group', 'aria-label': label });
  const paint = () => wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === String(get())));
  for (const o of options) {
    wrap.append(h('button', { class: 'chip', 'data-v': String(o.value), type: 'button', title: o.title || null, onclick: () => { set(o.value); paint(); if (opts.local) opts.after?.(); else onEdit(true, opts.structural); } }, o.label));
  }
  paint();
  return label ? h('div', { class: 'group', style: 'gap:8px' }, h('span', { class: 'eyebrow' }, label), wrap) : wrap;
}
function switchCtl(id, label, get, set, opts = {}) {
  const input = h('input', { type: 'checkbox', id, role: 'switch', disabled: opts.disabled || false });
  input.checked = !!get();
  input.addEventListener('change', () => { set(input.checked); if (opts.local) opts.after?.(); else onEdit(true, opts.structural); });
  return h('div', { class: 'row-ctl' }, h('label', { for: id }, label), h('span', { class: 'switch' }, input, h('i')));
}
// a group whose head carries one action on the right
const groupAct = (title, sub, act, ...kids) => foldable(h('div', { class: 'group' }, h('div', { class: 'group-head act' }, h('h3', {}, title), act, sub ? h('p', {}, sub) : null), ...kids), title);
const group = (title, sub, ...kids) => foldable(h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', {}, title), sub ? h('p', {}, sub) : null), ...kids), title);
// In 2.0 every section of the inspector folds away from its heading, and stays folded.
const folded = new Set(store.get('weft.folded', []));
function foldable(el, title) {
  if (UI !== 'v2' || typeof title !== 'string') return el;
  const head = el.querySelector('.group-head h3');
  const set = (on) => { el.classList.toggle('collapsed', on); head.setAttribute('aria-expanded', !on); };
  head.tabIndex = 0;
  head.setAttribute('role', 'button');
  head.title = 'Fold or unfold this section';
  set(folded.has(title));
  const flip = () => {
    const on = !el.classList.contains('collapsed');
    set(on);
    if (on) folded.add(title); else folded.delete(title);
    store.set('weft.folded', [...folded]);
  };
  head.addEventListener('click', flip);
  head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  return el;
}

// ---------- 01 object
function renderObject() {
  const d = state.design, X = d.extras;
  const pane = $('#pane-object');
  const cards = h('div', { class: 'objects', role: 'group', 'aria-label': 'Object type' });
  for (const [k, o] of Object.entries(OBJECTS)) {
    cards.append(h('button', { class: 'obj', type: 'button', 'aria-pressed': d.object === k, title: o.blurb, onclick: () => switchObject(k) },
      h('svg', { viewBox: '0 0 40 40', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: ICONS[k] }),
      h('b', {}, o.label), h('small', {}, o.blurb)));
  }
  const opts = [];
  if (d.object === 'planter') {
    if (X.base !== 'insert') opts.push(sliderCtl('x-drain', 'Drainage hole', { min: 0, max: 30, step: 1, fmt: (v) => (v ? `Ø ${v} mm` : 'none') }, () => X.drain, (v) => { X.drain = v; }));
    opts.push(chipsCtl('Base', [{ value: 'none', label: 'None' }, { value: 'saucer', label: 'Saucer' }, { value: 'sleeve', label: 'Two-tone sleeve' }, { value: 'insert', label: 'Self-watering' }], () => X.base, (v) => { X.base = v; }, { structural: true }));
    if (X.base === 'insert') {
      opts.push(sliderCtl('x-res', 'Water reservoir height', { min: 6, max: 60, step: 1, fmt: mm }, () => X.reservoir ?? 14, (v) => { X.reservoir = v; }));
      opts.push(switchCtl('x-slots', 'Water slots in the insert', () => X.slots !== false, (v) => { X.slots = v; }));
      opts.push(h('p', { class: 'note' }, 'An inner pot hangs from the rim and reaches down into a water reservoir. Pour water down the channel at the side: slots round the insert\'s foot let it drain down and let the soil drink it back up. A cotton wick through the floor hole works too. The outer pot has no drainage hole.'));
    }
    if (X.base === 'sleeve') {
      opts.push(sliderCtl('x-sleeveH', 'Sleeve height', { min: 0.2, max: 0.7, step: 0.01, fmt: pct }, () => X.sleeveH, (v) => { X.sleeveH = v; }));
      opts.push(sliderCtl('x-tilt', 'Sleeve tilt', { min: 0, max: 60, step: 1, fmt: (v) => (v ? `${v} mm` : 'level') }, () => X.sleeveTilt, (v) => { X.sleeveTilt = v; }));
    }
    if (X.base !== 'none') opts.push(sliderCtl('x-gap', X.base === 'insert' ? 'Gap between insert and pot' : 'Clearance around the pot', { min: 0.4, max: 4, step: 0.1, fmt: mm1 }, () => X.gap, (v) => { X.gap = v; }));
  }
  if (d.object === 'box') {
    opts.push(switchCtl('x-lid', 'Lid', () => X.lid, (v) => { X.lid = v; }, { structural: true }));
    if (X.lid) {
      opts.push(chipsCtl('Knob', [{ value: 'ball', label: 'Ball' }, { value: 'disc', label: 'Disc' }, { value: 'none', label: 'None' }], () => X.knob, (v) => { X.knob = v; }, { structural: true }));
      if (X.knob !== 'none') opts.push(sliderCtl('x-knob', 'Knob size', { min: 16, max: 44, step: 1, fmt: (v) => `Ø ${v} mm` }, () => X.knobSize, (v) => { X.knobSize = v; }));
      opts.push(sliderCtl('x-plug', 'Lid plug depth', { min: 4, max: 14, step: 0.5, fmt: mm1 }, () => X.plugDepth, (v) => { X.plugDepth = v; }));
      opts.push(sliderCtl('x-fit', 'Lid clearance', { min: 0.15, max: 0.8, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm` }, () => X.clearance, (v) => { X.clearance = v; }));
      opts.push(sliderCtl('x-over', 'Lid overhang', { min: 0, max: 4, step: 0.1, fmt: mm1 }, () => X.lidOverhang, (v) => { X.lidOverhang = v; }));
    }
  }
  if (d.object === 'pendant') {
    opts.push(chipsCtl('Socket', [{ value: 40, label: 'E27 · Ø 40', title: 'E27 lamp holder with shade ring' }, { value: 29, label: 'E14 · Ø 29' }, { value: 42, label: 'E27 + ring · Ø 42' }], () => X.socket, (v) => { X.socket = v; }, { structural: true }));
    opts.push(sliderCtl('x-socket', 'Socket hole', { min: 20, max: 60, step: 0.5, fmt: (v) => `Ø ${v} mm` }, () => X.socket, (v) => { X.socket = v; }));
    opts.push(h('p', { class: 'note' }, 'Prints crown-down on the plate. Use LED bulbs of 10 W or less.'));
  }
  if (d.object === 'lamp') {
    opts.push(chipsCtl('Socket', [{ value: 40, label: 'E27 · Ø 40' }, { value: 42, label: 'E27 + ring · Ø 42' }, { value: 29, label: 'E14 · Ø 29' }], () => X.socket, (v) => { X.socket = v; }, { structural: true }));
    opts.push(sliderCtl('x-lsocket', 'Socket hole', { min: 20, max: 60, step: 0.5, fmt: (v) => `Ø ${v} mm` }, () => X.socket, (v) => { X.socket = v; }));
    opts.push(sliderCtl('x-baseH', 'Base height', { min: 30, max: 120, step: 1, fmt: mm }, () => X.baseH ?? 55, (v) => { X.baseH = v; }));
    opts.push(switchCtl('x-cord', 'Notch for the cord', () => X.cord !== false, (v) => { X.cord = v; }));
    opts.push(h('p', { class: 'note' }, 'For an E27 lamp kit (socket with a cord): the socket clips into the hole in the base, the shade stands in a groove around it and lifts off to change the bulb. The base prints top-down. LED bulbs only.'));
  }
  if (d.object === 'globe') {
    opts.push(chipsCtl('Socket', [{ value: 40, label: 'E27 · Ø 40' }, { value: 42, label: 'E27 + ring · Ø 42' }, { value: 29, label: 'E14 · Ø 29' }], () => X.socket, (v) => { X.socket = v; }, { structural: true }));
    opts.push(sliderCtl('x-gsocket', 'Socket hole', { min: 20, max: 60, step: 0.5, fmt: (v) => `Ø ${v} mm` }, () => X.socket, (v) => { X.socket = v; }));
    opts.push(sliderCtl('x-gbaseH', 'Base height', { min: 30, max: 120, step: 1, fmt: mm }, () => X.baseH ?? 45, (v) => { X.baseH = v; }));
    opts.push(switchCtl('x-gcord', 'Notch for the cord', () => X.cord !== false, (v) => { X.cord = v; }));
    opts.push(h('p', { class: 'note' }, 'For an E27 lamp kit (socket with a cord): the socket clips into the hole in the base, and the globe stands in a groove round it and lifts off to change the bulb. A closed globe keeps the heat in: LED bulbs only, 7 W or less.'));
  }
  if (hasLight(d.object) && d.object !== 'candle') {
    opts.push(h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: downloadGlowTest }, 'Download the glow test')));
    opts.push(h('p', { class: 'note' }, `A small curved strip whose wall steps from ${GLOW_STEPS.length > 1 ? `${GLOW_STEPS[0]} mm (one line) to ${GLOW_STEPS[GLOW_STEPS.length - 1]} mm` : ''}, about 6 g. Print it in your translucent filament and stand it over a phone torch or an LED tealight: pick the thinnest step that still hides the light source.`));
  }
  if (d.object === 'vase') {
    opts.push(switchCtl('x-vasemode', 'Solid body for spiral vase mode', () => X.vaseMode, (v) => { X.vaseMode = v; }, { structural: true }));
    opts.push(h('p', { class: 'note' }, 'A solid body lets the slicer print one continuous spiral wall: fast, seamless, and very light. Turn it off to print real walls and a floor.'));
  }
  // a plant stand: planters, orchid pots and vases
  if (d.object === 'planter' || d.object === 'orchid' || d.object === 'vase') {
    const st = X.stand || 'none';
    opts.push(chipsCtl('Stand', [{ value: 'none', label: 'None' }, { value: 'mid', label: 'Mid-century' }, { value: 'upright', label: 'Upright' }, { value: 'wide', label: 'Wide' }], () => st, (v) => { X.stand = v; }, { structural: true }));
    if (st !== 'none') {
      opts.push(sliderCtl('x-standLift', 'Height under the pot', { min: 30, max: 250, step: 1, fmt: mm }, () => X.standLift ?? 70, (v) => { X.standLift = v; }));
      opts.push(sliderCtl('x-standHug', 'Legs up the side', { min: 0.1, max: 0.7, step: 0.01, fmt: pct }, () => X.standHug ?? 0.35, (v) => { X.standHug = v; }));
      opts.push(sliderCtl('x-standLeg', 'Leg thickness', { min: 8, max: 24, step: 0.5, fmt: mm1 }, () => X.standLeg ?? 12, (v) => { X.standLeg = v; }));
      opts.push(h('p', { class: 'note' }, 'Two flat pieces that print lying down, with no supports, and slot together into a cross. The pot rests on the crossbars and the legs rise up its sides. Print them in a second colour.'));
    }
  }
  if (d.object === 'hanging') {
    opts.push(chipsCtl('Cords', [{ value: 3, label: '3 cords' }, { value: 4, label: '4 cords' }], () => X.hangers ?? 3, (v) => { X.hangers = v; }));
    opts.push(sliderCtl('x-hdrain', 'Drainage hole', { min: 0, max: 20, step: 1, fmt: (v) => (v ? `Ø ${v} mm` : 'none') }, () => X.drain, (v) => { X.drain = v; }));
    opts.push(h('p', { class: 'note' }, 'Teardrop holes under the rim take cords, chains or macramé up to Ø 4 mm; they print without support. Without a drainage hole it never drips, so water sparingly.'));
  }
  if (d.object === 'wall') {
    opts.push(chipsCtl('Style', [{ value: 'round', label: 'Rounded', title: 'A D shape with any silhouette and pattern' }, { value: 'facet', label: 'Faceted', title: 'A cube stood on its corner and halved by the wall' }], () => X.wallStyle || 'round', (v) => { X.wallStyle = v; }, { structural: true }));
  }
  if (isFacet(d)) {
    opts.push(h('p', { class: 'note' }, 'A cube stood on its corner and halved by the wall: a diamond face in front, crisp facets all round, and a flat back with a keyhole for one screw (head up to 8 mm). Shape it under Form. Every face keeps within 45°, so it prints upright with no supports, on a small foot cut off the lowest corner. No drainage hole: water sparingly, or stand a nursery pot inside.'));
  } else if (d.object === 'wall') {
    opts.push(sliderCtl('x-back', 'Depth from the wall', { min: 0.1, max: 0.6, step: 0.01, fmt: (v) => `${Math.round((d.form.diameter / 2) * (1 + v))} mm` }, () => X.back ?? 0.3, (v) => { X.back = v; }));
    opts.push(sliderCtl('x-wdrain', 'Drainage hole', { min: 0, max: 20, step: 1, fmt: (v) => (v ? `Ø ${v} mm` : 'none') }, () => X.drain, (v) => { X.drain = v; }));
    opts.push(h('p', { class: 'note' }, 'The back is flat and plain, with a keyhole for one screw (head up to 8 mm). The cross-section is always the D shape, and it does not twist.'));
  }
  if (d.object === 'orchid') {
    opts.push(sliderCtl('x-odrain', 'Drainage hole', { min: 0, max: 30, step: 1, fmt: (v) => (v ? `Ø ${v} mm` : 'none') }, () => X.drain, (v) => { X.drain = v; }));
    opts.push(chipsCtl('Base', [{ value: 'none', label: 'None' }, { value: 'saucer', label: 'Saucer' }], () => (X.base === 'saucer' ? 'saucer' : 'none'), (v) => { X.base = v; }, { structural: true }));
    if (X.base === 'saucer') opts.push(sliderCtl('x-ogap', 'Clearance around the pot', { min: 0.4, max: 4, step: 0.1, fmt: mm1 }, () => X.gap, (v) => { X.gap = v; }));
    opts.push(h('p', { class: 'note' }, 'Orchids grow in bark and like air at their roots, so the walls can be cut right through. Keep a plain band at the bottom so the bark stays in.'));
  }
  if (d.object === 'candle') {
    opts.push(chipsCtl('Candle', [{ value: 'tealight', label: 'Tealight · Ø 40' }, { value: 'maxi', label: 'Maxi tealight · Ø 60' }, { value: 'taper', label: 'Taper candle · Ø 22' }], () => X.candle || 'tealight', (v) => { X.candle = v; }));
    opts.push(h('p', { class: 'note' }, 'The candle sits in a pocket in the very top, just its own height deep; everything below is the base, so shape it however you like in Form and Surface. It prints solid with infill. Use LED candles, or put a real one in a glass or metal cup.'));
  }
  if (d.object === 'lantern') opts.push(h('p', { class: 'note' }, 'A cover for an LED tealight: openwork lets the light out, and the light switch above shows the glow. Never use a real flame in a printed lantern.'));
  if (d.object === 'tray') opts.push(h('p', { class: 'note' }, 'A low dish for keys, rings, coins or a soap bar. Bold textures look great on the low wall.'));
  if (d.object === 'ring') opts.push(h('p', { class: 'note' }, 'Open at both ends: napkin rings (Ø 45–55 mm), bangles (Ø 65–75 mm inside), candle sleeves or a cover for a glass. It prints upright with no floor.'));
  if (d.object === 'cup') opts.push(h('p', { class: 'note' }, 'Cups and holders can be cut right through: pen cups, utensil holders, plant-pot covers and tealight sleeves (use LED tealights).'));
  if (OBJECTS[d.object].watertight) opts.push(h('p', { class: 'lock-note', html: `${LOCK_SVG}<span>${OBJECTS[d.object].label}s hold soil and water, so surfaces are raised from a solid wall. Openwork is available for bowls, trays, boxes, cups, rings, orchid pots, lanterns and lamps.</span>` }));
  if (d.object === 'bowl') opts.push(h('p', { class: 'note' }, 'Bowls print upright. Keep the widest point above two thirds of the height for a gentle flare.'));
  pane.replaceChildren(group('What are you making?', null, cards), group(`${OBJECTS[d.object].label} options`, null, ...opts));
}

function switchObject(k) {
  const d = state.design;
  if (d.object === k) return;
  const oldD = d.form.diameter;
  d.object = k;
  Object.assign(d.form, OBJECT_DEFAULTS[k].form);
  Object.assign(d.extras, OBJECT_DEFAULTS[k].extras);
  if (k !== 'hanging' && k !== 'wall') d.form.bottom = 'flat';
  // low pieces need slim plain bands, or the pattern has no room
  if (OBJECT_DEFAULTS[k].surface) Object.assign(d.surface, OBJECT_DEFAULTS[k].surface);
  // a globe glows through its wall: it starts in a light, translucent filament
  if (OBJECT_DEFAULTS[k].finish) Object.assign(d.finish, OBJECT_DEFAULTS[k].finish);
  rescaleCount(oldD, d.form.diameter);
  const opens = OBJECTS[k].lamp && !OBJECTS[k].globe;
  if (opens && d.surface.mode === 'relief' && d.surface.pattern !== 'smooth' && PATTERNS[d.surface.pattern].modes.includes('cut')) d.surface.mode = 'cut';
  // a light needs openings: a relief-only texture becomes perforation (a globe glows through its wall instead)
  if (opens && !PATTERNS[d.surface.pattern].modes.includes('cut') && d.surface.pattern !== 'smooth') {
    const S = d.surface, P = PATTERNS.perforated;
    Object.assign(S, P.def, { pattern: 'perforated', mode: 'cut', swirl: 0, bandBottom: Math.max(S.bandBottom, 6), bandTop: Math.max(S.bandTop, 4) });
    S.count = clamp(Math.round((Math.PI * d.form.diameter) / P.cellMM), 4, 110);
  }
  keepWatertight();
  rename();
  lastObjectKey = '';
  onEdit(true, true);
}
// Planters and vases keep a solid wall: openwork turns into relief, cut-only patterns into basket weave.
function keepWatertight() {
  const d = state.design, S = d.surface;
  if (!OBJECTS[d.object].watertight || S.pattern === 'smooth') return;
  if (!PATTERNS[S.pattern].modes.includes('relief')) { S.pattern = 'weave'; Object.assign(S, PATTERNS.weave.def); S.count = clamp(Math.round((Math.PI * d.form.diameter) / PATTERNS.weave.cellMM), 3, 120); }
  if (S.mode === 'cut') {
    // relief settings that read well and stay printable, rather than the openwork ones
    const def = PATTERNS[S.pattern].def;
    S.mode = 'relief';
    S.depth = Math.min(def.depth ?? 2, 3);
    if (def.fill != null) S.fill = def.fill;
    S.profile = def.profile === 'round' ? 'soft' : def.profile || 'soft';
    S.bandBottom = Math.min(S.bandBottom, 2); S.bandTop = Math.min(S.bandTop, 3);
  }
}
// size the name field to its text so the dice sits right beside it
const nameMeasure = document.createElement('canvas').getContext('2d');
function fitName() {
  const i = $('#design-name');
  nameMeasure.font = getComputedStyle(i).font;
  i.style.width = `${Math.ceil(nameMeasure.measureText(i.value || 'Untitled').width) + 10}px`;
}
document.fonts?.ready?.then(fitName);
const LOCK_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M10 2.5c3 3.5 5.5 6.6 5.5 9.6a5.5 5.5 0 01-11 0c0-3 2.5-6.1 5.5-9.6z"/></svg>';
function rescaleCount(oldD, newD) {
  const S = state.design.surface;
  if (S.pattern === 'waves' || S.pattern === 'smooth') return;
  S.count = clamp(Math.round((S.count * newD) / oldD), 3, 120);
}

// ---------- 02 form
function renderForm() {
  const d = state.design, F = d.form;
  const pend = d.object === 'pendant';
  const pane = $('#pane-form');
  const sil = h('div', { class: 'chips', role: 'group', 'aria-label': 'Silhouette' });
  for (const [k, s] of Object.entries(SILHOUETTES)) {
    const on = Math.abs(F.base - s.base) < 0.015 && Math.abs(F.top - s.top) < 0.015 && Math.abs(F.belly - s.belly) < 0.015 && Math.abs(F.fullness - s.fullness) < 0.02 && Math.abs((F.lip || 0) - (s.lip || 0)) < 0.5;
    sil.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': on, onclick: () => { Object.assign(F, { base: s.base, top: s.top, belly: s.belly, fullness: s.fullness, lip: s.lip || 0, lipH: s.lipH || F.lipH }); onEdit(true, true); } }, s.label));
  }
  const wallObj = d.object === 'wall';
  const sec = wallObj ? 'flatback' : F.section || 'round';
  const secKids = wallObj ? [h('p', { class: 'note' }, 'A D shape with a flat back against the wall. Set its depth under Object.')]
    : [chipsCtl('', [{ value: 'round', label: 'Round' }, { value: 'polygon', label: 'Polygon' }, { value: 'lobed', label: 'Lobed' }], () => sec, (v) => { F.section = v; }, { structural: true })];
  if (sec === 'polygon') {
    secKids.push(sliderCtl('f-sides', 'Sides', { min: 3, max: 12, step: 1, fmt: (v) => `${v}` }, () => F.sides ?? 6, (v) => { F.sides = v; }));
    secKids.push(sliderCtl('f-corner', 'Corner rounding', { min: 0.03, max: 0.6, step: 0.01, fmt: pct }, () => F.corner ?? 0.18, (v) => { F.corner = v; }));
  }
  if (sec === 'lobed') {
    secKids.push(sliderCtl('f-lobes', 'Lobes', { min: 3, max: 16, step: 1, fmt: (v) => `${v}` }, () => F.lobes ?? 8, (v) => { F.lobes = v; }));
    secKids.push(sliderCtl('f-lobeDepth', 'Lobe depth', { min: 0.02, max: 0.3, step: 0.01, fmt: pct }, () => F.lobeDepth ?? 0.1, (v) => { F.lobeDepth = v; }));
    secKids.push(chipsCtl('Lobe shape', [{ value: 'scallop', label: 'Scallop' }, { value: 'wave', label: 'Wave' }], () => F.lobeStyle || 'scallop', (v) => { F.lobeStyle = v; }));
  }
  if (!wallObj) secKids.push(sliderCtl('f-twist', 'Twist over the height', { min: -180, max: 180, step: 1, fmt: (v) => (v ? `${v}°` : 'none') }, () => F.twist || 0, (v) => { F.twist = v; }));
  const sz = { min: 40, max: 320, step: 1, fmt: (v) => `${v} mm` };
  if (d.object === 'globe') { pane.replaceChildren(...globeForm(d, secKids, sz)); return; }
  if (isFacet(d)) { pane.replaceChildren(...facetForm(d)); return; }
  pane.replaceChildren(...[
    groupAct('Silhouette', pend ? 'Shown hanging; printed crown-down' : null, diceBtn('shape', 'Shape'), sil,
      switchCtl('f-handles', 'Drag points on the model', () => state.handles, (v) => setHandles(v), { local: true }),
      h('p', { class: 'note' }, 'Drag the rim, widest point, curve and base right on the 3D view. Works on every object.')),
    d.object === 'hanging' || d.object === 'wall' ? group('Bottom', null,
      chipsCtl('', [{ value: 'flat', label: 'Flat' }, { value: 'round', label: 'Rounded' }], () => F.bottom || 'flat', (v) => { F.bottom = v; }, { structural: true }),
      h('p', { class: 'note' }, F.bottom === 'round' ? 'The shape carries on down and closes at 40°, onto a small foot it prints on (use a brim). The texture fades out where it narrows.' : 'A flat base it can stand on.')) : null,
    group('Cross-section', 'The outline seen from above', ...secKids),
    group('Size', null,
      sliderCtl('f-height', 'Height', { ...sz, min: d.object === 'ring' || d.object === 'tray' ? 12 : 30 }, () => F.height, (v) => { F.height = v; }),
      sliderCtl('f-diam', wallObj ? 'Widest width' : 'Widest diameter', { ...sz, min: d.object === 'ring' ? 30 : 40 }, () => F.diameter, (v) => { rescaleCount(F.diameter, v); F.diameter = v; })),
    group('Shape', null,
      sliderCtl('f-base', pend ? 'Crown width' : 'Base width', { min: 0.3, max: 1.6, step: 0.01, fmt: pct }, () => F.base, (v) => { F.base = v; }),
      sliderCtl('f-top', pend ? 'Opening width' : 'Rim width', { min: 0.3, max: 1.6, step: 0.01, fmt: pct }, () => F.top, (v) => { F.top = v; }),
      sliderCtl('f-belly', 'Widest point', { min: 0.15, max: 0.85, step: 0.01, fmt: (v) => `${pct(v)} up` }, () => F.belly, (v) => { F.belly = v; }),
      sliderCtl('f-full', 'Fullness', { min: -0.5, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) }, () => F.fullness, (v) => { F.fullness = v; }),
      sliderCtl('f-lip', pend ? 'Opening flare' : 'Lip flare', { min: -15, max: 20, step: 0.5, fmt: (v) => (v ? `${v > 0 ? '+' : ''}${v} mm` : 'none') }, () => F.lip, (v) => { F.lip = v; }),
      sliderCtl('f-lipH', 'Flare height', { min: 4, max: 60, step: 1, fmt: (v) => `${v} mm` }, () => F.lipH, (v) => { F.lipH = v; }),
      sliderCtl('f-inset', pend ? 'Crown chamfer' : 'Base chamfer', { min: 0, max: 5, step: 0.1, fmt: (v) => (v ? mm1(v) : 'none') }, () => F.inset, (v) => { F.inset = v; })),
    rimGroup(d),
    group('Walls', null,
      sliderCtl('f-wall', 'Wall thickness', { min: 0.8, max: 6, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm` }, () => F.wall, (v) => { F.wall = v; }),
      sliderCtl('f-floor', pend ? 'Crown plate' : 'Floor', { min: 1.2, max: 6, step: 0.1, fmt: mm1 }, () => F.floor, (v) => { F.floor = v; }),
      switchCtl('f-printable', 'Keep walls under 45° overhang', () => F.printable !== false, (v) => { F.printable = v; }),
      h('p', { class: 'note' }, 'Eases steep curves just enough that the silhouette prints without supports.')),
  ].filter(Boolean));
}

// A globe is a ball on a collar: its top and underside are round, or 45° so they print without supports.
function globeForm(d, secKids, sz) {
  const F = d.form, X = d.extras;
  const top = X.globeTop || 'round', under = X.globeUnder || 'round';
  const supports = top === 'round' || under === 'round';
  return [
    group('Globe', 'A closed ball on a short collar that stands in the base',
      chipsCtl('Top', [{ value: 'round', label: 'Round', title: 'A true ball: needs supports inside while it prints' }, { value: 'peak', label: 'Peak', title: 'Rises to a 45° point: prints without supports' }], () => top, (v) => { X.globeTop = v; }, { structural: true }),
      chipsCtl('Underside', [{ value: 'round', label: 'Round', title: 'A true ball: needs supports round the collar' }, { value: 'cone', label: 'Cone', title: 'A 45° cone from the collar: prints without supports' }], () => under, (v) => { X.globeUnder = v; }, { structural: true }),
      sliderCtl('x-opening', 'Opening', { min: 50, max: 180, step: 1, fmt: (v) => `Ø ${v} mm` }, () => X.opening ?? 92, (v) => { X.opening = v; }),
      h('p', { class: `note${supports ? ' warn-note' : ''}` }, supports
        ? `A closed globe leans past 45° ${top === 'round' && under === 'round' ? 'at the top and underneath' : top === 'round' ? 'at the top' : 'underneath'}, so it needs supports: tree supports on the build plate only. Peak and Cone print without any.`
        : 'Peak top and cone underside stay within 45°: it prints without supports.'),
      h('p', { class: 'note' }, 'The opening is the collar it stands on in the base. Keep it at least Ø 70 mm to lift the globe over an A60 bulb.')),
    group('Size', 'Make Height and Diameter equal for a round ball, or stretch it into an egg or a flattened orb',
      sliderCtl('f-height', 'Height', { ...sz, min: 80 }, () => F.height, (v) => { F.height = v; }),
      sliderCtl('f-diam', 'Diameter', { ...sz, min: 80 }, () => F.diameter, (v) => { rescaleCount(F.diameter, v); F.diameter = v; })),
    group('Cross-section', 'Round for a ball; lobes make a melon, corners a faceted lantern', ...secKids),
    group('Wall', null,
      sliderCtl('f-wall', 'Wall thickness', { min: 0.8, max: 4, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm · ${Math.max(1, Math.round(v / 0.44))} lines` }, () => F.wall, (v) => { F.wall = v; }),
      h('p', { class: 'note' }, 'With translucent filament: 2 lines (about 0.9 mm) is brightest but shows the bulb as a bright spot; 3 to 4 lines (1.3 to 1.8 mm) glows evenly; 3 mm and more is soft but noticeably dimmer. Light colours let more through than deep ones. Print the glow test under Object to see yours.')),
  ];
}

// A faceted wall planter: width, tilt, depth and where the rim cuts it.
function facetForm(d) {
  const F = d.form, X = d.extras, info = facetedWall(F, X);
  const sizeNote = `${Math.round(info.W)} mm wide, ${Math.round(info.height)} mm tall and ${Math.round(info.depth)} mm out from the wall.`;
  return [
    group('Facets', 'A square stood on its corner, tilted to face a little downward',
      sliderCtl('x-ftilt', 'Tilt', { min: 5, max: 44, step: 1, fmt: (v) => `${v}°` }, () => X.facetTilt ?? 35, (v) => { X.facetTilt = v; }),
      sliderCtl('x-fstretch', 'Diamond', { min: 0.7, max: 1.6, step: 0.01, fmt: (v) => (Math.abs(v - 1) < 0.005 ? 'square' : `${(+v).toFixed(2)}×`) }, () => X.facetStretch ?? 1, (v) => { X.facetStretch = v; }),
      sliderCtl('x-fdepth', 'Depth', { min: 0.6, max: 1.4, step: 0.01, fmt: (v) => (Math.abs(v - 1) < 0.005 ? 'level' : pct(v)) }, () => X.facetDepth ?? 1, (v) => { X.facetDepth = v; }),
      sliderCtl('x-frim', 'Rim', { min: -40, max: 40, step: 1, fmt: (v) => (v ? `${v > 0 ? '+' : ''}${v} mm` : 'corner') }, () => X.facetRim ?? 0, (v) => { X.facetRim = v; }),
      h('p', { class: 'note' }, 'Tilt leans the front face down; at 35° with a square diamond the whole thing is a cube on its corner. Diamond makes the front face taller than it is wide (above 1×) or wider (below). Depth sets how far it reaches out: at "level" the front\'s top corner sits level with the side corners at the wall, like the classic geometric planter. Rim raises or lowers the opening from that top corner.')),
    group('Size', sizeNote,
      sliderCtl('f-diam', 'Width', { min: 80, max: 260, step: 1, fmt: (v) => `${v} mm` }, () => F.diameter, (v) => { F.diameter = v; })),
    group('Walls', null,
      sliderCtl('f-wall', 'Wall thickness', { min: 1.2, max: 6, step: 0.05, fmt: (v) => `${v.toFixed(2)} mm` }, () => F.wall, (v) => { F.wall = v; }),
      h('p', { class: 'note' }, 'The back wall is at least 3 mm, for the keyhole.')),
  ];
}

// The top edge: a profile (round, bevel, rolled lip) and a line (level, wavy, slanted).
function rimGroup(d) {
  const F = d.form, X = d.extras;
  const pend = d.object === 'pendant';
  const title = pend ? 'Opening edge' : 'Rim';
  if (d.object === 'vase' && X.vaseMode) return group(title, null, h('p', { class: 'note' }, 'Spiral vase mode prints the rim as one open wall. Turn off the solid body in Object to shape the rim.'));
  const lid = d.object === 'box' && X.lid;
  const shape = lid ? 'level' : F.rimShape || 'level';
  const kids = [
    chipsCtl('Edge', [{ value: 'flat', label: 'Square' }, { value: 'round', label: 'Rounded' }, { value: 'bevel', label: 'Bevel' }, { value: 'rolled', label: 'Rolled lip' }], () => F.rimEdge || 'flat', (v) => { F.rimEdge = v; }),
    lid ? h('p', { class: 'note' }, 'The rim stays level so the lid sits flat.')
      : chipsCtl('Line', [{ value: 'level', label: 'Level' }, { value: 'wavy', label: 'Wavy' }, { value: 'slant', label: 'Slanted' }], () => shape, (v) => { F.rimShape = v; }, { structural: true }),
  ];
  // napkin rings are open at both ends: the edge can go on both, and the inside can be chamfered
  if (d.object === 'ring') {
    kids.push(switchCtl('x-edgeBoth', 'Same edge at the bottom', () => X.edgeBoth !== false, (v) => { X.edgeBoth = v; }));
    kids.push(sliderCtl('x-innerChamfer', 'Inside chamfer', { min: 0, max: 2.5, step: 0.1, fmt: (v) => (v ? mm1(v) : 'none') }, () => X.innerChamfer || 0, (v) => { X.innerChamfer = v; }));
    kids.push(h('p', { class: 'note' }, 'At the bottom, curves that would hang out over the bed turn into 45° chamfers, so both ends print without supports.'));
  }
  if (shape === 'wavy') kids.push(sliderCtl('f-rimWaves', 'Waves', { min: 2, max: 16, step: 1, fmt: (v) => `${v}` }, () => F.rimWaves || 6, (v) => { F.rimWaves = v; }));
  if (shape !== 'level') kids.push(sliderCtl('f-rimDepth', shape === 'wavy' ? 'Wave depth' : 'Slant drop', { min: 2, max: 60, step: 0.5, fmt: (v) => `${v} mm` }, () => F.rimDepth || 8, (v) => { F.rimDepth = v; }));
  return group(title, pend ? 'The bottom edge when hanging' : null, ...kids);
}

// ---------- 03 surface
const swatchCache = new Map();
function drawSwatch(cv, pid) {
  const P = PATTERNS[pid];
  const mode = P.modes[0];
  const S = { ...state.design.surface, ...P.def, pattern: pid, invert: false, round: P.def.round ?? 0.6, width: (P.def.width ?? 2) * 1.6, seed: 5 };
  const W = 64;
  cv.width = W; cv.height = W;
  const g = cv.getContext('2d');
  const ink = cssVar('--ink') || '#1b1c1a';
  let data = swatchCache.get(pid);
  if (!data) { data = swatch(S, mode, W, W); swatchCache.set(pid, data); }
  const img = g.createImageData(W, W);
  const c = new THREE.Color(ink);
  const ir = Math.round(c.r * 255), ig = Math.round(c.g * 255), ib = Math.round(c.b * 255);
  const dark = c.r + c.g + c.b < 1.5;
  let mx = 0.001;
  if (data.D) for (const v of data.D) mx = Math.max(mx, v);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const id = (W - 1 - y) * W + x, o = (y * W + x) * 4;
    let a = 0, shade = 1;
    if (mode === 'cut') a = data.F[id] > 0 ? 235 : 0;
    else if (data.D) {
      const hgt = data.D[id] / mx;
      const xr = (W - 1 - y) * W + Math.min(W - 1, x + 1), xl = (W - 1 - y) * W + Math.max(0, x - 1);
      const yu = Math.max(0, W - 2 - y) * W + x, yd = Math.min(W - 1, W - y) * W + x;
      const gx = (data.D[xr] - data.D[xl]) / mx, gy = (data.D[yu] - data.D[yd]) / mx;
      shade = clamp(0.5 - gx * 0.9 + gy * 0.9, 0, 1);
      a = 40 + hgt * 120 + shade * 70;
    }
    const k = dark ? 1 - (1 - shade) * 0.35 : 1;
    img.data[o] = ir * k; img.data[o + 1] = ig * k; img.data[o + 2] = ib * k; img.data[o + 3] = a;
  }
  g.putImageData(img, 0, 0);
}
function renderSurface() {
  const d = state.design, S = d.surface;
  const P = PATTERNS[S.pattern];
  const pane = $('#pane-surface');
  if (isFacet(d)) {
    pane.replaceChildren(group('Surface', null, h('p', { class: 'note' }, 'A faceted wall planter is all flat faces: its facets are the pattern, and light and shadow do the rest. For a textured wall planter, choose the Rounded style under Object.')));
    return;
  }
  const grid = h('div', { class: 'patterns', role: 'group', 'aria-label': 'Pattern' });
  const tight = !!OBJECTS[d.object].watertight;
  for (const [k, p] of Object.entries(PATTERNS)) {
    const cv = h('canvas', { width: 64, height: 64, 'aria-hidden': 'true' });
    const locked = tight && !p.modes.includes('relief') && !p.modes.includes('none');
    grid.append(h('button', { class: 'pat', type: 'button', 'aria-pressed': S.pattern === k, disabled: locked, title: locked ? 'Openwork only, so it would leak' : null, onclick: () => switchPattern(k) }, cv, p.label));
    requestAnimationFrame(() => drawSwatch(cv, k));
  }
  const kids = [groupAct('Pattern', null, diceBtn('surface', 'Surface'), grid)];
  if (P.modes.length > 1) {
    kids.push(h('div', { class: 'group' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Surface mode', style: 'justify-self:start' },
        ...P.modes.map((m) => h('button', { type: 'button', 'aria-pressed': S.mode === m, disabled: tight && m === 'cut', title: tight && m === 'cut' ? 'Would leak: this piece holds water' : null, onclick: () => { S.mode = m; onEdit(true, true); } }, m === 'cut' ? 'Openwork' : 'Relief'))),
      tight ? h('p', { class: 'lock-note', html: `${LOCK_SVG}<span>Openwork is locked: ${OBJECTS[d.object].label.toLowerCase()}s hold soil and water, so the pattern is raised from a solid wall.</span>` })
        : h('p', { class: 'note' }, S.mode === 'cut' ? 'Cut right through the wall: light, airy, and quick to print.' : 'Raised from a solid wall: watertight, so it holds soil, water or small things.')));
  }
  const mode = P.modes.includes(S.mode) ? S.mode : P.modes[0];
  if (mode !== S.mode) S.mode = mode;
  const ctls = [];
  for (const c of PATTERN_CONTROLS[S.pattern][mode] || []) {
    if (c === 'dish') {
      ctls.push(chipsCtl('Dimple shape', [{ value: 'round', label: 'Dished' }, { value: 'soft', label: 'Soft' }, { value: 'sharp', label: 'Faceted' }], () => S.profile, (v) => { S.profile = v; }));
    } else if (c === 'profile') {
      ctls.push(chipsCtl('Cross-section', [{ value: 'round', label: 'Round' }, { value: 'soft', label: 'Soft' }, { value: 'sharp', label: 'Sharp' }, { value: 'flat', label: 'Flat' }], () => S.profile, (v) => { S.profile = v; }));
    } else if (SURF_SWITCHES[c]) {
      const [key, label] = SURF_SWITCHES[c];
      ctls.push(switchCtl(`s-${c}`, label, () => !!S[key], (v) => { S[key] = v; }));
    } else if (c === 'seed') {
      ctls.push(h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => { S.seed = Math.floor(Math.random() * 9999); onEdit(true); } }, 'New random layout')));
    } else {
      const spec = SURF_SPECS[c];
      const key = spec.key || c;
      const label = c === 'count' ? P.count : spec.label;
      ctls.push(sliderCtl(`s-${c}`, label, spec, () => S[key], (v) => { S[key] = v; }));
    }
  }
  if (S.pattern !== 'smooth') {
    ctls.push(sliderCtl('s-swirl', SURF_SPECS.swirl.label, SURF_SPECS.swirl, () => S.swirl || 0, (v) => { S.swirl = v; }));
    if (mode === 'cut' && S.swirl) ctls.push(h('p', { class: 'note' }, 'Openwork turned by a swirl can lean past 45°; the stripes on the model show where.'));
  }
  if (ctls.length) kids.push(group(mode === 'cut' ? 'Openwork' : 'Relief', null, ...ctls));
  if (S.pattern !== 'smooth') {
    const bands = [
      sliderCtl('s-bandB', d.object === 'pendant' ? 'Plain band at the crown' : SURF_SPECS.bandBottom.label, SURF_SPECS.bandBottom, () => S.bandBottom, (v) => { S.bandBottom = v; }),
      sliderCtl('s-bandT', d.object === 'pendant' ? 'Plain band at the opening' : SURF_SPECS.bandTop.label, SURF_SPECS.bandTop, () => S.bandTop, (v) => { S.bandTop = v; }),
    ];
    if (mode === 'cut') {
      bands.push(chipsCtl('Band edge', [{ value: 'pattern', label: 'Follow the pattern' }, { value: 'straight', label: 'Straight' }], () => (S.edge === 'straight' ? 'straight' : 'pattern'), (v) => { S.edge = v; }));
    }
    kids.push(group('Bands', mode === 'cut' ? 'Solid rims that hold the shape' : null, ...bands));
  }
  pane.replaceChildren(...kids);
}
function switchPattern(k) {
  const d = state.design, S = d.surface, P = PATTERNS[k];
  if (S.pattern === k) return;
  S.pattern = k;
  Object.assign(S, P.def);
  if (P.cellMM) S.count = clamp(Math.round((Math.PI * d.form.diameter) / P.cellMM), 3, 120);
  if (!P.modes.includes(S.mode)) S.mode = P.modes[0];
  if (OBJECTS[d.object].lamp && !OBJECTS[d.object].globe && P.modes.includes('cut')) S.mode = 'cut';
  if (OBJECTS[d.object].watertight && P.modes.includes('relief')) S.mode = 'relief';
  if (S.mode === 'cut') { S.bandBottom = Math.max(S.bandBottom, 5); S.bandTop = Math.max(S.bandTop, 4); }
  onEdit(true, true);
}

// ---------- 04 finish
function renderFinish() {
  const d = state.design, F = d.finish;
  const pane = $('#pane-finish');
  const roles = [['color', state.result?.parts.find((p) => p.place.color === 0)?.label || 'Main part']];
  const hasSecond = state.result?.parts.some((p) => p.place.color === 1);
  const hasThird = state.result?.parts.some((p) => p.place.color === 2);
  if (hasSecond) roles.push(['color2', state.result.parts.find((p) => p.place.color === 1).label]);
  if (hasThird) roles.push(['color3', 'Lid and knob']);
  const mc = state.multicolor && bandsFor(d);
  multiUi = null;
  const groups = roles.map(([key, label], i) => (i === 0 ? groupAct : group)(mc && i === 0 ? `${label} · colour 1` : label, null,
    ...(i === 0 ? [diceBtn('colour', 'Colours')] : []), ...swatchRow(label, () => F[key], (c) => { F[key] = c; multiUi?.update(); })));
  const lightAfter = () => { saveLight(); applyLightSettings(); };
  pane.replaceChildren(...[
    ...groups,
    multiGroup(d),
    group('Material', 'Preview only', chipsCtl('', Object.entries(MATERIALS).map(([k, m]) => ({ value: k, label: m.label })), () => F.material, (v) => { F.material = v; }, { local: true, after: () => { refreshMaterials(); commitHistory(); } })),
    !hasLight(d.object) ? null : group('Light', OBJECTS[d.object].candle ? 'An LED candle glowing in it' : 'A bulb in the socket, shining through the shade',
      switchCtl('l-on', 'Light on', () => state.light.on, (v) => setLight(v), { local: true }),
      sliderCtl('l-bright', 'Brightness', { min: 0.2, max: 2.5, step: 0.05, fmt: pct }, () => state.light.bright, (v) => { state.light.bright = v; }, { local: true, after: lightAfter }),
      chipsCtl('Colour temperature', [{ value: 'candle', label: 'Candle' }, { value: 'warm', label: 'Warm' }, { value: 'neutral', label: 'Neutral' }, { value: 'daylight', label: 'Daylight' }], () => state.light.warm, (v) => { state.light.warm = v; }, { local: true, after: lightAfter }),
      switchCtl('l-bulb', OBJECTS[d.object].candle ? 'Show the tealight' : 'Show the bulb', () => state.light.bulb !== false, (v) => { state.light.bulb = v; }, { local: true, after: lightAfter }),
      h('p', { class: 'note' }, 'The light stays on while you keep designing, and this browser remembers it.')),
  ].filter(Boolean));
}
// A row of filament swatches plus a custom picker. Colour edits only repaint; nothing is rebuilt.
function swatchRow(label, get, set) {
  const wrap = h('div', { class: 'swatches', role: 'group', 'aria-label': `${label} colour` });
  const name = h('span', { class: 'sw-name' });
  const paint = () => {
    wrap.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.c === get()));
    const f = FILAMENTS.find(([, c]) => c === get());
    name.textContent = f ? f[0] : `Custom ${get()}`;
  };
  const after = () => { paint(); refreshMaterials(); syncMultiDots(); };
  for (const [n, c] of FILAMENTS) wrap.append(h('button', { class: 'sw', type: 'button', style: `--c:${c}`, 'data-c': c, title: n, 'aria-label': n, onclick: () => { set(c); after(); commitHistory(); } }));
  const custom = h('input', { type: 'color', value: get(), 'aria-label': `Custom ${label} colour`, style: 'width:30px;height:30px;border:0;padding:0;background:none' });
  custom.addEventListener('input', () => { set(custom.value); after(); });
  custom.addEventListener('change', commitHistory);
  wrap.append(custom);
  paint();
  return [wrap, name];
}
// Heights where the colour changes, snapped to layer lines the way the engine cuts them.
function colorChangeHeights(d) {
  const res = state.result;
  if (res?.info?.colorChanges?.length) return res.info.colorChanges;
  const rg = res?.parts.find((p) => p.regions)?.regions;
  if (rg) return rg.slice(1).map((r) => r.z0);
  return (bandsFor(d)?.cuts || []).map((c) => Math.round(c / 0.2) * 0.2);
}
function multiGroup(d) {
  if (!state.multicolor) {
    return group('Multicolor', 'Off',
      h('p', { class: 'note' }, 'Split the piece into colour bands for an AMS, MMU or a manual filament change. The switch lives in the top bar and stays put while you shuffle.'),
      h('button', { class: 'btn', type: 'button', onclick: () => setMulticolor(true) }, 'Turn on multicolor'));
  }
  const M = ensureMulti(d), n = slotsUsed(bandsFor(d));
  const relayout = () => { renderFinish(); rebuild(true); commitHistory(); syncMultiDots(); };
  const strip = h('div', { class: 'mc-strip', 'aria-hidden': 'true' });
  const sub = h('p', {}), note = h('p', { class: 'note' }), warn = h('p', { class: 'lock-note' });
  // the strip is the piece's elevation: base at the bottom, one block per band
  const update = () => {
    const bands = bandsFor(d), edges = [0, ...bands.cuts, d.form.height];
    strip.replaceChildren(...bands.slots.map((k, i) => h('i', { style: `flex:${Math.max(0.5, edges[i + 1] - edges[i])} 1 0;background:${slotColor(d, k)}` })));
    sub.textContent = `${n} colours in ${bands.slots.length} bands`;
    const heights = colorChangeHeights(d).map((z) => `${z.toFixed(1)} mm`).join(', ');
    note.textContent = d.object === 'vase' && d.extras.vaseMode && d.surface.mode !== 'cut'
      ? `Spiral vase mode keeps one wall, so the colour changes by height. Add a filament change in the slicer at ${heights}.`
      : `Every layer is one colour, cut at ${heights}. On an AMS or MMU the printer swaps only at those heights, with very little purge. On a single-colour printer, add a filament change (M600) at each height.`;
    const total = filamentList(d, state.result).length;
    warn.hidden = total <= 4;
    warn.innerHTML = `${LOCK_SVG}<span>This piece uses ${total} filaments in total. An AMS holds 4, so reuse a colour or print the extra parts on their own.</span>`;
  };
  multiUi = { update };
  const ctl = [chipsCtl('', MULTI_LAYOUTS.map(([value, label]) => ({ value, label })), () => M.layout, (v) => { M.layout = v; }, { local: true, after: relayout })];
  if (M.layout === 'split') ctl.push(sliderCtl('mc-split', 'Split height', { min: 0.15, max: 0.85, step: 0.01, fmt: (v) => `${Math.round(v * d.form.height)} mm` }, () => M.split ?? 0.42, (v) => { M.split = v; update(); }));
  if (M.layout === 'stripes') ctl.push(sliderCtl('mc-stripes', 'Bands', { min: 3, max: 11, step: 1, fmt: (v) => `${v} bands` }, () => M.stripes ?? 5, (v) => { M.stripes = v; update(); }));
  const rows = [];
  for (let k = 1; k < n; k++) {
    rows.push(h('div', { class: 'mc-slot' }, h('span', { class: 'eyebrow' }, `Colour ${k + 1}`),
      ...swatchRow(`Colour ${k + 1}`, () => M.slots[k - 1] || d.finish.color, (c) => { M.slots[k - 1] = c; update(); })));
  }
  update();
  return h('div', { class: 'group' }, h('div', { class: 'group-head' }, h('h3', {}, 'Multicolor'), sub),
    h('div', { class: 'mc-body' }, strip, h('div', { class: 'mc-ctl' }, ...ctl)), ...rows, note, warn);
}
let multiUi = null;
function refreshMaterials() {
  if (!state.result) return;
  showResult(state.result);
}

// ---------- 05 export
function renderExport() {
  const pane = $('#pane-export');
  const sel = h('select', { class: 'select', id: 'printer', 'aria-label': 'Printer' }, ...PRINTERS.map((p) => h('option', { value: p.id, selected: p.id === state.printer }, p.label)));
  sel.addEventListener('change', () => { state.printer = sel.value; store.set('weft.printer', sel.value); renderChecks(); if (state.view === 'print') showResult(state.result); });
  const qual = h('div', { class: 'seg', role: 'group', 'aria-label': 'Mesh detail' },
    ...[[0.7, 'Light'], [1, 'Standard'], [1.4, 'Fine']].map(([q, l]) => h('button', { type: 'button', 'aria-pressed': state.quality === q, onclick: (e) => { state.quality = q; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget)); } }, l)));
  const dl = h('button', { class: 'btn primary', id: 'dl', type: 'button', onclick: exportFiles },
    h('svg', { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', html: '<path d="M10 3v10M6 9l4 4 4-4M4 16h12"/>' }), 'Download print files');
  const backs = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Backdrop' });
  const paintBacks = () => backs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.c === state.backdrop));
  for (const [n, c] of BACKDROPS) backs.append(h('button', { class: 'sw', type: 'button', style: `--c:${c}`, 'data-c': c, title: n, 'aria-label': `${n} backdrop`, onclick: () => { state.backdrop = c; paintBacks(); } }));
  paintBacks();
  const aspect = h('div', { class: 'seg', role: 'group', 'aria-label': 'Image shape' },
    ...['4:3', '1:1'].map((a) => h('button', { type: 'button', 'aria-pressed': state.aspect === a, onclick: (e) => { state.aspect = a; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === e.currentTarget)); } }, a)));
  const listing = h('textarea', { class: 'listing', id: 'listing', readonly: true, 'aria-label': 'Listing text' });
  const code = h('input', { class: 'text', id: 'code-in', placeholder: 'Paste a design code', 'aria-label': 'Design code' });
  pane.replaceChildren(
    group('Printability', null, h('ul', { class: 'checks', id: 'check-list' })),
    group('Printer', null, sel),
    group('Parts', 'Laid out and oriented for printing',
      h('table', { class: 'parts' }, h('thead', {}, h('tr', {}, h('th', {}, 'Part'), h('th', {}, 'W × H mm'), h('th', {}, 'Weight'))), h('tbody', { id: 'parts-body' }))),
    h('div', { class: 'group', id: 'fil-group' }, h('div', { class: 'group-head' }, h('h3', {}, 'Filaments'), h('p', { id: 'fil-sub' })),
      h('table', { class: 'parts fil' }, h('thead', {}, h('tr', {}, h('th', {}, 'Slot'), h('th', {}, 'Used for'), h('th', {}, 'Weight'))), h('tbody', { id: 'fil-body' }))),
    group('Print files', 'A .zip with a 3MF for Bambu Studio or OrcaSlicer, one STL per part, and print settings. Multicolour pieces add a PrusaSlicer 3MF and one STL per colour.',
      h('div', { class: 'row-ctl' }, h('span', {}, 'Mesh detail'), qual), dl,
      desktop ? h('button', { class: 'btn', id: 'to-slicer', type: 'button', onclick: sendToSlicer, title: 'Ctrl+Shift+E' }, 'Open in slicer') : null),
    group('Cover image', 'A rendered photo for your listing. Dimensions and the size reference show in it while they are switched on.',
      h('div', { class: 'row-ctl' }, h('span', {}, 'Backdrop'), backs),
      h('div', { class: 'row-ctl' }, h('span', {}, 'Shape'), aspect),
      switchCtl('c-caption', 'Name and size on the image', () => state.caption, (v) => { state.caption = v; }),
      h('button', { class: 'btn', type: 'button', onclick: saveCover }, 'Save cover image')),
    group('Listing text', 'Title, description, print profile and tags for MakerWorld', listing,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', type: 'button', onclick: () => copyText(listing.value, listing) }, 'Copy listing text'))),
    group('Keep this design', null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: saveDesign }, 'Save to my designs'),
        desktop
          ? h('button', { class: 'btn', type: 'button', onclick: saveDesignFile, title: 'Ctrl+S' }, 'Save design file…')
          : h('button', { class: 'btn', type: 'button', onclick: (e) => copyText(JSON.stringify(state.design), e.currentTarget) }, 'Copy design code')),
      h('div', { class: 'btn-row' }, code, h('button', { class: 'btn', type: 'button', style: 'flex:0 0 auto', onclick: () => loadCode(code.value) }, 'Load'))),
  );
  renderChecks();
}

// the window (or browser tab) shows the design's name
const syncTitle = () => { document.title = `${state.design.name} · Weft Studio`; };
function renderAll() {
  $('#design-name').value = state.design.name;
  syncTitle();
  fitName();
  renderObject(); renderForm(); renderSurface(); renderFinish(); renderExport();
  updateKind();
  syncToggles();
}
function updateKind() {
  const d = state.design, S = d.surface;
  const P = PATTERNS[S.pattern];
  const surf = isFacet(d) ? 'Faceted' : S.pattern === 'smooth' ? 'Smooth' : `${P.label} ${S.mode === 'cut' ? 'openwork' : 'relief'}`;
  $('#kind').textContent = `${OBJECTS[d.object].label} · ${surf}`;
}

// ============================================================ listing text
function refreshListing() {
  const ta = $('#listing');
  if (!ta || !state.result) return;
  const d = state.design, res = state.result, S = d.surface;
  const { w, h: ht } = assembledSize(res, d);
  const g = Math.round(partsWeight(res, d));
  const P = PATTERNS[S.pattern];
  const facet = isFacet(d);
  const surf = facet ? 'faceted' : S.pattern === 'smooth' ? 'smooth' : `${P.label.toLowerCase()} ${S.mode === 'cut' ? 'openwork' : 'relief'}`;
  const obj = OBJECTS[d.object].label.toLowerCase();
  const supportsNeeded = allChecks().some((c) => /^Needs supports/.test(c.text));
  const noSupports = !supportsNeeded && !allChecks().some((c) => c.level === 'bad');
  const loops = Math.max(2, Math.round(d.form.wall / 0.45));
  const vase = d.object === 'vase' && d.extras.vaseMode && S.mode !== 'cut';
  const mc = state.multicolor && (res.parts.some((p) => p.regions) || res.info.colorChanges?.length);
  const fils = filamentList(d, res).length;
  const title = `${d.name} ${OBJECTS[d.object].label}: ${facet ? 'Faceted Geometric' : `${P.label}${S.pattern === 'smooth' ? '' : S.mode === 'cut' ? ' Openwork' : ' Texture'}`}${mc ? ', Multicolor' : ''}${noSupports ? ', No Supports' : ''}`;
  const partList = res.parts.map((p) => p.label.replace(/ \(.*\)/, '')).join(', ');
  const lines = [
    title, '',
    `${d.name} is a ${surf} ${obj}, ${Math.round(w)} mm across and ${Math.round(ht)} mm tall. ${S.mode === 'cut' ? 'The pattern runs through the wall, so it prints light and casts a soft pattern of shadows.' : d.object === 'globe' ? 'The wall is closed, so the light glows through it.' : 'The texture is raised from a solid wall, so it stays watertight.'} ${supportsNeeded ? 'The closed ball needs tree supports where it leans past 45°.' : 'Every opening and edge is shaped to print cleanly without supports.'}`,
    '',
    'Parts',
    ...res.parts.map((p) => { const b = p.stats.bbox; return `• ${p.label}: ${Math.round(b[3] - b[0])} × ${Math.round(b[4] - b[1])} × ${Math.round(b[5] - b[2])} mm`; }),
    '',
    'Print settings',
    vase ? '• Spiral vase mode: on, 0.6 mm line width, 5 bottom layers' : `• Layer height 0.2 mm · ${loops} wall loops · 15% infill · ${supportsNeeded ? 'tree supports, on the build plate only' : 'no supports'}`,
    `• About ${g} g of PLA${res.parts.length > 1 ? ` across ${res.parts.length} parts (${partList})` : ''}`,
    mc ? `• Multicolor: ${fils} filaments, colour changes at ${colorChangeHeights(d).map((z) => `${z.toFixed(1)} mm`).join(', ')}. ${vase ? 'Add the changes on the layer slider.' : 'AMS ready: the 3MF loads as one object with a part per colour, already assigned. Single-colour printers can use a filament change at each height.'}` : null,
    d.object === 'box' && d.extras.lid ? `• Lid prints top-down with ${d.extras.clearance.toFixed(2)} mm clearance. Glue the knob peg with a drop of CA glue.` : null,
    d.object === 'pendant' ? `• Prints crown-down. Socket hole Ø ${d.extras.socket} mm. LED bulbs only, 10 W or less.` : null,
    d.object === 'globe' ? `• Globe lamp: the globe stands in a groove in the base, which prints top-down and takes an E27 lamp kit in its Ø ${d.extras.socket} mm socket hole. Translucent filament glows best at 3 to 4 wall lines. LED bulbs only, 7 W or less.` : null,
    d.object === 'lamp' ? `• Table lamp: the base prints top-down and takes an E27 lamp kit in its Ø ${d.extras.socket} mm socket hole; the shade stands in a groove in the base. LED bulbs only, 10 W or less.` : null,
    d.object === 'planter' && d.extras.base === 'insert' ? '• Self-watering: print the insert too. Thread a cotton wick through its floor and fill the reservoir through the side channel.' : null,
    d.object === 'planter' && d.extras.drain && d.extras.base !== 'insert' ? `• Ø ${d.extras.drain} mm drainage hole${d.extras.base !== 'none' ? `; the ${d.extras.base} catches the water` : ''}.` : null,
    d.object === 'planter' && d.extras.base === 'sleeve' ? '• Print the sleeve in a second colour for a two-tone look.' : null,
    d.object === 'hanging' ? `• Hangs from ${d.extras.hangers || 3} cords through teardrop holes under the rim (cord up to Ø 4 mm).${d.extras.drain ? ` Ø ${d.extras.drain} mm drainage hole.` : ' No drainage hole, so it never drips.'}` : null,
    d.object === 'wall' ? `• Flat back with a keyhole for one screw (head up to 8 mm). Prints upright, back and all, without supports${facet ? ', on a small foot cut off its lowest corner: use a 5–8 mm brim. A cube stood on its corner and halved by the wall; no drainage hole' : ''}.` : null,
    d.object === 'orchid' ? `• Open walls for air at the roots${d.extras.drain ? `, Ø ${d.extras.drain} mm drainage hole` : ''}${d.extras.base === 'saucer' ? ', saucer included' : ''}.` : null,
    d.object === 'lantern' ? '• For LED tealights only. Never use a real flame.' : null,
    d.object === 'candle' ? `• A ${({ tealight: 'tealight', maxi: 'maxi tealight', taper: 'taper candle' })[d.extras.candle] || 'tealight'} sits in a pocket in the top. Print solid with 15% infill; LED candles are safest.` : null,
    res.info.stand ? `• Plant stand: two flat pieces, printed lying down with no supports, that slot together into a cross. The pot sits ${Math.round(res.info.stand.lift)} mm up.` : null,
    '',
    `Tags: ${[obj, S.pattern === 'smooth' ? null : P.label.toLowerCase(), S.mode === 'cut' ? 'openwork' : 'texture', 'home decor', 'minimalist', supportsNeeded ? null : 'no supports', d.object === 'pendant' ? 'lamp shade' : null, d.object === 'globe' ? 'moon lamp' : null, d.object === 'globe' ? 'lamp shade' : null, d.finish.material === 'translucent' ? 'translucent' : null, ['planter', 'hanging', 'wall', 'orchid'].includes(d.object) ? 'plant pot' : null, d.object === 'hanging' ? 'hanging planter' : null, d.object === 'wall' ? 'wall planter' : null, facet ? 'geometric' : null, facet ? 'faceted' : null, d.object === 'orchid' ? 'orchid' : null, d.object === 'lantern' || d.object === 'candle' ? 'tealight holder' : null, d.object === 'candle' ? 'candle holder' : null, d.object === 'lantern' ? 'lantern' : null, d.object === 'ring' ? 'napkin ring' : null, d.object === 'tray' ? 'trinket tray' : null, res.info.stand ? 'plant stand' : null, res.info.stand ? 'mid century' : null, d.object === 'planter' && d.extras.base === 'insert' ? 'self-watering' : null, d.object === 'lamp' ? 'table lamp' : null, d.object === 'box' ? 'storage' : null, vase ? 'vase mode' : null, mc ? 'multicolor' : null, mc ? 'ams' : null, 'parametric'].filter(Boolean).join(', ')}`,
  ];
  ta.value = lines.filter((l) => l !== null).join('\n');
}
async function copyText(text, el) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch {
    if (el && el.select) { el.focus(); el.select(); }
    toast('Select the text and copy it with Ctrl+C');
  }
}

// ============================================================ files
const downloadsCap = !desktop && window.claude && window.claude.use ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
// The page runtime around the web version saves only some kinds of file; anything else goes inside a zip.
const WEB_SAVES = /\.(gif|png|jpe?g|webp|mp4|webm|txt|json|md|docx|pptx|epub|csv|ttf|html|svg|pdf|xlsx|zip|fig)$/i;
async function saveFile(filename, blob) {
  if (desktop) {
    const r = await desktop.saveFile(filename, new Uint8Array(await blob.arrayBuffer()));
    if (r?.path) toast(`Saved ${r.path.split(/[\\/]/).pop()}`, { label: 'Show in folder', run: () => desktop.showInFolder(r.path) });
    return r;
  }
  const dl = await downloadsCap;
  if (dl) {
    if (!WEB_SAVES.test(filename)) {
      blob = new Blob([zipSync({ [filename]: [new Uint8Array(await blob.arrayBuffer()), { level: 6 }] })], { type: 'application/zip' });
      filename = `${filename.replace(/\.[^.]*$/, '')}.zip`;
    }
    try { await dl.save({ filename, data: blob }); toast(`Saved ${filename}`); }
    catch (e) {
      if (e && e.code === 'declined') toast('Download cancelled');
      else if (e && e.code === 'rate_limited') toast('A download prompt is already open');
      else toast('Downloads are not available in this view');
    }
    return;
  }
  if (window.claude) { toast('Downloads are not available in this view'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`Saved ${filename}`);
}

// Welds a part for export. A multicolour part keeps its triangles grouped by colour, one
// contiguous range per filament, all in the part's own coordinates so the colours stay aligned.
function weld(p, d) {
  const n = p.weldCount, pos = new Float32Array(n * 3), W = p.weld, P = p.position;
  for (let v = 0; v < W.length; v++) { const w = W[v] * 3; pos[w] = P[v * 3]; pos[w + 1] = P[v * 3 + 1]; pos[w + 2] = P[v * 3 + 2]; }
  const I = p.index, idx = new Uint32Array(I.length);
  // bands that share a colour print as one part
  const byColor = new Map();
  const regions = p.regions ? [...p.regions].sort((a, b) => a.slot - b.slot) : [{ first: 0, count: I.length / 3, slot: 0 }];
  for (const rg of regions) {
    const c = (p.regions ? slotColor(d, rg.slot) : partColor(d, p.place.color)).toLowerCase();
    if (!byColor.has(c)) byColor.set(c, []);
    byColor.get(c).push(rg);
  }
  const groups = [];
  let m = 0;
  for (const [color, list] of byColor) {
    const start = m;
    for (const rg of list) {
      for (let t = rg.first * 3; t < (rg.first + rg.count) * 3; t += 3) {
        const a = W[I[t]], b = W[I[t + 1]], c = W[I[t + 2]];
        if (a === b || b === c || a === c) continue;
        idx[m++] = a; idx[m++] = b; idx[m++] = c;
      }
    }
    if (m > start) groups.push({ color, first: start / 3, count: (m - start) / 3, bands: list.length });
  }
  // centre on x/y, rest on z = 0
  const bb = p.stats.bbox, cx = (bb[0] + bb[3]) / 2, cy = (bb[1] + bb[4]) / 2, z0 = bb[2];
  for (let k = 0; k < pos.length; k += 3) { pos[k] -= cx; pos[k + 1] -= cy; pos[k + 2] -= z0; }
  return { key: p.key, label: p.label, pos, idx: idx.subarray(0, m), size: [bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2]], groups };
}
// One colour group as its own compact mesh.
function subMesh(part, g) {
  const src = part.idx.subarray(g.first * 3, (g.first + g.count) * 3);
  const remap = new Map(), idx = new Uint32Array(src.length), pts = [];
  for (let k = 0; k < src.length; k++) {
    let v = remap.get(src[k]);
    if (v === undefined) { v = remap.size; remap.set(src[k], v); pts.push(src[k]); }
    idx[k] = v;
  }
  const pos = new Float32Array(pts.length * 3);
  pts.forEach((w, k) => { pos[k * 3] = part.pos[w * 3]; pos[k * 3 + 1] = part.pos[w * 3 + 1]; pos[k * 3 + 2] = part.pos[w * 3 + 2]; });
  return { pos, idx };
}
function stl(part, name) {
  const { pos, idx } = part, nt = idx.length / 3;
  const buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf);
  const head = `${name} - made with Weft`.slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    for (const v of [a, b, c]) { o += 12; dv.setFloat32(o, pos[v], true); dv.setFloat32(o + 4, pos[v + 1], true); dv.setFloat32(o + 8, pos[v + 2], true); }
    o += 14;
  }
  return new Uint8Array(buf);
}
const f3 = (x) => String(Math.round(x * 1000) / 1000);
// Rows of parts, biggest first, centred on the plate.
function packPlate(parts, bed, gap = 10) {
  const order = parts.map((p, i) => i).sort((a, b) => parts[b].size[0] * parts[b].size[1] - parts[a].size[0] * parts[a].size[1]);
  const rows = [];
  let row = null;
  for (const i of order) {
    const [w, dp] = parts[i].size;
    if (!row || row.w + gap + w > bed[0]) { row = { items: [], w: -gap, d: 0 }; rows.push(row); }
    row.items.push(i); row.w += gap + w; row.d = Math.max(row.d, dp);
  }
  const totalD = rows.reduce((a, r) => a + r.d, 0) + gap * (rows.length - 1);
  const at = new Array(parts.length);
  let y = bed[1] / 2 + totalD / 2;
  for (const r of rows) {
    let x = bed[0] / 2 - r.w / 2;
    for (const i of r.items) { at[i] = [x + parts[i].size[0] / 2, y - r.d / 2]; x += parts[i].size[0] + gap; }
    y -= r.d + gap;
  }
  return { at, fits: totalD <= bed[1] && rows.every((r) => r.w <= bed[0]) };
}
// Every distinct filament the print needs, in slot order: the main colour, its bands, then the other parts.
function filamentList(d, res) {
  const list = [];
  const add = (c) => { const k = String(c).toLowerCase(); if (!list.includes(k)) list.push(k); };
  add(d.finish.color);
  const b = bandsFor(d);
  if (b) for (const k of b.slots) add(slotColor(d, k));
  if (res) for (const p of res.parts) if (!p.regions) add(partColor(d, p.place.color));
  return list;
}
function meshXml(out, pos, idx, triAttr) {
  out.push('<mesh><vertices>');
  let chunk = [];
  for (let k = 0; k < pos.length; k += 3) {
    chunk.push(`<vertex x="${f3(pos[k])}" y="${f3(pos[k + 1])}" z="${f3(pos[k + 2])}"/>`);
    if (chunk.length > 20000) { out.push(chunk.join('')); chunk = []; }
  }
  out.push(chunk.join('')); chunk = [];
  out.push('</vertices><triangles>');
  for (let t = 0; t < idx.length; t += 3) {
    chunk.push(`<triangle v1="${idx[t]}" v2="${idx[t + 1]}" v3="${idx[t + 2]}"${triAttr ? triAttr(t / 3) : ''}/>`);
    if (chunk.length > 20000) { out.push(chunk.join('')); chunk = []; }
  }
  out.push(chunk.join(''));
  out.push('</triangles></mesh>');
}
// flavour 'bambu': Bambu Studio and OrcaSlicer read each component as a part of one object, and take
// filaments from Metadata/model_settings.config. flavour 'prusa': PrusaSlicer splits components into
// separate objects, so every part is one mesh and Metadata/Slic3r_PE_model.config names the volumes.
function threeMF(parts, d, bed, fils, flavour) {
  const plate = packPlate(parts, bed);
  const fil = (c) => Math.max(0, fils.indexOf(String(c).toLowerCase()));
  const out = [], cfg = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">\n');
  out.push(`<metadata name="Title">${esc(d.name)}</metadata>\n<metadata name="Application">Weft studio</metadata>\n<resources>\n`);
  // one colour group per filament: Orca maps each group to an extruder, Bambu each colour
  fils.forEach((c, k) => out.push(`<m:colorgroup id="${k + 1}"><m:color color="${c.toUpperCase()}FF"/></m:colorgroup>\n`));
  let next = fils.length + 1;
  const items = [];
  const name = (p, g) => (p.groups.length > 1 ? `${p.label} · colour ${fil(g.color) + 1}` : p.label);
  parts.forEach((p, i) => {
    const multi = p.groups.length > 1;
    if (flavour === 'bambu' && multi) {
      const comps = p.groups.map((g) => {
        const id = next++, sm = subMesh(p, g);
        out.push(`<object id="${id}" type="model" name="${esc(name(p, g))}" pid="${fil(g.color) + 1}" pindex="0">`);
        meshXml(out, sm.pos, sm.idx);
        out.push('</object>\n');
        return { id, g };
      });
      const id = next++;
      out.push(`<object id="${id}" type="model" name="${esc(p.label)}"><components>${comps.map((c) => `<component objectid="${c.id}"/>`).join('')}</components></object>\n`);
      cfg.push(`  <object id="${id}">\n    <metadata key="name" value="${esc(p.label)}"/>\n    <metadata key="extruder" value="${fil(p.groups[0].color) + 1}"/>\n` +
        comps.map((c) => `    <part id="${c.id}" subtype="normal_part">\n      <metadata key="name" value="${esc(name(p, c.g))}"/>\n      <metadata key="extruder" value="${fil(c.g.color) + 1}"/>\n    </part>\n`).join('') + '  </object>\n');
      items.push(id);
    } else {
      const id = next++, f0 = fil(p.groups[0].color);
      // per-triangle colours for slicers that read the Materials extension
      const triFil = multi ? new Uint8Array(p.idx.length / 3) : null;
      if (multi) for (const g of p.groups) triFil.fill(fil(g.color), g.first, g.first + g.count);
      out.push(`<object id="${id}" type="model" name="${esc(p.label)}" pid="${f0 + 1}" pindex="0">`);
      meshXml(out, p.pos, p.idx, multi ? (t) => (triFil[t] !== f0 ? ` pid="${triFil[t] + 1}" p1="0"` : '') : null);
      out.push('</object>\n');
      if (flavour === 'bambu') {
        cfg.push(`  <object id="${id}">\n    <metadata key="name" value="${esc(p.label)}"/>\n    <metadata key="extruder" value="${f0 + 1}"/>\n    <part id="${id}" subtype="normal_part">\n      <metadata key="name" value="${esc(p.label)}"/>\n      <metadata key="extruder" value="${f0 + 1}"/>\n    </part>\n  </object>\n`);
      } else {
        cfg.push(` <object id="${id}" instances_count="1">\n  <metadata type="object" key="name" value="${esc(p.label)}"/>\n  <metadata type="object" key="extruder" value="${f0 + 1}"/>\n` +
          p.groups.map((g) => `  <volume firstid="${g.first}" lastid="${g.first + g.count - 1}">\n   <metadata type="volume" key="name" value="${esc(name(p, g))}"/>\n   <metadata type="volume" key="volume_type" value="ModelPart"/>\n   <metadata type="volume" key="extruder" value="${fil(g.color) + 1}"/>\n  </volume>\n`).join('') + ' </object>\n');
      }
      items.push(id);
    }
  });
  out.push('</resources>\n<build>\n');
  items.forEach((id, i) => out.push(`<item objectid="${id}" transform="1 0 0 0 1 0 0 0 1 ${f3(plate.at[i][0])} ${f3(plate.at[i][1])} 0"/>\n`));
  out.push('</build>\n</model>\n');
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': strToU8(out.join('')),
  };
  files[flavour === 'bambu' ? 'Metadata/model_settings.config' : 'Metadata/Slic3r_PE_model.config'] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${cfg.join('')}</config>\n`);
  return zipSync(files, { level: 6 });
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The filament part of print-settings.txt: what goes in which slot, and how to load it in each slicer.
function filamentNotes(d, res, parts, name) {
  const use = filamentUse(res, d);
  const lines = ['Filaments', ...use.map((f, k) => `• Filament ${k + 1}: ${filamentName(f.color)} ${f.color} · about ${Math.round(f.grams)} g · ${f.roles.join(', ')}`)];
  const multi = parts.filter((p) => p.groups.length > 1);
  const heights = colorChangeHeights(d).map((z) => `${z.toFixed(1)} mm`).join(', ');
  const others = res.parts.filter((p) => !p.regions && p.key !== res.info.mainKey);
  if (multi.length) {
    const p = multi[0];
    lines.push('', 'Multicolour',
      `${p.label} is split into ${res.parts.find((q) => q.regions)?.regions.length || p.groups.length} colour bands at ${heights}. Each band is its own closed body cut on a layer line, so every layer is a single colour and the printer only swaps filament at those heights.`,
      `• Bambu Studio or OrcaSlicer: open ${name}.3mf. ${p.label} loads as one object with one part per colour, already set to filaments 1–${use.length}. Load matching colours into those AMS slots (or remap them in the filament list).`,
      `• PrusaSlicer (MMU or XL): open ${name}-prusaslicer.3mf. Same parts, already set to extruders.`,
      `• Any other slicer: import every STL in stl/multicolor together, answer yes to "load as a single object with multiple parts", then pick a filament for each part. Their positions already line up.`,
      `• One nozzle and no AMS: print stl/${name}-${p.key}.stl and add a filament change (M600 or pause) at ${heights}.`);
  } else if (res.info.colorChanges?.length && state.multicolor) {
    lines.push('', 'Multicolour (spiral vase)',
      `Spiral vase mode prints one continuous wall, so the colour changes by height: ${heights}.`,
      '• Bambu Studio or OrcaSlicer: after slicing, right-click the layer slider at each height and choose Add color change. With an AMS the swap is automatic.',
      '• PrusaSlicer: use the + on the layer slider at each height. Any printer: insert M600 at those heights.');
  }
  if (use.length > 1 && others.length) lines.push(`• ${others.map((p) => p.label).join(' and ')} ${others.length > 1 ? 'are' : 'is'} a separate part in another colour. Print ${others.length > 1 ? 'them' : 'it'} on its own plate so the printer is not swapping filament on every layer.`);
  if (use.length > 4) lines.push(`• This print uses ${use.length} filaments. An AMS holds 4, so swap a spool between plates or reuse a colour.`);
  return lines.join('\n');
}
// Builds the print meshes at the export detail: what both the .zip and the slicer hand-off start from.
async function printMeshes() {
  const d = clone(state.design);
  const res = await engine.run(engineParams(d), state.quality);
  const parts = res.parts.map((p) => weld(p, d));
  const printer = PRINTERS.find((q) => q.id === state.printer) || PRINTERS[0];
  return { d, res, parts, name: slug(d.name), printer, fils: filamentList(d, res) };
}
// Desktop only: the 3MF goes straight to whichever slicer opens .3mf files on this computer.
async function sendToSlicer() {
  if (!desktop) return;
  const btn = $('#to-slicer');
  if (btn) btn.disabled = true;
  toast('Building the 3MF…');
  try {
    const { d, parts, name, printer, fils } = await printMeshes();
    const r = await desktop.openInSlicer(`${name}.3mf`, threeMF(parts, d, printer.bed, fils, 'bambu'));
    if (r?.error) toast('No app opens .3mf files yet. Install Bambu Studio or OrcaSlicer, or open the file by hand.', { label: 'Show file', run: () => desktop.showInFolder(r.path) });
    else toast(`Opened ${name}.3mf in your slicer`, { label: 'Show file', run: () => desktop.showInFolder(r.path) });
  } catch (e) {
    console.error(e);
    toast('Could not build the 3MF. Try the Light mesh detail.');
  }
  if (btn) btn.disabled = false;
}
async function exportFiles() {
  const btn = $('#dl');
  const label = btn.lastChild.textContent;
  btn.disabled = true; btn.lastChild.textContent = 'Building print meshes…';
  await new Promise((r) => setTimeout(r, 30));
  try {
    const { d, res, parts, name, printer, fils } = await printMeshes();
    btn.lastChild.textContent = 'Packing files…';
    await new Promise((r) => setTimeout(r, 30));
    const files = { [`${name}.3mf`]: [threeMF(parts, d, printer.bed, fils, 'bambu'), { level: 0 }] };
    // PrusaSlicer needs its own file only when parts carry different filaments
    if (new Set(parts.flatMap((p) => p.groups.map((g) => g.color))).size > 1) files[`${name}-prusaslicer.3mf`] = [threeMF(parts, d, printer.bed, fils, 'prusa'), { level: 0 }];
    for (const p of parts) {
      files[`stl/${name}-${p.key}.stl`] = stl(p, `${d.name} ${p.label}`);
      // the colour bodies share the part's origin, so they load back into place as parts of one object
      if (p.groups.length > 1) {
        for (const g of p.groups) {
          const k = fils.indexOf(g.color.toLowerCase()) + 1;
          files[`stl/multicolor/${name}-${p.key}-colour-${k}.stl`] = stl({ pos: p.pos, idx: p.idx.subarray(g.first * 3, (g.first + g.count) * 3) }, `${d.name} ${p.label} colour ${k}`);
        }
      }
    }
    const plateNote = packPlate(parts, printer.bed).fits ? '' : '\n\nThe parts do not all fit on one plate together. In Bambu Studio or OrcaSlicer, use Arrange to spread them across plates.';
    files['print-settings.txt'] = strToU8(`${$('#listing')?.value || d.name}${plateNote}\n\n${filamentNotes(d, res, parts, name)}\n\nDesign code (paste into Weft to edit):\n${JSON.stringify(d)}\n`);
    const zip = zipSync(files, { level: 6 });
    await saveFile(`${name}-print-files.zip`, new Blob([zip], { type: 'application/zip' }));
  } catch (e) {
    console.error(e);
    toast('Export failed. Try the Light mesh detail.');
  }
  btn.disabled = false; btn.lastChild.textContent = label;
}

// The glow test: a strip whose wall steps from one line to 3 mm, for trying a translucent filament.
async function downloadGlowTest() {
  try {
    const d = clone(state.design), printer = PRINTERS.find((q) => q.id === state.printer) || PRINTERS[0];
    const part = weld(glowTest(), d), fils = [partColor(d, 0).toLowerCase()];
    const steps = GLOW_STEPS.map((t, k) => `${k + 1}. ${t} mm${k < 5 ? ` (${k + 1} line${k ? 's' : ''})` : ''}`).join('\n');
    const zip = zipSync({
      'glow-test.3mf': [threeMF([part], { ...d, name: 'Glow test' }, printer.bed, fils, 'bambu'), { level: 0 }],
      'glow-test.stl': stl(part, 'Glow test'),
      'glow-test.txt': strToU8(`Glow test\n\nA curved strip 20 mm tall whose wall gets thicker in ${GLOW_STEPS.length} steps, thinnest at one end:\n${steps}\n\nPrint it upright in the filament you want to use, with the same wall settings you will use for the lamp (Arachne walls, no infill needed). Stand it over a phone torch or an LED tealight in a dim room: thin steps are brightest but show the light source as a bright spot; thicker steps glow more evenly and more softly. Pick the thinnest step that hides the light source, and set Wall thickness to it.\n`),
    }, { level: 6 });
    await saveFile('weft-glow-test.zip', new Blob([zip], { type: 'application/zip' }));
  } catch (e) { console.error(e); toast('Could not build the glow test'); }
}

async function saveCover() {
  const d = state.design;
  const [W, H] = state.aspect === '1:1' ? [1600, 1600] : [2000, 1500];
  const wasSpin = state.spin;
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  stage.camera.aspect = W / H;
  const camPos = stage.camera.position.clone(), camTarget = controls.target.clone(), near = stage.camera.near, far = stage.camera.far;
  if (stage.content) {
    const f = frameStage(stage, stage.content, { keepDir: true, also: refState.group, fit: (state.caption ? 0.86 : 0.76) * (state.dims ? 1.16 : 1) });
    // nudge the object up a little to leave room for the caption
    if (state.caption) { const shift = f.dist * 0.06; stage.camera.position.y -= shift; f.target.y -= shift; }
    stage.camera.lookAt(f.target);
  }
  stage.camera.updateProjectionMatrix();
  const dimLabels = updateDims();
  cleanRender(() => renderer.render(stage.scene, stage.camera), true);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const g = out.getContext('2d');
  const base = new THREE.Color(state.backdrop);
  const night = base.r + base.g + base.b < 0.6;
  const hi = base.clone().lerp(new THREE.Color(night ? 0x3a3a36 : 0xffffff), 0.45), lo = base.clone().multiplyScalar(night ? 0.6 : 0.86);
  const grad = g.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, Math.max(W, H) * 0.75);
  grad.addColorStop(0, `#${hi.getHexString()}`); grad.addColorStop(1, `#${lo.getHexString()}`);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.drawImage(renderer.domElement, 0, 0, W, H);
  if (dimLabels.length) {
    const fs = Math.round(W * 0.0125);
    g.font = `500 ${fs}px "DM Mono", monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const lb of dimLabels) {
      const x = ((lb.x + 1) / 2) * W, y = ((1 - lb.y) / 2) * H, tw = g.measureText(lb.text).width;
      g.fillStyle = `#${base.clone().lerp(new THREE.Color(night ? 0x000000 : 0xffffff), 0.5).getHexString()}`;
      g.globalAlpha = 0.88; g.fillRect(x - tw / 2 - fs * 0.45, y - fs * 0.75, tw + fs * 0.9, fs * 1.5); g.globalAlpha = 1;
      g.fillStyle = `#${dimState.color.getHexString()}`;
      g.fillText(lb.text, x, y);
    }
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  }
  if (state.caption && state.result) {
    const { w, h: ht } = assembledSize(state.result, d);
    const ink = night ? '#ecece6' : '#1b1c1a';
    g.fillStyle = ink;
    g.font = `700 ${Math.round(W * 0.042)}px "Bricolage Grotesque", Arial, sans-serif`;
    g.fillText(d.name, W * 0.05, H - W * 0.075);
    g.globalAlpha = 0.65;
    g.font = `400 ${Math.round(W * 0.016)}px "DM Mono", monospace`;
    g.fillText(`${OBJECTS[d.object].label.toUpperCase()}  ·  Ø ${Math.round(w)} × ${Math.round(ht)} MM  ·  NO SUPPORTS`, W * 0.052, H - W * 0.045);
    g.globalAlpha = 1;
  }
  renderer.setPixelRatio(pr);
  renderer.setSize(size.x, size.y, false);
  stage.camera.position.copy(camPos); stage.camera.near = near; stage.camera.far = far;
  controls.target.copy(camTarget); stage.camera.lookAt(camTarget); stage.target = camTarget.clone();
  stage.camera.aspect = size.x / size.y;
  stage.camera.updateProjectionMatrix();
  state.spin = wasSpin;
  invalidate();
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  await saveFile(`${slug(d.name)}-cover.png`, blob);
}

// Covers and saved thumbnails leave out the editing aids: handles and overhang stripes. Covers keep
// the dimensions and size reference (keepAids); small saved thumbnails drop them too.
function cleanRender(fn, keepAids = false) {
  const hidden = [];
  stage.content?.traverse((o) => { if (o.userData.hazard && o.visible) { o.visible = false; hidden.push(o); } });
  for (const g of [handleState.group, keepAids ? null : dimState.group, keepAids ? null : refState.group]) if (g?.visible) { g.visible = false; hidden.push(g); }
  try { return fn(); } finally {
    hidden.forEach((o) => { o.visible = true; });
  }
}

// ============================================================ saved designs + collection
const thumbRenderer = (() => {
  try {
    const c = document.createElement('canvas');
    const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(480, 360, false);
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0, 0);
    return r;
  } catch { return null; }
})();
const thumbStage = thumbRenderer ? makeStage(thumbRenderer) : null;
if (thumbStage) { thumbStage.camera.aspect = 4 / 3; thumbStage.camera.updateProjectionMatrix(); }
const thumbQueue = [];
let thumbBusy = false;
async function pumpThumbs() {
  if (thumbBusy || building || pending || !thumbQueue.length || !thumbStage) return;
  thumbBusy = true;
  const { d, img } = thumbQueue.shift();
  try {
    const res = await engine.run(d, 0.45);
    const { root } = buildDisplay(res, d, { mode: 'studio', overhangs: false, multicolor: false });
    if (thumbStage.content) { thumbStage.spin.remove(thumbStage.content); disposeGroup(thumbStage.content); }
    thumbStage.content = root; thumbStage.spin.add(root);
    thumbStage.spin.rotation.y = -0.5;
    thumbStage.target = null;
    const f = frameStage(thumbStage, root, { keepDir: false, fit: 0.8 });
    thumbStage.camera.lookAt(f.target);
    applyLook(thumbStage, false);
    thumbRenderer.render(thumbStage.scene, thumbStage.camera);
    img.src = thumbRenderer.domElement.toDataURL('image/png');
    img.hidden = false;
    img.previousElementSibling?.remove();
  } catch (e) { console.warn('thumbnail', e); }
  thumbBusy = false;
  if (thumbQueue.length) setTimeout(pumpThumbs, 30);
}

function designCard(d, onOpen, thumb) {
  const img = h('img', { alt: `${d.name}, ${OBJECTS[d.object].label.toLowerCase()}`, hidden: !thumb });
  if (thumb) img.src = thumb;
  const P = PATTERNS[d.surface.pattern];
  const card = h('button', { class: 'card', type: 'button', onclick: onOpen },
    h('div', { class: 'thumb' }, thumb ? null : h('span', { class: 'ph' }, 'rendering…'), img),
    h('div', { class: 'meta' }, h('b', {}, d.name), h('span', {}, `${OBJECTS[d.object].label} · ${d.surface.pattern === 'smooth' ? 'Smooth' : `${P.label} ${d.surface.mode === 'cut' ? 'openwork' : 'relief'}`}`),
      h('small', {}, `Ø ${Math.round(d.form.diameter)} × ${Math.round(d.form.height)} mm`)));
  return { card, img };
}
function openDesign(d) {
  state.design = clone(d);
  // older saved designs may predate the cup and the watertight rule
  if (!OBJECTS[state.design.object]) state.design.object = 'vase';
  if (state.multicolor) distinctSlots(state.design); else ensureMulti(state.design);
  keepWatertight();
  lastObjectKey = '';
  state.explode = false;
  syncToggles();
  renderAll();
  rebuild(true);
  commitHistory();
  showView('studio');
}
// 2.0 shows the studio, the collection and the guide one at a time; the classic page scrolls between them.
const VIEWS = ['studio', 'panels', 'collection', 'guide'];
function showView(v, fromHash) {
  if (!VIEWS.includes(v)) v = 'studio';
  if (UI !== 'v2') { $(`#${v}`).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); return; }
  const was = document.body.dataset.view;
  document.body.dataset.view = v;
  document.querySelectorAll('.views a[data-view]').forEach((a) => (a.dataset.view === v ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (!fromHash && location.hash.slice(1) !== v) { try { window.history.replaceState(null, '', v === 'studio' ? location.pathname + location.search : `#${v}`); } catch { /* sandboxed */ } }
  if (v === 'studio' && was !== 'studio') { resize(); invalidate(); }
  if (v === 'panels') panels?.show(); else panels?.hide();
  syncUndo();
  if (v !== 'studio') { const page = $(`#${v}`); if (page && was !== v) page.scrollTop = 0; if (thumbQueue.length) setTimeout(pumpThumbs, 30); }
}
// The collection, grouped by what each piece is for
const COLLECTION_GROUPS = [
  ['all', 'All', () => true],
  ['plants', 'Planters', (d) => ['planter', 'hanging', 'wall', 'orchid'].includes(d.object)],
  ['vases', 'Vases', (d) => d.object === 'vase'],
  ['bowls', 'Bowls and trays', (d) => d.object === 'bowl' || d.object === 'tray'],
  ['storage', 'Boxes and cups', (d) => d.object === 'box' || d.object === 'cup'],
  ['light', 'Lighting and candles', (d) => ['pendant', 'lamp', 'globe', 'lantern', 'candle'].includes(d.object)],
  ['rings', 'Rings', (d) => d.object === 'ring'],
];
let collectionFilter = store.get('weft.collFilter', 'all');
function renderCollection() {
  const grid = $('#collection-grid');
  grid.replaceChildren();
  const cards = [];
  for (const d of COLLECTION) {
    const { card, img } = designCard(d, () => openDesign(d));
    grid.append(card);
    cards.push({ d, card });
    thumbQueue.push({ d, img });
  }
  const count = $('#coll-count');
  if (count) count.textContent = COLLECTION.length;
  const bar = $('#collection-filters');
  if (!bar) return;
  const apply = () => {
    const [, , test] = COLLECTION_GROUPS.find(([k]) => k === collectionFilter) || COLLECTION_GROUPS[0];
    for (const { d, card } of cards) card.hidden = !test(d);
    bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.f === collectionFilter));
  };
  bar.replaceChildren(...COLLECTION_GROUPS.map(([k, label, test]) => {
    const n = COLLECTION.filter(test).length;
    return n ? h('button', { class: 'chip', type: 'button', 'data-f': k, onclick: () => { collectionFilter = k; store.set('weft.collFilter', k); apply(); } }, label, h('span', {}, `${n}`)) : null;
  }));
  apply();
}
function renderSaved() {
  const grid = $('#saved-grid');
  const saved = store.get('weft.saved', []);
  if (!saved.length) { grid.replaceChildren(h('div', { class: 'empty' }, 'Nothing saved yet. Use “Save to my designs” in the Export step.')); return; }
  grid.replaceChildren(...saved.map((s) => {
    const { card } = designCard(s.design, () => openDesign(s.design), s.thumb);
    const del = h('button', { class: 'icon-btn card-del', type: 'button', 'aria-label': `Remove ${s.design.name}`, title: 'Remove', onclick: () => { store.set('weft.saved', store.get('weft.saved', []).filter((x) => x.id !== s.id)); renderSaved(); toast('Removed'); } },
      h('svg', { viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', html: '<path d="M5 5l10 10M15 5L5 15"/>' }));
    return h('div', { class: 'card-wrap' }, card, del);
  }));
}
function saveDesign() {
  const d = clone(state.design);
  let thumb = null;
  try {
    cleanRender(() => renderer.render(stage.scene, stage.camera));
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const src = renderer.domElement, sw = src.width, sh = src.height, s = Math.min(sw / 4, sh / 3);
    c.getContext('2d').drawImage(src, (sw - s * 4) / 2, (sh - s * 3) / 2, s * 4, s * 3, 0, 0, 400, 300);
    thumb = c.toDataURL('image/png');
  } catch { /* thumbnail is optional */ }
  const saved = store.get('weft.saved', []);
  saved.unshift({ id: Date.now().toString(36), design: d, thumb });
  if (!store.set('weft.saved', saved.slice(0, 24))) { toast('This browser is not keeping saved designs. Copy the design code instead.'); return; }
  renderSaved();
  toast(`Saved ${d.name}`);
}
// A .weft file is the design code as readable JSON.
function saveDesignFile() {
  const d = state.design;
  return saveFile(`${slug(d.name)}.weft`, new Blob([JSON.stringify({ weft: 1, ...d }, null, 2)], { type: 'application/json' }));
}
function loadCode(text) {
  if (panels?.loadCode(text)) { showView('panels'); toast('Panel loaded'); return; }
  try {
    const d = JSON.parse(text.trim());
    if (d) delete d.weft;
    if (!d || !d.form || !d.surface || !OBJECTS[d.object]) throw new Error('shape');
    openDesign(d);
    toast(`Loaded ${d.name}`);
  } catch { toast('That code is not a Weft design. Copy it again from the Export step.'); }
}

// ============================================================ shuffle
// Three independent parts, so a shuffle can change the shape and keep the pattern, or the other way round.
const SHUFFLE_PARTS = [['shape', 'Shape'], ['surface', 'Surface'], ['colour', 'Colours']];
state.shuffleParts = { shape: true, surface: true, colour: true, ...store.get('weft.shuffleParts', {}) };
// How steep the eased silhouette gets anywhere, in degrees from upright
function maxLean(F) {
  const H = F.height, fn = easeProfile(makeProfile(F), H, 44).fn;
  let m = 0;
  for (let k = 0; k < 60; k++) { const z0 = (H * k) / 60, z1 = (H * (k + 1)) / 60; m = Math.max(m, Math.abs(fn(z1) - fn(z0)) / (z1 - z0)); }
  return (Math.atan(m) * 180) / Math.PI;
}
// The most twist this shape takes and still prints: twisting swings the flanks of a shaped outline
// outward by r x twist rate x the flank's slant, on top of the silhouette's own lean.
function safeTwist(F) {
  if ((F.section || 'round') === 'round') return 0;
  const H = F.height, fn = easeProfile(makeProfile(F), H, 44).fn, sec = makeSection(F);
  let kT = 0;
  for (let q = 0; q < sec.M; q += 4) kT = Math.max(kT, Math.abs(sec.y[q] * sec.nx[q] - sec.x[q] * sec.ny[q]));
  let rate = Infinity;
  for (let k = 0; k < 40; k++) {
    const z0 = (H * k) / 40, z1 = (H * (k + 1)) / 40, lean = Math.abs(fn(z1) - fn(z0)) / (z1 - z0), r = Math.max(fn(z0), fn(z1));
    rate = Math.min(rate, Math.max(0, 0.85 - lean) / Math.max(1e-6, r * kT));
  }
  return Math.floor((rate * H * 180) / Math.PI);
}
function shuffleShape(d) {
  const F = d.form, X = d.extras, obj = d.object;
  if (obj === 'globe') {
    F.diameter = Math.round(rnd(170, 240)); F.height = Math.round(F.diameter * pick([1, 1, 1, rnd(0.85, 0.95), rnd(1.05, 1.18)]));
    X.globeTop = pick(['round', 'round', 'peak']); X.globeUnder = pick(['round', 'round', 'cone']);
    X.opening = Math.round(Math.max(76, F.diameter * rnd(0.36, 0.46)));
    F.wall = pick([1.35, 1.8, 1.8]);
    F.section = pick(['round', 'round', 'round', 'lobed', 'polygon']);
    if (F.section === 'lobed') { F.lobes = Math.round(rnd(8, 14)); F.lobeDepth = +rnd(0.04, 0.09).toFixed(2); F.lobeStyle = pick(['scallop', 'wave']); }
    if (F.section === 'polygon') { F.sides = pick([6, 8, 10]); F.corner = +rnd(0.3, 0.5).toFixed(2); }
    // a support-free globe stays untwisted: a twist leans its 45° top and underside further
    F.twist = F.section === 'round' || (X.globeTop === 'peak' && X.globeUnder === 'cone') ? 0 : pick([0, Math.round(rnd(30, 90)) * pick([1, -1])]);
    return;
  }
  const sils = {
    planter: ['cylinder', 'taper', 'barrel', 'tulip', 'urn', 'funnel', 'orb', 'orb'], box: ['barrel', 'cylinder', 'ovoid', 'lantern'], pendant: ['bell', 'ovoid', 'tulip', 'globe'],
    lamp: ['cylinder', 'taper', 'barrel', 'lantern', 'waist', 'ovoid'],
    bowl: ['bowl'], vase: ['tulip', 'ovoid', 'taper', 'barrel', 'waist', 'amphora', 'urn', 'lantern', 'cone'], cup: ['cylinder', 'taper', 'barrel', 'waist', 'funnel'],
    hanging: ['bowl', 'orb', 'orb', 'barrel', 'tulip'], wall: ['cylinder', 'taper', 'barrel', 'tulip', 'funnel'], orchid: ['cylinder', 'taper', 'barrel', 'tulip'],
    lantern: ['cylinder', 'barrel', 'lantern', 'taper', 'ovoid', 'waist'], candle: ['urn', 'tulip', 'cone', 'waist', 'ovoid', 'barrel', 'amphora'], tray: ['bowl', 'taper', 'cylinder'], ring: ['cylinder', 'barrel', 'waist', 'cylinder'],
  }[obj];
  const s = SILHOUETTES[pick(sils)];
  Object.assign(F, { base: s.base + rnd(-0.05, 0.05), top: s.top + rnd(-0.05, 0.05), belly: clamp(s.belly + rnd(-0.06, 0.06), 0.2, 0.8), fullness: clamp(s.fullness + rnd(-0.12, 0.12), -0.3, 1), lip: s.lip || 0, lipH: s.lipH || F.lipH });
  F.height = Math.round(F.height * rnd(0.9, 1.1));
  // shuffled pieces always get sturdy 3 mm walls and floors: thinner prints tend to flex and crack
  F.wall = 3; F.floor = 3;
  // a third of shuffles get a shaped outline, sometimes twisted
  const shape = pick(['round', 'round', 'polygon', 'lobed']);
  F.section = shape;
  if (shape === 'polygon') { F.sides = pick([5, 6, 6, 8, 10]); F.corner = +rnd(0.1, 0.3).toFixed(2); }
  if (shape === 'lobed') { F.lobes = Math.round(rnd(6, 12)); F.lobeDepth = +rnd(0.06, 0.14).toFixed(2); F.lobeStyle = pick(['scallop', 'wave']); }
  // twisting turns lobes and corners into leaning flanks: keep it moderate so the piece still prints
  F.twist = shape === 'round' ? 0 : pick([0, 0, Math.round(rnd(-1, 1) * (shape === 'lobed' ? 30 : 55))]);
  // a third of rims get a shaped edge or line
  F.rimEdge = pick(['flat', 'flat', 'round', 'bevel', 'rolled']);
  if (obj === 'wall') {
    F.section = 'round'; F.twist = 0; X.back = +rnd(0.15, 0.45).toFixed(2);
    X.wallStyle = Math.random() < 0.25 ? 'facet' : 'round';
    if (X.wallStyle === 'facet') { X.facetTilt = Math.round(rnd(25, 42)); X.facetDepth = +rnd(0.8, 1.15).toFixed(2); X.facetRim = pick([0, 0, 0, Math.round(rnd(-15, 15))]); F.diameter = Math.round(rnd(120, 200)); }
  }
  if (obj === 'hanging') { X.hangers = pick([3, 3, 4]); }
  if (obj === 'hanging' || obj === 'wall') F.bottom = pick(['flat', 'flat', 'round']);
  if (obj === 'ring') { X.edgeBoth = true; X.innerChamfer = pick([0, 0, 1, 1.5]); }
  if (obj === 'candle') {
    X.candle = pick(['tealight', 'tealight', 'maxi', 'taper']);
    // the top must stay wide enough round the candle's pocket
    const need = ({ tealight: 24, maxi: 34, taper: 15.5 })[X.candle] / (F.diameter / 2);
    F.top = +Math.max(F.top, need + 0.04).toFixed(2);
  }
  if (obj === 'orchid') X.base = pick(['none', 'saucer', 'saucer']);
  // planters, orchid pots and vases now and then stand on legs
  if (obj === 'planter' || obj === 'orchid' || obj === 'vase') {
    X.stand = pick(['none', 'none', 'none', 'mid', 'mid', 'upright', 'wide']);
    if (X.stand !== 'none') { X.standLift = Math.round(rnd(45, obj === 'vase' ? 140 : 110)); X.standHug = +rnd(0.28, 0.45).toFixed(2); X.standLeg = Math.round(rnd(10, 15)); }
  }
  if (obj === 'planter') X.base = pick(['none', 'saucer', 'sleeve', 'sleeve', 'insert', 'insert']);
  F.rimShape = obj === 'box' || obj === 'hanging' || (obj === 'planter' && X.base === 'insert') ? 'level' : pick(['level', 'level', 'level', 'wavy', 'slant']);
  F.rimWaves = Math.round(rnd(4, 10)); F.rimDepth = Math.round(rnd(4, 14));
  // table lamps look best with a turned square or polygon
  if (obj === 'lamp' && Math.random() < 0.6) { F.section = 'polygon'; F.sides = pick([4, 4, 5, 6]); F.corner = +rnd(0.25, 0.45).toFixed(2); F.twist = Math.round(rnd(30, 90)) * pick([1, -1]); }
  // no more twist than this shape can take without overhangs (short or flared pieces take little or none)
  if (F.twist) { const cap = safeTwist(F); F.twist = cap < 10 ? 0 : Math.sign(F.twist) * Math.min(Math.abs(F.twist), cap); }
}
// Relief depth ranges for shuffles, in mm at a 150 mm diameter
const BOLD_DEPTH = {
  spikes: [4.5, 8], shards: [5, 9], fins: [4.5, 9], blocks: [3.5, 7], hobnail: [3, 5], facets: [3.5, 7], cubes: [3.5, 7],
  prism: [2.5, 5], quilt: [2.5, 5], knurl: [1.8, 3.4], carved: [3, 5.5], hammered: [2.4, 4.2], gouge: [2.8, 5], bark: [3, 5.5],
  ribs: [2.5, 5.5], chevron: [2.2, 4.5], reeds: [2.2, 4], weave: [2, 3.6], tiles: [1.8, 3.6], herringbone: [1.6, 3],
  topo: [1, 2], rings: [0.9, 1.6], dunes: [1.4, 2.4], perforated: [0.9, 1.6],
};
function shuffleSurface(d) {
  const F = d.form, S = d.surface, obj = d.object;
  if (obj === 'globe' && Math.random() < 0.4) { Object.assign(S, { pattern: 'smooth', mode: 'none', swirl: 0, bandBottom: 0, bandTop: 0 }); return; }
  const lampObj = !!OBJECTS[obj].lamp && obj !== 'globe';
  const pats = obj === 'globe' ? ['ribs', 'ribs', 'reeds', 'waves', 'dunes', 'knit', 'quilt', 'facets', 'hammered', 'lattice', 'honeycomb', 'perforated', 'voronoi']
    : lampObj
    ? ['lattice', 'prism', 'ogee', 'arches', 'voronoi', 'honeycomb', 'dots', 'perforated', 'perforated']
    : ['lattice', 'prism', 'ogee', 'arches', 'voronoi', 'honeycomb', 'dots', 'perforated', 'wicker', 'ribs', 'chevron', 'reeds', 'waves', 'topo', 'knit', 'weave', 'petals', 'quilt', 'facets', 'tiles', 'hammered', 'carved', 'rings', 'dunes', 'bark',
      'gouge', 'cubes', 'cubes', 'knurl', 'knurl', 'seigaiha', 'herringbone', 'blocks', 'blocks', 'spikes', 'spikes', 'shards', 'shards', 'fins', 'fins', 'hobnail', 'hobnail'];
  const tight = !!OBJECTS[obj].watertight;
  // wicker's strands bridge flat; on a curved wall they would hang out instead
  const curved = maxLean(F) > 12;
  const pid = pick((tight ? pats.filter((k) => PATTERNS[k].modes.includes('relief')) : pats).filter((k) => !(curved && k === 'wicker')));
  S.pattern = pid;
  const P = PATTERNS[pid];
  Object.assign(S, P.def);
  S.mode = lampObj ? 'cut' : tight ? 'relief' : pick(P.modes);
  // ribs and knurls look good turned; other patterns now and then
  S.swirl = S.mode === 'cut' ? 0 : pid === 'ribs' || pid === 'knurl' ? pick([0, 60, 90, 120, -90]) : pick([0, 0, 0, 0, 45, -45]);
  // a low wall (trays, rings) gets smaller cells, so whole cells fit its height
  const low = clamp(F.height / 90, 0.4, 1);
  if (P.cellMM) S.count = clamp(Math.round(((Math.PI * F.diameter) / (P.cellMM * low)) * rnd(0.8, 1.25)), 4, 110);
  if (pid === 'lattice' || pid === 'quilt' || pid === 'prism') S.angle = Math.round(rnd(50, 66));
  if (pid === 'ribs') S.angle = S.mode === 'cut' ? Math.round(rnd(-30, 30)) : pick([0, 0, Math.round(rnd(-45, 45))]);
  if (pid === 'ribs' && S.mode === 'relief') { S.wave = pick([0, 0, rnd(0.2, 0.7)]); S.waveFreq = pick([1, 1.5, 2, 3]); S.profile = pick(['round', 'sharp', 'soft']); }
  if (pid === 'chevron') S.angle = Math.round(rnd(20, S.mode === 'cut' ? 38 : 50));
  if (['voronoi', 'topo', 'facets', 'shards', 'blocks', 'reeds', 'hammered', 'rings', 'dunes', 'bark', 'gouge', 'herringbone'].includes(pid)) S.seed = Math.floor(Math.random() * 9999);
  if (pid === 'voronoi') { S.jitter = rnd(0.5, 0.9); S.stretch = rnd(1.2, 1.6); }
  if (pid === 'arches' || pid === 'tiles' || pid === 'prism') S.alt = Math.random() < 0.5;
  if (S.mode === 'cut') { S.width = +rnd(1.8, 2.8).toFixed(1); S.bandBottom = Math.round(rnd(5, 10)); S.bandTop = Math.round(rnd(3, 8)); S.gradient = pick([0, 0, +rnd(-0.3, 0.3).toFixed(2)]); }
  else {
    // relief comes out bold: each pattern has its own range, and the sculptural ones really stand out.
    // Small pieces get a little less so the texture keeps its scale.
    const [lo, hi] = BOLD_DEPTH[pid] || [P.def.depth * 0.9, P.def.depth * 1.35];
    S.depth = +(rnd(lo, hi) * clamp(F.diameter / 150, 0.65, 1.1) * Math.max(0.6, low)).toFixed(1);
    S.bandBottom = pick([0, 0, 3]); S.bandTop = pick([0, 3, 5]);
  }
  if (obj === 'ring' || obj === 'tray') { S.bandBottom = Math.min(S.bandBottom, 2); S.bandTop = Math.min(S.bandTop, 2); }
  // a globe's pattern runs over the whole ball
  if (obj === 'globe') { S.bandBottom = 0; S.bandTop = 0; }
  // orchid bark needs a solid band at the bottom to stay in
  if (obj === 'orchid' && S.mode === 'cut') S.bandBottom = Math.round(rnd(14, 22));
  if (pid === 'fins' && S.mode === 'relief') { S.fill = +rnd(0.35, 0.6).toFixed(2); S.profile = pick(['flat', 'flat', 'sharp', 'round']); S.swirl = pick([0, 0, 60, 90, -90, 120]); }
  if (pid === 'spikes' || pid === 'shards' || pid === 'blocks' || pid === 'cubes') S.swirl = 0;
}
function shuffleColours(d) {
  d.finish.color = pick(FILAMENTS)[1];
  d.finish.color2 = pick(FILAMENTS.filter(([, c]) => c !== d.finish.color))[1];
  d.finish.color3 = pick(FILAMENTS)[1];
  // multicolour stays switched as it is; when it is on, the bands and their filaments are shuffled too
  if (state.multicolor) {
    const M = ensureMulti(d);
    M.layout = pick(['split', 'split', 'rim', 'base', 'tri', 'stripes', 'gradient']);
    M.split = +rnd(0.3, 0.62).toFixed(2); M.stripes = pick([3, 5, 5, 7, 9]);
    const pal = FILAMENTS.map(([, c]) => c).filter((c) => c !== d.finish.color);
    M.slots = [0, 1, 2].map(() => pal.splice(Math.floor(Math.random() * pal.length), 1)[0]);
  }
}
// Shuffle tries a few candidates and keeps the first that prints without supports (a quick, coarse
// build of each in the background); if none does, it keeps the one with the least overhang.
let shuffling = false;
async function shuffle(parts = state.shuffleParts) {
  if (shuffling) return;
  shuffling = true;
  $('#busy').classList.add('show');
  const base = clone(state.design);
  let best = null, bestScore = Infinity;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const d = clone(base);
      if (parts.shape) shuffleShape(d);
      if (parts.surface) shuffleSurface(d);
      if (parts.colour) shuffleColours(d);
      // colours never change printability, so there is nothing to check
      if (!parts.shape && !parts.surface) { best = d; break; }
      let score = Infinity;
      try {
        const res = await engine.run(engineParams(d), 0.7);
        const over = res.parts.reduce((a, p) => a + p.stats.overhang, 0);
        score = over + (res.checks.some((c) => c.level === 'bad') ? 1e6 : 0);
      } catch { /* a combination that does not build is never kept */ }
      if (score < bestScore) { best = d; bestScore = score; }
      if (score <= 40) break;
    }
  } finally {
    shuffling = false;
  }
  if (!best) { $('#busy').classList.remove('show'); return; }
  state.design = best;
  rename();
  onEdit(true, true);
}
const DICE_SVG = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="3"/><circle cx="7.5" cy="7.5" r=".6" fill="currentColor"/><circle cx="12.5" cy="12.5" r=".6" fill="currentColor"/><circle cx="12.5" cy="7.5" r=".6" fill="currentColor"/><circle cx="7.5" cy="12.5" r=".6" fill="currentColor"/></svg>';
// a small "shuffle just this" button for the head of a pane
const diceBtn = (part, label) => h('button', { class: 'mini-btn', type: 'button', title: `New random ${label.toLowerCase()}, everything else stays`, onclick: () => shuffle({ [part]: true }), html: `${DICE_SVG}<span>Shuffle ${label.toLowerCase()}</span>` });
function syncShuffle() {
  const P = state.shuffleParts, on = SHUFFLE_PARTS.filter(([k]) => P[k]);
  $('#shuffle-label').textContent = on.length === SHUFFLE_PARTS.length ? 'Shuffle' : `Shuffle ${on.map(([, l]) => l.toLowerCase()).join(' + ')}`;
  $('#shuffle-menu').querySelectorAll('button[data-part]').forEach((b) => b.setAttribute('aria-pressed', !!P[b.dataset.part]));
}
function renderShuffleMenu() {
  const menu = $('#shuffle-menu');
  menu.replaceChildren(h('span', { class: 'eyebrow' }, 'Shuffle changes'),
    h('div', { class: 'chips' }, ...SHUFFLE_PARTS.map(([k, l]) => h('button', { class: 'chip', type: 'button', 'data-part': k, onclick: () => {
      const P = state.shuffleParts;
      if (P[k] && SHUFFLE_PARTS.filter(([q]) => P[q]).length === 1) { toast('Shuffle needs at least one part to change'); return; }
      P[k] = !P[k];
      store.set('weft.shuffleParts', P);
      syncShuffle();
    } }, l))),
    h('p', { class: 'note' }, 'Parts that are off stay exactly as they are.'));
  syncShuffle();
}
function openShuffleMenu(open) {
  const menu = $('#shuffle-menu'), btn = $('#shuffle-opts');
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', open);
}

// ============================================================ toggles + wiring
function setSpin(on) { state.spin = on; syncToggles(); invalidate(); }
function syncToggles() {
  const set = (id, on) => { const b = $(id); b.setAttribute('aria-pressed', on); b.classList.toggle('on', on); };
  set('#t-spin', state.spin); set('#t-cut', state.cut); set('#t-glow', state.light.on); set('#t-explode', state.explode);
  set('#t-xray', state.xray); set('#t-handles', state.handles); set('#t-dims', state.dims); set('#t-ref', state.ref);
  $('#t-dims').hidden = state.view === 'print';
  $('#t-ref').hidden = state.view === 'print';
  $('#ref-pick').hidden = !state.ref || state.view === 'print';
  if (state.ref) renderRefPick();
  $('#view-studio').setAttribute('aria-pressed', state.view === 'studio');
  $('#view-print').setAttribute('aria-pressed', state.view === 'print');
  $('#t-explode').hidden = !(state.design.object === 'box' && state.design.extras.lid) || state.view === 'print';
  $('#t-spin').hidden = state.view === 'print';
  $('#t-glow').hidden = !hasLight(state.design.object);
  const fh = $('#f-handles');
  if (fh) fh.checked = state.handles;
  $('#t-handles').hidden = state.view === 'print';
  const sw = $('#l-on');
  if (sw) sw.checked = state.light.on;
  const mc = $('#mc-toggle');
  mc.setAttribute('aria-pressed', state.multicolor);
  $('#mc-state').textContent = state.multicolor ? 'On' : 'Off';
  syncMultiDots();
}
function syncMultiDots() {
  const d = state.design, n = state.multicolor ? Math.max(2, slotsUsed(bandsFor(d))) : 3;
  $('#mc-toggle').querySelectorAll('.mc-dots i').forEach((el, k) => {
    el.hidden = k >= n;
    el.style.background = state.multicolor ? slotColor(d, k) : '';
  });
}
function redisplay() { if (state.result) showResult(state.result); }
function setLight(on) {
  state.light.on = on;
  saveLight();
  if (on && state.view === 'print') state.view = 'studio';
  syncToggles();
  redisplay();
}

$('#t-spin').addEventListener('click', () => setSpin(!state.spin));
$('#t-cut').addEventListener('click', () => { state.cut = !state.cut; syncToggles(); redisplay(); });
$('#t-glow').addEventListener('click', () => setLight(!state.light.on));
$('#t-xray').addEventListener('click', () => { state.xray = !state.xray; syncToggles(); redisplay(); });
function setMulticolor(on) {
  state.multicolor = on;
  store.set('weft.multicolor', on);
  if (on) distinctSlots(state.design);
  syncToggles();
  renderFinish();
  rebuild(true);
  toast(on ? 'Multicolor on: the piece splits into colour bands at layer lines' : 'Multicolor off');
}
$('#mc-toggle').addEventListener('click', () => setMulticolor(!state.multicolor));
function setHandles(on) { state.handles = on; store.set('weft.handles', on); syncToggles(); updateHandles(); invalidate(); }
$('#t-handles').addEventListener('click', () => setHandles(!state.handles));
$('#t-dims').addEventListener('click', () => setDims(!state.dims));
$('#t-ref').addEventListener('click', () => setRef(!state.ref));
$('#name-dice').addEventListener('click', () => { rename(); refreshListing(); commitHistory(); });
$('#t-explode').addEventListener('click', () => { state.explode = !state.explode; syncToggles(); redisplay(); });
$('#view-studio').addEventListener('click', () => { state.view = 'studio'; syncToggles(); redisplay(); });
$('#view-print').addEventListener('click', () => { state.view = 'print'; setSpin(false); syncToggles(); redisplay(); });
$('#reset-view').addEventListener('click', () => { lastObjectKey = ''; stage.target = null; refState.dir = null; redisplay(); });
$('#shuffle').addEventListener('click', () => shuffle());
$('#shuffle-opts').addEventListener('click', (e) => { e.stopPropagation(); openShuffleMenu($('#shuffle-menu').hidden); });
document.addEventListener('pointerdown', (e) => { if (!$('#shuffle-menu').hidden && !e.target.closest('#shuffle-menu, #shuffle-opts')) openShuffleMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#shuffle-menu').hidden) { openShuffleMenu(false); $('#shuffle-opts').focus(); } });
$('#undo').addEventListener('click', () => travel(-1));
$('#redo').addEventListener('click', () => travel(1));
$('#status-btn').addEventListener('click', () => setTab('export'));
$('#go-export')?.addEventListener('click', () => { if (panelsFocused()) { panels.goExport(); return; } setTab('export'); showView('studio'); });
document.querySelectorAll('.views a[data-view], .brand').forEach((a) => a.addEventListener('click', (e) => {
  if (UI !== 'v2') return;
  e.preventDefault();
  showView(a.dataset.view || 'studio');
}));
if (UI === 'v2') window.addEventListener('hashchange', () => showView(location.hash.slice(1), true));
// Switching designs reloads the page into the other one; the design on the stage comes along.
function switchUI() {
  const to = UI === 'v2' ? 'classic' : 'v2';
  try { sessionStorage.setItem('weft.carry', JSON.stringify({ design: state.design, tab: state.tab })); } catch { /* the design starts fresh */ }
  store.set('weft.ui', to);
  if (desktop?.setUI) { desktop.setUI(to); return; }
  location.href = new URL(to === 'classic' ? 'classic.html' : './', location.href).href;
}
$('#ui-switch')?.addEventListener('click', switchUI);
$('#design-name').addEventListener('input', (e) => { state.design.name = e.target.value || 'Untitled'; fitName(); refreshListing(); syncTitle(); });
$('#design-name').addEventListener('change', commitHistory);
for (const t of ['object', 'form', 'surface', 'finish', 'export']) $(`#tab-${t}`).addEventListener('click', () => setTab(t));
$('.steps').addEventListener('keydown', (e) => {
  const tabs = ['object', 'form', 'surface', 'finish', 'export'];
  const i = tabs.indexOf(state.tab);
  if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
    const n = tabs[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : tabs.length - 1)) % tabs.length];
    setTab(n); $(`#tab-${n}`).focus(); e.preventDefault();
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !/input|textarea/i.test(document.activeElement?.tagName || '')) {
    e.preventDefault(); travel(e.shiftKey ? 1 : -1);
  }
});
$('#theme').addEventListener('click', () => {
  const root = document.documentElement;
  const cur = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  root.dataset.theme = cur === 'dark' ? 'light' : 'dark';
  store.set('weft.theme', root.dataset.theme);
  swatchCache.clear();
  renderSurface();
  panels?.refreshTheme();
  refreshAccent();
  refreshDimColor();
});
const savedTheme = store.get('weft.theme', null);
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

// ============================================================ desktop menu
if (desktop) {
  document.documentElement.classList.add('desktop');
  const toggles = { dims: '#t-dims', ref: '#t-ref', handles: '#t-handles', xray: '#t-xray', cut: '#t-cut', spin: '#t-spin' };
  desktop.onMenu((action, arg) => {
    switch (action) {
      case 'new': openDesign(clone(COLLECTION[0])); rename(); commitHistory(); break;
      case 'open': desktop.openDesign(); break;
      case 'load-design': loadCode(arg.text); break;
      case 'save': saveDesignFile(); break;
      case 'export': if (panelsFocused()) panels.exportFiles(); else { setTab('export'); showView('studio'); exportFiles(); } break;
      case 'slicer': sendToSlicer(); break;
      case 'cover': saveCover(); break;
      case 'undo': travel(-1); break;
      case 'redo': travel(1); break;
      case 'shuffle': if (panelsFocused()) panels.shuffle(arg === 'surface' ? 'pattern' : arg === 'colour' ? 'colour' : arg === 'shape' ? 'shape' : 'all'); else shuffle(arg ? { [arg]: true } : undefined); break;
      case 'multicolor': setMulticolor(!state.multicolor); break;
      case 'view': $(`#view-${arg}`).click(); break;
      case 'frame': if (panelsFocused()) panels.frame(); else $('#reset-view').click(); break;
      case 'toggle': if (toggles[arg] && !$(toggles[arg]).hidden) $(toggles[arg]).click(); break;
      case 'theme': $('#theme').click(); break;
      case 'guide': showView('guide'); break;
      case 'collection': showView('collection'); break;
      case 'studio-view': showView('studio'); break;
      case 'panels': showView('panels'); break;
      case 'ui': if (arg !== UI) switchUI(); break;
      default: break;
    }
  });
  // F frames the piece, like the Frame button, unless you are typing
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) { if (panelsFocused()) panels.frame(); else $('#reset-view').click(); }
  });
}

// ============================================================ boot
try {
  const carry = JSON.parse(sessionStorage.getItem('weft.carry') || 'null');
  sessionStorage.removeItem('weft.carry');
  if (carry && carry.design && OBJECTS[carry.design.object]) {
    state.design = carry.design;
    history.stack = [JSON.stringify(state.design)]; history.at = 0;
    if (carry.tab) state.tab = carry.tab;
  }
} catch { /* nothing to carry */ }
document.body.dataset.tab = state.tab;
if (state.multicolor) distinctSlots(state.design);
refreshAccent();
renderShuffleMenu();
renderAll();
syncToggles();
renderCollection();
renderSaved();
panels = initPanels({
  THREE, OrbitControls, RoomEnvironment, zipSync, strToU8, h, store, toast, saveFile, stl, sliderCtl, chipsCtl, switchCtl, group, groupAct,
  FILAMENTS, MATERIALS, PRINTERS, UI, desktop, slug, clamp, copyText, bedMesh, syncUndo,
  getPrinter: () => state.printer,
  setPrinter: (v) => { state.printer = v; store.set('weft.printer', v); if (state.tab === 'export') renderExport(); },
});
resize();
if (state.tab !== 'object') setTab(state.tab);
if (UI === 'v2' && location.hash) showView(location.hash.slice(1), true);
rebuild(true);
