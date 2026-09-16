const PLANT_SCHEMAS = {
  JRE: {
    key: 'JRE',
    name: 'JRE',
    reportPrefix: 'A',
    hoursLabel: '24 HOURS',
    utilityPrefix: '-',
    rows: [
      { no: '1', name: 'Total', unit: 'kWh', isTotal: true },
      { no: '2', name: 'Indoor', unit: 'kWh', factors: [250, 40] },
      { no: '3', name: 'Outdoor', unit: 'kWh', factors: [1, 40] },
      { no: '4', name: 'Window', unit: 'kWh', factors: [1, 90, 90, 40, 40] },
      { no: '5', name: 'Dehumidifier', unit: 'kWh' },
      { no: '6', name: 'Heat Exchanger', unit: 'kWh', factors: [40, 1, 1, 1] },
      { no: '7', name: 'Injection Molding', unit: 'kWh' },
      { no: '8', name: 'Crusher Machine', unit: 'kWh' },
      { no: '9', name: 'Cooling Tower and Water Pump Injection Molding', unit: 'kWh' },
      { no: '10', name: 'Electricity Building 3#', unit: 'kWh' },
      { no: '11', name: 'Nitrogen and Refrigerant Station', unit: 'kWh' },
      { no: '12', name: 'Air Compressor 1#', unit: 'kWh', dashZeroWhenCounterpartZero: true },
      { no: '13', name: 'New Air Compressor 1#', unit: 'kWh' },
      { no: '14', name: 'New Air Compressor 2#', unit: 'kWh', dashZeroWhenCounterpartZero: true },
      { no: '15', name: 'Dryer and Cooling Tower New Air Compressor', unit: 'kWh' },
      { no: '16', name: 'Piping Building 1#', unit: 'kWh', factors: [40] },
      { no: '17', name: 'Piping Building 3#', unit: 'kWh' },
      { no: '18', name: 'All Office Building', unit: 'kWh' },
      { no: '19', name: 'Electricity Building 2#', unit: 'kWh' },
      { no: '20', name: 'Structural Laboratory', unit: 'kWh' },
      { no: '21', name: 'Test Control Room', unit: 'kWh' },
      { no: '22', name: 'IQC and OQC Room', unit: 'kWh' },
      { no: '23', name: 'New Laboratory', unit: 'kWh' },
      { no: '24', name: 'Crane Hoist Building 3#', unit: 'kWh' },
      { no: '25', name: 'Charging Forklift Building 3#', unit: 'kWh' },
      { no: '26', name: 'Warehouse Area', unit: 'kWh', factors: [40, 1, 1] },
      { no: '27', name: 'Server Room', unit: 'kWh' },
      { no: '28', name: 'Utility Area', unit: 'kWh', factors: [1, 40] },
      { no: '29', name: 'Heater LPG', unit: 'kWh', factors: [40] }
    ]
  },
  UNILAND: {
    key: 'UNILAND',
    name: 'UNILAND',
    reportPrefix: 'B',
    hoursLabel: '24 Hours',
    utilityPrefix: '*',
    rows: [
      { no: '1', name: 'Total', unit: 'MWh', factors: [3.2], ratioLabel: '3200/1000', isTotal: true },
      { no: '2', name: 'Trafo 1', displayName: 'Trafo 1 ', unit: 'MWh' },
      { no: '3', name: 'Trafo 2', displayName: 'Trafo 2 ', unit: 'MWh' },
      { no: '4', name: 'Trafo 3', displayName: 'Trafo 3 ', unit: 'Mwh' },
      { no: '5', name: 'Building A', displayName: 'Building A ', unit: 'MWh', factors: [0.16], ratioLabel: '160/1000' },
      { no: '6', name: 'Building B', displayName: 'Building B ', unit: 'MWh', factors: [0.08], ratioLabel: '80/1000' },
      { no: '7', name: 'PP hydrant', displayName: 'PP hydrant ', unit: 'MWh', factors: [0.16], ratioLabel: '160/1000' },
      { no: '8', name: 'SDP pompa', displayName: 'SDP pompa ', unit: 'MWh', factors: [0.02], ratioLabel: '20/1000' },
      { no: '9', name: 'Dp power house', displayName: 'Dp power house ', unit: 'MWh', factors: [0.02], ratioLabel: '20/1000' },
      { no: '10', name: 'Indoor', unit: 'kWh' },
      { no: '11', name: 'Outdoor', unit: 'kWh' },
      { no: '12', name: 'Heat Exchanger', unit: 'kWh' },
      { no: '13', name: 'Energy Area', unit: 'kWh' },
      { no: '14', name: 'Line PCB Trial Product', unit: 'kWh' },
      { no: '15', name: 'Vacum box indoor', unit: 'kWh', aliases: ['Vacuum box indoor'] },
      { no: '16', name: 'Vacum box outdoor', unit: 'kWh', aliases: ['Vacuum box outdoor'] },
      { no: '17', name: 'Compressor 1#', unit: 'kWh' },
      { no: '18', name: 'Compressor 2#', unit: 'kWh', afterNumber: '  ' },
      { no: '19', name: 'Line compressor outdoor', unit: 'kWh' },
      { no: '16', name: 'Injection Molding', unit: 'kWh' },
      { no: '17', name: 'Nitrogen Area', unit: 'kWh' },
      { no: '18', name: '10HP Enthalpy Difference Lab', unit: 'kWh' },
      { no: '19', name: '20HP Test chamber Lab', unit: 'kWh' },
      { no: '20', name: 'Machine Stamping', unit: 'kWh' },
      { no: '21', name: 'OQC- Testing Room B', unit: 'kWh', afterColon: '', aliases: ['OQC Testing Room B'] },
      { no: '23', name: 'IQC- Testing Room B', unit: 'kWh', aliases: ['IQC Testing Room B'] },
      { no: '24', name: 'Charger Forklift Area', unit: 'kWh' },
      { no: '25', name: 'Refrigant and LPG area', displayName: 'Refrigant and LPG area  ', unit: 'KWh', factors: [40], ratioLabel: '40', aliases: ['Refrigerant and LPG area', 'Refrigerant & LPG', 'Refrigant & LPG'] }
    ]
  }
};

