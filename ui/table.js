import { observationLabel } from '../reading-period.js';
import { PLANT_SCHEMAS, UTILITIES } from '../schema.js';
import { formatNumber, normalizeName } from '../numbers.js';
import { formatRowValue } from '../engine.js';
import { gasCalibration, gasUsageText } from '../gas.js';
import { planTablePaste } from '../importer.js';
import { t } from '../i18n/index.js';
import { $, node } from './dom.js';

function includedMeterNames(sources) {
  const groups = new Map();
  for (const { name, meter } of sources) groups.set(name, [...(groups.get(name) || []), meter + 1]);
  return [...groups]
    .map(
      ([name, meters]) => name + ', meter' + (meters.length > 1 ? 's ' : ' ') + meters.join(', '),
    )
    .join(' + ');
}

export function createMeterTable({ getPlant, current, getReport, changed, rememberUndo, toast }) {
  const coordinates = [];
  const rowNodes = [];
  const inputNodes = [];
  const outputNodes = [];
  const meterUsageNodes = [];
  function buildTable() {
    coordinates.length = 0;
    rowNodes.length = 0;
    inputNodes.length = 0;
    outputNodes.length = 0;
    meterUsageNodes.length = 0;
    const fragment = document.createDocumentFragment();
    PLANT_SCHEMAS[getPlant()].rows.forEach((row, ri) => {
      rowNodes[ri] = [];
      inputNodes[ri] = [];
      meterUsageNodes[ri] = [];
      row.factors.forEach((factor, mi) => {
        coordinates.push({ ri, mi });
        const tr = node('tr');
        tr.classList.toggle('group-end', mi === row.factors.length - 1);
        tr.classList.toggle('main-row', ri === 0);
        tr.dataset.row = ri;
        if (mi === 0) {
          const equipment = node('td', undefined, 'equipment');
          equipment.rowSpan = row.factors.length;
          equipment.append(
            node('span', String(ri + 1).padStart(2, '0'), 'equipment-number'),
            node('span', row.name),
          );
          if (row.deductMeters)
            equipment.append(
              node(
                'small',
                t(row.netMeter === undefined ? 'netUsageHint' : 'netMeterUsageHint', {
                  meter: row.netMeter + 1,
                  meters: includedMeterNames(row.deductMeters),
                }) + (row.floorNetAtZero ? ' ' + t('netZeroFloorHint') : ''),
              ),
            );
          if (row.reportFrom)
            equipment.append(node('small', t('meterReportFromHint', { date: row.reportFrom })));
          if (row.allowInactive) {
            const label = node('label', undefined, 'check-label');
            const check = node('input');
            check.type = 'checkbox';
            check.checked = current().rows[ri].inactive;
            check.setAttribute('aria-label', `${row.name}: ${t('inactive')}`);
            check.addEventListener('change', () => {
              current().rows[ri].inactive = check.checked;
              changed();
            });
            label.append(check, node('span', t('inactive')));
            equipment.append(label);
          }
          tr.append(equipment);
        }
        const ratio = node('td', undefined, 'ratio');
        ratio.append(
          node('span', row.meterNames?.[mi] || `Meter ${mi + 1}`),
          node(
            'strong',
            row.ratioLabel ? `× ${row.ratioLabel}` : factor === 1 ? t('direct') : `× ${factor}`,
          ),
        );
        tr.append(ratio);
        inputNodes[ri][mi] = {};
        for (const side of ['start', 'end']) {
          const td = node('td', undefined, 'reading-cell');
          const input = node('input', undefined, 'meter-input');
          input.type = 'text';
          input.inputMode = 'decimal';
          input.autocomplete = 'off';
          input.spellcheck = false;
          input.maxLength = 50;
          input.placeholder = t('enterReading');
          input.value = current().rows[ri][side][mi];
          input.dataset.row = ri;
          input.dataset.meter = mi;
          input.dataset.side = side;
          input.setAttribute(
            'aria-label',
            `${row.name}, meter ${mi + 1}, ${t(side === 'start' ? 'startReading' : 'endReading')}`,
          );
          input.addEventListener('input', () => {
            current().rows[ri][side][mi] = input.value;
            changed(false, [{ ri, mi, side }]);
          });
          input.addEventListener('paste', handlePaste);
          input.addEventListener('blur', () => setTimeout(filterTable, 0));
          input.addEventListener('keydown', handleGridKey);
          inputNodes[ri][mi][side] = input;
          td.append(input);
          if (side === 'end') {
            const usage = node('div', undefined, 'meter-usage');
            usage.dataset.meterUsage = `${ri}-${mi}`;
            usage.append(
              node('span', t(row.netMeter === mi ? 'netMeterUsage' : 'meterUsage')),
              node('strong', '-'),
            );
            meterUsageNodes[ri][mi] = usage.lastChild;
            td.append(usage);
          }
          tr.append(td);
        }
        if (mi === 0) {
          const output = node('td', undefined, 'energy');
          output.rowSpan = row.factors.length;
          output.append(node('span', '-'), node('small', row.unit));
          outputNodes[ri] = output;
          tr.append(output);
        }
        rowNodes[ri].push(tr);
        fragment.append(tr);
      });
    });
    $('meter-body').replaceChildren(fragment);
  }
  function visibleCoordinates() {
    return coordinates.filter(({ ri }) => !rowNodes[ri][0].hidden);
  }
  function handlePaste(event) {
    const text = event.clipboardData.getData('text/plain');
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    const { row, meter, side } = event.target.dataset;
    const coords = visibleCoordinates();
    const index = coords.findIndex((item) => item.ri === Number(row) && item.mi === Number(meter));
    try {
      const changes = planTablePaste(text, coords, index, side);
      rememberUndo();
      changes.forEach(({ ri, mi, side, value }) => {
        current().rows[ri][side][mi] = value;
        inputNodes[ri][mi][side].value = value;
      });
      changed(
        false,
        changes.map(({ ri, mi, side }) => ({ ri, mi, side })),
      );
      toast(t('cellsPasted', { count: changes.length }));
    } catch (error) {
      toast(error.message);
    }
  }
  function handleGridKey(event) {
    if (!['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key) || event.ctrlKey || event.metaKey)
      return;
    const { row, meter, side } = event.target.dataset;
    const coords = visibleCoordinates();
    const index = coords.findIndex((item) => item.ri === Number(row) && item.mi === Number(meter));
    const direction = event.key === 'ArrowUp' || event.shiftKey ? -1 : 1;
    const next = coords[index + direction];
    if (next) {
      event.preventDefault();
      inputNodes[next.ri][next.mi][side].focus();
    }
  }
  function buildUtilities() {
    $('utility-fields').replaceChildren();
    UTILITIES[getPlant()].forEach(([name, unit], i) => {
      if (i === 4) return;
      const gasIndex = gasCalibration(getPlant()).gases.findIndex((gas) => gas.utilityIndex === i);
      const calculated = gasIndex >= 0 && current().gas?.entries[gasIndex]?.enabled;
      const wrapper = node('div', undefined, 'utility-entry');
      if (calculated) unit = 'Kg';
      const label = node('label', `${name}${unit ? ` (${unit})` : ''}`);
      const input = node('input');
      input.dataset.utility = i;
      input.disabled = Boolean(calculated);
      if (input.disabled) label.append(node('span', t('gasCalculated')));
      input.type = 'text';
      input.inputMode = 'decimal';
      input.maxLength = 50;
      input.placeholder = t('empty');
      input.value = current().utilities[i].value;
      input.addEventListener('input', () => {
        current().utilities[i].value = input.value;
        changed();
      });
      label.append(input);
      const note = node('input', undefined, 'utility-note');
      note.type = 'text';
      note.maxLength = 500;
      note.placeholder = t('note');
      note.value = current().utilities[i].note;
      note.setAttribute('aria-label', t('noteLabel', { name }));
      note.addEventListener('input', () => {
        current().utilities[i].note = note.value;
        changed();
      });
      wrapper.append(label, note);
      if (gasIndex >= 0) $('gas-utility-' + i)?.replaceChildren(wrapper);
      else $('utility-fields').append(wrapper);
    });
  }
  function filterTable() {
    const query = normalizeName($('search-meter').value);
    let visible = 0;
    PLANT_SCHEMAS[getPlant()].rows.forEach((row, ri) => {
      const needsCheck =
        getReport().calculatedRows[ri].missing || getReport().issues.some((i) => i.rowIndex === ri);
      const editing = document.activeElement?.dataset.row === String(ri);
      const hidden =
        !normalizeName(row.name).includes(query) ||
        ($('only-incomplete').checked && !needsCheck && !editing);
      rowNodes[ri].forEach((tr) => {
        tr.hidden = hidden;
      });
      if (!hidden) visible++;
    });
    $('no-matches').hidden = visible !== 0;
  }
  function update(report) {
    for (const side of ['start', 'end'])
      $(side + '-reading-date').textContent = observationLabel(current(), side);
    report.gasResults?.forEach((result) => {
      const index = gasCalibration(getPlant()).gases.find(
        (gas) => gas.id === result.gas,
      ).utilityIndex;
      const input = document.querySelector(`[data-utility="${index}"]`);
      if (input) input.value = gasUsageText(result.kg);
    });
    report.calculatedRows.forEach((row, ri) => {
      const rowIssues = report.issues.filter((i) => i.rowIndex === ri);
      const output = outputNodes[ri];
      output.firstChild.textContent = formatRowValue(getPlant(), row);
      output.lastChild.textContent = row.missing
        ? rowIssues.some((i) => i.code === 'EMPTY_READING')
          ? t('empty')
          : t('check')
        : row.unit;
      output.classList.toggle(
        'check',
        rowIssues.some((i) => i.code !== 'EMPTY_READING'),
      );
      output.title = row.meters
        .map(
          (m) =>
            `${m.start || '?'} → ${m.end || '?'} × ${m.factor} = ${formatNumber(m.grossEnergy ?? m.energy, 8)} ${row.unit}`,
        )
        .join('\n');
      if (row.deductMeters)
        output.title +=
          '\n' +
          t('netUsageCalculation', {
            floor: row.floorNetAtZero ? 'max(0, ' : '',
            close: row.floorNetAtZero ? ')' : '',
            gross: formatNumber(row.grossEnergy, 8),
            deductions: row.deductions
              .map(
                ({ name, meter, energy }) =>
                  name + ', meter ' + (meter + 1) + ' (' + formatNumber(energy, 8) + ')',
              )
              .join(' - '),
            net: formatRowValue(getPlant(), row),
            unit: row.unit,
          });
      inputNodes[ri].forEach((pair, mi) => {
        const meter = row.meters[mi];
        const value = formatRowValue(getPlant(), {
          totalEnergy: meter?.energy,
          missing: meter?.energy == null,
        });
        meterUsageNodes[ri][mi].textContent = `${value} ${row.unit}`;
        const relevant = rowIssues.filter((i) => i.meterIndex === mi && i.code !== 'EMPTY_READING');
        for (const input of Object.values(pair)) {
          input.setAttribute('aria-invalid', String(relevant.length > 0));
          input.title = relevant.map((i) => i.message).join('\n');
        }
      });
    });
  }

  return {
    buildUtilities,
    rebuild() {
      buildTable();
      buildUtilities();
    },
    filter: filterTable,
    update,
    focusIssue(issue) {
      const input = inputNodes[issue.rowIndex]?.[issue.meterIndex ?? 0]?.start;
      if (input) {
        input.focus();
        input.scrollIntoView({ block: 'center' });
      }
    },
  };
}
