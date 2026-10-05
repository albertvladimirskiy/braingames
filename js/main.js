// Phase-1 placeholder entry: replaced by the full wiring in phase 2.
import { APP_NAME } from './config.js';
import { startRouter } from './core/router.js';
import { h } from './core/ui.js';

const outlet = document.getElementById('main');
const page = (title) => (el) => el.append(h('h1', null, `${APP_NAME} — ${title}`));
startRouter({ outlet, routes: { home: page('home'), daily: page('daily'), stats: page('stats'), settings: page('settings'), play: page('play') } });
