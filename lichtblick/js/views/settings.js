// Settings: appearance, meteoblue key, alerts, your location, backup of your spots, data sources.
import { App, loadSpots, refresh, score } from '../app.js';
import { settings, saveSettings, mySpots, saveMySpots, kvGet, kvSet, getJSON } from '../store.js';
import { astroForecast, creditsUsed } from '../sources/meteoblue.js';
import { TYPES } from '../scoring.js';
import { esc, openSheet, sheetHead, toast, rerenderSheet } from '../ui.js';
import { icon } from '../icons.js';
import { THEMES, setTheme } from '../theme.js';

const THEME_ICON = { auto: 'sunrise', light: 'sun', dark: 'moon', red: 'eye' };

export function openSettings() {
  openSheet((root) => {
    const st = settings(), c = creditsUsed();
    const tier = st.meteoblueSeeing === 'yes' ? 'Seeing package available' : st.meteoblueSeeing === 'no' ? 'free packages (clouds every 3 h)' : 'not tested yet';
    const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    const types = st.alertTypes || Object.keys(TYPES);
    const sec = (title, note = '') => `<div class="sec"><div class="sec-head"><span class="eyebrow">${title}</span>${note ? `<span class="tiny faint">${note}</span>` : ''}</div>`;
    root.innerHTML = `${sheetHead('Settings')}<div class="sheet-body">
      ${sec('Appearance')}
        <div class="btns gap6" id="themes">${THEMES.map(([k, l]) => `<button class="chip" data-theme-pick="${k}" aria-pressed="${(st.theme || 'auto') === k}">${icon(THEME_ICON[k])}${l}</button>`).join('')}</div>
        <p class="tiny faint mt8">Follow the sun: light by day, dark from dusk. Red night keeps your eyes adapted to the dark while you shoot stars.</p>
      </div>
      ${sec('Night sky from meteoblue')}
        <p class="small muted">Your own API key. The free meteoblue Weather API key gives cloud layers, visibility and fog for the night (10 million credits for a year; the app spends 8 000 per spot and keeps answers 3 hours). Seeing, jet stream and the bad layer need meteoblue's Seeing package. <a href="https://docs.meteoblue.com/en/weather-apis/free-weather-api/overview" target="_blank" rel="noopener">How to get a free key</a></p>
        <label class="field mt12">API key<input type="password" id="mbkey" value="${esc(st.meteoblueKey)}" placeholder="paste your meteoblue key" autocomplete="off" spellcheck="false"></label>
        <div class="btns mt8"><button class="btn small primary" id="mbsave">${icon('check')}Save</button><button class="btn small quiet" id="mbtest">Save and test (one call)</button></div>
        <p class="tiny faint mt8" id="mbstate">Package: ${esc(tier)} · ${c.calls} calls, about ${Math.round(c.credits / 1000)}k credits used since ${new Date(c.since).toLocaleDateString('en-GB')}</p>
      </div>
      ${sec('Alerts')}
        <div class="switch"><span><b>Notify me about great chances</b><br><span class="tiny faint">Checked whenever the app refreshes (${perm === 'granted' ? 'allowed' : perm === 'denied' ? 'blocked in the browser settings' : perm === 'unsupported' ? 'this browser has no notifications; install the app to the home screen' : 'permission will be asked'})</span></span><input type="checkbox" id="anotify" ${st.notify ? 'checked' : ''}></div>
        <label class="field mt12">Only when the score is at least <b class="num" id="aminv">${st.alertMin}</b><input type="range" id="amin" min="50" max="95" step="5" value="${st.alertMin}"></label>
        <div class="switch"><span>Only my saved and own spots</span><input type="checkbox" id="afav" ${st.alertFavsOnly ? 'checked' : ''}></div>
        <div class="btns gap6 mt12" id="atypes">${Object.entries(TYPES).map(([k, t]) => `<button class="chip" data-type="${k}" aria-pressed="${types.includes(k)}">${icon(t.icon)}${esc(t.label)}</button>`).join('')}</div>
        <p class="tiny faint mt8">Chances beyond day five come from the longer-range outlook and never trigger an alert. For alerts while the app is closed, see "Push alerts" in the README (a free ntfy.sh topic and a scheduled GitHub job).</p>
      </div>
      ${sec('Spots', `${mySpots().length} of your own`)}
        <div class="switch"><span>Show the curated spots</span><input type="checkbox" id="curated" ${st.showCurated ? 'checked' : ''}></div>
        <div class="btns mt12"><button class="btn small" id="locate">${icon('locate')}Use my location for distances</button></div>
        <div class="btns mt8"><button class="btn small quiet" id="export">${icon('save')}Export my spots</button><label class="btn small quiet" style="position:relative;overflow:hidden">${icon('plus')}Import spots<input type="file" accept="application/json,.json" id="import" style="position:absolute;inset:0;opacity:0"></label></div>
        <p class="tiny faint mt8">Everything is stored on this phone only. Export now and then to keep a copy.</p>
      </div>
      ${sec('Install on your phone')}
        <p class="small muted"><b>iPhone:</b> open this page in Safari, tap Share, then <i>Add to Home Screen</i>.<br><b>Android:</b> Chrome menu, then <i>Install app</i>.<br>It then opens full screen and keeps working offline with the last forecast. To update: close the app fully and open it again, twice.</p>
      </div>
      ${sec('Where the data comes from')}
        <div class="small muted stack">
        <p><b>Forecast, days 1 to 5:</b> MeteoSwiss numerical weather models ICON-CH1-EPS and ICON-CH2-EPS (open data, CC BY 4.0), read point by point through the free <a href="https://open-meteo.com/en/docs/meteoswiss-api" target="_blank" rel="noopener">Open-Meteo MeteoSwiss API</a>.</p>
        <p><b>Outlook, days 6 to 10:</b> the ECMWF IFS model through Open-Meteo. Coarser, so those chances are marked as an outlook and scored lower.</p>
        <p><b>Live measurements and webcams:</b> MeteoSwiss SwissMetNet via data.geo.admin.ch. <b>Autumn colours:</b> MeteoSwiss phenology observations 2011 to 2025.</p>
        <p><b>Night sky:</b> meteoblue Forecast API (your key). Sun, moon, planets and Milky Way are computed on the phone with Astronomy Engine (MIT).</p>
        <p><b>Maps, heights, horizons, 3D terrain, search:</b> swisstopo (geo.admin.ch). <b>Night lights:</b> NASA Black Marble. <b>Northern lights:</b> NOAA SWPC Kp forecast. <b>Sightings:</b> iNaturalist.</p>
        <p><b>Photos:</b> Wikimedia Commons, credited on each spot. <b>Typeface:</b> Archivo (SIL Open Font License).</p>
        </div>
        <button class="btn small quiet mt12" id="clear">${icon('refresh')}Clear cached forecasts</button>
      </div>
      <p class="tiny faint mt24" style="padding-bottom:24px">Lichtblick · made for photographers in Switzerland</p>
    </div>`;

    root.querySelectorAll('[data-theme-pick]').forEach((b) => b.addEventListener('click', () => {
      setTheme(b.dataset.themePick);
      root.querySelectorAll('[data-theme-pick]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    }));
    const keyEl = root.querySelector('#mbkey');
    root.querySelector('#mbsave').addEventListener('click', () => { saveSettings({ meteoblueKey: keyEl.value.trim(), meteoblueSeeing: 'auto' }); toast('Saved'); });
    root.querySelector('#mbtest').addEventListener('click', async () => {
      saveSettings({ meteoblueKey: keyEl.value.trim(), meteoblueSeeing: 'auto' });
      const out = root.querySelector('#mbstate');
      out.textContent = 'Testing…';
      try {
        const spot = App.spots.find((s) => s.id === 'rigi') || App.spots[0];
        const mb = await astroForecast(spot, { force: true });
        out.textContent = mb ? (mb.tier === 'seeing' ? 'Works: Seeing package available (seeing, jet stream, clouds, moonlight).' : 'Works: free packages (clouds, visibility, fog every 3 h). Seeing needs a paid package.') : 'No key';
      } catch (e) { out.textContent = `meteoblue says: ${e.message}`; }
    });
    root.querySelector('#anotify').addEventListener('change', async (e) => {
      if (e.target.checked && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        if (p !== 'granted') { e.target.checked = false; toast('Notifications not allowed'); return; }
      }
      saveSettings({ notify: e.target.checked });
      if (e.target.checked) { toast('Alerts on'); score(); }
    });
    const amin = root.querySelector('#amin');
    amin.addEventListener('input', () => { root.querySelector('#aminv').textContent = amin.value; });
    amin.addEventListener('change', () => saveSettings({ alertMin: +amin.value }));
    root.querySelector('#afav').addEventListener('change', (e) => saveSettings({ alertFavsOnly: e.target.checked }));
    root.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
      saveSettings({ alertTypes: [...root.querySelectorAll('[data-type][aria-pressed="true"]')].map((x) => x.dataset.type) });
    }));
    root.querySelector('#curated').addEventListener('change', async (e) => { saveSettings({ showCurated: e.target.checked }); await loadSpots(); refresh(); });
    root.querySelector('#locate').addEventListener('click', () => App.emit('locate', true));
    root.querySelector('#export').addEventListener('click', async () => {
      const spots = mySpots();
      const blob = new Blob([JSON.stringify({ app: 'lichtblick', version: 1, exported: new Date().toISOString(), spots }, null, 1)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'lichtblick-spots.json' });
      document.body.appendChild(a); a.click(); a.remove();
    });
    root.querySelector('#import').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        const incoming = (j.spots || j).filter((s) => s && s.id && Number.isFinite(s.lat) && Number.isFinite(s.lon));
        const have = new Map(mySpots().map((s) => [s.id, s]));
        for (const s of incoming) have.set(s.id, { ...s, photos: (s.photos || []).filter((p) => !p.local) });
        saveMySpots([...have.values()]);
        await loadSpots(); refresh(); toast(`${incoming.length} spots imported`); rerenderSheet();
      } catch { toast('Not a Lichtblick spots file'); }
    });
    root.querySelector('#clear').addEventListener('click', async () => {
      const req = indexedDB.deleteDatabase('lichtblick');
      req.onsuccess = () => { toast('Cache cleared, reloading'); setTimeout(() => location.reload(), 800); };
    });
  });
}
