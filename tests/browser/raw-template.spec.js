import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.js';
import { formatBlankReadingTemplate } from '../../raw-export.js';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/time', (route) =>
    route.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
});

test('blank templates copy and download before login even when the account service is unavailable', async ({
  page,
  context,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/api/auth', (route) =>
    route.fulfill({ json: { available: false, user: null } }),
  );
  await page.goto('/');
  await expect(page.locator('#report-workspace')).toBeHidden();
  for (const language of ['en', 'zh-CN', 'id']) {
    await page.locator('#language-select').selectOption(language);
    await page.locator('.release-footer [data-open-raw-template]').click();
    for (const plant of ['JRE', 'UNILAND']) {
      await page.locator('#raw-template-plant').selectOption(plant);
      const expected = formatBlankReadingTemplate(plant);
      await expect(page.locator('#raw-template-preview')).toHaveValue(expected);
      await page.locator('#copy-raw-template').click();
      await expect
        .poll(() =>
          page.evaluate(async () =>
            (await navigator.clipboard.readText()).replaceAll('\r\n', '\n'),
          ),
        )
        .toBe(expected);
      const downloading = page.waitForEvent('download');
      await page.locator('#download-raw-template').click();
      const download = await downloading;
      expect(download.suggestedFilename()).toBe(`${plant.toLowerCase()}-blank-readings.txt`);
      expect(await readFile(await download.path(), 'utf8')).toBe(expected);
      const box = await page.locator('#raw-template-dialog').boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    if (language === 'en')
      await page.screenshot({ path: info.outputPath('blank-template.png'), fullPage: true });
    await page.locator('[data-close-dialog="raw-template-dialog"]').click();
    await expect(page.locator('#report-workspace')).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test('blank template leaves a filled draft and report unchanged and supports manual copy', async ({
  page,
}) => {
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
  await page.locator('#load-example').click();
  const report = await page.locator('#report-preview').inputValue();
  const readings = await page
    .locator('.meter-input')
    .evaluateAll((inputs) => inputs.map((input) => input.value));
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Clipboard denied in test');
        },
      },
    }),
  );
  for (const language of ['en', 'zh-CN', 'id']) {
    await page.locator('#language-select').selectOption(language);
    await page.locator('#report-workspace [data-open-raw-template]').click();
    await expect(page.locator('#raw-template-preview')).toHaveValue(
      formatBlankReadingTemplate('JRE'),
    );
    await page.locator('#copy-raw-template').click();
    await expect(page.locator('#raw-template-preview')).toBeFocused();
    expect(
      await page
        .locator('#raw-template-preview')
        .evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd)),
    ).toBe(formatBlankReadingTemplate('JRE'));
    await page.locator('[data-close-dialog="raw-template-dialog"]').click();
    await expect(page.locator('#report-preview')).toHaveValue(report);
    expect(
      await page
        .locator('.meter-input')
        .evaluateAll((inputs) => inputs.map((input) => input.value)),
    ).toEqual(readings);
  }
  await page.locator('[data-plant="UNILAND"]').click();
  await page.locator('#report-workspace [data-open-raw-template]').click();
  await expect(page.locator('#raw-template-plant')).toHaveValue('UNILAND');
  await expect(page.locator('#raw-template-preview')).toHaveValue(
    formatBlankReadingTemplate('UNILAND'),
  );
});
