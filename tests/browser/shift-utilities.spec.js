import { test, expect, modernWorkspace, checkpointReply } from './fixtures.js';
import { utilityPeriods } from '../fixtures/shift-utilities.mjs';

async function setup(page) {
  const j = utilityPeriods(),
    u = utilityPeriods('UNILAND');
  const state = {
    version: 1,
    workspace: {
      version: 4,
      drafts: { JRE: j[0], UNILAND: u[0] },
      workingHours: { JRE: j[1], UNILAND: u[1] },
      nightShifts: { JRE: j[2], UNILAND: u[2] },
    },
    saved: [],
  };
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
          username: 'shift-utility-test',
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
        sampleAgeMs: 0,
        uncertaintyMs: 5,
        stratum: 2,
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
  await page.route('**/api/reports', (r) => {
    state.saved.push(r.request().postDataJSON());
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
const gas = (page, id, key, temp = false) =>
  page.locator(
    '[data-gas="' + id + '"] [data-gas-' + (temp ? 'temperature' : 'point') + '="' + key + '"]',
  );
for (const plant of ['JRE', 'UNILAND']) {
  test(
    plant +
      ' shift utilities show actual times, share stock/temperature/Water and retain reports through language/save/reload',
    async ({ page, context }, info) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const { state, errors } = await setup(page);
      await page.locator('[data-plant="' + plant + '"]').click();
      await page.locator('#reading-mode').selectOption('workingHours');
      await expect(page.locator('#gas-section')).toBeVisible();
      await expect(page.locator('#water-section')).toBeVisible();
      await expect(page.locator('#gas-period')).toContainText('08:00 → 2026-09-16 17:00 WIB');
      await expect(page.locator('#water-total')).toContainText('10 m³');
      await gas(page, 'LPG', 'end').fill('69.5');
      await gas(page, 'R32', 'end', true).fill('33.75');
      await page.locator('#water-end').fill('1012');
      if (plant === 'UNILAND') await page.locator('[data-utility="1"]').fill('12');
      await page.locator('#reading-mode').selectOption('nightShift');
      await expect(page.locator('#gas-period')).toContainText('17:00 → 2026-09-17 08:00 WIB');
      await expect(gas(page, 'LPG', 'start')).toHaveValue('69.5');
      await expect(gas(page, 'R32', 'start', true)).toHaveValue('33.75');
      await expect(page.locator('#water-start')).toHaveValue('1012');
      await expect(page.locator('#water-total')).toContainText('18 m³');
      if (plant === 'UNILAND') await expect(page.locator('[data-utility="1"]')).toHaveValue('20');
      await page.locator('[data-gas-enable="LPG"]').uncheck();
      await page.locator('[data-utility="0"]').fill('7.25');
      await expect(page.locator('#report-preview')).toHaveValue(
        new RegExp('LPG: 7\\.25 ' + (plant === 'UNILAND' ? 'Nm3' : 'Kg')),
      );
      await page.locator('[data-gas-enable="LPG"]').check();
      const text = await page.locator('#report-preview').inputValue();
      expect(text).toContain('Water: 18 m³');
      expect(text).toMatch(/LPG: [\d.]+ Kg/);
      for (const lang of ['zh-CN', 'id', 'en']) {
        await page.locator('#language-select').selectOption(lang);
        await expect(page.locator('#report-preview')).toHaveValue(text);
        await expect(gas(page, 'R32', 'start', true)).toHaveValue('33.75');
      }
      await page.locator('#copy-report').click();
      await expect
        .poll(() =>
          page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n')),
        )
        .toBe(text);
      await page.locator('#save-report').click();
      await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
      await expect.poll(() => state.saved[0]?.draft.periodKind).toBe('nightShift');
      expect(state.saved[0].draft.water).toEqual({ start: '1012', end: '1030' });
      expect(state.saved[0].draft.gas.entries[3].start.temperature).toBe('33.75');
      expect(state.workspace.workingHours[plant].water.end).toBe('1012');
      expect(state.workspace.nightShifts[plant].utilityLayout).toBe(1);
      await page.reload();
      await page.locator('[data-plant="' + plant + '"]').click();
      await page.locator('#reading-mode').selectOption('nightShift');
      await expect(gas(page, 'R32', 'start', true)).toHaveValue('33.75');
      await expect(page.locator('#water-start')).toHaveValue('1012');
      await page
        .locator('[data-gas="LPG"]')
        .screenshot({ path: info.outputPath(plant + '-night-gas.png') });
      await page
        .locator('#water-section')
        .screenshot({ path: info.outputPath(plant + '-night-water.png') });
      expect(errors).toEqual([]);
    },
  );
  test(
    plant +
      ' shift utilities keep refill events in their period, validate bundles and restore date changes with Undo',
    async ({ page }) => {
      const { state, errors } = await setup(page);
      await page.locator('[data-plant="' + plant + '"]').click();
      await page.locator('#reading-mode').selectOption('workingHours');
      await page.locator('[data-add-refill="LPG"]').click();
      await gas(page, 'LPG', 'before0').fill('65');
      await gas(page, 'LPG', 'after0').fill('75');
      await page.locator('#report-periods').selectOption('all');
      await expect(page.locator('#copy-report')).toBeDisabled();
      await expect(
        page.getByText(
          'Refill records differ between 24 HOURS and the selected shifts. Review the refill list in each period.',
          { exact: true },
        ),
      ).toBeVisible();
      await page.locator('#reading-mode').selectOption('nightShift');
      await expect(gas(page, 'LPG', 'before0')).toHaveCount(0);
      await page.locator('#reading-mode').selectOption('daily');
      await page.locator('[data-add-refill="LPG"]').click();
      await gas(page, 'LPG', 'before0').fill('65');
      await gas(page, 'LPG', 'after0').fill('75');
      await expect(page.locator('#copy-report')).toBeEnabled();
      const report = await page.locator('#report-preview').inputValue();
      expect(report.split('\n').filter((l) => /^[*-] Water:/.test(l))).toHaveLength(3);
      await page.locator('#reading-mode').selectOption('workingHours');
      await page.locator('#work-end-time').fill('17:15');
      await expect(gas(page, 'LPG', 'end')).toHaveValue('');
      await expect(gas(page, 'LPG', 'before0')).toHaveCount(0);
      await page.locator('#undo-change').click();
      await expect(page.locator('#work-end-time')).toHaveValue('17:00');
      await expect(gas(page, 'LPG', 'before0')).toHaveValue('65');
      await expect(page.locator('#copy-report')).toBeEnabled();
      await page.locator('#next-day').click();
      await expect(gas(page, 'LPG', 'start')).toHaveValue('60');
      await expect(gas(page, 'LPG', 'end')).toHaveValue('');
      await expect(page.locator('#water-start')).toHaveValue('1030');
      await expect(page.locator('#water-end')).toHaveValue('');
      await expect(gas(page, 'LPG', 'before0')).toHaveCount(0);
      await page.locator('#save-draft').click();
      await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
      expect(state.workspace.workingHours[plant].gas.entries[0].start.reading).toBe('60');
      expect(state.workspace.nightShifts[plant].gas.entries[0].start.reading).toBe('');
      expect(state.saved).toHaveLength(0);
      expect(errors).toEqual([]);
    },
  );
}
