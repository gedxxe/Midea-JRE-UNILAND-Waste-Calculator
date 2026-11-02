import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGasDraft,
  restoreGasDraft,
  calculateGas,
  convertGas,
  gasPoint,
  GAS_TABLE_VERSION,
  JRE_GAS_INPUT_VERSION,
} from '../gas.js';
import { createDraft, calculateDraft } from '../engine.js';
import { restoreWorkspace } from '../storage.js';
import { createDraftBackup, restoreDraftBackup } from '../draft-backup.js';
import { changeDraftPeriod } from '../storage.js';
import { utilityPeriods } from './fixtures/shift-utilities.mjs';
import { seedUtilityReadings, shareUtilityEdits, utilityConflicts } from '../utility-periods.js';
import { mergePeriodEdits } from '../period-document.js';
import { exportAllRawReadings } from '../raw-meter-export.js';
import { exampleDraft } from '../examples.js';
import { buildExcelRow } from '../excel-row.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';
const kg = (reading) => ({ reading: String(reading), temperature: '', unit: 'kg' });
const mm = (reading, temperature = '33.5') => ({
  reading: String(reading),
  temperature,
  unit: 'mm',
});
const entry = (start = '1500', end = '1200', refills = []) => ({
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
  assert.equal(calculateGas('R32', entry()).kg, 300);
  assert.equal(calculateGas('R32', entry('1000000000000', '999999999999.999999')).kg, 0.000001);
  assert.equal(
    calculateGas('R32', entry('1000000000000', '0.000001')).kgText,
    '999999999999.999999',
  );
  assert.equal(calculateGas('R32', entry('20,000001', '10,000002')).kg, 9.999999);
});

test('direct stock uses measured refill additions and retains nonblocking increases', () => {
  const e = entry('1500', '1600', [{ before: kg('1000'), after: kg('1800') }]);
  const r = calculateGas('R32', e);
  assert.equal(r.kg, 700);
  assert.equal(r.refillKg, 800);
  assert.deepEqual(r.errors, []);
  const increase = calculateGas('R32', entry('1000', '1150'));
  assert.equal(increase.kg, -150);
  assert.equal(increase.warnings[0].code, 'gasStockIncrease');
  const draft = exampleDraft('JRE');
  draft.gas.entries[3] = entry('1000', '1150');
  const snapshot = reportSnapshot(draft);
  assert.match(snapshot.output.reportText, /Refrigerant R32: \+150 Kg \(measured stock increase\)/);
  assert.equal(graphValues(snapshot, 'JRE').u3, null);
  assert.equal(
    calculateGas('R32', entry('100', '50', [{ before: kg('90'), after: kg('80') }])).kg,
    null,
  );
  assert.equal(calculateGas('R32', entry('100', '')).errors[0].code, 'gasEmpty');
  assert.equal(calculateGas('R32', entry('100', '-')).unavailable, true);
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
  const e = { ...entry(), start: mm('587', '33.5') };
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
  d.gas.entries[3] = entry('1500', '1200');
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
  d.gas.entries[3] = entry('1500.125', '1200.025');
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
