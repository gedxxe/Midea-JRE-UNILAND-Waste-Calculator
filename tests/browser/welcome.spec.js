import { test, expect, openSignIn } from './fixtures.js';

const account = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'welcome-operator',
  role: 'operator',
  mustChangePassword: false,
};
async function setup(page, options = {}) {
  let user = options.user || null;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/time', (route) =>
    route.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } }),
  );
  await page.route('**/api/auth', (route) => {
    if (route.request().method() === 'POST')
      user = route.request().postDataJSON().action === 'login' ? account : null;
    return route.fulfill({ json: { available: true, user } });
  });
  return errors;
}
async function countTextFrames(page) {
  await page.addInitScript(() => {
    window.textFrames = 0;
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('energy-tech-canvas')) window.textFrames++;
      return clear.apply(this, args);
    };
  });
}
async function stopped(page) {
  await expect
    .poll(async () => {
      const before = await page.evaluate(() => window.textFrames);
      await page.waitForTimeout(200);
      return (await page.evaluate(() => window.textFrames)) === before;
    })
    .toBe(true);
}
async function moving(page) {
  const before = await page.evaluate(() => window.textFrames);
  await expect.poll(() => page.evaluate(() => window.textFrames)).toBeGreaterThan(before + 1);
}

test('dark welcome hides the form until keyboard entry and preserves its circle transition and back action', async ({
  page,
}, info) => {
  const errors = await setup(page);
  await page.goto('/');
  await expect(page.locator('#energy-title')).toHaveText('Energy Record');
  await expect(page.locator('#welcome-hero')).toBeVisible();
  await expect(page.locator('#application-surface')).toHaveAttribute('inert', '');
  await expect(page.locator('#login-form')).toBeHidden();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('.energy-brand img')).toHaveJSProperty('naturalWidth', 1448);
  await page.locator('#login-username').evaluate((el) => el.focus());
  await expect(page.locator('#login-username')).not.toBeFocused();
  for (const language of ['zh-CN', 'id', 'en']) {
    await page.locator('#welcome-language').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('#energy-title')).toHaveText('Energy Record');
    await expect(page.locator('#login-form')).toBeHidden();
  }
  await page.screenshot({ path: info.outputPath('energy-welcome.png'), fullPage: true });
  await page.locator('#open-login').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#application-surface')).toHaveClass('welcome-revealing');
  await expect(page.locator('#application-surface')).toHaveAttribute('inert', '');
  await expect(page.locator('#welcome-hero')).toBeHidden();
  await expect(page.locator('#login-username')).toBeFocused();
  await page.fill('#login-username', 'synthetic-name');
  await page.fill('#login-password', 'Synthetic password for welcome');
  await page.locator('#back-welcome').click();
  await expect(page.locator('#open-login')).toBeFocused();
  await expect(page.locator('#login-form')).toBeHidden();
  await openSignIn(page);
  await expect(page.locator('#login-username')).toHaveValue('synthetic-name');
  await expect(page.locator('#login-password')).toHaveValue('Synthetic password for welcome');
  await page.locator('#login-submit').click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('#report-workspace')).toBeVisible();
  await expect(page.locator('#welcome-hero')).toBeHidden();
  expect(errors).toEqual([]);
});

test('only the hovered letter changes and leaving restores every filled glyph', async ({
  page,
}, info) => {
  const errors = await setup(page);
  await countTextFrames(page);
  await page.goto('/');
  const word = page.locator('.energy-wordmark');
  await expect(word).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(1800);
  await stopped(page);
  const sample = () =>
    page.locator('.energy-tech-canvas').evaluate((el) => {
      const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      let hash = 2166136261;
      for (const value of data) hash = Math.imul(hash ^ value, 16777619);
      return hash >>> 0;
    });
  const baseline = await sample();
  // Find the first visible glyph from rendered pixels, independently of text layout math.
  const point = await page.locator('.energy-tech-canvas').evaluate((el) => {
    const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
    const occupied = Array.from({ length: el.width }, (_, x) => {
      for (let y = 0; y < el.height; y++) if (data[(y * el.width + x) * 4 + 3] > 220) return true;
      return false;
    });
    const first = occupied.indexOf(true);
    let end = first;
    while (occupied[end]) end++;
    const x = Math.floor((first + end) / 2);
    const rows = [];
    for (let y = 0; y < el.height; y++) if (data[(y * el.width + x) * 4 + 3] > 220) rows.push(y);
    const rect = el.getBoundingClientRect();
    return {
      right: end + 6,
      x: rect.left + (x * rect.width) / el.width,
      y: rect.top + (rows[Math.floor(rows.length / 2)] * rect.height) / el.height,
    };
  });
  const rest = () =>
    page.locator('.energy-tech-canvas').evaluate((el, right) => {
      const data = el.getContext('2d').getImageData(right, 0, el.width - right, el.height).data;
      let hash = 2166136261;
      for (const value of data) hash = Math.imul(hash ^ value, 16777619);
      return hash >>> 0;
    }, point.right);
  const unchangedLetters = await rest();
  await page.mouse.move(point.x, point.y);
  await expect(word).toHaveAttribute('data-active-letter', '0');
  await moving(page);
  expect(await sample()).not.toBe(baseline);
  expect(await rest()).toBe(unchangedLetters);
  await page.screenshot({ path: info.outputPath('hover-first-letter.png') });
  const box = await word.boundingBox();
  // Staying inside the wordmark but above the actual letters must not select a nearby glyph.
  await page.mouse.move(box.x + box.width / 2, box.y + 1);
  await expect(word).not.toHaveAttribute('data-active-letter');
  await expect.poll(sample).toBe(baseline);
  await stopped(page);
  await page.mouse.move(2, 2);
  await expect(word).not.toHaveAttribute('data-active-letter');
  expect(await sample()).toBe(baseline);
  expect(errors).toEqual([]);
});

