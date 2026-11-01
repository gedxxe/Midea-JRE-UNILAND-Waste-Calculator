import { test, expect, modernWorkspace, checkpointReply, openSignIn } from './fixtures.js';
import { createDraft } from '../../engine.js';

const owner = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'button-test',
  role: 'operator',
  mustChangePassword: false,
};
const cell = (page) => page.locator('.meter-input').first();
async function setup(page, { animation = false } = {}) {
  await page.clock.install({ time: new Date('2026-10-29T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-29T00:00:01Z'));
  await page.emulateMedia({ reducedMotion: animation ? 'no-preference' : 'reduce' });
  const state = {
    user: owner,
    workspace: modernWorkspace({
      version: 4,
      drafts: {
        JRE: createDraft('JRE', '2026-10-26', '2026-10-27'),
        UNILAND: createDraft('UNILAND'),
      },
    }),
    version: 1,
    writes: 0,
    checks: 0,
    saves: [],
    revision: 0,
    previous: null,
    fail: false,
    hold: null,
  };
  state.workspace.drafts.JRE.rows[0].start[0] = '100';
  await page.route('**/api/auth', (r) =>
    r.fulfill({ json: { available: true, user: state.user } }),
  );
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/drafts', async (r) => {
    if (r.request().method() === 'POST') {
      state.workspace = r.request().postDataJSON().workspace;
      state.version++;
      state.writes++;
    }
    if (r.request().method() === 'GET') {
      state.checks++;
      if (state.hold) await state.hold;
      if (state.fail) return r.fulfill({ status: 503, json: { error: 'SERVICE_UNAVAILABLE' } });
    }
    return r.fulfill({ json: { workspace: state.workspace, version: state.version } });
  });
  await page.route('**/api/reports', async (r) => {
    const body = r.request().postDataJSON();
    state.saves.push(body);
    if (state.hold) await state.hold;
    if (state.fail) return r.fulfill({ status: 409, json: { error: 'REVISION_CONFLICT' } });
    const serialized = JSON.stringify(body.draft),
      unchanged = serialized === state.previous;
    if (!unchanged) {
      state.revision++;
      state.previous = serialized;
    }
    return checkpointReply(
      page,
      r,
      { id: '0d8ed4b6-5c2b-4f18-b91e-c051dfca530e', revision: state.revision, unchanged },
      state,
    );
  });
  await page.goto('/');
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  state.checks = 0;
  return state;
}

test('partial readings autosave and repeated Save verifies without checkpoint writes', async ({
  page,
}) => {
  const state = await setup(page);
  await cell(page).fill('123.');
  await page.clock.runFor(3100);
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  const writes = state.writes;
  for (let i = 1; i <= 2; i++) {
    await page.locator('#save-report').click();
    await expect(page.locator('#toast')).toContainText('saved and verified');
    expect(state.checks).toBe(i);
  }
  expect(state.writes).toBe(writes);
  expect(state.saves).toHaveLength(0);
  expect(state.revision).toBe(0);
});
test('Save starts immediately and confirms only the server read-back', async ({ page }) => {
  const state = await setup(page);
  let release;
  state.hold = new Promise((r) => {
    release = r;
  });
  await page.locator('#save-report').click();
  await expect.poll(() => state.checks).toBe(1);
  await expect(page.locator('#save-report')).toBeDisabled();
  await expect(page.locator('#save-version-status')).toHaveText('Checking...');
  release();
  state.hold = null;
  await expect(page.locator('#toast')).toContainText('saved and verified');
  expect(state.saves).toHaveLength(0);
  expect(state.writes).toBe(0);
});
test('editing readings during verification keeps the edit and suppresses stale confirmation', async ({
  page,
}) => {
  const state = await setup(page);
  let release;
  state.hold = new Promise((r) => {
    release = r;
  });
  await page.locator('#save-report').click();
  await expect.poll(() => state.checks).toBe(1);
  await cell(page).fill('150');
  release();
  state.hold = null;
  await expect(page.locator('#save-report')).toBeEnabled();
  await expect(page.locator('#save-version-status')).not.toHaveText('Save verified.');
  await page.clock.runFor(5100);
  await expect(page.locator('#save-status')).toHaveText('All changes saved to your account.');
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('150');
  expect(state.saves).toHaveLength(0);
});
test('hidden tabs stop decoration while failed verification never reports success', async ({
  page,
}) => {
  const state = await setup(page, { animation: true });
  let release;
  state.hold = new Promise((r) => {
    release = r;
  });
  await page.locator('#save-report').click();
  await expect.poll(() => state.checks).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#save-report')).toHaveAttribute('data-save-motion', 'off');
  state.fail = true;
  release();
  state.hold = null;
  await expect(page.locator('#save-report')).toBeEnabled();
  await expect(page.locator('#save-version-status')).not.toHaveText('Save verified.');
  expect(state.saves).toHaveLength(0);
});

