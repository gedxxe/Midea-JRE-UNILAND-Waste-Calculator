import { test, expect, modernWorkspace } from './fixtures.js';
import { formatBlankReadingTemplate } from '../../raw-export.js';
import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from '../../engine.js';
import { exportAllRawReadings } from '../../raw-meter-export.js';
import { periodKey } from '../../draft-records.js';
import { PLANT_SCHEMAS } from '../../schema.js';
import { reportPeriods } from '../fixtures/report-periods.mjs';
const cell = (page, row, side = 'start', meter = 0) =>
  page.locator(
    '.meter-input[data-row="' + row + '"][data-side="' + side + '"][data-meter="' + meter + '"]',
  );
async function setup(page, filled = false) {
  const workspace = { version: 4, drafts: {}, workingHours: {}, nightShifts: {} };
  for (const plant of ['JRE', 'UNILAND']) {
    const periods = filled
      ? reportPeriods(plant, '2026-10-27')
      : [
          createDraft(plant, '2026-10-27', '2026-10-28'),
          createWorkingHoursDraft(plant, '2026-10-27'),
          createNightShiftDraft(plant, '2026-10-27'),
        ];
    ['drafts', 'workingHours', 'nightShifts'].forEach(
      (key, i) => (workspace[key][plant] = periods[i]),
    );
  }
  let state = modernWorkspace(workspace),
    version = 1;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: {
          id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
          username: 'import-test',
          role: 'operator',
          mustChangePassword: false,
        },
      },
    }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      state = r.request().postDataJSON().workspace;
      version++;
    }
    return r.fulfill({ json: { workspace: state, version, updated_at: '2026-10-27T01:00:00Z' } });
  });
  await page.goto('/app');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  return { errors, workspace: () => structuredClone(state) };
}
async function apply(page, text, side = 'end') {
  await page.locator('#open-import').click();
  await page.selectOption('#import-side', side);
  await page.locator('#import-text').fill(text);
  await page.locator('#apply-import').click();
}
for (const plant of ['JRE', 'UNILAND']) {
  for (const mode of ['daily', 'workingHours', 'nightShift']) {
    test(plant + ' filled blank template imports every meter in ' + mode, async ({ page }) => {
      const { errors } = await setup(page);
      await page.locator('[data-plant="' + plant + '"]').click();
      await page.selectOption('#reading-mode', mode);
      const meterCount = PLANT_SCHEMAS[plant].rows.reduce(
        (count, row) => count + row.factors.length,
        0,
      );
      for (const side of ['start', 'end']) {
        const date = mode === 'workingHours' || side === 'start' ? '27/10/2026' : '28/10/2026';
        const time =
          mode === 'nightShift'
            ? side === 'start'
              ? '17:00'
              : '08:00'
            : side === 'start'
              ? '08:00'
              : '17:00';
        let slot = 0;
        const values = [];
        const text = formatBlankReadingTemplate(plant, mode !== 'daily')
          .replace('DD/MM/YYYY', date)
          .replace('HH:MM', time)
          .replaceAll('____', () => {
            const value = String(1000 + (side === 'end' ? 10 : 0) + ++slot) + ',123456';
            values.push(value);
            return value;
          });
        const otherFlow =
          plant === 'JRE'
            ? await page.locator('#air-flow-' + (side === 'start' ? 'end' : 'start')).inputValue()
            : null;
        expect(values).toHaveLength(meterCount + (plant === 'JRE' ? 1 : 0));
        await apply(page, text, side);
        await expect(page.locator('#import-dialog')).toBeHidden();
        expect(
          await page
            .locator('.meter-input[data-side="' + side + '"]')
            .evaluateAll((inputs) => inputs.map((i) => i.value)),
        ).toEqual(values.slice(0, meterCount));
        if (plant === 'JRE') {
          await expect(page.locator('#air-flow-' + side)).toHaveValue(values[meterCount]);
          await expect(
            page.locator('#air-flow-' + (side === 'start' ? 'end' : 'start')),
          ).toHaveValue(otherFlow);
        }
      }
      expect(errors).toEqual([]);
    });
  }
  test(
    plant + ' partial imports preserve exact observations and leave new dates unknown',
    async ({ page }, info) => {
      const { errors } = await setup(page, true);
      await page.locator('[data-plant="' + plant + '"]').click();
      const partial = formatBlankReadingTemplate(plant)
        .replace('DD/MM/YYYY', '28/10/2026')
        .replace('____', '1099');
      await apply(page, partial);
      await expect(page.locator('#import-dialog')).toBeHidden();
      await expect(cell(page, 0, 'end')).toHaveValue('1099');
      await expect(cell(page, 1, 'end')).toHaveValue('1010');
      await apply(page, partial.replace('28/10/2026', '29/10/2026'));
      await expect(page.locator('#import-dialog')).toBeHidden();
      await expect(cell(page, 0, 'end')).toHaveValue('1099');
      await expect(cell(page, 1, 'end')).toHaveValue('');
      await expect(cell(page, 1)).toHaveValue('1000');
      await page.locator('#open-import').click();
      await expect(page.locator('#import-format')).toContainText(
        plant + ': ' + PLANT_SCHEMAS[plant].rows.length + ' equipment',
      );
      await page.locator('#import-text').fill(formatBlankReadingTemplate(plant));
      await page.locator('#apply-import').click();
      await expect(page.locator('#import-feedback')).toContainText('Enter one reading date');
      await expect(page.locator('#import-feedback')).not.toContainText('invalid format');
      await page
        .locator('#import-text')
        .fill(partial.replace('1. Total: 1099', '1. Total: <img src=x onerror=alert(1)>'));
      await page.locator('#apply-import').click();
      await expect(page.locator('#import-feedback')).toContainText('meter 1: use a number');
      expect(await page.locator('#import-feedback img').count()).toBe(0);
      await page
        .locator('#import-dialog')
        .screenshot({ path: info.outputPath('import-feedback-' + plant + '.png') });
      await page
        .locator('#import-text')
        .fill(partial.replace(plant, plant === 'JRE' ? 'UNILAND' : 'JRE'));
      await page.locator('#apply-import').click();
      await expect(page.locator('#import-feedback')).toContainText('Select that factory first.');
      await page.locator('#import-dialog form button').click();
      await expect(cell(page, 0, 'end')).toHaveValue('1099');
      await expect(cell(page, 1, 'end')).toHaveValue('');
      expect(errors).toEqual([]);
    },
  );
}
test('timed placeholder uses the selected time and old UNILAND lists retain new meter slots', async ({
  page,
}) => {
  const { errors } = await setup(page, true);
  await page.locator('[data-plant="UNILAND"]').click();
  await page.selectOption('#reading-mode', 'workingHours');
  const partial = formatBlankReadingTemplate('UNILAND', true)
    .replace('DD/MM/YYYY', '27/10/2026')
    .replace('____', '1044')
    .split('\n')
    .filter((line) => !/^\d+[.)] (SV window|Painting|Dryer):/.test(line))
    .join('\n');
  await apply(page, partial);
  await expect(page.locator('#import-dialog')).toBeHidden();
  await expect(cell(page, 0, 'end')).toHaveValue('1044');
  await expect(page.locator('#end-reading-date')).toContainText('17:00');
  for (const name of ['SV window', 'Painting', 'Dryer']) {
    const ri = PLANT_SCHEMAS.UNILAND.rows.findIndex((r) => r.name === name);
    await expect(cell(page, ri, 'end')).toHaveValue('1004');
  }
  expect(errors).toEqual([]);
});
test('parent checks group meters, navigate exactly and clear private details on collapse and logout', async ({
  page,
}, info) => {
  const { errors } = await setup(page, true);
  await cell(page, 18, 'end').fill('1001');
  await page.locator('#check-data').click();
  const note = page
    .locator('#validation-list .meter-comparison')
    .filter({ hasText: 'exceed Electricity Building 2#' });
  await expect(note).toHaveCount(1);
  await expect(page.locator('#validation-list > li').first()).toHaveClass('meter-comparison');
  await expect(note.locator('strong').filter({ hasText: 'Heat Exchanger' })).toHaveCount(1);
  await expect(note.locator('.comparison-values')).toContainText('Parent meter: 1 kWh');
  await expect(note.locator('.comparison-values')).toBeVisible();
  await expect(note.locator('[data-related-row="5"]')).toHaveCount(4);
  const report = await page.locator('#report-preview').inputValue();
  for (const lang of ['zh-CN', 'id', 'en']) {
    await page.selectOption('#language-select', lang);
    await expect(page.locator('#report-preview')).toHaveValue(report);
  }
  await page
    .locator('#validation-panel')
    .screenshot({ path: info.outputPath('grouped-parent-checks.png') });
  await page.locator('#search-meter').fill('Indoor');
  await page.locator('#only-incomplete').check();
  await note.locator('[data-related-row="5"][data-related-meter="2"]').click();
  await expect(cell(page, 5, 'start', 2)).toBeFocused();
  await expect(page.locator('#search-meter')).toHaveValue('');
  await expect(page.locator('#only-incomplete')).not.toBeChecked();
  await page.locator('#check-data').click();
  await expect(page.locator('#validation-list')).toBeEmpty();
  await page.locator('#check-data').click();
  await expect(page.locator('#validation-list .comparison-values')).not.toHaveCount(0);
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user: null } }));
  page.on('dialog', (d) => d.accept());
  await page.locator('#logout').click();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#validation-list')).toBeEmpty();
  expect(errors).toEqual([]);
});

