import { PLANT_SCHEMAS, UTILITIES } from './schema.js';
import { validYAxis } from './graph-axis.js';
export const DEPARTMENTS = {
  branch: ['Branch', '厂区'],
  injection: ['Injection Molding', '注塑'],
  quality: ['Quality', '品质部'],
  logistic: ['Logistics', '物流部'],
  admin: ['Administration', '行政部'],
  other: ['Other meters', '其他电表'],
  utilities: ['Gas and water', '气体与用水'],
};
// Worksheet index, department and chart legend. Aliases never change factory reports.
const worksheetGroups = {
  JRE: [
    ['Indoor', 'branch'],
    ['Outdoor', 'branch'],
    ['Window A', 'branch'],
    ['Window B', 'branch'],
    ['Heat Exchanger', 'branch'],
    ['Piping All', 'branch'],
    ['Piping #1', 'branch'],
    ['Piping #3', 'branch'],
    ['Injection Molding', 'injection'],
    ['Crusher Machine', 'injection'],
    ['Cooling Tower Injection', 'injection'],
    ['Structural Laboratory', 'quality'],
    ['Control Room', 'quality'],
    ['IQC & OQC', 'quality'],
    ['New Laboratory', 'quality'],
    ['Warehouse', 'logistic'],
    ['Charging Forklift', 'logistic'],
    ['Office', 'admin'],
  ],
  UNILAND: [
    ['Indoor Area', 'branch'],
    ['Outdoor Area', 'branch'],
    ['Indoor', 'branch'],
    ['Outdoor', 'branch'],
    ['HE & Piping', 'branch'],
    ['Vacuum Box Indoor', 'branch'],
    ['Vacuum Box Outdoor', 'branch'],
    ['Outdoor Line Compressor Area', 'branch'],
    ['Machine Stamping', 'injection'],
    ['Injection Molding', 'injection'],
    ['PCB Trial Line', 'quality'],
    ['10HP Enthalpy Lab', 'quality'],
    ['20HP Climate Chamber', 'quality'],
    ['OQC Testing Room B', 'quality'],
    ['IQC Testing Room B', 'quality'],
    ['Charger Forklift Area', 'logistic'],
  ],
};
// Report row indices for worksheet columns; null means a derived worksheet value.
export const WORKSHEET_ROWS = {
  JRE: [1, 2, 3, 4, 5, null, 15, 16, 6, 7, 8, 19, 20, 21, 22, 25, 24, 17],
  UNILAND: [null, null, 9, 10, null, 16, 17, 20, 25, 21, 14, 23, 24, 26, 27, 28],
};
export const GRAPH_METRICS = Object.fromEntries(
  ['JRE', 'UNILAND'].map((plant) => {
    const metrics = worksheetGroups[plant].map(([label, department], i) => ({
      key: 'w' + i,
      label,
      department,
      unit: 'kWh',
    }));
    PLANT_SCHEMAS[plant].rows.forEach((row, i) => {
      if (!WORKSHEET_ROWS[plant].includes(i))
        metrics.push({
          key: 'r' + (row.legacyIndex ?? i),
          label: row.name,
          department: 'other',
          unit: 'kWh',
        });
    });
    UTILITIES[plant].forEach(([name, unit], i) => {
      if (unit)
        metrics.push({
          key: 'u' + i,
          label: name,
          department: 'utilities',
          unit: unit === 'Kg' ? 'kg' : unit,
        });
    });
    if (plant === 'UNILAND')
      for (const i of [0, 2, 3, 5])
        metrics.push({
          key: 'kg' + i,
          label: UTILITIES[plant][i][0],
          department: 'utilities',
          unit: 'kg',
          utilityIndex: i,
        });
    return [plant, metrics];
  }),
);
export function departmentTitle(plant, department) {
  if (department === 'branch')
    return plant === 'JRE'
      ? ['Branch 1 / JRE', '一厂 / JRE']
      : ['Branch 2 / UNILAND', '二厂 / UNILAND'];
  const [en, zh] = DEPARTMENTS[department];
  return [plant + ' ' + en, plant + '工厂' + zh];
}
export function defaultGraphs(plant) {
  const groups =
    plant === 'JRE'
      ? [
          ['branch', [1, 2, 3, 4]],
          ['branch', [0, 5]],
          ['injection', [8]],
          ['injection', [9, 10]],
          ['quality', [12, 14]],
          ['quality', [11]],
          ['quality', [13]],
          ['logistic', [15, 16]],
          ['admin', [17]],
        ]
      : [
          ['branch', [1]],
          ['branch', [0, 4]],
          ['injection', [9]],
          ['injection', [8]],
          ['quality', [10]],
          ['quality', [11, 12, 13, 14]],
          ['logistic', [15]],
        ];
  return groups.map(([department, indices]) => {
    const [en, zh] = departmentTitle(plant, department);
    return {
      titleEn: en + ' electrical consumption',
      titleZh: zh + '用电量',
      unit: 'kWh',
      series: indices.map((i) => 'w' + i),
      yAxis: { mode: 'auto' },
    };
  });
}
export function validGraph(plant, input) {
  if (
    !input ||
    typeof input.titleEn !== 'string' ||
    typeof input.titleZh !== 'string' ||
    input.titleEn.length > 160 ||
    input.titleZh.length > 100 ||
    !Array.isArray(input.series)
  )
    return null;
  const metrics = GRAPH_METRICS[plant];
  const yAxis = input.yAxis ?? { mode: 'auto' };
  if (!validYAxis(yAxis)) return null;
  if (!metrics?.some((m) => m.unit === input.unit)) return null;
  if (
    input.series.length > metrics.length ||
    new Set(input.series).size !== input.series.length ||
    input.series.some((key) => !metrics.some((m) => m.key === key && m.unit === input.unit))
  )
    return null;
  return {
    titleEn: input.titleEn,
    titleZh: input.titleZh,
    unit: input.unit,
    series: [...input.series],
    yAxis:
      yAxis.mode === 'manual'
        ? { mode: 'manual', min: yAxis.min, max: yAxis.max }
        : { mode: 'auto' },
  };
}
