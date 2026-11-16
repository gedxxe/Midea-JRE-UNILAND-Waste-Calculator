import { validTime } from './reading-period.js';
import { PLANT_SCHEMAS } from './schema.js';
import { beforeMeterReporting } from './meter-activation.js';
import { normalizeName, decimalText, validDate } from './numbers.js';
import {
  LEGACY_JRE_FACTORS,
  JRE_LAYOUT2_FACTORS,
  JRE_LAYOUT3_FACTORS,
  moveLegacyValues,
  moveLegacyIssues,
} from './meter-layout.js';

// Tolerate presentation differences without changing numeric reading strings.
export const importLine = (value) =>
  String(value)
    .replace(/\\([.()])/g, '$1')
    .replace(/\\\s*$/, '')
    .trim()
    .replace(/[：＋（）]/g, (c) => ({ '：': ':', '＋': '+', '（': '(', '）': ')' })[c]);
export function importTime(value) {
  const m = String(value)
    .trim()
    .match(
      /^(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*(?:[-–—]|to|s\/d|sampai)\s*(\d{1,2})\s*[:.]\s*(\d{2}))?\s*(?:WIB)?$/i,
    );
  if (!m) return null;
  const time = m[1].padStart(2, '0') + ':' + m[2];
  const end = m[3] ? m[3].padStart(2, '0') + ':' + m[4] : undefined;
  return validTime(time) && (!end || validTime(end))
    ? { time, ...(end ? { timeRange: { start: time, end } } : {}) }
    : null;
}
export function importDate(value) {
  const date = '(?:\\d{1,2}\\s*/\\s*\\d{1,2}\\s*/\\s*20\\d{2}|20\\d{2}-\\d{2}-\\d{2})';
  const m = String(value)
    .trim()
    .match(
      new RegExp(
        '^(' +
          date +
          ')(?:\\s*(?:[-–—]|to|s/d|sampai)\\s*(' +
          date +
          '))?(?:\\s*\\(\\s*(?:Pagi|Sore|Morning|Afternoon|Evening|day shift|night shift|Sore\\s*/\\s*night shift)\\s*\\)|\\s+(?:day shift|night shift))?\\s*:?$',
        'i',
      ),
    );
  if (!m) return null;
  const iso = (v) =>
    v.includes('/')
      ? v
          .split('/')
          .map((x) => x.trim())
          .reverse()
          .map((x, i) => (i ? x.padStart(2, '0') : x))
          .join('-')
      : v;
  const start = iso(m[1]),
    end = m[2] ? iso(m[2]) : undefined;
  return {
    date: start,
    valid: validDate(start) && (!end || validDate(end)),
    ...(end ? { dateRange: { start, end } } : {}),
  };
}
const importKey = (name) => normalizeName(name).replace(/\s/g, '');

