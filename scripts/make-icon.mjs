// Generates the app icons with no dependencies: SVG (any + maskable) and PNG (192, 512, maskable 512, apple 180).
// The PNG rasteriser is ~40 lines: supersampled rounded rectangles, zlib-deflated, hand-written PNG chunks.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const out = resolve(import.meta.dirname, '..', 'icons');
mkdirSync(out, { recursive: true });

const COLORS = ['#7F77DD', '#1D9E75', '#EF9F27', '#D85A30'];
const BG = '#0d0e13';

/** Bar geometry in a 512×512 design space. `pad` shrinks the artwork toward the centre (maskable safe zone). */
function bars(pad) {
  const w = 56, gap = 20;
  const total = COLORS.length * w + (COLORS.length - 1) * gap;
  return COLORS.map((c, i) => {
    const h = 120 + i * 50;
    return { x: (512 - total) / 2 + i * (w + gap), y: 512 - pad - h, w, h, r: 14, color: c };
  });
}

// ---- SVG --------------------------------------------------------------------------------------
const svg = (rx, pad) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${BG}"/>${bars(pad)
    .map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}" fill="${b.color}"/>`)
    .join('')}</svg>\n`;
writeFileSync(resolve(out, 'icon.svg'), svg(110, 110));
writeFileSync(resolve(out, 'icon-maskable.svg'), svg(0, 150));

// ---- PNG --------------------------------------------------------------------------------------
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const SS = 3; // supersampling per axis

/** Coverage (0..1) of the rounded rect inside the pixel at (px, py), in design-space coordinates. */
function coverage(px, py, s, rect) {
  let hit = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + 0.5) / SS) / s;
      const y = (py + (sy + 0.5) / SS) / s;
      if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) continue;
      const cx = Math.min(Math.max(x, rect.x + rect.r), rect.x + rect.w - rect.r);
      const cy = Math.min(Math.max(y, rect.y + rect.r), rect.y + rect.h - rect.r);
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rect.r ** 2) hit++;
    }
  }
  return hit / (SS * SS);
}

function raster(size, { radius, pad }) {
  const s = size / 512;
  const shapes = [{ x: 0, y: 0, w: 512, h: 512, r: radius, color: BG }, ...bars(pad)];
  const px = Buffer.alloc(size * (size * 4 + 1)); // each row: filter byte + RGBA
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let [r, g, b, a] = [0, 0, 0, 0];
      for (const sh of shapes) {
        const c = coverage(x, y, s, sh);
        if (!c) continue;
        const [sr, sg, sb] = rgb(sh.color);
        const na = c + a * (1 - c); // source-over
        r = (sr * c + r * a * (1 - c)) / na;
        g = (sg * c + g * a * (1 - c)) / na;
        b = (sb * c + b * a * (1 - c)) / na;
        a = na;
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = Math.round(a * 255);
    }
  }
  return px;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
function png(size, opts) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raster(size, opts), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(resolve(out, 'icon-192.png'), png(192, { radius: 110, pad: 110 }));
writeFileSync(resolve(out, 'icon-512.png'), png(512, { radius: 110, pad: 110 }));
writeFileSync(resolve(out, 'icon-maskable-512.png'), png(512, { radius: 0, pad: 150 }));
writeFileSync(resolve(out, 'apple-touch-icon.png'), png(180, { radius: 0, pad: 130 })); // iOS rounds the corners itself
console.log('icons written');
