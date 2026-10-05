const pad2 = (n) => String(n).padStart(2, '0');

/** ms → "m:ss" (rounds up so 0.4s still reads 0:01) */
export function formatTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
}

export const formatInt = (n) => Math.round(n).toLocaleString('en-US');

export const formatSigned = (n) => (n > 0 ? `+${formatInt(n)}` : n < 0 ? `−${formatInt(-n)}` : '0');

/** Human-readable large/small numbers for estimation feedback. */
export function formatValue(n) {
  if (!Number.isFinite(n)) return String(n);
  const a = Math.abs(n);
  if (a >= 1e15 || (a > 0 && a < 1e-3)) {
    const [m, e] = n.toExponential(3).split('e');
    return `${m} × 10^${Number(e)}`;
  }
  return n.toLocaleString('en-US', { maximumSignificantDigits: 6 });
}

/** "YYYY-MM-DD" in UTC */
export const utcDateStr = (ms) => new Date(ms).toISOString().slice(0, 10);

/** ms → "HH:MM:SS" */
export function formatCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
}

export const formatPct = (x, digits = 0) => `${(x * 100).toFixed(digits)}%`;
