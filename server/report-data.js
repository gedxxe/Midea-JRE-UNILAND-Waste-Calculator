import { createDraft, calculateDraft } from '../engine.js';
import { restoreDrafts } from '../storage.js';
import { fail } from './http.js';
import pkg from '../package.json' with { type: 'json' };

export function reportSnapshot(input) {
  const plant = input?.plantKey;
  if (!['JRE', 'UNILAND'].includes(plant)) fail(400, 'INVALID_REPORT');
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
  if (!result.success) fail(422, 'INCOMPLETE_REPORT');
  return {
    draft,
    engineVersion: pkg.version,
    output: {
      reportText: result.reportSectionText,
      worksheetText: result.worksheetText,
      checks: result.checks,
      gas: result.gasResults,
    },
  };
}
