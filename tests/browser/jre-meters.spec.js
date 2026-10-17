import { test, expect } from './fixtures.js';
import { reportPeriods } from '../fixtures/report-periods.mjs';
import { layout2Draft, layout3JreDraft, legacyText } from '../fixtures/legacy-layout.mjs';
const cell = (page, row, side = 'start', meter = 0) =>
  page.locator(`.meter-input[data-row="${row}"][data-side="${side}"][data-meter="${meter}"]`);
async function setup(page, legacy = false) {
  const j = reportPeriods(),
    u = reportPeriods('UNILAND');
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
    for (const collection of ['drafts', 'workingHours', 'nightShifts'])
      state.workspace[collection].JRE = (legacy === 3 ? layout3JreDraft : layout2Draft)(
        state.workspace[collection].JRE,
      );
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: {
          id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
          username: 'jre-meter-test',
          role: 'operator',
          mustChangePassword: false,
        },
      },
    }),
  );
  await page.route('**/api/time', (r) =>
    r.fulfill({
      json: {
        unixMs: Date.UTC(2026, 8, 16, 10),
        source: 'time.cloudflare.com',
        protocol: 'NTP',
        stratum: 2,
        sampleAgeMs: 0,
        uncertaintyMs: 5,
      },
    }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      state.workspace = r.request().postDataJSON().workspace;
      state.version++;
    }
    return r.fulfill({
      json: {
        workspace: state.workspace,
        version: state.version,
        updated_at: '2026-09-16T10:00:00Z',
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  return { state, errors };
}
test('JRE names the Vacuum Box, uses converted branch deductions and keeps all periods readable', async ({
  page,
}, info) => {
  const { errors } = await setup(page);
  for (const [mode, dehum, vacuum, piping, net, repair] of [
    ['daily', '410.00', '400.00', '400.00', '200.00', '10.00'],
    ['workingHours', '164.00', '160.00', '160.00', '80.00', '4.00'],
    ['nightShift', '246.00', '240.00', '240.00', '120.00', '6.00'],
  ]) {
    await page.locator('#reading-mode').selectOption(mode);
    const text = await page.locator('#report-preview').inputValue();
    for (const lang of ['zh-CN', 'id', 'en']) {
      await page.locator('#language-select').selectOption(lang);
      await expect(page.locator('tr[data-row="4"] .ratio').nth(1)).toContainText('Vacuum Box');
      await expect(page.locator('tr[data-row="4"] .ratio strong').nth(1)).toHaveText('× 40');
      await expect(page.locator('tr[data-row="16"] .ratio strong')).toHaveText('× 40');
      await expect(page.locator('tr[data-row="4"] .energy > span')).toHaveText(dehum);
      await expect(page.locator('[data-meter-usage="4-1"] strong')).toHaveText(vacuum + ' kWh');
      await expect(page.locator('tr[data-row="16"] .energy > span')).toHaveText(piping);
      await expect(page.locator('tr[data-row="9"] .energy > span')).toHaveText(net);
      await expect(page.locator('tr[data-row="9"] .equipment small')).toContainText(
        'Dehumidifier, meter 2',
      );
      await expect(page.locator('tr[data-row="9"] .equipment small')).toContainText(
        'Piping Building 3#',
      );
      await expect(page.locator('tr[data-row="29"] .energy > span')).toHaveText(repair);
      await expect(page.locator('#report-preview')).toHaveValue(text);
      await expect(page.locator('#copy-report')).toBeEnabled();
    }
  }
  await page.locator('#reading-mode').selectOption('daily');
  await page.locator('#search-meter').fill('Dehumidifier');
  await page.locator('tr[data-row="4"]').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('jre-vacuum-box.png') });
  await page.locator('#search-meter').fill('Electricity Building 3#');
  await page.locator('tr[data-row="9"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('jre-building3-net.png') });
  expect(errors).toEqual([]);
});
test('old JRE drafts keep new readings blank, then retain entered values through autosave, reload and next day', async ({
  page,
}) => {
  const { state, errors } = await setup(page, true);
  await expect(cell(page, 4)).toHaveValue('1000');
  await expect(cell(page, 4, 'start', 1)).toHaveValue('');
  await expect(cell(page, 29, 'end')).toHaveValue('');
  await expect(cell(page, 15, 'end', 2)).toHaveValue('');
  await expect(page.locator('#copy-report')).toBeDisabled();
  for (const side of ['start', 'end']) {
    await cell(page, 4, side, 1).fill(side === 'start' ? '1000' : '1010');
    await cell(page, 29, side).fill(side === 'start' ? '1000' : '1010');
    await cell(page, 15, side, 2).fill(side === 'start' ? '1000' : '2000');
  }
  await page.locator('#reading-mode').selectOption('workingHours');
  await expect(cell(page, 4, 'start', 1)).toHaveValue('1000');
  await expect(cell(page, 4, 'end', 1)).toHaveValue('');
  await cell(page, 4, 'end', 1).fill('1004');
  await cell(page, 29, 'end').fill('1004');
  await cell(page, 15, 'end', 2).fill('1400');
  await page.locator('#reading-mode').selectOption('nightShift');
  await expect(cell(page, 4, 'start', 1)).toHaveValue('1004');
  await expect(cell(page, 29, 'end')).toHaveValue('1010');
  await page.locator('#report-periods').selectOption('all');
  await expect(page.locator('#copy-report')).toBeEnabled();
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  for (const key of ['drafts', 'workingHours', 'nightShifts']) {
    expect(state.workspace[key].JRE.meterLayout).toBe(4);
    expect(state.workspace[key].JRE.rows).toHaveLength(30);
  }
  await page.reload();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  await expect(cell(page, 4, 'end', 1)).toHaveValue('1010');
  await expect(cell(page, 15, 'end', 2)).toHaveValue('2000');
  await page.locator('#reading-mode').selectOption('nightShift');
  await expect(cell(page, 4, 'start', 1)).toHaveValue('1004');
  await page.locator('#next-day').click();
  await page.locator('#reading-mode').selectOption('workingHours');
  await expect(cell(page, 4, 'start', 1)).toHaveValue('1010');
  await expect(cell(page, 29)).toHaveValue('1010');
  await expect(cell(page, 4, 'end', 1)).toHaveValue('');
  await expect(cell(page, 15, 'start', 2)).toHaveValue('2000');
  expect(errors).toEqual([]);
});
test('legacy imports preserve only matching-date Vacuum Box and Repair readings and Undo restores all modes', async ({
  page,
}) => {
  const { errors } = await setup(page);
  const old = layout2Draft(reportPeriods()[0]);
  old.rows[4].end[0] = '1011';
  const apply = async (side, text) => {
    await page.locator('#open-import').click();
    await page.locator('#import-side').selectOption(side);
    await page.locator('#import-text').fill(text);
    await page.locator('#apply-import').click();
    await expect(page.locator('#import-dialog')).toBeHidden();
  };
  for (const side of ['start', 'end']) {
    await apply(side, legacyText(old, side));
    await expect(cell(page, 4, side, 1)).toHaveValue(side === 'start' ? '1000' : '1010');
    await expect(cell(page, 29, side)).toHaveValue(side === 'start' ? '1000' : '1010');
    await expect(cell(page, 15, side, 2)).toHaveValue(side === 'start' ? '1000' : '2000');
  }
  await expect(cell(page, 4, 'end')).toHaveValue('1011');
  await expect(page.locator('#copy-report')).toBeEnabled();
  old.endDate = '2026-09-18';
  await apply('end', legacyText(old, 'end'));
  await expect(cell(page, 4, 'end', 1)).toHaveValue('');
  await expect(cell(page, 29, 'end')).toHaveValue('');
  await expect(cell(page, 15, 'end', 2)).toHaveValue('');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#undo-change').click();
  await expect(cell(page, 4, 'end', 1)).toHaveValue('1010');
  await expect(cell(page, 29, 'end')).toHaveValue('1010');
  await expect(page.locator('#end-date')).toHaveValue('2026-09-17');
  await page.locator('#reading-mode').selectOption('workingHours');
  await expect(cell(page, 4, 'end', 1)).toHaveValue('1004');
  expect(errors).toEqual([]);
});

test('JRE Window Vacuum Box and Piping meter 3 show separate net usage with aligned inputs in all periods', async ({
  page,
}, info) => {
  const { errors } = await setup(page);
  for (const [mode, window, meter, piping] of [
    ['daily', '3010.00', '600.00', '1010.00'],
    ['workingHours', '1204.00', '240.00', '404.00'],
    ['nightShift', '1806.00', '360.00', '606.00'],
  ]) {
    await page.locator('#reading-mode').selectOption(mode);
    const report = await page.locator('#report-preview').inputValue();
    for (const lang of ['zh-CN', 'id', 'en']) {
      await page.locator('#language-select').selectOption(lang);
      await expect(page.locator('tr[data-row="3"] .ratio').nth(5)).toContainText('Vacuum Box');
      await expect(page.locator('tr[data-row="3"] .ratio strong').nth(5)).toHaveText('× 40');
      await expect(page.locator('tr[data-row="3"] .energy > span')).toHaveText(window);
      await expect(page.locator('[data-meter-usage="15-2"] strong')).toHaveText(meter + ' kWh');
      await expect(page.locator('tr[data-row="15"] .energy > span')).toHaveText(piping);
      await expect(page.locator('tr[data-row="15"] .equipment small')).toContainText(
        'Window, meter 6',
      );
      await expect(page.locator('#report-preview')).toHaveValue(report);
      const a = await cell(page, 15, 'start', 2).boundingBox(),
        b = await cell(page, 15, 'end', 2).boundingBox();
      expect(Math.abs(a.y - b.y)).toBeLessThan(2);
      await expect(page.locator('#copy-report')).toBeEnabled();
    }
  }
  await page.locator('#reading-mode').selectOption('daily');
  await page.locator('#search-meter').fill('Piping Building 1');
  await cell(page, 15, 'end', 2).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('jre-piping-meter3-net.png') });
  await cell(page, 15, 'end', 2).fill('1399');
  await expect(page.locator('[data-meter-usage="15-2"] strong')).toHaveText('- kWh');
  await expect(page.locator('tr[data-row="15"] .energy > span')).toHaveText('-');
  await expect(cell(page, 15, 'end', 2)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('tr[data-row="19"] .energy > span')).toHaveText('600.00');
  expect(errors).toEqual([]);
});

