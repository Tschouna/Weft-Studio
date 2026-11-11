// Clicks through the app in a phone-sized Chromium and saves screenshots to test/out/.
// The forecast is a made-up fixture (test/fixture-openmeteo.mjs); everything else is live.
//   node scripts/serve.mjs 8080 &  node test/ui.cjs [http://localhost:8080]
//   THEME=dark (or light, red) picks the look; DPR=1 makes small pictures.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const base = process.argv[2] || 'http://localhost:8080';
  const theme = process.env.THEME || 'light';
  const { fakeOpenMeteo } = await import('./fixture-openmeteo.mjs');
  const out = path.join(__dirname, 'out', theme);
  fs.mkdirSync(out, { recursive: true });
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const browser = await chromium.launch({ proxy, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: +(process.env.DPR || 2), locale: 'en-GB', timezoneId: 'Europe/Zurich', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.addInitScript((t) => { if (!localStorage.getItem('lb.settings')) localStorage.setItem('lb.settings', JSON.stringify({ theme: t })); }, theme);
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeOpenMeteo(r.request().url())) }));
  // optional: local thumbnails instead of Wikimedia (which rate-limits shared servers)
  const thumbs = process.env.THUMBS && JSON.parse(fs.readFileSync(process.env.THUMBS, 'utf8'));
  if (thumbs) {
    await page.route('https://commons.wikimedia.org/wiki/Special:FilePath/**', (r) => {
      const file = decodeURIComponent(r.request().url().split('Special:FilePath/')[1].split('?')[0]);
      const p = thumbs[file];
      return p && fs.existsSync(p) ? r.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(p) }) : r.continue();
    });
  }

  const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('shot', name); };
  const scroll = (sel, y) => page.evaluate(([s, top]) => document.querySelector(s).scrollTo(0, top), [sel, y]);
  const closeSheet = () => page.click('#sheet [data-close]');
  const dayCells = () => page.$$('#view-feed .ribbon [data-day]');

  // home: today, further down, another day, a day in the outlook, a date months away
  await page.goto(base);
  await page.waitForSelector('#view-feed .tt', { timeout: 30000 });
  await shot('01-home');
  await scroll('#view-feed', 620); await shot('02-home-light');
  await scroll('#view-feed', 1500); await shot('03-home-chances');
  await scroll('#view-feed', 99999); await shot('04-home-regions');
  const days = await dayCells();
  if (days.length < 8) throw new Error(`only ${days.length} days in the ribbon`);
  await days[3].click(); await page.waitForSelector('#view-feed .tt'); await shot('05-home-day4');
  await (await dayCells())[7].click(); await shot('06-home-outlook');
  await page.fill('#pickdate', `${new Date().getFullYear() + 1}-06-21`); await page.dispatchEvent('#pickdate', 'change'); await shot('07-home-far-date');
  await (await dayCells())[0].click();
  await page.waitForSelector('#view-feed .tt');

  // a spot
  await page.click('#view-feed [data-spot]');
  await page.waitForSelector('#sheet h1');
  await page.waitForTimeout(1500);
  await shot('10-spot');
  for (const [i, y] of [900, 1800, 2700, 3600].entries()) { await scroll('#sheet .sheet-inner', y); await page.waitForTimeout(600); await shot(`1${i + 1}-spot`); }
  await scroll('#sheet .sheet-inner', 0);
  await page.click('#sheet [data-act="3d"]');
  await page.waitForFunction(() => document.querySelector('#t3load')?.hidden, null, { timeout: 90000 }).catch(() => console.log('3D did not load (WebGL or network)'));
  await shot('15-3d');
  await closeSheet(); await page.waitForTimeout(300); await closeSheet();

  // map
  await page.click('[data-tab="map"]');
  await page.waitForTimeout(3500);
  await shot('20-map');
  await page.click('[data-mode="low"]'); await shot('21-map-fog');
  await page.click('[data-layers]'); await shot('22-map-layers'); await page.click('[data-layers]');
  await page.click('[data-mode="photo"]');
  await page.evaluate(() => document.querySelector('.leaflet-marker-icon .pin').parentElement.click());
  await page.waitForSelector('.leaflet-popup [data-lines]'); await shot('23-map-popup');
  await page.click('.leaflet-popup [data-lines]'); await page.waitForTimeout(1200); await shot('24-map-sun-lines');

  // night
  await page.click('[data-tab="sky"]');
  await page.waitForSelector('#skychart svg');
  await page.selectOption('#skyspot', 'grimsel');
  await page.waitForTimeout(500);
  await shot('30-night');
  for (const [i, y] of [700, 1500, 2400, 3300].entries()) { await scroll('#view-sky', y); await shot(`3${i + 1}-night`); }

  // wildlife
  await page.click('[data-tab="wild"]');
  await page.waitForSelector('#view-wild .tt', { timeout: 20000 });
  await shot('40-wildlife');
  await page.selectOption('#wspot', 'niederhorn');
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('#planner').scrollIntoView());
  await shot('41-wildlife-plan');
  await page.evaluate(() => document.querySelector('#view-wild').scrollBy(0, 760));
  await page.waitForTimeout(2500);
  await shot('42-wildlife-season');

  // spots, adding one, settings
  await page.click('[data-tab="spots"]');
  await page.waitForSelector('#view-spots .spotc');
  await shot('50-spots');
  await page.click('[data-kind="dark"]'); await shot('51-spots-dark-sky');
  await page.click('#addspot'); await page.waitForSelector('#addq'); await shot('52-add-spot'); await closeSheet();
  await page.click('#btn-settings');
  await page.waitForSelector('#mbkey');
  await shot('60-settings');
  await scroll('#sheet .sheet-inner', 800); await shot('61-settings');
  if (theme === 'light') { // switching the look works without a reload
    await scroll('#sheet .sheet-inner', 0);
    await page.click('[data-theme-pick="red"]'); await shot('62-red-night');
    if (!(await page.evaluate(() => document.documentElement.classList.contains('red')))) throw new Error('red night did not switch on');
    await page.click('[data-theme-pick="light"]');
  }
  console.log(errors.length ? `\n${errors.length} errors:\n${errors.join('\n')}` : '\nno page errors');
  await browser.close();
  process.exit(errors.some((e) => e.startsWith('pageerror')) ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
