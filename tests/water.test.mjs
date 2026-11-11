import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWater } from '../water.js';
import { createDraft, calculateDraft } from '../engine.js';
import { exampleDraft } from '../examples.js';
import { restoreDrafts, nextDayDraft, changeDraftPeriod } from '../storage.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';
import { reportPeriods } from './fixtures/report-periods.mjs';
import { buildExcelRow } from '../excel-row.js';
import { shareUtilityEdits, utilityConflicts, moveUtilityPeriod } from '../utility-periods.js';
import { hasEnteredData } from '../draft-records.js';

test('JRE air flow and compressor efficiency use the confirmed boundary in all modes', () => {
  for (const draft of reportPeriods('JRE', '2026-11-12')) {
    draft.airCompressor = { start: '999999999.123456', end: '1000000099.123456' };
    const report = calculateDraft(draft);
    const factor =
      draft.periodKind === 'workingHours' ? 4 : draft.periodKind === 'nightShift' ? 6 : 10;
    assert.equal(report.airCompressorResult.value, '100');
    assert.equal(report.airCompressorResult.electricity, String(factor * 44));
    assert.equal(report.airCompressorResult.ratio, String((factor * 44) / 100));
    assert.match(report.reportSectionText, /Air Compressor: 100 Nm³/);
    assert.equal(graphValues(reportSnapshot(draft), 'JRE').u5, 100);
    const excel = buildExcelRow(draft, report);
    assert.equal(excel.values[excel.columns.findIndex((c) => c.column === 'AB')], '100');
    assert.equal(
      excel.values[excel.columns.findIndex((c) => c.column === 'AC')],
      String((factor * 44) / 100),
    );
  }
  for (const draft of reportPeriods('JRE', '2026-11-11')) {
    draft.airCompressor = { start: '10', end: '20' };
    const result = calculateDraft(draft);
    assert.equal(result.airCompressorResult.applicable, false);
    assert.doesNotMatch(result.reportSectionText, /Air Compressor: 10 Nm³/);
    assert.deepEqual(draft.airCompressor, { start: '10', end: '20' });
  }
  const uniland = reportPeriods('UNILAND', '2026-11-12')[0];
  assert.equal(calculateDraft(uniland).airCompressorResult.applicable, false);
});

test('zero compressor inputs are valid; missing energy or zero flow never fabricates an efficiency', () => {
  const draft = reportPeriods('JRE', '2026-11-12')[0];
  for (const index of [11, 12, 13, 14]) draft.rows[index].end = [...draft.rows[index].start];
  draft.airCompressor = { start: '1', end: '101' };
  assert.equal(calculateDraft(draft).airCompressorResult.ratio, '0');
  draft.rows[12].end[0] = '';
  assert.equal(calculateDraft(draft).airCompressorResult.ratio, '');
  draft.airCompressor.end = '1';
  const report = calculateDraft(draft),
    excel = buildExcelRow(draft, report);
  assert.equal(report.airCompressorResult.value, '0');
  assert.equal(excel.values[excel.columns.findIndex((c) => c.column === 'AC')], '');
  assert.equal(excel.values.length, 49);
  for (const end of ['', '-', '0', 'bad']) {
    draft.airCompressor.end = end;
    assert.equal(calculateDraft(draft).airCompressorResult.ratio, '');
    assert.equal(reportSnapshot(draft, { allowPartial: true }).draft.airCompressor.end, end);
  }
});

test('air-only partial input is entered data and retains raw strings through restore and date movement', () => {
  const draft = createDraft('JRE', '2026-11-12', '2026-11-13');
  draft.airCompressor = { start: '0010,000001', end: '0020.000002' };
  assert.equal(hasEnteredData(draft), true);
  const saved = restoreDrafts(
    JSON.stringify({ version: 4, drafts: { JRE: draft, UNILAND: createDraft('UNILAND') } }),
  ).JRE;
  assert.deepEqual(saved.airCompressor, draft.airCompressor);
  assert.equal(calculateDraft(saved).airCompressorResult.value, '10.000001');
  assert.deepEqual(changeDraftPeriod(saved, '2026-11-13', '2026-11-14').airCompressor, {
    start: '0020.000002',
    end: '',
  });
  saved.rows.forEach((row) => row.end.fill('100'));
  assert.deepEqual(nextDayDraft(saved).airCompressor, { start: '0020.000002', end: '' });
  const old = structuredClone(draft);
  old.meterLayout = 7;
  delete old.airCompressor;
  old.utilities.pop();
  const restored = restoreDrafts(
    JSON.stringify({ version: 4, drafts: { JRE: old, UNILAND: createDraft('UNILAND') } }),
  ).JRE;
  assert.deepEqual(restored.rows, old.rows);
  assert.deepEqual(restored.utilities.slice(0, 5), old.utilities);
  assert.deepEqual(restored.airCompressor, { start: '', end: '' });
  delete draft.airCompressor;
  assert.throws(
    () =>
      restoreDrafts(
        JSON.stringify({ version: 4, drafts: { JRE: draft, UNILAND: createDraft('UNILAND') } }),
      ),
    /Air Compressor/,
  );
});

