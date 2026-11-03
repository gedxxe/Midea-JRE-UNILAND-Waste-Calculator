import { observationTime, periodKind, validTime } from './reading-period.js';
import { validDate, scaledReading } from './numbers.js';
import { gasPoint, gasPointUnit, syncGasVersion, copyGasPoint } from './gas.js';

export const UTILITY_LAYOUT = 1;
export const hasUtilityData = (d) =>
  d.utilities.some((v) => v.value.trim() || v.note.trim()) ||
  Boolean(d.water?.start.trim() || d.water?.end.trim()) ||
  d.gas.entries.some((e) => e.enabled || e.refills.length || hasPoint(e.start) || hasPoint(e.end));
const sides = ['start', 'end'];
const stamp = (d, side) =>
  validDate(d[side + 'Date']) && validTime(observationTime(d, side))
    ? [d.plantKey, d[side + 'Date'], observationTime(d, side)].join('|')
    : null;
const numeric = (value, temperature = false) => {
  const text = value.trim();
  if (temperature && /^[+-]?\d+(?:[.,]\d{1,6})?$/.test(text))
    return String(Number(text.replace(',', '.')));
  return scaledReading(text)?.toString() ?? text;
};
const pointId = (p) =>
  JSON.stringify([
    gasPointUnit(p),
    numeric(p.reading),
    p.unit === 'kg' ? '' : numeric(p.temperature, true),
  ]);
const hasPoint = (p) => Boolean(p?.reading.trim() || (p?.unit !== 'kg' && p?.temperature.trim()));
const legacyWater = (d) => !d.water && Boolean(d.utilities[4].value.trim());
function matches(periods, target, side) {
  const time = stamp(target, side);
  if (!time) return [];
  return periods.flatMap((d) =>
    sides.filter((key) => stamp(d, key) === time).map((key) => ({ draft: d, side: key })),
  );
}

// Seeding never replaces nonempty observations, enables a tank or invents manual consumption.
export function seedUtilityReadings(periods) {
  const next = structuredClone(periods);
  for (const target of next)
    for (const side of sides) {
      const sources = matches(periods, target, side);
      if (target.water && !target.water[side].trim()) {
        const values = sources.map((s) => s.draft.water?.[s.side] || '').filter((v) => v.trim());
        if (new Set(values.map((v) => numeric(v))).size === 1) target.water[side] = values[0];
      }
      target.gas.entries.forEach((entry, index) => {
        if (hasPoint(entry[side])) return;
        const points = sources
          .filter((s) => s.draft.gas.entries[index].enabled)
          .map((s) =>
            copyGasPoint(s.draft.gas.entries[index][s.side], s.draft.gas, s.draft.plantKey, index),
          )
          .filter(hasPoint);
        if (new Set(points.map(pointId)).size === 1) entry[side] = { ...points[0] };
      });
    }
  next.forEach((d) => syncGasVersion(d.gas, d.plantKey));
  return next;
}

export function shareUtilityEdits(periods, kind, edits) {
  const next = structuredClone(periods),
    source = next.find((d) => periodKind(d) === kind);
  if (!source) return next;
  for (const edit of edits) {
    if (!sides.includes(edit.side)) continue;
    for (const { draft: target, side } of matches(next, source, edit.side)) {
      if (edit.kind === 'water' && !legacyWater(target)) {
        target.water ??= { start: '', end: '' };
        target.water[side] = source.water?.[edit.side] || '';
      } else if (edit.kind === 'gas' && ['reading', 'temperature', 'unit'].includes(edit.field)) {
        const from = source.gas.entries[edit.index][edit.side],
          to = target.gas.entries[edit.index][side];
        // Choosing a unit or editing temperature must not erase a retained observation.
        if (
          hasPoint(to) &&
          (edit.field === 'unit' ||
            (gasPointUnit(from) !== gasPointUnit(to) && edit.field !== 'reading'))
        )
          continue;
        if (edit.field === 'unit' || gasPointUnit(from) !== gasPointUnit(to))
          target.gas.entries[edit.index][side] = copyGasPoint(
            from,
            source.gas,
            source.plantKey,
            edit.index,
          );
        else to[edit.field] = from[edit.field];
      }
    }
  }
  next.forEach((d) => syncGasVersion(d.gas, d.plantKey));
  return next;
}

