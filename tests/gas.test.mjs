import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertGas,
  calculateGas,
  createGasDraft,
  restoreGasDraft,
  GAS_TABLE_VERSION,
} from '../gas.js';
import { GAS_TABLES, R32_TEMPERATURES } from '../gas-tables.js';
import { createDraft, calculateDraft } from '../engine.js';
import { restoreDrafts, nextDayDraft } from '../storage.js';
import { exampleDraft } from '../examples.js';
import { reportSnapshot } from '../server/report-data.js';
const point = (reading, temperature = '') => ({
  reading: String(reading),
  temperature: String(temperature),
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, a + ' vs ' + b);
const entry = () => ({ enabled: true, start: point(60), end: point(40), refills: [] });

test('conversion reproduces every source mass node including upper and lower boundaries', () => {
  assert.deepEqual(
    Object.values(GAS_TABLES).map((a) => a.length),
    [100, 422, 306, 140],
  );
  for (const [gas, rows] of Object.entries(GAS_TABLES))
    for (const row of rows) {
      if (gas === 'R32')
        R32_TEMPERATURES.forEach((temp, i) =>
          near(convertGas(gas, point(row[0], temp)).kg, row[i + 1]),
        );
      else near(convertGas(gas, point(row[0])).kg, row[1]);
    }
});
test('workbook examples and two-axis R32 interpolation match independent reference calculations', () => {
  near(convertGas('R32', point(587, 40)).kg, 1563.51);
  near(convertGas('R32', point(587, '33,5')).kg, 1617.0336);
  near(convertGas('O2', point('1378,1')).kg, 4239.3803);
  near(convertGas('N2', point(1378.1)).kg, 4292.0498);
  near(convertGas('LPG', point(52.5)).kg, 9103.105);
});
test('conversion refuses missing, malformed and out-of-table readings; zero is not assumed', () => {
  for (const value of ['', '1e3', '1,2.3', '12 kg', '1.0000001', '-1', '0', '100.001'])
    assert.ok(convertGas('LPG', point(value)).error, value);
  for (const temp of ['', '-20.1', '50.1', '1e1', 'NaN', '30 C'])
    assert.ok(convertGas('R32', point(500, temp)).error, temp);
  assert.equal(convertGas('R32', point('-', '')).unavailable, true);
  assert.ok(convertGas('R32', point(49, 40)).error);
  assert.ok(convertGas('R32', point(6968, 40)).error);
});
test('consumption converts individual observations and counts each refill once', () => {
  const e = entry();
  const mass = (n) => convertGas('LPG', point(n)).kg;
  near(calculateGas('LPG', e).kg, mass(60) - mass(40));
  e.refills = [
    { before: point(50), after: point(80) },
    { before: point(60), after: point(90) },
  ];
  near(
    calculateGas('LPG', e).kg,
    mass(60) + (mass(80) - mass(50)) + (mass(90) - mass(60)) - mass(40),
  );
  e.refills[1].after.reading = '';
  assert.equal(calculateGas('LPG', e).kg, null);
  e.refills[1].after.reading = '-';
  assert.equal(calculateGas('LPG', e).unavailable, true);
});
test('unexpected inventory increases and reversed refill events block consumption', () => {
  const e = entry();
  e.end = point(80);
  assert.equal(calculateGas('LPG', e).errors[0].code, 'gasSequence');
  e.end = point(40);
  e.refills = [{ before: point(50), after: point(45) }];
  assert.equal(calculateGas('LPG', e).kg, null);
  e.refills = [{ before: point(70), after: point(90) }];
  assert.equal(calculateGas('LPG', e).kg, null);
});
test('old manual drafts remain byte-compatible and new raw observations survive restore/next day', () => {
  const drafts = { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND') };
  delete drafts.JRE.gas;
  const old = calculateDraft(drafts.JRE).reportSectionText;
  const restore = () => restoreDrafts(JSON.stringify({ version: 4, drafts })).JRE;
  assert.equal(calculateDraft(restore()).reportSectionText, old);
  drafts.JRE.gas = createGasDraft();
  drafts.JRE.gas.entries[3] = {
    enabled: true,
    start: point('587', '33,5'),
    end: point('550', '33.5'),
    refills: [],
  };
  assert.deepEqual(restore().gas, drafts.JRE.gas);
  const next = nextDayDraft(restore());
  assert.deepEqual(next.gas.entries[3].start, drafts.JRE.gas.entries[3].end);
  assert.deepEqual(next.gas.entries[3].end, point(''));
  assert.deepEqual(next.gas.entries[3].refills, []);
  drafts.JRE.gas.entries[3].end.temperature = '';
  assert.throws(() => nextDayDraft(drafts.JRE), /temperature/);
});
test('server owns conversion and calibration, preserves raw data, and blocks incomplete gas', () => {
  const d = exampleDraft('JRE');
  d.gas.entries[0] = entry();
  d.utilities[0].value = '999999';
  d.gas.entries[0].kg = 999999;
  const s = reportSnapshot(d);
  assert.deepEqual(s.draft.gas.entries[0], entry());
  near(s.output.gas[0].kg, calculateGas('LPG', entry()).kg);
  assert.ok(
    s.output.reportText.includes('- LPG: ' + String(Number(s.output.gas[0].kg.toFixed(6))) + ' Kg'),
  );
  d.gas.entries[0].end.reading = '';
  assert.throws(() => reportSnapshot(d), /INCOMPLETE_REPORT/);
  d.gas.version = 'forged';
  assert.throws(() => reportSnapshot(d), /INVALID_REPORT/);
  const legacy = createDraft('UNILAND');
  assert.equal(legacy.gas, undefined);
});
test('malformed or excessive events cannot enter saved drafts', () => {
  const g = createGasDraft();
  assert.equal(g.version, GAS_TABLE_VERSION);
  g.entries[0].refills = Array.from({ length: 11 }, () => ({
    before: point(40),
    after: point(60),
  }));
  assert.throws(() => restoreGasDraft(g));
  g.entries[0].refills = [{ before: point(40) }];
  assert.throws(() => restoreGasDraft(g));
  g.entries[0].refills = [];
  g.entries[0].start.reading = 40;
  assert.throws(() => restoreGasDraft(g));
});
