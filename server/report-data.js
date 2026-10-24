import { UTILITY_LAYOUT } from '../utility-periods.js';
import { isWorkingHours } from '../reading-period.js';
import { createDraft, calculateDraft } from '../engine.js';
import { restoreDrafts } from '../storage.js';
import { fail } from './http.js';
import pkg from '../package.json' with { type: 'json' };
import { JRE_METER_LAYOUT, UNILAND_METER_LAYOUT } from '../meter-layout.js';

export function reportSnapshot(input, { allowPartial = false } = {}) {
  const plant = input?.plantKey;
  if (!['JRE', 'UNILAND'].includes(plant)) fail(400, 'INVALID_REPORT');
  // A stale client must reload and review the new grouping before saving a report.
  if (plant === 'JRE' && input.meterLayout !== JRE_METER_LAYOUT) fail(409, 'METER_LAYOUT_CHANGED');
  if (plant === 'UNILAND' && input.meterLayout !== UNILAND_METER_LAYOUT)
    fail(409, 'METER_LAYOUT_CHANGED');
  if (isWorkingHours(input) && input.utilityLayout !== UTILITY_LAYOUT)
    fail(409, 'METER_LAYOUT_CHANGED');
  let draft;
  try {
    draft = restoreDrafts(
      JSON.stringify({
        version: 4,
        drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND'), [plant]: input },
      }),
    )[plant];
  } catch {
    fail(400, 'INVALID_REPORT');
  }
  const result = calculateDraft(draft);
  if (!result.success && !allowPartial) fail(422, 'INCOMPLETE_REPORT');
  return {
    draft,
    engineVersion: pkg.version,
    ...(allowPartial
      ? {
          autosaveLayout: 1,
          complete: result.success,
          periodValid: !result.issues.some(
            (issue) => issue.code.startsWith('DATE_') && issue.level === 'ERROR',
          ),
          completedRows: result.completeRows,
          totalRows: result.calculatedRows.length,
        }
      : {}),
    output: {
      reportText: result.reportSectionText,
      worksheetText: result.worksheetText,
      checks: result.checks,
      gas: result.gasResults,
      water: result.waterResult,
      additionalReadings: result.additionalReadings,
    },
  };
}
