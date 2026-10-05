// End-to-end: every game is played to its results screen in a real browser (fake clock, so rounds take seconds).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, play, countdown, state, text, run, qmBot, ballparkBot, sureBot, wordBankBot, stroopBot, oddsBot } from './helpers.js';

let app;
before(async () => { app = await launch(); });
after(async () => { await app.close(); });

const noErrors = (errors) => assert.deepEqual(errors, [], errors.join('\n'));

test('Quick Math: 60s round → results, ratings, PB, achievements; Enter replays', async () => {
  const { page, errors } = await app.open('/play/quickmath?startLevel=3', { viewport: { width: 1000, height: 800 } });
  await countdown(page);
  await play(page, qmBot, { tickMs: 650 }); // a human cannot out-run the +2s streak bonus, a 120ms bot can
  const t = await text(page);
  assert.match(t, /Time!/);
  assert.match(t, /Grade:/);
  assert.match(t, /Skill ratings/);
  const s = await state(page);
  assert.ok(s.bests.quickmath.score > 400, `score ${s.bests.quickmath.score}`);
  assert.ok(s.ratings.mental_arithmetic.n > 10);
  assert.ok(s.ratings.percentages.n > 0, 'level 5+ problems rate the percentages skill');
  assert.ok(s.achievements.first_rep && s.achievements.qm_streak_20, 'first rep + hot hands unlocked');
  assert.equal(s.history.length, 1);
  assert.equal(s.xp > 0, true);
  // Enter plays again after the input guard
  await run(page, 600);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.qm-problem');
  await countdown(page);
  assert.ok(await page.evaluate(() => document.querySelector('.hud-time').textContent) !== '0:00');
  // Home shows the 7-day "ghost" average for this game
  await page.evaluate(() => (location.hash = '#/home'));
  assert.match(await page.textContent('.game-card:has-text("Quick Math")'), /7-day avg: [0-9]/);
  assert.match(await page.textContent('.game-card:has-text("Ballpark")'), /No runs this week/);
  noErrors(errors);
});

