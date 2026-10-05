// Lists exports under js/ and data/ that no other file references (dead-code audit helper).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const skip = new Set(['node_modules', '.git', '.claude']);
function* walk(dir) {
  for (const n of readdirSync(dir)) {
    if (skip.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.m?js$/.test(p)) yield p;
  }
}
const files = [...walk(root)].map((p) => relative(root, p).split('\\').join('/'));
const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(root, f), 'utf8')]));
const re = /export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z0-9_]+)/g;
let count = 0;
for (const f of files.filter((f) => f.startsWith('js/') || f.startsWith('data/'))) {
  for (const [, name] of src[f].matchAll(re)) {
    const word = new RegExp(`\\b${name}\\b`);
    if (!files.some((g) => g !== f && word.test(src[g]))) {
      count++;
      console.log(`${f}: ${name}`);
    }
  }
}
console.log(`${count} export(s) with no outside reference`);
