import { PLANT_SCHEMAS } from '../../schema.js';

// Synthetic operator format: omit Trafo, repeat the lab name, put a shared ratio last.
export function unilandInput(draft, side) {
  const rows = PLANT_SCHEMAS.UNILAND.rows.filter((row) => !row.optionalImport);
  return (
    'UNILAND\n' +
    draft[side + 'Date'] +
    '\n' +
    rows
      .map((row, n) => {
        const index = PLANT_SCHEMAS.UNILAND.rows.indexOf(row);
        const terms = draft.rows[index][side].map(
          (value, mi) =>
            value +
            (!row.ratioLabel?.includes('/') && row.factors[mi] !== 1
              ? ` (Ratio ${row.factors[mi]})`
              : ''),
        );
        const name = row.name.replace(' (2)', '');
        const ratio = row.ratioLabel?.includes('/')
          ? ` ((Ratio ${row.ratioLabel.split('/')[0]})/1000)`
          : '';
        return `${n + 1}. ${name}: ${terms.join('+')}${ratio}`;
      })
      .join('\n')
  );
}
