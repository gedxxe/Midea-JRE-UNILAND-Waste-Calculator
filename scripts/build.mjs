import { mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname,'..');
const output = resolve(root,'dist');
await mkdir(resolve(output,'asset'),{recursive:true});
for (const file of ['index.html','style.css','app.js','schema.js','engine.js','numbers.js','worksheet.js','importer.js','storage.js','examples.js','clock.js','asset/Midea.webp']) {
  await copyFile(resolve(root,file),resolve(output,file));
}
console.log('Static site built in dist/. The NTP endpoint is api/time.js.');
