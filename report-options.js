import { utilityConflicts, refillConflicts } from './utility-periods.js';
import { calculateDraft, generateFullIndonesiaReport } from './engine.js';
import { periodKind, observationTime } from './reading-period.js';
import { dayDiff, formatReportDate } from './numbers.js';
import { electricityConflicts } from './observations.js';

export const REPORT_OPTIONS = {
  daily: ['daily'],
  dailyAfter: ['daily', 'workingHours'],
  all: ['daily', 'workingHours', 'nightShift'],
  after: ['workingHours'],
  night: ['nightShift'],
};
export const selectionForMode = (mode) =>
  mode === 'workingHours' ? 'after' : mode === 'nightShift' ? 'night' : 'daily';
const labels = { daily: '24 HOURS', workingHours: 'AFTER PRODUCTION', nightShift: 'NIGHT SHIFT' };
const samePoint = (a, side, b, key) =>
  a[side + 'Date'] === b[key + 'Date'] && observationTime(a, side) === observationTime(b, key);
export function selectReport(periods, selection, calculated = {}) {
  const kinds = REPORT_OPTIONS[selection];
  if (!kinds) throw Error('Unknown report option.');
  const selected = kinds.map((kind) => periods.find((d) => periodKind(d) === kind));
  if (selected.some((d) => !d)) return { success: false, error: 'selectionIncomplete', text: '' };
  const parts = selected.map((draft) => ({
    draft,
    report: calculated[periodKind(draft)] || calculateDraft(draft),
  }));
  const result = { selection, parts, success: false, text: '' };
  if (parts.some((p) => !p.report.success)) return { ...result, error: 'selectionIncomplete' };
  if (kinds.length > 1) {
    const daily = selected[0],
      after = selected[1],
      night = selected[2];
    if (
      selected.some((d) => d.plantKey !== daily.plantKey) ||
      dayDiff(daily.startDate, daily.endDate) !== 1 ||
      !samePoint(daily, 'start', after, 'start') ||
      after.startDate !== after.endDate ||
      (night &&
        (!samePoint(after, 'end', night, 'start') || !samePoint(daily, 'end', night, 'end')))
    )
      return { ...result, error: 'selectionPeriod' };
    if (refillConflicts(selected)) return { ...result, error: 'selectionRefills' };
    if (utilityConflicts(selected).length) return { ...result, error: 'selectionReadings' };
    if (electricityConflicts(selected).length) return { ...result, error: 'selectionReadings' };
  }
  if (kinds.length === 1)
    return { ...result, success: true, text: parts[0].report.reportSectionText };
  const first = parts[0].report;
  const sections = parts.map(
    ({ draft, report }) =>
      labels[periodKind(draft)] + ':\n' + report.reportSectionText.split('\n').slice(1).join('\n'),
  );
  return {
    ...result,
    success: true,
    text:
      first.mainText.slice(0, 2) +
      ' ' +
      first.plantKey +
      ' (' +
      formatReportDate(first.startDate) +
      ')\n\n' +
      sections.join('\n\n'),
  };
}
export function combineReportSelections(jre, uniland) {
  if (!jre?.success || !uniland?.success || jre.selection !== uniland.selection)
    throw Error('selectionBoth');
  for (let i = 0; i < jre.parts.length; i++) {
    const a = jre.parts[i].draft,
      b = uniland.parts[i].draft;
    if (
      a.startDate !== b.startDate ||
      a.endDate !== b.endDate ||
      observationTime(a, 'start') !== observationTime(b, 'start') ||
      observationTime(a, 'end') !== observationTime(b, 'end')
    )
      throw Error('selectionPeriod');
  }
  if (jre.parts.length === 1)
    return generateFullIndonesiaReport(jre.parts[0].report, uniland.parts[0].report);
  return (
    '[INDONESIA FACTORY ENERGY REPORT]\n\nSummary situation:\n' + jre.text + '\n\n' + uniland.text
  );
}
