import { test, expect, modernWorkspace } from './fixtures.js';
import { excelWorkspace } from '../fixtures/excel-periods.mjs';
import { reportSnapshot } from '../../server/report-data.js';
import { graphRecords } from '../../graph-data.js';
const account = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'theme-test',
  role: 'operator',
  mustChangePassword: false,
};
async function setup(page) {
  const original = modernWorkspace(excelWorkspace()),
    errors = [];
  // Shared synthetic observations: measured stock rises during Night without a refill.
  for (const plant of ['JRE', 'UNILAND'])
    for (const [collection, start, end] of [
      ['drafts', '1100', '1050'],
      ['workingHours', '1100', '1000'],
      ['nightShifts', '1000', '1050'],
    ])
      original[collection][plant].gas.entries[2] = {
        enabled: true,
        start: { reading: start, temperature: '' },
        end: { reading: end, temperature: '' },
        refills: [],
      };
  let workspace = structuredClone(original),
    version = 1,
    user = account,
    writes = 0;
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/auth', (r) => {
    if (r.request().method() === 'POST' && r.request().postDataJSON().action === 'logout')
      user = null;
    return r.fulfill({ json: { available: true, user } });
  });
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      writes++;
      workspace = r.request().postDataJSON().workspace;
      version++;
    }
    return r.fulfill({ json: { workspace, version, updated_at: '2026-10-28T01:00:00Z' } });
  });
  await page.goto('/app');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  await page.locator('#dismiss-guide').click();
  return { original, errors, writes: () => writes };
}
const settled = (page) => expect(page.locator('html')).not.toHaveAttribute('data-panel-wipe', /.+/);
const night = (page) => expect(page.locator('body')).toHaveAttribute('data-night-panel', '');
const day = (page) => expect(page.locator('body')).not.toHaveAttribute('data-night-panel', '');
async function rawMatches(page, draft) {
  const values = await page.locator('.meter-input').evaluateAll((nodes) =>
    nodes.map((n) => ({
      row: +n.dataset.row,
      side: n.dataset.side,
      meter: +n.dataset.meter,
      value: n.value,
    })),
  );
  for (const cell of values) expect(cell.value).toBe(draft.rows[cell.row][cell.side][cell.meter]);
}
for (const plant of ['JRE', 'UNILAND'])
  test(
    plant + ' Night Shift preserves readings and report bytes with soft dark chrome',
    async ({ page }, info) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const { original, errors, writes } = await setup(page);
      await page.locator('[data-plant="' + plant + '"]').click();
      const daily = await page.locator('#report-preview').inputValue();
      await page.locator('#reading-mode').selectOption('nightShift');
      await night(page);
      await settled(page);
      await rawMatches(page, original.nightShifts[plant]);
      const report = await page.locator('#report-preview').inputValue();
      for (const lang of ['en', 'zh-CN', 'id']) {
        await page.locator('#language-select').selectOption(lang);
        await night(page);
        await expect(page.locator('#report-preview')).toHaveValue(report);
      }
      const styles = await page
        .locator('.meter-input')
        .first()
        .evaluate((n) => ({
          ink: getComputedStyle(n).color,
          background: getComputedStyle(n).backgroundColor,
          scheme: getComputedStyle(n).colorScheme,
        }));
      expect(styles.scheme).toBe('dark');
      expect(styles.ink).not.toBe('rgb(255, 255, 255)');
      expect(styles.background).not.toBe('rgb(0, 0, 0)');
      const ratio = await page
        .locator('.meter-input')
        .first()
        .evaluate((n) => {
          const lum = (c) => {
            const v = c
              .match(/\d+/g)
              .slice(0, 3)
              .map((v) => +v / 255)
              .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
            return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
          };
          const c = getComputedStyle(n),
            a = lum(c.color),
            b = lum(c.backgroundColor);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      if (plant === 'JRE') {
        await page.screenshot({ path: info.outputPath('night-panel.png') });
        const gas = page.locator('[data-gas="N2"]');
        await expect(gas).toHaveAttribute('data-state', 'attention');
      }
      await page.locator('#reading-mode').selectOption('workingHours');
      await day(page);
      await rawMatches(page, original.workingHours[plant]);
      await page.locator('#reading-mode').selectOption('daily');
      await day(page);
      await rawMatches(page, original.drafts[plant]);
      await page.locator('#language-select').selectOption('en');
      await expect(page.locator('#report-preview')).toHaveValue(daily);
      expect(writes()).toBe(0);
      expect(errors).toEqual([]);
    },
  );
test('the circular reveal and reverse contraction start at Reading mode and retain keyboard focus', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const { errors } = await setup(page);
  const picker = page.locator('#reading-mode');
  await picker.scrollIntoViewIfNeeded();
  await picker.focus();
  const rect = await picker.boundingBox();
  const getMotion = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => a.effect?.pseudoElement?.startsWith('::view-transition-'))
        .map((a) => ({
          pseudo: a.effect.pseudoElement,
          frames: a.effect.getKeyframes().map((f) => f.clipPath),
        })),
    );
  await picker.selectOption('nightShift');
  await expect
    .poll(getMotion)
    .toEqual(
      expect.arrayContaining([expect.objectContaining({ pseudo: '::view-transition-new(root)' })]),
    );
  const frames = (await getMotion()).find((a) => a.pseudo === '::view-transition-new(root)').frames;
  expect(frames[0]).toContain('circle(0px');
  const origin = frames[0].match(/at ([\d.]+)px ([\d.]+)px/);
  expect(+origin[1]).toBeCloseTo(rect.x + rect.width / 2, 0);
  expect(+origin[2]).toBeCloseTo(rect.y + rect.height / 2, 0);
  await settled(page);
  await night(page);
  await expect(picker).toBeFocused();
  await picker.selectOption('daily');
  await expect
    .poll(getMotion)
    .toEqual(
      expect.arrayContaining([expect.objectContaining({ pseudo: '::view-transition-old(root)' })]),
    );
  expect(
    (await getMotion()).find((a) => a.pseudo === '::view-transition-old(root)').frames[1],
  ).toContain('circle(0px');
  await settled(page);
  await day(page);
  await expect(picker).toBeFocused();
  expect(await page.locator('#report-workspace').count()).toBe(1);
  expect(errors).toEqual([]);
});
test('rapid choices, resize and logout settle the final theme without stale private snapshots', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const { errors } = await setup(page);
  page.on('dialog', (dialog) => dialog.accept());
  await page.locator('#reading-mode').selectOption('nightShift');
  await page.evaluate(() => {
    const p = document.getElementById('reading-mode');
    for (const mode of ['daily', 'nightShift']) {
      p.value = mode;
      p.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await settled(page);
  await night(page);
  await page.locator('#reading-mode').selectOption('daily');
  await page.setViewportSize({ width: 800, height: 720 });
  await settled(page);
  await day(page);
  await page.locator('#reading-mode').selectOption('nightShift');
  await page.evaluate(() => document.getElementById('logout').click());
  await expect(page.locator('body')).toHaveClass(/login-page/);
  await settled(page);
  await day(page);
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.effect?.pseudoElement?.startsWith('::view-transition-'))
          .map((a) => ({
            type: a.constructor.name,
            state: a.playState,
            pseudo: a.effect.pseudoElement,
          })),
      ),
    )
    .toEqual([]);
  expect(errors).toEqual([]);
});
test('motion off, reduced motion, missing API and failed animation leave reading entry usable', async ({
  page,
}) => {
  const { errors } = await setup(page);
  await page.evaluate(() => {
    window.nativePanelTransition = document.startViewTransition;
  });
  for (const fallback of ['off', 'reduced', 'missing', 'throw']) {
    await page.emulateMedia({ reducedMotion: fallback === 'reduced' ? 'reduce' : 'no-preference' });
    await page.evaluate((kind) => {
      document.getElementById('application-surface').dataset.panelMotion =
        kind === 'off' ? 'off' : 'on';
      document.startViewTransition =
        kind === 'missing'
          ? undefined
          : kind === 'throw'
            ? () => {
                throw Error('Synthetic animation failure');
              }
            : window.nativePanelTransition;
    }, fallback);
    await page.locator('#reading-mode').selectOption('nightShift');
    await night(page);
    await settled(page);
    const input = page.locator('.meter-input').first();
    await input.focus();
    await expect(input).toBeFocused();
    await page.locator('#reading-mode').selectOption('daily');
    await day(page);
    await settled(page);
  }
  expect(errors).toEqual([]);
});
test('forced colors takes precedence and print stays light while the Night selection remains intact', async ({
  page,
}) => {
  const { errors } = await setup(page);
  await page.emulateMedia({ forcedColors: 'active' });
  await page.locator('#reading-mode').selectOption('nightShift');
  await day(page);
  await settled(page);
  await expect(page.locator('#reading-mode')).toHaveValue('nightShift');
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
  await night(page);
  await page.emulateMedia({ media: 'print' });
  expect(
    await page
      .locator('.meter-input')
      .first()
      .evaluate((n) => getComputedStyle(n).backgroundColor),
  ).toBe('rgb(255, 255, 255)');
  await page.emulateMedia({ media: 'screen' });
  await night(page);
  expect(errors).toEqual([]);
});

