import { isWorkingHours, observationLabel, validTime } from '../reading-period.js';
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
      option.textContent = `${t(side === 'start' ? 'startReading' : 'endReading')} (${observationLabel(draft, side)})`;
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
    const side = $('import-side').value;
    if (isWorkingHours(current()) && !parsed.time) parsed.time = current()[side + 'Time'];
    if (
      (!isWorkingHours(current()) && parsed.time && parsed.time !== '08:00') ||
      (isWorkingHours(current()) && !validTime(parsed.time))
    ) {
      $('import-feedback').textContent = t('workImportTime');
      return;
    }
    apply(parsed, side);
    $('import-dialog').close();
    toast(
      parsed.omittedRows?.length
        ? t('importedOmitted')
        : parsed.issues.length
          ? t('importedWarnings')
          : t('imported'),
    );
  });
  return { reset };
}
