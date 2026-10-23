// Fixed presentation routes only. Never store account or reading data in URLs.
export const APP_ROUTES = [
  { view: 'welcome', path: '/', title: 'routeWelcome' },
  { view: 'reading', path: '/app', title: 'routeReading' },
  {
    view: 'monitoring',
    path: '/app/monitoring',
    title: 'routeMonitoring',
    dialog: 'graphs-dialog',
  },
  { view: 'history', path: '/app/history', title: 'routeHistory', dialog: 'history-dialog' },
  {
    view: 'accounts',
    path: '/app/accounts',
    title: 'routeAccounts',
    dialog: 'users-dialog',
    admin: true,
  },
];
export function routeForPath(path) {
  if (path === '/index.html') path = '/';
  if (typeof path !== 'string') return null;
  if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1);
  return APP_ROUTES.find((route) => route.path === path) || null;
}
