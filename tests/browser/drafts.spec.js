import { test, expect, modernWorkspace, checkpointReply } from './fixtures.js';
import { createDraft } from '../../engine.js';
import { reportSnapshot } from '../../server/report-data.js';
import { graphRecords } from '../../graph-data.js';
import {
  periodKey,
  workspaceDrafts,
  hasEnteredData,
  samePeriodContent,
} from '../../draft-records.js';
const user = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'draft-user',
  role: 'operator',
  mustChangePassword: false,
};
const empty = () =>
  modernWorkspace({
    version: 4,
    drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') },
    reportLinks: {},
  });
const cell = (page, side = 'start') =>
  page.locator('.meter-input[data-row="0"][data-meter="0"][data-side="' + side + '"]');
async function setup(page) {
  const state = {
    workspace: null,
    version: 0,
    writes: 0,
    reports: 0,
    offline: false,
    documents: new Map(),
  };
  const refs = () =>
    [...state.documents].map(([key, d]) => ({
      key,
      id: d.id,
      revision: Math.max(1, d.checkpoints.length),
      checkpointRevision: d.checkpoints.length,
    }));
  await page.clock.install();
  await page.route('**/api/time', (r) =>
    r.fulfill({
      json: {
        unixMs: Date.UTC(2026, 8, 24, 1),
        source: 'time.cloudflare.com',
        protocol: 'NTP',
        sampleAgeMs: 0,
        uncertaintyMs: 5,
        stratum: 2,
      },
    }),
  );
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user } }));
  await page.route('**/api/drafts', (r) => {
    let recordsChanged = false;
    if (r.request().method() === 'POST') {
      state.writes++;
      if (state.offline) return r.abort();
      const body = r.request().postDataJSON();
      if (body.baseVersion !== state.version)
        return r.fulfill({ status: 409, json: { error: 'DRAFT_CONFLICT' } });
      state.workspace = body.workspace;
      state.version++;
      for (const draft of [...(body.periods || []), ...workspaceDrafts(body.workspace)]) {
        const key = periodKey(draft);
        const old = state.documents.get(key);
        if (!key || draft.isExample || (!old && !hasEnteredData(draft))) continue;
        const snapshot = reportSnapshot(draft, { allowPartial: true });
        if (!old || !samePeriodContent(old.snapshot, snapshot)) {
          state.documents.set(key, {
            id: old?.id || '0d8ed4b6-5c2b-4f18-b91e-c051dfca530e',
            snapshot,
            checkpoints: old?.checkpoints || [],
          });
          recordsChanged = true;
        }
      }
    }
    return r.fulfill({
      json: {
        workspace: modernWorkspace(state.workspace),
        version: state.version,
        updated_at: '2026-10-24T01:00:00Z',
        records: refs(),
        recordsChanged,
      },
    });
  });
  await page.route('**/api/reports**', (r) => {
    const params = new URL(r.request().url()).searchParams;
    if (r.request().method() === 'POST') {
      state.reports++;
      const body = r.request().postDataJSON(),
        key = periodKey(body.draft),
        snapshot = reportSnapshot(body.draft, { allowPartial: true });
      const doc = state.documents.get(key) || {
        id: '0d8ed4b6-5c2b-4f18-b91e-c051dfca530e',
        checkpoints: [],
      };
      const previous = doc.checkpoints.at(-1),
        unchanged = previous && samePeriodContent(previous, snapshot);
      if (!unchanged) doc.checkpoints.push(snapshot);
      doc.snapshot = snapshot;
      state.documents.set(key, doc);
      return checkpointReply(
        page,
        r,
        {
          id: doc.id,
          revision: doc.checkpoints.length,
          snapshot,
          unchanged: !!unchanged,
          records: refs(),
        },
        state,
      );
    }
    const docs = [...state.documents.values()];
    if (params.has('id')) {
      const d = docs.find((d) => d.id === params.get('id'));
      const revision = Number(params.get('revision'));
      return r.fulfill({
        json: {
          id: d.id,
          revision: Math.max(1, revision || d.checkpoints.length),
          latestRevision: Math.max(1, d.checkpoints.length),
          checkpointRevision: d.checkpoints.length,
          hasAutosave: true,
          autosaved: !revision,
          snapshot: revision ? d.checkpoints[revision - 1] : d.snapshot,
        },
      });
    }
    return r.fulfill({
      json: {
        hasMore: false,
        reports: docs.map((d) => ({
          id: d.id,
          plant: d.snapshot.draft.plantKey,
          start_date: d.snapshot.draft.startDate,
          end_date: d.snapshot.draft.endDate,
          revision: Math.max(1, d.checkpoints.length),
          autosaved: true,
          complete: d.snapshot.complete,
        })),
      },
    });
  });
  await page.route('**/api/graphs?**', (r) => {
    const p = Object.fromEntries(new URL(r.request().url()).searchParams);
    const rows = [...state.documents.values()]
      .filter(
        (d) =>
          d.snapshot.draft.plantKey === p.plant &&
          (d.snapshot.draft.periodKind || 'daily') === p.kind,
      )
      .map((d) => ({
        id: d.id,
        revision: Math.max(1, d.checkpoints.length),
        start_date: d.snapshot.draft.startDate,
        end_date: d.snapshot.draft.endDate,
        snapshot: d.snapshot,
        autosaved: true,
      }));
    return r.fulfill({ json: { ...p, records: graphRecords(rows, p.plant) } });
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('Draft autosave is ready.');
  return state;
}
test('partial entries autosave after three seconds, restore on reload and create manual checkpoints without requiring complete data', async ({
  page,
}) => {
  const state = await setup(page);
  await cell(page).fill('123.');
  await page.clock.runFor(2900);
  expect(state.writes).toBe(0);
  await page.clock.runFor(200);
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.writes).toBe(1);
  expect(state.documents.size).toBe(1);
  await page.clock.runFor(90000);
  expect(state.writes).toBe(1);
  await cell(page).fill('124');
  await page.locator('#save-report').click();
  await expect(page.locator('#toast')).toContainText('Revision 1');
  expect(state.reports).toBe(1);
  await page.reload();
  await expect(cell(page)).toHaveValue('124');
  await page.locator('#save-report').click();
  await expect(page.locator('#toast')).toContainText('Already saved');
  expect([...state.documents.values()][0].checkpoints).toHaveLength(1);
  await cell(page).fill('125');
  await page.clock.runFor(5100);
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  const doc = [...state.documents.values()][0];
  expect(doc.checkpoints[0].draft.rows[0].start[0]).toBe('124');
  expect(doc.snapshot.draft.rows[0].start[0]).toBe('125');
  await page.locator('#save-report').click();
  await expect(page.locator('#toast')).toContainText('Revision 2');
});
test('partial autosaves populate monitoring and monthly table without a manual checkpoint', async ({
  page,
}) => {
  const state = await setup(page);
  await cell(page).fill('100');
  await cell(page, 'end').fill('110');
  await page.locator('#open-graphs').click();
  await expect(page.locator('#graph-status')).toContainText('saved');
  expect(state.reports).toBe(0);
  expect([...state.documents.values()][0].checkpoints).toHaveLength(0);
  await page.locator('#graph-view-table').click();
  await expect(
    page.locator('#graph-matrix tr[data-metric="r0"] .matrix-value').filter({ hasText: /^10$/ }),
  ).toHaveCount(1);
  await expect(page.locator('#graph-warnings')).toContainText('incomplete');
});
test('newer account draft conflicts preserve both server data and local partial input', async ({
  page,
}) => {
  const state = await setup(page);
  await cell(page).fill('111');
  state.workspace = empty();
  state.workspace.drafts.JRE.rows[0].start[0] = '222';
  state.version = 1;
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toContainText('Another tab or device');
  await page.clock.runFor(120000);
  expect(state.writes).toBe(1);
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('222');
  page.on('dialog', (d) => d.accept());
  await page.locator('#draft-keep-local').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('111');
});
test('offline departed-period journal survives reload and syncs both old and new partial periods', async ({
  page,
}) => {
  const state = await setup(page);
  state.offline = true;
  await cell(page).fill('555');
  const oldDate = await page.locator('#start-date').inputValue();
  await page.locator('#start-date').fill('2026-09-25');
  await page.locator('#end-date').fill('2026-09-26');
  await cell(page).fill('666');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toContainText('sync failed');
  await page.reload();
  await expect(cell(page)).toHaveValue('666');
  state.offline = false;
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(
    [...state.documents.values()].some(
      (d) => d.snapshot.draft.startDate === oldDate && d.snapshot.draft.rows[0].start[0] === '555',
    ),
  ).toBe(true);
  expect(
    [...state.documents.values()].some(
      (d) =>
        d.snapshot.draft.startDate === '2026-09-25' && d.snapshot.draft.rows[0].start[0] === '666',
    ),
  ).toBe(true);
  expect(state.reports).toBe(0);
});
test('combined readings show a neutral notice and inclusive report dates in days', async ({
  page,
}, info) => {
  await setup(page);
  await page.locator('#load-example').click();
  await page.locator('#start-date').fill('2026-09-18');
  await page.locator('#end-date').fill('2026-09-21');
  // Date changes no longer relabel example readings. Enter the new period's observation.
  await page.locator('.meter-input').first().fill('100');
  await expect(page.locator('#period-note')).toContainText('covers 3 days');
  await expect(page.locator('#period-note')).not.toHaveClass(/warning/);
  await expect(page.locator('#report-preview')).toHaveValue(/18-20 SEPTEMBER 2026 - 3 DAYS/);
  await expect(page.locator('#report-preview')).not.toHaveValue(/72 HOURS|not 24 hours/);
  await page.locator('#period-note').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('period-notice.png') });
});

