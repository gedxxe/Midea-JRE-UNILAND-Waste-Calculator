import { endpoint, appOrigin, checkOrigin, readBody, send, fail } from './http.js';
import { getPool, transaction } from './db.js';
import { requireUser, limit, lockUser, audit } from './auth.js';
import { iotIdentifier, iotPresence } from '../iot-contract.js';

const SLOTS = ['06:30', '08:00', '17:00', '18:00'];
const validDate = (v) =>
  typeof v === 'string' &&
  /^20\d\d-\d\d-\d\d$/.test(v) &&
  !Number.isNaN(Date.parse(v + 'T00:00:00Z')) &&
  new Date(v + 'T00:00:00Z').toISOString().startsWith(v);
const shiftDate = (v, days) =>
  new Date(Date.parse(v + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const validArea = (v) =>
  typeof v === 'string' &&
  v === v.trim() &&
  [...v].length <= 64 &&
  !/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(v);
const visible =
  "(d.owner_id=$1 OR ($2::boolean AND EXISTS (SELECT 1 FROM meter_app.users owner WHERE owner.id=d.owner_id AND owner.active AND owner.role='admin')))";

export function iotDashboardHandler(database = getPool, env = process.env) {
  return endpoint(async (req, res) => {
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      fail(405, 'METHOD_NOT_ALLOWED');
    }
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) fail(503, 'NOT_CONFIGURED');
    const origin = appOrigin(env);
    if (req.method === 'POST') checkOrigin(req, origin);
    const db = database();
    const user = await requireUser(db, req, origin, { admin: req.method === 'POST' });
    if (env.IOT_ENABLED !== '1') {
      if (req.method === 'POST') fail(503, 'IOT_NOT_CONFIGURED');
      return send(res, 200, { enabled: false, devices: [], checkpoints: [] });
    }
    if (req.method === 'POST') {
      await limit(db, 'admin:' + user.id, 40, env);
      const body = await readBody(req, 512);
      if (
        Object.keys(body).sort().join(',') !== 'action,area,device_id' ||
        body.action !== 'set_area' ||
        !iotIdentifier(body.device_id) ||
        !validArea(body.area)
      )
        fail(400, 'INVALID_INPUT');
      const result = await transaction(db, async (client) => {
        if ((await lockUser(client, user)).role !== 'admin') fail(403, 'FORBIDDEN');
        const check = await client.query(
          "SELECT count(*)=1 AND bool_and(has_column_privilege(current_user,'meter_app.iot_devices',attname,'UPDATE')) AS ready FROM pg_attribute WHERE attrelid='meter_app.iot_devices'::regclass AND attname='area' AND attnum>0 AND NOT attisdropped",
        );
        if (!check.rows[0].ready) fail(503, 'IOT_AREA_MIGRATION_REQUIRED');
        const updated = await client.query(
          'UPDATE meter_app.iot_devices SET area=$3 WHERE device_id=$1 AND owner_id=$2 AND archived_at IS NULL RETURNING device_id,area',
          [body.device_id, user.id, body.area],
        );
        if (!updated.rowCount) fail(404, 'NOT_FOUND');
        await audit(client, user.id, 'iot.device.area', user.id);
        return updated.rows[0];
      });
      return send(res, 200, { device: result });
    }
    const params = new URL(req.url, origin).searchParams;
    if ([...params.keys()].some((k) => !['date', 'days', 'device_id', 'plant'].includes(k)))
      fail(400, 'INVALID_INPUT');
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const date = params.get('date') || today;
    const days = Number(params.get('days') || 28);
    const deviceId = params.get('device_id');
    const plant = params.get('plant');
    if (
      !validDate(date) ||
      ![7, 28].includes(days) ||
      (deviceId && !iotIdentifier(deviceId)) ||
      (plant && !['JRE', 'UNILAND'].includes(plant))
    )
      fail(400, 'INVALID_INPUT');
    await limit(db, 'iot:dashboard:' + user.id, 100, env);
    const start = shiftDate(date, -days);
    const endExclusive = shiftDate(date, 1);
    const args = [user.id, user.role === 'operator', deviceId, plant];
    const manual = env.IOT_MANUAL_REFRESH_ENABLED === '1';
    const refreshColumns = manual
      ? "q.requested_at AS refresh_requested_at,q.completed_at AS refresh_completed_at,(q.requested_at>clock_timestamp()-interval '120 seconds' AND (q.completed_at IS NULL OR q.completed_at<q.requested_at)) AS refresh_pending"
      : 'NULL::timestamptz AS refresh_requested_at,NULL::timestamptz AS refresh_completed_at,FALSE AS refresh_pending';
    const refreshJoin = manual
      ? 'LEFT JOIN meter_app.iot_refresh_requests q ON q.device_id=d.device_id'
      : '';
    const devicesSql = [
      'SELECT d.device_id,d.plant,d.meter_id,d.meter_profile,d.active,d.last_received_at,',
      "to_jsonb(d)->>'display_name' AS display_name,to_jsonb(d)->>'area' AS area,",
      "CASE WHEN last_read.event_id IS NULL THEN NULL ELSE jsonb_build_object('captured_at',last_read.captured_at,'received_at',last_read.received_at,'kwh',last_read.payload #>> '{readings,active_energy_kwh}') END AS latest,",
      refreshColumns,
      'FROM meter_app.iot_devices d',
      refreshJoin,
      'LEFT JOIN LATERAL (SELECT event_id,captured_at,received_at,payload FROM meter_app.iot_readings',
      'WHERE device_id=d.device_id ORDER BY captured_at DESC,received_at DESC,event_id DESC LIMIT 1) last_read ON true',
      'WHERE',
      visible,
      "AND to_jsonb(d)->>'archived_at' IS NULL",
      'AND ($3::text IS NULL OR d.device_id=$3) AND ($4::text IS NULL OR d.plant=$4)',
      'ORDER BY d.plant,d.device_id LIMIT 100',
    ].join(' ');
    const devices = (await db.query(devicesSql, args)).rows;
    const permitted = new Set(devices.map((d) => d.device_id));
    const checkpointsSql = [
      "SELECT r.device_id,r.event_id,r.received_at,r.payload->>'scheduled_at' AS scheduled_at,",
      "r.payload #>> '{readings,active_energy_kwh}' AS kwh",
      'FROM meter_app.iot_readings r JOIN meter_app.iot_devices d ON d.device_id=r.device_id',
      'WHERE',
      visible,
      "AND to_jsonb(d)->>'archived_at' IS NULL",
      'AND ($3::text IS NULL OR d.device_id=$3) AND ($4::text IS NULL OR d.plant=$4)',
      "AND r.event_type='checkpoint'",
      "AND r.captured_at >= ($5::date::timestamp AT TIME ZONE 'Asia/Jakarta')",
      "AND r.captured_at < ($6::date::timestamp AT TIME ZONE 'Asia/Jakarta')",
      "AND to_char((r.payload->>'scheduled_at')::timestamptz AT TIME ZONE 'Asia/Jakarta','HH24:MI') = ANY($7::text[])",
      'ORDER BY r.captured_at DESC,r.event_id DESC LIMIT 15001',
    ].join(' ');
    const raw = (await db.query(checkpointsSql, [...args, start, endExclusive, SLOTS])).rows;
    const serverTime = (await db.query('SELECT clock_timestamp() AS time')).rows[0].time;
    return send(res, 200, {
      enabled: true,
      server_time: serverTime,
      date,
      days,
      slots: SLOTS,
      manual_refresh_enabled: user.role === 'admin' && manual,
      gateway_status: 'unavailable',
      truncated: raw.length > 15000,
      devices: devices.map((d) => ({
        ...d,
        connection_status: iotPresence(d, new Date(serverTime).getTime()),
      })),
      checkpoints: raw.slice(0, 15000).filter((r) => permitted.has(r.device_id)),
    });
  });
}
