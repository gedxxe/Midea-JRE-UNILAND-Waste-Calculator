import { createWorkingHoursDraft, createNightShiftDraft } from '../../engine.js';
import { restoreWorkspace } from '../../storage.js';
import { reportLinkKey } from '../../reading-period.js';
import { test as base, expect } from '@playwright/test';
export { expect };
const states = new WeakMap();
export function modernWorkspace(workspace) {
  if (!workspace) return null;
  const restored = restoreWorkspace(JSON.stringify(workspace));
  return {
    ...restored,
    autosaveLayout: 1,
    workingHours:
      restored.workingHours ||
      Object.fromEntries(['JRE', 'UNILAND'].map((p) => [p, createWorkingHoursDraft(p)])),
    nightShifts:
      restored.nightShifts ||
      Object.fromEntries(['JRE', 'UNILAND'].map((p) => [p, createNightShiftDraft(p)])),
  };
}
export function checkpointReply(page, route, response, state) {
  const body = route.request().postDataJSON();
  state ??= states.get(page).get(route.request().headers()['x-meter-user']);
  if (!response.unchanged) {
    state.workspace.reportLinks ??= {};
    state.workspace.reportLinks[reportLinkKey(body.draft)] = {
      id: response.id,
      revision: response.revision,
      startDate: body.draft.startDate,
      endDate: body.draft.endDate,
    };
    state.version++;
  }
  return route.fulfill({
    json: {
      ...response,
      workspace: state.workspace,
      workspaceVersion: state.version,
      updated_at: '2026-10-24T01:00:00Z',
      records: [],
    },
  });
}
export const test = base.extend({
  page: async ({ page }, use) => {
    const drafts = new Map();
    states.set(page, drafts);
    await page.route('**/api/drafts', async (route) => {
      const id = route.request().headers()['x-meter-user'];
      const old = drafts.get(id) || { workspace: null, version: 0 };
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.baseVersion !== old.version)
          return route.fulfill({ status: 409, json: { error: 'DRAFT_CONFLICT' } });
        drafts.set(id, { workspace: body.workspace, version: old.version + 1 });
      }
      await route.fulfill({ json: drafts.get(id) || old });
    });
    await page.route('**/api/drafts?**', (route) => {
      const key = new URL(route.request().url()).searchParams.get('period');
      return route.fulfill({ json: { key, draft: null, version: 0 } });
    });
    await use(page);
  },
});

export async function openSignIn(page) {
  await page.locator('#open-login').click();
  await expect(page.locator('#login-username')).toBeVisible();
  await expect(page.locator('#application-surface')).not.toHaveAttribute('inert', '');
}
