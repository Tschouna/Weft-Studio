// Launches the desktop app (under xvfb), clicks through the main flows and saves screenshots to test/out.
// Run: xvfb-run -a node test/smoke.cjs
const { _electron: electron } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const step = (m) => console.log(new Date().toISOString().slice(11, 19), m);
(async () => {
  const userData = fs.mkdtempSync('/tmp/weft-ud-');
  const app = await electron.launch({
    executablePath: require(path.join(ROOT, 'node_modules/electron')),
    args: [ROOT, '--no-sandbox', `--user-data-dir=${userData}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
  });
  const errors = [];
  const win = await app.firstWindow();
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await win.setViewportSize({ width: 1440, height: 880 }).catch(() => {});
  await win.waitForSelector('#readout strong', { timeout: 120000 });
  const idle = async () => { await win.waitForFunction(() => !document.querySelector('#busy').classList.contains('show'), null, { timeout: 180000 }); await win.waitForTimeout(800); };
  await idle();
  step('loaded: ' + (await win.title()) + ' | ' + (await win.textContent('#readout')).replace(/\s+/g, ' '));
  await win.evaluate(() => document.fonts.ready);
  console.log('desktop bridge', await win.evaluate(() => !!window.weftDesktop), '| fonts', await win.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`).join(', ')));
  console.log('worker engine', await win.evaluate(() => typeof Worker));
  await win.click('#t-spin');
  await win.screenshot({ path: path.join(OUT, 'app-studio.png') });
  // menu command: shuffle via the main process
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'shuffle', 'surface'));
  await idle();
  step('after menu shuffle: ' + (await win.textContent('#kind')) + ' | title ' + (await win.title()));
  // export: stub the save dialog to write into /tmp
  await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: '/tmp/weft-export-' + o.defaultPath.split(/[\\/]/).pop() }); });
  await win.click('#tab-export');
  await win.click('#dl');
  await win.waitForSelector('#toast.show', { timeout: 240000 });
  step('export toast: ' + (await win.textContent('#toast')));
  await win.screenshot({ path: path.join(OUT, 'app-export.png') });
  // design file round trip
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'save'));
  await win.waitForTimeout(1500);
  const saved = fs.readdirSync('/tmp').filter((f) => f.startsWith('weft-export-'));
  console.log('written files', saved.map((f) => `${f} ${(fs.statSync('/tmp/' + f).size / 1024).toFixed(0)} kB`).join(', '));
  const weftFile = saved.find((f) => f.endsWith('.weft'));
  if (weftFile) {
    const text = fs.readFileSync('/tmp/' + weftFile, 'utf8');
    await app.evaluate(({ BrowserWindow }, t) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'load-design', { text: t }), text.replace(/"name": "[^"]*"/, '"name": "Roundtrip"'));
    await idle();
    step('loaded design file: ' + (await win.inputValue('#design-name')) + ' | title ' + (await win.title()));
  }
  await win.screenshot({ path: path.join(OUT, 'app-loaded.png') });
  // the design switch: Classic through the View menu, then back to Weft 2.0, keeping the design
  const ui = async (to) => {
    await app.evaluate(({ BrowserWindow }, t) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'ui', t), to);
    await win.waitForFunction((t) => document.querySelector('meta[name="weft-ui"]')?.content === t && !!document.querySelector('#readout strong'), to, { timeout: 120000 });
    await idle();
    step(`design ${to}: ${await win.inputValue('#design-name')} | ${win.url()}`);
  };
  await ui('classic');
  await win.screenshot({ path: path.join(OUT, 'app-classic.png') });
  await ui('v2');
  // the Panels compartment: open it from the View menu and export its files
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'panels'));
  await win.waitForSelector('#pn-readout strong', { timeout: 180000 });
  await win.waitForFunction(() => !document.querySelector('#panels .busy').classList.contains('show'), null, { timeout: 180000 });
  step('panels: ' + (await win.textContent('#pn-readout')).replace(/\s+/g, ' '));
  await win.screenshot({ path: path.join(OUT, 'app-panels.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('menu', 'export'));
  await win.waitForFunction(() => /panel-files/.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 600000 });
  step('panel export: ' + (await win.textContent('#toast')));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors');
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