test('Sign in stays native and usable without WebGL', async ({ page }) => {
  const errors = [],
    submissions = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl2' ? null : context.call(this, type, ...args);
    };
  });
  await page.route('**/api/auth', (r) => {
    if (r.request().method() === 'POST') {
      submissions.push(r.request().postDataJSON());
      return r.fulfill({ status: 401, json: { error: 'INVALID_CREDENTIALS' } });
    }
    return r.fulfill({ json: { available: true, user: null } });
  });
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.goto('/');
  await openSignIn(page);
  await expect(page.locator('#login-submit')).toHaveAttribute('type', 'submit');
  await page.locator('#login-submit').click();
  expect(submissions).toHaveLength(0);
  for (const [lang, label] of [
    ['zh-CN', '登录'],
    ['id', 'Login'],
    ['en', 'Sign in'],
  ]) {
    await page.locator('#language-select').selectOption(lang);
    await expect(page.locator('#login-submit .specular-button__label')).toHaveText(label);
  }
  await page.locator('#login-username').fill('button-test');
  await page.locator('#login-password').fill('Synthetic password only');
  await page.locator('#login-password').press('Enter');
  await expect(page.locator('#account-status')).toContainText('Username or password');
  expect(submissions).toHaveLength(1);
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#login-submit')).toBeEnabled();
  await page.locator('#back-welcome').click();
  await expect(page.locator('#welcome-hero')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Specular follows the pointer, stops settled and covered frames, and releases its canvas on leaving Sign in', async ({
  page,
}, info) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__specularDraws = 0;
    const context = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      const gl = context.call(this, type, ...args);
      if (gl && type === 'webgl2' && this.className === 'specular-button__light') {
        const draw = gl.drawArrays.bind(gl);
        gl.drawArrays = (...values) => {
          window.__specularDraws++;
          return draw(...values);
        };
      }
      return gl;
    };
  });
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user: null } }));
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.goto('/');
  await openSignIn(page);
  await expect(page.locator('#login-submit canvas')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__specularDraws)).toBeGreaterThan(0);
  await page.locator('#login-submit').hover();
  const initial = await page.evaluate(() => window.__specularDraws);
  const rect = await page.locator('#login-submit').boundingBox();
  await page.mouse.move(rect.x + rect.width - 4, rect.y + rect.height / 2);
  await expect.poll(() => page.evaluate(() => window.__specularDraws)).toBeGreaterThan(initial);
  await page.screenshot({ path: info.outputPath('specular-sign-in.png') });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(2500);
  const settled = await page.evaluate(() => window.__specularDraws);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__specularDraws)).toBe(settled);
  await page.locator('#login-raw-template').click();
  await expect(page.locator('#raw-template-dialog')).toBeVisible();
  const covered = await page.evaluate(() => window.__specularDraws);
  await page.mouse.move(rect.x + 5, rect.y + 5);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__specularDraws)).toBe(covered);
  await page.keyboard.press('Escape');
  await expect(page.locator('#raw-template-dialog')).toBeHidden();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(() => window.__specularDraws);
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__specularDraws)).toBe(reduced);
  await page.locator('#back-welcome').click();
  await expect(page.locator('#login-submit canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a reading edit while verification waits for autosave cannot submit a different reading', async ({
  page,
}) => {
  const state = await setup(page);
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  let blocked = false;
  await page.route('**/api/drafts', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback();
    const body = r.request().postDataJSON();
    blocked = true;
    await hold;
    state.workspace = body.workspace;
    state.version++;
    return r.fulfill({ json: { workspace: state.workspace, version: state.version } });
  });
  await cell(page).fill('125');
  await page.locator('#save-report').click();
  await page.clock.runFor(4100);
  await expect.poll(() => blocked).toBe(true);
  await expect(page.locator('#save-report')).toBeDisabled();
  await cell(page).fill('126');
  release();
  await expect(page.locator('#save-report')).toBeEnabled();
  expect(state.saves).toHaveLength(0);
  await expect(page.locator('#save-version-status')).not.toHaveText('Save verified.');
  await expect(cell(page)).toHaveValue('126');
});
