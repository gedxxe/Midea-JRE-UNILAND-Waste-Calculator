import { node } from './dom.js';
import { getLanguage, t } from '../i18n/index.js';
import { GRAPH_METRICS, DEPARTMENTS } from '../graph-schema.js';
import { monthlyPeriods } from '../graph-month.js';
import {
  metricLabel,
  departmentLabel,
  graphPeriodLabel,
  graphSourceLabel,
  graphRecordStatus,
} from '../graph-presentation.js';
import { shiftDate, formatNumber } from '../numbers.js';
import { periodLabel } from '../graph-axis.js';

export function renderMonthlyTable({
  plant,
  kind = 'daily',
  month,
  records,
  sourceView = 'working',
  department = 'all',
  search = '',
}) {
  const model = monthlyPeriods(month, records);
  const root = node('section', undefined, 'graph-matrix');
  if (!model) {
    root.append(node('p', t('graphRange')));
    return root;
  }
  const language = getLanguage();
  const dateFormat = (options) =>
    new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
      timeZone: 'UTC',
      ...options,
    });
  const date = (value) => new Date(value + 'T00:00:00Z');
  const heading = node('div', undefined, 'graph-matrix-heading');
  const title =
    plant + ' · ' + dateFormat({ month: 'long', year: 'numeric' }).format(date(model.start));
  const titleGroup = node('div', undefined, 'graph-matrix-title');
  titleGroup.append(
    node('h3', title),
    node(
      'span',
      t(
        kind === 'workingHours'
          ? 'graphAfter'
          : kind === 'nightShift'
            ? 'graphNight'
            : 'graphDaily',
      ),
      'graph-matrix-kind',
    ),
  );
  heading.append(titleGroup, node('span', t('graphReady', { count: model.count }), 'graph-count'));
  root.append(
    heading,
    node(
      'p',
      (sourceView === 'checkpoint' ? t('graphCheckpointSource') + ' · ' : '') +
        t('graphMatrixHint'),
      'graph-help',
    ),
  );
  const metrics = GRAPH_METRICS[plant].filter(
    (metric) =>
      (department === 'all' || metric.department === department) &&
      (metricLabel(metric, language) + ' ' + metric.label)
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase().trim()),
  );
  const scroller = node('div', undefined, 'graph-matrix-scroll');
  scroller.tabIndex = 0;
  scroller.setAttribute('role', 'region');
  scroller.setAttribute('aria-label', title);
  const table = node('table'),
    caption = node('caption', title + ' · ' + t('graphConsumption'));
  caption.className = 'sr-only';
  table.append(caption);
  const head = node('thead'),
    header = node('tr');
  const corner = node('th', t('graphEquipment'));
  corner.scope = 'col';
  header.append(corner);
  for (let i = 0; i < model.days; i++) {
    const value = shiftDate(model.start, i),
      th = node('th');
    th.scope = 'col';
    th.dataset.date = value;
    th.setAttribute('aria-label', dateFormat({ dateStyle: 'full' }).format(date(value)));
    th.append(
      node('span', dateFormat({ weekday: 'short' }).format(date(value)), 'matrix-weekday'),
      node('strong', dateFormat({ day: '2-digit', month: 'short' }).format(date(value))),
    );
    header.append(th);
  }
  head.append(header);
  table.append(head);
  const body = node('tbody');
  const groups = ['total', ...Object.keys(DEPARTMENTS)];
  let previousCells = [],
    previousHeader;
  const clear = () => {
    previousCells.forEach((cell) => cell.classList.remove('matrix-column-active'));
    previousHeader?.classList.remove('matrix-column-active');
    previousCells = [];
    previousHeader = null;
  };
  const byDate = new Map();
  for (const group of groups) {
    const chosen = metrics.filter((m) =>
      group === 'total' ? m.key === 'r0' : m.key !== 'r0' && m.department === group,
    );
    if (!chosen.length) continue;
    if (group !== 'total') {
      const row = node('tr', undefined, 'matrix-group'),
        label = node('th', departmentLabel(group, language));
      label.colSpan = model.days + 1;
      row.append(label);
      body.append(row);
    }
    for (const metric of chosen) {
      const row = node('tr');
      row.dataset.metric = metric.key;
      const name = node('th');
      name.scope = 'row';
      name.append(node('span', metricLabel(metric, language)), node('small', metric.unit));
      row.append(name);
      for (const slot of model.cells) {
        const cell = node('td');
        cell.colSpan = slot.span;
        cell.dataset.date = slot.date;
        const value = slot.record?.values[metric.key];
        cell.append(
          node(
            'span',
            Number.isFinite(value) ? formatNumber(value, 8) : '-',
            Number.isFinite(value) ? 'matrix-value' : 'matrix-empty',
          ),
        );
        if (slot.record?.days > 1 || slot.span > 1) {
          cell.classList.add('matrix-combined');
          cell.append(node('small', periodLabel(slot.record.startDate, slot.record.endDate)));
        }
        cell.title =
          metricLabel(metric, language) +
          ' · ' +
          (slot.record ? graphPeriodLabel(slot.record, language) : slot.date) +
          ' · ' +
          (Number.isFinite(value)
            ? formatNumber(value, 8) + ' ' + metric.unit
            : t('graphMissing')) +
          (slot.record ? ' · ' + graphSourceLabel(slot.record, t) : '');
        for (let offset = 0; offset < slot.span; offset++) {
          const key = shiftDate(slot.date, offset);
          if (!byDate.has(key)) byDate.set(key, []);
          byDate.get(key).push(cell);
        }
        row.append(cell);
      }
      body.append(row);
    }
  }
  if (!metrics.length) root.append(node('p', t('graphNoRows'), 'graph-empty-state'));
  table.append(body);
  scroller.append(table);
  root.append(scroller);
  table.addEventListener('pointerover', (event) => {
    const cell = event.target.closest('td[data-date], thead th[data-date]');
    if (!cell || previousHeader?.dataset.date === cell.dataset.date) return;
    clear();
    previousCells = byDate.get(cell.dataset.date) || [];
    previousHeader = header.querySelector('[data-date="' + cell.dataset.date + '"]');
    previousCells.forEach((item) => item.classList.add('matrix-column-active'));
    previousHeader?.classList.add('matrix-column-active');
  });
  scroller.addEventListener('pointerleave', clear);
  if (model.excluded.length) {
    const details = node('details', undefined, 'graph-matrix-excluded');
    details.append(node('summary', t('graphExcludedCount', { count: model.excluded.length })));
    for (const record of model.excluded)
      details.append(
        node(
          'p',
          graphPeriodLabel(record, language) +
            ' · ' +
            (graphRecordStatus(record, t) || t('graphExcluded')),
        ),
      );
    root.append(details);
  }
  return root;
}
