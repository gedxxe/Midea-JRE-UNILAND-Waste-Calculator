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
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      state.workspace = r.request().postDataJSON().workspace;
      state.version++;
      state.writes++;
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
  return state;
}

test('Fuse Undo and Escape cancel only the manual version while incomplete readings keep autosaving', async ({
  page,
}) => {
  const state = await setup(page);
  const button = page.locator('#save-report');
  await cell(page).fill('123.');
  await button.click();
  await expect(button).toContainText('Undo save');
  await page.clock.runFor(3900);
  expect(state.saves).toHaveLength(0);
  expect(state.workspace.drafts.JRE.rows[0].start[0]).toBe('123.');
  await button.click();
  await page.clock.runFor(5000);
  expect(state.saves).toHaveLength(0);
  await expect(page.locator('#save-version-status')).toContainText('cancelled');
  await button.click();
  await page.keyboard.press('Escape');
  await page.clock.runFor(4100);
  expect(state.saves).toHaveLength(0);
  expect(state.writes).toBeGreaterThan(0);
  await expect(button).toContainText('Save version');
});

test('Fuse sends exactly once after four seconds, confirms only a server result and preserves unchanged checkpoint revisions', async ({
  page,
}) => {
  const state = await setup(page);
  let release;
  state.hold = new Promise((resolve) => {
    release = resolve;
  });
  await page.locator('#save-report').click();
  await page.clock.runFor(3999);
  expect(state.saves).toHaveLength(0);
  await page.clock.runFor(2);
  await expect.poll(() => state.saves.length).toBe(1);
  await expect(page.locator('#save-report')).toBeDisabled();
  await expect(page.locator('#save-version-status')).toHaveText('Saving version...');
  release();
  state.hold = null;
  await expect(page.locator('#toast')).toContainText('Revision 1');
  await expect(page.locator('#save-version-status')).toHaveText('Version saved.');
  await page.locator('#save-report').click();
  await page.clock.runFor(4100);
  await expect(page.locator('#toast')).toContainText('Already saved');
  expect(state.saves).toHaveLength(2);
  expect(state.revision).toBe(1);
});

test('changing readings, mode, dates or account cancels a queued version instead of saving a different context', async ({
  page,
}) => {
  const state = await setup(page);
  const button = page.locator('#save-report');
  await button.click();
  await cell(page).fill('150');
  await expect(button).toHaveAttribute('data-fuse-phase', 'idle');
  await page.clock.runFor(4100);
  expect(state.saves).toHaveLength(0);
  await button.click();
  await page.locator('#end-date').fill('2026-10-28');
  await page.clock.runFor(4100);
  expect(state.saves).toHaveLength(0);
  await button.click();
  await page.locator('#reading-mode').selectOption('workingHours');
  await page.clock.runFor(4100);
  expect(state.saves).toHaveLength(0);
  await button.click();
  state.user = { ...owner, id: '9d631ad7-e244-4f49-a1cf-c715a56f317e', username: 'other-test' };
  state.workspace = null;
  await page.evaluate(() =>
    dispatchEvent(new StorageEvent('storage', { key: 'midea_account_changed', newValue: 'test' })),
  );
  await expect(page.locator('#account-name')).toHaveText('other-test');
  await page.clock.runFor(4100);
  expect(state.saves).toHaveLength(0);
  await expect(page.locator('#save-version-status')).toHaveText('');
});

test('hidden tabs pause the remaining Undo time and request failures never show saved', async ({
  page,
}) => {
  const state = await setup(page, { animation: true });
  const button = page.locator('#save-report');
  await button.click();
  await page.clock.runFor(1000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(20000);
  expect(state.saves).toHaveLength(0);
  state.fail = true;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(2999);
  expect(state.saves).toHaveLength(0);
  await page.clock.runFor(101);
  await expect.poll(() => state.saves.length).toBe(1);
  await expect(button).toBeEnabled();
  await expect(page.locator('#save-version-status')).not.toHaveText('Version saved.');
  await expect(page.locator('#toast')).toContainText('changed');
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

test('a reading edit while checkpoint waits for autosave cannot submit a different reading', async ({
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
  await expect(page.locator('#save-version-status')).not.toHaveText('Version saved.');
  await expect(cell(page)).toHaveValue('126');
});
