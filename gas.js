import { GAS_TABLES, GAS_TABLE_VERSION, R32_TEMPERATURES } from './gas-tables.js';
import { decimalText, formatNumber } from './numbers.js';
export { GAS_TABLE_VERSION };
export const GASES = [
  { id: 'LPG', name: 'LPG', unit: '%', min: 1, max: 100 },
  { id: 'O2', name: 'Oxygen', unit: 'mmWC', min: 10, max: 4220 },
  { id: 'N2', name: 'Nitrogen', unit: 'mmH2O', min: 10, max: 3060 },
  { id: 'R32', name: 'Refrigerant R32', unit: 'mm', min: 50, max: 6967 },
];
export const MAX_REFILLS = 10;
export const gasPoint = () => ({ reading: '', temperature: '' });
export function createGasDraft() {
  return {
    version: GAS_TABLE_VERSION,
    entries: GASES.map(() => ({ enabled: false, start: gasPoint(), end: gasPoint(), refills: [] })),
  };
}
export function restoreGasDraft(input) {
  if (input === undefined) return createGasDraft();
  if (
    !input ||
    input.version !== GAS_TABLE_VERSION ||
    !Array.isArray(input.entries) ||
    input.entries.length !== GASES.length
  )
    throw new Error('Unknown gas calibration or layout.');
  function point(value) {
    if (
      !value ||
      ['reading', 'temperature'].some((k) => typeof value[k] !== 'string' || value[k].length > 50)
    )
      throw new Error('Invalid gas reading.');
    return { reading: value.reading, temperature: value.temperature };
  }
  return {
    version: GAS_TABLE_VERSION,
    entries: input.entries.map((entry) => {
      if (
        !entry ||
        typeof entry.enabled !== 'boolean' ||
        !Array.isArray(entry.refills) ||
        entry.refills.length > MAX_REFILLS
      )
        throw new Error('Invalid gas events.');
      return {
        enabled: entry.enabled,
        start: point(entry.start),
        end: point(entry.end),
        refills: entry.refills.map((event) => ({
          before: point(event?.before),
          after: point(event?.after),
        })),
      };
    }),
  };
}
function bracket(values, input) {
  let low = 0,
    high = values.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (values[middle] <= input) low = middle;
    else high = middle;
  }
  return low;
}
// Return a status rather than inventing a mass for blank/out-of-table input.
export function convertGas(id, point) {
  const gas = GASES.find((g) => g.id === id);
  if (!gas) throw new Error('Unknown gas.');
  const raw = String(point?.reading ?? '').trim();
  const temp = String(point?.temperature ?? '').trim();
  const normalized = decimalText(raw);
  if (!raw) return { error: 'gasEmpty' };
  if (raw !== '-' && normalized === null) return { error: 'gasNumber' };
  const level = Number(normalized);
  if (raw !== '-' && (level < gas.min || level > gas.max)) return { error: 'gasRange' };
  let temperature;
  if (id === 'R32' && raw !== '-') {
    if (!/^[+-]?\d+(?:[.,]\d{1,6})?$/.test(temp)) return { error: 'gasTemperature' };
    temperature = Number(temp.replace(',', '.'));
    if (temperature < -20 || temperature > 50) return { error: 'gasTemperature' };
  }
  if (raw === '-') return { unavailable: true, kg: null };
  const rows = GAS_TABLES[id];
  const i = bracket(
    rows.map((row) => row[0]),
    level,
  );
  const f = (level - rows[i][0]) / (rows[i + 1][0] - rows[i][0]);
  let lower = rows[i][1],
    upper = rows[i + 1][1];
  if (id === 'R32') {
    const j = bracket(R32_TEMPERATURES, temperature);
    const q = (temperature - R32_TEMPERATURES[j]) / (R32_TEMPERATURES[j + 1] - R32_TEMPERATURES[j]);
    lower = rows[i][j + 1] + q * (rows[i][j + 2] - rows[i][j + 1]);
    upper = rows[i + 1][j + 1] + q * (rows[i + 1][j + 2] - rows[i + 1][j + 1]);
  }
  return { kg: lower + f * (upper - lower) };
}
export function calculateGas(id, entry) {
  const points = { start: convertGas(id, entry.start), end: convertGas(id, entry.end) };
  entry.refills.forEach((event, i) => {
    points['before' + i] = convertGas(id, event.before);
    points['after' + i] = convertGas(id, event.after);
  });
  const errors = Object.entries(points)
    .filter(([, p]) => p.error)
    .map(([point, p]) => ({ point, code: p.error }));
  if (errors.length) return { points, errors, kg: null };
  if (Object.values(points).some((p) => p.unavailable))
    return { points, errors, kg: null, unavailable: true };
  let previous = points.start.kg,
    refillKg = 0;
  for (let i = 0; i < entry.refills.length; i++) {
    const before = points['before' + i].kg,
      after = points['after' + i].kg;
    if (before > previous + 1e-7 || after < before - 1e-7)
      errors.push({ point: 'before' + i, code: 'gasSequence' });
    refillKg += after - before;
    previous = after;
  }
  if (points.end.kg > previous + 1e-7) errors.push({ point: 'end', code: 'gasSequence' });
  const kg = points.start.kg + refillKg - points.end.kg;
  return { points, errors, refillKg, kg: errors.length ? null : Math.max(0, kg) };
}
export const gasMassText = (kg) => (kg === null || kg === undefined ? '-' : formatNumber(kg, 6));
export function nextGasDay(input) {
  const next = createGasDraft();
  if (!input) return next;
  const restored = restoreGasDraft(input);
  restored.entries.forEach((entry, i) => {
    if (!entry.enabled) return;
    const point = convertGas(GASES[i].id, entry.end);
    if (point.error)
      throw new Error(
        GASES[i].name + ': complete a valid ending gas reading and temperature first.',
      );
    next.entries[i].enabled = true;
    next.entries[i].start = { ...entry.end };
  });
  return next;
}
