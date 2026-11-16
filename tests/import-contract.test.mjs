import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBlankReadingTemplate, formatReadingColumn } from '../raw-export.js';
import { parseReading } from '../importer.js';
import { createDraft } from '../engine.js';
import { PLANT_SCHEMAS } from '../schema.js';

for (const plant of ['JRE', 'UNILAND']) {
  test(
    plant + ' complete blank templates round-trip every current meter for daily and timed readings',
    () => {
      for (const work of [false, true])
        for (const time of ['08:00', '17:00']) {
          let n = 0;
          const values = [];
          const text = formatBlankReadingTemplate(plant, work)
            .replace('DD/MM/YYYY', '27/10/2026')
            .replace('HH:MM', time)
            .replaceAll('____', () => {
              const value = String(++n) + ',123456';
              values.push(value);
              return value;
            });
          const r = parseReading(text, plant);
          assert.equal(r.success, true, JSON.stringify(r.issues));
          assert.deepEqual(r.values.flat(), plant === 'JRE' ? values.slice(0, -1) : values);
          if (plant === 'JRE') assert.equal(r.flowReading, values.at(-1));
          assert.deepEqual(r.issues, []);
          assert.equal(r.values.length, PLANT_SCHEMAS[plant].rows.length);
        }
    },
  );
  test(
    plant + ' partial templates retain exact meter positions without supplying blank placeholders',
    () => {
      const text = formatBlankReadingTemplate(plant, true)
        .replace('DD/MM/YYYY', '27/10/2026')
        .replace('____', '0');
      const r = parseReading(text, plant);
      assert.equal(r.success, true, JSON.stringify(r.issues));
      assert.equal(r.time, undefined);
      assert.equal(r.values[0][0], '0');
      assert.equal(r.suppliedMeters.flat().filter(Boolean).length, 1);
      assert.equal(r.suppliedMeters[1][0], false);
      const d = createDraft(plant, '2026-10-27', '2026-10-28');
      d.rows[0].start[0] = '12.34';
      const column = parseReading(formatReadingColumn(d, 'start').text, plant);
      assert.equal(column.success, true, JSON.stringify(column.issues));
      assert.equal(column.suppliedMeters.flat().filter(Boolean).length, 1);
    },
  );
  test(
    plant +
      ' untouched templates explain the date and empty readings without cascading format errors',
    () => {
      const r = parseReading(formatBlankReadingTemplate(plant), plant);
      assert.equal(r.success, false);
      assert.ok(r.issues.some((i) => i.code === 'IMPORT_DATE'));
      assert.ok(r.issues.every((i) => ['IMPORT_DATE', 'IMPORT_EMPTY'].includes(i.code)));
      const dated = parseReading(
        formatBlankReadingTemplate(plant).replace('DD/MM/YYYY', '27/10/2026'),
        plant,
      );
      assert.equal(dated.success, false);
      assert.deepEqual(
        dated.issues.map((i) => i.code),
        ['IMPORT_EMPTY'],
      );
    },
  );
}
test('wrong factory and malformed nonempty readings remain rejected', () => {
  const valid = formatBlankReadingTemplate('JRE')
    .replace('DD/MM/YYYY', '27/10/2026')
    .replaceAll('____', '1');
  assert.ok(parseReading(valid, 'UNILAND').issues.some((i) => i.code === 'IMPORT_FACTORY'));
  assert.equal(
    parseReading(valid.replace('1. Total: 1', '1. Total: invalid'), 'JRE').success,
    false,
  );
});
test('UNILAND older complete lists may omit newly added direct meters without inventing readings', () => {
  const text = formatBlankReadingTemplate('UNILAND')
    .replace('DD/MM/YYYY', '27/10/2026')
    .replaceAll('____', '1')
    .replace(/^\d+\. (?:SV window|Painting|Dryer):.*\n/gm, '');
  const r = parseReading(text, 'UNILAND');
  assert.equal(r.success, true, JSON.stringify(r.issues));
  for (const name of ['SV window', 'Painting', 'Dryer']) {
    const i = PLANT_SCHEMAS.UNILAND.rows.findIndex((row) => row.name === name);
    assert.deepEqual(r.values[i], ['']);
    assert.deepEqual(r.suppliedMeters[i], [false]);
  }
});

