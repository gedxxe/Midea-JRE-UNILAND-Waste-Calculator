import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIotEvent as validateEvent } from '../iot-contract.js';
import { iotCloudEndpoint, iotNodeConfig, IOT_NODE_PROFILES } from '../iot-contract.js';
import { validateIotHeartbeat, iotPresence } from '../iot-contract.js';
const validateIotEvent = (value) => validateEvent(value, Date.parse('2026-11-05T02:00:00Z'));
import { iotIngestHandler, iotDevicesHandler } from '../server/iot.js';
const event = () => ({
  schema_version: 1,
  event_id: 'sample_1',
  device_id: 'test_device',
  meter_id: 'meter_1',
  meter_profile: 'fort',
  event_type: 'checkpoint',
  captured_at: '2026-11-05T01:00:02Z',
  started_at: '2026-11-05T01:00:01Z',
  scheduled_at: '2026-11-05T01:00:00Z',
  quality: 'valid',
  readings: { active_energy_kwh: '123.000001' },
});
test('heartbeat has no measurement, event identity or device-clock dependency and rejects extra fields', () => {
  const beat = {
    schema_version: 1,
    event_type: 'heartbeat',
    device_id: 'test_device',
    meter_id: 'meter_1',
    meter_profile: 'fort',
  };
  assert.deepEqual(validateIotHeartbeat(beat), beat);
  assert.deepEqual(validateIotHeartbeat(Object.fromEntries(Object.entries(beat).reverse())), beat);
  assert.throws(() => validateIotEvent(beat));
  for (const patch of [
    { readings: {} },
    { readings: { active_energy_kwh: '0' } },
    { event_id: 'not_a_reading' },
    { captured_at: '2026-11-05T01:00:00Z' },
    { schema_version: 2 },
    { event_type: 'telemetry' },
    { device_id: '../bad' },
    { meter_id: null },
    { meter_profile: '' },
    { owner_id: 'forged' },
  ])
    assert.throws(() => validateIotHeartbeat({ ...beat, ...patch }));
  for (const bad of [null, [], 'heartbeat', false]) assert.throws(() => validateIotHeartbeat(bad));
});

test('presence uses server receipt freshness, expires at three minutes and never infers Modbus health', () => {
  const now = Date.parse('2026-11-05T02:00:00Z');
  const device = { active: true, last_received_at: '2026-11-05T01:57:01Z' };
  assert.equal(iotPresence(device, now), 'connected');
  assert.equal(iotPresence(device, now + 1000), 'offline');
  assert.equal(iotPresence({ ...device, last_received_at: null }, now), 'unknown');
  assert.equal(iotPresence({ ...device, last_received_at: 'invalid' }, now), 'unknown');
  assert.equal(
    iotPresence({ ...device, last_received_at: '2026-11-05T02:00:01Z' }, now),
    'unknown',
  );
  assert.equal(iotPresence(device, NaN), 'unknown');
  assert.equal(iotPresence({ ...device, active: false }, now), 'disabled');
});
test('IoT preserves exact primary kWh and validates firmware capture windows without changing input', () => {
  const e = event(),
    copy = structuredClone(e);
  assert.equal(validateIotEvent(e).readings.active_energy_kwh, '123.000001');
  assert.deepEqual(e, copy);
  const reversed = Object.fromEntries(Object.entries(e).reverse());
  assert.equal(JSON.stringify(validateIotEvent(e)), JSON.stringify(validateIotEvent(reversed)));
  for (const patch of [
    { captured_at: '2026-11-05T01:00:06Z' },
    { started_at: '2026-11-05T00:59:59Z' },
    { scheduled_at: '2026-11-05T01:01:00Z' },
    { quality: 'missed' },
    { quality: 'invalid' },
    { readings: { active_energy_kwh: 123 } },
    { readings: { active_energy_kwh: '' } },
    { readings: { active_energy_kwh: 'NaN' } },
    { device_id: '../evil' },
    { owner_id: 'forged' },
    { captured_at: '2026-02-30T01:00:00Z' },
  ])
    assert.throws(() => validateIotEvent({ ...e, ...patch }));
  const telemetry = { ...e, event_type: 'telemetry' };
  delete telemetry.started_at;
  delete telemetry.scheduled_at;
  assert.equal(validateIotEvent(telemetry).event_type, 'telemetry');
  assert.throws(() => validateIotEvent({ ...telemetry, started_at: e.started_at }));
});
test('device ingestion fails closed before database access when disabled or unauthenticated', async () => {
  for (const [env, req, status] of [
    [{}, { method: 'POST', headers: {} }, 503],
    [{ IOT_ENABLED: '1' }, { method: 'GET', headers: {} }, 405],
    [
      { IOT_ENABLED: '1' },
      { method: 'POST', headers: { cookie: 'synthetic-browser-session' } },
      401,
    ],
  ]) {
    let called = false;
    const res = {
      setHeader() {},
      end(body) {
        this.body = JSON.parse(body);
      },
    };
    await iotIngestHandler(() => {
      called = true;
      throw Error('must not connect');
    }, env)(req, res);
    assert.equal(res.statusCode, status);
    assert.equal(called, false);
  }
});

