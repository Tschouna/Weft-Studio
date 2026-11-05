// Northern lights over Switzerland need a strong geomagnetic storm (Kp 7 or more for a glow low in the
// north that a camera picks up; Kp 8-9 for the red skies of May and October 2024). NOAA's 3-day Kp
// forecast is public and allows requests from any page.
import { cached } from '../store.js';

const URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';

export async function kpForecast() {
  const res = await cached('kp', 3 * 3600e3, async () => {
    const r = await fetch(URL);
    if (!r.ok) throw new Error(`NOAA answered ${r.status}`);
    const j = await r.json();
    // either a list of objects, or the older table form with a header row
    const rows = Array.isArray(j[0]) ? j.slice(1).map((x) => ({ time_tag: x[0], kp: x[1], observed: x[2] })) : j;
    return rows.map((x) => ({ t: Date.parse(x.time_tag + (x.time_tag.endsWith('Z') ? '' : 'Z')), kp: +x.kp, kind: x.observed }))
      .filter((x) => Number.isFinite(x.t) && Number.isFinite(x.kp));
  });
  return res.data;
}
