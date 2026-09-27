import { mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { PUBLIC_FILES } from './assets.mjs';
import { buildInfo, root } from './build-info.mjs';

const output = resolve(root, 'dist');
// Delete only this repository's generated output, never an arbitrary path.
if (relative(root, output) !== 'dist') throw new Error('Unsafe build output path.');
await rm(output, { recursive: true, force: true });
for (const file of PUBLIC_FILES) {
  const target = resolve(output, file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(root, file), target);
}
const metadata = await buildInfo();
const html = await readFile(resolve(output, 'index.html'), 'utf8');
const packed = JSON.stringify(metadata)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;');
await writeFile(
  resolve(output, 'index.html'),
  html.replace('</head>', '<meta name="app-build" content="' + packed + '" />\n</head>'),
);
await writeFile(resolve(output, 'build-info.json'), JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ event: 'build.complete', ...metadata }));
