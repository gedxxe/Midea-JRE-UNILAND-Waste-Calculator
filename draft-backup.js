import { restoreWorkspace } from './storage.js';
import { restorePeriodQueue } from './draft-records.js';

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
const LEGACY_MAX_BYTES = 256 * 1024;
const FORMAT = 'midea-energy-draft-backup';
const validOwner = (id) => /^[0-9a-f-]{36}$/i.test(id || '');
const size = (raw) => new TextEncoder().encode(raw).length;

export function createDraftBackup(workspace, ownerId, createdAt = new Date().toISOString()) {
  if (!validOwner(ownerId)) throw new Error('backupAccount');
  const { drafts, workingHours, nightShifts, autosaveLayout } = restoreWorkspace(
    JSON.stringify(workspace),
  );
  const pendingPeriods = restorePeriodQueue(workspace.pendingPeriods);
  const raw = JSON.stringify(
    {
      format: FORMAT,
      version: 5,
      ownerId,
      createdAt,
      workspace: {
        version: 4,
        drafts,
        ...(autosaveLayout ? { autosaveLayout } : {}),
        ...(workingHours ? { workingHours } : {}),
        ...(nightShifts ? { nightShifts } : {}),
      },
      pendingPeriods,
    },
    null,
    2,
  );
  if (size(raw) > MAX_BACKUP_BYTES) throw new Error('backupInvalid');
  return raw;
}
export function restoreDraftBackup(raw, ownerId) {
  if (typeof raw !== 'string' || size(raw) > MAX_BACKUP_BYTES) throw new Error('backupInvalid');
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error('backupInvalid');
  }
  if (
    input?.format !== FORMAT ||
    ![1, 2, 3, 4, 5].includes(input.version) ||
    (input.version < 5 && size(raw) > LEGACY_MAX_BYTES)
  )
    throw new Error('backupInvalid');
  if (!validOwner(ownerId) || input.ownerId !== ownerId) throw new Error('backupAccount');
  try {
    return {
      ...restoreWorkspace(JSON.stringify(input.workspace)),
      reportLinks: {},
      ...(input.version === 5 ? { pendingPeriods: restorePeriodQueue(input.pendingPeriods) } : {}),
    };
  } catch (error) {
    throw new Error(error.message === 'shiftConflict' ? 'shiftConflict' : 'backupInvalid');
  }
}
