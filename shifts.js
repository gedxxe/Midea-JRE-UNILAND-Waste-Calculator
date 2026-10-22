import { moveUtilityPeriod, seedUtilityReadings, utilityConflicts } from './utility-periods.js';
import { createWorkingHoursDraft, createNightShiftDraft } from './engine.js';
import { isNightShift, workPeriodError, validTime } from './reading-period.js';
import { shiftDate, scaledReading } from './numbers.js';
import { emptyAdditionalReadings } from './additional-readings.js';

const samePoint = (a, side, b, key) =>
  a.plantKey === b.plantKey &&
  Boolean(a[side + 'Date']) &&
  validTime(a[side + 'Time']) &&
  a[side + 'Date'] === b[key + 'Date'] &&
  a[side + 'Time'] === b[key + 'Time'];
function copyPoint(target, side, source, key) {
  target.rows.forEach((row, i) => {
    row[side] = [...source.rows[i][key]];
  });
  if (source.additionalReadings || target.additionalReadings) {
    target.additionalReadings ??= emptyAdditionalReadings();
    target.additionalReadings.forEach((row, i) => {
      row[side] = source.additionalReadings?.[i]?.[key] || '';
    });
  }
  target.importIssues = [
    ...new Map(
      [...(target.importIssues || []), ...(source.importIssues || [])].map((x) => [
        JSON.stringify(x),
        structuredClone(x),
      ]),
    ).values(),
  ];
  target.isExample = target.isExample || source.isExample;
}
export function emptyNightShifts() {
  return { JRE: createNightShiftDraft('JRE'), UNILAND: createNightShiftDraft('UNILAND') };
}
// Only identical timestamps share readings. Confirmation flags belong to the period.
export function syncShiftReading(source, companion) {
  const next = structuredClone(companion);
  for (const side of ['start', 'end'])
    for (const key of ['start', 'end'])
      if (samePoint(next, side, source, key)) copyPoint(next, side, source, key);
  return moveUtilityPeriod(next, companion, [source, companion]);
}
export function changeShiftPair(day, night, kind, date, startTime, endTime, origin = []) {
  if (day.plantKey !== night.plantKey) throw Error('Shift factories must match.');
  const morning = kind === 'nightShift' ? day.startTime : startTime;
  const evening = kind === 'nightShift' ? startTime : endTime;
  const nextMorning = kind === 'nightShift' ? endTime : night.endTime;
  const nextDay = createWorkingHoursDraft(day.plantKey, date, morning, evening);
  const nextNight = createNightShiftDraft(day.plantKey, date, evening, nextMorning);
  for (const target of [nextDay, nextNight]) {
    const previous = isNightShift(target) ? night : day;
    target.isExample = previous.isExample;
    for (const side of ['start', 'end']) {
      let found = false;
      for (const source of [day, night, ...origin]) {
        if (source.plantKey !== target.plantKey) continue;
        const key = ['start', 'end'].find((key) => samePoint(target, side, source, key));
        if (key) {
          copyPoint(target, side, source, key);
          found = true;
          break;
        }
      }
      if (!found && !previous[side + 'Date'] && previous[side + 'Time'] === target[side + 'Time'])
        copyPoint(target, side, previous, side);
    }
    moveUtilityPeriod(target, previous, [day, night, ...origin]);
    if (
      previous.startDate === target.startDate &&
      previous.endDate === target.endDate &&
      previous.startTime === target.startTime &&
      previous.endTime === target.endTime
    )
      target.rows.forEach((row, i) => {
        row.inactive = previous.rows[i].inactive;
      });
  }
  return reconcileShiftPair(nextDay, nextNight);
}
export function nextShiftPair(day, night) {
  if (workPeriodError(day) || workPeriodError(night) || day.startDate !== night.startDate)
    throw Error('Check both shift dates and times before moving to the next day.');
  const date = shiftDate(day.startDate, 1);
  return changeShiftPair(day, night, 'workingHours', date, night.endTime, day.endTime);
}
const equivalent = (a, b) =>
  a === b || (scaledReading(a) !== null && scaledReading(a) === scaledReading(b));
// Restore may merge missing shared cells, but conflicting saved observations are never overwritten.
export function reconcileShiftPair(day, night) {
  const a = structuredClone(day),
    b = structuredClone(night);
  for (const side of ['start', 'end'])
    for (const key of ['start', 'end']) {
      if (!samePoint(a, side, b, key)) continue;
      const merge = (x, y) => {
        if (x.trim() && y.trim() && !equivalent(x, y)) throw Error('shiftConflict');
        return x.trim() ? x : y;
      };
      a.rows.forEach((row, i) =>
        row[side].forEach((v, j) => {
          const value = merge(v, b.rows[i][key][j]);
          row[side][j] = b.rows[i][key][j] = value;
        }),
      );
      if (a.additionalReadings || b.additionalReadings) {
        a.additionalReadings ??= emptyAdditionalReadings();
        b.additionalReadings ??= emptyAdditionalReadings();
        a.additionalReadings.forEach((row, i) => {
          const value = merge(row[side], b.additionalReadings[i][key]);
          row[side] = b.additionalReadings[i][key] = value;
        });
      }
    }
  if (utilityConflicts([a, b]).length) throw Error('shiftConflict');
  const [dayResult, nightResult] = seedUtilityReadings([a, b]);
  return { day: dayResult, night: nightResult };
}