for (const plant of ['JRE', 'UNILAND'])
  for (const [mode, index, collection, range, time] of [
    ['daily', 0, 'drafts', '07:00–08:00', '08:00'],
    ['workingHours', 1, 'workingHours', '18:00-19:00', '18:00'],
    ['nightShift', 2, 'nightShifts', '07:00—08:00', '07:00'],
  ])
    test(`${plant} ${mode} raw range imports preserve opposite readings, Undo and reload`, async ({
      page,
    }) => {
      const { errors, workspace } = await setup(page, true);
      await page.locator(`[data-plant="${plant}"]`).click();
      await page.selectOption('#reading-mode', mode);
      const before = workspace();
      const source = reportPeriods(plant, '2026-10-27')[index];
      source.rows.forEach((r) => r.end.fill('001234,123456'));
      source.water = { start: '100', end: '00200,123456' };
      if (plant === 'JRE') {
        source.additionalReadings = Array.from({ length: 4 }, () => ({
          start: '100',
          end: '00200,123456',
        }));
        source.airCompressor = { start: '100', end: '00200,123456' };
      }
      source.gas.entries.forEach((g, i) => {
        g.enabled = true;
        g.end = {
          reading: '00200,123456',
          temperature: i === 3 && plant === 'UNILAND' ? '25.5' : '',
          ...(i === 3 && plant === 'JRE' ? { unit: 'kg' } : {}),
        };
      });
      const originalRaw = exportAllRawReadings(source).text;
      expect(originalRaw).not.toBe('');
      const text = originalRaw
        .replace(/^Reading time:.*\n/m, '')
        .replace(/^(\d{2}\/\d{2}\/\d{4})$/m, '$1 (Morning)\nReading time: ' + range + ' WIB')
        .replace(/\n\n/g, '\n')
        .replace(/: /g, '：');
      await apply(page, text);
      await expect(page.locator('#import-dialog')).toBeHidden();
      await expect(cell(page, 0, 'end')).toHaveValue('001234,123456');
      await expect(cell(page, 0, 'start')).toHaveValue(before[collection][plant].rows[0].start[0]);
      await expect(page.locator('#water-end')).toHaveValue('00200,123456');
      if (mode === 'daily')
        await expect(page.locator('#toast')).toContainText('08:00 WIB boundary');
      else await expect(page.locator('#end-reading-date')).toContainText(time);
      await expect(page.locator('#save-status')).toContainText('All changes saved');
      const saved = workspace()[collection][plant];
      expect(saved.rows[0].start).toEqual(before[collection][plant].rows[0].start);
      expect(saved.rows[0].end).toEqual(source.rows[0].end);
      expect(saved.water.end).toBe('00200,123456');
      expect(saved.gas.entries[3].end.reading).toBe('00200,123456');
      if (plant === 'JRE') {
        expect(saved.additionalReadings[3].end).toBe('00200,123456');
        expect(saved.airCompressor.end).toBe('00200,123456');
      }
      await page.locator('#undo-change').click();
      await expect(cell(page, 0, 'end')).toHaveValue(before[collection][plant].rows[0].end[0]);
      await expect(page.locator('#save-status')).toContainText('All changes saved');
      expect(workspace()[collection][plant]).toEqual(before[collection][plant]);
      await apply(page, text);
      await expect(page.locator('#import-dialog')).toBeHidden();
      await expect(page.locator('#save-status')).toContainText('All changes saved');
      await page.reload();
      await page.locator(`[data-plant="${plant}"]`).click();
      await page.selectOption('#reading-mode', mode);
      await expect(cell(page, 0, 'end')).toHaveValue('001234,123456');
      await expect(cell(page, 0, 'start')).toHaveValue(before[collection][plant].rows[0].start[0]);
      expect(errors).toEqual([]);
    });

