// Generates icons/icon.svg and icons/icon-maskable.svg (4 category-colored bars = "reps").
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve(import.meta.dirname, '..', 'icons');
mkdirSync(out, { recursive: true });

const colors = ['#7F77DD', '#1D9E75', '#EF9F27', '#D85A30'];
const bars = (pad) =>
  colors
    .map((c, i) => {
      const w = 56, gap = 20, h = 120 + i * 50;
      const total = colors.length * w + (colors.length - 1) * gap;
      const x = (512 - total) / 2 + i * (w + gap);
      const base = 512 - pad;
      return `<rect x="${x}" y="${base - h}" width="${w}" height="${h}" rx="14" fill="${c}"/>`;
    })
    .join('');

const svg = (rx, pad) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="#0d0e13"/>${bars(pad)}</svg>\n`;

writeFileSync(resolve(out, 'icon.svg'), svg(110, 110));
writeFileSync(resolve(out, 'icon-maskable.svg'), svg(0, 150)); // full-bleed, content inside safe zone
console.log('icons written');
