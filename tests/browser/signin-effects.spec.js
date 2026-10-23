import { test, expect, openSignIn } from './fixtures.js';
const account = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'test-operator',
  role: 'operator',
  mustChangePassword: false,
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/time', (route) =>
    route.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
});

test('one centered glass form replaces duplicate welcome content and stays usable in three languages', async ({
  page,
}, info) => {
  await page.route('**/api/auth', (route) =>
    route.fulfill({ json: { available: true, user: null } }),
  );
  await page.goto('/');
  await openSignIn(page);
  await expect(page.locator('#energy-title')).toBeHidden();
  await expect(page.locator('.welcome-copy, #logo-intro, #welcome-title')).toHaveCount(0);
  await expect(page.locator('.release-footer')).toBeHidden();
  for (const size of [
    { width: 1440, height: 900 },
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    for (const lang of ['en', 'zh-CN', 'id']) {
      await page.selectOption('#language-select', lang);
      const box = await page.locator('.account-card').boundingBox();
      expect(Math.abs(box.x + box.width / 2 - size.width / 2)).toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.locator('#login-username').focus();
      await page.keyboard.press('Tab');
      await expect(page.locator('#login-password')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#login-submit')).toBeFocused();
      await expect(page.locator('#login-submit')).toBeInViewport();
      await expect(page.locator('#login-raw-template')).toBeVisible();
    }
    await page.screenshot({
      path: info.outputPath('login-' + size.width + '.png'),
      fullPage: true,
    });
  }
});

test('lattice follows a pending request, clears on failure and fades into the authenticated workspace', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let respond,
    calls = 0;
  await page.route('**/api/auth', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { available: true, user: null } });
    calls++;
    const response = await new Promise((resolve) => {
      respond = resolve;
    });
    await route.fulfill(response);
  });
  await page.goto('/');
  await openSignIn(page);
  await page.fill('#login-username', account.username);
  await page.fill('#login-password', 'Synthetic test password');
  await page.click('#login-submit');
  await expect(page.locator('#signin-transition')).toBeVisible();
  await expect(page.locator('.lattice-loader')).toHaveAttribute('data-status', 'working');
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#login-submit')).toBeDisabled();
  await page.waitForTimeout(300);
  expect(calls).toBe(1);
  respond({ status: 401, json: { error: 'INVALID_CREDENTIALS' } });
  await expect(page.locator('#signin-transition')).toBeHidden();
  await expect(page.locator('#account-status')).not.toBeEmpty();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#login-submit')).toBeEnabled();
  await page.click('#login-submit');
  await expect(page.locator('#signin-transition')).toBeVisible();
  respond({ json: { available: true, user: account } });
  await expect(page.locator('#report-workspace')).toBeVisible();
  await expect(page.locator('#signin-transition')).toBeHidden();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('#login-password')).toHaveValue('');
  expect(calls).toBe(2);
  expect(errors).toEqual([]);
});

test('required password and reduced motion never wait for decorative completion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let user = null;
  await page.route('**/api/auth', (route) => {
    if (route.request().method() === 'POST') {
      const action = route.request().postDataJSON().action;
      user = { ...account, mustChangePassword: action === 'login' };
    }
    return route.fulfill({ json: { available: true, user } });
  });
  await page.goto('/');
  await openSignIn(page);
  await page.fill('#login-username', account.username);
  await page.fill('#login-password', 'Synthetic test password');
  await page.click('#login-submit');
  await expect(page.locator('#password-required')).toBeVisible();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#signin-transition')).toBeHidden();
  await expect(page.locator('#current-password')).toBeFocused();
  await expect(page.locator('#back-welcome')).toBeHidden();
});

test('lost WebGL context leaves a dark static fallback, and Back creates a fresh background', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/auth', (route) =>
    route.fulfill({ json: { available: true, user: null } }),
  );
  await page.goto('/');
  const canvas = page.locator('.energy-ascii-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await canvas.evaluate((el) =>
    el.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext(),
  );
  await expect(canvas).not.toHaveAttribute('data-ready');
  await expect(canvas).toHaveCSS('opacity', '0');
  await expect(page.locator('#energy-title')).toBeVisible();
  await openSignIn(page);
  await page.click('#back-welcome');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(canvas).toHaveCSS('opacity', '0.72');
  expect(errors).toEqual([]);
});

test('Back during a pending sign-in clears decoration and a failed response leaves native controls usable', async ({
  page,
}) => {
  let release;
  await page.route('**/api/auth', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { available: true, user: null } });
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fulfill({ status: 401, json: { error: 'INVALID_CREDENTIALS' } });
  });
  await page.goto('/');
  await openSignIn(page);
  await page.fill('#login-username', account.username);
  await page.fill('#login-password', 'Synthetic test password');
  await page.click('#login-submit');
  await expect(page.locator('#signin-transition')).toBeVisible();
  await page.click('#back-welcome');
  await expect(page.locator('#signin-transition')).toBeHidden();
  await expect(page.locator('#welcome-hero')).toBeVisible();
  release();
  await openSignIn(page);
  await expect(page.locator('#account-status')).not.toBeEmpty();
  await expect(page.locator('#login-submit')).toBeEnabled();
  await expect(page.locator('#report-workspace')).toBeHidden();
});

test('missing loader markup cannot prevent native authentication', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const overlay = document.getElementById('signin-transition');
      if (overlay) {
        overlay.remove();
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  let user = null;
  await page.route('**/api/auth', (route) => {
    if (route.request().method() === 'POST') user = account;
    return route.fulfill({ json: { available: true, user } });
  });
  await page.goto('/');
  await openSignIn(page);
  await expect(page.locator('#signin-transition')).toHaveCount(0);
  await page.fill('#login-username', account.username);
  await page.fill('#login-password', 'Synthetic test password');
  await page.click('#login-submit');
  await expect(page.locator('#report-workspace')).toBeVisible();
  expect(errors).toEqual([]);
});
