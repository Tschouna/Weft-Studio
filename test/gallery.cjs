// Screenshots of collection pieces in the browser build: node test/gallery.cjs 20 21 22 ...
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), WEB = path.join(ROOT, 'web'), NM = path.join(ROOT, 'node_modules'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/standalone.html';
  const f = path.join(WEB, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
});
(async () => {
  await new Promise((r) => server.listen(8791, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('https://cdn.jsdelivr.net/npm/**', (route) => { const m = new URL(route.request().url()).pathname.match(/^\/npm\/(three|fflate)@[^/]+\/(.*)$/); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, m[1], m[2])) }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('http://localhost:8791/');
  await page.waitForSelector('#readout strong', { timeout: 120000 });
  await page.click('#t-spin');
  if ((await page.getAttribute('#t-handles', 'aria-pressed')) === 'true') await page.click('#t-handles');
  const idle = async () => { await page.waitForFunction(() => !document.querySelector('#busy').classList.contains('show'), null, { timeout: 180000 }); await page.waitForTimeout(900); };
  const extra = JSON.parse(process.env.STEPS || '[]');
  for (const idx of process.argv.slice(2).map(Number)) {
    await page.evaluate((k) => document.querySelectorAll('#collection-grid .card')[k].click(), idx); await idle();
    const name = await page.inputValue('#design-name');
    for (const sel of extra) { await page.click(sel); await idle(); }
    await page.screenshot({ path: path.join(OUT, `g-${idx}-${name.toLowerCase()}.png`) });
    console.log(idx, name, '|', (await page.textContent('#kind')), '|', (await page.textContent('#status-text')), '|', (await page.textContent('#readout')).replace(/\s+/g, ' '));
  }
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
