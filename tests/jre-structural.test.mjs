import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraft,
  createWorkingHoursDraft,
  createNightShiftDraft,
  calculateDraft,
} from '../engine.js';
import { exportRawReading } from '../raw-export.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';

function entered(make = createDraft) {
  const d = make('JRE', '2026-10-21', ...(make === createDraft ? ['2026-10-22'] : []));
  d.rows.forEach((r) => {
    r.start.fill('1000');
    r.end.fill('1000');
  });
  d.rows[0].end[0] = '2000';
  d.rows[15].start[0] = '10';
  d.rows[15].end[0] = '11';
  d.rows[19].end[0] = '1030';
  return d;
}
const structural = (r) => r.calculatedRows[19];

test('Structural floors only negative valid net, keeps equality and positive usage in all three periods', () => {
  for (const make of [createDraft, createWorkingHoursDraft, createNightShiftDraft]) {
    for (const [end, net] of [
      ['1030', 0],
      ['1040', 0],
      ['1050', 10],
    ]) {
      const draft = entered(make);
      draft.rows[19].end[0] = end;
      const before = structuredClone(draft),
        result = calculateDraft(draft),
        row = structural(result);
      assert.equal(result.success, true);
      assert.equal(row.totalEnergy, net);
      assert.equal(row.grossEnergy, Number(end) - 1000);
      assert.equal(row.meters[0].energy, Number(end) - 1000);
      assert.equal(row.deductedEnergy, 40);
      assert.equal(result.totalDirectEnergy, 1000);
      assert.equal(result.subAreasSumKWh, 40 + net);
      assert.equal(result.gapKWh, -960 + net);
      assert.equal(result.worksheet.values[result.worksheet.headers.indexOf('Structural')], net);
      assert.ok(!result.issues.some((i) => i.rowIndex === 19));
      assert.match(
        result.mainText,
        new RegExp('20\\. Structural Laboratory: ' + (net ? net.toFixed(2) : '0') + ' kWh'),
      );
      assert.equal(graphValues(reportSnapshot(draft), 'JRE').w11, net);
      assert.ok(exportRawReading(draft, 'end').text.includes('20. Structural Laboratory: ' + end));
      assert.deepEqual(draft, before);
    }
  }
});

test('Structural never floors a missing, invalid, unavailable or decreasing parent/source observation', () => {
  for (const row of [15, 19])
    for (const side of ['start', 'end']) {
      for (const value of [
        '',
        '-',
        'bad',
        '1000000000000.000001',
        side === 'start' ? '999999' : '1',
      ]) {
        const draft = entered();
        draft.rows[row][side][0] = value;
        const result = calculateDraft(draft);
        assert.equal(structural(result).totalEnergy, null);
        assert.equal(result.subAreasSumKWh, null);
        assert.equal(result.gapKWh, null);
        assert.match(result.mainText, /20\. Structural Laboratory: -\n/);
      }
    }
});

test('Structural uses only Piping meter 1 even if other Piping components are large or unavailable', () => {
  for (const [ri, mi, value] of [
    [15, 1, '9000'],
    [15, 2, '9000'],
    [15, 1, ''],
    [15, 2, ''],
    [3, 5, ''],
  ]) {
    const draft = entered();
    draft.rows[ri].end[mi] = value;
    assert.equal(structural(calculateDraft(draft)).totalEnergy, 0);
    draft.rows[19].end[0] = '1050';
    assert.equal(structural(calculateDraft(draft)).totalEnergy, 10);
  }
});

test('Structural compares scaled usage before flooring at the cumulative maximum', () => {
  const draft = entered();
  draft.rows[15].start[0] = '0';
  draft.rows[15].end[0] = '24999999999.999999';
  draft.rows[19].start[0] = '0';
  for (const [end, net] of [
    ['999999999999.999959', 0],
    ['999999999999.999960', 0],
    ['999999999999.999961', 0.000001],
  ]) {
    draft.rows[19].end[0] = end;
    assert.equal(structural(calculateDraft(draft)).totalEnergy, net);
  }
});

test('Structural zero exception cannot turn negative Building 2, Building 3 or Piping nets into zero', () => {
  const draft = entered();
  draft.rows[5].end[0] = '1001';
  draft.rows[16].end[0] = '1001';
  draft.rows[3].end[5] = '1001';
  const result = calculateDraft(draft);
  assert.equal(structural(result).totalEnergy, 0);
  for (const ri of [9, 15, 18]) {
    assert.equal(result.calculatedRows[ri].totalEnergy, null);
    assert.ok(result.issues.some((i) => i.rowIndex === ri && i.code === 'NET_USAGE_NEGATIVE'));
  }
});

test('Structural compares consumption rather than the absolute cumulative counter', () => {
  const draft = entered();
  draft.rows[19].start[0] = '5000000';
  draft.rows[19].end[0] = '5000005';
  assert.equal(structural(calculateDraft(draft)).totalEnergy, 0);
  draft.rows[19].start[0] = '10';
  draft.rows[19].end[0] = '60';
  draft.rows[15].start[0] = '10000';
  draft.rows[15].end[0] = '10001';
  assert.equal(structural(calculateDraft(draft)).totalEnergy, 10);
});
