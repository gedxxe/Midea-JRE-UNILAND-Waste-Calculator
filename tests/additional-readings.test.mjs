import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyAdditionalReadings, calculateAdditionalReadings } from '../additional-readings.js';
import { createDraft, calculateDraft, generateFullIndonesiaReport } from '../engine.js';
import { exampleDraft } from '../examples.js';
import { restoreDrafts, nextDayDraft, changeDraftPeriod } from '../storage.js';
import { reportSnapshot } from '../server/report-data.js';
import { exportRawReading, formatBlankReadingTemplate } from '../raw-export.js';
import { graphValues } from '../graph-data.js';

test('UNILAND T1–T4 add precise unnumbered notes without changing meters, raw export, worksheet or graphs', () => {
  const d = exampleDraft('UNILAND'),
    before = calculateDraft(d),
    raw = exportRawReading(d).text;
  const previous = reportSnapshot(d);
  d.additionalReadings = [
    { start: '999999999.123456', end: '999999999.123457' },
    { start: '123,25', end: '126.75' },
    { start: '0', end: '0' },
    { start: '100', end: '115' },
  ];
  const result = calculateDraft(d),
    snapshot = reportSnapshot(d);
  assert.equal(result.success, true);
  assert.match(
    result.mainText,
    /Additional readings:\nT1 consumption: 0.000001 kWh\nT2 consumption: 3.5 kWh\nT3 consumption: 0 kWh\nT4 consumption: 15 kWh$/,
  );
  for (const key of [
    'calculatedRows',
    'totalDirectEnergy',
    'subAreasSumKWh',
    'gapKWh',
    'gapPercent',
    'worksheetText',
  ])
    assert.deepEqual(result[key], before[key]);
  assert.deepEqual(graphValues(snapshot, 'UNILAND'), graphValues(previous, 'UNILAND'));
  assert.equal(exportRawReading(d).text, raw);
  assert.doesNotMatch(formatBlankReadingTemplate('UNILAND'), /T[1-4]/);
  assert.deepEqual(snapshot.draft.additionalReadings, d.additionalReadings);
  assert.equal(snapshot.output.additionalReadings[1].value, '3.5');
  assert.match(
    generateFullIndonesiaReport(calculateDraft(exampleDraft('JRE')), result),
    /T4 consumption: 15 kWh/,
  );
  const jre = exampleDraft('JRE');
  jre.additionalReadings = d.additionalReadings;
  assert.doesNotMatch(calculateDraft(jre).mainText, /T[1-4] consumption/);
  assert.doesNotMatch(previous.output.reportText, /Additional readings/);
  d.endDate = '2026-09-19';
  const combinedPeriod = calculateDraft(d);
  assert.match(combinedPeriod.mainText, /3 DAYS/);
  assert.match(combinedPeriod.mainText, /T4 consumption: 15 kWh/);
});

test('empty optional pairs are omitted; partial and invalid pairs cannot become completed reports', () => {
  const d = exampleDraft('UNILAND');
  d.additionalReadings = emptyAdditionalReadings();
  assert.equal(calculateDraft(d).success, true);
  assert.doesNotMatch(calculateDraft(d).mainText, /Additional readings/);
  for (const end of ['', '1e3', '-1', '1,000.25', '1000000000001', '1.1234567']) {
    d.additionalReadings[0] = { start: '100', end };
    assert.equal(calculateDraft(d).success, false);
    assert.throws(() => reportSnapshot(d), /INCOMPLETE_REPORT/);
  }
  for (const end of ['-', '99']) {
    d.additionalReadings[0] = { start: '100', end };
    const result = calculateDraft(d);
    assert.equal(result.success, true);
    assert.match(result.mainText, /T1 consumption: - kWh/);
    assert.match(result.checks, /T1:/);
  }
  assert.equal(calculateAdditionalReadings()[0].active, false);
});

test('additional pairs survive partial draft restore and date movement without inventing observations', () => {
  const d = exampleDraft('UNILAND');
  const restore = (input) =>
    restoreDrafts(
      JSON.stringify({ version: 4, drafts: { JRE: createDraft('JRE'), UNILAND: input } }),
    ).UNILAND;
  assert.equal(restore(d).additionalReadings, undefined);
  d.additionalReadings = emptyAdditionalReadings();
  d.additionalReadings[0] = { start: '100,00', end: '120.50' };
  const next = nextDayDraft(d);
  assert.deepEqual(next.additionalReadings[0], { start: '120.50', end: '' });
  assert.deepEqual(
    changeDraftPeriod(d, d.endDate, next.endDate).additionalReadings,
    next.additionalReadings,
  );
  const interim = changeDraftPeriod(d, d.endDate, d.endDate);
  assert.deepEqual(
    changeDraftPeriod(interim, d.endDate, next.endDate, d).additionalReadings,
    next.additionalReadings,
  );
  assert.deepEqual(restore(next).additionalReadings, next.additionalReadings);
  assert.throws(() => nextDayDraft(restore(next)), /end readings/);
  d.additionalReadings[0].end = '';
  assert.throws(() => nextDayDraft(d), /T1/);
  assert.deepEqual(restore(d).additionalReadings, d.additionalReadings);
  d.additionalReadings[0].start = 123;
  assert.throws(() => restore(d), /additional readings/);
  d.additionalReadings = [];
  assert.throws(() => restore(d), /additional readings/);
});
