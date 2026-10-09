import { PLANT_SCHEMAS } from './schema.js';

export const JRE_METER_LAYOUT = 2;
export const UNILAND_METER_LAYOUT = 2;
export const LEGACY_JRE_FACTORS = { 3: [1, 90, 90, 40, 40], 15: [40], 25: [40, 1, 1] };

export function moveLegacyValues(values) {
  const moved = values.map((row) => [...row]);
  moved[3].push(moved[25][2]);
  moved[15].push(moved[25][1]);
  moved[25] = [moved[25][0]];
  return moved;
}

export function moveLegacyIssues(issues) {
  return (Array.isArray(issues) ? issues : []).map((issue) => {
    if (issue?.rowIndex !== 25 || ![1, 2].includes(issue.meterIndex)) return issue;
    const rowIndex = issue.meterIndex === 1 ? 15 : 3;
    const meterIndex = issue.meterIndex === 1 ? 1 : 5;
    const message =
      typeof issue.message === 'string'
        ? issue.message.replace(
            `Warehouse Area, meter ${issue.meterIndex + 1}:`,
            `${PLANT_SCHEMAS.JRE.rows[rowIndex].name}, meter ${meterIndex + 1}:`,
          )
        : issue.message;
    return { ...issue, rowIndex, meterIndex, message };
  });
}

// Upgrade an editable copy only. Stored report outputs and graph history stay untouched.
export function migrateMeterLayout(input) {
  if (input?.plantKey === 'UNILAND') {
    if (input.meterLayout === UNILAND_METER_LAYOUT) return input;
    if (input.meterLayout !== undefined && input.meterLayout !== 1)
      throw new Error('Unknown meter layout.');
    if (
      input.rows?.length !== 28 ||
      input.rows.some((row) =>
        ['start', 'end'].some((side) => !Array.isArray(row?.[side]) || row[side].length !== 1),
      )
    )
      throw new Error('Invalid legacy meter layout.');
    const next = structuredClone(input);
    next.rows = PLANT_SCHEMAS.UNILAND.rows.map((row) =>
      row.legacyIndex < 28
        ? structuredClone(input.rows[row.legacyIndex])
        : { start: row.factors.map(() => ''), end: row.factors.map(() => ''), inactive: false },
    );
    next.importIssues = (input.importIssues || []).map((issue) => ({
      ...issue,
      rowIndex: PLANT_SCHEMAS.UNILAND.rows.findIndex((row) => row.legacyIndex === issue.rowIndex),
    }));
    next.meterLayout = UNILAND_METER_LAYOUT;
    return next;
  }
  if (input?.plantKey !== 'JRE') return input;
  if (input.meterLayout !== undefined && ![1, JRE_METER_LAYOUT].includes(input.meterLayout))
    throw new Error('Unknown meter layout.');
  if (input.meterLayout === JRE_METER_LAYOUT) return input;
  const rows = input.rows;
  const legacy =
    rows?.length === PLANT_SCHEMAS.JRE.rows.length &&
    rows.every((row, i) =>
      ['start', 'end'].every(
        (side) =>
          Array.isArray(row?.[side]) &&
          row[side].length === (LEGACY_JRE_FACTORS[i] || PLANT_SCHEMAS.JRE.rows[i].factors).length,
      ),
    );
  if (!legacy) {
    if (input.meterLayout === 1) throw new Error('Invalid legacy meter layout.');
    return input;
  }
  const next = structuredClone(input);
  for (const side of ['start', 'end']) {
    const moved = moveLegacyValues(rows.map((row) => row[side]));
    next.rows.forEach((row, i) => {
      row[side] = moved[i];
    });
  }
  next.meterLayout = JRE_METER_LAYOUT;
  next.importIssues = moveLegacyIssues(input.importIssues);
  return next;
}
