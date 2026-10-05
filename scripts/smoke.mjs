// Browser smoke test: serves the app, plays a few seconds of every game, fails on any console error.
// Needs Playwright (`npm i -D playwright && npx playwright install chromium`). Without it the script
// SKIPS (exit 0) with instructions; then review each view.js by hand (see docs/DECISIONS.md, "Verification").
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, normalize } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };

async function loadPlaywright() {
  for (const name of ['playwright', '@playwright/test', 'playwright-core']) {
    try {
      return await import(name);
    } catch {
      /* try next */
    }
  }
  return null;
}

const pw = await loadPlaywright();
if (!pw) {
  console.log('SKIP: Playwright is not installed, so no browser smoke test was run.');
  console.log('      Install with: npm i -D playwright && npx playwright install chromium');
  console.log('      Meanwhile: read each js/games/*/view.js for DOM/handler mistakes and play each game by hand.');
  process.exit(0);
}

const server = http.createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(root, path === '' ? 'index.html' : path);
    if (!file.startsWith(root)) throw new Error('outside root');
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await (pw.chromium ?? pw.default.chromium).launch();
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const key = (k, n = 1) => (async () => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(80); } })();
const PLAYERS = {
  quickmath: () => key('1', 4).then(() => key('Escape', 3)),
  ballpark: async () => { await page.fill('.bp-input', '1000'); await page.keyboard.press('Enter'); await page.waitForTimeout(500); await page.keyboard.press('Enter'); },
  sure: async () => { await key('t'); await key('7'); await key('Enter'); await page.waitForTimeout(500); await key('Enter'); },
  wordbank: () => key('1', 6),
  stroop: () => key('1', 8),
};
const ROUTES = { wordbank: 'wordbank?deck=italian', quickmath: 'quickmath?startLevel=3' };

let failed = false;
for (const id of Object.keys(PLAYERS)) {
  await page.goto(`${base}?debug&seed=smoke#/play/${ROUTES[id] ?? id}`);
  await page.waitForSelector('.game-root');
  await page.waitForTimeout(2600); // countdown
  await PLAYERS[id]();
  await page.waitForTimeout(1500);
  console.log(`${errors.length ? 'FAIL' : 'ok  '} ${id}`);
}
for (const route of ['home', 'daily', 'stats', 'settings']) {
  await page.goto(`${base}?debug#/${route}`);
  await page.waitForTimeout(300);
  console.log(`${errors.length ? 'FAIL' : 'ok  '} #/${route}`);
}
if (errors.length) {
  failed = true;
  console.error(errors.join('\n'));
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
