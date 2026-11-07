// Reads where a photo was taken (and which way the camera pointed) from its EXIF GPS tags.
// JPEG only, which is what phones hand to web pages (iPhone converts HEIC when you pick a photo).

export async function readExif(file) {
  const buf = await file.slice(0, 512 * 1024).arrayBuffer();
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let off = 2;
  while (off + 4 < v.byteLength) {
    const marker = v.getUint16(off), len = v.getUint16(off + 2);
    if (marker === 0xffe1 && off + 10 < v.byteLength && v.getUint32(off + 4) === 0x45786966) return parseTiff(v, off + 10);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    off += 2 + len;
  }
  return null;
}

function parseTiff(v, start) {
  if (start + 8 > v.byteLength) return null;
  const little = v.getUint16(start) === 0x4949;
  const u16 = (o) => v.getUint16(start + o, little), u32 = (o) => v.getUint32(start + o, little);
  const entries = (o) => {
    const out = {};
    if (start + o + 2 > v.byteLength) return out;
    const n = u16(o);
    for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; if (start + e + 12 > v.byteLength) break; out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 }; }
    return out;
  };
  const rational = (ent, i) => { const o = u32(ent.at) + i * 8; const d = u32(o + 4); return d ? u32(o) / d : 0; };
  const ascii = (ent) => { const o = ent.count <= 4 ? ent.at : u32(ent.at); let s = ''; for (let i = 0; i < ent.count - 1; i++) s += String.fromCharCode(v.getUint8(start + o + i)); return s; };
  try {
    const ifd0 = entries(u32(4));
    const out = {};
    if (ifd0[0x8769]) {
      const ex = entries(u32(ifd0[0x8769].at));
      if (ex[0x9003]) out.taken = ascii(ex[0x9003]); // "2024:10:21 07:42:10"
    }
    if (ifd0[0x0110]) out.camera = ascii(ifd0[0x0110]);
    if (!ifd0[0x8825]) return out;
    const g = entries(u32(ifd0[0x8825].at));
    if (g[2] && g[4]) {
      const dms = (e) => rational(e, 0) + rational(e, 1) / 60 + rational(e, 2) / 3600;
      out.lat = dms(g[2]) * (g[1] && ascii(g[1]) === 'S' ? -1 : 1);
      out.lon = dms(g[4]) * (g[3] && ascii(g[3]) === 'W' ? -1 : 1);
    }
    if (g[6]) out.alt = rational(g[6], 0) * (g[5] && v.getUint8(start + g[5].at) === 1 ? -1 : 1);
    if (g[0x11]) out.heading = rational(g[0x11], 0);
    return out;
  } catch { return null; }
}

// a phone-sized copy of the photo for the spot card (keeps the app's storage small)
export async function shrinkPhoto(file, max = 1400) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.84));
  return { blob, ratio: c.width / c.height };
}
