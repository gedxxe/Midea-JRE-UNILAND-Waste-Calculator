import { exportRawReading } from '../raw-export.js';
import { PLANT_SCHEMAS } from '../schema.js';
import { t } from '../i18n/index.js';
import { $ } from './dom.js';

export function createRawExport({ current, toast }) {
  let generation = 0;
  function render() {
    if (!$('raw-export-dialog').open) return;
    const draft = current();
    const result = exportRawReading(draft, $('raw-export-side').value);
    $('raw-export-preview').value = result.text;
    $('copy-raw-export').disabled = !result.text;
    $('raw-export-plant').textContent = draft.plantKey;
    $('raw-export-example').hidden = !draft.isExample;
    const issue = result.issues[0];
    $('raw-export-status').textContent = !issue
      ? ''
      : issue.code === 'DATE'
        ? t('rawDateRequired')
        : issue.code === 'SHAPE'
          ? t('rawLayoutInvalid')
          : t(issue.code === 'EMPTY' ? 'rawEmpty' : 'rawInvalid', {
              equipment: PLANT_SCHEMAS[draft.plantKey].rows[issue.rowIndex].name,
              meter: issue.meterIndex + 1,
            });
  }
  function reset() {
    generation++;
    $('raw-export-dialog').close();
    $('raw-export-preview').value = '';
    $('raw-export-status').textContent = '';
    $('copy-raw-export').disabled = true;
  }
  $('open-raw-export').addEventListener('click', () => {
    $('raw-export-side').value = 'end';
    $('raw-export-dialog').showModal();
    render();
  });
  $('raw-export-side').addEventListener('change', render);
  $('raw-export-dialog').addEventListener('close', () => {
    generation++;
    $('raw-export-preview').value = '';
    $('raw-export-status').textContent = '';
    $('copy-raw-export').disabled = true;
  });
  $('copy-raw-export').addEventListener('click', async () => {
    render();
    const text = $('raw-export-preview').value;
    if (!text) return;
    const epoch = generation;
    try {
      await navigator.clipboard.writeText(text);
      if (epoch === generation) toast(t('copied'));
    } catch {
      if (epoch !== generation) return;
      $('raw-export-preview').focus();
      $('raw-export-preview').select();
      toast(t('clipboard'));
    }
  });
  return { render, reset };
}
