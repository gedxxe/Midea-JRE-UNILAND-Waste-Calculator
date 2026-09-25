export const gasMessages = {
  gasTitle: ['JRE gas consumption', 'JRE 气体用量', 'Konsumsi gas JRE'],
  gasHint: [
    "Enter tank readings. Each observation is converted to kg before calculating consumption. After Work normally uses the following morning's reading.",
    '填写储罐原始读数。每次读数先换算为 kg，再计算用量。工作后通常使用次日早上的读数。',
    'Isi reading tangki. Setiap reading dikonversi ke kg sebelum menghitung konsumsi. After Work biasanya memakai reading pagi hari berikutnya.',
  ],
  gasSource: [
    'Uses the supplied tank tables. R32 requires temperature for each reading. LPG uses the corrected reference values documented in the workbook.',
    '使用提供的储罐数据表。每次 R32 读数都需填写温度。LPG 使用工作簿中注明修正后的参考值。',
    'Menggunakan tabel tangki yang diberikan. Setiap reading R32 perlu suhu. LPG mengikuti koreksi tabel referensi yang dicatat dalam workbook.',
  ],
  gasEnable: ['Calculate from tank readings', '根据储罐读数计算', 'Hitung dari reading tangki'],
  gasDisabled: [
    'Not using tank readings. Existing manual utility values are preserved below.',
    '未使用储罐读数。下方保留已有的手动用量。',
    'Belum menggunakan reading tangki. Nilai konsumsi manual tetap tersimpan di bagian bawah.',
  ],
  gasCalculated: [
    ' (calculated from tank readings)',
    '（根据储罐读数计算）',
    ' (dihitung dari reading tangki)',
  ],
  gasStart: ['Before Work', '工作前', 'Before Work'],
  gasEnd: ['After Work / next morning', '工作后 / 次日早上', 'After Work / pagi berikutnya'],
  gasBefore: ['Before Refill', '补充前', 'Before Refill'],
  gasAfter: ['After Refill', '补充后', 'After Refill'],
  gasTemperatureLabel: ['Temperature (°C)', '温度 (°C)', 'Suhu (°C)'],
  gasAdd: ['Add refill', '添加补充记录', 'Tambah refill'],
  gasRemove: ['Remove refill {number}', '删除第 {number} 次补充', 'Hapus refill {number}'],
  gasRefill: ['Refill {number}', '第 {number} 次补充', 'Refill {number}'],
  gasTotal: ['Consumption', '用量', 'Konsumsi'],
  gasFormula: [
    'Initial kg + refill kg − final kg. Add refills in time order; without a refill, leave the list empty.',
    '初始 kg + 补充 kg − 最终 kg。按时间顺序添加补充记录；未补充时保持列表为空。',
    'Kg awal + kg refill − kg akhir. Tambahkan refill sesuai urutan waktu; tanpa refill, biarkan daftar kosong.',
  ],
  gasRangeHint: [
    'Range: {min}–{max} {unit}. Use - for unavailable readings.',
    '范围：{min}–{max} {unit}。无法读取时填 -。',
    'Rentang: {min}–{max} {unit}. Isi - jika reading tidak tersedia.',
  ],
  gasTempHint: [
    'R32 temperature: -20 to 50 °C, including decimals. Enter the applicable temperature; there is no automatic default.',
    'R32 温度：-20 至 50 °C，支持小数。请填写适用温度，无自动默认值。',
    'Suhu R32: -20 hingga 50 °C, termasuk desimal. Isi suhu yang digunakan; tidak ada nilai default otomatis.',
  ],
  gasEmpty: ['Enter the raw reading.', '请输入原始读数。', 'Isi reading mentah.'],
  gasNumber: [
    'Use a decimal number without unit suffixes.',
    '请输入小数，不要填写单位。',
    'Gunakan angka desimal tanpa akhiran satuan.',
  ],
  gasRange: [
    'Outside the reference table range.',
    '超出参考表范围。',
    'Di luar rentang tabel referensi.',
  ],
  gasTemperature: [
    'Enter temperature from -20 to 50 °C.',
    '请输入 -20 至 50 °C 的温度。',
    'Isi suhu dari -20 hingga 50 °C.',
  ],
  gasSequence: [
    'Mass increased without a matching refill, or decreased during refill. Check readings, temperatures and event order.',
    '质量在未补充时增加，或在补充时减少。请检查读数、温度和记录顺序。',
    'Massa naik tanpa refill yang sesuai, atau turun saat refill. Periksa reading, suhu, dan urutan pencatatan.',
  ],
  gasUnavailable: [
    'Consumption unavailable: a reading is marked -.',
    '用量不可用：有读数标记为 -。',
    'Konsumsi tidak tersedia: ada reading bertanda -.',
  ],
  gasPending: [
    'Complete the readings to calculate consumption.',
    '填写完整读数以计算用量。',
    'Lengkapi reading untuk menghitung konsumsi.',
  ],
};
