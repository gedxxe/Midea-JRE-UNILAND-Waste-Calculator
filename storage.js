import { createDraft } from './engine.js';
import { validDate, shiftDate, decimalText } from './numbers.js';

export const STORAGE_KEY = 'midea_energy_draft_v4';
export function restoreDrafts(raw) {
  const saved = JSON.parse(raw);
  if (saved.version !== 4) throw new Error('Draft version does not match.');
  const result = {};
  for (const plant of ['JRE', 'UNILAND']) {
    const input = saved.drafts?.[plant];
    const draft = createDraft(plant);
    if (
      !input ||
      !['startDate', 'endDate'].every((key) => input[key] === '' || validDate(input[key]))
    )
      throw new Error('Invalid draft dates.');
    if (
      input.rows?.length !== draft.rows.length ||
      input.utilities?.length !== draft.utilities.length
    )
      throw new Error('Draft meter layout does not match.');
    draft.isExample = input.isExample === true;
    draft.startDate = input.startDate;
    draft.endDate = input.endDate;
    draft.rows.forEach((row, ri) => {
      for (const side of ['start', 'end']) {
        const values = input.rows[ri]?.[side];
        if (
          !Array.isArray(values) ||
          values.length !== row[side].length ||
          values.some((v) => typeof v !== 'string' || v.length > 50)
        )
          throw new Error('Invalid draft readings.');
        row[side] = [...values];
      }
      row.inactive = input.rows[ri].inactive === true;
    });
    draft.utilities.forEach((value, i) => {
      for (const field of ['value', 'note']) {
        const text = input.utilities[i]?.[field];
        if (typeof text !== 'string' || text.length > 500)
          throw new Error('Invalid draft utility.');
        value[field] = text;
      }
    });
    // Only import warnings from this app's known parser can survive a saved draft.
    draft.importIssues = (Array.isArray(input.importIssues) ? input.importIssues : [])
      .filter(
        (i) =>
          i &&
          i.code === 'RATIO_MISMATCH' &&
          typeof i.message === 'string' &&
          Number.isInteger(i.rowIndex) &&
          i.rowIndex >= 0 &&
          i.rowIndex < draft.rows.length &&
          Number.isInteger(i.meterIndex) &&
          i.meterIndex >= 0 &&
          i.meterIndex < draft.rows[i.rowIndex].start.length,
      )
      .map((i) => ({
        code: i.code,
        message: i.message.slice(0, 500),
        level: 'WARNING',
        rowIndex: i.rowIndex,
        meterIndex: i.meterIndex,
      }));
    result[plant] = draft;
  }
  return result;
}

export function nextDayDraft(draft) {
  if (!validDate(draft.endDate)) throw new Error('Enter a valid end date.');
  if (draft.rows.some((row) => row.end.some((v) => !v.trim())))
    throw new Error('Complete all end readings before moving to the next day.');
  if (draft.rows.some((row) => row.end.some((v) => v.trim() !== '-' && decimalText(v) === null)))
    throw new Error('Correct invalid end readings before moving to the next day.');
  const next = createDraft(draft.plantKey, draft.endDate, shiftDate(draft.endDate, 1));
  next.rows.forEach((row, i) => {
    row.start = [...draft.rows[i].end];
  });
  return next;
}
