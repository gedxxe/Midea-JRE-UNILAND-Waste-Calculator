import { test, expect } from './fixtures.js';
import { createDraft } from '../../engine.js';
const user = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'draft-user',
  role: 'operator',
  mustChangePassword: false,
};
const empty = () => ({
  version: 4,
  drafts: { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') },
  reportLinks: {},
});
async function setup(page) {
  const state = { workspace: null, version: 0, writes: 0, reports: 0, offline: false };
  await page.clock.install();
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
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      state.writes++;
      if (state.offline) return r.abort();
      const body = r.request().postDataJSON();
      if (body.baseVersion !== state.version)
        return r.fulfill({ status: 409, json: { error: 'DRAFT_CONFLICT' } });
      state.workspace = body.workspace;
      state.version++;
    }
    return r.fulfill({ json: { workspace: state.workspace, version: state.version } });
  });
  await page.route('**/api/reports', (r) => {
    state.reports++;
    return r.fulfill({ json: { id: '0d8ed4b6-5c2b-4f18-b91e-c051dfca530e', revision: 1 } });
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('Draft autosave is ready.');
  return state;
}
test('partial edits autosave once after idle, restore after reload and Save chooses draft or report', async ({
  page,
}) => {
  const state = await setup(page),
    cell = page.locator('.meter-input').first();
  await cell.fill('123.');
  await page.clock.runFor(29000);
  expect(state.writes).toBe(0);
  await page.clock.runFor(1100);
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  expect(state.writes).toBe(1);
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('123.');
  await page.clock.runFor(90000);
  expect(state.writes).toBe(1);
  await cell.fill('124');
  await page.locator('#save-report').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  expect(state.writes).toBe(2);
  expect(state.reports).toBe(0);
  await page.reload();
  await expect(cell).toHaveValue('124');
  await page.locator('#load-example').click();
  await page.locator('#save-report').click();
  await expect(page.locator('#toast')).toContainText('revision 1');
  expect(state.reports).toBe(1);
});
test('a newer account draft cannot silently overwrite local edits or be overwritten by autosave', async ({
  page,
}) => {
  const state = await setup(page),
    cell = page.locator('.meter-input').first();
  await cell.fill('111');
  state.workspace = empty();
  state.workspace.drafts.JRE.rows[0].start[0] = '222';
  state.version = 1;
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toContainText('Another tab or device');
  await expect(cell).toHaveValue('111');
  await page.clock.runFor(120000);
  expect(state.writes).toBe(1);
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('222');
  page.on('dialog', (d) => d.accept());
  await page.locator('#draft-keep-local').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('111');
  expect(state.version).toBe(2);
});
test('failed draft sync retains local recovery across reload and retries without creating reports', async ({
  page,
}) => {
  const state = await setup(page),
    cell = page.locator('.meter-input').first();
  state.offline = true;
  await cell.fill('555');
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toContainText('Draft sync failed');
  await page.reload();
  await expect(cell).toHaveValue('555');
  state.offline = false;
  await page.locator('#save-draft').click();
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('555');
  expect(state.reports).toBe(0);
});
test('combined readings show a neutral notice and inclusive report dates in days', async ({
  page,
}, info) => {
  await setup(page);
  await page.locator('#load-example').click();
  await page.locator('#start-date').fill('2026-09-18');
  await page.locator('#end-date').fill('2026-09-21');
  await expect(page.locator('#period-note')).toContainText('covers 3 days');
  await expect(page.locator('#period-note')).not.toHaveClass(/warning/);
  await expect(page.locator('#report-preview')).toHaveValue(/18-20 SEPTEMBER 2026 - 3 DAYS/);
  await expect(page.locator('#report-preview')).not.toHaveValue(/72 HOURS|not 24 hours/);
  await page.locator('#period-note').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('period-notice.png') });
});

test('continuous edits sync within two minutes and edits during a request remain pending', async ({
  page,
}) => {
  const state = await setup(page),
    cell = page.locator('.meter-input').first();
  await cell.fill('1');
  for (let i = 2; i <= 6; i++) {
    await page.clock.runFor(20000);
    await cell.fill(String(i));
  }
  expect(state.writes).toBe(0);
  await page.clock.runFor(20000);
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  expect(state.writes).toBe(1);
  let release,
    started = false;
  await page.route(
    '**/api/drafts',
    async (r) => {
      if (r.request().method() !== 'POST') return r.fallback();
      const body = r.request().postDataJSON();
      started = true;
      await new Promise((resolve) => {
        release = resolve;
      });
      state.workspace = body.workspace;
      state.version++;
      await r.fulfill({ json: { version: state.version } });
    },
    { times: 1 },
  );
  await cell.fill('7');
  await page.locator('#save-draft').click();
  await expect.poll(() => started).toBe(true);
  await cell.fill('8');
  release();
  await expect(page.locator('#save-status')).toContainText('Sync pending');
  await expect(cell).toHaveValue('8');
  await page.clock.runFor(30000);
  await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('8');
});
