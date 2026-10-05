// Interim home (phase 2): lists games. Replaced by the full home in phase 6.
import { h } from '../core/ui.js';
import { games } from '../games/registry.js';

export function renderHome(outlet) {
  outlet.append(
    h('div', { class: 'stack' },
      h('h1', null, 'Games'),
      games.map((g) => h('a', { class: 'card card-accent', 'data-cat': g.category, href: `#/play/${g.id}` }, h('h2', null, g.name), h('p', { class: 'muted' }, g.blurb))),
    ),
  );
}
