import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraft,
  createWorkingHoursDraft,
  createNightShiftDraft,
  calculateDraft,
} from '../engine.js';
import { migrateMeterLayout } from '../meter-layout.js';
import { restoreDrafts } from '../storage.js';
import { parseReading } from '../importer.js';
import { exportRawReading } from '../raw-export.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';
import {
  legacyDraft,
  legacyText,
  fillNewJreMeters,
  layout6JreDraft,
} from './fixtures/legacy-layout.mjs';
import { reportPeriods } from './fixtures/report-periods.mjs';
import { exportAllRawReadings, parseRawReading } from '../raw-meter-export.js';
import { shareElectricityEdits } from '../observations.js';
import { changeDraftPeriod } from '../storage.js';

test('Outdoor meter 3 starts at the confirmed evening baseline and moves usage from Window exactly once', () => {
  for (const date of ['2026-11-05', '2026-11-06', '2026-11-07']) {
    for (const draft of reportPeriods('JRE', date)) {
      draft.rows[2].start[2] = draft.rows[2].end[2] = '10';
      const before = calculateDraft(draft);
      draft.rows[2].end[2] = '10.125001';
      const raw = structuredClone(draft),
        result = calculateDraft(draft);
      const active =
        date > '2026-11-06' || (date === '2026-11-06' && draft.periodKind === 'nightShift');
      const delta = active ? 5.00004 : 0;
      assert.equal(
        result.calculatedRows[2].totalEnergy,
        before.calculatedRows[2].totalEnergy + delta,
      );
      assert.equal(
        result.calculatedRows[3].totalEnergy,
        before.calculatedRows[3].totalEnergy - delta,
      );
      assert.equal(result.subAreasSumKWh, before.subAreasSumKWh);
      assert.equal(result.gapKWh, before.gapKWh);
      assert.equal(result.totalDirectEnergy, before.totalDirectEnergy);
      assert.deepEqual(draft, raw);
    }
  }
  const early = createNightShiftDraft('JRE', '2026-11-06');
  early.startTime = '16:59';
  early.rows[2].start[2] = '1';
  early.rows[2].end[2] = '2';
  assert.equal(calculateDraft(early).calculatedRows[2].meters[2].energy, 0);
  early.startTime = '17:00';
  assert.equal(calculateDraft(early).calculatedRows[2].meters[2].energy, 40);
});

test('new Outdoor slot contributes zero only for unavailable pairs, with truthful provenance and invalid input protection', () => {
  for (const pair of [
    ['', ''],
    ['', '12.34'],
    ['-', '12.34'],
    ['12.34', ''],
  ]) {
    const draft = reportPeriods('JRE', '2026-11-07')[0];
    draft.rows[2].start[2] = pair[0];
    draft.rows[2].end[2] = pair[1];
    const raw = structuredClone(draft),
      result = calculateDraft(draft);
    assert.equal(result.success, true);
    assert.equal(result.calculatedRows[2].meters[2].energy, 0);
    assert.ok(
      result.issues.some((i) => i.code === 'OPTIONAL_METER_UNAVAILABLE' && i.level === 'NOTICE'),
    );
    assert.match(result.mainText, /Outdoor, meter 3: no complete reading pair/);
    assert.deepEqual(draft, raw);
  }
  for (const pair of [
    ['bad', ''],
    ['1', 'bad'],
    ['3', '2'],
  ]) {
    const draft = reportPeriods('JRE', '2026-11-07')[0];
    draft.rows[2].start[2] = pair[0];
    draft.rows[2].end[2] = pair[1];
    const result = calculateDraft(draft);
    assert.equal(result.calculatedRows[2].totalEnergy, null);
    assert.equal(result.calculatedRows[3].totalEnergy, null);
    assert.ok(!result.issues.some((i) => i.code === 'OPTIONAL_METER_UNAVAILABLE'));
  }
});

