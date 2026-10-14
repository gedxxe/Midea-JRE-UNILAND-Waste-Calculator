export const workingHoursMessages = {
  backupLegacyConfirm: [
    'This backup contains Daily drafts only. Replace Daily drafts for both factories and keep the current Working hours drafts? Undo can restore the previous workspace. Saved reports will not change.',
    '此备份仅含每日草稿。替换两厂每日草稿并保留当前工作时段草稿？可撤销以恢复原工作区，已保存报告不会改变。',
    'Backup ini hanya memuat draft Daily. Ganti draft Daily kedua pabrik dan pertahankan draft Working hours saat ini? Undo bisa mengembalikan workspace sebelumnya. Laporan tersimpan tidak berubah.',
  ],
  workIntro: [
    'Enter morning and after-work electricity readings. Review and save the working-hours report.',
    '填写早晨及下班电表读数，检查并保存工作时段报告。',
    'Isi reading listrik pagi dan selesai kerja. Periksa dan simpan laporan jam kerja.',
  ],
  workMorningReading: ['Morning reading', '早晨读数', 'Reading pagi'],
  workEveningReading: ['After-work reading', '下班读数', 'Reading selesai kerja'],
  readingMode: ['Reading mode', '记录模式', 'Mode reading'],
  dailyMode: [
    'Daily · 08:00 to next morning',
    '每日 · 08:00 至次日早晨',
    'Harian · 08.00 ke pagi berikutnya',
  ],
  workingMode: [
    'Working hours · morning to after work',
    '工作时段 · 早晨至下班',
    'Jam kerja · pagi ke selesai kerja',
  ],
  workTitle: ['Working-hours electricity', '工作时段用电', 'Listrik selama jam kerja'],
  workHint: [
    'One-week trial. Record both readings on the same date. This workspace is separate from daily gas, Water and electricity.',
    '一周试用。同一天记录两次读数。此工作区与每日燃气、水及用电分开。',
    'Uji coba satu minggu. Catat kedua reading pada tanggal yang sama. Workspace ini terpisah dari listrik, gas, dan Water harian.',
  ],
  workDate: ['Work date', '工作日期', 'Tanggal kerja'],
  workStart: ['Morning reading time', '早晨抄表时间', 'Waktu reading pagi'],
  workEnd: ['After-work reading time', '下班抄表时间', 'Waktu reading selesai kerja'],
  workNotice: [
    '{date} · {start} to {end} WIB. Electricity used during work only; excludes overnight consumption.',
    '{date} · {start} 至 {end} WIB。仅计算工作期间用电，不包括夜间。',
    '{date} · {start} ke {end} WIB. Hanya pemakaian listrik selama kerja; tidak termasuk malam.',
  ],
  workMorning: [
    'Use matching 08:00 daily reading',
    '使用日期匹配的每日 08:00 读数',
    'Gunakan reading harian 08.00 yang tanggalnya sama',
  ],
  workMorningConfirm: [
    'Replace the morning electricity readings with the matching daily 08:00 column? Evening readings remain.',
    '用日期匹配的每日 08:00 读数替换早晨用电读数？晚间读数保留。',
    'Ganti reading listrik pagi dengan kolom harian 08.00 yang tanggalnya sama? Reading sore tetap tersimpan.',
  ],
  workMorningUnavailable: [
    'No matching daily 08:00 readings in this workspace. Enter the morning readings or import a timed raw list.',
    '此工作区没有日期匹配的每日 08:00 读数。请填写早晨读数或导入带时间的原始列表。',
    'Belum ada reading harian 08.00 yang tanggalnya sama di workspace ini. Isi reading pagi atau impor daftar raw dengan waktu.',
  ],
  workMorningCopied: [
    'Matching morning readings copied. Review incomplete cells before saving.',
    '已复制日期匹配的早晨读数。保存前请检查未填写的单元格。',
    'Reading pagi yang tanggalnya sama disalin. Periksa kolom kosong sebelum menyimpan.',
  ],
  workImportTime: [
    'Working-hours imports need Reading time: HH:MM WIB. Daily imports accept 08:00 only or no time line.',
    '工作时段导入需要 Reading time: HH:MM WIB。每日导入仅接受 08:00 或不带时间行。',
    'Impor jam kerja perlu Reading time: HH:MM WIB. Impor harian hanya menerima 08:00 atau tanpa baris waktu.',
  ],
  workTimeRequired: [
    'Enter a valid reading time before exporting.',
    '导出前请填写有效抄表时间。',
    'Isi waktu reading yang valid sebelum ekspor.',
  ],
  workGraphHint: [
    'Saved working-hours electricity only. Each point keeps its recorded times; daily and overnight consumption are excluded.',
    '仅显示已保存的工作时段用电。每个点保留抄表时间，不含每日及夜间用电。',
    'Hanya listrik jam kerja yang sudah disimpan. Tiap titik menyertakan waktu reading; pemakaian harian dan malam tidak digabung.',
  ],
  draftFormatChanged: [
    'A newer workspace contains working-hours readings. Reload this page before saving; your tab copy is retained.',
    '新版工作区含工作时段读数。保存前请刷新页面；此标签页副本保留。',
    'Workspace baru berisi reading jam kerja. Muat ulang sebelum menyimpan; salinan tab tetap tersedia.',
  ],
};
