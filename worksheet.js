import { normalizeName, round, formatNumber } from './numbers.js';

function getRowByName(rows, name) {
  const target = normalizeName(name);
  return rows.find((row) => normalizeName(row.name) === target) || null;
}

function numericRowValue(rows, name) {
  const row = getRowByName(rows, name);
  return row && !row.missing && Number.isFinite(row.totalEnergy) ? row.totalEnergy : null;
}

export function buildWorksheet(plantKey, reportDate, rows) {
  const day = reportDate || '';
  if (plantKey === 'JRE') {
    const p1 = numericRowValue(rows, 'Piping Building 1#');
    const p3 = numericRowValue(rows, 'Piping Building 3#');
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
      numericRowValue(rows, 'Indoor'),
      numericRowValue(rows, 'Outdoor'),
      numericRowValue(rows, 'Window'),
      numericRowValue(rows, 'Dehumidifier'),
      numericRowValue(rows, 'Heat Exchanger'),
      pipingAll,
      p1,
      p3,
      numericRowValue(rows, 'Injection Molding'),
      numericRowValue(rows, 'Crusher Machine'),
      numericRowValue(rows, 'Cooling Tower and Water Pump Injection Molding'),
      numericRowValue(rows, 'Structural Laboratory'),
      numericRowValue(rows, 'Test Control Room'),
      numericRowValue(rows, 'IQC and OQC Room'),
      numericRowValue(rows, 'New Laboratory'),
      numericRowValue(rows, 'Warehouse Area'),
      numericRowValue(rows, 'Charging Forklift Building 3#'),
      numericRowValue(rows, 'All Office Building'),
    ];
    return { headers, values, derived: { pipingAll } };
  }

  const indoor = numericRowValue(rows, 'Indoor');
  const vacIn = numericRowValue(rows, 'Vacum box indoor');
  const outdoor = numericRowValue(rows, 'Outdoor');
  const vacOut = numericRowValue(rows, 'Vacum box outdoor');
  const lineComp = numericRowValue(rows, 'Line compressor outdoor');
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
    numericRowValue(rows, 'Heat Exchanger'),
    vacIn,
    vacOut,
    lineComp,
    numericRowValue(rows, 'Machine Stamping'),
    numericRowValue(rows, 'Injection Molding'),
    numericRowValue(rows, 'Line PCB Trial Product'),
    numericRowValue(rows, '10HP Enthalpy Difference Lab'),
    numericRowValue(rows, '20HP Test chamber Lab'),
    numericRowValue(rows, 'OQC- Testing Room B'),
    numericRowValue(rows, 'IQC- Testing Room B'),
    numericRowValue(rows, 'Charger Forklift Area'),
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
