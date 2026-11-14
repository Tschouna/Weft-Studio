// A made-up but plausible MeteoSwiss model answer in Open-Meteo's format, for UI tests and screenshots:
// a November high-pressure spell (fog sea over the lowlands, sun above ~1000 m), then a front with
// snow down to about 1200 m, then clearing with fresh snow; a mild Ticino.
const H = 3600e3;

export function fakeOpenMeteo(url, now = Date.now()) {
  const q = new URL(url).searchParams;
  const lats = q.get('latitude').split(',').map(Number), lons = q.get('longitude').split(',').map(Number);
  const elevs = q.get('elevation') ? q.get('elevation').split(',').map(Number) : lats.map(() => null);
  const vars = q.get('hourly').split(',');
  const past = +(q.get('past_days') || 0), days = +(q.get('forecast_days') || 5);
  const t0 = Math.floor((now - past * 864e5) / 864e5) * 864e5 - H; // ~ local midnight
  const n = (past + days) * 24;
  const out = lats.map((lat, i) => {
    const lon = lons[i];
    const elev = elevs[i] ?? roughElevation(lat, lon);
    const h = { time: [] };
    for (const v of vars) h[v] = [];
    for (let k = 0; k < n; k++) {
      const t = t0 + k * H, rel = (t - now) / 864e5, lh = (new Date(t).getUTCHours() + 1) % 24;
      const w = weather(lat, lon, elev, rel, lh, k);
      h.time.push(Math.round(t / 1000));
      const gone = /meteoswiss/.test(q.get('models') || '') && t > now + 118 * H; // MeteoSwiss reaches five days
      for (const v of vars) h[v].push(gone ? null : w[v] ?? null);
    }
    return { latitude: lat, longitude: lon, elevation: elev, utc_offset_seconds: 0, timezone: 'GMT', hourly: h };
  });
  return out.length === 1 ? out[0] : out;
}

function roughElevation(lat, lon) {
  // Jura and Mittelland low, Alps high: good enough for a demo grid
  const alps = Math.max(0, 1 - Math.abs(lat - 46.45) / 0.55) * (lon > 6.8 && lon < 10.4 ? 1 : 0.5);
  return Math.round(450 + alps * 1700 + (lat > 47 && lon < 7.6 ? 400 : 0));
}

function weather(lat, lon, elev, rel, lh, k) {
  const ticino = lat < 46.4 && lon > 8.4;
  const day = Math.floor(rel + 0.5);
  const noise = (Math.sin(k * 0.7 + lat * 13 + lon * 7) + 1) / 2;
  let low = 0, mid = 5, high = 15, precip = 0, snow = 0, code = 1;
  let temp = 8 - (elev - 500) * 0.0045 + 3 * Math.sin(((lh - 9) / 24) * 2 * Math.PI);
  let wind = 3 + noise * 6, gust = wind * 1.8, rh = 70;
  if (day <= 1) {
    // high pressure: fog below ~950 m, inversion, clear and mild above
    const fogTop = 950 - (lh >= 11 && lh <= 15 ? 150 : 0);
    if (elev < fogTop && !ticino) { low = 100; temp = 2 + noise; rh = 99; code = 45; wind = 2; }
    else { low = 0; temp = 9 - (elev - 1000) * 0.003; rh = 35; high = day === 1 && (lh > 14) ? 45 : 10; }
  } else if (day === 2) {
    // a front
    low = 85; mid = 90; high = 90; precip = 0.6 + noise * 1.6; code = 63; rh = 95; wind = 12 + noise * 10; gust = wind * 2.2;
    temp = 6 - (elev - 500) * 0.006;
    if (temp < 1) { snow = precip * 0.9; code = 73; }
    if (ticino && lh > 15) { code = 95; precip = 4; }
  } else {
    // clearing behind it, fresh snow up high, calm morning
    low = day === 3 && lh < 10 ? 50 : 5; mid = 10; high = lh > 15 ? 40 : 10;
    temp = 1 - (elev - 500) * 0.006 + 3 * Math.sin(((lh - 9) / 24) * 2 * Math.PI); rh = 75; wind = lh < 9 ? 1 : 5;
  }
  const cloud = Math.min(100, Math.max(low, mid, high) + 0.3 * Math.min(low, mid));
  const dark = lh < 7 || lh > 17;
  return {
    temperature_2m: +temp.toFixed(1), relative_humidity_2m: rh, dew_point_2m: +(temp - (100 - rh) / 5).toFixed(1),
    precipitation: +precip.toFixed(1), precipitation_probability: precip > 0 ? 80 : 5, snowfall: +snow.toFixed(1), snow_depth: 0,
    weather_code: code, cloud_cover: Math.round(cloud), cloud_cover_low: Math.round(low), cloud_cover_mid: Math.round(mid), cloud_cover_high: Math.round(high),
    wind_speed_10m: +wind.toFixed(1), wind_direction_10m: 250, wind_gusts_10m: +gust.toFixed(1), cape: ticino && day === 2 ? 1200 : 0,
    freezing_level_height: 2600, pressure_msl: day <= 0 ? 1021 : day === 1 ? 1021 - (lh / 24) * 9 : day === 2 ? 1009 : 1017, sunshine_duration: dark || low > 80 || precip > 0 ? 0 : 3600 * (1 - cloud / 140), visibility: low > 90 ? 200 : 40000,
  };
}
