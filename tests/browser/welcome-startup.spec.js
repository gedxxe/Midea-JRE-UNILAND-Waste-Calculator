import { test, expect, openSignIn } from './fixtures.js';
import { LANGUAGE_KEY } from '../../i18n/index.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user: null } }));
});

for (const [language, title] of [
  ['en', 'Energy Record'],
  ['zh-CN', '能源记录'],
  ['id', 'Catatan Energi'],
]) {
  test(`first-paint title is blank until its animation is ready in ${language}`, async ({
    page,
  }) => {
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: LANGUAGE_KEY,
      value: language,
    });
    let startApp, startTitle;
    const appHeld = new Promise((resolve) => {
      startApp = resolve;
    });
    const titleHeld = new Promise((resolve) => {
      startTitle = resolve;
    });
    await page.route('**/app.js', async (r) => {
      await appHeld;
      await r.continue();
    });
    await page.route('**/ui/welcome-tech.js', async (r) => {
      await titleHeld;
      await r.continue();
    });
    try {
      await page.goto('/', { waitUntil: 'commit' });
      await expect(page.locator('#energy-title')).toHaveCSS('opacity', '0');
      await expect(page.locator('.energy-tech-canvas')).toHaveCSS('opacity', '0');
      startApp();
      await expect(page.locator('#energy-title')).toHaveText(title);
      await expect(page.locator('#energy-title')).toHaveCSS('opacity', '0');
      await expect(page.locator('.energy-tech-canvas')).toHaveCSS('opacity', '0');
      // The title stays semantic for assistive technology even while visually blank.
      await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(1);
      startTitle();
      await expect(page.locator('.energy-wordmark')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('.energy-wordmark')).toHaveAttribute('data-tech-intro', 'complete');
      await expect(page.locator('.energy-tech-canvas')).toHaveCSS('opacity', '1');
      await expect(page.locator('#energy-title')).toHaveCSS('opacity', '0');
    } finally {
      startApp();
      startTitle();
    }
  });
}

test('Back button is already laid out in the first circle frame without moving the form afterward', async ({
  page,
}) => {
  await page.goto('/');
  const before = await page.locator('#open-login').evaluate((el) => {
    el.click();
    const surface = document.querySelector('#application-surface');
    surface.getAnimations()[0].pause();
    const rect = (selector) => {
      const b = document.querySelector(selector).getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    return {
      back: rect('#back-welcome'),
      card: rect('.account-card'),
      field: rect('#login-username'),
      inert: surface.inert,
    };
  });
  expect(before.inert).toBe(true);
  expect(before.back.width).toBeGreaterThan(100);
  expect(before.back.height).toBeGreaterThanOrEqual(40);
  await expect(page.locator('#back-welcome svg')).toHaveCount(1);
  await page.locator('#application-surface').evaluate((el) => el.getAnimations()[0].finish());
  await expect(page.locator('#login-username')).toBeFocused();
  const after = await page.evaluate(() => {
    const rect = (selector) => {
      const b = document.querySelector(selector).getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    return {
      back: rect('#back-welcome'),
      card: rect('.account-card'),
      field: rect('#login-username'),
    };
  });
  for (const name of ['back', 'card', 'field'])
    for (const key of ['x', 'y', 'width', 'height'])
      expect(after[name][key]).toBeCloseTo(before[name][key], 1);
  await page.getByRole('button', { name: 'Back to welcome', exact: true }).click();
  await expect(page.locator('#open-login')).toBeFocused();
});

test('a delayed background cannot hold the title animation or sign-in hostage', async ({
  page,
}) => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/ui/welcome-ascii.js', async (r) => {
    await held;
    await r.continue();
  });
  try {
    await page.goto('/');
    await expect(page.locator('.energy-wordmark')).toHaveAttribute('data-tech-intro', 'complete');
    await openSignIn(page);
    release();
    await expect(page.locator('#report-workspace')).toBeHidden();
    await expect(page.locator('#login-username')).toBeFocused();
  } finally {
    release();
  }
});

test('a stalled title falls back once and a late response cannot restart the intro', async ({
  page,
}) => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/ui/welcome-tech.js', async (r) => {
    await held;
    await r.continue();
  });
  try {
    await page.goto('/');
    await expect(page.locator('#energy-title')).toHaveCSS('opacity', '0');
    await expect(page.locator('.energy-wordmark')).toHaveAttribute('data-title-fallback', 'true');
    await expect(page.locator('#energy-title')).toHaveCSS('opacity', '1');
    const arrived = page.waitForResponse((r) => r.url().endsWith('/ui/welcome-tech.js'));
    release();
    await arrived;
    await openSignIn(page);
    await page.locator('#back-welcome').click();
    await expect(page.locator('#open-login')).toBeFocused();
    await expect(page.locator('#energy-title')).toHaveCSS('opacity', '1');
    await expect(page.locator('.energy-wordmark')).not.toHaveAttribute('data-ready');
    await expect(page.locator('#report-workspace')).toBeHidden();
  } finally {
    release();
  }
});

test('without JavaScript a plain title remains available', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(baseURL);
    await expect(page.locator('.energy-title-noscript')).toBeVisible();
    await expect(page.locator('.energy-title-noscript')).toHaveText('Energy Record');
    await expect(page.locator('#report-workspace')).toBeHidden();
  } finally {
    await context.close();
  }
});

test('late effect imports cannot reopen welcome or disturb an authenticated workspace', async ({
  page,
}) => {
  const user = {
    id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
    username: 'startup-operator',
    role: 'operator',
    mustChangePassword: false,
  };
  let signedIn = false,
    release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth', (r) => {
    if (r.request().method() === 'POST') signedIn = r.request().postDataJSON().action === 'login';
    return r.fulfill({ json: { available: true, user: signedIn ? user : null } });
  });
  for (const name of ['welcome-tech', 'welcome-ascii'])
    await page.route('**/ui/' + name + '.js', async (r) => {
      await held;
      await r.continue();
    });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto('/app');
    await openSignIn(page);
    await page.fill('#login-username', user.username);
    await page.fill('#login-password', 'Synthetic startup password');
    await page.click('#login-submit');
    await expect(page.locator('#report-workspace')).toBeVisible();
    release();
    await page.evaluate(() =>
      Promise.all([import('/ui/welcome-tech.js'), import('/ui/welcome-ascii.js')]).then(() => true),
    );
    await expect(page.locator('body')).toHaveAttribute('data-welcome', 'workspace');
    await expect(page.locator('#welcome-hero')).toBeHidden();
    await expect(page.locator('#back-welcome')).toBeHidden();
    await expect(page.locator('.energy-wordmark')).not.toHaveAttribute('data-ready');
    await expect(page.locator('.energy-ascii-canvas')).not.toHaveAttribute('data-ready');
    await expect(page.locator('#login-password')).toHaveValue('');
    page.once('dialog', (d) => d.accept());
    await page.click('#logout');
    await expect(page.locator('#report-workspace')).toBeHidden();
    await expect(page.locator('#welcome-hero')).toBeVisible();
    await expect(page.locator('#back-welcome')).toBeHidden();
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
