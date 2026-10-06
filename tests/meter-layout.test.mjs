import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, calculateDraft } from '../engine.js';
import { migrateMeterLayout } from '../meter-layout.js';
import { restoreDrafts } from '../storage.js';
import { parseReading } from '../importer.js';
import { exportRawReading } from '../raw-export.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';
import { legacyDraft, legacyText } from './fixtures/legacy-layout.mjs';

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
  assert.equal(current.meterLayout, 2);
  for (const side of ['start', 'end']) {
    assert.deepEqual(current.rows[3][side], [...legacy.rows[3][side], legacy.rows[25][side][2]]);
    assert.deepEqual(current.rows[15][side], [...legacy.rows[15][side], legacy.rows[25][side][1]]);
    assert.deepEqual(current.rows[25][side], [legacy.rows[25][side][0]]);
    assert.deepEqual(
      current.rows.flatMap((r) => r[side]).sort(),
      legacy.rows.flatMap((r) => r[side]).sort(),
    );
    assert.equal(current.rows.flatMap((r) => r[side]).length, 57);
  }
  assert.deepEqual(legacy, before);
  assert.deepEqual(migrateMeterLayout(current), current);
  const again = restoreDrafts(
    JSON.stringify({ version: 4, drafts: { JRE: current, UNILAND: createDraft('UNILAND') } }),
  ).JRE;
  assert.deepEqual(again, current);
});

test('new grouping preserves overall consumption and only Piping meter 1 reduces Structural', () => {
  const draft = migrateMeterLayout(legacyDraft()),
    before = structuredClone(draft);
  const r = calculateDraft(draft);
  assert.equal(r.success, true);
  assert.equal(r.calculatedRows[3].totalEnergy, 3);
  assert.equal(r.calculatedRows[15].totalEnergy, 42);
  assert.equal(r.calculatedRows[25].totalEnergy, 40);
  assert.equal(r.calculatedRows[19].totalEnergy, 110);
  assert.equal(r.worksheet.derived.pipingAll, 42);
  assert.equal(r.subAreasSumKWh, 195);
  assert.equal(r.gapKWh, -5);
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
    const raw = exportRawReading(next, side);
    assert.deepEqual(parseReading(raw.text, 'JRE').values, imported.values);
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
        'Warehouse Area, meter 3: input ratio 40, template ratio 1. Using the template ratio.',
    },
  ];
  const restore = (draft) =>
    restoreDrafts(
      JSON.stringify({ version: 4, drafts: { JRE: draft, UNILAND: createDraft('UNILAND') } }),
    ).JRE;
  const next = restore(d);
  assert.equal(next.importIssues[0].rowIndex, 3);
  assert.equal(next.importIssues[0].meterIndex, 5);
  assert.equal(next.importIssues[0].inputRatio, 40);
  assert.match(next.importIssues[0].message, /Window, meter 6/);
  assert.throws(() => restore({ ...d, meterLayout: 2 }));
  assert.throws(() => restore({ ...d, meterLayout: 99 }));
  d.rows[25].end.pop();
  assert.throws(() => restore(d));
});

test('stored graph output stays immutable and stale clients must review regrouped reports', () => {
  const old = legacyDraft();
  assert.throws(() => reportSnapshot(old), /METER_LAYOUT_CHANGED/);
  const snapshot = reportSnapshot(migrateMeterLayout(old));
  const original = structuredClone(snapshot);
  const metric = graphValues(snapshot, 'JRE');
  assert.equal(metric.w2, 3);
  snapshot.draft = old;
  assert.deepEqual(graphValues(snapshot, 'JRE'), metric);
  assert.deepEqual(snapshot.output, original.output);
});
