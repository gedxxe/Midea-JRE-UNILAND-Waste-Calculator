import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraft,
  createWorkingHoursDraft,
  calculateDraft,
  generateFullIndonesiaReport,
} from '../engine.js';
import { exampleDraft } from '../examples.js';
import {
  restoreWorkspace,
  restoreDrafts,
  emptyWorkingHours,
  changeWorkPeriod,
  nextDayDraft,
  useDailyMorning,
} from '../storage.js';
import { exportRawReading, formatBlankReadingTemplate } from '../raw-export.js';
import { parseReading } from '../importer.js';
import { reportSnapshot } from '../server/report-data.js';
import { createDraftBackup, restoreDraftBackup } from '../draft-backup.js';
import { graphRecords, graphSegments } from '../graph-data.js';
import { workMinutes, graphPeriodText } from '../reading-period.js';

const owner = 'b89c2b90-bbee-4a90-bd68-a0e9fc761352';
function work(plant = 'JRE') {
  const sample = exampleDraft(plant);
  return { ...createWorkingHoursDraft(plant, sample.startDate), rows: sample.rows };
}
const workspace = () => ({
  version: 4,
  drafts: { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND') },
  workingHours: emptyWorkingHours(),
});

test('both work modes use unchanged electricity factors, Structural, worksheet and gap rules', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const daily = calculateDraft(exampleDraft(plant)),
      draft = work(plant),
      result = calculateDraft(draft);
    assert.equal(result.success, true);
    assert.deepEqual(result.calculatedRows, daily.calculatedRows);
    assert.equal(result.gapKWh, daily.gapKWh);
    assert.deepEqual(result.worksheet, daily.worksheet);
    assert.equal(workMinutes(draft), 540);
    assert.match(result.mainText.split('\n')[0], /WORKING HOURS 08:00 to 17:00 WIB/);
    assert.doesNotMatch(result.mainText, /24 HOURS|^\* LPG:|^\* Water:/m);
    const snapshot = reportSnapshot(draft);
    assert.equal(snapshot.draft.endDate, snapshot.draft.startDate);
    assert.equal(snapshot.draft.endTime, '17:00');
    assert.equal(snapshot.output.reportText, result.reportSectionText);
  }
});

test('work periods reject overnight, mismatched dates, unknown modes, malformed times and daily utilities', () => {
  for (const changes of [
    { endTime: '' },
    { endTime: '25:00' },
    { endTime: '08:00' },
    { endTime: '07:00' },
    { startTime: '08:00:01' },
    { endDate: '2026-09-17' },
    { periodKind: 'shift' },
  ])
    assert.equal(calculateDraft({ ...work(), ...changes }).success, false);
  const d = work();
  d.utilities[0].value = '5';
  assert.throws(() => reportSnapshot(d), /INCOMPLETE_REPORT/);
  d.utilities[0].value = '';
  d.water = { start: '10', end: '20' };
  assert.equal(calculateDraft(d).success, false);
  delete d.water;
  d.gas.entries[0].enabled = true;
  assert.equal(calculateDraft(d).success, false);
  const jre = calculateDraft(work()),
    uniland = calculateDraft(work('UNILAND'));
  assert.match(generateFullIndonesiaReport(jre, uniland), /WORKING HOURS/);
  assert.throws(
    () => generateFullIndonesiaReport(jre, calculateDraft(exampleDraft('UNILAND'))),
    /must match/,
  );
  const changed = work('UNILAND');
  changed.endTime = '17:15';
  assert.throws(() => generateFullIndonesiaReport(jre, calculateDraft(changed)), /must match/);
});

test('date and time changes never relabel readings and Undo origin supports consecutive corrections', () => {
  const d = work();
  d.additionalReadings = [
    { start: '10', end: '12' },
    ...Array.from({ length: 3 }, () => ({ start: '', end: '' })),
  ];
  const next = changeWorkPeriod(d, d.startDate, '08:00', '17:15');
  assert.deepEqual(next.rows[0].start, d.rows[0].start);
  assert.deepEqual(next.rows[0].end, ['']);
  assert.equal(next.additionalReadings[0].end, '');
  const corrected = changeWorkPeriod(next, d.startDate, '08:00', '17:00', d);
  assert.deepEqual(corrected.rows, d.rows);
  assert.deepEqual(corrected.additionalReadings, d.additionalReadings);
  const tomorrow = nextDayDraft(d);
  assert.equal(tomorrow.startDate, '2026-09-17');
  assert.equal(tomorrow.startTime, '08:00');
  assert.equal(tomorrow.endTime, '17:00');
  assert.ok(tomorrow.rows.every((r) => [...r.start, ...r.end].every((v) => v === '')));
  assert.deepEqual(changeWorkPeriod(d, '2026-09-17', '08:00', '17:00').rows, tomorrow.rows);
});

