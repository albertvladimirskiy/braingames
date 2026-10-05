// Proper scoring (Brier) and confidence-bucket aggregation. Pure.
// Confidence q is the stated probability (0.5–0.99) that the CHOSEN answer is right.

export const BUCKET_LABELS = ['50–60', '60–70', '70–80', '80–90', '90–100'];

export const brier = (q, correct) => (q - (correct ? 1 : 0)) ** 2;

/** 100 × (1 − 4B): 50% is always 0; right at 90% = +96; wrong at 90% = −224. */
export const brierPoints = (q, correct) => Math.round(100 * (1 - 4 * brier(q, correct)));

/** Bucket 0..4 for q in [0.5, 1]. Uses integer percent to dodge float edge cases (0.6 → bucket 1). */
export const bucketIndex = (q) => Math.min(4, Math.max(0, Math.floor((Math.round(q * 100) - 50) / 10)));

export const emptyBuckets = () => Array.from({ length: 5 }, () => ({ n: 0, hits: 0, sumQ: 0 }));

/** samples: [{ q, correct }] → NEW buckets array with them added. */
export function addSamples(buckets, samples) {
  const out = (buckets?.length === 5 ? buckets : emptyBuckets()).map((b) => ({ ...b }));
  for (const { q, correct } of samples) {
    const b = out[bucketIndex(q)];
    b.n += 1;
    b.sumQ += q;
    if (correct) b.hits += 1;
  }
  return out;
}

/** Per-bucket stated vs actual (null where empty). */
export const summarize = (buckets) =>
  buckets.map((b, i) => ({
    label: BUCKET_LABELS[i],
    n: b.n,
    stated: b.n ? b.sumQ / b.n : null,
    actual: b.n ? b.hits / b.n : null,
  }));

export const meanBrier = (samples) => (samples.length ? samples.reduce((a, s) => a + brier(s.q, s.correct), 0) / samples.length : 0);

/** One plain sentence about calibration, e.g. "You said ~90% but were right 70% of the time: overconfident." */
export function calibrationSentence(buckets) {
  const rows = summarize(buckets).filter((r) => r.n > 0);
  if (!rows.length) return 'Answer a few questions to see how well your confidence matches reality.';
  const big = rows.filter((r) => r.n >= 3);
  const pick = big.length
    ? big.reduce((a, r) => (r.n * Math.abs(r.stated - r.actual) > a.n * Math.abs(a.stated - a.actual) ? r : a))
    : (() => {
        const n = rows.reduce((a, r) => a + r.n, 0);
        return { n, stated: rows.reduce((a, r) => a + r.stated * r.n, 0) / n, actual: rows.reduce((a, r) => a + r.actual * r.n, 0) / n };
      })();
  const gap = pick.stated - pick.actual;
  const verdict = Math.abs(gap) < 0.05 ? 'well calibrated' : gap > 0 ? 'overconfident' : 'underconfident';
  const say = Math.round(pick.stated * 100);
  const hit = Math.round(pick.actual * 100);
  return verdict === 'well calibrated'
    ? `You said ~${say}% and were right ${hit}% of the time: well calibrated.`
    : `You said ~${say}% but were right ${hit}% of the time: ${verdict}.`;
}
