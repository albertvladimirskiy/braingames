// Home: welcome (first run), Daily card with streak, Recommended row, all games by category.
import { h } from '../core/ui.js';
import { APP_NAME, CATEGORIES, SKILLS } from '../config.js';
import { games } from '../games/registry.js';
import { DECKS } from '../games/wordbank/decks.js';
import { now } from '../core/clock.js';
import { navigate } from '../core/router.js';
import { utcDate, liveStreak } from '../core/daily.js';
import { dayIndex } from '../core/srs.js';
import { levelInfo } from '../core/scoring.js';
import { ratingTier, compareToHistory } from '../core/benchmarks.js';
import { recommend } from '../core/recommend.js';
import { formatInt } from '../core/format.js';
import { mountResetCountdown } from './countdown.js';

/** A game's tier = tier of the average rating over the skills it trains. */
function gameTier(state, game) {
  const rs = game.skills.map((s) => state.ratings[s]?.r ?? 1000);
  return ratingTier(rs.reduce((a, b) => a + b, 0) / rs.length);
}

export function renderHome(outlet, services) {
  const { storage } = services;
  const st = storage.get();
  const today = utcDate(now());
  const cleanups = [];
  const level = levelInfo(st.xp);
  const doneToday = st.daily.results[today];
  const streak = liveStreak(st.daily, today);
  const categoryOf = (id) => games.find((g) => g.id === id)?.category ?? 'quant';

  const welcome = !st.flags.welcomed && h('div', { class: 'card welcome stack-sm' },
    h('h2', null, `Welcome to ${APP_NAME}`),
    h('p', null, 'Short games of 45 to 90 seconds that let you practice mental math, estimation, calibrating your confidence, vocabulary and attention.'),
    h('p', null, 'Every game adapts to you, keeps a rating per skill, and compares each run with your own best and recent average.'),
    h('p', null, 'Start with today’s Daily: three quick rounds, identical for everyone in the world.'),
    h('button', {
      class: 'btn btn-primary btn-big', type: 'button',
      onClick() {
        storage.update((s) => (s.flags.welcomed = true));
        navigate('#/daily');
      },
    }, 'Play today’s Daily'),
    h('button', { class: 'btn btn-ghost', type: 'button', onClick() { storage.update((s) => (s.flags.welcomed = true)); navigate('#/home'); } }, 'Not now'),
  );

  const countdownLine = h('p', { class: 'muted small' });
  cleanups.push(mountResetCountdown(countdownLine, { onReset: () => navigate('#/home') }));
  const dailyCard = h('a', { class: 'card card-accent daily-card', 'data-cat': 'quant', href: '#/daily' },
    h('div', { class: 'row between' },
      h('h2', null, 'Daily Challenge'),
      h('span', { class: 'chip' }, `Streak ${streak}`, st.daily.freezes > 0 ? ` · ${st.daily.freezes} freeze${st.daily.freezes > 1 ? 's' : ''}` : ''),
    ),
    h('p', null, doneToday ? `Done today: ${doneToday.total} points. Tap to see it or practice.` : 'Not played yet: Quick Math, Ballpark and How Sure Are You?'),
    countdownLine,
  );

  const recs = recommend({ state: st, today, dayIdx: dayIndex(now()), decks: DECKS, categoryOf });
  const recRow = h('section', { 'aria-labelledby': 'rec-h' },
    h('h2', { id: 'rec-h' }, 'Recommended'),
    h('div', { class: 'stack-sm' }, recs.map((r) =>
      h('a', { class: 'card card-accent rec-card', 'data-cat': r.category, href: r.href }, h('strong', null, r.title), h('span', { class: 'muted' }, r.sub)))),
  );

  const groups = Object.entries(CATEGORIES).map(([cat, meta]) => {
    const inCat = games.filter((g) => g.category === cat);
    if (!inCat.length) return null;
    return h('section', { 'data-cat': cat },
      h('h2', { class: 'cat-title' }, h('span', { class: 'chip chip-dot' }, meta.label)),
      h('div', { class: 'stack-sm' }, inCat.map((g) => {
        const best = st.bests[g.id];
        const ghost = compareToHistory(st.history, g.id, 0, now()); // 7-day average of your free runs
        const tier = gameTier(st, g);
        return h('a', { class: 'card card-accent game-card', 'data-cat': cat, href: `#/play/${g.id}` },
          h('div', { class: 'row between' }, h('h3', null, g.name), h('span', { class: 'chip' }, tier.name)),
          h('p', { class: 'muted' }, g.blurb),
          h('div', { class: 'row between small' },
            h('span', null, `Best: ${best ? formatInt(best.score) : '–'}`),
            h('span', { class: 'ghost' }, ghost.avg7 == null ? 'No runs this week' : `7-day avg: ${formatInt(ghost.avg7)}`)),
          h('div', { class: 'muted small' }, g.skills.map((s) => SKILLS[s].label).join(', ')),
        );
      })),
    );
  });

  outlet.append(
    h('div', { class: 'stack' },
      h('div', { class: 'topbar' }, h('h1', { class: 'brand' }, APP_NAME), h('span', { class: 'chip' }, `Reps level ${level.level}`)),
      welcome,
      dailyCard,
      recRow,
      groups,
    ),
  );
  return () => cleanups.forEach((c) => c());
}
