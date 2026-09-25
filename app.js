import { createGasPanel } from './ui/gas.js';
import { createRawExport } from './ui/raw-export.js';
import { createAccounts } from './ui/accounts.js';
import { $, node } from './ui/dom.js';
import { createMeterTable } from './ui/table.js';
import { t, setLanguage, getLanguage, translatePage, LANGUAGE_KEY } from './i18n/index.js';
import { showBuildInfo } from './ui/build-info.js';
import { PLANT_SCHEMAS } from './schema.js';
import {
  createDraft,
  calculateDraft,
  formatRowValue,
  generateFullIndonesiaReport,
} from './engine.js';
import { formatNumber, formatReportDate, shiftDate } from './numbers.js';
import { worksheetRowToTSV } from './worksheet.js';
import { parseReading } from './importer.js';
import { STORAGE_KEY, restoreDrafts, nextDayDraft } from './storage.js';
import { NetworkClock, wibDate } from './clock.js';
import { exampleDraft } from './examples.js';

const table = createMeterTable({
  getPlant: () => plant,
  current: () => drafts[plant],
  getReport: () => reports[plant],
  changed,
  rememberUndo,
  toast,
});
const filterTable = () => table.filter();
const clock = new NetworkClock();
let plant = 'JRE';
let drafts = { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') };
let reports = {};
let undo = null;
let dirty = false;
let saveStatus = 'unsaved';
let showValidation = false;
let toastTimer;
let lastSyncAttempt = -Infinity;
let clockDefaultsApplied = false;
const current = () => drafts[plant];
const rawExport = createRawExport({ current, toast });
const gasPanel = createGasPanel({
  current,
  changed,
  rememberUndo,
  rebuildUtilities: () => table.buildUtilities(),
});
let accountUser = null;
let firstIdentity = true;
const draftKey = () => (accountUser ? STORAGE_KEY + '_' + accountUser.id : STORAGE_KEY);
const draftStorage = () => (accountUser ? sessionStorage : localStorage);
function accountChanged(user) {
  rawExport.reset();
  try {
    if (accountUser) sessionStorage.removeItem(draftKey());
  } catch {
    /* No persisted tab draft. */
  }
  accountUser = user;
  drafts = { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') };
  undo = null;
  dirty = false;
  showValidation = false;
  saveStatus = 'unsaved';
  $('undo-change').hidden = true;
  $('import-text').value = '';
  $('import-feedback').textContent = '';
  $('import-dialog').close();
  $('toast').hidden = true;
  if (user || firstIdentity) {
    try {
      const raw = draftStorage().getItem(draftKey());
      if (raw) {
        drafts = restoreDrafts(raw);
        saveStatus = 'restored';
      }
    } catch {
      toast(t('restoreError'));
    }
  }
  firstIdentity = false;
  $('save-status').textContent = t(saveStatus);
  mountPlant();
}
const accounts = createAccounts({
  current,
  identityChanged: accountChanged,
  toast,
  loadDraft(draft) {
    plant = draft.plantKey;
    rememberUndo();
    drafts[plant] = draft;
    mountPlant();
    changed();
  },
});
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, 5500);
}
function rememberUndo() {
  undo = { plant, draft: structuredClone(current()) };
  $('undo-change').hidden = false;
}
function changed() {
  dirty = true;
  saveStatus = 'changed';
  $('save-status').textContent = t(saveStatus);
  renderResults();
}
function mountPlant() {
  $('start-date').value = current().startDate;
  $('end-date').value = current().endDate;
  $('table-plant').textContent = plant;
  document.querySelectorAll('[data-plant]').forEach((button) => {
    const selected = button.dataset.plant === plant;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  gasPanel.rebuild();
  table.rebuild();
  renderResults();
}
function renderResults() {
  reports = { JRE: calculateDraft(drafts.JRE), UNILAND: calculateDraft(drafts.UNILAND) };
  const report = reports[plant];
  for (const key of ['JRE', 'UNILAND'])
    $('count-' + key.toLowerCase()).textContent =
      `${reports[key].completeRows}/${PLANT_SCHEMAS[key].rows.length}`;
  $('report-date-label').textContent = current().startDate
    ? formatReportDate(current().startDate)
    : t('selectPeriod');
  const dateIssue = report.issues.find((i) => i.code.startsWith('DATE_'));
  $('period-note').textContent = dateIssue
    ? dateIssue.message
    : t('periodNote', { start: current().startDate, end: current().endDate });
  $('period-note').classList.toggle('warning', !!dateIssue && !!current().startDate);
  $('example-note').hidden = !current().isExample;
  $('completion-progress').max = report.calculatedRows.length;
  $('completion-progress').value = report.completeRows;
  $('progress-label').textContent = t('progress', {
    done: report.completeRows,
    total: report.calculatedRows.length,
  });
  $('main-total').textContent = formatRowValue(plant, report.calculatedRows[0]);
  $('main-unit').textContent = report.totalDirectUnit;
  $('result-state').textContent = report.success
    ? report.issues.length
      ? t('needsCheck')
      : t('ready')
    : t('incomplete');
  $('result-state').classList.toggle('ready', report.success && !report.issues.length);
  if (plant === 'JRE') {
    $('derived-one-label').textContent = 'Sub-meter 2-29';
    $('derived-two-label').textContent = t('gapLabel');
    $('derived-one').textContent =
      report.subAreasSumKWh === null ? '-' : `${report.subAreasSumKWh.toFixed(2)} kWh`;
    $('derived-two').textContent = report.gapKWh === null ? '-' : `${report.gapKWh.toFixed(2)} kWh`;
    $('metric-note').textContent =
      report.gapKWh === null
        ? t('gapPending')
        : t('gap', {
            value:
              report.gapPercent === null ? t('undefinedGap') : report.gapPercent.toFixed(2) + '%',
          });
  } else {
    $('derived-one-label').textContent = 'Indoor Area';
    $('derived-two-label').textContent = 'Outdoor Area';
    $('derived-one').textContent =
      report.worksheet.derived.indoorArea === null
        ? '-'
        : `${formatNumber(report.worksheet.derived.indoorArea)} kWh`;
    $('derived-two').textContent =
      report.worksheet.derived.outdoorArea === null
        ? '-'
        : `${formatNumber(report.worksheet.derived.outdoorArea)} kWh`;
    $('metric-note').textContent = t('areaHint');
  }
  table.update(report);
  const incomplete = report.issues.filter((i) => i.code === 'EMPTY_READING').length;
  const otherIssues = report.issues.filter((i) => i.code !== 'EMPTY_READING');
  $('issue-count').textContent = incomplete
    ? t('emptyCount', { count: incomplete })
    : t('noteCount', { count: otherIssues.length });
  $('validation-panel').hidden = !showValidation;
  if (showValidation) {
    $('validation-summary').textContent = report.issues.length
      ? t('validation', { count: report.issues.length })
      : t('valid');
    $('validation-list').replaceChildren(
      ...report.issues.map((i) => {
        const li = node('li');
        if (i.rowIndex !== null && i.rowIndex !== undefined) {
          const button = node('button', i.message);
          button.addEventListener('click', () => {
            $('search-meter').value = '';
            $('only-incomplete').checked = false;
            filterTable();
            table.focusIssue(i);
          });
          li.append(button);
        } else li.textContent = i.message;
        return li;
      }),
    );
  }
  let combined = '';
  let combinedError = '';
  try {
    combined = generateFullIndonesiaReport(reports.JRE, reports.UNILAND);
  } catch (error) {
    combinedError = error.message;
  }
  const view = $('report-view').value;
  const hasData = current().rows.some((row) => [...row.start, ...row.end].some((v) => v.trim()));
  $('report-preview').value =
    view === 'combined'
      ? combined || combinedError
      : view === 'worksheet'
        ? hasData
          ? [report.worksheetText, report.checks].filter(Boolean).join('\n\n')
          : ''
        : hasData
          ? report.reportSectionText
          : '';
  $('copy-report').disabled = view === 'combined' ? !combined : !report.success;
  $('copy-report').textContent = view === 'worksheet' ? t('copyWorksheet') : t('copyReport');
  $('copy-combined').disabled = !combined;
  $('copy-combined').title = combinedError;
  $('copy-worksheet').disabled = !report.success;
  $('copy-note').textContent = !report.success
    ? t('copyIncomplete')
    : report.issues.length
      ? t('copyWarnings')
      : t('copyPeriod');
  filterTable();
  rawExport.render();
  gasPanel.update();
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('copied'));
  } catch {
    $('report-preview').value = text;
    $('report-preview').focus();
    $('report-preview').select();
    toast(t('clipboard'));
  }
}
async function syncTime() {
  if (clock.pending) return;
  lastSyncAttempt = performance.now();
  $('clock-status').textContent = t('syncing');
  $('sync-clock').disabled = true;
  const ok = await clock.sync();
  $('sync-clock').disabled = false;
  if (ok && !clockDefaultsApplied) {
    clockDefaultsApplied = true;
    const end = wibDate(clock.now());
    for (const key of ['JRE', 'UNILAND']) {
      const draft = drafts[key];
      if (
        !draft.startDate &&
        !draft.endDate &&
        !draft.rows.some((r) => [...r.start, ...r.end].some(Boolean))
      ) {
        draft.startDate = shiftDate(end, -1);
        draft.endDate = end;
      }
    }
    $('start-date').value = current().startDate;
    $('end-date').value = current().endDate;
    renderResults();
  }
  renderClock();
}
function renderClock() {
  $('clock-time').textContent = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(clock.now()));
  $('clock-dot').classList.toggle('synced', clock.synchronized);
  if (!clock.pending) {
    $('clock-status').textContent = clock.synchronized
      ? t('synced')
      : clock.anchor
        ? t('syncStale')
        : t('syncOffline');
    $('sync-clock').title = clock.synchronized
      ? t('syncDetails', { source: clock.anchor.source, ms: Math.ceil(clock.anchor.uncertaintyMs) })
      : t('syncRetry');
  }
}

