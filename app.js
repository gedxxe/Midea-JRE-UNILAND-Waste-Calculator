import { fitResultsColumn } from './ui/result-layout.js';
import { createPanelEffects } from './ui/panel-effects.js';
import { mountPanelIcons, setPanelIcon } from './ui/panel-icons.js';
import {
  seedUtilityReadings,
  shareUtilityEdits,
  utilityConflicts,
  hasUtilityData,
} from './utility-periods.js';
import { createWorkingHoursPicker } from './ui/working-hours.js';
import { isWorkingHours, isNightShift, periodKind } from './reading-period.js';
import { emptyNightShifts, changeShiftPair, nextShiftPair, syncShiftReading } from './shifts.js';
import {
  seedElectricity,
  shareElectricityEdits,
  electricityConflicts,
  columnEdits,
} from './observations.js';
import { selectReport, combineReportSelections, selectionForMode } from './report-options.js';
import { createBackupControls } from './ui/draft-backup.js';
import { createDraftAutosave } from './ui/drafts.js';
import { createGraphs } from './ui/graphs.js';
import { createPeriodPicker } from './ui/period.js';
import { createGasPanel } from './ui/gas.js';
import { createRawExport } from './ui/raw-export.js';
import { initRawTemplate } from './ui/raw-template.js';
import { createImportEditor } from './ui/import.js';
import { createWaterPanel } from './ui/water.js';
import { createAdditionalReadingsPanel } from './ui/additional-readings.js';
import { createWelcome } from './ui/welcome.js';
import { createGuideLauncher } from './ui/guide-launcher.js';
import { createAccounts } from './ui/accounts.js';
import { createNavigation } from './ui/navigation.js';
import { $, node } from './ui/dom.js';
import { renderReadingChecks } from './ui/reading-checks.js';
import { createMeterTable } from './ui/table.js';
import { t, setLanguage, getLanguage, translatePage, LANGUAGE_KEY } from './i18n/index.js';
import { showBuildInfo } from './ui/build-info.js';
import { PLANT_SCHEMAS } from './schema.js';
import {
  createDraft,
  createWorkingHoursDraft,
  createNightShiftDraft,
  calculateDraft,
  formatRowValue,
} from './engine.js';
import {
  formatNumber,
  formatSignedNumber,
  formatReportDate,
  shiftDate,
  dayDiff,
} from './numbers.js';
import { buildExcelRow, excelRowToTSV, excelRowPreview } from './excel-row.js';
import {
  STORAGE_KEY,
  restoreWorkspace,
  nextDayDraft,
  changeDraftPeriod,
  emptyWorkingHours,
  useDailyMorning,
} from './storage.js';
import { NetworkClock, wibDate } from './clock.js';
import { exampleDraft } from './examples.js';

const guide = createGuideLauncher({ toast });