test('layout6 restores and raw old/new imports preserve every old value, including partial strings in all modes', () => {
  for (const current of reportPeriods('JRE', '2026-11-06')) {
    current.rows[2].start[2] = current.rows[2].end[2] = '';
    const old = layout6JreDraft(current),
      original = structuredClone(old);
    const next = migrateMeterLayout(old);
    assert.deepEqual(next, current);
    assert.deepEqual(old, original);
    assert.deepEqual(migrateMeterLayout(next), next);
    for (const side of ['start', 'end']) {
      const parsed = parseReading(legacyText(old, side), 'JRE');
      assert.equal(parsed.success, true);
      assert.deepEqual(
        parsed.values,
        current.rows.map((r) => r[side]),
      );
      assert.deepEqual(parsed.suppliedMeters[2], [true, true, false]);
      const raw = exportAllRawReadings(current, side);
      assert.deepEqual(raw.issues, []);
      assert.match(raw.text, /Outdoor: .*\+ ____ \(Ratio 40\)/);
      const imported = parseRawReading(raw.text, current, side);
      assert.equal(imported.success, true);
      assert.deepEqual(
        imported.values,
        current.rows.map((r) => r[side]),
      );
    }
    old.rows[2].start[0] = '123,';
    assert.equal(migrateMeterLayout(old).rows[2].start[0], '123,');
  }
});

test('the new evening baseline shares by timestamp and date navigation preserves raw values without inventing starts', () => {
  let periods = [
    createWorkingHoursDraft('JRE', '2026-11-06'),
    createNightShiftDraft('JRE', '2026-11-06'),
  ];
  periods[0].rows[2].end[2] = '0012,345600';
  periods = shareElectricityEdits(periods, 'workingHours', [{ ri: 2, mi: 2, side: 'end' }]);
  assert.equal(periods[1].rows[2].start[2], '0012,345600');
  assert.equal(calculateDraft(periods[0]).calculatedRows[2].meters[2].energy, 0);
  const day = createDraft('JRE', '2026-11-06', '2026-11-07');
  day.rows[2].end[2] = '17.000001';
  const next = changeDraftPeriod(day, '2026-11-07', '2026-11-08');
  assert.equal(next.rows[2].start[2], '17.000001');
  assert.equal(next.rows[2].end[2], '');
  assert.equal(day.rows[2].end[2], '17.000001');
});

test('legacy draft remapping preserves all 57 raw meters exactly once and is idempotent', () => {
  const legacy = legacyDraft(),
    before = structuredClone(legacy);
  const current = restoreDrafts(
    JSON.stringify({
      version: 4,
      drafts: {
        JRE: legacy,
        UNILAND: createDraft('UNILAND'),
      },
    }),
  ).JRE;
  assert.equal(current.meterLayout, 8);
  for (const side of ['start', 'end']) {
    assert.deepEqual(current.rows[3][side], [...legacy.rows[3][side], legacy.rows[25][side][2]]);
    assert.deepEqual(current.rows[15][side], [
      ...legacy.rows[15][side],
      legacy.rows[25][side][1],
      '',
    ]);
    assert.deepEqual(current.rows[25][side], [legacy.rows[25][side][0]]);
    assert.deepEqual(
      current.rows
        .slice(0, 31)
        .flatMap((r) => r[side])
        .filter(Boolean)
        .sort(),
      legacy.rows.flatMap((r) => r[side]).sort(),
    );
    assert.equal(current.rows.flatMap((r) => r[side]).length, 63);
  }
  assert.deepEqual(legacy, before);
  assert.deepEqual(migrateMeterLayout(current), current);
  const again = restoreDrafts(
    JSON.stringify({ version: 4, drafts: { JRE: current, UNILAND: createDraft('UNILAND') } }),
  ).JRE;
  assert.deepEqual(again, current);
});

