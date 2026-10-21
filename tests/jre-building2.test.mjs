import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraft,
  createWorkingHoursDraft,
  createNightShiftDraft,
  calculateDraft,
} from '../engine.js';
import { exportRawReading } from '../raw-export.js';
import { parseReading } from '../importer.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';

function entered(make = createDraft) {
  const draft = make('JRE', '2026-10-20', ...(make === createDraft ? ['2026-10-21'] : []));
  draft.rows.forEach((row) => {
    row.start.fill('1000');
    row.end.fill('1000');
  });
  draft.rows[0].end[0] = '5000';
  draft.rows[1].end = ['1001', '1002'];
  draft.rows[2].end = ['1003', '1004'];
  draft.rows[3].end = ['1005', '1001', '1002', '1003', '1004', '1000'];
  draft.rows[5].start = ['20', '100', '200', '300'];
  draft.rows[5].end = ['21.25', '110', '220', '330'];
  draft.rows[10].end[0] = '1075';
  draft.rows[18].end[0] = '2000';
  return draft;
}
const building2 = (result) => result.calculatedRows[18];

test('JRE Building 2 deducts converted HE, specified branch meters and direct Nitrogen/Refrigerant Station in all periods', () => {
  for (const make of [createDraft, createWorkingHoursDraft, createNightShiftDraft]) {
    const draft = entered(make),
      before = structuredClone(draft),
      result = calculateDraft(draft),
      row = building2(result);
    assert.equal(result.success, true);
    assert.equal(result.calculatedRows[5].totalEnergy, 110);
    assert.equal(row.grossEnergy, 1000);
    assert.equal(row.deductedEnergy, 705);
    assert.equal(row.totalEnergy, 295);
    assert.equal(row.meters[0].energy, 1000);
    assert.deepEqual(
      row.deductions.map((item) => item.energy),
      [50, 10, 20, 30, 160, 120, 160, 80, 75],
    );
    assert.equal(result.totalDirectEnergy, 4000);
    assert.equal(result.subAreasSumKWh, 1528);
    assert.equal(result.gapKWh, -2472);
    assert.match(result.reportSectionText, /19\. Electricity Building 2#: 295\.00 kWh/);
    assert.equal(result.worksheet.values.length, 19);
    assert.equal(result.worksheet.values[5], 110);
    assert.deepEqual(draft, before);
    const raw = exportRawReading(draft, 'end');
    assert.deepEqual(raw.issues, []);
    assert.match(raw.text, /19\. Electricity Building 2#: 2000\n/);
    assert.deepEqual(
      parseReading(raw.text, 'JRE').values,
      draft.rows.map((item) => item.end),
    );
    const saved = reportSnapshot(draft);
    assert.equal(graphValues(saved, 'JRE').r18, 295);
    assert.deepEqual(saved.draft.rows[18], before.rows[18]);
  }
});

test('Building 2 needs every included component, with no invented zero or partial cross-check', () => {
  for (const [ri, mi] of [
    [5, 0],
    [5, 1],
    [5, 2],
    [5, 3],
    [2, 1],
    [3, 3],
    [3, 4],
    [1, 1],
    [10, 0],
  ]) {
    for (const value of ['', '-', 'bad', '0']) {
      const draft = entered();
      draft.rows[ri].end[mi] = value;
      const result = calculateDraft(draft);
      assert.equal(building2(result).totalEnergy, null);
      assert.equal(result.subAreasSumKWh, null);
      assert.equal(result.gapKWh, null);
      assert.ok(
        result.issues.some(
          (issue) => issue.code === 'DEPENDENCY_UNAVAILABLE' && issue.rowIndex === 18,
        ),
      );
    }
  }
});

test('missing unrelated meters never invalidate valid Building 2 component deductions', () => {
  for (const [ri, mi] of [
    [1, 0],
    [2, 0],
    [3, 0],
    [3, 1],
    [3, 2],
    [3, 5],
    [15, 0],
  ]) {
    const draft = entered();
    draft.rows[ri].end[mi] = '';
    assert.equal(building2(calculateDraft(draft)).totalEnergy, 295);
  }
  const draft = entered();
  draft.rows[3].end[5] = '1001';
  draft.rows[15].end[2] = '1040';
  assert.equal(building2(calculateDraft(draft)).totalEnergy, 295);
});

test('Building 2 zero is valid while negative net and its own unavailable raw reading stay unavailable', () => {
  const draft = entered();
  draft.rows[18].end[0] = '1705';
  const zero = calculateDraft(draft);
  assert.equal(building2(zero).totalEnergy, 0);
  assert.match(zero.reportSectionText, /19\. Electricity Building 2#: 0 kWh/);
  draft.rows[18].end[0] = '1704.999999';
  const negative = calculateDraft(draft);
  assert.equal(building2(negative).totalEnergy, null);
  assert.equal(negative.gapKWh, null);
  assert.ok(
    negative.issues.some((issue) => issue.code === 'NET_USAGE_NEGATIVE' && issue.rowIndex === 18),
  );
  for (const value of ['', '-', 'bad', '999']) {
    draft.rows[18].end[0] = value;
    assert.equal(building2(calculateDraft(draft)).totalEnergy, null);
  }
});

test('Building 2 applies deductions at scaled precision before rounding near the cumulative maximum', () => {
  const draft = entered();
  draft.rows.forEach((row) => {
    row.start.fill('0');
    row.end.fill('0');
  });
  draft.rows[5].end[0] = '0,000001';
  draft.rows[10].end[0] = '0.000001';
  draft.rows[18].start[0] = '999999999999.999958';
  draft.rows[18].end[0] = '1000000000000';
  assert.equal(building2(calculateDraft(draft)).totalEnergy, 0.000001);
});

test('historical Building 2 output and graph values remain immutable after the new deduction rule', () => {
  const saved = reportSnapshot(entered());
  saved.engineVersion = '0.11.9-alpha';
  saved.output.reportText = saved.output.reportText.replace(
    '19. Electricity Building 2#: 295.00 kWh',
    '19. Electricity Building 2#: 370.00 kWh',
  );
  const before = structuredClone(saved);
  assert.equal(graphValues(saved, 'JRE').r18, 370);
  assert.deepEqual(saved, before);
});

test('Station electricity is deducted once, remains a separate row and never uses the Nitrogen gas amount', () => {
  const draft = entered();
  draft.rows[10].end[0] = '1000';
  draft.utilities[2] = { value: '77.5', note: '' };
  const zero = calculateDraft(draft);
  assert.equal(building2(zero).totalEnergy, 370);
  draft.rows[10].end[0] = '1025';
  const raw = structuredClone(draft);
  const result = calculateDraft(draft);
  assert.equal(result.calculatedRows[10].totalEnergy, 25);
  assert.equal(building2(result).totalEnergy, 345);
  assert.equal(result.subAreasSumKWh, zero.subAreasSumKWh);
  assert.equal(result.totalDirectEnergy, zero.totalDirectEnergy);
  assert.match(result.reportSectionText, /11\. Nitrogen and Refrigerant Station: 25\.00 kWh/);
  assert.match(result.reportSectionText, /- Nitrogen: 77\.5 Kg/);
  assert.deepEqual(draft, raw);
});
