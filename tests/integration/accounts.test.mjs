import { utilityPeriods } from '../fixtures/shift-utilities.mjs';
import {
  iotIngestHandler,
  iotReadingsHandler,
  iotDevicesHandler,
  iotRefreshHandler,
} from '../../server/iot.js';
import { tokenHash } from '../../server/password.js';
import { gasCalibration, GAS_TABLE_VERSION, JRE_GAS_INPUT_VERSION } from '../../gas.js';
import {
  layout2Draft,
  layout3JreDraft,
  layout4JreDraft,
  layout5JreDraft,
} from '../fixtures/legacy-layout.mjs';
import { reportPeriods } from '../fixtures/report-periods.mjs';
import { selectReport } from '../../report-options.js';
import { shareElectricityEdits } from '../../observations.js';
import { layout3Draft } from '../fixtures/uniland-input.mjs';
import { PLANT_SCHEMAS } from '../../schema.js';
import { draftsHandler } from '../../server/drafts.js';
import { createDraft } from '../../engine.js';
import { createWorkingHoursDraft, createNightShiftDraft } from '../../engine.js';
import { emptyNightShifts } from '../../shifts.js';
import { emptyWorkingHours } from '../../storage.js';
import { importHistory } from '../../server/history-import.js';
import { graphsHandler } from '../../server/graphs.js';
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { createPool, transaction } from '../../server/db.js';
import { hashPassword } from '../../server/password.js';
import { rateKey, issueSession, sessionCookie } from '../../server/auth.js';
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
  IOT_ENABLED: '1',
  IOT_MANUAL_REFRESH_ENABLED: '1',
  IOT_PUBLIC_ORIGIN: 'https://iot.example.com',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  AUTH_SECRET: randomBytes(32).toString('hex'),
};
const ids = [];
const names = [];
const password = 'Test-only initial passphrase 123';

test('IoT ingestion deduplicates atomically, isolates owners and rejects revoked or conflicting uploads without report writes', async () => {
  const actor = await login(await seed()),
    stranger = await login(await seed()),
    id = 'test_' + randomBytes(8).toString('hex'),
    key = randomBytes(32).toString('base64url');
  const body = {
    schema_version: 1,
    event_id: 'reading_1',
    device_id: id,
    meter_id: 'meter_1',
    meter_profile: 'fort',
    event_type: 'telemetry',
    captured_at: '2026-11-01T01:00:00Z',
    quality: 'valid',
    readings: { active_energy_kwh: '123.000001' },
  };
  const headers = { 'X-Device-ID': id, Authorization: 'Bearer ' + key };
  await db.query(
    'INSERT INTO meter_app.iot_devices(device_id,owner_id,plant,meter_id,meter_profile,token_hash) VALUES($1,$2,$3,$4,$5,$6)',
    [id, actor.id, 'JRE', 'meter_1', 'fort', tokenHash(key)],
  );
  try {
    assert.equal((await call('/api/iot-ingest', { body })).status, 401);
    const results = await Promise.all([
      call('/api/iot-ingest', { body, headers }),
      call('/api/iot-ingest', { body, headers }),
    ]);
    assert.deepEqual(results.map((x) => x.status).sort(), [200, 201]);
    assert.equal(
      (
        await call('/api/iot-ingest', {
          body: { ...body, readings: { active_energy_kwh: '124' } },
          headers,
        })
      ).status,
      409,
    );
    assert.equal(
      (await call('/api/iot-ingest', { body: { ...body, meter_id: 'forged' }, headers })).status,
      403,
    );
    assert.equal((await call('/api/iot-readings', { actor })).value.readings.length, 1);
    assert.equal(
      (await call('/api/iot-readings?device_id=' + id, { actor: stranger })).value.readings.length,
      0,
    );
    assert.equal((await call('/api/iot-readings')).status, 401);
    assert.equal((await call('/api/reports', { actor })).value.reports.length, 0);
    await db.query(
      'UPDATE meter_app.iot_devices SET hits=120,window_start=now() WHERE device_id=$1',
      [id],
    );
    assert.equal((await call('/api/iot-ingest', { body, headers })).status, 429);
    await db.query('UPDATE meter_app.iot_devices SET active=false WHERE device_id=$1', [id]);
    assert.equal((await call('/api/iot-ingest', { body, headers })).status, 401);
  } finally {
    await db.query('DELETE FROM meter_app.iot_readings WHERE device_id=$1', [id]);
    await db.query('DELETE FROM meter_app.iot_devices WHERE device_id=$1', [id]);
  }
});

test('authenticated heartbeats show presence without a meter reading and cannot bypass binding, budgets or revocation', async () => {
  const actor = await login(await seed()),
    stranger = await login(await seed());
  const id = 'heartbeat_' + randomBytes(8).toString('hex'),
    key = randomBytes(32).toString('base64url');
  const headers = { 'X-Device-ID': id, Authorization: 'Bearer ' + key };
  const body = {
    schema_version: 1,
    event_type: 'heartbeat',
    device_id: id,
    meter_id: 'meter_1',
    meter_profile: 'fort',
  };
  const read = async () => (await call('/api/iot-readings', { actor })).value;
  const stored = async () =>
    (await db.query('SELECT last_received_at FROM meter_app.iot_devices WHERE device_id=$1', [id]))
      .rows[0].last_received_at;
  await db.query(
    'INSERT INTO meter_app.iot_devices(device_id,owner_id,plant,meter_id,meter_profile,token_hash) VALUES($1,$2,$3,$4,$5,$6)',
    [id, actor.id, 'JRE', 'meter_1', 'fort', tokenHash(key)],
  );
  try {
    assert.equal((await read()).devices[0].connection_status, 'unknown');
    assert.equal((await call('/api/iot-ingest', { headers, method: 'GET' })).status, 405);
    assert.equal((await call('/api/iot-ingest', { body })).status, 401);
    assert.equal((await call('/api/iot-ingest', { body, actor })).status, 401);
    assert.equal(
      (
        await call('/api/iot-ingest', {
          body,
          headers: { ...headers, Authorization: 'Bearer ' + 'x'.repeat(43) },
        })
      ).status,
      401,
    );
    assert.equal(
      (await call('/api/iot-ingest', { body: { ...body, meter_id: 'wrong' }, headers })).status,
      403,
    );
    assert.equal(
      (await call('/api/iot-ingest', { body: { ...body, meter_profile: 'wrong' }, headers }))
        .status,
      403,
    );
    assert.equal(
      (
        await call('/api/iot-ingest', {
          body: { ...body, readings: { active_energy_kwh: '0' } },
          headers,
        })
      ).status,
      400,
    );
    assert.equal(await stored(), null);
    const beat = await call('/api/iot-ingest', { body, headers });
    assert.equal(beat.status, 200);
    assert.equal(beat.value.event_type, 'heartbeat');
    assert.equal(beat.value.device_id, id);
    assert.equal(beat.value.heartbeat_interval_seconds, 60);
    assert.equal(beat.value.event_id, undefined);
    assert.ok(Number.isFinite(Date.parse(beat.value.server_time)));
    let list = await read();
    assert.equal(list.devices[0].connection_status, 'connected');
    assert.equal(list.devices[0].latest_reading, null);
    assert.equal(list.readings.length, 0);
    assert.equal(list.connection.presence_timeout_seconds, 180);
    assert.ok(Number.isFinite(Date.parse(list.server_time)));
    assert.equal((await call('/api/iot-readings', { actor: stranger })).value.devices.length, 0);
    assert.ok(!JSON.stringify(list).includes(tokenHash(key)));
    assert.ok(!JSON.stringify(list).includes(key));
    await db.query(
      "UPDATE meter_app.iot_devices SET last_received_at=now()-interval '4 minutes' WHERE device_id=$1",
      [id],
    );
    assert.equal((await read()).devices[0].connection_status, 'offline');
    assert.equal((await call('/api/iot-ingest', { body, headers })).status, 200);
    assert.equal((await read()).devices[0].connection_status, 'connected');
    const telemetry = {
      ...body,
      event_type: 'telemetry',
      event_id: 'sample_1',
      captured_at: '2026-11-01T01:00:00Z',
      quality: 'valid',
      readings: { active_energy_kwh: '123.000001' },
    };
    assert.equal((await call('/api/iot-ingest', { body: telemetry, headers })).status, 201);
    const before = (await read()).devices[0].latest_reading;
    await db.query(
      "UPDATE meter_app.iot_devices SET last_received_at=now()-interval '4 minutes' WHERE device_id=$1",
      [id],
    );
    assert.equal((await call('/api/iot-ingest', { body: telemetry, headers })).status, 200);
    list = await read();
    assert.equal(list.devices[0].connection_status, 'connected');
    assert.deepEqual(list.devices[0].latest_reading, before);
    assert.equal(list.readings.length, 1);
    const seen = await stored();
    assert.equal(
      (
        await call('/api/iot-ingest', {
          body: { ...telemetry, readings: { active_energy_kwh: '124' } },
          headers,
        })
      ).status,
      409,
    );
    assert.deepEqual(await stored(), seen);
    await db.query(
      'UPDATE meter_app.iot_devices SET hits=120,window_start=now() WHERE device_id=$1',
      [id],
    );
    assert.equal((await call('/api/iot-ingest', { body, headers })).status, 429);
    assert.deepEqual(await stored(), seen);
    await db.query('UPDATE meter_app.iot_devices SET active=false WHERE device_id=$1', [id]);
    assert.equal((await call('/api/iot-ingest', { body, headers })).status, 401);
    assert.equal((await read()).devices[0].connection_status, 'disabled');
    assert.deepEqual(await stored(), seen);
    await db.query('UPDATE meter_app.iot_devices SET active=true,hits=0 WHERE device_id=$1', [id]);
    await db.query('UPDATE meter_app.users SET active=false WHERE id=$1', [actor.id]);
    assert.equal((await call('/api/iot-ingest', { body, headers })).status, 401);
    assert.deepEqual(await stored(), seen);
    assert.equal(
      (
        await db.query('SELECT count(*)::int AS n FROM meter_app.reports WHERE owner_id=$1', [
          actor.id,
        ])
      ).rows[0].n,
      0,
    );
  } finally {
    await db.query('DELETE FROM meter_app.iot_readings WHERE device_id=$1', [id]);
    await db.query('DELETE FROM meter_app.iot_devices WHERE device_id=$1', [id]);
  }
});

