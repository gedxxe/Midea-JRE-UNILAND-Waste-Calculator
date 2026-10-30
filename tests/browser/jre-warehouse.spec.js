import { test, expect, modernWorkspace } from './fixtures.js';
import { reportPeriods } from '../fixtures/report-periods.mjs';
import { layout5JreDraft } from '../fixtures/legacy-layout.mjs';
const cell = (page, side) =>
  page.locator('.meter-input[data-row="31"][data-side="' + side + '"][data-meter="0"]');
async function setup(page, date, legacy = false) {
  const j = reportPeriods('JRE', date),
    u = reportPeriods('UNILAND', date);
  j.forEach((d, i) => {
    d.rows[31].start = [['10', '10', '11'][i]];
    d.rows[31].end = [['12', '11', '12'][i]];
  });
  const state = {
    version: 1,
    workspace: {
      version: 4,
      drafts: { JRE: j[0], UNILAND: u[0] },
      workingHours: { JRE: j[1], UNILAND: u[1] },
      nightShifts: { JRE: j[2], UNILAND: u[2] },
    },
  };
  if (legacy)
    for (const key of ['drafts', 'workingHours', 'nightShifts'])
      state.workspace[key].JRE = layout5JreDraft(state.workspace[key].JRE);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: {
          id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
          username: 'warehouse-test',
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
      state.workspace = r.request().postDataJSON().workspace;
      state.version++;
    }
    return r.fulfill({
      json: {
        workspace: modernWorkspace(state.workspace),
        version: state.version,
        updated_at: '2026-10-25T12:00:00Z',
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  return { state, errors };
}
test('JRE row32 uses x40 and net Warehouse in every mode with aligned inputs, raw export and incomplete autosave', async ({
  page,
}, info) => {
  const { state, errors } = await setup(page, '2026-10-25');
  for (const [mode, usage, net] of [
    ['daily', '80.00', '320.00'],
    ['workingHours', '40.00', '120.00'],
    ['nightShift', '40.00', '200.00'],
  ]) {
    await page.locator('#reading-mode').selectOption(mode);
    for (const language of ['en', 'zh-CN', 'id']) {
      await page.locator('#language-select').selectOption(language);
      await page.locator('#search-meter').fill('Warehouse');
      await expect(page.locator('tr[data-row="31"] .equipment-number')).toHaveText('32');
      await expect(page.locator('tr[data-row="31"] .ratio strong')).toHaveText('× 40');
      await expect(page.locator('tr[data-row="31"] .energy > span')).toHaveText(usage);
      await expect(page.locator('tr[data-row="25"] .energy > span')).toHaveText(net);
      const text = await page.locator('#report-preview').inputValue();
      expect(text).toContain('32. Warehouse Lighting: ' + usage + ' kWh');
      expect(text).toContain('26. Warehouse Area: ' + net + ' kWh');
      await cell(page, 'end').scrollIntoViewIfNeeded();
      const a = await cell(page, 'start').boundingBox(),
        b = await cell(page, 'end').boundingBox();
      expect(Math.abs(a.y - b.y)).toBeLessThan(2);
    }
  }
  await page.locator('#language-select').selectOption('en');
  await page.screenshot({ path: info.outputPath('jre-warehouse-lighting.png') });
  await page.locator('#reading-mode').selectOption('daily');
  await page.locator('#open-raw-export').click();
  await expect(page.locator('#raw-export-preview')).toHaveValue(
    /32\. Warehouse Lighting: 12 \(Ratio 40\)$/,
  );
  await page.locator('[data-close-dialog="raw-export-dialog"]').click();
  await cell(page, 'end').fill('');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await expect(page.locator('tr[data-row="25"] .energy > span')).toHaveText('-');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.workspace.drafts.JRE.meterLayout).toBe(6);
  expect(state.workspace.drafts.JRE.rows[31].end).toEqual(['']);
  await page.reload();
  await page.locator('#search-meter').fill('Warehouse');
  await expect(cell(page, 'end')).toHaveValue('');
  expect(errors).toEqual([]);
});
test('layout5 boundary report remains zero, keeps the real Oct25 reading and carries it forward', async ({
  page,
}) => {
  const { errors } = await setup(page, '2026-10-24', true);
  await page.locator('#search-meter').fill('Warehouse');
  await expect(cell(page, 'start')).toHaveValue('0');
  await expect(cell(page, 'end')).toHaveValue('');
  await expect(page.locator('tr[data-row="31"] .energy > span')).toHaveText('0');
  await expect(page.locator('tr[data-row="25"] .energy > span')).toHaveText('400.00');
  await cell(page, 'end').fill('10');
  await expect(page.locator('#report-preview')).toHaveValue(/32\. Warehouse Lighting: 0 kWh/);
  await page.locator('#start-date').fill('2026-10-25');
  await page.locator('#end-date').fill('2026-10-26');
  await expect(cell(page, 'start')).toHaveValue('10');
  await expect(cell(page, 'end')).toHaveValue('');
  await expect(page.locator('tr[data-row="31"] .energy > span')).toHaveText('-');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  await page.reload();
  await page.locator('#search-meter').fill('Warehouse');
  await expect(cell(page, 'start')).toHaveValue('10');
  await expect(cell(page, 'end')).toHaveValue('');
  expect(errors).toEqual([]);
});
