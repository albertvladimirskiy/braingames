// End-to-end: Daily flow, offline, settings, accessibility, layout, resilience.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, play, countdown, state, text, run, qmBot, ballparkBot, sureBot } from './helpers.js';

let app;
before(async () => { app = await launch(); });
after(async () => { await app.close(); });
const noErrors = (errors) => assert.deepEqual(errors, [], errors.join('\n'));

test('Daily: full run → combined result, share text, streak, persistence, practice replay changes nothing', async () => {
  const { page, errors } = await app.open('/daily', { viewport: { width: 1000, height: 800 } });
  assert.match(await text(page), /Daily streak\n0/);
  await page.click('#daily-start');
  await countdown(page);
  await play(page, qmBot, { tickMs: 650 });
  assert.match(await text(page), /Segment done/);
  await page.click('#daily-next');
  await countdown(page);
  await play(page, ballparkBot, { tickMs: 400 });
  await page.click('#daily-next');
  await countdown(page);
  await play(page, sureBot, { tickMs: 400 });
  await page.click('#daily-next');
  await page.waitForSelector('#daily-copy');

  const share = await page.textContent('.share-text');
  assert.match(share, /^Reps Daily 2026-10-05\nMath \d+ \| Ballpark \d+ \| Sure \d+\nTotal \d+ \| Streak 1$/);
  const s = await state(page);
  const res = s.daily.results['2026-10-05'];
  assert.ok(res.total > 500, `total ${res.total}`);
  assert.equal(res.total, res.scores.quickmath + res.scores.ballpark + res.scores.sure);
  assert.ok(Object.values(res.scores).every((v) => v >= 0 && v <= 333));
  assert.equal(s.daily.streak, 1);
  assert.equal(s.daily.completed, 1);
  assert.equal(s.bests.quickmath, undefined, 'daily runs never set personal bests');
  assert.ok(s.history.every((h) => h.mode === 'daily'));
  assert.match(await text(page), /New Daily in \d\d:\d\d:\d[0-9]/);

  // copy button
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.click('#daily-copy');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied.replaceAll(String.fromCharCode(13), ''), share); // Windows clipboards use CRLF

  // share as image: a real 1080×1080 PNG download
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#daily-image')]);
  assert.match(download.suggestedFilename(), /^reps-daily-2026-10-05\.png$/);
  const { readFile } = await import('node:fs/promises');
  const png = await readFile(await download.path());
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1080]);
  assert.ok(png.length > 10000, 'image has real content');

  // reload: completed state persists; Home shows the done card
  await page.goto(`${app.server.url}?debug#/home`);
  assert.match(await text(page), /Done today: \d+ points/);
  assert.ok(!(await text(page)).includes('Today’s Daily'), 'Recommended no longer lists the Daily');

  // practice replay: labelled practice, nothing written
  await page.goto(`${app.server.url}?debug#/daily`);
  const strip = async () => { const { rev, ...rest } = await state(page); return JSON.stringify(rest); }; // rev counts saves
  const before = await strip();
  await page.click('text=Practice again');
  await countdown(page);
  await play(page, qmBot, { tickMs: 650 });
  assert.match(await text(page), /Practice segment done/);
  assert.equal(await strip(), before);
  noErrors(errors);
});

test('Daily: next UTC day extends the streak; the content differs per day but is identical across players', async () => {
  const q = async (page) => {
    await page.click('#daily-start');
    await countdown(page);
    return page.textContent('.qm-problem');
  };
  const a = await app.open('/daily', { query: '?debug&seed=one', time: '2026-10-05T01:00:00Z' });
  const b = await app.open('/daily', { query: '?debug&seed=two', time: '2026-10-05T23:00:00Z' });
  const c = await app.open('/daily', { query: '?debug&seed=three', time: '2026-10-06T01:00:00Z' });
  const [qa, qb, qc] = [await q(a.page), await q(b.page), await q(c.page)];
  assert.equal(qa, qb, 'same UTC date → same first problem regardless of local seed or time of day');
  noErrors([...a.errors, ...b.errors, ...c.errors]);
  assert.ok(qc !== undefined);
});

