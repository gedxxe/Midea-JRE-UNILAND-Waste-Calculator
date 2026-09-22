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
      { name: 'Window', unit: 'kWh', factors: [1, 90, 90, 40, 40] },
      { name: 'Dehumidifier', unit: 'kWh' },
      { name: 'Heat Exchanger', unit: 'kWh', factors: [40, 1, 1, 1] },
      { name: 'Injection Molding', unit: 'kWh', factors: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
      { name: 'Crusher Machine', unit: 'kWh' },
      { name: 'Cooling Tower and Water Pump Injection Molding', unit: 'kWh', factors: [1, 1] },
      { name: 'Electricity Building 3#', unit: 'kWh' },
      { name: 'Nitrogen and Refrigerant Station', unit: 'kWh' },
      { name: 'Air Compressor 1#', unit: 'kWh', allowInactive: true },
      { name: 'New Air Compressor 1#', unit: 'kWh' },
      { name: 'New Air Compressor 2#', unit: 'kWh', allowInactive: true },
      { name: 'Dryer and Cooling Tower New Air Compressor', unit: 'kWh', factors: [1, 1] },
      { name: 'Piping Building 1#', unit: 'kWh', factors: [40] },
      { name: 'Piping Building 3#', unit: 'kWh' },
      { name: 'All Office Building', unit: 'kWh', factors: [1000] },
      { name: 'Electricity Building 2#', unit: 'kWh' },
      { name: 'Structural Laboratory', unit: 'kWh' },
      { name: 'Test Control Room', unit: 'kWh', factors: [1, 1] },
      { name: 'IQC and OQC Room', unit: 'kWh' },
      { name: 'New Laboratory', unit: 'kWh' },
      { name: 'Crane Hoist Building 3#', unit: 'kWh' },
      { name: 'Charging Forklift Building 3#', unit: 'kWh' },
      { name: 'Warehouse Area', unit: 'kWh', factors: [40, 1, 1] },
      { name: 'Server Room', unit: 'kWh', factors: [1, 1] },
      { name: 'Utility Area', unit: 'kWh', factors: [1000, 40] },
      { name: 'Heater LPG', unit: 'kWh', factors: [40] },
    ],
  },
  UNILAND: {
    key: 'UNILAND',
    name: 'UNILAND',
    reportPrefix: 'B',
    utilityPrefix: '*',
    rows: [
      { name: 'Total', unit: 'MWh', factors: [3.2], ratioLabel: '3200/1000', isTotal: true },
      { name: 'Trafo 1', displayName: 'Trafo 1 ', unit: 'MWh' },
      { name: 'Trafo 2', displayName: 'Trafo 2 ', unit: 'MWh' },
      { name: 'Trafo 3', displayName: 'Trafo 3 ', unit: 'Mwh' },
      {
        name: 'Building A',
        displayName: 'Building A ',
        unit: 'MWh',
        factors: [0.16],
        ratioLabel: '160/1000',
      },
      {
        name: 'Building B',
        displayName: 'Building B ',
        unit: 'MWh',
        factors: [0.08],
        ratioLabel: '80/1000',
      },
      {
        name: 'PP hydrant',
        displayName: 'PP hydrant ',
        unit: 'MWh',
        factors: [0.16],
        ratioLabel: '160/1000',
      },
      {
        name: 'SDP pompa',
        displayName: 'SDP pompa ',
        unit: 'MWh',
        factors: [0.02],
        ratioLabel: '20/1000',
      },
      {
        name: 'Dp power house',
        displayName: 'Dp power house ',
        unit: 'MWh',
        factors: [0.02],
        ratioLabel: '20/1000',
      },
      { name: 'Indoor', unit: 'kWh' },
      { name: 'Outdoor', unit: 'kWh' },
      { name: 'Heat Exchanger', unit: 'kWh' },
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

for (const schema of Object.values(PLANT_SCHEMAS)) {
  schema.rows.forEach((row, i) => {
    row.no = String(i + 1);
    row.factors ??= [1];
    Object.freeze(row.factors);
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
