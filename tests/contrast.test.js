// WCAG AA contrast for every text/background pairing the CSS actually uses, in both themes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(import.meta.dirname, '..', 'css/tokens.css'), 'utf8');

function block(selector) {
  const start = css.indexOf(selector);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}
function vars(text) {
  return Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]));
}
const dark = vars(block(':root {'));
const light = { ...dark, ...vars(block(":root[data-theme='light']")) };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground token, background token, minimum ratio, where it is used]
const PAIRS = [
  ['text', 'bg', 4.5, 'body text'],
  ['text', 'surface', 4.5, 'card text'],
  ['text', 'surface-2', 4.5, 'buttons'],
  ['text', 'surface-3', 4.5, 'chips, kbd, toasts'],
  ['text-muted', 'bg', 4.5, 'secondary text on page'],
  ['text-muted', 'surface', 4.5, 'secondary text on cards'],
  ['text-muted', 'surface-2', 4.5, 'secondary text in inputs/buttons'],
  ['text-muted', 'surface-3', 4.5, 'secondary text on chips'],
  ['good', 'bg', 4.5, 'feedback on page'],
  ['good', 'surface', 4.5, 'feedback in cards'],
  ['bad', 'bg', 4.5, 'feedback on page'],
  ['bad', 'surface', 4.5, 'feedback in cards'],
  ['bg', 'warn', 4.5, 'personal-best chip'],
  ['on-quant', 'quant', 4.5, 'primary button'],
  ['on-language', 'language', 4.5, 'primary button'],
  ['on-reasoning', 'reasoning', 4.5, 'primary button'],
  ['on-reflex', 'reflex', 4.5, 'primary button'],
  ['focus', 'bg', 3, 'focus ring (non-text)'],
  ['focus', 'surface', 3, 'focus ring (non-text)'],
  ['border', 'surface', 1.3, 'decorative borders only'],
];

for (const [name, theme] of [['dark', dark], ['light', light]]) {
  test(`${name} theme: text pairs meet WCAG AA`, () => {
    const failures = [];
    for (const [fg, bg, min, use] of PAIRS) {
      assert.ok(theme[fg] && theme[bg], `missing token ${fg} or ${bg}`);
      const r = ratio(theme[fg], theme[bg]);
      if (r < min) failures.push(`${fg} on ${bg} = ${r.toFixed(2)} (< ${min}) for ${use}`);
    }
    assert.deepEqual(failures, []);
  });
}

test('Stroop ink colours are readable on the (always dark) word panel in both themes', () => {
  for (const theme of [dark, light]) {
    for (const ink of ['ink-red', 'ink-blue', 'ink-green', 'ink-yellow']) {
      assert.ok(ratio(theme[ink], theme['stroop-bg']) >= 4.5, `${ink} on stroop-bg = ${ratio(theme[ink], theme['stroop-bg']).toFixed(2)}`);
    }
  }
});
