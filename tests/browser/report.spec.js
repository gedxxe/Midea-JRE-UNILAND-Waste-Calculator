import { exportRawReading } from '../../raw-export.js';
import { test, expect } from './fixtures.js';
import { exampleDraft } from '../../examples.js';
import { createDraft, calculateDraft, generateFullIndonesiaReport } from '../../engine.js';
import { legacyDraft, legacyText } from '../fixtures/legacy-layout.mjs';

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

test('start and end readings stay aligned with individual usage in both plants and all languages', async ({
  page,
}, info) => {
  for (const plant of ['JRE', 'UNILAND']) {
    await page.locator(`[data-plant="${plant}"]`).click();
    await page.locator('#load-example').click();
    const report = await page.locator('#report-preview').inputValue();
    for (const language of ['en', 'zh-CN', 'id']) {
      await page.locator('#language-select').selectOption(language);
      const offsets = await page.locator('.meter-input[data-side="start"]').evaluateAll((inputs) =>
        inputs.map((start) => {
          const row = start.closest('tr');
          const end = row.querySelector('[data-side="end"]');
          const usage = row.querySelector('.meter-usage');
          const a = start.getBoundingClientRect(),
            b = end.getBoundingClientRect(),
            u = usage.getBoundingClientRect();
          return {
            top: Math.abs(a.top - b.top),
            height: Math.abs(a.height - b.height),
            gap: u.top - b.bottom,
          };
        }),
      );
      expect(offsets.length).toBeGreaterThanOrEqual(28);
      for (const offset of offsets) {
        expect(offset.top).toBeLessThan(1);
        expect(offset.height).toBeLessThan(1);
        expect(offset.gap).toBeGreaterThanOrEqual(0);
      }
      await expect(page.locator('#report-preview')).toHaveValue(report);
      if (language === 'en') {
        await cell(page, 0, 'end').scrollIntoViewIfNeeded();
        await page
          .locator('.table-scroll')
          .screenshot({ path: info.outputPath(`aligned-${plant}.png`) });
      }
    }
  }
});

test('legacy meters move once and show individual usage without hover, with unchanged report bytes across languages', async ({
  page,
}, info) => {
  const old = legacyDraft();
  let workspace = { version: 4, drafts: { JRE: old, UNILAND: exampleDraft('UNILAND') } },
    version = 1;
  await page.route('**/api/drafts', (route) => {
    if (route.request().method() === 'POST') {
      workspace = route.request().postDataJSON().workspace;
      version++;
    }
    return route.fulfill({ json: { workspace, version } });
  });
  await page.reload();
  await expect(cell(page, 3, 'start', 5)).toHaveValue('30.03');
  await expect(cell(page, 15, 'start', 1)).toHaveValue('20.02');
  await expect(page.locator('.meter-input[data-row="25"]')).toHaveCount(2);
  await expect(page.locator('.meter-input')).toHaveCount(114);
  await expect(page.locator('[data-meter-usage="3-5"]')).toContainText('3.00 kWh');
  await expect(page.locator('[data-meter-usage="15-1"]')).toContainText('2.00 kWh');
  await expect(page.locator('[data-meter-usage="19-0"]')).toContainText('150.00 kWh');
  await expect(page.locator('tr[data-row="19"] .energy > span')).toHaveText('110.00');
  await page.locator('#search-meter').fill('Window');
  await page.locator('[data-meter-usage="3-5"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('individual-meter-usage.png') });
  const report = await page.locator('#report-preview').inputValue();
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    await expect(page.locator('[data-meter-usage="3-5"]')).toContainText('3.00 kWh');
    await expect(page.locator('#report-preview')).toHaveValue(report);
  }
  await page.locator('#search-meter').fill('');
  await cell(page, 15, 'end', 1).fill('');
  await expect(page.locator('[data-meter-usage="15-1"]')).toContainText('- kWh');
  await expect(page.locator('tr[data-row="19"] .energy > span')).toHaveText('110.00');
  await expect(page.locator('tr[data-row="15"] .energy > span')).toHaveText('-');
  await page.locator('#open-import').click();
  await page.locator('#import-side').selectOption('end');
  await page.locator('#import-text').fill(legacyText(old, 'end'));
  await page.locator('#apply-import').click();
  await expect(page.locator('#report-preview')).toHaveValue(report);
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  await page.reload();
  await expect(cell(page, 3, 'end', 5)).toHaveValue('33.03');
  await expect(cell(page, 15, 'end', 1)).toHaveValue('22.02');
  await expect(page.locator('.meter-input')).toHaveCount(114);
});

