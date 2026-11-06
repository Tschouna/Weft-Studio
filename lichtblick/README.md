# Lichtblick

A phone app for landscape, wildlife and astro photographers in Switzerland. It answers one question: **where and when is it worth going out with the camera?**

It reads MeteoSwiss's forecast models for 62 hand-picked spots (47 landscapes and 15 wildlife places), each with an example photo, and for your own spots. Then it looks for the moments that make pictures:

| | Opportunity | What the app looks for |
|---|---|---|
| ☁️ | **Sea of fog** | Lowlands under low cloud, your viewpoint clear above it, an inversion (warmer up high than normal). Best at sunrise. |
| 🌫️ | **Fog lifting** | Mist or fog at dawn after a clear, calm night, and the sun breaking through an hour or two later. |
| 🪞 | **Mirror lake** | Wind under ~5 km/h and gusts under ~12 km/h at sunrise or sunset, no rain, lake not frozen. |
| ⚡ | **Lightning** | MeteoSwiss thunderstorm codes, or unstable air (CAPE) with showers. Scores higher after dark. |
| 🌈 | **Rainbow / storm light** | Showers and sunshine in the same hour with a low sun; it tells you which way to look. |
| ❄️ | **Fresh snow** | 4+ cm of new snow in the last 36 h, then a clear sky. |
| 🧊 | **Frozen lake** | Alpine lakes in the cold season (estimated from altitude, season and recent cold), with fresh snow or in sunshine. |
| 🌨️ | **Hoarfrost** | Four or more hours below −2 °C in near-saturated, calm air, ideally freezing fog and then sun. |
| 🍂 | **Autumn colours** | Larches, beech, chestnut or vineyards at their usual peak (MeteoSwiss phenology observations 2011-2025, nearest stations, corrected for altitude) on a sunny day. |
| 💧 | **Waterfalls** | Lots of rain in the last two days, or snow-melt season. |
| 💨 | **Foehn** | Dry, gusty south wind north of the Alps: far views and lenticular clouds. |
| 🌅 | **Sunrise / sunset** | High and mid clouds that catch colour, a clear horizon toward the sun (checked 40 km out on the forecast grid), alpenglow on peaks. With the real mountain horizon, it tells you when the sun actually clears the ridge. |
| ✨🌌 | **Stars and Milky Way** | Clear, moonless darkness; the galactic core above the *real* mountains (not just above 0°), or the summer arch overhead. |
| 🌠 | **Meteor showers** | The major showers near their peak, weighed against moon and clouds. |
| 🟢 | **Northern lights** | NOAA's Kp forecast of 7 or more, a clear sky and an open view north. |
| 🦌 | **Wildlife** | For each species at a spot: its season (rut, young, hibernation, migration) × its daily rhythm × the weather (rain, wind, heat; sunshine for marmots, thermals for eagles; falling pressure, fresh snow) × the light. Tells you the best window and where to approach from so the animals cannot smell you. |

Every opportunity has a score from 0 to 100 and the reasons in plain words ("Lowlands under 100 % low cloud (Bern, Thun) · Inversion: 6 °C warmer than normal"). 88+ is exceptional, 75+ great, 60+ good.

## The five tabs

- **Chances:** the best opportunities of the next five days across all spots, by day, filterable (light, fog, water, storms, winter, autumn, night, your favourites).
- **Map:** swisstopo's map (dark, national map or aerial) with a forecast layer over Switzerland and a 5-day time slider: *photo weather*, *fog & low cloud* (watch the sea of fog form), *all clouds*, *rain & snow*. Spots are coloured by their chance at that hour. Layers: live MeteoSwiss wind, humidity, temperature, fresh snow, snow depth, foehn and sunshine; MeteoSwiss webcams; night lights (light pollution); federal game reserves, water and migratory bird reserves, and wildlife rest zones. Long-press to add a spot.
- **Wildlife:** the best chances for animal pictures on each of the next five days, and a planner for one spot: an hour-by-hour activity chart per species over the light (golden, soft, harsh), the weather and wind hour by hour, the scent tip, what is in season there (month bars, rut, young), what people have seen and photographed within 10 km this month (iNaturalist), and a species guide for 21 Swiss species with the rules for watching them. Spots include ibex ridges (Augstmatthorn, Niederhorn, Pilatus, Pontresina), the Swiss National Park (Val Trupchun for the red deer rut, Margunet), the Saas-Fee marmots, bird reserves (Fanel, Klingnauer Stausee, Bolle di Magadino, Ermatinger Becken, Neeracherried), the Altreu storks and two wildlife parks.
- **Night sky:** for any spot and any of the next 14 nights: darkness, the moon, and **where the Milky Way stands, drawn over the real mountain horizon** as a panorama (or the whole sky), with a time slider and heights in fists at arm's length, no coordinates. Hour-by-hour clouds (MeteoSwiss), and with a meteoblue key meteoblue's cloud layers, fog, visibility and, with the Seeing package, seeing (″ and indices), jet stream and the bad layer. A 5-week moon calendar marks the Milky Way nights. Meteor showers and the northern-lights forecast.
- **Spots:** the 47 curated spots and yours. Each spot page has the photo (with credit), what is coming up there, a five-day cloud-layer chart, today's sun and moon times (including when the sun really rises over the ridge), the horizon with the sun's path, the nearest live MeteoSwiss measurements and webcams, directions and a link to the swisstopo map.