const SAMPLE_DATASETS = {
  // Synthetic fixtures only. They exercise the real plant formulas without
  // publishing operational factory readings in a public repository.
  JRE: {
    date: '2026-09-16',
    yesterday: `15/09/2026
1. Total: 100000
2. Indoor: 10 (Ratio 250) + 20 (Ratio 40)
3. Outdoor: 5000 + 30 (Ratio 40)
4. Window: 10000 + 10 (Ratio 90) + 20 (Ratio 90) + 30 (Ratio 40) + 40 (Ratio 40)
5. Dehumidifier: 2000
6. Heat Exchanger: 5 (Ratio 40) + 3000 + 4000 + 5000
7. Injection Molding: 1000+2000+3000+4000+5000+6000+7000+8000+9000+10000+11000+12000+13000
8. Crusher Machine: 20000
9. Cooling Tower and Water Pump Injection Molding: 30000+40000
10. Electricity Building 3#: 50000
11. Nitrogen and Refrigerant Station: 60000
12. Air Compressor 1#: 0
13. New Air Compressor 1#: 70000
14. New Air Compressor 2#: 0
15. Dryer and Cooling Tower New Air Compressor: 80000+90000
16. Piping Building 1#: 50 (Ratio 40)
17. Piping Building 3#: 100000
18. All Office Building: 110000
19. Electricity Building 2#: 120000
20. Structural Laboratory: 130000
21. Test Control Room: 140000+150000
22. IQC and OQC Room: 160000
23. New Laboratory: 170000
24. Crane Hoist Building 3#: 180000
25. Charging Forklift Building 3#: 190000
26. Warehouse Area: 100 (Ratio 40)+1000+2000
27. Server Room: 200000+210000
28. Utility Area: 5000+10 (Ratio 40)
29. Heater LPG: 20 (Ratio 40)`,
    today: `16/09/2026
1. Total: 101000
2. Indoor: 10,2 (Ratio 250) + 20,5 (Ratio 40)
3. Outdoor: 5100 + 30,5 (Ratio 40)
4. Window: 10100 + 10,1 (Ratio 90) + 20,2 (Ratio 90) + 30,3 (Ratio 40) + 40,4 (Ratio 40)
5. Dehumidifier: 2040
6. Heat Exchanger: 5,5 (Ratio 40) + 3010 + 4020 + 5030
7. Injection Molding: 1010+2010+3010+4010+5010+6010+7010+8010+9010+10010+11010+12010+13010
8. Crusher Machine: 20025
9. Cooling Tower and Water Pump Injection Molding: 30015+40020
10. Electricity Building 3#: 50012
11. Nitrogen and Refrigerant Station: 60008
12. Air Compressor 1#: 0
13. New Air Compressor 1#: 70030
14. New Air Compressor 2#: 0
15. Dryer and Cooling Tower New Air Compressor: 80010+90005
16. Piping Building 1#: 50,25 (Ratio 40)
17. Piping Building 3#: 100005
18. All Office Building: 110020
19. Electricity Building 2#: 120022
20. Structural Laboratory: 130003
21. Test Control Room: 140008+150007
22. IQC and OQC Room: 160009
23. New Laboratory: 170011
24. Crane Hoist Building 3#: 180002
25. Charging Forklift Building 3#: 190004
26. Warehouse Area: 100,5 (Ratio 40)+1005+2003
27. Server Room: 200006+210004
28. Utility Area: 5007+10,2 (Ratio 40)
29. Heater LPG: 20,3 (Ratio 40)`,
    utilities: `- LPG: 100 Kg
- Oxygen: 200 Kg
- Nitrogen: 300 Kg
- Refrigerant R32: 400 Kg
- Water: 50 m³`
  },
  UNILAND: {
    date: '2026-09-12',
    yesterday: `11/09/2026
1. Total: 100 ((Ratio 3200)/1000)
2. Trafo 1 : -
3. Trafo 2 : -
4. Trafo 3 : -
5. Building A : 1000 ((Ratio 160)/1000)
6. Building B : 2000 ((Ratio 80)/1000)
7. PP hydrant : 100 ((Ratio 160)/1000)
8. SDP pompa : 500 ((Ratio 20)/1000)
9. Dp power house : 700 ((Ratio 20)/1000)
10. Indoor: 1000
11. Outdoor: 2000
12. Heat Exchanger: 3000
13. Energy Area: 4000
14. Line PCB Trial Product: 5000
15. Vacum box indoor: 6000
16. Vacum box outdoor: 7000
17. Compressor 1#: 8000
18. Compressor 2#: 9000
19. Line compressor outdoor: 10000
16. Injection Molding: 11000
17. Nitrogen Area: 12000
18. 10HP Enthalpy Difference Lab: 13000
19. 20HP Test chamber Lab: 14000
20. Machine Stamping: 15000
21. OQC- Testing Room B: 16000
23. IQC- Testing Room B: -
24. Charger Forklift Area: 17000
25. Refrigant and LPG area  : 10 (Ratio 40)`,
    today: `12/09/2026
1. Total: 101 ((Ratio 3200)/1000)
2. Trafo 1 : -
3. Trafo 2 : -
4. Trafo 3 : -
5. Building A : 1002 ((Ratio 160)/1000)
6. Building B : 2005 ((Ratio 80)/1000)
7. PP hydrant : 101 ((Ratio 160)/1000)
8. SDP pompa : 510 ((Ratio 20)/1000)
9. Dp power house : 705 ((Ratio 20)/1000)
10. Indoor: 1020
11. Outdoor: 2030
12. Heat Exchanger: 3040
13. Energy Area: 4050
14. Line PCB Trial Product: 5060
15. Vacum box indoor: 6005
16. Vacum box outdoor: 7010
17. Compressor 1#: 8002
18. Compressor 2#: 9050
19. Line compressor outdoor: 10003
16. Injection Molding: 11070
17. Nitrogen Area: 12004
18. 10HP Enthalpy Difference Lab: 13000
19. 20HP Test chamber Lab: 14000
20. Machine Stamping: 15006
21. OQC- Testing Room B: 16001,5
23. IQC- Testing Room B: -
24. Charger Forklift Area: 17008
25. Refrigant and LPG area  : 10,5 (Ratio 40)`,
    utilities: `* LPG: 10 Nm3
* Air Compressor: 1000 Nm3
* Oxygen: 20 mmWc
* Nitrogen: 30 mmH2O
* Water: 40 m³
* R32: 50
* R454B: 60`
  }
};

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[\s\-_]+/g, ' ')
    .replace(/\s+#/g, '#')
    .trim();
}

