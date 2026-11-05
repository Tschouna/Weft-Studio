// Clicks through the app in a phone-sized Chromium and saves screenshots to test/out/.
// The MeteoSwiss model answer is a made-up fixture (test/fixture-openmeteo.mjs); everything else is live.
//   node scripts/serve.mjs 8080 &  node test/ui.cjs [http://localhost:8080]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const base = process.argv[2] || 'http://localhost:8080';
  const { fakeOpenMeteo } = await import('./fixture-openmeteo.mjs');
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const browser = await chromium.launch({ proxy });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: +(process.env.DPR || 2), locale: 'en-GB', timezoneId: 'Europe/Zurich', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.route('https://api.open-meteo.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeOpenMeteo(r.request().url())) }));
  // optional: local thumbnails instead of Wikimedia (which rate-limits shared servers)
  const thumbs = process.env.THUMBS && JSON.parse(fs.readFileSync(process.env.THUMBS, 'utf8'));
  if (thumbs) await page.route('https://commons.wikimedia.org/wiki/Special:FilePath/**', (r) => {
    const file = decodeURIComponent(r.request().url().split('Special:FilePath/')[1].split('?')[0]);
    const p = thumbs[file];
    return p && fs.existsSync(p) ? r.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(p) }) : r.continue();
  });

  const shot = async (name) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('shot', name); };
  await page.goto(base);
  await page.waitForSelector('.opcard', { timeout: 30000 });
  await shot('1-feed');
  await page.click('.opcard');
  await page.waitForSelector('.sheet .spot-title');
  await page.waitForTimeout(1500);
  await shot('2-spot');
  await page.evaluate(() => document.querySelector('.sheet-inner').scrollTo(0, 900));
  await shot('3-spot-charts');
  await page.evaluate(() => document.querySelector('.sheet-inner').scrollTo(0, 1700));
  await page.waitForTimeout(1500);
  await shot('4-spot-live');
  await page.click('.sheet [data-close]');
  await page.click('[data-tab="map"]');
  await page.waitForTimeout(3500);
  await shot('5-map');
  await page.click('[data-mode="low"]');
  await shot('6-map-fog');
  await page.click('[data-tab="sky"]');
  await page.waitForSelector('#skychart svg');
  await page.selectOption('#skyspot', 'grimsel');
  await page.waitForTimeout(500);
  await shot('7-sky');
  await page.evaluate(() => document.querySelector('#view-sky').scrollTo(0, 650));
  await shot('8-sky-hours');
  await page.click('[data-tab="wild"]');
  await page.waitForSelector('#view-wild .opcard', { timeout: 20000 }).catch(async (e) => { console.log(await page.evaluate(() => document.querySelector('#view-wild').innerText.slice(0, 400))); throw e; });
  await shot('11-wildlife');
  await page.selectOption('#wspot', 'niederhorn');
  await page.waitForTimeout(800);
  await page.evaluate(() => document.querySelector('#planner').scrollIntoView());
  await shot('12-wildlife-plan');
  await page.evaluate(() => document.querySelector('#view-wild').scrollBy(0, 760));
  await page.waitForTimeout(2500);
  await shot('13-wildlife-season');
  await page.click('[data-tab="spots"]');
  await page.waitForSelector('#view-spots .spotrow');
  await shot('9-spots');
  await page.click('#btn-settings');
  await page.waitForSelector('#mbkey');
  await shot('10-settings');
  console.log(errors.length ? `\n${errors.length} errors:\n${errors.join('\n')}` : '\nno page errors');
  await browser.close();
  process.exit(errors.some((e) => e.startsWith('pageerror')) ? 1 : 0);
})();
