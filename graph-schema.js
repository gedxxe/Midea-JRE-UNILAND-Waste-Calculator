import { PLANT_SCHEMAS, UTILITIES } from './schema.js';
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
  UNILAND: [null, null, 9, 10, 11, 14, 15, 18, 23, 19, 13, 21, 22, 24, 25, 26],
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
        metrics.push({ key: 'r' + i, label: row.name, department: 'other', unit: 'kWh' });
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
  };
}
