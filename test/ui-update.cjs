// Clicks through the 1.1 additions in the browser build and reports any page errors.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), WEB = path.join(ROOT, 'web'), NM = path.join(ROOT, 'node_modules'), OUT = path.join(__dirname, 'out');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/standalone.html';
  const f = path.join(WEB, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise((r) => server.listen(8792, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(240000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('https://cdn.jsdelivr.net/npm/**', (route) => { const m = new URL(route.request().url()).pathname.match(/^\/npm\/(three|fflate)@[^/]+\/(.*)$/); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, m[1], m[2])) }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('http://localhost:8792/');
  await page.waitForSelector('#readout strong', { timeout: 120000 });
  await page.click('#t-spin');
  const idle = async () => { await page.waitForFunction(() => !document.querySelector('#busy').classList.contains('show'), null, { timeout: 180000 }); await page.waitForTimeout(500); };
  const state = async (tag) => console.log(tag.padEnd(22), (await page.textContent('#kind')).padEnd(38), '|', await page.textContent('#status-text'));
  await page.click('#tab-object');
  await page.click('.obj:has-text("Table lamp")'); await idle(); await state('table lamp');
  console.log('  light button visible:', await page.isVisible('#t-glow'), '| lamp options:', await page.locator('#pane-object .ctl label').allTextContents());
  await page.click('.obj:has-text("Planter")'); await idle();
  await page.click('#pane-object button:text-is("Self-watering")'); await idle(); await state('self-watering');
  console.log('  parts:', (await page.textContent('#readout')).replace(/\s+/g, ' '));
  await page.click('#tab-surface');
  const tiles = ['Knurl', 'Cubes', 'Gouge', 'Seigaiha', 'Herringbone', 'Perforated'];
  for (const t of tiles) { await page.click(`#pane-surface .pat:has-text("${t}")`); await idle(); await state(`tile ${t}`); }
  await page.click('#pane-surface .pat:has-text("Ribs")'); await idle();
  const sw = page.locator('#pane-surface .ctl:has(#s-swirl) .ctl-val');
  await sw.click(); await sw.fill('120'); await sw.press('Enter'); await idle();
  await state('ribs swirl 120'); console.log('  swirl value:', await sw.inputValue());
  await page.screenshot({ path: path.join(OUT, 'ui-swirl.png') });
  for (let k = 0; k < 6; k++) { await page.click('#shuffle'); await idle(); await state(`shuffle ${k + 1}`); }
  await page.click('#tab-object'); await page.click('.obj:has-text("Table lamp")'); await idle();
  for (let k = 0; k < 3; k++) { await page.click('#shuffle'); await idle(); await state(`lamp shuffle ${k + 1}`); }
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
