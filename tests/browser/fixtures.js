import { test as base, expect } from '@playwright/test';
export { expect };
export const test = base.extend({
  page: async ({ page }, use) => {
    const drafts = new Map();
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
    await use(page);
  },
});
