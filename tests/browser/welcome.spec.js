import { test, expect, openSignIn } from './fixtures.js';

const account = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'welcome-operator',
  role: 'operator',
  mustChangePassword: false,
};
async function setup(page, options = {}) {
  let user = options.user || null;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/time', (route) =>
    route.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/auth', (route) => {
    if (route.request().method() === 'POST')
      user = route.request().postDataJSON().action === 'login' ? account : null;
    return route.fulfill({ json: { available: true, user } });
  });
  return errors;
}
async function countTextFrames(page) {
  await page.addInitScript(() => {
    window.textFrames = 0;
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('energy-tech-canvas')) window.textFrames++;
      return clear.apply(this, args);
    };
  });
}
async function stopped(page) {
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => window.textFrames);
  await page.waitForTimeout(160);
  expect(await page.evaluate(() => window.textFrames)).toBe(before);
}
async function moving(page) {
  const before = await page.evaluate(() => window.textFrames);
  await expect.poll(() => page.evaluate(() => window.textFrames)).toBeGreaterThan(before + 1);
}

test('dark welcome hides the form until keyboard entry and preserves its circle transition and back action', async ({
  page,
}, info) => {
  const errors = await setup(page);
  await page.goto('/');
  await expect(page.locator('#energy-title')).toHaveText('Energy Record');
  await expect(page.locator('#welcome-hero')).toBeVisible();
  await expect(page.locator('#application-surface')).toHaveAttribute('inert', '');
  await expect(page.locator('#login-form')).toBeHidden();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('.energy-brand img')).toHaveJSProperty('naturalWidth', 1448);
  await page.locator('#login-username').evaluate((el) => el.focus());
  await expect(page.locator('#login-username')).not.toBeFocused();
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#welcome-language').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('#energy-title')).toHaveText('Energy Record');
    await expect(page.locator('#login-form')).toBeHidden();
  }
  await page.screenshot({ path: info.outputPath('energy-welcome.png'), fullPage: true });
  await page.locator('#open-login').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#application-surface')).toHaveClass('welcome-revealing');
  await expect(page.locator('#application-surface')).toHaveAttribute('inert', '');
  await expect(page.locator('#welcome-hero')).toBeHidden();
  await expect(page.locator('#login-username')).toBeFocused();
  await page.fill('#login-username', 'synthetic-name');
  await page.fill('#login-password', 'Synthetic password for welcome');
  await page.locator('#back-welcome').click();
  await expect(page.locator('#open-login')).toBeFocused();
  await expect(page.locator('#login-form')).toBeHidden();
  await openSignIn(page);
  await expect(page.locator('#login-username')).toHaveValue('synthetic-name');
  await expect(page.locator('#login-password')).toHaveValue('Synthetic password for welcome');
  await page.locator('#login-submit').click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('#report-workspace')).toBeVisible();
  await expect(page.locator('#welcome-hero')).toBeHidden();
  expect(errors).toEqual([]);
});

