import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExcelRow, excelRowToTSV, excelRowPreview, EXCEL_LAYOUTS } from '../excel-row.js';
import { calculateDraft } from '../engine.js';
import { reportPeriods } from './fixtures/report-periods.mjs';
import { PLANT_SCHEMAS } from '../schema.js';
import { createGasDraft, gasMassText } from '../gas.js';
const colNumber = (text) => [...text].reduce((value, c) => value * 26 + c.charCodeAt(0) - 64, 0);
const get = (row, column) => row.values[row.columns.findIndex((c) => c.column === column)];
for (const plant of ['JRE', 'UNILAND']) {
  test(plant + ' exports every fixed workbook position and preserves its separator', () => {
    const layout = EXCEL_LAYOUTS[plant],
      first = colNumber(layout.start);
    assert.equal(layout.columns.length, plant === 'JRE' ? 47 : 44);
    layout.columns.forEach((c, i) => assert.equal(colNumber(c.column), first + i));
    for (const c of layout.columns.filter((c) => c.source === 'row'))
      assert.ok(
        PLANT_SCHEMAS[plant].rows.some((r) => r.name === c.name),
        c.name,
      );
    for (const draft of reportPeriods(plant, '2026-10-27')) {
      const report = calculateDraft(draft),
        before = JSON.stringify({ draft, report }),
        row = buildExcelRow(draft, report);
      const tsv = excelRowToTSV(row);
      assert.equal(tsv.split('\t').length, layout.columns.length);
      assert.equal(get(row, layout.separator), '');
      assert.ok(!/20\d{2}-\d{2}-\d{2}/.test(tsv) && !tsv.includes('\n'));
      assert.equal(JSON.stringify({ draft, report }), before);
      for (const c of layout.columns.filter((c) => c.source === 'row')) {
        const source = report.calculatedRows.find((r) => r.name === c.name);
        assert.equal(get(row, c.column), source.missing ? '-' : String(source.totalEnergy));
      }
    }
  });
}
test('JRE copies T1-T4 consumption, current net rows, gap and Water with no date', () => {
  const draft = reportPeriods('JRE', '2026-10-27')[0];
  draft.additionalReadings = [
    { start: '0', end: '0' },
    { start: '10', end: '12.345678' },
    { start: '100', end: '103' },
    { start: '200', end: '205' },
  ];
  const report = calculateDraft(draft),
    row = buildExcelRow(draft, report);
  assert.deepEqual(row.values.slice(0, 4), ['0', '2.345678', '3', '5']);
  assert.equal(get(row, 'I'), String(report.gapKWh));
  assert.equal(get(row, 'J'), String(report.subAreasSumKWh));
  for (const [column, index] of [
    ['P', 15],
    ['AB', 19],
    ['AH', 18],
    ['AK', 25],
  ])
    assert.equal(get(row, column), String(report.calculatedRows[index].totalEnergy));
  assert.equal(get(row, 'AY'), '2');
  assert.equal(get(row, 'AU'), '');
  assert.equal(get(row, 'AX'), '');
  assert.ok(excelRowPreview(row).startsWith('E: T1 (kWh) = 0'));
  const empty = buildExcelRow(
    reportPeriods('JRE', '2026-10-27')[0],
    calculateDraft(reportPeriods('JRE', '2026-10-27')[0]),
  );
  assert.ok(excelRowToTSV(empty).startsWith('\t\t\t\t'));
});
test('UNILAND keeps direct equipment separate and never maps an unknown lab to Spot Welding', () => {
  const draft = reportPeriods('UNILAND', '2026-10-27')[0];
  const report = calculateDraft(draft);
  report.calculatedRows.forEach((r, i) => {
    r.totalEnergy = i + 0.125;
    r.missing = false;
  });
  const row = buildExcelRow(draft, report),
    index = (n) => PLANT_SCHEMAS.UNILAND.rows.findIndex((r) => r.name === n);
  for (const [column, name] of [
    ['BE', 'Indoor'],
    ['BG', 'Outdoor'],
    ['BH', 'Heat Exchanger'],
    ['BI', 'Building A'],
    ['BP', 'Trafo 1'],
    ['BQ', 'Trafo 2'],
    ['BR', 'Trafo 3'],
    ['BS', 'Piping'],
    ['BW', 'Vacum box indoor'],
    ['CA', 'Line compressor outdoor'],
    ['CB', 'SV window'],
    ['CF', '10HP Enthalpy Difference Lab'],
    ['CH', 'Painting'],
    ['CI', 'Dryer'],
    ['CN', 'Charger Forklift Area'],
  ])
    assert.equal(get(row, column), String(index(name) + 0.125));
  for (const column of ['BF', 'BJ', 'BO', 'CJ', 'CO']) assert.equal(get(row, column), '');
  assert.equal(row.columns.find((c) => c.column === 'BI').unit, 'MWh');
  assert.equal(row.columns.find((c) => c.column === 'BE').unit, 'kWh');
});
function tanks(plant) {
  const draft = reportPeriods(plant, '2026-10-27')[0];
  draft.gas = createGasDraft(plant);
  for (const [i, start, end, before, after] of [
    [0, '40', '30', '20', '50'],
    [1, '500', '400', '300', '700'],
    [2, '500', '400', '300', '800'],
    [3, '1000', '700', '800', '1200'],
  ]) {
    const point = (reading) => ({ reading, temperature: i === 3 ? '30' : '' });
    draft.gas.entries[i] = {
      enabled: true,
      start: point(start),
      end: point(end),
      refills: [{ before: point(before), after: point(after) }],
    };
  }
  return draft;
}
test('UNILAND exports refill-corrected raw units while JRE exports converted signed kg', () => {
  let draft = tanks('UNILAND'),
    report = calculateDraft(draft),
    row = buildExcelRow(draft, report);
  assert.equal(report.success, true, JSON.stringify(report.issues));
  for (const [column, value] of [
    ['CS', '40'],
    ['CR', '500'],
    ['CQ', '600'],
    ['CV', '700'],
  ])
    assert.equal(get(row, column), value);
  assert.equal(row.columns.find((c) => c.column === 'CS').unit, '%');
  assert.notEqual(get(row, 'CQ'), String(report.gasResults.find((g) => g.gas === 'N2').kg));
  draft = tanks('JRE');
  report = calculateDraft(draft);
  row = buildExcelRow(draft, report);
  for (const [column, id] of [
    ['AQ', 'LPG'],
    ['AR', 'O2'],
    ['AS', 'N2'],
    ['AT', 'R32'],
  ])
    assert.equal(get(row, column), gasMassText(report.gasResults.find((g) => g.gas === id).kg));
});
test('raw gas balances keep zero, decimal precision and measured stock increases without a temperature correction', () => {
  const draft = tanks('UNILAND');
  draft.gas.entries[2] = {
    enabled: true,
    start: { reading: '500.000001', temperature: '' },
    end: { reading: '600.000002', temperature: '' },
    refills: [],
  };
  draft.gas.entries[3] = {
    enabled: true,
    start: { reading: '1000', temperature: '30' },
    end: { reading: '1000', temperature: '40' },
    refills: [],
  };
  const report = calculateDraft(draft),
    row = buildExcelRow(draft, report);
  assert.equal(get(row, 'CQ'), '-100.000001');
  assert.equal(get(row, 'CV'), '0');
  assert.ok(row.notes.some((n) => n.column === 'CQ' && n.code === 'stockIncrease'));
  assert.notEqual(report.gasResults.find((g) => g.gas === 'R32').kg, 0);
});
test('manual utilities stay in workbook units, preserve exact decimals and exclude notes or formulas', () => {
  const draft = reportPeriods('UNILAND', '2026-10-27')[0];
  for (const [index, value] of [
    [0, '12,5'],
    [1, '0'],
    [2, '  '],
    [3, '99.001'],
    [5, '999999999999.999999'],
    [6, '3.125'],
  ])
    draft.utilities[index].value = value;
  draft.utilities[0].note = '=HYPERLINK("https://example.invalid")';
  const row = buildExcelRow(draft, calculateDraft(draft));
  for (const [column, value] of [
    ['CS', '12.5'],
    ['CP', '0'],
    ['CR', ''],
    ['CQ', '99.001'],
    ['CV', '999999999999.999999'],
    ['CU', '3.125'],
  ])
    assert.equal(get(row, column), value);
  assert.equal(row.columns.find((c) => c.column === 'CS').unit, 'Nm³');
  assert.ok(!excelRowToTSV(row).includes('='));
});
test('missing and unavailable readings keep slots and never produce false zero', () => {
  const draft = tanks('JRE');
  draft.rows[1].end[0] = '-';
  draft.gas.entries[0].end.reading = '-';
  draft.water.end = '-';
  const row = buildExcelRow(draft, calculateDraft(draft));
  for (const column of ['K', 'I', 'J', 'AQ', 'AY']) assert.equal(get(row, column), '-');
  assert.equal(get(row, 'AP'), '');
});
