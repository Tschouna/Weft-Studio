// Weft 2.0 and the classic design: switching keeps the design on the stage, and the choice is remembered.
// npm run web first, then: node test/ui-switch.cjs
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), WEB = path.join(ROOT, 'web'), NM = path.join(ROOT, 'node_modules');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/standalone.html';
  const f = path.join(WEB, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
});
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
(async () => {
  await new Promise((r) => server.listen(8794, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('https://cdn.jsdelivr.net/npm/**', (route) => { const m = new URL(route.request().url()).pathname.match(/^\/npm\/(three|fflate)@[^/]+\/(.*)$/); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, m[1], m[2])) }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const ready = () => page.waitForSelector('#readout strong', { timeout: 120000 });
  await page.goto('http://localhost:8794/'); await ready();
  check(await page.getAttribute('meta[name="weft-ui"]', 'content') === 'v2', 'opens in Weft 2.0');
  // the collection is its own view; opening a piece returns to the studio
  await page.click('.views a[data-view="collection"]');
  check(await page.isVisible('#collection-grid') && !(await page.isVisible('#stage')), 'Collection replaces the studio');
  await page.click('#collection-filters button[data-f="light"]');
  const shown = await page.$$eval('#collection-grid .card', (cs) => cs.filter((c) => !c.hidden).length);
  check(shown === 6, `Lighting filter shows 6 pieces (${shown})`);
  await page.click('#collection-filters button[data-f="all"]');
  await page.evaluate(() => [...document.querySelectorAll('#collection-grid .card')].find((c) => c.textContent.includes('Agave')).click());
  check(await page.isVisible('#stage') && (await page.inputValue('#design-name')) === 'Agave', 'opening Agave shows it in the studio');
  await page.click('#tab-surface');
  // a folded section stays folded
  await page.click('#pane-surface .group-head h3');
  check(await page.$eval('#pane-surface .group', (g) => g.classList.contains('collapsed')), 'a section folds from its heading');
  await page.click('#pane-surface .group-head h3');
  // switch to classic: same design, same step
  await Promise.all([page.waitForURL(/classic\.html/), page.click('#ui-switch')]); await ready();
  check(await page.getAttribute('meta[name="weft-ui"]', 'content') === 'classic', 'Classic loads');
  check((await page.inputValue('#design-name')) === 'Agave', 'the design comes along to Classic');
  check((await page.getAttribute('#tab-surface', 'aria-selected')) === 'true', 'and so does the open step');
  // the choice is remembered: the start page sends you to classic
  await page.goto('http://localhost:8794/'); await page.waitForURL(/classic\.html/); await ready();
  check(true, 'Classic is remembered in this browser');
  await Promise.all([page.waitForURL((u) => !/classic\.html/.test(u.toString())), page.click('#ui-switch')]); await ready();
  check(await page.getAttribute('meta[name="weft-ui"]', 'content') === 'v2', 'and switching back returns to 2.0');
  check(errors.length === 0, errors.length ? errors.join('\n') : 'no page errors');
  await browser.close(); server.close();
  console.log(failures ? `${failures} failed` : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
