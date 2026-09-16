const {
  SAMPLE_DATASETS,
  calculatePlantReport,
  currentWibClock,
  currentWibDate,
  currentWibDateLabel,
  formatRowValue,
  generateFullIndonesiaReport,
  runEngineSelfTests,
  worksheetPreview,
  worksheetRowToTSV
} = globalThis.EnergyEngine;

const PREFS_KEY = 'midea_energy_report_prefs_v3';
const BASELINE_KEY = plant => `midea_energy_baseline_${plant}_v3`;

const state = {
  plantKey: 'JRE',
  theme: 'light',
  reportMode: 'combined',
  inputs: {
    JRE: { yesterday: '', today: '', utilities: '', report: null },
    UNILAND: { yesterday: '', today: '', utilities: '', report: null }
  }
};

const el = {
  clockTime: document.getElementById('clock-live-time'),
  clockDate: document.getElementById('clock-live-date'),
  plantSelect: document.getElementById('plant-select'),
  reportDate: document.getElementById('report-date'),
  btnWibToday: document.getElementById('btn-wib-today'),
  themeToggle: document.getElementById('theme-toggle-btn'),
  selfTest: document.getElementById('self-test-btn'),
  btnCalculate: document.getElementById('btn-calculate'),
  btnLoadJre: document.getElementById('btn-load-jre'),
  btnLoadUniland: document.getElementById('btn-load-uniland'),
  btnSaveBaseline: document.getElementById('btn-save-baseline'),
  btnForgetBaseline: document.getElementById('btn-forget-baseline'),
  btnSwap: document.getElementById('btn-swap'),
  btnClear: document.getElementById('btn-clear'),
  yesterdayInput: document.getElementById('yesterday-input'),
  todayInput: document.getElementById('today-input'),
  utilitiesInput: document.getElementById('consumables-input'),
  yesterdayStats: document.getElementById('yesterday-stats'),
  todayStats: document.getElementById('today-stats'),
  validationContainer: document.getElementById('validation-container'),
  validationHeader: document.getElementById('validation-header'),
  validationTitle: document.getElementById('validation-title'),
  validationList: document.getElementById('validation-list'),
  resultsSection: document.getElementById('results-section'),
  metricLabelTotal: document.getElementById('metric-label-total'),
  metricTotal: document.getElementById('metric-total-direct'),
  metricLabelSecond: document.getElementById('metric-label-second'),
  metricSecond: document.getElementById('metric-second'),
  metricNoteSecond: document.getElementById('metric-note-second'),
  metricLabelThird: document.getElementById('metric-label-third'),
  metricThird: document.getElementById('metric-third'),
  metricNoteThird: document.getElementById('metric-note-third'),
  metricLabelFourth: document.getElementById('metric-label-fourth'),
  metricFourth: document.getElementById('metric-fourth'),
  reportMode: document.getElementById('report-mode-select'),
  reportPre: document.getElementById('report-pre'),
  btnCopyFull: document.getElementById('btn-copy-full-report'),
  btnCopyPlant: document.getElementById('btn-copy-plant-report'),
  btnDownload: document.getElementById('btn-download-report'),
  tabFormatted: document.getElementById('tab-formatted'),
  tabDetails: document.getElementById('tab-details'),
  reportTextView: document.getElementById('report-text-view'),
  reportDetailsView: document.getElementById('report-details-view'),
  detailsSearch: document.getElementById('details-search-input'),
  detailsList: document.getElementById('details-area-list'),
  btnToggleDetails: document.getElementById('btn-toggle-details'),
  worksheetSection: document.getElementById('worksheet-section'),
  worksheetPre: document.getElementById('worksheet-pre'),
  btnCopyWorksheet: document.getElementById('btn-copy-worksheet'),
  toastContainer: document.getElementById('toast-container')
};

let detailsExpanded = false;

function showToast(message, type = 'default', duration = 3200) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  el.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      plantKey: state.plantKey,
      theme: state.theme,
      reportMode: state.reportMode
    }));
  } catch (error) {
    console.warn('Could not save UI preferences:', error);
  }
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const prefs = JSON.parse(raw);
    if (prefs.plantKey === 'JRE' || prefs.plantKey === 'UNILAND') state.plantKey = prefs.plantKey;
    if (prefs.theme === 'dark' || prefs.theme === 'light') state.theme = prefs.theme;
    if (prefs.reportMode === 'combined' || prefs.reportMode === 'single') state.reportMode = prefs.reportMode;
  } catch (error) {
    console.warn('Could not load UI preferences:', error);
  }
}

