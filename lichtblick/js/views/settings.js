// Settings: meteoblue key, alerts, your location, backup of your spots, data sources.
import { App, loadSpots, refresh, score } from '../app.js';
import { settings, saveSettings, mySpots, saveMySpots, kvGet, kvSet, getJSON } from '../store.js';
import { astroForecast, creditsUsed } from '../sources/meteoblue.js';
import { TYPES } from '../scoring.js';
import { esc, openSheet, sheetHead, toast, rerenderSheet } from '../ui.js';

export function openSettings() {
  openSheet((root) => {
    const st = settings(), c = creditsUsed();
    const tier = st.meteoblueSeeing === 'yes' ? 'Seeing package available' : st.meteoblueSeeing === 'no' ? 'free packages (clouds every 3 h)' : 'not tested yet';
    const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    const types = st.alertTypes || Object.keys(TYPES);
    root.innerHTML = `${sheetHead('Settings')}<div class="pad">
      <div class="section"><h3>meteoblue (night sky)</h3>
        <p class="small muted">Your own API key. The free meteoblue Weather API key gives cloud layers, visibility and fog for the night (10 million credits for a year; the app spends 8 000 per spot and keeps answers 3 hours). Seeing, jet stream and the bad layer need meteoblue's Seeing package. <a href="https://docs.meteoblue.com/en/weather-apis/free-weather-api/overview" target="_blank" rel="noopener">How to get a free key ↗</a></p>
        <label class="field">API key<input type="password" id="mbkey" value="${esc(st.meteoblueKey)}" placeholder="paste your meteoblue key" autocomplete="off" spellcheck="false"></label>
        <div class="btns"><button class="btn small" id="mbsave">Save</button><button class="btn small ghost" id="mbtest">Save & test (one call)</button></div>
        <p class="small muted" id="mbstate">Package: ${esc(tier)} · ${c.calls} calls, about ${Math.round(c.credits / 1000)}k credits used since ${new Date(c.since).toLocaleDateString('en-GB')}</p>
      </div>
      <hr>
      <div class="section"><h3>Alerts</h3>
        <div class="switch"><span>Notify me about great chances<br><span class="tiny faint">Checked whenever the app refreshes (${perm === 'granted' ? 'allowed' : perm === 'denied' ? 'blocked in the browser settings' : perm === 'unsupported' ? 'this browser has no notifications; install the app to the home screen' : 'permission will be asked'})</span></span><input type="checkbox" id="anotify" ${st.notify ? 'checked' : ''}></div>
        <label class="field">Only when the score is at least <b id="aminv">${st.alertMin}</b><input type="range" id="amin" min="50" max="95" step="5" value="${st.alertMin}" style="accent-color:var(--gold)"></label>
        <div class="switch"><span>Only my favourites and own spots</span><input type="checkbox" id="afav" ${st.alertFavsOnly ? 'checked' : ''}></div>
        <div class="tags" style="margin-top:10px" id="atypes">${Object.entries(TYPES).map(([k, t]) => `<button class="chip" data-type="${k}" aria-pressed="${types.includes(k)}">${t.icon} ${esc(t.label)}</button>`).join('')}</div>
        <p class="tiny faint">For alerts while the app is closed, see "Push alerts" in the README (a free ntfy.sh topic and a scheduled GitHub job).</p>
      </div>
      <hr>
      <div class="section"><h3>Spots</h3>
        <div class="switch"><span>Show the curated spots</span><input type="checkbox" id="curated" ${st.showCurated ? 'checked' : ''}></div>
        <div class="btns" style="margin-top:10px"><button class="btn small" id="locate">📍 Use my location for distances</button></div>
        <div class="btns" style="margin-top:10px"><button class="btn small ghost" id="export">Export my spots</button><label class="btn small ghost" style="position:relative;overflow:hidden">Import spots<input type="file" accept="application/json,.json" id="import" style="position:absolute;inset:0;opacity:0"></label></div>
        <p class="tiny faint">${mySpots().length} spots of your own. Everything is stored on this phone only.</p>
      </div>
      <hr>
      <div class="section"><h3>Install on your phone</h3>
        <p class="small muted"><b>iPhone:</b> open this page in Safari, tap Share, then <i>Add to Home Screen</i>.<br><b>Android:</b> Chrome menu ⋮ → <i>Install app</i>.<br>It then opens full screen and keeps working offline with the last forecast.</p>
      </div>
      <hr>
      <div class="section small muted"><h3>Data</h3>
        <p><b>Forecast:</b> MeteoSwiss numerical weather models ICON-CH1-EPS and ICON-CH2-EPS (open data, CC BY 4.0), read point by point through the free <a href="https://open-meteo.com/en/docs/meteoswiss-api" target="_blank" rel="noopener">Open-Meteo MeteoSwiss API</a>.</p>
        <p><b>Live measurements & webcams:</b> MeteoSwiss SwissMetNet via data.geo.admin.ch. <b>Autumn colours:</b> MeteoSwiss phenology observations 2011-2025.</p>
        <p><b>Night sky:</b> meteoblue Forecast API (your key). Sun, moon and Milky Way computed on the phone with Astronomy Engine (MIT).</p>
        <p><b>Maps, heights, horizons, search:</b> swisstopo (geo.admin.ch). <b>Night lights:</b> NASA Black Marble. <b>Northern lights:</b> NOAA SWPC Kp forecast.</p>
        <p><b>Photos:</b> Wikimedia Commons, credited on each spot.</p>
        <button class="btn small ghost" id="clear">Clear cached forecasts</button>
      </div>
    </div>`;

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
