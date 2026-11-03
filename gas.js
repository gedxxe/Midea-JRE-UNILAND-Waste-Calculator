import { GAS_TABLES, GAS_TABLE_VERSION, R32_TEMPERATURES } from './gas-tables.js';
import { UNILAND_GAS_TABLES } from './uniland-gas-tables.js';
import { decimalText, formatNumber, scaledReading } from './numbers.js';
export { GAS_TABLE_VERSION };
export const JRE_GAS_INPUT_VERSION = 'jre-2026-11-r32-kg-v2';
export const gasInputVersion = (plant = 'JRE') =>
  plant === 'JRE' ? JRE_GAS_INPUT_VERSION : gasCalibration(plant).version;
export const validGasVersion = (version, plant = 'JRE') =>
  version === gasCalibration(plant).version || version === gasInputVersion(plant);
export const gasFormatDowngrade = (before, after) =>
  before?.version === JRE_GAS_INPUT_VERSION && after?.version !== JRE_GAS_INPUT_VERSION;
export const gasPointUnit = (point) => point?.unit ?? 'mm';
export const gasObservations = ({ start, end, refills }) => [
  start,
  end,
  ...refills.flatMap((event) => [event.before, event.after]),
];
export function copyGasPoint(point, source, plant, index) {
  if (
    plant === 'JRE' &&
    index === 3 &&
    point?.unit === undefined &&
    source?.version === GAS_TABLE_VERSION
  )
    return { ...point, unit: point.reading === '' && point.temperature === '' ? 'kg' : 'mm' };
  return { ...point };
}
export function syncGasVersion(gas, plant = 'JRE') {
  if (plant === 'JRE' && gas.entries[3]) {
    const points = gasObservations(gas.entries[3]);
    if (!points.some((point) => point?.unit === 'kg' || point?.unit === 'mm')) return gas;
    if (gas.version === GAS_TABLE_VERSION)
      for (const point of points)
        if (point.unit === undefined)
          point.unit = point.reading === '' && point.temperature === '' ? 'kg' : 'mm';
    gas.version = JRE_GAS_INPUT_VERSION;
  }
  return gas;
}
export const GASES = [
  { id: 'LPG', name: 'LPG', unit: '%', min: 1, max: 100 },
  { id: 'O2', name: 'Oxygen', unit: 'mmWC', min: 10, max: 4220 },
  { id: 'N2', name: 'Nitrogen', unit: 'mmH2O', min: 10, max: 3060 },
  { id: 'R32', name: 'Refrigerant R32', unit: 'mm', min: 50, max: 6967 },
];
const CALIBRATIONS = {
  JRE: { version: GAS_TABLE_VERSION, tables: GAS_TABLES, utilities: [0, 1, 2, 3] },
  UNILAND: {
    version: 'uniland-2026-10-v1',
    // All 1,120 R32 mass values and all temperature nodes match the supplied JRE table.
    tables: { ...UNILAND_GAS_TABLES, R32: GAS_TABLES.R32 },
    utilities: [0, 2, 3, 5],
  },
};
for (const calibration of Object.values(CALIBRATIONS))
  calibration.gases = GASES.map((gas, i) => ({
    ...gas,
    min: calibration.tables[gas.id][0][0],
    max: calibration.tables[gas.id].at(-1)[0],
    utilityIndex: calibration.utilities[i],
  }));