function parseFlexibleNumber(raw) {
  const text = String(raw ?? '').trim().replace(/\s+/g, '');
  if (!text) return NaN;

  const sign = text.startsWith('-') ? '-' : text.startsWith('+') ? '+' : '';
  let body = sign ? text.slice(1) : text;
  if (!/^\d[\d.,]*$/.test(body)) return NaN;

  const commas = (body.match(/,/g) || []).length;
  const dots = (body.match(/\./g) || []).length;

  if (commas && dots) {
    const lastComma = body.lastIndexOf(',');
    const lastDot = body.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    body = body.split(thousandsSep).join('');
    body = body.replace(decimalSep, '.');
  } else if (commas) {
    if (commas > 1) {
      const groups = body.split(',');
      const looksThousands = groups.slice(1).every(g => g.length === 3);
      body = looksThousands ? groups.join('') : `${groups.slice(0, -1).join('')}.${groups.at(-1)}`;
    } else {
      // In daily plant logs a lone comma is treated as a decimal separator.
      // This matches Indonesian meter-entry habits such as 131,11 or 128128,0.
      body = body.replace(',', '.');
    }
  } else if (dots > 1) {
    const groups = body.split('.');
    const looksThousands = groups.slice(1).every(g => g.length === 3);
    body = looksThousands ? groups.join('') : `${groups.slice(0, -1).join('')}.${groups.at(-1)}`;
  }

  return Number(`${sign}${body}`);
}

