import { reconcileShiftPair } from './shifts.js';
import { restoreGasDraft, nextGasDay } from './gas.js';
import {
  isWorkingHours,
  isNightShift,
  periodKind,
  validTime,
  observationTime,
} from './reading-period.js';
import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from './engine.js';
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

// JSONB may reorder object keys. Arrays and every stored value remain significant.
export function sameWorkspace(left, right) {
  const canonical = (input) =>
    JSON.stringify(input, (_, value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, value[key]]),
          )
        : value,
    );
  return canonical(left) === canonical(right);
}

export function restoreWorkspace(raw) {
  const saved = JSON.parse(raw);
  const drafts = restoreDrafts(raw),
    reportLinks = {};
  if (Object.values(drafts).some(isWorkingHours))
    throw new Error('Daily drafts must use daily periods.');
  for (const plant of ['JRE', 'UNILAND', 'JREWork', 'UNILANDWork', 'JRENight', 'UNILANDNight']) {
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
  if (saved.workingHours !== undefined) {
    const workingHours = restoreDrafts(JSON.stringify({ version: 4, drafts: saved.workingHours }));
    if (Object.values(workingHours).some((d) => periodKind(d) !== 'workingHours'))
      throw new Error('Invalid working-hours workspace.');
    let nightShifts;
    if (saved.nightShifts !== undefined) {
      nightShifts = restoreDrafts(JSON.stringify({ version: 4, drafts: saved.nightShifts }));
      if (Object.values(nightShifts).some((d) => !isNightShift(d)))
        throw Error('Invalid Night workspace.');
      for (const plant of ['JRE', 'UNILAND']) {
        const pair = reconcileShiftPair(workingHours[plant], nightShifts[plant]);
        workingHours[plant] = pair.day;
        nightShifts[plant] = pair.night;
      }
    }
    return {
      version: 4,
      drafts,
      workingHours,
      ...(nightShifts ? { nightShifts } : {}),
      reportLinks,
    };
  }
  if (saved.nightShifts !== undefined) throw Error('Day workspace required with Night drafts.');
  return { version: 4, drafts, reportLinks };
}

export function emptyWorkingHours() {
  return { JRE: createWorkingHoursDraft('JRE'), UNILAND: createWorkingHoursDraft('UNILAND') };
}

// A time is part of an observation's identity. Never relabel a 17:00 reading as 08:00.
export function changeWorkPeriod(draft, date, startTime, endTime, origin = draft) {
  const next = (isNightShift(draft) ? createNightShiftDraft : createWorkingHoursDraft)(
    draft.plantKey,
    date,
    startTime,
    endTime,
  );
  if (draft.additionalReadings || origin.additionalReadings)
    next.additionalReadings = emptyAdditionalReadings();
  next.importIssues = [];
  next.isExample = draft.isExample;
  for (const side of ['start', 'end']) {
    let source;
    for (const candidate of [draft, origin]) {
      if (!isWorkingHours(candidate) || candidate.plantKey !== draft.plantKey) continue;
      const match = ['start', 'end'].find(
        (key) =>
          next[side + 'Date'] &&
          candidate[key + 'Date'] === next[side + 'Date'] &&
          observationTime(candidate, key) === next[side + 'Time'],
      );
      if (match) {
        source = { draft: candidate, side: match };
        break;
      }
    }
    if (!source && !draft[side + 'Date'] && draft[side + 'Time'] === next[side + 'Time'])
      source = { draft, side };
    if (!source) continue;
    next.rows.forEach((row, i) => {
      row[side] = [...source.draft.rows[i][source.side]];
    });
    next.additionalReadings?.forEach((row, i) => {
      row[side] = source.draft.additionalReadings?.[i]?.[source.side] || '';
    });
    for (const item of source.draft.importIssues || [])
      if (!next.importIssues.some((old) => JSON.stringify(old) === JSON.stringify(item)))
        next.importIssues.push(structuredClone(item));
  }
  if (draft.startDate === date && draft.startTime === startTime && draft.endTime === endTime)
    next.rows.forEach((row, i) => {
      row.inactive = draft.rows[i].inactive;
    });
  return next;
}

export function useDailyMorning(work, daily) {
  if (
    !isWorkingHours(work) ||
    isNightShift(work) ||
    work.startTime !== '08:00' ||
    !validDate(work.startDate) ||
    daily.plantKey !== work.plantKey ||
    isWorkingHours(daily)
  )
    throw new Error('workMorningUnavailable');
  const side = ['start', 'end'].find((key) => daily[key + 'Date'] === work.startDate);
  if (!side || !daily.rows.some((row) => row[side].some((value) => value.trim())))
    throw new Error('workMorningUnavailable');
  const next = structuredClone(work);
  next.rows.forEach((row, i) => {
    row.start = [...daily.rows[i][side]];
    row.inactive = false;
  });
  if (daily.additionalReadings || next.additionalReadings) {
    next.additionalReadings ??= emptyAdditionalReadings();
    next.additionalReadings.forEach((row, i) => {
      row.start = daily.additionalReadings?.[i]?.[side] || '';
    });
  }
  next.importIssues = currentRatioIssues(work.plantKey, [
    ...(work.importIssues || []),
    ...(daily.importIssues || []),
  ]).filter(
    (item, i, all) =>
      all.findIndex((other) => JSON.stringify(other) === JSON.stringify(item)) === i,
  );
  next.isExample = daily.isExample || work.isExample;
  return next;
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
    draft.gas = restoreGasDraft(input.gas, plant);
    if (input.water !== undefined) draft.water = restoreWater(input.water);
    // Retain legacy UNILAND pairs for recovery, without using them in new reports.
    if (input.additionalReadings !== undefined)
      draft.additionalReadings = restoreAdditionalReadings(input.additionalReadings);
    if (!['daily', 'workingHours', 'nightShift'].includes(periodKind(input)))
      throw new Error('Invalid reading mode.');
    if (isWorkingHours(input)) {
      if (!['startTime', 'endTime'].every((key) => input[key] === '' || validTime(input[key])))
        throw new Error('Invalid reading time.');
      draft.periodKind = periodKind(input);
      draft.startTime = input.startTime;
      draft.endTime = input.endTime;
    }
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
  if (isWorkingHours(draft)) {
    if (!validDate(draft.startDate)) throw new Error('Enter a valid work date.');
    return createWorkingHoursDraft(
      draft.plantKey,
      shiftDate(draft.startDate, 1),
      draft.startTime,
      draft.endTime,
    );
  }
  if (!validDate(draft.endDate)) throw new Error('Enter a valid end date.');
  if (draft.rows.some((row) => row.end.some((v) => !v.trim())))
    throw new Error('Complete all end readings before moving to the next day.');
  if (draft.rows.some((row) => row.end.some((v) => v.trim() !== '-' && decimalText(v) === null)))
    throw new Error('Correct invalid end readings before moving to the next day.');
  const next = createDraft(draft.plantKey, draft.endDate, shiftDate(draft.endDate, 1));
  next.gas = nextGasDay(draft.gas, draft.plantKey);
  if (draft.water) next.water = nextWaterDay(draft.water);
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
  if (draft.water || origin.water) next.water = { start: '', end: '' };
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
