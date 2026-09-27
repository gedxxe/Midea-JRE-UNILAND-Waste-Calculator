import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { exampleDraft } from '../../examples.js';
import { reportSnapshot } from '../../server/report-data.js';
import { graphRecords } from '../../graph-data.js';

const account = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'graph-operator',
  role: 'operator',
  mustChangePassword: false,
};
function records(plant, revision = 1) {
  return graphRecords(
    [1, 2, 3, 5, 6].map((day, index) => {
      const snapshot = reportSnapshot(exampleDraft(plant));
      snapshot.output.worksheetText = snapshot.output.worksheetText.replace(
        /: (\d+(?:\.\d+)?)$/gm,
        (_, v) => ': ' + (Number(v) * (1 + index * 0.1) * revision).toFixed(2),
      );
      return {
        id: 'test-' + index,
        revision,
        start_date: '2026-09-0' + day,
        end_date: '2026-09-0' + (day + 1),
        snapshot,
      };
    }),
    plant,
  );
}
async function setup(page, { pending = false } = {}) {
  let user = { ...account },
    revision = 1,
    release,
    started = false;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.route('**/api/time', (r) =>
    r.fulfill({
      json: {
        unixMs: Date.UTC(2026, 8, 24, 1),
        source: 'time.cloudflare.com',
        protocol: 'NTP',
        sampleAgeMs: 0,
        uncertaintyMs: 5,
        stratum: 2,
      },
    }),
  );
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user } }));
  await page.route('**/api/graphs?**', async (r) => {
    expect(r.request().headers()['x-meter-user']).toBe(user.id);
    const params = Object.fromEntries(new URL(r.request().url()).searchParams);
    if (pending && !started) {
      started = true;
      await new Promise((resolve) => {
        release = resolve;
      });
    }
    await r.fulfill({ json: { ...params, records: records(params.plant, revision) } });
  });
  await page.goto('/');
  await page.locator('#load-example').click();
  return {
    errors,
    bump() {
      revision++;
    },
    release: () => release?.(),
    started: () => started,
    changeUser() {
      user = { ...user, id: 'eb90c39b-1801-4aa4-98f7-bcb591e68c68', username: 'other-operator' };
    },
  };
}

