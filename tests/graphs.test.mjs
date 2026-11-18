import test from 'node:test';
import assert from 'node:assert/strict';
import { graphValues, graphRecords, graphSegments } from '../graph-data.js';
import { defaultGraphs, GRAPH_METRICS, validGraph } from '../graph-schema.js';
import { reportSnapshot } from '../server/report-data.js';
import { electricityConflicts } from '../observations.js';
import { utilityConflicts } from '../utility-periods.js';
import { workingDailyRows } from '../server/graphs.js';
import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from '../engine.js';
import { calculateGas, gasCalibration } from '../gas.js';
import { exampleDraft } from '../examples.js';
import { periodLabel, graphYAxis } from '../graph-axis.js';
import { graphValueLabel } from '../graph-presentation.js';
import { PLANT_SCHEMAS } from '../schema.js';
const saved = (plant = 'JRE') => reportSnapshot(exampleDraft(plant));

function gasWorkingRows(plant) {
  const daily = createDraft(plant, '2026-09-10', '2026-09-11');
  const day = createWorkingHoursDraft(plant, '2026-09-10');
  const night = createNightShiftDraft(plant, '2026-09-10');
  for (const draft of [daily, day, night]) {
    draft.rows.forEach((r) => {
      r.start.fill('100');
      r.end.fill('120');
    });
    draft.gas.entries.forEach((entry, i) => {
      const point = (reading) => ({
        reading,
        temperature: i === 3 && plant === 'UNILAND' ? '25' : '',
        ...(i === 3 && plant === 'JRE' ? { unit: 'kg' } : {}),
      });
      const [a, b, c] = i === 0 ? ['70', '60', '65'] : ['1600', '1400', '1500'];
      entry.enabled = draft !== daily;
      entry.start = point(draft === night ? c : a);
      entry.end = point(draft === day ? c : b);
      entry.refills = draft === day ? [{ before: point(b), after: point(c) }] : [];
    });
  }
  const row = (draft, id) => ({
    id,
    revision: 1,
    start_date: draft.startDate,
    end_date: draft.endDate,
    report_kind: draft.periodKind || 'daily',
    autosaved: true,
    snapshot: reportSnapshot(draft, { allowPartial: true }),
  });
  return { rows: [row(daily, 'daily')], shifts: [row(day, 'day'), row(night, 'night')] };
}

test('daily gas gaps use an exact saved shift partition including refills, without changing stored records', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const { rows, shifts } = gasWorkingRows(plant),
      before = structuredClone({ rows, shifts });
    const original = graphValues(rows[0].snapshot, plant);
    const records = graphRecords(
      workingDailyRows(rows, plant, undefined, undefined, shifts),
      plant,
    );
    assert.equal(records.length, 1);
    const keys = gasCalibration(plant).gases.map((gas) =>
      plant === 'JRE' ? 'u' + gas.utilityIndex : 'kg' + gas.utilityIndex,
    );
    assert.deepEqual(records[0].gasProjected, keys);
    for (const [i, key] of keys.entries()) {
      assert.equal(original[key], null);
      const entry = structuredClone(rows[0].snapshot.draft.gas.entries[i]);
      entry.enabled = true;
      entry.refills = shifts[0].snapshot.draft.gas.entries[i].refills;
      assert.equal(
        records[0].values[key],
        Number(calculateGas(gasCalibration(plant).gases[i].id, entry, plant).kg.toFixed(6)),
      );
    }
    assert.equal(records[0].values.r0, original.r0);
    assert.deepEqual(records[0].sourcePeriods, ['daily', 'day', 'night']);
    assert.deepEqual({ rows, shifts }, before);
    assert.equal(JSON.stringify(records).includes('"draft"'), false);
    assert.deepEqual(workingDailyRows(rows, plant), rows);
  }
});