test('dark monitoring chrome preserves white chart markup and native dialog controls', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { original, errors, writes } = await setup(page);
  await page.route('**/api/graphs?**', (r) => {
    const params = Object.fromEntries(new URL(r.request().url()).searchParams);
    const draft = original.nightShifts[params.plant];
    return r.fulfill({
      json: {
        ...params,
        records: graphRecords(
          [
            {
              id: 'synthetic-night',
              revision: 1,
              autosaved: true,
              start_date: draft.startDate,
              end_date: draft.endDate,
              snapshot: reportSnapshot(draft, { allowPartial: true }),
            },
          ],
          params.plant,
        ),
      },
    });
  });
  await page.locator('#reading-mode').selectOption('nightShift');
  await night(page);
  await page.locator('#open-graphs').click();
  await page.locator('#graph-start').fill('2026-10-01');
  await page.locator('#graph-end').fill('2026-10-31');
  await page.locator('#graph-refresh').click();
  const svg = page.locator('.graph-frame svg').first();
  await expect(svg).toBeVisible();
  await expect(svg.locator(':scope > rect').first()).toHaveAttribute('fill', '#ffffff');
  const markup = await svg.evaluate((n) => n.outerHTML);
  await page.evaluate(() => document.body.removeAttribute('data-night-panel'));
  expect(await svg.evaluate((n) => n.outerHTML)).toBe(markup);
  await page.evaluate(() => document.body.setAttribute('data-night-panel', ''));
  expect(await svg.evaluate((n) => n.outerHTML)).toBe(markup);
  const dialog = page.locator('#graphs-dialog');
  expect(await dialog.evaluate((n) => getComputedStyle(n).backgroundColor)).toBe('rgb(32, 45, 63)');
  await page.screenshot({ path: info.outputPath('night-monitoring.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#graphs-dialog')).toBeHidden();
  await page.locator('#open-guide').click();
  const description = page.locator('#guide-description');
  await expect(description).toBeVisible();
  const guideContrast = await description.evaluate((n) => {
    const lum = (c) => {
      const v = c
        .match(/\d+/g)
        .slice(0, 3)
        .map((v) => +v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    };
    const a = lum(getComputedStyle(n).color),
      b = lum(getComputedStyle(n.closest('dialog')).backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(guideContrast).toBeGreaterThanOrEqual(4.5);
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-dialog')).toBeHidden();
  await page.locator('#report-workspace [data-open-raw-template]').first().click();
  await expect(page.locator('#raw-template-dialog')).toBeVisible();
  expect(
    await page.locator('#raw-template-dialog').evaluate((n) => getComputedStyle(n).colorScheme),
  ).toBe('dark');
  await expect(page.locator('#raw-template-preview')).toHaveValue(/____/);

  expect(writes()).toBe(0);
  expect(errors).toEqual([]);
});

test('an active theme wipe settles on hidden, modal, reduced-motion and motion-off changes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const { errors } = await setup(page);
  // Load the optional guide first so this case tests interruption, not lazy network loading.
  await page.locator('#open-guide').click();
  await expect(page.locator('#guide-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-dialog')).toBeHidden();
  for (const reason of ['hidden', 'reduced', 'off', 'dialog']) {
    await page.locator('#reading-mode').selectOption('nightShift');
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .some((a) => a.effect?.pseudoElement === '::view-transition-new(root)'),
    );
    if (reason === 'dialog') {
      await page.evaluate(() => document.getElementById('open-guide').click());
      await expect(page.locator('#guide-dialog')).toBeVisible();
    } else if (reason === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
    else
      await page.evaluate((kind) => {
        if (kind === 'off')
          document.getElementById('application-surface').dataset.panelMotion = 'off';
        else {
          Object.defineProperty(document, 'hidden', { configurable: true, value: true });
          document.dispatchEvent(new Event('visibilitychange'));
        }
      }, reason);
    await settled(page);
    await night(page);
    if (reason === 'dialog') {
      await page.keyboard.press('Escape');
      await expect(page.locator('#guide-dialog')).toBeHidden();
    }
    await page.locator('#reading-mode').selectOption('daily');
    await settled(page);
    await day(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
      document.getElementById('application-surface').dataset.panelMotion = 'on';
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }
  expect(errors).toEqual([]);
});

test('parent and child meter checks remain readable and focus the affected reading at night', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { original, errors } = await setup(page);
  await page.locator('#reading-mode').selectOption('nightShift');
  await page
    .locator('.meter-input[data-row="18"][data-side="end"][data-meter="0"]')
    .fill(original.nightShifts.JRE.rows[18].start[0]);
  await page.keyboard.press('Control+Enter');
  const comparison = page
    .locator('.meter-comparison')
    .filter({ hasText: 'Electricity Building 2#' })
    .first();
  await expect(comparison).toBeVisible();
  const pairs = await comparison.evaluate((n) =>
    ['.comparison-values', '.comparison-meter'].map((s) => {
      const item = n.querySelector(s);
      let bg = item;
      while (bg.parentElement && !/^rgb\(/.test(getComputedStyle(bg).backgroundColor))
        bg = bg.parentElement;
      const lum = (c) => {
        const v = c
          .match(/\d+/g)
          .slice(0, 3)
          .map((v) => +v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
      };
      const a = lum(getComputedStyle(item).color),
        b = lum(getComputedStyle(bg).backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }),
  );
  for (const ratio of pairs) expect(ratio).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: info.outputPath('night-meter-check.png') });
  await comparison.locator('.comparison-meter').first().click();
  await expect(page.locator('.meter-input:focus')).toHaveCount(1);
  await night(page);
  expect(errors).toEqual([]);
});
