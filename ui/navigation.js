import { APP_ROUTES, routeForPath } from '../routes.js';
import { t } from '../i18n/index.js';
import { $ } from './dom.js';

// Route presentation only; session and ownership checks remain in the APIs.
export function createNavigation({ getState, open }) {
  const reading = APP_ROUTES.find((route) => route.view === 'reading');
  let pending = routeForPath(location.pathname);
  let account = null;
  let token = crypto.randomUUID();
  let applying = false;
  let scheduled = false;
  let shownPath = null;
  let shownIdentity;
  let shownAccess = false;
  let needsOpen = null;
  const allowed = (route, user) => route && (!route.admin || user?.role === 'admin');
  const canEnter = (state) => state.ready && state.user && !state.user.mustChangePassword;
  function title(route) {
    document.title = t(route.title) + ' | Midea';
  }
  function write(method, route, parent = null) {
    history[method + 'State']({ meterNavigation: token, parent }, '', route.path);
  }
  function apply() {
    const state = getState();
    if (!state.ready) return;
    if (account && account !== state.user?.id) {
      pending = null;
      token = crypto.randomUUID();
    }
    account = state.user?.id || null;
    let route = routeForPath(location.pathname);
    if (!canEnter(state)) {
      route = APP_ROUTES[0];
      if (location.pathname !== '/') write('replace', route);
    } else {
      if (!route || route.view === 'welcome') {
        route = allowed(pending, state.user) && pending.view !== 'welcome' ? pending : reading;
        pending = null;
        write('replace', route);
      } else if (!allowed(route, state.user)) {
        route = reading;
        write('replace', route);
      } else if (location.pathname !== route.path) write('replace', route);
      pending = null;
    }
    title(route);
    const access = !!canEnter(state);
    const changed =
      shownPath !== route.path || shownIdentity !== state.user?.id || shownAccess !== access;
    shownPath = route.path;
    shownIdentity = state.user?.id;
    shownAccess = access;
    if (changed) needsOpen = access && route.dialog ? route.path : null;
    applying = true;
    try {
      if (changed)
        for (const dialog of document.querySelectorAll('dialog[open]'))
          if (dialog.id !== route.dialog) dialog.close();
      if (needsOpen === route.path && route.dialog) {
        if (!$(route.dialog).open) open(route.view);
        if ($(route.dialog).open) needsOpen = null;
      }
    } finally {
      applying = false;
    }
  }
  function sync() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  }
  function opened(view) {
    if (applying) return;
    const state = getState();
    const route = APP_ROUTES.find((item) => item.view === view);
    if (!canEnter(state) || !allowed(route, state.user)) return;
    let previous = routeForPath(location.pathname);
    if (!previous || previous.view === 'welcome') {
      previous = reading;
      write('replace', reading);
    }
    if (previous.path !== route.path) write('push', route, previous.path);
    title(route);
    sync();
  }
  for (const route of APP_ROUTES.filter((item) => item.dialog))
    $(route.dialog).addEventListener('close', () => {
      if ($(route.dialog).open || location.pathname !== route.path) return;
      const state = getState();
      if (!canEnter(state)) return sync();
      const parent = routeForPath(history.state?.parent);
      if (history.state?.meterNavigation === token && allowed(parent, state.user)) history.back();
      else {
        write('replace', reading);
        sync();
      }
    });
  window.addEventListener('popstate', sync);
  document.querySelector('.brand').addEventListener('click', (event) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!canEnter(getState())) return;
    event.preventDefault();
    if (location.pathname !== reading.path) write('push', reading);
    sync();
  });
  return { opened, sync };
}
