import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.js';
import { exampleDraft } from '../../examples.js';
import { createDraftBackup } from '../../draft-backup.js';

const user = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'recovery-user',
  role: 'operator',
  mustChangePassword: false,
};
const workspace = () => ({
  version: 4,
  drafts: { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND') },
  reportLinks: {},
});
const file = (raw) => ({
  name: 'draft.json',
  mimeType: 'application/json',
  buffer: Buffer.from(raw),
});
const cell = (page) => page.locator('.meter-input').first();

async function setup(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const state = {
    workspace: workspace(),
    version: 1,
    writes: 0,
    reports: 0,
    offline: false,
    updated_at: '2026-10-13T01:23:45.000Z',
  };
  await page.clock.install({ time: new Date('2026-10-13T02:00:00Z') });
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user } }));
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'NTP_UNAVAILABLE' } }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      state.writes++;
      if (state.offline) return r.abort();
      const body = r.request().postDataJSON();
      if (body.baseVersion !== state.version)
        return r.fulfill({ status: 409, json: { error: 'DRAFT_CONFLICT' } });
      state.workspace = body.workspace;
      state.version++;
      state.updated_at = '2026-10-13T02:34:56.000Z';
    }
    return r.fulfill({
      json: { workspace: state.workspace, version: state.version, updated_at: state.updated_at },
    });
  });
  await page.route('**/api/reports', (r) => {
    state.reports++;
    return r.fulfill({ json: {} });
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  return { state, errors };
}

test('account save timestamps are server-confirmed and stay unchanged on failed sync', async ({
  page,
}, info) => {
  const { state, errors } = await setup(page);
  await expect(page.locator('#draft-storage-status')).toContainText('08:23:45');
  await cell(page).fill('100001');
  await expect(page.locator('#save-status')).toContainText('Sync pending');
  await expect(page.locator('#draft-storage-status')).toContainText('Tab copy:');
  await expect(page.locator('#draft-storage-status')).toContainText('08:23:45');
  state.offline = true;
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toContainText('sync failed');
  await expect(page.locator('#draft-storage-status')).toContainText('08:23:45');
  state.offline = false;
  await page.locator('#draft-retry').click();
  await expect(page.locator('#draft-storage-status')).toContainText('09:34:56');
  for (const language of ['zh-CN', 'id', 'en'])
    await page.locator('#language-select').selectOption(language);
  await page.locator('#draft-storage-status').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('draft-status.png') });
  expect(errors).toEqual([]);
});

test('backup round trip restores both factories and partial gas/water, with workspace Undo and no report writes', async ({
  page,
}) => {
  const { state, errors } = await setup(page);
  await page.locator('#water-start').fill('100,25');
  await page.locator('[data-gas-enable="R32"]').check();
  await page.locator('[data-gas="R32"] [data-gas-point="start"]').fill('1000');
  await page.locator('[data-gas="R32"] [data-gas-temperature="start"]').fill('33,5');
  await page.locator('.draft-backup-tools summary').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#download-draft-backup').click(),
  ]);
  const raw = await readFile(await download.path(), 'utf8');
  const parsed = JSON.parse(raw);
  expect(parsed.workspace.drafts.JRE.water).toEqual({ start: '100,25', end: '' });
  expect(parsed.workspace.reportLinks).toBeUndefined();
  await cell(page).fill('999');
  await page.locator('[data-plant="UNILAND"]').click();
  await cell(page).fill('888');
  page.once('dialog', (d) => d.accept());
  await page.locator('#draft-backup-file').setInputFiles(file(raw));
  await expect(cell(page)).toHaveValue(parsed.workspace.drafts.UNILAND.rows[0].start[0]);
  await page.locator('[data-plant="JRE"]').click();
  await expect(page.locator('#water-start')).toHaveValue('100,25');
  await expect(page.locator('[data-gas="R32"] [data-gas-temperature="start"]')).toHaveValue('33,5');
  await expect(page.locator('#copy-report')).toBeDisabled();
  await page.locator('#undo-change').click();
  await expect(cell(page)).toHaveValue('888');
  await page.locator('[data-plant="JRE"]').click();
  await expect(cell(page)).toHaveValue('999');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('999');
  expect(state.reports).toBe(0);
  expect(errors).toEqual([]);
});

