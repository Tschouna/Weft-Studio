// Weft Studio desktop shell: one window around the studio in ../app, a native menu, real file dialogs,
// "open in slicer", .weft design files and (once a GitHub repo is configured) automatic updates.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, protocol, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const pkg = require('../package.json');

const APP_DIR = path.join(__dirname, '..', 'app');
const SCHEME = 'weft';
const ORIGIN = `${SCHEME}://studio`;

// The studio is served from a private scheme so ES modules, module workers and storage behave as on the web.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

// ---------------------------------------------------------------- settings (window size, folders, recent files)
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = {};
function loadSettings() {
  try { settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { settings = {}; }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch { /* not fatal */ }
}
const exportDir = () => settings.exportDir || path.join(app.getPath('documents'), 'Weft Studio');

// ---------------------------------------------------------------- window
let win = null;
let pendingOpen = null; // a .weft file passed on the command line before the page was ready

function createWindow() {
  const b = settings.bounds || {};
  win = new BrowserWindow({
    width: b.width || 1440, height: b.height || 900, x: b.x, y: b.y,
    minWidth: 960, minHeight: 640,
    title: 'Weft Studio',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121311' : '#ebebe7',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  if (settings.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  const remember = () => {
    if (!win || win.isDestroyed()) return;
    settings.maximized = win.isMaximized();
    if (!settings.maximized && !win.isMinimized()) settings.bounds = win.getBounds();
    saveSettings();
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('close', remember);
  win.on('closed', () => { win = null; });

  // links to the outside world open in the browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); }
  });
  win.webContents.on('did-finish-load', () => {
    if (pendingOpen) { openDesignFile(pendingOpen); pendingOpen = null; }
  });
  win.loadURL(pageURL());
}
// Weft 2.0 is index.html; the 1.x design stays available as classic.html
const pageURL = () => `${ORIGIN}/${settings.ui === 'classic' ? 'classic.html' : 'index.html'}`;
function setUI(ui) {
  settings.ui = ui === 'classic' ? 'classic' : 'v2';
  saveSettings();
  buildMenu();
  if (win && !win.isDestroyed()) win.loadURL(pageURL());
}

function send(action, arg) {
  if (win && !win.isDestroyed()) win.webContents.send('menu', action, arg);
}

// ---------------------------------------------------------------- design files (.weft)
function addRecent(file) {
  settings.recent = [file, ...(settings.recent || []).filter((f) => f !== file)].slice(0, 8);
  saveSettings();
  app.addRecentDocument(file);
  buildMenu();
}
function openDesignFile(file) {
  try {
    const text = fs.readFileSync(file, 'utf8');
    send('load-design', { text, path: file });
    addRecent(file);
  } catch (e) {
    dialog.showErrorBox('Could not open the design', `${file}\n\n${e.message}`);
  }
}
async function chooseDesignFile() {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open design',
    defaultPath: settings.designDir || exportDir(),
    filters: [{ name: 'Weft design', extensions: ['weft', 'json'] }],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths[0]) return;
  settings.designDir = path.dirname(r.filePaths[0]);
  openDesignFile(r.filePaths[0]);
}
const fromArgv = (argv) => argv.find((a) => /\.weft$/i.test(a) && fs.existsSync(a));

// ---------------------------------------------------------------- IPC from the studio
const FILTERS = {
  zip: [{ name: 'Print files', extensions: ['zip'] }],
  png: [{ name: 'PNG image', extensions: ['png'] }],
  weft: [{ name: 'Weft design', extensions: ['weft'] }],
  '3mf': [{ name: '3MF model', extensions: ['3mf'] }],
  stl: [{ name: 'STL model', extensions: ['stl'] }],
};

