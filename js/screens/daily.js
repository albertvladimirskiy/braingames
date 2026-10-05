// Daily Challenge: Quick Math (45s) → Ballpark (5) → How Sure Are You? (6), same content for everyone.
import { h, toast } from '../core/ui.js';
import { mountGame } from './gameShell.js';
import { mountResetCountdown } from './countdown.js';
import { shareDailyImage } from './shareImage.js';
import { leaderboardCard } from './leaderboard.js';
import { getGame } from '../games/registry.js';
import { now } from '../core/clock.js';
import { navigate } from '../core/router.js';
import { runAchievements } from '../core/progress.js';
import { SEGMENTS, SEGMENT_POINTS, dailySeed, utcDate, normalizeSegment, recordDaily, liveStreak, shareText } from '../core/daily.js';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { value: text, 'aria-hidden': 'true', style: { position: 'fixed', opacity: '0' } });
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand?.('copy');
    ta.remove();
    return !!ok;
  }
}

export function renderDaily(outlet, services) {
  const { storage } = services;
  const today = utcDate(now());
  const view = h('div', { class: 'stack' });
  const gameHost = h('div');
  outlet.append(view, gameHost);
  let gameCleanup = null;
  let countdownCleanup = null;
  let run = null; // { practice, scores, logs }

  const stopGame = () => {
    gameCleanup?.();
    gameCleanup = null;
    gameHost.replaceChildren();
  };
  const setView = (...nodes) => {
    countdownCleanup?.();
    countdownCleanup = null;
    view.hidden = false;
    view.replaceChildren(...nodes);
  };
  const countdown = () => {
    const p = h('p', { class: 'muted' });
    countdownCleanup = mountResetCountdown(p, { onReset: () => navigate('#/daily') });
    return p;
  };

  const segmentRows = (scores, activeIdx = -1) =>
    SEGMENTS.map((seg, i) => {
      const done = scores[seg.gameId] != null;
      const game = getGame(seg.gameId);
      return h('div', { class: 'kv', 'data-cat': game.category },
        h('span', null, `${i + 1}. ${game.name}`, h('small', { class: 'muted' }, ` · ${seg.durationSec ? `${seg.durationSec}s` : `${seg.questions} questions`}`)),
        h('strong', { class: 'tabular' }, done ? `${scores[seg.gameId]} / ${SEGMENT_POINTS}` : i === activeIdx ? 'next' : '–'));
    });

  function overview() {
    const st = storage.get();
    const result = st.daily.results[today];
    if (result) return finalView(result.scores, {});
    const progress = st.daily.progress?.date === today ? st.daily.progress.scores : {};
    const started = Object.keys(progress).length > 0;
    const streak = liveStreak(st.daily, today);
    setView(
      h('h1', null, 'Daily Challenge'),
      h('p', { class: 'muted' }, `${today} (UTC). Everyone worldwide gets the same questions. Only your first attempt of the day counts.`),
      h('div', { class: 'card stack-sm' }, segmentRows(progress, SEGMENTS.findIndex((s) => progress[s.gameId] == null))),
      h('div', { class: 'card' }, h('div', { class: 'kv' }, h('span', null, 'Daily streak'), h('strong', { class: 'tabular' }, streak)), h('div', { class: 'kv' }, h('span', null, 'Streak freezes'), h('strong', { class: 'tabular' }, `${st.daily.freezes} / 2`)), h('p', { class: 'muted small' }, 'Earn a freeze every 7 days. It is used automatically if you miss a day.')),
      h('button', { class: 'btn btn-primary btn-big', type: 'button', id: 'daily-start', onClick: () => start(false) }, started ? 'Continue' : 'Start today’s Daily'),
      countdown(),
    );
    view.querySelector('#daily-start')?.focus();
  }

  function start(practice) {
    const prior = storage.get().daily;
    const resume = !practice && prior.progress?.date === today ? prior.progress : null;
    run = { practice, scores: { ...(resume?.scores ?? {}) }, logs: { ...(resume?.logs ?? {}) } };
    nextSegment();
  }

  function nextSegment() {
    const idx = SEGMENTS.findIndex((s) => run.scores[s.gameId] == null);
    if (idx === -1) return complete();
    const seg = SEGMENTS[idx];
    stopGame();
    view.hidden = true;
    countdownCleanup?.();
    gameCleanup = mountGame(gameHost, {
      services, gameId: seg.gameId, mode: 'daily', seed: dailySeed(today, seg.gameId), embedded: true,
      practice: run.practice, label: `${idx + 1}/${SEGMENTS.length}${run.practice ? ' practice' : ''}`,
      config: { durationSec: seg.durationSec, questions: seg.questions },
      onExit: () => {
        stopGame();
        overview();
      },
      onFinish: (result) => {
        run.scores[seg.gameId] = normalizeSegment(seg.gameId, result.score);
        run.logs[seg.gameId] = result.stats.log;
        if (!run.practice) storage.update((s) => (s.daily.progress = { date: today, scores: { ...run.scores }, logs: { ...run.logs } }));
        stopGame();
        interstitial(idx, result);
      },
    });
  }

  function interstitial(idx, result) {
    const seg = SEGMENTS[idx];
    const hasNext = idx < SEGMENTS.length - 1;
    setView(
      h('h1', null, run.practice ? 'Practice segment done' : 'Segment done'),
      h('div', { class: 'card stack-sm' },
        h('div', { class: 'big-num center' }, `${run.scores[seg.gameId]}`),
        h('p', { class: 'center muted' }, `of ${SEGMENT_POINTS} (raw score ${result.score})`),
        segmentRows(run.scores, idx + 1),
      ),
      h('button', { class: 'btn btn-primary btn-big', type: 'button', id: 'daily-next', onClick: nextSegment }, hasNext ? `Next: ${getGame(SEGMENTS[idx + 1].gameId).name}` : 'See my Daily result'),
    );
    view.querySelector('#daily-next')?.focus();
  }

  function complete() {
    let info = { counted: false, streak: 0, earnedFreeze: false, frozen: 0, total: 0 };
    if (!run.practice) {
      storage.update((s) => {
        const r = recordDaily(s.daily, today, run.scores, services.sync.connected() ? { logs: run.logs, submitted: false } : {});
        s.daily = r.daily;
        info = r;
        for (const a of runAchievements(s, null, now())) toast(a.desc, { title: `Unlocked: ${a.name}` });
      });
    }
    finalView(run.scores, { practice: run.practice, info });
  }

  function finalView(scores, { practice = false, info = null }) {
    const st = storage.get();
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    const streak = practice ? liveStreak(st.daily, today) : st.daily.streak;
    const text = shareText({ date: today, scores, total, streak });
    const copyBtn = h('button', {
      class: 'btn btn-primary btn-big', type: 'button', id: 'daily-copy',
      async onClick() {
        const ok = await copyText(text);
        toast(ok ? 'Result copied to the clipboard.' : 'Could not copy automatically; select the text above.', { title: 'Share' });
      },
    }, 'Copy result');
    setView(
      h('h1', null, practice ? 'Practice result' : 'Daily complete'),
      h('p', { class: 'muted' }, practice ? 'This was practice: it does not change your streak or score.' : `${today} (UTC)`),
      h('div', { class: 'card stack-sm' },
        h('div', { class: 'big-num center' }, `${total}`),
        h('p', { class: 'center muted' }, 'total (each segment is out of 333)'),
        segmentRows(scores),
        !practice && h('div', { class: 'kv' }, h('span', null, 'Streak'), h('strong', { class: 'tabular' }, streak)),
        info?.frozen > 0 && h('p', { class: 'muted small' }, `A streak freeze covered ${info.frozen} missed day${info.frozen > 1 ? 's' : ''}.`),
        info?.earnedFreeze && h('p', { class: 'strong' }, 'You earned a streak freeze!'),
      ),
      h('pre', { class: 'share-text', 'aria-label': 'Shareable result' }, text),
      !practice && services.sync.connected() && leaderboardCard({ services, date: today }),
      copyBtn,
      h('button', { class: 'btn btn-big', type: 'button', id: 'daily-image', onClick: () => shareDailyImage({ date: today, scores, total, streak }) }, 'Share as image'),
      h('button', { class: 'btn', type: 'button', onClick: () => start(true) }, 'Practice again (does not count)'),
      h('a', { class: 'btn btn-ghost', href: '#/home' }, 'Home'),
      countdown(),
    );
  }

  overview();
  return () => {
    stopGame();
    countdownCleanup?.();
  };
}