test('IoT current remains optional and exact, with explicit phases and stable retry serialization', () => {
  const e = event();
  const readings = {
    current_l3_a: '0',
    current_l1_a: '12.000001',
    active_energy_kwh: '123.000001',
    current_l2_a: '11.4',
  };
  const normalized = validateIotEvent({ ...e, readings });
  assert.deepEqual(normalized.readings, {
    active_energy_kwh: '123.000001',
    current_l1_a: '12.000001',
    current_l2_a: '11.4',
    current_l3_a: '0',
  });
  assert.equal(
    JSON.stringify(normalized),
    JSON.stringify(
      validateIotEvent({ ...e, readings: Object.fromEntries(Object.entries(readings).reverse()) }),
    ),
  );
  assert.equal(
    validateIotEvent({ ...e, readings: { active_energy_kwh: '123', current_a: '0.000001' } })
      .readings.current_a,
    '0.000001',
  );
  assert.deepEqual(validateIotEvent(e).readings, e.readings);
  for (const patch of [
    { current_a: 12 },
    { current_a: '' },
    { current_a: '-1' },
    { current_a: null },
    { voltage_v: '220' },
    { current_a: '1', current_l1_a: '1' },
  ])
    assert.throws(() => validateIotEvent({ ...e, readings: { ...e.readings, ...patch } }));
});

test('device management rejects unsupported methods before connecting', async () => {
  const res = {
    setHeader() {},
    end(body) {
      this.body = JSON.parse(body);
    },
  };
  await iotDevicesHandler(() => {
    throw Error('must not connect');
  })({ method: 'GET' }, res);
  assert.equal(res.statusCode, 405);
});

test('node provisioning emits the reviewed firmware macros only for stable HTTPS and a supported profile', () => {
  const origin = 'https://iot.example.com';
  const device = { device_id: 'dev_source', meter_id: 'meter_1', meter_profile: 'fort' };
  const key = 'k'.repeat(43);
  const config = iotNodeConfig(device, key, iotCloudEndpoint(origin));
  for (const name of [
    'IOT_DEV_ENABLED',
    'IOT_DEV_ENDPOINT',
    'IOT_DEV_DEVICE_ID',
    'IOT_DEV_METER_ID',
    'IOT_DEV_METER_PROFILE',
    'IOT_DEV_BEARER',
  ])
    assert.ok(config.includes('#define ' + name + ' '));
  assert.ok(config.includes('"https://iot.example.com/api/iot-ingest"'));
  assert.ok(config.includes('"' + key + '"'));
  for (const profile of IOT_NODE_PROFILES)
    assert.ok(iotNodeConfig({ ...device, meter_profile: profile }, key, iotCloudEndpoint(origin)));
  for (const bad of [
    'http://127.0.0.1:3000',
    'https://localhost',
    'https://192.168.1.1',
    'https://test.local',
    'https://test.internal',
    origin + '/',
    origin + '?secret=x',
    'https://user:password@iot.example.com',
  ])
    assert.equal(iotCloudEndpoint(bad), null);
  for (const bad of [
    origin + '/api/iot-ingest?key=x',
    origin + '/elsewhere',
    'http://iot.example.com/api/iot-ingest',
  ])
    assert.equal(iotNodeConfig(device, key, bad), null);
  assert.equal(
    iotNodeConfig({ ...device, device_id: 'id"\n#define OTHER 1' }, key, iotCloudEndpoint(origin)),
    null,
  );
  assert.equal(
    iotNodeConfig({ ...device, meter_profile: 'custom-profile' }, key, iotCloudEndpoint(origin)),
    null,
  );
  assert.equal(iotNodeConfig(device, 'wrong', iotCloudEndpoint(origin)), null);
});

test('reference node wire examples are accepted with exact six-decimal readings and UTC capture windows', () => {
  const checkpoint = {
    schema_version: 1,
    event_id: 'cp_20762_04',
    device_id: 'dev_source',
    meter_id: 'meter_1',
    meter_profile: 'fort',
    event_type: 'checkpoint',
    captured_at: '2026-11-05T01:00:02Z',
    quality: 'valid',
    readings: { active_energy_kwh: '123.000001' },
    scheduled_at: '2026-11-05T01:00:00Z',
    started_at: '2026-11-05T01:00:01Z',
  };
  assert.equal(validateIotEvent(checkpoint).readings.active_energy_kwh, '123.000001');
  const telemetry = {
    schema_version: 1,
    event_id: 'live_12345678_00000001',
    device_id: 'dev_source',
    meter_id: 'meter_1',
    meter_profile: 'acrel-adl400',
    event_type: 'telemetry',
    captured_at: '2026-11-05T01:00:00Z',
    quality: 'valid',
    readings: { active_energy_kwh: '0.000000' },
  };
  assert.equal(validateIotEvent(telemetry).readings.active_energy_kwh, '0.000000');
});