ipcMain.handle('save-file', async (_e, { filename, data }) => {
  const ext = path.extname(filename).slice(1).toLowerCase();
  const isDesign = ext === 'weft';
  const base = isDesign ? settings.designDir || exportDir() : exportDir();
  fs.mkdirSync(base, { recursive: true });
  const r = await dialog.showSaveDialog(win, {
    title: isDesign ? 'Save design' : 'Save',
    defaultPath: path.join(base, filename),
    filters: FILTERS[ext] || [],
  });
  if (r.canceled || !r.filePath) return { canceled: true };
  fs.writeFileSync(r.filePath, Buffer.from(data));
  if (isDesign) { settings.designDir = path.dirname(r.filePath); addRecent(r.filePath); }
  else { settings.exportDir = path.dirname(r.filePath); saveSettings(); }
  return { path: r.filePath };
});

// Writes the 3MF into the export folder and opens it with whatever the system uses for .3mf files
// (Bambu Studio, OrcaSlicer, PrusaSlicer...).
ipcMain.handle('open-in-slicer', async (_e, { filename, data }) => {
  const dir = path.join(exportDir(), 'Sent to slicer');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, filename);
  fs.writeFileSync(file, Buffer.from(data));
  const err = await shell.openPath(file);
  return err ? { path: file, error: err } : { path: file };
});

ipcMain.handle('show-in-folder', (_e, file) => { if (typeof file === 'string' && fs.existsSync(file)) shell.showItemInFolder(file); });
ipcMain.handle('open-design', () => chooseDesignFile());
ipcMain.handle('set-ui', (_e, ui) => setUI(ui));
ipcMain.handle('set-title', (_e, name) => { if (win) win.setTitle(name ? `${name} · Weft Studio` : 'Weft Studio'); });
ipcMain.handle('app-info', () => ({ version: app.getVersion(), platform: process.platform, exportDir: exportDir(), updates: !!pkg.weft?.updateRepo }));

