// 3D view of a spot's surroundings with the real sun: swisstopo terrain (swissALTIRegio) draped with
// swisstopo aerial photos or the national map, lit from where the sun really stands at the chosen time,
// with the shadows the mountains cast. Drag to turn, pinch to zoom; slide or play through the day.
import * as THREE from '../../vendor/three/three.module.min.js';
import { OrbitControls } from '../../vendor/three/OrbitControls.js';
import { sunAt, dayEvents, localMidnight, hhmm, horizonAlt, zurichParts, TZ } from '../astro.js';
import { compass, compassWords } from '../geo.js';
import { terrainFor, imagery } from '../sources/terrain.js';
import { esc, openSheet, sheetHead } from '../ui.js';

const SIZES = { wide: { half: 9000, res: 40, img: 10, label: '18 km' }, close: { half: 2500, res: 10, img: 5, label: '5 km' } };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export function open3D(spot) {
  const st = { size: 'wide', kind: 'aerial', day: localMidnight(new Date()), minutes: null, playing: null };
  const nowParts = zurichParts(new Date());
  st.minutes = Math.round((nowParts.h * 60 + nowParts.min) / 5) * 5;
  // opened in the dark: show the next morning instead (10:00)
  if (sunAt(new Date(), spot).alt < 0) { if (nowParts.h >= 12) st.day = localMidnight(new Date(), 1); st.minutes = 600; }
  let g = null; // the WebGL bits
  let horizon = spot.horizon || null;

  openSheet((root) => {
    root.innerHTML = `${sheetHead(`${spot.name} · 3D`)}
      <div style="position:sticky;top:56px;z-index:4;background:var(--bg);padding:0 10px 4px;box-shadow:0 10px 16px -10px rgba(0,0,0,.6)">
      <div style="position:relative;border-radius:16px;overflow:hidden;background:#0d1526;height:min(48vh,460px)" id="t3wrap">
        <canvas id="t3" style="width:100%;height:100%;display:block;touch-action:none"></canvas>
        <div id="t3load" class="notice" style="position:absolute;left:12px;right:12px;top:12px;margin:0">Loading swisstopo terrain…<div class="progress" style="margin-top:6px"><i id="t3bar"></i></div></div>
        <div id="t3hud" style="position:absolute;left:10px;top:10px;font-size:12.5px;background:rgba(8,12,22,.72);padding:6px 9px;border-radius:10px;max-width:72%" hidden></div>
      </div>
        <div class="row sp" style="margin-top:8px;padding:0 4px"><b id="t3time" style="font-size:19px"></b>
          <span class="btns"><button class="btn small" id="t3play">▶︎ Play the day</button></span></div>
        <input type="range" id="t3slider" min="0" max="1435" step="5" value="${st.minutes}" style="width:100%;accent-color:var(--gold)" aria-label="Time of day">
      </div>
      <div class="pad">
        <div class="btns" id="t3jumps" style="margin:4px 0 10px"></div>
        <div class="chips" id="t3days"></div>
        <div class="row sp" style="gap:8px;flex-wrap:wrap">
          <div class="segbar"><button data-size="wide" aria-pressed="true">18 km</button><button data-size="close" aria-pressed="false">5 km close-up</button></div>
          <div class="segbar"><button data-kind="aerial" aria-pressed="true">Aerial photo</button><button data-kind="map" aria-pressed="false">Map</button></div>
        </div>
        <p class="small" id="t3sum" style="margin:12px 0 4px"></p>
        <p class="tiny faint">Terrain: swisstopo swissALTIRegio (10 m, includes the border regions). Imagery: swisstopo SWISSIMAGE / national map. Shadows come from the terrain shown; the sun-on-the-spot times also use mountains up to 60 km away. Drag to turn, pinch to zoom, two fingers to move.</p>
      </div>`;
    wireUi(root);
    build(root).catch((e) => { const l = root.querySelector('#t3load'); if (l) l.innerHTML = `Could not load the 3D view (${esc(e.message)}).`; });
  }, { onClose: () => dispose() });

  // ---------- UI ----------
  function wireUi(root) {
    const slider = root.querySelector('#t3slider');
    slider.addEventListener('input', () => { st.minutes = +slider.value; stopPlay(root); update(root); });
    root.querySelector('#t3play').addEventListener('click', () => (st.playing ? stopPlay(root) : startPlay(root)));
    root.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
      if (st.size === b.dataset.size) return; st.size = b.dataset.size;
      root.querySelectorAll('[data-size]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.size === st.size));
      build(root).catch(() => {});
    }));
    root.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
      if (st.kind === b.dataset.kind) return; st.kind = b.dataset.kind;
      root.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.kind === st.kind));
      retexture(root).catch(() => {});
    }));
    const y = nowParts.y;
    const days = [['Today', localMidnight(new Date())], ['Tomorrow', localMidnight(new Date(), 1)],
      ['Longest day', localMidnight(new Date(Date.UTC(y, 5, 21, 12)))], ['Shortest day', localMidnight(new Date(Date.UTC(y, 11, 21, 12)))],
      ['Equinox', localMidnight(new Date(Date.UTC(y, 2, 20, 12)))]];
    const dc = root.querySelector('#t3days');
    dc.innerHTML = days.map(([l, d], i) => `<button class="chip" data-d="${i}" aria-pressed="${d.getTime() === st.day.getTime()}">${l}</button>`).join('') +
      `<input type="date" id="t3date" style="width:auto;padding:6px 8px;font-size:14px" value="${nowParts.y}-${String(nowParts.m).padStart(2, '0')}-${String(nowParts.d).padStart(2, '0')}">`;
    dc.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      st.day = days[+b.dataset.d][1];
      dc.querySelectorAll('[data-d]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      dayChanged(root);
    }));
    dc.querySelector('#t3date').addEventListener('change', (e) => {
      const [yy, mm, dd] = e.target.value.split('-').map(Number);
      if (!yy) return;
      st.day = localMidnight(new Date(Date.UTC(yy, mm - 1, dd, 12)));
      dc.querySelectorAll('[data-d]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      dayChanged(root);
    });
    dayChanged(root);
  }

  // direct sun on the spot: the sun above the mountain horizon (60 km, or from the terrain shown)
  function sunOnSpot(t) { const s = sunAt(t, spot); return s.alt > Math.max(0, horizonAlt(horizon, s.az)) + 0.3; }
  function daySummary() {
    const ev = dayEvents(new Date(st.day.getTime() + 12 * 3600e3), spot);
    let first = null, last = null, mins = 0;
    for (let m = 0; m < 1440; m += 5) {
      const t = new Date(st.day.getTime() + m * 60e3);
      if (sunOnSpot(t)) { if (!first) first = t; last = t; mins += 5; }
    }
    return { ev, first, last, mins };
  }
  function dayChanged(root) {
    const sum = daySummary();
    st.sum = sum;
    const jumps = [['Sunrise', sum.ev.sunrise], ['Sun on the spot', sum.first], ['Noon', new Date(st.day.getTime() + 12.5 * 3600e3)], ['Sun leaves the spot', sum.last], ['Sunset', sum.ev.sunset]].filter(([, t]) => t);
    const jc = root.querySelector('#t3jumps');
    jc.innerHTML = jumps.map(([l, t], i) => `<button class="btn small ghost" data-j="${i}">${l} ${hhmm(t)}</button>`).join('');
    jc.querySelectorAll('[data-j]').forEach((b) => b.addEventListener('click', () => {
      const t = jumps[+b.dataset.j][1], p = zurichParts(t);
      st.minutes = Math.round((p.h * 60 + p.min) / 5) * 5; stopPlay(root); update(root);
    }));
    root.querySelector('#t3sum').innerHTML = sum.mins
      ? `☀️ Direct sun on the spot <b>${hhmm(sum.first)}–${hhmm(new Date(sum.last.getTime() + 5 * 60e3))}</b> (${Math.floor(sum.mins / 60)} h ${sum.mins % 60} min). Sunrise over the flat horizon ${hhmm(sum.ev.sunrise)}, sunset ${hhmm(sum.ev.sunset)}.`
      : '⛰️ No direct sun on the spot this day: the mountains hide it all day.';
    update(root);
  }
  function startPlay(root) {
    const from = st.sum.ev.sunrise ? zurichParts(st.sum.ev.sunrise) : { h: 6, min: 0 }, to = st.sum.ev.sunset ? zurichParts(st.sum.ev.sunset) : { h: 19, min: 0 };
    const a = from.h * 60 + from.min - 30, b = to.h * 60 + to.min + 30;
    if (st.minutes < a || st.minutes > b) st.minutes = a;
    root.querySelector('#t3play').textContent = '❚❚ Pause';
    st.playing = setInterval(() => { st.minutes += 5; if (st.minutes > b) st.minutes = a; update(root); }, 90);
  }
  function stopPlay(root) {
    if (st.playing) clearInterval(st.playing);
    st.playing = null;
    const p = root.querySelector('#t3play'); if (p) p.textContent = '▶︎ Play the day';
  }

  function update(root) {
    const t = new Date(st.day.getTime() + st.minutes * 60e3);
    const s = sunAt(t, spot), lit = sunOnSpot(t);
    const slider = root.querySelector('#t3slider'); if (slider) slider.value = st.minutes;
    const tl = root.querySelector('#t3time'); if (tl) tl.textContent = `${hhmm(t)} · ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TZ }).format(t)}`;
    const hud = root.querySelector('#t3hud');
    if (hud) {
      hud.hidden = !g;
      hud.innerHTML = s.alt < -0.5 ? `🌙 Sun below the horizon (${Math.round(s.alt)}°)`
        : `${lit ? '☀️ The spot is in the sun' : '⛰️ The spot is in shadow'}<br><span class="muted">Sun ${Math.round(s.alt)}° high in the ${compassWords(s.az)} (${Math.round(s.az)}°)</span>`;
    }
    if (g) { light(s); g.render(); }
  }

  // ---------- 3D ----------
  async function build(root) {
    const load = root.querySelector('#t3load'), bar = root.querySelector('#t3bar');
    load.hidden = false; bar.style.width = '0%';
    load.firstChild.textContent = 'Loading swisstopo terrain…';
    const cfg = SIZES[st.size];
    const t = await terrainFor(spot, cfg.half, cfg.res, (p) => { bar.style.width = `${Math.round(p * 60)}%`; });
    if (!root.isConnected) return;
    fillHoles(t);
    // the spot's own horizon from this terrain, if none was computed from the 60 km profiles
    if (!horizon) horizon = horizonFromGrid(t);
    load.firstChild.textContent = 'Loading swisstopo imagery…';
    const W = (t.cols - 1) * t.res, H = (t.rows - 1) * t.res;
    const canvas = await imagery(st.kind, t.e0, t.n0, W, H, cfg.img, (p) => { bar.style.width = `${60 + Math.round(p * 40)}%`; });
    if (!root.isConnected) return;
    dispose();
    g = scene(root.querySelector('#t3'), t, canvas);
    load.hidden = true;
    dayChanged(root);
  }
  async function retexture(root) {
    if (!g) return;
    const cfg = SIZES[st.size], t = g.t;
    const canvas = await imagery(st.kind, t.e0, t.n0, (t.cols - 1) * t.res, (t.rows - 1) * t.res, cfg.img);
    if (!g) return;
    g.setTexture(canvas); g.render();
  }

  function scene(cv, t, canvas) {
    const W = (t.cols - 1) * t.res, H = (t.rows - 1) * t.res;
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const sceneObj = new THREE.Scene();
    // the spot sits at the origin, at its own height
    const sample = (c, r) => {
      c = clamp(c, 0, t.cols - 1); r = clamp(r, 0, t.rows - 1);
      const c0 = Math.floor(c), r0 = Math.floor(r), c1 = Math.min(c0 + 1, t.cols - 1), r1 = Math.min(r0 + 1, t.rows - 1), fc = c - c0, fr = r - r0;
      const v = (cc, rr) => t.grid[rr * t.cols + cc];
      return (v(c0, r0) * (1 - fc) + v(c1, r0) * fc) * (1 - fr) + (v(c0, r1) * (1 - fc) + v(c1, r1) * fc) * fr;
    };
    const sc = (t.ec - t.e0) / t.res, sr = (t.n0 - t.nc) / t.res, h0 = sample(sc, sr);
    const ox = sc * t.res - W / 2, oz = sr * t.res - H / 2; // the spot relative to the centre of the square
    const segX = Math.min(t.cols - 1, 340), segY = Math.min(t.rows - 1, 340);
    const geo = new THREE.PlaneGeometry(W, H, segX, segY);
    geo.rotateX(-Math.PI / 2); // north is -z
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, sample((x + W / 2) / t.res, (z + H / 2) / t.res) - h0);
      pos.setX(i, x - ox); pos.setZ(i, z - oz);
    }
    geo.computeVertexNormals();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    sceneObj.add(mesh);
    // the spot: a gold pin
    const pinH = W * 0.035, pin = new THREE.Group();
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xffb547 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.0012, W * 0.0012, pinH, 8), pinMat); pole.position.y = pinH / 2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(W * 0.005, 16, 12), pinMat); head.position.y = pinH;
    pin.add(pole, head); sceneObj.add(pin);
    // compass letters at the edges
    const label = (txt, x, z, col) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x2 = c.getContext('2d'); x2.font = 'bold 84px -apple-system, Segoe UI, sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle';
      x2.fillStyle = 'rgba(8,12,22,.55)'; x2.beginPath(); x2.arc(64, 64, 60, 0, 7); x2.fill(); x2.fillStyle = col; x2.fillText(txt, 64, 68);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
      sp.scale.set(W * 0.05, W * 0.05, 1); sp.position.set(x, W * 0.06, z); sceneObj.add(sp);
    };
    label('N', -ox, -H / 2 - oz - W * 0.03, '#ffb547'); label('S', -ox, H / 2 - oz + W * 0.03, '#ffffff');
    label('E', W / 2 - ox + W * 0.03, -oz, '#ffffff'); label('W', -W / 2 - ox - W * 0.03, -oz, '#ffffff');
    // light
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const R = Math.hypot(W, H) * 0.6;
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 1, far: R * 6 });
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = t.res * 0.8;
    sun.target.position.set(-ox, 0, -oz);
    sceneObj.add(sun, sun.target);
    const hemi = new THREE.HemisphereLight(0xcfe0ff, 0x3a3226, 0.8);
    sceneObj.add(hemi);
    // camera from the south, looking north over the spot
    const camera = new THREE.PerspectiveCamera(45, 1, W * 0.002, W * 8);
    camera.position.set(0, W * 0.38, W * 0.62);
    const controls = new OrbitControls(camera, cv);
    controls.target.set(0, 0, 0); controls.maxPolarAngle = Math.PI * 0.48; controls.minDistance = W * 0.03; controls.maxDistance = W * 2;
    controls.update();
    const render = () => renderer.render(sceneObj, camera);
    controls.addEventListener('change', render);
    const resize = () => { const r = cv.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); render(); };
    const ro = new ResizeObserver(resize); ro.observe(cv); resize();
    const skyTop = new THREE.Color(), fogCol = new THREE.Color();
    return {
      t, render,
      setTexture(c) { const nt = new THREE.CanvasTexture(c); nt.colorSpace = THREE.SRGBColorSpace; nt.anisotropy = tex.anisotropy; mat.map.dispose(); mat.map = nt; mat.needsUpdate = true; },
      light(s) {
        const az = (s.az * Math.PI) / 180, alt = (Math.max(s.alt, -2) * Math.PI) / 180;
        sun.position.set(Math.sin(az) * Math.cos(alt) * R * 3 - ox, Math.sin(alt) * R * 3, -Math.cos(az) * Math.cos(alt) * R * 3 - oz);
        const up = clamp(s.alt / 12);
        sun.intensity = s.alt > -0.5 ? 0.4 + 2.8 * up : 0;
        sun.color.setRGB(1, 0.62 + 0.36 * clamp(s.alt / 18), 0.38 + 0.58 * clamp(s.alt / 22));
        hemi.intensity = s.alt > 0 ? 0.35 + 0.55 * clamp(s.alt / 35) : s.alt > -6 ? 0.25 : s.alt > -12 ? 0.12 : 0.06;
        // the sky colour behind the mountains
        if (s.alt > 10) skyTop.setRGB(0.55, 0.72, 0.92); else if (s.alt > 0) skyTop.setRGB(0.93, 0.66, 0.45).lerp(new THREE.Color(0.55, 0.72, 0.92), s.alt / 10);
        else if (s.alt > -6) skyTop.setRGB(0.25, 0.25, 0.45); else skyTop.setRGB(0.03, 0.05, 0.11);
        sceneObj.background = skyTop;
        fogCol.copy(skyTop); sceneObj.fog = new THREE.Fog(fogCol, W * 0.9, W * 2.6);
      },
      dispose() { controls.dispose(); ro.disconnect(); geo.dispose(); mat.map.dispose(); mat.dispose(); renderer.dispose(); },
    };
  }
  function light(s) { g.light(s); }

  function dispose() { if (st.playing) clearInterval(st.playing); st.playing = null; if (g) { g.dispose(); g = null; } }
}