const table = createMeterTable({
  getPlant: () => plant,
  current: () => current(),
  getReport: () => reports[plant],
  changed,
  rememberUndo,
  toast,
});
const filterTable = () => table.filter();
const clock = new NetworkClock();
const panelEffects = createPanelEffects();
fitResultsColumn(document.querySelector('.result-column'));
let plant = 'JRE';
let drafts = { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') };
let workingHours = emptyWorkingHours();
let nightShifts = emptyNightShifts();
let mode = 'daily';
let reports = {};
let finalReports = {};
let reportFollowsMode = true;
let undo = null;
let periodOrigin = null;
let dirty = false;
let saveStatus = 'unsaved';
let showValidation = false;
let toastTimer;
let lastSyncAttempt = -Infinity;
let clockDefaultsApplied = false;
let copyGeneration = 0;
const activeDrafts = () =>
  mode === 'nightShift' ? nightShifts : mode === 'workingHours' ? workingHours : drafts;
const current = () => activeDrafts()[plant];
const setCurrent = (draft) => {
  activeDrafts()[plant] = draft;
};
const periodsFor = (key) => [drafts[key], workingHours[key], nightShifts[key]];
function putPeriods(key, periods) {
  // Keep gas input references live when shared endpoints are reconciled.
  const existing = periodsFor(key);
  periods.forEach((next, i) => {
    for (const field of ['rows', 'additionalReadings', 'isExample', 'importIssues'])
      if (field in next) existing[i][field] = next[field];
      else delete existing[i][field];
    next.gas.entries.forEach((entry, index) => {
      for (const side of ['start', 'end'])
        Object.assign(existing[i].gas.entries[index][side], entry[side]);
    });
    if (next.water) existing[i].water = { ...next.water };
  });
}
function seedSharedReadings() {
  for (const key of ['JRE', 'UNILAND'])
    putPeriods(key, seedUtilityReadings(seedElectricity(periodsFor(key))));
}
function putPair(pair) {
  workingHours[plant] = pair.day;
  nightShifts[plant] = pair.night;
}
function ensureNight() {
  for (const key of ['JRE', 'UNILAND'])
    if (
      !nightShifts[key].startDate &&
      !nightShifts[key].endDate &&
      workingHours[key].startDate &&
      !nightShifts[key].rows.some((row) => [...row.start, ...row.end].some(Boolean)) &&
      !nightShifts[key].additionalReadings?.some((row) => row.start || row.end) &&
      !hasUtilityData(nightShifts[key])
    ) {
      nightShifts[key] = syncShiftReading(
        workingHours[key],
        createNightShiftDraft(key, workingHours[key].startDate, workingHours[key].endTime),
      );
    }
}
const workPicker = createWorkingHoursPicker({
  current,
  switchMode(value) {
    mode = value;
    periodOrigin = null;
    showValidation = false;
    rawExport.reset();
    importEditor.reset();
    $('import-dialog').close();
    if (mode !== 'daily' && clock.synchronized) {
      for (const key of ['JRE', 'UNILAND']) {
        const draft = workingHours[key];
        if (
          !draft.startDate &&
          !draft.endDate &&
          !draft.rows.some((row) => [...row.start, ...row.end].some(Boolean))
        )
          workingHours[key] = {
            ...draft,
            startDate: drafts[key].startDate || wibDate(clock.now()),
            endDate: drafts[key].startDate || wibDate(clock.now()),
          };
      }
      ensureNight();
      changed();
    }
    ensureNight();
    mountPlant();
  },
  changePeriod(...args) {
    try {
      changeWork(...args);
    } catch (error) {
      if (error.message !== 'shiftConflict') throw error;
      workPicker.sync();
      toast(t('shiftConflict'));
    }
  },
  copyMorning() {
    try {
      const next = useDailyMorning(current(), drafts[plant]);
      if (
        current().rows.some((row) => row.start.some((v) => v.trim())) &&
        !confirm(t('workMorningConfirm'))
      )
        return;
      rememberUndo();
      setCurrent(next);
      changed(false, columnEdits(current(), ['start']));
      mountPlant();
      toast(t('workMorningCopied'));
    } catch {
      toast(t('workMorningUnavailable'));
    }
  },
});
const periodPicker = createPeriodPicker({
  current,
  apply(start, end) {
    changePeriod(start, end);
  },
});
const rawExport = createRawExport({ current, toast });
initRawTemplate({ getPlant: () => plant, toast });
const importEditor = createImportEditor({
  current,
  toast,
  apply(parsed, side) {
    rememberUndo();
    if (isWorkingHours(current())) {
      const date =
        isNightShift(current()) && side === 'end' ? shiftDate(parsed.date, -1) : parsed.date;
      putPair(
        changeShiftPair(
          workingHours[plant],
          nightShifts[plant],
          mode,
          date,
          side === 'start' ? parsed.time : current().startTime,
          side === 'end' ? parsed.time : current().endTime,
          periodOrigin ? (Array.isArray(periodOrigin) ? periodOrigin : [periodOrigin]) : [],
        ),
      );
    } else
      setCurrent(
        changeDraftPeriod(
          current(),
          side === 'start' ? parsed.date : current().startDate,
          side === 'end' ? parsed.date : current().endDate,
          periodOrigin || current(),
        ),
      );
    const edits = [];
    parsed.values.forEach((values, ri) =>
      values.forEach((value, mi) => {
        if (
          parsed.suppliedMeters?.[ri]?.[mi] ??
          (!parsed.suppliedRows || parsed.suppliedRows.includes(ri))
        ) {
          current().rows[ri][side][mi] = value;
          edits.push({ ri, mi, side });
        }
      }),
    );
    current().importIssues = [...(current().importIssues || []), ...parsed.issues];
    current().isExample = false;
    changed(false, edits);
    mountPlant();
  },
});
const gasPanel = createGasPanel({
  current,
  changed,
  rememberUndo,
  rebuildUtilities: () => table.buildUtilities(),
});
const waterPanel = createWaterPanel({ current, changed, rememberUndo });
const additionalPanel = createAdditionalReadingsPanel({ current, changed });
const backupControls = createBackupControls({
  read: () => autosave?.workspace() || { version: 4, drafts, workingHours, nightShifts },
  apply(workspace) {
    const pendingPeriods = workspace.pendingPeriods ?? autosave.workspace().pendingPeriods;
    // Validate the entire merged workspace before replacing anything. Legacy backups keep Night.
    workspace = restoreWorkspace(
      JSON.stringify({
        ...workspace,
        workingHours: workspace.workingHours || workingHours,
        nightShifts: workspace.nightShifts || nightShifts,
      }),
    );
    undo = {
      plant,
      mode,
      workspace: structuredClone({
        drafts,
        workingHours,
        nightShifts,
        reportLinks: accounts.getLinks(),
        pendingPeriods: autosave?.workspace().pendingPeriods || [],
      }),
    };
    drafts = workspace.drafts;
    // Legacy backups predate this trial. Keep the current trial copy when absent.
    workingHours = workspace.workingHours || workingHours;
    nightShifts = workspace.nightShifts || nightShifts;
    periodOrigin = null;
    accounts.setLinks({});
    autosave.restorePeriods(pendingPeriods);
    rawExport.reset();
    importEditor.reset();
    $('import-dialog').close();
    $('undo-change').hidden = false;
    mountPlant();
    changed();
  },
  toast,
});
let graphs, autosave;
let accountUser = null;
let firstIdentity = true;
const draftKey = () => (accountUser ? STORAGE_KEY + '_' + accountUser.id : STORAGE_KEY);
const draftStorage = () => (accountUser ? sessionStorage : localStorage);
function accountChanged(user) {
  copyGeneration++;
  panelEffects.reset();
  guide.reset(user);
  graphs?.reset(user);
  backupControls.reset(user);
  rawExport.reset();
  try {
    if (accountUser) {
      sessionStorage.removeItem(draftKey());
      sessionStorage.removeItem(draftKey() + '_sync');
    }
  } catch {
    /* No persisted tab draft. */
  }
  accountUser = user;
  drafts = { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') };
  workingHours = emptyWorkingHours();
  nightShifts = emptyNightShifts();
  mode = 'daily';
  reportFollowsMode = true;
  $('report-periods').value = 'daily';
  undo = null;
  periodOrigin = null;
  dirty = false;
  showValidation = false;
  saveStatus = 'unsaved';
  $('undo-change').hidden = true;
  importEditor.reset();
  $('import-dialog').close();
  $('toast').hidden = true;
  if (user || firstIdentity) {
    try {
      const raw = draftStorage().getItem(draftKey());
      if (raw) {
        const restored = restoreWorkspace(raw);
        drafts = restored.drafts;
        workingHours = restored.workingHours || emptyWorkingHours();
        nightShifts = restored.nightShifts || emptyNightShifts();
        ensureNight();
        saveStatus = 'restored';
      }
    } catch {
      toast(t('restoreError'));
    }
  }
  firstIdentity = false;
  $('save-status').textContent = t(saveStatus);
  mountPlant();
  autosave?.reset(user);
}
let navigation;
const welcome = createWelcome();
const accounts = createAccounts({
  opened: (view) => navigation?.opened(view),
  authActivity: (status) => welcome.authActivity(status),
  rendered: () => {
    welcome.sync({ ready: accounts.isReady(), user: accounts.getUser() });
    navigation?.sync();
    panelEffects.sync();
  },
  current,
  identityChanged: accountChanged,
  saveWorking: async () => {
    autosave.changed();
    return autosave.flushAll({ ensureWorkspace: true });
  },
  checkpoint: (save) => autosave.checkpoint(save),
  beforeRead: () => autosave.flushAll(),
  beforeSignOut: () => autosave.flushAll(),
  toast,
  loadDraft(draft) {
    rememberUndo();
    plant = draft.plantKey;
    mode = periodKind(draft);
    reportFollowsMode = true;
    setCurrent(draft);
    changed(false, columnEdits(current()));
    mountPlant();
  },
});
autosave = createDraftAutosave({
  request: (...args) => accounts.request(...args),
  read: () => ({
    version: 4,
    autosaveLayout: 1,
    drafts,
    workingHours,
    nightShifts,
    reportLinks: accounts.getLinks(),
  }),
  apply(workspace) {
    drafts = workspace?.drafts || { JRE: createDraft('JRE'), UNILAND: createDraft('UNILAND') };
    workingHours = workspace?.workingHours || emptyWorkingHours();
    nightShifts = workspace?.nightShifts || emptyNightShifts();
    ensureNight();
    accounts.setLinks(workspace?.reportLinks);
    dirty = false;
    undo = null;
    periodOrigin = null;
    $('undo-change').hidden = true;
    mountPlant();
  },
  localSaved: () => {
    dirty = false;
  },
  synced: () => graphs?.saved(),
});
graphs = createGraphs({
  current,
  beforeLoad: () => autosave.flushAll(),
  request: (...args) => accounts.request(...args),
  toast,
  opened: (view) => navigation?.opened(view),
});
navigation = createNavigation({
  getState: () => ({ ready: accounts.isReady(), user: accounts.getUser() }),
  open(view) {
    if (view === 'monitoring') graphs.open();
    else if (view === 'history') accounts.openHistory();
    else if (view === 'accounts') accounts.openUsers();
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
  undo = {
    plant,
    mode,
    workspace: structuredClone({
      drafts,
      workingHours,
      nightShifts,
      reportLinks: accounts.getLinks(),
      pendingPeriods: autosave?.workspace().pendingPeriods || [],
    }),
  };
  $('undo-change').hidden = false;
}
function changed(periodOnly = false, edits = [], utilityEdits = []) {
  if (utilityEdits.length)
    putPeriods(plant, shareUtilityEdits(periodsFor(plant), mode, utilityEdits));
  if (edits.length) putPeriods(plant, shareElectricityEdits(periodsFor(plant), mode, edits));
  seedSharedReadings();
  if (!periodOnly) periodOrigin = null;
  dirty = true;
  saveStatus = 'changed';
  $('save-status').textContent = t(saveStatus);
  renderResults();
  autosave?.changed({ periodOnly });
}
function changePeriod(start, end) {
  if (current().startDate === start && current().endDate === end) return;
  if (!periodOrigin) {
    rememberUndo();
    periodOrigin = structuredClone(current());
  }
  setCurrent(changeDraftPeriod(current(), start, end, periodOrigin));
  mountPlant();
  changed(true);
  toast(t('periodReadingsMoved'));
}
function changeWork(date, startTime, endTime) {
  if (
    current().startDate === date &&
    current().startTime === startTime &&
    current().endTime === endTime
  )
    return;
  if (!periodOrigin) {
    rememberUndo();
    periodOrigin = structuredClone([workingHours[plant], nightShifts[plant]]);
  }
  putPair(
    changeShiftPair(
      workingHours[plant],
      nightShifts[plant],
      mode,
      date,
      startTime,
      endTime,
      periodOrigin,
    ),
  );
  mountPlant();
  changed(true);
  toast(t('periodReadingsMoved'));
}
function mountPlant() {
  seedSharedReadings();
  if (reportFollowsMode) $('report-periods').value = selectionForMode(mode);
  periodPicker.sync();
  $('start-date').value = current().startDate;
  $('end-date').value = current().endDate;
  $('table-plant').textContent = plant;
  document.querySelectorAll('[data-plant]').forEach((button) => {
    const selected = button.dataset.plant === plant;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  gasPanel.rebuild();
  waterPanel.rebuild();
  additionalPanel.rebuild();
  table.rebuild();
  workPicker.sync();
  renderResults();
}
function renderResults() {
  reports = {
    JRE: calculateDraft(activeDrafts().JRE),
    UNILAND: calculateDraft(activeDrafts().UNILAND),
  };
  const report = reports[plant];
  for (const key of ['JRE', 'UNILAND'])
    $('count-' + key.toLowerCase()).textContent =
      `${reports[key].completeRows}/${PLANT_SCHEMAS[key].rows.length}`;
  $('report-date-label').textContent = current().startDate
    ? formatReportDate(current().startDate)
    : t('selectPeriod');
  const dateIssue = report.issues.find((i) => i.code.startsWith('DATE_') && i.level !== 'NOTICE');
  $('period-note').textContent = isWorkingHours(current())
    ? dateIssue?.message ||
      t(isNightShift(current()) ? 'nightNotice' : 'workNotice', {
        date: current().startDate || '-',
        start: current().startTime || '-',
        end: current().endTime || '-',
        endDate: current().endDate || '-',
      })
    : dateIssue
      ? dateIssue.message
      : dayDiff(current().startDate, current().endDate) > 1
        ? t('combinedNotice', {
            days: dayDiff(current().startDate, current().endDate),
            start: current().startDate,
            end: current().endDate,
          })
        : t('periodNote', { start: current().startDate, end: current().endDate });
  $('period-note').classList.toggle('warning', !!dateIssue && !!current().startDate);
  $('example-note').hidden = !current().isExample;
  $('completion-progress').max = report.calculatedRows.length;
  $('completion-progress').value = report.completeRows;
  $('progress-label').textContent = t('progress', {
    done: report.completeRows,
    total: report.calculatedRows.length,
  });
  const metricScope = JSON.stringify([
    accountUser?.id,
    plant,
    mode,
    current().startDate,
    current().endDate,
    current().startTime,
    current().endTime,
  ]);
  panelEffects.setText(
    $('main-total'),
    formatRowValue(plant, report.calculatedRows[0]),
    metricScope,
  );
  $('main-unit').textContent = report.totalDirectUnit;
  if (plant === 'JRE') {
    $('derived-one-label').textContent = 'Sub-meter 2-' + PLANT_SCHEMAS.JRE.rows.length;
    $('derived-two-label').textContent = t('gapLabel');
    panelEffects.setText(
      $('derived-one'),
      report.subAreasSumKWh === null ? '-' : `${report.subAreasSumKWh.toFixed(2)} kWh`,
      metricScope,
    );
    panelEffects.setText(
      $('derived-two'),
      report.gapKWh === null ? '-' : `${formatSignedNumber(report.gapKWh)} kWh`,
      metricScope,
    );
    $('metric-note').textContent =
      report.gapKWh === null
        ? t('gapPending')
        : t('gap', {
            value:
              report.gapPercent === null
                ? t('undefinedGap')
                : formatSignedNumber(report.gapPercent) + '%',
          });
  } else {
    $('derived-one-label').textContent = 'Indoor Area';
    $('derived-two-label').textContent = 'Outdoor Area';
    panelEffects.setText(
      $('derived-one'),
      report.worksheet.derived.indoorArea === null
        ? '-'
        : `${formatNumber(report.worksheet.derived.indoorArea)} kWh`,
      metricScope,
    );
    panelEffects.setText(
      $('derived-two'),
      report.worksheet.derived.outdoorArea === null
        ? '-'
        : `${formatNumber(report.worksheet.derived.outdoorArea)} kWh`,
      metricScope,
    );
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
    $('validation-summary').textContent = report.issues.filter((i) => i.level !== 'NOTICE').length
      ? t('validation', { count: report.issues.length })
      : t('valid');
    renderReadingChecks($('validation-list'), report.issues, plant, (i) => {
      $('search-meter').value = '';
      $('only-incomplete').checked = false;
      filterTable();
      if (i.target?.kind === 'gas') gasPanel.focusIssue(i.target);
      else if (i.target?.kind === 'water') waterPanel.focusIssue();
      else if (i.target?.kind === 'utility') {
        const input = document.querySelector('[data-utility="' + i.target.index + '"]');
        input?.scrollIntoView({ block: 'center' });
        input?.focus();
      } else table.focusIssue(i);
    });
  } else $('validation-list').replaceChildren();
  const choice = $('report-periods').value;
  finalReports = Object.fromEntries(
    ['JRE', 'UNILAND'].map((key) => [
      key,
      selectReport(periodsFor(key), choice, { [mode]: reports[key] }),
    ]),
  );
  const selected = finalReports[plant];
  let combined = '',
    combinedError = '';
  try {
    combined = combineReportSelections(finalReports.JRE, finalReports.UNILAND);
  } catch (error) {
    combinedError = t(error.message);
  }
  const conflicts = [
    ...electricityConflicts(periodsFor(plant)),
    ...utilityConflicts(periodsFor(plant)),
  ];
  $('shared-reading-note').hidden = !conflicts.length;
  $('shared-reading-note').textContent = conflicts.length
    ? t('sharedReadingConflict', { count: conflicts.length })
    : '';
  const excel = buildExcelRow(current(), report);
  const periodLabel = t(
    mode === 'workingHours' ? 'excelDay' : mode === 'nightShift' ? 'excelNight' : 'excelDaily',
  );
  const manualColumns = excel.notes
    .filter((n) => n.code === 'unmapped')
    .map((n) => n.column)
    .join(', ');
  const unitColumns = excel.notes
    .filter((n) => n.code === 'unit')
    .map((n) => n.column)
    .join(', ');
  const stockColumns = excel.notes
    .filter((n) => n.code === 'stockIncrease')
    .map((n) => n.column)
    .join(', ');
  const unmappedNames = excel.notes
    .filter((n) => n.code === 'unmappedRow')
    .map((n) => n.name)
    .join(', ');
  const excelGuide = [
    t('excelPaste', {
      start: excel.start,
      end: excel.end,
      count: excel.values.length,
      separator: excel.separator,
      period: periodLabel,
    }),
    manualColumns ? t('excelManual', { columns: manualColumns }) : '',
    unmappedNames ? t('excelUnmapped', { names: unmappedNames }) : '',
    unitColumns ? t('excelUnits', { columns: unitColumns }) : '',
    stockColumns ? t('excelStock', { columns: stockColumns }) : '',
    t('excelTarget'),
  ]
    .filter(Boolean)
    .join(' ');
  $('excel-row-note').textContent = t('excelRange', {
    start: excel.start,
    end: excel.end,
    period: periodLabel,
  });
  const view = $('report-view').value;
  const hasData = current().rows.some((row) => [...row.start, ...row.end].some((v) => v.trim()));
  $('report-preview').value =
    view === 'combined'
      ? combined || combinedError
      : view === 'worksheet'
        ? hasData
          ? excelRowPreview(excel)
          : ''
        : selected.success
          ? selected.text
          : selected.parts.length === 1 &&
              selected.parts[0].draft.rows.some((row) =>
                [...row.start, ...row.end].some((v) => v.trim()),
              )
            ? selected.parts[0].report.reportSectionText
            : hasData
              ? t(selected.error)
              : '';
  $('copy-report').disabled =
    view === 'worksheet' ? !report.success : view === 'combined' ? !combined : !selected.success;
  $('copy-report-label').textContent = view === 'worksheet' ? t('copyWorksheet') : t('copyReport');
  panelEffects.sync();
  $('copy-combined').disabled = !combined;
  $('copy-combined').title = combinedError;
  $('copy-worksheet').disabled = !report.success;
  $('copy-worksheet').hidden = view === 'worksheet';
  const ready =
    view === 'worksheet' ? report.success : view === 'combined' ? !!combined : selected.success;
  const visibleParts =
    view === 'worksheet'
      ? [{ report }]
      : view === 'combined'
        ? [...finalReports.JRE.parts, ...finalReports.UNILAND.parts]
        : selected.parts;
  const hasChecks = visibleParts.some((p) => p.report.issues.some((i) => i.level !== 'NOTICE'));
  $('result-state').textContent = !ready
    ? t('incomplete')
    : hasChecks
      ? t('needsCheck')
      : t('ready');
  $('result-state').classList.toggle('ready', ready && !hasChecks);
  const tone = !ready ? 'pending' : hasChecks ? 'attention' : 'ready';
  $('result-status').dataset.tone = tone;
  setPanelIcon(
    $('result-status').querySelector('[data-panel-icon]'),
    tone === 'ready' ? 'circle-check' : tone === 'attention' ? 'triangle-alert' : 'clock',
  );
  $('copy-note').textContent = !ready
    ? view === 'worksheet'
      ? t('copyIncomplete')
      : view === 'combined'
        ? combinedError
        : t(selected.error)
    : hasChecks
      ? t('copyWarnings')
      : t('copyPeriod');
  if (view === 'worksheet' && report.success) $('copy-note').textContent = excelGuide;
  filterTable();
  rawExport.render();
  gasPanel.update();
  waterPanel.update();
  additionalPanel.update();
  autosave?.render();
}
async function copyText(text) {
  const generation = ++copyGeneration,
    preview = $('report-preview').value,
    factory = plant,
    period = mode,
    endpoints = JSON.stringify([
      current().startDate,
      current().endDate,
      current().startTime,
      current().endTime,
    ]);
  const stillCurrent = () =>
    generation === copyGeneration &&
    factory === plant &&
    period === mode &&
    endpoints ===
      JSON.stringify([
        current().startDate,
        current().endDate,
        current().startTime,
        current().endTime,
      ]) &&
    preview === $('report-preview').value;
  try {
    await navigator.clipboard.writeText(text);
    if (stillCurrent()) toast(t('copied'));
  } catch {
    if (!stillCurrent()) return;
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
    periodPicker.sync();
    if (
      isWorkingHours(current()) &&
      !current().startDate &&
      !current().rows.some((row) => [...row.start, ...row.end].some(Boolean))
    )
      putPair(
        changeShiftPair(
          workingHours[plant],
          nightShifts[plant],
          mode,
          end,
          current().startTime,
          current().endTime,
        ),
      );
    ensureNight();
    workPicker.sync();
    renderResults();
  }
  renderClock();
}
function renderClock() {
  panelEffects.setText(
    $('clock-time'),
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date(clock.now())),
    'clock',
  );
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
mountPanelIcons();
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
  guide.translate();
  importEditor.refreshLabels();
  graphs.render();
});
void showBuildInfo();
void accounts.start();
mountPlant();
renderClock();
void syncTime();
document.querySelectorAll('[data-plant]').forEach((button) =>
  button.addEventListener('click', () => {
    periodOrigin = null;
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
    changePeriod(
      field === 'startDate' ? $(id).value : current().startDate,
      field === 'endDate' ? $(id).value : current().endDate,
    );
  });
}
$('use-today').addEventListener('click', async () => {
  if (!clock.synchronized) await syncTime();
  if (!clock.synchronized) {
    toast(t('manualDate'));
    return;
  }
  const end = wibDate(clock.now());
  changePeriod(shiftDate(end, -1), end);
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
$('report-periods').addEventListener('change', () => {
  reportFollowsMode = false;
  renderResults();
});
$('check-data').addEventListener('click', () => {
  showValidation = !showValidation;
  renderResults();
});
$('copy-report').addEventListener('click', () => {
  if (!$('copy-report').disabled)
    void copyText(
      $('report-view').value === 'worksheet'
        ? excelRowToTSV(buildExcelRow(current(), reports[plant]))
        : $('report-preview').value,
    );
});
$('copy-combined').addEventListener('click', () => {
  try {
    void copyText(combineReportSelections(finalReports.JRE, finalReports.UNILAND));
  } catch (error) {
    toast(t(error.message));
  }
});
$('copy-worksheet').addEventListener('click', () => {
  if (reports[plant].success)
    void copyText(excelRowToTSV(buildExcelRow(current(), reports[plant])));
});
$('save-draft').addEventListener('click', () => {
  autosave.changed();
  void autosave.flush();
});
$('forget-draft').addEventListener('click', () => void autosave.forget());
$('next-day').addEventListener('click', () => {
  try {
    const next = isWorkingHours(current())
      ? nextShiftPair(workingHours[plant], nightShifts[plant])
      : nextDayDraft(current());
    rememberUndo();
    if (isWorkingHours(current())) putPair(next);
    else setCurrent(next);
    mountPlant();
    changed();
    toast(t('nextReady'));
  } catch (error) {
    toast(error.message);
  }
});
$('load-example').addEventListener('click', () => {
  rememberUndo();
  const example = exampleDraft(plant);
  if (mode !== 'daily') {
    putPair(
      changeShiftPair(
        workingHours[plant],
        nightShifts[plant],
        mode,
        example.startDate,
        current().startTime,
        current().endTime,
      ),
    );
    setCurrent({
      ...(isNightShift(current()) ? createNightShiftDraft : createWorkingHoursDraft)(
        plant,
        example.startDate,
        current().startTime,
        current().endTime,
      ),
      rows: example.rows,
    });
  } else setCurrent(example);
  current().isExample = true;
  changed(false, columnEdits(current()));
  mountPlant();
  toast(t('exampleLoaded'));
});
$('clear-plant').addEventListener('click', () => {
  rememberUndo();
  setCurrent(
    isWorkingHours(current())
      ? (isNightShift(current()) ? createNightShiftDraft : createWorkingHoursDraft)(
          plant,
          current().startDate,
          current().startTime,
          current().endTime,
        )
      : createDraft(plant, current().startDate, current().endDate),
  );
  changed(false, columnEdits(current()));
  mountPlant();
  toast(t('cleared', { plant }));
});
$('undo-change').addEventListener('click', () => {
  if (!undo) return;
  plant = undo.plant;
  mode = undo.mode || 'daily';
  if (undo.workspace) {
    drafts = undo.workspace.drafts;
    workingHours = undo.workspace.workingHours || emptyWorkingHours();
    nightShifts = undo.workspace.nightShifts || emptyNightShifts();
    accounts.setLinks(undo.workspace.reportLinks);
    autosave.restorePeriods(undo.workspace.pendingPeriods || []);
    rawExport.reset();
    importEditor.reset();
    $('import-dialog').close();
  } else setCurrent(undo.draft);
  undo = null;
  $('undo-change').hidden = true;
  mountPlant();
  changed();
});
window.addEventListener('beforeunload', (event) => {
  if (dirty || autosave?.pending()) {
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
