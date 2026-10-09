import { test, expect } from './fixtures.js';
import { exampleDraft } from '../../examples.js';
import { PLANT_SCHEMAS } from '../../schema.js';

test('UNILAND legacy draft keeps equipment identities, manual utilities and water during upgrade', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const old = exampleDraft('UNILAND');
  delete old.meterLayout;
  old.rows = PLANT_SCHEMAS.UNILAND.rows
    .map((row, i) => ({ row, values: old.rows[i] }))
    .filter(({ row }) => row.legacyIndex < 28)
    .sort((a, b) => a.row.legacyIndex - b.row.legacyIndex)
    .map(({ values }) => values);
  old.utilities[1].value = '12.5';
  old.utilities[4].value = '25.5';
  old.utilities[6].value = '3.5';
  let workspace = { version: 4, drafts: { JRE: exampleDraft('JRE'), UNILAND: old } },
    version = 1;
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
  await page.route('**/api/time', (route) =>
    route.fulfill({ status: 503, json: { error: 'NTP_UNAVAILABLE' } }),
  );
  await page.route('**/api/drafts', (route) => {
    if (route.request().method() === 'POST') {
      workspace = route.request().postDataJSON().workspace;
      version++;
    }
    return route.fulfill({ json: { workspace, version } });
  });
  await page.goto('/');
  await page.locator('[data-plant="UNILAND"]').click();
  await expect(page.locator('.meter-input')).toHaveCount(64);
  await expect(page.locator('.meter-input[data-row="13"][data-side="end"]')).toHaveValue(
    old.rows[12].end[0],
  );
  await expect(page.locator('.meter-input[data-row="12"][data-side="start"]').first()).toHaveValue(
    '',
  );
  await expect(page.locator('.meter-input[data-row="15"][data-side="end"]')).toHaveValue('');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await expect(page.locator('#utilities-section')).toHaveCount(0);
  await expect(page.locator('#gas-section [data-utility="1"]')).toHaveValue('12.5');
  await expect(page.locator('#gas-section [data-utility="6"]')).toHaveValue('3.5');
  await expect(page.locator('#water-legacy')).toContainText('25.5 m³');
  await page.locator('#water-use-readings').click();
  await page.locator('#water-start').fill('100');
  await page.locator('#water-end').fill('125.5');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  await page.reload();
  await page.locator('[data-plant="UNILAND"]').click();
  await expect(page.locator('#water-total')).toContainText('25.5 m³');
  await expect(page.locator('#gas-section [data-utility="6"]')).toHaveValue('3.5');
  await page.locator('#water-section').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('uniland-water.png') });
  await page.locator('#search-meter').fill('Piping');
  await page.locator('.meter-input[data-row="12"]').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('uniland-piping.png') });
  expect(workspace.drafts.UNILAND.meterLayout).toBe(2);
  expect(errors).toEqual([]);
});
