import { pngResolution } from '../png.js';
import { GRAPH_METRICS } from '../graph-schema.js';
import { graphSegments } from '../graph-data.js';
import { dayDiff, shiftDate, formatNumber } from '../numbers.js';
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
function dateLabel(date) {
  return date.slice(8, 10) + '/' + date.slice(5, 7);
}
function tickStep(max) {
  if (max <= 0) return 1;
  const rough = max / 5,
    power = 10 ** Math.floor(Math.log10(rough)),
    scaled = rough / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}
export function renderGraph(config, { plant, start, end, records }) {
  const metrics = config.series
    .map((key) => GRAPH_METRICS[plant].find((m) => m.key === key))
    .filter(Boolean);
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
  const top = 32 + titleLines.length * 24 + 30,
    left = 100,
    right = 960,
    plotHeight = 310,
    bottom = top + plotHeight;
  const legend = [];
  let lx = left,
    ly = bottom + 74;
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
    viewBox: '0 0 1000 ' + height,
    width: 1000,
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
  svg.append(svgNode('rect', { width: 1000, height, fill: '#ffffff' }));
  titleLines.forEach((line, i) =>
    svg.append(
      svgNode(
        'text',
        {
          x: 500,
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
  const multi = records.some((r) => r.days > 1);
  svg.append(
    svgNode(
      'text',
      { x: 500, y: top - 16, 'text-anchor': 'middle', 'font-size': 13, fill: '#333333' },
      plant +
        ' | ' +
        start +
        ' to ' +
        end +
        (multi ? ' | Includes multi-day period totals / 含多日合计' : ''),
    ),
  );
  const segments = metrics.map((metric) => ({ metric, parts: graphSegments(records, metric.key) }));
  const maximum = Math.max(
    0,
    ...segments.flatMap((s) => s.parts.flatMap((p) => p.map((v) => v.value))),
  );
  const step = tickStep(maximum),
    yMax = Math.max(step, Math.ceil(maximum / step) * step);
  const span = Math.max(1, dayDiff(start, end));
  const x = (date) => left + (right - left) * (dayDiff(start, date) / span);
  const y = (value) => bottom - (plotHeight * value) / yMax;
  for (let i = 0; i <= Math.round(yMax / step); i++) {
    const value = i * step,
      py = y(value);
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
        value >= 1e7 ? value.toExponential(1) : formatNumber(value, 8),
      ),
    );
  }
  const tickCount = Math.min(7, span);
  const days = [
    ...new Set(Array.from({ length: tickCount + 1 }, (_, i) => Math.round((i * span) / tickCount))),
  ];
  for (const day of days) {
    const date = shiftDate(start, day);
    if (date > end) continue;
    svg.append(
      svgNode('line', {
        x1: x(date),
        x2: x(date),
        y1: bottom,
        y2: bottom + 5,
        stroke: '#222222',
        'stroke-width': 1,
      }),
    );
    svg.append(
      svgNode(
        'text',
        { x: x(date), y: bottom + 23, 'text-anchor': 'middle', 'font-size': 13, fill: '#222222' },
        dateLabel(date),
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
        y: bottom + 47,
        'text-anchor': 'middle',
        'font-size': 14,
        fill: '#111111',
      },
      'Report start date / 报告开始日期',
    ),
  );
  segments.forEach(({ metric, parts }, index) => {
    const color = COLORS[index % COLORS.length],
      dash = ['none', '5 3', '2 3', '8 3 2 3', '10 4'][Math.floor(index / COLORS.length) % 5];
    for (const part of parts) {
      svg.append(
        svgNode('path', {
          d: part.map((p, i) => (i ? 'L' : 'M') + x(p.startDate) + ' ' + y(p.value)).join(' '),
          fill: 'none',
          stroke: color,
          'stroke-width': 1.4,
          'stroke-dasharray': dash,
          'stroke-linejoin': 'round',
        }),
      );
      for (const p of part) {
        const mark = svgNode('circle', {
          cx: x(p.startDate),
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
        svg.append(mark);
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
    canvas.width = 4000;
    canvas.height = Number(svg.getAttribute('height')) * 4;
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
