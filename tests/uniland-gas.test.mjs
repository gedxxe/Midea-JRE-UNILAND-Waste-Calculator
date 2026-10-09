import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  gasCalibration,
  convertGas,
  calculateGas,
  createGasDraft,
  restoreGasDraft,
} from '../gas.js';
import { R32_TEMPERATURES } from '../gas-tables.js';
import { calculateDraft } from '../engine.js';
import { exampleDraft } from '../examples.js';
import { restoreDrafts, nextDayDraft, changeDraftPeriod } from '../storage.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues, graphSegments } from '../graph-data.js';
import { exportRawReading, formatBlankReadingTemplate } from '../raw-export.js';

const plant = 'UNILAND';
const point = (reading, temperature = '') => ({
  reading: String(reading),
  temperature: String(temperature),
});
const entry = () => ({ enabled: true, start: point(60), end: point(40), refills: [] });
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);

test('UNILAND calibration matches reviewed workbook columns and reproduces every source node', () => {
  // Digests of numeric columns extracted independently from workbook XML, not calculator samples.
  const hashes = {
    LPG: 'dc924543a3ca8a0aa11b63a8106dd3e764f2c93acadcb306afe9ec666738a92b',
    O2: 'df988c7dad6bfb3b4dc2a8ea1d2520f56b7616fc5e4f6a41243c9061a5fb54ef',
    N2: '7011cdc43ff2380e8100535be8c7f302a9a10cb83a69d3b0ef2ac1520fd06e3f',
    R32: '0a3fce80fc958ec50129cf00ecd9c91a2648f9b01670071569ac19927a90b94d',
  };
  for (const [id, rows] of Object.entries(gasCalibration(plant).tables)) {
    assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'), hashes[id]);
    for (const row of rows)
      if (id === 'R32')
        R32_TEMPERATURES.forEach((t, i) =>
          near(convertGas(id, point(row[0], t), plant).kg, row[i + 1]),
        );
      else near(convertGas(id, point(row[0]), plant).kg, row[1]);
  }
  near(convertGas('LPG', point('52,5'), plant).kg, 4972.06);
  near(convertGas('O2', point(1378.1), plant).kg, 4117.605);
  near(convertGas('N2', point(1378.1), plant).kg, 4313.0745);
  near(convertGas('R32', point(587, '33,5'), plant).kg, 1617.0336);
  assert.equal(convertGas('O2', point(4320), plant).kg, 13640.07);
  assert.equal(convertGas('O2', point(4320), 'JRE').error, 'gasRange');
  assert.notEqual(
    convertGas('LPG', point(52.5), plant).kg,
    convertGas('LPG', point(52.5), 'JRE').kg,
  );
});

test('UNILAND respects source bounds, decimal inputs, missing observations and refill ordering', () => {
  for (const gas of gasCalibration(plant).gases) {
    for (const raw of ['', '1e2', '1,2.3', 'NaN', '10 kg', 0, gas.min - 0.1, gas.max + 0.1])
      assert.ok(convertGas(gas.id, point(raw, 30), plant).error);
    assert.equal(convertGas(gas.id, point('-'), plant).unavailable, true);
  }
  for (const t of ['', '-20.1', '50.1', '33.1234567'])
    assert.equal(convertGas('R32', point(500, t), plant).error, 'gasTemperature');
  const e = entry();
  e.refills = [
    { before: point(50), after: point(80) },
    { before: point(60), after: point(90) },
  ];
  const mass = (n) => convertGas('LPG', point(n), plant).kg;
  near(
    calculateGas('LPG', e, plant).kg,
    mass(60) + mass(80) - mass(50) + mass(90) - mass(60) - mass(40),
  );
  e.refills[1].after = point(40);
  assert.equal(calculateGas('LPG', e, plant).kg, null);
  e.refills[1].after = point('');
  assert.ok(calculateGas('LPG', e, plant).errors.length);
  e.refills[1].after = point('-');
  assert.equal(calculateGas('LPG', e, plant).unavailable, true);
  const thermal = {
    enabled: true,
    start: point(600, 30),
    end: point(550, 33.5),
    refills: [{ before: point(550, 35), after: point(650, 40) }],
  };
  const r = calculateGas('R32', thermal, plant);
  const kg = (p) => convertGas('R32', p, plant).kg;
  near(
    r.kg,
    kg(thermal.start) +
      kg(thermal.refills[0].after) -
      kg(thermal.refills[0].before) -
      kg(thermal.end),
  );
});