**3D view and shadows:** every spot page has a *3D view & shadows* button: swisstopo's swissALTIRegio terrain (10 m, including the border regions) draped with the SWISSIMAGE aerial photo or the national map, 18 km across or a 5 km close-up, lit from where the sun really stands. Slide through the day or press *Play the day* to watch the shadows move; jump to sunrise, the first and last sun on the spot, noon and sunset; pick today, tomorrow, the longest or shortest day, the equinox or any date. It tells you when the spot itself has direct sun (using the mountains up to 60 km away). Only the few tiles around the spot are downloaded (about 1-3 MB), then kept on the phone.

**Can you be there?** Every spot says whether you can be there in the dark (open at night, on foot only, stay overnight up there, closed at night, or protected area rules), with opening hours where access is limited (Blausee, Tierpark Goldau, the Neeracherried centre) and whether there are artificial lights on site. Chances outside the opening hours are not shown, and places closed at night get no night-sky chances.

**How dark is the sky?** Measured for every spot from NASA's satellite night lights (Black Marble): all the lit pixels within 100 km, fading with distance, with a bonus for high viewpoints above the hazy air. Shown as a Bortle-like class and the town whose glow dominates ("glow of Lucerne in the north-east"). The night-sky scores use it, the Milky Way is not suggested from city skies, and the Night tab lists the darkest spots first. Your own spots are measured on the phone the same way.

**Your own spots:** search a place (swisstopo), use where you stand, long-press the map, or **pick a photo**: the app reads the GPS position and compass direction from the photo, makes a spot there and uses the photo as its picture. It suggests what the place is good for (lake, above the fog, larches, dark sky…) and you can tick the wildlife found there; those decide which opportunities are looked for. Everything stays on your phone; *Settings → Export my spots* makes a backup.

## Getting it on your phone

It is a web app (PWA): no app store, works on iPhone and Android, installs to the home screen and works offline with the last forecast.

1. In the repository on GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (once).
2. Merge this into `main`. The *Lichtblick* workflow runs the checks and publishes the app to **https://tschouna.github.io/Weft-Studio/**.
3. On the phone, open that address:
   - **iPhone:** in Safari, Share → *Add to Home Screen*.
   - **Android:** Chrome menu ⋮ → *Install app*.

To try it on a computer first: `node lichtblick/scripts/serve.mjs` and open http://localhost:8080.

## meteoblue for the night sky

In *Settings*, paste your own meteoblue API key.

- The **free** meteoblue Weather API (sign up on meteoblue.com, account → *Weather API*, one year, 10 million credits) covers clouds every 3 hours (low, mid, high), visibility and fog probability. The app spends 8 000 credits per spot it asks about and keeps the answer for 3 hours, so normal use stays within the free credits. It shows how many it has used.
- **Seeing**, **jet stream** and the **bad layer** are in meteoblue's *Seeing* package, which is not part of the free API. With a key that includes it, the app uses it automatically (`seeing-1h`, `clouds-1h`, `moonlight-1h`).
- Without a key, the night sky still works with MeteoSwiss clouds, and each spot links to meteoblue's free astronomy-seeing web page.

## Push alerts while the app is closed

