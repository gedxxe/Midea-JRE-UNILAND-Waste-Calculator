import { reportPeriods } from './report-periods.mjs';
import { createGasDraft } from '../../gas.js';
export function excelWorkspace(zero = false) {
  const workspace = { version: 4, drafts: {}, workingHours: {}, nightShifts: {} };
  for (const plant of ['JRE', 'UNILAND']) {
    const periods = reportPeriods(plant, '2026-10-27');
    for (const [mode, draft] of periods.entries()) {
      draft.gas = createGasDraft(plant);
      draft.utilities.forEach((u) => {
        u.value = '';
        u.note = '';
      });
      if (zero) {
        draft.rows.forEach((r) => {
          r.start.fill('1000');
          r.end.fill('1000');
        });
        draft.water = { start: '', end: '' };
      } else {
        for (const [i, start, step] of [
          [0, 60, 10],
          [1, 600, 100],
          [2, 600, 100],
          [3, 1000, 100],
        ]) {
          const point = (reading) => ({
            reading: String(reading),
            temperature: i === 3 ? '30' : '',
          });
          draft.gas.entries[i] = {
            enabled: true,
            start: point(start - (mode === 2 ? step : 0)),
            end: point(start - (mode === 1 ? step : 2 * step)),
            refills: [],
          };
        }
        draft.water = { start: mode === 2 ? '108' : '100', end: mode === 1 ? '108' : '120' };
        if (plant === 'JRE')
          draft.additionalReadings = [0, 1, 2, 3].map((i) => ({
            start: String((i + 1) * 100 + (mode === 2 ? 4 * (i + 1) : 0)),
            end: String((i + 1) * 100 + (mode === 1 ? 4 : 10) * (i + 1)),
          }));
        else {
          draft.utilities[1].value = String([200, 90, 110][mode]);
          draft.utilities[6].value = String([3, 1, 2][mode]);
        }
      }
    }
    ['drafts', 'workingHours', 'nightShifts'].forEach(
      (key, i) => (workspace[key][plant] = periods[i]),
    );
  }
  return workspace;
}
