import test from 'node:test';
import assert from 'node:assert/strict';
import { checkpointIndex, calculateSeries, weeklySeries } from '../smart-energy.js';
import { iotDashboardHandler } from '../server/iot-dashboard.js';

const node = { device_id: 'node-a', meter_id: 'meter-a', plant: 'JRE' };
const sample = (day, time, energy, received = '2026-11-09T06:00:00Z') => ({
  device_id: 'node-a',
  scheduled_at:
    day +
    'T' +
    { '06:30': '23:30:00Z', '08:00': '01:00:00Z', '17:00': '10:00:00Z', '18:00': '11:00:00Z' }[
      time
    ],
  kwh: energy,
  received_at: received,
});
// Use explicit previous UTC date for the 06:30 WIB checkpoint.
const at0630 = (day, kwh, received = '2026-11-09T00:00:00Z') => ({
  device_id: 'node-a',
  scheduled_at: new Date(Date.parse(day + 'T06:30:00+07:00')).toISOString(),
  received_at: received,
  kwh,
});
const now = '2026-11-09T11:00:00Z';

test('24-hour delta uses matching checkpoint in Jakarta, never sums two cumulative values', () => {
  const rows = [at0630('2026-11-08', '1000.125'), at0630('2026-11-09', '1017.375')];
  const series = calculateSeries(rows, [node], '2026-11-09', 7, '06:30', now);
  assert.equal(series.daily.at(-1).value, 17.25);
  assert.equal(series.perMeter.get(node.device_id), 17.25);
  assert.equal(series.issues.length, 6); // Older days lack both checkpoints.
});

test('missing and reset checkpoints stay missing and become explicit quality events', () => {
  const rows = [at0630('2026-11-08', '200'), at0630('2026-11-09', '150')];
  const series = calculateSeries(rows, [node], '2026-11-09', 7, '06:30', now);
  assert.equal(series.daily.at(-1).value, null);
  assert.match(series.issues[0].reason, /Counter turun/);
  assert.equal(series.perMeter.size, 0);
  const incomplete = calculateSeries(rows, [node], '2026-11-09', 7, '18:00', now);
  assert.equal(
    incomplete.issues.some((x) => x.day === '2026-11-09'),
    false,
  );
});

test('duplicate checkpoint uses most recently received valid record; invalid values ignored', () => {
  const readings = [
    at0630('2026-11-08', '100'),
    at0630('2026-11-09', '105', '2026-11-09T01:00:00Z'),
    at0630('2026-11-09', '106', '2026-11-09T02:00:00Z'),
    at0630('2026-11-09', 'NaN', '2026-11-09T03:00:00Z'),
  ];
  assert.equal(checkpointIndex(readings).size, 2);
  assert.equal(
    calculateSeries(readings, [node], '2026-11-09', 7, '06:30', now).daily.at(-1).value,
    6,
  );
});

test('weekly totals label gaps as partial and do not estimate missing days', () => {
  const days = Array.from({ length: 7 }, (_, i) => ({
    day: '2026-11-' + String(i + 2).padStart(2, '0'),
    value: i === 3 ? null : 10,
  }));
  const weeks = weeklySeries(days);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].value, 60);
  assert.equal(weeks[0].complete, false);
  assert.equal(weeklySeries(days.map((d) => ({ ...d, value: 10 })))[0].complete, true);
});

test('analytics endpoint fails closed without a valid session or environment', async () => {
  for (const [req, env, status] of [
    [{ method: 'GET', url: '/api/iot-dashboard', headers: {} }, {}, 503],
    [
      { method: 'GET', url: '/api/iot-dashboard', headers: {} },
      { AUTH_SECRET: 'a'.repeat(32), APP_ORIGIN: 'https://example.com', IOT_ENABLED: '1' },
      401,
    ],
  ]) {
    let called = false;
    const res = {
      setHeader() {},
      end(body) {
        this.payload = JSON.parse(body);
      },
    };
    await iotDashboardHandler(() => {
      called = true;
      return { query: async () => ({ rows: [] }) };
    }, env)(req, res);
    assert.equal(res.statusCode, status);
    assert.equal(called, status === 401);
  }
});
