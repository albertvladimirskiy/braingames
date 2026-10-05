import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, formatInt, formatSigned, formatValue, utcDateStr, formatCountdown } from '../js/core/format.js';

test('formatTime rounds up to whole seconds', () => {
  assert.equal(formatTime(60000), '1:00');
  assert.equal(formatTime(45000), '0:45');
  assert.equal(formatTime(400), '0:01');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(-5), '0:00');
});
test('formatInt / formatSigned', () => {
  assert.equal(formatInt(1234567), '1,234,567');
  assert.equal(formatSigned(5), '+5');
  assert.equal(formatSigned(-224), '−224');
  assert.equal(formatSigned(0), '0');
});
test('formatValue', () => {
  assert.equal(formatValue(384400), '384,400');
  assert.equal(formatValue(299792), '299,792');
  assert.match(formatValue(2.43290200817664e18), /^2\.433 × 10\^18$/);
  assert.match(formatValue(0.00025), /10\^-4/);
});
test('utcDateStr crosses boundaries in UTC', () => {
  assert.equal(utcDateStr(Date.UTC(2026, 11, 31, 23, 59, 59)), '2026-12-31');
  assert.equal(utcDateStr(Date.UTC(2027, 0, 1, 0, 0, 0)), '2027-01-01');
});
test('formatCountdown', () => {
  assert.equal(formatCountdown(3661000), '01:01:01');
  assert.equal(formatCountdown(-1), '00:00:00');
});