test('invalid, oversized, foreign-account and cancelled restore leave the draft intact', async ({
  page,
}) => {
  const { errors } = await setup(page);
  const before = await cell(page).inputValue();
  const foreign = createDraftBackup(workspace(), '0d8ed4b6-5c2b-4f18-b91e-c051dfca530e');
  for (const raw of ['{', ' '.repeat(256 * 1024 + 1), foreign]) {
    await page.locator('#draft-backup-file').setInputFiles(file(raw));
    await expect(page.locator('#toast')).toBeVisible();
    await expect(cell(page)).toHaveValue(before);
  }
  const data = workspace();
  data.drafts.JRE.rows[0].start[0] = '777';
  page.once('dialog', (d) => d.dismiss());
  await page.locator('#draft-backup-file').setInputFiles(file(createDraftBackup(data, user.id)));
  await expect(cell(page)).toHaveValue(before);
  expect(errors).toEqual([]);
});

test('edits during asynchronous file reading cancel restore instead of replacing new input', async ({
  page,
}) => {
  await setup(page);
  const raw = createDraftBackup(workspace(), user.id);
  await page.evaluate((raw) => {
    File.prototype.text = () =>
      new Promise((resolve) => {
        window.finishBackup = () => resolve(raw);
      });
  }, raw);
  await page.locator('#draft-backup-file').setInputFiles(file(raw));
  await cell(page).fill('777');
  await page.evaluate(() => window.finishBackup());
  await expect(page.locator('#toast')).toContainText('Entries changed');
  await expect(cell(page)).toHaveValue('777');
});

test('a different login invalidates a pending backup read and clears save timestamps', async ({
  page,
}) => {
  await setup(page);
  const raw = createDraftBackup(workspace(), user.id);
  await page.evaluate((raw) => {
    File.prototype.text = () =>
      new Promise((resolve) => {
        window.finishBackup = () => resolve(raw);
      });
  }, raw);
  await page.locator('#draft-backup-file').setInputFiles(file(raw));
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user: null } }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#report-workspace')).toBeHidden();
  await page.evaluate(() => window.finishBackup());
  await expect(page.locator('#draft-storage-status')).toHaveText('');
  await expect(page.locator('#toast')).toBeHidden();
});

test('tab-storage failure is distinguished from a confirmed account save', async ({ page }) => {
  const { state } = await setup(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Synthetic quota limit', 'QuotaExceededError');
    };
  });
  state.offline = true;
  await cell(page).fill('12345');
  await page.locator('#save-draft').click();
  await expect(page.locator('#draft-storage-status')).toContainText(
    'Tab copy could not be updated',
  );
  await expect(page.locator('#draft-storage-status')).toContainText('08:23:45');
  state.offline = false;
  await page.locator('#draft-retry').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  await expect(page.locator('#draft-storage-status')).toContainText(
    'Tab copy could not be updated',
  );
  await expect(page.locator('#draft-storage-status')).toContainText('09:34:56');
});

test('check notes focus exact R32 temperature, refill and Water fields without changing report bytes', async ({
  page,
}) => {
  const { errors } = await setup(page);
  for (const plant of ['JRE', 'UNILAND']) {
    await page.locator(`[data-plant="${plant}"]`).click();
    await page.locator('[data-gas-enable="R32"]').check();
    await page.locator('[data-gas="R32"] [data-gas-point="start"]').fill('1000');
    await page.locator('[data-gas="R32"] [data-gas-temperature="start"]').fill('99');
    await page.locator('#water-start').fill('100');
    await page.locator('#check-data').click();
    await page
      .locator('#validation-list button')
      .filter({ hasText: 'start. Enter R32 temperature' })
      .click();
    await expect(page.locator('[data-gas="R32"] [data-gas-temperature="start"]')).toBeFocused();
    await page.locator('[data-gas="R32"] [data-gas-temperature="start"]').fill('33.5');
    await page.locator('[data-add-refill="R32"]').click();
    await page.locator('#validation-list button').filter({ hasText: 'before0.' }).click();
    await expect(page.locator('[data-gas="R32"] [data-gas-point="before0"]')).toBeFocused();
    await page.locator('#validation-list button').filter({ hasText: 'Water: enter both' }).click();
    await expect(page.locator('#water-end')).toBeFocused();
    const report = await page.locator('#report-preview').inputValue();
    for (const language of ['zh-CN', 'id', 'en']) {
      await page.locator('#language-select').selectOption(language);
      await expect(page.locator('#report-preview')).toHaveValue(report);
    }
  }
  expect(errors).toEqual([]);
});
