// Syntax-checks every .js/.mjs file in the repo with `node --check`.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const skip = new Set(['node_modules', '.git', '.claude']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (['.js', '.mjs'].includes(extname(p))) yield p;
  }
}

let failed = 0;
let count = 0;
for (const file of walk(root)) {
  count++;
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    console.error(`SYNTAX ERROR in ${file}\n${r.stderr}`);
  }
}
console.log(`checked ${count} files, ${failed} failed`);
process.exit(failed ? 1 : 0);