test('graphs use saved revisions, configure bilingual presets, and export white SVG and PNG', async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const state = await setup(page);
  const report = await page.locator('#report-preview').inputValue();
  await page.locator('#open-graphs').click();
  await expect(page.locator('#graph-status')).toContainText('5 saved periods');
  const cards = page.locator('.graph-card'),
    first = cards.first();
  await expect(cards).toHaveCount(9);
  await expect(first.locator('svg')).toContainText('Window A');
  await expect(first.locator('svg')).toContainText('Window B');
  await expect(first.locator('svg')).toContainText('一厂');
  const point = first.locator('circle').first();
  const original = await point.locator('title').textContent();
  state.bump();
  await page.locator('#graph-refresh').click();
  await expect(point.locator('title')).not.toHaveText(original);
  await expect(point.locator('title')).toContainText('revision 2');
  // Layout edits only affect chart settings, not stored values or factory output.
  await first.locator('.graph-settings summary').click();
  await first.locator('[data-graph-series="w3"]').uncheck();
  await expect(first.locator('svg circle[data-series="w3"]')).toHaveCount(0);
  await first.locator('[data-graph-title="titleEn"]').fill('Custom <title> & consumption');
  await first.locator('[data-graph-title="titleZh"]').fill('自定义用电量');
  await expect(first.locator('svg')).toContainText('Custom <title> & consumption');
  await first.locator('.graph-settings summary').click();
  for (const format of ['svg', 'png']) {
    const downloaded = page.waitForEvent('download');
    await first.locator('[data-graph-export="' + format + '"]').click();
    const download = await downloaded;
    const file = info.outputPath('chart.' + format);
    await download.saveAs(file);
    const bytes = await readFile(file);
    if (format === 'svg') {
      expect(bytes.toString()).toContain('fill="#ffffff"');
      expect(bytes.toString()).toContain('stroke-width="1.4"');
      expect(bytes.toString()).toContain('自定义用电量');
      expect(bytes.toString()).toContain('&lt;title&gt;');
    } else {
      expect(bytes.readUInt32BE(16)).toBe(4000);
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      const position = bytes.indexOf(Buffer.from('pHYs'));
      expect(position).toBeGreaterThan(0);
      expect(bytes.readUInt32BE(position + 4)).toBe(15748);
      expect(bytes[position + 12]).toBe(1);
    }
  }
  await first.locator('[data-graph-copy]').click();
  await expect(page.locator('#toast')).toContainText('4000 px');
  const clipboard = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const blob = await items[0].getType('image/png');
    const img = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { width: img.width, pixel: Array.from(ctx.getImageData(0, 0, 1, 1).data) };
  });
  expect(clipboard).toEqual({ width: 4000, pixel: [255, 255, 255, 255] });
  await page.locator('#graph-end').fill('2026-09-09');
  await expect(first.locator('svg')).toContainText('2026-09-01 to 2026-09-09');
  await expect(first.locator('svg text').filter({ hasText: /^09\/09$/ })).toHaveCount(1);
  await page.locator('#graph-end').fill('2026-09-30');
  await expect(first.locator('svg')).toContainText('2026-09-01 to 2026-09-30');
  await first.screenshot({ path: info.outputPath('graph-card.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-close-dialog="graphs-dialog"]').click();
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    await page.locator('#open-graphs').click();
    await expect(first.locator('svg')).toContainText('自定义用电量');
    await expect(first.locator('svg')).not.toContainText('Window B');
    await page.locator('[data-close-dialog="graphs-dialog"]').click();
    await expect(page.locator('#report-preview')).toHaveValue(report);
  }
  await page.reload();
  await page.locator('#open-graphs').click();
  await expect(first.locator('svg')).toContainText('Custom <title> & consumption');
  await page.locator('#graph-plant').selectOption('UNILAND');
  await expect(cards).toHaveCount(7);
  await expect(first.locator('svg')).toContainText('二厂');
  await page.locator('#graph-add').click();
  await expect(cards).toHaveCount(8);
  const last = cards.last();
  await expect(last.locator('[data-graph-export="svg"]')).toBeDisabled();
  await last.locator('[data-graph-series="w0"]').check();
  await expect(last.locator('[data-graph-export="svg"]')).toBeEnabled();
  await last.locator('[data-graph-unit]').selectOption('Nm3');
  await expect(last.locator('[data-graph-export="svg"]')).toBeDisabled();
  await expect(last.locator('[data-graph-series="w0"]')).toHaveCount(0);
  await last.getByRole('button', { name: 'Duplicate graph', exact: true }).click();
  await expect(cards).toHaveCount(9);
  await cards.last().getByRole('button', { name: 'Remove graph', exact: true }).click();
  await expect(cards).toHaveCount(8);
  expect(state.errors).toEqual([]);
});

test('account changes invalidate pending graphs and isolate saved layouts', async ({ page }) => {
  const state = await setup(page, { pending: true });
  await page.locator('#open-graphs').click();
  await expect.poll(state.started).toBe(true);
  state.changeUser();
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'midea_account_changed', newValue: 'changed' }),
    ),
  );
  await expect(page.locator('#account-name')).toHaveText('other-operator');
  await expect(page.locator('#graphs-dialog')).not.toBeVisible();
  state.release();
  await expect(page.locator('#graph-cards')).toBeEmpty();
  await page.locator('#load-example').click();
  await page.locator('#open-graphs').click();
  await expect(page.locator('.graph-card')).toHaveCount(9);
  await expect(page.locator('#graph-status')).toContainText('5 saved periods');
  expect(state.errors).toEqual([]);
});

