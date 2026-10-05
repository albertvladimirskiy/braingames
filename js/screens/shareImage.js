// Shareable PNG of a Daily result, drawn on a canvas (system fonts only, no network, no libraries).
import { APP_NAME } from '../config.js';
import { SEGMENT_POINTS } from '../core/daily.js';

export const SHARE_SIZE = 1080;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const ROWS = [
  { key: 'quickmath', label: 'Quick Math', color: '#7F77DD' },
  { key: 'ballpark', label: 'Ballpark', color: '#7F77DD' },
  { key: 'sure', label: 'How Sure Are You?', color: '#EF9F27' },
];

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Draws the card. `data` = { date, scores:{quickmath,ballpark,sure}, total, streak }. */
export function drawShareCard(canvas, data) {
  const S = SHARE_SIZE;
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0d0e13';
  g.fillRect(0, 0, S, S);
  // four category-colour stripes along the top, like the app icon
  ['#7F77DD', '#1D9E75', '#EF9F27', '#D85A30'].forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect((S / 4) * i, 0, S / 4, 18);
  });

  g.fillStyle = '#f3f4f8';
  g.textBaseline = 'alphabetic';
  g.font = `800 72px ${FONT}`;
  g.fillText(`${APP_NAME} Daily`, 80, 150);
  g.fillStyle = '#aab0c4';
  g.font = `600 40px ${FONT}`;
  g.fillText(data.date, 80, 210);

  g.fillStyle = '#f3f4f8';
  g.font = `800 250px ${FONT}`;
  g.fillText(String(data.total), 70, 470);
  g.fillStyle = '#aab0c4';
  g.font = `600 40px ${FONT}`;
  g.fillText('total points', 80, 530);

  ROWS.forEach((row, i) => {
    const y = 600 + i * 120;
    const v = data.scores[row.key] ?? 0;
    g.fillStyle = '#f3f4f8';
    g.font = `700 36px ${FONT}`;
    g.fillText(row.label, 80, y + 20);
    g.textAlign = 'right';
    g.fillText(`${v}`, S - 80, y + 20);
    g.textAlign = 'left';
    g.fillStyle = '#2c3044';
    roundRect(g, 80, y + 38, S - 160, 28, 14);
    g.fill();
    g.fillStyle = row.color;
    roundRect(g, 80, y + 38, Math.max(28, ((S - 160) * v) / SEGMENT_POINTS), 28, 14);
    g.fill();
  });

  g.fillStyle = '#f3f4f8';
  g.font = `800 48px ${FONT}`;
  g.fillText(`Streak ${data.streak}`, 80, 1010);
  g.fillStyle = '#aab0c4';
  g.font = `600 30px ${FONT}`;
  g.textAlign = 'right';
  g.fillText('Skill practice, same questions for everyone', S - 80, 1010);
  g.textAlign = 'left';
  return canvas;
}

/** Shares via the Web Share API when files are supported, otherwise downloads the PNG. */
export async function shareDailyImage(data, doc = document) {
  const canvas = drawShareCard(doc.createElement('canvas'), data);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const name = `${APP_NAME.toLowerCase()}-daily-${data.date}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: `${APP_NAME} Daily ${data.date}` });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      /* fall through to download */
    }
  }
  const a = doc.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'downloaded';
}
