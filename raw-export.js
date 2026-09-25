import { PLANT_SCHEMAS } from './schema.js';
import { decimalText, validDate } from './numbers.js';

// Export one cumulative reading column. Never apply factors or compare endpoints.
export function exportRawReading(draft, side = 'end') {
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
  if (issues.length) return { text: '', issues };
  const [year, month, day] = date.split('-');
  return { text: `${schema.name}\n\n${day}/${month}/${year}\n\n${lines.join('\n')}`, issues };
}