test('import loads a stored destination before changing values and rejects a failed read', async ({
  page,
}) => {
  const { errors } = await setup(page, true);
  const target = reportPeriods('JRE', '2026-10-28')[0];
  target.startDate = '2026-10-27';
  target.rows[0].start[0] = '5000';
  target.rows[1].end[0] = '6000';
  const before = structuredClone(target);
  let fail = true,
    reads = 0;
  await page.route('**/api/drafts?**', (r) => {
    reads++;
    return fail
      ? r.fulfill({ status: 503, json: { error: 'UNAVAILABLE' } })
      : r.fulfill({ json: { key: periodKey(target), draft: target, version: 2 } });
  });
  const partial = formatBlankReadingTemplate('JRE')
    .replace('DD/MM/YYYY', '29/10/2026')
    .replace('____', '7000');
  await apply(page, partial);
  await expect(page.locator('#import-feedback')).toContainText(
    'Could not load the destination period',
  );
  await expect(cell(page, 0, 'end')).toHaveValue('1010');
  fail = false;
  await page.locator('#apply-import').click();
  await expect(page.locator('#import-dialog')).toBeHidden();
  await expect(cell(page, 0, 'start')).toHaveValue('5000');
  await expect(cell(page, 0, 'end')).toHaveValue('7000');
  await expect(cell(page, 1, 'end')).toHaveValue('6000');
  expect(reads).toBe(2);
  expect(target).toEqual(before);
  expect(errors).toEqual([]);
});

