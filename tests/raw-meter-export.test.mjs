import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from '../engine.js';
import { exportAllRawReadings, parseRawReading } from '../raw-meter-export.js';
import { exportRawReading } from '../raw-export.js';
import { parseReading } from '../importer.js';

test('JRE full raw flow snapshots accept whitespace changes and retain exact notes and readings', () => {
  const draft = filled('JRE');
  draft.airCompressor = { start: '0010.000001', end: '0020,000002' };
  const text = exportAllRawReadings(draft).text;
  assert.match(text, /Air Compressor: 0020,000002 Nm³/);
  assert.equal(text.match(/^Air Compressor:.*Nm³$/gm)?.length, 1);
  const [body, notes] = text.split('\n\nNotes:\n');
  const loose =
    body.replace(/\n\n/g, '\n').replace(/: /g, ':    ') +
    (notes === undefined ? '' : '\nNotes:\n' + notes);
  const parsed = parseRawReading(loose, draft);
  assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
  assert.deepEqual(parsed.raw.airCompressor, draft.airCompressor);
  assert.deepEqual(parsed.raw.gas, draft.gas);
  assert.deepEqual(parsed.raw.utilities, draft.utilities);
  const blankFlow = text.replace('Air Compressor: 0020,000002 Nm³', 'Air Compressor: ____ Nm³');
  assert.deepEqual(parseRawReading(blankFlow, draft).raw.airCompressor, draft.airCompressor);
  const legacy = text.replace(/\n\nCumulative Air Compressor reading:\nAir Compressor: [^\n]+/, '');
  assert.equal(parseRawReading(legacy, draft).success, true);
  const duplicate = text.replace(
    'Cumulative Air Compressor reading:',
    'Cumulative Air Compressor reading:\nAir Compressor: 5 Nm³',
  );
  const rejected = parseRawReading(duplicate, draft);
  assert.equal(rejected.success, false);
  assert.match(rejected.issues.at(-1).message, /Air Compressor.*Nothing was changed/);
});

test('plain flow imports accept unit and spacing variants but identify wrong units and duplicates', () => {
  const draft = filled('JRE');
  const text = exportRawReading(draft).text;
  for (const suffix of [
    '\nAir Compressor Flow:0010,2500 Nm3',
    '\n\nFlow Meter Air Compressor : 0010,2500 Nm^3',
  ]) {
    const parsed = parseReading(text + suffix, 'JRE');
    assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
    assert.equal(parsed.flowReading, '0010,2500');
  }
  for (const suffix of [
    '\nAir Compressor Flow: 10 kg',
    '\nAir Compressor Flow: 10 Nm³\nAir Compressor Flow: 11 Nm³',
  ]) {
    const parsed = parseReading(text + suffix, 'JRE');
    assert.equal(parsed.success, false);
    const issue = parsed.issues.find((i) => i.code === 'IMPORT_FLOW');
    assert.ok(issue.sourceLine > 0);
    assert.match(issue.message, /Line \d+.*Nm³.*Use/);
  }
});

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

