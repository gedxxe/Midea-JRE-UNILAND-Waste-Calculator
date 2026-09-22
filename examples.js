import { createDraft } from './engine.js';
import { PLANT_SCHEMAS } from './schema.js';

export function exampleDraft(plant) {
  const draft = createDraft(plant, '2026-09-16', '2026-09-17');
  draft.rows.forEach((input, ri) => {
    PLANT_SCHEMAS[plant].rows[ri].factors.forEach((factor, mi) => {
      input.start[mi] = String(1000 + ri * 100 + mi * 10);
      input.end[mi] = String(1000 + ri * 100 + mi * 10 + (factor >= 40 ? 0.5 : 10));
    });
  });
  if (plant === 'JRE') draft.rows[0].start[0] = '100000';
  draft.rows[0].end[0] = plant === 'JRE' ? '103000' : '1003.78';
  return draft;
}
