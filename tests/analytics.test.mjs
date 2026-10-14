import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsPaths, pageViewFilter } from '../analytics.js';
import { analyticsBuildConfig, analyticsMarkup } from '../scripts/analytics-config.mjs';

const legacy = { scriptSrc: '/_vercel/insights/script.js', viewEndpoint: '/_vercel/insights/view' };
const production = { VERCEL: '1', VERCEL_ENV: 'production' };

test('analytics is absent from local, CI and preview builds and has a production off switch', () => {
  for (const env of [
    {},
    { CI: 'true' },
    { VERCEL_ENV: 'production' },
    { VERCEL: '1', VERCEL_ENV: 'preview' },
    { VERCEL: '1', VERCEL_ENV: 'development' },
    { ...production, WEB_ANALYTICS: 'off' },
  ]) {
    assert.equal(analyticsBuildConfig(env), null);
    assert.equal(analyticsMarkup(analyticsBuildConfig(env)), '');
  }
  assert.deepEqual(analyticsBuildConfig(production), legacy);
});

test('build publishes only validated intake paths, never other observability configuration', () => {
  const paths = { scriptSrc: '/random-intake/script.js', viewEndpoint: '/random-intake/view' };
  const config = {
    analytics: {
      ...paths,
      dsn: 'PRIVATE_DSN',
      sessionEndpoint: '/private',
      extra: 'PRIVATE_VALUE',
    },
    secret: 'PRIVATE_SECRET',
  };
  const result = analyticsBuildConfig({
    ...production,
    VERCEL_OBSERVABILITY_CLIENT_CONFIG: JSON.stringify(config),
  });
  assert.deepEqual(result, paths);
  const markup = analyticsMarkup(result);
  assert.doesNotMatch(markup, /PRIVATE|sessionEndpoint|dsn|secret/);
  assert.match(markup, /random-intake/);
  for (const value of ['not JSON', '{}', '{"analytics":null}']) {
    assert.equal(
      analyticsBuildConfig({ ...production, VERCEL_OBSERVABILITY_CLIENT_CONFIG: value }),
      null,
    );
  }
});

test('intake configuration fails closed on external, encoded, mismatched and injected paths', () => {
  for (const src of [
    '//evil.example/script.js',
    'https://evil.example/script.js',
    '/a/../script.js',
    '/%2f/script.js',
    '/a/script.js?token=secret',
    '/a/script.js#secret',
    '/a/" onload="bad/script.js',
    '/a\\script.js',
    '/a/script.js/',
  ]) {
    assert.equal(analyticsPaths({ scriptSrc: src, viewEndpoint: '/a/view' }), null);
  }
  assert.equal(analyticsPaths({ ...legacy, viewEndpoint: 'https://evil.example/view' }), null);
  for (const config of [null, [], 'text', { ...legacy, viewEndpoint: '/wrong/view' }]) {
    assert.equal(analyticsPaths(config), null);
    assert.equal(analyticsMarkup(config), '');
  }
});

test('only one root pageview passes, without URL secrets, payloads or custom events', () => {
  const origin = 'https://energy.example.test';
  const filter = pageViewFilter(origin);
  for (const event of [
    null,
    {},
    { type: 'event', url: origin + '/', payload: { username: 'PRIVATE_USER' } },
    { type: 'pageview', url: 'invalid' },
    { type: 'pageview', url: 'https://evil.example/' },
    { type: 'pageview', url: origin + '/users/PRIVATE_USER' },
  ]) {
    assert.equal(filter(event), null);
  }
  const safe = filter({
    type: 'pageview',
    url: origin + '/index.html?username=PRIVATE_USER&reading=12345#PRIVATE_TOKEN',
    payload: { password: 'PRIVATE_PASSWORD' },
    __cdp: { account: 'PRIVATE_ACCOUNT' },
  });
  assert.deepEqual(safe, { type: 'pageview', url: origin + '/' });
  assert.doesNotMatch(JSON.stringify(safe), /PRIVATE|12345|payload|__cdp/);
  assert.equal(filter({ type: 'pageview', url: origin + '/' }), null);
});
