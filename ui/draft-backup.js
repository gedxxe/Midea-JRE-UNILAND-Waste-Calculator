import { createDraftBackup, restoreDraftBackup, MAX_BACKUP_BYTES } from '../draft-backup.js';
import { $ } from './dom.js';
import { t } from '../i18n/index.js';

export function createBackupControls({ read, apply, toast }) {
  let user = null,
    epoch = 0,
    ticket = 0;
  function reset(next) {
    epoch++;
    ticket++;
    user = next?.mustChangePassword ? null : next;
    $('draft-backup-file').value = '';
  }
  $('download-draft-backup').addEventListener('click', () => {
    if (!user) return;
    let url;
    try {
      const raw = createDraftBackup(read(), user.id);
      url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'midea-draft-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
      link.click();
      toast(t('backupDownloaded'));
    } catch {
      toast(t('backupInvalid'));
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  $('restore-draft-backup').addEventListener('click', () => {
    if (user) $('draft-backup-file').click();
  });
  $('draft-backup-file').addEventListener('change', async () => {
    const file = $('draft-backup-file').files[0];
    $('draft-backup-file').value = '';
    if (!user || !file) return;
    const identity = epoch,
      request = ++ticket,
      owner = user.id,
      before = JSON.stringify(read());
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('backupInvalid');
      const workspace = restoreDraftBackup(await file.text(), owner);
      if (identity !== epoch || request !== ticket) return;
      if (JSON.stringify(read()) !== before) {
        toast(t('backupChanged'));
        return;
      }
      if (!confirm(t('backupConfirm'))) return;
      apply(workspace);
      toast(t('backupRestored'));
    } catch (error) {
      if (identity === epoch && request === ticket)
        toast(t(error.message === 'backupAccount' ? 'backupAccount' : 'backupInvalid'));
    }
  });
  return { reset };
}
