import { GRAPH_METRICS } from './graph-schema.js';
import { PLANT_SCHEMAS, UTILITIES } from './schema.js';
import { buildWorksheet } from './worksheet.js';
import { dayDiff, round } from './numbers.js';

// Read the saved English outputs, not today's engine or raw cumulative readings.
// Old snapshots remain immutable and retain the result approved at their revision.
export function graphValues(snapshot, plant) {
  const values = {};
  const report =
    typeof snapshot?.output?.reportText === 'string' ? snapshot.output.reportText.split('\n') : [];
  const worksheet =
    typeof snapshot?.output?.worksheetText === 'string'
      ? snapshot.output.worksheetText.split('\n')
      : [];
  function extract(lines, prefix, unit = '') {
    const matches = lines.filter((line) => line.startsWith(prefix));
    if (matches.length !== 1) return null;
    const text = matches[0].slice(prefix.length);
    if (text === '-' || text.startsWith('- ')) return null;
    const match = /^(\d+(?:\.\d+)?)(.*)$/.exec(text);
    if (!match || !Number.isFinite(Number(match[1])) || Number(match[1]) > 1e15) return null;
    const suffix = unit ? ' ' + unit : '';
    if (
      match[2] !== suffix &&
      !(unit && match[2].startsWith(suffix + ' (') && match[2].endsWith(')'))
    )
      return null;
    return Number(match[1]);
  }
  const headers = buildWorksheet(plant, '', []).headers.filter((h) => h !== 'Date');
  if (worksheet[0] === plant + ' ELECTRICAL WORKSHEET:')
    headers.forEach((name, i) => {
      values['w' + i] = extract(worksheet.slice(1), name + ': ');
    });
  const schema = PLANT_SCHEMAS[plant];
  schema.rows.forEach((row, i) => {
    const value = extract(report, row.no + '. ' + (row.displayName || row.name) + ': ', row.unit);
    values['r' + i] =
      value === null ? null : round(value * (row.unit.toLowerCase() === 'mwh' ? 1000 : 1), 8);
  });
  UTILITIES[plant].forEach(([name, unit], i) => {
    values['u' + i] = extract(report, schema.utilityPrefix + ' ' + name + ': ', unit);
  });
  return Object.fromEntries(GRAPH_METRICS[plant].map((m) => [m.key, values[m.key] ?? null]));
}
export function graphRecords(rows, plant) {
  const records = rows.map((row) => ({
    id: row.id,
    revision: row.revision,
    startDate: row.start_date,
    endDate: row.end_date,
    values: graphValues(row.snapshot, plant),
  }));
  // Keep every latest revision in the response. Overlapping periods remain visible
  // in the data table, but neither is plotted as an unambiguous daily observation.
  records.sort(
    (a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate),
  );
  const overlaps = new Set();
  for (let i = 0; i < records.length; i++)
    for (let j = i + 1; j < records.length && records[j].startDate < records[i].endDate; j++) {
      overlaps.add(i);
      overlaps.add(j);
    }
  return records.map((row, i) => ({
    ...row,
    days: dayDiff(row.startDate, row.endDate),
    overlap: overlaps.has(i),
  }));
}
export function graphSegments(records, key) {
  const segments = [];
  let segment = [],
    previous = null;
  for (const row of records) {
    const value = row.values[key];
    if (row.overlap || row.days < 1 || !Number.isFinite(value)) {
      if (segment.length) segments.push(segment);
      segment = [];
      previous = null;
      continue;
    }
    if (previous && previous.endDate !== row.startDate) {
      segments.push(segment);
      segment = [];
    }
    segment.push({ ...row, value });
    previous = row;
  }
  if (segment.length) segments.push(segment);
  return segments;
}
