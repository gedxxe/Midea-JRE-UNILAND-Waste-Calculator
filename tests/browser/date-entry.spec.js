import { test, expect, modernWorkspace } from './fixtures.js';
import { excelWorkspace } from '../fixtures/excel-periods.mjs';
import { periodKey } from '../../draft-records.js';
import { createDraft } from '../../engine.js';

test.use({ locale: 'en-GB' });
const collections = ['drafts', 'workingHours', 'nightShifts'];
const raw = (d) => ({
  rows: d.rows,
  gas: d.gas,
  water: d.water,
  additional: d.additionalReadings,
  utilities: d.utilities,
});
async function setup(page, { deferTime = false, empty = false } = {}) {
  const before = modernWorkspace(
      empty
        ? { version: 4, drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') } }
        : excelWorkspace(),
    ),
    expected = new Map(),
    stored = new Map(),
    writes = [],
    reads = [],
    errors = [];
  let workspace = structuredClone(before),
    version = 1,
    reportWrites = 0,
    releaseTime,
    timeReleased = false;
  const checkpoint = JSON.stringify(before);
  for (const collection of collections)
    for (const plant of ['JRE', 'UNILAND']) {
      const original = before[collection][plant],
        archived = structuredClone(original);
      archived.startDate = archived.startDate.replace('2026', '2027');
      archived.endDate = archived.endDate.replace('2026', '2027');
      archived.rows[0].start[0] = collection === 'nightShifts' ? '610' : '600';
      archived.rows[0].end[0] = collection === 'workingHours' ? '610' : '620';
      for (const draft of [original, archived]) {
        const key = periodKey(draft);
        if (key) {
          expected.set(key, structuredClone(draft));
          stored.set(key, structuredClone(draft));
        }
      }
    }
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: {
          id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
          username: 'date-test',
          role: 'operator',
          mustChangePassword: false,
        },
      },
    }),
  );
  await page.route('**/api/time', async (r) => {
    if (!deferTime) return r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } });
    if (!timeReleased)
      await new Promise((resolve) => {
        releaseTime = () => {
          timeReleased = true;
          resolve();
        };
      });
    return r.fulfill({
      json: {
        unixMs: Date.UTC(2026, 10, 2, 1),
        source: 'time.cloudflare.com',
        protocol: 'NTP',
        sampleAgeMs: 0,
        uncertaintyMs: 5,
        stratum: 3,
      },
    });
  });
  await page.route('**/api/drafts*', (r) => {
    const key = new URL(r.request().url()).searchParams.get('period');
    if (key) {
      reads.push(key);
      return r.fulfill({
        json: { key, version: stored.has(key) ? 1 : 0, draft: stored.get(key) || null },
      });
    }
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      writes.push(structuredClone(body));
      workspace = body.workspace;
      version++;
      for (const draft of [
        ...collections.flatMap((c) => Object.values(workspace[c])),
        ...(body.periods || []),
      ])
        if (periodKey(draft)) stored.set(periodKey(draft), structuredClone(draft));
    }
    return r.fulfill({ json: { workspace, version, updated_at: '2026-11-01T01:00:00Z' } });
  });
  await page.route('**/api/reports', (r) => {
    if (r.request().method() === 'POST') reportWrites++;
    return r.fulfill({ json: { reports: [] } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app');
  await expect(page.locator('#save-status')).toContainText('All changes saved');
  await page.locator('#dismiss-guide').click();
  return {
    before,
    expected,
    stored,
    writes,
    reads,
    errors,
    releaseTime: () => releaseTime?.(),
    checkpoint: () => JSON.stringify(before) === checkpoint,
    reportWrites: () => reportWrites,
  };
}
async function year(input, text) {
  await input.focus();
  await input.press('ArrowLeft');
  await input.press('ArrowLeft');
  await input.press('ArrowLeft');
  await input.press('ArrowLeft');
  await input.press('ArrowRight');
  await input.press('ArrowRight');
  await input.pressSequentially(text, { delay: 90 });
}

test('untouched login date focus allows NTP defaults and the first partial period autosave', async ({
  page,
}) => {
  const model = await setup(page, { deferTime: true, empty: true });
  await page.locator('#start-date').focus();
  await expect(page.locator('#date-entry-note')).toBeHidden();
  model.releaseTime();
  await expect(page.locator('#clock-status')).toContainText('NTP synchronized');
  await expect(page.locator('#start-date')).toHaveValue('2026-11-01');
  await expect(page.locator('#end-date')).toHaveValue('2026-11-02');
  await page.locator('.meter-input[data-row="0"][data-side="start"]').first().fill('123.');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-status')).toContainText('All changes saved');
  const draft = model.stored.get('JRE:daily:2026-11-01:2026-11-02');
  expect(draft.rows[0].start[0]).toBe('123.');
  expect(model.reportWrites()).toBe(0);
  expect(model.checkpoint()).toBe(true);
  expect(model.errors).toEqual([]);
});
for (const plant of ['JRE', 'UNILAND'])
  for (const [mode, collection] of [
    ['daily', 'drafts'],
    ['workingHours', 'workingHours'],
    ['nightShift', 'nightShifts'],
  ])
    test(`${plant} ${mode} native year entry stays 2026 and revisits stored readings without intermediate saves`, async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, 'Android uses a native date picker, not editable keyboard segments.');
      const model = await setup(page),
        original = model.before[collection][plant];
      await page.locator(`[data-plant="${plant}"]`).click();
      await page.locator('#reading-mode').selectOption(mode);
      const ids =
        mode === 'daily'
          ? plant === 'JRE'
            ? ['start-date', 'end-date']
            : ['end-date', 'start-date']
          : ['work-date'];
      for (const id of ids) {
        await year(page.locator('#' + id), '2026');
        await expect(page.locator('#' + id)).toHaveValue(
          id === 'end-date' ? original.endDate : original.startDate,
        );
      }
      await expect(page.locator('#date-entry-note')).toBeVisible();
      await expect(page.locator('.entry-column')).toHaveAttribute('inert', '');
      expect(model.writes).toHaveLength(0);
      expect(model.reads).toHaveLength(0);
      await page.locator('#' + ids.at(-1)).press('Enter');
      await expect(page.locator('#date-entry-note')).toBeHidden();
      await page.waitForTimeout(600);
      expect(model.writes).toHaveLength(0);
      for (const targetYear of ['2027', '2026']) {
        for (const id of ids) await year(page.locator('#' + id), targetYear);
        const unchanged = model.writes.length;
        await page.waitForTimeout(550);
        expect(model.writes).toHaveLength(unchanged);
        await page.locator('#' + ids.at(-1)).press('Enter');
        await expect(page.locator('.entry-column')).not.toHaveAttribute('inert', '');
        const target = {
          ...original,
          startDate: original.startDate.replace('2026', targetYear),
          endDate: original.endDate.replace('2026', targetYear),
        };
        const expected = model.expected.get(periodKey(target));
        await expect(
          page.locator('.meter-input[data-row="0"][data-side="end"]').first(),
        ).toHaveValue(expected.rows[0].end[0]);
        await page.keyboard.press('Control+s');
        await expect(page.locator('#save-status')).toContainText('All changes saved');
      }
      for (const [key, draft] of model.stored)
        if (model.expected.has(key)) expect(raw(draft)).toEqual(raw(model.expected.get(key)));
      expect(JSON.stringify(model.writes)).not.toMatch(/0002-|0020-|0202-/);
      expect(model.checkpoint()).toBe(true);
      expect(model.reportWrites()).toBe(0);
      expect(model.errors).toEqual([]);
      await page.reload();
      await page.locator(`[data-plant="${plant}"]`).click();
      await page.locator('#reading-mode').selectOption(mode);
      await expect(page.locator('.meter-input[data-row="0"][data-side="end"]').first()).toHaveValue(
        original.rows[0].end[0],
      );
    });

test('native partial dates cancel safely, block shortcut saves and survive late NTP initialization', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Android uses a native date picker, not editable keyboard segments.');
  const model = await setup(page, { deferTime: true }),
    input = page.locator('#end-date');
  await year(input, '20');
  await expect(input).toHaveValue('0020-10-28');
  model.releaseTime();
  await expect(page.locator('#clock-status')).toContainText('NTP synchronized');
  await expect(input).toHaveValue('0020-10-28');
  await input.press('Control+s');
  expect(model.writes).toHaveLength(0);
  await input.press('Escape');
  await expect(input).toHaveValue('2026-10-28');
  await expect(page.locator('#date-entry-note')).toBeHidden();
  await expect(page.locator('.entry-column')).not.toHaveAttribute('inert', '');
  expect(model.writes).toHaveLength(0);
  expect(model.checkpoint()).toBe(true);
  expect(model.errors).toEqual([]);
});

