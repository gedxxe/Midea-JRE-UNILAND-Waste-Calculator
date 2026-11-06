import { test, expect, openSignIn } from './fixtures.js';

const operator = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'route-operator',
  role: 'operator',
  mustChangePassword: false,
};

test('Power Meter Reading supports a protected direct URL and a clear disabled state without device credentials', async ({
  page,
}) => {
  const state = await setup(page);
  let reads = 0;
  await page.route('**/api/iot-readings?**', (route) => {
    reads++;
    return route.fulfill({ json: { enabled: false, devices: [], readings: [] } });
  });
  await page.goto('/iot-power-meter-reading');
  await expect(page.locator('#iot-dialog')).toBeVisible();
  await expect(page.locator('#iot-status')).toContainText('not enabled');
  await expect(page.locator('#iot-auto')).not.toBeChecked();
  await expect(page.locator('#iot-schedule')).toContainText('08:00');
  await expect(page.locator('#iot-data')).toHaveText('');
  await page.locator('[data-close-dialog="iot-dialog"]').click();
  await expect(page).toHaveURL(/\/app$/);
  expect(reads).toBe(1);
  expect(state.errors).toEqual([]);
});

test('manual meter read has compact pending feedback and cannot be spammed from UI', async ({ page }) => {
  await setup(page);
  let requests = 0;
  let pending = false;
  let requestedAt = null;
  await page.route('**/api/iot-readings?**', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        server_time: new Date().toISOString(),
        connection: { manual_refresh_enabled: true, telemetry_interval_seconds: 600 },
        devices: [{
          device_id: 'sample-source', plant: 'JRE', meter_id: 'meter-1',
          meter_profile: 'fort', active: true,
          last_received_at: new Date().toISOString(),
          latest_reading: null, refresh_pending: pending,
          refresh_requested_at: requestedAt, refresh_completed_at: null,
        }],
        readings: [],
      },
    }),
  );
  await page.route('**/api/iot-refresh', (route) => {
    requests++;
    pending = true;
    requestedAt = new Date().toISOString();
    return route.fulfill({ status: 202, json: { queued: true, requested_at: requestedAt } });
  });
  await page.goto('/iot-power-meter-reading');
  const read = page.locator('.iot-read-now');
  await expect(read).toBeEnabled();
  await expect(read).toContainText('Read now');
  await read.click();
  await expect(read).toHaveAttribute('data-state', 'pending');
  await expect(read).toBeDisabled();
  await read.evaluate((button) => button.click());
  expect(requests).toBe(1);
  await page.locator('[data-close-dialog="iot-dialog"]').click();
  await expect(page.locator('#iot-data')).toHaveText('');
});

test('Power Meter Reading never fetches private telemetry before login', async ({ page }) => {
  await setup(page, { signedIn: false });
  let reads = 0;
  await page.route('**/api/iot-readings?**', (r) => {
    reads++;
    return r.fulfill({ json: { enabled: true, devices: [], readings: [] } });
  });
  await page.goto('/iot-power-meter-reading');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#iot-dialog')).not.toBeVisible();
  expect(reads).toBe(0);
});

