import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANT_SCHEMAS } from '../schema.js';
import { exampleDraft } from '../examples.js';
import { createWorkingHoursDraft, calculateDraft } from '../engine.js';
import { migrateMeterLayout } from '../meter-layout.js';
import { restoreWorkspace, nextDayDraft } from '../storage.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';
import { GRAPH_METRICS, WORKSHEET_ROWS } from '../graph-schema.js';
import { exportRawReading, formatBlankReadingTemplate } from '../raw-export.js';
import { parseReading } from '../importer.js';
import { createDraftBackup, restoreDraftBackup } from '../draft-backup.js';
import { layout3Draft, unilandInput } from './fixtures/uniland-input.mjs';

const rows = PLANT_SCHEMAS.UNILAND.rows;
const index = (name) => rows.findIndex((row) => row.name === name);
const added = ['SV window', 'Painting', 'Dryer'];

test('layout-3 daily and work drafts preserve every old slot, metadata and warnings exactly once', () => {
  for (const work of [false, true]) {
    const current = exampleDraft('UNILAND');
    const old = layout3Draft(
      work
        ? { ...createWorkingHoursDraft('UNILAND', current.startDate), rows: current.rows }
        : current,
    );
    old.rows[26].start[0] = '123,450000';
    old.rows[26].end[0] = '124.';
    old.importIssues = [
      {
        code: 'RATIO_MISMATCH',
        rowIndex: 30,
        meterIndex: 0,
        inputRatio: 2,
        message: 'Review factor',
      },
    ];
    const before = JSON.stringify(old);
    const migrated = migrateMeterLayout(old);
    for (const [i, row] of rows.entries()) {
      if (row.layout3No) assert.deepEqual(migrated.rows[i], old.rows[Number(row.layout3No) - 1]);
      else assert.deepEqual(migrated.rows[i], { start: [''], end: [''], inactive: false });
    }
    assert.equal(migrated.meterLayout, 4);
    assert.equal(migrated.importIssues[0].rowIndex, index('Refrigant and LPG area'));
    assert.deepEqual(migrateMeterLayout(migrated), migrated);
    assert.equal(JSON.stringify(old), before);
    assert.throws(() => reportSnapshot(old), /METER_LAYOUT_CHANGED/);
    const workspace = {
      version: 4,
      drafts: { JRE: exampleDraft('JRE'), UNILAND: work ? current : old },
    };
    if (work) workspace.workingHours = { JRE: createWorkingHoursDraft('JRE'), UNILAND: old };
    const restored = restoreWorkspace(JSON.stringify(workspace));
    assert.deepEqual(
      (work ? restored.workingHours : restored.drafts).UNILAND.rows[index('SV window')].start,
      [''],
    );
    assert.equal(calculateDraft(migrated).success, false);
    assert.throws(() => migrateMeterLayout({ ...old, rows: old.rows.slice(1) }), /Invalid legacy/);
  }
});

