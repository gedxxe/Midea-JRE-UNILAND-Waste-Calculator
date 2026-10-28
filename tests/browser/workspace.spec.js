import { test, expect, modernWorkspace } from './fixtures.js';
import { excelWorkspace } from '../fixtures/excel-periods.mjs';

async function setup(page, { role = 'admin', theme = true } = {}) {
  let workspace = modernWorkspace(excelWorkspace()),
    version = 1;
  const errors = [];
  let user = {
    id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
    username: 'engineering-operator-long-name',
    role,
    mustChangePassword: false,
  };
  page.on('pageerror', (e) => errors.push(e.message));
  if (!theme) await page.route('**/workspace.css', (r) => r.abort());
  await page.route('**/api/auth', (r) => {
    if (r.request().method() === 'POST' && r.request().postDataJSON().action === 'logout')
      user = null;
    return r.fulfill({ json: { available: true, user } });
  });
  await page.route('**/api/time', (r) =>
    r.fulfill({
      json: {
        unixMs: Date.UTC(2026, 9, 28, 1),
        source: 'time.cloudflare.com',
        protocol: 'NTP',
        sampleAgeMs: 0,
        uncertaintyMs: 5,
        stratum: 3,
      },
    }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      workspace = r.request().postDataJSON().workspace;
      version++;
    }
    return r.fulfill({ json: { workspace, version, updated_at: '2026-10-28T01:00:00Z' } });
  });
  await page.goto('/app');
  await expect(page.locator('#report-workspace')).toBeVisible();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  await page.locator('#dismiss-guide').click();
  return errors;
}

test('workspace controls fit across languages and preserve entry, period tools and report bytes', async ({
  page,
}, info) => {
  const errors = await setup(page);
  for (const plant of ['JRE', 'UNILAND']) {
    await page.locator(`[data-plant="${plant}"]`).click();
    const report = await page.locator('#report-preview').inputValue();
    for (const language of ['en', 'zh-CN', 'id']) {
      await page.locator('#language-select').selectOption(language);
      await expect(page.locator('#report-preview')).toHaveValue(report);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      for (const id of [
        'save-report',
        'open-graphs',
        'open-history',
        'open-guide',
        'open-users',
        'logout',
      ]) {
        const rect = await page.locator('#' + id).boundingBox();
        expect(rect.width).toBeGreaterThan(35);
        expect(rect.height).toBeGreaterThanOrEqual(30);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
      }
    }
  }
  await page.locator('#language-select').selectOption('en');
  const size = page.viewportSize();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
  await expect(page.locator('#open-history')).toBeVisible();
  await page.setViewportSize(size);
  await page.locator('#combined-period > summary').click();
  await expect(page.locator('#combined-start')).toBeVisible();
  await page.locator('#combined-period > summary').click();
  await page.locator('.draft-backup-tools > summary').click();
  await expect(page.locator('#download-draft-backup')).toBeVisible();
  await page.locator('.draft-backup-tools > summary').click();
  await expect(page.locator('#draft-storage-status')).toBeVisible();
  const start = page.locator('.meter-input[data-row="0"][data-meter="0"][data-side="start"]');
  const end = page.locator('.meter-input[data-row="0"][data-meter="0"][data-side="end"]');
  await start.focus();
  await page.keyboard.press('Tab');
  await expect(end).toBeFocused();
  const a = await start.boundingBox(),
    b = await end.boundingBox();
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  await page.locator('#change-password').click();
  await expect(page.locator('#new-password')).toBeVisible();
  await expect(page.locator('#current-password')).toBeVisible();
  await page.locator('#change-password').click();
  await page.locator('.page-heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('workspace-blue.png') });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#logout').click();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#application-surface')).toHaveAttribute('inert', '');
  expect(errors).toEqual([]);
});

test('reading and helper contrast stays readable and workspace motion honors both off controls', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await setup(page, { role: 'operator' });
  const pairs = await page.evaluate(() => {
    const fg = (s) => getComputedStyle(document.querySelector(s)).color;
    const bg = (s) => getComputedStyle(document.querySelector(s)).backgroundColor;
    return [
      [fg('.meter-input'), bg('.meter-input')],
      [fg('.equipment-number'), 'rgb(241, 246, 255)'],
      [fg('.ratio span'), 'rgb(255, 255, 255)'],
      [fg('.meter-usage'), 'rgb(241, 246, 255)'],
      [fg('.meter-card th'), bg('.meter-card th')],
      [fg('.gas-observation label'), bg('.gas-entry')],
      [fg('#result-state'), bg('#result-state')],
      ...getComputedStyle(document.querySelector('#save-report'))
        .backgroundImage.match(/rgb\([^)]+\)/g)
        .map((c) => [fg('#save-report'), c]),
    ];
  });
  const light = (c) => {
    const parts = c
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return parts[0] * 0.2126 + parts[1] * 0.7152 + parts[2] * 0.0722;
  };
  for (const [a, b] of pairs)
    expect(
      (Math.max(light(a), light(b)) + 0.05) / (Math.min(light(a), light(b)) + 0.05),
      a + ' on ' + b,
    ).toBeGreaterThanOrEqual(4.5);
  await expect(page.locator('#report-workspace')).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#application-surface').evaluate((el) => (el.dataset.panelMotion = 'off'));
  await expect(page.locator('#report-workspace')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#save-report')).toHaveCSS('transition-duration', '0s');
  await expect(page.locator('#open-users')).toBeHidden();
  await page.locator('#water-start').fill('-1');
  await expect(page.locator('#water-start')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#water-status')).toBeVisible();
  await expect(page.locator('#copy-report')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('optional workspace style failure keeps native navigation, entry and auth gates usable', async ({
  page,
}) => {
  const errors = await setup(page, { role: 'operator', theme: false });
  for (const icon of await page.locator('.panel-icon').all()) {
    const rect = await icon.boundingBox();
    expect(rect.width).toBeLessThanOrEqual(18);
    expect(rect.height).toBeLessThanOrEqual(18);
  }
  const input = page.locator('.meter-input[data-row="0"][data-meter="0"][data-side="end"]');
  await input.fill('1011');
  await expect(input).toHaveValue('1011');
  await expect(page.locator('#report-preview')).toHaveValue(/11/);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#logout').click();
  await expect(page.locator('#report-workspace')).toBeHidden();
  expect(errors).toEqual([]);
});
