import { observationTime, validTime, periodKind } from './reading-period.js';
import { validDate, scaledReading } from './numbers.js';
import { emptyAdditionalReadings } from './additional-readings.js';

const point = (draft, side) =>
  validDate(draft[side + 'Date']) && validTime(observationTime(draft, side))
    ? draft.plantKey + '|' + draft[side + 'Date'] + '|' + observationTime(draft, side)
    : null;
const identity = (value) =>
  scaledReading(value) === null ? value.trim() : scaledReading(value).toString();
function fields(draft, side) {
  const result = [];
  draft.rows.forEach((row, ri) =>
    row[side].forEach((value, mi) => result.push({ ri, mi, side, value })),
  );
  if (draft.plantKey === 'JRE')
    draft.additionalReadings?.forEach((row, index) =>
      result.push({ index, side, value: row[side] }),
    );
  return result;
}
function provenance(target, source) {
  if (source.isExample) target.isExample = true;
  if (source.importIssues?.length)
    target.importIssues = [
      ...new Map(
        [...(target.importIssues || []), ...source.importIssues].map((i) => [
          JSON.stringify(i),
          structuredClone(i),
        ]),
      ).values(),
    ];
}
function valueAt(draft, field, side) {
  return field.index === undefined
    ? draft.rows[field.ri][side][field.mi]
    : draft.additionalReadings?.[field.index]?.[side] || '';
}
function put(draft, field, side, value) {
  if (field.index === undefined) draft.rows[field.ri][side][field.mi] = value;
  else {
    draft.additionalReadings ??= emptyAdditionalReadings();
    draft.additionalReadings[field.index][side] = value;
  }
}
// Copy only the cells the operator edited. Flags and daily utilities belong to their periods.
export function shareElectricityEdits(periods, kind, edits) {
  const next = periods.map((d) => structuredClone(d));
  const source = next.find((d) => periodKind(d) === kind);
  if (!source) return next;
  for (const field of edits) {
    const stamp = point(source, field.side);
    if (!stamp) continue;
    const value = valueAt(source, field, field.side);
    for (const target of next)
      for (const side of ['start', 'end'])
        if (point(target, side) === stamp) {
          put(target, field, side, value);
          if (value.trim()) provenance(target, source);
        }
  }
  return next;
}
// Old Daily and shift drafts were independent. Fill only unambiguous empty cells.
export function seedElectricity(periods) {
  const next = periods.map((d) => structuredClone(d));
  for (const target of next)
    for (const side of ['start', 'end']) {
      const stamp = point(target, side);
      if (!stamp) continue;
      const slots = fields(target, side);
      if (target.plantKey === 'JRE' && !target.additionalReadings)
        for (let index = 0; index < 4; index++) slots.push({ index, side, value: '' });
      for (const field of slots) {
        if (field.value.trim()) continue;
        const candidates = [];
        const sources = [];
        for (const source of periods)
          for (const key of ['start', 'end'])
            if (point(source, key) === stamp) {
              const value = valueAt(source, field, key);
              if (value.trim()) {
                candidates.push(value);
                sources.push(source);
              }
            }
        if (new Set(candidates.map(identity)).size === 1) {
          put(target, field, side, candidates[0]);
          sources.forEach((source) => provenance(target, source));
        }
      }
    }
  return next;
}
export function electricityConflicts(periods) {
  const conflicts = [],
    seen = new Set();
  for (const draft of periods)
    for (const side of ['start', 'end']) {
      const stamp = point(draft, side);
      if (!stamp) continue;
      for (const field of fields(draft, side)) {
        const id =
          stamp + '|' + (field.index === undefined ? field.ri + ':' + field.mi : 'T' + field.index);
        if (seen.has(id)) continue;
        seen.add(id);
        const candidates = [];
        for (const source of periods)
          for (const key of ['start', 'end'])
            if (point(source, key) === stamp) {
              const value = valueAt(source, field, key);
              if (value.trim()) candidates.push(value);
            }
        if (new Set(candidates.map(identity)).size > 1)
          conflicts.push({
            ...field,
            date: draft[side + 'Date'],
            time: observationTime(draft, side),
          });
      }
    }
  return conflicts;
}
export function columnEdits(draft, sides = ['start', 'end'], suppliedRows) {
  return sides.flatMap((side) =>
    fields(draft, side)
      .filter((f) => f.index !== undefined || !suppliedRows || suppliedRows.includes(f.ri))
      .map(({ value, ...field }) => field),
  );
}
