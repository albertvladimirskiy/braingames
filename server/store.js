// Tiny JSON-file store (atomic writes). Fine for a hobby deployment; swap for a real database if it grows.
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const empty = () => ({ secret: randomBytes(32).toString('hex'), devices: {}, states: {}, daily: {} });

export function createStore({ file = null } = {}) {
  let data = empty();
  if (file && existsSync(file)) {
    try {
      data = { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) };
    } catch {
      throw new Error(`store file ${file} is not valid JSON; refusing to overwrite it`);
    }
  }
  const persist = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, file);
  };
  persist();
  return { data, persist };
}