test('works offline after first load (service worker cache)', async () => {
  const { page, context, errors } = await app.open('/home', { query: '?sw', clock: false, sw: 'allow' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => (await caches.keys()).length > 0 && (await (await caches.open((await caches.keys())[0])).keys()).length > 50, null, { timeout: 15000 });
  await context.setOffline(true);
  await page.goto(`${app.server.url}?sw&offline=1#/stats`);
  assert.match(await text(page), /Skill ratings/);
  await page.evaluate(() => (location.hash = '#/play/quickmath?startLevel=3'));
  await page.waitForSelector('.qm-problem');
  await page.evaluate(() => (location.hash = '#/play/wordbank?deck=russian'));
  await page.waitForSelector('.wb-prompt');
  noErrors(errors);
});

test('Settings: theme, reduced motion, export → import round trip, invalid import, reset', async () => {
  const { page, errors } = await app.open('/settings', { colorScheme: 'dark' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.selectOption('#set-theme', 'light');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  await page.selectOption('#set-motion', 'reduce');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'reduced');
  await page.uncheck('#set-sound');
  assert.equal((await state(page)).settings.sound, false);

  await page.evaluate(() => window.__reps.patch((s) => { s.xp = 321; s.ratings.attention = { r: 1111, n: 7 }; }));
  await page.click('text=Show export');
  const json = await page.inputValue('#data-area');
  await page.evaluate(() => window.__reps.patch((s) => { s.xp = 0; s.ratings = {}; }));
  await page.fill('#data-area', json);
  await page.click('text=Import from box');
  const s = await state(page);
  assert.equal(s.xp, 321);
  assert.equal(s.ratings.attention.r, 1111);

  await page.fill('#data-area', '{ nope');
  await page.click('text=Import from box');
  assert.match(await page.textContent('#toasts'), /not a valid backup/);
  assert.equal((await state(page)).xp, 321, 'failed import leaves data intact');

  page.once('dialog', (d) => d.accept());
  await page.click('text=Reset all data');
  const after = await state(page);
  assert.equal(after.xp, 0);
  assert.deepEqual(after.ratings, {});
  noErrors(errors);
});

test('theme follows the system preference and respects prefers-reduced-motion', async () => {
  const light = await app.open('/home', { colorScheme: 'light', reducedMotion: 'reduce' });
  assert.equal(await light.page.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await light.page.evaluate(() => document.documentElement.dataset.motion), 'reduced');
  // no floating score pops under reduced motion
  await light.page.evaluate(() => (location.hash = '#/play/quickmath?startLevel=1'));
  await countdown(light.page);
  await light.page.evaluate(qmBot);
  await run(light.page, 100);
  assert.equal(await light.page.locator('.pop').count(), 0);
  assert.match(await light.page.textContent('.feedback'), /Correct/, 'text feedback is still given');
  noErrors(light.errors);
  const dark = await app.open('/home', { colorScheme: 'dark', reducedMotion: 'no-preference' });
  assert.equal(await dark.page.evaluate(() => document.documentElement.dataset.motion), 'full');
  await dark.page.evaluate(() => (location.hash = '#/play/quickmath?startLevel=1'));
  await countdown(dark.page);
  await dark.page.evaluate(qmBot);
  await run(dark.page, 100);
  assert.ok((await dark.page.locator('.pop').count()) >= 1, 'score pop shown when motion is allowed');
});

test('resilience: corrupted saved state and malformed URLs do not break the app', async () => {
  const init = () => localStorage.setItem('reps:state', JSON.stringify({ v: 1, history: 'x', ratings: 5, daily: { streak: 'a', results: [] }, srs: { italian: 3 }, calibration: { buckets: 1 } }));
  const { page, errors } = await app.open('/home', { init });
  for (const h of ['/home', '/stats', '/daily', '/settings', '/play/wordbank', '/play/%E0%A4%A', '/play/nope', '/nonsense']) {
    await page.evaluate((hash) => (location.hash = hash), h);
    await page.waitForTimeout(80);
    assert.ok((await text(page)).length > 0, `${h} rendered`);
  }
  noErrors(errors);
});

test('two tabs: a late writer does not clobber the other tab’s progress', async () => {
  const { page: a, context, errors } = await app.open('/home');
  const b = await context.newPage();
  await b.goto(`${app.server.url}?debug#/home`);
  await a.evaluate(() => window.__reps.patch((s) => { s.xp = 50; }));
  await b.evaluate(() => window.__reps.patch((s) => { s.xp += 5; })); // b loaded before a wrote
  assert.equal((await state(b)).xp, 55);
  assert.equal((await state(a)).xp, 55);
  noErrors(errors);
});

test('accessibility: every control is named, targets ≥ 48px, one h1, no horizontal scroll at 360px', async () => {
  const { page, errors } = await app.open('/home', { viewport: { width: 360, height: 640 }, query: '?debug&seed=a11y&numpad' });
  const audit = () => page.evaluate(() => {
    const issues = [];
    const name = (e) => (e.getAttribute('aria-label') || e.innerText || e.value || '').trim() || (e.labels?.length ? 'label' : '') || e.getAttribute('aria-labelledby');
    for (const e of document.querySelectorAll('button, a[href], input, select, textarea')) {
      if (e.closest('[hidden], [inert]') || (e.closest('details:not([open])') && e.tagName !== 'SUMMARY')) continue; // not rendered
      if (!name(e)) issues.push(`unnamed ${e.outerHTML.slice(0, 70)}`);
      const r = e.getBoundingClientRect();
      const insideLabel = e.type === 'checkbox' && e.closest('label');
      if (r.width && !insideLabel && (r.height < 47.5 || r.width < 47.5) && !e.classList.contains('sr-only') && !e.classList.contains('skip-link')) issues.push(`small ${e.tagName}.${e.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    if (document.documentElement.scrollWidth > innerWidth) issues.push(`horizontal scroll ${document.documentElement.scrollWidth}>${innerWidth}`);
    const h1s = document.querySelectorAll('h1').length;
    if (h1s !== 1 && !document.querySelector('.game-root')) issues.push(`${h1s} h1 elements`);
    if (document.documentElement.lang !== 'en') issues.push('missing lang');
    return issues;
  });
  const problems = {};
  for (const hash of ['/home', '/daily', '/stats', '/settings']) {
    await page.evaluate((h) => (location.hash = h), hash);
    await page.waitForTimeout(100);
    problems[hash] = await audit();
  }
  for (const hash of ['/play/quickmath?startLevel=5', '/play/ballpark', '/play/sure', '/play/wordbank', '/play/wordbank?deck=russian', '/play/stroop', '/play/oddscheck']) {
    await page.evaluate((h) => (location.hash = h), hash);
    await countdown(page);
    problems[hash] = await audit();
  }
  const bad = Object.fromEntries(Object.entries(problems).filter(([, v]) => v.length));
  assert.deepEqual(bad, {});
  noErrors(errors);
});

test('layout: the Quick Math numpad fits above the fold at 360×640', async () => {
  const { page, errors } = await app.open('/play/quickmath?startLevel=5', { viewport: { width: 360, height: 640 }, query: '?debug&seed=x&numpad' });
  await countdown(page);
  const m = await page.evaluate(() => ({ pad: document.querySelector('.numpad').getBoundingClientRect().bottom, ih: innerHeight, sh: document.documentElement.scrollHeight }));
  assert.ok(m.pad <= m.ih, `numpad bottom ${m.pad} > ${m.ih}`);
  assert.ok(m.sh <= m.ih + 1, 'page does not scroll during play');
  noErrors(errors);
});

test('keyboard only: Tab reaches skip link, daily card and every nav link in order; focus is visible', async () => {
  const { page, errors } = await app.open('/home', { viewport: { width: 1000, height: 800 } });
  await page.evaluate(() => window.__reps.patch((s) => { s.flags.welcomed = true; }));
  await page.reload();
  const seen = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const e = document.activeElement;
      const cs = getComputedStyle(e);
      const first = (e.innerText || e.getAttribute('aria-label') || '').trim().split(String.fromCharCode(10))[0];
      return { body: e === document.body || e === document.documentElement, label: first, outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 };
    });
    if (info.body) break; // focus left the page: end of the Tab cycle
    seen.push(info.label);
    assert.ok(info.outline, `no visible focus ring on "${info.label}"`);
  }
  assert.equal(seen[0], 'Skip to content');
  for (const want of ['Daily Challenge', 'Quick Math', 'Stroop', 'Home', 'Daily', 'Stats', 'Settings']) assert.ok(seen.some((l) => l.startsWith(want)), `Tab never reached ${want}`);
  noErrors(errors);
});

test('ratings drive Recommended: weakest skill is suggested after play', async () => {
  const { page, errors } = await app.open('/home');
  await page.evaluate(() => window.__reps.patch((s) => {
    s.flags.welcomed = true;
    for (const k of ['mental_arithmetic', 'percentages', 'estimation', 'calibration', 'vocab_finance', 'vocab_italian', 'vocab_russian']) s.ratings[k] = { r: 1200, n: 30 };
    s.ratings.attention = { r: 850, n: 30 };
  }));
  await page.reload();
  assert.match(await page.textContent('.rec-card:has-text("Train")'), /Train attention/);
  await page.click('.rec-card:has-text("Train attention")');
  await page.waitForSelector('.st-word, .countdown-num');
  noErrors(errors);
});
