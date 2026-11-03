import { normalizeName, round, formatNumber } from './numbers.js';

function numericRowValue(rowsByName, name) {
  const row = rowsByName.get(normalizeName(name));
  return row && !row.missing && Number.isFinite(row.totalEnergy) ? row.totalEnergy : null;
}

export function buildWorksheet(plantKey, reportDate, rows) {
  // Retain the first matching row, including missing/zero values, as the legacy lookup did.
  const rowsByName = new Map();
  for (const row of rows) {
    const name = normalizeName(row.name);
    if (!rowsByName.has(name)) rowsByName.set(name, row);
  }
  const value = (name) => numericRowValue(rowsByName, name);
  const day = reportDate || '';
  if (plantKey === 'JRE') {
    const p1 = value('Piping Building 1#');
    const p3 = value('Piping Building 3#');
    const pipingAll = p1 !== null && p3 !== null ? round(p1 + p3, 8) : null;
    const headers = [
      'Date',
      'Indoor',
      'Outdoor',
      'Window',
      'Dehumidifier',
      'Heat Exchanger',
      'Piping All',
      'Piping #1',
      'Piping #3',
      'Injection',
      'Crusher',
      'Cooling',
      'Structural',
      'Control Room',
      'IQC & OQC',
      'New Lab',
      'Warehouse',
      'Charger Fork',
      'Office',
    ];
    const values = [
      day,
      value('Indoor'),
      value('Outdoor'),
      value('Window'),
      value('Dehumidifier'),
      value('Heat Exchanger'),
      pipingAll,
      p1,
      p3,
      value('Injection Molding'),
      value('Crusher Machine'),
      value('Cooling Tower and Water Pump Injection Molding'),
      value('Structural Laboratory'),
      value('Test Control Room'),
      value('IQC and OQC Room'),
      value('New Laboratory'),
      value('Warehouse Area'),
      value('Charging Forklift Building 3#'),
      value('All Office Building'),
    ];
    return { headers, values, derived: { pipingAll } };
  }

  const indoor = value('Indoor');
  const heatExchanger = value('Heat Exchanger');
  const piping = value('Piping');
  const heatAndPiping =
    heatExchanger !== null && piping !== null ? round(heatExchanger + piping, 8) : null;
  const vacIn = value('Vacum box indoor');
  const outdoor = value('Outdoor');
  const vacOut = value('Vacum box outdoor');
  const lineComp = value('Line compressor outdoor');
  const indoorArea = indoor !== null && vacIn !== null ? round(indoor + vacIn, 8) : null;
  const outdoorArea =
    outdoor !== null && vacOut !== null && lineComp !== null
      ? round(outdoor + vacOut + lineComp, 8)
      : null;

  const headers = [
    'Indoor Area',
    'Outdoor Area',
    'Indoor',
    'Outdoor',
    'HE & Piping',
    'Vacuum Box Indoor',
    'Vacuum Box Outdoor',
    'Outdoor Line Compressor Area',
    'Machine Stamping',
    'Injection Molding',
    'PCB Trial Line',
    '10HP Enthalpy Lab',
    '20HP Climate Chamber',
    'OQC Testing Room B',
    'IQC Testing Room B',
    'Charger Forklift Area',
  ];
  const values = [
    indoorArea,
    outdoorArea,
    indoor,
    outdoor,
    heatAndPiping,
    vacIn,
    vacOut,
    lineComp,
    value('Machine Stamping'),
    value('Injection Molding'),
    value('Line PCB Trial Product'),
    value('10HP Enthalpy Difference Lab'),
    value('20HP Test chamber Lab'),
    value('OQC- Testing Room B'),
    value('IQC- Testing Room B'),
    value('Charger Forklift Area'),
  ];
  return { headers, values, derived: { indoorArea, outdoorArea } };
}

function formatWorksheetCell(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (Math.abs(value) < 1e-9) return '0';
  return formatNumber(value, 8);
}

export function worksheetRowToTSV(worksheet) {
  return worksheet.values.map(formatWorksheetCell).join('\t');
}

export function worksheetPreview(worksheet) {
  return worksheet.headers
    .map((header, i) => `${header}: ${formatWorksheetCell(worksheet.values[i])}`)
    .join('\n');
}
