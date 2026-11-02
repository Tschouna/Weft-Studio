// Pulls the studio's own shuffle code out of app/app.js so it can run in Node, without a browser.
import { readFileSync } from 'node:fs';
import { OBJECTS, SILHOUETTES, design } from '../app/presets.js';
import { makeProfile, easeProfile, makeSection } from '../app/engine.js';

const src = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
// the text of a top-level `const NAME = ...;` or `function NAME(...) {...}`, up to the next top-level line
function chunk(start) {
  const i = src.indexOf(start);
  if (i < 0) throw new Error(`not found in app.js: ${start}`);
  const rest = src.slice(i);
  const end = rest.search(/\n(?=const |function |let |\/\/ =|\/\/ [A-Z]|\$\(|async function |document\.|for \(|if \()/);
  return rest.slice(0, end < 0 ? rest.length : end);
}
const parts = ['const PATTERNS = {', 'const OBJECT_DEFAULTS = {', 'const BOLD_DEPTH = {', 'function maxLean(', 'function safeTwist(', 'function shuffleShape(', 'function shuffleSurface('].map(chunk);
const factory = new Function('OBJECTS', 'SILHOUETTES', 'rand', 'makeProfile', 'easeProfile', 'makeSection', `
  const Math = Object.assign(Object.create(globalThis.Math), { random: rand });
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const rnd = (a, b) => a + rand() * (b - a);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  ${parts.join('\n')}
  return { PATTERNS, OBJECT_DEFAULTS, shuffleShape, shuffleSurface };
`);

// A seeded generator, so a run can be repeated
export function makeShuffler(seed = 1) {
  let s = seed >>> 0 || 1;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const lib = factory(OBJECTS, SILHOUETTES, rand, makeProfile, easeProfile, makeSection);
  // a fresh piece of this object, as switching to it in the studio gives, then shuffled
  const shuffled = (obj, from) => {
    const d = JSON.parse(JSON.stringify(from || design({ object: obj })));
    if (!from) {
      d.object = obj;
      Object.assign(d.form, lib.OBJECT_DEFAULTS[obj].form);
      Object.assign(d.extras, lib.OBJECT_DEFAULTS[obj].extras);
      if (lib.OBJECT_DEFAULTS[obj].surface) Object.assign(d.surface, lib.OBJECT_DEFAULTS[obj].surface);
    }
    lib.shuffleShape(d);
    lib.shuffleSurface(d);
    return d;
  };
  return { ...lib, rand, shuffled };
}
