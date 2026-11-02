import { panelIcon, setPanelIcon, gasMark } from './panel-icons.js';
import {
  gasCalibration,
  MAX_REFILLS,
  gasPoint,
  gasPointUnit,
  gasInputVersion,
  createGasDraft,
  calculateGas,
  gasMassText,
  gasUsageText,
} from '../gas.js';
import { isWorkingHours, observationLabel, observationTime } from '../reading-period.js';
import { t } from '../i18n/index.js';
import { $, node } from './dom.js';

export function createGasPanel({ current, changed, rememberUndo, rebuildUtilities }) {
  const views = [];
  const labelKeys = { start: 'gasStart', end: 'gasEnd' };
  function rebuild() {
    views.length = 0;
    const plant = current().plantKey;
    $('gas-title').textContent = t('gasTitle', { plant });
    $('gas-source').textContent = t(plant === 'JRE' ? 'gasSource' : 'gasSourceUniland');
    $('gas-fields').replaceChildren();
    current().gas ??= createGasDraft(plant);
    gasCalibration(plant).gases.forEach((gas, index) => {
      const entry = current().gas.entries[index];
      const card = node('fieldset', undefined, 'gas-entry');
      card.dataset.gas = gas.id;
      const legend = node('legend');
      const r32Units = plant === 'JRE' && gas.id === 'R32';
      legend.append(
        gasMark(gas.id),
        node('span', gas.name + (r32Units ? '' : ' (' + gas.unit + ')')),
      );
      card.append(legend);
      const toggleLabel = node('label', undefined, 'check-label');
      const toggle = node('input');
      toggle.type = 'checkbox';
      toggle.checked = entry.enabled;
      toggle.setAttribute('aria-label', gas.name + ': ' + t('gasEnable'));
      toggle.dataset.gasEnable = gas.id;
      toggle.addEventListener('change', () => {
        rememberUndo();
        entry.enabled = toggle.checked;
        rebuild();
        changed();
      });
      toggleLabel.append(toggle, node('span', t('gasEnable')));
      card.append(toggleLabel);
      const utility = node('div', undefined, 'utility-entry');
      utility.id = 'gas-utility-' + gas.utilityIndex;
      if (!entry.enabled) {
        card.append(node('p', t('gasDisabled'), 'gas-help'));
        card.append(utility);
        $('gas-fields').append(card);
        return;
      }
      card.append(node('p', t(r32Units ? 'r32KgHint' : 'gasRangeHint', gas), 'gas-help'));
      if (r32Units) card.append(node('p', t('gasUnitClearHint'), 'gas-help'));
      if (
        gas.id === 'R32' &&
        (!r32Units ||
          [entry.start, entry.end, ...entry.refills.flatMap((e) => [e.before, e.after])].some(
            (p) => gasPointUnit(p) === 'mm',
          ))
      )
        card.append(node('p', t(r32Units ? 'r32LegacyHint' : 'gasTempHint', gas), 'gas-help'));
      const view = {
        gas,
        card,
        entry,
        outputIcon: node('span'),
        outputText: node('span'),
        feedback: node('div', undefined, 'gas-feedback'),
        statusIcon: node('span'),
        points: {},
        output: node('output'),
        status: node('p', undefined, 'gas-status'),
      };
      views.push(view);
      function observation(point, key, caption) {
        const group = node('div', undefined, 'gas-observation');
        const unit = r32Units ? gasPointUnit(point) : gas.unit;
        const label = node('label', caption + ' (' + unit + ')');
        let unitSelect;
        if (r32Units) {
          const unitLabel = node('label', t('gasReadingUnit'), 'gas-unit-control');
          unitSelect = node('select');
          unitSelect.dataset.gasUnit = key;
          unitSelect.setAttribute(
            'aria-label',
            gas.name + ': ' + caption + ', ' + t('gasReadingUnit'),
          );
          for (const [value, text] of [
            ['kg', 'r32UnitKg'],
            ['mm', 'r32UnitMm'],
          ]) {
            const option = node('option', t(text));
            option.value = value;
            unitSelect.append(option);
          }
          unitSelect.value = unit;
          unitSelect.disabled = Boolean(point.reading.trim());
          unitSelect.addEventListener('change', () => {
            if (point.reading.trim()) {
              unitSelect.value = gasPointUnit(point);
              return;
            }
            rememberUndo();
            current().gas.version = gasInputVersion(plant);
            point.unit = unitSelect.value;
            changed(
              false,
              [],
              ['start', 'end'].includes(key)
                ? [{ kind: 'gas', index, side: key, field: 'unit' }]
                : [],
            );
            rebuild();
          });
          unitLabel.append(unitSelect);
          group.append(unitLabel);
        }
        const input = node('input');
        input.type = 'text';
        input.inputMode = 'decimal';
        input.maxLength = 50;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.value = point.reading;
        input.dataset.gasPoint = key;
        input.setAttribute('aria-label', gas.name + ': ' + caption + ' (' + unit + ')');
        input.addEventListener('input', () => {
          point.reading = input.value;
          changed(
            false,
            [],
            ['start', 'end'].includes(key)
              ? [{ kind: 'gas', index, side: key, field: 'reading' }]
              : [],
          );
        });
        label.append(input);
        group.append(label);
        const inputs = [input];
        if (gas.id === 'R32' && unit === 'mm') {
          const tempLabel = node('label', t('gasTemperatureLabel'));
          const temp = node('input');
          temp.type = 'text';
          temp.inputMode = 'text';
          temp.maxLength = 50;
          temp.value = point.temperature;
          temp.dataset.gasTemperature = key;
          temp.setAttribute(
            'aria-label',
            gas.name + ': ' + caption + ', ' + t('gasTemperatureLabel'),
          );
          temp.addEventListener('input', () => {
            point.temperature = temp.value;
            changed(
              false,
              [],
              ['start', 'end'].includes(key)
                ? [{ kind: 'gas', index, side: key, field: 'temperature' }]
                : [],
            );
          });
          tempLabel.append(temp);
          group.append(tempLabel);
          inputs.push(temp);
        }
        const mass = node('output');
        mass.hidden = r32Units && unit === 'kg';
        const error = node('span', undefined, 'gas-error');
        error.id = 'gas-error-' + gas.id + '-' + key;
        inputs.forEach((input) => input.setAttribute('aria-describedby', error.id));
        group.append(mass, error);
        view.points[key] = { inputs, mass, error, raw: point, unit, unitSelect };
        return group;
      }
      const endpoints = node('div', undefined, 'gas-pair');
      for (const side of ['start', 'end'])
        endpoints.append(
          observation(
            entry[side],
            side,
            t(
              isWorkingHours(current())
                ? side === 'start'
                  ? 'gasShiftStart'
                  : 'gasShiftEnd'
                : labelKeys[side],
            ) +
              ' · ' +
              observationLabel(current(), side),
          ),
        );
      card.append(endpoints);
      entry.refills.forEach((event, i) => {
        const block = node('fieldset', undefined, 'gas-refill');
        block.append(node('legend', t('gasRefill', { number: i + 1 })));
        const pair = node('div', undefined, 'gas-pair');
        pair.append(
          observation(event.before, 'before' + i, t('gasBefore')),
          observation(event.after, 'after' + i, t('gasAfter')),
        );
        const remove = node('button', t('gasRemove', { number: i + 1 }), 'text-button');
        remove.type = 'button';
        remove.dataset.removeRefill = i;
        remove.addEventListener('click', () => {
          rememberUndo();
          entry.refills.splice(i, 1);
          rebuild();
          changed();
        });
        block.append(pair, remove);
        card.append(block);
      });
      const add = node('button', t('gasAdd'), 'button secondary');
      add.type = 'button';
      add.dataset.addRefill = gas.id;
      add.disabled = entry.refills.length >= MAX_REFILLS;
      add.addEventListener('click', () => {
        if (entry.refills.length >= MAX_REFILLS) return;
        rememberUndo();
        entry.refills.push({ before: gasPoint(gas.id, plant), after: gasPoint(gas.id, plant) });
        if (r32Units) current().gas.version = gasInputVersion(plant);
        rebuild();
        changed();
        document
          .querySelector(
            '[data-gas="' +
              gas.id +
              '"] [data-gas-point="before' +
              (entry.refills.length - 1) +
              '"]',
          )
          .focus();
      });
      view.output.className = 'gas-total';
      view.status.setAttribute('role', 'status');
      const calculation = node('details', undefined, 'panel-help gas-calculation');
      const summary = node('summary');
      summary.append(panelIcon('calculator'), node('span', t('gasHow')));
      calculation.append(summary, node('p', t('gasFormula'), 'gas-help'));
      view.output.append(view.outputIcon, view.outputText);
      view.statusIcon.append(panelIcon('triangle-alert'));
      view.feedback.append(view.statusIcon, view.status);
      card.append(add, calculation, view.output, view.feedback);
      card.append(utility);
      $('gas-fields').append(card);
    });
    rebuildUtilities();
    update();
  }
  function update() {
    $('gas-period').textContent =
      (current().startDate || '?') +
      ' ' +
      (observationTime(current(), 'start') || '?') +
      ' → ' +
      (current().endDate || '?') +
      ' ' +
      (observationTime(current(), 'end') || '?') +
      ' WIB';
    for (const view of views) {
      const result = calculateGas(view.gas.id, view.entry, current().plantKey);
      for (const [key, elements] of Object.entries(view.points)) {
        if (elements.unitSelect) {
          if (elements.unit !== gasPointUnit(elements.raw)) {
            rebuild();
            return;
          }
          elements.unitSelect.disabled = Boolean(elements.raw.reading.trim());
        }
        for (const [i, field] of ['reading', 'temperature'].entries()) {
          const input = elements.inputs[i];
          if (input && document.activeElement !== input && input.value !== elements.raw[field])
            input.value = elements.raw[field];
        }
        const point = result.points[key];
        elements.mass.textContent = gasMassText(point.kg) + ' kg';
        elements.error.textContent = point.error ? t(point.error) : '';
        elements.inputs.forEach((input) =>
          input.setAttribute('aria-invalid', String(Boolean(point.error))),
        );
      }
      const value = gasUsageText(result.kg, result.kgText);
      view.outputText.textContent =
        t(value.startsWith('+') ? 'gasIncreaseTotal' : 'gasTotal') + ': ' + value + ' kg';
      const tone = result.errors.length
        ? 'error'
        : result.unavailable
          ? 'unavailable'
          : result.warnings.length
            ? 'attention'
            : 'normal';
      view.card.dataset.state = tone;
      view.output.dataset.tone = tone;
      setPanelIcon(
        view.outputIcon,
        tone === 'attention' ? 'arrow-up-right' : tone === 'error' ? 'triangle-alert' : 'gauge',
      );
      view.status.dataset.notice = String(
        !result.errors.length && !result.unavailable && result.warnings.length > 0,
      );
      view.status.textContent = result.errors.some((e) => e.code === 'gasSequence')
        ? t(result.directStock ? 'gasSequenceDirect' : 'gasSequence')
        : result.errors.length
          ? t('gasPending')
          : result.unavailable
            ? t('gasUnavailable')
            : result.warnings.length
              ? t(result.directStock ? 'gasStockIncreaseDirect' : 'gasStockIncrease')
              : '';
      view.feedback.dataset.tone = view.status.textContent ? tone : 'none';
      view.statusIcon.hidden = !view.status.textContent;
    }
  }
  function focusIssue(target) {
    const point = views.find((view) => view.gas.id === target.gas)?.points[target.point];
    const input = point?.inputs[target.field === 'temperature' ? 1 : 0];
    input?.scrollIntoView({ block: 'center' });
    input?.focus();
  }
  return { rebuild, update, focusIssue };
}
