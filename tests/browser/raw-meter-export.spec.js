import { test, expect, modernWorkspace } from './fixtures.js';
import { excelWorkspace } from '../fixtures/excel-periods.mjs';
import { parseReading } from '../../importer.js';

async function setup(page) {
  let workspace = modernWorkspace(excelWorkspace()),
    version = 1,
    writes = 0;
  for (const collection of ['drafts', 'workingHours', 'nightShifts'])
    for (const plant of ['JRE', 'UNILAND'])
      workspace[collection][plant].gas.entries[3].refills = [
        {
          before: { reading: '700.000001', temperature: '31,25' },
          after: { reading: '800,000002', temperature: '32.5' },
        },
      ];
  const original = structuredClone(workspace),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: {
          id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
          username: 'raw-test',
          role: 'operator',
          mustChangePassword: false,
        },
      },
    }),
  );
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      writes++;
      workspace = r.request().postDataJSON().workspace;
      version++;
    }
    return r.fulfill({ json: { workspace, version, updated_at: '2026-11-01T01:00:00Z' } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  await expect(page.locator('#save-status')).toContainText('All changes saved');
  await page.locator('#dismiss-guide').click();
  return { original, errors, writes: () => writes };
}

for (const plant of ['JRE', 'UNILAND'])
  for (const [mode, collection] of [
    ['daily', 'drafts'],
    ['workingHours', 'workingHours'],
    ['nightShift', 'nightShifts'],
  ])
    test(`${plant} ${mode} all raw copy includes exact endpoints, utilities and refills`, async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const { original, errors, writes } = await setup(page),
        draft = original[collection][plant];
      await page.locator(`[data-plant="${plant}"]`).click();
      await page.locator('#reading-mode').selectOption(mode);
      await page.locator('#open-raw-export').click();
      await expect(page.locator('#raw-export-scope')).toHaveValue('all');
      await expect(page.locator('#raw-export-side')).toHaveValue('end');
      let endText;
      for (const side of ['start', 'end']) {
        await page.locator('#raw-export-side').selectOption(side);
        const text = await page.locator('#raw-export-preview').inputValue();
        expect(text).toContain(`LPG: ${draft.gas.entries[0][side].reading} %`);
        expect(text).toContain(`Oxygen: ${draft.gas.entries[1][side].reading} mmWC`);
        expect(text).toContain(`Nitrogen: ${draft.gas.entries[2][side].reading} mmH2O`);
        expect(text).toContain(`Water: ${draft.water[side]} m³`);
        expect(text).toContain('Before: 700.000001 mm; temperature: 31,25 °C');
        expect(text).toContain('After: 800,000002 mm; temperature: 32.5 °C');
        if (plant === 'JRE') expect(text).toContain(`T4: ${draft.additionalReadings[3][side]} kWh`);
        else {
          expect(text).toContain('Trafo 1, 2 and 3 cumulative readings are in MWh.');
          expect(text).not.toMatch(/\nT[1-4]:/);
          expect(text).toContain(`Air Compressor: ${draft.utilities[1].value} Nm3`);
          expect(text).toContain('Entered values, not cumulative meter readings.');
        }
        await expect(page.locator('#copy-raw-export')).toBeEnabled();
        if (side === 'end') endText = text;
      }
      await page.locator('#copy-raw-export').click();
      await expect
        .poll(() =>
          page.evaluate(async () =>
            (await navigator.clipboard.readText()).replaceAll('\r\n', '\n'),
          ),
        )
        .toBe(endText);
      await page.locator('#raw-export-scope').selectOption('electricity');
      const electric = await page.locator('#raw-export-preview').inputValue();
      expect(parseReading(electric, plant).success).toBe(true);
      expect(electric).not.toContain('Gas readings:');
      await page.locator('[data-close-dialog="raw-export-dialog"]').click();
      for (const language of ['zh-CN', 'id']) {
        await page.locator('#language-select').selectOption(language);
        await page.locator('#open-raw-export').click();
        await expect(page.locator('#raw-export-preview')).toHaveValue(endText);
        await page.locator('[data-close-dialog="raw-export-dialog"]').click();
      }
      expect(writes()).toBe(0);
      expect(errors).toEqual([]);
    });

test('all raw copy shows unfilled extras and scopes pending clipboard feedback', async ({
  page,
}) => {
  await setup(page);
  await page.locator('#additional-0-end').fill('');
  await page.locator('#open-raw-export').click();
  await expect(page.locator('#raw-export-preview')).toHaveValue(/T1: ____ kWh/);
  await expect(page.locator('#raw-export-status')).toContainText('Unfilled readings');
  await expect(page.locator('#copy-raw-export')).toBeEnabled();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          new Promise((resolve) => {
            window.releaseRawCopy = resolve;
          }),
      },
    }),
  );
  await page.locator('#copy-raw-export').click();
  await page.waitForFunction(() => typeof window.releaseRawCopy === 'function');
  await page.locator('#raw-export-scope').selectOption('electricity');
  await page.evaluate(() => window.releaseRawCopy());
  await expect(page.locator('#toast')).not.toContainText('Copied');
  await page.locator('[data-close-dialog="raw-export-dialog"]').click();
  await page.locator('[data-gas="R32"] [data-gas-temperature="end"]').fill('unfinished');
  await page.locator('#open-raw-export').click();
  await expect(page.locator('#copy-raw-export')).toBeDisabled();
  await expect(page.locator('#raw-export-status')).toContainText('temperature');
  await page.locator('#raw-export-scope').selectOption('electricity');
  await expect(page.locator('#copy-raw-export')).toBeEnabled();
});
