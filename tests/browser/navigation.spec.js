import { test, expect, openSignIn } from './fixtures.js';

const operator = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'route-operator',
  role: 'operator',
  mustChangePassword: false,
};
async function setup(
  page,
  { signedIn = true, role = 'operator', passwordRequired = false, delayHistory = false } = {},
) {
  let user = signedIn ? { ...operator, role, mustChangePassword: passwordRequired } : null;
  let release,
    started = false,
    usersRequests = 0,
    graphRequests = 0;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/time', (route) =>
    route.fulfill({
      json: {
        unixMs: Date.UTC(2026, 9, 23, 1),
        source: 'time.cloudflare.com',
        protocol: 'NTP',
        sampleAgeMs: 0,
        uncertaintyMs: 5,
        stratum: 2,
      },
    }),
  );
  await page.route('**/api/auth', (route) => {
    if (route.request().method() === 'POST') {
      const action = route.request().postDataJSON().action;
      if (action === 'logout') user = null;
      else if (action === 'login')
        user = { ...operator, role, mustChangePassword: passwordRequired };
      else if (action === 'changePassword') user = { ...user, mustChangePassword: false };
    }
    return route.fulfill({ json: { available: true, user } });
  });
  await page.route('**/api/graphs?**', (route) => {
    graphRequests++;
    return route.fulfill({
      json: { ...Object.fromEntries(new URL(route.request().url()).searchParams), records: [] },
    });
  });
  await page.route('**/api/users', (route) => {
    usersRequests++;
    return route.fulfill({ json: { users: [] } });
  });
  await page.route('**/api/reports?**', async (route) => {
    if (delayHistory && !started) {
      started = true;
      await pending;
    }
    await route.fulfill({ json: { reports: [], hasMore: false } });
  });
  return {
    errors,
    release: () => release(),
    started: () => started,
    usersRequests: () => usersRequests,
    graphRequests: () => graphRequests,
    expire() {
      user = null;
    },
    switchAccount() {
      user = { ...operator, id: 'eb90c39b-1801-4aa4-98f7-bcb591e68c68' };
    },
  };
}

async function path(page, value) {
  await expect.poll(() => new URL(page.url()).pathname).toBe(value);
}

test('menus, Back/Forward and refresh preserve the reading workspace without document reloads', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/');
  await path(page, '/app');
  await page.locator('#load-example').click();
  const raw = await page.locator('.meter-input').first().inputValue();
  const report = await page.locator('#report-preview').inputValue();
  await page.evaluate(() => {
    window.routingSentinel = 'same-document';
  });
  await page.locator('#open-graphs').click();
  await path(page, '/app/monitoring');
  await expect(page).toHaveTitle('Energy monitoring | Midea');
  await page.goBack();
  await path(page, '/app');
  await expect(page.locator('#graphs-dialog')).not.toBeVisible();
  await page.goForward();
  await expect(page.locator('#graphs-dialog')).toBeVisible();
  await page.locator('#graph-expand').click();
  await page.keyboard.press('Escape');
  await path(page, '/app/monitoring');
  await expect(page.locator('#graphs-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await path(page, '/app');
  for (const [language, title] of [
    ['zh-CN', '报表历史 | Midea'],
    ['id', 'Histori laporan | Midea'],
    ['en', 'Report history | Midea'],
  ]) {
    await page.selectOption('#language-select', language);
    await page.locator('#open-history').click();
    await path(page, '/app/history');
    await expect(page).toHaveTitle(title);
    await page.locator('[data-close-dialog="history-dialog"]').click();
    await path(page, '/app');
  }
  expect(await page.evaluate(() => window.routingSentinel)).toBe('same-document');
  await expect(page.locator('.meter-input').first()).toHaveValue(raw);
  await expect(page.locator('#report-preview')).toHaveValue(report);
  await page.locator('#open-history').click();
  await path(page, '/app/history');
  await page.reload();
  await expect(page.locator('#history-dialog')).toBeVisible();
  await page.locator('[data-close-dialog="history-dialog"]').click();
  await path(page, '/app');
  await expect(page.locator('.meter-input').first()).toHaveValue(raw);
  await expect(page.locator('#report-preview')).toHaveValue(report);
  // Background session refresh must not close a small non-route dialog.
  await page.locator('#open-import').click();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#import-dialog')).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('protected initial links wait for sign-in and required password change; logout history cannot expose views', async ({
  page,
}) => {
  const state = await setup(page, { signedIn: false, passwordRequired: true });
  await page.goto('/app/monitoring');
  await path(page, '/');
  await expect(page.locator('#report-workspace')).toBeHidden();
  expect(state.graphRequests()).toBe(0);
  await openSignIn(page);
  await page.fill('#login-username', operator.username);
  await page.fill('#login-password', 'Synthetic old password 123');
  await page.click('#login-submit');
  await expect(page.locator('#password-required')).toBeVisible();
  await path(page, '/');
  expect(state.graphRequests()).toBe(0);
  await page.fill('#current-password', 'Synthetic old password 123');
  await page.fill('#new-password', 'Synthetic new password 456');
  await page.fill('#confirm-password', 'Synthetic new password 456');
  await page.click('#password-submit');
  await path(page, '/app/monitoring');
  await expect(page.locator('#graphs-dialog')).toBeVisible();
  await page.locator('[data-close-dialog="graphs-dialog"]').click();
  await path(page, '/app');
  await page.locator('#open-history').click();
  await path(page, '/app/history');
  await page.locator('[data-close-dialog="history-dialog"]').click();
  await path(page, '/app');
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#logout');
  await path(page, '/');
  await page.goForward();
  await path(page, '/');
  await expect(page.locator('#history-dialog')).not.toBeVisible();
  await expect(page.locator('#report-workspace')).toBeHidden();
  expect(state.errors).toEqual([]);
});

