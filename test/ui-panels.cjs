// The Panels compartment in the browser build: it opens, switches views, picks a pattern, shuffles,
// undoes, and downloads print files whose 3MF tiles are closed meshes. npm run web first, then:
// node test/ui-panels.cjs
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const { unzipSync, strFromU8 } = require('fflate');
const ROOT = path.join(__dirname, '..'), WEB = path.join(ROOT, 'web'), NM = path.join(ROOT, 'node_modules'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/standalone.html';
  const f = path.join(WEB, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' }); res.end(fs.readFileSync(f));
});
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
// a 3MF mesh is closed when every edge is used once each way
function closed(xml) {
  const objs = [...xml.matchAll(/<mesh><vertices>([\s\S]*?)<\/vertices><triangles>([\s\S]*?)<\/triangles><\/mesh>/g)];
  let bad = 0, tris = 0;
  for (const [, , t] of objs) {
    const e = new Map();
    for (const m of t.matchAll(/v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) {
      const [a, b, c] = [+m[1], +m[2], +m[3]]; tris++;
      for (const [x, y] of [[a, b], [b, c], [c, a]]) { const k = `${x},${y}`; e.set(k, (e.get(k) || 0) + 1); }
    }
    for (const [k, n] of e) { const [x, y] = k.split(','); if (n !== 1 || e.get(`${y},${x}`) !== 1) bad++; }
  }
  return { meshes: objs.length, bad, tris };
}
(async () => {
  await new Promise((r) => server.listen(8793, r));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  // software rendering in CI is slow: give every step room
  page.setDefaultTimeout(240000);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.route('https://cdn.jsdelivr.net/npm/**', (route) => { const m = new URL(route.request().url()).pathname.match(/^\/npm\/(three|fflate)@[^/]+\/(.*)$/); route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(NM, m[1], m[2])) }); });
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const idle = async () => { await page.waitForTimeout(300); await page.waitForFunction(() => !document.querySelector('#panels .busy')?.classList.contains('show'), null, { timeout: 240000 }); };
  await page.goto('http://localhost:8793/');
  await page.waitForSelector('#readout strong', { timeout: 120000 });
  await page.click('.views a[data-view="panels"]');
  await page.waitForSelector('#pn-readout strong', { timeout: 180000 });
  await idle();
  check(await page.isVisible('#pn-stage') && !(await page.isVisible('#stage')), 'Panels replaces the studio');
  check(/tiles/.test(await page.textContent('#pn-readout')), `readout: ${(await page.textContent('#pn-readout')).replace(/\s+/g, ' ')}`);
  for (const v of ['tiles', 'print', 'wall']) { await page.click(`.pn-stage .seg button[data-v="${v}"]`); await idle(); }
  check(await page.$eval('.pn-labels', (e) => e.hidden), 'tile names hide on the wall view');
  await page.click('#pn-tab-pattern');
  await page.evaluate(() => [...document.querySelectorAll('#pn-pane-pattern .pat')].find((b) => b.textContent.includes('Basalt')).click());
  await idle();
  check(/Basalt/.test(await page.textContent('#pn-kind')), `pattern picked: ${await page.textContent('#pn-kind')}`);
  await page.click('#pn-tab-tiles');
  check(await page.$$eval('#pn-map svg text', (t) => t.length) > 1, 'the tile map names the tiles');
  const before = await page.textContent('#pn-kind');
  await page.click('#panels .shuffle-btn, #panels .pill-btn:has-text("Shuffle")');
  await idle();
  await page.click('#undo');
  await idle();
  check(await page.textContent('#pn-kind') === before, 'undo brings back the panel before the shuffle');
  await page.screenshot({ path: path.join(OUT, 'panels.png') });
  // fit test
  await page.evaluate(() => { const b = [...document.querySelectorAll('#pn-pane-tiles button')].find((x) => /fit test/.test(x.textContent)); b?.click(); });
  const fit = await page.waitForEvent('download', { timeout: 120000 }).catch(() => null);
  if (fit) {
    // a zip, so the web version can save it too: the 3MF, an STL per piece and a note
    const z = unzipSync(fs.readFileSync(await fit.path())), inner = Object.keys(z).find((n) => n.endsWith('.3mf'));
    const c = closed(strFromU8(unzipSync(z[inner])['3D/3dmodel.model']));
    check(fit.suggestedFilename().endsWith('.zip') && Object.keys(z).some((n) => n.endsWith('.stl')) && c.meshes >= 2 && !c.bad, `fit test zip: ${Object.keys(z).length} files, ${c.meshes} meshes, ${c.bad} open edges`);
  }
  else check(false, 'fit test downloads');
  // an elevation model, as swisstopo's XYZ text: a 2 m grid in LV95
  await page.click('#pn-tab-pattern');
  await page.evaluate(() => [...document.querySelectorAll('#pn-pane-pattern .pat')].find((b) => b.textContent.includes('Terrain')).click());
  await idle();
  const L = ['X Y Z'];
  for (let j = 0; j < 60; j++) for (let i = 0; i < 80; i++) L.push(`${(2600001 + i * 2).toFixed(2)} ${(1199999 - j * 2).toFixed(2)} ${(1500 + 700 * Math.exp(-(((i - 40) / 18) ** 2) - (((j - 28) / 16) ** 2))).toFixed(4)}`);
  await page.setInputFiles('#pn-pane-pattern input[type=file]', { name: 'swissalti3d_test.xyz', mimeType: 'text/plain', buffer: Buffer.from(L.join('\r\n')) });
  await page.waitForFunction(() => /tile/.test(document.querySelector('#pn-pane-pattern')?.textContent || '') && /1,500|1500/.test(document.querySelector('#pn-pane-pattern').textContent), null, { timeout: 120000 });
  await idle();
  check(/Terrain/.test(await page.textContent('#pn-kind')), `elevation model loaded: ${(await page.textContent('#pn-pane-pattern .note')).slice(0, 90)}…`);
  await page.screenshot({ path: path.join(OUT, 'panels-terrain.png') });
  // the diffuser, as a relief (the starting panel is ribs)
  await page.evaluate(() => [...document.querySelectorAll('#pn-pane-pattern .seg button')].find((b) => b.textContent === 'Relief').click());
  await idle();
  await page.evaluate(() => [...document.querySelectorAll('#pn-pane-pattern .pat')].find((b) => b.textContent.includes('Diffuser')).click());
  await idle();
  check(/Diffuser/.test(await page.textContent('#pn-kind')) && !!(await page.$('#pn-groove')), 'diffuser picked, with its groove control');
  await page.screenshot({ path: path.join(OUT, 'panels-diffuser.png') });
  // print files at draft detail
  await page.click('#pn-tab-export');
  await page.evaluate(() => [...document.querySelectorAll('#pn-pane-export .chip')].find((b) => b.textContent === 'Draft').click());
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), page.click('#pn-pane-export .btn.primary')]);
  const zip = unzipSync(fs.readFileSync(await dl.path()));
  const names = Object.keys(zip);
  check(['wall-template.svg', 'assembly-map.svg', 'parts-list.csv', 'print-settings.txt'].every((f) => names.includes(f)), `zip: ${names.length} files (${names.slice(0, 6).join(', ')}…)`);
  let meshes = 0, bad = 0;
  for (const n of names.filter((f) => f.endsWith('.3mf'))) { const inner = unzipSync(zip[n]); const c = closed(strFromU8(inner['3D/3dmodel.model'])); meshes += c.meshes; bad += c.bad; }
  check(meshes > 1 && !bad, `3MF tiles: ${meshes} meshes, ${bad} open edges`);
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  if (errors.length) failures++;
  await browser.close(); server.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
