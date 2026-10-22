import { GRAPH_METRICS, defaultGraphs, departmentTitle, validGraph } from './graph-schema.js';
import { metricLabels, departmentLabels, presetTitles } from './i18n/graph-labels.js';
import { formatNumber } from './numbers.js';
import { isWorkingHours, isNightShift } from './reading-period.js';

const index = (language) => ({ en: 0, 'zh-CN': 1, id: 2 })[language] ?? 0;
export const graphTitleField = (language) => ['titleEn', 'titleZh', 'titleId'][index(language)];
export const metricLabel = (metric, language) =>
  metricLabels[metric.label]?.[index(language)] ?? metric.label;
export const departmentLabel = (department, language) =>
  departmentLabels[department]?.[index(language)] ?? department;

export function graphDepartment(plant, config) {
  const departments = new Set(
    config.series
      .map((key) => GRAPH_METRICS[plant].find((m) => m.key === key)?.department)
      .filter(Boolean),
  );
  return departments.size === 1 ? [...departments][0] : 'other';
}

// Upgrade a browser layout copy. Never write into a saved report or legacy layout key.
export function upgradeGraph(plant, input) {
  const config = validGraph(plant, input);
  if (!config) return null;
  const department = graphDepartment(plant, config);
  const presets = defaultGraphs(plant);
  const preset = presets.findIndex((item) => item.series.join(',') === config.series.join(','));
  const names = preset >= 0 ? presetTitles[plant][preset] : departmentLabels[department];
  const short = (i) => plant + ' · ' + names[i];
  for (const [i, field] of ['titleEn', 'titleZh'].entries()) {
    const legacyTitles = Object.keys(departmentLabels)
      .filter((key) => key !== 'all')
      .map((key) => departmentTitle(plant, key)[i] + (i ? '用电量' : ' electrical consumption'));
    legacyTitles.push(plant + (i ? '工厂用电量' : ' electrical consumption'));
    if (legacyTitles.includes(config[field])) config[field] = short(i);
  }
  config.titleId ??= short(2);
  return config;
}

export function graphPeriodLabel(record, language) {
  const i = index(language);
  return isWorkingHours(record)
    ? record.startDate +
        ' ' +
        record.startTime +
        ' → ' +
        (isNightShift(record) ? record.readingEndDate + ' ' : '') +
        record.endTime +
        ' WIB (' +
        formatNumber(record.minutes / 60) +
        [' hours)', ' 小时)', ' jam)'][i]
    : record.startDate +
        ' 08:00 → ' +
        record.endDate +
        ' 08:00 (' +
        record.days +
        (i === 0 ? (record.days === 1 ? ' day)' : ' days)') : ['', ' 天)', ' hari)'][i]);
}
