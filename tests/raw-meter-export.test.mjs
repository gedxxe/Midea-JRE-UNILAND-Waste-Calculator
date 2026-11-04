import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from '../engine.js';
import { exportAllRawReadings, parseRawReading } from '../raw-meter-export.js';
import { exportRawReading } from '../raw-export.js';
import { parseReading } from '../importer.js';

function filled(plant, kind = 'daily') {
  const d =
    kind === 'daily'
      ? createDraft(plant, '2026-11-01', '2026-11-02')
      : kind === 'workingHours'
        ? createWorkingHoursDraft(plant, '2026-11-01')
        : createNightShiftDraft(plant, '2026-11-01');
  d.rows.forEach((r) => {
    r.start.fill('100.000001');
    r.end.fill('125,250000');
  });
  d.water = { start: '100.000001', end: '135,250000' };
  if (plant === 'JRE')
    d.additionalReadings = Array.from({ length: 4 }, () => ({
      start: '200.000001',
      end: '230,250000',
    }));
  d.gas.entries.forEach((g, i) => {
    g.enabled = true;
    g.start = {
      reading: '0010.000001',
      temperature: i === 3 ? '-10,125000' : '',
      ...(i === 3 ? { unit: 'mm' } : {}),
    };
    g.end = {
      reading: '0025,250000',
      temperature: i === 3 ? '+33.500000' : '',
      ...(i === 3 ? { unit: 'mm' } : {}),
    };
  });
  return d;
}

test('all modes copy exact selected raw observations for both plants, without conversion or mutation', () => {
  for (const plant of ['JRE', 'UNILAND'])
    for (const kind of ['daily', 'workingHours', 'nightShift']) {
      const d = filled(plant, kind),
        before = structuredClone(d);
      for (const side of ['start', 'end']) {
        const out = exportAllRawReadings(d, side),
          value = side === 'start' ? '0010.000001' : '0025,250000';
        assert.deepEqual(out.issues, []);
        assert.ok(out.text.startsWith(exportRawReading(d, side).text + '\n\n'));
        assert.ok(out.text.includes('LPG: ' + value + ' %'));
        assert.ok(out.text.includes('Oxygen: ' + value + ' mmWC'));
        assert.ok(out.text.includes('Nitrogen: ' + value + ' mmH2O'));
        assert.ok(
          out.text.includes(
            'Refrigerant R32: ' +
              value +
              ' mm; temperature: ' +
              (side === 'start' ? '-10,125000' : '+33.500000') +
              ' °C',
          ),
        );
        assert.ok(out.text.includes('Water: ' + d.water[side] + ' m³'));
        if (plant === 'JRE')
          for (const name of ['T1', 'T2', 'T3', 'T4'])
            assert.ok(out.text.includes(name + ': ' + d.additionalReadings[0][side] + ' kWh'));
        else {
          assert.match(out.text, /2\. Trafo 1: 1/);
          assert.match(out.text, /Trafo 1, 2 and 3 cumulative readings are in MWh/);
          assert.doesNotMatch(out.text, /\nT[1-4]:/);
        }
        assert.doesNotMatch(out.text, /Consumption:|Converted stock|Gap:/);
      }
      assert.deepEqual(d, before);
    }
});

test('refills retain before/after raw readings, temperatures and explicit period context', () => {
  const d = filled('UNILAND', 'nightShift');
  d.gas.entries[3].refills.push({
    before: { reading: '10.000001', temperature: '31,125', unit: 'mm' },
    after: { reading: '11,000002', temperature: '32.25', unit: 'mm' },
  });
  const out = exportAllRawReadings(d);
  assert.deepEqual(out.issues, []);
  assert.match(
    out.text,
    /Refill observations for 01\/11\/2026 17:00 WIB to 02\/11\/2026 08:00 WIB/,
  );
  assert.match(out.text, /Event times not recorded\./);
  assert.match(out.text, /Before: 10\.000001 mm; temperature: 31,125 °C/);
  assert.match(out.text, /After: 11,000002 mm; temperature: 32\.25 °C/);
});

test('manual totals, unspecified units, notes and disabled retained tank readings stay distinct', () => {
  const d = filled('UNILAND');
  d.gas.entries[0].enabled = false;
  d.utilities[0] = { value: '1,250000', note: 'Check first\nSecond line' };
  d.utilities[1].value = '120.500000';
  d.utilities[6].value = '3,000001';
  d.utilities[2].value = 'HIDDEN OLD MANUAL VALUE';
  d.additionalReadings = [{ start: 'LEGACY', end: 'LEGACY' }];
  const out = exportAllRawReadings(d);
  assert.deepEqual(out.issues, []);
  assert.match(out.text, /LPG: 0025,250000 % \(tank entry off\)/);
  assert.match(out.text, /Entered values, not cumulative meter readings\./);
  assert.match(out.text, /LPG: 1,250000 Nm3/);
  assert.match(out.text, /Air Compressor: 120\.500000 Nm3/);
  assert.match(out.text, /R454B: 3,000001 \(unit not specified\)/);
  assert.match(out.text, /Notes:\nLPG:\n  Check first\n  Second line/);
  assert.doesNotMatch(out.text, /LEGACY|HIDDEN OLD/);
});