test('manual read is owner-scoped, atomic and delivered by signed heartbeat until fresh telemetry', async () => {
  const actor = await login(await seed()),
    stranger = await login(await seed());
  const id = 'manual_' + randomBytes(8).toString('hex'),
    key = randomBytes(32).toString('base64url');
  const headers = { 'X-Device-ID': id, Authorization: 'Bearer ' + key };
  const beat = {
    schema_version: 1,
    event_type: 'heartbeat',
    device_id: id,
    meter_id: 'meter_1',
    meter_profile: 'fort',
  };
  await db.query(
    'INSERT INTO meter_app.iot_devices(device_id,owner_id,plant,meter_id,meter_profile,token_hash,last_received_at) VALUES($1,$2,$3,$4,$5,$6,now())',
    [id, actor.id, 'JRE', 'meter_1', 'fort', tokenHash(key)],
  );
  try {
    const ask = () => call('/api/iot-refresh', { actor, body: { device_id: id } });
    assert.equal((await call('/api/iot-refresh', { body: { device_id: id } })).status, 401);
    assert.equal(
      (
        await call('/api/iot-refresh', {
          actor,
          body: { device_id: id },
          headers: { Origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    assert.equal((await call('/api/iot-refresh', { actor, method: 'GET' })).status, 405);
    assert.equal(
      (await call('/api/iot-refresh', { actor: stranger, body: { device_id: id } })).status,
      404,
    );
    assert.equal(
      (await call('/api/iot-refresh', { actor, body: { device_id: id, force: true } })).status,
      400,
    );
    const firstRequests = await Promise.all([ask(), ask(), ask()]);
    assert.deepEqual(firstRequests.map((r) => r.status).sort(), [202, 409, 409]);
    const queued = firstRequests.find((r) => r.status === 202);
    assert.equal(queued.status, 202);
    assert.equal(queued.value.queued, true);
    const parallel = await Promise.all([ask(), ask(), ask()]);
    assert.ok(
      parallel.every((result) => result.status === 409 && result.value.error === 'REFRESH_PENDING'),
    );
    let list = (await call('/api/iot-readings', { actor })).value;
    assert.equal(list.connection.telemetry_interval_seconds, 600);
    assert.equal(list.connection.manual_cooldown_seconds, 10);
    assert.equal(list.devices.find((d) => d.device_id === id).refresh_pending, true);
    const statusOnly = (await call('/api/iot-readings?status_only=1', { actor })).value;
    assert.equal(statusOnly.status_only, true);
    assert.deepEqual(statusOnly.readings, []);
    assert.equal(Object.hasOwn(statusOnly.devices[0], 'latest_reading'), false);
    assert.equal(statusOnly.devices[0].refresh_pending, true);
    assert.equal((await call('/api/iot-readings?status_only=yes', { actor })).status, 400);
    const pulse = await call('/api/iot-ingest', { body: beat, headers });
    assert.equal(pulse.status, 200);
    assert.equal(typeof pulse.value.refresh_after_utc, 'number');
    assert.equal(
      pulse.value.refresh_after_utc,
      Math.floor(Date.parse(queued.value.requested_at) / 1000),
    );
    assert.equal(
      (await call('/api/iot-readings', { actor: stranger })).value.devices.some(
        (d) => d.device_id === id,
      ),
      false,
    );
    // A cached pre-request telemetry event must not complete the command.
    const telemetry = {
      ...beat,
      event_type: 'telemetry',
      event_id: 'manual_sample_old',
      captured_at: '2026-11-01T01:00:00Z',
      quality: 'valid',
      readings: { active_energy_kwh: '19.000000' },
    };
    assert.equal((await call('/api/iot-ingest', { body: telemetry, headers })).status, 201);
    assert.equal(
      (await call('/api/iot-readings', { actor })).value.devices.find((d) => d.device_id === id)
        .refresh_pending,
      true,
    );
    telemetry.event_id = 'manual_sample_future';
    telemetry.captured_at = new Date(Date.now() + 60000).toISOString().slice(0, 19) + 'Z';
    assert.equal((await call('/api/iot-ingest', { body: telemetry, headers })).status, 201);
    assert.equal(
      (await call('/api/iot-readings?status_only=1', { actor })).value.devices[0].refresh_pending,
      true,
    );
    await db.query(
      "UPDATE meter_app.iot_refresh_requests SET requested_at=clock_timestamp()-interval '3 seconds' WHERE device_id=$1",
      [id],
    );
    telemetry.event_id = 'manual_sample_new';
    telemetry.captured_at = new Date().toISOString().slice(0, 19) + 'Z';
    assert.equal((await call('/api/iot-ingest', { body: telemetry, headers })).status, 201);
    list = (await call('/api/iot-readings', { actor })).value;
    assert.equal(list.devices.find((d) => d.device_id === id).refresh_pending, false);
    assert.equal(
      (await call('/api/iot-ingest', { body: beat, headers })).value.refresh_after_utc,
      undefined,
    );
    // Set an exact recent completion rather than relying on network timings for cooldown.
    await db.query(
      "UPDATE meter_app.iot_refresh_requests SET requested_at=clock_timestamp()-interval '1 second',completed_at=clock_timestamp() WHERE device_id=$1",
      [id],
    );
    assert.equal((await ask()).status, 429);
    await db.query(
      "UPDATE meter_app.iot_refresh_requests SET requested_at=now()-interval '11 seconds',completed_at=now()-interval '10 seconds' WHERE device_id=$1",
      [id],
    );
    assert.equal((await ask()).status, 202);
    assert.equal((await ask()).status, 409);
    await db.query(
      "UPDATE meter_app.iot_refresh_requests SET requested_at=clock_timestamp()-interval '121 seconds',completed_at=NULL WHERE device_id=$1",
      [id],
    );
    assert.equal((await ask()).status, 202);
    await db.query('UPDATE meter_app.iot_devices SET active=false WHERE device_id=$1', [id]);
    assert.equal((await ask()).status, 409);
    await db.query('UPDATE meter_app.iot_devices SET active=true WHERE device_id=$1', [id]);
    // A queued ingest transaction can be older than the request it later completes.
    const blocker = await db.connect();
    let upload;
    try {
      await blocker.query('BEGIN');
      await blocker.query(
        'SELECT device_id FROM meter_app.iot_devices WHERE device_id=$1 FOR UPDATE',
        [id],
      );
      const captured = new Date(Date.now() + 2500).toISOString().slice(0, 19) + 'Z';
      upload = call('/api/iot-ingest', {
        body: { ...telemetry, event_id: 'queued_transaction', captured_at: captured },
        headers,
      });
      let waiting = false;
      for (let i = 0; i < 40; i++) {
        waiting = (
          await db.query(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT d.* FROM meter_app.iot_devices%') AS waiting",
          )
        ).rows[0].waiting;
        if (waiting) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(waiting, true);
      await blocker.query(
        'UPDATE meter_app.iot_refresh_requests SET requested_at=clock_timestamp(),completed_at=NULL WHERE device_id=$1',
        [id],
      );
      await new Promise((resolve) => setTimeout(resolve, 2600));
      await blocker.query('COMMIT');
      assert.equal((await upload).status, 201);
      assert.equal(
        (await call('/api/iot-readings?status_only=1', { actor })).value.devices[0].refresh_pending,
        false,
      );
    } finally {
      await blocker.query('ROLLBACK').catch(() => {});
      blocker.release();
      if (upload) await upload;
    }
  } finally {
    await db.query('DELETE FROM meter_app.iot_readings WHERE device_id=$1', [id]);
    await db.query('DELETE FROM meter_app.iot_devices WHERE device_id=$1', [id]);
  }
});

test('manual refresh flag off keeps ingest and status reads working without migration 010 schema', async () => {
  const actor = await login(await seed()),
    id = 'old_schema_' + randomBytes(8).toString('hex'),
    key = randomBytes(32).toString('base64url');
  const flag = env.IOT_MANUAL_REFRESH_ENABLED;
  let renamed = false;
  await db.query(
    'INSERT INTO meter_app.iot_devices(device_id,owner_id,plant,meter_id,meter_profile,token_hash) VALUES($1,$2,$3,$4,$5,$6)',
    [id, actor.id, 'JRE', 'meter_1', 'fort', tokenHash(key)],
  );
  try {
    env.IOT_MANUAL_REFRESH_ENABLED = '0';
    await db.query(
      'ALTER TABLE meter_app.iot_refresh_requests RENAME TO iot_refresh_requests_hidden_test',
    );
    renamed = true;
    const headers = { 'X-Device-ID': id, Authorization: 'Bearer ' + key };
    const beat = {
      schema_version: 1,
      event_type: 'heartbeat',
      device_id: id,
      meter_id: 'meter_1',
      meter_profile: 'fort',
    };
    assert.equal((await call('/api/iot-ingest', { body: beat, headers })).status, 200);
    const read = await call('/api/iot-readings?status_only=1', { actor });
    assert.equal(read.status, 200);
    assert.equal(read.value.connection.manual_refresh_enabled, false);
    assert.equal((await call('/api/iot-readings', { actor })).status, 200);
    assert.equal((await call('/api/iot-refresh', { actor, body: { device_id: id } })).status, 503);
  } finally {
    if (renamed)
      await db.query(
        'ALTER TABLE meter_app.iot_refresh_requests_hidden_test RENAME TO iot_refresh_requests',
      );
    env.IOT_MANUAL_REFRESH_ENABLED = flag;
    await db.query('DELETE FROM meter_app.iot_devices WHERE device_id=$1', [id]);
  }
});

test('diagnostic meter management enforces admin ownership, one-time keys, latest per source and no report writes', async () => {
  const actor = await login(await seed('admin'));
  const stranger = await login(await seed('admin'));
  const source = 'registry_' + randomBytes(8).toString('hex');
  const body = {
    action: 'create',
    device_id: source,
    plant: 'UNILAND',
    meter_id: 'custom_meter',
    meter_profile: 'custom_profile',
  };
  const registry = (payload, owner = actor, headers = {}) =>
    call('/api/iot-devices', { actor: owner, body: payload, headers });
  const inventory = async () => {
    const result = {};
    for (const table of ['working_drafts', 'period_autosaves', 'reports'])
      result[table] = (
        await db.query(
          `SELECT to_jsonb(t) AS row FROM meter_app.${table} t WHERE owner_id=$1 ORDER BY to_jsonb(t)::text`,
          [actor.id],
        )
      ).rows;
    result.revisions = (
      await db.query(
        'SELECT to_jsonb(v) AS row FROM meter_app.report_revisions v JOIN meter_app.reports r ON r.id=v.report_id WHERE r.owner_id=$1 ORDER BY to_jsonb(v)::text',
        [actor.id],
      )
    ).rows;
    return result;
  };
  try {
    assert.equal((await registry(body, null)).status, 401);
    assert.equal((await registry(body, operator)).status, 403);
    assert.equal((await registry(body, actor, { Origin: 'https://evil.example' })).status, 403);
    assert.equal(
      (await registry(body, null, { Cookie: actor.cookie, 'X-Meter-User': stranger.id })).status,
      409,
    );
    assert.equal((await registry({ ...body, owner_id: stranger.id })).status, 400);
    assert.equal((await registry({ ...body, endpoint: 'http://127.0.0.1/internal' })).status, 400);
    assert.equal((await registry({ ...body, device_id: '../bad' })).status, 400);
    const configuredOrigin = env.IOT_PUBLIC_ORIGIN;
    try {
      env.IOT_PUBLIC_ORIGIN = 'http://127.0.0.1:3000';
      const missingCloud = await registry(body);
      assert.equal(missingCloud.status, 503);
      assert.equal(missingCloud.value.error, 'IOT_CLOUD_NOT_CONFIGURED');
    } finally {
      env.IOT_PUBLIC_ORIGIN = configuredOrigin;
    }
    const draft = exampleDraft('JRE');
    assert.equal((await call('/api/reports', { actor, body: { draft } })).status, 201);
    assert.equal(
      (
        await call('/api/drafts', {
          actor,
          body: {
            workspace: { version: 4, drafts: { JRE: draft, UNILAND: createDraft('UNILAND') } },
            baseVersion: 0,
          },
        })
      ).status,
      200,
    );
    const before = await inventory();
    const created = await Promise.all([registry(body), registry(body)]);
    assert.deepEqual(created.map((r) => r.status).sort(), [201, 409]);
    const key = created.find((r) => r.status === 201).value.credential;
    assert.equal(
      created.find((r) => r.status === 201).value.connection.endpoint,
      'https://iot.example.com/api/iot-ingest',
    );
    assert.match(key, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(created.find((r) => r.status === 201).value.device.plant, 'UNILAND');
    assert.equal(
      (await db.query('SELECT token_hash FROM meter_app.iot_devices WHERE device_id=$1', [source]))
        .rows[0].token_hash,
      tokenHash(key),
    );
    const event = {
      schema_version: 1,
      event_id: 'latest',
      device_id: source,
      meter_id: body.meter_id,
      meter_profile: body.meter_profile,
      event_type: 'telemetry',
      captured_at: '2026-11-02T01:00:00Z',
      quality: 'valid',
      readings: {
        active_energy_kwh: '321.000001',
        current_l1_a: '1.01',
        current_l2_a: '2.02',
        current_l3_a: '0',
      },
    };
    const upload = (credential, payload = event) =>
      call('/api/iot-ingest', {
        body: payload,
        headers: { 'X-Device-ID': source, Authorization: 'Bearer ' + credential },
      });
    assert.equal((await upload(key)).status, 201);
    assert.equal(
      (
        await upload(key, {
          ...event,
          event_id: 'backfill',
          captured_at: '2026-11-01T01:00:00Z',
          readings: { active_energy_kwh: '123', current_a: '0.1' },
        })
      ).status,
      201,
    );
    const other = await registry({ ...body, device_id: source + '_busy' });
    assert.equal(other.status, 201);
    await db.query(
      `INSERT INTO meter_app.iot_readings(device_id,event_id,captured_at,event_type,payload,payload_hash)
      SELECT $1,'busy_'||n,'2026-11-03T01:00:00Z'::timestamptz,'telemetry',$2::jsonb,repeat('0',64) FROM generate_series(1,101) n`,
      [
        source + '_busy',
        { ...event, device_id: source + '_busy', captured_at: '2026-11-03T01:00:00Z' },
      ],
    );
    const list = await call('/api/iot-readings', { actor });
    assert.equal(list.value.readings.length, 100);
    assert.equal(list.value.connection.schema_version, 1);
    assert.equal(list.value.connection.endpoint, 'https://iot.example.com/api/iot-ingest');
    assert.ok(list.value.readings.every((r) => r.device_id !== source));
    const device = list.value.devices.find((d) => d.device_id === source);
    assert.equal(device.latest_reading.readings.active_energy_kwh, '321.000001');
    assert.equal(device.latest_reading.readings.current_l3_a, '0');
    assert.equal(
      new Date(device.latest_reading.captured_at).toISOString(),
      '2026-11-02T01:00:00.000Z',
    );
    assert.ok(!JSON.stringify(list.value).includes(key));
    assert.ok(!JSON.stringify(list.value).includes('token_hash'));
    const filtered = await call('/api/iot-readings?event_type=checkpoint', { actor });
    assert.equal(filtered.value.readings.length, 0);
    assert.equal(
      filtered.value.devices.find((d) => d.device_id === source).latest_reading.readings
        .active_energy_kwh,
      '321.000001',
    );
    assert.equal((await call('/api/iot-readings', { actor: stranger })).value.devices.length, 0);
    for (const action of ['rotate', 'revoke'])
      assert.equal((await registry({ action, device_id: source }, stranger)).status, 404);
    const replaced = await registry({ action: 'rotate', device_id: source });
    assert.equal(replaced.status, 200);
    assert.notEqual(replaced.value.credential, key);
    assert.equal((await upload(key)).status, 401);
    assert.equal((await upload(replaced.value.credential)).status, 200);
    const revoked = await registry({ action: 'revoke', device_id: source });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.value.credential, undefined);
    assert.equal((await upload(replaced.value.credential)).status, 401);
    assert.equal(
      (await call('/api/iot-readings?device_id=' + source, { actor })).value.readings.length,
      2,
    );
    await db.query(
      `INSERT INTO meter_app.iot_devices(device_id,owner_id,plant,meter_id,meter_profile,token_hash)
      SELECT $1||'_quota_'||n,$2,'JRE','meter','profile',repeat('0',64) FROM generate_series(1,98) n`,
      [source, actor.id],
    );
    const limited = await registry({ ...body, device_id: source + '_over' });
    assert.equal(limited.status, 409);
    assert.equal(limited.value.error, 'DEVICE_LIMIT_REACHED');
    assert.deepEqual(await inventory(), before);
  } finally {
    await db.query(
      'DELETE FROM meter_app.iot_readings WHERE device_id IN (SELECT device_id FROM meter_app.iot_devices WHERE owner_id=$1)',
      [actor.id],
    );
    await db.query('DELETE FROM meter_app.iot_devices WHERE owner_id=$1', [actor.id]);
  }
});

test('work reports persist times and private revisions separately from daily reports and graphs', async () => {
  const actor = await login(await seed());
  for (const plant of ['JRE', 'UNILAND']) {
    const daily = exampleDraft(plant);
    const d = { ...createWorkingHoursDraft(plant, daily.startDate), rows: daily.rows };
    const normal = await call('/api/reports', { actor, body: { draft: daily } });
    const first = await call('/api/reports', { actor, body: { draft: d } });
    assert.equal(normal.status, 201);
    assert.equal(first.status, 201);
    assert.notEqual(first.value.id, normal.value.id);
    assert.equal((await call('/api/reports?id=' + first.value.id, { actor })).status, 404);
    assert.equal(
      (await call('/api/reports?id=' + first.value.id + '&kind=workingHours', { actor: admin }))
        .status,
      404,
    );
    assert.equal((await call('/api/reports?plant=' + plant, { actor })).value.reports.length, 1);
    const list = await call('/api/reports?kind=workingHours&plant=' + plant, { actor });
    assert.equal(list.value.reports.length, 1);
    assert.equal(list.value.reports[0].end_date, d.startDate);
    const original = first.value.snapshot.output.reportText;
    d.endTime = '17:15';
    d.rows[0].end[0] = String(Number(d.rows[0].end[0]) + 1);
    const revised = await call('/api/reports', {
      actor,
      body: { id: first.value.id, baseRevision: 1, draft: d },
    });
    assert.equal(revised.status, 200);
    assert.equal(revised.value.revision, 2);
    const old = await call('/api/reports?id=' + first.value.id + '&kind=workingHours&revision=1', {
      actor,
    });
    assert.equal(old.value.snapshot.output.reportText, original);
    const query = '/api/graphs?plant=' + plant + '&start=2026-09-01&end=2026-09-30';
    const dailyGraph = await call(query, { actor });
    const workGraph = await call(query + '&kind=workingHours', { actor });
    assert.equal(dailyGraph.value.records.length, 1);
    assert.equal(workGraph.value.records.length, 1);
    assert.equal(workGraph.value.records[0].periodKind, 'workingHours');
    assert.equal(workGraph.value.records[0].minutes, 555);
    assert.equal(workGraph.value.records[0].revision, 2);
    assert.equal(
      workGraph.value.records[0].values.r0,
      calculateDraft(d).totalDirectEnergy * (plant === 'UNILAND' ? 1000 : 1),
    );
    assert.ok(
      Object.keys(workGraph.value.records[0].values)
        .filter((k) => k.startsWith('u') || k.startsWith('kg'))
        .every((k) => workGraph.value.records[0].values[k] === null),
    );
    d.utilities[0].value = 'invalid';
    assert.equal(
      (
        await call('/api/reports', {
          actor,
          body: { id: first.value.id, baseRevision: 2, draft: d },
        })
      ).status,
      422,
    );
  }
  assert.equal((await call('/api/reports?kind=unknown', { actor })).status, 400);
  assert.equal(
    (await call('/api/graphs?plant=JRE&start=2026-09-01&end=2026-09-30&kind=unknown', { actor }))
      .status,
    400,
  );
});

test('expanded draft saves are replaceable and protected from old clients and rollback writers', async () => {
  const actor = await login(await seed());
  const workspace = {
    version: 4,
    drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') },
    workingHours: emptyWorkingHours(),
  };
  workspace.workingHours.JRE.rows[0].end[0] = '123.';
  const saved = await call('/api/drafts', { actor, body: { workspace, baseVersion: 0 } });
  assert.equal(saved.status, 200);
  const reread = (await call('/api/drafts', { actor })).value;
  assert.equal(reread.workspace.workingHours.JRE.rows[0].end[0], '123.');
  const old = { version: 4, drafts: workspace.drafts };
  const rejected = await call('/api/drafts', {
    actor,
    body: { workspace: old, baseVersion: reread.version },
  });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.value.error, 'DRAFT_FORMAT_CHANGED');
  await assert.rejects(
    runtime.query('UPDATE meter_app.working_drafts SET workspace=$2::jsonb WHERE owner_id=$1', [
      actor.id,
      JSON.stringify(old),
    ]),
    (error) => error.code === '23514',
  );
  assert.equal((await call('/api/drafts', { actor })).value.version, reread.version);
  assert.equal((await call('/api/reports?kind=workingHours', { actor })).value.reports.length, 0);
  assert.equal(
    (await call('/api/drafts', { actor, body: { workspace: null, baseVersion: reread.version } }))
      .status,
    200,
  );
});
test('stale UNILAND clients cannot replace expanded daily or work drafts', async () => {
  const actor = await login(await seed());
  const workspace = {
    version: 4,
    drafts: { JRE: createDraft('JRE'), UNILAND: exampleDraft('UNILAND') },
    workingHours: emptyWorkingHours(),
  };
  const newIndex = PLANT_SCHEMAS.UNILAND.rows.findIndex((row) => row.name === 'Painting');
  workspace.drafts.UNILAND.rows[newIndex].end[0] = '123.';
  workspace.workingHours.UNILAND.rows[newIndex].start[0] = '45,00';
  const saved = await call('/api/drafts', { actor, body: { workspace, baseVersion: 0 } });
  assert.equal(saved.status, 200);
  for (const collection of ['drafts', 'workingHours']) {
    const stale = structuredClone(workspace);
    stale[collection].UNILAND = layout3Draft(stale[collection].UNILAND);
    const rejected = await call('/api/drafts', {
      actor,
      body: { workspace: stale, baseVersion: saved.value.version },
    });
    assert.equal(rejected.status, 409);
    assert.equal(rejected.value.error, 'DRAFT_FORMAT_CHANGED');
  }
  const kept = (await call('/api/drafts', { actor })).value;
  assert.equal(kept.version, saved.value.version);
  assert.equal(kept.workspace.drafts.UNILAND.rows[newIndex].end[0], '123.');
  assert.equal(kept.workspace.workingHours.UNILAND.rows[newIndex].start[0], '45,00');
});

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
    [JSON.stringify({ padding: 'x'.repeat(512 * 1024) }), 413],
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
  const key = rateKey('login:user:' + probe.name, env);
  let previous,
    blocked = false;
  // Count attempts within the actual database window, not across a wall-clock rollover.
  // Two windows still leave enough attempts to observe the unchanged 10-attempt limit.
  for (let i = 0; i < 22 && !blocked; i++) {
    const result = await call(i % 2 ? '/api/auth-replica' : '/api/auth', {
      body: {
        action: 'login',
        username: i % 2 ? ' ' + probe.name.toUpperCase() + ' ' : probe.name,
        password: 'wrong synthetic password',
      },
      headers: { 'X-Forwarded-For': '203.0.113.' + (i + 1) },
    });
    const counter = (
      await db.query(
        'SELECT hits,window_start::text FROM meter_app.rate_limits WHERE key_hash=$1',
        [key],
      )
    ).rows[0];
    assert.ok(counter);
    assert.equal(
      counter.hits,
      previous?.window_start === counter.window_start ? previous.hits + 1 : 1,
    );
    blocked = counter.hits > 10;
    assert.equal(result.status, blocked ? 429 : 401);
    assert.equal(result.value.error, blocked ? 'RATE_LIMITED' : 'INVALID_CREDENTIALS');
    assert.equal(result.cookie, undefined);
    previous = counter;
  }
  assert.equal(blocked, true, 'The 11th attempt in one database window must be blocked');
  assert.equal(previous.hits, 11);

  // Reproduce the boundary explicitly on this synthetic key: the next window starts at one.
  await db.query(
    "UPDATE meter_app.rate_limits SET window_start=now()-interval '15 minutes' WHERE key_hash=$1",
    [key],
  );
  const reset = await call('/api/auth-replica', {
    body: { action: 'login', username: probe.name, password: 'wrong synthetic password' },
  });
  assert.equal(reset.status, 401);
  assert.equal(reset.value.error, 'INVALID_CREDENTIALS');
  assert.equal(reset.cookie, undefined);
  assert.equal(
    (await db.query('SELECT hits FROM meter_app.rate_limits WHERE key_hash=$1', [key])).rows[0]
      .hits,
    1,
  );
});

test('authentication IP budget is shared across accounts and handlers and ignores forged forwarded addresses', async () => {
  const key = rateKey('auth:ip:127.0.0.1', env);
  const probes = [await seed(), await seed()];
  for (const [index, hits] of [59, 60].entries()) {
    // Place this synthetic counter ahead of the boundary to avoid a clock rollover.
    await db.query(
      `INSERT INTO meter_app.rate_limits(key_hash,window_start,hits)
       VALUES($1,now()+interval '15 minutes',$2)
       ON CONFLICT(key_hash) DO UPDATE SET window_start=EXCLUDED.window_start,hits=EXCLUDED.hits`,
      [key, hits],
    );
    const result = await call(index ? '/api/auth-replica' : '/api/auth', {
      body: { action: 'login', username: probes[index].name, password: 'wrong synthetic password' },
      headers: { 'X-Forwarded-For': '203.0.113.' + (index + 1) },
    });
    assert.equal(result.status, index ? 429 : 401);
    assert.equal(result.value.error, index ? 'RATE_LIMITED' : 'INVALID_CREDENTIALS');
    assert.equal(result.cookie, undefined);
    assert.equal(
      (await db.query('SELECT hits FROM meter_app.rate_limits WHERE key_hash=$1', [key])).rows[0]
        .hits,
      hits + 1,
    );
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
  assert.ok(Number.isFinite(Date.parse(saved.value.updated_at)));
  assert.equal((await call('/api/drafts', { actor: admin })).value.workspace, null);
  const repeat = await call('/api/drafts', {
    actor: operator,
    body: { workspace, baseVersion: 0 },
  });
  assert.equal(repeat.value.version, 1);
  assert.equal(repeat.value.unchanged, true);
  assert.equal(repeat.value.updated_at, saved.value.updated_at);
  assert.equal(
    (await call('/api/drafts', { actor: operator })).value.updated_at,
    saved.value.updated_at,
  );
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
  '/api/iot-refresh': iotRefreshHandler(() => runtime, env),
  '/api/iot-devices': iotDevicesHandler(() => runtime, env),
  '/api/iot-ingest': iotIngestHandler(() => runtime, env),
  '/api/iot-readings': iotReadingsHandler(() => runtime, env),
  '/api/auth': authHandler(() => runtime, env),
  '/api/auth-replica': authHandler(() => runtime, env),
  '/api/users': usersHandler(() => runtime, env),
  '/api/drafts': draftsHandler(() => runtime, env),
  '/api/graphs': graphsHandler(() => runtime, env),
  '/api/graphs-replica': graphsHandler(() => runtime, env),
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
beforeEach(async () => {
  // Independent scenarios share a loopback server, not one user's 15-minute login budget.
  // Keep the real limiter active within every scenario, including the boundary test above.
  await db.query('DELETE FROM meter_app.rate_limits WHERE key_hash=$1', [
    rateKey('auth:ip:127.0.0.1', env),
  ]);
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
        ...ids.flatMap((id) => [
          'password:' + id,
          'reports:' + id,
          'admin:' + id,
          'drafts:' + id,
          'reads:' + id,
          'graphs:read:' + id,
        ]),
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
  draft.water = { start: '100,25', end: '' };
  const workspace = { version: 4, drafts: { JRE: createDraft('JRE'), UNILAND: draft } };
  assert.equal(
    (await call('/api/drafts', { actor, body: { workspace, baseVersion: 0 } })).status,
    200,
  );
  const restored = (await call('/api/drafts', { actor })).value.workspace;
  assert.deepEqual(restored.drafts.UNILAND.gas, draft.gas);
  assert.deepEqual(restored.drafts.UNILAND.water, draft.water);
  assert.equal(
    (await call('/api/reports', { actor, body: { id: legacy.value.id, baseRevision: 1, draft } }))
      .status,
    422,
  );
  draft.gas.entries[0].end.reading = '40';
  draft.water.end = '125.75';
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
  assert.deepEqual(own.draft.water, draft.water);
  assert.equal(own.output.water.value, '25.5');
  assert.match(own.output.reportText, /LPG: 4735.29 Kg/);
  assert.ok(Math.abs(own.output.gas[0].kg - 4735.29) < 1e-7);
  const original = await call('/api/reports?id=' + saved.value.id + '&revision=1', { actor });
  assert.equal(original.value.snapshot.output.reportText, legacy.value.snapshot.output.reportText);
  assert.match(original.value.snapshot.output.reportText, /LPG: 12.5 Nm3/);
  const graphs = await call('/api/graphs?plant=UNILAND&start=2026-09-01&end=2026-09-30', { actor });
  assert.equal(graphs.status, 200);
  assert.equal(graphs.value.records[0].values.kg0, 4735.29);
  assert.equal(graphs.value.records[0].values.u0, null);
  assert.equal(graphs.value.records[0].values.u4, 25.5);
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

test('both plants persist stock increases without plotting them as gas consumption or rewriting revisions', async () => {
  const actor = await login(await seed());
  for (const plant of ['JRE', 'UNILAND']) {
    const draft = exampleDraft(plant);
    const point = (reading) => ({ reading, temperature: '' });
    draft.gas.entries[2] = { enabled: true, start: point('1050'), end: point('1000'), refills: [] };
    const original = await call('/api/reports', { actor, body: { draft } });
    assert.equal(original.status, 201);
    [draft.gas.entries[2].start, draft.gas.entries[2].end] = [
      draft.gas.entries[2].end,
      draft.gas.entries[2].start,
    ];
    draft.gas.entries[2].kg = 999999;
    const saved = await call('/api/reports', {
      actor,
      body: {
        id: original.value.id,
        baseRevision: 1,
        draft,
        output: { reportText: 'forged', gas: [{ kg: 999999 }] },
      },
    });
    assert.equal(saved.status, 200);
    const stored = (await call('/api/reports?id=' + saved.value.id, { actor })).value.snapshot;
    assert.ok(stored.output.gas[0].kg < 0);
    assert.equal(stored.draft.gas.entries[2].kg, undefined);
    assert.equal(stored.draft.gas.entries[2].end.reading, '1050');
    assert.equal(stored.output.gas[0].warnings[0].code, 'gasStockIncrease');
    assert.match(stored.output.reportText, /Nitrogen: \+[\d.]+ Kg \(measured stock increase\)/);
    const old = await call('/api/reports?id=' + saved.value.id + '&revision=1', { actor });
    assert.equal(old.value.snapshot.output.reportText, original.value.snapshot.output.reportText);
    const graphs = await call('/api/graphs?plant=' + plant + '&start=2026-09-01&end=2026-09-30', {
      actor,
    });
    assert.equal(graphs.status, 200);
    assert.equal(graphs.value.records[0].values[plant === 'JRE' ? 'u2' : 'kg3'], null);
    draft.gas.entries[2].end = point('950');
    draft.gas.entries[2].refills = [{ before: point('1010'), after: point('1100') }];
    const positive = await call('/api/reports', {
      actor,
      body: { id: saved.value.id, baseRevision: 2, draft },
    });
    assert.equal(positive.status, 200);
    assert.ok(positive.value.snapshot.output.gas[0].kg > 0);
    assert.equal(positive.value.snapshot.output.gas[0].warnings[0].point, 'before0');
    const positiveGraphs = await call(
      '/api/graphs?plant=' + plant + '&start=2026-09-01&end=2026-09-30',
      { actor },
    );
    assert.equal(
      positiveGraphs.value.records[0].values[plant === 'JRE' ? 'u2' : 'kg3'],
      Number(positive.value.snapshot.output.gas[0].kg.toFixed(6)),
    );
    assert.equal(
      (await call('/api/reports?id=' + saved.value.id + '&revision=2', { actor })).value.snapshot
        .output.reportText,
      stored.output.reportText,
    );
    draft.gas.entries[2].refills = [{ before: point('1100'), after: point('1090') }];
    assert.equal(
      (await call('/api/reports', { actor, body: { id: saved.value.id, baseRevision: 3, draft } }))
        .status,
      422,
    );
    assert.equal(
      (await call('/api/reports?id=' + saved.value.id, { actor })).value.latestRevision,
      3,
    );
  }
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
    start: { reading: '587', temperature: '33.5', unit: 'mm' },
    end: { reading: '550', temperature: '33.5', unit: 'mm' },
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
  assert.equal(own.value.snapshot.output.gas[0].calibration, gasCalibration('JRE').version);
  assert.ok(Math.abs(own.value.snapshot.output.gas[0].kg - 154.2086) < 1e-7);
  assert.equal((await call('/api/reports?id=' + reportId, { actor: other })).status, 404);
  assert.equal((await call('/api/reports?id=' + reportId, { actor: admin })).status, 404);
  assert.equal(
    (await call('/api/reports', { actor: other, body: { id: reportId, baseRevision: 1, draft } }))
      .status,
    404,
  );
  const duplicate = await call('/api/reports', { actor: operator, body: { draft } });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.value.unchanged, true);
  assert.equal(duplicate.value.revision, 1);
  assert.equal((await call('/api/reports', { actor: other, body: { draft } })).status, 201);
  assert.equal((await call('/api/reports', { actor: operator })).value.reports.length, 1);
});
test('concurrent edits keep one winner and preserve the old revision', async () => {
  const draft = exampleDraft('JRE');
  draft.rows[0].end[0] = '99999';
  const results = await Promise.all(
    [1, 2].map((value) => {
      const different = structuredClone(draft);
      different.rows[0].end[0] = String(99997 + value);
      return call('/api/reports', {
        actor: operator,
        body: { id: reportId, baseRevision: 1, draft: different },
      });
    }),
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

test('Night and daily reports coexist on identical dates with owner-isolated revisions and immutable graphs', async () => {
  const actor = await login(await seed()),
    other = await login(await seed());
  for (const plant of ['JRE', 'UNILAND']) {
    const daily = exampleDraft(plant),
      night = {
        ...createNightShiftDraft(plant, daily.startDate),
        rows: structuredClone(daily.rows),
      };
    const normal = await call('/api/reports', { actor, body: { draft: daily } });
    const first = await call('/api/reports', { actor, body: { draft: night } });
    assert.equal(normal.status, 201);
    assert.equal(first.status, 201);
    assert.notEqual(normal.value.id, first.value.id);
    assert.equal((await call('/api/reports?id=' + first.value.id, { actor })).status, 404);
    assert.equal(
      (await call('/api/reports?id=' + first.value.id + '&kind=nightShift', { actor: other }))
        .status,
      404,
    );
    const original = first.value.snapshot.output.reportText;
    night.endTime = '08:15';
    night.rows[0].end[0] = String(Number(night.rows[0].end[0]) + 1);
    const revised = await call('/api/reports', {
      actor,
      body: { id: first.value.id, baseRevision: 1, draft: night },
    });
    assert.equal(revised.status, 200);
    assert.equal(revised.value.revision, 2);
    const old = await call('/api/reports?id=' + first.value.id + '&kind=nightShift&revision=1', {
      actor,
    });
    assert.equal(old.value.snapshot.output.reportText, original);
    const list = await call('/api/reports?kind=nightShift&plant=' + plant, { actor });
    assert.equal(list.value.reports.length, 1);
    const graph = await call(
      '/api/graphs?plant=' + plant + '&start=2026-09-01&end=2026-09-30&kind=nightShift',
      { actor },
    );
    assert.equal(graph.status, 200);
    assert.equal(graph.value.records.length, 1);
    assert.equal(graph.value.records[0].minutes, 915);
    assert.equal(graph.value.records[0].periodKind, 'nightShift');
    const invalid = { ...night, endDate: night.startDate };
    assert.equal((await call('/api/reports', { actor, body: { draft: invalid } })).status, 422);
  }
});

test('Night drafts reject old writers, conflicting shared cells and direct rollback overwrites', async () => {
  const actor = await login(await seed());
  const workspace = {
    version: 4,
    drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') },
    workingHours: emptyWorkingHours(),
    nightShifts: emptyNightShifts(),
  };
  workspace.workingHours.JRE = createWorkingHoursDraft('JRE', '2026-09-16');
  workspace.nightShifts.JRE = createNightShiftDraft('JRE', '2026-09-16');
  workspace.workingHours.JRE.rows[0].end[0] = '123.';
  workspace.nightShifts.JRE.rows[0].start[0] = '123.';
  workspace.nightShifts.JRE.rows[0].end[0] = '124.';
  const first = await call('/api/drafts', { actor, body: { workspace, baseVersion: 0 } });
  assert.equal(first.status, 200);
  const old = structuredClone(workspace);
  delete old.nightShifts;
  const rejected = await call('/api/drafts', {
    actor,
    body: { workspace: old, baseVersion: first.value.version },
  });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.value.error, 'DRAFT_FORMAT_CHANGED');
  await assert.rejects(
    runtime.query('UPDATE meter_app.working_drafts SET workspace=$2::jsonb WHERE owner_id=$1', [
      actor.id,
      JSON.stringify(old),
    ]),
    (error) => error.code === '23514',
  );
  const conflicting = structuredClone(workspace);
  conflicting.nightShifts.JRE.rows[0].start[0] = '999';
  assert.equal(
    (
      await call('/api/drafts', {
        actor,
        body: { workspace: conflicting, baseVersion: first.value.version },
      })
    ).status,
    400,
  );
  const kept = (await call('/api/drafts', { actor })).value;
  assert.equal(kept.version, first.value.version);
  assert.equal(kept.workspace.nightShifts.JRE.rows[0].start[0], '123.');
});

test('three-period drafts round trip, preserve legacy differences and leave saved outputs immutable', async () => {
  const actor = await login(await seed());
  const workspace = { version: 4, drafts: {}, workingHours: {}, nightShifts: {} };
  for (const plant of ['JRE', 'UNILAND']) {
    const [daily, after, night] = reportPeriods(plant);
    daily.rows[0].start[0] = '999';
    workspace.drafts[plant] = daily;
    workspace.workingHours[plant] = after;
    workspace.nightShifts[plant] = night;
  }
  const first = await call('/api/drafts', { actor, body: { workspace, baseVersion: 0 } });
  assert.equal(first.status, 200);
  const kept = (await call('/api/drafts', { actor })).value;
  const snapshots = [];
  for (const plant of ['JRE', 'UNILAND']) {
    const periods = [
      kept.workspace.drafts[plant],
      kept.workspace.workingHours[plant],
      kept.workspace.nightShifts[plant],
    ];
    assert.equal(periods[0].rows[0].start[0], '999');
    assert.equal(periods[1].rows[0].start[0], '1000');
    assert.equal(selectReport(periods, 'all').error, 'selectionReadings');
    const next = shareElectricityEdits(periods, 'workingHours', [{ ri: 0, mi: 0, side: 'start' }]);
    assert.equal(selectReport(next, 'all').success, true);
    for (const draft of next) {
      const saved = await call('/api/reports', { actor, body: { draft } });
      assert.equal(saved.status, 201);
      snapshots.push({
        id: saved.value.id,
        kind: draft.periodKind || 'daily',
        output: saved.value.snapshot.output,
      });
    }
    assert.equal(new Set(snapshots.map((s) => s.id)).size, snapshots.length);
    next[1].rows[0].end[0] = '1005';
    const edited = shareElectricityEdits(next, 'workingHours', [{ ri: 0, mi: 0, side: 'end' }]);
    [
      kept.workspace.drafts[plant],
      kept.workspace.workingHours[plant],
      kept.workspace.nightShifts[plant],
    ] = edited;
  }
  const updated = await call('/api/drafts', {
    actor,
    body: { workspace: kept.workspace, baseVersion: kept.version },
  });
  assert.equal(updated.status, 200);
  const reread = (await call('/api/drafts', { actor })).value;
  for (const plant of ['JRE', 'UNILAND']) {
    assert.equal(reread.workspace.workingHours[plant].rows[0].end[0], '1005');
    assert.equal(reread.workspace.nightShifts[plant].rows[0].start[0], '1005');
    assert.equal(reread.workspace.drafts[plant].water.end, '102');
  }
  for (const snapshot of snapshots) {
    const old = await call('/api/reports?id=' + snapshot.id + '&kind=' + snapshot.kind, { actor });
    assert.deepEqual(old.value.snapshot.output, snapshot.output);
  }
});

test('new reports reject cumulative readings fractionally above the documented maximum', async () => {
  const actor = await login(await seed());
  const draft = exampleDraft('UNILAND');
  draft.rows[0].start[0] = draft.rows[0].end[0] = '1000000000000.000001';
  const response = await call('/api/reports', { actor, body: { draft } });
  assert.equal(response.status, 422);
  assert.equal(response.value.error, 'INCOMPLETE_REPORT');
  assert.equal(
    (await db.query('SELECT id FROM meter_app.reports WHERE owner_id=$1', [actor.id])).rowCount,
    0,
  );
});

test('read budgets are shared across handlers, owner-scoped and independent of editing', async () => {
  const actor = await login(await seed());
  const peer = await login(await seed());
  const setBudget = async (prefix, hits, expired = false) =>
    db.query(
      `INSERT INTO meter_app.rate_limits(key_hash,window_start,hits)
       VALUES($1,to_timestamp(floor(extract(epoch FROM now()) / 900) * 900) - $3::integer * interval '30 minutes',$2)
       ON CONFLICT(key_hash) DO UPDATE SET hits=excluded.hits,window_start=excluded.window_start`,
      [rateKey(prefix + actor.id, env), hits, expired ? 1 : 0],
    );
  await setBudget('reads:', 599);
  assert.equal((await call('/api/drafts', { actor })).status, 200);
  const blocked = await fetch(origin + '/api/reports', {
    headers: { Cookie: actor.cookie, 'X-Meter-User': actor.id },
  });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '900');
  assert.equal(blocked.headers.get('cache-control'), 'private, no-store');
  assert.equal((await blocked.json()).error, 'RATE_LIMITED');
  assert.equal((await call('/api/reports', { actor: peer })).status, 200);
  assert.equal((await call('/api/users', { actor })).status, 403);
  // An exhausted read budget must not prevent saving an unfinished draft.
  assert.equal(
    (await call('/api/drafts', { actor, body: { workspace: null, baseVersion: 0 } })).status,
    200,
  );
  await setBudget('reads:', 600, true);
  assert.equal((await call('/api/drafts', { actor })).status, 200);
  await setBudget('graphs:read:', 119);
  const query = '?plant=JRE&start=2026-01-01&end=2026-01-02';
  assert.equal((await call('/api/graphs' + query, { actor })).status, 200);
  assert.equal((await call('/api/graphs-replica' + query, { actor })).status, 429);
  assert.equal((await call('/api/graphs' + query, { actor: peer })).status, 200);
  assert.equal((await call('/api/drafts', { actor })).status, 200);
});

test('stale JRE clients cannot remove new meter fields from any electricity period', async () => {
  const actor = await login(await seed());
  const [daily, after, night] = reportPeriods('JRE', '2026-10-25');
  const workspace = {
    version: 4,
    drafts: { JRE: daily, UNILAND: createDraft('UNILAND') },
    workingHours: { JRE: after, UNILAND: createWorkingHoursDraft('UNILAND') },
    nightShifts: { JRE: night, UNILAND: createNightShiftDraft('UNILAND') },
  };
  daily.rows[4].end[1] = '1010,';
  const saved = await call('/api/drafts', { actor, body: { workspace, baseVersion: 0 } });
  assert.equal(saved.status, 200);
  for (const collection of ['drafts', 'workingHours', 'nightShifts'])
    for (const legacy of [layout2Draft, layout3JreDraft, layout4JreDraft, layout5JreDraft]) {
      const old = structuredClone(workspace);
      old[collection].JRE = legacy(old[collection].JRE);
      const rejected = await call('/api/drafts', {
        actor,
        body: { workspace: old, baseVersion: saved.value.version },
      });
      assert.equal(rejected.status, 409);
      assert.equal(rejected.value.error, 'DRAFT_FORMAT_CHANGED');
      const report = await call('/api/reports', { actor, body: { draft: old[collection].JRE } });
      assert.equal(report.status, 409);
      assert.equal(report.value.error, 'METER_LAYOUT_CHANGED');
    }
  const kept = (await call('/api/drafts', { actor })).value;
  assert.equal(kept.version, saved.value.version);
  assert.equal(kept.workspace.drafts.JRE.rows[4].end[1], '1010,');
  assert.equal(kept.workspace.workingHours.JRE.rows[29].end[0], '1004');
  assert.equal(kept.workspace.nightShifts.JRE.rows[29].start[0], '1004');
  assert.equal(kept.workspace.drafts.JRE.rows[15].end[2], '2000');
});

test('JRE report API stores raw Piping meter 3 while recalculating net Window and Piping output', async () => {
  const actor = await login(await seed());
  for (const [i, draft] of reportPeriods('JRE').entries()) {
    const response = await call('/api/reports', { actor, body: { draft, totalEnergy: 999999 } });
    assert.equal(response.status, 201);
    const loaded = await call(
      '/api/reports?id=' + response.value.id + '&kind=' + (draft.periodKind || 'daily'),
      { actor },
    );
    assert.equal(loaded.status, 200);
    const saved = loaded.value.snapshot;
    assert.equal(saved.draft.meterLayout, 6);
    assert.deepEqual(saved.draft.rows[15], draft.rows[15]);
    assert.match(
      saved.output.reportText,
      new RegExp('16\\. Piping Building 1#: ' + [1010, 404, 606][i] + '\\.00 kWh'),
    );
    assert.match(
      saved.output.reportText,
      new RegExp('4\\. Window: ' + [3010, 1204, 1806][i] + '\\.00 kWh'),
    );
    assert.match(
      saved.output.reportText,
      new RegExp('20\\. Structural Laboratory: ' + [600, 240, 360][i] + '\\.00 kWh'),
    );
  }
});

test('JRE report API recalculates Building 2 from exact scaled components, preserving raw observations and saved revisions', async () => {
  const actor = await login(await seed());
  for (const [index, draft] of reportPeriods('JRE').entries()) {
    const response = await call('/api/reports', {
      actor,
      body: { draft, totalEnergy: 999999, engineVersion: '0.11.6-alpha' },
    });
    assert.equal(response.status, 201);
    const url = '/api/reports?id=' + response.value.id + '&kind=' + (draft.periodKind || 'daily');
    const loaded = await call(url, { actor });
    assert.equal(loaded.status, 200);
    const saved = loaded.value.snapshot;
    assert.deepEqual(saved.draft.rows[18], draft.rows[18]);
    assert.deepEqual(saved.draft.rows[5], draft.rows[5]);
    assert.deepEqual(saved.draft.rows[10], draft.rows[10]);
    assert.match(
      saved.output.reportText,
      new RegExp('19\\. Electricity Building 2#: ' + [950, 380, 570][index] + '\\.00 kWh'),
    );
    assert.deepEqual(saved.draft.rows[30], draft.rows[30]);
    const graph = await call(
      '/api/graphs?plant=JRE&start=2026-09-01&end=2026-09-30&kind=' + (draft.periodKind || 'daily'),
      { actor },
    );
    assert.equal(graph.value.records[0].values.r30, [10, 4, 6][index]);
    for (const source of [5, 10, 30]) {
      const invalid = structuredClone(draft);
      invalid.rows[source].end[0] = '';
      const rejected = await call('/api/reports', {
        actor,
        body: { draft: invalid, id: response.value.id, baseRevision: 1 },
      });
      assert.equal(rejected.status, 422);
      assert.equal(rejected.value.error, 'INCOMPLETE_REPORT');
    }
    const kept = await call(url, { actor });
    assert.equal(kept.value.revision, 1);
    assert.deepEqual(kept.value.snapshot, saved);
  }
});

test('Structural zero rule is enforced by the server in every period without replacing raw observations or saved revisions', async () => {
  const actor = await login(await seed());
  for (const [index, draft] of reportPeriods('JRE').entries()) {
    draft.rows[19].start[0] = index === 2 ? '1004' : '1000';
    draft.rows[19].end[0] = index === 1 ? '1004' : '1010';
    const raw = structuredClone(draft),
      kind = draft.periodKind || 'daily';
    const response = await call('/api/reports', { actor, body: { draft, totalEnergy: 999999 } });
    assert.equal(response.status, 201);
    const url = '/api/reports?id=' + response.value.id + '&kind=' + kind;
    const saved = (await call(url, { actor })).value.snapshot;
    assert.deepEqual(saved.draft.rows[19], raw.rows[19]);
    assert.deepEqual(saved.draft.rows[15], raw.rows[15]);
    assert.match(saved.output.reportText, /20\. Structural Laboratory: 0 kWh/);
    assert.match(saved.output.worksheetText, /^Structural: 0$/m);
    assert.doesNotMatch(saved.output.reportText, /included Piping Building 1# usage exceeds/);
    const graph = await call('/api/graphs?plant=JRE&start=2026-09-01&end=2026-09-30&kind=' + kind, {
      actor,
    });
    assert.equal(graph.status, 200);
    assert.equal(graph.value.records[0].values.w11, 0);
    for (const row of [15, 19]) {
      const invalid = structuredClone(draft);
      invalid.rows[row].end[0] = '';
      const rejected = await call('/api/reports', {
        actor,
        body: { draft: invalid, id: response.value.id, baseRevision: 1 },
      });
      assert.equal(rejected.status, 422);
      assert.equal(rejected.value.error, 'INCOMPLETE_REPORT');
    }
    const kept = (await call(url, { actor })).value;
    assert.equal(kept.revision, 1);
    assert.deepEqual(kept.snapshot, saved);
  }
});

test('each plant saves shift gas, refill observations, Water and manual totals with server-owned calculations and immutable revisions', async () => {
  const actor = await login(await seed());
  for (const plant of ['JRE', 'UNILAND'])
    for (const draft of utilityPeriods(plant).slice(1)) {
      draft.gas.entries[0].refills = [
        { before: { reading: '60', temperature: '' }, after: { reading: '75', temperature: '' } },
      ];
      const raw = structuredClone(draft),
        expected = calculateDraft(draft);
      const response = await call('/api/reports', {
        actor,
        body: { draft, totalEnergy: 999999, gas: { kg: 999999 } },
      });
      assert.equal(response.status, 201);
      const url = '/api/reports?id=' + response.value.id + '&kind=' + draft.periodKind;
      const first = (await call(url, { actor })).value.snapshot;
      assert.deepEqual(first.draft.gas, raw.gas);
      assert.deepEqual(first.draft.water, raw.water);
      assert.deepEqual(first.draft.utilities, raw.utilities);
      assert.equal(first.draft.utilityLayout, 1);
      assert.equal(first.output.reportText, expected.reportSectionText);
      assert.equal(first.output.gas[0].kg, expected.gasResults[0].kg);
      const graph = await call(
        '/api/graphs?plant=' + plant + '&start=2026-09-01&end=2026-09-30&kind=' + draft.periodKind,
        { actor },
      );
      assert.equal(graph.status, 200);
      assert.equal(graph.value.records[0].values.u4, Number(expected.waterResult.value));
      draft.water.end = String(Number(draft.water.end) + 1);
      const revised = await call('/api/reports', {
        actor,
        body: { id: response.value.id, baseRevision: 1, draft },
      });
      assert.equal(revised.status, 200);
      assert.equal(revised.value.revision, 2);
      const original = (await call(url + '&revision=1', { actor })).value.snapshot;
      assert.deepEqual(original, first);
      draft.gas.entries[3].end.temperature = '';
      const invalid = await call('/api/reports', {
        actor,
        body: { id: response.value.id, baseRevision: 2, draft },
      });
      assert.equal(invalid.status, 422);
      assert.equal((await call(url, { actor })).value.revision, 2);
    }
});

test('shift utility markers and migration guards prevent stale clients and rollback writers from discarding new records', async () => {
  const actor = await login(await seed()),
    j = utilityPeriods(),
    u = utilityPeriods('UNILAND');
  const workspace = {
    version: 4,
    drafts: { JRE: j[0], UNILAND: u[0] },
    workingHours: { JRE: j[1], UNILAND: u[1] },
    nightShifts: { JRE: j[2], UNILAND: u[2] },
  };
  const saved = await call('/api/drafts', { actor, body: { workspace, baseVersion: 0 } });
  assert.equal(saved.status, 200);
  for (const collection of ['workingHours', 'nightShifts']) {
    const old = structuredClone(workspace);
    delete old[collection].JRE.utilityLayout;
    old[collection].JRE.gas.entries[0].refills = [];
    const rejected = await call('/api/drafts', {
      actor,
      body: { workspace: old, baseVersion: saved.value.version },
    });
    assert.equal(rejected.status, 409);
    assert.equal(rejected.value.error, 'DRAFT_FORMAT_CHANGED');
    await assert.rejects(
      runtime.query('UPDATE meter_app.working_drafts SET workspace=$2::jsonb WHERE owner_id=$1', [
        actor.id,
        JSON.stringify(old),
      ]),
      (e) => e.code === '23514',
    );
  }
  const raw = structuredClone(j[1]);
  delete raw.utilityLayout;
  assert.equal((await call('/api/reports', { actor, body: { draft: raw } })).status, 409);
  const report = await call('/api/reports', { actor, body: { draft: j[1] } });
  assert.equal(report.status, 201);
  const oldSnapshot = structuredClone(report.value.snapshot);
  delete oldSnapshot.draft.utilityLayout;
  await assert.rejects(
    runtime.query(
      'INSERT INTO meter_app.report_revisions(report_id,revision,actor_id,snapshot) VALUES($1,2,$2,$3::jsonb)',
      [report.value.id, actor.id, JSON.stringify(oldSnapshot)],
    ),
    (e) => e.code === '23514',
  );
  const kept = await call('/api/reports?id=' + report.value.id + '&kind=workingHours', { actor });
  assert.equal(kept.value.revision, 1);
  assert.deepEqual(kept.value.snapshot, report.value.snapshot);
  assert.equal((await call('/api/drafts', { actor })).value.version, saved.value.version);
});
async function autosaveActor() {
  const user = await seed();
  const token = await issueSession(db, { id: user.id, auth_version: 1 });
  return { ...user, cookie: sessionCookie(origin, token).split(';')[0] };
}
function autosaveWorkspace(draft) {
  const workspace = {
    version: 4,
    autosaveLayout: 1,
    drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') },
    workingHours: emptyWorkingHours(),
    nightShifts: emptyNightShifts(),
  };
  const collection =
    draft.periodKind === 'workingHours'
      ? 'workingHours'
      : draft.periodKind === 'nightShift'
        ? 'nightShifts'
        : 'drafts';
  workspace[collection][draft.plantKey] = structuredClone(draft);
  return workspace;
}
function partialPeriod(date = '2026-11-10') {
  const draft = createDraft('JRE', date, date === '2026-11-10' ? '2026-11-11' : '2026-11-12');
  draft.rows[0].start[0] = '100';
  draft.rows[0].end[0] = '125';
  return draft;
}

test('JRE R32 kg persists with units and rejects stale clients and rollback writers without changing raw data or checkpoints', async () => {
  const actor = await autosaveActor(),
    draft = exampleDraft('JRE');
  draft.gas.entries[3] = {
    enabled: true,
    start: { reading: '1500.125', temperature: '', unit: 'kg' },
    end: { reading: '1200.025', temperature: '', unit: 'kg' },
    refills: [],
  };
  const workspace = autosaveWorkspace(draft);
  const saved = await call('/api/drafts', { actor, body: { workspace, baseVersion: 0 } });
  assert.equal(saved.status, 200);
  const key = ['JRE', 'daily', draft.startDate, draft.endDate].join(':');
  const stored = await call('/api/drafts?period=' + encodeURIComponent(key), { actor });
  assert.equal(stored.status, 200);
  assert.deepEqual(stored.value.draft.gas.entries[3], draft.gas.entries[3]);
  const missingUnit = structuredClone(workspace);
  delete missingUnit.drafts.JRE.gas.entries[3].end.unit;
  const malformed = await call('/api/drafts', {
    actor,
    body: { workspace: missingUnit, baseVersion: saved.value.version },
  });
  assert.equal(malformed.status, 400);
  const downgrade = (value) => {
    const old = structuredClone(value);
    old.version = GAS_TABLE_VERSION;
    for (const point of [
      old.entries[3].start,
      old.entries[3].end,
      ...old.entries[3].refills.flatMap((e) => [e.before, e.after]),
    ])
      delete point.unit;
    return old;
  };
  const oldWorkspace = structuredClone(workspace);
  oldWorkspace.drafts.JRE.gas = downgrade(draft.gas);
  const rejected = await call('/api/drafts', {
    actor,
    body: { workspace: oldWorkspace, baseVersion: saved.value.version },
  });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.value.error, 'DRAFT_FORMAT_CHANGED');
  await assert.rejects(
    runtime.query('UPDATE meter_app.working_drafts SET workspace=$2::jsonb WHERE owner_id=$1', [
      actor.id,
      JSON.stringify(oldWorkspace),
    ]),
    (e) => e.code === '23514',
  );
  const row = (
    await db.query(
      'SELECT snapshot FROM meter_app.period_autosaves WHERE owner_id=$1 AND plant=$2 AND start_date=$3',
      [actor.id, 'JRE', draft.startDate],
    )
  ).rows[0];
  const oldSnapshot = structuredClone(row.snapshot);
  oldSnapshot.draft.gas = downgrade(oldSnapshot.draft.gas);
  await assert.rejects(
    runtime.query('UPDATE meter_app.period_autosaves SET snapshot=$2::jsonb WHERE owner_id=$1', [
      actor.id,
      JSON.stringify(oldSnapshot),
    ]),
    (e) => e.code === '23514',
  );
  const report = await call('/api/reports', {
    actor,
    body: { draft, autosaveLayout: 1, baseRevision: 0, workspaceVersion: saved.value.version },
  });
  assert.equal(report.status, 201);
  assert.equal(report.value.snapshot.draft.gas.version, JRE_GAS_INPUT_VERSION);
  assert.equal(report.value.snapshot.output.gas.find((g) => g.gas === 'R32').kg, 300.1);
  const oldCheckpoint = structuredClone(report.value.snapshot);
  oldCheckpoint.draft.gas = downgrade(oldCheckpoint.draft.gas);
  await assert.rejects(
    runtime.query(
      'INSERT INTO meter_app.report_revisions(report_id,revision,actor_id,snapshot) VALUES($1,2,$2,$3::jsonb)',
      [report.value.id, actor.id, JSON.stringify(oldCheckpoint)],
    ),
    (e) => e.code === '23514',
  );
  const staleDraft = structuredClone(draft);
  staleDraft.gas = downgrade(draft.gas);
  const active = await call('/api/drafts', { actor });
  const queued = await call('/api/drafts', {
    actor,
    body: {
      workspace: autosaveWorkspace(partialPeriod()),
      periods: [staleDraft],
      baseVersion: active.value.version,
    },
  });
  assert.equal(queued.status, 409);
  assert.equal(queued.value.error, 'DRAFT_FORMAT_CHANGED');
  const cleared = await call('/api/drafts', {
    actor,
    body: { workspace: null, baseVersion: active.value.version },
  });
  assert.equal(cleared.status, 200);
  const afterClear = await call('/api/drafts', {
    actor,
    body: { workspace: oldWorkspace, baseVersion: cleared.value.version },
  });
  assert.equal(afterClear.status, 409);
  assert.equal(afterClear.value.error, 'DRAFT_FORMAT_CHANGED');
  await assert.rejects(
    runtime.query('UPDATE meter_app.working_drafts SET workspace=$2::jsonb WHERE owner_id=$1', [
      actor.id,
      JSON.stringify(oldWorkspace),
    ]),
    (e) => e.code === '23514',
  );
  const kept = await call('/api/reports?id=' + report.value.id, { actor });
  assert.deepEqual(kept.value.snapshot, report.value.snapshot);
  const keptRaw = await call('/api/drafts?period=' + encodeURIComponent(key), { actor });
  assert.deepEqual(keptRaw.value.draft.gas.entries[3], draft.gas.entries[3]);
});
test('partial autosaves appear as Revision 1 in history and monitoring before a manual checkpoint', async () => {
  const actor = await autosaveActor(),
    draft = partialPeriod(),
    workspace = autosaveWorkspace(draft);
  const saved = await call('/api/drafts', {
    actor,
    body: { workspace, baseVersion: 0, periods: [] },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.value.records.length, 1);
  const record = saved.value.records[0];
  assert.equal(record.revision, 1);
  assert.equal(record.checkpointRevision, 0);
  assert.equal(record.complete, false);
  const list = await call('/api/reports?plant=JRE', { actor });
  assert.equal(list.value.reports.length, 1);
  assert.equal(list.value.reports[0].revision, 1);
  assert.equal(list.value.reports[0].autosaved, true);
  const detail = await call('/api/reports?id=' + record.id, { actor });
  assert.equal(detail.value.snapshot.draft.rows[0].end[0], '125');
  assert.equal(detail.value.checkpointRevision, 0);
  const graph = await call('/api/graphs?plant=JRE&start=2026-11-01&end=2026-11-30', { actor });
  assert.equal(graph.value.records[0].values.r0, 25);
  assert.equal(graph.value.records[0].values.w0, null);
  assert.equal(graph.value.records[0].autosaved, true);
  assert.equal(
    (
      await db.query('SELECT count(*)::int AS n FROM meter_app.reports WHERE owner_id=$1', [
        actor.id,
      ])
    ).rows[0].n,
    0,
  );
  const other = await autosaveActor();
  assert.equal((await call('/api/reports?id=' + record.id, { actor: other })).status, 404);
  assert.equal(
    (await call('/api/graphs?plant=JRE&start=2026-11-01&end=2026-11-30', { actor: other })).value
      .records.length,
    0,
  );
});
test('manual checkpoints deduplicate repeated saves while later autosaves retain immutable revisions', async () => {
  const actor = await autosaveActor(),
    draft = partialPeriod(),
    workspace = autosaveWorkspace(draft);
  let saved = await call('/api/drafts', {
    actor,
    body: { workspace, baseVersion: 0, periods: [] },
  });
  let manual = await call('/api/reports', {
    actor,
    body: { autosaveLayout: 1, draft, baseRevision: 0, workspaceVersion: saved.value.version },
  });
  assert.equal(manual.status, 201);
  assert.equal(manual.value.revision, 1);
  assert.equal(manual.value.snapshot.complete, false);
  const first = structuredClone(manual.value.snapshot),
    id = manual.value.id;
  const repeated = await call('/api/reports', {
    actor,
    body: {
      autosaveLayout: 1,
      draft,
      id,
      baseRevision: 1,
      workspaceVersion: manual.value.workspaceVersion,
    },
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.value.unchanged, true);
  assert.equal(repeated.value.revision, 1);
  // A retry after a lost response is content-idempotent even with the original token.
  const lost = await call('/api/reports', {
    actor,
    body: { autosaveLayout: 1, draft, baseRevision: 0, workspaceVersion: saved.value.version },
  });
  assert.equal(lost.value.unchanged, true);
  assert.equal(lost.value.revision, 1);
  draft.rows[0].end[0] = '135';
  const next = structuredClone(manual.value.workspace);
  next.drafts.JRE = draft;
  saved = await call('/api/drafts', {
    actor,
    body: { workspace: next, baseVersion: manual.value.workspaceVersion, periods: [] },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.value.records[0].revision, 1);
  const current = await call('/api/reports?id=' + id, { actor });
  assert.equal(current.value.snapshot.draft.rows[0].end[0], '135');
  const frozen = await call('/api/reports?id=' + id + '&revision=1', { actor });
  assert.deepEqual(frozen.value.snapshot, first);
  manual = await call('/api/reports', {
    actor,
    body: { autosaveLayout: 1, id, draft, baseRevision: 1, workspaceVersion: saved.value.version },
  });
  assert.equal(manual.status, 200);
  assert.equal(manual.value.revision, 2);
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM meter_app.report_revisions WHERE report_id=$1',
        [id],
      )
    ).rows[0].n,
    2,
  );
  assert.deepEqual(
    (await call('/api/reports?id=' + id + '&revision=1', { actor })).value.snapshot,
    first,
  );
});
test('period journal commits atomically, retries without rewriting, and rejects stale overwrites', async () => {
  const actor = await autosaveActor(),
    old = partialPeriod(),
    workspace = autosaveWorkspace(old);
  const initial = await call('/api/drafts', {
    actor,
    body: { workspace, baseVersion: 0, periods: [] },
  });
  old.rows[0].end[0] = '129';
  const next = partialPeriod('2026-11-11');
  next.rows[0].end[0] = '107';
  const request = {
    workspace: autosaveWorkspace(next),
    baseVersion: initial.value.version,
    periods: [old],
  };
  const saved = await call('/api/drafts', { actor, body: request });
  assert.equal(saved.status, 200);
  const retried = await call('/api/drafts', { actor, body: request });
  assert.equal(retried.status, 200);
  assert.equal(retried.value.unchanged, true);
  assert.equal(retried.value.updated_at, saved.value.updated_at);
  const graph = await call('/api/graphs?plant=JRE&start=2026-11-01&end=2026-11-30', { actor });
  assert.deepEqual(
    graph.value.records.map((r) => r.values.r0),
    [29, 7],
  );
  const conflicting = structuredClone(request);
  conflicting.periods[0].rows[0].end[0] = '999';
  assert.equal((await call('/api/drafts', { actor, body: conflicting })).status, 409);
  const after = await call('/api/graphs?plant=JRE&start=2026-11-01&end=2026-11-30', { actor });
  assert.deepEqual(
    after.value.records.map((r) => r.values.r0),
    [29, 7],
  );
  const malformed = structuredClone(request);
  malformed.baseVersion = saved.value.version;
  malformed.periods[0].rows = [];
  assert.equal((await call('/api/drafts', { actor, body: malformed })).status, 400);
  assert.equal((await call('/api/drafts', { actor })).value.version, saved.value.version);
});
test('concurrent identical manual checkpoints create one revision and older writers cannot erase adopted data', async () => {
  const actor = await autosaveActor(),
    draft = partialPeriod(),
    workspace = autosaveWorkspace(draft);
  const saved = await call('/api/drafts', {
    actor,
    body: { workspace, baseVersion: 0, periods: [] },
  });
  const body = { autosaveLayout: 1, draft, baseRevision: 0, workspaceVersion: saved.value.version };
  const results = await Promise.all([
    call('/api/reports', { actor, body }),
    call('/api/reports', { actor, body }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
  assert.ok(results.some((r) => r.value.unchanged));
  const id = results[0].value.id;
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM meter_app.report_revisions WHERE report_id=$1',
        [id],
      )
    ).rows[0].n,
    1,
  );
  const legacy = structuredClone(workspace);
  delete legacy.autosaveLayout;
  assert.equal(
    (await call('/api/drafts', { actor, body: { workspace: legacy, baseVersion: 2 } })).status,
    409,
  );
  await assert.rejects(
    db.query('UPDATE meter_app.working_drafts SET workspace=$2 WHERE owner_id=$1', [
      actor.id,
      JSON.stringify(legacy),
    ]),
    (error) => error.code === '23514',
  );
  const changed = structuredClone(draft);
  changed.rows[0].end[0] = '140';
  assert.equal(
    (await call('/api/reports', { actor, body: { id, baseRevision: 1, draft: changed } })).status,
    409,
  );
});

test('manual checkpoints after an active-draft tombstone require recreation instead of failing with a server error', async () => {
  const actor = await autosaveActor(),
    draft = partialPeriod();
  const deleted = await call('/api/drafts', { actor, body: { workspace: null, baseVersion: 0 } });
  assert.equal(deleted.status, 200);
  const body = {
    autosaveLayout: 1,
    draft,
    baseRevision: 0,
    workspaceVersion: deleted.value.version,
  };
  const blocked = await call('/api/reports', { actor, body });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.value.error, 'DRAFT_CONFLICT');
  const restored = await call('/api/drafts', {
    actor,
    body: { workspace: autosaveWorkspace(draft), baseVersion: deleted.value.version },
  });
  assert.equal(restored.status, 200);
  const report = await call('/api/reports', {
    actor,
    body: { ...body, workspaceVersion: restored.value.version },
  });
  assert.equal(report.status, 201);
  assert.equal(report.value.revision, 1);
});

test('JRE Warehouse Lighting API uses the report-date cutoff, recalculates net usage and preserves raw history', async () => {
  const actor = await login(await seed());
  for (const date of ['2026-10-24', '2026-10-25'])
    for (const [i, draft] of reportPeriods('JRE', date).entries()) {
      draft.rows[25].start = [['1000', '1000', '1008'][i]];
      draft.rows[25].end = [['1020', '1008', '1020'][i]];
      draft.rows[31].start = [date === '2026-10-24' ? '0' : ['10', '10', '11.5'][i]];
      draft.rows[31].end = [
        date === '2026-10-24' ? (i === 1 ? '0' : '10') : ['14', '11.5', '14'][i],
      ];
      const response = await call('/api/reports', { actor, body: { draft, totalEnergy: 999999 } });
      assert.equal(response.status, 201);
      const kind = draft.periodKind || 'daily';
      const saved = (
        await call('/api/reports?id=' + response.value.id + '&kind=' + kind, { actor })
      ).value.snapshot;
      const light = date === '2026-10-24' ? 0 : [160, 60, 100][i],
        net = [800, 320, 480][i] - light;
      assert.deepEqual(saved.draft.rows[31], draft.rows[31]);
      assert.match(
        saved.output.reportText,
        new RegExp('32\\. Warehouse Lighting: ' + (light ? light.toFixed(2) : '0') + ' kWh'),
      );
      assert.match(
        saved.output.reportText,
        new RegExp('26\\. Warehouse Area: ' + net.toFixed(2) + ' kWh'),
      );
      const graphs = await call(
        '/api/graphs?plant=JRE&start=' + date + '&end=' + date + '&kind=' + kind,
        { actor },
      );
      assert.equal(graphs.status, 200);
      assert.equal(graphs.value.records[0].values.r31, light);
      assert.equal(graphs.value.records[0].values.w15, net);
    }
});

test('stale queued JRE autosaves cannot erase Warehouse Lighting outside the active period', async () => {
  const actor = await autosaveActor(),
    archived = reportPeriods('JRE', '2026-10-25')[0],
    active = createDraft('JRE', '2026-10-27', '2026-10-28');
  archived.rows[25].start = ['1000'];
  archived.rows[25].end = ['1020'];
  archived.rows[31].start = ['10'];
  archived.rows[31].end = ['14'];
  const workspace = autosaveWorkspace(active);
  const saved = await call('/api/drafts', {
    actor,
    body: { workspace, baseVersion: 0, periods: [archived] },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.value.records.length, 1);
  const record = saved.value.records[0],
    before = (await call('/api/reports?id=' + record.id, { actor })).value;
  assert.deepEqual(before.snapshot.draft.rows[31], archived.rows[31]);
  const blocked = await call('/api/drafts', {
    actor,
    body: {
      workspace,
      baseVersion: saved.value.version,
      periods: [layout5JreDraft(archived)],
    },
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.value.error, 'DRAFT_FORMAT_CHANGED');
  const after = await call('/api/reports?id=' + record.id, { actor });
  assert.deepEqual(after.value.snapshot, before.snapshot);
  assert.equal((await call('/api/drafts', { actor })).value.version, saved.value.version);
  const graph = await call('/api/graphs?plant=JRE&start=2026-10-25&end=2026-10-25', { actor });
  assert.equal(graph.status, 200);
  assert.equal(graph.value.records[0].values.r31, 160);
  assert.equal(graph.value.records[0].values.w15, 640);
});

test('monitoring can read explicit checkpoints without silently restoring or merging a cleared working copy', async () => {
  for (const kind of ['daily', 'workingHours', 'nightShift']) {
    const actor = await autosaveActor(),
      draft = partialPeriod();
    if (kind !== 'daily')
      Object.assign(draft, {
        periodKind: kind,
        utilityLayout: 1,
        startTime: kind === 'nightShift' ? '17:00' : '08:00',
        endTime: kind === 'nightShift' ? '08:00' : '17:00',
        endDate: kind === 'nightShift' ? '2026-11-11' : '2026-11-10',
      });
    let saved = await call('/api/drafts', {
      actor,
      body: { workspace: autosaveWorkspace(draft), baseVersion: 0, periods: [] },
    });
    const manual = await call('/api/reports', {
      actor,
      body: { autosaveLayout: 1, draft, baseRevision: 0, workspaceVersion: saved.value.version },
    });
    assert.equal(manual.status, 201);
    draft.rows[0].start[0] = '';
    saved = await call('/api/drafts', {
      actor,
      body: {
        workspace: autosaveWorkspace(draft),
        baseVersion: manual.value.workspaceVersion,
        periods: [],
      },
    });
    assert.equal(saved.status, 200);
    const query = '/api/graphs?plant=JRE&start=2026-11-01&end=2026-11-30&kind=' + kind;
    const working = await call(query, { actor });
    assert.equal(working.value.records[0].values.r0, null);
    assert.equal(working.value.records[0].checkpointRevision, 1);
    const checkpoint = await call(query + '&view=checkpoint', { actor });
    assert.equal(checkpoint.status, 200);
    assert.equal(checkpoint.value.view, 'checkpoint');
    assert.equal(checkpoint.value.records[0].values.r0, 25);
    assert.equal(checkpoint.value.records[0].source, 'report');
    assert.equal(checkpoint.value.records[0].autosaved, undefined);
    assert.equal((await call(query + '&view=not-a-view', { actor })).status, 400);
    const peer = await autosaveActor();
    assert.equal((await call(query + '&view=checkpoint', { actor: peer })).value.records.length, 0);
    const stillWorking = await call('/api/reports?id=' + manual.value.id + '&kind=' + kind, {
      actor,
    });
    assert.equal(stillWorking.value.snapshot.draft.rows[0].start[0], '');
    const frozen = await call(
      '/api/reports?id=' + manual.value.id + '&kind=' + kind + '&revision=1',
      { actor },
    );
    assert.deepEqual(frozen.value.snapshot, manual.value.snapshot);
  }
});

test('period navigation reads owner data before replacing an archived document and rejects unloaded blanks', async () => {
  for (const kind of ['daily', 'workingHours', 'nightShift']) {
    const actor = await autosaveActor(),
      draft = partialPeriod();
    if (kind !== 'daily')
      Object.assign(draft, {
        periodKind: kind,
        utilityLayout: 1,
        startTime: kind === 'nightShift' ? '17:00' : '08:00',
        endTime: kind === 'nightShift' ? '08:00' : '17:00',
        endDate: kind === 'nightShift' ? '2026-11-11' : '2026-11-10',
      });
    let saved = await call('/api/drafts', {
      actor,
      body: { workspace: autosaveWorkspace(draft), baseVersion: 0, periods: [] },
    });
    assert.equal(saved.status, 200);
    const query =
      '/api/drafts?period=' +
      encodeURIComponent(['JRE', kind, draft.startDate, draft.endDate].join(':'));
    const before = await call(query, { actor });
    assert.equal(before.status, 200);
    const elsewhere = structuredClone(draft);
    elsewhere.startDate = '2026-11-20';
    elsewhere.endDate = kind === 'workingHours' ? '2026-11-20' : '2026-11-21';
    saved = await call('/api/drafts', {
      actor,
      body: {
        workspace: autosaveWorkspace(elsewhere),
        baseVersion: saved.value.version,
        periods: [],
      },
    });
    assert.equal(saved.status, 200);
    const blank = structuredClone(draft);
    blank.rows[0].start[0] = '';
    const rejected = await call('/api/drafts', {
      actor,
      body: { workspace: autosaveWorkspace(blank), baseVersion: saved.value.version, periods: [] },
    });
    assert.equal(rejected.status, 409);
    assert.deepEqual((await call(query, { actor })).value.draft, before.value.draft);
    const key = ['JRE', kind, draft.startDate, draft.endDate].join(':');
    const deliberate = await call('/api/drafts', {
      actor,
      body: {
        workspace: autosaveWorkspace(blank),
        baseVersion: saved.value.version,
        periods: [],
        periodVersions: { [key]: before.value.version },
      },
    });
    assert.equal(deliberate.status, 200);
    const peer = await autosaveActor();
    assert.equal((await call(query, { actor: peer })).value.draft, null);
    assert.equal(
      (await call('/api/drafts?period=JRE%3Adaily%3A2026-02-30%3A2026-03-01', { actor })).status,
      400,
    );
  }
});
