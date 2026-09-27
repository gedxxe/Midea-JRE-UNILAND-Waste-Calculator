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
export function renderGraph(config, { plant, start, end, records }) {
  const metrics = config.series
    .map((key) => GRAPH_METRICS[plant].find((m) => m.key === key))
    .filter(Boolean);
  const periods = records.filter((r) => !r.overlap && !r.superseded && r.days > 0);
  const chartWidth = Math.max(1000, periods.length * 30 + 260);
  const positions = new Map(periods.map((r, i) => [r.startDate + '/' + r.endDate, i]));
  const canvas = document.createElement('canvas'),
    context = canvas.getContext('2d');
  function width(text, size = 14, bold = false) {
    context.font = (bold ? 'bold ' : '') + size + 'px Arial';
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
  const titleLines = [
    ...wrap(config.titleEn, 910, 18, true),
    ...wrap(config.titleZh, 910, 18, true),
  ];
  const labelDepth =
    Math.ceil(
      Math.max(
        40,
        ...periods.map((p) => width(periodLabel(p.startDate, p.endDate), 14) * Math.SQRT1_2),
      ),
    ) + 20;
  const top = 32 + titleLines.length * 24 + 30,
    left = 100,
    right = chartWidth - 160,
    plotHeight = 310,
    bottom = top + plotHeight;
  const legend = [];
  let lx = left,
    ly = bottom + labelDepth + 64;
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
  const height = ly + Math.max(1, ...legend.map((l) => l.lines.length)) * 16 + 48;
  const svg = svgNode('svg', {
    xmlns: NS,
    viewBox: '0 0 ' + chartWidth + ' ' + height,
    width: chartWidth,
    height,
    role: 'img',
    'aria-label': config.titleEn + ' / ' + config.titleZh,
    'font-family': FONT,
  });
  svg.append(
    svgNode('title', {}, config.titleEn + ' / ' + config.titleZh),
    svgNode(
      'desc',
      {},
      'Saved energy records. Missing values are gaps. Overlapping periods are not plotted.',
    ),
  );
  svg.append(svgNode('rect', { width: chartWidth, height, fill: '#ffffff' }));
  titleLines.forEach((line, i) =>
    svg.append(
      svgNode(
        'text',
        {
          x: chartWidth / 2,
          y: 29 + i * 24,
          'text-anchor': 'middle',
          'font-size': 18,
          'font-weight': 700,
          fill: '#111111',
        },
        line,
      ),
    ),
  );
  svg.style.minWidth = chartWidth + 'px';
  const multi = periods.some((r) => r.days > 1);
  svg.append(
    svgNode(
      'text',
      { x: chartWidth / 2, y: top - 16, 'text-anchor': 'middle', 'font-size': 13, fill: '#333333' },
      plant +
        ' | ' +
        start +
        ' to ' +
        end +
        (multi ? ' | Includes multi-day period totals / 含多日合计' : ''),
    ),
  );
  const segments = metrics.map((metric) => ({ metric, parts: graphSegments(records, metric.key) }));
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
  const unitLabel =
    config.unit === 'kWh'
      ? 'Electricity / 用电量 (kWh)'
      : 'Consumption / 用量 (' + config.unit + ')';
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
        y: bottom + labelDepth + 35,
        'text-anchor': 'middle',
        'font-size': 14,
        fill: '#111111',
      },
      'Consumption period / 用量时段',
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
        'Manual Y: ' +
          formatNumber(axis.min, 8) +
          ' to ' +
          formatNumber(axis.max, 8) +
          (axis.clipped ? ' | Values outside view / 部分数值超出范围' : ''),
      ),
    );
  segments.forEach(({ metric, parts }, index) => {
    const color = COLORS[index % COLORS.length],
      dash = ['none', '5 3', '2 3', '8 3 2 3', '10 4'][Math.floor(index / COLORS.length) % 5];
    for (const part of parts) {
      plot.append(
        svgNode('path', {
          d: part.map((p, i) => (i ? 'L' : 'M') + x(p) + ' ' + y(p.value)).join(' '),
          fill: 'none',
          stroke: color,
          'stroke-width': 1.4,
          'stroke-dasharray': dash,
          'stroke-linejoin': 'round',
        }),
      );
      for (const p of part) {
        const mark = svgNode('circle', {
          cx: x(p),
          cy: y(p.value),
          r: 2.4,
          fill: color,
          'data-series': metric.key,
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
              p.startDate +
              ' 08:00 to ' +
              p.endDate +
              ' 08:00 WIB | ' +
              p.days * 24 +
              ' h | ' +
              (p.source === 'excel' ? 'Excel history / Excel 历史数据' : 'revision ' + p.revision),
          ),
        );
        plot.append(mark);
      }
    }
    const item = legend[index];
    svg.append(
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
      svg.append(
        svgNode(
          'text',
          { x: item.x + 32, y: item.y + i * 16, 'font-size': 13, fill: '#222222' },
          line,
        ),
      ),
    );
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
        'No saved values to plot / 无可绘制的已保存数据',
      ),
    );
  svg.append(
    svgNode(
      'text',
      { x: left, y: height - 16, 'font-size': 11, fill: '#555555' },
      'Missing data: gaps / 缺失数据留空' +
        (records.some((r) => r.overlap) ? ' | Overlapping periods excluded / 已排除重叠时段' : ''),
    ),
  );
  return svg;
}
function svgBlob(svg) {
  return new Blob([new XMLSerializer().serializeToString(svg)], {
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
