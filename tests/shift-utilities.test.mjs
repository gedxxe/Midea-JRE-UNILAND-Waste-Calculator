import test from 'node:test';
import assert from 'node:assert/strict';
import { utilityPeriods } from './fixtures/shift-utilities.mjs';
import { calculateDraft, createWorkingHoursDraft, createNightShiftDraft } from '../engine.js';
import {
  seedUtilityReadings,
  shareUtilityEdits,
  utilityConflicts,
  refillConflicts,
  moveUtilityPeriod,
} from '../utility-periods.js';
import { selectReport } from '../report-options.js';
import { nextShiftPair, changeShiftPair } from '../shifts.js';
import { restoreWorkspace, changeWorkPeriod } from '../storage.js';
import { createDraftBackup, restoreDraftBackup } from '../draft-backup.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';
import { exportRawReading } from '../raw-export.js';
const owner = 'b89c2b90-bbee-4a90-bd68-a0e9fc761352';
const choices = { daily: 1, dailyAfter: 2, all: 3, after: 1, night: 1 };

test('gas, Water and manual utility values calculate and report within each selected period for both plants', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const periods = utilityPeriods(plant),
      before = structuredClone(periods),
      results = periods.map(calculateDraft);
    for (const [i, result] of results.entries()) {
      assert.equal(result.success, true);
      assert.equal(result.gasResults.length, 4);
      assert.equal(result.waterResult.value, String([30, 10, 20][i]));
      assert.match(result.reportSectionText, /Water: (10|20|30) m³/);
      assert.match(result.reportSectionText, /LPG: [\d.]+ Kg/);
      const saved = reportSnapshot(periods[i]);
      assert.deepEqual(saved.draft.gas, periods[i].gas);
      assert.equal(graphValues(saved, plant).u4, [30, 10, 20][i]);
      const raw = exportRawReading(periods[i], 'end').text;
      assert.doesNotMatch(raw, /^(?:[*-] )?(?:Water|LPG|Oxygen):/m);
    }
    for (let i = 0; i < 4; i++)
      assert.ok(
        Math.abs(
          results[0].gasResults[i].kg - results[1].gasResults[i].kg - results[2].gasResults[i].kg,
        ) < 0.000001,
      );
    for (const [option, count] of Object.entries(choices)) {
      const selected = selectReport(periods, option);
      assert.equal(selected.success, true, option);
      assert.equal(selected.text.split('\n').filter((l) => /^[*-] Water:/.test(l)).length, count);
      assert.equal(selected.text.split('\n').filter((l) => /^[*-] LPG:/.test(l)).length, count);
    }
    assert.deepEqual(periods, before);
  }
});

test('shared gas readings include R32 temperature while manual amounts, enable switches and refill lists remain period-scoped', () => {
  const p = utilityPeriods();
  p[1].gas.entries[3].end = { reading: '850', temperature: '33.25' };
  p[2].gas.entries[3].start = { reading: '900', temperature: '34' };
  p[1].utilities[0].value = '123';
  p[1].gas.entries[0].refills = [
    { before: { reading: '60', temperature: '' }, after: { reading: '75', temperature: '' } },
  ];
  const old = structuredClone(p);
  let next = shareUtilityEdits(p, 'workingHours', [
    { kind: 'gas', index: 3, side: 'end', field: 'reading' },
    { kind: 'gas', index: 3, side: 'end', field: 'temperature' },
  ]);
  assert.deepEqual(next[2].gas.entries[3].start, p[1].gas.entries[3].end);
  assert.equal(next[2].utilities[0].value, p[2].utilities[0].value);
  assert.deepEqual(next[2].gas.entries[0].refills, []);
  assert.equal(next[2].gas.entries[0].enabled, p[2].gas.entries[0].enabled);
  assert.deepEqual(p, old);
  next = shareUtilityEdits(next, 'workingHours', [{ kind: 'water', side: 'end' }]);
  assert.equal(next[2].water.start, p[1].water.end);
  assert.equal(next[2].water.end, p[2].water.end);
});

test('seeding shares only unambiguous observations and retains conflicting legacy stock or temperature', () => {
  const p = utilityPeriods();
  p[2].gas.entries[3].start = { reading: '', temperature: '' };
  const seeded = seedUtilityReadings(p);
  assert.deepEqual(seeded[2].gas.entries[3].start, p[1].gas.entries[3].end);
  p[2].gas.entries[3].start = { reading: '900', temperature: '35' };
  const kept = seedUtilityReadings(p);
  assert.deepEqual(kept[2].gas.entries[3].start, p[2].gas.entries[3].start);
  assert.ok(utilityConflicts(kept).some((c) => c.kind === 'gas' && c.index === 3));
  assert.equal(selectReport(kept, 'all').error, 'selectionReadings');
  assert.equal(selectReport(kept, 'night').success, true);
  p[2].startTime = '17:15';
  assert.equal(utilityConflicts(p).length, 0);
});

test('refill corrections are counted once per report and bundles reject omitted, duplicated or reordered events', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const p = utilityPeriods(plant),
      [daily, after, night] = p.map((d) => d.gas.entries[0]);
    const event = (before, end) => ({
      before: { reading: before, temperature: '' },
      after: { reading: end, temperature: '' },
    });
    after.start.reading = daily.start.reading = '80';
    after.end.reading = night.start.reading = '85';
    night.end.reading = daily.end.reading = '90';
    after.refills = [event('70', '90')];
    night.refills = [event('80', '95')];
    daily.refills = structuredClone([...after.refills, ...night.refills]);
    assert.equal(refillConflicts(p), false);
    assert.equal(selectReport(p, 'all').success, true);
    const r = p.map(calculateDraft);
    assert.ok(
      Math.abs(r[0].gasResults[0].kg - r[1].gasResults[0].kg - r[2].gasResults[0].kg) < 0.000001,
    );
    daily.refills = [];
    assert.equal(selectReport(p, 'all').error, 'selectionRefills');
    assert.equal(selectReport(p, 'after').success, true);
    daily.refills = structuredClone([...night.refills, ...after.refills]);
    assert.equal(selectReport(p, 'all').error, 'selectionRefills');
  }
});