test('legacy historian output stays unchanged while its editable copy moves meters', async ({
  page,
}) => {
  const draft = legacyDraft();
  const reportText = 'Original historical report. Warehouse includes three meters.';
  const snapshot = { draft, output: { reportText } };
  const original = JSON.stringify(snapshot);
  let writes = 0;
  await page.route('**/api/reports**', (route) => {
    if (route.request().method() !== 'GET') writes++;
    return route.fulfill({
      json: new URL(route.request().url()).searchParams.has('id')
        ? { id: 'old-report', revision: 1, latestRevision: 1, snapshot }
        : {
            hasMore: false,
            reports: [
              {
                id: 'old-report',
                plant: 'JRE',
                start_date: draft.startDate,
                end_date: draft.endDate,
                revision: 1,
              },
            ],
          },
    });
  });
  await page.locator('#open-history').click();
  await page.locator('#history-list button').click();
  await expect(page.locator('#history-snapshot')).toHaveValue(reportText);
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#use-history').click();
  await expect(cell(page, 3, 'end', 5)).toHaveValue('33.03');
  await expect(cell(page, 15, 'end', 1)).toHaveValue('22.02');
  await expect(page.locator('.meter-input[data-row="25"]')).toHaveCount(2);
  await page.locator('#open-history').click();
  await page.locator('#history-list button').click();
  await expect(page.locator('#history-snapshot')).toHaveValue(reportText);
  expect(JSON.stringify(snapshot)).toBe(original);
  expect(writes).toBe(0);
});

for (const plant of ['JRE', 'UNILAND']) {
  test(
    plant +
      ' water calculates the daily delta, persists partial readings and follows dates and next day',
    async ({ page }, info) => {
      await page.locator(`[data-plant="${plant}"]`).click();
      await page.locator('#load-example').click();
      await expect(page.locator('#utilities-section')).toHaveCount(0);
      await expect(page.locator('#gas-section [data-utility="0"]')).toBeVisible();
      await page.locator('#gas-section [data-utility="0"]').fill('12.5');
      await page.locator('#water-start').fill('100,25');
      await expect(page.locator('#copy-report')).toBeDisabled();
      await page.locator('#save-draft').click();
      await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
      await page.reload();
      await page.locator(`[data-plant="${plant}"]`).click();
      await expect(page.locator('#water-start')).toHaveValue('100,25');
      await expect(page.locator('#water-end')).toHaveValue('');
      await page.locator('#water-end').fill('125.75');
      await expect(page.locator('#water-total')).toContainText('25.5 m³');
      await expect(page.locator('#report-preview')).toHaveValue(/Water: 25.5 m³/);
      await expect(page.locator('#report-preview')).toHaveValue(
        plant === 'JRE' ? /LPG: 12.5 Kg/ : /LPG: 12.5 Nm3/,
      );
      const report = await page.locator('#report-preview').inputValue();
      for (const language of ['zh-CN', 'id', 'en']) {
        await page.locator('#language-select').selectOption(language);
        await expect(page.locator('#report-preview')).toHaveValue(report);
        await expect(page.locator('#water-start')).toHaveValue('100,25');
      }
      await page.locator('#water-section').scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('water-consumption.png') });
      await page.locator('#next-day').click();
      await expect(page.locator('#water-start')).toHaveValue('125.75');
      await expect(page.locator('#water-end')).toHaveValue('');
      await page.locator('#undo-change').click();
      await expect(page.locator('#report-preview')).toHaveValue(report);
      await page.locator('#water-end').fill('90');
      await expect(page.locator('#water-total')).toContainText('- m³');
      await expect(page.locator('#water-status')).toContainText('decreased');
      await page.locator('[data-plant="UNILAND"]').click();
      await expect(page.locator('#water-section')).toBeVisible();
      await expect(page.locator('#utilities-section')).toHaveCount(0);
    },
  );
}

