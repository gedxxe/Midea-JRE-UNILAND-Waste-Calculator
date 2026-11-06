import { validDate } from './numbers.js';
import { observationTime, validTime } from './reading-period.js';

export function beforeMeterSlotReporting(row, draft, meter) {
  const from = row?.meterReportFrom?.[meter];
  const time = observationTime(draft, 'start');
  return (
    !!from && validDate(draft.startDate) && validTime(time) && draft.startDate + 'T' + time < from
  );
}

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
