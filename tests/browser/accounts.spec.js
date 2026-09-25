import { test, expect } from '@playwright/test';
import { exampleDraft } from '../../examples.js';
import { reportSnapshot } from '../../server/report-data.js';

test('account drafts, required password change, historian revisions, and logout work across languages', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const account = {
    id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
    username: 'test-operator',
    role: 'operator',
    mustChangePassword: true,
  };
  let user = null;
  let saved = null;
  let revision = 0;
  await page.route('**/api/time', (route) =>
    route.fulfill({
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
  await page.route('**/api/auth', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      if (body.action === 'login') user = { ...account };
      if (body.action === 'changePassword') user = { ...account, mustChangePassword: false };
      if (body.action === 'logout') user = null;
    }
    await route.fulfill({ json: { available: true, user } });
  });
  await page.route('**/api/reports**', async (route) => {
    expect(route.request().headers()['x-meter-user']).toBe(account.id);
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      saved = reportSnapshot(body.draft);
      revision++;
      await route.fulfill({
        json: { id: '0d8ed4b6-5c2b-4f18-b91e-c051dfca530e', revision, snapshot: saved },
      });
    } else if (new URL(route.request().url()).searchParams.has('id')) {
      await route.fulfill({
        json: {
          id: '0d8ed4b6-5c2b-4f18-b91e-c051dfca530e',
          revision,
          latestRevision: revision,
          snapshot: saved,
        },
      });
    } else
      await route.fulfill({
        json: {
          hasMore: false,
          reports: saved
            ? [
                {
                  id: '0d8ed4b6-5c2b-4f18-b91e-c051dfca530e',
                  plant: 'JRE',
                  start_date: saved.draft.startDate,
                  end_date: saved.draft.endDate,
                  revision,
                },
              ]
            : [],
        },
      });
  });
  const guest = JSON.stringify({
    version: 4,
    drafts: { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND') },
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem('midea_energy_draft_v4'))
      localStorage.setItem('midea_energy_draft_v4', value);
  }, guest);
  await page.goto('/');
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#save-draft')).toBeHidden();
  await expect(page.locator('#skip-table')).toBeHidden();
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    await expect(page.locator('#report-workspace')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
  await page.locator('#login-username').fill('test-operator');
  await page.locator('#login-password').fill('Test-only password 123');
  await page.locator('#login-submit').click();
  await expect(page.locator('#password-required')).toBeVisible();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#save-report')).toBeHidden();
  await expect(page.locator('.meter-input').first()).toHaveValue('');
  await page.locator('#current-password').fill('Test-only password 123');
  await page.locator('#new-password').fill('New test-only password 456');
  await page.locator('#confirm-password').fill('New test-only password 456');
  await page.locator('#password-submit').click();
  await expect(page.locator('#save-report')).toBeVisible();
  await expect(page.locator('#report-workspace')).toBeVisible();
  await page.locator('#load-example').click();
  await page.locator('#save-draft').click();
  expect(await page.evaluate(() => localStorage.getItem('midea_energy_draft_v4'))).toBe(guest);
  await page.reload();
  await expect(page.locator('.meter-input').first()).toHaveValue(
    exampleDraft('JRE').rows[0].start[0],
  );
  const original = await page.locator('#report-preview').inputValue();
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    await expect(page.locator('#report-preview')).toHaveValue(original);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.locator('#save-report').click();
  await expect(page.locator('#toast')).toContainText('revision 1');
  await page.locator('#clear-plant').click();
  await page.locator('#open-history').click();
  await page.locator('#history-list button').click();
  await expect(page.locator('#history-snapshot')).toHaveValue(original);
  await page.screenshot({ path: testInfo.outputPath('historian.png'), fullPage: true });
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#use-history').click();
  await expect(page.locator('#report-preview')).toHaveValue(original);
  await page.locator('#save-report').click();
  await expect(page.locator('#toast')).toContainText('revision 2');
  await page.locator('#logout').click();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#login-username')).toBeFocused();
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('.meter-input').first()).toHaveValue('');
  expect(
    await page.evaluate((id) => sessionStorage.getItem('midea_energy_draft_v4_' + id), account.id),
  ).toBe(null);
  expect(errors).toEqual([]);
});