test('gas projection rejects missing, overlapping, conflicting and out-of-window evidence, and preserves zero/manual values', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const { rows, shifts } = gasWorkingRows(plant);
    const key = plant === 'JRE' ? 'u0' : 'kg0';
    const values = (s, r = rows) =>
      graphRecords(workingDailyRows(r, plant, undefined, undefined, s), plant)[0];
    assert.equal(values(shifts.slice(0, 1)).values[key], null);
    assert.equal(values([...shifts, structuredClone(shifts[0])]).values[key], null);
    const outside = structuredClone(shifts);
    outside[0].snapshot.draft.startTime = '07:00';
    assert.equal(values(outside).values[key], null);
    const conflict = structuredClone(shifts);
    conflict[1].snapshot.draft.gas.entries[0].start.reading = '66';
    assert.equal(values(conflict).values[key], null);
    assert.ok(Number.isFinite(values(conflict).values[plant === 'JRE' ? 'u1' : 'kg2']));
    const invalid = structuredClone(shifts);
    invalid[0].snapshot.draft.gas.entries[0].refills[0].after.reading = '59';
    assert.equal(values(invalid).values[key], null);
    const manual = structuredClone(rows);
    manual[0].snapshot.draft.utilities[0].value = '-';
    assert.equal(values(shifts, manual).values[key], null);
    const zero = structuredClone(rows);
    zero[0].snapshot.draft.gas.entries[0].enabled = true;
    zero[0].snapshot.draft.gas.entries[0].end = structuredClone(
      zero[0].snapshot.draft.gas.entries[0].start,
    );
    zero[0].snapshot = reportSnapshot(zero[0].snapshot.draft, { allowPartial: true });
    assert.equal(values(shifts, zero).values[key], 0);
    const mismatched = structuredClone(rows);
    mismatched[0].snapshot.draft.gas.entries[0].end.reading = '61';
    assert.equal(values(shifts, mismatched).values[key], null);
    const ownRefill = structuredClone(rows);
    ownRefill[0].snapshot.draft.gas.entries[0].refills = [
      { before: { reading: '55', temperature: '' }, after: { reading: '65', temperature: '' } },
    ];
    assert.equal(values(shifts, ownRefill).values[key], null);
  }
});

test('stock gains retain their plus notation and stay separate from consumption lines', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const prefix = PLANT_SCHEMAS[plant].utilityPrefix;
    const snapshot = {
      output: {
        reportText:
          prefix + ' Nitrogen: +12.345 Kg (measured stock increase)\n' + prefix + ' Water: 0 m³',
        worksheetText: '',
      },
    };
    const key = plant === 'JRE' ? 'u2' : 'kg3';
    const record = graphRecords(
      [{ id: 'gain', start_date: '2026-09-10', end_date: '2026-09-11', snapshot }],
      plant,
    )[0];
    assert.equal(record.values[key], 12.345);
    assert.deepEqual(record.stockIncrease, [key]);
    assert.equal(graphValueLabel(record, key), '+12.345');
    assert.deepEqual(graphSegments([record], key), []);
    assert.equal(record.values.u4, 0);
    assert.equal(
      graphValues({ output: { reportText: prefix + ' Nitrogen: +12.345 Kg' } }, plant)[key],
      null,
    );
    assert.equal(
      graphValues({ output: { reportText: prefix + ' Nitrogen: -' } }, plant)[key],
      null,
    );
  }
});

test('graphs need only immutable report and worksheet text, not private raw snapshot fields', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const snapshot = saved(plant);
    const projection = {
      output: {
        reportText: snapshot.output.reportText,
        worksheetText: snapshot.output.worksheetText,
      },
    };
    assert.deepEqual(graphValues(projection, plant), graphValues(snapshot, plant));
    assert.ok(
      Buffer.byteLength(JSON.stringify(projection)) < Buffer.byteLength(JSON.stringify(snapshot)),
    );
  }
});

