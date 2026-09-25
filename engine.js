import { createGasDraft, calculateGas, GASES, GAS_TABLE_VERSION, gasMassText } from './gas.js';
import { PLANT_SCHEMAS, UTILITIES } from './schema.js';
import {
  decimalText,
  scaledReading,
  round,
  formatNumber,
  dayDiff,
  formatReportDate,
} from './numbers.js';
import { buildWorksheet, worksheetPreview } from './worksheet.js';

export function createDraft(plantKey, startDate = '', endDate = '') {
  return {
    ...(plantKey === 'JRE' ? { gas: createGasDraft() } : {}),
    plantKey,
    startDate,
    endDate,
    rows: PLANT_SCHEMAS[plantKey].rows.map((row) => ({
      start: row.factors.map(() => ''),
      end: row.factors.map(() => ''),
      inactive: false,
    })),
    utilities: UTILITIES[plantKey].map(() => ({ value: '', note: '' })),
  };
}

export function formatRowValue(plantKey, row) {
  if (!row || row.missing || !Number.isFinite(row.totalEnergy)) return '-';
  if (plantKey === 'JRE') return row.totalEnergy === 0 ? '0' : row.totalEnergy.toFixed(2);
  return formatNumber(row.totalEnergy, 8);
}

function issue(issues, code, message, rowIndex = null, meterIndex = null, level = 'WARNING') {
  issues.push({ code, message, rowIndex, meterIndex, level });
}

