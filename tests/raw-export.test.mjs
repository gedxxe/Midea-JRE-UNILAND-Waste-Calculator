import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft } from '../engine.js';
import { PLANT_SCHEMAS } from '../schema.js';
import { parseReading } from '../importer.js';
import { exportRawReading, formatBlankReadingTemplate } from '../raw-export.js';

test('blank templates contain every current meter slot and can be filled then imported', () => {
  for (const plant of Object.keys(PLANT_SCHEMAS)) {
    const template = formatBlankReadingTemplate(plant);
    const rows = PLANT_SCHEMAS[plant].rows;
    assert.ok(template.startsWith(`${plant}\n\nDD/MM/YYYY\n\n`));
    assert.equal(template.split('\n').filter((line) => /^\d+\./.test(line)).length, rows.length);
    assert.equal(
      [...template.matchAll(/____/g)].length,
      rows.reduce((n, row) => n + row.factors.length, 0),
    );
    assert.equal(parseReading(template, plant).success, false);
    assert.equal(parseReading(template.replace('DD/MM/YYYY', '07/10/2026'), plant).success, false);
    let index = 0;
    const completed = template
      .replace('DD/MM/YYYY', '07/10/2026')
      .replaceAll('____', () => `${++index},125000`);
    const parsed = parseReading(completed, plant);
    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.issues, []);
    assert.equal(parsed.date, '2026-10-07');
    index = 0;
    assert.deepEqual(
      parsed.values,
      rows.map((row) => row.factors.map(() => `${++index},125000`)),
    );
  }
  const jre = formatBlankReadingTemplate('JRE');
  assert.ok(
    jre.includes(
      '4. Window: ____ + ____ (Ratio 90) + ____ (Ratio 90) + ____ (Ratio 40) + ____ (Ratio 40) + ____\n',
    ),
  );
  assert.ok(jre.includes('16. Piping Building 1#: ____ (Ratio 40) + ____\n'));
  assert.ok(jre.includes('26. Warehouse Area: ____ (Ratio 40)\n'));
  assert.ok(jre.includes('12. Air Compressor 1#: ____ (Ratio 40)\n'));
  const uniland = formatBlankReadingTemplate('UNILAND');
  assert.ok(uniland.includes('1. Total: ____ ((Ratio 3200)/1000)\n'));
  assert.ok(uniland.includes('2. Trafo 1: ____\n'));
  assert.throws(() => formatBlankReadingTemplate('other'), RangeError);
});

function filled(plant = 'JRE') {
  const draft = createDraft(plant, '2026-09-24', '2026-09-25');
  draft.rows.forEach((row) => {
    row.start.fill('100.00');
    row.end.fill('125,250000');
  });
  return draft;
}

test('JRE exports the chosen raw column, ratios and date without applying consumption rules', () => {
  const draft = filled();
  draft.rows[0].end[0] = '0001,230000'; // Decreasing counter remains a raw observation.
  draft.rows[11].inactive = true;
  draft.rows[11].end[0] = '-'; // Inactive consumption must not turn raw unknown into zero.
  draft.rows[13].end[0] = '0';
  draft.rows[1].end = ['+12.3400', '999999999999.999999'];
  draft.utilities.forEach((entry) => {
    entry.value = 'not a number';
    entry.note = 'EXCLUDED UTILITY';
  });
  const before = structuredClone(draft);
  const output = exportRawReading(draft);
  assert.deepEqual(output.issues, []);
  assert.ok(output.text.startsWith('JRE\n\n25/09/2026\n\n1. Total: 0001,230000\n'));
  assert.ok(
    output.text.includes('2. Indoor: 12.3400 (Ratio 250) + 999999999999.999999 (Ratio 40)'),
  );
  assert.ok(output.text.includes('12. Air Compressor 1#: - (Ratio 40)\n'));
  assert.ok(output.text.includes('14. New Air Compressor 2#: 0'));
  assert.ok(
    output.text.includes('28. Utility Area: 125,250000 (Ratio 1000) + 125,250000 (Ratio 40)'),
  );
  assert.ok(output.text.endsWith('29. Heater LPG: 125,250000 (Ratio 40)'));
  assert.equal(output.text.includes('EXCLUDED UTILITY'), false);
  assert.equal(output.text.includes('not a number'), false);
  assert.deepEqual(draft, before);
});

test('UNILAND exports all 30 current table rows and labels factors without converting MWh readings', () => {
  const draft = filled('UNILAND');
  draft.rows[1].end[0] = '2,040000';
  const { text, issues } = exportRawReading(draft);
  assert.deepEqual(issues, []);
  assert.ok(text.includes('1. Total: 125,250000 ((Ratio 3200)/1000)'));
  assert.ok(text.includes('2. Trafo 1: 2,040000'));
  assert.ok(text.includes('5. Building A: 125,250000 ((Ratio 160)/1000)'));
  assert.ok(text.includes('6. Building B: 125,250000 ((Ratio 80)/1000)'));
  assert.ok(text.includes('8. SDP pompa: 125,250000 ((Ratio 20)/1000)'));
  assert.ok(text.endsWith('30. Refrigant and LPG area: 125,250000 (Ratio 40)'));
  assert.equal(text.split('\n').filter((line) => /^\d+\./.test(line)).length, 30);
  assert.equal(text.includes('New Office Building A'), true);
});

test('both factory exports can be imported back without losing raw precision or meter order', () => {
  for (const plant of Object.keys(PLANT_SCHEMAS)) {
    const draft = filled(plant);
    draft.rows[1].start[0] = '-';
    for (const side of ['start', 'end']) {
      const output = exportRawReading(draft, side);
      const imported = parseReading(output.text, plant);
      assert.equal(imported.success, true);
      assert.deepEqual(imported.issues, []);
      assert.equal(imported.date, draft[side + 'Date']);
      assert.deepEqual(
        imported.values,
        draft.rows.map((row) => row[side]),
      );
    }
  }
});

test('raw export needs only its selected date and column, not a complete consumption report', () => {
  const draft = filled();
  draft.startDate = '';
  draft.rows.forEach((row) => row.start.fill('invalid'));
  assert.deepEqual(exportRawReading(draft, 'end').issues, []);
  assert.equal(exportRawReading(draft, 'start').text, '');
  draft.startDate = '2026-09-26';
  draft.rows.forEach((row) => row.start.fill('9'));
  assert.ok(exportRawReading(draft, 'start').text.startsWith('JRE\n\n26/09/2026'));
});

test('empty, invalid and malformed data never produces a partial export or silent zeros', () => {
  for (const value of ['', ' ', '1e3', '1,000.25', '-2', '1.1234567', '1000000000001', null]) {
    const draft = filled();
    draft.rows[1].end[0] = value;
    const output = exportRawReading(draft);
    assert.equal(output.text, '');
    assert.equal(output.issues[0].rowIndex, 1);
    assert.equal(output.issues[0].meterIndex, 0);
  }
  const draft = filled();
  draft.endDate = '2026-02-30';
  assert.deepEqual(exportRawReading(draft).issues, [{ code: 'DATE' }]);
  assert.equal(exportRawReading(draft, 'other').text, '');
  assert.equal(exportRawReading(null).text, '');
  draft.rows[0].end.push('7');
  assert.equal(exportRawReading(draft).text, '');
  draft.rows.pop();
  assert.deepEqual(exportRawReading(draft).issues, [{ code: 'SHAPE' }]);
});
