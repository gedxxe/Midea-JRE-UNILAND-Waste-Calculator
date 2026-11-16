import { isWorkingHours, observationLabel, validTime } from '../reading-period.js';
import { formatReadingColumn } from '../raw-export.js';
import { parseRawReading } from '../raw-meter-export.js';
import { PLANT_SCHEMAS } from '../schema.js';
import { importFeedback, readingText } from '../i18n/reading-feedback.js';
import { t } from '../i18n/index.js';
import { $ } from './dom.js';

export function createImportEditor({ current, prepare, apply, toast }) {
  let texts = {},
    lastParsed = null,
    generation = 0;
  function refreshLabels() {
    const draft = current();
    const schema = PLANT_SCHEMAS[draft.plantKey];
    $('import-format').textContent = readingText('format', {
      plant: schema.name,
      rows: schema.rows.length,
      meters: schema.rows.reduce((n, row) => n + row.factors.length, 0),
    });
    for (const option of $('import-side').options) {
      const side = option.value;
      option.textContent = `${t(side === 'start' ? 'startReading' : 'endReading')} (${observationLabel(draft, side)})`;
    }
    if (lastParsed) $('import-feedback').textContent = importFeedback(lastParsed, draft.plantKey);
  }
  function render() {
    refreshLabels();
    const draft = current();
    const side = $('import-side').value;
    lastParsed = null;
    $('import-text').value =
      texts[side] ??
      formatReadingColumn(draft, side).text +
        (draft.plantKey === 'JRE'
          ? '\n\nAir Compressor Flow: ' + (draft.airCompressor?.[side] || '____') + ' Nm³'
          : '');
    $('import-text').scrollTop = 0;
    $('import-feedback').textContent = '';
  }
  function reset() {
    generation++;
    texts = {};
    lastParsed = null;
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
    lastParsed = null;
    $('import-feedback').textContent = '';
  });
  $('import-dialog').addEventListener('close', reset);
  $('apply-import').addEventListener('click', async () => {
    const ticket = generation;
    const text = $('import-text').value;
    let parsed = parseRawReading(text, current(), $('import-side').value, prepare);
    lastParsed = parsed;
    $('import-feedback').textContent = importFeedback(parsed, current().plantKey);
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
    $('import-dialog').inert = true;
    try {
      parsed = (await apply(parsed, side, text, () => ticket === generation)) || parsed;
      if (ticket !== generation) return;
      if (!parsed.success) {
        lastParsed = parsed;
        $('import-feedback').textContent = importFeedback(parsed, current().plantKey);
        return;
      }
    } catch (error) {
      if (ticket !== generation) return;
      $('import-feedback').textContent =
        error.message === 'shiftConflict' ? t('shiftConflict') : readingText('loadFailed');
      return;
    } finally {
      $('import-dialog').inert = false;
    }
    $('import-dialog').close();
    toast(
      readingText('imported', { count: parsed.valueCount }) +
        (parsed.emptyCount ? ' ' + readingText('kept') : '') +
        (parsed.issues.some((i) => i.level === 'WARNING') ? ' ' + t('importedWarnings') : '') +
        (parsed.issues.some((i) => i.level === 'NOTICE')
          ? ' ' +
            importFeedback(
              { issues: parsed.issues.filter((i) => i.level === 'NOTICE') },
              current().plantKey,
            )
          : ''),
    );
  });
  return { reset, refreshLabels };
}
