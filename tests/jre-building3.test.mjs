import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraft,
  createWorkingHoursDraft,
  createNightShiftDraft,
  calculateDraft,
} from '../engine.js';
import { PLANT_SCHEMAS } from '../schema.js';
import { restoreDrafts } from '../storage.js';
import { parseReading } from '../importer.js';
import { exportRawReading, formatBlankReadingTemplate } from '../raw-export.js';
import { migrateMeterLayout } from '../meter-layout.js';
import { graphValues } from '../graph-data.js';
import { reportSnapshot } from '../server/report-data.js';
import { legacyDraft, legacyText, layout2Draft } from './fixtures/legacy-layout.mjs';
const index = (name) => PLANT_SCHEMAS.JRE.rows.findIndex((row) => row.name === name);
function entered(make = createDraft) {
  const d = make('JRE', '2026-10-16', ...(make === createDraft ? ['2026-10-17'] : []));
  d.rows.forEach((r) => {
    r.start.fill('1000');
    r.end.fill('1000');
  });
  const set = (name, a, b) => {
    d.rows[index(name)].start = [].concat(a);
    d.rows[index(name)].end = [].concat(b);
  };
  set('Total', '1000', '2000');
  set('Dehumidifier', ['10', '2'], ['20', '3.5']);
  set('Piping Building 3#', '3', '5');
  set('Electricity Building 3#', '400', '700');
  set('Area Repair Injection Molding', '50', '65');
  return d;
}
const row = (report, name) => report.calculatedRows[index(name)];
test('JRE Vacuum Box, Piping 3 and Repair use the requested factors in every electricity period', () => {
  for (const make of [createDraft, createWorkingHoursDraft, createNightShiftDraft]) {
    const d = entered(make),
      original = structuredClone(d),
      report = calculateDraft(d);
    assert.equal(report.success, true);
    assert.equal(row(report, 'Dehumidifier').totalEnergy, 70);
    assert.equal(row(report, 'Dehumidifier').meters[1].energy, 60);
    assert.equal(row(report, 'Piping Building 3#').totalEnergy, 80);
    assert.equal(row(report, 'Electricity Building 3#').grossEnergy, 300);
    assert.equal(row(report, 'Electricity Building 3#').deductedEnergy, 140);
    assert.equal(row(report, 'Electricity Building 3#').totalEnergy, 160);
    assert.equal(row(report, 'Area Repair Injection Molding').totalEnergy, 15);
    assert.equal(report.totalDirectEnergy, 1000);
    assert.equal(report.subAreasSumKWh, 325);
    assert.equal(report.gapKWh, -675);
    assert.match(report.reportSectionText, /Sub-meter 2-32: 325.00 kWh/);
    assert.match(report.mainText, /30\. Area Repair Injection Molding: 15.00 kWh/);
    assert.equal(report.worksheet.values.length, 19);
    assert.equal(report.worksheet.values[4], 70);
    assert.equal(report.worksheet.derived.pipingAll, 80);
    const snapshot = reportSnapshot(d);
    const graph = graphValues(snapshot, 'JRE');
    assert.equal(graph.w3, 70);
    assert.equal(graph.w7, 80);
    assert.equal(graph.r9, 160);
    assert.equal(graph.r29, 15);
    const raw = exportRawReading(d, 'end');
    assert.match(raw.text, /5\. Dehumidifier: 20 \+ 3.5 \(Ratio 40\)/);
    assert.match(raw.text, /10\. Electricity Building 3#: 700/);
    assert.match(raw.text, /17\. Piping Building 3#: 5 \(Ratio 40\)/);
    assert.deepEqual(
      parseReading(raw.text, 'JRE').values,
      d.rows.map((r) => r.end),
    );
    assert.deepEqual(d, original);
  }
});
test('Building 3 depends only on Vacuum Box and Piping 3, not the original Dehumidifier meter', () => {
  const d = entered();
  d.rows[4].start[0] = '';
  const report = calculateDraft(d);
  assert.equal(row(report, 'Dehumidifier').totalEnergy, null);
  assert.equal(row(report, 'Electricity Building 3#').totalEnergy, 160);
  assert.equal(report.subAreasSumKWh, null);
});
test('missing, unavailable or decreasing dependencies and negative net totals remain unavailable', () => {
  for (const target of [
    [4, 1],
    [16, 0],
  ])
    for (const value of ['', '-', 'bad', '1']) {
      const d = entered();
      d.rows[target[0]].end[target[1]] = value;
      const report = calculateDraft(d);
      assert.equal(row(report, 'Electricity Building 3#').totalEnergy, null);
      assert.equal(report.gapKWh, null);
      assert.ok(report.issues.some((i) => i.rowIndex === 9 && i.code === 'DEPENDENCY_UNAVAILABLE'));
    }
  const d = entered();
  d.rows[9].end[0] = '539.999999';
  assert.ok(
    calculateDraft(d).issues.some((i) => i.rowIndex === 9 && i.code === 'NET_USAGE_NEGATIVE'),
  );
  d.rows[9].end[0] = '540';
  assert.equal(row(calculateDraft(d), 'Electricity Building 3#').totalEnergy, 0);
});
test('two included meters are subtracted at scaled precision before converting to numbers', () => {
  const d = entered();
  d.rows[9] = { start: ['0'], end: ['999999999960.000001'] };
  d.rows[4] = { start: ['0', '0'], end: ['0', '24999999998'] };
  d.rows[16] = { start: ['0'], end: ['1'] };
  assert.equal(row(calculateDraft(d), 'Electricity Building 3#').totalEnergy, 0.000001);
});
test('layouts 1 and 2 preserve all old raw strings and new blank slots across all modes', () => {
  for (const make of [createDraft, createWorkingHoursDraft, createNightShiftDraft]) {
    const old = layout2Draft(entered(make));
    old.water = { start: '123.', end: '' };
    old.additionalReadings = [
      { start: '1', end: '2' },
      ...Array.from({ length: 3 }, () => ({ start: '', end: '' })),
    ];
    old.rows[3].start[0] = '12,';
    const before = structuredClone(old),
      next = restoreDrafts(
        JSON.stringify({ version: 4, drafts: { JRE: old, UNILAND: createDraft('UNILAND') } }),
      ).JRE;
    assert.deepEqual(old, before);
    assert.equal(next.meterLayout, 6);
    assert.equal(next.rows.length, 32);
    assert.deepEqual(next.rows[4].start, [old.rows[4].start[0], '']);
    assert.deepEqual(next.rows[29].end, ['']);
    assert.deepEqual(next.water, old.water);
    assert.deepEqual(next.additionalReadings, old.additionalReadings);
    assert.equal(next.startTime, old.startTime);
    assert.equal(next.endTime, old.endTime);
    assert.deepEqual(next.rows[3].start, old.rows[3].start);
    assert.deepEqual(migrateMeterLayout(next), next);
    assert.equal(calculateDraft(next).success, false);
    assert.throws(() => reportSnapshot(old), /METER_LAYOUT_CHANGED/);
    assert.throws(() => reportSnapshot({ ...old, meterLayout: 6 }), /INVALID_REPORT/);
  }
  const old = legacyDraft(),
    next = migrateMeterLayout(old);
  assert.equal(next.rows[3].start[5], old.rows[25].start[2]);
  assert.equal(next.rows[15].start[1], old.rows[25].start[1]);
  assert.deepEqual(next.rows[4].end, [old.rows[4].end[0], '']);
});
test('complete older raw imports identify supplied cells; mixed or incomplete layouts fail atomically', () => {
  for (const old of [legacyDraft(), layout2Draft(entered())])
    for (const side of ['start', 'end']) {
      const raw = legacyText(old, side),
        result = parseReading(raw, 'JRE');
      assert.equal(result.success, true);
      assert.equal(result.values.length, 32);
      assert.deepEqual(result.suppliedMeters[4], [true, false]);
      assert.deepEqual(result.suppliedMeters[29], [false]);
      assert.deepEqual(
        result.values,
        migrateMeterLayout(old).rows.map((r) => r[side]),
      );
      const annotated = parseReading(
        raw.replace(/^(17\. Piping Building 3#:.*)$/m, '$1 (Ratio 40)'),
        'JRE',
      );
      assert.equal(annotated.success, true);
      assert.ok(!annotated.issues.some((i) => i.rowIndex === 16));
      assert.equal(parseReading(raw.replace(/^6\. Heat Exchanger:.*$/m, ''), 'JRE').success, false);
      assert.equal(
        parseReading(raw + '\n30. Area Repair Injection Molding: 1', 'JRE').success,
        false,
      );
      assert.equal(
        parseReading(
          raw.replace(/^5\. Dehumidifier:.*$/m, '5. Dehumidifier: 1 + 2 (Ratio 40)'),
          'JRE',
        ).success,
        false,
      );
    }
  const template = formatBlankReadingTemplate('JRE');
  assert.equal([...template.matchAll(/____/g)].length, 62);
  assert.match(template, /5\. Dehumidifier: ____ \+ ____ \(Ratio 40\)/);
  assert.match(template, /30\. Area Repair Injection Molding: ____\n/);
});
test('saved old graph output is read as approved, with no fabricated repair series or net recalculation', () => {
  const d = entered(),
    saved = reportSnapshot(d);
  saved.output.reportText = saved.output.reportText
    .replace('10. Electricity Building 3#: 160.00 kWh', '10. Electricity Building 3#: 300.00 kWh')
    .replace(/^30\. Area Repair Injection Molding:.*\n/m, '');
  const before = structuredClone(saved),
    values = graphValues(saved, 'JRE');
  assert.equal(values.r9, 300);
  assert.equal(values.r29, null);
  assert.deepEqual(saved, before);
});
