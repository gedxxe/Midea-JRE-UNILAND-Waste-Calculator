import { test, expect, modernWorkspace } from './fixtures.js';
import { exampleDraft } from '../../examples.js';

const owner = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'motion-test',
  role: 'operator',
  mustChangePassword: false,
};
async function setup(page) {
  const state = {
    user: owner,
    workspace: modernWorkspace({
      version: 4,
      drafts: { JRE: exampleDraft('JRE'), UNILAND: exampleDraft('UNILAND') },
    }),
    version: 1,
    saves: 0,
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/auth', (r) =>
    r.fulfill({ json: { available: true, user: state.user } }),
  );
  await page.route('**/api/time', (r) =>
    r.fulfill({
      json: {
        unixMs: Date.UTC(2026, 9, 29, 1, 7, 58),
        source: 'time.cloudflare.com',
        protocol: 'NTP',
        sampleAgeMs: 0,
        uncertaintyMs: 5,
        stratum: 3,
      },
    }),
  );
  await page.route('**/api/drafts', (r) => {
    if (r.request().method() === 'POST') {
      state.workspace = r.request().postDataJSON().workspace;
      state.version++;
    }
    return r.fulfill({ json: { workspace: state.workspace, version: state.version } });
  });
  await page.route('**/api/reports', (r) => {
    state.saves++;
    return r.fulfill({ status: 500, json: { error: 'SERVICE_UNAVAILABLE' } });
  });
  await page.goto('/');
  await expect(page.locator('#report-workspace')).toBeVisible();
  return { state, errors };
}

test('Save version faces share a compact grid in every language and keep the cancellable window', async ({
  page,
}, info) => {
  const { state, errors } = await setup(page);
  const button = page.locator('#save-report');
  for (const language of ['en', 'zh-CN', 'id']) {
    await page.locator('#language-select').selectOption(language);
    await expect(button).toHaveCSS('display', 'grid');
    const idle = await button.boundingBox();
    expect(idle.width).toBeLessThan(245);
    await button.click();
    await expect(button).toHaveAttribute('data-fuse-phase', 'armed');
    const armed = await button.boundingBox();
    expect(Math.abs(armed.width - idle.width)).toBeLessThan(24);
    await button.click();
    await expect(button).toHaveAttribute('data-fuse-phase', 'idle');
  }
  expect(state.saves).toBe(0);
  await page.screenshot({ path: info.outputPath('compact-save.png') });
  expect(errors).toEqual([]);
});

test('dashboard rolls digits while canonical precision, gap signs and copied report bytes stay exact', async ({
  page,
}, info) => {
  const { errors } = await setup(page);
  const main = page.locator('#main-total');
  await main.scrollIntoViewIfNeeded();
  await expect(main.locator('..')).toHaveClass('counter-host');
  const before = await main.textContent();
  // Select via the established meter input attributes.
  const end = page.locator('input.meter-input[data-side="end"]').first();
  const value = await end.inputValue();
  await end.fill(String(Number(value) + 100));
  await expect(main).not.toHaveText(before);
  await main.scrollIntoViewIfNeeded();
  await end.evaluate(
    (element, value) => {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    },
    String(Number(value) + 101),
  );
  await expect(main.locator('..')).toHaveAttribute('data-rolling', 'true');
  await page.screenshot({ path: test.info().outputPath('counter-rolling.png') });
  const exact = await main.textContent(),
    report = await page.locator('#report-preview').inputValue();
  expect(exact).toMatch(/^\d+\.\d\d$/);
  await expect(page.locator('#derived-two')).toHaveText(/^[+-]\d+\.\d\d kWh$/);
  await expect(main.locator('..').locator('.counter-row')).toHaveAttribute('aria-hidden', 'true');
  await expect(main.locator('..')).toHaveAttribute('data-rolling', 'false', { timeout: 3500 });
  await expect(main).toHaveText(exact);
  await page.screenshot({ path: info.outputPath('dashboard-counters.png') });
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#language-select').selectOption(language);
    await expect(page.locator('#report-preview')).toHaveValue(report);
  }
  await page.evaluate(() => {
    window.__copied = null;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text) => {
          window.__copied = text;
          return Promise.resolve();
        },
      },
    });
  });
  await page.locator('#copy-report').click();
  expect(await page.evaluate(() => window.__copied)).toBe(report);
  await page.locator('[data-plant="UNILAND"]').click();
  await expect(main.locator('..')).toHaveAttribute('data-rolling', 'false');
  await expect(page.locator('#main-unit')).toHaveText('MWh');
  await page.locator('#reading-mode').selectOption('workingHours');
  await expect(main).toHaveText('-');
  await expect(main.locator('..')).toHaveAttribute('data-rolling', 'false');
  expect(errors).toEqual([]);
});

