import { $, node } from './dom.js';
import { t } from '../i18n/index.js';
import {
  GRAPH_METRICS,
  DEPARTMENTS,
  departmentTitle,
  defaultGraphs,
  validGraph,
} from '../graph-schema.js';
import { dayDiff, validDate, formatNumber } from '../numbers.js';
import { renderGraph, exportGraph, copyGraph } from './graph-renderer.js';
import { validYAxis } from '../graph-axis.js';
export function createGraphs({ current, request, toast }) {
  let user = null,
    epoch = 0,
    sequence = 0,
    data = null,
    loading = false,
    layouts = {},
    status = '';
  const key = () => 'midea_graph_layout_v1_' + user.id;
  const factory = () => $('graph-plant').value;
  function defaults() {
    return { JRE: defaultGraphs('JRE'), UNILAND: defaultGraphs('UNILAND') };
  }
  function store() {
    if (!user) return;
    try {
      const saved = Object.fromEntries(
        Object.entries(layouts).map(([plant, configs]) => [
          plant,
          configs.map((c) => ({ ...c, yAxis: validYAxis(c.yAxis) ? c.yAxis : { mode: 'auto' } })),
        ]),
      );
      localStorage.setItem(key(), JSON.stringify({ version: 1, layouts: saved }));
    } catch {
      toast(t('graphLayoutError'));
    }
  }
  function reset(next) {
    epoch++;
    sequence++;
    user = next;
    data = null;
    loading = false;
    status = '';
    layouts = defaults();
    $('graphs-dialog').close();
    $('graph-cards').replaceChildren();
    $('graph-status').textContent = '';
    $('graph-warnings').replaceChildren();
    $('graph-start').value = '';
    $('graph-end').value = '';
    if (!user) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key()));
      if (saved?.version === 1)
        for (const plant of ['JRE', 'UNILAND']) {
          const configs = saved.layouts?.[plant];
          if (
            Array.isArray(configs) &&
            configs.length <= 32 &&
            configs.every((c) => validGraph(plant, c))
          )
            layouts[plant] = configs.map((c) => validGraph(plant, c));
        }
    } catch {
      /* Invalid settings fall back to the workbook grouping. */
    }
  }
  function render() {
    if (!$('graphs-dialog').open) return;
    $('graph-refresh').disabled = loading;
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
        ['graphMulti', data.records.filter((r) => r.days > 1).length],
        ['graphOverlap', data.records.filter((r) => r.overlap).length],
        ['graphSuperseded', data.records.filter((r) => r.superseded).length],
      ])
        if (count) $('graph-warnings').append(node('p', t(key, { count }), 'notice warning'));
    renderCards();
  }
  async function load() {
    if (!user) return;
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
    try {
      const result = await request('/api/graphs?' + new URLSearchParams({ plant, start, end }));
      if (ticket !== sequence || identity !== epoch) return;
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
      }
    }
  }
  function renderCards() {
    const plant = factory();
    $('graph-cards').replaceChildren();
    (layouts[plant] || []).forEach((config, index) => {
      const card = node('article', undefined, 'graph-card');
      card.dataset.chartIndex = index;
      const controls = node('details', undefined, 'graph-settings');
      controls.append(node('summary', t('graphConfigure') + ' ' + (index + 1)));
      const fields = node('div', undefined, 'graph-fields');
      for (const [field, label, max] of [
        ['titleEn', 'graphTitleEn', 160],
        ['titleZh', 'graphTitleZh', 100],
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
      const unitLabel = node('label', t('graphUnit')),
        unit = node('select');
      unit.dataset.graphUnit = '';
      for (const value of new Set(GRAPH_METRICS[plant].map((m) => m.unit))) {
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
      fields.append(unitLabel);
      controls.append(fields);
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
      controls.append(axisFields, node('p', t('graphAxisHint'), 'graph-help'));
      const options = node('fieldset', undefined, 'graph-options');
      controls.append(options);
      function variables() {
        options.replaceChildren(
          node('legend', t('graphVariables') + ' (' + config.series.length + ')'),
        );
        for (const department of Object.keys(DEPARTMENTS)) {
          const metrics = GRAPH_METRICS[plant].filter(
            (m) => m.department === department && m.unit === config.unit,
          );
          if (!metrics.length) continue;
          const group = node('div', undefined, 'graph-variable-group');
          group.append(node('strong', departmentTitle(plant, department).join(' / ')));
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
            label.append(input, node('span', metric.label));
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
        if (layouts[plant].length >= 32) {
          toast(t('graphLimit'));
          return;
        }
        layouts[plant].splice(index + 1, 0, structuredClone(config));
        store();
        renderCards();
      });
      remove.addEventListener('click', () => {
        layouts[plant].splice(index, 1);
        store();
        renderCards();
      });
      const frame = node('div', undefined, 'graph-frame');
      frame.tabIndex = 0;
      const prompt = node('p', undefined, 'graph-prompt');
      const tableDetails = node('details', undefined, 'graph-data');
      tableDetails.append(node('summary', t('graphData')));
      const tableWrap = node('div', undefined, 'graph-data-scroll');
      tableDetails.append(tableWrap);
      let svg;
      const exports = [];
      const copy = node('button', t('graphCopy'), 'button secondary');
      copy.dataset.graphCopy = '';
      copy.addEventListener('click', async () => {
        if (copy.disabled || !svg) return;
        const identity = epoch,
          original = data;
        copy.disabled = true;
        const stillCurrent = () =>
          identity === epoch && original === data && $('graphs-dialog').open;
        try {
          await copyGraph(svg, stillCurrent);
          if (stillCurrent()) toast(t('graphCopied'));
        } catch {
          if (stillCurrent()) toast(t('graphCopyError'));
        } finally {
          if (identity === epoch && card.isConnected) draw();
        }
      });
      exports.push(copy);
      actions.append(copy);
      for (const format of ['svg', 'png']) {
        const button = node('button', format.toUpperCase(), 'button secondary');
        button.dataset.graphExport = format;
        button.addEventListener('click', async () => {
          if (button.disabled || !svg) return;
          const identity = epoch,
            original = data;
          button.disabled = true;
          try {
            await exportGraph(
              svg,
              format,
              plant + '-graph-' + (index + 1) + '-' + data.start + '-' + data.end,
              () => identity === epoch && original === data && $('graphs-dialog').open,
            );
          } catch {
            if (identity === epoch) toast(t('graphExportError'));
          } finally {
            if (identity === epoch && card.isConnected) draw();
          }
        });
        exports.push(button);
        actions.append(button);
      }
      actions.append(duplicate, remove);
      card.append(controls, frame, prompt, actions, tableDetails);
      $('graph-cards').append(card);
      function draw() {
        const chosen = GRAPH_METRICS[plant].filter((m) => config.series.includes(m.key));
        const axisValid = validYAxis(config.yAxis);
        const valid =
          config.series.length && config.titleEn.trim() && config.titleZh.trim() && axisValid;
        const usable = data?.records.some(
          (r) =>
            !r.overlap && !r.superseded && chosen.some((m) => Number.isFinite(r.values[m.key])),
        );
        exports.forEach((b) => (b.disabled = !valid || !usable || loading));
        prompt.textContent = !axisValid ? t('graphAxisInvalid') : valid ? '' : t('graphSelect');
        frame.replaceChildren();
        svg = null;
        if (data && axisValid) {
          svg = renderGraph(config, data);
          frame.append(svg);
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
          ...chosen.map((m) => m.label + ' (' + m.unit + ')'),
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
              record.startDate +
                ' 08:00 → ' +
                record.endDate +
                ' 08:00 (' +
                record.days * 24 +
                ' h)' +
                (record.overlap
                  ? ' · ' + t('graphExcluded')
                  : record.superseded
                    ? ' · ' + t('graphReplaced')
                    : ''),
            ),
            node(
              'td',
              record.source === 'excel'
                ? t('graphImported') + ' · ' + record.sourceLabel
                : t('graphRevision') + ' ' + record.revision,
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
  $('open-graphs').addEventListener('click', () => {
    if (!user) return;
    $('graph-plant').value = current().plantKey;
    if (!validDate($('graph-start').value) && validDate(current().startDate)) {
      $('graph-start').value = current().startDate.slice(0, 7) + '-01';
      const [year, month] = current().startDate.split('-').map(Number);
      $('graph-end').value = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    }
    $('graphs-dialog').showModal();
    void load();
  });
  $('graph-refresh').addEventListener('click', () => void load());
  for (const id of ['graph-plant', 'graph-start', 'graph-end'])
    $(id).addEventListener('change', () => void load());
  $('graph-presets').addEventListener('click', () => {
    if (!confirm(t('graphResetConfirm'))) return;
    layouts[factory()] = defaultGraphs(factory());
    store();
    renderCards();
  });
  $('graph-add').addEventListener('click', () => {
    const plant = factory();
    if (layouts[plant].length >= 32) {
      toast(t('graphLimit'));
      return;
    }
    layouts[plant].push({
      titleEn: plant + ' electrical consumption',
      titleZh: plant + '工厂用电量',
      unit: 'kWh',
      series: [],
    });
    store();
    renderCards();
    const card = $('graph-cards').lastElementChild;
    card.querySelector('details').open = true;
    card.scrollIntoView({ block: 'start' });
  });
  $('graphs-dialog').addEventListener('close', () => {
    sequence++;
    data = null;
    loading = false;
    $('graph-cards').replaceChildren();
    $('graph-status').textContent = '';
    $('graph-warnings').replaceChildren();
  });
  return {
    reset,
    render,
    saved() {
      data = null;
      if ($('graphs-dialog').open) {
        status = 'graphStale';
        void load();
      }
    },
  };
}
