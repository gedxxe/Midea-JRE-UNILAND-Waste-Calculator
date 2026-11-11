import { calculateWater, restoreWater, nextWaterDay } from './water.js';
import { scaledReading, validDate } from './numbers.js';
import { observationTime } from './reading-period.js';
import { PLANT_SCHEMAS } from './schema.js';

export const AIR_FLOW_FROM = '2026-11-12T08:00';
export const COMPRESSOR_EQUIPMENT = Object.freeze([
  'New Air Compressor 1#',
  'New Air Compressor 2#',
  'Dryer and Cooling Tower New Air Compressor',
  'Air Compressor 1#',
]);
const compressorRows = COMPRESSOR_EQUIPMENT.map((name) => {
  const index = PLANT_SCHEMAS.JRE.rows.findIndex((row) => row.name === name);
  return { index, factors: PLANT_SCHEMAS.JRE.rows[index].factors };
});
export function restoreAirCompressor(input) {
  try {
    return restoreWater(input);
  } catch {
    throw Error('Invalid Air Compressor readings.');
  }
}
export function nextAirCompressorDay(input) {
  try {
    return nextWaterDay(input);
  } catch {
    throw Error('Complete a valid end Air Compressor reading before moving to the next day.');
  }
}

const scaledText = (v) =>
  (v / 1000000n).toString() +
  (v % 1000000n ? '.' + (v % 1000000n).toString().padStart(6, '0').replace(/0+$/, '') : '');

export function calculateAirCompressor(draft, rows = []) {
  const applicable =
    draft.plantKey === 'JRE' &&
    validDate(draft.startDate) &&
    draft.startDate + 'T' + observationTime(draft, 'start') >= AIR_FLOW_FROM;
  const flow = calculateWater(draft.airCompressor);
  const result = { ...flow, applicable, ratio: '', electricity: '' };
  if (!applicable) return { ...result, active: false, value: '' };
  if (flow.active && !flow.error && flow.value !== '-')
    result.value = scaledText(
      scaledReading(draft.airCompressor.end) - scaledReading(draft.airCompressor.start),
    );
  const denominator = scaledReading(result.value);
  if (flow.error || denominator === null || denominator === 0n) return result;
  let energy = 0n;
  for (const { index, factors } of compressorRows) {
    const row = rows[index];
    if (!row || row.missing || !Number.isFinite(row.totalEnergy)) return result;
    if (row.totalEnergy === 0) continue;
    const input = draft.rows[index];
    for (const [meter, factor] of factors.entries()) {
      const start = scaledReading(input.start[meter]),
        end = scaledReading(input.end[meter]);
      if (start === null || end === null || end < start) return result;
      energy += (end - start) * BigInt(factor);
    }
  }
  result.electricity = scaledText(energy);
  // Round the ratio to six places without floating-point subtraction or division by zero.
  const ratio = (energy * 1000000n + denominator / 2n) / denominator;
  result.ratio = scaledText(ratio);
  return result;
}
