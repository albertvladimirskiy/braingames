// Leitner boxes 1–5. Pure functions. "today" is a UTC day index (see dayIndex).
export const INTERVALS = [0, 1, 3, 7, 14]; // days until due, by box 1..5
export const MAX_BOX = 5;
export const NEW_CAP = 5;
export const MASTERED_BOX = 4;

export const dayIndex = (ms) => Math.floor(ms / 86400000);

/** Apply an answer. `card` may be undefined for a never-seen item. Returns a new card. */
export function review(card, correct, today) {
  const c = card ? { ...card } : { box: 1, due: today, lapses: 0, seen: 0 };
  c.seen += 1;
  if (correct) c.box = Math.min(MAX_BOX, c.box + 1);
  else {
    c.box = 1;
    c.lapses += 1;
  }
  c.due = today + INTERVALS[c.box - 1];
  return c;
}

export const isDue = (card, today) => !!card && card.due <= today;

/**
 * Session queue: due cards first (earliest due, lowest box first; ties shuffled by rng),
 * then up to `newCap` unseen entries (shuffled).
 */
export function buildQueue(entries, cards, today, rng, { newCap = NEW_CAP } = {}) {
  const due = [];
  const fresh = [];
  for (const e of entries) {
    const c = cards[e.id];
    if (!c) fresh.push(e);
    else if (c.due <= today) due.push(e);
  }
  const rank = new Map(rng.shuffle(due).map((e, i) => [e.id, i])); // random tiebreak
  due.sort(
    (a, b) =>
      cards[a.id].due - cards[b.id].due || cards[a.id].box - cards[b.id].box || rank.get(a.id) - rank.get(b.id),
  );
  return [...due, ...rng.shuffle(fresh).slice(0, newCap)];
}

/** Fallback when nothing is due: seen entries, lowest box then earliest due first. */
export function practiceQueue(entries, cards, rng, exclude = []) {
  const skip = new Set(exclude);
  const seen = entries.filter((e) => cards[e.id] && !skip.has(e.id));
  const rank = new Map(rng.shuffle(seen).map((e, i) => [e.id, i]));
  return seen.sort((a, b) => cards[a.id].box - cards[b.id].box || rank.get(a.id) - rank.get(b.id));
}

/** new = never seen, learning = seen and below box 4, mastered = box 4+; due counts seen cards due now. */
export function deckProgress(entries, cards, today) {
  const p = { total: entries.length, new: 0, learning: 0, mastered: 0, due: 0 };
  for (const e of entries) {
    const c = cards[e.id];
    if (!c) p.new++;
    else {
      if (c.box >= MASTERED_BOX) p.mastered++;
      else p.learning++;
      if (c.due <= today) p.due++;
    }
  }
  return p;
}
