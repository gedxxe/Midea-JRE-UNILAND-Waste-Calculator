import { isWorkingHours, observationLabel, observationTime, validTime } from '../reading-period.js';
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
  const keepPeriod = () => !isWorkingHours(current()) && $('import-keep-period').checked;
  const destination = (parsed, side) => prepare?.(parsed, side, keepPeriod()) || current();
  function preview() {
    $('import-period-option').hidden = isWorkingHours(current());
    $('import-target').textContent = '';
    try {
      const side = $('import-side').value;
      const parsed = parseRawReading($('import-text').value, current(), side, destination);
      if (!parsed.date) return;
      if (!parsed.time && isWorkingHours(current())) parsed.time = current()[side + 'Time'];
      const target = destination(parsed, side);
      for (const option of $('import-side').options)
        option.textContent = `${t(option.value === 'start' ? 'startReading' : 'endReading')} (${observationLabel(target, option.value)})`;
      $('import-target').textContent = readingText('target', {
        start: target.startDate + ' ' + observationTime(target, 'start'),
        end: target.endDate + ' ' + observationTime(target, 'end'),
      });
    } catch {
      /* Validation feedback is shown by Apply. */
    }
  }
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
    preview();
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
    preview();
  }
  function reset() {
    generation++;
    texts = {};
    lastParsed = null;
    $('import-keep-period').checked = false;
    $('import-target').textContent = '';
    $('import-text').value = '';
    $('import-feedback').textContent = '';
  }
  $('open-import').addEventListener('click', () => {
    reset();
    render();
    $('import-dialog').showModal();
  });
  $('import-side').addEventListener('change', render);
  $('import-keep-period').addEventListener('change', preview);
  $('import-text').addEventListener('input', () => {
    texts[$('import-side').value] = $('import-text').value;
    lastParsed = null;
    $('import-feedback').textContent = '';
    preview();
  });
  $('import-dialog').addEventListener('close', reset);
  $('apply-import').addEventListener('click', async () => {
    const ticket = generation;
    const text = $('import-text').value;
    const keep = keepPeriod();
    let parsed = parseRawReading(text, current(), $('import-side').value, destination);
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
      parsed =
        (await apply(
          parsed,
          side,
          text,
          () => ticket === generation && $('import-dialog').open,
          keep,
        )) || parsed;
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