test('graphs show gaps and period warnings and clear old data after an empty refresh', async ({
  page,
}) => {
  const state = await setup(page);
  let failed = false;
  await page.route('**/api/graphs?**', (r) => {
    if (failed)
      return r.fulfill({
        status: 200,
        json: { plant: 'JRE', start: '2026-09-01', end: '2026-09-30', records: [] },
      });
    const rows = records('JRE');
    rows[0].days = 2;
    rows[0].endDate = '2026-09-03';
    rows[0].overlap = true;
    rows[1].overlap = true;
    rows[2].values.w1 = null;
    rows[4].values.w1 = 0;
    return r.fulfill({
      json: { plant: 'JRE', start: '2026-09-01', end: '2026-09-30', records: rows },
    });
  });
  await page.locator('#open-graphs').click();
  await expect(page.locator('#graph-warnings')).toContainText('more than 24 hours');
  await expect(page.locator('#graph-warnings')).toContainText('2 reports overlap');
  const first = page.locator('.graph-card').first();
  await expect(first.locator('circle[data-series="w1"]')).toHaveCount(2);
  await first.locator('.graph-data summary').click();
  await expect(first.locator('table')).toContainText('48 h');
  await expect(first.locator('table')).toContainText('Overlapping period: not plotted');
  failed = true;
  await page.locator('#graph-refresh').click();
  await expect(page.locator('#graph-status')).toContainText('No saved reports');
  await expect(first.locator('circle')).toHaveCount(0);
  await expect(first.locator('[data-graph-export="svg"]')).toBeDisabled();
  expect(state.errors).toEqual([]);
});

test('clipboard denial keeps PNG download available', async ({ page }) => {
  const state = await setup(page);
  await page.locator('#open-graphs').click();
  const first = page.locator('.graph-card').first();
  await expect(first.locator('[data-graph-copy]')).toBeEnabled();
  await page.evaluate(() =>
    Object.defineProperty(navigator.clipboard, 'write', {
      value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    }),
  );
  await first.locator('[data-graph-copy]').click();
  await expect(page.locator('#toast')).toContainText('Allow clipboard access');
  await expect(first.locator('[data-graph-export="png"]')).toBeEnabled();
  expect(state.errors).toEqual([]);
});

test('imported consumption stays labelled and a newer release does not overwrite the open draft', async ({
  page,
}) => {
  const state = await setup(page);
  await page.route('**/api/graphs?**', (r) =>
    r.fulfill({
      json: {
        plant: 'JRE',
        start: '2026-09-01',
        end: '2026-09-30',
        records: [
          {
            id: 'imported',
            source: 'excel',
            sourceLabel: 'synthetic.xlsx · JRE!C4:T4',
            revision: null,
            startDate: '2026-09-01',
            endDate: '2026-09-03',
            days: 2,
            values: { w1: 200, w2: 0 },
            overlap: false,
            superseded: false,
          },
        ],
      },
    }),
  );
  await page.locator('#open-graphs').click();
  const first = page.locator('.graph-card').first();
  await expect(first.locator('circle')).toHaveCount(2);
  await first.locator('.graph-data summary').click();
  await expect(first.locator('table')).toContainText('Excel history');
  await expect(first.locator('table')).toContainText('synthetic.xlsx');
  await expect(first.locator('table')).toContainText('48 h');
  await page.locator('[data-close-dialog="graphs-dialog"]').click();
  const draft = await page.locator('#report-preview').inputValue();
  const version = await page.locator('#app-version').textContent();
  await page.route('**/build-info.json', (r) =>
    r.fulfill({
      json: {
        schemaVersion: 1,
        version: '0.99.0-alpha',
        sourceHash: 'changed',
        commit: 'a'.repeat(40),
      },
    }),
  );
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('#update-notice')).toBeVisible();
  await expect(page.locator('#app-version')).toHaveText(version);
  await expect(page.locator('#report-preview')).toHaveValue(draft);
  expect(state.errors).toEqual([]);
});
