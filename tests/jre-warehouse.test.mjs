import { exampleDraft } from '../examples.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDraft,
  createDraft,
  createWorkingHoursDraft,
  createNightShiftDraft,
} from '../engine.js';
import { reportPeriods } from './fixtures/report-periods.mjs';
import { layout5JreDraft, legacyText } from './fixtures/legacy-layout.mjs';
import { migrateMeterLayout } from '../meter-layout.js';
import { hasEnteredData } from '../draft-records.js';
import { changeDraftPeriod, nextDayDraft } from '../storage.js';
import { seedElectricity, shareElectricityEdits, electricityConflicts } from '../observations.js';
import { parseReading } from '../importer.js';
import { exportRawReading, formatBlankReadingTemplate } from '../raw-export.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';
import { GRAPH_METRICS } from '../graph-schema.js';

function entered(date = '2026-10-25') {
  return reportPeriods('JRE', date).map((d, i) => {
    d.rows[25].start = [['1000', '1000', '1008'][i]];
    d.rows[25].end = [['1020', '1008', '1020'][i]];
    d.rows[31].start = [['10', '10', '11.5'][i]];
    d.rows[31].end = [['14', '11.5', '14'][i]];
    return d;
  });
}
test('Warehouse Lighting x40 is separate row32 and deducted once from Warehouse in all modes', () => {
  for (const [i, d] of entered().entries()) {
    const raw = structuredClone(d),
      result = calculateDraft(d);
    const baseline = structuredClone(d);
    baseline.rows[31].end = [...baseline.rows[31].start];
    const gross = calculateDraft(baseline),
      amount = [160, 60, 100][i],
      net = [640, 260, 380][i];
    assert.equal(result.success, true);
    assert.equal(result.calculatedRows[31].name, 'Warehouse Lighting');
    assert.equal(result.calculatedRows[31].totalEnergy, amount);
    assert.equal(result.calculatedRows[25].totalEnergy, net);
    assert.equal(result.calculatedRows[25].grossEnergy, net + amount);
    assert.equal(result.totalDirectEnergy, gross.totalDirectEnergy);
    assert.equal(result.subAreasSumKWh, gross.subAreasSumKWh);
    assert.equal(result.gapKWh, gross.gapKWh);
    const saved = reportSnapshot(d),
      values = graphValues(saved, 'JRE');
    assert.equal(values.w15, net);
    assert.equal(values.r31, amount);
    assert.match(
      saved.output.reportText,
      new RegExp('32\\. Warehouse Lighting: ' + amount + '\\.00 kWh'),
    );
    assert.deepEqual(d, raw);
    assert.deepEqual(saved.draft.rows[31], raw.rows[31]);
    assert.equal(result.worksheet.values.length, gross.worksheet.values.length);
  }
  assert.equal(GRAPH_METRICS.JRE.find((m) => m.key === 'r31').department, 'logistic');
  assert.equal(createDraft('UNILAND').rows.length, 34);
  assert.equal(
    GRAPH_METRICS.UNILAND.some((m) => m.label === 'Warehouse Lighting'),
    false,
  );
});
test('report-start date controls zero before Oct25, including the 24-to-25 daily and night boundary', () => {
  for (const [i, d] of entered('2026-10-24').entries()) {
    d.rows[31].start = ['0'];
    d.rows[31].end = i === 1 ? ['0'] : ['10'];
    const raw = structuredClone(d),
      r = calculateDraft(d);
    assert.equal(r.success, true);
    assert.equal(r.calculatedRows[31].totalEnergy, 0);
    assert.equal(r.calculatedRows[25].totalEnergy, [800, 320, 480][i]);
    assert.match(reportSnapshot(d).output.reportText, /32\. Warehouse Lighting: 0 kWh/);
    assert.deepEqual(d, raw);
  }
  const combined = entered('2026-10-24')[0];
  combined.endDate = '2026-10-27';
  assert.equal(calculateDraft(combined).calculatedRows[31].totalEnergy, 0);
  const actual = entered()[0];
  actual.rows[31] = { start: ['0'], end: ['1.125'], inactive: false };
  assert.equal(calculateDraft(actual).calculatedRows[31].totalEnergy, 45);
  actual.startDate = 'not-a-date';
  assert.equal(calculateDraft(actual).success, false);
});
test('active Warehouse uses scaled deltas and never masks missing/decreasing or negative-net inputs', () => {
  const d = entered()[0];
  d.rows[25] = { start: ['1.000001'], end: ['1.000004'], inactive: false };
  d.rows[31] = { start: ['2.000001'], end: ['2.000002'], inactive: false };
  assert.equal(calculateDraft(d).calculatedRows[25].totalEnergy, 0.00008);
  for (const values of [
    ['', '2'],
    ['-', '2'],
    ['3', '2'],
    ['bad', '2'],
    ['0', '1'],
  ]) {
    d.rows[31].start = [values[0]];
    d.rows[31].end = [values[1]];
    const r = calculateDraft(d);
    if (['', 'bad'].includes(values[0])) assert.equal(r.success, false);
    assert.equal(r.calculatedRows[25].totalEnergy, null);
    assert.equal(r.calculatedRows[25].missing, true);
  }
  const pre = entered('2026-10-24')[0];
  pre.rows[31].start = ['bad'];
  assert.equal(calculateDraft(pre).success, false);
});
test('layout5 upgrades preserve old raw fields and add zeros only before the first recording date', () => {
  for (const date of ['2026-10-23', '2026-10-24', '2026-10-25'])
    for (const d of entered(date)) {
      const old = layout5JreDraft(d),
        raw = structuredClone(old),
        next = migrateMeterLayout(old);
      assert.equal(next.meterLayout, 6);
      assert.equal(next.rows.length, 32);
      assert.deepEqual(next.rows.slice(0, 31), old.rows);
      assert.deepEqual(old, raw);
      assert.deepEqual(next.rows[31].start, [date < '2026-10-25' ? '0' : '']);
      assert.deepEqual(next.rows[31].end, [d.endDate < '2026-10-25' ? '0' : '']);
      assert.deepEqual(migrateMeterLayout(next), next);
      assert.throws(() => reportSnapshot(old), /METER_LAYOUT_CHANGED/);
    }
});
test('historical zero defaults do not create an autosave record, but an actual zero on Oct25 does', () => {
  for (const d of [
    createDraft('JRE', '2026-10-23', '2026-10-24'),
    createWorkingHoursDraft('JRE', '2026-10-24'),
    createNightShiftDraft('JRE', '2026-10-24'),
  ])
    assert.equal(hasEnteredData(d), false);
  const boundary = createDraft('JRE', '2026-10-24', '2026-10-25');
  assert.deepEqual(boundary.rows[31].start, ['0']);
  assert.deepEqual(boundary.rows[31].end, ['']);
  assert.equal(hasEnteredData(boundary), false);
  boundary.rows[31].end = ['0'];
  assert.equal(hasEnteredData(boundary), true);
});
test('first Oct25 reading stays real and moves by exact timestamps instead of inheriting historical zeros', () => {
  const prior = createDraft('JRE', '2026-10-24', '2026-10-25'),
    day = createWorkingHoursDraft('JRE', '2026-10-25'),
    night = createNightShiftDraft('JRE', '2026-10-25');
  prior.rows[31].end = ['10'];
  const shared = seedElectricity([prior, day, night]);
  assert.deepEqual(shared[0].rows[31].start, ['0']);
  assert.deepEqual(shared[1].rows[31].start, ['10']);
  assert.deepEqual(shared[1].rows[31].end, ['']);
  shared[1].rows[31].end = ['11.5'];
  const edited = shareElectricityEdits(shared, 'workingHours', [{ ri: 31, mi: 0, side: 'end' }]);
  assert.deepEqual(edited[2].rows[31].start, ['11.5']);
  assert.deepEqual(electricityConflicts(edited), []);
  const full = entered('2026-10-24')[0];
  full.rows[31] = { start: ['0'], end: ['10'], inactive: false };
  const raw = exportRawReading(full, 'end');
  assert.match(raw.text, /32\. Warehouse Lighting: 10 \(Ratio 40\)$/);
  const next = nextDayDraft(full);
  assert.deepEqual(next.rows[31].start, ['10']);
  assert.deepEqual(next.rows[31].end, ['']);
  const changed = changeDraftPeriod(full, '2026-10-25', '2026-10-26');
  assert.deepEqual(changed.rows[31], next.rows[31]);
});
test('old 31-row imports retain absent Lighting provenance and templates always keep a blank x40 slot', () => {
  for (const date of ['2026-10-24', '2026-10-25']) {
    const d = entered(date)[0],
      old = layout5JreDraft(d);
    for (const side of ['start', 'end']) {
      const parsed = parseReading(legacyText(old, side), 'JRE');
      assert.equal(parsed.success, true);
      assert.deepEqual(parsed.omittedRows, [31]);
      assert.deepEqual(parsed.suppliedMeters[31], [false]);
      assert.deepEqual(parsed.values[31], [old[side + 'Date'] < '2026-10-25' ? '0' : '']);
    }
  }
  const template = formatBlankReadingTemplate('JRE');
  assert.match(template, /32\. Warehouse Lighting: ____ \(Ratio 40\)$/);
  assert.equal([...template.matchAll(/____/g)].length, 62);
});
test('saved layout5 graph output remains unchanged with no invented Lighting history', () => {
  const d = entered()[0];
  d.rows[31].end = [...d.rows[31].start];
  const old = reportSnapshot(d);
  old.draft = layout5JreDraft(old.draft);
  old.output.reportText = old.output.reportText.replace(/^32\. Warehouse Lighting:.*\n/m, '');
  const before = structuredClone(old),
    values = graphValues(old, 'JRE');
  assert.equal(values.w15, 800);
  assert.equal(values.r31, null);
  assert.deepEqual(old, before);
});

test('the synthetic example converts deduction usage back into cumulative meter units', () => {
  const draft = exampleDraft('JRE'),
    result = calculateDraft(draft);
  assert.equal(result.success, true);
  assert.equal(result.calculatedRows[25].grossEnergy, 50);
  assert.equal(result.calculatedRows[25].totalEnergy, 50);
  assert.equal(result.calculatedRows[31].totalEnergy, 0);
  assert.ok(result.gapKWh < 0);
  assert.deepEqual(draft.rows[31], { start: ['0'], end: ['0'], inactive: false });
});
