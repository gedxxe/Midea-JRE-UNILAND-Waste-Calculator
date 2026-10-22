import { smoothPath } from '../graph-curve.js';
import { getLanguage, t } from '../i18n/index.js';
import { graphTitleField, metricLabel, graphPeriodLabel } from '../graph-presentation.js';
import { pngResolution } from '../png.js';
import { GRAPH_METRICS } from '../graph-schema.js';
import { graphSegments } from '../graph-data.js';
import { formatNumber } from '../numbers.js';
import { periodLabel, graphYAxis } from '../graph-axis.js';
const NS = 'http://www.w3.org/2000/svg';
const COLORS = [
  '#165a9c',
  '#b33b35',
  '#28754e',
  '#7651a8',
  '#aa651a',
  '#167b83',
  '#963c72',
  '#555555',
];
const FONT = 'Arial, Helvetica, "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
function svgNode(name, attrs = {}, text) {
  const el = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (text !== undefined) el.textContent = text;
  return el;
}
export function renderGraph(config, { plant, start, end, records, kind = 'daily' }) {
  const language = getLanguage();
  const title = config[graphTitleField(language)] ?? config.titleEn;
  const metrics = config.series
    .map((key) => GRAPH_METRICS[plant].find((m) => m.key === key))
    .filter(Boolean)
    .map((metric) => ({ ...metric, label: metricLabel(metric, language) }));
  const periods = records.filter((r) => !r.overlap && !r.superseded && r.days > 0);
  const chartWidth = Math.max(1000, periods.length * 32 + 180);
  const positions = new Map(periods.map((r, i) => [r.startDate + '/' + r.endDate, i]));
  const canvas = document.createElement('canvas'),
    context = canvas.getContext('2d');
  function width(text, size = 14, bold = false) {
    context.font = (bold ? 'bold ' : '') + size + 'px ' + FONT;
    return context.measureText(text).width;
  }
  function wrap(text, max, size = 14, bold = false) {
    const lines = [];
    let line = '';
    for (const char of text) {
      if (line && width(line + char, size, bold) > max) {
        lines.push(line.trim());
        line = '';
      }
      line += char;
    }
    if (line) lines.push(line.trim());
    return lines.length ? lines : [''];
  }
  const titleLines = wrap(title, chartWidth - 100, 20, true);
  const labelDepth =
    Math.ceil(
      Math.max(
        40,
        ...periods.map((p) => width(periodLabel(p.startDate, p.endDate), 14) * Math.SQRT1_2),
      ),
    ) + 20;
  const top = 28 + titleLines.length * 24 + 20,
    left = 85,
    right = chartWidth - 45,
    plotHeight = 240,
    bottom = top + plotHeight;
  const legend = [];
  let lx = left,
    ly = bottom + labelDepth + 36;
  metrics.forEach((metric) => {
    const lines = wrap(metric.label, 250, 13),
      span = Math.min(285, Math.max(...lines.map((t) => width(t, 13))) + 42);
    if (lx + span > right) {
      lx = left;
      ly += 42;
    }
    legend.push({ metric, x: lx, y: ly, lines });
    lx += span + 20;
  });
  const height = ly + Math.max(1, ...legend.map((l) => l.lines.length)) * 16 + 32;
  const svg = svgNode('svg', {
    xmlns: NS,
    viewBox: '0 0 ' + chartWidth + ' ' + height,
    width: chartWidth,
    height,
    role: 'img',
    'aria-label': title,
    lang: language,
    'font-family': FONT,
    'data-plot-bounds': [left, top, right, bottom].join(','),
  });
  svg.append(svgNode('title', {}, title), svgNode('desc', {}, t('graphPlotDesc')));
  svg.append(svgNode('rect', { width: chartWidth, height, fill: '#ffffff' }));
  titleLines.forEach((line, i) =>
    svg.append(
      svgNode(
        'text',
        {
          x: chartWidth / 2,
          y: 29 + i * 24,
          'text-anchor': 'middle',
          'font-size': 20,
          'font-weight': 700,
          fill: '#111111',
        },
        line,
      ),
    ),
  );
  svg.style.minWidth = Math.max(680, periods.length * 32 + 180) + 'px';
  const multi = periods.some((r) => r.days > 1);
  svg.append(
    svgNode(
      'text',
      { x: chartWidth / 2, y: top - 16, 'text-anchor': 'middle', 'font-size': 13, fill: '#333333' },
      t('graphDateRange', { start, end }) +
        ' · ' +
        t(
          kind === 'nightShift'
            ? 'graphNight'
            : kind === 'workingHours'
              ? 'graphAfter'
              : 'graphDaily',
        ) +
        (multi ? ' · ' + t('graphMultiNote') : ''),
    ),
  );
  const segments = metrics
    .filter((metric) => !config.hiddenSeries?.includes(metric.key))
    .map((metric) => ({ metric, parts: graphSegments(records, metric.key) }));
  const axis = graphYAxis(
    segments.flatMap((s) => s.parts.flatMap((p) => p.map((v) => v.value))),
    config.yAxis,
  );
  if (!axis) return svg;
  const x = (period) =>
    left +
    (right - left) *
      (periods.length > 1
        ? positions.get(period.startDate + '/' + period.endDate) / (periods.length - 1)
        : 0.5);
  const y = (value) => bottom - (plotHeight * (value - axis.min)) / (axis.max - axis.min);
  for (const value of axis.ticks) {
    const py = y(value);
    svg.append(
      svgNode('line', {
        x1: left,
        y1: py,
        x2: right,
        y2: py,
        stroke: '#d7dce0',
        'stroke-width': 0.6,
      }),
    );
    svg.append(
      svgNode(
        'text',
        { x: left - 10, y: py + 4, 'text-anchor': 'end', 'font-size': 13, fill: '#222222' },
        value >= 1e7 || (value > 0 && value < 0.0001)
          ? value.toExponential(2)
          : formatNumber(value, 8),
      ),
    );
  }
  for (const period of periods) {
    const px = x(period);
    svg.append(
      svgNode('line', {
        x1: px,
        x2: px,
        y1: bottom,
        y2: bottom + 5,
        stroke: '#222222',
        'stroke-width': 1,
      }),
    );
    svg.append(
      svgNode(
        'text',
        {
          x: px,
          y: bottom + 18,
          transform: 'rotate(45 ' + px + ' ' + (bottom + 18) + ')',
          'text-anchor': 'start',
          'font-size': 14,
          fill: '#222222',
          'data-period-label': '',
        },
        periodLabel(period.startDate, period.endDate),
      ),
    );
  }
  svg.append(
    svgNode('path', {
      d: 'M' + left + ' ' + top + ' V' + bottom + ' H' + right,
      fill: 'none',
      stroke: '#222222',
      'stroke-width': 1,
    }),
  );
  const unitLabel = config.unit;
  svg.append(
    svgNode(
      'text',
      {
        x: 25,
        y: top + plotHeight / 2,
        transform: 'rotate(-90 25 ' + (top + plotHeight / 2) + ')',
        'text-anchor': 'middle',
        'font-size': 14,
        fill: '#111111',
      },
      unitLabel,
    ),
  );
  svg.append(
    svgNode(
      'text',
      {
        x: (left + right) / 2,
        y: bottom + labelDepth + 16,
        'text-anchor': 'middle',
        'font-size': 14,
        fill: '#111111',
      },
      t('graphPeriodAxis'),
    ),
  );
  const clipId = 'plot-' + crypto.randomUUID();
  const defs = svgNode('defs'),
    clip = svgNode('clipPath', { id: clipId });
  clip.append(svgNode('rect', { x: left, y: top, width: right - left, height: plotHeight }));
  defs.append(clip);
  const plot = svgNode('g', { 'clip-path': 'url(#' + clipId + ')', 'data-plot': '' });
  svg.append(defs, plot);
  if (config.yAxis?.mode === 'manual')
    svg.append(
      svgNode(
        'text',
        {
          x: left,
          y: top - 2,
          'font-size': 12,
          fill: '#70420b',
          'data-axis-note': '',
        },
        t('graphManualBounds', { min: formatNumber(axis.min, 8), max: formatNumber(axis.max, 8) }) +
          (axis.clipped ? ' · ' + t('graphOutside') : ''),
      ),
    );
  segments.forEach(({ metric, parts }) => {
    const index = metrics.findIndex((m) => m.key === metric.key);
    const color = COLORS[index % COLORS.length],
      dash = ['none', '5 3', '2 3', '8 3 2 3', '10 4'][Math.floor(index / COLORS.length) % 5];
    for (const part of parts) {
      plot.append(
        svgNode('path', {
          d: smoothPath(part.map((p) => [x(p), y(p.value)])),
          fill: 'none',
          stroke: color,
          'stroke-width': 1.4,
          'stroke-dasharray': dash,
          'stroke-linejoin': 'round',
          'data-series': metric.key,
        }),
      );
      for (const p of part) {
        const mark = svgNode('circle', {
          cx: x(p),
          cy: y(p.value),
          r: 2.4,
          fill: color,
          'data-series': metric.key,
          'data-period-index': positions.get(p.startDate + '/' + p.endDate),
        });
        mark.append(
          svgNode(
            'title',
            {},
            metric.label +
              ': ' +
              formatNumber(p.value, 8) +
              ' ' +
              config.unit +
              ' | ' +
              graphPeriodLabel(p, language) +
              ' | ' +
              (p.source === 'excel'
                ? t('graphImported')
                : t('graphRevision').toLowerCase() + ' ' + p.revision),
          ),
        );
        plot.append(mark);
      }
    }
  });
  metrics.forEach((metric, index) => {
    const item = legend[index],
      hidden = config.hiddenSeries?.includes(metric.key);
    const color = COLORS[index % COLORS.length],
      dash = ['none', '5 3', '2 3', '8 3 2 3', '10 4'][Math.floor(index / COLORS.length) % 5];
    const group = svgNode('g', {
      'data-graph-toggle': metric.key,
      role: 'button',
      tabindex: 0,
      'aria-pressed': !hidden,
      'aria-label': t('graphToggleSeries', { name: metric.label }),
      opacity: hidden ? 0.35 : 1,
    });
    group.append(
      svgNode('rect', {
        x: item.x - 6,
        y: item.y - 21,
        width: Math.max(...item.lines.map((line) => width(line, 13))) + 48,
        height: Math.max(32, item.lines.length * 16 + 12),
        rx: 7,
        fill: '#ffffff',
      }),
      svgNode('line', {
        x1: item.x,
        y1: item.y - 4,
        x2: item.x + 24,
        y2: item.y - 4,
        stroke: color,
        'stroke-width': 1.4,
        'stroke-dasharray': dash,
      }),
    );
    item.lines.forEach((line, i) =>
      group.append(
        svgNode(
          'text',
          {
            x: item.x + 32,
            y: item.y + i * 16,
            'font-size': 13,
            fill: '#222222',
            'text-decoration': hidden ? 'line-through' : 'none',
          },
          line,
        ),
      ),
    );
    svg.append(group);
  });
  const count = segments.reduce((n, s) => n + s.parts.reduce((a, p) => a + p.length, 0), 0);
  if (!count)
    svg.append(
      svgNode(
        'text',
        {
          x: (left + right) / 2,
          y: top + plotHeight / 2,
          'text-anchor': 'middle',
          'font-size': 16,
          fill: '#555555',
        },
        t('graphNoValues'),
      ),
    );
  svg.append(
    svgNode(
      'text',
      { x: left, y: height - 16, 'font-size': 11, fill: '#555555' },
      t('graphGapHint') + (records.some((r) => r.overlap) ? ' ' + t('graphOverlapNote') : ''),
    ),
  );
  return svg;
}
function svgBlob(svg) {
  const copy = svg.cloneNode(true);
  for (const active of copy.querySelectorAll('.graph-point-active'))
    active.classList.remove('graph-point-active');
  for (const legend of copy.querySelectorAll('[data-graph-toggle]'))
    for (const attribute of ['data-graph-toggle', 'role', 'tabindex', 'aria-pressed', 'aria-label'])
      legend.removeAttribute(attribute);
  return new Blob([new XMLSerializer().serializeToString(copy)], {
    type: 'image/svg+xml;charset=utf-8',
  });
}
export async function graphPng(svg) {
  const url = URL.createObjectURL(svgBlob(svg));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    const sourceWidth = Number(svg.getAttribute('width'));
    canvas.width = Math.min(16384, Math.max(4000, sourceWidth * 4));
    canvas.height = Math.round((Number(svg.getAttribute('height')) * canvas.width) / sourceWidth);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Export failed');
    return new Blob([pngResolution(new Uint8Array(await png.arrayBuffer()), 400)], {
      type: 'image/png',
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function copyGraph(svg, stillCurrent = () => true) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
    throw new Error('Clipboard unavailable');
  // Supply the promise during the click so browsers retain the user activation.
  const png = graphPng(svg).then((blob) => {
    if (!stillCurrent()) throw new Error('Graph changed');
    return blob;
  });
  // A permission denial can reject write before PNG encoding finishes.
  void png.catch(() => {});
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
export async function exportGraph(svg, format, filename, stillCurrent = () => true) {
  const output = format === 'png' ? await graphPng(svg) : svgBlob(svg);
  if (!stillCurrent()) return;
  const url = URL.createObjectURL(output),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename + '.' + format;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