test('continuous editing syncs within fifteen seconds and late acknowledgments keep newer input pending', async ({
  page,
}) => {
  const state = await setup(page);
  // Do not add real browser/driver time to the simulated deadline.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const began = await page.evaluate(() => performance.now());
  await cell(page).fill('1');
  for (let i = 2; i <= 8; i++) {
    await page.clock.runFor(2000);
    await cell(page).fill(String(i));
  }
  expect((await page.evaluate(() => performance.now())) - began).toBe(14000);
  expect(state.writes).toBe(0);
  await page.clock.runFor(1100);
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.writes).toBe(1);
  await page.clock.resume();
  let release,
    started = false;
  await page.route(
    '**/api/drafts',
    async (r) => {
      if (r.request().method() !== 'POST') return r.fallback();
      const body = r.request().postDataJSON();
      started = true;
      await new Promise((resolve) => {
        release = resolve;
      });
      state.workspace = body.workspace;
      state.version++;
      await r.fulfill({ json: { version: state.version, updated_at: '2026-10-24T01:00:00Z' } });
    },
    { times: 1 },
  );
  await cell(page).fill('9');
  await page.locator('#save-draft').click();
  await expect.poll(() => started).toBe(true);
  await cell(page).fill('10');
  release();
  await expect(page.locator('#save-status')).toContainText('Sync pending');
  await page.clock.runFor(5100);
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('10');
});
test('damaged local journal is not overwritten or sent automatically', async ({ page }) => {
  const state = await setup(page);
  const broken = JSON.stringify({
    ...empty(),
    tabRecovery: { version: 0, pending: true, pendingPeriods: { broken: true } },
  });
  await page.evaluate(
    ({ id, broken }) => sessionStorage.setItem('midea_energy_draft_v4_' + id, broken),
    { id: user.id, broken },
  );
  await page.reload();
  await expect(page.locator('#save-status')).toContainText('recovery copy is damaged');
  await page.clock.runFor(30000);
  expect(state.writes).toBe(0);
  expect(
    await page.evaluate((id) => sessionStorage.getItem('midea_energy_draft_v4_' + id), user.id),
  ).toBe(broken);
  await expect(page.locator('#draft-keep-local')).toBeHidden();
  page.once('dialog', (d) => d.accept());
  await page.locator('#draft-load-cloud').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
});

