// Performance audit with real timing (no fake clock): load metrics, payload size, and frame pacing during play
// under 4× CPU throttling (a mid-range phone). Usage: node scripts/perf-audit.mjs
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';
import { qmBot } from '../e2e/helpers.js';

const server = await startStaticServer();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, serviceWorkers: 'block' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

await page.addInitScript(() => {
  window.__perf = { lcp: 0, longTasks: 0, longMs: 0, shifts: 0 };
  new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__perf.lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__perf.longTasks++; window.__perf.longMs += e.duration; })).observe({ type: 'longtask', buffered: true });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__perf.shifts += e.value))).observe({ type: 'layout-shift', buffered: true });
});

await page.goto(`${server.url}?debug&numpad#/home`, { waitUntil: 'load' });
await page.waitForTimeout(800);
const load = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0;
  const res = performance.getEntriesByType('resource');
  const bytes = res.reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) + (nav.transferSize || 0);
  return { fcp: Math.round(fcp), lcp: Math.round(window.__perf.lcp), domInteractive: Math.round(nav.domInteractive), requests: res.length + 1, kb: Math.round(bytes / 1024), cls: +window.__perf.shifts.toFixed(4) };
});
console.log('load (4× CPU throttle):', load);

await page.evaluate(() => (location.hash = '#/play/quickmath?startLevel=5'));
await page.waitForTimeout(2600);
const frames = await page.evaluate(async (botSrc) => {
  const bot = eval(`(${botSrc})`);
  const dts = [];
  const spikes = [];
  let last = performance.now();
  const end = last + 8000;
  let answers = 0;
  await new Promise((resolve) => {
    (function tick(t) {
      if (t - last > 33.4) spikes.push({ at: Math.round(t - (end - 8000)), dt: Math.round(t - last), answers });
      dts.push(t - last);
      last = t;
      if (answers < Math.floor((t - (end - 8000)) / 450)) {
        try { if (bot() === 'ok') answers++; } catch { /* non-arithmetic problem */ }
      }
      if (t < end) requestAnimationFrame(tick);
      else resolve();
    })(last);
  });
  dts.sort((a, b) => a - b);
  const q = (p) => +dts[Math.floor((dts.length - 1) * p)].toFixed(1);
  return { frames: dts.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +dts.at(-1).toFixed(1), over33: dts.filter((d) => d > 33.4).length, longTasks: window.__perf.longTasks, longMs: Math.round(window.__perf.longMs), spikes };
}, qmBot.toString());
console.log('Quick Math play, 8s (frame deltas ms, 16.7 = 60 fps):', frames);

await browser.close();
await server.close();
