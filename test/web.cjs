// Opens the browser build (web/standalone.html) with the CDN libraries served from node_modules.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), WEB = path.join(ROOT, 'web'), NM = path.join(ROOT, 'node_modules');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/standalone.html';
  const f = path.join(WEB, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise((r) => server.listen(8790, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('https://cdn.jsdelivr.net/npm/**', (route) => { const m = new URL(route.request().url()).pathname.match(/^\/npm\/(three|fflate)@[^/]+\/(.*)$/); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, m[1], m[2])) }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('http://localhost:8790/');
  await page.waitForSelector('#readout strong', { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('#busy').classList.contains('show'), null, { timeout: 120000 });
  console.log('title', await page.title(), '| desktop', await page.evaluate(() => !!window.weftDesktop), '| slicer button', await page.locator('#to-slicer').count());
  await page.click('#tab-export');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 240000 }), page.click('#dl')]);
  console.log('download', dl.suggestedFilename());
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
