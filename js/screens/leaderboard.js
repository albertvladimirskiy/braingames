// Daily leaderboard card (only shown when a server is connected). Submits the verified answer log once.
import { h, fill } from '../core/ui.js';

const text = (el, ...children) => fill(el, ...children);

export function leaderboardCard({ services, date }) {
  const { storage, sync } = services;
  const body = h('div', { class: 'stack-sm', 'aria-live': 'polite' }, h('p', { class: 'muted' }, 'Loading leaderboard…'));
  const card = h('section', { class: 'card stack-sm' }, h('h2', null, 'Daily leaderboard'), body);

  async function load() {
    text(body, h('p', { class: 'muted' }, 'Loading leaderboard…'));
    const rec = storage.get().daily.results[date];
    let note = '';
    if (rec?.logs && !rec.submitted) {
      const r = await sync.submitDaily(date, rec.logs);
      if (r.ok || r.status === 409) {
        storage.update((s) => {
          const x = s.daily.results[date];
          if (x) {
            x.submitted = true;
            delete x.logs;
          }
        });
        if (r.ok && r.flagged) note = 'Your run was flagged as implausibly fast, so it is not ranked.';
      } else if (r.status && r.status < 500 && r.status !== 429) {
        storage.update((s) => {
          const x = s.daily.results[date];
          if (x) {
            x.submitted = 'rejected';
            delete x.logs;
          }
        });
        note = `The server did not accept this run (${r.error}).`;
      } else note = `Could not reach the server (${r.error}). Your result is saved here; try again.`;
    }
    const lb = await sync.leaderboard(date, 10);
    if (!lb.ok) {
      text(body, note && h('p', { class: 'strong' }, note), h('p', { class: 'muted' }, `Leaderboard unavailable (${lb.error}).`), h('button', { class: 'btn btn-sm', type: 'button', onClick: load }, 'Retry'));
      return;
    }
    text(body,
      note && h('p', { class: 'strong' }, note),
      lb.entries.length
        ? h('ol', { class: 'answer-list lb-list' }, lb.entries.map((e) => h('li', null, h('span', null, e.name), h('strong', { class: 'tabular' }, ` ${e.total}`))))
        : h('p', { class: 'muted' }, 'No scores yet today.'),
      lb.me
        ? h('p', { class: 'strong' }, lb.me.flagged ? 'Your run was flagged and is not ranked.' : `You: rank ${lb.me.rank} of ${lb.count} (${lb.me.total} points)`)
        : h('p', { class: 'muted' }, 'Finish the Daily to appear here.'),
      h('p', { class: 'muted small' }, 'Scores are re-computed by the server from your answers.'),
    );
  }
  load();
  return card;
}
