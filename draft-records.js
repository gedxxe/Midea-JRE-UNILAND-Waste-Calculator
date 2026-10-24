import { periodKind } from './reading-period.js';
import { validDate, dayDiff, shiftDate } from './numbers.js';
import { createDraft } from './engine.js';
import { restoreDrafts, sameWorkspace } from './storage.js';

export const AUTOSAVE_LAYOUT = 1;
export const PERIOD_BATCH_SIZE = 8;
export const WORKSPACE_COLLECTIONS = ['drafts', 'workingHours', 'nightShifts'];

// Dates name a saved document. Incomplete dates remain in the active workspace.
export function periodKey(draft) {
  if (!draft || !['JRE', 'UNILAND'].includes(draft.plantKey)) return null;
  const kind = periodKind(draft);
  if (!validDate(draft.startDate) || !validDate(draft.endDate)) return null;
  if (
    kind === 'daily'
      ? dayDiff(draft.startDate, draft.endDate) < 1
      : kind === 'workingHours'
        ? draft.endDate !== draft.startDate
        : kind === 'nightShift'
          ? draft.endDate !== shiftDate(draft.startDate, 1)
          : true
  )
    return null;
  return [draft.plantKey, kind, draft.startDate, draft.endDate].join(':');
}
export function workspaceDrafts(workspace) {
  return WORKSPACE_COLLECTIONS.flatMap((collection) =>
    ['JRE', 'UNILAND'].map((plant) => workspace?.[collection]?.[plant]).filter(Boolean),
  );
}
export function hasEnteredData(draft) {
  const entered = (value) => typeof value === 'string' && value.trim() !== '';
  return Boolean(
    draft &&
    (draft.rows?.some((row) => row.inactive || [...row.start, ...row.end].some(entered)) ||
      draft.utilities?.some((item) => entered(item.value) || entered(item.note)) ||
      [draft.water?.start, draft.water?.end].some(entered) ||
      draft.additionalReadings?.some((item) => entered(item.start) || entered(item.end)) ||
      draft.gas?.entries?.some(
        (entry) =>
          entry.enabled ||
          entry.refills?.length ||
          [entry.start, entry.end].some(
            (point) => entered(point?.reading) || entered(point?.temperature),
          ),
      )),
  );
}
export function restorePeriodDraft(input) {
  const plant = input?.plantKey;
  if (!['JRE', 'UNILAND'].includes(plant)) throw Error('Invalid period factory.');
  return restoreDrafts(
    JSON.stringify({
      version: 4,
      drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND'), [plant]: input },
    }),
  )[plant];
}
export function queueDepartedPeriods(queue, before, after) {
  const pending = new Map(queue.map((draft) => [periodKey(draft), draft]));
  for (const collection of WORKSPACE_COLLECTIONS)
    for (const plant of ['JRE', 'UNILAND']) {
      const old = before?.[collection]?.[plant],
        next = after?.[collection]?.[plant];
      const key = periodKey(old);
      if (key && key !== periodKey(next) && !old.isExample) pending.set(key, structuredClone(old));
    }
  return [...pending.values()];
}
export function samePeriodContent(left, right) {
  return sameWorkspace(left?.draft, right?.draft) && sameWorkspace(left?.output, right?.output);
}
export function restorePeriodQueue(input = []) {
  if (!Array.isArray(input) || input.length > 1024) throw Error('Invalid period journal.');
  const unique = new Map();
  for (const value of input) {
    const draft = restorePeriodDraft(value),
      key = periodKey(draft);
    if (!key) throw Error('Invalid journal period.');
    unique.set(key, draft);
  }
  return [...unique.values()];
}
