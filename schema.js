export const PLANT_SCHEMAS = {
  JRE: {
    key: 'JRE',
    name: 'JRE',
    reportPrefix: 'A',
    utilityPrefix: '-',
    rows: [
      { name: 'Total', unit: 'kWh', isTotal: true },
      { name: 'Indoor', unit: 'kWh', factors: [250, 40] },
      { name: 'Outdoor', unit: 'kWh', factors: [1, 40] },
      {
        name: 'Window',
        unit: 'kWh',
        factors: [1, 90, 90, 40, 40, 40],
        meterNames: ['Meter 1', 'Meter 2', 'Meter 3', 'Meter 4', 'Meter 5', 'Vacuum Box'],
      },
      {
        name: 'Dehumidifier',
        unit: 'kWh',
        factors: [1, 40],
        meterNames: ['Dehumidifier', 'Vacuum Box'],
      },
      { name: 'Heat Exchanger', unit: 'kWh', factors: [40, 1, 1, 1] },
      { name: 'Injection Molding', unit: 'kWh', factors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
      { name: 'Crusher Machine', unit: 'kWh' },
      { name: 'Cooling Tower and Water Pump Injection Molding', unit: 'kWh', factors: [1, 1] },
      {
        name: 'Electricity Building 3#',
        unit: 'kWh',
        deductMeters: [
          { name: 'Dehumidifier', meter: 1 },
          { name: 'Piping Building 3#', meter: 0 },
        ],
      },
      { name: 'Nitrogen and Refrigerant Station', unit: 'kWh' },
      { name: 'Air Compressor 1#', unit: 'kWh', factors: [40], allowInactive: true },
      { name: 'New Air Compressor 1#', unit: 'kWh' },
      { name: 'New Air Compressor 2#', unit: 'kWh', allowInactive: true },
      { name: 'Dryer and Cooling Tower New Air Compressor', unit: 'kWh', factors: [1, 1] },
      {
        name: 'Piping Building 1#',
        unit: 'kWh',
        factors: [40, 1, 1],
        netMeter: 2,
        deductMeters: [{ name: 'Window', meter: 5 }],
      },
      { name: 'Piping Building 3#', unit: 'kWh', factors: [40] },
      { name: 'All Office Building', unit: 'kWh', factors: [1000] },
      {
        name: 'Electricity Building 2#',
        unit: 'kWh',
        deductMeters: [
          { name: 'Heat Exchanger', meter: 0 },
          { name: 'Heat Exchanger', meter: 1 },
          { name: 'Heat Exchanger', meter: 2 },
          { name: 'Heat Exchanger', meter: 3 },
          { name: 'Outdoor', meter: 1 },
          { name: 'Window', meter: 3 },
          { name: 'Window', meter: 4 },
          { name: 'Indoor', meter: 1 },
          { name: 'Nitrogen and Refrigerant Station', meter: 0 },
        ],
      },
      {
        name: 'Structural Laboratory',
        unit: 'kWh',
        floorNetAtZero: true,
        deductMeters: [{ name: 'Piping Building 1#', meter: 0 }],
      },
      { name: 'Test Control Room', unit: 'kWh', factors: [1, 1] },
      { name: 'IQC and OQC Room', unit: 'kWh' },
      { name: 'New Laboratory', unit: 'kWh' },
      { name: 'Crane Hoist Building 3#', unit: 'kWh' },
      { name: 'Charging Forklift Building 3#', unit: 'kWh' },
      { name: 'Warehouse Area', unit: 'kWh', factors: [40] },
      { name: 'Server Room', unit: 'kWh', factors: [1, 1] },
      { name: 'Utility Area', unit: 'kWh', factors: [1000, 40] },
      { name: 'Heater LPG', unit: 'kWh', factors: [40] },
      { name: 'Area Repair Injection Molding', unit: 'kWh' },
    ],
  },
  UNILAND: {
    key: 'UNILAND',
    name: 'UNILAND',
    reportPrefix: 'B',
    utilityPrefix: '*',
    rows: [
      { name: 'Total', unit: 'MWh', factors: [3.2], ratioLabel: '3200/1000', isTotal: true },
      { name: 'Trafo 1', displayName: 'Trafo 1 ', unit: 'MWh', optionalImport: true },
      { name: 'Trafo 2', displayName: 'Trafo 2 ', unit: 'MWh', optionalImport: true },
      { name: 'Trafo 3', displayName: 'Trafo 3 ', unit: 'Mwh', optionalImport: true },
      {
        name: 'Building A',
        displayName: 'Building A ',
        unit: 'MWh',
        factors: [0.16, 0.16, 0.16],
        ratioLabel: '160/1000',
      },
      {
        name: 'Building B',
        displayName: 'Building B ',
        unit: 'MWh',
        factors: [0.08, 0.08, 0.08],
        ratioLabel: '80/1000',
      },
      {
        name: 'PP hydrant',
        displayName: 'PP hydrant ',
        unit: 'MWh',
        factors: [0.16, 0.16, 0.16],
        ratioLabel: '160/1000',
      },
      {
        name: 'SDP pompa',
        displayName: 'SDP pompa ',
        unit: 'MWh',
        factors: [0.02, 0.02, 0.02],
        ratioLabel: '20/1000',
      },
      {
        name: 'Dp power house',
        displayName: 'Dp power house ',
        unit: 'MWh',
        factors: [0.02, 0.02, 0.02],
        ratioLabel: '20/1000',
      },
      { name: 'Indoor', unit: 'kWh' },
      { name: 'Outdoor', unit: 'kWh' },
      { name: 'Heat Exchanger', unit: 'kWh', factors: [1, 1, 1] },
      { name: 'Energy Area', unit: 'kWh' },
      { name: 'Line PCB Trial Product', unit: 'kWh' },
      { name: 'Vacum box indoor', unit: 'kWh', aliases: ['Vacuum box indoor'] },
      { name: 'Vacum box outdoor', unit: 'kWh', aliases: ['Vacuum box outdoor'] },
      { name: 'Compressor 1#', unit: 'kWh' },
      { name: 'Compressor 2#', unit: 'kWh' },
      { name: 'Line compressor outdoor', unit: 'kWh' },
      { name: 'Injection Molding', unit: 'kWh' },
      { name: 'Nitrogen Area', unit: 'kWh' },
      { name: '10HP Enthalpy Difference Lab', unit: 'kWh' },
      { name: '20HP Test chamber Lab', unit: 'kWh' },
      { name: 'Machine Stamping', unit: 'kWh' },
      { name: 'OQC- Testing Room B', unit: 'kWh', aliases: ['OQC Testing Room B'] },
      { name: 'IQC- Testing Room B', unit: 'kWh', aliases: ['IQC Testing Room B'] },
      { name: 'Charger Forklift Area', unit: 'kWh' },
      {
        name: 'Refrigant and LPG area',
        displayName: 'Refrigant and LPG area  ',
        unit: 'KWh',
        factors: [40],
        ratioLabel: '40',
        aliases: ['Refrigerant and LPG area', 'Refrigerant & LPG', 'Refrigant & LPG'],
      },
    ],
  },
};

// Stable identities preserve saved graph selections and editable legacy drafts.
PLANT_SCHEMAS.UNILAND.rows.forEach((row, i) => {
  row.legacyIndex = i;
});
PLANT_SCHEMAS.UNILAND.rows.splice(12, 0, {
  name: 'Piping',
  unit: 'kWh',
  factors: [40, 1, 1],
  legacyIndex: 28,
});
PLANT_SCHEMAS.UNILAND.rows.splice(15, 0, {
  name: 'New Office Building A',
  unit: 'kWh',
  legacyIndex: 29,
});

PLANT_SCHEMAS.UNILAND.rows.forEach((row, i) => {
  row.previousNo = String(i + 1);
});
PLANT_SCHEMAS.UNILAND.rows.splice(24, 0, {
  name: '10HP Enthalpy Difference Lab (2)',
  unit: 'kWh',
  legacyIndex: 30,
});
// Layout-3 numbers remain aliases for immutable reports and editable drafts.
PLANT_SCHEMAS.UNILAND.rows.forEach((row, i) => {
  row.layout3No = String(i + 1);
});
for (const [name, before, legacyIndex] of [
  ['SV window', 'Injection Molding', 31],
  ['Painting', 'Machine Stamping', 32],
  ['Dryer', 'Machine Stamping', 33],
]) {
  const index = PLANT_SCHEMAS.UNILAND.rows.findIndex((row) => row.name === before);
  PLANT_SCHEMAS.UNILAND.rows.splice(index, 0, { name, unit: 'kWh', legacyIndex });
}
for (const schema of Object.values(PLANT_SCHEMAS)) {
  schema.rows.forEach((row, i) => {
    row.no = String(i + 1);
    row.factors ??= [1];
    Object.freeze(row.factors);
    if (row.meterNames) Object.freeze(row.meterNames);
    if (row.deductMeters) {
      row.deductMeters.forEach(Object.freeze);
      Object.freeze(row.deductMeters);
    }
    Object.freeze(row);
  });
  Object.freeze(schema.rows);
  Object.freeze(schema);
}
Object.freeze(PLANT_SCHEMAS);

export const UTILITIES = {
  JRE: [
    ['LPG', 'Kg'],
    ['Oxygen', 'Kg'],
    ['Nitrogen', 'Kg'],
    ['Refrigerant R32', 'Kg'],
    ['Water', 'm³'],
  ],
  UNILAND: [
    ['LPG', 'Nm3'],
    ['Air Compressor', 'Nm3'],
    ['Oxygen', 'mmWc'],
    ['Nitrogen', 'mmH2O'],
    ['Water', 'm³'],
    ['R32', ''],
    ['R454B', ''],
  ],
};
