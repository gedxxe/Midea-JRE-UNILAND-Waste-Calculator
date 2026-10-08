import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { securityFindings } from './security-rules.mjs';
import { RUNTIME_FILES } from './assets.mjs';

const root = resolve(import.meta.dirname, '..');
const build = process.argv.includes('--build');
// Deployment checkouts intentionally omit .git. Keep this mode explicit, not a
// silent fallback that could hide a failed repository scan in CI.
const files = build
  ? RUNTIME_FILES
  : execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
let count = 0;
for (const file of new Set(files)) {
  let content;
  try {
    content = await readFile(resolve(root, file), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' && !build) continue;
    throw error;
  }
  for (const rule of securityFindings(file, content)) {
    // Never echo matched credentials, lines, or file contents into public CI logs.
    console.error(`${file}: ${rule}`);
    count++;
  }
}
if (count) process.exitCode = 1;
else
  console.log(
    `Secret guard passed for ${build ? 'deployment runtime files' : 'tracked and non-ignored workspace files'}.`,
  );
