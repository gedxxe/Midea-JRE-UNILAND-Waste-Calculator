import { getLanguage } from './index.js';
import { PLANT_SCHEMAS } from '../schema.js';
import { formatNumber } from '../numbers.js';
export const readingMessages = {
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
    'Use a valid HH:MM WIB time. A blank time uses the selected column.',
    '时间格式为 HH:MM WIB；留空时使用所选列的时间。',
    'Gunakan jam HH:MM WIB yang valid. Jam kosong mengikuti kolom pilihan.',
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
    IMPORT_DATE: 'date',
    IMPORT_TIME: 'time',
    IMPORT_FACTORY: 'factory',
    METER_COUNT: 'count',
    INVALID_READING: 'invalid',
    IMPORT_DUPLICATE: 'duplicate',
    IMPORT_MISSING: 'missing',
    IMPORT_SYNTAX: 'syntax',
    IMPORT_EMPTY: 'empty',
    EMPTY_READING: 'pair',
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
