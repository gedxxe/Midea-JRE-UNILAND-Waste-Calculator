import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraft,
  createWorkingHoursDraft,
  createNightShiftDraft,
  calculateDraft,
} from '../engine.js';
import {
  emptyNightShifts,
  changeShiftPair,
  nextShiftPair,
  syncShiftReading,
  reconcileShiftPair,
} from '../shifts.js';
import { emptyWorkingHours, restoreWorkspace } from '../storage.js';
import { exampleDraft } from '../examples.js';
import { createDraftBackup, restoreDraftBackup } from '../draft-backup.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphRecords } from '../graph-data.js';
import { workMinutes, graphPeriodText, reportLinkKey } from '../reading-period.js';
import { exportRawReading } from '../raw-export.js';
import { parseReading } from '../importer.js';
const owner = 'b89c2b90-bbee-4a90-bd68-a0e9fc761352';
function pair(plant = 'JRE') {
  const day = {
    ...createWorkingHoursDraft(plant, '2026-09-16'),
    rows: structuredClone(exampleDraft(plant).rows),
  };
  const night = syncShiftReading(day, createNightShiftDraft(plant, day.startDate));
  night.rows.forEach((r, i) => {
    r.end = r.start.map((v) => String(Number(v) + 10));
    r.inactive = day.rows[i].inactive;
  });
  return { day, night };
}
test('Day and Night subtract real cumulative readings and retain the start date, units and utilities boundary', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const { day, night } = pair(plant),
      d = calculateDraft(day),
      n = calculateDraft(night);
    assert.equal(d.success, true);
    assert.equal(n.success, true);
    assert.equal(workMinutes(day), 540);
    assert.equal(workMinutes(night), 900);
    assert.equal(n.reportDate, '2026-09-16');
    assert.match(n.mainText.split('\n')[0], /NIGHT SHIFT.*2026-09-16 17:00 to 2026-09-17 08:00/);
    assert.equal(n.totalDirectEnergy, plant === 'JRE' ? 10 : 32);
    assert.equal(reportSnapshot(night).output.reportText, n.reportSectionText);
    assert.doesNotMatch(n.mainText, /^\* LPG:|^\* Water:|24 HOURS/m);
    assert.notEqual(reportLinkKey(day), reportLinkKey(night));
    const noDelta = structuredClone(night);
    noDelta.rows[0].end = [...noDelta.rows[0].start];
    assert.equal(calculateDraft(noDelta).totalDirectEnergy, 0);
    for (const changes of [
      { endDate: night.startDate },
      { endTime: '17:00' },
      { startTime: '' },
      { endDate: '2026-09-18' },
    ])
      assert.equal(calculateDraft({ ...night, ...changes }).success, false);
    night.water = { start: '1', end: '2' };
    assert.equal(calculateDraft(night).success, false);
  }
});
test('shared evening and JRE additional readings update in both directions without copying period confirmations', () => {
  let { day, night } = pair();
  day.additionalReadings = Array.from({ length: 4 }, () => ({ start: '1', end: '2' }));
  night = syncShiftReading(day, night);
  assert.equal(night.additionalReadings[0].start, '2');
  night.rows[0].start[0] = '123.';
  night.additionalReadings[0].start = '3';
  night.rows[11].inactive = true;
  const updated = syncShiftReading(night, day);
  assert.equal(updated.rows[0].end[0], '123.');
  assert.equal(updated.additionalReadings[0].end, '3');
  assert.equal(updated.rows[11].inactive, day.rows[11].inactive);
  assert.deepEqual(updated.rows[0].start, day.rows[0].start);
  const foreign = { ...night, startDate: '2026-09-18', endDate: '2026-09-19' };
  assert.deepEqual(syncShiftReading(foreign, day), day);
});
test('paired date/time edits and Next day retain only exact timestamp matches including next-morning T readings', () => {
  const { day, night } = pair();
  night.additionalReadings = Array.from({ length: 4 }, () => ({ start: '2', end: '5' }));
  const next = nextShiftPair(day, night);
  assert.equal(next.day.startDate, '2026-09-17');
  assert.equal(next.night.endDate, '2026-09-18');
  assert.deepEqual(next.day.rows[0].start, night.rows[0].end);
  assert.equal(next.day.additionalReadings[0].start, '5');
  assert.equal(next.day.rows[0].end[0], '');
  assert.equal(next.night.rows[0].start[0], '');
  assert.equal(next.night.rows[0].end[0], '');
  const moved = changeShiftPair(day, night, 'nightShift', day.startDate, '17:15', '08:00');
  assert.equal(moved.day.endTime, '17:15');
  assert.equal(moved.day.rows[0].end[0], '');
  assert.equal(moved.night.rows[0].start[0], '');
  assert.deepEqual(moved.night.rows[0].end, night.rows[0].end);
  const undone = changeShiftPair(
    moved.day,
    moved.night,
    'nightShift',
    day.startDate,
    '17:00',
    '08:00',
    [day, night],
  );
  assert.deepEqual(undone.day.rows, day.rows);
  assert.deepEqual(undone.night.rows, night.rows);
});
test('workspace and private backup preserve all three modes, partials and shared conflicts atomically', () => {
  const p = pair(),
    w = {
      version: 4,
      drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') },
      workingHours: emptyWorkingHours(),
      nightShifts: emptyNightShifts(),
    };
  w.workingHours.JRE = p.day;
  w.nightShifts.JRE = p.night;
  w.nightShifts.JRE.rows[0].end[0] = '123.';
  const restored = restoreWorkspace(JSON.stringify(w));
  assert.deepEqual(restored.nightShifts.JRE.rows, w.nightShifts.JRE.rows);
  assert.deepEqual(
    restoreDraftBackup(createDraftBackup(w, owner), owner).nightShifts,
    restored.nightShifts,
  );
  const old = structuredClone(w);
  delete old.nightShifts;
  assert.equal(restoreWorkspace(JSON.stringify(old)).nightShifts, undefined);
  const before = JSON.stringify(w);
  w.nightShifts.JRE.rows[0].start[0] = '999';
  assert.throws(() => restoreWorkspace(JSON.stringify(w)), /shiftConflict/);
  assert.notEqual(JSON.stringify(w), before);
  const missing = pair();
  missing.night.rows[0].start[0] = '';
  assert.deepEqual(
    reconcileShiftPair(missing.day, missing.night).night.rows[0].start,
    missing.day.rows[0].end,
  );
  missing.night.rows[0].start[0] = missing.day.rows[0].end[0] + '.0';
  assert.doesNotThrow(() => reconcileShiftPair(missing.day, missing.night));
});
test('Night raw columns retain actual dates and optional date labels never guess a reading time', () => {
  const { night } = pair();
  for (const side of ['start', 'end']) {
    const raw = exportRawReading(night, side),
      parsed = parseReading(raw.text, 'JRE');
    assert.equal(parsed.success, true);
    assert.equal(parsed.date, night[side + 'Date']);
    assert.equal(parsed.time, night[side + 'Time']);
    for (const label of [' (Morning)', ' (Afternoon)', ' ( Sore/night shift )', ' day shift']) {
      const plain = raw.text
        .replace(/^Reading time:.*\n/m, '')
        .replace(/16\/09\/2026|17\/09\/2026/, (x) => x + label);
      const result = parseReading(plain, 'JRE');
      assert.equal(result.success, true);
      assert.equal(result.time, undefined);
    }
  }
});
test('Night graphs use immutable saved output and real next-date reading time without daily utility series', () => {
  const { night } = pair('UNILAND'),
    snapshot = reportSnapshot(night);
  snapshot.period = { kind: 'nightShift', startTime: night.startTime, endTime: night.endTime };
  const [r] = graphRecords(
    [
      {
        id: 'synthetic',
        revision: 1,
        start_date: night.startDate,
        end_date: night.endDate,
        snapshot,
      },
    ],
    'UNILAND',
  );
  assert.equal(r.periodKind, 'nightShift');
  assert.equal(r.readingEndDate, '2026-09-17');
  assert.equal(r.minutes, 900);
  assert.equal(r.values.r0, 32000);
  assert.match(graphPeriodText(r), /2026-09-17 08:00 WIB \(15 hours\)/);
  night.rows[0].end[0] = '999999';
  assert.equal(r.values.r0, 32000);
});

test('shared observation identity includes the factory and cannot transfer between plants', () => {
  const jre = pair('JRE'),
    uniland = pair('UNILAND');
  assert.deepEqual(syncShiftReading(jre.day, uniland.night), uniland.night);
  assert.throws(
    () => changeShiftPair(jre.day, uniland.night, 'workingHours', '2026-09-16', '08:00', '17:00'),
    /factories must match/,
  );
});
