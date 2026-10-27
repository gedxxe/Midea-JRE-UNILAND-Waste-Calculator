import test from 'node:test';
import assert from 'node:assert/strict';
import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from '../engine.js';
import { changeDraftPeriod, restoreWorkspace, STORAGE_KEY } from '../storage.js';
import { createDraftAutosave } from '../ui/drafts.js';
async function harness(t, { tombstone = false, journal = false, journalUnchanged = false } = {}) {
  const savedGlobals = Object.fromEntries(
    ['document', 'window', 'sessionStorage', 'confirm'].map((k) => [
      k,
      Object.getOwnPropertyDescriptor(globalThis, k),
    ]),
  );
  const elements = new Map(),
    tab = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id))
        elements.set(id, {
          hidden: false,
          textContent: '',
          events: {},
          addEventListener(type, handler) {
            this.events[type] = handler;
          },
        });
      return elements.get(id);
    },
  };
  globalThis.window = { addEventListener() {} };
  globalThis.confirm = () => true;
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
  if (journal) workspace = restoreWorkspace(JSON.stringify(workspace));
  const initial = structuredClone(workspace);
  let cloud = tombstone ? null : structuredClone(workspace),
    version = journal ? 3 : tombstone ? 7 : 1;
  const writes = [],
    gates = {};
  const autosave = createDraftAutosave({
    read: () => workspace,
    apply: (w) => {
      workspace = w || structuredClone(initial);
    },
    localSaved() {},
    request: async (_, options = {}) => {
      if (options.body) {
        writes.push(structuredClone(options.body));
        if (options.body.workspace === null && gates.holdDelete)
          await new Promise((resolve) => {
            gates.releaseDelete = resolve;
          });
        if (options.body.baseVersion !== version) {
          if (!journal || !journalUnchanged) throw Error('DRAFT_CONFLICT');
          return {
            version,
            updated_at: '2026-10-24T01:00:00Z',
            unchanged: true,
            recordsChanged: false,
          };
        }
        cloud = structuredClone(options.body.workspace);
        version++;
      }
      if (!options.body && gates.holdRead)
        await new Promise((resolve) => {
          gates.releaseRead = resolve;
        });
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
  if (journal) {
    const archived = createDraft('JRE', '2026-10-01', '2026-10-02');
    archived.rows[0].start[0] = '500';
    tab.set(
      STORAGE_KEY + '_b89c2b90-bbee-4a90-bd68-a0e9fc761352',
      JSON.stringify({
        ...workspace,
        tabRecovery: { version: 1, pending: true, pendingPeriods: [archived] },
      }),
    );
  }
  autosave.reset({ id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352' });
  assert.equal(await autosave.flushAll(), !journal || journalUnchanged);
  return {
    autosave,
    writes,
    read: () => workspace,
    setDraft: (d) => {
      workspace.drafts.JRE = d;
    },
    cloud: () => cloud,
    gates,
    advanceVersion: (next) => {
      version = next;
    },
    click: (id) => elements.get(id).events.click(),
    recovery: () => {
      const raw = tab.get(STORAGE_KEY + '_b89c2b90-bbee-4a90-bd68-a0e9fc761352');
      return raw ? JSON.parse(raw) : null;
    },
  };
}

test('two-field period changes preserve the original observation without archiving the intermediate period', async (t) => {
  const { autosave, writes, read, setDraft } = await harness(t);
  const origin = structuredClone(read().drafts.JRE);
  setDraft(changeDraftPeriod(read().drafts.JRE, '2026-10-03', '2026-10-05', origin));
  autosave.changed({ periodOnly: true });
  setDraft(changeDraftPeriod(read().drafts.JRE, '2026-10-04', '2026-10-05', origin));
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

test('manual checkpoint recreates an active workspace after a nonzero-version tombstone', async (t) => {
  const { autosave, writes, cloud } = await harness(t, { tombstone: true });
  let calls = 0;
  await autosave.checkpoint(async ({ workspaceVersion }) => {
    calls++;
    assert.ok(cloud());
    assert.equal(workspaceVersion, 8);
    return {
      workspace: cloud(),
      workspaceVersion,
      updated_at: '2026-10-24T01:00:00Z',
      unchanged: true,
    };
  });
  assert.equal(calls, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].baseVersion, 7);
  assert.equal(writes[0].workspace.autosaveLayout, 1);
  assert.equal(autosave.pending(), false);
});

test('reloading an identical workspace keeps the original token for unsynced archived periods', async (t) => {
  const { autosave, writes } = await harness(t, { journal: true });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].baseVersion, 1);
  assert.equal(autosave.pending(), true);
  assert.equal(autosave.workspace().pendingPeriods[0].rows[0].start[0], '500');
});

test('an identical queued-period retry is acknowledged without adopting its token early', async (t) => {
  const { autosave, writes } = await harness(t, { journal: true, journalUnchanged: true });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].baseVersion, 1);
  assert.equal(autosave.pending(), false);
  assert.deepEqual(autosave.workspace().pendingPeriods, []);
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
function queuedReading(value = '777') {
  const d = createDraft('JRE', '2026-10-01', '2026-10-02');
  d.rows[0].start[0] = value;
  return d;
}
test('loading the account copy cannot discard queue edits made during the request', async (t) => {
  const { autosave, gates, click } = await harness(t, { journal: true });
  gates.holdRead = true;
  click('draft-load-cloud');
  await tick();
  assert.equal(typeof gates.releaseRead, 'function');
  autosave.restorePeriods([queuedReading()]);
  autosave.changed();
  gates.releaseRead();
  await tick();
  assert.equal(autosave.workspace().pendingPeriods[0]?.rows[0].start[0], '777');
  assert.equal(autosave.pending(), true);
});
test('deleting the active draft retains queue edits made while deletion is pending', async (t) => {
  const { autosave, gates, recovery } = await harness(t);
  gates.holdDelete = true;
  const deleted = autosave.forget();
  await tick();
  assert.equal(typeof gates.releaseDelete, 'function');
  autosave.restorePeriods([queuedReading()]);
  autosave.changed();
  gates.releaseDelete();
  assert.equal(await deleted, true);
  assert.equal(recovery()?.tabRecovery.pendingPeriods[0]?.rows[0].start[0], '777');
  assert.equal(autosave.pending(), true);
});
test('an unchanged checkpoint response cannot advance a newly queued period past another device', async (t) => {
  const { autosave, cloud, advanceVersion, writes } = await harness(t);
  await autosave.checkpoint(async () => {
    autosave.restorePeriods([queuedReading()]);
    autosave.changed();
    advanceVersion(3);
    return { workspace: cloud(), workspaceVersion: 3, unchanged: true };
  });
  assert.equal(await autosave.flushAll(), false);
  assert.equal(writes[0]?.baseVersion, 1);
  assert.equal(autosave.workspace().pendingPeriods[0]?.rows[0].start[0], '777');
});

test('reverting to the last local snapshot after a server conflict must not claim it is saved', async (t) => {
  const { autosave, read, cloud, advanceVersion, recovery } = await harness(t);
  const original = structuredClone(read());
  cloud().drafts.JRE.rows[0].end[0] = '999';
  advanceVersion(2);
  read().drafts.JRE.rows[0].end[0] = '120';
  autosave.changed();
  assert.equal(await autosave.flushAll(), false);
  read().drafts.JRE.rows[0].end[0] = original.drafts.JRE.rows[0].end[0];
  autosave.changed();
  assert.equal(autosave.pending(), true);
  assert.equal(recovery().tabRecovery.pending, true);
  assert.notEqual(
    document.getElementById('save-status').textContent,
    'All changes saved to your account.',
  );
  assert.equal(cloud().drafts.JRE.rows[0].end[0], '999');
  autosave.reset({ id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352' });
  assert.equal(await autosave.flushAll(), false);
  assert.equal(read().drafts.JRE.rows[0].end[0], original.drafts.JRE.rows[0].end[0]);
  assert.equal(autosave.pending(), true);
});
