import { test, expect, openSignIn } from './fixtures.js';
const account = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'motion-operator',
  role: 'operator',
  mustChangePassword: false,
};
async function setup(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/time', (r) =>
    r.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/auth', (r) => r.fulfill({ json: { available: true, user: null } }));
  return errors;
}
test('Back contracts the same circle, keeps both surfaces inert and preserves form values', async ({
  page,
}, info) => {
  const errors = await setup(page);
  await page.goto('/');
  await page.locator('#open-login').evaluate((el) => el.click());
  const forward = await page.locator('#application-surface').evaluate((el) =>
    el
      .getAnimations()[0]
      .effect.getKeyframes()
      .map((k) => k.clipPath),
  );
  await expect(page.locator('#login-username')).toBeFocused();
  await page.fill('#login-username', 'synthetic-name');
  await page.fill('#login-password', 'Synthetic test password');
  await page.locator('#back-welcome').evaluate((el) => el.click());
  const surface = page.locator('#application-surface');
  const reverse = await surface.evaluate((el) =>
    el
      .getAnimations()[0]
      .effect.getKeyframes()
      .map((k) => k.clipPath),
  );
  expect(reverse).toEqual([...forward].reverse());
  await expect(surface).toHaveAttribute('inert', '');
  await expect(page.locator('#welcome-hero')).toHaveAttribute('inert', '');
  await expect(page.locator('#report-workspace')).toBeHidden();
  await page.screenshot({ path: info.outputPath('reverse-circle.png') });
  await expect(page.locator('#open-login')).toBeFocused();
  await expect(surface).toBeHidden();
  await expect(page.locator('#welcome-hero')).not.toHaveAttribute('inert', '');
  await openSignIn(page);
  await expect(page.locator('#login-username')).toHaveValue('synthetic-name');
  await expect(page.locator('#login-password')).toHaveValue('Synthetic test password');
  expect(errors).toEqual([]);
});
for (const interruption of ['resize', 'reduced', 'hidden', 'motion-off'])
  test('reverse reveal settles safely after ' + interruption, async ({ page }) => {
    const errors = await setup(page);
    await page.goto('/');
    await openSignIn(page);
    await page.locator('#back-welcome').evaluate((el) => el.click());
    await expect(page.locator('#application-surface')).toHaveClass('welcome-revealing');
    if (interruption === 'resize') await page.setViewportSize({ width: 720, height: 500 });
    else if (interruption === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
    else if (interruption === 'hidden')
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    else
      await page.locator('#welcome-hero').evaluate((el) => {
        el.dataset.motion = 'off';
      });
    await expect(page.locator('body')).toHaveAttribute('data-welcome', 'hero');
    await expect(page.locator('#application-surface')).toBeHidden();
    await expect(page.locator('#application-surface')).not.toHaveClass('welcome-revealing');
    await expect(page.locator('#welcome-hero')).not.toHaveAttribute('inert', '');
    if (interruption === 'hidden')
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
    else await expect(page.locator('#open-login')).toBeFocused();
    await openSignIn(page);
    await expect(page.locator('#login-username')).toBeFocused();
    expect(errors).toEqual([]);
  });
test('a real session update supersedes an in-flight reverse reveal', async ({ page }) => {
  const errors = await setup(page);
  let release;
  await page.route('**/api/auth', async (r) => {
    if (r.request().method() === 'GET') return r.fulfill({ json: { available: true, user: null } });
    await new Promise((resolve) => {
      release = resolve;
    });
    return r.fulfill({ json: { available: true, user: account } });
  });
  await page.goto('/app');
  await openSignIn(page);
  await page.fill('#login-username', account.username);
  await page.fill('#login-password', 'Synthetic test password');
  await page.click('#login-submit');
  await expect(page.locator('#signin-transition')).toBeVisible();
  await page.locator('#back-welcome').evaluate((el) => el.click());
  await expect(page.locator('#application-surface')).toHaveAttribute('inert', '');
  release();
  await expect(page.locator('#report-workspace')).toBeVisible();
  await expect(page.locator('#welcome-hero')).toBeHidden();
  await expect(page.locator('#application-surface')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#application-surface')).not.toHaveClass('welcome-revealing');
  await expect(page).toHaveURL(/\/app$/);
  await page.waitForTimeout(900);
  await expect(page.locator('#welcome-hero')).toBeHidden();
  await expect(page.locator('#back-welcome')).toBeHidden();
  expect(errors).toEqual([]);
});
test('ASCII cursor scrambling changes rendered pixels and settles without an autonomous-clock difference', async ({
  page,
}) => {
  const errors = await setup(page);
  await page.addInitScript(() => {
    const proto = WebGL2RenderingContext.prototype,
      names = new WeakMap();
    const locate = proto.getUniformLocation,
      scalar = proto.uniform1f,
      draw = proto.drawArrays;
    proto.getUniformLocation = function (program, name) {
      const location = locate.call(this, program, name);
      if (location) names.set(location, name);
      return location;
    };
    proto.uniform1f = function (location, value) {
      const name = names.get(location);
      if (['uTime', 'uGlyphTime', 'uFrame'].includes(name)) value = 0;
      if (name === 'uIntro') value = 1;
      return scalar.call(this, location, value);
    };
    window.captureAscii = false;
    proto.drawArrays = function (...args) {
      const result = draw.apply(this, args);
      if (
        window.captureAscii &&
        this.canvas.classList.contains('energy-ascii-canvas') &&
        !this.getParameter(this.FRAMEBUFFER_BINDING)
      ) {
        const pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4);
        this.readPixels(
          0,
          0,
          this.canvas.width,
          this.canvas.height,
          this.RGBA,
          this.UNSIGNED_BYTE,
          pixels,
        );
        let hash = 2166136261,
          bright = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          hash = Math.imul(hash ^ pixels[i], 16777619);
          hash = Math.imul(hash ^ pixels[i + 1], 16777619);
          if (pixels[i + 2] > 80) bright++;
        }
        window.asciiSample = { hash: hash >>> 0, bright };
        window.captureAscii = false;
      }
      return result;
    };
  });
  await page.goto('/');
  await expect(page.locator('.energy-ascii-canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.energy-ascii-canvas')).toHaveCSS('opacity', '1');
  async function sample() {
    await page.evaluate(() => {
      window.captureAscii = true;
    });
    await expect.poll(() => page.evaluate(() => window.captureAscii)).toBe(false);
    return page.evaluate(() => window.asciiSample);
  }
  const baseline = await sample();
  expect(baseline.bright).toBeGreaterThan(100);
  expect((await sample()).hash).toBe(baseline.hash);
  const box = await page.locator('#welcome-hero').boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.2);
  await expect.poll(async () => (await sample()).hash).not.toBe(baseline.hash);
  await page.mouse.move(-1, -1);
  await expect.poll(async () => (await sample()).hash).toBe(baseline.hash);
  expect(errors).toEqual([]);
});
