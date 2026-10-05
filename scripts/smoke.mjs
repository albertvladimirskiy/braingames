// Quick browser smoke test (a few seconds per game, fails on any console error). The deep suite is `npm run e2e`.
// Needs Playwright (devDependency): `npm i` then `npx playwright install chromium`.
import { startStaticServer } from './static-server.mjs';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('SKIP: Playwright is not installed. Run `npm i && npx playwright install chromium`.');
  process.exit(0);
}

const server = await startStaticServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

const key = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(80); } };
const PLAYERS = {
  'quickmath?startLevel=3': () => key('1', 4).then(() => key('Escape', 3)),
  ballpark: async () => { await page.fill('.bp-input', '1000'); await page.keyboard.press('Enter'); await page.waitForTimeout(500); await page.keyboard.press('Enter'); },
  sure: async () => { await key('t'); await key('7'); await key('Enter'); await page.waitForTimeout(500); await key('Enter'); },
  'wordbank?deck=italian': () => key('1', 6),
  stroop: () => key('1', 8),
  oddscheck: () => key('1', 3),
};

for (const [route, poke] of Object.entries(PLAYERS)) {
  await page.goto(`${server.url}?debug&seed=smoke#/play/${route}`);
  await page.waitForSelector('.game-root');
  await page.waitForTimeout(2600); // countdown
  await poke();
  await page.waitForTimeout(1200);
  console.log(`${errors.length ? 'FAIL' : 'ok  '} ${route.split('?')[0]}`);
}
for (const route of ['home', 'daily', 'stats', 'settings']) {
  await page.goto(`${server.url}?debug#/${route}`);
  await page.waitForTimeout(300);
  console.log(`${errors.length ? 'FAIL' : 'ok  '} #/${route}`);
}
await browser.close();
await server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
