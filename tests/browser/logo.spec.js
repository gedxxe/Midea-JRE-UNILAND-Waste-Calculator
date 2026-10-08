import { test, expect } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/time', (route) =>
    route.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
});

test('logo loops with a five-second hold, exits, pauses and replays without changing sign-in fields', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth', async (route) => {
    await pending;
    await route.fulfill({ json: { available: true, user: null } });
  });
  await page.goto('/');
  const intro = page.locator('#logo-intro');
  await expect(intro).toBeVisible();
  await expect(page.locator('#report-workspace')).toBeHidden();
  expect(await intro.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBeGreaterThan(
    0,
  );
  release();
  await expect(page.locator('#login-submit')).toBeEnabled();
  await page.locator('#login-username').fill('operator-example');
  await page.locator('#login-password').fill('Synthetic test password');
  await page.locator('#pause-logo').click();
  await expect(page.locator('#pause-logo')).toHaveAttribute('aria-pressed', 'true');
  const seek = (time) =>
    intro.evaluate((el, ms) => {
      for (const animation of el.getAnimations({ subtree: true })) animation.currentTime = ms;
    }, time);
  for (const time of [2600, 5100, 7590]) {
    await seek(time);
    await expect(page.locator('.logo-whole')).toHaveCSS('opacity', '1');
    await expect(page.locator('.logo-pieces')).toHaveCSS('opacity', '0');
  }
  await page.screenshot({ path: info.outputPath('login-settled.png'), fullPage: true });
  await seek(8450);
  await expect(page.locator('.logo-whole')).toHaveCSS('opacity', '0');
  await intro.screenshot({ path: info.outputPath('exit.png') });
  await seek(9600);
  await expect(page.locator('.logo-pieces')).toHaveCSS('opacity', '0');
  await seek(10900);
  expect(
    await page.locator('.fragment-0').evaluate((el) => Number(getComputedStyle(el).opacity)),
  ).toBeGreaterThan(0);
  expect(
    await intro.evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .every((a) => a.effect.getTiming().iterations === Infinity),
    ),
  ).toBe(true);
  const before = await page.locator('#login-submit').boundingBox();
  await page.locator('#replay-logo').click();
  expect(
    await intro.evaluate((el) =>
      el.getAnimations({ subtree: true }).some((a) => a.playState === 'running'),
    ),
  ).toBe(true);
  await page.locator('#pause-logo').click();
  for (const time of [350, 900, 1500]) {
    await intro.evaluate((el, ms) => {
      for (const animation of el.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = ms;
      }
    }, time);
    await intro.screenshot({ path: info.outputPath(`reconstruction-${time}.png`) });
  }
  await expect(page.locator('#login-username')).toHaveValue('operator-example');
  await expect(page.locator('#login-password')).toHaveValue('Synthetic test password');
  expect(await page.locator('#login-submit').boundingBox()).toEqual(before);
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    await expect(page.locator('#replay-logo')).toHaveAccessibleName(/.+/);
    await expect(page.locator('#pause-logo')).toHaveAccessibleName(/.+/);
    await expect(page.locator('#pause-logo')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await intro.evaluate((el) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(intro).toHaveAttribute('data-suspended', 'true');
  expect(
    await intro.evaluate((el) =>
      el.getAnimations({ subtree: true }).every((a) => a.playState === 'paused'),
    ),
  ).toBe(true);
  await intro.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Returning to the tab must preserve an operator's manual pause.
  await expect(page.locator('#pause-logo')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#pause-logo').click();
  expect(
    await intro.evaluate((el) =>
      el.getAnimations({ subtree: true }).every((a) => a.playState === 'running'),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('reduced motion and the off switch show a complete static logo even without account service', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/auth', (route) =>
    route.fulfill({ json: { available: false, user: null } }),
  );
  await page.goto('/');
  const intro = page.locator('#logo-intro');
  await expect(intro).toBeVisible();
  await expect(page.locator('.logo-whole')).toHaveCSS('opacity', '1');
  await expect(page.locator('#replay-logo')).toBeHidden();
  await expect(page.locator('#pause-logo')).toBeHidden();
  expect(await intro.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  await intro.evaluate((el) => {
    el.dataset.motion = 'off';
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.logo-whole')).toHaveCSS('opacity', '1');
  await expect(page.locator('#replay-logo')).toBeHidden();
  await expect(page.locator('#pause-logo')).toBeHidden();
  expect(await intro.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(page.locator('#report-workspace')).toBeHidden();
});

test('an established session removes the intro and logout restores it without exposing readings', async ({
  page,
}) => {
  let user = {
    id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
    username: 'test-operator',
    role: 'operator',
    mustChangePassword: false,
  };
  await page.route('**/api/auth', (route) => {
    if (route.request().method() === 'POST') user = null;
    return route.fulfill({ json: { available: true, user } });
  });
  await page.goto('/');
  await expect(page.locator('#report-workspace')).toBeVisible();
  await expect(page.locator('#logo-intro')).toBeHidden();
  expect(
    await page.locator('#logo-intro').evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.locator('#load-example').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#logout').click();
  await expect(page.locator('#logo-intro')).toBeVisible();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('.meter-input').first()).toHaveValue('');
  await expect(page.locator('#login-username')).toBeFocused();
});
