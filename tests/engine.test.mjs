import test from 'node:test';
import assert from 'node:assert/strict';
import '../engine.js';
const {
  SAMPLE_DATASETS,
  calculatePlantReport,
  extractDateFromText,
  generateFullIndonesiaReport,
  parseFlexibleNumber,
  runEngineSelfTests,
  worksheetRowToTSV
} = globalThis.EnergyEngine;

test('reference datasets match the validated JRE and UNILAND results', () => {
  const result = runEngineSelfTests();
  assert.equal(result.pass, true, JSON.stringify(result.results.filter(r => !r.pass), null, 2));
});

test('Indonesian decimal comma and international separators are parsed safely', () => {
  assert.equal(parseFlexibleNumber('131,11'), 131.11);
  assert.equal(parseFlexibleNumber('128128,0'), 128128);
  assert.equal(parseFlexibleNumber('087560,60'), 87560.6);
  assert.equal(parseFlexibleNumber('1,234,567.89'), 1234567.89);
  assert.equal(parseFlexibleNumber('1.234.567,89'), 1234567.89);
});

test('date parser uses the meter date even when chat metadata is present', () => {
  const pasted = `Engineer\n2026/09/16 16:18\n12/09/2026\n1. Total: 101 ((Ratio 3200)/1000)`;
  assert.equal(extractDateFromText(pasted), '2026-09-12');
});

test('UNILAND missing readings remain missing instead of becoming zero', () => {
  const report = calculatePlantReport(
    SAMPLE_DATASETS.UNILAND.yesterday,
    SAMPLE_DATASETS.UNILAND.today,
    SAMPLE_DATASETS.UNILAND.utilities,
    'UNILAND',
    SAMPLE_DATASETS.UNILAND.date
  );
  assert.match(report.reportSectionText, /2\. Trafo 1 : - MWh/);
  assert.match(report.reportSectionText, /23\. IQC- Testing Room B: - kWh/);
});

test('JRE report keeps two decimals and utility dash prefix', () => {
  const report = calculatePlantReport(
    SAMPLE_DATASETS.JRE.yesterday,
    SAMPLE_DATASETS.JRE.today,
    SAMPLE_DATASETS.JRE.utilities,
    'JRE',
    SAMPLE_DATASETS.JRE.date
  );
  assert.match(report.reportSectionText, /1\. Total: 1000\.00 kWh/);
  assert.match(report.reportSectionText, /2\. Indoor: 70\.00 kWh/);
  assert.match(report.reportSectionText, /12\. Air Compressor 1#: 0 kWh/);
  assert.match(report.reportSectionText, /- LPG: 100 Kg/);
});

test('UNILAND ratios and final header use the agreed report format', () => {
  const report = calculatePlantReport(
    SAMPLE_DATASETS.UNILAND.yesterday,
    SAMPLE_DATASETS.UNILAND.today,
    SAMPLE_DATASETS.UNILAND.utilities,
    'UNILAND',
    SAMPLE_DATASETS.UNILAND.date
  );
  assert.match(report.reportSectionText, /^B\) UNILAND \(SEPTEMBER 12, 2026 - 24 Hours\)/);
  assert.match(report.reportSectionText, /1\. Total: 3\.2 MWh/);
  assert.match(report.reportSectionText, /5\. Building A : 0\.32 MWh/);
  assert.match(report.reportSectionText, /18\.  Compressor 2#: 50 kWh/);
  assert.match(report.reportSectionText, /21\. OQC- Testing Room B:1.5 kWh/);
  assert.match(report.reportSectionText, /25\. Refrigant and LPG area  : 20 KWh/);
  assert.match(report.reportSectionText, /\* LPG: 10 Nm3/);
});

test('worksheet rows reproduce the agreed derived fields', () => {
  const jre = calculatePlantReport(SAMPLE_DATASETS.JRE.yesterday, SAMPLE_DATASETS.JRE.today, '', 'JRE', SAMPLE_DATASETS.JRE.date);
  const uni = calculatePlantReport(SAMPLE_DATASETS.UNILAND.yesterday, SAMPLE_DATASETS.UNILAND.today, '', 'UNILAND', SAMPLE_DATASETS.UNILAND.date);
  assert.equal(jre.worksheet.derived.pipingAll, 15);
  assert.equal(uni.worksheet.derived.indoorArea, 25);
  assert.equal(uni.worksheet.derived.outdoorArea, 43);
  assert.ok(worksheetRowToTSV(jre.worksheet).startsWith('16\t70\t120'));
  assert.ok(worksheetRowToTSV(uni.worksheet).startsWith('12\t25\t43'));
});

test('suspicious meter jumps are not silently corrected', () => {
  const todayWithTypo = SAMPLE_DATASETS.JRE.today.replace('30,5 (Ratio 40)', '785,26 (Ratio 40)');
  const report = calculatePlantReport(SAMPLE_DATASETS.JRE.yesterday, todayWithTypo, '', 'JRE', SAMPLE_DATASETS.JRE.date);
  assert.ok(report.issues.some(issue => issue.code === 'SUSPICIOUS_JUMP' && issue.message.includes('Outdoor')));
  assert.match(report.reportSectionText, /CHECK RAW DATA:/);
});

test('full report keeps one blank line between JRE and UNILAND sections', () => {
  const jre = calculatePlantReport(SAMPLE_DATASETS.JRE.yesterday, SAMPLE_DATASETS.JRE.today, '', 'JRE', SAMPLE_DATASETS.JRE.date);
  const uni = calculatePlantReport(SAMPLE_DATASETS.UNILAND.yesterday, SAMPLE_DATASETS.UNILAND.today, '', 'UNILAND', SAMPLE_DATASETS.UNILAND.date);
  const full = generateFullIndonesiaReport(jre, uni);
  assert.match(full, /^\[INDONESIA FACTORY ENERGY REPORT\]\n\nSummary situation:\nA\) JRE/);
  assert.match(full, /Heater LPG: 12\.00 kWh\n\nB\) UNILAND/);
});