test('new direct kWh readings join daily/work reports, exports and graph choices without changing worksheet columns', () => {
  const d = exampleDraft('UNILAND');
  for (const [name, start, end] of [
    ['SV window', '10,000001', '11.500001'],
    ['Painting', '100', '108'],
    ['Dryer', '25', '25'],
  ]) {
    d.rows[index(name)].start = [start];
    d.rows[index(name)].end = [end];
  }
  for (const draft of [d, { ...createWorkingHoursDraft('UNILAND', d.startDate), rows: d.rows }]) {
    const report = calculateDraft(draft);
    assert.equal(report.success, true);
    assert.equal(report.calculatedRows[index('SV window')].totalEnergy, 1.5);
    assert.equal(report.calculatedRows[index('Painting')].totalEnergy, 8);
    assert.equal(report.calculatedRows[index('Dryer')].totalEnergy, 0);
    assert.match(report.reportSectionText, /SV window: 1.5 kWh/);
    assert.match(report.reportSectionText, /Painting: 8 kWh/);
    assert.match(report.reportSectionText, /Dryer: 0 kWh/);
    assert.equal(report.worksheet.values.length, 16);
    const graph = graphValues(reportSnapshot(draft), 'UNILAND');
    assert.equal(graph.r31, 1.5);
    assert.equal(graph.r32, 8);
    assert.equal(graph.r33, 0);
    assert.equal(graph.w9, report.calculatedRows[index('Injection Molding')].totalEnergy);
    for (const name of added) {
      assert.ok(GRAPH_METRICS.UNILAND.some((metric) => metric.label === name));
      assert.ok(exportRawReading(draft).text.includes(name + ':'));
      assert.ok(formatBlankReadingTemplate('UNILAND').includes(name + ': ____'));
    }
    assert.equal(WORKSHEET_ROWS.UNILAND[8], index('Machine Stamping'));
    const parsed = parseReading(exportRawReading(draft).text, 'UNILAND');
    assert.equal(parsed.success, true);
    assert.deepEqual(
      parsed.values,
      draft.rows.map((row) => row.end),
    );
  }
  d.rows[index('Painting')].end[0] = '';
  assert.equal(calculateDraft(d).success, false);
  assert.equal(exportRawReading(d).text, '');
  d.rows[index('Painting')].end[0] = '99';
  assert.equal(calculateDraft(d).calculatedRows[index('Painting')].totalEnergy, null);
});

test('optional Pagi/Sore labels and repeated row numbers accept one complete observation without fabricating a time', () => {
  const d = exampleDraft('UNILAND');
  for (const label of ['', ' ( Pagi )', ' ( Sore )', ' (pagi)']) {
    const text = unilandInput(d, 'end')
      .replace(d.endDate, '18/09/2026' + label)
      .replace(/^[0-9]+\./gm, '21.');
    const parsed = parseReading(text, 'UNILAND');
    assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
    assert.equal(parsed.date, '2026-09-18');
    assert.equal(parsed.time, undefined);
    assert.deepEqual(parsed.omittedRows, [1, 2, 3]);
    for (const name of added) assert.deepEqual(parsed.values[index(name)], d.rows[index(name)].end);
  }
  const text = unilandInput(d, 'end');
  assert.equal(parseReading(text + '\n' + d.endDate + ' (Sore)', 'UNILAND').success, false);
  assert.equal(parseReading(text + '\nSV window: 1', 'UNILAND').success, false);
  assert.equal(parseReading(text.replace(/^.*Painting:.*\n/m, ''), 'UNILAND').success, true);
});

test('old report graph keys and new partial backups stay independent of positional row insertion', () => {
  const old = {
    output: {
      reportText:
        '23. Nitrogen Area: 12 kWh\n25. 10HP Enthalpy Difference Lab (2): 8 kWh\n31. Refrigant and LPG area  : 40 KWh',
      worksheetText: 'UNILAND ELECTRICAL WORKSHEET:\nMachine Stamping: 25',
    },
  };
  const before = JSON.stringify(old);
  const graph = graphValues(old, 'UNILAND');
  assert.equal(graph.r20, 12);
  assert.equal(graph.r30, 8);
  assert.equal(graph.r27, 40);
  assert.equal(graph.w8, 25);
  for (const key of ['r31', 'r32', 'r33']) assert.equal(graph[key], null);
  assert.equal(JSON.stringify(old), before);
  const owner = 'b89c2b90-bbee-4a90-bd68-a0e9fc761352';
  const d = exampleDraft('UNILAND');
  d.rows[index('Dryer')].end[0] = '123.';
  const workspace = { version: 4, drafts: { JRE: exampleDraft('JRE'), UNILAND: d } };
  const backup = createDraftBackup(workspace, owner);
  const restored = restoreDraftBackup(backup, owner);
  assert.equal(restored.drafts.UNILAND.rows[index('Dryer')].end[0], '123.');
  d.rows[index('Dryer')].end[0] = '123,250000';
  assert.equal(nextDayDraft(d).rows[index('Dryer')].start[0], '123,250000');
});
