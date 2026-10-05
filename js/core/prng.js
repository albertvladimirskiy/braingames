// Seeded randomness. Game logic must take an rng argument and never call Math.random.

/** xmur3 string hash → seed generator (returns uint32 per call). */
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** mulberry32: tiny fast PRNG. Returns float in [0, 1). */
export function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed) {
  const str = String(seed);
  const next = mulberry32(xmur3(str)());
  const rng = {
    seed: str,
    next,
    /** integer in [min, max] inclusive */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** returns a shuffled copy (Fisher–Yates) */
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    /** independent child stream, deterministic from this seed + label */
    fork: (label) => createRng(`${str}/${label}`),
  };
  return rng;
}

/** Non-deterministic seed string for normal (non-daily, non-?seed) play. */
export function randomSeed() {
  const buf = new Uint32Array(2);
  globalThis.crypto.getRandomValues(buf);
  return `r-${buf[0].toString(36)}${buf[1].toString(36)}`;
}
