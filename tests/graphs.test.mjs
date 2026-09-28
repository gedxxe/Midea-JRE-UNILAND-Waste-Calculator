import test from 'node:test';
import assert from 'node:assert/strict';
import { graphValues, graphRecords, graphSegments } from '../graph-data.js';
import { defaultGraphs, GRAPH_METRICS, validGraph } from '../graph-schema.js';
import { reportSnapshot } from '../server/report-data.js';
import { exampleDraft } from '../examples.js';
import { periodLabel, graphYAxis } from '../graph-axis.js';
import { PLANT_SCHEMAS } from '../schema.js';
const saved = (plant = 'JRE') => reportSnapshot(exampleDraft(plant));

test('new Structural snapshots graph net usage while historical snapshots retain their saved values', () => {
  const draft = exampleDraft('JRE');
  const structural = PLANT_SCHEMAS.JRE.rows.findIndex(
    (row) => row.name === 'Structural Laboratory',
  );
  const piping = PLANT_SCHEMAS.JRE.rows.findIndex((row) => row.name === 'Piping Building 1#');
  draft.rows[structural].start = ['1000'];
  draft.rows[structural].end = ['1150'];
  draft.rows[piping].start = ['10'];
  draft.rows[piping].end = ['11'];
  const snapshot = reportSnapshot(draft);
  assert.match(snapshot.output.reportText, /20\. Structural Laboratory: 110\.00 kWh/);
  assert.equal(graphValues(snapshot, 'JRE').w11, 110);
  assert.deepEqual(snapshot.draft.rows[structural], draft.rows[structural]);
  const historical = structuredClone(snapshot);
  historical.engineVersion = '0.9.0-alpha';
  historical.output.worksheetText = historical.output.worksheetText.replace(
    /^Structural:.*$/m,
    'Structural: 150',
  );
  historical.output.reportText = historical.output.reportText.replace(
    'Structural Laboratory: 110.00',
    'Structural Laboratory: 150.00',
  );
  assert.equal(graphValues(historical, 'JRE').w11, 150);
  draft.rows[piping].end = ['20'];
  assert.equal(graphValues(reportSnapshot(draft), 'JRE').w11, null);
});

test('period labels show every included consumption date without treating the final reading as another day', () => {
  assert.equal(periodLabel('2026-09-18', '2026-09-21'), '18–20/09');
  assert.equal(periodLabel('2026-09-18', '2026-09-19'), '18/09');
  assert.equal(periodLabel('2026-09-30', '2026-10-03'), '30/09–02/10');
  assert.equal(periodLabel('2026-12-31', '2027-01-03'), '31/12/26–02/01/27');
  assert.equal(periodLabel('2028-02-28', '2028-03-01'), '28–29/02');
});

test('manual axis bounds validate saved layouts, retain exact limits and detect clipped values', () => {
  const values = [null, 0, 150, 210];
  const auto = graphYAxis(values);
  assert.equal(auto.min, 0);
  assert.ok(auto.max >= 210);
  const manual = graphYAxis(values, { mode: 'manual', min: 100, max: 200 });
  assert.equal(manual.min, 100);
  assert.equal(manual.max, 200);
  assert.equal(manual.clipped, true);
  assert.equal(manual.ticks.length, 6);
  assert.equal(graphYAxis(values, { mode: 'manual', min: 10, max: 10 }), null);
  assert.equal(graphYAxis(values, { mode: 'manual', min: 0, max: 1e-100 }), null);
  const old = { ...defaultGraphs('JRE')[0] };
  delete old.yAxis;
  assert.deepEqual(validGraph('JRE', old).yAxis, { mode: 'auto' });
  assert.equal(validGraph('JRE', { ...old, yAxis: { mode: 'manual', min: -1, max: 10 } }), null);
  assert.deepEqual(values, [null, 0, 150, 210]);
});
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
