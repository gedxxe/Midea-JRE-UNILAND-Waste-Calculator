import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import time from '../api/time.js';
const root=resolve(import.meta.dirname,'..');
const built=process.argv.includes('--built');
const staticRoot=built ? resolve(root,'dist') : root;
const files = new Set(['index.html','style.css','app.js','schema.js','engine.js','numbers.js','worksheet.js','importer.js','storage.js','examples.js','clock.js','asset/Midea.webp']);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webp':'image/webp'};
const config=JSON.parse(await readFile(resolve(root,'vercel.json'),'utf8'));
const server=createServer(async(req,res)=>{
  for (const {key,value} of config.headers[0].headers) res.setHeader(key,value);
  const pathname=new URL(req.url,'http://localhost').pathname;
  if (pathname==='/api/time') { await time(req,res); return; }
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{Allow:'GET, HEAD'}); res.end(); return; }
  const file=pathname==='/' ? 'index.html' : pathname.slice(1);
  if (!files.has(file)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const content=await readFile(resolve(staticRoot,file));
    res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':'no-store'});
    res.end(req.method==='HEAD' ? undefined : content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
const port=Number(process.env.PORT || 3000);
server.listen(port,'127.0.0.1',()=>console.log(`Daily Energy Report: http://127.0.0.1:${port}${built ? ' (built files)' : ''}`));
