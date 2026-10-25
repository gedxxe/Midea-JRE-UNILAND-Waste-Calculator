import { createDraft } from '../../engine.js';
import { PLANT_SCHEMAS } from '../../schema.js';
import {
  LEGACY_JRE_FACTORS,
  JRE_LAYOUT2_FACTORS,
  JRE_LAYOUT3_FACTORS,
} from '../../meter-layout.js';
import { scaledReading } from '../../numbers.js';

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
          (draft.meterLayout >= 4
            ? {}
            : draft.meterLayout === 3
              ? JRE_LAYOUT3_FACTORS
              : draft.meterLayout === 2
                ? JRE_LAYOUT2_FACTORS
                : LEGACY_JRE_FACTORS)[i] || PLANT_SCHEMAS.JRE.rows[i].factors;
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
  for (const side of ['start', 'end']) {
    old.rows[4][side] = old.rows[4][side].slice(0, 1);
    old.rows[15][side] = old.rows[15][side].slice(0, 2);
  }
  old.meterLayout = 2;
  return old;
}
export function layout3JreDraft(input) {
  const old = structuredClone(input);
  old.rows = old.rows.slice(0, 30);
  for (const side of ['start', 'end']) old.rows[15][side] = old.rows[15][side].slice(0, 2);
  old.meterLayout = 3;
  return old;
}
export function layout4JreDraft(input) {
  const old = structuredClone(input);
  old.rows = old.rows.slice(0, 30);
  old.meterLayout = 4;
  return old;
}
export function fillNewJreMeters(input) {
  const next = structuredClone(input);
  for (const side of ['start', 'end']) {
    next.rows[4][side][1] = '1000';
    next.rows[29][side][0] = '1000';
    next.rows[30][side][0] = '1000';
  }
  next.rows[15].start[2] = '0';
  next.rows[15].end[2] = String(
    (Number(scaledReading(next.rows[3].end[5]) - scaledReading(next.rows[3].start[5])) * 40) / 1e6,
  );
  return next;
}

export function layout5JreDraft(input) {
  const old = structuredClone(input);
  old.rows = old.rows.slice(0, 31);
  old.meterLayout = 5;
  return old;
}
