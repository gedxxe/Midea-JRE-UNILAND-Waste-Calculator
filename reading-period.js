import { validDate, formatReportDate, formatNumber, dayDiff } from './numbers.js';
export const WORKING_HOURS = 'workingHours';
export const NIGHT_SHIFT = 'nightShift';
export const periodKind = (draft) => draft?.periodKind || draft?.kind || 'daily';
export const isNightShift = (draft) => periodKind(draft) === NIGHT_SHIFT;
// Shared predicate for electricity-only periods; the persisted Day kind remains compatible.
export const isWorkingHours = (draft) => [WORKING_HOURS, NIGHT_SHIFT].includes(periodKind(draft));
export const validTime = (value) =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function workMinutes(draft) {
  if (!validTime(draft.startTime) || !validTime(draft.endTime)) return null;
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const days =
    draft.startDate && draft.endDate
      ? dayDiff(draft.startDate, draft.endDate)
      : isNightShift(draft)
        ? 1
        : 0;
  return days === null ? null : days * 1440 + minutes(draft.endTime) - minutes(draft.startTime);
}
export function workPeriodError(draft) {
  const days = dayDiff(draft.startDate, draft.endDate),
    night = isNightShift(draft);
  if (!validDate(draft.startDate) || days !== (night ? 1 : 0))
    return night
      ? 'Night shift ends on the following morning.'
      : 'Use one valid date for both Day readings.';
  const minutes = workMinutes(draft);
  if (minutes === null) return 'Enter both reading times in HH:MM format.';
  if (minutes <= 0 || minutes >= 1440)
    return 'Check the reading times. A shift must be shorter than 24 hours.';
  return null;
}
export function workPeriodTitle(draft) {
  return (
    formatReportDate(draft.startDate) +
    ' / ' +
    (isNightShift(draft) ? 'NIGHT SHIFT' : 'AFTER PRODUCTION') +
    ' / ' +
    draft.startDate +
    ' ' +
    (draft.startTime || '?') +
    ' to ' +
    draft.endDate +
    ' ' +
    (draft.endTime || '?') +
    ' WIB'
  );
}
export function observationTime(draft, side) {
  return isWorkingHours(draft) ? draft[side + 'Time'] : '08:00';
}
export function observationLabel(draft, side) {
  return (
    (draft[side + 'Date'] || '-') +
    (isWorkingHours(draft) ? ' ' + (observationTime(draft, side) || '-') + ' WIB' : '')
  );
}
export function reportLinkKey(draft) {
  return draft.plantKey + (isNightShift(draft) ? 'Night' : isWorkingHours(draft) ? 'Work' : '');
}
export function graphPeriodText(record) {
  return isWorkingHours(record)
    ? record.startDate +
        ' ' +
        record.startTime +
        ' → ' +
        (isNightShift(record) ? record.readingEndDate + ' ' : '') +
        record.endTime +
        ' WIB (' +
        formatNumber(record.minutes / 60) +
        ' hours)'
    : record.startDate +
        ' 08:00 → ' +
        record.endDate +
        ' 08:00 (' +
        record.days +
        ' ' +
        (record.days === 1 ? 'day' : 'days') +
        ')';
}
