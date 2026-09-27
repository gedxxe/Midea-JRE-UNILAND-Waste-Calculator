import { shiftDate } from './numbers.js';

// End readings are exclusive: 18 Sep 08:00 to 21 Sep 08:00 covers 18–20 Sep.
export function periodLabel(start, end) {
  const last = shiftDate(end, -1);
  const short = (date) => date.slice(8) + '/' + date.slice(5, 7);
  if (last === start) return short(start);
  if (start.slice(0, 7) === last.slice(0, 7)) return start.slice(8) + '–' + short(last);
  if (start.slice(0, 4) === last.slice(0, 4)) return short(start) + '–' + short(last);
  return short(start) + '/' + start.slice(2, 4) + '–' + short(last) + '/' + last.slice(2, 4);
}

export function validYAxis(axis) {
  return (
    axis?.mode === 'auto' ||
    (axis?.mode === 'manual' &&
      Number.isFinite(axis.min) &&
      Number.isFinite(axis.max) &&
      axis.min >= 0 &&
      axis.max - axis.min >= 1e-8 &&
      axis.max <= 1e15)
  );
}

export function graphYAxis(values, axis = { mode: 'auto' }) {
  if (!validYAxis(axis)) return null;
  const finite = values.filter(Number.isFinite);
  if (axis.mode === 'manual') {
    return {
      min: axis.min,
      max: axis.max,
      ticks: Array.from({ length: 6 }, (_, i) =>
        i === 5 ? axis.max : axis.min + ((axis.max - axis.min) * i) / 5,
      ),
      clipped: finite.some((v) => v < axis.min || v > axis.max),
    };
  }
  const maximum = Math.max(0, ...finite);
  const rough = maximum / 5;
  const power = rough > 0 ? 10 ** Math.floor(Math.log10(rough)) : 1;
  const scaled = rough / power;
  const step = (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
  const count = Math.max(1, Math.ceil(maximum / step));
  return {
    min: 0,
    max: count * step,
    ticks: Array.from({ length: count + 1 }, (_, i) => i * step),
    clipped: false,
  };
}
