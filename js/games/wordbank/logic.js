// Word Bank: answer matching, multiple-choice construction, session queue, Rush scoring state. Pure.
import { applyCorrect } from '../../core/scoring.js';
import { buildQueue, practiceQueue } from '../../core/srs.js';

export const RUSH_MS = 60000;
export const WRONG_PENALTY_MS = 3000;
export const REVEAL_MS = 1200;
export const BASE_POINTS = 10;
export const TYPED_CHANCE = 0.3;
export const TYPED_MIN_BOX = 3;
export const MC_TARGET_MS = 4500;
export const TYPED_TARGET_MS = 9000;

// ---- matching -------------------------------------------------------------------------------

/** lower-case, accent-insensitive, punctuation-free, single-spaced. */
export function normalize(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[-–—/]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ARTICLES = /^(to|the|a|an) /;
/** normalize + drop a leading "to/the/a/an" so "to eat" ≈ "eat". */
export const canon = (s) => {
  const n = normalize(s);
  const stripped = n.replace(ARTICLES, '');
  return stripped || n;
};

/** " / "-separated alternatives of a back string, parentheticals removed, canonicalized. */
export const altsOf = (back) =>
  back
    .split(' / ')
    .map((a) => canon(a.replace(/\s*\(.*?\)/g, '')))
    .filter(Boolean);

export function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Small typo tolerance: none for ≤3 letters, 1 edit for 4–7, 2 edits for 8+. */
export const tolerance = (len) => (len <= 3 ? 0 : len <= 7 ? 1 : 2);

/** `targets` are canonical strings (see targetsFor). */
export function isTypedCorrect(input, targets) {
  const n = canon(input);
  if (!n) return false;
  return targets.some((t) => n === t || levenshtein(n, t) <= tolerance(t.length));
}

/** Typed-recall prompt + accepted answers. 'reverse' decks show the back and ask for the front. */
export function typedQuestion(deck, entry) {
  if (deck.typed === 'reverse') {
    return {
      prompt: entry.back,
      hint: null,
      instruction: 'Type the term',
      targets: [entry.front, ...(entry.alt ?? [])].map(canon),
      answerText: entry.front,
    };
  }
  return {
    prompt: entry.front,
    hint: entry.hint ?? null,
    instruction: 'Type the English',
    targets: [...altsOf(entry.back), ...(entry.alt ?? []).map(canon)],
    answerText: entry.back,
  };
}

// ---- multiple choice ------------------------------------------------------------------------

/**
 * Four options (fewer only for tiny decks). Distractors come from the same deck and are never also correct:
 * they must not share any accepted alternative with the right answer, nor with each other.
 */
export function buildChoices(deck, entry, rng) {
  const correctAlts = new Set(altsOf(entry.back));
  const usedAlts = new Set(correctAlts);
  const candidates = deck.entries.filter((e) => e.id !== entry.id);
  const sameTag = rng.shuffle(candidates.filter((e) => e.tag === entry.tag));
  const rest = rng.shuffle(candidates.filter((e) => e.tag !== entry.tag));
  const picked = [];
  for (const c of [...sameTag.slice(0, 2), ...rest, ...sameTag.slice(2)]) {
    if (picked.length === 3) break;
    const alts = altsOf(c.back);
    if (alts.some((a) => usedAlts.has(a))) continue;
    alts.forEach((a) => usedAlts.add(a));
    picked.push(c);
  }
  const options = rng.shuffle([{ text: entry.back, correct: true }, ...picked.map((c) => ({ text: c.back, correct: false }))]);
  return { options, correctIndex: options.findIndex((o) => o.correct) };
}

/** Cards in box 3+ are asked as typed recall about 30% of the time. */
export const chooseFormat = (card, rng) => (card && card.box >= TYPED_MIN_BOX && rng.chance(TYPED_CHANCE) ? 'typed' : 'mc');

// ---- session queue ---------------------------------------------------------------------------

/**
 * Next entry for the session. `queue` is mutated (shifted). Order: due cards, then ≤5 new (built once at
 * session start), then lapses re-inserted by the caller, then extra practice over seen cards.
 */
export function takeNext({ queue, deck, cards, today, rng, lastId }) {
  if (queue.length === 0) {
    queue.push(...buildQueue(deck.entries, cards, today, rng, { newCap: 0 })); // newly-due (e.g. lapsed) cards
  }
  if (queue.length === 0) queue.push(...practiceQueue(deck.entries, cards, rng, lastId ? [lastId] : []));
  if (queue.length === 0) queue.push(...rng.shuffle(deck.entries));
  const i = queue.length > 1 && queue[0].id === lastId ? 1 : 0;
  return queue.splice(i, 1)[0];
}

/** Put a missed card back a few turns ahead so it returns soon. */
export function requeue(queue, entry, gap = 3) {
  queue.splice(Math.min(queue.length, gap), 0, entry);
}

// ---- Rush scoring ----------------------------------------------------------------------------

export function initState({ durationMs = RUSH_MS } = {}) {
  return { timeLeftMs: durationMs, durationMs, streak: 0, bestStreak: 0, score: 0, correct: 0, wrong: 0 };
}

export const tick = (s, dtMs) => ({ ...s, timeLeftMs: s.timeLeftMs - dtMs });
export const isOver = (s) => s.timeLeftMs <= 0;

export function resolve(s, correct) {
  const n = { ...s };
  const out = { points: 0, multiplier: 1, bonusMs: 0, penaltyMs: 0, milestone: false };
  if (correct) {
    const c = applyCorrect(s.streak, BASE_POINTS);
    Object.assign(out, { points: c.points, multiplier: c.multiplier, bonusMs: c.bonusMs, milestone: c.milestone });
    n.streak = c.streak;
    n.bestStreak = Math.max(s.bestStreak, c.streak);
    n.score += c.points;
    n.correct += 1;
    n.timeLeftMs += c.bonusMs;
  } else {
    n.streak = 0;
    n.wrong += 1;
    n.timeLeftMs = Math.max(0, s.timeLeftMs - WRONG_PENALTY_MS);
    out.penaltyMs = WRONG_PENALTY_MS;
  }
  return { state: n, ...out };
}

/** GameResult item for the rating system: d = 800 + 100·box (box before the answer). */
export const makeItem = ({ deck, card, correct, timeMs, format }) => {
  const box = card?.box ?? 1;
  return { skill: deck.skill, difficulty: 800 + 100 * box, correct, timeMs, targetMs: format === 'typed' ? TYPED_TARGET_MS : MC_TARGET_MS, box, format };
};