test('Power Meter Reading renders exact received values as text and filters event kinds', async ({
  page,
}) => {
  const state = await setup(page);
  const requests = [];
  await page.route('**/api/iot-readings?**', (route) => {
    requests.push(new URL(route.request().url()).searchParams.get('event_type'));
    return route.fulfill({
      json: {
        enabled: true,
        devices: [
          {
            device_id: 'test-source',
            plant: 'JRE',
            meter_id: 'meter-1',
            meter_profile: 'fort',
            active: true,
            last_received_at: '2026-11-01T01:00:03Z',
          },
        ],
        readings: [
          {
            device_id: 'test-source',
            event_id: 'sample-1',
            captured_at: '2026-11-01T01:00:00Z',
            received_at: '2026-11-01T01:00:03Z',
            event_type: 'checkpoint',
            payload: { readings: { active_energy_kwh: '123.000001' } },
          },
        ],
      },
    });
  });
  await page.goto('/iot-power-meter-reading');
  await expect(page.locator('#iot-data')).toContainText('123.000001 kWh');
  await page.locator('#iot-kind').selectOption('checkpoint');
  await expect.poll(() => requests.at(-1)).toBe('checkpoint');
  expect(await page.locator('#iot-data input[type="password"]').count()).toBe(0);
  expect(state.errors).toEqual([]);
});
test('diagnostic meter cards show latest kWh and phase currents while operator controls stay hidden', async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  await page.route('**/api/iot-readings?**', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        devices: [
          {
            device_id: 'synthetic-source',
            plant: 'UNILAND',
            meter_id: 'custom-meter',
            meter_profile: 'custom',
            active: true,
            last_received_at: '2026-11-01T01:00:03Z',
            latest_reading: {
              captured_at: '2026-11-01T01:00:00Z',
              readings: {
                active_energy_kwh: '123.000001',
                current_l1_a: '12.01',
                current_l2_a: '11.9',
                current_l3_a: '0',
              },
            },
          },
        ],
        readings: [],
      },
    }),
  );
  await page.goto('/iot-power-meter-reading');
  await expect(page.locator('.iot-device-card')).toContainText('123.000001 kWh');
  await expect(page.locator('.iot-device-card')).toContainText('L1 12.01 A · L2 11.9 A · L3 0 A');
  await expect(page.locator('#iot-management')).not.toBeVisible();
  await expect(page.locator('.iot-device-card button')).toHaveCount(0);
  await page.screenshot({ path: '.vercel/iot-current-' + testInfo.project.name + '.png' });
  expect(state.errors).toEqual([]);
});

test('device presence is independent of readings, expires without refreshing and fails to unverified on API errors', async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  await page.clock.install({ time: new Date('2026-11-05T02:00:00Z') });
  let fail = false,
    reads = 0;
  await page.route('**/api/iot-readings?**', (route) => {
    reads++;
    if (fail) return route.fulfill({ status: 503, json: { error: 'NOT_CONFIGURED' } });
    return route.fulfill({
      json: {
        enabled: true,
        server_time: '2026-11-05T02:00:00Z',
        readings: [],
        devices: [
          {
            device_id: 'connected-node',
            plant: 'JRE',
            meter_id: 'warehouse',
            meter_profile: 'fort',
            active: true,
            last_received_at: '2026-11-05T02:00:00Z',
            latest_reading: null,
          },
          {
            device_id: 'unseen-node',
            plant: 'UNILAND',
            meter_id: 'other',
            meter_profile: 'fort',
            active: true,
            last_received_at: null,
            latest_reading: null,
          },
          {
            device_id: 'disabled-node',
            plant: 'JRE',
            meter_id: 'old',
            meter_profile: 'fort',
            active: false,
            last_received_at: '2026-11-05T02:00:00Z',
            latest_reading: null,
          },
        ],
      },
    });
  });
  await page.goto('/iot-power-meter-reading');
  const connected = page.locator('.iot-device-card').filter({ hasText: 'connected-node' });
  await expect(connected.locator('.iot-presence')).toHaveText('Connected');
  await expect(connected).toContainText('No readings received yet.');
  await expect(connected.locator('.iot-reading')).toHaveCount(0);
  await page.clock.setSystemTime(new Date('2001-01-01T00:00:00Z'));
  await expect(connected.locator('.iot-presence')).toHaveText('Connected');
  await expect(
    page.locator('.iot-device-card').filter({ hasText: 'unseen-node' }).locator('.iot-presence'),
  ).toHaveText('Unverified');
  await expect(
    page.locator('.iot-device-card').filter({ hasText: 'disabled-node' }).locator('.iot-presence'),
  ).toHaveText('Disabled');
  await page.screenshot({ path: '.vercel/iot-presence-' + testInfo.project.name + '.png' });
  await page.clock.fastForward(181000);
  await expect(connected.locator('.iot-presence')).toHaveText('Offline');
  expect(reads).toBe(1);
  await page.locator('#iot-refresh').click();
  await expect(connected.locator('.iot-presence')).toHaveText('Connected');
  fail = true;
  await page.locator('#iot-refresh').click();
  await expect(page.locator('#iot-status')).toContainText('could not be loaded');
  await expect(connected.locator('.iot-presence')).toHaveText('Unverified');
  await page.locator('[data-close-dialog="iot-dialog"]').click();
  await page.clock.fastForward(300000);
  await expect(page.locator('#iot-data')).toBeEmpty();
  expect(state.errors).toEqual([]);
});