test('full timed import loads destination utilities, preserves the other boundary and cancels a late read', async ({
  page,
}) => {
  const { errors, workspace } = await setup(page, true);
  await page.selectOption('#reading-mode', 'workingHours');
  const [daily, day, night] = reportPeriods('JRE', '2026-11-14');
  day.rows[0].start[0] = '777.123456';
  day.water = { start: '123.123456', end: '150' };
  night.rows[0].end[0] = '999.123456';
  const originals = structuredClone([daily, day, night]);
  const source = structuredClone(day);
  source.rows.forEach((r) => r.end.fill('888.123456'));
  source.water.end = '180.123456';
  source.additionalReadings = Array.from({ length: 4 }, () => ({
    start: '100',
    end: '120.123456',
  }));
  source.airCompressor = { start: '100', end: '120.123456' };
  source.gas.entries.forEach((g, i) => {
    g.enabled = true;
    g.end = { reading: '120.123456', temperature: '', ...(i === 3 ? { unit: 'kg' } : {}) };
  });
  const text = exportAllRawReadings(source).text.replace(
    'Reading time: 17:00',
    'Reading time: 18:00-19:00',
  );
  const pending = new Map();
  let release,
    hold = true,
    reads = 0;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/drafts?**', async (r) => {
    reads++;
    if (hold) await gate;
    const key = new URL(r.request().url()).searchParams.get('period');
    const draft = [day, night].find((d) => periodKey(d) === key);
    if (draft) pending.set(key, draft);
    await r.fulfill({ json: { key, draft: draft || null, version: draft ? 3 : 0 } });
  });
  await apply(page, text);
  await expect.poll(() => reads).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#import-dialog')).toBeHidden();
  const response = page.waitForResponse((r) => r.url().includes('/api/drafts?'));
  hold = false;
  release();
  await response;
  await expect.poll(() => reads).toBe(2);
  await expect(cell(page, 0, 'end')).toHaveValue('1004');
  await apply(page, text);
  await expect(page.locator('#import-dialog')).toBeHidden();
  await expect(cell(page, 0, 'start')).toHaveValue('777.123456');
  await expect(cell(page, 0, 'end')).toHaveValue('888.123456');
  await expect(page.locator('#water-start')).toHaveValue('123.123456');
  await expect(page.locator('#water-end')).toHaveValue('180.123456');
  await expect(page.locator('#save-status')).toContainText('All changes saved');
  const saved = workspace();
  expect(saved.workingHours.JRE.endTime).toBe('18:00');
  expect(saved.nightShifts.JRE.startTime).toBe('18:00');
  expect(saved.nightShifts.JRE.rows[0].start[0]).toBe('888.123456');
  expect(saved.nightShifts.JRE.rows[0].end[0]).toBe('999.123456');
  expect(saved.drafts.JRE.rows[0].start[0]).toBe('1000');
  expect([daily, day, night]).toEqual(originals);
  expect(pending.size).toBe(2);
  expect(errors).toEqual([]);
});
