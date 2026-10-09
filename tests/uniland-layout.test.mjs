import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANT_SCHEMAS } from '../schema.js';
import { createDraft, calculateDraft } from '../engine.js';
import { exampleDraft } from '../examples.js';
import { migrateMeterLayout } from '../meter-layout.js';
import { restoreDrafts } from '../storage.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';
import { exportRawReading } from '../raw-export.js';

test('UNILAND legacy drafts preserve every original observation and leave new equipment blank', () => {
  const current = exampleDraft('UNILAND');
  const old = structuredClone(current);
  delete old.meterLayout;
  old.rows = PLANT_SCHEMAS.UNILAND.rows
    .map((row, i) => ({ row, values: current.rows[i] }))
    .filter(({ row }) => row.legacyIndex < 28)
    .sort((a, b) => a.row.legacyIndex - b.row.legacyIndex)
    .map(({ values }) => values);
  old.importIssues = [
    { rowIndex: 27, meterIndex: 0, code: 'RATIO_MISMATCH', message: 'Review ratio' },
  ];
  const original = JSON.stringify(old);
  const migrated = migrateMeterLayout(old);
  for (const [i, row] of PLANT_SCHEMAS.UNILAND.rows.entries()) {
    if (row.legacyIndex < 28) assert.deepEqual(migrated.rows[i], old.rows[row.legacyIndex]);
    else
      for (const side of ['start', 'end']) assert.ok(migrated.rows[i][side].every((v) => v === ''));
  }
  assert.equal(migrated.importIssues[0].rowIndex, 29);
  assert.equal(JSON.stringify(old), original);
  assert.deepEqual(migrateMeterLayout(migrated), migrated);
  const restored = restoreDrafts(
    JSON.stringify({ version: 4, drafts: { JRE: createDraft('JRE'), UNILAND: old } }),
  ).UNILAND;
  assert.equal(calculateDraft(restored).success, false);
  assert.throws(() => reportSnapshot(old), /METER_LAYOUT_CHANGED/);
  old.meterLayout = 99;
  assert.throws(() => migrateMeterLayout(old), /Unknown meter layout/);
});

test('UNILAND Piping and Office calculate separately and worksheet combines HE and Piping only', () => {
  const d = exampleDraft('UNILAND');
  d.rows[12] = { start: ['10', '100', '200'], end: ['10.25', '103', '207'], inactive: false };
  d.rows[15] = { start: ['100'], end: ['115'], inactive: false };
  const result = calculateDraft(d);
  assert.equal(result.success, true);
  assert.match(result.mainText, /13\. Piping: 20 kWh/);
  assert.match(result.mainText, /16\. New Office Building A: 15 kWh/);
  assert.equal(result.worksheet.values[4], 30);
  const graph = graphValues(reportSnapshot(d), 'UNILAND');
  assert.equal(graph.r28, 20);
  assert.equal(graph.r29, 15);
  assert.equal(graph.r12, 10); // Energy Area retains its old graph identity.
  assert.equal(graph.w4, 30);
  assert.match(exportRawReading(d).text, /13\. Piping: 10.25 \(Ratio 40\) \+ 103 \+ 207/);
});

test('old UNILAND report numbers and worksheet output remain readable without recalculation', () => {
  const snapshot = {
    output: {
      reportText: '13. Energy Area: 123.45 kWh\n28. Refrigant and LPG area  : 80 KWh',
      worksheetText: 'UNILAND ELECTRICAL WORKSHEET:\nHE & Piping: 456',
    },
  };
  const before = JSON.stringify(snapshot);
  const values = graphValues(snapshot, 'UNILAND');
  assert.equal(values.r12, 123.45);
  assert.equal(values.r27, 80);
  assert.equal(values.w4, 456);
  assert.equal(values.r28, null);
  assert.equal(values.r29, null);
  assert.equal(JSON.stringify(snapshot), before);
});