test('text motion obeys pause, tab visibility, off switch, reduced motion and session boundaries', async ({
  page,
}) => {
  const errors = await setup(page);
  await countTextFrames(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.textFrames)).toBeGreaterThan(2);
  const canvas = page.locator('.energy-tech-canvas');
  expect(await canvas.evaluate((el) => el.width <= el.clientWidth * 1.5 + 1)).toBe(true);
  const before = await page.evaluate(() => window.textFrames);
  await page.waitForTimeout(600);
  expect((await page.evaluate(() => window.textFrames)) - before).toBeLessThanOrEqual(21);
  await page.click('#pause-welcome');
  await stopped(page);
  await page.click('#pause-welcome');
  await moving(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await stopped(page);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await moving(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stopped(page);
  await expect(page.locator('#energy-title')).toHaveCSS('opacity', '1');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await moving(page);
  await page.locator('#welcome-hero').evaluate((el) => {
    el.dataset.motion = 'off';
  });
  await stopped(page);
  await expect(page.locator('#energy-title')).toHaveCSS('opacity', '1');
  await page.locator('#welcome-hero').evaluate((el) => {
    el.dataset.motion = 'on';
  });
  await moving(page);
  await openSignIn(page);
  await stopped(page);
  await page.fill('#login-username', account.username);
  await page.fill('#login-password', 'Synthetic password for welcome');
  await page.click('#login-submit');
  await expect(page.locator('#report-workspace')).toBeVisible();
  await stopped(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#logout');
  await expect(page.locator('#open-login')).toBeFocused();
  await moving(page);
  await expect(page.locator('.meter-input').first()).toHaveValue('');
  expect(errors).toEqual([]);
});

for (const failure of ['module', 'canvas'])
  test(`${failure} failure retains the HTML title and functional sign-in`, async ({ page }) => {
    const errors = await setup(page);
    if (failure === 'module')
      await page.route('**/ui/welcome-tech.js', (route) => route.abort('failed'));
    else
      await page.addInitScript(() => {
        HTMLCanvasElement.prototype.getContext = () => {
          throw new Error('Synthetic unavailable canvas');
        };
      });
    await page.goto('/');
    await expect(page.locator('#energy-title')).toHaveCSS('opacity', '1');
    await expect(page.locator('#login-form')).toBeHidden();
    await openSignIn(page);
    await page.fill('#login-username', account.username);
    await page.fill('#login-password', 'Synthetic password for welcome');
    await page.click('#login-submit');
    await expect(page.locator('#report-workspace')).toBeVisible();
    expect(errors).toEqual([]);
  });

test('reduced motion and interrupted circle reveals leave a usable form without horizontal overflow', async ({
  page,
}) => {
  const errors = await setup(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const size of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    for (const language of ['en', 'zh-CN', 'id']) {
      await page.selectOption('#welcome-language', language);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await openSignIn(page);
      await expect(page.locator('#application-surface')).not.toHaveClass('welcome-revealing');
      await expect(page.locator('#login-username')).toBeFocused();
      await page.click('#back-welcome');
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const button = document.getElementById('open-login');
    button.click();
    button.click();
  });
  await expect(page.locator('#application-surface')).toHaveClass('welcome-revealing');
  await page.setViewportSize({ width: 720, height: 500 });
  await expect(page.locator('#login-username')).toBeFocused();
  await expect(page.locator('#application-surface')).not.toHaveClass('welcome-revealing');
  await page.click('#back-welcome');
  await page.evaluate(() => document.getElementById('open-login').click());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#login-username')).toBeFocused();
  expect(errors).toEqual([]);
});

test('required password gates bypass the welcome while an existing session opens its requested route', async ({
  page,
}) => {
  const errors = await setup(page, { user: { ...account, mustChangePassword: true } });
  await page.goto('/app/monitoring');
  await expect(page.locator('#password-required')).toBeVisible();
  await expect(page.locator('#welcome-hero')).toBeHidden();
  await expect(page.locator('#back-welcome')).toBeHidden();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#current-password')).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test('HTML motion-off leaves visible controls and offscreen text does not keep drawing', async ({
  page,
}) => {
  const errors = await setup(page);
  await countTextFrames(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.textFrames)).toBeGreaterThan(2);
  await page.setViewportSize({ width: 900, height: 180 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() =>
      page.locator('.energy-wordmark').evaluate((el) => el.getBoundingClientRect().bottom),
    )
    .toBeLessThan(0);
  await stopped(page);
  await page.locator('.energy-wordmark').scrollIntoViewIfNeeded();
  await moving(page);
  await page.locator('#welcome-hero').evaluate((el) => {
    el.dataset.motion = 'off';
  });
  await stopped(page);
  await expect(page.locator('.energy-topline')).toHaveCSS('opacity', '1');
  await expect(page.locator('.energy-bottomline')).toHaveCSS('opacity', '1');
  await expect(page.locator('#pause-welcome')).toBeHidden();
  await openSignIn(page);
  await expect(page.locator('#application-surface')).not.toHaveClass('welcome-revealing');
  expect(errors).toEqual([]);
});
