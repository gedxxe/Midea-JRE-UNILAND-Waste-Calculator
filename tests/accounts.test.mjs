import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  username,
  tokenHash,
  secretToken,
} from '../server/password.js';
import { sessionCookie, readToken, clientAddress } from '../server/auth.js';
import { appOrigin, checkOrigin } from '../server/http.js';
import { reportSnapshot } from '../server/report-data.js';
import { exampleDraft } from '../examples.js';

test('password hashing uses salted Argon2id and accepts long passphrases without trimming', async () => {
  const password = '  fifteen character passphrase 中文  ';
  const a = await hashPassword(password);
  const b = await hashPassword(password);
  assert.match(a, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(a, password), true);
  assert.equal(await verifyPassword(a, password.trim()), false);
  assert.throws(() => hashPassword('short'), /INVALID_PASSWORD/);
  assert.equal(username(' POWER-ENGINEER '), 'power-engineer');
  assert.throws(() => username('../admin'), /INVALID_USERNAME/);
});
test('production sessions are secure host-only cookies and duplicate or malformed cookies are rejected', () => {
  const token = secretToken();
  const cookie = sessionCookie('https://meter.example', token);
  assert.match(cookie, /^__Host-meter_session=/);
  assert.match(cookie, /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
  assert.doesNotMatch(cookie, /Domain=/);
  assert.notEqual(tokenHash(token), token);
  assert.equal(readToken({ headers: { cookie } }, 'https://meter.example'), token);
  assert.equal(
    readToken(
      { headers: { cookie: cookie + '; __Host-meter_session=' + token } },
      'https://meter.example',
    ),
    null,
  );
  assert.equal(
    readToken({ headers: { cookie: '__Host-meter_session=bad' } }, 'https://meter.example'),
    null,
  );
});
test('origin and proxy handling cannot be overridden by request Host or X-Forwarded-For', () => {
  assert.equal(appOrigin({ APP_ORIGIN: 'https://meter.example' }), 'https://meter.example');
  assert.throws(() => appOrigin({ APP_ORIGIN: 'http://public.example' }), /NOT_CONFIGURED/);
  assert.throws(
    () =>
      checkOrigin(
        { headers: { origin: 'https://evil.example', 'content-type': 'application/json' } },
        'https://meter.example',
      ),
    /ORIGIN_REJECTED/,
  );
  assert.throws(
    () =>
      checkOrigin(
        { headers: { origin: 'https://meter.example', 'content-type': 'text/plain' } },
        'https://meter.example',
      ),
    /JSON_REQUIRED/,
  );
  assert.equal(
    clientAddress(
      { headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '127.0.0.1' } },
      {},
    ),
    '127.0.0.1',
  );
  assert.equal(
    clientAddress(
      { headers: { 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '203.0.113.1' } },
      { VERCEL: '1' },
    ),
    '203.0.113.1',
  );
});
test('server snapshots recalculate official factors, preserve exact raw readings, and reject malformed reports', () => {
  const draft = exampleDraft('UNILAND');
  draft.rows[0].factor = 999999;
  draft.reportText = 'FORGED';
  const snapshot = reportSnapshot(draft);
  assert.doesNotMatch(snapshot.output.reportText, /FORGED/);
  assert.equal(snapshot.draft.rows[1].start[0], draft.rows[1].start[0]);
  assert.equal(snapshot.draft.rows[0].factor, undefined);
  draft.rows[0].end[0] = '';
  assert.throws(() => reportSnapshot(draft), /INCOMPLETE_REPORT/);
  draft.rows = [];
  assert.throws(() => reportSnapshot(draft), /INVALID_REPORT/);
});
