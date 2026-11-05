import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIotEvent as validateEvent } from '../iot-contract.js';
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
