import { exportRawReading } from './raw-export.js';
import { parseReading, importLine, importDate, importTime } from './importer.js';
import { ADDITIONAL_METERS } from './additional-readings.js';
import {
  createGasDraft,
  restoreGasDraft,
  gasCalibration,
  gasPointUnit,
  MAX_REFILLS,
  JRE_GAS_INPUT_VERSION,
} from './gas.js';
import { UTILITIES } from './schema.js';
import { decimalText, validDate } from './numbers.js';
import { observationTime, validTime, isWorkingHours } from './reading-period.js';

function rawEndpoint(draft, side) {
  const date = draft[side + 'Date'],
    time = observationTime(draft, side);
  return (
    (validDate(date) ? date.split('-').reverse().join('/') : '____') +
    ' ' +
    (validTime(time) ? time : '____') +
    ' WIB'
  );
}

// Formatting tolerance applies to structural lines only; note text remains literal.
function normalizeSnapshot(text) {
  const labels = new Map();
  const key = (v) => v.toLowerCase().replace(/\s/g, '');
  for (const label of [
    'Selected observation',
    'Additional cumulative electricity readings',
    'Gas readings',
    'Cumulative Water reading',
    'Cumulative Air Compressor reading',
    'Notes',
    'Reading time',
    'Water',
    'Air Compressor',
    'Before',
    'After',
    ...ADDITIONAL_METERS,
  ])
    labels.set(key(label), label);
  for (const plant of ['JRE', 'UNILAND'])
    for (const gas of gasCalibration(plant).gases) {
      labels.set(key(gas.name), gas.name);
    }
  const result = [];
  let notes = false;
  const header =
    /^(Selected observation:|Additional cumulative electricity readings:|Trafo 1, 2 and 3 cumulative readings|Gas readings:|Cumulative Water reading:|Cumulative Air Compressor reading:|Refill observations for |Manual period totals for |Notes:)/;
  const units = {
    kwh: 'kWh',
    nm3: 'Nm³',
    'nm³': 'Nm³',
    'nm^3': 'Nm³',
    mmh2o: 'mmH2O',
    'mmh₂o': 'mmH2O',
    mmwc: 'mmWC',
    kg: 'kg',
    m3: 'm³',
    'm³': 'm³',
    'm^3': 'm³',
    mm: 'mm',
  };
  for (const raw of String(text).split(/\r\n?|\n/)) {
    if (notes) {
      result.push(raw);
      continue;
    }
    let line = importLine(raw)
      .replace(/[ \t]+/g, ' ')
      .replace(
        /^([A-Za-z][A-Za-z 0-9#&()–-]*?)\s*:\s*/,
        (_, label) => (labels.get(key(label)) || label.trim()) + ': ',
      )
      .replace(
        /(kwh|Nm(?:³|3|\^3)|mmH(?:2|₂)O|mmWC|kg|m(?:³|3|\^3)|mm)(?=$|[\s;)])/gi,
        (unit) => units[unit.toLowerCase()],
      )
      .replace(/([\d_–-])(?=kWh|Nm³|mmH2O|mmWC|kg|m³|mm|%)/g, '$1 ')
      .replace(/;\s*temperature\s*:\s*/gi, '; temperature: ')
      .replace(/^Refill\s*observations\s*for\s+/i, 'Refill observations for ')
      .replace(/^Manual\s*period\s*totals\s*for\s+/i, 'Manual period totals for ')
      .trimEnd();
    if (!line) continue;
    if (/^trafo\s*1,\s*2\s*and\s*3\s*cumulative\s*readings\s*are\s*in\s*MWh\.$/i.test(line))
      line = 'Trafo 1, 2 and 3 cumulative readings are in MWh.';
    if (/^(Before:|After:|Tank entry off;)/.test(line)) line = '  ' + line;
    if (header.test(line) && result.length) result.push('');
    result.push(line);
    if (line === 'Notes:') notes = true;
  }
  return result.join('\n').trim();
}
function readingSlot(parsed, draft) {
  if (!isWorkingHours(draft) && parsed.timeRange) {
    parsed.issues = parsed.issues.filter(
      (i) => !['IMPORT_TIME_RANGE', 'IMPORT_DAILY_TIME'].includes(i.code),
    );
    parsed.issues.push({
      level: 'NOTICE',
      code: 'IMPORT_DAILY_TIME',
      time: parsed.time,
      message:
        '24 HOURS keeps its 08:00 WIB boundary. The reading window does not change the report time.',
    });
    parsed.time = '08:00';
  }
  return parsed;
}

const sameFormatting = (text) => {
  const [body, notes] = text.split('\n\nNotes:');
  return body.replace(/[ \t]+/g, '') + (notes === undefined ? '' : '\nNotes:' + notes);
};

// Parse a complete sharing snapshot without mutating the current document.
// Regenerating it catches unknown, duplicate or misplaced fields rather than dropping them.
export function parseRawReading(text, draft, side = 'end', prepare) {
  const original = String(text);
  if (original.length > 131072) return parseReading(original, draft.plantKey);
  const input = normalizeSnapshot(original);
  if (input.length > 131072) return parseReading(input, draft.plantKey);
  if (!input.includes('\nSelected observation:'))
    return readingSlot(parseReading(input, draft.plantKey), draft);
  const boundary = input.indexOf('\n\nSelected observation:');
  const parts = input.slice(boundary + 2).split('\n\n');
  const parsed = readingSlot(parseReading(input.slice(0, boundary), draft.plantKey), draft);
  if (!parsed.success) return parsed;
  try {
    if (parsed.issues.some((i) => i.code === 'RATIO_MISMATCH'))
      throw Error(
        'Electricity ratios do not match. Use the ratios from the current blank template.',
      );
    const selected = (parts.shift() || '').match(/^Selected observation: (Start|End)\s*,\s*(.+)$/i);
    if (!selected)
      throw Error('Selected observation: use Start or End followed by a valid date and time.');
    const stamp = selected[2].match(
      /^(\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*20\d{2}|20\d{2}-\d{2}-\d{2})\s+(.*)$/,
    );
    const sourceDate = stamp && importDate(stamp[1]),
      sourceTime = stamp && importTime(stamp[2]);
    if (!sourceDate?.valid || !sourceTime)
      throw Error('Selected observation: enter a valid date and HH:MM WIB time.');
    parsed.time ||= sourceTime.time;
    readingSlot(parsed, draft);
    const next = structuredClone(prepare ? prepare(parsed, side) : draft);
    const endpoint = (s) => rawEndpoint(next, s);
    if (parsed.date !== next[side + 'Date'] || parsed.time !== observationTime(next, side))
      throw Error('Select the matching date and time before importing all readings.');
    if (sourceDate.date !== parsed.date || sourceTime.time !== parsed.time)
      parsed.issues.push({
        level: 'NOTICE',
        code: 'IMPORT_OBSERVATION',
        date: parsed.date,
        time: parsed.time,
        message: 'Using the reading header: ' + parsed.date + ' ' + parsed.time + ' WIB.',
      });
    parsed.values.forEach((values, ri) =>
      values.forEach((value, mi) => {
        if (parsed.suppliedMeters[ri][mi]) next.rows[ri][side][mi] = value;
      }),
    );
    const value = (v, label) => {
      if (v === '____') return '';
      if (v !== '-' && decimalText(v.replace(/^[+-]/, '')) === null)
        throw Error(
          (label || 'Raw reading') +
            ': use a number with up to six decimals, ____ for blank, or - for unavailable.',
        );
      return v;
    };
    if (next.plantKey === 'JRE') {
      const lines = (parts.shift() || '').split('\n');
      if (lines.shift() !== 'Additional cumulative electricity readings:' || lines.length !== 4)
        throw Error('T1–T4: include one kWh reading line for each meter.');
      next.additionalReadings ??= ADDITIONAL_METERS.map(() => ({ start: '', end: '' }));
      lines.forEach((line, i) => {
        const prefix = ADDITIONAL_METERS[i] + ': ';
        if (!line.startsWith(prefix) || !line.endsWith(' kWh'))
          throw Error(ADDITIONAL_METERS[i] + ': use a reading followed by kWh.');
        next.additionalReadings[i][side] = value(
          line.slice(prefix.length, -4),
          ADDITIONAL_METERS[i],
        );
      });
    } else if (parts.shift() !== 'Trafo 1, 2 and 3 cumulative readings are in MWh.')
      throw Error('Invalid Trafo units.');
    const gases = gasCalibration(next.plantKey).gases;
    next.gas = next.gas ? restoreGasDraft(next.gas, next.plantKey) : createGasDraft(next.plantKey);
    const point = (line, prefix, gas) => {
      if (!line.startsWith(prefix))
        throw Error(gas.name + ': check the reading label and order in Gas readings.');
      const match = line
        .slice(prefix.length)
        .match(/^(\S+?)\s*(kg|mmWC|mmH2O|mm|%)(?:;\s*temperature:\s*(\S+)\s*°C)?$/);
      if (
        !match ||
        (gas.id !== 'R32' && match[2] !== gas.unit) ||
        (gas.id === 'R32' && !['kg', 'mm'].includes(match[2])) ||
        (next.plantKey !== 'JRE' && gas.id === 'R32' && match[2] !== 'mm')
      )
        throw Error(
          gas.name +
            ': use ' +
            (gas.id === 'R32' && next.plantKey === 'JRE'
              ? 'kg, or legacy mm with temperature in °C'
              : gas.unit) +
            '.',
        );
      return {
        reading: value(match[1], gas.name),
        temperature: match[3] === undefined ? '' : value(match[3], gas.name + ' temperature'),
        ...(next.plantKey === 'JRE' && gas.id === 'R32' ? { unit: match[2] } : {}),
      };
    };
    const gasLines = (parts.shift() || '').split('\n');
    if (gasLines.shift() !== 'Gas readings:' || gasLines.length !== gases.length)
      throw Error('Invalid gas section.');
    gasLines.forEach((line, i) => {
      const off = line.endsWith(' (tank entry off)');
      const entry = next.gas.entries[i];
      entry.enabled = !off;
      entry[side] = point(off ? line.slice(0, -17) : line, gases[i].name + ': ', gases[i]);
    });
    const water = (parts.shift() || '').match(/^Cumulative Water reading:\nWater: (\S+)\s*m³$/);
    if (!water) throw Error('Water: use one cumulative reading followed by m³.');
    if (next.water !== undefined || water[1] !== '____') {
      next.water ??= { start: '', end: '' };
      next.water[side] = value(water[1], 'Water');
    }
    const hasAirFlow = parts[0]?.startsWith('Cumulative Air Compressor reading:');
    let blankAirFlow = false;
    if (hasAirFlow) {
      const flow = parts
        .shift()
        .match(/^Cumulative Air Compressor reading:\nAir Compressor: (\S+) Nm(?:³|3|\^3)$/);
      if (next.plantKey !== 'JRE' || !flow)
        throw Error('Air Compressor: use one cumulative reading in Nm³.');
      next.airCompressor ??= { start: '', end: '' };
      blankAirFlow = flow[1] === '____';
      if (!blankAirFlow) next.airCompressor[side] = value(flow[1], 'Air Compressor');
    }
    const period = endpoint('start') + ' to ' + endpoint('end');
    const contextReplacements = [];
    const contextHeading = (heading, prefix) => {
      const oldEndpoints = [endpoint('start'), endpoint('end')];
      oldEndpoints[side === 'start' ? 0 : 1] =
        sourceDate.date.split('-').reverse().join('/') + ' ' + sourceTime.time + ' WIB';
      const previous = prefix + oldEndpoints.join(' to ');
      const expected = prefix + period;
      const legacyTimes =
        next.periodKind === 'workingHours'
          ? ['08:00', '17:00']
          : next.periodKind === 'nightShift'
            ? ['17:00', '08:00']
            : null;
      const legacy = legacyTimes?.map(
        (time, i) => endpoint(i === 0 ? 'start' : 'end').slice(0, 11) + time + ' WIB',
      );
      const sourceEndpoint =
        sourceDate.date.split('-').reverse().join('/') + ' ' + sourceTime.time + ' WIB';
      const legacyWindow =
        parsed.timeRange &&
        legacy &&
        heading === prefix + legacy.join(' to ') &&
        sourceEndpoint === legacy[selected[1].toLowerCase() === 'start' ? 0 : 1];
      if (
        heading !== expected &&
        sourceDate.date === parsed.date &&
        (heading === previous || legacyWindow)
      ) {
        contextReplacements.push([heading, expected]);
        if (!parsed.issues.some((i) => i.code === 'IMPORT_CONTEXT'))
          parsed.issues.push({
            level: 'NOTICE',
            code: 'IMPORT_CONTEXT',
            time: parsed.time,
            message:
              'The period boundary follows the reading header. Refill values and their order are unchanged; event times are not inferred.',
          });
        return expected;
      }
      return heading;
    };
    const hasRefills = parts[0]?.startsWith('Refill observations for ');
    if (hasRefills) {
      const lines = (parts.shift() || '').split('\n');
      if (
        contextHeading(lines.shift(), 'Refill observations for ') !==
          'Refill observations for ' + period ||
        lines.shift() !== 'Event times not recorded.'
      )
        throw Error(
          'Refill period does not match. Select the recording mode and dates shown in the refill section; refill events cannot be moved to another day or shift.',
        );
      next.gas.entries.forEach((entry) => {
        entry.refills = [];
      });
      while (lines.length) {
        const label = lines.shift();
        const i = gases.findIndex((g) => label.startsWith(g.name + ' refill '));
        if (
          i < 0 ||
          label !== gases[i].name + ' refill ' + (next.gas.entries[i].refills.length + 1) + ':'
        )
          throw Error('Invalid refill sequence.');
        next.gas.entries[i].refills.push({
          before: point(lines.shift(), '  Before: ', gases[i]),
          after: point(lines.shift(), '  After: ', gases[i]),
        });
        if (
          !next.gas.entries[i].enabled &&
          lines.shift() !== '  Tank entry off; stored observations.'
        )
          throw Error('Invalid refill context.');
      }
    }
    let manualReplacement;
    if (parts[0]?.startsWith('Manual period totals for ')) {
      const section = parts.shift(),
        lines = section.split('\n');
      const heading = contextHeading(lines.shift(), 'Manual period totals for ');
      const endpoints = heading.slice('Manual period totals for '.length).split(' to ');
      const blank = lines.slice(1).every((line) => /: ____ (?:[^\n]+)$/.test(line));
      const blankContext =
        blank &&
        endpoints.length === 2 &&
        endpoints.every(
          (endpoint) => importDate(endpoint.slice(0, 10))?.valid && importTime(endpoint.slice(11)),
        );
      if (
        (heading !== 'Manual period totals for ' + period && !blankContext) ||
        lines.shift() !== 'Entered values, not cumulative meter readings.'
      )
        throw Error('Manual totals period does not match.');
      const seen = new Set();
      const canonicalLines = [];
      for (const line of lines) {
        const i = UTILITIES[next.plantKey].findIndex(([name]) => line.startsWith(name + ': '));
        if (i < 0 || seen.has(i)) throw Error('Unknown or duplicate manual total.');
        seen.add(i);
        const raw = line.slice(UTILITIES[next.plantKey][i][0].length + 2).split(' ')[0];
        if (raw !== '____') next.utilities[i].value = value(raw, UTILITIES[next.plantKey][i][0]);
        canonicalLines.push(
          raw === '____' ? line.replace('____', next.utilities[i].value || '____') : line,
        );
      }
      manualReplacement = [
        section,
        'Manual period totals for ' +
          period +
          '\nEntered values, not cumulative meter readings.\n' +
          canonicalLines.join('\n'),
      ];
    }
    const hasNotes = parts[0]?.startsWith('Notes:\n');
    if (hasNotes) {
      next.utilities.forEach((u) => {
        u.note = '';
      });
      const lines = parts.shift().split('\n').slice(1);
      let index = -1;
      const seen = new Set();
      for (const line of lines) {
        if (line.startsWith('  ') && index >= 0)
          next.utilities[index].note += (next.utilities[index].note ? '\n' : '') + line.slice(2);
        else {
          index = UTILITIES[next.plantKey].findIndex(([name]) => line === name + ':');
          if (index < 0 || seen.has(index)) throw Error('Unknown or duplicate note.');
          seen.add(index);
        }
      }
    }
    // The source side label may differ when reusing an observation at a shared boundary.
    const regenerated = exportAllRawReadings(next, side);
    let canonical =
      exportRawReading(next, side).text +
      '\n\n' +
      input
        .slice(boundary + 2)
        .replace(
          /^Selected observation:[^\n]+/,
          'Selected observation: ' + (side === 'start' ? 'Start' : 'End') + ', ' + endpoint(side),
        );
    if (manualReplacement) canonical = canonical.replace(...manualReplacement);
    for (const replacement of contextReplacements) canonical = canonical.replace(...replacement);
    if (blankAirFlow)
      canonical = canonical.replace(
        'Air Compressor: ____ Nm³',
        'Air Compressor: ' + (next.airCompressor?.[side] || '____') + ' Nm³',
      );
    let expectedText =
      hasAirFlow || next.plantKey !== 'JRE'
        ? regenerated.text
        : regenerated.text.replace(
            /\n\nCumulative Air Compressor reading:\nAir Compressor: [^\n]+/,
            '',
          );
    // Omitted period context is unsupplied, not an instruction to erase saved events or notes.
    if (!hasRefills)
      expectedText = expectedText.replace(/\n\nRefill observations for [\s\S]*?(?=\n\n|$)/, '');
    if (!hasNotes) expectedText = expectedText.replace(/\n\nNotes:[\s\S]*$/, '');
    if (
      parts.length ||
      sameFormatting(normalizeSnapshot(expectedText)) !==
        sameFormatting(normalizeSnapshot(canonical))
    )
      throw Error('Raw sections do not match the current format. No data was imported.');
    parsed.raw = next;
    return parsed;
  } catch (error) {
    return {
      ...parsed,
      success: false,
      issues: [
        ...parsed.issues,
        {
          level: 'ERROR',
          code: 'RAW_IMPORT',
          message:
            (error instanceof TypeError
              ? 'A required raw section is missing or misplaced.'
              : error.message === 'shiftConflict'
                ? 'These times conflict with existing shift readings. Review the shared boundary first.'
                : error.message) +
            ' Check the named section, units and duplicate lines; select the matching period before trying again. Nothing was changed.',
        },
      ],
    };
  }
}

// Sharing snapshot only. Never convert units, subtract readings or modify a draft.
// Both sharing and import use the same named sections and recorded units.
export function exportAllRawReadings(draft, side = 'end') {
  const electricity = exportRawReading(draft, side);
  if (electricity.issues.length) return electricity;
  const issues = [],
    notices = [],
    sections = [electricity.text];
  const shape = () => issues.push({ code: 'SHAPE' });
  function raw(value, label, signed = false) {
    if (value === undefined || value === '') {
      notices.push(label);
      return '____';
    }
    if (typeof value !== 'string' || value.length > 50) {
      issues.push({ code: 'RAW_INVALID', label });
      return '';
    }
    const text = value.trim();
    if (!text) {
      notices.push(label);
      return '____';
    }
    if (
      text !== '-' &&
      ((signed && !/^[+-]?\d+(?:[.,]\d{1,6})?$/.test(text)) ||
        decimalText(signed ? text.replace(/^[+-]/, '') : text) === null)
    )
      issues.push({ code: 'RAW_INVALID', label });
    return text;
  }
  const endpoint = (which) => rawEndpoint(draft, which);
  sections.push(
    'Selected observation: ' + (side === 'start' ? 'Start' : 'End') + ', ' + endpoint(side),
  );
  if (draft.plantKey === 'JRE') {
    if (
      draft.additionalReadings !== undefined &&
      (!Array.isArray(draft.additionalReadings) || draft.additionalReadings.length !== 4)
    )
      shape();
    sections.push(
      'Additional cumulative electricity readings:\n' +
        ADDITIONAL_METERS.map(
          (name, i) => name + ': ' + raw(draft.additionalReadings?.[i]?.[side], name) + ' kWh',
        ).join('\n'),
    );
  } else sections.push('Trafo 1, 2 and 3 cumulative readings are in MWh.');
  const gases = gasCalibration(draft.plantKey).gases;
  if (
    draft.gas !== undefined &&
    (!Array.isArray(draft.gas?.entries) || draft.gas.entries.length !== gases.length)
  )
    shape();
  const gasLines = [],
    refillLines = [];
  function point(point, gas, label) {
    if (
      draft.plantKey === 'JRE' &&
      draft.gas?.version === JRE_GAS_INPUT_VERSION &&
      gas.id === 'R32' &&
      !['kg', 'mm'].includes(point?.unit)
    )
      shape();
    if (point !== undefined && (!point || typeof point !== 'object' || Array.isArray(point)))
      shape();
    const unit = gas.id === 'R32' && draft.plantKey === 'JRE' ? gasPointUnit(point) : gas.unit;
    if (
      point?.unit !== undefined &&
      (gas.id !== 'R32' ||
        !['kg', 'mm'].includes(point.unit) ||
        (point.unit === 'kg' && draft.plantKey !== 'JRE'))
    )
      shape();
    let text = raw(point?.reading, label) + ' ' + unit;
    if (gas.id === 'R32' && unit === 'mm')
      text += '; temperature: ' + raw(point?.temperature, label + ' temperature', true) + ' °C';
    return text;
  }
  gases.forEach((gas, i) => {
    const entry = draft.gas?.entries?.[i];
    if (
      entry !== undefined &&
      (!entry ||
        typeof entry.enabled !== 'boolean' ||
        !Array.isArray(entry.refills) ||
        entry.refills.length > MAX_REFILLS)
    )
      shape();
    gasLines.push(
      gas.name +
        ': ' +
        point(entry?.[side], gas, gas.name) +
        (entry?.enabled ? '' : ' (tank entry off)'),
    );
    if (Array.isArray(entry?.refills))
      entry.refills.slice(0, MAX_REFILLS).forEach((event, index) => {
        const label = gas.name + ' refill ' + (index + 1);
        if (!event || typeof event !== 'object') shape();
        refillLines.push(
          label +
            ':\n  Before: ' +
            point(event?.before, gas, label + ' before') +
            '\n  After: ' +
            point(event?.after, gas, label + ' after') +
            (entry?.enabled ? '' : '\n  Tank entry off; stored observations.'),
        );
      });
  });
  sections.push('Gas readings:\n' + gasLines.join('\n'));
  if (
    draft.water !== undefined &&
    (!draft.water || typeof draft.water !== 'object' || Array.isArray(draft.water))
  )
    shape();
  sections.push('Cumulative Water reading:\nWater: ' + raw(draft.water?.[side], 'Water') + ' m³');
  if (draft.plantKey === 'JRE')
    sections.push(
      'Cumulative Air Compressor reading:\nAir Compressor: ' +
        raw(draft.airCompressor?.[side], 'Air Compressor') +
        ' Nm³',
    );
  const period = endpoint('start') + ' to ' + endpoint('end');
  if (refillLines.length)
    sections.push(
      'Refill observations for ' +
        period +
        '\nEvent times not recorded.\n' +
        refillLines.join('\n'),
    );
  const utilities = UTILITIES[draft.plantKey],
    manual = [],
    notes = [];
  if (!Array.isArray(draft.utilities) || draft.utilities.length !== utilities.length) shape();
  utilities.forEach(([name, unit], index) => {
    const entry = draft.utilities?.[index];
    if (
      !entry ||
      typeof entry.value !== 'string' ||
      typeof entry.note !== 'string' ||
      entry.note.length > 500
    ) {
      shape();
      return;
    }
    const gasIndex = gases.findIndex((gas) => gas.utilityIndex === index);
    const activeTank = gasIndex >= 0 && draft.gas?.entries?.[gasIndex]?.enabled;
    // Preserve the current UI distinction between raw Water and legacy manual Water.
    if (
      !activeTank &&
      !(index === 4 && draft.water !== undefined) &&
      !(draft.plantKey === 'JRE' && index === 5 && draft.airCompressor !== undefined)
    )
      manual.push(
        name +
          ': ' +
          raw(entry.value, name + ' manual total') +
          (unit ? ' ' + unit : ' (unit not specified)'),
      );
    if (entry.note.trim())
      notes.push(
        name +
          ':\n' +
          entry.note
            .trim()
            .split(/\r?\n/)
            .map((line) => '  ' + line)
            .join('\n'),
      );
  });
  if (manual.length)
    sections.push(
      'Manual period totals for ' +
        period +
        '\nEntered values, not cumulative meter readings.\n' +
        manual.join('\n'),
    );
  if (notes.length) sections.push('Notes:\n' + notes.join('\n'));
  return { text: issues.length ? '' : sections.join('\n\n'), issues, notices };
}