test('reverting to an old saved value keeps a newer-device conflict and recovery pending until resolved', async ({
  page,
}) => {
  const state = await setup(page);
  await cell(page).fill('111');
  await page.clock.runFor(3100);
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  state.workspace = structuredClone(state.workspace);
  state.workspace.drafts.JRE.rows[0].start[0] = '222';
  state.version++;
  await cell(page).fill('120');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toContainText('Another tab or device');
  await cell(page).fill('111');
  await expect(page.locator('#save-status')).toContainText('Another tab or device');
  const recovery = await page.evaluate(
    (id) => JSON.parse(sessionStorage.getItem('midea_energy_draft_v4_' + id)),
    user.id,
  );
  expect(recovery.tabRecovery.pending).toBe(true);
  expect(recovery.drafts.JRE.rows[0].start[0]).toBe('111');
  const writes = state.writes;
  await page.clock.runFor(120000);
  expect(state.writes).toBe(writes);
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('222');
  await page.reload();
  await expect(cell(page)).toHaveValue('111');
  await expect(page.locator('#save-status')).toContainText('Another tab or device');
  await expect(page.locator('#draft-load-cloud')).toBeVisible();
  await expect(page.locator('#draft-keep-local')).toBeVisible();
  for (const language of ['zh-CN', 'id', 'en'])
    await page.locator('#language-select').selectOption(language);
  await expect(page.locator('#save-status')).toContainText('Another tab or device');
  page.once('dialog', (d) => d.accept());
  await page.locator('#draft-load-cloud').click();
  await expect(cell(page)).toHaveValue('222');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.writes).toBe(writes);
});
