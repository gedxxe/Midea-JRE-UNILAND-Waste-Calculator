import { scaledReading, formatNumber, decimalText } from './numbers.js';

export const ADDITIONAL_METERS = ['T1', 'T2', 'T3', 'T4'];
export const emptyAdditionalReadings = () => ADDITIONAL_METERS.map(() => ({ start: '', end: '' }));

export function restoreAdditionalReadings(input) {
  if (input === undefined) return undefined;
  if (
    !Array.isArray(input) ||
    input.length !== 4 ||
    input.some(
      (row) =>
        !row ||
        ['start', 'end'].some((side) => typeof row[side] !== 'string' || row[side].length > 50),
    )
  )
    throw new Error('Invalid additional readings.');
  return input.map(({ start, end }) => ({ start, end }));
}

export function calculateAdditionalReadings(input) {
  return ADDITIONAL_METERS.map((name, i) => {
    const start = input?.[i]?.start?.trim() || '',
      end = input?.[i]?.end?.trim() || '';
    let value = '',
      error = null;
    const active = Boolean(start || end);
    if (active) {
      const a = scaledReading(start),
        b = scaledReading(end);
      if (!start || !end) error = 'additionalIncomplete';
      else if ((start !== '-' && a === null) || (end !== '-' && b === null))
        error = 'additionalInvalid';
      else if (start === '-' || end === '-') {
        value = '-';
        error = 'additionalUnavailable';
      } else if (b < a) {
        value = '-';
        error = 'additionalDecreased';
      } else value = formatNumber(Number(b - a) / 1e6, 6);
    }
    return { name, active, value, error };
  });
}

export function nextAdditionalReadings(input) {
  if (!input) return undefined;
  return input.map(({ start, end }, i) => {
    if ((start.trim() || end.trim()) && end.trim() !== '-' && decimalText(end) === null)
      throw new Error(
        `${ADDITIONAL_METERS[i]}: complete a valid end reading before moving to the next day.`,
      );
    return { start: end, end: '' };
  });
}
