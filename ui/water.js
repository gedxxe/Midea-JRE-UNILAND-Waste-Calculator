import { observationLabel } from '../reading-period.js';
import { scaledReading } from '../numbers.js';
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
      changed(false, [], [{ kind: 'water', side }]);
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
    const draft = current();
    const legacy = !draft.water && Boolean(draft.utilities[4].value.trim());
    $('water-legacy').hidden = !legacy;
    $('water-readings').hidden = legacy;
    $('water-legacy-text').textContent = legacy
      ? t('waterLegacy', { value: draft.utilities[4].value })
      : '';
    for (const side of ['start', 'end']) {
      $('water-' + side + '-date').textContent = observationLabel(draft, side);
      if (document.activeElement !== $('water-' + side))
        $('water-' + side).value = draft.water?.[side] || '';
    }
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
    for (const side of ['start', 'end']) $('water-' + side).value = current().water?.[side] || '';
    $('water-note').value = current().utilities[4].note;
    update();
  }
  function focusIssue() {
    let input;
    if (!current().water && current().utilities[4].value.trim()) input = $('water-use-readings');
    else {
      const side =
        ['start', 'end'].find((key) => {
          const value = current().water?.[key]?.trim() || '';
          return !value || value === '-' || scaledReading(value) === null;
        }) || 'end';
      input = $('water-' + side);
    }
    input.scrollIntoView({ block: 'center' });
    input.focus();
  }
  return { rebuild, update, focusIssue };
}
