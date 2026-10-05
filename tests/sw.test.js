import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { computePrecache } from '../scripts/gen-sw.mjs';
import { VERSION, APP_NAME } from '../js/config.js';

const swSrc = readFileSync(resolve(import.meta.dirname, '..', 'sw.js'), 'utf8');

/** Minimal fake of the service-worker global + Cache Storage. */
function boot({ network = true, existing = {} } = {}) {
  const stores = new Map(Object.entries(existing).map(([k, v]) => [k, new Map(Object.entries(v))]));
  const listeners = {};
  const fetched = [];
  const keyOf = (r) => (typeof r === 'string' ? r : r.url).replace(/^https:\/\/x\.test\/app\//, '').split('?')[0] || './';
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return {
        async addAll(list) { for (const u of list) m.set(u, { url: u }); },
        async match(r) { return m.get(keyOf(r)) ?? m.get(typeof r === 'string' ? r : undefined); },
        async put(r, res) { m.set(keyOf(r), res); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(k) { return stores.delete(k); },
  };
  const self = {
    location: { origin: 'https://x.test' },
    addEventListener: (t, fn) => (listeners[t] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const ctx = vm.createContext({
    self, caches, URL,
    fetch: async (req) => {
      fetched.push(req.url);
      if (!network) throw new Error('offline');
      return { ok: true, clone() { return this; }, url: req.url };
    },
  });
  vm.runInContext(swSrc, ctx);
  const run = async (type, evt) => { let p; listeners[type]({ ...evt, waitUntil: (x) => (p = x), respondWith: (x) => (p = x) }); return p; };
  return { stores, run, fetched };
}

test('sw VERSION matches config VERSION', () => {
  assert.match(swSrc, new RegExp(`const VERSION = '${VERSION.replace(/\./g, '\\.')}'`));
});

test('sw precache list + build hash are fresh (run `npm run gen` if this fails)', () => {
  const { files, build } = computePrecache();
  assert.match(swSrc, new RegExp(`const BUILD = '${build}'`));
  const listed = JSON.parse(swSrc.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
  assert.deepEqual(listed, files);
  for (const must of ['./', 'index.html', 'js/main.js', 'css/tokens.css', 'manifest.webmanifest']) {
    assert.ok(listed.includes(must), `${must} missing`);
  }
});

test('install precaches the whole shell; activate removes only old reps caches', async () => {
  const { stores, run } = boot({ existing: { 'reps-0.0.1-old': {}, 'other-app': {} } });
  await run('install', {});
  const cacheName = [...stores.keys()].find((k) => k.startsWith('reps-') && !k.includes('old'));
  assert.ok(cacheName.includes(VERSION));
  assert.equal(stores.get(cacheName).size, JSON.parse(swSrc.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]).length);
  await run('activate', {});
  assert.ok(!stores.has('reps-0.0.1-old'));
  assert.ok(stores.has('other-app'));
  assert.ok(stores.has(cacheName));
});

test('offline: precached asset is served; ?debug navigation falls back to shell', async () => {
  const { run, fetched } = boot({ network: false });
  await run('install', {});
  const hit = await run('fetch', { request: { method: 'GET', url: 'https://x.test/app/js/main.js', mode: 'no-cors' } });
  assert.equal(hit.url, 'js/main.js');
  const nav = await run('fetch', { request: { method: 'GET', url: 'https://x.test/app/index.html?debug&seed=a', mode: 'navigate' } });
  assert.equal(nav.url, 'index.html');
  assert.equal(fetched.length, 0, 'no network needed');
});

test('offline + uncached non-navigation request rejects (does not hang)', async () => {
  const { run } = boot({ network: false });
  await run('install', {});
  await assert.rejects(run('fetch', { request: { method: 'GET', url: 'https://x.test/app/unknown.json', mode: 'cors' } }));
});

test('non-GET and cross-origin requests are not intercepted', async () => {
  const { run } = boot();
  await run('install', {});
  assert.equal(await run('fetch', { request: { method: 'POST', url: 'https://x.test/app/a' } }), undefined);
  assert.equal(await run('fetch', { request: { method: 'GET', url: 'https://other.test/a' } }), undefined);
});

test('manifest name and page title mirror APP_NAME from config (run `npm run gen` if this fails)', () => {
  const root = resolve(import.meta.dirname, '..');
  const man = JSON.parse(readFileSync(resolve(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(man.name, APP_NAME);
  assert.equal(man.short_name, APP_NAME);
  assert.match(readFileSync(resolve(root, 'index.html'), 'utf8'), new RegExp(`<title>${APP_NAME}</title>`));
});
