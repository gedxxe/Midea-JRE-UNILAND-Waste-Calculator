import { exportRawReading } from '../../raw-export.js';
import { test, expect } from '@playwright/test';
import { exampleDraft } from '../../examples.js';
import { calculateDraft, generateFullIndonesiaReport } from '../../engine.js';

const cell = (page, row = 0, side = 'start', meter = 0) =>
  page.locator(`.meter-input[data-row="${row}"][data-side="${side}"][data-meter="${meter}"]`);
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on('pageerror', (error) => errors.get(page).push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('503'))
      errors.get(page).push(message.text());
  });
  await page.route('**/api/time', (route) =>
    route.fulfill({
      json: {
        unixMs: Date.UTC(2026, 8, 22, 1, 0),
        source: 'time.cloudflare.com',
        protocol: 'NTP',
        sampleAgeMs: 0,
        uncertaintyMs: 5,
        stratum: 3,
      },
    }),
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
  await expect(page.locator('#clock-status')).toHaveText('NTP synchronized');
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test('language changes preserve readings, report bytes, and the saved draft', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#load-example').click();
  const report = await page.locator('#report-preview').inputValue();
  const reading = await cell(page).inputValue();
  await expect(page.locator('#copy-report')).toBeEnabled();
  for (const [language, label] of [
    ['zh-CN', '保存草稿'],
    ['id', 'Simpan draft'],
    ['en', 'Save draft'],
  ]) {
    await page.locator('#language-select').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('#save-draft')).toHaveText(label);
    await expect(cell(page)).toHaveValue(reading);
    await expect(page.locator('#report-preview')).toHaveValue(report);
  }
  await page.locator('#language-select').selectOption('zh-CN');
  await page.locator('#save-draft').click();
  await page.reload();
  await expect(page.locator('#language-select')).toHaveValue('zh-CN');
  await expect(cell(page)).toHaveValue(reading);
  await expect(page.locator('#report-preview')).toHaveValue(report);
});

test('combined report and Excel output match the factory engine, including date and Trafo units', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#load-example').click();
  await page.locator('[data-plant="UNILAND"]').click();
  await page.locator('#load-example').click();
  const jre = calculateDraft(exampleDraft('JRE'));
  const uniland = calculateDraft(exampleDraft('UNILAND'));
  await page.locator('#report-view').selectOption('combined');
  await expect(page.locator('#report-preview')).toHaveValue(
    generateFullIndonesiaReport(jre, uniland),
  );
  await page.locator('#copy-report').click();
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.clipboard.readText()).replaceAll('\r\n', '\n')),
    )
    .toBe(generateFullIndonesiaReport(jre, uniland));
  await page.locator('#copy-worksheet').click();
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.clipboard.readText()).split('\t').length),
    )
    .toBe(16);
  await page.locator('#end-date').fill('2026-09-19');
  await expect(page.locator('#copy-combined')).toBeDisabled();
  await expect(page.locator('#copy-report')).toBeDisabled();
});

test('table paste is atomic and supports undo; next day preserves the baseline', async ({
  page,
}) => {
  await cell(page).focus();
  await cell(page).evaluate((input) =>
    input.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: (() => {
          const d = new DataTransfer();
          d.setData('text/plain', '100\t120\n200\t205');
          return d;
        })(),
      }),
    ),
  );
  await expect(cell(page)).toHaveValue('100');
  await expect(cell(page, 0, 'end')).toHaveValue('120');
  await expect(cell(page, 1, 'end')).toHaveValue('205');
  await cell(page).evaluate((input) =>
    input.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: (() => {
          const d = new DataTransfer();
          d.setData('text/plain', '400\t500\ninvalid\t5');
          return d;
        })(),
      }),
    ),
  );
  await expect(cell(page)).toHaveValue('100');
  await page.locator('#undo-change').click();
  await expect(cell(page)).toHaveValue('');
  await page.locator('#load-example').click();
  const end = await cell(page, 0, 'end').inputValue();
  const date = await page.locator('#end-date').inputValue();
  await page.locator('#next-day').click();
  await expect(cell(page)).toHaveValue(end);
  await expect(cell(page, 0, 'end')).toHaveValue('');
  await expect(page.locator('#start-date')).toHaveValue(date);
  await expect(page.locator('#copy-report')).toBeDisabled();
});