export function parseReading(text, plantKey) {
  const schema = PLANT_SCHEMAS[plantKey];
  if (!schema?.rows) throw new RangeError('Unknown factory');
  if (String(text).length > 131072)
    return {
      success: false,
      values: [],
      issues: [
        {
          level: 'ERROR',
          code: 'IMPORT_SIZE',
          message: 'Text is too long. Paste one reading column only.',
        },
      ],
    };
  const lookup = new Map();
  schema.rows.forEach((row, i) =>
    [row.name, ...(row.aliases || [])].forEach((name) => lookup.set(importKey(name), i)),
  );
  let values = schema.rows.map((row) => row.factors.map(() => ''));
  const issues = [];
  const seen = new Set();
  const dates = [];
  const times = [];
  let timeRange, dateRange;
  let active = null;
  const entries = [];
  let labOccurrence = 0;
  let flowReading,
    flowSupplied = false,
    flowSeen = false;
  for (const [lineIndex, raw] of String(text)
    .split(/\r\n?|\n/)
    .entries()) {
    const line = importLine(raw);
    const sourceLine = lineIndex + 1;
    if (!line) continue;
    if (/^(?:flow\s*meter\s*)?air\s*compressor(?:\s*flow)?\s*:/i.test(line)) {
      const match = line.match(/:\s*(.*?)\s*Nm(?:³|3|\^3)\s*$/i);
      const rawValue = match?.[1]?.trim();
      if (
        plantKey !== 'JRE' ||
        flowSeen ||
        !match ||
        (rawValue !== '____' && rawValue !== '-' && decimalText(rawValue) === null)
      )
        issues.push({
          level: 'ERROR',
          code: 'IMPORT_FLOW',
          sourceLine,
          message: `Line ${sourceLine}: Air Compressor flow must appear once, in Nm³. Use a nonnegative number, ____ for blank, or - for unavailable.`,
        });
      else {
        flowReading = rawValue === '____' ? '' : rawValue;
        flowSupplied = rawValue !== '____';
      }
      flowSeen = true;
      active = null;
      continue;
    }
    if (/^(JRE|UNILAND)$/i.test(line)) {
      if (line.toUpperCase() !== plantKey)
        return {
          values,
          suppliedMeters: schema.rows.map((row) => row.factors.map(() => false)),
          suppliedRows: [],
          omittedRows: schema.rows.map((_, i) => i),
          valueCount: 0,
          emptyCount: schema.rows.reduce((n, row) => n + row.factors.length, 0),
          issues: [
            {
              level: 'ERROR',
              code: 'IMPORT_FACTORY',
              sourceLine,
              factory: line.toUpperCase(),
              message:
                'These readings are for ' + line.toUpperCase() + '. Select that factory first.',
            },
          ],
          success: false,
        };
      active = null;
      continue;
    }
    if (/^DD\/MM\/YYYY$/i.test(line)) {
      dates.push('');
      active = null;
      continue;
    }
    if (/^Reading\s*time\s*:\s*HH\s*:\s*MM\s*(?:WIB)?$/i.test(line)) {
      active = null;
      continue;
    }
    if (/^Reading\s*time\s*:/i.test(line)) {
      const parsed = importTime(line.slice(line.indexOf(':') + 1));
      times.push(parsed?.time);
      timeRange = parsed?.timeRange;
      if (!parsed)
        issues.push({
          level: 'ERROR',
          code: 'IMPORT_TIME',
          sourceLine,
          message:
            'Use a valid time or time range, for example 07:00-08:00 WIB. The range start is used.',
        });
      else if (parsed.timeRange)
        issues.push({
          level: 'NOTICE',
          code: 'IMPORT_TIME_RANGE',
          time: parsed.time,
          message: 'Time range uses ' + parsed.time + ' WIB.',
        });
      active = null;
      continue;
    }
    const dateMatch = importDate(line);
    if (dateMatch) {
      dates.push(dateMatch.valid ? dateMatch.date : '');
      dateRange = dateMatch.dateRange;
      if (dateRange)
        issues.push({
          level: 'NOTICE',
          code: 'IMPORT_DATE_RANGE',
          date: dateMatch.date,
          message: 'Date range uses ' + dateMatch.date + '.',
        });
      active = null;
      continue;
    }
    const match = line.match(/^(?:\d+[.)]\s*)?([^:]+):\s*(.*)$/);
    let ri = match ? lookup.get(importKey(match[1])) : undefined;
    if (
      plantKey === 'UNILAND' &&
      match &&
      importKey(match[1]) === importKey('10HP Enthalpy Difference Lab')
    ) {
      labOccurrence++;
      if (labOccurrence === 2) ri = lookup.get(importKey('10HP Enthalpy Difference Lab (2)'));
    }
    if (ri !== undefined) {
      active = { ri, expr: match[2], sourceLine };
      entries.push(active);
    } else if (active && /^[\d_+.,()\s\-/]+(?:.*)?$/.test(line) && !line.includes(':')) {
      active.expr += ` ${line}`;
    } else if (seen.size || entries.length) {
      issues.push({
        level: 'ERROR',
        code: 'IMPORT_SYNTAX',
        sourceLine,
        message: `Unrecognized line: ${line}`,
      });
      active = null;
    }
    // Chat names and timestamps before the actual readings are ignored.
  }
  if (dates.length !== 1 || !validDate(dates[0]))
    issues.push({
      level: 'ERROR',
      code: 'IMPORT_DATE',
      message: 'Paste one reading with one valid date line, for example 16/09/2026.',
    });
  if (times.length > 1)
    issues.push({ level: 'ERROR', code: 'IMPORT_TIME', message: 'Paste only one reading time.' });
  const olderJre =
    plantKey === 'JRE' &&
    !entries.some((entry) => entry.ri >= 29) &&
    entries.filter((entry) => entry.ri === 4).length === 1 &&
    !!entries.find((entry) => entry.ri === 4).expr.trim() &&
    entries.find((entry) => entry.ri === 4).expr.split('+').length === 1;
  const legacy =
    olderJre &&
    Object.entries(LEGACY_JRE_FACTORS).every(([ri, factors]) => {
      const matches = entries.filter((entry) => entry.ri === Number(ri));
      return (
        matches.length === 1 &&
        (matches[0].expr.trim() === '-' || matches[0].expr.split('+').length === factors.length)
      );
    });
  const layout3 =
    plantKey === 'JRE' &&
    !olderJre &&
    !entries.some((entry) => entry.ri === 30) &&
    entries.filter((entry) => entry.ri === 15).length === 1 &&
    entries.find((entry) => entry.ri === 15).expr.split('+').length === 2;
  let suppliedMeters = schema.rows.map((row) => row.factors.map(() => false));
  for (const { ri, expr, sourceLine } of entries) {
    const row =
      legacy && LEGACY_JRE_FACTORS[ri]
        ? { ...schema.rows[ri], factors: LEGACY_JRE_FACTORS[ri] }
        : olderJre && JRE_LAYOUT2_FACTORS[ri]
          ? { ...schema.rows[ri], factors: JRE_LAYOUT2_FACTORS[ri] }
          : layout3 && JRE_LAYOUT3_FACTORS[ri]
            ? { ...schema.rows[ri], factors: JRE_LAYOUT3_FACTORS[ri] }
            : schema.rows[ri];
    if (legacy || olderJre || layout3) values[ri] = row.factors.map(() => '');
    suppliedMeters[ri] = row.factors.map(() => false);
    if (seen.has(ri)) {
      issues.push({
        level: 'ERROR',
        code: 'IMPORT_DUPLICATE',
        rowIndex: ri,
        sourceLine,
        message: `${row.name}: appears more than once.`,
      });
      continue;
    }
    seen.add(ri);
    const terms = !expr.trim()
      ? row.factors.map(() => '')
      : expr.trim() === '-'
        ? row.factors.map(() => '-')
        : expr.split('+').map((s) => s.trim());
    const optionalTail =
      row.zeroWhenUnavailable?.includes(terms.length) && terms.length === row.factors.length - 1;
    if (terms.length !== row.factors.length && !optionalTail) {
      issues.push({
        level: 'ERROR',
        code: 'METER_COUNT',
        rowIndex: ri,
        sourceLine,
        expected: row.factors.length,
        found: terms.length,
        message: `${row.name}: expected ${row.factors.length} meters, found ${terms.length}.`,
      });
      continue;
    }
    terms.forEach((term, mi) => {
      const m = term.match(
        /^(-|\d+(?:[.,]\d{1,6})?|_{2,})?(?:\s*\(\s*Ratio\s*(\d+(?:[.,]\d+)?)\s*\)|\s*\(\(\s*Ratio\s*(\d+(?:[.,]\d+)?)\s*\)\s*\/\s*(\d+)\s*\))?$/i,
      );
      if (!m || (m[1] && m[1] !== '-' && !/^_+$/.test(m[1]) && decimalText(m[1]) === null)) {
        issues.push({
          level: 'ERROR',
          code: 'INVALID_READING',
          rowIndex: ri,
          meterIndex: mi,
          sourceLine,
          message: `${row.name}, meter ${mi + 1}: invalid format (${term}).`,
        });
        return;
      }
      if (!m[1] || /^_+$/.test(m[1])) return;
      values[ri][mi] = m[1];
      suppliedMeters[ri][mi] = true;
      if (m[2] || m[3]) {
        const factor = Number((m[2] || m[3]).replace(',', '.')) / (m[4] ? Number(m[4]) : 1);
        const expected = schema.rows[ri].factors[mi] ?? row.factors[mi];
        if (factor !== expected)
          issues.push({
            level: 'WARNING',
            code: 'RATIO_MISMATCH',
            rowIndex: ri,
            meterIndex: mi,
            inputRatio: factor,
            message: `${row.name}, meter ${mi + 1}: input ratio ${factor}, template ratio ${expected}. Using the template ratio.`,
          });
      }
    });
  }
  schema.rows.forEach((row, ri) => {
    if (!seen.has(ri) && !row.optionalImport)
      issues.push({
        level: 'ERROR',
        code: 'IMPORT_MISSING',
        rowIndex: ri,
        message: `${row.name}: row not found.`,
      });
  });
  if (
    !flowSupplied &&
    !suppliedMeters.some((row) => row.some(Boolean)) &&
    !issues.some((i) => ['INVALID_READING', 'METER_COUNT'].includes(i.code))
  )
    issues.push({
      level: 'ERROR',
      code: 'IMPORT_EMPTY',
      message: 'Fill in at least one meter reading. Leave unknown readings blank.',
    });
  const success = !issues.some((i) => i.level === 'ERROR');
  if (success) {
    if (plantKey === 'JRE' && values[2].length < schema.rows[2].factors.length) {
      values[2].push('');
      suppliedMeters[2].push(false);
    }
    schema.rows.forEach((row, ri) => {
      if (!seen.has(ri) && beforeMeterReporting(row, dates[0]))
        values[ri] = row.factors.map(() => '0');
    });
    if (legacy) {
      values = moveLegacyValues(values);
      suppliedMeters = moveLegacyValues(suppliedMeters);
    }
    if (olderJre) {
      values[4].push('');
      suppliedMeters[4].push(false);
    }
    if (olderJre || layout3) {
      values[15].push('');
      suppliedMeters[15].push(false);
    }
  }
  return {
    values,
    valueCount: suppliedMeters.flat().filter(Boolean).length,
    emptyCount: suppliedMeters.flat().filter((value) => !value).length,
    suppliedMeters,
    suppliedRows: [...seen],
    omittedRows: schema.rows.map((_, i) => i).filter((i) => !seen.has(i)),
    date: dates[0],
    time: times[0],
    ...(timeRange ? { timeRange } : {}),
    ...(dateRange ? { dateRange } : {}),
    issues: legacy && success ? moveLegacyIssues(issues) : issues,
    success,
    ...(flowSeen ? { flowReading, flowSupplied } : {}),
  };
}

// Plan the complete paste before changing any cells, so an oversized block cannot partially overwrite data.
export function planTablePaste(text, coordinates, startIndex, side) {
  const lines = text
    .replace(/\r/g, '')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.split('\t'));
  const columns = side === 'start' ? ['start', 'end'] : ['end'];
  if (
    lines.some((line) => line.length > columns.length) ||
    startIndex + lines.length > coordinates.length
  ) {
    throw new Error(
      'Data exceeds available rows or columns. Paste readings only, without column headings.',
    );
  }
  const changes = [];
  lines.forEach((line, offset) =>
    line.forEach((raw, ci) => {
      const value = raw.trim();
      if (value && value !== '-' && decimalText(value) === null)
        throw new Error(`Invalid value: ${value}. No data was pasted.`);
      changes.push({ ...coordinates[startIndex + offset], side: columns[ci], value });
    }),
  );
  return changes;
}
