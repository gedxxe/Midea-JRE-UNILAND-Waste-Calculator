import { test, expect } from './fixtures.js';
import { exampleDraft } from '../../examples.js';
import { createWorkingHoursDraft, calculateDraft } from '../../engine.js';
import { emptyWorkingHours } from '../../storage.js';
import { graphRecords } from '../../graph-data.js';
import { reportSnapshot } from '../../server/report-data.js';
import { createDraftBackup } from '../../draft-backup.js';

const user = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'trial-user',
  role: 'operator',
  mustChangePassword: false,
};
const cell = (page, side = 'start') =>
  page.locator(`.meter-input[data-row="0"][data-meter="0"][data-side="${side}"]`);
const work = (plant) => ({
  ...createWorkingHoursDraft(plant, '2026-09-16'),
  rows: exampleDraft(plant).rows,
});
async function setup(page, { undated = false } = {}) {
  const state = {
    workspace: {
      version: 4,
      drafts: { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND') },
      workingHours: emptyWorkingHours(),
    },
    version: 1,
    writes: 0,
    saved: [],
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user } }));
  await page.route('**/api/time', (r) =>
    r.fulfill({
      json: {
        unixMs: Date.UTC(2026, 8, 16, 10),
        source: 'time.cloudflare.com',
        protocol: 'NTP',
        sampleAgeMs: 0,
        uncertaintyMs: 5,
        stratum: 2,
      },
    }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      state.workspace = body.workspace;
      state.version++;
      state.writes++;
    }
    return r.fulfill({ json: { ...state, updated_at: '2026-09-16T10:00:00Z' } });
  });
  await page.route('**/api/reports', (r) => {
    const body = r.request().postDataJSON();
    state.saved.push(body);
    return r.fulfill({
      json: {
        id: '1e61d60e-e4b5-4c91-b7d1-6a56d9465680',
        revision: body.baseRevision ? body.baseRevision + 1 : 1,
      },
    });
  });
  if (undated) state.workspace.workingHours.JRE.rows[0].end[0] = '123.5';
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  return { state, errors };
}

test('NTP defaults and mode switching retain undated partial work readings', async ({ page }) => {
  const { state, errors } = await setup(page, { undated: true });
  await expect(page.locator('#clock-status')).toHaveText('NTP synchronized');
  await page.locator('#reading-mode').selectOption('workingHours');
  await expect(page.locator('#work-date')).toHaveValue('');
  await expect(cell(page, 'end')).toHaveValue('123.5');
  await page.locator('#reading-mode').selectOption('daily');
  await page.locator('#reading-mode').selectOption('workingHours');
  await expect(cell(page, 'end')).toHaveValue('123.5');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  expect(state.workspace.workingHours.JRE.startDate).toBe('');
  expect(state.workspace.workingHours.JRE.rows[0].end[0]).toBe('123.5');
  expect(errors).toEqual([]);
});

test('work and daily drafts remain separate through plant/language switching, autosave and reload', async ({
  page,
}, info) => {
  const { state, errors } = await setup(page);
  const daily = await page.locator('#report-preview').inputValue();
  await page.locator('#reading-mode').selectOption('workingHours');
  await expect(page.locator('#work-period')).toBeVisible();
  await expect(page.locator('#gas-section')).toBeHidden();
  await expect(page.locator('#water-section')).toBeHidden();
  await expect(page.locator('#combined-period')).toBeHidden();
  await expect(page.locator('#work-start-time')).toHaveValue('08:00');
  await expect(page.locator('#work-end-time')).toHaveValue('17:00');
  await page.locator('#work-date').fill('2026-09-16');
  await page.locator('#work-copy-morning').click();
  await expect(cell(page)).toHaveValue('100000');
  await expect(cell(page, 'end')).toHaveValue('');
  await cell(page, 'end').fill('100125.25');
  await page.locator('#save-report').click();
  expect(state.saved).toHaveLength(0);
  expect(state.workspace.workingHours.JRE.rows[0].end[0]).toBe('100125.25');
  await page.locator('[data-plant="UNILAND"]').click();
  await expect(cell(page)).toHaveValue('');
  await page.locator('#work-date').fill('2026-09-16');
  await page.locator('#work-copy-morning').click();
  await expect(cell(page)).toHaveValue('1000');
  await page.locator('[data-plant="JRE"]').click();
  await expect(cell(page, 'end')).toHaveValue('100125.25');
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    await expect(cell(page, 'end')).toHaveValue('100125.25');
  }
  await page.locator('#work-period').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('working-hours.png'), fullPage: false });
  await page.locator('#reading-mode').selectOption('daily');
  expect(await page.locator('#report-preview').inputValue()).toBe(daily);
  await expect(page.locator('#gas-section')).toBeVisible();
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  await page.reload();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  await page.locator('#reading-mode').selectOption('workingHours');
  await expect(cell(page, 'end')).toHaveValue('100125.25');
  expect(errors).toEqual([]);
});