test('date/time movement, next day and Undo origins preserve shared morning stock and clear other-period totals/events', () => {
  const [daily, after, night] = utilityPeriods();
  after.gas.entries[0].refills = [
    { before: { reading: '70', temperature: '' }, after: { reading: '80', temperature: '' } },
  ];
  after.utilities[0].value = '12';
  const same = changeShiftPair(
    after,
    night,
    'workingHours',
    after.startDate,
    after.startTime,
    after.endTime,
  );
  assert.deepEqual(same.day.gas, after.gas);
  assert.equal(same.day.utilities[0].value, '12');
  const moved = changeShiftPair(after, night, 'workingHours', after.startDate, '08:00', '17:15');
  assert.equal(moved.day.gas.entries[0].end.reading, '');
  assert.deepEqual(moved.day.gas.entries[0].refills, []);
  assert.equal(moved.day.utilities[0].value, '');
  const back = changeShiftPair(
    moved.day,
    moved.night,
    'workingHours',
    after.startDate,
    '08:00',
    '17:00',
    [after, night],
  );
  assert.deepEqual(back.day.gas, after.gas);
  assert.equal(back.day.utilities[0].value, '12');
  const next = nextShiftPair(after, night);
  assert.deepEqual(next.day.gas.entries[3].start, night.gas.entries[3].end);
  assert.equal(next.day.water.start, night.water.end);
  assert.equal(next.day.water.end, '');
  assert.equal(next.day.gas.entries[0].enabled, true);
  assert.deepEqual(next.day.gas.entries[0].refills, []);
  assert.equal(next.night.gas.entries[0].start.reading, '');
  assert.deepEqual(changeWorkPeriod(after, after.startDate, '08:00', '17:00').gas, after.gas);
});

test('legacy manual Water is not reverse-converted, inactive utility drafts do not enable themselves and factories do not share', () => {
  const p = utilityPeriods();
  delete p[0].water;
  p[0].utilities[4].value = '55';
  p[1].water.start = '1002';
  const shared = shareUtilityEdits(p, 'workingHours', [{ kind: 'water', side: 'start' }]);
  assert.equal(shared[0].water, undefined);
  assert.equal(shared[0].utilities[4].value, '55');
  const other = createNightShiftDraft('UNILAND', p[1].startDate);
  assert.equal(
    shareUtilityEdits([p[1], other], 'workingHours', [
      { kind: 'gas', index: 0, side: 'end', field: 'reading' },
    ])[1].gas.entries[0].start.reading,
    '',
  );
  const disabled = createWorkingHoursDraft('JRE', p[0].startDate);
  const seeded = seedUtilityReadings([p[0], disabled]);
  assert.equal(seeded[1].gas.entries[0].enabled, false);
  assert.equal(seeded[1].water, undefined);
  assert.equal(seeded[1].utilities[0].value, '');
});

test('invalid observations and stock increases use the existing gas/Water rules in shifts', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const p = utilityPeriods(plant),
      night = p[2];
    night.gas.entries[2].end.reading = '1100';
    const result = calculateDraft(night);
    assert.equal(result.success, true);
    assert.ok(result.gasResults[2].kg < 0);
    assert.match(result.reportSectionText, /Nitrogen: \+[\d.]+ Kg \(measured stock increase\)/);
    const index = plant === 'JRE' ? 2 : 3;
    assert.equal(
      graphValues(reportSnapshot(night), plant)['kg' + index] ??
        graphValues(reportSnapshot(night), plant)['u' + index],
      null,
    );
    night.gas.entries[3].end.temperature = '';
    assert.equal(calculateDraft(night).success, false);
    night.gas.entries[3].end.temperature = '34.5';
    night.water.end = '';
    assert.equal(calculateDraft(night).success, false);
  }
});

test('new backups retain incomplete shift utilities, reject foreign/unknown formats and read older workspace snapshots', () => {
  const j = utilityPeriods(),
    u = utilityPeriods('UNILAND');
  j[1].gas.entries[3].end.temperature = '';
  const workspace = {
    version: 4,
    drafts: { JRE: j[0], UNILAND: u[0] },
    workingHours: { JRE: j[1], UNILAND: u[1] },
    nightShifts: { JRE: j[2], UNILAND: u[2] },
  };
  // Restore needs compatible shared observations, including incomplete temperatures.
  j[2].gas.entries[3].start.temperature = '';
  const backup = createDraftBackup(workspace, owner);
  assert.equal(JSON.parse(backup).version, 5);
  const restored = restoreDraftBackup(backup, owner);
  assert.deepEqual(restored.workingHours.JRE.gas, workspace.workingHours.JRE.gas);
  assert.equal(restored.workingHours.JRE.utilityLayout, 1);
  const legacy = structuredClone(workspace);
  for (const key of ['workingHours', 'nightShifts'])
    for (const d of Object.values(legacy[key])) delete d.utilityLayout;
  assert.equal(restoreWorkspace(JSON.stringify(legacy)).nightShifts.JRE.utilityLayout, 1);
  legacy.workingHours.JRE.utilityLayout = 2;
  assert.throws(() => restoreWorkspace(JSON.stringify(legacy)), /format/);
});
