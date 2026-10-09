import { draftsHandler } from '../../server/drafts.js';
import { createDraft } from '../../engine.js';
import { importHistory } from '../../server/history-import.js';
import { graphsHandler } from '../../server/graphs.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { createPool, transaction } from '../../server/db.js';
import { hashPassword } from '../../server/password.js';
import { rateKey } from '../../server/auth.js';
import { authHandler, usersHandler } from '../../server/auth-handlers.js';
import { reportsHandler } from '../../server/reports.js';
import { migrate } from '../../scripts/migrations.mjs';
import { exampleDraft } from '../../examples.js';
import { calculateDraft } from '../../engine.js';

if (!process.env.TEST_DATABASE_URL)
  throw new Error('TEST_DATABASE_URL must point to an isolated test/development database.');
const db = createPool(process.env.TEST_DATABASE_URL);
const runtime = process.env.TEST_RUNTIME_DATABASE_URL
  ? createPool(process.env.TEST_RUNTIME_DATABASE_URL)
  : db;
const env = {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  AUTH_SECRET: randomBytes(32).toString('hex'),
};
const ids = [];
const names = [];
const password = 'Test-only initial passphrase 123';
test('API boundaries reject unauthenticated reads, forged identities, cross-site writes and SQL-shaped input', async () => {
  for (const path of [
    '/api/reports',
    '/api/drafts',
    '/api/graphs?plant=JRE&start=2026-09-01&end=2026-09-30',
    '/api/users',
  ]) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal((await response.json()).error, 'LOGIN_REQUIRED');
  }
  for (const path of ['/api/auth', '/api/reports', '/api/drafts', '/api/users']) {
    const result = await call(path, {
      actor: admin,
      body: { action: 'logout' },
      headers: { Origin: 'https://untrusted.invalid' },
    });
    assert.equal(result.status, 403);
    assert.equal(result.value.error, 'ORIGIN_REJECTED');
  }
  const forged = await fetch(origin + '/api/reports', {
    headers: { Cookie: operator.cookie, 'X-Meter-User': admin.id },
  });
  assert.equal(forged.status, 409);
  assert.equal((await forged.json()).error, 'ACCOUNT_CHANGED');
  const injection = encodeURIComponent("' OR 1=1 --");
  assert.equal((await call('/api/reports?id=' + injection, { actor: operator })).status, 400);
  assert.equal(
    (
      await call('/api/graphs?plant=' + injection + '&start=2026-09-01&end=2026-09-30', {
        actor: operator,
      })
    ).status,
    400,
  );
  const wrongType = await call('/api/reports', {
    actor: operator,
    body: {},
    headers: { 'Content-Type': 'text/plain' },
  });
  assert.equal(wrongType.status, 415);
  assert.equal((await call('/api/auth', { actor: admin })).value.user.id, admin.id);
});

test('injection corpus cannot bypass login, alter SQL queries or promote an operator', async () => {
  const probe = await login(await seed());
  const payloads = [
    "' OR '1'='1",
    "'; SELECT 1; --",
    '\" OR 1=1 --',
    '<svg/onload=window.__probe=1>',
  ];
  for (const payload of payloads) {
    const auth = await call('/api/auth', {
      body: { action: 'login', username: probe.name, password: payload },
    });
    assert.equal(auth.status, 401);
    assert.equal(auth.cookie, undefined);
    const invalidName = await call('/api/auth', {
      body: { action: 'login', username: payload, password },
    });
    assert.equal(invalidName.status, 400);
    const query = encodeURIComponent(payload);
    for (const path of [
      '/api/reports?id=' + query,
      '/api/reports?page=' + query,
      '/api/graphs?plant=JRE&start=' + query + '&end=2026-09-30',
    ])
      assert.equal((await call(path, { actor: probe })).status, 400);
    const draft = exampleDraft('JRE');
    draft.rows[0].end[0] = payload;
    assert.equal(
      (
        await call('/api/reports', {
          actor: probe,
          body: { draft, owner_id: admin.id, role: 'admin' },
        })
      ).status,
      422,
    );
  }
  assert.equal((await call('/api/reports', { actor: probe })).value.reports.length, 0);
  assert.equal(
    (
      await call('/api/users', {
        actor: probe,
        body: { action: 'create', username: 'not-created', role: 'admin' },
      })
    ).status,
    403,
  );
  assert.equal((await call('/api/auth', { actor: probe })).value.user.role, 'operator');
});

