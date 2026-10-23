import { test, expect } from './fixtures.js';
import { exampleDraft } from '../../examples.js';

const user = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'guide-test',
  role: 'operator',
  mustChangePassword: false,
};
async function setup(page, identity = user) {
  const state = { user: identity, writes: 0, lazy: [], errors: [] };
  page.on('pageerror', (error) => state.errors.push(error.message));
  page.on('request', (r) => {
    if (/\/(?:guide.css|guide.js|i18n\/guide.js)$/.test(r.url())) state.lazy.push(r.url());
  });
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/auth', (r) => {
    if (r.request().method() === 'POST' && r.request().postDataJSON().action === 'logout')
      state.user = null;
    return r.fulfill({ json: { available: true, user: state.user } });
  });
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') state.writes++;
    return r.fulfill({
      json: {
        version: 1,
        workspace: {
          version: 4,
          drafts: { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND') },
        },
      },
    });
  });
  await page.route('**/api/reports', (r) => {
    state.writes++;
    return r.fulfill({ json: {} });
  });
  await page.goto('/');
  if (identity && !identity.mustChangePassword)
    await expect(page.locator('#save-status')).toHaveText('Draft saved to your account.');
  return state;
}
const open = async (page) => {
  await page.locator('#open-guide').click();
  await expect(page.locator('#guide-dialog')).toBeVisible();
};
const close = async (page) => {
  await page.keyboard.press('Escape');
  await expect(page.locator('#guide-dialog')).toBeHidden();
};

test('optional guide loads on demand, walks eight steps without edits or writes, and returns focus', async ({
  page,
}, info) => {
  const state = await setup(page);
  expect(state.lazy).toHaveLength(0);
  await expect(page.locator('#guide-invitation')).toBeVisible();
  const before = await page.locator('#report-preview').inputValue();
  const readings = await page
    .locator('.meter-input')
    .evaluateAll((els) => els.map((el) => el.value));
  const storage = await page.evaluate(
    (id) => sessionStorage.getItem('midea_energy_draft_v4_' + id),
    user.id,
  );
  await open(page);
  await expect(page.locator('#guide-title')).toBeFocused();
  await expect(page.locator('#guide-back')).toBeDisabled();
  await page.keyboard.press('Control+s');
  await page.keyboard.press('Control+Enter');
  const steps = ['Period', 'Table', 'Import', 'Utilities', 'Save', 'Copy', 'History', 'Graphs'];
  for (let i = 0; i < steps.length; i++) {
    await expect(page.locator('#guide-dialog')).toHaveAttribute('data-step', steps[i]);
    await expect(page.locator('.guide-progress')).toHaveText(`Step ${i + 1} of 8`);
    const bounds = await page.locator('#guide-dialog').boundingBox();
    const viewport = page.viewportSize();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.height).toBeLessThanOrEqual(viewport.height);
    expect(
      await page.locator('#guide-dialog').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    if (i === 0 || i === 7)
      await page.screenshot({ path: info.outputPath(`guide-${steps[i]}.png`) });
    if (i === 1) {
      await page.locator('#guide-back').click();
      await expect(page.locator('#guide-dialog')).toHaveAttribute('data-step', 'Period');
      await page.locator('#guide-next').click();
    }
    await page.locator('#guide-next').click();
  }
  await expect(page.locator('#guide-dialog')).toBeHidden();
  await expect(page.locator('#open-guide')).toBeFocused();
  await expect(page.locator('#guide-invitation')).toBeHidden();
  expect(await page.locator('#report-preview').inputValue()).toBe(before);
  expect(
    await page.locator('.meter-input').evaluateAll((els) => els.map((el) => el.value)),
  ).toEqual(readings);
  expect(
    await page.evaluate((id) => sessionStorage.getItem('midea_energy_draft_v4_' + id), user.id),
  ).toBe(storage);
  expect(state.writes).toBe(0);
  expect(state.lazy).toHaveLength(3);
  expect(state.errors).toEqual([]);
});

