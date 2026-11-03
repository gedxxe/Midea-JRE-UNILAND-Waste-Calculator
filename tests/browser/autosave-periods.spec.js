import { test, expect, modernWorkspace, checkpointReply } from './fixtures.js';
import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from '../../engine.js';
import { restoreWorkspace } from '../../storage.js';
import { periodKey } from '../../draft-records.js';
const id = 'b89c2b90-bbee-4a90-bd68-a0e9fc761352';

async function browserRecoverySetup(page, context) {
  const user = { id, username: 'recovery-test', role: 'operator', mustChangePassword: false };
  const workspace = modernWorkspace({
    version: 4,
    drafts: {
      JRE: createDraft('JRE', '2026-11-03', '2026-11-04'),
      UNILAND: createDraft('UNILAND', '2026-11-03', '2026-11-04'),
    },
    workingHours: Object.fromEntries(
      ['JRE', 'UNILAND'].map((p) => [p, createWorkingHoursDraft(p, '2026-11-03')]),
    ),
    nightShifts: Object.fromEntries(
      ['JRE', 'UNILAND'].map((p) => [p, createNightShiftDraft(p, '2026-11-03')]),
    ),
  });
  for (const collection of ['drafts', 'workingHours', 'nightShifts'])
    for (const draft of Object.values(workspace[collection])) draft.rows[0].start[0] = '100';
  const state = { workspace, version: 1, offline: false, expire: false, user, writes: 0 };
  await page.unroute('**/api/drafts');
  await page.unroute('**/api/drafts?**');
  await context.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await context.route('**/api/auth', (r) =>
    r.fulfill({ json: { available: true, user: state.user } }),
  );
  await context.route(/\/api\/drafts(?:\?|$)/, (r) => {
    const key = new URL(r.request().url()).searchParams.get('period');
    if (state.offline) return r.abort();
    if (r.request().method() === 'POST') {
      if (state.expire) {
        state.user = null;
        return r.fulfill({ status: 401, json: { error: 'LOGIN_REQUIRED' } });
      }
      const body = r.request().postDataJSON();
      expect(r.request().headers()['x-meter-user']).toBe(id);
      if (body.baseVersion !== state.version)
        return r.fulfill({ status: 409, json: { error: 'DRAFT_CONFLICT' } });
      state.workspace = body.workspace;
      state.version++;
      state.writes++;
    }
    if (key) return r.fulfill({ json: { key, draft: null, version: 0 } });
    return r.fulfill({
      json: {
        workspace: state.workspace,
        version: state.version,
        updated_at: '2026-11-03T01:00:00Z',
        records: [],
      },
    });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  return state;
}

test('closing an offline tab retains partial electricity, kg stock and Water without pressing Save', async ({
  page,
  context,
}) => {
  const state = await browserRecoverySetup(page, context);
  state.offline = true;
  await page.locator('.meter-input[data-row="0"][data-side="end"]').first().fill('130.');
  await page.locator('#additional-0-start').fill('1,25');
  await page.locator('[data-gas-enable="R32"]').check();
  await page.locator('[data-gas="R32"] [data-gas-point="start"]').fill('999.123456');
  await page.locator('#water-start').fill('100,25');
  await page.close();
  expect(state.writes).toBe(0);
  state.offline = false;
  const resumed = await context.newPage();
  await resumed.emulateMedia({ reducedMotion: 'reduce' });
  await resumed.goto('/app');
  await expect(resumed.locator('.meter-input[data-row="0"][data-side="end"]').first()).toHaveValue(
    '130.',
  );
  await expect(resumed.locator('#additional-0-start')).toHaveValue('1,25');
  await expect(resumed.locator('#water-start')).toHaveValue('100,25');
  await expect(resumed.locator('[data-gas="R32"] [data-gas-point="start"]')).toHaveValue(
    '999.123456',
  );
  await expect(resumed.locator('[data-gas="R32"] [data-gas-temperature]')).toHaveCount(0);
  await expect
    .poll(() => state.workspace.drafts.JRE.rows[0].end[0], { timeout: 12000 })
    .toBe('130.');
  await expect(resumed.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.workspace.drafts.JRE.gas.entries[3].start.unit).toBe('kg');
  await resumed.close();
});

test('incomplete readings autosave for both factories and every mode without manual Save', async ({
  page,
  context,
}) => {
  test.setTimeout(90000); // Six workflows retain their own 12-second autosave deadline.
  const state = await browserRecoverySetup(page, context);
  for (const plant of ['JRE', 'UNILAND']) {
    await page.locator(`[data-plant="${plant}"]`).click();
    for (const [mode, collection] of [
      ['daily', 'drafts'],
      ['workingHours', 'workingHours'],
      ['nightShift', 'nightShifts'],
    ]) {
      await page.locator('#reading-mode').selectOption(mode);
      const cell = page.locator('.meter-input[data-row="0"][data-side="end"]').first();
      const value = String(130 + state.writes);
      await cell.fill(value);
      await expect
        .poll(() => state.workspace[collection][plant].rows[0].end[0], { timeout: 12000 })
        .toBe(value);
      await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
      expect(periodKey(state.workspace[collection][plant])).not.toBeNull();
      expect(state.workspace[collection][plant].rows[1].end[0]).toBe('');
    }
  }
  expect(state.writes).toBeGreaterThanOrEqual(6);
});

test('session expiry keeps pending input before hiding the workspace and recovers it after login', async ({
  page,
  context,
}) => {
  const state = await browserRecoverySetup(page, context);
  const actor = state.user;
  state.expire = true;
  await page.locator('.meter-input[data-row="0"][data-side="end"]').first().fill('177.25');
  await expect(page.locator('#report-workspace')).toBeHidden({ timeout: 12000 });
  const copies = await page.evaluate(
    (id) =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith('midea_energy_draft_v4_pending_' + id + '_'))
        .map((k) => JSON.parse(localStorage.getItem(k))),
    id,
  );
  expect(copies.some((copy) => copy.drafts.JRE.rows[0].end[0] === '177.25')).toBe(true);
  state.expire = false;
  state.user = actor;
  await page.reload();
  await expect(page.locator('.meter-input[data-row="0"][data-side="end"]').first()).toHaveValue(
    '177.25',
  );
  await expect
    .poll(() => state.workspace.drafts.JRE.rows[0].end[0], { timeout: 12000 })
    .toBe('177.25');
});

test('conflicting browser copies require selection and another owner remains private', async ({
  page,
  context,
}) => {
  const state = await browserRecoverySetup(page, context);
  await page.evaluate((id) => {
    const key = 'midea_energy_draft_v4_' + id;
    const original = JSON.parse(sessionStorage.getItem(key));
    for (const [suffix, value, owner, hour] of [
      ['one', '150', id, 3],
      ['two', '160', id, 4],
      ['foreign', '999', 'eb90c39b-1801-4aa4-98f7-bcb591e68c68', 5],
    ]) {
      const copy = structuredClone(original);
      copy.drafts.JRE.rows[0].end[0] = value;
      copy.tabRecovery.owner = owner;
      copy.tabRecovery.pending = true;
      copy.tabRecovery.localAt = `2026-11-03T0${hour}:00:00Z`;
      localStorage.setItem(
        'midea_energy_draft_v4_pending_' + owner + '_' + suffix,
        JSON.stringify(copy),
      );
    }
    sessionStorage.removeItem(key);
  }, id);
  await page.reload();
  const choices = page.locator('#draft-browser-recoveries');
  await expect(choices).toBeVisible();
  await expect(choices.locator('button')).toHaveCount(2);
  await expect(page.locator('.meter-input[data-row="0"][data-side="end"]').first()).toHaveValue('');
  await expect(page.locator('#save-status')).toContainText('need review');
  page.once('dialog', (dialog) => dialog.accept());
  await choices.getByRole('button', { name: /10:00:00 WIB/ }).click();
  await expect(page.locator('.meter-input[data-row="0"][data-side="end"]').first()).toHaveValue(
    '150',
  );
  await expect
    .poll(() => state.workspace.drafts.JRE.rows[0].end[0], { timeout: 12000 })
    .toBe('150');
  await expect(choices.locator('button')).toHaveCount(1);
  const retained = await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem('midea_energy_draft_v4_pending_' + id + '_two')).drafts.JRE
        .rows[0].end[0],
    id,
  );
  expect(retained).toBe('160');
});
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
  await expect(
    page.locator('input.meter-input[data-row="0"][data-side="start"]').first(),
  ).toHaveValue('110');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(writes).toHaveLength(1);
  expect(writes[0].periods.map((p) => [p.startDate, p.endDate])).toEqual([
    ['2026-10-03', '2026-10-04'],
  ]);
  expect(writes[0].periods[0].rows[0].end[0]).toBe('110');
  expect(workspace.drafts.JRE.rows[0].start[0]).toBe('110');
  expect(workspace.drafts.JRE.rows[0].end[0]).toBe('');
  // A pending valid range must not replace a newer, unfinished date edit.
  await page.locator('#end-date').fill('2026-10-08');
  await page.locator('#start-date').fill('2026-10-09');
  await page.clock.runFor(600);
  await expect(page.locator('#start-date')).toHaveValue('2026-10-09');
  await expect(page.locator('#end-date')).toHaveValue('2026-10-08');
});

