import { test, expect, modernWorkspace, checkpointReply } from './fixtures.js';
import { createDraft } from '../../engine.js';
import { restoreWorkspace } from '../../storage.js';
const id = 'b89c2b90-bbee-4a90-bd68-a0e9fc761352';
test('editing End then Start journals the original period, without an intermediate combined document', async ({
  page,
}) => {
  await page.clock.install();
  let workspace = modernWorkspace({
      version: 4,
      drafts: {
        JRE: createDraft('JRE', '2026-10-03', '2026-10-04'),
        UNILAND: createDraft('UNILAND'),
      },
    }),
    version = 1;
  workspace.drafts.JRE.rows[0].start[0] = '100';
  workspace.drafts.JRE.rows[0].end[0] = '110';
  const writes = [];
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: { id, username: 'period-test', role: 'operator', mustChangePassword: false },
      },
    }),
  );
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      writes.push(body);
      workspace = body.workspace;
      version++;
    }
    return r.fulfill({ json: { workspace, version } });
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  await page.locator('#end-date').fill('2026-10-05');
  await page.locator('#start-date').fill('2026-10-04');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(writes).toHaveLength(1);
  expect(writes[0].periods.map((p) => [p.startDate, p.endDate])).toEqual([
    ['2026-10-03', '2026-10-04'],
  ]);
  expect(writes[0].periods[0].rows[0].end[0]).toBe('110');
  expect(workspace.drafts.JRE.rows[0].start[0]).toBe('110');
  expect(workspace.drafts.JRE.rows[0].end[0]).toBe('');
});

test('Save version recreates a deleted active draft before storing a partial checkpoint', async ({
  page,
}) => {
  const state = {
    version: 1,
    workspace: modernWorkspace({
      version: 4,
      drafts: {
        JRE: createDraft('JRE', '2026-10-03', '2026-10-04'),
        UNILAND: createDraft('UNILAND'),
      },
    }),
  };
  state.workspace.drafts.JRE.rows[0].start[0] = '100';
  const writes = [];
  let reports = 0;
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: { id, username: 'period-test', role: 'operator', mustChangePassword: false },
      },
    }),
  );
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      writes.push(body);
      state.workspace = body.workspace;
      state.version++;
    }
    return r.fulfill({ json: state });
  });
  await page.route('**/api/reports', (r) => {
    reports++;
    expect(state.workspace).not.toBeNull();
    return checkpointReply(
      page,
      r,
      { id: '0d8ed4b6-5c2b-4f18-b91e-c051dfca530e', revision: 1 },
      state,
    );
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  page.once('dialog', (d) => d.accept());
  await page.locator('#forget-draft').click();
  await expect.poll(() => state.workspace).toBeNull();
  await page.locator('#save-report').click();
  await expect(page.locator('#toast')).toContainText('Revision 1');
  expect(reports).toBe(1);
  expect(writes.some((w) => w.workspace === null)).toBe(true);
  expect(writes.at(-1).workspace.drafts.JRE.rows[0].start[0]).toBe('100');
});

for (const conflict of [true, false])
  test(
    'reloading a pending period journal ' +
      (conflict ? 'detects a newer archived correction' : 'accepts an identical lost response') +
      ' before advancing its token',
    async ({ page }) => {
      await page.clock.install();
      const workspace = restoreWorkspace(
        JSON.stringify(
          modernWorkspace({
            version: 4,
            drafts: {
              JRE: createDraft('JRE', '2026-10-03', '2026-10-04'),
              UNILAND: createDraft('UNILAND'),
            },
          }),
        ),
      );
      workspace.drafts.JRE.rows[0].start[0] = '100';
      const archived = createDraft('JRE', '2026-10-01', '2026-10-02');
      archived.rows[0].start[0] = '500';
      const writes = [];
      let archiveValue = conflict ? '700' : '500',
        overwrites = 0;
      await page.addInitScript(
        ({ workspace, archived, id }) =>
          sessionStorage.setItem(
            'midea_energy_draft_v4_' + id,
            JSON.stringify({
              ...workspace,
              tabRecovery: { version: 1, pending: true, pendingPeriods: [archived] },
            }),
          ),
        { workspace, archived, id },
      );
      await page.route('**/api/auth', (r) =>
        r.fulfill({
          json: {
            available: true,
            user: { id, username: 'period-test', role: 'operator', mustChangePassword: false },
          },
        }),
      );
      await page.route('**/api/time', (r) =>
        r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
      );
      await page.route('**/api/drafts', (r) => {
        if (r.request().method() === 'POST') {
          const body = r.request().postDataJSON();
          writes.push(body);
          if (body.baseVersion !== 3) {
            if (conflict) return r.fulfill({ status: 409, json: { error: 'DRAFT_CONFLICT' } });
            return r.fulfill({ json: { version: 3, unchanged: true, recordsChanged: false } });
          }
          overwrites++;
          archiveValue = body.periods[0].rows[0].start[0];
        }
        return r.fulfill({ json: { workspace, version: 3 } });
      });
      await page.goto('/');
      await expect(page.locator('#save-status')).toContainText('Sync pending');
      await page.locator('#save-draft').click();
      await expect(page.locator('#save-status')).toContainText(
        conflict ? 'Another tab or device' : 'All changes saved',
      );
      expect(writes).toHaveLength(1);
      expect(writes[0].baseVersion).toBe(1);
      expect(overwrites).toBe(0);
      expect(archiveValue).toBe(conflict ? '700' : '500');
      const queued = await page.evaluate(
        (id) =>
          JSON.parse(sessionStorage.getItem('midea_energy_draft_v4_' + id)).tabRecovery
            .pendingPeriods,
        id,
      );
      expect(queued).toHaveLength(conflict ? 1 : 0);
    },
  );
