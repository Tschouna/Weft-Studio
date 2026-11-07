// A tiny static server for trying the app on this computer: node scripts/serve.mjs [port]
// (a phone on the same Wi-Fi can open http://<this computer's address>:<port>, but notifications,
// location and installing need https, e.g. GitHub Pages).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = +(process.argv[2] || 8080);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
createServer(async (req, res) => {
  try {
    let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    if (p.includes('..')) throw new Error('bad path');
    let f = join(root, p || 'index.html');
    if ((await stat(f)).isDirectory()) f = join(f, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(f));
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`Lichtblick on http://localhost:${port}`));
