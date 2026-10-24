import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from '../engine.js';
import { changeDraftPeriod } from '../storage.js';
import { createDraftAutosave } from '../ui/drafts.js';
test('two-field period changes preserve the original observation without archiving the intermediate period', async (t) => {
  const savedGlobals = Object.fromEntries(
    ['document', 'window', 'sessionStorage'].map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  const elements = new Map(),
    tab = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id))
        elements.set(id, { hidden: false, textContent: '', addEventListener() {} });
      return elements.get(id);
    },
  };
  globalThis.window = { addEventListener() {} };
  globalThis.sessionStorage = {
    setItem(k, v) {
      tab.set(k, v);
    },
    getItem(k) {
      return tab.get(k) || null;
    },
    removeItem(k) {
      tab.delete(k);
    },
  };
  let workspace = {
    version: 4,
    autosaveLayout: 1,
    reportLinks: {},
    drafts: {
      JRE: createDraft('JRE', '2026-10-03', '2026-10-04'),
      UNILAND: createDraft('UNILAND'),
    },
    workingHours: Object.fromEntries(
      ['JRE', 'UNILAND'].map((p) => [p, createWorkingHoursDraft(p)]),
    ),
    nightShifts: Object.fromEntries(['JRE', 'UNILAND'].map((p) => [p, createNightShiftDraft(p)])),
  };
  workspace.drafts.JRE.rows[0].start[0] = '100';
  workspace.drafts.JRE.rows[0].end[0] = '110';
  let cloud = structuredClone(workspace),
    version = 1;
  const writes = [];
  const autosave = createDraftAutosave({
    read: () => workspace,
    apply: (w) => {
      workspace = w;
    },
    localSaved() {},
    request: async (_, options = {}) => {
      if (options.body) {
        writes.push(structuredClone(options.body));
        cloud = structuredClone(options.body.workspace);
        version++;
      }
      return { workspace: cloud, version, updated_at: '2026-10-24T01:00:00Z' };
    },
  });
  t.after(() => {
    autosave.reset(null);
    for (const [k, descriptor] of Object.entries(savedGlobals)) {
      if (descriptor) Object.defineProperty(globalThis, k, descriptor);
      else delete globalThis[k];
    }
  });
  autosave.reset({ id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352' });
  assert.equal(await autosave.flushAll(), true);
  const origin = structuredClone(workspace.drafts.JRE);
  workspace.drafts.JRE = changeDraftPeriod(
    workspace.drafts.JRE,
    '2026-10-03',
    '2026-10-05',
    origin,
  );
  autosave.changed({ periodOnly: true });
  workspace.drafts.JRE = changeDraftPeriod(
    workspace.drafts.JRE,
    '2026-10-04',
    '2026-10-05',
    origin,
  );
  autosave.changed({ periodOnly: true });
  assert.equal(await autosave.flushAll(), true);
  assert.equal(writes.length, 1);
  assert.deepEqual(
    writes[0].periods.map((d) => [d.startDate, d.endDate]),
    [['2026-10-03', '2026-10-04']],
  );
  assert.equal(writes[0].workspace.drafts.JRE.rows[0].start[0], '110');
  assert.equal(writes[0].periods[0].rows[0].end[0], '110');
});