test('layout 3 Piping upgrades with a blank third meter and old imports preserve only matching observations', async ({
  page,
}) => {
  const { state, errors } = await setup(page, 3);
  await expect(cell(page, 15, 'start', 2)).toHaveValue('');
  await expect(cell(page, 15, 'end', 2)).toHaveValue('');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await cell(page, 15, 'start', 2).fill('1000');
  await cell(page, 15, 'end', 2).fill('2000');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  expect(state.workspace.drafts.JRE.meterLayout).toBe(4);
  await page.reload();
  await expect(cell(page, 15, 'end', 2)).toHaveValue('2000');
  const old = layout3JreDraft(reportPeriods()[0]);
  const apply = async () => {
    await page.locator('#open-import').click();
    await page.locator('#import-side').selectOption('end');
    await page.locator('#import-text').fill(legacyText(old, 'end'));
    await page.locator('#apply-import').click();
    await expect(page.locator('#import-dialog')).toBeHidden();
  };
  await apply();
  await expect(cell(page, 15, 'end', 2)).toHaveValue('2000');
  old.endDate = '2026-09-18';
  await apply();
  await expect(cell(page, 15, 'end', 2)).toHaveValue('');
  await page.locator('#undo-change').click();
  await expect(cell(page, 15, 'end', 2)).toHaveValue('2000');
  expect(errors).toEqual([]);
});
