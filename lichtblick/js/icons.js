// Lichtblick's own pictograms, drawn on a 24-unit grid: solid geometric shapes, 2-unit strokes,
// a lighter second tone for supporting parts. No emoji anywhere in the app.
//   $s = stroke, $d = second tone, $sd = stroke in the second tone, $a = accent fill
const RAW = {
  // ---- light ----
  sunrise: '<rect x="2" y="18" width="20" height="2"/><path d="M6 16.5a6 6 0 0 1 12 0z"/><path d="M12 2.5 15.5 7h-7z"/>',
  sunset: '<rect x="2" y="18" width="20" height="2"/><path d="M6 16.5a6 6 0 0 1 12 0z"/><path d="M12 7.5 8.5 3h7z"/>',
  bluehour: '<rect x="2" y="15" width="20" height="2"/><path d="M4 13V8h4v5zM10 13V4h4v9zM16 13V9h4v4z"/><path $d d="M7.5 18.5h9a4.5 4.5 0 0 1-9 0z"/>',
  fogsea: '<path d="M12 3 18.5 13h-13z"/><rect x="2" y="15" width="20" height="2.2"/><rect $d x="5" y="19.3" width="14" height="2.2"/>',
  mist: '<rect x="2" y="5" width="14" height="2.2"/><rect $d x="8" y="10.9" width="14" height="2.2"/><rect x="2" y="16.8" width="11" height="2.2"/><rect $d x="15" y="16.8" width="5" height="2.2"/>',
  mirror: '<path d="M12 2.5 18.5 10.5h-13z"/><rect x="2" y="11.4" width="20" height="1.4"/><path $d d="M5.5 13.7h13L12 21.7z"/>',
  lightning: '<path d="M13.8 2 5 13.4h5.4L8.8 22 19 10.2h-5.6z"/>',
  rainbow: '<path $s d="M2.500 19.500a9.500 9.500 0 0 1 19 0"/><path $sd d="M7 19.500a5 5 0 0 1 10 0"/><rect x="1" y="19.500" width="22" height="0"/>',
  clearing: '<circle cx="16.5" cy="7.5" r="4.5" $d/><path d="M7 20a4 4 0 0 1-.6-7.96A5.6 5.6 0 0 1 17.2 13.4 3.4 3.4 0 0 1 17 20z"/>',
  freshsnow: '<path $s d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7"/><path $s d="m9.5 3.5 2.5 2.5 2.5-2.5M9.5 20.5 12 18l2.5 2.5"/>',
  ice: '<path $s d="M12 2.600 20.100 7.300v9.400L12 21.400 3.900 16.700V7.300z"/><path $sd d="M12 7v10M7.700 9.500l8.600 5M7.700 14.500l8.600-5"/>',
  hoarfrost: '<path d="M12 2 16.5 8.5h-2.6l4.1 6h-3.4l3.4 5H6l3.4-5H6l4.1-6H7.5z"/><rect x="11" y="19.5" width="2" height="3"/><circle $d cx="4" cy="5" r="1.2"/><circle $d cx="20" cy="4" r="1.2"/><circle $d cx="21" cy="11" r="1.2"/><circle $d cx="3" cy="11.5" r="1.2"/>',
  autumn: '<path d="M4.5 19.5C4.5 10 10 4 20.5 4z"/><path $d d="M20.5 4c0 10.5-6 15.5-16 15.5z"/><rect x="1.2" y="19.6" width="5" height="1.8" transform="rotate(-45 3.7 20.5)"/>',
  waterfall: '<rect x="3" y="2.5" width="18" height="2.6"/><rect x="6" y="6.5" width="2.6" height="9.5"/><rect $d x="10.7" y="6.5" width="2.6" height="9.5"/><rect x="15.4" y="6.5" width="2.6" height="9.5"/><path $s d="M2 20c1.7-2 3.3-2 5 0s3.3 2 5 0 3.3-2 5 0 3.3 2 5 0"/>',
  foehn: '<ellipse cx="12" cy="5" rx="9" ry="2.3"/><ellipse $d cx="12" cy="9.6" rx="5.5" ry="1.7"/><path d="M12 12.5 19 22H5z"/>',
  stars: '<path d="M10 4.5 12 11l6.5 2-6.5 2-2 6.5L8 15l-6.5-2L8 11z"/><path $d d="m18.5 2 1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>',
  milkyway: '<path $d d="M2.5 21C6 12.500 12.500 6 21.500 2.500 18 11.500 11.500 18 2.500 21z"/><circle cx="8.300" cy="15.500" r="1.900"/><circle cx="13" cy="10.800" r="1.300"/><circle cx="16.800" cy="6.800" r="1"/><circle cx="18.500" cy="14.500" r="1"/><circle cx="5.500" cy="6.500" r="1"/>',
  meteors: '<path d="m6.500 13.500 1.300 3.200 3.200 1.300-3.200 1.300L6.500 22.500l-1.300-3.200L2 18l3.200-1.300z"/><path $s d="M11 13 21 3"/><path $sd d="M14.500 15.500 20 10M8 9.500 13.500 4"/>',
  aurora: '<path $s d="M5 3c2.500 4.500-2.500 8.500 0 13.500"/><path $sd d="M12 2.500c2.500 5.500-2.500 10 0 16"/><path $s d="M19 3c2.500 4.500-2.500 8.500 0 13.500"/><rect x="2" y="20" width="20" height="2"/>',
  // ---- animals ----
  paw: '<path d="M12 12.300c-3.200 0-6 2.700-6 5.400 0 1.900 1.400 2.800 3 2.800 1.200 0 2-.600 3-.600s1.800.600 3 .600c1.600 0 3-.900 3-2.800 0-2.700-2.800-5.400-6-5.400z"/><ellipse cx="5.200" cy="9.800" rx="1.900" ry="2.500"/><ellipse cx="9.500" cy="5.300" rx="1.900" ry="2.600"/><ellipse cx="14.500" cy="5.300" rx="1.900" ry="2.600"/><ellipse cx="18.800" cy="9.800" rx="1.900" ry="2.500"/>',
  horns: '<path d="M10.500 21.500 8.200 13.500h7.600l-2.300 8z"/><path d="M9.300 12.300C8.800 7.500 6.600 4.300 2.500 2.500c5-.300 9 3 9.300 9.800z"/><path d="M14.700 12.300C15.200 7.500 17.400 4.300 21.500 2.500c-5-.300-9 3-9.300 9.800z"/>',
  antlers: '<path d="M9.800 21.500 8.500 15h7l-1.300 6.500a2.250 2.250 0 0 1-4.400 0z"/><path $s d="M10 14.500C7.500 12.500 6 9 6.200 3.500M7 10 2.800 8.500M6.300 6.500 3.500 4M14 14.500c2.500-2 4-5.500 3.800-11M17 10l4.200-1.500M17.700 6.500 20.500 4"/>',
  marmot: '<path $d d="M2 22c1.800-2.600 5-3.400 10-3.400s8.200.800 10 3.400z"/><path d="M12 2.500c2.300 0 3.900 1.700 3.900 3.800 0 1.100-.400 2-1.100 2.700 1.700 1.500 2.700 4 2.700 6.800 0 1.200-.200 2.300-.500 3.200H7c-.300-.900-.500-2-.500-3.200 0-2.800 1-5.300 2.700-6.800-.700-.700-1.100-1.600-1.100-2.700 0-2.100 1.600-3.800 3.900-3.800z"/><circle cx="8.600" cy="3.300" r="1.300"/><circle cx="15.400" cy="3.300" r="1.300"/>',
  fox: '<path fill-rule="evenodd" d="M2.500 2.500 8.800 6h6.400l6.300-3.500-1.800 9.800L12 21.500 4.300 12.300zM9 10.300a1.200 1.200 0 1 0 0 2.400 1.200 1.200 0 0 0 0-2.400zm6 0a1.200 1.200 0 1 0 0 2.400 1.200 1.200 0 0 0 0-2.400z"/>',
  hare: '<path d="M9.600 12.500C6.800 8.500 6.600 3.800 8.800 1.800c2.300 1.600 3 6.200 2.700 10.200zM14.400 12.500c2.800-4 3-8.700.800-10.700-2.300 1.600-3 6.200-2.700 10.200z"/><ellipse cx="12" cy="16.800" rx="5.400" ry="5.200"/>',
  raptor: '<path d="M1.500 8.500c3.500-1 7 .200 9 2.700l1.500 1.300 1.500-1.300c2-2.500 5.500-3.700 9-2.700-2.500 1.200-4 3-4.800 5.300l-3.200 1.700.700 5-3.200-2-3.200 2 .700-5-3.200-1.700C5.500 11.500 4 9.700 1.500 8.500z"/>',
  bird: '<path d="M6 13h14a7 7 0 0 1-14 0z"/><circle cx="8.300" cy="8.700" r="3.500"/><path d="M5.200 7.700 1.500 9.200l3.700 1.500z"/><path d="M19.500 13 23 8v5z"/><path $s d="M11 19.500v3M15 19.500v3"/>',
  duck: '<path d="M5.500 12.500h14.500a6 6 0 0 1-6 5h-4a5.500 5.500 0 0 1-4.500-5z"/><path d="M9.500 13V8.500h3.300V13z"/><circle cx="10.700" cy="6.500" r="3.300"/><path d="M8 5.800H3.200a2 2 0 0 0 2 2H8z"/><path $s d="M2 21c1.700-1.800 3.300-1.800 5 0s3.300 1.800 5 0 3.300-1.800 5 0 3.300 1.800 5 0"/>',
  wader: '<ellipse cx="13.500" cy="11.500" rx="5.500" ry="3.400"/><path $s d="M9.800 10 7.500 4.500M12.300 14.500l-1 7.500M15.500 14.500l1 7.500"/><circle cx="7.300" cy="4" r="2.100"/><path d="M6 3.200 1 6.800l5.500-1.500z"/>',
  // ---- interface ----
  mark: '<circle $a cx="16.200" cy="7.300" r="4.300"/><path d="M1.500 21 9 8.500l4.200 6.300 2.300-3.300L22.500 21z"/>',
  map: '<path $s d="M3 6.500 9 4l6 2.500L21 4v13.500L15 20l-6-2.500L3 20z"/><path $sd d="M9 4v13.500M15 6.500V20"/>',
  night: '<path d="M19.500 14.800A8.200 8.200 0 1 1 9.200 4.500a6.600 6.600 0 0 0 10.300 10.300z"/><path d="m18 2 .9 2.600 2.600.900-2.600.900L18 9l-.900-2.600L14.500 5.500l2.600-.900z"/>',
  pin: '<path fill-rule="evenodd" d="M12 2a7.200 7.200 0 0 0-7.200 7.200C4.800 14.500 12 22.500 12 22.500s7.200-8 7.200-13.300A7.200 7.200 0 0 0 12 2zm0 4.500a2.700 2.700 0 1 1 0 5.400 2.700 2.700 0 0 1 0-5.400z"/>',
  refresh: '<path $s d="M19.500 12.500a7.500 7.500 0 1 1-2.300-5.900"/><path d="M20.500 2.500v6h-6z"/>',
  settings: '<path $s d="M3 6.500h18M3 12h18M3 17.500h18"/><rect x="6.500" y="3.500" width="3.500" height="6"/><rect x="14" y="9" width="3.500" height="6"/><rect x="8.500" y="14.500" width="3.500" height="6"/>',
  close: '<path $s d="M5 5 19 19M19 5 5 19"/>',
  right: '<path $s d="m9 5 7 7-7 7"/>',
  left: '<path $s d="m15 5-7 7 7 7"/>',
  down: '<path $s d="m5 9 7 7 7-7"/>',
  up: '<path $s d="m5 15 7-7 7 7"/>',
  arrow: '<path $s d="M12 21V5"/><path d="M12 2 6.500 9h11z"/>',
  locate: '<circle $s cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path $s d="M12 1.500v4M12 18.500v4M1.500 12h4M18.500 12h4"/>',
  layers: '<path d="M12 2.500 21.500 8 12 13.500 2.500 8z"/><path $s d="m3.500 12.500 8.500 5 8.500-5"/><path $sd d="m3.500 16.500 8.500 5 8.500-5"/>',
  calendar: '<path $s d="M3.500 5.500h17v15h-17z"/><rect x="3.500" y="5.500" width="17" height="4.500"/><path $s d="M8 2.500v4M16 2.500v4"/><rect $d x="7" y="13" width="3" height="3"/><rect x="14" y="13" width="3" height="3"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  pause: '<rect x="6" y="4" width="4.500" height="16"/><rect x="13.500" y="4" width="4.500" height="16"/>',
  save: '<path $s d="M6.500 3.500h11v17L12 16.500 6.500 20.500z"/>',
  saved: '<path d="M5.500 2.500h13v20L12 17.700 5.500 22.500z"/>',
  route: '<path $s d="M5 21v-9a4 4 0 0 1 4-4h9"/><path d="M15.500 3 21.500 8l-6 5z"/>',
  terrain: '<path $d d="M2 20.500 9.500 5v15.500z"/><path d="M9.500 5 17.500 20.500h-8z"/><path d="M16.500 11.500 22 20.500h-7.200l-1.500-3z"/>',
  moon: '<path d="M20 14.700A8.500 8.500 0 1 1 9.300 4a6.900 6.900 0 0 0 10.700 10.700z"/>',
  sun: '<circle cx="12" cy="12" r="4.600"/><path $s d="M12 1.500v3.500M12 19v3.500M1.500 12H5M19 12h3.500M4.600 4.600 7 7M17 17l2.400 2.400M19.400 4.600 17 7M7 17l-2.400 2.400"/>',
  cloud: '<path d="M7 19.500a4.300 4.300 0 0 1-.600-8.560A6 6 0 0 1 18 12.300a3.650 3.650 0 0 1-.500 7.200z"/>',
  drop: '<path d="M12 2.500c3.500 4.500 6.500 8 6.500 11.700a6.500 6.500 0 0 1-13 0C5.500 10.500 8.500 7 12 2.500z"/>',
  wind: '<path $s d="M2.500 8.500h10.500a3 3 0 1 0-3-3M2.500 13h15.500a3 3 0 1 1-3 3M2.500 17.500h7"/>',
  clock: '<circle $s cx="12" cy="12" r="8.500"/><path $s d="M12 6.500V12l4 2.500"/>',
  camera: '<path fill-rule="evenodd" d="M8.500 4h7l1.500 2.500h4.500v13.500h-19V6.500H7zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/>',
  compass: '<circle $s cx="12" cy="12" r="9"/><path d="m15.500 8.500-2 5-5 2 2-5z"/>',
  walk: '<circle cx="13" cy="4" r="2.300"/><path $s d="M12.500 8 10.500 14l3.500 3v5.500M10.500 14l-2 4-2 4M8 12l3-3.500 3.500 1 2.500 3.500"/>',
  bed: '<path $s d="M3 5v15M3 16.500h18V20M21 16.500V13a2.500 2.500 0 0 0-2.500-2.500H10v6"/><circle cx="6.500" cy="12" r="1.800"/>',
  lock: '<rect x="4.500" y="10.500" width="15" height="11"/><path $s d="M8 10.500V7a4 4 0 0 1 8 0v3.500"/>',
  shield: '<path d="M12 2 20 5v6c0 5-3.200 9-8 11-4.800-2-8-6-8-11V5z"/>',
  check: '<path $s d="m4.500 12.500 5 5 10-11"/>',
  info: '<circle $s cx="12" cy="12" r="9"/><path $s d="M12 11v6"/><rect x="11" y="6.500" width="2" height="2.200"/>',
  alert: '<path $s d="M12 3.500 21.500 20h-19z"/><path $s d="M12 10v5"/><rect x="11" y="16.300" width="2" height="2"/>',
  external: '<path $s d="M9.500 5.500h9v9M18.500 5.500 5.500 18.500"/>',
  plus: '<path $s d="M12 4v16M4 12h16"/>',
  search: '<circle $s cx="10.500" cy="10.500" r="6.500"/><path $s d="m15.500 15.500 5.500 5.500"/>',
  photo: '<path $s d="M3.500 4.500h17v15h-17z"/><path d="m5 18 4.500-6 3 3.500 2-2.500 4.500 5z"/><circle cx="15.500" cy="8.500" r="1.700"/>',
  planet: '<circle cx="12" cy="12" r="5.500"/><path $s d="M4.300 15.200C2.300 16.900 1.400 18.300 2 19c1 1.200 6.300-.800 11.800-4.600S23 6.500 22 5.300c-.500-.700-2.200-.400-4.600.700"/>',
  video: '<rect x="2.500" y="6" width="13" height="12"/><path d="m16.500 10.500 5-3v9l-5-3z"/>',
  sort: '<path $s d="M4 6.500h16M4 12h11M4 17.500h6"/>',
  target: '<circle $s cx="12" cy="12" r="8.500"/><circle $s cx="12" cy="12" r="4.200"/><circle cx="12" cy="12" r="1.500"/>',
  thermo: '<path $s d="M10 3.500h4v10.300a4.200 4.200 0 1 1-4 0z"/><circle cx="12" cy="17.500" r="2"/>',
  eye: '<path $s d="M2 12c2.500-4.500 6-6.500 10-6.500S19.500 7.500 22 12c-2.500 4.500-6 6.500-10 6.500S4.500 16.500 2 12z"/><circle cx="12" cy="12" r="2.800"/>',
  bell: '<path d="M12 2.500a6.500 6.500 0 0 0-6.500 6.500v5L3.500 18h17l-2-4V9A6.500 6.500 0 0 0 12 2.500z"/><path $s d="M9.500 20.500a2.600 2.600 0 0 0 5 0"/>',
  peak: '<path d="M12 5 20 19H4z"/>',
};