test('upgraded grouping applies Window x40 and only Piping meter 1 reduces Structural', () => {
  const draft = fillNewJreMeters(migrateMeterLayout(legacyDraft())),
    before = structuredClone(draft);
  const r = calculateDraft(draft);
  assert.equal(r.success, true);
  assert.equal(r.calculatedRows[3].totalEnergy, 120);
  assert.equal(r.calculatedRows[15].totalEnergy, 42);
  assert.equal(r.calculatedRows[25].totalEnergy, 40);
  assert.equal(r.calculatedRows[19].totalEnergy, 110);
  assert.equal(r.worksheet.derived.pipingAll, 42);
  assert.equal(r.subAreasSumKWh, 312);
  assert.equal(r.gapKWh, 112);
  assert.deepEqual(draft, before);
  draft.rows[15].end[1] = '';
  const incomplete = calculateDraft(draft);
  assert.equal(incomplete.calculatedRows[15].totalEnergy, null);
  assert.equal(incomplete.calculatedRows[19].totalEnergy, 110);
  assert.equal(incomplete.subAreasSumKWh, null);
});

test('legacy and current text exports import into the same layout, without accepting mixed layouts', () => {
  const old = legacyDraft(),
    next = migrateMeterLayout(old);
  for (const side of ['start', 'end']) {
    const imported = parseReading(legacyText(old, side), 'JRE');
    assert.equal(imported.success, true);
    assert.deepEqual(
      imported.values,
      next.rows.map((r) => r[side]),
    );
    assert.equal(exportRawReading(next, side).text, '');
    const filled = fillNewJreMeters(next);
    const raw = exportRawReading(filled, side);
    assert.deepEqual(
      parseReading(raw.text, 'JRE').values,
      filled.rows.map((r) => r[side]),
    );
    assert.match(raw.text, /26\. Warehouse Area: [\d.,]+ \(Ratio 40\)\n/);
  }
  const mixed = legacyText(old, 'end').replace('4. Window: ', '4. Window: 1 + ');
  assert.equal(parseReading(mixed, 'JRE').success, false);
  const unavailable = legacyText(old, 'end').replace(/^4\. Window:.*$/m, '4. Window: -');
  const parsed = parseReading(unavailable, 'JRE');
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.values[3], ['-', '-', '-', '-', '-', old.rows[25].end[2]]);
});

test('moved ratio warnings retain their actual meter coordinates and malformed drafts are rejected', () => {
  const d = legacyDraft();
  d.importIssues = [
    {
      code: 'RATIO_MISMATCH',
      rowIndex: 25,
      meterIndex: 2,
      message:
        'Warehouse Area, meter 3: input ratio 90, template ratio 1. Using the template ratio.',
    },
  ];
  const restore = (draft) =>
    restoreDrafts(
      JSON.stringify({ version: 4, drafts: { JRE: draft, UNILAND: createDraft('UNILAND') } }),
    ).JRE;
  const next = restore(d);
  assert.equal(next.importIssues[0].rowIndex, 3);
  assert.equal(next.importIssues[0].meterIndex, 5);
  assert.equal(next.importIssues[0].inputRatio, 90);
  assert.match(next.importIssues[0].message, /Window, meter 6/);
  assert.throws(() => restore({ ...d, meterLayout: 2 }));
  assert.throws(() => restore({ ...d, meterLayout: 99 }));
  d.rows[25].end.pop();
  assert.throws(() => restore(d));
});

test('stored graph output stays immutable and stale clients must review regrouped reports', () => {
  const old = legacyDraft();
  assert.throws(() => reportSnapshot(old), /METER_LAYOUT_CHANGED/);
  const snapshot = reportSnapshot(fillNewJreMeters(migrateMeterLayout(old)));
  const original = structuredClone(snapshot);
  const metric = graphValues(snapshot, 'JRE');
  assert.equal(metric.w2, 120);
  snapshot.draft = old;
  assert.deepEqual(graphValues(snapshot, 'JRE'), metric);
  assert.deepEqual(snapshot.output, original.output);
});