test('stored hostile text stays data and prototype/owner fields are discarded through draft and report persistence', async () => {
  const probe = await login(await seed());
  const draft = exampleDraft('JRE');
  const payload = "<img src=xss-probe onerror=window.__probe=1> '); SELECT 1; --";
  draft.utilities[0] = { value: '0', note: payload };
  const workspace = { version: 4, drafts: { JRE: draft, UNILAND: createDraft('UNILAND') } };
  Object.defineProperty(workspace, '__proto__', {
    value: { securityPolluted: true },
    enumerable: true,
  });
  workspace.owner_id = 'forged';
  // An own JSON __proto__ key must also be ignored without merging it into defaults.
  Object.defineProperty(draft, '__proto__', {
    value: { securityPolluted: true },
    enumerable: true,
  });
  assert.equal(
    (
      await call('/api/drafts', {
        actor: probe,
        body: { workspace, baseVersion: 0, owner_id: admin.id },
      })
    ).status,
    200,
  );
  const restored = (await call('/api/drafts', { actor: probe })).value.workspace;
  assert.equal(restored.drafts.JRE.utilities[0].note, payload);
  assert.equal(Object.hasOwn(restored, 'owner_id'), false);
  assert.equal(Object.hasOwn(restored.drafts.JRE, '__proto__'), false);
  assert.equal({}.securityPolluted, undefined);
  const saved = await call('/api/reports', { actor: probe, body: { draft, owner_id: admin.id } });
  assert.equal(saved.status, 201);
  const own = await call('/api/reports?id=' + saved.value.id, { actor: probe });
  assert.equal(own.value.snapshot.draft.utilities[0].note, payload);
  assert.ok(own.value.snapshot.output.reportText.includes(payload));
  assert.equal((await call('/api/reports?id=' + saved.value.id, { actor: admin })).status, 404);
  assert.equal((await call('/api/users', { actor: probe })).status, 403);
});

test('malformed HTTP bodies, duplicate cookies and browser cross-site metadata cannot bypass boundaries', async () => {
  const headers = {
    Origin: origin,
    'Content-Type': 'application/json',
    Cookie: operator.cookie,
    'X-Meter-User': operator.id,
  };
  for (const [body, status] of [
    ['{', 400],
    ['[]', 400],
    ['null', 400],
    [JSON.stringify({ padding: 'x'.repeat(65536) }), 413],
  ]) {
    const r = await fetch(origin + '/api/drafts', { method: 'POST', headers, body });
    assert.equal(r.status, status);
    assert.equal(r.headers.get('cache-control'), 'private, no-store');
  }
  for (const Cookie of [
    operator.cookie + '; ' + operator.cookie,
    'meter_session=' + randomBytes(32).toString('base64url'),
  ]) {
    const r = await fetch(origin + '/api/reports', {
      headers: { Cookie, 'X-Meter-User': operator.id },
    });
    assert.equal(r.status, 401);
  }
  for (const Origin of ['', 'null', 'https://attacker.invalid']) {
    const r = await fetch(origin + '/api/auth', {
      method: 'POST',
      headers: { ...headers, Origin },
      body: JSON.stringify({ action: 'logout' }),
    });
    assert.equal(r.status, 403);
  }
  const r = await fetch(origin + '/api/auth', {
    method: 'POST',
    headers: { ...headers, 'Sec-Fetch-Site': 'cross-site' },
    body: JSON.stringify({ action: 'logout' }),
  });
  assert.equal(r.status, 403);
  assert.equal((await call('/api/auth', { actor: operator })).value.user.id, operator.id);
  for (const path of ['/api/auth', '/api/reports', '/api/drafts', '/api/users', '/api/graphs'])
    assert.equal((await call(path, { actor: operator, method: 'PUT' })).status, 405);
});

