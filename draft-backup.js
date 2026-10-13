import { restoreDrafts } from './storage.js';

export const MAX_BACKUP_BYTES = 256 * 1024;
const FORMAT = 'midea-energy-draft-backup';
const validOwner = (id) => /^[0-9a-f-]{36}$/i.test(id || '');
const size = (raw) => new TextEncoder().encode(raw).length;

export function createDraftBackup(workspace, ownerId, createdAt = new Date().toISOString()) {
  if (!validOwner(ownerId)) throw new Error('backupAccount');
  const drafts = restoreDrafts(JSON.stringify(workspace));
  const raw = JSON.stringify(
    { format: FORMAT, version: 1, ownerId, createdAt, workspace: { version: 4, drafts } },
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
  if (input?.format !== FORMAT || input.version !== 1) throw new Error('backupInvalid');
  if (!validOwner(ownerId) || input.ownerId !== ownerId) throw new Error('backupAccount');
  try {
    return { version: 4, drafts: restoreDrafts(JSON.stringify(input.workspace)), reportLinks: {} };
  } catch {
    throw new Error('backupInvalid');
  }
}
