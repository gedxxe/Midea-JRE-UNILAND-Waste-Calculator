export const draftMessages = {
  draftTabAt: ['Tab copy: {time}', '标签页副本：{time}', 'Salinan tab: {time}'],
  draftTabNone: ['No tab copy yet', '尚无标签页副本', 'Belum ada salinan tab'],
  draftTabFailed: [
    'Tab copy could not be updated',
    '标签页副本更新失败',
    'Salinan tab gagal diperbarui',
  ],
  draftAccountAt: [
    'Last account save: {time}',
    '上次账户保存：{time}',
    'Terakhir tersimpan di akun: {time}',
  ],
  draftAccountNone: [
    'No confirmed account save time',
    '尚无已确认的账户保存时间',
    'Belum ada waktu simpan akun yang terkonfirmasi',
  ],
  backupTitle: ['Draft backup and restore', '草稿备份与恢复', 'Backup dan restore draft'],
  backupHint: [
    'Includes 24 HOURS, After production and Night shift for both factories, incomplete readings, gas, refills and Water. Keep the file private. Restore uses the same account; saved reports stay unchanged.',
    '包含两厂24小时、生产时段及夜班草稿、未完成读数、气体、补充记录及用水。请私密保存文件。仅可恢复至原账户，不改变已保存报告。',
    'Memuat mode 24 HOURS, After production dan Night shift kedua pabrik, reading belum lengkap, gas, refill, dan Water. Simpan file secara privat. Restore ke akun yang sama; laporan tersimpan tetap utuh.',
  ],
  backupDownload: ['Download draft backup', '下载草稿备份', 'Unduh backup draft'],
  backupRestore: ['Restore draft backup', '恢复草稿备份', 'Restore backup draft'],
  backupDownloaded: ['Draft backup downloaded.', '草稿备份已下载。', 'Backup draft diunduh.'],
  backupInvalid: [
    'Invalid or unsupported draft backup (maximum 2 MB). Entries were not changed.',
    '备份无效或不支持（最大2 MB），输入未改变。',
    'Backup draft tidak valid atau tidak didukung (maksimal 2 MB). Isian tetap utuh.',
  ],
  backupAccount: [
    'This backup belongs to a different account.',
    '此备份属于其他账户。',
    'Backup ini milik akun lain.',
  ],
  backupChanged: [
    'Entries changed while reading the file. Select the backup again.',
    '读取文件时输入已改变，请重新选择备份。',
    'Isian berubah saat file dibaca. Pilih backup kembali.',
  ],
  backupConfirm: [
    'Replace 24 HOURS, After production and Night shift drafts for both factories with this backup? Download your current backup first if needed. Undo can restore the previous entries. Saved reports will not change.',
    '用此备份替换两厂24小时、生产时段及夜班草稿？如有需要请先下载当前备份。可撤销以恢复原输入，已保存报告不会改变。',
    'Ganti draft 24 HOURS, After production dan Night shift kedua pabrik dengan backup ini? Unduh backup saat ini dahulu bila diperlukan. Undo bisa mengembalikan isian sebelumnya. Laporan tersimpan tidak berubah.',
  ],
  backupRestored: [
    'Backup restored as a draft. Review entries before saving a report.',
    '备份已恢复为草稿，保存报告前请核对。',
    'Backup dimuat sebagai draft. Periksa isian sebelum menyimpan laporan.',
  ],
  draftRecoveryInvalid: [
    'The tab recovery copy is damaged. Autosave is paused; load the account copy only after checking your backup.',
    '标签页恢复副本已损坏，自动保存已暂停。请检查备份后再载入账户副本。',
    'Salinan pemulihan tab rusak. Autosave dijeda; periksa backup sebelum memuat salinan akun.',
  ],
  draftIdle: ['Draft autosave is ready.', '草稿自动保存已就绪。', 'Autosave draft siap.'],
  draftLoading: ['Checking saved draft…', '正在检查已保存草稿…', 'Memeriksa draft tersimpan…'],
  draftPending: [
    'Draft saved in this tab. Sync pending.',
    '草稿已保存在此标签页，等待同步。',
    'Draft tersimpan di tab ini. Menunggu sinkronisasi.',
  ],
  draftSyncing: ['Syncing draft…', '正在同步草稿…', 'Menyinkronkan draft…'],
  draftSynced: [
    'All changes saved to your account.',
    '所有修改已保存到账户。',
    'Semua perubahan tersimpan di akun.',
  ],
  draftOffline: [
    'Draft sync failed. This tab keeps your edits; retry before closing it.',
    '草稿同步失败。此标签页保留修改，请在关闭前重试。',
    'Draft belum tersinkron. Isian tetap di tab ini; coba lagi sebelum menutup tab.',
  ],
  draftLocalError: [
    'Could not save a local copy. Keep this tab open until the account draft is saved.',
    '本地副本保存失败。请保持此标签页打开，直到账户草稿保存完成。',
    'Salinan lokal belum tersimpan. Biarkan tab terbuka sampai draft akun berhasil disimpan.',
  ],
  draftConflict: [
    'Another tab or device changed this draft. Choose which copy to keep.',
    '其他标签页或设备修改了草稿，请选择要保留的版本。',
    'Draft berubah di tab atau perangkat lain. Pilih salinan yang ingin dipakai.',
  ],
  draftRetry: ['Retry draft sync', '重试草稿同步', 'Coba sinkronisasi draft'],
  draftLoadCloud: ['Load saved draft', '载入已保存草稿', 'Muat draft tersimpan'],
  draftKeepLocal: ['Keep this draft', '保留此草稿', 'Gunakan draft ini'],
  draftLoadConfirm: [
    'Replace this tab’s readings with the latest account draft?',
    '用账户最新草稿替换此标签页的读数？',
    'Ganti isian tab ini dengan draft terbaru dari akun?',
  ],
  draftKeepConfirm: [
    'Replace the account draft with this tab’s readings? Saved reports will not change.',
    '用此标签页读数替换账户草稿？已保存报告不会改变。',
    'Ganti draft akun dengan isian tab ini? Laporan tersimpan tidak berubah.',
  ],
  draftDeleteConfirm: [
    'Remove the saved account workspace for both reading modes and factories, and this tab’s backup? Current entries stay on screen; editing again starts a new draft.',
    '删除两厂三种模式的账户工作区及此标签页备份？当前输入仍显示在屏幕上，再次编辑会开始新草稿。',
    'Hapus workspace akun ketiga mode dan pabrik, serta cadangan tab ini? Isian tetap di layar; mengedit lagi akan membuat draft baru.',
  ],
  draftDeleted: [
    'Saved draft removed. Current entries remain on screen.',
    '已删除保存的草稿，当前输入仍保留在屏幕上。',
    'Draft tersimpan dihapus. Isian masih ada di layar.',
  ],
};
