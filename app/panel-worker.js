// Builds panel tiles off the main thread so sliders stay smooth.
import { buildPanel } from './panel.js';

self.onmessage = (e) => {
  const { id, params, opts } = e.data;
  try {
    const res = buildPanel(params, opts);
    const transfer = [];
    const take = (m) => { transfer.push(m.position.buffer, m.index.buffer); if (m.normal) transfer.push(m.normal.buffer); };
    for (const t of res.tiles) for (const b of t.bodies) take(b);
    for (const p of res.parts) take(p.mesh);
    self.postMessage({ id, res }, transfer);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.stack) || err) });
  }
};
self.postMessage({ ready: true });