function toIsoDate(day, month, year) {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;

  const candidate = new Date(Date.UTC(y, m - 1, d));
  if (
    candidate.getUTCFullYear() !== y ||
    candidate.getUTCMonth() !== m - 1 ||
    candidate.getUTCDate() !== d
  ) return null;

  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function extractDateFromText(text) {
  const source = String(text || '');
  const dmy = [...source.matchAll(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/g)];
  if (dmy.length) {
    const m = dmy.at(-1);
    return toIsoDate(m[1], m[2], m[3]);
  }

  const ymd = [...source.matchAll(/\b(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})\b/g)];
  if (ymd.length) {
    const m = ymd.at(-1);
    return toIsoDate(m[3], m[2], m[1]);
  }
  return null;
}

function isMetadataLine(line, beforeFirstArea) {
  if (!beforeFirstArea) return false;
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]20\d{2}\s*:?$/.test(line)) return true;
  if (/^20\d{2}[\/-]\d{1,2}[\/-]\d{1,2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(line)) return true;
  if (/^\[[^\]]+\].*:\s*\d{1,2}[\/-]\d{1,2}[\/-]20\d{2}\s*$/.test(line)) return true;
  if (!line.includes(':') && /^[\p{L} .'-]{2,80}$/u.test(line)) return true;
  return false;
}

function parseMeterTerm(term) {
  const trimmed = String(term || '').trim();
  if (trimmed === '-') return { missing: true, raw: trimmed };

  const valueMatch = trimmed.match(/^([+-]?\d[\d.,]*)/);
  if (!valueMatch) return { invalid: true, raw: trimmed };
  const value = parseFlexibleNumber(valueMatch[1]);
  if (!Number.isFinite(value)) return { invalid: true, raw: trimmed };

  const ratioMatch = trimmed.match(/ratio\s*[:=]?\s*([+-]?\d[\d.,]*)/i);
  let explicitFactor = null;
  let ratioNumerator = null;
  let ratioDivisor = 1;

  if (ratioMatch) {
    ratioNumerator = parseFlexibleNumber(ratioMatch[1]);
    const divisorMatch = trimmed.match(/\/\s*([+-]?\d[\d.,]*)/);
    if (divisorMatch) ratioDivisor = parseFlexibleNumber(divisorMatch[1]);
    if (Number.isFinite(ratioNumerator) && Number.isFinite(ratioDivisor) && ratioDivisor !== 0) {
      explicitFactor = ratioNumerator / ratioDivisor;
    }
  }

  return {
    raw: trimmed,
    missing: false,
    invalid: false,
    value,
    explicitFactor,
    ratioNumerator,
    ratioDivisor
  };
}

function schemaLookup(schema) {
  const map = new Map();
  schema.rows.forEach(row => {
    [row.name, ...(row.aliases || [])].forEach(alias => map.set(normalizeName(alias), row));
  });
  return map;
}

function parseInput(text, plantKey) {
  const schema = PLANT_SCHEMAS[plantKey];
  if (!schema) throw new Error(`Unknown plant: ${plantKey}`);

  const lookup = schemaLookup(schema);
  const areas = new Map();
  const utilities = [];
  const issues = [];
  const lines = String(text || '').split(/\r?\n/);
  let seenArea = false;

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;

    if (/^[*-]\s*[^:]+:\s*.+$/.test(line)) {
      utilities.push(line);
      return;
    }

    if (isMetadataLine(line, !seenArea)) return;

    const match = line.match(/^(?:#?\s*(\d+)(?:[.):-]|\s+)\s*)?([^:]+):\s*(.*)$/);
    if (!match) {
      issues.push({ level: 'ERROR', code: 'SYNTAX', message: `Line ${idx + 1}: cannot read "${line}".` });
      return;
    }

    const rowNo = match[1] || null;
    const rawName = match[2].trim();
    const expr = match[3].trim();
    const rowSchema = lookup.get(normalizeName(rawName));

    if (!rowSchema) {
      issues.push({ level: 'WARNING', code: 'UNKNOWN_AREA', message: `Line ${idx + 1}: "${rawName}" is not part of the ${plantKey} daily template and will be ignored.` });
      return;
    }

    seenArea = true;
    const key = normalizeName(rowSchema.name);
    if (areas.has(key)) {
      issues.push({ level: 'ERROR', code: 'DUPLICATE_AREA', message: `Line ${idx + 1}: "${rowSchema.name}" appears more than once.` });
      return;
    }

    if (expr === '-') {
      areas.set(key, { rowNo, rowSchema, rawName, missing: true, meters: [], rawLine: line });
      return;
    }

    const terms = expr.split(/\s*\+\s*/).filter(Boolean);
    if (!terms.length) {
      issues.push({ level: 'ERROR', code: 'EMPTY_READING', message: `Line ${idx + 1}: "${rowSchema.name}" has no reading.` });
      return;
    }

    const meters = terms.map(parseMeterTerm);
    const invalid = meters.find(m => m.invalid || m.missing);
    if (invalid) {
      issues.push({ level: 'ERROR', code: 'INVALID_READING', message: `Line ${idx + 1}: invalid reading in "${rowSchema.name}": ${invalid.raw}` });
      return;
    }

    areas.set(key, { rowNo, rowSchema, rawName, missing: false, meters, rawLine: line });
  });

  return {
    plantKey,
    date: extractDateFromText(text),
    areas,
    utilities,
    issues
  };
}

function round(value, digits = 6) {
  const p = 10 ** digits;
  return Math.round((value + Number.EPSILON) * p) / p;
}

function dayDiff(a, b) {
  if (!a || !b) return null;
  const da = new Date(`${a}T00:00:00Z`);
  const db = new Date(`${b}T00:00:00Z`);
  return Math.round((db - da) / 86400000);
}

function matchFactor(row, meterIndex, meter) {
  if (Array.isArray(row.factors) && row.factors[meterIndex] !== undefined) {
    return row.factors[meterIndex];
  }
  return 1;
}

function formatFactor(factor) {
  return Number.isInteger(factor) ? String(factor) : String(round(factor, 6));
}

function calculateRow(row, yArea, tArea, issues) {
  if (!yArea && !tArea) {
    issues.push({
      level: 'WARNING',
      code: 'MISSING_BOTH',
      message: `${row.name}: row is missing from both daily inputs. Use "-" explicitly when a meter is unavailable.`
    });
    return { ...row, missing: true, totalEnergy: null, meters: [] };
  }
  if (!yArea || !tArea) {
    issues.push({ level: 'WARNING', code: 'MISSING_DAY', message: `${row.name}: reading exists on only one of the two days.` });
    return { ...row, missing: true, totalEnergy: null, meters: [] };
  }
  if (yArea.missing && tArea.missing) {
    if (row.dashZeroWhenCounterpartZero) {
      return { ...row, missing: false, totalEnergy: 0, meters: [] };
    }
    return { ...row, missing: true, totalEnergy: null, meters: [] };
  }
  if (yArea.missing !== tArea.missing) {
    const present = yArea.missing ? tArea : yArea;
    const canTreatAsInactiveZero = row.dashZeroWhenCounterpartZero
      && present.meters.length === 1
      && Math.abs(present.meters[0].value) < 1e-9;
    if (canTreatAsInactiveZero) {
      return { ...row, missing: false, totalEnergy: 0, meters: [] };
    }
    issues.push({ level: 'WARNING', code: 'MISSING_DAY', message: `${row.name}: one day is "-" while the other day has a meter reading.` });
    return { ...row, missing: true, totalEnergy: null, meters: [] };
  }
  if (yArea.meters.length !== tArea.meters.length) {
    issues.push({ level: 'WARNING', code: 'METER_COUNT', message: `${row.name}: ${yArea.meters.length} meter term(s) yesterday vs ${tArea.meters.length} today.` });
    return { ...row, missing: true, totalEnergy: null, meters: [] };
  }

  if (Array.isArray(row.factors) && row.factors.length !== tArea.meters.length) {
    issues.push({ level: 'ERROR', code: 'TEMPLATE_METER_COUNT', message: `${row.name}: expected ${row.factors.length} meter term(s), received ${tArea.meters.length}.` });
    return { ...row, missing: true, totalEnergy: null, meters: [] };
  }

  let totalEnergy = 0;
  const meters = [];

  for (let i = 0; i < tArea.meters.length; i += 1) {
    const ym = yArea.meters[i];
    const tm = tArea.meters[i];
    const factor = matchFactor(row, i, tm);

    for (const [dayLabel, meter] of [['Yesterday', ym], ['Today', tm]]) {
      if (meter.explicitFactor !== null && Math.abs(meter.explicitFactor - factor) > 1e-9) {
        issues.push({
          level: 'WARNING',
          code: 'RATIO_MISMATCH',
          message: `${row.name} meter ${i + 1}: ${dayLabel} ratio equals ${formatFactor(meter.explicitFactor)}, but the fixed plant ratio is ${formatFactor(factor)}. The fixed plant ratio is used.`
        });
      }
    }

    const diff = tm.value - ym.value;
    if (diff < 0) {
      issues.push({ level: 'WARNING', code: 'READING_DECREASE', message: `${row.name} meter ${i + 1}: today ${tm.value} is lower than yesterday ${ym.value}. Check typo, reset, or meter rollover.` });
    } else if (ym.value > 0 && diff > Math.max(100, Math.abs(ym.value) * 0.5)) {
      issues.push({ level: 'WARNING', code: 'SUSPICIOUS_JUMP', message: `${row.name} meter ${i + 1}: reading jumped from ${ym.value} to ${tm.value}. Check the raw meter before sending the report.` });
    }

    const energy = diff * factor;
    totalEnergy += energy;
    meters.push({
      index: i + 1,
      yesterdayVal: ym.value,
      todayVal: tm.value,
      diff: round(diff, 6),
      factor,
      energy: round(energy, 6),
      formula: `(${tm.value} - ${ym.value}) × ${formatFactor(factor)}`
    });
  }

  return { ...row, missing: false, totalEnergy: round(totalEnergy, 6), meters };
}

function normalizeUtilityLine(line, plantKey) {
  const prefix = PLANT_SCHEMAS[plantKey].utilityPrefix;
  const stripped = String(line || '').trim().replace(/^[*-]\s*/, '').trim();
  if (!stripped || !stripped.includes(':')) return null;
  return `${prefix} ${stripped}`;
}

function mergeUtilities(plantKey, dedicatedText, extractedLines) {
  const utilityOrder = {
    JRE: ['LPG', 'Oxygen', 'Nitrogen', 'Refrigerant R32', 'Water'],
    UNILAND: ['LPG', 'Air Compressor', 'Oxygen', 'Nitrogen', 'Water', 'R32', 'R454B']
  };

  // Dedicated utility text comes first, so it wins if the same utility was
  // also copied inside the raw meter message.
  const byName = new Map();
  const insertionOrder = [];
  const all = [
    ...String(dedicatedText || '').split(/\r?\n/),
    ...(extractedLines || [])
  ];

  all.forEach(line => {
    const normalized = normalizeUtilityLine(line, plantKey);
    if (!normalized) return;
    const body = normalized.replace(/^[*-]\s*/, '');
    const name = body.split(':', 1)[0].trim();
    const key = normalizeName(name);
    if (!byName.has(key)) insertionOrder.push(key);
    if (!byName.has(key)) byName.set(key, normalized);
  });

  const ordered = [];
  const used = new Set();
  (utilityOrder[plantKey] || []).forEach(name => {
    const key = normalizeName(name);
    if (byName.has(key)) {
      ordered.push(byName.get(key));
      used.add(key);
    }
  });
  insertionOrder.forEach(key => {
    if (!used.has(key) && byName.has(key)) ordered.push(byName.get(key));
  });
  return ordered;
}

function formatReportDate(dateString) {
  if (!dateString) return 'DATE UNKNOWN';
  const [year, month, day] = dateString.split('-').map(Number);
  const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return String(dateString).toUpperCase();
  return `${monthNames[month - 1]} ${day}, ${year}`;
}

function formatTrimmed(value, maxDigits) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  if (Math.abs(value) < 1e-9) return '0';
  return Number(round(value, maxDigits).toFixed(maxDigits)).toString();
}

