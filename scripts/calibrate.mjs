// Proposes benchmark cutoffs from real play data. Usage:
//   node scripts/calibrate.mjs backup1.json backup2.json ...     (exports from Settings → "Show export")
//   node scripts/calibrate.mjs --dir ./backups
// Prints the sample sizes, the calibrated cutoffs (same math the server uses) and a ready-to-paste patch for
// js/core/benchmarks.js. Games or tiers with too little data keep their placeholders.
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { computeBenchmarks, MIN_RUNS, MIN_DEVICES } from '../server/benchmarks.js';
import { GAME_GRADES, TIERS } from '../js/core/benchmarks.js';
import { migrate } from '../js/core/storage.js';

const args = process.argv.slice(2);
let files = args.filter((a) => !a.startsWith('--'));
const dirAt = args.indexOf('--dir');
if (dirAt >= 0) {
  const dir = resolve(args[dirAt + 1]);
  files = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
}
if (!files.length) {
  console.error('Give at least one exported backup (.json) or --dir <folder>.');
  process.exit(2);
}

const states = [];
for (const f of files) {
  try {
    const data = JSON.parse(readFileSync(f, 'utf8'));
    states.push(migrate(data.state ?? data));
  } catch (err) {
    console.error(`skipping ${f}: ${err.message}`);
  }
}

const result = computeBenchmarks(states);
console.log(`Loaded ${states.length} backup(s). Need ≥ ${MIN_DEVICES} players and ≥ ${MIN_RUNS} free-play runs per game.`);
console.log('Runs per game:', result.sample.runs, '| rated skill entries (≥30 items):', result.sample.ratings);
if (result.source === 'placeholder') {
  console.log('\nNot enough data yet: every cutoff stays a placeholder.');
  process.exit(0);
}
console.log('\nSuggested patch for js/core/benchmarks.js (Solid / Sharp / Elite):');
for (const [id, cuts] of Object.entries(result.games)) console.log(`  ${id}: [${cuts.join(', ')}], // was [${GAME_GRADES[id].join(', ')}] (calibrated, n=${result.sample.runs[id]})`);
if (result.rating) console.log(`  rating tiers: Solid ${result.rating[0]}, Sharp ${result.rating[1]}, Elite ${result.rating[2]} // was ${TIERS.slice(1).map((t) => t.min).join(' / ')}`);
console.log('\nRemove the PLACEHOLDER comment on each line you adopt.');
