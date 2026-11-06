import { exportRawReading } from './raw-export.js';
import { parseReading } from './importer.js';
import { ADDITIONAL_METERS } from './additional-readings.js';
import {
  createGasDraft,
  restoreGasDraft,
  gasCalibration,
  gasPointUnit,
  MAX_REFILLS,
  JRE_GAS_INPUT_VERSION,
} from './gas.js';
import { UTILITIES, PLANT_SCHEMAS } from './schema.js';
import { decimalText, validDate } from './numbers.js';
import { observationTime, validTime } from './reading-period.js';

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

// Parse a complete sharing snapshot without mutating the current document.
// Regenerating it catches unknown, duplicate or misplaced fields rather than dropping them.
export function parseRawReading(text, draft, side = 'end') {
  const input = String(text).replaceAll('\r\n', '\n').trim();
  if (input.length > 131072) return parseReading(input, draft.plantKey);
  if (!input.includes('\nSelected observation:')) return parseReading(input, draft.plantKey);
  const boundary = input.indexOf('\n\nSelected observation:');
  const parts = input.slice(boundary + 2).split('\n\n');
  const parsed = parseReading(input.slice(0, boundary), draft.plantKey);
  if (!parsed.success) return parsed;
  try {
    const next = structuredClone(draft);
    const selected = parts.shift().match(/^Selected observation: (Start|End), (.+)$/);
    if (!selected) throw Error('Invalid selected observation.');
    // A full snapshot owns refill/manual context for the complete period.
    // Do not silently attach that context to different dates or times.
    const endpoint = (s) => rawEndpoint(next, s);
    if (
      selected[2] !== endpoint(side) ||
      parsed.date !== next[side + 'Date'] ||
      (parsed.time || '08:00') !== observationTime(next, side)
    )
      throw Error('Select the matching date and time before importing all readings.');
    parsed.values.forEach((values, ri) =>
      values.forEach((value, mi) => {
        if (parsed.suppliedMeters[ri][mi]) next.rows[ri][side][mi] = value;
      }),
    );
    const value = (v) => {
      if (v === '____') return '';
      if (v !== '-' && decimalText(v.replace(/^[+-]/, '')) === null)
        throw Error('Invalid raw value.');
      return v;
    };
    if (next.plantKey === 'JRE') {
      const lines = parts.shift().split('\n');
      if (lines.shift() !== 'Additional cumulative electricity readings:' || lines.length !== 4)
        throw Error('Invalid additional readings.');
      next.additionalReadings ??= ADDITIONAL_METERS.map(() => ({ start: '', end: '' }));
      lines.forEach((line, i) => {
        const prefix = ADDITIONAL_METERS[i] + ': ';
        if (!line.startsWith(prefix) || !line.endsWith(' kWh'))
          throw Error('Invalid additional meter.');
        next.additionalReadings[i][side] = value(line.slice(prefix.length, -4));
      });
    } else if (parts.shift() !== 'Trafo 1, 2 and 3 cumulative readings are in MWh.')
      throw Error('Invalid Trafo units.');
    const gases = gasCalibration(next.plantKey).gases;
    next.gas = next.gas ? restoreGasDraft(next.gas, next.plantKey) : createGasDraft(next.plantKey);
    const point = (line, prefix, gas) => {
      if (!line.startsWith(prefix)) throw Error('Unknown gas reading.');
      const match = line
        .slice(prefix.length)
        .match(/^(\S+) (kg|mm|%|mmWC|mmH2O)(?:; temperature: (\S+) °C)?$/);
      if (
        !match ||
        (gas.id !== 'R32' && match[2] !== gas.unit) ||
        (gas.id === 'R32' && !['kg', 'mm'].includes(match[2])) ||
        (next.plantKey !== 'JRE' && gas.id === 'R32' && match[2] !== 'mm')
      )
        throw Error('Invalid gas unit.');
      return {
        reading: value(match[1]),
        temperature: match[3] === undefined ? '' : value(match[3]),
        ...(next.plantKey === 'JRE' && gas.id === 'R32' ? { unit: match[2] } : {}),
      };
    };
    const gasLines = parts.shift().split('\n');
    if (gasLines.shift() !== 'Gas readings:' || gasLines.length !== gases.length)
      throw Error('Invalid gas section.');
    gasLines.forEach((line, i) => {
      const off = line.endsWith(' (tank entry off)');
      const entry = next.gas.entries[i];
      entry.enabled = !off;
      entry[side] = point(off ? line.slice(0, -17) : line, gases[i].name + ': ', gases[i]);
      entry.refills = [];
    });
    const water = parts.shift().match(/^Cumulative Water reading:\nWater: (\S+) m³$/);
    if (!water) throw Error('Invalid Water reading.');
    if (next.water !== undefined || water[1] !== '____') {
      next.water ??= { start: '', end: '' };
      next.water[side] = value(water[1]);
    }
    const period = endpoint('start') + ' to ' + endpoint('end');
    if (parts[0]?.startsWith('Refill observations for ')) {
      const lines = parts.shift().split('\n');
      if (
        lines.shift() !== 'Refill observations for ' + period ||
        lines.shift() !== 'Event times not recorded.'
      )
        throw Error('Refill period does not match.');
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
    if (parts[0]?.startsWith('Manual period totals for ')) {
      const lines = parts.shift().split('\n');
      if (
        lines.shift() !== 'Manual period totals for ' + period ||
        lines.shift() !== 'Entered values, not cumulative meter readings.'
      )
        throw Error('Manual totals period does not match.');
      const seen = new Set();
      for (const line of lines) {
        const i = UTILITIES[next.plantKey].findIndex(([name]) => line.startsWith(name + ': '));
        if (i < 0 || seen.has(i)) throw Error('Unknown or duplicate manual total.');
        seen.add(i);
        next.utilities[i].value = value(
          line.slice(UTILITIES[next.plantKey][i][0].length + 2).split(' ')[0],
        );
      }
    }
    next.utilities.forEach((u) => {
      u.note = '';
    });
    if (parts[0]?.startsWith('Notes:\n')) {
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
    let canonical = input.replace(
      'Selected observation: ' + selected[1] + ',',
      'Selected observation: ' + (side === 'start' ? 'Start' : 'End') + ',',
    );
    // A previous export may omit a newly added optional tail. Retain the existing
    // same-time observation, but still compare all other bytes and raw sections.
    PLANT_SCHEMAS[next.plantKey].rows.forEach((row, ri) => {
      const mi = row.factors.length - 1;
      if (!row.zeroWhenUnavailable?.includes(mi) || parsed.suppliedMeters[ri][mi]) return;
      const prefix = `${ri + 1}. ${row.name}: `;
      const expected = regenerated.text.split('\n').find((line) => line.startsWith(prefix));
      if (!expected) return;
      const previous = expected.split(' + ').slice(0, mi).join(' + ');
      canonical = canonical
        .split('\n')
        .map((line) =>
          line === previous || line === previous + ` + ____ (Ratio ${row.factors[mi]})`
            ? expected
            : line,
        )
        .join('\n');
    });
    if (parts.length || regenerated.text !== canonical)
      throw Error('Raw sections do not match the current format. No data was imported.');
    parsed.raw = next;
    return parsed;
  } catch (error) {
    return {
      ...parsed,
      success: false,
      issues: [...parsed.issues, { level: 'ERROR', code: 'RAW_IMPORT', message: error.message }],
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
    if (!activeTank && !(index === 4 && draft.water !== undefined))
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