In the app, *Settings → Alerts* notifies you about great chances whenever it refreshes. For alerts when it is closed, a scheduled GitHub job runs the same detectors twice a day (early morning and mid-afternoon) and sends the best chances of the next 36 hours to your phone through [ntfy](https://ntfy.sh), a free push app for iPhone and Android:

1. Install **ntfy** and subscribe to a topic with a long, random name (anyone who knows the name can read it), e.g. `lichtblick-7f3k2q9x`.
2. In the repository: **Settings → Secrets and variables → Actions**
   - secret `NTFY_TOPIC` = that name
   - optional variables: `LICHTBLICK_URL` = `https://tschouna.github.io/Weft-Studio/` (tapping the alert opens the spot), `LICHTBLICK_MIN` = the lowest score worth a ping (default 75).
3. To include your own spots, export them in the app and commit the file as `lichtblick/data/my-spots.json`.

Try it from the *Actions* tab with *Run workflow*. Without the secret the job does nothing.

## Where the data comes from

| What | Source |
|---|---|
| Forecasts | **MeteoSwiss** numerical weather models **ICON-CH1-EPS** (1 km, 33 h) and **ICON-CH2-EPS** (2 km, 5 days), open data CC BY 4.0. MeteoSwiss publishes them as nationwide GRIB files of hundreds of megabytes, far too big for a phone, so the app reads them point by point through the free [Open-Meteo MeteoSwiss API](https://open-meteo.com/en/docs/meteoswiss-api) (`meteoswiss_icon_seamless`), which serves the MeteoSwiss data unchanged. |
| Live measurements, webcams | MeteoSwiss SwissMetNet (10-minute values) and MeteoSwiss weather cameras, from data.geo.admin.ch |
| Autumn colours | MeteoSwiss phenological observations (open data), turned into a climatology by `scripts/phenology.mjs` |
| Night sky | meteoblue Forecast API (your key) |
| Wildlife sightings | iNaturalist research-grade observations of mammals and birds (only Creative Commons photos, credited) |
| Wildlife areas | Federal Office for the Environment (FOEN) via swisstopo: game reserves, bird reserves, wildlife rest zones |
| Species seasons and behaviour | `data/species.js`, written for this app from Swiss field knowledge (rut, young, hibernation, migration) |
| Sun, moon, Milky Way | computed on the phone with [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT) |
| Maps, place search, heights, mountain horizons | swisstopo (geo.admin.ch); horizons from elevation profiles out to 60 km |
| 3D terrain and imagery | swisstopo swissALTIRegio (cloud-optimised GeoTIFF, read by range requests), SWISSIMAGE and the national map in the Swiss grid; rendered with three.js (MIT) |
| Sky darkness | NASA Black Marble 2016 night lights, measured per spot (`scripts/darkness.mjs`, `js/lightpollution.js`) |
| Opening hours | the official websites of Blausee, Tierpark Goldau, Wildnispark Zürich, BirdLife Neeracherried, Château de Chillon, Rheinfall and Grimselwelt (checked November 2026) |
| Night lights | NASA Black Marble (VIIRS, 2016) |
| Northern lights | NOAA Space Weather Prediction Center, 3-day Kp forecast |
| Spot photos | Wikimedia Commons; author and licence on each spot. The spot position is where the camera recorded it when the file says so, otherwise the classic viewpoint. |

The forecast is a model, not a promise: the scores say how promising the model looks, and the reasons say why. The frozen-lake and autumn windows are estimates from season, altitude and statistics; check a webcam before a long drive. Wildlife chances are estimates too: animals follow their own plans. Keep your distance, stay on paths in reserves, and respect the winter rest zones. The mountain horizon uses Swiss terrain only, so peaks across the border can be missing.

## Working on it

Plain HTML and JavaScript modules, no build step. Node 22 for the checks and scripts.

| Command (in `lichtblick/`) | What it does |
|---|---|
| `node scripts/serve.mjs [port]` | Serve the app locally |
| `node test/run.mjs` | Checks: the detectors with made-up forecasts for each kind of weather, astronomy against known values, geometry, data files |
| `node test/ui.cjs` | Clicks through the app in a phone-sized Chromium (with a made-up forecast) and saves screenshots in `test/out/` |
| `node scripts/phenology.mjs` | Rebuild `data/phenology.js` from MeteoSwiss open data |
| `node scripts/horizons.mjs` | Compute the mountain horizon of new curated spots (`--all` for all) |
| `node scripts/darkness.mjs` | Measure the sky darkness of the curated spots into `data/sky.js` |
| `DRY_RUN=1 node scripts/digest.mjs` | Print the push-alert digest instead of sending it |

| Path | What it is |
|---|---|
| `index.html`, `css/app.css` | The page and its look |
| `js/main.js`, `js/app.js` | Start-up, tabs, the app's state: spots, forecasts, opportunities |
| `js/scoring.js` | The opportunity detectors |
| `js/wildlife.js` | The wildlife activity model (season, rhythm, weather, light, scent) |
| `js/lightpollution.js` | Sky darkness from NASA night lights |
| `js/views/terrain3d.js`, `js/sources/terrain.js` | The 3D view: swissALTIRegio reader (BigTIFF, LZW), imagery, three.js scene with sun and shadows |
| `js/astro.js` | Sun, moon, twilight, Milky Way, meteor showers |
| `js/sources/` | MeteoSwiss, meteoblue, swisstopo, NOAA, iNaturalist |
| `js/views/` | The tabs, the spot page, settings, charts |
| `js/store.js` | Settings and your spots (localStorage), caches and photos (IndexedDB) |
| `js/exif.js` | Reads the GPS position from photos |
| `data/` | Curated spots (with night access, opening hours, lights), their horizons and sky darkness, the species guide, the autumn-colour climatology, Switzerland's outline |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline and install |
| `scripts/` | Data builders, the push digest, the local server |
| `../.github/workflows/lichtblick.yml` | Checks, GitHub Pages, scheduled push alerts |

When you add a file under `js/` or `data/`, also list it in `sw.js` (a check reminds you).

## Licences

Leaflet (BSD-2-Clause), Astronomy Engine (MIT) and three.js (MIT) are in `vendor/`. Spot photos keep their Wikimedia Commons licences (CC BY, CC BY-SA, GFDL, public domain), credited in the app. MeteoSwiss data CC BY 4.0, swisstopo open data, NASA imagery public domain.
