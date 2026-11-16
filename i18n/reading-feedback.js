import { getLanguage } from './index.js';
import { PLANT_SCHEMAS } from '../schema.js';
import { formatNumber } from '../numbers.js';
export const readingMessages = {
  invalidPeriod: [
    'Choose a valid period with End after Start, or turn off the multi-day range option.',
    '请选择结束晚于开始的有效时段，或关闭多日范围选项。',
    'Pilih periode valid dengan akhir setelah awal, atau matikan opsi rentang beberapa hari.',
  ],
  target: [
    'Import into {start} → {end} WIB.',
    '导入至 {start} → {end} WIB。',
    'Impor ke {start} → {end} WIB.',
  ],
  context: [
    'Period boundary follows the reading header; refill values and order are unchanged. Event times are not inferred.',
    '时段边界按读数标题调整；补充量和顺序不变，不推断补充事件时间。',
    'Batas periode mengikuti header reading; nilai dan urutan refill tetap. Jam kejadian refill tidak diasumsikan.',
  ],
  loadFailed: [
    'Could not load the destination period. Nothing was imported. Check the connection or resolve the autosave conflict, then retry.',
    '无法加载目标时段，未导入任何数据。请检查连接或解决自动保存冲突后重试。',
    'Periode tujuan belum bisa dimuat. Tidak ada data yang diimpor. Periksa koneksi atau selesaikan konflik autosave, lalu coba lagi.',
  ],
  flow: [
    'Line {line}: enter Air Compressor flow once, in Nm³. Use a nonnegative number, ____ for blank or - for unavailable.',
    '第{line}行：压缩空气流量只能填写一次，单位为Nm³。使用非负数，空白写____，不可用写-。',
    'Baris {line}: isi flow Air Compressor sekali, dalam Nm³. Gunakan angka nonnegatif, ____ untuk kosong atau - jika tidak tersedia.',
  ],
  size: [
    'Text is too long. Paste one reading column only.',
    '文本过长，请仅粘贴一列读数。',
    'Teks terlalu panjang. Tempel satu kolom reading saja.',
  ],
  format: [
    '{plant}: {rows} equipment, {meters} meters.',
    '{plant}：{rows} 项设备，{meters} 个电表。',
    '{plant}: {rows} equipment, {meters} meter.',
  ],
  imported: ['Imported {count} readings.', '已导入 {count} 个读数。', '{count} reading diimpor.'],
  kept: [
    'Blank fields keep existing readings only at the same date and time.',
    '空白项仅保留同一日期和时间已有的读数。',
    'Kolom kosong mempertahankan reading hanya pada tanggal dan jam yang sama.',
  ],
  date: [
    'Enter one reading date in DD/MM/YYYY format.',
    '请填写一个抄表日期，格式为 DD/MM/YYYY。',
    'Isi satu tanggal reading dalam format DD/MM/YYYY.',
  ],
  time: [
    'Use HH:MM WIB or a range such as 07:00-08:00 WIB. The range start is used; a blank time follows the selected column.',
    '请输入HH:MM WIB或07:00-08:00 WIB等时间段，使用起始时间；留空时使用所选列的时间。',
    'Gunakan HH:MM WIB atau rentang seperti 07:00-08:00 WIB. Dipakai jam awal; jam kosong mengikuti kolom pilihan.',
  ],
  timeRange: [
    'Time range uses {time} WIB.',
    '时间段使用起始时间{time} WIB。',
    'Rentang memakai jam awal {time} WIB.',
  ],
  dateRange: [
    'Date range uses {date}.',
    '日期段使用起始日期{date}。',
    'Rentang memakai tanggal awal {date}.',
  ],
  dailyTime: [
    '24 HOURS keeps its 08:00 WIB boundary; the reading window does not change the report time.',
    '24 HOURS保持08:00 WIB边界，抄表时间段不改变报表时间。',
    '24 HOURS tetap memakai batas 08.00 WIB; rentang pencatatan tidak mengubah jam laporan.',
  ],
  observation: [
    'Using the reading header: {date} {time} WIB.',
    '按读数标题使用{date} {time} WIB。',
    'Mengikuti header reading: {date} {time} WIB.',
  ],
  factory: [
    'These readings are for {factory}. Select that factory first.',
    '这些读数属于 {factory}，请先选择该工厂。',
    'Reading ini untuk {factory}. Pilih pabrik tersebut dahulu.',
  ],
  count: [
    '{name}: needs {expected} readings; found {found}. Separate meters with +.',
    '{name}：需要 {expected} 个读数，当前有 {found} 个。电表之间用 + 分隔。',
    '{name}: ada {found} dari {expected} reading. Pisahkan meter dengan +.',
  ],
  invalid: [
    '{name}, meter {meter}: use a number, ____ for blank, or - if unavailable.',
    '{name}，电表 {meter}：填写数字，空白填 ____，无法获取时填 -。',
    '{name}, meter {meter}: isi angka, ____ untuk kosong, atau - jika tidak tersedia.',
  ],
  optionalMeter: [
    '{name}, meter {meter}: no complete reading pair. Contribution is 0 kWh; this is not a measured zero.',
    '{name}，电表 {meter}：读数不完整，计入0 kWh；并非实测用量为零。',
    '{name}, meter {meter}: pasangan reading belum lengkap. Kontribusi 0 kWh; bukan nol hasil pengukuran.',
  ],
  duplicate: [
    '{name}: repeated equipment line. Keep one line per equipment.',
    '{name}：设备行重复，每项设备只保留一行。',
    '{name}: baris equipment berulang. Gunakan satu baris per equipment.',
  ],
  missing: [
    '{name}: line missing. Use the current blank template.',
    '{name}：缺少此设备行，请使用最新空白模板。',
    '{name}: baris belum ada. Gunakan template kosong terbaru.',
  ],
  syntax: [
    'Line {line}: use Equipment: reading + reading.',
    '第 {line} 行：格式为 设备: 读数 + 读数。',
    'Baris {line}: gunakan Equipment: reading + reading.',
  ],
  empty: [
    'Fill at least one reading before importing. ____ and empty cells are left blank.',
    '请至少填写一个读数。____ 和空单元格视为空白。',
    'Isi minimal satu reading sebelum impor. ____ dan sel kosong tetap kosong.',
  ],
  more: [
    '{count} more items to check.',
    '另有 {count} 项需要检查。',
    'Masih ada {count} bagian untuk diperiksa.',
  ],
  high: [
    'Included meters exceed {name} by {excess} {unit}.',
    '下级电表用量比 {name} 高 {excess} {unit}。',
    'Total submeter melebihi {name} sebesar {excess} {unit}.',
  ],
  dependency: [
    '{name}: complete the included meter readings.',
    '{name}：请补齐下级电表读数。',
    '{name}: lengkapi reading submeter terkait.',
  ],
  parent: ['Parent meter', '上级电表', 'Meter induk'],
  total: ['Included total', '下级合计', 'Total submeter'],
  meter: ['Meter {meter}', '电表 {meter}', 'Meter {meter}'],
  pair: [
    '{name}, meter {meter}: enter both Start and End readings.',
    '{name}，电表 {meter}：请填写开始和结束读数。',
    '{name}, meter {meter}: isi reading awal dan akhir.',
  ],
  ratio: [
    '{name}, meter {meter}: entered ratio {input}; equipment ratio {expected} is used.',
    '{name}，电表 {meter}：输入倍率 {input}，按设备倍率 {expected} 计算。',
    '{name}, meter {meter}: ratio tertulis {input}; perhitungan memakai ratio equipment {expected}.',
  ],
};
export function readingText(key, values = {}) {
  const message = readingMessages[key][['en', 'zh-CN', 'id'].indexOf(getLanguage())];
  return message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}
