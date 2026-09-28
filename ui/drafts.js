import { $ } from './dom.js';
import { t } from '../i18n/index.js';
import { STORAGE_KEY, restoreWorkspace } from '../storage.js';

// One replaceable workspace per account. Local recovery is immediate; remote writes are coalesced.
export function createDraftAutosave({ request, read, apply, localSaved }) {
  let user,
    epoch = 0,
    version = 0,
    dirty = false,
    ready = false,
    conflict = false,
    localOk = true;
  let timer,
    pending,
    lastSynced = '',
    firstDirty = 0,
    lastAttempt = 0,
    retry = 30000,
    state = 'draftIdle';
  const key = () => STORAGE_KEY + '_' + user.id;
  const raw = () => JSON.stringify(read());
  function render() {
    if (!user) return;
    $('save-status').textContent = t(state);
    $('draft-sync-actions').hidden =
      !conflict && !['draftOffline', 'draftLocalError'].includes(state);
    $('draft-load-cloud').hidden = !conflict;
    $('draft-keep-local').hidden = !conflict;
    $('draft-retry').hidden = conflict;
  }
  function status(next) {
    state = !localOk && ['draftPending', 'draftOffline'].includes(next) ? 'draftLocalError' : next;
    render();
  }
  function backup() {
    if (!user) return;
    try {
      sessionStorage.setItem(key(), raw());
      sessionStorage.setItem(key() + '_sync', JSON.stringify({ version, pending: dirty }));
      localOk = true;
      localSaved();
    } catch {
      localOk = false;
      status('draftLocalError');
    }
  }
  function schedule(delay) {
    clearTimeout(timer);
    if (!user || !dirty || conflict || pending) return;
    timer = setTimeout(
      () => void flush(),
      delay ??
        Math.max(
          0,
          30000 - (performance.now() - lastAttempt),
          Math.min(30000, 120000 - (performance.now() - firstDirty)),
        ),
    );
  }
  async function remote() {
    return request('/api/drafts', { signal: AbortSignal.timeout(20000) });
  }
  async function initialize() {
    const identity = epoch;
    status('draftLoading');
    try {
      const saved = await remote();
      if (identity !== epoch) return false;
      const same = saved.workspace && JSON.stringify(saved.workspace) === raw();
      if (dirty && !same && saved.version !== version) {
        conflict = true;
        status('draftConflict');
        return false;
      }
      if (!dirty && saved.workspace) apply(restoreWorkspace(JSON.stringify(saved.workspace)));
      if (!dirty && !saved.workspace && saved.version !== version) apply(null);
      version = saved.version;
      ready = true;
      if (same) dirty = false;
      if (!dirty) lastSynced = raw();
      if (dirty || saved.workspace) backup();
      else {
        sessionStorage.removeItem(key());
        sessionStorage.removeItem(key() + '_sync');
      }
      status(dirty ? 'draftPending' : saved.workspace ? 'draftSynced' : 'draftIdle');
      return true;
    } catch {
      if (identity === epoch) status('draftOffline');
      return false;
    }
  }
  async function flush() {
    if (!user || conflict) return false;
    if (pending) {
      await pending;
      return dirty ? flush() : true;
    }
    const identity = epoch;
    clearTimeout(timer);
    const work = async () => {
      if (!ready && !(await initialize())) {
        if (dirty && !conflict) scheduleRetry();
        return false;
      }
      if (identity !== epoch) return false;
      if (!dirty) return true;
      const workspace = read(),
        sent = JSON.stringify(workspace);
      lastAttempt = performance.now();
      status('draftSyncing');
      try {
        const result = await request('/api/drafts', {
          body: { workspace, baseVersion: version },
          signal: AbortSignal.timeout(20000),
        });
        if (identity !== epoch) return false;
        version = result.version;
        lastSynced = sent;
        dirty = raw() !== sent;
        firstDirty = dirty ? performance.now() : 0;
        retry = 30000;
        if (!dirty) localSaved();
        backup();
        status(dirty ? 'draftPending' : 'draftSynced');
        return !dirty;
      } catch (error) {
        if (identity !== epoch) return false;
        conflict = error.message === 'DRAFT_CONFLICT';
        status(conflict ? 'draftConflict' : 'draftOffline');
        return false;
      }
    };
    pending = work();
    try {
      return await pending;
    } finally {
      if (identity === epoch) {
        pending = null;
        if (dirty && !conflict) state === 'draftOffline' ? scheduleRetry() : schedule();
      }
    }
  }
  function scheduleRetry() {
    schedule(retry);
    retry = Math.min(300000, retry * 2);
  }
  function changed() {
    if (!user) return;
    if (!pending && raw() === lastSynced) {
      dirty = false;
      clearTimeout(timer);
      backup();
      status('draftSynced');
      return;
    }
    if (!dirty) firstDirty = performance.now();
    dirty = true;
    backup();
    if (!conflict) status('draftPending');
    schedule();
  }
  function reset(next) {
    epoch++;
    clearTimeout(timer);
    pending = null;
    user = next?.mustChangePassword ? null : next;
    dirty = ready = conflict = false;
    localOk = true;
    lastSynced = '';
    version = 0;
    firstDirty = lastAttempt = 0;
    retry = 30000;
    $('draft-sync-actions').hidden = true;
    if (!user) return;
    try {
      const local = sessionStorage.getItem(key());
      const meta = JSON.parse(sessionStorage.getItem(key() + '_sync'));
      if (local) {
        apply(restoreWorkspace(local));
        version = Number.isSafeInteger(meta?.version) ? meta.version : 0;
        dirty = meta?.pending !== false;
        firstDirty = performance.now();
      }
    } catch {
      status('draftLocalError');
    }
    const identity = epoch;
    pending = initialize();
    void pending.finally(() => {
      if (identity !== epoch) return;
      pending = null;
      if (dirty && !conflict) state === 'draftOffline' ? scheduleRetry() : schedule();
    });
  }
  async function resolveConflict(useRemote) {
    if (!user || !confirm(t(useRemote ? 'draftLoadConfirm' : 'draftKeepConfirm'))) return;
    const identity = epoch;
    const before = raw();
    try {
      if (pending) await pending;
      const saved = await remote();
      if (identity !== epoch) return;
      if (useRemote && raw() !== before) {
        status('draftConflict');
        return;
      }
      if (useRemote)
        apply(saved.workspace ? restoreWorkspace(JSON.stringify(saved.workspace)) : null);
      version = saved.version;
      ready = true;
      conflict = false;
      dirty = !useRemote;
      firstDirty = performance.now();
      if (!dirty) lastSynced = raw();
      backup();
      status(dirty ? 'draftPending' : 'draftSynced');
      if (dirty) await flush();
    } catch {
      if (identity === epoch) status('draftOffline');
    }
  }
  async function forget() {
    if (!user || !confirm(t('draftDeleteConfirm'))) return false;
    const identity = epoch;
    clearTimeout(timer);
    if (pending) await pending;
    if (identity !== epoch || conflict) return false;
    if (!ready && !(await initialize())) return false;
    const before = raw();
    try {
      pending = request('/api/drafts', {
        body: { workspace: null, baseVersion: version },
        signal: AbortSignal.timeout(20000),
      });
      const result = await pending;
      if (identity !== epoch) return false;
      version = result.version;
      lastSynced = '';
      dirty = raw() !== before;
      clearTimeout(timer);
      sessionStorage.removeItem(key());
      sessionStorage.removeItem(key() + '_sync');
      if (dirty) {
        backup();
        firstDirty = performance.now();
        schedule();
      }
      status(dirty ? 'draftPending' : 'draftDeleted');
      return true;
    } catch (error) {
      if (identity === epoch) {
        conflict = error.message === 'DRAFT_CONFLICT';
        status(conflict ? 'draftConflict' : 'draftOffline');
      }
      return false;
    } finally {
      if (identity === epoch) {
        pending = null;
        if (dirty && !conflict) schedule();
      }
    }
  }
  $('draft-retry').addEventListener('click', () => void flush());
  $('draft-load-cloud').addEventListener('click', () => void resolveConflict(true));
  $('draft-keep-local').addEventListener('click', () => void resolveConflict(false));
  window.addEventListener('online', () => {
    if (dirty) void flush();
  });
  window.addEventListener('pagehide', () => {
    if (dirty) backup();
  });
  return { reset, changed, flush, forget, render, pending: () => dirty };
}
