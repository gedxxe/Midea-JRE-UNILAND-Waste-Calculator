import { test, expect, openSignIn } from './fixtures.js';

const account = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'glass-operator',
  role: 'operator',
  mustChangePassword: false,
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: { available: true, user: r.request().method() === 'POST' ? account : null },
    }),
  );
});

test('glass template has icon-only close, reversible native motion and bounded resource lifetime', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.glassUrls = new Set();
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) =>
      window.cspViolations.push(e.violatedDirective),
    );
    const create = URL.createObjectURL,
      revoke = URL.revokeObjectURL;
    URL.createObjectURL = function (blob) {
      const url = create.call(this, blob);
      if (blob.type === 'image/svg+xml') window.glassUrls.add(url);
      return url;
    };
    URL.revokeObjectURL = function (url) {
      window.glassUrls.delete(url);
      return revoke.call(this, url);
    };
  });
  await page.goto('/');
  await page.selectOption('#welcome-language', 'zh-CN');
  await expect(page.locator('#energy-title')).toHaveText('能源记录');
  expect(
    await page.locator('.energy-language').evaluate((el) => getComputedStyle(el, '::after').right),
  ).toBe('18px');
  const opener = page.locator('#welcome-hero [data-open-raw-template]');
  const dialog = page.locator('#raw-template-dialog');
  const close = dialog.locator('[data-close-dialog]');
  await opener.click();
  await expect(dialog).toHaveAttribute('data-glass', 'svg');
  await expect(dialog).not.toHaveAttribute('data-motion', 'opening');
  await expect(close).toHaveAccessibleName('关闭');
  expect((await close.textContent()).trim()).toBe('');
  await expect(close.locator('svg')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('template-glass-dark.png') });
  await page.locator('#download-raw-template').scrollIntoViewIfNeeded();
  await expect(page.locator('#download-raw-template')).toBeInViewport();
  await close.scrollIntoViewIfNeeded();
  // Snapshot within the click task verifies the native dialog remains modal during exit.
  expect(
    await close.evaluate((el) => {
      el.click();
      const d = el.closest('dialog');
      return { open: d.open, inert: d.inert, motion: d.dataset.motion };
    }),
  ).toEqual({ open: true, inert: true, motion: 'closing' });
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.glassUrls.size)).toBe(0);
  await opener.click();
  // A stale close event must not cancel a freshly opened dialog or its glass effect.
  await page.evaluate(() => {
    document.getElementById('raw-template-dialog').close();
    document.querySelector('#welcome-hero [data-open-raw-template]').click();
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/energy-glass/);
  await expect(dialog).toHaveAttribute('data-glass', 'svg');
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await openSignIn(page);
  await expect(page.locator('.account-card')).toHaveAttribute('data-glass', 'svg');
  expect(
    await page.locator('.language-control').evaluate((el) => getComputedStyle(el, '::after').right),
  ).toBe('18px');
  await page.locator('#login-raw-template').click();
  await expect(dialog).toHaveAttribute('data-glass', 'svg');
  await page.screenshot({ path: info.outputPath('template-glass-light.png') });
  await close.click();
  await expect(dialog).toBeHidden();
  await page.locator('#back-welcome').click();
  await expect(page.locator('#open-login')).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.glassUrls.size)).toBe(0);
  expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
  expect(errors).toEqual([]);
});

test('missing optional glass keeps native templates and sign-in usable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/ui/glass-surface.js', (r) => r.abort('failed'));
  await page.goto('/');
  await page.locator('#welcome-hero [data-open-raw-template]').click();
  const dialog = page.locator('#raw-template-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/energy-glass/);
  await expect(dialog.locator('svg.glass-filter-defs')).toHaveCount(0);
  await expect(page.locator('#raw-template-preview')).toHaveValue(/DD\/MM\/YYYY/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await openSignIn(page);
  await expect(page.locator('.account-card')).toHaveClass(/energy-glass/);
  await page.fill('#login-username', account.username);
  await page.fill('#login-password', 'Synthetic test password');
  await page.click('#login-submit');
  await expect(page.locator('#report-workspace')).toBeVisible();
  await expect(page.locator('.account-card')).not.toHaveClass(/energy-glass/);
  expect(errors).toEqual([]);
});

test('short-screen template keeps its frame and actions visible while native scrolling chains', async ({
  page,
}, info) => {
  await page.setViewportSize(
    info.project.name === 'mobile' ? { width: 390, height: 600 } : { width: 1280, height: 540 },
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#welcome-hero [data-open-raw-template]').click();
  const dialog = page.locator('#raw-template-dialog');
  const body = dialog.locator('.raw-template-body');
  const preview = page.locator('#raw-template-preview');
  const heading = dialog.locator('.dialog-heading');
  const actions = dialog.locator('.raw-export-actions');
  await expect(dialog).toBeVisible();
  await expect(heading).toBeInViewport();
  await expect(page.locator('#copy-raw-template')).toBeInViewport();
  await expect(page.locator('#download-raw-template')).toBeInViewport();
  const frame = { heading: await heading.boundingBox(), actions: await actions.boundingBox() };
  const position = await body.evaluate((el) => {
    const p = el.querySelector('textarea');
    el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight - 40);
    p.scrollTop = 0;
    return el.scrollTop;
  });
  const p = await preview.boundingBox(),
    b = await body.boundingBox();
  await page.mouse.move(
    p.x + p.width / 2,
    (Math.max(p.y, b.y) + Math.min(p.y + p.height, b.y + b.height)) / 2,
  );
  await page.mouse.wheel(0, 300);
  await expect.poll(() => preview.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.mouse.wheel(500, 0);
  await expect.poll(() => preview.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await preview.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.mouse.wheel(0, 600);
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(position);
  expect(await heading.boundingBox()).toEqual(frame.heading);
  expect(await actions.boundingBox()).toEqual(frame.actions);
  const bounds = await dialog.boundingBox(),
    viewport = page.viewportSize();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
