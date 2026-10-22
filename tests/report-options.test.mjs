import test from 'node:test';
import assert from 'node:assert/strict';
import { selectReport, combineReportSelections, REPORT_OPTIONS } from '../report-options.js';
import {
  seedElectricity,
  shareElectricityEdits,
  electricityConflicts,
  columnEdits,
} from '../observations.js';
import { createDraft, calculateDraft, generateFullIndonesiaReport } from '../engine.js';
import { reportPeriods } from './fixtures/report-periods.mjs';
import { exportRawReading } from '../raw-export.js';
import { reportSnapshot } from '../server/report-data.js';

test('all five report options work for both factories; only entered utility values appear in their own period', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const periods = reportPeriods(plant),
      before = JSON.stringify(periods);
    for (const selection of Object.keys(REPORT_OPTIONS)) {
      const result = selectReport(periods, selection);
      assert.equal(result.success, true, selection);
      assert.equal(result.parts.length, REPORT_OPTIONS[selection].length);
      if (selection === 'daily')
        assert.equal(result.text, calculateDraft(periods[0]).reportSectionText);
      if (selection === 'dailyAfter') {
        assert.match(result.text, /24 HOURS:\n/);
        assert.match(result.text, /AFTER PRODUCTION:\n/);
        assert.doesNotMatch(result.text, /NIGHT SHIFT/);
      }
      if (selection === 'all') {
        assert.match(result.text, /24 HOURS:\n/);
        assert.match(result.text, /AFTER PRODUCTION:\n/);
        assert.match(result.text, /NIGHT SHIFT:\n/);
      }
      const utilities = result.text.split('\n').filter((line) => /^[*-] (LPG|Water):/.test(line));
      assert.equal(utilities.length, ['after', 'night'].includes(selection) ? 0 : 2);
      if (selection === 'after')
        assert.match(result.text, /AFTER PRODUCTION.*08:00 to .*17:00 WIB/);
      if (selection === 'night') assert.match(result.text, /NIGHT SHIFT.*17:00 to .*08:00 WIB/);
    }
    assert.equal(JSON.stringify(periods), before);
    const [daily, after, night] = periods.map(calculateDraft);
    assert.equal(daily.totalDirectEnergy, after.totalDirectEnergy + night.totalDirectEnergy);
  }
});
test('only selected periods control finalization; raw export does not need a consumption report', () => {
  const p = reportPeriods();
  p[2].rows[0].end[0] = '';
  assert.equal(selectReport(p, 'after').success, true);
  assert.equal(selectReport(p, 'dailyAfter').success, true);
  assert.equal(selectReport(p, 'all').success, false);
  assert.equal(selectReport(p, 'night').success, false);
  p[0].water.end = '';
  assert.equal(selectReport(p, 'dailyAfter').success, false);
  assert.equal(selectReport(p, 'after').success, true);
  p[1].rows.forEach((row) => row.start.fill(''));
  assert.equal(selectReport(p, 'after').success, false);
  assert.equal(exportRawReading(p[1], 'end').issues.length, 0);
  assert.equal(exportRawReading(p[1], 'start').text, '');
});
test('bundled reports reject mismatched dates, clock times and shared readings without averaging periods', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const p = reportPeriods(plant);
    p[0].endDate = '2026-09-18';
    assert.equal(selectReport(p, 'all').error, 'selectionPeriod');
    p[0].endDate = '2026-09-17';
    p[1].startTime = '08:15';
    assert.equal(selectReport(p, 'dailyAfter').error, 'selectionPeriod');
    p[1].startTime = '08:00';
    p[2].startTime = '17:15';
    assert.equal(selectReport(p, 'all').error, 'selectionPeriod');
    p[2].startTime = '17:00';
    p[0].rows[0].start[0] = '999';
    assert.equal(selectReport(p, 'all').error, 'selectionReadings');
    assert.equal(selectReport(p, 'after').success, true);
    p[0].rows[0].start[0] = '1000,000000';
    assert.equal(selectReport(p, 'all').success, true);
  }
});
test('combined factories use the selected sections and preserve the legacy daily report bytes', () => {
  const jre = reportPeriods(),
    uniland = reportPeriods('UNILAND');
  assert.equal(
    combineReportSelections(selectReport(jre, 'daily'), selectReport(uniland, 'daily')),
    generateFullIndonesiaReport(calculateDraft(jre[0]), calculateDraft(uniland[0])),
  );
  const both = combineReportSelections(selectReport(jre, 'all'), selectReport(uniland, 'all'));
  assert.match(both, /A\) JRE/);
  assert.match(both, /B\) UNILAND/);
  assert.equal(both.split('NIGHT SHIFT:').length, 3);
  uniland[2].endTime = '07:45';
  assert.throws(
    () => combineReportSelections(selectReport(jre, 'night'), selectReport(uniland, 'night')),
    /selectionPeriod/,
  );
});
test('empty cells reuse exact observations across all periods; conflicting old values remain untouched', () => {
  const p = reportPeriods();
  p[1].rows[0].start[0] = '';
  p[0].rows[0].end[0] = '';
  const seeded = seedElectricity(p);
  assert.equal(seeded[1].rows[0].start[0], '1000');
  assert.equal(seeded[0].rows[0].end[0], '1010');
  assert.equal(p[1].rows[0].start[0], '');
  assert.equal(p[0].rows[0].end[0], '');
  p[0].rows[0].start[0] = '999';
  p[1].rows[0].start[0] = '1000';
  const untouched = seedElectricity(p);
  assert.equal(untouched[0].rows[0].start[0], '999');
  assert.equal(untouched[1].rows[0].start[0], '1000');
  assert.equal(electricityConflicts(untouched).length, 1);
});
test('an explicit correction shares only edited cells; flags and gas/Water stay independent', () => {
  const p = reportPeriods();
  p[0].rows[1].start[0] = '999';
  p[1].rows[0].start[0] = '1001.25';
  p[0].rows[11].inactive = true;
  const before = JSON.stringify(p[0].gas),
    next = shareElectricityEdits(p, 'workingHours', [{ ri: 0, mi: 0, side: 'start' }]);
  assert.equal(next[0].rows[0].start[0], '1001.25');
  assert.equal(next[0].rows[1].start[0], '999');
  assert.equal(next[0].rows[11].inactive, true);
  assert.equal(next[1].rows[11].inactive, false);
  assert.equal(JSON.stringify(next[0].gas), before);
  assert.deepEqual(next[0].water, p[0].water);
  const cleared = shareElectricityEdits(
    next,
    'workingHours',
    [{ ri: 0, mi: 0, side: 'start' }].map((f) => {
      next[1].rows[0].start[0] = '';
      return f;
    }),
  );
  assert.equal(cleared[0].rows[0].start[0], '');
  assert.equal(seedElectricity(cleared)[0].rows[0].start[0], '');
});
test('factory, date and time define an observation; ambiguous blanks are never guessed', () => {
  const p = reportPeriods();
  p[1].startTime = '08:15';
  p[1].rows[0].start[0] = '1200';
  assert.equal(
    shareElectricityEdits(p, 'workingHours', [{ ri: 0, mi: 0, side: 'start' }])[0].rows[0].start[0],
    '1000',
  );
  const other = reportPeriods('UNILAND')[0];
  assert.equal(
    shareElectricityEdits([p[1], other], 'workingHours', [{ ri: 0, mi: 0, side: 'start' }])[1]
      .rows[0].start[0],
    '1000',
  );
  const same = { ...structuredClone(p[0]), endDate: '2026-09-18' };
  same.rows[0].start[0] = '999';
  const blank = createDraft('JRE', p[0].startDate, '2026-09-18');
  assert.equal(seedElectricity([p[0], same, blank])[2].rows[0].start[0], '');
});
test('JRE T1-T4 share only matching observations and stay excluded from raw exports and main totals', () => {
  const p = reportPeriods();
  p[1].additionalReadings = [
    { start: '1', end: '3' },
    ...Array.from({ length: 3 }, () => ({ start: '', end: '' })),
  ];
  p[2].additionalReadings = [
    { start: '3', end: '6' },
    ...Array.from({ length: 3 }, () => ({ start: '', end: '' })),
  ];
  const next = seedElectricity(p);
  assert.equal(next[0].additionalReadings[0].start, '1');
  assert.equal(next[0].additionalReadings[0].end, '6');
  assert.equal(calculateDraft(next[0]).totalDirectEnergy, calculateDraft(p[0]).totalDirectEnergy);
  assert.doesNotMatch(exportRawReading(next[0], 'end').text, /T1/);
  assert.match(selectReport(next, 'all').text, /T1 consumption: 5 kWh/);
});
test('source example and ratio-warning provenance survive reuse while saved output remains immutable', () => {
  const p = reportPeriods(),
    snapshot = reportSnapshot(p[0]),
    before = JSON.stringify(snapshot);
  p[1].rows[0].start[0] = '';
  p[0].isExample = true;
  p[0].importIssues = [
    {
      code: 'RATIO_MISMATCH',
      rowIndex: 0,
      meterIndex: 0,
      inputRatio: 7,
      message: 'Synthetic ratio mismatch',
    },
  ];
  const next = seedElectricity(p);
  assert.equal(next[1].isExample, true);
  assert.equal(next[1].importIssues[0].inputRatio, 7);
  assert.equal(JSON.stringify(snapshot), before);
  assert.equal(columnEdits(p[0], ['start'], [0]).filter((f) => f.ri !== undefined).length, 1);
});
