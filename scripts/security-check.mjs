import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { securityFindings } from './security-rules.mjs';

const root = resolve(import.meta.dirname, '..');
const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { cwd: root, encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
let count = 0;
for (const file of new Set(files)) {
  let content;
  try {
    content = await readFile(resolve(root, file), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  for (const rule of securityFindings(file, content)) {
    // Never echo matched credentials, lines, or file contents into public CI logs.
    console.error(`${file}: ${rule}`);
    count++;
  }
}
if (count) process.exitCode = 1;
else console.log('Secret guard passed for tracked and non-ignored workspace files.');
