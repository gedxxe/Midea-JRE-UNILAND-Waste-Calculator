import { monthRange, adjacentMonth } from '../graph-month.js';
import { renderGraphReview } from './graph-review.js';
import { renderMonthlyTable } from './graph-matrix.js';
import { createGraphWindow } from './graph-window.js';
import { attachGraphInteraction } from './graph-interaction.js';
import { periodKind } from '../reading-period.js';
import { $, node } from './dom.js';
import { getLanguage, t } from '../i18n/index.js';
import {
  graphTitleField,
  metricLabel,
  departmentLabel,
  graphDepartment,
  upgradeGraph,
  graphPeriodLabel,
  graphSourceLabel,
  graphRecordStatus,
} from '../graph-presentation.js';
import { GRAPH_METRICS, DEPARTMENTS, defaultGraphs } from '../graph-schema.js';
import { dayDiff, validDate, formatNumber } from '../numbers.js';
import { renderGraph, exportGraph, copyGraph } from './graph-renderer.js';
import { validYAxis } from '../graph-axis.js';
export function createGraphs({
  current,
  request,
  toast,
  opened = () => {},
  beforeLoad = async () => true,
}) {
  let contentVersion = 0;
  let user = null,
    epoch = 0,
    sequence = 0,
    data = null,
    loading = false,
    layouts = {},
    status = '',
    animateNext = false,
    view = 'charts',
    visibility = new WeakMap();
  const windowView = createGraphWindow($('graphs-dialog'), $('graph-filters'), $('graph-expand'));
  const kind = () => $('graph-kind').value;
  const key = (mode = kind(), version = 2) =>
    'midea_graph_layout_v' + version + '_' + user.id + (mode !== 'daily' ? '_' + mode : '');
  const activeLayouts = () => layouts[kind()];
  const availableMetrics = (plant) => GRAPH_METRICS[plant];
  const factory = () => $('graph-plant').value;
  function defaults() {
    return Object.fromEntries(
      ['JRE', 'UNILAND'].map((plant) => [
        plant,
        defaultGraphs(plant).map((config) => upgradeGraph(plant, config)),
      ]),
    );
  }
  function store() {
    if (!user) return;
    try {
      const saved = Object.fromEntries(
        Object.entries(activeLayouts()).map(([plant, configs]) => [
          plant,
          configs.map((c) => ({ ...c, yAxis: validYAxis(c.yAxis) ? c.yAxis : { mode: 'auto' } })),
        ]),
      );
      localStorage.setItem(key(), JSON.stringify({ version: 2, layouts: saved }));
    } catch {
      toast(t('graphLayoutError'));
    }
  }
  function reset(next) {
    windowView.reset();
    epoch++;
    contentVersion = 0;
    sequence++;
    user = next;
    data = null;
    loading = false;
    status = '';
    layouts = { daily: defaults(), workingHours: defaults(), nightShift: defaults() };
    animateNext = false;
    view = 'charts';
    visibility = new WeakMap();
    $('graph-month').value = '';
    $('graph-search').value = '';
    $('graph-matrix').replaceChildren();
    $('graph-kind').value = 'daily';
    $('graph-department').replaceChildren();
    $('graphs-dialog').close();
    $('graph-cards').replaceChildren();
    $('graph-status').textContent = '';
    $('graph-warnings').replaceChildren();
    $('graph-start').value = '';
    $('graph-end').value = '';
    if (!user) return;
    try {
      for (const mode of ['daily', 'workingHours', 'nightShift']) {
        let saved;
        for (const version of [2, 1]) {
          try {
            const candidate = JSON.parse(localStorage.getItem(key(mode, version)));
            if (candidate?.version === version) {
              saved = candidate;
              break;
            }
          } catch {
            /* Keep a malformed key intact and try the older layout. */
          }
        }
        if (saved)
          for (const plant of ['JRE', 'UNILAND']) {
            const configs = saved.layouts?.[plant];
            if (
              Array.isArray(configs) &&
              configs.length <= 32 &&
              configs.every((c) => upgradeGraph(plant, c))
            )
              layouts[mode][plant] = configs.map((c) => upgradeGraph(plant, c));
          }
      }
    } catch {
      /* Invalid settings fall back to the workbook grouping. */
    }
  }
  function render() {
    if (!$('graphs-dialog').open) return;
    windowView.render();
    updateView();
    $('graph-refresh').disabled = loading;
    $('graph-mode-note').hidden = kind() === 'daily';
    $('graph-mode-note').textContent = t('graphPeriodHint');
    $('graph-status').hidden = view === 'table' && Boolean(data) && !loading && !status;
    $('graph-status').textContent = loading
      ? t('graphLoading')
      : status
        ? t(status)
        : data
          ? t(data.records.length ? 'graphReady' : 'graphEmpty', { count: data.records.length })
          : '';
    $('graph-warnings').replaceChildren();
    if (data)
      for (const [key, count] of [
        [
          'graphMulti',
          data.records.filter((r) => r.days > 1 && !r.noValues && !r.superseded).length,
        ],
        [
          'graphIncompletePeriods',
          data.records.filter((r) => r.autosaved && r.complete === false).length,
        ],
        ['graphOverlap', data.records.filter((r) => r.overlap).length],
        [
          'graphSuperseded',
          data.records.filter((r) => r.superseded && r.source === 'excel').length,
        ],
      ])
        if (count && !(view === 'table' && key === 'graphMulti'))
          $('graph-warnings').append(
            node(
              'p',
              t(key, { count }),
              ['graphMulti', 'graphIncompletePeriods'].includes(key) ? 'notice' : 'notice warning',
            ),
          );
    if (data) {
      const review = renderGraphReview(data.records);
      if (review) $('graph-warnings').append(review);
    }
    const department = $('graph-department').value || 'all';
    const available = new Set(
      view === 'table'
        ? GRAPH_METRICS[factory()].map((m) => m.department)
        : activeLayouts()[factory()].map((c) => graphDepartment(factory(), c)),
    );
    $('graph-department').replaceChildren();
    for (const name of ['all', ...Object.keys(DEPARTMENTS).filter((name) => available.has(name))]) {
      const option = node('option', departmentLabel(name, getLanguage()));
      option.value = name;
      $('graph-department').append(option);
    }
    $('graph-department').value = available.has(department) ? department : 'all';
    if (view === 'table') renderMatrix();
    else renderCards(Boolean(data && animateNext));
    if (data) animateNext = false;
  }
  function updateView() {
    const table = view === 'table';
    $('graphs-dialog').classList.toggle('graph-table-view', table);
    $('graph-view-charts').setAttribute('aria-pressed', !table);
    $('graph-view-table').setAttribute('aria-pressed', table);
    $('graph-month-controls').hidden = !table;
    $('graph-search-label').hidden = !table;
    $('graph-layout-tools').hidden = table;
    $('graph-cards').hidden = table;
    $('graph-matrix').hidden = !table;
    document.querySelectorAll('[data-graph-date]').forEach((label) => (label.hidden = table));
    document.querySelector('.graph-filter-bar').classList.toggle('matrix-mode', table);
  }
  function renderMatrix() {
    $('graph-cards').replaceChildren();
    $('graph-matrix').replaceChildren();
    if (data)
      $('graph-matrix').append(
        renderMonthlyTable({
          plant: factory(),
          kind: kind(),
          month: $('graph-month').value,
          records: data.records,
          sourceView: data.view || 'working',
          department: $('graph-department').value || 'all',
          search: $('graph-search').value,
        }),
      );
    else
      $('graph-matrix').append(
        node(
          'p',
          loading ? t('graphLoading') : status ? t(status) : t('graphEmpty'),
          'graph-empty-state',
        ),
      );
  }
  function changeMonth() {
    const range = monthRange($('graph-month').value);
    if (!range) {
      sequence++;
      data = null;
      loading = false;
      status = 'graphRange';
      render();
      return;
    }
    $('graph-start').value = range.start;
    $('graph-end').value = range.end;
    void load();
  }
  for (const next of ['charts', 'table'])
    $('graph-view-' + next).addEventListener('click', () => {
      if (view === next) return;
      view = next;
      $('graph-filters').open = view !== 'table';
      if (view === 'table') {
        const month = $('graph-start').value.slice(0, 7) || current().startDate?.slice(0, 7);
        $('graph-month').value = monthRange(month) ? month : '';
        const range = monthRange($('graph-month').value);
        if (
          !range ||
          range.start !== $('graph-start').value ||
          range.end !== $('graph-end').value
        ) {
          changeMonth();
          return;
        }
      }
      render();
    });
  $('graph-month').addEventListener('change', changeMonth);
  for (const [id, offset] of [
    ['graph-month-prev', -1],
    ['graph-month-next', 1],
  ])
    $(id).addEventListener('click', () => {
      const month = adjacentMonth($('graph-month').value, offset);
      if (month) {
        $('graph-month').value = month;
        changeMonth();
      }
    });
  $('graph-search').addEventListener('input', () => {
    if (view === 'table') renderMatrix();
  });
  async function load() {
    if (!user) return;
    const sourceView = 'working';
    const plant = factory(),
      start = $('graph-start').value,
      end = $('graph-end').value;
    const days = dayDiff(start, end),
      ticket = ++sequence,
      identity = epoch;
    data = null;
    loading = false;
    status = '';
    if (days === null || days < 0 || days > 365) {
      status = 'graphRange';
      render();
      return;
    }
    loading = true;
    render();
    let fetchedVersion;
    try {
      if (!(await beforeLoad())) status = 'monitoringUnsynced';
      if (ticket !== sequence || identity !== epoch) return;
      fetchedVersion = contentVersion;
      const result = await request(
        '/api/graphs?' + new URLSearchParams({ plant, start, end, kind: kind(), view: sourceView }),
      );
      if (ticket !== sequence || identity !== epoch) return;
      if ((result.view || 'working') !== sourceView) throw Error('GRAPH_SOURCE_MISMATCH');
      data = result;
    } catch (error) {
      if (ticket !== sequence || identity !== epoch) return;
      status =
        error.message === 'INVALID_GRAPH_RANGE'
          ? 'graphRange'
          : error.message === 'GRAPH_RANGE_TOO_LARGE'
            ? 'graphTooMany'
            : 'graphError';
    } finally {
      if (ticket === sequence && identity === epoch) {
        loading = false;
        render();
        if (fetchedVersion !== undefined && fetchedVersion !== contentVersion) void load();
      }
    }
  }
  function renderCards(animate = false) {
    $('graph-matrix').replaceChildren();
    const plant = factory();
    $('graph-cards').replaceChildren();
    (activeLayouts()[plant] || []).forEach((config, index) => {
      if (
        $('graph-department').value !== 'all' &&
        graphDepartment(plant, config) !== $('graph-department').value
      )
        return;
      const hidden = visibility.get(config) || new Set();
      visibility.set(config, hidden);
      const card = node('article', undefined, 'graph-card' + (animate ? ' graph-enter' : ''));
      card.dataset.chartIndex = index;
      const controls = node('details', undefined, 'graph-settings');
      controls.append(node('summary', t('graphConfigure')));
      controls.setAttribute(
        'aria-label',
        t('graphConfigure') + ': ' + config[graphTitleField(getLanguage())],
      );
      const fields = node('div', undefined, 'graph-fields');
      for (const [field, label, max] of [
        [graphTitleField(getLanguage()), 'graphTitle', getLanguage() === 'zh-CN' ? 100 : 160],
      ]) {
        const wrapper = node('label', t(label));
        const input = node('input');
        input.type = 'text';
        input.maxLength = max;
        input.value = config[field];
        input.dataset.graphTitle = field;
        input.addEventListener('input', () => {
          config[field] = input.value;
          store();
          draw();
        });
        wrapper.append(input);
        fields.append(wrapper);
      }
      const advanced = node('details', undefined, 'graph-advanced');
      advanced.append(node('summary', t('graphAdvanced')));
      const unitLabel = node('label', t('graphUnit')),
        unit = node('select');
      unit.dataset.graphUnit = '';
      for (const value of new Set(availableMetrics(plant).map((m) => m.unit))) {
        const option = node('option', value);
        option.value = value;
        unit.append(option);
      }
      unit.value = config.unit;
      unit.addEventListener('change', () => {
        config.unit = unit.value;
        config.series = [];
        config.yAxis = { mode: 'auto' };
        axisMode.value = 'auto';
        axisMin.value = '';
        axisMax.value = '';
        axisMin.disabled = axisMax.disabled = true;
        store();
        variables();
        draw();
      });
      unitLabel.append(unit);
      advanced.append(unitLabel);
      controls.append(fields, node('p', t('graphTitleHint'), 'graph-help'));
      const axisFields = node('div', undefined, 'graph-toolbar');
      const axisMode = node('select'),
        axisMin = node('input'),
        axisMax = node('input');
      axisMode.dataset.graphAxis = '';
      for (const mode of ['auto', 'manual']) {
        const option = node('option', t(mode === 'auto' ? 'graphAuto' : 'graphManual'));
        option.value = mode;
        axisMode.append(option);
      }
      config.yAxis ??= { mode: 'auto' };
      axisMode.value = config.yAxis.mode;
      for (const [input, name] of [
        [axisMin, 'min'],
        [axisMax, 'max'],
      ]) {
        input.type = 'number';
        input.step = 'any';
        input.min = '0';
        input.max = '1000000000000000';
        input.dataset.graphBound = name;
        input.value = config.yAxis[name] ?? '';
        input.disabled = config.yAxis.mode !== 'manual';
      }
      for (const [input, label] of [
        [axisMode, 'graphYAxis'],
        [axisMin, 'graphMinimum'],
        [axisMax, 'graphMaximum'],
      ]) {
        const wrapper = node('label', t(label));
        wrapper.append(input);
        axisFields.append(wrapper);
      }
      function updateAxis() {
        axisMin.disabled = axisMax.disabled = axisMode.value !== 'manual';
        config.yAxis =
          axisMode.value === 'auto'
            ? { mode: 'auto' }
            : {
                mode: 'manual',
                min: axisMin.valueAsNumber,
                max: axisMax.valueAsNumber,
              };
        if (validYAxis(config.yAxis)) store();
        draw();
      }
      axisMode.addEventListener('change', updateAxis);
      axisMin.addEventListener('input', updateAxis);
      axisMax.addEventListener('input', updateAxis);
      advanced.append(axisFields, node('p', t('graphAxisHint'), 'graph-help'));
      const options = node('fieldset', undefined, 'graph-options');
      controls.append(options, node('p', t('graphSeriesHint'), 'graph-help'), advanced);
      function variables() {
        options.replaceChildren(
          node('legend', t('graphVariables') + ' (' + config.series.length + ')'),
        );
        for (const department of Object.keys(DEPARTMENTS)) {
          const metrics = availableMetrics(plant).filter(
            (m) => m.department === department && m.unit === config.unit,
          );
          if (!metrics.length) continue;
          const group = node('div', undefined, 'graph-variable-group');
          group.append(node('strong', departmentLabel(department, getLanguage())));
          for (const metric of metrics) {
            const label = node('label', undefined, 'check-label'),
              input = node('input');
            input.type = 'checkbox';
            input.value = metric.key;
            input.dataset.graphSeries = metric.key;
            input.checked = config.series.includes(metric.key);
            input.addEventListener('change', () => {
              config.series = input.checked
                ? [...config.series, metric.key]
                : config.series.filter((k) => k !== metric.key);
              store();
              options.querySelector('legend').textContent =
                t('graphVariables') + ' (' + config.series.length + ')';
              draw();
            });
            label.append(input, node('span', metricLabel(metric, getLanguage())));
            group.append(label);
          }
          options.append(group);
        }
      }
      variables();
      const actions = node('div', undefined, 'graph-actions');
      const duplicate = node('button', t('graphDuplicate'), 'button secondary'),
        remove = node('button', t('graphRemove'), 'text-button');
      duplicate.addEventListener('click', () => {
        if (activeLayouts()[plant].length >= 32) {
          toast(t('graphLimit'));
          return;
        }
        activeLayouts()[plant].splice(index + 1, 0, structuredClone(config));
        store();
        render();
      });
      remove.addEventListener('click', () => {
        activeLayouts()[plant].splice(index, 1);
        store();
        render();
      });
      const editActions = node('div', undefined, 'graph-actions');
      editActions.append(duplicate, remove);
      controls.append(editActions);
      const frame = node('div', undefined, 'graph-frame');
      frame.tabIndex = 0;
      const prompt = node('p', undefined, 'graph-prompt');
      const tableDetails = node('details', undefined, 'graph-data');
      tableDetails.append(node('summary', t('graphData')));
      const tableWrap = node('div', undefined, 'graph-data-scroll');
      tableDetails.append(tableWrap);
      let svg;
      const exports = [];
      const copy = node('button', t('graphCopy'), 'button primary');
      copy.dataset.graphCopy = '';
      copy.addEventListener('click', async () => {
        if (copy.disabled || !svg) return;
        const identity = epoch,
          original = data,
          image = svg;
        copy.disabled = true;
        const stillCurrent = () =>
          identity === epoch &&
          original === data &&
          image === svg &&
          card.isConnected &&
          !loading &&
          $('graphs-dialog').open;
        try {
          await copyGraph(image, stillCurrent);
          if (stillCurrent()) toast(t('graphCopied'));
        } catch {
          if (stillCurrent()) toast(t('graphCopyError'));
        } finally {
          if (identity === epoch && card.isConnected) draw();
        }
      });
      exports.push(copy);
      actions.append(copy);
      const download = node('details', undefined, 'graph-download');
      download.append(node('summary', t('graphDownload')));
      const formats = node('div', undefined, 'graph-download-options');
      download.append(formats);
      for (const format of ['png', 'svg']) {
        const button = node('button', format.toUpperCase(), 'button secondary');
        button.dataset.graphExport = format;
        button.addEventListener('click', async () => {
          if (button.disabled || !svg) return;
          const identity = epoch,
            original = data,
            image = svg;
          const stillCurrent = () =>
            identity === epoch &&
            original === data &&
            image === svg &&
            card.isConnected &&
            !loading &&
            $('graphs-dialog').open;
          button.disabled = true;
          download.open = false;
          download.querySelector('summary').focus();
          try {
            await exportGraph(
              image,
              format,
              plant + '-graph-' + (index + 1) + '-' + data.start + '-' + data.end,
              stillCurrent,
            );
          } catch {
            if (stillCurrent()) toast(t('graphExportError'));
          } finally {
            if (identity === epoch && card.isConnected) draw();
          }
        });
        exports.push(button);
        formats.append(button);
      }
      actions.append(download);
      card.append(controls, frame, prompt, actions, tableDetails);
      $('graph-cards').append(card);
      function draw() {
        const chosen = availableMetrics(plant).filter((m) => config.series.includes(m.key));
        const axisValid = validYAxis(config.yAxis);
        const valid =
          config.series.length && config[graphTitleField(getLanguage())]?.trim() && axisValid;
        const usable = data?.records.some(
          (r) =>
            !r.overlap &&
            !r.superseded &&
            chosen.some((m) => !hidden.has(m.key) && Number.isFinite(r.values[m.key])),
        );
        exports.forEach((b) => (b.disabled = !valid || !usable || loading));
        prompt.textContent = !axisValid
          ? t('graphAxisInvalid')
          : !valid
            ? t('graphSelect')
            : config.series.every((key) => hidden.has(key))
              ? t('graphAllHidden')
              : '';
        frame.replaceChildren();
        svg = null;
        if (data && axisValid) {
          const presentation = { ...config, plant, hiddenSeries: [...hidden] };
          svg = renderGraph(presentation, { ...data, kind: kind() });
          attachGraphInteraction(frame, svg, presentation, data.records, (key) => {
            if (hidden.has(key)) hidden.delete(key);
            else hidden.add(key);
            draw();
            frame
              .querySelector('[data-graph-toggle="' + key + '"]')
              ?.focus({ preventScroll: true });
          });
        } else if (!data)
          frame.append(
            node('p', loading ? t('graphLoading') : status ? t(status) : t('graphEmpty')),
          );
        tableWrap.replaceChildren();
        const table = node('table'),
          head = node('thead'),
          header = node('tr');
        for (const label of [
          t('graphPeriod'),
          t('graphSource'),
          ...chosen.map((m) => metricLabel(m, getLanguage()) + ' (' + m.unit + ')'),
        ])
          header.append(node('th', label));
        head.append(header);
        table.append(head);
        const body = node('tbody');
        for (const record of data?.records || []) {
          const row = node('tr');
          row.append(
            node(
              'td',
              graphPeriodLabel(record, getLanguage()) +
                (graphRecordStatus(record, t) ? ' · ' + graphRecordStatus(record, t) : ''),
            ),
            node(
              'td',
              graphSourceLabel(record, t) +
                (record.source === 'excel' ? ' · ' + record.sourceLabel : ''),
            ),
          );
          for (const metric of chosen)
            row.append(node('td', formatNumber(record.values[metric.key], 8)));
          body.append(row);
        }
        table.append(body);
        tableWrap.append(table);
      }
      draw();
    });
  }
  function open() {
    if (!user) return;
    $('graph-plant').value = current().plantKey;
    $('graph-kind').value = periodKind(current());
    if (!validDate($('graph-start').value) && validDate(current().startDate)) {
      $('graph-start').value = current().startDate.slice(0, 7) + '-01';
      const [year, month] = current().startDate.split('-').map(Number);
      $('graph-end').value = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    }
    animateNext = true;
    if (view === 'table') {
      const month = $('graph-start').value.slice(0, 7),
        range = monthRange(month);
      if (range) {
        $('graph-month').value = month;
        $('graph-start').value = range.start;
        $('graph-end').value = range.end;
      }
    }
    $('graph-layout-tools').open = false;
    $('graph-filters').open = view !== 'table';
    $('graph-about').open = false;
    $('graphs-dialog').showModal();
    opened('monitoring');
    void load();
  }
  $('open-graphs').addEventListener('click', open);
  $('graph-department').addEventListener('change', () =>
    view === 'table' ? renderMatrix() : renderCards(),
  );
  $('graph-refresh').addEventListener('click', () => void load());
  for (const id of ['graph-plant', 'graph-kind', 'graph-start', 'graph-end'])
    $(id).addEventListener('change', () => void load());
  $('graph-presets').addEventListener('click', () => {
    if (!confirm(t('graphResetConfirm'))) return;
    activeLayouts()[factory()] = defaultGraphs(factory()).map((c) => upgradeGraph(factory(), c));
    store();
    render();
  });
  $('graph-add').addEventListener('click', () => {
    const plant = factory();
    if (activeLayouts()[plant].length >= 32) {
      toast(t('graphLimit'));
      return;
    }
    activeLayouts()[plant].push({
      titleEn: plant + ' · ' + departmentLabel('other', 'en'),
      titleZh: plant + ' · ' + departmentLabel('other', 'zh-CN'),
      titleId: plant + ' · ' + departmentLabel('other', 'id'),
      unit: 'kWh',
      series: [],
    });
    $('graph-department').value = 'all';
    store();
    render();
    const card = $('graph-cards').lastElementChild;
    card.querySelector('details').open = true;
    card.scrollIntoView({ block: 'start' });
  });
  $('graphs-dialog').addEventListener('close', () => {
    windowView.reset();
    visibility = new WeakMap();
    sequence++;
    data = null;
    loading = false;
    $('graph-cards').replaceChildren();
    $('graph-status').textContent = '';
    $('graph-warnings').replaceChildren();
    $('graph-matrix').replaceChildren();
  });
  return {
    open,
    reset,
    render,
    saved() {
      contentVersion++;
      data = null;
      if ($('graphs-dialog').open && !loading) {
        status = 'graphStale';
        void load();
      }
    },
  };
}
