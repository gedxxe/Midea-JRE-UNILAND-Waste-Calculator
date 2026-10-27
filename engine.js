import { comparisonMessage } from './meter-checks.js';
import { UTILITY_LAYOUT } from './utility-periods.js';
import { isWorkingHours, periodKind, workPeriodError, workPeriodTitle } from './reading-period.js';
import { createGasDraft, calculateGas, gasCalibration, gasUsageText } from './gas.js';
import { PLANT_SCHEMAS, UTILITIES } from './schema.js';
import { beforeMeterReporting, emptyMeterRow } from './meter-activation.js';
import { JRE_METER_LAYOUT, UNILAND_METER_LAYOUT } from './meter-layout.js';
import { calculateWater } from './water.js';
import { calculateAdditionalReadings } from './additional-readings.js';
import { currentRatioIssues } from './import-ratios.js';
import {
  decimalText,
  scaledReading,
  round,
  formatNumber,
  formatSignedNumber,
  dayDiff,
  shiftDate,
  formatReportPeriod,
} from './numbers.js';
import { buildWorksheet, worksheetPreview } from './worksheet.js';

export function createDraft(plantKey, startDate = '', endDate = '') {
  return {
    gas: createGasDraft(plantKey),
    meterLayout: plantKey === 'JRE' ? JRE_METER_LAYOUT : UNILAND_METER_LAYOUT,
    plantKey,
    startDate,
    endDate,
    rows: PLANT_SCHEMAS[plantKey].rows.map((row) => emptyMeterRow(row, startDate, endDate)),
    utilities: UTILITIES[plantKey].map(() => ({ value: '', note: '' })),
  };
}

export function createWorkingHoursDraft(
  plantKey,
  date = '',
  startTime = '08:00',
  endTime = '17:00',
) {
  return {
    ...createDraft(plantKey, date, date),
    periodKind: 'workingHours',
    utilityLayout: UTILITY_LAYOUT,
    startTime,
    endTime,
  };
}

export function createNightShiftDraft(plantKey, date = '', startTime = '17:00', endTime = '08:00') {
  return {
    ...createDraft(plantKey, date, date ? shiftDate(date, 1) : ''),
    periodKind: 'nightShift',
    utilityLayout: UTILITY_LAYOUT,
    startTime,
    endTime,
  };
}

export function formatRowValue(plantKey, row) {
  if (!row || row.missing || !Number.isFinite(row.totalEnergy)) return '-';
  if (plantKey === 'JRE') return row.totalEnergy === 0 ? '0' : row.totalEnergy.toFixed(2);
  return formatNumber(row.totalEnergy, 8);
}

function issue(
  issues,
  code,
  message,
  rowIndex = null,
  meterIndex = null,
  level = 'WARNING',
  target = null,
  comparison = null,
) {
  issues.push({
    code,
    message,
    rowIndex,
    meterIndex,
    level,
    ...(target ? { target } : {}),
    ...(comparison ? { comparison } : {}),
  });
}

