import { createDraft, createWorkingHoursDraft, createNightShiftDraft } from '../../engine.js';
import { shiftDate } from '../../numbers.js';
import { PLANT_SCHEMAS } from '../../schema.js';
export function reportPeriods(plant = 'JRE', date = '2026-09-16') {
  const daily = createDraft(plant, date, shiftDate(date, 1)),
    after = createWorkingHoursDraft(plant, date),
    night = createNightShiftDraft(plant, date);
  for (const [i, row] of daily.rows.entries()) {
    row.start.fill('1000');
    row.end.fill('1010');
    after.rows[i].start.fill('1000');
    after.rows[i].end.fill('1004');
    night.rows[i].start.fill('1004');
    night.rows[i].end.fill('1010');
  }
  if (plant === 'JRE') {
    for (const name of ['Structural Laboratory', 'Electricity Building 3#']) {
      const index = PLANT_SCHEMAS.JRE.rows.findIndex((row) => row.name === name);
      daily.rows[index].end = ['2000'];
      after.rows[index].end = ['1400'];
      night.rows[index].start = ['1400'];
      night.rows[index].end = ['2000'];
    }
    daily.rows[15].end[2] = '2000';
    after.rows[15].end[2] = '1400';
    night.rows[15].start[2] = '1400';
    night.rows[15].end[2] = '2000';
    // Building 2 includes HE, selected Indoor/Outdoor/Window meters and the Station.
    daily.rows[18].end[0] = '4000';
    after.rows[18].end[0] = '2200';
    night.rows[18].start[0] = '2200';
    night.rows[18].end[0] = '4000';
  }
  daily.utilities[0].value = '3';
  daily.water = { start: '100', end: '102' };
  return [daily, after, night];
}
