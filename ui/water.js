import { observationLabel } from '../reading-period.js';
import { scaledReading } from '../numbers.js';
import { calculateWater } from '../water.js';
import { t } from '../i18n/index.js';
import { $ } from './dom.js';

export function createWaterPanel({
  current,
  changed,
  rememberUndo,
  field = 'water',
  prefix = 'water',
  unit = 'm³',
  utilityIndex = 4,
  calculate = (draft) => calculateWater(draft[field]),
}) {
  const element = (name) => $(prefix + '-' + name);
  function startReadings() {
    rememberUndo();
    current()[field] = { start: '', end: '' };
    current().utilities[utilityIndex].value = '';
  }
  for (const side of ['start', 'end'])
    element(side).addEventListener('input', () => {
      if (!current()[field]) startReadings();
      current()[field][side] = element(side).value;
      changed(false, [], [{ kind: field, side }]);
    });
  element('note').addEventListener('input', () => {
    current().utilities[utilityIndex].note = element('note').value;
    changed();
  });
  element('use-readings').addEventListener('click', () => {
    startReadings();
    rebuild();
    changed();
    element('start').focus();
  });
  function update() {
    const draft = current();
    if (field === 'airCompressor') {
      element('section').hidden = draft.plantKey !== 'JRE';
      if (draft.plantKey !== 'JRE') return;
    }
    const legacy = !draft[field] && Boolean(draft.utilities[utilityIndex].value.trim());
    element('legacy').hidden = !legacy;
    element('readings').hidden = legacy;
    element('legacy-text').textContent = legacy
      ? t('waterLegacy', { value: draft.utilities[utilityIndex].value })
      : '';
    for (const side of ['start', 'end']) {
      element(side + '-date').textContent = observationLabel(draft, side);
      if (document.activeElement !== element(side))
        element(side).value = draft[field]?.[side] || '';
    }
    const result = calculate(draft);
    element('total').textContent =
      `${t('consumption')}: ${legacy ? draft.utilities[utilityIndex].value : result.value || '-'} ${unit}`;
    element('status').textContent =
      result.applicable === false
        ? t('airFlowStarts')
        : result.error
          ? t(field === 'airCompressor' ? result.error.replace('water', 'airFlow') : result.error)
          : result.value === '-'
            ? t(field === 'airCompressor' ? 'airFlowUnavailable' : 'waterUnavailable')
            : '';
    for (const side of ['start', 'end'])
      element(side).setAttribute('aria-invalid', String(Boolean(result.error)));
  }
  function rebuild() {
    if (field === 'airCompressor' && current().plantKey !== 'JRE') {
      update();
      return;
    }
    for (const side of ['start', 'end']) element(side).value = current()[field]?.[side] || '';
    element('note').value = current().utilities[utilityIndex].note;
    update();
  }
  function focusIssue() {
    let input;
    if (!current()[field] && current().utilities[utilityIndex].value.trim())
      input = element('use-readings');
    else {
      const side =
        ['start', 'end'].find((key) => {
          const value = current()[field]?.[key]?.trim() || '';
          return !value || value === '-' || scaledReading(value) === null;
        }) || 'end';
      input = element(side);
    }
    input.scrollIntoView({ block: 'center' });
    input.focus();
  }
  return { rebuild, update, focusIssue };
}