test('invalid calendar dates are not accepted as report dates', () => {
  assert.equal(extractDateFromText('31/02/2026\n1. Total: 100'), null);
});

test('omitted template rows are flagged instead of silently becoming unavailable', () => {
  const report = calculatePlantReport(
    '15/09/2026\n1. Total: 1000',
    '16/09/2026\n1. Total: 1010',
    '',
    'JRE',
    '2026-09-16'
  );
  assert.equal(report.success, true);
  assert.ok(report.issues.some(issue => issue.code === 'MISSING_BOTH' && issue.message.includes('Indoor')));
  assert.match(report.reportSectionText, /CHECK RAW DATA:/);
});

test('utility lines are deduplicated by utility name and emitted in baseline order', () => {
  const utilities = `- Water: 50 m³\n- LPG: 100 Kg\n- Nitrogen: 300 Kg\n- Oxygen: 200 Kg\n- Refrigerant R32: 400 Kg\n- LPG: 999 Kg`;
  const report = calculatePlantReport(
    SAMPLE_DATASETS.JRE.yesterday,
    SAMPLE_DATASETS.JRE.today,
    utilities,
    'JRE',
    SAMPLE_DATASETS.JRE.date
  );
  assert.deepEqual(report.utilities, [
    '- LPG: 100 Kg',
    '- Oxygen: 200 Kg',
    '- Nitrogen: 300 Kg',
    '- Refrigerant R32: 400 Kg',
    '- Water: 50 m³'
  ]);
});

test('JRE inactive compressor dash paired with a zero baseline remains 0 kWh', () => {
  const today = SAMPLE_DATASETS.JRE.today
    .replace('12. Air Compressor 1#: 0', '12. Air Compressor 1#: -')
    .replace('14. New Air Compressor 2#: 0', '14. New Air Compressor 2#: -');
  const report = calculatePlantReport(
    SAMPLE_DATASETS.JRE.yesterday,
    today,
    '',
    'JRE',
    SAMPLE_DATASETS.JRE.date
  );
  assert.match(report.reportSectionText, /12\. Air Compressor 1#: 0 kWh/);
  assert.match(report.reportSectionText, /14\. New Air Compressor 2#: 0 kWh/);
  assert.equal(report.issues.some(issue => issue.code === 'MISSING_DAY' && issue.message.includes('Air Compressor 1#')), false);
});
