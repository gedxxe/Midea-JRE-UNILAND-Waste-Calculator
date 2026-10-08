import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { securityFindings } from '../scripts/security-rules.mjs';
import { readBody, endpoint } from '../server/http.js';

test('secret guard blocks private files and recognizable credentials without treating local test URLs as production', () => {
  for (const path of [
    '.env.local',
    'nested/.env.production',
    '.admin-setup.local.txt',
    'private.pem',
  ])
    assert.ok(securityFindings(path, '').includes('private-file'));
  for (const content of [
    'npg_' + 'a'.repeat(24),
    'AUTH_SECRET=' + 'c'.repeat(48),
    'ghp_' + 'b'.repeat(36),
    '-----BEGIN ' + 'PRIVATE KEY-----',
    'postgres' + '://user:synthetic@db.invalid/app',
  ])
    assert.ok(securityFindings('source.js', content).length);
  assert.deepEqual(securityFindings('.env.example', 'DATABASE_URL=\nAUTH_SECRET='), []);
  assert.deepEqual(securityFindings('test.js', 'postgres://user:synthetic@127.0.0.1/app'), []);
  assert.deepEqual(securityFindings('doc.md', 'postgres://user:placeholder@db.example/app'), []);
});

test('JSON body boundary rejects oversized streamed/preparsed bodies, arrays, null and malformed input', async () => {
  for (const body of ['{', 'null', '[]', '"text"'])
    await assert.rejects(readBody({ headers: {}, body }), /INVALID_INPUT/);
  for (const body of ['x'.repeat(65537), { value: '中'.repeat(22000) }])
    await assert.rejects(readBody({ headers: {}, body }), /BODY_TOO_LARGE/);
  const stream = Readable.from([Buffer.alloc(40000), Buffer.alloc(40000)]);
  stream.headers = {};
  await assert.rejects(readBody(stream), /BODY_TOO_LARGE/);
  await assert.rejects(readBody({ headers: { 'content-length': '65537' } }), /BODY_TOO_LARGE/);
  assert.deepEqual(await readBody({ headers: {}, body: '{"valid":true}' }), { valid: true });
});

test('unexpected server errors expose only fixed codes and request IDs, never private error details', async (t) => {
  const logs = [];
  t.mock.method(console, 'error', (line) => logs.push(line));
  const headers = {};
  const res = {
    setHeader: (key, value) => {
      headers[key] = value;
    },
    end: (text) => {
      res.body = JSON.parse(text);
    },
  };
  await endpoint(async () => {
    throw new Error('SYNTHETIC_PRIVATE_DATABASE_DETAIL');
  })({}, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'SERVICE_UNAVAILABLE');
  assert.equal(headers['Cache-Control'], 'private, no-store');
  assert.equal(headers['X-Request-Id'], res.body.requestId);
  assert.doesNotMatch(JSON.stringify([res.body, logs]), /SYNTHETIC_PRIVATE_DATABASE_DETAIL/);
});