export function gasCalibration(plant = 'JRE') {
  const calibration = CALIBRATIONS[plant];
  if (!calibration) throw new Error('Unknown gas plant.');
  return calibration;
}
export const MAX_REFILLS = 10;
export const gasPoint = (id, plant = 'JRE') => ({
  reading: '',
  temperature: '',
  ...(id === 'R32' && plant === 'JRE' ? { unit: 'kg' } : {}),
});
export function createGasDraft(plant = 'JRE') {
  return {
    version: gasInputVersion(plant),
    entries: GASES.map(({ id }) => ({
      enabled: false,
      start: gasPoint(id, plant),
      end: gasPoint(id, plant),
      refills: [],
    })),
  };
}
export function restoreGasDraft(input, plant = 'JRE') {
  if (input === undefined) return createGasDraft(plant);
  if (
    !input ||
    !validGasVersion(input.version, plant) ||
    !Array.isArray(input.entries) ||
    input.entries.length !== GASES.length
  )
    throw new Error('Unknown gas calibration or layout.');
  function point(value, index) {
    if (
      !value ||
      ['reading', 'temperature'].some((k) => typeof value[k] !== 'string' || value[k].length > 50)
    )
      throw new Error('Invalid gas reading.');
    if (
      value.unit !== undefined &&
      (index !== 3 ||
        !['kg', 'mm'].includes(value.unit) ||
        (value.unit === 'kg' && (plant !== 'JRE' || input.version !== JRE_GAS_INPUT_VERSION)))
    )
      throw new Error('Invalid gas reading unit.');
    if (
      plant === 'JRE' &&
      index === 3 &&
      input.version === JRE_GAS_INPUT_VERSION &&
      value.unit === undefined
    )
      throw new Error('Missing R32 reading unit.');
    if (
      plant === 'JRE' &&
      index === 3 &&
      value.unit === undefined &&
      input.version !== JRE_GAS_INPUT_VERSION &&
      value.reading === '' &&
      value.temperature === ''
    )
      return gasPoint('R32', plant);
    return {
      reading: value.reading,
      temperature: value.temperature,
      ...(plant === 'JRE' && index === 3
        ? { unit: value.unit ?? 'mm' }
        : value.unit === 'mm'
          ? { unit: 'mm' }
          : {}),
    };
  }
  return {
    version: gasInputVersion(plant),
    entries: input.entries.map((entry, index) => {
      if (
        !entry ||
        typeof entry.enabled !== 'boolean' ||
        !Array.isArray(entry.refills) ||
        entry.refills.length > MAX_REFILLS
      )
        throw new Error('Invalid gas events.');
      return {
        enabled: entry.enabled,
        start: point(entry.start, index),
        end: point(entry.end, index),
        refills: entry.refills.map((event) => ({
          before: point(event?.before, index),
          after: point(event?.after, index),
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
export function convertGas(id, point, plant = 'JRE') {
  const calibration = gasCalibration(plant);
  const gas = calibration.gases.find((g) => g.id === id);
  if (!gas) throw new Error('Unknown gas.');
  const raw = String(point?.reading ?? '').trim();
  const temp = String(point?.temperature ?? '').trim();
  const normalized = decimalText(raw);
  if (!raw) return { error: 'gasEmpty' };
  if (raw !== '-' && normalized === null) return { error: 'gasNumber' };
  if (point?.unit !== undefined) {
    if (
      id !== 'R32' ||
      !['kg', 'mm'].includes(point.unit) ||
      (point.unit === 'kg' && plant !== 'JRE')
    )
      return { error: 'gasUnit' };
    if (point.unit === 'kg')
      return raw === '-' ? { unavailable: true, kg: null } : { kg: Number(normalized) };
  }
  const level = Number(normalized);
  if (raw !== '-' && (level < gas.min || level > gas.max)) return { error: 'gasRange' };
  let temperature;
  if (id === 'R32' && raw !== '-') {
    if (!/^[+-]?\d+(?:[.,]\d{1,6})?$/.test(temp)) return { error: 'gasTemperature' };
    temperature = Number(temp.replace(',', '.'));
    if (temperature < -20 || temperature > 50) return { error: 'gasTemperature' };
  }
  if (raw === '-') return { unavailable: true, kg: null };
  const rows = calibration.tables[id];
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
export function calculateGas(id, entry, plant = 'JRE') {
  const points = {
    start: convertGas(id, entry.start, plant),
    end: convertGas(id, entry.end, plant),
  };
  entry.refills.forEach((event, i) => {
    points['before' + i] = convertGas(id, event.before, plant);
    points['after' + i] = convertGas(id, event.after, plant);
  });
  const errors = Object.entries(points)
    .filter(([, p]) => p.error)
    .map(([point, p]) => ({ point, code: p.error }));
  const warnings = [];
  if (errors.length) return { points, errors, warnings, kg: null };
  if (Object.values(points).some((p) => p.unavailable))
    return { points, errors, warnings, kg: null, unavailable: true };
  const rawPoints = { start: entry.start, end: entry.end };
  entry.refills.forEach((e, i) => {
    rawPoints['before' + i] = e.before;
    rawPoints['after' + i] = e.after;
  });
  const direct =
    id === 'R32' && plant === 'JRE' && Object.values(rawPoints).every((p) => p.unit === 'kg');
  if (direct) {
    let previous = scaledReading(entry.start.reading),
      refill = 0n;
    for (let i = 0; i < entry.refills.length; i++) {
      const before = scaledReading(entry.refills[i].before.reading),
        after = scaledReading(entry.refills[i].after.reading);
      if (before > previous) warnings.push({ point: 'before' + i, code: 'gasStockIncrease' });
      if (after < before) errors.push({ point: 'after' + i, code: 'gasSequence' });
      refill += after - before;
      previous = after;
    }
    const end = scaledReading(entry.end.reading);
    if (end > previous) warnings.push({ point: 'end', code: 'gasStockIncrease' });
    const balance = scaledReading(entry.start.reading) + refill - end;
    return {
      points,
      errors,
      warnings,
      refillKg: Number(refill) / 1e6,
      directStock: true,
      kg: errors.length ? null : Number(balance) / 1e6,
      kgText: errors.length ? null : scaledGasText(balance),
    };
  }
  let previous = points.start.kg,
    refillKg = 0;
  for (let i = 0; i < entry.refills.length; i++) {
    const before = points['before' + i].kg,
      after = points['after' + i].kg;
    if (before > previous + 1e-7) warnings.push({ point: 'before' + i, code: 'gasStockIncrease' });
    if (after < before - 1e-7) errors.push({ point: 'after' + i, code: 'gasSequence' });
    refillKg += after - before;
    previous = after;
  }
  if (points.end.kg > previous + 1e-7) warnings.push({ point: 'end', code: 'gasStockIncrease' });
  const kg = points.start.kg + refillKg - points.end.kg;
  // Preserve the signed balance: a negative value represents a measured stock increase.
  return { points, errors, warnings, refillKg, kg: errors.length ? null : kg };
}
function scaledGasText(value) {
  const absolute = value < 0n ? -value : value;
  const fraction = String(absolute % 1000000n)
    .padStart(6, '0')
    .replace(/0+$/, '');
  return (value < 0n ? '-' : '') + String(absolute / 1000000n) + (fraction ? '.' + fraction : '');
}
export const gasMassText = (kg, exact) =>
  kg === null || kg === undefined ? '-' : (exact ?? formatNumber(kg, 6));
export function gasUsageText(kg, exact) {
  const text = gasMassText(kg, exact);
  return text.startsWith('-') && text !== '-' ? '+' + text.slice(1) : text;
}
export function nextGasDay(input, plant = 'JRE') {
  const next = createGasDraft(plant);
  if (!input) return next;
  const restored = restoreGasDraft(input, plant);
  restored.entries.forEach((entry, i) => {
    if (!entry.enabled) return;
    const point = convertGas(GASES[i].id, entry.end, plant);
    if (point.error)
      throw new Error(
        GASES[i].name +
          (entry.end.unit === 'kg'
            ? ': complete a valid ending stock reading first.'
            : ': complete a valid ending gas reading and temperature first.'),
      );
    next.entries[i].enabled = true;
    next.entries[i].start = { ...entry.end };
  });
  return next;
}