function formatRowValue(plantKey, row) {
  if (!row || row.missing || row.totalEnergy === null || !Number.isFinite(row.totalEnergy)) return '-';
  if (plantKey === 'JRE') {
    if (Math.abs(row.totalEnergy) < 1e-9) return '0';
    return row.totalEnergy.toFixed(2);
  }
  return formatTrimmed(row.totalEnergy, row.unit.toLowerCase() === 'mwh' ? 5 : 2);
}

function getRowByName(rows, name) {
  const target = normalizeName(name);
  return rows.find(row => normalizeName(row.name) === target) || null;
}

function numericRowValue(rows, name) {
  const row = getRowByName(rows, name);
  return row && !row.missing && Number.isFinite(row.totalEnergy) ? row.totalEnergy : null;
}

function toKWh(value, unit) {
  if (value === null || !Number.isFinite(value)) return null;
  return String(unit).toLowerCase() === 'mwh' ? value * 1000 : value;
}

function buildWorksheet(plantKey, reportDate, rows) {
  const day = reportDate ? String(Number(reportDate.slice(-2))) : '';
  if (plantKey === 'JRE') {
    const p1 = numericRowValue(rows, 'Piping Building 1#');
    const p3 = numericRowValue(rows, 'Piping Building 3#');
    const pipingAll = p1 !== null && p3 !== null ? round(p1 + p3, 2) : null;
    const headers = ['Date', 'Indoor', 'Outdoor', 'Window', 'Dehumidifier', 'Heat Exchanger', 'Piping All', 'Piping #1', 'Piping #3', 'Injection', 'Crusher', 'Cooling', 'Structural', 'Control Room', 'IQC & OQC', 'New Lab', 'Warehouse', 'Charger Fork', 'Office'];
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
      numericRowValue(rows, 'All Office Building')
    ];
    return { headers, values, derived: { pipingAll } };
  }

  const indoor = numericRowValue(rows, 'Indoor');
  const vacIn = numericRowValue(rows, 'Vacum box indoor');
  const outdoor = numericRowValue(rows, 'Outdoor');
  const vacOut = numericRowValue(rows, 'Vacum box outdoor');
  const lineComp = numericRowValue(rows, 'Line compressor outdoor');
  const indoorArea = indoor !== null && vacIn !== null ? round(indoor + vacIn, 2) : null;
  const outdoorArea = outdoor !== null && vacOut !== null && lineComp !== null ? round(outdoor + vacOut + lineComp, 2) : null;

  const headers = ['Date', 'Indoor Area', 'Outdoor Area', 'Indoor', 'Outdoor', 'HE & Piping', 'Vacuum Box Indoor', 'Vacuum Box Outdoor', 'Outdoor Line Compressor Area', 'Machine Stamping', 'Injection Molding', 'PCB Trial Line', '10HP Enthalpy Lab', '20HP Climate Chamber', 'OQC Testing Room B', 'IQC Testing Room B', 'Charger Forklift Area'];
  const values = [
    day,
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
    numericRowValue(rows, 'Charger Forklift Area')
  ];
  return { headers, values, derived: { indoorArea, outdoorArea } };
}