test('legacy water consumption remains visible without fabricated readings and conversion to raw input can be undone', async ({
  page,
}) => {
  const d = exampleDraft('JRE');
  d.utilities[4] = { value: '42.5', note: 'Existing consumption' };
  await page.route('**/api/drafts', (r) =>
    r.fulfill({
      json: {
        version: 1,
        workspace: { version: 4, drafts: { JRE: d, UNILAND: exampleDraft('UNILAND') } },
      },
    }),
  );
  await page.reload();
  await expect(page.locator('#water-legacy')).toContainText('42.5 m³');
  await expect(page.locator('#water-readings')).toBeHidden();
  await expect(page.locator('#report-preview')).toHaveValue(/Water: 42.5 m³/);
  await page.locator('#water-use-readings').click();
  await expect(page.locator('#water-start')).toHaveValue('');
  await expect(page.locator('#water-end')).toHaveValue('');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#undo-change').click();
  await expect(page.locator('#water-legacy')).toContainText('42.5 m³');
});

test('latest period and manual dates move readings by date in either edit order, with undo and recovery', async ({
  page,
}, info) => {
  await page.route('**/api/time', (route) =>
    route.fulfill({
      json: {
        unixMs: Date.UTC(2026, 9, 5, 1),
        source: 'time.cloudflare.com',
        protocol: 'NTP',
        sampleAgeMs: 0,
        uncertaintyMs: 5,
        stratum: 3,
      },
    }),
  );
  await page.reload();
  for (const plant of ['JRE', 'UNILAND']) {
    await page.locator(`[data-plant="${plant}"]`).click();
    await page.locator('#start-date').fill('2026-10-03');
    await page.locator('#end-date').fill('2026-10-04');
    await cell(page).fill('100');
    await cell(page, 0, 'end').fill('125');
    await page.locator('#use-today').click();
    await expect(cell(page)).toHaveValue('125');
    await expect(cell(page, 0, 'end')).toHaveValue('');
    await expect(page.locator('#start-reading-date')).toHaveText('2026-10-04');
    await expect(page.locator('#end-reading-date')).toHaveText('2026-10-05');
    await expect(page.locator('#copy-report')).toBeDisabled();
    await page.locator('#use-today').click(); // Same period must not clear current input or undo.
    await page.locator('#undo-change').click();
    await expect(cell(page)).toHaveValue('100');
    await expect(cell(page, 0, 'end')).toHaveValue('125');
    for (const order of [
      ['start', 'end'],
      ['end', 'start'],
    ]) {
      for (const side of order)
        await page.locator(`#${side}-date`).fill(side === 'start' ? '2026-10-04' : '2026-10-05');
      await expect(cell(page)).toHaveValue('125');
      await expect(cell(page, 0, 'end')).toHaveValue('');
      await page.locator('#undo-change').click();
      await expect(cell(page)).toHaveValue('100');
      await expect(page.locator('#start-date')).toHaveValue('2026-10-03');
    }
    await page.locator('#use-today').click();
    await cell(page, 0, 'end').fill('150');
    const report = await page.locator('#report-preview').inputValue();
    for (const language of ['zh-CN', 'id', 'en']) {
      await page.locator('#language-select').selectOption(language);
      await expect(page.locator('#start-reading-date')).toHaveText('2026-10-04');
      await expect(page.locator('#report-preview')).toHaveValue(report);
    }
    await page.locator('#save-draft').click();
    await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
    await page.reload();
    await page.locator(`[data-plant="${plant}"]`).click();
    await expect(cell(page)).toHaveValue('125');
    await expect(cell(page, 0, 'end')).toHaveValue('150');
    await page.locator('#meter-table').scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`dated-columns-${plant}.png`) });
  }
});

