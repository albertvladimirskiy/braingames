/* Service worker: cache-first app shell. The block between the GENERATED markers is
   rewritten by `npm run gen` (scripts/gen-sw.mjs); tests fail if it is stale. */
/* GENERATED:START */
const BUILD = '46dc495a36';
const PRECACHE = [
  "./",
  "css/base.css",
  "css/components.css",
  "css/games.css",
  "css/tokens.css",
  "icons/icon-maskable.svg",
  "icons/icon.svg",
  "index.html",
  "js/config.js",
  "js/core/clock.js",
  "js/core/events.js",
  "js/core/format.js",
  "js/core/prng.js",
  "js/core/router.js",
  "js/core/storage.js",
  "js/core/ui.js",
  "js/main.js",
  "manifest.webmanifest"
];
/* GENERATED:END */

const VERSION = '1.0.0'; // keep equal to js/config.js VERSION (a test enforces this)
const PREFIX = 'reps-';
const CACHE = `${PREFIX}${VERSION}-${BUILD}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function handle(request) {
  const cache = await caches.open(CACHE);
  // ignoreSearch: ?debug / ?seed= variants of the page must still resolve offline
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    if (request.mode === 'navigate') {
      const shell = await cache.match('index.html');
      if (shell) return shell;
    }
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(handle(request));
});