test('legacy UNILAND manual units stay intact; enabled tank gas maps to the correct utility in kg', () => {
  const draft = exampleDraft(plant);
  delete draft.gas;
  draft.utilities.forEach((u, i) => {
    u.value = String(i + 1);
    u.note = '';
  });
  const old = calculateDraft(draft).reportSectionText;
  const drafts = { JRE: exampleDraft('JRE'), UNILAND: draft };
  const restored = restoreDrafts(JSON.stringify({ version: 4, drafts })).UNILAND;
  assert.equal(calculateDraft(restored).reportSectionText, old);
  assert.ok(restored.gas.entries.every((e) => !e.enabled));
  const raw = exportRawReading(restored, 'end');
  const template = formatBlankReadingTemplate(plant);
  const utilities = structuredClone(restored.utilities);
  restored.gas.entries = [
    entry(),
    { ...entry(), start: point(1010), end: point(1000) },
    { ...entry(), start: point(1010), end: point(1000) },
    { ...entry(), start: point(587, 33.5), end: point(550, 33.5) },
  ];
  const snapshot = reportSnapshot(restored);
  assert.match(snapshot.output.reportText, /LPG: 1894.11 Kg/);
  assert.match(snapshot.output.reportText, /Oxygen: 34.5 Kg/);
  assert.match(snapshot.output.reportText, /Nitrogen: 34.44 Kg/);
  assert.match(snapshot.output.reportText, /R32: 154.2086 Kg/);
  assert.match(snapshot.output.reportText, /Air Compressor: 2 Nm3/);
  assert.match(snapshot.output.reportText, /Water: 5 m³/);
  assert.match(snapshot.output.reportText, /R454B: 7/);
  assert.deepEqual(restored.utilities, utilities);
  assert.deepEqual(exportRawReading(restored, 'end'), raw);
  assert.equal(formatBlankReadingTemplate(plant), template);
  restored.gas.entries.forEach((e) => {
    e.enabled = false;
  });
  assert.equal(calculateDraft(restored).reportSectionText, old);
});

test('UNILAND gas drafts preserve incomplete input and move observations by date with next-day validation', () => {
  const draft = exampleDraft(plant);
  draft.gas.entries[3] = {
    ...entry(),
    start: point('587', '33,5'),
    end: point('550', ''),
    refills: [{ before: point(''), after: point('') }],
  };
  const drafts = { JRE: exampleDraft('JRE'), UNILAND: draft };
  const restored = restoreDrafts(JSON.stringify({ version: 4, drafts })).UNILAND;
  assert.deepEqual(restored.gas, draft.gas);
  assert.throws(() => nextDayDraft(restored), /temperature/);
  const moved = changeDraftPeriod(restored, draft.endDate, '2026-10-10');
  assert.deepEqual(moved.gas.entries[3].start, point('550', ''));
  assert.deepEqual(moved.gas.entries[3].end, point(''));
  assert.deepEqual(moved.gas.entries[3].refills, []);
  assert.deepEqual(changeDraftPeriod(moved, draft.startDate, draft.endDate, restored), restored);
  restored.gas.entries[3].end.temperature = '33.5';
  const next = nextDayDraft(restored);
  assert.deepEqual(next.gas.entries[3].start, point('550', '33.5'));
  assert.deepEqual(next.gas.entries[3].refills, []);
  assert.deepEqual(
    next.utilities.map((u) => u.value),
    Array(7).fill(''),
  );
});

test('UNILAND snapshots reject cross-factory calibration and ignore forged masses', () => {
  const draft = exampleDraft(plant);
  draft.gas.entries[0] = { ...entry(), kg: 999999 };
  const saved = reportSnapshot(draft);
  near(saved.output.gas[0].kg, 1894.11);
  assert.equal(saved.output.gas[0].calibration, 'uniland-2026-10-v1');
  assert.equal(saved.draft.gas.entries[0].kg, undefined);
  assert.throws(() => restoreGasDraft(createGasDraft('JRE'), plant));
  assert.throws(() => restoreGasDraft(draft.gas, 'JRE'));
  draft.gas.entries[0].end.reading = '';
  assert.throws(() => reportSnapshot(draft), /INCOMPLETE_REPORT/);
  draft.gas.version = gasCalibration('JRE').version;
  assert.throws(() => reportSnapshot(draft), /INVALID_REPORT/);
  assert.equal(calculateDraft(draft).success, false);
});

test('UNILAND gas graphs separate kilograms from historical raw-unit utilities without recalculation', () => {
  const draft = exampleDraft(plant);
  draft.utilities[0] = { value: '123', note: '' };
  const old = reportSnapshot(draft);
  draft.gas.entries[0] = entry();
  const current = reportSnapshot(draft);
  const legacy = graphValues(old, plant),
    fresh = graphValues(current, plant);
  assert.equal(legacy.u0, 123);
  assert.equal(legacy.kg0, null);
  assert.equal(fresh.u0, null);
  near(fresh.kg0, 1894.11);
  current.output.reportText = current.output.reportText.replace('1894.11 Kg', '42 Kg');
  assert.equal(graphValues(current, plant).kg0, 42);
  const rows = [legacy, fresh].map((values, i) => ({
    values,
    startDate: `2026-09-0${i + 1}`,
    endDate: `2026-09-0${i + 2}`,
    days: 1,
  }));
  assert.equal(graphSegments(rows, 'kg0')[0].length, 1);
  assert.equal(graphSegments(rows, 'u0')[0].length, 1);
});
