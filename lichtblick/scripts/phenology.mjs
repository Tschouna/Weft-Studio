// Builds data/phenology.js from MeteoSwiss phenological observations (open data, data.geo.admin.ch):
// for every station, the typical (median) day of the year when beech, larch, sweet chestnut and sycamore
// maple reach 50 % leaf colouring and 50 % leaf drop, over the last 15 seasons. The app turns this into
// an expected autumn-colour window for any spot (nearest stations, corrected for altitude).
//
//   node scripts/phenology.mjs          (behind a proxy: NODE_USE_ENV_PROXY=1 node scripts/phenology.mjs)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-phenology';
const SPECIES = { beech: ['mfags94d', 'mfags95d'], larch: ['mlard94d', 'mlard95d'], chestnut: ['mcass94d', 'mcass95d'], maple: ['macep94d', null] };
const FROM = 2011, TO = 2025;

const latin1 = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return new TextDecoder('latin1').decode(await r.arrayBuffer());
};
const rows = (text) => {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(';');
  return lines.slice(1).map((l) => Object.fromEntries(l.split(';').map((v, i) => [head[i], v])));
};
const doy = (yyyymmdd) => {
  const y = +yyyymmdd.slice(0, 4), m = +yyyymmdd.slice(4, 6), d = +yyyymmdd.slice(6, 8);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 864e5) + 1;
};
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const stations = rows(await latin1(`${BASE}/ogd-phenology_meta_stations.csv`));
const out = [];
for (const st of stations) {
  const abbr = st.station_abbr.toLowerCase();
  let data;
  try { data = rows(await latin1(`${BASE}/${abbr}/ogd-phenology_${abbr}_y.csv`)); } catch { continue; }
  const rec = { id: st.station_abbr, name: st.station_name, lat: +st.station_coordinates_wgs84_lat, lon: +st.station_coordinates_wgs84_lon, alt: Math.round(+st.station_height_masl) };
  let any = false;
  for (const [sp, [col, fall]] of Object.entries(SPECIES)) {
    const c = [], f = [];
    for (const r of data) {
      const year = +r.reference_timestamp.slice(6, 10);
      if (year < FROM || year > TO) continue;
      if (r[col]) c.push(doy(r[col]));
      if (fall && r[fall]) f.push(doy(r[fall]));
    }
    if (c.length >= 4) { rec[sp] = [Math.round(median(c)), f.length >= 4 ? Math.round(median(f)) : null, c.length]; any = true; }
  }
  if (any) out.push(rec);
}

// altitude trend per species (days per 100 m), for spots far above or below the nearest stations
const trend = {};
for (const sp of Object.keys(SPECIES)) {
  const pts = out.filter((s) => s[sp]).map((s) => [s.alt, s[sp][0]]);
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  const b = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  trend[sp] = { perHundredMetres: +(b * 100).toFixed(2), stations: n };
}

const file = fileURLToPath(new URL('../data/phenology.js', import.meta.url));
writeFileSync(file, `// Autumn colour climatology from MeteoSwiss phenological observations ${FROM}-${TO} (built by scripts/phenology.mjs).
// Each station: [median day-of-year of 50 % leaf colouring, of 50 % leaf drop, seasons observed] per species.
export const PHENO_TREND = ${JSON.stringify(trend)};
export const PHENO_STATIONS = ${JSON.stringify(out)};
`);
console.log(`${out.length} stations`, trend);