export function utilityConflicts(periods) {
  const conflicts = [],
    seen = new Set();
  for (const draft of periods)
    for (const side of sides) {
      const time = stamp(draft, side);
      if (!time || seen.has(time)) continue;
      seen.add(time);
      const sources = matches(periods, draft, side);
      const water = sources.map((s) => s.draft.water?.[s.side] || '').filter((v) => v.trim());
      if (new Set(water.map((v) => numeric(v))).size > 1) conflicts.push({ kind: 'water', side });
      draft.gas.entries.forEach((_, index) => {
        const points = sources
          .filter((s) => s.draft.gas.entries[index].enabled)
          .map((s) => s.draft.gas.entries[index][s.side])
          .filter(hasPoint);
        if (new Set(points.map(pointId)).size > 1) conflicts.push({ kind: 'gas', index, side });
      });
    }
  return conflicts;
}

// Events have no timestamps: keep them with their period and verify bundles, never allocate them by guess.
export function refillConflicts(periods) {
  const daily = periods.find((d) => periodKind(d) === 'daily'),
    after = periods.find((d) => periodKind(d) === 'workingHours'),
    night = periods.find((d) => periodKind(d) === 'nightShift');
  if (!daily || !after) return false;
  const eventId = (event) => JSON.stringify([pointId(event.before), pointId(event.after)]);
  return daily.gas.entries.some((entry, i) => {
    const day = after.gas.entries[i],
      end = night?.gas.entries[i];
    if (!entry.enabled || !day.enabled || (night && !end.enabled)) return false;
    const events = [...day.refills, ...(end?.refills || [])].map(eventId),
      all = entry.refills.map(eventId);
    return (night && events.length !== all.length) || events.some((event, j) => event !== all[j]);
  });
}

// Date/time changes retain only exact observations. Manual amounts and untimed refills stay period-scoped.
export function moveUtilityPeriod(target, previous, sources) {
  const periodSource = [previous, ...sources].find(
    (candidate) =>
      candidate.plantKey === target.plantKey &&
      periodKind(candidate) === periodKind(target) &&
      sides.every(
        (side) =>
          (!candidate[side + 'Date'] || candidate[side + 'Date'] === target[side + 'Date']) &&
          observationTime(candidate, side) === observationTime(target, side),
      ),
  );
  if (periodSource) {
    target.utilities = structuredClone(periodSource.utilities);
    if (periodSource.water) target.water = { ...periodSource.water };
    target.gas = structuredClone(periodSource.gas);
  } else {
    target.gas.entries.forEach((entry, i) => {
      entry.enabled = previous.gas.entries[i].enabled;
    });
    if (previous.water) target.water = { start: '', end: '' };
  }
  for (const side of sides) {
    const candidates = matches([previous, ...sources], target, side);
    if (
      !previous[side + 'Date'] &&
      observationTime(previous, side) === observationTime(target, side)
    )
      candidates.unshift({ draft: previous, side });
    if (
      !target.water &&
      !legacyWater(previous) &&
      candidates.some((s) => s.draft.water?.[s.side]?.trim())
    )
      target.water = { start: '', end: '' };
    if (target.water) {
      const own = candidates.find((s) => s.draft === previous && s.draft.water?.[s.side]?.trim());
      const values = candidates.map((s) => s.draft.water?.[s.side] || '').filter((v) => v.trim());
      target.water[side] = own
        ? own.draft.water[own.side]
        : new Set(values.map((v) => numeric(v))).size === 1
          ? values[0]
          : '';
    }
    target.gas.entries.forEach((entry, i) => {
      const points = candidates
        .map((s) => ({ s, p: s.draft.gas.entries[i][s.side] }))
        .filter(({ p }) => hasPoint(p));
      const own = points.find(({ s }) => s.draft === previous);
      entry[side] = own
        ? copyGasPoint(own.p, own.s.draft.gas, own.s.draft.plantKey, i)
        : new Set(points.map(({ p }) => pointId(p))).size === 1
          ? copyGasPoint(points[0].p, points[0].s.draft.gas, points[0].s.draft.plantKey, i)
          : gasPoint(i === 3 ? 'R32' : undefined, target.plantKey);
    });
  }
  syncGasVersion(target.gas, target.plantKey);
  return target;
}
