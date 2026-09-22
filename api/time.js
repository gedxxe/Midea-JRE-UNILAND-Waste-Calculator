import { createTimeService } from '../server/ntp.js';
const getTime = createTimeService();
export default async function time(request, response) {
  response.setHeader('Cache-Control','no-store, max-age=0');
  response.setHeader('CDN-Cache-Control','no-store');
  response.setHeader('Vercel-CDN-Cache-Control','no-store');
  response.setHeader('Content-Type','application/json; charset=utf-8');
  if (request.method !== 'GET') {
    response.setHeader('Allow','GET');
    response.statusCode = 405;
    response.end(JSON.stringify({error:'Method not allowed.'}));
    return;
  }
  try { response.end(JSON.stringify(await getTime())); }
  catch {
    response.statusCode = 503;
    response.end(JSON.stringify({error:'Sinkronisasi NTP belum tersedia. Coba lagi.'}));
  }
}
