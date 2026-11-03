import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from './engine.js';
import { periodKind } from './reading-period.js';
import { sameWorkspace } from './storage.js';
import { gasPointUnit, syncGasVersion } from './gas.js';
// Preserve stored fields that have not been explicitly edited after navigation.
export function mergePeriodEdits(stored, seed, edited) {
  if (sameWorkspace(seed, edited)) return structuredClone(stored);
  const point = [stored, seed, edited].every(
    (p) => p && typeof p.reading === 'string' && typeof p.temperature === 'string',
  );
  if (
    point &&
    gasPointUnit(stored) !== gasPointUnit(edited) &&
    (stored.reading.trim() || (stored.unit !== 'kg' && stored.temperature.trim())) &&
    !sameWorkspace(stored, seed)
  )
    throw Error('DRAFT_CONFLICT');
  if (
    Array.isArray(edited) &&
    Array.isArray(seed) &&
    Array.isArray(stored) &&
    edited.length === seed.length &&
    edited.length === stored.length
  )
    return edited.map((v, i) => mergePeriodEdits(stored[i], seed[i], v));
  if (
    edited &&
    seed &&
    stored &&
    typeof edited === 'object' &&
    typeof seed === 'object' &&
    typeof stored === 'object' &&
    !Array.isArray(edited)
  ) {
    const result = structuredClone(stored);
    for (const key of Object.keys(edited))
      if (!sameWorkspace(seed[key], edited[key]))
        result[key] = mergePeriodEdits(stored[key], seed[key], edited[key]);
    if (point) {
      if (edited.unit === undefined) delete result.unit;
      else result.unit = edited.unit;
    }
    if (result.gas && result.plantKey) syncGasVersion(result.gas, result.plantKey);
    return result;
  }
  if (
    typeof stored === 'string' &&
    stored.trim() &&
    !sameWorkspace(stored, seed) &&
    !sameWorkspace(stored, edited)
  )
    throw Error('DRAFT_CONFLICT');
  return structuredClone(edited);
}

export function emptyPeriodBaseline(draft) {
  const kind = periodKind(draft);
  if (kind === 'daily') return createDraft(draft.plantKey, draft.startDate, draft.endDate);
  return (kind === 'nightShift' ? createNightShiftDraft : createWorkingHoursDraft)(
    draft.plantKey,
    draft.startDate,
    draft.startTime,
    draft.endTime,
  );
}
