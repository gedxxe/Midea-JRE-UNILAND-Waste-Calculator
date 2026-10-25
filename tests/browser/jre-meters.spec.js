import { test, expect, modernWorkspace } from './fixtures.js';
import { reportPeriods } from '../fixtures/report-periods.mjs';
import {
  layout2Draft,
  layout3JreDraft,
  layout4JreDraft,
  legacyText,
} from '../fixtures/legacy-layout.mjs';
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
      state.workspace[collection].JRE = (
        legacy === 4 ? layout4JreDraft : legacy === 3 ? layout3JreDraft : layout2Draft
      )(state.workspace[collection].JRE);
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
        workspace: modernWorkspace(state.workspace),
        version: state.version,
        updated_at: '2026-09-16T10:00:00Z',
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
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
test('Building 2 shows gross readings and net usage in all periods, preserves language bytes and blocks incomplete deductions', async ({
  page,
}, info) => {
  const { state, errors } = await setup(page);
  await page.locator('#search-meter').fill('Electricity Building 2#');
  const row = page.locator('tr[data-row="18"]');
  for (const [mode, net, gross] of [
    ['daily', '950.00', '3000.00'],
    ['workingHours', '380.00', '1200.00'],
    ['nightShift', '570.00', '1800.00'],
  ]) {
    await page.locator('#reading-mode').selectOption(mode);
    const report = await page.locator('#report-preview').inputValue();
    expect(report).toContain('19. Electricity Building 2#: ' + net + ' kWh');
    for (const language of ['zh-CN', 'id', 'en']) {
      await page.locator('#language-select').selectOption(language);
      await expect(row.locator('.energy > span')).toHaveText(net);
      await expect(page.locator('[data-meter-usage="18-0"] strong')).toHaveText(gross + ' kWh');
      for (const name of [
        'Heat Exchanger',
        'Outdoor',
        'Window',
        'Indoor',
        'Nitrogen and Refrigerant Station',
        'Charging Forklift Building 2',
      ])
        await expect(row.locator('.equipment small')).toContainText(name);
      await expect(row.locator('.equipment small')).toContainText(
        'Heat Exchanger, meters 1, 2, 3, 4',
      );
      await expect(row.locator('.equipment small')).toContainText('Window, meters 4, 5');
      expect(await page.locator('#report-preview').inputValue()).toBe(report);
    }
    const [start, end] = await Promise.all([
      cell(page, 18).boundingBox(),
      cell(page, 18, 'end').boundingBox(),
    ]);
    expect(Math.abs(start.y - end.y)).toBeLessThan(2);
  }
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('jre-building2-net.png') });
  await page.locator('#reading-mode').selectOption('daily');
  await cell(page, 18, 'end').fill('3029');
  await expect(row.locator('.energy > span')).toHaveText('-');
  await cell(page, 18, 'end').fill('4000');
  await page.locator('#search-meter').fill('Nitrogen and Refrigerant Station');
  await cell(page, 10, 'end').fill('');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#search-meter').fill('Electricity Building 2#');
  await expect(row.locator('.energy > span')).toHaveText('-');
  await page.locator('#search-meter').fill('Nitrogen and Refrigerant Station');
  await cell(page, 10, 'end').fill('1010');
  await page.locator('#search-meter').fill('Electricity Building 2#');
  await expect(row.locator('.energy > span')).toHaveText('950.00');
  await page.locator('#search-meter').fill('Indoor');
  await cell(page, 1, 'end', 1).fill('');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#search-meter').fill('Electricity Building 2#');
  await expect(row.locator('.energy > span')).toHaveText('-');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.workspace.drafts.JRE.rows[18].end[0]).toBe('4000');
  expect(state.workspace.drafts.JRE.rows[1].end[1]).toBe('');
  expect(errors).toEqual([]);
});

