import { GASES, MAX_REFILLS, gasPoint, createGasDraft, calculateGas, gasMassText } from '../gas.js';
import { t } from '../i18n/index.js';
import { $, node } from './dom.js';

export function createGasPanel({ current, changed, rememberUndo, rebuildUtilities }) {
  const views = [];
  const labelKeys = { start: 'gasStart', end: 'gasEnd' };
  function rebuild() {
    views.length = 0;
    $('gas-section').hidden = current().plantKey !== 'JRE';
    $('gas-fields').replaceChildren();
    if (current().plantKey !== 'JRE') return;
    current().gas ??= createGasDraft();
    GASES.forEach((gas, index) => {
      const entry = current().gas.entries[index];
      const card = node('fieldset', undefined, 'gas-entry');
      card.dataset.gas = gas.id;
      card.append(node('legend', gas.name + ' (' + gas.unit + ')'));
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
        rebuildUtilities();
        changed();
      });
      toggleLabel.append(toggle, node('span', t('gasEnable')));
      card.append(toggleLabel);
      if (!entry.enabled) {
        card.append(node('p', t('gasDisabled'), 'gas-help'));
        $('gas-fields').append(card);
        return;
      }
      card.append(node('p', t('gasRangeHint', gas), 'gas-help'));
      if (gas.id === 'R32') card.append(node('p', t('gasTempHint'), 'gas-help'));
      const view = {
        gas,
        entry,
        points: {},
        output: node('output'),
        status: node('p', undefined, 'gas-status'),
      };
      views.push(view);
      function observation(point, key, caption) {
        const group = node('div', undefined, 'gas-observation');
        const label = node('label', caption + ' (' + gas.unit + ')');
        const input = node('input');
        input.type = 'text';
        input.inputMode = 'decimal';
        input.maxLength = 50;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.value = point.reading;
        input.dataset.gasPoint = key;
        input.setAttribute('aria-label', gas.name + ': ' + caption + ' (' + gas.unit + ')');
        input.addEventListener('input', () => {
          point.reading = input.value;
          changed();
        });
        label.append(input);
        group.append(label);
        const inputs = [input];
        if (gas.id === 'R32') {
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
            changed();
          });
          tempLabel.append(temp);
          group.append(tempLabel);
          inputs.push(temp);
        }
        const mass = node('output');
        const error = node('span', undefined, 'gas-error');
        error.id = 'gas-error-' + gas.id + '-' + key;
        inputs.forEach((input) => input.setAttribute('aria-describedby', error.id));
        group.append(mass, error);
        view.points[key] = { inputs, mass, error };
        return group;
      }
      const endpoints = node('div', undefined, 'gas-pair');
      for (const side of ['start', 'end'])
        endpoints.append(observation(entry[side], side, t(labelKeys[side])));
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
        entry.refills.push({ before: gasPoint(), after: gasPoint() });
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
      card.append(add, node('p', t('gasFormula'), 'gas-help'), view.output, view.status);
      $('gas-fields').append(card);
    });
    update();
  }
  function update() {
    if (current().plantKey !== 'JRE') return;
    $('gas-period').textContent =
      (current().startDate || '?') + ' 08:00 → ' + (current().endDate || '?') + ' 08:00 WIB';
    for (const view of views) {
      const result = calculateGas(view.gas.id, view.entry);
      for (const [key, elements] of Object.entries(view.points)) {
        const point = result.points[key];
        elements.mass.textContent = gasMassText(point.kg) + ' kg';
        elements.error.textContent = point.error ? t(point.error) : '';
        elements.inputs.forEach((input) =>
          input.setAttribute('aria-invalid', String(Boolean(point.error))),
        );
      }
      view.output.textContent = t('gasTotal') + ': ' + gasMassText(result.kg) + ' kg';
      view.status.textContent = result.errors.some((e) => e.code === 'gasSequence')
        ? t('gasSequence')
        : result.errors.length
          ? t('gasPending')
          : result.unavailable
            ? t('gasUnavailable')
            : '';
    }
  }
  return { rebuild, update };
}
