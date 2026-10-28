import { test, expect, modernWorkspace } from './fixtures.js';
import { excelWorkspace } from '../fixtures/excel-periods.mjs';
import { buildExcelRow, excelRowToTSV } from '../../excel-row.js';
import { calculateDraft } from '../../engine.js';
async function setup(page, zero = false) {
  let workspace = modernWorkspace(excelWorkspace(zero)),
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
          username: 'excel-operator',
          role: 'operator',
          mustChangePassword: false,
        },
      },
    }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      workspace = r.request().postDataJSON().workspace;
      version++;
    }
    return r.fulfill({ json: { workspace, version, updated_at: '2026-10-28T00:00:00Z' } });
  });
  await page.goto('/app');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  return { errors };
}
const read = (page) => page.evaluate(async () => navigator.clipboard.readText());
for (const plant of ['JRE', 'UNILAND']) {
  test(
    plant + ' copies the exact current Excel range for daily, Day and Night in either copy control',
    async ({ page, context }, info) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const { errors } = await setup(page);
      await page.locator('[data-plant="' + plant + '"]').click();
      const source = excelWorkspace();
      for (const [mode, key] of [
        ['daily', 'drafts'],
        ['workingHours', 'workingHours'],
        ['nightShift', 'nightShifts'],
      ]) {
        await page.selectOption('#reading-mode', mode);
        await page.selectOption('#report-view', 'plant');
        const draft = source[key][plant],
          model = buildExcelRow(draft, calculateDraft(draft)),
          expected = excelRowToTSV(model);
        await expect(page.locator('#excel-row-note')).toContainText(
          'Excel ' + model.start + ':' + model.end,
        );
        await expect(page.locator('#copy-worksheet')).toBeEnabled();
        await page.locator('#copy-worksheet').click();
        await expect.poll(() => read(page)).toBe(expected);
        expect((await read(page)).split('\t').length).toBe(plant === 'JRE' ? 47 : 44);
        await page.selectOption('#report-view', 'worksheet');
        await expect(page.locator('#copy-worksheet')).toBeHidden();
        await expect(page.locator('#copy-note')).toContainText(model.separator + ' stays blank');
        await page.locator('#copy-report').click();
        await expect.poll(() => read(page)).toBe(expected);
        await expect(page.locator('#report-preview')).toHaveValue(
          new RegExp('^' + model.start + ':'),
        );
        if (plant === 'UNILAND')
          await expect(page.locator('#report-preview')).toHaveValue(/CQ: Nitrogen \(mmH2O\) =/);
      }
      const report = await page.locator('#report-preview').inputValue(),
        bytes = await read(page);
      for (const language of ['zh-CN', 'id', 'en']) {
        await page.selectOption('#language-select', language);
        await expect(page.locator('#report-preview')).toHaveValue(report);
        await page.locator('#copy-report').click();
        await expect.poll(() => read(page)).toBe(bytes);
      }
      await page
        .locator('.result-card')
        .screenshot({ path: info.outputPath('excel-' + plant + '.png') });
      expect(errors).toEqual([]);
    },
  );
}
test('Excel manual-copy fallback preserves blank slots and rejects a delayed callback after reading dates change', async ({
  page,
}) => {
  const { errors } = await setup(page, true);
  await page.selectOption('#reading-mode', 'workingHours');
  await page.selectOption('#report-view', 'worksheet');
  const preview = await page.locator('#report-preview').inputValue();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          new Promise((resolve, reject) => {
            window.rejectExcelCopy = reject;
          }),
      },
    }),
  );
  await page.locator('#copy-report').click();
  await expect.poll(() => page.evaluate(() => typeof window.rejectExcelCopy)).toBe('function');
  await page.locator('#work-date').fill('2026-10-28');
  await page
    .locator('.meter-input')
    .first()
    .evaluate((input) => {
      const data = new DataTransfer();
      const slots = document.querySelectorAll('.meter-input[data-side="start"]').length;
      data.setData('text/plain', Array(slots).fill('1000\t1000').join('\n'));
      input.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }),
      );
    });
  await expect(page.locator('#report-preview')).toHaveValue(preview);
  await page.evaluate(() => window.rejectExcelCopy(Error('denied')));
  await expect(page.locator('#report-preview')).toHaveValue(preview);
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error('denied');
        },
      },
    }),
  );
  await page.locator('#copy-report').click();
  const draft = excelWorkspace(true).workingHours.JRE,
    expected = excelRowToTSV(buildExcelRow(draft, calculateDraft(draft)));
  await expect(page.locator('#report-preview')).toHaveValue(expected);
  await expect(page.locator('#report-preview')).toBeFocused();
  expect(
    await page.locator('#report-preview').evaluate((el) => [el.selectionStart, el.selectionEnd]),
  ).toEqual([0, expected.length]);
  expect(expected.startsWith('\t\t\t\t')).toBe(true);
  expect(expected.split('\t').length).toBe(47);
  expect(errors).toEqual([]);
});
