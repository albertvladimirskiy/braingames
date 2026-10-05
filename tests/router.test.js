import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHash } from '../js/core/router.js';

test('empty hash → home', () => assert.equal(parseHash('').name, 'home'));
test('#/home', () => assert.equal(parseHash('#/home').name, 'home'));
test('#/play/<id>', () => {
  const r = parseHash('#/play/quickmath');
  assert.equal(r.name, 'play');
  assert.equal(r.id, 'quickmath');
});
test('query inside hash', () => {
  const r = parseHash('#/play/wordbank?deck=italian&x=1');
  assert.deepEqual(r.query, { deck: 'italian', x: '1' });
  assert.equal(r.id, 'wordbank');
});
test('daily / stats / settings', () => {
  for (const n of ['daily', 'stats', 'settings']) assert.equal(parseHash(`#/${n}`).name, n);
});
test('trailing slashes and encoding', () => {
  assert.equal(parseHash('#/play/a%20b/').id, 'a b');
});