export function calculateDraft(draft) {
  const schema = PLANT_SCHEMAS[draft.plantKey];
  if (!schema) throw new Error('Unknown factory.');
  const issues = [...(draft.importIssues || [])];
  const days = dayDiff(draft.startDate, draft.endDate);
  if (days === null)
    issue(issues, 'DATE_INVALID', 'Enter valid start and end dates.', null, null, 'ERROR');
  else if (days <= 0)
    issue(issues, 'DATE_ORDER', 'End date must be after start date.', null, null, 'ERROR');
  else if (days !== 1)
    issue(
      issues,
      'DATE_GAP',
      `Period is ${days} days (${draft.startDate} to ${draft.endDate}), not 24 hours.`,
    );

  const calculatedRows = schema.rows.map((row, ri) => {
    const input = draft.rows[ri];
    const meters = [];
    let missing = false;
    let energyScaled = 0n;
    if (
      !input ||
      input.start?.length !== row.factors.length ||
      input.end?.length !== row.factors.length
    ) {
      issue(
        issues,
        'METER_COUNT',
        `${row.name}: both readings must contain ${row.factors.length} meters.`,
        ri,
        null,
        'ERROR',
      );
      return { ...row, missing: true, totalEnergy: null, meters };
    }
    row.factors.forEach((factor, mi) => {
      const start = String(input.start[mi]).trim();
      const end = String(input.end[mi]).trim();
      const label = `${row.name}, meter ${mi + 1}`;
      const meter = { index: mi + 1, start, end, factor, energy: null };
      meters.push(meter);
      if (!start || !end) {
        missing = true;
        issue(
          issues,
          'EMPTY_READING',
          `${label}: ${!start && !end ? 'start and end readings are' : !start ? 'start reading is' : 'end reading is'} empty.`,
          ri,
          mi,
          'ERROR',
        );
        return;
      }
      // Only the two JRE exceptions may use an operator-confirmed inactive state.
      if (
        row.allowInactive &&
        input.inactive &&
        (start === '-' || end === '-') &&
        [start, end].every((v) => v === '-' || decimalText(v) !== null)
      ) {
        meter.energy = 0;
        return;
      }
      if (start === '-' || end === '-') {
        missing = true;
        issue(issues, 'UNAVAILABLE', `${label}: data unavailable (${start} to ${end}).`, ri, mi);
        return;
      }
      const a = scaledReading(start);
      const b = scaledReading(end);
      if (a === null || b === null) {
        missing = true;
        issue(
          issues,
          'INVALID_READING',
          `${label}: use nonnegative numbers without thousands separators, up to 6 decimals and a maximum of 1000000000000.`,
          ri,
          mi,
          'ERROR',
        );
        return;
      }
      const delta = b - a;
      if (delta < 0n) {
        missing = true;
        issue(
          issues,
          'READING_DECREASE',
          `${label}: reading decreased from ${start} to ${end}. Check the numbers, meter reset, or rollover.`,
          ri,
          mi,
        );
        return;
      }
      const diff = Number(delta) / 1e6;
      if (diff > Math.max(100, (Number(a) / 1e6) * 0.5)) {
        issue(
          issues,
          'SUSPICIOUS_JUMP',
          `${label}: reading changed from ${start} to ${end}. Increase exceeds 100 and 50% of the start reading; check raw data.`,
          ri,
          mi,
        );
      }
      // Configured factors have at most 2 decimals; accumulate at 1e-8 precision.
      const converted = delta * BigInt(Math.round(factor * 100));
      energyScaled += converted;
      meter.energy = Number(converted) / 1e8;
      meter.diff = diff;
    });
    return { ...row, meters, missing, totalEnergy: missing ? null : Number(energyScaled) / 1e8 };
  });

  const gasResults = [];
  const utilities = [];
  if (draft.plantKey === 'JRE' && draft.gas && draft.gas.version !== GAS_TABLE_VERSION)
    issue(issues, 'GAS_VERSION', 'Unknown gas calibration version.', null, null, 'ERROR');
  UTILITIES[draft.plantKey].forEach(([name, unit], i) => {
    let { value = '', note = '' } = draft.utilities?.[i] || {};
    if (draft.plantKey === 'JRE' && i < GASES.length && draft.gas?.entries[i]?.enabled) {
      const result = calculateGas(GASES[i].id, draft.gas.entries[i]);
      gasResults.push({ gas: GASES[i].id, calibration: GAS_TABLE_VERSION, ...result });
      for (const error of result.errors)
        issue(
          issues,
          'GAS_INVALID',
          name +
            ': ' +
            error.point +
            '. ' +
            {
              gasEmpty: 'Enter the raw gas reading.',
              gasNumber: 'Use a decimal reading without unit suffixes.',
              gasRange: 'Reading is outside the reference table range.',
              gasTemperature: 'Enter R32 temperature from -20 to 50 C.',
              gasSequence:
                'Tank mass increased without a matching refill, or refill mass decreased. Check readings, temperatures, and refill order.',
            }[error.code],
          null,
          null,
          'ERROR',
        );
      if (result.unavailable)
        issue(issues, 'GAS_UNAVAILABLE', name + ': a tank reading is unavailable.');
      value = gasMassText(result.kg);
    }
    if (!String(value).trim()) {
      if (String(note).trim())
        issue(
          issues,
          'UTILITY_VALUE',
          `${name}: a note was entered without a value.`,
          null,
          null,
          'ERROR',
        );
      return;
    }
    const normalized = decimalText(value);
    if (value !== '-' && normalized === null) {
      issue(issues, 'UTILITY_INVALID', `${name}: invalid utility value.`, null, null, 'ERROR');
      return;
    }
    const cleanNote = String(note)
      .trim()
      .replace(/[\r\n\t]+/g, ' ');
    utilities.push(
      `${schema.utilityPrefix} ${name}: ${value === '-' ? '-' : formatNumber(Number(normalized))}${unit ? ` ${unit}` : ''}${cleanNote ? ` (${cleanNote})` : ''}`,
    );
  });

  const totalDirectEnergy = calculatedRows[0].totalEnergy;
  const subRows = calculatedRows.slice(1);
  const completeSubmeters = subRows.every((row) => !row.missing);
  const subAreasSumKWh =
    draft.plantKey === 'JRE' && completeSubmeters
      ? round(
          subRows.reduce((sum, row) => sum + row.totalEnergy, 0),
          8,
        )
      : null;
  const gapKWh =
    subAreasSumKWh !== null && totalDirectEnergy !== null
      ? round(totalDirectEnergy - subAreasSumKWh, 8)
      : null;
  const gapPercent =
    gapKWh !== null && totalDirectEnergy !== 0 ? (gapKWh / totalDirectEnergy) * 100 : null;
  // Both reports use the historian date, confirmed by the operator.
  const reportDate = draft.startDate;
  const duration = days === 1 ? '24 HOURS' : days > 0 ? `${days * 24} HOURS` : 'PERIOD UNKNOWN';
  const lines = [
    `${schema.reportPrefix}) ${schema.name} (${formatReportDate(reportDate)} - ${duration})`,
  ];
  for (const row of calculatedRows) {
    lines.push(
      `${row.no}. ${row.displayName || row.name}: ${formatRowValue(draft.plantKey, row)}${row.missing ? '' : ` ${row.unit}`}`,
    );
  }
  lines.push(...utilities);
  const mainText = lines.join('\n');
  const checks = issues.length
    ? `CHECK RAW DATA:\n${issues.map((item) => `- ${item.message}`).join('\n')}`
    : '';
  const crossCheckText =
    draft.plantKey === 'JRE'
      ? [
          'CROSS-CHECK:',
          `Sub-meter 2-29: ${subAreasSumKWh === null ? 'incomplete' : `${subAreasSumKWh.toFixed(2)} kWh`}`,
          `Main Total: ${totalDirectEnergy === null ? '-' : `${totalDirectEnergy.toFixed(2)} kWh`}`,
          `Gap: ${gapKWh === null ? '-' : `${gapKWh.toFixed(2)} kWh`}`,
          `Gap: ${gapPercent === null ? '-' : `${gapPercent.toFixed(2)}%`}`,
        ].join('\n')
      : '';
  const worksheet = buildWorksheet(draft.plantKey, reportDate, calculatedRows);
  return {
    plantKey: draft.plantKey,
    reportDate,
    startDate: draft.startDate,
    endDate: draft.endDate,
    success: !issues.some((item) => item.level === 'ERROR'),
    issues,
    calculatedRows,
    gasResults,
    mainText,
    reportSectionText: [mainText, crossCheckText, checks].filter(Boolean).join('\n\n'),
    checks,
    crossCheckText,
    worksheet,
    worksheetText: `${draft.plantKey} ELECTRICAL WORKSHEET:\n${worksheetPreview(worksheet)}`,
    totalDirectEnergy,
    totalDirectUnit: schema.rows[0].unit,
    subAreasSumKWh,
    gapKWh,
    gapPercent,
    completeRows: calculatedRows.filter((row) => !row.missing).length,
  };
}

export function generateFullIndonesiaReport(jre, uniland) {
  if (!jre?.success || !uniland?.success)
    throw new Error('Complete the readings and dates for both factories first.');
  if (jre.startDate !== uniland.startDate || jre.endDate !== uniland.endDate) {
    throw new Error('JRE and UNILAND reading periods must match.');
  }
  const checkLines = [jre, uniland].flatMap((report) =>
    report.issues.map((item) => '- ' + report.plantKey + ': ' + item.message),
  );
  const sections = [jre.mainText, uniland.mainText, jre.crossCheckText];
  if (checkLines.length) sections.push('CHECK RAW DATA:\n' + checkLines.join('\n'));
  return (
    '[INDONESIA FACTORY ENERGY REPORT]\n\nSummary situation:\n' +
    sections.filter(Boolean).join('\n\n')
  );
}