test('missing and decreasing meters remain unavailable in every language', async ({ page }) => {
  await page.locator('#load-example').click();
  await cell(page, 26, 'end', 1).fill('-');
  await expect(page.locator('#derived-one')).toHaveText('-');
  await expect(page.locator('#derived-two')).toHaveText('-');
  await expect(page.locator('#report-preview')).toHaveValue(/27\. Server Room: -/);
  await cell(page, 0, 'end').fill('1');
  await page.locator('#language-select').selectOption('zh-CN');
  await expect(page.locator('#main-total')).toHaveText('-');
  await expect(page.locator('#report-preview')).toHaveValue(/reading decreased/);
  await cell(page, 0, 'end').fill('');
  await expect(page.locator('#copy-report')).toBeDisabled();
});

test('offline time stays honest and allows manual entry', async ({ page }) => {
  await page.unroute('**/api/time');
  await page.route('**/api/time', (route) =>
    route.fulfill({ status: 503, json: { error: 'NTP synchronization unavailable.' } }),
  );
  await page.reload();
  await expect(page.locator('#clock-status')).toHaveText('Device clock · NTP unavailable');
  await page.locator('#start-date').fill('2026-09-16');
  await page.locator('#end-date').fill('2026-09-17');
  await cell(page).fill('10');
  await page.locator('#use-today').click();
  await expect(page.locator('#toast')).toContainText('Enter reading dates manually');
  await expect(page.locator('#start-date')).toHaveValue('2026-09-16');
  await expect(cell(page)).toHaveValue('10');
});

test('version, attribution, public allowlist, and responsive layout are visible', async ({
  page,
  request,
}, testInfo) => {
  const response = await request.get('/build-info.json');
  expect(response.ok()).toBe(true);
  const metadata = await response.json();
  await expect(page.locator('#app-version')).toContainText(`v${metadata.version}`);
  await expect(page.locator('.release-footer')).toContainText('made in <3 by gede');
  expect((await request.get('/package.json')).status()).toBe(404);
  expect((await request.get('/server/ntp.js')).status()).toBe(404);
  for (const language of ['en', 'zh-CN', 'id']) {
    await page.locator('#language-select').selectOption(language);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator('#language-select')).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('page.png'), fullPage: true });
});

test('raw export copies one dated reading column independently of consumption and language', async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  for (const plant of ['JRE', 'UNILAND']) {
    await page.locator('[data-plant="' + plant + '"]').click();
    await page.locator('#load-example').click();
    const draft = exampleDraft(plant);
    await cell(page).fill('');
    await expect(page.locator('#copy-report')).toBeDisabled();
    await page.locator('#open-raw-export').click();
    await expect(page.locator('#raw-export-side')).toHaveValue('end');
    const raw = exportRawReading(draft, 'end').text;
    await expect(page.locator('#raw-export-preview')).toHaveValue(raw);
    await page.locator('#copy-raw-export').click();
    await expect
      .poll(() =>
        page.evaluate(async () => (await navigator.clipboard.readText()).replaceAll('\r\n', '\n')),
      )
      .toBe(raw);
    if (plant === 'JRE')
      await page.screenshot({ path: testInfo.outputPath('raw-export.png'), fullPage: true });
    await page.locator('#raw-export-side').selectOption('start');
    await expect(page.locator('#copy-raw-export')).toBeDisabled();
    await expect(page.locator('#raw-export-preview')).toHaveValue('');
    await expect(page.locator('#raw-export-status')).toContainText('Total, meter 1');
    await page.locator('[data-close-dialog="raw-export-dialog"]').click();
    await cell(page).fill(draft.rows[0].start[0]);
    await page.locator('#open-raw-export').click();
    await page.locator('#raw-export-side').selectOption('start');
    await expect(page.locator('#raw-export-preview')).toHaveValue(
      exportRawReading(draft, 'start').text,
    );
    await page.locator('[data-close-dialog="raw-export-dialog"]').click();
    for (const language of ['zh-CN', 'id', 'en']) {
      await page.locator('#language-select').selectOption(language);
      await page.locator('#open-raw-export').click();
      await expect(page.locator('#raw-export-preview')).toHaveValue(raw);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.locator('[data-close-dialog="raw-export-dialog"]').click();
    }
  }
});

test('raw export offers manual copy when clipboard access is denied', async ({ page }) => {
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
  await page.locator('#load-example').click();
  await page.locator('#open-raw-export').click();
  await page.locator('#copy-raw-export').click();
  await expect(page.locator('#raw-export-preview')).toBeFocused();
  const selected = await page
    .locator('#raw-export-preview')
    .evaluate((el) => el.value.slice(el.selectionStart, el.selectionEnd));
  expect(selected).toBe(exportRawReading(exampleDraft('JRE'), 'end').text);
  await expect(page.locator('#toast')).toContainText('Clipboard unavailable');
});