test('work reports, timed raw imports, empty next day and Undo keep date/time identity', async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  await page.locator('#reading-mode').selectOption('workingHours');
  await page.locator('#load-example').click();
  await expect(page.locator('#report-preview')).toHaveValue(
    calculateDraft(work('JRE')).reportSectionText,
  );
  const before = await page.locator('#report-preview').inputValue();
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    expect(await page.locator('#report-preview').inputValue()).toBe(before);
  }
  await page.locator('#open-import').click();
  await page.locator('#import-side').selectOption('end');
  expect(await page.locator('#import-text').inputValue()).toContain('Reading time: 17:00 WIB');
  const raw = await page.locator('#import-text').inputValue();
  await page.locator('#import-text').fill(raw.replace('Reading time: 17:00 WIB', ''));
  await page.locator('#apply-import').click();
  await expect(page.locator('#import-dialog')).toBeVisible();
  await expect(page.locator('#import-feedback')).toContainText('Reading time: HH:MM WIB');
  await page.locator('#import-text').fill(raw);
  await page.locator('#apply-import').click();
  await expect(page.locator('#import-dialog')).toBeHidden();
  await page.locator('#save-report').click();
  expect(state.saved[0].draft.periodKind).toBe('workingHours');
  await page.locator('#save-report').click();
  expect(state.saved[1].baseRevision).toBe(1);
  expect(state.saved[1].id).toBe('1e61d60e-e4b5-4c91-b7d1-6a56d9465680');
  expect(state.saved[0].draft.startDate).toBe(state.saved[0].draft.endDate);
  await page.locator('#work-end-time').fill('17:15');
  await expect(cell(page, 'end')).toHaveValue('');
  await page.locator('#undo-change').click();
  await expect(cell(page, 'end')).toHaveValue('103000');
  await page.locator('#next-day').click();
  await expect(page.locator('#work-date')).toHaveValue('2026-09-17');
  await expect(cell(page)).toHaveValue('');
  await expect(cell(page, 'end')).toHaveValue('');
  await page.locator('#undo-change').click();
  await expect(cell(page, 'end')).toHaveValue('103000');
  expect(errors).toEqual([]);
});

test('legacy backup retains work data and workspace Undo restores both modes', async ({ page }) => {
  const { state, errors } = await setup(page);
  await page.locator('#reading-mode').selectOption('workingHours');
  await cell(page, 'end').fill('123.5');
  const legacy = {
    version: 4,
    drafts: { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND') },
  };
  legacy.drafts.JRE.rows[0].start[0] = '99999';
  const raw = createDraftBackup(legacy, user.id);
  page.once('dialog', (d) => d.accept());
  await page
    .locator('#draft-backup-file')
    .setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await expect(cell(page, 'end')).toHaveValue('123.5');
  await page.locator('#reading-mode').selectOption('daily');
  await expect(cell(page)).toHaveValue('99999');
  await page.locator('#undo-change').click();
  await expect(page.locator('#reading-mode')).toHaveValue('workingHours');
  await expect(cell(page, 'end')).toHaveValue('123.5');
  await page.locator('#reading-mode').selectOption('daily');
  await expect(cell(page)).toHaveValue('100000');
  expect(errors).toEqual([]);
});

test('graphs isolate work mode, preserve actual times, and exclude utility selections', async ({
  page,
}) => {
  const { errors } = await setup(page);
  const requests = [];
  await page.route('**/api/graphs?**', (r) => {
    const params = Object.fromEntries(new URL(r.request().url()).searchParams);
    requests.push(params);
    const d = work(params.plant),
      snapshot = reportSnapshot(d);
    snapshot.period = { kind: 'workingHours', startTime: '08:00', endTime: '17:00' };
    const records = graphRecords(
      [{ id: 'synthetic', revision: 1, start_date: d.startDate, end_date: d.endDate, snapshot }],
      params.plant,
    );
    return r.fulfill({
      json: { ...params, records: params.kind === 'workingHours' ? records : [] },
    });
  });
  await page.locator('#reading-mode').selectOption('workingHours');
  await page.locator('#load-example').click();
  await page.locator('#open-graphs').click();
  await expect(page.locator('#graph-kind')).toHaveValue('workingHours');
  await expect(page.locator('#graph-status')).toContainText('1');
  expect(requests.at(-1).kind).toBe('workingHours');
  expect(await page.locator('#graph-cards svg').first().textContent()).toContain('Working hours');
  await page.locator('.graph-data').first().locator('summary').click();
  await expect(page.locator('.graph-data').first()).toContainText('08:00 → 17:00 WIB (9 hours)');
  await page.locator('.graph-settings').first().locator('summary').click();
  expect(
    await page.locator('[data-graph-unit]').first().locator('option').allTextContents(),
  ).toEqual(['kWh']);
  await page.locator('#graph-kind').selectOption('daily');
  await expect(page.locator('#graph-status')).toContainText('No');
  expect(requests.at(-1).kind).toBe('daily');
  expect(errors).toEqual([]);
});