test('import editor follows the chosen column and keeps edits separate until validated apply', async ({
  page,
}, info) => {
  for (const plant of ['JRE', 'UNILAND']) {
    await page.locator(`[data-plant="${plant}"]`).click();
    await page.locator('#load-example').click();
    const d = exampleDraft(plant);
    const start = exportRawReading(d, 'start').text,
      end = exportRawReading(d, 'end').text;
    await page.locator('#open-import').click();
    await page.locator('#import-side').selectOption('start');
    await expect(page.locator('#import-text')).toHaveValue(start);
    await expect(page.locator('#import-side option:checked')).toContainText(d.startDate);
    await page.locator('#import-text').fill('invalid unfinished paste');
    await page.locator('#apply-import').click();
    await expect(page.locator('#import-feedback')).not.toBeEmpty();
    await page.locator('#import-side').selectOption('end');
    await expect(page.locator('#import-text')).toHaveValue(end);
    await expect(page.locator('#import-feedback')).toBeEmpty();
    await page.locator('#import-side').selectOption('start');
    await expect(page.locator('#import-text')).toHaveValue('invalid unfinished paste');
    await page.locator('#import-side').selectOption('end');
    const replacement = end.replace(`1. Total: ${d.rows[0].end[0]}`, '1. Total: 999999');
    await page.locator('#import-text').fill(replacement);
    await page.screenshot({ path: info.outputPath(`import-column-${plant}.png`) });
    await expect(cell(page, 0, 'end')).toHaveValue(d.rows[0].end[0]);
    await page.locator('#apply-import').click();
    await expect(page.locator('#import-dialog')).not.toBeVisible();
    await expect(cell(page, 0, 'end')).toHaveValue('999999');
    await expect(cell(page)).toHaveValue(d.rows[0].start[0]);
    await page.locator('#open-import').click();
    await expect(page.locator('#import-text')).toHaveValue(replacement);
    await page.locator('#import-side').selectOption('start');
    await expect(page.locator('#import-text')).toHaveValue(start);
    await page.locator('#import-dialog form button').click();
    await page.locator('#undo-change').click();
    await expect(cell(page, 0, 'end')).toHaveValue(d.rows[0].end[0]);
  }
});

test('gap signs match the panel, percentage and copied report across languages', async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const d = createDraft('JRE', '2026-10-01', '2026-10-02');
  d.rows.forEach((row) => {
    row.start.fill('1000');
    row.end.fill('1000');
  });
  d.rows[0].end = ['1100'];
  d.rows[7].end = ['1120'];
  await page.route('**/api/drafts', (route) =>
    route.fulfill({
      json: {
        version: 1,
        workspace: { version: 4, drafts: { JRE: d, UNILAND: exampleDraft('UNILAND') } },
      },
    }),
  );
  await page.reload();
  for (const [reading, sign] of [
    ['1120', '+20.00'],
    ['1080', '-20.00'],
    ['1100', '0.00'],
  ]) {
    await cell(page, 7, 'end').fill(reading);
    for (const language of ['en', 'zh-CN', 'id']) {
      await page.locator('#language-select').selectOption(language);
      await expect(page.locator('#derived-two')).toHaveText(`${sign} kWh`);
      await expect(page.locator('#metric-note')).toContainText(`${sign}%`);
      const report = await page.locator('#report-preview').inputValue();
      expect(report).toContain(`Gap: ${sign} kWh`);
      expect(report).toContain(`Gap: ${sign}%`);
      await page.locator('#copy-report').click();
      await expect
        .poll(() =>
          page.evaluate(async () =>
            (await navigator.clipboard.readText()).replaceAll('\r\n', '\n'),
          ),
        )
        .toBe(report);
      if (reading === '1120' && language === 'en') {
        await page.locator('#derived-two').scrollIntoViewIfNeeded();
        await page.screenshot({ path: info.outputPath('positive-gap.png') });
      }
    }
  }
});

