import { createDraft } from '../../engine.js';
import { PLANT_SCHEMAS } from '../../schema.js';
import { LEGACY_JRE_FACTORS, JRE_LAYOUT2_FACTORS } from '../../meter-layout.js';

export function legacyDraft() {
  const draft = createDraft('JRE', '2026-10-01', '2026-10-02');
  delete draft.meterLayout;
  draft.rows = draft.rows.slice(0, 29);
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
        const factors =
          (draft.meterLayout === 2 ? JRE_LAYOUT2_FACTORS : LEGACY_JRE_FACTORS)[i] ||
          PLANT_SCHEMAS.JRE.rows[i].factors;
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

export function layout2Draft(input) {
  const old = structuredClone(input);
  old.rows = old.rows.slice(0, 29);
  for (const side of ['start', 'end']) old.rows[4][side] = old.rows[4][side].slice(0, 1);
  old.meterLayout = 2;
  return old;
}
export function fillNewJreMeters(input) {
  const next = structuredClone(input);
  for (const side of ['start', 'end']) {
    next.rows[4][side][1] = '1000';
    next.rows[29][side][0] = '1000';
  }
  return next;
}
