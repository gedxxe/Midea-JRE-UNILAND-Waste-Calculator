import { test, expect, modernWorkspace, openSignIn } from './fixtures.js';
import { excelWorkspace } from '../fixtures/excel-periods.mjs';

const slogans = [
  ['en', 'Tired of manual meter recording? Try Energy Record.'],
  ['zh-CN', '还在手动整理抄表记录？试试能源记录。'],
  ['id', 'Capek mencatat meter secara manual? Coba Catatan Energi.'],
];
test('the question-style welcome slogan survives language changes, sign-in navigation and reload', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user: null } }));
  await page.route('**/api/time', (r) =>
    r.fulfill({
      json: {
        unixMs: Date.UTC(2026, 9, 28, 1),
        source: 'time.cloudflare.com',
        protocol: 'NTP',
        sampleAgeMs: 0,
        uncertaintyMs: 5,
        stratum: 3,
      },
    }),
  );
  await page.goto('/');
  for (const [lang, text] of slogans) {
    await page.locator('#welcome-language').selectOption(lang);
    await expect(page.locator('.energy-slogan')).toHaveText(text);
    await page.screenshot({ path: info.outputPath('welcome-slogan-' + lang + '.png') });
  }
  await openSignIn(page);
  await page.locator('#back-welcome').click();
  await expect(page.locator('.energy-slogan')).toBeVisible();
  await expect(page.locator('.energy-slogan')).toHaveText(slogans[2][1]);
  await page.reload();
  await expect(page.locator('.energy-slogan')).toHaveText(slogans[2][1]);
  await expect(page.locator('#report-workspace')).toBeHidden();
  expect(errors).toEqual([]);
});

for (const plant of ['JRE', 'UNILAND'])
  test(
    plant +
      ' marks all tank stock increases as amber attention in every period and clears resolved states',
    async ({ page }, info) => {
      let workspace = modernWorkspace(excelWorkspace()),
        version = 1;
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      for (const [collection, phases] of [
        ['drafts', [0, 2]],
        ['workingHours', [0, 1]],
        ['nightShifts', [1, 2]],
      ]) {
        for (const draft of Object.values(workspace[collection]))
          for (const [i, entry] of draft.gas.entries.entries()) {
            const base = i === 0 ? 40 : 1000,
              step = i === 0 ? 5 : 50;
            entry.enabled = true;
            entry.start.reading = String(base + phases[0] * step);
            entry.end.reading = String(base + phases[1] * step);
            entry.refills = [];
            if (i === 3) {
              entry.start.temperature = '30';
              entry.end.temperature = '30';
            }
          }
      }
      await page.route('**/api/auth', (r) =>
        r.fulfill({
          json: {
            available: true,
            user: {
              id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
              username: 'attention-test',
              role: 'operator',
              mustChangePassword: false,
            },
          },
        }),
      );
      await page.route('**/api/time', (r) =>
        r.fulfill({
          json: {
            unixMs: Date.UTC(2026, 9, 28, 1),
            source: 'time.cloudflare.com',
            protocol: 'NTP',
            sampleAgeMs: 0,
            uncertaintyMs: 5,
            stratum: 3,
          },
        }),
      );
      await page.route('**/api/drafts', (r) => {
        if (r.request().method() === 'POST') {
          workspace = r.request().postDataJSON().workspace;
          version++;
        }
        return r.fulfill({ json: { workspace, version, updated_at: '2026-10-28T01:00:00Z' } });
      });
      await page.goto('/app');
      await page.locator(`[data-plant="${plant}"]`).click();
      for (const [mode, selection] of [
        ['daily', 'daily'],
        ['workingHours', 'after'],
        ['nightShift', 'night'],
      ]) {
        await page.locator('#reading-mode').selectOption(mode);
        await page.locator('#report-periods').selectOption(selection);
        for (const id of ['LPG', 'O2', 'N2', 'R32']) {
          const gas = page.locator(`[data-gas="${id}"]`);
          await expect(gas).toHaveAttribute('data-state', 'attention');
          if (id !== 'LPG') {
            const mark = gas.locator('legend svg[data-gas-mark]');
            await expect(mark).toHaveAttribute('data-gas-mark', id);
            await expect(mark.locator('text')).toHaveText({ N2: 'N₂', O2: 'O₂', R32: 'R32' }[id]);
            await expect(mark).toHaveAttribute('aria-hidden', 'true');
          }
          await expect(gas.locator('.gas-status')).toHaveAttribute('data-notice', 'true');
          await expect(gas.locator('.gas-total')).toContainText('+');
          await expect(gas.locator('.gas-feedback .panel-svg')).toHaveAttribute(
            'aria-hidden',
            'true',
          );
          await expect(gas.locator('[data-gas-point="end"]')).toHaveAttribute(
            'aria-invalid',
            'false',
          );
          await expect(gas.locator('.utility-note')).toBeVisible();
          await expect(gas.locator('.calculated-utility')).toBeHidden();
          const bg = await gas.locator('.gas-feedback').evaluate((el) =>
            getComputedStyle(el)
              .backgroundColor.match(/[\d.]+/g)
              .slice(0, 3)
              .map(Number),
          );
          expect(bg[0]).toBeGreaterThanOrEqual(bg[1]);
          expect(bg[1] - bg[2]).toBeGreaterThan(25);
        }
        await expect(page.locator('#copy-report')).toBeEnabled();
        const report = await page.locator('#report-preview').inputValue();
        for (const language of ['zh-CN', 'id', 'en']) {
          await page.locator('#language-select').selectOption(language);
          await expect(page.locator('#report-preview')).toHaveValue(report);
          await expect(page.locator('#copy-report .panel-svg')).toHaveCount(1);
        }
      }
      const gas = page.locator('[data-gas="N2"]');
      await gas.locator('[data-gas-point="end"]').fill('1000');
      await expect(gas).toHaveAttribute('data-state', 'normal');
      await expect(gas.locator('.gas-feedback')).toHaveAttribute('data-tone', 'none');
      await expect(gas.locator('.gas-status')).toBeEmpty();
      await gas.locator('[data-add-refill]').click();
      await gas.locator('[data-gas-point="before0"]').fill('1000');
      await gas.locator('[data-gas-point="after0"]').fill('900');
      await expect(gas).toHaveAttribute('data-state', 'error');
      await expect(gas.locator('.gas-feedback')).toHaveAttribute('data-tone', 'error');
      await expect(gas.locator('.gas-status')).toContainText('decreased during refill');
      await expect(page.locator('#copy-report')).toBeDisabled();
      await page.screenshot({ path: info.outputPath('gas-distinct-error.png') });
      expect(errors).toEqual([]);
    },
  );