function saveCurrentInputsToMemory() {
  const current = state.inputs[state.plantKey];
  current.yesterday = el.yesterdayInput.value;
  current.today = el.todayInput.value;
  current.utilities = el.utilitiesInput.value;
}

function loadBaseline(plantKey) {
  try {
    return localStorage.getItem(BASELINE_KEY(plantKey)) || '';
  } catch {
    return '';
  }
}

function switchPlant(plantKey) {
  if (state.inputs[state.plantKey]) saveCurrentInputsToMemory();
  state.plantKey = plantKey;
  el.plantSelect.value = plantKey;

  const current = state.inputs[plantKey];
  if (!current.yesterday) current.yesterday = loadBaseline(plantKey);
  el.yesterdayInput.value = current.yesterday;
  el.todayInput.value = current.today;
  el.utilitiesInput.value = current.utilities;

  el.utilitiesInput.placeholder = plantKey === 'JRE'
    ? '- LPG: 100 Kg\n- Oxygen: 200 Kg\n- Nitrogen: 300 Kg\n- Refrigerant R32: 400 Kg\n- Water: 50 m³'
    : '* LPG: 10 Nm3\n* Air Compressor: 1000 Nm3\n* Oxygen: 20 mmWc\n* Nitrogen: 30 mmH2O\n* Water: 40 m³\n* R32: 50\n* R454B: 60';

  updateInputStats();
  renderCurrentReport();
  savePrefs();
}

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  el.themeToggle.textContent = theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
}

function updateInputStats() {
  const count = value => value.split(/\r?\n/).filter(line => line.trim()).length;
  const y = count(el.yesterdayInput.value);
  const t = count(el.todayInput.value);
  el.yesterdayStats.textContent = `${y} line${y === 1 ? '' : 's'}`;
  el.todayStats.textContent = `${t} line${t === 1 ? '' : 's'}`;
}

function renderValidation(issues) {
  const list = issues || [];
  if (!list.length) {
    el.validationContainer.classList.add('hidden');
    return;
  }

  const errors = list.filter(item => item.level === 'ERROR');
  const warnings = list.filter(item => item.level === 'WARNING');
  el.validationContainer.classList.remove('hidden');
  el.validationContainer.className = errors.length ? 'validation-card error-state' : 'validation-card';
  el.validationHeader.className = errors.length ? 'validation-header error-bg' : 'validation-header warning-bg';
  el.validationTitle.textContent = errors.length
    ? `⚠️ VALIDATION ALERTS: ${errors.length} Error(s), ${warnings.length} Warning(s)`
    : `⚠️ VALIDATION WARNINGS (${warnings.length}) — check the raw meter before sending`;

  el.validationList.replaceChildren();
  list.forEach(issue => {
    const li = document.createElement('li');
    li.className = `validation-item ${issue.level === 'ERROR' ? 'is-error' : ''}`;

    const badge = document.createElement('span');
    badge.className = `badge ${issue.level === 'ERROR' ? 'badge-danger' : 'badge-warning'}`;
    badge.textContent = issue.level;

    const text = document.createElement('div');
    text.className = 'validation-item-text';
    text.textContent = issue.message;

    li.append(badge, text);
    el.validationList.appendChild(li);
  });
}

function currentReport() {
  return state.inputs[state.plantKey].report;
}

function displayNumber(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (Math.abs(value) < 1e-9) return '0';
  return Number(value.toFixed(digits)).toString();
}

function renderMetrics(report) {
  if (!report) return;

  el.metricLabelTotal.textContent = 'Total Energy';
  if (report.totalDirectEnergy === null) {
    el.metricTotal.textContent = `- ${report.totalDirectUnit}`;
  } else if (report.plantKey === 'JRE') {
    el.metricTotal.textContent = `${report.totalDirectEnergy.toFixed(2)} kWh`;
  } else {
    el.metricTotal.textContent = `${displayNumber(report.totalDirectEnergy, 5)} ${report.totalDirectUnit}`;
  }

  if (report.plantKey === 'JRE') {
    el.metricLabelSecond.textContent = 'Sub-Areas Sum';
    el.metricSecond.textContent = `${report.subAreasSumKWh.toFixed(2)} kWh`;
    el.metricNoteSecond.textContent = 'Sum of points 2–29 with valid readings';

    el.metricLabelThird.textContent = 'Total vs Sub-Areas Gap';
    el.metricThird.textContent = report.gapKWh === null ? '-' : `${report.gapKWh.toFixed(2)} kWh`;
    el.metricNoteThird.textContent = report.gapPercent === null ? 'Coverage gap' : `${report.gapPercent.toFixed(2)}% of Total`;
  } else {
    el.metricLabelSecond.textContent = 'Indoor Area';
    el.metricSecond.textContent = report.worksheet.derived.indoorArea === null ? '-' : `${displayNumber(report.worksheet.derived.indoorArea, 2)} kWh`;
    el.metricNoteSecond.textContent = 'Indoor + Vacum box indoor';

    el.metricLabelThird.textContent = 'Outdoor Area';
    el.metricThird.textContent = report.worksheet.derived.outdoorArea === null ? '-' : `${displayNumber(report.worksheet.derived.outdoorArea, 2)} kWh`;
    el.metricNoteThird.textContent = 'Outdoor + Vacum box outdoor + line compressor';
  }

  el.metricLabelFourth.textContent = 'Parsed Meters';
  el.metricFourth.textContent = `${report.meterCount} Meters`;
}

