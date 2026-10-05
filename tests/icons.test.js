import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.webmanifest'), 'utf8'));

test('every manifest icon exists; PNGs have the declared dimensions and a valid signature', () => {
  assert.ok(manifest.icons.length >= 4);
  for (const icon of manifest.icons) {
    const file = resolve(root, icon.src);
    assert.ok(existsSync(file), `${icon.src} missing`);
    if (icon.type === 'image/png') {
      const b = readFileSync(file);
      assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      assert.equal(`${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`, icon.sizes);
    }
  }
});

test('installability basics: 192 and 512 PNG "any" icons plus a maskable one, start_url and scope are relative', () => {
  const has = (sizes, purpose) => manifest.icons.some((i) => i.sizes === sizes && i.type === 'image/png' && i.purpose === purpose);
  assert.ok(has('192x192', 'any') && has('512x512', 'any') && has('512x512', 'maskable'));
  assert.match(manifest.start_url, /^\.\//);
  assert.match(manifest.scope, /^\.\//);
  assert.ok(existsSync(resolve(root, 'icons/apple-touch-icon.png')));
  assert.match(readFileSync(resolve(root, 'index.html'), 'utf8'), /apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png"/);
});