async function asciiScene(page) {
  const errors = await setup(page);
  await page.addInitScript(() => {
    window.asciiDraws = 0;
    const draw = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      if (this.canvas.classList.contains('energy-ascii-canvas')) window.asciiDraws++;
      return draw.apply(this, args);
    };
  });
  await page.goto('/');
  const ascii = page.locator('.energy-ascii-canvas');
  await expect(ascii).toHaveAttribute('data-ready', 'true');
  const count = () => page.evaluate(() => window.asciiDraws);
  const still = async () => {
    await page.waitForTimeout(100);
    const before = await count();
    await page.waitForTimeout(200);
    expect(await count()).toBe(before);
  };
  const active = async () => {
    const before = await count();
    await expect.poll(count).toBeGreaterThan(before + 1);
  };
  return { errors, ascii, still, active };
}

test('ASCII rendering obeys resolution, frame bounds, pause, visibility, preferences and modal suspension', async ({
  page,
}) => {
  const { errors, ascii, still, active } = await asciiScene(page);
  expect(await ascii.evaluate((el) => el.width <= 1200 && el.height <= 720)).toBe(true);
  const cadence = await page.evaluate(async () => {
    const started = performance.now(),
      before = window.asciiDraws;
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { draws: window.asciiDraws - before, elapsed: performance.now() - started };
  });
  // Two draws per frame; allow two one-time resize/font paints, measured in the browser clock.
  expect(cadence.draws).toBeLessThanOrEqual(Math.ceil(cadence.elapsed / 50) * 2 + 4);
  await page.click('#pause-welcome');
  await still();
  await page.click('#pause-welcome');
  await active();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await still();
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await active();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await still();
  await expect(page.locator('#energy-title')).toHaveCSS('opacity', '1');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await active();
  await page.locator('[data-open-raw-template]:visible').click();
  await still();
  await page.locator('[data-close-dialog="raw-template-dialog"]').click();
  await active();
  await page.locator('#welcome-hero').evaluate((el) => {
    el.dataset.motion = 'off';
  });
  await still();
  await page.locator('#welcome-hero').evaluate((el) => {
    el.dataset.motion = 'on';
  });
  await active();
  expect(errors).toEqual([]);
});

test('ASCII lifecycle recreates Back views and stops behind login and authenticated accounts', async ({
  page,
}) => {
  const { errors, ascii, still, active } = await asciiScene(page);
  for (let i = 0; i < 2; i++) {
    await openSignIn(page);
    await still();
    await page.click('#back-welcome');
    await expect(ascii).toHaveAttribute('data-ready', 'true');
    await active();
  }
  await openSignIn(page);
  await page.fill('#login-username', account.username);
  await page.fill('#login-password', 'Synthetic password for welcome');
  await page.click('#login-submit');
  await expect(page.locator('#report-workspace')).toBeVisible();
  await still();
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('#logout');
  await expect(page.locator('#open-login')).toBeFocused();
  await expect(ascii).toHaveAttribute('data-ready', 'true');
  await active();
  await expect(page.locator('.meter-input').first()).toHaveValue('');
  expect(errors).toEqual([]);
});

for (const failure of ['module', 'canvas', 'webgl'])
  test(`${failure} failure retains the HTML title and functional sign-in`, async ({ page }) => {
    const errors = await setup(page);
    if (failure === 'module')
      await page.route('**/ui/welcome-tech.js', (route) => route.abort('failed'));
    else if (failure === 'webgl')
      await page.addInitScript(() => {
        const get = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          return type === 'webgl2' ? null : get.call(this, type, ...args);
        };
      });
    else
      await page.addInitScript(() => {
        HTMLCanvasElement.prototype.getContext = () => {
          throw new Error('Synthetic unavailable canvas');
        };
      });
    await page.goto('/');
    if (failure === 'webgl') {
      await expect(page.locator('.energy-wordmark')).toHaveAttribute('data-ready', 'true');
      await expect(page.locator('.energy-ascii-canvas')).toHaveCSS('opacity', '0');
    } else await expect(page.locator('#energy-title')).toHaveCSS('opacity', '1');
    await expect(page.locator('#login-form')).toBeHidden();
    await openSignIn(page);
    await page.fill('#login-username', account.username);
    await page.fill('#login-password', 'Synthetic password for welcome');
    await page.click('#login-submit');
    await expect(page.locator('#report-workspace')).toBeVisible();
    expect(errors).toEqual([]);
  });

