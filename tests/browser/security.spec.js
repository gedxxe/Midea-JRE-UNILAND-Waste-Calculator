import { test, expect } from './fixtures.js';
import { readFile } from 'node:fs/promises';
import { exampleDraft } from '../../examples.js';
import { reportSnapshot } from '../../server/report-data.js';
import { graphRecords } from '../../graph-data.js';

test('stored hostile text stays inert in draft inputs, reports, historian and exported graph SVG', async ({
  page,
}, info) => {
  const payload = '<img src=xss-probe onerror=window.__probe=1>';
  const draft = exampleDraft('JRE');
  draft.utilities[0] = { value: '0', note: payload };
  const snapshot = reportSnapshot(draft);
  const workspace = { version: 4, drafts: { JRE: draft, UNILAND: exampleDraft('UNILAND') } };
  const user = {
    id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
    username: 'security-test',
    role: 'operator',
    mustChangePassword: false,
  };
  const requests = [];
  page.on('request', (request) => {
    if (request.url().includes('xss-probe')) requests.push(request.url());
  });
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user } }));
  await page.route('**/api/drafts', (r) => r.fulfill({ json: { workspace, version: 1 } }));
  await page.route('**/api/reports?**', (r) =>
    r.fulfill({
      json: new URL(r.request().url()).searchParams.has('id')
        ? { id: user.id, revision: 1, latestRevision: 1, snapshot }
        : {
            reports: [
              {
                id: user.id,
                plant: 'JRE',
                start_date: draft.startDate,
                end_date: draft.endDate,
                revision: 1,
              },
            ],
            hasMore: false,
          },
    }),
  );
  await page.route('**/api/graphs?**', (r) =>
    r.fulfill({
      json: {
        plant: 'JRE',
        start: '2026-09-01',
        end: '2026-09-30',
        records: graphRecords(
          [
            {
              id: user.id,
              revision: 1,
              start_date: draft.startDate,
              end_date: draft.endDate,
              snapshot,
            },
          ],
          'JRE',
        ),
      },
    }),
  );
  await page.goto('/');
  await expect(page.locator('#report-preview')).toHaveValue(snapshot.output.reportText);
  await page.locator('#open-history').click();
  await page.locator('#history-list button').click();
  await expect(page.locator('#history-snapshot')).toHaveValue(snapshot.output.reportText);
  await page.locator('[data-close-dialog="history-dialog"]').click();
  await page.locator('#open-graphs').click();
  const card = page.locator('.graph-card').first();
  await card.locator('.graph-settings summary').click();
  await card.locator('[data-graph-title="titleEn"]').fill(payload);
  await expect(card.locator('svg')).toContainText(payload);
  await card.locator('.graph-settings summary').click();
  const pending = page.waitForEvent('download');
  await card.locator('[data-graph-export="svg"]').click();
  const download = await pending;
  const file = info.outputPath('hostile-title.svg');
  await download.saveAs(file);
  const xml = await readFile(file, 'utf8');
  expect(xml).toContain('&lt;img');
  const parsed = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    return {
      errors: doc.querySelectorAll('parsererror').length,
      active: doc.querySelectorAll('script,img,foreignObject,[onload],[onerror]').length,
    };
  }, xml);
  expect(parsed).toEqual({ errors: 0, active: 0 });
  await expect(page.locator('[src="xss-probe"],[onerror],[onload]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__probe)).toBeUndefined();
  expect(requests).toEqual([]);
  await page.reload();
  await page.locator('#open-graphs').click();
  await expect(page.locator('.graph-card').first().locator('svg')).toContainText(payload);
  expect(await page.evaluate(() => window.__probe)).toBeUndefined();
});

test('static allowlist rejects sensitive and encoded traversal paths', async ({ request }) => {
  for (const path of [
    '/.env.local',
    '/server/auth.js',
    '/package.json',
    '/.git/config',
    '/docs/accounts.md',
    '/%2e%2e%2f.env.local',
    '/asset/%2e%2e%2fserver%2fauth.js',
  ]) {
    const result = await request.get(path);
    expect(result.status()).toBe(404);
  }
});
