// End-to-end: optional server link (connect, verified Daily leaderboard, link a second device, disconnect).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, state, text, playDaily, startBackend } from './helpers.js';

let app, backend;
before(async () => {
  app = await launch();
  backend = await startBackend();
});
after(async () => {
  await app.close();
  await backend.close();
});
const noErrors = (errors) => assert.deepEqual(errors, [], errors.join('\n'));

test('off by default: no request ever leaves the app until a server is connected', async () => {
  const { page, errors } = await app.open('/home');
  const external = [];
  page.on('request', (r) => !r.url().startsWith(app.server.url) && external.push(r.url()));
  await page.evaluate(() => (location.hash = '#/settings'));
  await page.evaluate(() => (location.hash = '#/stats'));
  await page.evaluate(() => (location.hash = '#/play/ballpark'));
  assert.deepEqual(external, []);
  assert.match(await text(page), /Sync|Stats|Ballpark/);
  noErrors(errors);
});

test('connect → verified Daily → leaderboard; second device linked by code; disconnect keeps local data', async () => {
  const one = await app.open('/settings');
  await one.page.fill('#sync-url', backend.url);
  await one.page.fill('#sync-name', 'Ann');
  await one.page.click('#sync-connect');
  await one.page.waitForSelector('#sync-now');
  assert.match(await one.page.textContent('#sync-card'), new RegExp(backend.url.replace(/[.]/g, '.')));
  const s1 = await state(one.page);
  assert.ok(s1.settings.sync.token);
  assert.equal(Object.keys(backend.store.data.devices).length >= 1, true);

  // play the Daily; the final screen submits it and shows the leaderboard
  await one.page.evaluate(() => (location.hash = '#/daily'));
  await playDaily(one.page);
  await one.page.waitForSelector('.lb-list');
  assert.match(await one.page.textContent('.stack-sm:has(.lb-list)'), /You: rank 1 of 1/);
  assert.match(await one.page.textContent('.lb-list'), /Ann/);
  const done = (await state(one.page)).daily.results['2026-10-05'];
  assert.equal(done.submitted, true);
  assert.equal(done.logs, undefined, 'the answer log is dropped once the server has it');
  const deviceId = s1.settings.sync.deviceId;
  assert.equal(backend.store.data.daily['2026-10-05'][deviceId].total, done.total, 'server recomputed the same total');

  // link a second device with the code
  await one.page.evaluate(() => (location.hash = '#/settings'));
  await one.page.click('#sync-now');
  await one.page.waitForFunction(() => document.getElementById('sync-status').textContent === 'Synced.');
  await one.page.click('#sync-show-code');
  const code = await one.page.inputValue('#sync-code-out');
  assert.match(code, /^reps-link:/);

  const two = await app.open('/settings');
  await two.page.click('summary');
  await two.page.fill('#sync-code', code);
  await two.page.click('#sync-link');
  await two.page.waitForSelector('#sync-now');
  const s2 = await state(two.page);
  assert.equal(s2.daily.results['2026-10-05'].total, done.total, 'progress arrived on the second device');
  assert.equal(s2.settings.sync.deviceId, deviceId);
  assert.ok(s2.xp > 0);

  // the second device is told the Daily is done
  await two.page.evaluate(() => (location.hash = '#/home'));
  assert.match(await text(two.page), /Done today/);

  // disconnect: credentials gone, data kept
  await two.page.evaluate(() => (location.hash = '#/settings'));
  await two.page.click('#sync-disconnect');
  const after = await state(two.page);
  assert.equal(after.settings.sync, null);
  assert.ok(after.xp > 0);
  noErrors([...one.errors, ...two.errors]);
});

test('server unreachable: the app keeps working and shows a retryable error', async () => {
  const { page, errors } = await app.open('/settings');
  await page.fill('#sync-url', 'http://127.0.0.1:9'); // nothing listens here
  await page.click('#sync-connect');
  await page.waitForFunction(() => /./.test(document.getElementById('sync-status')?.textContent ?? ''));
  assert.match(await page.textContent('#sync-status'), /fetch failed|Failed|NetworkError|server/i);
  assert.equal((await state(page))?.settings?.sync ?? null, null);
  await page.evaluate(() => (location.hash = '#/play/stroop'));
  await page.waitForSelector('.st-word, .countdown-num');
  assert.deepEqual(errors.filter((e) => !/Failed to load resource|ERR_/i.test(e)), []);
});