function renderWorksheet(report) {
  if (!report?.success) {
    el.worksheetSection.classList.add('hidden');
    return;
  }
  const preview = worksheetPreview(report.worksheet);
  const tsv = worksheetRowToTSV(report.worksheet);
  el.worksheetPre.textContent = `${preview}\n\nPaste-ready row (tab separated):\n${tsv}`;
  el.worksheetSection.classList.remove('hidden');
}

function renderCurrentReport() {
  const report = currentReport();
  const jreReport = state.inputs.JRE.report;
  const unilandReport = state.inputs.UNILAND.report;

  if (!report?.success) {
    el.resultsSection.classList.add('hidden');
    el.worksheetSection.classList.add('hidden');
    return;
  }

  const text = state.reportMode === 'combined'
    ? generateFullIndonesiaReport(jreReport, unilandReport)
    : `[INDONESIA FACTORY ENERGY REPORT]\n\nSummary situation:\n${report.reportSectionText}`;

  el.reportPre.textContent = text;
  renderMetrics(report);
  renderDetailedBreakdown(report.calculatedRows, el.detailsSearch.value);
  renderWorksheet(report);
  renderValidation(report.issues);
  el.resultsSection.classList.remove('hidden');
}

function executeCalculation() {
  saveCurrentInputsToMemory();
  const data = state.inputs[state.plantKey];
  const result = calculatePlantReport(
    data.yesterday,
    data.today,
    data.utilities,
    state.plantKey,
    el.reportDate.value || null
  );

  if (result.reportDate) el.reportDate.value = result.reportDate;
  data.report = result;
  renderValidation(result.issues);

  if (!result.success) {
    el.resultsSection.classList.add('hidden');
    el.worksheetSection.classList.add('hidden');
    showToast('Calculation stopped. Fix the input errors first.', 'error');
    return;
  }

  renderCurrentReport();
  el.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast(`${state.plantKey} report calculated.`, 'success');
}

function appendText(parent, className, text) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  parent.appendChild(span);
  return span;
}

function renderDetailedBreakdown(rows, searchTerm = '') {
  el.detailsList.replaceChildren();
  const filter = String(searchTerm || '').trim().toLowerCase();
  const filtered = rows.filter(row => !filter || row.name.toLowerCase().includes(filter) || String(row.no).includes(filter));

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No matching area.';
    el.detailsList.appendChild(empty);
    return;
  }

  filtered.forEach(row => {
    const card = document.createElement('div');
    card.className = 'area-card';

    const header = document.createElement('div');
    header.className = 'area-card-header';
    const left = document.createElement('div');
    left.className = 'area-header-left';
    appendText(left, 'area-number', `#${row.no}`);
    appendText(left, 'area-name', row.name);
    if (row.isTotal) appendText(left, 'badge badge-blue', 'Direct Total Meter');

    const right = document.createElement('div');
    right.className = 'area-header-right';
    const formatted = row.missing ? `- ${row.unit}` : `${formatRowValue(state.plantKey, row)} ${row.unit}`;
    appendText(right, 'area-energy-badge', formatted);
    appendText(right, 'badge', `${row.meters.length} meter${row.meters.length === 1 ? '' : 's'}`);
    header.append(left, right);

    const body = document.createElement('div');
    body.className = `area-card-body ${detailsExpanded ? '' : 'hidden'}`;
    if (row.missing) {
      const missing = document.createElement('div');
      missing.className = 'meter-calc-row';
      missing.textContent = 'No comparable reading (- or missing on both days).';
      body.appendChild(missing);
    } else {
      row.meters.forEach(meter => {
        const line = document.createElement('div');
        line.className = 'meter-calc-row';
        appendText(line, 'meter-formula', `Meter ${meter.index}: ${meter.formula}`);
        appendText(line, 'meter-calc-result', `= ${displayNumber(meter.energy, 6)} ${row.unit}`);
        body.appendChild(line);
      });
    }

    const summary = document.createElement('div');
    summary.className = 'area-total-summary';
    appendText(summary, '', `Total ${row.name}:`);
    appendText(summary, '', formatted);
    body.appendChild(summary);

    header.addEventListener('click', () => body.classList.toggle('hidden'));
    card.append(header, body);
    el.detailsList.appendChild(card);
  });
}

