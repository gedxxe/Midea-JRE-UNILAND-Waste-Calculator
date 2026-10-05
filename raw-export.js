import { PLANT_SCHEMAS } from './schema.js';
import { decimalText, validDate } from './numbers.js';

// Export one cumulative reading column. Never apply factors or compare endpoints.
export function exportRawReading(draft, side = 'end') {
  const result = formatReadingColumn(draft, side);
  return result.issues.length ? { ...result, text: '' } : result;
}

// The import editor also needs an editable template for incomplete columns.
// Keep empty cells empty; only exportRawReading permits copy-ready output.
export function formatReadingColumn(draft, side) {
  const schema = PLANT_SCHEMAS[draft?.plantKey];
  if (
    !schema?.rows ||
    !['start', 'end'].includes(side) ||
    draft.rows?.length !== schema.rows.length
  )
    return { text: '', issues: [{ code: 'SHAPE' }] };
  const date = draft[side + 'Date'];
  const issues = validDate(date) ? [] : [{ code: 'DATE' }];
  const lines = schema.rows.map((row, rowIndex) => {
    const values = draft.rows[rowIndex]?.[side];
    if (!Array.isArray(values) || values.length !== row.factors.length) {
      issues.push({ code: 'SHAPE', rowIndex });
      return '';
    }
    const terms = values.map((value, meterIndex) => {
      const raw = typeof value === 'string' ? value.trim() : '';
      if (!raw || (raw !== '-' && decimalText(raw) === null))
        issues.push({ code: raw ? 'INVALID' : 'EMPTY', rowIndex, meterIndex });
      // A leading plus is redundant and would collide with the meter separator.
      const reading = raw.replace(/^\+/, '');
      let annotation = '';
      if (row.ratioLabel?.includes('/')) {
        const [numerator, denominator] = row.ratioLabel.split('/');
        annotation = ` ((Ratio ${numerator})/${denominator})`;
      } else if (row.factors[meterIndex] !== 1) {
        annotation = ` (Ratio ${row.factors[meterIndex]})`;
      }
      return reading + annotation;
    });
    return `${row.no}. ${row.name}: ${terms.join(' + ')}`;
  });
  const [year, month, day] = validDate(date) ? date.split('-') : [];
  const dateText = validDate(date) ? `${day}/${month}/${year}` : '';
  return { text: `${schema.name}\n\n${dateText}\n\n${lines.join('\n')}`, issues };
}