test('import parsing bounds oversized input and accepts common full-width punctuation', () => {
  assert.equal(parseReading('1'.repeat(131073), 'JRE').issues[0].code, 'IMPORT_SIZE');
  const text = formatBlankReadingTemplate('UNILAND')
    .replace('DD/MM/YYYY', '27/10/2026')
    .replaceAll('____', '1')
    .replaceAll(':', '：')
    .replaceAll('+', '＋')
    .replaceAll('(', '（')
    .replaceAll(')', '）');
  assert.equal(parseReading(text, 'UNILAND').success, true);
});

test('empty multi-meter equipment is not mistaken for an old JRE layout', () => {
  const text = formatBlankReadingTemplate('JRE')
    .replace('DD/MM/YYYY', '27/10/2026')
    .replace('____', '1')
    .split('\n')
    .filter(
      (line) =>
        !/^\d+\. (Area Repair Injection Molding|Charging Forklift Building 2|Warehouse Lighting):/.test(
          line,
        ),
    )
    .map((line) => (line.includes('Dehumidifier:') ? '5. Dehumidifier:' : line))
    .join('\n');
  const parsed = parseReading(text, 'JRE');
  assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
  assert.deepEqual(parsed.suppliedMeters[4], [false, false]);
});

test('reading ranges use their first endpoint and accept compact presentation in both factories', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const text = formatBlankReadingTemplate(plant, true)
      .replace('DD/MM/YYYY', '14 / 11 / 2026 – 15/11/2026 (Afternoon)')
      .replace('HH:MM', '18.00 — 19:00')
      .replaceAll('____', '00123,123456')
      .replace(/Ratio /g, 'Ratio')
      .replace(/^(\d+)\. /gm, '$1)')
      .replace(/: /g, '：')
      .replace(/\n+/g, '\r\n')
      .replace('Heat Exchanger', 'HeatExchanger');
    const parsed = parseReading(text, plant);
    assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
    assert.equal(parsed.date, '2026-11-14');
    assert.equal(parsed.time, '18:00');
    assert.equal(parsed.values[0][0], '00123,123456');
    assert.ok(parsed.issues.some((i) => i.code === 'IMPORT_TIME_RANGE'));
    assert.ok(parsed.issues.some((i) => i.code === 'IMPORT_DATE_RANGE'));
  }
});

test('invalid range endpoints and repeated headers never become valid imports', () => {
  const text = formatBlankReadingTemplate('JRE', true)
    .replace('DD/MM/YYYY', '14/11/2026')
    .replaceAll('____', '1');
  for (const time of ['07:00-25:00', '99:00-08:00', '07:99-08:00', '07:00-08:00 extra'])
    assert.equal(parseReading(text.replace('HH:MM', time), 'JRE').success, false);
  assert.equal(
    parseReading(text.replace('14/11/2026', '14/11/2026-31/11/2026'), 'JRE').success,
    false,
  );
  assert.equal(parseReading(text + '\nReading time: 08:00', 'JRE').success, true);
  assert.equal(
    parseReading(text.replace('HH:MM', '07:00') + '\nReading time: 08:00', 'JRE').success,
    false,
  );
});

test('flow-only filled templates are partial input, not empty electricity', () => {
  const text = formatBlankReadingTemplate('JRE')
    .replace('DD/MM/YYYY', '15/11/2026')
    .replace('Air Compressor Flow: ____', 'Air Compressor Flow: 00123,500001');
  const parsed = parseReading(text, 'JRE');
  assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
  assert.equal(parsed.flowReading, '00123,500001');
  assert.equal(parsed.valueCount, 0);
  assert.equal(parsed.suppliedMeters.flat().some(Boolean), false);
});