try {
  setLanguage(localStorage.getItem(LANGUAGE_KEY));
} catch {
  setLanguage('en');
}
translatePage();
$('language-select').value = getLanguage();
$('save-status').textContent = t(saveStatus);
$('language-select').addEventListener('change', () => {
  setLanguage($('language-select').value);
  try {
    localStorage.setItem(LANGUAGE_KEY, getLanguage());
  } catch {
    /* Language still works for this visit. */
  }
  translatePage();
  $('save-status').textContent = t(saveStatus);
  $('toast').hidden = true;
  mountPlant();
  renderClock();
  accounts.render();
});
void showBuildInfo();
void accounts.start();
mountPlant();
renderClock();
void syncTime();
document.querySelectorAll('[data-plant]').forEach((button) =>
  button.addEventListener('click', () => {
    plant = button.dataset.plant;
    $('search-meter').value = '';
    showValidation = false;
    mountPlant();
  }),
);
for (const [id, field] of [
  ['start-date', 'startDate'],
  ['end-date', 'endDate'],
]) {
  $(id).addEventListener('change', () => {
    current()[field] = $(id).value;
    changed();
  });
}
$('use-today').addEventListener('click', async () => {
  if (!clock.synchronized) await syncTime();
  if (!clock.synchronized) {
    toast(t('manualDate'));
    return;
  }
  rememberUndo();
  current().endDate = wibDate(clock.now());
  current().startDate = shiftDate(current().endDate, -1);
  mountPlant();
  changed();
});
$('sync-clock').addEventListener('click', syncTime);
setInterval(() => {
  if (document.hidden) return;
  renderClock();
  if (performance.now() - lastSyncAttempt > (clock.synchronized ? 300000 : 60000)) void syncTime();
}, 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void syncTime();
});
window.addEventListener('online', () => {
  void syncTime();
});
window.addEventListener('offline', () => {
  clock.lastAttemptFailed = true;
  renderClock();
});
$('search-meter').addEventListener('input', filterTable);
$('only-incomplete').addEventListener('change', filterTable);
$('report-view').addEventListener('change', renderResults);
$('check-data').addEventListener('click', () => {
  showValidation = !showValidation;
  renderResults();
});
$('copy-report').addEventListener('click', () => {
  if (!$('copy-report').disabled) void copyText($('report-preview').value);
});
$('copy-combined').addEventListener('click', () => {
  try {
    void copyText(generateFullIndonesiaReport(reports.JRE, reports.UNILAND));
  } catch (error) {
    toast(error.message);
  }
});
$('copy-worksheet').addEventListener('click', () => {
  if (reports[plant].success) void copyText(worksheetRowToTSV(reports[plant].worksheet));
});
$('save-draft').addEventListener('click', () => {
  try {
    draftStorage().setItem(draftKey(), JSON.stringify({ version: 4, drafts }));
    dirty = false;
    saveStatus = 'saved';
    $('save-status').textContent = t(saveStatus);
    toast(t('savedBoth'));
  } catch {
    toast(t('saveError'));
  }
});
$('forget-draft').addEventListener('click', () => {
  try {
    draftStorage().removeItem(draftKey());
    for (const key of accountUser ? [] : ['JRE', 'UNILAND'])
      localStorage.removeItem(`midea_energy_baseline_${key}_v3`);
    dirty = true;
    saveStatus = 'deleted';
    $('save-status').textContent = t(saveStatus);
    toast(t('deletedDetail'));
  } catch {
    toast(t('deleteError'));
  }
});
$('next-day').addEventListener('click', () => {
  try {
    const next = nextDayDraft(current());
    rememberUndo();
    drafts[plant] = next;
    mountPlant();
    changed();
    toast(t('nextReady'));
  } catch (error) {
    toast(error.message);
  }
});
$('load-example').addEventListener('click', () => {
  rememberUndo();
  drafts[plant] = exampleDraft(plant);
  current().isExample = true;
  mountPlant();
  changed();
  toast(t('exampleLoaded'));
});
$('clear-plant').addEventListener('click', () => {
  rememberUndo();
  drafts[plant] = createDraft(plant, current().startDate, current().endDate);
  mountPlant();
  changed();
  toast(t('cleared', { plant }));
});
$('undo-change').addEventListener('click', () => {
  if (!undo) return;
  plant = undo.plant;
  drafts[plant] = undo.draft;
  undo = null;
  $('undo-change').hidden = true;
  mountPlant();
  changed();
});
$('open-import').addEventListener('click', () => {
  $('import-feedback').textContent = '';
  $('import-dialog').showModal();
});
$('apply-import').addEventListener('click', () => {
  const parsed = parseReading($('import-text').value, plant);
  $('import-feedback').textContent = parsed.issues.map((i) => i.message).join('\n');
  if (!parsed.success) return;
  rememberUndo();
  const side = $('import-side').value;
  parsed.values.forEach((values, ri) => {
    current().rows[ri][side] = values;
  });
  current()[side === 'start' ? 'startDate' : 'endDate'] = parsed.date;
  current().importIssues = [...(current().importIssues || []), ...parsed.issues];
  current().isExample = false;
  mountPlant();
  changed();
  $('import-dialog').close();
  toast(parsed.issues.length ? t('importedWarnings') : t('imported'));
});
window.addEventListener('beforeunload', (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    $('save-draft').click();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    showValidation = true;
    renderResults();
    $('check-data').scrollIntoView({ block: 'center' });
  }
});
