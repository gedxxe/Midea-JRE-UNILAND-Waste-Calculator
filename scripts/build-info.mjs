import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RUNTIME_FILES } from './assets.mjs';

export const root = resolve(import.meta.dirname, '..');
function git(...args) {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
export async function buildInfo() {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const commit =
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || git('rev-parse', 'HEAD');
  const status = git('status', '--porcelain', '--untracked-files=normal');
  const hash = createHash('sha256');
  for (const file of [...RUNTIME_FILES].sort()) {
    hash
      .update(file)
      .update('\0')
      .update(await readFile(resolve(root, file)))
      .update('\0');
  }
  return {
    schemaVersion: 1,
    version: pkg.version,
    commit: /^[a-f\d]{40}$/i.test(commit || '') ? commit : null,
    builtAt: new Date().toISOString(),
    sourceHash: hash.digest('hex'),
    dirty: status === null ? null : status.length > 0,
  };
}
