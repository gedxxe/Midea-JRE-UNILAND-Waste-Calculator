import { PLANT_SCHEMAS } from './schema.js';

export const JRE_METER_LAYOUT = 4;
export const UNILAND_METER_LAYOUT = 4;
export const LEGACY_JRE_FACTORS = {
  3: [1, 90, 90, 40, 40],
  4: [1],
  15: [40],
  16: [1],
  25: [40, 1, 1],
};
export const JRE_LAYOUT3_FACTORS = { 3: [1, 90, 90, 40, 40, 1], 15: [40, 1] };
export const JRE_LAYOUT2_FACTORS = { ...JRE_LAYOUT3_FACTORS, 4: [1], 16: [1] };

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
    if (input.meterLayout !== undefined && ![1, 2, 3].includes(input.meterLayout))
      throw new Error('Unknown meter layout.');
    const version = input.meterLayout || 1;
    const oldCount = { 1: 28, 2: 30, 3: 31 }[version];
    const oldIndex = (row) =>
      version === 3
        ? row.layout3No
          ? Number(row.layout3No) - 1
          : -1
        : version === 2
          ? row.previousNo
            ? Number(row.previousNo) - 1
            : -1
          : row.legacyIndex < 28
            ? row.legacyIndex
            : -1;
    const oldFactors = (row) =>
      version < 3 && (version === 1 || [4, 5, 6, 7, 8, 11].includes(row.legacyIndex))
        ? [row.factors[0]]
        : row.factors;
    if (
      input.rows?.length !== oldCount ||
      PLANT_SCHEMAS.UNILAND.rows.some((row) => {
        const index = oldIndex(row);
        return (
          index >= 0 &&
          ['start', 'end'].some(
            (side) =>
              !Array.isArray(input.rows[index]?.[side]) ||
              input.rows[index][side].length !== oldFactors(row).length,
          )
        );
      })
    )
      throw new Error('Invalid legacy meter layout.');
    const next = structuredClone(input);
    next.rows = PLANT_SCHEMAS.UNILAND.rows.map((row) => {
      const index = oldIndex(row);
      if (index < 0)
        return {
          start: row.factors.map(() => ''),
          end: row.factors.map(() => ''),
          inactive: false,
        };
      const values = structuredClone(input.rows[index]);
      for (const side of ['start', 'end'])
        while (values[side].length < row.factors.length) values[side].push('');
      return values;
    });
    next.importIssues = (input.importIssues || []).map((issue) => ({
      ...issue,
      rowIndex: PLANT_SCHEMAS.UNILAND.rows.findIndex((row) => oldIndex(row) === issue.rowIndex),
    }));
    next.meterLayout = UNILAND_METER_LAYOUT;
    return next;
  }
  if (input?.plantKey !== 'JRE') return input;
  if (input.meterLayout !== undefined && ![1, 2, 3, JRE_METER_LAYOUT].includes(input.meterLayout))
    throw new Error('Unknown meter layout.');
  if (input.meterLayout === JRE_METER_LAYOUT) return input;
  const rows = input.rows;
  const matches = (factors, count = 29) =>
    rows?.length === count &&
    rows.every((row, i) =>
      ['start', 'end'].every(
        (side) =>
          Array.isArray(row?.[side]) &&
          row[side].length === (factors[i] || PLANT_SCHEMAS.JRE.rows[i].factors).length,
      ),
    );
  const layout =
    input.meterLayout ||
    (matches(JRE_LAYOUT3_FACTORS, 30)
      ? 3
      : matches(JRE_LAYOUT2_FACTORS)
        ? 2
        : matches(LEGACY_JRE_FACTORS)
          ? 1
          : null);
  if (!layout) return input;
  if (
    !matches(
      layout === 1 ? LEGACY_JRE_FACTORS : layout === 2 ? JRE_LAYOUT2_FACTORS : JRE_LAYOUT3_FACTORS,
      layout === 3 ? 30 : 29,
    )
  )
    throw Error('Invalid legacy meter layout.');
  const next = structuredClone(input);
  for (const side of ['start', 'end']) {
    const values = rows.map((row) => row[side]);
    const moved = layout === 1 ? moveLegacyValues(values) : values;
    next.rows.forEach((row, i) => {
      row[side] = [...moved[i]];
    });
    if (layout < 3) next.rows[4][side].push('');
    next.rows[15][side].push('');
  }
  if (layout < 3) next.rows.push({ start: [''], end: [''], inactive: false });
  next.meterLayout = JRE_METER_LAYOUT;
  if (layout === 1) next.importIssues = moveLegacyIssues(input.importIssues);
  return next;
}
