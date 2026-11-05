import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIotEvent as validateEvent } from '../iot-contract.js';
const validateIotEvent = (value) => validateEvent(value, Date.parse('2026-11-05T02:00:00Z'));
import { iotIngestHandler } from '../server/iot.js';
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
