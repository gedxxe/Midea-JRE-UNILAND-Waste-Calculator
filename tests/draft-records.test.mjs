import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from '../engine.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';
import {
  periodKey,
  hasEnteredData,
  queueDepartedPeriods,
  restorePeriodQueue,
  samePeriodContent,
} from '../draft-records.js';
import { createDraftBackup, restoreDraftBackup } from '../draft-backup.js';
const owner = 'b89c2b90-bbee-4a90-bd68-a0e9fc761352';
const workspace = () => ({
  version: 4,
  autosaveLayout: 1,
  drafts: {
    JRE: createDraft('JRE', '2026-10-14', '2026-10-15'),
    UNILAND: createDraft('UNILAND', '2026-10-14', '2026-10-15'),
  },
  workingHours: {
    JRE: createWorkingHoursDraft('JRE', '2026-10-14'),
    UNILAND: createWorkingHoursDraft('UNILAND', '2026-10-14'),
  },
  nightShifts: {
    JRE: createNightShiftDraft('JRE', '2026-10-14'),
    UNILAND: createNightShiftDraft('UNILAND', '2026-10-14'),
  },
});
test('dated partial documents preserve invalid raw input and expose only available calculated values', () => {
  for (const plant of ['JRE', 'UNILAND'])
    for (const collection of ['drafts', 'workingHours', 'nightShifts']) {
      const d = workspace()[collection][plant];
      assert.ok(periodKey(d));
      assert.equal(hasEnteredData(d), false);
      d.rows[0].start[0] = '100';
      d.rows[0].end[0] = '110';
      d.water = { start: '123,', end: '' };
      d.gas.entries[3].start.temperature = '99';
      assert.equal(hasEnteredData(d), true);
      const result = reportSnapshot(d, { allowPartial: true });
      assert.equal(result.complete, false);
      assert.equal(result.draft.water.start, '123,');
      assert.equal(result.draft.gas.entries[3].start.temperature, '99');
      const values = graphValues(result, plant);
      assert.equal(values.w0, null);
      assert.ok(values.r0 > 0);
      assert.throws(() => reportSnapshot(d), /INCOMPLETE_REPORT/);
    }
});
test('period departure journals the exact previous data, coalesces replacements and ignores examples', () => {
  const before = workspace();
  before.drafts.JRE.rows[0].start[0] = '123.';
  const original = structuredClone(before);
  const after = workspace();
  after.drafts.JRE.startDate = '2026-10-15';
  after.drafts.JRE.endDate = '2026-10-16';
  let queue = queueDepartedPeriods([], before, after);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].rows[0].start[0], '123.');
  before.drafts.JRE.rows[0].start[0] = '';
  queue = queueDepartedPeriods(queue, before, after);
  assert.equal(queue.length, 1);
  assert.equal(hasEnteredData(queue[0]), false);
  assert.deepEqual(original.drafts.JRE.rows[0].start, ['123.']);
  before.drafts.JRE.isExample = true;
  assert.deepEqual(queueDepartedPeriods([], before, after), []);
  after.drafts.JRE.startDate = '';
  assert.equal(periodKey(after.drafts.JRE), null);
  assert.throws(() => restorePeriodQueue([after.drafts.JRE]));
});
test('manual checkpoint equality ignores key order and engine labels but retains every raw field and output difference', () => {
  const draft = workspace().drafts.JRE;
  const a = { draft, output: { reportText: 'x', worksheetText: 'y' }, engineVersion: 'old' };
  const b = {
    output: { worksheetText: 'y', reportText: 'x' },
    engineVersion: 'new',
    draft: structuredClone(draft),
  };
  assert.equal(samePeriodContent(a, b), true);
  b.draft.rows[0].start[0] = '0';
  assert.equal(samePeriodContent(a, b), false);
  b.draft = structuredClone(draft);
  b.output.reportText = 'z';
  assert.equal(samePeriodContent(a, b), false);
});
test('v5 backup preserves pending periods without secrets and legacy backups leave the journal unspecified', () => {
  const w = workspace();
  const departed = structuredClone(w.drafts.JRE);
  departed.rows[0].start[0] = '77.';
  departed.password = 'synthetic-only';
  w.pendingPeriods = [departed];
  const raw = createDraftBackup(w, owner);
  assert.equal(raw.includes('synthetic-only'), false);
  const restored = restoreDraftBackup(raw, owner);
  assert.equal(restored.pendingPeriods[0].rows[0].start[0], '77.');
  assert.equal(restored.autosaveLayout, 1);
  const old = JSON.parse(raw);
  old.version = 4;
  delete old.pendingPeriods;
  assert.equal('pendingPeriods' in restoreDraftBackup(JSON.stringify(old), owner), false);
  const bad = JSON.parse(raw);
  bad.pendingPeriods[0].startDate = '';
  assert.throws(() => restoreDraftBackup(JSON.stringify(bad), owner), /backupInvalid/);
  bad.pendingPeriods = {};
  assert.throws(() => restoreDraftBackup(JSON.stringify(bad), owner), /backupInvalid/);
});
