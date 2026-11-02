// Click through every object in the browser build, shuffle each a few times and screenshot it:
// node test/ui-objects.cjs [object keys...]
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
  await new Promise((r) => server.listen(8792, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('https://cdn.jsdelivr.net/npm/**', (route) => { const m = new URL(route.request().url()).pathname.match(/^\/npm\/(three|fflate)@[^/]+\/(.*)$/); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, m[1], m[2])) }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('http://localhost:8792/');
  await page.waitForSelector('#readout strong', { timeout: 120000 });
  const idle = async () => { await page.waitForFunction(() => !document.querySelector('#busy').classList.contains('show'), null, { timeout: 240000 }); await page.waitForTimeout(700); };
  await idle();
  if ((await page.getAttribute('#t-spin', 'aria-pressed')) === 'true') await page.click('#t-spin');
  if ((await page.getAttribute('#t-handles', 'aria-pressed')) === 'true') await page.click('#t-handles');
  const objs = process.argv.slice(2);
  const shuffles = Number(process.env.SHUFFLES || 0);
  for (const label of objs) {
    await page.click('#tab-object');
    await page.locator('#pane-object button.obj').filter({ has: page.locator('b', { hasText: new RegExp(`^${label}$`) }) }).first().click();
    await idle();
    const shot = async (tag) => {
      const name = await page.inputValue('#design-name');
      await page.screenshot({ path: path.join(OUT, `o-${label.replace(/\W+/g, '').toLowerCase()}-${tag}.png`) });
      console.log(label, tag, name, '|', await page.textContent('#kind'), '|', (await page.textContent('#status-text')).trim(), '|', (await page.textContent('#readout')).replace(/\s+/g, ' ').trim());
    };
    await shot('default');
    if (process.env.GLOW && (await page.isVisible('#t-glow'))) { await page.click('#t-glow'); await idle(); await shot('glow'); await page.click('#t-glow'); }
    for (let k = 0; k < shuffles; k++) { await page.click('#shuffle'); await idle(); await shot(`s${k}`); }
  }
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close(); server.close();
})().catch((e) => { console.error(e); process.exit(1); });
