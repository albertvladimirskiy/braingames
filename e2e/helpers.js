// Playwright helpers: app launcher with a fake clock, and in-page "bots" that play each game correctly
// (they read the DOM and look answers up in the shipped data files, so they cross-check the content too).
import { chromium } from 'playwright';
import { startStaticServer } from '../scripts/static-server.mjs';

export const START = '2026-10-05T12:00:00Z';

export async function launch() {
  const server = await startStaticServer();
  const browser = await chromium.launch();
  return {
    server,
    browser,
    /** New isolated page (own localStorage) with a fake clock. Collects console/page errors. */
    async open(hash = '/home', { query = '?debug&seed=e2e', time = START, viewport = { width: 390, height: 800 }, clock = true, sw = 'block', init = null, colorScheme = 'dark', reducedMotion = 'no-preference' } = {}) {
      const context = await browser.newContext({ viewport, serviceWorkers: sw, colorScheme, reducedMotion });
      if (init) await context.addInitScript(init);
      const page = await context.newPage();
      const errors = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      if (clock) await page.clock.install({ time: new Date(time) });
      await page.goto(`${server.url}${query}#${hash}`);
      return { page, context, errors };
    },
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

export const run = (page, ms) => page.clock.runFor(ms);
export const state = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('reps:state')));
export const text = (page) => page.evaluate(() => document.getElementById('main').innerText);

/** Step a bot until it reports 'done' (the results/interstitial screen appeared). */
export async function play(page, step, { tickMs = 150, max = 3000 } = {}) {
  for (let i = 0; i < max; i++) {
    const r = await page.evaluate(step);
    if (r === 'done') return i;
    await page.clock.runFor(tickMs);
  }
  throw new Error('bot never finished');
}

/** Skip the 3-2-1 countdown. */
export const countdown = (page) => page.clock.runFor(2600);

// ---------------------------------------------------------------------------------------------
// Bots: functions that run INSIDE the page. Each performs one step and returns 'done' when the game ended.
// ---------------------------------------------------------------------------------------------

export const qmBot = () => {
  const el = document.querySelector('.qm-problem');
  if (!el) return 'done';
  const t = el.textContent;
  const n = (x) => Number(x);
  let a;
  let m;
  if ((m = t.match(/^(\d+) ([+−×]) (\d+)$/))) a = m[2] === '+' ? n(m[1]) + n(m[3]) : m[2] === '−' ? n(m[1]) - n(m[3]) : n(m[1]) * n(m[3]);
  else if ((m = t.match(/^(\d+)% of (\d+)$/))) a = (n(m[1]) * n(m[2])) / 100;
  else if ((m = t.match(/^(\d+)% tip on a \$(\d+) bill$/))) a = (n(m[1]) * n(m[2])) / 100;
  else if ((m = t.match(/^\$(\d+) item, (\d+)% off\. Sale price\?$/))) a = (n(m[1]) * (100 - n(m[2]))) / 100;
  else if ((m = t.match(/^(\d+) → (\d+)\. How many % (up|down)\?$/))) a = Math.round((Math.abs(n(m[2]) - n(m[1])) / n(m[1])) * 100);
  else throw new Error(`unrecognised problem: ${t}`);
  for (const ch of String(a)) document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
  return 'ok';
};