test('an account change in another tab discards stale report responses and clears readings', async ({
  page,
}) => {
  let user = {
    id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
    username: 'first-user',
    role: 'operator',
    mustChangePassword: false,
  };
  await page.route('**/api/auth', (route) => route.fulfill({ json: { available: true, user } }));
  await page.goto('/');
  await expect(page.locator('#account-name')).toHaveText('first-user');
  await page.locator('#load-example').click();
  await page.locator('#save-draft').click();
  await page.locator('#open-raw-export').click();
  await expect(page.locator('#raw-export-preview')).not.toHaveValue('');
  user = { ...user, id: 'eb90c39b-1801-4aa4-98f7-bcb591e68c68', username: 'second-user' };
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'midea_account_changed', newValue: 'changed' }),
    ),
  );
  await expect(page.locator('#account-name')).toHaveText('second-user');
  await expect(page.locator('#raw-export-dialog')).not.toBeVisible();
  await expect(page.locator('#raw-export-preview')).toHaveValue('');
  await expect(page.locator('.meter-input').first()).toHaveValue('');
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith('midea_energy_draft_v4_')),
    ),
  ).toEqual([]);
});

test('admin account creation waits for loading and clears temporary passwords on close', async ({
  page,
}) => {
  const user = {
    id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
    username: 'test-admin',
    role: 'admin',
    mustChangePassword: false,
  };
  let finishList;
  let listed = false;
  let creates = 0;
  await page.route('**/api/auth', (route) => route.fulfill({ json: { available: true, user } }));
  await page.route('**/api/users', async (route) => {
    if (route.request().method() === 'GET') {
      if (!listed) {
        listed = true;
        await new Promise((resolve) => {
          finishList = resolve;
        });
      }
      await route.fulfill({ json: { users: [] } });
    } else {
      creates++;
      await route.fulfill({
        json: { id: 'created', temporaryPassword: 'Test-only temporary password 123' },
      });
    }
  });
  await page.goto('/');
  await expect(page.locator('#open-users')).toBeVisible();
  await page.locator('#open-users').click();
  await expect(page.locator('#create-user-form button')).toBeDisabled();
  await expect.poll(() => typeof finishList).toBe('function');
  finishList();
  await page.locator('#new-username').fill('new-operator');
  await page.locator('#create-user-form button').click();
  await expect(page.locator('#temporary-password')).toHaveValue('Test-only temporary password 123');
  expect(creates).toBe(1);
  await page.locator('[data-close-dialog="users-dialog"]').click();
  await expect(page.locator('#temporary-password')).toHaveValue('');
});

test('session loading and service failure never reveal the table, retry restores sign-in', async ({
  page,
}) => {
  let finishCheck;
  await page.route('**/api/auth', async (route) => {
    await new Promise((resolve) => {
      finishCheck = resolve;
    });
    await route.fulfill({ json: { available: false, user: null } });
  });
  await page.goto('/');
  await expect(page.locator('#account-status')).toHaveText('Checking your session...');
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#login-submit')).toBeDisabled();
  await expect.poll(() => typeof finishCheck).toBe('function');
  finishCheck();
  await expect(page.locator('#retry-account')).toBeVisible();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await page.unroute('**/api/auth');
  await page.route('**/api/auth', (route) =>
    route.fulfill({ json: { available: true, user: null } }),
  );
  await page.locator('#retry-account').click();
  await expect(page.locator('#login-submit')).toBeEnabled();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#retry-account')).toBeHidden();
});

test('an expired session closes the historian and returns to the login screen', async ({
  page,
}) => {
  let user = {
    id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
    username: 'test-operator',
    role: 'operator',
    mustChangePassword: false,
  };
  await page.route('**/api/auth', (route) => route.fulfill({ json: { available: true, user } }));
  await page.route('**/api/reports**', (route) => {
    user = null;
    return route.fulfill({ status: 401, json: { error: 'LOGIN_REQUIRED' } });
  });
  await page.goto('/');
  await page.locator('#load-example').click();
  await page.locator('#save-draft').click();
  await page.locator('#open-history').click();
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#history-dialog')).not.toBeVisible();
  await expect(page.locator('.meter-input').first()).toHaveValue('');
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith('midea_energy_draft_v4_')),
    ),
  ).toEqual([]);
});
