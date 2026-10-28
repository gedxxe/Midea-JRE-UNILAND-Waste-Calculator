export const excelMessages = {
  excelRange: [
    'Excel {start}:{end} · {period}',
    'Excel {start}:{end} · {period}',
    'Excel {start}:{end} · {period}',
  ],
  excelView: ['Excel row', 'Excel 行', 'Baris Excel'],
  excelPaste: [
    'Paste at {start} on the matching {period} row. {count} columns through {end}, without a date. {separator} stays blank.',
    '粘贴到对应{period}行的 {start} 列。共 {count} 列，至 {end}，不含日期。{separator} 保持空白。',
    'Tempel mulai {start} pada baris {period} yang sesuai. {count} kolom sampai {end}, tanpa tanggal. {separator} tetap kosong.',
  ],
  excelUnmapped: [
    'No confirmed Excel column for {names}.',
    '尚未确定 {names} 对应的 Excel 列。',
    'Kolom Excel untuk {names} belum terkonfirmasi.',
  ],
  excelTarget: [
    'Use an empty, unmerged destination row. Pasting replaces cells in this range.',
    '请选择未合并的空白目标行。粘贴会替换该范围的单元格。',
    'Gunakan baris tujuan kosong tanpa merged cells. Paste mengganti sel dalam rentang ini.',
  ],
  excelManual: [
    'Fill in Excel: {columns}.',
    '请在 Excel 中填写：{columns}。',
    'Isi di Excel: {columns}.',
  ],
  excelStock: [
    'Negative gas values mean measured stock increased: {columns}.',
    '气体负值表示实测库存增加：{columns}。',
    'Nilai gas negatif berarti stok terukur meningkat: {columns}.',
  ],
  excelUnits: [
    'Units differ from this template: {columns}. Check these cells.',
    '单位与此模板不同：{columns}。请检查这些单元格。',
    'Satuan berbeda dari template: {columns}. Periksa sel tersebut.',
  ],
  excelDay: ['Day / After production', '白班 / 生产时段', 'Day / After production'],
  excelNight: ['Night shift', '夜班', 'Night shift'],
  excelDaily: ['24 hours', '24小时', '24 jam'],
};
