import { validDate } from './numbers.js';

// A reporting rule, not an inferred installation time or a measured observation.
export function beforeMeterReporting(row, date) {
  return !!row?.reportFrom && validDate(date) && date < row.reportFrom;
}
export function emptyMeterRow(row, startDate = '', endDate = '') {
  return {
    start: row.factors.map(() => (beforeMeterReporting(row, startDate) ? '0' : '')),
    end: row.factors.map(() => (beforeMeterReporting(row, endDate) ? '0' : '')),
    inactive: false,
  };
}