test('explicit morning copy uses matching daily 08:00 observations only and leaves evening/gas untouched', () => {
  const daily = exampleDraft('JRE'),
    d = work();
  d.importIssues = [
    {
      code: 'RATIO_MISMATCH',
      rowIndex: 0,
      meterIndex: 0,
      inputRatio: 7,
      message: 'Synthetic ratio mismatch',
    },
  ];
  daily.importIssues = [
    {
      code: 'RATIO_MISMATCH',
      rowIndex: 0,
      meterIndex: 0,
      inputRatio: 8,
      message: 'Synthetic ratio mismatch',
    },
  ];
  d.startDate = d.endDate = daily.endDate;
  const before = JSON.stringify(daily);
  const copied = useDailyMorning(d, daily);
  assert.deepEqual(
    copied.importIssues.map((i) => i.inputRatio),
    [7, 8],
  );
  assert.deepEqual(copied.rows[0].start, daily.rows[0].end);
  assert.deepEqual(copied.rows[0].end, d.rows[0].end);
  assert.equal(JSON.stringify(daily), before);
  assert.throws(
    () => useDailyMorning({ ...d, startTime: '08:15' }, daily),
    /workMorningUnavailable/,
  );
  assert.throws(
    () => useDailyMorning({ ...d, startDate: '2026-09-18' }, daily),
    /workMorningUnavailable/,
  );
});

test('incomplete work observations, daily drafts and all report references round trip independently', () => {
  const input = workspace();
  input.workingHours.JRE = work();
  input.workingHours.JRE.endTime = '';
  input.workingHours.JRE.rows[0].end[0] = '';
  input.reportLinks = {
    JREWork: { id: owner, revision: 1, startDate: '2026-09-16', endDate: '2026-09-16' },
  };
  const restored = restoreWorkspace(JSON.stringify(input));
  assert.deepEqual(restored.workingHours.JRE.rows, input.workingHours.JRE.rows);
  assert.equal(restored.workingHours.JRE.endTime, '');
  assert.deepEqual(restored.reportLinks, input.reportLinks);
  const backup = restoreDraftBackup(createDraftBackup(input, owner), owner);
  assert.deepEqual(backup.workingHours, restored.workingHours);
  assert.deepEqual(backup.reportLinks, {});
  delete input.workingHours;
  const legacy = restoreWorkspace(JSON.stringify(input));
  const oldBackup = JSON.parse(createDraftBackup(input, owner));
  oldBackup.version = 1;
  assert.equal(restoreDraftBackup(JSON.stringify(oldBackup), owner).workingHours, undefined);
  assert.equal(legacy.workingHours, undefined);
  assert.deepEqual(restoreDrafts(JSON.stringify(input)), legacy.drafts);
  input.drafts.JRE = work();
  assert.throws(() => restoreWorkspace(JSON.stringify(input)), /Daily drafts/);
});

test('time-tagged raw export round trips exactly; invalid or duplicate times fail atomically', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const d = work(plant);
    for (const side of ['start', 'end']) {
      const raw = exportRawReading(d, side);
      assert.equal(raw.issues.length, 0);
      const parsed = parseReading(raw.text, plant);
      assert.equal(parsed.success, true);
      assert.equal(parsed.time, d[side + 'Time']);
      assert.deepEqual(
        parsed.values,
        d.rows.map((row) => row[side]),
      );
      assert.equal(
        parseReading(
          raw.text.replace('Reading time:', 'Reading time: 99:99 WIB\nReading time:'),
          plant,
        ).success,
        false,
      );
    }
    d.endTime = '';
    assert.equal(exportRawReading(d).text, '');
    const blank = formatBlankReadingTemplate(plant, true);
    assert.match(blank, /Reading time: HH:MM WIB/);
    assert.doesNotMatch(blank, /17:00|08:00/);
  }
});

test('work graph points keep actual timestamps without averaging or inventing overnight energy', () => {
  const records = graphRecords(
    [16, 17, 19].map((day) => {
      const d = work();
      d.startDate = d.endDate = '2026-09-' + day;
      d.endTime = '17:15';
      const snapshot = reportSnapshot(d);
      snapshot.period = { kind: 'workingHours', startTime: d.startTime, endTime: d.endTime };
      return {
        id: String(day),
        revision: 1,
        start_date: d.startDate,
        end_date: d.endDate,
        snapshot,
      };
    }),
    'JRE',
  );
  assert.equal(records[0].minutes, 555);
  assert.equal(records[0].values.r0, 3000);
  assert.match(graphPeriodText(records[0]), /08:00 → 17:15 WIB \(9.25 hours\)/);
  assert.equal(records[0].readingEndDate, '2026-09-16');
  assert.deepEqual(
    graphSegments(records, 'r0').map((s) => s.length),
    [2, 1],
  );
});
