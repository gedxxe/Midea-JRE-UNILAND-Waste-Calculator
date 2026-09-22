import { PLANT_SCHEMAS, UTILITIES } from './schema.js';
import { createDraft, calculateDraft, formatRowValue, generateFullIndonesiaReport } from './engine.js';
import { formatNumber, formatReportDate, shiftDate, normalizeName } from './numbers.js';
import { worksheetRowToTSV } from './worksheet.js';
import { parseReading, planTablePaste } from './importer.js';
import { STORAGE_KEY, restoreDrafts, nextDayDraft } from './storage.js';
import { NetworkClock, wibDate } from './clock.js';
import { exampleDraft } from './examples.js';

const $ = id => document.getElementById(id);
const clock = new NetworkClock();
let plant = 'JRE';
let drafts = {JRE:createDraft('JRE'), UNILAND:createDraft('UNILAND')};
let reports = {};
let undo = null;
let dirty = false;
let showValidation = false;
let toastTimer;
let lastSyncAttempt = -Infinity;
let clockDefaultsApplied = false;
const coordinates = [];
const rowNodes = [];
const inputNodes = [];
const outputNodes = [];
const current = () => drafts[plant];
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
}
function rememberUndo() { undo = {plant, draft:structuredClone(current())}; $('undo-change').hidden = false; }
function changed() {
  dirty = true;
  $('save-status').textContent = 'Ada perubahan belum disimpan';
  renderResults();
}
function buildTable() {
  coordinates.length = 0; rowNodes.length = 0; inputNodes.length = 0; outputNodes.length = 0;
  const fragment = document.createDocumentFragment();
  PLANT_SCHEMAS[plant].rows.forEach((row, ri) => {
    rowNodes[ri] = []; inputNodes[ri] = [];
    row.factors.forEach((factor, mi) => {
      coordinates.push({ri,mi});
      const tr = node('tr');
      tr.classList.toggle('group-end', mi === row.factors.length - 1);
      tr.classList.toggle('main-row', ri === 0);
      tr.dataset.row = ri;
      if (mi === 0) {
        const equipment = node('td', undefined, 'equipment'); equipment.rowSpan = row.factors.length;
        equipment.append(node('span', String(ri + 1).padStart(2,'0'), 'equipment-number'), node('span',row.name));
        if (row.allowInactive) {
          const label = node('label',undefined,'check-label'); const check = node('input');
          check.type = 'checkbox'; check.checked = current().rows[ri].inactive;
          check.setAttribute('aria-label',`${row.name}: unit tidak aktif`);
          check.addEventListener('change', () => { current().rows[ri].inactive = check.checked; changed(); });
          label.append(check,node('span','Unit tidak aktif')); equipment.append(label);
        }
        tr.append(equipment);
      }
      const ratio = node('td', undefined, 'ratio');
      ratio.append(node('span', `Meter ${mi + 1}`),node('strong',row.ratioLabel ? `× ${row.ratioLabel}` : factor === 1 ? 'Langsung' : `× ${factor}`));
      tr.append(ratio);
      inputNodes[ri][mi] = {};
      for (const side of ['start','end']) {
        const td = node('td'); const input = node('input',undefined,'meter-input');
        input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.spellcheck = false; input.maxLength = 50;
        input.placeholder = 'Isi reading'; input.value = current().rows[ri][side][mi];
        input.dataset.row = ri; input.dataset.meter = mi; input.dataset.side = side;
        input.setAttribute('aria-label',`${row.name}, meter ${mi + 1}, reading ${side === 'start' ? 'awal' : 'akhir'}`);
        input.addEventListener('input', () => { current().rows[ri][side][mi] = input.value; changed(); });
        input.addEventListener('paste', handlePaste);
        input.addEventListener('blur', () => setTimeout(filterTable, 0));
        input.addEventListener('keydown', handleGridKey);
        inputNodes[ri][mi][side] = input;
        td.append(input); tr.append(td);
      }
      if (mi === 0) {
        const output = node('td',undefined,'energy'); output.rowSpan = row.factors.length;
        output.append(node('span','-'),node('small',row.unit)); outputNodes[ri] = output; tr.append(output);
      }
      rowNodes[ri].push(tr); fragment.append(tr);
    });
  });
  $('meter-body').replaceChildren(fragment);
}
function visibleCoordinates() { return coordinates.filter(({ri}) => !rowNodes[ri][0].hidden); }
function handlePaste(event) {
  const text = event.clipboardData.getData('text/plain');
  if (!/[\t\r\n]/.test(text)) return;
  event.preventDefault();
  const {row,meter,side} = event.target.dataset;
  const coords = visibleCoordinates();
  const index = coords.findIndex(item => item.ri === Number(row) && item.mi === Number(meter));
  try {
    const changes = planTablePaste(text,coords,index,side);
    rememberUndo();
    changes.forEach(({ri,mi,side,value}) => { current().rows[ri][side][mi] = value; inputNodes[ri][mi][side].value = value; });
    changed(); toast(`${changes.length} sel reading berhasil diisi.`);
  } catch (error) { toast(error.message); }
}
function handleGridKey(event) {
  if (!['Enter','ArrowUp','ArrowDown'].includes(event.key) || event.ctrlKey || event.metaKey) return;
  const {row,meter,side} = event.target.dataset;
  const coords = visibleCoordinates();
  const index = coords.findIndex(item => item.ri === Number(row) && item.mi === Number(meter));
  const direction = event.key === 'ArrowUp' || event.shiftKey ? -1 : 1;
  const next = coords[index + direction];
  if (next) { event.preventDefault(); inputNodes[next.ri][next.mi][side].focus(); }
}
function buildUtilities() {
  $('utility-fields').replaceChildren(...UTILITIES[plant].map(([name,unit],i) => {
    const wrapper = node('div',undefined,'utility-entry');
    const label = node('label',`${name}${unit ? ` (${unit})` : ''}`);
    const input = node('input'); input.type='text'; input.inputMode='decimal'; input.maxLength=50;
    input.placeholder='Belum diisi'; input.value=current().utilities[i].value;
    input.addEventListener('input', () => { current().utilities[i].value=input.value; changed(); });
    label.append(input);
    const note = node('input',undefined,'utility-note'); note.type='text'; note.maxLength=500;
    note.placeholder='Catatan, jika ada'; note.value=current().utilities[i].note;
    note.setAttribute('aria-label',`Catatan ${name}`);
    note.addEventListener('input', () => { current().utilities[i].note=note.value; changed(); });
    wrapper.append(label,note); return wrapper;
  }));
}
function mountPlant() {
  $('start-date').value = current().startDate; $('end-date').value = current().endDate;
  $('table-plant').textContent = plant;
  document.querySelectorAll('[data-plant]').forEach(button => {
    const selected = button.dataset.plant === plant;
    button.classList.toggle('active',selected); button.setAttribute('aria-pressed',String(selected));
  });
  buildTable(); buildUtilities(); renderResults();
}
function filterTable() {
  const query = normalizeName($('search-meter').value);
  let visible = 0;
  PLANT_SCHEMAS[plant].rows.forEach((row, ri) => {
    const needsCheck = reports[plant].calculatedRows[ri].missing || reports[plant].issues.some(i => i.rowIndex === ri);
    const editing = document.activeElement?.dataset.row === String(ri);
    const hidden = !normalizeName(row.name).includes(query) || ($('only-incomplete').checked && !needsCheck && !editing);
    rowNodes[ri].forEach(tr => { tr.hidden = hidden; });
    if (!hidden) visible++;
  });
  $('no-matches').hidden = visible !== 0;
}
function renderResults() {
  reports = {JRE:calculateDraft(drafts.JRE), UNILAND:calculateDraft(drafts.UNILAND)};
  const report = reports[plant];
  for (const key of ['JRE','UNILAND']) $('count-'+key.toLowerCase()).textContent = `${reports[key].completeRows}/${PLANT_SCHEMAS[key].rows.length}`;
  $('report-date-label').textContent = current().startDate ? formatReportDate(current().startDate) : 'Pilih periode';
  const dateIssue = report.issues.find(i => i.code.startsWith('DATE_'));
  $('period-note').textContent = dateIssue ? dateIssue.message : `${current().startDate} 08.00 sampai ${current().endDate} 08.00 WIB. Tanggal laporan mengikuti reading awal.`;
  $('period-note').classList.toggle('warning',!!dateIssue && !!current().startDate);
  $('example-note').hidden = !current().isExample;
  $('completion-progress').max = report.calculatedRows.length;
  $('completion-progress').value = report.completeRows;
  $('progress-label').textContent = `${report.completeRows} dari ${report.calculatedRows.length}`;
  $('main-total').textContent = formatRowValue(plant,report.calculatedRows[0]); $('main-unit').textContent = report.totalDirectUnit;
  $('result-state').textContent = report.success ? report.issues.length ? 'Perlu diperiksa' : 'Siap disalin' : 'Belum lengkap';
  $('result-state').classList.toggle('ready',report.success && !report.issues.length);
  if (plant === 'JRE') {
    $('derived-one-label').textContent = 'Sub-meter 2-29'; $('derived-two-label').textContent = 'Gap ke main meter';
    $('derived-one').textContent = report.subAreasSumKWh === null ? '-' : `${report.subAreasSumKWh.toFixed(2)} kWh`;
    $('derived-two').textContent = report.gapKWh === null ? '-' : `${report.gapKWh.toFixed(2)} kWh`;
    $('metric-note').textContent = report.gapKWh === null ? 'Gap dihitung setelah semua sub-meter lengkap.' : `Gap ${report.gapPercent === null ? 'tidak terdefinisi (main meter 0)' : report.gapPercent.toFixed(2)+'%'}. Cakupan sub-meter bisa berbeda dari main meter.`;
  } else {
    $('derived-one-label').textContent = 'Indoor Area'; $('derived-two-label').textContent = 'Outdoor Area';
    $('derived-one').textContent = report.worksheet.derived.indoorArea === null ? '-' : `${formatNumber(report.worksheet.derived.indoorArea)} kWh`;
    $('derived-two').textContent = report.worksheet.derived.outdoorArea === null ? '-' : `${formatNumber(report.worksheet.derived.outdoorArea)} kWh`;
    $('metric-note').textContent = 'Penjumlahan area untuk worksheet. Nilai individual tetap ada di laporan.';
  }
  report.calculatedRows.forEach((row,ri) => {
    const rowIssues = report.issues.filter(i => i.rowIndex === ri);
    const output = outputNodes[ri];
    output.firstChild.textContent = formatRowValue(plant,row);
    output.lastChild.textContent = row.missing ? (rowIssues.some(i => i.code === 'EMPTY_READING') ? 'Belum diisi' : 'Periksa data') : row.unit;
    output.classList.toggle('check',rowIssues.some(i => i.code !== 'EMPTY_READING'));
    output.title = row.meters.map(m => `${m.start || '?'} → ${m.end || '?'} × ${m.factor} = ${formatNumber(m.energy,8)} ${row.unit}`).join('\n');
    inputNodes[ri].forEach((pair,mi) => {
      const relevant = rowIssues.filter(i => i.meterIndex === mi && i.code !== 'EMPTY_READING');
      for (const input of Object.values(pair)) {
        input.setAttribute('aria-invalid',String(relevant.length > 0));
        input.title = relevant.map(i => i.message).join('\n');
      }
    });
  });
  const incomplete = report.issues.filter(i => i.code === 'EMPTY_READING').length;
  const otherIssues = report.issues.filter(i => i.code !== 'EMPTY_READING');
  $('issue-count').textContent = `${incomplete ? `${incomplete} meter kosong` : `${otherIssues.length} catatan`}`;
  $('validation-panel').hidden = !showValidation;
  if (showValidation) {
    $('validation-summary').textContent = report.issues.length ? `${report.issues.length} bagian perlu diperiksa. Klik equipment untuk mengisi atau memperbaiki reading.` : 'Semua reading lengkap. Tidak ada masalah pada pemeriksaan otomatis.';
    $('validation-list').replaceChildren(...report.issues.map(i => {
      const li = node('li');
      if (i.rowIndex !== null && i.rowIndex !== undefined) {
        const button = node('button',i.message);
        button.addEventListener('click', () => {
          $('search-meter').value=''; $('only-incomplete').checked=false; filterTable();
          const input = inputNodes[i.rowIndex][i.meterIndex ?? 0].start;
          input.focus(); input.scrollIntoView({block:'center'});
        }); li.append(button);
      } else li.textContent = i.message;
      return li;
    }));
  }
  let combined = ''; let combinedError = '';
  try { combined = generateFullIndonesiaReport(reports.JRE,reports.UNILAND); } catch(error) { combinedError=error.message; }
  const view = $('report-view').value;
  const hasData = current().rows.some(row => [...row.start,...row.end].some(v => v.trim()));
  $('report-preview').value = view === 'combined' ? combined || combinedError : view === 'worksheet' ? hasData ? [report.worksheetText,report.checks].filter(Boolean).join('\n\n') : '' : hasData ? report.reportSectionText : '';
  $('copy-report').disabled = view === 'combined' ? !combined : !report.success;
  $('copy-report').textContent = view === 'worksheet' ? 'Salin worksheet' : 'Salin laporan';
  $('copy-combined').disabled = !combined; $('copy-combined').title=combinedError;
  $('copy-worksheet').disabled = !report.success;
  $('copy-note').textContent = !report.success ? 'Isi semua reading atau gunakan - untuk data yang tidak tersedia.' : report.issues.length ? 'Catatan pemeriksaan ikut disalin dalam laporan. Sel worksheet yang tidak tersedia ditulis -.' : 'Laporan gabungan tersedia jika periode kedua pabrik sama.';
  filterTable();
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Berhasil disalin.'); }
  catch {
    $('report-preview').value=text; $('report-preview').focus(); $('report-preview').select();
    toast('Izin clipboard tidak tersedia. Tekan Ctrl+C atau salin teks yang dipilih.');
  }
}
async function syncTime() {
  if (clock.pending) return;
  lastSyncAttempt=performance.now();
  $('clock-status').textContent='Menyinkronkan waktu...'; $('sync-clock').disabled=true;
  const ok = await clock.sync();
  $('sync-clock').disabled=false;
  if (ok && !clockDefaultsApplied) {
    clockDefaultsApplied=true;
    const end=wibDate(clock.now());
    for (const key of ['JRE','UNILAND']) {
      const draft=drafts[key];
      if (!draft.startDate && !draft.endDate && !draft.rows.some(r=>[...r.start,...r.end].some(Boolean))) {
        draft.startDate=shiftDate(end,-1); draft.endDate=end;
      }
    }
    $('start-date').value=current().startDate; $('end-date').value=current().endDate; renderResults();
  }
  renderClock();
}
function renderClock() {
  $('clock-time').textContent=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(clock.now()));
  $('clock-dot').classList.toggle('synced',clock.synchronized);
  if (!clock.pending) {
    $('clock-status').textContent = clock.synchronized ? 'NTP tersinkron' : clock.anchor ? 'Sinkronisasi perlu diperbarui' : 'Jam perangkat · NTP belum terhubung';
    $('sync-clock').title = clock.synchronized ? `Sumber: ${clock.anchor.source}. Perkiraan ketidakpastian ±${Math.ceil(clock.anchor.uncertaintyMs)} ms. Klik untuk sinkron ulang.` : 'Klik untuk mencoba sinkronisasi NTP lagi.';
  }
}

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) { drafts=restoreDrafts(raw); $('save-status').textContent='Draft tersimpan dimuat'; }
} catch { toast('Draft tidak dapat dimuat. Data yang tersimpan belum diubah.'); }
mountPlant(); renderClock(); void syncTime();
document.querySelectorAll('[data-plant]').forEach(button => button.addEventListener('click', () => {
  plant=button.dataset.plant; $('search-meter').value=''; showValidation=false; mountPlant();
}));
for (const [id, field] of [['start-date','startDate'],['end-date','endDate']]) {
  $(id).addEventListener('change', () => { current()[field]=$(id).value; changed(); });
}
$('use-today').addEventListener('click', async () => {
  if (!clock.synchronized) await syncTime();
  if (!clock.synchronized) { toast('NTP belum terhubung. Isi tanggal reading secara manual.'); return; }
  rememberUndo(); current().endDate=wibDate(clock.now()); current().startDate=shiftDate(current().endDate,-1); mountPlant(); changed();
});
$('sync-clock').addEventListener('click',syncTime);
setInterval(() => {
  if (document.hidden) return;
  renderClock();
  if (performance.now()-lastSyncAttempt > (clock.synchronized ? 300000 : 60000)) void syncTime();
},1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncTime(); });
window.addEventListener('online',() => { void syncTime(); });
window.addEventListener('offline',() => { clock.lastAttemptFailed=true; renderClock(); });
$('search-meter').addEventListener('input',filterTable); $('only-incomplete').addEventListener('change',filterTable);
$('report-view').addEventListener('change',renderResults);
$('check-data').addEventListener('click',() => { showValidation=!showValidation; renderResults(); });
$('copy-report').addEventListener('click',() => { if (!$('copy-report').disabled) void copyText($('report-preview').value); });
$('copy-combined').addEventListener('click',() => { try { void copyText(generateFullIndonesiaReport(reports.JRE,reports.UNILAND)); } catch(error) { toast(error.message); } });
$('copy-worksheet').addEventListener('click',() => { if (reports[plant].success) void copyText(worksheetRowToTSV(reports[plant].worksheet)); });
$('save-draft').addEventListener('click',() => {
  try {
    localStorage.setItem(STORAGE_KEY,JSON.stringify({version:4,drafts})); dirty=false;
    $('save-status').textContent='Draft disimpan di browser ini'; toast('Draft kedua pabrik disimpan di browser ini.');
  } catch { toast('Penyimpanan browser tidak tersedia atau penuh. Draft belum tersimpan.'); }
});
$('forget-draft').addEventListener('click',() => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    for (const key of ['JRE','UNILAND']) localStorage.removeItem(`midea_energy_baseline_${key}_v3`);
    dirty=true; $('save-status').textContent='Draft tersimpan dihapus'; toast('Draft tersimpan dihapus. Reading yang sedang dibuka tetap tersedia.');
  } catch { toast('Draft tersimpan tidak dapat dihapus.'); }
});
$('next-day').addEventListener('click',() => {
  try { const next=nextDayDraft(current()); rememberUndo(); drafts[plant]=next; mountPlant(); changed(); toast('Reading akhir menjadi reading awal. Isi kolom akhir untuk hari berikutnya.'); }
  catch(error) { toast(error.message); }
});
$('load-example').addEventListener('click',() => { rememberUndo(); drafts[plant]=exampleDraft(plant); current().isExample=true; mountPlant(); changed(); toast('Data contoh diisi. Gunakan Batalkan perubahan untuk kembali.'); });
$('clear-plant').addEventListener('click',() => { rememberUndo(); drafts[plant]=createDraft(plant,current().startDate,current().endDate); mountPlant(); changed(); toast(`Reading ${plant} dikosongkan. Perubahan masih bisa dibatalkan.`); });
$('undo-change').addEventListener('click',() => { if (!undo) return; plant=undo.plant; drafts[plant]=undo.draft; undo=null; $('undo-change').hidden=true; mountPlant(); changed(); });
$('open-import').addEventListener('click',() => { $('import-feedback').textContent=''; $('import-dialog').showModal(); });
$('apply-import').addEventListener('click',() => {
  const parsed=parseReading($('import-text').value,plant);
  $('import-feedback').textContent=parsed.issues.map(i=>i.message).join('\n');
  if (!parsed.success) return;
  rememberUndo(); const side=$('import-side').value;
  parsed.values.forEach((values,ri)=>{ current().rows[ri][side]=values; });
  current()[side === 'start' ? 'startDate' : 'endDate']=parsed.date;
  current().importIssues=[...(current().importIssues || []),...parsed.issues];
  current().isExample=false; mountPlant(); changed(); $('import-dialog').close();
  toast(parsed.issues.length ? 'Reading diimpor. Periksa catatan ratio pada hasil.' : 'Reading berhasil diimpor ke tabel.');
});
window.addEventListener('beforeunload',event => { if (dirty) { event.preventDefault(); event.returnValue=''; } });
document.addEventListener('keydown',event => {
  if ((event.ctrlKey || event.metaKey) && event.key==='s') { event.preventDefault(); $('save-draft').click(); }
  if ((event.ctrlKey || event.metaKey) && event.key==='Enter') { event.preventDefault(); showValidation=true; renderResults(); $('check-data').scrollIntoView({block:'center'}); }
});