test('previous full snapshots preserve a newly added Outdoor observation at the same boundary', () => {
  for (const mode of ['daily', 'workingHours', 'nightShift']) {
    const draft = filled('JRE', mode);
    for (const side of ['start', 'end']) {
      const raw = exportAllRawReadings(draft, side).text;
      const old = raw.replace(/^(3\. Outdoor: .*?) \+ [^+\n]+ \(Ratio 40\)$/m, '$1');
      assert.notEqual(old, raw);
      for (const text of [old, old.replace(/^(3\. Outdoor:.*)$/m, '$1 + ____ (Ratio 40)')]) {
        const parsed = parseRawReading(text, draft, side);
        assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
        assert.equal(parsed.suppliedMeters[2][2], false);
        assert.equal(parsed.raw.rows[2][side][2], draft.rows[2][side][2]);
      }
      assert.equal(
        parseRawReading(old.replace('Ratio 40', 'Ratio 99'), draft, side).success,
        false,
      );
    }
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

test('blank JRE cumulative air flow keeps one raw entry and imports in every period', () => {
  for (const mode of ['daily', 'workingHours', 'nightShift'])
    for (const side of ['start', 'end']) {
      const draft = filled('JRE', mode);
      const before = structuredClone(draft);
      const raw = exportAllRawReadings(draft, side).text;
      assert.equal(raw.match(/^Air Compressor: ____ Nm³$/gm)?.length, 1);
      const parsed = parseRawReading(raw, draft, side);
      assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
      assert.deepEqual(parsed.raw.airCompressor, draft.airCompressor);
      assert.deepEqual(draft, before);
    }
});

test('full raw reading windows select the first time for shifts and keep daily at 08:00', () => {
  for (const plant of ['JRE', 'UNILAND'])
    for (const [mode, time, range] of [
      ['daily', '08:00', '07:00–08:00'],
      ['workingHours', '18:00', '18:00-19:00'],
      ['nightShift', '07:00', '07:00—08:00'],
    ]) {
      const draft = filled(plant, mode);
      if (mode !== 'daily') draft.endTime = time;
      const before = structuredClone(draft);
      const raw = exportAllRawReadings(draft).text;
      const input = raw
        .replace(/^(\d{2}\/\d{2}\/\d{4})$/m, '$1 (Morning)')
        .replace(/^Reading time:.*\n/m, '')
        .replace(/^(\d{2}\/\d{2}\/\d{4} \(Morning\))$/m, '$1\nReading time: ' + range + ' WIB')
        .replace(/^(Selected observation:.*) \d{2}:\d{2} WIB/m, '$1 17:00 WIB')
        .replace(/\n\n/g, '\n')
        .replace(/: /g, '：')
        .replace(/(\d) kWh/g, '$1kwh');
      const parsed = parseRawReading(input, draft);
      assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
      assert.equal(parsed.time, time);
      assert.equal(exportAllRawReadings(parsed.raw).text, exportAllRawReadings(draft).text);
      assert.equal(
        exportAllRawReadings(parsed.raw, 'start').text,
        exportAllRawReadings(draft, 'start').text,
      );
      assert.deepEqual(draft, before);
      assert.equal(
        parsed.issues.filter((i) => i.code === 'IMPORT_DAILY_TIME').length,
        mode === 'daily' ? 1 : 0,
      );
      assert.ok(parsed.issues.some((i) => i.code === 'IMPORT_OBSERVATION'));
    }
});

test('destination preparation retains its opposite raw readings and rejects mismatched refill context', () => {
  const source = filled('JRE', 'workingHours');
  const text = exportAllRawReadings(source).text.replace('17:00 WIB', '18:00-19:00 WIB');
  const destination = structuredClone(source);
  destination.endTime = '18:00';
  destination.water.start = '00012.345678';
  destination.gas.entries[3].start = { reading: '125.987654', temperature: '', unit: 'kg' };
  const parsed = parseRawReading(text, source, 'end', () => destination);
  assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
  assert.equal(parsed.raw.water.start, destination.water.start);
  assert.deepEqual(parsed.raw.gas.entries[3].start, destination.gas.entries[3].start);
  source.gas.entries[0].refills = [
    { before: { reading: '10', temperature: '' }, after: { reading: '20', temperature: '' } },
  ];
  const refills = exportAllRawReadings(source).text.replace(
    'Reading time: 17:00',
    'Reading time: 18:00-19:00',
  );
  const before = structuredClone(destination);
  const rejected = parseRawReading(refills, source, 'end', () => destination);
  assert.equal(rejected.success, false);
  assert.match(rejected.issues.at(-1).message, /Refill period does not match/);
  assert.deepEqual(destination, before);
});

test('omitted refill and note sections never erase saved context, and blank manual totals remain unsupplied', () => {
  for (const plant of ['JRE', 'UNILAND']) {
    const source = filled(plant);
    const target = structuredClone(source);
    target.gas.entries[0].refills = [
      { before: { reading: '10', temperature: '' }, after: { reading: '20', temperature: '' } },
    ];
    target.utilities[0].note = 'Saved note\nLiteral  spaces: untouched';
    if (plant === 'UNILAND') target.utilities[1].value = '0012,345678';
    const before = structuredClone(target);
    const parsed = parseRawReading(exportAllRawReadings(source).text, target);
    assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
    assert.deepEqual(parsed.raw.gas.entries[0].refills, target.gas.entries[0].refills);
    assert.equal(parsed.raw.utilities[0].note, target.utilities[0].note);
    if (plant === 'UNILAND') assert.equal(parsed.raw.utilities[1].value, '0012,345678');
    assert.deepEqual(target, before);
  }
});

test('blank UNILAND manual context tolerates a reading window but nonempty period totals do not', () => {
  const source = filled('UNILAND', 'workingHours');
  const destination = structuredClone(source);
  destination.endTime = '18:00';
  const snapshot = () =>
    exportAllRawReadings(source).text.replace('Reading time: 17:00', 'Reading time: 18:00-19:00');
  let parsed = parseRawReading(snapshot(), destination);
  assert.equal(parsed.success, true, JSON.stringify(parsed.issues));
  source.utilities[1].value = '12.3';
  parsed = parseRawReading(snapshot(), destination);
  assert.equal(parsed.success, false);
  assert.match(parsed.issues.at(-1).message, /Manual totals period does not match/);
});