test('native typing cancels a queued intermediate calendar period and blur commits a finished date', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Android uses a native date picker, not editable keyboard segments.');
  const model = await setup(page),
    input = page.locator('#end-date');
  // Hold the 450 ms navigation timer while selecting native date segments.
  // Host/browser IPC speed must not decide whether this queue case is exercised.
  const now = Date.now();
  await page.clock.install({ time: new Date(now) });
  await page.clock.pauseAt(new Date(now + 1000));
  await input.fill('2027-10-28');
  await year(input, '2026');
  await expect(input).toHaveValue('2026-10-28');
  await page.locator('#reading-mode').focus();
  await expect(page.locator('#reading-mode')).toBeFocused();
  await expect(page.locator('#date-entry-note')).toBeHidden();
  await page.clock.runFor(700);
  await expect(input).toHaveValue('2026-10-28');
  expect(model.reads).toHaveLength(0);
  expect(model.writes).toHaveLength(0);
  await input.fill('');
  await expect(page.locator('#date-entry-note')).toBeHidden();
  await expect(input).toHaveValue('');
  expect(model.errors).toEqual([]);
});

test('complete picker dates retain immediate period loading for both factories and all modes', async ({
  page,
}) => {
  const model = await setup(page);
  for (const plant of ['JRE', 'UNILAND']) {
    await page.locator(`[data-plant="${plant}"]`).click();
    for (const [mode, collection] of [
      ['daily', 'drafts'],
      ['workingHours', 'workingHours'],
      ['nightShift', 'nightShifts'],
    ]) {
      await page.locator('#reading-mode').selectOption(mode);
      const original = model.before[collection][plant];
      for (const targetYear of ['2027', '2026']) {
        if (mode === 'daily') {
          await page.locator('#end-date').fill(original.endDate.replace('2026', targetYear));
          await page.locator('#start-date').fill(original.startDate.replace('2026', targetYear));
        } else
          await page.locator('#work-date').fill(original.startDate.replace('2026', targetYear));
        await expect(page.locator('#date-entry-note')).toBeHidden();
        const target = {
          ...original,
          startDate: original.startDate.replace('2026', targetYear),
          endDate: original.endDate.replace('2026', targetYear),
        };
        await expect(
          page.locator('.meter-input[data-row="0"][data-side="end"]').first(),
        ).toHaveValue(model.expected.get(periodKey(target)).rows[0].end[0]);
      }
    }
  }
  for (const [key, draft] of model.stored)
    if (model.expected.has(key)) expect(raw(draft)).toEqual(raw(model.expected.get(key)));
  expect(model.checkpoint()).toBe(true);
  expect(model.reportWrites()).toBe(0);
  expect(model.errors).toEqual([]);
});
