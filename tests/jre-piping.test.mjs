import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraft,
  createWorkingHoursDraft,
  createNightShiftDraft,
  calculateDraft,
} from '../engine.js';
import { exportRawReading, formatBlankReadingTemplate } from '../raw-export.js';
import { parseReading } from '../importer.js';
import { restoreDrafts } from '../storage.js';
import { migrateMeterLayout } from '../meter-layout.js';
import { reportSnapshot } from '../server/report-data.js';
import { graphValues } from '../graph-data.js';
import { layout3JreDraft, legacyText } from './fixtures/legacy-layout.mjs';

function entered(make = createDraft) {
  const d = make('JRE', '2026-10-17', ...(make === createDraft ? ['2026-10-18'] : []));
  d.rows.forEach((r) => {
    r.start.fill('1000');
    r.end.fill('1000');
  });
  d.rows[0].end[0] = '2000';
  d.rows[3].start[5] = '2';
  d.rows[3].end[5] = '3.5';
  d.rows[15].start = ['10', '100', '200'];
  d.rows[15].end = ['10.5', '107', '300'];
  d.rows[19].end[0] = '1050';
  return d;
}

test('JRE Window Vacuum Box x40 is deducted only from Piping meter 3 in every period and saved output', () => {
  for (const make of [createDraft, createWorkingHoursDraft, createNightShiftDraft]) {
    const d = entered(make),
      before = structuredClone(d),
      r = calculateDraft(d),
      p = r.calculatedRows[15];
    assert.equal(r.success, true);
    assert.equal(r.calculatedRows[3].totalEnergy, 60);
    assert.equal(p.meters[2].grossEnergy, 100);
    assert.equal(p.meters[2].energy, 40);
    assert.equal(p.grossEnergy, 127);
    assert.equal(p.deductedEnergy, 60);
    assert.equal(p.totalEnergy, 67);
    assert.equal(r.calculatedRows[19].totalEnergy, 30);
    assert.equal(r.totalDirectEnergy, 1000);
    assert.equal(r.subAreasSumKWh, 157);
    assert.equal(r.gapKWh, -843);
    assert.equal(r.worksheet.derived.pipingAll, 67);
    assert.match(r.mainText, /16\. Piping Building 1#: 67.00 kWh/);
    const snapshot = reportSnapshot(d),
      saved = structuredClone(snapshot);
    const values = graphValues(snapshot, 'JRE');
    assert.equal(values.w2, 60);
    assert.equal(values.w5, 67);
    assert.equal(values.w6, 67);
    assert.deepEqual(snapshot, saved);
    assert.deepEqual(d, before);
    assert.equal(
      exportRawReading(d, 'end').text.includes(
        '16. Piping Building 1#: 10.5 (Ratio 40) + 107 + 300',
      ),
      true,
    );
    assert.match(exportRawReading(d, 'end').text, /3.5 \(Ratio 40\)/);
    assert.deepEqual(
      parseReading(exportRawReading(d, 'end').text, 'JRE').values,
      d.rows.map((row) => row.end),
    );
  }
});

test('Piping component validation cannot hide a negative net behind other positive Piping meters', () => {
  const d = entered();
  d.rows[15].end = ['10.5', '600', '259'];
  const r = calculateDraft(d);
  assert.equal(r.calculatedRows[15].meters[2].energy, null);
  assert.equal(r.calculatedRows[15].totalEnergy, null);
  assert.equal(r.calculatedRows[19].totalEnergy, 30);
  assert.equal(r.subAreasSumKWh, null);
  assert.ok(
    r.issues.some(
      (i) => i.code === 'NET_USAGE_NEGATIVE' && i.rowIndex === 15 && i.meterIndex === 2,
    ),
  );
  d.rows[15].end[2] = '260';
  assert.equal(calculateDraft(d).calculatedRows[15].meters[2].energy, 0);
});

test('Piping meter 3 requires only its raw pair and Window meter 6; unavailable readings stay unavailable', () => {
  for (const [ri, mi] of [
    [3, 5],
    [15, 2],
  ])
    for (const value of ['', '-', 'bad', '1']) {
      const d = entered();
      d.rows[ri].end[mi] = value;
      const r = calculateDraft(d);
      assert.equal(r.calculatedRows[15].meters[2].energy, null);
      assert.equal(r.calculatedRows[15].totalEnergy, null);
      assert.equal(r.calculatedRows[19].totalEnergy, 30);
      assert.equal(r.gapKWh, null);
    }
  for (const [ri, mi] of [
    [3, 0],
    [15, 1],
  ]) {
    const d = entered();
    d.rows[ri].end[mi] = '';
    assert.equal(calculateDraft(d).calculatedRows[15].meters[2].energy, 40);
  }
});

test('Piping meter 3 subtraction keeps six-place differences at the cumulative maximum scale', () => {
  const d = entered();
  d.rows[3].start[5] = '0';
  d.rows[3].end[5] = '24999999999';
  d.rows[15].start = ['0', '0', '0'];
  d.rows[15].end = ['0', '0', '999999999960.000001'];
  const r = calculateDraft(d);
  assert.equal(r.calculatedRows[15].totalEnergy, 0.000001);
  assert.equal(r.calculatedRows[15].meters[2].energy, 0.000001);
});

test('layout 3 upgrades preserve incomplete observations, old raw values and current-layout idempotence', () => {
  for (const make of [createDraft, createWorkingHoursDraft, createNightShiftDraft]) {
    const old = layout3JreDraft(entered(make));
    old.rows[15].start[1] = '100,';
    old.water = { start: '1.', end: '' };
    const before = structuredClone(old),
      next = migrateMeterLayout(old);
    assert.equal(next.meterLayout, 5);
    assert.deepEqual(next.rows[15].start, ['10', '100,', '']);
    assert.deepEqual(next.rows[15].end, ['10.5', '107', '']);
    assert.deepEqual(next.rows[3], old.rows[3]);
    assert.deepEqual(next.water, old.water);
    assert.deepEqual(old, before);
    assert.deepEqual(migrateMeterLayout(next), next);
    const restored = restoreDrafts(
      JSON.stringify({ version: 4, drafts: { JRE: old, UNILAND: createDraft('UNILAND') } }),
    ).JRE;
    assert.equal(restored.rows[15].end[2], '');
    assert.throws(() => reportSnapshot(old), /METER_LAYOUT_CHANGED/);
  }
});

test('old complete JRE imports omit only the new Piping meter and templates use 61 raw slots', () => {
  const old = layout3JreDraft(entered());
  for (const side of ['start', 'end']) {
    const parsed = parseReading(legacyText(old, side), 'JRE');
    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.suppliedMeters[15], [true, true, false]);
    assert.deepEqual(parsed.values[15], [...old.rows[15][side], '']);
  }
  const template = formatBlankReadingTemplate('JRE');
  assert.equal([...template.matchAll(/____/g)].length, 61);
  assert.match(template, /16\. Piping Building 1#: ____ \(Ratio 40\) \+ ____ \+ ____/);
  assert.match(template, /4\. Window: .* \+ ____ \(Ratio 40\)\n/);
});

test('previous Window meter 6 ratio warnings are revalidated without changing cumulative readings', () => {
  const old = layout3JreDraft(entered());
  old.importIssues = [
    {
      code: 'RATIO_MISMATCH',
      rowIndex: 3,
      meterIndex: 5,
      message: 'Window, meter 6: input ratio 40, template ratio 1. Using the template ratio.',
    },
  ];
  const next = restoreDrafts(
    JSON.stringify({ version: 4, drafts: { JRE: old, UNILAND: createDraft('UNILAND') } }),
  ).JRE;
  assert.deepEqual(next.importIssues, []);
  assert.deepEqual(next.rows[3], old.rows[3]);
});

test('graph extraction preserves historical Window and Piping results after factors and layout change', () => {
  const d = entered(),
    saved = reportSnapshot(d);
  saved.draft = layout3JreDraft(d);
  saved.engineVersion = '0.11.4-alpha';
  saved.output.reportText = saved.output.reportText
    .replace('4. Window: 60.00 kWh', '4. Window: 1.50 kWh')
    .replace('16. Piping Building 1#: 67.00 kWh', '16. Piping Building 1#: 27.00 kWh');
  saved.output.worksheetText = saved.output.worksheetText
    .replace('Window: 60', 'Window: 1.5')
    .replace('Piping All: 67', 'Piping All: 27')
    .replace('Piping #1: 67', 'Piping #1: 27');
  const before = structuredClone(saved),
    values = graphValues(saved, 'JRE');
  assert.equal(values.w2, 1.5);
  assert.equal(values.w5, 27);
  assert.equal(values.w6, 27);
  assert.deepEqual(saved, before);
});