test('login throttling persists across handler instances and canonical username variations', async () => {
  const probe = await seed();
  for (let i = 0; i < 11; i++) {
    const result = await call(i % 2 ? '/api/auth-replica' : '/api/auth', {
      body: {
        action: 'login',
        username: i % 2 ? ' ' + probe.name.toUpperCase() + ' ' : probe.name,
        password: 'wrong synthetic password',
      },
      headers: { 'X-Forwarded-For': '203.0.113.' + (i + 1) },
    });
    assert.equal(result.status, i < 10 ? 401 : 429);
    assert.equal(result.cookie, undefined);
  }
});

test('working drafts replace partial entries without report revisions and reject stale or foreign writes', async () => {
  const workspace = {
    version: 4,
    drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') },
  };
  workspace.drafts.JRE.rows[0].start[0] = '123.';
  workspace.drafts.JRE.water = { start: '100,25', end: '' };
  workspace.drafts.JRE.additionalReadings = [
    { start: '100,25', end: '' },
    { start: '', end: '' },
    { start: '', end: '' },
    { start: '', end: '' },
  ];
  const initial = await call('/api/drafts', { actor: operator });
  assert.equal(initial.status, 200);
  assert.equal(initial.value.version, 0);
  assert.equal((await call('/api/drafts')).status, 401);
  assert.equal(
    (
      await call('/api/drafts', {
        actor: operator,
        body: { workspace, baseVersion: 0 },
        headers: { Origin: 'https://other.invalid' },
      })
    ).status,
    403,
  );
  const saved = await call('/api/drafts', {
    actor: operator,
    body: { workspace, baseVersion: 0, owner_id: admin.id },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.value.version, 1);
  assert.equal((await call('/api/drafts', { actor: admin })).value.workspace, null);
  const repeat = await call('/api/drafts', {
    actor: operator,
    body: { workspace, baseVersion: 0 },
  });
  assert.equal(repeat.value.version, 1);
  assert.equal(repeat.value.unchanged, true);
  assert.equal((await call('/api/reports', { actor: operator })).value.reports.length, 0);
  const replacements = ['124', '125'].map((value) => {
    const copy = structuredClone(workspace);
    copy.drafts.JRE.rows[0].start[0] = value;
    return call('/api/drafts', { actor: operator, body: { workspace: copy, baseVersion: 1 } });
  });
  const results = await Promise.all(replacements);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(results.find((r) => r.status === 409).value.error, 'DRAFT_CONFLICT');
  const latest = await call('/api/drafts', { actor: operator });
  assert.equal(latest.value.version, 2);
  assert.equal(latest.value.workspace.drafts.JRE.rows[0].end[0], '');
  assert.deepEqual(latest.value.workspace.drafts.JRE.water, workspace.drafts.JRE.water);
  assert.deepEqual(
    latest.value.workspace.drafts.JRE.additionalReadings,
    workspace.drafts.JRE.additionalReadings,
  );
  assert.equal(
    (await call('/api/drafts', { actor: operator, body: { workspace: {}, baseVersion: 2 } }))
      .status,
    400,
  );
  assert.equal(
    (await call('/api/drafts', { actor: operator, body: { workspace: null, baseVersion: 2 } }))
      .status,
    200,
  );
  assert.equal(
    (await call('/api/drafts', { actor: operator, body: { workspace, baseVersion: 0 } })).status,
    409,
  );
  assert.equal((await call('/api/drafts', { actor: operator })).value.workspace, null);
});
let server, origin, admin, operator, other, reportId;
const routes = {
  '/api/auth': authHandler(() => runtime, env),
  '/api/auth-replica': authHandler(() => runtime, env),
  '/api/users': usersHandler(() => runtime, env),
  '/api/drafts': draftsHandler(() => runtime, env),
  '/api/graphs': graphsHandler(() => runtime, env),
  '/api/reports': reportsHandler(() => runtime, env),
};
async function call(path, { body, actor, headers = {}, method } = {}) {
  const h = { ...headers };
  if (actor) {
    h.Cookie = actor.cookie;
    h['X-Meter-User'] = actor.id;
  }
  if (body) {
    h.Origin ??= origin;
    h['Content-Type'] ??= 'application/json';
  }
  const response = await fetch(origin + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    value: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}
async function seed(role = 'operator', temporary = false) {
  const id = randomUUID();
  const name = 'test-' + id.slice(0, 12);
  ids.push(id);
  names.push(name);
  await db.query(
    'INSERT INTO meter_app.users(id,username,password_hash,role,must_change_password) VALUES ($1,$2,$3,$4,$5)',
    [id, name, await hashPassword(password), role, temporary],
  );
  return { id, name };
}
async function login(user, pwd = password) {
  const result = await call('/api/auth', {
    body: { action: 'login', username: user.name, password: pwd },
  });
  assert.equal(result.status, 200);
  return { ...user, cookie: result.cookie };
}
before(async () => {
  await migrate(db);
  assert.deepEqual(await migrate(db), []);
  server = createServer((req, res) => {
    const handler = routes[new URL(req.url, 'http://localhost').pathname];
    if (handler) void handler(req, res);
    else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  env.APP_ORIGIN = origin;
  admin = await login(await seed('admin'));
  operator = await login(await seed());
  other = await login(await seed('operator', true));
});
after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  try {
    await transaction(db, async (client) => {
      await client.query(
        'DELETE FROM meter_app.consumption_history WHERE owner_id=ANY($1::uuid[])',
        [ids],
      );
      await client.query(
        'DELETE FROM meter_app.consumption_imports WHERE owner_id=ANY($1::uuid[])',
        [ids],
      );
      await client.query('DELETE FROM meter_app.report_revisions WHERE actor_id=ANY($1::uuid[])', [
        ids,
      ]);
      await client.query('DELETE FROM meter_app.reports WHERE owner_id=ANY($1::uuid[])', [ids]);
      await client.query(
        'DELETE FROM meter_app.audit_events WHERE actor_id=ANY($1::uuid[]) OR target_id=ANY($1::uuid[])',
        [ids],
      );
      await client.query('DELETE FROM meter_app.users WHERE id=ANY($1::uuid[])', [ids]);
      const keys = [
        'auth:ip:127.0.0.1',
        ...names.map((n) => 'login:user:' + n),
        ...ids.flatMap((id) => ['password:' + id, 'reports:' + id, 'admin:' + id, 'drafts:' + id]),
      ].map((k) => rateKey(k, env));
      await client.query('DELETE FROM meter_app.rate_limits WHERE key_hash=ANY($1::text[])', [
        keys,
      ]);
    });
  } finally {
    if (runtime !== db) await runtime.end();
    await db.end();
  }
});
test('requests need a session, exact origin, JSON and the matching active account', async () => {
  assert.equal((await call('/api/reports')).status, 401);
  assert.equal(
    (
      await call('/api/auth', {
        body: { action: 'login', username: operator.name, password },
        headers: { Origin: 'https://evil.example' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call('/api/auth', {
        body: { action: 'login', username: operator.name, password },
        headers: { 'Content-Type': 'text/plain' },
      })
    ).status,
    415,
  );
  assert.equal(
    (await call('/api/reports', { headers: { Cookie: operator.cookie, 'X-Meter-User': admin.id } }))
      .value.error,
    'ACCOUNT_CHANGED',
  );
  assert.equal(
    (
      await call('/api/auth', {
        body: { action: 'login', username: operator.name, password: 'incorrect' },
      })
    ).value.error,
    'INVALID_CREDENTIALS',
  );
});
test('temporary accounts must change their password; the old session is revoked', async () => {
  assert.equal(
    (await call('/api/reports', { actor: other })).value.error,
    'PASSWORD_CHANGE_REQUIRED',
  );
  const old = { ...other };
  const changed = await call('/api/auth', {
    actor: other,
    body: {
      action: 'changePassword',
      currentPassword: password,
      password: 'New test-only passphrase 456',
    },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.value.user.mustChangePassword, false);
  other.cookie = changed.cookie;
  assert.equal((await call('/api/reports', { actor: old })).status, 401);
  assert.equal((await call('/api/reports', { actor: other })).status, 200);
});
test('UNILAND tank gas persists incomplete drafts, recalculates on the server and separates kg graph history', async () => {
  const actor = await login(await seed());
  const draft = exampleDraft('UNILAND');
  const point = (reading) => ({ reading, temperature: '' });
  draft.utilities[0] = { value: '12.5', note: 'synthetic manual value' };
  const legacy = await call('/api/reports', { actor, body: { draft } });
  assert.equal(legacy.status, 201);
  draft.gas.entries[0] = {
    enabled: true,
    start: point('60'),
    end: point(''),
    refills: [{ before: point('50'), after: point('80') }],
  };
  const workspace = { version: 4, drafts: { JRE: createDraft('JRE'), UNILAND: draft } };
  assert.equal(
    (await call('/api/drafts', { actor, body: { workspace, baseVersion: 0 } })).status,
    200,
  );
  const restored = (await call('/api/drafts', { actor })).value.workspace;
  assert.deepEqual(restored.drafts.UNILAND.gas, draft.gas);
  assert.equal(
    (await call('/api/reports', { actor, body: { id: legacy.value.id, baseRevision: 1, draft } }))
      .status,
    422,
  );
  draft.gas.entries[0].end.reading = '40';
  draft.gas.entries[0].kg = 999999;
  const saved = await call('/api/reports', {
    actor,
    body: { id: legacy.value.id, baseRevision: 1, draft, output: { gas: [{ kg: 999999 }] } },
  });
  assert.equal(saved.status, 200);
  const own = (await call('/api/reports?id=' + saved.value.id, { actor })).value.snapshot;
  assert.equal(own.draft.gas.version, 'uniland-2026-10-v1');
  assert.equal(own.draft.gas.entries[0].kg, undefined);
  assert.equal(own.draft.utilities[0].value, '12.5');
  assert.match(own.output.reportText, /LPG: 4735.29 Kg/);
  assert.ok(Math.abs(own.output.gas[0].kg - 4735.29) < 1e-7);
  const original = await call('/api/reports?id=' + saved.value.id + '&revision=1', { actor });
  assert.equal(original.value.snapshot.output.reportText, legacy.value.snapshot.output.reportText);
  assert.match(original.value.snapshot.output.reportText, /LPG: 12.5 Nm3/);
  const graphs = await call('/api/graphs?plant=UNILAND&start=2026-09-01&end=2026-09-30', { actor });
  assert.equal(graphs.status, 200);
  assert.equal(graphs.value.records[0].values.kg0, 4735.29);
  assert.equal(graphs.value.records[0].values.u0, null);
  assert.equal((await call('/api/reports?id=' + saved.value.id, { actor: other })).status, 404);
  draft.gas.version = createDraft('JRE').gas.version;
  assert.equal(
    (await call('/api/reports', { actor, body: { id: saved.value.id, baseRevision: 2, draft } }))
      .status,
    400,
  );
  assert.equal(
    (await call('/api/drafts', { actor, body: { workspace, baseVersion: 1 } })).status,
    400,
  );
});

test('report ownership comes from the session; server output and raw readings are retained', async () => {
  const draft = exampleDraft('JRE');
  draft.water = { start: '100,25', end: '125.75' };
  draft.additionalReadings = [
    { start: '10.25', end: '14.5' },
    ...Array.from({ length: 3 }, () => ({ start: '', end: '' })),
  ];
  draft.gas.entries[3] = {
    enabled: true,
    start: { reading: '587', temperature: '33.5' },
    end: { reading: '550', temperature: '33.5' },
    refills: [],
  };
  const saved = await call('/api/reports', {
    actor: operator,
    body: { draft, owner_id: other.id, output: { reportText: 'forged' } },
  });
  assert.equal(saved.status, 201);
  reportId = saved.value.id;
  assert.equal(saved.value.snapshot.output.reportText, calculateDraft(draft).reportSectionText);
  const own = await call('/api/reports?id=' + reportId, { actor: operator });
  assert.equal(own.value.snapshot.draft.rows[0].start[0], draft.rows[0].start[0]);
  assert.deepEqual(own.value.snapshot.draft.gas, draft.gas);
  assert.deepEqual(own.value.snapshot.draft.water, draft.water);
  assert.equal(own.value.snapshot.output.water.value, '25.5');
  assert.deepEqual(own.value.snapshot.draft.additionalReadings, draft.additionalReadings);
  assert.match(own.value.snapshot.output.reportText, /T1 consumption: 4.25 kWh/);
  assert.equal(own.value.snapshot.output.gas[0].calibration, draft.gas.version);
  assert.ok(Math.abs(own.value.snapshot.output.gas[0].kg - 154.2086) < 1e-7);
  assert.equal((await call('/api/reports?id=' + reportId, { actor: other })).status, 404);
  assert.equal((await call('/api/reports?id=' + reportId, { actor: admin })).status, 404);
  assert.equal(
    (await call('/api/reports', { actor: other, body: { id: reportId, baseRevision: 1, draft } }))
      .status,
    404,
  );
  assert.equal((await call('/api/reports', { actor: operator, body: { draft } })).status, 409);
  assert.equal((await call('/api/reports', { actor: other, body: { draft } })).status, 201);
  assert.equal((await call('/api/reports', { actor: operator })).value.reports.length, 1);
});
test('concurrent edits keep one winner and preserve the old revision', async () => {
  const draft = exampleDraft('JRE');
  draft.rows[0].end[0] = '99999';
  const results = await Promise.all(
    [1, 2].map(() =>
      call('/api/reports', { actor: operator, body: { id: reportId, baseRevision: 1, draft } }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const original = await call('/api/reports?id=' + reportId + '&revision=1', { actor: operator });
  assert.equal(original.value.latestRevision, 2);
  assert.equal(original.value.snapshot.draft.rows[0].end[0], exampleDraft('JRE').rows[0].end[0]);
  const incomplete = structuredClone(draft);
  incomplete.rows[0].end[0] = '';
  assert.equal(
    (
      await call('/api/reports', {
        actor: operator,
        body: { id: reportId, baseRevision: 2, draft: incomplete },
      })
    ).status,
    422,
  );
  assert.equal(
    (await call('/api/reports?id=' + reportId, { actor: operator })).value.latestRevision,
    2,
  );
});
test('graphs use only the current owner latest revisions and validate the date range', async () => {
  const path = '/api/graphs?plant=JRE&start=2026-09-01&end=2026-09-30';
  assert.equal((await call(path)).status, 401);
  const own = await call(path, { actor: operator });
  assert.equal(own.status, 200);
  assert.equal(own.value.records.length, 1);
  assert.equal(own.value.records[0].id, reportId);
  assert.equal(own.value.records[0].revision, 2);
  const foreign = await call(path, { actor: other });
  assert.equal(foreign.value.records.length, 1);
  assert.notEqual(foreign.value.records[0].id, reportId);
  assert.deepEqual((await call(path, { actor: admin })).value.records, []);
  assert.equal(
    (await call(path + '&owner_id=' + other.id, { actor: operator })).value.records[0].id,
    reportId,
  );
  assert.equal(
    (await call('/api/graphs?plant=JRE&start=2026-02-31&end=2026-09-30', { actor: operator }))
      .status,
    400,
  );
  assert.equal(
    (await call('/api/graphs?plant=JRE&start=2025-01-01&end=2026-09-30', { actor: operator }))
      .status,
    400,
  );
  assert.equal(
    (await call('/api/graphs?plant=JRE&start=2026-10-01&end=2026-10-30', { actor: operator })).value
      .records.length,
    0,
  );
  const latest = await call('/api/reports?id=' + reportId, { actor: operator });
  assert.match(latest.value.snapshot.output.reportText, /^1\. Total: -$/m);
  assert.equal(
    own.value.records[0].values.r0,
    null,
    'latest unavailable result must not reuse an older total',
  );
});
test('historical imports are atomic, idempotent, owner-scoped and preserve existing reports', async () => {
  const input = {
    version: 1,
    sourceName: 'synthetic.xlsx',
    sourceSha256: 'b'.repeat(64),
    records: [
      {
        plant: 'JRE',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        values: { w0: 12, w1: 0 },
        sheet: 'JRE',
        row: 4,
        range: 'C4:T4',
      },
      {
        plant: 'JRE',
        startDate: exampleDraft('JRE').startDate,
        endDate: exampleDraft('JRE').endDate,
        values: { w0: 99 },
        sheet: 'JRE',
        row: 5,
        range: 'C5:T5',
      },
    ],
  };
  const plan = await importHistory(db, { username: operator.name, input });
  assert.equal(plan.toImport, 1);
  assert.equal(plan.skipped, 1);
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM meter_app.consumption_history WHERE owner_id=$1',
        [operator.id],
      )
    ).rows[0].n,
    0,
  );
  await assert.rejects(
    () => importHistory(db, { username: operator.name, input, apply: true, expectedPlan: 'stale' }),
    /IMPORT_PLAN_CHANGED/,
  );
  const applied = await importHistory(db, {
    username: operator.name,
    input,
    apply: true,
    expectedPlan: plan.planHash,
  });
  assert.equal(applied.imported, 1);
  assert.equal(
    (
      await importHistory(db, {
        username: operator.name,
        input,
        apply: true,
        expectedPlan: plan.planHash,
      })
    ).alreadyImported,
    true,
  );
  const path = '/api/graphs?plant=JRE&start=2026-09-01&end=2026-09-30';
  const own = await call(path, { actor: operator });
  const imported = own.value.records.find((r) => r.source === 'excel');
  assert.equal(imported.values.w0, 12);
  assert.equal(imported.values.w1, 0);
  assert.equal(imported.values.r0, null);
  assert.equal(imported.days, 2);
  assert.equal(imported.revision, null);
  assert.equal(
    (await call(path, { actor: other })).value.records.some((r) => r.source === 'excel'),
    false,
  );
  assert.equal((await call('/api/reports', { actor: operator })).value.reports.length, 1);
  const conflicting = structuredClone(input);
  conflicting.sourceSha256 = 'c'.repeat(64);
  conflicting.records[0].values.w0 = 13;
  await assert.rejects(
    () => importHistory(db, { username: operator.name, input: conflicting }),
    /IMPORT_CONFLICT/,
  );
  const permission = (
    await runtime.query(
      "SELECT has_table_privilege(current_user,'meter_app.consumption_history','SELECT') AS can_read,has_table_privilege(current_user,'meter_app.consumption_history','INSERT') AS can_write",
    )
  ).rows[0];
  assert.equal(permission.can_read, true);
  if (runtime !== db) assert.equal(permission.can_write, false);
});

test('admin account management does not grant access to private reports; reset and disable revoke sessions', async () => {
  assert.equal((await call('/api/users', { actor: operator })).status, 403);
  const name = 'test-' + randomUUID().slice(0, 12);
  names.push(name);
  const created = await call('/api/users', {
    actor: admin,
    body: { action: 'create', username: name, role: 'admin' },
  });
  assert.equal(created.status, 200);
  ids.push(created.value.id);
  const createdLogin = await login({ id: created.value.id, name }, created.value.temporaryPassword);
  assert.equal((await call('/api/auth', { actor: createdLogin })).value.user.role, 'operator');
  assert.equal(
    (
      await call('/api/users', {
        actor: admin,
        body: { action: 'setActive', id: admin.id, active: false },
      })
    ).status,
    400,
  );
  const reset = await call('/api/users', {
    actor: admin,
    body: { action: 'resetPassword', id: operator.id },
  });
  assert.equal(reset.status, 200);
  assert.equal((await call('/api/reports', { actor: operator })).status, 401);
  const newSession = await login(operator, reset.value.temporaryPassword);
  assert.equal(
    (
      await call('/api/users', {
        actor: admin,
        body: { action: 'setActive', id: operator.id, active: false },
      })
    ).status,
    200,
  );
  assert.equal((await call('/api/auth', { actor: newSession })).value.user, null);
});
test('expired sessions and logout cannot read reports; repeated wrong passwords are rate limited', async () => {
  const badName = 'test-' + randomUUID().slice(0, 12);
  names.push(badName);
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await call('/api/auth', {
          body: { action: 'login', username: badName, password: 'incorrect' },
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await call('/api/auth', {
        body: { action: 'login', username: badName, password: 'incorrect' },
      })
    ).status,
    429,
  );
  await db.query(
    "UPDATE meter_app.sessions SET expires_at=now()-interval '1 minute' WHERE user_id=$1",
    [other.id],
  );
  assert.equal((await call('/api/reports', { actor: other })).status, 401);
  assert.equal((await call('/api/auth', { actor: admin, body: { action: 'logout' } })).status, 200);
  assert.equal((await call('/api/reports', { actor: admin })).status, 401);
});