test('admin adds arbitrary diagnostic IDs, sees a one-time key and clears it on close without report writes', async ({
  page,
}, testInfo) => {
  const state = await setup(page, { role: 'admin' });
  const requests = [];
  let device;
  let reportWrites = 0;
  const key = 'k'.repeat(43);
  await page.route('**/api/reports', (route) => {
    if (route.request().method() === 'POST') reportWrites++;
    return route.fulfill({ json: { reports: [] } });
  });
  await page.route('**/api/iot-readings?**', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        devices: device ? [device] : [],
        readings: [],
        connection: { schema_version: 1, endpoint: 'https://iot.example.com/api/iot-ingest' },
      },
    }),
  );
  await page.route('**/api/iot-devices', (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    device = { ...body, active: true, last_received_at: null };
    return route.fulfill({
      status: 201,
      json: {
        device,
        credential: key,
        connection: { schema_version: 1, endpoint: 'https://iot.example.com/api/iot-ingest' },
      },
    });
  });
  await page.goto('/iot-power-meter-reading');
  await page.locator('#iot-add').click();
  await page.locator('#iot-plant').selectOption('UNILAND');
  await page.locator('#iot-source-id').fill('custom-lora-source');
  await page.locator('#iot-meter-id').fill('custom-warehouse');
  await page.locator('#iot-profile').fill('fort');
  await page.locator('#iot-device-form button[type="submit"]').click();
  await expect(page.locator('#iot-credential')).toBeVisible();
  await expect(page.locator('#iot-key')).toHaveValue(key);
  await expect(page.locator('#iot-endpoint')).toHaveValue('https://iot.example.com/api/iot-ingest');
  await expect(page.locator('.iot-device-card')).toContainText('custom-warehouse / fort');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#iot-config-download').click(),
  ]);
  expect(download.suggestedFilename()).toBe('iot_credentials.local.h');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const config = Buffer.concat(chunks).toString('utf8');
  expect(config).toContain('#define IOT_DEV_ENDPOINT "https://iot.example.com/api/iot-ingest"');
  expect(config).toContain('#define IOT_DEV_BEARER "' + key + '"');
  expect(requests).toEqual([
    {
      action: 'create',
      plant: 'UNILAND',
      device_id: 'custom-lora-source',
      meter_id: 'custom-warehouse',
      meter_profile: 'fort',
    },
  ]);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain(key);
  await page.locator('#iot-key-dismiss').click();
  await expect(page.locator('#iot-key')).toHaveValue('');
  await expect(page.locator('#iot-config-download')).toBeDisabled();
  await page.screenshot({ path: '.vercel/iot-management-' + testInfo.project.name + '.png' });
  await page.locator('[data-close-dialog="iot-dialog"]').click();
  await page.locator('#open-iot').click();
  await expect(page.locator('#iot-key')).toHaveValue('');
  expect(reportWrites).toBe(0);
  expect(state.errors).toEqual([]);
});

test('closing diagnostics while a key request is pending discards late private responses', async ({
  page,
}) => {
  const state = await setup(page, { role: 'admin' });
  let release,
    started = false;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/iot-readings?**', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        devices: [],
        readings: [],
        connection: { schema_version: 1, endpoint: 'https://iot.example.com/api/iot-ingest' },
      },
    }),
  );
  await page.route('**/api/iot-devices', async (route) => {
    started = true;
    await pending;
    await route
      .fulfill({
        status: 201,
        json: {
          device: { device_id: 'late-source', meter_id: 'meter', meter_profile: 'profile' },
          credential: 's'.repeat(43),
        },
      })
      .catch(() => {});
  });
  await page.goto('/iot-power-meter-reading');
  await page.locator('#iot-add').click();
  await page.locator('#iot-source-id').fill('late-source');
  await page.locator('#iot-meter-id').fill('meter');
  await page.locator('#iot-profile').fill('profile');
  await page.locator('#iot-device-form button[type="submit"]').click();
  await expect.poll(() => started).toBe(true);
  await expect(page.locator('#iot-device-form button[type="submit"]')).toBeDisabled();
  await page.locator('[data-close-dialog="iot-dialog"]').click();
  release();
  await page.locator('#open-iot').click();
  await expect(page.locator('#iot-status')).toContainText('No devices');
  await expect(page.locator('#iot-credential')).not.toBeVisible();
  await expect(page.locator('#iot-key')).toHaveValue('');
  expect(state.errors).toEqual([]);
});

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
