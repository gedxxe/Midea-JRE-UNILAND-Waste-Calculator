import { test, expect, modernWorkspace } from './fixtures.js';
import { formatBlankReadingTemplate } from '../../raw-export.js';
import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from '../../engine.js';
import { PLANT_SCHEMAS } from '../../schema.js';
import { reportPeriods } from '../fixtures/report-periods.mjs';
const cell = (page, row, side = 'start', meter = 0) =>
  page.locator(
    '.meter-input[data-row="' + row + '"][data-side="' + side + '"][data-meter="' + meter + '"]',
  );
async function setup(page, filled = false) {
  const workspace = { version: 4, drafts: {}, workingHours: {}, nightShifts: {} };
  for (const plant of ['JRE', 'UNILAND']) {
    const periods = filled
      ? reportPeriods(plant, '2026-10-27')
      : [
          createDraft(plant, '2026-10-27', '2026-10-28'),
          createWorkingHoursDraft(plant, '2026-10-27'),
          createNightShiftDraft(plant, '2026-10-27'),
        ];
    ['drafts', 'workingHours', 'nightShifts'].forEach(
      (key, i) => (workspace[key][plant] = periods[i]),
    );
  }
  let state = modernWorkspace(workspace),
    version = 1;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: {
          id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
          username: 'import-test',
          role: 'operator',
          mustChangePassword: false,
        },
      },
    }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      state = r.request().postDataJSON().workspace;
      version++;
    }
    return r.fulfill({ json: { workspace: state, version, updated_at: '2026-10-27T01:00:00Z' } });
  });
  await page.goto('/app');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  return { errors };
}
async function apply(page, text, side = 'end') {
  await page.locator('#open-import').click();
  await page.selectOption('#import-side', side);
  await page.locator('#import-text').fill(text);
  await page.locator('#apply-import').click();
}
for (const plant of ['JRE', 'UNILAND']) {
  for (const mode of ['daily', 'workingHours', 'nightShift']) {
    test(plant + ' filled blank template imports every meter in ' + mode, async ({ page }) => {
      const { errors } = await setup(page);
      await page.locator('[data-plant="' + plant + '"]').click();
      await page.selectOption('#reading-mode', mode);
      for (const side of ['start', 'end']) {
        const date = mode === 'workingHours' || side === 'start' ? '27/10/2026' : '28/10/2026';
        const time =
          mode === 'nightShift'
            ? side === 'start'
              ? '17:00'
              : '08:00'
            : side === 'start'
              ? '08:00'
              : '17:00';
        let slot = 0;
        const values = [];
        const text = formatBlankReadingTemplate(plant, mode !== 'daily')
          .replace('DD/MM/YYYY', date)
          .replace('HH:MM', time)
          .replaceAll('____', () => {
            const value = String(1000 + (side === 'end' ? 10 : 0) + ++slot) + ',123456';
            values.push(value);
            return value;
          });
        await apply(page, text, side);
        await expect(page.locator('#import-dialog')).toBeHidden();
        expect(
          await page
            .locator('.meter-input[data-side="' + side + '"]')
            .evaluateAll((inputs) => inputs.map((i) => i.value)),
        ).toEqual(values);
      }
      expect(errors).toEqual([]);
    });
  }
  test(
    plant + ' partial imports preserve exact observations and leave new dates unknown',
    async ({ page }, info) => {
      const { errors } = await setup(page, true);
      await page.locator('[data-plant="' + plant + '"]').click();
      const partial = formatBlankReadingTemplate(plant)
        .replace('DD/MM/YYYY', '28/10/2026')
        .replace('____', '1099');
      await apply(page, partial);
      await expect(page.locator('#import-dialog')).toBeHidden();
      await expect(cell(page, 0, 'end')).toHaveValue('1099');
      await expect(cell(page, 1, 'end')).toHaveValue('1010');
      await apply(page, partial.replace('28/10/2026', '29/10/2026'));
      await expect(page.locator('#import-dialog')).toBeHidden();
      await expect(cell(page, 0, 'end')).toHaveValue('1099');
      await expect(cell(page, 1, 'end')).toHaveValue('');
      await expect(cell(page, 1)).toHaveValue('1000');
      await page.locator('#open-import').click();
      await expect(page.locator('#import-format')).toContainText(
        plant + ': ' + PLANT_SCHEMAS[plant].rows.length + ' equipment',
      );
      await page.locator('#import-text').fill(formatBlankReadingTemplate(plant));
      await page.locator('#apply-import').click();
      await expect(page.locator('#import-feedback')).toContainText('Enter one reading date');
      await expect(page.locator('#import-feedback')).not.toContainText('invalid format');
      await page
        .locator('#import-text')
        .fill(partial.replace('1. Total: 1099', '1. Total: <img src=x onerror=alert(1)>'));
      await page.locator('#apply-import').click();
      await expect(page.locator('#import-feedback')).toContainText('meter 1: use a number');
      expect(await page.locator('#import-feedback img').count()).toBe(0);
      await page
        .locator('#import-dialog')
        .screenshot({ path: info.outputPath('import-feedback-' + plant + '.png') });
      await page
        .locator('#import-text')
        .fill(partial.replace(plant, plant === 'JRE' ? 'UNILAND' : 'JRE'));
      await page.locator('#apply-import').click();
      await expect(page.locator('#import-feedback')).toContainText('Select that factory first.');
      await page.locator('#import-dialog form button').click();
      await expect(cell(page, 0, 'end')).toHaveValue('1099');
      await expect(cell(page, 1, 'end')).toHaveValue('');
      expect(errors).toEqual([]);
    },
  );
}
test('timed placeholder uses the selected time and old UNILAND lists retain new meter slots', async ({
  page,
}) => {
  const { errors } = await setup(page, true);
  await page.locator('[data-plant="UNILAND"]').click();
  await page.selectOption('#reading-mode', 'workingHours');
  const partial = formatBlankReadingTemplate('UNILAND', true)
    .replace('DD/MM/YYYY', '27/10/2026')
    .replace('____', '1044')
    .split('\n')
    .filter((line) => !/^\d+[.)] (SV window|Painting|Dryer):/.test(line))
    .join('\n');
  await apply(page, partial);
  await expect(page.locator('#import-dialog')).toBeHidden();
  await expect(cell(page, 0, 'end')).toHaveValue('1044');
  await expect(page.locator('#end-reading-date')).toContainText('17:00');
  for (const name of ['SV window', 'Painting', 'Dryer']) {
    const ri = PLANT_SCHEMAS.UNILAND.rows.findIndex((r) => r.name === name);
    await expect(cell(page, ri, 'end')).toHaveValue('1004');
  }
  expect(errors).toEqual([]);
});
test('parent checks group meters, navigate exactly and clear private details on collapse and logout', async ({
  page,
}, info) => {
  const { errors } = await setup(page, true);
  await cell(page, 18, 'end').fill('1001');
  await page.locator('#check-data').click();
  const note = page
    .locator('#validation-list .meter-comparison')
    .filter({ hasText: 'exceed Electricity Building 2#' });
  await expect(note).toHaveCount(1);
  await expect(page.locator('#validation-list > li').first()).toHaveClass('meter-comparison');
  await expect(note.locator('strong').filter({ hasText: 'Heat Exchanger' })).toHaveCount(1);
  await expect(note.locator('.comparison-values')).toContainText('Parent meter: 1 kWh');
  await expect(note.locator('[data-related-row="5"]')).toHaveCount(4);
  const report = await page.locator('#report-preview').inputValue();
  for (const lang of ['zh-CN', 'id', 'en']) {
    await page.selectOption('#language-select', lang);
    await expect(page.locator('#report-preview')).toHaveValue(report);
  }
  await page
    .locator('#validation-panel')
    .screenshot({ path: info.outputPath('grouped-parent-checks.png') });
  await page.locator('#search-meter').fill('Indoor');
  await page.locator('#only-incomplete').check();
  await note.locator('[data-related-row="5"][data-related-meter="2"]').click();
  await expect(cell(page, 5, 'start', 2)).toBeFocused();
  await expect(page.locator('#search-meter')).toHaveValue('');
  await expect(page.locator('#only-incomplete')).not.toBeChecked();
  await page.locator('#check-data').click();
  await expect(page.locator('#validation-list')).toBeEmpty();
  await page.locator('#check-data').click();
  await expect(page.locator('#validation-list .comparison-values')).not.toHaveCount(0);
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user: null } }));
  page.on('dialog', (d) => d.accept());
  await page.locator('#logout').click();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#validation-list')).toBeEmpty();
  expect(errors).toEqual([]);
});
