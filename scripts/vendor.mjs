// Copies the browser libraries the studio imports into app/vendor, so the desktop app runs offline.
// Run automatically by `npm start` and the build scripts.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  ['node_modules/three/build/three.module.js', 'app/vendor/three/three.module.js'],
  ['node_modules/three/examples/jsm/controls/OrbitControls.js', 'app/vendor/three/addons/controls/OrbitControls.js'],
  ['node_modules/three/examples/jsm/environments/RoomEnvironment.js', 'app/vendor/three/addons/environments/RoomEnvironment.js'],
  ['node_modules/fflate/esm/browser.js', 'app/vendor/fflate/browser.js'],
];
for (const [from, to] of files) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  cpSync(join(root, from), join(root, to));
}
console.log(`vendored ${files.length} files into app/vendor`);
