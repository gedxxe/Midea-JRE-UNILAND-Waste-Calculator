import { test, expect } from './fixtures.js';

test('UNILAND additional readings persist, follow dates and add only report notes across languages', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/time', (route) =>
    route.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/auth', (route) =>
    route.fulfill({
      json: {
        available: true,
        user: {
          id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
          username: 'test-operator',
          role: 'operator',
          mustChangePassword: false,
        },
      },
    }),
  );
  await page.goto('/');
  await expect(page.locator('#report-workspace')).toBeVisible();
  await expect(page.locator('#additional-section')).toBeHidden();
  await page.locator('[data-plant="UNILAND"]').click();
  await page.locator('#load-example').click();
  await page.locator('#additional-0-start').fill('100,25');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#additional-0-end').fill('120.5');
  await expect(page.locator('#additional-value-0')).toHaveText('20.25 kWh');
  await expect(page.locator('#copy-report')).toBeEnabled();
  const report = await page.locator('#report-preview').inputValue();
  expect(report).toContain('T1 consumption: 20.25 kWh');
  for (const lang of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(lang);
    await expect(page.locator('#additional-0-start')).toHaveValue('100,25');
    await expect(page.locator('#report-preview')).toHaveValue(report);
  }
  await page
    .locator('#additional-section')
    .screenshot({ path: info.outputPath('additional-readings.png') });
  await page.locator('#open-raw-export').click();
  await expect(page.locator('#raw-export-preview')).not.toHaveValue(/T1/);
  await page.locator('[data-close-dialog="raw-export-dialog"]').click();
  await page.locator('#save-draft').click();
  await page.reload();
  await page.locator('[data-plant="UNILAND"]').click();
  await expect(page.locator('#additional-0-end')).toHaveValue('120.5');
  await page.locator('#next-day').click();
  await expect(page.locator('#additional-0-start')).toHaveValue('120.5');
  await expect(page.locator('#additional-0-end')).toHaveValue('');
  await page.locator('#undo-change').click();
  await expect(page.locator('#additional-0-start')).toHaveValue('100,25');
  const end = await page.locator('#end-date').inputValue();
  await page.locator('#start-date').fill(end);
  await page.locator('#start-date').dispatchEvent('change');
  await expect(page.locator('#additional-0-start')).toHaveValue('120.5');
  await page.locator('[data-plant="JRE"]').click();
  await expect(page.locator('#additional-section')).toBeHidden();
  await expect(page.locator('#additional-body')).toBeEmpty();
  expect(errors).toEqual([]);
});
