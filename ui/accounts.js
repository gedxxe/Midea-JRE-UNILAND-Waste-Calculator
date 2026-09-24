import { $, node } from './dom.js';
import { t } from '../i18n/index.js';

export function createAccounts({ current, loadDraft, identityChanged, toast }) {
  let user = null;
  let available = false;
  let ready = false;
  let generation = 0;
  let refreshSequence = 0;
  let page = 0;
  let hasMore = false;
  let selected = null;
  let links = {};
  let busy = false;
  let lastError = null;
  const eventKey = 'midea_account_changed';

  function applyIdentity(next) {
    refreshSequence++;
    const changed = !ready || user?.id !== next?.id;
    lastError = null;
    user = next;
    ready = true;
    if (changed) {
      generation++;
      links = {};
      selected = null;
      $('history-list').replaceChildren();
      $('users-list').replaceChildren();
      $('history-snapshot').value = '';
      $('temporary-password').value = '';
      $('history-dialog').close();
      $('users-dialog').close();
      identityChanged(user);
    }
    render();
  }
  function signalChange() {
    try {
      localStorage.setItem(eventKey, crypto.randomUUID());
    } catch {
      /* Same-tab auth still works. */
    }
  }
  async function request(path, { body, personal = true } = {}) {
    const epoch = generation;
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (personal && user) headers['X-Meter-User'] = user.id;
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const value = await response.json();
    if (epoch !== generation) throw new Error('ACCOUNT_CHANGED');
    if (!response.ok) {
      if (value.error === 'LOGIN_REQUIRED' || value.error === 'ACCOUNT_CHANGED') {
        applyIdentity(null);
        void refresh();
      }
      if (value.error === 'PASSWORD_CHANGE_REQUIRED') void refresh();
      throw new Error(value.error || 'SERVICE_UNAVAILABLE');
    }
    return value;
  }
  function errorMessage(error) {
    const known = [
      'INVALID_CREDENTIALS',
      'INVALID_USERNAME',
      'INVALID_PASSWORD',
      'PASSWORD_UNCHANGED',
      'RATE_LIMITED',
      'LOGIN_REQUIRED',
      'PASSWORD_CHANGE_REQUIRED',
      'REVISION_CONFLICT',
      'ALREADY_EXISTS',
      'INCOMPLETE_REPORT',
      'ACCOUNT_CHANGED',
      'NOT_FOUND',
      'FORBIDDEN',
      'NOT_CONFIGURED',
      'PERIOD_CHANGED',
    ];
    return t('error_' + (known.includes(error.message) ? error.message : 'SERVICE_UNAVAILABLE'));
  }
  async function action(run) {
    if (busy) return;
    lastError = null;
    busy = true;
    render();
    try {
      await run();
    } catch (error) {
      toast(errorMessage(error));
      lastError = error;
    } finally {
      busy = false;
      render();
    }
  }
  async function refresh() {
    const sequence = ++refreshSequence;
    const epoch = generation;
    try {
      const response = await fetch('/api/auth', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('SERVICE_UNAVAILABLE');
      const data = await response.json();
      if (sequence !== refreshSequence || epoch !== generation) return;
      available = data.available;
      applyIdentity(data.user);
    } catch {
      if (sequence !== refreshSequence || epoch !== generation) return;
      available = false;
      if (!ready) applyIdentity(null);
      else render();
    }
  }
  function render() {
    for (const element of document.querySelectorAll(
      '#login-form input, #password-form input, #create-user-form input, #create-user-form button, #users-list button, #history-list button, #open-history, #open-users, #load-revision, #use-history, #history-plant, #change-password',
    ))
      element.disabled = busy;
    $('history-previous').disabled = busy || page === 0;
    $('history-next').disabled = busy || !hasMore;
    $('account-status').textContent = lastError
      ? errorMessage(lastError)
      : available
        ? ''
        : t('accountUnavailable');
    $('login-form').hidden = !!user || !available;
    $('account-session').hidden = !user;
    $('account-name').textContent = user?.username || '';
    $('password-form').hidden =
      !user || (!user.mustChangePassword && !$('password-form').dataset.open);
    $('password-required').hidden = !user?.mustChangePassword;
    $('cloud-actions').hidden = !user || user.mustChangePassword;
    $('open-users').hidden = user?.role !== 'admin';
    $('save-report').disabled = busy || !available || !user || user.mustChangePassword;
    $('login-submit').disabled = busy;
    $('password-submit').disabled = busy;
    $('logout').disabled = busy;
    $('account-label').textContent = t(user ? 'accountSignedIn' : 'accountTitle');
    $('account-hint').textContent = t(user ? 'accountPrivate' : 'accountHint');
  }
  $('login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void action(async () => {
      const data = await request('/api/auth', {
        personal: false,
        body: {
          action: 'login',
          username: $('login-username').value,
          password: $('login-password').value,
        },
      });
      $('login-password').value = '';
      $('account-status').textContent = '';
      applyIdentity(data.user);
      signalChange();
      if (data.user.mustChangePassword) $('current-password').focus();
    });
  });
  $('logout').addEventListener(
    'click',
    () =>
      void action(async () => {
        if (!confirm(t('logoutConfirm'))) return;
        await request('/api/auth', { body: { action: 'logout' } });
        applyIdentity(null);
        $('password-form').dataset.open = '';
        $('password-form').reset();
        signalChange();
        toast(t('loggedOut'));
      }),
  );
  $('change-password').addEventListener('click', () => {
    $('password-form').dataset.open = '1';
    render();
    $('current-password').focus();
  });
  $('password-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void action(async () => {
      if ($('new-password').value !== $('confirm-password').value)
        throw new Error('INVALID_PASSWORD');
      const data = await request('/api/auth', {
        body: {
          action: 'changePassword',
          currentPassword: $('current-password').value,
          password: $('new-password').value,
        },
      });
      $('password-form').reset();
      $('password-form').dataset.open = '';
      applyIdentity(data.user);
      signalChange();
      toast(t('passwordChanged'));
    });
  });
  $('save-report').addEventListener(
    'click',
    () =>
      void action(async () => {
        const draft = structuredClone(current());
        const previous = links[draft.plantKey];
        const samePeriod =
          previous?.startDate === draft.startDate && previous?.endDate === draft.endDate;
        const body = {
          draft,
          ...(samePeriod ? { id: previous.id, baseRevision: previous.revision } : {}),
        };
        const result = await request('/api/reports', { body });
        links[draft.plantKey] = {
          id: result.id,
          revision: result.revision,
          startDate: draft.startDate,
          endDate: draft.endDate,
        };
        toast(t('reportSaved', { revision: result.revision }));
      }),
  );
  async function history() {
    const filter = $('history-plant').value;
    const data = await request(
      '/api/reports?page=' + page + '&plant=' + encodeURIComponent(filter),
    );
    $('history-list').replaceChildren();
    for (const item of data.reports) {
      const row = node('li', '', 'history-row');
      const text = node(
        'span',
        item.plant + ' · ' + item.start_date + ' → ' + item.end_date + ' · v' + item.revision,
      );
      const button = node('button', t('openReport'), 'button secondary');
      button.addEventListener('click', () => void action(() => openReport(item.id)));
      row.append(text, button);
      $('history-list').append(row);
    }
    $('history-empty').hidden = data.reports.length > 0;
    $('history-previous').disabled = page === 0;
    hasMore = data.hasMore;
    $('history-next').disabled = !data.hasMore;
    $('history-page').textContent = String(page + 1);
  }
  async function openReport(id, revision) {
    const data = await request(
      '/api/reports?id=' + encodeURIComponent(id) + (revision ? '&revision=' + revision : ''),
    );
    selected = data;
    $('history-detail').hidden = false;
    $('history-revision').value = data.revision;
    $('history-revision').max = data.latestRevision;
    $('history-version').textContent = t('storedVersion', {
      version: data.snapshot.engineVersion,
      latest: data.latestRevision,
    });
    $('history-snapshot').value = data.snapshot.output.reportText;
  }
  $('open-history').addEventListener(
    'click',
    () =>
      void action(async () => {
        page = 0;
        selected = null;
        $('history-detail').hidden = true;
        $('history-dialog').showModal();
        await history();
      }),
  );
  $('history-plant').addEventListener(
    'change',
    () =>
      void action(async () => {
        page = 0;
        await history();
      }),
  );
  $('history-previous').addEventListener(
    'click',
    () =>
      void action(async () => {
        page = Math.max(0, page - 1);
        await history();
      }),
  );
  $('history-next').addEventListener(
    'click',
    () =>
      void action(async () => {
        page++;
        await history();
      }),
  );
  $('load-revision').addEventListener(
    'click',
    () =>
      void action(async () => {
        if (selected) await openReport(selected.id, $('history-revision').value);
      }),
  );
  $('use-history').addEventListener('click', () => {
    if (!selected || !confirm(t('loadReportConfirm'))) return;
    const draft = selected.snapshot.draft;
    links[draft.plantKey] = {
      id: selected.id,
      revision: selected.latestRevision,
      startDate: draft.startDate,
      endDate: draft.endDate,
    };
    loadDraft(structuredClone(draft));
    $('history-dialog').close();
    toast(t('reportLoaded'));
  });
  async function users() {
    const data = await request('/api/users');
    $('users-list').replaceChildren();
    for (const item of data.users) {
      const row = node('li', '', 'history-row');
      row.append(
        node(
          'span',
          item.username +
            ' · ' +
            item.role +
            ' · ' +
            t(item.active ? 'userActive' : 'userDisabled'),
        ),
      );
      if (item.role !== 'admin') {
        const controls = node('div', '', 'account-buttons');
        const reset = node('button', t('resetPassword'), 'button secondary');
        reset.addEventListener(
          'click',
          () =>
            void action(async () => {
              if (!confirm(t('resetConfirm', { username: item.username }))) return;
              const result = await request('/api/users', {
                body: { action: 'resetPassword', id: item.id },
              });
              showTemporary(item.username, result.temporaryPassword);
              await users();
            }),
        );
        const toggle = node(
          'button',
          t(item.active ? 'disableUser' : 'enableUser'),
          'button secondary',
        );
        toggle.addEventListener(
          'click',
          () =>
            void action(async () => {
              if (!confirm(t('statusConfirm', { username: item.username }))) return;
              await request('/api/users', {
                body: { action: 'setActive', id: item.id, active: !item.active },
              });
              await users();
            }),
        );
        controls.append(reset, toggle);
        row.append(controls);
      }
      $('users-list').append(row);
    }
  }
  function showTemporary(name, password) {
    $('temporary-result').hidden = false;
    $('temporary-name').textContent = name;
    $('temporary-password').value = password;
  }
  $('open-users').addEventListener(
    'click',
    () =>
      void action(async () => {
        $('temporary-result').hidden = true;
        $('temporary-password').value = '';
        $('users-dialog').showModal();
        await users();
      }),
  );
  $('users-dialog').addEventListener('close', () => {
    $('temporary-password').value = '';
    $('temporary-result').hidden = true;
  });
  $('create-user-form').addEventListener('submit', (event) => {
    event.preventDefault();
    void action(async () => {
      const name = $('new-username').value;
      const result = await request('/api/users', { body: { action: 'create', username: name } });
      showTemporary(name, result.temporaryPassword);
      $('create-user-form').reset();
      await users();
    });
  });
  for (const button of document.querySelectorAll('[data-close-dialog]'))
    button.addEventListener('click', () => $(button.dataset.closeDialog).close());
  window.addEventListener('storage', (event) => {
    if (event.key === eventKey) {
      applyIdentity(null);
      void refresh();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
  return { start: refresh, render, getUser: () => user };
}
