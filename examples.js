import { createDraft } from './engine.js';
import { PLANT_SCHEMAS } from './schema.js';
import { beforeMeterReporting } from './meter-activation.js';

export function exampleDraft(plant) {
  const draft = createDraft(plant, '2026-09-16', '2026-09-17');
  draft.rows.forEach((input, ri) => {
    PLANT_SCHEMAS[plant].rows[ri].factors.forEach((factor, mi) => {
      if (beforeMeterReporting(PLANT_SCHEMAS[plant].rows[ri], draft.startDate)) {
        input.start[mi] = input.end[mi] = '0';
        return;
      }
      input.start[mi] = String(1000 + ri * 100 + mi * 10);
      input.end[mi] = String(1000 + ri * 100 + mi * 10 + (factor >= 40 ? 0.5 : 10));
    });
  });
  if (plant === 'JRE') draft.rows[0].start[0] = '100000';
  if (plant === 'JRE') {
    PLANT_SCHEMAS.JRE.rows.forEach((row, i) => {
      if (row.deductMeters) {
        const mi = row.netMeter ?? 0;
        const included = row.deductMeters.reduce((sum, { name, meter }) => {
          const source = PLANT_SCHEMAS.JRE.rows.findIndex((item) => item.name === name);
          const input = draft.rows[source];
          return (
            sum +
            (Number(input.end[meter]) - Number(input.start[meter])) *
              PLANT_SCHEMAS.JRE.rows[source].factors[meter]
          );
        }, 0);
        draft.rows[i].end[mi] = String(
          Number(draft.rows[i].start[mi]) + Math.max(50, included + 10) / row.factors[mi],
        );
      }
    });
  }
  draft.rows[0].end[0] = plant === 'JRE' ? '103000' : '1003.78';
  return draft;
}
