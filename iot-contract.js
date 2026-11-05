import { decimalText } from './numbers.js';

export const IOT_SCHEDULE_WIB = [
  '06:00',
  '06:30',
  '07:00',
  '07:30',
  '08:00',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
];
export const iotIdentifier = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
export function validateIotEvent(value, now = Date.now()) {
  const invalid = () => {
    throw Error('INVALID_IOT_EVENT');
  };
  const time = (text) => {
    if (typeof text !== 'string' || !/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(text))
      return invalid();
    const ms = Date.parse(text);
    if (
      !Number.isFinite(ms) ||
      new Date(ms).toISOString() !== text.replace('Z', '.000Z') ||
      ms > now + 300000
    )
      return invalid();
    return ms;
  };
  const keys = [
    'schema_version',
    'event_id',
    'device_id',
    'meter_id',
    'meter_profile',
    'event_type',
    'captured_at',
    'quality',
    'readings',
    'scheduled_at',
    'started_at',
  ];
  if (
    !value ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k)) ||
    value.schema_version !== 1 ||
    value.quality !== 'valid' ||
    !['telemetry', 'checkpoint'].includes(value.event_type)
  )
    return invalid();
  for (const field of ['event_id', 'device_id', 'meter_id', 'meter_profile'])
    if (!iotIdentifier(value[field])) return invalid();
  const captured = time(value.captured_at);
  if (
    !value.readings ||
    Array.isArray(value.readings) ||
    Object.keys(value.readings).join() !== 'active_energy_kwh' ||
    typeof value.readings.active_energy_kwh !== 'string' ||
    decimalText(value.readings.active_energy_kwh) === null
  )
    return invalid();
  if (value.event_type === 'checkpoint') {
    const scheduled = time(value.scheduled_at),
      started = time(value.started_at);
    const wib = new Date(scheduled + 7 * 3600000).toISOString().slice(11, 19);
    if (
      !IOT_SCHEDULE_WIB.some((t) => t + ':00' === wib) ||
      started < scheduled ||
      captured < started ||
      captured - scheduled > 5000 ||
      captured - started > 2000
    )
      return invalid();
  } else if (value.scheduled_at !== undefined || value.started_at !== undefined) return invalid();
  // Fixed key ordering makes reordered JSON retries identical; raw decimal text stays exact.
  return Object.fromEntries(
    keys
      .filter((k) => value[k] !== undefined)
      .map((k) => [
        k,
        k === 'readings' ? { active_energy_kwh: value.readings.active_energy_kwh } : value[k],
      ]),
  );
}
