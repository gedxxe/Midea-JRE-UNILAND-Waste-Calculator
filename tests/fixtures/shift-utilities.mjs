import { reportPeriods } from './report-periods.mjs';
export function utilityPeriods(plant = 'JRE') {
  const periods = reportPeriods(plant);
  const points = [
    ['1000', '900', '800'],
    ['1000', '900', '800'],
    ['1000', '900', '800'],
    ['1000', '900', '800'],
  ];
  periods.forEach((draft, index) => {
    const a = index === 2 ? 1 : 0,
      b = index === 1 ? 1 : 2;
    draft.water = { start: ['1000', '1010', '1030'][a], end: ['1000', '1010', '1030'][b] };
    draft.gas.entries.forEach((entry, i) => {
      entry.enabled = true;
      const levels = i === 0 ? ['80', '70', '60'] : points[i];
      entry.start = { reading: levels[a], temperature: i === 3 ? ['33.5', '34', '34.5'][a] : '' };
      entry.end = { reading: levels[b], temperature: i === 3 ? ['33.5', '34', '34.5'][b] : '' };
    });
    if (plant === 'UNILAND') {
      draft.utilities[1].value = ['30', '10', '20'][index];
      draft.utilities[6].value = ['3', '1', '2'][index];
    }
  });
  return periods;
}