function formatWorksheetCell(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '';
  if (typeof value === 'string') return value;
  if (Math.abs(value) < 1e-9) return '0';
  return Number(round(value, 2).toFixed(2)).toString();
}

function worksheetRowToTSV(worksheet) {
  return worksheet.values.map(formatWorksheetCell).join('\t');
}

function worksheetPreview(worksheet) {
  return worksheet.headers.map((header, i) => `${header}: ${formatWorksheetCell(worksheet.values[i])}`).join('\n');
}

function calculatePlantReport(yesterdayText, todayText, utilitiesText, plantKey, requestedReportDate = null) {
  const schema = PLANT_SCHEMAS[plantKey];
  if (!schema) throw new Error(`Unknown plant: ${plantKey}`);

  const yParsed = parseInput(yesterdayText, plantKey);
  const tParsed = parseInput(todayText, plantKey);
  const issues = [...yParsed.issues, ...tParsed.issues];

  if (!String(yesterdayText || '').trim()) issues.push({ level: 'ERROR', code: 'EMPTY_YESTERDAY', message: 'Yesterday meter reading is empty.' });
  if (!String(todayText || '').trim()) issues.push({ level: 'ERROR', code: 'EMPTY_TODAY', message: 'Today meter reading is empty.' });

  if (yParsed.date && tParsed.date) {
    const diff = dayDiff(yParsed.date, tParsed.date);
    if (diff !== 1) {
      issues.push({ level: 'WARNING', code: 'DATE_GAP', message: `Meter dates are ${yParsed.date} and ${tParsed.date}; expected consecutive 24-hour readings.` });
    }
  }

  const reportDate = tParsed.date || requestedReportDate || null;
  if (requestedReportDate && tParsed.date && requestedReportDate !== tParsed.date) {
    issues.push({ level: 'WARNING', code: 'DATE_MISMATCH', message: `Report date ${requestedReportDate} differs from the Today meter date ${tParsed.date}. Today meter date is used.` });
  }

  const calculatedRows = schema.rows.map(row => {
    const key = normalizeName(row.name);
    return calculateRow(row, yParsed.areas.get(key), tParsed.areas.get(key), issues);
  });

  const fatal = issues.some(issue => issue.level === 'ERROR');
  const utilities = mergeUtilities(plantKey, utilitiesText, tParsed.utilities);

  let totalDirectEnergy = null;
  let totalDirectUnit = schema.rows[0].unit;
  let subAreasSumKWh = 0;
  let subAreasCount = 0;

  calculatedRows.forEach(row => {
    if (row.isTotal) {
      if (!row.missing) totalDirectEnergy = row.totalEnergy;
      totalDirectUnit = row.unit;
    } else if (!row.missing && Number.isFinite(row.totalEnergy)) {
      const kwh = toKWh(row.totalEnergy, row.unit);
      if (kwh !== null) {
        subAreasSumKWh += kwh;
        subAreasCount += 1;
      }
    }
  });
  subAreasSumKWh = round(subAreasSumKWh, 6);

  let gapKWh = null;
  let gapPercent = null;
  if (plantKey === 'JRE' && totalDirectEnergy !== null) {
    gapKWh = round(toKWh(totalDirectEnergy, totalDirectUnit) - subAreasSumKWh, 6);
    const totalKWh = toKWh(totalDirectEnergy, totalDirectUnit);
    gapPercent = totalKWh ? round((gapKWh / totalKWh) * 100, 4) : null;
  }

  const header = `${schema.reportPrefix}) ${schema.name} (${formatReportDate(reportDate)} - ${schema.hoursLabel})`;
  const reportLines = [header];
  calculatedRows.forEach(row => {
    const displayName = row.displayName || row.name;
    const afterNumber = row.afterNumber ?? ' ';
    const afterColon = row.afterColon ?? ' ';
    reportLines.push(`${row.no}.${afterNumber}${displayName}:${afterColon}${formatRowValue(plantKey, row)} ${row.unit}`);
  });
  reportLines.push(...utilities);

  const checkIssueCodes = new Set([
    'READING_DECREASE',
    'SUSPICIOUS_JUMP',
    'RATIO_MISMATCH',
    'DATE_GAP',
    'DATE_MISMATCH',
    'MISSING_DAY',
    'METER_COUNT',
    'MISSING_BOTH',
    'UNKNOWN_AREA'
  ]);
  const checkIssues = issues.filter(issue => issue.level === 'WARNING' && checkIssueCodes.has(issue.code));
  if (checkIssues.length) {
    reportLines.push('', 'CHECK RAW DATA:');
    checkIssues.forEach(issue => reportLines.push(`- ${issue.message}`));
  }

  const worksheet = buildWorksheet(plantKey, reportDate, calculatedRows);
  const meterCount = calculatedRows.reduce((sum, row) => sum + (row.meters?.length || 0), 0);

  return {
    success: !fatal,
    plantKey,
    reportDate,
    yesterdayDate: yParsed.date,
    todayDate: tParsed.date,
    issues,
    calculatedRows,
    utilities,
    reportSectionText: reportLines.join('\n'),
    totalDirectEnergy,
    totalDirectUnit,
    subAreasSumKWh,
    subAreasCount,
    gapKWh,
    gapPercent,
    worksheet,
    meterCount
  };
}

