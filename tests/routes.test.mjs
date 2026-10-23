import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APP_ROUTES, routeForPath } from '../routes.js';
import { pageViewFilter } from '../analytics.js';

test('only fixed application paths resolve; rewrites never swallow API or private files', () => {
  const expected = APP_ROUTES.filter((route) => route.path !== '/').flatMap((route) => [
    route.path,
    route.path + '/',
  ]);
  const rewrites = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).rewrites;
  assert.deepEqual(rewrites.map((rule) => rule.source).sort(), expected.sort());
  assert.ok(rewrites.every((rule) => rule.destination === '/index.html'));
  for (const route of APP_ROUTES) {
    assert.equal(routeForPath(route.path), route);
    if (route.path !== '/') assert.equal(routeForPath(route.path + '/'), route);
  }
  assert.equal(routeForPath('/index.html').view, 'welcome');
  for (const path of [
    null,
    {},
    '/api/auth',
    '/server/auth.js',
    '/.env.local',
    '/app/unknown',
    '/app/history/report',
    '/app//',
    '/%61pp',
    '//evil.example',
    '/app?user=x',
  ])
    assert.equal(routeForPath(path), null);
});

test('application routes never expand production pageview collection', () => {
  const origin = 'https://energy.example.test';
  const filter = pageViewFilter(origin);
  for (const route of APP_ROUTES.filter((route) => route.path !== '/'))
    assert.equal(filter({ type: 'pageview', url: origin + route.path }), null);
  assert.deepEqual(filter({ type: 'pageview', url: origin + '/' }), {
    type: 'pageview',
    url: origin + '/',
  });
});
