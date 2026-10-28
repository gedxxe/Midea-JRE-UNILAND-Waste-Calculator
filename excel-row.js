import { decimalText, formatNumber, scaledReading } from './numbers.js';
import { GASES, gasMassText } from './gas.js';

const row = (column, name, unit = 'kWh') => ({ column, name, unit, source: 'row' });
const blank = (column, name, source = 'unmapped') => ({ column, name, source });
const utility = (column, name, unit, index, gas) => ({
  column,
  name,
  unit,
  index,
  gas,
  source: 'utility',
});

// Column positions from Daily Monitoring, header row 3. Keep every slot, including separators.
export const EXCEL_LAYOUTS = {
  JRE: {
    start: 'E',
    end: 'AY',
    separator: 'AP',
    columns: [
      ...['T1', 'T2', 'T3', 'T4'].map((name, index) => ({
        column: String.fromCharCode(69 + index),
        name,
        unit: 'kWh',
        source: 'additional',
        index,
      })),
      { column: 'I', name: 'Sub-meter minus main meter', unit: 'kWh', source: 'gapKWh' },
      { column: 'J', name: 'Sub-meter total', unit: 'kWh', source: 'subAreasSumKWh' },
      row('K', 'Indoor'),
      row('L', 'Outdoor'),
      row('M', 'Window'),
      row('N', 'Dehumidifier'),
      row('O', 'Heat Exchanger'),
      row('P', 'Piping Building 1#'),
      row('Q', 'Piping Building 3#'),
      row('R', 'Injection Molding'),
      row('S', 'Crusher Machine'),
      row('T', 'Cooling Tower and Water Pump Injection Molding'),
      row('U', 'Area Repair Injection Molding'),
      row('V', 'Electricity Building 3#'),
      row('W', 'Nitrogen and Refrigerant Station'),
      row('X', 'New Air Compressor 1#'),
      row('Y', 'New Air Compressor 2#'),
      row('Z', 'Dryer and Cooling Tower New Air Compressor'),
      row('AA', 'Air Compressor 1#'),
      row('AB', 'Structural Laboratory'),
      row('AC', 'Test Control Room'),
      row('AD', 'IQC and OQC Room'),
      row('AE', 'New Laboratory'),
      row('AF', 'Crane Hoist Building 3#'),
      row('AG', 'Charging Forklift Building 3#'),
      row('AH', 'Electricity Building 2#'),
      row('AI', 'Charging Forklift Building 2'),
      row('AJ', 'All Office Building'),
      row('AK', 'Warehouse Area'),
      row('AL', 'Warehouse Lighting'),
      row('AM', 'Server Room'),
      row('AN', 'Utility Area'),
      row('AO', 'Heater LPG'),
      blank('AP', '', 'separator'),
      utility('AQ', 'LPG', 'kg', 0, 'LPG'),
      utility('AR', 'Oxygen', 'kg', 1, 'O2'),
      utility('AS', 'Nitrogen', 'kg', 2, 'N2'),
      utility('AT', 'Refrigerant R32', 'kg', 3, 'R32'),
      blank('AU', 'Helium Indoor'),
      blank('AV', 'Helium Outdoor'),
      blank('AW', 'Helium Dehumidifier'),
      blank('AX', 'Helium Window'),
      { column: 'AY', name: 'Clean Water Total', unit: 'm³', source: 'water', index: 4 },
    ],
  },
  UNILAND: {
    start: 'BE',
    end: 'CV',
    separator: 'CO',
    columns: [
      row('BE', 'Indoor'),
      blank('BF', 'Jaringan Indoor'),
      row('BG', 'Outdoor'),
      row('BH', 'Heat Exchanger'),
      row('BI', 'Building A', 'MWh'),
      blank('BJ', 'DP External A'),
      row('BK', 'Building B', 'MWh'),
      row('BL', 'PP hydrant', 'MWh'),
      row('BM', 'SDP pompa', 'MWh'),
      row('BN', 'Dp power house', 'MWh'),
      blank('BO', 'Server Room'),
      row('BP', 'Trafo 1', 'MWh'),
      row('BQ', 'Trafo 2', 'MWh'),
      row('BR', 'Trafo 3', 'MWh'),
      row('BS', 'Piping'),
      row('BT', 'Energy Area'),
      row('BU', 'New Office Building A'),
      row('BV', 'Line PCB Trial Product'),
      row('BW', 'Vacum box indoor'),
      row('BX', 'Vacum box outdoor'),
      row('BY', 'Compressor 1#'),
      row('BZ', 'Compressor 2#'),
      row('CA', 'Line compressor outdoor'),
      row('CB', 'SV window'),
      row('CC', 'Injection Molding'),
      row('CD', 'Nitrogen Area'),
      row('CE', 'Refrigant and LPG area'),
      row('CF', '10HP Enthalpy Difference Lab'),
      row('CG', '20HP Test chamber Lab'),
      row('CH', 'Painting'),
      row('CI', 'Dryer'),
      blank('CJ', 'Spot Welding Machine'),
      row('CK', 'Machine Stamping'),
      row('CL', 'OQC- Testing Room B'),
      row('CM', 'IQC- Testing Room B'),
      row('CN', 'Charger Forklift Area'),
      blank('CO', '', 'separator'),
      utility('CP', 'Air Compressor', 'Nm³', 1),
      utility('CQ', 'Nitrogen', 'mmH2O', 3, 'N2'),
      utility('CR', 'Oxygen', 'mmWC', 2, 'O2'),
      utility('CS', 'LPG', 'Nm³ / %', 0, 'LPG'),
      { column: 'CT', name: 'Non-Production Water', unit: 'm³', source: 'water', index: 4 },
      utility('CU', 'R454B', 'mm', 6),
      utility('CV', 'R32', 'mm', 5, 'R32'),
    ],
  },
};
for (const layout of Object.values(EXCEL_LAYOUTS)) {
  layout.columns.forEach(Object.freeze);
  Object.freeze(layout.columns);
  Object.freeze(layout);
}
Object.freeze(EXCEL_LAYOUTS);

