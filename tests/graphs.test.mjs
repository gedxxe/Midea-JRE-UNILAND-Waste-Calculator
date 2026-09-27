import test from 'node:test';
import assert from 'node:assert/strict';
import { graphValues, graphRecords, graphSegments } from '../graph-data.js';
import { defaultGraphs, GRAPH_METRICS, validGraph } from '../graph-schema.js';
import { reportSnapshot } from '../server/report-data.js';
import { exampleDraft } from '../examples.js';
const saved = (plant = 'JRE') => reportSnapshot(exampleDraft(plant));
test('workbook graph presets keep 9 JRE and 7 UNILAND charts and correct Window aliases', () => {
  assert.equal(defaultGraphs('JRE').length, 9);
  assert.equal(defaultGraphs('UNILAND').length, 7);
  assert.equal(GRAPH_METRICS.JRE.find((m) => m.key === 'w2').label, 'Window A');
  assert.equal(GRAPH_METRICS.JRE.find((m) => m.key === 'w3').label, 'Window B');
  assert.deepEqual(defaultGraphs('JRE')[0].series, ['w1', 'w2', 'w3', 'w4']);
  for (const plant of ['JRE', 'UNILAND'])
    for (const graph of defaultGraphs(plant)) assert.deepEqual(validGraph(plant, graph), graph);
});
test('graph data uses saved results even if raw readings or the current engine differ', () => {
  const snapshot = saved();
  const original = graphValues(snapshot, 'JRE');
  snapshot.draft.rows[0].start[0] = '999999';
  snapshot.draft.rows[0].end[0] = '';
  assert.deepEqual(graphValues(snapshot, 'JRE'), original);
  snapshot.output.worksheetText = snapshot.output.worksheetText.replace(
    /^Indoor:.*$/m,
    'Indoor: 123.456',
  );
  assert.equal(graphValues(snapshot, 'JRE').w0, 123.456);
  assert.equal(original.w5, original.w6 + original.w7);
});
test('missing, unavailable or malformed saved values remain gaps; actual zero remains zero', () => {
  const snapshot = saved();
  snapshot.output.worksheetText = snapshot.output.worksheetText
    .replace(/^Indoor:.*$/m, 'Indoor: -')
    .replace(/^Outdoor:.*$/m, 'Outdoor: 0');
  let values = graphValues(snapshot, 'JRE');
  assert.equal(values.w0, null);
  assert.equal(values.w1, 0);
  snapshot.output.worksheetText += '\nOutdoor: 100';
  values = graphValues(snapshot, 'JRE');
  assert.equal(values.w1, null);
  assert.ok(Object.values(graphValues({}, 'JRE')).every((v) => v === null));
  snapshot.output.worksheetText = 'JRE ELECTRICAL WORKSHEET:\nIndoor: 123 garbage';
  assert.equal(graphValues(snapshot, 'JRE').w0, null);
});
test('UNILAND grouped values follow the worksheet and MWh meters normalize to kWh', () => {
  const snapshot = saved('UNILAND'),
    values = graphValues(snapshot, 'UNILAND');
  assert.equal(values.w0, values.w2 + values.w5);
  assert.equal(values.w1, values.w3 + values.w6 + values.w7);
  assert.equal(
    values.r0,
    Number(/^1\. Total: ([\d.]+) MWh$/m.exec(snapshot.output.reportText)[1]) * 1000,
  );
  snapshot.output.reportText += '\n* Oxygen: 12.5 mmWc (checked)';
  assert.equal(graphValues(snapshot, 'UNILAND').u2, 12.5);
});
test('saved gas calculation is charted as kg, separate from electricity and raw tank level', () => {
  const draft = exampleDraft('JRE');
  draft.gas.entries[3] = {
    enabled: true,
    start: { reading: '587', temperature: '33.5' },
    end: { reading: '550', temperature: '33.5' },
    refills: [],
  };
  const values = graphValues(reportSnapshot(draft), 'JRE');
  assert.equal(values.u3, 154.2086);
  const graph = { ...defaultGraphs('JRE')[0], series: ['u3'] };
  assert.equal(validGraph('JRE', graph), null);
  graph.unit = 'kg';
  assert.ok(validGraph('JRE', graph));
  graph.series = ['u3', 'w0'];
  assert.equal(validGraph('JRE', graph), null);
});
test('chronological segments break on missing dates, null values and overlapping periods', () => {
  const row = (start, end, values = { w0: 10 }) => ({
    startDate: start,
    endDate: end,
    days: 1,
    overlap: false,
    values,
  });
  const rows = [
    row('2026-09-01', '2026-09-02'),
    row('2026-09-02', '2026-09-03'),
    row('2026-09-04', '2026-09-05'),
    row('2026-09-05', '2026-09-06', { w0: null }),
    row('2026-09-06', '2026-09-07', { w0: 0 }),
  ];
  assert.deepEqual(
    graphSegments(rows, 'w0').map((s) => s.length),
    [2, 1, 1],
  );
  const records = graphRecords(
    [
      { id: 'a', revision: 2, start_date: '2026-09-01', end_date: '2026-09-03', snapshot: saved() },
      { id: 'b', revision: 1, start_date: '2026-09-02', end_date: '2026-09-03', snapshot: saved() },
      { id: 'c', revision: 1, start_date: '2026-09-03', end_date: '2026-09-04', snapshot: saved() },
    ],
    'JRE',
  );
  assert.deepEqual(
    records.map((r) => r.overlap),
    [true, true, false],
  );
  assert.equal(records[0].days, 2);
  assert.equal(graphSegments(records, 'w0').flat().length, 1);
});
