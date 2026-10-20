import { test, expect } from './fixtures.js';
import { exampleDraft } from '../../examples.js';
import { reportSnapshot } from '../../server/report-data.js';

for (const plant of ['JRE', 'UNILAND'])
  test(
    plant + ' stock increase stays visible, copyable and saveable across languages and reload',
    async ({ page, context }, info) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      const point = (reading) => ({ reading, temperature: '' });
      const draft = exampleDraft(plant);
      draft.gas.entries[2] = {
        enabled: true,
        start: point('1000'),
        end: point('1050'),
        refills: [],
      };
      const expected = reportSnapshot(draft).output.reportText;
      const workspace = {
        version: 4,
        drafts: { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND'), [plant]: draft },
      };
      await page.route('**/api/auth', (r) =>
        r.fulfill({
          json: {
            available: true,
            user: {
              id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
              username: 'gas-test',
              role: 'operator',
              mustChangePassword: false,
            },
          },
        }),
      );
      await page.route('**/api/time', (r) =>
        r.fulfill({
          json: {
            unixMs: Date.UTC(2026, 8, 16, 1),
            source: 'time.cloudflare.com',
            protocol: 'NTP',
            stratum: 2,
            sampleAgeMs: 0,
            uncertaintyMs: 5,
          },
        }),
      );
      let version = 1;
      await page.route('**/api/drafts', (r) => {
        if (r.request().method() === 'POST') {
          Object.assign(workspace, r.request().postDataJSON().workspace);
          version++;
        }
        return r.fulfill({ json: { workspace, version, updated_at: '2026-09-16T01:00:00Z' } });
      });
      let saved;
      await page.route('**/api/reports', (r) => {
        if (r.request().method() !== 'POST') return r.fulfill({ json: { reports: [] } });
        const input = r.request().postDataJSON().draft;
        saved = reportSnapshot(input);
        return r.fulfill({
          status: 201,
          json: { id: '57e8660b-c136-4868-a492-05de0ed07e7f', revision: 1, snapshot: saved },
        });
      });
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.goto('/');
      await page.locator('[data-plant="' + plant + '"]').click();
      const gas = page.locator('[data-gas="N2"]');
      const value = plant === 'JRE' ? '+172.91' : '+172.23';
      await expect(gas.locator('.gas-total')).toHaveText(
        'Measured stock increase: ' + value + ' kg',
      );
      await expect(gas.locator('[data-utility]')).toHaveValue(value);
      await expect(gas.locator('.gas-status')).toHaveAttribute('data-notice', 'true');
      await expect(gas.locator('[data-gas-point="end"]')).toHaveAttribute('aria-invalid', 'false');
      await expect(page.locator('#report-preview')).toHaveValue(expected);
      await expect(page.locator('#copy-report')).toBeEnabled();
      await page.locator('#copy-report').click();
      await expect
        .poll(() =>
          page.evaluate(async () =>
            (await navigator.clipboard.readText()).replaceAll('\r\n', '\n'),
          ),
        )
        .toBe(expected);
      for (const [lang, label] of [
        ['zh-CN', '测得库存增加'],
        ['id', 'Kenaikan stok terukur'],
        ['en', 'Measured stock increase'],
      ]) {
        await page.locator('#language-select').selectOption(lang);
        await expect(gas.locator('.gas-total')).toHaveText(label + ': ' + value + ' kg');
        await expect(page.locator('#report-preview')).toHaveValue(expected);
      }
      await gas.scrollIntoViewIfNeeded();
      await gas.screenshot({ path: info.outputPath('gas-stock-increase.png') });
      await page.locator('#save-report').click();
      await expect.poll(() => Boolean(saved)).toBe(true);
      expect(saved.output.reportText).toBe(expected);
      expect(saved.output.gas[0].kg).toBeLessThan(0);
      await page.reload();
      await page.locator('[data-plant="' + plant + '"]').click();
      await expect(gas.locator('.gas-total')).toHaveText(
        'Measured stock increase: ' + value + ' kg',
      );
      await gas.locator('[data-gas-point="end"]').fill('950');
      await expect(gas.locator('.gas-total')).toContainText('Consumption: ');
      await expect(gas.locator('.gas-status')).toBeEmpty();
      expect(await page.locator('#report-preview').inputValue()).not.toContain(
        '(measured stock increase)',
      );
      await gas.locator('[data-add-refill]').click();
      await gas.locator('[data-gas-point="before0"]').fill('990');
      await gas.locator('[data-gas-point="after0"]').fill('980');
      await expect(gas.locator('.gas-total')).toHaveText('Consumption: - kg');
      await expect(gas.locator('.gas-status')).toContainText('decreased during refill');
      await expect(page.locator('#copy-report')).toBeDisabled();
      expect(errors).toEqual([]);
    },
  );