// ---------------------------------------------------------------- menu
function buildMenu() {
  const recent = (settings.recent || []).filter((f) => fs.existsSync(f));
  const mac = process.platform === 'darwin';
  const template = [
    ...(mac ? [{ role: 'appMenu' }] : []),
    {
      label: '&File',
      submenu: [
        { label: 'New Design', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Open Design…', accelerator: 'CmdOrCtrl+O', click: () => chooseDesignFile() },
        {
          label: 'Open Recent',
          submenu: recent.length
            ? [...recent.map((f) => ({ label: path.basename(f), click: () => openDesignFile(f) })), { type: 'separator' }, { label: 'Clear Recent', click: () => { settings.recent = []; saveSettings(); app.clearRecentDocuments(); buildMenu(); } }]
            : [{ label: 'No recent designs', enabled: false }],
        },
        { label: 'Save Design As…', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { type: 'separator' },
        { label: 'Export Print Files…', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
        { label: 'Open in Slicer', accelerator: 'CmdOrCtrl+Shift+E', click: () => send('slicer') },
        { label: 'Save Cover Image…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('cover') },
        { type: 'separator' },
        { label: 'Show Export Folder', click: () => { fs.mkdirSync(exportDir(), { recursive: true }); shell.openPath(exportDir()); } },
        { type: 'separator' },
        mac ? { role: 'close' } : { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        // the page handles these keys itself (and leaves text fields their own undo), so they are only shown here
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: () => send('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', registerAccelerator: false, click: () => send('redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: '&Design',
      submenu: [
        { label: 'Shuffle', accelerator: 'CmdOrCtrl+R', click: () => send('shuffle') },
        { label: 'Shuffle Shape', accelerator: 'CmdOrCtrl+1', click: () => send('shuffle', 'shape') },
        { label: 'Shuffle Surface', accelerator: 'CmdOrCtrl+2', click: () => send('shuffle', 'surface') },
        { label: 'Shuffle Colours', accelerator: 'CmdOrCtrl+3', click: () => send('shuffle', 'colour') },
        { type: 'separator' },
        { label: 'Toggle Multicolor', accelerator: 'CmdOrCtrl+M', click: () => send('multicolor') },
      ],
    },
    {
      label: '&View',
      submenu: [
        { label: 'Studio', accelerator: 'F1', click: () => send('view', 'studio') },
        { label: 'Print Check', accelerator: 'F2', click: () => send('view', 'print') },
        { label: 'Frame Object', accelerator: 'F', registerAccelerator: false, click: () => send('frame') },
        { type: 'separator' },
        { label: 'Dimensions', accelerator: 'CmdOrCtrl+D', click: () => send('toggle', 'dims') },
        { label: 'Size Reference', accelerator: 'CmdOrCtrl+K', click: () => send('toggle', 'ref') },
        { label: 'Drag Points', click: () => send('toggle', 'handles') },
        { label: 'See-through', click: () => send('toggle', 'xray') },
        { label: 'Cutaway', click: () => send('toggle', 'cut') },
        { label: 'Turntable', click: () => send('toggle', 'spin') },
        { label: 'Light or Dark', click: () => send('theme') },
        { type: 'separator' },
        { label: 'Panels', accelerator: 'CmdOrCtrl+P', click: () => send('panels') },
        { label: 'Collection', click: () => send('collection') },
        { label: 'Print Guide', click: () => send('guide') },
        {
          label: 'Design',
          submenu: [
            { label: 'Weft 2.0', type: 'radio', checked: settings.ui !== 'classic', click: () => send('ui', 'v2') },
            { label: 'Classic', type: 'radio', checked: settings.ui === 'classic', click: () => send('ui', 'classic') },
          ],
        },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'reload', accelerator: 'F5' }, { role: 'toggleDevTools' }]),
      ],
    },
    {
      label: '&Help',
      submenu: [
        { label: 'Print Guide', click: () => send('guide') },
        { label: 'Check for Updates…', click: () => checkForUpdates(true) },
        { label: 'Open App Data Folder', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        {
          label: 'About Weft Studio',
          click: () => dialog.showMessageBox(win, {
            type: 'info', title: 'About Weft Studio', message: `Weft Studio ${app.getVersion()}`,
            detail: 'Parametric homeware for 3D printing: planters, vases, bowls, trays, boxes, lamps, lanterns and more, exported ready for your slicer.\n\nElectron ' + process.versions.electron,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------- updates
// Turned on by setting "weft.updateRepo" in package.json and publishing releases to that GitHub repo.
let updater = null;
function checkForUpdates(manual) {
  if (!app.isPackaged || !pkg.weft?.updateRepo) {
    if (manual) dialog.showMessageBox(win, { type: 'info', message: 'Automatic updates are not set up yet', detail: 'This copy of Weft Studio was built without an update source. Install the newest version by hand.' });
    return;
  }
  try {
    if (!updater) {
      updater = require('electron-updater').autoUpdater;
      updater.autoDownload = true;
      updater.on('update-downloaded', (info) => {
        dialog.showMessageBox(win, {
          type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0,
          message: `Weft Studio ${info.version} is ready`, detail: 'Restart to finish updating. Your designs are kept.',
        }).then((r) => { if (r.response === 0) updater.quitAndInstall(); });
      });
      if (manual) updater.on('update-not-available', () => dialog.showMessageBox(win, { type: 'info', message: 'You have the newest version', detail: `Weft Studio ${app.getVersion()}` }));
    }
    updater.checkForUpdates().catch((e) => { if (manual) dialog.showErrorBox('Update check failed', String(e?.message || e)); });
  } catch (e) {
    if (manual) dialog.showErrorBox('Update check failed', String(e?.message || e));
  }
}

// ---------------------------------------------------------------- start
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const f = fromArgv(argv);
    if (f) openDesignFile(f);
  });
  app.on('open-file', (e, file) => { e.preventDefault(); if (win) openDesignFile(file); else pendingOpen = file; });

  app.whenReady().then(() => {
    loadSettings();
    protocol.handle(SCHEME, async (req) => {
      const url = new URL(req.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const file = path.normalize(path.join(APP_DIR, rel));
      if (!file.startsWith(APP_DIR)) return new Response('Not found', { status: 404 });
      try {
        const body = await fs.promises.readFile(file);
        return new Response(body, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
    pendingOpen = fromArgv(process.argv) || null;
    buildMenu();
    createWindow();
    setTimeout(() => checkForUpdates(false), 4000);
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
}
