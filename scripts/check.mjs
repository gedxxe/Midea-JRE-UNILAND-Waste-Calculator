import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PUBLIC_FILES, RUNTIME_FILES } from './assets.mjs';
import { catalog } from '../i18n/catalog.js';

const root = resolve(import.meta.dirname, '..');
const skip = new Set([
  '.git',
  'node_modules',
  'dist',
  '.vercel',
  'playwright-report',
  'test-results',
]);
async function sources(path = root) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const file = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...(await sources(file)));
    else if (/\.(?:m?js)$/.test(file)) files.push(file);
  }
  return files;
}
for (const file of await sources()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file}\n${result.stderr}`);
}
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
assert.match(pkg.version, /^0\.\d+\.\d+-alpha$/);
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[''].version, pkg.version);
assert.deepEqual(
  Object.keys(pkg.dependencies || {}).sort(),
  ['@node-rs/argon2', 'pg'],
  'Review every server dependency. Browser modules must stay dependency-free.',
);
for (const version of Object.values(pkg.dependencies)) assert.match(version, /^\d+\.\d+\.\d+$/);
const changelog = await readFile(resolve(root, 'CHANGELOG.md'), 'utf8');
assert.ok(changelog.includes(`## v${pkg.version}`), 'Add release notes when bumping the version.');
for (const [key, messages] of Object.entries(catalog)) {
  assert.equal(messages.length, 3, key);
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const text of messages) {
    assert.ok(text.trim(), key);
    assert.deepEqual(placeholders(text), placeholders(messages[0]), key);
    assert.ok(!text.includes('\u2014'), `Avoid em dashes: ${key}`);
  }
}
let size = 0;
for (const file of PUBLIC_FILES) {
  const content = await readFile(resolve(root, file));
  size += content.length;
  if (file.endsWith('.js')) {
    for (const match of content.toString().matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const imported = resolve(root, file, '..', match[1]);
      assert.ok(
        PUBLIC_FILES.some((item) => resolve(root, item) === imported),
        `Missing public module ${match[1]} in ${file}`,
      );
    }
  }
}
// Includes the four bundled tank calibration tables; no browser dependencies added.
assert.ok(size < 250000, `Static assets grew to ${size} bytes; review the footprint.`);
for (const file of RUNTIME_FILES) await readFile(resolve(root, file));
console.log(`Source checks passed. Public assets: ${size} bytes; version ${pkg.version}.`);
