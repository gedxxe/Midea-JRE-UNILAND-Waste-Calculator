import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePeriodEdits } from '../period-document.js';
import { createDraft } from '../engine.js';
test('loading a previously filled date retains known readings and applies only edits made during its load', () => {
  const stored = createDraft('JRE', '2026-10-29', '2026-10-30');
  stored.rows[0].start[0] = '123';
  stored.rows[0].end[0] = '140';
  const seed = createDraft('JRE', '2026-10-29', '2026-10-30'),
    edited = structuredClone(seed);
  edited.rows[1].end[0] = '5';
  const result = mergePeriodEdits(stored, seed, edited);
  assert.equal(result.rows[0].start[0], '123');
  assert.equal(result.rows[0].end[0], '140');
  assert.equal(result.rows[1].end[0], '5');
  assert.equal(stored.rows[1].end[0], '');
});
test('deliberate edits and clears survive hydration without treating unloaded blanks as clears', () => {
  const stored = { reading: '100', other: '80' },
    seed = { reading: '100', other: '' },
    edited = { reading: '', other: '' };
  assert.deepEqual(mergePeriodEdits(stored, seed, edited), { reading: '', other: '80' });
});

import { planPeriodAutosaves } from '../server/period-autosaves.js';
import { reportSnapshot } from '../server/report-data.js';
test('server rejects navigating blank local fields onto an archived document without its observed version', async () => {
  const filled = createDraft('JRE', '2026-10-29', '2026-10-30');
  filled.rows[0].start[0] = '100';
  filled.rows[0].end[0] = '125';
  const snapshot = reportSnapshot(filled, { allowPartial: true });
  const client = {
    query: async () => ({
      rows: [
        {
          id: 'stored',
          plant: 'JRE',
          report_kind: 'daily',
          start_date: filled.startDate,
          end_date: filled.endDate,
          snapshot,
          version: 8,
          base_revision: 0,
          checkpoint_revision: 0,
        },
      ],
    }),
  };
  const blank = createDraft('JRE', filled.startDate, filled.endDate);
  await assert.rejects(
    planPeriodAutosaves(client, 'owner', [blank], {
      previous: { drafts: { JRE: createDraft('JRE', '2026-10-27', '2026-10-28') } },
    }),
    (e) => e.message === 'DRAFT_CONFLICT',
  );
  assert.equal(snapshot.draft.rows[0].start[0], '100');
  const allowed = await planPeriodAutosaves(client, 'owner', [blank], {
    previous: {},
    versions: { 'JRE:daily:2026-10-29:2026-10-30': 8 },
  });
  assert.equal(allowed.changes.length, 1);
});

test('offline edits conflicting with previously unseen stored readings stop instead of overwriting', () => {
  assert.throws(
    () => mergePeriodEdits({ reading: '200' }, { reading: '' }, { reading: '150' }),
    /DRAFT_CONFLICT/,
  );
});

test('opening unchanged stored readings does not rewrite output with the current calculator', async () => {
  const draft = createDraft('JRE', '2026-10-29', '2026-10-30');
  draft.rows[0].start[0] = '100';
  draft.rows[0].end[0] = '125';
  const snapshot = reportSnapshot(draft, { allowPartial: true });
  snapshot.output.reportText = 'Preserved historical output';
  const client = {
    query: async () => ({
      rows: [
        {
          id: 'stored',
          plant: 'JRE',
          report_kind: 'daily',
          start_date: draft.startDate,
          end_date: draft.endDate,
          snapshot,
          version: 1,
          base_revision: 0,
          checkpoint_revision: 0,
        },
      ],
    }),
  };
  const plan = await planPeriodAutosaves(client, 'owner', [draft]);
  assert.equal(plan.changes.length, 0);
  assert.equal(snapshot.output.reportText, 'Preserved historical output');
  const edited = structuredClone(draft);
  edited.rows[0].end[0] = '130';
  assert.equal((await planPeriodAutosaves(client, 'owner', [edited])).changes.length, 1);
  assert.equal(snapshot.output.reportText, 'Preserved historical output');
});
