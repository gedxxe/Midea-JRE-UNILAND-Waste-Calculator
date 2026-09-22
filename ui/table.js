import { PLANT_SCHEMAS, UTILITIES } from '../schema.js';
import { formatNumber, normalizeName } from '../numbers.js';
import { formatRowValue } from '../engine.js';
import { planTablePaste } from '../importer.js';
import { t } from '../i18n/index.js';
import { $, node } from './dom.js';

export function createMeterTable({ getPlant, current, getReport, changed, rememberUndo, toast }) {
  const coordinates = [];
  const rowNodes = [];
  const inputNodes = [];
  const outputNodes = [];
  function buildTable() {
    coordinates.length = 0;
    rowNodes.length = 0;
    inputNodes.length = 0;
    outputNodes.length = 0;
    const fragment = document.createDocumentFragment();
    PLANT_SCHEMAS[getPlant()].rows.forEach((row, ri) => {
      rowNodes[ri] = [];
      inputNodes[ri] = [];
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
          node('span', `Meter ${mi + 1}`),
          node(
            'strong',
            row.ratioLabel ? `× ${row.ratioLabel}` : factor === 1 ? t('direct') : `× ${factor}`,
          ),
        );
        tr.append(ratio);
        inputNodes[ri][mi] = {};
        for (const side of ['start', 'end']) {
          const td = node('td');
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
            changed();
          });
          input.addEventListener('paste', handlePaste);
          input.addEventListener('blur', () => setTimeout(filterTable, 0));
          input.addEventListener('keydown', handleGridKey);
          inputNodes[ri][mi][side] = input;
          td.append(input);
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
      changed();
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
    $('utility-fields').replaceChildren(
      ...UTILITIES[getPlant()].map(([name, unit], i) => {
        const wrapper = node('div', undefined, 'utility-entry');
        const label = node('label', `${name}${unit ? ` (${unit})` : ''}`);
        const input = node('input');
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
        return wrapper;
      }),
    );
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
            `${m.start || '?'} → ${m.end || '?'} × ${m.factor} = ${formatNumber(m.energy, 8)} ${row.unit}`,
        )
        .join('\n');
      inputNodes[ri].forEach((pair, mi) => {
        const relevant = rowIssues.filter((i) => i.meterIndex === mi && i.code !== 'EMPTY_READING');
        for (const input of Object.values(pair)) {
          input.setAttribute('aria-invalid', String(relevant.length > 0));
          input.title = relevant.map((i) => i.message).join('\n');
        }
      });
    });
  }

  return {
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
