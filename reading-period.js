import { validDate, formatReportDate, formatNumber } from './numbers.js';

export const WORKING_HOURS = 'workingHours';
export const periodKind = (draft) => draft?.periodKind || 'daily';
export const isWorkingHours = (draft) => periodKind(draft) === WORKING_HOURS;
export const validTime = (value) =>
  typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function workMinutes(draft) {
  if (!validTime(draft.startTime) || !validTime(draft.endTime)) return null;
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return minutes(draft.endTime) - minutes(draft.startTime);
}
export function workPeriodError(draft) {
  if (!validDate(draft.startDate) || draft.startDate !== draft.endDate)
    return 'Use one valid date for both working-hours readings.';
  const minutes = workMinutes(draft);
  if (minutes === null) return 'Enter both reading times in HH:MM format.';
  if (minutes <= 0) return 'After-work time must be later than morning time on the same date.';
  return null;
}
export function workPeriodTitle(draft) {
  return `${formatReportDate(draft.startDate)} - WORKING HOURS ${draft.startTime || '?'} to ${draft.endTime || '?'} WIB`;
}
export function observationTime(draft, side) {
  return isWorkingHours(draft) ? draft[side + 'Time'] : '08:00';
}
export function observationLabel(draft, side) {
  return `${draft[side + 'Date'] || '-'}${isWorkingHours(draft) ? ' ' + (observationTime(draft, side) || '-') + ' WIB' : ''}`;
}
export function reportLinkKey(draft) {
  return draft.plantKey + (isWorkingHours(draft) ? 'Work' : '');
}
export function graphPeriodText(record) {
  return record.periodKind === WORKING_HOURS
    ? `${record.startDate} ${record.startTime} → ${record.endTime} WIB (${formatNumber(record.minutes / 60)} hours)`
    : `${record.startDate} 08:00 → ${record.endDate} 08:00 (${record.days} ${record.days === 1 ? 'day' : 'days'})`;
}
