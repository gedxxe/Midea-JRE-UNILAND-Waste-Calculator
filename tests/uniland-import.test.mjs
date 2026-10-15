import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReading } from '../importer.js';
import { exampleDraft } from '../examples.js';
import { createDraft, calculateDraft } from '../engine.js';
import { restoreDrafts } from '../storage.js';
import { PLANT_SCHEMAS } from '../schema.js';
import { graphValues } from '../graph-data.js';
import { unilandInput } from './fixtures/uniland-input.mjs';

test('UNILAND operator input accepts all triple meters, shared ratios, duplicate lab pair and omitted Trafo', () => {
  const d = exampleDraft('UNILAND');
  for (const side of ['start', 'end']) {
    const parsed = parseReading(unilandInput(d, side), 'UNILAND');
    assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
    assert.deepEqual(parsed.issues, []);
    assert.deepEqual(parsed.omittedRows, [1, 2, 3]);
    assert.equal(parsed.suppliedRows.includes(1), false);
    for (const index of parsed.suppliedRows)
      assert.deepEqual(parsed.values[index], d.rows[index][side]);
  }
  const missing = unilandInput(d, 'end').replace(/^\d+\. Indoor:.*\n/m, '');
  assert.equal(parseReading(missing, 'UNILAND').success, false);
  const extra = unilandInput(d, 'end') + '\n29. 10HP Enthalpy Difference Lab: 1';
  assert.equal(parseReading(extra, 'UNILAND').success, false);
});

test('all three UNILAND converted deltas are summed at scaled precision; HE and labs remain distinct', () => {
  const d = exampleDraft('UNILAND');
  for (const index of [4, 5, 6, 7, 8, 11]) {
    d.rows[index].start = ['100', '200', '300'];
    d.rows[index].end = ['101.5', '202', '303'];
  }
  const result = calculateDraft(d);
  for (const [index, value] of [
    [4, 1.04],
    [5, 0.52],
    [6, 1.04],
    [7, 0.13],
    [8, 0.13],
    [11, 6.5],
  ])
    assert.equal(result.calculatedRows[index].totalEnergy, value);
  assert.notEqual(result.calculatedRows[24].name, result.calculatedRows[25].name);
  const old = {
    output: {
      reportText: '30. Refrigant and LPG area  : 12 KWh\n25. 20HP Test chamber Lab: 13 kWh',
    },
  };
  assert.equal(graphValues(old, 'UNILAND').r27, 12);
  const graphs = graphValues(
    { output: { reportText: result.reportSectionText, worksheetText: result.worksheetText } },
    'UNILAND',
  );
  assert.equal(graphs.r30, result.calculatedRows[25].totalEnergy);
});

test('layout-2 draft upgrades preserve original primary values and leave new component/lab slots blank', () => {
  const current = exampleDraft('UNILAND');
  const old = { ...structuredClone(current), meterLayout: 2 };
  old.rows = PLANT_SCHEMAS.UNILAND.rows
    .filter((row) => row.previousNo)
    .map((row) => {
      const value = current.rows[PLANT_SCHEMAS.UNILAND.rows.indexOf(row)];
      return [4, 5, 6, 7, 8, 11].includes(row.legacyIndex)
        ? { ...value, start: [value.start[0]], end: [value.end[0]] }
        : value;
    });
  const before = JSON.stringify(old);
  const restored = restoreDrafts(
    JSON.stringify({ version: 4, drafts: { JRE: createDraft('JRE'), UNILAND: old } }),
  ).UNILAND;
  for (const index of [4, 5, 6, 7, 8, 11]) {
    assert.equal(restored.rows[index].start[0], old.rows[index].start[0]);
    assert.deepEqual(restored.rows[index].start.slice(1), ['', '']);
  }
  assert.deepEqual(restored.rows[25].start, ['']);
  assert.equal(JSON.stringify(old), before);
  assert.equal(calculateDraft(restored).success, false);
});