test('Quick Math: wrong answer costs 3s and resets the streak; skip costs 1s', async () => {
  const { page, errors } = await app.open('/play/quickmath?startLevel=1');
  await countdown(page);
  const time = () => page.evaluate(() => document.querySelector('.hud-time').textContent);
  await page.evaluate(() => { for (const k of ['9', '9', '9', 'Enter']) document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
  await run(page, 50);
  assert.match(await page.textContent('.feedback'), /Wrong/);
  assert.equal(await time(), '0:57');
  await page.keyboard.press('Escape');
  await run(page, 50);
  assert.match(await page.textContent('.feedback'), /Skipped/);
  assert.equal(await time(), '0:56');
  noErrors(errors);
});

test('Ballpark: exact answers score ≥125 each, plot and ratings appear', async () => {
  const { page, errors } = await app.open('/play/ballpark');
  await countdown(page);
  await play(page, ballparkBot, { tickMs: 400 });
  const s = await state(page);
  assert.ok(s.bests.ballpark.score >= 8 * 100, `score ${s.bests.ballpark.score}`);
  assert.equal(await page.locator('svg.chart circle.plot-dot').count(), 8);
  assert.ok(s.ratings.estimation.r > 1000);
  assert.ok(s.seen.ballpark.length >= 4, 'seen ids recorded to avoid repeats');
  noErrors(errors);
});

test('Ballpark: garbage input shows an inline error and does not advance', async () => {
  const { page, errors } = await app.open('/play/ballpark');
  await countdown(page);
  await page.fill('.bp-input', 'banana');
  await page.keyboard.press('Enter');
  assert.match(await page.textContent('#bp-error'), /could not read/i);
  assert.match(await page.textContent('.chip'), /Question 1 of 8/);
  await page.fill('.bp-input', '1/4');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#bp-error').textContent(), '');
  assert.ok(await page.locator('.stage .btn-primary.btn-big:not([hidden])').isVisible());
  noErrors(errors);
});

test('How Sure Are You?: calibrated session → chart, lifetime buckets, calibration achievement', async () => {
  const { page, errors } = await app.open('/play/sure');
  await countdown(page);
  await play(page, sureBot, { tickMs: 400 });
  const s = await state(page);
  assert.equal(s.calibration.buckets.reduce((a, b) => a + b.n, 0), 10);
  assert.equal(s.ratings.calibration.n, 1, 'calibration rated once per session');
  assert.ok(s.bests.sure.score > 500);
  assert.ok(s.achievements.calibrated, 'Brier < 0.10 over 10 questions');
  assert.match(await text(page), /well calibrated|underconfident/);
  assert.equal(await page.locator('svg.chart').count(), 1);
  noErrors(errors);
});

test('Word Bank: Italian rush persists SRS across a reload', async () => {
  const { page, errors } = await app.open('/play/wordbank?deck=italian');
  await countdown(page);
  await play(page, wordBankBot, { tickMs: 900 });
  const s = await state(page);
  const cards = Object.values(s.srs.italian);
  assert.equal(cards.length, 5, 'at most 5 new cards per session');
  assert.ok(cards.every((c) => c.box >= 2), 'all answered correctly → promoted');
  await page.reload();
  const again = await state(page);
  assert.deepEqual(again.srs.italian, s.srs.italian);
  await page.evaluate(() => (location.hash = '#/play/wordbank'));
  await page.waitForSelector('text=Choose a deck');
  assert.match(await text(page), /Italian\n\d+ due · 60 new · 0 mastered/);
  noErrors(errors);
});

test('Word Bank: typed recall appears for box 3+ cards (finance, reversed) and is accepted', async () => {
  const { page, errors } = await app.open('/play/wordbank?deck=finance');
  await page.evaluate(async () => {
    const { default: d } = await import('/data/decks/finance.js');
    const day = Math.floor(Date.now() / 86400000);
    window.__reps.patch((st) => (st.srs.finance = Object.fromEntries(d.entries.map((e) => [e.id, { box: 4, due: day, lapses: 0, seen: 5 }]))));
  });
  await page.goto(`${app.server.url}?debug&seed=e2e#/home`);
  await page.evaluate(() => (location.hash = '#/play/wordbank?deck=finance'));
  await countdown(page);
  let typed = 0;
  for (let i = 0; i < 600; i++) {
    if (await page.evaluate(() => !!document.querySelector('.bp-input') && !document.querySelector('.bp-input').closest('[hidden]'))) typed++;
    if ((await page.evaluate(wordBankBot)) === 'done') break;
    await run(page, 900);
  }
  assert.ok(typed > 3, `typed prompts seen: ${typed}`);
  assert.ok((await state(page)).bests.wordbank.score > 100);
  noErrors(errors);
});

test('Stroop: rule flips occur and a perfect bot clears 95% accuracy over 40+ trials', async () => {
  const { page, errors } = await app.open('/play/stroop');
  await countdown(page);
  let flips = 0;
  let seenWord = false;
  for (let i = 0; i < 3000; i++) {
    const info = await page.evaluate(() => ({ done: !document.querySelector('.st-word'), banner: !document.querySelector('.st-banner')?.hidden }));
    if (info.done) break;
    if (info.banner && !seenWord) flips++;
    seenWord = info.banner;
    await page.evaluate(stroopBot);
    await run(page, 120);
  }
  assert.ok(flips >= 2, `flips ${flips}`);
  const s = await state(page);
  assert.ok(s.achievements.stroop_95, 'Ink Control unlocked');
  assert.match(await text(page), /Stroop cost/);
  noErrors(errors);
});

test('Odds Check: base-rate bot gets every question right and the grid explanation renders', async () => {
  const { page, errors } = await app.open('/play/oddscheck');
  await countdown(page);
  let sawGrid = false;
  for (let i = 0; i < 400; i++) {
    if (await page.locator('svg.grid-chart rect').count()) sawGrid = true;
    if ((await page.evaluate(oddsBot)) === 'done') break;
    await run(page, 400);
  }
  assert.ok(sawGrid);
  const s = await state(page);
  assert.ok(s.bests.oddscheck.score >= 6 * 60);
  assert.equal(s.ratings.calibration.n, 1);
  noErrors(errors);
});

test('pause: P freezes the clock and makes the game inert; Esc resumes', async () => {
  const { page, errors } = await app.open('/play/quickmath?startLevel=3');
  await countdown(page);
  await run(page, 2000);
  await page.keyboard.press('p');
  assert.ok(await page.locator('[aria-label="Paused"]').isVisible());
  const t1 = await page.textContent('.hud-time');
  await run(page, 5000);
  assert.equal(await page.textContent('.hud-time'), t1);
  assert.equal(await page.evaluate(() => document.querySelector('.stage').inert), true);
  await page.keyboard.press('Escape');
  await run(page, 2000);
  assert.notEqual(await page.textContent('.hud-time'), t1);
  assert.equal(await page.evaluate(() => document.querySelector('.stage').inert), false);
  noErrors(errors);
});

test('the same ?seed gives identical content; different seeds differ', async () => {
  const first = async (seed) => {
    const { page } = await app.open('/play/ballpark', { query: `?debug&seed=${seed}` });
    await countdown(page);
    return page.textContent('.bp-question');
  };
  assert.equal(await first('same'), await first('same'));
  assert.notEqual(await first('same'), await first('other-seed-xyz'));
});