test('air observations share only matching timestamps and conflicting values remain conflicts', () => {
  const periods = reportPeriods('JRE', '2026-11-12');
  periods[1].airCompressor = { start: '10', end: '14' };
  const shared = shareUtilityEdits(periods, 'workingHours', [
    { kind: 'airCompressor', side: 'end' },
  ]);
  assert.equal(shared[2].airCompressor.start, '14');
  assert.equal(shared[0].airCompressor.end, '');
  shared[2].airCompressor.start = '15';
  assert.ok(utilityConflicts(shared).some((c) => c.kind === 'airCompressor'));
  const next = createDraft('JRE', '2026-11-13', '2026-11-14');
  shared[0].airCompressor.end = '20';
  assert.equal(moveUtilityPeriod(next, shared[0], []).airCompressor.start, '20');
});

for (const plant of ['JRE', 'UNILAND']) {
  test(
    plant +
      ' water uses cumulative end minus start with exact decimal subtraction and original report date',
    () => {
      const d = exampleDraft(plant);
      d.water = { start: '999999999.123456', end: '999999999.123457' };
      const result = calculateDraft(d);
      assert.equal(result.waterResult.value, '0.000001');
      assert.match(result.mainText, /SEPTEMBER 16, 2026/);
      assert.match(result.mainText, /Water: 0.000001 m³/);
      d.water = { start: '123,25', end: '126.75' };
      d.utilities[4].value = '999'; // Legacy/client totals never override raw readings.
      const snapshot = reportSnapshot(d);
      assert.match(snapshot.output.reportText, /Water: 3.5 m³/);
      assert.deepEqual(snapshot.draft.water, d.water);
      assert.equal(graphValues(snapshot, plant).u4, 3.5);
      assert.equal(calculateWater({ start: '0', end: '0' }).value, '0');
    },
  );

  test(
    plant +
      ' water stays optional, but partial or invalid readings cannot be saved as a completed report',
    () => {
      assert.equal(calculateWater(undefined).active, false);
      assert.equal(calculateWater({ start: '', end: '' }).active, false);
      const d = exampleDraft(plant);
      for (const end of ['', '1e3', '1,000.25', '-1', '1000000000001', '1.1234567']) {
        d.water = { start: '100', end };
        assert.equal(calculateDraft(d).success, false);
        assert.throws(() => reportSnapshot(d), /INCOMPLETE_REPORT/);
      }
      for (const end of ['-', '99']) {
        d.water = { start: '100', end };
        const result = calculateDraft(d);
        assert.equal(result.success, true);
        assert.match(result.mainText, /Water: - m³/);
        assert.ok(result.issues.some((i) => i.code.startsWith('WATER_')));
      }
    },
  );

  test(
    plant +
      ' water drafts survive restore, date changes and next day without inventing old raw readings',
    () => {
      const d = exampleDraft(plant);
      d.water = { start: '100,00', end: '120.50' };
      const restore = (input) =>
        restoreDrafts(
          JSON.stringify({
            version: 4,
            drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND'), [plant]: input },
          }),
        )[plant];
      assert.deepEqual(restore(d).water, d.water);
      const next = nextDayDraft(d);
      assert.deepEqual(next.water, { start: '120.50', end: '' });
      assert.deepEqual(changeDraftPeriod(d, d.endDate, next.endDate).water, next.water);
      d.water.end = '';
      assert.throws(() => nextDayDraft(d), /water reading/);
      d.water.start = 123;
      assert.throws(() => restore(d), /water readings/);
      delete d.water;
      d.utilities[4] = { value: '12.5', note: 'Existing saved consumption' };
      const legacy = restore(d);
      assert.equal(legacy.water, undefined);
      assert.match(calculateDraft(legacy).mainText, /Water: 12.5 m³/);
      assert.equal(nextDayDraft(legacy).water, undefined);
    },
  );
}
