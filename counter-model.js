// David Haz, MIT + Commons Clause: asset/licenses/react-bits.txt.
// React Bits Counter slot/turn model adapted for already-formatted reporting values.
// Never convert a complete meter result to Number or reformat the engine's exact text.
export const mod = (value, base) => ((value % base) + base) % base;
export const wrap = (offset) => mod(offset + 5, 10) - 5;
export function stepBetween(from, to, direction) {
  const up = mod(to - from, 10);
  if (direction === 'up') return up;
  if (direction === 'down') return up === 0 ? 0 : up - 10;
  return up > 5 ? up - 10 : up;
}
const amount = (text) => /^([+-]?)(\d+)(?:\.(\d+))?(\s[A-Za-z³₂0-9]+)?$/.exec(text);
export function counterSlots(text, clock = false) {
  if (typeof text !== 'string' || text.length > 100) return null;
  if (clock) {
    if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(text)) return null;
    return [...text].map((char, i) => ({
      key: 'c' + i,
      kind: char === ':' ? 'symbol' : 'digit',
      text: char,
      digit: char === ':' ? 0 : Number(char),
      rank: i,
    }));
  }
  const match = amount(text);
  if (!match) return null;
  const [, sign, integer, fraction, suffix] = match;
  const slots = [];
  if (sign) slots.push({ key: 'sign', kind: 'symbol', text: sign, rank: -1000 });
  [...integer].forEach((char, i) => {
    const place = integer.length - i - 1;
    slots.push({
      key: 'i' + place,
      kind: 'digit',
      digit: Number(char),
      text: char,
      rank: -2 * place,
    });
  });
  if (fraction !== undefined) {
    slots.push({ key: 'decimal', kind: 'symbol', text: '.', rank: 0.5 });
    [...fraction].forEach((char, i) =>
      slots.push({ key: 'f' + i, kind: 'digit', digit: Number(char), text: char, rank: i + 1 }),
    );
  }
  if (suffix) slots.push({ key: 'suffix', kind: 'symbol', text: suffix, rank: 1000 });
  return slots;
}
export function counterTrend(before, after) {
  const a = amount(before),
    b = amount(after);
  if (!a || !b) return 'shortest';
  const whole = (s) => s.replace(/^0+(?=\d)/, '');
  const aw = whole(a[2]),
    bw = whole(b[2]);
  let comparison = bw.length - aw.length || (bw > aw ? 1 : bw < aw ? -1 : 0);
  if (!comparison) {
    const length = Math.max(a[3]?.length || 0, b[3]?.length || 0),
      af = (a[3] || '').padEnd(length, '0'),
      bf = (b[3] || '').padEnd(length, '0');
    comparison = bf > af ? 1 : bf < af ? -1 : 0;
  }
  return comparison > 0 ? 'up' : comparison < 0 ? 'down' : 'shortest';
}
export function nextClockSecond(before, after) {
  if (!counterSlots(before, true) || !counterSlots(after, true)) return false;
  const seconds = (s) => s.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
  return mod(seconds(after) - seconds(before), 86400) === 1;
}
