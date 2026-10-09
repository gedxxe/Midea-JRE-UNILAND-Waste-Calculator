import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWater } from '../water.js';
import { createDraft, calculateDraft } from '../engine.js';
import { exampleDraft } from '../examples.js';
import { restoreDrafts, nextDayDraft, changeDraftPeriod } from '../storage.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';

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
