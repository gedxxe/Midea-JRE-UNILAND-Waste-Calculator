import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraftBackup, restoreDraftBackup } from '../draft-backup.js';
import { utilityPeriods } from './fixtures/shift-utilities.mjs';
import { seedUtilityReadings, shareUtilityEdits, utilityConflicts } from '../utility-periods.js';
import { mergePeriodEdits } from '../period-document.js';
import { exportAllRawReadings } from '../raw-meter-export.js';
import { buildExcelRow } from '../excel-row.js';
import { graphValues } from '../graph-data.js';
import {
  convertGas,
  calculateGas,
  createGasDraft,
  restoreGasDraft,
  GAS_TABLE_VERSION,
  JRE_GAS_INPUT_VERSION,
  gasPoint,
} from '../gas.js';
import { GAS_TABLES, R32_TEMPERATURES } from '../gas-tables.js';
import { createDraft, calculateDraft } from '../engine.js';
import { restoreDrafts, nextDayDraft, restoreWorkspace, changeDraftPeriod } from '../storage.js';
import { exampleDraft } from '../examples.js';
import { reportSnapshot } from '../server/report-data.js';
const point = (reading, temperature) => ({
  reading: String(reading),
  temperature: String(temperature ?? ''),
  ...(temperature !== undefined ? { unit: 'mm' } : {}),
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
test('inventory increases warn without blocking; reversed refills still block consumption', () => {
  const e = entry();
  e.end = point(80);
  const increase = calculateGas('LPG', e);
  assert.equal(increase.errors.length, 0);
  assert.ok(increase.kg < 0);
  assert.deepEqual(increase.warnings, [{ point: 'end', code: 'gasStockIncrease' }]);
  e.end = point(40);
  e.refills = [{ before: point(50), after: point(45) }];
  assert.equal(calculateGas('LPG', e).kg, null);
  e.refills = [{ before: point(70), after: point(90) }];
  const beforeRefill = calculateGas('LPG', e);
  assert.equal(beforeRefill.errors.length, 0);
  assert.ok(beforeRefill.kg > 0);
  assert.equal(beforeRefill.warnings[0].point, 'before0');
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
  assert.deepEqual(next.gas.entries[3].end, { ...point(''), unit: 'kg' });
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
  assert.ok(legacy.gas.entries.every((entry) => !entry.enabled));
});
test('malformed or excessive events cannot enter saved drafts', () => {
  const g = createGasDraft();
  assert.notEqual(g.version, GAS_TABLE_VERSION);
  assert.equal(g.entries[3].start.unit, 'kg');
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

const kg = (reading) => ({ reading: String(reading), temperature: '', unit: 'kg' });
const mm = (reading, temperature = '33.5') => ({
  reading: String(reading),
  temperature,
  unit: 'mm',
});
const kgEntry = (start = '1500', end = '1200', refills = []) => ({
  enabled: true,
  start: kg(start),
  end: kg(end),
  refills,
});

test('new JRE R32 observations default to kg; UNILAND remains legacy mm', () => {
  assert.deepEqual(createGasDraft('JRE').entries[3].start, kg(''));
  assert.deepEqual(createGasDraft('UNILAND').entries[3].start, { reading: '', temperature: '' });
  assert.equal(createGasDraft('JRE').version, JRE_GAS_INPUT_VERSION);
  const missing = createGasDraft();
  delete missing.entries[3].start.unit;
  assert.throws(() => restoreGasDraft(missing), /unit/);
  assert.equal(restoreGasDraft(createGasDraft()).entries[3].start.reading, '');
  const malformed = exampleDraft('JRE');
  delete malformed.gas.entries[3].end.unit;
  assert.throws(() => reportSnapshot(malformed), /INVALID_REPORT/);
  assert.ok(exportAllRawReadings(malformed).issues.length);
  assert.equal(convertGas('R32', kg('0')).kg, 0);
  assert.equal(convertGas('R32', kg('25000.125')).kg, 25000.125);
  assert.equal(convertGas('R32', kg('12'), 'UNILAND').error, 'gasUnit');
  assert.equal(convertGas('O2', kg('12')).error, 'gasUnit');
  for (const bad of ['-1', '1e3', '10kg', '1000000000000.000001', '0.0000001'])
    assert.ok(convertGas('R32', kg(bad)).error, bad);
  assert.equal(convertGas('R32', kg('-')).unavailable, true);
  assert.equal(calculateGas('R32', kgEntry()).kg, 300);
  assert.equal(calculateGas('R32', kgEntry('1000000000000', '999999999999.999999')).kg, 0.000001);
  assert.equal(
    calculateGas('R32', kgEntry('1000000000000', '0.000001')).kgText,
    '999999999999.999999',
  );
  assert.equal(calculateGas('R32', kgEntry('20,000001', '10,000002')).kg, 9.999999);
});

test('direct stock uses measured refill additions and retains nonblocking increases', () => {
  const e = kgEntry('1500', '1600', [{ before: kg('1000'), after: kg('1800') }]);
  const r = calculateGas('R32', e);
  assert.equal(r.kg, 700);
  assert.equal(r.refillKg, 800);
  assert.deepEqual(r.errors, []);
  const increase = calculateGas('R32', kgEntry('1000', '1150'));
  assert.equal(increase.kg, -150);
  assert.equal(increase.warnings[0].code, 'gasStockIncrease');
  const draft = exampleDraft('JRE');
  draft.gas.entries[3] = kgEntry('1000', '1150');
  const snapshot = reportSnapshot(draft);
  assert.match(snapshot.output.reportText, /Refrigerant R32: \+150 Kg \(measured stock increase\)/);
  assert.equal(graphValues(snapshot, 'JRE').u3, null);
  assert.equal(
    calculateGas('R32', kgEntry('100', '50', [{ before: kg('90'), after: kg('80') }])).kg,
    null,
  );
  assert.equal(calculateGas('R32', kgEntry('100', '')).errors[0].code, 'gasEmpty');
  assert.equal(calculateGas('R32', kgEntry('100', '-')).unavailable, true);
});

test('legacy mm values retain raw units and temperature; mixed stock observations convert only mm', () => {
  const g = createGasDraft();
  g.version = GAS_TABLE_VERSION;
  g.entries[3] = {
    enabled: true,
    start: mm('587', '33,5'),
    end: mm('550'),
    refills: [{ before: mm('560'), after: mm('600') }],
  };
  const before = JSON.stringify(g),
    restored = restoreGasDraft(g);
  assert.equal(restored.version, JRE_GAS_INPUT_VERSION);
  assert.deepEqual(restored.entries[3], g.entries[3]);
  assert.equal(JSON.stringify(g), before);
  assert.deepEqual(calculateGas('R32', g.entries[3]), calculateGas('R32', restored.entries[3]));
  const e = { ...kgEntry(), start: mm('587', '33.5') };
  assert.equal(calculateGas('R32', e).kg, convertGas('R32', e.start).kg - 1200);
  assert.equal(convertGas('R32', mm('587', '')).error, 'gasTemperature');
  g.entries[3].end = kg('100');
  assert.throws(() => restoreGasDraft(g), /unit/);
  assert.throws(
    () =>
      restoreGasDraft(
        { ...createGasDraft('UNILAND'), entries: createGasDraft().entries },
        'UNILAND',
      ),
    /unit/,
  );
});

test('unit-aware shared observations preserve matching points, detect conflicts and retain units across dates', () => {
  const p = utilityPeriods('JRE');
  p[1].gas.entries[3].end = kg('750.125');
  const shared = shareUtilityEdits(p, 'workingHours', [
    { kind: 'gas', index: 3, side: 'end', field: 'reading' },
  ]);
  assert.deepEqual(shared[2].gas.entries[3].start, kg('750.125'));
  shared[2].gas.entries[3].start.temperature = '30';
  assert.equal(
    utilityConflicts(shared).some((c) => c.kind === 'gas' && c.index === 3),
    false,
  );
  shared[2].gas.entries[3].start = mm('750.125');
  assert.ok(utilityConflicts(shared).some((c) => c.kind === 'gas' && c.index === 3));
  shared[2].gas.entries[3].start = gasPoint('R32');
  assert.deepEqual(seedUtilityReadings(shared)[2].gas.entries[3].start, kg('750.125'));
  const retained = utilityPeriods('JRE');
  retained[1].gas.entries[3].end = kg('');
  retained[2].gas.entries[3].start = mm('700', '30');
  retained[2].gas.entries[3].enabled = false;
  const unitChoice = shareUtilityEdits(retained, 'workingHours', [
    { kind: 'gas', index: 3, side: 'end', field: 'unit' },
  ]);
  assert.deepEqual(unitChoice[2].gas.entries[3].start, mm('700', '30'));
  const temperatureOnly = shareUtilityEdits(retained, 'workingHours', [
    { kind: 'gas', index: 3, side: 'end', field: 'temperature' },
  ]);
  assert.deepEqual(temperatureOnly[2].gas.entries[3].start, mm('700', '30'));
  const d = exampleDraft('JRE');
  d.gas.entries[3] = kgEntry('1500', '1200');
  const next = changeDraftPeriod(d, d.endDate, '2026-09-18');
  assert.deepEqual(next.gas.entries[3].start, kg('1200'));
  assert.deepEqual(next.gas.entries[3].end, kg(''));
  const stored = mm('100'),
    seed = kg(''),
    edited = kg('100');
  assert.throws(() => mergePeriodEdits(stored, seed, edited), /DRAFT_CONFLICT/);
  assert.deepEqual(mergePeriodEdits(mm('', ''), seed, edited), edited);
});

test('R32 kg survives backup, snapshots, raw sharing and Excel without temperature conversion', () => {
  const d = exampleDraft('JRE');
  d.gas.entries[3] = kgEntry('1500.125', '1200.025');
  const workspace = restoreWorkspace(
    JSON.stringify({ version: 4, drafts: { JRE: d, UNILAND: exampleDraft('UNILAND') } }),
  );
  const owner = 'b89c2b90-bbee-4a90-bd68-a0e9fc761352';
  const backup = createDraftBackup(workspace, owner);
  const roundtrip = restoreDraftBackup(backup, owner);
  assert.deepEqual(roundtrip.drafts.JRE.gas.entries[3], d.gas.entries[3]);
  const result = calculateDraft(d);
  d.gas.entries[3].kgText = '999999';
  assert.equal(reportSnapshot(d).output.gas.find((g) => g.gas === 'R32').kgText, '300.1');
  assert.equal(result.gasResults.find((g) => g.gas === 'R32').kg, 300.1);
  assert.equal(result.gasResults.find((g) => g.gas === 'R32').calibration, 'direct-kg');
  assert.match(result.reportSectionText, /R32: 300.1 Kg/);
  const text = exportAllRawReadings(d, 'end').text;
  assert.match(text, /Refrigerant R32: 1200.025 kg/);
  assert.doesNotMatch(text, /Refrigerant R32:.*temperature/);
  const row = buildExcelRow(d, result);
  assert.equal(row.values[row.columns.findIndex((c) => c.column === 'AT')], '300.1');
});