test('missing optional observations are explicit placeholders, while explicit zero and unavailable stay exact', () => {
  const d = filled('JRE');
  delete d.additionalReadings;
  delete d.gas;
  delete d.water;
  d.utilities[4].value = '5.25';
  let out = exportAllRawReadings(d);
  assert.deepEqual(out.issues, []);
  assert.ok(out.notices.includes('T1'));
  assert.match(out.text, /T1: ____ kWh/);
  assert.match(out.text, /Water: ____ m³/);
  assert.match(out.text, /Water: 5\.25 m³/);
  d.water = { start: '', end: '0' };
  d.additionalReadings = Array.from({ length: 4 }, () => ({ start: '', end: '-' }));
  out = exportAllRawReadings(d);
  assert.match(out.text, /Water: 0 m³/);
  assert.match(out.text, /T4: - kWh/);
  assert.doesNotMatch(out.text, /Water: 5\.25/);
});

test('raw sharing does not require valid opposite readings or calibration-range conversion', () => {
  const d = filled('JRE');
  d.rows.forEach((r) => r.start.fill('unfinished'));
  d.startDate = '';
  d.gas.entries[3].end = { reading: '0', temperature: '55.000001', unit: 'mm' };
  const out = exportAllRawReadings(d);
  assert.deepEqual(out.issues, []);
  assert.match(out.text, /Refrigerant R32: 0 mm; temperature: 55\.000001 °C/);
});

test('invalid scalars and malformed collections block copying instead of dropping data', () => {
  const temp = filled('JRE');
  temp.gas.entries[3].end.temperature = '-+1';
  assert.equal(exportAllRawReadings(temp).text, '');
  for (const value of ['1e3', '-1', '1.1234567', '1000000000000.000001', null]) {
    const d = filled('JRE');
    d.water.end = value;
    const out = exportAllRawReadings(d);
    assert.equal(out.text, '');
    assert.equal(out.issues[0].code, 'RAW_INVALID');
  }
  const d = filled('JRE');
  d.gas.entries.pop();
  assert.equal(exportAllRawReadings(d).text, '');
  assert.equal(exportAllRawReadings(null).text, '');
  d.endDate = '2026-02-30';
  assert.deepEqual(exportAllRawReadings(d).issues, [{ code: 'DATE' }]);
});

test('electricity-only round trip remains unchanged and full snapshots are explicitly sharing output', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const d = filled(plant),
      raw = exportRawReading(d).text;
    assert.equal(parseReading(raw, plant).success, true);
    assert.equal(parseReading(exportAllRawReadings(d).text, plant).success, false);
  }
});

test('full raw snapshots round trip both factories, sides and modes without altering the opposite observation', () => {
  for (const plant of ['JRE', 'UNILAND'])
    for (const mode of ['daily', 'workingHours', 'nightShift'])
      for (const side of ['start', 'end']) {
        const source = filled(plant, mode);
        source.gas.entries[0].refills = [
          { before: { reading: '10', temperature: '' }, after: { reading: '30', temperature: '' } },
        ];
        source.gas.entries[1].enabled = false;
        source.utilities[2].value = '12,5';
        if (plant === 'JRE') {
          source.gas.entries[3][side] = { reading: '123.456', temperature: '', unit: 'kg' };
          source.gas.entries[3].refills = [
            {
              before: { reading: '100', temperature: '33.5', unit: 'mm' },
              after: { reading: '300.125', temperature: '', unit: 'kg' },
            },
          ];
        }
        source.utilities[1].note = 'Synthetic note\nSecond line';
        const raw = exportAllRawReadings(source, side).text;
        const before = structuredClone(source);
        const parsed = parseRawReading(raw, source, side);
        assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
        assert.equal(exportAllRawReadings(parsed.raw, side).text, raw);
        assert.deepEqual(source, before);
        assert.equal(parseRawReading(raw.replaceAll('\n', '\r\n'), source, side).success, true);
        const wrongPeriod = structuredClone(source);
        wrongPeriod[side + 'Date'] = '2026-11-10';
        assert.equal(parseRawReading(raw, wrongPeriod, side).success, false);
        assert.equal(parseRawReading(raw + '\n\nUnknown: 123', source, side).success, false);
      }
});

test('legacy manual Water and absent tank observations survive full raw import', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const draft = filled(plant);
    delete draft.water;
    delete draft.gas;
    draft.utilities[4].value = '12.5';
    const raw = exportAllRawReadings(draft).text;
    const parsed = parseRawReading(raw, draft);
    assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
    assert.equal(parsed.raw.water, undefined);
    assert.equal(parsed.raw.utilities[4].value, '12.5');
    assert.equal(exportAllRawReadings(parsed.raw).text, raw);
  }
});