// heights missing at the edge of the data: borrow the nearest known value
function fillHoles(t) {
  const { grid, cols, rows } = t;
  let min = Infinity; for (const v of grid) if (v < min) min = v;
  if (!Number.isFinite(min)) throw new Error('no terrain here');
  for (let pass = 0; pass < 4; pass++) {
    let left = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (!Number.isNaN(grid[i])) continue;
      const nb = [c > 0 && grid[i - 1], c < cols - 1 && grid[i + 1], r > 0 && grid[i - cols], r < rows - 1 && grid[i + cols]].filter((x) => x !== false && !Number.isNaN(x));
      if (nb.length) grid[i] = nb.reduce((a, b) => a + b, 0) / nb.length; else left++;
    }
    if (!left) break;
  }
  for (let i = 0; i < grid.length; i++) if (Number.isNaN(grid[i])) grid[i] = min;
}

// a horizon (every 5°) from the terrain square, for spots without the 60 km one
function horizonFromGrid(t) {
  const sc = (t.ec - t.e0) / t.res, sr = (t.n0 - t.nc) / t.res;
  const at = (c, r) => t.grid[Math.round(r) * t.cols + Math.round(c)];
  const h0 = at(sc, sr) + 1.7, alts = [];
  for (let k = 0; k < 72; k++) {
    const az = (k * 5 * Math.PI) / 180, dx = Math.sin(az), dy = -Math.cos(az);
    let best = 0;
    for (let s = 150 / t.res; ; s += 0.5) {
      const c = sc + dx * s, r = sr + dy * s;
      if (c < 0 || r < 0 || c > t.cols - 1 || r > t.rows - 1) break;
      const d = s * t.res, a = (Math.atan2(at(c, r) - h0 - (d * d * 0.87) / 12742000, d) * 180) / Math.PI;
      if (a > best) best = a;
    }
    alts.push(Math.round(best * 10) / 10);
  }
  return { alts };
}
