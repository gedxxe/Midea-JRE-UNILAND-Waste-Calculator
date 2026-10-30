import { validDate, dayDiff, shiftDate } from './numbers.js';

export function monthRange(month) {
  if (!/^20\d{2}-\d{2}$/.test(month || '') || !validDate(month + '-01')) return null;
  const [year, number] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { start: month + '-01', end: month + '-' + days, days };
}
export function adjacentMonth(month, offset) {
  if (!monthRange(month)) return '';
  const [year, number] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
  return monthRange(next) ? next : '';
}
// Attribute the full saved total to its report-start month. Never prorate a period.
export function monthlyPeriods(month, records) {
  const range = monthRange(month);
  if (!range) return null;
  const inMonth = records.filter((r) => r.startDate >= range.start && r.startDate <= range.end);
  const valid = inMonth.filter(
    (r) => !r.overlap && !r.superseded && !r.noValues && dayDiff(r.startDate, r.endDate) > 0,
  );
  const ambiguous = (r) =>
    valid.some(
      (other) => other !== r && other.startDate < r.endDate && r.startDate < other.endDate,
    );
  const usable = valid.filter((r) => !ambiguous(r));
  const cells = [];
  for (let day = 0; day < range.days;) {
    const date = shiftDate(range.start, day);
    const record = usable.find((r) => r.startDate === date) || null;
    const span = record ? Math.min(dayDiff(record.startDate, record.endDate), range.days - day) : 1;
    cells.push({ date, span, record });
    day += span;
  }
  return {
    ...range,
    cells,
    excluded: inMonth.filter((r) => !usable.includes(r)),
    count: usable.length,
  };
}