test('Save recreates a deleted active draft and verifies it without a checkpoint', async ({
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
  await expect(page.locator('#toast')).toContainText('saved and verified');
  expect(reports).toBe(0);
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
      await page.keyboard.press('Control+s');
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

test('revisiting a populated date loads stored readings before autosave and preserves edits during loading', async ({
  page,
}) => {
  let workspace = modernWorkspace({
      version: 4,
      drafts: {
        JRE: createDraft('JRE', '2026-10-27', '2026-10-28'),
        UNILAND: createDraft('UNILAND'),
      },
    }),
    version = 1,
    release;
  workspace.drafts.JRE.rows[0].start[0] = '10';
  workspace.drafts.JRE.rows[0].end[0] = '20';
  const stored = createDraft('JRE', '2026-10-29', '2026-10-30');
  stored.rows[0].start[0] = '100';
  stored.rows[0].end[0] = '125';
  const writes = [];
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: { id, username: 'navigation-test', role: 'operator', mustChangePassword: false },
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
  await page.route('**/api/drafts?**', async (r) => {
    const key = new URL(r.request().url()).searchParams.get('period');
    await new Promise((resolve) => {
      release = resolve;
    });
    return r.fulfill({ json: { key, draft: stored, version: 8 } });
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toContainText('All changes saved');
  await page.locator('#start-date').fill('2026-10-29');
  await page.locator('#end-date').fill('2026-10-30');
  await page.keyboard.press('Control+s');
  await expect.poll(() => !!release).toBe(true);
  await expect(page.locator('#report-workspace')).toHaveAttribute('inert', '');
  release();
  await expect(
    page.locator('input.meter-input[data-row="0"][data-side="start"]').first(),
  ).toHaveValue('100');
  await expect(
    page.locator('input.meter-input[data-row="0"][data-side="end"]').first(),
  ).toHaveValue('125');
  await expect(page.locator('#report-workspace')).not.toHaveAttribute('inert', '');
  await page.locator('input.meter-input[data-row="1"][data-side="end"]').first().fill('5');
  await expect.poll(() => writes.at(-1)?.workspace?.drafts?.JRE?.rows[0].start[0]).toBe('100');
  expect(writes.at(-1).workspace.drafts.JRE.rows[0].start[0]).toBe('100');
  expect(writes.at(-1).periodVersions['JRE:daily:2026-10-29:2026-10-30']).toBe(8);
  await expect(page.locator('#save-draft')).toHaveCount(0);
});
