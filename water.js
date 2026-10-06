import { scaledReading, formatNumber, decimalText } from './numbers.js';

export function restoreWater(input) {
  if (input === undefined) return undefined;
  if (
    !input ||
    !['start', 'end'].every((side) => typeof input[side] === 'string' && input[side].length <= 50)
  )
    throw new Error('Invalid water readings.');
  return { start: input.start, end: input.end };
}

export function calculateWater(input) {
  const start = input?.start?.trim() || '',
    end = input?.end?.trim() || '';
  if (!start && !end) return { active: false, value: '', error: null };
  if (!start || !end) return { active: true, value: '', error: 'waterIncomplete' };
  const a = scaledReading(start),
    b = scaledReading(end);
  if ((start !== '-' && a === null) || (end !== '-' && b === null))
    return { active: true, value: '', error: 'waterInvalid' };
  if (start === '-' || end === '-') return { active: true, value: '-', error: null };
  if (b < a) return { active: true, value: '-', error: 'waterDecreased' };
  return { active: true, value: formatNumber(Number(b - a) / 1e6, 6), error: null };
}

export function nextWaterDay(input) {
  if (!input) return undefined;
  if (!input.start.trim() && !input.end.trim()) return { start: '', end: '' };
  if (input.end.trim() !== '-' && decimalText(input.end) === null)
    throw new Error('Complete a valid end water reading before moving to the next day.');
  return { start: input.end, end: '' };
}