test('clock digits follow WIB seconds and preserve truthful NTP status without adding time requests', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-10-29T01:07:57Z') });
  await page.clock.pauseAt(new Date('2026-10-29T01:07:58Z'));
  let timeRequests = 0;
  const { errors } = await setup(page);
  // Count only later reads; animated clock ticks must never fetch their own time.
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/time') timeRequests++;
  });
  const time = page.locator('#clock-time');
  await expect(time.locator('..')).toHaveClass('counter-host');
  await expect(page.locator('#clock-status')).toHaveText('NTP synchronized');
  const baselineRequests = timeRequests;
  const before = await time.textContent();
  await page.clock.runFor(1000);
  const after = await time.textContent();
  const seconds = (s) => s.split(':').reduce((n, p) => n * 60 + Number(p), 0);
  expect((seconds(after) - seconds(before) + 86400) % 86400).toBe(1);
  await expect(time.locator('..')).toHaveAttribute('data-rolling', 'true');
  await page.clock.runFor(900);
  await expect(time.locator('..')).toHaveAttribute('data-rolling', 'false');
  await expect(page.locator('#clock-status')).toHaveText('NTP synchronized');
  await expect(page.locator('#clock-dot')).toHaveClass(/synced/);
  expect(timeRequests).toBe(baselineRequests);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(1000);
  await expect(time.locator('..')).toHaveAttribute('data-rolling', 'false');
  await expect(time).toHaveCSS('opacity', '1');
  expect(errors).toEqual([]);
});

test('optional effects failing keep native metric text and immediate clipboard usable', async ({
  page,
}) => {
  await page.route('**/ui/counter.js', (r) => r.abort());
  await page.route('**/ui/signin-specular.js', (r) => r.abort());
  const { errors } = await setup(page);
  const expected = await page.locator('#report-preview').inputValue();
  await expect(page.locator('#main-total')).toHaveText(/\d/);
  await expect(page.locator('#main-total')).toHaveCSS('opacity', '1');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text) => {
          window.__copied = text;
          return Promise.resolve();
        },
      },
    }),
  );
  await page.locator('#copy-report').click();
  expect(await page.evaluate(() => window.__copied)).toBe(expected);
  await expect(page.locator('#clock-time')).toHaveText(/^\d\d:\d\d:\d\d$/);
  expect(errors).toEqual([]);
});

test('copy edge light and counters stop when covered/off and never carry values into another account', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__copyDraws = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      const gl = original.call(this, type, ...args),
        canvas = this;
      if (type === 'webgl2' && gl && canvas.className === 'specular-button__light') {
        const draw = gl.drawArrays.bind(gl);
        gl.drawArrays = (...values) => {
          if (canvas.parentElement?.id === 'copy-report') window.__copyDraws++;
          return draw(...values);
        };
      }
      return gl;
    };
  });
  const { state, errors } = await setup(page);
  const main = page.locator('#main-total');
  await main.scrollIntoViewIfNeeded();
  await expect(main.locator('..')).toHaveClass('counter-host');
  const end = page.locator('input.meter-input[data-side="end"]').first();
  const initial = await end.inputValue();
  await end.evaluate(
    (element, value) => {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    },
    String(Number(initial) + 1),
  );
  await expect(main.locator('..')).toHaveAttribute('data-rolling', 'true');
  const transforms = () =>
    main
      .locator('..')
      .locator('.counter-numeral')
      .evaluateAll((nodes) => nodes.map((n) => n.style.transform).join('|'));
  const frame = await transforms();
  await page.waitForTimeout(100);
  expect(await transforms()).not.toBe(frame);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(main.locator('..')).toHaveAttribute('data-rolling', 'false');
  await expect(main).toHaveCSS('opacity', '1');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('#copy-report').scrollIntoViewIfNeeded();
  await expect(page.locator('#copy-report canvas')).toHaveCount(1);
  const box = await page.locator('#copy-report').boundingBox();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => window.__copyDraws)).toBeGreaterThan(0);
  await page.screenshot({ path: test.info().outputPath('copy-report-specular.png') });
  await page.locator('#report-workspace [data-open-raw-template]').click();
  await expect(page.locator('#raw-template-dialog')).toBeVisible();
  const covered = await page.evaluate(() => window.__copyDraws);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__copyDraws)).toBe(covered);
  await page.keyboard.press('Escape');
  await expect(page.locator('#raw-template-dialog')).toBeHidden();
  await page.locator('#application-surface').evaluate((element) => {
    element.dataset.panelMotion = 'off';
  });
  await expect(main.locator('..')).toHaveAttribute('data-rolling', 'false');
  await expect(main).toHaveCSS('opacity', '1');
  state.user = {
    ...owner,
    id: '9d631ad7-e244-4f49-a1cf-c715a56f317e',
    username: 'second-motion-test',
  };
  state.workspace = null;
  await page.evaluate(() =>
    dispatchEvent(new StorageEvent('storage', { key: 'midea_account_changed', newValue: 'test' })),
  );
  await expect(page.locator('#account-name')).toHaveText('second-motion-test');
  await expect(main).toHaveText('-');
  await expect(main.locator('..')).toHaveAttribute('data-rolling', 'false');
  await expect(page.locator('#copy-report canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