function generateFullIndonesiaReport(jreReport, unilandReport) {
  const lines = ['[INDONESIA FACTORY ENERGY REPORT]', '', 'Summary situation:'];
  if (jreReport?.success) lines.push(jreReport.reportSectionText);
  if (unilandReport?.success) {
    if (jreReport?.success) lines.push('');
    lines.push(unilandReport.reportSectionText);
  }
  return lines.join('\n');
}

function currentWibDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function currentWibClock() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date());
}

function currentWibDateLabel() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date());
}

function runEngineSelfTests() {
  const results = [];
  const assertClose = (label, actual, expected, tolerance = 1e-6) => {
    const pass = Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
    results.push({ label, actual, expected, pass });
  };

  const jre = calculatePlantReport(SAMPLE_DATASETS.JRE.yesterday, SAMPLE_DATASETS.JRE.today, SAMPLE_DATASETS.JRE.utilities, 'JRE', SAMPLE_DATASETS.JRE.date);
  const uniland = calculatePlantReport(SAMPLE_DATASETS.UNILAND.yesterday, SAMPLE_DATASETS.UNILAND.today, SAMPLE_DATASETS.UNILAND.utilities, 'UNILAND', SAMPLE_DATASETS.UNILAND.date);

  assertClose('JRE Total', numericRowValue(jre.calculatedRows, 'Total'), 1000);
  assertClose('JRE Indoor', numericRowValue(jre.calculatedRows, 'Indoor'), 70);
  assertClose('JRE Injection Molding', numericRowValue(jre.calculatedRows, 'Injection Molding'), 130);
  assertClose('JRE Electricity Building 2#', numericRowValue(jre.calculatedRows, 'Electricity Building 2#'), 22);
  assertClose('JRE Sub-area sum', jre.subAreasSumKWh, 886, 1e-4);
  assertClose('JRE Gap', jre.gapKWh, 114, 1e-4);
  assertClose('JRE Piping All', jre.worksheet.derived.pipingAll, 15);

  assertClose('UNILAND Total', numericRowValue(uniland.calculatedRows, 'Total'), 3.2);
  assertClose('UNILAND Building A', numericRowValue(uniland.calculatedRows, 'Building A'), 0.32);
  assertClose('UNILAND Heat Exchanger', numericRowValue(uniland.calculatedRows, 'Heat Exchanger'), 40);
  assertClose('UNILAND Refrigant and LPG area', numericRowValue(uniland.calculatedRows, 'Refrigant and LPG area'), 20);
  assertClose('UNILAND Indoor Area', uniland.worksheet.derived.indoorArea, 25);
  assertClose('UNILAND Outdoor Area', uniland.worksheet.derived.outdoorArea, 43);

  return {
    pass: results.every(r => r.pass) && jre.success && uniland.success,
    results,
    jre,
    uniland
  };
}


globalThis.EnergyEngine = Object.freeze({
  PLANT_SCHEMAS,
  SAMPLE_DATASETS,
  normalizeName,
  parseFlexibleNumber,
  extractDateFromText,
  parseInput,
  formatReportDate,
  formatRowValue,
  worksheetRowToTSV,
  worksheetPreview,
  calculatePlantReport,
  generateFullIndonesiaReport,
  currentWibDate,
  currentWibClock,
  currentWibDateLabel,
  runEngineSelfTests
});
