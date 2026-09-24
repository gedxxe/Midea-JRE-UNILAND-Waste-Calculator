import { randomUUID } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
export function fail(status, code) {
  throw new HttpError(status, code);
}
export function appOrigin(env = process.env) {
  const value = env.APP_ORIGIN || (env.VERCEL_ENV === 'preview' && `https://${env.VERCEL_URL}`);
  if (!value) fail(503, 'NOT_CONFIGURED');
  const url = new URL(value);
  if (
    url.origin !== value ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  )
    fail(503, 'NOT_CONFIGURED');
  return url.origin;
}
export function checkOrigin(req, origin) {
  if (req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site')
    fail(403, 'ORIGIN_REJECTED');
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || ''))
    fail(415, 'JSON_REQUIRED');
}
export async function readBody(req) {
  const max = 65536;
  if (Number(req.headers['content-length']) > max) fail(413, 'BODY_TOO_LARGE');
  let raw;
  if (req.body !== undefined) {
    raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  } else {
    const parts = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > max) fail(413, 'BODY_TOO_LARGE');
      parts.push(Buffer.from(chunk));
    }
    raw = Buffer.concat(parts).toString('utf8');
  }
  if (Buffer.byteLength(raw) > max) fail(413, 'BODY_TOO_LARGE');
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'INVALID_INPUT');
    return body;
  } catch {
    fail(400, 'INVALID_INPUT');
  }
}
export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}
export function endpoint(handler) {
  return async (req, res) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    try {
      await handler(req, res);
    } catch (error) {
      const known = error instanceof HttpError;
      const status = known ? error.status : error?.code === '23505' ? 409 : 503;
      const code = known ? error.code : status === 409 ? 'ALREADY_EXISTS' : 'SERVICE_UNAVAILABLE';
      if (status >= 500)
        console.error(JSON.stringify({ event: 'api.error', requestId, status, code }));
      if (status === 429) res.setHeader('Retry-After', '900');
      send(res, status, { error: code, requestId });
    }
  };
}
export function uuid(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    fail(400, 'INVALID_INPUT');
  return value;
}
