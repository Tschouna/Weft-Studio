// Builds the browser version of the studio (the one published as a web page) from the same source as the
// desktop app: CDN libraries and Google Fonts instead of the bundled copies. Output: web/
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const block = (html, name, to) => {
  const re = new RegExp(`<!-- ${name}:begin -->[\\s\\S]*?<!-- ${name}:end -->\\n?`);
  if (!re.test(html)) throw new Error(`missing ${name} block`);
  return html.replace(re, to);
};
// the desktop-only bits come out, and the libraries and fonts come from CDNs instead of the bundled copies
const forWeb = (file) => {
let html = block(readFileSync(join(root, 'app', file), 'utf8'), 'desktop', '');
html = block(html, 'fonts', `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=Instrument+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap">
`);
html = block(html, 'importmap', `<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
  "fflate": "https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js"
} }
</script>
`);
return html;
};
const html = forWeb('index.html');
// the published page gets its document wrapper from the host, so the web index is a fragment
const fragment = html
  .replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<\/head>\s*<body[^>]*>\s*/i, '')
  .replace(/\s*<\/body>\s*<\/html>\s*$/i, '\n')
  .replace('<title>Weft Studio</title>', '<title>Weft Studio</title>\n<meta name="claude:viewport-fit-sides" content="cover">');
mkdirSync(join(root, 'web'), { recursive: true });
writeFileSync(join(root, 'web/index.html'), fragment);
writeFileSync(join(root, 'web/standalone.html'), html);
// the classic (1.x) design, a whole page of its own beside the published one
writeFileSync(join(root, 'web/classic.html'), forWeb('classic.html'));
for (const f of ['app.js', 'engine.js', 'presets.js', 'worker.js', 'panel.js', 'panels.js', 'panel-worker.js']) cpSync(join(root, 'app', f), join(root, 'web', f));
console.log('web/ written: index.html (for publishing), standalone.html (open from a local server), classic.html');