export function calculateDraft(draft) {
  const schema = PLANT_SCHEMAS[draft.plantKey];
  if (!schema) throw new Error('Unknown factory.');
  const issues = currentRatioIssues(draft.plantKey, draft.importIssues);
  const days = dayDiff(draft.startDate, draft.endDate);
  const working = isWorkingHours(draft);
  if (!['daily', 'workingHours', 'nightShift'].includes(periodKind(draft)))
    issue(issues, 'DATE_KIND', 'Unknown reading mode.', null, null, 'ERROR');
  if (working) {
    const error = workPeriodError(draft);
    if (error) issue(issues, 'DATE_WORK', error, null, null, 'ERROR');
  } else if (days === null)
    issue(issues, 'DATE_INVALID', 'Enter valid start and end dates.', null, null, 'ERROR');
  else if (days <= 0)
    issue(issues, 'DATE_ORDER', 'End date must be after start date.', null, null, 'ERROR');
  else if (days !== 1)
    issue(
      issues,
      'DATE_GAP',
      `This reading covers ${days} days. Please confirm both reading dates for this combined period.`,
      null,
      null,
      'NOTICE',
    );

  const scaledEnergy = new Map();
  const scaledMeters = new Map();
  const calculatedRows = schema.rows.map((row, ri) => {
    const input = draft.rows[ri];
    const meters = [];
    let missing = false;
    let energyScaled = 0n;
    const beforeReporting = beforeMeterReporting(row, draft.startDate);
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
      if (beforeReporting) {
        if ([start, end].some((value) => value && value !== '-' && scaledReading(value) === null)) {
          missing = true;
          issue(
            issues,
            'INVALID_READING',
            label + ': use valid nonnegative readings.',
            ri,
            mi,
            'ERROR',
          );
        } else {
          meter.energy = 0;
          scaledMeters.set(row.name + ':' + mi, 0n);
        }
        return;
      }
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
      scaledMeters.set(`${row.name}:${mi}`, converted);
      energyScaled += converted;
      meter.energy = Number(converted) / 1e8;
      meter.diff = diff;
    });
    if (!missing) scaledEnergy.set(row.name, energyScaled);
    return {
      ...row,
      meters,
      missing,
      totalEnergy: missing ? null : Number(energyScaled) / 1e8,
    };
  });

  // Subtract included branch usage before rounding, reporting or adding sub-meter totals.
  calculatedRows.forEach((row, ri) => {
    if (!row.deductMeters) return;
    const mi = row.netMeter;
    const target = mi === undefined ? null : row.meters[mi];
    if (target) target.grossEnergy = target.energy;
    row.grossEnergy = row.totalEnergy;
    row.deductions = row.deductMeters.map(({ name, meter }) => {
      const value = scaledMeters.get(name + ':' + meter);
      return { name, meter, energy: value === undefined ? null : Number(value) / 1e8 };
    });
    const missingSources = row.deductMeters.filter(
      ({ name, meter }) => !scaledMeters.has(name + ':' + meter),
    );
    const included = missingSources.length
      ? undefined
      : row.deductMeters.reduce(
          (sum, { name, meter }) => sum + scaledMeters.get(name + ':' + meter),
          0n,
        );
    row.deductedEnergy = included === undefined ? null : Number(included) / 1e8;
    if (mi !== undefined && !target) return;
    if (target ? target.energy === null : row.missing) return;
    const comparison = {
      parent: {
        name: row.name,
        rowIndex: ri,
        meterIndex: mi ?? null,
        energy: target ? target.grossEnergy : row.grossEnergy,
        unit: row.unit,
      },
      children: row.deductions.map((d) => ({
        name: d.name,
        rowIndex: schema.rows.findIndex((r) => r.name === d.name),
        meterIndex: d.meter,
        energy: d.energy,
      })),
      total: row.deductedEnergy,
      excess: null,
    };
    if (included === undefined) {
      row.missing = true;
      row.totalEnergy = null;
      if (target) target.energy = null;
      issue(
        issues,
        'DEPENDENCY_UNAVAILABLE',
        comparisonMessage(comparison, true),
        ri,
        mi ?? null,
        'WARNING',
        null,
        comparison,
      );
      return;
    }
    let net =
      (target ? scaledMeters.get(`${row.name}:${mi}`) : scaledEnergy.get(row.name)) - included;
    if (net < 0n && row.floorNetAtZero && mi === undefined) net = 0n;
    if (net < 0n) {
      comparison.excess = Number(-net) / 1e8;
      row.missing = true;
      row.totalEnergy = null;
      if (target) target.energy = null;
      issue(
        issues,
        'NET_USAGE_NEGATIVE',
        comparisonMessage(comparison),
        ri,
        mi ?? null,
        'WARNING',
        null,
        comparison,
      );
      return;
    }
    if (target) target.energy = Number(net) / 1e8;
    if (!row.missing)
      row.totalEnergy = Number(target ? scaledEnergy.get(row.name) - included : net) / 1e8;
  });

  const gasResults = [];
  const waterResult = calculateWater(draft.water);
  const utilities = [];
  const calibration = gasCalibration(draft.plantKey);
  if (draft.gas && draft.gas.version !== calibration.version)
    issue(issues, 'GAS_VERSION', 'Unknown gas calibration version.', null, null, 'ERROR');
  UTILITIES[draft.plantKey].forEach(([name, unit], i) => {
    let { value = '', note = '' } = draft.utilities?.[i] || {};
    let stockIncrease = false;
    if (i === 4 && waterResult.active) {
      value = waterResult.value;
      if (waterResult.error) {
        const messages = {
          waterIncomplete: 'Water: enter both flow-meter readings.',
          waterInvalid: 'Water: use nonnegative decimal readings with up to six decimal places.',
          waterDecreased:
            'Water: the flow-meter reading decreased. Check readings or a meter reset.',
        };
        issue(
          issues,
          'WATER_READING',
          messages[waterResult.error],
          null,
          null,
          waterResult.error === 'waterDecreased' ? 'WARNING' : 'ERROR',
          { kind: 'water' },
        );
      } else if (value === '-')
        issue(
          issues,
          'WATER_UNAVAILABLE',
          'Water: a flow-meter reading is unavailable.',
          null,
          null,
          'WARNING',
          { kind: 'water' },
        );
    }
    const gasIndex = calibration.gases.findIndex((gas) => gas.utilityIndex === i);
    if (gasIndex >= 0 && draft.gas?.entries[gasIndex]?.enabled) {
      const gas = calibration.gases[gasIndex];
      const result = calculateGas(gas.id, draft.gas.entries[gasIndex], draft.plantKey);
      gasResults.push({ gas: gas.id, calibration: calibration.version, ...result });
      unit = 'Kg';
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
                'Converted stock decreased during refill. Check readings, temperatures, and refill order.',
            }[error.code],
          null,
          null,
          'ERROR',
          {
            kind: 'gas',
            gas: gas.id,
            point: error.point,
            field: error.code === 'gasTemperature' ? 'temperature' : 'reading',
          },
        );
      for (const warning of result.warnings)
        issue(
          issues,
          'GAS_STOCK_INCREASE',
          name +
            ': ' +
            warning.point +
            '. Converted stock increased outside a recorded refill. Check readings, temperatures and any missing refill; measurement conditions may affect the estimate.',
          null,
          null,
          'WARNING',
          { kind: 'gas', gas: gas.id, point: warning.point, field: 'reading' },
        );
      if (result.unavailable)
        issue(
          issues,
          'GAS_UNAVAILABLE',
          name + ': a tank reading is unavailable.',
          null,
          null,
          'WARNING',
          {
            kind: 'gas',
            gas: gas.id,
            point: Object.keys(result.points).find((key) => result.points[key].unavailable),
            field: 'reading',
          },
        );
      value = gasUsageText(result.kg);
      stockIncrease = value.startsWith('+');
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
          { kind: i === 4 ? 'water' : 'utility', index: i },
        );
      return;
    }
    const normalized = decimalText(value);
    if (value !== '-' && normalized === null) {
      issue(issues, 'UTILITY_INVALID', `${name}: invalid utility value.`, null, null, 'ERROR', {
        kind: i === 4 ? 'water' : 'utility',
        index: i,
      });
      return;
    }
    const cleanNote = String(note)
      .trim()
      .replace(/[\r\n\t]+/g, ' ');
    utilities.push(
      `${schema.utilityPrefix} ${name}: ${stockIncrease ? '+' : ''}${value === '-' ? '-' : formatNumber(Number(normalized))}${unit ? ` ${unit}` : ''}${stockIncrease ? ' (measured stock increase)' : ''}${cleanNote ? ` (${cleanNote})` : ''}`,
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
      ? round(subAreasSumKWh - totalDirectEnergy, 8)
      : null;
  const gapPercent =
    gapKWh !== null && totalDirectEnergy !== 0 ? (gapKWh / totalDirectEnergy) * 100 : null;
  // Both reports use the historian date, confirmed by the operator.
  const reportDate = draft.startDate;
  const duration = days === 1 ? '24 HOURS' : days > 0 ? `${days} DAYS` : 'PERIOD UNKNOWN';
  const lines = [
    `${schema.reportPrefix}) ${schema.name} (${working ? workPeriodTitle(draft) : formatReportPeriod(draft.startDate, draft.endDate) + ' - ' + duration})`,
  ];
  for (const row of calculatedRows) {
    lines.push(
      `${row.no}. ${row.displayName || row.name}: ${formatRowValue(draft.plantKey, row)}${row.missing ? '' : ` ${row.unit}`}`,
    );
  }
  lines.push(...utilities);
  const additionalReadings =
    draft.plantKey === 'JRE' ? calculateAdditionalReadings(draft.additionalReadings) : [];
  const additionalNotes = [];
  for (const result of additionalReadings) {
    if (!result.active) continue;
    if (result.error) {
      const messages = {
        additionalIncomplete: 'enter both start and end readings.',
        additionalInvalid: 'use nonnegative decimal readings with up to six decimal places.',
        additionalUnavailable: 'a reading is unavailable.',
        additionalDecreased: 'the reading decreased. Check readings or a meter reset.',
      };
      issue(
        issues,
        'ADDITIONAL_READING',
        `${result.name}: ${messages[result.error]}`,
        null,
        null,
        ['additionalIncomplete', 'additionalInvalid'].includes(result.error) ? 'ERROR' : 'WARNING',
      );
    }
    additionalNotes.push(`${result.name} consumption: ${result.value || '-'} kWh`);
  }
  if (additionalNotes.length) lines.push('', 'Additional readings:', ...additionalNotes);
  const mainText = lines.join('\n');
  const warnings = issues.filter((item) => item.level !== 'NOTICE');
  const checks = warnings.length
    ? `CHECK RAW DATA:\n${warnings.map((item) => `- ${item.message}`).join('\n')}`
    : '';
  const crossCheckText =
    draft.plantKey === 'JRE'
      ? [
          'CROSS-CHECK:',
          `Sub-meter 2-${schema.rows.length}: ${subAreasSumKWh === null ? 'incomplete' : `${subAreasSumKWh.toFixed(2)} kWh`}`,
          `Main Total: ${totalDirectEnergy === null ? '-' : `${totalDirectEnergy.toFixed(2)} kWh`}`,
          `Gap: ${gapKWh === null ? '-' : `${formatSignedNumber(gapKWh)} kWh`}`,
          `Gap: ${gapPercent === null ? '-' : `${formatSignedNumber(gapPercent)}%`}`,
        ].join('\n')
      : '';
  const worksheet = buildWorksheet(draft.plantKey, reportDate, calculatedRows);
  return {
    plantKey: draft.plantKey,
    reportDate,
    ...(working
      ? { periodKind: periodKind(draft), startTime: draft.startTime, endTime: draft.endTime }
      : {}),
    startDate: draft.startDate,
    endDate: draft.endDate,
    success: !issues.some((item) => item.level === 'ERROR'),
    issues,
    calculatedRows,
    gasResults,
    waterResult,
    additionalReadings,
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
  if (
    periodKind(jre) !== periodKind(uniland) ||
    (isWorkingHours(jre) &&
      (jre.startTime !== uniland.startTime || jre.endTime !== uniland.endTime)) ||
    jre.startDate !== uniland.startDate ||
    jre.endDate !== uniland.endDate
  ) {
    throw new Error('JRE and UNILAND reading periods must match.');
  }
  const checkLines = [jre, uniland].flatMap((report) =>
    report.issues
      .filter((item) => item.level !== 'NOTICE')
      .map((item) => '- ' + report.plantKey + ': ' + item.message),
  );
  const sections = [jre.mainText, uniland.mainText, jre.crossCheckText];
  if (checkLines.length) sections.push('CHECK RAW DATA:\n' + checkLines.join('\n'));
  return (
    '[INDONESIA FACTORY ENERGY REPORT]\n\nSummary situation:\n' +
    sections.filter(Boolean).join('\n\n')
  );
}
