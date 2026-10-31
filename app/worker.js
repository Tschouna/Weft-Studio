// Builds meshes off the main thread so sliders stay smooth.
import { generate } from './engine.js';

self.onmessage = (e) => {
  const { id, params, quality } = e.data;
  try {
    const res = generate(params, quality);
    const transfer = [];
    for (const p of res.parts) transfer.push(p.position.buffer, p.normal.buffer, p.index.buffer, p.weld.buffer, p.overFace.buffer);
    self.postMessage({ id, res }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.stack) || err) });
  }
};
self.postMessage({ ready: true });