export function readingIssueMessage(issue, plant) {
  const row = PLANT_SCHEMAS[plant]?.rows[issue.rowIndex],
    name = row ? row.name + ' (' + row.no + ')' : '';
  const values = {
    name,
    meter: (issue.meterIndex ?? 0) + 1,
    line: issue.sourceLine ?? '?',
    factory: issue.factory,
    expected: issue.expected,
    found: issue.found,
    date: issue.date,
    time: issue.time,
  };
  if (issue.comparison) {
    const c = issue.comparison;
    return readingText(issue.code === 'DEPENDENCY_UNAVAILABLE' ? 'dependency' : 'high', {
      name:
        c.parent.name +
        (c.parent.meterIndex === null
          ? ''
          : ', ' + readingText('meter', { meter: c.parent.meterIndex + 1 })),
      excess: formatNumber(c.excess, 8),
      unit: c.parent.unit,
    });
  }
  const key = {
    IMPORT_SIZE: 'size',
    IMPORT_LOAD: 'loadFailed',
    IMPORT_PERIOD: 'invalidPeriod',
    IMPORT_FLOW: 'flow',
    IMPORT_DATE: 'date',
    IMPORT_TIME: 'time',
    IMPORT_TIME_RANGE: 'timeRange',
    IMPORT_DATE_RANGE: 'dateRange',
    IMPORT_DAILY_TIME: 'dailyTime',
    IMPORT_OBSERVATION: 'observation',
    IMPORT_CONTEXT: 'context',
    IMPORT_FACTORY: 'factory',
    METER_COUNT: 'count',
    INVALID_READING: 'invalid',
    IMPORT_DUPLICATE: 'duplicate',
    IMPORT_MISSING: 'missing',
    IMPORT_SYNTAX: 'syntax',
    IMPORT_EMPTY: 'empty',
    EMPTY_READING: 'pair',
    OPTIONAL_METER_UNAVAILABLE: 'optionalMeter',
  }[issue.code];
  if (key) return readingText(key, values);
  if (issue.code === 'RATIO_MISMATCH' && row && Number.isFinite(issue.inputRatio))
    return readingText('ratio', {
      ...values,
      input: issue.inputRatio,
      expected: row.factors[issue.meterIndex],
    });
  return issue.message;
}
export function importFeedback(parsed, plant) {
  const lines = parsed.issues.slice(0, 5).map((i) => readingIssueMessage(i, plant));
  if (parsed.issues.length > 5)
    lines.push(readingText('more', { count: parsed.issues.length - 5 }));
  return lines.join('\n');
}