export const ballparkBot = async () => {
  const q = document.querySelector('.bp-question');
  if (!q) return 'done';
  const fb = document.querySelector('.stage > .btn-primary.btn-big:not([hidden])');
  if (fb) {
    fb.click();
    return 'ok';
  }
  if (document.querySelector('.bp-input')?.closest('[hidden]')) return 'ok';
  const { BALLPARK_BANK } = await import('/data/ballpark-bank.js');
  const t = q.textContent;
  let truth = BALLPARK_BANK.find((b) => b.text === t)?.truth;
  const num = (s) => Number(s.replace(/,/g, ''));
  let m;
  if (truth == null) {
    if ((m = t.match(/^What is 2\^(\d+)\?$/))) truth = 2 ** num(m[1]);
    else if ((m = t.match(/^What is (\d+)! /))) truth = [...Array(num(m[1]))].reduce((a, _, i) => a * (i + 1), 1);
    else if ((m = t.match(/^What is ([\d,]+) × ([\d,]+)\?$/))) truth = num(m[1]) * num(m[2]);
    else if ((m = t.match(/^\$([\d,]+) grows at (\d+)% a year, compounded annually, for (\d+) years/))) truth = num(m[1]) * (1 + num(m[2]) / 100) ** num(m[3]);
    else if ((m = t.match(/^At (\d+)% growth a year/))) truth = Math.log(2) / Math.log(1 + num(m[1]) / 100);
    else if ((m = t.match(/^How many seconds are there in (\d+) days\?$/))) truth = num(m[1]) * 86400;
    else throw new Error(`no truth for: ${t}`);
  }
  const input = document.querySelector('.bp-input');
  input.value = String(truth);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return 'ok';
};

export const sureBot = async () => {
  const st = document.querySelector('.sure-statement');
  if (!st) return 'done';
  const vis = (b) => b && !b.closest('[hidden]') && !b.hidden;
  const next = [...document.querySelectorAll('.stage > .btn-primary.btn-big')].find(vis);
  if (next) {
    next.click();
    return 'ok';
  }
  const tf = [...document.querySelectorAll('.btn-big.grow')].find(vis);
  if (!tf) return 'ok'; // confidence step already handled
  const { TF_QUESTIONS } = await import('/data/tf-questions.js');
  const q = TF_QUESTIONS.find((x) => x.text === st.textContent);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: q.answer ? 't' : 'f', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '8', bubbles: true }));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return 'ok';
};

export const wordBankBot = async () => {
  const prompt = document.querySelector('.wb-prompt');
  if (!prompt) return 'done';
  if (document.querySelector('.wb-right, .wb-wrong') || document.querySelector('.feedback.bad')) return 'ok'; // reveal in progress
  const deckId = document.querySelector('.chip-dot').textContent.split(' · ')[0].toLowerCase();
  const { default: deck } = await import(`/data/decks/${deckId}.js`);
  const typedMode = document.querySelector('.wb-options').hidden;
  const p = prompt.textContent;
  if (!typedMode) {
    const entry = deck.entries.find((e) => e.front === p);
    const btn = [...document.querySelectorAll('.wb-option')].find((b) => b.querySelector('.wb-option-text').textContent === entry.back);
    btn.click();
  } else {
    const entry = deck.typed === 'reverse' ? deck.entries.find((e) => e.back === p) : deck.entries.find((e) => e.front === p);
    const input = document.querySelector('.bp-input');
    input.value = deck.typed === 'reverse' ? entry.front : entry.back.split(' / ')[0];
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
  return 'ok';
};

export const stroopBot = () => {
  const word = document.querySelector('.st-word');
  if (!word) return 'done';
  if (!word.textContent) return 'ok'; // rule-flip banner showing
  const rule = document.querySelector('.st-rule').dataset.rule;
  const target = rule === 'ink' ? word.dataset.ink : word.textContent.toLowerCase();
  const btn = [...document.querySelectorAll('.st-btn')].find((b) => b.querySelector('.st-name').textContent.toLowerCase() === target);
  if (btn && !btn.disabled) btn.click();
  return 'ok';
};

export const oddsBot = () => {
  const el = document.querySelector('.odds-text');
  if (!el) return 'done';
  const next = [...document.querySelectorAll('.stage > .btn-primary.btn-big')].find((b) => !b.hidden);
  if (next) {
    next.click();
    return 'ok';
  }
  const opts = [...document.querySelectorAll('.wb-option')];
  if (!opts.length || opts[0].disabled) return 'ok';
  const nums = (el.textContent.match(/\d[\d,]*/g) ?? []).map((s) => Number(s.replace(/,/g, '')));
  const [, , tp, , fp] = nums; // N, k, tp, k, fp, rest
  const pct = Math.round((tp * 100) / (tp + fp));
  opts.find((b) => b.querySelector('.wb-option-text').textContent === `${pct}%`).click();
  return 'ok';
};
