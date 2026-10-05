// "Recommended" row for Home. Pure: all inputs are passed in.
import { SKILLS } from '../config.js';
import { deckProgress } from './srs.js';

/**
 * @param state       storage state
 * @param today       UTC date string
 * @param dayIdx      UTC day index (for SRS)
 * @param decks       [{ id, name, entries }]
 * @param categoryOf  (gameId) => category
 * Returns [{ kind, title, sub, href, category }] in order: Daily (if not done), weakest skill, deck with due cards.
 */
export function recommend({ state, today, dayIdx, decks, categoryOf }) {
  const out = [];
  if (!state.daily.results[today]) {
    out.push({ kind: 'daily', title: 'Today’s Daily', sub: 'Three short rounds, same for everyone', href: '#/daily', category: 'quant' });
  }

  const ids = Object.keys(SKILLS);
  const weakest = ids
    .map((id, order) => ({ id, order, r: state.ratings[id]?.r ?? 1000, n: state.ratings[id]?.n ?? 0 }))
    .sort((a, b) => a.r - b.r || a.n - b.n || a.order - b.order)[0];
  const meta = SKILLS[weakest.id];
  const skillHref = `#/play/${meta.gameId}${meta.option ? `?deck=${meta.option}` : ''}`;
  out.push({
    kind: 'skill', title: `Train ${meta.label.toLowerCase()}`, sub: `Your lowest rating (${Math.round(weakest.r)})`,
    href: skillHref, category: categoryOf(meta.gameId),
  });

  const due = decks
    .map((d) => ({ d, p: deckProgress(d.entries, state.srs[d.id] ?? {}, dayIdx) }))
    .filter((x) => x.p.due > 0)
    .sort((a, b) => b.p.due - a.p.due)[0];
  if (due) {
    const href = `#/play/wordbank?deck=${due.d.id}`;
    if (href !== skillHref) {
      out.push({ kind: 'deck', title: `${due.d.name} cards due`, sub: `${due.p.due} card${due.p.due === 1 ? '' : 's'} ready to review`, href, category: categoryOf('wordbank') });
    }
  }
  return out;
}
