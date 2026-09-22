import { PLANT_SCHEMAS } from './schema.js';
import { normalizeName, decimalText, validDate } from './numbers.js';

export function parseReading(text, plantKey) {
  const schema = PLANT_SCHEMAS[plantKey];
  const lookup = new Map();
  schema.rows.forEach((row, i) =>
    [row.name, ...(row.aliases || [])].forEach((name) => lookup.set(normalizeName(name), i)),
  );
  const values = schema.rows.map((row) => row.factors.map(() => ''));
  const issues = [];
  const seen = new Set();
  const dates = [];
  let active = null;
  const entries = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const dateMatch = line.match(
      /^(?:(\d{1,2})\/(\d{1,2})\/(20\d{2})|(20\d{2})-(\d{2})-(\d{2}))\s*:?$/,
    );
    if (dateMatch) {
      const iso = dateMatch[4]
        ? `${dateMatch[4]}-${dateMatch[5]}-${dateMatch[6]}`
        : `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
      dates.push(iso);
      active = null;
      continue;
    }
    const match = line.match(/^(?:\d+[.)]\s*)?([^:]+):\s*(.*)$/);
    const ri = match ? lookup.get(normalizeName(match[1])) : undefined;
    if (ri !== undefined) {
      active = { ri, expr: match[2] };
      entries.push(active);
    } else if (active && /^[\d+.,()\s\-/]+(?:.*)?$/.test(line) && !line.includes(':')) {
      active.expr += ` ${line}`;
    } else if (seen.size || entries.length) {
      issues.push({ level: 'ERROR', code: 'IMPORT_SYNTAX', message: `Unrecognized line: ${line}` });
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
  for (const { ri, expr } of entries) {
    const row = schema.rows[ri];
    if (seen.has(ri)) {
      issues.push({
        level: 'ERROR',
        code: 'IMPORT_DUPLICATE',
        message: `${row.name}: appears more than once.`,
      });
      continue;
    }
    seen.add(ri);
    const terms =
      expr.trim() === '-' ? row.factors.map(() => '-') : expr.split('+').map((s) => s.trim());
    if (terms.length !== row.factors.length) {
      issues.push({
        level: 'ERROR',
        code: 'METER_COUNT',
        message: `${row.name}: expected ${row.factors.length} meters, found ${terms.length}.`,
      });
      continue;
    }
    terms.forEach((term, mi) => {
      const m = term.match(
        /^(-|\d+(?:[.,]\d{1,6})?)(?:\s*\(\s*Ratio\s+(\d+(?:[.,]\d+)?)\s*\)|\s*\(\(\s*Ratio\s+(\d+(?:[.,]\d+)?)\s*\)\s*\/\s*(\d+)\s*\))?$/i,
      );
      if (!m || (m[1] !== '-' && decimalText(m[1]) === null)) {
        issues.push({
          level: 'ERROR',
          code: 'INVALID_READING',
          message: `${row.name}, meter ${mi + 1}: invalid format (${term}).`,
        });
        return;
      }
      values[ri][mi] = m[1];
      if (m[2] || m[3]) {
        const factor = Number((m[2] || m[3]).replace(',', '.')) / (m[4] ? Number(m[4]) : 1);
        if (factor !== row.factors[mi])
          issues.push({
            level: 'WARNING',
            code: 'RATIO_MISMATCH',
            rowIndex: ri,
            meterIndex: mi,
            message: `${row.name}, meter ${mi + 1}: input ratio ${factor}, template ratio ${row.factors[mi]}. Using the template ratio.`,
          });
      }
    });
  }
  schema.rows.forEach((row, ri) => {
    if (!seen.has(ri))
      issues.push({
        level: 'ERROR',
        code: 'IMPORT_MISSING',
        message: `${row.name}: row not found.`,
      });
  });
  return { values, date: dates[0], issues, success: !issues.some((i) => i.level === 'ERROR') };
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