function number(value) {
  if (typeof value === 'string') value = value.trim();
  if (value === '' || value === undefined || value === null) return '';
  if (value === '-') return '-';
  if (typeof value === 'number') return Number.isFinite(value) ? formatNumber(value, 8) : '-';
  const normalized = decimalText(value);
  if (normalized === null) return '-';
  const [whole, fraction = ''] = normalized.split('.');
  const decimals = fraction.replace(/0+$/, '');
  return BigInt(whole).toString() + (decimals ? '.' + decimals : '');
}

function rawGasBalance(draft, id, result) {
  if (result.kg === null || result.errors.length || result.unavailable) return '-';
  const entry = draft.gas?.entries[GASES.findIndex((gas) => gas.id === id)];
  if (!entry) return '-';
  const start = scaledReading(entry.start.reading),
    end = scaledReading(entry.end.reading);
  if (start === null || end === null) return '-';
  let balance = start - end;
  for (const refill of entry.refills) {
    const before = scaledReading(refill.before.reading),
      after = scaledReading(refill.after.reading);
    if (before === null || after === null) return '-';
    balance += after - before;
  }
  return formatNumber(Number(balance) / 1e6, 6);
}

export function buildExcelRow(draft, report) {
  const layout = EXCEL_LAYOUTS[draft.plantKey];
  if (!layout || report.plantKey !== draft.plantKey) throw new RangeError('Unknown Excel layout');
  const notes = layout.columns
    .filter((c) => c.source === 'unmapped')
    .map((c) => ({ column: c.column, name: c.name, code: 'unmapped' }));
  const mapped = new Set(layout.columns.filter((c) => c.source === 'row').map((c) => c.name));
  for (const source of report.calculatedRows)
    if (!source.isTotal && source.name !== 'Total' && !mapped.has(source.name))
      notes.push({ name: source.name, code: 'unmappedRow' });
  const columns = layout.columns.map((column) =>
    column.column === 'CS'
      ? { ...column, unit: report.gasResults.some((gas) => gas.gas === 'LPG') ? '%' : 'Nm³' }
      : column,
  );
  const values = columns.map((column) => {
    if (column.source === 'separator' || column.source === 'unmapped') return '';
    if (column.source === 'row') {
      const found = report.calculatedRows.find((item) => item.name === column.name);
      if (found && String(found.unit).toLowerCase() !== column.unit.toLowerCase()) {
        notes.push({ column: column.column, name: column.name, code: 'unit' });
        return '-';
      }
      return found && !found.missing ? number(found.totalEnergy) : '-';
    }
    if (column.source === 'additional')
      return number(report.additionalReadings[column.index]?.value);
    if (column.source === 'water')
      return number(
        report.waterResult?.active
          ? report.waterResult.value
          : draft.utilities[column.index]?.value,
      );
    if (column.source === 'utility') {
      const gas = report.gasResults.find((item) => item.gas === column.gas);
      const value = gas
        ? draft.plantKey === 'UNILAND'
          ? rawGasBalance(draft, column.gas, gas)
          : gas.kg === null
            ? '-'
            : gasMassText(gas.kg)
        : number(draft.utilities[column.index]?.value);
      if (gas && value !== '-' && Number(value) < 0)
        notes.push({ column: column.column, name: column.name, code: 'stockIncrease' });
      return value;
    }
    return report[column.source] === null ? '-' : number(report[column.source]);
  });
  return { ...layout, columns, values, notes };
}

export function excelRowToTSV(row) {
  return row.values.join('\t');
}

export function excelRowPreview(row) {
  return row.columns
    .map(
      (column, index) =>
        column.column +
        ': ' +
        (column.source === 'separator' ? 'Separator' : column.name) +
        (column.unit ? ' (' + column.unit + ')' : '') +
        ' = ' +
        (column.source === 'gapKWh' && Number(row.values[index]) > 0 ? '+' : '') +
        row.values[index],
    )
    .join('\n');
}