for (const role of ['operator', 'admin'])
  test(role + ' direct account route follows role permissions', async ({ page }) => {
    const state = await setup(page, { role });
    await page.goto('/app/accounts/');
    await path(page, role === 'admin' ? '/app/accounts' : '/app');
    if (role === 'admin') {
      await expect(page.locator('#users-dialog')).toBeVisible();
      await expect.poll(state.usersRequests).toBe(1);
      await page.reload();
      await expect(page.locator('#users-dialog')).toBeVisible();
      state.switchAccount();
      await page.evaluate(() =>
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'midea_account_changed', newValue: 'changed' }),
        ),
      );
      await path(page, '/app');
      await expect(page.locator('#users-dialog')).not.toBeVisible();
      await expect(page.locator('#temporary-password')).toHaveValue('');
    } else {
      await expect(page.locator('#users-dialog')).not.toBeVisible();
      expect(state.usersRequests()).toBe(0);
    }
    expect(state.errors).toEqual([]);
  });

test('Back/Forward during a pending history request eventually opens only the requested view', async ({
  page,
}) => {
  const state = await setup(page, { delayHistory: true });
  await page.goto('/app');
  await page.click('#open-history');
  await expect.poll(state.started).toBe(true);
  await path(page, '/app/history');
  await page.goBack();
  await path(page, '/app');
  await expect(page.locator('#history-dialog')).not.toBeVisible();
  await page.goForward();
  await path(page, '/app/history');
  state.release();
  await expect(page.locator('#history-dialog')).toBeVisible();
  await expect(page.locator('#history-empty')).toBeVisible();
  await page.goBack();
  await path(page, '/app');
  await expect(page.locator('#history-dialog')).not.toBeVisible();
  expect(state.errors).toEqual([]);
});

test('direct HTTP routes serve the app while unknown paths, private files and unknown APIs stay unavailable', async ({
  request,
}) => {
  for (const route of ['/app', '/app/monitoring', '/app/history/', '/app/accounts']) {
    const response = await request.get(route);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('src="/app.js"');
    const head = await request.head(route);
    expect(head.status()).toBe(200);
    expect(await head.text()).toBe('');
    expect((await request.post(route)).status()).toBe(405);
  }
  for (const route of [
    '/app/unknown',
    '/app/history/unknown',
    '/server/auth.js',
    '/docs/navigation.md',
    '/.env.local',
    '/api/unknown',
  ])
    expect((await request.get(route)).status()).toBe(404);
  const auth = await request.get('/api/auth');
  expect(auth.status()).toBe(200);
  expect(await auth.json()).toEqual({ available: false, user: null });
});

test('direct monitoring refresh and partial draft recovery stay private after session expiry', async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto('/app/monitoring');
  await expect(page.locator('#graphs-dialog')).toBeVisible();
  await page.reload();
  await expect(page.locator('#graphs-dialog')).toBeVisible();
  await page.locator('[data-close-dialog="graphs-dialog"]').click();
  await path(page, '/app');
  await page.locator('.meter-input').first().fill('12.5');
  await expect(page.locator('.meter-input').nth(1)).toHaveValue('');
  await page.locator('#open-history').click();
  await path(page, '/app/history');
  expect(JSON.stringify(await page.evaluate(() => history.state))).not.toMatch(
    /12\.5|route-operator|b89c2b90/,
  );
  await page.locator('[data-close-dialog="history-dialog"]').click();
  await path(page, '/app');
  await expect(page.locator('.meter-input').first()).toHaveValue('12.5');
  await page.reload();
  await expect(page.locator('.meter-input').first()).toHaveValue('12.5');
  await expect(page.locator('.meter-input').nth(1)).toHaveValue('');
  await page.locator('#open-graphs').click();
  await path(page, '/app/monitoring');
  state.expire();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await path(page, '/');
  await expect(page.locator('#graphs-dialog')).not.toBeVisible();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await page.goBack();
  await path(page, '/');
  await expect(page.locator('#report-workspace')).toBeHidden();
  expect(state.errors).toEqual([]);
});
