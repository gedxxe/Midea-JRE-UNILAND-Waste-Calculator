import { node } from './dom.js';
import { getLanguage, t } from '../i18n/index.js';
import { GRAPH_METRICS } from '../graph-schema.js';
import { metricLabel, graphPeriodLabel, graphSourceLabel } from '../graph-presentation.js';
import { formatNumber } from '../numbers.js';

export function attachGraphInteraction(frame, svg, config, records, onToggle) {
  const periods = records.filter((r) => !r.overlap && !r.superseded && r.days > 0);
  const stage = node('div', undefined, 'graph-stage');
  stage.style.minWidth = svg.style.minWidth;
  const line = node('div', undefined, 'graph-crosshair');
  const tip = node('div', undefined, 'graph-hover');
  line.hidden = tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  stage.append(svg, line, tip);
  frame.append(stage);
  frame.setAttribute('aria-label', t('graphExplore'));
  let selected = -1;
  const bounds = svg.dataset.plotBounds.split(',').map(Number);
  const [left, top, right, bottom] = bounds;
  const svgWidth = Number(svg.getAttribute('width'));
  const clear = () => {
    selected = -1;
    line.hidden = tip.hidden = true;
    svg
      .querySelectorAll('.graph-point-active')
      .forEach((point) => point.classList.remove('graph-point-active'));
  };
  function show(index, keyboard = false) {
    if (!periods.length || index === selected) return;
    clear();
    selected = index;
    const record = periods[index],
      language = getLanguage();
    tip.replaceChildren(node('strong', graphPeriodLabel(record, language)));
    for (const key of config.series) {
      if (config.hiddenSeries?.includes(key)) continue;
      const metric = GRAPH_METRICS[config.plant].find((m) => m.key === key);
      if (!metric) continue;
      const row = node('div', undefined, 'graph-hover-row');
      const mark = svg.querySelector('[data-graph-toggle="' + key + '"] line');
      row.style.setProperty('--series-color', mark?.getAttribute('stroke') || '#165a9c');
      row.append(
        node('span', metricLabel(metric, language)),
        node(
          'b',
          Number.isFinite(record.values[key])
            ? formatNumber(record.values[key], 8) + ' ' + config.unit
            : t('graphMissing'),
        ),
      );
      tip.append(row);
    }
    const source = graphSourceLabel(record, t);
    tip.append(node('small', source));
    tip.setAttribute('aria-live', keyboard ? 'polite' : 'off');
    const scale = svg.getBoundingClientRect().width / svgWidth;
    const x =
      (left + (right - left) * (periods.length > 1 ? index / (periods.length - 1) : 0.5)) * scale;
    line.style.left = x + 'px';
    line.style.top = top * scale + 'px';
    line.style.height = (bottom - top) * scale + 'px';
    line.hidden = tip.hidden = false;
    const visibleLeft = frame.scrollLeft + 8;
    tip.style.top = top * scale + 12 + 'px';
    tip.style.left =
      Math.max(
        visibleLeft,
        Math.min(x + 16, frame.scrollLeft + frame.clientWidth - tip.offsetWidth - 8),
      ) + 'px';
    svg
      .querySelectorAll('[data-period-index="' + index + '"]')
      .forEach((point) => point.classList.add('graph-point-active'));
    if (keyboard) {
      const target = x - frame.clientWidth / 2;
      frame.scrollLeft = Math.max(0, target);
      tip.style.left =
        Math.max(
          frame.scrollLeft + 8,
          Math.min(x + 16, frame.scrollLeft + frame.clientWidth - tip.offsetWidth - 8),
        ) + 'px';
    }
  }
  function point(event) {
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * svgWidth) / rect.width;
    const y = ((event.clientY - rect.top) * svgWidth) / rect.width;
    if (x < left || x > right || y < top || y > bottom) {
      clear();
      return;
    }
    show(
      Math.max(
        0,
        Math.min(
          periods.length - 1,
          Math.round(((x - left) / (right - left)) * (periods.length - 1)),
        ),
      ),
    );
  }
  svg.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'touch') point(event);
  });
  svg.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') point(event);
  });
  frame.addEventListener('pointerleave', clear);
  frame.addEventListener('focusout', (event) => {
    if (!frame.contains(event.relatedTarget)) clear();
  });
  frame.addEventListener('keydown', (event) => {
    if (event.target.closest('[data-graph-toggle]')) return;
    if (event.key === 'Escape') {
      if (selected >= 0) {
        event.preventDefault();
        event.stopPropagation();
        clear();
      }
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    show(
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? periods.length - 1
          : Math.max(
              0,
              Math.min(
                periods.length - 1,
                selected < 0 ? 0 : selected + (event.key === 'ArrowRight' ? 1 : -1),
              ),
            ),
      true,
    );
  });
  for (const control of svg.querySelectorAll('[data-graph-toggle]')) {
    const toggle = () => onToggle(control.dataset.graphToggle);
    control.addEventListener('click', toggle);
    control.addEventListener('keydown', (event) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        toggle();
      }
    });
  }
}
