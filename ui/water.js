import { calculateWater } from '../water.js';
import { t } from '../i18n/index.js';
import { $ } from './dom.js';

export function createWaterPanel({ current, changed, rememberUndo }) {
  function startReadings() {
    rememberUndo();
    current().water = { start: '', end: '' };
    current().utilities[4].value = '';
  }
  for (const side of ['start', 'end'])
    $('water-' + side).addEventListener('input', () => {
      if (!current().water) startReadings();
      current().water[side] = $('water-' + side).value;
      changed();
    });
  $('water-note').addEventListener('input', () => {
    current().utilities[4].note = $('water-note').value;
    changed();
  });
  $('water-use-readings').addEventListener('click', () => {
    startReadings();
    rebuild();
    changed();
    $('water-start').focus();
  });
  function update() {
    if (current().plantKey !== 'JRE') return;
    const draft = current();
    const legacy = !draft.water && Boolean(draft.utilities[4].value.trim());
    $('water-legacy').hidden = !legacy;
    $('water-readings').hidden = legacy;
    $('water-legacy-text').textContent = legacy
      ? t('waterLegacy', { value: draft.utilities[4].value })
      : '';
    for (const side of ['start', 'end'])
      $('water-' + side + '-date').textContent = draft[side + 'Date'] || '-';
    const result = calculateWater(draft.water);
    $('water-total').textContent =
      `${t('consumption')}: ${legacy ? draft.utilities[4].value : result.value || '-'} m³`;
    $('water-status').textContent = result.error
      ? t(result.error)
      : result.value === '-'
        ? t('waterUnavailable')
        : '';
    for (const side of ['start', 'end'])
      $('water-' + side).setAttribute('aria-invalid', String(Boolean(result.error)));
  }
  function rebuild() {
    $('water-section').hidden = current().plantKey !== 'JRE';
    if (current().plantKey !== 'JRE') {
      for (const id of ['water-start', 'water-end', 'water-note']) $(id).value = '';
      for (const id of [
        'water-start-date',
        'water-end-date',
        'water-total',
        'water-status',
        'water-legacy-text',
      ])
        $(id).textContent = '';
      return;
    }
    for (const side of ['start', 'end']) $('water-' + side).value = current().water?.[side] || '';
    $('water-note').value = current().utilities[4].note;
    update();
  }
  return { rebuild, update };
}
