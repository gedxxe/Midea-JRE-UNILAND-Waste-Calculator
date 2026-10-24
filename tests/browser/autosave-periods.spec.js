import { test, expect, modernWorkspace } from './fixtures.js';
import { createDraft } from '../../engine.js';
const id = 'b89c2b90-bbee-4a90-bd68-a0e9fc761352';
test('editing End then Start journals the original period, without an intermediate combined document', async ({
  page,
}) => {
  await page.clock.install();
  let workspace = modernWorkspace({
      version: 4,
      drafts: {
        JRE: createDraft('JRE', '2026-10-03', '2026-10-04'),
        UNILAND: createDraft('UNILAND'),
      },
    }),
    version = 1;
  workspace.drafts.JRE.rows[0].start[0] = '100';
  workspace.drafts.JRE.rows[0].end[0] = '110';
  const writes = [];
  await page.route('**/api/auth', (r) =>
    r.fulfill({
      json: {
        available: true,
        user: { id, username: 'period-test', role: 'operator', mustChangePassword: false },
      },
    }),
  );
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON();
      writes.push(body);
      workspace = body.workspace;
      version++;
    }
    return r.fulfill({ json: { workspace, version } });
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  await page.locator('#end-date').fill('2026-10-05');
  await page.locator('#start-date').fill('2026-10-04');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(writes).toHaveLength(1);
  expect(writes[0].periods.map((p) => [p.startDate, p.endDate])).toEqual([
    ['2026-10-03', '2026-10-04'],
  ]);
  expect(writes[0].periods[0].rows[0].end[0]).toBe('110');
  expect(workspace.drafts.JRE.rows[0].start[0]).toBe('110');
  expect(workspace.drafts.JRE.rows[0].end[0]).toBe('');
});