test('an old account draft drops obsolete compressor ratio warnings and keeps zero consumption', async ({
  page,
}) => {
  const drafts = { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND') };
  drafts.JRE.rows[11].end = [...drafts.JRE.rows[11].start];
  drafts.JRE.importIssues = [
    {
      code: 'RATIO_MISMATCH',
      level: 'WARNING',
      rowIndex: 11,
      meterIndex: 0,
      message:
        'Air Compressor 1#, meter 1: input ratio 40, template ratio 1. Using the template ratio.',
    },
  ];
  await page.route('**/api/drafts', (route) =>
    route.fulfill({ json: { version: 1, workspace: { version: 4, drafts } } }),
  );
  await page.reload();
  await expect(cell(page, 11)).toHaveValue(drafts.JRE.rows[11].start[0]);
  await expect(cell(page, 11, 'end')).toHaveValue(drafts.JRE.rows[11].start[0]);
  await expect(page.locator('#meter-body tr[data-row="11"] .energy > span')).toHaveText('0');
  await expect(page.locator('#report-preview')).not.toHaveValue(/input ratio|template ratio/);
  await expect(page.locator('#report-preview')).toHaveValue(/12\. Air Compressor 1#: 0 kWh/);
  await expect(page.locator('#copy-report')).toBeEnabled();
});

test('Structural shows net usage with original inputs and translated guidance', async ({
  page,
}, info) => {
  await page.locator('#load-example').click();
  await cell(page, 19).fill('1000');
  await cell(page, 19, 'end').fill('1150');
  await cell(page, 15).fill('10');
  await cell(page, 15, 'end').fill('11');
  const row = page.locator('#meter-body tr[data-row="19"]');
  await expect(row.locator('.energy > span')).toHaveText('110.00');
  await expect(row.locator('.energy')).toHaveAttribute(
    'title',
    /150 - Piping Building 1#, meter 1 \(40\) = 110.00 kWh/,
  );
  const report = await page.locator('#report-preview').inputValue();
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    await expect(row.locator('.equipment > small')).toContainText('Piping Building 1#');
    await expect(cell(page, 19, 'end')).toHaveValue('1150');
    await expect(page.locator('#report-preview')).toHaveValue(report);
  }
  await row.locator('.equipment').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('structural-net.png') });
  await cell(page, 15, 'end').fill('');
  await expect(row.locator('.energy > span')).toHaveText('-');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await cell(page, 15, 'end').fill('20');
  await expect(row.locator('.energy > span')).toHaveText('-');
  await expect(page.locator('#report-preview')).toHaveValue(
    /included Piping Building 1# usage exceeds/,
  );
});

