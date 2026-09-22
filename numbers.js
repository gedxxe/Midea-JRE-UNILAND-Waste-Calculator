// A single comma or dot is a decimal separator, never a thousands separator.
export function decimalText(raw) {
  const text = String(raw ?? '').trim();
  if (!/^[+]?\d+(?:[.,]\d{1,6})?$/.test(text)) return null;
  const normalized = text.replace(',', '.').replace(/^\+/, '');
  if (Number(normalized) > 1e12) return null;
  return normalized;
}

export function parseFlexibleNumber(raw) {
  const text = decimalText(raw);
  return text === null ? NaN : Number(text);
}

// Subtract large cumulative counters as integers to retain their decimal digits.
export function scaledReading(raw) {
  const text = decimalText(raw);
  if (text === null) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}

export function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/&/g, ' and ')
    .replace(/[\s\-_]+/g, ' ').replace(/\s+#/g, '#').trim();
}

export function round(value, digits = 6) { return Number(value.toFixed(digits)); }

export function formatNumber(value, digits = 6) {
  if (!Number.isFinite(value)) return '-';
  const fixed = value.toFixed(digits);
  const trimmed = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
  return trimmed === '-0' ? '0' : trimmed;
}

export function validDate(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

export function shiftDate(value, days) {
  if (!validDate(value)) return '';
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function dayDiff(start, end) {
  return validDate(start) && validDate(end)
    ? (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 : null;
}

export function formatReportDate(value) {
  if (!validDate(value)) return 'DATE UNKNOWN';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })
    .format(new Date(`${value}T00:00:00Z`)).toUpperCase();
}
