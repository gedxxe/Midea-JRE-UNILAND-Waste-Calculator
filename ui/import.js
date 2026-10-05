import { formatReadingColumn } from '../raw-export.js';
import { parseReading } from '../importer.js';
import { t } from '../i18n/index.js';
import { $ } from './dom.js';

export function createImportEditor({ current, apply, toast }) {
  let texts = {};
  function render() {
    const draft = current();
    for (const option of $('import-side').options) {
      const side = option.value;
      option.textContent = `${t(side === 'start' ? 'startReading' : 'endReading')} (${draft[side + 'Date'] || '-'})`;
    }
    const side = $('import-side').value;
    $('import-text').value = texts[side] ?? formatReadingColumn(draft, side).text;
    $('import-text').scrollTop = 0;
    $('import-feedback').textContent = '';
  }
  function reset() {
    texts = {};
    $('import-text').value = '';
    $('import-feedback').textContent = '';
  }
  $('open-import').addEventListener('click', () => {
    reset();
    render();
    $('import-dialog').showModal();
  });
  $('import-side').addEventListener('change', render);
  $('import-text').addEventListener('input', () => {
    texts[$('import-side').value] = $('import-text').value;
    $('import-feedback').textContent = '';
  });
  $('import-dialog').addEventListener('close', reset);
  $('apply-import').addEventListener('click', () => {
    const parsed = parseReading($('import-text').value, current().plantKey);
    $('import-feedback').textContent = parsed.issues.map((issue) => issue.message).join('\n');
    if (!parsed.success) return;
    apply(parsed, $('import-side').value);
    $('import-dialog').close();
    toast(parsed.issues.length ? t('importedWarnings') : t('imported'));
  });
  return { reset };
}
