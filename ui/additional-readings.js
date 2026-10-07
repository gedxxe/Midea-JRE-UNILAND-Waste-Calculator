import {
  ADDITIONAL_METERS,
  emptyAdditionalReadings,
  calculateAdditionalReadings,
} from '../additional-readings.js';
import { $, node } from './dom.js';
import { t } from '../i18n/index.js';

export function createAdditionalReadingsPanel({ current, changed }) {
  function update() {
    if (current().plantKey !== 'JRE') return;
    for (const side of ['start', 'end'])
      $('additional-' + side + '-date').textContent = current()[side + 'Date'] || '-';
    calculateAdditionalReadings(current().additionalReadings).forEach((result, i) => {
      $('additional-value-' + i).textContent = result.value ? result.value + ' kWh' : '-';
      $('additional-status-' + i).textContent = result.error ? t(result.error) : '';
      for (const side of ['start', 'end']) {
        $(`additional-${i}-${side}`).setAttribute('aria-invalid', String(Boolean(result.error)));
        $(`additional-${i}-${side}`).parentElement.dataset.label =
          `${t(side === 'start' ? 'startReading' : 'endReading')} (kWh)\n${current()[side + 'Date'] || '-'}`;
      }
    });
  }
  function rebuild() {
    $('additional-section').hidden = current().plantKey !== 'JRE';
    $('additional-body').replaceChildren();
    if (current().plantKey !== 'JRE') return;
    ADDITIONAL_METERS.forEach((name, i) => {
      const row = node('tr');
      const heading = node('th', name);
      heading.scope = 'row';
      row.append(heading);
      for (const side of ['start', 'end']) {
        const cell = node('td'),
          input = node('input');
        input.id = `additional-${i}-${side}`;
        input.inputMode = 'decimal';
        input.maxLength = 50;
        input.autocomplete = 'off';
        input.value = current().additionalReadings?.[i]?.[side] || '';
        input.setAttribute(
          'aria-label',
          `${name} ${t(side === 'start' ? 'startReading' : 'endReading')} (kWh)`,
        );
        input.setAttribute('aria-describedby', 'additional-status-' + i);
        input.addEventListener('input', () => {
          current().additionalReadings ??= emptyAdditionalReadings();
          current().additionalReadings[i][side] = input.value;
          changed();
        });
        cell.append(input);
        row.append(cell);
      }
      const usage = node('td'),
        value = node('output'),
        status = node('p');
      usage.dataset.label = t('consumption');
      value.id = 'additional-value-' + i;
      status.id = 'additional-status-' + i;
      status.className = 'small';
      usage.append(value, status);
      row.append(usage);
      $('additional-body').append(row);
    });
    update();
  }
  return { rebuild, update };
}