test('layout 4 adds a blank direct Forklift meter and shares only exact observations across periods and old imports', async ({
  page,
}, info) => {
  const { state, errors } = await setup(page, 4);
  await page.locator('#search-meter').fill('Charging Forklift Building 2');
  await expect(cell(page, 30)).toHaveValue('');
  await expect(cell(page, 30, 'end')).toHaveValue('');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await cell(page, 30).fill('200');
  await cell(page, 30, 'end').fill('225');
  await page.locator('#reading-mode').selectOption('workingHours');
  await expect(cell(page, 30)).toHaveValue('200');
  await expect(cell(page, 30, 'end')).toHaveValue('');
  await cell(page, 30, 'end').fill('210');
  for (const [mode, start, end, usage, net] of [
    ['daily', '200', '225', '25.00', '935.00'],
    ['workingHours', '200', '210', '10.00', '374.00'],
    ['nightShift', '210', '225', '15.00', '561.00'],
  ]) {
    await page.locator('#reading-mode').selectOption(mode);
    const report = await page.locator('#report-preview').inputValue();
    expect(report).toContain('31. Charging Forklift Building 2: ' + usage + ' kWh');
    expect(report).toContain('19. Electricity Building 2#: ' + net + ' kWh');
    for (const language of ['zh-CN', 'id', 'en']) {
      await page.locator('#language-select').selectOption(language);
      await expect(cell(page, 30)).toHaveValue(start);
      await expect(cell(page, 30, 'end')).toHaveValue(end);
      await expect(page.locator('tr[data-row="30"] .ratio strong')).toContainText(
        language === 'zh-CN' ? '直接读数' : language === 'id' ? 'Langsung' : 'Direct',
      );
      await expect(page.locator('[data-meter-usage="30-0"] strong')).toHaveText(usage + ' kWh');
      await expect(page.locator('#report-preview')).toHaveValue(report);
      await expect(page.locator('#copy-report')).toBeEnabled();
    }
  }
  await cell(page, 30).scrollIntoViewIfNeeded();
  const startBox = await cell(page, 30).boundingBox(),
    endBox = await cell(page, 30, 'end').boundingBox();
  expect(Math.abs(startBox.y - endBox.y)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath('jre-forklift-building2.png') });
  await page.locator('#reading-mode').selectOption('daily');
  const old = layout4JreDraft(reportPeriods()[0]);
  const apply = async () => {
    await page.locator('#open-import').click();
    await page.locator('#import-side').selectOption('end');
    await page.locator('#import-text').fill(legacyText(old, 'end'));
    await page.locator('#apply-import').click();
    await expect(page.locator('#import-dialog')).toBeHidden();
  };
  await apply();
  await expect(cell(page, 30, 'end')).toHaveValue('225');
  old.endDate = '2026-09-18';
  await apply();
  await expect(cell(page, 30, 'end')).toHaveValue('');
  await page.locator('#undo-change').click();
  await expect(cell(page, 30, 'end')).toHaveValue('225');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.workspace.drafts.JRE.meterLayout).toBe(6);
  expect(state.workspace.nightShifts.JRE.rows[30].start).toEqual(['210']);
  await page.reload();
  await page.locator('#search-meter').fill('Charging Forklift Building 2');
  await expect(cell(page, 30, 'end')).toHaveValue('225');
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
    await cell(page, 30, side).fill(side === 'start' ? '1000' : '1010');
    await cell(page, 15, side, 2).fill(side === 'start' ? '1000' : '2000');
  }
  await page.locator('#reading-mode').selectOption('workingHours');
  await expect(cell(page, 4, 'start', 1)).toHaveValue('1000');
  await expect(cell(page, 4, 'end', 1)).toHaveValue('');
  await cell(page, 4, 'end', 1).fill('1004');
  await cell(page, 29, 'end').fill('1004');
  await cell(page, 30, 'end').fill('1004');
  await cell(page, 15, 'end', 2).fill('1400');
  await page.locator('#reading-mode').selectOption('nightShift');
  await expect(cell(page, 4, 'start', 1)).toHaveValue('1004');
  await expect(cell(page, 29, 'end')).toHaveValue('1010');
  await page.locator('#report-periods').selectOption('all');
  await expect(page.locator('#copy-report')).toBeEnabled();
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  for (const key of ['drafts', 'workingHours', 'nightShifts']) {
    expect(state.workspace[key].JRE.meterLayout).toBe(6);
    expect(state.workspace[key].JRE.rows).toHaveLength(32);
  }
  await page.reload();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
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

test('Structural zero rule applies to every electricity period with original readings and translated guidance', async ({
  page,
}, info) => {
  const { state, errors } = await setup(page);
  await cell(page, 19, 'end').fill('1010');
  await page.locator('#reading-mode').selectOption('workingHours');
  await cell(page, 19, 'end').fill('1004');
  await page.locator('#search-meter').fill('Structural Laboratory');
  const row = page.locator('tr[data-row="19"]');
  for (const [mode, start, end, gross] of [
    ['daily', '1000', '1010', '10.00'],
    ['workingHours', '1000', '1004', '4.00'],
    ['nightShift', '1004', '1010', '6.00'],
  ]) {
    await page.locator('#reading-mode').selectOption(mode);
    const report = await page.locator('#report-preview').inputValue();
    for (const [lang, hint] of [
      ['zh-CN', '净用量按 0 计'],
      ['id', 'pengurang lebih besar'],
      ['en', 'included usage is higher'],
    ]) {
      await page.locator('#language-select').selectOption(lang);
      await expect(row.locator('.equipment small')).toContainText(hint);
      await expect(row.locator('.energy > span')).toHaveText('0');
      await expect(page.locator('[data-meter-usage="19-0"] strong')).toHaveText(gross + ' kWh');
      await expect(cell(page, 19, 'start')).toHaveValue(start);
      await expect(cell(page, 19, 'end')).toHaveValue(end);
      await expect(page.locator('#report-preview')).toHaveValue(report);
      await expect(page.locator('#copy-report')).toBeEnabled();
      expect(report).toContain('20. Structural Laboratory: 0 kWh');
    }
  }
  await cell(page, 19, 'end').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('structural-zero-all-periods.png') });
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.workspace.drafts.JRE.rows[19].end).toEqual(['1010']);
  expect(state.workspace.workingHours.JRE.rows[19].end).toEqual(['1004']);
  expect(state.workspace.nightShifts.JRE.rows[19].start).toEqual(['1004']);
  await page.reload();
  await page.locator('#search-meter').fill('Structural Laboratory');
  await expect(row.locator('.energy > span')).toHaveText('0');
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
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.workspace.drafts.JRE.meterLayout).toBe(6);
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
