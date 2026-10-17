import { test, expect } from './fixtures.js';
import { createDraft } from '../../engine.js';
import { restoreWorkspace } from '../../storage.js';

const firstUser = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'reliability-one',
  role: 'operator',
  mustChangePassword: false,
};
const secondUser = {
  ...firstUser,
  id: '70d8ec46-f172-44c6-b274-603c3c3eb3c8',
  username: 'reliability-two',
};
const cell = (page) => page.locator('.meter-input').first();

async function setup(page, saved = false) {
  const workspace = {
    version: 4,
    drafts: {
      JRE: createDraft('JRE', '2026-10-16', '2026-10-17'),
      UNILAND: createDraft('UNILAND', '2026-10-16', '2026-10-17'),
    },
    reportLinks: {},
  };
  workspace.drafts.JRE.rows[0].start[0] = '111';
  const state = {
    user: firstUser,
    workspace: saved ? workspace : null,
    version: saved ? 7 : 0,
    writes: [],
  };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.route('**/api/time', (route) =>
    route.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/auth', (route) =>
    route.fulfill({ json: { available: true, user: state.user } }),
  );
  await page.route('**/api/drafts', (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      state.writes.push(body);
      state.workspace = body.workspace;
      state.version++;
    }
    return route.fulfill({
      json: {
        workspace: state.reorder
          ? JSON.parse(JSON.stringify(state.workspace), (_, value) =>
              value && typeof value === 'object' && !Array.isArray(value)
                ? Object.fromEntries(Object.entries(value).reverse())
                : value,
            )
          : state.workspace,
        version: state.version,
        updated_at: '2026-10-17T01:00:00Z',
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#report-workspace')).toBeVisible();
  await expect(page.locator('#save-status')).toHaveText(
    saved ? 'Draft saved to your account.' : 'Draft autosave is ready.',
  );
  return { state, errors };
}

for (const change of ['edit', 'account']) {
  test(`a delayed clipboard failure cannot replace the current report after ${change}`, async ({
    page,
  }) => {
    const { state, errors } = await setup(page);
    await page.locator('#load-example').click();
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () =>
            new Promise((resolve, reject) => {
              window.rejectOldCopy = reject;
            }),
        },
      });
    });
    await page.locator('#copy-report').click();
    await expect.poll(() => page.evaluate(() => typeof window.rejectOldCopy)).toBe('function');
    if (change === 'account') {
      state.user = secondUser;
      await page.evaluate(() =>
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'midea_account_changed', newValue: 'changed' }),
        ),
      );
      await expect(page.locator('#account-name')).toHaveText(secondUser.username);
      await page.locator('#load-example').click();
    }
    await cell(page).fill('10000');
    const currentReport = await page.locator('#report-preview').inputValue();
    await page.evaluate(() => window.rejectOldCopy(new Error('Synthetic clipboard denial')));
    await expect(page.locator('#report-preview')).toHaveValue(currentReport);
    expect(errors).toEqual([]);
  });
}

test('a partially failed tab-storage update cannot discard newer unsynced readings on reload', async ({
  page,
}) => {
  const { state, errors } = await setup(page, true);
  await expect(cell(page)).toHaveValue('111');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let writes = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('midea_energy_draft_v4_') && ++writes >= 2)
        throw new DOMException('Synthetic storage quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await cell(page).fill('222');
  expect(state.writes).toHaveLength(0);
  await page.reload();
  await expect(cell(page)).toHaveValue('222');
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('111');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('222');
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].workspace.tabRecovery).toBeUndefined();
  expect(errors).toEqual([]);
});

for (const concurrent of [false, true]) {
  test(`legacy tab recovery keeps unsynced input${concurrent ? ' and detects a newer server copy' : ''}`, async ({
    page,
  }) => {
    const { state, errors } = await setup(page, true);
    const local = structuredClone(state.workspace);
    local.drafts.JRE.rows[0].start[0] = '222';
    await page.evaluate(
      ({ id, local }) => {
        const key = 'midea_energy_draft_v4_' + id;
        sessionStorage.setItem(key, JSON.stringify(local));
        // Old split writes could leave this flag unchanged after a partial failure.
        sessionStorage.setItem(key + '_sync', JSON.stringify({ version: 7, pending: false }));
      },
      { id: firstUser.id, local },
    );
    if (concurrent) {
      state.workspace.drafts.JRE.rows[0].start[0] = '333';
      state.version = 8;
    }
    await page.reload();
    await expect(cell(page)).toHaveValue('222');
    expect(state.writes).toHaveLength(0);
    if (concurrent) {
      await expect(page.locator('#save-status')).toContainText('Another tab or device');
      expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('333');
      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('#draft-keep-local').click();
    } else await page.locator('#save-draft').click();
    await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
    expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('222');
    expect(state.writes).toHaveLength(1);
    expect(errors).toEqual([]);
  });
}

for (const reorder of [false, true]) {
  test(`a lost save response recovers an identical server copy${reorder ? ' with reordered JSON keys' : ''}`, async ({
    page,
  }) => {
    const { state, errors } = await setup(page, true);
    const local = await page.evaluate(
      (id) => JSON.parse(sessionStorage.getItem('midea_energy_draft_v4_' + id)),
      firstUser.id,
    );
    state.workspace = restoreWorkspace(JSON.stringify(local));
    state.version = 8;
    state.reorder = reorder;
    local.tabRecovery.pending = true;
    // The account saved version 8, but the response never reached this tab.
    await page.evaluate(
      ({ id, local }) =>
        sessionStorage.setItem('midea_energy_draft_v4_' + id, JSON.stringify(local)),
      { id: firstUser.id, local },
    );
    await page.reload();
    await expect(cell(page)).toHaveValue('111');
    await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
    expect(state.writes).toHaveLength(0);
    await cell(page).fill('444');
    await page.locator('#save-draft').click();
    await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].baseVersion).toBe(8);
    expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('444');
    expect(errors).toEqual([]);
  });
}
