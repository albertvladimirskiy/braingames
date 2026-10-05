// Rewrites the GENERATED block in sw.js: precache list + content hash (cache name changes on any edit).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const DIRS = ['css', 'js', 'data', 'icons'];
const ROOT_FILES = ['index.html', 'manifest.webmanifest'];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

export function computePrecache() {
  const files = [...ROOT_FILES];
  for (const d of DIRS) for (const p of walk(join(root, d))) files.push(relative(root, p).split('\\').join('/'));
  files.sort();
  const hash = createHash('sha1');
  for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
  return { files: ['./', ...files], build: hash.digest('hex').slice(0, 10) };
}

export function renderBlock({ files, build }) {
  return `/* GENERATED:START */\nconst BUILD = '${build}';\nconst PRECACHE = ${JSON.stringify(files, null, 2)};\n/* GENERATED:END */`;
}

/** The product name lives in js/config.js; mirror it into the static files that cannot import it. */
export function syncName() {
  const name = readFileSync(join(root, 'js/config.js'), 'utf8').match(/APP_NAME = '([^']+)'/)[1];
  const manPath = join(root, 'manifest.webmanifest');
  const man = JSON.parse(readFileSync(manPath, 'utf8'));
  man.name = name;
  man.short_name = name;
  writeFileSync(manPath, `${JSON.stringify(man, null, 2)}
`);
  const htmlPath = join(root, 'index.html');
  writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace(/<title>[^<]*<\/title>/, `<title>${name}</title>`));
  return name;
}

if (process.argv[1]?.endsWith('gen-sw.mjs')) {
  syncName();
  const swPath = join(root, 'sw.js');
  const src = readFileSync(swPath, 'utf8');
  const next = src.replace(/\/\* GENERATED:START \*\/[\s\S]*?\/\* GENERATED:END \*\//, renderBlock(computePrecache()));
  writeFileSync(swPath, next);
  console.log('sw.js precache regenerated');
}
