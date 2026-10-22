import { test, expect } from './fixtures.js';
import { readFile } from 'node:fs/promises';
import { exampleDraft } from '../../examples.js';
import { reportSnapshot } from '../../server/report-data.js';
import { graphRecords } from '../../graph-data.js';
import { defaultGraphs } from '../../graph-schema.js';

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
async function setup(page, { pending = false, role = 'operator' } = {}) {
  let user = { ...account, role },
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

test('graphs use saved revisions, show one language and export white SVG and PNG', async ({
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
  await expect(first.locator('svg')).toContainText('JRE · Product lines');
  await expect(first.locator('svg')).not.toContainText('一厂');
  const point = first.locator('circle').first();
  const original = await point.locator('title').textContent();
  state.bump();
  await page.locator('#graph-refresh').click();
  await expect(point.locator('title')).not.toHaveText(original);
  await expect(point.locator('title')).toContainText('revision 2');
  // Layout edits only affect chart settings, not stored values or factory output.
  await first.locator('.graph-settings > summary').click();
  await first.locator('[data-graph-series="w3"]').uncheck();
  await expect(first.locator('svg circle[data-series="w3"]')).toHaveCount(0);
  await first.locator('[data-graph-title="titleEn"]').fill('Custom <title> & consumption');
  await expect(first.locator('svg')).toContainText('Custom <title> & consumption');
  await first.locator('.graph-settings > summary').click();
  for (const format of ['svg', 'png']) {
    await first.locator('.graph-download summary').click();
    const downloaded = page.waitForEvent('download');
    await first.locator('[data-graph-export="' + format + '"]').click();
    await expect(first.locator('.graph-download')).not.toHaveAttribute('open', '');
    const download = await downloaded;
    const file = info.outputPath('chart.' + format);
    await download.saveAs(file);
    const bytes = await readFile(file);
    if (format === 'svg') {
      expect(bytes.toString()).toContain('fill="#ffffff"');
      expect(bytes.toString()).toContain('stroke-width="1.4"');
      expect(bytes.toString()).not.toContain('产品线');
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
  await expect(first.locator('[data-period-label]')).toHaveText([
    '01/09',
    '02/09',
    '03/09',
    '05/09',
    '06/09',
  ]);
  await page.locator('#graph-end').fill('2026-09-30');
  await expect(first.locator('svg')).toContainText('2026-09-01 to 2026-09-30');
  await first.screenshot({ path: info.outputPath('graph-card.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-close-dialog="graphs-dialog"]').click();
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    await page.locator('#open-graphs').click();
    const field = language === 'zh-CN' ? 'titleZh' : language === 'id' ? 'titleId' : 'titleEn';
    const title =
      language === 'zh-CN'
        ? '自定义用电量'
        : language === 'id'
          ? 'JRE · Grafik Pilihan'
          : 'Custom <title> & consumption';
    await first.locator('.graph-settings > summary').click();
    await expect(first.locator('[data-graph-title]')).toHaveCount(1);
    await first.locator('[data-graph-title="' + field + '"]').fill(title);
    await first.locator('.graph-settings > summary').click();
    await expect(first.locator('svg')).toContainText(title);
    if (language !== 'en') await expect(first.locator('svg')).not.toContainText('Custom <title>');
    await expect(first.locator('svg')).not.toContainText('Window B');
    await page.locator('[data-close-dialog="graphs-dialog"]').click();
    await expect(page.locator('#report-preview')).toHaveValue(report);
  }
  await page.reload();
  await page.locator('#open-graphs').click();
  await expect(first.locator('svg')).toContainText('Custom <title> & consumption');
  await page.locator('#graph-plant').selectOption('UNILAND');
  await expect(cards).toHaveCount(7);
  await expect(first.locator('svg')).toContainText('UNILAND · Outdoor area');
  await page.locator('#graph-layout-tools summary').click();
  await page.locator('#graph-add').click();
  await expect(cards).toHaveCount(8);
  const last = cards.last();
  await expect(last.locator('[data-graph-export="svg"]')).toBeDisabled();
  await last.locator('[data-graph-series="w0"]').check();
  await expect(last.locator('[data-graph-export="svg"]')).toBeEnabled();
  await last.locator('.graph-advanced summary').click();
  await last.locator('[data-graph-unit]').selectOption('Nm3');
  await expect(last.locator('[data-graph-export="svg"]')).toBeDisabled();
  await expect(last.locator('[data-graph-series="w0"]')).toHaveCount(0);
  await last.getByRole('button', { name: 'Duplicate graph', exact: true }).click();
  await expect(cards).toHaveCount(9);
  await cards.last().locator('.graph-settings > summary').click();
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
  await expect(page.locator('#graph-warnings')).toContainText('combined periods');
  await expect(page.locator('#graph-warnings')).toContainText('2 reports overlap');
  const first = page.locator('.graph-card').first();
  await expect(first.locator('circle[data-series="w1"]')).toHaveCount(2);
  await first.locator('.graph-data summary').click();
  await expect(first.locator('table')).toContainText('2 days');
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
  await expect(first.locator('table')).toContainText('2 days');
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

test('all period labels survive monthly exports and manual Y limits change only the view', async ({
  page,
}, info) => {
  const state = await setup(page);
  const { shiftDate } = await import('../../numbers.js');
  const rows = Array.from({ length: 30 }, (_, i) => i + 1)
    .filter((d) => d !== 19 && d !== 20)
    .map((d) => ({
      id: 'period-' + d,
      source: 'excel',
      revision: null,
      sourceLabel: 'synthetic.xlsx',
      startDate: shiftDate('2026-09-01', d - 1),
      endDate: d === 18 ? '2026-09-21' : shiftDate('2026-09-01', d),
      days: d === 18 ? 3 : 1,
      overlap: false,
      values: { w1: 100 + d, w2: 0 },
    }));
  await page.route('**/api/graphs?**', (r) =>
    r.fulfill({ json: { plant: 'JRE', start: '2026-09-01', end: '2026-09-30', records: rows } }),
  );
  await page.locator('#open-graphs').click();
  const first = page.locator('.graph-card').first();
  const labels = first.locator('[data-period-label]');
  await expect(labels).toHaveCount(28);
  await expect(labels.filter({ hasText: /^18–20\/09$/ })).toHaveCount(1);
  await expect(labels.filter({ hasText: /^19\/09$/ })).toHaveCount(0);
  await expect(first.locator('circle[data-series="w1"]')).toHaveCount(28);
  const original = await first
    .locator('circle[data-series="w1"]')
    .first()
    .locator('title')
    .textContent();
  const downloaded = page.waitForEvent('download');
  await first.locator('.graph-download summary').click();
  await first.locator('[data-graph-export="svg"]').click();
  const file = info.outputPath('all-periods.svg');
  await (await downloaded).saveAs(file);
  const svg = await readFile(file, 'utf8');
  expect(svg.match(/data-period-label/g)).toHaveLength(28);
  expect(svg).toContain('18–20/09');
  const dimensions = await first.locator('svg').evaluate((el) => ({
    width: Number(el.getAttribute('width')),
    height: Number(el.getAttribute('height')),
  }));
  const pngDownload = page.waitForEvent('download');
  await first.locator('.graph-download summary').click();
  await first.locator('[data-graph-export="png"]').click();
  const pngFile = info.outputPath('all-periods.png');
  await (await pngDownload).saveAs(pngFile);
  const bytes = await readFile(pngFile);
  expect(bytes.readUInt32BE(16)).toBe(Math.max(4000, dimensions.width * 4));
  expect(bytes.readUInt32BE(20)).toBe(
    Math.round((dimensions.height * bytes.readUInt32BE(16)) / dimensions.width),
  );
  await first.locator('.graph-settings > summary').click();
  await first.locator('.graph-advanced summary').click();
  await first.locator('[data-graph-axis]').selectOption('manual');
  await expect(first.locator('[data-graph-export="svg"]')).toBeDisabled();
  await first.locator('[data-graph-bound="min"]').fill('100');
  await first.locator('[data-graph-bound="max"]').fill('150');
  await expect(first.locator('[data-axis-note]')).toContainText('Values outside view');
  await expect(first.locator('circle[data-series="w1"]').first().locator('title')).toHaveText(
    original,
  );
  await first.locator('[data-graph-bound="max"]').fill('50');
  await expect(first.locator('[data-graph-export="svg"]')).toBeDisabled();
  await expect(first.locator('svg')).toHaveCount(0);
  await first.locator('[data-graph-bound="max"]').fill('150');
  await first.locator('.graph-settings > summary').click();
  await first.screenshot({ path: info.outputPath('all-periods-card.png') });
  await expect(page.locator('#graphs-dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await page.locator('#open-graphs').click();
  await expect(first.locator('[data-axis-note]')).toContainText('100 to 150');
  await first.locator('.graph-settings > summary').click();
  await first.locator('.graph-advanced summary').click();
  await first.locator('[data-graph-axis]').selectOption('auto');
  await expect(first.locator('[data-axis-note]')).toHaveCount(0);
  await expect(first.locator('circle[data-series="w1"]').first().locator('title')).toHaveText(
    original,
  );
  expect(state.errors).toEqual([]);
});

test('weekend picker maps endpoints to inclusive consumption dates without relabelling old readings', async ({
  page,
}) => {
  const state = await setup(page);
  await page.locator('.combined-period summary').click();
  await page.locator('#combined-start').fill('2026-09-18');
  await page.locator('#combined-last').fill('2026-09-20');
  await expect(page.locator('#combined-preview')).toContainText('18–20/09');
  await expect(page.locator('#combined-preview')).toContainText('2026-09-21 08:00');
  await page.locator('#combined-apply').click();
  await expect(page.locator('#start-date')).toHaveValue('2026-09-18');
  await expect(page.locator('#end-date')).toHaveValue('2026-09-21');
  await expect(page.locator('#main-total')).toHaveText('-');
  await expect(page.locator('.meter-input').first()).toHaveValue('');
  await expect(page.locator('#end-reading-date')).toHaveText('2026-09-21');
  const report = await page.locator('#report-preview').inputValue();
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    await expect(page.locator('#report-preview')).toHaveValue(report);
    await expect(page.locator('#combined-preview')).toContainText('18–20/09');
  }
  await page.locator('#combined-last').fill('2026-09-17');
  await expect(page.locator('#combined-apply')).toBeDisabled();
  await expect(page.locator('#end-date')).toHaveValue('2026-09-21');
  expect(state.errors).toEqual([]);
});

test('both factories localize chart titles, legends and data without mixing languages or fetching on department filters', async ({
  page,
}, info) => {
  const state = await setup(page);
  const report = await page.locator('#report-preview').inputValue();
  let requests = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/graphs?')) {
      requests++;
      expect(r.method()).toBe('GET');
    }
  });
  for (const language of ['en', 'zh-CN', 'id']) {
    await page.locator('#language-select').selectOption(language);
    await page.locator('#open-graphs').click();
    const bottoms = await page
      .locator('#graph-plant, #graph-kind, #graph-start, #graph-end, #graph-refresh')
      .evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().bottom));
    const rows =
      page.viewportSize().width > 700 ? [bottoms] : [bottoms.slice(0, 2), bottoms.slice(2, 4)];
    for (const row of rows) expect(Math.max(...row) - Math.min(...row)).toBeLessThan(2);
    for (const plant of ['JRE', 'UNILAND']) {
      await page.locator('#graph-plant').selectOption(plant);
      const first = page.locator('.graph-card').first();
      await expect(first.locator('svg circle').first()).toBeAttached();
      await expect(first.locator('svg')).toHaveAttribute('lang', language);
      await expect(first.locator('svg > title')).toContainText(plant + ' · ');
      const text = await first.locator('svg').textContent();
      if (language === 'zh-CN') {
        expect(text).toContain(plant === 'JRE' ? '窗机' : '外机');
        expect(text).not.toContain('Outdoor');
      } else {
        expect(text).not.toMatch(/[\u3400-\u9fff]/);
        expect(text).toContain(language === 'id' ? 'Periode' : 'Period');
      }
      await expect(page.locator('#graph-plant option[value="UNILAND"]')).toHaveText('UNILAND');
      await expect(page.locator('#graph-layout-tools')).not.toHaveAttribute('open', '');
      await expect(first.locator('.graph-settings')).not.toHaveAttribute('open', '');
      const before = requests;
      await page.locator('#graph-department').selectOption('quality');
      await expect(page.locator('.graph-card')).toHaveCount(plant === 'JRE' ? 3 : 2);
      expect(requests).toBe(before);
      await page
        .locator('.graph-card')
        .first()
        .screenshot({ path: info.outputPath(`graph-${plant}-${language}.png`) });
      await page.locator('#graph-department').selectOption('all');
      await expect(page.locator('.graph-card')).toHaveCount(plant === 'JRE' ? 9 : 7);
    }
    await page.locator('[data-close-dialog="graphs-dialog"]').click();
    await expect(page.locator('#report-preview')).toHaveValue(report);
  }
  expect(state.errors).toEqual([]);
});

test('legacy browser layouts retain custom titles, axes and variables while new edits use a separate layout key', async ({
  page,
}) => {
  const legacy = {
    version: 1,
    layouts: { JRE: defaultGraphs('JRE'), UNILAND: defaultGraphs('UNILAND') },
  };
  legacy.layouts.JRE[0] = {
    ...legacy.layouts.JRE[0],
    titleEn: 'Legacy custom chart',
    titleZh: '旧自定义图表',
    series: ['w1', 'w2'],
    yAxis: { mode: 'manual', min: 0, max: 250 },
  };
  const key = 'midea_graph_layout_v1_' + account.id,
    raw = JSON.stringify(legacy);
  await page.addInitScript(
    ({ key, raw }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, raw);
    },
    { key, raw },
  );
  const state = await setup(page);
  await page.locator('#open-graphs').click();
  const first = page.locator('.graph-card').first();
  await expect(first.locator('svg > title')).toHaveText('Legacy custom chart');
  await expect(first.locator('[data-axis-note]')).toContainText('0 to 250');
  await expect(first.locator('circle[data-series="w3"]')).toHaveCount(0);
  await first.locator('.graph-settings > summary').click();
  await first.locator('[data-graph-title="titleEn"]').fill('Updated custom chart');
  const stored = await page.evaluate(
    (key) => ({
      old: localStorage.getItem(key),
      next: JSON.parse(localStorage.getItem(key.replace('_v1_', '_v2_'))),
    }),
    key,
  );
  expect(stored.old).toBe(raw);
  expect(stored.next.version).toBe(2);
  expect(stored.next.layouts.JRE[0].titleZh).toBe('旧自定义图表');
  expect(stored.next.layouts.JRE[0].titleId).toBeTruthy();
  expect(stored.next.layouts.JRE[0].series).toEqual(['w1', 'w2']);
  expect(stored.next.layouts.JRE[0].yAxis).toEqual({ mode: 'manual', min: 0, max: 250 });
  await page.reload();
  await page.locator('#open-graphs').click();
  await expect(first.locator('svg > title')).toHaveText('Updated custom chart');
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(raw);
  expect(state.errors).toEqual([]);
});

test('chart entrance is brief, respects reduced motion and never animates exported SVG or replays on a filter', async ({
  page,
}) => {
  const state = await setup(page, { role: 'admin' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#open-graphs').click();
  const first = page.locator('.graph-card').first();
  await expect(first.locator('svg circle').first()).toBeAttached();
  expect(
    await first.evaluate((el) => ({
      name: getComputedStyle(el).animationName,
      duration: getComputedStyle(el).animationDuration,
    })),
  ).toEqual({ name: 'graph-enter', duration: '0.25s' });
  const svg = await first.locator('svg').evaluate((el) => el.outerHTML);
  expect(svg).not.toMatch(/<animate|graph-enter/);
  await page.locator('#graph-department').selectOption('quality');
  expect(await first.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.locator('[data-close-dialog="graphs-dialog"]').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#open-graphs').click();
  await expect(first.locator('svg circle').first()).toBeAttached();
  expect(await first.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await page.locator('[data-close-dialog="graphs-dialog"]').click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => (document.documentElement.dataset.graphMotion = 'off'));
  await page.locator('#open-graphs').click();
  await expect(first.locator('svg circle').first()).toBeAttached();
  expect(await first.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  expect(state.errors).toEqual([]);
});

test('an in-flight graph copy cannot deliver an outdated title after configuration changes', async ({
  page,
}) => {
  const state = await setup(page);
  await page.locator('#open-graphs').click();
  const first = page.locator('.graph-card').first();
  await expect(first.locator('[data-graph-copy]')).toBeEnabled();
  await first.locator('.graph-settings > summary').click();
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    window.graphWrites = [];
    window.holdGraph = true;
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      if (window.holdGraph) window.finishGraph = () => original.apply(this, args);
      else original.apply(this, args);
    };
    Object.defineProperty(navigator.clipboard, 'write', {
      configurable: true,
      value: async (items) => {
        try {
          await items[0].getType('image/png');
          window.graphWrites.push('copied');
        } catch (error) {
          window.graphWrites.push('cancelled');
          throw error;
        }
      },
    });
  });
  await first.locator('[data-graph-copy]').click();
  await expect.poll(() => page.evaluate(() => typeof window.finishGraph)).toBe('function');
  await first.locator('[data-graph-title="titleEn"]').fill('Current chart title');
  await page.evaluate(() => {
    window.holdGraph = false;
    window.finishGraph();
  });
  await expect.poll(() => page.evaluate(() => window.graphWrites)).toEqual(['cancelled']);
  await first.locator('[data-graph-copy]').click();
  await expect.poll(() => page.evaluate(() => window.graphWrites)).toEqual(['cancelled', 'copied']);
  expect(state.errors).toEqual([]);
});

test('monthly matrix shows month/year, full date columns, combined totals, missing and zero in all languages', async ({
  page,
}, info) => {
  const state = await setup(page);
  const data = records('JRE');
  data[1].values.w0 = 0;
  data.push({
    id: 'combined',
    startDate: '2026-09-18',
    endDate: '2026-09-21',
    days: 3,
    source: 'report',
    revision: 1,
    values: { w0: 321.5 },
  });
  data.push({
    id: 'cross-month',
    startDate: '2026-09-30',
    endDate: '2026-10-03',
    days: 3,
    source: 'report',
    revision: 1,
    values: { w0: 90 },
  });
  let requests = 0;
  await page.route('**/api/graphs?**', (r) => {
    requests++;
    const params = Object.fromEntries(new URL(r.request().url()).searchParams);
    return r.fulfill({ json: { ...params, records: data } });
  });
  const report = await page.locator('#report-preview').inputValue();
  await page.locator('#open-graphs').click();
  await expect(page.locator('.graph-card').first().locator('svg')).toBeAttached();
  const before = requests;
  await page.locator('#graph-view-table').click();
  expect(requests).toBe(before);
  const matrix = page.locator('#graph-matrix');
  await expect(matrix.locator('h3')).toHaveText('JRE · September 2026');
  await expect(matrix.locator('thead th[data-date]')).toHaveCount(30);
  await expect(matrix.locator('thead th[data-date="2026-09-01"]')).toContainText('01 Sep');
  const row = matrix.locator('tr[data-metric="w0"]');
  await expect(row.locator('td[data-date="2026-09-02"] .matrix-value')).toHaveText('0');
  await expect(row.locator('td[data-date="2026-09-04"]')).toHaveText('-');
  await expect(row.locator('td[data-date="2026-09-18"]')).toHaveAttribute('colspan', '3');
  await expect(row.locator('td[data-date="2026-09-18"] .matrix-value')).toHaveText('321.5');
  await expect(row.locator('td[data-date="2026-09-30"]')).toContainText('30/09–02/10');
  await page.locator('#graph-filters > summary').click();
  await page.locator('#graph-search').fill('Indoor');
  await expect(matrix.locator('tbody tr[data-metric]')).toHaveCount(1);
  expect(requests).toBe(before);
  await page.locator('#graph-search').fill('');
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    await expect(matrix.locator('h3')).toContainText(
      language === 'zh-CN' ? '2026年9月' : 'September 2026',
    );
    const text = await matrix.textContent();
    if (language !== 'zh-CN') expect(text).not.toMatch(/[\u3400-\u9fff]/);
  }
  const scroller = matrix.locator('.graph-matrix-scroll'),
    name = row.locator('th');
  const original = (await name.boundingBox()).x;
  await scroller.evaluate((el) => {
    el.scrollLeft = 650;
    el.scrollTop = 100;
  });
  expect(Math.abs((await name.boundingBox()).x - original)).toBeLessThan(2);
  await scroller.evaluate((el) => {
    el.scrollLeft = 0;
    el.scrollTop = 0;
  });
  await matrix.screenshot({ path: info.outputPath('monthly-matrix.png') });
  await page.locator('#graph-month').fill('2024-02');
  await expect(matrix.locator('thead th[data-date]')).toHaveCount(29);
  await page.locator('#graph-month').fill('2026-02');
  await expect(matrix.locator('thead th[data-date]')).toHaveCount(28);
  await page.locator('#graph-month-prev').click();
  await expect(matrix.locator('h3')).toHaveText('JRE · January 2026');
  await page.locator('#graph-month-next').click();
  await expect(matrix.locator('h3')).toHaveText('JRE · February 2026');
  await page.locator('#graph-plant').selectOption('UNILAND');
  await expect(matrix.locator('h3')).toHaveText('UNILAND · February 2026');
  await page.locator('[data-close-dialog="graphs-dialog"]').click();
  await expect(matrix).toBeEmpty();
  await expect(page.locator('#report-preview')).toHaveValue(report);
  expect(state.errors).toEqual([]);
});

test('smooth graphs share exact tooltips, keep gaps, toggle legends and export without hover controls', async ({
  page,
}, info) => {
  const state = await setup(page);
  await page.locator('#open-graphs').click();
  const first = page.locator('.graph-card').first(),
    frame = first.locator('.graph-frame');
  await expect(first.locator('svg [data-plot] path').first()).toHaveAttribute('d', /C/);
  const original = await first
    .locator('circle[data-series="w1"]')
    .first()
    .locator('title')
    .textContent();
  const color = await first.locator('circle[data-series="w2"]').first().getAttribute('fill');
  await frame.focus();
  await page.keyboard.press('Home');
  await expect(first.locator('.graph-hover')).toBeVisible();
  await expect(first.locator('.graph-hover-row')).toHaveCount(4);
  await expect(first.locator('.graph-crosshair')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(first.locator('.graph-hover > strong')).toContainText('2026-09-02');
  await page.keyboard.press('Escape');
  await expect(first.locator('.graph-hover')).toBeHidden();
  await first.locator('[data-graph-toggle="w1"]').click();
  await expect(first.locator('circle[data-series="w1"]')).toHaveCount(0);
  await expect(first.locator('[data-graph-toggle="w1"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(first.locator('circle[data-series="w2"]').first()).toHaveAttribute('fill', color);
  await page.keyboard.press('Enter');
  await expect(first.locator('circle[data-series="w1"]').first().locator('title')).toHaveText(
    original,
  );
  await frame.focus();
  await page.keyboard.press('End');
  const download = page.waitForEvent('download');
  await first.locator('.graph-download summary').click();
  await first.locator('[data-graph-export="svg"]').click();
  const file = info.outputPath('interactive.svg');
  await (await download).saveAs(file);
  const svg = await readFile(file, 'utf8');
  expect(svg).not.toContain('graph-hover');
  expect(svg).not.toContain('graph-crosshair');
  expect(svg).not.toContain('tabindex');
  expect(svg).not.toContain('graph-point-active');
  expect(svg).toContain('stroke-width="1.4"');
  for (const key of ['w1', 'w2', 'w3', 'w4'])
    await first.locator('[data-graph-toggle="' + key + '"]').click();
  await expect(first.locator('[data-graph-copy]')).toBeDisabled();
  await expect(first.locator('.graph-prompt')).toContainText('All lines hidden');
  await page.locator('[data-close-dialog="graphs-dialog"]').click();
  await page.locator('#open-graphs').click();
  await expect(first.locator('circle[data-series="w1"]').first()).toBeAttached();
  expect(state.errors).toEqual([]);
});

test('monthly view drops delayed data on account changes and keeps period filters read-only', async ({
  page,
}) => {
  const state = await setup(page, { pending: true });
  await page.locator('#open-graphs').click();
  await page.locator('#graph-view-table').click();
  await expect.poll(state.started).toBe(true);
  state.changeUser();
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'midea_account_changed', newValue: 'changed' }),
    ),
  );
  await expect(page.locator('#account-name')).toHaveText('other-operator');
  state.release();
  await expect(page.locator('#graphs-dialog')).not.toBeVisible();
  await expect(page.locator('#graph-matrix')).toBeEmpty();
  await page.locator('#load-example').click();
  await page.locator('#open-graphs').click();
  await expect(page.locator('#graph-view-charts')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#graph-view-table').click();
  await page.locator('#graph-filters > summary').click();
  for (const plant of ['JRE', 'UNILAND'])
    for (const kind of ['daily', 'workingHours', 'nightShift']) {
      await page.locator('#graph-plant').selectOption(plant);
      await page.locator('#graph-kind').selectOption(kind);
      await expect(page.locator('#graph-matrix h3')).toContainText(plant);
      await expect(page.locator('#graph-matrix thead th[data-date]')).toHaveCount(30);
    }
  expect(state.errors).toEqual([]);
});

test('monthly table remains readable and chains wheel scrolling to its dialog on short screens', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Mouse wheel regression is checked on desktop.');
  await page.setViewportSize({ width: 1280, height: 600 });
  await setup(page);
  await page.click('#open-graphs');
  await page.click('#graph-view-table');
  await expect(page.locator('#graph-filters')).not.toHaveAttribute('open');
  await page.locator('#graph-filters > summary').click();
  const dialog = page.locator('#graphs-dialog');
  const scroller = page.locator('.graph-matrix-scroll');
  await expect(scroller).toBeVisible();
  expect(await scroller.evaluate((el) => el.clientHeight)).toBeGreaterThanOrEqual(230);
  // Reach the last row inside the table, then scroll beyond its boundary.
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await scroller.scrollIntoViewIfNeeded();
  const last = scroller.locator('tbody tr[data-metric]').last();
  await expect(last).toBeInViewport();
  await scroller.hover();
  const before = await dialog.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 1400);
  await expect.poll(() => dialog.evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 20);
  // Returning to the table's upper boundary also returns to the parent controls.
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  await scroller.hover();
  await page.mouse.wheel(0, -4000);
  await expect.poll(() => dialog.evaluate((el) => el.scrollTop)).toBe(0);
});

