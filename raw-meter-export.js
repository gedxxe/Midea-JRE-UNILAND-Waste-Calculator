import { exportRawReading } from './raw-export.js';
import { ADDITIONAL_METERS } from './additional-readings.js';
import { gasCalibration, MAX_REFILLS } from './gas.js';
import { UTILITIES } from './schema.js';
import { decimalText, validDate } from './numbers.js';
import { observationTime, validTime } from './reading-period.js';

// Sharing snapshot only. Never convert units, subtract readings or modify a draft.
// The electricity-only formatter remains the text-import contract.
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
  const endpoint = (which) => {
    const date = draft[which + 'Date'],
      time = observationTime(draft, which);
    return (
      (validDate(date) ? date.split('-').reverse().join('/') : '____') +
      ' ' +
      (validTime(time) ? time : '____') +
      ' WIB'
    );
  };
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
    if (point !== undefined && (!point || typeof point !== 'object' || Array.isArray(point)))
      shape();
    let text = raw(point?.reading, label) + ' ' + gas.unit;
    if (gas.id === 'R32')
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
