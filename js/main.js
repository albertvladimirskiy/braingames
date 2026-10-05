import { APP_NAME, DEBUG, query } from './config.js';
import { createStorage } from './core/storage.js';
import { startRouter } from './core/router.js';
import { h } from './core/ui.js';
import { applySettings } from './core/settings.js';
import { audio } from './core/audio.js';
import { haptics } from './core/haptics.js';
import { juice } from './core/juice.js';
import * as rating from './core/rating.js';
import * as clock from './core/clock.js';
import { games } from './games/registry.js';
import { mountGame } from './screens/gameShell.js';
import { renderHome } from './screens/home.js';
import { renderSettings } from './screens/settings.js';
import { renderDaily } from './screens/daily.js';
import { renderStats } from './screens/stats.js';

const storage = createStorage();
const services = { storage, rating, audio, haptics, juice, clock };
applySettings(storage.get().settings, services);
for (const q of ['(prefers-color-scheme: light)', '(prefers-reduced-motion: reduce)']) {
  matchMedia(q).addEventListener('change', () => applySettings(storage.get().settings, services));
}
// Browsers only allow audio after a gesture.
addEventListener('pointerdown', () => audio.unlock(), { once: true, passive: true });
addEventListener('keydown', () => audio.unlock(), { once: true, passive: true });

const outlet = document.getElementById('main');
const nav = document.getElementById('nav');
const NAV = [['home', 'Home'], ['daily', 'Daily'], ['stats', 'Stats'], ['settings', 'Settings']];

function renderNav(route) {
  nav.hidden = route.name === 'play';
  nav.replaceChildren(
    h('div', { class: 'nav-inner' },
      NAV.map(([name, label]) => h('a', { href: `#/${name}`, 'aria-current': route.name === name ? 'page' : null }, label)),
    ),
  );
}

const routes = {
  home: (el) => renderHome(el, services),
  play: (el, route) => mountGame(el, { services, gameId: route.id, query: route.query }),
  daily: (el) => renderDaily(el, services),
  stats: (el) => renderStats(el, services),
  settings: (el) => renderSettings(el, services),
};

startRouter({ routes, outlet, onRoute: (route) => { renderNav(route); document.title = APP_NAME; } });

if (DEBUG) {
  window.__reps = {
    storage, services, games, clock,
    state: () => storage.get(),
    patch: (fn) => storage.update(fn),
  };
}

const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if ('serviceWorker' in navigator && (!isLocal || query.has('sw'))) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