test('full screen expands the monitoring table, restores filters and exits before closing', async ({
  page,
  isMobile,
}) => {
  const { changeUser, errors } = await setup(page);
  await page.click('#open-graphs');
  await page.click('#graph-view-table');
  const dialog = page.locator('#graphs-dialog');
  const filters = page.locator('#graph-filters');
  await filters.locator(':scope > summary').click();
  const expand = page.locator('#graph-expand');
  const cells = page.locator('#graph-matrix tr[data-metric="r0"] td');
  await expect(cells.first()).toBeAttached();
  const savedValues = await cells.allTextContents();
  const screens = isMobile
    ? [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]
    : [
        { width: 1536, height: 700 },
        { width: 960, height: 540 },
      ];
  for (const viewport of screens) {
    await page.setViewportSize(viewport);
    await expand.click();
    await expect(expand).toHaveAttribute('aria-pressed', 'true');
    await expect(filters).not.toHaveAttribute('open');
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    expect(bounds.width).toBe(viewport.width);
    expect(bounds.height).toBe(viewport.height);
    expect(
      await page.locator('.graph-matrix-scroll').evaluate((el) => el.clientHeight),
    ).toBeGreaterThanOrEqual(230);
    expect(await cells.allTextContents()).toEqual(savedValues);
    await expect(page.locator('.graph-matrix-kind')).toHaveText('24 hours');
    // Filters are still reachable and usable in the expanded view.
    await filters.locator(':scope > summary').click();
    await page.selectOption('#graph-plant', 'UNILAND');
    await expect(page.locator('#graph-matrix h3')).toContainText('UNILAND');
    await page.selectOption('#graph-kind', 'nightShift');
    await expect(page.locator('.graph-matrix-kind')).toHaveText('Night shift');
    await page.selectOption('#graph-kind', 'daily');
    await page.selectOption('#graph-plant', 'JRE');
    await filters.locator(':scope > summary').click();
    await page.locator('.graph-matrix-scroll').focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(expand).toHaveAttribute('aria-pressed', 'false');
    await expect(filters).toHaveAttribute('open');
    await expect(expand).toBeFocused();
    expect(await cells.allTextContents()).toEqual(savedValues);
  }
  // Restore the operator's prior collapsed-filter choice on leaving full screen.
  await filters.locator(':scope > summary').click();
  await expand.click();
  await expand.click();
  await expect(filters).not.toHaveAttribute('open');
  await expand.click();
  await page.click('[data-close-dialog="graphs-dialog"]');
  await expect(dialog).not.toBeVisible();
  await expect(expand).toHaveAttribute('aria-pressed', 'false');
  await page.click('#open-graphs');
  await expect(filters).not.toHaveAttribute('open');
  await expand.click();
  changeUser();
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'midea_account_changed',
        newValue: String(Date.now()),
      }),
    ),
  );
  await expect(dialog).not.toBeVisible();
  await expect(expand).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#graph-matrix')).toBeEmpty();
  expect(errors).toEqual([]);
});

test('monitoring window controls follow the selected language without exposing the closed dialog', async ({
  page,
}) => {
  await setup(page);
  const labels = [
    ['en', 'Full screen', 'Restore view', 'Filters'],
    ['zh-CN', '全屏', '还原视图', '筛选'],
    ['id', 'Layar Penuh', 'Kembali ke Tampilan Biasa', 'Filter'],
  ];
  for (const [language, full, restore, filter] of labels) {
    await page.selectOption('#language-select', language);
    await expect(page.locator('#graphs-dialog')).not.toBeVisible();
    await page.click('#open-graphs');
    await expect(page.locator('#graph-expand')).toHaveAccessibleName(full);
    await expect(page.locator('#graph-filters > summary')).toHaveText(filter);
    await page.click('#graph-expand');
    await expect(page.locator('#graph-expand')).toHaveAccessibleName(restore);
    await page.keyboard.press('Escape');
    await expect(page.locator('#graphs-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#graphs-dialog')).not.toBeVisible();
  }
});