test('reduced motion and interrupted circle reveals leave a usable form without horizontal overflow', async ({
  page,
}) => {
  const errors = await setup(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const size of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    for (const language of ['en', 'zh-CN', 'id']) {
      await page.selectOption('#welcome-language', language);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await openSignIn(page);
      await expect(page.locator('#application-surface')).not.toHaveClass('welcome-revealing');
      await expect(page.locator('#login-username')).toBeFocused();
      await page.click('#back-welcome');
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const button = document.getElementById('open-login');
    button.click();
    button.click();
  });
  await expect(page.locator('#application-surface')).toHaveClass('welcome-revealing');
  await page.setViewportSize({ width: 720, height: 500 });
  await expect(page.locator('#login-username')).toBeFocused();
  await expect(page.locator('#application-surface')).not.toHaveClass('welcome-revealing');
  await page.click('#back-welcome');
  await page.evaluate(() => document.getElementById('open-login').click());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#login-username')).toBeFocused();
  expect(errors).toEqual([]);
});

test('required password gates bypass the welcome while an existing session opens its requested route', async ({
  page,
}) => {
  const errors = await setup(page, { user: { ...account, mustChangePassword: true } });
  await page.goto('/app/monitoring');
  await expect(page.locator('#password-required')).toBeVisible();
  await expect(page.locator('#welcome-hero')).toBeHidden();
  await expect(page.locator('#back-welcome')).toBeHidden();
  await expect(page.locator('#report-workspace')).toBeHidden();
  await expect(page.locator('#current-password')).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test('HTML motion-off leaves visible controls and offscreen text does not keep drawing', async ({
  page,
}) => {
  const errors = await setup(page);
  await countTextFrames(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.textFrames)).toBeGreaterThan(2);
  await page.setViewportSize({ width: 900, height: 180 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(() =>
      page.locator('.energy-wordmark').evaluate((el) => el.getBoundingClientRect().bottom),
    )
    .toBeLessThan(0);
  await stopped(page);
  await page.locator('.energy-wordmark').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1800);
  await stopped(page);
  await page.locator('#welcome-hero').evaluate((el) => {
    el.dataset.motion = 'off';
  });
  await stopped(page);
  await expect(page.locator('.energy-topline')).toHaveCSS('opacity', '1');
  await expect(page.locator('.energy-bottomline')).toHaveCSS('opacity', '1');
  await expect(page.locator('#pause-welcome')).toBeHidden();
  await openSignIn(page);
  await expect(page.locator('#application-surface')).not.toHaveClass('welcome-revealing');
  expect(errors).toEqual([]);
});

test('pausing before decoration finishes loading keeps the complete title visible', async ({
  page,
}) => {
  await setup(page);
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/ui/welcome-tech.js', async (route) => {
    await hold;
    await route.continue();
  });
  await page.goto('/');
  await page.click('#pause-welcome');
  release();
  await expect(page.locator('.energy-wordmark')).toHaveAttribute('data-ready', 'true');
  expect(
    await page.locator('.energy-tech-canvas').evaluate((el) => {
      const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      return data.some((value, index) => index % 4 === 3 && value > 220);
    }),
  ).toBe(true);
  await expect(page.locator('#pause-welcome')).toHaveAttribute('aria-pressed', 'true');
  await openSignIn(page);
});

test('ASCII remains a single controller when both text and magnet modules fail', async ({
  page,
}) => {
  const errors = await setup(page);
  await page.addInitScript(() => {
    window.asciiContexts = 0;
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl2' && this.classList.contains('energy-ascii-canvas'))
        window.asciiContexts++;
      return get.call(this, type, ...args);
    };
  });
  await page.route('**/ui/welcome-tech.js', (route) => route.abort('failed'));
  await page.route('**/ui/welcome-magnet.js', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('.energy-ascii-canvas')).toHaveAttribute('data-ready', 'true');
  await page.selectOption('#welcome-language', 'zh-CN');
  await page.click('#pause-welcome');
  await page.click('#pause-welcome');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.asciiContexts)).toBe(1);
  await expect(page.locator('#energy-title')).toHaveCSS('opacity', '1');
  await openSignIn(page);
  expect(errors).toEqual([]);
});