test('language changes preserve readings, report bytes, and the saved draft', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#load-example').click();
  const report = await page.locator('#report-preview').inputValue();
  const reading = await cell(page).inputValue();
  const gap = calculateDraft(exampleDraft('JRE')).gapKWh.toFixed(2);
  expect(Number(gap)).toBeLessThan(0);
  await expect(page.locator('#derived-two')).toHaveText(`${gap} kWh`);
  await expect(page.locator('#report-preview')).toHaveValue(
    new RegExp(`Gap: ${gap.replace('.', '\\.')} kWh`),
  );
  await expect(page.locator('#copy-report')).toBeEnabled();
  for (const [language, label] of [
    ['zh-CN', '保存草稿'],
    ['id', 'Simpan draft'],
    ['en', 'Save draft'],
  ]) {
    await page.locator('#language-select').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('#save-draft')).toHaveText(label);
    await expect(page.locator('#meter-body tr[data-row="11"] .ratio strong')).toHaveText('× 40');
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

test('UNILAND tank gas uses separate calibration, preserves manual units and survives draft/date changes', async ({
  page,
}, info) => {
  await page.locator('[data-plant="UNILAND"]').click();
  await page.locator('#load-example').click();
  await expect(page.locator('#gas-title')).toHaveText('UNILAND gas consumption');
  const lpg = page.locator('[data-gas="LPG"]');
  const oxygen = page.locator('[data-gas="O2"]');
  const nitrogen = page.locator('[data-gas="N2"]');
  const r32 = page.locator('[data-gas="R32"]');
  await lpg.locator('[data-utility="0"]').fill('12.5');
  await expect(
    lpg.locator('label').filter({ has: page.locator('[data-utility="0"]') }),
  ).toContainText('Nm3');
  await lpg.locator('[data-gas-enable]').check();
  await lpg.locator('[data-gas-point="start"]').fill('60');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  await page.reload();
  await page.locator('[data-plant="UNILAND"]').click();
  await expect(lpg.locator('[data-gas-point="start"]')).toHaveValue('60');
  await expect(lpg.locator('[data-gas-point="end"]')).toHaveValue('');
  await lpg.locator('[data-gas-point="end"]').fill('40');
  await lpg.locator('[data-add-refill]').click();
  await expect(page.locator('#copy-report')).toBeDisabled();
  await lpg.locator('[data-gas-point="before0"]').fill('50');
  await lpg.locator('[data-gas-point="after0"]').fill('80');
  await expect(lpg.locator('.gas-total')).toHaveText('Consumption: 4735.29 kg');
  for (const gas of [oxygen, nitrogen]) {
    await gas.locator('[data-gas-enable]').check();
    await gas.locator('[data-gas-point="start"]').fill('1010');
    await gas.locator('[data-gas-point="end"]').fill('1000');
  }
  await expect(oxygen.locator('.gas-total')).toHaveText('Consumption: 34.5 kg');
  await expect(nitrogen.locator('.gas-total')).toHaveText('Consumption: 34.44 kg');
  await r32.locator('[data-gas-enable]').check();
  await r32.locator('[data-gas-point="start"]').fill('587');
  await r32.locator('[data-gas-point="end"]').fill('550');
  await r32.locator('[data-gas-temperature="start"]').fill('33,5');
  await r32.locator('[data-gas-temperature="end"]').fill('33.5');
  await expect(r32.locator('.gas-total')).toHaveText('Consumption: 154.2086 kg');
  await expect(page.locator('#copy-report')).toBeEnabled();
  await expect(page.locator('#utility-fields [data-utility]')).toHaveCount(2);
  await expect(page.locator('#utility-fields [data-utility="1"]')).toHaveValue('');
  await expect(oxygen.locator('[data-utility="2"]')).toHaveValue('34.5');
  await expect(lpg.locator('[data-utility="0"]')).toBeDisabled();
  const report = await page.locator('#report-preview').inputValue();
  expect(report).toContain('LPG: 4735.29 Kg');
  expect(report).toContain('R32: 154.2086 Kg');
  for (const lang of ['id', 'zh-CN', 'en']) {
    await page.locator('#language-select').selectOption(lang);
    await expect(page.locator('#gas-title')).toContainText('UNILAND');
    await expect(page.locator('#report-preview')).toHaveValue(report);
  }
  await oxygen.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('uniland-gas.png') });
  await oxygen.locator('[data-gas-point="start"]').fill('4320');
  await expect(oxygen.locator('[data-gas-point="start"]')).toHaveAttribute('aria-invalid', 'false');
  await oxygen.locator('[data-gas-point="start"]').fill('4320.1');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await oxygen.locator('[data-gas-point="start"]').fill('1010');
  await page.locator('[data-plant="JRE"]').click();
  await expect(lpg.locator('[data-gas-enable]')).not.toBeChecked();
  await page.locator('[data-plant="UNILAND"]').click();
  await expect(page.locator('#report-preview')).toHaveValue(report);
  await lpg.locator('[data-gas-enable]').uncheck();
  await expect(lpg.locator('[data-utility="0"]')).toHaveValue('12.5');
  await expect(page.locator('#report-preview')).toHaveValue(/LPG: 12.5 Nm3/);
  await lpg.locator('[data-gas-enable]').check();
  const end = await page.locator('#end-date').inputValue();
  await page.locator('#start-date').fill(end);
  await page.locator('#end-date').fill('2026-09-18');
  await expect(r32.locator('[data-gas-point="start"]')).toHaveValue('550');
  await expect(r32.locator('[data-gas-temperature="start"]')).toHaveValue('33.5');
  await expect(r32.locator('[data-gas-point="end"]')).toHaveValue('');
  await expect(lpg.locator('[data-gas-point="before0"]')).toHaveCount(0);
  await page.locator('#undo-change').click();
  await expect(page.locator('#report-preview')).toHaveValue(report);
  await page.locator('#next-day').click();
  await expect(lpg.locator('[data-gas-point="start"]')).toHaveValue('40');
  await expect(lpg.locator('[data-gas-point="end"]')).toHaveValue('');
});