const expand = (s) => s
  .replace(/\$sd/g, 'fill="none" stroke="currentColor" stroke-width="2" opacity=".4"')
  .replace(/\$s/g, 'fill="none" stroke="currentColor" stroke-width="2"')
  .replace(/\$d/g, 'opacity=".4"')
  .replace(/\$a/g, 'fill="var(--accent, currentColor)"');
export const ICONS = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, expand(v)]));

// inline <svg>; size in px or any CSS length; cls adds classes
export function icon(name, size = null, cls = '') {
  const body = ICONS[name] || ICONS.info;
  const dim = size ? ` width="${size}" height="${size}"` : '';
  return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24"${dim} fill="currentColor" aria-hidden="true">${body}</svg>`;
}
// the same drawing placed inside another SVG (charts)
export function iconAt(name, x, y, size, color = 'currentColor') {
  return `<svg x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" color="${color}">${ICONS[name] || ''}</svg>`;
}

// forecast confidence as one to three bars
export function signal(level, size = 16) {
  const n = { low: 1, medium: 2, high: 3 }[level] || 0;
  const bar = (i, x, h) => `<rect x="${x}" y="${21 - h}" width="5" height="${h}"${i > n ? ' opacity=".22"' : ''}/>`;
  return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${bar(1, 2.5, 7)}${bar(2, 9.5, 12)}${bar(3, 16.5, 17)}</svg>`;
}
