// Loaded with the optional guide, not with the reporting workspace.
// English, Simplified Chinese, Indonesian. Illustrations contain no account data.
export const guideMessages = {
  guideLabel: ['QUICK GUIDE', '快速指南', 'PANDUAN SINGKAT'],
  guideStep: [
    'Step {step} of {total}',
    '第 {step} 步，共 {total} 步',
    'Langkah {step} dari {total}',
  ],
  guideBack: ['Back', '上一步', 'Kembali'],
  guideNext: ['Next', '下一步', 'Lanjut'],
  guideFinish: ['Done', '完成', 'Selesai'],
  guidePause: ['Pause animation', '暂停动画', 'Jeda animasi'],
  guideResume: ['Resume animation', '继续动画', 'Lanjutkan animasi'],
  guideDemo: [
    'Illustration only. Your readings stay unchanged.',
    '仅为示意，不会更改读数。',
    'Hanya ilustrasi. Reading kamu tetap sama.',
  ],
  guidePreview: ['Preview', '示意', 'Ilustrasi'],
  guideWhere: ['Find it: {place}', '位置：{place}', 'Lokasi: {place}'],
  guidePeriodTitle: ['Choose the reading period', '选择抄表时段', 'Pilih periode reading'],
  guidePeriodBody: [
    'Choose JRE or UNILAND, then the dates and actual reading times. 24 HOURS compares morning to next morning; AFTER PRODUCTION compares morning to evening; NIGHT SHIFT compares evening to next morning. The report belongs to the start date. Only exact matching observations are shared.',
    '选择 JRE 或 UNILAND，再设置日期和实际抄表时间。24 HOURS 为早晨至次日早晨；AFTER PRODUCTION 为早晨至傍晚；NIGHT SHIFT 为傍晚至次日早晨。报告归属开始日期，仅共享日期和时间完全相同的读数。',
    'Pilih JRE atau UNILAND, lalu tanggal dan waktu reading sebenarnya. 24 HOURS membandingkan pagi ke pagi berikutnya; AFTER PRODUCTION pagi ke sore; NIGHT SHIFT sore ke pagi berikutnya. Tanggal laporan mengikuti tanggal awal. Reading dibagikan hanya jika tanggal dan waktunya cocok persis.',
  ],
  guidePeriodPlace: [
    'Factory tabs and Reading mode, above the table.',
    '表格上方的工厂标签及 Reading mode。',
    'Tab pabrik dan Reading mode, di atas tabel.',
  ],
  guideTableTitle: [
    'Enter what the meters show',
    '填写电表实际读数',
    'Isi angka yang terlihat di meter',
  ],
  guideTableBody: [
    'Enter cumulative Start and End readings. Ratios and branch deductions are applied automatically; individual usage appears below End. Decimal comma or dot is accepted. Leave unfinished cells blank; use - only for unavailable readings. Moving dates keeps readings only at matching dates and times.',
    '填写累计开始和结束读数。倍率及支路扣除自动计算，单表用量显示在结束读数下方。支持小数点或小数逗号。未完成项留空，仅用 - 表示无法读取。修改时段时只保留日期和时间匹配的读数。',
    'Isi reading kumulatif Start dan End. Ratio dan pengurangan cabang dihitung otomatis; konsumsi individual terlihat di bawah End. Boleh koma atau titik desimal. Biarkan yang belum selesai kosong; gunakan - hanya untuk reading yang tidak tersedia. Perubahan tanggal mempertahankan reading pada tanggal dan waktu yang cocok saja.',
  ],
  guideTablePlace: ['Meter readings table.', 'Meter readings 表格。', 'Tabel Meter readings.'],
  guideImportTitle: [
    'Paste readings when you have them',
    '已有读数可直接粘贴',
    'Import jika sudah punya teks reading',
  ],
  guideImportBody: [
    'Import text is optional. Choose Start or End to view that column, paste a complete factory template, then Apply. Invalid text does not change the table. Switching columns keeps unapplied text separate while the dialog is open. Blank reading template provides an empty copy for offline recording.',
    '文字导入为可选功能。选择 Start 或 End 查看对应列，粘贴完整工厂模板后应用。验证失败不会更改表格。弹窗打开时，两列未应用的文字分别保留。Blank reading template 可复制空白模板供离线记录。',
    'Import text itu opsional. Pilih Start atau End untuk melihat kolomnya, tempel template pabrik yang lengkap, lalu Apply. Teks tidak valid tidak mengubah tabel. Teks yang belum diterapkan disimpan terpisah saat dialog terbuka. Blank reading template menyediakan template kosong untuk pencatatan offline.',
  ],
  guideImportPlace: [
    'Import text near the table title; blank template beside raw export.',
    '表格标题旁的 Import text；原始导出旁的空白模板。',
    'Import text dekat judul tabel; template kosong di samping ekspor raw.',
  ],
  guideUtilitiesTitle: [
    'Keep gas and Water daily',
    '燃气与水仍按日记录',
    'Gas dan Water tetap harian',
  ],
  guideUtilitiesBody: [
    'In 24 HOURS mode, record raw gas observations and any Before/After Refill pairs. Tank mode converts each observation to kg before calculating usage; R32 also needs temperature. Water uses cumulative m³ End minus Start. These sections stay daily, even when electricity is recorded per shift.',
    '在 24 HOURS 模式记录燃气原始读数及加注前后读数。储罐模式先将每次观测换算为 kg，再计算用量；R32 还需温度。水用量为累计 m³ 结束减开始。即使电力按班次记录，燃气和水仍按日记录。',
    'Di mode 24 HOURS, isi observasi gas mentah dan pasangan Before/After Refill jika ada. Mode tangki mengonversi setiap observasi ke kg dahulu; R32 juga perlu suhu. Water memakai m³ kumulatif End dikurangi Start. Keduanya tetap harian meski listrik dicatat per shift.',
  ],
  guideUtilitiesPlace: [
    'Gas consumption, then Water below the electricity table in 24 HOURS.',
    '24 HOURS 模式电表下方的 Gas consumption 和 Water。',
    'Gas consumption, lalu Water di bawah tabel listrik pada 24 HOURS.',
  ],
  guideSaveTitle: [
    'Know where your draft is saved',
    '确认草稿保存位置',
    'Periksa status simpan draft',
  ],
  guideSaveBody: [
    'Incomplete readings are allowed in drafts. A tab copy is kept immediately; account autosave waits 30 seconds idle or 120 seconds of continuous editing. Check the account save status before leaving. Save stores unfinished work as a draft and complete work as a report. Download a private draft backup for extra recovery; resolve conflicts explicitly.',
    '草稿允许未完成读数。标签页副本立即保存，账户自动保存等待空闲 30 秒或连续编辑 120 秒。离开前检查账户保存状态。Save 将未完成内容保存为草稿，完整内容保存为报告。可下载私人草稿备份；冲突需明确选择处理。',
    'Draft boleh belum lengkap. Salinan tab disimpan langsung; autosave akun menunggu 30 detik diam atau 120 detik edit terus. Periksa status simpan akun sebelum keluar. Save menyimpan isian belum lengkap sebagai draft, dan isian lengkap sebagai laporan. Unduh backup draft pribadi untuk pemulihan; pilih penyelesaian konflik secara jelas.',
  ],
  guideSavePlace: [
    'Save controls at the top; Draft backup and restore below.',
    '顶部保存控件；下方的 Draft backup and restore。',
    'Kontrol Save di atas; Draft backup and restore di bawah.',
  ],
  guideCopyTitle: [
    'Choose raw readings or a finished report',
    '选择原始读数或完整报告',
    'Pilih reading raw atau laporan jadi',
  ],
  guideCopyBody: [
    'Export Raw Table Data copies one cumulative reading column with ratios, without consumption or utilities. Results & report checks calculated usage and offers five report combinations. Complete the required periods before copying a finished report. Copying does not save history; use Save report for that.',
    'Export Raw Table Data 复制一列累计读数及倍率，不含用量或公用工程。Results & report 检查计算结果，并提供五种报告组合。复制完整报告前需补齐所需时段。复制不会保存历史，请使用 Save report。',
    'Export Raw Table Data menyalin satu kolom reading kumulatif beserta ratio, tanpa konsumsi atau utilities. Results & report memeriksa hasil dan menyediakan lima kombinasi laporan. Lengkapi periode yang diperlukan sebelum copy laporan jadi. Copy tidak menyimpan histori; gunakan Save report.',
  ],
  guideCopyPlace: [
    'Raw export below the table; Results & report beside it or below on mobile.',
    '表格下方原始导出；Results & report 位于旁边，手机上位于下方。',
    'Ekspor raw di bawah tabel; Results & report di sampingnya atau di bawah pada ponsel.',
  ],
  guideHistoryTitle: ['Reopen saved records', '查看已保存记录', 'Buka kembali laporan tersimpan'],
  guideHistoryBody: [
    'Historian shows reports saved to your account. Filter by factory and period type, then inspect the original saved output. Loading readings opens an editable copy using the current rules; it does not rewrite the saved output. Saving a correction creates a revision. Drafts remain separate from report history.',
    'Historian 显示本账户保存的报告。按工厂及时段类型筛选，查看原始已存输出。加载读数会按当前规则打开可编辑副本，不会改写已存输出。保存更正会生成修订。草稿与报告历史分开。',
    'Historian menampilkan laporan milik akunmu. Filter pabrik dan jenis periode, lalu periksa output asli tersimpan. Memuat reading membuka salinan edit dengan aturan terbaru, tanpa menulis ulang output lama. Menyimpan koreksi membuat revisi. Draft terpisah dari histori laporan.',
  ],
  guideHistoryPlace: [
    'Historian in the Account panel.',
    'Account 面板中的 Historian。',
    'Historian di panel Account.',
  ],
  guideGraphsTitle: [
    'Build graphs from saved history',
    '用已存历史生成图表',
    'Buat grafik dari histori tersimpan',
  ],
  guideGraphsBody: [
    'Graphs uses saved reports and approved imported history, not unsaved edits. Choose factory, period type, dates and series. Split charts as needed; every recorded period keeps its date label. Copy a high-resolution image or download PNG/SVG. Optional Y-axis bounds change the view only, never the saved values.',
    'Graphs 使用已存报告及已批准导入的历史，不包含未保存修改。选择工厂、时段类型、日期和系列，按需拆分图表；每个记录时段保留日期标签。可复制高清图片或下载 PNG/SVG。自定义 Y 轴只影响显示，不改变已存值。',
    'Graphs memakai laporan tersimpan dan histori impor yang disetujui, bukan edit yang belum disimpan. Pilih pabrik, jenis periode, tanggal dan seri. Pisahkan grafik sesuai kebutuhan; setiap periode tetap berlabel tanggal. Copy gambar resolusi tinggi atau unduh PNG/SVG. Batas sumbu Y hanya mengubah tampilan, bukan nilai tersimpan.',
  ],
  guideGraphsPlace: [
    'Graphs in the Account panel.',
    'Account 面板中的 Graphs。',
    'Graphs di panel Account.',
  ],
  guideMockReading: ['End reading', '结束读数', 'Reading akhir'],
  guideMockApply: ['Apply readings', '应用读数', 'Terapkan reading'],
  guideMockSave: ['Save draft', '保存草稿', 'Simpan draft'],
  guideMockCopy: ['Copy report', '复制报告', 'Copy laporan'],
  guideMockOpen: ['Open report', '打开报告', 'Buka laporan'],
  guideMockGraph: ['Copy graph', '复制图表', 'Copy grafik'],
};