test('JRE gas raw readings, decimal temperatures, refills, language and next day preserve data', async ({
  page,
}, testInfo) => {
  await page.locator('#load-example').click();
  const lpg = page.locator('[data-gas="LPG"]');
  await lpg.locator('[data-gas-enable]').check();
  await lpg.locator('[data-gas-point="start"]').fill('60');
  await lpg.locator('[data-gas-point="end"]').fill('40');
  await lpg.locator('[data-add-refill]').click();
  await expect(page.locator('#copy-report')).toBeDisabled();
  await lpg.locator('[data-gas-point="before0"]').fill('50');
  await lpg.locator('[data-gas-point="after0"]').fill('80');
  const r32 = page.locator('[data-gas="R32"]');
  await r32.locator('[data-gas-enable]').check();
  await r32.locator('[data-gas-point="start"]').fill('587');
  await r32.locator('[data-gas-temperature="start"]').fill('33,5');
  await r32.locator('[data-gas-point="end"]').fill('550');
  await r32.locator('[data-gas-temperature="end"]').fill('33.5');
  await expect(r32.locator('.gas-total')).toHaveText('Consumption: 154.2086 kg');
  await expect(page.locator('#report-preview')).toHaveValue(/Refrigerant R32: 154.2086 Kg/);
  const report = await page.locator('#report-preview').inputValue();
  for (const lang of ['id', 'zh-CN', 'en']) {
    await page.locator('#language-select').selectOption(lang);
    await expect(page.locator('#report-preview')).toHaveValue(report);
    await expect(r32.locator('[data-gas-temperature="start"]')).toHaveValue('33,5');
  }
  await page.locator('#save-draft').click();
  await page.reload();
  await expect(r32.locator('[data-gas-temperature="start"]')).toHaveValue('33,5');
  await expect(lpg.locator('[data-gas-point="after0"]')).toHaveValue('80');
  await expect(page.locator('#report-preview')).toHaveValue(report);
  await r32.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('gas-entry.png') });
  await r32.locator('[data-gas-temperature="end"]').fill('51');
  await expect(r32.locator('.gas-total')).toHaveText('Consumption: - kg');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await r32.locator('[data-gas-temperature="end"]').fill('33.5');
  await page.locator('[data-plant="UNILAND"]').click();
  await expect(page.locator('#gas-title')).toHaveText('UNILAND gas consumption');
  await expect(r32.locator('[data-gas-enable]')).not.toBeChecked();
  await page.locator('[data-plant="JRE"]').click();
  await expect(r32.locator('[data-gas-point="start"]')).toHaveValue('587');
  await page.locator('#next-day').click();
  await expect(r32.locator('[data-gas-point="start"]')).toHaveValue('550');
  await expect(r32.locator('[data-gas-temperature="start"]')).toHaveValue('33.5');
  await expect(r32.locator('[data-gas-temperature="end"]')).toHaveValue('');
  await expect(lpg.locator('[data-gas-point="before0"]')).toHaveCount(0);
  await page.locator('#undo-change').click();
  await expect(page.locator('#report-preview')).toHaveValue(report);
  await lpg.locator('[data-remove-refill]').click();
  await expect(lpg.locator('[data-gas-point="before0"]')).toHaveCount(0);
  await page.locator('#undo-change').click();
  await expect(lpg.locator('[data-gas-point="after0"]')).toHaveValue('80');
});
