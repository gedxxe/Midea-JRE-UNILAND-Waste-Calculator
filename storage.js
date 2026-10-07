import { restoreGasDraft, nextGasDay } from './gas.js';
import { createDraft } from './engine.js';
import { currentRatioIssues } from './import-ratios.js';
import { migrateMeterLayout } from './meter-layout.js';
import { restoreWater, nextWaterDay } from './water.js';
import {
  restoreAdditionalReadings,
  nextAdditionalReadings,
  emptyAdditionalReadings,
} from './additional-readings.js';
import { validDate, shiftDate, decimalText } from './numbers.js';

export const STORAGE_KEY = 'midea_energy_draft_v4';
export function restoreWorkspace(raw) {
  const saved = JSON.parse(raw);
  const drafts = restoreDrafts(raw),
    reportLinks = {};
  for (const plant of ['JRE', 'UNILAND']) {
    const link = saved.reportLinks?.[plant];
    if (
      link &&
      /^[0-9a-f-]{36}$/i.test(link.id || '') &&
      Number.isSafeInteger(link.revision) &&
      link.revision > 0 &&
      validDate(link.startDate) &&
      validDate(link.endDate)
    )
      reportLinks[plant] = {
        id: link.id,
        revision: link.revision,
        startDate: link.startDate,
        endDate: link.endDate,
      };
  }
  return { version: 4, drafts, reportLinks };
}
export function restoreDrafts(raw) {
  const saved = JSON.parse(raw);
  if (saved.version !== 4) throw new Error('Draft version does not match.');
  const result = {};
  for (const plant of ['JRE', 'UNILAND']) {
    const input = migrateMeterLayout(saved.drafts?.[plant]);
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
    if (plant === 'JRE') draft.gas = restoreGasDraft(input.gas);
    if (plant === 'JRE' && input.water !== undefined) draft.water = restoreWater(input.water);
    // Retain legacy UNILAND pairs for recovery, without using them in new reports.
    if (input.additionalReadings !== undefined)
      draft.additionalReadings = restoreAdditionalReadings(input.additionalReadings);
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
    draft.importIssues = currentRatioIssues(plant, input.importIssues);
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
  if (draft.plantKey === 'JRE') next.gas = nextGasDay(draft.gas);
  if (draft.plantKey === 'JRE' && draft.water) next.water = nextWaterDay(draft.water);
  if (draft.additionalReadings)
    next.additionalReadings =
      draft.plantKey === 'JRE'
        ? nextAdditionalReadings(draft.additionalReadings)
        : draft.additionalReadings.map(({ end }) => ({ start: end, end: '' }));
  next.rows.forEach((row, i) => {
    row.start = [...draft.rows[i].end];
  });
  return next;
}

// Dates identify observations. Never relabel a known reading with a different date.
// The origin retains endpoints while the operator edits the two date fields in either order.
export function changeDraftPeriod(draft, startDate, endDate, origin = draft) {
  if (draft.startDate === startDate && draft.endDate === endDate) return structuredClone(draft);
  if (
    origin.plantKey === draft.plantKey &&
    origin.startDate === startDate &&
    origin.endDate === endDate
  )
    return structuredClone(origin);
  const next = createDraft(draft.plantKey, startDate, endDate);
  next.isExample = draft.isExample;
  next.importIssues = [];
  if (draft.additionalReadings || origin.additionalReadings)
    next.additionalReadings = emptyAdditionalReadings();
  if (draft.plantKey === 'JRE' && (draft.water || origin.water))
    next.water = { start: '', end: '' };
  for (const side of ['start', 'end']) {
    const date = next[side + 'Date'];
    let source;
    for (const candidate of [draft, origin]) {
      if (candidate.plantKey !== draft.plantKey) continue;
      const match = [side, side === 'start' ? 'end' : 'start'].find(
        (key) => date && candidate[key + 'Date'] === date,
      );
      if (match) {
        source = { draft: candidate, side: match };
        break;
      }
    }
    // Undated input can be assigned its first date without discarding it.
    if (!source && !draft[side + 'Date']) source = { draft, side };
    if (source) {
      next.additionalReadings?.forEach((row, i) => {
        row[side] = source.draft.additionalReadings?.[i]?.[source.side] || '';
      });
      if (next.water) next.water[side] = source.draft.water?.[source.side] || '';
      for (const issue of source.draft.importIssues || []) {
        if (
          !next.importIssues.some((existing) => JSON.stringify(existing) === JSON.stringify(issue))
        )
          next.importIssues.push(structuredClone(issue));
      }
      next.rows.forEach((row, i) => {
        row[side] = [...source.draft.rows[i][source.side]];
      });
      next.gas?.entries.forEach((entry, i) => {
        const old = source.draft.gas?.entries[i];
        if (old) entry[side] = { ...old[source.side] };
      });
    }
  }
  next.gas?.entries.forEach((entry, i) => {
    entry.enabled = draft.gas?.entries[i]?.enabled === true;
  });
  return next;
}
