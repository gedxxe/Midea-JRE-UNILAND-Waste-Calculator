import { decimalText, scaledReading } from './numbers.js';

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
export const IOT_CURRENT_FIELDS = ['current_a', 'current_l1_a', 'current_l2_a', 'current_l3_a'];
export const IOT_TELEMETRY_INTERVAL_SECONDS = 600;
export const IOT_DASHBOARD_POLL_MS = 600000;
export const IOT_MANUAL_COOLDOWN_SECONDS = 10;
export const IOT_MANUAL_TIMEOUT_SECONDS = 120;
export const IOT_HEARTBEAT_INTERVAL_SECONDS = 60;
export const IOT_PRESENCE_TIMEOUT_SECONDS = 180;
// Display only: keep exact wire strings and immutable retry hashes unchanged.
export function formatIotReading(value) {
  const scaled = scaledReading(value);
  if (scaled === null) return '-';
  const rounded = (scaled + 500n) / 1000n;
  const fraction = String(rounded % 1000n)
    .padStart(3, '0')
    .replace(/0+$/, '');
  return String(rounded / 1000n) + (fraction ? '.' + fraction : '');
}
// Presence means recent authenticated HTTPS contact, not a working Modbus meter.
export function iotPresence(device, now) {
  if (!device.active) return 'disabled';
  if (!device.last_received_at) return 'unknown';
  const seen = Date.parse(device.last_received_at);
  if (!Number.isFinite(seen) || !Number.isFinite(now) || seen > now) return 'unknown';
  return now - seen < IOT_PRESENCE_TIMEOUT_SECONDS * 1000 ? 'connected' : 'offline';
}
export function validateIotHeartbeat(value) {
  const keys = ['schema_version', 'event_type', 'device_id', 'meter_id', 'meter_profile'];
  if (
    !value ||
    Array.isArray(value) ||
    value.schema_version !== 1 ||
    value.event_type !== 'heartbeat' ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    !keys.slice(2).every((key) => iotIdentifier(value[key]))
  )
    throw Error('INVALID_IOT_EVENT');
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
// Profile identifiers from the reference node's MeterProfiles.h; custom IDs remain valid.
export const IOT_NODE_PROFILES = ['fort', 'habuer', 'acrel-adl400', 'acrel-acr', 'acrel-apm'];
export function iotCloudEndpoint(origin) {
  try {
    const url = new URL(origin);
    if (
      url.protocol !== 'https:' ||
      url.origin !== origin ||
      !url.hostname.includes('.') ||
      /(^localhost$|\.(local|internal)$|^[\d.]+$)/i.test(url.hostname)
    )
      return null;
    return new URL('/api/iot-ingest', url).href;
  } catch {
    return null;
  }
}
export function iotNodeConfig(device, credential, endpoint) {
  let origin;
  try {
    origin = new URL(endpoint).origin;
  } catch {
    return null;
  }
  if (
    iotCloudEndpoint(origin) !== endpoint ||
    !/^[A-Za-z0-9_-]{43}$/.test(credential) ||
    !IOT_NODE_PROFILES.includes(device?.meter_profile) ||
    !['device_id', 'meter_id', 'meter_profile'].every((key) => iotIdentifier(device?.[key]))
  )
    return null;
  const define = (key, value) => '#define ' + key + ' ' + JSON.stringify(value);
  return [
    '// Private development provisioning. Do not commit this file.',
    '#pragma once',
    '#define IOT_DEV_ENABLED 1',
    define('IOT_DEV_ENDPOINT', endpoint),
    define('IOT_DEV_DEVICE_ID', device.device_id),
    define('IOT_DEV_METER_ID', device.meter_id),
    define('IOT_DEV_METER_PROFILE', device.meter_profile),
    define('IOT_DEV_BEARER', credential),
    '',
  ].join('\n');
}
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
  const readingKeys = ['active_energy_kwh', ...IOT_CURRENT_FIELDS];
  if (
    !value.readings ||
    Array.isArray(value.readings) ||
    !Object.hasOwn(value.readings, 'active_energy_kwh') ||
    Object.keys(value.readings).some((key) => !readingKeys.includes(key)) ||
    Object.values(value.readings).some(
      (reading) => typeof reading !== 'string' || decimalText(reading) === null,
    ) ||
    (Object.hasOwn(value.readings, 'current_a') &&
      IOT_CURRENT_FIELDS.slice(1).some((key) => Object.hasOwn(value.readings, key)))
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
        k === 'readings'
          ? Object.fromEntries(
              readingKeys
                .filter((key) => Object.hasOwn(value.readings, key))
                .map((key) => [key, value.readings[key]]),
            )
          : value[k],
      ]),
  );
}
