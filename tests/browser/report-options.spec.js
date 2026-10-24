import { test, expect, modernWorkspace, checkpointReply } from './fixtures.js';
import { reportPeriods } from '../fixtures/report-periods.mjs';
import { calculateDraft } from '../../engine.js';
const cell = (page, side = 'start', row = 0, meter = 0) =>
  page.locator(
    '.meter-input[data-row="' + row + '"][data-meter="' + meter + '"][data-side="' + side + '"]',
  );
async function setup(
  page,
  { incomplete = false, conflict = false, missingDailyWater = false } = {},
) {
  const j = reportPeriods(),
    u = reportPeriods('UNILAND');
  if (incomplete)
    for (const p of [j, u]) {
      p[0].rows.forEach((r) => {
        r.start.fill('');
        r.end.fill('');
      });
      p[1].rows.forEach((r) => r.start.fill(''));
      p[2].rows.forEach((r) => r.end.fill(''));
    }
  if (conflict) j[0].rows[0].start[0] = '999';
  if (missingDailyWater) j[0].water.end = '';
  const state = {
    workspace: {
      version: 4,
      drafts: { JRE: j[0], UNILAND: u[0] },
      workingHours: { JRE: j[1], UNILAND: u[1] },
      nightShifts: { JRE: j[2], UNILAND: u[2] },
    },
    version: 1,
    saved: [],
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
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
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: {
          id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
          username: 'report-options-test',
          role: 'operator',
          mustChangePassword: false,
        },
      },
    }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      state.workspace = body.workspace;
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
  await page.route('**/api/reports', (r) => {
    const body = r.request().postDataJSON();
    state.saved.push(body);
    return checkpointReply(
      page,
      r,
      { id: '1e61d60e-e4b5-4c91-b7d1-6a56d9465680', revision: 1 },
      state,
    );
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  return { state, errors };
}
test('both factories offer all five final reports, copy matching bytes and preserve selection across languages', async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { errors } = await setup(page);
  await expect(page.locator('#report-periods option')).toHaveCount(5);
  for (const plant of ['JRE', 'UNILAND']) {
    await page.locator('[data-plant="' + plant + '"]').click();
    for (const [selection, label] of [
      ['daily', '24 HOURS'],
      ['dailyAfter', 'AFTER PRODUCTION:'],
      ['all', 'NIGHT SHIFT:'],
      ['after', 'AFTER PRODUCTION'],
      ['night', 'NIGHT SHIFT'],
    ]) {
      await page.locator('#report-periods').selectOption(selection);
      await expect(page.locator('#copy-report')).toBeEnabled();
      const text = await page.locator('#report-preview').inputValue();
      expect(text).toContain(label);
      if (selection === 'daily')
        expect(text).toBe(calculateDraft(reportPeriods(plant)[0]).reportSectionText);
      for (const lang of ['zh-CN', 'id', 'en']) {
        await page.locator('#language-select').selectOption(lang);
        await expect(page.locator('#report-preview')).toHaveValue(text);
        await expect(page.locator('#report-periods')).toHaveValue(selection);
      }
      await page.locator('#copy-report').click();
      await expect
        .poll(() =>
          page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n')),
        )
        .toBe(text);
    }
  }
  await page.locator('#report-periods').selectOption('all');
  await page.locator('#report-view').selectOption('combined');
  const all = await page.locator('#report-preview').inputValue();
  expect(all).toContain('A) JRE');
  expect(all).toContain('B) UNILAND');
  expect(all.split('NIGHT SHIFT:')).toHaveLength(3);
  await page.locator('#copy-combined').click();
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n')),
    )
    .toBe(all);
  await page
    .locator('.report-options')
    .screenshot({ path: info.outputPath('five-report-options.png') });
  expect(errors).toEqual([]);
});
test('raw evening export works with missing morning/next morning and does not require a final report', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const { errors } = await setup(page, { incomplete: true });
  for (const plant of ['JRE', 'UNILAND']) {
    await page.locator('[data-plant="' + plant + '"]').click();
    await page.locator('#reading-mode').selectOption('workingHours');
    await page.locator('#report-periods').selectOption('all');
    await expect(page.locator('#copy-report')).toBeDisabled();
    await page.locator('#open-raw-export').click();
    await expect(page.locator('#copy-raw-export')).toBeEnabled();
    const raw = await page.locator('#raw-export-preview').inputValue();
    expect(raw).toContain('Reading time: 17:00 WIB');
    expect(raw).toMatch(/1\. Total: 1004/);
    expect(raw).not.toMatch(/Water:|T1 consumption|AFTER PRODUCTION/);
    await page.locator('#copy-raw-export').click();
    await expect
      .poll(() =>
        page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n')),
      )
      .toBe(raw);
    await page.locator('#raw-export-side').selectOption('start');
    await expect(page.locator('#copy-raw-export')).toBeDisabled();
    await page.locator('#raw-export-dialog [data-i18n="close"]').click();
  }
  expect(errors).toEqual([]);
});
test('explicit electricity edits share morning/evening/next morning, keep unrelated legacy conflicts and survive autosave', async ({
  page,
}) => {
  const { state, errors } = await setup(page, { conflict: true });
  await page.locator('#report-periods').selectOption('all');
  await expect(page.locator('#shared-reading-note')).toBeVisible();
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('[data-gas-enable="R32"]').check();
  const gas = page.locator('[data-gas="R32"]');
  await gas.locator('[data-gas-point="start"]').fill('1000');
  await gas.locator('[data-gas-temperature="start"]').fill('33.5');
  await gas.locator('[data-gas-point="end"]').fill('990');
  await gas.locator('[data-gas-temperature="end"]').fill('33.5');
  await cell(page, 'start', 1).fill('1001');
  await gas.locator('[data-gas-point="start"]').fill('995');
  await page.locator('#reading-mode').selectOption('workingHours');
  await expect(cell(page, 'start', 1)).toHaveValue('1001');
  await expect(cell(page)).toHaveValue('1000');
  await expect(page.locator('#shared-reading-note')).toBeVisible();
  await cell(page).fill('1002');
  await expect(page.locator('#shared-reading-note')).toBeHidden();
  await expect(page.locator('#copy-report')).toBeEnabled();
  await cell(page, 'end').fill('1006');
  await page.locator('#reading-mode').selectOption('nightShift');
  await expect(cell(page)).toHaveValue('1006');
  await cell(page, 'end').fill('1013');
  await page.locator('#reading-mode').selectOption('daily');
  await expect(cell(page)).toHaveValue('1002');
  await expect(cell(page, 'end')).toHaveValue('1013');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.workspace.drafts.JRE.water).toEqual({ start: '100', end: '102' });
  expect(state.workspace.drafts.JRE.utilities[0].value).toBe('3');
  expect(state.workspace.drafts.JRE.gas.entries[3].start).toEqual({
    reading: '995',
    temperature: '33.5',
  });
  expect(state.workspace.drafts.JRE.gas.entries[3].end.reading).toBe('990');
  expect(state.workspace.workingHours.JRE.rows[0].end[0]).toBe('1006');
  expect(state.workspace.nightShifts.JRE.rows[0].end[0]).toBe('1013');
  await page.reload();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  await page.locator('#report-periods').selectOption('all');
  await expect(page.locator('#copy-report')).toBeEnabled();
  expect(errors).toEqual([]);
});
test('report contents stay independent of editable time, worksheet and the period saved to historian', async ({
  page,
}) => {
  const { state, errors } = await setup(page, { missingDailyWater: true });
  await page.locator('#report-periods').selectOption('all');
  await page.locator('#reading-mode').selectOption('workingHours');
  await page.locator('#save-report').click();
  expect(state.saved[0].draft.periodKind).toBe('workingHours');
  expect(state.saved[0].draft.utilities.every((v) => !v.value)).toBe(true);
  await expect(page.locator('#copy-report')).toBeDisabled();
  await expect(page.locator('#result-state')).toHaveText('Incomplete');
  await page.locator('#report-view').selectOption('worksheet');
  await expect(page.locator('#copy-report')).toBeEnabled();
  await expect(page.locator('#result-state')).not.toHaveText('Incomplete');
  await page.locator('#report-view').selectOption('plant');
  await page.locator('#work-start-time').fill('08:15');
  await expect(cell(page)).toHaveValue('');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#report-view').selectOption('worksheet');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#undo-change').click();
  await expect(cell(page)).toHaveValue('1000');
  await expect(page.locator('#copy-report')).toBeEnabled();
  await page.locator('#report-view').selectOption('plant');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#reading-mode').selectOption('daily');
  await page.locator('#water-end').fill('102');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#reading-mode').selectOption('workingHours');
  await page.locator('#water-end').fill('101');
  await expect(page.locator('#copy-report')).toBeEnabled();
  await expect(page.locator('#report-preview')).toHaveValue(
    /24 HOURS:\n[\s\S]*AFTER PRODUCTION:\n[\s\S]*NIGHT SHIFT:/,
  );
  expect(errors).toEqual([]);
});
