import { createDraft } from '../../engine.js';
import { PLANT_SCHEMAS } from '../../schema.js';
import { LEGACY_JRE_FACTORS } from '../../meter-layout.js';

export function legacyDraft() {
  const draft = createDraft('JRE', '2026-10-01', '2026-10-02');
  delete draft.meterLayout;
  draft.rows.forEach((row, i) => {
    row.start = (LEGACY_JRE_FACTORS[i] || PLANT_SCHEMAS.JRE.rows[i].factors).map(() => '1000');
    row.end = [...row.start];
  });
  draft.rows[0].end = ['1200'];
  draft.rows[15].start = ['10'];
  draft.rows[15].end = ['11'];
  draft.rows[19].end = ['1150'];
  draft.rows[25].start = ['10,01', '20.02', '30.03'];
  draft.rows[25].end = ['11.01', '22.02', '33.03'];
  return draft;
}

export function legacyText(draft, side) {
  return (
    draft[side + 'Date'] +
    '\n' +
    draft.rows
      .map((row, i) => {
        const factors = LEGACY_JRE_FACTORS[i] || PLANT_SCHEMAS.JRE.rows[i].factors;
        return (
          `${i + 1}. ${PLANT_SCHEMAS.JRE.rows[i].name}: ` +
          row[side]
            .map((v, mi) => v + (factors[mi] === 1 ? '' : ` (Ratio ${factors[mi]})`))
            .join(' + ')
        );
      })
      .join('\n')
  );
}
