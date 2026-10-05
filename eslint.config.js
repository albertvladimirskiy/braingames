import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', '.claude/**', 'sw.js'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js', 'data/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
    rules: { 'no-unused-vars': ['warn', { args: 'after-used', argsIgnorePattern: '^_', ignoreRestSiblings: true }], 'no-console': 'warn', eqeqeq: ['warn', 'smart'], 'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded rng (core/prng.js).' }] },
  },
  {
    files: ['sw.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.serviceworker } },
  },
  {
    // e2e files contain functions that run inside the page, so they also see browser globals
    files: ['e2e/**/*.js', 'scripts/perf-audit.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }] },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.js', 'eslint.config.js', 'server/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }] },
  },
];
