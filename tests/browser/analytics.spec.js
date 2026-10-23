import { test, expect, openSignIn } from './fixtures.js';
import { readFile } from 'node:fs/promises';
import { PUBLIC_FILES } from '../../scripts/assets.mjs';
import { analyticsMarkup } from '../../scripts/analytics-config.mjs';

const origin = 'https://analytics.example.test';
const paths = { scriptSrc: '/test-intake/script.js', viewEndpoint: '/test-intake/view' };
const user = {
  id: 'b89c2b90-bbee-4a90-bd68-a0e9fc761352',
  username: 'PRIVATE_OPERATOR',
  role: 'operator',
  mustChangePassword: false,
};
// Exercise Vercel's documented queue/beforeSend contract without sending test visits.
const tracker =
  'const queue = window.vaq || []; let filter = e => e;' +
  'window.va = (kind, value) => {' +
  'if (kind === "beforeSend") { filter = value; return; }' +
  'const event = filter({ type: kind, url: location.href, payload: value });' +
  'if (event) fetch(document.querySelector("script[data-app-analytics]").dataset.viewEndpoint,' +
  '{ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) }); };' +
  'queue.forEach(args => window.va(...args)); window.va("pageview");';

async function serveApp(page, { enabled = true, blocked = false, off = false } = {}) {
  let signedIn = false;
  const errors = [];
  const views = [];
  const scripts = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const config = JSON.parse(await readFile('vercel.json', 'utf8'));
  const headers = Object.fromEntries(
    config.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]),
  );
  let html = await readFile('dist/index.html', 'utf8');
  if (enabled) html = html.replace('</head>', analyticsMarkup(paths) + '</head>');
  if (off) html = html.replace('<html lang="en">', '<html lang="en" data-analytics="off">');
  await page.route(origin + '/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === paths.scriptSrc) {
      scripts.push(request.url());
      return blocked
        ? route.abort('blockedbyclient')
        : route.fulfill({ contentType: 'text/javascript', body: tracker });
    }
    if (path === paths.viewEndpoint) {
      views.push(request.postDataJSON());
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/time')
      return route.fulfill({ status: 503, json: { error: 'TIME_UNAVAILABLE' } });
    if (path === '/api/auth') {
      if (request.method() === 'POST') signedIn = true;
      return route.fulfill({ json: { available: true, user: signedIn ? user : null } });
    }
    if (path === '/api/drafts') return route.fulfill({ json: { workspace: null, version: 0 } });
    if (path === '/') return route.fulfill({ contentType: 'text/html', headers, body: html });
    const file = path.slice(1);
    if (!PUBLIC_FILES.includes(file) && file !== 'build-info.json')
      return route.fulfill({ status: 404 });
    const type = file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.css')
        ? 'text/css'
        : file.endsWith('.json')
          ? 'application/json'
          : file.endsWith('.png')
            ? 'image/png'
            : 'image/webp';
    return route.fulfill({ contentType: type, headers, body: await readFile('dist/' + file) });
  });
  return { views, scripts, errors };
}

async function signInAndFill(page) {
  await openSignIn(page);
  await page.locator('#login-username').fill('PRIVATE_OPERATOR');
  await page.locator('#login-password').fill('Synthetic test password 123');
  await page.locator('#login-submit').click();
  await expect(page.locator('#meter-table')).toBeVisible();
  await page.locator('#load-example').click();
  await expect(page.locator('#report-preview')).not.toHaveValue('');
  return page.locator('#report-preview').inputValue();
}

test('production tracker receives one sanitized pageview, never login, readings or custom events', async ({
  page,
}) => {
  const state = await serveApp(page);
  await page.goto(origin + '/?username=PRIVATE_QUERY&reading=12345#PRIVATE_HASH');
  await expect.poll(() => state.views.length).toBe(1);
  expect(state.scripts).toHaveLength(1);
  expect(state.views).toEqual([{ type: 'pageview', url: origin + '/' }]);
  const report = await signInAndFill(page);
  await page.locator('#language-select').selectOption('zh-CN');
  await expect(page.locator('#report-preview')).toHaveValue(report);
  await page.locator('#language-select').selectOption('id');
  await expect(page.locator('#report-preview')).toHaveValue(report);
  await page.evaluate(() => {
    window.va('event', { name: 'PRIVATE_READING', data: { reading: '12345' } });
    window.va('pageview', { account: 'PRIVATE_ACCOUNT' });
  });
  expect(state.views).toHaveLength(1);
  expect(JSON.stringify(state.views)).not.toMatch(/PRIVATE|12345|password|reading|account/);
  expect(state.errors).toEqual([]);
});

test('blocked analytics does not prevent login, calculations, language switching or raw export', async ({
  page,
}) => {
  const state = await serveApp(page, { blocked: true });
  await page.goto(origin + '/');
  const report = await signInAndFill(page);
  await page.locator('#language-select').selectOption('id');
  await expect(page.locator('#report-preview')).toHaveValue(report);
  await page.locator('#language-select').selectOption('en');
  await page.locator('#open-raw-export').click();
  await expect(page.locator('#raw-export-preview')).not.toHaveValue('');
  expect(state.scripts).toHaveLength(1);
  expect(state.views).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('preview and HTML opt-out never download or initialize a tracker', async ({ page }) => {
  for (const options of [{ enabled: false }, { off: true }]) {
    await page.unrouteAll();
    const state = await serveApp(page, options);
    await page.goto(origin + '/');
    await expect(page.locator('#welcome-hero')).toBeVisible();
    await expect(page.locator('#login-form')).toBeHidden();
    await openSignIn(page);
    expect(state.scripts).toEqual([]);
    expect(state.views).toEqual([]);
    expect(await page.evaluate(() => typeof window.va)).toBe('undefined');
    expect(state.errors).toEqual([]);
  }
});