async function copyText(text, successMessage) {
  if (!text) {
    showToast('Nothing to copy yet.', 'warning');
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const temp = document.createElement('textarea');
      temp.value = text;
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
    }
    showToast(successMessage, 'success');
  } catch (error) {
    console.warn('Clipboard failed:', error);
    showToast('Clipboard blocked by the browser. Select and copy the text manually.', 'warning');
  }
}

function combinedReportStatus() {
  const jre = state.inputs.JRE.report;
  const uniland = state.inputs.UNILAND.report;
  if (!jre?.success || !uniland?.success) {
    return { ready: false, message: 'Calculate both JRE and UNILAND first, or use Copy Current Plant.' };
  }
  if (!jre.reportDate || !uniland.reportDate) {
    return { ready: false, message: 'Both plant reports need a valid report date before they can be combined.' };
  }
  if (jre.reportDate !== uniland.reportDate) {
    return { ready: false, message: `JRE date (${jre.reportDate}) and UNILAND date (${uniland.reportDate}) do not match.` };
  }
  return { ready: true, message: '' };
}

function fullReportText() {
  return generateFullIndonesiaReport(state.inputs.JRE.report, state.inputs.UNILAND.report);
}

function downloadReport() {
  const report = currentReport();
  if (!report?.success) {
    showToast('Calculate a report first.', 'warning');
    return;
  }
  if (state.reportMode === 'combined') {
    const status = combinedReportStatus();
    if (!status.ready) {
      showToast(status.message, 'warning', 4500);
      return;
    }
  }
  const text = state.reportMode === 'combined'
    ? fullReportText()
    : `[INDONESIA FACTORY ENERGY REPORT]\n\nSummary situation:\n${report.reportSectionText}`;
  const date = report.reportDate || el.reportDate.value || 'report';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = state.reportMode === 'combined'
    ? `Indonesia_Factory_Energy_Report_${date}.txt`
    : `${state.plantKey}_Energy_Report_${date}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function loadExample(plantKey) {
  const sample = SAMPLE_DATASETS[plantKey];
  switchPlant(plantKey);
  state.inputs[plantKey].yesterday = sample.yesterday;
  state.inputs[plantKey].today = sample.today;
  state.inputs[plantKey].utilities = sample.utilities;
  el.yesterdayInput.value = sample.yesterday;
  el.todayInput.value = sample.today;
  el.utilitiesInput.value = sample.utilities;
  el.reportDate.value = sample.date;
  updateInputStats();
  executeCalculation();
}

function saveTodayAsBaseline() {
  const today = el.todayInput.value.trim();
  if (!today) {
    showToast('Today meter reading is empty.', 'warning');
    return;
  }

  try {
    localStorage.setItem(BASELINE_KEY(state.plantKey), today);
  } catch (error) {
    console.warn('Could not save baseline:', error);
    showToast('Browser storage is unavailable.', 'error');
    return;
  }

  state.inputs[state.plantKey].yesterday = today;
  state.inputs[state.plantKey].today = '';
  state.inputs[state.plantKey].report = null;
  el.yesterdayInput.value = today;
  el.todayInput.value = '';

  const baseDate = currentReport()?.reportDate || el.reportDate.value;
  if (baseDate) {
    const date = new Date(`${baseDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    el.reportDate.value = date.toISOString().slice(0, 10);
  }

  updateInputStats();
  el.resultsSection.classList.add('hidden');
  el.worksheetSection.classList.add('hidden');
  showToast(`Saved ${state.plantKey} Today as the next baseline.`, 'success');
}

function forgetSavedBaseline() {
  try {
    localStorage.removeItem(BASELINE_KEY(state.plantKey));
    showToast(`Saved ${state.plantKey} baseline removed from this browser.`, 'success');
  } catch {
    showToast('Could not access browser storage.', 'error');
  }
}

