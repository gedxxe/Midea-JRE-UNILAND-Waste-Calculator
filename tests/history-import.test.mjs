import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHistory } from '../server/history-import.js';
import { graphRecords, graphSegments } from '../graph-data.js';
import { reportSnapshot } from '../server/report-data.js';
import { exampleDraft } from '../examples.js';
const input = () => ({
  version: 1,
  sourceName: 'synthetic.xlsx',
  sourceSha256: 'a'.repeat(64),
  records: [
    {
      plant: 'JRE',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      values: { w0: 12, w1: 0, w5: null, w6: null, w7: 4 },
      sheet: 'JRE',
      row: 4,
      range: 'C4:T4',
    },
  ],
});
test('history preserves period totals, zero and missing components without manufacturing meter readings', () => {
  const result = validateHistory(input());
  assert.equal(result.records[0].values.w0, 12);
  assert.equal(result.records[0].values.w1, 0);
  assert.equal(result.records[0].values.w5, null);
  assert.equal(result.records[0].endDate, '2026-09-03');
  assert.equal(result.records[0].draft, undefined);
});
test('history rejects invalid values, foreign metrics, overlapping rows and incomplete group totals before import', () => {
  for (const patch of [
    { w0: -1 },
    { w0: Infinity },
    { w0: '12' },
    { r0: 12 },
    { w5: 0, w6: null, w7: 0 },
  ]) {
    const data = input();
    data.records[0].values = patch;
    assert.throws(() => validateHistory(data));
  }
  const data = input();
  data.records.push({ ...data.records[0], startDate: '2026-09-02' });
  assert.throws(() => validateHistory(data), /OVERLAPPING_IMPORT_ROWS/);
});
test('saved reports take precedence over imported periods without hiding the saved report', () => {
  const h = (id, start, end) => ({
    id,
    start_date: start,
    end_date: end,
    metric_values: { w0: 12 },
    source_name: 'synthetic.xlsx',
    source_sheet: 'JRE',
    source_range: 'C4:T4',
  });
  const rows = graphRecords(
    [
      {
        id: 'r',
        revision: 2,
        start_date: '2026-09-02',
        end_date: '2026-09-03',
        snapshot: reportSnapshot(exampleDraft('JRE')),
      },
    ],
    'JRE',
    [h('h', '2026-09-01', '2026-09-03'), h('next', '2026-09-03', '2026-09-04')],
  );
  assert.equal(rows.find((r) => r.id === 'h').superseded, true);
  assert.equal(rows.find((r) => r.id === 'r').overlap, false);
  assert.equal(rows.find((r) => r.id === 'next').superseded, false);
  assert.deepEqual(
    graphSegments(rows, 'w0')
      .flat()
      .map((r) => r.id),
    ['r', 'next'],
  );
  assert.equal(rows.find((r) => r.id === 'next').values.r0, null);
});
