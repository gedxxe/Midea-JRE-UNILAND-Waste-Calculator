import { $ } from './dom.js';
import { t, getLanguage } from '../i18n/index.js';
import { STORAGE_KEY, restoreWorkspace, sameWorkspace } from '../storage.js';
import {
  queueDepartedPeriods,
  restorePeriodQueue,
  periodKey,
  PERIOD_BATCH_SIZE,
} from '../draft-records.js';

// One replaceable workspace per account. Local recovery is immediate; remote writes are coalesced.
export function createDraftAutosave({ request, read, apply, localSaved, synced = () => {} }) {
  let user,
    epoch = 0,
    version = 0,
    dirty = false,
    ready = false,
    workspaceSaved = false,
    conflict = false,
    localOk = true,
    recoveryBroken = false;
  let periods = [],
    previous = null,
    periodSequence = null,
    references = new Map();
  const updateReferences = (records) => {
    for (const record of records || []) references.set(record.key, record);
  };
  const sameRaw = (a, b) => {
    try {
      return sameWorkspace(JSON.parse(a), JSON.parse(b));
    } catch {
      return false;
    }
  };
  let timer,
    pending,
    lastSynced = '',
    firstDirty = 0,
    lastAttempt = 0,
    retry = 30000,
    state = 'draftIdle',
    localAt = null,
    accountAt = null;
  const timestamp = (value) =>
    typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
  const time = (value) =>
    new Intl.DateTimeFormat(getLanguage() === 'en' ? 'en-GB' : getLanguage(), {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      hourCycle: 'h23',
      timeStyle: 'medium',
    }).format(new Date(value)) + ' WIB';
  const key = () => STORAGE_KEY + '_' + user.id;
  const raw = () => JSON.stringify(read());
  const recoveryRaw = () => JSON.stringify({ workspace: read(), periods });
  function render() {
    if (!user) return;
    $('save-status').textContent = t(state);
    const storageStatus = [
      t(localOk ? (localAt ? 'draftTabAt' : 'draftTabNone') : 'draftTabFailed', {
        time: localAt ? time(localAt) : '',
      }),
      t(accountAt ? 'draftAccountAt' : 'draftAccountNone', {
        time: accountAt ? time(accountAt) : '',
      }),
    ].join(' · ');
    if ($('draft-storage-status').textContent !== storageStatus)
      $('draft-storage-status').textContent = storageStatus;
    $('draft-sync-actions').hidden =
      !conflict && !['draftOffline', 'draftLocalError'].includes(state);
    $('draft-load-cloud').hidden = !conflict;
    $('draft-keep-local').hidden = !conflict || recoveryBroken;
    $('draft-retry').hidden = conflict;
  }
  function status(next) {
    state = !localOk && ['draftPending', 'draftOffline'].includes(next) ? 'draftLocalError' : next;
    render();
  }
  function backup() {
    if (!user || recoveryBroken) return;
    try {
      const now = new Date().toISOString();
      // Store readings and sync state atomically; a failed second write must never
      // leave newer readings labelled as already saved by older metadata.
      sessionStorage.setItem(
        key(),
        JSON.stringify({
          ...read(),
          tabRecovery: {
            version,
            pending: dirty,
            localAt: now,
            accountAt,
            pendingPeriods: periods,
          },
        }),
      );
      try {
        sessionStorage.removeItem(key() + '_sync');
      } catch {
        /* Atomic copy is intact. */
      }
      localAt = now;
      localOk = true;
      localSaved();
      render();
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
          5000 - (performance.now() - lastAttempt),
          Math.min(3000, 15000 - (performance.now() - firstDirty)),
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
      workspaceSaved = !!saved.workspace;
      accountAt = saved.workspace ? timestamp(saved.updated_at) : null;
      updateReferences(saved.records);
      const same =
        saved.workspace && sameWorkspace({ ...saved.workspace, autosaveLayout: 1 }, read());
      if (dirty && !same && saved.version !== version) {
        conflict = true;
        status('draftConflict');
        return false;
      }
      if (!dirty && saved.workspace) apply(restoreWorkspace(JSON.stringify(saved.workspace)));
      if (!dirty && !saved.workspace && saved.version !== version) apply(null);
      // Matching active data does not acknowledge queued periods. Retry their original
      // token so the server verifies the whole batch before advancing it.
      if (!dirty || !periods.length) version = saved.version;
      ready = true;
      if (same && !periods.length) dirty = false;
      if (
        saved.workspace &&
        (saved.workspace.autosaveLayout !== 1 ||
          !saved.workspace.workingHours ||
          !saved.workspace.nightShifts)
      ) {
        dirty = true;
        firstDirty ||= performance.now();
      }
      previous = structuredClone(read());
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
      if (!user || !ready || conflict) return false;
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
      // Default dates or shared observations may be normalized outside an input event.
      if (!dirty && lastSynced && !sameRaw(raw(), lastSynced)) changed();
      if (!dirty) return true;
      const workspace = read(),
        sent = JSON.stringify(workspace);
      let batch = periods.slice(0, PERIOD_BATCH_SIZE);
      while (
        batch.length &&
        new TextEncoder().encode(
          JSON.stringify({ workspace, baseVersion: version, periods: batch }),
        ).length >
          480 * 1024
      )
        batch = batch.slice(0, -1);
      lastAttempt = performance.now();
      status('draftSyncing');
      try {
        const result = await request('/api/drafts', {
          body: { workspace, baseVersion: version, periods: batch },
          signal: AbortSignal.timeout(20000),
        });
        if (identity !== epoch) return false;
        version = result.version;
        workspaceSaved = true;
        accountAt = timestamp(result.updated_at);
        lastSynced = sent;
        updateReferences(result.records);
        periods = periods.filter(
          (draft) =>
            !batch.some(
              (sentDraft) =>
                periodKey(sentDraft) === periodKey(draft) && sameWorkspace(sentDraft, draft),
            ),
        );
        dirty = !sameRaw(raw(), sent) || periods.length > 0;
        firstDirty = dirty ? performance.now() : 0;
        retry = 30000;
        if (!dirty) {
          periodSequence = null;
          localSaved();
        }
        backup();
        status(dirty ? 'draftPending' : 'draftSynced');
        if (result.recordsChanged) synced();
        return !dirty;
      } catch (error) {
        if (identity !== epoch) return false;
        conflict = ['DRAFT_CONFLICT', 'DRAFT_FORMAT_CHANGED'].includes(error.message);
        status(
          error.message === 'DRAFT_FORMAT_CHANGED'
            ? 'draftFormatChanged'
            : conflict
              ? 'draftConflict'
              : 'draftOffline',
        );
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
  function changed({ periodOnly = false } = {}) {
    if (!user) return;
    const workspace = read();
    if (periodOnly) periodSequence ||= previous;
    periods = queueDepartedPeriods(periods, periodOnly ? periodSequence : previous, workspace);
    if (!periodOnly) periodSequence = null;
    previous = structuredClone(workspace);
    if (!pending && !periods.length && sameRaw(raw(), lastSynced)) {
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
    periods = [];
    references = new Map();
    previous = null;
    periodSequence = null;
    user = next?.mustChangePassword ? null : next;
    dirty = ready = conflict = workspaceSaved = false;
    localOk = true;
    recoveryBroken = false;
    lastSynced = '';
    version = 0;
    firstDirty = 0;
    lastAttempt = -Infinity;
    retry = 30000;
    localAt = accountAt = null;
    $('draft-storage-status').textContent = '';
    $('draft-sync-actions').hidden = true;
    if (!user) return;
    let local;
    try {
      local = sessionStorage.getItem(key());
      if (local) {
        const restored = restoreWorkspace(local);
        let meta = JSON.parse(local).tabRecovery;
        const atomic =
          Number.isSafeInteger(meta?.version) &&
          meta.version >= 0 &&
          typeof meta.pending === 'boolean';
        if (!atomic) {
          try {
            meta = JSON.parse(sessionStorage.getItem(key() + '_sync'));
          } catch {
            meta = null;
          }
        }
        periods = restorePeriodQueue(meta?.pendingPeriods);
        apply(restored);
        localAt = timestamp(meta?.localAt);
        accountAt = timestamp(meta?.accountAt);
        version = Number.isSafeInteger(meta?.version) && meta.version >= 0 ? meta.version : 0;
        // Legacy split metadata cannot prove the saved flag belongs to this copy.
        dirty = !atomic || meta.pending || periods.length > 0;
        firstDirty = performance.now();
      }
    } catch {
      if (local) {
        // Keep corrupt recovery untouched until the operator explicitly loads the account copy.
        recoveryBroken = conflict = true;
        localOk = false;
        status('draftRecoveryInvalid');
        return;
      }
      localOk = false;
      status('draftLocalError');
    }
    previous = structuredClone(read());
    const identity = epoch;
    pending = initialize();
    void pending.finally(() => {
      if (identity !== epoch) return;
      pending = null;
      if (dirty && !conflict) state === 'draftOffline' ? scheduleRetry() : schedule();
    });
  }
  async function resolveConflict(useRemote) {
    if (
      !user ||
      (recoveryBroken && !useRemote) ||
      !confirm(t(useRemote ? 'draftLoadConfirm' : 'draftKeepConfirm'))
    )
      return;
    const identity = epoch;
    const before = recoveryRaw();
    try {
      if (pending) await pending;
      const saved = await remote();
      if (identity !== epoch) return;
      if (useRemote && recoveryRaw() !== before) {
        status('draftConflict');
        return;
      }
      if (useRemote) {
        recoveryBroken = false;
        localOk = true;
        periods = [];
        apply(saved.workspace ? restoreWorkspace(JSON.stringify(saved.workspace)) : null);
      }
      updateReferences(saved.records);
      previous = structuredClone(read());
      periodSequence = null;
      version = saved.version;
      workspaceSaved = !!saved.workspace;
      accountAt = saved.workspace ? timestamp(saved.updated_at) : null;
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
    if (!(await flushAll())) return false;
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
      workspaceSaved = false;
      localAt = accountAt = null;
      lastSynced = '';
      dirty = raw() !== before || periods.length > 0;
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
  async function flushAll({ ensureWorkspace = false } = {}) {
    const identity = epoch;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (ensureWorkspace && ready && !workspaceSaved && !dirty) {
        dirty = true;
        firstDirty = performance.now();
        backup();
      }
      const done = await flush();
      if (done && ready && (!ensureWorkspace || workspaceSaved)) return identity === epoch;
      if (
        identity !== epoch ||
        !ready ||
        conflict ||
        ['draftOffline', 'draftLocalError'].includes(state)
      )
        return false;
    }
    return false;
  }
  async function checkpoint(save) {
    if (!user || !(await flushAll({ ensureWorkspace: true })) || conflict) return null;
    const identity = epoch,
      before = structuredClone(read());
    clearTimeout(timer);
    const work = async () => {
      status('draftSyncing');
      try {
        const result = await save({
          workspaceVersion: version,
          reference: (draft) => references.get(periodKey(draft)),
        });
        if (identity !== epoch) return null;
        const dataOnly = (value) => {
          const normalized = restoreWorkspace(JSON.stringify(value));
          delete normalized.reportLinks;
          return normalized;
        };
        if (!result.workspace || !sameWorkspace(dataOnly(before), dataOnly(result.workspace))) {
          conflict = true;
          dirty = true;
          backup();
          status('draftConflict');
          return result;
        }
        // An idempotent response may include another device's token. Newly queued
        // periods still need their original token checked by the draft endpoint.
        if (!result.unchanged || !periods.length) version = result.workspaceVersion;
        accountAt = timestamp(result.updated_at);
        updateReferences(result.records);
        lastSynced = JSON.stringify({ ...before, reportLinks: result.workspace.reportLinks });
        dirty = !sameRaw(raw(), lastSynced) || periods.length > 0;
        backup();
        status(dirty ? 'draftPending' : 'draftSynced');
        if (!result.unchanged) synced();
        return result;
      } catch (error) {
        if (identity === epoch) {
          conflict = ['DRAFT_CONFLICT', 'DRAFT_FORMAT_CHANGED'].includes(error.message);
          dirty = true;
          backup();
          status(conflict ? 'draftConflict' : 'draftOffline');
        }
        throw error;
      }
    };
    pending = work();
    try {
      return await pending;
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
    if (!dirty) return;
    backup();
    if (!user || !ready || pending || conflict) return;
    const workspace = read();
    let batch = periods.slice(0, PERIOD_BATCH_SIZE);
    while (
      batch.length &&
      new TextEncoder().encode(JSON.stringify({ workspace, baseVersion: version, periods: batch }))
        .length > 60000
    )
      batch = batch.slice(0, -1);
    const body = { workspace, baseVersion: version, periods: batch };
    if (new TextEncoder().encode(JSON.stringify(body)).length <= 60000)
      void request('/api/drafts', { body, keepalive: true }).catch(() => {});
  });
  return {
    reset,
    changed,
    flush,
    flushAll,
    forget,
    render,
    checkpoint,
    workspace: () => ({ ...read(), pendingPeriods: structuredClone(periods) }),
    restorePeriods(value) {
      periods = restorePeriodQueue(value);
      periodSequence = null;
      previous = structuredClone(read());
    },
    pending: () => dirty || periods.length > 0,
  };
}