function clearCurrent() {
  state.inputs[state.plantKey] = { yesterday: '', today: '', utilities: '', report: null };
  el.yesterdayInput.value = '';
  el.todayInput.value = '';
  el.utilitiesInput.value = '';
  updateInputStats();
  el.resultsSection.classList.add('hidden');
  el.worksheetSection.classList.add('hidden');
  el.validationContainer.classList.add('hidden');
}

function updateClock() {
  el.clockTime.textContent = currentWibClock();
  el.clockDate.textContent = currentWibDateLabel();
}

function runSelfTestUi() {
  const result = runEngineSelfTests();
  console.table(result.results);
  showToast(result.pass ? 'Self-check passed: JRE and UNILAND reference data match.' : 'Self-check failed. Check the browser console.', result.pass ? 'success' : 'error', 4500);
}

function setupEvents() {
  el.yesterdayInput.addEventListener('input', updateInputStats);
  el.todayInput.addEventListener('input', updateInputStats);
  el.plantSelect.addEventListener('change', event => switchPlant(event.target.value));
  el.btnCalculate.addEventListener('click', executeCalculation);
  el.btnLoadJre.addEventListener('click', () => loadExample('JRE'));
  el.btnLoadUniland.addEventListener('click', () => loadExample('UNILAND'));
  el.btnSaveBaseline.addEventListener('click', saveTodayAsBaseline);
  el.btnForgetBaseline.addEventListener('click', forgetSavedBaseline);
  el.btnClear.addEventListener('click', clearCurrent);
  el.btnSwap.addEventListener('click', () => {
    const tmp = el.yesterdayInput.value;
    el.yesterdayInput.value = el.todayInput.value;
    el.todayInput.value = tmp;
    updateInputStats();
  });
  el.btnWibToday.addEventListener('click', () => {
    el.reportDate.value = currentWibDate();
    showToast('Report date set from this device clock in Asia/Jakarta (WIB).', 'default');
  });
  el.themeToggle.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    savePrefs();
  });
  el.selfTest.addEventListener('click', runSelfTestUi);
  el.reportMode.addEventListener('change', event => {
    state.reportMode = event.target.value;
    savePrefs();
    renderCurrentReport();
  });
  el.btnCopyFull.addEventListener('click', () => {
    const status = combinedReportStatus();
    if (!status.ready) return showToast(status.message, 'warning', 4500);
    return copyText(fullReportText(), 'Full report copied.');
  });
  el.btnCopyPlant.addEventListener('click', () => {
    const report = currentReport();
    if (!report?.success) return showToast('Calculate a report first.', 'warning');
    copyText(`[INDONESIA FACTORY ENERGY REPORT]\n\nSummary situation:\n${report.reportSectionText}`, `${state.plantKey} report copied.`);
  });
  el.btnCopyWorksheet.addEventListener('click', () => {
    const report = currentReport();
    if (!report?.success) return showToast('Calculate a report first.', 'warning');
    copyText(worksheetRowToTSV(report.worksheet), 'Excel row copied.');
  });
  el.btnDownload.addEventListener('click', downloadReport);
  el.btnToggleDetails.addEventListener('click', () => {
    detailsExpanded = !detailsExpanded;
    el.btnToggleDetails.textContent = detailsExpanded ? 'Collapse Details' : 'Expand Details';
    const report = currentReport();
    if (report) renderDetailedBreakdown(report.calculatedRows, el.detailsSearch.value);
  });
  el.detailsSearch.addEventListener('input', () => {
    const report = currentReport();
    if (report) renderDetailedBreakdown(report.calculatedRows, el.detailsSearch.value);
  });
  el.tabFormatted.addEventListener('click', () => {
    el.tabFormatted.classList.add('active');
    el.tabDetails.classList.remove('active');
    el.reportTextView.classList.remove('hidden');
    el.reportDetailsView.classList.add('hidden');
  });
  el.tabDetails.addEventListener('click', () => {
    el.tabDetails.classList.add('active');
    el.tabFormatted.classList.remove('active');
    el.reportDetailsView.classList.remove('hidden');
    el.reportTextView.classList.add('hidden');
  });
  window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      executeCalculation();
    }
  });
}

function init() {
  loadPrefs();
  applyTheme(state.theme);
  el.reportMode.value = state.reportMode;
  el.reportDate.value = currentWibDate();
  setupEvents();
  switchPlant(state.plantKey);
  updateClock();
  setInterval(updateClock, 1000);

  const selfTest = runEngineSelfTests();
  if (!selfTest.pass) console.error('Built-in calculation self-check failed:', selfTest.results);
}

init();