test('Air Compressor 1 server snapshots apply x40 once and graphs preserve older saved output', () => {
  const draft = exampleDraft('JRE');
  draft.rows[11].start = ['100.25'];
  draft.rows[11].end = ['101.75'];
  draft.rows[11].factor = 1;
  const snapshot = reportSnapshot(draft);
  assert.match(snapshot.output.reportText, /12\. Air Compressor 1#: 60\.00 kWh/);
  assert.equal(snapshot.draft.rows[11].end[0], '101.75');
  const metric = GRAPH_METRICS.JRE.find((m) => m.label === 'Air Compressor 1#').key;
  assert.equal(graphValues(snapshot, 'JRE')[metric], 60);
  const historical = structuredClone(snapshot);
  historical.engineVersion = '0.9.1-alpha';
  historical.output.reportText = historical.output.reportText.replace(
    '12. Air Compressor 1#: 60.00',
    '12. Air Compressor 1#: 1.50',
  );
  assert.equal(graphValues(historical, 'JRE')[metric], 1.5);
  draft.rows[11].end = [...draft.rows[11].start];
  draft.importIssues = [
    {
      code: 'RATIO_MISMATCH',
      level: 'WARNING',
      rowIndex: 11,
      meterIndex: 0,
      message:
        'Air Compressor 1#, meter 1: input ratio 40, template ratio 1. Using the template ratio.',
    },
  ];
  const zero = reportSnapshot(draft);
  assert.equal(zero.output.checks, '');
  assert.equal(graphValues(zero, 'JRE')[metric], 0);
  assert.deepEqual(zero.draft.importIssues, []);
});

test('new Structural snapshots graph net usage while historical snapshots retain their saved values', () => {
  const draft = exampleDraft('JRE');
  const structural = PLANT_SCHEMAS.JRE.rows.findIndex(
    (row) => row.name === 'Structural Laboratory',
  );
  const piping = PLANT_SCHEMAS.JRE.rows.findIndex((row) => row.name === 'Piping Building 1#');
  draft.rows[structural].start = ['1000'];
  draft.rows[structural].end = ['1150'];
  draft.rows[piping].start = ['10', '1000', '1000'];
  draft.rows[piping].end = ['11', '1000', '1020'];
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
  draft.rows[piping].end = ['20', '1000', '1020'];
  const floored = reportSnapshot(draft);
  assert.equal(graphValues(floored, 'JRE').w11, 0);
  assert.match(floored.output.reportText, /20\. Structural Laboratory: 0 kWh/);
  assert.equal(graphValues(historical, 'JRE').w11, 150);
  const unavailable = structuredClone(floored);
  unavailable.engineVersion = '0.11.10-alpha';
  unavailable.output.worksheetText = unavailable.output.worksheetText.replace(
    /^Structural:.*$/m,
    'Structural: -',
  );
  unavailable.output.reportText = unavailable.output.reportText.replace(
    'Structural Laboratory: 0 kWh',
    'Structural Laboratory: -',
  );
  const before = structuredClone(unavailable);
  assert.equal(graphValues(unavailable, 'JRE').w11, null);
  assert.deepEqual(unavailable, before);
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
    start: { reading: '587', temperature: '33.5', unit: 'mm' },
    end: { reading: '550', temperature: '33.5', unit: 'mm' },
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

function emptyCombinedRows() {
  return [
    {
      id: 'empty',
      revision: 1,
      start_date: '2026-09-03',
      end_date: '2026-09-05',
      autosaved: true,
      snapshot: { ...saved(), complete: false, output: { reportText: '', worksheetText: '' } },
    },
    {
      id: 'day-a',
      revision: 2,
      start_date: '2026-09-03',
      end_date: '2026-09-04',
      snapshot: saved(),
    },
    {
      id: 'day-b',
      revision: 1,
      start_date: '2026-09-04',
      end_date: '2026-09-05',
      snapshot: saved(),
    },
  ];
}
test('an empty combined copy cannot hide adjacent saved daily points or split their line', () => {
  const rows = emptyCombinedRows(),
    before = structuredClone(rows),
    records = graphRecords(rows, 'JRE');
  assert.equal(records.filter((r) => r.overlap).length, 0);
  assert.equal(records.find((r) => r.id === 'empty').noValues, true);
  assert.deepEqual(
    graphSegments(records, 'w0').map((part) => part.map((r) => r.id)),
    [['day-a', 'day-b']],
  );
  assert.deepEqual(rows, before);
});
test('numeric combined periods, including recorded zero, retain genuine overlap protection', () => {
  for (const zero of [false, true]) {
    const rows = emptyCombinedRows();
    rows[0].snapshot = saved();
    if (zero)
      rows[0].snapshot.output = {
        reportText: '',
        worksheetText: 'JRE ELECTRICAL WORKSHEET:\nIndoor: 0',
      };
    const records = graphRecords(rows, 'JRE');
    assert.equal(records.find((r) => r.id === 'empty').noValues, false);
    assert.equal(records.filter((r) => r.overlap).length, 3);
    assert.deepEqual(graphSegments(records, 'w0'), []);
  }
});

function nestedWorkingRows(plant) {
  return [13, 14, 15].map((day, i) => {
    const d = createDraft(plant, `2026-11-${day}`, '2026-11-16');
    d.rows.forEach((row) => {
      row.start.fill(String(1000 + i * 100));
      row.end.fill('1300');
    });
    d.water = { start: String(100 + i * 10), end: '130' };
    if (plant === 'JRE') d.airCompressor = { start: String(1000 + i * 10), end: '1030' };
    return {
      id: 'synthetic-' + day,
      revision: 1,
      start_date: d.startDate,
      end_date: d.endDate,
      autosaved: true,
      snapshot: reportSnapshot(d, { allowPartial: true }),
    };
  });
}

test('nested working copies project exact adjacent daily readings without rewriting any stored copy', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const rows = nestedWorkingRows(plant),
      before = structuredClone(rows);
    const projected = workingDailyRows(rows, plant, '2026-11-01', '2026-11-30');
    const records = graphRecords(projected, plant);
    assert.equal(records.filter((r) => r.overlap).length, 0);
    assert.equal(records.filter((r) => r.dailyCoverage).length, 2);
    const days = records.filter((r) => !r.superseded);
    assert.deepEqual(
      days.map((r) => [r.startDate, r.endDate]),
      [
        ['2026-11-13', '2026-11-14'],
        ['2026-11-14', '2026-11-15'],
        ['2026-11-15', '2026-11-16'],
      ],
    );
    assert.deepEqual(
      days.map((r) => r.values.r0),
      plant === 'JRE' ? [100, 100, 100] : [320000, 320000, 320000],
    );
    assert.equal(days[0].values.u4, 10);
    assert.equal(days[0].values.u0, null);
    assert.equal(days[0].derived, true);
    assert.deepEqual(
      graphSegments(records, 'r0').map((s) => s.length),
      [3],
    );
    assert.ok(days[0].sourcePeriods.includes('synthetic-13'));
    assert.equal('draft' in days[0], false);
    assert.deepEqual(rows, before);
    const clipped = graphRecords(workingDailyRows(rows, plant, '2026-11-14', '2026-11-14'), plant);
    assert.ok(clipped.filter((r) => r.derived).every((r) => r.startDate === '2026-11-14'));
  }
});

test('combined periods with missing or contradictory endpoints retain overlap checks; zeros remain measured', () => {
  const rows = nestedWorkingRows('JRE');
  const singleton = [rows[0]];
  assert.deepEqual(workingDailyRows(singleton, 'JRE'), singleton);
  const bad = structuredClone(rows);
  bad[1].snapshot.draft.rows[0].end[0] = '1301';
  const before = structuredClone(bad);
  const records = graphRecords(workingDailyRows(bad, 'JRE'), 'JRE');
  assert.equal(
    records.some((r) => r.dailyCoverage),
    false,
  );
  assert.ok(records.some((r) => r.overlap));
  assert.deepEqual(bad, before);
  const zero = nestedWorkingRows('JRE');
  zero.forEach((row) => {
    row.snapshot.draft.rows.forEach((r) => {
      r.start.fill('1000');
      r.end.fill('1000');
    });
    row.snapshot = reportSnapshot(row.snapshot.draft, { allowPartial: true });
  });
  const projected = graphRecords(workingDailyRows(zero, 'JRE'), 'JRE');
  assert.deepEqual(
    projected.filter((r) => !r.superseded).map((r) => r.values.r0),
    [0, 0, 0],
  );
  const checkpoint = rows.map((row) => ({ ...row, autosaved: false }));
  assert.deepEqual(workingDailyRows(checkpoint, 'JRE'), checkpoint);
});

test('dated conflict checks inspect only the requested observation and preserve the complete input', () => {
  const rows = nestedWorkingRows('JRE');
  const a = rows[0].snapshot.draft,
    b = structuredClone(a);
  b.rows[0].end[0] = '1301';
  b.water.end = '131';
  const drafts = [a, b],
    before = structuredClone(drafts);
  assert.ok(electricityConflicts(drafts).length);
  assert.ok(utilityConflicts(drafts).length);
  assert.deepEqual(electricityConflicts(drafts, '2026-11-13'), []);
  assert.deepEqual(utilityConflicts(drafts, '2026-11-13'), []);
  assert.ok(electricityConflicts(drafts, '2026-11-16').length);
  assert.ok(utilityConflicts(drafts, '2026-11-16').length);
  assert.deepEqual(drafts, before);
});

test('daily Water alone cannot hide a combined electricity result with a missing intermediate meter', () => {
  const rows = nestedWorkingRows('JRE');
  rows[1].snapshot.draft.rows[0].start[0] = '';
  rows[1].snapshot = reportSnapshot(rows[1].snapshot.draft, { allowPartial: true });
  const before = structuredClone(rows);
  const projected = workingDailyRows(rows, 'JRE');
  assert.equal(projected.find((row) => row.id === rows[0].id).dailyCoverage, undefined);
  const records = graphRecords(projected, 'JRE');
  assert.ok(records.some((row) => row.overlap));
  assert.equal(
    records.find((row) => row.derived && row.startDate === '2026-11-13').values.r0,
    null,
  );
  assert.deepEqual(rows, before);
});