test('dismissal is per account/browser and the guide remains available across languages and modes', async ({
  page,
}) => {
  const state = await setup(page);
  await page.locator('#dismiss-guide').click();
  await page.reload();
  await expect(page.locator('#guide-invitation')).toBeHidden();
  for (const [language, title] of [
    ['zh-CN', '选择抄表时段'],
    ['id', 'Pilih periode reading'],
    ['en', 'Choose the reading period'],
  ]) {
    await page.locator('#language-select').selectOption(language);
    await open(page);
    await expect(page.locator('#guide-title')).toHaveText(title);
    await close(page);
  }
  await page.locator('[data-plant="UNILAND"]').click();
  await page.locator('#reading-mode').selectOption('nightShift');
  const before = await page.locator('#report-preview').inputValue();
  await open(page);
  await close(page);
  await expect(page.locator('#reading-mode')).toHaveValue('nightShift');
  expect(await page.locator('#report-preview').inputValue()).toBe(before);
  state.user = { ...user, id: '5a379d04-93b9-4d6d-a902-5d357bec9f7e' };
  await page.reload();
  await expect(page.locator('#guide-invitation')).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('pause, reduced motion, focus containment and short screens remain usable', async ({
  page,
}, info) => {
  await setup(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page);
  const animations = () =>
    page
      .locator('.guide-scene')
      .evaluate((el) => el.getAnimations({ subtree: true }).map((a) => a.playState));
  await expect.poll(animations).toEqual(['running', 'running']);
  await page.locator('#guide-pause').click();
  await expect.poll(animations).toEqual(['paused', 'paused']);
  await page.locator('#guide-next').click();
  await expect.poll(animations).toEqual(['paused', 'paused']);
  await page.locator('#guide-pause').click();
  await expect.poll(animations).toEqual(['running', 'running']);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(animations).toEqual(['paused', 'paused']);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(animations).toEqual(['running', 'running']);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#guide-pause')).toBeHidden();
  await expect.poll(animations).toEqual([]);
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#guide-dialog'))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement.closest('#guide-dialog'))).toBe(true);
  await page.setViewportSize({ width: 360, height: 480 });
  await page.locator('#guide-next').click();
  await expect(page.locator('#guide-title')).toBeFocused();
  const nav = await page.locator('.guide-nav').boundingBox();
  expect(nav.y + nav.height).toBeLessThanOrEqual(480);
  await page.screenshot({ path: info.outputPath('guide-short-screen.png') });
  await close(page);
  expect(
    await page
      .locator('#guide-dialog')
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
});

test('logout/account changes close the guide and cancel a delayed open', async ({ page }) => {
  const state = await setup(page);
  await open(page);
  state.user = null;
  await page.evaluate(() =>
    window.dispatchEvent(new StorageEvent('storage', { key: 'midea_account_changed' })),
  );
  await expect(page.locator('#guide-dialog')).toBeHidden();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#open-login')).toBeFocused();
  expect(
    await page
      .locator('#guide-dialog')
      .evaluate((el) => el.getAnimations({ subtree: true }).length),
  ).toBe(0);
  await page.reload();
  state.user = user;
  await page.reload();
  await expect(page.locator('#open-guide')).toBeVisible();
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route('**/guide.css', async (r) => {
    await held;
    await r.continue();
  });
  await page.locator('#open-guide').click();
  await expect(page.locator('#open-guide')).toHaveAttribute('aria-busy', 'true');
  state.user = null;
  await page.evaluate(() =>
    window.dispatchEvent(new StorageEvent('storage', { key: 'midea_account_changed' })),
  );
  await expect(page.locator('#report-workspace')).toBeHidden();
  release();
  await expect(page.locator('#guide-dialog')).toHaveCount(1);
  await expect(page.locator('#guide-dialog')).toBeHidden();
  expect(state.errors).toEqual([]);
});

test('failed lazy stylesheet can retry and blocked preference storage does not block reporting', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'midea_guide_seen_v1') throw new DOMException('Blocked', 'SecurityError');
      return original.call(this, key, value);
    };
  });
  const state = await setup(page);
  await page.route('**/guide.css', (r) => r.abort());
  await page.locator('#open-guide').click();
  await expect(page.locator('#toast')).toContainText('guide could not load');
  await expect(page.locator('#open-guide')).toBeEnabled();
  await page.unroute('**/guide.css');
  await page.locator('#start-guide').click();
  await expect(page.locator('#guide-dialog')).toBeVisible();
  await close(page);
  await expect(page.locator('#guide-invitation')).toBeHidden();
  await expect(page.locator('#report-workspace')).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('signed-out and password-change-required users never load or see workspace hints', async ({
  page,
}) => {
  const state = await setup(page, null);
  await expect(page.locator('#open-guide')).toBeHidden();
  await expect(page.locator('#guide-invitation')).toBeHidden();
  expect(state.lazy).toHaveLength(0);
  state.user = { ...user, mustChangePassword: true };
  await page.reload();
  await expect(page.locator('#password-required')).toBeVisible();
  await expect(page.locator('#open-guide')).toBeHidden();
  await expect(page.locator('#guide-invitation')).toBeHidden();
  expect(state.lazy).toHaveLength(0);
});
