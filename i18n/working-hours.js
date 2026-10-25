export const workingHoursMessages = {
  shiftConflict: [
    'After production and Night have conflicting shared readings. Use a matching backup; current entries are preserved.',
    '生产时段与夜班共用读数冲突。请使用匹配的备份，当前输入已保留。',
    'Reading bersama After production dan Night bertentangan. Gunakan backup yang sesuai; isian saat ini tetap tersimpan.',
  ],
  backupLegacyConfirm: [
    'This older backup replaces its included drafts and keeps shift drafts that are absent. Conflicting shared readings are rejected. Undo can restore the previous workspace.',
    '旧备份替换其包含的草稿，保留未包含的班次草稿。共用读数若冲突则拒绝恢复。可撤销恢复原工作区。',
    'Backup lama mengganti draft yang disertakan dan mempertahankan draft shift yang tidak ada di file. Reading bersama yang bertentangan akan ditolak. Undo dapat mengembalikan workspace.',
  ],
  workIntro: [
    'Record meter readings, then copy raw data or choose a consumption report.',
    '记录电表读数后，可复制原始数据或选择用量报告。',
    'Catat reading meter, lalu salin data raw atau pilih laporan konsumsi.',
  ],
  workMorningReading: ['Morning reading', '早晨读数', 'Reading pagi'],
  workEveningReading: ['After-work reading', '下班读数', 'Reading selesai kerja'],
  readingMode: ['Reading mode', '记录模式', 'Mode reading'],
  dailyMode: [
    '24 HOURS · morning to next morning',
    '24小时 · 早晨至次日早晨',
    '24 HOURS · pagi ke pagi berikutnya',
  ],
  workingMode: [
    'AFTER PRODUCTION · morning to evening',
    '生产时段 · 早晨至下班',
    'AFTER PRODUCTION · pagi ke sore',
  ],
  workTitle: [
    'After-production energy report',
    '生产时段能源报表',
    'Laporan energi After production',
  ],
  workHint: [
    '24 HOURS: morning to next morning. AFTER PRODUCTION: morning to evening. NIGHT SHIFT: evening to next morning. Electricity, gas and Water belong to each period; matching observations are shared.',
    '24小时：早晨至次日早晨。生产时段：早晨至下班。夜班：晚间至次日早晨。每个时段分别记录电、气和水，并共用相同时间的读数。',
    '24 HOURS: pagi ke pagi berikutnya. AFTER PRODUCTION: pagi ke sore. NIGHT SHIFT: sore ke pagi berikutnya. Listrik, gas dan Water dicatat per periode; reading yang waktunya sama dipakai bersama.',
  ],
  workDate: ['Shift date', '班次日期', 'Tanggal shift'],
  workStart: ['Morning reading time', '早晨抄表时间', 'Waktu reading pagi'],
  workEnd: ['After-work reading time', '下班抄表时间', 'Waktu reading selesai kerja'],
  workNotice: [
    '{date} · {start} to {end} WIB. After-production report.',
    '{date} · {start} 至 {end} WIB。生产时段用电报告。',
    '{date} · {start} ke {end} WIB. Laporan After production.',
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
    'Set a valid reading time in the selected work column. Daily imports accept 08:00 only or no time line.',
    '请为所选工作时段列设置有效时间。每日导入仅接受 08:00 或不带时间行。',
    'Atur waktu valid pada kolom jam kerja yang dipilih. Impor harian hanya menerima 08:00 atau tanpa baris waktu.',
  ],
  workNextHint: [
    'Next day reuses the recorded next morning as After production start. Unknown readings stay empty. Save completed shifts before moving on.',
    '下一天将已记录的次日早晨读数用于生产时段开始。未知读数留空。继续前请保存已完成班次。',
    'Next day memakai reading pagi berikutnya sebagai awal After production. Reading yang belum ada tetap kosong. Simpan shift lengkap sebelum lanjut.',
  ],
  workImportHint: [
    'Without a Reading time line, import uses the selected column time. Morning/evening date labels are optional and never choose a shift.',
    '没有 Reading time 行时，导入采用所选列时间。日期旁早晚标签可有可无，不用于选择班次。',
    'Tanpa baris Reading time, impor memakai waktu kolom pilihan. Label pagi/sore opsional dan tidak menentukan shift.',
  ],
  workTimeRequired: [
    'Enter a valid reading time before exporting.',
    '导出前请填写有效抄表时间。',
    'Isi waktu reading yang valid sebelum ekspor.',
  ],
  workGraphHint: [
    'Saved energy and utilities for the selected period. Actual reading times are retained. Older electricity-only records have no utility values.',
    '显示所选时段已保存的能源与公用工程数据，并保留实际抄表时间。旧的纯电力记录没有公用工程数值。',
    'Energi dan utility tersimpan untuk periode terpilih. Waktu reading asli dipertahankan. Catatan lama yang hanya listrik tidak memiliki nilai utility.',
  ],
  draftFormatChanged: [
    'A newer workspace uses an updated meter layout or reading mode. Reload before saving; your tab copy is retained.',
    '新版工作区使用更新的电表布局或抄表模式。保存前请刷新页面；此标签页副本保留。',
    'Workspace baru memakai susunan meter atau mode reading terbaru. Muat ulang sebelum menyimpan; salinan tab tetap tersedia.',
  ],
  nightMode: [
    'NIGHT SHIFT · evening to next morning',
    '夜班 · 晚间至次日早晨',
    'NIGHT SHIFT · sore ke pagi berikutnya',
  ],
  nightTitle: ['Night shift energy report', '夜班能源报表', 'Laporan energi Night shift'],
  nightNotice: [
    '{date} {start} to {endDate} {end} WIB. Night shift uses the starting date.',
    '{date} {start} 至 {endDate} {end} WIB。夜班报告使用开始日期。',
    '{date} {start} ke {endDate} {end} WIB. Night shift memakai tanggal awal.',
  ],
  nightStart: ['Evening reading time', '晚间抄表时间', 'Waktu reading sore'],
  nightEnd: ['Next morning reading time', '次日早晨抄表时间', 'Waktu reading pagi berikutnya'],
  nextMorningReading: ['Next morning reading', '次日早晨读数', 'Reading pagi berikutnya'],
  reportPeriods: ['Report contents', '报告内容', 'Isi laporan'],
  allReportPeriods: ['24 HOURS + both shifts', '24小时 + 两个班次', '24 HOURS + kedua shift'],
  reportOptionsHint: [
    'Raw readings can be copied independently. Save and Excel row use the edited period; gas and Water follow each selected period.',
    '原始读数可单独复制。保存和Excel行采用当前编辑时段；各所选时段均包含燃气和水。',
    'Data raw bisa disalin terpisah. Save dan baris Excel memakai periode yang diisi; gas dan Water mengikuti setiap periode pilihan.',
  ],
  selectionIncomplete: [
    'Complete the readings and dates for the selected report sections. Raw export needs only its selected column.',
    '请完成所选报告部分的读数及日期。原始导出仅需完成所选列。',
    'Lengkapi reading dan tanggal bagian laporan yang dipilih. Ekspor raw hanya perlu kolom pilihan.',
  ],
  selectionPeriod: [
    'Match the dates and shared reading times of the selected report sections. Bundled reports need one 24-hour period.',
    '请使所选报告部分的日期与共用读数时间一致。组合报告需为一个24小时时段。',
    'Samakan tanggal dan waktu reading bersama pada bagian laporan pilihan. Laporan gabungan ini memerlukan satu periode 24 jam.',
  ],
  selectionRefills: [
    'Refill records differ between 24 HOURS and the selected shifts. Review the refill list in each period.',
    '24小时与所选班次的补充记录不一致，请检查各时段补充列表。',
    'Catatan refill 24 HOURS dan shift terpilih berbeda. Periksa daftar refill tiap periode.',
  ],
  selectionReadings: [
    'Shared readings differ between the selected periods. Check the matching cells before copying this report.',
    '所选时段的共用读数不同。复制报告前请检查相应单元格。',
    'Reading bersama berbeda antarperiode pilihan. Periksa kolom yang waktunya sama sebelum menyalin laporan.',
  ],
  selectionBoth: [
    'Complete the selected report sections for both factories first.',
    '请先完成两厂所选报告部分。',
    'Lengkapi bagian laporan pilihan untuk kedua pabrik dahulu.',
  ],
  sharedReadingConflict: [
    '{count} shared readings differ between periods. Existing values are kept. Correct the intended reading to update its matching cells.',
    '有{count}个共用读数在各时段中不同。已保留现值。修正正确读数后会更新其相应单元格。',
    'Ada {count} reading bersama yang berbeda antarperiode. Nilai lama tetap disimpan. Koreksi reading yang benar untuk memperbarui kolom yang waktunya sama.',
  ],
};
